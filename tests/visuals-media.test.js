import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../engine.js';
import { createController } from '../controller.js';
import { imageFrom, imagesFrom, backgroundFrom, backgroundGeometry } from '../visuals.js';
import { prepareImage } from '../media.js';

const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
const picture = (kind = 'portrait', width = 1) => ({ kind, width, height: 1, src: png });
function harness(initial) {
    let key = 'a', saves = 0;
    const chats = initial ?? { a: { state: E.demoState(), history: [] }, b: { state: E.demoState(), history: [] } }, templates = [], events = [];
    const io = { key: () => key, read: () => chats[key], write: b => { chats[key] = b; }, save: async () => { saves++; },
        library: () => templates, saveTemplate: async a => templates.push(E.clone(a)), onChange: (_, es) => events.push(...es) };
    const c = createController(io);
    return { c, chats, templates, events, switch: value => { key = value; }, saves: () => saves, reload: () => createController(io) };
}
test('Old states gain empty visuals without changing combat values or dice', () => {
    const s = E.demoState(); delete s.board.background; for (const a of s.actors) delete a.portrait;
    const normalized = E.validateState(s);
    assert.equal(normalized.board.background, null); assert(normalized.actors.every(a => a.portrait === null));
    assert.deepEqual(normalized.rng, s.rng); assert.deepEqual(normalized.actors.map(a => [a.hp, a.stats]), s.actors.map(a => [a.hp, a.stats]));
});
test('Identical portraits are stored once across participants and undo history', async () => {
    const { c, chats } = harness(); const [a, b] = c.state().actors;
    await c.edit(a.id, { portraitImage: picture() }); await c.edit(b.id, { portraitImage: picture() });
    assert.equal(c.state().actors[0].portrait, c.state().actors[1].portrait);
    assert.equal(Object.keys(chats.a.images).length, 1);
    assert.equal(JSON.stringify(chats.a).split('data:image/').length - 1, 1);
    assert(chats.a.history.every(s => !Object.hasOwn(s, 'images')));
});
test('Replacing or removing a portrait is reversible and retained across reload', async () => {
    const { c, reload } = harness(); const id = c.state().actors[0].id;
    await c.edit(id, { portraitImage: picture() }); const first = c.state().actors[0].portrait;
    await c.edit(id, { portraitImage: picture('portrait', 2) }); const second = c.state().actors[0].portrait;
    assert.notEqual(first, second); await c.edit(id, { portraitImage: null }); assert.equal(c.state().actors[0].portrait, null);
    const loaded = reload(); await loaded.undo(); assert.equal(loaded.state().actors[0].portrait, second); await loaded.undo();
    assert.equal(loaded.state().actors[0].portrait, first); assert.equal(loaded.image(first).src, png);
});
test('Companion portraits are portable between chats with new IDs and full HP', async () => {
    const h = harness(), id = h.c.state().actors[0].id;
    await h.c.edit(id, { portraitImage: picture(), hp: 3 }); await h.c.saveTemplate(id);
    assert.equal(h.templates[0].portrait, null); assert.equal(h.templates[0].portraitImage.src, png);
    h.switch('b'); await h.c.loadTemplate(h.templates[0].id);
    const a = h.c.state().actors.at(-1); assert.notEqual(a.id, id); assert.equal(a.hp, a.maxHp); assert.equal(a.position, null); assert.equal(h.c.image(a.portrait).src, png);
});
test('Combat JSON carries only current images and round trips into a fresh store', async () => {
    const h = harness(), id = h.c.state().actors[0].id;
    await h.c.edit(id, { portraitImage: picture() }); await h.c.edit(id, { portraitImage: picture('portrait', 2) });
    await h.c.background({ image: picture('background'), scale: 150, x: 12, y: -5, opacity: 66, gridOpacity: 15 });
    const raw = JSON.parse(JSON.stringify(h.c.export())); assert.equal(Object.keys(raw.images).length, 2); assert.equal(Object.keys(h.chats.a.images).length, 3);
    h.switch('b'); await h.c.import(raw);
    assert.equal(h.c.image(h.c.state().actors[0].portrait).width, 2); assert.equal(h.c.state().board.background.x, 12); assert.equal(h.c.image(h.c.state().board.background.asset).src, png);
});
test('Missing images reject imports atomically', async () => {
    const h = harness(); await h.c.edit(h.c.state().actors[0].id, { portraitImage: picture() }); const raw = h.c.export(); raw.images = {};
    h.switch('b'); const before = E.clone(h.chats.b); await assert.rejects(h.c.import(raw), /Figurenbild fehlt/); assert.deepEqual(h.chats.b, before);
});
test('Image collisions cannot silently change images in undo history', async () => {
    const h = harness(); await h.c.edit(h.c.state().actors[0].id, { portraitImage: picture() }); const raw = h.c.export(); raw.images[h.c.state().actors[0].portrait].width = 2;
    const before = E.clone(h.chats.a); await assert.rejects(h.c.import(raw), /kollidiert/); assert.deepEqual(h.chats.a, before);
});
test('Failed actor validation does not leave an orphan image or history entry', async () => {
    const h = harness(), before = E.clone(h.chats.a);
    await assert.rejects(h.c.edit(h.c.state().actors[0].id, { portraitImage: picture(), hp: -1 })); assert.deepEqual(h.chats.a, before);
});
test('Unused images are pruned when they leave the 30-change undo window', async () => {
    const h = harness(), id = h.c.state().actors[0].id; let first;
    for (let i = 1; i <= 33; i++) { await h.c.edit(id, { portraitImage: picture('portrait', i) }); first ??= h.c.state().actors[0].portrait; }
    assert.equal(h.c.historyLength(), 30); assert.equal(Object.keys(h.chats.a.images).length, 31); assert.equal(h.c.image(first), null);
});
test('Background display changes preserve turn, HP, paths, walls, RNG and events', async () => {
    const h = harness(); await h.c.start(false); const before = E.clone(h.c.state()), count = h.events.length;
    await h.c.background({ image: picture('background'), fit: 'cover', scale: 130 });
    for (const key of ['actors', 'movement', 'order', 'turnSerial', 'rng', 'log']) assert.deepEqual(h.c.state()[key], before[key]);
    assert.equal(h.events.length, count); assert.deepEqual(E.pathDistances(h.c.state(), before.actors[0].position, before.actors[0].id), E.pathDistances(before, before.actors[0].position, before.actors[0].id));
    await h.c.background({ enabled: false }); assert.equal(h.c.state().board.background.enabled, false); await h.c.undo(); assert.equal(h.c.state().board.background.enabled, true);
});
test('Terrain generation and board size changes retain the aligned background', async () => {
    const h = harness(); await h.c.background({ image: picture('background'), x: 30, y: -20, scale: 125 }); const background = E.clone(h.c.state().board.background);
    await h.c.randomBoard({ preset: 'forest', seed: 'portraits' }); await h.c.board({ width: 20, height: 15 }); assert.deepEqual(h.c.state().board.background, background);
});
test('Removing and undoing the map image keeps its original settings', async () => {
    const h = harness(); await h.c.background({ image: picture('background'), gridOpacity: 18 }); const background = E.clone(h.c.state().board.background);
    await h.c.background(null); assert.equal(h.c.state().board.background, null); await h.c.undo(); assert.deepEqual(h.c.state().board.background, background);
});
test('Image and transform data do not enter model context', async () => {
    const h = harness(); await h.c.start(false); const before = E.buildPrompt(h.c.state());
    await h.c.background({ image: picture('background'), scale: 333, x: 13 }); assert.equal(E.buildPrompt(h.c.state()), before);
    await h.c.edit(h.c.state().actors[0].id, { portraitImage: picture() }); const prompt = E.buildPrompt(h.c.state()); assert(!prompt.includes('data:image/')); assert(!prompt.includes(h.c.state().actors[0].portrait)); assert(!prompt.includes('gridOpacity'));
});
test('Zoom saves per chat without creating combat history, advancing or rolling', async () => {
    const h = harness(); await h.c.start(false); const before = E.clone(h.c.state()), history = h.c.historyLength();
    await h.c.view({ zoom: 8, fit: true }); assert.deepEqual(h.c.state(), before); assert.equal(h.c.historyLength(), history); assert.deepEqual(h.reload().view(), { zoom: 8, fit: true });
    h.switch('b'); assert.deepEqual(h.c.view(), { zoom: 44, fit: false }); await assert.rejects(h.c.view({ zoom: 97 })); assert.equal(h.c.view().zoom, 44);
});
test('A serialized chat bundle restores pictures, references and zoom in a new controller', async () => {
    const h = harness(); await h.c.edit(h.c.state().actors[0].id, { portraitImage: picture() }); await h.c.background({ image: picture('background'), y: -12 }); await h.c.view({ zoom: 12, fit: true });
    const restored = harness(JSON.parse(JSON.stringify(h.chats)));
    assert.equal(restored.c.image(restored.c.state().actors[0].portrait).src, png); assert.equal(restored.c.state().board.background.y, -12); assert.deepEqual(restored.c.view(), { zoom: 12, fit: true });
});
test('Portrait add requests queued in one chat never write to another', async () => {
    const h = harness(), before = E.clone(h.chats.b), pending = h.c.add({ name: 'Picture', portraitImage: picture() }); h.switch('b');
    await assert.rejects(pending, /Chat wurde gewechselt/); assert.deepEqual(h.chats.b, before);
});
test('Background geometry preserves aspect ratio through fit, zoom, scale and offsets', () => {
    const image = { width: 400, height: 200 };
    assert.deepEqual(backgroundGeometry({ fit: 'contain', scale: 100, x: 0, y: 0 }, image, 400, 400), { width: 400, height: 200, left: 200, top: 200 });
    assert.deepEqual(backgroundGeometry({ fit: 'cover', scale: 100, x: 0, y: 0 }, image, 400, 400), { width: 800, height: 400, left: 200, top: 200 });
    assert.deepEqual(backgroundGeometry({ fit: 'contain', scale: 150, x: 25, y: -25 }, image, 200, 200), { width: 300, height: 150, left: 150, top: 50 });
});
test('Remote URLs, SVG, invalid base64 and excessive sizes are rejected', () => {
    for (const src of ['https://example.org/image.png', 'file:///private.png', 'javascript:alert(1)', 'data:image/svg+xml;base64,PHN2Zz4=', 'data:image/png;base64,not-a-picture']) assert.throws(() => imageFrom({ ...picture(), src }));
    assert.throws(() => imageFrom(picture('portrait', 513))); assert.throws(() => imagesFrom([])); assert.throws(() => backgroundFrom({ asset: 'javascript:x' }));
    assert.throws(() => backgroundFrom({ asset: `img-${crypto.randomUUID()}`, scale: NaN }));
});
function browser({ width = 4096, height = 2048, fail = false, output } = {}) {
    const revoked = [], draws = []; let allocated = 0, attempts = 0;
    class Image { naturalWidth = width; naturalHeight = height; set src(_) { queueMicrotask(() => fail ? this.onerror() : this.onload()); } }
    const canvas = { getContext: () => ({ clearRect() {}, drawImage() { draws.push([canvas.width, canvas.height]); } }), toDataURL: () => output?.(++attempts) ?? png };
    return { Image, canvas: () => canvas, URL: { createObjectURL: () => { allocated++; return 'blob:test'; }, revokeObjectURL: url => revoked.push(url) }, revoked, draws, allocated: () => allocated };
}
test('File processing downscales portraits and maps independently and releases object URLs', async () => {
    const file = { size: 1024, type: 'image/png' }, portraitBrowser = browser(), mapBrowser = browser();
    const portrait = await prepareImage(file, 'portrait', portraitBrowser), map = await prepareImage(file, 'background', mapBrowser);
    assert.deepEqual([portrait.width, portrait.height], [512, 256]); assert.deepEqual([map.width, map.height], [2048, 1024]);
    assert.deepEqual(portraitBrowser.revoked, ['blob:test']); assert.deepEqual(mapBrowser.revoked, ['blob:test']);
});
test('Unsupported files and large uploads fail before decoding', async () => {
    const b = browser(); await assert.rejects(prepareImage({ size: 100, type: 'image/svg+xml' }, 'portrait', b)); await assert.rejects(prepareImage({ size: 21 * 1024 * 1024, type: 'image/png' }, 'portrait', b)); assert.equal(b.allocated(), 0);
});
test('Decode and pixel-limit failures release temporary URLs', async () => {
    for (const b of [browser({ fail: true }), browser({ width: 10000, height: 10000 })]) { await assert.rejects(prepareImage({ size: 100, type: 'image/png' }, 'background', b)); assert.deepEqual(b.revoked, ['blob:test']); }
});
test('Oversized compressed outputs reduce quality and dimensions before succeeding', async () => {
    const b = browser({ output: attempt => attempt === 1 ? 'data:image/png;base64,' + 'A'.repeat(160 * 1024 * 2) : png });
    const image = await prepareImage({ size: 1024, type: 'image/gif' }, 'portrait', b); assert(image.width < 512); assert.equal(b.draws.length, 2);
});
test('Image construction failures still release the allocated URL', async () => {
    const b = browser(); b.Image = class { constructor() { throw new Error('decode unavailable'); } };
    await assert.rejects(prepareImage({ size: 100, type: 'image/png' }, 'portrait', b), /decode unavailable/); assert.deepEqual(b.revoked, ['blob:test']);
});
