import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../engine.js';
import { createController } from '../controller.js';
import { mapFrom, mapsFrom } from '../maps.js';
const image = { kind: 'background', width: 1, height: 1, src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==' };
function fixture() {
    let key = 'a', maps = []; const chats = { a: { state: E.demoState(), history: [] }, b: { state: E.demoState(), history: [] } };
    const c = createController({ key: () => key, read: () => chats[key], write: b => { chats[key] = b; }, save: async () => {}, maps: () => maps, saveMaps: async values => { maps = values; } });
    return { c, chats, switch: value => { key = value; } };
}
test('Map capture includes terrain and image alignment but no actors, rules, HP, initiative or portrait images', async () => {
    const { c } = fixture(); await c.background({ image, scale: 140, x: 20 }); await c.board({ blocked: [{ x: 0, y: 0 }], cover: [{ x: 1, y: 0 }] });
    const before = c.export(), map = await c.saveMap('Forest bridge');
    assert.equal(map.backgroundImage.src, image.src); assert.equal(map.board.background.scale, 140); assert.equal(map.board.blocked.length, 1);
    for (const field of ['actors', 'rules', 'order', 'images', 'log']) assert(!Object.hasOwn(map, field));
    assert.deepEqual(c.export(), before); assert.equal(c.maps().length, 1);
});
test('Saved places can be loaded in another chat, preserving actor values and unplacing them by default', async () => {
    const h = fixture(); await h.c.background({ image, opacity: 70 }); const map = await h.c.saveMap('Tavern');
    h.switch('b'); const before = E.clone(h.c.state()); await h.c.loadMap(map.id);
    assert.equal(h.c.state().actors.length, before.actors.length); assert(h.c.state().actors.every(a => !a.position));
    for (let i = 0; i < before.actors.length; i++) assert.deepEqual({ ...h.c.state().actors[i], position: null }, { ...before.actors[i], position: null });
    assert.deepEqual(h.c.state().rng, before.rng); assert.equal(h.c.state().turnSerial, before.turnSerial);
    assert.equal(h.c.image(h.c.state().board.background.asset).src, image.src); E.validateState(h.c.state());
});
test('Map load may retain valid positions and unplaces only cells blocked or outside the new map', async () => {
    const { c } = fixture(), raw = { kind: 'combat-map', version: 1, name: 'Small room', board: { width: 5, height: 7, blocked: [{ x: 3, y: 4 }] } };
    const map = await c.importMap(raw); await c.loadMap(map.id, { keepPositions: true });
    assert.equal(c.state().actors[0].position, null); assert.deepEqual(c.state().actors[1].position, { x: 2, y: 6 }); assert.equal(c.state().actors[3].position, null);
});
test('Map load and its background can be undone together without losing the previous image', async () => {
    const { c } = fixture(); await c.background({ image, x: 30 }); const map = await c.saveMap('Earlier');
    await c.background({ image, x: -30 }); const before = c.export(); await c.loadMap(map.id); await c.undo();
    assert.equal(c.state().board.background.x, -30); assert.deepEqual(c.state().actors, before.actors); assert.equal(c.image(c.state().board.background.asset).src, image.src);
});
test('Loading during an active combat is rejected atomically; saving is permitted', async () => {
    const { c } = fixture(); await c.start(false); const map = await c.saveMap('Encounter'), before = c.export();
    await assert.rejects(c.loadMap(map.id), /Kampf vor/); assert.deepEqual(c.export(), before); assert.equal(c.maps().length, 1);
});
test('Portable maps can be exported, imported, renamed and removed independently of combat', async () => {
    const { c } = fixture(), first = await c.saveMap('Street'); const imported = await c.importMap(c.exportMap(first.id));
    assert.notEqual(first.id, imported.id); await c.renameMap(imported.id, 'Back alley'); assert.equal(c.maps()[1].name, 'Back alley');
    const before = c.export(); await c.deleteMap(first.id); assert.equal(c.maps().length, 1); assert.deepEqual(c.export(), before);
});
test('Malformed maps, missing pictures, duplicate IDs and excessive libraries are rejected', () => {
    const base = { kind: 'combat-map', version: 1, id: 'a', name: 'Map', board: { width: 5, height: 5 } };
    for (const bad of [{}, { ...base, name: '' }, { ...base, board: { width: 0 } }, { ...base, board: { blocked: [{ x: 0, y: 0 }], cover: [{ x: 0, y: 0 }] } }, { ...base, backgroundImage: { ...image, src: 'https://example.com/map.png' } }]) assert.throws(() => mapFrom(bad));
    assert.throws(() => mapsFrom([base, base]), /Doppelte/); assert.throws(() => mapsFrom(Array.from({ length: 51 }, (_, i) => ({ ...base, id: String(i) }))), /höchstens/);
});
test('Map image identifiers from another export do not overwrite images used by existing history', async () => {
    const { c } = fixture(); await c.background({ image, x: 12 }); const map = await c.saveMap('Room');
    const originalRef = c.state().board.background.asset; const exported = c.exportMap(map.id);
    exported.backgroundImage = { ...image, width: 2 }; const other = await c.importMap(exported); await c.loadMap(other.id);
    assert.notEqual(c.state().board.background.asset, originalRef); assert.equal(c.image(originalRef).width, 1);
});
