import {TRACKS} from './model.js';
import {arrangementOverview,copyTrackSection,pasteTrackSection,trackSectionHasNotes,combinationTracks} from './arrangement.js';

export class ArrangerBoard{
 constructor(root,callbacks){
  this.root=root;this.callbacks=callbacks;this.clipboard=null;this.previewSession=null;this.mode='all';this.$=id=>root.querySelector('#'+id);
  root.innerHTML=`<div class="arrange-heading"><div><h3 id="arrange-heading" tabindex="-1">整曲编排台</h3><p id="arrange-range" class="muted"></p></div><span class="arrange-tag">四声部 × 每段四小节</span></div>
   <p id="arrange-help" class="muted">每格是一段的一个声部。缩略图显示已有音符，点格进入四小节编辑；灰色格仍可编辑，加入状态与音色在格内标记。横向滑动查看全部段落。</p>
   <div id="arrange-scroll" class="arrange-scroll" tabindex="0" role="region" aria-label="横向查看全部段落"><div id="arrange-grid" class="arrange-grid" role="group" aria-label="整曲四声部总览" aria-describedby="arrange-help"></div></div>
   <p id="arrange-selection" class="arrange-selection" role="status"></p>
   <div class="arrange-tools"><button id="arrange-copy">复制所选声部片段</button><label>粘贴到段落<select id="arrange-destination"></select></label><label class="arrange-check"><input id="arrange-with-settings" type="checkbox">同时复制本段配器</label><button id="arrange-paste" disabled>粘贴片段</button></div>
   <p id="arrange-clipboard" class="muted">尚未复制片段。默认只复制音符、时长和力度；勾选配器还包括该声部本段的音色、演奏方式、起止音量和加入状态。</p>
   <div class="arrange-preview"><label>本段试听组合<select id="arrange-preview-mode"><option value="all">四声部</option><option value="duet">旋律＋和弦</option><option value="rhythm">贝斯＋鼓点</option><option value="solo">仅所选声部</option></select></label><button id="arrange-audition" aria-pressed="false">试听所选段</button><button id="arrange-stop" disabled>停止试听</button><span id="arrange-preview-hint" class="muted">按现有开关与音量试听当前四小节，组合选择不写入作品。</span></div><p id="arrange-message" role="status" aria-live="polite"></p>`;
  root.addEventListener('click',e=>{const button=e.target.closest('[data-arrange-cell]');if(button&&!button.disabled)this.callbacks.open(Number(button.dataset.section),Number(button.dataset.track));});
  this.$('arrange-grid').addEventListener('keydown',e=>this.keydown(e));
  this.$('arrange-copy').addEventListener('click',()=>this.copy());this.$('arrange-paste').addEventListener('click',()=>this.paste());
  this.$('arrange-preview-mode').addEventListener('change',()=>{this.callbacks.preview.stop();this.mode=this.$('arrange-preview-mode').value;this.update();});
  this.$('arrange-with-settings').addEventListener('change',()=>this.update());this.$('arrange-destination').addEventListener('change',()=>this.controls());
  this.$('arrange-audition').addEventListener('click',()=>this.audition());this.$('arrange-stop').addEventListener('click',()=>this.callbacks.preview.stop());
 }
 message(text,error=false){this.$('arrange-message').textContent=text;this.$('arrange-message').classList.toggle('arrange-error',error);this.callbacks.status(text);}
 update(){
  const c=this.callbacks.get();if(this.previewSession&&(this.previewSession.serialized!==JSON.stringify(c.state)||this.previewSession.index!==c.index||this.previewSession.track!==c.track||c.disabled))this.callbacks.preview.stop();
  this.ctx=c;const key=JSON.stringify(c.state);
  if(this.stateKey!==key){
   this.stateKey=key;this.sections=arrangementOverview(c.state);const grid=this.$('arrange-grid'),focus=grid.contains(document.activeElement)?{...document.activeElement.dataset}:null;grid.replaceChildren();grid.style.setProperty('--arrange-sections',c.state.sections.length);
   const corner=document.createElement('span');corner.className='arrange-corner';corner.textContent='声部 / 段落';grid.append(corner);
   for(const section of this.sections){const label=document.createElement('div');label.className='arrange-column';label.dataset.section=section.index;const name=document.createElement('b'),range=document.createElement('span');name.textContent=section.name;range.textContent=`第 ${section.start+1}–${section.start+4} 小节`;label.append(name,range);grid.append(label);}
   for(let track=0;track<4;track++){
    const label=document.createElement('div');label.className='arrange-row-label';label.textContent=TRACKS[track].name;grid.append(label);
    for(const section of this.sections){const cell=section.cells[track],button=document.createElement('button');button.type='button';button.className='arrange-cell'+(cell.audible?'':' quiet-cell');button.dataset.arrangeCell='';button.dataset.section=section.index;button.dataset.track=track;
     button.setAttribute('aria-label',`编辑「${cell.name}」${TRACKS[track].name}，第 ${section.start+1}–${section.start+4} 小节，${cell.voice}，${cell.status}，${cell.count}${track===3?'击':'组音符'}`);button.title=button.getAttribute('aria-label');
     const heading=document.createElement('span');heading.className='arrange-cell-heading';const voice=document.createElement('b'),status=document.createElement('span');voice.textContent=cell.voice;status.textContent=cell.status;heading.append(voice,status);
     const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 64 36');svg.setAttribute('preserveAspectRatio','none');svg.setAttribute('aria-hidden','true');
     for(let b=0;b<4;b++){const line=document.createElementNS(svg.namespaceURI,'path');line.setAttribute('d',`M${b*16} 0V36`);line.setAttribute('class','arrange-guide');svg.append(line);}
     for(const n of cell.rects){const rect=document.createElementNS(svg.namespaceURI,'rect');for(const k of ['x','y','width','height'])rect.setAttribute(k,String(n[k]));rect.setAttribute('class',`arrange-note level-${n.level}`);svg.append(rect);}
     const detail=document.createElement('small');detail.textContent=`${cell.count}${track===3?' 击':' 组'} · ${cell.volume}${cell.style?' · '+cell.style:''}`;button.append(heading,svg,detail);grid.append(button);
    }
   }
   const previous=this.$('arrange-destination').value;this.$('arrange-destination').replaceChildren(...this.sections.map(s=>{const o=document.createElement('option');o.value=s.index;o.textContent=`${s.index+1} · ${s.name}`;return o;}));this.$('arrange-destination').value=/^\d+$/.test(previous)&&this.sections[Number(previous)]?previous:String(c.index);
   if(focus)grid.querySelector(`[data-section="${focus.section}"][data-track="${focus.track}"]`)?.focus({preventScroll:true});
  }
  this.$('arrange-range').textContent=`${c.state.barCount} 小节 · ${c.state.sections.length} 段 · 音符内容与实际配器`;
  this.controls();
 }
 controls(){
  const c=this.ctx;if(!c)return;const section=this.sections[c.index];
  this.$('arrange-selection').textContent=`当前编辑：「${section.name}」· ${TRACKS[c.track].name} · 第 ${section.start+1}–${section.start+4} 小节`;
  for(const b of this.$('arrange-grid').querySelectorAll('[data-arrange-cell]')){const selected=Number(b.dataset.section)===c.index&&Number(b.dataset.track)===c.track;b.setAttribute('aria-pressed',String(selected));b.disabled=c.disabled;}
  for(const id of ['arrange-copy','arrange-destination','arrange-with-settings','arrange-preview-mode'])this.$(id).disabled=c.disabled;
  this.$('arrange-paste').disabled=c.disabled||!this.clipboard;
  this.$('arrange-clipboard').textContent=this.clipboard?`已复制「${this.clipboard.name}」的${TRACKS[this.clipboard.track].name}四小节快照。粘贴${this.$('arrange-with-settings').checked?'包含本段配器':'仅替换音符、时长和力度，保留目标配器'}；可一次撤销。`:'尚未复制片段。默认只复制音符、时长和力度；勾选配器还包括该声部本段的音色、演奏方式、起止音量和加入状态。';
  const tracks=combinationTracks(this.mode,c.track),audible=tracks.some(t=>section.cells[t].audible);
  this.$('arrange-preview-mode').value=this.mode;this.$('arrange-audition').disabled=c.disabled||!audible;this.$('arrange-audition').setAttribute('aria-pressed',String(Boolean(this.previewSession)));this.$('arrange-audition').textContent=this.previewSession?'停止本段试听':'试听所选段';this.$('arrange-stop').disabled=!this.previewSession;
  this.$('arrange-preview-hint').textContent=`「${section.name}」· ${tracks.map(t=>TRACKS[t].name).join('＋')}，${audible?'按现有开关与音量试听四小节':'所选组合当前没有可听内容，请检查音符、开关与音量'}。组合选择不写入作品。`;
 }
 copy(){const c=this.callbacks.get();if(c.disabled)return;try{this.clipboard=copyTrackSection(c.state,c.index,c.track);this.$('arrange-destination').value=c.index;this.controls();this.message(`已复制「${this.clipboard.name}」的${TRACKS[c.track].name}四小节快照。`);}catch(error){this.message(error.message,true);}}
 paste(){
  const c=this.callbacks.get();if(c.disabled)return;
  try{
   const index=Number(this.$('arrange-destination').value),withSettings=this.$('arrange-with-settings').checked,next=pasteTrackSection(c.state,index,this.clipboard,withSettings),serialized=JSON.stringify(c.state),clip=this.clipboard;
   if(JSON.stringify(next)===serialized){this.message('目标片段已相同，无需修改。');return;}
   const apply=()=>{const current=this.callbacks.get();if(current.disabled||JSON.stringify(current.state)!==serialized){this.message('作品已变化，本次粘贴已取消，请重新选择目标。',true);return;}this.callbacks.beforeEdit();this.callbacks.commit(next,`已将「${clip.name}」的${TRACKS[clip.track].name}粘贴到「${c.state.sections[index].name}」；可一次撤销。`,index,clip.track);this.message('片段已粘贴；可一次撤销。');};
   if(trackSectionHasNotes(c.state,index,clip.track)||withSettings)this.callbacks.confirm(`将替换「${c.state.sections[index].name}」的${TRACKS[clip.track].name}四小节${withSettings?'内容及本段配器':'音符内容，保留目标配器'}。${clip.notes.bars.every(b=>b.every(n=>clip.track===3?n===0:n<0))?'复制的是空白片段，目标音符会清空。':''}其他声部保留，可一次撤销。`,apply,'粘贴并替换');else apply();
  }catch(error){this.message(error.message,true);}
 }
 async audition(){
  const c=this.callbacks.get();if(c.disabled)return;if(this.previewSession){this.callbacks.preview.stop();return;}
  this.callbacks.beforeEdit();const session={serialized:JSON.stringify(c.state),index:c.index,track:c.track};this.previewSession=session;this.lastRequest=session;
  try{const played=await this.callbacks.preview.playCombination(c.state,c.index*4,combinationTracks(this.mode,c.track),active=>{if(this.previewSession!==session)return;if(!active){this.previewSession=null;this.playback({playing:false});this.callbacks.previewEnded?.();}this.controls();this.message(active?'正在准备或试听当前段的组合；作品未改变。':'组合试听已停止。');});if(!played&&this.previewSession===session){this.previewSession=null;this.controls();this.message('当前组合没有可听内容，请检查开关、音量与音符。');}}
  catch{if(this.lastRequest===session){this.previewSession=null;this.controls();this.message('浏览器未能开始试听，请重试；作品已保留。',true);}}
 }
 playback(view){for(const b of this.$('arrange-grid').querySelectorAll('[data-section]'))b.classList.toggle('arrange-playing',Boolean(view.playing)&&Number(b.dataset.section)===Math.floor(view.bar/4));}
 keydown(e){const b=e.target.closest('[data-arrange-cell]');if(!b||this.ctx.disabled)return;const delta={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];if(!delta)return;e.preventDefault();const section=Math.max(0,Math.min(this.sections.length-1,Number(b.dataset.section)+delta[0])),track=Math.max(0,Math.min(3,Number(b.dataset.track)+delta[1]));this.$('arrange-grid').querySelector(`[data-section="${section}"][data-track="${track}"]`)?.focus();}
}
