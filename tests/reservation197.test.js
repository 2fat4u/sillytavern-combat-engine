import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../engine.js';
import { planBasicTurn } from '../ai.js';
const stock={id:'mana',name:'Mana',kind:'ammo',quantity:0};
const shield={id:'bubble',name:'Bubble',kind:'absorb',turns:2,resource:'mana',cost:2};
function fixture(actor={}) {
    let s=E.setRules(E.emptyState(),{reactionsEnabled:true,shieldsEnabled:true,resourcesEnabled:true,multiActionsEnabled:true,splitMovement:true}).state;
    s=E.addActor(s,{name:'Hero',side:'player',initiative:20,maxHp:20,hp:20,actionsPerTurn:2,reactionCost:'normal',position:{x:1,y:1},...actor}).state;
    s=E.addActor(s,{name:'Enemy',side:'enemy',initiative:10,maxHp:20,hp:20,position:{x:8,y:8}}).state;
    return E.startCombat(s,false).state;
}
const cases=[
    ['no kinds allowed',{reactionChoices:[]}],['control off',{reactionChoices:['block'],reactionControl:'off'}],
    ['missing shield profile',{reactionChoices:['shield']}],['unaffordable shield',{reactionChoices:['shield'],resources:[stock],shieldProfiles:[shield]}],
    ['only an area weapon',{reactionChoices:['counter'],weaponList:[{id:'spell',mode:'ranged',range:10,damage:'1d6',radius:1}]}],
    ['counter stock empty',{reactionChoices:['counter'],resources:[stock],weaponList:[{id:'spell',mode:'ranged',range:10,damage:'1d6',resource:'mana',cost:2,standard:null}]}],
    ['separate budget needs no reservation',{reactionChoices:['block'],reactionCost:'extra'}],
    ['no matching bonus pool',{reactionChoices:['block'],reactionCost:'bonus',bonusActions:[{id:'heal',name:'Heal',count:1,allowed:['use']}]}]
];
for(const [label,actor] of cases)test('197 useless reservation rejected atomically: '+label,()=>{
    const s=fixture(actor),before=E.clone(s);assert(!E.canReserveReaction(s,s.actors[0]));
    assert.throws(()=>E.resolveAction(s,{type:'reserve',actor:s.actors[0].id}),/Keine nutzbare Reaktion/);assert.deepEqual(s,before);
});
test('197 a counter can be reserved before an opponent moves into range',()=>{
    const s=fixture({reactionChoices:['counter'],weaponList:[{id:'blade',mode:'melee',damage:'1d6'}]});assert.equal(E.reactionOptions(s,s.actors[0],s.actors[1]).length,0);
    assert(E.canReserveReaction(s,s.actors[0]));const next=E.resolveAction(s,{type:'reserve',actor:s.actors[0].id}).state;
    assert(next.actors[0].reactionReserve);assert.equal(next.action.freeSpent,1);assert(!E.canReserveReaction(next,next.actors[0]));
});
test('197 a valid normal source cannot be replaced by a remaining reserve-only bonus pool',()=>{
    let s=fixture({reactionChoices:['block'],actionsPerTurn:1,bonusActions:[{id:'rx',name:'Reserve',count:1,allowed:['reserve']}]});s=E.resolveAction(s,{type:'other',actor:s.actors[0].id}).state;
    assert(E.canSpendAction(s,s.actors[0],'reserve'));assert(!E.canReserveReaction(s,s.actors[0]));
});
test('197 Basic AI does not waste an action reserving unavailable protection',()=>{
    const s=fixture({control:'basic',reactionChoices:['shield'],shieldProfiles:[shield],resources:[stock]});assert.notEqual(planBasicTurn(s).intent.type,'reserve');
});
test('197 disabled resource tracking makes the linked protection reservable without stock',()=>{
    let s=fixture({reactionChoices:['shield'],shieldProfiles:[shield],resources:[stock]});assert(!E.canReserveReaction(s,s.actors[0]));
    s=E.setRules(s,{resourcesEnabled:false}).state;assert(E.canReserveReaction(s,s.actors[0]));
});
test('197 a usable unlimited standard variant remains a valid counter despite an empty special stock',()=>{
    const s=fixture({reactionChoices:['counter'],resources:[stock],weaponList:[{id:'spell',mode:'ranged',range:10,damage:'1d6',resource:'mana',cost:2,standard:{damage:'1d4',resource:null}}]});
    assert(E.canReserveReaction(s,s.actors[0]));
});
