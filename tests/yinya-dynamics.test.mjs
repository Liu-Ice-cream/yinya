import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {blank,preset,validate,VERSION,setSectionDynamics,setSectionVolume,steadySection,resetSectionOrchestration,setPitchedNote,copyGroup,resize,insertSection,moveSection,deleteSection,encode,decode,parseBackup,MAX_BACKUP_BYTES,songJSON,trackAudibleAt,hasAudibleNotes,wavBuffer} from '../yinya/model.js';
import {DYNAMIC_PRESETS,dynamicPresetInfo,dynamicsAt,validateDynamics} from '../yinya/dynamics.js';
import {DynamicEditor} from '../yinya/dynamic-editor.js';
import {VOICES,BASS_VOICES} from '../yinya/voices.js';
import {generateMelody} from '../yinya/melody.js';
import {generateAccompaniment} from '../yinya/accompaniment.js';
import {encodeMp3} from '../yinya/mp3.js';
import {Mp3Encoder} from '../website/yinya/vendor/lamejs.js';
import {MPEGDecoder} from 'mpg123-decoder';
await build({stdin:{contents:'export {audioSong} from "./yinya/song.js";export {Synth} from "./synth/synth.ts";export {AudioRenderer,sectionState} from "./yinya/render.js";export {renderPreview,PreviewPlayer} from "./yinya/preview.js";',resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',outfile:'build/yinya-dynamics-test.mjs'});
const {audioSong,Synth,AudioRenderer,sectionState,renderPreview,PreviewPlayer}=await import('../build/yinya-dynamics-test.mjs');
globalThis.requestAnimationFrame=cb=>setImmediate(cb);
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const seed=()=>{let n=37123;return()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return(n+.5)/2**32;};};
const rms=a=>Math.sqrt(a.reduce((n,x)=>n+x*x,0)/a.length);
function difference(a,b){assert.equal(a.length,b.length);let max=0;for(let i=0;i<a.length;i++)max=Math.max(max,Math.abs(a[i]-b[i]));return max;}
function raw(json,rate,count,chunk=count,configure=()=>{}){const song=audioSong(json),synth=new Synth(song);synth.samplesPerSecond=rate;synth.loopRepeatCount=0;synth.volume=1;configure(synth);const left=new Float32Array(count),right=new Float32Array(count);for(let at=0;at<count;at+=chunk){const end=Math.min(count,at+chunk);synth.synthesize(left.subarray(at,end),right.subarray(at,end),end-at,true);}return {left,right};}
async function render(s,rate=44100,ending='natural'){const r=new AudioRenderer();for await(const _ of r.generate(s,rate,ending)){}return r;}
function note(track=0){let s=blank('动态长音');s.tempo=120;s.tracks.forEach(t=>{t.volume=1;});s=setPitchedNote(s,track,0,0,3,32).state;return s;}
function fakeContext(){return {sampleRate:44100,currentTime:0,sources:[],resume:async()=>{},createBuffer(channels,length,rate){return {duration:length/rate,copyToChannel(){}};},createBufferSource(){const source={connect(){},disconnect(){},start(){},stop(){}};this.sources.push(source);return source;},createGain(){return {connect(){},disconnect(){},gain:{setValueAtTime(){},linearRampToValueAtTime(){}}};},close:async()=>{}};}

test('frozen v0.14.0 songs migrate equal endpoints without changing notes, voices or canonical audio',async()=>{
  const fixture=JSON.parse(await readFile(new URL('./fixtures/yinya-v0140-compat.json',import.meta.url)));assert.equal(fixture.source,'v0.14.0');
  for(const {state,songSha256} of fixture.cases){const before=structuredClone(state),next=validate(state);assert.deepEqual(next,{...state,version:VERSION,drumKit:"original",tracks:state.tracks.map((t,i)=>i===1?{...t,chordVoicings:t.bars.map(()=>Array(4).fill(1)),chordDurations:t.bars.map(()=>Array(4).fill(1))}:i===3?{...t,drumVelocities:t.bars.map(()=>Array(16).fill(13))}:t),sections:state.sections.map(p=>({...p,drumKit:"inherit",endVolumes:[...p.volumes]}))});assert.equal(createHash('sha256').update(JSON.stringify(canonical(songJSON(next)))).digest('hex'),songSha256);assert.equal(audioSong(songJSON(next)).channelGainEnvelope,null);assert.deepEqual(state,before);}
});
test('schema thirteen validates complete bounded integer endpoints without repairing malformed works',()=>{
  const s=preset('hold-dawn'),before=structuredClone(s);
  for(const change of [p=>delete p.endVolumes,p=>p.endVolumes=[],p=>p.endVolumes=Array(4),p=>p.endVolumes[0]=-1,p=>p.endVolumes[1]=101,p=>p.endVolumes[2]=.5,p=>p.endVolumes[3]='50']){const bad=structuredClone(s);change(bad.sections[0]);assert.throws(()=>validate(bad));}
  for(const args of [[-1,0,0,100],[4,0,0,100],[0,4,0,100],[0,0,-1,100],[0,0,10,101],[0,0,10.5,100]])assert.throws(()=>setSectionDynamics(s,...args));assert.deepEqual(s,before);
});
test('all four templates are immutable and exact linear amplitudes have endpoints, midpoint, per-section boundaries and final-tail clamps',()=>{
  assert.equal(DYNAMIC_PRESETS.length,4);assert.ok(Object.isFrozen(DYNAMIC_PRESETS));for(const p of DYNAMIC_PRESETS){assert.ok(Object.isFrozen(p));assert.equal(dynamicPresetInfo(p.id),p);const curve=[[p.start/100,p.end/100]];for(const pos of [0,.5,1,2,3,4])assert.equal(dynamicsAt(curve,pos),p.start/100+(p.end-p.start)/100*Math.min(pos/4,1));}
  assert.equal(dynamicsAt([[0,1],[.5,0]],4),.5);assert.equal(dynamicsAt([[0,1],[.5,0]],10),0);assert.equal(dynamicsAt([[0,1]],-2),0);assert.equal(dynamicsAt(null,2),1);assert.throws(()=>dynamicPresetInfo('invalid'));
});
test('editing one voice changes only its endpoints and reset or fixed-volume restores a steady section',()=>{
  const s=preset('hold-dawn'),next=setSectionDynamics(s,1,2,10,75);assert.deepEqual(next.tracks,s.tracks);assert.deepEqual(next.sections.filter((_,i)=>i!==1),s.sections.filter((_,i)=>i!==1));assert.deepEqual(next.sections[1].voices,s.sections[1].voices);assert.equal(next.sections[1].volumes[2],10);assert.equal(next.sections[1].endVolumes[2],75);
  const fixed=setSectionVolume(next,1,2,40);assert.equal(fixed.sections[1].volumes[2],40);assert.equal(fixed.sections[1].endVolumes[2],40);assert.deepEqual(steadySection(next,1).sections[1].endVolumes,next.sections[1].volumes);const reset=resetSectionOrchestration(next,1);assert.deepEqual(reset.sections[1].endVolumes,[100,100,100,100]);assert.deepEqual(reset.sections[1].enabled,s.sections[1].enabled);
});
test('zero-start fade-ins stay audible while zero endpoints, global mute and local masks never get unmuted',()=>{
  let s=setSectionDynamics(note(),0,0,0,100);assert.ok(trackAudibleAt(s,0,0));assert.ok(hasAudibleNotes(s));assert.ok(songJSON(s).channels[0].patterns[0].notes.length);s=setSectionDynamics(s,0,0,0,0);assert.equal(trackAudibleAt(s,0,0),false);for(const mute of [x=>x.tracks[0].enabled=false,x=>x.tracks[0].volume=0,x=>x.sections[0].enabled[0]=false]){const bad=setSectionDynamics(note(),0,0,0,100);mute(bad);assert.equal(hasAudibleNotes(bad),false);}
});
test('runtime curves only replace static section gain on the affected channel and preserve timbre, velocity and chord calibration',()=>{
  const s=preset('hold-dawn'),next=setSectionDynamics(s,1,0,10,90),old=songJSON(s),json=songJSON(next);for(let bar=0;bar<16;bar++){assert.deepEqual(json.channels[0].instruments[Math.floor(bar/4)],old.channels[0].instruments[(old.channels[0].patterns[bar].instruments?.[0]??1)-1]);if(bar<4||bar>=8)assert.deepEqual(json.channels[0].patterns[bar].notes,old.channels[0].patterns[bar].notes);}assert.deepEqual(json.channels.slice(1),old.channels.slice(1));assert.equal(json.yinyaDynamics[1],null);assert.ok(json.channels[0].patterns.slice(4,8).every(p=>p.notes.every(n=>n.yinyaSectionGain===undefined)));
  const a=audioSong(json),b=audioSong(songJSON(setSectionVolume(next,1,0,100)));assert.deepEqual(a.channels[0].patterns[4].notes[0].pins,b.channels[0].patterns[4].notes[0].pins);assert.equal(a.channelGainEnvelope(0,4),.1);assert.equal(a.channelGainEnvelope(0,6),.5);
});
test('malformed runtime curves and offsets fail before synthesis and callbacks own an immutable snapshot',()=>{
  const json=songJSON(setSectionDynamics(note(),0,0,0,100));for(const curve of [0,[],[[]],[Array(1)],[Array(9).fill([0,1])],[Array(1).fill([0,2])]])assert.throws(()=>validateDynamics(curve,4));for(const offset of [-1,33,Infinity,'1'])assert.throws(()=>audioSong({...json,yinyaDynamicsOffset:offset}));const song=audioSong(json);json.yinyaDynamics[0][0][1]=0;assert.equal(song.channelGainEnvelope(0,2),.5);
});
test('copy, repeat, duplicate, reorder and delete keep both endpoints together and own independent arrays',()=>{
  const s=setSectionDynamics(preset('hold-dawn'),0,0,10,90),copy=copyGroup(s,0,4);assert.deepEqual(copy.sections[1].endVolumes,s.sections[0].endVolumes);copy.sections[1].endVolumes[0]=20;assert.equal(copy.sections[0].endVolumes[0],90);const repeat=resize(s,32,'repeat');assert.deepEqual(repeat.sections[4].endVolumes,s.sections[0].endVolumes);const inserted=insertSection(s,0,true);assert.deepEqual(inserted.sections[1].endVolumes,s.sections[0].endVolumes);const moved=moveSection(inserted,1,3);assert.equal(moved.sections[3].endVolumes[0],90);assert.equal(deleteSection(moved,3).barCount,16);assert.deepEqual(resize(repeat,16),s);
});
test('melody and accompaniment generation preserve endpoint automation instead of overwriting the arrangement',()=>{
  const s=preset('dynamic-rise');assert.deepEqual(generateMelody(s,4).sections,s.sections);const candidate=generateAccompaniment(s,4,{mode:'ensemble',targets:[true,true,true]});assert.deepEqual(candidate.sections.map(p=>[p.volumes,p.endVolumes]),s.sections.map(p=>[p.volumes,p.endVolumes]));
});
test('maximum Unicode titles and 32-bar endpoint-rich works fit existing backup/share bounds and round-trip exactly',()=>{
  const s=resize(preset('dynamic-rise'),32,'repeat');s.title='动态🌱'.repeat(12);s.sections.forEach(p=>p.name='段落🌱'.repeat(6));assert.ok(Buffer.byteLength(JSON.stringify(s,null,2))<MAX_BACKUP_BYTES);assert.ok(encode(s).length<20000);assert.deepEqual(decode(encode(s)),s);assert.deepEqual(parseBackup(JSON.stringify(s,null,2)),s);assert.deepEqual(sectionState(s,16).sections[0],s.sections[4]);
});
test('a unity channel bus preserves ordinary stereo PCM for every melody and bass timbre at both sample rates',()=>{
  const random=Math.random;try{for(const [track,voices] of [[0,VOICES],[2,BASS_VOICES]])for(const {id} of voices)for(const rate of [44100,48000]){const s=note(track);s[track===0?'voice':'bassVoice']=id;const json=songJSON(s);raw(json,rate,rate);Math.random=seed();const a=raw(json,rate,rate);Math.random=seed();const b=raw(json,rate,rate,rate,x=>x.song.channelGainEnvelope=()=>1);assert.ok(difference(a.left,b.left)<1e-6);assert.ok(difference(a.right,b.right)<1e-6);}}finally{Math.random=random;}
});
// Undo the known quiet-signal limiter, multiply the reference waveform, then run
// an independent limiter. This checks gain after synthesis rather than pin sizes.
function offlineEnvelope(base,rate,gainAt){let oldLimit=0,newLimit=0;const rise=1-Math.pow(.5,4000/rate),decay=1-Math.pow(.5,4/rate),left=new Float32Array(base.left.length),right=new Float32Array(left.length);
  for(let i=0;i<left.length;i++){const m=Math.max(Math.abs(base.left[i]),Math.abs(base.right[i]));let alpha=rise,x=m*(.8*(1-alpha)*oldLimit+.25)/(1-.8*m*alpha);if(x<oldLimit){alpha=decay*(1+oldLimit);x=m*(.8*(1-alpha)*oldLimit+.25)/(1-.8*m*alpha);}oldLimit+=(x-oldLimit)*alpha;assert.ok(oldLimit<1);const undo=.8*oldLimit+.25,gain=gainAt(i),l=base.left[i]*undo*gain,r=base.right[i]*undo*gain,abs=Math.max(Math.abs(l),Math.abs(r));newLimit+=(abs-newLimit)*(newLimit<abs?rise:decay*(1+newLimit));const factor=1/(newLimit>=1?newLimit*1.05:newLimit*.8+.25);left[i]=l*factor;right[i]=r*factor;}return {left,right};}
test('long-note fade-in and fade-out PCM matches independent post-synthesis gain and limiter without retriggering at bars',()=>{
  const random=Math.random;try{for(const rate of [44100,48000])for(const [start,end] of [[0,100],[100,0],[25,75]]){const s=note(),json=songJSON(s),count=rate*4;raw(json,rate,count);Math.random=seed();const base=raw(json,rate,count);const expected=offlineEnvelope(base,rate,i=>(start+(end-start)*i/(rate*8))/100);Math.random=seed();const actual=raw(songJSON(setSectionDynamics(s,0,0,start,end)),rate,count);assert.ok(difference(actual.left,expected.left)<2e-6);assert.ok(difference(actual.right,expected.right)<2e-6);}}finally{Math.random=random;}
});
test('dynamic rendering is stable across arbitrary audio-buffer splits and carries elapsed gain through sustained notes',()=>{
  const random=Math.random;try{const s=setSectionDynamics(note(),0,0,0,100),json=songJSON(s),rate=44100;raw(json,rate,rate*4);Math.random=seed();const whole=raw(json,rate,rate*4);Math.random=seed();const parts=raw(json,rate,rate*4,137);assert.ok(difference(whole.left,parts.left)<2e-5);assert.ok(difference(whole.right,parts.right)<2e-5);assert.ok(rms(whole.left.subarray(rate*3,rate*3+4000))>rms(whole.left.subarray(rate,rate+4000))*1.3);}finally{Math.random=random;}
});
test('section-loop playback restarts the envelope while from-section playback begins at that section gain',()=>{
  const s=setSectionDynamics(note(),0,0,0,100),json=songJSON(s),samples=44100*17,positions=[];raw(json,44100,samples,samples,synth=>{const gain=synth.song.channelGainEnvelope;synth.loopRepeatCount=-1;synth.song.channelGainEnvelope=(channel,pos,instrument)=>{if(channel===0)positions.push(pos);return gain(channel,pos,instrument);};});assert.ok(positions.some((p,i)=>i>0&&p<positions[i-1]-1));const grown=resize(s,8,'repeat'),song=audioSong(songJSON(grown));assert.equal(song.channelGainEnvelope(0,4),0);assert.equal(song.channelGainEnvelope(0,6),.5);
});
test('click previews retain original envelope time for a late onset and a continuation, including release',()=>{
  const random=Math.random;try{let s=note();s.tracks[0].bars[0].fill(-1);s.tracks[0].durations[0].fill(1);s=setPitchedNote(s,0,1,0,3,32).state;s=setSectionDynamics(s,0,0,0,100);for(const rate of [44100,48000]){renderPreview(s,0,0,rate,{bar:1,step:0,pitch:3});Math.random=seed();const a=renderPreview(s,0,0,rate,{bar:1,step:0,pitch:3});Math.random=seed();const b=renderPreview(s,0,0,rate,{bar:2,step:5,pitch:3});assert.equal(a.left.length,Math.ceil(4.07*rate));assert.ok(difference(a.left,b.left)<1e-6);assert.ok(rms(a.left.subarray(0,rate))>.0001);}}finally{Math.random=random;}
});
test('natural tails honor a zero final endpoint and loop export stays exactly the musical length',async()=>{
  let s=setPitchedNote(blank(),0,3,12,3,4).state;s.voice='piano-v1';s.tempo=120;s=setSectionDynamics(s,0,0,100,0);const r=await render(s),loop=await render(s,44100,'loop');assert.ok(r.tailSeconds>0);assert.ok(r.outputSamplesL.subarray(44100*8).every(x=>x===0));assert.equal(loop.outputSamplesL.length,44100*8);
});
test('a faded-out released piano stays silent when the next section resumes at full volume',()=>{
  let s=blank('交界余音',8);s.tempo=120;s.voice='piano-v1';s=setPitchedNote(s,0,3,15,3,1).state;s=setSectionDynamics(s,0,0,100,0);const json=songJSON(s),song=audioSong(json);assert.equal(song.channelGainEnvelope(0,4.1,0),0);assert.equal(song.channelGainEnvelope(0,4.1,1),1);const a=raw(json,44100,44100*9);assert.ok(a.left.subarray(44100*8).every(x=>x===0));assert.ok(a.right.subarray(44100*8).every(x=>x===0));
});
test('quiet chord and drum fades match independent waveform gain without altering filters or attack envelopes',()=>{
  const random=Math.random;try{for(const track of [1,3]){let s=blank();s.tempo=120;s.tracks.forEach(t=>t.volume=1);if(track===1)s.tracks[1].bars[0]=[0,0,0,0];else for(const step of [0,4,8,12])s.tracks[3].bars[0][step]=7;const json=songJSON(s),rate=44100,count=rate*2;raw(json,rate,count);Math.random=seed();const base=raw(json,rate,count);const expected=offlineEnvelope(base,rate,i=>1-i/(rate*8));Math.random=seed();const actual=raw(songJSON(setSectionDynamics(s,0,track,100,0)),rate,count);assert.ok(difference(actual.left,expected.left)<2e-6);assert.ok(difference(actual.right,expected.right)<2e-6);}}finally{Math.random=random;}
});
test('dynamic instrument instances stay within engine limits and fixed sections keep original parsed note gains',()=>{
  let s=resize(preset('hold-dawn'),32,'repeat');for(let section=0;section<8;section++)for(let track=0;track<4;track++)s=setSectionDynamics(s,section,track,section%2?100:0,100);const json=songJSON(s),song=audioSong(json);for(let track=0;track<4;track++){assert.equal(song.channels[track].instruments.length,8);song.channels[track].patterns.forEach((p,bar)=>assert.deepEqual(p.instruments,[Math.floor(bar/4)]));}const old=songJSON(preset('hold-dawn')),changed=songJSON(setSectionDynamics(preset('hold-dawn'),1,0,0,100));const a=audioSong(old),b=audioSong(changed);for(const bar of [0,3,8,15])assert.deepEqual(a.channels[0].patterns[bar].notes.map(n=>n.pins),b.channels[0].patterns[bar].notes.map(n=>n.pins));
});
test('short previews retain fixed levels and use the clicked grid time for drums and legacy chords',()=>{
  const s=preset('hold-dawn'),next=setSectionDynamics(s,1,0,0,100),a=renderPreview(s,0,2,44100,{bar:0}),b=renderPreview(next,0,2,44100,{bar:0});assert.ok(difference(a.left,b.left)<1e-6);assert.ok(difference(a.right,b.right)<1e-6);
  const random=Math.random;try{for(const track of [1,3]){const work=setSectionDynamics(blank(),0,track,0,100);renderPreview(work,track,0,44100,{bar:0,offsetStep:12});Math.random=seed();const early=renderPreview(work,track,0,44100,{bar:0,offsetStep:0});Math.random=seed();const late=renderPreview(work,track,0,44100,{bar:0,offsetStep:12});assert.ok(rms(late.left)>rms(early.left)*2);assert.throws(()=>renderPreview(work,track,0,44100,{bar:0,offsetStep:16}));}}finally{Math.random=random;}
});
test('all four channels can fade together with finite stereo output and global and section masks remain effective',async()=>{
  let s=preset('dynamic-rise');s.tempo=180;const r=await render(s);assert.ok(r.outputSamplesL.every(x=>Number.isFinite(x)&&Math.abs(x)<1));assert.ok(rms(r.outputSamplesL)>.001);s.tracks.forEach(t=>t.enabled=false);assert.ok((await render(s)).outputSamplesL.every(x=>x===0));
});
test('candidate lifecycle applies once, rejects stale work and cancellation leaves original endpoints untouched',()=>{
  const base=preset('hold-dawn'),candidate=setSectionDynamics(base,0,0,0,100),events=[],e=Object.create(DynamicEditor.prototype);let state=base;e.callbacks={get:()=>state,commit:(next,message)=>{state=next;events.push(message);}};e.message=m=>events.push(m);e.close=()=>{events.push('close');e.session=null;};e.session={base,candidate,index:0,serialized:JSON.stringify(base)};e.apply();assert.deepEqual(state,candidate);assert.equal(events.length,2);e.apply();assert.equal(events.length,2);state={...base,title:'changed'};e.session={base,candidate,index:0,serialized:JSON.stringify(base)};e.apply();assert.equal(state.title,'changed');assert.match(events.at(-1),/作品已变化/);assert.deepEqual(base.sections[0].endVolumes,base.sections[0].volumes);
});
test('rapid original/candidate audition and cancellation use immutable dynamic snapshots and prevent late audio',async()=>{
  const audio=fakeContext(),ready=[];audio.resume=()=>new Promise(r=>ready.push(r));const p=new PreviewPlayer(()=>audio),a=p.playSection(preset('hold-dawn'),0),b=p.playSection(preset('dynamic-rise'),0);ready.forEach(r=>r());assert.deepEqual(await Promise.all([a,b]),[false,true]);const next=p.playSection(preset('dynamic-rise'),4);p.stop();ready.at(-1)();assert.equal(await next,false);assert.equal(audio.sources.length,1);p.dispose();
});
test('32-bar dynamic WAV and independently decoded MP3 retain duration, stereo and audible closing phrase; cancellation produces no output',async()=>{
  const s=resize(preset('dynamic-dusk'),32,'repeat');s.tempo=180;const r=await render(s),wav=new DataView(wavBuffer(r.outputSamplesL,r.outputSamplesR,44100));assert.equal(wav.getUint32(40,true),r.outputSamplesL.length*4);assert.ok(rms(r.outputSamplesL.subarray(-88200,-4410))>.0001);const decoder=new MPEGDecoder();await decoder.ready;try{const d=decoder.decode(encodeMp3(r.outputSamplesL,r.outputSamplesR,Mp3Encoder));assert.deepEqual(d.errors,[]);assert.equal(d.channelData.length,2);assert.ok(d.samplesDecoded>=r.outputSamplesL.length&&d.samplesDecoded-r.outputSamplesL.length<2304);assert.ok(rms(d.channelData[0].subarray(-88200,-4410))>.0001);}finally{decoder.free();}const canceled=new AudioRenderer();for await(const _ of canceled.generate(s)){canceled.canceled=true;}assert.equal(canceled.outputSamplesL,null);
});
