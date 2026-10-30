import test from 'node:test';
import assert from 'node:assert/strict';
import { createUI } from '../ui.js';
import { createUIEnglish } from '../ui.en.js';
import { createController } from '../controller.js';
import * as E from '../engine.js';

// Render smoke tests with a minimal DOM surface. Visual/browser QA remains separate.
class Element {
    constructor() { this.innerHTML = ''; this.events = {}; this.dataset = {}; this.children = []; }
    setAttribute() {}
    append(e) { this.children.push(e); }
    addEventListener(name, fn) { this.events[name] = fn; }
    closest(selector){return selector==='form'?this.parentForm:null;}
    querySelector(selector) { if(selector==='[data-defense]'&&this.innerHTML.includes('data-defense')){const host=this.defenseHost??=new Element();host.parentForm=this.querySelector('form');return host;} if(selector==='[data-actor-skills]'&&this.innerHTML.includes('data-actor-skills')){const host=this.skillsHost??=new Element();host.parentForm=this.querySelector('form');return host;} if (selector === 'form' && this.innerHTML.includes('<form novalidate>')) return this.form ??= new Element(); return null; }
    querySelectorAll() { return []; }
    remove() {}
    showModal() { this.open = true; }
    close() { this.open = false; this.events.close?.(); }
}
globalThis.document = { body: new Element(), createElement: () => new Element() };
function fixture(language = 'de') {
    let bundle = { state: E.demoState(), history: [] };
    bundle.state.rules.language = language;
    const c = createController({ key: () => 'demo', read: () => bundle, write: value => { bundle = value; }, save: async () => {}, preferences: () => ({ language,contextOnClick:true }) });
    const ui = createUI(c);
    async function tab(name) {
        const button = { dataset: { action: `tab-${name}` }, disabled: false };
        await ui.root.events.click({ target: { closest: () => button } });
    }
    return { c, ui, tab };
}

test('Fähigkeiten sind direkt in der Figurenliste erreichbar und öffnen die Ablenken-Vorlage',async()=>{
    const {c,ui,tab}=fixture();await tab('actors');
    assert.match(ui.root.innerHTML,/data-action="skills"/);
    await ui.root.events.click({target:{closest:()=>({dataset:{action:'skills',id:c.state().actors[0].id}})}});
    const editor=document.body.children.at(-1);
    assert(editor.open);assert.match(editor.innerHTML,/data-skill-add="distract"[^>]*>\+ Ablenken/);
    assert.match(editor.innerHTML,/Änderungen übernehmen/);ui.destroy();
});

test('English Participants exposes Abilities and the Distract template',async()=>{
    const {c,ui}=fixture('en');ui.destroy();const en=createUIEnglish(c);
    await en.root.events.click({target:{closest:()=>({dataset:{action:'tab-actors'}})}});
    assert.match(en.root.innerHTML,/data-action="skills"[^>]*>Abilities/);
    await en.root.events.click({target:{closest:()=>({dataset:{action:'skills',id:c.state().actors[0].id}})}});
    const editor=document.body.children.at(-1);
    assert.match(editor.innerHTML,/data-skill-add="distract"[^>]*>\+ Distract/);
    assert.match(editor.innerHTML,/Apply changes/);en.destroy();
});

test('Split movement can be enabled in Rules; the action display and End turn button update initiative', async () => {
    const { c, ui, tab } = fixture(); await tab('rules');
    assert.match(ui.root.innerHTML, /name="splitMovement"/); assert.match(ui.root.innerHTML, /Bewegung vor und nach der Aktion/);
    const r = c.state().rules, values = new Map(Object.entries({ statMode: r.statMode, rngMode: r.rngMode, seed: r.seed, movementBase: r.movementBase, movementStat: r.movementStat, deathRounds: r.deathRounds, coverPercent: r.coverPercent, splitMovement: 'on' }));
    for (const k of ['hitEqual', 'damageAbility', 'natural20', 'boardEnabled', 'sharePositions', 'coverWalkable', 'coverCrossable', 'constitutionHp']) if (r[k]) values.set(k, 'on');
    const original = globalThis.FormData; globalThis.FormData = class { constructor() { return values; } };
    const query = ui.root.querySelector; ui.root.querySelector = selector => selector === '#ct-rules-form' ? {} : null;
    try { await ui.root.events.click({ target: { closest: () => ({ dataset: { action: 'save-rules' } }) } }); }
    finally { globalThis.FormData = original; ui.root.querySelector = query; }
    assert.equal(c.state().rules.splitMovement, true); await tab('board'); await c.start(false);
    assert.match(ui.root.innerHTML, /Aktion verfügbar/);
    await c.act({ type: 'other', actor: E.currentActor(c.state()).id });
    assert.match(ui.root.innerHTML, /Aktion verbraucht/); assert.match(ui.root.innerHTML, /data-action="attack" disabled/);
    assert.match(ui.root.innerHTML, /data-action="other" disabled/); assert.match(ui.root.innerHTML, /data-action="end-turn"/);
    await ui.root.events.click({ target: { closest: () => ({ dataset: { action: 'end-turn' } }) } });
    assert.equal(E.currentActor(c.state()).name, 'Lyra'); assert.match(ui.root.innerHTML, /Aktion verfügbar/);
    ui.destroy();
});

test('English split movement labels and held DM action use one language and disable a new proposal', async () => {
    const { c, ui } = fixture('en'); ui.destroy(); const en = createUIEnglish(c);
    await c.rules({ splitMovement: true }); await c.edit(c.state().actors[0].id, { control: 'dm' }); await c.start(false);
    await c.act({ type: 'other', actor: c.state().actors[0].id });
    assert.match(en.root.innerHTML, /Action used/); assert.match(en.root.innerHTML, /End turn/);
    assert.match(en.root.innerHTML, /data-action="propose" disabled/); assert(!/Aktion verbraucht|Zug beenden|Bewegung vor/.test(en.root.innerHTML));
    await en.root.events.click({ target: { closest: () => ({ dataset: { action: 'tab-rules' } }) } });
    assert.match(en.root.innerHTML, /Movement before and after the action/); assert(!/Verbleibende|Zug beenden|Optional: eine/.test(en.root.innerHTML));
    en.destroy();
});

test('Undo of map edits retains the visible last combat result', async () => {
    const { c, ui } = fixture(); await c.start(false);
    await c.act({ type: 'attack', actor: c.state().actors[0].id, target: c.state().actors[2].id }, { roll: sides => sides });
    await c.board({ cover: [{ x: 0, y: 0 }] }); await c.undo();
    assert.match(ui.root.innerHTML, /Arin → Goblin · Nahkampf/); assert(!ui.root.innerHTML.includes('ct-result-undo'));
    ui.destroy();
});

test('Englische Ergebniszeile und Editorbereiche haben übersetzte einheitliche Überschriften', async () => {
    const { c, ui } = fixture('en'); ui.destroy(); const en = createUIEnglish(c);
    await c.start(false); await c.act({ type: 'attack', actor: c.state().actors[0].id, target: c.state().actors[2].id, mode: 'ranged' }, { roll: sides => Math.min(sides, 12) });
    assert.match(en.root.innerHTML, /Arin → Goblin · Ranged/); assert(!en.root.innerHTML.includes('Fernkampf'));
    await en.root.events.click({ target: { closest: () => ({ dataset: { action: 'edit', id: c.state().actors[0].id } }) } });
    const html = document.body.children.at(-1).innerHTML;
    for (const label of ['General', 'Control & AI', 'Weapons & attacks', 'Attributes', 'Movement', 'Rescue & condition', 'Notes']) assert(html.includes(`<span>${label.replaceAll('&', '&amp;')}</span>`), label);
    assert.match(html, /<h3>Melee<\/h3>/); assert.match(html, /<h3>Ranged<\/h3>/);
    assert(!/Nahkampf|Fernkampf|<span>movement<\/span>|<span>Attribute<\/span>/.test(html)); en.destroy();
});

test('Englisches Flächenergebnis und deutsche Gruppenseiten verwenden ihre gewählte Sprache', async () => {
    const { c, ui } = fixture('en'); ui.destroy(); const en = createUIEnglish(c);
    await c.edit(c.state().actors[0].id, { weapons: { melee: { damage: '1d8' }, ranged: { damage: '1d6', radius: 1 } } });
    await c.start(false); await c.act({ type: 'attack', actor: c.state().actors[0].id, target: c.state().actors[2].id, mode: 'ranged' }, { roll: sides => Math.min(sides, 12) });
    assert.match(en.root.innerHTML, /Area damage:/); assert(!en.root.innerHTML.includes('Flächenschaden')); en.destroy();
    const de = fixture(); await de.tab('rules'); assert.match(de.ui.root.innerHTML, /SPIELER · VERBÜNDETE · GEGNER/);
    assert(!de.ui.root.innerHTML.replace(/<[^>]*>/g,'').includes('Allies')); de.ui.destroy();
});
test('Alle Bereiche rendern und die Initiative wird nach Kampfstart sichtbar', async () => {
    const { c, ui, tab } = fixture();
    assert.match(ui.root.innerHTML, /A1, frei/); assert.match(ui.root.innerHTML, /Kampf starten/);
    await c.start(false); assert.match(ui.root.innerHTML, /Nahkampfangriff auswerten/);
    for (const [name, expected] of [['actors', 'Alle Figuren'], ['library', 'Figurenbibliothek'], ['rules', 'Deine Kampfregeln'], ['log', 'Kampfprotokoll']]) {
        await tab(name); assert(ui.root.innerHTML.includes(expected));
    }
    ui.destroy();
});
test('Figurennamen und Notizen werden als Daten gerendert, kein ausführbares HTML', async () => {
    const { c, ui, tab } = fixture();
    await c.edit(c.state().actors[0].id, { name: '<img src=x onerror=alert(1)>', notes: '<script>evil</script>' });
    await tab('actors');
    assert(ui.root.innerHTML.includes('&lt;img')); assert(!ui.root.innerHTML.includes('<img src=x'));
    ui.destroy();
});
test('Feldgrößen und Hindernisse erscheinen nach einer Korrektur im Renderer', async () => {
    const { c, ui } = fixture();
    await c.board({ width: 14, height: 12, blocked: [{ x: 0, y: 0 }] });
    assert.match(ui.root.innerHTML, /14×12 ändern/); assert.match(ui.root.innerHTML, /A1, gesperrt/);
    assert.match(ui.root.innerHTML, /N12, frei/);
    ui.destroy();
});

test('Bewegungsradius und letzte Ergebnisse sind auf dem Hauptschirm sichtbar', async () => {
    const { c, ui, tab } = fixture(); await c.start(false);
    assert.match(ui.root.innerHTML, /5 \/ 5/); assert.match(ui.root.innerHTML, /ct-reachable/);
    await c.move(c.state().actors[0].id, { x: 3, y: 3 }); assert.match(ui.root.innerHTML, /4 \/ 5/);
    await c.act({ type: 'attack', actor: c.state().actors[0].id, target: c.state().actors[2].id, mode: 'ranged' }, { roll: () => 2 });
    assert.match(ui.root.innerHTML, /Letztes Kampfergebnis/); assert.match(ui.root.innerHTML, /Fehlschlag/);
    await tab('actors'); assert.match(ui.root.innerHTML, /Letztes Kampfergebnis/); ui.destroy();
});

test('Nah- und Fernkampf können ohne Profilbearbeitung umgeschaltet werden', async () => {
    const { c, ui } = fixture(); await c.start(false);
    await ui.root.events.change({ target: { name: 'mode', value: 'ranged' } });
    assert.match(ui.root.innerHTML, /Fernangriff auswerten/); assert.equal(c.state().actors[0].attackMode, 'melee');
    assert.match(ui.root.innerHTML, /Schadenswürfel für diesen Angriff/); ui.destroy();
});

test('Bewusstlose, Rettungsbutton und Hardcore-Regel erscheinen in der Oberfläche', async () => {
    const { c, ui, tab } = fixture(); await c.start(false);
    await c.edit(c.state().actors[2].id, { hp: 0 });
    await ui.root.events.change({target:{name:'otherKind',value:'stabilize'}});
    assert.match(ui.root.innerHTML, /Retten \/ stabilisieren/); assert.match(ui.root.innerHTML, /3 Runden/);
    await tab('actors'); assert.match(ui.root.innerHTML, /bewusstlos/);
    await tab('rules'); assert.match(ui.root.innerHTML, /0 = Hardcore/); ui.destroy();
});

test('Englische Oberfläche lässt Figurennamen unangetastet und übersetzt alle Bereiche', async () => {
    const { c, ui }=fixture(); ui.destroy();
    await c.edit(c.state().actors[0].id,{name:'Gegner und Spieler'});
    const en=createUIEnglish(c);
    assert.match(en.root.innerHTML,/Combat control/); assert.match(en.root.innerHTML,/Gegner und Spieler/);
    for(const [tab,label] of [['actors','All participants'],['library','Companion library'],['rules','Your combat rules'],['settings','Interface & language'],['log','Combat log']]) {
        await en.root.events.click({target:{closest:()=>({dataset:{action:'tab-'+tab}})}});
        assert(en.root.innerHTML.includes(label));
    }
    en.destroy();
});
test('Nah-/Fernwechsel lädt jeweils den gespeicherten Würfel und Radius', async () => {
    const {c,ui}=fixture(); await c.edit(c.state().actors[0].id,{weapons:{melee:{damage:'1d4+1'},ranged:{damage:'2d6',radius:2}}}); await c.start(false);
    assert.match(ui.root.innerHTML,/name="damageOverride"[^>]*value="1d4\+1"/);
    await ui.root.events.change({target:{name:'mode',value:'ranged'}});
    assert.match(ui.root.innerHTML,/name="damageOverride"[^>]*value="2d6"/);
    assert.match(ui.root.innerHTML,/name="radiusOverride"[^>]*value="2"/);
    await ui.root.events.change({target:{name:'mode',value:'melee'}});
    assert.match(ui.root.innerHTML,/name="radiusOverride"[^>]*value="0"/); ui.destroy();
});
test('Deckung und Basic-KI-Bedienung erscheinen im Spielfeld', async () => {
    const {c,ui}=fixture(); await c.board({cover:[{x:0,y:0}]}); await c.edit(c.state().actors[0].id,{control:'basic'}); await c.start(false);
    assert.match(ui.root.innerHTML,/A1, Deckung, nur übersteigen/); assert.match(ui.root.innerHTML,/KI-Zug ausführen/); assert.match(ui.root.innerHTML,/KI-Züge bis zum manuellen Zug/); ui.destroy();
});
test('Erzählen schließt das Kampffenster vor dem KI-Aufruf; Schließen bleibt beim Warten möglich', async () => {
    let bundle={state:E.demoState(),history:[]}; let resolveNarration,wasClosed=false,ui;
    const c=createController({key:()=>1,read:()=>bundle,write:b=>{bundle=b;},save:async()=>{},narrate:()=>{wasClosed=!ui.root.open; return new Promise(r=>{resolveNarration=r;});}});
    ui=createUI(c,{modal:true}); ui.open();
    const click=action=>ui.root.events.click({target:{closest:()=>({dataset:{action},disabled:false})}});
    const narration=click('narrate'); assert(wasClosed); assert.equal(ui.root.open,false);
    ui.open(); await click('close'); assert.equal(ui.root.open,false);
    resolveNarration(); await narration; ui.destroy();
});

test('Gruppensteuerung ist oben unter Regeln sichtbar, mit drei Seiten und separatem Übernehmen', async () => {
    const { c, ui, tab } = fixture(); await tab('rules');
    const html = ui.root.innerHTML;
    assert(html.indexOf('Gruppensteuerung') < html.indexOf('Deine Kampfregeln'));
    for (const side of ['player', 'ally', 'enemy']) assert(html.includes(`name="${side}-control"`));
    assert.match(html, /Alle Gruppen übernehmen/); assert.match(html, /Vorsichtig · Flucht/);
    assert.match(html, /data-fold="rules-hits" open/); assert.match(html, /data-fold="rules-terrain" >/);
    await ui.root.events.change({ target: { name: 'enemy-control', value: 'basic' } });
    await c.refresh(); assert.match(ui.root.innerHTML, /name="enemy-control"[\s\S]*?value="basic" selected/);
    ui.destroy();
});

test('Gruppe Übernehmen übernimmt ausgewählte Werte vor dem Neuzeichnen, ohne andere Seiten anzutasten', async () => {
    const { c, ui, tab } = fixture(); await tab('rules');
    const data = new Map([['enemy-control','basic'], ['enemy-aiBehavior','cautious']]);
    const original = globalThis.FormData;
    globalThis.FormData = class { constructor(form) { return form.values; } };
    ui.root.querySelector = selector => selector === '#ct-group-form' ? { values: data } : null;
    try {
        await ui.root.events.click({ target: { closest: () => ({ dataset: { action: 'apply-group', side: 'enemy' }, disabled: false }) } });
        assert(c.state().actors.filter(a=>a.side==='enemy').every(a=>a.control==='basic'&&a.aiBehavior==='cautious'));
        assert(c.state().actors.filter(a=>a.side!=='enemy').every(a=>a.control==='manual'));
        assert.match(ui.root.innerHTML, /Gruppensteuerung gespeichert und übernommen/);
    } finally { globalThis.FormData = original; ui.destroy(); }
});

test('Aufgeklappte Bereiche bleiben bei Kampfänderungen offen', async () => {
    const { c, ui, tab } = fixture(); await tab('rules');
    ui.root.querySelectorAll = selector => selector === 'details[data-fold]' ? [{ dataset: { fold:'rules-terrain' }, open: true }, { dataset: { fold:'rules-hits' }, open: false }] : [];
    await c.rules({ hitEqual: false });
    assert.match(ui.root.innerHTML, /data-fold="rules-terrain" open/); assert.match(ui.root.innerHTML, /data-fold="rules-hits" >/);
    ui.destroy();
});

test('Aktuelle und nächste Initiative stehen innerhalb ihrer Leiste; KI-Steuerung steht vor manueller Aktion', async () => {
    const { c, ui } = fixture(); await c.edit(c.state().actors[0].id, { control:'basic' }); await c.start(false);
    const html = ui.root.innerHTML, initiative = html.match(/<section class="ct-initiative"[\s\S]*?<\/section>/)[0];
    assert.match(initiative, /Jetzt am Zug: Arin/); assert.match(initiative, /Danach: Lyra/); assert.match(initiative, /ct-next-label/);
    assert(!html.includes('ct-turn-summary'));
    assert(html.indexOf('data-action="ai-step"') < html.indexOf('Manuelle Aktion')); assert.match(html, /data-action="edit-control"/);
    ui.destroy();
});

test('Figureneditor ist gegliedert und der direkte Steuerungsbutton öffnet den KI-Bereich', async () => {
    const { c, ui } = fixture(); await c.start(false);
    await ui.root.events.click({ target: { closest: () => ({ dataset: { action:'edit-control', id:c.state().actors[0].id }, disabled:false }) } });
    const editor = document.body.children.at(-1);
    assert(editor.open); assert.match(editor.innerHTML, /data-fold="actor-control" open/); assert.match(editor.innerHTML, /data-fold="actor-general" >/);
    for (const section of ['actor-weapons','actor-stats','actor-movement','actor-rescue','actor-notes']) assert(editor.innerHTML.includes(`data-fold="${section}"`));
    assert.match(editor.innerHTML, /type="submit"/); ui.destroy();
});

test('Englische neue Bereiche und Kartenwahl übersetzen feste Texte, während Namen unverändert bleiben', async () => {
    const { c, ui } = fixture(); ui.destroy(); const en = createUIEnglish(c);
    await en.root.events.click({ target: { closest: () => ({ dataset: { action:'tab-rules' } }) } });
    assert.match(en.root.innerHTML, /Group controls/); assert.match(en.root.innerHTML, /Climb over cover/); assert.match(en.root.innerHTML, /Cautious · flee/);
    await en.root.events.click({ target: { closest: () => ({ dataset: { action:'random-map' } }) } });
    const dialog = document.body.children.at(-1); assert.match(dialog.innerHTML, /Indoor room · furniture, pillars and doors/); assert.match(dialog.innerHTML, /Custom density/);
    assert(!/Gruppensteuerung|betretbar|Vorsichtig|Innenraum/.test(en.root.innerHTML + dialog.innerHTML)); en.destroy();
});

test('Geflohene fehlen in Zielauswahl und Platzierungsleiste, bleiben als geflohen sichtbar und rückholbar', async () => {
    const { c, ui } = fixture(); await c.move(c.state().actors[0].id, { x:0,y:4 }, true); await c.start(false);
    await ui.root.events.change({target:{name:'otherKind',value:'flee'}});
    assert.match(ui.root.innerHTML, /data-action="flee"[^>]*>Fliehen/);
    await ui.root.events.click({ target: { closest: () => ({ dataset: { action:'flee' }, disabled:false }) } });
    assert(c.state().actors[0].escaped); assert.match(ui.root.innerHTML, /Figur geflohen/); assert.match(ui.root.innerHTML, /GEFLOHEN/);
    assert(!ui.root.innerHTML.includes('Arin · platzieren')); assert.match(ui.root.innerHTML, /Zurückholen/);
    ui.destroy();
});

test('Deckung bleibt im Renderer als Übergang markiert, wird aber nie als grünes Zielfeld angezeigt', async () => {
    const {c,ui}=fixture(); await c.board({cover:[{x:3,y:3}]}); await c.start(false);
    const cell=ui.root.innerHTML.match(/<button[^>]*data-x="3" data-y="3"[\s\S]*?<\/button>/)[0];
    assert(cell.includes('ct-cover')); assert(!cell.includes('ct-reachable')); assert(cell.includes('nur übersteigen'));
    assert.match(ui.root.innerHTML,/übersteigen \(2\) · kein Halt/); ui.destroy();
});

test('Waffeneditor speichert unterschiedliche Schadensboni und Basis-HP ohne automatisches Übernehmen', async () => {
    const {c,ui}=fixture(); await c.rules({constitutionHp:true}); const a=c.state().actors[0];
    await ui.root.events.click({target:{closest:()=>({dataset:{action:'edit',id:a.id}})}});
    const d=document.body.children.at(-1), form=d.querySelector('form');
    assert.match(d.innerHTML,/name="meleeBonus"/); assert.match(d.innerHTML,/name="rangedBonus"/);
    assert(!d.innerHTML.includes('name="damageBonus"')); assert.match(d.innerHTML,/name="baseHp"/);
    assert.match(d.innerHTML,/name="applyConstitutionHp" type="checkbox" >/);
    const values=new Map(Object.entries({name:a.name,side:a.side,maxHp:String(a.maxHp),hp:String(a.hp),baseHp:'40',dc:'15',initiative:'18',control:'manual',aiBehavior:'aggressive',attackBonus:'2',attackMode:'melee',attackStat:'auto',range:'10',meleeDamage:'1d8',meleeRadius:'0',meleeBonus:'5',rangedDamage:'1d6',rangedRadius:'0',rangedBonus:'-2',movementBonus:'0',deathRounds:'',condition:'auto',roundsLeft:'',notes:''}));
    for(const [k,v] of Object.entries(a.stats)) values.set('stat-'+k,String(v));
    const original=globalThis.FormData; globalThis.FormData=class{constructor(){return values;}};
    const submit={disabled:false},error={}; form.querySelector=s=>s==='[type=submit]'?submit:error;
    try {
        await form.events.submit({preventDefault(){},currentTarget:form});
        assert.equal(error.textContent,undefined); assert.equal(c.state().actors[0].weapons.melee.damageBonus,5);
        assert.equal(c.state().actors[0].weapons.ranged.damageBonus,-2); assert.equal(c.state().actors[0].baseHp,40);
        assert.equal(c.state().actors[0].maxHp,a.maxHp);
    } finally {globalThis.FormData=original;ui.destroy();}
});
test('HP-Regel übernehmen verwendet den sichtbaren Regelformularstand und ist rückgängig machbar', async () => {
    const {c,ui,tab}=fixture(); await tab('rules'); const before=E.clone(c.state());
    const r=before.rules, values=new Map(Object.entries({statMode:r.statMode,rngMode:r.rngMode,seed:r.seed,movementBase:r.movementBase,movementStat:r.movementStat,deathRounds:r.deathRounds,coverPercent:r.coverPercent,constitutionHp:'on'}));
    for(const k of ['hitEqual','damageAbility','natural20','boardEnabled','sharePositions','coverWalkable','coverCrossable']) if(r[k]) values.set(k,'on');
    const original=globalThis.FormData; globalThis.FormData=class{constructor(){return values;}};
    ui.root.querySelector=s=>s==='#ct-rules-form'?{}:null;
    try {
        await ui.root.events.click({target:{closest:()=>({dataset:{action:'apply-hp'}})}});
        assert(c.state().rules.constitutionHp); assert.equal(c.state().actors[0].maxHp,before.actors[0].baseHp+4);
        assert.match(ui.root.innerHTML,/HP-Regel übernommen/); await c.undo(); assert.deepEqual(c.state().actors,before.actors);
    } finally {globalThis.FormData=original;ui.destroy();}
});
test('Englische Waffen- und Constitution-Bereiche sind vollständig übersetzt', async () => {
    const {c,ui}=fixture('en');ui.destroy(); await c.rules({constitutionHp:true}); const en=createUIEnglish(c);
    await en.root.events.click({target:{closest:()=>({dataset:{action:'tab-rules'}})}});
    assert.match(en.root.innerHTML,/Constitution adds HP/); assert.match(en.root.innerHTML,/Apply HP rule/);
    await en.root.events.click({target:{closest:()=>({dataset:{action:'edit',id:c.state().actors[0].id}})}});
    const html=document.body.children.at(-1).innerHTML;
    assert.match(html,/Melee damage bonus/); assert.match(html,/Ranged damage bonus/); assert.match(html,/Apply Constitution HP when saving/);
    assert(!/Basis-HP|übernehmen|Schadensbonus|Bewusstlose/.test(html)); en.destroy();
});
