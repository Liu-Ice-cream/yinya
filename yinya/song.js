import { dynamicsAt, validateDynamics } from './dynamics.js';
import { Song } from '../synth/synth.ts';

// BeepBox's JSON reader quantizes point volume to four sizes. Apply our bounded
// performance gain after parsing, keeping every standard legacy pin unchanged.
// This Song is used directly, never round-tripped through BeepBox serialization.
export function audioSong(json) {
  const song = new Song(); song.fromJsonObject(json);
  if(json.yinyaDynamics!==undefined){
    const curves=validateDynamics(json.yinyaDynamics,json.channels.length),offset=json.yinyaDynamicsOffset??0;
    if(!Number.isFinite(offset)||offset<0||offset>32)throw new Error('音量曲线位置无效');
    curves.forEach((curve,index)=>{if(curve&&curve.length!==json.channels[index].instruments.length)throw new Error('动态配器与音量曲线不匹配');});
    // Each arranged section owns an instrument instance, so released sounds
    // retain their section's end gain while the next section starts its curve.
    song.channelGainEnvelope=(channel,position,instrument)=>{
      const curve=curves[channel];if(!curve)return 1;
      const section=instrument??Math.min(curve.length-1,Math.floor((position+offset)/4)),pair=curve[section];
      if(pair[0]===pair[1])return 1;
      return dynamicsAt([pair],Math.max(0,Math.min(4,position+offset-section*4)));
    };
  }
  song.channels.forEach((channel, c) => channel.patterns.forEach((pattern, p) => {
    pattern.notes.forEach((note, n) => {
      const gain = json.channels[c].patterns[p].notes[n]?.yinyaGain ?? 1;
      if (![.55, 1, 1.35].includes(gain)) throw new Error('音符力度超出支持范围');
      const chordGain=json.channels[c].patterns[p].notes[n]?.yinyaChordGain ?? 1;
      if (![1,Math.sqrt(3/4)].includes(chordGain)) throw new Error('和弦强度无效');
      const sectionGain=json.channels[c].patterns[p].notes[n]?.yinyaSectionGain ?? 1;
      if (!Number.isFinite(sectionGain)||sectionGain<0||sectionGain>1) throw new Error('段落音量无效');
      if (gain * chordGain * sectionGain !== 1) for (const pin of note.pins) pin.size *= Math.pow(gain * chordGain * sectionGain, 2 / 3);
    });
  }));
  return song;
}
