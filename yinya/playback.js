import { BAR_COUNTS, GROUP_SIZE, validate } from './model.js';

function checkBarCount(barCount) {
  if (!BAR_COUNTS.includes(barCount)) throw new Error('小节长度无效');
}
// View state only: following never seeks or changes the song.
export function playbackPosition(playhead, barCount = 4) {
  checkBarCount(barCount);
  const head = Number.isFinite(playhead) ? Math.max(0, playhead) : 0;
  const absolute = Math.floor(head * 16);
  const bar = Math.floor(absolute / 16) % barCount, step = absolute % 16;
  return { absolute, bar, step, beat: Math.floor(step / 4) };
}

export class PlaybackFollower {
  constructor(enabled = true, barCount = 4) {
    this.enabled = enabled; this.suspended = false; this.selectedBar = 0;
    this.setBarCount(barCount);
  }
  setBarCount(barCount) {
    checkBarCount(barCount); this.barCount = barCount;
    this.selectedBar = Math.min(this.selectedBar, barCount - 1);
  }
  get following() { return this.enabled && !this.suspended; }
  select(bar, playing = false) {
    if (!Number.isInteger(bar) || bar < 0 || bar >= this.barCount) throw new Error('小节超出范围');
    this.selectedBar = bar;
    if (playing && this.enabled) this.suspended = true;
  }
  setEnabled(enabled) { this.enabled = enabled; this.suspended = false; }
  start() { this.suspended = false; }
  stop() { this.suspended = false; }
  update(playhead, playing) {
    const position = playbackPosition(playhead, this.barCount);
    if (playing && this.following) this.selectedBar = position.bar;
    return { ...position, selectedBar: this.selectedBar, following: this.following, playing };
  }
}

// Keep transport configuration independent of the editor selection and export.
export function playbackRange(value, mode = 'song', selectedBar = 0) {
  const state = validate(value);
  if (!['song', 'section', 'from-section'].includes(mode) || !Number.isInteger(selectedBar) || selectedBar < 0 || selectedBar >= state.barCount) throw new Error('播放范围无效');
  const start = Math.floor(selectedBar / GROUP_SIZE) * GROUP_SIZE;
  return { mode, start: mode === 'song' ? 0 : start, end: mode === 'section' ? start + GROUP_SIZE : state.barCount, sectionId: mode === 'section' ? state.sections[start / GROUP_SIZE].id : null };
}
export function configurePlayback(synth, range) {
  if (!synth.song || !['song', 'section', 'from-section'].includes(range.mode) || !Number.isInteger(range.start) || !Number.isInteger(range.end) || range.start < 0 || range.end > synth.song.barCount || range.end <= range.start || range.start % GROUP_SIZE || (range.mode === 'section' ? range.end - range.start !== GROUP_SIZE : range.end !== synth.song.barCount)) throw new Error('播放范围超出作品');
  synth.song.loopStart = range.mode === 'section' ? range.start : 0;
  synth.song.loopLength = range.mode === 'section' ? GROUP_SIZE : synth.song.barCount;
  synth.loopRepeatCount = range.mode === 'from-section' ? 0 : -1;
}
