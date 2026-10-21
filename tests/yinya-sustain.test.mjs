import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {blank,preset,validate,setPitchedNote,pitchedNoteAt,removePitchedNote,setNoteVelocity,clearBar,copyBar,copyGroup,resize,insertSection,moveSection,deleteSection,rangeHasNotes,hasAudibleNotes,songJSON,encode,decode,parseBackup,shiftOctave,VERSION,MAX_BACKUP_BYTES,wavBuffer} from '../yinya/model.js';
import {editPhrase,phraseNotes,copyPhrase,pastePhrase,phraseRectangle} from '../yinya/phrase.js';
import {generateMelody} from '../yinya/melody.js';
import {pitchId,pitchRows} from '../yinya/theory.js';
import {VOICES,BASS_VOICES,releaseSeconds,bassReleaseSeconds} from '../yinya/voices.js';
import {encodeMp3} from '../yinya/mp3.js';
import {Mp3Encoder} from '../website/yinya/vendor/lamejs.js';
import {MPEGDecoder} from 'mpg123-decoder';
await build({stdin:{contents:'export {audioSong} from "./yinya/song.js";export {Synth} from "./synth/synth.ts";export {AudioRenderer,sectionState,fadeEnd} from "./yinya/render.js";export {renderPreview} from "./yinya/preview.js";',resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',outfile:'build/yinya-sustain-test.mjs'});
const {audioSong,Synth,AudioRenderer,sectionState,fadeEnd,renderPreview}=await import('../build/yinya-sustain-test.mjs');
globalThis.requestAnimationFrame=cb=>setImmediate(cb);
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const seed=()=>{let n=37123;return()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return(n+.5)/2**32;};};
const hold=(track=0,step=12,duration=32)=>editPhrase(blank('跨小节'),track,0,[],{type:'insert',step,pitch:4,duration,velocity:2}).state;
const rms=a=>Math.sqrt(a.reduce((sum,x)=>sum+x*x,0)/a.length);
async function render(s,ending='natural'){const r=new AudioRenderer();for await(const _ of r.generate(s,44100,ending)){}return r;}
function raw(json,rate,count){const song=audioSong(json),synth=new Synth(song);synth.samplesPerSecond=rate;synth.loopRepeatCount=0;const left=new Float32Array(count),right=new Float32Array(count);synth.synthesize(left,right,count,true);return {left,right};}
function equalAudio(a,b){assert.equal(a.length,b.length);let max=0;for(let i=0;i<a.length;i++)max=Math.max(max,Math.abs(a[i]-b[i]));assert.ok(max<1e-6,`PCM max difference ${max}`);}

test('published v0.13.0 works migrate only their schema with every note and canonical audio hash intact',async()=>{
  const fixture=JSON.parse(await readFile(new URL('./fixtures/yinya-v0130-compat.json',import.meta.url)));assert.equal(fixture.source,'v0.13.0');assert.equal(fixture.cases.length,3);
  for(const {state,songSha256} of fixture.cases){const before=structuredClone(state);assert.deepEqual(validate(state),{...state,version:VERSION});assert.equal(createHash('sha256').update(JSON.stringify(canonical(songJSON(state)))).digest('hex'),songSha256);assert.deepEqual(state,before);}
});
test('all integer lengths 1–32 round-trip as single onsets across at most three bars for melody and bass',()=>{
  for(const track of [0,2])for(let duration=1;duration<=32;duration++){const s=hold(track,15,duration);assert.equal(phraseNotes(s,track,0).length,1);for(let at=15;at<15+duration;at++){const n=pitchedNoteAt(s,track,Math.floor(at/16),at%16);assert.equal(n.start,15);assert.equal(n.duration,duration);assert.equal(n.pitch,4);}assert.equal(pitchedNoteAt(s,track,Math.floor((15+duration)/16),(15+duration)%16),null);assert.deepEqual(decode(encode(s)),s);assert.deepEqual(parseBackup(JSON.stringify(s)),s);}
});
test('old schemas still reject cross-bar data and over-eight lengths instead of silently accepting new semantics',()=>{
  for(const version of [3,7,8,9,10,11])for(const duration of [8,16,32]){const s=hold(0,15,duration);s.version=version;assert.throws(()=>validate(s));}
});
test('overlaps in continuation bars, rest metadata and section overflow are rejected atomically',()=>{
  const s=hold(),before=structuredClone(s);
  for(const mutate of [x=>x.tracks[0].bars[1][1]=5,x=>x.tracks[0].durations[1][1]=2,x=>x.tracks[0].velocities[1][1]=0,x=>x.tracks[0].durations[0][12]=33]){const bad=structuredClone(s);mutate(bad);assert.throws(()=>validate(bad));}
  for(const [step,duration] of [[63,2],[48,32],[0,33]])assert.throws(()=>editPhrase(s,2,0,[],{type:'insert',step,pitch:0,duration,velocity:1}));assert.deepEqual(s,before);
});
test('single-bar insertion shortens incoming holds at the new onset and later onsets limit new notes across bars',()=>{
  const s=hold(),next=setPitchedNote(s,0,1,4,2,32,0);assert.equal(next.state.tracks[0].durations[0][12],8);assert.equal(next.duration,32);assert.equal(next.state.tracks[0].velocities[0][12],2);assert.equal(next.state.tracks[0].velocities[1][4],0);
  const shorter=setPitchedNote(next.state,0,0,12,4,32);assert.equal(shorter.duration,8);assert.equal(shorter.limited,true);assert.equal(setPitchedNote(blank(),0,3,12,2,32).duration,4);assert.deepEqual(validate(shorter.state),shorter.state);
});
test('continuation selection updates velocity and deletes the complete original note including canonical rests',()=>{
  for(const track of [0,2]){const s=hold(track),next=setNoteVelocity(s,track,2,5,0);assert.equal(next.tracks[track].velocities[0][12],0);const removed=removePitchedNote(next,track,1,6);assert.deepEqual(removed,validate(blank('跨小节')));assert.equal(s.tracks[track].velocities[0][12],2);}
});
test('clear-bar removes entire intersecting long notes and leaves unrelated notes in adjacent bars intact',()=>{
  let s=hold();s=setPitchedNote(s,0,3,0,7,8).state;const next=clearBar(s,0,1);assert.equal(phraseNotes(next,0,0).length,1);assert.equal(phraseNotes(next,0,0)[0].step,48);assert.equal(phraseNotes(s,0,0).length,2);assert.deepEqual(validate(next),next);
});
test('bar copy snapshots incoming audible fragments, clips at destination and removes touching destination holds',()=>{
  let s=hold();const next=copyBar(s,0,1,3);assert.deepEqual(phraseNotes(next,0,0).map(n=>[n.step,n.duration]),[[12,32],[48,16]]);assert.equal(next.tracks[0].velocities[3][0],2);
  const self=copyBar(s,0,1,1);assert.deepEqual(phraseNotes(self,0,0).map(n=>[n.step,n.duration]),[[16,16]]);assert.deepEqual(validate(self),self);assert.deepEqual(phraseNotes(s,0,0).map(n=>[n.step,n.duration]),[[12,32]]);
});
test('join only connects selected adjacent equal-pitch equal-velocity notes and split restores separate bar attacks',()=>{
  let s=hold(0,0,16);s=editPhrase(s,0,0,[],{type:'insert',step:16,pitch:4,duration:16,velocity:2}).state;
  assert.equal(songJSON(s).channels[0].patterns[1].notes[0].continuesLastPattern,undefined);
  const joined=editPhrase(s,0,0,[16,0],{type:'join'});assert.deepEqual(joined.selection,[0]);assert.equal(phraseNotes(joined.state,0,0)[0].duration,32);assert.equal(songJSON(joined.state).channels[0].patterns[1].notes[0].continuesLastPattern,true);
  assert.deepEqual(editPhrase(joined.state,0,0,[0],{type:'split'}).state,s);
  for(const bad of [setNoteVelocity(s,0,1,0,0),editPhrase(s,0,0,[16],{type:'move',steps:0,semitones:1}).state,editPhrase(s,0,0,[16],{type:'move',steps:1,semitones:0}).state])assert.throws(()=>editPhrase(bad,0,0,[0,...phraseNotes(bad,0,0).slice(1).map(n=>n.step)],{type:'join'}));
  assert.throws(()=>editPhrase(s,0,0,[0],{type:'join'}));
});
test('joining beyond two bars rejects all notes and keeps exact originals',()=>{
  let s=hold(0,0,32);s=editPhrase(s,0,0,[],{type:'insert',step:32,pitch:4,duration:16,velocity:2}).state;const before=structuredClone(s);assert.throws(()=>editPhrase(s,0,0,[0,32],{type:'join'}));assert.deepEqual(s,before);
});
test('cross-bar notes move, resize, copy, paste and rectangle-select as one object with complete rejection at the section end',()=>{
  const s=hold(),clip=copyPhrase(s,0,0,[12]);assert.equal(clip.notes[0].duration,32);const moved=editPhrase(s,0,0,[12],{type:'move',steps:4,semitones:0});assert.deepEqual(moved.selection,[16]);assert.equal(phraseNotes(moved.state,0,0)[0].duration,32);assert.deepEqual(phraseRectangle(phraseNotes(s,0,0),{step:32,pitch:0},{step:40,pitch:24}),[12]);
  assert.throws(()=>editPhrase(s,0,0,[12],{type:'length',duration:33}));assert.throws(()=>pastePhrase(blank(),2,0,40,clip));assert.equal(phraseNotes(pastePhrase(blank(),2,0,20,clip).state,2,0)[0].duration,32);assert.deepEqual(editPhrase(editPhrase(s,0,0,[12],{type:'resize',delta:-4}).state,0,0,[12],{type:'resize',delta:4}).state,s);
});
test('section copy, insert, reorder, delete and song resize keep cross-bar holds independent and within their section',()=>{
  const s=hold(),grown=resize(s,8,'repeat');assert.deepEqual(phraseNotes(grown,0,4),phraseNotes(s,0,0));assert.deepEqual(resize(grown,4),s);
  const copied=copyGroup(resize(s,8),0,4);assert.deepEqual(phraseNotes(copied,0,4),phraseNotes(s,0,0));const duplicate=insertSection(s,0,true);assert.deepEqual(phraseNotes(duplicate,0,4),phraseNotes(s,0,0));assert.deepEqual(validate(moveSection(duplicate,0,1)),moveSection(duplicate,0,1));assert.equal(deleteSection(duplicate,0).barCount,4);
});
test('incoming sustained chromatic pitches remain visible and range queries include their audible bodies',()=>{
  const s=editPhrase(hold(),0,0,[12],{type:'move',steps:0,semitones:-8}).state;assert.ok(pitchRows(s,0,1).some(r=>r.id===pitchId(1)&&r.outside));assert.equal(rangeHasNotes(s,1,2),true);assert.equal(hasAudibleNotes(s,1,2,[0]),true);assert.equal(rangeHasNotes(s,3,4),false);
});
test('one-bar octave moves affect intersecting whole notes while answer generation refuses to overwrite a preserved incoming hold',()=>{
  const s=hold(),next=shiftOctave(s,0,1,1,1);assert.equal(next.tracks[0].bars[0][12],pitchId(21));assert.equal(next.tracks[0].durations[0][12],32);assert.throws(()=>generateMelody(s,0,{mode:'answer'}),/长音延入/);const split=editPhrase(s,0,0,[12],{type:'split'}).state;assert.doesNotThrow(()=>generateMelody(split,0,{mode:'answer'}));assert.deepEqual(generateMelody(s,0,{mode:'repitch'}).tracks[0].durations,s.tracks[0].durations);
});
test('cross-bar synth PCM equals an independently unbroken single note for every melody and bass voice at both device rates',()=>{
  const random=Math.random;
  try{for(const [track,voices] of [[0,VOICES],[2,BASS_VOICES]])for(const {id} of voices)for(const rate of [44100,48000]){
    const s=hold(track);s.tempo=120;s[track===0?'voice':'bassVoice']=id;
    const json=songJSON(s),ref=structuredClone(json);ref.beatsPerBar=16;ref.loopBars=1;
    ref.channels.forEach((c,i)=>{c.sequence=[1];c.patterns=[{notes:i===track?[{...json.channels[i].patterns[0].notes[0],points:json.channels[i].patterns[0].notes[0].points.map((p,j)=>({...p,tick:j?44:12}))}]:[]}];});
    raw(json,rate,rate*8);raw(ref,rate,rate*8);Math.random=seed();const a=raw(json,rate,rate*8);Math.random=seed();const b=raw(ref,rate,rate*8);equalAudio(a.left,b.left);equalAudio(a.right,b.right);
  }}finally{Math.random=random;}
});
test('clicking onset or any continuation auditions the complete held note, matching independently sequenced audio',()=>{
  const random=Math.random;
  try{for(const [track,id] of [[0,'triangle'],[0,'piano-v1'],[0,'electric-piano-v1'],[2,'bass-soft-v1'],[2,'bass-pluck-v1']])for(const rate of [44100,48000]){
    const s=hold(track);s.tempo=120;s[track===0?'voice':'bassVoice']=id;const json=songJSON(s),first=json.channels[track].patterns[0].notes[0];
    const ref={...json,beatsPerBar:12,loopBars:1,channels:[{...json.channels[track],sequence:[1],patterns:[{notes:[{...first,points:first.points.map((p,i)=>({...p,tick:i?32:0}))}]}]}]};
    const count=Math.ceil((4+(track===0?releaseSeconds(id,120):bassReleaseSeconds(id,120)))*rate);
    raw(ref,rate,count);Math.random=seed();const expected=raw(ref,rate,count);if(id!=='triangle')fadeEnd(expected.left,expected.right,Math.ceil(rate*.02));
    for(const pos of [{bar:0,step:12,pitch:4},{bar:1,step:6,pitch:4},{bar:2,step:10,pitch:4}]){Math.random=seed();const actual=renderPreview(s,track,0,rate,pos);equalAudio(actual.left,expected.left);equalAudio(actual.right,expected.right);}
  }}finally{Math.random=random;}
});
test('independent repeated notes keep their attacks, with no tie across sections or song loops',()=>{
  let s=hold(0,0,16);s=editPhrase(s,0,0,[],{type:'insert',step:16,pitch:4,duration:16,velocity:2}).state;const patterns=songJSON(s).channels[0].patterns;assert.equal(patterns[1].notes[0].continuesLastPattern,undefined);const repeated=resize(hold(0,32,32),8,'repeat'),json=songJSON(repeated);assert.ok(json.channels[0].patterns[3].notes[0].continuesLastPattern);assert.equal(json.channels[0].patterns[4].notes.length,0);assert.equal(json.channels[0].patterns[0].notes.length,0);
});
test('original sustain examples fit 32-bar Unicode backups and exports retain last held note in WAV and independently decoded MP3',async()=>{
  for(const id of ['hold-dawn','hold-tide']){const s=preset(id);assert.equal(s.barCount,16);assert.ok(phraseNotes(s,0,0).some(n=>n.step%16+n.duration>16));assert.ok(phraseNotes(s,2,0).some(n=>n.duration>16));assert.deepEqual(validate(sectionState(s,4)),sectionState(s,4));}
  const s=resize(preset('hold-tide'),32,'repeat');s.tempo=180;s.title='延音🌱'.repeat(12);s.sections.forEach(p=>{p.name='段落🌱'.repeat(6);p.enabled=[true,true,true,true];});assert.ok(Buffer.byteLength(JSON.stringify(s,null,2))<MAX_BACKUP_BYTES);assert.ok(encode(s).length<20000);assert.deepEqual(decode(encode(s)),s);
  const r=await render(s),loop=await render(s,'loop');assert.equal(loop.outputSamplesL.length,Math.ceil(32*240/180*44100));assert.ok(r.outputSamplesL.every(n=>Number.isFinite(n)&&Math.abs(n)<1));assert.ok(rms(r.outputSamplesL.subarray(-44100))>.0001);const wav=new DataView(wavBuffer(r.outputSamplesL,r.outputSamplesR,44100));assert.equal(wav.getUint32(40,true),r.outputSamplesL.length*4);
  const decoder=new MPEGDecoder();await decoder.ready;try{const decoded=decoder.decode(encodeMp3(r.outputSamplesL,r.outputSamplesR,Mp3Encoder));assert.deepEqual(decoded.errors,[]);assert.equal(decoded.channelData.length,2);assert.ok(decoded.samplesDecoded>=r.outputSamplesL.length&&decoded.samplesDecoded-r.outputSamplesL.length<2304);assert.ok(rms(decoded.channelData[0].subarray(-44100))>.0001);}finally{decoder.free();}
});
