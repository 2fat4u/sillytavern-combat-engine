import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../engine.js';
import { planBasicTurn, resolveBasicTurn } from '../ai.js';
function corridor(budget = 3, twoCovers = false) {
    let s = E.setRules(E.emptyState(), { movementStat:'none', movementBase:budget, rngMode:'seeded' }).state;
    s = E.setBoard(s, { width:6,height:2,blocked:Array.from({length:6},(_,x)=>({x,y:1})),cover:[{x:1,y:0},...(twoCovers?[{x:2,y:0}]:[])] }).state;
    s = E.addActor(s, { name:'A',side:'player',hp:10,maxHp:40,control:'basic',initiative:20,weapons:{melee:{damage:'1d4'},ranged:null},position:{x:0,y:0} }).state;
    s = E.addActor(s, { name:'B',side:'enemy',maxHp:100,dc:1,position:{x:4,y:0} }).state;
    return E.startCombat(s).state;
}

test('Deckung übersteigen kostet 2 plus Landung 1; manuelle Bewegung kann niemals auf Deckung enden', () => {
    const s = corridor(), before=E.clone(s), paths=E.pathDistances(s,s.actors[0].position,s.actors[0].id);
    assert.equal(paths.get('1,0'),2); assert.equal(paths.get('2,0'),3); assert(!E.reachable(s,s.actors[0].position,{x:1,y:0},s.actors[0].id));
    const moved=E.moveActor(s,s.actors[0].id,{x:2,y:0}).state; assert.equal(E.movementBudget(moved,moved.actors[0]).remaining,0);
    assert.throws(()=>E.moveActor(s,s.actors[0].id,{x:1,y:0}),/nicht betretbar/);
    const short=corridor(2); assert.throws(()=>E.moveActor(short,short.actors[0].id,{x:2,y:0}),/3 Bewegungspunkte erforderlich/);
    assert.deepEqual(s,before);
});

test('Mehrere Deckungsfelder kosten jeweils 2 und müssen im selben Zug vollständig überquert werden', () => {
    const s=corridor(5,true); assert.equal(E.pathDistances(s,s.actors[0].position,s.actors[0].id).get('3,0'),5);
    assert.equal(E.moveActor(s,s.actors[0].id,{x:3,y:0}).state.movement.spent,5);
    const short=corridor(4,true); assert.throws(()=>E.moveActor(short,short.actors[0].id,{x:3,y:0}),/5 Bewegungspunkte/);
});

test('Basic-KI landet bei knappem Budget vor oder hinter Deckung, ohne Stillstand auf einem Hindernis', () => {
    const s=corridor(3), plan=planBasicTurn(s); assert.deepEqual(plan.move,{x:2,y:0}); assert.equal(plan.intent.type,'other');
    const {state}=resolveBasicTurn(s); assert.deepEqual(state.actors[0].position,{x:2,y:0});
    for(const budget of [1,2]) { const tooShort=corridor(budget); assert.equal(planBasicTurn(tooShort).move,null); }
    const two=corridor(4,true); assert.equal(planBasicTurn(two).move,null);
    const enough=corridor(5,true); assert.deepEqual(planBasicTurn(enough).move,{x:3,y:0});
});

test('KI plant bei nicht finanzierbarer Überquerung einen Umweg statt jede Runde vor Deckung zu warten', () => {
    let s=E.setBoard(corridor(2),{blocked:[]}).state;
    const plan=planBasicTurn(s); assert(plan.move); assert(!E.isCover(s,plan.move));
    assert(E.pathDistances(s,s.actors[0].position,s.actors[0].id,2).has(`${plan.move.x},${plan.move.y}`));
    const path=E.movementPaths(s,s.actors[0].position,s.actors[0].id,2).pathTo({x:3,y:0});
    assert(path.every(p=>!E.isCover(s,p)));
});

test('Gewichtete Suche bevorzugt günstigeren Weg und kann Übersteigen abschalten oder alte betretbare Deckung bewahren', () => {
    let s=E.setBoard(corridor(3),{blocked:[]}).state;
    const paths=E.pathDistances(s,s.actors[0].position,s.actors[0].id); assert.equal(paths.get('2,0'),3);
    const blocked=E.setRules(s,{coverCrossable:false}).state; assert(!E.pathDistances(blocked,blocked.actors[0].position,blocked.actors[0].id).has('1,0'));
    const old=E.setRules(s,{coverWalkable:true}).state; assert.equal(E.pathDistances(old,old.actors[0].position,old.actors[0].id).get('2,0'),2);
    assert(E.canOccupy(old,{x:1,y:0}));
});

function dm() {
    let s=E.setRules(E.emptyState(),{movementStat:'none'}).state;
    for(const a of [
        {name:'DM actor',side:'ally',control:'dm',initiative:20,position:{x:1,y:3}},
        {name:'Hidden',side:'enemy',position:{x:3,y:3}},
        {name:'Visible',side:'enemy',position:{x:1,y:7}},
        {name:'Far',side:'enemy',position:{x:9,y:9}}
    ]) s=E.addActor(s,{maxHp:50,range:5,...a}).state;
    s=E.setBoard(s,{blocked:[{x:2,y:3}],cover:[{x:1,y:5}]}).state;
    return E.startCombat(s).state;
}

test('DM erhält nächstes legales Fernziel samt Koordinaten, Reichweite und Sichtlinie statt näherem verdecktem Gegner', () => {
    const s=dm(), hints=E.tacticalTargets(s);
    assert.equal(hints.nearestLegalRangedTarget.name,'Visible'); assert.equal(hints.nearestLegalRangedTarget.coordinate,'B8');
    assert(hints.nearestLegalRangedTarget.lineOfSight); assert(hints.nearestLegalRangedTarget.cover); assert.equal(hints.nearestLegalMeleeTarget,null);
    assert.match(E.buildPrompt(s),/CURRENT ACTOR TARGET GUIDANCE/); assert.match(E.buildPrompt(s),/"nearestLegalRangedTarget":\{"id"/);
});

test('Nahkampfhinweis nennt einen freien Angriffspunkt mit echten Bewegungskosten und fordert Spielerbewegung zuerst', () => {
    const s=dm(), hints=E.tacticalTargets(s), approach=hints.nearestMeleeApproach;
    assert(approach); assert(approach.playerMustMoveFirst); assert(approach.movementCost>0);
    assert.equal(approach.reachableThisTurn,approach.movementCost<=3);
    const target=s.actors.find(a=>a.id===approach.target.id);
    const label=approach.attackFrom, p={x:label.charCodeAt(0)-65,y:Number(label.slice(1))-1};
    assert(E.canOccupy(s,p)); assert(E.canAttack(s,s.actors[0],target,'melee',p));
    assert.equal(E.movementPaths(s,s.actors[0].position,s.actors[0].id,3).costs.get(`${p.x},${p.y}`),approach.movementCost);
    assert.match(E.buildPrompt(s),/never resolve its attack from the old position/);
});

test('DM-Hinweise respektieren fehlende Waffen, 0 HP, Flucht und abgeschaltete Positionsfreigabe', () => {
    let s=dm(); s=E.editActor(s,s.actors[0].id,{weapons:{melee:null,ranged:{damage:'1d6'}}}).state;
    let hints=E.tacticalTargets(s); assert(!hints.meleeWeapon); assert.equal(hints.nearestMeleeApproach,null);
    s=E.editActor(s,s.actors[2].id,{escaped:true,position:null}).state;
    assert.equal(E.tacticalTargets(s).nearestLegalRangedTarget,null);
    s=E.editActor(s,s.actors[0].id,{weapons:{melee:{damage:'1d6'},ranged:null}}).state;
    assert(!E.tacticalTargets(s).rangedWeapon); assert.equal(E.tacticalTargets(s).nearestLegalRangedTarget,null);
    s=E.setRules(s,{sharePositions:false}).state; assert(!E.buildPrompt(s).includes('CURRENT ACTOR TARGET GUIDANCE'));
});
