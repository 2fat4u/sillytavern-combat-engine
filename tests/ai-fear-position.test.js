import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../engine.js';
import { skillPreset } from '../skills.js';
import { planBasicTurn, resolveBasicTurn } from '../ai.js';

function fixture() {
    let s=E.setRules(E.emptyState(),{multiActionsEnabled:true,splitMovement:true,movementBase:2,movementStat:'none'}).state;
    s=E.setBoard(s,{width:8,height:8}).state;
    s=E.addActor(s,{id:'source',name:'Bard',side:'player',maxHp:100,position:{x:4,y:3},initiative:10}).state;
    s=E.addActor(s,{id:'target',name:'Wizard',side:'ally',maxHp:100,hp:10,position:{x:4,y:2},initiative:9}).state;
    s=E.addActor(s,{id:'blocker',name:'Warrior',side:'ally',maxHp:100,position:{x:4,y:1},initiative:8}).state;
    s=E.addActor(s,{id:'afraid',name:'Goblin',side:'enemy',control:'basic',maxHp:100,position:{x:4,y:0},initiative:20,skills:[{...skillPreset('distract'),id:'distract',ai:true}],tactics:[{type:'frightened',source:'source',turns:1}]}).state;
    s=E.startCombat(s).state;
    return E.editActor(s,s.actors[3].id,{tactics:[{type:'frightened',source:s.actors[0].id,turns:1}]}).state;
}

test('Fear attack prediction uses the destination and matches the committed move without changing state',()=>{
    const s=fixture(), before=E.clone(s), a=E.currentActor(s), b=s.actors[1], from={x:3,y:1};
    assert.equal(E.reactionPending(s,a),false);
    assert.equal(E.reactionPending(s,a,from),true);
    assert.equal(E.canAttack(s,a,b,'melee',from),false);
    const moved=E.moveActor(s,a.id,from).state;
    assert.equal(E.canAttack(moved,E.currentActor(moved),E.findActor(moved,b.id),'melee'),false);
    assert.deepEqual(s,before);
    assert.throws(()=>E.resolveAction(moved,{type:'attack',actor:a.id,target:b.id}),/Deckungs- oder Fluchtabsicht/);
});

test('Enemy skill prediction uses the destination and the movement that remains after moving',()=>{
    const s=fixture(), a=E.currentActor(s), b=s.actors[1], skill=a.skills[0];
    assert.equal(E.canUseSkill(s,a,b,skill,{x:3,y:1}),false);
    // Using the entire movement budget leaves no reachable retreat: this is legal.
    const from={x:3,y:2}, moved=E.moveActor(s,a.id,from).state;
    assert.equal(E.movementBudget(moved,E.currentActor(moved)).remaining,0);
    assert.equal(E.canUseSkill(s,a,b,skill,from),true);
    assert.equal(E.canAttack(s,a,b,'melee',from),true);
    assert.equal(E.canUseSkill(moved,E.currentActor(moved),E.findActor(moved,b.id),skill),true);
});

test('An intimidated Basic AI completes its turn when a short move would make a retreat mandatory again',()=>{
    const s=fixture(), plan=planBasicTurn(s), result=resolveBasicTurn(s,{roll:n=>n===20?16:1});
    assert(plan.intent.type==='attack'||plan.intent.type==='skill');
    assert.notEqual(E.currentActor(result.state)?.id,E.currentActor(s).id);
    assert.equal(E.validateState(result.state).phase,'active');
    assert(result.state.log.some(v=>v.details?.actor===E.currentActor(s).id&&['attack','skill'].includes(v.type)));
});
