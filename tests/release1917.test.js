import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../engine.js';
import { skillPreset } from '../skills.js';
import { createController } from '../controller.js';
import { exportProfiles, profileFrom, transferPatch } from '../profiles.js';
import { planBasicTurn } from '../ai.js';
import { statusMarkers } from '../status-ui.js';
import { restoreMarkup } from '../restore-ui.js';
import { checkMarkup,createCheckDrafts,checkIntent,narrativeFromCheck } from '../checks-ui.js';
import { skillsMarkup } from '../skills-ui.js';
import { defenseMarkup } from '../defense-ui.js';
import { resolveBasicTurn } from '../ai.js';
import { readFile } from 'node:fs/promises';

function scene({active=true,rule={},reaction=false}={}) {
 let s=E.setRules(E.emptyState(),{splitMovement:true,multiActionsEnabled:true,statMode:'bonuses',natural20:false,rngMode:'seeded',seed:'release1917',movementBase:3,movementStat:'none',...rule}).state;
 s=E.addActor(s,{id:'hero',name:'Hero',side:'player',hp:20,maxHp:20,position:{x:1,y:1},initiative:30,actionsPerTurn:4,stats:{intelligence:3,dexterity:2},weaponList:[{id:'bow',name:'Bow',mode:'ranged',range:10,damage:'1d4',resource:'mana',cost:2,standard:null}],resources:[{id:'mana',name:'Mana',kind:'ammo',quantity:10,capacity:20},{id:'potion',name:'Potions',kind:'supply',quantity:2,heal:'1d4',range:1}],skills:[{...skillPreset('narrative'),id:'custom',name:'Teleportation',description:'Teleport behind the statue',stat:'intelligence',resource:'mana',cost:3,range:10,dc:12},{...skillPreset('jump'),id:'jump',resource:'mana',cost:2}]}).state;
 s=E.addActor(s,{id:'foe',name:'Foe',side:'enemy',hp:40,maxHp:40,position:{x:3,y:1},initiative:20,stats:{strength:4,dexterity:1},dc:14,...(reaction?{reactionChoices:['narrative'],reactionControl:'manual',reactionCost:'extra',resources:[{id:'ki',name:'Ki',kind:'ammo',quantity:8,capacity:8}],skills:[{...skillPreset('narrative'),id:'banish',name:'Shadow world',description:'Banish the attacker for one round',reaction:true,resource:'ki',cost:2,check:true,range:10,dc:12}]}:{})}).state;
 s=E.addActor(s,{id:'body',name:'Downed ally',side:'ally',hp:0,maxHp:10,condition:'stabilized',position:{x:1,y:2},initiative:5}).state;
 // addActor generates IDs; stable IDs simplify saved-intent assertions.
 s.actors.forEach((a,i)=>a.id=['hero','foe','body'][i]);
 return active?E.startCombat(s,false).state:s;
}
const own=(s,patch={})=>({type:'check',actor:'hero',turn:E.turnToken(s),description:'Try to escape the net',stat:'dexterity',dc:12,...patch});
const skill=(s,id,patch={})=>({type:'skill',actor:'hero',skill:id,target:'hero',turn:E.turnToken(s),...patch});
const attack=s=>({type:'attack',actor:'hero',target:'foe',weapon:'bow',turn:E.turnToken(s)});
const ten=n=>Math.min(n,10);
function controller(s){let bundle={state:s,history:[]};return createController({key:()=> 'release1917',read:()=>bundle,write:b=>bundle=b,save:async()=>{},preferences:()=>({language:'en'})});}

for(const success of [true,false])test('1917 direct own-check cost is paid once on '+(success?'success':'failure')+' and keeps the target unchanged',()=>{
 const s=scene(),before=E.clone(s);let draws=0;const r=E.resolveAction(s,own(s,{target:'foe',resource:'mana',cost:3,dc:success?5:99}),{roll:()=>{draws++;return 10;}});
 assert.equal(r.result.success,success);assert.equal(draws,1);assert.equal(r.state.rng.cursor,s.rng.cursor+1);assert.equal(r.state.actors[0].resources[0].quantity,7);assert.equal(r.state.action.freeSpent,1);assert.deepEqual(r.state.actors[1],s.actors[1]);assert.deepEqual(s,before);assert.equal(r.result.resource.cost,3);
});
for(const [mode,dc] of [['target-dc',14],['strength',14],['dexterity',11],['best-physical',14]])test('1917 own-check target defense '+mode+' uses the target current bonus/DC and adjustment',()=>{
 const s=scene(),r=E.resolveAction(s,own(s,{target:'foe',dcMode:mode,dcAdjustment:'1,5'}),{roll:ten});assert.equal(r.result.dc,dc+1.5);assert.equal(r.result.defense.mode,mode);
});
for(const patch of [{target:undefined,dcMode:'strength'},{resource:'unknown',cost:2},{resource:'mana',cost:11},{resource:'mana',cost:-1},{resource:'mana',cost:1.2},{free:true,resource:'mana',cost:2},{effect:'custom',resource:'mana'},{dcMode:'luck'}])test('1917 invalid or unaffordable own check is rejected before dice: '+JSON.stringify(patch),()=>{
 const s=scene(),before=E.clone(s);let draws=0;assert.throws(()=>E.resolveAction(s,own(s,patch),{roll:()=>{draws++;return 10;}}));assert.equal(draws,0);assert.deepEqual(s,before);
});
test('1917 direct own-check stocks obey disabled resource rules and free checks remain free',()=>{
 const s=scene({rule:{resourcesEnabled:false}}),r=E.resolveAction(s,own(s,{resource:'mana',cost:100}),{roll:ten});assert.equal(r.state.actors[0].resources[0].quantity,10);assert.equal(r.result.resource.cost,0);
 const f=E.resolveAction(s,own(s,{free:true}),{roll:ten});assert.deepEqual(f.state.action,s.action);assert.deepEqual(f.state.actors,s.actors);
});
test('1917 narrative skill spends one skill action and stock, reports the description, and applies no invented effect',()=>{
 const s=scene(),r=E.resolveAction(s,skill(s,'custom'),{roll:ten});assert(r.result.success);assert(r.result.narrative);assert.equal(r.result.description,'Teleport behind the statue');assert.deepEqual(r.state.actors.map(a=>a.position),s.actors.map(a=>a.position));assert.equal(r.state.actors[0].resources[0].quantity,7);assert.equal(r.state.action.freeSpent,1);assert.match(E.resultText(r.result,'en'),/manually/);
 assert.throws(()=>E.resolveAction(s,skill(s,'custom'),{source:'model',roll:ten}));
});
test('1917 saved custom check survives profile export/import with description, reaction toggle, defense and stock link',()=>{
 let s=scene({active:false});const d=createCheckDrafts().get('chat','hero');Object.assign(d,{description:'Escape from the web',stat:'dexterity',resource:'mana',cost:'2',dcMode:'best-physical',dcAdjustment:'1,5'});const profile=narrativeFromCheck(d,'Escape');profile.reaction=true;s=E.editActor(s,'hero',{skills:[profile]}).state;
 const raw=exportProfiles(s,'skills','hero'),p=profileFrom(raw),patch=transferPatch(s.actors[1],p);assert.equal(p.skills[0].description,d.description);assert.equal(p.skills[0].reaction,true);assert.equal(p.skills[0].dcAdjustment,1.5);assert(patch.resources.some(r=>r.id===patch.skills[0].resource));assert.equal(patch.skills[0].cost,2);assert.deepEqual(E.validateState(s),s);
});
test('1917 Basic AI does not initiate invented narrative skills or jump by accident',()=>{
 let s=scene();s=E.editActor(s,'hero',{control:'basic',skills:s.actors[0].skills.map(v=>({...v,ai:true}))}).state;const p=planBasicTurn(s);assert(!['custom','jump'].includes(p?.intent?.skill));
});

test('1917 jump crosses a downed participant with zero ordinary movement remaining, without granting extra movement',()=>{
 let s=scene();s.movement={actorId:'hero',turnSerial:s.turnSerial,spent:3};const before=E.clone(s),cells=E.jumpDestinations(s,s.actors[0],s.actors[0].skills[1]);assert(cells.some(p=>p.x===1&&p.y===3));
 const r=E.resolveAction(s,skill(s,'jump',{destination:{x:1,y:3}}),{roll:ten});assert(r.result.success);assert.deepEqual(r.state.actors[0].position,{x:1,y:3});assert.deepEqual(r.state.movement,s.movement);assert.equal(r.state.actors[0].resources[0].quantity,8);assert.deepEqual(s,before);
});
test('1917 failed jump consumes its attempt and stays at the origin',()=>{
 let s=scene();s=E.editActor(s,'hero',{skills:s.actors[0].skills.map(v=>v.id==='jump'?{...v,dc:99}:v)}).state;const r=E.resolveAction(s,skill(s,'jump'),{roll:ten});assert(!r.result.success);assert.deepEqual(r.state.actors[0].position,s.actors[0].position);assert.equal(r.state.actors[0].resources[0].quantity,8);assert.equal(r.state.action.freeSpent,1);
});
for(const variant of ['wall','pit','height','standing','occupied','held','stunned','range','extra-coordinate'])test('1917 jump rejects '+variant+' before any roll',()=>{
 let s=scene(),dest={x:1,y:3};if(variant==='wall')s=E.setBoard(s,{blocked:[{x:1,y:3}]}).state;if(variant==='pit')s=E.setBoard(s,{pits:[{x:1,y:3}]}).state;if(variant==='height')s=E.setBoard(s,{heights:[{x:1,y:3}]}).state;if(variant==='standing')s=E.editActor(s,'body',{hp:10}).state;if(variant==='occupied')s=E.moveActor(s,'foe',dest,true).state;if(variant==='held')s=E.editActor(s,'hero',{tactics:[{type:'rooted',turns:2}]}).state;if(variant==='stunned')s=E.editActor(s,'hero',{effects:[{type:'stunned',turns:2}]}).state;if(variant==='range')dest={x:1,y:4};if(variant==='extra-coordinate')dest={...dest,z:1};let draws=0;assert.throws(()=>E.resolveAction(s,skill(s,'jump',{destination:dest}),{roll:()=>{draws++;return 10;}}));assert.equal(draws,0);
});

for(const side of ['player','enemy'])test('1917 ally transit is optional and symmetric for '+side+', with occupied landings still forbidden',()=>{
 let s=E.emptyState();s=E.setBoard(s,{width:5,height:2,blocked:Array.from({length:5},(_,x)=>({x,y:1}))}).state;s=E.addActor(s,{name:'Mover',side,position:{x:0,y:0}}).state;s=E.addActor(s,{name:'Friend',side:side==='player'?'ally':'enemy',position:{x:1,y:0}}).state;const a=s.actors[0];assert(!E.reachable(s,a.position,{x:2,y:0},a.id));s=E.setRules(s,{passAllies:true}).state;assert.equal(E.pathDistances(s,a.position,a.id).get('2,0'),2);assert(E.reachable(s,a.position,{x:2,y:0},a.id));assert(!E.reachable(s,a.position,{x:1,y:0},a.id));assert.throws(()=>E.moveActor(s,a.id,{x:1,y:0}));s=E.editActor(s,s.actors[1].id,{side:side==='enemy'?'player':'enemy'}).state;assert(!E.reachable(s,a.position,{x:2,y:0},a.id));
});

for(const form of ['random','coast','bridge','hole','edge-hole','island','headland'])for(const scenery of ['open','scattered'])test('1917 cliff '+form+' / '+scenery+' is repeatable, valid, connected and independent of combat dice',()=>{
 let s=scene({active:false});s=E.setBoard(s,{width:24,height:18}).state;const opts={preset:'cliff',cliffForm:form,cliffScenery:scenery,seed:'1917-'+form},a=E.randomBoard(s,opts).state,b=E.randomBoard(s,opts).state;assert.deepEqual(a.board,b.board);assert.deepEqual(a.rng,s.rng);assert(a.board.pits.length>0);assert(a.actors.every(v=>E.canOccupy(a,v.position)));assert(E.reachable({...a,actors:[]},a.actors[0].position,a.actors[1].position,a.actors[0].id));assert.deepEqual(E.validateState(a).board,a.board);if(scenery==='open'){assert.equal(a.board.blocked.length,0);assert.equal(a.board.cover.length,0);}else assert(a.board.blocked.length+a.board.cover.length>0);
});
test('1917 cliff forms produce distinct shapes, preserve loaded cells, and accept large/rectangular/small maps',()=>{
 let s=scene({active:false});s=E.setBoard(s,{width:32,height:32}).state;const maps=['coast','bridge','hole','edge-hole','island','headland'].map(cliffForm=>E.randomBoard(s,{preset:'cliff',cliffForm,seed:'shapes'}).state);assert.equal(new Set(maps.map(v=>JSON.stringify(v.board.pits))).size,6);
 for(const [width,height]of [[2,5],[5,2],[50,50],[9,31]]){let b=E.emptyState();b=E.setBoard(b,{width,height}).state;const r=E.randomBoard(b,{preset:'cliff',seed:'size',cliffForm:'hole'}).state;assert(r.board.pits.length);E.validateState(r);}
 const saved=E.validateState(maps[0]);assert.deepEqual(saved.board.pits,maps[0].board.pits);assert.throws(()=>E.randomBoard(s,{preset:'cliff',cliffForm:'lava'}));
});

test('1917 restoration heals selected living participants and clears effects without changing stocks, gear, map or allegiance',()=>{
 let s=scene({active:false});s=E.editActor(s,'hero',{hp:3,effects:[{type:'poisoned',turns:3}],tactics:[{type:'rooted',turns:2}],raiseLocked:true}).state;const before=E.clone(s),r=E.restoreParticipants(s,{actors:['hero','body'],hp:true,effects:true});assert.equal(r.state.actors[0].hp,20);assert.match(r.state.log.at(-1).textDe,/temporäre Effekte entfernt/);assert.match(r.state.log.at(-1).textEn,/temporary effects cleared/);assert(!r.state.log.at(-1).textEn.includes('temporäre'));assert.equal(r.state.actors[2].hp,10);assert.equal(r.state.actors[2].condition,'fit');assert.equal(r.state.actors[2].roundsLeft,null);assert.deepEqual(r.state.actors[0].effects,[]);assert.deepEqual(r.state.actors[0].resources,s.actors[0].resources);assert.deepEqual(r.state.actors[0].weaponList,s.actors[0].weaponList);assert.deepEqual(r.state.board,s.board);assert.equal(r.state.actors[0].raiseLocked,true);assert.deepEqual(s,before);assert.deepEqual(r.state.actors[1],s.actors[1]);
});
test('1917 restore categories remain independent and refill touches only selected maximum stocks',()=>{
 const s=scene({active:false}),r=E.restoreParticipants(s,{actors:['hero'],refill:true,stocks:{hero:['mana','potion']}}).state;assert.equal(r.actors[0].resources[0].quantity,20);assert.equal(r.actors[0].resources[1].quantity,2);assert.deepEqual(r.actors[0].position,s.actors[0].position);assert.equal(r.actors[0].hp,s.actors[0].hp);assert.deepEqual(r.actors[0].effects,s.actors[0].effects);
 const none=E.restoreParticipants(s,{actors:['hero'],refill:true,stocks:{hero:[]}}).state;assert.deepEqual(none.actors[0].resources,s.actors[0].resources);
});
test('1917 dead restoration requires explicit inclusion and never occupies the remembered cell or erases raise locks',()=>{
 let s=scene({active:false,rule:{autoRemoveDead:true}});s=E.editActor(s,'body',{condition:'dead',hp:0,raiseLocked:true}).state;const r=E.restoreParticipants(s,{actors:['body'],hp:true,effects:true});assert.equal(r.result.skipped.length,1);assert.equal(r.state.actors[2].hp,0);const yes=E.restoreParticipants(s,{actors:['body'],hp:true,includeDead:true}).state;assert.equal(yes.actors[2].hp,10);assert.equal(yes.actors[2].position,null);assert.deepEqual(yes.actors[2].lastPosition,s.actors[2].lastPosition);assert.equal(yes.actors[2].raiseLocked,true);
});
test('1917 restoration and Undo preserve running undead bindings and do not reset normal new-combat HP/stocks',async()=>{
 let s=scene({active:false});s.actors[0].allegiance={kind:'raise',source:'foe',originalSide:'enemy',originalControl:'manual',turns:2,appliedTurn:0};s.actors[0].hp=7;s.actors[0].resources[0].quantity=1;const c=controller(s),before=E.clone(s);await c.restore({actors:['hero'],hp:true,effects:true});assert.deepEqual(c.state().actors[0].allegiance,s.actors[0].allegiance);await c.undo();assert.deepEqual(c.state().actors[0],{...before.actors[0],allegiance:{...before.actors[0].allegiance,appliedTurn:c.state().turnSerial}});const started=E.startCombat(c.state(),false).state;assert.equal(started.actors[0].hp,7);assert.equal(started.actors[0].resources[0].quantity,1);
});
for(const options of [{actors:[]},{actors:['missing'],hp:true},{actors:['hero']},{actors:['hero'],hp:1},{actors:['hero'],refill:true,stocks:{hero:['missing']}}])test('1917 invalid restoration is atomic: '+JSON.stringify(options),()=>{const s=scene({active:false}),before=E.clone(s);assert.throws(()=>E.restoreParticipants(s,options));assert.deepEqual(s,before);});
test('1917 restoration is unavailable during active/paused initiative',()=>{for(const phase of ['active','paused']){const s=scene();s.phase=phase;assert.throws(()=>E.restoreParticipants(s,{actors:['hero'],hp:true}));}});

for(const resolution of ['continue','void'])test('1917 custom reaction '+resolution+' resolves one reaction check, pays both costs once, and never invents a banishment',async()=>{
 const s=scene({reaction:true,rule:{reactionsEnabled:true}}),c=controller(s);let stages=[];const off=c.subscribeReactions(r=>{stages.push(r.stage??'choice');if(r.stage==='narrative-result'){assert.equal(r.result.resource.quantity,6);c.respondReaction({resolution});}else c.respondReaction({kind:'narrative',skill:'banish'});});let draws=0;const result=await c.act(attack(s),{roll:n=>{draws++;return Math.min(n,20);}});off();assert.deepEqual(stages,['choice','narrative-result']);assert.equal(c.state().actors[0].resources[0].quantity,8);assert.equal(c.state().actors[1].resources[0].quantity,6);assert(c.state().actors[1].reactionUsed);assert.deepEqual(c.state().actors[1].position,s.actors[1].position);assert.equal(c.state().action.freeSpent,1);assert.equal(draws,resolution==='void'?1:3);assert.equal(result.narrativeReactions.length,1);if(resolution==='void'){assert(result.voided);assert.equal(c.state().actors[1].hp,40);}else assert(!result.voided);await c.undo();assert.deepEqual(c.state().actors.map(a=>({...a,reactionTurn:0})),s.actors.map(a=>({...a,reactionTurn:0})));
});
test('1917 custom reaction follows reservation, availability, depletion and automatic-policy rules',()=>{
 let s=scene({reaction:true,rule:{reactionsEnabled:true}}),[a,b]=s.actors;assert(E.reactionOptions(s,b,a).some(v=>v.kind==='narrative'));assert.equal(E.automaticReaction(s,b,E.reactionOptions(s,b,a)).kind,'none');b.reactionCost='normal';assert.equal(E.reactionOptions(s,b,a).length,0);b.reactionReserve=true;assert(E.reactionOptions(s,b,a).length);b.resources[0].quantity=0;assert.equal(E.reactionOptions(s,b,a).length,0);
});
test('1917 closing result stage continues the committed reaction; explicit stopping voids it without hanging',async()=>{
 for(const stop of [false,true]){const s=scene({reaction:true,rule:{reactionsEnabled:true}}),c=controller(s);const off=c.subscribeReactions(r=>{if(r.stage==='narrative-result'){if(stop)c.cancelReactions();else c.respondReaction('none');}else c.respondReaction({kind:'narrative',skill:'banish'});});const r=await c.act(attack(s),{roll:ten});assert.equal(Boolean(r.voided),stop);assert.equal(c.state().actors[1].resources[0].quantity,6);assert.equal(c.pendingReaction(),null);off();}
});
test('1917 aborting before a custom reaction roll changes nothing; stale reaction previews are rejected',async()=>{
 const s=scene({reaction:true,rule:{reactionsEnabled:true}}),c=controller(s);const off=c.subscribeReactions(()=>c.cancelReactions());let draws=0;const r=await c.act(attack(s),{roll:()=>{draws++;return 10;}});assert(r.cancelled);assert.equal(draws,0);assert.deepEqual(c.state(),s);off();const draw=E.narrativeReactionPreview(s,'foe','hero','banish',{roll:ten});assert.throws(()=>E.resolveAction(s,attack(s),{reactionDecisions:{foe:{kind:'narrative',skill:'banish',resolution:'continue'}},reactionDraws:{foe:{...draw,turn:'old'}}}));
});
for(const language of ['de','en'])test('1917 '+language+' life badges, narrative/jump editors, direct check costs and restore options are clear',()=>{
 const s=scene({active:false}),dead={...s.actors[2],condition:'dead'},d=createCheckDrafts().get('test','hero');assert.match(statusMarkers(s,dead,language,true),language==='en'?/Dead/:/Tot/);assert(!statusMarkers(s,{...s.actors[0],allegiance:{kind:'raise',turns:null}},language).includes('ct-effect-dead'));
 const check=checkMarkup(s,s.actors[0],d,language);assert.match(check,/name="check-resource"/);assert.match(check,/name="check-dcMode"/);assert.match(check,/save-check-ability/);const restore=restoreMarkup(s,language);assert.match(restore,/name="restoreRefill"/);assert(!/name="restoreRefill" checked/.test(restore));assert.match(restore,/restoreActor/);const skills=skillsMarkup(s.actors[0],s.actors[0].skills,language,s.rules);assert.match(skills,/name="skill-0-description"/);assert.match(skills,/name="skill-0-reaction"/);assert.match(defenseMarkup(s.actors[0],language),/name="reaction-narrative"/);
});

test('1917 failed narrative reaction still pays once and continues without any invented effect',async()=>{
 const s=scene({reaction:true,rule:{reactionsEnabled:true}}),c=controller(s);let draws=0;const off=c.subscribeReactions(r=>{if(r.stage==='narrative-result'){assert.equal(r.result.success,false);c.respondReaction({resolution:'continue'});}else c.respondReaction({kind:'narrative',skill:'banish'});});const r=await c.act(attack(s),{roll:()=>{draws++;return 1;}});off();assert.equal(draws,2);assert(!r.voided);assert.equal(c.state().actors[1].resources[0].quantity,6);assert.equal(c.state().actors[0].resources[0].quantity,8);assert.deepEqual(c.state().actors[0].position,s.actors[0].position);
});
test('1917 an area attack void stops asking further reactions without spending their stocks',async()=>{
 let s=scene({reaction:true,rule:{reactionsEnabled:true,friendlyFireArea:true}});s=E.editActor(s,'hero',{weaponList:s.actors[0].weaponList.map(w=>({...w,radius:1}))}).state;s=E.addActor(s,{...s.actors[1],name:'Second defender',position:{x:4,y:1}}).state;const last=s.actors.at(-1),c=controller(s),asked=[];const off=c.subscribeReactions(r=>{asked.push(r.actor);c.respondReaction(r.stage==='narrative-result'?{resolution:'void'}:{kind:'narrative',skill:'banish'});});const r=await c.act(attack(s),{roll:ten});off();assert(r.voided);assert(asked.every(id=>id==='foe'));assert.equal(c.state().actors.find(a=>a.id===last.id).resources[0].quantity,8);assert.equal(c.state().actors.find(a=>a.id===last.id).reactionUsed,false);
});
test('1917 a reserved narrative reaction spends its reserve once and cannot react again',()=>{
 const s=scene({reaction:true,rule:{reactionsEnabled:true}});s.actors[1].reactionCost='normal';s.actors[1].reactionReserve=true;const r=E.resolveAction(s,attack(s),{reactionDecisions:{foe:{kind:'narrative',skill:'banish',resolution:'void'}},roll:ten});assert.equal(r.state.actors[1].reactionReserve,false);assert.equal(r.state.actors[1].reactionUsed,true);assert.equal(E.reactionOptions(r.state,r.state.actors[1],r.state.actors[0]).length,0);
});
test('1917 Basic AI can traverse a friendly blocker but never ends on the occupied field',()=>{
 let s=E.setRules(E.emptyState(),{passAllies:true,splitMovement:true,movementBase:3,movementStat:'none',natural20:false}).state;s=E.setBoard(s,{width:5,height:2,blocked:Array.from({length:5},(_,x)=>({x,y:1}))}).state;s=E.addActor(s,{name:'Mover',side:'player',control:'basic',weaponList:[{name:'Club',mode:'melee',damage:'1d4'}],position:{x:0,y:0},initiative:20}).state;s=E.addActor(s,{name:'Friend',side:'ally',position:{x:1,y:0},initiative:1}).state;s=E.addActor(s,{name:'Foe',side:'enemy',position:{x:4,y:0},initiative:10}).state;s=E.startCombat(s,false).state;const r=resolveBasicTurn(s,{roll:ten});assert.equal(r.state.actors[0].position.x,3);assert.equal(new Set(r.state.actors.filter(a=>a.position).map(a=>a.position.x+','+a.position.y)).size,3);E.validateState(r.state);
});
test('1917 target-based custom narrative skills require explicit context even when self is a legal target',()=>{
 let s=scene();s=E.editActor(s,'hero',{skills:s.actors[0].skills.map(v=>v.id==='custom'?{...v,dcMode:'target-dc'}:v)}).state;let draws=0;assert.throws(()=>E.resolveAction(s,{...skill(s,'custom'),target:undefined},{roll:()=>{draws++;return 10;}}));assert.equal(draws,0);assert(E.resolveAction(s,skill(s,'custom',{target:'foe'}),{roll:()=>20}).result.success);
});
test('1917 public deployment rejects a dead participant under automatic corpse removal, preserving last position',()=>{
 let s=scene({active:false,rule:{autoRemoveDead:true}});s=E.editActor(s,'body',{hp:0,condition:'dead'}).state;const before=E.clone(s);assert.throws(()=>E.deployActor(s,'body',{x:6,y:6}),/Tot/);assert.deepEqual(s,before);
});
test('1917 packaged feature scenario, all skill profiles and both map examples load through public import validation',async()=>{
 const base=new URL('../examples/features1917/',import.meta.url),load=async name=>JSON.parse(await readFile(new URL(name,base),'utf8'));
 const s=E.validateState(await load('01-Testkampf-1.9.17.json'));assert.equal(s.actors.length,6);assert(s.actors[0].skills.some(v=>v.reaction));assert(s.actors[1].skills.some(v=>v.kind==='jump'));assert(s.actors.find(v=>v.condition==='dead').lastPosition);
 for(const name of ['02-Eigene-Faehigkeiten.json','03-Befreiungsversuch.json','04-Akrobatiksprung.json']){const p=profileFrom(await load(name));assert(p.skills.length);assert(p.resources.length);}
 const {mapFrom}=await import('../maps.js');for(const name of ['05-Klippenkarte-Zentraler-Abgrund.json','06-Klippenkarte-Felszunge.json']){const map=mapFrom(await load(name));assert(map.board.pits.length>0);assert(map.board.blocked.length+map.board.cover.length>0);}
});
