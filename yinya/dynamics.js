// Linear amplitude envelopes in bars, evaluated after each channel's synthesis.
// A null curve keeps the original per-note section gain path.
export const DYNAMIC_PRESETS = Object.freeze([
  {id:'steady',name:'保持平稳',start:100,end:100},
  {id:'fade-in',name:'渐入',start:0,end:100},
  {id:'fade-out',name:'渐出',start:100,end:0},
  {id:'build',name:'逐渐加强',start:40,end:100},
].map(Object.freeze));
export function dynamicPresetInfo(id){const preset=DYNAMIC_PRESETS.find(p=>p.id===id);if(!preset)throw new Error('音量变化模板无效');return preset;}
export function validateDynamics(value,channels){
  if(!Array.isArray(value)||value.length!==channels)throw new Error('音量曲线声部数据无效');
  return Array.from(value,curve=>{
    if(curve===null)return null;
    if(!Array.isArray(curve)||!curve.length||curve.length>8)throw new Error('音量曲线段落数据无效');
    return Array.from(curve,pair=>{
      if(!Array.isArray(pair)||pair.length!==2||Array.from(pair).some(n=>!Number.isFinite(n)||n<0||n>1))throw new Error('音量曲线必须在 0–100% 内');
      return [...pair];
    });
  });
}
export function dynamicsAt(curve,barPosition){
  if(!curve)return 1;
  const position=Math.max(0,barPosition),index=Math.min(curve.length-1,Math.floor(position/4));
  const [start,end]=curve[index],progress=Math.min(1,(position-index*4)/4);
  return start+(end-start)*progress;
}
export function dynamicLabel(start,end){return start===end?`${start}%`:`${start}% ${end>start?'↗':'↘'} ${end}%`;}
