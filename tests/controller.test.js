import test from 'node:test';
import assert from 'node:assert/strict';
import { createController } from '../controller.js';
import * as E from '../engine.js';
function harness() {
    let key = 'chat-a';
    const chats = { 'chat-a': { state: E.demoState(), history: [] }, 'chat-b': { state: E.emptyState(), history: [] } };
    const templates = [];
    const c = createController({ key: () => key, read: () => chats[key], write: b => { chats[key] = b; }, save: async () => {},
        library: () => templates, saveTemplate: async a => templates.push(a) });
    return { c, chats, switch: k => { key = k; }, templates };
}
test('Undo stellt HP und Initiative wieder her, sperrt aber alte Aktionen', async () => {
    const { c } = harness(); await c.start(false); const s = E.clone(c.state());
    const intent = { type: 'attack', actor: s.actors[0].id, target: s.actors[2].id, turn: E.turnToken(s) };
    await c.act(intent, { roll: () => 8, receipt: 'message-1' });
    assert.notEqual(c.state().actors[2].hp, s.actors[2].hp);
    await c.undo(); assert.equal(c.state().actors[2].hp, s.actors[2].hp);
    assert.equal(E.currentActor(c.state()).id, E.currentActor(s).id);
    assert(c.state().receipts.includes('message-1')); assert.notEqual(E.turnToken(c.state()), E.turnToken(s));
    assert.equal((await c.act(intent, { receipt: 'message-1' })).duplicate, true);
    await assert.rejects(c.act(intent), /Veralteter Zug/);
});
test('Queued chat actions cannot write to a newly selected chat', async () => {
    const h = harness(); const p = h.c.add({ name: 'Old chat action' }); h.switch('chat-b');
    await assert.rejects(p, /Chat wurde gewechselt/);
    assert.equal(h.chats['chat-b'].state.actors.length, 0);
});
test('Serialisierte gleichzeitige Aktionen würfeln nur einmal für denselben Zug', async () => {
    const { c } = harness(); await c.start(false); const s = c.state(); let rolls = 0;
    const intent = { type: 'attack', actor: E.currentActor(s).id, target: s.actors[2].id, turn: E.turnToken(s) };
    const results = await Promise.allSettled([c.act(intent, { roll: () => { rolls++; return 8; } }), c.act(intent, { roll: () => { rolls++; return 8; } })]);
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    assert.equal(rolls, 2);
});
test('Companion-Vorlagen erhalten neue IDs und volle HP, unabhängig vom Chat', async () => {
    const { c, templates } = harness(); await c.edit(c.state().actors[0].id, { hp: 4 });
    const id = c.state().actors[0].id; await c.saveTemplate(id); await c.loadTemplate(templates[0].id);
    const copy = c.state().actors.at(-1); assert.notEqual(copy.id, id); assert.equal(copy.hp, copy.maxHp); assert.equal(copy.position, null);
});
test('Roster-Import ist atomar, wenn ein Teilnehmer ungültige Werte hat', async () => {
    const { c } = harness(); const before = E.clone(c.state());
    await assert.rejects(c.addRoster([{ name: 'OK' }, { name: 'Broken', damage: '1d3' }]));
    assert.deepEqual(c.state(), before);
});

test('Undo und Import behalten verbrauchte Bewegung beim Erneuern des Zugtokens', async () => {
    const { c } = harness(); await c.start(false);
    const id = c.state().actors[0].id;
    await c.move(id, { x: 3, y: 2 }); await c.move(id, { x: 3, y: 1 });
    await c.undo(); assert.equal(E.movementBudget(c.state(), c.state().actors[0]).spent, 2);
    const saved = c.export(); await c.import(saved);
    assert.equal(E.movementBudget(c.state(), c.state().actors[0]).spent, 2);
});

test('Rettung kann rückgängig gemacht werden und Export behält den laufenden Countdown', async () => {
    const { c } = harness(); await c.start(false);
    await c.edit(c.state().actors[2].id, { hp: 0 });
    const before = c.export(); await c.act({ type: 'stabilize', actor: c.state().actors[0].id, target: c.state().actors[2].id });
    assert.equal(c.state().actors[2].condition, 'stabilized'); await c.undo();
    assert.equal(c.state().actors[2].condition, 'unconscious'); assert.equal(c.state().actors[2].roundsLeft, 3);
    await c.import(before); assert.equal(c.state().actors[2].roundsLeft, 3);
});
