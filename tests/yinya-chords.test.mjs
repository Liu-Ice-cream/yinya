import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { VOICES, CHORD_VOICES, melodyInstrument, chordInstrument, chordVoiceInfo, chordReleaseSeconds, releaseSeconds } from '../yinya/voices.js';
import { blank, preset, validate, songJSON, CHORDS, setMelodyNote, resize, copyGroup, encode, decode, wavBuffer } from '../yinya/model.js';
import { encodeMp3 } from '../yinya/mp3.js';
import { Mp3Encoder } from '../website/yinya/vendor/lamejs.js';
import { MPEGDecoder } from 'mpg123-decoder';
await build({ stdin: { contents: 'export { AudioRenderer, phraseState } from "./yinya/render.js"; export { renderPreview, PreviewPlayer } from "./yinya/preview.js";', resolveDir: process.cwd(), loader: 'ts' }, bundle: true, platform: 'node', format: 'esm', outfile: 'build/yinya-chords-test.mjs' });
const { AudioRenderer, phraseState, renderPreview, PreviewPlayer } = await import(pathToFileURL(resolve('build/yinya-chords-test.mjs')));
globalThis.requestAnimationFrame = callback => setImmediate(callback);
const rms = samples => Math.sqrt(samples.reduce((sum, n) => sum + n * n, 0) / samples.length);
const audible = samples => samples.some(n => Math.abs(n) > .001);
const modern = CHORD_VOICES.filter(v => !v.legacy);
async function render(state, ending = 'natural') { const r = new AudioRenderer(); for await (const _ of r.generate(state, 44100, ending)) {} return r; }
function lastChord(id, bars = 4) { const state = blank('曲尾和弦', bars); state.chordVoice = id; state.tracks[1].bars[bars - 1][3] = 0; return state; }

test('four immutable chord revisions select independently of all six melodies without changing chord pitches or rhythm', () => {
  assert.equal(CHORD_VOICES.length, 4);
  assert.deepEqual(chordInstrument('rounded', 60), melodyInstrument('rounded', 60));
  for (const melody of VOICES) for (const chord of CHORD_VOICES) {
    const state = preset('moon'); state.voice = melody.id; state.chordVoice = chord.id;
    const before = structuredClone(state), json = songJSON(state);
    assert.deepEqual(json.channels[0].instruments[0], melodyInstrument(melody.id, 80));
    assert.deepEqual(json.channels[1].instruments[0], chordInstrument(chord.id, 60));
    const note = json.channels[1].patterns[0].notes[1];
    assert.deepEqual(note.pitches, CHORDS[1]); assert.deepEqual(note.points.map(p => p.tick), [8, 12]);
    assert.deepEqual(note.points.map(p => p.volume), chord.legacy ? [65, 0] : [chord.noteVolume, chord.noteVolume]);
    json.channels[1].instruments[0].effects.length = 0;
    assert.ok(chordInstrument(chord.id, 60).effects.length); assert.deepEqual(state, before);
  }
  assert.throws(() => { modern[0].noteVolume = 100; });
  assert.throws(() => chordVoiceInfo('piano-v1'));
});

test('v1 through v4 migrate to original rounded chords, preserving v4 melody instruments and long notes', () => {
  for (const version of [1, 2, 3, 4]) {
    let old = setMelodyNote(preset('moon'), 3, 12, 3, 4).state; old.version = version;
    old.voice = version === 4 ? 'piano-v1' : 'rounded'; delete old.chordVoice;
    if (version < 3) delete old.tracks[0].durations;
    if (version === 1) delete old.barCount;
    const before = structuredClone(old), migrated = validate(old);
    assert.equal(migrated.version, 9); assert.equal(migrated.chordVoice, 'rounded'); assert.equal(migrated.voice, old.voice);
    assert.equal(migrated.tracks[0].durations[3][12], version < 3 ? 1 : 4); assert.deepEqual(old, before);
  }
  const unknown = { ...preset('moon'), chordVoice: 'chord-future-v8' }, before = structuredClone(unknown);
  assert.throws(() => validate(unknown)); assert.deepEqual(unknown, before);
});

test('both instruments survive links, JSON backups, repeat extension and group copy at every supported length', () => {
  for (const chord of CHORD_VOICES) for (const melody of VOICES) for (const bars of [4, 8, 16]) {
    let state = setMelodyNote(preset('moon'), 3, 12, 3, 4).state; state.voice = melody.id; state.chordVoice = chord.id;
    state = resize(state, bars, 'repeat');
    assert.deepEqual(decode(encode(state)), state); assert.deepEqual(validate(JSON.parse(JSON.stringify(state))), state);
    if (bars > 4) assert.deepEqual(copyGroup(state, 0, bars - 4), state);
    assert.ok(encode(state).length < 20000); assert.ok(!JSON.stringify(state).includes('harmonics'));
  }
});

test('duet phrase keeps exactly the chosen four bars and enabled melody/chord settings, with bass and drums excluded', () => {
  const state = resize(preset('moon'), 16, 'repeat'); state.voice = 'piano-v1'; state.chordVoice = 'chord-acoustic-guitar-v1';
  state.tracks[0].enabled = false; const before = structuredClone(state), duet = phraseState(state, 8, 'duet');
  assert.deepEqual(duet.tracks.map(t => t.enabled), [false, true, false, false]);
  assert.equal(duet.chordVoice, state.chordVoice); assert.equal(duet.voice, state.voice);
  duet.tracks.forEach((t, i) => { assert.deepEqual(t.bars, state.tracks[i].bars.slice(8, 12)); assert.equal(t.volume, state.tracks[i].volume); });
  duet.tracks[1].bars[0][0] = -1; assert.deepEqual(state, before);
  assert.ok(phraseState(state, 8).tracks.every(t => !t.enabled));
  assert.throws(() => phraseState(state, 0, 'all'));
});

test('all chord shapes release finite unclipped audio at tempo and device-rate limits, with calibrated accompaniment levels', () => {
  const levels = [];
  for (const voice of CHORD_VOICES) {
    const measurements = [];
    for (const row of [0, 1, 2, 3]) for (const tempo of [60, 108, 180]) for (const rate of [44100, 48000]) {
      const state = blank(); state.chordVoice = voice.id; state.tempo = tempo; state.tracks[1].bars[0][0] = row;
      const before = structuredClone(state), audio = renderPreview(state, 1, row, rate, { bar: 0, step: 0 });
      assert.equal(audio.left.length, Math.ceil((60 / tempo + chordReleaseSeconds(voice.id, tempo)) * rate));
      for (const n of audio.left) assert.ok(Number.isFinite(n) && Math.abs(n) < .99);
      assert.ok(audio.right.every(Number.isFinite)); assert.ok(audible(audio.left));
      if (!voice.legacy) assert.equal(Math.abs(audio.left.at(-1)), 0);
      if (tempo === 108 && rate === 44100) measurements.push(rms(audio.left.subarray(0, Math.floor(60 / tempo * rate))));
      assert.deepEqual(state, before);
    }
    measurements.sort((a, b) => a - b); levels.push(measurements[2]);
  }
  assert.ok(20 * Math.log10(Math.max(...levels) / Math.min(...levels)) < 3);
});

test('chord previews honor volume and mute, reject invalid positions, and retain legacy short-click behavior', () => {
  for (const voice of CHORD_VOICES) {
    const state = lastChord(voice.id); state.tracks[1].volume = 20;
    const quiet = renderPreview(state, 1, 0, 44100, { bar: 3, step: 3 }); state.tracks[1].volume = 100;
    const loud = renderPreview(state, 1, 0, 44100, { bar: 3, step: 3 }); assert.ok(rms(loud.left) > rms(quiet.left) * 2);
    state.tracks[1].volume = 0; assert.equal(renderPreview(state, 1, 0), null);
    state.tracks[1].volume = 60; state.tracks[1].enabled = false; assert.equal(renderPreview(state, 1, 0), null);
  }
  assert.equal(renderPreview(preset('moon'), 1, 1).left.length, Math.ceil(.32 * 44100));
  for (const position of [{ bar: -1, step: 0 }, { bar: 4, step: 0 }, { bar: 0, step: 4 }, { bar: 0, step: .5 }, { bar: 0, step: 1 }]) assert.throws(() => renderPreview(preset('moon'), 1, 1, 44100, position));
});

test('natural endings use the longest audible release across melody and chords; silence, mute and loop mode remain exact', async () => {
  let state = lastChord('chord-piano-v1'); state.voice = 'electric-piano-v1'; state = setMelodyNote(state, 3, 15, 3, 1).state;
  assert.equal((await render(state)).tailSeconds, chordReleaseSeconds(state.chordVoice, state.tempo));
  state.tracks[1].volume = 0; assert.equal((await render(state)).tailSeconds, releaseSeconds(state.voice, state.tempo));
  state.tracks[0].enabled = false; assert.equal((await render(state)).tailSeconds, 0);
  state.tracks[1].volume = 60; const loop = await render(state, 'loop'); assert.equal(loop.outputSamplesL.length, Math.ceil(4 * 240 / state.tempo * 44100)); assert.equal(Math.abs(loop.outputSamplesL.at(-1)), 0);
  state.tracks[1].bars[3][3] = -1; state.tracks[1].bars[0][0] = 0; assert.equal((await render(state)).tailSeconds, 0);
});

test('all new chord voices export the last beat and real release of a sixteen-bar piece to WAV and independently decoded MP3', async () => {
  for (const voice of modern) {
    const state = lastChord(voice.id, 16); state.tempo = 120;
    const output = await render(state), left = output.outputSamplesL, right = output.outputSamplesR, end = 32 * 44100;
    assert.equal(left.length, end + Math.ceil(chordReleaseSeconds(voice.id, 120) * 44100));
    assert.ok(audible(left.subarray(end))); assert.equal(Math.abs(left.at(-1)), 0);
    const wav = new DataView(wavBuffer(left, right, 44100)); assert.equal(wav.getUint32(40, true), left.length * 4);
    const decoder = new MPEGDecoder(); await decoder.ready;
    try {
      const decoded = decoder.decode(encodeMp3(left, right, Mp3Encoder));
      assert.deepEqual(decoded.errors, []); assert.equal(decoded.channelData.length, 2);
      assert.ok(decoded.samplesDecoded >= left.length && decoded.samplesDecoded <= left.length + 2304);
      assert.ok(audible(decoded.channelData[0].subarray(end + 1500, end + 4000)));
    } finally { decoder.free(); }
  }
});
function context() {
  const sources = [], buffers = [];
  return { sources, buffers, sampleRate: 44100, currentTime: 0, destination: {}, resume: () => Promise.resolve(), close: () => Promise.resolve(),
    createBuffer(channels, length, rate) { const value = { duration: length / rate, samples: [], copyToChannel(data, i) { this.samples[i] = data; } }; buffers.push(value); return value; },
    createBufferSource() { const source = { stopped: false, connect() {}, disconnect() {}, start() {}, stop() { this.stopped = true; } }; sources.push(source); return source; },
    createGain() { return { connect() {}, disconnect() {}, gain: { setValueAtTime() {}, linearRampToValueAtTime() {} } }; },
  };
}
test('chord-only duet snapshots its timbre, completes and stops before a subsequent melody preview', async () => {
  const audio = context(), player = new PreviewPlayer(() => audio), events = [], state = lastChord('chord-piano-v1');
  state.tracks[0].enabled = false;
  const pending = player.playPhrase(state, 0, active => events.push(active), 'duet'); state.chordVoice = 'rounded'; state.tracks[1].volume = 0;
  assert.equal(await pending, true); assert.ok(audible(audio.buffers[0].samples[0])); assert.ok(audio.buffers[0].duration > 4 * 240 / state.tempo);
  audio.sources[0].onended(); assert.equal(events.at(-1), false); assert.equal(player.active, null);
  state.tracks[1].volume = 60; assert.equal(await player.playPhrase(state, 0, () => {}, 'duet'), true);
  assert.equal(await player.playPhrase(state, 0), false); assert.ok(audio.sources[1].stopped);
  player.dispose();
});
test('switching from pending duet to melody prevents late sound, and muted duet never opens an audio context', async () => {
  const audio = context(), player = new PreviewPlayer(() => audio), events = []; let ready;
  audio.resume = () => new Promise(resolve => { ready = resolve; });
  const state = lastChord('chord-piano-v1'); state.tracks[0].enabled = false;
  const pending = player.playPhrase(state, 0, active => events.push(active), 'duet');
  assert.equal(await player.playPhrase(state, 0), false); ready(); assert.equal(await pending, false);
  assert.deepEqual(events, [true, false]); assert.equal(audio.sources.length, 0);
  state.tracks[1].enabled = false; audio.resume = () => { throw new Error('must remain silent'); };
  assert.equal(await player.playPhrase(state, 0, () => {}, 'duet'), false);
  player.dispose();
});
