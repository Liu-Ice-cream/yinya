import {blank,validate,TRACKS,sectionVoice,sectionDrumKit,trackAudibleAt,sectionChordStyle,chordStyleInfo} from './model.js';
import {voiceInfo,chordVoiceInfo,bassVoiceInfo} from './voices.js';
import {PITCH_VALUES} from './theory.js';
import {voicedPitches,chordInversion,chordVelocity} from './chord-expression.js';
import {drumKitInfo,drumLevel} from './drum-kits.js';

const FIELDS=[['bars','durations','velocities'],['bars','chordDurations','chordVoicings'],['bars','durations','velocities'],['bars','drumVelocities']];
const clone=value=>JSON.parse(JSON.stringify(value));
function check(state,index,track){if(!Number.isInteger(index)||index<0||index>=state.sections.length||!Number.isInteger(track)||track<0||track>3)throw new Error('请选择有效的段落与声部');}
function localSettings(state,index,track){const part=state.sections[index];return {enabled:part.enabled[track],volume:part.volumes[track],endVolume:part.endVolumes[track],...(track===3?{drumKit:part.drumKit}:{voice:part.voices[track]}),...(track===1?{chordStyle:part.chordStyle}:{})};}
function applySettings(state,index,track,settings){
 if(!settings||typeof settings!=='object'||Array.isArray(settings))throw new Error('片段配器不完整');
 const part=state.sections[index];part.enabled[track]=settings.enabled;part.volumes[track]=settings.volume;part.endVolumes[track]=settings.endVolume;
 if(track===3)part.drumKit=settings.drumKit;else part.voices[track]=settings.voice;
 if(track===1)part.chordStyle=settings.chordStyle;
}
export function copyTrackSection(value,index,track){
 const state=validate(value);check(state,index,track);
 return {version:1,track,name:state.sections[index].name,notes:Object.fromEntries(FIELDS[track].map(field=>[field,clone(state.tracks[track][field].slice(index*4,index*4+4))])),settings:localSettings(state,index,track)};
}
function readClipboard(clipboard){
 if(!clipboard||clipboard.version!==1||!Number.isInteger(clipboard.track)||clipboard.track<0||clipboard.track>3||typeof clipboard.name!=='string'||!clipboard.name.trim()||clipboard.name.length>24||!clipboard.notes||typeof clipboard.notes!=='object'||Array.isArray(clipboard.notes))throw new Error('请先复制有效的四小节声部片段');
 const track=clipboard.track,probe=blank();
 for(const field of FIELDS[track]){if(!Array.isArray(clipboard.notes[field]))throw new Error('片段音符数据不完整');probe.tracks[track][field]=clone(clipboard.notes[field]);}
 applySettings(probe,0,track,clipboard.settings);return {state:validate(probe),track};
}
export function pasteTrackSection(value,index,clipboard,withSettings=false){
 const state=validate(value),{state:probe,track}=readClipboard(clipboard);check(state,index,track);if(typeof withSettings!=='boolean')throw new Error('复制配器选项无效');
 for(const field of FIELDS[track])state.tracks[track][field].splice(index*4,4,...clone(probe.tracks[track][field]));
 if(withSettings)applySettings(state,index,track,localSettings(probe,0,track));
 return validate(state);
}
export function trackSectionHasNotes(value,index,track){const state=validate(value);check(state,index,track);return state.tracks[track].bars.slice(index*4,index*4+4).some(bar=>bar.some(n=>track===3?n!==0:n>=0));}
export function combinationTracks(mode,track=0){
 if(!Number.isInteger(track)||track<0||track>3)throw new Error('试听声部无效');
 const choices={all:[0,1,2,3],duet:[0,1],rhythm:[2,3],solo:[track]};if(!Object.hasOwn(choices,mode))throw new Error('试听组合无效');return [...choices[mode]];
}

function cell(state,index,track){
 const t=state.tracks[track],part=state.sections[index],rects=[];let count=0;
 for(let bar=index*4;bar<index*4+4;bar++)for(let step=0;step<t.bars[bar].length;step++){
  const pitch=t.bars[bar][step],at=(bar-index*4)*16+(track===1?step*4:step);
  if(track===3){for(let lane=0;lane<3;lane++)if(pitch&(1<<lane)){rects.push({x:at,y:3+lane*10,width:1,height:6,level:drumLevel(t.drumVelocities[bar][step],lane)});count++;}}
  else if(pitch>=0){count++;const width=track===1?t.chordDurations[bar][step]*4:t.durations[bar][step],level=track===1?chordVelocity(t.chordVoicings[bar][step]):t.velocities[bar][step];
   const pitches=track===1?voicedPitches(pitch,chordInversion(t.chordVoicings[bar][step])):[PITCH_VALUES[pitch]];
   for(const p of pitches)rects.push({x:at,y:track===1?Math.max(2,Math.min(31,34-(p-36)*.6)):3+(24-p)/24*27,width,height:3,level});
  }
 }
 const voice=track===3?drumKitInfo(sectionDrumKit(state,index*4)).name:[voiceInfo,chordVoiceInfo,bassVoiceInfo][track](sectionVoice(state,track,index*4)).name;
 const status=!t.enabled?'整曲关闭':t.volume===0?'整曲音量 0%':!part.enabled[track]?'本段关闭':Math.max(part.volumes[track],part.endVolumes[track])===0?'本段音量 0%':count?'已加入':'空白';
 return {index,track,name:part.name,voice,status,count,audible:count>0&&trackAudibleAt(state,track,index*4),volume:part.volumes[track]===part.endVolumes[track]?`${part.volumes[track]}%`:`${part.volumes[track]}→${part.endVolumes[track]}%`,style:track===1?chordStyleInfo(sectionChordStyle(state,index*4)).name:null,rects};
}
export function arrangementOverview(value){const state=validate(value);return state.sections.map((part,index)=>({id:part.id,name:part.name,index,start:index*4,cells:TRACKS.map((_,track)=>cell(state,index,track))}));}
