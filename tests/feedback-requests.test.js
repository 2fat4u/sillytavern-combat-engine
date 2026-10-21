import test from 'node:test';
import assert from 'node:assert/strict';
import { createModelRequests } from '../model-requests.js';
import { createSounds, cuesForChange, soundPreferences } from '../sounds.js';
import { statusMarkers } from '../status-ui.js';
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
test('A provider returning without a completion event still releases the request gate', async () => {
    let released = 0; const requests = createModelRequests({ released: () => { released++; } });
    await requests.run(async () => {}); assert.equal(requests.current(), null); assert.equal(released, 1);
    assert.equal(await requests.run(async () => 'second'), 'second');
});
test('Never-settling provider is cancellable immediately; late completion cannot re-lock', async () => {
    let finish, released = 0; const requests = createModelRequests({ released: () => { released++; } });
    const pending = requests.run(() => new Promise(resolve => { finish = resolve; })); await tick();
    await assert.rejects(requests.run(() => {}), /läuft bereits/); requests.cancel(new Error('cancelled'));
    await assert.rejects(pending, /cancelled/); assert.equal(requests.current(), null); finish(); await tick(); assert.equal(released, 1);
});
test('Never-settling provider is released automatically by the bounded timeout', async () => {
    const requests = createModelRequests(); await assert.rejects(requests.run(() => new Promise(() => {}), { timeoutMs: 5 }), /3 Minuten/); assert.equal(requests.current(), null);
});
test('Synchronous provider errors release the gate and preserve abort signal support', async () => {
    const requests = createModelRequests(); await assert.rejects(requests.run(request => { assert(request.signal instanceof AbortSignal); throw new Error('network'); }), /network/);
    assert.equal(requests.current(), null);
});
test('Sounds are disabled by default and invalid settings cannot become playback values', () => {
    assert.deepEqual(soundPreferences(), { soundEnabled: false, soundVolume: 35 });
    for (const soundVolume of [-1, 101, NaN, '20']) assert.throws(() => soundPreferences({ soundVolume }));
});
test('Audio requires enabling and unlocking; volume zero and mute suppress later cues', async () => {
    let preferences = { soundEnabled: false, soundVolume: 35 }, starts = 0, closed = false;
    const context = { currentTime: 0, state: 'suspended', destination: {}, resume() { this.state = 'running'; }, close() { closed = true; }, createOscillator: () => ({ frequency: { setValueAtTime() {} }, connect() {}, disconnect() {}, start() { starts++; }, stop() {} }), createGain: () => ({ gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {} }) };
    const sound = createSounds(() => preferences, { contextFactory: () => context }); sound.play('hit'); assert.equal(starts, 0); assert.equal(await sound.unlock(), false);
    preferences.soundEnabled = true; assert.equal(await sound.unlock(), true); sound.play('hit'); assert.equal(starts, 2);
    preferences.soundVolume = 0; sound.play('turn'); assert.equal(starts, 2); preferences.soundVolume = 35; preferences.soundEnabled = false; sound.play('miss'); assert.equal(starts, 2);
    sound.close(); assert(closed);
});
test('Unavailable or rejected audio cannot interrupt combat or throw', async () => {
    const sound = createSounds(() => ({ soundEnabled: true }), { contextFactory: () => { throw new Error('blocked'); } });
    assert.equal(await sound.unlock(), false); assert.doesNotThrow(() => sound.play('effect'));
});
test('Feedback follows authoritative outcomes and actual turn handovers, not edits, undo or imports', () => {
    const before = { phase: 'active', turnSerial: 1 }, same = { ...before }, next = { ...before, turnSerial: 2 };
    assert.deepEqual(cuesForChange(before, same, [{ type: 'hit', details: { appliedEffects: [{}] } }]), ['hit', 'effect']);
    assert.deepEqual(cuesForChange(before, next, [{ type: 'miss' }]), ['miss', 'turn']);
    assert.deepEqual(cuesForChange(before, same, [{ type: 'edit' }]), []);
    assert.deepEqual(cuesForChange(before, next, [{ type: 'undo' }]), []);
    assert.deepEqual(cuesForChange(before, next, [{ type: 'import' }]), []);
});
test('Each status has a distinct visible symbol, localized duration and paused appearance', () => {
    const actor = { hp: 10, effects: ['poisoned', 'bleeding', 'burning', 'stunned', 'slowed'].map(type => ({ type, turns: 2 })) };
    const s = { rules: { effectsEnabled: true } }, de = statusMarkers(s, actor, 'de', true), en = statusMarkers(s, actor, 'en');
    for (const type of actor.effects.map(v => v.type)) assert(de.includes('ct-effect-' + type));
    assert(de.includes('☠') && de.includes('🔥') && de.includes('⌛')); assert.match(de, /2 eigene Züge/); assert.match(en, /Poisoned · 2 own turns/);
    assert.match(statusMarkers(s, { ...actor, hp: 0 }, 'en'), /ct-effects-paused/); assert.match(statusMarkers({ rules: { effectsEnabled: false } }, actor, 'de'), /pausiert/);
});
