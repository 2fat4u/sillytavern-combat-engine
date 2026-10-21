import test from 'node:test';
import assert from 'node:assert/strict';
import { createRulesDrafts } from '../rules-draft.js';
import * as E from '../engine.js';

test('197 draft checkbox and partial number edits do not alter combat state; reverting clears the warning', () => {
    const s=E.emptyState(), before=E.clone(s), d=createRulesDrafts();
    d.stage('a',s.rules,'reactionsEnabled',true);d.stage('a',s.rules,'movementBase','');
    assert(d.dirty('a'));assert.equal(d.view('a',s.rules).movementBase,'');assert.equal(d.view('a',s.rules).reactionsEnabled,true);
    assert.deepEqual(s,before);
    d.stage('a',s.rules,'movementBase',s.rules.movementBase);d.stage('a',s.rules,'reactionsEnabled',s.rules.reactionsEnabled);
    assert(!d.dirty('a'));
});
test('197 drafts belong to their chat and can be explicitly discarded', () => {
    const r=E.emptyState().rules,d=createRulesDrafts();d.stage('a',r,'movementBase','7');d.stage('b',r,'movementBase','2');
    assert.equal(d.view('a',r).movementBase,'7');assert.equal(d.view('b',r).movementBase,'2');assert.equal(d.view('c',r).movementBase,r.movementBase);
    d.discard('a');assert(!d.dirty('a'));assert(d.dirty('b'));assert.equal(d.view('a',r).movementBase,r.movementBase);
});
test('197 saving a draft preserves unrelated intervening rule changes and merges decimal effect overrides', () => {
    let s=E.setRules(E.emptyState(),{effectDamageOverrides:{poisoned:'2'},effectDurationOverrides:{rooted:4}}).state;
    const d=createRulesDrafts();d.stage('a',s.rules,'offensiveAttack','1,25');d.stage('a',s.rules,'effectDamage-burning','1d6');d.stage('a',s.rules,'effectDuration-rooted','');
    s=E.setRules(s,{movementBase:7}).state;
    s=E.setRules(s,d.patch('a',s.rules)).state;
    assert.equal(s.rules.offensiveAttack,1.25);assert.equal(s.rules.movementBase,7);assert.equal(s.rules.effectDamageOverrides.poisoned,'2');assert.equal(s.rules.effectDamageOverrides.burning,'1d6');assert(!s.rules.effectDurationOverrides.rooted);
});
test('197 invalid draft save stays atomic and retains the input for correction', () => {
    const s=E.emptyState(),before=E.clone(s),d=createRulesDrafts();d.stage('a',s.rules,'climbCost','oops');
    assert.throws(()=>E.setRules(s,d.patch('a',s.rules)));assert.deepEqual(s,before);assert(d.dirty('a'));assert.equal(d.view('a',s.rules).climbCost,'oops');
});
