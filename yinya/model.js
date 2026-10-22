// Original 音芽 interface and patterns. BeepBox audio code retains its MIT notice.
import { voiceInfo, melodyInstrument, chordVoiceInfo, chordInstrument, bassVoiceInfo, bassInstrument } from './voices.js';
import {drumKitInfo,drumInstrument,drumLevel,withDrumLevel} from './drum-kits.js';
import {chordInversion,chordVelocity,chordExpression,voicedPitches,smoothInversions} from './chord-expression.js';
import { drumPattern } from './grooves.js';
import { PITCH_VALUES, CHORD_PITCHES, PROGRESSIONS, scaleInfo, pitchId } from './theory.js';
export const VERSION = 16;
export const VELOCITIES = Object.freeze([{id:0,name:'轻'},{id:1,name:'标准'},{id:2,name:'重'}].map(Object.freeze));
export const CHORD_STYLES = Object.freeze([
  Object.freeze({ id: 'block', name: '齐奏', hint: '同时弹出全部和弦音，按设定时长延续。' }),
  Object.freeze({ id: 'arpeggio-v1', name: '分解', hint: '三音和弦按低 → 中 → 高 → 中；四音和弦从低到高弹出全部四音。' }),
  Object.freeze({ id: 'strum-v1', name: '轻扫弦', hint: '从低到高错开起音，按设定时长保留和声余韵。' }),
  Object.freeze({ id: 'staccato-v1', name: '跳跃短奏', hint: '每拍两次短奏，中间留出空隙。' }),
  Object.freeze({ id: 'arpeggio-rise-v1', name: '舒展分解', hint: '三音和弦先弹较长低音，再弹中、高音；四音和弦均分一拍，从低到高弹出。' }),
]);
export function chordStyleInfo(id) {
  const style = CHORD_STYLES.find(item => item.id === id);
  if (!style) throw new Error('无法识别这款和弦演奏方式，请使用支持该方式的音芽版本');
  return style;
}
export function sectionChordStyle(state, bar) { return state.sections[Math.floor(bar / GROUP_SIZE)].chordStyle === 'inherit' ? state.chordStyle : state.sections[Math.floor(bar / GROUP_SIZE)].chordStyle; }
export const MAX_BACKUP_BYTES = 96 * 1024;
export const LONG_NOTE_TRACKS = Object.freeze([0, 2]);
export const NOTE_LENGTHS = [1, 2, 4, 8, 16, 32];
export const BAR_COUNTS = [4, 8, 12, 16, 20, 24, 28, 32];
export const GROUP_SIZE = 4;
export const PITCHES = [0, 2, 4, 7, 9, 12, 14, 16];
export const CHORDS = CHORD_PITCHES;
export const TRACKS = [
  { id: 'melody', name: '旋律', hint: '点亮格子，写一句自己的旋律。每列一个音，越往上音越高。', rows: ['高音 mi', '高音 re', '高音 do', 'la', 'sol', 'mi', 're', 'do'], wave: 'triangle' },
  { id: 'chords', name: '和弦', hint: '选择和声与时长，为旋律铺一层底色。', rows: ['C · 明亮', 'Am · 柔和', 'Gsus2 · 开阔', 'Em7 · 轻盈'], wave: 'rounded' },
  { id: 'bass', name: '贝斯', hint: '用低音托住节奏。少放几个音，也会很好听。', rows: ['高音 mi', '高音 re', '高音 do', 'la', 'sol', 'mi', 're', 'do'], wave: 'square' },
  { id: 'drums', name: '鼓点', hint: '低鼓定节拍，小鼓加重音，沙帽填空隙。三行可以同时点亮。', rows: ['沙帽', '小鼓', '低鼓'] },
];
function section(id, name = '新段落') { return { id, name, enabled: [true, true, true, true], chordStyle: 'inherit', drumKit: 'inherit', voices: ['inherit','inherit','inherit'], volumes: [100,100,100,100], endVolumes: [100,100,100,100] }; }
export function sectionVoice(state, track, bar) {
  const id = state.sections[Math.floor(bar / GROUP_SIZE)].voices[track];
  return id === 'inherit' ? [state.voice ?? 'triangle',state.chordVoice,state.bassVoice][track] : id;
}
export function sectionDrumKit(state,bar){const id=state.sections[Math.floor(bar/4)].drumKit;return id==='inherit'?state.drumKit:id;}
export function setSectionDrumKit(value,index,id){const state=validate(value);checkSection(state,index);if(id!=='inherit')drumKitInfo(id);state.sections[index].drumKit=id;return state;}
export function setDrumHit(value,bar,step,lane,enabled,level=1){const state=validate(value);if(!Number.isInteger(bar)||bar<0||bar>=state.barCount||!Number.isInteger(step)||step<0||step>15||![0,1,2].includes(lane)||typeof enabled!=='boolean'||![0,1,2].includes(level))throw new Error('鼓点位置或力度无效');const t=state.tracks[3];t.bars[bar][step]=enabled?t.bars[bar][step]|(1<<lane):t.bars[bar][step]&~(1<<lane);t.drumVelocities[bar][step]=withDrumLevel(t.drumVelocities[bar][step],lane,enabled?level:1);return state;}
export function setChord(value,bar,beat,id,inversion=0,velocity=1,duration=1){
  const state=validate(value);if(!Number.isInteger(bar)||bar<0||bar>=state.barCount||!Number.isInteger(beat)||beat<0||beat>3||!Number.isInteger(id)||id<-1||id>=CHORDS.length)throw new Error('和弦位置无效');
  if(id>=0)voicedPitches(id,inversion);const code=id<0?1:chordExpression(inversion,velocity);state.tracks[1].bars[bar][beat]=id;state.tracks[1].chordVoicings[bar][beat]=code;state.tracks[1].chordDurations[bar][beat]=id<0?1:duration;return validate(state);
}
// Resolve a held beat to its onset, within the current four-bar section only.
export function chordAt(state,bar,beat){
  if(!Number.isInteger(bar)||bar<0||bar>=state.barCount||!Number.isInteger(beat)||beat<0||beat>3)throw new Error('和弦位置无效');
  const t=state.tracks[1],at=bar*4+beat;
  for(let pos=at;pos>=Math.floor(bar/4)*16;pos--){const b=Math.floor(pos/4),i=pos%4;if(t.bars[b][i]>=0)return pos+t.chordDurations[b][i]>at?{bar:b,beat:i,chord:t.bars[b][i],duration:t.chordDurations[b][i],expression:t.chordVoicings[b][i]}:null;}
  return null;
}
export function sectionGain(state, track, bar) { return state.sections[Math.floor(bar / GROUP_SIZE)].volumes[track] / 100; }
function copyOrchestration(target, source) { target.drumKit=source.drumKit; target.voices = [...source.voices]; target.volumes = [...source.volumes]; target.endVolumes = [...source.endVolumes]; }
function emptyBar(id) { return Array(id === 'chords' ? 4 : 16).fill(id === 'drums' ? 0 : -1); }
export function blank(title = '我的第一段旋律', barCount = 4) {
  if (!BAR_COUNTS.includes(barCount)) throw new Error('请选择 4–32 小节，以四小节为一段');
  return { version: VERSION, barCount, title, scale: 'pentatonic', transpose: 0, tempo: 108, drumKit: 'original', bassVoice: 'square', chordVoice: 'rounded', chordStyle: 'block', sections: Array.from({ length: barCount / GROUP_SIZE }, (_, i) => section(`s${i + 1}`, `第 ${i + 1} 段`)), tracks: TRACKS.map(t => ({ id: t.id, enabled: true, volume: t.id === 'melody' ? 80 : 60, bars: Array.from({ length: barCount }, () => emptyBar(t.id)), ...(t.id==='chords'?{chordVoicings:Array.from({length:barCount},()=>Array(4).fill(1)),chordDurations:Array.from({length:barCount},()=>Array(4).fill(1))}:{}), ...(t.id==='drums'?{drumVelocities:Array.from({length:barCount},()=>Array(16).fill(13))}:{}), ...(['melody', 'bass'].includes(t.id) ? { durations: Array.from({ length: barCount }, () => Array(16).fill(1)), velocities: Array.from({ length: barCount }, () => Array(16).fill(1)) } : {}) })) };
}
export const PRESETS = [
  {id:'chord-mist',name:'雾中晨光',detail:'钢琴长和弦 · 16 小节'},
  {id:'chord-shore',name:'海岸晚风',detail:'吉他延音与分解 · 16 小节'},
  {id:'harmony-lantern',name:'和光流转',detail:'钢琴转位与轻重 · 16 小节'},
  {id:'harmony-breeze',name:'晚风和声',detail:'吉他转位与呼吸 · 16 小节'},
  {id:'rhythm-warm',name:'暖拍漫步',detail:'柔和鼓组与轻重 · 16 小节'},
  {id:'rhythm-electric',name:'电光节拍',detail:'电子鼓组与过门 · 16 小节'},
  {id:'dynamic-rise',name:'微光渐起',detail:'渐入与推进 · 16 小节'},
  {id:'dynamic-dusk',name:'晚风收声',detail:'渐弱与收尾 · 16 小节'},
  {id:'hold-dawn',name:'长风入晨',detail:'旋律延音 · 16 小节'},
  {id:'hold-tide',name:'潮汐低语',detail:'持续贝斯 · 16 小节'},
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
  if(['chord-mist','chord-shore'].includes(id)){
    const s=harmonyPreset(id==='chord-mist'?'harmony-lantern':'harmony-breeze');s.title=id==='chord-mist'?'雾中晨光':'海岸晚风';s.tempo=id==='chord-mist'?72:80;
    const t=s.tracks[1];for(let start=0;start<16;start+=4){const ids=t.bars.slice(start,start+4).map(b=>b[0]),codes=t.chordVoicings.slice(start,start+4).map(b=>b[0]);for(let b=start;b<start+4;b++){t.bars[b].fill(-1);t.chordVoicings[b].fill(1);t.chordDurations[b].fill(1);}
      // A short opening leaves space; the next chord bridges the first bar line.
      for(const [i,beat,length] of [[0,0,2],[1,2,4],[2,6,2],[3,8,4],[0,12,4]]){const b=start+Math.floor(beat/4),at=beat%4;t.bars[b][at]=ids[i];t.chordVoicings[b][at]=codes[i];t.chordDurations[b][at]=length;}
    }
    // Match the bass roots to the new chord timing, including incoming holds.
    const bass=s.tracks[2];for(let bar=0;bar<16;bar++){bass.bars[bar].fill(-1);bass.durations[bar].fill(1);bass.velocities[bar].fill(1);for(let beat=0;beat<4;beat+=2){const n=chordAt(s,bar,beat);if(n){bass.bars[bar][beat*4]=pitchId(CHORDS[n.chord][0]%12);bass.durations[bar][beat*4]=Math.min(8,(n.bar*4+n.beat+n.duration-bar*4-beat)*4);}}}
    s.sections.forEach((p,i)=>p.chordStyle=id==='chord-mist'?'block':i===1||i===2?'arpeggio-rise-v1':'strum-v1');return validate(s);
  }
  if(['harmony-lantern','harmony-breeze'].includes(id))return harmonyPreset(id);
  if(['rhythm-warm','rhythm-electric'].includes(id)){
    const s=performancePreset(id==='rhythm-warm'?'groove-night':'groove-pixel');s.title=id==='rhythm-warm'?'暖拍漫步':'电光节拍';s.drumKit=id==='rhythm-warm'?'soft-v1':'electro-v1';
    s.sections[2].drumKit=id==='rhythm-warm'?'original':'soft-v1';
    for(let b=0;b<s.barCount;b++)for(let step=0;step<16;step++)for(let lane=0;lane<3;lane++)if(s.tracks[3].bars[b][step]&(1<<lane))s.tracks[3].drumVelocities[b][step]=withDrumLevel(s.tracks[3].drumVelocities[b][step],lane,lane===2?(step%4===0?1:0):lane===0?(step%8===0?2:1):2);
    return validate(s);
  }
  if(['dynamic-rise','dynamic-dusk'].includes(id))return dynamicPreset(id);
  if(['hold-dawn','hold-tide'].includes(id))return sustainPreset(id);
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
  if (!value || ![1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, VERSION].includes(value.version) || typeof value.title !== 'string' || value.title.length > 60 || !Number.isInteger(value.tempo) || value.tempo < 60 || value.tempo > 180 || !Array.isArray(value.tracks) || value.tracks.length !== 4) throw new Error('不是有效的音芽作品');
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
      const drumKit=value.version<14?'inherit':part.drumKit;if(drumKit!=='inherit')drumKitInfo(drumKit);
      const voices = value.version < 11 ? ['inherit','inherit','inherit'] : part.voices;
      const volumes = value.version < 11 ? [100,100,100,100] : part.volumes;
      const endVolumes = value.version < 13 ? volumes : part.endVolumes;
      if(!Array.isArray(endVolumes)||endVolumes.length!==4||Array.from(endVolumes).some(n=>!Number.isInteger(n)||n<0||n>100))throw new Error('段落结束音量请保持在 0–100%');
      if (!Array.isArray(voices) || voices.length !== 3 || !Array.isArray(volumes) || volumes.length !== 4 || Array.from(volumes).some(n=>!Number.isInteger(n)||n<0||n>100)) throw new Error('段落配器或音量数据无效');
      Array.from(voices).forEach((id,i)=>{if(id!=='inherit')[voiceInfo,chordVoiceInfo,bassVoiceInfo][i](id);});
      ids.add(part.id); return { id: part.id, name: part.name, enabled: [...part.enabled], chordStyle: style, drumKit, voices: [...voices], volumes: [...volumes], endVolumes: [...endVolumes] };
    });
  }
  result.scale = value.version < 10 ? 'pentatonic' : value.scale; scaleInfo(result.scale);
  result.transpose = value.version < 10 ? 0 : value.transpose;
  if (!Number.isInteger(result.transpose) || result.transpose < -12 || result.transpose > 12) throw new Error('整曲移调超出一个八度');
  result.tempo = value.tempo;result.drumKit=value.version<14?'original':value.drumKit;drumKitInfo(result.drumKit);
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
        let end = 0;
        durations = t.durations.map((lengths, index) => {
          if (!Array.isArray(lengths) || lengths.length !== 16) throw new Error(`${trackName}时长数据不完整`);
          for (let step = 0; step < 16; step++) {
            const length = lengths[step];
            if (!Number.isInteger(length) || length < 1 || length > (value.version < 12 ? 8 : 32) || (bars[index][step] < 0 && length !== 1)) throw new Error(`${trackName}时长超出支持范围`);
            if (bars[index][step] >= 0) {
              const absolute = index * 16 + step, boundary = value.version < 12 ? (index + 1) * 16 : (Math.floor(index / GROUP_SIZE) + 1) * 64;
              if (absolute < end || absolute + length > boundary) throw new Error(`${trackName}音符重叠或超出段落（旧版不能跨小节）`);
              end = absolute + length;
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
    let chordVoicings, chordDurations;
    if(index===1){
      chordVoicings=value.version<15?bars.map(()=>Array(4).fill(1)):t.chordVoicings;
      if(!Array.isArray(chordVoicings)||chordVoicings.length!==barCount)throw new Error('和弦转位与力度数据不完整');
      chordVoicings=Array.from(chordVoicings,(codes,bar)=>{if(!Array.isArray(codes)||codes.length!==4||Array.from(codes).some((code,beat)=>!Number.isInteger(code)||code<0||code>11||(bars[bar][beat]<0?code!==1:chordInversion(code)>=CHORDS[bars[bar][beat]].length)))throw new Error('和弦转位、力度或空拍数据无效');return [...codes];});
    }
    if(index===1){
      chordDurations=value.version<16?bars.map(()=>Array(4).fill(1)):t.chordDurations;
      if(!Array.isArray(chordDurations)||chordDurations.length!==barCount)throw new Error('和弦时长数据不完整');
      let end=0;
      chordDurations=Array.from(chordDurations,(lengths,bar)=>{
        if(!Array.isArray(lengths)||lengths.length!==4)throw new Error('和弦时长数据不完整');
        return Array.from(lengths,(duration,beat)=>{
          if(!Number.isInteger(duration)||duration<1||duration>4||(bars[bar][beat]<0&&duration!==1))throw new Error('和弦时长须为 1–4 拍，空拍时长须为 1');
          if(bars[bar][beat]>=0){const at=bar*4+beat;if(at<end||at+duration>(Math.floor(bar/4)+1)*16)throw new Error('和弦重叠或超出当前四小节；整次修改已取消');end=at+duration;}
          return duration;
        });
      });
    }
    let drumVelocities;
    if(index===3){
      drumVelocities=value.version<14?bars.map(()=>Array(16).fill(13)):t.drumVelocities;
      if(!Array.isArray(drumVelocities)||drumVelocities.length!==barCount)throw new Error('鼓点力度数据不完整');
      drumVelocities=Array.from(drumVelocities,(levels,bar)=>{if(!Array.isArray(levels)||levels.length!==16||Array.from(levels).some((code,step)=>!Number.isInteger(code)||code<0||code>26||[0,1,2].some(lane=>!(bars[bar][step]&(1<<lane))&&drumLevel(code,lane)!==1)))throw new Error('鼓点力度或休止格数据无效');return [...levels];});
    }
    return { id: t.id, enabled: t.enabled, volume: t.volume, bars, ...(chordVoicings?{chordVoicings,chordDurations}:{}), ...(drumVelocities?{drumVelocities}:{}), ...(durations ? { durations, velocities } : {}) };
  });
  return result;
}
export function resize(value, barCount, fill = 'empty') {
  if (!BAR_COUNTS.includes(barCount) || !['empty', 'repeat'].includes(fill)) throw new Error('不支持的小节扩展方式');
  const result = validate(value), previousCount = result.barCount;
  for (const track of result.tracks) {
    const previous = track.bars;
    track.bars = Array.from({ length: barCount }, (_, i) => i < previousCount || fill === 'repeat' ? [...previous[i % previousCount]] : emptyBar(track.id));
    if(track.chordDurations){const lengths=track.chordDurations;track.chordDurations=Array.from({length:barCount},(_,i)=>i<previousCount||fill==='repeat'?[...lengths[i%previousCount]]:Array(4).fill(1));}
    if(track.chordVoicings){const codes=track.chordVoicings;track.chordVoicings=Array.from({length:barCount},(_,i)=>i<previousCount||fill==='repeat'?[...codes[i%previousCount]]:Array(4).fill(1));}
    if(track.drumVelocities){const levels=track.drumVelocities;track.drumVelocities=Array.from({length:barCount},(_,i)=>i<previousCount||fill==='repeat'?[...levels[i%previousCount]]:Array(16).fill(13));}
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
  return state.tracks.some((track,i) => track.bars.slice(start, end).some((bar,j) => bar.some(n => i === 3 ? n !== 0 : n !== -1) || (i===1&&chordAt(state,start+j,0)) || (LONG_NOTE_TRACKS.includes(i) && pitchedNoteAt(state,i,start+j,0))));
}
export function copyGroup(value, source, destination) {
  const state = validate(value);
  for (const start of [source, destination]) if (!Number.isInteger(start) || start < 0 || start % GROUP_SIZE !== 0 || start + GROUP_SIZE > state.barCount) throw new Error('段落范围无效');
  if (source === destination) throw new Error('请选择另一段作为复制目标');
  for (const track of state.tracks) {
    const bars = track.bars.slice(source, source + GROUP_SIZE).map(bar => [...bar]);
    track.bars.splice(destination, GROUP_SIZE, ...bars);
    if(track.chordDurations)track.chordDurations.splice(destination,GROUP_SIZE,...track.chordDurations.slice(source,source+GROUP_SIZE).map(bar=>[...bar]));
    if(track.chordVoicings)track.chordVoicings.splice(destination,GROUP_SIZE,...track.chordVoicings.slice(source,source+GROUP_SIZE).map(bar=>[...bar]));
    if(track.drumVelocities)track.drumVelocities.splice(destination,GROUP_SIZE,...track.drumVelocities.slice(source,source+GROUP_SIZE).map(bar=>[...bar]));
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
  if (!Number.isInteger(barIndex) || barIndex < 0 || barIndex >= value.barCount || !Number.isInteger(step) || step < 0 || step >= 16) throw new Error('音符位置无效');
  const track = value.tracks[trackIndex], at = barIndex * 16 + step, first = Math.floor(barIndex / GROUP_SIZE) * 64;
  for (let pos = at; pos >= first; pos--) {
    const bar = Math.floor(pos / 16), start = pos % 16;
    if (track.bars[bar][start] >= 0) return pos + track.durations[bar][start] > at ? {start, pitch: track.bars[bar][start], duration: track.durations[bar][start], ...(bar !== barIndex ? {bar} : {})} : null;
  }
  return null;
}
export function setPitchedNote(value, trackIndex, barIndex, step, pitch, duration, velocity = null) {
  if (!Number.isInteger(pitch) || pitch < 0 || pitch >= PITCH_VALUES.length || !NOTE_LENGTHS.includes(duration)) throw new Error('音高或时长无效');
  const state = validate(value), previous = pitchedNoteAt(state, trackIndex, barIndex, step);
  const track = state.tracks[trackIndex], bar = track.bars[barIndex], lengths = track.durations[barIndex], at = barIndex * 16 + step;
  if (previous) { const owner = previous.bar ?? barIndex, pos = owner * 16 + previous.start; if (pos < at) track.durations[owner][previous.start] = at - pos; }
  let next = (Math.floor(barIndex / GROUP_SIZE) + 1) * 64;
  for (let pos = at + 1; pos < next; pos++) if (track.bars[Math.floor(pos / 16)][pos % 16] >= 0) {next = pos; break;}
  if (velocity !== null && ![0,1,2].includes(velocity)) throw new Error('音符力度无效');
  track.velocities[barIndex][step] = velocity ?? (bar[step] >= 0 ? track.velocities[barIndex][step] : 1);
  const actual = Math.min(duration, next - at);
  bar[step] = pitch; lengths[step] = actual;
  return { state, start: step, duration: actual, limited: actual !== duration };
}
export function removePitchedNote(value, trackIndex, barIndex, step) {
  const state = validate(value), note = pitchedNoteAt(state, trackIndex, barIndex, step);
  if (note) { const owner = note.bar ?? barIndex; state.tracks[trackIndex].bars[owner][note.start] = -1; state.tracks[trackIndex].durations[owner][note.start] = 1; state.tracks[trackIndex].velocities[owner][note.start] = 1; }
  return state;
}
// Clearing a bar removes every whole note that intersects it, including incoming holds.
export function clearBar(value, trackIndex, barIndex) {
  let state = validate(value);
  if (!Number.isInteger(trackIndex) || trackIndex < 0 || trackIndex > 3 || !Number.isInteger(barIndex) || barIndex < 0 || barIndex >= state.barCount) throw new Error('小节位置无效');
  if (LONG_NOTE_TRACKS.includes(trackIndex)) for (let step = 0; step < 16; step++) state = removePitchedNote(state,trackIndex,barIndex,step);
  else if(trackIndex===1){for(let beat=0;beat<4;beat++){const n=chordAt(state,barIndex,beat);if(n){const t=state.tracks[1];t.bars[n.bar][n.beat]=-1;t.chordVoicings[n.bar][n.beat]=1;t.chordDurations[n.bar][n.beat]=1;}}}
  else {state.tracks[trackIndex].bars[barIndex].fill(trackIndex === 3 ? 0 : -1);if(trackIndex===3)state.tracks[3].drumVelocities[barIndex].fill(13);if(trackIndex===1)state.tracks[1].chordVoicings[barIndex].fill(1);}
  return state;
}
// Keep the melody API for callers that only edit the lead voice.
export function melodyAt(value, barIndex, step) { return pitchedNoteAt(value, 0, barIndex, step); }
export function setMelodyNote(value, barIndex, step, pitch, duration) { return setPitchedNote(value, 0, barIndex, step, pitch, duration); }
export function removeMelodyNote(value, barIndex, step) { return removePitchedNote(value, 0, barIndex, step); }
export function copyBar(value, trackIndex, source, destination) {
  const state = validate(value);
  if (!Number.isInteger(trackIndex) || trackIndex < 0 || trackIndex > 3 || ![source, destination].every(i => Number.isInteger(i) && i >= 0 && i < state.barCount)) throw new Error('复制小节位置无效');
  if(trackIndex===1){
    for(let beat=0;beat<4;beat++){const n=chordAt(state,destination,beat);if(n&&(n.bar!==destination||n.beat+n.duration>4))throw new Error('目标小节有跨小节和弦，请先收短或删除，再复制；作品未改变');}
    const notes=[];for(let beat=0;beat<4;beat++){const n=chordAt(state,source,beat);if(n&&(beat===0||(n.bar===source&&n.beat===beat)))notes.push({...n,at:beat,length:Math.min(4-beat,n.bar*4+n.beat+n.duration-source*4-beat)});}
    let result=clearBar(state,1,destination);for(const n of notes)result=setChord(result,destination,n.at,n.chord,chordInversion(n.expression),chordVelocity(n.expression),n.length);return result;
  }
  if (LONG_NOTE_TRACKS.includes(trackIndex)) {
    // A bar copy may not remove a whole note that also belongs to another bar.
    for(let step=0;step<16;step++){
      const n=pitchedNoteAt(state,trackIndex,destination,step);
      if(n&&(n.bar!==undefined||n.start+n.duration>16))throw new Error('目标小节有跨小节长音，请先在乐句编辑台按小节断开，再复制；作品未改变');
    }
    // Snapshot only the audible part of the source bar, including incoming holds.
    const notes=[];
    for(let step=0;step<16;step++) {const n=pitchedNoteAt(state,trackIndex,source,step);if(n&&(step===0||(n.bar===undefined&&n.start===step))){const owner=n.bar??source,begin=owner*16+n.start;notes.push({step,pitch:n.pitch,duration:Math.min(16-step,begin+n.duration-source*16-step),velocity:state.tracks[trackIndex].velocities[owner][n.start]});}}
    const result=clearBar(state,trackIndex,destination),track=result.tracks[trackIndex];
    for(const n of notes){track.bars[destination][n.step]=n.pitch;track.durations[destination][n.step]=n.duration;track.velocities[destination][n.step]=n.velocity;}
    return validate(result);
  }
  const track = state.tracks[trackIndex]; track.bars[destination] = [...track.bars[source]];
  if(track.chordVoicings)track.chordVoicings[destination]=[...track.chordVoicings[source]];
  if(track.drumVelocities)track.drumVelocities[destination]=[...track.drumVelocities[source]];
  if (track.velocities) track.velocities[destination] = [...track.velocities[source]];
  if (track.durations) track.durations[destination] = [...track.durations[source]];
  return state;
}
export function parseBackup(text) {
  if (typeof text !== 'string' || new TextEncoder().encode(text).byteLength > MAX_BACKUP_BYTES) throw new Error('备份文件超过 96 KB');
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
export function chordNotes(row, beat, voiceId, styleId = 'block', transpose = 0, expression = 1, duration = 1) {
  chordStyleInfo(styleId);
  if(!Number.isInteger(duration)||duration<1||duration>4)throw new Error('和弦时长无效');
  if(duration>1){
    const notes=chordNotes(row,beat,voiceId,styleId,transpose,expression),start=beat*4,end=start+duration*4;
    if(styleId==='block'||styleId==='strum-v1'){const last=notes.at(-1);last.points.at(-1).tick=end;if(chordVoiceInfo(voiceId).legacy)last.points.at(-1).volume=last.points[0].volume;return notes;}
    return Array.from({length:duration},(_,i)=>notes.map(n=>({...n,points:n.points.map(p=>({...p,tick:p.tick+i*4}))}))).flat();
  }
  if (!Number.isInteger(row) || !CHORDS[row] || !Number.isInteger(beat) || beat < 0 || beat > 3 || !Number.isInteger(transpose) || Math.abs(transpose)>12) throw new Error('和弦位置或移调无效');
  if(!Number.isInteger(expression)||expression<0||expression>11)throw new Error('和弦转位或力度无效');
  const voice = chordVoiceInfo(voiceId), pitches = voicedPitches(row,chordInversion(expression),transpose), start = beat * 4;
  const notes = styleId === 'block' ? [note(pitches, start, start + 4, 65)] :
    styleId === 'strum-v1' ? pitches.map((_,i) => note(pitches.slice(0,i+1), start + i * .5, start + (i === pitches.length-1 ? 4 : (i+1)*.5), 65)) :
    styleId === 'staccato-v1' ? [0,2].map(offset => note(pitches, start + offset, start + offset + 1, 65)) :
    styleId === 'arpeggio-rise-v1' && pitches.length === 3 ? [0,1,2].map((p, i) => note([pitches[p]], start + [0,2,3][i], start + [2,3,4][i], 65)) :
    (pitches.length===4?[0,1,2,3]:[0,1,2,1]).map((index, step) => note([pitches[index]], start + step, start + step + 1, 65));
  if (!voice.legacy) notes.forEach(n => n.points.forEach(point => { point.volume = voice.noteVolume; }));
  if(chordVelocity(expression)!==1)notes.forEach(n=>{n.yinyaGain=[.55,1,1.35][chordVelocity(expression)];});
  notes.forEach(n=>{if(n.pitches.length>3)n.yinyaChordGain=Math.sqrt(3/n.pitches.length);});
  return notes;
}
export function songJSON(value) {
  const s = validate(value);
  const dynamics = s.tracks.map((_,index)=>s.sections.some(part=>part.volumes[index]!==part.endVolumes[index])?s.sections.map(part=>[part.volumes[index]/100,part.endVolumes[index]/100]):null);
  const channels = s.tracks.map((t,index)=>{
    const ids = dynamics[index] ? s.sections.map((_,section)=>index===3?sectionDrumKit(s,section*4):sectionVoice(s,index,section*4)) : index === 3 ? [...new Set(s.sections.map((_,i)=>sectionDrumKit(s,i*4)))] : [...new Set(Array.from({length:s.barCount},(_,bar)=>sectionVoice(s,index,bar)))];
    const instruments = ids.map(id => index===0 ? melodyInstrument(id,t.volume) : index===1 ? chordInstrument(id,t.volume) : index===2 ? bassInstrument(id,t.volume) : drumInstrument(id,t.volume));
    const patterns=t.bars.map((bar,barIndex)=>{
      const id=index===3?sectionDrumKit(s,barIndex):sectionVoice(s,index,barIndex),gain=sectionGain(s,index,barIndex),part=s.sections[Math.floor(barIndex/4)],changing=part.volumes[index]!==part.endVolumes[index];
      const notes=bar.flatMap((n,step)=>{
        const held=LONG_NOTE_TRACKS.includes(index)&&step===0?pitchedNoteAt(s,index,barIndex,0):null;
        const incoming=held?.bar!==undefined;
        if(!s.sections[Math.floor(barIndex/GROUP_SIZE)].enabled[index]||(!changing&&gain===0)||(n<0&&!incoming)||(index===3&&n===0))return [];
        if(index===3){const result=note([0,4,8].filter((_,bit)=>n&(1<<bit)),step,step+1,70);if(id!=="original")result.points[1].volume=70;const code=t.drumVelocities[barIndex][step];if(code!==13||id!=='original')result.yinyaDrumGains=Object.fromEntries([0,1,2].filter(lane=>n&(1<<lane)).map(lane=>[lane*4,drumKitInfo(id).gains[lane]*[.55,1,1.35][drumLevel(code,lane)]]));return [result];}
        if(index===1)return []; // Chord fragments are expanded below from their owning onset.
        const owner=incoming?held.bar:barIndex, onset=incoming?held.start:step;
        const remaining=incoming?owner*16+onset+held.duration-barIndex*16:t.durations[barIndex][step];
        const result=note([PITCH_VALUES[incoming?held.pitch:n]+(index===2?24:48)+s.transpose],step,Math.min(16,step+remaining));
        if(incoming)result.continuesLastPattern=true;
        const voice=index===0?voiceInfo(id):bassVoiceInfo(id);
        // New long vintage notes sustain at a steady level. Keep all pre-v12 notes exact.
        if(voice.legacy&&(t.durations[owner][onset]>8||onset+t.durations[owner][onset]>16))result.points.forEach(point=>{point.volume=90;});
        if(!voice.legacy)result.points.forEach(point=>{point.volume=voice.noteVolume??90;});
        const level=t.velocities[owner][onset];if(level!==1)result.yinyaGain=[.55,1,1.35][level];
        return [result];
      });
      if(index===1&&s.sections[Math.floor(barIndex/4)].enabled[1]&&(changing||gain!==0)){
        const begin=Math.floor(barIndex/4)*4;
        for(let b=begin;b<=barIndex;b++)for(let beat=0;beat<4;beat++)if(t.bars[b][beat]>=0){
          for(const n of chordNotes(t.bars[b][beat],beat,id,sectionChordStyle(s,b),s.transpose,t.chordVoicings[b][beat],t.chordDurations[b][beat])){
            const left=b*16+n.points[0].tick,right=b*16+n.points.at(-1).tick,from=Math.max(left,barIndex*16),to=Math.min(right,(barIndex+1)*16);
            if(from>=to)continue;
            // Clip a held note at a pattern edge; the synth joins matching pitches without reattack.
            notes.push({...n,...(from>left?{continuesLastPattern:true}:{}),points:[{...n.points[0],tick:from-barIndex*16},{...n.points.at(-1),tick:to-barIndex*16,...(to<right?{volume:n.points[0].volume}:{})}]});
          }
        }
      }
      if(!changing&&gain!==1)notes.forEach(n=>{n.yinyaSectionGain=gain;});
      return {...(ids.length>1?{instruments:[dynamics[index]?Math.floor(barIndex/4)+1:ids.indexOf(id)+1]}:{}),notes};
    });
    return {type:index===3?'drum':'pitch',instruments,patterns,sequence:Array.from({length:s.barCount},(_,i)=>i+1)};
  });
  return {format:'BeepBox',version:9,scale:s.scale==='major'?'normal :)':s.scale==='minor'?'normal :(':'easy :)',key:'C',introBars:0,loopBars:s.barCount,beatsPerBar:4,ticksPerBeat:4,beatsPerMinute:s.tempo,channels,...(dynamics.some(Boolean)?{yinyaDynamics:dynamics}:{})};
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
    if(track.chordDurations)track.chordDurations.splice(at,0,...(duplicate?track.chordDurations.slice(after*4,at).map(bar=>[...bar]):Array.from({length:4},()=>Array(4).fill(1))));
    if(track.chordVoicings)track.chordVoicings.splice(at,0,...(duplicate?track.chordVoicings.slice(after*4,at).map(bar=>[...bar]):Array.from({length:4},()=>Array(4).fill(1))));
    if(track.drumVelocities)track.drumVelocities.splice(at,0,...(duplicate?track.drumVelocities.slice(after*4,at).map(bar=>[...bar]):Array.from({length:4},()=>Array(16).fill(13))));
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
  state.tracks.forEach(track => { move(track.bars, index * GROUP_SIZE, GROUP_SIZE, destination * GROUP_SIZE); if(track.drumVelocities)move(track.drumVelocities,index*4,4,destination*4);if(track.chordDurations)move(track.chordDurations,index*4,4,destination*4);if(track.chordVoicings)move(track.chordVoicings,index*4,4,destination*4); if (track.velocities) move(track.velocities, index * GROUP_SIZE, GROUP_SIZE, destination * GROUP_SIZE); if (track.durations) move(track.durations, index * GROUP_SIZE, GROUP_SIZE, destination * GROUP_SIZE); });
  return state;
}
export function deleteSection(value, index) {
  const state = validate(value); checkSection(state, index); if (state.sections.length === 1) throw new Error('至少保留一个段落');
  state.sections.splice(index, 1); state.tracks.forEach(track => { track.bars.splice(index * GROUP_SIZE, GROUP_SIZE);track.drumVelocities?.splice(index*4,4);track.chordVoicings?.splice(index*4,4);track.chordDurations?.splice(index*4,4); track.velocities?.splice(index * GROUP_SIZE, GROUP_SIZE); track.durations?.splice(index * GROUP_SIZE, GROUP_SIZE); });
  state.barCount -= GROUP_SIZE; return state;
}
export function trackAudibleAt(state, track, bar) { return state.tracks[track].enabled && state.tracks[track].volume > 0 && state.sections[Math.floor(bar / GROUP_SIZE)].enabled[track] && Math.max(state.sections[Math.floor(bar/GROUP_SIZE)].volumes[track],state.sections[Math.floor(bar/GROUP_SIZE)].endVolumes[track])>0; }
export function hasAudibleNotes(state, start = 0, end = state.barCount, indices = [0, 1, 2, 3]) {
  return indices.some(index => state.tracks[index].bars.slice(start, end).some((bar, offset) => trackAudibleAt(state, index, start + offset) && (bar.some(n => index === 3 ? n !== 0 : n >= 0) || (index===1&&chordAt(state,start+offset,0)) || (LONG_NOTE_TRACKS.includes(index) && pitchedNoteAt(state,index,start+offset,0)))));
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
  state.tracks[track].velocities[note.bar ?? bar][note.start] = level; return state;
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
  state.sections[index].volumes[track]=volume;state.sections[index].endVolumes[track]=volume;return state;
}
export function setSectionDynamics(value,index,track,start,end) {
  const state=validate(value);checkSection(state,index);
  if(!Number.isInteger(track)||track<0||track>3||![start,end].every(n=>Number.isInteger(n)&&n>=0&&n<=100))throw new Error('起止音量请保持在 0–100%');
  state.sections[index].volumes[track]=start;state.sections[index].endVolumes[track]=end;return state;
}
export function steadySection(value,index) {
  const state=validate(value);checkSection(state,index);state.sections[index].endVolumes=[...state.sections[index].volumes];return state;
}
export function resetSectionOrchestration(value,index) {
  const state=validate(value);checkSection(state,index);copyOrchestration(state.sections[index],section('s1'));return state;
}
export function applyDrumPattern(value, start, count, id, fill = false) {
  const state = validate(value);
  if (!Number.isInteger(start) || ![1,4].includes(count) || typeof fill !== 'boolean' || start < 0 || start + count > state.barCount || (count === 4 && start % 4)) throw new Error('鼓点应用范围无效');
  for (let i = 0; i < count; i++) {state.tracks[3].bars[start+i] = drumPattern(id,i,fill && i === count-1);state.tracks[3].drumVelocities[start+i].fill(13);}
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
  const layer=state.tracks[track],notes=[];
  for(let bar=Math.floor(start/4)*4;bar<start+count;bar++)for(let step=0;step<16;step++)if(layer.bars[bar][step]>=0&&bar*16+step+layer.durations[bar][step]>start*16)notes.push({bar,step,pitch:pitchId(PITCH_VALUES[layer.bars[bar][step]]+direction*12)});
  if(!notes.length)throw new Error('当前范围没有音符');
  for(const n of notes)layer.bars[n.bar][n.step]=n.pitch;return state;
}
export function applyProgression(value,start,id) {
  const state=validate(value),progression=PROGRESSIONS.find(p=>p.id===id);
  if(!progression||!Number.isInteger(start)||start<0||start%4||start+4>state.barCount)throw new Error('和弦走向或应用范围无效');
  if((state.scale==='minor'?'minor':'major')!==progression.mode)throw new Error('请选择与当前音阶匹配的和弦走向');
  for(let i=0;i<4;i++){state.tracks[1].bars[start+i]=[progression.chords[i],-1,progression.chords[i],-1];state.tracks[1].chordVoicings[start+i].fill(1);state.tracks[1].chordDurations[start+i].fill(1);}return state;
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
  state.sections.forEach(p=>{p.endVolumes=[...p.volumes];});return validate(state);
}

// Original sustained phrases, contained in their own four-bar sections.
export function sustainPreset(id='hold-dawn') {
  const state=orchestrationPreset(id==='hold-tide'?'orchestra-night':'orchestra-day');
  state.title=id==='hold-tide'?'潮汐低语':'长风入晨';state.tempo=id==='hold-tide'?84:96;
  for(const index of [0,2]){const t=state.tracks[index];for(const field of ['bars','durations','velocities'])for(const bar of t[field])bar.fill(field==='bars'?-1:1);}
  const motifs=id==='hold-tide'?[[0,12,12],[12,7,20],[36,9,8],[44,7,20]]:[[0,0,8],[8,4,24],[32,7,8],[40,4,8],[48,2,16]];
  for(let group=0;group<4;group++){
    const offset=group===2?12:0;
    for(const [step,pitch,duration] of motifs){const t=state.tracks[0],bar=group*4+Math.floor(step/16),at=step%16;t.bars[bar][at]=pitchId(pitch+offset);t.durations[bar][at]=duration;}
    for(const [step,pitch] of [[0,0],[24,7],[48,0]]){const t=state.tracks[2],bar=group*4+Math.floor(step/16),at=step%16;t.bars[bar][at]=pitchId(pitch);t.durations[bar][at]=step===48?16:24;}
  }
  return validate(state);
}

export function dynamicPreset(id='dynamic-rise') {
  let state=sustainPreset(id==='dynamic-dusk'?'hold-tide':'hold-dawn');
  state.title=id==='dynamic-dusk'?'晚风收声':'微光渐起';
  for(let section=0;section<4;section++)for(let track=0;track<4;track++){
    const level=state.sections[section].volumes[track];
    const start=section===0?0:section===1?Math.round(level*.55):level;
    const end=section===3?0:level;
    state=setSectionDynamics(state,section,track,start,end);
  }
  return state;
}

function harmonyPreset(id){
  const night=id==='harmony-breeze';let state=tonalPreset(night?'minor':'major');state.title=night?'晚风和声':'和光流转';state.chordVoice=night?'chord-acoustic-guitar-v1':'chord-piano-v1';state.chordStyle=night?'strum-v1':'block';state.sections.forEach(p=>p.chordStyle='inherit');
  for(let b=4;b<12;b++){const bar=state.tracks[1].bars[b];bar[1]=bar[0];bar[3]=bar[0];}
  for(let start=0;start<16;start+=4){const notes=[];for(let beat=0;beat<16;beat++){const chord=state.tracks[1].bars[start+Math.floor(beat/4)][beat%4];if(chord>=0)notes.push({chord,inversion:0,beat});}const inv=smoothInversions(notes);notes.forEach((n,i)=>{state.tracks[1].chordVoicings[start+Math.floor(n.beat/4)][n.beat%4]=chordExpression(inv[i],n.beat%4===0?2:n.beat%2===0?1:0);});}
  return validate(state);
}
