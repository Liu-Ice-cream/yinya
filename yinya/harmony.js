// Four-bar chord editing owns ordinary notes and expression, never a recipe.
import {validate} from './model.js';
import {chordExpression,chordInversion,chordVelocity,voicedPitches,smoothInversions,connectionCost} from './chord-expression.js';

function scope(value,start){const state=validate(value);if(!Number.isInteger(start)||start<0||start%4||start+4>state.barCount)throw new Error('请选择有效的四小节段');return state;}
function read(state,start){const t=state.tracks[1],notes=[];for(let beat=0;beat<16;beat++){const b=start+Math.floor(beat/4),at=beat%4,chord=t.bars[b][at],code=t.chordVoicings[b][at];if(chord>=0)notes.push({beat,chord,inversion:chordInversion(code),velocity:chordVelocity(code)});}return notes;}
export function harmonyNotes(value,start){return read(scope(value,start),start);}
function selected(notes,beats){if(!Array.isArray(beats)||!beats.length||beats.length>16||new Set(beats).size!==beats.length||beats.some(b=>!Number.isInteger(b)))throw new Error('请先选择有效和弦');const chosen=notes.filter(n=>beats.includes(n.beat));if(chosen.length!==beats.length)throw new Error('所选和弦已变化，请重新选择');return chosen;}
function write(state,start,notes){
  const occupied=new Set();
  for(const n of notes){if(!Number.isInteger(n.beat)||n.beat<0||n.beat>15)throw new Error('和弦超出当前四小节；整次修改已取消');voicedPitches(n.chord,n.inversion);chordExpression(n.inversion,n.velocity);if(occupied.has(n.beat))throw new Error('同拍和弦发生重叠；整次修改已取消');occupied.add(n.beat);}
  const t=state.tracks[1];for(let b=start;b<start+4;b++){t.bars[b].fill(-1);t.chordVoicings[b].fill(1);}for(const n of notes){const b=start+Math.floor(n.beat/4),at=n.beat%4;t.bars[b][at]=n.chord;t.chordVoicings[b][at]=chordExpression(n.inversion,n.velocity);}return validate(state);
}
export function editHarmony(value,start,beats,action){
  const state=scope(value,start),notes=read(state,start);if(!action||typeof action!=='object'||Array.isArray(action))throw new Error('和弦编辑操作无效');
  if(action.type==='insert'){const note={beat:action.beat,chord:action.chord,inversion:action.inversion,velocity:action.velocity};return {state:write(state,start,[...notes,note]),selection:[note.beat]};}
  const chosen=selected(notes,beats),remaining=notes.filter(n=>!beats.includes(n.beat));let changed;
  switch(action.type){
    case 'move':if(!Number.isInteger(action.beats)||Math.abs(action.beats)>15)throw new Error('和弦移动拍数无效');changed=chosen.map(n=>({...n,beat:n.beat+action.beats}));break;
    case 'replace':voicedPitches(action.chord,0);changed=chosen.map(n=>({...n,chord:action.chord,inversion:0}));break;
    case 'inversion':changed=chosen.map(n=>({...n,inversion:action.inversion}));break;
    case 'velocity':changed=chosen.map(n=>({...n,velocity:action.velocity}));break;
    case 'delete':changed=[];break;
    default:throw new Error('和弦编辑操作无效');
  }
  return {state:write(state,start,[...remaining,...changed]),selection:changed.map(n=>n.beat).sort((a,b)=>a-b)};
}
export function copyHarmony(value,start,beats){const notes=selected(harmonyNotes(value,start),beats),anchor=notes[0].beat;return {version:1,chords:notes.map(({beat,...n})=>({...n,offset:beat-anchor}))};}
export function pasteHarmony(value,start,cursor,clipboard){const state=scope(value,start);if(!Number.isInteger(cursor)||cursor<0||cursor>15||!clipboard||clipboard.version!==1||!Array.isArray(clipboard.chords)||!clipboard.chords.length||clipboard.chords.length>16)throw new Error('请先复制和弦并选择粘贴起点');const notes=Array.from(clipboard.chords,n=>{if(!n||!Number.isInteger(n.offset)||n.offset<0||n.offset>15)throw new Error('复制的和弦数据无效');return {beat:cursor+n.offset,chord:n.chord,inversion:n.inversion,velocity:n.velocity};});if(Math.min(...clipboard.chords.map(n=>n.offset))!==0)throw new Error('复制的和弦起点无效');return {state:write(state,start,[...read(state,start),...notes]),selection:notes.map(n=>n.beat).sort((a,b)=>a-b)};}
export function harmonyRectangle(notes,from,to){if(!Array.isArray(notes)||![from,to].every(Number.isFinite))throw new Error('框选范围无效');return notes.filter(n=>n.beat>=Math.min(from,to)&&n.beat<=Math.max(from,to)).map(n=>n.beat);}
export function harmonyDistance(notes){return notes.reduce((sum,n,i)=>i?sum+connectionCost(voicedPitches(notes[i-1].chord,notes[i-1].inversion),voicedPitches(n.chord,n.inversion)):sum,0);}
export function generateHarmony(value,start,settings={}){
  const state=scope(value,start);if(!settings||typeof settings!=='object'||Array.isArray(settings))throw new Error('和声工坊设置无效');const {connection='smooth',accent='keep',enable=false}=settings;
  if(!['keep','root','smooth'].includes(connection)||!['keep','standard','pulse'].includes(accent)||typeof enable!=='boolean')throw new Error('和声工坊设置无效');
  const notes=read(state,start);if(!notes.length)throw new Error('本段还没有和弦；请先点格写入或填入和弦走向');
  const inversions=connection==='smooth'?smoothInversions(notes):notes.map(n=>connection==='root'?0:n.inversion);
  const result=write(state,start,notes.map((n,i)=>({...n,inversion:inversions[i],velocity:accent==='keep'?n.velocity:accent==='standard'?1:n.beat%4===0?2:n.beat%2===0?1:0})));
  if(enable)result.sections[start/4].enabled[1]=true;return result;
}
