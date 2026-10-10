import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { MPEGDecoder } from 'mpg123-decoder';
import { Mp3Encoder } from '../website/yinya/vendor/lamejs.js';
import { encodeMp3 } from '../yinya/mp3.js';
import { blank, preset, songJSON, wavBuffer } from '../yinya/model.js';

await mkdir('build', { recursive: true });
await build({ stdin: { contents: 'export { Song } from "./synth/synth.ts"; export { SongRenderer } from "./editor/SongRenderer.ts";', resolveDir: process.cwd(), loader: 'ts' }, bundle: true, platform: 'node', format: 'esm', outfile: 'build/yinya-length-audio-test.mjs' });
const { Song, SongRenderer } = await import(pathToFileURL(resolve('build/yinya-length-audio-test.mjs')));
globalThis.requestAnimationFrame = callback => setImmediate(callback);

for (const count of [4, 8, 16]) test(`${count}-bar export renders full WAV and independently decodable MP3 including only the last bar's notes`, async () => {
  const state = blank('末节不能丢失', count); state.tempo = 120;
  const source = preset('sprout');
  for (let i = 0; i < 4; i++) state.tracks[i].bars[count - 1] = [...source.tracks[i].bars[3]];
  const song = new Song(); song.fromJsonObject(songJSON(state));
  assert.equal(song.barCount, count); assert.equal(song.loopLength, count);
  const renderer = new SongRenderer(), progress = [];
  for await (const value of renderer.generate(song, 44100, false, false, 1)) progress.push(value);
  const expected = count * 2 * 44100;
  assert.equal(renderer.outputSamplesL.length, expected); assert.equal(renderer.outputSamplesR.length, expected);
  assert.equal(progress.at(-1), 1);
  const wav = new DataView(wavBuffer(renderer.outputSamplesL, renderer.outputSamplesR, 44100));
  assert.equal(wav.getUint32(40, true), expected * 4); assert.equal(wav.byteLength, 44 + expected * 4);
  assert.ok(renderer.outputSamplesL.slice(0, 44100).every(n => n === 0));
  assert.ok(renderer.outputSamplesL.slice(-44100).some(n => Math.abs(n) > .001));
  const encoded = encodeMp3(renderer.outputSamplesL, renderer.outputSamplesR, Mp3Encoder);
  const decoder = new MPEGDecoder(); await decoder.ready;
  try {
    const decoded = decoder.decode(encoded);
    assert.deepEqual(decoded.errors, []); assert.equal(decoded.sampleRate, 44100);
    assert.ok(decoded.samplesDecoded >= expected && decoded.samplesDecoded <= expected + 2304);
    assert.equal(decoded.channelData.length, 2);
    for (const channel of decoded.channelData) {
      assert.ok(channel.every(Number.isFinite));
      assert.ok(channel.slice(-44100).some(n => Math.abs(n) > .001), 'last bar reaches the MP3 file');
    }
  } finally { decoder.free(); }
});
