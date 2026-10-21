import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../engine.js';
import { planBasicTurn, resolveBasicTurn } from '../ai.js';
import { createController } from '../controller.js';

function battle(position = { x: 0, y: 2 }, options = {}) {
    let s = E.setRules(E.emptyState(), { rngMode: 'seeded', movementStat: 'none', ...options.rules }).state;
    s = E.setBoard(s, options.board ?? {}).state;
    const actors = [
        { name: 'Runner', side: 'player', position, initiative: 20, hp: 10, aiBehavior: 'cautious', control: 'basic', ...options.runner },
        { name: 'Enemy', side: 'enemy', position: { x: 8, y: 8 }, initiative: 10 },
        { name: 'Ally', side: 'ally', position: { x: 8, y: 7 }, initiative: 5 }
    ];
    for (const a of actors) s = E.addActor(s, { maxHp: 40, dc: 1, damage: '1d4', ...a }).state;
    return E.startCombat(s).state;
}
const flee = s => ({ type: 'flee', actor: E.currentActor(s).id, turn: E.turnToken(s) });
const forbiddenRoll = () => { throw new Error('Unexpected dice'); };

test('Flucht am Rand erhält HP, verbraucht genau einen Zug und entfernt Position und Angriffsziel', () => {
    const s = battle(), before = E.clone(s), { state, result } = E.resolveAction(s, flee(s), { roll: forbiddenRoll });
    assert(state.actors[0].escaped); assert.equal(state.actors[0].position, null); assert.equal(state.actors[0].hp, 10);
    assert.equal(state.turnSerial, s.turnSerial + 1); assert.deepEqual(state.rng, s.rng); assert.deepEqual(state.order, s.order);
    assert.equal(E.currentActor(state).name, 'Enemy'); assert.equal(E.turnOverview(state).next.name, 'Ally');
    assert(!E.canAttack(state, state.actors[1], state.actors[0], 'ranged'));
    assert.throws(() => E.resolveAction(state, { type: 'attack', actor: state.actors[1].id, target: state.actors[0].id, mode: 'ranged' }, { roll: forbiddenRoll }), /bereits geflohen/);
    assert.match(E.resultText(result, 'de'), /Runner ist geflohen von A3/); assert.match(E.resultText(result, 'en'), /Runner fled from A3/);
    assert.deepEqual(s, before);
});

test('Abgelehnte Flucht aus der Mitte und aus fremdem Zug verändert nichts und würfelt nicht', () => {
    const s = battle({ x: 4, y: 4 }), before = E.clone(s);
    assert(!E.canFlee(s, s.actors[0]));
    assert.throws(() => E.resolveAction(s, flee(s), { roll: forbiddenRoll }), /Randfeld/);
    assert.throws(() => E.resolveAction(s, { type: 'flee', actor: s.actors[1].id }, { roll: forbiddenRoll }), /am Zug/);
    assert.throws(() => E.resolveAction(s, { ...flee(s), hp: 999 }, { roll: forbiddenRoll }), /dürfen keine HP/);
    assert.deepEqual(s, before);
});

test('Geflohene werden in späteren Runden und taktischen Listen übersprungen', () => {
    const initial = battle(); let s = E.resolveAction(initial, flee(initial)).state;
    for (let i = 0; i < 2; i++) s = E.resolveAction(s, { type: 'other', actor: E.currentActor(s).id }).state;
    assert.equal(s.round, 2); assert.equal(E.currentActor(s).name, 'Enemy'); assert.equal(E.turnOverview(s).next.name, 'Ally');
    assert(E.tacticalRelations(s).every(v => v.name !== 'Runner'));
    assert.match(E.buildPrompt(s), /"escaped":true/); assert.match(E.buildPrompt(s), /escaped=true cannot act or be attacked/);
});

test('Flucht der letzten kampffähigen Seite beendet den Kampf mit HP und Geflohen-Status im Ausgang', () => {
    let s = battle(); s = E.removeActor(s, s.actors[2].id).state;
    const { state } = E.resolveAction(s, flee(s));
    assert.equal(state.phase, 'ended'); assert.equal(state.log.at(-1).type, 'end');
    assert.match(E.eventText(state.log.at(-1), 'de'), /Die Gegner haben gewonnen/);
    assert.match(E.eventText(state.log.at(-1), 'de'), /Runner \(Spieler\): 10\/40 HP — geflohen/);
    assert.match(E.eventText(state.log.at(-1), 'en'), /Runner \(player\): 10\/40 HP — fled/);
    assert.equal(E.turnOverview(state).current, null);
});

test('Vorsichtige Basic-KI flieht auch ohne Waffen bei exakt 25 % HP', () => {
    const s = battle({ x: 1, y: 2 }, { runner: { weapons: { melee: null, ranged: null } } });
    const plan = planBasicTurn(s); assert.equal(plan.intent.type, 'flee'); assert(plan.move); assert(E.isExit(s, plan.move));
    const { state, result } = resolveBasicTurn(s, { roll: forbiddenRoll });
    assert.equal(result.type, 'flee'); assert.equal(result.movement.from, 'B3'); assert.equal(state.actors[0].hp, 10); assert(state.actors[0].escaped);
    assert.match(E.eventText(state.log.find(e => e.type === 'flee'), 'en'), /Movement: B3 →/);
});

test('Rückzug braucht mehrere eigene Züge, beachtet Deckung und verbrauchtes Bewegungsbudget', () => {
    const s = battle({ x: 4, y: 4 }, { rules: { movementBase: 1 }, board: { cover: [{ x: 4, y: 3 }] } });
    const plan = planBasicTurn(s); assert.equal(plan.intent.type, 'other'); assert(plan.move); assert(!E.isCover(s, plan.move));
    assert.equal(E.pathDistances(s, s.actors[0].position, s.actors[0].id).get(`${plan.move.x},${plan.move.y}`), 1);
    let next = E.moveActor(s, s.actors[0].id, plan.move).state;
    const exhausted = planBasicTurn(next); assert.equal(exhausted.move, null); assert.equal(exhausted.intent.type, 'other');
    const result = resolveBasicTurn(s, { roll: forbiddenRoll }); next = result.state;
    assert(!next.actors[0].escaped); assert.equal(next.turnSerial, s.turnSerial + 1); assert.equal(result.result.type, 'other');
});

test('Vorsichtige KI kämpft oberhalb 25 % HP weiter und bei blockierten Ausgängen normal', () => {
    const healthy = battle({ x: 4, y: 4 }, { runner: { hp: 11 } });
    assert.equal(planBasicTurn(healthy).intent.type, 'attack');
    const blocked = [];
    for (let x = 0; x < 10; x++) for (let y = 0; y < 10; y++) if (!x || !y || x === 9 || y === 9) blocked.push({ x, y });
    const trapped = battle({ x: 4, y: 4 }, { board: { blocked } });
    assert.equal(planBasicTurn(trapped).intent.type, 'attack');
});

test('Aggressive und unterstützende KI fliehen nicht automatisch bei wenig HP', () => {
    for (const aiBehavior of ['aggressive', 'support']) assert.equal(planBasicTurn(battle({ x: 4, y: 4 }, { runner: { aiBehavior } })).intent.type, 'attack');
});

test('Vorsichtiger Gegner kann fliehen; die Spielergruppe gewinnt ohne künstlichen HP-Abzug', () => {
    const s = battle({ x: 0, y: 2 }, { runner: { side: 'enemy' } });
    s.actors[1].side = 'player'; const { state } = resolveBasicTurn(s, { roll: forbiddenRoll });
    assert.equal(state.phase, 'ended'); assert.equal(state.actors[0].hp, 10); assert.match(E.eventText(state.log.at(-1)), /Sieg der Spielergruppe/);
});

test('Bei deaktivierter Positionsprüfung sind manuelle und vorsichtige KI-Flucht sofort möglich', () => {
    const s = battle({ x: 4, y: 4 }, { rules: { boardEnabled: false } });
    assert.equal(planBasicTurn(s).intent.type, 'flee'); assert(E.canFlee(s, s.actors[0]));
    assert(E.resolveAction(s, flee(s), { roll: forbiddenRoll }).state.actors[0].escaped);
});

test('Fluchtzustand bleibt im Export erhalten und zurückgeholte Figuren können neu platziert werden', () => {
    const s = battle(); const escaped = E.resolveAction(s, flee(s)).state;
    const restored = E.validateState(JSON.parse(JSON.stringify(escaped))); assert(restored.actors[0].escaped); assert.equal(restored.actors[0].position, null);
    assert.throws(() => E.moveActor(restored, restored.actors[0].id, { x: 0, y: 0 }, true), /zurückholen/);
    const returned = E.returnActor(restored, restored.actors[0].id).state; assert(!returned.actors[0].escaped); assert.equal(returned.actors[0].position, null);
    assert.deepEqual(E.moveActor(returned, returned.actors[0].id, { x: 0, y: 0 }).state.actors[0].position, { x: 0, y: 0 });
    const invalid = E.clone(restored); invalid.actors[0].position = { x: 0, y: 0 }; assert.throws(() => E.validateState(invalid), /Feldposition/);
    invalid.actors[0].position = null; invalid.actors[0].escaped = 'false'; assert.throws(() => E.validateState(invalid), /Boolean/);
});

test('Controller Undo stellt einen geflohenen Akteur samt HP und Position wieder her; Vorlagen starten im Kampf', async () => {
    let bundle = { state: battle(), history: [] }; const before = E.clone(bundle.state), library = [];
    const c = createController({ key: () => 'one', read: () => bundle, write: b => { bundle = b; }, save: async () => {}, library: () => library, saveTemplate: async a => library.push(a) });
    await c.aiStep({ roll: forbiddenRoll }); assert(c.state().actors[0].escaped); assert.equal(c.historyLength(), 1);
    await c.saveTemplate(c.state().actors[0].id); await c.loadTemplate(library[0].id);
    assert(!c.state().actors.at(-1).escaped); assert.equal(c.state().actors.at(-1).hp, 40);
    await c.undo(); await c.undo(); assert.deepEqual(c.state().actors[0], before.actors[0]); assert.equal(c.state().phase, 'active');
});
