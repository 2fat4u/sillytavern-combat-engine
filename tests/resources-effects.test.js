import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../engine.js';
import { resourcePreset, effectsFrom, resourcesFrom } from '../effects.js';
import { planBasicTurn, resolveBasicTurn } from '../ai.js';
import { createController } from '../controller.js';

const supply = (values = {}) => ({ id: 'heal', name: 'Medkit', kind: 'supply', quantity: 3, heal: '1d8+2', range: 1, cures: [], ...values });
const ammo = () => ({ id: 'arrows', name: 'Fire arrows', kind: 'ammo', quantity: 2 });
function fixture(values = {}) {
    let s = E.setRules(E.emptyState(), { splitMovement: true, movementStat: 'none', ...values.rules }).state;
    for (const input of [
        { name: 'Hero', side: 'player', maxHp: 30, hp: 10, initiative: 20, position: { x: 1, y: 1 }, resources: [supply()], ...values.hero },
        { name: 'Enemy', side: 'enemy', maxHp: 40, hp: 40, initiative: 10, position: { x: 2, y: 1 }, ...values.enemy },
        { name: 'Ally', side: 'ally', maxHp: 20, hp: 10, initiative: 5, position: { x: 1, y: 2 }, ...values.ally },
    ]) s = E.addActor(s, input).state;
    return E.startCombat(s).state;
}
const use = (s, index = 0, resource = 'heal') => ({ type: 'use', actor: E.currentActor(s).id, target: s.actors[index].id, resource, turn: E.turnToken(s) });
const attack = s => ({ type: 'attack', actor: s.actors[0].id, target: s.actors[1].id, mode: 'melee', turn: E.turnToken(s) });
function controller(state) {
    let bundle = { state, history: [] };
    return createController({ key: () => 'a', read: () => bundle, write: v => { bundle = v; }, save: async () => {}, library: () => [], saveTemplate: async () => {} });
}

test('Healing rolls configured dice once, consumes one unit and one action, and leaves movement', () => {
    const s = fixture(), resolved = E.resolveAction(s, use(s), { roll: () => 8 });
    assert.equal(resolved.state.actors[0].hp, 20); assert.equal(resolved.state.actors[0].resources[0].quantity, 2);
    assert.equal(resolved.state.rng.cursor, 1); assert.equal(resolved.result.healing, 10); assert.equal(resolved.result.turnEnded, false);
    assert.equal(E.actionBudget(resolved.state).used, true); assert.equal(E.movementBudget(resolved.state, resolved.state.actors[0]).remaining, 3);
    assert.match(E.resultText(resolved.result, 'en'), /Hero uses Medkit on Hero: \+10 HP/);
    assert.throws(() => E.resolveAction(resolved.state, use(resolved.state)), /Aktion bereits verbraucht/);
});

test('Fixed healing does not consume dice and caps HP without overhealing', () => {
    const s = fixture({ hero: { hp: 29, resources: [supply({ heal: '10' })] } });
    const resolved = E.resolveAction(s, use(s)); assert.equal(resolved.state.actors[0].hp, 30);
    assert.equal(resolved.state.rng.cursor, 0); assert.equal(resolved.result.healing, 1);
});

test('Out-of-range, occluded, exhausted, unneeded and unknown treatments are atomic', () => {
    const cases = [
        [fixture({ hero: { resources: [supply({ range: 0 })] } }), 2, 'heal'],
        [fixture({ ally: { position: { x: 7, y: 7 } } }), 2, 'heal'],
        [fixture({ hero: { resources: [supply({ quantity: 0 })] } }), 0, 'heal'],
        [fixture({ hero: { hp: 30 } }), 0, 'heal'],
        [fixture(), 0, 'missing'],
    ];
    let blocked = fixture({ ally: { position: { x: 1, y: 4 } }, hero: { resources: [supply({ range: 5 })] } });
    blocked = E.setBoard(blocked, { blocked: [{ x: 1, y: 3 }] }).state; cases.push([blocked, 2, 'heal']);
    for (const [s, index, resource] of cases) { const saved = E.clone(s); assert.throws(() => E.resolveAction(s, use(s, index, resource))); assert.deepEqual(s, saved); }
});

test('Healing revives unconscious and stabilized actors, clears rescue counters, but never revives dead', () => {
    for (const condition of ['unconscious', 'stabilized']) {
        const s = fixture({ ally: { hp: 0, condition }, hero: { resources: [supply({ heal: '5' })] } });
        const healed = E.resolveAction(s, use(s, 2)).state;
        assert.equal(healed.actors[2].hp, 5); assert.equal(healed.actors[2].condition, 'fit');
        assert.equal(healed.actors[2].roundsLeft, null); assert.equal(healed.actors[2].downedRound, null); E.validateState(healed);
    }
    const dead = fixture({ ally: { hp: 0, condition: 'dead' } }); assert.throws(() => E.resolveAction(dead, use(dead, 2)), /Tote oder geflohene/);
});

test('Healing an escaped actor is forbidden, even without board checks', () => {
    const s = fixture({ rules: { boardEnabled: false }, ally: { escaped: true, position: null } });
    assert.throws(() => E.resolveAction(s, use(s, 2)), /Tote oder geflohene/);
});

test('Remedy removes only its configured statuses and costs no healing dice at full HP', () => {
    const s = fixture({ hero: { hp: 30, resources: [supply({ heal: '0', cures: ['poisoned'] })], effects: [{ type: 'poisoned' }, { type: 'burning' }] } });
    const resolved = E.resolveAction(s, use(s));
    assert.deepEqual(resolved.result.cures, ['poisoned']); assert.deepEqual(resolved.state.actors[0].effects.map(v => v.type), ['burning']);
    assert.equal(resolved.state.rng.cursor, 0); assert.equal(resolved.state.actors[0].resources[0].quantity, 2);
});

test('Combined healing and cure applies once and cannot create a second action', () => {
    const s = fixture({ hero: { resources: [supply({ heal: '4', cures: ['bleeding'] })], effects: [{ type: 'bleeding' }] } });
    const r = E.resolveAction(s, use(s)); assert.equal(r.state.actors[0].hp, 14); assert.equal(r.state.actors[0].effects.length, 0);
    assert.equal(r.state.actors[0].resources[0].quantity, 2);
});

test('Post-combat treatment changes no initiative, uses supplies, and does not restart the battle', () => {
    let s = fixture(); s = E.stopCombat(s).state; const serial = s.turnSerial, round = s.round;
    const healed = E.resolveAction(s, { ...use(s, 2), actor: s.actors[0].id }).state;
    assert.equal(healed.phase, 'setup'); assert.equal(healed.round, round); assert.equal(healed.turnSerial, serial + 1);
    assert(healed.actors[2].hp > s.actors[2].hp);
});

test('Model may name a supply but cannot supply healing, cures, inventory or HP numbers', () => {
    const s = fixture();
    for (const property of ['hp', 'heal', 'cures', 'quantity', 'effects', 'damage']) assert.throws(() => E.resolveAction(s, { ...use(s), [property]: 99 }, { source: 'model' }), /keine HP/);
});

test('Poison imposes a separate −2 attack penalty and configurable damage at own turn end', () => {
    const s = fixture({ hero: { hp: 30, effects: [{ type: 'poisoned', damage: '3', turns: 2 }] } });
    const r = E.resolveAction(s, attack(s), { roll: () => 13 });
    assert.equal(r.result.effectPenalty, -2); assert.equal(r.result.total, 11); assert.equal(r.result.hit, false);
    assert.equal(r.state.actors[0].hp, 30); const ended = E.endTurn(r.state).state;
    assert.equal(ended.actors[0].hp, 27); assert.equal(ended.actors[0].effects[0].turns, 1);
    assert.match(E.eventText(ended.log.findLast(v => v.type === 'effect'), 'en'), /Poisoned, 3 damage/);
});

test('Poison, bleeding and burning tick once per completed own turn, never per move or action', () => {
    let s = fixture({ hero: { hp: 30, effects: [{ type: 'poisoned', damage: '1', turns: 2 }, { type: 'bleeding', damage: '2', turns: 2 }, { type: 'burning', damage: '3', turns: 2 }] } });
    s = E.resolveAction(s, { type: 'other', actor: s.actors[0].id }).state;
    s = E.moveActor(s, s.actors[0].id, { x: 0, y: 1 }).state; assert.equal(s.actors[0].hp, 30);
    s = E.endTurn(s).state; assert.equal(s.actors[0].hp, 24); assert(s.actors[0].effects.every(v => v.turns === 1));
    s = E.endTurn(s).state; s = E.endTurn(s).state; s = E.endTurn(s).state;
    assert.equal(s.actors[0].hp, 18); assert.equal(s.actors[0].effects.length, 0);
});

test('Periodic dice use the same seeded or injected dice stream and record actual rolls', () => {
    let s = fixture({ hero: { hp: 30, effects: [{ type: 'burning', damage: '2d4+1', turns: 1 }] } });
    s = E.endTurn(s, {}, { roll: () => 2 }).state;
    assert.equal(s.actors[0].hp, 25); assert.equal(s.rng.cursor, 2);
    assert.deepEqual(s.log.findLast(v => v.type === 'effect').details.rolls, [2, 2]);
});

test('Damage at turn end can knock out the actor and end combat, with real HP in the final summary', () => {
    let s = fixture({ hero: { hp: 1, effects: [{ type: 'burning', damage: '3', turns: 1 }] }, ally: { hp: 0, condition: 'stabilized' } });
    s = E.endTurn(s).state; assert.equal(s.phase, 'ended'); assert.equal(s.actors[0].hp, 0);
    assert.equal(s.actors[0].condition, 'unconscious'); assert.equal(s.log.at(-1).type, 'end');
    assert.match(E.eventText(s.log.at(-1), 'en'), /Hero.*0\/30 HP/); E.validateState(s);
});

test('Knockout pauses later effects in the same turn without extra dice or lost duration', () => {
    let s = fixture({ hero: { hp: 1, effects: [{ type: 'bleeding', damage: '2', turns: 1 }, { type: 'burning', damage: '2d4+1', turns: 3 }] } });
    s = E.endTurn(s).state; assert.equal(s.actors[0].hp, 0); assert.equal(s.rng.cursor, 0);
    assert.deepEqual(s.actors[0].effects.map(v => [v.type, v.turns]), [['burning', 3]]);
});

test('Slow halves total movement and stun allows neither a new action nor ordinary movement', () => {
    const slow = fixture({ rules: { movementBase: 5 }, hero: { effects: [{ type: 'slowed', turns: 2 }] } });
    assert.equal(E.movementBudget(slow, slow.actors[0]).total, 2);
    let s = fixture(); s = E.editActor(s, s.actors[0].id, { effects: [{ type: 'stunned', turns: 1 }] }).state;
    assert.equal(E.actionBudget(s).available, false); assert.equal(E.movementBudget(s, s.actors[0]).total, 0);
    assert.throws(() => E.resolveAction(s, use(s)), /Betäubte/);
    assert.throws(() => E.moveActor(s, s.actors[0].id, { x: 0, y: 1 }));
    s = E.endTurn(s).state; assert.equal(s.actors[0].effects.length, 1); // Newly applied in this token: no immediate expiry.
    s = E.endTurn(s).state; s = E.endTurn(s).state;
    assert.equal(s.actors[0].effects.length, 0); assert.equal(E.currentActor(s).name, 'Enemy');
});

test('Stun skips exactly one future own turn, including Basic AI, and expires', () => {
    let s = fixture({ hero: { weapons: { melee: { damage: '1d6', effects: [{ type: 'stunned', turns: 1 }] }, ranged: null } } });
    s = E.resolveAction(s, attack(s), { roll: sides => sides }).state;
    assert.equal(s.actors[1].effects[0].turns, 1); s = E.endTurn(s).state;
    assert.equal(E.currentActor(s).name, 'Ally'); assert.equal(s.actors[1].effects.length, 0);
    assert.equal(s.log.filter(v => v.type === 'effect' && v.details.skipped).length, 1);
    s = E.endTurn(s).state; s = E.endTurn(s).state; assert.equal(E.currentActor(s).name, 'Enemy');
});

test('Combat starts at the next ready actor when the first actor is stunned; all-stunned roster remains finite', () => {
    const s = fixture({ hero: { effects: [{ type: 'stunned', turns: 1 }] } });
    assert.equal(E.currentActor(s).name, 'Enemy'); assert.equal(s.actors[0].effects.length, 0);
    const all = fixture({ hero: { effects: [{ type: 'stunned', turns: 2 }] }, enemy: { effects: [{ type: 'stunned', turns: 2 }] }, ally: { effects: [{ type: 'stunned', turns: 2 }] } });
    assert.equal(all.phase, 'active'); assert(all.actors.every(a => !a.effects.length)); assert(all.round >= 3);
    E.validateState(all);
});

test('New self-inflicted status does not damage or expire in the same turn token', () => {
    let s = fixture({ hero: { hp: 30, weapons: { melee: { damage: '1d6', radius: 1, effects: [{ type: 'burning', damage: '2', turns: 1 }] }, ranged: null } } });
    const r = E.resolveAction(s, attack(s), { roll: sides => sides }); s = r.state;
    const hp = s.actors[0].hp; s = E.endTurn(s).state;
    assert.equal(s.actors[0].hp, hp); assert.equal(s.actors[0].effects[0].turns, 1);
});

test('Weapon statuses require a damaging hit, respect walls and affect surviving area targets on all sides', () => {
    const options = { hero: { hp: 30, weapons: { melee: { damage: '1d6', radius: 1, effects: [{ type: 'burning', damage: '2', turns: 3 }] }, ranged: null } } };
    let s = fixture(options); const hit = E.resolveAction(s, attack(s), { roll: sides => sides }).state;
    assert(hit.actors.slice(0, 2).every(a => a.effects.some(v => v.type === 'burning')));
    const missed = E.resolveAction(s, attack(s), { roll: () => 1 }).state; assert(missed.actors.every(a => !a.effects.length));
    s = fixture({ hero: { weapons: { melee: { damage: '1d6-100', effects: [{ type: 'poisoned' }] }, ranged: null } } });
    assert.equal(E.resolveAction(s, attack(s), { roll: sides => sides }).state.actors[1].effects.length, 0);
});

test('Reapplying a status refreshes its duration without duplicate stacks', () => {
    let s = fixture({ enemy: { effects: [{ type: 'poisoned', turns: 1, damage: '1' }] }, hero: { weapons: { melee: { damage: '1d6', effects: [{ type: 'poisoned', turns: 3, damage: '2' }] }, ranged: null } } });
    s = E.resolveAction(s, attack(s), { roll: sides => sides }).state;
    assert.equal(s.actors[1].effects.length, 1); assert.equal(s.actors[1].effects[0].turns, 3); assert.equal(s.actors[1].effects[0].damage, '2');
});

test('Finite ammo consumes on hit and miss, never on invalid range or depleted stock', () => {
    let s = fixture({ hero: { resources: [ammo()], weapons: { melee: { damage: '1d6', resource: 'arrows' }, ranged: null } } });
    for (const result of [1, 20]) {
        const r = E.resolveAction(s, attack(s), { roll: sides => Math.min(result, sides) }); assert.equal(r.state.actors[0].resources[0].quantity, 1);
    }
    let far = E.moveActor(s, s.actors[1].id, { x: 7, y: 1 }, true).state; assert.throws(() => E.resolveAction(far, attack(far))); assert.equal(far.actors[0].resources[0].quantity, 2);
    s = E.editActor(s, s.actors[0].id, { resources: [{ ...ammo(), quantity: 0 }] }).state;
    assert.equal(E.canAttack(s, s.actors[0], s.actors[1]), false); assert.throws(() => E.resolveAction(s, attack(s)), /aufgebraucht/); assert.equal(s.rng.cursor, 0);
});

test('Disabling modules freezes statuses and treats weapon attacks as unlimited; supplies cannot be used', () => {
    let s = fixture({ rules: { effectsEnabled: false, resourcesEnabled: false }, hero: { effects: [{ type: 'poisoned', turns: 2 }], resources: [supply(), { ...ammo(), quantity: 0 }], weapons: { melee: { damage: '1d6', resource: 'arrows', effects: [{ type: 'burning' }] }, ranged: null } } });
    const r = E.resolveAction(s, attack(s), { roll: sides => sides }); assert.equal(r.result.effectPenalty, 0); assert.equal(r.state.actors[1].effects.length, 0);
    s = E.endTurn(r.state).state; assert.equal(s.actors[0].effects[0].turns, 2); assert.equal(s.actors[0].hp, 10);
    const disabled = fixture({ rules: { resourcesEnabled: false } });
    assert.throws(() => E.resolveAction(disabled, use(disabled)), /Ressourcen sind deaktiviert/);
});

test('After combat status time advances only manually; downed actors keep paused effects', () => {
    let s = fixture({ hero: { effects: [{ type: 'bleeding', damage: '2', turns: 2 }] }, ally: { hp: 0, condition: 'stabilized', effects: [{ type: 'burning', damage: '99', turns: 1 }] } });
    s = E.stopCombat(s).state; s = E.elapseRound(s).state;
    assert.equal(s.actors[0].hp, 8); assert.equal(s.actors[0].effects[0].turns, 1);
    assert.equal(s.actors[2].hp, 0); assert.equal(s.actors[2].effects[0].turns, 1);
});

test('Undo, export and import preserve supplies, status durations and same-turn grace', async () => {
    const c = controller(fixture()); await c.act(use(c.state()), { roll: () => 4 }); await c.undo();
    assert.equal(c.state().actors[0].hp, 10); assert.equal(c.state().actors[0].resources[0].quantity, 3); assert.equal(E.actionBudget(c.state()).available, true);
    await c.edit(c.state().actors[0].id, { effects: [{ type: 'burning', turns: 1, damage: '2' }] });
    const saved = c.export(); await c.import(saved); const hp = c.state().actors[0].hp;
    await c.endTurn(); assert.equal(c.state().actors[0].hp, hp); assert.equal(c.state().actors[0].effects[0].turns, 1);
    await c.undo(); await c.endTurn(); assert.equal(c.state().actors[0].hp, hp);
});

test('Undo of visual edits with statuses stays quiet and preserves the current-turn grace', async () => {
    const c = controller(fixture()); await c.edit(c.state().actors[0].id, { effects: [{ type: 'burning', turns: 1 }] });
    await c.board({ cover: [{ x: 0, y: 0 }] }); await c.undo(); assert.equal(c.state().log.at(-1).chatRelevant, false);
    await c.endTurn(); assert.equal(c.state().actors[0].hp, 10);
});

test('Concurrent item use consumes and rolls once; duplicated receipt is harmless', async () => {
    const c = controller(fixture()), intent = use(c.state()); let rolls = 0;
    const results = await Promise.allSettled([c.act(intent, { receipt: 'use1', roll: () => { rolls++; return 4; } }), c.act(intent, { roll: () => { rolls++; return 4; } })]);
    assert.equal(results[0].status, 'fulfilled'); assert.equal(results[1].status, 'rejected'); assert.equal(rolls, 1);
    assert.equal((await c.act(intent, { receipt: 'use1' })).duplicate, true); assert.equal(c.state().actors[0].resources[0].quantity, 2);
});

test('Basic AI self-heals conservatively and supporting AI moves to revive a teammate', () => {
    let s = fixture({ hero: { hp: 5, control: 'basic' } });
    assert.equal(planBasicTurn(s).intent.type, 'use'); const healed = resolveBasicTurn(s, { roll: () => 8 }); assert.equal(E.currentActor(healed.state).name, 'Enemy'); assert.equal(healed.state.actors[0].hp, 15);
    s = fixture({ hero: { hp: 30, control: 'basic', aiBehavior: 'support' }, ally: { hp: 0, condition: 'unconscious', position: { x: 1, y: 4 } } });
    const plan = planBasicTurn(s); assert.equal(plan.intent.type, 'use'); assert(plan.move); assert.equal(plan.intent.target, s.actors[2].id);
    const revived = resolveBasicTurn(s, { roll: () => 4 }); assert.equal(revived.state.actors[2].hp, 6); assert.equal(revived.state.actors[2].condition, 'fit');
});

test('Basic AI uses remedies and ignores empty supplies or depleted weapons', () => {
    let s = fixture({ hero: { hp: 30, control: 'basic', effects: [{ type: 'poisoned' }], resources: [supply({ heal: '0', cures: ['poisoned'] })] } });
    assert.equal(planBasicTurn(s).intent.type, 'use'); assert.equal(resolveBasicTurn(s).state.actors[0].effects.length, 0);
    s = fixture({ hero: { hp: 30, control: 'basic', resources: [{ ...ammo(), quantity: 0 }], weapons: { melee: { damage: '1d6', resource: 'arrows', standard: null }, ranged: null } } });
    assert.equal(planBasicTurn(s).intent.type, 'other');
});

test('Old encounter and history gain empty resource/effect arrays with no mechanical changes', () => {
    const s = fixture(); for (const a of s.actors) { delete a.resources; delete a.effects; for (const w of Object.values(a.weapons)) if (w) { delete w.effects; delete w.resource; } }
    delete s.rules.resourcesEnabled; delete s.rules.effectsEnabled;
    const migrated = E.validateState(s); assert(migrated.actors.every(a => !a.resources.length && !a.effects.length));
    assert.equal(migrated.turnSerial, s.turnSerial); assert.equal(migrated.rng.cursor, s.rng.cursor);
});

test('Malformed inventories, amounts, references, effects and duplicate identifiers fail validation', () => {
    for (const raw of [[supply({ quantity: -1 })], [supply({ quantity: 1.5 })], [supply({ heal: '1d3' })], [supply({ cures: ['unknown'] })], [supply(), supply()]]) assert.throws(() => resourcesFrom(raw, E.parseDice));
    for (const raw of [[{ type: 'unknown' }], [{ type: 'burning', turns: 0 }], [{ type: 'burning' }, { type: 'burning' }]]) assert.throws(() => effectsFrom(raw, E.parseDice));
    assert.throws(() => E.actorFrom({ weapons: { melee: { damage: '1d6', resource: 'missing' }, ranged: null } }), /Waffenressource fehlt/);
    assert.equal(resourcePreset('antidote', 'en').name, 'Antidote');
});

test('Model snapshot lists available supplies, statuses, on-hit effects and module rules without granting numeric control', () => {
    const s = fixture({ hero: { effects: [{ type: 'poisoned' }] } }), prompt = E.buildPrompt(s);
    assert.match(prompt, /"resources":\[/); assert.match(prompt, /"effects":\[/); assert.match(prompt, /Use type=use/);
    assert.match(prompt, /Poison imposes −2 attack/); assert.match(prompt, /at the END/);
});

test('Next-participant guidance skips stunned turns without changing state or consuming dice', () => {
    const s = fixture({ enemy: { effects: [{ type: 'stunned', turns: 2 }] } }), saved = E.clone(s);
    assert.equal(E.turnOverview(s).next.name, 'Ally'); assert.deepEqual(s, saved);
    const ended = E.endTurn(s).state; assert.equal(E.currentActor(ended).name, 'Ally');
});

test('Maximum-duration stun cycles may trim old logs without crashing turn completion', () => {
    let s = fixture(); s = E.editActor(s, s.actors[0].id, { effects: [{ type: 'stunned', turns: 100 }] }).state;
    for (const a of s.actors.slice(1)) s = E.editActor(s, a.id, { effects: [{ type: 'stunned', turns: 100 }] }).state;
    s = E.endTurn(s).state; assert.equal(s.phase, 'active'); assert.equal(s.log.length, 300);
    assert(s.actors.every(a => a.effects.length === 0)); E.validateState(s);
});

test('Start and terminal status events stay chronological when a stunned party falls before its first action', () => {
    const s = fixture({ hero: { hp: 1, effects: [{ type: 'stunned', turns: 1 }, { type: 'burning', damage: '2' }] }, ally: { hp: 0, condition: 'stabilized' } });
    assert.equal(s.phase, 'ended'); assert.equal(s.log.at(-1).type, 'end');
    assert(s.log.findIndex(e => e.type === 'start') < s.log.findIndex(e => e.type === 'effect'));
});

test('Status-bearing area weapons never affect actors behind walls', () => {
    let s = fixture({ hero: { weapons: { melee: null, ranged: { damage: '1d8', radius: 2, effects: [{ type: 'burning' }] } }, range: 8 }, enemy: { position: { x: 3, y: 1 } }, ally: { position: { x: 3, y: 3 } } });
    s = E.setBoard(s, { blocked: [{ x: 3, y: 2 }] }).state;
    s = E.resolveAction(s, { ...attack(s), mode: 'ranged' }, { roll: sides => sides }).state;
    assert.equal(s.actors[1].effects[0].type, 'burning'); assert.equal(s.actors[2].effects.length, 0); assert.equal(s.actors[2].hp, 10);
});

test('Enemy Basic AI heals itself using the same stock, action and movement rules', () => {
    let s = fixture({ hero: { initiative: 5 }, enemy: { hp: 5, control: 'basic', resources: [supply({ heal: '6' })] } });
    assert.equal(E.currentActor(s).name, 'Enemy'); const planned = planBasicTurn(s); assert.equal(planned.intent.type, 'use');
    const healed = resolveBasicTurn(s); assert.equal(healed.state.actors[1].hp, 11); assert.equal(healed.state.actors[1].resources[0].quantity, 2);
    assert.notEqual(E.currentActor(healed.state).name, 'Enemy');
});

test('Companion templates preserve stock and weapon links but clear active combat statuses', async () => {
    let saved;
    const state = fixture({ hero: { resources: [ammo()], effects: [{ type: 'poisoned' }], weapons: { melee: { damage: '1d6', resource: 'arrows' }, ranged: null } } });
    let bundle = { state, history: [] };
    const c = createController({ key: () => 'a', read: () => bundle, write: v => { bundle = v; }, save: async () => {}, library: () => [], saveTemplate: async a => { saved = a; } });
    await c.saveTemplate(state.actors[0].id); assert.equal(saved.resources[0].quantity, 2); assert.equal(saved.weapons.melee.resource, 'arrows'); assert.equal(saved.effects.length, 0);
});
