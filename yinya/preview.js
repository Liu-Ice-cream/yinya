import { Song, Synth } from '../synth/synth.ts';
import { Config } from '../synth/SynthConfig.ts';
import { TRACKS, PITCHES, CHORDS, songJSON, validate, melodyAt } from './model.js';
import { releaseSeconds, voiceInfo } from './voices.js';
import { AudioRenderer, phraseState, fadeEnd } from './render.js';

export const PREVIEW_SECONDS = .32;
const HOLD_SECONDS = .25;

export function previewPitches(trackIndex, row) {
  const track = TRACKS[trackIndex];
  if (!track || !Number.isInteger(row) || row < 0 || row >= track.rows.length) throw new Error('试听音符超出范围');
  if (track.id === 'chords') return [...CHORDS[row]];
  if (track.id === 'drums') return [[8], [4], [0]][row];
  return [PITCHES[7 - row] + (track.id === 'bass' ? 24 : 48)];
}

// Render only the clicked sound with the same BeepBox instrument as the song.
// A separate synth keeps the main loop, playhead and export data untouched.
export function renderPreview(value, trackIndex, row, sampleRate = 44100, notePosition = null) {
  const pitches = previewPitches(trackIndex, row), state = validate(value), layer = state.tracks[trackIndex];
  if (!layer.enabled || layer.volume === 0) return null;
  const json = songJSON(state); json.channels = [json.channels[trackIndex]];
  let seconds = PREVIEW_SECONDS;
  if (notePosition !== null) {
    if (trackIndex !== 0) throw new Error('长音试听仅支持旋律');
    const note = melodyAt(state, notePosition.bar, notePosition.step);
    if (!note || note.pitch !== 7 - row) throw new Error('试听旋律音符不存在');
    const exported = json.channels[0].patterns[notePosition.bar].notes.find(n => n.points[0].tick === note.start);
    const isolated = { ...exported, points: exported.points.map(point => ({ ...point, tick: point.tick - note.start })) };
    json.channels[0].patterns = [{ notes: [isolated] }]; json.channels[0].sequence = [1]; json.loopBars = 1;
    seconds = note.duration * 60 / state.tempo / 4 + releaseSeconds(state.voice, state.tempo);
  }
  const song = new Song(); song.fromJsonObject(json);
  const synth = new Synth(song); synth.samplesPerSecond = sampleRate;
  if (notePosition === null) {
    synth.liveInputChannel = 0; synth.liveInputInstruments = [0];
    synth.liveInputPitches = pitches; synth.liveInputStarted = true;
    synth.liveInputDuration = Math.ceil(HOLD_SECONDS * state.tempo / 60 * Config.partsPerBeat);
  } else synth.loopRepeatCount = 0;
  const count = Math.ceil(seconds * sampleRate);
  const left = new Float32Array(count), right = new Float32Array(count);
  synth.synthesize(left, right, count, notePosition !== null);
  if (notePosition !== null && !voiceInfo(state.voice).legacy) fadeEnd(left, right, Math.ceil(sampleRate * .02));
  return { left, right, sampleRate };
}

export class PreviewPlayer {
  constructor(createContext = () => new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' })) {
    this.createContext = createContext; this.context = null; this.active = null; this.generation = 0; this.renderer = null; this.phraseChanged = null;
  }
  stop() {
    this.generation++;
    if (this.renderer) { this.renderer.canceled = true; this.renderer = null; }
    const changed = this.phraseChanged; this.phraseChanged = null;
    changed?.(false);
    if (!this.active) return;
    const { source, gain } = this.active; this.active = null;
    source.onended = null; source.stop(); source.disconnect(); gain.disconnect();
  }
  async play(value, trackIndex, row, notePosition = null) {
    this.stop(); const generation = this.generation, state = validate(value);
    const position = notePosition === null ? null : { ...notePosition };
    previewPitches(trackIndex, row);
    if (!state.tracks[trackIndex].enabled || state.tracks[trackIndex].volume === 0) return false;
    try {
      const context = this.context || (this.context = this.createContext());
      await context.resume();
      if (generation !== this.generation) return false;
      const audio = renderPreview(state, trackIndex, row, context.sampleRate, position);
      this.startAudio(context, audio);
      return true;
    } catch (error) {
      if (generation !== this.generation) return false;
      throw error;
    }
  }
  startAudio(context, audio, ended = null) {
    const buffer = context.createBuffer(2, audio.left.length, context.sampleRate);
    buffer.copyToChannel(audio.left, 0); buffer.copyToChannel(audio.right, 1);
    const source = context.createBufferSource(), gain = context.createGain();
    source.buffer = buffer; source.connect(gain); gain.connect(context.destination);
    const start = context.currentTime, end = start + buffer.duration;
    gain.gain.setValueAtTime(0, start); gain.gain.linearRampToValueAtTime(1, start + .003);
    gain.gain.setValueAtTime(1, end - .015); gain.gain.linearRampToValueAtTime(0, end);
    source.onended = () => { source.disconnect(); gain.disconnect(); if (this.active?.source === source) { this.active = null; ended?.(); } };
    try { source.start(); }
    catch (error) { source.onended = null; source.disconnect(); gain.disconnect(); throw error; }
    this.active = { source, gain };
  }
  async playPhrase(value, start, changed = () => {}) {
    this.stop(); const generation = this.generation, state = phraseState(value, start);
    const melody = state.tracks[0];
    if (!melody.enabled || melody.volume === 0 || !melody.bars.some(bar => bar.some(n => n >= 0))) return false;
    this.phraseChanged = changed; changed(true);
    try {
      const context = this.context || (this.context = this.createContext());
      await context.resume();
      if (generation !== this.generation) return false;
      const renderer = new AudioRenderer(); this.renderer = renderer;
      for await (const _ of renderer.generate(state, context.sampleRate, 'natural')) if (generation !== this.generation) return false;
      if (generation !== this.generation) return false;
      this.renderer = null;
      this.startAudio(context, { left: renderer.outputSamplesL, right: renderer.outputSamplesR }, () => {
        const callback = this.phraseChanged; this.phraseChanged = null; callback?.(false);
      });
      return true;
    } catch (error) {
      if (generation !== this.generation) return false;
      this.stop(); throw error;
    }
  }
  dispose() {
    this.stop(); const context = this.context; this.context = null;
    if (context) context.close().catch(() => {});
  }
}
