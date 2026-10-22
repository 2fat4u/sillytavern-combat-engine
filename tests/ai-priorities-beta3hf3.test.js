import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../engine.js';
import { aiMemoryFrom, emptyAIMemory } from '../ai-state.js';
import { planAdvancedTurn } from '../advanced-ai.js';
import { resolveAdvancedTurn } from '../advanced-runner.js';
import { createController } from '../controller.js';
import { skillPreset } from '../skills.js';

function scene(actors,rules={}){
    let s=E.emptyState();s.board={...s.board,width:20,height:15};
    s.rules=E.rulesFrom({...s.rules,visionEnabled:true,visionBase:3,visionPerception:false,stancesEnabled:false,splitMovement:true,multiActionsEnabled:true,rngMode:'seeded',seed:'priority',resourcesEnabled:true,...rules});
    s.actors=actors.map((a,i)=>E.actorFrom({id:'a'+i,name:'Actor '+i,side:'player',control:'advanced',initiative:100-i,maxHp:50,hp:50,position:{x:2+i,y:3},weaponList:[],aiConfig:{idle:'wait',retreat:false},...a},true));
    return E.startCombat(E.validateState(s)).state;
}
const hostile={side:'enemy',control:'manual',position:{x:4,y:3}};
function alarmScene(){return scene([{actionsPerTurn:3,aiConfig:{alarm:true,alarmRadius:10}},{position:{x:8,y:3}},hostile]);}
function advanceRounds(s,n){const round=s.round;while(s.phase==='active'&&s.round<round+n)s=E.endTurn(s).state;return s;}
const melee={id:'blade',name:'Blade',mode:'melee',damage:'1d4',range:1};
const bow={id:'bow',name:'Bow',mode:'ranged',damage:'1d4',range:12};

test('an ally already seeing the reported enemy needs no alarm',()=>{
    const s=scene([{aiConfig:{alarm:true}},{position:{x:3,y:4}},hostile]);assert(!E.canAlarm(s,s.actors[0]));
});
test('an engaged ally is not interrupted with another enemy location',()=>{
    const s=alarmScene();s.actors.push(E.actorFrom({id:'visible',side:'enemy',position:{x:9,y:3}},true));assert(!E.canAlarm(s,s.actors[0]));
});
test('one warning prevents a second contact and second sender from immediately re-alerting the recipient',()=>{
    let s=alarmScene();s.actors.push(E.actorFrom({id:'contact2',side:'enemy',position:{x:3,y:2}},true));
    s=E.resolveAction(s,{type:'alarm',actor:'a0'},{source:'advanced'}).state;const hint=E.clone(s.actors[1].aiMemory.alert);
    assert.equal(s.actors[1].aiMemory.alarmReceivedRound,1);assert(!E.canAlarm(s,s.actors[0]));
    const report={target:'contact2',position:{x:3,y:2},seen:s.turnSerial,sighting:s.turnSerial};assert(!E.needsAlarm(s,s.actors[1],report));
    assert.deepEqual(s.actors[1].aiMemory.alert,hint);assert.equal(s.action.freeSpent,1);
    assert.throws(()=>E.resolveAction(s,{type:'alarm',actor:'a0'},{source:'advanced'}));assert.equal(s.action.freeSpent,1);
});
test('sender limit also applies when a different uninformed ally enters range',()=>{
    let s=alarmScene();s=E.resolveAction(s,{type:'alarm',actor:'a0'},{source:'advanced'}).state;
    s.actors.push(E.actorFrom({id:'newfriend',side:'player',control:'advanced',position:{x:8,y:4}},true));assert(!E.canAlarm(s,s.actors[0]));
});
test('small position updates remain suppressed even after the recipient cooldown',()=>{
    let s=alarmScene();s=E.resolveAction(s,{type:'alarm',actor:'a0'},{source:'advanced'}).state;s=advanceRounds(s,2);
    s=E.moveActor(s,'a2',{x:4,y:4},true).state;assert(!E.canAlarm(s,s.actors[0]));
});
test('a substantially relocated fresh contact can warn an uninformed ally after two rounds',()=>{
    let s=alarmScene();s=E.resolveAction(s,{type:'alarm',actor:'a0'},{source:'advanced'}).state;s=advanceRounds(s,2);
    s=E.moveActor(s,'a2',{x:2,y:7},true).state;s=E.moveActor(s,'a0',{x:2,y:6},true).state;
    assert(E.canAlarm(s,s.actors[0]));s=E.resolveAction(s,{type:'alarm',actor:'a0'},{source:'advanced'}).state;assert.deepEqual(s.actors[1].aiMemory.alert.position,{x:2,y:7});
});
test('alarm cooldown is serializable, undoable, reset on restart and present in debug summaries',async()=>{
    let bundle={state:alarmScene(),history:[],images:{},library:[]};const c=createController({key:()=> 'alarm-priority',read:()=>bundle,write:v=>{bundle=v;},save:async()=>{},preferences:()=>({debugEnabled:true}),connection:()=>({label:'test'})});
    await c.act({type:'alarm',actor:'a0'});assert.deepEqual(E.validateState(c.state()),c.state());
    assert(JSON.parse(c.debugText()).entries.some(e=>e.state?.actors[0].aiSearch.alarmSentRound===1));
    await c.undo();assert.equal(c.state().actors[0].aiMemory.alarmSentRound,-1);
    const restarted=E.startCombat(E.stopCombat(c.state()).state).state;assert.equal(restarted.actors[1].aiMemory.alarmReceivedRound,-1);
    assert.deepEqual(aiMemoryFrom({}),emptyAIMemory());assert.throws(()=>aiMemoryFrom({alarmSentRound:-2}));
});
test('a hidden distant enemy cannot change whether an ally needs a warning',()=>{
    const s=alarmScene(),changed=E.clone(s);changed.actors.push(E.actorFrom({id:'hidden',side:'enemy',position:{x:19,y:14}},true));assert.equal(E.canAlarm(changed,changed.actors[0]),E.canAlarm(s,s.actors[0]));
});

function afterAttack(weapon=melee,extra={},target={position:{x:3,y:3}}){
    let s=scene([{weaponList:[weapon],...extra},{...hostile,...target}],{visionEnabled:false,natural20:false});
    return E.resolveAction(s,{type:'attack',actor:'a0',target:'a1',weapon:weapon.id},{roll:()=>10}).state;
}
test('healthy aggressive melee fighters do not walk away merely to lower a distance heuristic',()=>{
    const s=afterAttack();for(let i=0;i<40;i++){s.rules.seed='hold-'+i;const p=planAdvancedTurn(s);assert.equal(p.move,null);assert.equal(p.intent.type,'endTurn');}
});
test('extra distance alone does not send a distant ranged fighter wandering after its attack',()=>{
    const s=afterAttack(bow,{}, {position:{x:8,y:3}});assert.equal(planAdvancedTurn(s).move,null);
});
test('a ranged fighter can use remaining movement to leave adjacent melee reach',()=>{
    const s=afterAttack(bow),p=planAdvancedTurn(s);assert(p.move);assert(E.distance(p.move,s.actors[1].position)>1);E.validateState(resolveAdvancedTurn(s).state);
});
test('a low-health melee fighter may disengage rather than being forced to stay adjacent',()=>{
    const s=afterAttack(melee,{hp:10}),p=planAdvancedTurn(s);assert(p.move);assert(E.distance(p.move,s.actors[1].position)>1);
});
test('real cover is a valid benefit for remaining movement',()=>{
    const s=afterAttack(bow,{}, {position:{x:8,y:3}});s.board.cover=[{x:4,y:4}];s.rules.coverDistanceEnabled=true;
    const p=planAdvancedTurn(s);assert(p.move);assert(E.coverDamagePercent(s,s.actors[1].position,p.move)<E.coverDamagePercent(s,s.actors[1].position,s.actors[0].position));
});
test('an already available equivalent melee attack does not require a cosmetic move',()=>{
    const s=scene([{weaponList:[melee]},hostile],{visionEnabled:false});s.actors[1].position={x:3,y:3};const p=planAdvancedTurn(s);assert.equal(p.intent.type,'attack');assert.equal(p.move,null);
});
test('movement that first brings an enemy into attack range is retained',()=>{
    const s=scene([{weaponList:[melee]}, {...hostile,position:{x:6,y:3}}],{visionEnabled:false});const p=planAdvancedTurn(s);assert.equal(p.intent.type,'attack');assert(p.move);assert(E.distance(p.move,s.actors[1].position)<=1);
});
test('breaking sight behind a wall remains a useful defensive reposition',()=>{
    const s=afterAttack(bow,{}, {position:{x:8,y:3}});s.board.blocked=[{x:4,y:4}];const p=planAdvancedTurn(s);assert(p.move);assert(!E.clearSight(s,s.actors[1].position,p.move));
});

function rescueScene(side='enemy',extra={},healer){
    const opposite=side==='enemy'?'player':'enemy';return scene([
        {side,weaponList:[melee],...extra},
        {side,hp:0,condition:'unconscious',roundsLeft:1,position:{x:2,y:4},control:'manual'},
        {side:opposite,position:{x:3,y:3},control:'manual'},
        ...(healer?[{side,position:{x:3,y:4},...healer}]:[])
    ],{visionEnabled:false});
}
test('ordinary enemies prefer a viable attack over stabilization without a healer',()=>{
    const s=rescueScene();for(let i=0;i<40;i++){s.rules.seed='fight-'+i;assert.equal(planAdvancedTurn(s).intent.type,'attack');}
});
test('player-side allies retain the urgent stabilization priority',()=>{
    const s=rescueScene('ally');assert.equal(planAdvancedTurn(s).intent.type,'stabilize');
});
test('the existing Support style allows an enemy to prioritize rescuing a companion',()=>{
    const s=rescueScene('enemy',{aiBehavior:'support'});assert.equal(planAdvancedTurn(s).intent.type,'stabilize');
});
const potion={id:'heal',name:'Heal',kind:'supply',heal:'1d4',quantity:2,range:2,recipient:'selected'};
test('a nearby stocked healer gives enemy stabilization a meaningful recovery prospect',()=>{
    const s=rescueScene('enemy',{}, {resources:[potion]});assert.equal(planAdvancedTurn(s).intent.type,'stabilize');
});
for(const [label,resource] of [['empty',{...potion,quantity:0}],['self only',{...potion,range:0,recipient:'self'}]])test(label+' healing does not justify sacrificing the enemy attack',()=>{
    const s=rescueScene('enemy',{}, {resources:[resource]});assert.equal(planAdvancedTurn(s).intent.type,'attack');
});
test('a nearby AI-enabled mechanical healing ability also counts as a recovery prospect',()=>{
    const skill={...skillPreset('narrative'),id:'healing',name:'Healing',ai:true,check:false,range:3,mechanics:{target:'selected',healing:{dice:'1d4',bonus:0}}};
    const s=rescueScene('enemy',{}, {skills:[skill]});assert.equal(planAdvancedTurn(s).intent.type,'stabilize');
});
test('a fallen healer cannot justify abandoning an available attack',()=>{
    const s=rescueScene('enemy',{}, {hp:0,condition:'stabilized',resources:[potion]});assert.equal(planAdvancedTurn(s).intent.type,'attack');
});
test('stabilization remains available to enemies when there is no viable combat action',()=>{
    const s=rescueScene('enemy',{weaponList:[]});assert.equal(planAdvancedTurn(s).intent.type,'stabilize');
});


