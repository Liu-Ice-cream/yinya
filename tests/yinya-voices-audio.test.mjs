import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { VOICES, releaseSeconds } from '../yinya/voices.js';
import { blank, setMelodyNote, preset, songJSON, wavBuffer } from '../yinya/model.js';
import { encodeMp3 } from '../yinya/mp3.js';
import { Mp3Encoder } from '../website/yinya/vendor/lamejs.js';
import { MPEGDecoder } from 'mpg123-decoder';

await build({ stdin: { contents: 'export { AudioRenderer } from "./yinya/render.js"; export { renderPreview, PreviewPlayer } from "./yinya/preview.js"; export { Song } from "./synth/synth.ts"; export { SongRenderer } from "./editor/SongRenderer.ts";', resolveDir: process.cwd(), loader: 'ts' }, bundle: true, platform: 'node', format: 'esm', outfile: 'build/yinya-voices-audio-test.mjs' });
const { AudioRenderer, renderPreview, PreviewPlayer, Song, SongRenderer } = await import(pathToFileURL(resolve('build/yinya-voices-audio-test.mjs')));
globalThis.requestAnimationFrame = callback => setImmediate(callback);
const rms = samples => Math.sqrt(samples.reduce((sum, n) => sum + n * n, 0) / samples.length);
const audible = samples => samples.some(n => Math.abs(n) > .001);
const newVoices = VOICES.filter(voice => !voice.legacy);
async function render(state, ending = 'natural') {
  const renderer = new AudioRenderer(); for await (const _ of renderer.generate(state, 44100, ending)) {}
  return renderer;
}

test('short and long new voices are finite and audible across the entire melody range at tempo and device-rate limits', () => {
  for (const voice of newVoices) for (const pitch of [0, 1, 2, 3, 4, 5, 6, 7]) for (const length of [1, 8]) for (const tempo of [60, 180]) for (const rate of [44100, 48000]) {
    let state = blank(); state.voice = voice.id; state.tempo = tempo; state = setMelodyNote(state, 0, 0, pitch, length).state;
    const audio = renderPreview(state, 0, 7 - pitch, rate, { bar: 0, step: 0 });
    assert.equal(audio.left.length, Math.ceil((length * 60 / tempo / 4 + releaseSeconds(voice.id, tempo)) * rate));
    assert.ok(audio.left.every(Number.isFinite)); assert.ok(audio.right.every(Number.isFinite)); assert.ok(audible(audio.left));
    assert.equal(Math.abs(audio.left.at(-1)), 0); assert.equal(Math.abs(audio.right.at(-1)), 0);
    for (const n of audio.left) assert.ok(Math.abs(n) < .99);
  }
});

test('calibrated voice medians stay within 5 dB on a shared pitch/length set and all six voices respond to volume', () => {
  const medians = [];
  for (const voice of VOICES) {
    const levels = [];
    for (const pitch of [0, 3, 5, 7]) for (const length of [1, 4, 8]) {
      let state = blank(); state.voice = voice.id; state = setMelodyNote(state, 0, 0, pitch, length).state;
      const audio = renderPreview(state, 0, 7 - pitch, 44100, { bar: 0, step: 0 });
      levels.push(rms(audio.left.subarray(0, Math.floor(length * 60 / state.tempo / 4 * 44100))));
    }
    levels.sort((a, b) => a - b); medians.push(levels[6]);
    let state = setMelodyNote(blank(), 0, 0, 3, 4).state; state.voice = voice.id;
    state.tracks[0].volume = 20; const quiet = renderPreview(state, 0, 4, 44100, { bar: 0, step: 0 });
    state.tracks[0].volume = 100; const loud = renderPreview(state, 0, 4, 44100, { bar: 0, step: 0 });
    assert.ok(rms(loud.left) > rms(quiet.left) * 2);
    state.tracks[0].volume = 0; assert.equal(renderPreview(state, 0, 4, 44100, { bar: 0, step: 0 }), null);
  }
  assert.ok(20 * Math.log10(Math.max(...medians) / Math.min(...medians)) < 5);
});

test('natural ending retains actual released audio after the final bar; loop ending stays exact and legacy PCM is unchanged', async () => {
  for (const voice of newVoices) for (const tempo of [60, 180]) {
    let state = blank('曲尾'); state.voice = voice.id; state.tempo = tempo; state = setMelodyNote(state, 3, 15, 3, 1).state;
    const natural = await render(state), loop = await render(state, 'loop'), length = Math.ceil(4 * 240 / tempo * 44100);
    assert.equal(loop.outputSamplesL.length, length);
    assert.equal(natural.outputSamplesL.length, length + Math.ceil(releaseSeconds(voice.id, tempo) * 44100));
    assert.ok(audible(natural.outputSamplesL.subarray(length)), `${voice.id} at ${tempo} releases into the silent bar`);
    assert.equal(Math.abs(natural.outputSamplesL.at(-1)), 0); assert.equal(Math.abs(loop.outputSamplesL.at(-1)), 0);
  }
  const old = preset('moon'); old.tracks[3].enabled = false;
  const song = new Song(); song.fromJsonObject(songJSON(old)); song.channels[3].muted = true;
  const reference = new SongRenderer(); for await (const _ of reference.generate(song, 44100, false, false, 1)) {}
  const preserved = await render(old);
  assert.equal(preserved.tailSeconds, 0); assert.equal(preserved.outputSamplesL.length, reference.outputSamplesL.length);
  assert.ok(preserved.outputSamplesL.every((n, i) => Math.abs(n - reference.outputSamplesL[i]) < .00001));
  assert.ok(preserved.outputSamplesR.every((n, i) => Math.abs(n - reference.outputSamplesR[i]) < .00001));
  await assert.rejects(async () => { for await (const _ of new AudioRenderer().generate(old, 44100, 'invalid')) {} });
  let padded = blank(); padded.voice = 'piano-v1'; padded = setMelodyNote(padded, 0, 0, 3, 1).state;
  assert.equal((await render(padded)).tailSeconds, 0, 'existing rests already provide sufficient release time');
});

test('all three new voices reach WAV and independently decoded MP3 with the final sixteenth-note and release intact', async () => {
  for (const voice of newVoices) {
    let state = blank('新音色导出', 16); state.voice = voice.id; state.tempo = 120; state = setMelodyNote(state, 15, 15, 3, 1).state;
    const rendered = await render(state), left = rendered.outputSamplesL, right = rendered.outputSamplesR;
    const wav = new DataView(wavBuffer(left, right, 44100));
    assert.equal(wav.getUint32(40, true), left.length * 4);
    const tail = 32 * 44100; assert.ok(audible(left.subarray(tail)));
    const decoder = new MPEGDecoder(); await decoder.ready;
    try {
      const decoded = decoder.decode(encodeMp3(left, right, Mp3Encoder));
      assert.deepEqual(decoded.errors, []); assert.equal(decoded.channelData.length, 2);
      assert.ok(decoded.samplesDecoded >= left.length && decoded.samplesDecoded <= left.length + 2304);
      assert.ok(audible(decoded.channelData[0].subarray(tail + 1500, tail + 4000)));
    } finally { decoder.free(); }
  }
});

function context() {
  const sources = [], buffers = [];
  return { sources, buffers, sampleRate: 44100, currentTime: 0, destination: {}, resume: () => Promise.resolve(), close: () => Promise.resolve(),
    createBuffer(channels, length, sampleRate) { const value = { duration: length / sampleRate, samples: [], copyToChannel(data, index) { this.samples[index] = data; } }; buffers.push(value); return value; },
    createBufferSource() { const source = { stopped: false, connect() {}, disconnect() {}, start() {}, stop() { this.stopped = true; } }; sources.push(source); return source; },
    createGain() { return { connect() {}, disconnect() {}, gain: { setValueAtTime() {}, linearRampToValueAtTime() {} } }; },
  };
}
test('phrase playback snapshots the melody and stops on cancellation, natural completion and subsequent single-note preview', async () => {
  const audio = context(), player = new PreviewPlayer(() => audio), events = [];
  let ready; audio.resume = () => new Promise(resolve => { ready = resolve; });
  const state = setMelodyNote(preset('sprout'), 3, 15, 3, 1).state; state.voice = 'piano-v1';
  const pending = player.playPhrase(state, 0, active => events.push(active)); player.stop(); ready();
  assert.equal(await pending, false); assert.deepEqual(events, [true, false]); assert.equal(audio.sources.length, 0);
  audio.resume = () => Promise.resolve();
  const active = player.playPhrase(state, 0, flag => events.push(flag)); state.voice = 'triangle'; state.tracks[0].volume = 0;
  assert.equal(await active, true); assert.ok(audible(audio.buffers[0].samples[0]));
  assert.ok(audio.buffers[0].duration > 4 * 240 / 108, 'snapshot retains the piano release');
  audio.sources[0].onended(); assert.equal(player.active, null); assert.equal(events.at(-1), false);
  state.tracks[0].volume = 80; assert.equal(await player.playPhrase(state, 0), true);
  await player.play(state, 0, 7, { bar: 0, step: 0 }); assert.ok(audio.sources[1].stopped);
  player.dispose();
});

test('canceling phrase preparation prevents late audio, and empty or muted phrases never request sound', async () => {
  const audio = context(), player = new PreviewPlayer(() => audio);
  const immediateFrames = globalThis.requestAnimationFrame;
  let frame;
  globalThis.requestAnimationFrame = callback => { frame = callback; };
  try {
    const playing = player.playPhrase(preset('sprout'), 0);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(typeof frame, 'function'); player.stop(); frame();
    assert.equal(await playing, false); assert.equal(audio.sources.length, 0);
  } finally { globalThis.requestAnimationFrame = immediateFrames; }
  audio.resume = () => { throw new Error('must remain silent'); };
  assert.equal(await player.playPhrase(blank(), 0), false);
  const muted = preset('sprout'); muted.tracks[0].enabled = false;
  assert.equal(await player.playPhrase(muted, 0), false);
});
