import test from 'node:test';import assert from 'node:assert/strict';
import * as E from '../engine.js';import {skillPreset} from '../skills.js';import {STATUS_TYPES} from '../status-types.js';
import {reactionBudget,reactionsOff} from '../reaction-budget.js';import {DAMAGE_TYPES,traitsFrom,damageType} from '../combat-traits.js';
import {defenseHeading,defenseActions,readDefense} from '../defense-ui.js';import {readTraits,traitsMarkup} from '../traits-ui.js';
import {exportProfiles,profileFrom,transferPatch} from '../profiles.js';import {createController} from '../controller.js';import {calculationsMarkup} from '../calculations-help.js';
const roll=n=>n===20?15:n;
function scene({count=2,cost='extra',control='auto',type='physical',damage='1d4+1',weapon={},defender={},rules={}}={}){
 let s=E.setRules(E.emptyState(),{reactionsEnabled:true,reactionsPerTurn:count,reactionBlock:1,shieldsEnabled:true,skillsEnabled:true,effectsEnabled:true,resourcesEnabled:true,multiActionsEnabled:true,splitMovement:true,natural20:false,rngMode:'seeded',seed:'1921',...rules}).state;
 s=E.addActor(s,{name:'Defender',side:'player',hp:200,maxHp:200,initiative:cost==='extra'?20:40,position:{x:4,y:1},actionsPerTurn:6,reactionControl:control,reactionCost:cost,reactionChoices:['block'],resources:[{id:'mana',name:'Mana',kind:'ammo',quantity:20}],...defender}).state;
 s=E.addActor(s,{name:'Attacker',side:'enemy',hp:200,maxHp:200,initiative:30,position:{x:1,y:1},actionsPerTurn:6,attackBonus:100,resources:[{id:'ammo',name:'Ammo',kind:'ammo',quantity:20}],weaponList:[{id:'bow',name:'Bow',mode:'ranged',range:20,damage,damageType:type,resource:'ammo',cost:1,...weapon}]}).state;
 s=E.addActor(s,{name:'Observer',side:'ally',hp:50,maxHp:50,initiative:1,position:{x:9,y:9}}).state;
 s.actors[0].id='def';s.actors[1].id='atk';s.actors[2].id='observer';return E.startCombat(s,false).state;
}
const actor=(s,id='def')=>E.findActor(s,id),attack={type:'attack',actor:'atk',target:'def',weapon:'bow'};
const hit=(s,options={})=>E.resolveAction(s,attack,{roll,...options});
const currentNoReaction={def:{kind:'none'}};
const reactive=(timing='after')=>({...skillPreset('narrative'),id:'cleanse',name:'Cleanse',description:'I extinguish the flames',reaction:true,reactionTiming:timing,range:0,check:false,resource:'mana',cost:2,mechanics:{target:'self',status:{mode:'remove',type:'burning'}}});

test('global numeric budget allows exactly two reactions to separate attacks and resets only at the next own turn',()=>{
 let s=scene();for(let i=0;i<3;i++){const r=hit(s);assert.equal(r.result.damage,i<2?4:5);s=r.state;assert.equal(actor(s).reactionSpent,Math.min(i+1,2));}assert.equal(reactionBudget(s,actor(s)).remaining,0);assert.equal(s.log.filter(e=>e.type==='reaction').length,2);s=E.endTurn(s).state;assert.equal(E.currentActor(s).id,'def');assert.equal(reactionBudget(s,actor(s)).remaining,2);assert.equal(actor(s).reactionReserved,0);
});
test('numeric reservation spends one matching normal action per reserved response and consumes one reservation per incoming attack',()=>{
 let s=scene({count:3,cost:'normal'});for(let i=0;i<3;i++){assert(E.canReserveReaction(s,actor(s)));s=E.resolveAction(s,{type:'reserve',actor:'def'}).state;assert.equal(s.action.freeSpent,i+1);}assert(!E.canReserveReaction(s,actor(s)));assert.equal(reactionBudget(s,actor(s)).reserved,3);s=E.endTurn(s).state;
 for(let i=0;i<2;i++)s=hit(s).state;assert.equal(actor(s).reactionSpent,2);assert.equal(actor(s).reactionReserved,1);assert.equal(s.action.freeSpent,2);assert.equal(actor(s).resources[0].quantity,20);
});
test('matching bonus reservations use their own pool and cannot spend free actions in their place',()=>{
 let s=scene({count:3,cost:'bonus',defender:{bonusActions:[{id:'r',name:'Reactions',count:2,allowed:['reserve']}]}});for(let i=0;i<2;i++)s=E.resolveAction(s,{type:'reserve',actor:'def'}).state;assert.equal(s.action.freeSpent,0);assert.equal(s.action.bonusSpent.r,2);assert(!E.canReserveReaction(s,actor(s)));assert.equal(actor(s).reactionReserved,2);
});
test('lowering and raising the limit does not reset spent or discard already paid unused reservations',()=>{
 let s=scene({count:3,cost:'normal'});for(let i=0;i<2;i++)s=E.resolveAction(s,{type:'reserve',actor:'def'}).state;s=E.endTurn(s).state;s=E.editActor(s,'def',{reactionsPerTurn:1}).state;s=hit(s).state;assert.equal(actor(s).reactionSpent,1);assert.equal(actor(s).reactionReserved,1);assert.equal(reactionBudget(s,actor(s)).remaining,0);s=E.editActor(s,'def',{reactionsPerTurn:3}).state;assert.equal(reactionBudget(s,actor(s)).remaining,2);assert.equal(reactionBudget(s,actor(s)).reserved,1);s=hit(s).state;assert.equal(actor(s).reactionSpent,2);assert.equal(actor(s).reactionReserved,0);
});
test('per-actor zero/override/inheritance distinguishes unavailable reactions, spent budget and the global switch',()=>{
 let s=scene({count:3});assert.equal(reactionBudget(s,actor(s)).total,3);s=E.editActor(s,'def',{reactionsPerTurn:0}).state;assert(reactionsOff(s,actor(s)));assert.match(defenseHeading(s,actor(s),'en'),/data-reaction-state="none"[^>]*>Unavailable</);s=E.editActor(s,'def',{reactionsPerTurn:2,reactionSpent:2,reactionUsed:true}).state;assert(!reactionsOff(s,actor(s)));assert.match(defenseHeading(s,actor(s),'en'),/data-reaction-state="spent"/);assert.match(defenseHeading(s,actor(s),'en'),/0 \/ 2/);s=E.setRules(s,{reactionsEnabled:false}).state;assert.match(defenseHeading(s,actor(s),'en'),/data-reaction-state="global-off"[^>]*>Global off</);assert.match(defenseHeading(s,actor(s),'en'),/Shields are controlled separately/);assert(s.rules.shieldsEnabled);
});
test('older saved actors retain one reaction and their used/reserved flags without global-default reinterpretation',()=>{
 const raw=E.clone(scene({count:3}));for(const a of raw.actors)for(const k of ['reactionsPerTurn','reactionSpent','reactionReserved'])delete a[k];raw.actors[0].reactionUsed=true;raw.actors[0].reactionReserve=false;const s=E.validateState(raw);assert.equal(reactionBudget(s,actor(s)).total,1);assert.equal(reactionBudget(s,actor(s)).spent,1);assert.equal(reactionBudget(s,actor(s)).remaining,0);const profile=profileFrom({kind:'combat-actors',version:1,statMode:'scores',actors:raw.actors});assert.equal(profile.actors[0].reactionsPerTurn,1);
});
test('invalid reaction counts reject without changing actor, RNG, actions or paid reservations',()=>{
 const s=scene(),before=E.clone(s);for(const value of [-1,21,1.2,'',true])assert.throws(()=>E.setRules(s,{reactionsPerTurn:value}));for(const value of [-1,21,1.2,true])assert.throws(()=>E.editActor(s,'def',{reactionsPerTurn:value}));assert.deepEqual(s,before);
});
test('unreacting and invalid choices do not consume one of several available reactions',()=>{
 const s=scene(),r=hit(s,{reactionDecisions:currentNoReaction});assert.equal(actor(r.state).reactionSpent,0);assert.equal(reactionBudget(r.state,actor(r.state)).remaining,2);assert.throws(()=>hit(s,{reactionDecisions:{def:{kind:'not-a-reaction'}}}));assert.equal(s.rng.cursor,0);
});
test('multiple mechanical responses each have one success check and cost while the original attacks happen once',()=>{
 let s=scene({control:'manual',type:'fire',weapon:{effects:[{type:'burning',turns:2,damage:'2'}]},defender:{reactionChoices:['narrative'],skills:[reactive()]}});for(let i=0;i<3;i++){s=hit(s,{reactionDecisions:i<2?{def:{kind:'narrative',skill:'cleanse'}}:{}}).state;}assert.equal(actor(s).resources[0].quantity,16);assert.equal(actor(s).reactionSpent,2);assert(actor(s).effects.some(e=>e.type==='burning'));assert.equal(s.log.filter(e=>e.type==='hit').length,3);assert.equal(s.log.filter(e=>e.type==='reaction').length,2);
});
for(const type of ['physical','fire','poison'])test(type+' resistance halves only matching damage and rounds odd HP down',()=>{
 const s=scene({type,defender:{reactionChoices:[],damageResistances:[type]}}),r=hit(s);assert.equal(r.result.damage,2);assert.equal(r.result.affected[0].resistanceReduction,3);assert.equal(actor(r.state).hp,198);assert.equal(actor(r.state,'atk').resources[0].quantity,19);assert.equal(r.result.damageType,type);
});
test('a resistance to a different type leaves damage unchanged; legacy untyped profiles are physical',()=>{
 const s=scene({type:'fire',defender:{reactionChoices:[],damageResistances:['poison']}});assert.equal(hit(s).result.damage,5);const old=E.editActor(s,'atk',{weaponList:[{id:'bow',name:'Old',mode:'ranged',range:20,damage:'1d4+1'}]}).state;assert.equal(hit(old).result.damageType,'physical');assert.equal(hit(old).result.damage,5);
});
test('critical damage, cover, resistance, shield and block execute in that order with exact recorded values',()=>{
 let s=scene({type:'fire',damage:'1d6',weapon:{damageBonus:1},rules:{natural20:true,criticalDamage:'doubleMax',coverDistanceEnabled:true,coverPercent:50},defender:{damageResistances:['fire'],shieldProfiles:[{id:'reduce',name:'Ward',kind:'reduce',amount:1,turns:3}],shields:[{profile:'reduce',turns:3,charges:1}]}});s=E.setBoard(s,{cover:[{x:3,y:1}]}).state;let draws=0;const r=hit(s,{roll:()=>{draws++;return 20;}}),d=r.result.affected[0];assert.equal(draws,1);assert.equal(r.result.rawDamage,14);assert.equal(d.beforeResistance,7);assert.equal(d.resistanceReduction,4);assert.equal(d.shieldReduction,1);assert.equal(d.blockReduction,1);assert.equal(d.damage,1);assert.equal(actor(r.state).hp,199);assert.match(E.resultText(r.result,'en'),/7 × 50% = 3/);
});
test('an absorb shield is not consumed by damage already reduced to zero by resistance',()=>{
 const s=scene({type:'fire',damage:'1d4-3',defender:{reactionChoices:[],damageResistances:['fire'],shieldProfiles:[{id:'absorb',name:'Bubble',kind:'absorb',turns:3}],shields:[{profile:'absorb',turns:3,charges:1}]}}),r=hit(s);assert.equal(r.result.damage,0);assert.equal(actor(r.state).shields.length,1);assert.equal(r.result.affected[0].absorbed,false);
});
test('area targets independently apply their own resistance after distance falloff',()=>{
 let s=scene({type:'fire',weapon:{radius:1},defender:{reactionChoices:[],damageResistances:['fire']}});s=E.moveActor(s,'observer',{x:4,y:2},true).state;const r=hit(s),primary=r.result.affected.find(v=>v.id==='def'),neighbor=r.result.affected.find(v=>v.id==='observer');assert.equal(primary.damage,2);assert.equal(neighbor.damage,2);assert.equal(neighbor.resistancePercent,100);
});
test('all supported condition immunities block custom application without changing an existing other condition or adding another roll',()=>{
 for(const type of Object.keys(STATUS_TYPES)){let s=scene({defender:{reactionChoices:[],conditionImmunities:[type]}});s=E.editActor(s,'atk',{skills:[{...skillPreset('narrative'),id:'effect',check:false,range:20,resource:'ammo',cost:2,mechanics:{target:'selected',status:{mode:'apply',type,turns:3}}}]}).state;let draws=0;const r=E.resolveAction(s,{type:'skill',actor:'atk',target:'def',skill:'effect'},{roll:n=>{draws++;return roll(n);}});assert(r.result.success);assert(r.result.custom.status.immune,type);assert.equal(draws,0);assert.equal([...actor(r.state).effects,...actor(r.state).tactics].length,0);assert.equal(actor(r.state,'atk').resources[0].quantity,18);assert.match(E.resultText(r.result,'en'),/Immunity/);}
});
test('builtin tactical and classic abilities respect immunity but still pay a valid attempt',()=>{
 const mapping={hold:'rooted',stun:'stunned',intimidate:'frightened',provoke:'provoked',distract:'distracted'};for(const[kind,type]of Object.entries(mapping)){let s=scene({defender:{reactionChoices:[],conditionImmunities:[type]}});s=E.editActor(s,'atk',{skills:[{...skillPreset(kind),id:'ability',check:false,range:20,resource:'ammo',cost:1}]}).state;const r=E.resolveAction(s,{type:'skill',actor:'atk',target:'def',skill:'ability'},{roll});assert.equal(r.result.immuneStatus,type);assert.equal([...actor(r.state).effects,...actor(r.state).tactics].length,0);assert.equal(actor(r.state,'atk').resources[0].quantity,19);}
});
test('burning immunity prevents on-hit status but leaves typed fire damage and the one attack cost intact',()=>{
 const s=scene({type:'fire',weapon:{effects:[{type:'burning',turns:3,damage:'2'}]},defender:{reactionChoices:[],conditionImmunities:['burning']}}),r=hit(s);assert.equal(r.result.damage,5);assert.equal(r.result.immuneEffects.length,1);assert.equal(actor(r.state).effects.length,0);assert.equal(actor(r.state,'atk').resources[0].quantity,19);assert.match(E.eventText(r.state.log.find(e=>e.type==='hit'),'en'),/immune to Burning/);
});
test('enabling immunity preserves active conditions; explicit clear removes only immune ones, and new manual applications are blocked',()=>{
 let s=scene({defender:{effects:[{type:'burning',turns:4,damage:'5'},{type:'poisoned',turns:4,damage:'1d4-3'}]}});s=E.editActor(s,'def',{conditionImmunities:['burning']}).state;assert.equal(actor(s).effects.length,2);s=E.editActor(s,'def',{clearImmuneStatuses:true}).state;assert.deepEqual(actor(s).effects.map(e=>e.type),['poisoned']);s=E.editActor(s,'def',{effects:[...actor(s).effects,{type:'burning',turns:3,damage:'2'}]}).state;assert.deepEqual(actor(s).effects.map(e=>e.type),['poisoned']);assert.deepEqual(s.log.at(-1).details.blockedStatuses,['burning']);
});
test('existing burning continues under immunity, uses fire resistance, and does not consume a shield during periodic damage',()=>{
 let s=scene({defender:{reactionChoices:[],conditionImmunities:['burning'],damageResistances:['fire'],effects:[{type:'burning',turns:4,damage:'5'}],shieldProfiles:[{id:'a',name:'Bubble',kind:'absorb',turns:5}],shields:[{profile:'a',turns:5,charges:1}]}});s=E.endTurn(s).state;s=E.endTurn(s).state;assert.equal(actor(s).hp,198);assert.equal(actor(s).shields.length,1);const e=s.log.findLast(e=>e.type==='effect'&&e.details.effect==='burning');assert.equal(e.details.damageType,'fire');assert.equal(e.details.beforeResistance,5);assert.equal(e.details.damage,2);assert.match(E.eventText(e,'en'),/resistance 50%/);
});
test('custom typed damage, healing and immune status share one check and one stock cost',()=>{
 let s=scene({defender:{reactionChoices:[],damageResistances:['fire'],conditionImmunities:['burning']}});s=E.editActor(s,'atk',{skills:[{...skillPreset('narrative'),id:'combo',check:true,dc:5,range:20,resource:'ammo',cost:3,mechanics:{target:'selected',damage:{dice:'1d4+1',type:'fire'},healing:{dice:'1d4-3'},status:{mode:'apply',type:'burning',turns:2}}}]}).state;let draws=0;const r=E.resolveAction(s,{type:'skill',actor:'atk',target:'def',skill:'combo'},{roll:n=>{draws++;return roll(n);}});assert.equal(draws,3);assert.equal(r.result.custom.damage.applied,2);assert.equal(r.result.custom.healing.applied,1);assert(r.result.custom.status.immune);assert.equal(actor(r.state,'atk').resources[0].quantity,17);assert.equal(actor(r.state).hp,199);
});
test('traits and typed standard/custom/periodic damage survive full state and profile transfer; old effects profiles preserve traits',()=>{
 let s=scene({type:'fire',defender:{conditionImmunities:['burning'],damageResistances:['fire']},weapon:{standard:{damage:'1d4-1',damageType:'physical'}}});const restored=E.validateState(JSON.parse(JSON.stringify(s)));assert.deepEqual(actor(restored).conditionImmunities,['burning']);assert.deepEqual(actor(restored).damageResistances,['fire']);const p=profileFrom(exportProfiles(s,'effects','def'));assert.deepEqual(p.conditionImmunities,['burning']);assert.deepEqual(p.damageResistances,['fire']);const target={...actor(s,'observer'),damageResistances:['poison']};const patch=transferPatch(target,p,'append',s);assert.deepEqual(patch.damageResistances,['poison','fire']);assert(!Object.hasOwn(transferPatch(target,{kind:'combat-effects',version:1,effects:[]},'replace',s),'damageResistances'));assert.equal(profileFrom(exportProfiles(s,'weapons','atk')).weaponList[0].standard.damageType,'physical');
});
test('invalid types, immunity/resistance lists and duplicates reject before mutation',()=>{
 const s=scene(),before=E.clone(s);for(const damageType of ['unknown','',true])assert.throws(()=>E.editActor(s,'atk',{weaponList:[{...actor(s,'atk').weaponList[0],damageType}]}));for(const value of [['fire','fire'],['unknown'],{}])assert.throws(()=>E.editActor(s,'def',{damageResistances:value}));for(const value of [['burning','burning'],['dead'],true])assert.throws(()=>E.editActor(s,'def',{conditionImmunities:value}));for(const type of Object.keys(DAMAGE_TYPES))assert.equal(damageType(type),type);assert.deepEqual(s,before);
});
test('controller undo restores numeric reaction usage, reservations, HP, stock and traits; duplicate receipts do not consume again',async()=>{
 let bundle={state:scene({type:'fire',defender:{damageResistances:['fire']}}),history:[]};const c=createController({key:()=> '1921',read:()=>bundle,write:v=>bundle=v,save:async()=>{}}),before=E.clone(c.state());await c.act(attack,{roll,receipt:'one'});assert.equal(actor(c.state()).reactionSpent,1);assert((await c.act(attack,{roll,receipt:'one'})).duplicate);assert.equal(actor(c.state()).reactionSpent,1);await c.undo();assert.equal(actor(c.state()).reactionSpent,0);assert.equal(actor(c.state()).reactionReserved,0);assert.deepEqual(actor(c.state()).damageResistances,before.actors[0].damageResistances);assert.equal(actor(c.state()).hp,200);assert.deepEqual(c.state().rng,before.rng);
});
for(const language of ['de','en'])test('calculation overview '+language+' uses saved rules and actor budget with one central entry for each formula',()=>{
 const s=scene({count:3,rules:{statMode:'bonuses',criticalDamage:'doubleMax',perceptionRange:true}}),markup=calculationsMarkup(s,language);assert(markup.includes('doubleMax'));assert(markup.includes('8 +'));assert(markup.includes('50%'));assert(markup.includes('floor'));assert(markup.includes(language==='en'?'entered value':'Bonus'));assert(!markup.includes('undefined'));assert(markup.includes(language==='en'?'Corroding':'Verätzt'));assert.equal((markup.match(/<tr>/g)??[]).length,18);
});
test('trait/reaction readers preserve omitted programmatic fields and distinguish inherit from explicit zero',()=>{
 const a=actor(scene());assert.equal(readDefense(new Map(),a).reactionsPerTurn,null);assert.equal(readDefense(new Map([['reactionsPerTurn','0']]),a).reactionsPerTurn,'0');assert.equal(readDefense(new Map([['reactionsPerTurn','']]),a).reactionsPerTurn,null);assert.deepEqual(readTraits(new Map(),{conditionImmunities:['burning'],damageResistances:['fire']}),{conditionImmunities:['burning'],damageResistances:['fire'],damageImmunities:[]});assert.equal(readTraits(new Map([['traits-present','1'],['immune-burning','on'],['resist-fire','on'],['clearImmuneStatuses','on']]),a).clearImmuneStatuses,true);assert(traitsMarkup(a,'en').includes('Condition immunities'));
});

test('compact and full model context expose selected defenses and effective numeric reaction budget without describing new effects',()=>{
 const s=scene({count:3,defender:{damageResistances:['fire'],conditionImmunities:['burning']}});for(const compact of [false,true]){const prompt=E.buildPrompt(s,{compact});assert(prompt.includes('"damageResistances":["fire"]'));assert(prompt.includes('"conditionImmunities":["burning"]'));assert(prompt.includes('"reactionBudget":{"total":3'));}
});
