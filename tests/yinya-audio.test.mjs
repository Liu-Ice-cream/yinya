import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { preset, songJSON, validate } from '../yinya/model.js';

await mkdir('build', { recursive: true });
await build({ entryPoints: ['synth/index.ts'], bundle: true, platform: 'node', format: 'esm', outfile: 'build/yinya-audio-test.mjs' });
const { Song, Synth } = await import(pathToFileURL(resolve('build/yinya-audio-test.mjs')));
function render(state, seconds = 1) {
  const song = new Song(); song.fromJsonObject(songJSON(state));
  state.tracks.forEach((t, i) => { song.channels[i].muted = !t.enabled || t.volume === 0; });
  const synth = new Synth(song); synth.samplesPerSecond = 44100; synth.loopRepeatCount = -1;
  const l = new Float32Array(44100 * seconds), r = new Float32Array(l.length);
  synth.synthesize(l, r, l.length);
  return { l, r, synth, song };
}
test('each original preset renders finite nonzero stereo PCM with actual BeepBox', () => {
  for (const id of ['sprout', 'moon', 'pixel']) {
    const { l, r, song } = render(preset(id));
    assert.equal(song.barCount, 4); assert.equal(song.getChannelCount(), 4);
    assert.ok(l.every(Number.isFinite)); assert.ok(r.every(Number.isFinite));
    assert.ok(l.some(n => Math.abs(n) > .001));
  }
});
test('each layer can produce audio alone; mute and zero volume produce silence', () => {
  for (let index = 0; index < 4; index++) {
    const state = preset('sprout'); state.tracks.forEach((t, i) => t.enabled = i === index);
    assert.ok(render(state).l.some(n => Math.abs(n) > .001), `layer ${index} is audible`);
  }
  for (const mode of ['enabled', 'volume']) {
    const state = preset('sprout'); state.tracks.forEach(t => t[mode] = mode === 'enabled' ? false : 0);
    assert.ok(render(state).l.every(n => n === 0));
  }
});
test('sample based timing crosses loop boundary correctly at min and max speed', () => {
  for (const tempo of [60, 180]) {
    const state = preset('sprout'); state.tempo = tempo;
    const { synth } = render(validate(state));
    synth.snapToStart(); synth.resetEffects();
    const samples = Math.ceil(synth.getSamplesPerBar() * 4 + 4410);
    synth.synthesize(new Float32Array(samples), new Float32Array(samples), samples);
    const expected = .1 / (240 / tempo);
    assert.ok(Math.abs(synth.playhead - expected) < .005, `tempo ${tempo}: ${synth.playhead} vs ${expected}`);
  }
});
