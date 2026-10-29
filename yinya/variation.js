// Local, deterministic variations of an existing theme. Results are ordinary v16 notes.
import {validate,CHORDS} from './model.js';
import {phraseNotes} from './phrase.js';
import {PITCH_VALUES,pitchId,scaleInfo} from './theory.js';
import {harmonicRunsAt} from './accompaniment.js';

export const VARIATION_MODES=Object.freeze([
  {id:'gentle',name:'轻微修饰',hint:'改动约四分之一可改音符的音高（向上取整）；起点、时长与力度保留。'},
  {id:'rhythm',name:'节奏变化',hint:'调整约一半可改音符（向上取整）：移动起点、拆成同音短句或缩短留白；力度保留。'},
  {id:'cadence',name:'结尾收束',hint:'只调整后两小节末尾至多两个可改音符，句尾靠近目标和弦根音并适当延长。'},
]);
export function variationOptions(settings={}){
  if(!settings||typeof settings!=='object'||Array.isArray(settings))throw new Error('变奏设置无效');
  const defaults={mode:'gentle',prefix:false,strong:true,harmony:true,enable:false,variant:0};
  const o=Object.fromEntries(Object.entries(defaults).map(([key,value])=>[key,settings[key]===undefined?value:settings[key]]));
  if(!VARIATION_MODES.some(m=>m.id===o.mode)||['prefix','strong','harmony','enable'].some(k=>typeof o[k]!=='boolean')||!Number.isInteger(o.variant)||o.variant<0||o.variant>0xffffffff)throw new Error('变奏方式、保护选项或候选编号无效');
  return o;
}
function rank(note,variant){let x=(Math.imul(note.step+1,2654435761)^Math.imul(variant+1,2246822519))>>>0;x=Math.imul(x^(x>>>16),3266489917);return (x^(x>>>13))>>>0;}
function nearest(pool,desired,original){return [...pool].sort((a,b)=>Math.abs(a-desired)-Math.abs(b-desired)||Math.abs(a-original)-Math.abs(b-original)||a-b)[0];}
function equal(a,b){return a.step===b.step&&a.pitch===b.pitch&&a.duration===b.duration&&a.velocity===b.velocity;}
export function generateVariation(value,source,target,settings={}){
  const state=validate(value),o=variationOptions(settings);
  if([source,target].some(i=>!Number.isInteger(i)||i<0||i>=state.sections.length))throw new Error('请选择有效的来源与目标段落');
  const original=phraseNotes(state,0,source*4);
  if(!original.length)throw new Error('来源段没有旋律，请先写入旋律或换一个来源段；目标内容保留。');
  const protectedNote=n=>(o.prefix&&n.step<32)||(o.strong&&n.step%8===0);
  const notes=original.map(n=>({...n})),editable=notes.filter(n=>!protectedNote(n)),scale=scaleInfo(state.scale).intervals;
  const allowed=PITCH_VALUES.filter(p=>scale.includes(p%12)).sort((a,b)=>a-b);
  const chordAt=step=>harmonicRunsAt(state,target*4+Math.floor(step/16)).find(r=>step%16>=r.start&&step%16<r.end)?.chord??null;
  const poolAt=step=>{const chord=chordAt(step),pool=chord===null?[]:allowed.filter(p=>CHORDS[chord].some(n=>n%12===p%12));return pool.length?pool:allowed;};
  const origins=notes.map((note,i)=>({note,original:original[i]}));
  function adapt(n){if(!o.harmony)return;const old=PITCH_VALUES[n.pitch];n.pitch=pitchId(nearest(poolAt(n.step),old,old));}
  const ranked=[...editable].sort((a,b)=>rank(a,o.variant)-rank(b,o.variant)||a.step-b.step);
  if(o.mode==='gentle'){
    const limit=Math.ceil(editable.length/4);let changed=0;
    for(const n of ranked){if(changed>=limit)break;const old=PITCH_VALUES[n.pitch],direction=(rank(n,o.variant)&1)?1:-1;
      const nearby=allowed.filter(p=>p!==old&&Math.abs(p-old)<=4),harmonic=o.harmony?poolAt(n.step):allowed;
      const pool=nearby.filter(p=>harmonic.includes(p));if(!pool.length)continue;
      n.pitch=pitchId(nearest(pool,old+direction*2,old));changed++;
    }
  }else if(o.mode==='rhythm'){
    const limit=Math.ceil(editable.length/2);let changed=0;
    for(const n of ranked){if(changed>=limit)break;notes.sort((a,b)=>a.step-b.step);const index=notes.indexOf(n),left=Math.max(o.prefix?32:0,index?notes[index-1].step+notes[index-1].duration:0),right=notes[index+1]?.step??64;
      const actions=['move','split','shorten'],offset=(o.variant+index)%3;let done=false;
      for(let attempt=0;attempt<3&&!done;attempt++)switch(actions[(offset+attempt)%3]){
        case 'move':{const direction=(rank(n,o.variant)&1)?1:-1;for(const delta of [direction*2,-direction*2,direction,-direction])if(n.step+delta>=left&&n.step+delta+n.duration<=right){n.step+=delta;done=true;break;}break;}
        case 'split':if(n.duration>=4){const duration=n.duration,first=Math.floor(duration/2),second={...n,step:n.step+first+1,duration:duration-first-1};n.duration=first;notes.push(second);adapt(second);done=true;}break;
        case 'shorten':if(n.duration>=2){n.duration-=Math.min(2,n.duration-1);done=true;}break;
      }
      if(done){adapt(n);changed++;}
    }
  }else{
    const ending=editable.filter(n=>n.step>=32).slice(-2),last=notes.at(-1);
    for(const n of ending){const old=PITCH_VALUES[n.pitch],chord=chordAt(n.step),root=chord===null?0:CHORDS[chord][0]%12;
      const pool=n===last?allowed.filter(p=>p%12===root):poolAt(n.step);
      n.pitch=pitchId(nearest(pool.length?pool:poolAt(n.step),old,old));
      if(n===last)n.duration=Math.min(32,64-n.step);
    }
  }
  notes.sort((a,b)=>a.step-b.step);
  // Target-only replacement; validate() independently enforces overlap, range and metadata rules.
  const layer=state.tracks[0];
  for(let bar=target*4;bar<target*4+4;bar++)for(const field of ['bars','durations','velocities'])layer[field][bar].fill(field==='bars'?-1:1);
  for(const n of notes){const bar=target*4+Math.floor(n.step/16),step=n.step%16;layer.bars[bar][step]=n.pitch;layer.durations[bar][step]=n.duration;layer.velocities[bar][step]=n.velocity;}
  if(o.enable)state.sections[target].enabled[0]=true;
  const kept=original.filter(n=>notes.some(next=>equal(n,next))).length,protectedCount=original.filter(protectedNote).length;
  const pitchChanges=origins.filter(({note,original})=>note.pitch!==original.pitch).length;
  const rhythmChanges=origins.filter(({note,original})=>note.step!==original.step||note.duration!==original.duration).length;
  const warnings=[];
  if(!editable.length)warnings.push('所有来源音符均受保护，候选只会原样复制主题。');
  if(o.mode==='cadence'&&!editable.some(n=>n.step>=32))warnings.push('后两小节没有可改音符，未添加结尾；可调整保护选项。');
  if(kept===original.length&&notes.length===original.length&&editable.length)warnings.push('当前方式未改变主题音符；可换一版、调整保护选项或变奏方式。');
  const unmatched=new Set();for(let bar=target*4;bar<target*4+4;bar++)for(const {chord} of harmonicRunsAt(state,bar))if(!allowed.some(p=>CHORDS[chord].some(n=>n%12===p%12)))unmatched.add(chord);
  if(unmatched.size)warnings.push('部分目标和弦与创作音阶没有共同音，可改音符优先保留音阶。');
  const clashes=original.filter(n=>{const chord=chordAt(n.step);return protectedNote(n)&&chord!==null&&!CHORDS[chord].some(p=>p%12===PITCH_VALUES[n.pitch]%12);}).length;
  if(clashes)warnings.push(`${clashes} 个受保护音符不属于目标当时和弦，仍原样保留，请试听判断。`);
  return {state:validate(state),stats:{sourceCount:original.length,count:notes.length,kept,changed:original.length-kept,added:notes.filter(n=>!original.some(old=>old.step===n.step)).length,pitchChanges,rhythmChanges,protectedCount},warnings};
}
