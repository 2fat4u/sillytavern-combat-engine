import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../engine.js';
import { planBasicTurn } from '../ai.js';
import { createController } from '../controller.js';

function battle(patch = {}, rules = {}) {
    let s = E.emptyState(); s.rules = E.rulesFrom({ ...s.rules, boardEnabled: false, ...rules });
    s = E.addActor(s, { name:'Hero', side:'player', maxHp:20, initiative:10, attackBonus:100, ...patch }).state;
    s = E.addActor(s, { name:'Enemy', side:'enemy', maxHp:100, dc:0 }).state;
    return E.startCombat(s).state;
}
const hit = (s, mode='melee', options={}) => E.resolveAction(s, {type:'attack',actor:s.actors[0].id,target:s.actors[1].id,mode,turn:E.turnToken(s)}, {roll:()=>4,...options});

test('Waffenboni sind unabhängig und gelten zusätzlich zur Formel ohne alten globalen Bonus', () => {
    const s=battle({damageBonus:50, weapons:{melee:{damage:'1d6+2',damageBonus:3},ranged:{damage:'1d6',damageBonus:-1}}});
    assert.equal(hit(s).result.damage,9); assert.equal(hit(s,'ranged').result.damage,3);
    assert.equal(hit(s).result.damageBonus,3); assert.equal(hit(s,'ranged').result.damageBonus,-1);
    assert.equal(hit(s,'ranged',{damageOverride:'1d8+1'}).result.damage,4);
    assert.match(E.resultText(hit(s).result,'en'),/bonus \+3/);
});
test('Alte globale Boni werden genau einmal auf vorhandene Waffen übertragen, auch beim erneuten Laden', () => {
    const s=battle({damage:'1d6+1',damageBonus:2});
    const raw=E.clone(s); for(const a of raw.actors) { delete a.baseHp; delete a.constitutionHpBonus; for(const w of Object.values(a.weapons)) if(w) delete w.damageBonus; }
    let loaded=E.validateState(raw);
    assert.equal(hit(loaded).result.damage,7); assert.equal(hit(loaded,'ranged').result.damage,7);
    loaded=E.validateState(JSON.parse(JSON.stringify(loaded)));
    assert.equal(hit(loaded).result.damage,7); assert.equal(loaded.actors[0].baseHp,20);
    assert.equal(loaded.actors[0].hp,20); assert.equal(loaded.rules.constitutionHp,false);
});
test('Alte Schnittstelle kann Formel und Bonus gemeinsam ändern, fehlende Waffen bleiben fehlend', () => {
    let s=battle({weapons:{melee:{damage:'1d6'},ranged:null}});
    s=E.editActor(s,s.actors[0].id,{damage:'1d8',damageBonus:5}).state;
    assert.equal(E.weaponFor(s.actors[0],'melee').damage,'1d8'); assert.equal(hit(s).result.damage,9);
    assert.equal(E.weaponFor(s.actors[0],'ranged'),null);
    assert.throws(()=>E.actorFrom({weapons:{melee:{damage:'1d6',damageBonus:101}}}),/Schadensbonus/);
});
test('Basic-KI berücksichtigt einen Waffenbonus beim Schutz eigener Figuren vor Flächenschaden', () => {
    let s=E.emptyState();
    for(const a of [
        {name:'AI',side:'player',control:'basic',initiative:20,position:{x:0,y:0},weapons:{melee:null,ranged:{damage:'1d4-4',radius:1,damageBonus:8}}},
        {name:'Target',side:'enemy',position:{x:4,y:4}}, {name:'Friend',side:'ally',position:{x:5,y:4}},
    ]) s=E.addActor(s,a).state;
    s=E.startCombat(s).state;
    assert.notEqual(planBasicTurn(s).intent.type,'attack');
    s=E.editActor(s,s.actors[0].id,{weapons:{melee:null,ranged:{damage:'1d4-4',radius:1,damageBonus:0}}}).state;
    assert.equal(planBasicTurn(s).intent.type,'attack');
});
test('Constitution aktivieren verändert bestehende HP nicht; ausdrücklich übernehmen ist idempotent', () => {
    const old=battle({maxHp:20,hp:15,stats:{constitution:16}});
    let s=E.setRules(old,{constitutionHp:true}).state;
    assert.equal(s.actors[0].maxHp,20); assert.equal(s.actors[0].hp,15);
    s=E.setRules(s,{},true).state;
    assert.equal(s.actors[0].baseHp,20); assert.equal(s.actors[0].maxHp,26); assert.equal(s.actors[0].hp,21);
    assert.equal(s.actors[0].constitutionHpBonus,6);
    s=E.setRules(E.validateState(s),{},true).state; assert.equal(s.actors[0].maxHp,26); assert.equal(s.actors[0].hp,21);
    s=E.setRules(s,{constitutionHp:false},true).state; assert.equal(s.actors[0].maxHp,20); assert.equal(s.actors[0].hp,15);
    assert.equal(s.turnSerial,old.turnSerial); assert.equal(s.rng.cursor,old.rng.cursor);
});
test('Neue Figuren bekommen Constitution-HP, Bonusmodus und negative Modifikatoren funktionieren', () => {
    let s=E.setRules(E.emptyState(),{constitutionHp:true}).state;
    s=E.addActor(s,{maxHp:20,stats:{constitution:16}}).state;
    assert.equal(s.actors[0].hp,26); assert.equal(s.actors[0].maxHp,26);
    s=E.setRules(s,{statMode:'bonuses'},true).state; assert.equal(s.actors[0].maxHp,26);
    s=E.addActor(s,{maxHp:2,stats:{constitution:-3}}).state;
    assert.equal(s.actors[1].hp,1); assert.equal(s.actors[1].maxHp,1);
});
test('HP-Anpassung heilt keine Bewusstlosen und löst bei lebenden Figuren keinen Knockout aus', () => {
    let s=battle({maxHp:20,hp:1,stats:{constitution:2}});
    s=E.addActor(s,{side:'ally',maxHp:10,hp:0,stats:{constitution:18},condition:'unconscious',roundsLeft:2}).state;
    s=E.setRules(s,{constitutionHp:true},true).state;
    assert.equal(s.actors[0].maxHp,12); assert.equal(s.actors[0].hp,1);
    assert.equal(s.actors[2].maxHp,18); assert.equal(s.actors[2].hp,0); assert.equal(s.actors[2].condition,'unconscious'); assert.equal(s.actors[2].roundsLeft,2);
});
test('Figureneditor wendet Constitution nur ausdrücklich an; Vorlage und Export behalten Basis-HP', async () => {
    let bundle={state:battle({stats:{constitution:14}}),history:[]}, templates=[];
    const c=createController({key:()=>1,read:()=>bundle,write:v=>bundle=v,save:async()=>{},library:()=>templates,saveTemplate:async a=>templates.push(a)});
    await c.rules({constitutionHp:true},true); const id=c.state().actors[0].id;
    await c.edit(id,{baseHp:30,stats:{constitution:16}}); assert.equal(c.state().actors[0].maxHp,24);
    await c.edit(id,{applyConstitutionHp:true}); assert.equal(c.state().actors[0].maxHp,36);
    await c.saveTemplate(id); await c.loadTemplate(id);
    assert.equal(c.state().actors.at(-1).maxHp,36); assert.equal(c.state().actors.at(-1).hp,36);
    assert.equal(E.validateState(c.export()).actors[0].baseHp,30);
    const prior=E.clone(c.state().actors); await c.rules({constitutionHp:false},true); await c.undo(); assert.deepEqual(c.state().actors,prior);
});
test('Besiegte Gruppe wird bei Bewusstlosigkeit eindeutig gemeldet, kein Kampagnenende erfunden', () => {
    let s=battle({hp:1,attackBonus:0},{language:'en'}); s=E.setOrder(s,[s.actors[1].id,s.actors[0].id]).state;
    // The current actor remains the hero; finish that turn to let the enemy act.
    s=E.resolveAction(s,{type:'other',actor:s.actors[0].id}).state;
    s=E.resolveAction(s,{type:'attack',actor:s.actors[1].id,target:s.actors[0].id},{roll:sides=>sides===20?20:6}).state;
    assert.equal(s.phase,'ended'); assert.equal(s.actors[0].condition,'unconscious');
    const en=E.combatSummary(s,false,'en'); assert.match(en,/entire player party is unable to fight/); assert.match(en,/not dead/); assert.match(en,/pause/);
    assert.match(E.combatSummary(s),/gesamte Spielergruppe ist kampfunfähig/);
    assert.equal(s.log.at(-1).type,'end'); assert.match(E.buildPrompt(s),/player party is unable to fight/);
});
test('Hardcore-Ende nennt Tote; geflohene Gruppen werden nicht als tot oder bewusstlos gemeldet', () => {
    let s=battle({hp:1,attackBonus:0},{deathRounds:0});
    s=E.resolveAction(s,{type:'other',actor:s.actors[0].id}).state;
    s=E.resolveAction(s,{type:'attack',actor:s.actors[1].id,target:s.actors[0].id},{roll:sides=>sides===20?20:6}).state;
    assert.match(E.combatSummary(s,false,'en'),/All members of the player party are dead/);
    assert.match(E.combatSummary(s),/Alle Mitglieder der Spielergruppe sind tot/);
    s=battle(); s=E.resolveAction(s,{type:'flee',actor:s.actors[0].id}).state;
    assert(!E.combatSummary(s,false,'en').includes('entire player party is unable')); assert.match(E.combatSummary(s,false,'en'),/fled/);
});
