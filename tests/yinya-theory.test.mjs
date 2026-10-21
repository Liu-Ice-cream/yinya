import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {blank,preset,validate,songJSON,CHORDS,CHORD_STYLES,chordNotes,setScale,setTranspose,shiftOctave,applyProgression,setPitchedNote,resize,copyGroup,insertSection,moveSection,encode,decode,parseBackup,MAX_BACKUP_BYTES,wavBuffer} from '../yinya/model.js';
import {PITCH_VALUES,SCALES,PROGRESSIONS,pitchId,pitchName,pitchRows,chordRows,chordName,inScale,keyName} from '../yinya/theory.js';
import {CHORD_VOICES,BASS_VOICES} from '../yinya/voices.js';
import {encodeMp3} from '../yinya/mp3.js';
import {Mp3Encoder} from '../website/yinya/vendor/lamejs.js';
import {MPEGDecoder} from 'mpg123-decoder';
await build({stdin:{contents:'export {AudioRenderer,phraseState} from "./yinya/render.js"; export {renderPreview,previewPitches} from "./yinya/preview.js"; export {audioSong} from "./yinya/song.js"; export {Synth} from "./synth/synth.ts";',resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',outfile:'build/yinya-theory-test.mjs'});
const {AudioRenderer,phraseState,renderPreview,previewPitches,audioSong,Synth}=await import('../build/yinya-theory-test.mjs');
globalThis.requestAnimationFrame=callback=>setImmediate(callback);
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const rms=a=>Math.sqrt(a.reduce((sum,n)=>sum+n*n,0)/a.length);
const audible=a=>a.some(n=>Math.abs(n)>.001);
async function render(s,ending='natural'){const r=new AudioRenderer();for await(const _ of r.generate(s,44100,ending)){}return r;}

test('stable chromatic IDs preserve all eight legacy pitches and span two complete octaves',()=>{
  assert.deepEqual(PITCH_VALUES.slice(0,8),[0,2,4,7,9,12,14,16]);assert.equal(PITCH_VALUES.length,25);
  for(let i=0;i<=24;i++)assert.equal(PITCH_VALUES[pitchId(i)],i);
  for(const i of [-1,25,.5])assert.throws(()=>pitchId(i));
  assert.equal(SCALES.length,3);assert.equal(CHORDS.length,19);assert.throws(()=>SCALES[1].intervals.push(1));assert.throws(()=>CHORDS[7].push(99));
});
test('frozen v0.8.0 songs migrate without changing any instrument, note, velocity, rhythm or arrangement',async()=>{
  const fixture=JSON.parse(await readFile(new URL('./fixtures/yinya-v080-compat.json',import.meta.url)));
  assert.equal(fixture.cases.length,3);
  for(const {state,songSha256} of fixture.cases){const before=structuredClone(state),next=validate(state);
    assert.equal(next.version,14);assert.equal(next.scale,'pentatonic');assert.equal(next.transpose,0);
    assert.equal(createHash('sha256').update(JSON.stringify(canonical(songJSON(next)))).digest('hex'),songSha256);assert.deepEqual(state,before);
  }
});
test('schema ten rejects malformed tonality and out of range IDs while legacy versions retain their original limits',()=>{
  for(const mutate of [s=>delete s.scale,s=>s.scale='chromatic',s=>delete s.transpose,s=>s.transpose=13,s=>s.transpose=-13,s=>s.transpose=.5,s=>s.transpose='2',s=>s.tracks[0].bars[0][0]=25,s=>s.tracks[1].bars[0][0]=19]){const s=blank();mutate(s);assert.throws(()=>validate(s));}
  for(const [track,pitch] of [[0,8],[1,4]]){const s=blank();s.version=9;delete s.scale;delete s.transpose;s.tracks[track].bars[0][0]=pitch;assert.throws(()=>validate(s));}
});
test('scale and pitch display changes preserve music and reveal existing notes outside the selected scale',()=>{
  const s=setPitchedNote(blank(),0,0,0,pitchId(4),4).state,before=structuredClone(s),minor=setScale(s,'minor');
  assert.deepEqual(songJSON(minor).channels,songJSON(s).channels);assert.deepEqual(s,before);
  assert.equal(pitchRows(minor,0,0).find(r=>r.id===pitchId(4)).outside,true);
  assert.equal(pitchName(setScale(s,'major'),0,pitchId(5)),'fa · F4');assert.equal(pitchName(s,0,pitchId(11),'notes'),'B4');
  assert.equal(pitchName(setTranspose(s,-12),2,pitchId(0),'notes'),'C1');
  assert.ok(pitchRows(s,0,0,'low').every(r=>PITCH_VALUES[r.id]<=12));assert.ok(pitchRows(s,0,0,'high').every(r=>PITCH_VALUES[r.id]>=12));
  for(const args of [[1,0,'all'],[0,4,'all'],[0,0,'oops']])assert.throws(()=>pitchRows(s,...args));
});
test('all twenty five transpositions shift exactly three pitched tracks and leave drum events and stored notes unchanged',()=>{
  const s=preset('tone-day'),base=songJSON(s),before=structuredClone(s);
  for(let shift=-12;shift<=12;shift++){const next=setTranspose(s,shift),json=songJSON(next);assert.deepEqual(next.tracks,s.tracks);assert.deepEqual(json.channels[3],base.channels[3]);
    for(const index of [0,1,2])for(let bar=0;bar<s.barCount;bar++)assert.deepEqual(json.channels[index].patterns[bar].notes.map(n=>n.pitches),base.channels[index].patterns[bar].notes.map(n=>n.pitches.map(p=>p+shift)));
    assert.equal(chordName(next,0),keyName(shift));assert.deepEqual(decode(encode(next)),next);
  }assert.deepEqual(s,before);assert.throws(()=>setTranspose(s,13));
});
test('octave moves preserve durations, velocities and other tracks and preflight the entire scope atomically',()=>{
  let s=setPitchedNote(blank('',8),0,4,0,pitchId(0),8,0).state;s=setPitchedNote(s,0,5,4,pitchId(12),4,2).state;
  const before=structuredClone(s),next=shiftOctave(s,0,4,4,1);assert.equal(next.tracks[0].bars[4][0],pitchId(12));assert.equal(next.tracks[0].bars[5][4],pitchId(24));
  assert.deepEqual(next.tracks[0].durations,s.tracks[0].durations);assert.deepEqual(next.tracks[0].velocities,s.tracks[0].velocities);assert.deepEqual(next.tracks.slice(1),s.tracks.slice(1));assert.deepEqual(shiftOctave(next,0,4,4,-1),s);
  assert.throws(()=>shiftOctave(next,0,4,4,1));assert.deepEqual(s,before);assert.throws(()=>shiftOctave(s,0,0,1,1));assert.throws(()=>shiftOctave(s,1,4,1,1));assert.throws(()=>shiftOctave(s,0,3,4,1));
});
test('six chord progressions overwrite only the chosen four chord bars and preserve all performance settings',()=>{
  for(const p of PROGRESSIONS){const s=setTranspose(setScale(preset('tone-day'),p.mode),3),before=structuredClone(s),next=applyProgression(s,4,p.id);
    assert.deepEqual(next.tracks[1].bars.slice(4,8),p.chords.map(id=>[id,-1,id,-1]));
    for(const i of [0,2,3])assert.deepEqual(next.tracks[i],s.tracks[i]);assert.deepEqual(next.sections,s.sections);assert.equal(next.chordStyle,s.chordStyle);assert.equal(next.transpose,3);
    assert.deepEqual(next.tracks[1].bars.slice(0,4),s.tracks[1].bars.slice(0,4));assert.deepEqual(next.tracks[1].bars.slice(8),s.tracks[1].bars.slice(8));assert.deepEqual(s,before);
    assert.throws(()=>applyProgression(setScale(s,p.mode==='major'?'minor':'major'),4,p.id));assert.throws(()=>applyProgression(s,3,p.id));
  }
});
test('recommended chord views preserve existing borrowed chords and the complete palette exposes all nineteen choices',()=>{
  const s=setScale(blank(),'minor');s.tracks[1].bars[0][0]=7;assert.ok(chordRows(s,0).some(r=>r.id===7));assert.equal(chordRows(s,0,true).length,19);assert.equal(chordRows(setTranspose(s,2),0,true)[7].label,'A7');
});
test('every chord and performance style survives the actual synthesizer parser including all four seventh chord tones',()=>{
  for(const style of CHORD_STYLES)for(const voice of CHORD_VOICES)for(let id=0;id<19;id++)for(const shift of [-12,0,12]){
    const notes=chordNotes(id,3,voice.id,style.id,shift);let end=12;const heard=new Set();
    for(const n of notes){assert.ok(n.points[0].tick>=end);end=n.points.at(-1).tick;assert.ok(end<=16);n.pitches.forEach(p=>heard.add(p));}
    assert.deepEqual([...heard].sort((a,b)=>a-b),CHORDS[id].map(p=>p+shift).sort((a,b)=>a-b));
    const s=setTranspose(blank(),shift);s.chordVoice=voice.id;s.chordStyle=style.id;s.tracks[1].bars[0][3]=id;assert.equal(audioSong(songJSON(s)).channels[1].patterns[0].notes.length,notes.length);
  }
});
test('four note chord stacks receive conservative energy calibration while legacy triads retain exact gain',()=>{
  for(const style of CHORD_STYLES){for(const n of chordNotes(7,0,'chord-piano-v1',style.id)){assert.equal(n.yinyaChordGain??1,n.pitches.length===4?Math.sqrt(3/4):1);}assert.ok(chordNotes(0,0,'rounded',style.id).every(n=>n.yinyaChordGain===undefined));}
  const s=blank();s.chordVoice='chord-piano-v1';const triad=renderPreview(s,1,5),seventh=renderPreview(s,1,7);assert.ok(rms(seventh.left)<rms(triad.left)*1.5);assert.ok(rms(seventh.left)>rms(triad.left)*.5);
});
test('new melody and bass extremes render finite audible previews at transposition, tempo and device rate boundaries',()=>{
  for(const track of [0,2])for(const voice of track===0?['triangle','rounded','square','piano-v1','electric-piano-v1','acoustic-guitar-v1']:BASS_VOICES.map(v=>v.id))for(const [offset,shift,tempo,rate] of [[0,-12,60,44100],[24,12,180,48000]]){
    let s=setPitchedNote(blank(),track,0,0,pitchId(offset),4,2).state;s=setTranspose(s,shift);s.tempo=tempo;s[track===0?'voice':'bassVoice']=voice;
    const a=renderPreview(s,track,0,rate,{bar:0,step:0,pitch:pitchId(offset)});assert.ok(audible(a.left),`${voice} ${offset}`);assert.ok(a.left.every(n=>Number.isFinite(n)&&Math.abs(n)<1));
    assert.deepEqual(previewPitches(track,0,s,{pitch:pitchId(offset)}),[(track===0?48:24)+offset+shift]);assert.throws(()=>renderPreview(s,track,0,rate,{bar:0,step:0,pitch:pitchId(12)}));
  }
});
test('positioned chromatic previews match the actual exported synthesis before their release fade',()=>{
  for(const track of [0,2]){let s=setPitchedNote(blank(),track,0,0,pitchId(11),4,0).state;s=setTranspose(s,5);s.voice='piano-v1';s.bassVoice='bass-pluck-v1';
    const a=renderPreview(s,track,0,44100,{bar:0,step:0,pitch:pitchId(11)}),json=songJSON(s);json.channels=[json.channels[track]];
    const synth=new Synth(audioSong(json));synth.samplesPerSecond=44100;synth.loopRepeatCount=0;const l=new Float32Array(4410),r=new Float32Array(4410);synth.synthesize(l,r,l.length,true);
    assert.ok(rms(l.map((v,i)=>v-a.left[i]))<.00001);
  }
});
test('section copies, movement, insertion and phrase snapshots preserve new pitches and tonality deeply',()=>{
  const s=setTranspose(preset('tone-dusk'),-5),before=structuredClone(s);
  const copied=copyGroup(s,0,4);assert.deepEqual(copied.tracks[0].bars.slice(4,8),s.tracks[0].bars.slice(0,4));assert.equal(copied.scale,'minor');assert.equal(copied.transpose,-5);
  assert.deepEqual(moveSection(moveSection(s,0,3),3,0),s);assert.equal(insertSection(s,0,true).transpose,-5);
  const phrase=phraseState(s,4,'duet');assert.equal(phrase.scale,s.scale);assert.equal(phrase.transpose,-5);assert.deepEqual(phrase.tracks[0].bars,s.tracks[0].bars.slice(4,8));phrase.tracks[0].bars[0][0]=0;assert.deepEqual(s,before);
});
test('dense thirty two bar chromatic projects stay within unchanged backup and share boundaries',()=>{
  let s=blank('🌱音芽'.repeat(10),32);s.scale='minor';s.transpose=12;s.sections.forEach(p=>p.name='段落🌱'.repeat(6));
  for(let b=0;b<32;b++){for(const t of [0,2])s.tracks[t].bars[b]=Array.from({length:16},(_,i)=>pitchId((i+b)%25));s.tracks[1].bars[b]=[7,18,15,16];}
  s=validate(s);assert.ok(Buffer.byteLength(JSON.stringify(s,null,2))<MAX_BACKUP_BYTES);assert.ok(encode(s).length<20000);assert.deepEqual(parseBackup(JSON.stringify(s,null,2)),s);assert.deepEqual(decode(encode(s)),s);
});
test('both new original examples use complete scales, expanded melody range and editable harmonic progressions',async()=>{
  for(const [id,mode] of [['tone-day','major'],['tone-dusk','minor']]){const s=preset(id);assert.equal(s.barCount,16);assert.equal(s.scale,mode);
    for(const t of [0,2])assert.ok(s.tracks[t].bars.flat().filter(n=>n>=0).every(n=>inScale(s,n)));
    const offsets=s.tracks[0].bars.flat().filter(n=>n>=0).map(n=>PITCH_VALUES[n]);assert.equal(Math.min(...offsets),0);assert.equal(Math.max(...offsets),24);assert.ok(offsets.includes(5));assert.ok(offsets.includes(mode==='major'?11:10));
    const r=await render(s);assert.ok(audible(r.outputSamplesL));assert.ok(r.outputSamplesL.every(Number.isFinite));
  }
});
test('thirty two bar shifted chromatic WAV and MP3 exports decode with complete stereo audio and retain exact loop length',async()=>{
  let s=resize(preset('tone-day'),32,'repeat');s=setTranspose(s,12);s.tempo=180;s.sections.at(-1).enabled=[true,true,true,true];s.chordVoice='chord-piano-v1';s.sections.at(-1).chordStyle='block';s.tracks[1].bars[31][3]=7;s=setPitchedNote(s,2,31,15,pitchId(24),1,2).state;
  const natural=await render(s),loop=await render(s,'loop');assert.ok(natural.outputSamplesL.length>loop.outputSamplesL.length);assert.ok(Math.abs(loop.outputSamplesL.length-32*240/180*44100)<2);
  assert.ok(natural.outputSamplesL.every(n=>Number.isFinite(n)&&Math.abs(n)<1));const wav=new DataView(wavBuffer(natural.outputSamplesL,natural.outputSamplesR,44100));assert.equal(wav.getUint32(40,true),natural.outputSamplesL.length*4);
  const bytes=encodeMp3(natural.outputSamplesL,natural.outputSamplesR,Mp3Encoder),decoder=new MPEGDecoder();await decoder.ready;
  try{const decoded=decoder.decode(bytes);assert.deepEqual(decoded.errors,[]);assert.equal(decoded.sampleRate,44100);assert.equal(decoded.channelData.length,2);assert.ok(audible(decoded.channelData[0]));assert.ok(decoded.samplesDecoded>=natural.outputSamplesL.length);assert.ok(decoded.samplesDecoded-natural.outputSamplesL.length<2304);}finally{decoder.free();}
  const canceled=new AudioRenderer();for await(const _ of canceled.generate(s)){canceled.canceled=true;}assert.equal(canceled.outputSamplesL,null);
});
