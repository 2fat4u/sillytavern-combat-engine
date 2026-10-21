import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../engine.js';
import { skillPreset } from '../skills.js';
import { resolveBasicTurn,planBasicTurn } from '../ai.js';
import { createController } from '../controller.js';
import { exportProfiles,profileFrom,weaponProfilePatch } from '../profiles.js';
import { latestResult } from '../results.js';
function fixture({actor={},enemies=[{}],rules={},board={}}={}) {
    let s=E.setRules(E.emptyState(),{multiActionsEnabled:true,splitMovement:true,movementStat:'none',movementBase:4,...rules}).state;
    s=E.setBoard(s,{width:8,height:8,...board}).state;
    s=E.addActor(s,{name:'Hero',side:'player',maxHp:100,initiative:20,position:{x:2,y:2},skills:Object.keys((awaitlessSkills())).map(kind=>({...skillPreset(kind),id:kind})),...actor}).state;
    for(const [i,e] of enemies.entries())s=E.addActor(s,{name:'Enemy '+i,side:'enemy',maxHp:100,initiative:10-i,position:{x:3+i,y:2},...e}).state;
    return E.startCombat(s).state;
}
function awaitlessSkills(){return {intimidate:1,provoke:1,distract:1,aim:1,support:1,sprint:1,acrobatics:1,shove:1,hold:1,stun:1,disarm:1,carry:1,status:1};}
const ability=(s,id,target=s.actors[0].id,extra={})=>({type:'skill',skill:id,actor:s.actors[0].id,target,turn:E.turnToken(s),...extra});
const attack=(s,target=s.actors[1].id,extra={})=>({type:'attack',actor:s.actors[0].id,target,mode:'melee',turn:E.turnToken(s),...extra});
const dice=(...values)=>()=>values.shift();
function harness(s){let b={state:s,history:[]};const c=createController({key:()=> 'fixture',read:()=>b,write:v=>{b=v;},save:async()=>{}});return c;}
test('Decimal direct attributes, bonuses, DC, initiative and height bonuses survive validation and comma entry',()=>{
    const s=fixture({rules:{statMode:'bonuses',highAttackBonus:'1,5',highDefenseBonus:1.25},actor:{stats:{strength:1.5,constitution:1.25},attackBonus:'0,25',damageBonus:0.75,dc:'12,5',initiative:20.5}});
    assert.equal(s.actors[0].stats.strength,1.5);assert.equal(s.actors[0].dc,12.5);assert.equal(s.rules.highAttackBonus,1.5);assert.deepEqual(E.validateState(JSON.parse(JSON.stringify(s))),E.validateState(s));
    assert.throws(()=>E.editActor(s,s.actors[0].id,{attackBonus:1.234}),/Nachkommastellen/);assert.throws(()=>E.editActor(s,s.actors[0].id,{maxHp:10.5}),/ganze Zahl/);assert.throws(()=>E.setRules(s,{movementBase:3.5}),/ganze Zahl/);
});
test('D&D scores, dice counts, timing and action counts remain integers; decimal formula bonuses normalize',()=>{
    const s=fixture();assert.throws(()=>E.editActor(s,s.actors[0].id,{stats:{strength:12.5}}),/ganze Zahl/);assert.throws(()=>E.editActor(s,s.actors[0].id,{actionsPerTurn:1.5}));assert.throws(()=>E.parseDice('1.5d6'));assert.equal(E.parseDice('1d6+1,5').formula,'1d6+1.5');assert.throws(()=>E.parseDice('1d6+1.555'));
});
test('Fractional hit values compare exactly and damage rounds down to whole HP',()=>{
    const s=fixture({actor:{attackBonus:0.5,damageBonus:0.75},enemies:[{dc:12.5}]});const r=E.resolveAction(s,attack(s),{roll:dice(12,3)});assert(r.result.hit);assert.equal(r.result.total,12.5);assert.equal(r.result.damage,3);assert.equal(r.state.actors[1].hp,97);
});
test('Derived Constitution HP and direct-DEX movement use explicit floor; fractional score conversion is rejected',()=>{
    let s=fixture({rules:{statMode:'bonuses',movementStat:'dexterity'},actor:{stats:{constitution:1.25,dexterity:1.5}}});s=E.setRules(s,{constitutionHp:true},true).state;assert.equal(s.actors[0].maxHp,102);assert.equal(E.movementBudget(s,s.actors[0]).total,5);assert.throws(()=>E.setRules(s,{statMode:'scores'}),/verlustfrei/);
});
test('Weapon attribute overrides participant default, can be overridden per attack, and Perception range is optional',()=>{
    const s=fixture({actor:{stats:{strength:10,intelligence:18,perception:15},attackStat:'strength',weaponList:[{id:'spell',name:'Spell',mode:'ranged',damage:'1d4',range:2,stat:'intelligence'}]},enemies:[{position:{x:6,y:2},dc:14}],rules:{perceptionRange:true}});
    assert.equal(E.effectiveRange(s,s.actors[0],s.actors[0].weaponList[0]),4);const r=E.resolveAction(s,attack(s,s.actors[1].id,{weapon:'spell',mode:'ranged'}),{roll:dice(10,2)}).result;assert.equal(r.stat,'intelligence');assert.equal(r.total,14);
    const off=E.setRules(s,{perceptionRange:false}).state;assert.throws(()=>E.resolveAction(off,attack(off,off.actors[1].id,{weapon:'spell',mode:'ranged'})),/reichweite/);
});
for(const [mode,expected,rolls]of[['doubleDice',9,[20,3,4]],['max',8,[20]],['doubleMax',16,[20]]])test('Critical damage '+mode+' preserves miss rules and configured bonus',()=>{
    const s=fixture({rules:{natural20:true,criticalDamage:mode},actor:{weapons:{melee:{damage:'1d6',damageBonus:2},ranged:null}}});const r=E.resolveAction(s,attack(s),{roll:dice(...rolls)}).result;assert.equal(r.damage,expected);assert.equal(E.resolveAction(s,attack(s),{roll:dice(1)}).result.damage,0);
});
test('Defensive/offensive stances trade hit and defense, lock after any action and persist next own turn',()=>{
    let s=fixture({actor:{actionsPerTurn:2}});s=E.setStance(s,s.actors[0].id,'offensive').state;assert.deepEqual(E.stanceBonus(s,s.actors[0]),{attack:2,defense:-2});const r=E.resolveAction(s,attack(s),{roll:dice(10,1)});assert.equal(r.result.total,12);s=r.state;assert.throws(()=>E.setStance(s,s.actors[0].id,'defensive'),/ersten Aktion/);
    s=E.endTurn(s).state;s=E.endTurn(s).state;assert.equal(s.actors[0].stance,'offensive');assert.throws(()=>E.setStance(s,s.actors[0].id,'defensive','old'),/Veralteter/);
});
test('A defensive target DC includes +2 while a spell still uses its own mental attribute',()=>{
    const s=fixture({enemies:[{stance:'defensive',stanceTurn:0}]});const r=E.resolveAction(s,attack(s),{roll:dice(12)}).result;assert.equal(r.dc,14);assert(!r.hit);
});
test('Skill can apply a status without direct damage, spends a charge, and invalid target spends nothing',()=>{
    let s=fixture({actor:{resources:[{id:'charge',name:'Charge',quantity:2,kind:'ammo'}],skills:[{...skillPreset('status'),id:'status',resource:'charge',status:'burning',statusDamage:3}]}});const before=E.clone(s);assert.throws(()=>E.resolveAction(s,ability(s,'status')),/nicht nutzbar/);assert.deepEqual(s,before);
    s=E.resolveAction(s,ability(s,'status',s.actors[1].id),{roll:dice(20)}).state;assert.equal(s.actors[1].hp,100);assert.equal(s.actors[1].effects[0].type,'burning');assert.equal(s.actors[0].resources[0].quantity,1);
});
test('Failed skill consumes an action and charge without applying effects; disabled modules do not spend',()=>{
    const s=fixture({actor:{resources:[{id:'charge',name:'Charge',kind:'ammo',quantity:2}],skills:[{...skillPreset('status'),id:'status',resource:'charge'}]}});const r=E.resolveAction(s,ability(s,'status',s.actors[1].id),{roll:dice(1)});assert(!r.result.success);assert.equal(r.state.actors[0].resources[0].quantity,1);assert.equal(r.state.actors[1].effects.length,0);assert.throws(()=>E.resolveAction(E.setRules(s,{skillsEnabled:false}).state,ability(s,'status',s.actors[1].id)));
});
test('Skill-only extra is consumed before a normal action and healing-only extras cannot be skills',()=>{
    let s=fixture({actor:{bonusActions:[{id:'skill',name:'Skill',count:1,allowed:['skill']}]}});const r=E.resolveAction(s,ability(s,'aim'));assert.equal(r.result.actionPool.id,'skill');assert.equal(E.actionBudget(r.state).free.remaining,1);
    s=fixture({actor:{bonusActions:[{id:'heal',count:1,allowed:['use']}]}});s=E.resolveAction(s,attack(s),{roll:dice(1)}).state;assert.throws(()=>E.resolveAction(s,ability(s,'aim')),/erlauben/);
});
test('Aim and distract grant one nonstacking attack bonus, consumed even on a miss',()=>{
    let s=fixture({actor:{actionsPerTurn:4}});s=E.resolveAction(s,ability(s,'aim')).state;s=E.resolveAction(s,ability(s,'aim')).state;assert.equal(s.actors[0].tactics.length,1);
    s=E.resolveAction(s,ability(s,'distract',s.actors[1].id),{roll:dice(20)}).state;const r=E.resolveAction(s,attack(s,s.actors[1].id,{mode:'ranged'}),{roll:dice(1)});assert.equal(r.result.tacticalBonus,4);assert(!r.result.hit);assert.equal(r.state.actors[0].tactics.length,0);assert.equal(r.state.actors[1].tactics.length,0);
});
test('Support helps an ally next check, including a failed check, but not a routine action',()=>{
    let s=fixture({actor:{actionsPerTurn:3}});s=E.addActor(s,{name:'Ally',side:'ally',position:{x:2,y:3},skills:[{...skillPreset('hold'),id:'hold'}]}).state;const ally=s.actors[2];s=E.resolveAction(s,ability(s,'support',ally.id)).state;assert.equal(ally.hp,20);s=E.endTurn(s).state;s=E.endTurn(s).state;const r=E.resolveAction(s,{type:'skill',actor:ally.id,target:s.actors[1].id,skill:'hold'},{roll:dice(1)});assert.equal(r.result.bonus,2);assert.equal(r.state.actors[2].tactics.length,0);
});
test('Sprint keeps the turn open for movement with split movement off, once per turn',()=>{
    let s=fixture({rules:{splitMovement:false,multiActionsEnabled:false}});s=E.resolveAction(s,ability(s,'sprint')).state;assert.equal(E.currentActor(s).name,'Hero');assert.equal(E.movementBudget(s,s.actors[0]).total,8);assert(E.actionBudget(s).used);s=E.moveActor(s,s.actors[0].id,{x:0,y:0}).state;assert.equal(E.currentActor(s).name,'Hero');s=E.endTurn(s).state;assert.equal(E.currentActor(s).name,'Enemy 0');
});
test('Acrobatics reduces cover transit cost on success and failure costs one point without retry',()=>{
    const original=fixture({actor:{actionsPerTurn:3},board:{cover:[{x:2,y:3}]}});let s=E.resolveAction(original,ability(original,'acrobatics'),{roll:dice(20)}).state;assert.equal(E.stepCost(s,{x:2,y:2},{x:2,y:3}),1);assert.throws(()=>E.moveActor(s,s.actors[0].id,{x:2,y:3}),/nicht betretbar/);
    s=E.resolveAction(original,ability(original,'acrobatics'),{roll:dice(1)}).state;assert.equal(E.movementBudget(s,s.actors[0]).spent,1);assert.equal(E.stepCost(s,{x:2,y:2},{x:2,y:3}),2);assert.throws(()=>E.resolveAction(s,ability(s,'acrobatics')),/nicht nutzbar/);
});
test('Shove moves one cell away without HP damage, refuses blocked/occupied/height destinations atomically',()=>{
    const s=fixture({board:{blocked:[{x:4,y:1}],heights:[{x:4,y:3}]}});const r=E.resolveAction(s,ability(s,'shove',s.actors[1].id,{destination:{x:4,y:2}}),{roll:dice(20)});assert.deepEqual(r.state.actors[1].position,{x:4,y:2});assert.equal(r.state.actors[1].hp,100);
    for(const p of [{x:4,y:1},{x:4,y:3},{x:2,y:2},{x:6,y:2}])assert.throws(()=>E.resolveAction(s,ability(s,'shove',s.actors[1].id,{destination:p}),{roll:dice(20)}));
});
test('Hold prevents voluntary movement but not attacks and expires at target turn end',()=>{
    let s=fixture();s=E.resolveAction(s,ability(s,'hold',s.actors[1].id),{roll:dice(20)}).state;s=E.endTurn(s).state;assert.equal(E.movementBudget(s,s.actors[1]).remaining,0);assert.throws(()=>E.moveActor(s,s.actors[1].id,{x:4,y:2}),/Bewegung zu weit/);assert(E.canAttack(s,s.actors[1],s.actors[0],'melee'));s=E.endTurn(s).state;assert.equal(s.actors[1].tactics.length,0);
});
test('Disarm blocks the selected weapon and its standard variant only',()=>{
    let s=fixture({enemies:[{weaponList:[{id:'sword',name:'Sword',mode:'melee',damage:'1d6',standard:{damage:'1d4'}},{id:'dagger',name:'Dagger',mode:'melee',damage:'1d4'}]}]});s=E.resolveAction(s,ability(s,'disarm',s.actors[1].id,{weapon:'sword'}),{roll:dice(20)}).state;s=E.endTurn(s).state;const a=s.actors[1],b=s.actors[0];assert(!E.canAttack(s,a,b,'melee',a.position,'standard','sword'));assert(E.canAttack(s,a,b,'melee',a.position,'profile','dagger'));assert.throws(()=>E.resolveAction(s,{type:'attack',actor:a.id,target:b.id,weapon:'sword'}),/entwaffnet/);
});
test('Stun skips target own turn without HP damage and no additional turns are lost',()=>{
    let s=fixture();s=E.resolveAction(s,ability(s,'stun',s.actors[1].id),{roll:dice(20)}).state;assert.equal(s.actors[1].hp,100);s=E.endTurn(s).state;assert.equal(E.currentActor(s).id,s.actors[0].id);assert.equal(s.actors[1].effects.length,0);
});
test('Intimidation forces a reachable cover/retreat reaction; panic leaves only at a real exit',()=>{
    let s=fixture({rules:{natural20:true},actor:{actionsPerTurn:3}});s=E.resolveAction(s,ability(s,'intimidate',s.actors[1].id),{roll:dice(20)}).state;assert.equal(s.actors[1].tactics[0].policy,'flee');assert(!s.actors[1].escaped);s=E.endTurn(s).state;assert(E.reactionPending(s,s.actors[1]));assert.throws(()=>E.resolveAction(s,{type:'attack',actor:s.actors[1].id,target:s.actors[0].id}),/Fluchtabsicht/);const dest=E.reactionDestination(s,s.actors[1]);s=E.moveActor(s,s.actors[1].id,dest.position).state;assert(E.canFlee(s,s.actors[1]));s=E.resolveAction(s,{type:'flee',actor:s.actors[1].id}).state;assert(s.actors[1].escaped);assert.equal(s.actors[1].hp,100);
});
test('Provoke requires the source when legally in reach and permits fallback when out of range',()=>{
    let s=fixture({actor:{actionsPerTurn:2},enemies:[{}]});s=E.addActor(s,{name:'Weak ally',side:'ally',position:{x:3,y:3},maxHp:5}).state;s=E.resolveAction(s,ability(s,'provoke',s.actors[1].id),{roll:dice(20)}).state;s=E.endTurn(s).state;const a=s.actors[1];assert.throws(()=>E.resolveAction(s,{type:'attack',actor:a.id,target:s.actors[2].id,mode:'melee'}),/Provokateur/);
    s=E.moveActor(s,s.actors[0].id,{x:0,y:0},true).state;assert.doesNotThrow(()=>E.resolveAction(s,{type:'attack',actor:a.id,target:s.actors[2].id,mode:'melee'},{roll:dice(1)}));
});
test('Carry moves a downed ally to a nearby legal cell, costs two movement, and does not heal',()=>{
    let s=fixture();s=E.addActor(s,{name:'Down',side:'ally',position:{x:2,y:3},hp:0,maxHp:20,condition:'stabilized'}).state;const r=E.resolveAction(s,ability(s,'carry',s.actors[2].id,{destination:{x:1,y:2}}));assert.deepEqual(r.state.actors[2].position,{x:1,y:2});assert.equal(r.state.actors[2].hp,0);assert.equal(E.movementBudget(r.state,r.state.actors[0]).spent,2);
});
test('Free remark changes only narration and remains possible after the action is spent',()=>{
    let s=fixture({rules:{multiActionsEnabled:false}});s=E.resolveAction(s,attack(s),{roll:dice(1)}).state;const before=E.clone(s);s=E.remark(s,s.actors[0].id,'Hold the line!').state;assert.deepEqual(s.actors,before.actors);assert.deepEqual(s.action,before.action);assert.deepEqual(s.rng,before.rng);assert.equal(s.turnSerial,before.turnSerial);
});
test('Basic AI honors enabled skill profiles and completes a skill-plus-attack budget',()=>{
    const s=fixture({actor:{control:'basic',actionsPerTurn:2,skills:[{...skillPreset('aim'),id:'aim',ai:true}],attackMode:'ranged'}});const r=resolveBasicTurn(s,{roll:dice(20,4)});assert.equal(r.result.actions[0].type,'skill');assert.equal(r.result.actions[1].type,'attack');assert.equal(r.result.actions[1].tacticalBonus,2);assert.equal(E.currentActor(r.state).name,'Enemy 0');
});
test('Basic AI responds to panic and never attacks through its forced retreat',()=>{
    let s=fixture({rules:{natural20:true},enemies:[{control:'basic'}]});s=E.resolveAction(s,ability(s,'intimidate',s.actors[1].id),{roll:dice(20)}).state;s=E.endTurn(s).state;const plan=planBasicTurn(s);assert.equal(plan.intent.type,'flee');const r=resolveBasicTurn(s);assert(r.state.actors[1].escaped);
});
test('Group budgets update selected participants and new members, without overwriting other factions',()=>{
    let s=fixture();s=E.setGroupBudgets(s,['enemy'],{actionsPerTurn:2,bonusActions:[{id:'rescue',count:1,allowed:['stabilize']}]}).state;assert.equal(s.actors[0].actionsPerTurn,1);assert.equal(s.actors[1].actionsPerTurn,2);s=E.addActor(s,{name:'New enemy',side:'enemy'}).state;assert.equal(s.actors[2].bonusActions[0].allowed[0],'stabilize');assert.equal(E.currentActor(s).id,s.actors[0].id);
});
test('Profile transfers remap weapon and stock IDs together, preserve old resources, and import actors unplaced/full',async()=>{
    const s=fixture({actor:{weaponList:[{id:'fire',name:'Fire',mode:'ranged',damage:'1d6',range:6,stat:'intelligence',resource:'ammo'}],resources:[{id:'ammo',name:'Ammo',kind:'ammo',quantity:3}]}}),source=s.actors[0],c=harness(s);
    const profile=exportProfiles(s,'weapons',source.id);await c.importProfiles(profile,s.actors[1].id);const target=c.state().actors[1];assert.notEqual(target.weaponList[0].id,'fire');assert.equal(target.weaponList[0].resource,target.resources[0].id);assert.notEqual(target.resources[0].id,'ammo');assert.equal(target.weaponList[0].stat,'intelligence');
    const actors=exportProfiles(s,'actors');await c.importProfiles(actors);assert.equal(c.state().actors.length,4);assert(c.state().actors.slice(2).every(a=>a.position===null&&a.hp===a.maxHp));
});
test('Invalid profile batches and reset operations are atomic; reset undo restores encounter and terrain',async()=>{
    const c=harness(fixture({board:{heights:[{x:6,y:6}]}})),before=E.clone(c.state());await assert.rejects(c.importProfiles({kind:'combat-actors',version:1,statMode:'scores',actors:[{}, {maxHp:-1}]}));assert.deepEqual(c.state(),before);
    await c.reset('map');assert.equal(c.state().actors.length,2);assert(c.state().actors.every(a=>!a.position));assert.equal(c.state().board.heights.length,0);assert.equal(c.state().phase,'setup');await c.undo();assert.deepEqual(c.state().actors,before.actors);assert.deepEqual(c.state().board,before.board);
    await c.reset('actors');assert.equal(c.state().actors.length,0);assert.equal(c.state().board.heights.length,1);await c.undo();await c.reset('all');assert.equal(c.state().actors.length,0);assert.equal(c.state().log.length,1);assert.deepEqual(c.state().rules,before.rules);
});
test('Undo and combat import preserve sprint and tactic turn grace as well as spent budgets',async()=>{
    const c=harness(fixture({actor:{actionsPerTurn:3}}));await c.act(ability(c.state(),'sprint'));await c.act(ability(c.state(),'aim'));const before=E.clone(c.state());await c.move(before.actors[0].id,{x:1,y:2});await c.undo();assert.equal(E.movementBudget(c.state(),c.state().actors[0]).total,8);assert.equal(E.actionBudget(c.state()).free.spent,2);assert.equal(c.state().actors[0].tactics[0].appliedTurn,c.state().turnSerial);await c.import(c.export());assert.equal(c.state().actors[0].sprintTurn,c.state().turnSerial);
});
test('City rooftops and castle battlements have legal ladders; walls dominate old overlapping height data',()=>{
    const s=E.setBoard(E.emptyState(),{width:20,height:20}).state;for(const preset of ['city','castle']){const a=E.randomBoard(s,{preset,seed:'architecture'}).state,b=E.randomBoard(s,{preset,seed:'architecture'}).state;assert.deepEqual(a.board,b.board);assert(a.board.heights.length>0);assert(a.board.ladders.length>0);assert(!a.board.heights.some(p=>E.isBlocked(a,p)));assert.doesNotThrow(()=>E.validateState(a));const l=a.board.ladders[0];assert(E.canStep(a,l.from,l.to));}
    const old=E.validateState({...s,board:{...s.board,blocked:[{x:4,y:4}],heights:[{x:4,y:4}]}});assert(E.isBlocked(old,{x:4,y:4}));assert.equal(E.heightAt(old,{x:4,y:4}),0);
});
test('Latest result preserves an attack through end-turn and status ticks but respects undo/end/reset',()=>{
    const log=[{type:'hit',id:'attack'},{type:'turn',id:'turn'},{type:'effect',id:'tick'}];assert.equal(latestResult(log).event.id,'attack');assert.equal(latestResult(log).following.length,1);for(const type of ['undo','end','reset'])assert.equal(latestResult([...log,{type,id:type}]).event.id,type);
});

test('Appending a common rescue action preserves boss attack extras and normal count, without duplicate reapplication',()=>{
    let s=fixture({enemies:[{actionsPerTurn:3,bonusActions:[{id:'boss',name:'Boss',count:2,allowed:['attack']}]}]});const common={actionsPerTurn:1,bonusActions:[{id:'rescue',name:'Rescue',count:1,allowed:['stabilize']}]};s=E.setGroupBudgets(s,['enemy'],common,'append').state;assert.equal(s.actors[1].actionsPerTurn,3);assert.equal(s.actors[1].bonusActions.length,2);s=E.setGroupBudgets(s,['enemy'],{...common,bonusActions:[{...common.bonusActions[0],id:'new'}]},'append').state;assert.equal(s.actors[1].bonusActions.length,2);
});
test('Basic sprint uses the extra movement then closes its single-action turn',()=>{
    const s=fixture({rules:{multiActionsEnabled:false,splitMovement:false,movementBase:2},actor:{control:'basic',weapons:{melee:{damage:'1d6'},ranged:null},skills:[{...skillPreset('sprint'),id:'sprint',ai:true}]},enemies:[{position:{x:7,y:2}}]});const r=resolveBasicTurn(s);assert.equal(r.result.actions[0].skillKind,'sprint');assert.equal(E.currentActor(r.state).name,'Enemy 0');assert(E.distance(r.state.actors[0].position,r.state.actors[1].position)<5);
});
test('Ranged auto follows the configured weapon attribute, and explicit Strength remains an override',()=>{
    const s=fixture({actor:{stats:{intelligence:18,strength:10},weaponList:[{id:'spell',name:'Spell',mode:'ranged',range:5,damage:'1d4',stat:'intelligence'}]}});const r=E.resolveAction(s,attack(s,s.actors[1].id,{mode:'ranged',weapon:'spell',stat:'auto'}),{roll:dice(10,2)});assert.equal(r.result.ability,4);assert.equal(E.resolveAction(s,attack(s,s.actors[1].id,{mode:'ranged',weapon:'spell',stat:'strength'}),{roll:dice(10)}).result.ability,0);
});
test('No resource or state mutation occurs when a skill attempts a stale token or invented numeric effects',()=>{
    const s=fixture(),before=E.clone(s);for(const extra of [{turn:'old'},{dc:0},{damage:999},{stat:'charisma'}])assert.throws(()=>E.resolveAction(s,ability(s,'status',s.actors[1].id,extra)));assert.deepEqual(s,before);
});
test('Companion templates retain skill profiles but clear active tactics and turn-only boosts',async()=>{
    let saved;const s=fixture({actor:{actionsPerTurn:3}});let bundle={state:s,history:[]};const c=createController({key:()=> 'x',read:()=>bundle,write:v=>{bundle=v;},save:async()=>{},saveTemplate:async a=>{saved=a;}});await c.act(ability(c.state(),'sprint'));await c.act(ability(c.state(),'aim'));await c.saveTemplate(s.actors[0].id);assert(saved.skills.length>0);assert.equal(saved.tactics.length,0);assert.equal(saved.sprintTurn,-1);assert.equal(saved.stance,'neutral');
});
test('Turning off tactical modules pauses their duration and prevents their numerical effects',()=>{
    let s=fixture({actor:{actionsPerTurn:2}});s=E.resolveAction(s,ability(s,'aim')).state;s=E.setRules(s,{skillsEnabled:false}).state;const r=E.resolveAction(s,attack(s,s.actors[1].id,{mode:'ranged'}),{roll:dice(10)});assert.equal(r.result.tacticalBonus,0);assert.equal(r.state.actors[0].tactics.length,1);
});

