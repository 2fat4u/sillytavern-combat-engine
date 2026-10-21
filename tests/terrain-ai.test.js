import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../engine.js';
import { planBasicTurn, resolveBasicTurn } from '../ai.js';
import { createController } from '../controller.js';

function battle(actors, rules = {}, board = {}) {
    let s = E.emptyState(); s.rules = E.rulesFrom({ ...s.rules, movementStat: 'none', rngMode: 'seeded', seed: 'ai-test', ...rules });
    s = E.setBoard(s, board).state;
    for (const [i, a] of actors.entries()) s = E.addActor(s, { maxHp: 100, dc: 5, damage: '1d20', initiative: 100-i, ...a }).state;
    return E.startCombat(s,false).state;
}
const actor = (name,side,x,y,extra={}) => ({ name,side,position:{x,y},...extra });
const attack = s => ({ type:'attack',actor:s.actors[0].id,target:s.actors[1].id,mode:'ranged',turn:E.turnToken(s) });
const rolls = (...values) => () => { assert(values.length,'Unexpected extra roll'); return values.shift(); };

test('Optional betretbare Deckung reduziert Fernschaden genau einmal', () => {
    const s = battle([actor('A','player',0,0),actor('B','enemy',4,0)],{coverWalkable:true}, {cover:[{x:1,y:0},{x:3,y:0},{x:4,y:0}]});
    assert(E.clearSight(s,s.actors[0].position,s.actors[1].position));
    assert(E.pathDistances(s,s.actors[0].position,s.actors[0].id).has('1,0'));
    const {result,state}=E.resolveAction(s,attack(s),{roll:rolls(10,16)});
    assert.equal(result.rawDamage,16); assert.equal(result.damage,8); assert.equal(state.actors[1].hp,92);
    assert.equal(s.actors[1].hp,100);
});
test('Deckungsprozentsatz ist editierbar; Nahkampf wird nicht reduziert', () => {
    const s=battle([actor('A','player',0,0),actor('B','enemy',1,0)],{coverPercent:25,coverWalkable:true},{cover:[{x:1,y:0}]});
    assert.equal(E.resolveAction(s,attack(s),{roll:rolls(10,16)}).result.damage,4);
    assert.equal(E.resolveAction(s,{...attack(s),mode:'melee'},{roll:rolls(10,16)}).result.damage,16);
});
for (const side of ['player','ally','enemy']) test(`Sichtlinie sperrt Fernangriffe für ${side} vor jedem Würfelwurf`, () => {
    const s=battle([actor('A',side,0,0),actor('B',side==='enemy'?'player':'enemy',4,0)],{}, {blocked:[{x:2,y:0}]});
    assert.equal(E.canAttack(s,s.actors[0],s.actors[1],'ranged'),false);
    const old=E.clone(s); let n=0;
    assert.throws(()=>E.resolveAction(s,attack(s),{roll:()=>{n++;return 10;}}),/Hindernis/);
    assert.equal(n,0); assert.deepEqual(s,old);
});
test('Sichtprüfung ist in beiden Richtungen gleich, auch an Mauerecken', () => {
    const s=E.setBoard(E.emptyState(),{blocked:[{x:2,y:2},{x:3,y:1},{x:1,y:4}]}).state;
    const positions=Array.from({length:36},(_,i)=>({x:i%6,y:Math.floor(i/6)})).filter(p=>!E.isBlocked(s,p));
    for(const a of positions) for(const b of positions) assert.equal(E.clearSight(s,a,b),E.clearSight(s,b,a),`${E.coordinate(a)}→${E.coordinate(b)}`);
});
test('Flächenschaden würfelt einmal, halbiert pro Ring und rundet bis 0 ab', () => {
    const s=battle([actor('A','player',9,9),...Array.from({length:6},(_,d)=>actor('Ring'+d,'enemy',3+d,3))]);
    const {result,state}=E.resolveAction(s,attack(s),{roll:rolls(10,16),radiusOverride:5});
    assert.deepEqual(result.affected.map(v=>v.damage),[16,8,4,2,1,0]);
    assert.equal(state.rng.cursor-s.rng.cursor,2); assert.equal(state.turnSerial-s.turnSerial,1);
});
test('Flächenangriff trifft Allies und Angreifer, Mauern schützen Kollateralziele', () => {
    const s=battle([actor('A','player',3,2),actor('B','enemy',3,3),actor('Ally','ally',2,3),actor('Shielded','enemy',5,3)],{}, {blocked:[{x:4,y:3}]});
    const {result,state}=E.resolveAction(s,attack(s),{roll:rolls(10,16),radiusOverride:2});
    assert.equal(result.affected.find(v=>v.name==='A').damage,8);
    assert.equal(result.affected.find(v=>v.name==='Ally').damage,8);
    assert.equal(result.affected.find(v=>v.name==='Shielded').damage,0);
    assert.equal(state.actors[3].hp,100);
});
test('Flächenfehlschlag würfelt keinen Schaden; Deckung halbiert den Ringschaden einmal', () => {
    const s=battle([actor('A','player',0,0),actor('B','enemy',3,3,{dc:20}),actor('C','enemy',5,3)],{coverWalkable:true}, {cover:[{x:4,y:3},{x:5,y:3}]});
    const hit=E.resolveAction(s,attack(s),{roll:rolls(20,16),radiusOverride:2}).result;
    assert.equal(hit.affected.find(v=>v.name==='C').damage,2);
    const miss=E.resolveAction(s,attack(s),{roll:rolls(1),radiusOverride:2});
    assert(miss.result.affected.every(v=>v.damage===0)); assert.equal(miss.state.rng.cursor-s.rng.cursor,1);
});
test('Auch der anfliegende Flächenangriff prüft Deckung; Explosionsdeckung stapelt sich nicht', () => {
    const s=battle([actor('A','player',0,0),actor('B','enemy',3,0),actor('C','enemy',4,0)],{coverWalkable:true}, {cover:[{x:1,y:0},{x:4,y:0}]});
    const {result}=E.resolveAction(s,attack(s),{roll:rolls(10,16),radiusOverride:1});
    assert.equal(result.damage,8); assert.equal(result.affected.find(v=>v.name==='C').damage,4);
});
test('Flächenschaden kann mehrere Figuren bewusstlos machen und den Kampf beenden', () => {
    const s=battle([actor('A','player',0,0),actor('B','enemy',3,3,{maxHp:10}),actor('C','enemy',4,3,{maxHp:5})]);
    const {state}=E.resolveAction(s,attack(s),{roll:rolls(10,16),radiusOverride:1});
    assert.equal(state.phase,'ended'); assert(state.actors.slice(1).every(a=>a.condition==='unconscious'&&a.roundsLeft===3));
    assert.match(state.log.at(-1).text,/B \(Gegner\): 0\/10/); assert.match(state.log.at(-1).text,/C \(Gegner\): 0\/5/);
});
test('Separate Waffenwürfel und Radien werden verwendet; fehlende Waffe würfelt nicht', () => {
    const weapons={melee:{damage:'1d4+1',radius:0},ranged:{damage:'1d12',radius:1}};
    const s=battle([actor('A','player',0,0,{weapons}),actor('B','enemy',1,0)]);
    assert.equal(E.resolveAction(s,{...attack(s),mode:'melee'},{roll:rolls(10,4)}).result.rawDamage,5);
    assert.equal(E.resolveAction(s,attack(s),{roll:rolls(10,12)}).result.rawDamage,12);
    const absent=E.editActor(s,s.actors[0].id,{weapons:{melee:weapons.melee,ranged:null}}).state;
    assert.throws(()=>E.resolveAction(absent,attack(absent),{roll:()=>{throw new Error('Rolled');}}),/keine Waffe/);
});
test('Karten-Seed ist reproduzierbar, erhält Figuren und verändert keine Kampfwürfel', () => {
    const s=battle([actor('A','player',1,1),actor('B','enemy',8,8),actor('C','enemy',1,8)]);
    const opts={seed:'forest',wallPercent:50,coverPercent:30};
    const a=E.randomBoard(s,opts).state,b=E.randomBoard(s,opts).state;
    assert.deepEqual(a.board,b.board); assert.deepEqual(a.rng,s.rng); assert.deepEqual(a.actors,s.actors);
    assert(a.board.blocked.length>0); assert(a.board.cover.length>0);
    const terrainOnly={...a,actors:[]}, reachable=E.pathDistances(terrainOnly,a.actors[0].position,'');
    for(const actor of a.actors) assert(reachable.has(`${actor.position.x},${actor.position.y}`));
    assert.throws(()=>E.randomBoard(s,{wallPercent:60,coverPercent:60}),/85/);
});
test('Alte Profile behalten ihren bisherigen Würfel für beide Angriffsarten', () => {
    const a=E.actorFrom({name:'Old',damage:'2d6+2',attackMode:'ranged'});
    assert.equal(E.weaponFor(a,'melee').damage,'2d6+2'); assert.equal(E.weaponFor(a,'ranged').damage,'2d6+2');
    assert.equal(a.control,'manual'); assert.equal(a.weapons.melee.radius,0);
});
test('Basic-KI wählt schwächsten erreichbaren Gegner deterministisch und führt einen Zug aus', () => {
    const s=battle([actor('A','ally',0,0,{control:'basic',weapons:{melee:{damage:'1d4'},ranged:null}}),actor('Strong','enemy',1,0),actor('Weak','enemy',2,2,{hp:5})]);
    const p=planBasicTurn(s); assert.equal(p.intent.target,s.actors[2].id); assert.deepEqual(p,planBasicTurn(s));
    const {state,result}=resolveBasicTurn(s,{roll:rolls(10,2)});
    assert(result.basicAI); assert.equal(state.turnSerial-s.turnSerial,1); assert.equal(state.actors[2].hp,3);
    assert.equal(s.actors[2].hp,5);
});
test('Basic-KI geht um Mauern und hält das Bewegungsbudget ein', () => {
    const s=battle([actor('A','enemy',0,0,{control:'basic',weapons:{melee:{damage:'1d4'},ranged:null}}),actor('B','player',3,0)],{movementBase:2},{blocked:[{x:1,y:0},{x:1,y:1}]});
    const p=planBasicTurn(s); assert.equal(p.intent.type,'other'); assert(p.move);
    assert(E.pathDistances(s,s.actors[0].position,s.actors[0].id).get(`${p.move.x},${p.move.y}`)<=2);
    const {state}=resolveBasicTurn(s); assert.equal(state.rng.cursor,s.rng.cursor); assert.equal(state.turnSerial-s.turnSerial,1);
});
test('Unterstützende Basic-KI rettet einen erreichbaren bewusstlosen Ally zuerst', () => {
    const s=battle([actor('A','ally',0,0,{control:'basic',aiBehavior:'support'}),actor('B','enemy',4,4),actor('Down','player',1,0,{hp:0})]);
    assert.equal(planBasicTurn(s).intent.type,'stabilize');
    const {state}=resolveBasicTurn(s); assert.equal(state.actors[2].condition,'stabilized'); assert.equal(state.rng.cursor,s.rng.cursor);
});
test('Basic-KI vermeidet eigene Flächentreffer und kann stattdessen Nahkampf wählen', () => {
    const s=battle([actor('A','ally',0,0,{control:'basic',attackMode:'ranged',weapons:{melee:{damage:'1d4'},ranged:{damage:'1d20',radius:2}}}),actor('B','enemy',2,0),actor('Ally','player',2,1)]);
    assert.equal(planBasicTurn(s).intent.mode,'melee');
});
test('Basic-KI berücksichtigt kritischen Maximalschaden beim Schutz eigener Figuren', () => {
    const s=battle([actor('A','ally',0,0,{control:'basic',attackMode:'ranged',weapons:{melee:null,ranged:{damage:'1d4',radius:3}}}),actor('B','enemy',7,7),actor('Ally','player',7,4)],{natural20:true});
    const p=planBasicTurn(s); assert.equal(p.intent.type,'other'); assert.equal(p.move,null);
});
test('Ungültige Basic-KI-Platzierung lässt den Kampf vollständig unverändert', () => {
    const s=battle([actor('A','ally',0,0,{control:'basic'}),actor('B','enemy',4,4)]); s.actors[1].position=null;
    const before=E.clone(s); assert.throws(()=>resolveBasicTurn(s),/platzieren/); assert.deepEqual(s,before);
});
test('Sprachmodell kann Basic-KI und bestätigungspflichtige DM-Züge nicht ausführen', () => {
    for(const control of ['basic','dm']) {
        const s=battle([actor('A','ally',0,0,{control}),actor('B','enemy',1,0)]);
        assert.throws(()=>E.resolveAction(s,attack(s),{source:'model',roll:()=>{throw new Error('Rolled');}}),/Spielerbestätigung/);
    }
});
test('KI-Batch hält beim nächsten manuellen Zug an; Bewegung und Angriff sind gemeinsam rückgängig', async () => {
    let bundle={state:battle([actor('A','ally',0,0,{control:'basic'}),actor('B','enemy',4,4)]),history:[]}; const original=E.clone(bundle.state);
    const c=createController({key:()=>1,read:()=>bundle,write:b=>{bundle=b;},save:async()=>{}});
    const batch=await c.aiRun(); assert.equal(batch.count,1); assert.equal(E.currentActor(c.state()).name,'B'); assert(!c.aiRunning());
    assert.equal(bundle.history.length,1); await c.undo(); assert.deepEqual(c.state().actors,original.actors);
});
test('KI-Batch lässt sich abbrechen und blockiert während einer Modellantwort', async () => {
    let bundle={state:battle([actor('A','ally',0,0,{control:'basic'}),actor('B','enemy',4,4)]),history:[]};
    const c=createController({key:()=>1,read:()=>bundle,write:b=>{bundle=b;},save:async()=>{},modelBusy:()=>true});
    await assert.rejects(c.aiStep(),/abschließen/); assert.equal(bundle.history.length,0);
    const run=c.aiRun(); c.stopAI(); const r=await run; assert.equal(r.count,0); assert(!c.aiRunning());
});
test('Englische Kampfereignisse und Prompt verwenden englische Zustände und Erzählvorgabe', () => {
    const s=battle([actor('A','player',0,0),actor('B','enemy',1,0,{maxHp:10})],{language:'en'});
    const {state}=E.resolveAction(s,attack(s),{roll:rolls(10,16)});
    assert.match(state.log.at(-1).text,/Combat ended/); assert.match(state.log.at(-1).text,/unconscious/);
    assert.match(E.buildPrompt(state),/Narration language: English/); assert.match(E.eventText(state.log.at(-1),'de'),/Kampf beendet/);
});
test('Aktueller und nächster Zug nennen Namen, überspringen 0 HP und zeigen den Rundenwechsel', () => {
    let s=battle([actor('A','player',0,0),actor('B','enemy',1,0),actor('C','enemy',2,0),actor('Down','ally',3,0,{hp:0})]);
    s=E.editActor(s,s.actors[1].id,{hp:0}).state;
    assert.equal(E.turnOverview(s).current.name,'A'); assert.equal(E.turnOverview(s).next.name,'C');
    let step=E.resolveAction(s,{type:'other',actor:s.actors[0].id}); s=step.state;
    assert.match(E.resultText(step.result),/Jetzt am Zug: C \(Runde 1\).*Danach: A \(Runde 2\)/);
    assert.match(s.log.at(-1).text,/Jetzt am Zug: C/); assert.match(E.buildPrompt(s),/Current turn: C \(round 1\).*Next: A \(round 2\)/);
    step=E.resolveAction(s,{type:'other',actor:s.actors[2].id});
    assert.equal(step.result.initiative.current.name,'A'); assert.equal(step.result.initiative.current.round,2);
    assert.match(E.eventText(step.state.log.filter(e=>e.type==='other').at(-1),'en'),/Current turn: A \(round 2\)/);
});
