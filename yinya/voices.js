// Copyright (c) John Nesky and contributing authors, MIT, see LICENSE.md.
// Acoustic definitions adapted from editor/EditorConfig.ts; Yinya revisions
// deliberately stay fixed so saved music keeps the same sound after updates.
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
export const VOICES = freeze([
  { id: 'triangle', name: '柔软三角波', hint: '柔和、轻盈的原始声音', legacy: true },
  { id: 'rounded', name: '圆润波形', hint: '圆润、温暖的原始声音', legacy: true },
  { id: 'square', name: '复古方波', hint: '明亮的像素游戏感', legacy: true },
  { id: 'piano-v1', name: '钢琴', hint: '清晰起音，柔和衰减 · 合成音色', releaseBeats: .5, volumeOffset: -20, noteVolume: 67,
    settings: { type: 'Picked String', eqFilter: [{ type: 'high-pass', cutoffHz: 148.65, linearGain: .7071 }, { type: 'peak', cutoffHz: 1681.79, linearGain: 4 }, { type: 'low-pass', cutoffHz: 8000, linearGain: .1768 }, { type: 'peak', cutoffHz: 3363.59, linearGain: 4 }, { type: 'peak', cutoffHz: 2378.41, linearGain: .25 }], effects: ['note filter', 'transition type', 'chord type'], noteFilter: [{ type: 'low-pass', cutoffHz: 4756.83, linearGain: .3536 }, { type: 'high-pass', cutoffHz: 125, linearGain: .0884 }], fadeInSeconds: 0, fadeOutTicks: 24, harmonics: [100,100,86,86,86,71,71,71,0,71,71,71,71,57,57,71,57,14,57,57,57,57,57,57,57,57,29,57], unison: 'piano', stringSustain: 86, stringSustainType: 'acoustic', envelopes: [{ target: 'noteFilterFreq', envelope: 'note size', index: 0 }, { target: 'noteFilterFreq', envelope: 'twang 1', index: 1 }] } },
  { id: 'electric-piano-v1', name: '电钢琴', hint: '柔和、有颗粒感，适合舒缓旋律 · 合成音色', releaseBeats: .25, volumeOffset: 0,
    settings: { type: 'FM', eqFilter: [], effects: ['note filter', 'transition type', 'chord type'], noteFilter: [{ type: 'low-pass', cutoffHz: 13454.34, linearGain: .25 }], fadeInSeconds: 0, fadeOutTicks: 12, algorithm: '1←3 2←4', feedbackType: '1⟲ 2⟲', feedbackAmplitude: 0, operators: [{ frequency: '1×', amplitude: 12 }, { frequency: '1×', amplitude: 6 }, { frequency: '1×', amplitude: 9 }, { frequency: '16×', amplitude: 6 }], envelopes: [{ target: 'noteFilterAllFreqs', envelope: 'twang 3' }, { target: 'operatorAmplitude', envelope: 'twang 3', index: 3 }] } },
  { id: 'acoustic-guitar-v1', name: '木吉他', hint: '明亮的钢弦拨弦感 · 合成音色', releaseBeats: .25, volumeOffset: 0,
    settings: { type: 'Picked String', eqFilter: [], effects: ['transition type', 'chord type'], fadeInSeconds: 0, fadeOutTicks: 12, harmonics: [100,100,86,71,71,71,86,86,71,57,43,43,43,57,57,57,57,57,43,43,43,43,43,43,43,43,43,43], unison: 'none', stringSustain: 71, stringSustainType: 'acoustic', envelopes: [] } },
]);
export function voiceInfo(id) {
  const voice = VOICES.find(item => item.id === id);
  if (!voice) throw new Error('无法识别这款旋律音色，请使用支持该音色的音芽版本');
  return voice;
}
export function melodyInstrument(id, volume) {
  const voice = voiceInfo(id);
  if (voice.legacy) return { type: 'chip', wave: id, volume, effects: ['transition type', 'chord type'], transition: 'normal', chord: 'simultaneous', fadeInSeconds: 0, fadeOutTicks: -1 };
  const settings = JSON.parse(JSON.stringify(voice.settings));
  settings.envelopes.push({ target: 'noteVolume', envelope: 'note size' });
  return { ...settings, volume: Math.max(0, Math.min(100, volume + voice.volumeOffset)), transition: 'normal', chord: 'simultaneous' };
}
export function releaseSeconds(id, tempo) {
  const voice = voiceInfo(id);
  return voice.legacy ? .07 : voice.releaseBeats * 60 / tempo + .08;
}
