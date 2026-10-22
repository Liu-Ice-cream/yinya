import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { blank, preset, arrangementPreset, validate, resize, setPitchedNote, renameSection, setSectionTrack, insertSection, moveSection, deleteSection, copyGroup, encode, decode, parseBackup, MAX_BACKUP_BYTES, BAR_COUNTS, trackAudibleAt, hasAudibleNotes, rangeHasNotes, songJSON, wavBuffer } from '../yinya/model.js';
import { playbackRange, configurePlayback, PlaybackFollower } from '../yinya/playback.js';
import { encodeMp3 } from '../yinya/mp3.js';
import { Mp3Encoder } from '../website/yinya/vendor/lamejs.js';
import { MPEGDecoder } from 'mpg123-decoder';
await build({ stdin: { contents: 'export { AudioRenderer, phraseState } from "./yinya/render.js"; export { renderPreview, PreviewPlayer } from "./yinya/preview.js"; export { Song, Synth } from "./synth/synth.ts";', resolveDir: process.cwd(), loader: 'ts' }, bundle: true, platform: 'node', format: 'esm', outfile: 'build/yinya-sections-test.mjs' });
const { AudioRenderer, phraseState, renderPreview, PreviewPlayer, Song, Synth } = await import(pathToFileURL(resolve('build/yinya-sections-test.mjs')));
globalThis.requestAnimationFrame = callback => setImmediate(callback);
const audible = samples => samples.some(n => Math.abs(n) > .001);
async function render(state, ending = 'natural') { const r = new AudioRenderer(); for await (const _ of r.generate(state, 44100, ending)) {} return r; }

test('v1-v7 acquire all-enabled named sections without changing old instrument, performance or note data', () => {
  for (const version of [1,2,3,4,5,6,7]) {
    const old = preset('moon'); old.version = version; delete old.sections;
    if (version >= 4) old.voice = 'piano-v1'; if (version >= 5) old.chordVoice = 'chord-acoustic-guitar-v1'; if (version >= 6) old.chordStyle = 'arpeggio-v1';
    if (version < 3) delete old.tracks[0].durations; if (version < 7) delete old.tracks[2].durations;
    const before = structuredClone(old), upgraded = validate(old); assert.equal(upgraded.version, 15);
    assert.deepEqual(upgraded.sections, [{id:'s1',name:'第 1 段',enabled:[true,true,true,true],chordStyle:'inherit',drumKit:'inherit',voices:['inherit','inherit','inherit'],volumes:[100,100,100,100],endVolumes:[100,100,100,100]}]);
    assert.deepEqual(upgraded.tracks.map(t => t.bars), old.tracks.map(t => t.bars)); assert.deepEqual(old, before);
    assert.equal(upgraded.voice, old.voice); assert.equal(upgraded.chordVoice, old.chordVoice); assert.equal(upgraded.chordStyle, old.chordStyle);
    assert.deepEqual(decode('#yinya='+Buffer.from(JSON.stringify(old)).toString('base64url')), upgraded);
  }
  assert.throws(() => validate({...blank('',12),version:7}));
});

test('malformed section masks, identifiers, names and counts fail instead of silently changing the arrangement', () => {
  const state = blank('校验',8);
  for (const mutate of [s=>delete s.sections,s=>s.sections.pop(),s=>s.sections[1].id='s1',s=>s.sections[0].id='unsafe/id',s=>s.sections[0].name=' ',s=>s.sections[0].name='长'.repeat(25),s=>s.sections[0].enabled=[true],s=>s.sections[0].enabled[0]=1]) {
    const invalid = structuredClone(state);mutate(invalid);assert.throws(()=>validate(invalid));
  }
  assert.throws(()=>renameSection(state,0,''));assert.throws(()=>setSectionTrack(state,0,4,true));assert.throws(()=>setSectionTrack(state,0,0,'false'));
});

test('insert, duplicate and delete keep independent four-voice notes, lengths and section masks with bounded unique IDs', () => {
  let state = arrangementPreset(); const before=structuredClone(state);
  const empty = insertSection(state,1);assert.equal(empty.barCount,20);assert.ok(empty.tracks.every(t=>t.bars.slice(8,12).flat().every(n=>n===(t.id==='drums'?0:-1))));
  const copied=insertSection(state,1,true);assert.equal(copied.sections[2].name,'主题 副本');assert.deepEqual(copied.sections[2].enabled,state.sections[1].enabled);assert.notEqual(copied.sections[2].id,state.sections[1].id);
  copied.tracks.forEach((t,i)=>{assert.deepEqual(t.bars.slice(8,12),state.tracks[i].bars.slice(4,8));if(t.durations)assert.deepEqual(t.durations.slice(8,12),state.tracks[i].durations.slice(4,8));});
  copied.tracks[0].bars[8][0]=7;copied.sections[2].enabled[0]=false;assert.deepEqual(state,before);
  assert.deepEqual(deleteSection(insertSection(state,1,true),2),state);assert.throws(()=>deleteSection(blank(),0));
  while(state.barCount<32)state=insertSection(state,state.sections.length-1,true);
  assert.equal(new Set(state.sections.map(p=>p.id)).size,8);assert.throws(()=>insertSection(state,0));assert.deepEqual(validate(state),state);
});

test('reordering moves metadata and all tracks together, preserves stable IDs, and reverses exactly', () => {
  const state=arrangementPreset(),before=structuredClone(state),moved=moveSection(state,0,3);
  assert.deepEqual(moved.sections.map(p=>p.name),['主题','变化','结尾','前奏']);assert.equal(moved.sections[3].id,state.sections[0].id);
  moved.tracks.forEach((t,i)=>{assert.deepEqual(t.bars.slice(12),state.tracks[i].bars.slice(0,4));if(t.durations)assert.deepEqual(t.durations.slice(12),state.tracks[i].durations.slice(0,4));});
  assert.deepEqual(moveSection(moved,3,0),state);assert.deepEqual(moveSection(moveSection(state,3,1),1,3),state);assert.deepEqual(state,before);
  assert.throws(()=>moveSection(state,0,4));assert.throws(()=>moveSection(state,-1,0));
});

test('every four-bar length through 32 preserves section settings through resize, copy, Unicode links and own backups', () => {
  assert.deepEqual(BAR_COUNTS,[4,8,12,16,20,24,28,32]);
  const source=arrangementPreset();
  for(const count of BAR_COUNTS){let state=resize(source,count,'repeat');state.title='音乐🌱'.repeat(10);state.sections.forEach(p=>p.name='段落🌱'.repeat(6));
    assert.deepEqual(parseBackup(JSON.stringify(state,null,2)),state);assert.deepEqual(decode(encode(state)),state);assert.ok(Buffer.byteLength(JSON.stringify(state,null,2))<=MAX_BACKUP_BYTES);assert.ok(encode(state).length<20000);
    assert.equal(state.sections.length,count/4);assert.equal(new Set(state.sections.map(p=>p.id)).size,count/4);
    if(count>16)assert.deepEqual(state.sections[4].enabled,source.sections[0].enabled);
  }
  const expanded=resize(source,32);assert.ok(expanded.sections.slice(4).every(p=>p.enabled.every(Boolean)));assert.deepEqual(resize(expanded,16),source);
  const copied=copyGroup(source,0,8);assert.deepEqual(copied.sections[2].enabled,source.sections[0].enabled);assert.equal(copied.sections[2].name,'变化');assert.equal(copied.sections[2].id,source.sections[2].id);
});

test('the original complete example has distinct intro, theme, variation and ending with retained editable muted notes', () => {
  const state=arrangementPreset();assert.deepEqual(validate(state),state);assert.equal(state.barCount,16);assert.equal(state.voice,'piano-v1');assert.equal(state.chordStyle,'arpeggio-v1');
  assert.deepEqual(state.sections.map(p=>p.name),['前奏','主题','变化','结尾']);assert.deepEqual(state.sections.map(p=>p.enabled),[[true,false,false,false],[true,true,true,false],[true,true,true,true],[true,false,false,false]]);
  const json=songJSON(state);assert.equal(json.channels[1].patterns[0].notes.length,0);assert.ok(state.tracks[1].bars[0].some(n=>n>=0));assert.ok(json.channels[3].patterns[8].notes.length>0);assert.equal(json.channels[3].patterns[12].notes.length,0);
  assert.ok(state.tracks[2].durations[4].includes(8));assert.ok(state.tracks[0].bars[15].includes(0));assert.deepEqual(preset('journey'),state);
});

test('audibility intersects global settings and section masks while discard warnings still detect muted notes', () => {
  let state=resize(preset('sprout'),8,'repeat');state=setSectionTrack(state,1,0,false);
  assert.equal(trackAudibleAt(state,0,4),false);assert.equal(hasAudibleNotes(state,4,8,[0]),false);assert.equal(rangeHasNotes(state,4,8),true);
  assert.equal(hasAudibleNotes(state,4,8,[1]),true);state.tracks[1].enabled=false;assert.equal(hasAudibleNotes(state,4,8,[1]),false);
  state.tracks[2].volume=0;assert.equal(trackAudibleAt(state,2,4),false);
});

test('single-note and phrase auditions honor section masks before requesting audio and preserve the selected section snapshot', async () => {
  let state=resize(preset('moon'),16,'repeat');state=setSectionTrack(state,2,0,false);state=setSectionTrack(state,2,1,false);
  const player=new PreviewPlayer(()=>{throw new Error('must remain silent');});
  assert.equal(renderPreview(state,0,2,44100,{bar:8,step:0}),null);assert.equal(await player.play(state,0,2,{bar:8,step:0}),false);assert.equal(await player.playPhrase(state,8,()=>{},'duet'),false);
  const phrase=phraseState(state,8,'duet');assert.deepEqual(phrase.sections,[state.sections[2]]);assert.equal(phrase.barCount,4);phrase.sections[0].enabled[0]=true;assert.equal(state.sections[2].enabled[0],false);
  state=setSectionTrack(setSectionTrack(state,0,3,false),0,1,false);
  for(const track of [1,3]) {
    assert.equal(renderPreview(state,track,0,44100,{bar:0}),null);
    const sound=renderPreview(state,track,0,44100,{bar:4});assert.ok(audible(sound.left));assert.equal(sound.left.length,Math.ceil(.32*44100));
  }
  player.dispose();
});

test('actual rendered section muting creates silence without erasing notes or appending a muted final instrument release', async () => {
  let state=blank('段落静音',8);state.tempo=120;state.voice='piano-v1';state=setPitchedNote(state,0,0,0,3,4).state;state=setPitchedNote(state,0,7,15,3,1).state;
  state=setSectionTrack(state,0,0,false);const firstMuted=await render(state);assert.ok(firstMuted.outputSamplesL.subarray(0,8*44100).every(n=>n===0));assert.ok(audible(firstMuted.outputSamplesL.subarray(15*44100)));assert.ok(firstMuted.tailSeconds>0);
  state=setSectionTrack(setSectionTrack(state,0,0,true),1,0,false);const endingMuted=await render(state);assert.equal(endingMuted.tailSeconds,0);assert.equal(endingMuted.outputSamplesL.length,16*44100);assert.ok(endingMuted.outputSamplesL.subarray(9*44100).every(n=>Math.abs(n)<.0001));assert.equal(state.tracks[0].bars[7][15],3);
});

test('actual synth loops only the pinned section despite editor navigation, at both tempo limits and 48 kHz', () => {
  for(const tempo of [60,180]){const state=resize(preset('moon'),12,'repeat');state.tempo=tempo;const song=new Song();song.fromJsonObject(songJSON(state));const synth=new Synth(song);synth.samplesPerSecond=48000;
    const range=playbackRange(state,'section',6);configurePlayback(synth,range);synth.playhead=range.start;
    const follower=new PlaybackFollower(true,12);follower.select(10,true);
    const count=Math.ceil(synth.getSamplesPerBar()*8+2048),left=new Float32Array(count),right=new Float32Array(count);synth.synthesize(left,right,count,true);
    assert.ok(synth.playhead>=4&&synth.playhead<8);assert.equal(follower.update(synth.playhead,true).selectedBar,10);assert.ok(audible(left));assert.ok(left.every(Number.isFinite));assert.equal(song.loopStart,4);assert.equal(song.loopLength,4);
  }
});

test('play from the selected section stops at the full-song end and range validation rejects invalid transport plans', () => {
  const state=resize(preset('moon'),12,'repeat'),song=new Song();song.fromJsonObject(songJSON(state));const synth=new Synth(song);synth.samplesPerSecond=44100;
  const range=playbackRange(state,'from-section',9);configurePlayback(synth,range);synth.playhead=range.start;
  const end=Math.ceil(synth.getSamplesPerBar()*4),left=new Float32Array(end+44100),right=new Float32Array(left.length);synth.synthesize(left,right,left.length,true);
  assert.ok(audible(left.subarray(0,end)));assert.ok(left.subarray(end+100).every(n=>n===0));assert.equal(synth.loopRepeatCount,0);
  assert.throws(()=>playbackRange(state,'wrong',0));assert.throws(()=>playbackRange(state,'section',12));assert.throws(()=>configurePlayback(synth,{mode:'section',start:0,end:8}));assert.throws(()=>configurePlayback(synth,{mode:'song',start:0,end:16}));
});

test('32-bar full WAV and independently decoded MP3 retain the last section, its long note and natural release regardless of preview range', async () => {
  let state=blank('三十二小节',32);state.tempo=120;state.voice='piano-v1';state=setPitchedNote(state,0,31,8,3,8).state;
  const previewSong=new Song();previewSong.fromJsonObject(songJSON(state));const previewSynth=new Synth(previewSong);configurePlayback(previewSynth,playbackRange(state,'section',0));
  const r=await render(state),left=r.outputSamplesL,end=64*44100;assert.ok(left.length>end);assert.ok(left.subarray(0,62*44100).every(n=>n===0));assert.ok(audible(left.subarray(63*44100)));assert.ok(audible(left.subarray(end)));
  const wav=new DataView(wavBuffer(left,r.outputSamplesR,44100));assert.equal(wav.getUint32(40,true),left.length*4);
  const decoder=new MPEGDecoder();await decoder.ready;try{const decoded=decoder.decode(encodeMp3(left,r.outputSamplesR,Mp3Encoder));assert.deepEqual(decoded.errors,[]);assert.ok(decoded.samplesDecoded>=left.length&&decoded.samplesDecoded<=left.length+2304);assert.ok(audible(decoded.channelData[0].subarray(end-16000,end-6000)));assert.ok(audible(decoded.channelData[0].subarray(end+1500,end+4000)));}finally{decoder.free();}
});

test('canceling preparation of a 32-bar render returns without late output', async () => {
  const r=new AudioRenderer();for await(const _ of r.generate(resize(arrangementPreset(),32,'repeat'))){r.canceled=true;}assert.equal(r.outputSamplesL,null);assert.equal(r.outputSamplesR,null);
});
