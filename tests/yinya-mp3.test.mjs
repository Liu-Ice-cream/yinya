import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdir, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { MPEGDecoder } from 'mpg123-decoder';
import { Mp3Encoder } from '../website/yinya/vendor/lamejs.js';
import { encodeMp3 } from '../yinya/mp3.js';
import { preset, songJSON } from '../yinya/model.js';

await mkdir('build', { recursive: true });
await build({ entryPoints: ['synth/index.ts'], bundle: true, platform: 'node', format: 'esm', outfile: 'build/yinya-mp3-synth.mjs' });
const { Song, Synth } = await import(pathToFileURL(resolve('build/yinya-mp3-synth.mjs')));
async function decode(bytes) {
  const decoder = new MPEGDecoder();
  await decoder.ready;
  try { return decoder.decode(bytes); } finally { decoder.free(); }
}
function checkFrames(bytes) {
  // Inspect every MPEG-1 Layer III frame, including the final flush frame.
  let offset = 0, frames = 0;
  while (offset < bytes.length) {
    assert.equal(bytes[offset], 0xff);
    assert.equal(bytes[offset + 1] & 0xfe, 0xfa);
    assert.equal(bytes[offset + 2] >> 4, 11, '192 kbps bitrate index');
    assert.equal(bytes[offset + 2] & 12, 0, '44.1 kHz sample rate index');
    assert.notEqual(bytes[offset + 3] >> 6, 3, 'stereo channel mode');
    offset += Math.floor(144 * 192000 / 44100) + ((bytes[offset + 2] >> 1) & 1);
    frames++;
  }
  assert.equal(offset, bytes.length, 'no truncated frame or trailing junk');
  assert.ok(frames > 0);
}

test('real four-bar BeepBox song encodes to complete 192 kbps stereo MP3 and independently decodes', async () => {
  const state = preset('sprout'); state.tempo = 120;
  const song = new Song(); song.fromJsonObject(songJSON(state));
  const synth = new Synth(song); synth.samplesPerSecond = 44100; synth.loopRepeatCount = 0;
  const frames = Math.ceil(synth.getSamplesPerBar() * 4);
  const left = new Float32Array(frames), right = new Float32Array(frames);
  synth.synthesize(left, right, frames);
  const progress = [], mp3 = encodeMp3(left, right, Mp3Encoder, n => progress.push(n));
  checkFrames(mp3);
  const decoded = await decode(mp3);
  assert.deepEqual(decoded.errors, []);
  assert.equal(decoded.sampleRate, 44100); assert.equal(decoded.channelData.length, 2);
  assert.ok(decoded.samplesDecoded >= frames && decoded.samplesDecoded <= frames + 2304);
  for (const channel of decoded.channelData) {
    assert.ok(channel.every(Number.isFinite));
    assert.ok(channel.some(n => Math.abs(n) > .001));
    assert.ok(channel.slice(-44100).some(n => Math.abs(n) > .001), 'last bar contains audio');
  }
  assert.equal(progress.at(-1), 1); assert.ok(progress.length > 1);
  assert.ok(progress.every((n, i) => n > 0 && n <= 1 && (!i || n >= progress[i - 1])));
});

test('partial final PCM block, independent channels, silence and clipping remain valid MP3', async () => {
  const count = 44100 + 173, left = Float32Array.from({ length: count }, (_, i) => 1.2 * Math.sin(i * 2 * Math.PI * 440 / 44100));
  const right = Float32Array.from({ length: count }, (_, i) => .3 * Math.sin(i * 2 * Math.PI * 880 / 44100));
  const bytes = encodeMp3(left, right, Mp3Encoder); checkFrames(bytes);
  const decoded = await decode(bytes); assert.deepEqual(decoded.errors, []);
  assert.ok(decoded.samplesDecoded >= count && decoded.samplesDecoded <= count + 2304);
  assert.ok(decoded.channelData[0].some((n, i) => Math.abs(n - decoded.channelData[1][i]) > .1));
  assert.ok(decoded.channelData[0].slice(count - 2000, count).some(n => Math.abs(n) > .1));
  const quiet = await decode(encodeMp3(new Float32Array(count), new Float32Array(count), Mp3Encoder));
  assert.deepEqual(quiet.errors, []);
  assert.ok(quiet.channelData.every(c => c.every(n => Math.abs(n) < .00001)));
});

test('invalid PCM fails clearly; shipped encoder stays byte-identical to pinned dependency', async () => {
  for (const [l, r] of [[[], []], [new Float32Array(), new Float32Array()], [new Float32Array(1), new Float32Array(2)], [new Float32Array([NaN]), new Float32Array(1)], [new Float32Array(1), new Float32Array([Infinity])]]) {
    assert.throws(() => encodeMp3(l, r, Mp3Encoder));
  }
  assert.deepEqual(await readFile('website/yinya/vendor/lamejs.js'), await readFile('node_modules/@breezystack/lamejs/dist/lamejs.js'));
});
