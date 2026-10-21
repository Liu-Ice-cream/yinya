import {TRACKS,validate,setSectionDynamics,hasAudibleNotes} from './model.js';
import {DYNAMIC_PRESETS,dynamicPresetInfo,dynamicLabel} from './dynamics.js';

// Candidate editing stays outside the work until Apply, using the shared snapshot player.
export class DynamicEditor {
  constructor(root,callbacks){
    this.root=root;this.callbacks=callbacks;this.session=null;this.side=null;
    root.innerHTML=`<div class="workshop-heading"><div><h2 id="dynamic-heading">动态编曲</h2><p id="dynamic-range" class="muted"></p></div><button id="close-dynamics" aria-label="关闭动态编曲">关闭</button></div>
      <p class="muted">为当前四小节的每个声部设置起止音量，整段平滑过渡。100% 保持整曲音量，0% 静音；关闭的声部仍保持关闭。先试听比较，应用后可一次撤销。</p>
      <div id="dynamic-tracks" class="dynamic-tracks"></div>
      <p id="dynamic-message" role="status" aria-live="polite" class="muted"></p>
      <div class="dynamic-actions"><button id="dynamic-original" aria-pressed="false">试听原版</button><button id="dynamic-candidate" aria-pressed="false">试听候选</button><button id="dynamic-stop">停止试听</button><button id="dynamic-apply" class="primary">应用到本段</button><button id="dynamic-cancel">取消</button></div>`;
    this.$=id=>root.querySelector('#'+id);
    for(const [i,track] of TRACKS.entries()){
      const card=document.createElement('section');card.className='dynamic-track';
      card.innerHTML=`<h3>${track.name}</h3><p id="dynamic-layer-${i}" class="muted"></p><label>变化模板<select id="dynamic-preset-${i}" aria-label="${track.name}变化模板"><option value="custom" disabled>自定义</option>${DYNAMIC_PRESETS.map(p=>`<option value="${p.id}">${p.name} · ${p.start}% → ${p.end}%</option>`).join('')}</select></label><svg class="dynamic-curve" viewBox="0 0 160 64" role="img" id="dynamic-curve-${i}"><path class="dynamic-guide" d="M8 8V56H152 M8 32H152"/><path id="dynamic-line-${i}" class="dynamic-line"/><circle id="dynamic-dot-start-${i}" r="3"/><circle id="dynamic-dot-end-${i}" r="3"/></svg><p class="dynamic-endpoints" id="dynamic-summary-${i}"></p><label>起始音量 <output id="dynamic-start-value-${i}"></output><input id="dynamic-start-${i}" type="range" min="0" max="100" step="1" aria-label="${track.name}起始音量"></label><label>结束音量 <output id="dynamic-end-value-${i}"></output><input id="dynamic-end-${i}" type="range" min="0" max="100" step="1" aria-label="${track.name}结束音量"></label>`;
      this.$('dynamic-tracks').append(card);
      this.$(`dynamic-preset-${i}`).addEventListener('change',e=>{const p=dynamicPresetInfo(e.target.value);this.change(i,p.start,p.end);});
      for(const endpoint of ['start','end'])this.$(`dynamic-${endpoint}-${i}`).addEventListener('input',()=>{this.change(i,Number(this.$(`dynamic-start-${i}`).value),Number(this.$(`dynamic-end-${i}`).value));});
    }
    for(const id of ['close-dynamics','dynamic-cancel'])this.$(id).addEventListener('click',()=>this.close());
    root.addEventListener('cancel',e=>{e.preventDefault();this.close();});
    root.addEventListener('close',()=>{this.callbacks.preview.stop();this.session=null;});
    this.$('dynamic-original').addEventListener('click',()=>this.audition('original'));
    this.$('dynamic-candidate').addEventListener('click',()=>this.audition('candidate'));
    this.$('dynamic-stop').addEventListener('click',()=>this.callbacks.preview.stop());
    this.$('dynamic-apply').addEventListener('click',()=>this.apply());
  }
  open(index){
    this.callbacks.beforeEdit();const base=validate(this.callbacks.get());
    if(!Number.isInteger(index)||index<0||index>=base.sections.length)return;
    this.session={base,candidate:validate(base),index,serialized:JSON.stringify(this.callbacks.get())};
    this.$('dynamic-range').textContent=`「${base.sections[index].name}」· 第 ${index*4+1}–${index*4+4} 小节`;
    this.side=null;this.render();this.message('候选尚未应用；关闭或取消会保留原作品。');this.root.showModal();
  }
  close(){this.callbacks.preview.stop();this.session=null;this.side=null;this.root.close();}
  message(text){this.$('dynamic-message').textContent=text;}
  change(track,start,end){
    if(!this.session)return;this.callbacks.preview.stop();const s=this.session;
    try{s.candidate=setSectionDynamics(s.candidate,s.index,track,start,end);this.render();this.message('音量变化已更新到候选，作品尚未改变；可试听比较。');}catch(error){this.message(error.message);}
  }
  render(){
    if(!this.session)return;const s=this.session,p=s.candidate.sections[s.index];
    TRACKS.forEach((track,i)=>{
      const start=p.volumes[i],end=p.endVolumes[i],preset=DYNAMIC_PRESETS.find(t=>t.start===start&&t.end===end);
      this.$(`dynamic-preset-${i}`).value=preset?.id??'custom';
      for(const [endpoint,value] of [['start',start],['end',end]]){this.$(`dynamic-${endpoint}-${i}`).value=value;this.$(`dynamic-${endpoint}-value-${i}`).value=value+'%';}
      this.$(`dynamic-summary-${i}`).textContent=dynamicLabel(start,end);
      const y1=56-start*.48,y2=56-end*.48;
      this.$(`dynamic-line-${i}`).setAttribute('d',`M8 ${y1}L152 ${y2}`);
      for(const [name,x,y] of [['start',8,y1],['end',152,y2]]){this.$(`dynamic-dot-${name}-${i}`).setAttribute('cx',x);this.$(`dynamic-dot-${name}-${i}`).setAttribute('cy',y);}
      this.$(`dynamic-curve-${i}`).setAttribute('aria-label',`${track.name}：起始 ${start}%，结束 ${end}%，四小节线性过渡`);
      this.$(`dynamic-layer-${i}`).textContent=!p.enabled[i]?'本段声部关闭，应用后仍关闭':!s.candidate.tracks[i].enabled||s.candidate.tracks[i].volume===0?'整曲声部静音，应用后仍静音':'随本段时间变化，音符与音色保留';
    });
    this.$('dynamic-apply').disabled=JSON.stringify(s.base)===JSON.stringify(s.candidate);
    for(const side of ['original','candidate']){this.$(`dynamic-${side}`).setAttribute('aria-pressed',String(this.side===side));this.$(`dynamic-${side}`).disabled=!hasAudibleNotes(s[side==='original'?'base':'candidate'],s.index*4,s.index*4+4);}
    this.$('dynamic-stop').disabled=!this.side;
  }
  async audition(side){
    const s=this.session;if(!s)return;
    try{const started=await this.callbacks.preview.playSection(side==='original'?s.base:s.candidate,s.index*4,active=>{if(this.session!==s)return;this.side=active?side:null;this.render();this.message(active?`正在准备或试听${side==='original'?'原版':'候选'}，作品尚未改变。`:'试听已停止，作品尚未改变。');});
      if(this.session===s&&!started&&!this.side)this.message('该版本没有可听见的音符；可调整音量或开启声部后重试。');
    }catch(error){if(this.session===s)this.message('浏览器未能开始试听，请重试；作品尚未改变。');}
  }
  apply(){
    const s=this.session;if(!s)return;
    if(JSON.stringify(this.callbacks.get())!==s.serialized){this.message('作品已变化，请关闭后重新打开动态编曲；本次候选未应用。');return;}
    if(JSON.stringify(s.base)===JSON.stringify(s.candidate))return;
    const candidate=validate(s.candidate);this.close();this.callbacks.commit(candidate,'本段音量变化已应用；音符、音色和其他段落保留，可一次撤销。');
  }
}
