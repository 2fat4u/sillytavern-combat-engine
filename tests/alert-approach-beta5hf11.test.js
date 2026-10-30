import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../engine.js';
import {skillPreset} from '../skills.js';
import {planBasicTurn,resolveBasicTurn,resolveBasicTurnAsync} from '../ai.js';
import {resolveAdvancedTurn,resolveAdvancedTurnAsync} from '../advanced-runner.js';
import {createController} from '../controller.js';

const roll=n=>n===20?15:2,actor=(s,id)=>E.findActor(s,id),key=p=>p.x+','+p.y;
function scene({caller={},helper={},foe={},others=[],rules={},board={}}={}){
 let s=E.emptyState();s.rules=E.rulesFrom({...s.rules,visionEnabled:true,visionBase:3,visionPerception:false,hideUnseenEnemies:true,statMode:'bonuses',splitMovement:true,multiActionsEnabled:true,movementBase:3,movementStat:'none',stancesEnabled:false,rngMode:'seeded',seed:'approach-hf11',...rules});s.board={...s.board,width:18,height:9,...board};
 s.actors=[{id:'caller',name:'Caller',side:'player',control:'manual',initiative:100,position:{x:12,y:4},skills:[{...skillPreset('alert','en'),id:'call',range:15}],...caller},{id:'helper',name:'Helper',side:'ally',control:'basic',initiative:80,attackMode:'ranged',position:{x:1,y:4},weaponList:[{id:'bow',mode:'ranged',damage:'1d4',range:6}],...helper},{id:'foe',name:'Reported foe',side:'enemy',control:'manual',initiative:50,position:{x:14,y:4},...foe},...others].map(a=>E.actorFrom({hp:30,maxHp:30,dc:12,...a},true,'bonuses'));return E.startCombat(E.validateState(s)).state;
}
const call=s=>E.resolveAction(s,{type:'skill',actor:'caller',target:'caller',skill:'call'},{roll});
const until=(s,id)=>{while(s.phase==='active'&&E.currentActor(s)?.id!==id)s=E.endTurn(s,undefined,{roll}).state;return s;};
const runner=(control,async)=>control==='advanced'?(async?resolveAdvancedTurnAsync:resolveAdvancedTurn):(async?resolveBasicTurnAsync:resolveBasicTurn);

test('a reported opponent supplies a frozen approach region without moving recipients or granting sight',()=>{
 const s=scene(),r=call(s),b=actor(r.state,'helper');assert(r.result.callApproach);assert.deepEqual(r.result.callPosition,{x:14,y:4});assert.deepEqual(b.aiMemory.packCall.position,{x:14,y:4});assert(b.aiMemory.packCall.approach);assert.deepEqual(b.position,actor(s,'helper').position);assert(!E.visibleTo(r.state,b,actor(r.state,'foe')));assert.equal(E.actionBudget(r.state,actor(r.state,'caller')).free.remaining,0);assert.equal(E.actionBudget(r.state,b).free.remaining,1);
});
test('moving an unseen reported opponent does not update the recorded approach position',()=>{
 let s=call(scene()).state;const point={...actor(s,'helper').aiMemory.packCall.position};s=E.moveActor(s,'foe',{x:17,y:8},true).state;assert(!E.visibleTo(s,actor(s,'helper'),actor(s,'foe')));assert.deepEqual(actor(s,'helper').aiMemory.packCall.position,point);assert.equal(actor(s,'helper').aiMemory.opponents.length,0);E.validateState(s);
});
test('without an opponent clue the fixed caller rally point and legacy arrival behavior remain',()=>{
 const s=scene({caller:{position:{x:5,y:1}},foe:{position:{x:17,y:8}}}),r=call(s);assert(!r.result.callApproach);assert.deepEqual(r.result.callPosition,{x:5,y:1});assert(!actor(r.state,'helper').aiMemory.packCall.approach);
});
test('a nearby ally just behind the caller can answer a threat report outside its own sight',()=>{
 const s=scene({caller:{position:{x:10,y:4}},helper:{position:{x:9,y:4}},foe:{position:{x:13,y:4}}});assert(E.visibleTo(s,actor(s,'caller'),actor(s,'foe')));assert(!E.visibleTo(s,actor(s,'helper'),actor(s,'foe')));assert(call(s).result.recipients.includes('helper'));
});
for(const control of ['basic','advanced'])for(const async of [false,true])test(`${control} ${async?'async':'sync'} approach yields to a different enemy discovered between home and the reported region`,async()=>{
 let s=scene({helper:{control,aiConfig:{idle:'patrol',free:true,retreat:false}},others:[{id:'intervening',name:'Intervening foe',side:'enemy',control:'manual',initiative:40,position:{x:7,y:4}}]});assert(!E.visibleTo(s,actor(s,'caller'),actor(s,'intervening')));assert(!E.visibleTo(s,actor(s,'helper'),actor(s,'intervening')));s=until(call(s).state,'helper');
 for(let i=0;i<3&&!s.log.some(e=>['hit','miss'].includes(e.type)&&e.details?.actor==='helper');i++){s=(await runner(control,async)(s,{roll,yield:async()=>{}})).state;if(!s.log.some(e=>['hit','miss'].includes(e.type)&&e.details?.actor==='helper'))s=until(s,'helper');}
 const attack=s.log.find(e=>['hit','miss'].includes(e.type)&&e.details?.actor==='helper');assert(attack);assert.equal(attack.details.target,'intervening');assert(actor(s,'helper').aiMemory.packCall.done);assert.equal(actor(s,'foe').hp,30);assert(E.distance(actor(s,'helper').position,{x:14,y:4})>3);assert(E.movementBudget(s,actor(s,'helper')).spent<=3);
});
for(const control of ['basic','advanced'])test(`${control} approaches legal spaced cells and can shoot in the turn of discovery`,async()=>{
 let s=scene({helper:{control,position:{x:7,y:4},aiConfig:{idle:'patrol',free:true,retreat:false}}});s=until(call(s).state,'helper');s=(await runner(control,true)(s,{roll,yield:async()=>{}})).state;s=until(s,'helper');if(!s.log.some(e=>['hit','miss'].includes(e.type)&&e.details?.actor==='helper'))s=(await runner(control,true)(s,{roll,yield:async()=>{}})).state;
 const b=actor(s,'helper'),d=E.distance(b.position,{x:14,y:4});assert(d>=2);assert(s.log.some(e=>{const p=/^([A-Z])(\d+)$/.exec(e.details?.to??'');return e.type==='move'&&e.details?.actor==='helper'&&p&&E.distance({x:p[1].charCodeAt(0)-65,y:Number(p[2])-1},{x:14,y:4})===3;}));assert(E.canOccupy(s,b.position));assert(s.log.some(e=>['hit','miss'].includes(e.type)&&e.details?.actor==='helper'));assert.equal(s.actors.filter(a=>a.position&&key(a.position)===key(b.position)).length,1);
});
function patrolScene({hidden=false}={}){
 let s=scene({caller:{position:{x:0,y:0}},helper:{position:{x:14,y:4}},foe:{position:{x:15,y:8},...(hidden?{hidden:{turns:3,round:1,appliedTurn:0}}:{})},rules:{hideNeedsTerrain:false,seed:'manual-alert-patrol-hf10'},board:{width:16,height:9}});s=until(s,'helper');s.turnSerial=9;s.action={turnSerial:9,actorId:'',used:false,freeSpent:0,bonusSpent:{}};s.movement={turnSerial:9,actorId:'',spent:0};return s;
}
for(const async of [false,true])test(`${async?'async':'sync'} Basic patrol uses its action after a new route contact instead of ending an empty turn`,async()=>{
 const s=patrolScene(),a=actor(s,'helper');assert(!E.visibleTo(s,a,actor(s,'foe')));const plan=planBasicTurn(s);assert(plan.patrol);assert(plan.move);const r=await runner('basic',async)(s,{roll,yield:async()=>{}}),fresh=r.state.log.filter(e=>!s.log.some(old=>old.id===e.id));assert(fresh.some(e=>['hit','miss'].includes(e.type)&&e.details?.actor==='helper'));assert(fresh.some(e=>e.type==='ai'&&/Patrouille|patrol/.test(e.text)));assert.equal(fresh.filter(e=>e.type==='turn'&&e.details?.actor==='helper').length,0);assert(E.movementBudget(r.state,actor(r.state,'helper')).spent<=3);
});
test('a hidden enemy on the patrol route remains hidden and is not attacked from map knowledge',()=>{
 const s=patrolScene({hidden:true}),r=resolveBasicTurn(s,{roll});assert(!r.state.log.filter(e=>!s.log.some(old=>old.id===e.id)).some(e=>['hit','miss'].includes(e.type)&&e.details?.actor==='helper'));assert(actor(r.state,'foe').hidden);
});
test('paused Basic patrol preserves real movement and its unspent action for resuming',async()=>{
 const s=patrolScene();let stop=false;const paused=await resolveBasicTurnAsync(s,{roll,shouldStop:()=>stop,yield:async()=>{stop=true;}});assert(paused.result.paused);assert.equal(E.currentActor(paused.state).id,'helper');assert.equal(E.actionBudget(paused.state,actor(paused.state,'helper')).free.remaining,1);assert(E.movementBudget(paused.state,actor(paused.state,'helper')).spent>0);const resumed=await resolveBasicTurnAsync(paused.state,{roll,yield:async()=>{}});assert.notEqual(E.currentActor(resumed.state).id,'helper');assert(E.movementBudget(resumed.state,actor(resumed.state,'helper')).spent<=3);
});
test('approach mode survives import, Undo and Redo while old call records remain valid',async()=>{
 let bundle={state:scene(),history:[]};const c=createController({key:()=> 'approach',read:()=>bundle,write:v=>{bundle=v;},save:async()=>{},preferences:()=>({language:'en'})});await c.act({type:'skill',actor:'caller',target:'caller',skill:'call'},{roll});const point=E.clone(actor(c.state(),'helper').aiMemory.packCall);bundle=JSON.parse(JSON.stringify(bundle));E.validateState(c.state());await c.undo();assert.equal(actor(c.state(),'helper').aiMemory.packCall,null);await c.redo();assert.deepEqual(actor(c.state(),'helper').aiMemory.packCall,point);const old=E.clone(c.state());delete actor(old,'helper').aiMemory.packCall.approach;assert(!actor(E.validateState(old),'helper').aiMemory.packCall.approach);const bad=E.clone(c.state());actor(bad,'helper').aiMemory.packCall.approach='yes';assert.throws(()=>E.validateState(bad));
});
test('a protected territory is not left to reach the reported opponent',()=>{
 const s=scene({helper:{control:'advanced',aiConfig:{free:false,radius:0,idle:'patrol'}}});assert.equal(E.alertAbilityStatus(s,actor(s,'caller'),actor(s,'caller').skills[0]).ready,false);assert.throws(()=>call(s));
});
test('hearing radius stays centered on the caller rather than the reported opponent',()=>{
 const s=scene({caller:{skills:[{...skillPreset('alert','en'),id:'call',range:3}]}});assert.equal(E.alertAbilityStatus(s,actor(s,'caller'),actor(s,'caller').skills[0]).ready,false);
});
test('own contact permanently ends the approach even after that opponent leaves sight',()=>{
 let s=call(scene()).state;s=E.moveActor(s,'helper',{x:11,y:4},true).state;assert(actor(s,'helper').aiMemory.packCall.engaged);s=E.moveActor(s,'foe',{x:17,y:8},true).state;assert(!E.visibleTo(s,actor(s,'helper'),actor(s,'foe')));assert.equal(E.rallyDestination(s,actor(s,'helper')),null);assert(E.rallyNotice(s,actor(s,'helper')).engaged);assert(actor(E.validateState(JSON.parse(JSON.stringify(s))),'helper').aiMemory.packCall.engaged);
});
