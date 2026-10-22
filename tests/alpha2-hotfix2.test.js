import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../engine.js';
import { aiMemoryFrom, emptyAIMemory } from '../ai-state.js';
import { planAdvancedTurn } from '../advanced-ai.js';
import { resolveAdvancedTurn } from '../advanced-runner.js';
import { createController } from '../controller.js';

function scene(actors=[],rules={}){
    let s=E.emptyState();s.board={...s.board,width:30,height:20};
    s.rules=E.rulesFrom({...s.rules,visionEnabled:true,visionBase:3,visionPerception:false,stancesEnabled:false,splitMovement:true,multiActionsEnabled:true,rngMode:'seeded',seed:'hf2-clues',...rules});
    s.actors=actors.map((a,i)=>E.actorFrom({id:'a'+i,name:'Actor '+i,side:'player',control:'advanced',initiative:100-i,hp:50,maxHp:50,position:{x:2+i,y:3},weaponList:[],aiConfig:{idle:'search',free:true,retreat:false},...a},true));
    return E.startCombat(E.validateState(s)).state;
}
const far={side:'enemy',position:{x:25,y:16},control:'manual'};
const known=(s,id='a1')=>s.actors[0].aiMemory.opponents.find(k=>k.id===id);
function nextOwn(s,id='a0'){while(s.phase==='active'&&E.currentActor(s).id!==id)s=E.endTurn(s).state;return s;}
function alarmScene(extra={}){return scene([{actionsPerTurn:2,aiConfig:{idle:'search',alarm:true,alarmRadius:8,alarmResource:'mana',alarmCost:2},resources:[{id:'mana',name:'Mana',kind:'ammo',quantity:8}],...extra},{position:{x:8,y:3}},{side:'enemy',control:'manual',position:{x:4,y:3}}]);}

test('a visible corpse is recorded as inactive and cannot attract a search or alarm',()=>{
    const s=scene([{aiConfig:{idle:'search',alarm:true}},{side:'enemy',hp:0,condition:'dead',position:{x:4,y:3}},far]);
    s.actors[0].aiMemory.searchLeft=3;assert.equal(known(s).activity,'inactive');assert.equal(E.searchClues(s,s.actors[0]).length,0);assert.equal(E.alarmReport(s,s.actors[0]),null);
    const old=E.clone(s),p=planAdvancedTurn(s);assert.notEqual(p.reasonEn,'Investigate the last known position');assert.deepEqual(s,old);
});

test('a previously observed corpse stays resolved after losing line of sight',()=>{
    let s=scene([{aiConfig:{alarm:true,alarmRadius:8}},{side:'enemy',hp:0,condition:'dead',position:{x:4,y:3}},{position:{x:9,y:3}},far]);
    s=E.moveActor(s,'a0',{x:9,y:4},true).state;assert(!E.visibleTo(s,s.actors[0],s.actors[1]));assert.equal(known(s).activity,'inactive');assert.equal(E.alarmReport(s,s.actors[0]),null);assert(!E.canAlarm(s,s.actors[0]));
});

for(const condition of ['unconscious','stabilized','dead'])test('observed '+condition+' contact does not become a threat again after sight loss',()=>{
    let s=scene([{}, {side:'enemy',position:{x:4,y:3}},far]);
    s=E.editActor(s,'a1',{hp:0,condition}).state;assert.equal(known(s).activity,'inactive');s=E.moveActor(s,'a0',{x:10,y:3},true).state;assert.equal(E.searchClues(s,s.actors[0]).length,0);
});

test('an unseen death or revival cannot secretly change observer knowledge',()=>{
    let s=scene([{}, {side:'enemy',position:{x:4,y:3}},far]);s=E.moveActor(s,'a0',{x:12,y:3},true).state;
    const dead=E.clone(s);dead.actors[1].hp=0;dead.actors[1].condition='dead';
    assert.deepEqual(E.searchClues(dead,dead.actors[0]),E.searchClues(s,s.actors[0]));assert.deepEqual(planAdvancedTurn(dead),planAdvancedTurn(s));
    s.actors[0].aiMemory.opponents[0].activity='inactive';const revived=E.clone(s);revived.actors[1].hp=30;revived.actors[1].condition='fit';assert.equal(E.searchClues(revived,revived.actors[0]).length,0);
});

test('a visible revival reopens an inactive contact with a new sighting',()=>{
    let s=scene([{}, {side:'enemy',hp:0,condition:'dead',position:{x:4,y:3}},far]);const prior=known(s).sighting;
    s=E.editActor(s,'a1',{hp:30,condition:'fit'}).state;assert.equal(known(s).activity,'active');assert(known(s).sighting>prior);assert.equal(E.searchClues(s,s.actors[0])[0].id,'a1');
});

test('a checked empty last-known cell closes the contact without following its hidden new position',()=>{
    let s=scene([{}, {side:'enemy',position:{x:4,y:3}},far]);s=E.moveActor(s,'a1',{x:20,y:15},true).state;
    assert.equal(known(s).activity,'cleared');assert.deepEqual(known(s).position,{x:4,y:3});assert.equal(E.searchClues(s,s.actors[0]).length,0);
});

test('a corpse automatically removed from the board is still observed at its last position',()=>{
    let s=scene([{}, {side:'enemy',position:{x:4,y:3}},far],{autoRemoveDead:true});s=E.editActor(s,'a1',{hp:0,condition:'dead'}).state;
    assert.equal(s.actors[1].position,null);assert.equal(known(s).activity,'inactive');assert.equal(E.alarmReport(s,s.actors[0]),null);
});

test('a legacy save gets safe defaults and visible old corpses are rejected before the first commit',()=>{
    let s=scene([{}, {side:'enemy',hp:0,condition:'dead',position:{x:4,y:3}},far]);
    for(const k of s.actors[0].aiMemory.opponents){delete k.activity;delete k.sighting;delete k.announced;}delete s.actors[0].aiMemory.heard;
    s=E.validateState(JSON.parse(JSON.stringify(s)));assert.equal(known(s).activity,'unknown');s.actors[0].aiMemory.searchLeft=3;assert.equal(E.searchClues(s,s.actors[0]).length,0);assert.notEqual(planAdvancedTurn(s).reasonEn,'Investigate the last known position');
});

test('alarm costs once, preserves source time and stores an identified clue without granting target visibility',()=>{
    let s=alarmScene();const seen=known(s,'a2').seen;s=E.moveActor(s,'a0',{x:9,y:4},true).state;s.turnSerial+=3;
    const r=E.resolveAction(s,{type:'alarm',actor:'a0'},{source:'advanced'});s=r.state;const hint=s.actors[1].aiMemory.alert;
    assert.equal(s.actors[0].resources[0].quantity,6);assert.equal(s.action.freeSpent,1);assert.equal(hint.turn,seen);assert.equal(hint.target,'a2');assert.equal(hint.source,'a0');assert(!E.visibleTo(s,s.actors[1],s.actors[2]));assert.equal(s.actors[1].aiMemory.opponents.length,0);assert(!E.canAlarm(s,s.actors[0]));
});

test('a second observer cannot refresh the same old warning or its search budget',()=>{
    let s=scene([{aiConfig:{alarm:true,alarmRadius:8}},{position:{x:3,y:4},aiConfig:{alarm:true,alarmRadius:8}},{position:{x:8,y:3}},{side:'enemy',control:'manual',position:{x:4,y:3}}]);
    s=E.resolveAction(s,{type:'alarm',actor:'a0'},{source:'advanced'}).state;const hint=E.clone(s.actors[2].aiMemory.alert);s.actors[2].aiMemory.searchLeft=1;s=E.endTurn(s).state;
    assert.equal(E.currentActor(s).id,'a1');assert(!E.canAlarm(s,s.actors[1]));assert.deepEqual(s.actors[2].aiMemory.alert,hint);assert.equal(s.actors[2].aiMemory.searchLeft,1);
});

test('changing a contact subset does not forget earlier announced contacts',()=>{
    let s=alarmScene({actionsPerTurn:4});s.actors.push(E.actorFrom({id:'other',name:'Other',side:'enemy',control:'manual',position:{x:4,y:4}},true));
    s=E.editActor(s,'other',{}).state;assert(E.canAlarm(s,s.actors[0]));s=E.resolveAction(s,{type:'alarm',actor:'a0'},{source:'advanced'}).state;
    assert(!E.canAlarm(s,s.actors[0]));s=E.moveActor(s,'other',{x:25,y:17},true).state;assert(!E.canAlarm(s,s.actors[0]));assert(known(s,'a2').announced);
});

test('a small observed position change does not repeat the warning',()=>{
    let s=alarmScene();s=E.resolveAction(s,{type:'alarm',actor:'a0'},{source:'advanced'}).state;const previous=s.actors[1].aiMemory.alert.key;
    s=E.moveActor(s,'a2',{x:4,y:4},true).state;assert(!E.canAlarm(s,s.actors[0]));assert.equal(s.actors[1].aiMemory.alert.key,previous);assert.deepEqual(s.actors[1].aiMemory.alert.position,{x:4,y:3});
});

test('a reached legacy clue is cleared rather than repeatedly pursued',()=>{
    let s=scene([{},far]);s.actors[0].aiMemory.alert={position:{x:4,y:3},turn:s.turnSerial};s.actors[0].aiMemory.searchLeft=3;
    assert.equal(E.searchAlert(s,s.actors[0]),null);assert.notEqual(planAdvancedTurn(s).reasonEn,'Investigate the last known position');s=E.editActor(s,'a0',{}).state;assert.equal(s.actors[0].aiMemory.alert,null);
});

test('a checked clue beyond a blocking wall is not completed before it can be seen',()=>{
    const s=scene([{},far]);s.board.blocked=[{x:3,y:2},{x:3,y:3},{x:3,y:4}];s.actors[0].aiMemory.alert={position:{x:4,y:3},turn:s.turnSerial,target:'a1',source:'a1',key:'wall'};
    assert(E.searchAlert(s,s.actors[0]));const changed=E.clone(s);changed.actors[1].hp=0;changed.actors[1].condition='dead';assert.deepEqual(E.searchAlert(changed,changed.actors[0]),E.searchAlert(s,s.actors[0]));
});

test('expired clues cannot be extended by a delayed alarm',()=>{
    let s=alarmScene();s=E.moveActor(s,'a0',{x:9,y:4},true).state;s.turnSerial+=s.actors.length*4;
    assert.equal(E.alarmReport(s,s.actors[0]),null);assert(!E.canAlarm(s,s.actors[0]));
});

test('an older alarm cannot replace a newer personally observed position',()=>{
    let s=alarmScene();s=E.moveActor(s,'a0',{x:9,y:4},true).state;const old=E.alarmReport(s,s.actors[0]);
    s=E.moveActor(s,'a2',{x:6,y:3},true).state;assert(E.visibleTo(s,s.actors[1],s.actors[2]));assert(!E.needsAlarm(s,s.actors[1],old));
});

test('bounded clue memory survives export and Undo and rejects malformed values',async()=>{
    let bundle={state:alarmScene(),history:[],images:{},library:[]};const c=createController({key:()=> 'hf2',read:()=>bundle,write:v=>{bundle=v;},save:async()=>{},preferences:()=>({}),connection:()=>({label:'test'})});
    const before=E.clone(c.state());await c.act({type:'alarm',actor:'a0'});assert.deepEqual(E.validateState(c.state()),c.state());assert.equal(c.state().actors[1].aiMemory.heard.length,1);await c.undo();assert.deepEqual(c.state().actors[0].aiMemory,before.actors[0].aiMemory);assert.deepEqual(c.state().actors[1].aiMemory,before.actors[1].aiMemory);
    assert.throws(()=>aiMemoryFrom({opponents:[{id:'x',activity:'omniscient'}]}));assert.throws(()=>aiMemoryFrom({heard:Array(201).fill({})}));
});

test('new clue identities stay out of the public player view',()=>{
    const s=scene([{control:'manual'},{side:'enemy',position:{x:4,y:3},aiMemory:{alert:{position:{x:20,y:10},turn:1,target:'secret',source:'secret',key:'private'},heard:[{id:'secret',position:{x:20,y:10},seen:1}]}},{id:'secret',side:'enemy',position:{x:20,y:10}}],{hideUnseenEnemies:true});
    const view=E.playerView(s),enemy=view.actors.find(a=>a.id==='a1');assert.deepEqual(enemy.aiMemory,emptyAIMemory());assert(!JSON.stringify(view).includes('secret'));
});

test('searchers progress beyond a body instead of repeatedly consuming all turns on it',()=>{
    let s=scene([{aiConfig:{idle:'search',alarm:true}},{side:'enemy',hp:0,condition:'dead',position:{x:4,y:3}},far]);let max=0;
    for(let i=0;i<10;i++){const r=resolveAdvancedTurn(s);assert(!r.state.log.some(e=>e.details?.alarmTarget==='a1'));s=nextOwn(r.state);max=Math.max(max,E.distance(s.actors[0].position,{x:2,y:3}));E.validateState(s);}
    assert(max>8);
});
