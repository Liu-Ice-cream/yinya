// Deterministic, editable accompaniment. No persistent recipe or external service.
import { validate, GROUP_SIZE, CHORDS, applyProgression, setSectionChordStyle, applyDrumPattern } from './model.js';
import { pitchId } from './theory.js';

export const BASS_PATTERNS = Object.freeze([
  { id: 'steady-v1', name: '平稳长音', hint: '以根音托住和声，最多两拍一音；换和弦时换音。' },
  { id: 'alternate-v1', name: '根音交替', hint: '每拍交替根音与和弦内音，换和弦时从根音开始。' },
  { id: 'octave-v1', name: '八度律动', hint: '每半拍交替根音与高八度，轻重交替。' },
].map(Object.freeze));
export const ACCOMPANIMENT_STYLES = Object.freeze([
  { id: 'pop-v1', name: '轻快流行', bass: 'alternate-v1', chords: 'strum-v1', drums: 'pop-v1', major: 'bright-v1', minor: 'night-v1' },
  { id: 'gentle-v1', name: '温柔抒情', bass: 'steady-v1', chords: 'arpeggio-rise-v1', drums: 'gentle-v1', major: 'lyric-v1', minor: 'quiet-v1' },
  { id: 'electro-v1', name: '电子律动', bass: 'octave-v1', chords: 'staccato-v1', drums: 'electro-v1', major: 'bright-v1', minor: 'drift-v1' },
].map(Object.freeze));
export function bassPatternInfo(id) {
  const pattern = BASS_PATTERNS.find(item => item.id === id);
  if (!pattern) throw new Error('贝斯模式无效');
  return pattern;
}
export function accompanimentStyleInfo(id) {
  const style = ACCOMPANIMENT_STYLES.find(item => item.id === id);
  if (!style) throw new Error('伴奏风格无效');
  return style;
}
export function accompanimentOptions(options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) throw new Error('伴奏设置无效');
  const mode = options.mode ?? 'bass', style = accompanimentStyleInfo(options.style ?? 'pop-v1');
  if (!['bass', 'ensemble'].includes(mode)) throw new Error('伴奏模式无效');
  const bassPattern = options.bassPattern ?? (mode === 'bass' ? 'steady-v1' : style.bass);
  bassPatternInfo(bassPattern);
  const harmony = options.harmony ?? 'existing', enable = options.enable ?? true;
  const targets = options.targets ?? (mode === 'bass' ? [false, true, false] : [true, true, true]);
  if (!['existing', 'style'].includes(harmony) || typeof enable !== 'boolean' || !Array.isArray(targets) || targets.length !== 3 || targets.some(t => typeof t !== 'boolean') || !targets.some(Boolean)) throw new Error('请选择至少一个伴奏声部并检查设置');
  if (mode === 'bass' && (harmony !== 'existing' || targets[0] || !targets[1] || targets[2])) throw new Error('只配贝斯时沿用本段和弦，仅改变贝斯');
  if (harmony === 'style' && !targets[0]) throw new Error('采用风格走向时请同时选择和弦声部');
  return { mode, style: style.id, bassPattern, harmony, targets: [...targets], enable };
}
// Empty beats after a chord continue its harmony within that bar. Leading rests
// and completely empty bars stay silent; never borrow harmony from another bar.
export function harmonicRuns(bar) {
  if (!Array.isArray(bar) || bar.length !== 4 || bar.some(n => !Number.isInteger(n) || n < -1 || n >= CHORDS.length)) throw new Error('和弦小节无效');
  const runs = [];
  for (let beat = 0; beat < 4; beat++) {
    const chord = bar[beat];
    if (chord < 0) continue;
    const last = runs.at(-1);
    if (last?.chord === chord) continue;
    if (last) last.end = beat * 4;
    runs.push({ chord, start: beat * 4, end: 16 });
  }
  return runs;
}
function alternateInterval(chord) {
  const pitches = CHORDS[chord], root = pitches[0] % 12, intervals = new Set(pitches.map(p => (p - root + 120) % 12));
  // Diminished and suspended chords use their own tones; legacy Em7 has no fifth.
  return [7, 6, 5, 3, 4, 2, 10, 11, 8, 9, 1].find(interval => intervals.has(interval)) ?? 0;
}
export function bassBar(chords, patternId) {
  bassPatternInfo(patternId);
  const result = { bars: Array(16).fill(-1), durations: Array(16).fill(1), velocities: Array(16).fill(1) };
  for (const run of harmonicRuns(chords)) {
    const root = CHORDS[run.chord][0] % 12;
    const size = patternId === 'steady-v1' ? 8 : patternId === 'alternate-v1' ? 4 : 2;
    for (let step = run.start, count = 0; step < run.end; step += size, count++) {
      const interval = count % 2 === 0 || patternId === 'steady-v1' ? 0 : patternId === 'octave-v1' ? 12 : alternateInterval(run.chord);
      result.bars[step] = pitchId(root + interval);
      result.durations[step] = Math.min(size, run.end - step);
      result.velocities[step] = count % 2 === 1 && patternId !== 'steady-v1' ? 0 : 1;
    }
  }
  return result;
}
export function generateAccompaniment(value, start, settings = {}) {
  let state = validate(value);
  if (!Number.isInteger(start) || start < 0 || start % GROUP_SIZE || start + GROUP_SIZE > state.barCount) throw new Error('请选择有效的四小节段');
  const options = accompanimentOptions(settings), style = accompanimentStyleInfo(options.style);
  if (options.targets[0]) {
    if (options.harmony === 'style') state = applyProgression(state, start, style[state.scale === 'minor' ? 'minor' : 'major']);
    state = setSectionChordStyle(state, start / GROUP_SIZE, style.chords);
  }
  if ((options.targets[0] || options.targets[1]) && !state.tracks[1].bars.slice(start, start + GROUP_SIZE).some(bar => bar.some(n => n >= 0))) throw new Error('本段没有和弦：请先填入和弦，或在成套伴奏中选择「采用风格走向」并勾选和弦。');
  if (options.targets[1]) for (let bar = start; bar < start + GROUP_SIZE; bar++) {
    const generated = bassBar(state.tracks[1].bars[bar], options.bassPattern);
    for (const field of ['bars', 'durations', 'velocities']) state.tracks[2][field][bar] = generated[field];
  }
  if (options.targets[2]) state = applyDrumPattern(state, start, GROUP_SIZE, style.drums, true);
  if (options.enable) options.targets.forEach((chosen, index) => { if (chosen) state.sections[start / GROUP_SIZE].enabled[index + 1] = true; });
  return validate(state);
}
