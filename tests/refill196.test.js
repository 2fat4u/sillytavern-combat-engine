import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../engine.js';
import { createController } from '../controller.js';
import { planBasicTurn, resolveBasicTurn, resolveBasicTurnAsync } from '../ai.js';
import { profileFrom, exportProfiles, transferPatch, resourceDependencies } from '../profiles.js';
import { readResources, resourceFields } from '../supplies-ui.js';
import { resourcePreset } from '../effects.js';
import { contextActions } from '../context-actions.js';
import { skillPreset } from '../skills.js';

const mana={id:'mana',name:'Mana',kind:'ammo',quantity:0,capacity:20};
const refill={id:'potion',name:'Mana potion',kind:'supply',quantity:3,range:0,heal:'0',refill:{stock:'mana',amount:5}};
function fixture(rules={},actor={}) {
    let s=E.setRules(E.emptyState(),{multiActionsEnabled:true,splitMovement:true,movementStat:'none',rngMode:'seeded',seed:'196',...rules}).state;
    s=E.addActor(s,{name:'Mage',side:'player',maxHp:30,hp:30,initiative:20,resources:[mana,refill],position:{x:1,y:1},weaponList:[{id:'bolt',mode:'ranged',range:10,damage:'1d4',resource:'mana',cost:3,standard:null}],...actor}).state;
    s=E.addActor(s,{name:'Enemy',side:'enemy',maxHp:30,position:{x:4,y:1}}).state;
    return E.startCombat(s).state;
}
const intent=(s,extra={})=>({type:'use',actor:s.actors[0].id,target:s.actors[0].id,resource:'potion',turn:E.turnToken(s),...extra});
function controller(s){let b={state:s,history:[]};return createController({key:()=> 'same',read:()=>b,write:v=>b=v,save:async()=>{}});}
test('Refill restores an empty mana stock, consumes one item/action and never rolls or heals',()=>{
    const s=fixture(),before=E.clone(s),r=E.resolveAction(s,intent(s),{roll:()=>{throw Error('No dice');}});
    assert.equal(r.state.actors[0].resources[0].quantity,5);assert.equal(r.state.actors[0].resources[1].quantity,2);assert.equal(r.result.refill.amount,5);assert.equal(r.state.action.freeSpent,1);
    assert.deepEqual(r.state.rng,before.rng);assert.deepEqual(r.state.movement,before.movement);assert.deepEqual(r.state.actors.map(a=>a.hp),before.actors.map(a=>a.hp));assert.match(E.resultText(r.result,'en'),/Mana \+5 \(0 → 5\/20\)/);assert.match(E.resultText(r.result,'de'),/2 übrig/);
});
test('Refill works on ammunition and spell charges, not only mana',()=>{
    const s=fixture({}, {resources:[{...mana,name:'Arrows'},refill]});const r=E.resolveAction(s,intent(s));assert.equal(r.result.refill.name,'Arrows');assert.equal(r.state.actors[0].resources[0].quantity,5);
});
test('Capacity caps actual gain; partial refill consumes once; full stock rejects atomically',()=>{
    const s=fixture({}, {actionsPerTurn:2,resources:[{...mana,quantity:19},refill]}),r=E.resolveAction(s,intent(s));assert.equal(r.result.refill.amount,1);assert.equal(r.state.actors[0].resources[0].quantity,20);assert.equal(r.state.actors[0].resources[1].quantity,2);
    assert(!E.canUseResource(r.state,r.state.actors[0],r.state.actors[0],r.state.actors[0].resources[1]));const before=E.clone(r.state);assert.throws(()=>E.resolveAction(r.state,intent(r.state)),/bereits voll/);assert.deepEqual(r.state,before);
});
test('Without custom capacity a stock grows by the configured amount, bounded by schema limit',()=>{
    const s=fixture({}, {resources:[{...mana,quantity:999999,capacity:null},refill]}),r=E.resolveAction(s,intent(s));assert.equal(r.result.refill.amount,1);assert.equal(r.state.actors[0].resources[0].quantity,1000000);E.validateState(r.state);
});
test('No item, wrong actor or area center spends neither stock nor action',()=>{
    for(const [actor,extra]of [[{resources:[mana,{...refill,quantity:0}]},{}],[{}, {target:'other'}],[{}, {center:{x:1,y:1}}]]){
        const s=fixture({},actor),before=E.clone(s),action=intent(s,extra);if(action.target==='other')action.target=s.actors[1].id;
        assert.throws(()=>E.resolveAction(s,action));assert.deepEqual(s,before);
    }
});
test('Resource rule off, stunned and unconscious users cannot recharge',()=>{
    const off=fixture({resourcesEnabled:false});assert.throws(()=>E.resolveAction(off,intent(off)));const s=fixture();
    const stunned=E.editActor(s,s.actors[0].id,{effects:[{type:'stunned',turns:2}]}).state;assert(!E.canUseResource(stunned,stunned.actors[0],stunned.actors[0],stunned.actors[0].resources[1]));
    const down=E.editActor(E.stopCombat(s).state,s.actors[0].id,{hp:0,condition:'stabilized'}).state;assert.throws(()=>E.resolveAction(down,intent(down)));
});
test('Outside combat, refill consumes item units but no action, movement or HP',()=>{
    const s=E.stopCombat(fixture()).state,r=E.resolveAction(s,intent(s));assert.equal(r.state.actors[0].resources[0].quantity,5);assert.deepEqual(r.state.action,s.action);assert.deepEqual(r.state.movement,s.movement);assert.equal(r.state.actors[0].hp,30);
});
test('A healing-only bonus cannot pay refill; matching refill bonus is spent before normal action',()=>{
    const s=fixture({}, {actionsPerTurn:1,bonusActions:[{id:'heal',name:'Heal only',count:1,allowed:['use']},{id:'reload',name:'Reload',count:1,allowed:['refill']}]}),r=E.resolveAction(s,intent(s));assert.equal(r.state.action.bonusSpent.reload,1);assert.equal(r.state.action.bonusSpent.heal,undefined);assert.equal(r.state.action.freeSpent,0);
    const noBonus=fixture({}, {actionsPerTurn:1,bonusActions:[{id:'heal',name:'Heal only',count:1,allowed:['use']}]});const used=E.resolveAction(noBonus,{type:'other',actor:noBonus.actors[0].id,turn:E.turnToken(noBonus)}).state;assert.throws(()=>E.resolveAction(used,intent(used)),/Zusatzaktionen/);assert.equal(used.actors[0].resources[1].quantity,3);
});
test('Refill can pay a configured item cost or another stock, but cannot consume its own destination',()=>{
    const s=fixture({}, {resources:[mana,{id:'charges',name:'Charges',kind:'ammo',quantity:6},{...refill,consumption:'linked',stock:'charges',cost:2}]}),r=E.resolveAction(s,intent(s));assert.equal(r.state.actors[0].resources[0].quantity,5);assert.equal(r.state.actors[0].resources[1].quantity,4);assert.equal(r.state.actors[0].resources[2].quantity,3);
    assert.throws(()=>fixture({}, {resources:[mana,{...refill,consumption:'linked',stock:'mana'}]}),/darf nicht/);
});
test('Cost zero is an explicit unlimited refill option; an empty inventory then remains empty',()=>{
    const s=fixture({}, {resources:[mana,{...refill,cost:0,quantity:0}]}),r=E.resolveAction(s,intent(s));assert.equal(r.state.actors[0].resources[0].quantity,5);assert.equal(r.state.actors[0].resources[1].quantity,0);
});
for(const bad of [0,-1,1.5,null,true,1000001])test('Refill rejects invalid amount '+JSON.stringify(bad),()=>{
    assert.throws(()=>fixture({}, {resources:[mana,{...refill,refill:{stock:'mana',amount:bad}}]}));
});
test('Refill references, exclusive item effects and capacities are validated before import or edit',()=>{
    for(const resources of [[mana,{...refill,refill:{stock:'missing',amount:5}}],[mana,{...refill,heal:'5'}],[mana,{...refill,radius:1}],[mana,{...refill,cures:['poisoned']}],[mana,{...refill,refill:false}],[{...mana,quantity:21},refill],[{...mana,capacity:1.5},refill]])assert.throws(()=>fixture({}, {resources}));
    const s=fixture(),before=E.clone(s);assert.throws(()=>E.editActor(s,s.actors[0].id,{resources:[{...mana,quantity:25},refill]}));assert.deepEqual(s,before);
});
test('Controller treats refill, costs and undo as one atomic action; export/reload retains capacity',async()=>{
    const s=fixture(),c=controller(s);await c.act(intent(s));assert.equal(c.historyLength(),1);const exported=c.export();assert.equal(E.validateState(exported).actors[0].resources[0].quantity,5);await c.undo();assert.equal(c.state().actors[0].resources[0].quantity,0);assert.equal(c.state().actors[0].resources[1].quantity,3);
});
test('Resource export selection includes refill destination; multi-actor import remaps it correctly',async()=>{
    const s=fixture(),pack={kind:'combat-resources',version:1,resources:resourceDependencies(s.actors[0].resources,['potion'])};assert.equal(pack.resources.length,2);profileFrom(pack);
    const patch=transferPatch(s.actors[1],pack,'append'),after=E.editActor(s,s.actors[1].id,patch).state,target=after.actors[1];const item=target.resources.find(v=>v.refill);assert.notEqual(item.refill.stock,'mana');assert(target.resources.some(v=>v.id===item.refill.stock&&v.kind==='ammo'));
    const actors=profileFrom(exportProfiles(s,'actor',s.actors[0].id));assert.equal(actors.actors[0].resources[0].capacity,20);assert.equal(actors.actors[0].resources[1].refill.amount,5);
});
test('Resource replacement preserves a stock referenced by an existing refill item',()=>{
    const s=fixture(),patch=transferPatch(s.actors[0],{kind:'combat-resources',version:1,resources:[{id:'new',name:'New mana',kind:'ammo',quantity:5}]},'replace');assert(patch.resources.some(v=>v.id==='mana'));E.editActor(s,s.actors[0].id,patch);
});
test('Editor fields round-trip amount, target and capacity, and refill preset is a consumable',()=>{
    const resources=fixture().actors[0].resources,values=new Map([['resource-0-quantity','0'],['resource-0-capacity','25'],['resource-1-purpose','refill'],['resource-1-refill-stock','mana'],['resource-1-refill-amount','7']]),read=readResources(values,resources);
    assert.equal(read[0].capacity,25);assert.equal(read[1].refill.amount,7);assert.equal(read[1].refill.stock,'mana');assert.equal(read[1].range,0);
    assert.match(resourceFields(resources,'en'),/Units restored per use/);assert.match(resourceFields(resources,'de'),/Vorrat, der aufgefüllt wird/);assert.equal(resourcePreset('refill').quantity,3);
});
test('Actor context offers its own refill regardless of the clicked opponent',()=>{
    const s=fixture(),entry=contextActions(s,s.actors[1].id,'en').find(v=>v.kind==='refill');assert(entry);assert.equal(entry.target,s.actors[0].id);assert.equal(entry.reason,'');
});
test('Basic AI recharges a needed stock, then attacks with it within its action budget',async()=>{
    const s=fixture({}, {control:'basic',actionsPerTurn:2});assert.equal(planBasicTurn(s).intent.resource,'potion');const a=resolveBasicTurn(s,{roll:n=>n}),b=await resolveBasicTurnAsync(s,{roll:n=>n,yield:()=>{}});assert.equal(a.result.actions[0].refill.amount,5);assert.equal(a.result.actions[1].type,'attack');assert.equal(a.state.actors[0].resources[0].quantity,2);assert.equal(a.state.actors[0].resources[1].quantity,2);assert.deepEqual(a.state.actors,b.state.actors);
});
test('Basic AI does not waste refills on unused stocks or a capacity below the required cost',()=>{
    const unused=fixture({}, {control:'basic',weaponList:[{id:'blade',mode:'melee',damage:'1d4'}]});assert.notEqual(planBasicTurn(unused).intent.resource,'potion');
    const impossible=fixture({}, {control:'basic',resources:[{...mana,capacity:2},refill]});assert.notEqual(planBasicTurn(impossible).intent.resource,'potion');
});

function challengeFixture(challenger={x:4,y:2},rules={},board={},extra={}) {
    let s=E.setRules(E.emptyState(),{movementBase:5,movementStat:'none',...rules}).state;
    s=E.addActor(s,{name:'Goblin',side:'enemy',control:'basic',maxHp:12,hp:7,initiative:20,position:{x:5,y:3},weaponList:[{id:'knife',mode:'melee',damage:'1d4'}],...extra}).state;
    s=E.addActor(s,{name:'Tavin',side:'ally',maxHp:26,position:challenger}).state;
    s=E.addActor(s,{name:'Mira',side:'ally',maxHp:26,hp:18,position:{x:4,y:4}}).state;
    s=E.editActor(s,s.actors[0].id,{tactics:[{type:'provoked',turns:1,source:s.actors[1].id,appliedTurn:0}]}).state;
    s=E.setBoard(s,board).state;return E.startCombat(s).state;
}
test('Reported provocation regression: adjacent challenger outranks a weaker target reached by moving away',()=>{
    const s=challengeFixture(),p=planBasicTurn(s);assert(E.canAttack(s,s.actors[0],s.actors[1]));assert.equal(p.intent.target,s.actors[1].id);assert.equal(p.move,null);
    const r=resolveBasicTurn(s,{roll:n=>n});assert.equal(r.result.target,s.actors[1].id);assert.equal(r.state.actors[2].hp,18);assert.equal(r.state.actors[0].tactics.length,0);
});
test('A challenger reachable within movement remains first target even if the weaker opponent is already adjacent',()=>{
    const s=challengeFixture({x:8,y:3}),p=planBasicTurn(s);assert.equal(p.intent.target,s.actors[1].id);assert(p.move);assert(E.distance(p.move,s.actors[1].position)===1);
});
test('An unreachable challenger permits another legal target; no teleport or extra action',()=>{
    const s=challengeFixture({x:9,y:0},{movementBase:1}),p=planBasicTurn(s);assert.equal(p.intent.target,s.actors[2].id);assert.equal(p.move,null);
    const blocked=challengeFixture({x:8,y:3},{},{blocked:Array.from({length:10},(_,y)=>({x:7,y}))});assert.equal(planBasicTurn(blocked).intent.target,blocked.actors[2].id);
});
test('A fallen challenger stops forcing a target, and disabled abilities ignore provocation',()=>{
    const s=challengeFixture(),down=E.editActor(s,s.actors[1].id,{hp:0,condition:'stabilized'}).state;assert.equal(planBasicTurn(down).intent.target,down.actors[2].id);
    const off=E.setRules(s,{skillsEnabled:false}).state;assert.equal(planBasicTurn(off).intent.target,off.actors[2].id);
});
test('Without board checks the challenger is preferred and an attack-lock shield is respected',()=>{
    const s=challengeFixture({x:4,y:2},{boardEnabled:false}),p=planBasicTurn(s);assert.equal(p.intent.target,s.actors[1].id);
    const protectedState=E.editActor(E.setRules(s,{shieldsEnabled:true}).state,s.actors[0].id,{shieldProfiles:[{id:'bubble',name:'Bubble',kind:'absorb',attackLock:true,turns:2}],shields:[{profile:'bubble',charges:1,turns:2,appliedTurn:0}]}).state;assert.notEqual(planBasicTurn(protectedState).intent.type,'attack');resolveBasicTurn(protectedState);
});
test('Successful Provoke changes target preference but never grants or triggers an immediate attack',()=>{
    let s=E.emptyState();s=E.addActor(s,{name:'Bard',side:'ally',initiative:20,position:{x:4,y:2},skills:[{...skillPreset('provoke'),id:'challenge',dc:5}]}).state;s=E.addActor(s,{name:'Goblin',side:'enemy',control:'basic',position:{x:5,y:3},weaponList:[{id:'knife',mode:'melee',damage:'1d4'}]}).state;s=E.startCombat(s).state;
    const before=s.actors.map(a=>a.hp),r=E.resolveAction(s,{type:'skill',actor:s.actors[0].id,target:s.actors[1].id,skill:'challenge',turn:E.turnToken(s)},{roll:n=>n});assert.deepEqual(r.state.actors.map(a=>a.hp),before);assert.equal(r.state.actors[1].tactics[0].source,s.actors[0].id);assert.equal(planBasicTurn(r.state).intent.target,s.actors[0].id);
});

