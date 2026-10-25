import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../engine.js';
import { planAdvancedTurn } from '../advanced-ai.js';
import { resolveAdvancedTurn,resolveAdvancedTurnAsync } from '../advanced-runner.js';
import { createController } from '../controller.js';

function fleeScene(){
 let s=E.emptyState();s.rules=E.rulesFrom({...s.rules,splitMovement:true,movementStat:'none'});
 s.actors=[{id:'runner',name:'Runner',side:'player',initiative:100,hp:1,position:{x:0,y:2},resources:[{id:'potions',name:'Potions',quantity:2,kind:'supply',heal:'1d4'}]},{id:'enemy',name:'Enemy',side:'enemy',initiative:50,position:{x:7,y:7}},{id:'friend',name:'Friend',side:'ally',initiative:20,position:{x:6,y:7}}].map(a=>E.actorFrom({...a,maxHp:20},true));
 s=E.startCombat(E.validateState(s)).state;return E.resolveAction(s,{type:'flee',actor:'runner'}).state;
}
test('explicit return and deployment is atomic and preserves HP, stock, initiative and the current actor',()=>{
 const s=fleeScene(),before=E.clone(s),a=s.actors[0],current=E.currentActor(s).id,r=E.deployActor(s,a.id,{x:1,y:2},{returnEscaped:true,timing:'next'}).state,b=r.actors[0];
 assert(!b.escaped&&!b.reserve);assert.deepEqual(b.position,{x:1,y:2});assert.equal(b.hp,1);assert.deepEqual(b.resources,a.resources);assert.equal(b.initiative,a.initiative);assert.equal(E.currentActor(r).id,current);assert.equal(r.order.filter(id=>id===b.id).length,1);assert.equal(b.joinRound,r.round+1);assert.deepEqual(r.rng,s.rng);assert.deepEqual(s,before);
});
test('return-and-place rejects an occupied cell without clearing flight or changing anything',()=>{
 const s=fleeScene(),before=E.clone(s);assert.throws(()=>E.deployActor(s,'runner',s.actors[1].position,{returnEscaped:true}),/belegt/);assert.deepEqual(s,before);
});
test('return-and-place rejects blocked cells and pits atomically',()=>{
 for(const kind of ['blocked','pits']){const s=fleeScene();s.board[kind]=[{x:1,y:2}];const before=E.clone(s);assert.throws(()=>E.deployActor(s,'runner',{x:1,y:2},{returnEscaped:true}));assert.deepEqual(s,before);}
});
test('ordinary movement cannot silently undo flight; the explicit return option must be boolean',()=>{
 const s=fleeScene();assert.throws(()=>E.moveActor(s,'runner',{x:1,y:2},true),/zurückholen/);assert.throws(()=>E.moveActor(s,'runner',{x:1,y:2},false,{returnEscaped:true}),/zurückholen/);assert.throws(()=>E.deployActor(s,'runner',{x:1,y:2},{returnEscaped:'true'}),/Boolean/);
});
test('separate return then placement still works and records the returned actor',()=>{
 const s=E.returnActor(fleeScene(),'runner').state;assert(!s.actors[0].escaped);assert(s.actors[0].reserve);assert.equal(s.log.at(-1).details.actor,'runner');assert.deepEqual(E.deployActor(s,'runner',{x:1,y:2}).state.actors[0].position,{x:1,y:2});
});
test('a returning participant cannot gain a second own turn in the same round',()=>{
 const s=fleeScene(),r=E.deployActor(s,'runner',{x:1,y:2},{returnEscaped:true,timing:'remaining'}).state;assert.equal(r.actors[0].turnRound,1);assert.equal(r.actors[0].joinRound,2);assert.notEqual(E.currentActor(r).id,'runner');
});
test('controller Undo restores flight, off-board state and the original stock after a combined return',async()=>{
 let bundle={state:fleeScene(),history:[]};const before=E.clone(bundle.state),c=createController({key:()=> 'return',read:()=>bundle,write:v=>{bundle=v;},save:async()=>{}});await c.deploy('runner',{x:1,y:2},{returnEscaped:true,timing:'next'});assert(!c.state().actors[0].escaped);await c.undo();assert.deepEqual(c.state().actors,before.actors);
});
test('explicit return also permits safe placement before combat starts',()=>{
 let s=E.emptyState();s.actors=[E.actorFrom({id:'runner',name:'Runner',escaped:true,hp:1,maxHp:20,position:null},true)];s=E.deployActor(s,'runner',{x:1,y:2},{returnEscaped:true}).state;assert.equal(s.phase,'setup');assert(!s.actors[0].escaped);assert.equal(s.actors[0].hp,1);assert.deepEqual(s.actors[0].position,{x:1,y:2});
});

function cornerScene({hidden=true,melee=false}={}){
 let s=E.emptyState();s.rules=E.rulesFrom({...s.rules,visionEnabled:hidden,visionBase:8,visionPerception:false,stancesEnabled:false,splitMovement:true,movementBase:6,movementStat:'none'});s.board={...s.board,width:10,height:9,blocked:hidden?[{x:4,y:3},{x:4,y:4}]:[]};
 s.actors=[{id:'hero',name:'Fighter',side:'player',control:'advanced',initiative:100,position:{x:2,y:3},attackMode:melee?'melee':'ranged',weaponList:[{id:'bow',mode:'ranged',damage:'1d4',range:10},...(melee?[{id:'blade',mode:'melee',damage:'1d4'}]:[])],aiConfig:{retreat:false}},{id:'foe',name:'Foe',side:'enemy',position:{x:1,y:4}},...(hidden?[{id:'boss',name:'Boss',side:'enemy',position:{x:6,y:4}}]:[])].map(a=>E.actorFrom({...a,hp:100,maxHp:100},true));
 s=E.startCombat(E.validateState(s)).state;return E.resolveAction(s,{type:'attack',actor:'hero',target:'foe',weapon:melee?'blade':'bow'},{roll:n=>n===20?15:1}).state;
}
test('remaining-movement planning does not peek at an unseen opponent behind a corner',()=>{
 const s=cornerScene(),a=s.actors[0],p=planAdvancedTurn(s);assert(!E.visibleTo(s,a,s.actors[2]));assert(p.reposition);const changed=E.clone(s);changed.actors[2].position={x:6,y:5};assert(!E.visibleTo(changed,changed.actors[0],changed.actors[2]));assert.deepEqual(planAdvancedTurn(changed),p);
});
for(const asyncRun of [false,true])test((asyncRun?'async':'sync')+' remaining movement stops on discovery and reassesses before entering melee',async()=>{
 const s=cornerScene(),before=E.clone(s),r=asyncRun?await resolveAdvancedTurnAsync(s,{yield:async()=>{}}):resolveAdvancedTurn(s),a=r.state.actors[0],discovery=r.result.actions.find(v=>v.discovered);
 assert(discovery);assert(E.distance(discovery.plan.move,s.actors[2].position)>1);assert(E.distance(a.position,s.actors[2].position)>1);assert(r.state.log.some(e=>e.type==='move'));assert.equal(a.hp,100);assert.equal(a.aiMemory.opponents.find(v=>v.id==='boss').activity,'active');assert.deepEqual(s,before);E.validateState(r.state);
});
test('a discovery yield can pause and resume the same actor without spending another action',async()=>{
 const s=cornerScene();let stop=false;const paused=await resolveAdvancedTurnAsync(s,{shouldStop:()=>stop,yield:async()=>{stop=true;}});assert(paused.result.paused);assert.equal(E.currentActor(paused.state).id,'hero');assert.equal(paused.state.action.freeSpent,1);assert(E.movementBudget(paused.state,paused.state.actors[0]).remaining>0);
 const resumed=await resolveAdvancedTurnAsync(paused.state,{yield:async()=>{}});assert.notEqual(E.currentActor(resumed.state)?.id,'hero');assert.equal(resumed.state.log.filter(e=>['hit','miss'].includes(e.type)&&e.details.actor==='hero').length,1);
});
test('discovery movement respects the assigned territory',()=>{
 const s=cornerScene();s.actors[0].aiConfig={...s.actors[0].aiConfig,free:false,home:{...s.actors[0].position},radius:3};const r=resolveAdvancedTurn(s),home=s.actors[0].aiConfig.home;for(const e of r.state.log.filter(e=>e.type==='move')){const match=/^([A-Z])(\d+)$/.exec(e.details.to);assert(E.distance(home,{x:match[1].charCodeAt(0)-65,y:Number(match[2])-1})<=3);}
});
test('a healthy melee fighter with a backup bow does not disengage solely for owning ranged equipment',()=>{
 const s=cornerScene({hidden:false,melee:true});for(let i=0;i<30;i++){s.rules.seed='mixed-weapons-'+i;assert.equal(planAdvancedTurn(s).move,null);}
});
test('observing a retreat path never tries to stop on a downed participant',()=>{
 const s=cornerScene();s.actors.push(E.actorFrom({id:'downed',name:'Downed friend',side:'ally',hp:0,maxHp:20,condition:'stabilized',position:{x:3,y:2}},true));s.order.push('downed');
 const result=resolveAdvancedTurn(s),downed=s.actors.at(-1);for(const e of result.state.log.filter(e=>e.type==='move'))assert.notEqual(e.details.to,E.coordinate(downed.position));assert.equal(result.state.actors.find(a=>a.id==='downed').hp,0);E.validateState(result.state);
});
test('optional repositioning does not trade one adjacent opponent for a different visible opponent',()=>{
 const s=cornerScene();s.rules.visionEnabled=false;const a=s.actors[0],p=planAdvancedTurn(s);if(p.move)for(const b of s.actors.slice(1))if(E.distance(a.position,b.position)>1)assert(E.distance(p.move,b.position)>1);
});
