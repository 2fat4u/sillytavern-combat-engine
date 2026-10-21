import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { initialize } from '../index.js';
import { VERSION } from '../version.js';

test('Manifest, package and generated UI version agree', async () => {
    for (const name of ['manifest.json', 'package.json']) {
        const data = JSON.parse(await fs.readFile(new URL('../' + name, import.meta.url), 'utf8'));
        assert.equal(VERSION, data.version);
    }
});

test('The extension settings list displays the actual release version', () => {
    const nodes = [];
    class Element {
        constructor() { this.dataset = {}; this.innerHTML = ''; }
        addEventListener() {} querySelector() { return new Element(); } querySelectorAll() { return []; }
        append(value) { nodes.push(value); }
    }
    const host = new Element();
    globalThis.document = { body: new Element(), createElement: () => new Element(), querySelector: selector => selector === '#extensions_settings2' ? host : null };
    const context = { chatId: 'version', chat: [], chatMetadata: {}, extensionSettings: {}, eventTypes: {}, eventSource: { on() {} }, setExtensionPrompt() {}, saveMetadata: async () => {}, saveMetadataDebounced() {}, saveSettingsDebounced() {} };
    globalThis.SillyTavern = { getContext: () => context };
    initialize({ uiFactory: () => ({ open() {}, chatChanged() {} }), quickAccess: false });
    assert(nodes.some(node => node.innerHTML.includes('Deterministic Combat · ' + VERSION)));
    assert(!nodes.some(node => node.innerHTML.includes('Deterministic Combat · 1.4.0')));
});


test('All shipped local module imports use this release cache key',async()=>{
 const root=new URL('../',import.meta.url);let count=0;for(const name of await fs.readdir(root)){if(!name.endsWith('.js'))continue;const text=await fs.readFile(new URL(name,root),'utf8');for(const match of text.matchAll(/^import[^\r\n]*from\s+['"](\.\/[^'"]+\.js(?:\?[^'"]*)?)['"]/gm)){assert.equal(match[1].split('?')[1],'v='+encodeURIComponent(VERSION),name+': '+match[1]);count++;}}assert(count>100);
});
