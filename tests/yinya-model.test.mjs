import test from 'node:test';
import assert from 'node:assert/strict';
import { preset, validate, encode, decode, songJSON, wavBuffer } from '../yinya/model.js';

test('Chinese titles, edits, volume and muted layers survive share round trip', () => {
  const s = preset('moon'); s.title = '音芽 · 夜雨 <&>'; s.tracks[0].bars[3][15] = 7;
  s.tracks[2].enabled = false; s.tracks[1].volume = 0;
  assert.deepEqual(decode('#' + encode(s)), validate(s));
});
test('invalid links and malformed data cannot enter the audio engine', () => {
  for (const link of ['#other=1', '#yinya=%%%%', '#yinya=' + 'x'.repeat(20001)]) assert.throws(() => decode(link));
  for (const modify of [s => s.tempo = NaN, s => s.tempo = 999, s => s.tracks[0].bars[0][0] = 99, s => s.tracks[0].bars.pop(), s => s.tracks[3].volume = '100', s => s.version = 3]) {
    const s = preset('sprout'); modify(s); assert.throws(() => validate(s));
  }
});
test('four original patterns produce ordered notes inside their bars', () => {
  for (const id of ['sprout', 'moon', 'pixel']) {
    const json = songJSON(preset(id)); assert.equal(json.channels.length, 4); assert.equal(json.loopBars, 4);
    for (const ch of json.channels) {
      assert.deepEqual(ch.sequence, [1, 2, 3, 4]);
      for (const pattern of ch.patterns) { let end = 0; for (const note of pattern.notes) { assert.ok(note.points[0].tick >= end); end = note.points[1].tick; assert.ok(end <= 16); } }
    }
  }
});
test('WAV export is stereo PCM with correct length and clips overflowing samples', () => {
  const b = wavBuffer(new Float32Array([2, -.5]), new Float32Array([-2, .5]), 44100), v = new DataView(b);
  assert.equal(b.byteLength, 52); assert.equal(v.getUint32(4, true), 44); assert.equal(v.getUint16(22, true), 2);
  assert.equal(v.getUint32(24, true), 44100); assert.equal(v.getInt16(44, true), 32767); assert.equal(v.getInt16(46, true), -32767);
});
