import { Synth } from '../synth/synth.ts';
import { SongRenderer } from '../editor/SongRenderer.ts';
import { audioSong } from './song.js';
import { validate, songJSON, GROUP_SIZE, trackAudibleAt, sectionVoice, sectionDrumKit } from './model.js';
import {drumReleaseSeconds} from './drum-kits.js';
import { voiceInfo, releaseSeconds, chordVoiceInfo, chordReleaseSeconds, bassVoiceInfo, bassReleaseSeconds } from './voices.js';

export function sectionState(value, start) {
  const state = validate(value);
  if (!Number.isInteger(start) || start < 0 || start % GROUP_SIZE || start + GROUP_SIZE > state.barCount) throw new Error('试听段落无效');
  state.sections = state.sections.slice(start / GROUP_SIZE, start / GROUP_SIZE + 1);
  state.barCount = GROUP_SIZE;
  state.tracks.forEach(track => {
    track.bars = track.bars.slice(start, start + GROUP_SIZE);
    if (track.durations) track.durations = track.durations.slice(start, start + GROUP_SIZE);
    if (track.velocities) track.velocities = track.velocities.slice(start, start + GROUP_SIZE);
    if(track.drumVelocities)track.drumVelocities=track.drumVelocities.slice(start,start+GROUP_SIZE);
    if(track.chordDurations)track.chordDurations=track.chordDurations.slice(start,start+GROUP_SIZE);
    if(track.chordVoicings)track.chordVoicings=track.chordVoicings.slice(start,start+GROUP_SIZE);
  });
  return state;
}
export function phraseState(value, start, mode = 'melody') {
  if (!['melody', 'duet'].includes(mode)) throw new Error('段落试听模式无效');
  const state = sectionState(value, start);
  state.tracks.forEach((track, index) => { track.enabled = (index === 0 || (mode === 'duet' && index === 1)) && track.enabled; });
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
    const json = songJSON(state);
    for (const index of [0, 1, 2]) {
      json.channels[index].patterns.forEach((pattern, bar) => {
        if (!trackAudibleAt(state,index,bar)) return;
        const id=sectionVoice(state,index,bar),voice=[voiceInfo,chordVoiceInfo,bassVoiceInfo][index](id);
        if(voice.legacy||!pattern.notes.length)return;
        hasNewVoice = true;
        const lastEnd=bar*16+Math.max(...pattern.notes.map(note=>note.points.at(-1).tick));
        const silence=(state.barCount*16-lastEnd)*60/state.tempo/4;
        const release=[releaseSeconds,chordReleaseSeconds,bassReleaseSeconds][index](id,state.tempo);
        if(ending==='natural')this.tailSeconds=Math.max(this.tailSeconds,release-silence);
      });
    }
    json.channels[3].patterns.forEach((p,bar)=>{const id=sectionDrumKit(state,bar);if(id==='original'||!trackAudibleAt(state,3,bar)||!p.notes.length)return;hasNewVoice=true;const lastEnd=bar*16+Math.max(...p.notes.map(n=>n.points.at(-1).tick)),silence=(state.barCount*16-lastEnd)*60/state.tempo/4;if(ending==='natural')this.tailSeconds=Math.max(this.tailSeconds,drumReleaseSeconds(id,state.tempo)-silence);});
    if (this.tailSeconds) {
      json.loopBars++;
      json.channels.forEach(channel => channel.sequence.push(0));
    }
    const song = audioSong(json);
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
