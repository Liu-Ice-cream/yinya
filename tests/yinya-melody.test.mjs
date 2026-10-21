import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {blank,preset,validate,songJSON,CHORDS,setPitchedNote,setScale,setTranspose,resize,copyBar,copyGroup,insertSection,moveSection,encode,decode,parseBackup,MAX_BACKUP_BYTES,wavBuffer} from '../yinya/model.js';
import {MELODY_STYLES,MELODY_DENSITIES,melodyOptions,melodyTarget,melodyHarmonyInfo,generateMelody} from '../yinya/melody.js';
import {PITCH_VALUES,scaleInfo} from '../yinya/theory.js';
import {harmonicRuns,generateAccompaniment} from '../yinya/accompaniment.js';
import {encodeMp3} from '../yinya/mp3.js';
import {Mp3Encoder} from '../website/yinya/vendor/lamejs.js';
import {MPEGDecoder} from 'mpg123-decoder';
await build({stdin:{contents:'export {AudioRenderer,sectionState} from "./yinya/render.js"; export {PreviewPlayer} from "./yinya/preview.js";',resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',outfile:'build/yinya-melody-test.mjs'});
const {AudioRenderer,sectionState,PreviewPlayer}=await import('../build/yinya-melody-test.mjs');
globalThis.requestAnimationFrame=callback=>setImmediate(callback);
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const audible=a=>a.some(n=>Math.abs(n)>.001);
const count=s=>s.tracks[0].bars.flat().filter(n=>n>=0).length;
const difference=(a,b)=>{assert.equal(a.length,b.length);let sum=0;for(let i=0;i<a.length;i++)sum+=(a[i]-b[i])**2;return Math.sqrt(sum/a.length);};
async function render(s,rate=44100,ending='natural'){const r=new AudioRenderer();for await(const _ of r.generate(s,rate,ending)){}return r;}
function context(){const sources=[],buffers=[];return {sources,buffers,sampleRate:44100,currentTime:0,destination:{},resume:()=>Promise.resolve(),close:()=>Promise.resolve(),createBuffer(channels,length,rate){const b={duration:length/rate,samples:[],copyToChannel(data,index){this.samples[index]=data;}};buffers.push(b);return b;},createBufferSource(){const s={stopped:false,connect(){},disconnect(){},start(){},stop(){this.stopped=true;}};sources.push(s);return s;},createGain(){return {connect(){},disconnect(){},gain:{setValueAtTime(){},linearRampToValueAtTime(){}}};}};}
function notes(s,start=0,end=s.barCount){return s.tracks[0].bars.slice(start,end).flatMap((bar,index)=>bar.flatMap((id,step)=>id<0?[]:[{bar:index+start,step,id,pitch:PITCH_VALUES[id],length:s.tracks[0].durations[index+start][step],velocity:s.tracks[0].velocities[index+start][step]}]));}

test('three melody styles and densities are immutable with valid nonoverlapping original rhythms',()=>{
  assert.equal(MELODY_STYLES.length,3);assert.equal(MELODY_DENSITIES.length,3);assert.throws(()=>MELODY_STYLES[0].contours[0].push(9));
  for(const style of MELODY_STYLES)for(const patterns of Object.values(style.rhythms))for(const pattern of patterns){let end=0;for(const [step,length] of pattern){assert.ok(step>=end);assert.ok([1,2,4,8].includes(length));end=step+length;assert.ok(end<=16);}}
  assert.deepEqual(melodyTarget(4,'answer'),{start:6,end:8});assert.equal(melodyOptions().variant,0);
});
test('all style, density, scale and range combinations generate valid notes while protecting accompaniment and outside sections',()=>{
  for(const style of MELODY_STYLES)for(const density of MELODY_DENSITIES)for(const scale of ['pentatonic','major','minor'])for(const range of ['low','high','all'])for(const variant of [0,1]){
    const s=setScale(preset('tone-day'),scale),before=structuredClone(s),next=generateMelody(s,4,{style:style.id,density:density.id,range,variant});
    assert.deepEqual(validate(next),next);assert.deepEqual(next.tracks.slice(1),s.tracks.slice(1));assert.deepEqual(next.tracks[0].bars.slice(0,4),s.tracks[0].bars.slice(0,4));assert.deepEqual(next.tracks[0].bars.slice(8),s.tracks[0].bars.slice(8));
    for(const n of notes(next,4,8)){assert.ok(scaleInfo(scale).intervals.includes(n.pitch%12));assert.ok(range==='all'||(range==='low'?n.pitch<=12:n.pitch>=12));}
    for(const key of ['voice','chordVoice','bassVoice','chordStyle','tempo','scale','transpose','title','version'])assert.equal(next[key],s[key]);assert.deepEqual(s,before);
  }
});
test('all nineteen chords prefer shared scale tones on beats and end the generated phrase on a complete cadence note',()=>{
  for(let chord=0;chord<19;chord++)for(const scale of ['pentatonic','major','minor'])for(const range of ['low','high','all']){
    const s=setScale(blank(),scale);s.tracks[1].bars.forEach(bar=>bar.fill(chord));const next=generateMelody(s,0,{style:'bounce-v1',density:'dense',range});
    const shared=CHORDS[chord].filter(p=>scaleInfo(scale).intervals.includes(p%12));
    for(const n of notes(next))if(n.step%4===0){assert.ok(scaleInfo(scale).intervals.includes(n.pitch%12));if(shared.length)assert.ok(shared.some(p=>p%12===n.pitch%12),`${chord} ${scale} ${range}`);else assert.ok(melodyHarmonyInfo(next,0,4).unmatchedChords.includes(chord));}
    const last=notes(next).at(-1);assert.equal(last.bar,3);assert.equal(last.step,12);assert.equal(last.length,4);
  }
});
test('no-chord and leading-rest passages use the selected scale without writing new harmony',()=>{
  const blankSource=blank(),next=generateMelody(blankSource,0);assert.ok(count(next)>0);assert.deepEqual(next.tracks[1],blankSource.tracks[1]);
  const s=blank();s.tracks[1].bars[0]=[-1,0,1,-1];const generated=generateMelody(s,0,{density:'sparse'});
  for(const n of notes(generated,0,1)){const nextChange=harmonicRuns(s.tracks[1].bars[0]).find(run=>run.start>n.step)?.start??16;assert.ok(n.step+n.length<=nextChange);}
});
test('borrowed chords without shared scale tones are reported explicitly while scale and backing remain intact',()=>{
  const s=setScale(blank(),'minor');s.tracks[1].bars[0]=[9,-1,9,-1];const before=structuredClone(s),next=generateMelody(s,0);
  assert.deepEqual(melodyHarmonyInfo(next,0,4),{emptyBars:3,unmatchedChords:[9]});assert.ok(notes(next).every(n=>scaleInfo('minor').intervals.includes(n.pitch%12)));assert.deepEqual(next.tracks[1],s.tracks[1]);assert.deepEqual(s,before);assert.throws(()=>melodyHarmonyInfo(s,0,5));
});
test('density increases note counts for each style while repeated motifs keep corresponding bar rhythms',()=>{
  for(const style of MELODY_STYLES)for(const variant of [0,1,2]){const all=MELODY_DENSITIES.map(d=>generateMelody(blank(),0,{style:style.id,density:d.id,variant}));assert.ok(count(all[0])<count(all[1]));assert.ok(count(all[1])<count(all[2]));
    for(const s of all)assert.deepEqual(notes(s,0,1).map(n=>[n.step,n.length]),notes(s,2,3).map(n=>[n.step,n.length]));
  }
});
test('candidate variants are deterministic, independent and diverse without using global randomness',()=>{
  const s=preset('tone-dusk'),before=structuredClone(s),random=Math.random;Math.random=()=>{throw new Error('data generation must not use audio randomness');};
  try{for(const mode of ['compose','answer','repitch']){const variants=[];for(let variant=0;variant<5;variant++){const a=generateMelody(s,4,{mode,variant}),b=generateMelody(s,4,{mode,variant});assert.deepEqual(a,b);variants.push(JSON.stringify(a.tracks[0]));}assert.ok(new Set(variants).size>=2);}}finally{Math.random=random;}assert.deepEqual(s,before);
});
test('answer mode retains the entire original first half including chromatic notes, high pitches, lengths and velocities',()=>{
  let s=blank('',8);s=setPitchedNote(s,0,4,0,8,8,0).state;s=setPitchedNote(s,0,5,4,24,8,2).state;s.tracks[1].bars[6]=[1,-1,1,-1];
  const before=structuredClone(s),next=generateMelody(s,4,{mode:'answer',range:'low',style:'bounce-v1',density:'dense'});
  for(const field of ['bars','durations','velocities'])assert.deepEqual(next.tracks[0][field].slice(4,6),s.tracks[0][field].slice(4,6));assert.ok(notes(next,6,8).length>0);assert.ok(notes(next,6,8).every(n=>n.pitch<=12));assert.deepEqual(s,before);
});
test('empty first halves and empty repitch sources fail atomically with actionable messages',()=>{
  const s=setPitchedNote(blank(),0,2,0,3,4).state,before=structuredClone(s);assert.throws(()=>generateMelody(s,0,{mode:'answer'}),/前两小节/);assert.deepEqual(s,before);assert.throws(()=>generateMelody(blank(),0,{mode:'repitch'}),/没有旋律/);assert.ok(count(generateMelody(blank(),0))>0);
});
test('repitch preserves all onset positions, rests, lengths and individual velocities exactly',()=>{
  const s=preset('groove-pixel'),before=structuredClone(s),next=generateMelody(s,4,{mode:'repitch',style:'gentle-v1',range:'high'});
  assert.deepEqual(next.tracks[0].durations,s.tracks[0].durations);assert.deepEqual(next.tracks[0].velocities,s.tracks[0].velocities);
  for(let bar=0;bar<s.barCount;bar++)assert.deepEqual(next.tracks[0].bars[bar].map(n=>n<0),s.tracks[0].bars[bar].map(n=>n<0));assert.ok(notes(next,4,8).every(n=>n.pitch>=12));assert.deepEqual(next.tracks.slice(1),s.tracks.slice(1));assert.deepEqual(s,before);
});
test('density controls do not alter the rhythm-preserving mode and rest-only bars remain rest-only',()=>{
  const s=preset('tone-day');for(const field of ['bars','durations','velocities'])s.tracks[0][field][5].fill(field==='bars'?-1:1);
  const sparse=generateMelody(s,4,{mode:'repitch',density:'sparse'}),dense=generateMelody(s,4,{mode:'repitch',density:'dense'});assert.deepEqual(sparse,dense);assert.ok(sparse.tracks[0].bars[5].every(n=>n===-1));
});
test('local melody enabling never changes accompaniment masks, global mute, volume or other section metadata',()=>{
  const s=preset('tone-day');s.tracks[0].enabled=false;s.tracks[0].volume=0;s.sections[1].enabled=[false,false,true,false];
  for(const mode of ['compose','answer','repitch']){const keep=generateMelody(s,4,{mode,enable:false});assert.deepEqual(keep.sections,s.sections);const next=generateMelody(s,4,{mode});assert.deepEqual(next.sections[1].enabled,[true,false,true,false]);assert.equal(next.tracks[0].enabled,false);assert.equal(next.tracks[0].volume,0);for(const i of [0,2,3])assert.deepEqual(next.sections[i],s.sections[i]);assert.equal(next.sections[1].chordStyle,s.sections[1].chordStyle);assert.equal(next.sections[1].id,s.sections[1].id);assert.equal(next.sections[1].name,s.sections[1].name);}
});
test('whole-song transposition shifts generated notes once while preserving the same relative melody and drum data',()=>{
  const s=preset('tone-day'),base=generateMelody(s,4);
  for(let shift=-12;shift<=12;shift++){const next=generateMelody(setTranspose(s,shift),4);assert.deepEqual(next.tracks[0],base.tracks[0]);assert.deepEqual(next.tracks[3],s.tracks[3]);assert.equal(next.transpose,shift);const a=songJSON(base),b=songJSON(next);for(let bar=4;bar<8;bar++)assert.deepEqual(b.channels[0].patterns[bar].notes.map(n=>n.pitches),a.channels[0].patterns[bar].notes.map(n=>n.pitches.map(p=>p+shift)));}
});
test('invalid melody options and four-bar ranges leave the source project unchanged',()=>{
  const s=preset('tone-day'),before=structuredClone(s);for(const options of [null,[],{mode:'other'},{style:'other'},{density:'other'},{range:'other'},{variant:-1},{variant:1.5},{variant:2**32},{enable:'yes'}])assert.throws(()=>generateMelody(s,0,options));for(const start of [-4,1,14,16,.5])assert.throws(()=>generateMelody(s,start));assert.deepEqual(s,before);assert.equal(generateMelody(s,0,{variant:0xffffffff}).version,12);
});
test('frozen v0.10.0 accompaniment projects retain exact canonical audio conversion without regeneration',async()=>{
  const fixture=JSON.parse(await readFile(new URL('./fixtures/yinya-v0100-compat.json',import.meta.url)));assert.equal(fixture.cases.length,3);for(const {state,songSha256} of fixture.cases){assert.deepEqual(validate(state).tracks,state.tracks);assert.equal(createHash('sha256').update(JSON.stringify(canonical(songJSON(state)))).digest('hex'),songSha256);}
});
test('generated 32-bar music shares and backs up as ordinary current-schema notes within existing limits',()=>{
  let s=resize(preset('tone-day'),32,'repeat');for(let start=0;start<32;start+=4)s=generateMelody(s,start,{style:'bounce-v1',density:'dense',range:'all',variant:start});s.title='音芽🌱'.repeat(10);s.sections.forEach(p=>p.name='段落🌱'.repeat(6));
  assert.equal(s.version,12);assert.deepEqual(Object.keys(s).sort(),Object.keys(validate(preset('tone-day'))).sort());assert.ok(Buffer.byteLength(JSON.stringify(s,null,2))<MAX_BACKUP_BYTES);assert.ok(encode(s).length<20000);assert.deepEqual(decode(encode(s)),s);assert.deepEqual(parseBackup(JSON.stringify(s,null,2)),s);
});
test('bar and section copies, duplication, movement and resizing retain generated melody independently',()=>{
  const s=generateMelody(preset('tone-day'),4,{style:'bounce-v1',range:'high'}),before=structuredClone(s),copied=copyGroup(s,4,0);for(const field of ['bars','durations','velocities'])assert.deepEqual(copied.tracks[0][field].slice(0,4),s.tracks[0][field].slice(4,8));assert.deepEqual(copyBar(s,0,4,0).tracks[0].bars[0],s.tracks[0].bars[4]);assert.deepEqual(moveSection(moveSection(s,0,3),3,0),s);assert.deepEqual(insertSection(s,1,true).tracks[0].bars.slice(8,12),s.tracks[0].bars.slice(4,8));assert.deepEqual(resize(s,32,'repeat').tracks[0].bars.slice(16),s.tracks[0].bars);copied.tracks[0].bars[0][0]=0;assert.deepEqual(s,before);
});
test('generated four-track preview and export match stereo PCM with controlled phases at both device rates',async()=>{
  const seeded=()=>{let n=0x7132;return()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return(n+.5)/4294967296;};};
  for(const [rate,shift] of [[44100,-12],[48000,12]]){let s=generateAccompaniment(preset('tone-day'),4,{mode:'ensemble'});s=generateMelody(setTranspose(s,shift),4,{style:'bounce-v1',density:'dense',range:'high'});const audio=context();audio.sampleRate=rate;const player=new PreviewPlayer(()=>audio),random=Math.random;await render(sectionState(s,4),rate);
    try{Math.random=seeded();assert.equal(await player.playSection(s,4),true);Math.random=seeded();const expected=await render(sectionState(s,4),rate);assert.ok(difference(audio.buffers[0].samples[0],expected.outputSamplesL)<1e-6);assert.ok(difference(audio.buffers[0].samples[1],expected.outputSamplesR)<1e-6);}finally{Math.random=random;player.dispose();}
  }
});
test('pending auditions snapshot generated notes and only the latest candidate can start; stop prevents late sound',async()=>{
  const source=generateMelody(preset('tone-day'),4),candidate=generateMelody(source,4,{variant:1}),audio=context(),ready=[];candidate.voice='triangle';candidate.tracks.forEach((t,i)=>t.enabled=i===0);const expected=structuredClone(candidate);audio.resume=()=>new Promise(resolve=>ready.push(resolve));const player=new PreviewPlayer(()=>audio);
  const a=player.playSection(source,4),b=player.playSection(candidate,4);candidate.tracks[0].volume=0;ready.forEach(resolve=>resolve());assert.deepEqual(await Promise.all([a,b]),[false,true]);assert.equal(audio.sources.length,1);const ref=await render(sectionState(expected,4));assert.ok(difference(audio.buffers[0].samples[0],ref.outputSamplesL)<1e-6);
  const canceled=player.playSection(source,4);player.stop();ready.at(-1)();assert.equal(await canceled,false);assert.equal(audio.sources.length,1);player.dispose();
});
test('generated melody respects full silence without opening audio and remains audible for every voice at tempo/range limits',async()=>{
  const muted=generateMelody(preset('tone-day'),4);muted.sections[1].enabled.fill(false);const silent=new PreviewPlayer(()=>{throw new Error('must not open');});assert.equal(await silent.playSection(muted,4),false);silent.dispose();
  for(const voice of ['triangle','rounded','square','piano-v1','electric-piano-v1','acoustic-guitar-v1'])for(const [tempo,range,shift,rate] of [[60,'low',-12,44100],[180,'high',12,48000]]){const s=generateMelody(blank(),0,{style:'bright-v1',density:'dense',range});s.voice=voice;s.tempo=tempo;s.transpose=shift;const a=await render(s,rate);assert.ok(audible(a.outputSamplesL));assert.ok(a.outputSamplesL.every(n=>Number.isFinite(n)&&Math.abs(n)<1));}
});
test('generated 32-bar WAV and independently decoded MP3 retain the final melody and natural release',async()=>{
  let s=resize(preset('tone-day'),32,'repeat');s.tempo=180;s.transpose=12;for(let start=0;start<32;start+=4)s=generateMelody(s,start,{style:'bounce-v1',density:'dense',range:'high',variant:start});const natural=await render(s),loop=await render(s,44100,'loop');assert.ok(natural.outputSamplesL.length>loop.outputSamplesL.length);assert.ok(Math.abs(loop.outputSamplesL.length-32*240/180*44100)<2);assert.ok(audible(natural.outputSamplesL.subarray(-44100)));assert.ok(natural.outputSamplesL.every(Number.isFinite));
  const wav=new DataView(wavBuffer(natural.outputSamplesL,natural.outputSamplesR,44100));assert.equal(wav.getUint32(40,true),natural.outputSamplesL.length*4);const decoder=new MPEGDecoder();await decoder.ready;try{const decoded=decoder.decode(encodeMp3(natural.outputSamplesL,natural.outputSamplesR,Mp3Encoder));assert.deepEqual(decoded.errors,[]);assert.equal(decoded.channelData.length,2);assert.ok(audible(decoded.channelData[0].subarray(-44100)));assert.ok(decoded.samplesDecoded>=natural.outputSamplesL.length&&decoded.samplesDecoded-natural.outputSamplesL.length<2304);}finally{decoder.free();}
  const canceled=new AudioRenderer();for await(const _ of canceled.generate(s)){canceled.canceled=true;}assert.equal(canceled.outputSamplesL,null);
});
