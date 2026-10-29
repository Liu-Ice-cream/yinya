import {validate,hasAudibleNotes,trackAudibleAt} from './model.js';
import {phraseNotes} from './phrase.js';
import {PITCH_VALUES} from './theory.js';
import {generateVariation,VARIATION_MODES} from './variation.js';

export class VariationWorkshop{
  constructor(root,callbacks){
    this.root=root;this.callbacks=callbacks;this.session=null;this.side=null;this.request=0;this.$=id=>root.querySelector('#variation-'+id);
    root.innerHTML=`<div class="workshop-heading"><div><p class="eyebrow">把同一个主题，写成新的回应</p><h2 id="variation-heading">主题变奏</h2></div><button id="variation-close" aria-label="关闭主题变奏">关闭</button></div>
      <p class="muted">从已有四小节旋律生成候选，试听后应用到目标段。目标的和弦、贝斯、鼓点与配器保留。</p>
      <div class="variation-fields"><label>来源主题<select id="variation-source"></select></label><label>目标段落<select id="variation-target"></select></label><label>变奏方式<select id="variation-mode">${VARIATION_MODES.map(m=>`<option value="${m.id}">${m.name}</option>`).join('')}</select></label></div>
      <fieldset class="variation-protection"><legend>保护主题骨架</legend><label><input type="checkbox" id="variation-prefix">保留来源前两小节（含跨入后半句的长音）</label><label><input type="checkbox" id="variation-strong" checked>保留来源重拍音（每小节第 1、3 拍起音）</label></fieldset>
      <label class="variation-check"><input type="checkbox" id="variation-harmony" checked>让改动的音符贴合目标和弦（结尾收束始终参考目标和声）</label>
      <label class="variation-check"><input type="checkbox" id="variation-enable">在目标段加入旋律层（整曲静音与原音量保留）</label>
      <p id="variation-hint" class="muted"></p><div class="variation-comparison" id="variation-comparison"></div>
      <div class="variation-result"><b id="variation-number"></b><p id="variation-summary"></p><p id="variation-warning" class="muted"></p></div>
      <p id="variation-message" role="status" aria-live="polite"></p>
      <div class="variation-preview"><button id="variation-listen-source" aria-pressed="false">试听来源主题</button><button id="variation-listen-original" aria-pressed="false">试听目标原版</button><button id="variation-listen-candidate" aria-pressed="false">试听目标候选</button><button id="variation-stop">停止试听</button><button id="variation-next">换一版</button></div>
      <div class="dynamic-actions"><button id="variation-apply" class="primary">应用到目标段</button><button id="variation-cancel">取消</button><span class="muted">仅在应用后修改作品，可一次撤销。</span></div>`;
    for(const id of ['close','cancel'])this.$(id).addEventListener('click',()=>this.close());
    root.addEventListener('cancel',e=>{e.preventDefault();this.close();});
    root.addEventListener('close',()=>{if(!root.open)this.cleanup();});
    for(const id of ['source','target','mode','prefix','strong','harmony','enable'])this.$(id).addEventListener('change',()=>this.change());
    this.$('next').addEventListener('click',()=>{if(this.session){this.session.variant=(this.session.variant+1)>>>0;this.change();}});
    for(const side of ['source','original','candidate'])this.$('listen-'+side).addEventListener('click',()=>this.audition(side));
    this.$('stop').addEventListener('click',()=>{this.stop();this.message('试听已停止，作品尚未改变。');});
    this.$('apply').addEventListener('click',()=>this.apply());
  }
  cleanup(){this.request++;this.callbacks.preview.stop();this.side=null;this.session=null;}
  stop(){this.request++;this.callbacks.preview.stop();this.side=null;this.renderButtons();}
  close(){this.cleanup();this.root.close();}
  open(index){
    if(this.callbacks.disabled?.())return;
    this.callbacks.beforeEdit();const base=validate(this.callbacks.get());
    if(!Number.isInteger(index)||index<0||index>=base.sections.length)return;
    this.session={base,serialized:JSON.stringify(this.callbacks.get()),variant:0,candidate:null,result:null};this.side=null;
    for(const id of ['source','target'])this.$(id).replaceChildren(...base.sections.map((p,i)=>{const option=document.createElement('option');option.value=String(i);option.textContent=`${p.name} · 第 ${i*4+1}–${i*4+4} 小节`;return option;}));
    this.$('source').value=String(index);this.$('target').value=String(Math.min(index+1,base.sections.length-1));
    this.$('mode').value='gentle';this.$('prefix').checked=false;this.$('strong').checked=true;this.$('harmony').checked=true;this.$('enable').checked=false;
    this.change();this.root.showModal();
  }
  settings(){return {mode:this.$('mode').value,prefix:this.$('prefix').checked,strong:this.$('strong').checked,harmony:this.$('harmony').checked,enable:this.$('enable').checked,variant:this.session.variant};}
  message(text){this.$('message').textContent=text;}
  change(){const s=this.session;if(!s)return;this.stop();s.revision=(s.revision??0)+1;s.source=Number(this.$('source').value);s.target=Number(this.$('target').value);s.candidate=null;s.result=null;
    const options=this.settings();this.$('hint').textContent=VARIATION_MODES.find(m=>m.id===options.mode)?.hint??'';this.$('next').disabled=options.mode==='cadence';this.$('harmony').disabled=options.mode==='cadence';
    try{s.result=generateVariation(s.base,s.source,s.target,options);s.candidate=s.result.state;this.message('候选尚未应用；反复试听保持同一版，关闭或取消保留原作品。');}catch(error){this.message(error.message);}
    this.render();
  }
  previewState(side){const s=this.session;return {state:side==='candidate'?s.candidate:s.base,index:side==='source'?s.source:s.target};}
  renderButtons(){const s=this.session;if(!s)return;for(const side of ['source','original','candidate']){const {state,index}=this.previewState(side);this.$('listen-'+side).disabled=!state||!hasAudibleNotes(state,index*4,index*4+4);this.$('listen-'+side).setAttribute('aria-pressed',String(this.side===side));}this.$('stop').disabled=this.side===null;this.$('apply').disabled=!s.candidate||s.serialized===JSON.stringify(s.candidate)||Boolean(this.callbacks.disabled?.());}
  render(){const s=this.session;if(!s)return;this.renderButtons();this.$('number').textContent=`候选 ${s.variant+1} · 只替换目标旋律`;
    this.$('comparison').replaceChildren(...['source','original','candidate'].map(side=>{const card=document.createElement('section'),heading=document.createElement('h3'),label=document.createElement('p'),{state,index}=this.previewState(side);heading.textContent={source:'来源主题',original:'目标原版',candidate:'目标候选'}[side];label.textContent=s.base.sections[index]?.name??'';card.append(heading,label);if(state){const notes=phraseNotes(state,0,index*4),svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 256 76');svg.setAttribute('role','img');svg.setAttribute('aria-label',`${heading.textContent}：${notes.length} 个音符，四小节旋律轮廓`);for(let bar=0;bar<4;bar++){const line=document.createElementNS(svg.namespaceURI,'line');for(const [k,v] of Object.entries({x1:bar*64,y1:0,x2:bar*64,y2:76}))line.setAttribute(k,String(v));svg.append(line);}for(const note of notes){const rect=document.createElementNS(svg.namespaceURI,'rect');for(const [k,v] of Object.entries({x:note.step*4,y:4+(24-PITCH_VALUES[note.pitch])*2.7,width:Math.max(2,note.duration*4-1),height:5,rx:1}))rect.setAttribute(k,String(v));svg.append(rect);}card.append(svg);for(let bar=0;bar<4;bar++){const amount=document.createElement('small');amount.textContent=`第 ${index*4+bar+1} 小节 · ${notes.filter(n=>Math.floor(n.step/16)===bar).length} 音`;card.append(amount);}}else{const empty=document.createElement('p');empty.textContent='暂无候选';card.append(empty);}return card;}));
    const stats=s.result?.stats;this.$('summary').textContent=stats?`相对来源：${stats.sourceCount} 个音符中 ${stats.kept} 个原样保留，${stats.changed} 个发生变化，新增 ${stats.added} 个起音；改音高 ${stats.pitchChanges} 处，改节奏 ${stats.rhythmChanges} 处。受保护 ${stats.protectedCount} 个音符。`:'先选择含旋律的来源段。';
    const warnings=[...(s.result?.warnings??[])];if(s.candidate&&!trackAudibleAt(s.candidate,0,s.target*4))warnings.push('目标旋律目前静音；试听仍遵循声部开关和音量，可勾选加入旋律层或检查整曲设置。');if(s.source===s.target)warnings.push('来源与目标相同，应用后替换本段旋律；应用前原稿保留。');this.$('warning').textContent=warnings.join(' ');
  }
  async audition(side){const s=this.session;if(!s)return;this.stop();const request=++this.request,{state,index}=this.previewState(side);if(!state)return;
    this.message('正在准备四声部试听，作品尚未改变。');
    try{const started=await this.callbacks.preview.playSection(state,index*4,active=>{if(this.session!==s||this.request!==request)return;this.side=active?side:null;this.renderButtons();this.message(active?'正在试听'+{source:'来源主题',original:'目标原版',candidate:'目标候选'}[side]+'的四声部，作品尚未改变。':'试听已停止，作品尚未改变。');});if(!started&&this.session===s&&this.request===request)this.message('当前没有可听内容，请检查声部开关和音量。');}
    catch{if(this.session===s&&this.request===request){this.side=null;this.renderButtons();this.message('浏览器未能开始试听，候选保留，请重试。');}}
  }
  apply(){const s=this.session;if(!s?.candidate||this.callbacks.disabled?.())return;this.stop();if(JSON.stringify(s.candidate)===s.serialized)return;
    const next=validate(s.candidate),revision=s.revision,target=s.target,apply=()=>{if(this.session!==s)return;if(this.callbacks.disabled?.()||s.revision!==revision||JSON.stringify(this.callbacks.get())!==s.serialized){this.message('作品或候选已变化，本次未应用；请重新生成并确认。');return;}this.close();this.callbacks.commit(next,`主题变奏已应用到「${next.sections[target].name}」；伴奏与配器保留，可一次撤销。`,target);};
    if(phraseNotes(s.base,0,target*4).length)this.callbacks.confirm(`将替换「${s.base.sections[target].name}」第 ${target*4+1}–${target*4+4} 小节已有旋律，使用「${s.base.sections[s.source].name}」的变奏候选。和弦、贝斯、鼓点及配器保留${this.$('enable').checked?'，仅开启目标段旋律层':''}；可一次撤销。`,apply,'应用主题变奏');else apply();
  }
}
