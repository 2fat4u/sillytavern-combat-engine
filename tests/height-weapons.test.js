import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../engine.js';
import { resolveBasicTurn, planBasicTurn } from '../ai.js';
import { terrainFrom, cleanTerrain } from '../terrain.js';
import { captureMap, mapFrom } from '../maps.js';
import { createController } from '../controller.js';
import { readWeaponDraft } from '../weapons-ui.js';
function fixture(actor = {}, enemy = {}, board = {}) {
    let s = E.setRules(E.emptyState(), { splitMovement:true, movementStat:'none', movementBase:5 }).state;
    s = E.setBoard(s,{width:8,height:8,...board}).state;
    s = E.addActor(s,{name:'Hero',side:'player',initiative:20,position:{x:1,y:2},maxHp:100,...actor}).state;
    s = E.addActor(s,{name:'Enemy',side:'enemy',initiative:10,position:{x:5,y:2},maxHp:100,dc:12,...enemy}).state;
    if (enemy.hp === 0) s = E.addActor(s,{name:'Other enemy',side:'enemy',position:{x:7,y:7}}).state;
    return E.startCombat(s).state;
}
const attack = (s,extra={}) => ({type:'attack',actor:s.actors[0].id,target:s.actors[1].id,turn:E.turnToken(s),...extra});
const w = (id,extra={}) => ({id,name:id,mode:'ranged',damage:'1d4',range:6,damageBonus:0,attackBonus:0,...extra});
const dice = (...values) => () => values.shift();
test('Named third weapon controls its own dice, hit bonus, damage bonus and range',()=>{
    const s=fixture({weaponList:[w('short',{range:2}),w('bow'),w('spell',{damage:'1d8',damageBonus:3,attackBonus:2})]});
    assert(!E.canAttack(s,s.actors[0],s.actors[1],'ranged',s.actors[0].position,'profile','short'));
    const r=E.resolveAction(s,attack(s,{weapon:'spell'}),{roll:dice(10,5)}).result;
    assert.equal(r.total,12);assert.equal(r.damage,8);assert.equal(r.weapon,'spell'); assert.match(E.resultText(r,'en'),/spell/);
    assert.throws(()=>E.resolveAction(s,attack(s,{weapon:'spell',mode:'melee'})),/Waffe/);
});
test('Exact preferred weapon is used when the attack omits a weapon ID',()=>{
    const s=fixture({weaponList:[w('bow'),w('magic',{damage:'1d12'})],preferredWeapon:'magic',attackMode:'ranged'});
    assert.equal(E.resolveAction(s,attack(s),{roll:dice(20,9)}).result.weapon,'magic');
});
test('Legacy edit changes first matching weapon and retains extra profiles and hit bonus',()=>{
    let s=fixture({weaponList:[w('bow',{attackBonus:3}),w('magic')]});
    s=E.editActor(s,s.actors[0].id,{weapons:{ranged:{damage:'1d8',radius:0}},range:7}).state;
    assert.equal(s.actors[0].weaponList.length,2); assert.equal(s.actors[0].weaponList[0].attackBonus,3); assert.equal(s.actors[0].weaponList[0].range,7); assert.equal(s.actors[0].weaponList[1].damage,'1d4');
});
test('Limited stocks consume only the selected weapon; empty ranged ammo never blocks melee',()=>{
    let s=fixture({weaponList:[w('sword',{mode:'melee'}),w('bow',{resource:'arrow',standard:{damage:'1d4'}})],resources:[{id:'arrow',name:'Arrow',kind:'ammo',quantity:0}]},{position:{x:2,y:2}});
    assert.throws(()=>E.resolveAction(s,attack(s,{weapon:'bow'})),/aufgebraucht/);
    assert(E.canAttack(s,s.actors[0],s.actors[1],'melee',s.actors[0].position,'profile','sword'));
    assert.equal(E.resolveAction(s,attack(s,{weapon:'sword'}),{roll:dice(20,3)}).result.damage,3);
    s=E.editActor(s,s.actors[0].id,{resources:[{id:'arrow',name:'Arrow',kind:'ammo',quantity:1}]}).state;
    const r=E.resolveAction(s,attack(s,{weapon:'bow'}),{roll:dice(1)}); assert.equal(r.state.actors[0].resources[0].quantity,0); assert(!r.result.hit);
    const normal=E.resolveAction(s,attack(s,{weapon:'bow',variant:'standard'}),{roll:dice(20,2)}); assert.equal(normal.state.actors[0].resources[0].quantity,1);
});
test('Basic AI uses a third stocked weapon if the first two cannot attack',()=>{
    const s=fixture({control:'basic',weaponList:[w('short',{range:1}),w('empty',{resource:'ammo',standard:null}),w('spell')],resources:[{id:'ammo',name:'Ammo',kind:'ammo',quantity:0}]},{},{blocked:[{x:2,y:1},{x:2,y:2},{x:2,y:3},{x:2,y:4},{x:2,y:5},{x:2,y:6}],cover:[]});
    // Wall prevents all shots from the starting cell; selected attack after routing still names an existing weapon.
    const plan=planBasicTurn(s); assert(plan.intent.type==='other'||['short','spell'].includes(plan.intent.weapon));
    const clear=fixture({control:'basic',weaponList:[w('short',{range:1}),w('empty',{resource:'ammo',standard:null}),w('spell')],resources:[{id:'ammo',name:'Ammo',kind:'ammo',quantity:0}]});
    assert.equal(planBasicTurn(clear).intent.weapon,'spell');
});
test('Prompt guidance lists legal targets separately for every named weapon',()=>{
    const s=fixture({control:'dm',weaponList:[w('short',{range:1}),w('spell')]});
    const guidance=E.tacticalTargets(s);assert.equal(guidance.weaponTargets[0].profile.length,0);assert.equal(guidance.weaponTargets[1].profile[0].id,s.actors[1].id);
    assert.match(E.buildPrompt(s),/exact ID/);assert.match(E.buildPrompt(s),/weaponTargets/);
});
test('All resource references and duplicate weapon IDs are validated',()=>{
    assert.throws(()=>fixture({weaponList:[w('a',{resource:'missing'})]}),/ressource/);
    assert.throws(()=>fixture({weaponList:[w('a'),w('a')]}),/Doppelte/);
    assert.throws(()=>fixture({weaponList:[w('a',{standard:{damage:'1d6',resource:'missing'}})]}),/ressource/);
});
test('Old two-slot actors migrate and roundtrip without losing weapon or action configuration',()=>{
    const s=fixture({weapons:{melee:{damage:'1d6'},ranged:{damage:'1d8'}}});
    const raw=E.clone(s);delete raw.actors[0].weaponList;delete raw.actors[0].preferredWeapon;
    const migrated=E.validateState(raw);assert.equal(migrated.actors[0].weaponList.length,2); assert.deepEqual(E.validateState(JSON.parse(JSON.stringify(migrated))),migrated);
});
test('Elevation blocks movement and adjacent attacks without a ladder',()=>{
    const s=fixture({}, {position:{x:2,y:2}}, {heights:[{x:2,y:2}]});
    assert(!E.canStep(s,{x:1,y:2},{x:2,y:2})); assert(!E.pathDistances(s,s.actors[0].position,s.actors[0].id).has('2,2'));
    assert(!E.canAttack(s,s.actors[0],s.actors[1],'melee')); assert.throws(()=>E.resolveAction(s,attack(s,{mode:'melee'})),/Leiter/);
});
test('Bidirectional ladders charge configured movement and connect adjacent melee',()=>{
    const board={heights:[{x:2,y:2},{x:3,y:2}],ladders:[{from:{x:1,y:2},to:{x:2,y:2}}]};
    let s=fixture({}, {},board);assert.equal(E.stepCost(s,{x:1,y:2},{x:2,y:2}),2);
    s=E.moveActor(s,s.actors[0].id,{x:2,y:2}).state;assert.equal(E.movementBudget(s,s.actors[0]).remaining,3);
    s=E.moveActor(s,s.actors[0].id,{x:1,y:2}).state;assert.equal(E.movementBudget(s,s.actors[0]).remaining,1);
    const other=fixture({}, {position:{x:2,y:2}},board);assert(E.canAttack(other,other.actors[0],other.actors[1],'melee'));
});
test('Height corners cannot be jumped diagonally and GM correction bypasses ladder travel',()=>{
    let s=fixture({}, {},{heights:[{x:2,y:1},{x:1,y:3}]});
    assert(!E.canStep(s,{x:1,y:2},{x:2,y:3}));
    s=E.moveActor(s,s.actors[0].id,{x:2,y:1},true).state;assert.equal(E.heightAt(s,s.actors[0].position),1);assert.equal(E.movementBudget(s,s.actors[0]).spent,0);
});
test('Higher attacker gets +2 hit, higher defender +2 DC; natural rolls retain precedence',()=>{
    const high=fixture({weaponList:[w('bow')]},{},{heights:[{x:1,y:2}]});
    const hit=E.resolveAction(high,attack(high,{weapon:'bow'}),{roll:dice(10,4)}).result;assert(hit.hit);assert.equal(hit.highAttack,2);assert.equal(hit.total,12);
    const low=fixture({weaponList:[w('bow')]},{},{heights:[{x:5,y:2}]});
    const miss=E.resolveAction(low,attack(low,{weapon:'bow'}),{roll:dice(12)}).result;assert(!miss.hit);assert.equal(miss.dc,14);assert.equal(miss.baseDC,12);
    const off=E.setRules(low,{heightsEnabled:false}).state;assert.equal(E.resolveAction(off,attack(off),{roll:dice(12,2)}).result.dc,12);
    const nat=E.setRules(low,{natural20:true}).state;assert(E.resolveAction(nat,attack(nat),{roll:dice(20,1,1)}).result.hit);
});
test('Elevated directional battlement protects incoming shots but permits outgoing shots',()=>{
    const s=fixture({}, {},{heights:[{x:3,y:2},{x:4,y:2},{x:5,y:2}],cover:[{x:3,y:2}],coverFaces:[{x:3,y:2,facing:'west'}]});
    assert(E.coverOnRay(s,{x:1,y:2},{x:5,y:2}));assert(!E.coverOnRay(s,{x:5,y:2},{x:1,y:2}));
    assert(!E.coverOnRay(s,{x:1,y:3},{x:5,y:3}));
    const old=fixture({}, {},{cover:[{x:3,y:2}]});assert(E.coverOnRay(old,{x:1,y:2},{x:5,y:2}));assert(E.coverOnRay(old,{x:5,y:2},{x:1,y:2}));
});
test('Walls still stop ranged attacks on every level; cover and height coexist',()=>{
    const s=fixture({weaponList:[w('bow')]},{},{heights:[{x:1,y:2},{x:3,y:2}],blocked:[{x:3,y:2}]});
    assert(!E.canAttack(s,s.actors[0],s.actors[1],'ranged'));assert.throws(()=>E.resolveAction(s,attack(s)),/Hindernis/);
    assert.doesNotThrow(()=>terrainFrom({heights:[{x:3,y:2}],cover:[{x:3,y:2}]},8,8));
});
test('Adjacent healing and stabilization respect height, ranged healing can cross levels',()=>{
    let s=fixture({resources:[{id:'heal',name:'Heal',quantity:1,heal:'4',range:1}]},{position:{x:2,y:2},hp:0,condition:'unconscious'},{heights:[{x:2,y:2}]});
    assert(!E.canUseResource(s,s.actors[0],s.actors[1],s.actors[0].resources[0])); assert.throws(()=>E.resolveAction(s,{type:'stabilize',actor:s.actors[0].id,target:s.actors[1].id}),/Nachbarfeld/);
    const item={...s.actors[0].resources[0],range:4}; assert(E.canUseResource(s,s.actors[0],s.actors[1],item));
    s=E.setBoard(s,{ladders:[{from:{x:1,y:2},to:{x:2,y:2}}]}).state;
    assert(E.canUseResource(s,s.actors[0],s.actors[1],s.actors[0].resources[0]));assert.equal(E.resolveAction(s,{type:'stabilize',actor:s.actors[0].id,target:s.actors[1].id}).state.actors[1].condition,'stabilized');
});
test('Go to cover spends movement without spending an action and rejects stale turns',()=>{
    let s=fixture({position:{x:1,y:4}},{position:{x:6,y:2}},{cover:[{x:3,y:2}]});
    const choice=E.coverDestination(s);assert(choice);assert(choice.cost>0);
    const id=s.actors[0].id, token=E.turnToken(s);s=E.goCover(s,id,token).state;assert(!E.actionBudget(s).used);assert.equal(E.movementBudget(s,s.actors[0]).spent,choice.cost);assert(E.coverOnRay(s,s.actors[1].position,s.actors[0].position));
    assert.throws(()=>E.goCover(s,id,'turn-old'),/Veralteter/);assert.throws(()=>E.goCover(s,id,token),/bereits/);
});
test('Go to cover after an attack uses remaining split movement; unavailable cover is atomic',()=>{
    let s=fixture({position:{x:1,y:4}},{position:{x:6,y:2}},{cover:[{x:3,y:2}]});
    s=E.resolveAction(s,attack(s,{mode:'ranged'}),{roll:dice(1)}).state; assert(E.actionBudget(s).used);
    s=E.goCover(s,s.actors[0].id).state;assert(E.actionBudget(s).used);
    const no=fixture(); const raw=JSON.stringify(no);assert.throws(()=>E.goCover(no,no.actors[0].id),/Keine/);assert.equal(JSON.stringify(no),raw);
});
test('Basic AI routes through ladders and can shoot from elevated cover',()=>{
    const heights=Array.from({length:8},(_,y)=>({x:4,y}));
    const s=fixture({control:'basic',weaponList:[w('sword',{mode:'melee'})]},{position:{x:4,y:3}},{heights,ladders:[{from:{x:3,y:3},to:{x:4,y:3}}]});
    const plan=planBasicTurn(s);assert.equal(plan.intent.type,'attack');assert(E.adjacentAccess(s,plan.move,s.actors[1].position));
    assert.doesNotThrow(()=>resolveBasicTurn(s,{roll:()=>1}));
});
test('Maps, export/import and undo preserve terrain, stocks, weapon IDs and budgets',async()=>{
    const state=fixture({weaponList:[w('spell')],actionsPerTurn:3},{},{heights:[{x:2,y:2}],ladders:[{from:{x:1,y:2},to:{x:2,y:2}}],cover:[{x:3,y:2}],coverFaces:[{x:3,y:2,facing:'west'}]});
    const map=captureMap(state,'Castle');assert.deepEqual(mapFrom(JSON.parse(JSON.stringify(map))).board,state.board);
    let bundle={state,history:[]};const c=createController({key:()=> 'test',read:()=>bundle,write:b=>{bundle=b;},save:async()=>{}});
    await c.move(state.actors[0].id,{x:2,y:2});await c.undo();assert.deepEqual(c.state().board,state.board);assert.equal(c.state().actors[0].actionsPerTurn,3);
    assert.deepEqual(E.validateState(c.export()).board,state.board);
});
test('Malformed ladders and direction fields are rejected; terrain edits remove invalid links',()=>{
    assert.throws(()=>terrainFrom({ladders:[{from:{x:0,y:0},to:{x:1,y:0}}]},8,8));
    assert.throws(()=>terrainFrom({heights:[{x:1,y:0}],ladders:[{from:{x:0,y:0},to:{x:1,y:0}},{from:{x:1,y:0},to:{x:0,y:0}}]},8,8));
    assert.throws(()=>terrainFrom({coverFaces:[{x:1,y:0,facing:'north'}]},8,8));
    const board={width:8,height:8,heights:[{x:1,y:0}],ladders:[{from:{x:0,y:0},to:{x:1,y:0}}],blocked:[],cover:[]};
    assert.equal(cleanTerrain(board,{heights:[]}).ladders.length,0);
});
function formFor(weapons,resources) {
    const d=new Map([['preferredWeapon',weapons[0].id]]);
    weapons.forEach((v,i)=>{const p='weapon-'+i;for(const [name,value] of Object.entries({name:v.name,mode:v.mode,range:v.range,hit:v.attackBonus??0,damage:v.damage,bonus:v.damageBonus??0,radius:v.radius??0,standardDamage:'',standardBonus:0}))d.set(p+'-'+name,String(value));d.set(p+'-stock-resource',v.resource??'');d.set(p+'-stock-quantity',String(resources.find(r=>r.id===v.resource)?.quantity??10));});return d;
}
test('Weapon editor assigns a new own stock directly and leaves unlimited weapons unlinked',()=>{
    const weapons=[w('spell'),w('sword',{mode:'melee'})],d=formFor(weapons,[]);d.set('weapon-0-stock-resource','__own__');d.set('weapon-0-stock-quantity','5');d.set('weapon-0-stock-stockName','Mana');
    const draft=readWeaponDraft(d,weapons,[]);assert.equal(draft.resources[0].quantity,5);assert.equal(draft.resources[0].name,'Mana');assert.equal(draft.weaponList[0].resource,draft.resources[0].id);assert.equal(draft.weaponList[1].resource,null);
});
test('Shared stock edits do not override a changed count with an unchanged sibling field',()=>{
    const resources=[{id:'ammo',name:'Ammo',kind:'ammo',quantity:10}],weapons=[w('bow',{resource:'ammo'}),w('crossbow',{resource:'ammo'})];
    const d=formFor(weapons,resources);d.set('weapon-0-stock-quantity','7');const draft=readWeaponDraft(d,weapons,resources);assert.equal(draft.resources[0].quantity,7);assert.equal(resources[0].quantity,10);
    d.set('weapon-1-stock-quantity','8');assert.throws(()=>readWeaponDraft(d,weapons,resources),/widersprüchliche/);
});
