import test from 'node:test';
import assert from 'node:assert/strict';
import {blank,setChord} from '../yinya/model.js';
import {HarmonyEditor} from '../yinya/harmony-editor.js';
import {harmonyNotes} from '../yinya/harmony.js';
function harness(){
  const original=setChord(setChord(setChord(blank(),0,0,7,3,0),0,2,0,1,2),1,0,4),e=Object.create(HarmonyEditor.prototype);let state=original;
  const elements={'harmony-roll-multi':{checked:false},'harmony-roll-box':{hidden:true,style:{}}},classes=new Set();
  Object.assign(e,{selection:new Set([0]),notes:harmonyNotes(state,0),cursor:0,chord:0,inversion:0,velocity:1,gesture:null,pending:null,cell:50,ignoreClickUntil:0,ctx:{state,start:0,active:true,disabled:false},messages:[],commits:[],auditions:[],controls(){},message(text){this.messages.push(text);},$:id=>elements[id]});
  e.board={getBoundingClientRect:()=>({left:0,top:0}),setPointerCapture(){},hasPointerCapture:()=>false,releasePointerCapture(){},contains:()=>true,classList:{add:(...n)=>n.forEach(x=>classes.add(x)),remove:(...n)=>n.forEach(x=>classes.delete(x)),toggle:(n,on)=>on?classes.add(n):classes.delete(n)},style:{setProperty(){},removeProperty(){}}};
  e.callbacks={get:()=>({state}),beforeEdit(){},status(){},auditionChord:beat=>e.auditions.push(beat),commit(next){state=next;e.commits.push(next);e.ctx.state=state;e.notes=harmonyNotes(state,0);e.selection=new Set(e.pending??[]);e.pending=null;}};e.update=()=>{e.ctx.state=state;e.notes=harmonyNotes(state,0);};
  const target=beat=>({dataset:{beat:String(beat)},closest(selector){return selector==='[data-beat]'?this:null;}}),event=(beat,extra={})=>({pointerId:1,pointerType:'mouse',button:0,clientX:beat*50+25,clientY:80,target:target(beat),shiftKey:false,...extra});
  return {e,original,state:()=>state,change:next=>{state=next;},event,elements,classes};
}
test('harmony drag only previews until release, commits once and preserves identity, inversion and velocity',()=>{
  const h=harness(),e=h.e;e.pointerdown(h.event(0));e.pointermove(h.event(1));assert.equal(e.commits.length,0);assert.deepEqual(h.state(),h.original);assert.ok(h.classes.has('dragging'));e.pointerup(h.event(1));assert.equal(e.commits.length,1);assert.deepEqual(harmonyNotes(h.state(),0)[0],{beat:1,chord:7,inversion:3,velocity:0,duration:1});assert.ok(!h.classes.has('dragging'));
});

test('a right-handle resize previews then commits one duration, preserving expression and rejecting collision',()=>{
 const h=harness(),e=h.e,handle=beat=>{const event=h.event(beat);event.target.closest=selector=>selector==='[data-beat]'?event.target:selector==='.harmony-resize'?{}:null;return event;};
 e.pointerdown(handle(0));e.pointermove(h.event(1));assert.equal(e.commits.length,0);e.pointerup(h.event(1));assert.equal(e.commits.length,1);assert.equal(harmonyNotes(h.state(),0)[0].duration,2);assert.equal(harmonyNotes(h.state(),0)[0].inversion,3);
 e.pointerdown(handle(1));e.pointermove(h.event(2));assert.ok(h.classes.has('invalid'));e.pointerup(h.event(2));assert.equal(e.commits.length,1);assert.match(e.messages.at(-1),/重叠/);
});
test('duration buttons work without pointer capture and a resize cancel leaves no history entry',()=>{
 const h=harness(),e=h.e;e.duration=2;e.action('duration');assert.equal(e.commits.length,1);assert.equal(harmonyNotes(h.state(),0)[0].duration,2);
 const down=h.event(1);down.target.closest=selector=>selector==='[data-beat]'?down.target:selector==='.harmony-resize'?{}:null;e.pointerdown(down);e.pointermove(h.event(0));e.cancelGesture();e.pointerup(h.event(0));assert.equal(e.commits.length,1);assert.equal(harmonyNotes(h.state(),0)[0].duration,2);
});
test('captured clicks select once or insert once and suppress synthetic follow-up events without blocking rapid real clicks',()=>{
  const h=harness(),e=h.e;e.pointerdown(h.event(0));e.pointerup(h.event(0));assert.deepEqual([...e.selection],[0]);assert.equal(e.inversion,3);e.pointerdown(h.event(1));e.pointerup(h.event(1));assert.equal(e.commits.length,1);e.click(h.event(1));assert.equal(e.commits.length,1);e.pointerdown(h.event(3));e.pointerup(h.event(3));assert.equal(e.commits.length,2);
});
test('Esc or lost capture cancels a harmony move and preserves the original selection and snapshot',()=>{
  const h=harness(),e=h.e;e.pointerdown(h.event(0));e.pointermove(h.event(1));e.keydown({key:'Escape',target:e.board,preventDefault(){}});e.pointerup(h.event(1));e.click(h.event(1));assert.equal(e.commits.length,0);assert.deepEqual(h.state(),h.original);assert.deepEqual([...e.selection],[0]);assert.equal(e.canceledPointer,1);assert.ok(!h.classes.has('dragging'));
});
test('external changes invalidate harmony drags without replacing newer work',()=>{
  const h=harness(),e=h.e;e.pointerdown(h.event(0));e.pointermove(h.event(1));const external={...h.original,title:'newer'};h.change(external);e.pointerup(h.event(1));assert.equal(e.commits.length,0);assert.equal(h.state(),external);assert.match(e.messages.at(-1),/作品已变化/);
});
test('collision and multi-selection overflow reject entire harmony moves, while blank dragging only changes selection',()=>{
  const h=harness(),e=h.e;e.pointerdown(h.event(0));e.pointermove(h.event(2));assert.ok(h.classes.has('invalid'));e.pointerup(h.event(2));assert.equal(e.commits.length,0);assert.match(e.messages.at(-1),/重叠/);e.pointerdown(h.event(0));e.pointermove(h.event(-1));e.pointerup(h.event(-1));assert.equal(e.commits.length,0);assert.match(e.messages.at(-1),/超出/);e.selection=new Set([0,2]);e.pointerdown(h.event(0));e.pointermove(h.event(15));e.pointerup(h.event(15));assert.equal(e.commits.length,0);assert.match(e.messages.at(-1),/超出/);e.pointerdown(h.event(1));e.pointermove(h.event(5));e.pointerup(h.event(5));assert.deepEqual([...e.selection],[2,4]);assert.equal(e.commits.length,0);assert.deepEqual(h.state(),h.original);
});
test('touch scrolling is not captured and an ordinary tap selects a chord without changing its expression',()=>{
  const h=harness(),e=h.e;e.pointerdown(h.event(0,{pointerType:'touch'}));e.pointermove(h.event(3,{pointerType:'touch'}));assert.equal(e.gesture,null);e.click(h.event(0));assert.deepEqual([...e.selection],[0]);assert.equal(e.commits.length,0);assert.equal(e.inversion,3);assert.equal(e.velocity,0);
});
test('export-disabled harmony edits do nothing and failed insertion never starts an audition',()=>{
  const h=harness(),e=h.e;e.ctx.disabled=true;e.pointerdown(h.event(1));e.click(h.event(1));e.action('delete');e.apply({type:'delete'});assert.equal(e.gesture,null);assert.equal(e.commits.length,0);e.ctx.disabled=false;e.cursor=0;e.action('insert');assert.equal(e.commits.length,0);assert.equal(e.auditions.length,0);assert.deepEqual(h.state(),h.original);
});
