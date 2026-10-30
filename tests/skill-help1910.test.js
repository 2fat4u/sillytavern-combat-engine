import test from 'node:test';
import assert from 'node:assert/strict';
import { skillPreset } from '../skills.js';
import { skillExplanation } from '../skill-help.js';
import { skillsMarkup, bindSkills } from '../skills-ui.js';
import { compactEditorHelp } from '../editor-help.js';
import * as E from '../engine.js';

const actor={resources:[{id:'mana',name:'Mana <shared>',quantity:10}]};
const explain=(kind,patch={},rules={})=>skillExplanation(actor,{...skillPreset(kind,'en'),...patch},'en',{...E.emptyState().rules,...rules}).replace(/<[^>]*>/g,'');

test('Ability explanations appear once per ability; general help is not repeated in every row',()=>{
    const skills=['sprint','disarm','hold'].map(k=>skillPreset(k,'en'));
    const html=skillsMarkup(actor,skills,'en',E.emptyState().rules);
    assert.equal((html.match(/Expand explanation/g)||[]).length,1);
    assert.equal((html.match(/Explain effect:/g)||[]).length,3);
    assert.equal((html.match(/Abilities and custom special abilities/g)||[]).length,1);
    assert.equal((html.match(/Doubles the normal movement budget/g)||[]).length,1);
    assert.equal((html.match(/Disables exactly the selected target weapon/g)||[]).length,1);
    assert(!html.includes('Sprint and acrobatics last'));
});
test('Sprint help describes extra movement, spent points and once-per-turn limit, rather than an editable duration',()=>{
    const html=explain('sprint');assert.match(html,/Doubles the normal movement/);assert.match(html,/already spent stays spent/);assert.match(html,/Once per turn/);assert.match(html,/current turn only/);
    const form=skillsMarkup(actor,[skillPreset('sprint','en')],'en');assert.match(form,/type="hidden" name="skill-0-turns"/);assert(!form.includes('name="skill-0-turns" type="number"'));
});
test('Acrobatics help describes cover cost, legal landing and movement lost on failure; Basic AI limitation is explicit',()=>{
    const html=explain('acrobatics');assert.match(html,/1 instead of 2/);assert.match(html,/free landing/);assert.match(html,/Failure also spends 1/);assert.match(html,/Basic AI does not initiate/);
});
test('Hold and stun explain distinct action and movement effects',()=>{
    assert.match(explain('hold'),/It can still attack, heal/);assert.match(explain('hold'),/does not stun/);
    assert.match(explain('stun'),/cannot act or move/);assert.match(explain('stun'),/turn is skipped automatically/);
});
test('Disarm describes one weapon including its standard variant, other weapons and expiry',()=>{
    const html=explain('disarm');assert.match(html,/including its standard variant/);assert.match(html,/Other weapons remain usable/);assert.match(html,/not deleted/);assert.match(html,/effect expires/);
});
test('Forced movement descriptions include pit rescue rule, ally rescue cost and immediate effect',()=>{
    assert.match(explain('shove',{}, {pitRescueRounds:7}),/7 full rescue rounds/);assert.match(explain('shove'),/one immediate displacement/);
    assert.match(explain('carry'),/including an unconscious ally/);assert.match(explain('carry'),/actual route spends remaining movement/);assert.match(explain('carry'),/does not heal or stabilize/);
});
test('Provocation and intimidation do not promise instant attacks or instant removal',()=>{
    assert.match(explain('provoke'),/legally reachable and attackable/);assert.match(explain('provoke'),/Does not trigger an immediate or additional attack/);
    assert.match(explain('intimidate',{}, {natural20:false}),/Critical ability rolls are disabled/);assert.match(explain('intimidate',{}, {natural20:true}),/fleeing still requires a board edge/);
});
test('Aim, distract and support display current global values and explain consumption on an attempted roll',()=>{
    for(const [kind,key] of [['aim','aimBonus'],['distract','distractBonus'],['support','supportBonus']]){
        const html=explain(kind,{}, {[key]:3.5});assert.match(html,/\+3\.5/);assert.match(html,/including (a miss|failure)/);
    }
    assert.match(explain('aim'),/melee attacks do not use it/);assert.match(explain('support'),/Free narrative checks do not use it/);
});
test('Hiding help follows actual terrain, ambush, critical and module settings',()=>{
    const html=explain('hide',{}, {hideNeedsTerrain:false,hiddenDamageMultiplier:1.5,ambushStacksCritical:true,stealthEnabled:false});
    assert.match(html,/No terrain requirement/);assert.match(html,/ambush factor 1\.5/);assert.match(html,/Critical hits also receive/);assert.match(html,/Hiding is currently disabled/);assert.match(html,/Basic AI does not initiate/);
    assert.match(explain('hide'),/cover at the same height/);
});
test('Status help explains actual configured periodic damage, penalty, slowing and disabled modules',()=>{
    assert.match(explain('status',{status:'poisoned',statusDamage:4},{poisonPenalty:1.5,effectDamageOverrides:{poisoned:'1d6'}}),/−1\.5 to attack rolls and 1d6 HP damage at own turn ends/);
    for(const status of ['burning','bleeding'])assert.match(explain('status',{status,statusDamage:4}),/4 HP damage at own turn ends/);
    assert.match(explain('status',{status:'slowed'},{slowedPercent:25}),/25% of normal movement, at least 1/);
    assert.match(explain('status',{status:'stunned'}),/turn is skipped automatically/);
    assert.match(explain('status',{}, {effectsEnabled:false}),/Status effects are disabled/);
});
test('Check, resource and duration help reflect the profile plus global overrides; user strings are escaped',()=>{
    const html=explain('distract',{turns:2,resource:'mana',cost:3,dc:17.5,bonus:1.5,stat:'charisma'},{effectDurationOverrides:{distracted:5}});
    assert.match(html,/Duration: 5 target own turns/);assert.match(html,/overrides the profile duration/);assert.match(html,/d20 \+ Charisma \+1\.5 ability bonus against DC 17\.5/);
    assert.match(html,/costs 3 Mana &lt;shared&gt; per use/);assert(!html.includes('<shared>'));
    assert.match(explain('aim'),/Without a check/);assert.match(explain('aim',{resource:'mana'},{resourcesEnabled:false}),/No stock consumption/);
    const form=skillsMarkup(actor,[{...skillPreset('hold','en'),name:'<img onerror=alert(1)>'}],'en');assert(!form.includes('<img onerror='));
});
test('German ability explanations use German effect, cost and duration descriptions',()=>{
    const html=skillsMarkup(actor,[skillPreset('disarm'),skillPreset('sprint')],'de',E.emptyState().rules).replace(/<[^>]*>/g,'');
    assert.match(html,/Wirkung erklären:/);assert.match(html,/Standardvariante/);assert.match(html,/Bereits ausgegebene Bewegung/);assert.match(html,/Kosten: normale/);assert(!html.includes('Explain effect:'));
});
test('Collapsible generic editor help deduplicates repeated text while preserving input controls',()=>{
    const note='<p class="ct-muted">One explanation.</p>',html=compactEditorHelp(note+note+'<p><input name="safe">Editable.</p>','skills','en');
    assert.equal((html.match(/One explanation/g)||[]).length,1);assert.match(html,/<input name="safe">/);
});
test('Editing an ability updates its explanation without rerendering or losing the rest of the profile draft',()=>{
    const original=globalThis.FormData,skill=skillPreset('hold','en'),values=new Map([['name','Unsaved actor name'],['skill-0-name',skill.name],['skill-0-stat','strength'],['skill-0-range','1'],['skill-0-check','on'],['skill-0-dc','16'],['skill-0-bonus','2'],['skill-0-cost','3'],['skill-0-turns','4'],['skill-0-resource','mana'],['skill-0-ai','on']]);
    const form={values},panel={innerHTML:'',open:true},events={};let renders=0;
    const host={closest:()=>form,querySelector:()=>panel,addEventListener:(name,fn)=>events[name]=fn,set innerHTML(v){this.html=v;renders++;},get innerHTML(){return this.html;}};
    globalThis.FormData=class{constructor(f){this.v=f.values;}get(k){return this.v.get(k)??null;}has(k){return this.v.has(k);}};
    try{
        const draft=bindSkills(host,{...actor,skills:[skill]},'en');assert.equal(renders,1);
        events.change({target:{name:'skill-0-turns'}});
        assert.equal(renders,1);assert.equal(panel.open,true);assert.equal(values.get('name'),'Unsaved actor name');assert.match(panel.innerHTML.replace(/<[^>]*>/g,''),/Duration: 4/);assert.match(panel.innerHTML,/costs 3 Mana/);
        assert.equal(draft.get()[0].turns,4);assert.equal(draft.get()[0].resource,'mana');
    }finally{globalThis.FormData=original;}
});
