import test, {beforeEach,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../engine.js';
import {createController} from '../controller.js';
import {createUI} from '../ui.js';
import {createUIEnglish} from '../ui.en.js';
import {bindBoardDrag} from '../board-drag.js';

// Synthetic input/DOM harness; no native browser drag or visual layout assertions.
class Classes {
    constructor(){this.values=new Set();}
    add(...v){for(const x of v)this.values.add(x);}
    remove(...v){for(const x of v)this.values.delete(x);}
    toggle(v,on){if(on)this.add(v);else this.remove(v);}
    contains(v){return this.values.has(v);}
}
class Element {
    constructor(doc){this.ownerDocument=doc;this.dataset={};this.events={};this.nodes={};this.children=[];this.classList=new Classes();this.elements={};this.innerHTML='';this.draggable=true;}
    setAttribute(){} append(v){this.children.push(v);} remove(){this.removed=true;}
    addEventListener(name,fn){(this.events[name]??=[]).push(fn);}
    removeEventListener(name,fn){this.events[name]=(this.events[name]??[]).filter(v=>v!==fn);}
    async emit(name,e){for(const fn of this.events[name]??[])await fn(e);}
    querySelectorAll(){return [];}
    querySelector(s){if(s==='form'&&this.innerHTML.includes('<form novalidate>'))return this.form??=new Element(this.ownerDocument);if(s==='.ct-board-scroll')return this.pane;return null;}
    contains(v){return v.ownerRoot===this;}
    closest(s){return s.includes('.ct-cell')||s.includes('[data-id]')||s.includes('[data-action]')||s.includes('[data-drag-actor]')?this:null;}
    setPointerCapture(id){this.capture=id;} hasPointerCapture(id){return this.capture===id;} releasePointerCapture(){this.capture=null;}
    showModal(){this.open=true;} close(){this.open=false;for(const fn of this.events.close??[])fn();}
}
let doc,original;
beforeEach(()=>{
    original={document:globalThis.document,request:globalThis.requestAnimationFrame,cancel:globalThis.cancelAnimationFrame};
    doc=new Element();doc.ownerDocument=doc;doc.createElement=()=>new Element(doc);doc.body=new Element(doc);doc.defaultView=new Element(doc);doc.elementFromPoint=()=>doc.hit;
    globalThis.document=doc;globalThis.requestAnimationFrame=undefined;globalThis.cancelAnimationFrame=undefined;
});
afterEach(()=>{globalThis.document=original.document;globalThis.requestAnimationFrame=original.request;globalThis.cancelAnimationFrame=original.cancel;});
const pointer=(target,x=100,y=100,extra={})=>({target,clientX:x,clientY:y,pointerId:1,button:0,isPrimary:true,detail:1,preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;},...extra});
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(language='en',active=false){
    let s=E.setRules(E.emptyState(),{splitMovement:true,movementStat:'none',movementBase:3}).state;
    s=E.setBoard(s,{width:50,height:50}).state;
    for(const [i,a] of [{name:'Hero',side:'player',position:{x:1,y:1}},{name:'Ally',side:'ally',position:{x:3,y:3}},{name:'Enemy',side:'enemy',position:{x:48,y:48}}].entries())s=E.addActor(s,{...a,initiative:20-i}).state;
    s=E.randomBoard(s,{preset:'indoor',seed:'drag-50-indoor'}).state;
    const free=[{x:2,y:1},{x:46,y:46}];s=E.setBoard(s,{blocked:s.board.blocked.filter(p=>!free.some(v=>E.distance(v,p)===0)),cover:s.board.cover.filter(p=>!free.some(v=>E.distance(v,p)===0))}).state;
    if(active)s=E.startCombat(s).state;
    let bundle={state:s,history:[]};const c=createController({key:()=> 'drag-test',read:()=>bundle,write:v=>bundle=v,save:async()=>{},preferences:()=>({language,contextOnClick:true})});
    const ui=(language==='en'?createUIEnglish:createUI)(c),root=ui.root;
    root.pane={clientWidth:600,scrollLeft:0,scrollTop:0,getBoundingClientRect:()=>({left:0,top:0,right:600,bottom:600})};
    const cell=(p,id)=>{const v=new Element(doc);v.ownerRoot=root;v.dataset={action:'cell',x:String(p.x),y:String(p.y),...(id?{id}:{})};return v;};
    return {c,ui,root,cell,editor:()=>doc.body.children.at(-1)};
}
async function drag(f,id,to){
    const source=f.cell(E.findActor(f.c.state(),id).position??{x:0,y:0},id),target=f.cell(to);
    await f.root.emit('pointerdown',pointer(source));assert.equal(source.draggable,false);
    doc.hit=target;await doc.emit('pointermove',pointer(source,150,150));
    assert.equal(f.root.classList.contains('ct-dragging'),true);
    await doc.emit('pointerup',pointer(source,150,150));await settle();
    assert.equal(source.draggable,true);assert.equal(f.root.classList.contains('ct-dragging'),false);
    return {source,target};
}

test('1914 dragging a placed figure into the reserve zone retains last position and allows redeploying that same figure',async()=>{
    const f=fixture('en'),a=f.c.state().actors[0],before=E.clone(f.c.state()),source=f.cell(a.position,a.id),zone=new Element(doc);zone.ownerRoot=f.root;zone.closest=s=>s==='[data-reserve-drop]'?zone:null;
    await f.root.emit('pointerdown',pointer(source));doc.hit=zone;await doc.emit('pointermove',pointer(source,120,750));assert(zone.classList.contains('ct-drag-target'));await doc.emit('pointerup',pointer(source,120,750));await settle();
    const removed=E.findActor(f.c.state(),a.id);assert.equal(removed.position,null);assert.deepEqual(removed.lastPosition,a.position);assert.equal(removed.hp,a.hp);assert.deepEqual(f.c.state().rng,before.rng);assert(f.root.innerHTML.includes('data-reserve-id="'+a.id+'"'));
    await drag(f,a.id,{x:46,y:46});assert.deepEqual(E.findActor(f.c.state(),a.id).position,{x:46,y:46});assert(!E.findActor(f.c.state(),a.id).reserve);await f.c.undo();assert.equal(E.findActor(f.c.state(),a.id).position,null);f.ui.destroy();
});
test('1914 reserve drop during active combat advances initiative without deleting the actor; outside drop does nothing',async()=>{
    const f=fixture('en',true),a=E.currentActor(f.c.state()),source=f.cell(a.position,a.id),before=E.clone(f.c.state());
    await f.root.emit('pointerdown',pointer(source));doc.hit=null;await doc.emit('pointermove',pointer(source,200,750));await doc.emit('pointerup',pointer(source,200,750));await settle();assert.deepEqual(f.c.state(),before);
    const zone=new Element(doc);zone.ownerRoot=f.root;zone.closest=s=>s==='[data-reserve-drop]'?zone:null;await f.root.emit('pointerdown',pointer(source));doc.hit=zone;await doc.emit('pointermove',pointer(source,200,750));await doc.emit('pointerup',pointer(source,200,750));await settle();
    assert(f.c.state().actors.some(v=>v.id===a.id));assert.equal(E.findActor(f.c.state(),a.id).reserve,true);assert.notEqual(E.currentActor(f.c.state())?.id,a.id);assert.deepEqual(E.findActor(f.c.state(),a.id).lastPosition,a.position);f.ui.destroy();
});
test('1914 dropping an unplaced figure back into reserve cannot move or delete it',async()=>{
    const f=fixture('en'),a=f.c.state().actors[0];await f.c.reserve(a.id);const before=E.clone(f.c.state()),source=f.cell({x:0,y:0},a.id),zone=new Element(doc);zone.ownerRoot=f.root;zone.closest=s=>s==='[data-reserve-drop]'?zone:null;
    await f.root.emit('pointerdown',pointer(source));doc.hit=zone;await doc.emit('pointermove',pointer(source,120,750));assert(zone.classList.contains('ct-drag-invalid'));await doc.emit('pointerup',pointer(source,120,750));await settle();assert.deepEqual(f.c.state(),before);f.ui.destroy();
});

for(const language of ['de','en'])test(`50×50 indoor setup: ${language} pointer drag moves without DataTransfer and keeps the action menu closed`,async()=>{
    const f=fixture(language),id=f.c.state().actors[0].id,dialogs=doc.body.children.length,before=E.clone(f.c.state());
    const {source}=await drag(f,id,{x:46,y:46});
    assert.deepEqual(E.findActor(f.c.state(),id).position,{x:46,y:46});
    assert.equal(f.c.state().turnSerial,before.turnSerial);assert.deepEqual(f.c.state().rng,before.rng);
    // Browsers can send a click after pointerup; it must not open the context menu.
    const click=pointer(source,150,150);await f.root.emit('click',click);assert(click.stopped);
    assert.equal(doc.body.children.length,dialogs);assert.match(f.root.innerHTML,/ct-board-notice/);
    assert.match(f.root.innerHTML,language==='en'?/Participant moved: Hero/:/Figur verschoben: Hero/);f.ui.destroy();
});

test('An active turn pointer move spends the correct movement and leaves HP/actions unchanged',async()=>{
    const f=fixture('en',true),a=E.currentActor(f.c.state()),before=E.clone(f.c.state());await drag(f,a.id,{x:2,y:1});
    assert.deepEqual(E.findActor(f.c.state(),a.id).position,{x:2,y:1});assert.equal(E.movementBudget(f.c.state(),E.currentActor(f.c.state())).spent,1);
    assert.deepEqual(f.c.state().action,before.action);assert.deepEqual(f.c.state().rng,before.rng);assert.deepEqual(f.c.state().actors.map(v=>v.hp),before.actors.map(v=>v.hp));f.ui.destroy();
});

test('GM Correct Positions moves an out-of-turn actor across the large map without charging movement or changing initiative',async()=>{
    const f=fixture('en',true);await f.root.emit('change',{target:{name:'override',checked:true}});const before=E.clone(f.c.state()),id=before.actors[1].id;
    await drag(f,id,{x:46,y:46});assert.deepEqual(E.findActor(f.c.state(),id).position,{x:46,y:46});assert.deepEqual(f.c.state().movement,before.movement);assert.deepEqual(f.c.state().action,before.action);assert.equal(E.currentActor(f.c.state()).id,E.currentActor(before).id);f.ui.destroy();
});

test('A rejected long move remains atomic and shows its reason beside the board',async()=>{
    const f=fixture('en',true),before=E.clone(f.c.state()),id=before.actors[0].id;await drag(f,id,{x:46,y:46});
    assert.deepEqual(f.c.state(),before);assert.match(f.root.innerHTML,/ct-board-notice ct-error/);assert.match(f.root.innerHTML,/Movement too far/);f.ui.destroy();
});

test('GM correction still rejects walls and never changes a figure on an invalid drop',async()=>{
    const f=fixture('de',true);assert(E.isBlocked(f.c.state(),{x:49,y:49}));await f.root.emit('change',{target:{name:'override',checked:true}});const before=E.clone(f.c.state());
    await drag(f,before.actors[0].id,{x:49,y:49});assert.deepEqual(f.c.state(),before);assert.match(f.root.innerHTML,/ct-board-notice ct-error/);f.ui.destroy();
});

test('A stationary click still opens the action menu and a later empty-cell click moves the selected actor',async()=>{
    const f=fixture('en'),a=f.c.state().actors[0],source=f.cell(a.position,a.id),before=E.clone(f.c.state());
    await f.root.emit('pointerdown',pointer(source));await doc.emit('pointermove',pointer(source,102,101));await doc.emit('pointerup',pointer(source,102,101));
    await f.root.emit('click',pointer(source));assert(f.editor().open);assert.match(f.editor().innerHTML,/Use participant as target/);assert.deepEqual(f.c.state(),before);
    f.editor().close();const dest=f.cell({x:46,y:46});await f.root.emit('pointerdown',pointer(dest));await f.root.emit('click',pointer(dest));
    assert.deepEqual(E.findActor(f.c.state(),a.id).position,{x:46,y:46});f.ui.destroy();
});

test('Escape and release outside the board cancel the gesture without committing movement',async()=>{
    const f=fixture('en'),a=f.c.state().actors[0],before=E.clone(f.c.state()),source=f.cell(a.position,a.id);
    for(const mode of ['escape','outside']){
        await f.root.emit('pointerdown',pointer(source));doc.hit=f.cell({x:2,y:1});await doc.emit('pointermove',pointer(source,150,150));
        if(mode==='escape')await doc.emit('keydown',{key:'Escape',preventDefault(){}});else doc.hit=null;
        await doc.emit('pointerup',pointer(source,150,150));await settle();assert.deepEqual(f.c.state(),before);assert.equal(source.draggable,true);
    }f.ui.destroy();
});

test('Changing the combat state during a drag rejects the stale gesture',async()=>{
    const f=fixture('en'),a=f.c.state().actors[0],source=f.cell(a.position,a.id);await f.root.emit('pointerdown',pointer(source));doc.hit=f.cell({x:46,y:46});await doc.emit('pointermove',pointer(source,150,150));
    await f.c.edit(a.id,{name:'Renamed'});const changed=E.clone(f.c.state());await doc.emit('pointerup',pointer(source,150,150));await settle();assert.deepEqual(f.c.state(),changed);assert.match(f.root.innerHTML,/Combat state changed during dragging/);f.ui.destroy();
});

test('Dragging from an unplaced roster entry uses the same initial-placement rules',async()=>{
    const f=fixture('en'),id=f.c.state().actors[0].id;await f.c.move(id,null,true);
    const source=new Element(doc);source.ownerRoot=f.root;source.dataset={id,dragActor:'true'};
    await f.root.emit('pointerdown',pointer(source));doc.hit=f.cell({x:46,y:46});await doc.emit('pointermove',pointer(source,150,150));await doc.emit('pointerup',pointer(source,150,150));await settle();assert.deepEqual(E.findActor(f.c.state(),id).position,{x:46,y:46});f.ui.destroy();
});

test('Pointer dragging scrolls at the board edge and disposes all document listeners on cancellation',async()=>{
    const root=new Element(doc);root.pane={scrollLeft:0,scrollTop:0,getBoundingClientRect:()=>({left:0,top:0,right:600,bottom:600})};
    const frames=new Map();let sequence=0,drops=0;globalThis.requestAnimationFrame=fn=>{frames.set(++sequence,fn);return sequence;};globalThis.cancelAnimationFrame=id=>frames.delete(id);
    const dragControl=bindBoardDrag(root,{enabled:()=>true,drop:()=>{drops++;}}),source=new Element(doc);source.dataset={id:'figure'};source.ownerRoot=root;
    await root.emit('pointerdown',pointer(source));doc.hit=null;await doc.emit('pointermove',pointer(source,100,590));assert.equal(root.pane.scrollTop,10);assert.equal(frames.size,1);
    dragControl.cancel();assert.equal(frames.size,0);assert.equal(drops,0);assert.equal(source.draggable,true);dragControl.destroy();assert(Object.values(doc.events).every(v=>v.length===0));
});

test('Losing window focus cancels dragging and restores figure selection',async()=>{
    const f=fixture('en'),a=f.c.state().actors[0],before=E.clone(f.c.state()),source=f.cell(a.position,a.id);
    await f.root.emit('pointerdown',pointer(source));doc.hit=f.cell({x:46,y:46});await doc.emit('pointermove',pointer(source,150,150));
    await doc.defaultView.emit('blur',{});await doc.emit('pointerup',pointer(source,150,150));await settle();
    assert.deepEqual(f.c.state(),before);assert.equal(source.draggable,true);assert.equal(f.root.classList.contains('ct-dragging'),false);f.ui.destroy();assert(Object.values(doc.defaultView.events).every(v=>v.length===0));
});
