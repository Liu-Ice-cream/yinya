import { Song, Synth } from '../synth/synth.ts';
import { Config } from '../synth/SynthConfig.ts';
import { TRACKS, PITCHES, CHORDS, songJSON, validate } from './model.js';

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
export function renderPreview(value, trackIndex, row, sampleRate = 44100) {
  const pitches = previewPitches(trackIndex, row), state = validate(value), layer = state.tracks[trackIndex];
  if (!layer.enabled || layer.volume === 0) return null;
  const json = songJSON(state); json.channels = [json.channels[trackIndex]];
  const song = new Song(); song.fromJsonObject(json);
  const synth = new Synth(song); synth.samplesPerSecond = sampleRate;
  synth.liveInputChannel = 0; synth.liveInputInstruments = [0];
  synth.liveInputPitches = pitches; synth.liveInputStarted = true;
  synth.liveInputDuration = Math.ceil(HOLD_SECONDS * state.tempo / 60 * Config.partsPerBeat);
  const count = Math.ceil(PREVIEW_SECONDS * sampleRate);
  const left = new Float32Array(count), right = new Float32Array(count);
  synth.synthesize(left, right, count, false);
  return { left, right, sampleRate };
}

export class PreviewPlayer {
  constructor(createContext = () => new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' })) {
    this.createContext = createContext; this.context = null; this.active = null; this.generation = 0;
  }
  stop() {
    this.generation++;
    if (!this.active) return;
    const { source, gain } = this.active; this.active = null;
    source.onended = null; source.stop(); source.disconnect(); gain.disconnect();
  }
  async play(value, trackIndex, row) {
    this.stop(); const generation = this.generation, state = validate(value);
    previewPitches(trackIndex, row);
    if (!state.tracks[trackIndex].enabled || state.tracks[trackIndex].volume === 0) return false;
    try {
      const context = this.context || (this.context = this.createContext());
      await context.resume();
      if (generation !== this.generation) return false;
      const audio = renderPreview(state, trackIndex, row, context.sampleRate);
      const buffer = context.createBuffer(2, audio.left.length, context.sampleRate);
      buffer.copyToChannel(audio.left, 0); buffer.copyToChannel(audio.right, 1);
      const source = context.createBufferSource(), gain = context.createGain();
      source.buffer = buffer; source.connect(gain); gain.connect(context.destination);
      const start = context.currentTime, end = start + buffer.duration;
      gain.gain.setValueAtTime(0, start); gain.gain.linearRampToValueAtTime(1, start + .003);
      gain.gain.setValueAtTime(1, end - .015); gain.gain.linearRampToValueAtTime(0, end);
      source.onended = () => { source.disconnect(); gain.disconnect(); if (this.active?.source === source) this.active = null; };
      try { source.start(); }
      catch (error) { source.onended = null; source.disconnect(); gain.disconnect(); throw error; }
      this.active = { source, gain };
      return true;
    } catch (error) {
      if (generation !== this.generation) return false;
      throw error;
    }
  }
  dispose() {
    this.stop(); const context = this.context; this.context = null;
    if (context) context.close().catch(() => {});
  }
}
