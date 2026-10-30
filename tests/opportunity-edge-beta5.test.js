import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../engine.js';
import { skillPreset } from '../skills.js';
import { createController } from '../controller.js';
import { resolveBasicTurn,resolveBasicTurnAsync } from '../ai.js';
import { resolveAdvancedTurn,resolveAdvancedTurnAsync } from '../advanced-runner.js';

const ability=(kind,extra={})=>({...skillPreset(kind,'en'),id:kind,ai:true,check:false,...extra});
const roll=n=>n===20?15:2;
function scene({actor={},foe={},others=[],rules={},board={}}={}){
 let s=E.emptyState();s.rules=E.rulesFrom({...s.rules,opportunityEnabled:true,reactionsEnabled:true,splitMovement:true,multiActionsEnabled:true,movementBase:5,movementStat:'none',stancesEnabled:false,hideNeedsTerrain:false,rngMode:'seeded',seed:'beta5-edge',...rules});s.board={...s.board,width:9,height:7,...board};
 s.actors=[{id:'mover',name:'Mover',side:'player',initiative:100,position:{x:2,y:2},skills:[ability('disengage')],...actor},{id:'reactor',name:'Reactor',side:'enemy',initiative:50,position:{x:3,y:2},reactionControl:'auto',weaponList:[{id:'sword',name:'Sword',mode:'melee',damage:'1d4'}],...foe},...others].map(v=>E.actorFrom({maxHp:20,hp:20,dc:10,...v},true));return E.startCombat(E.validateState(s)).state;
}
const intent=(s,kind,extra={})=>({type:'skill',actor:'mover',target:'mover',skill:kind,turn:E.turnToken(s),...extra});
function controller(s){let bundle={state:s,history:[]};return createController({key:()=> 'test',read:()=>bundle,write:v=>{bundle=v;},save:async()=>{}});}

test('height and diagonal-blocked melee access cannot provoke',()=>{
 const height=scene({board:{heights:[{x:3,y:2,height:1}]}});assert.equal(E.opportunityChoices(height,height.actors[0],{x:1,y:2}).length,0);
 const blocked=scene({foe:{position:{x:3,y:3}},board:{blocked:[{x:3,y:2},{x:2,y:3}]}});assert.equal(E.opportunityChoices(blocked,blocked.actors[0],{x:1,y:2}).length,0);
});
test('moving while feared cannot bypass the existing fear restriction',()=>{
 const s=scene({foe:{tactics:[{type:'frightened',turns:2,appliedTurn:0,source:'mover',policy:'cover'}]}});assert.equal(E.opportunityChoices(s,s.actors[0],{x:1,y:2}).length,0);
});
test('one request may spend at most one reaction per opponent even with a larger reaction budget',()=>{
 const s=scene({foe:{reactionsPerTurn:3}}),r=E.moveActor(s,'mover',{x:0,y:2},false,{roll});assert.equal(r.result.opportunities.length,1);assert.equal(r.state.actors[1].reactionSpent,1);assert.equal(E.reactionBudget(r.state,r.state.actors[1]).remaining,2);
});
test('arrival and placement do not trigger an opportunity attack',()=>{
 let s=scene({actor:{position:null,reserve:true}});s=E.moveActor(s,'mover',{x:2,y:2},true).state;assert.equal(s.actors[0].hp,20);assert.equal(s.actors[1].reactionSpent,0);
});
test('cover transit interrupted by a stun returns only to the last legal stop',()=>{
 const walls=[];for(let x=0;x<6;x++){walls.push({x,y:1},{x,y:3});}
 const s=scene({actor:{position:{x:0,y:2}},foe:{position:{x:2,y:0},weaponList:[{id:'sword',mode:'melee',damage:'1d4',effects:[{type:'stunned',turns:2}]}]},board:{cover:[{x:1,y:2}],blocked:walls.filter(p=>!(p.x===1&&p.y===1))}});
 // The guard can reach the transit cover diagonally, but not the origin.
 s.actors[1].position={x:1,y:1};const r=E.moveActor(s,'mover',{x:3,y:2},false,{roll});assert.equal(r.result.interrupted,true);assert.deepEqual(r.state.actors[0].position,{x:0,y:2});assert.equal(r.result.movement.spent,2);E.validateState(r.state);
});
test('slowed acquired en route uses the reduced budget and stops at the reached prefix',()=>{
 const s=scene({foe:{weaponList:[{id:'sword',mode:'melee',damage:'1d4',effects:[{type:'slowed',turns:2}]}]}}),r=E.moveActor(s,'mover',{x:0,y:6},false,{roll});assert.equal(r.result.interrupted,true);assert(E.distance({x:2,y:2},r.state.actors[0].position)<4);assert.equal(r.result.movement.spent,2);E.validateState(r.state);
});
test('cancelling a later manual reactor rolls back the whole movement and earlier automatic attack',async()=>{
 const s=scene({others:[{id:'manual',name:'Manual',side:'enemy',position:{x:2,y:3},initiative:40,reactionControl:'manual'}]}),c=controller(s);c.subscribeReactions(r=>c.respondReaction(r.stage==='movement'?{kind:'continue'}:'cancel'));const result=await c.move('mover',{x:0,y:0},false,{roll});assert(result.cancelled);assert.deepEqual(c.state(),s);
});
test('jump/carry preview offers Disengage only with budget for both actions and shared costs',()=>{
 const down={id:'down',name:'Down',side:'ally',position:{x:1,y:2},hp:0,condition:'stabilized'},s=scene({actor:{actionsPerTurn:2,resources:[{id:'ki',name:'Ki',kind:'ammo',quantity:1}],skills:[ability('jump',{range:3,resource:'ki'}),ability('disengage',{resource:'ki'})]},others:[down]}),preview=E.skillOpportunityPreview(s,intent(s,'jump',{destination:{x:0,y:2}}));assert.equal(preview[0].stage,'movement');assert.equal(preview[0].skills.length,0);
 s.actors[0].resources[0].quantity=2;assert.equal(E.skillOpportunityPreview(s,intent(s,'jump',{destination:{x:0,y:2}}))[0].skills.length,1);
 s.actors[0].actionsPerTurn=1;assert.equal(E.skillOpportunityPreview(s,intent(s,'jump',{destination:{x:0,y:2}}))[0].skills.length,0);
});
test('manual Disengage before a jump costs two actions and two shared charges exactly once',async()=>{
 const s=scene({actor:{actionsPerTurn:2,resources:[{id:'ki',name:'Ki',kind:'ammo',quantity:2}],skills:[ability('jump',{range:3,resource:'ki'}),ability('disengage',{resource:'ki'})]},others:[{id:'down',name:'Down',side:'ally',position:{x:1,y:2},hp:0,condition:'stabilized'}]}),c=controller(s);c.subscribeReactions(r=>c.respondReaction({kind:'disengage',skill:r.skills[0].id}));await c.act(intent(s,'jump',{destination:{x:0,y:2}}),{roll});assert.equal(c.state().actors[0].resources[0].quantity,0);assert.equal(c.state().action.freeSpent,2);assert.equal(c.state().actors[1].reactionSpent,0);assert.deepEqual(c.state().actors[0].position,{x:0,y:2});
});
test('manual carry cancellation preserves both positions and stock before the skill check',async()=>{
 const s=scene({actor:{skills:[ability('carry',{check:true})]},others:[{id:'down',name:'Down',side:'ally',position:{x:2,y:3},hp:0,condition:'stabilized'}]}),c=controller(s);let draws=0;c.subscribeReactions(()=>c.respondReaction('cancel'));const result=await c.act(intent(s,'carry',{target:'down',destination:{x:0,y:3}}),{roll:()=>{draws++;return 15;}});assert(result.cancelled);assert.equal(draws,0);assert.deepEqual(c.state(),s);
});
test('a carried target does not trigger another reaction of its own',()=>{
 const s=scene({actor:{skills:[ability('carry')]},foe:{reactionsPerTurn:3},others:[{id:'down',name:'Down',side:'ally',position:{x:2,y:3},hp:0,condition:'stabilized'}]}),r=E.resolveAction(s,intent(s,'carry',{target:'down',destination:{x:0,y:3}}),{roll});assert.equal(r.result.forcedMovement.opportunities.length,1);assert.equal(r.state.actors[1].reactionSpent,1);assert.equal(r.state.actors[2].hp,0);
});
test('AI cancellation during an injected movement keeps the before-plan state',async()=>{
 for(const control of ['basic','advanced']){const s=scene({actor:{control,skills:[],position:{x:0,y:2},weaponList:[{id:'blade',mode:'melee',damage:'1d4'}]},foe:{position:{x:5,y:2}}}),r=await(control==='basic'?resolveBasicTurnAsync:resolveAdvancedTurnAsync)(s,{move:async state=>({state,result:{cancelled:true}}),yield:()=>Promise.resolve()});assert.deepEqual(r.state,s);assert(r.result.paused);}
});
for(const control of ['basic','advanced'])test(control+' AI movement interrupted by a reactor preserves a legal state',async()=>{
 const s=scene({actor:{control,skills:[],hp:1,position:{x:0,y:2},weaponList:[{id:'blade',mode:'melee',damage:'1d4'}]},foe:{position:{x:5,y:2}}});let calls=0;
 const r=await(control==='basic'?resolveBasicTurnAsync:resolveAdvancedTurnAsync)(s,{roll,move:async(state,id)=>{calls++;const next=E.clone(state),a=E.findActor(next,id);a.effects=[{type:'stunned',turns:2,appliedTurn:next.turnSerial}];return {state:next,result:{type:'move',actor:id,from:E.coordinate(a.position),to:E.coordinate(a.position),interrupted:true}};},yield:()=>Promise.resolve()});assert.equal(calls,1);assert(!r.state.log.some(e=>['hit','miss'].includes(e.type)&&e.details.actor==='mover'));E.validateState(r.state);
});
for(const control of ['basic','advanced'])for(const seed of ['small-a','small-b','small-c'])test(control+' seeded small battle keeps movement/reactions valid: '+seed,async()=>{
 const s=scene({rules:{seed,movementBase:3,natural20:true},actor:{control,actionsPerTurn:2},foe:{control,skills:[ability('disengage')],actionsPerTurn:2},others:[{id:'archer',name:'Archer',side:'ally',control,initiative:60,position:{x:1,y:4},attackMode:'ranged',skills:[ability('disengage')],weaponList:[{id:'bow',mode:'ranged',damage:'1d4',range:4}]}]});let state=s;
 for(let i=0;i<40&&state.phase==='active';i++){const a=E.currentActor(state),resolver=a.control==='advanced'?resolveAdvancedTurn:resolveBasicTurn,r=resolver(state);assert(r.state.revision>state.revision);state=E.validateState(r.state);const placed=state.actors.filter(a=>a.position).map(a=>E.coordinate(a.position));assert.equal(new Set(placed).size,placed.length);assert(state.actors.every(a=>a.hp>=0&&a.reactionSpent>=0));}
 assert.equal(state.phase,'ended');
});
