// 音芽's PCM adapter. The separate lamejs encoder keeps its LGPL license.
export function encodeMp3(left, right, Encoder, onProgress = () => {}) {
  if (!(left instanceof Float32Array) || !(right instanceof Float32Array) || !left.length || left.length !== right.length) throw new Error('立体声音频数据不完整');
  const encoder = new Encoder(2, 44100, 192), chunks = [];
  const blockSize = 1152;
  for (let offset = 0; offset < left.length; offset += blockSize) {
    const count = Math.min(blockSize, left.length - offset), l = new Int16Array(count), r = new Int16Array(count);
    for (let i = 0; i < count; i++) {
      if (!Number.isFinite(left[offset + i]) || !Number.isFinite(right[offset + i])) throw new Error('音频含有无效采样');
      l[i] = Math.round(Math.max(-1, Math.min(1, left[offset + i])) * 32767);
      r[i] = Math.round(Math.max(-1, Math.min(1, right[offset + i])) * 32767);
    }
    const data = encoder.encodeBuffer(l, r); if (data.length) chunks.push(Uint8Array.from(data));
    if (offset % (blockSize * 20) === 0) onProgress((offset + count) / left.length);
  }
  const tail = encoder.flush(); if (tail.length) chunks.push(Uint8Array.from(tail));
  const output = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let pos = 0; for (const chunk of chunks) { output.set(chunk, pos); pos += chunk.length; }
  if (!output.length) throw new Error('MP3 编码没有生成音频');
  onProgress(1); return output;
}
