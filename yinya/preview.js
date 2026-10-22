import { Synth } from '../synth/synth.ts';
import { PITCH_VALUES } from './theory.js';
import { Config } from '../synth/SynthConfig.ts';
import { audioSong } from './song.js';
import { TRACKS, CHORDS, GROUP_SIZE, songJSON, validate, pitchedNoteAt, LONG_NOTE_TRACKS, chordNotes, sectionChordStyle, trackAudibleAt, hasAudibleNotes, sectionVoice, sectionGain, sectionDrumKit } from './model.js';
import {voicedPitches,chordInversion} from './chord-expression.js';
import {drumReleaseSeconds} from './drum-kits.js';
import { releaseSeconds, voiceInfo, chordReleaseSeconds, chordVoiceInfo, bassVoiceInfo, bassReleaseSeconds } from './voices.js';
import { AudioRenderer, phraseState, sectionState, fadeEnd } from './render.js';

export const PREVIEW_SECONDS = .32;
const HOLD_SECONDS = .25;

export function previewPitches(trackIndex, row, state = null, position = null) {
  const track = TRACKS[trackIndex], shift = state?.transpose ?? 0;
  if (!track || !Number.isInteger(row) || row < 0) throw new Error('试听音符超出范围');
  if (track.id === 'chords') { if(!CHORDS[row])throw new Error('试听和弦超出范围');const code=position?.step!==undefined?state?.tracks[1].chordVoicings[position.bar]?.[position.step]:1;return voicedPitches(row,chordInversion(code??1),shift); }
  if (track.id === 'drums') { if(row>2)throw new Error('试听鼓点超出范围');return [[8],[4],[0]][row]; }
  const pitch=position?.pitch ?? (row<8?7-row:-1);
  if(!Number.isInteger(pitch)||PITCH_VALUES[pitch]===undefined)throw new Error('试听音高超出范围');
  return [PITCH_VALUES[pitch]+(track.id==='bass'?24:48)+shift];
}

// Render only the clicked sound with the same BeepBox instrument as the song.
// A separate synth keeps the main loop, playhead and export data untouched.
export function renderPreview(value, trackIndex, row, sampleRate = 44100, notePosition = null) {
  const state = validate(value), pitches = previewPitches(trackIndex, row, state, notePosition), layer = state.tracks[trackIndex];
  const bar = notePosition?.bar ?? 0;
  if (!Number.isInteger(bar) || bar < 0 || bar >= state.barCount) throw new Error('试听小节位置无效');
  if (!trackAudibleAt(state, trackIndex, bar)) return null;
  const json = songJSON(state); json.channels = [json.channels[trackIndex]];
  const part=state.sections[Math.floor(bar/4)],dynamic=part.volumes[trackIndex]!==part.endVolumes[trackIndex];
  if(json.yinyaDynamics)json.yinyaDynamics=[json.yinyaDynamics[trackIndex]];
  const offsetStep=notePosition?.offsetStep??0;
  if(!Number.isInteger(offsetStep)||offsetStep<0||offsetStep>15)throw new Error('试听时间位置无效');
  json.yinyaDynamicsOffset=bar+offsetStep/16;
  const id=trackIndex<3?sectionVoice(state,trackIndex,bar):null, gain=sectionGain(state,trackIndex,bar);
  const instruments=json.channels[0].patterns[bar].instruments;
  let seconds = PREVIEW_SECONDS;
  const positioned = notePosition?.step !== undefined;
  const style = sectionChordStyle(state,bar);
  const drumSequence=trackIndex===3&&(notePosition?.drumLane!==undefined||sectionDrumKit(state,bar)!=='original');
  const sequencePreview = drumSequence || positioned || (trackIndex === 1 && (style !== 'block' || row >= 4));
  if(drumSequence){
    const lane=notePosition?.drumLane??2-row;if(![0,1,2].includes(lane))throw new Error('试听鼓点行无效');
    const source=json.channels[0].patterns[bar].notes.find(n=>n.points[0].tick===offsetStep&&n.pitches.includes(lane*4));if(!source)throw new Error('试听鼓点不存在');
    const isolated={...source,pitches:[lane*4],...(source.yinyaDrumGains?{yinyaDrumGains:{[lane*4]:source.yinyaDrumGains[lane*4]}}:{}),points:source.points.map(p=>({...p,tick:p.tick-offsetStep}))};
    json.channels[0].patterns=[{...(instruments?{instruments}:{}),notes:[isolated]}];json.channels[0].sequence=[1];json.loopBars=1;seconds=60/state.tempo/4+drumReleaseSeconds(sectionDrumKit(state,bar),state.tempo);
  }else if (sequencePreview) {
    if (![0, 1, 2].includes(trackIndex)) throw new Error('按实际时长试听仅支持旋律、和弦与贝斯');
    let start, duration, release, notes;
    if (LONG_NOTE_TRACKS.includes(trackIndex)) {
      const note = pitchedNoteAt(state, trackIndex, notePosition.bar, notePosition.step);
      if (!note || PITCH_VALUES[note.pitch] + (trackIndex===0?48:24) + state.transpose !== pitches[0]) throw new Error('试听音符不存在');
      ({ start, duration } = note);json.yinyaDynamicsOffset=(note.bar??bar)+start/16; release = trackIndex === 0 ? releaseSeconds(id, state.tempo) : bassReleaseSeconds(id,state.tempo);
      if(note.bar!==undefined||start+duration>16){
        const owner=note.bar??bar,source=json.channels[0].patterns,fragments=[];
        for(let b=owner;b<=Math.floor((owner*16+start+duration-1)/16);b++)for(const n of source[b].notes){
          const at=b*16+n.points[0].tick;
          if(at>=owner*16+start&&at<owner*16+start+duration)fragments.push({...n,points:n.points.map(p=>({...p,tick:b*16+p.tick-owner*16-start}))});
        }
        const count=Math.ceil(duration/16)+1;
        json.channels[0].patterns=Array.from({length:count},(_,i)=>({...(instruments?{instruments}:{}),notes:fragments.flatMap(n=>{
          const left=Math.max(i*16,n.points[0].tick),right=Math.min((i+1)*16,n.points.at(-1).tick);
          if(left>=right)return [];
          return [{...n,...(left>0?{continuesLastPattern:true}:{continuesLastPattern:false}),points:[{...n.points[0],tick:left-i*16},{...n.points.at(-1),tick:right-i*16}]}];
        })}));
        // Rebased fragments that meet within a bar are one note, so the synth does not reattack.
        for(const pattern of json.channels[0].patterns)for(let i=pattern.notes.length-1;i>0;i--){const a=pattern.notes[i-1],b=pattern.notes[i];if(a.points.at(-1).tick===b.points[0].tick){a.points[a.points.length-1]=b.points.at(-1);pattern.notes.splice(i,1);}}
        json.channels[0].sequence=Array.from({length:count},(_,i)=>i+1);json.loopBars=count;
        seconds=duration*60/state.tempo/4+release;
        notes=[];
      }
    } else if (!positioned) {
      start = 0; duration = 4; release = chordReleaseSeconds(id, state.tempo);
      notes = chordNotes(row, 0, id, style, state.transpose);
      if(!dynamic&&gain!==1)notes.forEach(n=>{n.yinyaSectionGain=gain;});
    } else {
      const { bar, step } = notePosition;
      if (!Number.isInteger(bar) || !Number.isInteger(step) || bar < 0 || bar >= state.barCount || step < 0 || step > 3 || layer.bars[bar][step] !== row) throw new Error('试听和弦不存在');
      start = step * 4;json.yinyaDynamicsOffset=bar+start/16; duration = 4; release = chordReleaseSeconds(id, state.tempo);
    }
    notes ??= json.channels[0].patterns[notePosition.bar].notes.filter(n => n.points[0].tick >= start && n.points[0].tick < start + duration);
    if(notes.length){const isolated = notes.map(n => ({ ...n, points: n.points.map(point => ({ ...point, tick: point.tick - start })) }));
    json.channels[0].patterns = [{ ...(instruments?{instruments}:{}),notes: isolated }]; json.channels[0].sequence = [1]; json.loopBars = 1;}
    seconds = duration * 60 / state.tempo / 4 + release;
  }
  const song = audioSong(json);
  const synth = new Synth(song); synth.samplesPerSecond = sampleRate;
  if (!sequencePreview) {
    synth.liveInputChannel = 0; synth.liveInputInstruments = instruments?instruments.map(n=>n-1):[0];
    synth.liveInputPitches = pitches; synth.liveInputStarted = true;
    synth.liveInputDuration = Math.ceil(HOLD_SECONDS * state.tempo / 60 * Config.partsPerBeat);
  } else synth.loopRepeatCount = 0;
  const count = Math.ceil(seconds * sampleRate);
  const left = new Float32Array(count), right = new Float32Array(count);
  synth.synthesize(left, right, count, sequencePreview);
  if(!sequencePreview&&!dynamic&&gain!==1)for(let i=0;i<count;i++){left[i]*=gain;right[i]*=gain;}
  const shapedEnding = trackIndex === 0 ? !voiceInfo(id).legacy : trackIndex === 2 ? !bassVoiceInfo(id).legacy : trackIndex === 3 ? sectionDrumKit(state,bar)!=='original' : trackIndex === 1 && (!chordVoiceInfo(id).legacy || style !== 'block');
  if (sequencePreview && shapedEnding) fadeEnd(left, right, Math.ceil(sampleRate * .02));
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
    previewPitches(trackIndex, row, state, position);
    const bar = position?.bar ?? 0;
    if (!Number.isInteger(bar) || bar < 0 || bar >= state.barCount) throw new Error('试听小节位置无效');
    if (!trackAudibleAt(state, trackIndex, bar)) return false;
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
    this.active = { source, gain, startedAt: start };
  }
  elapsedSeconds() { return this.active ? Math.max(0,this.context.currentTime-this.active.startedAt) : null; }
  playPhrase(value, start, changed = () => {}, mode = 'melody') {
    return this.playSnapshot(() => phraseState(value, start, mode), changed, [0, 1]);
  }
  playSection(value, start, changed = () => {}) {
    return this.playSnapshot(() => sectionState(value, start), changed, [0, 1, 2, 3]);
  }
  async playSnapshot(makeState, changed, indices) {
    this.stop(); const generation = this.generation, state = makeState();
    if (!hasAudibleNotes(state, 0, GROUP_SIZE, indices)) return false;
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
