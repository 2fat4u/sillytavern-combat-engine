import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../engine.js';
import { planBasicTurn, resolveBasicTurn } from '../ai.js';
import { createController } from '../controller.js';

function encounter(board = {}, rules = {}) {
    let s = E.setRules(E.setBoard(E.emptyState(), board).state, { movementStat: 'none', rngMode: 'seeded', ...rules }).state;
    for (const a of [
        { name: 'A', side: 'player', initiative: 20, position: { x: 0, y: 0 }, control: 'basic', weapons: { melee: { damage: '1d4' }, ranged: null } },
        { name: 'B', side: 'enemy', initiative: 10, position: { x: 4, y: 0 } },
        { name: 'C', side: 'ally', initiative: 5, position: { x: 4, y: 4 }, hp: 0 }
    ]) s = E.addActor(s, { maxHp: 50, dc: 5, ...a }).state;
    return E.startCombat(s).state;
}

test('Niedrige Deckung ist standardmäßig unbetretbar: Platzierung, GM-Korrektur und Geländeänderung', () => {
    const s = encounter({ cover: [{ x: 1, y: 0 }] }), before = E.clone(s);
    assert.equal(s.rules.coverWalkable, false);
    for (const override of [false, true]) assert.throws(() => E.moveActor(s, s.actors[0].id, { x: 1, y: 0 }, override), /nicht betretbar/);
    assert.throws(() => E.addActor(s, { name: 'New', position: { x: 1, y: 0 } }), /nicht betretbar/);
    assert.throws(() => E.setBoard(s, { cover: [{ x: 0, y: 0 }] }), /nicht betretbar/);
    assert.deepEqual(s, before);
});

test('Ohne Übersteigen umgehen Wege Deckung und schneiden keine Deckungsecken; Sicht bleibt frei', () => {
    const s = encounter({ cover: [{ x: 1, y: 0 }] }, { coverCrossable:false });
    const costs = E.pathDistances(s, s.actors[0].position, s.actors[0].id);
    assert(!costs.has('1,0')); assert.equal(costs.get('1,1'), 2); assert.equal(costs.get('2,0'), 4);
    assert(!E.canStep(s, { x: 0, y: 0 }, { x: 1, y: 1 }));
    assert(E.clearSight(s, { x: 0, y: 0 }, { x: 1, y: 1 }));
    assert.throws(() => E.moveActor(s, s.actors[0].id, { x: 2, y: 0 }), /Bewegung zu weit/);
    const moved = E.moveActor(s, s.actors[0].id, { x: 1, y: 1 }).state;
    assert.equal(E.movementBudget(moved, moved.actors[0]).remaining, 1);
});

for (const side of ['player', 'ally', 'enemy']) test(`Fernschüsse über unbetretbare Deckung schützen dahinterstehende Ziele für ${side}`, () => {
    let s = E.setBoard(E.emptyState(), { cover: [{ x: 2, y: 0 }] }).state;
    s = E.addActor(s, { name: 'Shooter', side, damage: '1d20', position: { x: 0, y: 0 }, initiative: 20 }).state;
    s = E.addActor(s, { name: 'Target', side: side === 'enemy' ? 'player' : 'enemy', maxHp: 40, dc: 1, position: { x: 4, y: 0 } }).state;
    s = E.startCombat(s).state;
    const seq = [10, 16], { result } = E.resolveAction(s, { type: 'attack', actor: s.actors[0].id, target: s.actors[1].id, mode: 'ranged' }, { roll: () => seq.shift() });
    assert.equal(result.damage, 8); assert.equal(result.cover, true); assert(!E.isCover(s, s.actors[1].position));
});

test('Basic-KI umgeht niedrige Deckung mit dem echten Wegbudget und protokolliert von → nach', () => {
    const s = encounter({ cover: [{ x: 1, y: 0 }, { x: 1, y: 1 }] }, { movementBase: 2 });
    const plan = planBasicTurn(s); assert(plan.move); assert.equal(plan.intent.type, 'other');
    const { state, result } = resolveBasicTurn(s);
    assert(!E.isCover(state, state.actors[0].position));
    assert(E.pathDistances(s, s.actors[0].position, s.actors[0].id).get(`${plan.move.x},${plan.move.y}`) <= 2);
    assert.deepEqual(result.movement, { from: 'A1', to: E.coordinate(plan.move) });
    const event = state.log.find(e => e.type === 'other' && e.details.actorName === 'A');
    assert.deepEqual(event.details.movement, result.movement);
    assert.match(E.eventText(event, 'de'), /Bewegung: A1 →/); assert.match(E.eventText(event, 'en'), /Movement: A1 →/);
    assert.match(E.buildPrompt(state), /Movement:|Bewegung:/);
    assert.equal(state.turnSerial, s.turnSerial + 1); assert.deepEqual(state.rng, s.rng);
});

test('Betretbare Deckung bleibt wählbar; Ausschalten bei belegter Deckung wird atomar abgelehnt', () => {
    let s = E.setRules(encounter({ cover: [{ x: 1, y: 0 }] }), { coverWalkable: true }).state;
    s = E.moveActor(s, s.actors[0].id, { x: 1, y: 0 }).state; const before = E.clone(s);
    assert.throws(() => E.setRules(s, { coverWalkable: false }), /nicht betretbar/); assert.deepEqual(s, before);
    s = E.moveActor(s, s.actors[0].id, { x: 0, y: 0 }).state;
    s = E.setRules(s, { coverWalkable: false }).state; assert.equal(s.rules.coverWalkable, false);
});

test('Update alter Kämpfe erhält belegte Deckung und ungeänderte HP, Positionen und Würfel', () => {
    let old = E.setRules(encounter(), { coverWalkable: true }).state;
    old = E.setBoard(old, { cover: [{ x: 0, y: 0 }] }).state; delete old.rules.coverWalkable; delete old.rules.sideDefaults;
    const updated = E.validateState(old);
    assert.equal(updated.rules.coverWalkable, true); assert.deepEqual(updated.actors, old.actors); assert.deepEqual(updated.rng, old.rng);
    assert.equal(updated.turnSerial, old.turnSerial); assert.equal(updated.order[updated.turn], old.order[old.turn]);
    assert.deepEqual(E.validateState(JSON.parse(JSON.stringify(updated))), updated);
    const unoccupied = E.clone(old); unoccupied.board.cover = [{ x: 2, y: 0 }];
    assert.equal(E.validateState(unoccupied).rules.coverWalkable, false);
    const explicit = E.clone(old); explicit.rules.coverWalkable = false;
    assert.throws(() => E.validateState(explicit), /nicht betretbar/);
});

test('KI-Kontext beschreibt Deckung abhängig von der Regel und nennt die Landschaft', () => {
    const s = E.randomBoard(encounter(), { preset: 'city', seed: 'context' }).state;
    assert.match(E.buildPrompt(s), /Terrain type: city/); assert.match(E.buildPrompt(s), /never finish movement on it/);
    assert.match(E.buildPrompt(E.setRules(s, { coverWalkable: true }).state), /Cover is passable terrain/);
});

for (const preset of ['open', 'forest', 'city', 'indoor']) test(`${preset}: reproduzierbare Karten auf 2×2, 10×10 und 50×50 erhalten Figuren und freie Wege`, () => {
    for (const size of [2, 10, 50]) {
        let s = E.setBoard(E.emptyState(), { width: size, height: size }).state;
        s = E.addActor(s, { name: 'A', side: 'player', position: { x: 0, y: 0 } }).state;
        s = E.addActor(s, { name: 'B', side: 'enemy', position: { x: size - 1, y: size - 1 } }).state;
        const a = E.randomBoard(s, { preset, seed: 'landscape' }).state, b = E.randomBoard(s, { preset, seed: 'landscape' }).state;
        assert.deepEqual(a.board, b.board); assert.equal(a.board.preset, preset); assert.equal(a.board.mapSeed, 'landscape');
        assert.deepEqual(a.actors, s.actors); assert.deepEqual(a.rng, s.rng); assert.equal(a.turnSerial, s.turnSerial);
        const paths = E.pathDistances({ ...a, actors: [] }, a.actors[0].position, '');
        assert(paths.has(`${size - 1},${size - 1}`));
        assert.deepEqual(E.validateState(JSON.parse(JSON.stringify(a))).board, a.board);
    }
});

test('Kartenvarianten unterscheiden sich: Stadt hat rechteckige Blöcke, offene Fläche wenig Gelände', () => {
    const s = E.setBoard(E.emptyState(), { width: 20, height: 20 }).state;
    const maps = Object.fromEntries(['open', 'forest', 'city'].map(preset => [preset, E.randomBoard(s, { preset, seed: 'patterns' }).state]));
    assert(maps.open.board.blocked.length + maps.open.board.cover.length < maps.forest.board.blocked.length + maps.forest.board.cover.length);
    assert(maps.city.board.blocked.length > maps.forest.board.blocked.length);
    assert(maps.city.board.blocked.some(p => [{ x: p.x + 1, y: p.y }, { x: p.x, y: p.y + 1 }, { x: p.x + 1, y: p.y + 1 }].every(q => E.isBlocked(maps.city, q))));
    assert.notDeepEqual(maps.forest.board, E.randomBoard(s, { preset: 'forest', seed: 'another' }).state.board);
    assert.throws(() => E.randomBoard(s, { preset: 'not-a-map' }), /Kartentyp/);
});

test('Innenraum enthält Möbelgruppen, Randmauern und erreichbare Türen mit niedriger Deckung', () => {
    const s = E.randomBoard(E.setBoard(E.emptyState(), { width: 20, height: 20 }).state, { preset: 'indoor', seed: 'furniture' }).state;
    assert(E.isBlocked(s, { x: 0, y: 0 })); assert(s.board.blocked.some(p => p.x > 0 && p.x < 19 && p.y > 0 && p.y < 19));
    assert(s.board.cover.some(p => [{ x: p.x + 1, y: p.y }, { x: p.x, y: p.y + 1 }, { x: p.x + 1, y: p.y + 1 }].every(q => E.isCover(s, q))));
    const paths = E.pathDistances(s, { x: 10, y: 10 }, '');
    for (const p of [{ x: 10, y: 0 }, { x: 10, y: 19 }, { x: 0, y: 10 }, { x: 19, y: 10 }]) {
        assert(paths.has(`${p.x},${p.y}`)); assert(!E.isBlocked(s,p)); assert(!E.isCover(s,p));
    }
});

test('Gruppensteuerung ändert nur gewählte Seiten samt 0-HP-Figuren, ohne Kampfzahlen oder Zug zu verändern', () => {
    const s = encounter(), before = E.clone(s);
    const { state } = E.setGroupControls(s, { player: { control: 'manual', aiBehavior: 'support' }, ally: { control: 'basic', aiBehavior: 'support' } });
    assert.equal(state.actors[0].control, 'manual'); assert.equal(state.actors[2].control, 'basic'); assert.equal(state.actors[2].aiBehavior, 'support');
    assert.deepEqual(state.actors[1], s.actors[1]);
    for (let i = 0; i < s.actors.length; i++) assert.deepEqual({ ...state.actors[i], control: s.actors[i].control, aiBehavior: s.actors[i].aiBehavior }, s.actors[i]);
    for (const key of ['round', 'turn', 'turnSerial', 'rng', 'movement', 'order']) assert.deepEqual(state[key], s[key]);
    assert.deepEqual(s, before); assert.match(E.eventText(state.log.at(-1), 'en'), /2 participants/);
    for (const groups of [{ enemies: { control: 'basic' } }, { enemy: { control: 'invalid' } }, {}]) assert.throws(() => E.setGroupControls(s, groups));
    assert.deepEqual(s, before);
});

test('Neue Figuren und Chat-Importe verwenden Gruppenvorgaben; ausdrücklich gewählte Steuerung bleibt erhalten', () => {
    const s = E.setGroupControls(E.emptyState(), { enemy: { control: 'basic', aiBehavior: 'support' } }).state;
    const added = E.addActor(s, { name: 'New', side: 'enemy' }).state.actors[0]; assert.equal(added.control, 'basic'); assert.equal(added.aiBehavior, 'support');
    const manual = E.addActor(s, { name: 'Manual', side: 'enemy', control: 'manual', aiBehavior: 'aggressive' }).state.actors[0]; assert.equal(manual.control, 'manual');
    const rows = E.parseRosterBlock('```combat-roster\n[{"name":"From chat","side":"enemy"},{"name":"Explicit","side":"enemy","control":"dm"}]\n```');
    assert.equal(E.addActor(s, rows[0]).state.actors[0].control, 'basic'); assert.equal(E.addActor(s, rows[1]).state.actors[0].control, 'dm');
    const exported = E.validateState(JSON.parse(JSON.stringify(s)));
    assert.equal(E.addActor(exported, { name: 'Persisted', side: 'enemy' }).state.actors[0].control, 'basic');
});

test('Gruppensteuerung ist eine rückgängig machbare Controller-Aktion, auch bei mehreren Seiten', async () => {
    let bundle = { state: encounter(), history: [] }; const before = E.clone(bundle.state);
    const c = createController({ key: () => 'test', read: () => bundle, write: b => { bundle = b; }, save: async () => {} });
    await c.groups({ player: { control: 'dm', aiBehavior: 'aggressive' }, enemy: { control: 'basic', aiBehavior: 'support' } });
    assert.equal(c.historyLength(), 1); assert.equal(c.state().actors[0].control, 'dm'); assert.equal(c.state().actors[1].control, 'basic');
    await c.undo(); assert.deepEqual(c.state().actors, before.actors); assert.deepEqual(c.state().rules.sideDefaults, before.rules.sideDefaults);
});
