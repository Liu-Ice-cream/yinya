// View state only: following never seeks or changes the song.
export function playbackPosition(playhead) {
  const head = Number.isFinite(playhead) ? Math.max(0, playhead) : 0;
  const absolute = Math.floor(head * 16);
  const bar = Math.floor(absolute / 16) % 4, step = absolute % 16;
  return { absolute, bar, step, beat: Math.floor(step / 4) };
}

export class PlaybackFollower {
  constructor(enabled = true) {
    this.enabled = enabled; this.suspended = false; this.selectedBar = 0;
  }
  get following() { return this.enabled && !this.suspended; }
  select(bar, playing = false) {
    if (!Number.isInteger(bar) || bar < 0 || bar > 3) throw new Error('小节超出范围');
    this.selectedBar = bar;
    if (playing && this.enabled) this.suspended = true;
  }
  setEnabled(enabled) { this.enabled = enabled; this.suspended = false; }
  start() { this.suspended = false; }
  stop() { this.suspended = false; }
  update(playhead, playing) {
    const position = playbackPosition(playhead);
    if (playing && this.following) this.selectedBar = position.bar;
    return { ...position, selectedBar: this.selectedBar, following: this.following, playing };
  }
}
