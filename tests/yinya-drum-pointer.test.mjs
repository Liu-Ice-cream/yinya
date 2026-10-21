import test from 'node:test';
import assert from 'node:assert/strict';
import {blank,setDrumHit} from '../yinya/model.js';
import {DrumEditor} from '../yinya/drum-editor.js';
import {drumHits} from '../yinya/drums.js';
function harness(){
  const original=setDrumHit(setDrumHit(setDrumHit(blank(),0,0,0,true,2),0,0,2,true,0),0,4,1,true),e=Object.create(DrumEditor.prototype);let state=original;
  const elements={'drum-roll-multi':{checked:false},'drum-roll-box':{hidden:true,style:{}}};
  Object.assign(e,{selection:new Set([0]),notes:drumHits(state,0),cursor:0,lane:0,velocity:1,gesture:null,pending:null,cell:10,ignoreClickUntil:0,ctx:{state,start:0,active:true,disabled:false},messages:[],commits:[],controls(){},message(text){this.messages.push(text);},$:id=>elements[id]});
  e.board={getBoundingClientRect:()=>({left:0,top:0}),setPointerCapture(){},hasPointerCapture:()=>false,releasePointerCapture(){},contains:()=>true};
  e.callbacks={get:()=>({state}),beforeEdit(){},status(){},auditionHit(){},commit(next){state=next;e.commits.push(next);e.ctx.state=state;e.notes=drumHits(state,0);e.selection=new Set(e.pending??[]);e.pending=null;}};e.update=()=>{e.ctx.state=state;e.notes=drumHits(state,0);};
  const target=(step,lane)=>({dataset:{step:String(step),lane:String(lane),key:String(step*3+lane)},closest(selector){return selector==='[data-key]'?this:null;}});
  const event=(step,lane,extra={})=>({pointerId:1,pointerType:'mouse',button:0,clientX:56+step*10+5,clientY:28+(2-lane)*36+18,target:target(step,lane),shiftKey:false,...extra});
  return {e,original,state:()=>state,change:next=>{state=next;},event,elements};
}
test('drum dragging previews without mutation and releases as one complete edit with velocity preserved',()=>{
  const h=harness(),e=h.e;e.pointerdown(h.event(0,0));e.pointermove(h.event(1,0));assert.equal(e.commits.length,0);assert.deepEqual(h.state(),h.original);e.pointerup(h.event(1,0));assert.equal(e.commits.length,1);assert.ok(drumHits(h.state(),0).some(n=>n.step===1&&n.lane===0&&n.velocity===2));assert.ok(drumHits(h.state(),0).some(n=>n.step===0&&n.lane===2&&n.velocity===0));
});
test('simple captured clicks select existing hits or write one new hit, suppressing the synthetic follow-up click',()=>{
  const h=harness(),e=h.e;e.selection.clear();e.pointerdown(h.event(0,2));e.pointerup(h.event(0,2));assert.deepEqual([...e.selection],[2]);assert.equal(e.commits.length,0);e.pointerdown(h.event(1,0));e.pointerup(h.event(1,0));assert.equal(e.commits.length,1);e.click(h.event(1,0));assert.equal(e.commits.length,1);assert.equal(e.notes.length,4);
});
test('Esc and lost capture cancel a drum move, retain selection and suppress late clicks without changing work',()=>{
  const h=harness(),e=h.e;e.pointerdown(h.event(0,0));e.pointermove(h.event(3,0));e.keydown({key:'Escape',target:e.board,preventDefault(){}});e.pointerup(h.event(3,0));e.click(h.event(3,0));assert.equal(e.commits.length,0);assert.deepEqual(h.state(),h.original);assert.deepEqual([...e.selection],[0]);assert.equal(e.canceledPointer,1);
});
test('external state changes during a drum drag invalidate the pending operation',()=>{
  const h=harness(),e=h.e;e.pointerdown(h.event(0,0));e.pointermove(h.event(2,0));const changed={...h.original,title:'外部修改'};h.change(changed);e.pointerup(h.event(2,0));assert.equal(e.commits.length,0);assert.equal(h.state(),changed);
});
test('a colliding multi-hit drum move rejects the entire batch while box selection never writes notes',()=>{
  const h=harness(),e=h.e;e.selection=new Set([0,2]);e.pointerdown(h.event(0,0));e.pointermove(h.event(0,1));e.pointerup(h.event(0,1));assert.equal(e.commits.length,0);assert.deepEqual(h.state(),h.original);assert.match(e.messages.at(-1),/超出/);e.pointerdown(h.event(1,2));e.pointermove(h.event(5,0));e.pointerup(h.event(5,0));assert.deepEqual([...e.selection],[13]);assert.equal(e.commits.length,0);assert.equal(h.elements['drum-roll-box'].hidden,true);
});
test('touch gestures leave native scrolling available and click remains a non-destructive selection',()=>{
  const h=harness(),e=h.e;e.pointerdown(h.event(0,2,{pointerType:'touch'}));e.pointermove(h.event(3,2,{pointerType:'touch'}));assert.equal(e.gesture,null);e.click(h.event(0,2));assert.deepEqual([...e.selection],[2]);assert.equal(e.commits.length,0);
});
test('export-disabled drum controls cannot write, delete or start gestures',()=>{
  const h=harness(),e=h.e;e.ctx.disabled=true;e.pointerdown(h.event(1,0));e.click(h.event(1,0));e.action('delete');e.apply({type:'delete'});assert.equal(e.gesture,null);assert.equal(e.commits.length,0);assert.deepEqual(h.state(),h.original);
});
