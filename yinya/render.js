import { Song, Synth } from '../synth/synth.ts';
import { SongRenderer } from '../editor/SongRenderer.ts';
import { validate, songJSON, GROUP_SIZE } from './model.js';
import { voiceInfo, releaseSeconds } from './voices.js';

export function phraseState(value, start) {
  const state = validate(value);
  if (!Number.isInteger(start) || start < 0 || start % GROUP_SIZE || start + GROUP_SIZE > state.barCount) throw new Error('试听段落无效');
  state.barCount = GROUP_SIZE;
  state.tracks.forEach((track, index) => {
    track.enabled = index === 0 && track.enabled;
    track.bars = track.bars.slice(start, start + GROUP_SIZE);
    if (track.durations) track.durations = track.durations.slice(start, start + GROUP_SIZE);
  });
  return state;
}
export function fadeEnd(left, right, count) {
  const start = Math.max(0, left.length - count), length = left.length - start;
  for (let i = 0; i < length; i++) { const gain = (length - 1 - i) / Math.max(1, length - 1); left[start + i] *= gain; right[start + i] *= gain; }
}
// Render one silent bar to allow actual released tones to finish. Retain only
// the instrument's bounded release, with no extra note attacks or repeated bar.
export class AudioRenderer {
  constructor() { this.canceled = false; this.outputSamplesL = null; this.outputSamplesR = null; this.tailSeconds = 0; }
  async* generate(value, sampleRate = 44100, ending = 'natural') {
    if (!['natural', 'loop'].includes(ending)) throw new Error('导出结尾设置无效');
    const state = validate(value), voice = voiceInfo(state.voice), melody = state.tracks[0];
    const hasMelody = melody.enabled && melody.volume > 0 && melody.bars.some(bar => bar.some(n => n >= 0));
    let lastEnd = 0;
    if (hasMelody) melody.bars.forEach((bar, index) => bar.forEach((pitch, step) => { if (pitch >= 0) lastEnd = Math.max(lastEnd, index * 16 + step + melody.durations[index][step]); }));
    const existingSilence = (state.barCount * 16 - lastEnd) * 60 / state.tempo / 4;
    this.tailSeconds = ending === 'natural' && !voice.legacy && hasMelody ? Math.max(0, releaseSeconds(state.voice, state.tempo) - existingSilence) : 0;
    const json = songJSON(state);
    if (this.tailSeconds) {
      json.loopBars++;
      json.channels.forEach(channel => channel.sequence.push(0));
    }
    const song = new Song(); song.fromJsonObject(json);
    state.tracks.forEach((track, index) => { song.channels[index].muted = !track.enabled || track.volume === 0; });
    const synth = new Synth(song); synth.samplesPerSecond = sampleRate;
    const musicalSamples = Math.ceil(synth.getSamplesPerBar() * state.barCount);
    const outputLength = musicalSamples + Math.ceil(this.tailSeconds * sampleRate);
    const renderer = new SongRenderer();
    for await (const progress of renderer.generate(song, sampleRate, false, false, 1)) {
      if (this.canceled) { renderer.canceled = true; return; }
      yield progress;
      if (this.canceled) { renderer.canceled = true; return; }
    }
    if (this.canceled) return;
    this.outputSamplesL = renderer.outputSamplesL.subarray(0, outputLength);
    this.outputSamplesR = renderer.outputSamplesR.subarray(0, outputLength);
    if (!voice.legacy && hasMelody) fadeEnd(this.outputSamplesL, this.outputSamplesR, Math.ceil(sampleRate * (this.tailSeconds ? .02 : .004)));
  }
}
