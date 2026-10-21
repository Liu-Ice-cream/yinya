import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {blank,preset,validate,songJSON,CHORDS,CHORD_STYLES,chordNotes,sectionChordStyle,setSectionChordStyle,setNoteVelocity,setPitchedNote,removePitchedNote,pitchedNoteAt,applyDrumPattern,resize,copyBar,copyGroup,insertSection,moveSection,deleteSection,encode,decode,parseBackup,MAX_BACKUP_BYTES,wavBuffer} from '../yinya/model.js';
import {BASS_VOICES,bassVoiceInfo,bassInstrument,bassReleaseSeconds,CHORD_VOICES,chordReleaseSeconds} from '../yinya/voices.js';
import {DRUM_PATTERNS,drumPattern} from '../yinya/grooves.js';
import {encodeMp3} from '../yinya/mp3.js';
import {Mp3Encoder} from '../website/yinya/vendor/lamejs.js';
import {MPEGDecoder} from 'mpg123-decoder';
await build({stdin:{contents:'export {AudioRenderer,phraseState} from "./yinya/render.js"; export {renderPreview,PreviewPlayer} from "./yinya/preview.js"; export {audioSong} from "./yinya/song.js"; export {Synth} from "./synth/synth.ts";',resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',outfile:'build/yinya-grooves-test.mjs'});
const {AudioRenderer,phraseState,renderPreview,PreviewPlayer,audioSong,Synth}=await import('../build/yinya-grooves-test.mjs');
globalThis.requestAnimationFrame=callback=>setImmediate(callback);
const rms=a=>Math.sqrt(a.reduce((sum,n)=>sum+n*n,0)/a.length);
const audible=a=>a.some(n=>Math.abs(n)>.001);
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
async function render(s,ending='natural'){const r=new AudioRenderer();for await(const _ of r.generate(s,44100,ending)){}return r;}
function bass(voice='square',pitch=3,length=8){const s=setPitchedNote(blank(),2,0,0,pitch,length).state;s.bassVoice=voice;return s;}

test('frozen v0.7.0 fixtures retain exact original song conversion for v1-v8, including arranged sections',async()=>{
  const fixture=JSON.parse(await readFile(new URL('./fixtures/yinya-v070-compat.json',import.meta.url)));
  for(const {state,songSha256} of fixture.cases){const before=structuredClone(state),next=validate(state);
    assert.equal(next.version,13);assert.equal(next.bassVoice,'square');assert.ok(next.sections.every(p=>p.chordStyle==='inherit'));
    assert.ok(next.tracks.filter(t=>t.velocities).every(t=>t.velocities.flat().every(n=>n===1)));
    assert.equal(createHash('sha256').update(JSON.stringify(canonical(songJSON(next)))).digest('hex'),songSha256);assert.deepEqual(state,before);
  }
});

test('unknown bass revisions, section rhythms and malformed or noncanonical velocities are rejected',()=>{
  for(const mutate of [s=>s.bassVoice='unknown',s=>s.sections[0].chordStyle='unknown',s=>delete s.sections[0].chordStyle,s=>delete s.tracks[0].velocities,s=>s.tracks[2].velocities.pop(),s=>s.tracks[0].velocities[0].pop(),s=>s.tracks[0].velocities[0][0]=3,s=>s.tracks[0].velocities[0][0]=.5,s=>s.tracks[0].velocities[0][0]=false,s=>s.tracks[0].velocities[0][0]=0]){
    const s=blank();mutate(s);assert.throws(()=>validate(s));
  }
  assert.throws(()=>setSectionChordStyle(blank(),2,'block'));assert.throws(()=>bassInstrument('unknown',60));
});

test('held-note velocity editing, split insertion, duration changes and deletion retain independent onset levels',()=>{
  let s=setPitchedNote(blank(),0,0,0,3,8,2).state;s=setNoteVelocity(s,0,0,6,0);assert.equal(s.tracks[0].velocities[0][0],0);
  const longer=setPitchedNote(s,0,0,0,3,8).state;assert.equal(longer.tracks[0].velocities[0][0],0);
  const split=setPitchedNote(s,0,0,4,5,4,2).state;assert.equal(pitchedNoteAt(split,0,0,1).duration,4);assert.equal(split.tracks[0].velocities[0][0],0);assert.equal(split.tracks[0].velocities[0][4],2);
  const removed=removePitchedNote(split,0,0,6);assert.equal(removed.tracks[0].velocities[0][4],1);assert.equal(removed.tracks[0].velocities[0][0],0);assert.deepEqual(validate(removed),removed);
  assert.throws(()=>setNoteVelocity(blank(),0,0,0,2));assert.throws(()=>setNoteVelocity(s,0,0,0,3));assert.throws(()=>setPitchedNote(blank(),2,0,0,3,4,3));
});

test('copies, section reordering, duplication, deletion and repeat extension preserve rhythm overrides and all velocities deeply',()=>{
  const original=preset('groove-pop'),before=structuredClone(original);
  for(const track of [0,2]){const copied=copyBar(original,track,4,0);assert.deepEqual(copied.tracks[track].velocities[0],original.tracks[track].velocities[4]);copied.tracks[track].velocities[0][0]=0;assert.deepEqual(original,before);}
  const copied=copyGroup(original,4,0);assert.equal(copied.sections[0].chordStyle,original.sections[1].chordStyle);assert.equal(copied.sections[0].name,'前奏');
  const doubled=insertSection(original,1,true);assert.equal(doubled.sections[2].chordStyle,original.sections[1].chordStyle);assert.deepEqual(doubled.tracks[2].velocities.slice(8,12),original.tracks[2].velocities.slice(4,8));assert.deepEqual(deleteSection(doubled,2),original);
  assert.deepEqual(moveSection(moveSection(original,0,3),3,0),original);
  const expanded=resize(original,32,'repeat');assert.equal(expanded.sections[4].chordStyle,original.sections[0].chordStyle);assert.deepEqual(expanded.tracks[0].velocities.slice(16),original.tracks[0].velocities);
  const empty=insertSection(original,0);assert.ok(empty.tracks[2].velocities.slice(4,8).flat().every(n=>n===1));assert.equal(empty.sections[1].chordStyle,'inherit');assert.deepEqual(original,before);
});

test('all six original drum templates fill only the requested bars, with an editable last-bar fill and immutable source data',()=>{
  assert.equal(DRUM_PATTERNS.length,6);assert.equal(new Set(DRUM_PATTERNS.map(p=>p.id)).size,6);
  const original=preset('groove-night'),before=structuredClone(original);
  for(const p of DRUM_PATTERNS){assert.throws(()=>p.bars[0][0]=7);
    const filled=applyDrumPattern(original,4,4,p.id,true);for(const track of [0,1,2])assert.deepEqual(filled.tracks[track],original.tracks[track]);assert.deepEqual(filled.sections,original.sections);
    assert.deepEqual(filled.tracks[3].bars.slice(0,4),original.tracks[3].bars.slice(0,4));assert.deepEqual(filled.tracks[3].bars.slice(8),original.tracks[3].bars.slice(8));
    for(let i=0;i<4;i++)assert.deepEqual(filled.tracks[3].bars[4+i],drumPattern(p.id,i,i===3));
    assert.ok(filled.tracks[3].bars.flat().every(n=>Number.isInteger(n)&&n>=0&&n<=7));filled.tracks[3].bars[4][0]=0;assert.deepEqual(original,before);
    const single=applyDrumPattern(original,5,1,p.id);assert.deepEqual(single.tracks[3].bars[5],drumPattern(p.id));
  }
  for(const args of [[3,4,'pop-v1'],[0,2,'pop-v1'],[16,1,'pop-v1'],[0,1,'unknown'],[0,1,'pop-v1','false']])assert.throws(()=>applyDrumPattern(original,...args));
});

test('all five chord rhythms survive the actual parser without overlaps, dropped notes or crossing a chosen beat',()=>{
  assert.equal(CHORD_STYLES.length,5);
  for(const style of CHORD_STYLES)for(const voice of CHORD_VOICES)for(let row=0;row<4;row++)for(let beat=0;beat<4;beat++){
    const notes=chordNotes(row,beat,voice.id,style.id);let end=beat*4;
    for(const n of notes){assert.ok(n.points[0].tick>=end);end=n.points.at(-1).tick;assert.ok(end<=(beat+1)*4);assert.ok(n.pitches.every(p=>CHORDS[row].includes(p)));}
    const s=blank();s.chordVoice=voice.id;s.chordStyle=style.id;s.tracks[1].bars[0][beat]=row;const parsed=audioSong(songJSON(s));assert.equal(parsed.channels[1].patterns[0].notes.length,notes.length);
    if(style.id==='strum-v1'){assert.deepEqual(notes.map(n=>n.pitches.length),[1,2,3]);assert.deepEqual(notes.map(n=>n.points[0].tick),[0,.5,1].map(n=>n+beat*4));}
    if(style.id==='staccato-v1')assert.equal(end,beat*4+3);
  }
});

test('section rhythm overrides inherit the global choice and remain attached through copies and phrase snapshots',()=>{
  let s=resize(preset('moon'),8,'repeat');s=setSectionChordStyle(s,1,'strum-v1');s.chordStyle='staccato-v1';
  assert.equal(sectionChordStyle(s,0),'staccato-v1');assert.equal(sectionChordStyle(s,4),'strum-v1');
  assert.equal(songJSON(s).channels[1].patterns[4].notes.length,6);assert.equal(songJSON(s).channels[1].patterns[0].notes.length,4);
  const phrase=phraseState(s,4,'duet');assert.equal(sectionChordStyle(phrase,0),'strum-v1');assert.deepEqual(phrase.tracks[0].velocities,s.tracks[0].velocities.slice(4,8));
  const copied=copyGroup(s,4,0);assert.equal(sectionChordStyle(copied,0),'strum-v1');s=setSectionChordStyle(s,1,'inherit');assert.equal(sectionChordStyle(s,4),'staccato-v1');
});

test('new chord previews use the actual selected section rhythm at tempo and device-rate limits',()=>{
  for(const style of ['strum-v1','staccato-v1','arpeggio-rise-v1'])for(const voice of CHORD_VOICES)for(const tempo of [60,180])for(const rate of [44100,48000]){
    let s=blank('',8);s.tempo=tempo;s.chordVoice=voice.id;s.tracks[1].bars[4][3]=2;s=setSectionChordStyle(s,1,style);s.sections[0].enabled[1]=false;
    const preview=renderPreview(s,1,2,rate,{bar:4,step:3});assert.ok(audible(preview.left));assert.ok(preview.left.every(Number.isFinite));
    const json=songJSON(s);json.channels=[json.channels[1]];json.loopBars=1;json.channels[0].patterns=[{notes:chordNotes(2,0,voice.id,style)}];json.channels[0].sequence=[1];
    const synth=new Synth(audioSong(json));synth.samplesPerSecond=rate;synth.loopRepeatCount=0;const left=new Float32Array(preview.left.length),right=new Float32Array(left.length);synth.synthesize(left,right,left.length,true);
    const count=Math.floor(60/tempo*rate)-Math.ceil(rate*.02);assert.ok(rms(preview.left.subarray(0,count).map((n,i)=>n-left[i]))<.00001);
  }
});

test('every bass revision renders all pitches and durations with finite audio at tempo and device-rate limits',()=>{
  for(const voice of BASS_VOICES)for(const pitch of [0,1,2,3,4,5,6,7])for(const length of [1,2,4,8])for(const tempo of [60,180])for(const rate of [44100,48000]){
    const s=bass(voice.id,pitch,length);s.tempo=tempo;const a=renderPreview(s,2,7-pitch,rate,{bar:0,step:0});assert.ok(audible(a.left));assert.ok(a.left.every(n=>Number.isFinite(n)&&Math.abs(n)<1));assert.equal(a.left.length,Math.ceil((length*60/tempo/4+bassReleaseSeconds(voice.id,tempo))*rate));
  }
  assert.throws(()=>{BASS_VOICES[1].settings.operators[0].amplitude=99;});
});

test('light, standard and strong notes produce strictly ordered audible levels, including legacy square wave',()=>{
  for(const track of [0,2])for(const voice of track===0?['triangle','rounded','square','piano-v1','electric-piano-v1','acoustic-guitar-v1']:BASS_VOICES.map(v=>v.id)){
    const s=setPitchedNote(blank(),track,0,0,3,8).state;s[track===0?'voice':'bassVoice']=voice;const levels=[];
    for(const level of [0,1,2]){const a=renderPreview(setNoteVelocity(s,track,0,0,level),track,4,44100,{bar:0,step:0});levels.push(rms(a.left));assert.ok(a.left.every(n=>Number.isFinite(n)&&Math.abs(n)<1));}
    assert.ok(levels[0]<levels[1]*.9,`${voice}: light ${levels}`);assert.ok(levels[2]>levels[1]*1.05,`${voice}: strong ${levels}`);
  }
});

test('bass accompaniment levels remain within five dB on a shared pitch and duration set',()=>{
  const medians=BASS_VOICES.map(v=>{const values=[];for(const pitch of [0,3,5,7])for(const length of [2,8]){const a=renderPreview(bass(v.id,pitch,length),2,7-pitch,44100,{bar:0,step:0});values.push(rms(a.left));}values.sort((a,b)=>a-b);return values[4];});
  assert.ok(20*Math.log10(Math.max(...medians)/Math.min(...medians))<=5,`bass medians: ${medians}`);
});

test('bass velocity and timbre previews match full rendered PCM and respect mute without opening an audio context',async()=>{
  for(const voice of BASS_VOICES)for(const level of [0,2]){let s=setNoteVelocity(bass(voice.id),2,0,0,level);s.tracks.forEach((t,i)=>t.enabled=i===2);
    const preview=renderPreview(s,2,4,44100,{bar:0,step:0}),full=await render(s);const count=4410;assert.ok(rms(preview.left.subarray(0,count).map((n,i)=>n-full.outputSamplesL[i]))<.00001);
    s.sections[0].enabled[2]=false;const player=new PreviewPlayer(()=>{throw new Error('must not open sound');});assert.equal(await player.play(s,2,4,{bar:0,step:0}),false);player.dispose();
  }
});

test('natural endings use actual final chord release and the new audible bass, with exact loops and silent muted tails',async()=>{
  let s=blank();s.tempo=120;s.chordVoice='chord-piano-v1';s.chordStyle='staccato-v1';s.tracks[1].bars[3][3]=0;
  const chord=await render(s);assert.equal(chord.tailSeconds,Math.max(0,chordReleaseSeconds(s.chordVoice,s.tempo)-.125));
  s=setPitchedNote(blank(),2,3,8,3,8,2).state;s.bassVoice='bass-pluck-v1';s.tempo=120;const natural=await render(s),loop=await render(s,'loop');assert.equal(natural.tailSeconds,bassReleaseSeconds(s.bassVoice,120));assert.ok(natural.outputSamplesL.length>8*44100);assert.equal(loop.outputSamplesL.length,8*44100);assert.ok(audible(natural.outputSamplesL.subarray(8*44100)));
  s.sections[0].enabled[2]=false;const muted=await render(s);assert.equal(muted.tailSeconds,0);assert.ok(muted.outputSamplesL.every(n=>n===0));
});

test('32-bar WAV and independently decoded MP3 keep strong new bass and its final release for both new revisions',async()=>{
  for(const voice of BASS_VOICES.filter(v=>!v.legacy)){let s=setPitchedNote(blank('',32),2,31,8,3,8,2).state;s.bassVoice=voice.id;s.tempo=120;const r=await render(s),end=64*44100;
    const wav=new DataView(wavBuffer(r.outputSamplesL,r.outputSamplesR,44100));assert.equal(wav.getUint32(24,true),44100);assert.equal(wav.getUint32(40,true),r.outputSamplesL.length*4);assert.ok(audible(r.outputSamplesL.subarray(end)));
    const decoder=new MPEGDecoder();await decoder.ready;try{const decoded=decoder.decode(encodeMp3(r.outputSamplesL,r.outputSamplesR,Mp3Encoder));assert.deepEqual(decoded.errors,[]);assert.ok(decoded.samplesDecoded>=r.outputSamplesL.length&&decoded.samplesDecoded<=r.outputSamplesL.length+2304);assert.ok(audible(decoded.channelData[0].subarray(end-10000,end-1000)));assert.ok(audible(decoded.channelData[0].subarray(end+1500,end+3000)));}finally{decoder.free();}
  }
});

test('three complete original examples render and persist all performance settings within existing backup and share limits',async()=>{
  for(const id of ['groove-pop','groove-night','groove-pixel']){let s=preset(id);assert.equal(s.barCount,16);assert.equal(s.version,13);assert.equal(new Set(s.sections.map(p=>p.name)).size,4);assert.ok(s.tracks[0].velocities.flat().includes(0));assert.ok(s.tracks[0].velocities.flat().includes(2));const r=await render(s);assert.ok(audible(r.outputSamplesL));assert.ok(r.outputSamplesL.every(Number.isFinite));
    s=resize(s,32,'repeat');s.title='🌱音芽'.repeat(10);s.sections.forEach(p=>p.name='段落🌱'.repeat(6));assert.ok(Buffer.byteLength(JSON.stringify(s,null,2))<MAX_BACKUP_BYTES);assert.ok(encode(s).length<20000);assert.deepEqual(parseBackup(JSON.stringify(s,null,2)),s);assert.deepEqual(decode(encode(s)),s);
    const canceled=new AudioRenderer();for await(const _ of canceled.generate(s)){canceled.canceled=true;}assert.equal(canceled.outputSamplesL,null);
  }
});
