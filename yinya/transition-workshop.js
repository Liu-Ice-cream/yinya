import {validate,TRACKS,hasAudibleNotes} from './model.js';
import {drumLevel} from './drum-kits.js';
import {TRANSITION_STYLES,transitionStyle,generateTransition,transitionScope} from './transition.js';

export class TransitionWorkshop{
  constructor(root,callbacks){
    this.root=root;this.callbacks=callbacks;this.session=null;this.side=null;this.request=0;this.lastStep=-1;this.$=id=>root.querySelector('#transition-'+id);
    root.innerHTML=`<div class="workshop-heading"><div><p class="eyebrow">让下一段，自然接进来</p><h2 id="transition-heading">段落衔接</h2></div><button id="transition-close" aria-label="关闭段落衔接">关闭</button></div>
      <p class="muted">为相邻两段搭配鼓点过门，可选衔接音量。连续听完八小节，再决定是否应用。</p>
      <div class="transition-fields"><label>相邻段落<select id="transition-pair"></select></label><label>衔接方式<select id="transition-style">${TRANSITION_STYLES.map(p=>`<option value="${p.id}">${p.name}</option>`).join('')}</select></label></div>
      <p id="transition-hint" class="muted"></p>
      <div class="transition-checks"><label><input type="checkbox" id="transition-drums" checked>修改鼓点过门</label><label><input type="checkbox" id="transition-volumes">同时衔接段落音量</label></div>
      <fieldset id="transition-volume-options"><legend>音量衔接 · 可单独使用</legend><label>接点音量策略<select id="transition-match"><option value="average">两端取平均</option><option value="previous">沿用前段结束值</option><option value="next">沿用后段起始值</option></select></label><div class="transition-checks">${TRACKS.map((t,i)=>`<label><input type="checkbox" id="transition-track-${i}" checked>${t.name}</label>`).join('')}</div><p class="muted">修改前段结束值与后段起始值，会改变前后各四小节的线性渐变；前段起始值、后段结束值及原有开关保留。</p></fieldset>
      <p id="transition-scope" class="transition-scope"></p><div id="transition-comparison" class="transition-comparison"></div>
      <div class="transition-result"><p id="transition-summary"></p><div id="transition-levels"></div><p id="transition-warning" class="muted"></p></div>
      <div class="transition-progress"><progress id="transition-progress" max="128" value="0" aria-label="连续八小节试听进度"></progress><span id="transition-position" class="muted" aria-live="off">前段四小节 → 后段四小节</span></div>
      <p id="transition-message" role="status" aria-live="polite"></p>
      <div class="transition-actions"><button id="transition-original" aria-pressed="false">试听原版八小节</button><button id="transition-candidate" aria-pressed="false">试听候选八小节</button><button id="transition-stop">停止试听</button><button id="transition-apply" class="primary">应用段落衔接</button><button id="transition-cancel">取消</button></div>`;
    for(const id of ['close','cancel'])this.$(id).addEventListener('click',()=>this.close());
    root.addEventListener('cancel',e=>{e.preventDefault();this.close();});
    root.addEventListener('close',()=>{if(!root.open)this.cleanup();});
    for(const id of ['pair','style','drums','volumes','match',...TRACKS.map((_,i)=>'track-'+i)])this.$(id).addEventListener('change',()=>this.change());
    for(const side of ['original','candidate'])this.$(side).addEventListener('click',()=>this.audition(side));
    this.$('stop').addEventListener('click',()=>{this.stop();this.message('试听已停止，作品尚未改变。');});
    this.$('apply').addEventListener('click',()=>this.apply());
  }
  cleanup(){this.request++;this.callbacks.preview.stop();this.side=null;this.session=null;this.lastStep=-1;}
  stop(){this.request++;this.callbacks.preview.stop();this.side=null;this.lastStep=-2;this.playback(null);this.renderButtons();}
  close(){this.cleanup();this.root.close();}
  open(index){
    if(this.callbacks.disabled?.())return;
    const base=validate(this.callbacks.get());
    if(base.sections.length<2){this.callbacks.status?.('至少需要两个相邻的四小节段，请先新增段落。');return;}
    if(!Number.isInteger(index)||index<0||index>=base.sections.length)return;
    this.callbacks.beforeEdit();index=Math.min(index,base.sections.length-2);
    this.session={base,index,serialized:JSON.stringify(this.callbacks.get()),revision:0,candidate:null,result:null};this.side=null;
    this.$('pair').replaceChildren(...base.sections.slice(0,-1).map((p,i)=>{const option=document.createElement('option');option.value=String(i);option.textContent=`${p.name} → ${base.sections[i+1].name} · 第 ${i*4+1}–${i*4+8} 小节`;return option;}));
    this.$('pair').value=String(index);this.$('style').value='gentle';this.$('drums').checked=true;this.$('volumes').checked=false;this.$('match').value='average';TRACKS.forEach((_,i)=>this.$('track-'+i).checked=true);
    this.change();this.root.showModal();
  }
  settings(){return {style:this.$('style').value,drums:this.$('drums').checked,volumes:this.$('volumes').checked,match:this.$('match').value,tracks:TRACKS.map((_,i)=>this.$('track-'+i).checked)};}
  message(text){this.$('message').textContent=text;}
  change(){const s=this.session;if(!s)return;this.stop();s.index=Number(this.$('pair').value);s.revision++;s.result=null;s.candidate=null;s.options=this.settings();
    this.$('volume-options').disabled=!s.options.volumes;this.$('style').disabled=!s.options.drums;
    this.$('hint').textContent=s.options.drums?transitionStyle(s.options.style).hint:'仅衔接音量，所有鼓点音符与逐击力度保留。';
    try{s.result=generateTransition(s.base,s.index,s.options);s.candidate=s.result.state;this.$('scope').textContent='改动范围：'+transitionScope(s.index,s.options)+'。旋律、和弦及贝斯音符保留。';this.message('候选保持固定，尚未应用；取消、关闭或 Esc 保留原作品。');}
    catch(error){this.$('scope').textContent='尚未生成可应用的衔接。';this.message(error.message);}
    this.render();
  }
  renderButtons(){const s=this.session;if(!s)return;
    for(const side of ['original','candidate']){const state=side==='original'?s.base:s.candidate;this.$(side).disabled=!state||!hasAudibleNotes(state,s.index*4,s.index*4+8);this.$(side).setAttribute('aria-pressed',String(this.side===side));}
    this.$('stop').disabled=this.side===null;this.$('apply').disabled=!s.candidate||JSON.stringify(s.candidate)===s.serialized||Boolean(this.callbacks.disabled?.());
  }
  chart(state){const s=this.session,svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','-28 0 340 66');svg.setAttribute('role','img');svg.setAttribute('aria-label',`第 ${s.index*4+4} 小节与第 ${s.index*4+5} 小节三行鼓点；浅色背景标记过门改动范围`);
    for(let lane=0;lane<3;lane++){const text=document.createElementNS(svg.namespaceURI,'text');text.setAttribute('x','-26');text.setAttribute('y',String(lane*20+14));text.textContent=['底鼓','军鼓','踩镲'][lane];svg.append(text);}
    for(let half=0;half<2;half++){const bar=s.index*4+3+half,window=s.result?.windows.find(w=>w.bar===bar);for(let step=0;step<16;step++)for(let lane=0;lane<3;lane++){
      const active=Boolean(state.tracks[3].bars[bar][step]&(1<<lane)),rect=document.createElementNS(svg.namespaceURI,'rect');rect.setAttribute('x',String(half*166+step*9));rect.setAttribute('y',String(lane*20+2));rect.setAttribute('width','8');rect.setAttribute('height','16');rect.setAttribute('rx','1');rect.setAttribute('class',`${window&&step>=window.start&&step<window.end?'scope ':''}${active?'hit level-'+drumLevel(state.tracks[3].drumVelocities[bar][step],lane):'empty'}`);svg.append(rect);
    }}return svg;
  }
  render(){const s=this.session;if(!s)return;this.renderButtons();
    this.$('comparison').replaceChildren(...['original','candidate'].map(side=>{const card=document.createElement('section'),heading=document.createElement('h3'),range=document.createElement('p'),state=side==='original'?s.base:s.candidate;heading.textContent=side==='original'?'原版交界鼓点':'候选交界鼓点';range.textContent=`第 ${s.index*4+4} 小节（前段末）→ 第 ${s.index*4+5} 小节（后段首）`;card.append(heading,range);if(state)card.append(this.chart(state));else{const empty=document.createElement('p');empty.textContent='暂无候选';card.append(empty);}return card;}));
    const stats=s.result?.stats;this.$('summary').textContent=stats?`鼓点新增 ${stats.added} 击、移除 ${stats.removed} 击、改变力度 ${stats.levels} 击；${stats.volumeTracks} 个声部的音量接点变化。`:'请先选择需要修改的内容。';
    this.$('levels').replaceChildren(...(s.result?.volumes??[]).map(v=>{const p=document.createElement('p');p.textContent=`${TRACKS[v.track].name}：原接点 ${v.from}% → ${v.to}%　候选 ${v.level}% → ${v.level}%`;return p;}));
    this.$('warning').textContent=s.result?.warnings.join(' ')??'';
  }
  playback(seconds){
    if(!this.session)return;
    const step=this.side&&seconds!==null?Math.min(128,Math.max(0,Math.floor(seconds*this.session.base.tempo/60*4))):-1;
    if(step===this.lastStep)return;this.lastStep=step;this.$('progress').value=Math.max(0,step);
    this.$('position').textContent=step<0?'前段四小节 → 后段四小节':step===128?'八小节已播放，等待自然余音':`${step<64?'前段':'后段'}「${this.session.base.sections[this.session.index+(step<64?0:1)].name}」· 第 ${this.session.index*4+Math.floor(step/16)+1} 小节`;
  }
  async audition(side){const s=this.session;if(!s)return;this.stop();const request=++this.request,state=side==='original'?s.base:s.candidate;if(!state)return;
    try{const started=await this.callbacks.preview.playRange(state,s.index*4,8,active=>{if(this.session!==s||request!==this.request)return;this.side=active?side:null;this.renderButtons();this.playback(null);this.message(active?`正在准备${side==='original'?'原版':'候选'}的连续八小节试听…`:'试听已停止，作品尚未改变。');});
      if(this.session===s&&request===this.request)this.message(started?`正在连续试听${side==='original'?'原版':'候选'}：「${s.base.sections[s.index].name}」→「${s.base.sections[s.index+1].name}」，包含实际四声部。`:'这八小节没有可听内容，请检查声部开关和音量。');
    }catch{if(this.session===s&&request===this.request){this.side=null;this.renderButtons();this.playback(null);this.message('浏览器未能开始试听，候选保留，可以重试。');}}
  }
  apply(){const s=this.session;if(!s?.candidate||this.callbacks.disabled?.()||JSON.stringify(s.candidate)===s.serialized)return;this.stop();const next=validate(s.candidate),revision=s.revision,index=s.index,options=s.options;
    this.callbacks.confirm(`将更新「${s.base.sections[index].name}」→「${s.base.sections[index+1].name}」：${transitionScope(index,options)}。${options.volumes?'所选声部的渐变影响前后各四小节。':''}旋律、和弦与贝斯音符及声部开关保留，可一次撤销。`,()=>{
      if(this.session!==s)return;
      if(this.callbacks.disabled?.()||s.revision!==revision||JSON.stringify(this.callbacks.get())!==s.serialized){this.message('作品或候选已变化，本次衔接未应用，请重新生成并确认。');return;}
      this.close();this.callbacks.commit(next,'段落衔接已应用，旋律、和弦与贝斯音符保留，可一次撤销。',index,options.drums);
    },'应用段落衔接');
  }
}
