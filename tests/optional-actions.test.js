import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../engine.js';
import { poolBudget } from '../action-pools.js';
import { resolveBasicTurn } from '../ai.js';
import { createController } from '../controller.js';
function fixture({ actor = {}, rules = {} } = {}) {
    let s = E.setRules(E.emptyState(), { multiActionsEnabled: true, splitMovement: true, movementStat: 'none', ...rules }).state;
    s = E.addActor(s, { name: 'Hero', side: 'player', maxHp: 30, hp: 10, initiative: 20, position: { x: 1, y: 1 }, weapons: { melee: { damage: '1d4' }, ranged: null }, resources: [{ id: 'heal', name: 'Heal', quantity: 10, heal: '3', range: 1 }], ...actor }).state;
    s = E.addActor(s, { name: 'Enemy', side: 'enemy', maxHp: 100, dc: 1, initiative: 10, position: { x: 2, y: 1 } }).state;
    return E.startCombat(s).state;
}
const attack = s => ({ type: 'attack', actor: E.currentActor(s).id, target: s.actors[1].id, turn: E.turnToken(s) });
const heal = s => ({ type: 'use', actor: E.currentActor(s).id, target: s.actors[0].id, resource: 'heal', turn: E.turnToken(s) });
const roll = sides => sides;
test('Optional rule off keeps the old single action even for configured bosses', () => {
    const s = fixture({ rules: { multiActionsEnabled: false, splitMovement: false }, actor: { actionsPerTurn: 4 } });
    assert.equal(E.currentActor(E.resolveAction(s, attack(s), { roll }).state).name, 'Enemy');
});
test('Three actions share one turn and movement; status damage ticks once at the real end', () => {
    let s = fixture({ rules: { splitMovement: false }, actor: { actionsPerTurn: 3, effects: [{ type: 'poisoned', turns: 2, damage: '2' }] } });
    s = E.resolveAction(s, attack(s), { roll }).state; assert.equal(E.currentActor(s).name, 'Hero'); assert.equal(poolBudget(s, s.actors[0]).remaining, 2); assert.equal(s.actors[0].hp, 10);
    assert.equal(E.movementBudget(s, s.actors[0]).remaining, 0); assert.throws(() => E.moveActor(s, s.actors[0].id, { x: 0, y: 1 }));
    s = E.resolveAction(s, attack(s), { roll }).state; assert.equal(s.actors[0].hp, 10);
    s = E.resolveAction(s, attack(s), { roll }).state; assert.equal(E.currentActor(s).name, 'Enemy'); assert.equal(s.actors[0].hp, 8); assert.equal(s.actors[0].effects[0].turns, 1);
});
test('Healing-only bonus is spent before the free action, preserving the attack', () => {
    let s = fixture({ actor: { bonusActions: [{ id: 'medic', count: 1, allowed: ['use'] }] } });
    const result = E.resolveAction(s, heal(s)); s = result.state; assert.equal(result.result.actionPool.id, 'medic'); assert.equal(poolBudget(s, s.actors[0]).free.remaining, 1);
    s = E.resolveAction(s, attack(s), { roll }).state; assert.equal(poolBudget(s, s.actors[0]).remaining, 0); assert(E.actionBudget(s).used);
});
test('Remaining healing-only bonus cannot be used as another attack or custom action', () => {
    let s = fixture({ actor: { bonusActions: [{ id: 'medic', count: 1, allowed: ['use'] }] } });
    s = E.resolveAction(s, attack(s), { roll }).state; const before = E.clone(s);
    assert.throws(() => E.resolveAction(s, attack(s), { roll }), /Zusatzaktionen/);
    assert.throws(() => E.resolveAction(s, { type: 'other', actor: s.actors[0].id }), /Zusatzaktionen/); assert.deepEqual(s, before);
    s = E.resolveAction(s, heal(s)).state; assert.equal(s.actors[0].hp, 13);
});
test('Attack-only boss extras remain after a free treatment', () => {
    let s = fixture({ actor: { bonusActions: [{ id: 'boss', count: 2, allowed: ['attack'] }] } });
    s = E.resolveAction(s, heal(s)).state; assert(!E.canSpendAction(s, s.actors[0], 'use')); assert(E.canSpendAction(s, s.actors[0], 'attack'));
    s = E.resolveAction(s, attack(s), { roll }).state; s = E.resolveAction(s, attack(s), { roll }).state; assert.equal(s.actors[1].hp, 92);
});
test('The narrowest eligible bonus pool is consumed before a broader bonus or free action', () => {
    const s = fixture({ actor: { bonusActions: [{ id: 'broad', count: 1, allowed: ['attack', 'use'] }, { id: 'narrow', count: 1, allowed: ['use'] }] } });
    const r = E.resolveAction(s, heal(s)); assert.equal(r.result.actionPool.id, 'narrow'); assert.equal(poolBudget(r.state, r.state.actors[0]).remaining, 2);
});
test('End turn may skip remaining actions and fleeing ends the whole turn', () => {
    let s = fixture({ actor: { actionsPerTurn: 4, position: { x: 0, y: 1 } } });
    assert.equal(E.currentActor(E.endTurn(s).state).name, 'Enemy'); s = E.resolveAction(s, { type: 'flee', actor: s.actors[0].id }).state;
    assert.equal(s.actors[0].escaped, true); assert.equal(s.phase, 'ended');
});
test('Basic AI completes all three allowed attacks and ticks effects only once', () => {
    const s = fixture({ actor: { control: 'basic', actionsPerTurn: 3, effects: [{ type: 'bleeding', turns: 2, damage: '2' }] } });
    const r = resolveBasicTurn(s, { roll }); assert.equal(r.result.actions.length, 3); assert.equal(r.state.actors[1].hp, 88); assert.equal(r.state.actors[0].hp, 8); assert.equal(E.currentActor(r.state).name, 'Enemy');
});
test('Basic AI skips a remaining treatment-only pool when no treatment is possible', () => {
    const s = fixture({ actor: { control: 'basic', hp: 30, resources: [], bonusActions: [{ id: 'medic', count: 2, allowed: ['use'] }] } });
    const r = resolveBasicTurn(s, { roll }); assert.equal(r.state.actors[1].hp, 96); assert.equal(E.currentActor(r.state).name, 'Enemy');
});
test('Undo and import preserve consumed pools, and custom-action undo is a real combat correction', async () => {
    let bundle = { state: fixture({ actor: { actionsPerTurn: 3 } }), history: [] };
    const c = createController({ key: () => 'a', read: () => bundle, write: value => { bundle = value; }, save: async () => {} });
    await c.act({ type: 'other', actor: c.state().actors[0].id }); const exported = c.export(); await c.import(exported);
    assert.equal(poolBudget(c.state(), c.state().actors[0]).free.remaining, 2); await c.undo(); await c.undo();
    assert.equal(poolBudget(c.state(), c.state().actors[0]).free.remaining, 3); assert.equal(c.state().log.at(-1).chatRelevant, true);
});
test('Invalid action counts, duplicate pools and unknown action kinds fail validation', () => {
    for (const config of [{ actionsPerTurn: 0 }, { actionsPerTurn: 21 }, { bonusActions: [{ allowed: [] }] }, { bonusActions: [{ allowed: ['invented'] }] }, { bonusActions: [{ id: 'same', allowed: ['use'] }, { id: 'same', allowed: ['attack'] }] }]) assert.throws(() => E.actorFrom(config));
});
