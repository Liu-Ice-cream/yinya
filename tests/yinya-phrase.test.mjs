import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {blank,preset,validate,resize,setPitchedNote,removePitchedNote,encode,decode,parseBackup,songJSON,wavBuffer,MAX_BACKUP_BYTES} from '../yinya/model.js';
import {phraseNotes,editPhrase,copyPhrase,pastePhrase,phraseRectangle} from '../yinya/phrase.js';
import {PITCH_VALUES,pitchId} from '../yinya/theory.js';
import {encodeMp3} from '../yinya/mp3.js';
import {Mp3Encoder} from '../website/yinya/vendor/lamejs.js';
import {MPEGDecoder} from 'mpg123-decoder';
await build({stdin:{contents:'export {AudioRenderer,sectionState} from "./yinya/render.js"; export {PreviewPlayer} from "./yinya/preview.js";',resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',outfile:'build/yinya-phrase-test.mjs'});
const {AudioRenderer,sectionState,PreviewPlayer}=await import('../build/yinya-phrase-test.mjs');
globalThis.requestAnimationFrame=cb=>setImmediate(cb);
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const rms=a=>Math.sqrt(a.reduce((n,x)=>n+x*x,0)/a.length);
const seeded=()=>{let n=37123;return()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return(n+.5)/2**32;};};
const difference=(a,b)=>{assert.equal(a.length,b.length);let max=0;for(let i=0;i<a.length;i++)max=Math.max(max,Math.abs(a[i]-b[i]));return max;};
async function render(s,rate=44100,ending='natural'){const r=new AudioRenderer();for await(const _ of r.generate(s,rate,ending)){}return r;}
function source(track=0,start=4){let s=resize(preset('orchestra-day'),32,'repeat');for(let bar=start;bar<start+4;bar++)for(const field of ['bars','durations','velocities'])s.tracks[track][field][bar].fill(field==='bars'?-1:1);for(const [offset,pitch,length,level] of [[0,4,2,0],[8,7,4,2],[16,5,3,1],[28,2,2,0],[40,7,2,1],[56,4,4,2]])s=setPitchedNote(s,track,start+Math.floor(offset/16),offset%16,pitch,4,level).state;return s;}
function protect(before,after,track,start){assert.deepEqual(after.sections,before.sections);assert.deepEqual(after.tracks.filter((_,i)=>i!==track),before.tracks.filter((_,i)=>i!==track));for(const field of ['bars','durations','velocities']){assert.deepEqual(after.tracks[track][field].slice(0,start),before.tracks[track][field].slice(0,start));assert.deepEqual(after.tracks[track][field].slice(start+4),before.tracks[track][field].slice(start+4));}for(const key of ['version','title','tempo','voice','chordVoice','bassVoice','chordStyle','scale','transpose','barCount'])assert.deepEqual(after[key],before[key]);}
function context(){const sources=[],buffers=[];return {sources,buffers,sampleRate:44100,currentTime:0,destination:{},resume:()=>Promise.resolve(),close:()=>Promise.resolve(),createBuffer(c,n,r){const b={duration:n/r,samples:[],copyToChannel(a,i){this.samples[i]=a;}};buffers.push(b);return b;},createBufferSource(){const s={connect(){},disconnect(){},start(){},stop(){s.stopped=true;}};sources.push(s);return s;},createGain(){return {connect(){},disconnect(){},gain:{setValueAtTime(){},linearRampToValueAtTime(){}}};}};}

test('phrase extraction returns independent sorted onset, pitch, duration and velocity data for melody and bass only',()=>{
  for(const track of [0,2]){const s=source(track),before=structuredClone(s),notes=phraseNotes(s,track,4);assert.deepEqual(notes.map(n=>n.step),[0,8,16,28,40,56]);assert.equal(notes[0].velocity,0);notes[0].pitch=0;assert.deepEqual(s,before);}
  for(const [track,start] of [[1,0],[3,0],[0,1],[2,-4],[0,32],[0,2.5]])assert.throws(()=>phraseNotes(source(),track,start));
});
test('horizontal and chromatic group moves preserve all backing, orchestration, settings and out-of-section notes',()=>{
  for(const track of [0,2])for(const start of [0,4,12,28]){const s=source(track,start),before=structuredClone(s),a=editPhrase(s,track,start,[0,8],{type:'move',steps:2,semitones:1});protect(s,a.state,track,start);assert.deepEqual(a.selection,[2,10]);assert.equal(phraseNotes(a.state,track,start)[0].pitch,pitchId(PITCH_VALUES[4]+1));assert.deepEqual(s,before);}
});
test('moving whole sparse motifs into another bar retains relative timing, note length and individual dynamics',()=>{
  let s=blank();s=setPitchedNote(s,0,0,0,2,2,0).state;s=setPitchedNote(s,0,0,8,4,4,2).state;const result=editPhrase(s,0,0,[0,8],{type:'move',steps:32,semitones:0});assert.deepEqual(phraseNotes(result.state,0,0),[{step:32,pitch:2,duration:2,velocity:0},{step:40,pitch:4,duration:4,velocity:2}]);assert.ok(result.state.tracks[0].bars[0].every(n=>n<0));
});
test('time collisions reject the complete edit even at a different pitch and never shorten or overwrite an existing note',()=>{
  const s=source(),before=structuredClone(s);for(const action of [{type:'move',steps:5,semitones:3},{type:'resize',delta:5},{type:'insert',step:1,pitch:0,duration:2,velocity:1}])assert.throws(()=>editPhrase(s,0,4,[0],action),/重叠|时长/);assert.deepEqual(s,before);assert.equal(phraseNotes(s,0,4)[0].duration,4);
});
test('section and bar boundaries reject negative starts, past-end placement and cross-bar durations atomically',()=>{
  const s=source(),before=structuredClone(s);for(const [steps,action] of [[[0],{type:'move',steps:-1,semitones:0}],[[56],{type:'move',steps:8,semitones:0}],[[28],{type:'move',steps:1,semitones:0}],[[28],{type:'resize',delta:1}]])assert.throws(()=>editPhrase(s,0,4,steps,action));assert.deepEqual(s,before);
});
test('chromatic moves use stable semitone IDs once and keep global transposition and scale unchanged',()=>{
  for(const shift of [-12,0,12])for(const scale of ['pentatonic','major','minor']){const s=source();s.transpose=shift;s.scale=scale;const next=editPhrase(s,0,4,[0],{type:'move',steps:0,semitones:1}).state;assert.equal(PITCH_VALUES[phraseNotes(next,0,4)[0].pitch],PITCH_VALUES[4]+1);assert.equal(next.transpose,shift);assert.equal(next.scale,scale);}
  let s=setPitchedNote(blank(),0,0,0,24,4).state;assert.throws(()=>editPhrase(s,0,0,[0],{type:'move',steps:0,semitones:1}));s=setPitchedNote(blank(),0,0,0,0,4).state;assert.throws(()=>editPhrase(s,0,0,[0],{type:'move',steps:0,semitones:-1}));
});
test('length edits support every integer duration from one to eight without moving note starts or changing velocity',()=>{
  for(let length=1;length<=8;length++){const s=setPitchedNote(blank(),0,0,0,4,4,2).state,next=editPhrase(s,0,0,[0],{type:'resize',delta:length-4}).state;assert.deepEqual(phraseNotes(next,0,0),[{step:0,pitch:4,duration:length,velocity:2}]);}
  const s=setPitchedNote(blank(),0,0,0,4,4).state;for(const delta of [-4,5,8,.5])assert.throws(()=>editPhrase(s,0,0,[0],{type:'resize',delta}));
});
test('one invalid note prevents an otherwise valid group resize or pitch move from partially applying',()=>{
  let s=blank();s=setPitchedNote(s,0,0,0,2,2).state;s=setPitchedNote(s,0,1,12,24,4).state;const before=structuredClone(s);assert.throws(()=>editPhrase(s,0,0,[0,28],{type:'resize',delta:1}));assert.throws(()=>editPhrase(s,0,0,[0,28],{type:'move',steps:0,semitones:1}));assert.deepEqual(s,before);
});
test('batch velocity affects only chosen notes while rests, durations, pitches and every other track stay exact',()=>{
  const s=source();for(const level of [0,1,2]){const next=editPhrase(s,0,4,[0,8],{type:'velocity',level}).state;assert.deepEqual(next.tracks[0].bars,s.tracks[0].bars);assert.deepEqual(next.tracks[0].durations,s.tracks[0].durations);assert.deepEqual(phraseNotes(next,0,4).slice(0,2).map(n=>n.velocity),[level,level]);assert.deepEqual(phraseNotes(next,0,4).slice(2),phraseNotes(s,0,4).slice(2));protect(s,next,0,4);}
});
test('batch delete removes entire held notes and resets their rest duration and velocity canonically',()=>{
  const s=source(),next=editPhrase(s,0,4,[0,8],{type:'delete'});assert.deepEqual(next.selection,[]);assert.deepEqual(phraseNotes(next.state,0,4).map(n=>n.step),[16,28,40,56]);for(const step of [0,8]){assert.equal(next.state.tracks[0].bars[4][step],-1);assert.equal(next.state.tracks[0].durations[4][step],1);assert.equal(next.state.tracks[0].velocities[4][step],1);}protect(s,next.state,0,4);
});
test('strict new-note insertion preserves the chosen duration or fails without truncating adjacent notes',()=>{
  const s=source(),next=editPhrase(s,0,4,[],{type:'insert',step:4,pitch:8,duration:3,velocity:0});assert.deepEqual(next.selection,[4]);assert.deepEqual(phraseNotes(next.state,0,4).find(n=>n.step===4),{step:4,pitch:8,duration:3,velocity:0});for(const step of [5,7,15,64])assert.throws(()=>editPhrase(s,0,4,[],{type:'insert',step,pitch:8,duration:4,velocity:1}));protect(s,next.state,0,4);
});
test('copy normalizes to the first selected onset, keeps gaps and dynamics, and owns an independent local clipboard',()=>{
  const s=source(),before=structuredClone(s),clip=copyPhrase(s,0,4,[28,8]);assert.deepEqual(clip.notes.map(n=>n.offset),[0,20]);assert.deepEqual(clip.notes.map(n=>n.velocity),[2,0]);clip.notes[0].pitch=0;assert.deepEqual(s,before);
});
test('pasting between melody and bass preserves absolute relative pitch IDs, rhythm and local destination orchestration',()=>{
  const s=source(),clip=copyPhrase(s,0,4,[0,8]);let destination=structuredClone(s);for(const field of ['bars','durations','velocities'])for(let bar=8;bar<12;bar++)destination.tracks[2][field][bar].fill(field==='bars'?-1:1);
  const next=pastePhrase(destination,2,8,32,clip);assert.deepEqual(next.selection,[32,40]);assert.deepEqual(phraseNotes(next.state,2,8).map(n=>[n.step,n.pitch,n.duration,n.velocity]),clip.notes.map(n=>[32+n.offset,n.pitch,n.duration,n.velocity]));protect(destination,next.state,2,8);assert.deepEqual(clip,copyPhrase(s,0,4,[0,8]));
});
test('malformed clipboard data and conflicting or overflowing paste are rejected without touching either source',()=>{
  const s=source(),before=structuredClone(s),clip=copyPhrase(s,0,4,[0,8]),original=structuredClone(clip);assert.throws(()=>pastePhrase(s,0,4,0,clip));assert.throws(()=>pastePhrase(s,0,4,60,clip));
  for(const bad of [null,{}, {...clip,version:2},{version:1,notes:[]},{version:1,notes:[{...clip.notes[0],offset:1}]},{version:1,notes:[{...clip.notes[0],offset:-1}]},{version:1,notes:[{...clip.notes[0],duration:9}]},{version:1,notes:[{...clip.notes[0],pitch:99}]},{version:1,notes:[clip.notes[0],clip.notes[0]]},{version:1,notes:Array(65).fill(clip.notes[0])}])assert.throws(()=>pastePhrase(blank(),0,0,0,bad));assert.deepEqual(s,before);assert.deepEqual(clip,original);
});
test('rectangle selection intersects sustained note bodies using actual semitones rather than stable ID ordering',()=>{
  const notes=[{step:0,pitch:8,duration:8},{step:12,pitch:0,duration:2},{step:20,pitch:24,duration:4}];assert.deepEqual(phraseRectangle(notes,{step:4,pitch:0},{step:7,pitch:2}),[0]);assert.deepEqual(phraseRectangle(notes,{step:7,pitch:2},{step:4,pitch:0}),[0]);assert.deepEqual(phraseRectangle(notes,{step:8,pitch:0},{step:11,pitch:24}),[]);assert.throws(()=>phraseRectangle(notes,null,{}));
});
test('stale, duplicate, empty and malformed selections and actions fail atomically with usable validation',()=>{
  const s=source(),before=structuredClone(s);for(const steps of [[],[0,0],[1],[undefined],['0'],Array(1),null])assert.throws(()=>editPhrase(s,0,4,steps,{type:'delete'}));for(const action of [null,[],{type:'x'},{type:'move',steps:1,semitones:NaN},{type:'move',steps:.5,semitones:0},{type:'move',steps:64,semitones:0},{type:'velocity',level:3}])assert.throws(()=>editPhrase(s,0,4,[0],action));assert.deepEqual(s,before);
});
test('published v0.12.0 orchestration fixtures retain exact schema and canonical audio conversion without any migration',async()=>{
  const fixture=JSON.parse(await readFile(new URL('./fixtures/yinya-v0120-compat.json',import.meta.url)));assert.equal(fixture.cases.length,3);for(const {state,songSha256} of fixture.cases){assert.deepEqual(validate(state),state);assert.equal(createHash('sha256').update(JSON.stringify(canonical(songJSON(state)))).digest('hex'),songSha256);}
});
test('long sequences of attempted edits stay monophonic, in bounds and within the chosen phrase while every rejection is atomic',()=>{
  let s=source(2),random=seeded();const original=structuredClone(s);for(let i=0;i<200;i++){const notes=phraseNotes(s,2,4),chosen=notes[Math.floor(random()*notes.length)],before=structuredClone(s),action=i%3===0?{type:'resize',delta:random()<.5?-1:1}:i%3===1?{type:'move',steps:random()<.5?-1:1,semitones:0}:{type:'move',steps:0,semitones:random()<.5?-1:1};try{s=editPhrase(s,2,4,[chosen.step],action).state;assert.deepEqual(validate(s),s);protect(original,s,2,4);}catch{assert.deepEqual(s,before);}}
});
test('inverse moves and resizes restore exact data and paste followed by deleting its selection restores every original rest',()=>{
  const s=source(),a=editPhrase(s,0,4,[0,8],{type:'move',steps:1,semitones:1}),b=editPhrase(a.state,0,4,a.selection,{type:'move',steps:-1,semitones:-1});assert.deepEqual(b.state,s);const r=editPhrase(s,0,4,[0],{type:'resize',delta:-1});assert.deepEqual(editPhrase(r.state,0,4,r.selection,{type:'resize',delta:1}).state,s);const clipboard=copyPhrase(s,0,4,[0]),p=pastePhrase(s,0,4,36,clipboard);assert.deepEqual(editPhrase(p.state,0,4,p.selection,{type:'delete'}).state,s);
});
test('edited maximum-length Unicode projects share and back up as unchanged schema eleven within the existing bounds',()=>{
  let s=source();for(let start=0;start<32;start+=4){const notes=phraseNotes(s,0,start);if(notes.length)s=editPhrase(s,0,start,notes.map(n=>n.step),{type:'velocity',level:0}).state;}s.title='音芽🌱'.repeat(10);s.sections.forEach(p=>p.name='段落🌱'.repeat(6));assert.equal(s.version,11);assert.ok(Buffer.byteLength(JSON.stringify(s,null,2))<MAX_BACKUP_BYTES);assert.ok(encode(s).length<20000);assert.deepEqual(decode(encode(s)),s);assert.deepEqual(parseBackup(JSON.stringify(s,null,2)),s);
});
test('atomic phrase edits synthesize the same stereo PCM as independently editing ordinary notes with the existing model',async()=>{
  const s=source(),edited=editPhrase(s,0,4,[0],{type:'move',steps:2,semitones:1}).state;let expected=removePitchedNote(s,0,4,0);expected=setPitchedNote(expected,0,4,2,pitchId(PITCH_VALUES[4]+1),4,0).state;assert.deepEqual(edited,expected);
  for(const rate of [44100,48000]){await render(sectionState(s,4),rate);const random=Math.random;try{Math.random=seeded();const a=await render(sectionState(edited,4),rate);Math.random=seeded();const b=await render(sectionState(expected,4),rate);assert.ok(difference(a.outputSamplesL,b.outputSamplesL)<1e-6);assert.ok(difference(a.outputSamplesR,b.outputSamplesR)<1e-6);}finally{Math.random=random;}}
});
test('auditions snapshot edited notes and cancellation prevents stale audio without changing original clipboard or source',async()=>{
  const s=source(),clip=copyPhrase(s,0,4,[0,8]),before=structuredClone(s),next=editPhrase(s,0,4,[0,8],{type:'velocity',level:0}).state,audio=context(),ready=[];audio.resume=()=>new Promise(r=>ready.push(r));const p=new PreviewPlayer(()=>audio),a=p.playSection(s,4),b=p.playSection(next,4);ready.forEach(r=>r());assert.deepEqual(await Promise.all([a,b]),[false,true]);const pending=p.playSection(next,4);p.stop();ready.at(-1)();assert.equal(await pending,false);assert.equal(audio.sources.length,1);p.dispose();assert.deepEqual(s,before);assert.deepEqual(clip,copyPhrase(s,0,4,[0,8]));
});
test('edited 32-bar mixed orchestration exports finite WAV and independently decoded stereo MP3 with correct timing and cancellation',async()=>{
  let s=resize(preset('orchestra-day'),32,'repeat');s.tempo=180;s=editPhrase(s,0,28,phraseNotes(s,0,28).map(n=>n.step),{type:'velocity',level:2}).state;const r=await render(s),loop=await render(s,44100,'loop');assert.ok(r.outputSamplesL.every(n=>Number.isFinite(n)&&Math.abs(n)<1));assert.equal(loop.outputSamplesL.length,Math.ceil(32*240/180*44100));const wav=new DataView(wavBuffer(r.outputSamplesL,r.outputSamplesR,44100));assert.equal(wav.getUint32(40,true),r.outputSamplesL.length*4);const decoder=new MPEGDecoder();await decoder.ready;try{const decoded=decoder.decode(encodeMp3(r.outputSamplesL,r.outputSamplesR,Mp3Encoder));assert.deepEqual(decoded.errors,[]);assert.equal(decoded.channelData.length,2);assert.ok(decoded.samplesDecoded>=r.outputSamplesL.length&&decoded.samplesDecoded-r.outputSamplesL.length<2304);assert.ok(rms(decoded.channelData[0].subarray(-44100))>.0001);}finally{decoder.free();}const canceled=new AudioRenderer();for await(const _ of canceled.generate(s)){canceled.canceled=true;}assert.equal(canceled.outputSamplesL,null);
});
test('audition position starts at actual audio start rather than preparation and disappears after stop',async()=>{
  const audio=context(),p=new PreviewPlayer(()=>audio);assert.equal(p.elapsedSeconds(),null);audio.currentTime=12;assert.equal(await p.playSection(source(),4),true);assert.equal(p.elapsedSeconds(),0);audio.currentTime=13.25;assert.equal(p.elapsedSeconds(),1.25);p.stop();assert.equal(p.elapsedSeconds(),null);p.dispose();
});
