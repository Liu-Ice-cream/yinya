// Original 音芽 interface and patterns. BeepBox audio code retains its MIT notice.
import { voiceInfo, melodyInstrument, chordVoiceInfo, chordInstrument } from './voices.js';
export const VERSION = 8;
export const CHORD_STYLES = Object.freeze([
  Object.freeze({ id: 'block', name: '齐奏', hint: '每拍三个音同时响。' }),
  Object.freeze({ id: 'arpeggio-v1', name: '分解', hint: '每拍按低 → 中 → 高 → 中，依次弹出四个短音。' }),
]);
export function chordStyleInfo(id) {
  const style = CHORD_STYLES.find(item => item.id === id);
  if (!style) throw new Error('无法识别这款和弦演奏方式，请使用支持该方式的音芽版本');
  return style;
}
export const MAX_BACKUP_BYTES = 64 * 1024;
export const LONG_NOTE_TRACKS = Object.freeze([0, 2]);
export const NOTE_LENGTHS = [1, 2, 4, 8];
export const BAR_COUNTS = [4, 8, 12, 16, 20, 24, 28, 32];
export const GROUP_SIZE = 4;
export const PITCHES = [0, 2, 4, 7, 9, 12, 14, 16];
export const CHORDS = [[36, 40, 43], [33, 36, 40], [31, 33, 38], [28, 31, 38]];
export const TRACKS = [
  { id: 'melody', name: '旋律', hint: '点亮格子，写一句自己的旋律。每列一个音，越往上音越高。', rows: ['高音 mi', '高音 re', '高音 do', 'la', 'sol', 'mi', 're', 'do'], wave: 'triangle' },
  { id: 'chords', name: '和弦', hint: '每拍选一组和声，为旋律铺一层底色。', rows: ['C · 明亮', 'Am · 柔和', 'Gsus2 · 开阔', 'Em7 · 轻盈'], wave: 'rounded' },
  { id: 'bass', name: '贝斯', hint: '用低音托住节奏。少放几个音，也会很好听。', rows: ['高音 mi', '高音 re', '高音 do', 'la', 'sol', 'mi', 're', 'do'], wave: 'square' },
  { id: 'drums', name: '鼓点', hint: '低鼓定节拍，小鼓加重音，沙帽填空隙。三行可以同时点亮。', rows: ['沙帽', '小鼓', '低鼓'] },
];
function section(id, name = '新段落') { return { id, name, enabled: [true, true, true, true] }; }
function emptyBar(id) { return Array(id === 'chords' ? 4 : 16).fill(id === 'drums' ? 0 : -1); }
export function blank(title = '我的第一段旋律', barCount = 4) {
  if (!BAR_COUNTS.includes(barCount)) throw new Error('请选择 4–32 小节，以四小节为一段');
  return { version: VERSION, barCount, title, tempo: 108, chordVoice: 'rounded', chordStyle: 'block', sections: Array.from({ length: barCount / GROUP_SIZE }, (_, i) => section(`s${i + 1}`, `第 ${i + 1} 段`)), tracks: TRACKS.map(t => ({ id: t.id, enabled: true, volume: t.id === 'melody' ? 80 : 60, bars: Array.from({ length: barCount }, () => emptyBar(t.id)), ...(['melody', 'bass'].includes(t.id) ? { durations: Array.from({ length: barCount }, () => Array(16).fill(1)) } : {}) })) };
}
export const PRESETS = [
  { id: 'journey', name: '林间来信', detail: '完整小曲 · 16 小节', arranged: true },
  { id: 'sprout', name: '晴日发芽', detail: '轻快 · 108 BPM', tempo: 108, melody: [0, -1, 2, -1, 3, -1, 4, -1, 5, -1, 4, -1, 3, -1, 2, -1], chords: [0, 0, 1, 2], wave: 'triangle' },
  { id: 'moon', name: '月下散步', detail: '舒缓 · 80 BPM', tempo: 80, melody: [5, -1, -1, -1, 4, -1, 3, -1, 2, -1, -1, -1, 0, -1, -1, -1], chords: [1, 3, 0, 2], wave: 'rounded' },
  { id: 'pixel', name: '像素出发', detail: '跳跃 · 132 BPM', tempo: 132, melody: [0, 2, -1, 3, 5, -1, 3, -1, 4, 5, -1, 7, 5, -1, 3, -1], chords: [0, 2, 1, 0], wave: 'square' },
];
export function preset(id) {
  if (id === 'journey') return arrangementPreset();
  const p = PRESETS.find(p => p.id === id) || PRESETS.find(p => p.id === 'sprout');
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
  if (!value || ![1, 2, 3, 4, 5, 6, 7, VERSION].includes(value.version) || typeof value.title !== 'string' || value.title.length > 60 || !Number.isInteger(value.tempo) || value.tempo < 60 || value.tempo > 180 || !Array.isArray(value.tracks) || value.tracks.length !== 4) throw new Error('不是有效的音芽作品');
  // v1 always had four bars. Reading old data migrates a copy, never the original.
  const barCount = value.version === 1 ? 4 : value.barCount;
  if (value.version < 8 && ![4, 8, 16].includes(barCount)) throw new Error('旧版作品的小节长度无效');
  const result = blank(value.title, barCount);
  if (value.version >= 8) {
    const ids = new Set();
    if (!Array.isArray(value.sections) || value.sections.length !== barCount / GROUP_SIZE) throw new Error('段落数据不完整');
    result.sections = value.sections.map(part => {
      if (!part || typeof part.id !== 'string' || !/^s[1-9][0-9]{0,5}$/.test(part.id) || ids.has(part.id) || typeof part.name !== 'string' || !part.name.trim() || part.name.length > 24 || !Array.isArray(part.enabled) || part.enabled.length !== 4 || part.enabled.some(n => typeof n !== 'boolean')) throw new Error('段落名称、标识或声部安排无效');
      ids.add(part.id); return { id: part.id, name: part.name, enabled: [...part.enabled] };
    });
  }
  result.tempo = value.tempo;
  result.voice = value.version < 4 ? (['triangle', 'rounded', 'square'].includes(value.voice) ? value.voice : 'triangle') : (value.voice ?? 'triangle');
  voiceInfo(result.voice);
  result.chordVoice = value.version < 5 ? 'rounded' : (value.chordVoice ?? 'rounded');
  chordVoiceInfo(result.chordVoice);
  result.chordStyle = value.version < 6 ? 'block' : (value.chordStyle ?? 'block');
  chordStyleInfo(result.chordStyle);
  result.tracks = value.tracks.map((t, index) => {
    if (!t || t.id !== TRACKS[index].id || typeof t.enabled !== 'boolean' || !Number.isInteger(t.volume) || t.volume < 0 || t.volume > 100 || !Array.isArray(t.bars) || t.bars.length !== barCount) throw new Error('音乐轨道数据不完整');
    const length = t.id === 'chords' ? 4 : 16;
    const min = t.id === 'drums' ? 0 : -1, max = t.id === 'chords' ? 3 : 7;
    const bars = t.bars.map(bar => {
      if (!Array.isArray(bar) || bar.length !== length || bar.some(n => !Number.isInteger(n) || n < min || n > max)) throw new Error('音符数据超出支持范围');
      return [...bar];
    });
    let durations;
    const trackName = TRACKS[index].name;
    if (LONG_NOTE_TRACKS.includes(index)) {
      if (value.version < (t.id === 'melody' ? 3 : 7)) durations = bars.map(() => Array(16).fill(1));
      else {
        if (!Array.isArray(t.durations) || t.durations.length !== barCount) throw new Error(`${trackName}时长数据不完整`);
        durations = t.durations.map((lengths, index) => {
          if (!Array.isArray(lengths) || lengths.length !== 16) throw new Error(`${trackName}时长数据不完整`);
          let end = 0;
          for (let step = 0; step < 16; step++) {
            const length = lengths[step];
            if (!Number.isInteger(length) || length < 1 || length > 8 || (bars[index][step] < 0 && length !== 1)) throw new Error(`${trackName}时长超出支持范围`);
            if (bars[index][step] >= 0) {
              if (step < end || step + length > 16) throw new Error(`${trackName}音符重叠或超出小节`);
              end = step + length;
            }
          }
          return [...lengths];
        });
      }
    }
    return { id: t.id, enabled: t.enabled, volume: t.volume, bars, ...(durations ? { durations } : {}) };
  });
  return result;
}
export function resize(value, barCount, fill = 'empty') {
  if (!BAR_COUNTS.includes(barCount) || !['empty', 'repeat'].includes(fill)) throw new Error('不支持的小节扩展方式');
  const result = validate(value), previousCount = result.barCount;
  for (const track of result.tracks) {
    const previous = track.bars;
    track.bars = Array.from({ length: barCount }, (_, i) => i < previousCount || fill === 'repeat' ? [...previous[i % previousCount]] : emptyBar(track.id));
    if (track.durations) {
      const lengths = track.durations;
      track.durations = Array.from({ length: barCount }, (_, i) => i < previousCount || fill === 'repeat' ? [...lengths[i % previousCount]] : Array(16).fill(1));
    }
  }
  const previous = result.sections;
  result.sections = previous.slice(0, barCount / GROUP_SIZE);
  while (result.sections.length < barCount / GROUP_SIZE) {
    const i = result.sections.length, part = section(`s${nextSectionNumber(result.sections)}`, `第 ${i + 1} 段`);
    if (fill === 'repeat') part.enabled = [...previous[i % previous.length].enabled];
    result.sections.push(part);
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
    if (track.durations) track.durations.splice(destination, GROUP_SIZE, ...track.durations.slice(source, source + GROUP_SIZE).map(bar => [...bar]));
  }
  state.sections[destination / GROUP_SIZE].enabled = [...state.sections[source / GROUP_SIZE].enabled];
  return state;
}
// The grid contains note starts; held cells resolve to their owning note.
export function pitchedNoteAt(value, trackIndex, barIndex, step) {
  if (!LONG_NOTE_TRACKS.includes(trackIndex)) throw new Error('该声部不支持长音编辑');
  const track = value.tracks[trackIndex];
  if (!Number.isInteger(barIndex) || barIndex < 0 || barIndex >= value.barCount || !Number.isInteger(step) || step < 0 || step >= 16) throw new Error('音符位置无效');
  const bar = track.bars[barIndex], lengths = track.durations[barIndex];
  for (let start = step; start >= 0; start--) if (bar[start] >= 0) return start + lengths[start] > step ? { start, pitch: bar[start], duration: lengths[start] } : null;
  return null;
}
export function setPitchedNote(value, trackIndex, barIndex, step, pitch, duration) {
  if (!Number.isInteger(pitch) || pitch < 0 || pitch > 7 || !NOTE_LENGTHS.includes(duration)) throw new Error('音高或时长无效');
  const state = validate(value), previous = pitchedNoteAt(state, trackIndex, barIndex, step);
  const track = state.tracks[trackIndex], bar = track.bars[barIndex], lengths = track.durations[barIndex];
  if (previous && previous.start < step) lengths[previous.start] = step - previous.start;
  const next = bar.findIndex((n, i) => i > step && n >= 0);
  const actual = Math.min(duration, (next < 0 ? 16 : next) - step);
  bar[step] = pitch; lengths[step] = actual;
  return { state, start: step, duration: actual, limited: actual !== duration };
}
export function removePitchedNote(value, trackIndex, barIndex, step) {
  const state = validate(value), note = pitchedNoteAt(state, trackIndex, barIndex, step);
  if (note) { state.tracks[trackIndex].bars[barIndex][note.start] = -1; state.tracks[trackIndex].durations[barIndex][note.start] = 1; }
  return state;
}
// Keep the melody API for callers that only edit the lead voice.
export function melodyAt(value, barIndex, step) { return pitchedNoteAt(value, 0, barIndex, step); }
export function setMelodyNote(value, barIndex, step, pitch, duration) { return setPitchedNote(value, 0, barIndex, step, pitch, duration); }
export function removeMelodyNote(value, barIndex, step) { return removePitchedNote(value, 0, barIndex, step); }
export function copyBar(value, trackIndex, source, destination) {
  const state = validate(value);
  if (!Number.isInteger(trackIndex) || trackIndex < 0 || trackIndex > 3 || ![source, destination].every(i => Number.isInteger(i) && i >= 0 && i < state.barCount)) throw new Error('复制小节位置无效');
  const track = state.tracks[trackIndex]; track.bars[destination] = [...track.bars[source]];
  if (track.durations) track.durations[destination] = [...track.durations[source]];
  return state;
}
export function parseBackup(text) {
  if (typeof text !== 'string' || new TextEncoder().encode(text).byteLength > MAX_BACKUP_BYTES) throw new Error('备份文件超过 64 KB');
  return validate(JSON.parse(text));
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
// The grid stores one chord per beat; performance expands only at synthesis time.
// Fixed revision IDs keep the saved rhythm stable across future additions.
export function chordNotes(row, beat, voiceId, styleId = 'block') {
  chordStyleInfo(styleId);
  const voice = chordVoiceInfo(voiceId), pitches = CHORDS[row], start = beat * 4;
  const notes = styleId === 'block' ? [note(pitches, start, start + 4, 65)] :
    [0, 1, 2, 1].map((index, step) => note([pitches[index]], start + step, start + step + 1, 65));
  if (!voice.legacy) notes.forEach(n => n.points.forEach(point => { point.volume = voice.noteVolume; }));
  return notes;
}
export function songJSON(value) {
  const s = validate(value);
  return { format: 'BeepBox', version: 9, scale: 'easy :)', key: 'C', introBars: 0, loopBars: s.barCount, beatsPerBar: 4, ticksPerBeat: 4, beatsPerMinute: s.tempo, channels: s.tracks.map((t, index) => ({
    type: t.id === 'drums' ? 'drum' : 'pitch',
    instruments: [index === 0 ? melodyInstrument(s.voice, t.volume) : index === 1 ? chordInstrument(s.chordVoice, t.volume) : { type: t.id === 'drums' ? 'drumset' : 'chip', wave: TRACKS[index].wave, volume: t.volume, effects: ['transition type', 'chord type'], transition: 'normal', chord: 'simultaneous', fadeInSeconds: 0, fadeOutTicks: -1,
      ...(t.id === 'drums' ? { drums: Array.from({ length: 12 }, (_, drum) => ({ filterEnvelope: drum >= 8 ? 'twang 1' : 'twang 2', spectrum: Array.from({ length: 30 }, (_, band) => drum === 0 ? Math.max(0, 100 - band * 17) : drum === 4 ? (band > 3 && band < 17 ? 75 : 15) : drum === 8 ? (band > 17 ? 80 : 0) : 0) })) } : {}) }],
    patterns: t.bars.map((bar, barIndex) => ({ notes: bar.flatMap((n, step) => {
      if (!s.sections[Math.floor(barIndex / GROUP_SIZE)].enabled[index] || n < 0 || (t.id === 'drums' && n === 0)) return [];
      if (t.id === 'drums') return [note([0, 4, 8].filter((_, bit) => n & (1 << bit)), step, step + 1, 70)];
      if (t.id === 'chords') return chordNotes(n, step, s.chordVoice, s.chordStyle);
      const result = note([PITCHES[n] + (t.id === 'bass' ? 24 : 48)], step, step + t.durations[barIndex][step]);
      if (t.id === 'melody' && !voiceInfo(s.voice).legacy) result.points.forEach(point => { point.volume = voiceInfo(s.voice).noteVolume ?? 90; });
      return [result];
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

// Section operations move actual notes and lengths, never shared pattern references.
function nextSectionNumber(sections) { let number = 1; while (sections.some(part => part.id === `s${number}`)) number++; return number; }
function checkSection(state, index) { if (!Number.isInteger(index) || index < 0 || index >= state.sections.length) throw new Error('段落位置无效'); }
export function renameSection(value, index, name) {
  const state = validate(value); checkSection(state, index); state.sections[index].name = name; return validate(state);
}
export function setSectionTrack(value, index, track, enabled) {
  const state = validate(value); checkSection(state, index);
  if (!Number.isInteger(track) || track < 0 || track > 3 || typeof enabled !== 'boolean') throw new Error('段落声部设置无效');
  state.sections[index].enabled[track] = enabled; return state;
}
export function insertSection(value, after, duplicate = false) {
  const state = validate(value); checkSection(state, after);
  if (state.barCount === 32) throw new Error('最多支持 32 小节');
  const at = (after + 1) * GROUP_SIZE;
  const source = state.sections[after], part = section(`s${nextSectionNumber(state.sections)}`);
  if (duplicate) { part.name = `${source.name.slice(0, 20)} 副本`; part.enabled = [...source.enabled]; }
  state.sections.splice(after + 1, 0, part);
  state.tracks.forEach(track => {
    const bars = duplicate ? track.bars.slice(after * GROUP_SIZE, at).map(bar => [...bar]) : Array.from({ length: GROUP_SIZE }, () => emptyBar(track.id));
    if (track.durations) track.durations.splice(at, 0, ...(duplicate ? track.durations.slice(after * GROUP_SIZE, at).map(bar => [...bar]) : Array.from({ length: GROUP_SIZE }, () => Array(16).fill(1))));
    track.bars.splice(at, 0, ...bars);
  });
  state.barCount += GROUP_SIZE; return state;
}
export function moveSection(value, index, destination) {
  const state = validate(value); checkSection(state, index); checkSection(state, destination);
  const move = (array, start, length, target) => { const moved = array.splice(start, length); array.splice(target, 0, ...moved); };
  move(state.sections, index, 1, destination);
  state.tracks.forEach(track => { move(track.bars, index * GROUP_SIZE, GROUP_SIZE, destination * GROUP_SIZE); if (track.durations) move(track.durations, index * GROUP_SIZE, GROUP_SIZE, destination * GROUP_SIZE); });
  return state;
}
export function deleteSection(value, index) {
  const state = validate(value); checkSection(state, index); if (state.sections.length === 1) throw new Error('至少保留一个段落');
  state.sections.splice(index, 1); state.tracks.forEach(track => { track.bars.splice(index * GROUP_SIZE, GROUP_SIZE); track.durations?.splice(index * GROUP_SIZE, GROUP_SIZE); });
  state.barCount -= GROUP_SIZE; return state;
}
export function trackAudibleAt(state, track, bar) { return state.tracks[track].enabled && state.tracks[track].volume > 0 && state.sections[Math.floor(bar / GROUP_SIZE)].enabled[track]; }
export function hasAudibleNotes(state, start = 0, end = state.barCount, indices = [0, 1, 2, 3]) {
  return indices.some(index => state.tracks[index].bars.slice(start, end).some((bar, offset) => trackAudibleAt(state, index, start + offset) && bar.some(n => index === 3 ? n !== 0 : n >= 0)));
}
export function arrangementPreset() {
  let state = blank('林间来信', 16); state.tempo = 96; state.voice = 'piano-v1'; state.chordVoice = 'chord-acoustic-guitar-v1'; state.chordStyle = 'arpeggio-v1';
  const masks = [[true, false, false, false], [true, true, true, false], [true, true, true, true], [true, false, false, false]];
  state.sections.forEach((part, i) => { part.name = ['前奏', '主题', '变化', '结尾'][i]; part.enabled = masks[i]; });
  const motifs = [[[0,2,4],[4,3,4],[8,5,8]], [[0,5,4],[4,4,2],[8,2,4],[12,0,4]], [[0,3,2],[2,4,2],[4,5,4],[8,7,4],[12,5,4]], [[0,4,4],[4,2,4],[8,0,8]]];
  for (let bar = 0; bar < 16; bar++) {
    const group = Math.floor(bar / GROUP_SIZE), motif = group === 0 ? [[0, 2 + bar % 2, 8], [10, bar % 2 ? 0 : 4, 4]] : motifs[bar % 4];
    for (const [step, pitch, length] of motif) state = setPitchedNote(state, 0, bar, step, pitch, length).state;
    if (group === 3) { state.tracks[0].bars[bar].fill(-1); state.tracks[0].durations[bar].fill(1); state = setPitchedNote(state, 0, bar, 0, [4, 3, 2, 0][bar % 4], bar === 15 ? 8 : 4).state; }
    const chord = [0, 1, 2, 0][bar % 4]; state.tracks[1].bars[bar] = [chord, -1, chord, -1];
    for (const step of [0, 8]) state = setPitchedNote(state, 2, bar, step, [0, 4, 3, 0][bar % 4], 8).state;
    state.tracks[3].bars[bar] = Array.from({ length: 16 }, (_, step) => (step % 8 === 0 ? 1 : 0) | (step % 8 === 4 ? 2 : 0) | (step % 2 === 0 ? 4 : 0));
  }
  return state;
}
