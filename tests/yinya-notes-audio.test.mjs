import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { MPEGDecoder } from 'mpg123-decoder';
import { Mp3Encoder } from '../website/yinya/vendor/lamejs.js';
import { encodeMp3 } from '../yinya/mp3.js';
import { blank, setMelodyNote, songJSON, wavBuffer, preset } from '../yinya/model.js';

await mkdir('build', { recursive: true });
await build({ stdin: { contents: 'export { Song } from "./synth/synth.ts"; export { SongRenderer } from "./editor/SongRenderer.ts"; export { renderPreview, PreviewPlayer } from "./yinya/preview.js";', resolveDir: process.cwd(), loader: 'ts' }, bundle: true, platform: 'node', format: 'esm', outfile: 'build/yinya-notes-audio-test.mjs' });
const { Song, SongRenderer, renderPreview } = await import(pathToFileURL(resolve('build/yinya-notes-audio-test.mjs')));
globalThis.requestAnimationFrame = callback => setImmediate(callback);
const audible = samples => samples.some(n => Math.abs(n) > .001);

test('selected melody previews use actual note durations at both tempo and sample-rate limits, and release fully', () => {
  for (const tempo of [60, 180]) for (const sampleRate of [44100, 48000]) for (const length of [1, 2, 4, 8]) {
    let state = blank(); state.tempo = tempo; state = setMelodyNote(state, 0, 3, 5, length).state;
    const before = structuredClone(state), audio = renderPreview(state, 0, 2, sampleRate, { bar: 0, step: 3 });
    const seconds = length * 60 / tempo / 4;
    assert.equal(audio.left.length, Math.ceil((seconds + .07) * sampleRate));
    assert.ok(audio.left.every(Number.isFinite)); assert.ok(audio.right.every(Number.isFinite));
    assert.ok(audible(audio.left.slice(0, Math.floor(seconds * sampleRate / 2))));
    assert.ok(audio.left.slice(-Math.floor(sampleRate * .02)).every(n => Math.abs(n) < .0001));
    assert.deepEqual(state, before);
  }
  assert.throws(() => renderPreview(blank(), 0, 7, 44100, { bar: 0, step: 0 }));
  assert.throws(() => renderPreview(preset('sprout'), 1, 0, 44100, { bar: 0, step: 0 }));
});

test('long notes sustain in the last bar of actual WAV and MP3 exports, while short notes release', async () => {
  let state = blank('长音导出', 16); state.tempo = 120;
  state = setMelodyNote(state, 15, 0, 2, 8).state;
  const song = new Song(); song.fromJsonObject(songJSON(state));
  const renderer = new SongRenderer();
  for await (const _ of renderer.generate(song, 44100, false, false, 1)) {}
  const audio = renderer.outputSamplesL, lastBar = 30 * 44100;
  assert.equal(audio.length, 32 * 44100);
  assert.ok(audio.slice(0, lastBar).every(n => n === 0));
  assert.ok(audible(audio.slice(lastBar + 22050, lastBar + 26460)), 'eight-step note remains audible after half a second');
  assert.ok(audio.slice(lastBar + 52920).every(n => Math.abs(n) < .0001), 'note has released before the end of the bar');
  const wav = new DataView(wavBuffer(audio, renderer.outputSamplesR, 44100));
  assert.equal(wav.byteLength, 44 + audio.length * 4);
  assert.ok(Array.from({ length: 100 }, (_, i) => wav.getInt16(44 + (lastBar + 22050 + i) * 4, true)).some(n => Math.abs(n) > 32));
  const decoder = new MPEGDecoder(); await decoder.ready;
  try {
    const decoded = decoder.decode(encodeMp3(audio, renderer.outputSamplesR, Mp3Encoder));
    assert.deepEqual(decoded.errors, []);
    assert.ok(decoded.samplesDecoded >= audio.length && decoded.samplesDecoded <= audio.length + 2304);
    assert.ok(audible(decoded.channelData[0].slice(lastBar + 24000, lastBar + 28000)));
    assert.ok(decoded.channelData[0].slice(lastBar + 58000).every(n => Math.abs(n) < .0001));
  } finally { decoder.free(); }
  const preview = renderPreview(state, 0, 5, 44100, { bar: 15, step: 4 });
  assert.ok(audible(preview.left.slice(22050, 26460)), 'clicking a continuation auditions its whole owning note');
  assert.ok(preview.left.every((n, i) => Math.abs(n - audio[lastBar + i]) < .0001), 'preview and exported note share their envelope and waveform');
  const short = setMelodyNote(state, 15, 0, 2, 1).state;
  const shortPreview = renderPreview(short, 0, 5, 44100, { bar: 15, step: 0 });
  assert.ok(shortPreview.left.length < 10000);
});
