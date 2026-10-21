import test from 'node:test';
import assert from 'node:assert/strict';
import { demoState, startCombat, resolveAction, currentActor, editActor, resultText } from '../engine.js';

test('Fehlschläge behaupten keine Schadensreduktion; leerer sonstiger Zug hat keinen leeren Satz', () => {
    let s = startCombat(demoState(), false).state;
    const actor = currentActor(s), target = s.actors.find(a => a.side === 'enemy');
    s.board.cover = [target.position];
    const miss = resolveAction(s, { type: 'attack', actor: actor.id, target: target.id, mode: 'ranged' }, { roll: () => 1 }).result;
    assert(!miss.hit); assert(miss.cover);
    assert(!resultText(miss, 'en').includes('Cover reduced the damage'));
    assert(!resultText(miss, 'de').includes('Deckung reduziert den Schaden'));
    const other = resolveAction(s, { type: 'other', actor: actor.id }).result;
    for (const language of ['en', 'de']) assert(!resultText(other, language).includes(': .'));
});

test('Zustand nach einem Knockout beginnt in beiden Sprachen mit einem Großbuchstaben', () => {
    let s = demoState(); s = editActor(s, s.actors[0].id, { attackBonus: 100, damageBonus: 100 }).state;
    s = startCombat(s, false).state;
    const r = resolveAction(s, { type: 'attack', actor: currentActor(s).id, target: s.actors.find(a => a.side === 'enemy').id }, { roll: () => 2 }).result;
    assert.equal(r.afterHp, 0);
    assert.match(resultText(r, 'en'), /\. Unconscious/);
    assert.match(resultText(r, 'de'), /\. Bewusstlos/);
});
