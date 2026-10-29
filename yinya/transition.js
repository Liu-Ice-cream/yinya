// Original transition patterns, stored as ordinary drum hits and section endpoints.
import {validate,trackAudibleAt,TRACKS} from './model.js';
import {drumLevel,withDrumLevel} from './drum-kits.js';

function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
export const TRANSITION_STYLES=freeze([
  {id:'gentle',name:'轻柔过渡',start:8,hint:'前段最后两拍加入轻过门，后段首拍轻落地。',outgoing:[[8,0,1],[10,2,0],[12,1,0],[12,2,0],[14,1,1],[15,2,0]],incoming:[[0,0,1],[0,2,0]]},
  {id:'build',name:'推进进入',start:0,hint:'前段最后一小节逐渐加密，后段首拍加强。',outgoing:[[0,0,1],[2,2,0],[4,1,1],[6,2,0],[8,0,1],[10,2,0],[12,1,0],[12,2,1],[13,1,1],[14,1,1],[14,2,1],[15,1,2]],incoming:[[0,0,2],[0,2,2],[2,2,0]]},
  {id:'breath',name:'留白呼吸',start:12,hint:'前段最后一拍留白，后段首拍的后半拍加入轻鼓点。',outgoing:[],incoming:[[2,0,0],[2,2,0]]},
]);
export function transitionStyle(id){const style=TRANSITION_STYLES.find(s=>s.id===id);if(!style)throw new Error('衔接方式无效');return style;}
export function transitionOptions(settings={}){
  if(!settings||typeof settings!=='object'||Array.isArray(settings))throw new Error('衔接设置无效');
  const defaults={style:'gentle',drums:true,volumes:false,match:'average',tracks:[true,true,true,true]};
  const o=Object.fromEntries(Object.entries(defaults).map(([k,v])=>[k,settings[k]===undefined?v:settings[k]]));
  transitionStyle(o.style);
  if(typeof o.drums!=='boolean'||typeof o.volumes!=='boolean'||!['average','previous','next'].includes(o.match)||!Array.isArray(o.tracks)||o.tracks.length!==4||Array.from(o.tracks).some(v=>typeof v!=='boolean'))throw new Error('过门、音量策略或声部选择无效');
  if(!o.drums&&!o.volumes)throw new Error('请至少选择鼓点过门或音量衔接。');
  if(o.volumes&&!o.tracks.some(Boolean))throw new Error('请至少选择一个需要衔接音量的声部。');
  return {...o,tracks:[...o.tracks]};
}
export function transitionWindows(index,style){const p=transitionStyle(style);return [{bar:index*4+3,start:p.start,end:16,hits:p.outgoing},{bar:index*4+4,start:0,end:4,hits:p.incoming}];}
function writeWindow(layer,{bar,start,end,hits}){
  for(let step=start;step<end;step++){layer.bars[bar][step]=0;layer.drumVelocities[bar][step]=13;}
  for(const [step,lane,level] of hits){layer.bars[bar][step]|=1<<lane;layer.drumVelocities[bar][step]=withDrumLevel(layer.drumVelocities[bar][step],lane,level);}
}
export function generateTransition(value,index,settings={}){
  const original=validate(value),o=transitionOptions(settings);
  if(!Number.isInteger(index)||index<0||index+1>=original.sections.length)throw new Error('请选择两个相邻的四小节段；只有一段时请先新增段落。');
  const state=validate(original),windows=o.drums?transitionWindows(index,o.style):[],volumes=[],warnings=[];
  for(const window of windows)writeWindow(state.tracks[3],window);
  const a=state.sections[index],b=state.sections[index+1];
  if(o.volumes)for(let track=0;track<4;track++)if(o.tracks[track]){
    const from=a.endVolumes[track],to=b.volumes[track],level=o.match==='previous'?from:o.match==='next'?to:Math.round((from+to)/2);
    a.endVolumes[track]=b.volumes[track]=level;volumes.push({track,from,to,level});
  }
  const stats={added:0,removed:0,levels:0,volumeTracks:volumes.filter(v=>v.from!==v.level||v.to!==v.level).length};
  for(const {bar,start,end} of windows)for(let step=start;step<end;step++)for(let lane=0;lane<3;lane++){
    const before=Boolean(original.tracks[3].bars[bar][step]&(1<<lane)),after=Boolean(state.tracks[3].bars[bar][step]&(1<<lane));
    if(!before&&after)stats.added++;else if(before&&!after)stats.removed++;else if(before&&after&&drumLevel(original.tracks[3].drumVelocities[bar][step],lane)!==drumLevel(state.tracks[3].drumVelocities[bar][step],lane))stats.levels++;
  }
  if(o.drums)for(const i of [index,index+1])if(!trackAudibleAt(state,3,i*4))warnings.push(`「${state.sections[i].name}」鼓点关闭或音量为零，候选保留原设置；请按需要在段落设置中开启。`);
  if(o.volumes)warnings.push('音量衔接会改变所选声部在前后各四小节内的线性渐变，前段起始值与后段结束值保留；声部开关及整曲音量保留。');
  if(JSON.stringify(state)===JSON.stringify(original))warnings.push('当前设置与作品相同，无需应用。');
  return {state:validate(state),windows,volumes,stats,warnings};
}
export function transitionScope(index,settings={}){
  const o=transitionOptions(settings),p=transitionStyle(o.style),parts=[];
  if(o.drums)parts.push(`第 ${index*4+4} 小节${p.start===0?'全部鼓点':p.start===8?'后两拍鼓点':'最后一拍鼓点'}与第 ${index*4+5} 小节首拍鼓点`);
  if(o.volumes)parts.push(`${TRACKS.filter((_,i)=>o.tracks[i]).map(t=>t.name).join('／')}声部在前后各四小节的音量渐变接点`);
  return parts.join('；');
}
