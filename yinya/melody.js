// Original, local melody rules. Candidates are ordinary schema-10 notes.
import { validate, GROUP_SIZE, CHORDS } from './model.js';
import { PITCH_VALUES, pitchId, scaleInfo } from './theory.js';
import { harmonicRuns } from './accompaniment.js';

function freeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
export const MELODY_STYLES = freeze([
  { id: 'gentle-v1', name: '舒缓', hint: '平稳起伏，给短句留出呼吸。', contours: [[0,1,2,1,0,-1,0,1],[0,0,1,2,1,0,-1,0]], rhythms: {
    sparse: [[[0,8],[8,8]],[[0,8],[12,4]]], medium: [[[0,4],[4,4],[8,4],[12,4]],[[0,4],[6,2],[8,4],[12,4]]], dense: [[[0,2],[2,2],[4,2],[6,2],[8,2],[10,2],[12,4]],[[0,2],[2,2],[4,2],[6,2],[8,4],[12,2],[14,2]]],
  } },
  { id: 'bright-v1', name: '轻快', hint: '清楚的拍点，重复后稍作变化。', contours: [[0,1,2,1,3,2,1,0],[0,2,1,2,3,1,2,0]], rhythms: {
    sparse: [[[0,4],[8,8]],[[0,8],[8,4]]], medium: [[[0,4],[4,2],[6,2],[8,4],[12,4]],[[0,2],[2,2],[4,4],[8,4],[12,4]]], dense: [[[0,2],[2,2],[4,1],[5,1],[6,2],[8,2],[10,2],[12,4]],[[0,1],[1,1],[2,2],[4,2],[6,2],[8,2],[10,2],[12,4]]],
  } },
  { id: 'bounce-v1', name: '跳跃', hint: '短音与空隙交替，带一点切分。', contours: [[0,2,1,3,2,0,1,-1],[0,1,3,2,0,2,1,0]], rhythms: {
    sparse: [[[0,2],[6,2],[8,4]],[[0,4],[8,2],[14,2]]], medium: [[[0,2],[3,1],[4,2],[8,2],[10,2],[14,2]],[[0,2],[4,2],[6,2],[8,2],[11,1],[12,4]]], dense: [[[0,1],[2,1],[3,1],[4,2],[6,1],[7,1],[8,2],[10,1],[11,1],[12,4]],[[0,1],[1,1],[2,2],[4,1],[6,1],[7,1],[8,2],[10,1],[12,2],[14,2]]],
  } },
]);
export const MELODY_DENSITIES = freeze([{id:'sparse',name:'疏'},{id:'medium',name:'中'},{id:'dense',name:'密'}]);
export function melodyStyleInfo(id) { const style=MELODY_STYLES.find(s=>s.id===id);if(!style)throw new Error('旋律风格无效');return style; }
export function melodyOptions(settings={}) {
  if(!settings||typeof settings!=='object'||Array.isArray(settings))throw new Error('旋律设置无效');
  const options={mode:settings.mode??'compose',style:settings.style??'gentle-v1',density:settings.density??'medium',range:settings.range??'low',variant:settings.variant??0,enable:settings.enable??true};
  melodyStyleInfo(options.style);
  if(!['compose','answer','repitch'].includes(options.mode)||!MELODY_DENSITIES.some(d=>d.id===options.density)||!['low','high','all'].includes(options.range)||!Number.isInteger(options.variant)||options.variant<0||options.variant>0xffffffff||typeof options.enable!=='boolean')throw new Error('旋律模式、密度、音域或候选编号无效');
  return options;
}
export function melodyTarget(start,mode='compose') {
  if(!Number.isInteger(start)||start<0||start%GROUP_SIZE||!['compose','answer','repitch'].includes(mode))throw new Error('旋律生成范围无效');
  return {start:start+(mode==='answer'?2:0),end:start+GROUP_SIZE};
}
export function melodyHarmonyInfo(value,start,end) {
  const state=validate(value);
  if(!Number.isInteger(start)||!Number.isInteger(end)||start<0||end<=start||end>state.barCount)throw new Error('和声检查范围无效');
  const intervals=scaleInfo(state.scale).intervals,unmatched=new Set();let emptyBars=0;
  for(const bar of state.tracks[1].bars.slice(start,end)){
    if(bar.every(n=>n<0))emptyBars++;
    for(const chord of bar)if(chord>=0&&!CHORDS[chord].some(p=>intervals.includes(p%12)))unmatched.add(chord);
  }
  return {emptyBars,unmatchedChords:[...unmatched]};
}
function randomFor(variant) { let seed=(Math.imul(variant+1,2654435761)^0x7919b27)>>>0;return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;}; }
function nearestIndex(values,value) { let best=0;for(let i=1;i<values.length;i++)if(Math.abs(values[i]-value)<Math.abs(values[best]-value))best=i;return best; }
function chordAt(runs,step) { return runs.find(run=>step>=run.start&&step<run.end)?.chord??null; }
function chordPool(allowed,chord) { return chord===null?allowed:allowed.filter(p=>CHORDS[chord].some(n=>n%12===p%12)); }
function choosePitch(pool,desired,previous,random) {
  let best=Infinity, choices=[];
  for(const pitch of pool){const distance=previous===null?0:Math.abs(pitch-previous),score=Math.abs(pitch-desired)+(distance>7?(distance-7)*3:distance*.2);
    if(score<best-1e-9){best=score;choices=[pitch];}else if(Math.abs(score-best)<1e-9)choices.push(pitch);
  }
  return choices[Math.floor(random()*choices.length)];
}
function onsets(track,start,end) { const notes=[];for(let bar=start;bar<end;bar++)for(let step=0;step<16;step++)if(track.bars[bar][step]>=0)notes.push({bar,step,pitch:PITCH_VALUES[track.bars[bar][step]]});return notes; }
export function generateMelody(value,start,settings={}) {
  const state=validate(value),options=melodyOptions(settings);
  if(!Number.isInteger(start)||start<0||start%GROUP_SIZE||start+GROUP_SIZE>state.barCount)throw new Error('请选择有效的四小节段');
  const track=state.tracks[0],target=melodyTarget(start,options.mode),original=onsets(track,start,start+GROUP_SIZE),prefix=original.filter(n=>n.bar<start+2);
  if(options.mode==='answer'&&!prefix.length)throw new Error('前两小节没有旋律，请先写一句，或选择「生成四小节」。');
  if(options.mode==='repitch'&&!original.length)throw new Error('当前四小节没有旋律，请先选择「生成四小节」。');
  const scale=scaleInfo(state.scale),allowed=PITCH_VALUES.filter(p=>scale.intervals.includes(p%12)&&(options.range==='all'||(options.range==='low'?p<=12:p>=12))).sort((a,b)=>a-b);
  const style=melodyStyleInfo(options.style),random=randomFor(options.variant),contour=style.contours[options.variant%style.contours.length];
  const anchorIndex=Math.max(0,Math.min(allowed.length-1,Math.floor((allowed.length-1)*(.25+random()*.5))));
  const motif=options.mode==='answer'?prefix.map(n=>Math.max(-4,Math.min(4,nearestIndex(allowed,n.pitch)-nearestIndex(allowed,prefix[0].pitch)))):contour;
  const anchor=options.mode==='answer'?nearestIndex(allowed,prefix.at(-1).pitch):anchorIndex;
  let previous=options.mode==='answer'?prefix.at(-1).pitch:null;
  for(let bar=target.start;bar<target.end;bar++){
    const runs=harmonicRuns(state.tracks[1].bars[bar]);
    let rhythm=options.mode==='repitch'?original.filter(n=>n.bar===bar).map(n=>[n.step,track.durations[bar][n.step]]):style.rhythms[options.density][(bar-start+options.variant)%2];
    if(options.mode!=='repitch'&&bar===target.end-1)rhythm=[...rhythm.filter(([step])=>step<12),[12,4]];
    if(options.mode!=='repitch')for(const field of ['bars','durations','velocities'])track[field][bar].fill(field==='bars'?-1:1);
    for(let i=0;i<rhythm.length;i++){
      const [step,length]=rhythm[i],chord=chordAt(runs,step),last=bar===target.end-1&&i===rhythm.length-1;
      const harmonic=chordPool(allowed,chord),pool=step%4===0||last?(harmonic.length?harmonic:allowed):allowed;
      const index=Math.max(0,Math.min(allowed.length-1,anchor+motif[i%motif.length]+((bar-start)%2===1&&!last?1:0)));
      let desired=allowed[index];
      if(last){const root=chord===null?0:CHORDS[chord][0]%12,roots=pool.filter(p=>p%12===root);if(roots.length)desired=roots[nearestIndex(roots,previous??desired)];}
      const pitch=choosePitch(pool,desired,previous,random);previous=pitch;track.bars[bar][step]=pitchId(pitch);
      if(options.mode!=='repitch'){
        const nextChange=runs.find(run=>run.start>step)?.start??16;
        track.durations[bar][step]=Math.min(length,16-step,nextChange-step,(rhythm[i+1]?.[0]??16)-step);
        track.velocities[bar][step]=step===0?2:step%4===0?1:0;
      }
    }
  }
  if(options.enable)state.sections[start/GROUP_SIZE].enabled[0]=true;
  return validate(state);
}
