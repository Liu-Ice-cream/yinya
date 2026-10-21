import test from 'node:test';
import assert from 'node:assert/strict';
import { VOICES, voiceInfo, melodyInstrument } from '../yinya/voices.js';
import { preset, blank, validate, setMelodyNote, resize, copyGroup, encode, decode, songJSON } from '../yinya/model.js';
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
await build({ entryPoints: ['yinya/render.js'], bundle: true, platform: 'node', format: 'esm', outfile: 'build/yinya-voices-model-test.mjs' });
const { phraseState } = await import(pathToFileURL(resolve('build/yinya-voices-model-test.mjs')));

test('six fixed voice definitions retain exact legacy instruments and cannot be mutated through generated songs', () => {
  assert.equal(VOICES.length, 6); assert.equal(new Set(VOICES.map(v => v.id)).size, 6);
  for (const voice of VOICES) {
    assert.equal(voiceInfo(voice.id), voice);
    if (voice.legacy) assert.deepEqual(melodyInstrument(voice.id, 80), { type: 'chip', wave: voice.id, volume: 80, effects: ['transition type', 'chord type'], transition: 'normal', chord: 'simultaneous', fadeInSeconds: 0, fadeOutTicks: -1 });
    else {
      assert.throws(() => { voice.settings.envelopes.push({}); });
      const generated = melodyInstrument(voice.id, 80); generated.envelopes.length = 0;
      assert.ok(melodyInstrument(voice.id, 80).envelopes.length > 0);
    }
  }
  assert.throws(() => voiceInfo('unknown-piano'));
  assert.throws(() => validate({ ...preset('sprout'), voice: 'unknown-piano' }));
});

test('v1 through v3 keep legacy timbres and note timing; new voices round-trip without parameters in shared data', () => {
  for (const version of [1, 2, 3]) for (const voice of VOICES.filter(v => v.legacy)) {
    const state = setMelodyNote(blank('旧版音色'), 0, 0, 5, 8).state; state.voice = voice.id; state.version = version;
    if (version < 3) delete state.tracks[0].durations;
    if (version === 1) delete state.barCount;
    const before = structuredClone(state), upgraded = validate(state);
    assert.equal(upgraded.voice, voice.id); assert.equal(upgraded.version, 12);
    assert.equal(upgraded.tracks[0].durations[0][0], version < 3 ? 1 : 8);
    const note = songJSON(upgraded).channels[0].patterns[0].notes[0];
    assert.deepEqual(note.points.map(p => [p.tick, p.volume]), [[0, 90], [version < 3 ? 1 : 8, 0]]);
    assert.deepEqual(state, before);
  }
  for (const voice of VOICES) {
    const state = resize(preset('moon'), 16, 'repeat'); state.voice = voice.id;
    const tracks = structuredClone(state.tracks);
    assert.deepEqual(decode(encode(state)), state);
    assert.deepEqual(validate(JSON.parse(JSON.stringify(state))), state);
    assert.deepEqual(copyGroup(state, 0, 12).tracks, tracks);
    assert.ok(!JSON.stringify(state).includes('harmonics'));
    assert.ok(encode(state).length < 20000);
  }
});

test('phrase audition isolates the selected four-bar melody, respecting mute and leaving notes, volume and stored state untouched', () => {
  let state = resize(preset('sprout'), 16, 'empty'); state.voice = 'piano-v1';
  state = setMelodyNote(state, 4, 3, 5, 8).state;
  const before = structuredClone(state), phrase = phraseState(state, 4);
  assert.equal(phrase.barCount, 4); assert.equal(phrase.voice, 'piano-v1');
  assert.deepEqual(phrase.tracks.map(t => t.enabled), [true, false, false, false]);
  assert.deepEqual(phrase.tracks[0].bars, state.tracks[0].bars.slice(4, 8));
  assert.deepEqual(phrase.tracks[0].durations, state.tracks[0].durations.slice(4, 8));
  phrase.tracks[0].bars[0][3] = 7; assert.deepEqual(state, before);
  state.tracks[0].enabled = false; assert.equal(phraseState(state, 4).tracks[0].enabled, false);
  for (const start of [-4, 1, 16]) assert.throws(() => phraseState(state, start));
});
