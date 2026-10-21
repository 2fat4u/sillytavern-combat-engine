import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createUI } from '../ui.js';
import { createUIEnglish } from '../ui.en.js';
import { createController } from '../controller.js';
import * as E from '../engine.js';
import { EFFECTS, resourcePreset } from '../effects.js';
import { createModelRequests } from '../model-requests.js';
import { skillPreset } from '../skills.js';

const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
// A limited event/DOM harness. It checks behavior and markup, not browser layout.
class Element {
    constructor() { this.innerHTML = ''; this.events = {}; this.dataset = {}; this.nodes = {}; this.children = []; this.elements = { enabled: { checked: true }, fit: { value: 'contain' }, scale: { value: '100' }, x: { value: '0' }, y: { value: '0' }, opacity: { value: '90' }, gridOpacity: { value: '25' } }; }
    setAttribute() {} append(e) { this.children.push(e); } remove() { this.removed = true; }
    addEventListener(name, fn) { (this.events[name] ??= []).push(fn); }
    async emit(name, value) { for (const fn of this.events[name] ?? []) await fn(value); }
    closest(selector){return selector==='form'?this.parentForm:null;}
    querySelector(selector) {
        if (selector === 'form' && this.innerHTML.includes('<form novalidate>')) return this.form ??= new Element();
        if (selector === '.ct-board-scroll') return { clientWidth: this.boardWidth ?? 560 };
        if (['[type=submit]', '.ct-editor-error'].includes(selector)) return this.nodes[selector] ??= new Element();
        if (selector.startsWith('[data-') && this.innerHTML.includes(selector.slice(1, -1))) {const node=this.nodes[selector]??=new Element();node.parentForm=this.querySelector('form');return node;}
        return null;
    }
    querySelectorAll() { return []; } showModal() { this.open = true; } close() { this.open = false; for (const fn of this.events.close ?? []) fn(); }
}
let original;
beforeEach(() => {
    original = { document: globalThis.document, Image: globalThis.Image, FormData: globalThis.FormData, create: URL.createObjectURL, revoke: URL.revokeObjectURL };
    globalThis.document = { body: new Element(), createElement: type => type === 'canvas' ? { width: 0, height: 0, getContext: () => ({ clearRect() {}, drawImage() {} }), toDataURL: () => png } : new Element() };
    globalThis.Image = class { naturalWidth = 800; naturalHeight = 400; set src(_) { queueMicrotask(() => this.onload()); } };
    URL.createObjectURL = () => 'blob:test'; URL.revokeObjectURL = () => {};
});
afterEach(() => { globalThis.document = original.document; globalThis.Image = original.Image; globalThis.FormData = original.FormData; URL.createObjectURL = original.create; URL.revokeObjectURL = original.revoke; });
function fixture(language = 'de', extra = {}) {
    let key = 'a'; const chats = { a: { state: E.demoState(), history: [] }, b: { state: E.demoState(), history: [] } }, library = [];
    const c = createController({ key: () => key, read: () => chats[key], write: b => { chats[key] = b; }, save: async () => {}, preferences: () => ({ language,contextOnClick:true }), library: () => library, saveTemplate: async a => library.push(a), ...extra });
    const ui = (language === 'en' ? createUIEnglish : createUI)(c);
    const click = (action, id) => ui.root.emit('click', { target: { closest: () => ({ dataset: { action, id }, disabled: false }) } });
    return { c, ui, chats, click, switch: value => { key = value; ui.chatChanged(); ui.open(); }, editor: () => document.body.children.at(-1) };
}
function actorForm(a) {
    const values = new Map(Object.entries({ name: a.name, side: a.side, maxHp: a.maxHp, hp: a.hp, baseHp: a.baseHp, dc: a.dc, initiative: a.initiative, control: a.control, aiBehavior: a.aiBehavior, attackBonus: a.attackBonus, attackMode: a.attackMode, attackStat: a.attackStat, range: a.range, meleeDamage: a.weapons.melee.damage, meleeRadius: '0', meleeBonus: '0', rangedDamage: a.weapons.ranged?.damage ?? '', rangedRadius: '0', rangedBonus: '0', movementBonus: '0', deathRounds: '', condition: 'auto', roundsLeft: '', notes: '' }));
    for (const [key, value] of Object.entries(a.stats)) values.set('stat-' + key, value);
    globalThis.FormData = class { constructor() { return values; } };
    return values;
}
async function submit(d) { const form = d.querySelector('form'); await form.emit('submit', { preventDefault() {}, currentTarget: form }); return form.querySelector('.ct-editor-error').textContent; }
async function upload(d) { await d.querySelector('[data-image-file]').emit('change', { target: { files: [{ type: 'image/png', size: 1000 }] } }); }

test('199 English rule controls and help expose the complete encounter module',async()=>{
    const f=fixture('en');await f.click('tab-rules');for(const caption of ['Distance-based cover','Friendly Fire – area damage','Pit rescue rounds','New participant initiative'])assert(f.ui.root.innerHTML.includes(caption),caption);await f.click('tab-help');assert.match(f.ui.root.innerHTML,/Participants, reserve and initiative/);assert.match(f.ui.root.innerHTML,/Returning participants retain their slot/);f.ui.destroy();
});
test('199 terrain brush places and erases pits with a visible and accessible marker',async()=>{
    const f=fixture('en');await f.click('pit-mode');const cell=(x,y)=>f.ui.root.emit('click',{target:{closest:()=>({dataset:{action:'cell',x,y},disabled:false})}});await cell(8,8);assert(E.isPit(f.c.state(),{x:8,y:8}));assert.match(f.ui.root.innerHTML,/ct-pit-mark/);await f.click('erase-mode');await cell(8,8);assert(!E.isPit(f.c.state(),{x:8,y:8}));f.ui.destroy();
});
test('199 starting an incomplete board offers cancel and an explicit placed-only start',async()=>{
    const f=fixture('en'),a=f.c.state().actors[1];await f.c.move(a.id,null,true);await f.click('start');assert.equal(f.c.state().phase,'setup');assert.match(f.editor().innerHTML,/Not all participants are placed/);assert.match(f.editor().innerHTML,/Back to deployment/);f.editor().close();assert.equal(f.c.state().phase,'setup');await f.click('start');f.editor().querySelector('form').elements.roll={checked:false};assert.equal(await submit(f.editor()),undefined);assert.equal(f.c.state().phase,'active');assert(f.c.state().actors[1].reserve);f.ui.destroy();
});
test('199 context menu removes a figure without deleting its profile and shows deployment choices',async()=>{
    const f=fixture('en');await f.c.start(false);const b=f.c.state().actors[1];await f.click('actor-menu',b.id);assert.match(f.editor().innerHTML,/Remove from board/);await f.editor().querySelector('form').emit('click',{target:{closest:q=>q==='[data-context-manage]'?{dataset:{contextManage:'reserve'}}:null}});assert(f.c.state().actors[1].reserve);assert.match(f.ui.root.innerHTML,/Last position/);await f.click('actor-menu',b.id);assert.match(f.editor().innerHTML,/Deploy \/ place/);f.ui.destroy();
});
test('199 empty active board pauses and the UI retains Stop rather than starting another encounter',async()=>{
    const f=fixture('en');await f.c.start(false);for(const a of [...f.c.state().actors])await f.c.reserve(a.id);assert.equal(f.c.state().phase,'paused');assert.match(f.ui.root.innerHTML,/Waiting for participants/);assert.match(f.ui.root.innerHTML,/data-action="stop"/);assert(!f.ui.root.innerHTML.includes('data-action="start"'));await f.c.deploy(f.c.state().actors[0].id,{x:3,y:4});assert.equal(f.c.state().phase,'active');f.ui.destroy();
});
test('199 narrative text is preserved for the resolved attack and manual override is displayed',async()=>{
    const f=fixture('en');await f.c.rules({splitMovement:true});await f.c.start(false);await f.ui.root.emit('change',{target:{name:'manualUnlimited',checked:true}});await f.ui.root.emit('input',{target:{name:'description',value:'I aim for the head'}});assert.match(f.ui.root.innerHTML,/Lift the action limit/);await f.click('attack');const e=f.c.state().log.findLast(v=>['hit','miss'].includes(v.type));assert.equal(e.details.description,'I aim for the head');assert(E.manualUnlimited(f.c.state()));await f.click('end-turn');assert(!E.manualUnlimited(f.c.state()));f.ui.destroy();
});
test('199 own check shows None and only eligible matching extra pools',async()=>{
    const f=fixture('en'),a=f.c.state().actors[0];await f.c.rules({multiActionsEnabled:true,splitMovement:true});await f.c.edit(a.id,{bonusActions:[{id:'other',name:'Story extra',count:1,allowed:['other']},{id:'boss',name:'Boss attacks',count:3,allowed:['attack']}]});await f.c.start(false);await f.ui.root.emit('change',{target:{name:'otherKind',value:'check'}});assert.match(f.ui.root.innerHTML,/None \/ see description/);assert.match(f.ui.root.innerHTML,/value="bonus:other"/);assert(!f.ui.root.innerHTML.includes('value="bonus:boss"'));await f.ui.root.emit('input',{target:{name:'check-description',value:'Read the room'}});await f.ui.root.emit('change',{target:{name:'check-actionSource',value:'bonus:other'}});await f.click('resolve-check');assert.equal(f.c.state().action.bonusSpent.other,1);assert.equal(f.c.state().action.freeSpent,0);f.ui.destroy();
});
test('199 hidden marker has a Reveal control which does not reserve the participant',async()=>{
    const f=fixture('en'),a=f.c.state().actors[0];await f.c.rules({hideNeedsTerrain:false,splitMovement:true});await f.c.edit(a.id,{skills:[{...skillPreset('hide','en'),id:'hide',check:false}]});await f.c.start(false);await f.c.act({type:'skill',actor:a.id,target:a.id,skill:'hide'});assert.match(f.ui.root.innerHTML,/ct-effect-hidden/);await f.click('actor-menu',a.id);assert.match(f.editor().innerHTML,/Reveal participant/);await f.editor().querySelector('form').emit('click',{target:{closest:q=>q==='[data-context-manage]'?{dataset:{contextManage:'reveal'}}:null}});assert(!f.c.state().actors[0].hidden);assert(!f.c.state().actors[0].reserve);f.ui.destroy();
});
test('199 shot-risk warning names the companion before attack resolution',async()=>{
    const f=fixture('en'),a=f.c.state().actors[0],b=f.c.state().actors[1],e=f.c.state().actors[2];await f.c.rules({shotRiskEnabled:true,splitMovement:true});await f.c.move(a.id,{x:1,y:1},true);await f.c.move(b.id,{x:2,y:1},true);await f.c.move(e.id,{x:3,y:1},true);await f.c.start(false);await f.ui.root.emit('change',{target:{name:'target',value:e.id}});await f.ui.root.emit('change',{target:{name:'mode',value:'ranged'}});assert.match(f.ui.root.innerHTML,/Friendly Fire:/);assert(f.ui.root.innerHTML.includes(b.name));f.ui.destroy();
});
test('199 pit rescue is available after stopping initiative and uses an adjacent helper',async()=>{
    const f=fixture('en'),a=f.c.state().actors[0],b=f.c.state().actors[1];await f.c.move(f.c.state().actors[2].id,{x:8,y:8},true);await f.c.board({pits:[{x:4,y:4}]});await f.c.edit(b.id,{position:null,lastPosition:{x:4,y:3},hanging:{anchor:{x:4,y:4},turns:3,round:1}});assert.match(f.ui.root.innerHTML,/Pit rescue/);assert.match(f.ui.root.innerHTML,/Pull up/);await f.click('rescue-pit');assert(!f.c.state().actors[1].hanging);assert(f.c.state().actors[1].position);f.ui.destroy();
});
