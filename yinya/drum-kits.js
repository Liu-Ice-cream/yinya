// Original local synthesis definitions. No recorded samples or external assets.
export const DRUM_KITS=Object.freeze([
  {id:'original',name:'原始鼓组',hint:'保留原来的低鼓、小鼓与沙帽声音。',releaseBeats:0,gains:[1,1,1]},
  {id:'soft-v1',name:'柔和鼓组',hint:'较圆的低鼓、较轻的小鼓与收敛的沙帽。',releaseBeats:.125,gains:[.9,.65,.8]},
  {id:'electro-v1',name:'电子鼓组',hint:'低频集中的低鼓、明亮的小鼓与细碎沙帽。',releaseBeats:.125,gains:[.5,.4,1]},
].map(k=>Object.freeze({...k,gains:Object.freeze(k.gains)})));
export function drumKitInfo(id){const kit=DRUM_KITS.find(k=>k.id===id);if(!kit)throw new Error('鼓组无法识别，请使用支持该鼓组的音芽版本');return kit;}
export const DRUM_DEFAULT_VELOCITY=13; // base-three digits: kick, snare, hat; all standard.
export function drumLevel(code,lane){return Math.floor(code/3**lane)%3;}
export function withDrumLevel(code,lane,level){if(!Number.isInteger(code)||code<0||code>26||![0,1,2].includes(lane)||![0,1,2].includes(level))throw new Error('鼓点力度无效');return code+(level-drumLevel(code,lane))*3**lane;}
export function drumInstrument(id,volume){
  drumKitInfo(id);
  return {type:'drumset',wave:undefined,volume,effects:['transition type','chord type'],transition:'normal',chord:'simultaneous',fadeInSeconds:0,fadeOutTicks:id==='original'?-1:6,...(id==='original'?{}:{yinyaDrumReleaseTicks:6}),
    drums:Array.from({length:12},(_,drum)=>({filterEnvelope:id==='original'?(drum>=8?'twang 1':'twang 2'):id==='soft-v1'?'twang 3':drum===0?'twang 2':'twang 1',spectrum:Array.from({length:30},(_,band)=>{
      if(id==='original')return drum===0?Math.max(0,100-band*17):drum===4?(band>3&&band<17?75:15):drum===8?(band>17?80:0):0;
      if(id==='soft-v1')return drum===0?Math.max(0,90-band*13):drum===4?(band>4&&band<14?55:8):drum===8?(band>17?50:0):0;
      return drum===0?(band<3?100:band<6?28:0):drum===4?(band>7&&band<22?65:10):drum===8?(band>22?85:0):0;
    })})),};
}
export function drumReleaseSeconds(id,tempo){const kit=drumKitInfo(id);return kit.releaseBeats*60/tempo+(id==='original'?.07:.04);}
