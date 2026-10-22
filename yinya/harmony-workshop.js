import {validate,hasAudibleNotes} from './model.js';
import {generateHarmony,harmonyNotes} from './harmony.js';
import {voicedName} from './chord-expression.js';

export class HarmonyWorkshop {
  constructor(root,callbacks){
    this.root=root;this.callbacks=callbacks;this.session=null;this.side=null;this.$=id=>root.querySelector('#'+id);
    root.innerHTML=`<div class="workshop-heading"><div><h2 id="harmony-workshop-heading">和声工坊</h2><p id="harmony-workshop-range" class="muted"></p></div><button id="close-harmony" aria-label="关闭和声工坊">关闭</button></div>
      <p class="muted">保留当前四小节的和弦种类与空拍，调整转位和逐拍力度。先比较四声部的原版与候选，应用后可一次撤销。</p>
      <div class="harmony-workshop-fields"><label>和弦连接<select id="harmony-workshop-connection"><option value="smooth">平滑连接 · 自动选择转位</option><option value="keep">保留现有转位</option><option value="root">全部恢复原位</option></select></label><label>逐拍力度<select id="harmony-workshop-accent"><option value="keep">保留现有力度</option><option value="pulse">重拍与轻拍</option><option value="standard">全部标准</option></select></label></div>
      <p id="harmony-workshop-rule" class="muted">平滑连接保留第一组和弦的当前转位，以声部音高移动距离选择后续转位；不改变和弦根音或其他声部。</p>
      <label class="harmony-workshop-enable"><input id="harmony-workshop-enable" type="checkbox">在本段加入和弦层（整曲静音仍保留）</label>
      <div class="harmony-comparison"><section><h3>原版</h3><p id="harmony-workshop-before"></p></section><section><h3>候选</h3><p id="harmony-workshop-after"></p></section></div>
      <p id="harmony-workshop-summary" class="harmony-workshop-summary"></p><p id="harmony-workshop-message" role="status" aria-live="polite" class="muted"></p>
      <div class="dynamic-actions"><button id="harmony-workshop-original" aria-pressed="false">试听原版</button><button id="harmony-workshop-candidate" aria-pressed="false">试听候选</button><button id="harmony-workshop-stop">停止试听</button><button id="harmony-workshop-apply" class="primary">应用到本段</button><button id="harmony-workshop-cancel">取消</button></div>`;
    for(const id of ['close-harmony','harmony-workshop-cancel'])this.$(id).addEventListener('click',()=>this.close());root.addEventListener('cancel',e=>{e.preventDefault();this.close();});root.addEventListener('close',()=>{if(root.open)return;this.callbacks.preview.stop();this.session=null;this.side=null;});
    for(const id of ['connection','accent','enable'])this.$('harmony-workshop-'+id).addEventListener('change',()=>this.change());for(const side of ['original','candidate'])this.$('harmony-workshop-'+side).addEventListener('click',()=>this.audition(side));this.$('harmony-workshop-stop').addEventListener('click',()=>callbacks.preview.stop());this.$('harmony-workshop-apply').addEventListener('click',()=>this.apply());
  }
  settings(){return {connection:this.$('harmony-workshop-connection').value,accent:this.$('harmony-workshop-accent').value,enable:this.$('harmony-workshop-enable').checked};}
  open(index){this.callbacks.beforeEdit();const base=validate(this.callbacks.get());if(!Number.isInteger(index)||index<0||index>=base.sections.length)return;this.session={base,candidate:base,index,serialized:JSON.stringify(this.callbacks.get()),valid:false};this.$('harmony-workshop-range').textContent=`「${base.sections[index].name}」· 第 ${index*4+1}–${index*4+4} 小节`;this.$('harmony-workshop-enable').checked=false;this.side=null;this.change();this.root.showModal();}
  close(){this.callbacks.preview.stop();this.session=null;this.side=null;this.root.close();}
  message(text){this.$('harmony-workshop-message').textContent=text;}
  change(){const s=this.session;if(!s)return;this.callbacks.preview.stop();try{s.candidate=generateHarmony(s.base,s.index*4,this.settings());s.valid=true;this.render();this.message(JSON.stringify(s.base)===JSON.stringify(s.candidate)?'当前设置已满足，无需改动；可调整力度或连接方式。':'候选尚未应用；关闭、Esc 或取消会保留原作品。');}catch(error){s.candidate=s.base;s.valid=false;this.render();this.message(error.message);}}
  render(){const s=this.session;if(!s)return;const before=harmonyNotes(s.base,s.index*4),after=harmonyNotes(s.candidate,s.index*4),rotations=after.filter((n,i)=>n.inversion!==before[i].inversion).length,levels=after.filter((n,i)=>n.velocity!==before[i].velocity).length;
    for(const [id,state] of [['before',s.base],['after',s.candidate]])this.$('harmony-workshop-'+id).replaceChildren(...Array.from({length:4},(_,bar)=>{const line=document.createElement('span');line.textContent=Array.from({length:4},(_,beat)=>{const id=state.tracks[1].bars[s.index*4+bar][beat],code=state.tracks[1].chordVoicings[s.index*4+bar][beat];return id<0?'—':voicedName(state,id,Math.floor(code/3))+'·'+['轻','标','重'][code%3];}).join(' · ');return line;}));
    const p=s.candidate.sections[s.index];this.$('harmony-workshop-summary').textContent=`调整转位 ${rotations} 拍，调整力度 ${levels} 拍；${before.length} 组和弦及 ${16-before.length} 个空拍保留。${!p.enabled[1]?' 本段和弦层关闭。':!s.candidate.tracks[1].enabled||s.candidate.tracks[1].volume===0?' 整曲和弦静音，应用后仍静音。':''}`;
    this.$('harmony-workshop-apply').disabled=!s.valid||JSON.stringify(s.base)===JSON.stringify(s.candidate);for(const side of ['original','candidate']){this.$('harmony-workshop-'+side).setAttribute('aria-pressed',String(this.side===side));this.$('harmony-workshop-'+side).disabled=!hasAudibleNotes(s[side==='original'?'base':'candidate'],s.index*4,s.index*4+4);}this.$('harmony-workshop-stop').disabled=!this.side;
  }
  async audition(side){const s=this.session;if(!s)return;try{await this.callbacks.preview.playSection(side==='original'?s.base:s.candidate,s.index*4,active=>{if(this.session!==s)return;this.side=active?side:null;this.render();this.message(active?`正在准备或试听${side==='original'?'原版':'候选'}，作品尚未改变。`:'试听已停止，作品尚未改变。');});}catch{if(this.session===s)this.message('浏览器未能开始试听，请重试；作品尚未改变。');}}
  apply(){const s=this.session;if(!s||!s.valid)return;if(JSON.stringify(this.callbacks.get())!==s.serialized){this.message('作品已变化，请关闭后重新打开和声工坊；本次候选未应用。');return;}if(JSON.stringify(s.base)===JSON.stringify(s.candidate))return;const candidate=validate(s.candidate);this.close();this.callbacks.commit(candidate,'本段和弦转位与力度已应用；和弦、空拍及其他声部保留，可一次撤销。');}
}
