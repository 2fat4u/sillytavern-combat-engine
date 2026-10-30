import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../engine.js';
import {skillPreset} from '../skills.js';
import {planAdvancedTurn} from '../advanced-ai.js';
import {resolveAdvancedTurn,resolveAdvancedTurnAsync} from '../advanced-runner.js';
import {resolveBasicTurn} from '../ai.js';
import {createController} from '../controller.js';

const roll=n=>n===20?15:2;
const actor=(s,id)=>E.findActor(s,id);
function scene({idle='patrol',guard={},foe={}}={}){
 let s=E.emptyState();s.rules=E.rulesFrom({...s.rules,visionEnabled:true,visionBase:3,visionPerception:false,hideUnseenEnemies:true,statMode:'bonuses',splitMovement:true,multiActionsEnabled:true,movementBase:3,movementStat:'none',stancesEnabled:false,rngMode:'seeded',seed:'late-manual-call'});s.board={...s.board,width:16,height:9};
 s.actors=[{id:'guard',name:'Guard',side:'ally',control:'advanced',initiative:100,position:{x:6,y:0},weaponList:[],aiConfig:{idle,free:true,retreat:false,alarm:false},...guard},{id:'scout',name:'Scout',side:'ally',control:'basic',initiative:80,position:{x:2,y:4}},{id:'caller',name:'Caller',side:'player',control:'manual',initiative:70,position:{x:12,y:5},skills:[{...skillPreset('alert','en'),id:'call',range:10}]},{id:'foe',name:'Foe',side:'enemy',control:'manual',initiative:50,position:{x:15,y:8},...foe}].map(v=>E.actorFrom({hp:30,maxHp:30,dc:12,...v},true,'bonuses'));
 s=E.startCombat(E.validateState(s)).state;while(E.currentActor(s).id!=='caller')s=E.endTurn(s).state;s.round=10;return s;
}
function call(s){return E.resolveAction(s,{type:'skill',actor:'caller',target:'caller',skill:'call'},{roll}).state;}
function until(s,id){while(s.phase==='active'&&E.currentActor(s)?.id!==id)s=E.endTurn(s,undefined,{roll}).state;return s;}

for(const idle of ['wait','patrol','search'])for(const async of [false,true])test(`${async?'async':'sync'} ${idle} recipient follows a late manual threat call until own contact`,async()=>{
 let s=call(scene({idle}));const point={x:15,y:8};assert.equal(actor(s,'guard').aiMemory.alert.target,'foe');assert(!E.visibleTo(s,actor(s,'guard'),actor(s,'foe')));
 for(let i=0;i<4;i++){
  s=until(s,'guard');const a=actor(s,'guard'),before=E.distance(a.position,point),seen=E.visibleTo(s,a,actor(s,'foe')),plan=planAdvancedTurn(s);if(!seen)assert(plan.followCall);assert(!plan.patrol);assert.deepEqual(E.rallyNotice(s,a).position,point);
  s=(await(async?resolveAdvancedTurnAsync:resolveAdvancedTurn)(s,{roll,yield:async()=>{}})).state;if(!seen)assert(E.distance(actor(s,'guard').position,point)<before);assert(E.movementBudget(s,actor(s,'guard')).spent<=3);
  s=until(s,'scout');s=resolveBasicTurn(s,{roll}).state;
 }
 assert.equal(s.round,14);assert(E.visibleTo(s,actor(s,'guard'),actor(s,'foe')));assert(E.visibleTo(s,actor(s,'scout'),actor(s,'foe')));assert(actor(s,'guard').aiMemory.packCall.done);E.validateState(s);
});

for(const async of [false,true])test(`${async?'async':'sync'} Advanced response discovers an enemy on its route and uses its real remaining action`,async()=>{
 let s=call(scene({guard:{weaponList:[{id:'bow',name:'Bow',mode:'ranged',range:6,damage:'1d4'}],attackMode:'ranged'},foe:{position:{x:10,y:5}}}));s=until(s,'guard');assert(!E.visibleTo(s,actor(s,'guard'),actor(s,'foe')));assert(planAdvancedTurn(s).followCall);
 const start=s.log.length;s=(await(async?resolveAdvancedTurnAsync:resolveAdvancedTurn)(s,{roll,yield:async()=>{}})).state;const events=s.log.slice(start);assert(events.some(e=>e.type==='move'&&e.details?.actor==='guard'));assert(events.some(e=>['hit','miss'].includes(e.type)&&e.details?.actor==='guard'));assert(actor(s,'foe').hp<30);assert(E.movementBudget(s,actor(s,'guard')).spent<=3);assert.notEqual(E.currentActor(s).id,'guard');
});

for(const async of [false,true])test(`${async?'async':'sync'} Advanced recipient heals first and still approaches the rally point with remaining movement`,async()=>{
 let s=call(scene({guard:{hp:5,resources:[{id:'potion',name:'Potion',kind:'supply',quantity:1,heal:'1d4+2',range:0}]}}));s=until(s,'guard');const before=E.distance(actor(s,'guard').position,{x:12,y:5});s=(await(async?resolveAdvancedTurnAsync:resolveAdvancedTurn)(s,{roll,yield:async()=>{}})).state;
 assert.equal(actor(s,'guard').hp,9);assert.equal(actor(s,'guard').resources[0].quantity,0);assert(E.distance(actor(s,'guard').position,{x:12,y:5})<before);assert.equal(s.log.filter(e=>e.type==='use'&&e.details?.actor==='guard').length,1);assert(E.movementBudget(s,actor(s,'guard')).spent<=3);
});

test('a protected Advanced territory still rejects an unreachable rally destination',()=>{
 const s=scene({guard:{aiConfig:{idle:'patrol',free:false,radius:0}}}),recipients=E.alertAbilityStatus(s,actor(s,'caller'),actor(s,'caller').skills[0]).recipients;assert(!recipients.some(a=>a.id==='guard'));assert(recipients.some(a=>a.id==='scout'));
});

test('debug snapshots retain the received call, expiry, cooldown and configured alert radius',async()=>{
 const bundle={state:scene(),history:[]};const c=createController({key:()=> 'alert-debug',read:()=>bundle,write:v=>Object.assign(bundle,v),save:async()=>{},preferences:()=>({language:'en',debugEnabled:true})});await c.act({type:'skill',actor:'caller',target:'caller',skill:'call'},{roll});
 const data=JSON.parse(c.debugText()),snapshot=data.entries.findLast(e=>e.state?.actors.find(a=>a.id==='guard')?.aiSearch.packCall);
 assert(snapshot);const guard=snapshot.state.actors.find(a=>a.id==='guard'),caller=snapshot.state.actors.find(a=>a.id==='caller');assert.equal(guard.aiSearch.packCall.source,'caller');assert.equal(guard.aiSearch.packCall.position,'P9');assert.equal(guard.aiSearch.packCall.expires,16);assert.equal(guard.aiSearch.callCooldown,13);assert.equal(caller.alertAbilities[0].range,10);assert(!JSON.stringify(guard.aiSearch.packCall).includes('[depth limit]'));
});
