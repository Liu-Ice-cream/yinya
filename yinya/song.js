import { Song } from '../synth/synth.ts';

// BeepBox's JSON reader quantizes point volume to four sizes. Apply our bounded
// performance gain after parsing, keeping every standard legacy pin unchanged.
// This Song is used directly, never round-tripped through BeepBox serialization.
export function audioSong(json) {
  const song = new Song(); song.fromJsonObject(json);
  song.channels.forEach((channel, c) => channel.patterns.forEach((pattern, p) => {
    pattern.notes.forEach((note, n) => {
      const gain = json.channels[c].patterns[p].notes[n]?.yinyaGain ?? 1;
      if (![.55, 1, 1.35].includes(gain)) throw new Error('音符力度超出支持范围');
      if (gain !== 1) for (const pin of note.pins) pin.size *= Math.pow(gain, 2 / 3);
    });
  }));
  return song;
}
