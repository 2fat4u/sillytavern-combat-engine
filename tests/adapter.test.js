import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { skillPreset } from '../skills.js';
import { initialize } from '../index.js';
import * as E from '../engine.js';

const listeners = new Map(), tools = new Map();
const names = ['APP_READY', 'CHAT_CHANGED', 'MESSAGE_SENT', 'USER_MESSAGE_RENDERED', 'CHARACTER_MESSAGE_RENDERED', 'GENERATION_STARTED', 'GENERATION_ENDED', 'GENERATION_STOPPED', 'ONLINE_STATUS_CHANGED', 'MAIN_API_CHANGED', 'CHATCOMPLETION_SOURCE_CHANGED', 'CHATCOMPLETION_MODEL_CHANGED', 'CHAT_COMPLETION_PROMPT_READY', 'GENERATE_AFTER_DATA'];
let prompt = '', saves = 0, toolsEnabled = true;
let context = {
    chatId: 'fixture-chat', characterId: 0, groupId: null, chat: [], chatMetadata: {}, extensionSettings: {},
    eventTypes: Object.fromEntries(names.map(n => [n, n])),
    eventSource: {
        on: (name, fn) => { const handlers = listeners.get(name) ?? []; handlers.push(fn); listeners.set(name, handlers); },
        makeLast: (name,fn) => { const handlers=listeners.get(name)??[],i=handlers.indexOf(fn);if(i>=0)handlers.splice(i,1);handlers.push(fn);listeners.set(name,handlers); }
    },
    saveMetadata: async () => { saves++; }, saveMetadataDebounced: () => {}, saveSettingsDebounced: () => {},
    extensionPrompts: {}, addOneMessage: () => {},
    setExtensionPrompt: (key, value, position, depth, scan, role) => { prompt = value; context.extensionPrompts[key] = { value, position, depth, role }; },
    registerFunctionTool: tool => tools.set(tool.name, tool), unregisterFunctionTool: name => tools.delete(name),
    isToolCallingSupported: () => toolsEnabled,
};
globalThis.SillyTavern = { getContext: () => context };
globalThis.document = { body: { dataset: {} }, querySelector: () => null };
const c = initialize({ uiFactory: () => ({ open() {}, chatChanged() {} }), quickAccess: false });
const emit = async (event, ...args) => { for (const fn of [...(listeners.get(event) ?? [])]) await fn(...args); };
const begin = async type => { delete document.body.dataset.generating; await emit('GENERATION_STARTED', type ?? 'normal', {}, false); document.body.dataset.generating = 'true'; };
const end = async () => { delete document.body.dataset.generating; await emit('GENERATION_ENDED'); };
const tool = args => tools.get('ResolveCombatAction').action(args).then(JSON.parse);
const intent = () => ({ type: 'attack', actor: E.currentActor(c.state()).id, target: c.state().actors.find(a => a.side === 'enemy').id, turn: E.turnToken(c.state()) });

test('Alpha 1 chats and Undo migrate search defaults without changing a fixed home or replaying chat',async()=>{
    const key='deterministic_combat_v1',raw=E.clone(c.state());
    for(const a of raw.actors){delete a.aiConfig.searchTogether;delete a.aiConfig.homeMode;for(const k of ['survey','searchTeam','searchGoal','allyContacts','rally'])delete a.aiMemory[k];}
    raw.actors[0].aiConfig.home={x:1,y:1};
    context.chatMetadata[key]={...context.chatMetadata[key],state:raw,history:[E.clone(raw)],chatQueue:[],upgraded200alpha1:true,upgraded200alpha2:false};const count=context.chat.length;
    await emit('CHAT_CHANGED');await c.flushChat();assert(context.chatMetadata[key].upgraded200alpha2);assert.equal(c.state().actors[0].aiConfig.searchTogether,false);assert.equal(c.state().actors[0].aiConfig.homeMode,'fixed');assert.deepEqual(c.state().actors[0].aiConfig.home,{x:1,y:1});assert.deepEqual(c.state().actors[0].aiMemory.searchTeam,[]);assert.equal(context.chat.length,count);await c.undo();assert.equal(c.state().actors[0].aiConfig.homeMode,'fixed');E.validateState(c.export());
});
const block = object => `\`\`\`combat\n${JSON.stringify(object)}\n\`\`\``;

test('1923 existing upgraded-1922 chats normalize appearance and Undo without changing actors or replaying chat',async()=>{
    const key='deterministic_combat_v1',raw=E.clone(c.state()),actors=E.clone(raw.actors);delete raw.board.appearance;
    context.chatMetadata[key]={...context.chatMetadata[key],state:raw,history:[E.clone(raw)],chatQueue:[],upgraded1922:true,upgraded1923:false};
    const count=context.chat.length;await emit('CHAT_CHANGED');await c.flushChat();assert(context.chatMetadata[key].upgraded1923);assert.equal(c.state().board.appearance.textures,false);assert.deepEqual(c.state().actors,actors);assert.equal(context.chat.length,count);await c.undo();assert.equal(c.state().board.appearance.wall,'default');E.validateState(c.export());
});

test('Ability tool applies an effect without HP damage and includes its exact profile in model context',async()=>{
    const a=E.currentActor(c.state()),target=c.state().actors[2];await c.edit(a.id,{skills:[{...skillPreset('status'),id:'curse',dc:0,status:'slowed'}]});await begin();const r=await tool({type:'skill',actor:a.id,target:target.id,skill:'curse',turn:E.turnToken(c.state())});assert(r.ok);assert(r.result.success);assert.equal(c.state().actors[2].hp,target.hp);assert.equal(c.state().actors[2].effects[0].type,'slowed');assert.match(prompt,/Narration only/);assert.match(prompt,/"type":"slowed"/);assert.match(prompt,/curse|slow|Verlangsamt/i);await message('The target slows.');await end();await c.flushChat();assert(notes().some(v=>v.mes.includes('ERFOLG')));
});
test('DM skill proposal requires confirmation and rejects invented DC/effect values',async()=>{
    const a=E.currentActor(c.state()),target=c.state().actors[2];await c.edit(a.id,{control:'dm',skills:[{...skillPreset('distract'),id:'distract',dc:0}]});const action={type:'skill',actor:a.id,target:target.id,skill:'distract',turn:E.turnToken(c.state())};context.generate=async()=>{await begin();await message(block(action));await end();};await c.propose();assert.equal(c.state().actors[2].tactics.length,0);assert.equal(c.pendingAction().intent.skill,'distract');await c.act(c.pendingAction().intent);assert.equal(c.state().actors[2].tactics[0].type,'distracted');const before=E.clone(c.state());await assert.rejects(c.act({...action,dc:0,effect:'dead'}));assert.deepEqual(c.state(),before);
});
test('1.9 migration adds skills/stances and keeps wall dominance without replaying historical chat',async()=>{
    const key='deterministic_combat_v1',raw=E.clone(c.state());for(const a of raw.actors){delete a.skills;delete a.tactics;delete a.stance;}raw.board.blocked=[{x:9,y:9}];raw.board.heights=[{x:9,y:9}];context.chatMetadata[key]={state:raw,history:[E.clone(raw)],chatQueue:[],upgraded110:true,upgraded120:true,upgraded130:true,upgraded140:true,upgraded150:true,upgraded160:true,upgraded170:true,upgraded180:true,upgraded185:true};const n=context.chat.length;await emit('CHAT_CHANGED');await c.flushChat();assert(context.chatMetadata[key].upgraded190);assert.equal(context.chat.length,n);assert.equal(c.state().actors[0].stance,'neutral');assert.deepEqual(c.state().actors[0].skills,[]);assert.equal(E.heightAt(c.state(),{x:9,y:9}),0);
});
test('Reset clears current scene, keeps companion/map libraries and invalidates old model proposals',async()=>{
    const a=E.currentActor(c.state());await c.saveTemplate(a.id);await c.saveMap('Place');const lib=c.library().length,maps=c.maps().length,old=intent();await c.reset('all');assert.equal(c.state().actors.length,0);assert.equal(c.library().length,lib);assert.equal(c.maps().length,maps);await begin();const r=await tool(old);assert(!r.ok);assert.equal(c.state().actors.length,0);await end();
});

test('1.85 migration adds weapon lists and budgets without replaying chat; tools expose exact weapon IDs',async()=>{
    const key='deterministic_combat_v1', state=E.clone(c.state());for(const a of state.actors){delete a.weaponList;delete a.preferredWeapon;delete a.actionsPerTurn;delete a.bonusActions;}delete state.board.heights;delete state.board.ladders;delete state.board.coverFaces;
    context.chatMetadata[key]={state,history:[E.clone(state)],chatQueue:[],upgraded110:true,upgraded120:true,upgraded130:true,upgraded140:true,upgraded150:true,upgraded160:true,upgraded170:true,upgraded180:true};
    const count=context.chat.length;await emit('CHAT_CHANGED');await c.flushChat();assert(context.chatMetadata[key].upgraded185);assert.equal(context.chat.length,count);assert.equal(c.state().actors[0].actionsPerTurn,1);assert.equal(c.state().actors[0].weaponList.length,2);assert.deepEqual(c.state().board.ladders,[]);assert.match(JSON.stringify(tools.get('ResolveCombatAction')),/weapon/);
});
test('Multiple actions still allow only one model action per generation, with weapon ID preserved',async()=>{
    const a=E.currentActor(c.state());await c.rules({multiActionsEnabled:true,splitMovement:true});await c.edit(a.id,{actionsPerTurn:3,weaponList:[...a.weaponList,{id:'bolt',name:'Bolt',mode:'ranged',range:10,damage:'1d4'}]});
    await begin();const first=await tool({...intent(),weapon:'bolt'});assert(first.ok);assert.equal(first.result.weapon,'bolt');const revision=c.state().revision;await tool({...intent(),weapon:'bolt'});assert.equal(c.state().revision,revision);assert.equal(E.actionBudget(c.state()).remaining,2);
    await message('The attack is narrated.');await end();await begin();const second=await tool({...intent(),weapon:'bolt'});assert(second.ok);assert.equal(E.actionBudget(c.state()).remaining,1);await end();
});
async function message(text, user = false, type = 'normal') {
    const index = context.chat.push({ mes: text, is_user: user, is_system: false, extra: {} }) - 1;
    await emit(user ? 'MESSAGE_SENT' : 'CHARACTER_MESSAGE_RENDERED', index, type);
    if (user) await emit('USER_MESSAGE_RENDERED', index);
    return index;
}
beforeEach(async () => {
    context = { ...context, chatId: `fixture-${E.uid()}`, chat: [], chatMetadata: {} };
    document.body.dataset = {};
    toolsEnabled = true;
    delete context.generate; delete context.generateRaw;
    delete context.onlineStatus; delete context.stopGeneration; delete context.activateSendButtons;
    context.extensionSettings.deterministic_combat_v1.enabled = true;
    context.extensionSettings.deterministic_combat_v1.autoBlocks = true;
    context.extensionSettings.deterministic_combat_v1.autoChat = true;
    context.extensionSettings.deterministic_combat_v1.narrativePersona = false;
    context.extensionSettings.deterministic_combat_v1.language = 'de';
    await emit('CHAT_CHANGED');
    let state = E.demoState(); state.rules.rngMode = 'seeded'; state.rules.seed = 'adapter-check';
    await c.import(state); await c.start(false);
    await c.flushChat();
});

test('Visual migration keeps old 1.4 states and history without replaying chat', async () => {
    const key = 'deterministic_combat_v1', state = E.clone(c.state()), history = E.clone(state);
    delete state.board.background; delete history.board.background;
    for (const a of [...state.actors, ...history.actors]) delete a.portrait;
    context.chatMetadata[key] = { state, history: [history], chatQueue: [], upgraded110: true, upgraded120: true, upgraded130: true, upgraded140: true };
    const count = context.chat.length; await emit('CHAT_CHANGED'); await c.flushChat();
    assert(context.chatMetadata[key].upgraded150); assert.equal(c.state().board.background, null); assert(c.state().actors.every(a => a.portrait === null));
    assert.deepEqual(context.chatMetadata[key].images, {}); assert.equal(context.chat.length, count); assert.equal(context.chatMetadata[key].history.length, 1);
});

test('Adapter saves pictures separately from history and never injects their payload', async () => {
    const key = 'deterministic_combat_v1', image = { kind: 'background', width: 1, height: 1, src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==' };
    const before = context.chat.length, serial = c.state().turnSerial;
    await c.background({ image, scale: 175 }); await c.view({ zoom: 16 });
    assert.equal(Object.keys(context.chatMetadata[key].images).length, 1); assert.equal(context.chatMetadata[key].view.zoom, 16); assert.equal(context.chat.length, before); assert.equal(c.state().turnSerial, serial);
    await emit('CHAT_CHANGED'); assert.equal(c.image(c.state().board.background.asset).src, image.src); assert.equal(c.view().zoom, 16);
    assert(!prompt.includes('data:image/')); assert(!prompt.includes(c.state().board.background.asset));
});

test('Sprachwahl bleibt gespeichert und erzeugt englische Chat-Einträge und Prompt', async () => {
    const before=E.clone(c.state().actors);
    await c.preferences({language:'en',quickSide:'left'});
    assert.equal(c.preferences().language,'en'); assert.equal(context.extensionSettings.deterministic_combat_v1.quickSide,'left');
    assert.deepEqual(c.state().actors,before); await c.act({...intent(),mode:'ranged'});
    assert.match(notes().at(-1).mes,/\[Combat\]/); assert.match(notes().at(-1).mes,/HIT|MISS/);
    assert.match(prompt,/Narration language: English/);
});
test('DM-Vorschlag wartet auf Spielerbestätigung und würfelt dabei noch nicht', async () => {
    await c.edit(E.currentActor(c.state()).id,{control:'dm'}); const before=E.clone(c.state()),oldNotes=notes().length;
    assert.equal(tools.get('ResolveCombatAction').shouldRegister(),false); assert.match(prompt,/DM proposal mode/);
    let i; context.generate=async()=>{await begin(); i=await message(block(intent())); await end();}; await c.propose();
    assert.equal(c.state().rng.cursor,before.rng.cursor); assert.equal(c.state().turnSerial,before.turnSerial); assert.equal(notes().length,oldNotes);
    assert(context.chat[i].extra.deterministic_combat_v1.proposed); assert(c.pendingAction());
    await end(); await c.act(c.pendingAction().intent); assert.equal(c.state().turnSerial,before.turnSerial+1); assert(!c.pendingAction());
});
test('Basic-KI-Figuren erhalten kein Modellwerkzeug und ignorieren Modellangriffe', async () => {
    await c.edit(E.currentActor(c.state()).id,{control:'basic'}); const before=E.clone(c.state());
    assert.equal(tools.get('ResolveCombatAction').shouldRegister(),false);
    await begin(); const r=await tool(intent()); assert.equal(r.ok,false); assert.equal(c.state().rng.cursor,before.rng.cursor);
    assert.equal(c.state().turnSerial,before.turnSerial); await end();
});
test('Nach jeder Aktion erhalten Chat und KI den aktuellen sowie nächsten Teilnehmer mit Runde', async () => {
    await c.act({type:'other',actor:E.currentActor(c.state()).id});
    assert.match(notes().at(-1).mes,/Jetzt am Zug: Lyra \(Runde 1\).*Danach: Goblin/);
    assert.match(prompt,/Current turn: Lyra \(round 1\).*Next: Goblin/);
});

const notes = () => context.chat.filter(m => m.extra?.deterministic_combat_v1?.mechanical);

test('Disconnected Request DM is rejected before generating and never locks the combat', async () => {
    await c.edit(E.currentActor(c.state()).id, { control: 'dm' }); context.onlineStatus = 'no_connection';
    let calls = 0; context.generate = async () => { calls++; }; const before = E.clone(c.state());
    for (let i = 0; i < 2; i++) await assert.rejects(c.propose(), /Keine KI-Verbindung/);
    assert.equal(calls, 0); assert.equal(c.modelBusy(), false); assert.equal(c.requestBusy(), false); assert.deepEqual(c.state(), before);
});

test('An ordinary offline chat-generation start also leaves combat controls available', async () => {
    context.onlineStatus = 'no_connection'; const before = E.clone(c.state());
    await emit('GENERATION_STARTED', 'normal', {}, false); assert.equal(c.modelBusy(), false); assert.deepEqual(c.state(), before);
});

test('Generation start followed by early return without end event reproduces the old bug but releases now', async () => {
    await c.edit(E.currentActor(c.state()).id, { control: 'dm' }); const before = E.clone(c.state());
    context.generate = async (_type, options) => { assert(options.signal instanceof AbortSignal); await emit('GENERATION_STARTED', 'normal', options, false); };
    for (let i = 0; i < 2; i++) { await assert.rejects(c.propose(), /keinen gültigen DM/); assert.equal(c.modelBusy(), false); assert.equal(c.requestBusy(), false); }
    assert.deepEqual(c.state(), before); assert(!prompt.includes('NEW DM proposal'));
});

test('A never-returning DM request can be cancelled without reload; late blocks are ignored and a new request works', async () => {
    await c.edit(E.currentActor(c.state()).id, { control: 'dm' }); const before = E.clone(c.state());
    context.generate = async () => { await begin(); return new Promise(() => {}); };
    context.stopGeneration = () => { delete document.body.dataset.generating; emit('GENERATION_STOPPED'); };
    context.activateSendButtons = () => { delete document.body.dataset.generating; };
    const pending = c.propose(); await new Promise(resolve => setTimeout(resolve, 0)); assert(c.modelBusy()); assert(c.requestBusy()); c.cancelRequest();
    await assert.rejects(pending, /abgebrochen/); assert.equal(c.modelBusy(), false); assert.equal(c.requestBusy(), false); assert.deepEqual(c.state(), before);
    await message(block(intent())); assert.equal(c.pendingAction(), null); assert.deepEqual(c.state(), before);
    context.generate = async () => { await begin(); await message(block(intent())); await end(); }; await c.propose(); assert(c.pendingAction()?.proposal);
});

test('Connection loss cancels an outstanding DM request and leaves the turn untouched', async () => {
    await c.edit(E.currentActor(c.state()).id, { control: 'dm' }); const before = E.clone(c.state());
    context.generate = async () => { await emit('GENERATION_STARTED', 'normal', {}, false); return new Promise(() => {}); };
    const pending = c.propose(); await new Promise(resolve => setTimeout(resolve, 0)); await emit('ONLINE_STATUS_CHANGED', 'no_connection');
    await assert.rejects(pending, /unterbrochen/); assert.equal(c.modelBusy(), false); assert.deepEqual(c.state(), before);
});

test('Narration also releases a generation that returns without any end event', async () => {
    context.generate = async (_type, options) => { await emit('GENERATION_STARTED', 'normal', options, false); };
    const before = E.clone(c.state()); await c.narrate(); assert.equal(c.modelBusy(), false); assert.deepEqual(c.state(), before);
});

test('Map library persists outside chat metadata and sound preferences keep combat values unchanged', async () => {
    const before = E.clone(c.state()), map = await c.saveMap('Toll bridge');
    assert(context.extensionSettings.deterministic_combat_v1.maps.some(v => v.id === map.id)); assert.deepEqual(c.state(), before);
    await c.preferences({ soundEnabled: true, soundVolume: 20 }); assert.equal(c.preferences().soundEnabled, true); assert.equal(c.preferences().soundVolume, 20); assert.deepEqual(c.state(), before);
    await emit('CHAT_CHANGED'); assert(c.maps().some(v => v.id === map.id)); await c.deleteMap(map.id);
});

test('Healing tools use configured supplies once and inject the remaining inventory and action', async () => {
    const a = E.currentActor(c.state()); await c.rules({ splitMovement: true });
    await c.edit(a.id, { hp: 10, resources: [{ id: 'medkit', name: 'Medkit', quantity: 3, heal: '5', range: 0 }] });
    const action = { type: 'use', actor: a.id, target: a.id, resource: 'medkit', turn: E.turnToken(c.state()) };
    assert(tools.get('ResolveCombatAction').parameters.properties.type.enum.includes('use'));
    await begin(); assert.equal((await tool(action)).ok, true); await end(); await c.flushChat();
    assert.equal(c.state().actors[0].hp, 15); assert.equal(c.state().actors[0].resources[0].quantity, 2);
    assert.match(notes().at(-1).mes, /Medkit.*\+5 HP/); assert.match(prompt, /"quantity":2/); assert.match(prompt, /already used their action/);
    await begin(); assert.equal((await tool(action)).ok, false); await end(); assert.equal(c.state().actors[0].resources[0].quantity, 2);
});

test('DM healing proposals wait for confirmation and cannot invent healing values', async () => {
    const a = E.currentActor(c.state()); await c.edit(a.id, { control: 'dm', hp: 10, resources: [{ id: 'heal', name: 'Heal', quantity: 2, heal: '5', range: 0 }] });
    const action = { type: 'use', actor: a.id, target: a.id, resource: 'heal', turn: E.turnToken(c.state()) };
    context.generate = async () => { await begin(); await message(block(action)); await end(); };
    await c.propose(); assert.equal(c.pendingAction().intent.type, 'use'); assert.equal(c.state().actors[0].hp, 10); assert.equal(c.state().actors[0].resources[0].quantity, 2);
    await c.act(c.pendingAction().intent); assert.equal(c.state().actors[0].hp, 15); assert.equal(c.state().actors[0].resources[0].quantity, 1); assert(!c.pendingAction());
});

test('Periodic effects reach chat and the next prompt in English with their actual HP and duration', async () => {
    await c.stop(); const a = c.state().actors[0]; await c.edit(a.id, { effects: [{ type: 'poisoned', damage: '2', turns: 2 }] });
    await c.preferences({ language: 'en' }); await c.start(false); await c.endTurn(); await c.flushChat();
    assert(notes().some(v => /Poisoned, 2 damage.*HP 32 → 30\/32/.test(v.mes)));
    assert.match(prompt, /"hp":30/); assert.match(prompt, /"type":"poisoned","turns":1/); assert.equal(E.currentActor(c.state()).name, 'Lyra');
});

test('Resource migration retains old history and never replays historical chat', async () => {
    const key = 'deterministic_combat_v1', state = E.clone(c.state()), history = E.clone(state);
    for (const s of [state, history]) { delete s.rules.resourcesEnabled; delete s.rules.effectsEnabled;
        for (const a of s.actors) { delete a.resources; delete a.effects; for (const w of Object.values(a.weapons)) if (w) { delete w.resource; delete w.effects; } }
    }
    context.chatMetadata[key] = { state, history: [history], chatQueue: [], upgraded110: true, upgraded120: true, upgraded130: true, upgraded140: true, upgraded150: true, upgraded160: true };
    const before = notes().length; await emit('CHAT_CHANGED'); await c.flushChat();
    assert(context.chatMetadata[key].upgraded170); assert(c.state().actors.every(a => !a.resources.length && !a.effects.length));
    assert.equal(context.chatMetadata[key].history.length, 1); assert.equal(notes().length, before);
});

test('Kartenbearbeitung, Bilder, Notizen und ihr Undo erzeugen keine Chat-Flut', async () => {
    const before = notes().length, key = 'deterministic_combat_v1';
    for (let x = 0; x < 8; x++) await c.board({ cover: Array.from({ length: x + 1 }, (_, y) => ({ x: y, y: 0 })) });
    for (let x = 0; x < 8; x++) await c.undo();
    await c.edit(c.state().actors[0].id, { notes: 'Changed notes', control: 'dm' }); await c.undo();
    const image = { kind: 'portrait', width: 1, height: 1, src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==' };
    await c.edit(c.state().actors[0].id, { portraitImage: image }); await c.undo(); await c.view({ zoom: 96 });
    await c.flushChat(); assert.equal(notes().length, before); assert.equal(context.chatMetadata[key].chatQueue.length, 0);
    assert(!prompt.includes('Last edit undone')); assert(!prompt.includes('Spielfeld:')); assert(!prompt.includes('data:image'));
});

test('Positions- und HP-Korrekturen bleiben im Chat, Kampf-Undo nennt den wiederhergestellten Zustand', async () => {
    const a = c.state().actors[0], before = notes().length;
    await c.move(a.id, { x: 3, y: 3 }); assert.equal(notes().length, before + 1); assert.match(notes().at(-1).mes, /D5 → D4/);
    await c.edit(a.id, { hp: a.hp - 5 }); assert.match(notes().at(-1).mes, /Arin: 27\/32 HP/);
    await c.undo(); assert.match(notes().at(-1).mes, /Last combat|Letzte Kampfänderung/); assert.match(notes().at(-1).mes, /Arin: 32\/32 HP/);
    await c.stop(); const count = notes().length; await c.import(E.demoState()); await c.import(E.demoState());
    assert.equal(notes().length, count); // Setup imports do not flood chat with old results.
});

test('Split movement posts action, position and End turn with the correct current actor; model cannot act twice', async () => {
    await c.rules({ splitMovement: true }); const a = E.currentActor(c.state()), token = E.turnToken(c.state());
    await c.act({ type: 'other', actor: a.id, turn: token });
    assert.match(notes().at(-1).mes, /Aktion verbraucht/); assert.match(notes().at(-1).mes, /Jetzt am Zug: Arin/);
    assert.match(prompt, /has already used their action/); assert.equal(tools.get('ResolveCombatAction').shouldRegister(), false);
    await begin(); const denied = await tool(intent()); await end(); assert.equal(denied.ok, false); assert.equal(E.turnToken(c.state()), token);
    await c.move(a.id, { x: 3, y: 3 }); await c.endTurn({ actor: a.id, turn: token });
    assert.match(notes().at(-1).mes, /Zug beendet/); assert.match(notes().at(-1).mes, /Jetzt am Zug: Lyra/);
    assert.equal(E.currentActor(c.state()).name, 'Lyra'); assert.equal(tools.get('ResolveCombatAction').shouldRegister(), true);
});

test('DM mode cannot request another action while its action is already used', async () => {
    await c.rules({ splitMovement: true }); await c.edit(E.currentActor(c.state()).id, { control: 'dm' });
    await c.act({ type: 'other', actor: E.currentActor(c.state()).id });
    let calls = 0; context.generate = async () => { calls++; };
    await assert.rejects(c.propose(), /Aktion bereits verbraucht/); assert.equal(calls, 0);
});

test('Migration from 1.5 adds action budget to current state and Undo without replaying chat', async () => {
    const key = 'deterministic_combat_v1', state = E.clone(c.state()), history = E.clone(state);
    delete state.action; delete history.action; delete state.rules.splitMovement; delete history.rules.splitMovement;
    context.chatMetadata[key] = { state, history: [history], chatQueue: [], upgraded110: true, upgraded120: true, upgraded130: true, upgraded140: true, upgraded150: true };
    const count = notes().length; await emit('CHAT_CHANGED'); await c.flushChat();
    assert(context.chatMetadata[key].upgraded160); assert.equal(c.state().rules.splitMovement, false);
    assert.equal(E.actionBudget(c.state()).available, true); assert.equal(context.chatMetadata[key].history[0].action.used, false);
    assert.equal(notes().length, count);
});

test('Flucht und automatisches Kampfende landen im Chat und als Zustand im KI-Kontext', async () => {
    const runner=c.state().actors[0].id;
    await c.remove(c.state().actors[1].id); await c.move(runner,{x:0,y:4},true);
    const before=notes().length, hp=E.currentActor(c.state()).hp;
    await c.act({type:'flee',actor:runner,turn:E.turnToken(c.state())});
    const added=notes().slice(before); assert.equal(added.length,2);
    assert.match(added[0].mes,/ist geflohen/); assert.match(added[1].mes,/Kampf beendet/); assert.match(added[1].mes,/Arin.*geflohen/);
    assert.equal(c.state().actors[0].hp,hp); assert.match(prompt,/"escaped":true/); assert.equal(tools.get('ResolveCombatAction').shouldRegister(),false);
});

test('DM-Fluchtvorschlag bleibt bis Bestätigung unverbindlich; kein HP-Verlust und kein Würfel', async () => {
    const runner=E.currentActor(c.state()).id; await c.move(runner,{x:0,y:4},true); await c.edit(runner,{control:'dm'});
    const before=E.clone(c.state()); context.generate=async()=>{await begin(); await message(block({type:'flee',actor:runner,turn:E.turnToken(c.state())})); await end();}; await c.propose();
    assert(!c.state().actors[0].escaped); assert.equal(c.state().turnSerial,before.turnSerial); assert(c.pendingAction());
    await end(); await c.act(c.pendingAction().intent);
    assert(c.state().actors[0].escaped); assert.deepEqual(c.state().rng,before.rng); assert.equal(c.state().actors[0].hp,before.actors[0].hp);
});

test('Modellwerkzeug unterstützt Flucht am Rand und übergibt das Ergebnis an die Erzählung', async () => {
    const runner=E.currentActor(c.state()).id; await c.move(runner,{x:0,y:4},true);
    assert(tools.get('ResolveCombatAction').parameters.properties.type.enum.includes('flee'));
    await begin(); const output=await tool({type:'flee',actor:runner,turn:E.turnToken(c.state())});
    assert(output.ok); assert(c.state().actors[0].escaped); assert.equal(c.state().actors[0].position,null); await end(); await c.flushChat();
    assert.match(notes().at(-1).mes,/ist geflohen/);
});

test('Ein bestehender 1.2-Kampf wird samt Undo-Ständen aktualisiert, ohne alte Ergebnisse erneut zu posten', async () => {
    const old=E.clone(c.state()); delete old.rules.coverWalkable; delete old.rules.coverCrossable; delete old.rules.sideDefaults;
    old.board.cover=[old.actors[0].position]; for(const a of old.actors) delete a.escaped;
    context.chatMetadata.deterministic_combat_v1={state:old,history:[E.clone(old)],upgraded110:true,upgraded120:true};
    const before=notes().length; await emit('CHAT_CHANGED'); await c.flushChat();
    assert.equal(c.state().rules.coverWalkable,true); assert.equal(c.state().rules.coverCrossable,true); assert(!c.state().actors[0].escaped);
    assert(context.chatMetadata.deterministic_combat_v1.upgraded130);
    assert.equal(context.chatMetadata.deterministic_combat_v1.history[0].rules.coverWalkable,true); assert.equal(notes().length,before);
});
test('Aktionen und Bewegungen landen automatisch als KI-lesbare Nachrichten im Chat', async () => {
    const before = notes().length;
    await c.move(c.state().actors[0].id, { x: 3, y: 3 });
    await c.act({ ...intent(), mode: 'ranged' });
    const additions = notes().slice(before);
    assert.equal(additions.length, 2); assert.match(additions[0].mes, /Bewegung/);
    assert.match(additions[1].mes, /TREFFER|FEHLSCHLAG/);
    assert(additions.every(m => m.is_system === true && m.is_user === false && m.extra.deterministic_combat_v1.processed));
    assert.equal(context.chatMetadata.deterministic_combat_v1.chatQueue.length, 0);
});

test('Keine Chat-Mutation innerhalb laufender Modellantwort; danach genau einmal posten', async () => {
    await begin(); const before = notes().length;
    const r = await tool(intent()); assert(r.ok);
    assert.equal(notes().length, before); assert.equal(context.chatMetadata.deterministic_combat_v1.chatQueue.length, 1);
    await message('Die KI erzählt.'); await end(); await c.flushChat();
    assert.equal(notes().length, before + 1);
    await c.flushChat(); await c.postResult(); assert.equal(notes().length, before + 1);
});

test('Spielerblock fügt die Ergebnisnachricht erst nach dem Rendern der Spielernachricht hinzu', async () => {
    const before = notes().length, index = context.chat.push({ mes: block(intent()), is_user: true, is_system: false, extra: {} }) - 1;
    await emit('MESSAGE_SENT', index); assert.equal(notes().length, before);
    await emit('USER_MESSAGE_RENDERED', index);
    assert.equal(notes().length, before + 1); assert.equal(context.chat[index].is_user, true);
});

test('Wiederhergestellte Queue erkennt schon vorhandenen Chat-Eintrag und dupliziert ihn nicht', async () => {
    const existing = notes().at(-1), before = notes().length;
    context.chatMetadata.deterministic_combat_v1.chatQueue.push({ id: existing.extra.deterministic_combat_v1.eventId, text: 'Replay', type: 'start' });
    await c.flushChat(); assert.equal(notes().length, before); assert.equal(context.chatMetadata.deterministic_combat_v1.chatQueue.length, 0);
});

test('Chatwechsel sendet wartende Ergebnisse nicht in einen anderen Chat', async () => {
    await begin(); await tool(intent());
    const oldMeta = context.chatMetadata, oldChat = context.chat, oldId = context.chatId;
    context = { ...context, chatId: 'queue-different-chat', chat: [], chatMetadata: {} };
    document.body.dataset = {}; await emit('CHAT_CHANGED'); await c.flushChat();
    assert.equal(notes().length, 0);
    context = { ...context, chatId: oldId, chat: oldChat, chatMetadata: oldMeta };
    await emit('CHAT_CHANGED'); await c.flushChat();
    assert.equal(oldMeta.deterministic_combat_v1.chatQueue.length, 0);
    assert.match(notes().at(-1).mes, /TREFFER|FEHLSCHLAG/);
});

test('Promptdiagnose prüft vorbereitete Chat- und Text-Aufrufe mit dem letzten Ergebnis', async () => {
    await c.act(intent());
    await emit('CHAT_COMPLETION_PROMPT_READY', { chat: [{ role: 'system', content: prompt }], dryRun: false });
    assert.equal(c.diagnostics().verified, true);
    const registered = context.extensionPrompts.deterministic_combat_v1;
    assert.equal(registered.position, 1); assert.equal(registered.depth, 0); assert.equal(registered.role, 0);
    await emit('CHAT_COMPLETION_PROMPT_READY', { chat: [{ role: 'system', content: 'Ohne Kampfkontext' }], dryRun: true });
    assert.equal(c.diagnostics().verified, true);
    await emit('GENERATE_AFTER_DATA', { prompt: 'Ohne Kampfkontext' }, false);
    assert.equal(c.diagnostics().verified, false); assert.match(c.diagnostics().label, /FEHLT/);
    await emit('GENERATE_AFTER_DATA', { prompt }, false); assert.equal(c.diagnostics().verified, true);
    await c.move(c.state().actors[1].id, { x: 2, y: 7 });
    assert.equal(c.diagnostics().verified, false); assert.match(c.diagnostics().label, /Seitdem/);
});

test('Automatische Chat-Ausgabe lässt sich ausschalten und manuell einmal nachholen', async () => {
    context.extensionSettings.deterministic_combat_v1.autoChat = false;
    const before = notes().length; await c.act(intent()); assert.equal(notes().length, before);
    await c.postResult(); assert.equal(notes().length, before + 1);
    await c.postResult(); assert.equal(notes().length, before + 1);
});

test('Chat-Ausgabe behandelt importierte Namen und Beschreibungen als Daten', async () => {
    await c.edit(c.state().actors[0].id, { name: '<img src=x onerror=alert(1)>' });
    await c.act({ type: 'other', actor: E.currentActor(c.state()).id, description: '<script>bad()</script>' });
    const output = notes().at(-1).mes;
    assert(output.includes('&lt;script&gt;')); assert(!output.includes('<script>')); assert(!output.includes('<img'));
});

test('Kampfabschluss wird automatisch zusätzlich zum letzten Angriff gesendet', async () => {
    await c.edit(c.state().actors[0].id, { damage: '1d100', damageBonus: 100, attackBonus: 100 });
    await c.edit(c.state().actors[3].id, { hp: 0 });
    const before = notes().length; await c.act(intent());
    const added = notes().slice(before); assert.equal(added.length, 2);
    assert.match(added[1].mes, /Kampf beendet/); assert.match(added[1].mes, /Sieg der Spielergruppe/);
    for (const a of c.state().actors) assert(added[1].mes.includes(`${a.hp}/${a.maxHp} HP`));
    const endCount = notes().length; await c.flushChat(); assert.equal(notes().length, endCount);
});

test('Manueller Stopp sendet den offenen Ausgang mit sämtlichen HP', async () => {
    const before = notes().length; await c.stop(); assert.equal(notes().length, before + 1);
    assert.match(notes().at(-1).mes, /Ausgang ist noch offen/);
});

test('Rettung als KI-Werkzeug sendet Zustand in Resultat, Prompt und Chat', async () => {
    await c.edit(c.state().actors[2].id, { hp: 0 }); await begin();
    const r = await tool({ type: 'stabilize', actor: c.state().actors[0].id, target: c.state().actors[2].id, turn: E.turnToken(c.state()) });
    assert.equal(r.ok, true); assert.equal(r.result.targetCondition, 'stabilized');
    assert(prompt.includes('"condition":"stabilized"')); assert(prompt.includes('Der Rettungs-Countdown ist gestoppt'));
    await end(); await c.flushChat(); assert.match(notes().at(-1).mes, /rettet Goblin: stabilisiert/);
});

test('Adapter migriert vorhandene 0-HP-Figuren ohne neue Chat-Einträge', async () => {
    const bundle = context.chatMetadata.deterministic_combat_v1, raw = c.export(), count = notes().length;
    raw.actors[2].hp = 0;
    for (const a of raw.actors) { delete a.condition; delete a.deathRounds; delete a.roundsLeft; delete a.downedRound; }
    delete raw.movement; delete raw.rules.deathRounds; delete bundle.upgraded110;
    bundle.state = raw;
    assert.equal(c.state().actors[2].condition, 'stabilized'); await c.flushChat();
    assert.equal(notes().length, count); assert.equal(c.state().actors[0].hp, 32);
});
test('Werkzeug löst eine Aktion, Folgeaufrufe derselben Antwort verändern keine HP', async () => {
    await begin(); const result = await tool(intent());
    assert.equal(result.ok, true); const before = E.clone(c.state());
    const second = await tool({ type: 'other', actor: E.currentActor(c.state()).id, turn: E.turnToken(c.state()), description: 'Mehr' });
    assert.equal(second.ok, false); assert.deepEqual(c.state(), before);
    assert(prompt.includes('NARRATION TARGET'));assert(prompt.includes('Narration only'));
});
test('Werkzeugresultat liegt vor der Erzählung im KI-Kontext; nächste Antwort darf wieder handeln', async () => {
    await begin(); const result = await tool(intent()); assert(result.ok);
    assert(prompt.includes('NARRATION TARGET')); assert(prompt.includes(result.result.hit ? 'TREFFER' : 'FEHLSCHLAG'));
    await message('Das Ergebnis wird erzählt.'); await end();
    await begin(); const other = await tool({ type: 'other', actor: E.currentActor(c.state()).id, turn: E.turnToken(c.state()), description: 'Warten' });
    assert.equal(other.ok, true);
});
test('Spielerblock wird vor KI-Ausgabe gerechnet; KI darf dann nur erzählen', async () => {
    await begin(); await message(block(intent()), true);
    assert.notEqual(E.currentActor(c.state()).name, 'Arin');
    assert(prompt.includes('NARRATION TARGET'));assert(prompt.includes('Narration only'));
    const before = E.clone(c.state());
    const result = await tool({ type: 'other', actor: E.currentActor(c.state()).id, turn: E.turnToken(c.state()) });
    assert.equal(result.ok, false); assert.deepEqual(c.state(), before);
});
test('Normaler Erzähltext kann keine HP ändern', async () => {
    await begin(); const before = E.clone(c.state()); await message('Der Goblin stirbt und verliert 9999 HP.');
    assert.deepEqual(c.state(), before);
});
test('Streaming-Block wird auch nach GEN_END genau einmal verarbeitet', async () => {
    toolsEnabled = false; await begin(); const proposal = intent(); await end();
    const index = await message(block(proposal)); const before = E.clone(c.state());
    await emit('CHARACTER_MESSAGE_RENDERED', index, 'normal');
    assert.deepEqual(c.state(), before); assert.notEqual(E.currentActor(c.state()).name, 'Arin');
});
test('Regenerate, Swipe und Fortsetzen verändern keine Kampfwerte', async () => {
    for (const type of ['regenerate', 'swipe', 'continue', 'quiet', 'impersonate']) {
        await begin(type); const before = E.clone(c.state());
        await message(block(intent()), false, type);
        const r = await tool(intent()); assert.equal(r.ok, false); assert.deepEqual(c.state(), before); await end();
    }
});
test('Abgebrochene Streaming-Antwort wird nicht als neue Aktion verarbeitet', async () => {
    await begin(); const before = E.clone(c.state()); await emit('GENERATION_STOPPED');
    await message(block(intent())); assert.deepEqual(c.state(), before);
});
test('Ungültige Positionen halten Zug an und erzeugen einen gespeicherten Eingriffsfall', async () => {
    await c.move(c.state().actors[2].id, { x: 9, y: 9 }, true);
    await begin(); const before = E.clone(c.state()); const proposal = intent(); const result = await tool(proposal);
    assert.equal(result.ok, false); assert.deepEqual(c.state(), before);
    assert.match(c.pendingAction().reason, /Nachbarfeld/);
    assert.equal(context.chatMetadata.deterministic_combat_v1.pendingAction.intent.actor, proposal.actor);
    await c.move(c.state().actors[2].id, { x: 4, y: 4 }, true);
    const retried = await c.act({ ...proposal, turn: E.turnToken(c.state()) }); assert.equal(retried.type, 'attack');
    assert.equal(c.pendingAction(), null);
});
test('Chatwechsel und Replay alter Nachrichten können keinen Schaden übernehmen', async () => {
    await begin(); const before = E.clone(c.state()), oldId = context.chatId;
    context = { ...context, chatId: 'new-chat', chat: [], chatMetadata: {} }; await emit('CHAT_CHANGED');
    const r = await tool({ type: 'attack', actor: before.actors[0].id, target: before.actors[2].id, turn: E.turnToken(before) });
    assert.equal(r.ok, false); assert.equal(c.state().actors.length, 0);
    assert.notEqual(context.chatId, oldId);
});
test('KI-Block ohne Zugtoken wird ohne Würfeln zurückgewiesen', async () => {
    await begin(); const before = E.clone(c.state()); const proposal = intent(); delete proposal.turn;
    await message(block(proposal)); assert.deepEqual(c.state(), before); assert.match(c.pendingAction().reason, /Zugtoken/);
});

test('Request DM behält die Anforderung beim Generierungsstart und ersetzt alte Vorschläge ohne Würfeln', async () => {
    await c.edit(E.currentActor(c.state()).id, { control: 'dm' });
    const before = E.clone(c.state()); let calls = 0;
    context.generate = async () => {
        await begin(); calls++;
        assert.match(prompt, /explicitly requested a NEW DM proposal/);
        assert(prompt.includes(`actor ${E.currentActor(c.state()).id}, token ${E.turnToken(c.state())}`));
        assert(!prompt.includes('awaiting player confirmation'));
        assert(!prompt.includes('An action was already resolved'));
        await message(block({ ...intent(), description: `Suggestion ${calls}` }));
        assert.match(prompt, /awaiting player confirmation/);
        assert(!prompt.includes('DM proposal mode: suggest'));
        await end();
    };
    await c.propose(); assert.equal(c.pendingAction().intent.description, 'Suggestion 1');
    await c.propose(); assert.equal(c.pendingAction().intent.description, 'Suggestion 2');
    assert.deepEqual(c.state(), before); assert.equal(calls, 2);
});

test('Request DM meldet reine Erzählung als fehlenden Vorschlag und erhält den Zug', async () => {
    await c.preferences({ language: 'en' }); await c.edit(E.currentActor(c.state()).id, { control: 'dm' });
    const before = E.clone(c.state());
    context.generate = async () => { await begin(); await message('Mira watches the battle.'); await end(); };
    await assert.rejects(c.propose(), /no valid DM proposal/);
    assert.equal(c.pendingAction(), null); assert.deepEqual(c.state(), before);
});

test('Request DM ohne Aktionsauswertung startet keinen unbrauchbaren Modellaufruf', async () => {
    await c.edit(E.currentActor(c.state()).id, { control: 'dm' }); let calls = 0;
    context.generate = async () => { calls++; };
    context.extensionSettings.deterministic_combat_v1.autoBlocks = false;
    await assert.rejects(c.propose(), /combat-Blöcken müssen aktiviert/);
    assert.equal(calls, 0);
});

test('Narrate result verlangt auch vor einem DM-Zug ausschließlich Erzählung', async () => {
    await c.act({ type: 'other', actor: E.currentActor(c.state()).id });
    await c.edit(E.currentActor(c.state()).id, { control: 'dm' });
    const before = E.clone(c.state());
    context.generate = async () => {
        await begin(); assert.match(prompt, /Narration only/); assert(!prompt.includes('DM proposal mode: suggest'));
        await message('The previous participant finished the turn.'); await end();
    };
    await c.narrate(); assert.deepEqual(c.state(), before); assert.equal(c.pendingAction(), null);
});
test('focused result narration sends only the last resolved action through the real request hook without changing combat',async()=>{
 await c.act({type:'other',actor:E.currentActor(c.state()).id,description:'OLDER_ACTION_TO_EXCLUDE'});
 await c.act({type:'other',actor:E.currentActor(c.state()).id,description:'SELECTED_ACTION_TO_NARRATE'});
 const before=E.clone(c.state()),selected=c.state().log.findLast(e=>e.type==='other');
 context.generate=async()=>{
  await begin();assert(prompt.includes('NARRATION TARGET'));assert(prompt.includes(selected.id));assert(prompt.includes('SELECTED_ACTION_TO_NARRATE'));assert(!prompt.includes('OLDER_ACTION_TO_EXCLUDE'));
  const payload={chat:[{role:'user',content:'Continue'}]};await emit('CHAT_COMPLETION_PROMPT_READY',payload);assert.equal(payload.chat.at(-1).content,prompt);assert(c.diagnostics().verified);
  await message('The recorded attempt is described.');await end();
 };
 await c.narrate();assert.deepEqual(c.state(),before);
});
test('narration diagnostics require the selected-result anchor even when older chat contains the same result text',async()=>{
 await c.act({type:'other',actor:E.currentActor(c.state()).id,description:'Recorded intent'});
 const result=c.state().log.findLast(e=>e.type==='other'),withoutTarget=prompt.split('\n').filter(line=>!line.startsWith('NARRATION TARGET — ')).join('\n');
 await emit('CHAT_COMPLETION_PROMPT_READY',{chat:[{role:'user',content:E.eventText(result,'de')},{role:'system',content:withoutTarget}]});assert.equal(c.diagnostics().verified,false);
 await emit('CHAT_COMPLETION_PROMPT_READY',{chat:[{role:'system',content:prompt}]});assert.equal(c.diagnostics().verified,true);
});

test('Erzählanforderung bewahrt einen offenen DM-Vorschlag, ohne einen zweiten vorzuschlagen', async () => {
    await c.edit(E.currentActor(c.state()).id, { control: 'dm' });
    context.generate=async()=>{await begin(); await message(block(intent())); await end();}; await c.propose();
    const pending = E.clone(c.pendingAction()), before = E.clone(c.state());
    context.generate = async () => {
        await begin(); assert.match(prompt, /Narration only/); assert(!prompt.includes('DM proposal mode: suggest'));
        await message('The battle is still waiting for confirmation.'); await end();
    };
    await c.narrate(); assert.deepEqual(c.pendingAction(), pending); assert.deepEqual(c.state(), before);
    assert.match(prompt, /awaiting player confirmation/);
});

test('Chatwechsel während Request DM entfernt die Anforderung im neuen Chat', async () => {
    await c.edit(E.currentActor(c.state()).id, { control: 'dm' });
    context.generate = async () => {
        await begin(); context = { ...context, chatId: 'switched-during-proposal', chat: [], chatMetadata: {} };
        await emit('CHAT_CHANGED');
    };
    await c.propose(); assert(!prompt.includes('NEW DM proposal')); assert.equal(c.state().actors.length, 0);
});

test('Figuren-Einlesen benutzt ältere Profile, akzeptiert JSON und lässt Kampfzahlen unverändert', async () => {
    await c.preferences({ language: 'en' });
    context.chat = [{ name: 'DM', is_user: false, mes: 'Name: Rusk\nArmor: 12\nHP: 20\nDamage: 1d8+2' },
        ...Array.from({ length: 60 }, () => ({ name: 'Mira', mes: 'Mira watches Rusk.' }))];
    const before = E.clone(c.state());
    context.generateRaw = async ({ prompt: rawPrompt, systemPrompt }) => {
        assert(rawPrompt.includes('Armor: 12')); assert.match(systemPrompt, /Armor\/AC\/DEF means dc/);
        return '[{"name":"Rusk","side":"enemy","maxHp":20,"dc":12,"damage":"1d8+2"}]';
    };
    const rows = await c.scanRoster(); assert.equal(rows[0].name, 'Rusk'); assert.equal(rows[0].dc, 12);
    assert.match(rows[0].notes, /Defaults for unknown fields/); assert.deepEqual(c.state(), before);
});

test('Explizite Roster werden auch vor dem letzten Chatfenster gelesen, neueste Profile gewinnen', async () => {
    const roster = hp => '```combat-roster\n' + JSON.stringify([{ name: 'Rusk', maxHp: hp }]) + '\n```';
    context.chat = [{ mes: roster(20) }, { mes: roster(25) }, ...Array.from({ length: 50 }, () => ({ mes: 'Rain falls.' }))];
    context.generateRaw = async () => { throw new Error('Should not generate'); };
    const before = E.clone(c.state()), rows = await c.scanRoster();
    assert.equal(rows.length, 1); assert.equal(rows[0].maxHp, 25); assert.deepEqual(c.state(), before);
});

test('DM-Blöcke ohne explizite Anfrage werden ignoriert, auch bei gewöhnlicher Folgeantwort', async () => {
    await c.edit(E.currentActor(c.state()).id,{control:'dm'});
    const before=E.clone(c.state());
    await begin(); assert.match(prompt,/no new proposal was requested/);
    const i=await message(block(intent())); await end();
    assert(context.chat[i].extra.deterministic_combat_v1.ignored);
    assert.equal(c.pendingAction(),null); assert.deepEqual(c.state(),before);
    context.generate=async()=>{await begin(); await message(block(intent())); await end();};
    await c.propose(); const proposal=E.clone(c.pendingAction());
    await begin(); await message(block({...intent(),description:'Unrequested replacement'})); await end();
    assert.deepEqual(c.pendingAction(),proposal); assert.deepEqual(c.state(),before);
});
test('Constitution-HP werden explizit übernommen und bleiben im Chat sowie Modellkontext sichtbar', async () => {
    const old=E.clone(c.state().actors[0]); await c.rules({constitutionHp:true});
    assert.equal(c.state().actors[0].maxHp,old.maxHp);
    await c.rules({},true); assert.equal(c.state().actors[0].maxHp,old.baseHp+2*E.modifier(old.stats.constitution));
    assert.match(notes().at(-1).mes,/HP-Regel ausdrücklich übernommen/);
    assert.match(prompt,/Constitution HP rule: enabled/);
    assert(prompt.includes('"baseHp":'+old.baseHp));
});

test('1.3.1-Kampf und Undo werden ohne erneute Chat-Einträge auf Waffenboni und Basis-HP migriert', async () => {
    const old=E.clone(c.state());
    delete old.rules.constitutionHp;
    for(const a of old.actors) { delete a.baseHp; delete a.constitutionHpBonus; for(const w of Object.values(a.weapons)) if(w) delete w.damageBonus; }
    context.chatMetadata.deterministic_combat_v1={state:old,history:[E.clone(old)],upgraded110:true,upgraded120:true,upgraded130:true};
    const count=notes().length; await emit('CHAT_CHANGED'); await c.flushChat();
    const b=context.chatMetadata.deterministic_combat_v1;
    assert(b.upgraded140); assert.equal(b.state.actors[0].baseHp,old.actors[0].maxHp);
    assert.equal(b.state.actors[0].weapons.melee.damageBonus,old.actors[0].damageBonus);
    assert.equal(b.history[0].actors[0].weapons.ranged.damageBonus,old.actors[0].damageBonus);
    assert.equal(notes().length,count); assert.equal(b.state.actors[0].hp,old.actors[0].hp);
    await c.rules({constitutionHp:true},true); assert(Number.isFinite(c.state().actors[0].maxHp));
});


test('195 migration normalizes old current state and undo frames quietly, with legacy cost one',async()=>{
    const key='deterministic_combat_v1',raw=E.clone(c.state());delete raw.rules.reactionsEnabled;delete raw.rules.shieldsEnabled;
    for(const a of raw.actors){for(const k of ['shieldProfiles','shields','reactionChoices','reactionControl','reactionCost','reactionUsed','reactionReserve','reactionTurn'])delete a[k];for(const w of a.weaponList){delete w.cost;if(w.standard)delete w.standard.cost;}for(const r of a.resources){delete r.cost;delete r.consumption;delete r.stock;delete r.radius;delete r.falloff;delete r.targets;}}
    const old=context.chatMetadata[key];context.chatMetadata[key]={...old,state:raw,history:[E.clone(raw)],upgraded195:false,chatQueue:[]};const n=notes().length;await emit('CHAT_CHANGED');await c.flushChat();assert.equal(notes().length,n);assert(context.chatMetadata[key].upgraded195);assert.equal(c.state().rules.reactionsEnabled,false);assert.deepEqual(c.state().actors[0].shieldProfiles,[]);assert.equal(c.state().actors[0].weaponList[0].cost,1);assert.equal(context.chatMetadata[key].history[0].actors[0].weaponList[0].cost,1);
});
test('195 committed chat events save metadata once, and quiet edits still save once',async()=>{
    const before=saves,n=notes().length;await c.endTurn();assert.equal(saves-before,1);assert.equal(notes().length,n+1);assert.equal(context.chatMetadata.deterministic_combat_v1.chatQueue.length,0);
    const quiet=saves;await c.edit(c.state().actors[0].id,{notes:'Quiet metadata update'});assert.equal(saves-quiet,1);
});
test('195 busy generation stores events then flushes them exactly once when generation ends',async()=>{
    await begin();const before=saves,n=notes().length;await c.endTurn();assert.equal(saves-before,1);assert.equal(notes().length,n);assert.equal(context.chatMetadata.deterministic_combat_v1.chatQueue.length,1);await end();await c.flushChat();assert.equal(notes().length,n+1);assert.equal(context.chatMetadata.deterministic_combat_v1.chatQueue.length,0);const count=notes().length;await c.flushChat();assert.equal(notes().length,count);
});

test('196 migration adds optional capacity/refill to old resources and undo frames without replaying chat',async()=>{
    const key='deterministic_combat_v1',b=context.chatMetadata[key],raw=E.clone(c.state());for(const a of raw.actors)for(const r of a.resources){delete r.capacity;delete r.refill;}context.chatMetadata[key]={...b,state:raw,history:[E.clone(raw)],upgraded196:false,chatQueue:[]};const n=notes().length;await emit('CHAT_CHANGED');assert(context.chatMetadata[key].upgraded196);assert.equal(notes().length,n);assert(c.state().actors.every(a=>a.resources.every(r=>r.capacity===null&&r.refill===null)));assert(context.chatMetadata[key].history[0].actors.every(a=>a.resources.every(r=>r.capacity===null&&r.refill===null)));
});
test('196 model can use only a configured own refill item; stock changes and chat remain authoritative',async()=>{
    const a=E.currentActor(c.state());await c.edit(a.id,{resources:[{id:'mana',name:'Mana',kind:'ammo',quantity:0,capacity:20},{id:'refill',name:'Mana potion',kind:'supply',quantity:3,heal:'0',range:0,refill:{stock:'mana',amount:5}}]});await begin();const result=await tool({type:'use',actor:a.id,target:a.id,resource:'refill',turn:E.turnToken(c.state())});assert(result.ok);assert.equal(result.result.refill.amount,5);assert.equal(c.state().actors[0].resources[0].quantity,5);assert.match(prompt,/Mana \+5/);await end();await c.flushChat();assert(notes().some(v=>v.mes.includes('Mana +5')));
});

test('198 own narrative check is queued during model generation, injected once and its undo is sent to chat',async()=>{
    const a=E.currentActor(c.state()),n=notes().length;await begin();
    const before=E.clone(c.state()),rejected=await tool({type:'check',actor:a.id,description:'Model must not decide DC',stat:'charisma',bonus:0,dc:1,free:true});assert(!rejected.ok);assert.deepEqual(c.state(),before);
    await c.act({type:'check',actor:a.id,description:'Narrative roll 198',stat:'charisma',bonus:1,dc:10,free:true},{roll:()=>10});
    assert.equal(notes().length,n);assert.match(prompt,/Narrative roll 198/);assert.equal(c.pendingAction(),null);await end();await c.flushChat();assert.equal(notes().filter(v=>v.mes.includes('Narrative roll 198')).length,1);const posted=notes().length;await c.postResult();assert.equal(notes().length,posted);
    const count=notes().length;await c.undo();assert.equal(notes().length,count+1);assert.match(notes().at(-1).mes,/undone|zurückgenommen|rückgängig gemacht/);assert(!prompt.includes('Narrative roll 198'));
});

test('199 persona intent posts before the authoritative result exactly once without executing another action',async()=>{
    context.name1='My Persona';await c.preferences({narrativePersona:true});const a=E.currentActor(c.state()),before=E.clone(c.state()),n=context.chat.length;
    await c.act({...intent(),description:'I aim for the head'},{roll:n=>n===20?10:2});const revision=c.state().revision;await c.flushChat();await c.flushChat();
    const posted=context.chat.slice(n),hints=posted.filter(v=>v.extra?.deterministic_combat_v1?.narrative);assert.equal(hints.length,1);assert.equal(hints[0].name,'My Persona');assert(hints[0].is_user);assert(hints[0].extra.deterministic_combat_v1.processed);assert(hints[0].mes.includes(a.name));assert.equal(c.state().revision,revision);assert(c.state().rng.cursor>before.rng.cursor);
    assert(posted.indexOf(hints[0])<posted.findIndex(v=>v.extra?.deterministic_combat_v1?.mechanical&&v.mes.includes('W20')));
});
test('199 persona hint switch off keeps description solely in combat output',async()=>{
    context.name1='My Persona';await c.preferences({narrativePersona:false});const n=context.chat.length;await c.act({...intent(),description:'I lower my bow'},{roll:()=>1});await c.flushChat();const posted=context.chat.slice(n);assert(!posted.some(v=>v.extra?.deterministic_combat_v1?.narrative));assert(posted.some(v=>v.mes.includes('I lower my bow')));
});

test('1911 persona switch reads back true during active combat and survives unrelated settings and chat refresh',async()=>{
 const before=E.clone(c.state());assert.equal(c.preferences().narrativePersona,false);
 const saved=await c.preferences({narrativePersona:true});assert.equal(saved.narrativePersona,true);assert.equal(c.preferences().narrativePersona,true);
 await c.preferences({soundVolume:20});await emit('CHAT_CHANGED');assert.equal(c.preferences().narrativePersona,true);assert.deepEqual(c.state(),before);
 await c.preferences({narrativePersona:false});assert.equal(c.preferences().narrativePersona,false);assert.throws(()=>c.preferences({narrativePersona:'yes'}),/Persona/);assert.equal(c.preferences().narrativePersona,false);
});

test('1911 final Chat Completion payload recovers missing context without changing stored chat or duplicating injection',async()=>{
 await begin();const payload={chat:[{role:'user',content:'Narrate the ongoing fight'}],dryRun:false},oldChat=E.clone(context.chat),before=E.clone(c.state());
 await emit('CHAT_COMPLETION_PROMPT_READY',payload);assert.equal(payload.chat.length,2);assert.match(payload.chat[1].content,/Phase: active/);assert.equal(c.diagnostics().verified,true);
 await emit('GENERATE_AFTER_DATA',{prompt:payload.chat},false);assert.equal(payload.chat.length,2);assert.deepEqual(context.chat,oldChat);assert.deepEqual(c.state(),before);await end();
});

test('1911 context recovery does not alter dry runs, quiet extraction, disabled combat or another chat',async()=>{
 const dry={chat:[],dryRun:true};await begin();await emit('CHAT_COMPLETION_PROMPT_READY',dry);assert.equal(dry.chat.length,0);await end();
 await begin('quiet');const quiet={chat:[]};await emit('CHAT_COMPLETION_PROMPT_READY',quiet);assert.equal(quiet.chat.length,0);await end();
 context.extensionSettings.deterministic_combat_v1.enabled=false;await begin();const disabled={chat:[]};await emit('CHAT_COMPLETION_PROMPT_READY',disabled);assert.equal(disabled.chat.length,0);await end();
 context.extensionSettings.deterministic_combat_v1.enabled=true;const idle={chat:[]};await emit('CHAT_COMPLETION_PROMPT_READY',idle);assert.equal(idle.chat.length,0);
 await begin();context.chatId='different-chat-during-prompt';const other={chat:[]};await emit('CHAT_COMPLETION_PROMPT_READY',other);assert.equal(other.chat.length,0);await end();
});

test('1911 explicit narration and DM proposal use short live context; confirmation stays mechanical',async()=>{
 const current=E.currentActor(c.state());await c.edit(current.id,{control:'dm'});const before=E.clone(c.state());
 context.generate=async()=>{await begin();assert(prompt.length<E.buildPrompt(c.state()).length);assert.match(prompt,/RESPONSE MODE NOW: DM proposal mode/);assert.match(prompt,/```combat/);await message(block(intent()));await end();};
 await c.propose();assert(c.pendingAction()?.proposal);assert.deepEqual(c.state(),before);
 context.generate=async()=>{await begin();assert.match(prompt,/Narration only/);assert(!prompt.includes('```combat'));await message('The recorded combat continues.');await end();};
 await c.narrate();assert(c.pendingAction()?.proposal);assert.deepEqual(c.state(),before);
});
test('1912 final hook runs after a summary listener registered later, at both preparation stages',async()=>{
 const summary={role:'system',content:'[Summary: No encounter state has been provided yet.]'},tail1=data=>data.chat.push({...summary}),tail2=data=>data.prompt.push({...summary});
 context.eventSource.on('CHAT_COMPLETION_PROMPT_READY',tail1);context.eventSource.on('GENERATE_AFTER_DATA',tail2);
 try{
  await begin();const payload={chat:[{role:'system',content:prompt},{role:'user',content:'Continue'}]},before=E.clone(c.state()),stored=E.clone(context.chat);
  await emit('CHAT_COMPLETION_PROMPT_READY',payload);assert.equal(payload.chat.at(-1).content,prompt);assert.equal(payload.chat.at(-2).content,summary.content);
  await emit('GENERATE_AFTER_DATA',{prompt:payload.chat},false);assert.equal(payload.chat.at(-1).content,prompt);assert.equal(payload.chat.at(-2).content,summary.content);assert.equal(payload.chat.filter(m=>m.role==='system'&&m.content===prompt).length,1);
  assert.equal(c.diagnostics().verified,true);assert.deepEqual(c.state(),before);assert.deepEqual(context.chat,stored);await end();
 }finally{for(const [name,fn] of [['CHAT_COMPLETION_PROMPT_READY',tail1],['GENERATE_AFTER_DATA',tail2]])listeners.set(name,listeners.get(name).filter(v=>v!==fn));}
});
test('1912 interceptor reorders final hooks without adding duplicate listeners',async()=>{
 const tail=data=>data.chat.push({role:'system',content:'Later extension instructions'});context.eventSource.on('CHAT_COMPLETION_PROMPT_READY',tail);
 try{
  const count=listeners.get('CHAT_COMPLETION_PROMPT_READY').length;await begin();for(let i=0;i<3;i++)await globalThis.deterministicCombatInterceptor([],0,()=>{},'normal');assert.equal(listeners.get('CHAT_COMPLETION_PROMPT_READY').length,count);
  const payload={chat:[]};await emit('CHAT_COMPLETION_PROMPT_READY',payload);assert.equal(payload.chat.at(-1).content,prompt);assert.equal(payload.chat.at(-2).content,'Later extension instructions');await end();
 }finally{listeners.set('CHAT_COMPLETION_PROMPT_READY',listeners.get('CHAT_COMPLETION_PROMPT_READY').filter(v=>v!==tail));}
});
test('1912 older event sources without makeLast still prepare one current final state',async()=>{
 const makeLast=context.eventSource.makeLast;delete context.eventSource.makeLast;
 try{await begin();const payload={chat:[{role:'system',content:prompt},{role:'system',content:'Old summary'}]};await emit('CHAT_COMPLETION_PROMPT_READY',payload);assert.equal(payload.chat.at(-1).content,prompt);assert.equal(payload.chat.length,2);await end();}
 finally{context.eventSource.makeLast=makeLast;}
});
test('1912 explicit DM request has final JSON instructions despite old refusal summary; still waits for approval',async()=>{
 await c.edit(E.currentActor(c.state()).id,{control:'dm'});const before=E.clone(c.state());
 context.generate=async()=>{
  await begin();const payload={chat:[{role:'system',content:prompt},{role:'system',content:'[Summary: Send the state before combat begins.]'}]};await emit('CHAT_COMPLETION_PROMPT_READY',payload);
  const final=payload.chat.at(-1).content;assert.match(final,/Phase: active/);assert.match(final,/You create the JSON yourself/);const example=E.parseActionBlock(final);assert(example);assert.equal(example.actor,E.currentActor(c.state()).id);assert.equal(example.turn,E.turnToken(c.state()));await message(block(example));await end();
 };
 await c.propose();assert(c.pendingAction()?.proposal);assert.deepEqual(c.state(),before);
});
test('1914 automatic TTS can skip mechanical notes while the final model state still contains their result',async()=>{
 await c.rules({splitMovement:true});const before=E.clone(c.state());await c.act({type:'other',actor:E.currentActor(c.state()).id,description:'I brace my staff'});await c.flushChat();const message=notes().at(-1);assert.equal(message.is_system,true);assert.equal(message.is_user,false);assert.match(message.mes,/I brace my staff/);
 const payload={chat:context.chat.filter(m=>!m.is_system).map(m=>({role:m.is_user?'user':'assistant',content:m.mes}))};assert(!payload.chat.some(m=>m.content.includes('I brace my staff')));
 await begin();await emit('CHAT_COMPLETION_PROMPT_READY',payload);assert.match(payload.chat.at(-1).content,/I brace my staff/);assert.match(payload.chat.at(-1).content,/Phase: active/);assert.equal(c.diagnostics().verified,true);assert.deepEqual(c.state().actors.map(a=>a.hp),before.actors.map(a=>a.hp));await end();
});
test('1914 chat refresh silences only owned mechanical engine notes, without reposting them',async()=>{
 const key='deterministic_combat_v1',old={name:'CombatEngine',is_system:false,is_user:false,mes:'Old mechanics',extra:{[key]:{mechanical:true,eventId:'old-tts'}}},unrelated={name:'CombatEngine',is_system:false,is_user:false,mes:'Unrelated story',extra:{}},persona={name:'CombatEngine',is_system:false,is_user:true,mes:'Persona story',extra:{[key]:{narrative:true}}};context.chat.push(old,unrelated,persona);const count=context.chat.length,before=E.clone(c.state());await emit('CHAT_CHANGED');await c.flushChat();assert.equal(old.is_system,true);assert.equal(unrelated.is_system,false);assert.equal(persona.is_system,false);assert.equal(old.mes,'Old mechanics');assert.equal(context.chat.length,count);assert.deepEqual(c.state(),before);
});
test('1914 persona hints remain ordinary user messages beside quiet mechanical notes',async()=>{
 context.name1='My Persona';await c.preferences({narrativePersona:true});await c.rules({splitMovement:true});const n=context.chat.length;await c.act({type:'other',actor:E.currentActor(c.state()).id,description:'I call for calm'});await c.flushChat();const posted=context.chat.slice(n),hint=posted.find(m=>m.extra?.deterministic_combat_v1?.narrative),note=posted.find(m=>m.extra?.deterministic_combat_v1?.mechanical);assert(hint);assert(note);assert.equal(hint.name,'My Persona');assert.equal(hint.is_system,false);assert.equal(hint.is_user,true);assert.equal(note.is_system,true);assert(posted.indexOf(hint)<posted.indexOf(note));
});
test('199 hidden opponent is absent from current model target guidance and exact coordinates',async()=>{
    await c.rules({splitMovement:true,hideNeedsTerrain:false});const a=E.currentActor(c.state());await c.edit(a.id,{hidden:{turns:4,appliedTurn:c.state().turnSerial}});await c.endTurn();await c.endTurn();
    assert.equal(E.currentActor(c.state()).side,'enemy');const p=E.buildPrompt(c.state()),tail=p.split('Tactical overview')[1];assert(tail);assert(!tail.includes('"coordinate":"D5"'));assert(!E.tacticalTargets(c.state()).weaponTargets.some(w=>w.profile.some(v=>v.id===a.id)));assert.match(p,/"hidden":true/);assert.match(JSON.stringify(tools.get('ResolveCombatAction')),/rescue/);
});
test('199 reserve and redeploy are posted but do not replay imported history',async()=>{
    const a=c.state().actors[1],n=context.chat.length;await c.reserve(a.id);await c.flushChat();assert(context.chat.slice(n).some(v=>v.mes.includes('vom Spielfeld genommen')));await c.deploy(a.id,{x:2,y:6},{timing:'next'});await c.flushChat();assert(context.chat.slice(n).some(v=>v.mes.includes('frühestens Runde')));const count=context.chat.length;await c.import(c.export());await c.flushChat();assert.equal(context.chat.slice(count).filter(v=>v.mes.includes('frühestens Runde')).length,0);
});

test('199 existing upgraded-196 chats migrate encounter rules, fields and Undo history without replay',async()=>{
    const raw=E.clone(c.state());for(const a of raw.actors)for(const k of ['reserve','initiativeReady','lastPosition','lastHeight','joinRound','turnRound','unlimitedTurn','hidden','hanging'])delete a[k];delete raw.board.pits;delete raw.rules.shotRiskEnabled;delete raw.rules.friendlyFireArea;const key='deterministic_combat_v1';context.chatMetadata[key]={state:raw,history:[E.clone(raw)],chatQueue:[],upgraded110:true,upgraded120:true,upgraded130:true,upgraded140:true,upgraded150:true,upgraded160:true,upgraded170:true,upgraded180:true,upgraded185:true,upgraded190:true,upgraded195:true,upgraded196:true};const n=context.chat.length;await emit('CHAT_CHANGED');await c.flushChat();assert(context.chatMetadata[key].upgraded199);assert.equal(c.state().rules.shotRiskEnabled,false);assert.equal(c.state().rules.friendlyFireArea,true);assert.equal(c.state().actors[0].initiativeReady,true);assert.deepEqual(c.state().board.pits,[]);assert.equal(context.chat.length,n);await c.undo();E.validateState(c.export());
});
