import { Song, Synth } from '../synth/synth.ts';
import { SongRenderer } from '../editor/SongRenderer.ts';
import { validate, songJSON, GROUP_SIZE } from './model.js';
import { voiceInfo, releaseSeconds, chordVoiceInfo, chordReleaseSeconds } from './voices.js';

export function phraseState(value, start, mode = 'melody') {
  if (!['melody', 'duet'].includes(mode)) throw new Error('段落试听模式无效');
  const state = validate(value);
  if (!Number.isInteger(start) || start < 0 || start % GROUP_SIZE || start + GROUP_SIZE > state.barCount) throw new Error('试听段落无效');
  state.barCount = GROUP_SIZE;
  state.tracks.forEach((track, index) => {
    track.enabled = (index === 0 || (mode === 'duet' && index === 1)) && track.enabled;
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
    const state = validate(value);
    let hasNewVoice = false;
    this.tailSeconds = 0;
    for (const index of [0, 1]) {
      const track = state.tracks[index], id = index === 0 ? state.voice : state.chordVoice;
      const voice = index === 0 ? voiceInfo(id) : chordVoiceInfo(id);
      if (voice.legacy || !track.enabled || track.volume === 0) continue;
      let lastEnd = 0;
      track.bars.forEach((bar, barIndex) => bar.forEach((pitch, step) => {
        if (pitch >= 0) lastEnd = Math.max(lastEnd, barIndex * 16 + (index === 0 ? step + track.durations[barIndex][step] : step * 4 + 4));
      }));
      if (!lastEnd) continue;
      hasNewVoice = true;
      const silence = (state.barCount * 16 - lastEnd) * 60 / state.tempo / 4;
      const release = index === 0 ? releaseSeconds(id, state.tempo) : chordReleaseSeconds(id, state.tempo);
      if (ending === 'natural') this.tailSeconds = Math.max(this.tailSeconds, release - silence);
    }
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
    if (hasNewVoice) fadeEnd(this.outputSamplesL, this.outputSamplesR, Math.ceil(sampleRate * (this.tailSeconds ? .02 : .004)));
  }
}
