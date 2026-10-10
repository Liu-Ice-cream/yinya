import test from 'node:test';
import assert from 'node:assert/strict';
import { blank, preset, validate, resize, copyGroup, rangeHasNotes, encode, decode, songJSON } from '../yinya/model.js';
import { PlaybackFollower, playbackPosition } from '../yinya/playback.js';

test('legacy v1 JSON and links migrate without changing the original four-bar music', () => {
  const legacy = preset('moon'); legacy.version = 1; delete legacy.barCount;
  legacy.title = '旧作品 · 夜雨'; legacy.tracks[2].enabled = false;
  const original = structuredClone(legacy);
  const link = '#yinya=' + Buffer.from(JSON.stringify(legacy)).toString('base64url');
  const migrated = validate(legacy);
  assert.equal(migrated.version, 2); assert.equal(migrated.barCount, 4);
  assert.deepEqual(migrated.tracks, legacy.tracks);
  assert.deepEqual(decode(link), migrated);
  assert.deepEqual(legacy, original);
  const extendedLegacy = structuredClone(legacy); extendedLegacy.tracks[0].bars.push([...legacy.tracks[0].bars[0]]);
  assert.throws(() => validate(extendedLegacy));
});

test('all supported lengths preserve full data through JSON and links, and reject inconsistent tracks', () => {
  for (const count of [4, 8, 16]) {
    const state = resize(preset('pixel'), count, 'repeat'); state.title = '音乐🌱'.repeat(10);
    state.tracks[2].enabled = false; state.tracks[1].volume = 0;
    state.tracks[0].bars[count - 1][15] = 7;
    assert.deepEqual(decode(encode(state)), state);
    assert.deepEqual(validate(JSON.parse(JSON.stringify(state))), state);
    assert.ok(Buffer.byteLength(JSON.stringify(state, null, 2)) <= 20000, 'app can import its own backup');
    assert.ok(encode(state).length <= 20000, 'app can decode its own share link');
    const json = songJSON(state);
    assert.equal(json.loopBars, count);
    for (const channel of json.channels) {
      assert.equal(channel.patterns.length, count);
      assert.deepEqual(channel.sequence, Array.from({ length: count }, (_, i) => i + 1));
    }
    const invalid = structuredClone(state); invalid.tracks[3].bars.pop();
    assert.throws(() => validate(invalid));
  }
  for (const count of [0, 1, 5, 12, 32, '8', NaN]) {
    assert.throws(() => blank('无效长度', count));
    assert.throws(() => validate({ ...preset('sprout'), barCount: count }));
  }
  assert.throws(() => validate({ ...preset('sprout'), barCount: undefined }));
});

test('empty and repeating extensions preserve all four voices, use independent bars, and can shrink safely', () => {
  const original = preset('moon'), before = structuredClone(original);
  for (const fill of ['empty', 'repeat']) {
    const extended = resize(original, 16, fill);
    for (let track = 0; track < 4; track++) {
      assert.deepEqual(extended.tracks[track].bars.slice(0, 4), original.tracks[track].bars);
      if (fill === 'empty') assert.ok(extended.tracks[track].bars.slice(4).flat().every(n => n === (track === 3 ? 0 : -1)));
      else assert.deepEqual(extended.tracks[track].bars[15], original.tracks[track].bars[3]);
    }
    assert.equal(rangeHasNotes(extended, 4, 16), fill === 'repeat');
    assert.deepEqual(resize(extended, 4), original);
    extended.tracks[0].bars[4][0] = 7;
    assert.deepEqual(extended.tracks[0].bars[0], original.tracks[0].bars[0]);
  }
  const eight = resize(original, 8, 'empty'); eight.tracks[0].bars[7][15] = 7;
  assert.deepEqual(resize(eight, 16, 'repeat').tracks[0].bars[15], eight.tracks[0].bars[7]);
  const muted = blank('关闭的声部', 8); muted.tracks[3].enabled = false; muted.tracks[3].volume = 0; muted.tracks[3].bars[7][0] = 1;
  assert.equal(rangeHasNotes(muted, 4, 8), true, 'warn before discarding muted notes too');
  assert.deepEqual(original, before);
  assert.throws(() => resize(original, 8, 'unknown'));
});

test('copying a four-bar group copies every voice without overwriting adjacent groups or settings', () => {
  const state = resize(preset('pixel'), 16, 'empty'); state.tracks[2].enabled = false; state.tracks[1].volume = 20;
  const before = structuredClone(state), copied = copyGroup(state, 0, 8);
  for (let i = 0; i < 4; i++) {
    assert.deepEqual(copied.tracks[i].bars.slice(8, 12), state.tracks[i].bars.slice(0, 4));
    assert.deepEqual(copied.tracks[i].bars.slice(4, 8), state.tracks[i].bars.slice(4, 8));
    assert.deepEqual(copied.tracks[i].bars.slice(12), state.tracks[i].bars.slice(12));
    assert.equal(copied.tracks[i].enabled, state.tracks[i].enabled); assert.equal(copied.tracks[i].volume, state.tracks[i].volume);
  }
  copied.tracks[0].bars[8][0] = 7;
  assert.deepEqual(copied.tracks[0].bars[0], state.tracks[0].bars[0]);
  assert.deepEqual(state, before);
  assert.deepEqual(copyGroup(copyGroup(state, 0, 12), 12, 4).tracks[3].bars.slice(4, 8), state.tracks[3].bars.slice(0, 4));
  for (const args of [[0, 0], [1, 4], [0, 16], [-4, 4], [0, 6]]) assert.throws(() => copyGroup(state, ...args));
});

test('long playback follows across groups and loop seams, and clamps navigation when shortened', () => {
  for (const count of [8, 16]) {
    const follower = new PlaybackFollower(true, count);
    for (const bar of [0, 3, 4, count - 1]) assert.equal(follower.update(bar + .5, true).selectedBar, bar);
    assert.equal(playbackPosition(count - .00001, count).bar, count - 1);
    assert.equal(playbackPosition(count, count).bar, 0);
    follower.select(count - 1, true);
    assert.equal(follower.update(count + .5, true).selectedBar, count - 1);
    follower.setEnabled(true); assert.equal(follower.update(count + .5, true).selectedBar, 0);
    follower.select(count - 1, false); follower.setBarCount(4);
    assert.equal(follower.selectedBar, 3); assert.throws(() => follower.select(4));
    follower.setBarCount(count); follower.start(); assert.equal(follower.update(4.5, true).selectedBar, 4);
  }
  assert.throws(() => playbackPosition(0, 32));
});
