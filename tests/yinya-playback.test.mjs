import test from 'node:test';
import assert from 'node:assert/strict';
import { PlaybackFollower, playbackPosition } from '../yinya/playback.js';

test('playback position matches 16 steps and four beats per bar, including the four-bar loop seam', () => {
  for (let i = 0; i < 128; i++) {
    const position = playbackPosition(i / 16 + .001);
    assert.equal(position.bar, Math.floor(i / 16) % 4);
    assert.equal(position.step, i % 16); assert.equal(position.beat, Math.floor((i % 16) / 4));
  }
  assert.deepEqual(playbackPosition(3.99999), { absolute: 63, bar: 3, step: 15, beat: 3 });
  assert.deepEqual(playbackPosition(4), { absolute: 64, bar: 0, step: 0, beat: 0 });
  for (const invalid of [NaN, Infinity, -Infinity, -1]) assert.equal(playbackPosition(invalid).absolute, 0);
});

test('following selects only the audible bar while paused updates retain the editor selection', () => {
  const follower = new PlaybackFollower();
  for (const head of [.25, 1.25, 2.25, 3.25, .25]) assert.equal(follower.update(head, true).selectedBar, Math.floor(head));
  follower.select(2, false);
  assert.equal(follower.update(0, false).selectedBar, 2);
  assert.equal(follower.update(0, true).selectedBar, 0);
});

test('manual bar navigation suspends following through wrap; restoring it jumps to current playback, not to a new audio position', () => {
  const follower = new PlaybackFollower(); follower.update(1.5, true);
  follower.select(3, true); assert.equal(follower.enabled, true); assert.equal(follower.following, false);
  for (const head of [2.5, 3.5, .5]) {
    const view = follower.update(head, true);
    assert.equal(view.selectedBar, 3); assert.equal(view.bar, Math.floor(head));
  }
  follower.setEnabled(true); const view = follower.update(.5, true);
  assert.equal(view.selectedBar, 0); assert.equal(view.step, 8); assert.equal(view.following, true);
});

test('temporary suspension resets on new playback while an explicit disabled preference stays disabled', () => {
  const follower = new PlaybackFollower();
  follower.select(3, true); follower.stop(); follower.start();
  assert.equal(follower.update(1.5, true).selectedBar, 1);
  follower.setEnabled(false); follower.select(3, true); follower.stop(); follower.start();
  assert.equal(follower.update(1.5, true).selectedBar, 3); assert.equal(follower.following, false);
  const restored = new PlaybackFollower(false);
  restored.select(2); assert.equal(restored.update(0, true).selectedBar, 2);
  assert.throws(() => restored.select(4)); assert.throws(() => restored.select(-1));
});
