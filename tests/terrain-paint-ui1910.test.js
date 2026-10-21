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

async function chooseTool(f,action){const node=new Element(doc);node.ownerRoot=f.root;node.dataset={action};await f.root.emit('pointerdown',pointer(node));await f.root.emit('click',pointer(node));}
async function plain(f){await f.c.board({blocked:[],cover:[],heights:[],ladders:[],pits:[],coverFaces:[]});}
for(const language of ['de','en'])test('Terrain UI '+language+': pointer stroke paints gaps once, suppresses duplicate click and uses one Undo',async()=>{
 const f=fixture(language);await plain(f);await chooseTool(f,'pit-mode');const h=f.c.historyLength(),source=f.cell({x:2,y:2});
 await f.root.emit('pointerdown',pointer(source));doc.hit=f.cell({x:12,y:2});await doc.emit('pointermove',pointer(source,300,100));assert.equal(f.c.state().board.pits.length,0);
 await doc.emit('pointerup',pointer(source,300,100));assert.equal(f.c.state().board.pits.length,11);assert.equal(f.c.historyLength(),h+1);
 const duplicate=pointer(source);await f.root.emit('click',duplicate);assert(duplicate.stopped);assert.equal(f.c.state().board.pits.length,11);
 assert.match(f.root.innerHTML,language==='en'?/Terrain updated: 11/:/Gelände geändert: 11/);
 await f.c.undo();assert.equal(f.c.state().board.pits.length,0);f.ui.destroy();
});
test('Terrain UI paint and erase strokes skip actors without moving them or consuming combat resources',async()=>{
 const f=fixture('en',true);await plain(f);const before=E.clone(f.c.state());await chooseTool(f,'block-mode');
 const source=f.cell({x:0,y:1});await f.root.emit('pointerdown',pointer(source));doc.hit=f.cell({x:4,y:1});await doc.emit('pointerup',pointer(source,200,100));assert.equal(f.c.state().board.blocked.length,4);assert(!E.isBlocked(f.c.state(),{x:1,y:1}));assert.deepEqual(f.c.state().actors,before.actors);assert.deepEqual(f.c.state().action,before.action);assert.deepEqual(f.c.state().movement,before.movement);
 await f.root.emit('pointerdown',pointer(source));doc.hit=f.cell({x:4,y:1});await doc.emit('pointerup',pointer(source,200,100));assert.equal(f.c.state().board.blocked.length,0);f.ui.destroy();
});
test('Terrain UI Escape and chat changes discard the stroke and clear preview state',async()=>{
 const f=fixture('en');await plain(f);await chooseTool(f,'cover-mode');const before=E.clone(f.c.state()),source=f.cell({x:7,y:7});
 await f.root.emit('pointerdown',pointer(source));doc.hit=f.cell({x:12,y:7});await doc.emit('pointermove',pointer(source,200,100));await doc.emit('keydown',{key:'Escape',preventDefault(){}});await doc.emit('pointerup',pointer(source));assert.deepEqual(f.c.state(),before);
 await f.root.emit('pointerdown',pointer(source));f.ui.chatChanged();await doc.emit('pointerup',pointer(source));assert.deepEqual(f.c.state(),before);assert(!f.root.classList.contains('ct-painting'));f.ui.destroy();
});
test('Terrain UI state changes during a drag cancel the pending stroke',async()=>{
 const f=fixture('en');await plain(f);await chooseTool(f,'pit-mode');const source=f.cell({x:7,y:7});await f.root.emit('pointerdown',pointer(source));await f.c.name('Updated during drawing');doc.hit=f.cell({x:12,y:7});await doc.emit('pointerup',pointer(source));assert.equal(f.c.state().board.pits.length,0);assert.equal(f.c.state().name,'Updated during drawing');f.ui.destroy();
});
test('Terrain UI keyboard click still toggles one cell; returning to move mode retains pointer figure dragging',async()=>{
 const f=fixture('en');await plain(f);await chooseTool(f,'pit-mode');const p=f.cell({x:7,y:7});await f.root.emit('click',pointer(p,100,100,{detail:0}));assert(E.isPit(f.c.state(),{x:7,y:7}));await chooseTool(f,'pit-mode');await drag(f,f.c.state().actors[0].id,{x:2,y:1});assert.deepEqual(f.c.state().actors[0].position,{x:2,y:1});f.ui.destroy();
});
test('Terrain UI explicitly describes hold-and-drag and the ladder two-click exception',async()=>{
 const f=fixture('en');await chooseTool(f,'height-mode');assert.match(f.root.innerHTML,/hold the left mouse button/);assert.match(f.root.innerHTML,/Place ladders with two clicks/);assert.match(f.root.innerHTML,/Escape discards/);f.ui.destroy();
});

for(const language of ['de','en'])test('Rules UI '+language+': cover and pit rescue each appear once in their own section; switches precede paired values',async()=>{
 const f=fixture(language);await chooseTool(f,'tab-rules');const html=f.root.innerHTML;
 const section=key=>html.split('data-fold="'+key+'"')[1].split('data-fold="')[0];
 const encounter=section('rules-encounter'),terrain=section('rules-terrain'),rescue=section('rules-rescue');
 assert.match(terrain,/name="coverDistanceEnabled"/);assert.match(terrain,/name="coverFarPercent"/);assert.match(rescue,/name="pitRescueRounds"/);
 for(const name of ['coverDistanceEnabled','coverFarPercent','pitRescueRounds']){assert(!encounter.includes('name="'+name+'"'));assert.equal(html.split('name="'+name+'"').length-1,1);}
 assert(encounter.indexOf('name="ambushStacksCritical"')<encounter.indexOf('name="hiddenDamageMultiplier"'));
 assert(encounter.indexOf('name="shotRiskEnabled"')<encounter.indexOf('name="shotRiskPenalty"'));
 assert(terrain.indexOf('name="coverDistanceEnabled"')<terrain.indexOf('name="coverFarPercent"'));
 assert.equal((encounter.match(/class="ct-rule-setting"/g)||[]).length,2);assert.equal((terrain.match(/class="ct-rule-setting"/g)||[]).length,1);
 assert.match(rescue,language==='en'?/Pit rescue rounds/:/Rettungsrunden am Abgrund/);f.ui.destroy();
});
test('Moved rule controls retain drafts across tabs and save cover, pit and ambush values together without duplicate options',async()=>{
 const f=fixture('en');await chooseTool(f,'tab-rules');const prior=E.clone(f.c.state().rules);
 const edit=async(name,value)=>f.root.emit(typeof value==='boolean'?'change':'input',{target:{name,type:typeof value==='boolean'?'checkbox':'number',value:String(value),checked:value,closest:s=>s==='#ct-rules-form'?{}:null}});
 await edit('coverDistanceEnabled',true);await edit('coverFarPercent','85');await edit('pitRescueRounds','6');await edit('ambushStacksCritical',true);await edit('hiddenDamageMultiplier','1,5');
 assert.deepEqual(f.c.state().rules,prior);await chooseTool(f,'tab-help');await chooseTool(f,'tab-rules');assert.match(f.root.innerHTML,/name="pitRescueRounds" value="6"/);
 await chooseTool(f,'save-rules');assert.equal(f.c.state().rules.coverDistanceEnabled,true);assert.equal(f.c.state().rules.coverFarPercent,85);assert.equal(f.c.state().rules.pitRescueRounds,6);assert.equal(f.c.state().rules.ambushStacksCritical,true);assert.equal(f.c.state().rules.hiddenDamageMultiplier,1.5);f.ui.destroy();
});
