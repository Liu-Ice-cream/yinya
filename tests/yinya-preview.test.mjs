import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { blank, preset, songJSON, TRACKS } from '../yinya/model.js';

await mkdir('build', { recursive: true });
await build({ entryPoints: ['yinya/preview.js'], bundle: true, platform: 'node', format: 'esm', outfile: 'build/yinya-preview-test.mjs' });
const { renderPreview, previewPitches, PreviewPlayer, PREVIEW_SECONDS } = await import(pathToFileURL(resolve('build/yinya-preview-test.mjs')));
const rms = samples => Math.sqrt(samples.reduce((sum, n) => sum + n * n, 0) / samples.length);

test('every clickable pitch, complete chord and individual drum matches the exported song without changing it', () => {
  for (let track = 0; track < 4; track++) for (let row = 0; row < TRACKS[track].rows.length; row++) {
    const state = blank();
    state.tracks[track].bars[0][0] = track === 3 ? 1 << (2 - row) : track === 1 ? row : 7 - row;
    const before = structuredClone(state), exported = songJSON(state).channels[track].patterns[0].notes[0];
    assert.deepEqual(previewPitches(track, row), exported.pitches);
    const audio = renderPreview(state, track, row);
    assert.equal(audio.left.length, Math.ceil(44100 * PREVIEW_SECONDS));
    assert.ok(audio.left.every(Number.isFinite)); assert.ok(audio.right.every(Number.isFinite));
    assert.ok(audio.left.some(n => Math.abs(n) > .001), `track ${track}, row ${row} audible`);
    assert.deepEqual(state, before, 'preview must not modify notes, mute, volume, or project length');
  }
});

test('short previews end at both device sample rates and tempo limits; current volume and waveform are audible', () => {
  for (const sampleRate of [44100, 48000]) for (const tempo of [60, 108, 180]) {
    const state = preset('sprout'); state.tempo = tempo;
    for (let track = 0; track < 4; track++) {
      const audio = renderPreview(state, track, 0, sampleRate);
      assert.equal(audio.sampleRate, sampleRate);
      assert.equal(audio.left.length, Math.ceil(PREVIEW_SECONDS * sampleRate));
      assert.ok(audio.left.every(Number.isFinite));
      if (track !== 3) assert.ok(audio.left.slice(-Math.floor(sampleRate * .02)).every(n => Math.abs(n) < .0001), 'pitched notes release within 320ms');
    }
  }
  const state = preset('sprout'); state.tracks[0].volume = 20;
  const quiet = renderPreview(state, 0, 7).left;
  state.tracks[0].volume = 100; const loud = renderPreview(state, 0, 7).left;
  assert.ok(rms(loud) > rms(quiet) * 1.2);
  state.voice = 'square'; const square = renderPreview(state, 0, 7).left;
  assert.ok(square.some((n, i) => Math.abs(n - loud[i]) > .01), 'melody uses current waveform');
  assert.ok(rms(square) > .001);
});

function fakeContext(resume = () => Promise.resolve()) {
  const sources = [], buffers = [], fades = [];
  return {
    sources, buffers, fades, sampleRate: 48000, currentTime: 0, destination: {}, resume,
    close: () => Promise.resolve(),
    createBuffer(channels, length, rate) {
      const buffer = { duration: length / rate, channels: Array.from({ length: channels }, () => new Float32Array(length)), copyToChannel(data, index) { this.channels[index].set(data); } };
      buffers.push(buffer); return buffer;
    },
    createBufferSource() {
      const source = { started: false, stopped: false, disconnected: false, connect() {}, disconnect() { this.disconnected = true; }, start() { this.started = true; }, stop() { this.stopped = true; } };
      sources.push(source); return source;
    },
    createGain: () => ({ connect() {}, disconnect() {}, gain: { setValueAtTime(value, time) { fades.push([value, time]); }, linearRampToValueAtTime(value, time) { fades.push([value, time]); } } }),
  };
}

test('muted and zero-volume layers remain silent without opening an audio context', async () => {
  const player = new PreviewPlayer(() => { throw new Error('should not open context'); });
  for (let track = 0; track < 4; track++) for (const field of ['enabled', 'volume']) {
    const state = preset('sprout'); state.tracks[track][field] = field === 'enabled' ? false : 0;
    assert.equal(renderPreview(state, track, 0), null);
    assert.equal(await player.play(state, track, 0), false);
  }
  for (const [track, row] of [[-1, 0], [4, 0], [0, 8], [3, 3], [1, -1]]) assert.throws(() => previewPitches(track, row));
});

test('rapid clicks play only the latest pending sound; active sounds stop before replacement', async () => {
  let ready; const resumed = new Promise(resolve => { ready = resolve; });
  const context = fakeContext(() => resumed), player = new PreviewPlayer(() => context), state = preset('sprout');
  const earlier = player.play(state, 0, 7), later = player.play(state, 1, 0); ready();
  assert.deepEqual(await Promise.all([earlier, later]), [false, true]);
  assert.equal(context.sources.length, 1); assert.ok(context.sources[0].started);
  assert.equal(context.buffers[0].duration, PREVIEW_SECONDS);
  assert.deepEqual(context.fades.at(-1), [0, PREVIEW_SECONDS], 'fade reaches silence at the end, including drum tails');
  assert.ok(context.buffers[0].channels[0].some(n => Math.abs(n) > .001));
  await player.play(state, 3, 0);
  assert.ok(context.sources[0].stopped && context.sources[0].disconnected);
  assert.equal(context.sources.length, 2); player.stop();
  assert.ok(context.sources[1].stopped); assert.equal(player.active, null);
});

test('stopping while audio permission is pending prevents a late sound; edits after click do not alter its snapshot', async () => {
  let ready; const resumed = new Promise(resolve => { ready = resolve; });
  const context = fakeContext(() => resumed), player = new PreviewPlayer(() => context), state = preset('sprout');
  const pending = player.play(state, 0, 7); player.stop(); ready();
  assert.equal(await pending, false); assert.equal(context.sources.length, 0);
  let readyAgain; context.resume = () => new Promise(resolve => { readyAgain = resolve; });
  const next = player.play(state, 0, 7); state.tracks[0].volume = 0; readyAgain();
  assert.equal(await next, true); assert.ok(context.buffers[0].channels[0].some(n => Math.abs(n) > .001));
  player.dispose(); assert.equal(player.context, null);
});

test('audio startup failure remains retryable and canceled startup errors do not overwrite later work', async () => {
  const context = fakeContext(() => Promise.reject(new Error('audio blocked'))), player = new PreviewPlayer(() => context);
  await assert.rejects(player.play(preset('sprout'), 0, 7), /audio blocked/);
  assert.equal(player.active, null); context.resume = () => Promise.resolve();
  assert.equal(await player.play(preset('sprout'), 0, 7), true);
  const createSource = context.createBufferSource;
  context.createBufferSource = () => { const source = createSource(); source.start = () => { throw new Error('source failed'); }; return source; };
  await assert.rejects(player.play(preset('sprout'), 0, 7), /source failed/);
  assert.equal(player.active, null); assert.ok(context.sources.at(-1).disconnected);
  context.createBufferSource = createSource;
  assert.equal(await player.play(preset('sprout'), 0, 7), true);
  let reject; context.resume = () => new Promise((_, fail) => { reject = fail; });
  const pending = player.play(preset('sprout'), 0, 7); player.stop(); reject(new Error('old failure'));
  assert.equal(await pending, false); assert.equal(player.active, null);
});
