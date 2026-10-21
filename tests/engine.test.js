import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../engine.js';

function encounter(patch = {}, enemyPatch = {}, boardEnabled = true) {
    let s = E.emptyState();
    s = E.addActor(s, { name: 'Held', side: 'player', maxHp: 30, stats: { strength: 14, dexterity: 18 }, attackBonus: 2, damage: '1d8', damageBonus: 3, initiative: 20, position: { x: 0, y: 0 }, ...patch }).state;
    s = E.addActor(s, { name: 'Goblin', side: 'enemy', maxHp: 25, dc: 15, initiative: 5, position: { x: 1, y: 1 }, ...enemyPatch }).state;
    s.rules.boardEnabled = boardEnabled;
    return E.startCombat(s).state;
}
const attack = s => ({ type: 'attack', actor: s.actors[0].id, target: s.actors[1].id, turn: E.turnToken(s) });
function sequence(...values) { return sides => { const v = values.shift(); assert(v <= sides); assert(v > 0); return v; }; }

test('Treffer verwendet höheren STR/DEX-Modifikator, Trefferbonus und separaten Schaden', () => {
    const s = encounter(), before = E.clone(s);
    const { state, result } = E.resolveAction(s, attack(s), { roll: sequence(9, 7) });
    assert.equal(result.stat, 'dexterity'); assert.equal(result.total, 15); assert.equal(result.hit, true);
    assert.equal(result.damage, 10); assert.equal(state.actors[1].hp, 15);
    assert.equal(E.currentActor(state).name, 'Goblin'); assert.deepEqual(s, before);
});
test('Fehlschlag würfelt keinen Schaden und verändert keine HP', () => {
    const s = encounter(); let calls = 0;
    const r = E.resolveAction(s, attack(s), { roll: () => { calls++; return 2; } });
    assert.equal(calls, 1); assert.equal(r.result.hit, false); assert.equal(r.result.damage, 0);
    assert.equal(r.state.actors[1].hp, 25); assert.deepEqual(r.result.damageRolls, []);
});
test('Andere Attribute und negative Trefferboni sind möglich', () => {
    const s = encounter({ attackBonus: -2, stats: { intelligence: 20 } });
    const r = E.resolveAction(s, { ...attack(s), stat: 'intelligence' }, { roll: sequence(12, 1) });
    assert.equal(r.result.total, 15); assert.equal(r.result.stat, 'intelligence');
});
test('Schaden kann nie heilen; HP unterschreiten 0 nicht', () => {
    const s = encounter({ damage: '1d4-20', damageBonus: -3 });
    const r = E.resolveAction(s, attack(s), { roll: sequence(20, 1) });
    assert.equal(r.result.damage, 0); assert.equal(r.state.actors[1].hp, 25);
    const t = encounter({ damage: '2d100', damageBonus: 100 });
    const dead = E.resolveAction(t, attack(t), { roll: sequence(20, 100, 100) });
    assert.equal(dead.state.actors[1].hp, 0); assert.equal(dead.state.phase, 'ended');
});
test('Gleichstand-Regel und natürliche 1/20 sind konfigurierbar', () => {
    let s = E.setRules(encounter(), { hitEqual: false }).state;
    assert.equal(E.resolveAction(s, attack(s), { roll: sequence(9) }).result.hit, false);
    s = E.setRules(s, { natural20: true }).state;
    const crit = E.resolveAction(s, attack(s), { roll: sequence(20, 5, 6) }).result;
    assert.equal(crit.critical, true); assert.equal(crit.damage, 14);
    const t = E.setRules(encounter({}, { dc: 0 }), { natural20: true }).state;
    assert.equal(E.resolveAction(t, attack(t), { roll: sequence(1) }).result.hit, false);
});
test('Attributbonus im Schaden ist optional', () => {
    const s = E.setRules(encounter(), { damageAbility: true }).state;
    assert.equal(E.resolveAction(s, attack(s), { roll: sequence(20, 5) }).result.damage, 12);
});
test('Klassische Würfel bis W100, mehrere Würfel und Formelboni', () => {
    for (const d of E.DICE) assert.equal(E.parseDice(`2w${d}+3`).sides, d);
    assert.equal(E.parseDice('3d6-2').bonus, -2);
    for (const bad of ['0d6', '51d6', '1d2', '1d101', '1d6;alert(1)', 'Infinity', '2d6+1d4']) assert.throws(() => E.parseDice(bad));
});
test('Falscher Zug, eigenes Ziel und LM-Zahlenänderungen würfeln nicht', () => {
    const s = encounter(), before = E.clone(s); let calls = 0;
    for (const intent of [ { ...attack(s), actor: s.actors[1].id }, { ...attack(s), target: s.actors[0].id },
        { ...attack(s), dc: 1 }, { ...attack(s), damage: '50d100' }, { ...attack(s), hp: 100 }, { ...attack(s), position: { x: 2, y: 2 } },
        { ...attack(s), turn: 'turn-old' } ]) assert.throws(() => E.resolveAction(s, intent, { roll: () => { calls++; return 20; } }));
    assert.equal(calls, 0); assert.deepEqual(s, before);
});
test('Sonstige Aktion beendet den Zug ohne numerischen Effekt', () => {
    const s = encounter();
    const r = E.resolveAction(s, { type: 'other', actor: s.actors[0].id, description: 'Deckung suchen' });
    assert.equal(r.state.actors[0].hp, 30); assert.equal(r.state.actors[1].hp, 25);
    assert.equal(r.state.rng.cursor, s.rng.cursor); assert.equal(E.currentActor(r.state).name, 'Goblin');
});
test('Initiative bleibt fest, Rundenzähler steigt nach letztem Zug', () => {
    let s = encounter(); const order = [...s.order];
    s = E.resolveAction(s, { type: 'other', actor: E.currentActor(s).id }).state;
    s = E.editActor(s, s.actors[1].id, { initiative: 90 }).state;
    assert.deepEqual(s.order, order);
    s = E.resolveAction(s, { type: 'other', actor: E.currentActor(s).id }).state;
    assert.equal(s.round, 2); assert.equal(E.currentActor(s).name, 'Held');
});
test('Gleichstände sind stabil und neue Teilnehmer kommen hinten hinzu', () => {
    let s = encounter({ initiative: 5 });
    assert.equal(E.currentActor(s).name, 'Held');
    s = E.addActor(s, { name: 'Später Ally', side: 'ally', initiative: 100 }).state;
    assert.equal(s.order.at(-1), s.actors.at(-1).id);
    const before = E.currentActor(s).id;
    s = E.setOrder(s, [...s.order].reverse()).state;
    assert.equal(E.currentActor(s).id, before);
});
test('Kampfunfähige Figuren werden übersprungen', () => {
    let s = encounter();
    s = E.addActor(s, { name: 'Ausgefallen', side: 'ally', hp: 0 }).state;
    s = E.resolveAction(s, { type: 'other', actor: E.currentActor(s).id }).state;
    s = E.resolveAction(s, { type: 'other', actor: E.currentActor(s).id }).state;
    assert.equal(E.currentActor(s).name, 'Held'); assert.equal(s.round, 2);
});
test('Nahkampf diagonal erlaubt, Entfernung >1 wird vor Würfeln abgewiesen', () => {
    const s = encounter(); assert.equal(E.distance(s.actors[0].position, s.actors[1].position), 1);
    const far = E.moveActor(s, s.actors[1].id, { x: 5, y: 5 }, true).state;
    let calls = 0;
    assert.throws(() => E.resolveAction(far, attack(far), { roll: () => { calls++; return 20; } }), /Nachbarfeld/);
    assert.equal(calls, 0); assert.equal(far.turn, 0);
});
test('Beliebige Spielfeldgröße 2 bis 50, Koordinaten über Z hinaus', () => {
    let s = E.setBoard(E.emptyState(), { width: 50, height: 30 }).state;
    s = E.addActor(s, { position: { x: 49, y: 29 } }).state;
    assert.equal(E.coordinate(s.actors[0].position), 'AX30');
    assert.equal(E.coordinate({ x: 26, y: 0 }), 'AA1');
    assert.throws(() => E.setBoard(s, { width: 10 }));
    assert.throws(() => E.setBoard(s, { height: 51 }));
    assert.throws(() => E.setBoard(s, { width: 1 }));
});
test('Gesperrte Felder können nicht belegt werden; belegte Felder nicht gesperrt', () => {
    let s = encounter();
    assert.throws(() => E.setBoard(s, { blocked: [{ x: 0, y: 0 }] }));
    s = E.setBoard(s, { blocked: [{ x: 2, y: 2 }] }).state;
    assert.throws(() => E.moveActor(s, s.actors[0].id, { x: 2, y: 2 }, true));
    assert.throws(() => E.addActor(s, { position: { x: 2, y: 2 } }));
});
test('Bewegung nur im eigenen Zug, kein Durchqueren unpassierbarer Mauern', () => {
    let s = encounter({}, { position: { x: 9, y: 9 } });
    s = E.setBoard(s, { blocked: Array.from({ length: 10 }, (_, y) => ({ x: 2, y })) }).state;
    assert.throws(() => E.moveActor(s, s.actors[0].id, { x: 4, y: 0 }), /Kein freier Weg/);
    assert.equal(E.moveActor(s, s.actors[0].id, { x: 4, y: 0 }, true).state.actors[0].position.x, 4);
    assert.throws(() => E.moveActor(s, s.actors[1].id, { x: 8, y: 9 }), /am Zug/);
});
test('Diagonal durch Mauerecken ist blockiert, auch für Nahkampfangriff', () => {
    const s = E.setBoard(encounter(), { blocked: [{ x: 1, y: 0 }] }).state;
    assert.throws(() => E.resolveAction(s, attack(s)), /Hindernis/);
});
test('Fernkampf prüft Reichweite und Sichtlinie; Angriffsart ist pro Aktion wählbar', () => {
    let s = encounter({ attackMode: 'ranged', range: 3 }, { position: { x: 3, y: 0 } });
    assert.equal(E.resolveAction(s, attack(s), { roll: sequence(20, 2) }).result.hit, true);
    s = E.setBoard(s, { blocked: [{ x: 2, y: 0 }] }).state;
    assert.throws(() => E.resolveAction(s, attack(s)), /Hindernis/);
    const far = E.moveActor(s, s.actors[1].id, { x: 5, y: 0 }, true).state;
    assert.throws(() => E.resolveAction(far, attack(far)), /Reichweite/i);
    const melee = encounter(); assert.equal(E.resolveAction(melee, { ...attack(melee), mode: 'ranged' }, { roll: sequence(20, 2) }).result.mode, 'ranged');
    const ranged = encounter({ attackMode: 'ranged' }); assert.equal(E.resolveAction(ranged, { ...attack(ranged), mode: 'melee' }, { roll: sequence(20, 2) }).result.mode, 'melee');
    assert.equal(melee.actors[0].attackMode, 'melee');
});
test('Reichweitenprüfung lässt sich deaktivieren', () => {
    let s = encounter();
    s = E.moveActor(s, s.actors[0].id, null, true).state;
    assert.throws(() => E.resolveAction(s, attack(s)), /platzieren/);
    s = E.setRules(s, { boardEnabled: false }).state;
    assert.equal(E.resolveAction(s, attack(s), { roll: sequence(20, 3) }).result.hit, true);
});
test('Näheübersicht enthält Koordinaten, Entfernungen und legale Ziele', () => {
    const s = encounter(); const relation = E.tacticalRelations(s)[0];
    assert.equal(relation.coordinate, 'A1'); assert.equal(relation.nearestOpponents[0].coordinate, 'B2');
    assert.equal(relation.nearestOpponents[0].distance, 1); assert.equal(relation.nearestOpponents[0].attackPossible, true);
    assert.equal(relation.adjacent.length, 1);
});
test('Prompt verrät keinen Seed und Positionsweitergabe lässt sich abschalten', () => {
    let s = E.setRules(encounter(), { seed: 'SECRET-EXAMPLE-SEED', rngMode: 'seeded' }).state;
    const prompt = E.buildPrompt(s);
    assert(!prompt.includes('SECRET-EXAMPLE-SEED')); assert(prompt.includes('Tactical overview')); assert(prompt.includes('B2'));
    s = E.setRules(s, { sharePositions: false }).state;
    assert(!E.buildPrompt(s).includes('Tactical overview')); assert(!E.buildPrompt(s).includes('B2'));
});
test('Reproduzierbare Würfel über Export und Import', () => {
    const s = E.setRules(encounter(), { rngMode: 'seeded', seed: 'test-abc' }).state;
    const r = E.resolveAction(s, attack(s));
    const copy = E.validateState(JSON.parse(JSON.stringify(s)));
    const r2 = E.resolveAction(copy, attack(copy));
    assert.deepEqual(r.result, r2.result); assert.equal(r.state.rng.cursor, r2.state.rng.cursor);
});
test('Ein Receipt kann nicht doppelt schaden', () => {
    const s = encounter(); const r = E.resolveAction(s, attack(s), { roll: sequence(20, 2), receipt: 'one' });
    const dupe = E.resolveAction(r.state, attack(s), { receipt: 'one' });
    assert.equal(dupe.state, r.state); assert.equal(dupe.result.duplicate, true);
});
test('Import validiert IDs, Positionen, HP, Initiative und Modus', () => {
    const s = encounter(); assert.equal(E.validateState(s).actors.length, 2);
    for (const mutate of [ t => { t.actors[1].id = t.actors[0].id; }, t => { t.actors[1].hp = -1; },
        t => { t.actors[1].position = t.actors[0].position; }, t => { t.order = ['missing']; },
        t => { t.rules.rngMode = 'bad'; }, t => { t.board.blocked = [{ x: 0, y: 0 }]; } ]) {
        const copy = E.clone(s); mutate(copy); assert.throws(() => E.validateState(copy));
    }
});
test('Namen mit Duplikaten erfordern die ID, keine willkürliche Zielwahl', () => {
    let s = encounter(); s = E.addActor(s, { name: 'Goblin' }).state;
    assert.throws(() => E.findActor(s, 'Goblin'), /mehrdeutig/);
    assert.equal(E.findActor(s, s.actors[1].id).id, s.actors[1].id);
});
test('Chat-Parser akzeptiert genau eine strukturierte Aktion, keine Prosa', () => {
    assert.equal(E.parseActionBlock('Ich greife den Goblin an.'), null);
    const block = '```combat\n{"type":"attack","actor":"Held","target":"Goblin"}\n```';
    assert.equal(E.parseActionBlock(block).type, 'attack');
    assert.throws(() => E.parseActionBlock(block + block));
    assert.throws(() => E.parseActionBlock('```combat\nnot json\n```'));
    assert.throws(() => E.parseActionBlock('```combat\n[]\n```'));
});
test('Roster-Vorschläge markieren fehlende Zahlen als zu prüfende Standardwerte', () => {
    const [a] = E.parseRosterBlock('```combat-roster\n[{"name":"Riese","dc":18,"damage":"2d8"}]\n```');
    assert.equal(a.dc, 18); assert.equal(a.maxHp, 20); assert.match(a.notes, /Standardwerte/);
});
test('Direkte Attributboni inklusive negativem Bonus und Moduskonvertierung', () => {
    let s = E.setRules(encounter(), { statMode: 'bonuses' }).state;
    assert.equal(s.actors[0].stats.dexterity, 4); assert.equal(E.statBonus(s, s.actors[0], 'dexterity'), 4);
    s = E.editActor(s, s.actors[0].id, { stats: { strength: -2, dexterity: 3 } }).state;
    assert.equal(E.resolveAction(s, attack(s), { roll: sequence(10, 2) }).result.total, 15);
    const scores = E.setRules(s, { statMode: 'scores' }).state;
    assert.equal(E.statBonus(scores, scores.actors[0], 'strength'), -2);
});
test('Mehr als 100 Figuren sind möglich, auch ohne Platzierung', () => {
    let s = E.emptyState();
    for (let i = 0; i < 120; i++) s = E.addActor(s, { name: `Figur ${i}`, side: i < 60 ? 'ally' : 'enemy' }).state;
    assert.equal(E.validateState(s).actors.length, 120);
    s = E.setRules(s, { boardEnabled: false }).state;
    assert.equal(E.startCombat(s).state.order.length, 120);
});

test('Startprüfung nennt unplatzierte Figuren und würfelt keine Initiative', () => {
    let s = E.stopCombat(encounter()).state;
    s = E.moveActor(s, s.actors[1].id, null).state;
    const before = E.clone(s); let calls = 0;
    assert.throws(() => E.startCombat(s, true, () => { calls++; return 20; }), /Goblin/);
    assert.equal(calls, 0); assert.deepEqual(s, before);
    s = E.moveActor(s, s.actors[1].id, { x: 1, y: 1 }).state;
    assert.equal(E.startCombat(s).state.phase, 'active');
});

test('Bewegung wird kumulativ gezählt, diagonale Schritte kosten ein Feld', () => {
    let s = encounter({ stats: { dexterity: 12 } }, { position: { x: 9, y: 9 } });
    const id = s.actors[0].id;
    assert.equal(E.movementBudget(s, s.actors[0]).total, 4);
    s = E.moveActor(s, id, { x: 2, y: 2 }).state;
    assert.deepEqual(E.movementBudget(s, s.actors[0]), { total: 4, spent: 2, remaining: 2 });
    s = E.moveActor(s, id, { x: 4, y: 2 }).state;
    const before = E.clone(s);
    assert.throws(() => E.moveActor(s, id, { x: 4, y: 3 }), /noch 0 von 4/);
    assert.deepEqual(s, before); assert.equal(s.turnSerial, before.turnSerial);
    assert.equal(E.moveActor(s, id, { x: 4, y: 2 }).state.movement.spent, 4);
});

test('Bewegungsbudget erneuert sich im nächsten eigenen Zug, nicht nach einzelnen Schritten', () => {
    let s = encounter({}, { position: { x: 9, y: 9 } });
    s = E.moveActor(s, s.actors[0].id, { x: 3, y: 0 }).state;
    assert.equal(E.movementBudget(s, s.actors[0]).spent, 3);
    s = E.resolveAction(s, { type: 'other', actor: E.currentActor(s).id }).state;
    assert.equal(E.movementBudget(s, E.currentActor(s)).spent, 0);
    s = E.resolveAction(s, { type: 'other', actor: E.currentActor(s).id }).state;
    assert.equal(E.movementBudget(s, E.currentActor(s)).remaining, 7);
});

test('Umwege um Hindernisse zählen gegen das Budget; kein diagonaler Mauersprung', () => {
    let s = encounter({ stats: { dexterity: 10 } }, { position: { x: 9, y: 9 } });
    s = E.setBoard(s, { blocked: [{ x: 1, y: 0 }, { x: 1, y: 1 }] }).state;
    assert.equal(E.pathDistances(s, s.actors[0].position, s.actors[0].id).get('2,0'), 6);
    assert.throws(() => E.moveActor(s, s.actors[0].id, { x: 2, y: 0 }), /6 Bewegungspunkte erforderlich/);
    assert(!E.pathDistances(s, s.actors[0].position, s.actors[0].id, 3).has('2,0'));
});

test('Grundbewegung, anderes Attribut und Figurenbonus sind editierbar, Minimum ist 1', () => {
    let s = E.setRules(encounter({ movementBonus: 2, stats: { constitution: 16 } }), { movementBase: 3, movementStat: 'constitution' }).state;
    assert.equal(E.movementBudget(s, s.actors[0]).total, 8);
    s = E.setRules(s, { statMode: 'bonuses', movementStat: 'dexterity' }).state;
    s = E.editActor(s, s.actors[0].id, { stats: { dexterity: -10 }, movementBonus: -2 }).state;
    assert.equal(E.movementBudget(s, s.actors[0]).total, 1);
    s = E.setRules(s, { movementStat: 'none', movementBase: 6 }).state;
    assert.equal(E.movementBudget(s, s.actors[0]).total, 4);
});

test('Erstplatzierung später hinzugefügter Figuren verbraucht keinen fremden Zug', () => {
    let s = encounter();
    s = E.addActor(s, { name: 'Neuer Ally', side: 'ally' }).state;
    const token = E.turnToken(s), id = s.actors.at(-1).id;
    s = E.moveActor(s, id, { x: 8, y: 8 }).state;
    assert.equal(E.turnToken(s), token); assert.equal(E.movementBudget(s, E.currentActor(s)).spent, 0);
    assert.throws(() => E.moveActor(s, id, { x: 7, y: 8 }), /am Zug/);
});

test('Spielleiter-Korrektur umgeht Radius und verändert verbrauchtes Budget nicht', () => {
    let s = encounter({}, { position: { x: 9, y: 9 } });
    s = E.moveActor(s, s.actors[0].id, { x: 2, y: 0 }).state;
    s = E.moveActor(s, s.actors[0].id, { x: 8, y: 0 }, true).state;
    assert.equal(E.movementBudget(s, s.actors[0]).spent, 2);
});

test('Migration älterer Zustände ergänzt Bewegung und Log-IDs ohne HP-Verlust', () => {
    const raw = encounter(); delete raw.movement; delete raw.rules.movementBase; delete raw.rules.movementStat;
    for (const a of raw.actors) delete a.movementBonus;
    for (const e of raw.log) delete e.id;
    const s = E.validateState(raw);
    assert.equal(s.actors[0].hp, 30); assert.equal(s.rules.movementBase, 3);
    assert.equal(s.actors[0].movementBonus, 0); assert(s.log.every(e => e.id));
});

test('Automatisches Kampfende nennt Sieger, HP und aktuellen Zustand jeder Figur', () => {
    const s = encounter({ damage: '1d100', damageBonus: 0 });
    const r = E.resolveAction(s, attack(s), { roll: sequence(20, 100) });
    const summary = r.state.log.at(-1);
    assert.equal(summary.type, 'end'); assert.match(summary.text, /Sieg der Spielergruppe/);
    assert.match(summary.text, /Held \(Spieler\): 30\/30 HP — steht noch/);
    assert.match(summary.text, /Goblin \(Gegner\): 0\/25 HP — bewusstlos, kampfunfähig/);
    assert.match(summary.text, /noch 3 Rettungsrunden/);
    assert(E.buildPrompt(r.state).includes(summary.text));
});

test('Hardcore mit 0 Runden verursacht sofortigen Tod, Figurenfrist kann abweichen', () => {
    let s = E.setRules(encounter({ damage: '1d100' }), { deathRounds: 0 }).state;
    s = E.resolveAction(s, attack(s), { roll: sequence(20, 100) }).state;
    assert.equal(s.actors[1].condition, 'dead'); assert.equal(s.actors[1].roundsLeft, null);
    assert.match(s.log.at(-1).text, /0\/25 HP — tot/);
    let t = E.setRules(encounter({ damage: '1d100' }, { deathRounds: 10 }), { deathRounds: 0 }).state;
    t = E.resolveAction(t, attack(t), { roll: sequence(20, 100) }).state;
    assert.equal(t.actors[1].condition, 'unconscious'); assert.equal(t.actors[1].roundsLeft, 10);
});

test('Countdown zählt volle Runden, überspringt die angebrochene Runde und führt zum Tod', () => {
    let s = encounter({ damage: '1d100' });
    s = E.addActor(s, { name: 'Zweiter Gegner', side: 'enemy', position: { x: 8, y: 8 } }).state;
    s = E.setRules(s, { deathRounds: 2 }).state;
    s = E.resolveAction(s, attack(s), { roll: sequence(20, 100) }).state;
    assert.equal(s.actors[1].roundsLeft, 2); assert.equal(s.phase, 'active');
    const wait = () => { s = E.resolveAction(s, { type: 'other', actor: E.currentActor(s).id }).state; };
    wait(); assert.equal(s.round, 2); assert.equal(s.actors[1].roundsLeft, 2);
    wait(); wait(); assert.equal(s.round, 3); assert.equal(s.actors[1].roundsLeft, 1);
    wait(); wait(); assert.equal(s.round, 4); assert.equal(s.actors[1].condition, 'dead');
    assert.equal(s.actors[1].hp, 0); assert(s.log.some(e => e.type === 'condition' && e.text.includes('tot')));
});

test('Benachbarte Gegner können nach Kampfende stabilisiert werden, ohne Heilung oder Würfel', () => {
    let s = encounter({ damage: '1d100' });
    s = E.resolveAction(s, attack(s), { roll: sequence(20, 100) }).state;
    assert.equal(s.phase, 'ended'); const cursor = s.rng.cursor;
    s = E.resolveAction(s, { type: 'stabilize', actor: s.actors[0].id, target: s.actors[1].id }).state;
    assert.equal(s.actors[1].condition, 'stabilized'); assert.equal(s.actors[1].hp, 0);
    assert.equal(s.actors[1].roundsLeft, null); assert.equal(s.rng.cursor, cursor);
    assert.throws(() => E.elapseRound(s), /Keine bewusstlose/);
});

test('Rettung im Kampf verbraucht einen Zug und stabilisierte Figur bleibt kampfunfähig', () => {
    let s = encounter();
    s = E.addActor(s, { name: 'Bewusstloser Ally', side: 'ally', hp: 0, position: { x: 0, y: 1 } }).state;
    const token = s.turnSerial, cursor = s.rng.cursor;
    s = E.resolveAction(s, { type: 'stabilize', actor: s.actors[0].id, target: s.actors[2].id }).state;
    assert.equal(s.actors[2].condition, 'stabilized'); assert.equal(s.turnSerial, token + 1);
    assert.equal(E.currentActor(s).name, 'Goblin'); assert.equal(s.rng.cursor, cursor);
    s = E.resolveAction(s, { type: 'other', actor: E.currentActor(s).id }).state;
    assert.equal(E.currentActor(s).name, 'Held');
});

test('Rettung lehnt Distanz, Mauerecke, lebendes Ziel und Tote ohne Zustandsänderung ab', () => {
    let s = encounter(); s = E.addActor(s, { name: 'KO', side: 'ally', hp: 0, position: { x: 5, y: 5 } }).state;
    const rescue = { type: 'stabilize', actor: s.actors[0].id, target: s.actors[2].id }, before = E.clone(s);
    assert.throws(() => E.resolveAction(s, rescue), /Nachbarfeld/); assert.deepEqual(s, before);
    s = E.moveActor(s, s.actors[2].id, { x: 1, y: 0 }, true).state;
    s = E.setBoard(s, { blocked: [{ x: 0, y: 1 }] }).state;
    assert.throws(() => E.resolveAction(s, { ...rescue, target: s.actors[1].id }), /bewusstlose/);
    s = E.editActor(s, s.actors[2].id, { condition: 'dead' }).state;
    assert.throws(() => E.resolveAction(s, rescue), /bewusstlose/);
    let t = encounter(); t = E.addActor(t, { name: 'KO', hp: 0, position: { x: 1, y: 0 } }).state;
    t = E.moveActor(t, t.actors[0].id, { x: 0, y: 1 }, true).state;
    t = E.setBoard(t, { blocked: [{ x: 0, y: 0 }] }).state;
    assert.throws(() => E.resolveAction(t, { type: 'stabilize', actor: t.actors[0].id, target: t.actors[2].id }), /Mauerecke/);
});

test('Nachkampfzeit ist manuell steuerbar; stabilisierte Ziele bleiben geschützt', () => {
    let s = encounter({ damage: '1d100' });
    assert.throws(() => E.elapseRound(s), /Initiative/);
    s = E.resolveAction(s, attack(s), { roll: sequence(20, 100) }).state;
    s = E.elapseRound(s).state; assert.equal(s.actors[1].roundsLeft, 2);
    s = E.elapseRound(s).state; s = E.elapseRound(s).state;
    assert.equal(s.actors[1].condition, 'dead');
});

test('Schadenswürfel pro Angriff überschreiben das Profil nur für diesen Angriff', () => {
    const s = encounter({ damage: '1d8', damageBonus: 3 });
    const result = E.resolveAction(s, attack(s), { roll: sequence(20, 3, 4), damageOverride: '2d6+2' });
    assert.equal(result.result.damage, 12); assert.equal(result.result.damageFormula, '2d6+2');
    assert.deepEqual(result.result.damageRolls, [3, 4]); assert.equal(result.state.actors[0].damage, '1d8');
    let calls = 0;
    assert.throws(() => E.resolveAction(s, attack(s), { roll: () => { calls++; return 20; }, damageOverride: '1d3' }));
    assert.equal(calls, 0);
    assert.throws(() => E.resolveAction(s, { ...attack(s), damageOverride: '1d100' }), /keine HP/);
});

test('Legacy-Figuren mit 0 HP erhalten bei Migration keinen nachträglichen Todescountdown', () => {
    const raw = encounter(); raw.actors[1].hp = 0;
    for (const a of raw.actors) { delete a.condition; delete a.roundsLeft; delete a.deathRounds; delete a.downedRound; }
    const s = E.validateState(raw); assert.equal(s.actors[1].condition, 'stabilized');
    assert.equal(s.actors[1].roundsLeft, null);
});

test('Manuelle HP-Korrekturen setzen Zustand und Kampfende konsistent; Heilung beendet Countdown', () => {
    let s = encounter(); s = E.editActor(s, s.actors[1].id, { hp: 0 }).state;
    assert.equal(s.phase, 'ended'); assert.equal(s.actors[1].condition, 'unconscious');
    s = E.editActor(s, s.actors[1].id, { hp: 5 }).state;
    assert.equal(s.actors[1].condition, 'fit'); assert.equal(s.actors[1].roundsLeft, null);
});

test('Niederlage und manueller Stopp ergeben passende Abschlussmeldungen', () => {
    let s = encounter({}, { damage: '1d100', initiative: 100 });
    s = E.resolveAction(s, { type: 'attack', actor: s.actors[1].id, target: s.actors[0].id }, { roll: sequence(20, 100) }).state;
    assert.match(s.log.at(-1).text, /Die Gegner haben gewonnen/);
    const stopped = E.stopCombat(encounter()).state;
    assert.match(stopped.log.at(-1).text, /Ausgang ist noch offen/);
    assert.match(stopped.log.at(-1).text, /Goblin \(Gegner\): 25\/25 HP/);
});
