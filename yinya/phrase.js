// Pure, atomic editing of one monophonic four-bar phrase. No audio or UI state.
import {validate, GROUP_SIZE, LONG_NOTE_TRACKS} from './model.js';
import {PITCH_VALUES, pitchId} from './theory.js';

function scope(value,track,start) {
  const state=validate(value);
  if(!LONG_NOTE_TRACKS.includes(track)||!Number.isInteger(start)||start<0||start%GROUP_SIZE||start+GROUP_SIZE>state.barCount)throw new Error('请选择旋律或贝斯的有效四小节段');
  return state;
}
function readNotes(state,track,start) {
  const layer=state.tracks[track],notes=[];
  for(let bar=0;bar<GROUP_SIZE;bar++)for(let step=0;step<16;step++)if(layer.bars[start+bar][step]>=0)notes.push({step:bar*16+step,pitch:layer.bars[start+bar][step],duration:layer.durations[start+bar][step],velocity:layer.velocities[start+bar][step]});
  return notes;
}
export function phraseNotes(value,track,start){return readNotes(scope(value,track,start),track,start);}
function selectedNotes(notes,steps) {
  if(!Array.isArray(steps)||!steps.length||steps.length>64||new Set(steps).size!==steps.length||steps.some(s=>!Number.isInteger(s)))throw new Error('请先选择有效的音符');
  const chosen=notes.filter(note=>steps.includes(note.step));
  if(chosen.length!==steps.length)throw new Error('所选音符已变化，请重新选择');
  return chosen;
}
function validateNotes(notes) {
  let end=0;
  for(const n of [...notes].sort((a,b)=>a.step-b.step)){
    if(!Number.isInteger(n.step)||n.step<0||n.step>=64||!Number.isInteger(n.pitch)||PITCH_VALUES[n.pitch]===undefined)throw new Error('音符超出当前四小节或两个八度；作品未改变');
    if(!Number.isInteger(n.duration)||n.duration<1||n.duration>32||n.step+n.duration>64)throw new Error('时长需为 1–32 格，且不能超出当前四小节段；作品未改变');
    if(![0,1,2].includes(n.velocity))throw new Error('音符力度无效');
    if(n.step<end)throw new Error('音符发生重叠，整次修改已取消；已有内容保留');
    end=n.step+n.duration;
  }
}
function writeNotes(state,track,start,notes) {
  validateNotes(notes);const layer=state.tracks[track];
  for(let bar=start;bar<start+GROUP_SIZE;bar++)for(const field of ['bars','durations','velocities'])layer[field][bar].fill(field==='bars'?-1:1);
  for(const n of notes){const bar=start+Math.floor(n.step/16),step=n.step%16;layer.bars[bar][step]=n.pitch;layer.durations[bar][step]=n.duration;layer.velocities[bar][step]=n.velocity;}
  return validate(state);
}
export function editPhrase(value,track,start,steps,action) {
  const state=scope(value,track,start),notes=readNotes(state,track,start);
  if(!action||typeof action!=='object'||Array.isArray(action))throw new Error('乐句编辑操作无效');
  if(action.type==='insert'){
    const note={step:action.step,pitch:action.pitch,duration:action.duration,velocity:action.velocity};
    return {state:writeNotes(state,track,start,[...notes,note]),selection:[note.step]};
  }
  const chosen=selectedNotes(notes,steps),remaining=notes.filter(n=>!steps.includes(n.step));
  let changed;
  switch(action.type){
    case 'move':
      if(!Number.isInteger(action.steps)||Math.abs(action.steps)>63||!Number.isInteger(action.semitones)||Math.abs(action.semitones)>24)throw new Error('移动格数或半音无效');
      changed=chosen.map(n=>({...n,step:n.step+action.steps,pitch:pitchId(PITCH_VALUES[n.pitch]+action.semitones)}));break;
    case 'resize':
      if(!Number.isInteger(action.delta)||Math.abs(action.delta)>31)throw new Error('长度调整无效');
      changed=chosen.map(n=>({...n,duration:n.duration+action.delta}));break;
    case 'length':
      if(!Number.isInteger(action.duration)||action.duration<1||action.duration>32)throw new Error('时长需为 1–32 格');
      changed=chosen.map(n=>({...n,duration:action.duration}));break;
    case 'join': {
      if(chosen.length<2||chosen.some((n,i)=>n.pitch!==chosen[0].pitch||n.velocity!==chosen[0].velocity||(i>0&&chosen[i-1].step+chosen[i-1].duration!==n.step)))throw new Error('请选择至少两个首尾相接、音高与力度相同的音符；作品未改变');
      changed=[{...chosen[0],duration:chosen.at(-1).step+chosen.at(-1).duration-chosen[0].step}];break;
    }
    case 'split':
      changed=chosen.flatMap(n=>{const parts=[];for(let step=n.step;step<n.step+n.duration;){const duration=Math.min(16-step%16,n.step+n.duration-step);parts.push({...n,step,duration});step+=duration;}return parts;});break;
    case 'velocity':
      if(![0,1,2].includes(action.level))throw new Error('音符力度无效');
      changed=chosen.map(n=>({...n,velocity:action.level}));break;
    case 'delete':changed=[];break;
    default:throw new Error('乐句编辑操作无效');
  }
  return {state:writeNotes(state,track,start,[...remaining,...changed]),selection:changed.map(n=>n.step).sort((a,b)=>a-b)};
}
export function copyPhrase(value,track,start,steps) {
  const notes=selectedNotes(phraseNotes(value,track,start),steps),anchor=notes[0].step;
  return {version:1,notes:notes.map(({step,...note})=>({...note,offset:step-anchor}))};
}
export function pastePhrase(value,track,start,cursor,clipboard) {
  const state=scope(value,track,start);
  if(!Number.isInteger(cursor)||cursor<0||cursor>=64||!clipboard||clipboard.version!==1||!Array.isArray(clipboard.notes)||!clipboard.notes.length||clipboard.notes.length>64)throw new Error('请先复制音符，并选择有效粘贴起点');
  const copied=clipboard.notes.map(n=>{
    if(!n||!Number.isInteger(n.offset)||n.offset<0||n.offset>63)throw new Error('复制的乐句数据无效');
    return {step:cursor+n.offset,pitch:n.pitch,duration:n.duration,velocity:n.velocity};
  });
  if(Math.min(...clipboard.notes.map(n=>n.offset))!==0)throw new Error('复制的乐句起点无效');
  return {state:writeNotes(state,track,start,[...readNotes(state,track,start),...copied]),selection:copied.map(n=>n.step).sort((a,b)=>a-b)};
}
export function phraseRectangle(notes,from,to) {
  if(!Array.isArray(notes)||![from?.step,to?.step,from?.pitch,to?.pitch].every(Number.isFinite))throw new Error('框选范围无效');
  const left=Math.min(from.step,to.step),right=Math.max(from.step,to.step),low=Math.min(from.pitch,to.pitch),high=Math.max(from.pitch,to.pitch);
  return notes.filter(n=>n.step<=right&&n.step+n.duration>left&&PITCH_VALUES[n.pitch]>=low&&PITCH_VALUES[n.pitch]<=high).map(n=>n.step);
}
