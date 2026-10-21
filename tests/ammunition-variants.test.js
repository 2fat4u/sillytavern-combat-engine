import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../engine.js';
import { planBasicTurn, resolveBasicTurn } from '../ai.js';
function fixture({ quantity = 2, normal = null } = {}) {
    let s = E.setRules(E.emptyState(), { splitMovement: true }).state;
    s = E.addActor(s, { name: 'Archer', side: 'player', maxHp: 40, initiative: 20, attackMode: 'ranged', position: { x: 1, y: 1 }, resources: [{ id: 'fire', name: 'Fire arrows', kind: 'ammo', quantity }, ...(normal ? [{ id: 'normal', name: 'Normal arrows', kind: 'ammo', quantity: normal.quantity }] : [])], weapons: { melee: { damage: '1d4' }, ranged: { damage: '1d8', radius: 1, resource: 'fire', effects: [{ type: 'burning', turns: 3 }], ...(normal ? { standard: { damage: '1d6', resource: 'normal' } } : {}) } } }).state;
    s = E.addActor(s, { name: 'Enemy', side: 'enemy', maxHp: 100, dc: 1, initiative: 10, position: { x: 2, y: 1 } }).state;
    return E.startCombat(s).state;
}
const intent = (s, variant, mode = 'ranged') => ({ type: 'attack', actor: s.actors[0].id, target: s.actors[1].id, mode, variant });
test('Standard attack can be unlimited and never grants unpaid special effects or blast radius', () => {
    const s = fixture(), r = E.resolveAction(s, intent(s, 'standard'), { roll: sides => sides });
    assert.equal(r.result.radius, 0); assert.equal(r.result.ammunition, null); assert.equal(r.result.variant, 'standard'); assert.equal(r.result.appliedEffects.length, 0);
    assert.equal(r.state.actors[0].resources[0].quantity, 2); assert.equal(r.state.actors[1].effects.length, 0);
});
test('Special attack consumes its own stock and applies its configured effects', () => {
    const s = fixture(), r = E.resolveAction(s, intent(s, 'profile'), { roll: sides => sides });
    assert.equal(r.state.actors[0].resources[0].quantity, 1); assert.equal(r.result.radius, 1); assert(r.state.actors[1].effects.some(v => v.type === 'burning'));
});
test('Normal ammunition has a separate finite inventory, dice and consumption on both hit and miss', () => {
    const s = fixture({ normal: { quantity: 3 } });
    for (const natural of [1, 20]) {
        const r = E.resolveAction(s, intent(s, 'standard'), { roll: sides => Math.min(natural, sides) });
        assert.equal(r.state.actors[0].resources[0].quantity, 2); assert.equal(r.state.actors[0].resources[1].quantity, 2); assert.equal(r.result.damageFormula, '1d6');
    }
});
test('Empty ranged ammunition never blocks an independent melee weapon', () => {
    const s = fixture({ quantity: 0, normal: { quantity: 0 } }); assert(E.canAttack(s, s.actors[0], s.actors[1], 'melee'));
    const r = E.resolveAction(s, intent(s, 'profile', 'melee'), { roll: sides => sides }); assert(r.result.hit); assert.equal(r.result.ammunition, null);
});
test('Empty normal and special stock reject their own variants atomically', () => {
    const s = fixture({ quantity: 0, normal: { quantity: 0 } }), before = E.clone(s);
    for (const variant of ['profile', 'standard']) assert.throws(() => E.resolveAction(s, intent(s, variant)), /aufgebraucht/);
    assert.deepEqual(s, before);
});
test('Basic AI falls back to a configured usable standard attack when special ammo is depleted', () => {
    let s = fixture({ quantity: 0 }); s = E.editActor(s, s.actors[0].id, { control: 'basic' }).state;
    const plan = planBasicTurn(s); assert.equal(plan.intent.variant, 'standard'); assert.equal(plan.intent.mode, 'ranged');
    const r = resolveBasicTurn(s, { roll: sides => sides }); assert.equal(r.result.appliedEffects.length, 0); assert.equal(r.state.actors[0].resources[0].quantity, 0);
});
test('Standard attacks may be explicitly removed and unknown variants cannot grant free attacks', () => {
    let s = fixture(); const a = s.actors[0]; s = E.editActor(s, a.id, { weapons: { ...a.weapons, ranged: { ...a.weapons.ranged, standard: null } } }).state;
    assert.throws(() => E.resolveAction(s, intent(s, 'standard')), /keine Waffe/); assert.throws(() => E.resolveAction(s, intent(s, 'free')), /Angriffsvariante/);
});
test('Snapshot and target guidance expose usable standard attacks and the resource policy', () => {
    const s = fixture({ quantity: 0 }); assert.equal(E.tacticalTargets(s).nearestLegalRangedTarget.name, 'Enemy');
    assert.match(E.buildPrompt(s), /variant=standard/); assert.match(E.buildPrompt(s), /optional normal-ammo/);
});
