import test from 'node:test';import assert from 'node:assert/strict';
import * as E from '../engine.js';import {skillPreset} from '../skills.js';
import {carrySelection,carryDestinationMarkup} from '../ability-ui.js';
import {createCheckDrafts,checkIntent,checkMarkup} from '../checks-ui.js';
function scene(movement=6){let s=E.setRules(E.emptyState(),{movementBase:movement,movementStat:'none',splitMovement:true,multiActionsEnabled:true}).state;s=E.setBoard(s,{width:9,height:8}).state;for(const a of [{name:'Helper',side:'player',position:{x:2,y:3},initiative:30,actionsPerTurn:3,resources:[{id:'mana',kind:'ammo',name:'Mana',quantity:8}],skills:[{...skillPreset('carry'),id:'carry',resource:'mana',cost:2}]},{name:'Scout',side:'ally',hp:0,condition:'stabilized',position:{x:1,y:3}},{name:'Enemy',side:'enemy',hp:50,maxHp:50,position:{x:8,y:7},initiative:10}])s=E.addActor(s,a).state;return E.startCombat(s,false).state;}
const intent=(s,target,carrier)=>({type:'skill',actor:s.actors[0].id,target:s.actors[1].id,skill:'carry',destination:target,...(carrier?{carrierDestination:carrier}:{})});
test('carry endpoints: all eight legal helper neighbors are retained rather than just the preferred one',()=>{
 const s=scene(),[a,b]=s.actors,plans=E.carryPlans(s,a,b).filter(v=>v.x===3&&v.y===3);assert.equal(plans.length,8);assert.equal(new Set(plans.map(v=>E.coordinate(v.carrier))).size,8);for(const p of plans){assert.equal(E.distance(p,p.carrier),1);assert(E.canOccupy(s,p.carrier));assert.equal(p.cost,2);}
 const unique=E.carryDestinations(s,a,b).filter(v=>v.x===3&&v.y===3);assert.equal(unique.length,1);assert.deepEqual(unique[0].carrier,{x:4,y:3});
});
for(const carrier of [{x:2,y:2},{x:3,y:2},{x:4,y:2},{x:2,y:3},{x:4,y:3},{x:2,y:4},{x:3,y:4},{x:4,y:4}])test('carry endpoints: explicit helper '+E.coordinate(carrier)+' is resolved exactly and pays once',()=>{
 const s=scene(),p={x:3,y:3},r=E.resolveAction(s,intent(s,p,carrier));assert.deepEqual(r.state.actors[0].position,carrier);assert.deepEqual(r.state.actors[1].position,p);assert.equal(r.state.movement.spent,2);assert.equal(r.state.actors[0].resources[0].quantity,6);assert.equal(r.state.action.freeSpent,1);assert.equal(r.state.actors[1].hp,0);assert.equal(r.result.forcedMovement.carrierTo,E.coordinate(carrier));E.validateState(r.state);
});
test('carry endpoints: both bounds, obstacles, occupancy and movement costs are checked without partial writes',()=>{
 let s=scene(2);s=E.addActor(s,{name:'Blocker',side:'ally',position:{x:4,y:3}}).state;s=E.setBoard(s,{blocked:[{x:3,y:2}]}).state;const before=E.clone(s);for(const c of [{x:3,y:3},{x:4,y:3},{x:3,y:2},{x:-1,y:3},{x:5,y:3},{x:2.5,y:3},{x:4,y:4,extra:1}])assert.throws(()=>E.resolveAction(s,intent(s,{x:3,y:3},c)));assert.deepEqual(s,before);
 assert.throws(()=>E.resolveAction(s,intent(s,{x:5,y:3},{x:6,y:3})));assert.deepEqual(s,before);
});
for(const language of ['de','en'])test('carry endpoints '+language+': small helper selector, separate role rows and selected neighbor cost',()=>{
 const s=scene(),[a,b]=s.actors,choice=carrySelection(s,a,b,'D4',language,null,'C3');assert(choice.plan);assert.deepEqual(choice.plan.carrier,{x:2,y:2});const html=carryDestinationMarkup(s,a,b,'D4',language,'skill',null,'C3');assert.equal((html.match(/<option/g)??[]).length,9);assert(html.includes('value="C3" selected'));assert(html.includes('Scout → D4'));assert(html.includes('Helper → C3'));assert.equal((html.match(/<dt>/g)??[]).length,3);assert.match(carrySelection(s,a,b,'D4',language,null,'D4').error,language==='en'?/distinct/:/verschieden/);
});
test('carry endpoints: own check carries the exact selected helper field through one attempt and one payment',()=>{
 const s=scene(),[a,b]=s.actors,d=createCheckDrafts().get('pair',a.id);Object.assign(d,{effect:'carry',target:b.id,carryCell:'D4',carrierCell:'C3',description:'Bring scout to safety'});checkMarkup(s,a,d,'en');const i=checkIntent(s,a,d);assert.deepEqual(i.carrierDestination,{x:2,y:2});const r=E.resolveAction(s,i,{roll:()=>20});assert.deepEqual(r.state.actors[0].position,{x:2,y:2});assert.deepEqual(r.state.actors[1].position,{x:3,y:3});assert.equal(r.state.actors[0].resources[0].quantity,6);assert.equal(r.state.action.freeSpent,1);
});
test('carry endpoints: a failed checked attempt moves neither participant and spends only action/stock',()=>{
 let s=scene();s=E.editActor(s,s.actors[0].id,{skills:[{...s.actors[0].skills[0],check:true,dc:99}]}).state;const r=E.resolveAction(s,intent(s,{x:3,y:3},{x:2,y:2}),{roll:()=>1});assert(!r.result.success);assert.deepEqual(r.state.actors.map(a=>a.position),s.actors.map(a=>a.position));assert.equal(r.state.movement.spent,0);assert.equal(r.state.actors[0].resources[0].quantity,6);
});
test('carry endpoints: no helper destination can leak into other abilities or checks without a carry effect',()=>{
 const s=scene(),a=s.actors[0],before=E.clone(s);assert.throws(()=>E.resolveAction(s,{type:'check',actor:a.id,description:'Look around',stat:'perception',dc:5,carrierDestination:{x:3,y:3}}));assert.deepEqual(s,before);
});
