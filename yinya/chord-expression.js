import {CHORD_PITCHES,chordName,keyName} from './theory.js';

export const INVERSION_NAMES=Object.freeze(['原位','第一转位','第二转位','第三转位']);
export const chordInversion=code=>Math.floor(code/3);
export const chordVelocity=code=>code%3;
export function chordExpression(inversion,velocity){if(!Number.isInteger(inversion)||inversion<0||inversion>3||![0,1,2].includes(velocity))throw new Error('和弦转位或力度无效');return inversion*3+velocity;}
export function voicedPitches(id,inversion=0,transpose=0){
  const chord=CHORD_PITCHES[id];
  if(!Number.isInteger(id)||!chord||!Number.isInteger(inversion)||inversion<0||inversion>=chord.length||!Number.isInteger(transpose)||Math.abs(transpose)>12)throw new Error('和弦或转位超出支持范围');
  return [...chord.slice(inversion),...chord.slice(0,inversion).map(p=>p+12)].map(p=>p+transpose);
}
export function voicedName(state,id,inversion=0){const pitches=voicedPitches(id,inversion,state.transpose);return chordName(state,id)+(inversion?'/'+keyName(pitches[0]):'');}
// Sorted voices are compared at common quantiles when chord sizes differ.
// The first sounding chord anchors the register; no octave or identity changes.
export function connectionCost(a,b){const n=Math.max(a.length,b.length);let distance=0;for(let i=0;i<n;i++)distance+=Math.abs(a[Math.floor(i*a.length/n)]-b[Math.floor(i*b.length/n)]);return distance/n+Math.abs(a[0]-b[0])*.25;}
export function smoothInversions(chords){
  if(!Array.isArray(chords)||!chords.length)return [];
  const candidates=chords.map((n,i)=>{voicedPitches(n.chord,n.inversion);return i===0?[n.inversion]:CHORD_PITCHES[n.chord].map((_,j)=>j);});
  let paths=[{cost:0,path:[chords[0].inversion]}];
  for(let i=1;i<chords.length;i++)paths=candidates[i].map(inversion=>{
    let best=null;
    for(const previous of paths){const cost=previous.cost+connectionCost(voicedPitches(chords[i-1].chord,previous.path.at(-1)),voicedPitches(chords[i].chord,inversion));const path=[...previous.path,inversion];if(!best||cost<best.cost-1e-9)best={cost,path};}
    return best;
  });
  return paths.reduce((a,b)=>b.cost<a.cost-1e-9?b:a).path;
}
