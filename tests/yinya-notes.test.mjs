import test from 'node:test';
import assert from 'node:assert/strict';
import { blank, preset, validate, setMelodyNote, removeMelodyNote, melodyAt, copyBar, copyGroup, resize, encode, decode, songJSON } from '../yinya/model.js';

test('v1 and v2 migration keeps adjacent repeated notes separate with their exact original timing', () => {
  for (const version of [1, 2]) {
    const old = blank('旧版重复音', version === 1 ? 4 : 16); old.version = version;
    if (version === 1) delete old.barCount;
    delete old.tracks[0].durations;
    old.tracks[0].bars[0][0] = 3; old.tracks[0].bars[0][1] = 3;
    const before = structuredClone(old), migrated = validate(old);
    assert.equal(migrated.version, 4);
    assert.deepEqual(migrated.tracks[0].durations[0], Array(16).fill(1));
    assert.deepEqual(migrated.tracks[0].bars, old.tracks[0].bars);
    const notes = songJSON(migrated).channels[0].patterns[0].notes;
    assert.equal(notes.length, 2);
    assert.deepEqual(notes.map(n => n.points.map(p => p.tick)), [[0, 1], [1, 2]]);
    assert.deepEqual(decode('#yinya=' + Buffer.from(JSON.stringify(old)).toString('base64url')), migrated);
    assert.deepEqual(old, before);
  }
});

test('held cells resolve to a single onset; insertion splits a held note without erasing the next note', () => {
  const original = blank(), held = setMelodyNote(original, 0, 2, 5, 8).state;
  assert.deepEqual(melodyAt(held, 0, 8), { start: 2, pitch: 5, duration: 8 });
  const next = setMelodyNote(held, 0, 6, 3, 4).state;
  assert.deepEqual(songJSON(next).channels[0].patterns[0].notes.map(n => [n.pitches[0], ...n.points.map(p => p.tick)]), [[60, 2, 6], [55, 6, 10]]);
  const limited = setMelodyNote(next, 0, 2, 5, 8);
  assert.equal(limited.duration, 4); assert.equal(limited.limited, true);
  assert.deepEqual(melodyAt(limited.state, 0, 9), { start: 6, pitch: 3, duration: 4 });
  assert.deepEqual(removeMelodyNote(next, 0, 8).tracks[0].bars[0], held.tracks[0].bars[0]);
  assert.equal(removeMelodyNote(next, 0, 8).tracks[0].durations[0][2], 4, 'deletion does not silently lengthen the preceding note');
  assert.ok(original.tracks[0].bars[0].every(n => n === -1));
  assert.equal(held.tracks[0].durations[0][2], 8, 'edits return independent snapshots for undo');
});

test('lengths clip at bar ends and later onsets, while malformed or overlapping durations are rejected', () => {
  const end = setMelodyNote(blank(), 0, 13, 7, 8);
  assert.equal(end.duration, 3); assert.equal(end.limited, true);
  assert.equal(songJSON(end.state).channels[0].patterns[0].notes[0].points[1].tick, 16);
  const note = setMelodyNote(blank(), 0, 0, 2, 8).state;
  for (const mutate of [s => delete s.tracks[0].durations, s => s.tracks[0].durations.pop(), s => s.tracks[0].durations[0].pop(), s => s.tracks[0].durations[0][0] = 9, s => s.tracks[0].durations[0][0] = 1.5, s => s.tracks[0].durations[0][3] = 2, s => s.tracks[0].bars[0][4] = 7]) {
    const invalid = structuredClone(note); mutate(invalid); assert.throws(() => validate(invalid));
  }
  for (const args of [[-1, 0, 0, 1], [0, 16, 0, 1], [0, 0, 8, 1], [0, 0, 0, 3]]) assert.throws(() => setMelodyNote(blank(), ...args));
  assert.throws(() => validate({ ...end.state, tracks: end.state.tracks.map((t, i) => i ? t : { ...t, durations: t.durations.map(d => d.map((n, j) => j === 13 ? 8 : n)) }) }));
});

test('copy, group copy, repeat expansion and shrinking keep durations independent and survive sharing and backup', () => {
  const state = setMelodyNote(blank('长音🎵'.repeat(15)), 0, 0, 2, 8).state;
  const one = copyBar(state, 0, 0, 1);
  assert.equal(one.tracks[0].durations[1][0], 8);
  one.tracks[0].durations[1][0] = 4; assert.equal(one.tracks[0].durations[0][0], 8);
  const expanded = resize(state, 16, 'repeat'), copied = copyGroup(resize(state, 16), 0, 12);
  assert.equal(copied.tracks[0].durations[12][0], 8);
  assert.equal(expanded.tracks[0].durations[12][0], 8);
  assert.equal(resize(state, 16).tracks[0].durations[12][0], 1);
  assert.deepEqual(resize(expanded, 4), state);
  assert.deepEqual(decode(encode(expanded)), expanded);
  assert.deepEqual(validate(JSON.parse(JSON.stringify(expanded))), expanded);
  assert.ok(Buffer.byteLength(JSON.stringify(expanded, null, 2)) <= 20000);
  assert.ok(encode(expanded).length <= 20000);
  copied.tracks[0].durations[12][0] = 4; assert.equal(copied.tracks[0].durations[0][0], 8);
});
