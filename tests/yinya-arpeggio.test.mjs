import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { blank, preset, validate, songJSON, CHORDS, CHORD_STYLES, chordStyleInfo, resize, copyGroup, copyBar, setMelodyNote, encode, decode, wavBuffer } from '../yinya/model.js';
import { CHORD_VOICES, chordReleaseSeconds } from '../yinya/voices.js';
import { encodeMp3 } from '../yinya/mp3.js';
import { Mp3Encoder } from '../website/yinya/vendor/lamejs.js';
import { MPEGDecoder } from 'mpg123-decoder';
await build({ stdin: { contents: 'export { AudioRenderer, phraseState } from "./yinya/render.js"; export { renderPreview, PreviewPlayer } from "./yinya/preview.js"; export { Song, Synth } from "./synth/synth.ts";', resolveDir: process.cwd(), loader: 'ts' }, bundle: true, platform: 'node', format: 'esm', outfile: 'build/yinya-arpeggio-test.mjs' });
const { AudioRenderer, phraseState, renderPreview, PreviewPlayer, Song, Synth } = await import(pathToFileURL(resolve('build/yinya-arpeggio-test.mjs')));
globalThis.requestAnimationFrame = callback => setImmediate(callback);
const audible = samples => samples.some(n => Math.abs(n) > .001);
const rms = samples => Math.sqrt(samples.reduce((sum, n) => sum + n * n, 0) / samples.length);
async function render(state, ending = 'natural') { const r = new AudioRenderer(); for await (const _ of r.generate(state, 44100, ending)) {} return r; }
function arpeggio(voice = 'chord-acoustic-guitar-v1', count = 4) { const s = blank('分解和弦', count); s.chordVoice = voice; s.chordStyle = 'arpeggio-v1'; return s; }

test('arpeggios expand each chosen beat into low-middle-high-middle sixteenths, preserving rests, grid data and other layers', () => {
  assert.deepEqual(CHORD_STYLES.map(s => s.id), ['block', 'arpeggio-v1']); assert.throws(() => { CHORD_STYLES[1].id = 'other'; });
  for (const voice of CHORD_VOICES) for (let row = 0; row < 4; row++) for (let beat = 0; beat < 4; beat++) {
    const state = preset('moon'); state.chordVoice = voice.id; state.chordStyle = 'arpeggio-v1'; state.tracks[1].bars[0] = [-1, -1, -1, -1]; state.tracks[1].bars[0][beat] = row;
    const before = structuredClone(state), json = songJSON(state), notes = json.channels[1].patterns[0].notes;
    assert.deepEqual(notes.map(n => n.pitches), [CHORDS[row][0], CHORDS[row][1], CHORDS[row][2], CHORDS[row][1]].map(n => [n]));
    assert.deepEqual(notes.map(n => n.points.map(p => p.tick)), [0, 1, 2, 3].map(i => [beat * 4 + i, beat * 4 + i + 1]));
    assert.ok(notes.every(n => n.points[0].tick >= 0 && n.points[1].tick <= 16));
    const block = songJSON({ ...state, chordStyle: 'block' });
    assert.deepEqual(json.channels[1].instruments, block.channels[1].instruments);
    for (const index of [0, 2, 3]) assert.deepEqual(json.channels[index], block.channels[index]);
    assert.deepEqual(state, before);
  }
});

test('v1 through v5 migrate to block performance, retaining v5 chord timbre, v4 melody and v3 durations', () => {
  for (const version of [1, 2, 3, 4, 5]) {
    let state = setMelodyNote(preset('moon'), 3, 12, 3, 4).state; state.version = version;
    state.voice = version >= 4 ? 'piano-v1' : 'rounded'; state.chordVoice = version >= 5 ? 'chord-electric-piano-v1' : 'rounded'; delete state.chordStyle;
    if (version < 3) delete state.tracks[0].durations; if (version === 1) delete state.barCount;
    const before = structuredClone(state), upgraded = validate(state);
    assert.equal(upgraded.version, 8); assert.equal(upgraded.chordStyle, 'block'); assert.equal(upgraded.voice, state.voice); assert.equal(upgraded.chordVoice, state.chordVoice);
    assert.equal(upgraded.tracks[0].durations[3][12], version < 3 ? 1 : 4); assert.deepEqual(state, before);
    const notes = songJSON(upgraded).channels[1].patterns[0].notes;
    assert.equal(notes.length, 2); assert.deepEqual(notes.map(n => n.points.map(p => p.tick)), [[0, 4], [8, 12]]);
  }
});

test('performance choice survives links, backups, copies and resizing; unknown revisions fail without altering source data', () => {
  for (const style of CHORD_STYLES) for (const voice of CHORD_VOICES) for (const count of [4, 8, 16]) {
    const state = resize(preset('moon'), count, 'repeat'); state.chordVoice = voice.id; state.chordStyle = style.id;
    assert.deepEqual(decode(encode(state)), state); assert.deepEqual(validate(JSON.parse(JSON.stringify(state))), state);
    assert.equal(copyBar(state, 1, 0, 1).chordStyle, style.id); assert.equal(resize(state, 4).chordStyle, style.id);
    if (count > 4) assert.deepEqual(copyGroup(state, 0, count - 4), state);
    assert.equal(phraseState(state, count - 4, 'duet').chordStyle, style.id);
    assert.ok(encode(state).length < 20000);
  }
  const bad = { ...preset('moon'), chordStyle: 'arpeggio-future-v9' }, before = structuredClone(bad);
  assert.throws(() => validate(bad)); assert.throws(() => chordStyleInfo('unknown')); assert.deepEqual(bad, before);
});

test('single-beat previews render all four actual attacks at tempo/rate limits, matching an independently sequenced synth', () => {
  for (const voice of CHORD_VOICES) for (let row = 0; row < 4; row++) for (const tempo of [60, 180]) for (const rate of [44100, 48000]) {
    const state = arpeggio(voice.id); state.tempo = tempo; state.tracks[1].bars[3][3] = row;
    const before = structuredClone(state), audio = renderPreview(state, 1, row, rate, { bar: 3, step: 3 });
    assert.equal(audio.left.length, Math.ceil((60 / tempo + chordReleaseSeconds(voice.id, tempo)) * rate));
    assert.ok(audio.left.every(n => Number.isFinite(n) && Math.abs(n) < .99)); assert.ok(audio.right.every(Number.isFinite));
    for (let step = 0; step < 4; step++) assert.ok(audible(audio.left.subarray(Math.ceil(step * 15 / tempo * rate), Math.floor((step + 1) * 15 / tempo * rate))));
    assert.equal(Math.abs(audio.left.at(-1)), 0); assert.deepEqual(state, before);
    const json = songJSON({ ...state, chordStyle: 'block' }); json.channels = [json.channels[1]]; json.loopBars = 1;
    const volume = voice.legacy ? 65 : voice.noteVolume;
    json.channels[0].patterns = [{ notes: [CHORDS[row][0], CHORDS[row][1], CHORDS[row][2], CHORDS[row][1]].map((pitch, step) => ({ pitches: [pitch], points: [{ tick: step, pitchBend: 0, volume }, { tick: step + 1, pitchBend: 0, volume: voice.legacy ? 0 : volume }] })) }]; json.channels[0].sequence = [1];
    const song = new Song(); song.fromJsonObject(json); const synth = new Synth(song); synth.samplesPerSecond = rate; synth.loopRepeatCount = 0;
    const left = new Float32Array(audio.left.length), right = new Float32Array(left.length); synth.synthesize(left, right, left.length, true);
    const length = Math.floor(60 / tempo * rate);
    assert.ok(rms(audio.left.subarray(0, length).map((n, i) => n - left[i])) < .00001);
  }
});

test('default chord previews follow performance mode; mute, zero volume and invalid selected beats remain safe', () => {
  const state = arpeggio(); state.tracks[1].bars[0][1] = 0;
  const generic = renderPreview(state, 1, 0), clicked = renderPreview(state, 1, 0, 44100, { bar: 0, step: 1 });
  assert.equal(generic.left.length, clicked.left.length); assert.ok(generic.left.every((n, i) => Math.abs(n - clicked.left[i]) < .00001));
  state.tracks[1].volume = 20; const quiet = renderPreview(state, 1, 0); state.tracks[1].volume = 100; assert.ok(rms(renderPreview(state, 1, 0).left) > 2 * rms(quiet.left));
  state.tracks[1].volume = 0; assert.equal(renderPreview(state, 1, 0), null); state.tracks[1].volume = 60; state.tracks[1].enabled = false; assert.equal(renderPreview(state, 1, 0), null);
  state.tracks[1].enabled = true; assert.throws(() => renderPreview(state, 1, 0, 44100, { bar: 0, step: 0 }));
});

test('natural endings retain new-instrument arpeggio release; rounded wave and loop exports stay exact and rests add no tail', async () => {
  for (const voice of CHORD_VOICES) for (const tempo of [60, 180]) {
    const state = arpeggio(voice.id); state.tempo = tempo; state.tracks[1].bars[3][3] = 0;
    const natural = await render(state), loop = await render(state, 'loop'), end = Math.ceil(4 * 240 / tempo * 44100);
    assert.equal(natural.tailSeconds, voice.legacy ? 0 : chordReleaseSeconds(voice.id, tempo)); assert.equal(natural.outputSamplesL.length, end + Math.ceil(natural.tailSeconds * 44100));
    if (!voice.legacy) assert.ok(audible(natural.outputSamplesL.subarray(end)), voice.id); assert.ok(Math.abs(natural.outputSamplesL.at(-1)) < .0001);
    assert.equal(loop.outputSamplesL.length, end); assert.ok(Math.abs(loop.outputSamplesL.at(-1)) < .0001);
    state.tracks[1].bars[3][3] = -1; state.tracks[1].bars[0][0] = 0; assert.equal((await render(state)).tailSeconds, 0);
  }
});

test('sixteen-bar WAV and independently decoded MP3 preserve the last arpeggio beat and its release for every chord voice', async () => {
  for (const voice of CHORD_VOICES) {
    const state = arpeggio(voice.id, 16); state.tempo = 120; state.tracks[1].bars[15][3] = 0;
    const r = await render(state), left = r.outputSamplesL, right = r.outputSamplesR, end = 32 * 44100;
    const wav = new DataView(wavBuffer(left, right, 44100)); assert.equal(wav.getUint32(40, true), left.length * 4);
    for (let step = 0; step < 4; step++) assert.ok(audible(left.subarray(end - 22050 + step * 5512, end - 22050 + (step + 1) * 5512)));
    const decoder = new MPEGDecoder(); await decoder.ready;
    try { const decoded = decoder.decode(encodeMp3(left, right, Mp3Encoder));
      assert.deepEqual(decoded.errors, []); assert.equal(decoded.channelData.length, 2); assert.ok(decoded.samplesDecoded >= left.length && decoded.samplesDecoded <= left.length + 2304);
      assert.ok(audible(decoded.channelData[0].subarray(end - 3000, end))); if (!voice.legacy) assert.ok(audible(decoded.channelData[0].subarray(end + 1500, end + 2500)), voice.id);
    } finally { decoder.free(); }
  }
});

test('pending preview snapshots the old performance, and stop cancels a duet being prepared after a mode change', async () => {
  let ready; const sources = [], buffers = [], events = [];
  const context = { sampleRate: 44100, currentTime: 0, destination: {}, resume: () => new Promise(resolve => { ready = resolve; }), close: () => Promise.resolve(),
    createBuffer(channels, length, rate) { const buffer = { duration: length / rate, samples: [], copyToChannel(data, i) { this.samples[i] = data; } }; buffers.push(buffer); return buffer; },
    createBufferSource() { const source = { stopped: false, connect() {}, disconnect() {}, start() {}, stop() { this.stopped = true; } }; sources.push(source); return source; },
    createGain() { return { connect() {}, disconnect() {}, gain: { setValueAtTime() {}, linearRampToValueAtTime() {} } }; },
  };
  const player = new PreviewPlayer(() => context), state = arpeggio('rounded'); state.tracks[1].bars[0][0] = 0;
  const expected = renderPreview(state, 1, 0), pending = player.play(state, 1, 0); state.chordStyle = 'block'; ready();
  assert.equal(await pending, true); assert.equal(buffers[0].samples[0].length, expected.left.length); assert.ok(buffers[0].samples[0].every((n, i) => Math.abs(n - expected.left[i]) < .00001));
  context.resume = () => Promise.resolve(); state.chordStyle = 'arpeggio-v1';
  const frames = globalThis.requestAnimationFrame; let frame;
  globalThis.requestAnimationFrame = callback => { frame = callback; };
  try { const duet = player.playPhrase(state, 0, active => events.push(active), 'duet'); await new Promise(resolve => setImmediate(resolve));
    assert.equal(typeof frame, 'function'); player.stop(); state.chordStyle = 'block'; frame();
    assert.equal(await duet, false); assert.deepEqual(events, [true, false]); assert.equal(sources.length, 1); assert.ok(sources[0].stopped);
  } finally { globalThis.requestAnimationFrame = frames; player.dispose(); }
});
