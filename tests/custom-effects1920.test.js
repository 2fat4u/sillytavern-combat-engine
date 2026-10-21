import test from 'node:test';import assert from 'node:assert/strict';
import * as E from '../engine.js';import {skillPreset} from '../skills.js';
import {STATUS_TYPES} from '../status-types.js';import {mechanicsFrom} from '../custom-effects.js';
import {createCheckDrafts,checkIntent,narrativeFromCheck} from '../checks-ui.js';
import {customDraft,recipeFromDraft,readCustomDraft,customEffectMarkup} from '../custom-effects-ui.js';
import {exportProfiles,profileFrom,transferPatch} from '../profiles.js';import {createController} from '../controller.js';
import {visualCues} from '../visual-effects.js';import {cuesForChange} from '../sounds.js';
function scene(rules={}){
 let s=E.setRules(E.emptyState(),{statMode:'bonuses',multiActionsEnabled:true,splitMovement:true,natural20:false,skillsEnabled:true,effectsEnabled:true,resourcesEnabled:true,...rules}).state;
 s=E.setBoard(s,{width:9,height:9}).state;
 for(const a of [{name:'Adept',side:'player',position:{x:1,y:1},initiative:30,maxHp:40,hp:20,actionsPerTurn:10,stats:{intelligence:3},resources:[{id:'mana',name:'Mana',kind:'ammo',quantity:20,capacity:20}]},{name:'Target',side:'enemy',position:{x:3,y:1},initiative:20,maxHp:40,hp:20,stats:{strength:4,dexterity:2}},{name:'Friend',side:'ally',position:{x:1,y:2},initiative:10}])s=E.addActor(s,a).state;
 s=E.addActor(s,{name:'Observer',side:'enemy',position:{x:8,y:8},initiative:5}).state;
 return E.startCombat(s,false).state;
}
const recipe=(patch={})=>({target:'selected',damage:null,healing:null,status:null,...patch});
const intent=(s,mechanics,patch={})=>({type:'check',actor:s.actors[0].id,target:s.actors[1].id,description:'A deliberate special effect',stat:'intelligence',bonus:0,dc:10,resource:'mana',cost:2,mechanics,effectRange:5,...patch});
const draw=n=>n===20?15:4;
for(let mask=1;mask<8;mask++)for(const success of [false,true])test('1920 combined effects '+mask+' '+(success?'success':'failure')+' share one check and one payment',()=>{
 const s=scene(),m=recipe({damage:mask&1?{dice:'1d6',bonus:2}:null,healing:mask&2?{dice:'1d8',bonus:3}:null,status:mask&4?{mode:'apply',type:'slowed',turns:2}:null});let draws=0;
 const r=E.resolveAction(s,intent(s,m,{dc:success?10:99}),{roll:n=>{draws++;return draw(n);}}),b=r.state.actors[1];
 assert.equal(r.result.success,success);assert.equal(draws,1+(success?Number(Boolean(mask&1))+Number(Boolean(mask&2)):0));assert.equal(b.hp,success?20-(mask&1?6:0)+(mask&2?7:0):20);assert.equal(b.effects.some(e=>e.type==='slowed'),success&&Boolean(mask&4));assert.equal(r.state.actors[0].resources[0].quantity,18);assert.equal(r.state.action.freeSpent,1);assert.equal(s.actors[1].hp,20);assert.equal(r.result.custom.target,b.id);E.validateState(r.state);
});
for(const type of Object.keys(STATUS_TYPES))test('1920 apply/remove '+type+' shares status storage and leaves other conditions unchanged',()=>{
 let s=scene(),b=s.actors[1];const applied=E.resolveAction(s,intent(s,recipe({status:{mode:'apply',type,turns:3}})),{roll:draw});b=applied.state.actors[1];const list=[...b.effects,...b.tactics];assert(list.some(v=>v.type===type));if(type==='disarmed')assert.equal(b.tactics.find(v=>v.type===type).weapon,b.preferredWeapon);
 s=E.editActor(applied.state,b.id,{effects:[...b.effects,...(type==='burning'?[]:[{type:'burning',turns:4,damage:'1'}])],tactics:[...b.tactics,...(type==='rooted'?[]:[{type:'rooted',turns:4,source:s.actors[0].id}])]}).state;
 const other=[...s.actors[1].effects,...s.actors[1].tactics].filter(v=>v.type!==type),r=E.resolveAction(s,intent(s,recipe({status:{mode:'remove',type}})),{roll:draw});assert.deepEqual([...r.state.actors[1].effects,...r.state.actors[1].tactics],other);assert(r.result.custom.status.changed);E.validateState(r.state);
});
test('1920 held actor can remove Held on self; failed check leaves all statuses and costs once',()=>{
 let s=scene();s=E.editActor(s,s.actors[0].id,{tactics:[{type:'rooted',turns:3},{type:'frightened',turns:3,source:s.actors[1].id}]}).state;const m=recipe({target:'self',status:{mode:'remove',type:'rooted'}});
 const fail=E.resolveAction(s,intent(s,m,{target:undefined,dc:99}),{roll:draw});assert.deepEqual(fail.state.actors[0].tactics,s.actors[0].tactics);assert.equal(fail.state.actors[0].resources[0].quantity,18);
 const r=E.resolveAction(s,intent(s,m,{target:undefined}),{roll:draw});assert.deepEqual(r.state.actors[0].tactics.map(v=>v.type),['frightened']);assert.equal(r.state.actors[1].tactics.length,0);
 s=E.editActor(s,s.actors[0].id,{effects:[{type:'stunned',turns:3,damage:'0'}]}).state;const before=E.clone(s);assert.throws(()=>E.resolveAction(s,intent(s,m),{roll:draw}),/Betäubte/);assert.deepEqual(s,before);
});
test('1920 healing caps at maximum, wakes unconscious, never revives a dead target',()=>{
 let s=scene();const m=recipe({healing:{dice:'2d8',bonus:100}});let r=E.resolveAction(s,intent(s,m),{roll:draw});assert.equal(r.state.actors[1].hp,40);assert.equal(r.result.custom.healing.applied,20);
 s=E.editActor(s,s.actors[1].id,{hp:0,condition:'unconscious',roundsLeft:3}).state;r=E.resolveAction(s,intent(s,m),{roll:draw});assert.equal(r.state.actors[1].condition,'fit');assert.equal(r.state.actors[1].roundsLeft,null);
 s=E.editActor(s,s.actors[1].id,{hp:0,condition:'dead',roundsLeft:null}).state;assert.throws(()=>E.resolveAction(s,intent(s,m),{roll:()=>{throw Error('Must not roll');}}),/Tote/);
});
test('1920 combined HP effects settle damage then healing before knockout; remaining zero uses normal death rules',()=>{
 let s=scene({deathRounds:0});s=E.editActor(s,s.actors[1].id,{hp:2}).state;const both=recipe({damage:{dice:'1d6',bonus:0},healing:{dice:'1d8',bonus:0},status:{mode:'apply',type:'slowed',turns:2}}),r=E.resolveAction(s,intent(s,both),{roll:draw});assert.equal(r.state.actors[1].hp,4);assert.equal(r.state.actors[1].condition,'fit');assert.equal(r.result.custom.damage.applied,2);
 const killed=E.resolveAction(s,intent(s,{...both,healing:null}),{roll:draw});assert.equal(killed.state.actors[1].condition,'dead');assert(killed.result.custom.status.skipped);assert.equal(killed.state.actors[1].effects.length,0);
});
for(const mode of ['doubleDice','max','doubleMax'])test('1920 critical '+mode+' affects damage only; healing and condition have no extra success check',()=>{
 const s=scene({natural20:true,criticalDamage:mode}),m=recipe({damage:{dice:'1d6',bonus:2},healing:{dice:'1d8',bonus:1},status:{mode:'apply',type:'rooted',turns:2}});let calls=0;const r=E.resolveAction(s,intent(s,m,{dc:99}),{roll:n=>{calls++;return n===20?20:3;}});
 assert(r.result.success&&r.result.critical);assert.equal(r.result.custom.damage.raw,mode==='doubleMax'?16:8);assert.equal(r.result.custom.healing.raw,4);assert.equal(calls,mode==='doubleDice'?4:2);assert.equal(r.result.custom.status.turns,2);
});
test('1920 damage follows cover then reduction then absorb, while condition depends on the one check',()=>{
 let s=scene({shieldsEnabled:true});s=E.setBoard(s,{cover:[{x:2,y:1}]}).state;s=E.editActor(s,s.actors[1].id,{shieldProfiles:[{id:'reduce',name:'Ward',kind:'reduce',amount:1,turns:3},{id:'bubble',name:'Bubble',kind:'absorb',turns:3}],shields:[{profile:'reduce',turns:3,charges:1},{profile:'bubble',turns:3,charges:1}]}).state;
 const m=recipe({damage:{dice:'1d6',bonus:10},status:{mode:'apply',type:'slowed',turns:2}}),r=E.resolveAction(s,intent(s,m),{roll:draw});assert.equal(r.result.custom.damage.coverPercent,50);assert.equal(r.result.custom.damage.shieldReduction,1);assert(r.result.custom.damage.absorbed);assert.equal(r.state.actors[1].hp,20);assert.equal(r.state.actors[1].shields.length,1);assert(r.state.actors[1].effects.some(v=>v.type==='slowed'));
});
test('1920 duration/damage overrides apply and another condition is not extended',()=>{
 let s=scene({effectDurationOverrides:{burning:5},effectDamageOverrides:{burning:'3'}});s=E.editActor(s,s.actors[1].id,{effects:[{type:'poisoned',turns:4,damage:'1'}]}).state;const r=E.resolveAction(s,intent(s,recipe({status:{mode:'apply',type:'burning',turns:2}})),{roll:draw});assert.equal(r.state.actors[1].effects[1].turns,5);assert.equal(E.effectSpec(r.state,r.state.actors[1].effects[1]).damage,'3');assert.equal(r.state.actors[1].effects[0].turns,4);
});
test('1920 zero/decimal amounts stay whole HP and no attribute or weapon bonus is added implicitly',()=>{
 const s=scene(),r=E.resolveAction(s,intent(s,recipe({damage:{dice:'1d6-20',bonus:'1,5'},healing:{dice:'1d8',bonus:'0,5'}})),{roll:draw});assert.equal(r.result.custom.damage.raw,0);assert.equal(r.result.custom.healing.raw,4);assert.equal(r.state.actors[1].hp,24);
});
for(const patch of [
 {free:true}, {mechanics:{damage:{dice:'bad'}}}, {mechanics:{damage:{dice:'51d6'}}}, {mechanics:{healing:{dice:'1d8',bonus:true}}}, {mechanics:{status:{mode:'apply',type:'unknown'}}}, {mechanics:{status:{mode:'apply',type:'slowed',turns:0}}}, {mechanics:{target:'everyone',healing:{dice:'1d8'}}}, {mechanics:{targetId:'anything',damage:{dice:'1d6'}}}, {mechanics:[{}]}, {effectRange:1}, {effectRange:1.5}, {effectRange:-1}, {target:undefined}, {target:'missing'}
])test('1920 invalid effects/recipient/range reject atomically '+JSON.stringify(patch),()=>{
 const s=scene(),before=E.clone(s);let draws=0;assert.throws(()=>E.resolveAction(s,intent(s,recipe({damage:{dice:'1d6'}}),patch),{roll:()=>{draws++;return 20;}}));assert.equal(draws,0);assert.deepEqual(s,before);
});
test('1920 walls, reserve, hidden enemies and disabled modules reject before cost/dice; sight-disabled boards retain target state checks',()=>{
 const m=recipe({status:{mode:'apply',type:'slowed',turns:2}});for(const variant of ['wall','reserve','hidden','effects']){let s=scene();if(variant==='wall')s=E.setBoard(s,{blocked:[{x:2,y:1}]}).state;if(variant==='reserve')s=E.reserveActor(s,s.actors[1].id).state;if(variant==='hidden')s=E.editActor(s,s.actors[1].id,{hidden:{turns:3,appliedTurn:s.turnSerial}}).state;if(variant==='effects')s=E.setRules(s,{effectsEnabled:false}).state;const before=E.clone(s);assert.throws(()=>E.resolveAction(s,intent(s,m),{roll:()=>{throw Error('No draw');}}));assert.deepEqual(s,before);}
 let s=scene({boardEnabled:false});const r=E.resolveAction(s,intent(s,recipe({healing:{dice:'1d8'}}),{effectRange:0}),{roll:draw});assert.equal(r.state.actors[1].hp,24);
});
test('1920 linked ability and direct effects are alternatives; mechanical custom reactions require an explicit timing',()=>{
 let s=scene();s=E.editActor(s,s.actors[0].id,{skills:[{...skillPreset('aim'),id:'aim'}]}).state;const before=E.clone(s);assert.throws(()=>E.resolveAction(s,intent(s,recipe({damage:{dice:'1d6'}}),{effect:'aim'})));assert.deepEqual(s,before);assert.throws(()=>E.editActor(s,s.actors[0].id,{skills:[{...skillPreset('narrative'),reaction:true,mechanics:recipe({damage:{dice:'1d6'}})}]}),/Reaktionszeitpunkt/);
});
test('1920 target-dependent DC uses the target bonus, not the caster bonus',()=>{
 const s=scene(),r=E.resolveAction(s,intent(s,recipe({damage:{dice:'1d6'}}),{dcMode:'best-physical',dcAdjustment:'1,5'}),{roll:draw});assert.equal(r.result.dc,15.5);assert.equal(r.result.ability,3);assert.equal(r.result.total,18);
});
test('1920 only manual use, insufficient mana spends nothing, and a matching skill extra is paid once',()=>{
 let s=scene();const m=recipe({damage:{dice:'1d6'}});for(const source of ['basic','model'])assert.throws(()=>E.resolveAction(s,intent(s,m),{source,roll:draw}),/manuell/);
 s=E.editActor(s,s.actors[0].id,{resources:[{id:'mana',name:'Mana',kind:'ammo',quantity:1}]}).state;assert.throws(()=>E.resolveAction(s,intent(s,m),{roll:()=>{throw Error('No draw');}}));
 s=scene();s=E.editActor(s,s.actors[0].id,{bonusActions:[{id:'magic',name:'Magic extra',count:1,allowed:['skill']}]}).state;const r=E.resolveAction(s,intent(s,m),{roll:draw});assert.equal(r.state.action.freeSpent,0);assert.equal(r.state.action.bonusSpent.magic,1);assert.equal(r.state.actors[0].resources[0].quantity,18);
});
test('1920 saved custom ability, profile transfer, combat import, and Undo retain effects without storing a target ID',async()=>{
 let s=scene(),d=createCheckDrafts().get('a',s.actors[0].id);Object.assign(d,{...customDraft(recipe({damage:{dice:'1d6',bonus:2},status:{mode:'apply',type:'slowed',turns:2}}),5),description:'Frost grip',stat:'intelligence',dc:'10',resource:'mana',cost:'2',target:s.actors[1].id});const saved=narrativeFromCheck(d,'Frost grip');assert(!JSON.stringify(saved).includes(s.actors[1].id));s=E.editActor(s,s.actors[0].id,{skills:[saved]}).state;
 const profile=profileFrom(exportProfiles(s,'skills',s.actors[0].id)),patch=transferPatch(s.actors[2],profile,'append',s);assert.deepEqual(patch.skills[0].mechanics,s.actors[0].skills[0].mechanics);assert(patch.resources.some(v=>v.id===patch.skills[0].resource));E.validateState(JSON.parse(JSON.stringify(s)));
 let bundle={state:s,history:[]};const c=createController({key:()=> 'a',read:()=>bundle,write:v=>{bundle=v;},save:async()=>{}}),before=E.clone(c.state());await c.act({type:'skill',actor:s.actors[0].id,target:s.actors[1].id,skill:saved.id},{roll:draw});assert.equal(c.state().actors[1].hp,14);assert.equal(c.state().actors[1].effects[0].type,'slowed');await c.undo();assert.deepEqual(c.state().actors,before.actors);assert.equal(c.state().action.freeSpent,before.action.freeSpent);assert.deepEqual(c.state().action.bonusSpent,before.action.bonusSpent);
});
test('1920 own-check draft saves and executes the same chosen recipe and clears it for narrative or linked profile use',()=>{
 const s=scene(),a=s.actors[0],drafts=createCheckDrafts(),d=drafts.get('a',a.id);Object.assign(d,customDraft(recipe({target:'self',healing:{dice:'1d8',bonus:2},status:{mode:'remove',type:'rooted'}}),3),{description:'Release',resource:'mana',target:a.id});const i=checkIntent(s,a,d);assert.deepEqual(i.mechanics,mechanicsFrom(recipeFromDraft(d)));assert.deepEqual(narrativeFromCheck(d,'Release').mechanics,i.mechanics);
 drafts.update('a',a,{name:'check-mode',value:'narrative'},s);assert.equal(recipeFromDraft(d),null);assert.equal(checkIntent(s,a,d).mechanics,undefined);
});
for(const language of ['de','en'])test('1920 '+language+' effect editor is opt-in and preserves unshown draft values',()=>{
 const empty=customDraft(),off=customEffectMarkup(empty,language);assert(!off.includes('name="check-damageDice"'));assert(!off.includes('name="check-healingDice"'));assert(!off.includes('name="check-statusType"'));const d=customDraft(recipe({healing:{dice:'1d8',bonus:2},status:{mode:'remove',type:'frightened'}})),values=new Map([['skill-0-custom-present','1'],['skill-0-healingOn','on'],['skill-0-statusMode','remove'],['skill-0-statusType','rooted']]);const updated=readCustomDraft(values,'skill-0',d);assert.equal(updated.healingDice,'1d8');assert.equal(recipeFromDraft(updated).status.type,'rooted');assert(customEffectMarkup(d,language).includes(STATUS_TYPES.frightened[language]));
});
test('1920 linked saved custom ability uses the own check once and charges the profile once',()=>{
 let s=scene();s=E.editActor(s,s.actors[0].id,{skills:[{...skillPreset('narrative'),id:'frost',check:false,resource:'mana',cost:3,range:5,mechanics:recipe({damage:{dice:'1d6'},status:{mode:'apply',type:'slowed',turns:2}})}]}).state;let count=0;const i=intent(s,null,{effect:'frost',resource:undefined,mechanics:undefined,effectRange:undefined,dc:5}),r=E.resolveAction(s,i,{roll:n=>{count++;return draw(n);}});assert.equal(count,2);assert.equal(r.state.actors[0].resources[0].quantity,17);assert.equal(r.state.action.freeSpent,1);assert.equal(r.result.custom.damage.applied,4);assert.equal(r.result.effect,'frost');
});
test('1920 an unchecked saved custom ability rolls amounts only, while legacy narrative abilities still have no mechanical effect',()=>{
 let s=scene();s=E.editActor(s,s.actors[0].id,{skills:[{...skillPreset('narrative'),id:'pulse',check:false,mechanics:recipe({healing:{dice:'1d8'}})}, {...skillPreset('narrative'),id:'story',description:'An impossible spell',resource:'mana',cost:2}]}).state;let draws=0;let r=E.resolveAction(s,{type:'skill',actor:s.actors[0].id,target:s.actors[1].id,skill:'pulse'},{roll:n=>{draws++;return 4;}});assert.equal(draws,1);assert.equal(r.result.natural,null);assert.equal(r.state.actors[1].hp,24);
 r=E.resolveAction(s,{type:'skill',actor:s.actors[0].id,skill:'story'},{roll:draw});assert.equal(r.result.custom,null);assert(r.result.narrative);assert.deepEqual(r.state.actors.map(a=>[a.hp,a.effects,a.tactics,a.position]),s.actors.map(a=>[a.hp,a.effects,a.tactics,a.position]));assert.equal(r.state.actors[0].resources[0].quantity,18);
});
test('1920 damaging custom abilities respect protective attack locks and fear; a self cure stays possible',()=>{
 let s=scene({shieldsEnabled:true});s=E.editActor(s,s.actors[0].id,{shieldProfiles:[{id:'bubble',kind:'absorb',attackLock:true}],shields:[{profile:'bubble',turns:2,charges:1}]}).state;assert.throws(()=>E.resolveAction(s,intent(s,recipe({damage:{dice:'1d6'}})),{roll:draw}),/Schutz/);
 s=scene();s=E.editActor(s,s.actors[0].id,{tactics:[{type:'frightened',turns:3,source:s.actors[1].id}]}).state;assert.throws(()=>E.resolveAction(s,intent(s,recipe({damage:{dice:'1d6'}})),{roll:draw}),/Eingeschüchtert/);const r=E.resolveAction(s,intent(s,recipe({target:'self',status:{mode:'remove',type:'frightened'}})),{roll:draw});assert.equal(r.state.actors[0].tactics.length,0);
});
test('1920 custom effects use target-turn grace and new positive HP does not grant an extra initiative turn',()=>{
 const s=scene(),r=E.resolveAction(s,intent(s,recipe({target:'self',status:{mode:'apply',type:'slowed',turns:2}}),{target:undefined}),{roll:draw});const ended=E.endTurn(r.state).state;assert.equal(ended.actors[0].effects[0].turns,2);assert.equal(E.currentActor(ended).id,s.actors[1].id);
});
test('1920 own-effect feedback highlights the recipient rather than an optional opposed-DC context figure',()=>{
 const s=scene(),r=E.resolveAction(s,intent(s,recipe({target:'self',healing:{dice:'1d8'}})),{roll:draw}),event=r.state.log.findLast(v=>v.type==='check');assert.deepEqual(visualCues(s,r.state,[event]),[{...s.actors[0].position,kind:'heal'}]);assert(cuesForChange(s,r.state,[event]).includes('heal'));
});
