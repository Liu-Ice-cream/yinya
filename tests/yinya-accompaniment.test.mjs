import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {blank,preset,validate,songJSON,CHORDS,setPitchedNote,setScale,setTranspose,resize,copyGroup,insertSection,moveSection,encode,decode,parseBackup,MAX_BACKUP_BYTES,wavBuffer,sectionChordStyle} from '../yinya/model.js';
import {BASS_PATTERNS,ACCOMPANIMENT_STYLES,accompanimentOptions,harmonicRuns,bassBar,generateAccompaniment} from '../yinya/accompaniment.js';
import {PITCH_VALUES} from '../yinya/theory.js';
import {encodeMp3} from '../yinya/mp3.js';
import {Mp3Encoder} from '../website/yinya/vendor/lamejs.js';
import {MPEGDecoder} from 'mpg123-decoder';
await build({stdin:{contents:'export {AudioRenderer,sectionState,phraseState} from "./yinya/render.js"; export {PreviewPlayer} from "./yinya/preview.js";',resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',outfile:'build/yinya-accompaniment-test.mjs'});
const {AudioRenderer,sectionState,phraseState,PreviewPlayer}=await import('../build/yinya-accompaniment-test.mjs');
globalThis.requestAnimationFrame=callback=>setImmediate(callback);
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const audible=a=>a.some(n=>Math.abs(n)>.001);
const difference=(a,b)=>{assert.equal(a.length,b.length);let sum=0;for(let i=0;i<a.length;i++)sum+=(a[i]-b[i])**2;return Math.sqrt(sum/a.length);};
async function render(s,rate=44100,ending='natural'){const r=new AudioRenderer();for await(const _ of r.generate(s,rate,ending)){}return r;}
const ensemble=(style='pop-v1',extra={})=>({mode:'ensemble',style,...extra});
function context(){const sources=[],buffers=[];return {sources,buffers,sampleRate:44100,currentTime:0,destination:{},resume:()=>Promise.resolve(),close:()=>Promise.resolve(),createBuffer(channels,length,rate){const b={duration:length/rate,samples:[],copyToChannel(data,index){this.samples[index]=data;}};buffers.push(b);return b;},createBufferSource(){const s={stopped:false,connect(){},disconnect(){},start(){},stop(){this.stopped=true;}};sources.push(s);return s;},createGain(){return {connect(){},disconnect(){},gain:{setValueAtTime(){},linearRampToValueAtTime(){}}};}};}

test('three immutable bass patterns and three arrangement styles normalize to explicit bounded choices',()=>{
  assert.equal(BASS_PATTERNS.length,3);assert.equal(ACCOMPANIMENT_STYLES.length,3);assert.throws(()=>ACCOMPANIMENT_STYLES[0].bass='other');
  assert.deepEqual(accompanimentOptions().targets,[false,true,false]);
  for(const style of ACCOMPANIMENT_STYLES){const o=accompanimentOptions(ensemble(style.id));assert.equal(o.bassPattern,style.bass);assert.deepEqual(o.targets,[true,true,true]);}
});
test('harmonic runs hold sparse chord attacks within a bar and retain leading and entirely blank rests',()=>{
  assert.deepEqual(harmonicRuns([0,-1,1,-1]),[{chord:0,start:0,end:8},{chord:1,start:8,end:16}]);
  assert.deepEqual(harmonicRuns([-1,0,-1,0]),[{chord:0,start:4,end:16}]);assert.deepEqual(harmonicRuns([-1,-1,-1,-1]),[]);
  assert.deepEqual(harmonicRuns([0,0,-1,0]),[{chord:0,start:0,end:16}]);
  assert.throws(()=>harmonicRuns([0,-1,-1,19]));
});
test('all nineteen chord roots generate valid editable bass in all three patterns without crossing a chord change',()=>{
  for(let chord=0;chord<19;chord++)for(const pattern of BASS_PATTERNS){
    const other=(chord+1)%19,row=[-1,chord,other,-1],b=bassBar(row,pattern.id),s=blank();
    for(const field of ['bars','durations','velocities'])s.tracks[2][field][0]=b[field];assert.deepEqual(validate(s).tracks[2],s.tracks[2]);
    assert.ok(b.bars.slice(0,4).every(n=>n===-1));assert.equal(PITCH_VALUES[b.bars[4]],CHORDS[chord][0]%12);assert.equal(PITCH_VALUES[b.bars[8]],CHORDS[other][0]%12);
    for(let step=4;step<16;step++)if(b.bars[step]>=0){const id=step<8?chord:other;assert.ok(CHORDS[id].some(p=>p%12===PITCH_VALUES[b.bars[step]]%12));if(step<8)assert.ok(step+b.durations[step]<=8);}
  }
  const diminished=bassBar([10,-1,-1,-1],'alternate-v1');assert.equal((PITCH_VALUES[diminished.bars[4]]-PITCH_VALUES[diminished.bars[0]])%12,6);
  const shell=bassBar([3,-1,-1,-1],'alternate-v1');assert.ok(CHORDS[3].some(p=>p%12===PITCH_VALUES[shell.bars[4]]%12));
});
test('whole song transposition is applied once to generated bass while all original melodic and chord data remain intact',()=>{
  const base=preset('tone-day');
  for(let shift=-12;shift<=12;shift++){const s=setTranspose(base,shift),before=structuredClone(s),next=generateAccompaniment(s,4);
    assert.equal(next.transpose,shift);assert.deepEqual(next.tracks[0],s.tracks[0]);assert.deepEqual(next.tracks[1],s.tracks[1]);
    const json=songJSON(next);for(let bar=4;bar<8;bar++)for(const n of json.channels[2].patterns[bar].notes){const step=n.points[0].tick;assert.equal(n.pitches[0],24+PITCH_VALUES[next.tracks[2].bars[bar][step]]+shift);}assert.deepEqual(s,before);
  }
});
test('every nonempty target combination changes only chosen data and the selected four bar section',()=>{
  for(const style of ACCOMPANIMENT_STYLES)for(let mask=1;mask<8;mask++){
    const s=preset('tone-dusk'),before=structuredClone(s),targets=[1,2,4].map(bit=>Boolean(mask&bit)),next=generateAccompaniment(s,4,ensemble(style.id,{targets}));
    assert.deepEqual(next.tracks[0],s.tracks[0]);for(let track=1;track<4;track++){if(!targets[track-1])assert.deepEqual(next.tracks[track],s.tracks[track]);assert.deepEqual(next.tracks[track].bars.slice(0,4),s.tracks[track].bars.slice(0,4));assert.deepEqual(next.tracks[track].bars.slice(8),s.tracks[track].bars.slice(8));}
    for(const key of ['voice','bassVoice','chordVoice','chordStyle','tempo','scale','transpose','title','version'])assert.equal(next[key],s[key]);
    for(const i of [0,2,3])assert.deepEqual(next.sections[i],s.sections[i]);assert.equal(next.sections[1].enabled[0],s.sections[1].enabled[0]);assert.equal(next.sections[1].name,s.sections[1].name);assert.equal(next.sections[1].id,s.sections[1].id);assert.deepEqual(s,before);
  }
});
test('existing-harmony styles keep every chord attack and set only the selected section performance',()=>{
  for(const style of ACCOMPANIMENT_STYLES){const s=preset('tone-day'),next=generateAccompaniment(s,8,ensemble(style.id));assert.deepEqual(next.tracks[1],s.tracks[1]);assert.equal(sectionChordStyle(next,8),style.chords);assert.equal(sectionChordStyle(next,0),sectionChordStyle(s,0));}
});
test('style progressions follow major or natural minor and only overwrite chords when explicitly selected',()=>{
  for(const scale of ['pentatonic','major','minor'])for(const style of ACCOMPANIMENT_STYLES){const s=setScale(blank('',8),scale),next=generateAccompaniment(s,4,ensemble(style.id,{harmony:'style'}));assert.ok(next.tracks[1].bars.slice(4).every(b=>b[0]>=0&&b[1]===-1&&b[2]===b[0]&&b[3]===-1));assert.ok(next.tracks[2].bars.slice(4).flat().some(n=>n>=0));assert.deepEqual(next.tracks[0],s.tracks[0]);assert.equal(next.scale,scale);}
  assert.throws(()=>generateAccompaniment(preset('tone-day'),0,ensemble('pop-v1',{harmony:'style',targets:[false,true,true]})));
});
test('local enable option affects only chosen section masks and never unmutes global tracks or changes volume',()=>{
  const s=preset('tone-day');s.sections[1].enabled=[false,false,false,false];s.tracks[2].enabled=false;s.tracks[2].volume=0;
  const keep=generateAccompaniment(s,4,ensemble('pop-v1',{enable:false}));assert.deepEqual(keep.sections[1].enabled,s.sections[1].enabled);
  const next=generateAccompaniment(s,4,ensemble('pop-v1',{targets:[false,true,true]}));assert.deepEqual(next.sections[1].enabled,[false,false,true,true]);assert.equal(next.tracks[2].enabled,false);assert.equal(next.tracks[2].volume,0);assert.deepEqual(s.sections[1].enabled,[false,false,false,false]);
});
test('missing harmony fails atomically for bass while drum-only generation and partial-bar rests remain explicit',()=>{
  let s=setPitchedNote(blank('',8),2,4,0,3,8,2).state;const before=structuredClone(s);
  assert.throws(()=>generateAccompaniment(s,4),/没有和弦/);assert.deepEqual(s,before);
  assert.ok(generateAccompaniment(s,4,ensemble('electro-v1',{targets:[false,false,true]})).tracks[3].bars[4].some(Boolean));
  s.tracks[1].bars[4]=[-1,0,-1,-1];s.tracks[2].bars[5][0]=3;s.tracks[2].durations[5][0]=8;
  const next=generateAccompaniment(s,4);assert.ok(next.tracks[2].bars[4].slice(0,4).every(n=>n===-1));assert.ok(next.tracks[2].bars[5].every(n=>n===-1));assert.ok(next.tracks[2].durations[5].every(n=>n===1));assert.ok(next.tracks[2].velocities[5].every(n=>n===1));
});
test('invalid settings and ranges are rejected without mutating the original work',()=>{
  const s=preset('tone-day'),before=structuredClone(s);
  for(const settings of [null,[],{mode:'other'},{style:'other'},{bassPattern:'other'},{mode:'bass',harmony:'style'},{enable:1},ensemble('pop-v1',{targets:[false,false,false]}),ensemble('pop-v1',{targets:[true,1,false]}),ensemble('pop-v1',{targets:[true,true]}),ensemble('pop-v1',{harmony:'other'})])assert.throws(()=>generateAccompaniment(s,0,settings));
  for(const start of [-4,1,14,16,0.5])assert.throws(()=>generateAccompaniment(s,start));assert.deepEqual(s,before);
});
test('candidate generation is deterministic, independent and produces ordinary current-schema data',()=>{
  const s=preset('tone-day'),before=structuredClone(s),a=generateAccompaniment(s,4,ensemble()),b=generateAccompaniment(s,4,ensemble());assert.deepEqual(a,b);assert.equal(a.version,16);
  a.tracks[2].bars[4][0]=0;assert.deepEqual(s,before);assert.deepEqual(b,generateAccompaniment(s,4,ensemble()));assert.ok(!('accompaniment' in b));
});
test('frozen v0.9.0 major and minor projects retain byte-identical canonical song conversion',async()=>{
  const fixture=JSON.parse(await readFile(new URL('./fixtures/yinya-v090-compat.json',import.meta.url)));
  for(const {state,songSha256} of fixture.cases){assert.deepEqual(validate(state).tracks,state.tracks.map((t,i)=>i===1?{...t,chordVoicings:t.bars.map(()=>Array(4).fill(1)),chordDurations:t.bars.map(()=>Array(4).fill(1))}:i===3?{...t,drumVelocities:t.bars.map(()=>Array(16).fill(13))}:t));assert.equal(createHash('sha256').update(JSON.stringify(canonical(songJSON(state)))).digest('hex'),songSha256);}
});
test('generated notes and local performance persist through sharing, backups, copies and rearrangement within existing limits',()=>{
  let s=resize(setTranspose(preset('tone-dusk'),5),32,'repeat');for(let start=0;start<32;start+=4)s=generateAccompaniment(s,start,ensemble('electro-v1',{harmony:'style'}));s.title='音芽🌱'.repeat(10);s.sections.forEach(p=>p.name='段落🌱'.repeat(6));
  assert.ok(Buffer.byteLength(JSON.stringify(s,null,2))<MAX_BACKUP_BYTES);assert.ok(encode(s).length<20000);assert.deepEqual(decode(encode(s)),s);assert.deepEqual(parseBackup(JSON.stringify(s,null,2)),s);
  const copied=copyGroup(s,0,4);assert.deepEqual(copied.tracks[2].bars.slice(4,8),s.tracks[2].bars.slice(0,4));assert.deepEqual(moveSection(moveSection(s,0,7),7,0),s);
  const short=generateAccompaniment(preset('tone-day'),4);assert.deepEqual(insertSection(short,1,true).tracks[2].velocities.slice(8,12),short.tracks[2].velocities.slice(4,8));
});
test('full section snapshots retain all four timbres, local masks, tonality and notes without altering legacy duet modes',()=>{
  const s=setTranspose(preset('tone-dusk'),-7),before=structuredClone(s),snap=sectionState(s,8);assert.equal(snap.barCount,4);assert.equal(snap.transpose,-7);assert.deepEqual(snap.sections,[s.sections[2]]);
  for(let i=0;i<4;i++){assert.equal(snap.tracks[i].enabled,s.tracks[i].enabled);assert.deepEqual(snap.tracks[i].bars,s.tracks[i].bars.slice(8,12));}
  snap.tracks[2].bars[0][0]=0;assert.deepEqual(s,before);assert.throws(()=>phraseState(s,0,'all'));assert.equal(phraseState(s,0,'duet').tracks[3].enabled,false);assert.throws(()=>sectionState(s,2));
});
test('candidate preview matches full four-track export PCM with controlled random phases at both device rates',async()=>{
  const seededRandom=()=>{let state=0x7919b27;return ()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return (state+.5)/4294967296;};};
  for(const rate of [44100,48000]){
    const s=generateAccompaniment(setTranspose(preset('tone-day'),2),4,ensemble('electro-v1')),audio=context();audio.sampleRate=rate;
    const player=new PreviewPlayer(()=>audio),random=Math.random;
    // Warm shared wave caches before resetting the per-render random phases.
    // This isolated test process restores Math.random even if an assertion fails.
    await render(sectionState(s,4),rate);
    try {
      Math.random=seededRandom();assert.equal(await player.playSection(s,4),true);
      Math.random=seededRandom();const expected=await render(sectionState(s,4),rate);
      for(const [actual,reference] of [[audio.buffers[0].samples[0],expected.outputSamplesL],[audio.buffers[0].samples[1],expected.outputSamplesR]]){
        assert.ok(actual.every(Number.isFinite));assert.ok(audible(actual));assert.ok(difference(actual,reference)<1e-6,'same seed, notes and settings must reproduce preview/export PCM');
      }
    } finally {Math.random=random;player.dispose();}
  }
});
test('rapid original-candidate switching and stop during permission waits only play the latest immutable snapshot',async()=>{
  const original=preset('tone-day'),candidate=generateAccompaniment(original,4,ensemble('electro-v1'));candidate.tracks.forEach((t,i)=>t.enabled=i===2);candidate.bassVoice='square';const expected=structuredClone(candidate),audio=context(),pending=[];audio.resume=()=>new Promise(resolve=>pending.push(resolve));const p=new PreviewPlayer(()=>audio);
  const a=p.playSection(original,4),b=p.playSection(candidate,4);candidate.tracks[2].volume=0;candidate.tracks[3].enabled=false;pending.forEach(resolve=>resolve());assert.deepEqual(await Promise.all([a,b]),[false,true]);assert.equal(audio.sources.length,1);
  const reference=await render(sectionState(expected,4));assert.ok(difference(audio.buffers[0].samples[0],reference.outputSamplesL)<1e-6);
  const canceled=p.playSection(original,4);p.stop();pending.at(-1)();assert.equal(await canceled,false);assert.equal(audio.sources.length,1);assert.ok(audio.sources[0].stopped);p.dispose();
});
test('cancel during section rendering prevents late playback and natural completion restores the preview state',async()=>{
  const audio=context(),p=new PreviewPlayer(()=>audio),s=generateAccompaniment(preset('tone-day'),0,ensemble()),events=[];
  const pending=p.playSection(s,0,flag=>events.push(flag));await new Promise(resolve=>setImmediate(resolve));p.stop();assert.equal(await pending,false);assert.equal(audio.sources.length,0);assert.deepEqual(events,[true,false]);
  assert.equal(await p.playSection(s,0,flag=>events.push(flag)),true);audio.sources[0].onended();assert.equal(p.active,null);assert.equal(events.at(-1),false);p.dispose();
});
test('fully muted sections never open an audio context while bass-only and drums-only sections can audition',async()=>{
  const s=preset('tone-day');s.sections[1].enabled=[false,false,false,false];const p=new PreviewPlayer(()=>{throw new Error('must not open');});assert.equal(await p.playSection(s,4),false);
  for(const track of [2,3]){const next=generateAccompaniment(s,4,ensemble('electro-v1',{targets:[track===1,track===2,track===3]})),audio=context(),player=new PreviewPlayer(()=>audio);assert.equal(await player.playSection(next,4),true);assert.ok(audible(audio.buffers[0].samples[0]));player.dispose();}p.dispose();
});
test('section preview audio failures remain retryable and never change the source project',async()=>{
  const s=preset('tone-day'),before=structuredClone(s),audio=context(),p=new PreviewPlayer(()=>audio);audio.resume=()=>Promise.reject(new Error('blocked'));await assert.rejects(p.playSection(s,4),/blocked/);assert.equal(p.active,null);audio.resume=()=>Promise.resolve();assert.equal(await p.playSection(s,4),true);assert.deepEqual(s,before);p.dispose();
});
test('all three generated styles synthesize finite audible accompaniment at tempo and transposition boundaries',async()=>{
  for(const style of ACCOMPANIMENT_STYLES)for(const [tempo,shift,rate] of [[60,-12,44100],[180,12,48000]]){const base=blank();base.tempo=tempo;base.transpose=shift;base.bassVoice='bass-pluck-v1';base.chordVoice='chord-piano-v1';const s=generateAccompaniment(base,0,ensemble(style.id,{harmony:'style'})),a=await render(s,rate);assert.ok(audible(a.outputSamplesL));assert.ok(a.outputSamplesL.every(n=>Number.isFinite(n)&&Math.abs(n)<1));}
});
test('generated thirty two bar WAV and independently decoded MP3 retain full duration and audible last-section bass and drums',async()=>{
  let s=resize(preset('tone-day'),32,'repeat');s.tempo=180;s.transpose=12;for(let start=0;start<32;start+=4)s=generateAccompaniment(s,start,ensemble('electro-v1',{harmony:'style'}));
  const out=await render(s),loop=await render(s,44100,'loop');assert.ok(Math.abs(loop.outputSamplesL.length-32*240/180*44100)<2);assert.ok(audible(out.outputSamplesL.subarray(-44100)));
  const wav=new DataView(wavBuffer(out.outputSamplesL,out.outputSamplesR,44100));assert.equal(wav.getUint32(40,true),out.outputSamplesL.length*4);
  const decoder=new MPEGDecoder();await decoder.ready;try{const decoded=decoder.decode(encodeMp3(out.outputSamplesL,out.outputSamplesR,Mp3Encoder));assert.deepEqual(decoded.errors,[]);assert.equal(decoded.channelData.length,2);assert.ok(audible(decoded.channelData[0].subarray(-44100)));assert.ok(decoded.samplesDecoded>=out.outputSamplesL.length&&decoded.samplesDecoded-out.outputSamplesL.length<2304);}finally{decoder.free();}
  const canceled=new AudioRenderer();for await(const _ of canceled.generate(s)){canceled.canceled=true;}assert.equal(canceled.outputSamplesL,null);
});
