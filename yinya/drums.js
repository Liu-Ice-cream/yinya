// Atomic four-bar drum edits. Different lanes may share a step.
import {validate,applyDrumPattern,setSectionDrumKit} from './model.js';
import {drumLevel,withDrumLevel} from './drum-kits.js';

export const drumKey=hit=>hit.step*3+hit.lane;
function scope(value,start){const state=validate(value);if(!Number.isInteger(start)||start<0||start%4||start+4>state.barCount)throw new Error('请选择有效的四小节段');return state;}
function hits(state,start){const t=state.tracks[3],result=[];for(let i=0;i<64;i++)for(let lane=0;lane<3;lane++)if(t.bars[start+Math.floor(i/16)][i%16]&(1<<lane))result.push({step:i,lane,velocity:drumLevel(t.drumVelocities[start+Math.floor(i/16)][i%16],lane)});return result;}
export function drumHits(value,start){return hits(scope(value,start),start);}
function chosen(notes,keys){if(!Array.isArray(keys)||!keys.length||keys.length>192||new Set(keys).size!==keys.length||keys.some(k=>!Number.isInteger(k)))throw new Error('请先选择鼓点');const result=notes.filter(n=>keys.includes(drumKey(n)));if(result.length!==keys.length)throw new Error('所选鼓点已变化，请重新选择');return result;}
function write(state,start,notes){
  const occupied=new Set();
  for(const n of notes){if(!Number.isInteger(n.step)||n.step<0||n.step>63||![0,1,2].includes(n.lane)||![0,1,2].includes(n.velocity))throw new Error('鼓点超出当前四小节或三行范围；整次修改已取消');const key=drumKey(n);if(occupied.has(key))throw new Error('同一行鼓点发生重叠；整次修改已取消');occupied.add(key);}
  const t=state.tracks[3];for(let b=start;b<start+4;b++){t.bars[b].fill(0);t.drumVelocities[b].fill(13);}
  for(const n of notes){const b=start+Math.floor(n.step/16),s=n.step%16;t.bars[b][s]|=1<<n.lane;t.drumVelocities[b][s]=withDrumLevel(t.drumVelocities[b][s],n.lane,n.velocity);}
  return validate(state);
}
export function editDrums(value,start,keys,action){
  const state=scope(value,start),notes=hits(state,start);if(!action||typeof action!=='object')throw new Error('鼓点编辑操作无效');
  if(action.type==='insert'){const n={step:action.step,lane:action.lane,velocity:action.velocity};return {state:write(state,start,[...notes,n]),selection:[drumKey(n)]};}
  const selection=chosen(notes,keys),remaining=notes.filter(n=>!keys.includes(drumKey(n)));let changed;
  if(action.type==='move'){if(!Number.isInteger(action.steps)||Math.abs(action.steps)>63||!Number.isInteger(action.lanes)||Math.abs(action.lanes)>2)throw new Error('鼓点移动范围无效');changed=selection.map(n=>({...n,step:n.step+action.steps,lane:n.lane+action.lanes}));}
  else if(action.type==='velocity'){if(![0,1,2].includes(action.level))throw new Error('鼓点力度无效');changed=selection.map(n=>({...n,velocity:action.level}));}
  else if(action.type==='delete')changed=[];
  else throw new Error('鼓点编辑操作无效');
  return {state:write(state,start,[...remaining,...changed]),selection:changed.map(drumKey)};
}
export function copyDrums(value,start,keys){const selected=chosen(drumHits(value,start),keys),anchor=selected[0].step;return {version:1,hits:selected.map(({step,...n})=>({...n,offset:step-anchor}))};}
export function pasteDrums(value,start,cursor,clipboard){const state=scope(value,start);if(!Number.isInteger(cursor)||cursor<0||cursor>63||!clipboard||clipboard.version!==1||!Array.isArray(clipboard.hits)||!clipboard.hits.length||clipboard.hits.length>192)throw new Error('请先复制鼓点并选择粘贴起点');const copied=clipboard.hits.map(n=>{if(!n||!Number.isInteger(n.offset)||n.offset<0||n.offset>63)throw new Error('复制的鼓点数据无效');return {step:cursor+n.offset,lane:n.lane,velocity:n.velocity};});if(Math.min(...clipboard.hits.map(n=>n.offset))!==0)throw new Error('复制的鼓点起点无效');return {state:write(state,start,[...hits(state,start),...copied]),selection:copied.map(drumKey)};}
export function drumRectangle(notes,from,to){if(!Array.isArray(notes)||![from?.step,to?.step,from?.lane,to?.lane].every(Number.isFinite))throw new Error('框选范围无效');return notes.filter(n=>n.step>=Math.min(from.step,to.step)&&n.step<=Math.max(from.step,to.step)&&n.lane>=Math.min(from.lane,to.lane)&&n.lane<=Math.max(from.lane,to.lane)).map(drumKey);}
export function generateDrums(value,start,settings={}){
  if(!settings||typeof settings!=='object'||Array.isArray(settings))throw new Error('节奏工坊设置无效');
  let state=scope(value,start);const {pattern='pop-v1',fill=false,accent='expressive',rhythm=true,kit=false,drumKit='inherit',enable=false}=settings;
  if(![fill,rhythm,kit,enable].every(v=>typeof v==='boolean')||!['standard','expressive'].includes(accent))throw new Error('节奏工坊设置无效');
  if(kit)state=setSectionDrumKit(state,start/4,drumKit);
  if(rhythm){state=applyDrumPattern(state,start,4,pattern,fill);if(accent==='expressive'){const t=state.tracks[3];for(let b=start;b<start+4;b++)for(let s=0;s<16;s++)for(let lane=0;lane<3;lane++)if(t.bars[b][s]&(1<<lane)){const level=lane===2?(s%4===0?1:0):lane===0?(s%8===0?2:1):fill&&b===start+3&&s>=12?(s===15?2:s===12?0:1):2;t.drumVelocities[b][s]=withDrumLevel(t.drumVelocities[b][s],lane,level);}}}
  if(enable&&(rhythm||kit))state.sections[start/4].enabled[3]=true;
  return validate(state);
}
