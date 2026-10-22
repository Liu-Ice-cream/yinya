import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {blank,preset,validate,VERSION,setChord,chordAt,chordNotes,CHORDS,CHORD_STYLES,songJSON,clearBar,copyBar,copyGroup,resize,insertSection,moveSection,deleteSection,applyProgression,encode,decode,parseBackup,MAX_BACKUP_BYTES,hasAudibleNotes,rangeHasNotes,setSectionDynamics,wavBuffer} from '../yinya/model.js';
import {harmonyNotes,editHarmony,copyHarmony,pasteHarmony,harmonyRectangle,generateHarmony} from '../yinya/harmony.js';
import {CHORD_VOICES} from '../yinya/voices.js';
import {chordRows,PITCH_VALUES} from '../yinya/theory.js';
import {harmonicRunsAt,generateAccompaniment} from '../yinya/accompaniment.js';
import {generateMelody,melodyHarmonyInfo} from '../yinya/melody.js';
import {encodeMp3} from '../yinya/mp3.js';
import {Mp3Encoder} from '../website/yinya/vendor/lamejs.js';
import {MPEGDecoder} from 'mpg123-decoder';
await build({stdin:{contents:'export {audioSong} from "./yinya/song.js";export {Synth} from "./synth/synth.ts";export {AudioRenderer,sectionState} from "./yinya/render.js";export {renderPreview} from "./yinya/preview.js";',resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',outfile:'build/yinya-long-chords-test.mjs'});
const {audioSong,Synth,AudioRenderer,sectionState,renderPreview}=await import('../build/yinya-long-chords-test.mjs');
globalThis.requestAnimationFrame=cb=>setImmediate(cb);
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const rms=a=>Math.sqrt(a.reduce((sum,x)=>sum+x*x,0)/a.length);
function source(bar=0,beat=2,duration=4){const s=setChord(blank('长和弦验证',8),bar,beat,7,3,2,duration);s.tempo=120;s.chordVoice='chord-piano-v1';s.tracks.forEach((t,i)=>t.enabled=i===1);return s;}
async function render(s,ending='natural'){const r=new AudioRenderer();for await(const _ of r.generate(s,44100,ending)){}return r;}

test('v0.17 frozen projects migrate with one-beat durations and byte-identical canonical audio',async()=>{
 const fixture=JSON.parse(await readFile(new URL('./fixtures/yinya-v0170-compat.json',import.meta.url)));assert.equal(fixture.source,'v0.17.0');assert.equal(fixture.cases.length,3);
 for(const {state,songSha256} of fixture.cases){const before=structuredClone(state),next=validate(state);assert.deepEqual(next,{...state,version:VERSION,tracks:state.tracks.map((t,i)=>i===1?{...t,chordDurations:t.bars.map(()=>Array(4).fill(1))}:t)});assert.equal(createHash('sha256').update(JSON.stringify(canonical(songJSON(next)))).digest('hex'),songSha256);assert.deepEqual(state,before);}
});
test('duration schema rejects missing, sparse, fractional, rest, overlap and section-overflow metadata',()=>{
 const s=source(),before=structuredClone(s);for(const change of [s=>delete s.tracks[1].chordDurations,s=>s.tracks[1].chordDurations=Array(8),s=>s.tracks[1].chordDurations[0]=Array(4),s=>s.tracks[1].chordDurations[0][2]=0,s=>s.tracks[1].chordDurations[0][2]=5,s=>s.tracks[1].chordDurations[0][2]=1.5,s=>s.tracks[1].chordDurations[0][0]=2,s=>s.tracks[1].bars[1][0]=0,s=>{s.tracks[1].bars[3][3]=0;s.tracks[1].chordDurations[3][3]=2;}]){const bad=structuredClone(s);change(bad);assert.throws(()=>validate(bad));}assert.deepEqual(s,before);
});
test('held beats resolve to one onset, respect boundaries and remain visible in bar palettes and audible ranges',()=>{
 const s=source();for(const [bar,beat] of [[0,2],[0,3],[1,0],[1,1]])assert.deepEqual(chordAt(s,bar,beat),{bar:0,beat:2,chord:7,duration:4,expression:11});assert.equal(chordAt(s,1,2),null);assert.equal(chordAt(s,4,0),null);assert.throws(()=>setChord(s,1,0,0));assert.throws(()=>setChord(s,3,3,0,0,1,2));assert.ok(hasAudibleNotes(s,1,2,[1]));assert.ok(rangeHasNotes(s,1,2));assert.ok(chordRows(s,1).some(n=>n.id===7));
});
test('batch lengths, movement and clipboard preserve durations and reject colliding or overflowing complete edits',()=>{
 const s=source(),before=structuredClone(s),n=harmonyNotes(s,0)[0];assert.equal(n.duration,4);assert.deepEqual(harmonyRectangle([n],4,4),[2]);
 const small=editHarmony(s,0,[2],{type:'duration',duration:2});assert.equal(harmonyNotes(small.state,0)[0].duration,2);const moved=editHarmony(s,0,[2],{type:'move',beats:3});assert.equal(harmonyNotes(moved.state,0)[0].beat,5);assert.equal(harmonyNotes(moved.state,0)[0].duration,4);
 const clip=copyHarmony(s,0,[2]);assert.equal(clip.chords[0].duration,4);const pasted=pasteHarmony(s,0,8,clip);assert.equal(chordAt(pasted.state,2,3).duration,4);assert.throws(()=>pasteHarmony(s,0,4,clip));assert.throws(()=>pasteHarmony(s,0,14,clip));assert.throws(()=>editHarmony(pasted.state,0,[2,8],{type:'move',beats:6}));
 const replaced=editHarmony(s,0,[2],{type:'replace',chord:0});assert.equal(harmonyNotes(replaced.state,0)[0].duration,4);assert.equal(harmonyNotes(replaced.state,0)[0].inversion,0);assert.equal(harmonyNotes(replaced.state,0)[0].velocity,2);assert.deepEqual(s,before);
});
test('clear removes incoming whole chords; bar-copy clips source holds and rejects destination holds',()=>{
 const s=source(),before=structuredClone(s),cleared=clearBar(s,1,1);assert.equal(harmonyNotes(cleared,0).length,0);assert.ok(cleared.tracks[1].chordDurations.flat().every(n=>n===1));assert.throws(()=>copyBar(s,1,2,1));assert.throws(()=>copyBar(s,1,2,0));const copied=copyBar(s,1,1,2);assert.deepEqual(chordAt(copied,2,0),{bar:2,beat:0,chord:7,duration:2,expression:11});assert.equal(chordAt(copied,2,2),null);assert.deepEqual(s,before);
});
test('group copy, repeat, section insertion, reorder, deletion and preview carry independent durations',()=>{
 const s=source(),copied=copyGroup(s,0,4);assert.equal(copied.tracks[1].chordDurations[4][2],4);copied.tracks[1].chordDurations[4][2]=2;assert.equal(copied.tracks[1].chordDurations[0][2],4);
 const repeated=resize(s,32,'repeat');assert.equal(chordAt(repeated,25,0).duration,4);assert.deepEqual(sectionState(repeated,24).tracks[1].chordDurations,repeated.tracks[1].chordDurations.slice(24,28));assert.equal(validate(sectionState(repeated,24)).barCount,4);
 const inserted=insertSection(s,0,true),moved=moveSection(inserted,1,2);assert.equal(chordAt(moved,9,0).duration,4);assert.deepEqual(deleteSection(moved,2),s);assert.ok(insertSection(s,0,false).tracks[1].chordDurations.slice(4,8).flat().every(n=>n===1));
});
test('harmony workshop keeps durations while progression replacement resets only its target section',()=>{
 const s=copyGroup(source(),0,4),smooth=generateHarmony(s,0,{accent:'pulse'});assert.deepEqual(smooth.tracks[1].chordDurations,s.tracks[1].chordDurations);const replaced=applyProgression(s,0,'bright-v1');assert.ok(replaced.tracks[1].chordDurations.slice(0,4).flat().every(n=>n===1));assert.deepEqual(replaced.tracks[1].chordDurations.slice(4),s.tracks[1].chordDurations.slice(4));
});
test('melody and bass generation follow incoming long harmony rather than marking its new bar empty',()=>{
 const s=source();assert.deepEqual(harmonicRunsAt(s,1),[{chord:7,start:0,end:8}]);assert.equal(melodyHarmonyInfo(s,1,2).emptyBars,0);const bass=generateAccompaniment(s,0);assert.ok(bass.tracks[2].bars[1].some(n=>n>=0));assert.ok(bass.tracks[2].bars[1].slice(8).every(n=>n===-1));assert.deepEqual(bass.tracks[1],s.tracks[1]);assert.ok(generateMelody(s,0).tracks[0].bars.flat().some(n=>n>=0));
});
test('repeated identical chords after a hold remain separate harmony runs and generate accompaniment for both',()=>{
 let s=setChord(blank(),0,0,0,0,1,2);s=setChord(s,0,2,0);assert.deepEqual(harmonicRunsAt(s,0),[{chord:0,start:0,end:8},{chord:0,start:8,end:16}]);const next=generateAccompaniment(s,0);assert.ok(next.tracks[2].bars[0][8]>=0);
});
test('every chord, inversion and style expands long durations with exact original beat cadence',()=>{
 for(let chord=0;chord<CHORDS.length;chord++)for(let inversion=0;inversion<CHORDS[chord].length;inversion++)for(const {id} of CHORD_STYLES)for(const length of [2,3,4]){
  const notes=chordNotes(chord,2,'chord-piano-v1',id,12,inversion*3+2,length);assert.ok(notes.every(n=>n.points[0].tick>=8&&n.points.at(-1).tick<=8+length*4));assert.equal(notes[0].points[0].tick,8);if(['block','strum-v1'].includes(id))assert.equal(notes.at(-1).points.at(-1).tick,8+length*4);else assert.equal(notes.length,chordNotes(chord,2,'chord-piano-v1',id,12,inversion*3+2).length*length);
 }
});
test('cross-bar block and strum fragments continue matching voices while arpeggios keep independent attacks',()=>{
 for(const style of CHORD_STYLES){const s=source();s.chordStyle=style.id;const p=songJSON(s).channels[1].patterns;assert.ok(p[0].notes.length);assert.ok(p[1].notes.length);assert.ok(p[0].notes.every(n=>n.points.at(-1).tick<=16));assert.ok(p[1].notes.every(n=>n.points[0].tick>=0&&n.points.at(-1).tick<=8));if(['block','strum-v1'].includes(style.id)){assert.equal(p[1].notes[0].continuesLastPattern,true);assert.deepEqual(p[0].notes.at(-1).pitches,p[1].notes[0].pitches);assert.equal(p[0].notes.at(-1).points.at(-1).volume,p[1].notes[0].points[0].volume);}else assert.ok(p[1].notes.every(n=>!n.continuesLastPattern));}
});
test('all four voices and five styles render finite audible long chords at both common device rates',()=>{
 for(const voice of CHORD_VOICES)for(const style of CHORD_STYLES)for(const rate of [44100,48000]){const s=source();s.chordVoice=voice.id;s.chordStyle=style.id;const synth=new Synth(audioSong(songJSON(s)));synth.samplesPerSecond=rate;synth.loopRepeatCount=0;const l=new Float32Array(rate*4),r=new Float32Array(l.length);synth.synthesize(l,r,l.length,true);assert.ok(l.every(Number.isFinite));assert.ok(r.every(Number.isFinite));assert.ok(rms(l.subarray(rate,rate*3))>.00001,voice.id+':'+style.id);}
});
test('bar-line sustain is sample-identical to an unsplit reference for both held styles, every voice and device rate',()=>{
 for(const voice of CHORD_VOICES)for(const style of ['block','strum-v1'])for(const rate of [44100,48000]){
  const s=source();s.chordVoice=voice.id;s.chordStyle=style;const split=songJSON(s),whole=structuredClone(split);whole.beatsPerBar=8;whole.loopBars=4;
  for(const channel of whole.channels){const notes=channel.patterns.slice(0,2).flatMap((p,i)=>p.notes.map(n=>({...n,points:n.points.map(v=>({...v,tick:v.tick+i*16}))})));for(let i=notes.length-1;i>0;i--)if(notes[i].continuesLastPattern){notes[i-1].points[notes[i-1].points.length-1]=notes[i].points.at(-1);notes.splice(i,1);}channel.patterns=[{notes},{notes:[]}];channel.sequence=[1,2,2,2];}
  const pcm=json=>{const random=Math.random;Math.random=()=>.5;try{const synth=new Synth(audioSong(json));synth.samplesPerSecond=rate;synth.loopRepeatCount=0;const l=new Float32Array(rate*4),r=new Float32Array(l.length);synth.synthesize(l,r,l.length,true);return [l,r];}finally{Math.random=random;}};
  const a=pcm(split),b=pcm(whole);assert.deepEqual(a,b,voice.id+':'+style+':'+rate);
 }
});
test('long chord click previews own their complete rebased onset, retain mute and reject a wrong chord',()=>{
 for(const style of CHORD_STYLES){const s=source();s.chordStyle=style.id;const a=renderPreview(s,1,7,44100,{bar:0,step:2});assert.ok(a.left.length>44100*2);assert.ok(a.left.every(Number.isFinite));assert.ok(rms(a.left.subarray(44100/2,44100*1.5))>.00001);assert.equal(a.left.at(-1),0);assert.throws(()=>renderPreview(s,1,0,44100,{bar:0,step:2}));s.tracks[1].enabled=false;assert.equal(renderPreview(s,1,7,44100,{bar:0,step:2}),null);}
});
test('ending chords export their full sustained beat and natural tail, exact loop length and silent zero endpoint',async()=>{
 const s=source(7,0,4),r=await render(s),loop=await render(s,'loop');assert.equal(loop.outputSamplesL.length,16*44100);assert.ok(r.outputSamplesL.length>loop.outputSamplesL.length);assert.ok(rms(r.outputSamplesL.subarray(15*44100,16*44100))>.00001);assert.ok(rms(r.outputSamplesL.subarray(16*44100))>.000001);assert.equal(r.outputSamplesL.at(-1),0);const quiet=await render(setSectionDynamics(s,1,1,100,0));assert.ok(quiet.outputSamplesL.subarray(16*44100).every(n=>n===0));
});
test('WAV and independently decoded MP3 retain the final sustained beat and natural tail',async()=>{
 const r=await render(resize(source(7,0,4),32,'repeat')),wav=new DataView(wavBuffer(r.outputSamplesL,r.outputSamplesR,44100));assert.equal(wav.getUint32(40,true),r.outputSamplesL.length*4);assert.ok(r.outputSamplesL.length>64*44100);const mp3=encodeMp3(r.outputSamplesL,r.outputSamplesR,Mp3Encoder),decoder=new MPEGDecoder();await decoder.ready;try{const decoded=decoder.decode(mp3);assert.equal(decoded.errors.length,0);assert.equal(decoded.sampleRate,44100);assert.ok(rms(decoded.channelData[0].subarray(63*44100,64*44100))>.00001);assert.ok(decoded.samplesDecoded>=r.outputSamplesL.length);}finally{decoder.free();}
});
test('dense 32-bar works fit existing share and backup limits and round-trip duration metadata',()=>{
 const s=resize(preset('chord-shore'),32,'repeat');s.title='音'.repeat(60);s.sections.forEach(p=>p.name='段'.repeat(24));for(let b=0;b<32;b++){for(let beat=0;beat<4;beat++){s.tracks[1].bars[b][beat]=7;s.tracks[1].chordVoicings[b][beat]=11;s.tracks[1].chordDurations[b][beat]=1;}for(let step=0;step<16;step++){s.tracks[3].bars[b][step]=7;s.tracks[3].drumVelocities[b][step]=26;}}
 assert.ok(encode(s).length<20000);assert.ok(Buffer.byteLength(JSON.stringify(s,null,2))<MAX_BACKUP_BYTES);assert.deepEqual(decode(encode(s)),s);assert.deepEqual(parseBackup(JSON.stringify(s,null,2)),s);const long=source();assert.deepEqual(decode(encode(long)),long);assert.deepEqual(parseBackup(JSON.stringify(long,null,2)),long);
});
test('both slow starter works contain actual cross-bar harmony and valid section arrangements',()=>{
 for(const id of ['chord-mist','chord-shore']){const s=preset(id);assert.deepEqual(validate(s),s);assert.equal(s.barCount,16);assert.ok(s.tempo<=80);assert.ok(harmonyNotes(s,0).some(n=>Math.floor(n.beat/4)!==Math.floor((n.beat+n.duration-1)/4)));assert.ok(s.tracks[1].chordDurations.flat().includes(4));for(let bar=0;bar<16;bar++)for(const beat of [0,2])assert.equal(PITCH_VALUES[s.tracks[2].bars[bar][beat*4]]%12,CHORDS[chordAt(s,bar,beat).chord][0]%12);}
});
