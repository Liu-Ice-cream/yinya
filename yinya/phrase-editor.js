import {phraseNotes,editPhrase,copyPhrase,pastePhrase,phraseRectangle} from './phrase.js';
import {PITCH_VALUES,pitchRows,pitchName,chordName} from './theory.js';
import {VELOCITIES} from './model.js';

import {harmonicRunsAt} from './accompaniment.js';
const LABEL=72,ROW=24,HEADER=58;
const move=(steps,semitones=0)=>({type:'move',steps,semitones});
export class PhraseEditor {
  constructor(root,callbacks) {
    this.root=root;this.callbacks=callbacks;this.selection=new Set();this.cursor=0;this.cursorPitch=null;this.clipboard=null;this.gesture=null;this.pending=null;this.drawLength=4;this.drawVelocity=1;this.ignoreClickUntil=0;
    root.innerHTML=`<div class="roll-heading"><div><h3>乐句编辑台</h3><p class="muted" id="roll-range"></p></div><button id="roll-audition" aria-pressed="false">试听四声部</button></div>
      <div class="roll-tools"><label>操作模式<select id="roll-mode"><option value="select">选择与移动</option><option value="draw">点格写音符</option></select></label><label>新音符时长<select id="roll-new-length"><option value="1">1 格</option><option value="2">2 格</option><option value="4" selected>4 格 · 1 拍</option><option value="8">8 格 · 2 拍</option><option value="16">16 格 · 1 小节</option><option value="32">32 格 · 2 小节</option></select></label><label>显示大小<select id="roll-zoom"><option value="fit">自动大小</option><option value="18">放大</option><option value="26">更大</option></select></label><label class="roll-check"><input type="checkbox" id="roll-multi">多选</label></div>
      <div class="roll-scroll" id="roll-scroll"><div class="roll-surface" id="roll-surface" tabindex="0" role="group" aria-label="四小节乐句网格" aria-describedby="roll-help"><div class="roll-bars" id="roll-bars"></div><div class="roll-harmony" id="roll-harmony"></div><div id="roll-rows"></div><div class="roll-notes" id="roll-notes"></div><div class="roll-target" id="roll-target" aria-hidden="true"></div><div class="roll-cursor" id="roll-cursor" aria-hidden="true"></div><div class="roll-playhead" id="roll-playhead" hidden aria-hidden="true"></div><div class="roll-box" id="roll-box" hidden aria-hidden="true"></div></div></div>
      <p id="roll-help" class="muted">选择模式：点音符选中，拖空白框选；Shift 点选或勾选多选。拖音符移动，拖右端改长度。最长 32 格，可跨小节，不越过当前段。手机可滑动查看，用下方按钮编辑；网格获焦后方向键移动，Enter 在光标处写音符。</p>
      <div class="roll-selection-tools"><span id="roll-selection" role="status"></span><button data-roll-action="all">本段全选</button><button data-roll-action="half">选前两小节</button><button data-roll-action="none">取消选择</button><button id="roll-copy" data-roll-action="copy">复制音符</button><button id="roll-delete" data-roll-action="delete">删除所选</button></div>
      <div class="roll-edit-tools"><div class="roll-nudges"><button data-roll-action="left" aria-label="所选音符左移一格">← 一格</button><button data-roll-action="right" aria-label="所选音符右移一格">一格 →</button><button data-roll-action="up" aria-label="所选音符升半音">↑ 半音</button><button data-roll-action="down" aria-label="所选音符降半音">↓ 半音</button><button data-roll-action="shorter">缩短一格</button><button data-roll-action="longer">延长一格</button><button data-roll-action="join" title="连接首尾相接、音高与力度相同的音符，最长 32 格">连接同音</button><button data-roll-action="split" title="在小节线处分成独立起音，保留音高与力度">按小节断开</button></div><label>所选时长<select id="roll-length"><option value="mixed" disabled>多种时长</option><option value="custom" disabled>自定义时长</option><option value="1">1 格</option><option value="2">2 格</option><option value="4">4 格 · 1 拍</option><option value="8">8 格 · 2 拍</option><option value="16">16 格 · 1 小节</option><option value="32">32 格 · 2 小节</option></select></label><label>音符力度<select id="roll-velocity"><option value="mixed" disabled>多种力度</option><option value="0">轻</option><option value="1" selected>标准</option><option value="2">重</option></select></label></div>
      <div class="roll-paste-tools"><label>起点小节<select id="roll-cursor-bar"></select></label><label>起点格<select id="roll-cursor-step"></select></label><button id="roll-paste" data-roll-action="paste">粘贴到起点</button><span id="roll-cursor-info" class="muted"></span><span id="roll-clipboard" class="muted">尚未复制音符</span></div><p id="roll-message" role="status" aria-live="polite">先选择几个音符，或切换到点格写音符。所有批量修改均可一次撤销。</p>`;
    this.$=id=>root.querySelector('#'+id);this.board=this.$('roll-surface');this.scroll=this.$('roll-scroll');
    this.$('roll-cursor-step').replaceChildren(...Array.from({length:16},(_,i)=>this.option(i,`第 ${i+1} 格`)));
    root.addEventListener('click',e=>this.click(e));root.addEventListener('keydown',e=>this.keydown(e));
    this.board.addEventListener('pointerdown',e=>this.pointerdown(e));this.board.addEventListener('pointermove',e=>this.pointermove(e));
    this.board.addEventListener('pointerup',e=>this.pointerup(e));this.board.addEventListener('pointercancel',()=>this.cancelGesture());this.board.addEventListener('lostpointercapture',()=>{if(this.gesture)this.cancelGesture();});
    window.addEventListener('pointerup',e=>{if(this.canceledPointer===e.pointerId){this.ignoreClickUntil=performance.now()+350;this.canceledPointer=null;}},true);
    for(const id of ['roll-cursor-bar','roll-cursor-step'])this.$(id).addEventListener('change',()=>{this.cursor=Number(this.$('roll-cursor-bar').value)*16+Number(this.$('roll-cursor-step').value);this.drawCursor();});
    this.$('roll-new-length').addEventListener('change',e=>{this.drawLength=Number(e.target.value);});
    this.$('roll-zoom').addEventListener('change',()=>{this.cancelGesture();this.layout();});
    this.$('roll-mode').addEventListener('change',()=>{this.cancelGesture();this.board.classList.toggle('drawing',this.$('roll-mode').value==='draw');});
    this.$('roll-length').addEventListener('change',e=>{const duration=Number(e.target.value);this.callbacks.beforeEdit();this.apply({type:'length',duration},'所选音符时长已更新');});
    this.$('roll-velocity').addEventListener('change',e=>{this.drawVelocity=Number(e.target.value);if(this.selection.size)this.apply({type:'velocity',level:this.drawVelocity},'所选音符力度已更新');});
    this.$('roll-audition').addEventListener('click',()=>callbacks.auditionPhrase());
    window.addEventListener('blur',()=>this.cancelGesture());document.addEventListener('visibilitychange',()=>{if(document.hidden)this.cancelGesture();});
    this.observer=new ResizeObserver(()=>{if(this.ctx?.active&&this.scroll.clientWidth!==this.lastWidth){this.cancelGesture();this.layout();}});this.observer.observe(this.scroll);
  }
  option(value,text){const option=document.createElement('option');option.value=value;option.textContent=text;return option;}
  update() {
    const c=this.callbacks.get();this.root.hidden=!c.active;
    if(!c.active){this.cancelGesture();return;}
    const key=`${c.track}:${c.state.sections[c.start/4].id}:${c.start}`;
    if(this.gesture&&(this.gesture.serialized!==JSON.stringify(c.state)||this.gesture.key!==key||c.disabled))this.cancelGesture();
    if(key!==this.key||c.state!==this.lastState){this.selection=new Set(this.pending&&key===this.key?this.pending:[]);this.pending=null;if(key!==this.key){this.cursor=0;this.cursorPitch=null;}}
    this.key=key;this.lastState=c.state;this.ctx=c;this.notes=phraseNotes(c.state,c.track,c.start);
    this.selection=new Set([...this.selection].filter(step=>this.notes.some(n=>n.step===step)));
    const rows=new Map();for(let bar=c.start;bar<c.start+4;bar++)for(const row of pitchRows(c.state,c.track,bar,c.range,c.naming))rows.set(row.id,row);
    this.rows=[...rows.values()].sort((a,b)=>PITCH_VALUES[b.id]-PITCH_VALUES[a.id]);if(!this.rows.some(r=>r.id===this.cursorPitch))this.cursorPitch=this.rows[Math.floor(this.rows.length/2)].id;
    this.$('roll-range').textContent=`${c.track===0?'旋律':'贝斯'} · 「${c.state.sections[c.start/4].name}」· 第 ${c.start+1}–${c.start+4} 小节 · 和弦仅作参考`;
    this.$('roll-cursor-bar').replaceChildren(...Array.from({length:4},(_,i)=>this.option(i,`第 ${c.start+i+1} 小节`)));
    this.layout();this.controls();
  }
  layout() {
    if(!this.ctx?.active)return;
    this.lastWidth=this.scroll.clientWidth;
    this.stepSize=this.$('roll-zoom').value==='fit'?(this.lastWidth>=600?(this.lastWidth-LABEL)/64:18):Number(this.$('roll-zoom').value);
    this.board.style.setProperty('--roll-step',this.stepSize+'px');this.board.style.height=HEADER+this.rows.length*ROW+'px';
    const bars=this.$('roll-bars'),harmony=this.$('roll-harmony');bars.replaceChildren();harmony.replaceChildren();
    const corner=document.createElement('span');corner.className='roll-corner';corner.textContent='小节 / 拍';bars.append(corner);
    const chordCorner=document.createElement('span');chordCorner.className='roll-corner';chordCorner.textContent='和弦';harmony.append(chordCorner);
    for(let bar=0;bar<4;bar++){
      const label=document.createElement('span');label.textContent=`第 ${this.ctx.start+bar+1} 小节`;bars.append(label);
      let chord=-1;
      for(let beat=0;beat<4;beat++){const id=this.ctx.state.tracks[1].bars[this.ctx.start+bar][beat];chord=harmonicRunsAt(this.ctx.state,this.ctx.start+bar).find(n=>beat*4>=n.start&&beat*4<n.end)?.chord??-1;const cell=document.createElement('span');cell.textContent=chord<0?'—':chordName(this.ctx.state,chord);cell.title=`第 ${this.ctx.start+bar+1} 小节第 ${beat+1} 拍：${chord<0?'无和弦':chordName(this.ctx.state,chord)}${id<0&&chord>=0?'（延续和声）':''}`;harmony.append(cell);}
    }
    this.$('roll-rows').replaceChildren(...this.rows.map(row=>{const line=document.createElement('div');line.className='roll-row'+(row.outside?' outside-scale':'');const label=document.createElement('span');label.className='roll-pitch';label.textContent=row.label;label.title=row.outside?'已有音阶外音，保持可编辑':row.label;line.append(label);return line;}));
    this.drawNotes();this.drawCursor();
  }
  drawNotes(notes=this.notes,selection=this.selection,invalid=false) {
    const focused=this.board.contains(document.activeElement)?document.activeElement.dataset.noteStep:null;
    const layer=this.$('roll-notes');layer.classList.toggle('invalid',invalid);
    layer.replaceChildren(...notes.flatMap(n=>{
      const row=this.rows.findIndex(r=>r.id===n.pitch);if(row<0)return [];
      const note=document.createElement('button');note.type='button';note.className=`roll-note velocity-${n.velocity}`;note.dataset.noteStep=n.step;
      note.style.left=n.step*this.stepSize+1+'px';note.style.top=row*ROW+3+'px';note.style.width=Math.max(4,n.duration*this.stepSize-2)+'px';
      note.setAttribute('aria-pressed',String(selection.has(n.step)));note.setAttribute('aria-label',`${pitchName(this.ctx.state,this.ctx.track,n.pitch,this.ctx.naming)}，第 ${this.ctx.start+Math.floor(n.step/16)+1} 小节第 ${n.step%16+1} 格，时长 ${n.duration} 格，力度${VELOCITIES[n.velocity].name}`);
      const crossing=n.step%16+n.duration>16;
      if(crossing){note.classList.add('roll-held');note.setAttribute('aria-label',note.getAttribute('aria-label')+'，跨小节延音，整体编辑');}
      note.title=note.getAttribute('aria-label');const text=document.createElement('span');text.className='roll-note-text';text.textContent=n.duration*this.stepSize>48?pitchName(this.ctx.state,this.ctx.track,n.pitch,'notes')+(crossing?' · 延音':''):'•';
      const handle=document.createElement('span');handle.className='roll-resize';handle.setAttribute('aria-hidden','true');handle.title='拖动右端调整长度';note.append(text,handle);note.disabled=this.ctx.disabled;return [note];
    }));
    if(focused!==null&&!this.gesture){const target=layer.querySelector(`[data-note-step="${focused}"]`);(target||this.board).focus({preventScroll:true});}
  }
  drawCursor(){if(!this.ctx)return;this.$('roll-cursor').style.left=LABEL+this.cursor*this.stepSize+'px';this.$('roll-cursor-bar').value=Math.floor(this.cursor/16);this.$('roll-cursor-step').value=this.cursor%16;const target=this.$('roll-target');target.style.left=LABEL+this.cursor*this.stepSize+'px';target.style.top=HEADER+Math.max(0,this.rows.findIndex(r=>r.id===this.cursorPitch))*ROW+'px';target.style.width=this.stepSize+'px';this.$('roll-cursor-info').textContent='写入光标：'+pitchName(this.ctx.state,this.ctx.track,this.cursorPitch,this.ctx.naming);}
  controls() {
    const count=this.selection.size,hidden=this.notes.filter(n=>!this.rows.some(r=>r.id===n.pitch)).length;
    this.$('roll-selection').textContent=`已选 ${count} 个音符${hidden?` · ${hidden} 个音符在显示音域外`:''}`;
    for(const button of this.root.querySelectorAll('[data-roll-action]')){const action=button.dataset.rollAction;button.disabled=this.ctx.disabled||(['all','half'].includes(action)?!this.notes.length:action==='paste'?!this.clipboard:action==='none'?!count:!count);}
    const levels=[...new Set(this.notes.filter(n=>this.selection.has(n.step)).map(n=>n.velocity))];this.$('roll-velocity').value=levels.length>1?'mixed':levels[0]??this.drawVelocity;
    for(const control of this.root.querySelectorAll('select,input'))control.disabled=this.ctx.disabled;
    const lengths=[...new Set(this.notes.filter(n=>this.selection.has(n.step)).map(n=>n.duration))];this.$('roll-length').value=lengths.length>1?'mixed':[1,2,4,8,16,32].includes(lengths[0])?lengths[0]:'custom';this.$('roll-length').disabled=this.ctx.disabled||!count;
    this.$('roll-clipboard').textContent=this.clipboard?`已复制 ${this.clipboard.notes.length} 个音符（仅本页面内）`:'尚未复制音符';this.setAudition(this.ctx.auditioning);this.drawCursor();
  }
  setAudition(active){if(!active)this.$('roll-playhead').hidden=true;this.$('roll-audition').textContent=active?'停止四声部试听':'试听四声部';this.$('roll-audition').setAttribute('aria-pressed',String(active));if(this.ctx)this.$('roll-audition').disabled=this.ctx.disabled||!this.callbacks.get().canAudition;}
  message(text,error=false){this.$('roll-message').textContent=text;this.$('roll-message').classList.toggle('roll-error',error);this.callbacks.status(text);}
  point(e){const rect=this.board.getBoundingClientRect();return {step:Math.floor((e.clientX-rect.left-LABEL)/this.stepSize),row:Math.floor((e.clientY-rect.top-HEADER)/ROW)};}
  pitchAt(row){if(row<0)return PITCH_VALUES[this.rows[0].id]-row;if(row>=this.rows.length)return PITCH_VALUES[this.rows.at(-1).id]-(row-this.rows.length+1);return PITCH_VALUES[this.rows[row].id];}
  click(e) {
    const action=e.target.closest('[data-roll-action]');if(action){if(!action.disabled)this.action(action.dataset.rollAction);return;}
    if(!this.board.contains(e.target)||this.ctx.disabled||e.detail>0&&performance.now()<this.ignoreClickUntil)return;
    const note=e.target.closest('[data-note-step]');if(note){this.selectNote(Number(note.dataset.noteStep),e.shiftKey||this.$('roll-multi').checked);return;}
    const p=this.point(e);if(p.step<0||p.step>=64||p.row<0||p.row>=this.rows.length)return;
    this.callbacks.beforeEdit();this.cursor=p.step;this.cursorPitch=this.rows[p.row].id;
    if(this.$('roll-mode').value==='draw')this.insert(p);else{this.selection.clear();this.drawNotes();this.controls();}
  }
  selectNote(step,add=false) {
    this.callbacks.beforeEdit();if(add){if(this.selection.has(step))this.selection.delete(step);else this.selection.add(step);}else this.selection=new Set([step]);
    this.cursor=step;this.cursorPitch=this.notes.find(n=>n.step===step).pitch;this.drawNotes();this.controls();if(this.selection.size===1)this.callbacks.auditionNote(this.notes.find(n=>n.step===step));
  }
  action(action) {
    this.callbacks.beforeEdit();
    if(action==='all'||action==='half'||action==='none'){this.selection=new Set(action==='none'?[]:this.notes.filter(n=>action==='all'||n.step<32).map(n=>n.step));this.drawNotes();this.controls();return;}
    if(action==='copy'){try{this.clipboard=copyPhrase(this.ctx.state,this.ctx.track,this.ctx.start,[...this.selection]);this.message(`已复制 ${this.selection.size} 个音符；选择起点后粘贴。`);this.controls();}catch(error){this.message(error.message,true);}return;}
    if(action==='paste'){this.apply(null,'音符已粘贴',true);return;}
    const actions={left:move(-1),right:move(1),up:move(0,1),down:move(0,-1),shorter:{type:'resize',delta:-1},longer:{type:'resize',delta:1},delete:{type:'delete'},join:{type:'join'},split:{type:'split'}};
    if(actions[action])this.apply(actions[action],action==='delete'?'所选音符已删除':'所选音符已调整');
  }
  insert(point){const row=this.rows[point.row];if(!row)return;this.selection.clear();this.apply({type:'insert',step:point.step,pitch:row.id,duration:this.drawLength,velocity:this.drawVelocity},'音符已添加');}
  apply(action,message,paste=false,base=null) {
    try {
      const c=this.callbacks.get();if(!c.active||c.disabled)throw new Error('当前不能编辑乐句');
      if(base&&(base.key!==this.key||base.serialized!==JSON.stringify(c.state)))throw new Error('作品或编辑范围已变化，请重新操作');
      const result=paste?pastePhrase(c.state,c.track,c.start,this.cursor,this.clipboard):editPhrase(c.state,c.track,c.start,[...this.selection],action);
      if(JSON.stringify(result.state)===JSON.stringify(c.state)){this.message('音符没有变化。');this.drawNotes();return;}
      if(result.selection.length){this.cursor=result.selection[0];this.cursorPitch=phraseNotes(result.state,c.track,c.start).find(n=>n.step===this.cursor).pitch;}this.pending=result.selection;this.callbacks.commit(result.state,message+'；可一次撤销。');this.message(message+'；可一次撤销。');
      if(result.selection.length===1)this.callbacks.auditionNote(this.notes.find(n=>n.step===result.selection[0]));
      if(paste&&result.selection.length)this.reveal(result.selection[0]);
    } catch(error){this.pending=null;this.message(error.message,true);this.drawNotes();this.controls();}
  }
  reveal(step){const x=LABEL+step*this.stepSize;if(x<this.scroll.scrollLeft+LABEL||x>this.scroll.scrollLeft+this.scroll.clientWidth-this.stepSize)this.scroll.scrollLeft=Math.max(0,x-LABEL-this.stepSize*2);}
  pointerdown(e) {
    if(e.pointerType==='touch'||e.button!==0||this.ctx.disabled)return;
    const p=this.point(e);if(e.target.closest('.roll-bars,.roll-harmony,.roll-pitch')||p.step<0||p.step>=64||p.row<0||p.row>=this.rows.length)return;
    e.preventDefault();this.canceledPointer=null;this.callbacks.beforeEdit();const note=e.target.closest('[data-note-step]'),step=note?Number(note.dataset.noteStep):null;
    this.gesture={pointer:e.pointerId,x:e.clientX,y:e.clientY,from:p,step,kind:note?(e.target.closest('.roll-resize')?'resize':'move'):this.$('roll-mode').value==='draw'?'insert':'box',add:e.shiftKey||this.$('roll-multi').checked,key:this.key,serialized:JSON.stringify(this.ctx.state),base:this.ctx.state,moved:false,originalSelection:new Set(this.selection)};
    this.board.setPointerCapture(e.pointerId);
  }
  pointermove(e) {
    const g=this.gesture;if(!g||g.pointer!==e.pointerId)return;const p=this.point(e);g.to=p;
    if(Math.hypot(e.clientX-g.x,e.clientY-g.y)<4&&!g.moved)return;g.moved=true;
    if(g.kind==='box'){
      const selected=phraseRectangle(this.notes,{step:g.from.step,pitch:this.pitchAt(g.from.row)},{step:p.step,pitch:this.pitchAt(p.row)});g.selected=new Set([...(g.add?g.originalSelection:[]),...selected]);
      this.drawNotes(this.notes,g.selected);const box=this.$('roll-box');box.hidden=false;box.style.left=LABEL+Math.max(0,Math.min(g.from.step,p.step))*this.stepSize+'px';box.style.top=HEADER+Math.max(0,Math.min(g.from.row,p.row))*ROW+'px';box.style.width=(Math.min(63,Math.max(g.from.step,p.step))-Math.max(0,Math.min(g.from.step,p.step))+1)*this.stepSize+'px';box.style.height=(Math.min(this.rows.length-1,Math.max(g.from.row,p.row))-Math.max(0,Math.min(g.from.row,p.row))+1)*ROW+'px';return;
    }
    if(g.kind==='insert')return;
    if(!this.selection.has(g.step))this.selection=new Set(g.add?[...g.originalSelection,g.step]:[g.step]);
    const dx=p.step-g.from.step;
    g.action=g.kind==='resize'?{type:'resize',delta:dx}:move(dx,this.pitchAt(p.row)-this.pitchAt(g.from.row));
    try{const result=editPhrase(g.base,this.ctx.track,this.ctx.start,[...this.selection],g.action);this.drawNotes(phraseNotes(result.state,this.ctx.track,this.ctx.start),new Set(result.selection));g.error=null;this.$('roll-message').textContent='松开后应用，Esc 可取消；作品尚未改变。';this.$('roll-message').classList.remove('roll-error');}
    catch(error){g.error=error.message;this.drawNotes(this.notes,this.selection,true);this.$('roll-message').textContent=error.message;this.$('roll-message').classList.add('roll-error');}
  }
  pointerup(e) {
    const g=this.gesture;if(!g||g.pointer!==e.pointerId)return;this.gesture=null;this.$('roll-box').hidden=true;if(this.board.hasPointerCapture(e.pointerId))this.board.releasePointerCapture(e.pointerId);this.ignoreClickUntil=performance.now()+350;
    if(g.serialized!==JSON.stringify(this.callbacks.get().state)||g.key!==this.key){this.message('作品已变化，本次拖动已取消。',true);this.update();return;}
    if(!g.moved){if(g.step!==null)this.selectNote(g.step,g.add);else{this.cursor=g.from.step;this.cursorPitch=this.rows[g.from.row].id;if(g.kind==='insert')this.insert(g.from);else{if(!g.add)this.selection.clear();this.drawNotes();this.controls();}}return;}
    if(g.kind==='box'){this.selection=g.selected||new Set();this.drawNotes();this.controls();return;}
    if(g.kind==='insert'){const p=g.to||g.from;if(p.step>=0&&p.step<64&&p.row>=0&&p.row<this.rows.length){this.cursor=p.step;this.cursorPitch=this.rows[p.row].id;this.insert(p);}return;}
    if(g.error){this.message(g.error,true);this.drawNotes();this.controls();return;}
    if(g.action)this.apply(g.action,g.kind==='resize'?'音符长度已调整':'音符已移动',false,g);
  }
  cancelGesture(){const g=this.gesture;if(!g)return;this.gesture=null;this.canceledPointer=g.pointer;if(this.board.hasPointerCapture(g.pointer))this.board.releasePointerCapture(g.pointer);this.$('roll-box').hidden=true;this.selection=g.originalSelection;this.drawNotes();this.controls();this.$('roll-message').textContent='本次拖动已取消，作品内容保留。';}
  keydown(e) {
    if(!this.board.contains(e.target)||this.ctx.disabled||['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName))return;
    if(e.key==='Escape'){e.preventDefault();if(this.gesture)this.cancelGesture();else this.action('none');return;}
    if(this.gesture)return;
    const mod=e.ctrlKey||e.metaKey,key=e.key.toLowerCase();
    if(mod&&['a','c','v'].includes(key)){e.preventDefault();this.action({a:'all',c:'copy',v:'paste'}[key]);return;}
    if(['Delete','Backspace'].includes(e.key)){e.preventDefault();if(this.selection.size)this.action('delete');return;}
    const actions={ArrowLeft:'left',ArrowRight:'right',ArrowUp:'up',ArrowDown:'down'};
    if(actions[e.key]){e.preventDefault();if(this.selection.size)this.action(actions[e.key]);else{if(e.key==='ArrowLeft'||e.key==='ArrowRight')this.cursor=Math.max(0,Math.min(63,this.cursor+(e.key==='ArrowLeft'?-1:1)));else{const row=this.rows.findIndex(r=>r.id===this.cursorPitch);this.cursorPitch=this.rows[Math.max(0,Math.min(this.rows.length-1,row+(e.key==='ArrowUp'?-1:1)))].id;}this.drawCursor();}return;}
    if(e.key==='Enter'&&e.target===this.board){e.preventDefault();this.callbacks.beforeEdit();this.insert({step:this.cursor,row:this.rows.findIndex(r=>r.id===this.cursorPitch)});}
  }
  playback(view){if(!this.ctx?.active)return;const active=view.playing&&view.bar>=this.ctx.start&&view.bar<this.ctx.start+4,line=this.$('roll-playhead');line.hidden=!active;if(active)line.style.left=LABEL+((view.bar-this.ctx.start)*16+view.step)*this.stepSize+'px';}
}
