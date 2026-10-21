import test from 'node:test';import assert from 'node:assert/strict';
import * as E from '../engine.js';
import {skillPreset} from '../skills.js';import {allegianceFields,allegianceText} from '../allegiance.js';
import {statusMarkers} from '../status-ui.js';import {createController} from '../controller.js';
import {exportProfiles,profileFrom,transferPatch} from '../profiles.js';import {planBasicTurn} from '../ai.js';
import {deploymentMarkup,bindDeployment} from '../deployment-ui.js';import {skillsMarkup,readSkills} from '../skills-ui.js';
import {readFile} from 'node:fs/promises';import {combatChanged} from '../chat-events.js';
function scene({active=true,permanent=true,once=false,turns=2,servantControl='manual'}={}){
 let s=E.setRules(E.emptyState(),{skillsEnabled:true,resourcesEnabled:true,effectsEnabled:true,autoRemoveDead:true,splitMovement:true,multiActionsEnabled:true,deathRounds:3,natural20:false}).state;
 s=E.addActor(s,{name:'Caster',side:'player',position:{x:1,y:1},hp:60,maxHp:60,initiative:40,actionsPerTurn:5,stats:{charisma:18,intelligence:18},resources:[{id:'mana',kind:'ammo',name:'Mana',quantity:30,capacity:30},{id:'heal',kind:'supply',name:'Heal',heal:'5',quantity:2,range:5,targets:'allies'}],skills:[{...skillPreset('dominate','en'),id:'dominate',check:false,turns,range:5,resource:'mana',cost:2,servantControl},{...skillPreset('raise','en'),id:'raise',permanent,raiseOnce:once,reviveHp:6,range:5,resource:'mana',cost:3,turns,servantControl},{...skillPreset('revive','en'),id:'revive',reviveHp:5,range:5}]}).state;
 s=E.addActor(s,{name:'Victim',side:'enemy',control:'basic',position:{x:3,y:1},hp:12,maxHp:20,initiative:30,resources:[{id:'arrows',kind:'ammo',name:'Arrows',quantity:3,capacity:10}]}).state;
 s=E.addActor(s,{name:'Corpse',side:'enemy',control:'dm',position:{x:2,y:2},hp:0,maxHp:20,condition:'dead',initiative:20,resources:[{id:'arrows',kind:'ammo',name:'Arrows',quantity:2,capacity:10}]}).state;
 s=E.addActor(s,{name:'Foe',side:'enemy',position:{x:7,y:7},hp:60,maxHp:60,initiative:10,control:'basic'}).state;
 s.actors.forEach((a,i)=>a.id=['caster','victim','corpse','foe'][i]);return active?E.startCombat(s,false).state:s;
}
const use=(s,kind,target=kind==='dominate'?'victim':'corpse',extra={})=>({type:'skill',actor:'caster',target,skill:kind,turn:E.turnToken(s),...extra});
const changed=(s,kind,extra={})=>E.resolveAction(s,use(s,kind),extra).state;
function until(s,predicate,limit=80){for(let i=0;i<limit;i++){if(predicate(s))return s;assert.equal(s.phase,'active');s=E.endTurn(s).state;}throw Error('turn loop limit');}
test('1916 dominate changes effective side/control, preserves HP/stocks and pays once without changing initiative',()=>{
 const s=scene(),before=E.clone(s),r=E.resolveAction(s,use(s,'dominate')),b=r.state.actors[1];assert.equal(b.side,'ally');assert.equal(b.control,'manual');assert.equal(b.hp,12);assert.equal(b.resources[0].quantity,3);assert.equal(r.state.actors[0].resources[0].quantity,28);assert.deepEqual(r.state.order,s.order);assert.equal(b.turnRound,s.actors[1].turnRound);assert.deepEqual(b.allegiance,{kind:'dominate',source:'caster',originalSide:'enemy',originalControl:'basic',turns:2,appliedTurn:s.turnSerial});assert.deepEqual(s,before);
});
test('1916 domination duration counts target turns, then restores original side/control exactly once',()=>{
 let s=changed(scene(),'dominate');s=E.endTurn(s).state;assert.equal(E.currentActor(s).id,'victim');assert.equal(s.actors[1].allegiance.turns,2);s=E.endTurn(s).state;assert.equal(s.actors[1].allegiance.turns,1);s=until(s,v=>E.currentActor(v)?.id==='victim');s=E.endTurn(s).state;assert.equal(s.actors[1].side,'enemy');assert.equal(s.actors[1].control,'basic');assert.equal(s.actors[1].allegiance,null);assert.equal(s.actors[1].hp,12);assert.equal(s.log.filter(v=>v.details.binding?.kind==='dominate').length,1);
});
test('1916 domination rejects dead, unconscious, escaped, allied, hidden and already-bound targets atomically',()=>{
 for(const variant of ['dead','unconscious','escaped','allied','hidden','bound']){let s=scene();if(['dead','unconscious'].includes(variant))s=E.editActor(s,'victim',{hp:0,condition:variant,roundsLeft:variant==='unconscious'?3:null}).state;if(variant==='escaped')s=E.editActor(s,'victim',{escaped:true,position:null}).state;if(variant==='allied')s=E.editActor(s,'victim',{side:'ally'}).state;if(variant==='hidden'){s=E.setRules(s,{hideNeedsTerrain:false}).state;s=E.editActor(s,'victim',{hidden:{turns:2,appliedTurn:s.turnSerial}}).state;}if(variant==='bound')s=changed(s,'dominate');const before=E.clone(s);assert.throws(()=>E.resolveAction(s,use(s,'dominate')),variant);assert.deepEqual(s,before);}
});
test('1916 failed domination uses one check/resource/action without changing sides',()=>{
 let s=scene();s=E.editActor(s,'caster',{skills:s.actors[0].skills.map(v=>v.id==='dominate'?{...v,check:true,dc:99}:v)}).state;let rolls=0;const r=E.resolveAction(s,use(s,'dominate'),{roll:()=>{rolls++;return 2;}});assert.equal(rolls,1);assert(!r.result.success);assert.equal(r.state.actors[1].side,'enemy');assert.equal(r.state.actors[1].allegiance,null);assert.equal(r.state.actors[0].resources[0].quantity,28);assert.equal(r.state.action.freeSpent,1);
});
test('1916 domination range, sight and stock still gate the ability',()=>{
 for(const variant of ['range','wall','stock']){let s=scene();if(variant==='range')s=E.editActor(s,'caster',{skills:s.actors[0].skills.map(v=>v.id==='dominate'?{...v,range:1}:v)}).state;if(variant==='wall')s=E.setBoard(s,{blocked:[{x:2,y:1}]}).state;if(variant==='stock')s=E.editActor(s,'caster',{resources:s.actors[0].resources.map(v=>v.id==='mana'?{...v,quantity:1}:v)}).state;assert(!E.canUseSkill(s,s.actors[0],s.actors[1],s.actors[0].skills[0]));}
});
test('1916 temporary last opponent prevents premature victory until original side returns',()=>{
 let s=scene();s=E.editActor(s,'foe',{hp:0,condition:'dead'}).state;s=changed(s,'dominate');assert.equal(s.phase,'active');s=until(s,v=>v.actors[1].allegiance===null);assert.equal(s.phase,'active');assert.equal(s.actors[1].side,'enemy');assert(!s.log.some(v=>v.type==='end'));
});
test('1916 previously acted dominated target gains no duplicate turn',()=>{
 let s=scene();s=E.editActor(s,'victim',{turnRound:s.round}).state;s=changed(s,'dominate');s=E.endTurn(s).state;assert.equal(E.currentActor(s).id,'foe');assert.equal(s.actors[1].allegiance.turns,2);
});
test('1916 enemy caster turns player into enemy and restores player side after duration',()=>{
 let s=scene();s=E.editActor(s,'victim',{side:'player'}).state;s=E.editActor(s,'caster',{side:'enemy'}).state;s=changed(s,'dominate');assert.equal(s.actors[1].side,'enemy');assert.equal(s.phase,'active');s=until(s,v=>v.actors[1].allegiance===null);assert.equal(s.actors[1].side,'player');assert.equal(s.actors[1].control,'basic');
});
test('1916 healing and attacks use the effective side after domination',()=>{
 let s=scene();const item=s.actors[0].resources[1];assert(!E.canUseResource(s,s.actors[0],s.actors[1],item));s=changed(s,'dominate');assert(E.canUseResource(s,s.actors[0],s.actors[1],item));assert(!E.canAttack(s,s.actors[0],s.actors[1],'ranged'));assert(E.canAttack(s,s.actors[1],s.actors[3],'ranged'));
});
test('1916 raised servant uses remembered landing, HP, caster side and selected control while preserving its stock',()=>{
 const s=scene({servantControl:'basic'}),r=changed(s,'raise'),b=r.actors[2];assert.equal(b.hp,6);assert.deepEqual(b.position,{x:2,y:2});assert.equal(b.side,'ally');assert.equal(b.control,'basic');assert.equal(b.resources[0].quantity,2);assert.equal(b.allegiance.kind,'raise');assert.equal(b.allegiance.turns,null);assert.equal(b.joinRound,2);assert.equal(r.actors[0].resources[0].quantity,27);assert.equal(r.order.filter(v=>v==='corpse').length,1);
});
test('1916 raise joins next round and never grants a same-round extra turn',()=>{
 let s=changed(scene(),'raise');s=E.endTurn(s).state;assert.equal(E.currentActor(s).id,'victim');s=E.endTurn(s).state;assert.equal(E.currentActor(s).id,'foe');s=until(s,v=>E.currentActor(v)?.id==='corpse');assert.equal(s.round,2);assert.equal(s.actors[2].turnRound,2);
});
test('1916 finite raising expires after servant turns, restores origin and leaves a dead corpse',()=>{
 let s=changed(scene({permanent:false}),'raise');s=until(s,v=>E.currentActor(v)?.id==='corpse');assert.equal(s.actors[2].allegiance.turns,2);s=E.endTurn(s).state;assert.equal(s.actors[2].allegiance.turns,1);s=until(s,v=>E.currentActor(v)?.id==='corpse');s=E.endTurn(s).state;const b=s.actors[2];assert.equal(b.hp,0);assert.equal(b.condition,'dead');assert.equal(b.side,'enemy');assert.equal(b.control,'dm');assert.equal(b.allegiance,null);assert.equal(b.position,null);assert.deepEqual(b.lastPosition,{x:2,y:2});
});
test('1916 undead at zero HP dies immediately despite normal unconsciousness rules',()=>{
 let s=changed(scene(),'raise');s=E.editActor(s,'corpse',{hp:0}).state;assert.equal(s.actors[2].condition,'dead');assert.equal(s.actors[2].roundsLeft,null);assert.equal(s.actors[2].side,'enemy');assert.equal(s.actors[2].allegiance,null);assert.equal(s.actors[2].hp,0);
});
test('1916 explicit HP/status editor override still settles undead death before summary',()=>{
 let s=changed(scene(),'raise');s=E.editActor(s,'corpse',{hp:0,condition:'unconscious',roundsLeft:3}).state;assert.equal(s.actors[2].condition,'dead');assert.equal(s.actors[2].allegiance,null);assert.equal(s.actors[2].control,'dm');
});
test('1916 once-only raising locks after death and expiry; unrestricted profiles can raise again',()=>{
 for(const expiry of [false,true]){let s=changed(scene({once:true,permanent:!expiry,turns:1}),'raise');if(expiry){s=E.stopCombat(s).state;s=E.elapseRound(s).state;}else s=E.editActor(s,'corpse',{hp:0}).state;assert.equal(s.actors[2].raiseLocked,true);assert.throws(()=>E.resolveAction(s,use(s,'raise')));}
 let s=changed(scene({once:false}),'raise');s=E.editActor(s,'corpse',{hp:0}).state;s=changed(s,'raise');assert.equal(s.actors[2].hp,6);assert.equal(s.actors[2].raiseLocked,false);
});
test('1916 once-only raising restriction does not block ordinary resurrection',()=>{
 let s=changed(scene({once:true}),'raise');s=E.editActor(s,'corpse',{hp:0}).state;s=changed(s,'revive');assert.equal(s.actors[2].hp,5);assert.equal(s.actors[2].side,'enemy');assert.equal(s.actors[2].allegiance,null);assert.equal(s.actors[2].raiseLocked,true);
});
test('1916 no safe landing, insufficient mana, living and escaped targets cannot be raised',()=>{
 for(const variant of ['missing','stock','fit','escaped']){let s=scene();if(variant==='missing')s=E.editActor(s,'corpse',{lastPosition:null}).state;if(variant==='stock')s=E.editActor(s,'caster',{resources:s.actors[0].resources.map(v=>v.id==='mana'?{...v,quantity:2}:v)}).state;if(variant==='fit')s=E.editActor(s,'corpse',{hp:2,condition:'fit'}).state;if(variant==='escaped')s=E.editActor(s,'corpse',{escaped:true}).state;const before=E.clone(s);assert.throws(()=>E.resolveAction(s,use(s,'raise')));assert.deepEqual(s,before);}
});
test('1916 raising can choose a neighboring safe cell and rejects a pit destination',()=>{
 let s=scene();s=E.addActor(s,{name:'Blocker',side:'ally',position:{x:2,y:2}}).state;s=E.setBoard(s,{pits:[{x:3,y:2}]}).state;const choices=E.revivalDestinations(s,s.actors[0],s.actors[2],s.actors[0].skills[1]);assert(choices.length);assert.throws(()=>E.resolveAction(s,use(s,'raise','corpse',{destination:{x:3,y:2}})));const p=choices.at(-1);assert.deepEqual(E.resolveAction(s,use(s,'raise','corpse',{destination:p})).state.actors[2].position,p);
});
test('1916 timed raising as the last opponent waits for expiry before combat ends',()=>{
 let s=scene({permanent:false,turns:1});s=E.editActor(s,'victim',{hp:0,condition:'dead'}).state;s=E.editActor(s,'foe',{hp:0,condition:'dead'}).state;s.phase='active';s.order=['caster','victim','corpse','foe'];s.turn=0;s=changed(s,'raise');assert.equal(s.phase,'active');s=until(s,v=>v.actors[2].allegiance===null);assert.equal(s.actors[2].condition,'dead');assert.equal(s.phase,'ended');
});
test('1916 permanent raised opponent does not keep combat active artificially',()=>{
 let s=scene();s=E.editActor(s,'victim',{hp:0,condition:'dead'}).state;s=E.editActor(s,'foe',{hp:0,condition:'dead'}).state;s.phase='active';s.turn=0;s=changed(s,'raise');assert.equal(s.phase,'ended');assert.equal(s.actors[2].allegiance.kind,'raise');assert.equal(s.actors[2].hp,6);
});
test('1916 outside combat explicit time advances temporary bindings; permanent servants survive',()=>{
 let s=changed(changed(scene({permanent:true}),'dominate'),'raise');s=E.stopCombat(s).state;const phase=s.phase;s=E.elapseRound(s).state;assert.equal(s.actors[1].allegiance.turns,1);assert.equal(s.actors[2].allegiance.turns,null);s=E.elapseRound(s).state;assert.equal(s.actors[1].side,'enemy');assert.equal(s.actors[2].hp,6);assert.equal(s.phase,phase);
});
test('1916 reserves, unconscious targets and paused combat pause allegiance duration',()=>{
 let s=changed(scene(),'dominate');s=E.reserveActor(s,'victim').state;s=E.stopCombat(s).state;s=E.elapseRound(s).state;assert.equal(s.actors[1].allegiance.turns,2);s=E.deployActor(s,'victim',{x:3,y:1}).state;s=E.editActor(s,'victim',{hp:0,condition:'unconscious',roundsLeft:3}).state;s=E.elapseRound(s).state;assert.equal(s.actors[1].allegiance.turns,2);s=changed(scene(),'dominate');s.phase='paused';s=E.elapseRound(s).state;assert.equal(s.actors[1].allegiance.turns,2);
});
test('1916 caster death, escape or deletion does not dissolve servants or crash expiry',()=>{
 for(const variant of ['death','escape','delete']){let s=changed(scene({permanent:false,turns:1}),'raise');if(variant==='death')s=E.editActor(s,'caster',{hp:0,condition:'dead'}).state;if(variant==='escape')s=E.editActor(s,'caster',{escaped:true,position:null}).state;if(variant==='delete')s=E.removeActor(s,'caster').state;assert.equal(s.actors.find(v=>v.id==='corpse').hp,6);s=E.stopCombat(s).state;s=E.elapseRound(s).state;assert.equal(s.actors.find(v=>v.id==='corpse').condition,'dead');}
});
test('1916 death of dominated target restores its original side/control without restoring HP',()=>{
 let s=changed(scene(),'dominate');s=E.editActor(s,'victim',{hp:0,condition:'dead'}).state;assert.equal(s.actors[1].hp,0);assert.equal(s.actors[1].side,'enemy');assert.equal(s.actors[1].control,'basic');assert.equal(s.actors[1].allegiance,null);
});
test('1916 binding types cannot be stacked or stolen while active',()=>{
 let s=changed(scene(),'raise');assert.throws(()=>E.resolveAction(s,use(s,'dominate','corpse')));s=changed(scene(),'dominate');assert.throws(()=>E.resolveAction(s,use(s,'raise','victim')));
});
test('1916 model state, status badges and text expose source, effective side, duration and undead',()=>{
 const s=changed(changed(scene({permanent:false,once:true}),'dominate'),'raise');assert.match(allegianceText(s.actors[1],'en'),/Dominated.*2/);assert.match(statusMarkers(s,s.actors[2],'en'),/Undead/);assert.match(E.conditionText(s.actors[2],'de'),/Untot/);const p=E.buildPrompt(s,{compact:true,mode:'narrate'});assert.match(p,/"originalSide":"enemy"/);assert.match(p,/"source":"caster"/);assert.match(p,/"kind":"raise"/);
});
test('1916 state export/import preserves binding and lock, while fresh profiles use original allegiance',()=>{
 const s=changed(changed(scene({once:true}),'dominate'),'raise'),loaded=E.validateState(JSON.parse(JSON.stringify(s)));assert.deepEqual(loaded.actors,s.actors);for(const id of ['victim','corpse']){const p=profileFrom(exportProfiles(s,'actor',id)).actors[0];assert.equal(p.side,'enemy');assert.equal(p.allegiance,null);assert.equal(p.raiseLocked,false);}
 const p=transferPatch(s.actors[1],profileFrom(exportProfiles(s,'skills','caster')));assert.equal(p.skills.find(v=>v.kind==='raise').raiseOnce,true);assert.equal(p.skills.find(v=>v.kind==='raise').permanent,true);
});
test('1916 controller Undo restores state and companion templates contain no running binding',async()=>{
 let state={state:scene(),history:[]},saved;const c=createController({key:()=> 'a',read:()=>state,write:v=>state=v,save:async()=>{},saveTemplate:async v=>saved=v});const before=E.clone(c.state());await c.act(use(c.state(),'raise'));await c.saveTemplate('corpse');assert.equal(saved.side,'enemy');assert.equal(saved.control,'dm');assert.equal(saved.allegiance,null);assert.equal(saved.raiseLocked,false);await c.undo();assert.deepEqual(c.state().actors,before.actors);
});
test('1916 malformed binding state/profile options are rejected rather than partly imported',()=>{
 const base={kind:'dominate',source:'caster',originalSide:'enemy',originalControl:'basic',turns:2};for(const patch of [{kind:'unknown'},{turns:null},{turns:-1},{originalSide:'none'},{originalControl:'robot'},{source:''}])assert.throws(()=>allegianceFields({allegiance:{...base,...patch}}));assert.throws(()=>allegianceFields({raiseLocked:'yes'}));for(const patch of [{permanent:1},{raiseOnce:'yes'},{servantControl:'dm'}]){const s=scene();assert.throws(()=>E.editActor(s,'caster',{skills:[{...s.actors[0].skills[1],...patch}]}));}
});
test('1916 blast Friendly Fire uses sides at impact even when an undead servant dies and reverts',()=>{
 let s=changed(scene(),'raise');s=E.moveActor(s,'corpse',{x:4,y:3},true).state;s=E.moveActor(s,'victim',{x:4,y:2},true).state;s=E.editActor(s,'caster',{weaponList:[{id:'blast',name:'Blast',mode:'ranged',range:10,damage:'4d6',radius:1}],attackMode:'ranged'}).state;
 const r=E.resolveAction(s,{type:'attack',actor:'caster',target:'victim',weapon:'blast',mode:'ranged',turn:E.turnToken(s)},{roll:n=>n===20?19:6});const servant=r.result.affected.find(v=>v.id==='corpse');assert(servant.damage>=6);assert(servant.friendly);assert.equal(r.state.actors[2].side,'enemy');assert.equal(r.state.actors[2].condition,'dead');assert.equal(r.result.affected.find(v=>v.id==='victim').friendly,false);
});
test('1916 periodic damage kills undead directly and finishes binding before the next turn',()=>{
 let s=changed(scene({once:true}),'raise');s=E.editActor(s,'corpse',{effects:[{type:'burning',damage:'10',turns:2}]}).state;s=until(s,v=>E.currentActor(v)?.id==='corpse');s=E.endTurn(s).state;assert.equal(s.actors[2].condition,'dead');assert.equal(s.actors[2].side,'enemy');assert.equal(s.actors[2].allegiance,null);assert(s.actors[2].raiseLocked);
});
test('1916 Basic AI does not initiate new skills but an already raised servant plans ordinary legal actions',()=>{
 let s=scene({servantControl:'basic'});s=E.editActor(s,'caster',{control:'basic',skills:s.actors[0].skills.map(v=>({...v,ai:true}))}).state;assert(!['dominate','raise'].includes(planBasicTurn(s)?.intent?.skill));s=changed(s,'raise');s=until(s,v=>E.currentActor(v)?.id==='corpse');const p=planBasicTurn(s);assert(p);assert.equal(p.actor,'corpse');if(p.intent?.target)assert.equal(s.actors.find(v=>v.id===p.intent.target).side,'enemy');
});
test('1916 raise controls, defaults and explanatory editor text are available in both languages',()=>{
 const s=scene();for(const language of ['de','en']){const html=skillsMarkup(s.actors[0],s.actors[0].skills,language,s.rules);assert.match(html,/name="skill-1-permanent"/);assert.match(html,/name="skill-1-raiseOnce"/);assert.match(html,/name="skill-0-servantControl"/);assert.match(html,language==='en'?/dies immediately/:/direkt tot/);}
 const values=new Map([['skill-1-permanent','on'],['skill-1-raiseOnce','on'],['skill-1-servantControl','basic']]);const d={has:k=>values.has(k),get:k=>values.get(k)??null};const raw=readSkills(d,s.actors[0].skills);assert.equal(raw[1].permanent,true);assert.equal(raw[1].raiseOnce,true);assert.equal(raw[1].servantControl,'basic');assert.equal(skillPreset('dominate').turns,3);
});
test('1916 select all/none changes only eligible checkbox selection and does not submit',()=>{
 const s=scene({active:false}),before=E.clone(s),html=deploymentMarkup(s,'en');assert.match(html,/Check all/);assert.match(html,/Uncheck all/);const boxes=[{checked:true},{checked:false},{checked:true}],events={},form={elements:{},addEventListener:(k,fn)=>events[k]=fn,querySelectorAll:()=>boxes};bindDeployment({querySelector:()=>form});events.click({target:{closest:()=>({dataset:{deploymentSelect:'none'}})}});assert(boxes.every(v=>!v.checked));events.click({target:{closest:()=>({dataset:{deploymentSelect:'all'}})}});assert(boxes.every(v=>v.checked));assert.deepEqual(s,before);
});
test('1916 new test pack loads all profiles and each of four casters resolves the intended new ability',async()=>{
 const base=new URL('../examples/necromancy1916/',import.meta.url);for(const name of ['01-Necromancer-Character.json','02-Cleric-Character.json','03-Enemy-Necromancer-Character.json','04-Enchanter-Character.json','05-Enemy-Enchanter-Character.json','07-Necromancy-Abilities.json','08-Domination-Abilities.json'])assert(profileFrom(JSON.parse(await readFile(new URL(name,base),'utf8'))));
 const seed=E.validateState(JSON.parse(await readFile(new URL('06-Allegiance-Crypt-Combat.json',base),'utf8')));assert.equal(seed.actors.length,9);
 for(const [caster,target,kind,side]of [[0,1,'raise','ally'],[4,5,'raise','enemy'],[7,6,'dominate','ally'],[8,7,'dominate','enemy']]){let s=E.clone(seed);s.actors[caster].initiative=100;s=E.startCombat(s,false).state;const a=s.actors[caster],b=s.actors[target],skill=a.skills.find(v=>v.kind===kind);assert.equal(E.currentActor(s).id,a.id);const before=a.resources.find(v=>v.id==='mana').quantity,r=E.resolveAction(s,{type:'skill',actor:a.id,target:b.id,skill:skill.id,turn:E.turnToken(s)},{roll:()=>20});assert.equal(r.state.actors[target].side,side);assert.equal(r.state.actors[target].allegiance.kind,kind);assert.equal(r.state.actors[caster].resources.find(v=>v.id==='mana').quantity,before-skill.cost);}
});
test('1916 explicit out-of-combat expiry is a relevant state change even when HP stay unchanged',()=>{
 let s=changed(scene({turns:1}),'dominate');s=E.stopCombat(s).state;const r=E.elapseRound(s).state;assert.equal(r.actors[1].hp,s.actors[1].hp);assert(combatChanged(s,r));assert.equal(r.actors[1].side,'enemy');
});

