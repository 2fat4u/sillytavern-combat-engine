import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../engine.js';
import { aiRecord,aiClueKey } from '../ai-state.js';
import { createController } from '../controller.js';
import { planAdvancedTurn } from '../advanced-ai.js';
import { resolveAdvancedTurn,resolveAdvancedTurnAsync } from '../advanced-runner.js';
import { latestResult } from '../results.js';
const bow={id:'bow',name:'Bow',mode:'ranged',damage:'1d4',range:10};
const roll=n=>n===20?15:2;
function searchScene(extra={},rules={}){
 let s=E.emptyState();s.rules=E.rulesFrom({...s.rules,visionEnabled:true,visionBase:5,visionPerception:false,stancesEnabled:false,splitMovement:true,multiActionsEnabled:true,movementBase:6,movementStat:'none',rngMode:'seeded',seed:'search-reassess',...rules});s.board={...s.board,width:12,height:9,blocked:[0,1,2,3,4].map(y=>({x:4,y}))};
 s.actors=[E.actorFrom({id:'scout',name:'Scout',side:'player',control:'advanced',position:{x:2,y:3},maxHp:40,hp:40,initiative:100,attackMode:'ranged',weaponList:[bow],aiConfig:{idle:'search',retreat:false},...extra},true),E.actorFrom({id:'foe',name:'Found foe',side:'enemy',control:'manual',position:{x:6,y:3},maxHp:40,hp:40,initiative:50},true)];s=E.startCombat(E.validateState(s)).state;
 const k=aiRecord(s.actors[0],'foe');Object.assign(k,{position:{x:6,y:3},seen:s.turnSerial,sighting:s.turnSerial,activity:'active'});s.actors[0].aiMemory.searchLeft=3;return s;
}
for(const asyncRun of [false,true])test((asyncRun?'async':'sync')+' search reconsiders a newly visible enemy before ending an unused action',async()=>{
 const s=searchScene(),before=E.clone(s),plan=planAdvancedTurn(s);assert(!E.visibleTo(s,s.actors[0],s.actors[1]));assert.equal(plan.intent.type,'endTurn');assert(plan.search);assert(plan.move);
 const r=asyncRun?await resolveAdvancedTurnAsync(s,{roll,yield:()=>Promise.resolve()}):resolveAdvancedTurn(s,{roll});assert(r.result.actions.some(v=>v.discovered));assert(r.state.log.some(e=>e.type==='hit'&&e.details.actor==='scout'));assert.equal(r.state.log.filter(e=>['hit','miss'].includes(e.type)&&e.details.actor==='scout').length,1);assert(r.state.log.some(e=>e.type==='ai'&&e.textEn.includes('New contact during search')));assert.deepEqual(s,before);E.validateState(r.state);
});
test('search discovery is visible in both languages without changing the chosen action',()=>{
 for(const language of ['de','en']){const s=searchScene({}, {language}),r=resolveAdvancedTurn(s,{roll});const e=r.state.log.find(e=>e.type==='ai'&&e.textEn.includes('New contact during search'));assert(E.eventText(e,language).includes(language==='de'?'Neue Sichtung':'New contact'));assert.equal(e.chatRelevant,false);}
});
test('discovery may pause with its action unspent and resume without a free extra action',async()=>{
 const s=searchScene();let stop=false;const paused=await resolveAdvancedTurnAsync(s,{roll,shouldStop:()=>stop,yield:()=>{stop=true;}});assert(paused.result.paused);assert.equal(E.currentActor(paused.state).id,'scout');assert.equal(E.actionBudget(paused.state).free.remaining,1);assert(E.movementBudget(paused.state,paused.state.actors[0]).spent>0);assert(!paused.state.log.some(e=>['hit','miss'].includes(e.type)));
 const resumed=await resolveAdvancedTurnAsync(paused.state,{roll,yield:()=>Promise.resolve()});assert.equal(resumed.state.log.filter(e=>['hit','miss'].includes(e.type)&&e.details.actor==='scout').length,1);assert.notEqual(E.currentActor(resumed.state)?.id,'scout');E.validateState(resumed.state);
});
test('a cancelled search movement preserves the before-plan state and observed knowledge',async()=>{
 const s=searchScene(),r=await resolveAdvancedTurnAsync(s,{move:async state=>({state,result:{cancelled:true}}),yield:()=>Promise.resolve()});assert.deepEqual(r.state,s);assert(r.result.paused);
});
test('discovery still respects a fixed territory and pays for every movement segment',()=>{
 const s=searchScene({aiConfig:{idle:'search',free:false,radius:2,retreat:false}}),r=resolveAdvancedTurn(s,{roll});for(const e of r.state.log.filter(e=>e.type==='move')){const p={x:e.details.to.charCodeAt(0)-65,y:Number(e.details.to.slice(1))-1};assert(E.distance(p,s.actors[0].aiConfig.home)<=2);assert(e.details.movement.spent<=6);}assert(!r.state.log.some(e=>['hit','miss'].includes(e.type)));E.validateState(r.state);
});
test('a waiting territorial boss does not acquire patrol movement from the new discovery handling',()=>{
 const s=searchScene({weaponList:[],aiConfig:{idle:'wait',free:false,radius:0,retreat:false}}),r=resolveAdvancedTurn(s,{roll});assert.deepEqual(r.state.actors[0].position,s.actors[0].position);assert(!r.state.log.some(e=>e.type==='move'));
});
test('the remaining-action check does not grant another attack after an already spent action',()=>{
 const s=searchScene();s.action={actorId:'scout',turnSerial:s.turnSerial,freeSpent:1,bonusSpent:{},used:true};const r=resolveAdvancedTurn(s,{roll});assert(!r.state.log.some(e=>['hit','miss'].includes(e.type)&&e.details.actor==='scout'));E.validateState(r.state);
});
function blockedScene(extra={},rules={}){
 let s=E.emptyState();s.rules=E.rulesFrom({...s.rules,shotRiskEnabled:true,stancesEnabled:false,multiActionsEnabled:true,splitMovement:true,movementStat:'none',movementBase:2,rngMode:'seeded',seed:'reason',...rules});s.board={...s.board,width:7,height:3,blocked:Array.from({length:7},(_,x)=>[{x,y:0},{x,y:2}]).flat()};
 s.actors=[E.actorFrom({id:'scout',name:'Shooter',side:'player',control:'advanced',initiative:100,position:{x:1,y:1},weaponList:[bow],attackMode:'ranged',maxHp:40,hp:40,aiConfig:{idle:'wait',retreat:false},...extra},true),E.actorFrom({id:'friend',name:'Friendly blocker',side:'ally',position:{x:2,y:1},maxHp:40,hp:40},true),E.actorFrom({id:'foe',name:'Target',side:'enemy',position:{x:4,y:1},maxHp:40,hp:40},true)];return E.startCombat(E.validateState(s)).state;
}
for(const language of ['de','en'])test(language+' explains a blocked friendly firing line and records a truthful empty turn',()=>{
 const s=blockedScene({}, {language}),p=planAdvancedTurn(s);assert.equal(p.intent.type,'endTurn');assert(p.reasonEn.includes('Friendly blocker'));assert(p.reasonEn.includes('firing line'));const r=resolveAdvancedTurn(s,{roll}),event=r.state.log.find(e=>e.type==='ai');assert(E.eventText(event,language).includes(language==='en'?'No safe shot':'Kein sicherer Schuss'));assert(!r.state.log.some(e=>['hit','miss'].includes(e.type)));assert.equal(latestResult(r.state.log).event.details.actionUsed,false);
});
test('explains an exhausted consumable without inventing a free standard attack',()=>{
 const s=blockedScene({resources:[{id:'charge',name:'Charge',kind:'ammo',quantity:0}],weaponList:[{...bow,resource:'charge',standard:null,consumable:true}]}),p=planAdvancedTurn(s);assert.equal(p.intent.type,'endTurn');assert(p.reasonEn.includes('stock exhausted'));
});
test('explains restricted remaining bonus actions instead of reporting an available attack',()=>{
 const s=blockedScene({bonusActions:[{id:'help',name:'Help',count:1,allowed:['stabilize']}]});s.action={actorId:'scout',turnSerial:s.turnSerial,freeSpent:1,bonusSpent:{},used:false};const p=planAdvancedTurn(s);assert.equal(p.intent.type,'endTurn');assert(p.reasonEn.includes('bonus actions do not allow an attack'));
});
test('importing a search into an older high-clock chat preserves clue age and the same-turn attack',async()=>{
 const s=searchScene();let bundle={state:{...E.emptyState(),turnSerial:2000},history:[]};const c=createController({key:()=> 'import-search',read:()=>bundle,write:v=>bundle=v,save:async()=>{}});await c.import(s);const loaded=c.state(),k=aiRecord(loaded.actors[0],'foe');assert.equal(loaded.turnSerial-k.seen,s.turnSerial-s.actors[0].aiMemory.opponents[0].seen);const r=resolveAdvancedTurn(loaded,{roll});assert(r.result.actions.some(v=>v.discovered));assert(r.state.log.some(e=>e.type==='hit'));E.validateState(r.state);
});
test('import keeps announced clues announced and preserves per-turn observations',async()=>{
 const s=searchScene(),m=s.actors[0].aiMemory,k=aiRecord(s.actors[0],'foe'),oldKey=aiClueKey(k);k.announced=oldKey;m.lastAlarm=oldKey;m.lastSearchTurn=s.turnSerial;k.combat.attackTurn=E.turnToken(s);k.combat.moveTurn=E.turnToken(s);k.combat.attackCount=1;k.combat.moveSpent=2;m.alert={target:'foe',position:{x:6,y:3},turn:s.turnSerial,source:'friend',key:oldKey};let bundle={state:{...E.emptyState(),turnSerial:500},history:[]};const c=createController({key:()=> 'import-observations',read:()=>bundle,write:v=>bundle=v,save:async()=>{}});await c.import(s);const loaded=c.state(),lm=loaded.actors[0].aiMemory,lk=aiRecord(loaded.actors[0],'foe');assert.equal(lk.announced,aiClueKey(lk));assert.equal(lm.lastAlarm,lk.announced);assert.equal(lm.alert.key,lk.announced);assert.equal(lm.alert.turn,loaded.turnSerial);assert.equal(lm.lastSearchTurn,loaded.turnSerial);assert.equal(lk.combat.attackTurn,E.turnToken(loaded));assert.equal(lk.combat.moveTurn,E.turnToken(loaded));assert.equal(lk.combat.attackCount,1);assert.equal(lk.combat.moveSpent,2);
});
test('Undo preserves observation ages instead of making fresh search clues expire',async()=>{
 const s=searchScene();let bundle={state:s,history:[]};const c=createController({key:()=> 'undo-search',read:()=>bundle,write:v=>bundle=v,save:async()=>{}});await c.edit('scout',{hp:39});await c.undo();assert.equal(c.state().actors[0].hp,40);const k=aiRecord(c.state().actors[0],'foe');assert.equal(c.state().turnSerial-k.seen,0);assert(planAdvancedTurn(c.state()).search);E.validateState(c.state());
});
