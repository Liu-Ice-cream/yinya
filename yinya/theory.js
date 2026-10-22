// Stable pitch IDs: the first eight retain the original pentatonic mapping.
export const PITCH_VALUES = Object.freeze([0,2,4,7,9,12,14,16,1,3,5,6,8,10,11,13,15,17,18,19,20,21,22,23,24]);
export const SCALES = Object.freeze([
  {id:'pentatonic',name:'五声音阶',intervals:[0,2,4,7,9]},
  {id:'major',name:'完整大调',intervals:[0,2,4,5,7,9,11]},
  {id:'minor',name:'自然小调',intervals:[0,2,3,5,7,8,10]},
].map(s=>Object.freeze({...s,intervals:Object.freeze(s.intervals)})));
export const CHORD_DEFINITIONS = Object.freeze([
  ['C',[36,40,43]],['Am',[33,36,40]],['Gsus2',[31,33,38]],['Em7',[28,31,38]],
  ['F',[41,45,48]],['G',[43,47,50]],['Dm',[38,41,45]],['G7',[43,47,50,53]],
  ['D',[38,42,45]],['A',[45,49,52]],['Bdim',[47,50,53]],['Cm',[36,39,43]],
  ['Fm',[41,44,48]],['Gm',[43,46,50]],['D♯',[39,43,46]],['G♯',[44,48,51]],['A♯',[46,50,53]],['Em',[40,43,47]],['Ddim',[38,41,44]],
].map(([name,pitches])=>Object.freeze({name,pitches:Object.freeze(pitches)})));
export const CHORD_PITCHES = Object.freeze(CHORD_DEFINITIONS.map(c=>c.pitches));
export const PROGRESSIONS = Object.freeze([
  {id:'bright-v1',name:'明亮前行',mode:'major',chords:[0,5,1,4]},
  {id:'lyric-v1',name:'抒情回转',mode:'major',chords:[0,1,6,5]},
  {id:'home-v1',name:'温暖归来',mode:'major',chords:[4,0,6,7]},
  {id:'night-v1',name:'夜色漫步',mode:'minor',chords:[11,15,14,16]},
  {id:'quiet-v1',name:'静谧回声',mode:'minor',chords:[11,12,13,11]},
  {id:'drift-v1',name:'微光起伏',mode:'minor',chords:[11,14,15,16]},
].map(p=>Object.freeze({...p,chords:Object.freeze(p.chords)})));
const NAMES = ['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];
const SOLFEGE = ['do','升do','re','降mi','mi','fa','升fa','sol','降la','la','降si','si'];
export function scaleInfo(id) { const scale=SCALES.find(s=>s.id===id);if(!scale)throw new Error('音阶无效');return scale; }
export function pitchId(semitones) { const id=PITCH_VALUES.indexOf(semitones);if(id<0)throw new Error('音高超出两个八度；作品未改变');return id; }
export function inScale(state,id) { return scaleInfo(state.scale).intervals.includes(PITCH_VALUES[id]%12); }
export function keyName(transpose) { return NAMES[(transpose%12+12)%12]; }
export function pitchName(state,track,id,naming='solfege') {
  const offset=PITCH_VALUES[id];if(offset===undefined||![0,2].includes(track)||!['solfege','notes'].includes(naming))throw new Error('音高或音名显示方式无效');
  const absolute=(track===0?48:24)+offset+state.transpose;
  const name=keyName(absolute)+Math.floor(absolute/12);
  return naming==='notes'?name:`${SOLFEGE[offset%12]} · ${name}`;
}
export function chordName(state,id) {
  const chord=CHORD_DEFINITIONS[id];if(!chord)throw new Error('和弦无效');
  const root=chord.name.match(/^[A-G]♯?/)[0],suffix=chord.name.slice(root.length);
  return keyName(NAMES.indexOf(root)+state.transpose)+suffix;
}
export function pitchRows(state,track,bar,range='all',naming='solfege') {
  if(!['all','low','high'].includes(range)||![0,2].includes(track)||!Number.isInteger(bar)||bar<0||bar>=state.barCount)throw new Error('显示音域或小节无效');
  const layer=state.tracks[track],used=new Set(layer.bars[bar].filter(n=>n>=0));
  for(let b=Math.floor(bar/4)*4;b<bar;b++)for(let step=0;step<16;step++)if(layer.bars[b][step]>=0&&b*16+step+layer.durations[b][step]>bar*16)used.add(layer.bars[b][step]);
  return PITCH_VALUES.map((offset,id)=>({offset,id})).filter(({offset,id})=>(range==='all'||(range==='low'?offset<=12:offset>=12))&&(inScale(state,id)||used.has(id))).sort((a,b)=>b.offset-a.offset).map(({id})=>({id,label:pitchName(state,track,id,naming),outside:!inScale(state,id)}));
}
export function chordRows(state,bar,all=false) {
  const choices=all?CHORD_DEFINITIONS.map((_,id)=>id):state.scale==='minor'?[11,18,14,12,13,15,16]:[0,6,17,4,5,1,10,7,2,3];
  const held=[];const t=state.tracks[1];for(let b=Math.floor(bar/4)*4;b<bar;b++)for(let beat=0;beat<4;beat++)if(t.bars[b][beat]>=0&&b*4+beat+(t.chordDurations?.[b]?.[beat]??1)>bar*4)held.push(t.bars[b][beat]);
  return [...new Set([...choices,...held,...state.tracks[1].bars[bar].filter(n=>n>=0)])].map(id=>({id,label:chordName(state,id)}));
}
