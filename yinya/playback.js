import { BAR_COUNTS } from './model.js';

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
