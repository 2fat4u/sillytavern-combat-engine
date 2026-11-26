import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../engine.js';
import { skillPreset } from '../skills.js';
import { planAdvancedTurn } from '../advanced-ai.js';
import { resolveAdvancedTurn, resolveAdvancedTurnAsync } from '../advanced-runner.js';
import { createController } from '../controller.js';

const roll=n=>n===20?15:2;
function scene(helperControl='basic'){
 let s=E.emptyState();s.rules=E.rulesFrom({...s.rules,visionEnabled:true,visionBase:3,visionPerception:false,hideUnseenEnemies:true,statMode:'bonuses',splitMovement:true,multiActionsEnabled:true,movementBase:3,movementStat:'none',stancesEnabled:false,natural20:false,rngMode:'seeded',seed:'legacy-alarm-availability'});
 s.board={...s.board,width:16,height:9};
 s.actors=[
  {id:'caller',name:'Caller',side:'player',control:'advanced',initiative:100,position:{x:2,y:2},aiConfig:{idle:'search',free:true,alarm:true,alarmRadius:6,alarmResource:'mana',alarmCost:2},resources:[{id:'mana',name:'Mana',kind:'ammo',quantity:8}]},
  {id:'helper',name:'Helper',side:'ally',control:helperControl,initiative:80,position:{x:0,y:5}},
  {id:'foe',name:'Foe',side:'enemy',control:'manual',initiative:50,position:{x:4,y:2}}
 ].map(v=>E.actorFrom({hp:30,maxHp:30,dc:12,...v},true,'bonuses'));
 return E.startCombat(E.validateState(s)).state;
}
const caller=s=>E.findActor(s,'caller');
function announced(s){const a=caller(s),report=E.alarmReport(s,a);assert(report);a.aiMemory.lastAlarm=report.key;a.aiMemory.opponents.find(k=>k.id===report.target).announced=report.key;a.aiMemory.alarmSentRound=s.round-1;return s;}

for(const control of ['basic','manual','dm'])test('legacy alarm cannot repeat an already announced sighting just because a '+control+' ally is available',()=>{
 const s=announced(scene(control)),before=E.clone(s);assert.equal(E.alarmReport(s,caller(s)),null);assert.equal(E.canAlarm(s,caller(s)),false);assert.equal(E.canAlarm(s,caller(s),true),false);assert.notEqual(planAdvancedTurn(s).intent.type,'alarm');assert.deepEqual(s,before);
});

for(const state of ['unknown','cleared','inactive','expired','same-round'])test('legacy alarm rejects '+state+' knowledge despite an available pack recipient',()=>{
 const s=scene(),a=caller(s),k=a.aiMemory.opponents.find(v=>v.id==='foe');
 if(state!=='same-round')E.findActor(s,'foe').position={x:15,y:8};
 if(state==='unknown')a.aiMemory.opponents=[];
 else if(state==='same-round')a.aiMemory.alarmSentRound=s.round;
 else if(state==='expired'){s.turnSerial=100;s.action.turnSerial=100;s.movement.turnSerial=100;k.seen=1;}
 else k.activity=state;
 const before=E.clone(s);assert.equal(E.alarmReport(s,a),null);assert.equal(E.canAlarm(s,a),false);assert.equal(E.canAlarm(s,a,true),false);assert.deepEqual(s,before);
});

test('rejected legacy alarm leaves actions, stock, random state and log unchanged',()=>{
 const s=announced(scene()),before=E.clone(s);let draws=0;assert.throws(()=>E.resolveAction(s,{type:'alarm',actor:'caller'},{source:'advanced',roll:()=>{draws++;return 10;}}));assert.equal(draws,0);assert.deepEqual(s,before);
});

test('a fresh legacy threat report still mobilizes its Basic recipient and pays once',()=>{
 const s=scene(),a=caller(s);assert(E.canAlarm(s,a));const r=E.resolveAction(s,{type:'alarm',actor:'caller'},{source:'advanced',roll});assert(r.result.alarm);assert(r.result.recipients.includes('helper'));assert.equal(caller(r.state).resources[0].quantity,6);assert(E.actionBudget(r.state,caller(r.state)).used);assert(E.findActor(r.state,'helper').aiMemory.packCall);assert.equal(r.state.log.filter(e=>e.details?.alarm).length,1);
});

test('explicit Alert ability retains manual rally calls without any opponent observation',()=>{
 const s=scene(),a=caller(s);E.findActor(s,'foe').position={x:15,y:8};a.aiMemory.opponents=[];a.skills=[{...skillPreset('alert','en'),id:'call',ai:true,range:6,check:false}];assert.equal(E.alarmReport(s,a),null);assert(E.canUseSkill(s,a,a,a.skills[0]));const r=E.resolveAction(s,{type:'skill',actor:'caller',target:'caller',skill:'call'},{roll});assert.equal(r.result.skillKind,'alert');assert(r.result.alarm);assert(r.result.recipients.includes('helper'));assert.equal(caller(r.state).resources[0].quantity,8);
});

test('sync and asynchronous Advanced turns choose another action and finish after an already announced report',async()=>{
 const s=announced(scene()),before=E.clone(s);
 for(const run of [resolveAdvancedTurn,resolveAdvancedTurnAsync]){const r=await run(s,{roll,yield:async()=>{}});assert.notEqual(E.turnToken(r.state),E.turnToken(s));assert(!r.state.log.slice(s.log.length).some(e=>e.details?.alarm));E.validateState(r.state);}
 assert.deepEqual(s,before);
});

test('controller AI series continues through an unavailable legacy alarm instead of stopping at the same turn',async()=>{
 let bundle={state:announced(scene()),history:[],library:[]};const c=createController({key:()=> 'alarm-rc',read:()=>bundle,write:v=>{bundle=v;},save:async()=>{},preferences:()=>({language:'en'})});
 const token=E.turnToken(c.state()),r=await c.aiRun(5);assert(r.count>=1);assert.notEqual(E.turnToken(c.state()),token);assert.equal(c.aiRunning(),false);assert.equal(c.pendingReaction(),null);assert.equal(E.currentActor(c.state()).control,'manual');E.validateState(c.state());
});
