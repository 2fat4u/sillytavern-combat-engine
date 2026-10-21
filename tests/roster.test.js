import test from 'node:test';
import assert from 'node:assert/strict';
import { rosterSource, parseRosterResponse } from '../roster.js';
import { parseActionBlock, parseRosterBlock } from '../engine.js';

test('Einlesen behält ältere explizite Profile, auch nach vielen Erzählungen und Kampfmeldungen', () => {
    const chat = [{ name: 'DM', mes: 'Enemy Encounter Definition:\nName: Rusk\nArmor: 12\nHP: 20\nAttack Modifier: +3\nDamage: 1d8+2' },
        ...Array.from({ length: 80 }, () => ({ name: 'Mira', mes: 'Mira steps closer to Rusk.' })),
        { name: 'CombatEngine', mes: 'Rusk: 0/20 HP', extra: { deterministic_combat_v1: { mechanical: true } } }];
    const source = rosterSource(chat);
    assert(source.some(m => m.text.includes('Name: Rusk') && m.text.includes('Armor: 12') && m.text.includes('HP: 20')));
    assert(!source.some(m => m.name === 'CombatEngine'));
    assert(source.some(m => m.name === 'Mira'));
});

test('Große Chats ergeben eine begrenzte Datenauswahl statt unbegrenztem Kontext', () => {
    const source = rosterSource(Array.from({ length: 300 }, (_, i) => ({ name: 'DM', mes: 'HP: 20\n' + 'story '.repeat(3000) + i })));
    assert(source.reduce((sum, m) => sum + m.text.length, 0) <= 52000);
});

test('Werte am Ende einer langen aktuellen Erzählung gehen beim Kürzen nicht verloren', () => {
    const source = rosterSource([{ name: 'DM', mes: 'Rain falls over the toll bridge.\n'.repeat(180) + '\nEnemy definition:\nName: Rusk\nHP: 20\nArmor: 12\nDamage: 1d8+2' }]);
    assert(source[0].text.includes('Name: Rusk')); assert(source[0].text.includes('Damage: 1d8+2'));
});

test('Explizites Einlesen akzeptiert combat-roster, JSON-Zaun und reine JSON-Liste', () => {
    const raw = JSON.stringify([{ name: 'Rusk', maxHp: 20, dc: 12, damage: '1d8+2' }]);
    for (const text of [raw, '```json\n' + raw + '\n```', '```\n' + raw + '\n```', '```combat-roster\n' + raw + '\n```']) {
        const rows = parseRosterResponse(text, 'scores', 'en');
        assert.equal(rows.length, 1); assert.equal(rows[0].name, 'Rusk'); assert.equal(rows[0].dc, 12);
        assert.match(rows[0].notes, /Defaults for unknown fields/);
        assert(!rows[0].notes.includes('Standardwerte'));
        assert(!Object.hasOwn(rows[0], 'control'));
        assert.equal(parseActionBlock(text), null);
    }
    assert.deepEqual(parseRosterBlock(raw), []);
});

test('Ungültige Extraktion liefert einen lesbaren Fehler, eine leere Liste bleibt leer', () => {
    assert.deepEqual(parseRosterResponse('[]'), []);
    assert.throws(() => parseRosterResponse('Rusk attacks Mira.', 'scores', 'en'), /no readable JSON list/);
    assert.throws(() => parseRosterResponse('{"name":"Rusk"}'), /Liste von Figuren/);
    assert.throws(() => parseRosterResponse('```json\n[]\n```\n```json\n[]\n```'), /Nur ein/);
});

test('Fehlende Werte werden sichtbar markiert, Bonusmodus übernimmt keine Score-Standardwerte', () => {
    const [actor] = parseRosterResponse('[{"name":"Nadir","side":"ally"}]', 'bonuses', 'de');
    assert.equal(actor.stats.dexterity, 0);
    assert.match(actor.notes, /Standardwerte.*maxHp.*dc.*stats.dexterity/);
});

test('Kompakte STR/DEF-Profile mit langem Kontext behalten beide Waffenformeln', () => {
    const profile=name=>`${name}\nHP: 45/45\nDEF: 8\nSTR: 16 (+3)\nDEX: 14 (+2)\nCON: 15 (+2)\nCHA: 12 (+1)\nINT: 10 (+0)\nPER: 13 (+1)\nMelee: 1d20+3 (Club)\nRanged: 1d20+4 (Longbow)`;
    const source=rosterSource([{name:'DM',mes:'Rain '.repeat(1200)+'\n'+profile('Rusk')+'\n'+'Flavor '.repeat(120)+'\n'+profile('Gunter')}]);
    assert(source[0].text.includes('Gunter')); assert(source[0].text.includes('Ranged: 1d20+4')); assert(source[0].text.length<=1200);
    const [actor]=parseRosterResponse('[{"name":"Rusk","weapons":{"melee":{"damage":"1d20+3"},"ranged":null}}]');
    assert.equal(actor.weapons.melee.damage,'1d20+3'); assert.equal(actor.weapons.melee.damageBonus,0); assert.equal(actor.weapons.ranged,null);
    assert(!actor.notes.includes('dc, damage,'));
});
