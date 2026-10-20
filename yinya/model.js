// Original 音芽 interface and patterns. BeepBox audio code retains its MIT notice.
import { voiceInfo, melodyInstrument, chordVoiceInfo, chordInstrument, bassVoiceInfo, bassInstrument } from './voices.js';
import { drumPattern } from './grooves.js';
import { PITCH_VALUES, CHORD_PITCHES, PROGRESSIONS, scaleInfo, pitchId } from './theory.js';
export const VERSION = 11;
export const VELOCITIES = Object.freeze([{id:0,name:'轻'},{id:1,name:'标准'},{id:2,name:'重'}].map(Object.freeze));
export const CHORD_STYLES = Object.freeze([
  Object.freeze({ id: 'block', name: '齐奏', hint: '每拍同时弹出这组和弦的全部音。' }),
  Object.freeze({ id: 'arpeggio-v1', name: '分解', hint: '三音和弦按低 → 中 → 高 → 中；四音和弦从低到高弹出全部四音。' }),
  Object.freeze({ id: 'strum-v1', name: '轻扫弦', hint: '每拍从低到高错开起音，保留和声余韵。' }),
  Object.freeze({ id: 'staccato-v1', name: '跳跃短奏', hint: '每拍两次短奏，中间留出空隙。' }),
  Object.freeze({ id: 'arpeggio-rise-v1', name: '舒展分解', hint: '三音和弦先弹较长低音，再弹中、高音；四音和弦均分一拍，从低到高弹出。' }),
]);
export function chordStyleInfo(id) {
  const style = CHORD_STYLES.find(item => item.id === id);
  if (!style) throw new Error('无法识别这款和弦演奏方式，请使用支持该方式的音芽版本');
  return style;
}
export function sectionChordStyle(state, bar) { return state.sections[Math.floor(bar / GROUP_SIZE)].chordStyle === 'inherit' ? state.chordStyle : state.sections[Math.floor(bar / GROUP_SIZE)].chordStyle; }
export const MAX_BACKUP_BYTES = 64 * 1024;
export const LONG_NOTE_TRACKS = Object.freeze([0, 2]);
export const NOTE_LENGTHS = [1, 2, 4, 8];
export const BAR_COUNTS = [4, 8, 12, 16, 20, 24, 28, 32];
export const GROUP_SIZE = 4;
export const PITCHES = [0, 2, 4, 7, 9, 12, 14, 16];
export const CHORDS = CHORD_PITCHES;
export const TRACKS = [
  { id: 'melody', name: '旋律', hint: '点亮格子，写一句自己的旋律。每列一个音，越往上音越高。', rows: ['高音 mi', '高音 re', '高音 do', 'la', 'sol', 'mi', 're', 'do'], wave: 'triangle' },
  { id: 'chords', name: '和弦', hint: '每拍选一组和声，为旋律铺一层底色。', rows: ['C · 明亮', 'Am · 柔和', 'Gsus2 · 开阔', 'Em7 · 轻盈'], wave: 'rounded' },
  { id: 'bass', name: '贝斯', hint: '用低音托住节奏。少放几个音，也会很好听。', rows: ['高音 mi', '高音 re', '高音 do', 'la', 'sol', 'mi', 're', 'do'], wave: 'square' },
  { id: 'drums', name: '鼓点', hint: '低鼓定节拍，小鼓加重音，沙帽填空隙。三行可以同时点亮。', rows: ['沙帽', '小鼓', '低鼓'] },
];
function section(id, name = '新段落') { return { id, name, enabled: [true, true, true, true], chordStyle: 'inherit', voices: ['inherit','inherit','inherit'], volumes: [100,100,100,100] }; }
export function sectionVoice(state, track, bar) {
  const id = state.sections[Math.floor(bar / GROUP_SIZE)].voices[track];
  return id === 'inherit' ? [state.voice ?? 'triangle',state.chordVoice,state.bassVoice][track] : id;
}
export function sectionGain(state, track, bar) { return state.sections[Math.floor(bar / GROUP_SIZE)].volumes[track] / 100; }
function copyOrchestration(target, source) { target.voices = [...source.voices]; target.volumes = [...source.volumes]; }
function emptyBar(id) { return Array(id === 'chords' ? 4 : 16).fill(id === 'drums' ? 0 : -1); }
export function blank(title = '我的第一段旋律', barCount = 4) {
  if (!BAR_COUNTS.includes(barCount)) throw new Error('请选择 4–32 小节，以四小节为一段');
  return { version: VERSION, barCount, title, scale: 'pentatonic', transpose: 0, tempo: 108, bassVoice: 'square', chordVoice: 'rounded', chordStyle: 'block', sections: Array.from({ length: barCount / GROUP_SIZE }, (_, i) => section(`s${i + 1}`, `第 ${i + 1} 段`)), tracks: TRACKS.map(t => ({ id: t.id, enabled: true, volume: t.id === 'melody' ? 80 : 60, bars: Array.from({ length: barCount }, () => emptyBar(t.id)), ...(['melody', 'bass'].includes(t.id) ? { durations: Array.from({ length: barCount }, () => Array(16).fill(1)), velocities: Array.from({ length: barCount }, () => Array(16).fill(1)) } : {}) })) };
}
export const PRESETS = [
  {id:'orchestra-day',name:'晨光接力',detail:'分段配器 · 16 小节'},
  {id:'orchestra-night',name:'星灯渐远',detail:'分段配器 · 16 小节'},
  {id:'tone-day',name:'风中明信片',detail:'完整大调 · 16 小节'},
  {id:'tone-dusk',name:'暮色小径',detail:'自然小调 · 16 小节'},
  { id:'groove-pop', name:'晴窗律动', detail:'流行 · 16 小节' },
  { id:'groove-night', name:'夜航微光', detail:'舒缓 · 16 小节' },
  { id:'groove-pixel', name:'像素漫游', detail:'电子 · 16 小节' },
  { id: 'journey', name: '林间来信', detail: '完整小曲 · 16 小节', arranged: true },
  { id: 'sprout', name: '晴日发芽', detail: '轻快 · 108 BPM', tempo: 108, melody: [0, -1, 2, -1, 3, -1, 4, -1, 5, -1, 4, -1, 3, -1, 2, -1], chords: [0, 0, 1, 2], wave: 'triangle' },
  { id: 'moon', name: '月下散步', detail: '舒缓 · 80 BPM', tempo: 80, melody: [5, -1, -1, -1, 4, -1, 3, -1, 2, -1, -1, -1, 0, -1, -1, -1], chords: [1, 3, 0, 2], wave: 'rounded' },
  { id: 'pixel', name: '像素出发', detail: '跳跃 · 132 BPM', tempo: 132, melody: [0, 2, -1, 3, 5, -1, 3, -1, 4, 5, -1, 7, 5, -1, 3, -1], chords: [0, 2, 1, 0], wave: 'square' },
];
export function preset(id) {
  if (['orchestra-day','orchestra-night'].includes(id)) return orchestrationPreset(id);
  if (['tone-day','tone-dusk'].includes(id)) return tonalPreset(id==='tone-dusk'?'minor':'major');
  if (['groove-pop','groove-night','groove-pixel'].includes(id)) return performancePreset(id);
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
  if (!value || ![1, 2, 3, 4, 5, 6, 7, 8, 9, 10, VERSION].includes(value.version) || typeof value.title !== 'string' || value.title.length > 60 || !Number.isInteger(value.tempo) || value.tempo < 60 || value.tempo > 180 || !Array.isArray(value.tracks) || value.tracks.length !== 4) throw new Error('不是有效的音芽作品');
  // v1 always had four bars. Reading old data migrates a copy, never the original.
  const barCount = value.version === 1 ? 4 : value.barCount;
  if (value.version < 8 && ![4, 8, 16].includes(barCount)) throw new Error('旧版作品的小节长度无效');
  const result = blank(value.title, barCount);
  if (value.version >= 8) {
    const ids = new Set();
    if (!Array.isArray(value.sections) || value.sections.length !== barCount / GROUP_SIZE) throw new Error('段落数据不完整');
    result.sections = value.sections.map(part => {
      if (!part || typeof part.id !== 'string' || !/^s[1-9][0-9]{0,5}$/.test(part.id) || ids.has(part.id) || typeof part.name !== 'string' || !part.name.trim() || part.name.length > 24 || !Array.isArray(part.enabled) || part.enabled.length !== 4 || part.enabled.some(n => typeof n !== 'boolean')) throw new Error('段落名称、标识或声部安排无效');
      const style = value.version < 9 ? 'inherit' : part.chordStyle;
      if (style !== 'inherit') chordStyleInfo(style);
      const voices = value.version < 11 ? ['inherit','inherit','inherit'] : part.voices;
      const volumes = value.version < 11 ? [100,100,100,100] : part.volumes;
      if (!Array.isArray(voices) || voices.length !== 3 || !Array.isArray(volumes) || volumes.length !== 4 || Array.from(volumes).some(n=>!Number.isInteger(n)||n<0||n>100)) throw new Error('段落配器或音量数据无效');
      Array.from(voices).forEach((id,i)=>{if(id!=='inherit')[voiceInfo,chordVoiceInfo,bassVoiceInfo][i](id);});
      ids.add(part.id); return { id: part.id, name: part.name, enabled: [...part.enabled], chordStyle: style, voices: [...voices], volumes: [...volumes] };
    });
  }
  result.scale = value.version < 10 ? 'pentatonic' : value.scale; scaleInfo(result.scale);
  result.transpose = value.version < 10 ? 0 : value.transpose;
  if (!Number.isInteger(result.transpose) || result.transpose < -12 || result.transpose > 12) throw new Error('整曲移调超出一个八度');
  result.tempo = value.tempo;
  result.bassVoice = value.version < 9 ? 'square' : (value.bassVoice ?? 'square'); bassVoiceInfo(result.bassVoice);
  result.voice = value.version < 4 ? (['triangle', 'rounded', 'square'].includes(value.voice) ? value.voice : 'triangle') : (value.voice ?? 'triangle');
  voiceInfo(result.voice);
  result.chordVoice = value.version < 5 ? 'rounded' : (value.chordVoice ?? 'rounded');
  chordVoiceInfo(result.chordVoice);
  result.chordStyle = value.version < 6 ? 'block' : (value.chordStyle ?? 'block');
  chordStyleInfo(result.chordStyle);
  result.tracks = value.tracks.map((t, index) => {
    if (!t || t.id !== TRACKS[index].id || typeof t.enabled !== 'boolean' || !Number.isInteger(t.volume) || t.volume < 0 || t.volume > 100 || !Array.isArray(t.bars) || t.bars.length !== barCount) throw new Error('音乐轨道数据不完整');
    const length = t.id === 'chords' ? 4 : 16;
    const min = t.id === 'drums' ? 0 : -1, max = t.id === 'drums' ? 7 : t.id === 'chords' ? (value.version < 10 ? 3 : CHORDS.length-1) : (value.version < 10 ? 7 : PITCH_VALUES.length-1);
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
    let velocities;
    if (durations) {
      if (value.version < 9) velocities = bars.map(() => Array(16).fill(1));
      else {
        if (!Array.isArray(t.velocities) || t.velocities.length !== barCount) throw new Error('音符力度数据不完整');
        velocities = t.velocities.map((levels, bar) => {
          if (!Array.isArray(levels) || levels.length !== 16 || levels.some((n, step) => ![0,1,2].includes(n) || (bars[bar][step] < 0 && n !== 1))) throw new Error('音符力度无效');
          return [...levels];
        });
      }
    }
    return { id: t.id, enabled: t.enabled, volume: t.volume, bars, ...(durations ? { durations, velocities } : {}) };
  });
  return result;
}
export function resize(value, barCount, fill = 'empty') {
  if (!BAR_COUNTS.includes(barCount) || !['empty', 'repeat'].includes(fill)) throw new Error('不支持的小节扩展方式');
  const result = validate(value), previousCount = result.barCount;
  for (const track of result.tracks) {
    const previous = track.bars;
    track.bars = Array.from({ length: barCount }, (_, i) => i < previousCount || fill === 'repeat' ? [...previous[i % previousCount]] : emptyBar(track.id));
    if (track.velocities) { const levels = track.velocities; track.velocities = Array.from({ length: barCount }, (_, i) => i < previousCount || fill === 'repeat' ? [...levels[i % previousCount]] : Array(16).fill(1)); }
    if (track.durations) {
      const lengths = track.durations;
      track.durations = Array.from({ length: barCount }, (_, i) => i < previousCount || fill === 'repeat' ? [...lengths[i % previousCount]] : Array(16).fill(1));
    }
  }
  const previous = result.sections;
  result.sections = previous.slice(0, barCount / GROUP_SIZE);
  while (result.sections.length < barCount / GROUP_SIZE) {
    const i = result.sections.length, part = section(`s${nextSectionNumber(result.sections)}`, `第 ${i + 1} 段`);
    if (fill === 'repeat') { part.enabled = [...previous[i % previous.length].enabled]; part.chordStyle = previous[i % previous.length].chordStyle; copyOrchestration(part,previous[i % previous.length]); }
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
    if (track.velocities) track.velocities.splice(destination, GROUP_SIZE, ...track.velocities.slice(source, source + GROUP_SIZE).map(bar => [...bar]));
    if (track.durations) track.durations.splice(destination, GROUP_SIZE, ...track.durations.slice(source, source + GROUP_SIZE).map(bar => [...bar]));
  }
  state.sections[destination / GROUP_SIZE].enabled = [...state.sections[source / GROUP_SIZE].enabled];
  state.sections[destination / GROUP_SIZE].chordStyle = state.sections[source / GROUP_SIZE].chordStyle;
  copyOrchestration(state.sections[destination / GROUP_SIZE],state.sections[source / GROUP_SIZE]);
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
export function setPitchedNote(value, trackIndex, barIndex, step, pitch, duration, velocity = null) {
  if (!Number.isInteger(pitch) || pitch < 0 || pitch >= PITCH_VALUES.length || !NOTE_LENGTHS.includes(duration)) throw new Error('音高或时长无效');
  const state = validate(value), previous = pitchedNoteAt(state, trackIndex, barIndex, step);
  const track = state.tracks[trackIndex], bar = track.bars[barIndex], lengths = track.durations[barIndex];
  if (previous && previous.start < step) lengths[previous.start] = step - previous.start;
  const next = bar.findIndex((n, i) => i > step && n >= 0);
  if (velocity !== null && ![0,1,2].includes(velocity)) throw new Error('音符力度无效');
  track.velocities[barIndex][step] = velocity ?? (bar[step] >= 0 ? track.velocities[barIndex][step] : 1);
  const actual = Math.min(duration, (next < 0 ? 16 : next) - step);
  bar[step] = pitch; lengths[step] = actual;
  return { state, start: step, duration: actual, limited: actual !== duration };
}
export function removePitchedNote(value, trackIndex, barIndex, step) {
  const state = validate(value), note = pitchedNoteAt(state, trackIndex, barIndex, step);
  if (note) { state.tracks[trackIndex].bars[barIndex][note.start] = -1; state.tracks[trackIndex].durations[barIndex][note.start] = 1; state.tracks[trackIndex].velocities[barIndex][note.start] = 1; }
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
  if (track.velocities) track.velocities[destination] = [...track.velocities[source]];
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
export function chordNotes(row, beat, voiceId, styleId = 'block', transpose = 0) {
  chordStyleInfo(styleId);
  if (!Number.isInteger(row) || !CHORDS[row] || !Number.isInteger(beat) || beat < 0 || beat > 3 || !Number.isInteger(transpose) || Math.abs(transpose)>12) throw new Error('和弦位置或移调无效');
  const voice = chordVoiceInfo(voiceId), pitches = CHORDS[row].map(p=>p+transpose), start = beat * 4;
  const notes = styleId === 'block' ? [note(pitches, start, start + 4, 65)] :
    styleId === 'strum-v1' ? pitches.map((_,i) => note(pitches.slice(0,i+1), start + i * .5, start + (i === pitches.length-1 ? 4 : (i+1)*.5), 65)) :
    styleId === 'staccato-v1' ? [0,2].map(offset => note(pitches, start + offset, start + offset + 1, 65)) :
    styleId === 'arpeggio-rise-v1' && pitches.length === 3 ? [0,1,2].map((p, i) => note([pitches[p]], start + [0,2,3][i], start + [2,3,4][i], 65)) :
    (pitches.length===4?[0,1,2,3]:[0,1,2,1]).map((index, step) => note([pitches[index]], start + step, start + step + 1, 65));
  if (!voice.legacy) notes.forEach(n => n.points.forEach(point => { point.volume = voice.noteVolume; }));
  notes.forEach(n=>{if(n.pitches.length>3)n.yinyaChordGain=Math.sqrt(3/n.pitches.length);});
  return notes;
}
export function songJSON(value) {
  const s = validate(value);
  const channels = s.tracks.map((t,index)=>{
    const ids = index === 3 ? ['drums'] : [...new Set(Array.from({length:s.barCount},(_,bar)=>sectionVoice(s,index,bar)))];
    const instruments = ids.map(id => index===0 ? melodyInstrument(id,t.volume) : index===1 ? chordInstrument(id,t.volume) : index===2 ? bassInstrument(id,t.volume) : {
      type:'drumset',wave:TRACKS[index].wave,volume:t.volume,effects:['transition type','chord type'],transition:'normal',chord:'simultaneous',fadeInSeconds:0,fadeOutTicks:-1,
      drums:Array.from({length:12},(_,drum)=>({filterEnvelope:drum>=8?'twang 1':'twang 2',spectrum:Array.from({length:30},(_,band)=>drum===0?Math.max(0,100-band*17):drum===4?(band>3&&band<17?75:15):drum===8?(band>17?80:0):0)})),
    });
    const patterns=t.bars.map((bar,barIndex)=>{
      const id=index===3?'drums':sectionVoice(s,index,barIndex),gain=sectionGain(s,index,barIndex);
      const notes=bar.flatMap((n,step)=>{
        if(!s.sections[Math.floor(barIndex/GROUP_SIZE)].enabled[index]||gain===0||n<0||(index===3&&n===0))return [];
        if(index===3)return [note([0,4,8].filter((_,bit)=>n&(1<<bit)),step,step+1,70)];
        if(index===1)return chordNotes(n,step,id,sectionChordStyle(s,barIndex),s.transpose);
        const result=note([PITCH_VALUES[n]+(index===2?24:48)+s.transpose],step,step+t.durations[barIndex][step]);
        const voice=index===0?voiceInfo(id):bassVoiceInfo(id);
        if(!voice.legacy)result.points.forEach(point=>{point.volume=voice.noteVolume??90;});
        const level=t.velocities[barIndex][step];if(level!==1)result.yinyaGain=[.55,1,1.35][level];
        return [result];
      });
      if(gain!==1)notes.forEach(n=>{n.yinyaSectionGain=gain;});
      return {...(ids.length>1?{instruments:[ids.indexOf(id)+1]}:{}),notes};
    });
    return {type:index===3?'drum':'pitch',instruments,patterns,sequence:Array.from({length:s.barCount},(_,i)=>i+1)};
  });
  return {format:'BeepBox',version:9,scale:s.scale==='major'?'normal :)':s.scale==='minor'?'normal :(':'easy :)',key:'C',introBars:0,loopBars:s.barCount,beatsPerBar:4,ticksPerBeat:4,beatsPerMinute:s.tempo,channels};
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
  if (duplicate) { part.name = `${source.name.slice(0, 20)} 副本`; part.enabled = [...source.enabled]; part.chordStyle = source.chordStyle; copyOrchestration(part,source); }
  state.sections.splice(after + 1, 0, part);
  state.tracks.forEach(track => {
    const bars = duplicate ? track.bars.slice(after * GROUP_SIZE, at).map(bar => [...bar]) : Array.from({ length: GROUP_SIZE }, () => emptyBar(track.id));
    if (track.velocities) track.velocities.splice(at, 0, ...(duplicate ? track.velocities.slice(after * GROUP_SIZE, at).map(bar => [...bar]) : Array.from({ length: GROUP_SIZE }, () => Array(16).fill(1))));
    if (track.durations) track.durations.splice(at, 0, ...(duplicate ? track.durations.slice(after * GROUP_SIZE, at).map(bar => [...bar]) : Array.from({ length: GROUP_SIZE }, () => Array(16).fill(1))));
    track.bars.splice(at, 0, ...bars);
  });
  state.barCount += GROUP_SIZE; return state;
}
export function moveSection(value, index, destination) {
  const state = validate(value); checkSection(state, index); checkSection(state, destination);
  const move = (array, start, length, target) => { const moved = array.splice(start, length); array.splice(target, 0, ...moved); };
  move(state.sections, index, 1, destination);
  state.tracks.forEach(track => { move(track.bars, index * GROUP_SIZE, GROUP_SIZE, destination * GROUP_SIZE); if (track.velocities) move(track.velocities, index * GROUP_SIZE, GROUP_SIZE, destination * GROUP_SIZE); if (track.durations) move(track.durations, index * GROUP_SIZE, GROUP_SIZE, destination * GROUP_SIZE); });
  return state;
}
export function deleteSection(value, index) {
  const state = validate(value); checkSection(state, index); if (state.sections.length === 1) throw new Error('至少保留一个段落');
  state.sections.splice(index, 1); state.tracks.forEach(track => { track.bars.splice(index * GROUP_SIZE, GROUP_SIZE); track.velocities?.splice(index * GROUP_SIZE, GROUP_SIZE); track.durations?.splice(index * GROUP_SIZE, GROUP_SIZE); });
  state.barCount -= GROUP_SIZE; return state;
}
export function trackAudibleAt(state, track, bar) { return state.tracks[track].enabled && state.tracks[track].volume > 0 && state.sections[Math.floor(bar / GROUP_SIZE)].enabled[track] && sectionGain(state,track,bar)>0; }
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

export function setNoteVelocity(value, track, bar, step, level) {
  const state = validate(value), note = pitchedNoteAt(state, track, bar, step);
  if (!note || ![0,1,2].includes(level)) throw new Error('请选择音符并设置有效力度');
  state.tracks[track].velocities[bar][note.start] = level; return state;
}
export function setSectionChordStyle(value, index, style) {
  const state = validate(value); checkSection(state,index); if (style !== 'inherit') chordStyleInfo(style);
  state.sections[index].chordStyle = style; return state;
}
export function setSectionVoice(value,index,track,id) {
  const state=validate(value);checkSection(state,index);
  if(!Number.isInteger(track)||track<0||track>2)throw new Error('该声部不支持段落音色');
  if(id!=='inherit')[voiceInfo,chordVoiceInfo,bassVoiceInfo][track](id);
  state.sections[index].voices[track]=id;return state;
}
export function setSectionVolume(value,index,track,volume) {
  const state=validate(value);checkSection(state,index);
  if(!Number.isInteger(track)||track<0||track>3||!Number.isInteger(volume)||volume<0||volume>100)throw new Error('本段音量请保持在 0–100%');
  state.sections[index].volumes[track]=volume;return state;
}
export function resetSectionOrchestration(value,index) {
  const state=validate(value);checkSection(state,index);copyOrchestration(state.sections[index],section('s1'));return state;
}
export function applyDrumPattern(value, start, count, id, fill = false) {
  const state = validate(value);
  if (!Number.isInteger(start) || ![1,4].includes(count) || typeof fill !== 'boolean' || start < 0 || start + count > state.barCount || (count === 4 && start % 4)) throw new Error('鼓点应用范围无效');
  for (let i = 0; i < count; i++) state.tracks[3].bars[start+i] = drumPattern(id,i,fill && i === count-1);
  return state;
}

export function performancePreset(id) {
  const variants = {
    'groove-pop': ['晴窗律动',112,'acoustic-guitar-v1','chord-acoustic-guitar-v1','bass-pluck-v1','pop-v1','strum-v1',0],
    'groove-night': ['夜航微光',76,'electric-piano-v1','chord-electric-piano-v1','bass-soft-v1','gentle-v1','arpeggio-rise-v1',-1],
    'groove-pixel': ['像素漫游',132,'square','rounded','square','pixel-v1','staccato-v1',1],
  };
  const config = variants[id]; if (!config) throw new Error('完整示例不存在');
  const [title,tempo,voice,chordVoice,bassVoice,drums,style,shift] = config;
  let state = arrangementPreset(); Object.assign(state,{title,tempo,voice,chordVoice,bassVoice});
  state.sections.forEach((part,i) => { part.chordStyle = i === 0 ? 'arpeggio-rise-v1' : i === 3 ? 'block' : style; });
  state.sections[0].enabled = [true,true,false,true];
  for (let bar = 0; bar < 16; bar++) {
    const melody = state.tracks[0];
    if (bar < 12 && id !== 'groove-pop') {
      melody.bars[bar].fill(-1); melody.durations[bar].fill(1);
      const night = [[[0,5,8],[10,3,4]],[[0,4,4],[6,2,4],[12,0,4]],[[0,2,8],[10,4,4]],[[0,3,4],[8,0,8]]];
      const pixel = [[0,0,2],[3,2,1],[4,4,2],[6,3,2],[8,5,2],[10,4,2],[12,2,2],[14,0,2]];
      const phrase = id === 'groove-night' ? night[bar % 4] : pixel.map(([step,pitch,length]) => [step,Math.min(7,pitch+(bar % 4 === 2 ? 2 : 0)),length]);
      for (const [step,pitch,length] of phrase) { melody.bars[bar][step]=pitch; melody.durations[bar][step]=length; }
    }
    melody.bars[bar] = melody.bars[bar].map(n => n < 0 ? n : Math.max(0,Math.min(7,n+shift)));
    for (const track of [0,2]) state.tracks[track].velocities[bar] = state.tracks[track].bars[bar].map((n,step) => n < 0 ? 1 : step === 0 ? 2 : 0);
  }
  for (let start = 0; start < 16; start += 4) state = applyDrumPattern(state,start,4,drums,start === 8);
  return state;
}

export function setScale(value,scale) { const state=validate(value);scaleInfo(scale);state.scale=scale;return state; }
export function setTranspose(value,transpose) {
  const state=validate(value);if(!Number.isInteger(transpose)||transpose < -12 || transpose > 12)throw new Error('整曲移调请保持在升降一个八度内');state.transpose=transpose;return state;
}
export function shiftOctave(value,track,start,count,direction) {
  const state=validate(value);
  if(!LONG_NOTE_TRACKS.includes(track)||![1,4].includes(count)||!Number.isInteger(start)||start<0||start+count>state.barCount||(count===4&&start%4)||![1,-1].includes(direction))throw new Error('八度移动范围无效');
  const bars=state.tracks[track].bars.slice(start,start+count);if(!bars.some(bar=>bar.some(n=>n>=0)))throw new Error('当前范围没有音符');
  const moved=bars.map(bar=>bar.map(n=>n<0?n:pitchId(PITCH_VALUES[n]+direction*12)));
  state.tracks[track].bars.splice(start,count,...moved);return state;
}
export function applyProgression(value,start,id) {
  const state=validate(value),progression=PROGRESSIONS.find(p=>p.id===id);
  if(!progression||!Number.isInteger(start)||start<0||start%4||start+4>state.barCount)throw new Error('和弦走向或应用范围无效');
  if((state.scale==='minor'?'minor':'major')!==progression.mode)throw new Error('请选择与当前音阶匹配的和弦走向');
  for(let i=0;i<4;i++)state.tracks[1].bars[start+i]=[progression.chords[i],-1,progression.chords[i],-1];return state;
}

export function tonalPreset(mode='major') {
  if(!['major','minor'].includes(mode))throw new Error('示例音阶无效');
  let state=performancePreset(mode==='major'?'groove-pop':'groove-night');state.scale=mode;state.title=mode==='major'?'风中明信片':'暮色小径';state.voice=mode==='major'?'piano-v1':'electric-piano-v1';
  const phrases=mode==='major'?[[0,4,5,7],[7,11,12,16],[12,17,19,23],[24,19,16,12]]:[[0,3,5,7],[7,10,12,15],[12,17,19,22],[24,19,15,12]];
  for(const start of [0,4,8,12])state=applyProgression(state,start,mode==='major'?(start===8?'home-v1':'bright-v1'):'night-v1');
  for(let bar=0;bar<16;bar++){
    for(const index of [0,2]){const t=state.tracks[index];t.bars[bar].fill(-1);t.durations[bar].fill(1);t.velocities[bar].fill(1);}
    for(let i=0;i<4;i++){const t=state.tracks[0],step=i*4;t.bars[bar][step]=pitchId(phrases[bar%4][i]);t.durations[bar][step]=4;t.velocities[bar][step]=i===0?2:1;}
    if(bar>=12){const t=state.tracks[0];t.bars[bar].fill(-1);t.durations[bar].fill(1);t.velocities[bar].fill(1);t.bars[bar][0]=pitchId([12,7,mode==='major'?4:3,0][bar%4]);t.durations[bar][0]=8;}
    const root=CHORDS[state.tracks[1].bars[bar][0]][0]%12;for(const step of [0,8]){state.tracks[2].bars[bar][step]=pitchId(root);state.tracks[2].durations[bar][step]=8;}
  }
  return validate(state);
}

export function orchestrationPreset(id) {
  if(!['orchestra-day','orchestra-night'].includes(id))throw new Error('配器示例不存在');
  const night=id==='orchestra-night';let state=tonalPreset(night?'minor':'major');
  state.title=night?'星灯渐远':'晨光接力';state.tempo=night?84:108;
  const voices=night?[
    ['electric-piano-v1','chord-electric-piano-v1','bass-soft-v1'],
    ['piano-v1','chord-acoustic-guitar-v1','bass-soft-v1'],
    ['acoustic-guitar-v1','chord-piano-v1','bass-pluck-v1'],
    ['electric-piano-v1','chord-electric-piano-v1','bass-soft-v1'],
  ]:[
    ['electric-piano-v1','chord-acoustic-guitar-v1','bass-soft-v1'],
    ['piano-v1','chord-acoustic-guitar-v1','bass-pluck-v1'],
    ['acoustic-guitar-v1','chord-electric-piano-v1','bass-soft-v1'],
    ['piano-v1','chord-piano-v1','bass-soft-v1'],
  ];
  const volumes=night?[[85,50,65,0],[100,70,75,45],[95,80,85,65],[70,35,40,0]]:[[85,55,65,0],[100,75,85,65],[100,85,90,85],[80,45,55,0]];
  state.sections.forEach((part,i)=>{part.voices=voices[i];part.volumes=volumes[i];part.enabled=i===0?[true,true,false,false]:i===3?[true,true,false,false]:[true,true,true,true];});
  const phrases=night?[[0,7,10,7],[3,5,7,3],[5,10,12,7],[7,5,3,0]]:[[0,4,7,4],[2,5,9,7],[4,7,12,9],[7,5,4,0]];
  for(let bar=0;bar<16;bar++){
    const track=state.tracks[0],group=Math.floor(bar/4);for(const field of ['bars','durations','velocities'])track[field][bar].fill(field==='bars'?-1:1);
    const pitches=phrases[bar%4];
    if(group===3){track.bars[bar][0]=pitchId(pitches.at(-1));track.durations[bar][0]=8;}
    else for(let i=0;i<4;i++){const step=[0,4,8,12][i],pitch=pitches[i]+(group===2?12:0);track.bars[bar][step]=pitchId(pitch);track.durations[bar][step]=group===0&&i===3?2:4;track.velocities[bar][step]=i===0?2:1;}
  }
  return validate(state);
}
