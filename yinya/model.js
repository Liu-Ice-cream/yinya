// Original 音芽 interface and patterns. BeepBox audio code retains its MIT notice.
export const VERSION = 2;
export const BAR_COUNTS = [4, 8, 16];
export const GROUP_SIZE = 4;
export const PITCHES = [0, 2, 4, 7, 9, 12, 14, 16];
export const CHORDS = [[36, 40, 43], [33, 36, 40], [31, 33, 38], [28, 31, 38]];
export const TRACKS = [
  { id: 'melody', name: '旋律', hint: '点亮格子，写一句自己的旋律。每列一个音，越往上音越高。', rows: ['高音 mi', '高音 re', '高音 do', 'la', 'sol', 'mi', 're', 'do'], wave: 'triangle' },
  { id: 'chords', name: '和弦', hint: '每拍选一组和声，为旋律铺一层底色。', rows: ['C · 明亮', 'Am · 柔和', 'Gsus2 · 开阔', 'Em7 · 轻盈'], wave: 'rounded' },
  { id: 'bass', name: '贝斯', hint: '用低音托住节奏。少放几个音，也会很好听。', rows: ['高音 mi', '高音 re', '高音 do', 'la', 'sol', 'mi', 're', 'do'], wave: 'square' },
  { id: 'drums', name: '鼓点', hint: '低鼓定节拍，小鼓加重音，沙帽填空隙。三行可以同时点亮。', rows: ['沙帽', '小鼓', '低鼓'] },
];
function emptyBar(id) { return Array(id === 'chords' ? 4 : 16).fill(id === 'drums' ? 0 : -1); }
export function blank(title = '我的第一段旋律', barCount = 4) {
  if (!BAR_COUNTS.includes(barCount)) throw new Error('请选择 4、8 或 16 小节');
  return { version: VERSION, barCount, title, tempo: 108, tracks: TRACKS.map(t => ({ id: t.id, enabled: true, volume: t.id === 'melody' ? 80 : 60, bars: Array.from({ length: barCount }, () => emptyBar(t.id)) })) };
}
export const PRESETS = [
  { id: 'sprout', name: '晴日发芽', detail: '轻快 · 108 BPM', tempo: 108, melody: [0, -1, 2, -1, 3, -1, 4, -1, 5, -1, 4, -1, 3, -1, 2, -1], chords: [0, 0, 1, 2], wave: 'triangle' },
  { id: 'moon', name: '月下散步', detail: '舒缓 · 80 BPM', tempo: 80, melody: [5, -1, -1, -1, 4, -1, 3, -1, 2, -1, -1, -1, 0, -1, -1, -1], chords: [1, 3, 0, 2], wave: 'rounded' },
  { id: 'pixel', name: '像素出发', detail: '跳跃 · 132 BPM', tempo: 132, melody: [0, 2, -1, 3, 5, -1, 3, -1, 4, 5, -1, 7, 5, -1, 3, -1], chords: [0, 2, 1, 0], wave: 'square' },
];
export function preset(id) {
  const p = PRESETS.find(p => p.id === id) || PRESETS[0];
  const s = blank(p.name); s.tempo = p.tempo; s.voice = p.wave;
  for (let bar = 0; bar < 4; bar++) {
    s.tracks[0].bars[bar] = p.melody.map((n, step) => n < 0 ? -1 : Math.min(7, Math.max(0, n + (bar === 2 && step < 8 ? 1 : 0))));
    if (bar === 3) { s.tracks[0].bars[bar][12] = 0; s.tracks[0].bars[bar][14] = -1; }
    s.tracks[1].bars[bar] = [p.chords[bar], -1, p.chords[bar], -1];
    const root = [0, 4, 3, 2][p.chords[bar]];
    s.tracks[2].bars[bar] = Array.from({ length: 16 }, (_, i) => i % 4 === 0 ? root : -1);
    s.tracks[3].bars[bar] = Array.from({ length: 16 }, (_, i) => (i % 8 === 0 ? 1 : 0) | (i % 8 === 4 ? 2 : 0) | (i % (id === 'moon' ? 4 : 2) === 0 ? 4 : 0));
  }
  return s;
}
export function validate(value) {
  if (!value || ![1, VERSION].includes(value.version) || typeof value.title !== 'string' || value.title.length > 60 || !Number.isInteger(value.tempo) || value.tempo < 60 || value.tempo > 180 || !Array.isArray(value.tracks) || value.tracks.length !== 4) throw new Error('不是有效的音芽作品');
  // v1 always had four bars. Reading old data migrates a copy, never the original.
  const barCount = value.version === 1 ? 4 : value.barCount;
  const result = blank(value.title, barCount);
  result.tempo = value.tempo;
  result.voice = ['triangle', 'rounded', 'square'].includes(value.voice) ? value.voice : 'triangle';
  result.tracks = value.tracks.map((t, index) => {
    if (!t || t.id !== TRACKS[index].id || typeof t.enabled !== 'boolean' || !Number.isInteger(t.volume) || t.volume < 0 || t.volume > 100 || !Array.isArray(t.bars) || t.bars.length !== barCount) throw new Error('音乐轨道数据不完整');
    const length = t.id === 'chords' ? 4 : 16;
    const min = t.id === 'drums' ? 0 : -1, max = t.id === 'chords' ? 3 : 7;
    const bars = t.bars.map(bar => {
      if (!Array.isArray(bar) || bar.length !== length || bar.some(n => !Number.isInteger(n) || n < min || n > max)) throw new Error('音符数据超出支持范围');
      return [...bar];
    });
    return { id: t.id, enabled: t.enabled, volume: t.volume, bars };
  });
  return result;
}
export function resize(value, barCount, fill = 'empty') {
  if (!BAR_COUNTS.includes(barCount) || !['empty', 'repeat'].includes(fill)) throw new Error('不支持的小节扩展方式');
  const result = validate(value), previousCount = result.barCount;
  for (const track of result.tracks) {
    const previous = track.bars;
    track.bars = Array.from({ length: barCount }, (_, i) => i < previousCount || fill === 'repeat' ? [...previous[i % previousCount]] : emptyBar(track.id));
  }
  result.barCount = barCount;
  return result;
}
export function rangeHasNotes(value, start, end) {
  const state = validate(value);
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end > state.barCount || start >= end) throw new Error('小节范围无效');
  return state.tracks.some(track => track.bars.slice(start, end).some(bar => bar.some(n => track.id === 'drums' ? n !== 0 : n !== -1)));
}
export function copyGroup(value, source, destination) {
  const state = validate(value);
  for (const start of [source, destination]) if (!Number.isInteger(start) || start < 0 || start % GROUP_SIZE !== 0 || start + GROUP_SIZE > state.barCount) throw new Error('段落范围无效');
  if (source === destination) throw new Error('请选择另一段作为复制目标');
  for (const track of state.tracks) {
    const bars = track.bars.slice(source, source + GROUP_SIZE).map(bar => [...bar]);
    track.bars.splice(destination, GROUP_SIZE, ...bars);
  }
  return state;
}
export function encode(state) {
  const bytes = new TextEncoder().encode(JSON.stringify(validate(state)));
  return 'yinya=' + btoa(Array.from(bytes, n => String.fromCharCode(n)).join('')).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}
export function decode(hash) {
  const raw = hash.replace(/^#/, '');
  if (!raw.startsWith('yinya=') || raw.length > 20000) throw new Error('作品链接无法识别或过长');
  const str = raw.slice(6).replaceAll('-', '+').replaceAll('_', '/');
  const bytes = Uint8Array.from(atob(str), c => c.charCodeAt(0));
  return validate(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
}
function note(pitches, start, end, volume = 90) { return { pitches, points: [{ tick: start, pitchBend: 0, volume }, { tick: end, pitchBend: 0, volume: 0 }] }; }
export function songJSON(value) {
  const s = validate(value);
  return { format: 'BeepBox', version: 9, scale: 'easy :)', key: 'C', introBars: 0, loopBars: s.barCount, beatsPerBar: 4, ticksPerBeat: 4, beatsPerMinute: s.tempo, channels: s.tracks.map((t, index) => ({
    type: t.id === 'drums' ? 'drum' : 'pitch',
    instruments: [{ type: t.id === 'drums' ? 'drumset' : 'chip', wave: index === 0 ? s.voice : TRACKS[index].wave, volume: t.volume, effects: ['transition type', 'chord type'], transition: 'normal', chord: 'simultaneous', fadeInSeconds: 0, fadeOutTicks: -1,
      ...(t.id === 'drums' ? { drums: Array.from({ length: 12 }, (_, drum) => ({ filterEnvelope: drum >= 8 ? 'twang 1' : 'twang 2', spectrum: Array.from({ length: 30 }, (_, band) => drum === 0 ? Math.max(0, 100 - band * 17) : drum === 4 ? (band > 3 && band < 17 ? 75 : 15) : drum === 8 ? (band > 17 ? 80 : 0) : 0) })) } : {}) }],
    patterns: t.bars.map(bar => ({ notes: bar.flatMap((n, step) => {
      if (n < 0 || (t.id === 'drums' && n === 0)) return [];
      if (t.id === 'drums') return [note([0, 4, 8].filter((_, bit) => n & (1 << bit)), step, step + 1, 70)];
      if (t.id === 'chords') return [note(CHORDS[n], step * 4, step * 4 + 4, 65)];
      return [note([PITCHES[n] + (t.id === 'bass' ? 24 : 48)], step, step + 1)];
    }) })),
    sequence: Array.from({ length: s.barCount }, (_, i) => i + 1),
  })) };
}
export function wavBuffer(left, right, sampleRate) {
  if (left.length !== right.length) throw new Error('音频声道长度不同');
  const buffer = new ArrayBuffer(44 + left.length * 4), view = new DataView(buffer);
  const tag = (offset, text) => [...text].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  tag(0, 'RIFF'); view.setUint32(4, buffer.byteLength - 8, true); tag(8, 'WAVE'); tag(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 2, true); view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 4, true); view.setUint16(32, 4, true); view.setUint16(34, 16, true); tag(36, 'data'); view.setUint32(40, left.length * 4, true);
  for (let i = 0; i < left.length; i++) for (let c = 0; c < 2; c++) view.setInt16(44 + i * 4 + c * 2, Math.round(Math.max(-1, Math.min(1, c ? right[i] : left[i])) * 32767), true);
  return buffer;
}
