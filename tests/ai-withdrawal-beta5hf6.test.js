import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../engine.js';
import {skillPreset} from '../skills.js';
import {aiRecord} from '../ai-state.js';
import {planAdvancedTurn} from '../advanced-ai.js';
import {resolveAdvancedTurn,resolveAdvancedTurnAsync} from '../advanced-runner.js';
import {createController} from '../controller.js';
const roll=n=>n===20?15:2;
const bow={id:'bow',name:'Bow',mode:'ranged',damage:'1d4',range:12,resource:'arrows',standard:null};
const potion={id:'potion',name:'Last potion',kind:'supply',quantity:1,heal:'1d4+1',range:0};
function scene({hero={},source={},secret={},rules={},fear=true}={}){
 if(hero.resources&&!hero.weaponList)hero={...hero,weaponList:[{...bow,resource:hero.resources.some(v=>v.id==='arrows')?'arrows':null}]};
 let s=E.emptyState();s.rules=E.rulesFrom({...s.rules,stancesEnabled:false,statMode:'bonuses',multiActionsEnabled:true,splitMovement:true,movementBase:4,movementStat:'none',damageAbility:false,natural20:false,visionEnabled:true,visionBase:3,visionPerception:false,hideUnseenEnemies:true,rngMode:'seeded',seed:'withdrawal',...rules});
 s.board={...s.board,width:13,height:5,cover:[{x:5,y:2}],blocked:Array.from({length:13},(_,x)=>[{x,y:1},{x,y:3}]).flat()};
 s.actors=[{id:'hero',name:'Archer',side:'ally',control:'advanced',initiative:100,position:{x:7,y:2},hp:3,maxHp:16,attackBonus:15,weaponList:[bow],resources:[{id:'arrows',name:'Arrows',kind:'ammo',quantity:4},potion],aiConfig:{idle:'wait',free:true,retreat:true},...hero},{id:'source',name:'Known attacker',side:'enemy',initiative:50,position:{x:8,y:2},hp:30,maxHp:30,weaponList:[{id:'blade',mode:'melee',damage:'1d4'}],...source},{id:'secret',name:'Newly seen attacker',side:'enemy',initiative:30,position:{x:1,y:2},hp:30,maxHp:30,...secret}].map(a=>E.actorFrom({stats:Object.fromEntries(Object.keys(E.STATS).map(k=>[k,0])),...a},true,s.rules.statMode));s=E.startCombat(E.validateState(s)).state;
 const a=s.actors[0],k=aiRecord(a,'source');k.samples=[5];k.observations=[{type:'physical',amount:5}];Object.assign(k.combat,{melee:true,ranged:0,movement:3,attacks:1});
 if(fear)s=E.editActor(s,'hero',{tactics:[{type:'frightened',turns:1,source:'source',policy:'cover',appliedTurn:s.turnSerial}]}).state;
 return s;
}
const own=s=>s.actors[0],events=s=>s.log.filter(e=>e.details?.actor==='hero');
for(const asynchronous of [false,true])for(const contact of [false,true])test((asynchronous?'async':'sync')+' withdrawal rechecks a critical self heal, new contact='+contact,async()=>{
 const s=scene({secret:{position:{x:contact?1:0,y:2}}}),before=E.clone(s);assert(!E.visibleTo(s,own(s),s.actors[2]));assert.equal(planAdvancedTurn(s).intent.type,'endTurn');
 const r=await(asynchronous?resolveAdvancedTurnAsync:resolveAdvancedTurn)(s,{roll,yield:async()=>{}});assert.deepEqual(s,before);assert.equal(own(r.state).hp,6);assert.equal(own(r.state).resources.find(v=>v.id==='potion').quantity,0);assert(events(r.state).some(e=>e.type==='use'));assert(r.result.actions.some(v=>v.reassessedAfterWithdrawal));assert(events(r.state).some(e=>e.type==='ai'&&e.textEn.includes(contact?'New contact during withdrawal':'Withdrawal completed')));assert.equal(E.currentActor(r.state).id,'source');E.validateState(r.state);
});
for(const asynchronous of [false,true])test((asynchronous?'async':'sync')+' bow attack after withdrawal uses the remaining action without a potion',async()=>{
 const s=scene({hero:{hp:10,resources:[{id:'arrows',name:'Arrows',kind:'ammo',quantity:4}]}}),r=await(asynchronous?resolveAdvancedTurnAsync:resolveAdvancedTurn)(s,{roll,yield:async()=>{}}),attack=events(r.state).find(e=>e.type==='hit');assert(attack);assert.equal(attack.details.weapon,'bow');assert.equal(own(r.state).resources[0].quantity,3);assert.equal(events(r.state).filter(e=>['hit','miss'].includes(e.type)).length,1);assert.equal(E.movementBudget(r.state,own(r.state)).total,4);assert(E.currentActor(r.state).id!=='hero');
});
test('critical immediate self heal wins across seeds, even against a finishable target',()=>{
 const s=scene({fear:false,source:{hp:1}});for(let i=0;i<48;i++){s.rules.seed='critical-'+i;const p=planAdvancedTurn(s);assert.equal(p.intent.type,'use');assert.equal(p.intent.resource,'potion');assert.equal(p.intent.target,'hero');assert(p.emergencySelf);assert.equal(p.move,null);}
});
test('emergency healing also applies when isolated with no currently visible opponent',()=>{
 const s=scene({fear:false,source:{position:{x:12,y:2}}});assert(!E.visibleTo(s,own(s),s.actors[1]));const p=planAdvancedTurn(s);assert.equal(p.intent.type,'use');assert(p.emergencySelf);
});
test('a linked final stock is consumed once by emergency healing',()=>{
 const s=scene({fear:false,hero:{resources:[{id:'stock',name:'Stock',kind:'ammo',quantity:1},{...potion,quantity:99,consumption:'linked',stock:'stock'}]}}),r=resolveAdvancedTurn(s,{roll});assert.equal(own(r.state).hp,6);assert.equal(own(r.state).resources.find(v=>v.id==='stock').quantity,0);assert.equal(own(r.state).resources.find(v=>v.id==='potion').quantity,99);assert.equal(events(r.state).filter(e=>e.type==='use').length,1);
});
for(const failure of [false,true])test('custom self-heal respects checks, charges and one action; failed='+failure,()=>{
 const v={...skillPreset('narrative'),id:'heal',ai:true,check:true,dc:10,dcMode:'fixed',range:0,resource:'ki',cost:1,mechanics:{target:'self',healing:{dice:'1d4',bonus:1}}},s=scene({fear:false,hero:{skills:[v],resources:[{id:'ki',name:'Ki',kind:'ammo',quantity:1}]}}),p=planAdvancedTurn(s);assert(p.emergencySelf);const r=resolveAdvancedTurn(s,{roll:n=>n===20?(failure?1:15):2});assert.equal(own(r.state).hp,failure?3:6);assert.equal(own(r.state).resources[0].quantity,0);assert.equal(events(r.state).filter(e=>e.type==='skill').length,1);
});
test('forbidden self recipients, empty stocks and disabled supplies never grant healing',()=>{
 for(const patch of [{hero:{resources:[{...potion,recipient:'other'}]}},{hero:{resources:[{...potion,quantity:0}]}},{rules:{resourcesEnabled:false}}]){const s=scene({fear:false,...patch}),r=resolveAdvancedTurn(s,{roll});assert(!events(r.state).some(e=>e.type==='use'));assert.equal(own(r.state).hp,3);}
});
test('an attack-only bonus action cannot be spent as a heal after retreat',()=>{
 const s=scene({hero:{hp:10,bonusActions:[{id:'attack',name:'Attack',count:1,allowed:['attack']}]}});s.action={actorId:'hero',turnSerial:s.turnSerial,freeSpent:1,bonusSpent:{},used:false};const r=resolveAdvancedTurn(s,{roll}),hit=events(r.state).find(e=>e.type==='hit');assert(hit);assert.equal(hit.details.actionPool.id,'attack');assert.equal(own(r.state).resources.find(v=>v.id==='potion').quantity,1);assert.equal(events(r.state).filter(e=>['hit','miss'].includes(e.type)).length,1);
});
test('a spent action is never recreated by a withdrawal',()=>{
 const s=scene();s.action={actorId:'hero',turnSerial:s.turnSerial,freeSpent:1,bonusSpent:{},used:true};const r=resolveAdvancedTurn(s,{roll});assert(!events(r.state).some(e=>['use','hit','miss','skill'].includes(e.type)));assert.equal(own(r.state).resources.find(v=>v.id==='potion').quantity,1);
});
test('movement with no useful affordable follow-up still ends, without an invented attack',()=>{
 const s=scene({hero:{hp:10,weaponList:[],weapons:{melee:null,ranged:null},resources:[]}}),r=resolveAdvancedTurn(s,{roll});assert(!events(r.state).some(e=>['hit','miss','use'].includes(e.type)));assert(events(r.state).some(e=>e.type==='turn'));assert(events(r.state).length<30);assert.equal(E.currentActor(r.state).id,'source');
});
test('cancelled retreat rolls back its plan and does not consume potion, arrows or actions',async()=>{
 const s=scene(),before=E.clone(s),r=await resolveAdvancedTurnAsync(s,{roll,yield:async()=>{},move:async state=>({state,result:{cancelled:true}})});assert.deepEqual(s,before);assert.deepEqual(r.state,before);assert.equal(own(r.state).resources.find(v=>v.id==='potion').quantity,1);
});
test('stopping after a withdrawal commits only movement; resuming spends one available healing action',async()=>{
 const s=scene();let stop=false;const paused=await resolveAdvancedTurnAsync(s,{roll,yield:async()=>{stop=true;},shouldStop:()=>stop});assert(paused.result.paused);assert.equal(own(paused.state).hp,3);assert.equal(own(paused.state).resources.find(v=>v.id==='potion').quantity,1);const resumed=resolveAdvancedTurn(paused.state,{roll});assert.equal(own(resumed.state).hp,6);assert.equal(own(resumed.state).resources.find(v=>v.id==='potion').quantity,0);
});
function rescue({hero={},victim={},foe={},rules={}}={}){
 let s=scene({fear:false,hero:{hp:12,maxHp:17,position:{x:7,y:2},aiBehavior:'aggressive',resources:[{...potion,heal:'1d6+2',range:3}],...hero},source:{hp:1,position:{x:8,y:2},...foe},secret:{position:{x:0,y:2}},rules:{visionBase:6,...rules}});s.actors.push(E.actorFrom({id:'fallen',name:'Fallen friend',side:'ally',hp:0,maxHp:16,condition:'unconscious',roundsLeft:1,position:{x:4,y:2},...victim},true,s.rules.statMode));s.order.push('fallen');return E.validateState(s);
}
test('an aggressive ally prioritizes an immediately reachable last-deadline healing throw over an easy attack',()=>{
 const s=rescue();for(let i=0;i<30;i++){s.rules.seed='aid-'+i;const p=planAdvancedTurn(s);assert.equal(p.intent.type,'use');assert.equal(p.intent.target,'fallen');assert(p.urgentRescue);}const r=resolveAdvancedTurn(s,{roll});assert(r.state.actors.find(a=>a.id==='fallen').hp>0);assert.equal(own(r.state).resources.find(v=>v.id==='potion').quantity,0);
});
test('healing is preferred to stabilization when a last-deadline ally can actually be restored',()=>{
 const s=rescue({victim:{position:{x:6,y:2}}}),p=planAdvancedTurn(s);assert.equal(p.intent.type,'use');assert(p.urgentRescue);assert(!p.urgentStabilize);
});
test('a last-deadline stabilization is prioritized when no healing stock exists',()=>{
 const s=rescue({hero:{resources:[]},victim:{position:{x:6,y:2}}}),p=planAdvancedTurn(s);assert.equal(p.intent.type,'stabilize');assert(p.urgentStabilize);
});
test('critical self-care precedes urgent allied rescue when both share the last flask',()=>{
 const p=planAdvancedTurn(rescue({hero:{hp:3}}));assert(p.emergencySelf);assert.equal(p.intent.type,'use');assert.equal(p.intent.target,'hero');
});
test('an actual thrown heal can move into legal range and still resolve in the same turn',()=>{
 const s=rescue({victim:{position:{x:3,y:2}}}),p=planAdvancedTurn(s);assert(p.urgentRescue);assert(p.move);const r=resolveAdvancedTurn(s,{roll}),v=r.state.actors.find(a=>a.id==='fallen');assert(v.hp>0);assert(events(r.state).some(e=>e.type==='move'));assert(events(r.state).some(e=>e.type==='use'));E.validateState(r.state);
});
test('dead allies are not incorrectly revived by a normal potion',()=>{
 const s=rescue({victim:{condition:'dead',roundsLeft:null}}),p=planAdvancedTurn(s);assert(!p.urgentRescue);assert(!(p.intent.type==='use'&&p.intent.target==='fallen'));
});
test('aggressive enemies retain their existing lower stabilization priority',()=>{
 const s=rescue({hero:{side:'enemy',resources:[]},victim:{side:'enemy',position:{x:6,y:2}},foe:{side:'player',hp:30}}),p=planAdvancedTurn(s);assert(!p.urgentStabilize);
});
test('controller Undo and import preserve a completed movement-plus-action as one own turn',async()=>{
 const s=scene();let bundle={state:s,history:[]};const c=createController({key:()=> 'withdrawal-test',read:()=>bundle,write:v=>bundle=v,save:async()=>{}});await c.aiStep({roll,yield:async()=>{}});assert.equal(own(c.state()).hp,6);await c.undo();assert.equal(own(c.state()).hp,3);assert.equal(own(c.state()).resources.find(v=>v.id==='potion').quantity,1);assert.deepEqual(own(c.state()).position,own(s).position);await c.import(JSON.parse(JSON.stringify(c.export())));await c.aiStep({roll,yield:async()=>{}});assert.equal(own(c.state()).hp,6);
});
for(const asynchronous of [false,true])test((asynchronous?'async':'sync')+' voluntary retreat discovers an opponent and fires before ending',async()=>{
 const s=scene({fear:false,hero:{hp:5,resources:[{id:'arrows',name:'Arrows',kind:'ammo',quantity:4}]},rules:{movementBase:6,seed:'retreat-2'}}),plan=planAdvancedTurn(s);assert(plan.escape&&plan.move);const r=await(asynchronous?resolveAdvancedTurnAsync:resolveAdvancedTurn)(s,{roll,yield:async()=>{}});assert(r.result.actions.some(v=>v.reassessedAfterWithdrawal&&v.discovered));assert(events(r.state).some(e=>e.type==='hit'&&e.details.target==='secret'));assert.equal(own(r.state).resources[0].quantity,3);assert(r.result.actions.length<10);
});
test('a retreat interrupted by an incapacitating opportunity attack cannot heal or shoot afterward',()=>{
 const s=scene({source:{attackBonus:30,reactionControl:'auto',reactionCost:'extra'},rules:{reactionsEnabled:true,opportunityEnabled:true}}),r=resolveAdvancedTurn(s,{roll:n=>n===20?15:4});assert.equal(own(r.state).hp,0);assert(!events(r.state).some(e=>['use','skill'].includes(e.type)));assert.equal(own(r.state).resources.find(v=>v.id==='potion').quantity,1);assert.equal(own(r.state).resources.find(v=>v.id==='arrows').quantity,4);E.validateState(r.state);
});
test('an unobserved opponent profile cannot influence healing or post-withdrawal planning',()=>{
 const s=scene({fear:false,source:{position:{x:12,y:2}}}),before=E.clone(s),changed=E.clone(s);changed.actors[1].weaponList=[{...changed.actors[1].weaponList[0],damage:'20d20'}];changed.actors[2].hp=1;const p=planAdvancedTurn(s),q=planAdvancedTurn(changed);assert.deepEqual(p,q);assert.deepEqual(s,before);
});
test('critical self-healing does not force a harmful area revival of an adjacent opponent',()=>{
 const s=scene({fear:false,source:{hp:0,condition:'unconscious',roundsLeft:1},hero:{resources:[{...potion,radius:1,targets:'all'}]}}),p=planAdvancedTurn(s);assert.equal(p.intent.type,'use');assert(p.move);const moved=E.moveActor(s,'hero',p.move,false,{roll}),r=E.resolveAction(moved.state,p.intent,{roll,source:'advanced'});assert(own(r.state).hp>3);assert.equal(r.state.actors[1].hp,0);
});
