import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../engine.js';
import { resolveBasicTurn } from '../ai.js';
import { createController } from '../controller.js';

function encounter(splitMovement = true) {
    let s = E.setRules(E.emptyState(), { splitMovement, movementStat: 'none' }).state;
    for (const a of [
        { name: 'Hero', side: 'player', initiative: 20, position: { x: 1, y: 1 }, maxHp: 100 },
        { name: 'Enemy', side: 'enemy', initiative: 10, position: { x: 2, y: 1 }, maxHp: 100 },
        { name: 'Ally', side: 'ally', initiative: 5, position: { x: 7, y: 7 }, maxHp: 100 },
    ]) s = E.addActor(s, a).state;
    return E.startCombat(s).state;
}
const attack = s => ({ type: 'attack', actor: E.currentActor(s).id, target: s.actors[1].id, turn: E.turnToken(s), mode: 'melee' });
const other = s => ({ type: 'other', actor: E.currentActor(s).id, turn: E.turnToken(s) });
function harness(state = encounter()) {
    let bundle = { state, history: [] }, actions = 0;
    const c = createController({ key: () => 'a', read: () => bundle, write: b => { bundle = b; }, save: async () => {}, onAction: () => { actions++; } });
    return { c, count: () => actions };
}

test('Split movement shares one budget before and after one action, and explicit End turn resets it', () => {
    let s = encounter(), id = s.actors[0].id, token = E.turnToken(s);
    s = E.moveActor(s, id, { x: 1, y: 2 }).state;
    const resolved = E.resolveAction(s, attack(s), { roll: sides => sides }); s = resolved.state;
    assert.equal(E.turnToken(s), token); assert.equal(E.currentActor(s).id, id);
    assert.deepEqual(E.actionBudget(s), { used: true, available: false });
    assert.equal(resolved.result.turnEnded, false); assert.equal(resolved.result.remainingMovement, 2);
    assert.match(E.resultText(resolved.result, 'en'), /Action used. 2 movement points left/);
    s = E.moveActor(s, id, { x: 0, y: 3 }).state;
    assert.equal(E.movementBudget(s, s.actors[0]).remaining, 1);
    s = E.endTurn(s, { actor: id, turn: token }).state;
    assert.equal(E.currentActor(s).name, 'Enemy'); assert.equal(E.actionBudget(s).available, true);
    assert.equal(E.movementBudget(s, E.currentActor(s)).remaining, 3);
    assert.match(E.eventText(s.log.at(-1), 'en'), /Hero: turn ended.*\nCurrent turn: Enemy/);
});

test('Using movement first keeps the action; an action at zero movement advances immediately', () => {
    let s = encounter(); s = E.moveActor(s, s.actors[0].id, { x: 1, y: 4 }).state;
    assert.equal(E.currentActor(s).name, 'Hero'); assert.equal(E.actionBudget(s).available, true);
    const resolved = E.resolveAction(s, other(s));
    assert.equal(resolved.result.turnEnded, true); assert.equal(E.currentActor(resolved.state).name, 'Enemy');
});

test('Using the final movement point after the action automatically ends exactly one turn', () => {
    let s = encounter(), serial = s.turnSerial;
    s = E.resolveAction(s, other(s)).state;
    s = E.moveActor(s, s.actors[0].id, { x: 1, y: 4 }).state;
    assert.equal(E.currentActor(s).name, 'Enemy'); assert.equal(s.turnSerial, serial + 1);
    assert.equal(s.log.at(-1).type, 'turn'); assert.equal(s.log.at(-1).details.automatic, true);
});

test('A second attack, other action, rescue or flee cannot consume dice or change a held turn', () => {
    let s = encounter(); s = E.moveActor(s, s.actors[0].id, { x: 0, y: 1 }).state;
    s = E.resolveAction(s, other(s)).state; const saved = E.clone(s); let dice = 0;
    for (const type of ['attack', 'other', 'stabilize', 'flee']) {
        assert.throws(() => E.resolveAction(s, { ...attack(s), type }, { roll: () => { dice++; return 1; } }), /Aktion bereits verbraucht/);
    }
    assert.equal(dice, 0); assert.deepEqual(s, saved);
});

test('A miss still consumes the action but leaves remaining movement available', () => {
    const s = encounter(), resolved = E.resolveAction(s, attack(s), { roll: () => 1 });
    assert.equal(resolved.result.hit, false); assert.equal(resolved.state.rng.cursor, 1);
    assert.equal(resolved.state.actors[1].hp, 100); assert.equal(E.actionBudget(resolved.state).used, true);
    assert.equal(E.currentActor(resolved.state).name, 'Hero');
});

test('Classic mode remains the default and every action immediately advances', () => {
    assert.equal(E.emptyState().rules.splitMovement, false);
    const s = encounter(false), resolved = E.resolveAction(s, attack(s), { roll: () => 1 });
    assert.equal(E.currentActor(resolved.state).name, 'Enemy'); assert.equal(resolved.result.turnEnded, true);
});

test('End turn may skip an unused action and rejects stale tokens or other actors', () => {
    const s = encounter(), token = E.turnToken(s), id = s.actors[0].id;
    const ended = E.endTurn(s, { actor: id, turn: token });
    assert.equal(ended.result.actionUsed, false); assert.equal(ended.state.rng.cursor, 0);
    assert.match(E.resultText(ended.result, 'en'), /Action skipped/);
    assert.throws(() => E.endTurn(ended.state, { actor: id, turn: token }), /Veralteter Zug/);
    assert.throws(() => E.endTurn(s, { actor: s.actors[1].id, turn: token }), /Jetzt ist Hero/);
    assert.throws(() => E.endTurn(E.emptyState()), /Kampf zuerst starten/);
});

test('Cover crossing after the action uses the remaining weighted budget and cannot stop on cover', () => {
    let s = encounter(); s = E.setBoard(s, { cover: [{ x: 1, y: 2 }], blocked: [{ x: 0, y: 2 }, { x: 2, y: 2 }] }).state;
    s = E.resolveAction(s, other(s)).state;
    assert.throws(() => E.moveActor(s, s.actors[0].id, { x: 1, y: 2 }), /Deckung ist nicht betretbar/);
    s = E.moveActor(s, s.actors[0].id, { x: 1, y: 3 }).state;
    assert.equal(s.actors[0].position.y, 3); assert.equal(E.currentActor(s).name, 'Enemy');
    assert.equal(s.log.findLast(e => e.type === 'move').details.movement.spent, 3);
});

test('Turning split movement off or reducing a spent budget ends the held turn', () => {
    let s = encounter(); s = E.resolveAction(s, other(s)).state;
    const switched = E.setRules(s, { splitMovement: false }).state;
    assert.equal(E.currentActor(switched).name, 'Enemy'); assert.equal(switched.log.at(-1).type, 'turn');
    s = E.moveActor(s, s.actors[0].id, { x: 1, y: 3 }).state;
    s = E.setRules(s, { movementBase: 2 }).state; assert.equal(E.currentActor(s).name, 'Enemy');
});

test('GM position correction spends no movement and preserves a used action', () => {
    let s = encounter(); s = E.resolveAction(s, other(s)).state;
    s = E.moveActor(s, s.actors[0].id, { x: 9, y: 9 }, true).state;
    assert.equal(E.actionBudget(s).used, true); assert.equal(E.movementBudget(s, s.actors[0]).remaining, 3);
    assert.equal(E.currentActor(s).name, 'Hero');
});

test('Victory and fleeing end immediately even with movement remaining', () => {
    let s = encounter(); s = E.editActor(s, s.actors[1].id, { hp: 1 }).state;
    const resolved = E.resolveAction(s, attack(s), { roll: sides => sides });
    assert.equal(resolved.state.phase, 'ended'); assert.equal(resolved.result.turnEnded, true);
    assert.equal(resolved.state.action.used, false); E.validateState(resolved.state);
    s = encounter(); s = E.moveActor(s, s.actors[0].id, { x: 0, y: 1 }).state;
    s = E.resolveAction(s, { ...other(s), type: 'flee' }).state;
    assert.equal(s.actors[0].escaped, true); assert.equal(E.currentActor(s).name, 'Enemy');
});

test('Self damage from an area attack never leaves an unconscious actor holding the turn', () => {
    let s = encounter(); s = E.editActor(s, s.actors[0].id, { hp: 1, weapons: { melee: { damage: '1d8', radius: 1 }, ranged: null } }).state;
    const resolved = E.resolveAction(s, attack(s), { roll: sides => sides });
    assert.equal(resolved.state.actors[0].hp, 0); assert.equal(E.currentActor(resolved.state).name, 'Enemy');
    assert.equal(resolved.result.turnEnded, true); E.validateState(resolved.state);
});

test('Rescue uses one action and countdowns tick on initiative wrap, never on movement', () => {
    let s = encounter(); s = E.moveActor(s, s.actors[2].id, { x: 0, y: 1 }, true).state;
    s = E.editActor(s, s.actors[2].id, { hp: 0 }).state;
    s = E.resolveAction(s, { ...other(s), type: 'stabilize', target: s.actors[2].id }).state;
    assert.equal(s.actors[2].condition, 'stabilized'); assert.equal(E.actionBudget(s).used, true);
    assert.equal(E.currentActor(s).name, 'Hero');
    s = encounter(); s = E.editActor(s, s.actors[2].id, { hp: 0 }).state;
    s = E.resolveAction(s, other(s)).state; s = E.moveActor(s, s.actors[0].id, { x: 0, y: 1 }).state;
    assert.equal(s.actors[2].roundsLeft, 3); s = E.endTurn(s).state; s = E.endTurn(s).state;
    assert.equal(s.round, 2); assert.equal(s.actors[2].roundsLeft, 3); // partial knockout round
    s = E.endTurn(s).state; s = E.endTurn(s).state; assert.equal(s.actors[2].roundsLeft, 2);
});

test('Basic AI always closes its turn and never attacks twice after switching from manual control', () => {
    let s = encounter(); s = E.editActor(s, s.actors[0].id, { control: 'basic' }).state;
    const resolved = resolveBasicTurn(s, { roll: sides => sides });
    assert.equal(E.currentActor(resolved.state).name, 'Enemy'); assert.equal(resolved.result.turnEnded, true);
    s = encounter(); s = E.resolveAction(s, other(s)).state;
    s = E.editActor(s, s.actors[0].id, { control: 'basic' }).state;
    const ended = resolveBasicTurn(s); assert.equal(ended.result.type, 'endTurn');
    assert.equal(ended.state.rng.cursor, s.rng.cursor); assert.equal(E.currentActor(ended.state).name, 'Enemy');
});

test('Undo and import preserve the used action and movement while renewing tokens', async () => {
    const { c } = harness(); await c.act(other(c.state())); const id = c.state().actors[0].id;
    await c.move(id, { x: 0, y: 1 }); await c.move(id, { x: 0, y: 2 });
    await c.undo(); assert.equal(E.actionBudget(c.state()).used, true); assert.equal(E.movementBudget(c.state(), c.state().actors[0]).spent, 1);
    const token = E.turnToken(c.state()), saved = c.export(); await c.import(saved);
    assert.notEqual(E.turnToken(c.state()), token); assert.equal(E.actionBudget(c.state()).used, true);
    await assert.rejects(c.act(other(c.state())), /Aktion bereits verbraucht/); E.validateState(c.state());
    await c.endTurn(); await c.undo(); assert.equal(E.actionBudget(c.state()).used, true);
    await c.undo(); await c.undo(); assert.equal(E.actionBudget(c.state()).used, true);
    await c.undo(); assert.equal(E.actionBudget(c.state()).available, true);
});

test('Two queued actions in split mode roll once; two queued End turn clicks advance once', async () => {
    const { c, count } = harness(); let rolls = 0; const intent = attack(c.state());
    const results = await Promise.allSettled([c.act(intent, { roll: () => { rolls++; return 1; } }), c.act(intent, { roll: () => { rolls++; return 1; } })]);
    assert.equal(results[0].status, 'fulfilled'); assert.equal(results[1].status, 'rejected'); assert.equal(rolls, 1);
    const token = E.turnToken(c.state());
    const endings = await Promise.allSettled([c.endTurn(), c.endTurn()]);
    assert.equal(endings[0].status, 'fulfilled'); assert.equal(endings[1].status, 'rejected');
    assert.equal(c.state().turnSerial, Number(token.slice(5)) + 1); assert.equal(count(), 2);
});

test('Old 1.5 states migrate to unused action; malformed used-action owners are rejected', () => {
    const old = encounter(false); delete old.action; delete old.rules.splitMovement;
    const migrated = E.validateState(old); assert.equal(migrated.rules.splitMovement, false); assert.equal(E.actionBudget(migrated).available, true);
    for (const patch of [{ used: 'yes' }, { actorId: old.actors[1].id, used: true }, { turnSerial: old.turnSerial - 1, actorId: old.actors[0].id, used: true }]) {
        assert.throws(() => E.validateState({ ...old, action: patch }));
    }
});

test('Model context describes the held actor and remaining resources, and prohibits another action', () => {
    let s = encounter(); s = E.resolveAction(s, attack(s), { roll: () => 1 }).state;
    const prompt = E.buildPrompt(s, { tools: true, mode: 'proposal' });
    assert.match(prompt, /"splitMovement":true/); assert.match(prompt, /"remaining":3/); assert.match(prompt, /"used":true,"available":false/);
    assert.match(prompt, /has already used their action/); assert.match(prompt, /has not yet handed over initiative/);
    assert.match(prompt, /Current turn: Hero/); assert(!prompt.includes('DM proposal mode: suggest ONE'));
});
