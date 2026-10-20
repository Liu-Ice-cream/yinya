import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { MAX_BACKUP_BYTES, parseBackup, blank, preset, validate, pitchedNoteAt, setPitchedNote, removePitchedNote, setMelodyNote, songJSON, resize, copyBar, copyGroup, encode, decode, wavBuffer } from '../yinya/model.js';
import { encodeMp3 } from '../yinya/mp3.js';
import { Mp3Encoder } from '../website/yinya/vendor/lamejs.js';
import { MPEGDecoder } from 'mpg123-decoder';
await build({ stdin: { contents: 'export { AudioRenderer, phraseState } from "./yinya/render.js"; export { renderPreview, PreviewPlayer } from "./yinya/preview.js"; export { Song, Synth } from "./synth/synth.ts";', resolveDir: process.cwd(), loader: 'ts' }, bundle: true, platform: 'node', format: 'esm', outfile: 'build/yinya-bass-notes-test.mjs' });
const { AudioRenderer, phraseState, renderPreview, PreviewPlayer, Song, Synth } = await import(pathToFileURL(resolve('build/yinya-bass-notes-test.mjs')));
globalThis.requestAnimationFrame = callback => setImmediate(callback);
const audible = samples => samples.some(n => Math.abs(n) > .001);
const rms = samples => Math.sqrt(samples.reduce((sum, n) => sum + n * n, 0) / samples.length);
const bass = (state, bar, step, pitch, length) => setPitchedNote(state, 2, bar, step, pitch, length);
async function render(state, ending = 'natural') { const r = new AudioRenderer(); for await (const _ of r.generate(state, 44100, ending)) {} return r; }

test('v1 through v6 preserve separate short bass onsets, existing melody lengths, timbres and chord performance without mutating old files', () => {
  for (const version of [1, 2, 3, 4, 5, 6]) {
    let state = setMelodyNote(preset('moon'), 3, 12, 3, 4).state; state.version = version; delete state.tracks[2].durations;
    state.voice = version >= 4 ? 'piano-v1' : 'rounded'; state.chordVoice = version >= 5 ? 'chord-acoustic-guitar-v1' : 'rounded'; state.chordStyle = version >= 6 ? 'arpeggio-v1' : 'block';
    state.tracks[2].bars[0] = Array(16).fill(-1); state.tracks[2].bars[0][0] = 2; state.tracks[2].bars[0][1] = 2;
    if (version < 3) delete state.tracks[0].durations; if (version === 1) delete state.barCount;
    const before = structuredClone(state), upgraded = validate(state);
    assert.equal(upgraded.version, 10); assert.equal(upgraded.voice, state.voice); assert.equal(upgraded.chordVoice, state.chordVoice); assert.equal(upgraded.chordStyle, state.chordStyle);
    assert.deepEqual(upgraded.tracks[2].durations, Array.from({ length: 4 }, () => Array(16).fill(1)));
    assert.deepEqual(upgraded.tracks[2].bars, state.tracks[2].bars); assert.equal(upgraded.tracks[0].durations[3][12], version < 3 ? 1 : 4);
    assert.deepEqual(songJSON(upgraded).channels[2].patterns[0].notes.map(n => [n.pitches[0], ...n.points.map(p => p.tick)]), [[28, 0, 1], [28, 1, 2]]);
    assert.deepEqual(decode('#yinya=' + Buffer.from(JSON.stringify(state)).toString('base64url')), upgraded); assert.deepEqual(state, before);
  }
});

test('bass insertion, shortening, held-cell deletion and bar-end clipping preserve later notes and independent melody data', () => {
  const original = setMelodyNote(blank(), 0, 1, 5, 8).state;
  const held = bass(original, 0, 2, 2, 8).state, split = bass(held, 0, 6, 3, 4).state;
  assert.deepEqual(pitchedNoteAt(held, 2, 0, 8), { start: 2, pitch: 2, duration: 8 });
  assert.deepEqual(songJSON(split).channels[2].patterns[0].notes.map(n => [n.pitches[0], ...n.points.map(p => p.tick)]), [[28, 2, 6], [31, 6, 10]]);
  assert.equal(bass(split, 0, 2, 2, 8).duration, 4); assert.equal(bass(blank(), 0, 13, 2, 8).duration, 3);
  const removed = removePitchedNote(split, 2, 0, 8); assert.equal(removed.tracks[2].bars[0][6], -1); assert.equal(removed.tracks[2].durations[0][6], 1); assert.equal(removed.tracks[2].durations[0][2], 4);
  assert.deepEqual(split.tracks[0], original.tracks[0]); assert.equal(held.tracks[2].durations[0][2], 8); assert.ok(original.tracks[2].bars[0].every(n => n === -1));
  for (const mutate of [s => delete s.tracks[2].durations, s => s.tracks[2].durations.pop(), s => s.tracks[2].durations[0].pop(), s => s.tracks[2].durations[0][2] = 9, s => s.tracks[2].durations[0][2] = 1.5, s => s.tracks[2].durations[0][0] = 2, s => s.tracks[2].bars[0][4] = 7]) {
    const invalid = structuredClone(held); mutate(invalid); assert.throws(() => validate(invalid));
  }
  for (const args of [[1, 0, 0, 0, 1], [3, 0, 0, 0, 1], [2, -1, 0, 0, 1], [2, 0, 16, 0, 1], [2, 0, 0, 25, 1], [2, 0, 0, 0, 3]]) assert.throws(() => setPitchedNote(blank(), ...args));
  for (let step = 0; step < 16; step++) for (const length of [1, 2, 4, 8]) assert.equal(bass(blank(), 0, step, 0, length).duration, Math.min(length, 16 - step));
});

test('bass and melody durations remain independent across bar/group copies, repeat and empty extension, shares and JSON backups', () => {
  let state = bass(setMelodyNote(blank('低音🎵'.repeat(15)), 0, 0, 5, 4).state, 0, 0, 2, 8).state;
  state.voice = 'piano-v1'; state.chordVoice = 'chord-electric-piano-v1'; state.chordStyle = 'arpeggio-v1';
  const copied = copyBar(state, 2, 0, 1); assert.equal(copied.tracks[2].durations[1][0], 8); assert.equal(copied.tracks[0].bars[1][0], -1);
  copied.tracks[2].durations[1][0] = 4; assert.equal(copied.tracks[2].durations[0][0], 8);
  for (const count of [4, 8, 16]) {
    const expanded = resize(state, count, 'repeat');
    assert.deepEqual(resize(expanded, 4), state); assert.deepEqual(decode(encode(expanded)), expanded); assert.deepEqual(validate(JSON.parse(JSON.stringify(expanded))), expanded);
    assert.ok(Buffer.byteLength(JSON.stringify(expanded, null, 2)) <= MAX_BACKUP_BYTES); assert.ok(encode(expanded).length <= 20000);
    assert.equal(phraseState(expanded, count - 4, 'duet').tracks[2].durations[0][0], 8);
  }
  const groups = copyGroup(resize(state, 16), 0, 12); assert.equal(groups.tracks[2].durations[12][0], 8); assert.equal(groups.tracks[0].durations[12][0], 4);
  groups.tracks[2].durations[12][0] = 2; assert.equal(groups.tracks[2].durations[0][0], 8); assert.equal(resize(state, 16).tracks[2].durations[12][0], 1);
});

test('all bass pitches and lengths preview their full owning note at tempo/rate limits with finite audio and complete release', () => {
  for (let pitch = 0; pitch < 8; pitch++) for (const length of [1, 2, 4, 8]) for (const tempo of [60, 180]) for (const rate of [44100, 48000]) {
    const state = bass(blank(), 0, 3, pitch, length).state; state.tempo = tempo;
    const before = structuredClone(state), seconds = length * 60 / tempo / 4;
    const audio = renderPreview(state, 2, 7 - pitch, rate, { bar: 0, step: 3 + length - 1 });
    assert.equal(audio.left.length, Math.ceil((seconds + .07) * rate)); assert.ok(audio.left.every(n => Number.isFinite(n) && Math.abs(n) < .99)); assert.ok(audio.right.every(Number.isFinite));
    assert.ok(audible(audio.left.subarray(Math.floor(seconds * rate * .5), Math.floor(seconds * rate * .65))));
    assert.ok(audio.left.subarray(-Math.floor(rate * .02)).every(n => Math.abs(n) < .0001)); assert.deepEqual(state, before);
  }
});

test('bass preview honors volume/mute and stays identical when unrelated melody or chord timbres change', () => {
  const state = bass(blank(), 0, 0, 2, 8).state, pos = { bar: 0, step: 0 };
  const original = renderPreview(state, 2, 5, 44100, pos);
  state.voice = 'piano-v1'; state.chordVoice = 'chord-piano-v1'; state.chordStyle = 'arpeggio-v1';
  const changed = renderPreview(state, 2, 5, 44100, pos); assert.ok(original.left.every((n, i) => Math.abs(n - changed.left[i]) < .00001));
  state.tracks[2].volume = 20; const quiet = renderPreview(state, 2, 5, 44100, pos); state.tracks[2].volume = 100; assert.ok(rms(renderPreview(state, 2, 5, 44100, pos).left) > rms(quiet.left) * 2);
  state.tracks[2].volume = 0; assert.equal(renderPreview(state, 2, 5, 44100, pos), null); state.tracks[2].volume = 60; state.tracks[2].enabled = false; assert.equal(renderPreview(state, 2, 5, 44100, pos), null);
  state.tracks[2].enabled = true; assert.throws(() => renderPreview(state, 2, 0, 44100, pos)); assert.throws(() => renderPreview(state, 2, 5, 44100, { bar: 0, step: 15 }));
});

test('4/8/16-bar WAV and independently decoded MP3 sustain the last-bar bass, while short bass releases and preview matches export', async () => {
  for (const count of [4, 8, 16]) {
    const state = bass(blank('贝斯长音导出', count), count - 1, 0, 2, 8).state; state.tempo = 120;
    const r = await render(state), left = r.outputSamplesL, start = (count - 1) * 2 * 44100;
    assert.equal(left.length, count * 2 * 44100); assert.equal(r.tailSeconds, 0); assert.ok(left.subarray(0, start).every(n => n === 0));
    assert.ok(audible(left.subarray(start + 22050, start + 26460))); assert.ok(left.subarray(start + 52920).every(n => Math.abs(n) < .0001));
    const preview = renderPreview(state, 2, 5, 44100, { bar: count - 1, step: 4 }); assert.ok(preview.left.every((n, i) => Math.abs(n - left[start + i]) < .0001));
    const wav = new DataView(wavBuffer(left, r.outputSamplesR, 44100)); assert.equal(wav.getUint32(40, true), left.length * 4); assert.ok(Array.from({ length: 100 }, (_, i) => wav.getInt16(44 + (start + 22050 + i) * 4, true)).some(n => Math.abs(n) > 32));
    const decoder = new MPEGDecoder(); await decoder.ready;
    try { const decoded = decoder.decode(encodeMp3(left, r.outputSamplesR, Mp3Encoder)); assert.deepEqual(decoded.errors, []); assert.ok(decoded.samplesDecoded >= left.length && decoded.samplesDecoded <= left.length + 2304); assert.ok(audible(decoded.channelData[0].subarray(start + 24000, start + 28000))); assert.ok(decoded.channelData[0].subarray(start + 58000).every(n => Math.abs(n) < .0001)); }
    finally { decoder.free(); }
    const short = renderPreview(bass(state, count - 1, 0, 2, 1).state, 2, 5, 44100, { bar: count - 1, step: 0 }); assert.ok(short.left.length < 10000);
  }
});

test('a bass held to the final bar boundary stays within full-loop timing at both tempo limits and preserves repeated attacks', () => {
  for (const tempo of [60, 180]) {
    let state = bass(blank('循环贝斯', 4), 3, 8, 2, 8).state; state.tempo = tempo;
    state = bass(state, 0, 0, 2, 1).state; state = bass(state, 0, 1, 2, 1).state;
    const song = new Song(); song.fromJsonObject(songJSON(state)); const synth = new Synth(song); synth.samplesPerSecond = 48000;
    const samples = Math.ceil(synth.getSamplesPerBar() * 4), left = new Float32Array(samples + 2000), right = new Float32Array(left.length); synth.synthesize(left, right, left.length, true);
    assert.ok(audible(left.subarray(samples - Math.floor(60 / tempo / 4 * 48000), samples - 1000))); assert.ok(audible(left.subarray(samples + 200, samples + 1800)));
    assert.ok(synth.playhead < 1 && synth.playhead > 0); assert.ok(left.every(Number.isFinite));
    assert.deepEqual(songJSON(state).channels[2].patterns[0].notes.map(n => n.points.map(p => p.tick)), [[0, 1], [1, 2]]);
  }
});

test('pending bass audition snapshots duration and cancels cleanly before late audio can start', async () => {
  let ready; const sources = [], buffers = [];
  const context = { sampleRate: 48000, currentTime: 0, destination: {}, resume: () => new Promise(resolve => { ready = resolve; }), close: () => Promise.resolve(),
    createBuffer(channels, length, rate) { const b = { duration: length / rate, copyToChannel() {} }; buffers.push(b); return b; },
    createBufferSource() { const source = { stopped: false, connect() {}, disconnect() {}, start() {}, stop() { this.stopped = true; } }; sources.push(source); return source; },
    createGain() { return { connect() {}, disconnect() {}, gain: { setValueAtTime() {}, linearRampToValueAtTime() {} } }; },
  };
  const player = new PreviewPlayer(() => context), state = bass(blank(), 0, 0, 2, 8).state;
  const pending = player.play(state, 2, 5, { bar: 0, step: 4 }); state.tracks[2].durations[0][0] = 1; ready(); assert.equal(await pending, true);
  assert.equal(buffers[0].duration, Math.ceil((8 * 60 / 108 / 4 + .07) * 48000) / 48000);
  const canceled = player.play(state, 2, 5, { bar: 0, step: 0 }); player.stop(); ready(); assert.equal(await canceled, false); assert.equal(sources.length, 1); assert.ok(sources[0].stopped); player.dispose();
});

test('the app can reimport its full sixteen-bar pretty JSON backup, while oversized or malformed backups fail clearly', () => {
  const state = resize(preset('moon'), 16, 'repeat'); state.title = '音'.repeat(60);
  const backup = JSON.stringify(state, null, 2); assert.ok(Buffer.byteLength(backup) > 20000); assert.deepEqual(parseBackup(backup), validate(state));
  const compact = JSON.stringify(blank('')), padded = compact + ' '.repeat(MAX_BACKUP_BYTES - Buffer.byteLength(compact));
  assert.deepEqual(parseBackup(padded), validate(blank(''))); assert.throws(() => parseBackup(padded + ' '));
  assert.throws(() => parseBackup('not json')); assert.throws(() => parseBackup(JSON.stringify({ ...state, version: 11 })));
});
