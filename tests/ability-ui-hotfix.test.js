import test from 'node:test';import assert from 'node:assert/strict';
import * as E from '../engine.js';
import {skillPreset,acrobaticsPresets,skillLabel,applicationTitle} from '../skills.js';
import {selfAbility,abilityRestriction,coordinateInput,carrySelection,carryDestinationMarkup} from '../ability-ui.js';
import {createCheckDrafts,checkMarkup,checkIntent} from '../checks-ui.js';
import {skillsMarkup} from '../skills-ui.js';
function scene(){let s=E.setRules(E.emptyState(),{statMode:'bonuses',movementBase:6,movementStat:'none',splitMovement:true,multiActionsEnabled:true}).state;s=E.setBoard(s,{width:12,height:8}).state;for(const a of [{name:'Helper',side:'player',initiative:30,position:{x:2,y:3},actionsPerTurn:4,resources:[{id:'mana',kind:'ammo',name:'Mana',quantity:10}],skills:[...acrobaticsPresets('de').map(v=>({...v,resource:'mana',cost:2})),{...skillPreset('carry'),id:'carry'}]},{name:'Scout',side:'ally',position:{x:1,y:3},hp:0,condition:'stabilized'},{name:'Enemy',side:'enemy',position:{x:11,y:7},initiative:10}])s=E.addActor(s,a).state;return E.startCombat(s,false).state;}
test('UI hotfix: failed Acrobatics retains self context, explains its cap and manual override enables another paid attempt',()=>{
 let s=scene(),a=s.actors[0],skill=a.skills.find(v=>v.kind==='acrobatics'),intent={type:'skill',actor:a.id,target:a.id,skill:skill.id};s=E.resolveAction(s,intent,{roll:()=>1}).state;a=s.actors[0];assert(selfAbility(skill));assert.match(abilityRestriction(s,a,a,skill,'en'),/already attempted/);assert.equal(a.resources[0].quantity,8);assert.equal(s.movement.spent,1);assert.throws(()=>E.resolveAction(s,intent),/bereits versucht/);
 s=E.setUnlimited(s,a.id,true).state;a=s.actors[0];assert.equal(abilityRestriction(s,a,a,skill,'en'),'');const r=E.resolveAction(s,intent,{roll:()=>20});assert(r.result.success);assert.equal(r.state.actors[0].resources[0].quantity,6);assert.equal(r.state.movement.spent,1);assert.equal(r.state.action.freeSpent,2);assert.equal(r.state.actors[0].acrobaticsTurn,r.state.turnSerial);
 const locked=E.setUnlimited(r.state,a.id,false).state;assert(!E.canUseSkill(locked,locked.actors[0],locked.actors[0],skill));
});
test('UI hotfix: manual retry does not unlock Basic/model repeated Acrobatics or bypass stock and movement',()=>{
 let s=scene(),a=s.actors[0],skill=a.skills.find(v=>v.kind==='acrobatics'),intent={type:'skill',actor:a.id,target:a.id,skill:skill.id};s=E.resolveAction(s,intent,{roll:()=>1}).state;s=E.setUnlimited(s,a.id,true).state;const before=E.clone(s);for(const source of ['basic','model','dm'])assert.throws(()=>E.resolveAction(s,intent,{source}),/bereits versucht/);assert.deepEqual(s,before);
 let zero=E.editActor(s,a.id,{resources:[{...s.actors[0].resources[0],quantity:0}]}).state;assert(!E.canUseSkill(zero,zero.actors[0],zero.actors[0],skill));zero=E.editActor(s,a.id,{tactics:[{type:'rooted',turns:2}]}).state;assert(!E.canUseSkill(zero,zero.actors[0],zero.actors[0],skill));
});
for(const language of ['de','en'])test('UI hotfix '+language+': self-effect DC check has no target selector, keeps self even when exhausted',()=>{
 let s=scene(),a=s.actors[0],skill=a.skills.find(v=>v.kind==='acrobatics'),d=createCheckDrafts().get('self',a.id);Object.assign(d,{description:'Balance',effect:skill.id,target:'bogus'});const html=checkMarkup(s,a,d,language);assert(!html.includes('name="check-target"'));assert.equal(d.target,a.id);s=E.resolveAction(s,{type:'skill',actor:a.id,target:a.id,skill:skill.id},{roll:()=>1}).state;assert(!checkMarkup(s,s.actors[0],d,language).includes('name="check-target"'));assert.equal(d.target,a.id);
});
for(const language of ['de','en'])test('UI hotfix '+language+': built-in application names follow interface language, custom names stay unchanged',()=>{
 const s=scene(),a=s.actors[0],html=skillsMarkup(a,a.skills,language,s.rules);if(language==='en'){assert(!html.includes('Deckung überwinden'));assert(!html.includes('Springen'));assert(!html.includes('Explain effect: Akrobatik'));assert(html.includes('Explain effect: Overcome cover'));assert(html.includes('Explain effect: Jump'));}
 for(const pair of acrobaticsPresets(language==='en'?'de':'en'))assert(!applicationTitle(pair,language).includes(' · '));
 const custom={...a.skills[0],name:'Ivos Kunststück'};assert.equal(skillLabel(custom,language),'Ivos Kunststück');assert(applicationTitle(custom,language).includes('Ivos Kunststück'));
});
for(const [raw,expected]of [['A6',{x:0,y:5}],[' aa 6 ',{x:26,y:5}],['A0',null],['<x>',null],['1A',null]])test('UI hotfix: coordinate entry '+raw,()=>assert.deepEqual(coordinateInput(raw),expected));
test('UI hotfix: carry field is compact, previews both endpoints and rejects invalid entries without choosing a default',()=>{
 const s=scene(),[a,b]=s.actors;const blank=carrySelection(s,a,b,'','en');assert(!blank.plan);assert.match(blank.error,/Enter/);const good=carrySelection(s,a,b,'F4','en');assert(good.plan);assert.equal(good.plan.cost,4);assert.deepEqual(good.plan.carrier,{x:6,y:3});const html=carryDestinationMarkup(s,a,b,'F4','en');assert((html.match(/<option/g)??[]).length<=9);assert(html.includes('name="skillCarrierCell"'));assert(html.includes('Scout → F4'));assert(html.includes('Helper → G4'));assert(html.includes('4 movement points'));assert.match(carrySelection(s,a,b,'Z99','en').error,/outside/);assert.match(carrySelection(s,a,b,'L8','en').error,/occupied/);assert.match(carrySelection(s,a,b,'K4','en').error,/No affordable/);assert.match(carrySelection(s,a,b,'wrong','en').error,/coordinate/);
});
test('UI hotfix: own-check carrying requires explicit legal coordinate and keeps action/stock unchanged before resolution',()=>{
 const s=scene(),[a,b]=s.actors,d=createCheckDrafts().get('carry',a.id);Object.assign(d,{description:'Carry to safety',effect:'carry',target:b.id});const before=E.clone(s);assert.throws(()=>checkIntent(s,a,d),/Zielfeld/);assert(checkMarkup(s,a,d,'en').includes('name="check-carryCell"'));d.carryCell='F4';checkMarkup(s,a,d,'en');const intent=checkIntent(s,a,d);assert.deepEqual(intent.destination,{x:5,y:3});assert.deepEqual(s,before);d.carryCell='Z99';assert.throws(()=>checkIntent(s,a,d),/außerhalb/);
});
