import test from 'node:test';
import assert from 'node:assert/strict';
import {bindBoardPaint,paintLine} from '../board-paint.js';
class Element {
 constructor(){this.events={};this.dataset={};this.classes=new Set();this.classList={add:(...v)=>v.forEach(x=>this.classes.add(x)),remove:(...v)=>v.forEach(x=>this.classes.delete(x)),toggle:(v,on)=>on?this.classes.add(v):this.classes.delete(v)};}
 addEventListener(n,fn){(this.events[n]??=[]).push(fn);}
 removeEventListener(n,fn){this.events[n]=(this.events[n]??[]).filter(f=>f!==fn);}
 async emit(n,event){for(const fn of this.events[n]??[])await fn(event);}
 closest(){return this;}
 contains(v){return v.ownerRoot===this;}
 setPointerCapture(v){this.capture=v;}hasPointerCapture(v){return this.capture===v;}releasePointerCapture(){this.capture=null;}
}
function fixture(){const root=new Element(),doc=new Element(),win=new Element(),commits=[],nodes=new Map();root.ownerDocument=doc;doc.defaultView=win;doc.elementFromPoint=()=>doc.hit;
 const cell=(x,y)=>{const k=x+','+y;if(!nodes.has(k)){const n=new Element();n.ownerRoot=root;n.dataset={action:'cell',x:String(x),y:String(y)};nodes.set(k,n);}return nodes.get(k);};
 root.querySelector=s=>{const m=s.match(/data-x="(\d+)"\]\[data-y="(\d+)"/);return m?cell(Number(m[1]),Number(m[2])):null;};
 let enabled=true;const c={enabled:()=>enabled,begin:()=>({remove:false}),preview:()=>true,commit:async(cells,context)=>commits.push({cells,context})};const paint=bindBoardPaint(root,c);
 const event=(target,extra={})=>({target,pointerId:7,button:0,buttons:1,isPrimary:true,clientX:1,clientY:1,detail:1,preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;},...extra});
 return {root,doc,win,cell,commits,c,paint,event,disable:()=>enabled=false};
}
test('Fast pointer strokes fill intermediate cells once and commit only at release',async()=>{
 const f=fixture();await f.root.emit('pointerdown',f.event(f.cell(1,2)));assert.equal(f.commits.length,0);
 f.doc.hit=f.cell(8,2);await f.doc.emit('pointermove',f.event(f.root));f.doc.hit=f.cell(3,2);await f.doc.emit('pointermove',f.event(f.root));assert.equal(f.commits.length,0);
 await f.doc.emit('pointerup',f.event(f.root));assert.equal(f.commits.length,1);assert.equal(f.commits[0].cells.length,8);assert(f.commits[0].cells.some(p=>p.x===6&&p.y===2));assert(!f.root.classes.has('ct-painting'));assert.equal(f.root.capture,null);f.paint.destroy();
});
test('A stationary pointer click paints once and suppresses the synthetic click; keyboard clicks remain usable',async()=>{
 const f=fixture();f.doc.hit=f.cell(2,2);await f.root.emit('pointerdown',f.event(f.doc.hit));await f.doc.emit('pointerup',f.event(f.root));assert.equal(f.commits[0].cells.length,1);const keyboard=f.event(f.root,{detail:0});assert(!f.paint.consumeClick(keyboard));const click=f.event(f.root);assert(f.paint.consumeClick(click));assert(click.stopped);assert(!f.paint.consumeClick(f.event(f.root)));f.paint.destroy();
});
for(const mode of ['escape','pointercancel','blur','capture','close','disable','lost-buttons','destroy'])test('Stroke cancellation: '+mode,async()=>{
 const f=fixture();await f.root.emit('pointerdown',f.event(f.cell(1,1)));f.doc.hit=f.cell(5,1);await f.doc.emit('pointermove',f.event(f.root));
 if(mode==='escape')await f.doc.emit('keydown',{key:'Escape',preventDefault(){}});
 if(mode==='pointercancel')await f.doc.emit('pointercancel',{pointerId:7});
 if(mode==='blur')await f.win.emit('blur',{});
 if(mode==='capture')await f.root.emit('lostpointercapture',{});
 if(mode==='close')await f.root.emit('close',{});
 if(mode==='disable'){f.disable();await f.doc.emit('pointermove',f.event(f.root));}
 if(mode==='lost-buttons')await f.doc.emit('pointermove',f.event(f.root,{buttons:0}));
 if(mode==='destroy')f.paint.destroy();
 await f.doc.emit('pointerup',f.event(f.root));assert.equal(f.commits.length,0);assert(!f.paint.pending());assert(!f.cell(1,1).classes.has('ct-paint-preview'));assert(!f.cell(5,1).classes.has('ct-paint-preview'));f.paint.destroy();
});
test('Outside-board motion does not draw a connecting line across the gap; release keeps visited cells',async()=>{
 const f=fixture();await f.root.emit('pointerdown',f.event(f.cell(1,1)));f.doc.hit=null;await f.doc.emit('pointermove',f.event(f.root));f.doc.hit=f.cell(8,1);await f.doc.emit('pointermove',f.event(f.root));f.doc.hit=null;await f.doc.emit('pointerup',f.event(f.root));assert.deepEqual(f.commits[0].cells,[{x:1,y:1},{x:8,y:1}]);f.paint.destroy();
});
test('Other pointers, right clicks, disabled tools and foreign boards cannot start or finish a stroke',async()=>{
 const f=fixture();const foreign=new Element();foreign.dataset={action:'cell',x:'2',y:'2'};await f.root.emit('pointerdown',f.event(foreign));await f.root.emit('pointerdown',f.event(f.cell(1,1),{button:2}));await f.root.emit('pointerdown',f.event(f.cell(1,1),{isPrimary:false}));assert(!f.paint.pending());
 await f.root.emit('pointerdown',f.event(f.cell(1,1)));await f.doc.emit('pointerup',f.event(f.root,{pointerId:9}));assert(f.paint.pending());f.paint.cancel();f.disable();await f.root.emit('pointerdown',f.event(f.cell(1,1)));assert(!f.paint.pending());f.paint.destroy();
});
test('Occupied cells are skipped while a drag continues on both sides',async()=>{
 const f=fixture();f.c.preview=p=>p.x!==4;await f.root.emit('pointerdown',f.event(f.cell(1,1)));f.doc.hit=f.cell(7,1);await f.doc.emit('pointerup',f.event(f.root));assert.equal(f.commits[0].cells.length,6);assert(!f.commits[0].cells.some(p=>p.x===4));f.paint.destroy();
});
test('Diagonal brush interpolation stays within the board and preserves both endpoints',()=>{
 for(const [a,b] of [[{x:0,y:0},{x:49,y:49}],[{x:49,y:0},{x:0,y:35}],[{x:7,y:4},{x:7,y:4}]]){const line=paintLine(a,b);assert.deepEqual(line[0],a);assert.deepEqual(line.at(-1),b);assert(line.every(p=>Number.isInteger(p.x)&&Number.isInteger(p.y)&&p.x>=0&&p.x<50&&p.y>=0&&p.y<50));assert.equal(new Set(line.map(p=>p.x+','+p.y)).size,line.length);}
});
