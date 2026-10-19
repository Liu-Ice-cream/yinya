// Original editable rhythm patterns. Bits: kick=1, snare=2, hi-hat=4.
const hit = (kick, snare, hat) => Object.freeze(Array.from({ length: 16 }, (_, i) => (kick.includes(i) ? 1 : 0) | (snare.includes(i) ? 2 : 0) | (hat.includes(i) ? 4 : 0)));
export const DRUM_PATTERNS = Object.freeze([
  { id: 'pop-v1', name: '轻快流行', bars: [hit([0,8],[4,12],[0,2,4,6,8,10,12,14]),hit([0,6,8],[4,12],[0,2,4,6,8,10,12,14])] },
  { id: 'gentle-v1', name: '舒缓步伐', bars: [hit([0,8],[12],[0,4,8,12]),hit([0],[4,12],[0,4,8,12])] },
  { id: 'electro-v1', name: '电子四拍', bars: [hit([0,4,8,12],[4,12],[2,6,10,14])] },
  { id: 'pixel-v1', name: '像素跳跃', bars: [hit([0,3,8,10],[4,12],[0,2,4,6,8,10,12,14]),hit([0,6,8,14],[4,12],[0,2,4,6,8,10,12,14])] },
  { id: 'offbeat-v1', name: '轻盈切分', bars: [hit([0,6,10],[4,12],[2,6,10,14]),hit([0,7,10],[4,12],[2,6,10,14])] },
  { id: 'half-time-v1', name: '半速律动', bars: [hit([0,7,14],[8],[0,2,4,6,8,10,12,14]),hit([0,6,12],[8],[0,2,4,6,8,10,12,14])] },
].map(p => Object.freeze({ ...p, bars: Object.freeze(p.bars) })));
export function drumPattern(id, offset = 0, fill = false) {
  const pattern = DRUM_PATTERNS.find(p => p.id === id);
  if (!pattern || !Number.isInteger(offset) || offset < 0 || typeof fill !== 'boolean') throw new Error('鼓点模板无效');
  const result = [...pattern.bars[offset % pattern.bars.length]];
  if (fill) for (let step = 12; step < 16; step++) result[step] = (step === 12 ? 1 : 0) | 2 | (step % 2 === 0 ? 4 : 0);
  return result;
}
