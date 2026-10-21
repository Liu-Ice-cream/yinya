import {validate,hasAudibleNotes,sectionDrumKit} from './model.js';
import {DRUM_KITS,drumKitInfo} from './drum-kits.js';
import {DRUM_PATTERNS} from './grooves.js';
import {generateDrums,drumHits} from './drums.js';

export class DrumWorkshop {
  constructor(root,callbacks){
    this.root=root;this.callbacks=callbacks;this.session=null;this.side=null;this.$=id=>root.querySelector('#'+id);
    root.innerHTML=`<div class="workshop-heading"><div><h2 id="drum-workshop-heading">节奏工坊</h2><p id="drum-workshop-range" class="muted"></p></div><button id="close-drums" aria-label="关闭节奏工坊">关闭</button></div>
      <p class="muted">为当前四小节搭配鼓点、过门和鼓组。三行力度独立；先听四声部的原版与候选，应用后可一次撤销。</p>
      <fieldset><legend>选择改动内容</legend><label><input id="drum-workshop-rhythm" type="checkbox" checked>替换鼓点与逐击力度</label><label><input id="drum-workshop-kit-target" type="checkbox">更换本段鼓组</label></fieldset>
      <div class="drum-workshop-fields"><label>节奏模板<select id="drum-workshop-pattern">${DRUM_PATTERNS.map(p=>`<option value="${p.id}">${p.name}</option>`).join('')}</select></label><label>逐击力度<select id="drum-workshop-accent"><option value="expressive">轻重交替</option><option value="standard">全部标准</option></select></label><label>本段鼓组<select id="drum-workshop-kit"><option value="inherit">跟随整曲</option>${DRUM_KITS.map(k=>`<option value="${k.id}">${k.name}</option>`).join('')}</select></label></div>
      <div class="drum-workshop-checks"><label><input id="drum-workshop-fill" type="checkbox">最后一小节加过门</label><label><input id="drum-workshop-enable" type="checkbox" checked>在本段加入鼓点层</label></div>
      <p id="drum-workshop-summary" class="drum-workshop-summary"></p><p id="drum-workshop-message" role="status" aria-live="polite" class="muted"></p>
      <div class="dynamic-actions"><button id="drum-workshop-original" aria-pressed="false">试听原版</button><button id="drum-workshop-candidate" aria-pressed="false">试听候选</button><button id="drum-workshop-stop">停止试听</button><button id="drum-workshop-apply" class="primary">应用到本段</button><button id="drum-workshop-cancel">取消</button></div>`;
    for(const id of ['close-drums','drum-workshop-cancel'])this.$(id).addEventListener('click',()=>this.close());
    root.addEventListener('cancel',e=>{e.preventDefault();this.close();});root.addEventListener('close',()=>{if(root.open)return;this.callbacks.preview.stop();this.session=null;this.side=null;});
    for(const id of ['rhythm','kit-target','pattern','accent','kit','fill','enable'])this.$('drum-workshop-'+id).addEventListener('change',()=>{if(id==='kit')this.$('drum-workshop-kit-target').checked=true;this.change();});
    for(const side of ['original','candidate'])this.$('drum-workshop-'+side).addEventListener('click',()=>this.audition(side));
    this.$('drum-workshop-stop').addEventListener('click',()=>this.callbacks.preview.stop());this.$('drum-workshop-apply').addEventListener('click',()=>this.apply());
  }
  settings(){return {pattern:this.$('drum-workshop-pattern').value,accent:this.$('drum-workshop-accent').value,drumKit:this.$('drum-workshop-kit').value,rhythm:this.$('drum-workshop-rhythm').checked,kit:this.$('drum-workshop-kit-target').checked,fill:this.$('drum-workshop-fill').checked,enable:this.$('drum-workshop-enable').checked};}
  open(index){this.callbacks.beforeEdit();const base=validate(this.callbacks.get());if(!Number.isInteger(index)||index<0||index>=base.sections.length)return;this.session={base,candidate:base,index,serialized:JSON.stringify(this.callbacks.get())};this.$('drum-workshop-range').textContent=`「${base.sections[index].name}」· 第 ${index*4+1}–${index*4+4} 小节`;this.$('drum-workshop-kit').value=base.sections[index].drumKit;this.$('drum-workshop-kit-target').checked=false;this.$('drum-workshop-rhythm').checked=true;this.side=null;this.change();this.root.showModal();}
  close(){this.callbacks.preview.stop();this.session=null;this.side=null;this.root.close();}
  message(text){this.$('drum-workshop-message').textContent=text;}
  change(){const s=this.session;if(!s)return;this.callbacks.preview.stop();try{s.candidate=generateDrums(s.base,s.index*4,this.settings());this.render();this.message('候选尚未应用；关闭或取消会保留原作品。');}catch(error){this.message(error.message);this.$('drum-workshop-apply').disabled=true;}}
  render(){const s=this.session;if(!s)return;const p=s.candidate.sections[s.index],kit=drumKitInfo(sectionDrumKit(s.candidate,s.index*4)),notes=drumHits(s.candidate,s.index*4),counts=[0,1,2].map(v=>notes.filter(n=>n.velocity===v).length);this.$('drum-workshop-summary').textContent=`${kit.name} · ${notes.length} 个鼓点 · 轻 ${counts[0]} / 标准 ${counts[1]} / 重 ${counts[2]}。${kit.hint}${!p.enabled[3]?' 本段鼓点层关闭。':!s.candidate.tracks[3].enabled||s.candidate.tracks[3].volume===0?' 整曲鼓点静音，应用后仍静音。':''}`;
    this.$('drum-workshop-apply').disabled=JSON.stringify(s.base)===JSON.stringify(s.candidate);for(const side of ['original','candidate']){this.$('drum-workshop-'+side).setAttribute('aria-pressed',String(this.side===side));this.$('drum-workshop-'+side).disabled=!hasAudibleNotes(s[side==='original'?'base':'candidate'],s.index*4,s.index*4+4);}this.$('drum-workshop-stop').disabled=!this.side;
    for(const id of ['pattern','accent','fill'])this.$('drum-workshop-'+id).disabled=!this.$('drum-workshop-rhythm').checked;
  }
  async audition(side){const s=this.session;if(!s)return;try{await this.callbacks.preview.playSection(side==='original'?s.base:s.candidate,s.index*4,active=>{if(this.session!==s)return;this.side=active?side:null;this.render();this.message(active?`正在准备或试听${side==='original'?'原版':'候选'}，作品尚未改变。`:'试听已停止，作品尚未改变。');});}catch{if(this.session===s)this.message('浏览器未能开始试听，请重试；作品尚未改变。');}}
  apply(){const s=this.session;if(!s)return;const apply=()=>{if(this.session!==s)return;if(JSON.stringify(this.callbacks.get())!==s.serialized){this.message('作品已变化，请关闭后重新打开节奏工坊；本次候选未应用。');return;}if(JSON.stringify(s.base)===JSON.stringify(s.candidate))return;const candidate=validate(s.candidate);this.close();this.callbacks.commit(candidate,'节奏工坊已应用到本段；其他声部和段落保留，可一次撤销。');};if(this.settings().rhythm&&drumHits(s.base,s.index*4).length)this.callbacks.confirm('将替换当前四小节已有鼓点及逐击力度；其他声部保留，可一次撤销。',apply,'替换鼓点');else apply();}
}
