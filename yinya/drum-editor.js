import {drumHits,drumKey,editDrums,copyDrums,pasteDrums,drumRectangle} from './drums.js';
const LANES=['低鼓','小鼓','沙帽'],LEVELS=['轻','标准','重'];
export class DrumEditor {
  constructor(root,callbacks){
    this.root=root;this.callbacks=callbacks;this.selection=new Set();this.clipboard=null;this.cursor=0;this.lane=0;this.velocity=1;this.pending=null;this.gesture=null;this.ignoreClickUntil=0;
    root.innerHTML=`<div class="roll-heading"><div><h3>鼓点编辑台</h3><p id="drum-roll-range" class="muted"></p></div><button id="drum-roll-audition" aria-pressed="false">试听四声部</button></div>
      <div class="roll-tools"><label>写入力度<select id="drum-roll-level"><option value="0">轻</option><option value="1" selected>标准</option><option value="2">重</option></select></label><button data-drum-action="velocity">设置所选力度</button><label class="roll-check"><input type="checkbox" id="drum-roll-multi">多选</label><button data-drum-action="all">本段全选</button><button data-drum-action="none">取消选择</button></div>
      <div class="drum-roll-scroll" id="drum-roll-scroll"><div id="drum-roll-board" class="drum-roll-board" role="group" aria-label="四小节鼓点网格" tabindex="0" aria-describedby="drum-roll-help"><div id="drum-roll-grid" class="drum-roll-grid"></div><div id="drum-roll-box" class="drum-roll-box" hidden aria-hidden="true"></div><div id="drum-roll-head" class="drum-roll-head" hidden aria-hidden="true"></div></div></div>
      <p id="drum-roll-help" class="muted">点空格写入，点鼓点选中；拖空白框选，拖鼓点移动。Shift 点选或勾选多选。每行力度独立，深色表示重音。手机可横向滑动，并使用下方按钮编辑。</p>
      <div class="roll-selection-tools"><span id="drum-roll-selection" role="status"></span><button data-drum-action="copy">复制鼓点</button><button data-drum-action="delete">删除所选</button><button data-drum-action="left">← 一格</button><button data-drum-action="right">一格 →</button><button data-drum-action="up">↑ 一行</button><button data-drum-action="down">↓ 一行</button></div>
      <div class="roll-paste-tools"><label>起点小节<select id="drum-roll-bar"></select></label><label>起点格<select id="drum-roll-step"></select></label><button data-drum-action="paste">粘贴到起点</button><span id="drum-roll-clipboard" class="muted">尚未复制鼓点</span></div><p id="drum-roll-message" role="status" aria-live="polite"></p>`;
    this.$=id=>root.querySelector('#'+id);this.board=this.$('drum-roll-board');this.scroll=this.$('drum-roll-scroll');
    this.$('drum-roll-step').replaceChildren(...Array.from({length:16},(_,i)=>this.option(i,`第 ${i+1} 格`)));
    this.$('drum-roll-level').addEventListener('change',e=>{this.velocity=Number(e.target.value);});
    for(const id of ['drum-roll-bar','drum-roll-step'])this.$(id).addEventListener('change',()=>{this.cursor=Number(this.$('drum-roll-bar').value)*16+Number(this.$('drum-roll-step').value);this.controls();});
    root.addEventListener('click',e=>this.click(e));root.addEventListener('keydown',e=>this.keydown(e));
    this.$('drum-roll-audition').addEventListener('click',()=>callbacks.audition());
    this.board.addEventListener('pointerdown',e=>this.pointerdown(e));this.board.addEventListener('pointermove',e=>this.pointermove(e));this.board.addEventListener('pointerup',e=>this.pointerup(e));
    for(const name of ['pointercancel','lostpointercapture'])this.board.addEventListener(name,()=>this.cancelGesture());
    window.addEventListener('pointerup',e=>{if(this.canceledPointer===e.pointerId){this.ignoreClickUntil=performance.now()+350;this.canceledPointer=null;}},true);
    window.addEventListener('blur',()=>this.cancelGesture());document.addEventListener('visibilitychange',()=>{if(document.hidden)this.cancelGesture();});
    this.observer=new ResizeObserver(()=>{if(this.ctx?.active&&this.scroll.clientWidth!==this.width){this.cancelGesture();this.layout();}});this.observer.observe(this.scroll);
  }
  option(value,text){const o=document.createElement('option');o.value=value;o.textContent=text;return o;}
  message(text,error=false){this.$('drum-roll-message').textContent=text;this.$('drum-roll-message').classList.toggle('roll-error',error);this.callbacks.status(text);}
  update(){
    const c=this.callbacks.get();this.root.hidden=!c.active;if(!c.active){this.cancelGesture();return;}
    const key=`${c.start}:${c.state.sections[c.start/4].id}`;
    if(this.gesture&&(this.gesture.serialized!==JSON.stringify(c.state)||this.key!==key||c.disabled))this.cancelGesture();
    if(this.key!==key||this.lastState!==c.state){this.selection=new Set(this.pending&&this.key===key?this.pending:[]);this.pending=null;if(this.key!==key)this.cursor=0;}
    this.key=key;this.lastState=c.state;this.ctx=c;this.notes=drumHits(c.state,c.start);this.selection=new Set([...this.selection].filter(k=>this.notes.some(n=>drumKey(n)===k)));
    this.$('drum-roll-range').textContent=`「${c.state.sections[c.start/4].name}」· 第 ${c.start+1}–${c.start+4} 小节 · 三行可同时发声`;
    this.$('drum-roll-bar').replaceChildren(...Array.from({length:4},(_,i)=>this.option(i,`第 ${c.start+i+1} 小节`)));
    this.layout();this.controls();
  }
  layout(){
    if(!this.ctx)return;this.width=this.scroll.clientWidth;this.cell=Math.max(this.width<600?22:12,(this.width-57)/64);this.board.style.setProperty('--drum-cell',this.cell+'px');
    const grid=this.$('drum-roll-grid'),focused=grid.contains(document.activeElement)?document.activeElement.dataset.key:null;grid.replaceChildren();
    const corner=document.createElement('span');corner.className='drum-row-label';grid.append(corner);
    for(let i=0;i<4;i++){const b=document.createElement('span');b.className='drum-bar-label';b.textContent=`第 ${this.ctx.start+i+1} 小节`;b.style.gridColumn=`${2+i*16} / span 16`;grid.append(b);}
    for(let lane=2;lane>=0;lane--){const label=document.createElement('span');label.className='drum-row-label';label.textContent=LANES[lane];grid.append(label);for(let step=0;step<64;step++){const key=step*3+lane,n=this.notes.find(n=>drumKey(n)===key),b=document.createElement('button');b.type='button';b.className='drum-roll-cell'+(step%4===0?' beat':'')+(step%16===0?' bar':'')+(n?` hit velocity-${n.velocity}`:'');b.dataset.key=key;b.dataset.step=step;b.dataset.lane=lane;b.setAttribute('aria-label',`${LANES[lane]}，第 ${this.ctx.start+Math.floor(step/16)+1} 小节第 ${step%16+1} 格，${n?'力度'+LEVELS[n.velocity]+'，点按选中':'空格，点按写入'}`);b.setAttribute('aria-pressed',String(n?this.selection.has(key):false));b.disabled=this.ctx.disabled;grid.append(b);}}
    if(focused!==null)grid.querySelector(`[data-key="${focused}"]`)?.focus({preventScroll:true});
  }
  controls(){
    if(!this.ctx)return;this.$('drum-roll-selection').textContent=`已选 ${this.selection.size} 个鼓点`;
    for(const b of this.root.querySelectorAll('[data-drum-action]'))b.disabled=this.ctx.disabled||(['copy','delete','left','right','up','down','velocity'].includes(b.dataset.drumAction)&&!this.selection.size)||(b.dataset.drumAction==='paste'&&!this.clipboard);
    this.$('drum-roll-level').disabled=this.$('drum-roll-multi').disabled=this.$('drum-roll-bar').disabled=this.$('drum-roll-step').disabled=this.ctx.disabled;
    this.$('drum-roll-bar').value=Math.floor(this.cursor/16);this.$('drum-roll-step').value=this.cursor%16;
    this.$('drum-roll-clipboard').textContent=this.clipboard?`已复制 ${this.clipboard.hits.length} 个鼓点，保留行与力度`:'尚未复制鼓点';
    this.$('drum-roll-audition').disabled=this.ctx.disabled||!this.ctx.canAudition;this.$('drum-roll-audition').setAttribute('aria-pressed',String(this.ctx.auditioning));
    for(const b of this.$('drum-roll-grid').querySelectorAll('[data-key]')){b.classList.toggle('selected',this.selection.has(Number(b.dataset.key)));b.classList.toggle('cursor',Number(b.dataset.step)===this.cursor&&Number(b.dataset.lane)===this.lane);if(b.classList.contains('hit'))b.setAttribute('aria-pressed',String(this.selection.has(Number(b.dataset.key))));}
  }
  result(result,message){this.pending=result.selection;this.callbacks.commit(result.state,message+'；可一次撤销。');this.message(message+'；可一次撤销。');}
  apply(action){if(this.ctx?.disabled)return;this.callbacks.beforeEdit();try{this.result(editDrums(this.ctx.state,this.ctx.start,[...this.selection],action),'鼓点已更新');}catch(error){this.pending=null;this.message(error.message,true);}}
  action(name){
    if(!this.ctx||this.ctx.disabled)return;
    try{if(name==='all')this.selection=new Set(this.notes.map(drumKey));else if(name==='none')this.selection.clear();else if(name==='copy'){this.clipboard=copyDrums(this.ctx.state,this.ctx.start,[...this.selection]);this.message('鼓点已复制；选择起点后粘贴，重叠或越界会整次取消。');}else if(name==='paste'){this.callbacks.beforeEdit();this.result(pasteDrums(this.ctx.state,this.ctx.start,this.cursor,this.clipboard),'鼓点已粘贴');}else if(name==='velocity')this.apply({type:'velocity',level:this.velocity});else if(name==='delete')this.apply({type:'delete'});else{const [steps,lanes]={left:[-1,0],right:[1,0],up:[0,1],down:[0,-1]}[name]??[];this.apply({type:'move',steps,lanes});}this.controls();}catch(error){this.pending=null;this.message(error.message,true);}
  }
  click(e,fromPointer=false){
    const action=e.target.closest('[data-drum-action]');if(action){this.action(action.dataset.drumAction);return;}
    const cell=e.target.closest('[data-key]');if(!cell||(!fromPointer&&performance.now()<this.ignoreClickUntil)||this.ctx?.disabled)return;
    this.cursor=Number(cell.dataset.step);this.lane=Number(cell.dataset.lane);const key=Number(cell.dataset.key),note=this.notes.find(n=>drumKey(n)===key);
    if(note){if(e.shiftKey||this.$('drum-roll-multi').checked){if(this.selection.has(key))this.selection.delete(key);else this.selection.add(key);}else this.selection=new Set([key]);this.controls();this.callbacks.auditionHit(note);}
    else{this.apply({type:'insert',step:this.cursor,lane:this.lane,velocity:this.velocity});this.callbacks.auditionHit({step:this.cursor,lane:this.lane});}
  }
  keydown(e){if(e.key==='Escape'&&this.gesture){e.preventDefault();this.cancelGesture();return;}if(!this.board.contains(e.target))return;let action;if((e.ctrlKey||e.metaKey)&&['a','c','v'].includes(e.key.toLowerCase()))action={a:'all',c:'copy',v:'paste'}[e.key.toLowerCase()];else action={Delete:'delete',Backspace:'delete',ArrowLeft:'left',ArrowRight:'right',ArrowUp:'up',ArrowDown:'down'}[e.key];if(action){e.preventDefault();this.action(action);}}
  point(e){const r=this.board.getBoundingClientRect();return {step:Math.max(0,Math.min(63,Math.floor((e.clientX-r.left-56)/this.cell))),lane:Math.max(0,Math.min(2,2-Math.floor((e.clientY-r.top-28)/36)))};}
  pointerdown(e){if(e.pointerType!=='mouse'||e.button!==0||this.ctx?.disabled||!e.target.closest('[data-key]'))return;const at=this.point(e),key=drumKey(at),on=this.notes.some(n=>drumKey(n)===key);this.gesture={id:e.pointerId,target:e.target,at,key,on,x:e.clientX,y:e.clientY,moved:false,serialized:JSON.stringify(this.ctx.state),selection:new Set(this.selection),multi:e.shiftKey||this.$('drum-roll-multi').checked};this.board.setPointerCapture(e.pointerId);}
  pointermove(e){const g=this.gesture;if(!g||g.id!==e.pointerId)return;if(Math.hypot(e.clientX-g.x,e.clientY-g.y)<5&&!g.moved)return;g.moved=true;const at=this.point(e);g.to=at;if(g.on){if(!g.selection.has(g.key))this.selection=new Set([g.key]);else this.selection=new Set(g.selection);this.message(`移动预览：${at.step-g.at.step} 格，${at.lane-g.at.lane} 行；松开应用，Esc 取消。`);}else{this.selection=new Set([...(g.multi?g.selection:[]),...drumRectangle(this.notes,g.at,at)]);const box=this.$('drum-roll-box');box.hidden=false;box.style.left=56+Math.min(g.at.step,at.step)*this.cell+'px';box.style.top=28+(2-Math.max(g.at.lane,at.lane))*36+'px';box.style.width=(Math.abs(at.step-g.at.step)+1)*this.cell+'px';box.style.height=(Math.abs(at.lane-g.at.lane)+1)*36+'px';}this.controls();}
  pointerup(e){const g=this.gesture;if(!g||g.id!==e.pointerId)return;this.gesture=null;this.$('drum-roll-box').hidden=true;if(this.board.hasPointerCapture(e.pointerId))this.board.releasePointerCapture(e.pointerId);if(JSON.stringify(this.callbacks.get().state)!==g.serialized){this.ignoreClickUntil=performance.now()+350;this.update();return;}if(!g.moved){this.click({target:g.target,shiftKey:g.multi},true);this.ignoreClickUntil=performance.now()+350;return;}this.ignoreClickUntil=performance.now()+350;if(g.on){const to=g.to??g.at;this.apply({type:'move',steps:to.step-g.at.step,lanes:to.lane-g.at.lane});}else this.message(`已框选 ${this.selection.size} 个鼓点；可复制、移动或删除。`);}
  cancelGesture(){const g=this.gesture;if(!g)return;this.gesture=null;this.canceledPointer=g.id;this.ignoreClickUntil=performance.now()+350;this.selection=g.selection;this.$('drum-roll-box').hidden=true;if(this.board.hasPointerCapture(g.id))this.board.releasePointerCapture(g.id);this.controls();}
  playback(view){if(!this.ctx?.active)return;const at=(view.bar-this.ctx.start)*16+view.step,head=this.$('drum-roll-head');head.hidden=!view.playing||at<0||at>=64;if(!head.hidden)head.style.left=56+at*this.cell+'px';}
}
