import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {blank,preset,validate,songJSON,setPitchedNote,setSectionVoice,setSectionVolume,resetSectionOrchestration,sectionVoice,sectionGain,trackAudibleAt,hasAudibleNotes,rangeHasNotes,resize,copyGroup,insertSection,moveSection,deleteSection,encode,decode,parseBackup,MAX_BACKUP_BYTES,wavBuffer} from '../yinya/model.js';
import {VOICES,CHORD_VOICES,BASS_VOICES} from '../yinya/voices.js';
import {generateMelody} from '../yinya/melody.js';
import {generateAccompaniment} from '../yinya/accompaniment.js';
import {encodeMp3} from '../yinya/mp3.js';
import {Mp3Encoder} from '../website/yinya/vendor/lamejs.js';
import {MPEGDecoder} from 'mpg123-decoder';
await build({stdin:{contents:'export {AudioRenderer,sectionState,phraseState} from "./yinya/render.js"; export {renderPreview,PreviewPlayer} from "./yinya/preview.js"; export {audioSong} from "./yinya/song.js"; export {Synth} from "./synth/synth.ts";',resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',outfile:'build/yinya-orchestration-test.mjs'});
const {AudioRenderer,sectionState,phraseState,renderPreview,PreviewPlayer,audioSong,Synth}=await import('../build/yinya-orchestration-test.mjs');
globalThis.requestAnimationFrame=callback=>setImmediate(callback);
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const rms=a=>Math.sqrt(a.reduce((n,v)=>n+v*v,0)/a.length);
const difference=(a,b)=>{assert.equal(a.length,b.length);let max=0;for(let i=0;i<a.length;i++)max=Math.max(max,Math.abs(a[i]-b[i]));return max;};
const seeded=()=>{let n=71327;return()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return(n+.5)/2**32;};};
async function render(s,rate=44100,ending='natural'){const r=new AudioRenderer();for await(const _ of r.generate(s,rate,ending)){}return r;}
function collapse(s,bar){const ref=structuredClone(s);for(let i=0;i<3;i++){ref[['voice','chordVoice','bassVoice'][i]]=sectionVoice(s,i,bar);ref.sections.forEach(p=>p.voices[i]='inherit');}return ref;}
function synthesize(s,bar,rate=44100){const song=audioSong(songJSON(s));s.tracks.forEach((t,i)=>{song.channels[i].muted=!t.enabled||t.volume===0;});const synth=new Synth(song);synth.samplesPerSecond=rate;synth.playhead=bar;const left=new Float32Array(rate),right=new Float32Array(rate);synth.synthesize(left,right,rate,true);return {left,right};}
function context(){const sources=[],buffers=[];return {sources,buffers,sampleRate:44100,currentTime:0,destination:{},resume:()=>Promise.resolve(),close:()=>Promise.resolve(),createBuffer(c,n,r){const b={duration:n/r,samples:[],copyToChannel(a,i){this.samples[i]=a;}};buffers.push(b);return b;},createBufferSource(){const s={connect(){},disconnect(){},start(){},stop(){s.stopped=true;}};sources.push(s);return s;},createGain(){return {connect(){},disconnect(){},gain:{setValueAtTime(){},linearRampToValueAtTime(){}}};}};}

test('published v0.11.0 melody projects migrate by adding inherited voices and unity section levels with byte-identical canonical audio',async()=>{
  const fixture=JSON.parse(await readFile(new URL('./fixtures/yinya-v0110-compat.json',import.meta.url)));assert.equal(fixture.cases.length,3);
  for(const {state,songSha256} of fixture.cases){const before=structuredClone(state),next=validate(state);assert.equal(next.version,14);assert.deepEqual(next.tracks,state.tracks.map((t,i)=>i===3?{...t,drumVelocities:t.bars.map(()=>Array(16).fill(13))}:t));assert.ok(next.sections.every(p=>p.voices.every(id=>id==='inherit')&&p.volumes.every(n=>n===100)));assert.equal(createHash('sha256').update(JSON.stringify(canonical(songJSON(next)))).digest('hex'),songSha256);assert.deepEqual(state,before);}
});
test('schema eleven rejects missing, sparse, cross-track and unknown voices and malformed relative levels atomically',()=>{
  const s=preset('orchestra-day'),before=structuredClone(s);
  for(const change of [p=>delete p.voices,p=>p.voices=[],p=>p.voices=Array(3),p=>p.voices[0]='chord-piano-v1',p=>p.voices[1]='piano-v1',p=>p.voices[2]='future-v1',p=>delete p.volumes,p=>p.volumes=Array(4),p=>p.volumes=[100],p=>p.volumes[0]=-1,p=>p.volumes[1]=101,p=>p.volumes[2]=.5,p=>p.volumes[3]='50']){const bad=structuredClone(s);change(bad.sections[0]);assert.throws(()=>validate(bad));}assert.deepEqual(s,before);
});
test('local voice and level edits preserve notes, global controls and other sections; reset preserves masks and chord performance',()=>{
  const s=preset('tone-day'),before=structuredClone(s);let next=setSectionVoice(s,1,0,'acoustic-guitar-v1');next=setSectionVolume(next,1,3,35);
  assert.deepEqual(next.tracks,s.tracks);assert.deepEqual(next.sections.filter((_,i)=>i!==1),s.sections.filter((_,i)=>i!==1));for(const k of ['voice','chordVoice','bassVoice','chordStyle','tempo','scale','transpose'])assert.equal(next[k],s[k]);
  const reset=resetSectionOrchestration(next,1);assert.deepEqual(reset,s);assert.deepEqual(s,before);
  for(const fn of [()=>setSectionVoice(s,-1,0,'piano-v1'),()=>setSectionVoice(s,0,3,'inherit'),()=>setSectionVoice(s,0,0,'invalid'),()=>setSectionVolume(s,0,4,50),()=>setSectionVolume(s,0,0,101),()=>setSectionVolume(s,0,0,NaN),()=>resetSectionOrchestration(s,4)])assert.throws(fn);
});
test('global timbre changes affect only inherited sections including explicit choices equal to the old global voice',()=>{
  let s=preset('tone-day');s=setSectionVoice(s,1,0,s.voice);s.voice='square';assert.equal(sectionVoice(s,0,0),'square');assert.equal(sectionVoice(s,0,4),'piano-v1');s=setSectionVoice(s,1,0,'inherit');assert.equal(sectionVoice(s,0,4),'square');assert.equal(sectionGain(s,0,4),1);
});
test('all melody, chord and bass revisions select the correct parsed instrument at each section without layering',()=>{
  for(const [track,voices] of [VOICES,CHORD_VOICES,BASS_VOICES].entries()){
    let s=resize(preset('tone-day'),32,'repeat');s.sections.forEach((p,i)=>{p.voices[track]=voices[i%voices.length].id;});const json=songJSON(s),song=audioSong(json);assert.equal(song.patternInstruments,true);assert.equal(song.layeredInstruments,false);assert.equal(song.channels[track].instruments.length,voices.length);
    for(let bar=0;bar<32;bar++){const pattern=song.channels[track].patterns[bar];assert.equal(pattern.instruments.length,1);const actual=song.channels[track].instruments[pattern.instruments[0]].toJsonObject();const ref=audioSong(songJSON(collapse(s,bar))).channels[track].instruments[0].toJsonObject();assert.deepEqual(canonical(actual),canonical(ref));}
  }
});
test('per-section gains combine with note velocity and four-note chord calibration after parser quantization for all tracks',()=>{
  let s=preset('tone-day');s.sections.forEach(p=>{p.enabled.fill(true);p.volumes.fill(100);});s.tracks[1].bars[4]=[7,-1,7,-1];const full=audioSong(songJSON(s));for(let i=0;i<4;i++)s=setSectionVolume(s,1,i,[25,50,75,90][i]);const next=audioSong(songJSON(s));
  for(let i=0;i<4;i++)for(let bar=0;bar<16;bar++)for(let n=0;n<next.channels[i].patterns[bar].notes.length;n++){const a=next.channels[i].patterns[bar].notes[n],b=full.channels[i].patterns[bar].notes[n],gain=bar>=4&&bar<8?s.sections[1].volumes[i]/100:1;assert.deepEqual(a.pitches,b.pitches);a.pins.forEach((pin,k)=>assert.ok(Math.abs(pin.size-b.pins[k].size*gain**(2/3))<1e-12));}
});
test('section zero volume silences all four tracks while notes remain available and global mute cannot be overridden',async()=>{
  let s=preset('orchestra-day');for(let track=0;track<4;track++)s=setSectionVolume(s,1,track,0);assert.equal(hasAudibleNotes(s,4,8),false);assert.equal(rangeHasNotes(s,4,8),true);assert.ok(songJSON(s).channels.every(c=>c.patterns.slice(4,8).every(p=>p.notes.length===0)));
  const p=new PreviewPlayer(()=>{throw new Error('must not request audio');});assert.equal(await p.playSection(s,4),false);assert.equal(renderPreview(s,0,0,44100,{bar:4,step:0}),null);p.dispose();s.tracks[0].enabled=false;s=setSectionVolume(s,1,0,100);assert.equal(trackAudibleAt(s,0,4),false);
});
test('copy, duplication, repeat extension and moves retain independent orchestration while empty sections get inherited defaults',()=>{
  const s=preset('orchestra-day'),before=structuredClone(s),copied=copyGroup(s,4,8);assert.deepEqual(copied.sections[2].voices,s.sections[1].voices);assert.deepEqual(copied.sections[2].volumes,s.sections[1].volumes);assert.equal(copied.sections[2].name,s.sections[2].name);
  const dup=insertSection(s,1,true);assert.deepEqual(dup.sections[2].voices,s.sections[1].voices);assert.deepEqual(dup.sections[2].volumes,s.sections[1].volumes);dup.sections[2].voices[0]='square';dup.sections[2].volumes[0]=0;assert.deepEqual(s,before);
  assert.deepEqual(moveSection(moveSection(s,0,3),3,0),s);assert.deepEqual(deleteSection(insertSection(s,1,true),2),s);const repeated=resize(s,32,'repeat');assert.deepEqual(repeated.sections[4].voices,s.sections[0].voices);assert.deepEqual(repeated.sections[7].volumes,s.sections[3].volumes);const empty=insertSection(s,0).sections[1];assert.deepEqual(empty.voices,['inherit','inherit','inherit']);assert.deepEqual(empty.volumes,[100,100,100,100]);
});
test('melody and accompaniment workshops preserve every section timbre and relative level',()=>{
  const s=preset('orchestra-day');for(const mode of ['compose','answer','repitch']){const next=generateMelody(s,4,{mode});assert.deepEqual(next.sections,s.sections);}const next=generateAccompaniment(s,4,{mode:'ensemble',harmony:'style'});assert.deepEqual(next.sections.map(p=>[p.voices,p.volumes]),s.sections.map(p=>[p.voices,p.volumes]));
});
test('maximum Unicode 32-bar projects fit share and backup bounds and roundtrip all orchestration fields',()=>{
  const s=resize(preset('orchestra-night'),32,'repeat');s.title='音芽🌱'.repeat(10);s.sections.forEach(p=>p.name='段落🌱'.repeat(6));assert.ok(Buffer.byteLength(JSON.stringify(s,null,2))<MAX_BACKUP_BYTES);assert.ok(encode(s).length<20000);assert.deepEqual(decode(encode(s)),s);assert.deepEqual(parseBackup(JSON.stringify(s,null,2)),s);
});
test('two complete editable orchestration examples contain distinct four-part timbres, dynamics and tonal phrases',()=>{
  for(const id of ['orchestra-day','orchestra-night']){const s=preset(id);assert.equal(s.barCount,16);assert.deepEqual(validate(s),s);assert.equal(new Set(s.sections.map(p=>p.voices[0])).size,3);assert.ok(new Set(s.sections.map(p=>p.volumes.join())).size>=3);assert.ok(s.tracks.every(t=>t.bars.length===16));assert.equal(hasAudibleNotes(s,12,16),true);assert.ok(s.tracks[0].durations.flat().includes(8));}
});
test('clicked long notes and chords use the actual selected section instrument and gain rather than the channel first instrument',()=>{
  const s=preset('orchestra-night');s.sections.forEach(p=>p.enabled.fill(true));
  for(const track of [0,1,2])for(const rate of [44100,48000]){const pitch=track===1?s.tracks[1].bars[8][0]:s.tracks[track].bars[8][0],a=renderPreview(s,track,track===1?pitch:0,rate,{bar:8,step:0,...(track!==1?{pitch}:{})}),ref=collapse(s,8),b=renderPreview(ref,track,track===1?pitch:0,rate,{bar:8,step:0,...(track!==1?{pitch}:{})});assert.ok(rms(a.left)>.001);assert.ok(difference(a.left,b.left)<1e-6);assert.ok(difference(a.right,b.right)<1e-6);}
});
test('legacy live-input clicks select the local wave and scale relative volume without changing old click length',()=>{
  let s=resize(preset('sprout'),8,'repeat');s=setSectionVoice(s,1,0,'square');s=setSectionVolume(s,1,0,50);const a=renderPreview(s,0,2,44100,{bar:4}),b=renderPreview(collapse(s,4),0,2,44100,{bar:4});assert.equal(a.left.length,Math.ceil(.32*44100));assert.ok(difference(a.left,b.left)<1e-6);const louder=setSectionVolume(s,1,0,100),c=renderPreview(louder,0,2,44100,{bar:4});assert.ok(Math.abs(rms(a.left)/rms(c.left)-.5)<1e-6);
});
test('a full-song synth starting at each section matches its independent collapsed instrument reference at both sample rates',()=>{
  let s=preset('orchestra-day');s.sections.forEach(p=>p.enabled.fill(true));s.tracks[3].enabled=false;
  for(const bar of [0,4,8,12])for(const rate of [44100,48000]){synthesize(s,bar,rate);synthesize(collapse(s,bar),bar,rate);const random=Math.random;try{Math.random=seeded();const a=synthesize(s,bar,rate);Math.random=seeded();const b=synthesize(collapse(s,bar),bar,rate);assert.ok(difference(a.left,b.left)<1e-6);assert.ok(difference(a.right,b.right)<1e-6);}finally{Math.random=random;}}
});
test('section and duet snapshots retain local orchestration and four-track preview matches independently rendered section PCM',async()=>{
  const s=preset('orchestra-day'),before=structuredClone(s),part=sectionState(s,4),duet=phraseState(s,4,'duet');assert.deepEqual(part.sections,[s.sections[1]]);assert.deepEqual(duet.sections,part.sections);assert.equal(duet.tracks[2].enabled,false);const audio=context(),p=new PreviewPlayer(()=>audio),random=Math.random;await render(part);
  try{Math.random=seeded();assert.equal(await p.playSection(s,4),true);Math.random=seeded();const expected=await render(part);assert.ok(difference(audio.buffers[0].samples[0],expected.outputSamplesL)<1e-6);assert.ok(difference(audio.buffers[0].samples[1],expected.outputSamplesR)<1e-6);}finally{Math.random=random;p.dispose();}assert.deepEqual(s,before);
});
test('natural tail follows the last audible local instrument and ignores a different global or muted ending voice',async()=>{
  let s=blank('',8);s.voice='triangle';s=setPitchedNote(s,0,7,15,0,1).state;s=setSectionVoice(s,1,0,'piano-v1');const a=await render(s);assert.ok(a.tailSeconds>0);s.voice='piano-v1';s=setSectionVoice(s,1,0,'triangle');assert.equal((await render(s)).tailSeconds,0);s=setSectionVoice(s,1,0,'piano-v1');s=setSectionVolume(s,1,0,0);assert.equal((await render(s)).tailSeconds,0);
});
test('local instrument releases continue over a section boundary and do not create silence or duplicate attacks',async()=>{
  let s=blank('',8);s=setSectionVoice(s,0,0,'electric-piano-v1');s=setSectionVoice(s,1,0,'triangle');s=setPitchedNote(s,0,3,15,0,1).state;const r=await render(s);const boundary=Math.round(4*240/s.tempo*44100);assert.ok(rms(r.outputSamplesL.subarray(boundary,boundary+2000))>.0001);assert.ok(r.outputSamplesL.subarray(boundary+44100).every(n=>Math.abs(n)<.0001));assert.equal(r.tailSeconds,0);
});
test('latest audition keeps its orchestration snapshot and stop prevents late playback after pending audio resume',async()=>{
  const s=preset('orchestra-night'),audio=context(),ready=[];audio.resume=()=>new Promise(resolve=>ready.push(resolve));const p=new PreviewPlayer(()=>audio),a=p.playSection(s,0),b=p.playSection(s,4);s.sections[1].volumes.fill(0);ready.forEach(f=>f());assert.deepEqual(await Promise.all([a,b]),[false,true]);assert.equal(audio.sources.length,1);const pending=p.playSection(s,8);p.stop();ready.at(-1)();assert.equal(await pending,false);assert.equal(audio.sources.length,1);p.dispose();
});
test('new examples render finite audible PCM through all four sections at tempo and transposition limits',async()=>{
  for(const [id,tempo,transpose,rate] of [['orchestra-day',60,-12,44100],['orchestra-night',180,12,48000]]){const s=preset(id);s.tempo=tempo;s.transpose=transpose;const r=await render(s,rate);assert.ok(r.outputSamplesL.every(n=>Number.isFinite(n)&&Math.abs(n)<1));const size=Math.round(4*240/tempo*rate);for(let section=0;section<4;section++)assert.ok(rms(r.outputSamplesL.subarray(section*size,(section+1)*size))>.001);}
});
test('32-bar mixed orchestration exports stereo WAV and independently decoded MP3 with the final release and cancellation',async()=>{
  const s=resize(preset('orchestra-night'),32,'repeat');s.tempo=180;const r=await render(s),loop=await render(s,44100,'loop');assert.equal(loop.outputSamplesL.length,Math.ceil(32*240/s.tempo*44100));const wav=new DataView(wavBuffer(r.outputSamplesL,r.outputSamplesR,44100));assert.equal(wav.getUint32(40,true),r.outputSamplesL.length*4);const decoder=new MPEGDecoder();await decoder.ready;try{const decoded=decoder.decode(encodeMp3(r.outputSamplesL,r.outputSamplesR,Mp3Encoder));assert.deepEqual(decoded.errors,[]);assert.equal(decoded.channelData.length,2);assert.ok(decoded.samplesDecoded>=r.outputSamplesL.length&&decoded.samplesDecoded-r.outputSamplesL.length<2304);assert.ok(rms(decoded.channelData[0].subarray(-44100))>.0001);}finally{decoder.free();}const canceled=new AudioRenderer();for await(const _ of canceled.generate(s)){canceled.canceled=true;}assert.equal(canceled.outputSamplesL,null);
});
