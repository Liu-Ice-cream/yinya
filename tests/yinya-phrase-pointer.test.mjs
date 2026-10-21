import test from 'node:test';
import assert from 'node:assert/strict';
import {blank,setPitchedNote} from '../yinya/model.js';
import {PhraseEditor} from '../yinya/phrase-editor.js';
import {phraseNotes} from '../yinya/phrase.js';
import {PITCH_VALUES} from '../yinya/theory.js';

// Exercise transaction and cancellation handlers without opening a browser or
// audio device. DOM painting is replaced; data operations use the real model.
function harness(){
  let state=blank();state=setPitchedNote(state,0,0,0,4,4).state;state=setPitchedNote(state,0,0,8,2,4).state;
  const original=structuredClone(state),nodes=new Map(),captured=new Set();
  const editor=Object.create(PhraseEditor.prototype);Object.assign(editor,{root:{},selection:new Set([0]),cursor:0,cursorPitch:4,pending:null,gesture:null,ignoreClickUntil:0,stepSize:10,key:'0:s1:0',drawLength:4,drawVelocity:1,commits:[],messages:[]});
  editor.$=id=>{if(!nodes.has(id))nodes.set(id,{style:{},classList:{add(){},remove(){},toggle(){}},hidden:false,value:id==='roll-mode'?'select':'',checked:false});return nodes.get(id);};
  editor.board={tagName:'DIV',contains:()=>true,getBoundingClientRect:()=>({left:0,top:0}),setPointerCapture:id=>captured.add(id),hasPointerCapture:id=>captured.has(id),releasePointerCapture:id=>captured.delete(id)};
  editor.rows=PITCH_VALUES.map(id=>({id:PITCH_VALUES.indexOf(id),label:''})).sort((a,b)=>PITCH_VALUES[b.id]-PITCH_VALUES[a.id]);
  const get=()=>({state,track:0,start:0,active:true,disabled:false,naming:'notes'});
  editor.update=()=>{editor.ctx=get();editor.notes=phraseNotes(state,0,0);editor.selection=new Set(editor.pending||[]);editor.pending=null;};
  editor.callbacks={get,beforeEdit(){},status(){},auditionNote(){},commit(next){state=next;editor.commits.push(next);editor.update();}};
  editor.ctx=get();editor.notes=phraseNotes(state,0,0);editor.drawNotes=(notes=editor.notes,selection=editor.selection)=>{editor.painted={notes:structuredClone(notes),selection:[...selection]};};editor.controls=()=>{};editor.message=(text,error)=>editor.messages.push({text,error});
  const target=(step=null,resize=false)=>({tagName:'BUTTON',closest:selector=>selector==='[data-note-step]'&&step!==null?{dataset:{noteStep:String(step)}}:selector==='.roll-resize'&&resize?{}:null});
  const event=(step,row=15,{note=null,resize=false,touch=false}={})=>({clientX:72+step*10+3,clientY:58+row*24+12,pointerId:1,pointerType:touch?'touch':'mouse',button:0,target:target(note,resize),preventDefault(){}});
  return {editor,event,original,getState:()=>state,change:next=>{state=next;},target};
}
test('pointer movement only paints a preview and mouseup commits a snapped note move exactly once',()=>{
  const h=harness(),e=h.editor;const before=structuredClone(h.getState());e.pointerdown(h.event(1,15,{note:0}));e.pointermove(h.event(2));assert.equal(e.commits.length,0);assert.deepEqual(h.getState(),before);assert.equal(e.painted.notes[0].step,1);e.pointerup(h.event(2));assert.equal(e.commits.length,1);assert.equal(phraseNotes(h.getState(),0,0)[0].step,1);assert.deepEqual(h.original,before);
});
test('Escape cancels pending drag and restores its original selection without writing notes or history',()=>{
  const h=harness(),e=h.editor;e.pointerdown(h.event(1,15,{note:0}));e.pointermove(h.event(2));e.keydown({key:'Escape',target:e.board,preventDefault(){}});e.pointerup(h.event(2));assert.equal(e.commits.length,0);assert.equal(e.gesture,null);assert.deepEqual([...e.selection],[0]);assert.deepEqual(h.getState(),h.original);
});
test('a stale mouseup never overwrites another edit that arrived during its preview',()=>{
  const h=harness(),e=h.editor;e.pointerdown(h.event(1,15,{note:0}));e.pointermove(h.event(2));const external=structuredClone(h.getState());external.title='另一次编辑';h.change(external);e.pointerup(h.event(2));assert.equal(e.commits.length,0);assert.deepEqual(h.getState(),external);assert.ok(e.messages.at(-1).text.includes('变化'));
});
test('an invalid resize is painted as rejected and cannot partially write on mouseup',()=>{
  const h=harness(),e=h.editor;e.pointerdown(h.event(3,15,{note:0,resize:true}));e.pointermove(h.event(8));assert.ok(e.gesture.error);assert.equal(e.commits.length,0);e.pointerup(h.event(8));assert.equal(e.commits.length,0);assert.deepEqual(h.getState(),h.original);
});
test('rectangle selection includes sustained bodies and changes selection without changing the saved work',()=>{
  const h=harness(),e=h.editor;e.pointerdown(h.event(1,0));e.pointermove(h.event(10,24));assert.equal(e.commits.length,0);e.pointerup(h.event(10,24));assert.deepEqual([...e.selection],[0,8]);assert.deepEqual(h.getState(),h.original);
});
test('touch pointers leave native scrolling available and a subsequent tap selects rather than drags a note',()=>{
  const h=harness(),e=h.editor;e.selection.clear();e.pointerdown(h.event(1,15,{note:0,touch:true}));e.pointermove(h.event(5,15,{note:0,touch:true}));assert.equal(e.gesture,null);e.click({target:h.target(0),detail:1});assert.deepEqual([...e.selection],[0]);assert.equal(e.commits.length,0);assert.deepEqual(h.getState(),h.original);
});
