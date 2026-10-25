import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createUI } from '../ui.js';
import { createUIEnglish } from '../ui.en.js';
import { createController } from '../controller.js';
import * as E from '../engine.js';
import { EFFECTS, resourcePreset } from '../effects.js';
import { createModelRequests } from '../model-requests.js';
import { abilityGroups, skillPreset, acrobaticsPresets } from '../skills.js';
import { readFile } from 'node:fs/promises';
import { modelEventCount } from '../model-context.js';
import { latestResult } from '../results.js';

for(const language of ['de','en'])test('1922 '+language+' fog hides names across board/roster, GM reveals only UI, discovery and unseen AI turn work',async()=>{
 const f=fixture(language);await f.c.board({width:15,height:10,blocked:[],cover:[],heights:[],ladders:[],pits:[]});const hero=f.c.state().actors.find(a=>a.side==='player'),enemy=f.c.state().actors.find(a=>a.side==='enemy');
 for(const a of f.c.state().actors)await f.c.edit(a.id,{position:null});
 for(const [i,a] of f.c.state().actors.entries())await f.c.edit(a.id,{position:a.side==='enemy'?{x:12,y:7+i%3}:a.id===hero.id?{x:1,y:1}:{x:2,y:1},initiative:a.id===hero.id?100:a.id===enemy.id?90:1,control:a.id===enemy.id?'basic':'manual'});
 await f.c.rules({visionEnabled:true,visionBase:2,visionPerception:false,hideUnseenEnemies:true});await f.c.start(false);assert(!f.ui.root.innerHTML.includes(enemy.name));await f.click('tab-actors');assert(!f.ui.root.innerHTML.includes(enemy.name));await f.click('tab-board');
 const before=E.clone(f.c.state());await f.ui.root.emit('change',{target:{name:'override',checked:true}});assert(f.ui.root.innerHTML.includes(enemy.name));assert.deepEqual(f.c.state(),before);assert(!E.buildPrompt(f.c.state(),{compact:true}).includes(enemy.name));await f.ui.root.emit('change',{target:{name:'override',checked:false}});assert(!f.ui.root.innerHTML.includes(enemy.name));
 await f.c.move(hero.id,{x:11,y:7},true);assert(f.ui.root.innerHTML.includes(enemy.name));await f.c.undo();assert(!f.ui.root.innerHTML.includes(enemy.name));await f.c.endTurn();assert(f.ui.root.innerHTML.includes(language==='en'?'Unseen enemy turn':'Unentdeckter Gegner am Zug'));assert(!f.ui.root.innerHTML.includes(enemy.name));const running=f.c.aiRunning;f.c.aiRunning=()=>true;f.c.refresh();assert(f.ui.root.innerHTML.includes('data-action="stop-ai"'));f.c.aiRunning=running;await f.click('ai-step');assert(!f.ui.root.innerHTML.includes(enemy.name));f.ui.destroy();
});

for(const language of ['de','en']){
 test('beta2hf3 '+language+' reaction badge distinguishes global off, participant off and unavailable reasons',async()=>{
  const f=fixture(language),a=f.c.state().actors[0];await f.c.rules({boardEnabled:false,reactionsEnabled:true,reactionsPerTurn:2});await f.c.edit(a.id,{reactionsPerTurn:null,reactionControl:'manual',reactionChoices:['block']});await f.c.start(false);
  let html=f.ui.root.innerHTML;assert.match(html,/<small class="ct-reaction-count">2 \/ 2<\/small>/);assert(!html.includes('&lt;small class=&quot;ct-reaction-count'));
  await f.c.edit(a.id,{reactionSpent:2});html=f.ui.root.innerHTML;assert.match(html,/<span class="ct-reactions-unavailable" data-reaction-state="spent"[^>]+>[^<]+0 \/ 2<\/span>/);assert(!html.includes('class="ct-reactions-off"'));
  await f.c.edit(a.id,{reactionControl:'off'});html=f.ui.root.innerHTML;assert.match(html,/<span class="ct-reactions-off" data-reaction-state="participant-off"/);assert(html.includes(language==='en'?'Off for this participant':'Für diese Figur aus'));
  await f.c.edit(a.id,{reactionsPerTurn:0});html=f.ui.root.innerHTML;assert.match(html,/<span class="ct-reactions-unavailable" data-reaction-state="none"/);assert(!html.includes('class="ct-reactions-off"'));assert(html.includes(language==='en'?'0 reactions configured':'0 Reaktionen pro eigenem Zug'));
  await f.c.rules({reactionsEnabled:false});html=f.ui.root.innerHTML;assert.match(html,/<span class="ct-reactions-off" data-reaction-state="global-off"/);assert(html.includes(language==='en'?'Global off':'Global aus'));assert(html.includes(language==='en'?'Reactions disabled under Rules':'Reaktionen unter Regeln ausgeschaltet'));
  await f.c.rules({reactionsEnabled:true});await f.c.edit(a.id,{reactionsPerTurn:null,reactionControl:'manual',reactionSpent:0,reactionUsed:false,reactionChoices:[]});assert(f.ui.root.innerHTML.includes('data-reaction-state="no-options"'));
  await f.c.edit(a.id,{reactionChoices:['block'],reactionCost:'normal',reactionReserved:0,reactionReserve:false});assert(f.ui.root.innerHTML.includes('data-reaction-state="unreserved"'));
  await f.c.edit(a.id,{reactionReserved:1,reactionReserve:true});assert.match(f.ui.root.innerHTML,/<small class="ct-reaction-count">2 \/ 2<\/small>/);
  const before=E.clone(f.c.state()),history=f.c.historyLength();f.c.refresh();assert.deepEqual(f.c.state(),before);assert.equal(f.c.historyLength(),history);assert(!f.ui.root.innerHTML.includes('&lt;span class=&quot;ct-reactions-'));f.ui.destroy();
 });
 test('1921hf1 '+language+' reserve folds across redraws and dead filter retains downed actors and revivals',async()=>{
  const preferences={language,contextOnClick:true},f=fixture(language,{preferences:patch=>{if(patch)Object.assign(preferences,patch);return {...preferences};}}),[a,b]=f.c.state().actors;
  await f.c.rules({autoRemoveDead:true});await f.c.edit(b.id,{hp:0,condition:'dead'});await f.c.add({name:'Downed visible',side:'ally',hp:0,maxHp:10,condition:'stabilized'});
  const before=E.clone(f.c.state()),section=()=>f.ui.root.innerHTML.match(/<details class="ct-reserve-zone"[^>]*>/)?.[0];assert(section().includes('open'));await f.click('reserve-toggle');assert(!section().includes(' open'));assert(section().includes('data-reserve-drop'));f.c.refresh();assert(!section().includes(' open'));
  await f.ui.root.emit('change',{target:{name:'hideDeadParticipants',checked:true}});const roster=()=>f.ui.root.innerHTML.split('class="ct-board-roster"')[1].split('<aside class="ct-sidebar">')[0];assert(!roster().includes('data-id="'+b.id+'"'));assert(roster().includes('Downed visible'));assert.deepEqual(f.c.state(),before);
  await f.c.edit(b.id,{hp:10});assert(roster().includes('data-id="'+b.id+'"'));assert(!section().includes(' open'));await f.click('reserve-toggle');assert(section().includes(' open'));f.ui.destroy();
 });
 test('1921hf1 '+language+' free dice work before combat, survive redraw, and have no ability notification',async()=>{
  const f=fixture(language),before=E.clone(f.c.state());await f.click('free-dice');await f.ui.root.emit('click',{target:{closest:()=>({dataset:{action:'free-roll',sides:'20'},disabled:false})}});const result=f.c.state().log.at(-1).details;assert.equal(result.type,'free-roll');assert(result.value>=1&&result.value<=20);assert(f.ui.root.innerHTML.includes('ct-free-dice-result'));assert(f.ui.root.innerHTML.includes(' → '+result.value));f.c.refresh();assert(f.ui.root.innerHTML.includes('ct-free-dice-result'));assert.deepEqual(f.c.state().actors,before.actors);assert.deepEqual(f.c.state().action,before.action);assert.equal(feedbackBar(f.ui.root.innerHTML),'');f.ui.destroy();
 });
}

const carrySeed=()=>readFile(new URL('../examples/features1919/01-Testkampf-1.9.19.json',import.meta.url),'utf8').then(JSON.parse);
for(const language of ['de','en'])test('1923 '+language+' random opponent dialog draws hidden library copies and preserves its source',async()=>{
 const template=E.actorFrom({id:'pool-template',name:'Secret selected copy',side:'enemy',control:'basic'},true),library=[{...template,templateStatMode:'scores'}],f=fixture(language,{library:()=>library});await f.c.rules({visionEnabled:true,hideUnseenEnemies:true,visionBase:1});const before=E.clone(f.c.state()),oldCreate=document.createElement;
 document.createElement=type=>{const node=oldCreate(type),query=node.querySelector.bind(node);node.querySelector=q=>{const form=query(q);if(q==='form'&&form){form.elements.encounterSource??={value:'library'};form.elements.encounterRepeats??={checked:false};}return form;};return node;};
 await f.click('random-encounter');const d=f.editor(),form=d.querySelector('form');assert(d.innerHTML.includes(language==='en'?'Opponent pool':'Gegnerpool'));assert(d.querySelector('[data-encounter-pool]').innerHTML.includes(template.name));Object.assign(form.elements,{encounterMin:{value:'2'},encounterMax:{value:'2'},encounterRepeats:{checked:true},encounterControl:{value:'basic'},encounterFormation:{value:'spread'},encounterHidden:{checked:true},encounterSeed:{value:'dialog-test'}});globalThis.FormData=class{getAll(){return [template.id];}};await submit(d);assert.equal(f.c.state().actors.length,before.actors.length+2);assert(!f.ui.root.innerHTML.includes(template.name));assert.equal(library.length,1);assert.equal(library[0].position,null);assert.deepEqual(f.c.state().rng,before.rng);await f.c.undo();assert.deepEqual(f.c.state().actors,before.actors);f.ui.destroy();
});
for(const language of ['de','en']){
 test('1923 '+language+' sight toggle draws a separate wall-limited border and survives redraw without combat changes',async()=>{
  const prefs={language,showVision:false},f=fixture(language,{preferences:patch=>patch?Object.assign(prefs,patch):prefs});const hero=f.c.state().actors[0];await f.c.rules({visionEnabled:true,visionBase:3});await f.click('select',hero.id);assert(f.ui.root.innerHTML.includes('name="showVision"'));assert(!f.ui.root.innerHTML.includes('class="ct-vision-edge '));const before=E.clone(f.c.state());await f.ui.root.emit('change',{target:{name:'showVision',checked:true}});assert(f.ui.root.innerHTML.includes('class="ct-vision-edge '));assert(f.ui.root.innerHTML.includes(language==='en'?'Show vision (purple)':'Sichtbereich anzeigen (violett)'));f.c.refresh();assert(f.ui.root.innerHTML.includes('class="ct-vision-edge '));assert.deepEqual(f.c.state(),before);await f.c.rules({visionEnabled:false});assert(!f.ui.root.innerHTML.includes('class="ct-vision-edge '));f.ui.destroy();
 });
 test('1923 '+language+' masked AI turns expose series start/stop with neutral progress and stop at manual actor',async()=>{
  const prefs={language},f=fixture(language,{preferences:()=>prefs});let s=E.emptyState();s=E.setBoard(s,{width:20,height:10}).state;s=E.setRules(s,{visionEnabled:true,hideUnseenEnemies:true,visionBase:1,splitMovement:true}).state;
  for(const [id,side,initiative,x]of [['secret-a','enemy',40,16],['secret-b','enemy',30,18],['hero','player',10,1]]){s.actors.push(E.actorFrom({id,name:id,side,control:side==='enemy'?'basic':'manual',initiative,hp:50,maxHp:50,position:{x,y:1}},true));}f.chats.a.state=s;await f.c.start(false);f.c.refresh();assert(f.ui.root.innerHTML.includes('data-action="ai-run"'));assert(!f.ui.root.innerHTML.includes('secret-a'));assert(!f.ui.root.innerHTML.includes('AI turns completed'));await f.click('ai-run');assert.equal(E.currentActor(f.c.state()).id,'hero');assert(!f.ui.root.innerHTML.includes('secret-b'));assert(!f.ui.root.innerHTML.includes('2 / 20'));assert(!f.ui.root.innerHTML.includes('2 KI-Züge abgeschlossen'));f.ui.destroy();
 });
 test('1923 '+language+' appearance editor applies symbols/textures only on save and restores with Undo',async()=>{
  const f=fixture(language),before=E.clone(f.c.state());await f.click('terrain-appearance');const d=f.editor();assert(d.innerHTML.includes(language==='en'?'Terrain appearance':'Gelände darstellen'));const form=d.querySelector('form');Object.assign(form.elements,{wallSymbol:{value:'tree'},coverSymbol:{value:'rock'},terrainTextures:{checked:true},terrainStyle:{value:'stone'}});assert.deepEqual(f.c.state(),before);await submit(d);assert.equal(f.c.state().board.appearance.wall,'tree');assert(f.ui.root.innerHTML.includes('ct-terrain-texture'));assert.deepEqual(f.c.state().actors,before.actors);await f.c.undo();assert.deepEqual(f.c.state().board,before.board);f.ui.destroy();
 });
 test('1923 '+language+' rules file preview requires reviewed valid input and applies only on submit',async()=>{
  const f=fixture(language);await f.click('rules-transfer');const d=f.editor(),before=E.clone(f.c.state());const file={kind:'combat-rules',version:1,rules:{...E.clone(before.rules),visionBase:6}};delete file.rules.language;const input=d.querySelector('[data-rules-file]');await input.emit('change',{target:{files:[{size:2000,text:async()=>JSON.stringify(file)}]}});assert(d.querySelector('[data-rules-preview]').innerHTML.includes(language==='en'?'Base vision':'Grundsichtweite'));assert.deepEqual(f.c.state(),before);await submit(d);assert.equal(f.c.state().rules.visionBase,6);assert.deepEqual(f.c.state().actors,before.actors);f.ui.destroy();
 });
 test('1923 '+language+' custom sound editor exposes all cue uploads and saves empty defaults without a combat action',async()=>{
  const prefs={language,soundVolume:35},f=fixture(language,{preferences:patch=>patch?Object.assign(prefs,patch):prefs}),before=E.clone(f.c.state());await f.click('sound-files');const d=f.editor();for(const cue of ['hit','miss','heal','turn','effect']){assert(d.innerHTML.includes('data-sound-file="'+cue+'"'));d.querySelector('form').elements['mute-'+cue]={checked:cue==='hit'};}await submit(d);assert.deepEqual(prefs.soundMuted,['hit']);assert.deepEqual(prefs.soundFiles,{});assert.deepEqual(f.c.state(),before);f.ui.destroy();
 });
}
const feedbackBar=html=>html.match(/<p class="ct-board-notice ct-ability-feedback[\s\S]*?<\/p>/)?.[0]??'';
for(const language of ['de','en'])test('hotfix8 '+language+' terrain palette can fold only with all tools inactive and never changes combat state',async()=>{
 const f=fixture(language),palette=()=>f.ui.root.innerHTML.match(/<details class="ct-fold ct-terrain-palette"[^>]*>/)?.[0],before=E.clone(f.c.state());assert(!palette().includes('open'));await f.click('terrain-toggle');assert(palette().includes('open'));await f.click('terrain-toggle');assert(!palette().includes('open'));
 for(const tool of ['block-mode','cover-mode','pit-mode','height-mode','ladder-mode','erase-mode']){await f.click(tool);assert(palette().includes('open'));await f.click('terrain-toggle');assert(palette().includes('open'));assert(f.ui.root.innerHTML.includes('aria-disabled="true"'));await f.click(tool);assert(!palette().includes('open'));}assert.deepEqual(f.c.state(),before);f.ui.destroy();
});
for(const language of ['de','en'])test('hotfix8 '+language+' mechanical reaction editor requires timing and automatically enables permission',async()=>{
 const f=fixture(language),a=f.c.state().actors[0],skill={...skillPreset('narrative'),id:'cleanse',name:'Cleanse',range:0,check:false,mechanics:{target:'self',status:{mode:'remove',type:'burning'}}};await f.c.edit(a.id,{skills:[skill],reactionChoices:[]});await f.click('skills',a.id);const d=f.editor(),values=reactionFormValues(new Map(),skill);values.set('skill-0-reactionTiming','');globalThis.FormData=class{constructor(){return values;}};let message=await submit(d);assert.match(message,/Vorher|Before/);assert(!f.c.state().actors[0].skills[0].reaction);values.set('skill-0-reactionTiming','after');await submit(d);assert(d.removed);const saved=f.c.state().actors[0];assert(saved.skills[0].reaction);assert.equal(saved.skills[0].reactionTiming,'after');assert.deepEqual(saved.reactionChoices,['narrative']);f.ui.destroy();
});
for(const language of ['de','en'])test('hotfix7 '+language+' alternating skills and weapon outcomes all stay beneath board without a generic top notice',async()=>{
 const f=fixture(language),[a,,b]=f.c.state().actors;await f.c.rules({splitMovement:true,multiActionsEnabled:true,movementBase:5,movementStat:'none',natural20:true});await f.c.board({blocked:[],cover:[],heights:[],ladders:[],pits:[]});await f.c.move(a.id,{x:1,y:1},true);await f.c.move(b.id,{x:2,y:1},true);await f.c.edit(a.id,{actionsPerTurn:6,attackBonus:100,weaponList:[{id:'blade',name:'Sword',mode:'melee',damage:'1d4'}],preferredWeapon:'blade',attackMode:'melee',skills:[{...skillPreset('aim'),id:'aim',check:true,dc:5}]});await f.c.start(false);
 const actual=f.c.act.bind(f.c);let natural=15,draws=0;f.c.act=(i,o)=>actual(i,{...o,roll:n=>{draws++;return n===20?natural:2;}});
 for(const [action,value,label]of [['use-skill',15,language==='en'?'Ability succeeded':'Fähigkeit erfolgreich'],['attack',1,language==='en'?'Critical failure':'Kritischer Misserfolg'],['attack',15,language==='en'?'Hit':'Treffer'],['use-skill',1,language==='en'?'Critical failure':'Kritischer Misserfolg']]){
  natural=value;if(action==='use-skill')await f.ui.root.emit('change',{target:{name:'otherKind',value:'skill'}});await f.click(action);const html=f.ui.root.innerHTML,bar=feedbackBar(html);assert(bar,action);assert(bar.includes(label),label);assert(bar.includes(value===1?'ct-error ct-failure':'ct-success'));assert(!html.includes('class="ct-notice '));assert(html.indexOf(bar)>html.indexOf('data-board-feedback'));assert(html.indexOf(bar)<html.indexOf('class="ct-legend"'));assert.equal((html.match(/ct-board-notice ct-ability-feedback/g)??[]).length,1);
 }
 assert.equal(f.c.state().action.freeSpent,4);assert.equal(draws,5);const before=E.clone(f.c.state());await f.click('dismiss-board');assert(!feedbackBar(f.ui.root.innerHTML));assert.deepEqual(f.c.state(),before);await f.c.move(b.id,{x:8,y:8},true);const invalid=E.clone(f.c.state());await f.click('attack');assert.deepEqual(f.c.state(),invalid);assert(!f.ui.root.innerHTML.includes('class="ct-notice '));const error=f.ui.root.innerHTML.match(/<p class="ct-board-notice ct-error"[\s\S]*?<\/p>/)?.[0];assert(error);assert(f.ui.root.innerHTML.indexOf(error)>f.ui.root.innerHTML.indexOf('data-board-feedback'));await f.click('end-turn');assert(!f.ui.root.innerHTML.includes('class="ct-notice '));assert(f.ui.root.innerHTML.includes(language==='en'?'Turn ended.':'Zug beendet.'));f.ui.destroy();
});
for(const language of ['de','en'])test('hotfix7 '+language+' Basic AI weapon result also receives the board feedback',async()=>{
 const f=fixture(language),[a,,b]=f.c.state().actors;await f.c.rules({splitMovement:true});await f.c.board({blocked:[],cover:[],heights:[],ladders:[],pits:[]});await f.c.move(a.id,{x:1,y:1},true);await f.c.move(b.id,{x:2,y:1},true);await f.c.edit(a.id,{control:'basic',attackBonus:100,weaponList:[{id:'blade',name:'Sword',mode:'melee',damage:'1d4'}],attackMode:'melee'});await f.c.start(false);await f.c.aiStep({roll:n=>n===20?15:2});const html=f.ui.root.innerHTML,bar=feedbackBar(html);assert(bar);assert(bar.includes(language==='en'?'Hit':'Treffer'));assert(!html.includes('class="ct-notice '));assert(html.indexOf(bar)>html.indexOf('data-board-feedback'));f.ui.destroy();
});
for(const language of ['de','en'])for(const free of [false,true])for(const success of [false,true])test('1920 hotfix4 '+language+' plain own check under the board: free='+free+', success='+success,async()=>{
 const f=fixture(language),a=f.c.state().actors[0];await f.c.rules({splitMovement:true,multiActionsEnabled:true});await f.c.edit(a.id,{actionsPerTurn:3,resources:[{id:'mana',name:'Mana',kind:'ammo',quantity:5}]});await f.c.start(false);await f.ui.root.emit('change',{target:{name:'otherKind',value:'check'}});
 const input=(name,value)=>f.ui.root.emit('change',{target:{name:'check-'+name,value}});await input('description','A <personal> check');if(free)await input('mode','narrative');else{await input('resource','mana');await input('cost','2');}const before=E.clone(f.c.state()),actual=f.c.act.bind(f.c);let draws=0;f.c.act=(i,o)=>actual(i,{...o,roll:()=>{draws++;return success?20:1;}});await f.click('resolve-check');
 const html=f.ui.root.innerHTML,bar=feedbackBar(html);assert(bar);assert(bar.includes(success?(language==='en'?'Own check succeeded':'Eigene Probe erfolgreich'):(language==='en'?'Own check failed':'Eigene Probe fehlgeschlagen')));assert(bar.includes(success?'ct-success':'ct-error ct-failure'));assert(bar.includes('A &lt;personal&gt; check'));assert(!bar.includes('DC'));assert(!html.includes('class="ct-notice '));assert.equal((html.match(/ct-board-notice ct-ability-feedback/g)??[]).length,1);assert(html.indexOf(bar)>html.indexOf('class="ct-board-options"'));assert(html.indexOf(bar)<html.indexOf('class="ct-legend"'));assert.equal(draws,1);
 assert.equal(f.c.state().action.freeSpent,before.action.freeSpent+(free?0:1));assert.equal(f.c.state().actors[0].resources[0].quantity,free?5:3);const after=E.clone(f.c.state());await f.click('dismiss-board');assert(!feedbackBar(f.ui.root.innerHTML));assert.deepEqual(f.c.state(),after);await f.c.undo();assert(!feedbackBar(f.ui.root.innerHTML));f.ui.destroy();
});
function reactionFormValues(values,skill,enabled=true){for(const[k,v]of Object.entries({name:skill.name,description:skill.description??skill.name,stat:skill.stat??'intelligence',range:skill.range??100,dc:skill.dc??10,dcMode:skill.dcMode??'fixed',dcAdjustment:skill.dcAdjustment??0,bonus:skill.bonus??0,turns:skill.turns??1,resource:skill.resource??'',cost:skill.cost??1}))values.set('skill-0-'+k,String(v));if(enabled)values.set('skill-0-reaction','on');else values.delete('skill-0-reaction');if(skill.check)values.set('skill-0-check','on');return values;}
test('1920 hotfix4 a new participant receives the custom-reaction permission when its first ability is offered',async()=>{
 const f=fixture('en'),template=f.c.state().actors[0];await f.click('add');const d=f.editor(),values=actorForm(template);values.set('name','New reactor');const host=d.querySelector('[data-actor-skills]');await host.emit('click',{target:{closest:()=>({dataset:{skillAdd:'narrative'}})}});reactionFormValues(values,{name:'Improvised defense',description:'Manual defense',stat:'intelligence',range:10,dc:5,check:true});assert.equal(await submit(d),undefined);const a=f.c.state().actors.find(a=>a.name==='New reactor');assert(a);assert(a.skills[0].reaction);assert.deepEqual(a.reactionChoices,['narrative']);assert.equal(a.reactionControl,'inherit');assert.equal(a.reactionCost,'extra');assert.equal(f.c.state().rules.reactionsEnabled,false);f.ui.destroy();
});
for(const language of ['de','en']){
 test('1920 hotfix4 '+language+' offering a custom reaction in Abilities also enables permission and opens the incoming-attack dialog',async()=>{
  const f=fixture(language),[a,,b]=f.c.state().actors;await f.c.rules({reactionsEnabled:true,splitMovement:true});await f.c.board({blocked:[],cover:[],heights:[],ladders:[],pits:[]});await f.c.edit(a.id,{initiative:100,weaponList:[{id:'bow',name:'Bow',mode:'ranged',range:100,damage:'1d4'}],attackMode:'ranged'});const custom={...skillPreset('narrative',language),id:'personal',name:'Personal reaction',description:'A narrative defense',range:100,check:true,dc:5,resource:'mana',cost:1};await f.c.edit(b.id,{reactionChoices:[],reactionControl:'manual',reactionCost:'extra',resources:[{id:'mana',name:'Mana',kind:'ammo',quantity:6}],skills:[custom]});
  await f.click('skills',b.id);const d=f.editor(),values=reactionFormValues(new Map(),custom);globalThis.FormData=class{constructor(){return values;}};assert.equal(await submit(d),undefined);let defender=E.findActor(f.c.state(),b.id);assert.deepEqual(defender.reactionChoices,['narrative']);assert.equal(defender.reactionControl,'manual');assert.equal(defender.reactionCost,'extra');assert.equal(defender.resources[0].quantity,6);assert(!defender.reactionUsed);
  await f.c.start(false);const attack=f.c.act({type:'attack',actor:a.id,target:b.id,weapon:'bow'},{roll:n=>n});await new Promise(r=>setTimeout(r,0));const first=f.editor();assert(first.innerHTML.includes('Personal reaction'));first.querySelector('form').elements.reactionChoice={value:'1'};await submit(first);await new Promise(r=>setTimeout(r,0));const second=f.editor();assert.notEqual(second,first);second.querySelector('form').elements.resolution={value:'continue'};await submit(second);const result=await attack;assert.equal(result.narrativeReactions.length,1);defender=E.findActor(f.c.state(),b.id);assert.equal(defender.resources[0].quantity,5);assert(defender.reactionUsed);assert.equal(f.c.pendingReaction(),null);f.ui.destroy();
 });
 for(const override of [false,true])test('1920 hotfix4 '+language+' general editor synchronizes custom permission, respects explicit off='+override+' and preserves its normal-action cost',async()=>{
  const f=fixture(language),id=f.c.state().actors[0].id;await f.c.rules({reactionsEnabled:true,splitMovement:true});const custom={...skillPreset('narrative',language),id:'personal',name:'Personal reaction',range:100};await f.c.edit(id,{initiative:100,reactionChoices:['shield'],reactionControl:'manual',reactionCost:'normal',skills:[custom]});const a=E.findActor(f.c.state(),id);await f.click('edit',id);const d=f.editor(),form=d.querySelector('form'),values=reactionFormValues(actorForm(a),custom);values.set('reaction-shield','on');values.set('reactionControl','manual');values.set('reactionCost','normal');const permission={checked:false},query=form.querySelector.bind(form);form.querySelector=q=>q==='[name="reaction-narrative"]'?permission:query(q);globalThis.FormData=class{constructor(){const data=new Map(values);if(permission.checked)data.set('reaction-narrative','on');else data.delete('reaction-narrative');return data;}};
  const before=E.clone(f.c.state());await form.emit('change',{target:{name:'skill-0-reaction',checked:true,disabled:false}});assert(permission.checked);assert.deepEqual(f.c.state(),before);if(override){permission.checked=false;await form.emit('change',{target:{name:'reaction-narrative',checked:false}});}assert.equal(await submit(d),undefined);const saved=E.findActor(f.c.state(),id);assert.deepEqual(saved.reactionChoices,override?['shield']:['shield','narrative']);assert(saved.skills[0].reaction);assert.equal(saved.reactionControl,'manual');assert.equal(saved.reactionCost,'normal');await f.c.start(false);assert.equal(E.canReserveReaction(f.c.state(),E.findActor(f.c.state(),id)),!override);if(!override){assert(f.ui.root.innerHTML.includes('data-action="reserve-reaction"'));await f.click('reserve-reaction');assert(E.findActor(f.c.state(),id).reactionReserve);assert.equal(f.c.state().action.freeSpent,1);}f.ui.destroy();
 });
 test('1920 hotfix4 '+language+' Abilities Save repairs an existing offered reaction, Cancel changes nothing and Undo restores permission with profile',async()=>{
  const f=fixture(language),id=f.c.state().actors[0].id,custom={...skillPreset('narrative',language),id:'personal',name:'Personal reaction',reaction:true,range:100};await f.c.edit(id,{reactionChoices:['shield'],reactionControl:'off',reactionCost:'normal',skills:[custom]});const before=E.clone(f.c.state());await f.click('skills',id);let d=f.editor(),values=reactionFormValues(new Map(),custom);globalThis.FormData=class{constructor(){return values;}};d.close();assert.deepEqual(f.c.state(),before);await f.click('skills',id);d=f.editor();assert.equal(await submit(d),undefined);assert.deepEqual(E.findActor(f.c.state(),id).reactionChoices,['shield','narrative']);assert.equal(E.findActor(f.c.state(),id).reactionControl,'off');assert.equal(E.findActor(f.c.state(),id).reactionCost,'normal');assert.equal(f.c.state().rules.reactionsEnabled,before.rules.reactionsEnabled);await f.c.undo();assert.deepEqual(E.findActor(f.c.state(),id),E.findActor(before,id));f.ui.destroy();
 });
}
for(const language of ['de','en'])test('1920 hotfix3 '+language+' context-history setting saves on change, rejects invalid values and leaves combat intact',async()=>{
 const preferences={language,quickSide:'right',contextEventCount:8},f=fixture(language,{preferences:patch=>{if(patch)Object.assign(preferences,{...patch,contextEventCount:modelEventCount(patch.contextEventCount)});return {...preferences};}});await f.click('tab-settings');const before=E.clone(f.c.state());assert(f.ui.root.innerHTML.includes(language==='en'?'Combat history: event count':'Kampfverlauf: Anzahl Ereignisse'));assert.match(f.ui.root.innerHTML,/<input name="contextEventCount"[^>]*value="8"[^>]*min="1" max="30"/);
 await f.ui.root.emit('change',{target:{name:'contextEventCount',value:'1'}});assert.equal(preferences.contextEventCount,1);assert.match(f.ui.root.innerHTML,/<input name="contextEventCount"[^>]*value="1"/);await f.click('tab-board');await f.click('tab-settings');assert.match(f.ui.root.innerHTML,/<input name="contextEventCount"[^>]*value="1"/);await f.ui.root.emit('change',{target:{name:'contextEventCount',value:'31'}});assert.equal(preferences.contextEventCount,1);assert(f.ui.root.innerHTML.includes(language==='en'?'Combat context:':'Kampfkontext:'));assert.deepEqual(f.c.state(),before);f.ui.destroy();
});
for(const language of ['de','en']){
 test('1920 hotfix2 '+language+' one selected-recipient release ability can cure self then another participant with one charge each',async()=>{
  const f=await carryFixture(language);await f.c.rules({natural20:false});const before=E.clone(f.c.state());await f.c.edit('kara',{actionsPerTurn:4,tactics:[{type:'rooted',turns:3},{type:'distracted',turns:3}],skills:[{...skillPreset('narrative'),id:'flex-release',name:'Release',range:10,dc:5,check:false,resource:'mana',cost:1,mechanics:{target:'selected',status:{mode:'remove',type:'rooted'}}}]});await f.c.edit('ivo',{tactics:[{type:'rooted',turns:3},{type:'distracted',turns:3}]});
  await f.click('skills','kara');assert(f.editor().innerHTML.includes(language==='en'?'Self or another participant':'Selbst oder andere Figur'));f.editor().close();await f.ui.root.emit('change',{target:{name:'otherKind',value:'skill'}});
  let html=f.ui.root.innerHTML;assert(html.includes('name="skillTarget"'));assert(html.includes(language==='en'?'Choose effect recipient':'Wirkungsziel wählen'));assert(html.includes((language==='en'?'Self: ':'Eigene Figur: ')+'Kara · Retterin'));assert(html.includes('Ivo · Akrobat'));
  const act=f.c.act.bind(f.c);let draws=0;f.c.act=(i,o)=>act(i,{...o,roll:()=>{draws++;return 20;}});await f.ui.root.emit('change',{target:{name:'skillTarget',value:'kara'}});await f.click('use-skill');assert.deepEqual(E.findActor(f.c.state(),'kara').tactics.map(t=>t.type),['distracted']);assert(E.findActor(f.c.state(),'ivo').tactics.some(t=>t.type==='rooted'));assert(feedbackBar(f.ui.root.innerHTML).includes('Kara · Retterin'));
  await f.ui.root.emit('change',{target:{name:'skillTarget',value:'ivo'}});await f.click('use-skill');assert.deepEqual(E.findActor(f.c.state(),'ivo').tactics.map(t=>t.type),['distracted']);assert.equal(E.findActor(f.c.state(),'kara').resources[0].quantity,before.actors.find(a=>a.id==='kara').resources[0].quantity-2);assert.equal(f.c.state().action.freeSpent,2);assert.equal(draws,0);assert(feedbackBar(f.ui.root.innerHTML).includes('Ivo · Akrobat'));assert.equal(E.findActor(f.c.state(),'kara').skills[0].mechanics.target,'selected');f.ui.destroy();
 });
 test('1920 hotfix2 '+language+' own check selected recipient allows self and an ally without changing its policy',async()=>{
  const f=await carryFixture(language);await f.c.rules({natural20:false});await f.c.edit('kara',{actionsPerTurn:4,tactics:[{type:'rooted',turns:3}]});await f.c.edit('ivo',{tactics:[{type:'rooted',turns:3}]});await f.ui.root.emit('change',{target:{name:'otherKind',value:'check'}});
  for(const[name,value]of Object.entries({description:'Release a selected participant',dc:'5',statusMode:'remove',statusType:'rooted',mechanicsTarget:'selected',resource:'mana',cost:'1',target:'kara'}))await f.ui.root.emit('change',{target:{name:'check-'+name,value}});
  assert(f.ui.root.innerHTML.includes((language==='en'?'Self: ':'Eigene Figur: ')+'Kara · Retterin'));const act=f.c.act.bind(f.c);f.c.act=(i,o)=>act(i,{...o,roll:()=>20});await f.click('resolve-check');assert(!E.findActor(f.c.state(),'kara').tactics.some(t=>t.type==='rooted'));assert(E.findActor(f.c.state(),'ivo').tactics.some(t=>t.type==='rooted'));
  await f.ui.root.emit('change',{target:{name:'check-target',value:'ivo'}});await f.click('resolve-check');assert(!E.findActor(f.c.state(),'ivo').tactics.some(t=>t.type==='rooted'));assert.equal(E.findActor(f.c.state(),'kara').resources[0].quantity,10);assert.equal(f.c.state().action.freeSpent,2);f.ui.destroy();
 });
 test('1920 hotfix2 '+language+' self-only own check hides target and separates target-defense context from its actual recipient',async()=>{
  const f=await carryFixture(language);await f.c.rules({natural20:false});await f.c.edit('kara',{actionsPerTurn:4,tactics:[{type:'rooted',turns:3}]});await f.c.edit('ivo',{tactics:[{type:'rooted',turns:3}]});await f.ui.root.emit('change',{target:{name:'otherKind',value:'check'}});
  for(const[name,value]of Object.entries({description:'Free myself',dc:'5',statusMode:'remove',statusType:'rooted',mechanicsTarget:'self',resource:'mana',cost:'1',target:'ivo'}))await f.ui.root.emit('change',{target:{name:'check-'+name,value}});
  assert(!f.ui.root.innerHTML.includes('name="check-target"'));const act=f.c.act.bind(f.c);let draws=0;f.c.act=(i,o)=>act(i,{...o,roll:()=>{draws++;return 20;}});await f.click('resolve-check');assert(!E.findActor(f.c.state(),'kara').tactics.some(t=>t.type==='rooted'));assert(E.findActor(f.c.state(),'ivo').tactics.some(t=>t.type==='rooted'));
  await f.c.edit('kara',{tactics:[{type:'rooted',turns:3}]});await f.ui.root.emit('change',{target:{name:'check-dcMode',value:'target-dc'}});await f.ui.root.emit('change',{target:{name:'check-target',value:'ivo'}});assert(f.ui.root.innerHTML.includes(language==='en'?'Defense reference (effect on self)':'Bezugsfigur für Abwehr (Wirkung auf selbst)'));assert(f.ui.root.innerHTML.includes(language==='en'?'Applies to the acting participant: Kara':'Wirkt auf die eigene Figur: Kara'));await f.click('resolve-check');assert(!E.findActor(f.c.state(),'kara').tactics.some(t=>t.type==='rooted'));assert(E.findActor(f.c.state(),'ivo').tactics.some(t=>t.type==='rooted'));const r=f.c.state().log.findLast(v=>v.type==='check').details;assert.equal(r.custom.target,'kara');assert.equal(r.dc,E.findActor(f.c.state(),'ivo').dc);assert.equal(E.findActor(f.c.state(),'kara').resources[0].quantity,10);assert.equal(f.c.state().action.freeSpent,2);assert.equal(draws,2);f.ui.destroy();
 });
}
for(const language of ['de','en']){
 test('1920 hotfix '+language+' general editor renames first melee/ranged profiles and retains additional weapons, linked stocks and IDs',async()=>{
  const f=fixture(language),a=f.c.state().actors[0];await f.c.edit(a.id,{weaponList:[{id:'knife',name:'Old knife',mode:'melee',damage:'1d4',attackBonus:2,stat:'dexterity',resource:'mana',cost:2,standard:null},{id:'spare',name:'Spare sword',mode:'melee',damage:'1d8'},{id:'bolt',name:'Old bolt',mode:'ranged',damage:'1d6',range:7}],preferredWeapon:'knife',resources:[{id:'mana',name:'Mana',kind:'ammo',quantity:12}]});
  const before=E.clone(f.c.state());await f.click('edit',a.id);const d=f.editor();assert.match(d.innerHTML,/<input name="meleeName"[^>]*value="Old knife"/);assert.match(d.innerHTML,/<input name="rangedName"[^>]*value="Old bolt"/);assert(d.innerHTML.includes(language==='en'?'Weapon name':'Waffenname'));const values=actorForm(E.findActor(f.c.state(),a.id));values.set('meleeName','Silver dagger');values.set('rangedName','Frost bolt');assert.equal(await submit(d),undefined);
  const now=E.findActor(f.c.state(),a.id);assert.equal(now.weaponList[0].name,'Silver dagger');assert.equal(now.weaponList[2].name,'Frost bolt');assert.equal(now.weaponList[0].id,'knife');assert.equal(now.weaponList[0].attackBonus,2);assert.equal(now.weaponList[0].stat,'dexterity');assert.equal(now.weaponList[0].resource,'mana');assert.equal(now.weaponList[0].cost,2);assert.deepEqual(now.weaponList[1],before.actors[0].weaponList[1]);assert.equal(now.preferredWeapon,'knife');await f.click('weapons',a.id);assert(f.editor().innerHTML.includes('Silver dagger'));f.editor().close();await f.c.undo();assert.deepEqual(f.c.state().actors,before.actors);f.ui.destroy();
 });
 test('1920 hotfix '+language+' new actor names survive creation and empty weapon dice still removes its profile',async()=>{
  const f=fixture(language),template=f.c.state().actors[0];await f.click('add');let d=f.editor(),values=actorForm(template);values.set('name','New ranger');values.set('meleeName','Short sword');values.set('rangedName','Hunting bow');values.set('rangedDamage','1d8');assert.equal(await submit(d),undefined);const a=f.c.state().actors.find(v=>v.name==='New ranger');assert.equal(a.weapons.melee.name,'Short sword');assert.equal(a.weapons.ranged.name,'Hunting bow');await f.click('edit',a.id);d=f.editor();values=actorForm(a);values.set('meleeName','Unused name');values.set('meleeDamage','');assert.equal(await submit(d),undefined);assert.equal(E.findActor(f.c.state(),a.id).weapons.melee,null);assert.equal(E.findActor(f.c.state(),a.id).weapons.ranged.name,'Hunting bow');f.ui.destroy();
 });
 test('1920 hotfix '+language+' configured self cure targets the caster, retains other conditions, pays once and shows actual result plus escaped intent',async()=>{
  const f=await carryFixture(language);await f.c.rules({natural20:false});await f.c.edit('kara',{tactics:[{type:'rooted',turns:3},{type:'frightened',turns:3,source:'raider'}],skills:[{...skillPreset('narrative'),id:'release',name:'Release',description:'Break <the net> & run',dc:5,resource:'mana',cost:2,mechanics:{target:'self',status:{mode:'remove',type:'rooted'}}}]});const before=E.clone(f.c.state()),act=f.c.act.bind(f.c);let draws=0;f.c.act=(i,o)=>act(i,{...o,roll:()=>{draws++;return 20;}});await f.ui.root.emit('change',{target:{name:'otherKind',value:'skill'}});assert(!f.ui.root.innerHTML.includes('name="skillTarget"'));await f.click('use-skill');
  const a=E.findActor(f.c.state(),'kara'),bar=feedbackBar(f.ui.root.innerHTML);assert.deepEqual(a.tactics.map(v=>v.type),['frightened']);assert.equal(a.resources[0].quantity,10);assert.equal(draws,1);assert.equal(f.c.state().action.freeSpent,1);assert(bar.includes(a.name));assert(bar.includes(language==='en'?'Held: removed':'Festgehalten: entfernt'));assert(bar.includes(language==='en'?'Narrative intent:':'Erzählabsicht:'));assert(bar.includes('Break &lt;the net&gt; &amp; run'));assert(!bar.includes('<the net>'));assert(!bar.includes('DC'));assert(!bar.includes('manually'));await f.c.undo();const restored=E.findActor(f.c.state(),'kara');assert.deepEqual(restored.tactics.map(({appliedTurn,...t})=>t),before.actors.find(a=>a.id==='kara').tactics.map(({appliedTurn,...t})=>t));assert.deepEqual(restored.resources,before.actors.find(a=>a.id==='kara').resources);f.ui.destroy();
 });
 test('1920 hotfix '+language+' linked self-effect keeps target-defense context when own check overrides fixed DC',async()=>{
  const f=await carryFixture(language);await f.c.edit('kara',{skills:[{...skillPreset('narrative'),id:'release',name:'Release',dc:5,mechanics:{target:'self',status:{mode:'remove',type:'rooted'}}}]});await f.ui.root.emit('change',{target:{name:'otherKind',value:'check'}});for(const[name,value]of Object.entries({description:'Read foe to escape',effect:'release',dcMode:'target-dc',target:'raider'}))await f.ui.root.emit('change',{target:{name:'check-'+name,value}});assert(f.ui.root.innerHTML.includes('name="check-target"'));assert(f.ui.root.innerHTML.includes('value="raider" selected'));f.ui.destroy();
 });
 test('1920 hotfix '+language+' selected cure reports absent condition and narrative-only description never invents multiple effects',async()=>{
  const f=await carryFixture(language);await f.c.rules({natural20:false});await f.c.edit('kara',{actionsPerTurn:4,skills:[{...skillPreset('narrative'),id:'clean',name:'Cleanse',dc:5,range:100,mechanics:{target:'selected',status:{mode:'remove',type:'burning'}}},{...skillPreset('narrative'),id:'story',name:'Cage',description:'Poisoned, stunned, held for two turns',dc:5}]});const act=f.c.act.bind(f.c);f.c.act=(i,o)=>act(i,{...o,roll:()=>20});await f.ui.root.emit('change',{target:{name:'otherKind',value:'skill'}});await f.ui.root.emit('change',{target:{name:'skillTarget',value:'scout'}});const before=E.clone(E.findActor(f.c.state(),'scout'));await f.click('use-skill');let bar=feedbackBar(f.ui.root.innerHTML);assert(bar.includes(before.name));assert(bar.includes(language==='en'?'Burning: was not present':'Brennend: war nicht vorhanden'));assert.deepEqual(E.findActor(f.c.state(),'scout'),before);await f.ui.root.emit('change',{target:{name:'skill',value:'story'}});await f.click('use-skill');bar=feedbackBar(f.ui.root.innerHTML);assert(bar.includes(language==='en'?'No automatic effect configured':'Keine automatische Wirkung eingestellt'));assert(bar.includes('Poisoned, stunned, held for two turns'));assert.deepEqual(E.findActor(f.c.state(),'scout'),before);f.ui.destroy();
 });
}
for(const language of ['de','en']){
 test('1920 '+language+' own-check controls apply healing and one self cure, pay once and expose compact feedback',async()=>{
  const f=await carryFixture(language);await f.c.rules({natural20:false});await f.c.edit('kara',{hp:10,tactics:[{type:'rooted',turns:3},{type:'frightened',turns:3,source:'raider'}]});const actual=f.c.act.bind(f.c);let draws=0;f.c.act=(i,o)=>actual(i,{...o,roll:n=>{draws++;return n===20?20:4;}});
  await f.ui.root.emit('change',{target:{name:'otherKind',value:'check'}});assert(f.ui.root.innerHTML.includes(language==='en'?'Custom effects (optional)':'Eigene Wirkungen (optional)'));assert(!f.ui.root.innerHTML.includes('name="check-damageDice"'));
  const change=(name,value)=>f.ui.root.emit('change',{target:{name:'check-'+name,value}});await f.ui.root.emit('change',{target:{name:'check-healingOn',checked:true}});for(const [n,v]of Object.entries({description:'A healing release',healingDice:'1d8',healingBonus:'2',statusMode:'remove',statusType:'rooted',mechanicsTarget:'self',resource:'mana',cost:'3',dc:'5'}))await change(n,v);
  assert(f.ui.root.innerHTML.includes('name="check-healingDice"'));await f.click('resolve-check');const a=E.findActor(f.c.state(),'kara');assert.equal(a.hp,16);assert.equal(a.resources[0].quantity,9);assert.deepEqual(a.tactics.map(v=>v.type),['frightened']);assert.equal(draws,2);assert.equal(f.c.state().action.freeSpent,1);assert(f.ui.root.innerHTML.includes('ct-board-notice ct-ability-feedback ct-success'));assert(f.ui.root.innerHTML.includes(language==='en'?'removed.':'entfernt.'));f.ui.destroy();
 });
 test('1920 '+language+' saving custom damage/cure from the check does not act and later runs through the ability picker',async()=>{
  const f=await carryFixture(language);await f.c.rules({natural20:false});await f.c.move('raider',{x:6,y:3},true);const actual=f.c.act.bind(f.c);f.c.act=(i,o)=>actual(i,{...o,roll:n=>n===20?20:4});await f.ui.root.emit('change',{target:{name:'otherKind',value:'check'}});
  const change=(name,value)=>f.ui.root.emit('change',{target:{name:'check-'+name,value}});await f.ui.root.emit('change',{target:{name:'check-damageOn',checked:true}});for(const[n,v]of Object.entries({description:'Frost grip',damageDice:'1d6',damageBonus:'2',statusMode:'apply',statusType:'slowed',statusTurns:'2',mechanicsTarget:'selected',effectRange:'10',resource:'mana',cost:'2',dc:'5'}))await change(n,v);
  const before=E.clone(f.c.state());await f.click('save-check-ability');const d=f.editor();d.querySelector('form').elements.abilityName={value:'Frost grip'};assert.equal(await submit(d),undefined);assert.equal(f.c.state().actors.find(v=>v.id==='raider').hp,before.actors.find(v=>v.id==='raider').hp);assert.deepEqual(f.c.state().action,before.action);const skill=E.findActor(f.c.state(),'kara').skills.find(v=>v.name==='Frost grip');assert.equal(skill.mechanics.status.type,'slowed');assert.equal(skill.range,10);
  await f.ui.root.emit('change',{target:{name:'otherKind',value:'skill'}});await f.ui.root.emit('change',{target:{name:'skill',value:skill.id}});await f.ui.root.emit('change',{target:{name:'skillTarget',value:'raider'}});await f.click('use-skill');assert.equal(E.findActor(f.c.state(),'kara').resources[0].quantity,10);assert.equal(f.c.state().action.freeSpent,1);assert.equal(E.findActor(f.c.state(),'raider').effects[0].type,'slowed');assert.equal(f.c.state().log.findLast(v=>v.type==='skill').details.custom.damage.raw,6);f.ui.destroy();
 });
 test('1920 '+language+' ability editor validates effect formulas before saving and preserves other configured profile fields',async()=>{
  const f=await carryFixture(language);await f.c.edit('kara',{skills:[{...skillPreset('narrative'),id:'custom',name:'Pulse',description:'A custom pulse',resource:'mana',cost:2,range:5}]});await f.click('skills','kara');const d=f.editor();assert(d.innerHTML.includes('name="skill-0-damageOn"'));const values=new Map(Object.entries({'skill-0-name':'Pulse','skill-0-description':'A custom pulse','skill-0-stat':'intelligence','skill-0-range':'5','skill-0-dc':'10','skill-0-dcMode':'target-dc','skill-0-dcAdjustment':'1,5','skill-0-bonus':'2','skill-0-turns':'1','skill-0-check':'on','skill-0-resource':'mana','skill-0-cost':'2','skill-0-custom-present':'1','skill-0-damageOn':'on','skill-0-damageDice':'bad','skill-0-damageBonus':'1','skill-0-statusMode':'apply','skill-0-statusType':'burning','skill-0-statusTurns':'3','skill-0-mechanicsTarget':'selected'}));globalThis.FormData=class{constructor(){return values;}};const before=E.clone(f.c.state());assert.match(await submit(d),/Würfel|Dice|dice/);assert.deepEqual(f.c.state(),before);values.set('skill-0-damageDice','1d6');await submit(d);const v=E.findActor(f.c.state(),'kara').skills[0];assert.equal(v.mechanics.damage.dice,'1d6');assert.equal(v.mechanics.damage.bonus,1);assert.equal(v.mechanics.status.type,'burning');assert.equal(v.dcAdjustment,1.5);assert.equal(v.resource,'mana');assert(!Object.hasOwn(v,'_custom'));f.ui.destroy();
 });
}
function highlightedCells(html){return new Set([...html.matchAll(/<button type="button" class="ct-cell ([^"]*)" data-action="cell" data-x="(\d+)" data-y="(\d+)"/g)].filter(m=>m[1].split(/\s+/).includes('ct-reachable')).map(m=>m[2]+','+m[3]));}
const pointKeys=plans=>new Set(plans.map(p=>p.x+','+p.y));
async function carryFixture(language='de'){
 const f=fixture(language);await f.c.import(await carrySeed());await f.c.start(false);return f;
}
for(const language of ['de','en']){
 test('hotfix3 '+language+' carry outline matches actual carried destinations instead of the helper movement radius',async()=>{
  const f=await carryFixture(language),s=f.c.state(),a=E.findActor(s,'kara'),b=E.findActor(s,'scout');
  assert(highlightedCells(f.ui.root.innerHTML).has('0,5'),'A6 is in the normal helper movement radius');
  const before=E.clone(s);await f.ui.root.emit('change',{target:{name:'otherKind',value:'skill'}});await f.ui.root.emit('change',{target:{name:'skillTarget',value:b.id}});
  const actual=highlightedCells(f.ui.root.innerHTML);assert.deepEqual(actual,pointKeys(E.carryDestinations(s,a,b)));
  for(const key of ['0,5','10,2','10,3','10,4'])assert(!actual.has(key),'Outside carrying budget: '+key);
  for(const key of ['1,6','2,5','1,2','7,7','8,7'])assert(actual.has(key),'Legal carrying destination: '+key);
  assert(f.ui.root.innerHTML.includes(language==='en'?'Green outline: carrying destinations for':'Grüner Rand: Bergungsziele für'));assert.deepEqual(f.c.state(),before);f.ui.destroy();
 });
 test('hotfix3 '+language+' helper picker outlines only its exact legal neighbors and cell clicks prepare without payment',async()=>{
  const f=await carryFixture(language);await f.ui.root.emit('change',{target:{name:'otherKind',value:'skill'}});await f.ui.root.emit('change',{target:{name:'skillTarget',value:'scout'}});await f.ui.root.emit('change',{target:{name:'skillCarryCell',value:'I4'}});await f.click('pick-carrier-skill');
  const s=f.c.state(),plans=E.carryPlans(s,E.findActor(s,'kara'),E.findActor(s,'scout'),E.findActor(s,'kara').position,{x:8,y:3});
  assert.deepEqual(highlightedCells(f.ui.root.innerHTML),pointKeys(plans.map(p=>p.carrier)));assert(f.ui.root.innerHTML.includes(language==='en'?'Green outline: helper endpoints for':'Grüner Rand: Helfer-Endfelder für'));
  const before=E.clone(s);await f.ui.root.emit('click',{target:{closest:()=>({dataset:{action:'cell',x:'7',y:'3'},disabled:false})}});assert.deepEqual(f.c.state(),before);assert(f.ui.root.innerHTML.includes('value="H4" selected'));
  assert.deepEqual(highlightedCells(f.ui.root.innerHTML),pointKeys(E.carryDestinations(s,E.findActor(s,'kara'),E.findActor(s,'scout'))));
  await f.click('use-skill');assert.deepEqual(E.findActor(f.c.state(),'kara').position,{x:7,y:3});assert.deepEqual(E.findActor(f.c.state(),'scout').position,{x:8,y:3});assert.equal(f.c.state().movement.spent,5);assert.equal(E.findActor(f.c.state(),'kara').resources[0].quantity,10);f.ui.destroy();
 });
 test('hotfix3 '+language+' own-check carry effect and target switching use the same legal range',async()=>{
  const f=await carryFixture(language);await f.c.edit('kara',{skills:[...E.findActor(f.c.state(),'kara').skills,{...skillPreset('aim'),id:'aim'}]});await f.ui.root.emit('change',{target:{name:'otherKind',value:'check'}});await f.ui.root.emit('change',{target:{name:'check-effect',value:'carry'}});await f.ui.root.emit('change',{target:{name:'check-target',value:'scout'}});
  let s=f.c.state();assert.deepEqual(highlightedCells(f.ui.root.innerHTML),pointKeys(E.carryDestinations(s,E.findActor(s,'kara'),E.findActor(s,'scout'))));
  await f.ui.root.emit('change',{target:{name:'check-carryCell',value:'I4'}});await f.click('pick-carrier-check');assert(highlightedCells(f.ui.root.innerHTML).size<=8);await f.click('cancel-carry-pick');
  await f.c.move('ivo',{x:4,y:4},true);await f.ui.root.emit('change',{target:{name:'check-target',value:'ivo'}});s=f.c.state();assert.deepEqual(highlightedCells(f.ui.root.innerHTML),pointKeys(E.carryDestinations(s,E.findActor(s,'kara'),E.findActor(s,'ivo'))));assert(f.ui.root.innerHTML.includes('Ivo'));
  await f.ui.root.emit('change',{target:{name:'check-effect',value:'aim'}});assert(f.ui.root.innerHTML.includes(language==='en'?'Green outline: reachable movement':'Grüner Rand: Bewegung erreichbar'));assert(highlightedCells(f.ui.root.innerHTML).has('0,5'));f.ui.destroy();
 });
 test('hotfix3 '+language+' carry range updates after movement, rejects unmarked cells atomically, and yields to normal tools',async()=>{
  const f=await carryFixture(language);await f.c.edit('kara',{weaponList:[{id:'bow',name:'Bow',mode:'ranged',damage:'1d6',range:8}],preferredWeapon:'bow'});assert(f.ui.root.innerHTML.includes('ct-range-edge'));
  await f.ui.root.emit('change',{target:{name:'otherKind',value:'skill'}});await f.ui.root.emit('change',{target:{name:'skillTarget',value:'scout'}});assert(!f.ui.root.innerHTML.includes('class="ct-range-edge '));
  const before=E.clone(f.c.state());await f.ui.root.emit('click',{target:{closest:()=>({dataset:{action:'cell',x:'0',y:'5'},disabled:false})}});assert.deepEqual(f.c.state(),before);
  await f.ui.root.emit('click',{target:{closest:()=>({dataset:{action:'cell',x:'8',y:'3'},disabled:false})}});assert.deepEqual(f.c.state(),before);assert(f.ui.root.innerHTML.includes('value="I4"'));await f.click('use-skill');
  let s=f.c.state();assert.deepEqual(highlightedCells(f.ui.root.innerHTML),pointKeys(E.carryDestinations(s,E.findActor(s,'kara'),E.findActor(s,'scout'))));
  await f.ui.root.emit('change',{target:{name:'otherKind',value:'describe'}});assert(f.ui.root.innerHTML.includes(language==='en'?'Green outline: reachable movement':'Grüner Rand: Bewegung erreichbar'));assert(f.ui.root.innerHTML.includes('ct-range-edge'));
  await f.ui.root.emit('change',{target:{name:'otherKind',value:'skill'}});await f.ui.root.emit('change',{target:{name:'override',checked:true}});assert.equal(highlightedCells(f.ui.root.innerHTML).size,0);assert(!f.ui.root.innerHTML.includes(language==='en'?'Green outline: carrying destinations for':'Grüner Rand: Bergungsziele für'));
  await f.ui.root.emit('change',{target:{name:'override',checked:false}});await f.click('block-mode');assert.equal(highlightedCells(f.ui.root.innerHTML).size,0);assert(!f.ui.root.innerHTML.includes(language==='en'?'Green outline: carrying destinations for':'Grüner Rand: Bergungsziele für'));f.ui.destroy();
 });
}

for(const language of ['de','en']){
 test('1919 '+language+' shared status form sets classic and tactical states without an action',async()=>{
    const f=fixture(language),a=f.c.state().actors[0],foe=f.c.state().actors[1];await f.c.start(false);const before=E.clone(f.c.state());await f.click('supplies',a.id);const d=f.editor();for(const type of ['rooted','frightened','provoked','distracted','disarmed','aimed','supported'])assert(d.innerHTML.includes('name="actor-tactic-'+type+'"'));for(const type of ['stunned','slowed'])assert(d.innerHTML.includes('name="actor-effect-'+type+'"'));assert(d.innerHTML.includes('name="actor-effect-periodic-present"'));assert(d.innerHTML.includes('value="acid"'));
    const values=new Map([['actor-tactics-present','1'],['actor-tactic-frightened','on'],['actor-tactic-frightened-turns','3'],['actor-tactic-frightened-source',foe.id],['actor-tactic-distracted','on'],['actor-tactic-distracted-turns','2'],['actor-tactic-distracted-amount','2.5'],['actor-tactic-disarmed','on'],['actor-tactic-disarmed-turns','1'],['actor-tactic-disarmed-weapon',a.preferredWeapon],['actor-effect-burning','on'],['actor-effect-burning-turns','2'],['actor-effect-burning-damage','1']]);globalThis.FormData=class{constructor(){return values;}};assert.equal(await submit(d),undefined);const now=f.c.state().actors[0];assert.equal(now.effects[0].type,'burning');assert.deepEqual(now.tactics.map(v=>v.type),['frightened','distracted','disarmed']);assert.equal(now.tactics[1].amount,2.5);assert.deepEqual(f.c.state().action,before.action);assert.deepEqual(f.c.state().movement,before.movement);await f.c.undo();assert.equal(f.c.state().actors[0].tactics.length,0);f.ui.destroy();
 });
 test('1919 '+language+' calming remedy draft exposes tactical cures and saves only on Apply',async()=>{
    const f=fixture(language),a=f.c.state().actors[0];await f.click('supplies',a.id);const first=f.editor(),form=first.querySelector('form');globalThis.FormData=class{constructor(){return new Map();}};await form.emit('click',{target:{closest:()=>({dataset:{resourcePreset:'calming'}})}});const d=f.editor(),entries=d.querySelector('[data-resource-entries]').innerHTML;assert.equal(d,first);assert(entries.includes('name="resource-0-cure-frightened" checked'));assert(entries.includes('name="resource-0-cure-provoked" checked'));assert.equal(f.c.state().actors[0].resources.length,0);const values=new Map([['resource-0-cure-frightened','on'],['resource-0-cure-provoked','on']]);globalThis.FormData=class{constructor(){return values;}};assert.equal(await submit(d),undefined);assert.deepEqual(f.c.state().actors[0].resources[0].cures,['frightened','provoked']);f.ui.destroy();
 });
 test('1919 '+language+' ally transit is shown once in Movement, and no longer under Board and cover',async()=>{
    const f=fixture(language);await f.click('tab-rules');const html=f.ui.root.innerHTML;assert.equal((html.match(/name="passAllies"/g)??[]).length,1);const terrain=html.slice(html.indexOf('data-fold="rules-terrain"'),html.indexOf('data-fold="rules-movement"')),movement=html.slice(html.indexOf('data-fold="rules-movement"'),html.indexOf('data-fold="rules-hp"'));assert(!terrain.includes('name="passAllies"'));assert(movement.includes('name="passAllies"'));f.ui.destroy();
 });
 test('1919 '+language+' carry selector previews helper endpoint and remaining movement, then moves both',async()=>{
    const f=fixture(language),a=f.c.state().actors[0],b=f.c.state().actors[1];await f.c.move(f.c.state().actors[3].id,{x:9,y:8},true);await f.c.rules({splitMovement:true,multiActionsEnabled:true,movementBase:5,movementStat:'none'});await f.c.board({blocked:[],cover:[],heights:[],ladders:[]});await f.c.move(a.id,{x:2,y:3},true);await f.c.move(b.id,{x:1,y:3},true);await f.c.edit(b.id,{hp:0,condition:'stabilized'});await f.c.edit(a.id,{actionsPerTurn:3,skills:[{...skillPreset('carry'),id:'carry',check:false}]});await f.c.start(false);await f.ui.root.emit('change',{target:{name:'otherKind',value:'skill'}});assert(f.ui.root.innerHTML.includes('name="skillCarryCell"'));assert(!f.ui.root.innerHTML.includes('name="skillDestination"'));await f.ui.root.emit('change',{target:{name:'skillCarryCell',value:'F4'}});assert(f.ui.root.innerHTML.includes(a.name+' → G4'));await f.click('use-skill');assert.deepEqual(f.c.state().actors[0].position,{x:6,y:3});assert.deepEqual(f.c.state().actors[1].position,{x:5,y:3});assert.equal(f.c.state().movement.spent,4);assert.equal(f.c.state().actors[1].hp,0);f.ui.destroy();
 });
}
for(const language of ['de','en'])test('1919 '+language+' stale supplies dialog rejects saving over a newer combat revision',async()=>{
 const f=fixture(language),a=f.c.state().actors[0];await f.click('supplies',a.id);const d=f.editor();globalThis.FormData=class{constructor(){return new Map();}};await f.c.edit(a.id,{hp:a.hp-1});const before=E.clone(f.c.state());assert.match(await submit(d),language==='en'?/Combat changed/:/Kampf wurde geändert/);assert.deepEqual(f.c.state(),before);f.ui.destroy();
});
test('1919 one Acrobatics preset adds both applications with separate saved values and one action picker entry',async()=>{
 const f=fixture('en'),a=f.c.state().actors[0];await f.click('skills',a.id);const d=f.editor(),host=d.querySelector('[data-actor-skills]');let values=new Map();globalThis.FormData=class{constructor(){return values;}};await host.emit('click',{target:{closest:()=>({dataset:{skillAdd:'acrobatics'}})}});assert.equal((host.innerHTML.match(/class="ct-fold ct-acrobatics-group"/g)??[]).length,1);for(const [i,dc]of [[0,'18'],[1,'7']])for(const [key,value]of Object.entries({name:i?'Long jump':'Balance',stat:'dexterity',range:i?'4':'0',dc,bonus:'1',turns:'1',check:'on',cost:i?'2':'3',resource:''}))values.set('skill-'+i+'-'+key,value);assert.equal(await submit(d),undefined);assert.equal(abilityGroups(f.c.state().actors[0].skills).length,1);assert.deepEqual(f.c.state().actors[0].skills.map(v=>[v.dc,v.cost]),[[18,3],[7,2]]);await f.c.start(false);await f.ui.root.emit('change',{target:{name:'otherKind',value:'skill'}});assert(f.ui.root.innerHTML.includes('name="skillApplication"'));const picker=f.ui.root.innerHTML.match(/<select name="skill">(.*?)<\/select>/s)[1];assert.equal((picker.match(/<option/g)??[]).length,1);assert(picker.includes('Acrobatics'));const jump=f.c.state().actors[0].skills[1];await f.ui.root.emit('change',{target:{name:'skillApplication',value:jump.id}});assert(f.ui.root.innerHTML.includes('DC 7'));f.ui.destroy();
});

for(const language of ['de','en'])test('1918 '+language+' reset map with a hanging participant keeps UI responsive through generation, load and Undo',async()=>{
 const f=fixture(language),victim=f.c.state().actors[1];
 await f.c.edit(victim.id,{position:null,lastPosition:{x:4,y:4},lastHeight:0,hanging:{anchor:{x:5,y:4},turns:3,round:1}});
 const before=E.clone(f.c.state());await f.c.reset('map');
 assert(f.c.state().actors.every(a=>!a.position));assert(f.ui.root.innerHTML.includes('data-action="random-map"'));
 assert.match(f.ui.root.innerHTML,language==='en'?/No helping participant is placed/:/Keine helfende Figur platziert/);
 assert.deepEqual(f.c.state().actors[1].hanging,before.actors[1].hanging);assert(!f.ui.root.innerHTML.includes('undefined'));
 await f.c.undo();assert.deepEqual(f.c.state().actors.map(a=>a.position),before.actors.map(a=>a.position));
 await f.c.reset('map');await f.c.randomBoard({preset:'forest',seed:'ui1918'});const map=await f.c.saveMap('Reset regression');
 await f.c.loadMap(map.id);assert.equal(f.c.state().board.preset,'forest');assert.match(f.ui.root.innerHTML,language==='en'?/No helping participant is placed/:/Keine helfende Figur platziert/);
 const helper=f.c.state().actors[0],s=f.c.state(),cell=Array.from({length:s.board.width*s.board.height},(_,i)=>({x:i%s.board.width,y:Math.floor(i/s.board.width)})).find(p=>E.canOccupy(s,p));await f.c.deploy(helper.id,cell);assert(!f.ui.root.innerHTML.includes(language==='en'?'No helping participant is placed':'Keine helfende Figur platziert'));
 f.ui.destroy();
});

test('1919 narrative adjudication removes one tactic in the shared status editor with Undo',async()=>{
 const f=fixture('en'),a=f.c.state().actors[0];await f.c.edit(a.id,{tactics:[{type:'rooted',turns:3},{type:'supported',turns:2}]});const before=E.clone(f.c.state());await f.click('supplies',a.id);const d=f.editor();assert.match(d.innerHTML,/actor-tactic-rooted/);const values=new Map([['actor-tactics-present','1'],['actor-tactic-supported','on'],['actor-tactic-supported-turns','2']]);globalThis.FormData=class{constructor(){return values;}};assert.equal(await submit(d),undefined);assert.deepEqual(f.c.state().actors[0].tactics.map(v=>v.type),['supported']);assert.deepEqual(f.c.state().action,before.action);await f.c.undo();assert.deepEqual(f.c.state().actors[0].tactics,before.actors[0].tactics.map(v=>({...v,appliedTurn:f.c.state().turnSerial})));f.ui.destroy();
});

for(const language of ['de','en']){
 test('1919 '+language+' compact dead label allows a placement attempt and explains its rejection',async()=>{
    const f=fixture(language),a=f.c.state().actors[1];await f.c.rules({autoRemoveDead:true});await f.c.edit(a.id,{hp:0,condition:'dead'});const html=f.ui.root.innerHTML;assert.match(html,/ct-life-dead/);assert(!html.includes('Dead – cannot deploy'));assert(!html.includes('Tot – bei aktiver Leichen'));const reserve=html.slice(html.indexOf('ct-reserve-zone'),html.indexOf('ct-board-roster'));assert(reserve.includes('data-drag-actor="true"'));assert(!/data-action="place-actor"[^>]*disabled/.test(reserve));const before=E.clone(f.c.state());await f.click('place-actor',a.id);await f.ui.root.emit('click',{target:{closest:()=>({dataset:{action:'cell',x:0,y:0},disabled:false})}});assert.match(f.ui.root.innerHTML,language==='en'?/Dead – cannot deploy/:/Tot – bei aktiver Leichen/);assert.deepEqual(f.c.state(),before);f.ui.destroy();
 });
 test('1917 '+language+' board movement failure names its actor and expires on next turn',async()=>{
    const f=fixture(language);await f.c.rules({splitMovement:true});await f.c.start(false);const a=E.currentActor(f.c.state());await f.c.edit(a.id,{tactics:[{type:'rooted',turns:2}]});await f.click('select',a.id);f.editor()?.close();await f.ui.root.emit('click',{target:{closest:()=>({dataset:{action:'cell',x:8,y:8},disabled:false})}});assert.match(f.ui.root.innerHTML,/ct-board-notice ct-error/);assert(f.ui.root.innerHTML.includes(a.name+': '));await f.c.endTurn();assert(!f.ui.root.innerHTML.includes('ct-board-notice ct-error'));f.ui.destroy();
 });
 test('1917 '+language+' board success notices can be dismissed and do not survive a later state change',async()=>{
    const f=fixture(language);await f.click('height-mode');const cell=()=>f.ui.root.emit('click',{target:{closest:()=>({dataset:{action:'cell',x:7,y:7},disabled:false})}});await cell();assert.match(f.ui.root.innerHTML,/ct-board-notice/);await f.click('dismiss-board');assert(!f.ui.root.innerHTML.includes('ct-board-notice'));await cell();assert.match(f.ui.root.innerHTML,/ct-board-notice/);await f.c.edit(f.c.state().actors[0].id,{hp:8});assert(!f.ui.root.innerHTML.includes('ct-board-notice'));f.ui.destroy();
 });
 test('1917 '+language+' restore dialog heals/clears selected actors while preserving their mana and map',async()=>{
    const f=fixture(language),a=f.c.state().actors[0];await f.c.edit(a.id,{hp:3,resources:[{id:'mana',name:'Mana',kind:'ammo',quantity:2,capacity:12}],effects:[{type:'burning',turns:2}]});const before=E.clone(f.c.state());await f.click('restore-actors');const d=f.editor();assert(d.innerHTML.includes(language==='en'?'Restore participants':'Figuren wiederherstellen'));assert.match(d.innerHTML,/name="restoreRefill" >/);const values=new Map([['restoreHp','on'],['restoreEffects','on']]);globalThis.FormData=class{has(k){return values.has(k);}getAll(k){return k==='restoreActor'?[a.id]:[];}};assert.equal(await submit(d),undefined);const now=f.c.state().actors[0];assert.equal(now.hp,now.maxHp);assert.equal(now.effects.length,0);assert.equal(now.resources[0].quantity,2);assert.deepEqual(f.c.state().board,before.board);await f.c.undo();assert.equal(f.c.state().actors[0].hp,3);f.ui.destroy();
 });
 test('1917 '+language+' own check UI sends direct stock cost and target attribute defense',async()=>{
    const f=fixture(language),a=f.c.state().actors[0],b=f.c.state().actors[2];await f.c.rules({splitMovement:true});await f.c.edit(a.id,{resources:[{id:'mana',name:'Mana',kind:'ammo',quantity:8,capacity:12}]});await f.c.start(false);const act=f.c.act.bind(f.c);f.c.act=(i,o)=>act(i,{...o,roll:n=>n});await f.ui.root.emit('change',{target:{name:'otherKind',value:'check'}});for(const[name,value]of Object.entries({description:'Read the opponent',target:b.id,resource:'mana',cost:'3',dcMode:'strength',dcAdjustment:'1,5'}))await f.ui.root.emit('change',{target:{name:'check-'+name,value}});await f.click('resolve-check');const r=f.c.state().log.findLast(e=>e.type==='check').details;assert.equal(r.resource.cost,3);assert.equal(r.defense.mode,'strength');assert.equal(r.dc,16.5+E.statBonus(f.c.state(),f.c.state().actors[2],'strength'));assert.equal(f.c.state().actors[0].resources[0].quantity,5);f.ui.destroy();
 });
 test('1917 '+language+' saving a custom check creates a reusable narrative ability without performing it',async()=>{
    const f=fixture(language),a=f.c.state().actors[0];await f.c.start(false);await f.ui.root.emit('change',{target:{name:'otherKind',value:'check'}});await f.ui.root.emit('input',{target:{name:'check-description',value:'Teleport to the far side'}});const before=E.clone(f.c.state());await f.click('save-check-ability');const d=f.editor();d.querySelector('form').elements.abilityName={value:'Teleport'};assert.equal(await submit(d),undefined);const saved=f.c.state().actors[0].skills.find(v=>v.name==='Teleport');assert(saved);assert.equal(saved.kind,'narrative');assert.equal(saved.description,'Teleport to the far side');assert.deepEqual(f.c.state().actors[0].position,before.actors[0].position);assert.deepEqual(f.c.state().action,before.action);f.ui.destroy();
 });
 test('1917 '+language+' jump panel selects a real safe landing and performs the leap with no ordinary movement left',async()=>{
    const f=fixture(language),[a,b,e]=f.c.state().actors;await f.c.rules({splitMovement:true,natural20:true,movementBase:3,movementStat:"none"});await f.c.board({blocked:[],cover:[],heights:[],ladders:[],pits:[]});await f.c.move(a.id,{x:1,y:1},true);await f.c.move(b.id,{x:4,y:2},true);await f.c.edit(b.id,{hp:0,condition:'stabilized'});await f.c.move(e.id,{x:8,y:8},true);await f.c.edit(a.id,{initiative:100,skills:[{...skillPreset('jump',language),id:'jump'}]});await f.c.start(false);await f.c.move(a.id,{x:4,y:1});assert.equal(E.movementBudget(f.c.state(),f.c.state().actors[0]).remaining,0);await f.ui.root.emit('change',{target:{name:'otherKind',value:'skill'}});assert.match(f.ui.root.innerHTML,/name="skillDestination"/);const act=f.c.act.bind(f.c);f.c.act=(i,o)=>act(i,{...o,roll:n=>n});await f.click('use-skill');assert.deepEqual(f.c.state().actors[0].position,{x:4,y:3});f.ui.destroy();
 });
 test('1917 '+language+' narrative reaction UI shows the check before an explicit GM void and releases the request',async()=>{
    const f=fixture(language),[a,,e]=f.c.state().actors;await f.c.rules({reactionsEnabled:true,splitMovement:true});await f.c.board({blocked:[],cover:[],heights:[],ladders:[]});await f.c.edit(a.id,{initiative:100,weaponList:[{id:'bow',mode:'ranged',damage:'1d4',range:100}],attackMode:'ranged'});await f.c.edit(e.id,{reactionChoices:['narrative'],reactionControl:'manual',resources:[{id:'mana',name:'Mana',kind:'ammo',quantity:6}],skills:[{...skillPreset('narrative',language),id:'shadow',reaction:true,description:'Banish for a round',resource:'mana',cost:2,range:100}]});await f.c.start(false);const pending=f.c.act({type:'attack',actor:a.id,target:e.id,weapon:'bow'},{roll:n=>n});await new Promise(resolve=>setTimeout(resolve,0));const first=f.editor();first.querySelector('form').elements.reactionChoice={value:'1'};await submit(first);await new Promise(resolve=>setTimeout(resolve,0));const second=f.editor();assert.notEqual(first,second);assert.match(second.innerHTML,/Banish for a round/);second.querySelector('form').elements.resolution={value:'void'};await submit(second);const r=await pending;assert(r.voided);assert(!f.ui.root.innerHTML.includes('undefined'));assert.equal(f.c.pendingReaction(),null);assert.equal(f.c.state().actors[2].resources[0].quantity,4);assert(f.ui.root.innerHTML.includes(language==='en'?'Attack voided':'Angriff aufgehoben'));f.ui.destroy();
 });
}

for(const language of ['de','en'])test('1916 '+language+' context Edit opens the clicked participant editor while active actor remains unchanged',async()=>{
    const f=fixture(language);await f.c.start(false);const a=E.currentActor(f.c.state()),b=f.c.state().actors.find(v=>v.id!==a.id);await f.click('actor-menu',b.id);const menu=f.editor();assert.match(menu.innerHTML,/data-context-manage="edit"/);await menu.querySelector('form').emit('click',{target:{closest:selector=>selector==='[data-context-manage]'?{dataset:{contextManage:'edit'}}:null}});const d=f.editor();assert.notEqual(d,menu);assert(d.innerHTML.includes('value="'+b.name+'"'));const values=actorForm(b);values.set('hp','9');globalThis.FormData=class{constructor(){return values;}};await submit(d);assert.equal(f.c.state().actors.find(v=>v.id===b.id).hp,9);assert.equal(E.currentActor(f.c.state()).id,a.id);await f.c.undo();assert.equal(f.c.state().actors.find(v=>v.id===b.id).hp,b.hp);f.ui.destroy();
});
test('1916 raise profile remains available in the post-combat panel and produces visible undead status',async()=>{
    const f=fixture('en'),[a,b]=f.c.state().actors;await f.c.rules({skillsEnabled:true,autoRemoveDead:true});await f.c.edit(a.id,{skills:[{...skillPreset('raise','en'),id:'raise',range:100,reviveHp:7,permanent:false,turns:2}]});await f.c.edit(b.id,{hp:0,condition:'dead'});assert.match(f.ui.root.innerHTML,/name="skillDestination"/);await f.click('revive-after');assert.equal(f.c.state().actors.find(v=>v.id===b.id).allegiance.kind,'raise');assert.match(f.ui.root.innerHTML,/Undead/);assert.match(f.ui.root.innerHTML,/Allegiance &amp; time|Allegiance & time/);await f.click('elapse');assert.equal(f.c.state().actors.find(v=>v.id===b.id).allegiance.turns,1);await f.click('elapse');assert.equal(f.c.state().actors.find(v=>v.id===b.id).condition,'dead');f.ui.destroy();
});
test('1916 Dominate prepares from target context and uses that target once without duplicating initiative',async()=>{
    const f=fixture('en'),a=f.c.state().actors[0],b=f.c.state().actors.find(v=>v.side==='enemy');await f.c.rules({skillsEnabled:true,splitMovement:true});await f.c.edit(a.id,{initiative:100,skills:[{...skillPreset('dominate','en'),id:'dominate',range:100,check:false,turns:2}]});await f.c.start(false);await f.click('actor-menu',b.id);const d=f.editor();assert.match(d.innerHTML,/Dominate/);await f.ui.root.emit('change',{target:{name:'otherKind',value:'skill'}});await f.ui.root.emit('change',{target:{name:'skillTarget',value:b.id}});await f.click('use-skill');const v=f.c.state().actors.find(v=>v.id===b.id);assert.equal(v.side,'ally');assert.equal(v.allegiance.turns,2);assert.match(f.ui.root.innerHTML,/Dominated/);assert.equal(f.c.state().order.filter(id=>id===b.id).length,1);f.ui.destroy();
});

for(const language of ['de','en'])test('1915 '+language+' area preview and result label only same-side casualties as Friendly Fire',async()=>{
    const f=fixture(language),[a,b,e]=f.c.state().actors;await f.c.rules({splitMovement:true,friendlyFireArea:true,natural20:false,reactionsEnabled:false,damageAbility:false});await f.c.move(a.id,{x:1,y:1},true);await f.c.move(b.id,{x:8,y:8},true);await f.c.move(e.id,{x:3,y:2},true);await f.c.edit(a.id,{initiative:100,weaponList:[{id:'blast',name:'Fireball',mode:'ranged',range:10,damage:'1d6',radius:1}],attackMode:'ranged'});await f.c.add({name:'Enemy Two',side:'enemy',position:{x:3,y:3},hp:20,maxHp:20});await f.c.start(false);await f.ui.root.emit('change',{target:{name:'target',value:e.id}});assert.match(f.ui.root.innerHTML,/ct-area-preview/);assert(!f.ui.root.innerHTML.includes('ct-friendly-warning'));
    await f.c.move(b.id,{x:2,y:2},true);let warning=f.ui.root.innerHTML.match(/<p class="ct-warning ct-friendly-warning">([^<]+)<\/p>/)?.[1];assert(warning?.includes(b.name));assert(!warning.includes(e.name));assert(!warning.includes('Enemy Two'));await f.c.rules({friendlyFireArea:false});assert(!f.ui.root.innerHTML.includes('ct-friendly-warning'));await f.c.rules({friendlyFireArea:true});await f.c.act({type:'attack',actor:a.id,target:e.id,mode:'ranged',weapon:'blast'},{roll:n=>n===20?19:6});
    const result=f.c.state().log.findLast(v=>v.type==='hit').details;assert(result.affected.find(v=>v.id===b.id).friendly);assert.equal(result.affected.find(v=>v.id===e.id).friendly,false);const last=f.ui.root.innerHTML.split('ct-result-body')[1].split('ct-controls')[0];warning=last.match(/<p class="ct-warning ct-friendly-warning">([^<]+)<\/p>/)?.[1];assert(warning?.includes(b.name));assert(!warning.includes(e.name));f.ui.destroy();
});
test('1915 intervening enemy uses neutral shot-path text instead of Friendly Fire warning',async()=>{
    const f=fixture('en'),[a,b,e]=f.c.state().actors;await f.c.rules({shotRiskEnabled:true});await f.c.move(a.id,{x:1,y:1},true);await f.c.move(b.id,{x:8,y:8},true);await f.c.move(e.id,{x:3,y:1},true);await f.c.add({name:'Intervening enemy',side:'enemy',position:{x:2,y:1}});await f.c.edit(a.id,{initiative:100});await f.c.start(false);await f.ui.root.emit('change',{target:{name:'target',value:e.id}});await f.ui.root.emit('change',{target:{name:'mode',value:'ranged'}});assert.match(f.ui.root.innerHTML,/Figures in the shot path: Intervening enemy/);assert(!f.ui.root.innerHTML.includes('ct-friendly-warning'));f.ui.destroy();
});

test('1915 post-combat revival panel uses the chosen caster and dead target without restarting combat',async()=>{
    const f=fixture('en'),[a,b]=f.c.state().actors;await f.c.rules({skillsEnabled:true,autoRemoveDead:true});await f.c.edit(a.id,{initiative:100,skills:[{...skillPreset('revive','en'),id:'revive',range:100,reviveHp:7}]});await f.c.edit(b.id,{hp:0,condition:'dead'});await f.c.start(false);await f.c.stop();const phase=f.c.state().phase;assert.match(f.ui.root.innerHTML,/data-action="revive-after"/);await f.click('revive-after');assert.equal(f.c.state().actors.find(v=>v.id===b.id).hp,7);assert.equal(f.c.state().phase,phase);await f.c.undo();assert.equal(f.c.state().actors.find(v=>v.id===b.id).hp,0);f.ui.destroy();
});
test('1915 active revival exposes corpse and safe landing, then returns it for the following round',async()=>{
    const f=fixture('en'),[a,b]=f.c.state().actors;await f.c.rules({skillsEnabled:true,autoRemoveDead:true});await f.c.edit(a.id,{initiative:100,skills:[{...skillPreset('revive','en'),id:'revive',range:100,reviveHp:7}]});await f.c.edit(b.id,{hp:0,condition:'dead'});await f.c.start(false);await f.ui.root.emit('change',{target:{name:'otherKind',value:'skill'}});assert.match(f.ui.root.innerHTML,/name="skillDestination"/);assert(f.ui.root.innerHTML.includes(b.name));await f.click('use-skill');const returned=f.c.state().actors.find(v=>v.id===b.id);assert.equal(returned.hp,7);assert.equal(returned.joinRound,2);f.ui.destroy();
});
test('1915 reachable movement outline remains present over elevated fields and disappears in correction mode',async()=>{
    const f=fixture('en'),a=f.c.state().actors[0];const heights=[];for(let y=0;y<10;y++)for(let x=0;x<10;x++)heights.push({x,y});await f.c.board({heights,blocked:[],cover:[]});await f.c.edit(a.id,{initiative:100});await f.c.start(false);await f.click('select',a.id);assert.match(f.ui.root.innerHTML,/ct-move-edge/);assert.match(f.ui.root.innerHTML,/ct-elevated/);assert.match(f.ui.root.innerHTML,/Green outline: reachable movement/);await f.ui.root.emit('change',{target:{name:'override',checked:true}});assert(!f.ui.root.innerHTML.includes('class="ct-move-edge'));f.ui.destroy();
});
test('1915 deployment dialog includes a removed participant and submits independent formations',async()=>{
    const f=fixture('en'),a=f.c.state().actors[0];await f.c.reserve(a.id);await f.click('random-place');const d=f.editor();assert(d.innerHTML.includes('value="'+a.id+'"'));assert.match(d.innerHTML,/Two opposing armies/);assert.match(d.innerHTML,/Loosely grouped/);const form=d.querySelector('form');for(const [key,value]of Object.entries({placementMode:'custom',partyFormation:'loose',enemyFormation:'spread',placementScope:'unplaced',placementSeed:'ui1915'}))form.elements[key]={value};globalThis.FormData=class{getAll(){return [a.id];}};await submit(d);assert(f.c.state().actors.find(v=>v.id===a.id).position);assert.equal(f.c.state().actors.find(v=>v.id===a.id).reserve,false);assert.equal(f.c.state().log.at(-1).details.partyFormation,'loose');f.ui.destroy();
});

const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
for(const language of ['de','en']){
 test('200alpha '+language+' Advanced control saves collapsible territory, search and retreat options',async()=>{
  const f=fixture(language),a=f.c.state().actors[0];await f.c.edit(a.id,{control:'advanced'});await f.click('edit',a.id);const d=f.editor(),values=actorForm(E.findActor(f.c.state(),a.id));
  assert(d.innerHTML.includes('Advanced AI (Alpha)'));assert(d.innerHTML.includes('data-advanced-options'));assert(d.innerHTML.includes('name="aiRetreat"'));
  for(const [key,value] of Object.entries({aiIdle:'wait',aiHome:'H8',aiRadius:'2',aiSearchTurns:'4',aiAlarmRadius:'6',aiAlarmCost:'0',aiRetreat:'on'}))values.set(key,value);
  assert.equal(await submit(d),undefined);const saved=E.findActor(f.c.state(),a.id);assert.equal(saved.control,'advanced');assert.equal(saved.aiConfig.idle,'wait');assert.equal(saved.aiConfig.free,false);assert.equal(saved.aiConfig.retreat,true);assert.deepEqual(saved.aiConfig.home,{x:7,y:7});f.ui.destroy();
 });
 test('200alpha '+language+' compact mode retains encounter and all participant actions',async()=>{
  const preferences={language},f=fixture(language,{preferences:patch=>{if(patch)Object.assign(preferences,patch);return {...preferences};}}),before=E.clone(f.c.state());
  await f.click('tab-settings');assert(f.ui.root.innerHTML.includes('name="compactUI"'));await f.ui.root.emit('change',{target:{name:'compactUI',checked:true}});await f.click('tab-board');
  const a=f.c.state().actors[0];assert(f.ui.root.innerHTML.includes('data-fold="roster-actions-'+a.id+'"'));for(const action of ['edit','weapons','skills','supplies','actions'])assert(f.ui.root.innerHTML.includes('data-action="'+action+'"'));
  await f.ui.root.emit('change',{target:{name:'compact-movement',checked:true}});assert.equal(preferences.compactSections.movement,true);assert.deepEqual(f.c.state(),before);await f.ui.root.emit('change',{target:{name:'compactUI',checked:false}});assert(!f.ui.root.innerHTML.includes('data-fold="roster-actions-'));assert.deepEqual(f.c.state(),before);f.ui.destroy();
 });
}
const importTestProfile=()=>({kind:'combat-actors',version:1,statMode:'scores',actors:['Siv','Kelm','Moorhund 1','Moorhund 2','Rauk'].map((name,i)=>({name,side:'enemy',maxHp:i===4?28:i<2?10:8,control:i===2||i===3?'basic':'advanced',actionsPerTurn:i===4?2:1}))});
for(const language of ['de','en']){
 test('beta2hf5 '+language+' compact stance remains editable while movement and AI settings use persistent folds',async()=>{
  const preferences={language,compactUI:true,compactSections:{movement:false,batch:false,stance:false}},f=fixture(language,{preferences:patch=>{if(patch)Object.assign(preferences,patch);return {...preferences};}}),a=f.c.state().actors[0];
  await f.c.rules({stancesEnabled:true,splitMovement:true,multiActionsEnabled:true});await f.c.start(false);
  let html=f.ui.root.innerHTML;assert.match(html,/<select name="stance" >/);assert(html.includes(language==='en'?'Offensive':'Offensiv'));assert(html.includes(language==='en'?'Defensive':'Defensiv'));
  for(const key of ['movement','batch','stance'])assert.match(html,new RegExp('<details class="ct-fold" data-fold="compact-sidebar-'+key+'" >'));
  assert(!html.includes('data-compact-section='));const budget=E.movementBudget(f.c.state(),E.currentActor(f.c.state()));assert(html.includes('<small class="ct-compact-count">'+budget.remaining+' / '+budget.total+'</small>'));assert(html.includes('name="aiBatchSize"'));
  const before=E.clone(f.c.state()),history=f.c.historyLength(),queryAll=f.ui.root.querySelectorAll.bind(f.ui.root);
  f.ui.root.querySelectorAll=q=>q==='details[data-fold]'?[{dataset:{fold:'compact-sidebar-batch'},open:true}]:queryAll(q);f.c.refresh();assert.match(f.ui.root.innerHTML,/<details class="ct-fold" data-fold="compact-sidebar-batch" open>/);assert.deepEqual(f.c.state(),before);assert.equal(f.c.historyLength(),history);
  f.ui.root.querySelectorAll=queryAll;await f.ui.root.emit('change',{target:{name:'compact-movement',checked:true}});assert.match(f.ui.root.innerHTML,/<details class="ct-fold" data-fold="compact-sidebar-movement" open>/);assert.deepEqual(f.c.state(),before);
  await f.ui.root.emit('change',{target:{name:'stance',value:'offensive'}});assert.equal(E.findActor(f.c.state(),a.id).stance,'offensive');assert.equal(E.stanceBonus(f.c.state(),E.findActor(f.c.state(),a.id)).attack,f.c.state().rules.offensiveAttack);
  await f.c.act({type:'other',actor:a.id});assert.match(f.ui.root.innerHTML,/<select name="stance" disabled>/);
  await f.ui.root.emit('change',{target:{name:'compactUI',checked:false}});assert(!f.ui.root.innerHTML.includes('data-fold="compact-sidebar-'));assert(f.ui.root.innerHTML.includes('name="stance"'));f.ui.destroy();
 });
 test('beta2hf5 '+language+' compact stocks use shared quantities once and preserve visible action costs',async()=>{
  const preferences={language,compactUI:true},f=fixture(language,{preferences:patch=>{if(patch)Object.assign(preferences,patch);return {...preferences};}}),a=f.c.state().actors[0];
  await f.c.rules({boardEnabled:false,splitMovement:true,multiActionsEnabled:true,resourcesEnabled:true});
  await f.c.edit(a.id,{hp:5,resources:[{id:'ammo',name:'Test bolts',kind:'ammo',quantity:5,capacity:10},{id:'potion-stock',name:'Shared potions',kind:'ammo',quantity:2},{id:'drink',name:'Drink potion',kind:'supply',quantity:99,consumption:'linked',stock:'potion-stock',heal:'4',range:0}],weaponList:[{id:'test-bow',name:'Test bow',mode:'ranged',range:8,damage:'1d4',resource:'ammo',cost:2}],preferredWeapon:'test-bow',attackMode:'ranged'});await f.c.start(false);
  let html=f.ui.root.innerHTML,stocks=()=>f.ui.root.innerHTML.split('<ul class="ct-stock-overview">')[1].split('</ul>')[0];assert(html.includes('data-fold="compact-stocks-'+a.id+'"'));assert(stocks().includes('<span>Shared potions</span><strong>2</strong>'));assert(!stocks().includes('Drink potion'));assert(stocks().includes('<strong>5 / 10</strong>'));
  assert(html.includes(language==='en'?'5 units · Cost 2':'5 Einheiten · Kosten 2'));
  await f.c.act({type:'use',actor:a.id,target:a.id,resource:'drink'});assert.equal(E.findActor(f.c.state(),a.id).resources.find(r=>r.id==='potion-stock').quantity,1);assert(stocks().includes('<span>Shared potions</span><strong>1</strong>'));assert.equal(E.findActor(f.c.state(),a.id).resources.find(r=>r.id==='drink').quantity,99);
  await f.c.rules({resourcesEnabled:false});assert(f.ui.root.innerHTML.includes(language==='en'?'Resource consumption is disabled under Rules.':'Ressourcenverbrauch unter Regeln ausgeschaltet.'));f.ui.destroy();
 });
}
const profileUpload=(d,raw)=>d.querySelector('[data-profile-file]').emit('change',{target:{files:[{size:100,text:async()=>JSON.stringify(raw)}]}});
for(const language of ['de','en']){
 test('beta2hf1 '+language+' participant profile has no default recipient, ignores Replace and adds five without touching existing data',async()=>{
  const f=fixture(language),before=E.clone(f.c.state());await f.click('profiles-actors');const d=f.editor(),form=d.querySelector('form');
  assert(!/name="recipient"[^>]*\bchecked\b/.test(d.innerHTML));assert(form.querySelector('[type=submit]').disabled);
  form.elements.importMode={value:'replace'};form.querySelectorAll=q=>q==='[name="recipient"]:checked'?[{value:before.actors[0].id}]:[];
  await profileUpload(d,importTestProfile());assert.equal(d.querySelector('[data-profile-target-options]').hidden,true);assert.equal(form.elements.importMode.disabled,true);
  assert(!form.querySelector('[type=submit]').disabled);assert(d.querySelector('[data-profile-import-summary]').textContent.includes(language==='en'?'Existing participants':'Bestehende Figuren'));
  assert.equal(await submit(d),undefined);assert.equal(f.c.state().actors.length,before.actors.length+5);assert.deepEqual(f.c.state().actors.slice(0,before.actors.length),before.actors);assert.deepEqual(f.c.state().rules,before.rules);assert.deepEqual(f.c.state().board,before.board);
  assert(f.ui.root.innerHTML.includes(language==='en'?'5 new participants added':'5 neue Figuren hinzugefügt'));await f.c.undo();assert.deepEqual(f.c.state().actors,before.actors);f.ui.destroy();
 });
 test('beta2hf1 '+language+' top file Import detects participant profiles before mutation and opens their populated preview',async()=>{
  const f=fixture(language),before=E.clone(f.c.state());await f.click('import');const original=f.editor();
  await original.querySelector('[name=file]').emit('change',{target:{files:[{size:100,text:async()=>JSON.stringify(importTestProfile())}]}});
  const d=f.editor();assert.notEqual(d,original);assert.match(d.querySelector('[data-profile-preview]').textContent,/Siv/);assert.match(d.querySelector('[data-profile-status]').textContent,/5/);assert.deepEqual(f.c.state(),before);
  assert.equal(await submit(d),undefined);assert.equal(f.c.state().actors.length,before.actors.length+5);assert.deepEqual(f.c.state().actors.slice(0,before.actors.length),before.actors);f.ui.destroy();
 });
 test('beta2hf1 '+language+' pasted participant profile routes to preview and cancelling never changes combat',async()=>{
  const f=fixture(language),before=E.clone(f.c.state());await f.click('import');const original=f.editor();original.querySelector('form').elements.json={value:JSON.stringify(importTestProfile())};assert.equal(await submit(original),undefined);
  const d=f.editor();assert.notEqual(d,original);assert(d.open);assert.match(d.querySelector('[data-profile-preview]').textContent,/Rauk/);d.close();assert.deepEqual(f.c.state(),before);f.ui.destroy();
 });
 test('beta2hf1 '+language+' full combat and raw participant array still use their original distinct import operations',async()=>{
  const f=fixture(language),before=E.clone(f.c.state());await f.click('import');let d=f.editor();d.querySelector('form').elements.json={value:JSON.stringify([{name:'New roster participant',side:'ally',maxHp:9}])};assert.equal(await submit(d),undefined);assert.equal(f.c.state().actors.length,before.actors.length+1);
  await f.click('import');d=f.editor();d.querySelector('form').elements.json={value:JSON.stringify({...before,name:'Restored full combat'})};assert.equal(await submit(d),undefined);assert.equal(f.c.state().name,'Restored full combat');assert.deepEqual(f.c.state().actors,before.actors);f.ui.destroy();
 });
 test('beta2hf1 '+language+' non-actor profiles require explicit recipients and affect only those selected',async()=>{
  const f=fixture(language),before=E.clone(f.c.state());await f.click('profiles-actors');const d=f.editor(),form=d.querySelector('form');form.elements.importMode={value:'append'};
  await profileUpload(d,{kind:'combat-resources',version:1,resources:[{id:'hf-heal',name:'Only selected remedy',quantity:2,heal:'1d4'}]});assert.equal(d.querySelector('[data-profile-target-options]').hidden,false);assert.equal(form.elements.importMode.disabled,false);
  assert(await submit(d));assert.deepEqual(f.c.state(),before);const target=before.actors[1].id;form.querySelectorAll=q=>q==='[name="recipient"]:checked'?[{value:target}]:[];
  assert.equal(await submit(d),'');assert.deepEqual(f.c.state().actors[0],before.actors[0]);assert(f.c.state().actors[1].resources.some(r=>r.name==='Only selected remedy'));f.ui.destroy();
 });
 test('beta2hf1 '+language+' fog retains imported enemies privately and confirms how to deploy them',async()=>{
  const f=fixture(language);await f.c.rules({visionEnabled:true,hideUnseenEnemies:true});await f.click('profiles-actors');const d=f.editor();await profileUpload(d,importTestProfile());assert(d.querySelector('[data-profile-import-summary]').textContent.includes(language==='en'?'Unplaced enemies are hidden':'Unplatzierte Gegner werden ausgeblendet'));
  assert.equal(await submit(d),undefined);assert(f.c.state().actors.some(a=>a.name==='Rauk'));assert(!f.ui.root.innerHTML.includes('Rauk'));assert(f.ui.root.innerHTML.includes(language==='en'?'GM: correct positions':'Spielleitung: Positionen korrigieren'));
  await f.ui.root.emit('change',{target:{name:'override',checked:true}});assert(f.ui.root.innerHTML.includes('Rauk'));f.ui.destroy();
 });
 test('beta2hf1 '+language+' delayed earlier file reads cannot replace the most recently selected profile',async()=>{
  const f=fixture(language);await f.click('profiles-actors');const d=f.editor();let finish;const slow=d.querySelector('[data-profile-file]').emit('change',{target:{files:[{size:100,text:()=>new Promise(resolve=>{finish=resolve;})}]}});
  assert(d.querySelector('form').querySelector('[type=submit]').disabled);await profileUpload(d,{kind:'combat-actors',version:1,statMode:'scores',actors:[{name:'Latest file selection',maxHp:7}]});finish(JSON.stringify(importTestProfile()));await slow;
  assert.match(d.querySelector('[data-profile-preview]').textContent,/Latest file selection/);assert.equal(await submit(d),undefined);assert(f.c.state().actors.some(a=>a.name==='Latest file selection'));assert(!f.c.state().actors.some(a=>a.name==='Rauk'));f.ui.destroy();
 });
 test('beta2hf1 '+language+' clearing or invalidating a selected profile clears the draft and disables Import',async()=>{
  const f=fixture(language),before=E.clone(f.c.state());await f.click('profiles-actors');const d=f.editor();await profileUpload(d,importTestProfile());await d.querySelector('[data-profile-file]').emit('change',{target:{files:[]}});assert(d.querySelector('form').querySelector('[type=submit]').disabled);assert.equal(d.querySelector('[data-profile-preview]').textContent,'');
  await profileUpload(d,{kind:'combat-actors',version:1,statMode:'scores',actors:[{name:'Invalid',resources:[{id:'bad',name:'Bad',quantity:-1}]}]});assert(d.querySelector('form').querySelector('[type=submit]').disabled);assert(d.querySelector('.ct-editor-error').textContent);assert.deepEqual(f.c.state(),before);f.ui.destroy();
 });
}

async function participantVisibilityFixture(language){
 const f=fixture(language);await f.c.board({width:16,height:12});const enemy=f.c.state().actors.find(a=>a.side==='enemy');await f.c.edit(enemy.id,{name:'Secret managed enemy',position:{x:14,y:10},skills:[],resources:[],weaponList:[{id:'managed-sword',name:'Managed sword',mode:'melee',damage:'1d4',range:1}]});await f.c.rules({visionEnabled:true,visionBase:1,hideUnseenEnemies:true});await f.click('tab-actors');return {...f,enemy:f.c.state().actors.find(a=>a.id===enemy.id)};
}
for(const language of ['de','en']){
 test('beta2hf2 '+language+' participant visibility is explicit, local and does not alter rules, fog, dice or history',async()=>{
  const f=await participantVisibilityFixture(language),before=E.clone(f.c.state()),history=f.c.historyLength(),prompt=E.buildPrompt(f.c.state());assert(!f.ui.root.innerHTML.includes(f.enemy.name));assert(f.ui.root.innerHTML.includes(language==='en'?'Undiscovered enemies are hidden in this list':'Unentdeckte Gegner sind in dieser Liste ausgeblendet'));assert.match(f.ui.root.innerHTML,/name="showHiddenParticipants"/);
  await f.ui.root.emit('change',{target:{name:'showHiddenParticipants',checked:true}});assert(f.ui.root.innerHTML.includes(f.enemy.name));assert(f.ui.root.innerHTML.includes(language==='en'?'All enemies are shown':'Alle Gegner werden angezeigt'));assert.deepEqual(f.c.state(),before);assert.equal(f.c.historyLength(),history);assert.equal(E.buildPrompt(f.c.state()),prompt);assert(!E.playerCanSee(f.c.state(),f.enemy));
  await f.click('tab-board');assert(!f.ui.root.innerHTML.includes(f.enemy.name));assert(!/name="override" checked/.test(f.ui.root.innerHTML));await f.click('tab-actors');assert(f.ui.root.innerHTML.includes(f.enemy.name));await f.ui.root.emit('change',{target:{name:'showHiddenParticipants',checked:false}});assert(!f.ui.root.innerHTML.includes(f.enemy.name));f.ui.destroy();
 });
 test('beta2hf2 '+language+' explicitly revealed participant can be edited while board targeting remains concealed',async()=>{
  const f=await participantVisibilityFixture(language);await f.ui.root.emit('change',{target:{name:'showHiddenParticipants',checked:true}});await f.click('edit',f.enemy.id);const d=f.editor();assert(d.innerHTML.includes(f.enemy.name));const values=actorForm(f.enemy);values.set('name','Edited management-only enemy');assert.equal(await submit(d),undefined);assert.equal(E.findActor(f.c.state(),f.enemy.id).name,'Edited management-only enemy');
  await f.click('tab-board');assert(!f.ui.root.innerHTML.includes('Edited management-only enemy'));assert(!E.playerCanSee(f.c.state(),E.findActor(f.c.state(),f.enemy.id)));assert(!JSON.stringify(E.tacticalTargets(f.c.state())).includes(f.enemy.id));f.ui.destroy();
 });
 test('beta2hf2 '+language+' new chat resets hidden participant visibility instead of carrying a privileged view across chats',async()=>{
  const f=await participantVisibilityFixture(language);await f.ui.root.emit('change',{target:{name:'showHiddenParticipants',checked:true}});assert(f.ui.root.innerHTML.includes(f.enemy.name));f.switch('b');f.switch('a');await f.click('tab-actors');assert(!f.ui.root.innerHTML.includes(f.enemy.name));assert(!/name="showHiddenParticipants" checked/.test(f.ui.root.innerHTML));f.ui.destroy();
 });
 test('beta2hf2 '+language+' disabled enemy hiding shows a clear status and no irrelevant visibility checkbox',async()=>{
  const f=await participantVisibilityFixture(language);await f.c.rules({hideUnseenEnemies:false});assert(f.ui.root.innerHTML.includes(f.enemy.name));assert(f.ui.root.innerHTML.includes(language==='en'?'All enemies are shown':'Alle Gegner werden angezeigt'));assert(!f.ui.root.innerHTML.includes('name="showHiddenParticipants"'));f.ui.destroy();
 });
 test('beta2hf2 '+language+' importing hidden opponents explicitly confirms success and directs users to the participant switch',async()=>{
  const f=await participantVisibilityFixture(language);await f.click('profiles-actors');const d=f.editor();await profileUpload(d,importTestProfile());assert.equal(await submit(d),undefined);assert(f.ui.root.innerHTML.includes(language==='en'?'Import successful: 5 new participants added':'Import erfolgreich: 5 neue Figuren hinzugefügt'));assert(!f.ui.root.innerHTML.includes('Rauk'));assert(f.ui.root.innerHTML.includes(language==='en'?'Show hidden enemies':'Ausgeblendete Gegner anzeigen'));await f.ui.root.emit('change',{target:{name:'showHiddenParticipants',checked:true}});assert(f.ui.root.innerHTML.includes('Rauk'));f.ui.destroy();
 });
 test('beta2hf2 '+language+' GM position correction and participant visibility remain separate controls',async()=>{
  const f=await participantVisibilityFixture(language);await f.click('tab-board');await f.ui.root.emit('change',{target:{name:'override',checked:true}});await f.click('tab-actors');assert(f.ui.root.innerHTML.includes(f.enemy.name));assert.match(f.ui.root.innerHTML,/name="showHiddenParticipants" checked disabled/);await f.click('tab-board');await f.ui.root.emit('change',{target:{name:'override',checked:false}});await f.click('tab-actors');assert(!f.ui.root.innerHTML.includes(f.enemy.name));f.ui.destroy();
 });
}

// A limited event/DOM harness. It checks behavior and markup, not browser layout.
class Element {
    constructor() { this.innerHTML = ''; this.events = {}; this.dataset = {}; this.nodes = {}; this.children = []; this.elements = { enabled: { checked: true }, fit: { value: 'contain' }, scale: { value: '100' }, x: { value: '0' }, y: { value: '0' }, opacity: { value: '90' }, gridOpacity: { value: '25' } }; }
    setAttribute() {} append(e) { this.children.push(e); } remove() { this.removed = true; }
    addEventListener(name, fn) { (this.events[name] ??= []).push(fn); }
    async emit(name, value) { for (const fn of this.events[name] ?? []) await fn(value); }
    closest(selector){return selector==='form'?this.parentForm:null;}
    querySelector(selector) {
        if (selector === 'form' && this.innerHTML.includes('<form novalidate>')) return this.form ??= new Element();
        if (selector === '.ct-board-scroll') return { clientWidth: this.boardWidth ?? 560 };
        if (['[type=submit]', '.ct-editor-error'].includes(selector)) return this.nodes[selector] ??= new Element();
        if (['[name=file]', '[name=json]'].includes(selector) && this.innerHTML.includes('name="'+selector.slice(6,-1)+'"')) return this.nodes[selector] ??= new Element();
        if (selector.startsWith('[data-') && this.innerHTML.includes(selector.slice(1, -1))) {const node=this.nodes[selector]??=new Element();node.parentForm=this.querySelector('form');return node;}
        return null;
    }
    querySelectorAll() { return []; } showModal() { this.open = true; } close() { this.open = false; for (const fn of this.events.close ?? []) fn(); }
}
let original;
beforeEach(() => {
    original = { document: globalThis.document, Image: globalThis.Image, FormData: globalThis.FormData, create: URL.createObjectURL, revoke: URL.revokeObjectURL };
    globalThis.document = { body: new Element(), createElement: type => type === 'canvas' ? { width: 0, height: 0, getContext: () => ({ clearRect() {}, drawImage() {} }), toDataURL: () => png } : new Element() };
    globalThis.Image = class { naturalWidth = 800; naturalHeight = 400; set src(_) { queueMicrotask(() => this.onload()); } };
    URL.createObjectURL = () => 'blob:test'; URL.revokeObjectURL = () => {};
});
afterEach(() => { globalThis.document = original.document; globalThis.Image = original.Image; globalThis.FormData = original.FormData; URL.createObjectURL = original.create; URL.revokeObjectURL = original.revoke; });
function fixture(language = 'de', extra = {}) {
    let key = 'a'; const chats = { a: { state: E.demoState(), history: [] }, b: { state: E.demoState(), history: [] } }, library = [];
    const c = createController({ key: () => key, read: () => chats[key], write: b => { chats[key] = b; }, save: async () => {}, preferences: () => ({ language,contextOnClick:true }), library: () => library, saveTemplate: async a => library.push(a), ...extra });
    const ui = (language === 'en' ? createUIEnglish : createUI)(c);
    const click = (action, id) => ui.root.emit('click', { target: { closest: () => ({ dataset: { action, id }, disabled: false }) } });
    return { c, ui, chats, click, switch: value => { key = value; ui.chatChanged(); ui.open(); }, editor: () => document.body.children.at(-1) };
}
for(const language of ['de','en'])test('beta4hf1 '+language+' global STR throwing rule is visible and saves only after confirming the draft',async()=>{
 const f=fixture(language),a=f.c.state().actors[0];await f.c.edit(a.id,{stats:{...a.stats,strength:14},weaponList:[{id:'thrown',name:'Thrown flask',mode:'ranged',damage:'1d4',range:4,strengthRange:true}],preferredWeapon:'thrown'});
 const checked=()=>f.ui.root.innerHTML.match(/<input name="strengthRangeEnabled"[^>]*>/)?.[0].includes('checked');
 await f.click('tab-rules');assert(checked());assert(f.ui.root.innerHTML.includes(language==='en'?'Strength increases throwing range':'Stärke erhöht Wurfreichweite'));
 await f.ui.root.emit('change',{target:{name:'strengthRangeEnabled',type:'checkbox',checked:false,closest:s=>s==='#ct-rules-form'?{}:null}});
 f.c.refresh();
 assert.equal(f.c.state().rules.strengthRangeEnabled,true);assert(!checked());await f.click('save-rules');assert.equal(f.c.state().rules.strengthRangeEnabled,false);
 const actor=f.c.state().actors[0];assert.equal(E.effectiveRange(f.c.state(),actor,E.weaponFor(actor,'ranged')),4);assert(actor.weaponList[0].strengthRange);
 await f.c.undo();assert.equal(f.c.state().rules.strengthRangeEnabled,true);assert(checked());f.ui.destroy();
});
function actorForm(a) {
    const values = new Map(Object.entries({ name: a.name, side: a.side, maxHp: a.maxHp, hp: a.hp, baseHp: a.baseHp, dc: a.dc, initiative: a.initiative, control: a.control, aiBehavior: a.aiBehavior, attackBonus: a.attackBonus, attackMode: a.attackMode, attackStat: a.attackStat, range: a.range, meleeDamage: a.weapons.melee.damage, meleeRadius: '0', meleeBonus: '0', rangedDamage: a.weapons.ranged?.damage ?? '', rangedRadius: '0', rangedBonus: '0', movementBonus: '0', deathRounds: '', condition: 'auto', roundsLeft: '', notes: '' }));
    for (const [key, value] of Object.entries(a.stats)) values.set('stat-' + key, value);
    globalThis.FormData = class { constructor() { return values; } };
    return values;
}
for(const language of ['de','en'])test('beta4hf2 '+language+' visible hit remains in the Combat log and result card during the following unseen turn',async()=>{
 const f=fixture(language);let s=E.emptyState();s.board={...s.board,width:16,height:12};s.rules=E.rulesFrom({...s.rules,visionEnabled:true,visionBase:4,visionPerception:false,hideUnseenEnemies:true,splitMovement:true,language});
 s.actors=[{id:'hero',name:'Visible hero',side:'player',initiative:100,position:{x:1,y:1},weaponList:[{id:'blade',mode:'melee',damage:'1d6',damageBonus:2}]},{id:'secret-archer',name:'Secret archer',side:'enemy',initiative:80,position:{x:14,y:9}},{id:'foe',name:'Visible foe',side:'enemy',initiative:60,position:{x:2,y:1}}].map(a=>E.actorFrom({...a,hp:20,maxHp:20},true));
 s=E.startCombat(E.validateState(s)).state;s=E.resolveAction(s,{type:'attack',actor:'hero',target:'foe',weapon:'blade'},{roll:n=>n===20?15:1}).state;s=E.endTurn(s).state;
 await f.c.import(s);await f.click('tab-log');let html=f.ui.root.innerHTML;assert(html.includes('ct-log-hit'));assert(html.includes('Visible hero → Visible foe'));assert(html.includes(language==='en'?'3 damage':'3 Schaden'));assert(!html.includes('Secret archer'));assert(!html.includes('secret-archer'));
 await f.click('tab-board');html=f.ui.root.innerHTML;assert(html.includes(language==='en'?'Unseen enemy turn':'Unentdeckter Gegner am Zug'));assert(html.includes('Visible hero'));assert(html.includes('Visible foe'));assert(html.includes(language==='en'?'3 damage':'3 Schaden'));assert(!html.includes('Secret archer'));f.ui.destroy();
});
function flaskValues(stock,weapon){return new Map([
 ['damage-stock-'+stock+'-name','Shared flasks'],['damage-stock-'+stock+'-quantity','4'],['damage-stock-'+stock+'-capacity','8'],
 ['damage-item-0-name',weapon.name??'Flask'],['damage-item-0-range','4'],['damage-item-0-strengthRange-present','1'],['damage-item-0-strengthRange','on'],['damage-item-0-stat','dexterity'],['damage-item-0-hit','0'],['damage-item-0-damage','1d4'],['damage-item-0-type','acid'],['damage-item-0-bonus','0'],['damage-item-0-radius','1'],['damage-item-0-stock',stock],['damage-item-0-cost','1'],...(weapon.standard?[['damage-item-0-keepStandard','on']]:[])
]);}
for(const language of ['de','en']){
 test('beta4 '+language+' common flask editor stages attack and stock, saves together and supports Undo',async()=>{
  const f=fixture(language),a=f.c.state().actors[0],before=E.clone(a);await f.click('supplies',a.id);const d=f.editor(),form=d.querySelector('form');globalThis.FormData=class{constructor(){return new Map();}};
  await form.emit('click',{preventDefault(){},target:{closest:selector=>selector.includes('data-damage-preset')?{dataset:{damagePreset:'acid'}}:null}});
  const html=d.querySelector('[data-damage-items]').innerHTML,stock=html.match(/name="damage-stock-([^" ]+)-quantity"/)[1];assert(html.includes(language==='en'?'Acid flask':'Säurefläschchen'));assert.deepEqual(f.c.state().actors[0],before);
  const values=flaskValues(stock,{name:'Acid flask'});globalThis.FormData=class{constructor(){return values;}};assert.equal(await submit(d),undefined);const saved=f.c.state().actors[0];assert.equal(saved.resources.find(r=>r.id===stock).quantity,4);assert.equal(saved.weaponList.filter(w=>w.consumable).length,1);assert.deepEqual(saved.weaponList.filter(w=>!w.consumable),before.weaponList);assert.equal(saved.weaponList.at(-1).standard,null);assert(saved.weaponList.at(-1).strengthRange);
  await f.c.undo();assert.deepEqual(f.c.state().actors[0].resources,before.resources);assert.deepEqual(f.c.state().actors[0].weaponList,before.weaponList);f.ui.destroy();
 });
 test('beta4 '+language+' cancelling the common flask editor changes neither weapons nor stocks',async()=>{
  const f=fixture(language),a=f.c.state().actors[0],before=E.clone(f.c.state());await f.click('supplies',a.id);const d=f.editor();globalThis.FormData=class{constructor(){return new Map();}};await d.querySelector('form').emit('click',{preventDefault(){},target:{closest:selector=>selector.includes('data-damage-preset')?{dataset:{damagePreset:'fire'}}:null}});d.close();assert.deepEqual(f.c.state(),before);f.ui.destroy();
 });
 test('beta4 '+language+' an existing ranged attack can be managed as an item without copying it',async()=>{
  const f=fixture(language),a=f.c.state().actors[0],ranged=E.listWeapons(a).find(w=>w.mode==='ranged');await f.click('supplies',a.id);const d=f.editor();globalThis.FormData=class{constructor(){return new Map([['damage-adopt',ranged.id]]);}};
  await d.querySelector('form').emit('click',{preventDefault(){},target:{closest:selector=>selector.includes('data-damage-adopt')?{dataset:{damageAdopt:''}}:null}});
  const html=d.querySelector('[data-damage-items]').innerHTML,stock=html.match(/name="damage-stock-([^" ]+)-quantity"/)[1],values=flaskValues(stock,ranged);globalThis.FormData=class{constructor(){return values;}};assert.equal(await submit(d),undefined);const saved=f.c.state().actors[0];assert.equal(saved.weaponList.length,a.weaponList.length);assert(saved.weaponList.find(w=>w.id===ranged.id).consumable);f.ui.destroy();
 });
 test('beta4 '+language+' live throwing formula and board reach agree on Strength instead of Perception',async()=>{
  const f=fixture(language),a=f.c.state().actors[0];await f.c.edit(a.id,{stats:{...a.stats,strength:14,perception:18},weaponList:[{id:'flask',name:'Flask',mode:'ranged',range:4,damage:'1d4',strengthRange:true,consumable:true}],preferredWeapon:'flask'});await f.c.rules({perceptionRange:true});await f.c.start(false);
  assert(f.ui.root.innerHTML.includes(language==='en'?'Base range 4 + 2 STR = 6 cells':'Grundweite 4 + 2 STR = 6 Felder'));assert.match(f.ui.root.innerHTML,/class="ct-range-legend">[^<]*6/);f.ui.destroy();
 });
}
async function submit(d) { const form = d.querySelector('form'); await form.emit('submit', { preventDefault() {}, currentTarget: form }); return form.querySelector('.ct-editor-error').textContent; }
async function upload(d) { await d.querySelector('[data-image-file]').emit('change', { target: { files: [{ type: 'image/png', size: 1000 }] } }); }

test('Abilities editor and action picker expose a configured non-damaging ability in English',async()=>{
    const f=fixture('en'),a=f.c.state().actors[0];await f.c.edit(a.id,{skills:[{...skillPreset('aim','en'),id:'aim'}]});assert.match(f.ui.root.innerHTML,/Abilities/);await f.click('skills',a.id);assert.match(f.editor().innerHTML,/Abilities and custom special abilities/);f.editor().close();await f.c.start(false);await f.ui.root.emit('change',{target:{name:'otherKind',value:'skill'}});assert.match(f.ui.root.innerHTML,/Resolve ability/);await f.click('use-skill');assert.equal(f.c.state().actors[0].tactics[0].type,'aimed');assert.equal(f.c.state().actors[0].hp,a.hp);assert.match(f.ui.root.innerHTML,/Ability succeeded/);f.ui.destroy();
});
test('Ability edits are staged and saved as one profile change, with comma bonuses supported',async()=>{
    const f=fixture('en'),a=f.c.state().actors[0];await f.c.edit(a.id,{skills:[{...skillPreset('intimidate','en'),id:'fear'}]});await f.click('skills',a.id);const d=f.editor();const values=new Map(Object.entries({'skill-0-name':'Threat','skill-0-stat':'strength','skill-0-range':'4','skill-0-dc':'12,5','skill-0-bonus':'1,5','skill-0-turns':'1','skill-0-check':'on','skill-0-ai':'on'}));globalThis.FormData=class{constructor(){return values;}};assert.equal(await submit(d),undefined);assert.equal(f.c.state().actors[0].skills[0].dc,12.5);assert.equal(f.c.state().actors[0].skills[0].bonus,1.5);assert.equal(f.c.state().actors[0].skills[0].ai,true);f.ui.destroy();
});
test('Group budget editor exposes append/replace modes and selected factions',async()=>{
    const f=fixture('en');await f.click('group-budgets');const d=f.editor();assert.match(d.innerHTML,/Add restricted extras/);const values=new Map([['actionsPerTurn','2'],['groupMode','replace'],['group-enemy','on']]);globalThis.FormData=class{constructor(){return values;}};assert.equal(await submit(d),undefined);assert(f.c.state().actors.filter(a=>a.side==='enemy').every(a=>a.actionsPerTurn===2));assert.equal(f.c.state().actors[0].actionsPerTurn,1);f.ui.destroy();
});
test('1914 ability editor saves selected target defense basis and comma decimal adjustment',async()=>{
    const f=fixture('en'),a=f.c.state().actors[0];await f.c.edit(a.id,{skills:[{...skillPreset('shove','en'),id:'push'}]});await f.click('skills',a.id);const d=f.editor();assert.match(d.innerHTML,/Defense basis/);assert.match(d.innerHTML,/Target’s defense DC/);
    const values=new Map(Object.entries({'skill-0-name':'Push','skill-0-stat':'charisma','skill-0-range':'1','skill-0-dc':'15','skill-0-dcMode':'best-physical','skill-0-dcAdjustment':'1,5','skill-0-bonus':'0','skill-0-turns':'1','skill-0-check':'on'}));globalThis.FormData=class{constructor(){return values;}};await submit(d);const v=f.c.state().actors[0].skills[0];assert.equal(v.stat,'charisma');assert.equal(v.dcMode,'best-physical');assert.equal(v.dcAdjustment,1.5);f.ui.destroy();
});
test('Attack result remains visible after End turn and includes the completed turn below',async()=>{
    const f=fixture('en');await f.c.rules({splitMovement:true,movementBase:5});await f.c.start(false);const a=E.currentActor(f.c.state());await f.c.act({type:'attack',actor:a.id,target:f.c.state().actors[2].id,mode:'ranged'},{roll:n=>n});const result=f.c.state().log.findLast(e=>e.type==='hit');await f.c.endTurn();assert.match(f.ui.root.innerHTML,/ct-result-hit/);assert.match(f.ui.root.innerHTML,/ct-result-turn/);assert(f.ui.root.innerHTML.includes(result.details.targetName));f.ui.destroy();
});
test('Terrain eraser removes a ladder explicitly; height brush replaces walls and wall painting clears height',async()=>{
    const f=fixture('en');await f.c.board({blocked:[{x:7,y:7}],cover:[],heights:[{x:6,y:5}],ladders:[{from:{x:6,y:6},to:{x:6,y:5}}]});const cell=(x,y)=>f.ui.root.emit('click',{target:{closest:()=>({dataset:{action:'cell',x,y},disabled:false})}});
    await f.click('height-mode');await cell(7,7);assert.equal(f.c.state().board.heights.length,2);assert(!E.isBlocked(f.c.state(),{x:7,y:7}));await f.click('erase-mode');await cell(6,6);assert.equal(f.c.state().board.ladders.length,0);await f.click('block-mode');await cell(6,5);assert.equal(E.heightAt(f.c.state(),{x:6,y:5}),0);assert.equal(E.heightAt(f.c.state(),{x:7,y:7}),1);assert(E.isBlocked(f.c.state(),{x:6,y:5}));f.ui.destroy();
});
test('Reset dialog previews its scope and retains the encounter until the user submits',async()=>{
    const f=fixture('en'),before=E.clone(f.c.state());await f.click('reset');const d=f.editor();assert.match(d.innerHTML,/Companion|companion/);assert.deepEqual(f.c.state(),before);const form=d.querySelector('form');form.elements.scope={value:'map'};await submit(d);assert.equal(f.c.state().actors.length,before.actors.length);assert(f.c.state().actors.every(a=>a.position===null));await f.c.undo();assert.deepEqual(f.c.state().board,before.board);f.ui.destroy();
});
test('Free remark checkbox permits narration without spending movement or action',async()=>{
    const f=fixture('en');await f.c.start(false);const before=E.clone(f.c.state());await f.ui.root.emit('change',{target:{name:'freeRemark',checked:true}});assert.match(f.ui.root.innerHTML,/Free remark without mechanical effects/);await f.ui.root.emit('input',{target:{name:'otherDescription',value:'Hold!'}});await f.click('other');assert.deepEqual(f.c.state().action,before.action);assert.deepEqual(f.c.state().movement,before.movement);assert.equal(f.c.state().log.at(-1).type,'remark');f.ui.destroy();
});
test('Rules expose decimal guidance, stance options and critical modes without German leftovers',async()=>{
    const f=fixture('en');await f.click('tab-rules');assert.match(f.ui.root.innerHTML,/D&amp;D scores: e.g. 14 gives \+2/);assert.match(f.ui.root.innerHTML,/Double maximum damage/);assert.match(f.ui.root.innerHTML,/two decimal places/);assert.match(f.ui.root.innerHTML,/Perception increases ranged reach/);assert(!f.ui.root.innerHTML.includes('Nachkommastellen'));f.ui.destroy();
});

test('Tactical badge pause follows Abilities independently of the normal status module',async()=>{
    const f=fixture('en'),a=f.c.state().actors[0];await f.c.edit(a.id,{skills:[{...skillPreset('aim','en'),id:'aim'}]});await f.c.start(false);await f.c.act({type:'skill',actor:a.id,target:a.id,skill:'aim'});await f.c.rules({effectsEnabled:false});assert(!f.ui.root.innerHTML.includes('Aimed · 1 own turns · paused'));await f.c.rules({skillsEnabled:false});assert(f.ui.root.innerHTML.includes('Aimed · 1 own turns · paused'));f.ui.destroy();
});

test('Weapon list editor is discoverable and saves a third named attack with its own stock atomically', async()=>{
    const f=fixture('en'), a=f.c.state().actors[0];assert.match(f.ui.root.innerHTML,/Weapon list/);
    await f.click('weapons',a.id);const d=f.editor();assert.match(d.innerHTML,/Ammo \/ charges/);assert.match(d.innerHTML,/Unlimited \/ no consumption/);
    const values=new Map([['preferredWeapon',a.weaponList[0].id]]);
    a.weaponList.forEach((w,i)=>{const p='weapon-'+i;for(const [n,v] of Object.entries({name:w.name,mode:w.mode,range:w.range,hit:w.attackBonus,damage:w.damage,bonus:w.damageBonus,radius:w.radius,standardDamage:'',standardBonus:0}))values.set(p+'-'+n,String(v)); values.set(p+'-stock-resource',i===0?'__own__':'');values.set(p+'-stock-quantity','6');values.set(p+'-stock-stockName','Charges');});
    globalThis.FormData=class {constructor(){return values;}};
    assert.equal(await submit(d),undefined);assert.equal(f.c.state().actors[0].resources[0].quantity,6);assert.equal(f.c.state().actors[0].weaponList[0].resource,f.c.state().actors[0].resources[0].id);assert.equal(f.c.historyLength(),1);f.ui.destroy();
});
test('Restricted action editor saves selected kinds, and cancel leaves budgets unchanged',async()=>{
    const f=fixture('en'),a=f.c.state().actors[0];await f.click('actions',a.id);let d=f.editor();assert.match(d.innerHTML,/Normal actions per turn/);d.close();assert.equal(f.c.historyLength(),0);
    await f.c.edit(a.id,{bonusActions:[{id:'medic',name:'Medic',count:1,allowed:['use']}]});await f.click('actions',a.id);d=f.editor();
    const values=new Map([['actionsPerTurn','3'],['pool-0-name','Medic'],['pool-0-count','2'],['pool-0-use','on']]);globalThis.FormData=class{constructor(){return values;}};
    assert.equal(await submit(d),undefined);assert.equal(f.c.state().actors[0].actionsPerTurn,3);assert.deepEqual(f.c.state().actors[0].bonusActions[0].allowed,['use']);f.ui.destroy();
});
test('Multiple-action status shows counts and disables attack for a remaining healing-only pool',async()=>{
    const f=fixture('en');const a=f.c.state().actors[0];await f.c.rules({multiActionsEnabled:true,splitMovement:true});await f.c.edit(a.id,{bonusActions:[{id:'heal',name:'Medic',count:1,allowed:['use']}]});await f.c.start(false);
    await f.c.act({type:'other',actor:a.id});assert.match(f.ui.root.innerHTML,/Normal actions: 0\/1/);assert.match(f.ui.root.innerHTML,/Medic: 1\/1/);
    assert.match(f.ui.root.innerHTML,/data-action="attack" disabled/);f.ui.destroy();
});
test('Named weapon selection sends its exact ID and range independently of the first ranged profile',async()=>{
    const f=fixture('en'),a=f.c.state().actors[0];await f.c.edit(a.id,{weaponList:[...a.weaponList,{id:'fire',name:'Fire bolt',mode:'ranged',range:8,damage:'1d12',damageBonus:2}]});await f.c.start(false);
    await f.ui.root.emit('change',{target:{name:'weapon',value:'fire'}});assert.match(f.ui.root.innerHTML,/Fire bolt/);assert.match(f.ui.root.innerHTML,/value="1d12"/);
    await f.click('attack');const r=f.c.state().log.findLast(e=>e.type==='hit'||e.type==='miss');assert.equal(r.details.weapon,'fire');assert.equal(r.details.mode,'ranged');f.ui.destroy();
});
test('Height brush and two-click ladder editor preserve independent cover and create a real link',async()=>{
    const f=fixture('en');await f.c.board({blocked:[],cover:[{x:7,y:2}]});await f.click('height-mode');
    const cell=(x,y)=>f.ui.root.emit('click',{target:{closest:()=>({dataset:{action:'cell',x,y},disabled:false})}});
    await cell(6,2);assert.equal(f.c.state().board.heights.length,1);assert.equal(f.c.state().board.cover.length,1);assert.match(f.ui.root.innerHTML,/ct-height-mark/);
    await f.click('ladder-mode');await cell(6,1);await cell(6,2);assert.deepEqual(f.c.state().board.ladders,[{from:{x:6,y:1},to:{x:6,y:2}}]);
    await cell(6,1);await cell(6,2);assert.equal(f.c.state().board.ladders.length,0);f.ui.destroy();
});
test('Go to cover is available under other actions and spends no main action',async()=>{
    const f=fixture('en');await f.c.board({blocked:[],cover:[{x:3,y:1}]});await f.c.move(f.c.state().actors[0].id,{x:1,y:4},true);await f.c.move(f.c.state().actors[2].id,{x:6,y:1},true);await f.c.start(false);
    await f.ui.root.emit('change',{target:{name:'otherKind',value:'cover'}});assert.match(f.ui.root.innerHTML,/Go to cover/);assert.match(f.ui.root.innerHTML,/Does not consume an action/);
    await f.click('go-cover');assert(!E.actionBudget(f.c.state()).used);assert(E.movementBudget(f.c.state(),E.currentActor(f.c.state())).spent>0);f.ui.destroy();
});

test('Portrait upload is staged until Save and appears on board and participant list', async () => {
    const h = fixture(), a = h.c.state().actors[0]; await h.click('edit', a.id); const d = h.editor(); actorForm(a);
    assert.match(d.innerHTML, /Figurenbild/); await upload(d); assert.equal(h.c.state().actors[0].portrait, null); assert.match(d.querySelector('[data-image-preview]').innerHTML, /data:image\/png/);
    assert.equal(await submit(d), undefined); assert(h.c.state().actors[0].portrait); assert.match(h.ui.root.innerHTML, /ct-token ct-player[^>]*><img/);
    await h.click('tab-actors'); assert.match(h.ui.root.innerHTML, /ct-avatar ct-player[^>]*><img/); h.ui.destroy();
});
test('Cancel discards a staged portrait and its file data', async () => {
    const h = fixture(); await h.click('edit', h.c.state().actors[0].id); const d = h.editor(); await upload(d); d.close();
    assert.equal(h.c.state().actors[0].portrait, null); assert.equal(Object.keys(h.chats.a.images ?? {}).length, 0); h.ui.destroy();
});
test('Removing a portrait is also staged until Save and can be undone', async () => {
    const h = fixture(), a = h.c.state().actors[0]; await h.c.edit(a.id, { portraitImage: { kind: 'portrait', width: 1, height: 1, src: png } }); const id = h.c.state().actors[0].portrait;
    await h.click('edit', a.id); const d = h.editor(); actorForm(a); await d.querySelector('[data-image-remove]').emit('click', {});
    assert.equal(h.c.state().actors[0].portrait, id); assert.equal(await submit(d), undefined); assert.equal(h.c.state().actors[0].portrait, null); await h.c.undo(); assert.equal(h.c.state().actors[0].portrait, id); h.ui.destroy();
});
test('Companion library uses the saved portrait after the original actor is removed', async () => {
    const h = fixture(), a = h.c.state().actors[0]; await h.c.edit(a.id, { portraitImage: { kind: 'portrait', width: 1, height: 1, src: png } }); await h.c.saveTemplate(a.id); await h.c.remove(a.id); await h.click('tab-library');
    assert.match(h.ui.root.innerHTML, /ct-avatar ct-player[^>]*><img/); h.ui.destroy();
});
test('Map image editor previews alignment and saves without a combat action', async () => {
    const h = fixture(), before = E.clone(h.c.state()); await h.click('map-background'); const d = h.editor();
    await upload(d); const form = d.querySelector('form'); form.elements.scale.value = '160'; form.elements.x.value = '20'; form.elements.y.value = '-10';
    await form.emit('input', { target: { type: 'number' } }); assert.match(d.querySelector('[data-map-preview]').innerHTML, /ct-map-image/);
    assert.equal(await submit(d), undefined); assert.equal(h.c.state().board.background.scale, 160); assert.equal(h.c.state().board.background.x, 20);
    assert.match(h.ui.root.innerHTML, /ct-with-background/); assert.deepEqual(h.c.state().actors, before.actors); assert.deepEqual(h.c.state().rng, before.rng); assert.equal(h.c.state().turnSerial, before.turnSerial); h.ui.destroy();
});
test('Removing a map image stays removed during further preview changes', async () => {
    const h = fixture(); await h.c.background({ image: { kind: 'background', width: 1, height: 1, src: png } }); await h.click('map-background'); const d = h.editor();
    await d.querySelector('[data-image-remove]').emit('click', {}); await d.querySelector('form').emit('input', { target: { type: 'range' } });
    assert(!d.querySelector('[data-map-preview]').innerHTML.includes('ct-map-image')); assert.equal(await submit(d), undefined); assert.equal(h.c.state().board.background, null); h.ui.destroy();
});
test('An open actor editor cannot save its staged portrait into a switched chat', async () => {
    const h = fixture(), a = h.c.state().actors[0]; await h.click('edit', a.id); const d = h.editor(); actorForm(a); await upload(d); h.switch('b');
    assert.match(await submit(d), /Chat wurde gewechselt/); assert(!h.c.state().actors.some(a => a.portrait)); h.ui.destroy();
});
test('Zoom buttons, fit and slider update only the saved display', async () => {
    const h = fixture(); await h.c.start(false); const before = E.clone(h.c.state()); await h.click('zoom-out'); assert.equal(h.c.view().zoom, 36);
    await h.click('zoom-in'); assert.equal(h.c.view().zoom, 44); await h.c.board({ width: 50, height: 50 }); const big = E.clone(h.c.state());
    h.ui.root.boardWidth = 320; await h.click('zoom-fit'); assert.equal(h.c.view().fit, true); assert(h.c.view().zoom <= 4);
    assert.match(h.ui.root.innerHTML, /ct-zoom-small/); assert.deepEqual(h.c.state(), big);
    await h.ui.root.emit('change', { target: { name: 'zoom', value: '72' } }); assert.deepEqual(h.c.view(), { zoom: 72, fit: false });
    await h.click('zoom-reset'); assert.equal(h.c.view().zoom, 44); assert.equal(h.c.state().turnSerial, before.turnSerial); assert.deepEqual(h.c.state().rng, before.rng); h.ui.destroy();
});
test('English image and zoom controls have complete translations', async () => {
    const h = fixture('en'); assert.match(h.ui.root.innerHTML, /Map image/); assert.match(h.ui.root.innerHTML, /Fit board/); await h.click('map-background'); const d = h.editor();
    for (const label of ['Map background', 'Choose image', 'Show map image', 'Image scale (%)', 'Grid opacity (%)', 'Center image']) assert(d.innerHTML.includes(label), label);
    await upload(d); assert.equal(d.querySelector('[data-image-status]').textContent, 'Image ready. Save to apply.'); d.close();
    await h.click('edit', h.c.state().actors[0].id); assert.match(h.editor().innerHTML, /<span>Portrait<\/span>/); h.ui.destroy();
});

function supplyForm(resources = [], effects = []) {
    const values = new Map();
    for (const [i, v] of resources.entries()) {
        for (const k of ['name', 'quantity', 'heal', 'range']) values.set(`resource-${i}-${k}`, String(v[k]));
        for (const k of v.cures ?? []) values.set(`resource-${i}-cure-${k}`, 'on');
    }
    for (const [type, definition] of Object.entries(EFFECTS)) {
        const v = effects.find(v => v.type === type) ?? definition;
        values.set(`actor-effect-${type}-turns`, String(v.turns)); values.set(`actor-effect-${type}-damage`, v.damage);
        if (effects.some(v => v.type === type)) values.set(`actor-effect-${type}`, 'on');
    }
    globalThis.FormData = class { constructor() { return values; } }; return values;
}
async function preset(d, type) { await d.querySelector('form').emit('click', { target: { closest: () => ({ dataset: { resourcePreset: type } }) } }); }

test('Resource presets and edits are staged until Save, and inventory changes can be undone', async () => {
    const h = fixture(), a = h.c.state().actors[0]; await h.click('supplies', a.id); const first = h.editor(); supplyForm();
    await preset(first, 'healing'); const d = h.editor(); assert.equal(d,first); assert(!first.removed); assert.match(d.querySelector('[data-resource-entries]').innerHTML, /resource-0-quantity/);
    assert.equal(h.c.state().actors[0].resources.length, 0);
    supplyForm([{ ...resourcePreset('healing'), name: 'Healing spell', quantity: 2, heal: '2d6+1', range: 5 }]);
    assert.equal(await submit(d), undefined); const saved = h.c.state().actors[0].resources[0];
    assert.equal(saved.name, 'Healing spell'); assert.equal(saved.quantity, 2); assert.equal(saved.heal, '2d6+1'); assert.equal(saved.range, 5);
    await h.c.undo(); assert.equal(h.c.state().actors[0].resources.length, 0); h.ui.destroy();
});

test('Cancelling a resource/status editor preserves the saved inventory and status duration', async () => {
    const h = fixture(), a = h.c.state().actors[0]; await h.c.edit(a.id, { effects: [{ type: 'poisoned', turns: 2 }] });
    await h.click('supplies', a.id); supplyForm([], []); await preset(h.editor(), 'antidote'); h.editor().close();
    assert.equal(h.c.state().actors[0].resources.length, 0); assert.equal(h.c.state().actors[0].effects[0].turns, 2); h.ui.destroy();
});

test('Healing controls consume a unit and action, update the latest result, and disable a second use', async () => {
    const h = fixture(), a = h.c.state().actors[0];
    await h.c.edit(a.id, { hp: 10, resources: [{ ...resourcePreset('healing'), heal: '5' }] }); await h.c.rules({ splitMovement: true }); await h.c.start(false);
    await h.ui.root.emit('change', { target: { name: 'otherKind', value: 'heal' } });
    assert(h.ui.root.innerHTML.includes('Behandlungsziel')); await h.click('use-resource');
    assert.equal(h.c.state().actors[0].hp, 15); assert.equal(h.c.state().actors[0].resources[0].quantity, 2); assert(E.actionBudget(h.c.state()).used);
    assert.match(h.ui.root.innerHTML, /Behandlung/); assert.match(h.ui.root.innerHTML, /data-action="use-resource" disabled/); h.ui.destroy();
});

test('English treatment, status and weapon controls remain entirely in English', async () => {
    const h = fixture('en'), a = h.c.state().actors[0]; await h.c.edit(a.id, { hp: 10, resources: [resourcePreset('healing', 'en')], effects: [{ type: 'poisoned', turns: 2 }] });
    await h.c.start(false); await h.ui.root.emit('change', { target: { name: 'otherKind', value: 'heal' } });
    assert(h.ui.root.innerHTML.includes('Treatment target')); assert(h.ui.root.innerHTML.includes('removes none')); assert(h.ui.root.innerHTML.includes('Poisoned · 2 own turns'));
    await h.click('supplies', a.id); const d = h.editor();
    for (const text of ['Resources &amp; statuses', 'Own turns', 'Damage per turn', 'Damage over time', 'Poisoned', 'Stunned', 'Slowed', 'Removes:']) assert(d.innerHTML.includes(text), text);
    assert(!/Vergiftet|Brennend|Verlangsamt|Einheiten/.test(d.innerHTML)); d.close(); await h.click('edit', a.id);
    assert.match(h.editor().innerHTML, /On-hit effects & consumption/); assert.match(h.editor().innerHTML, /Ammo \/ charges/); h.ui.destroy();
});

test('Weapon editor saves its own consumption link and configurable hit effects', async () => {
    const h = fixture(), a = h.c.state().actors[0], arrows = resourcePreset('ammo'); await h.c.edit(a.id, { resources: [arrows] });
    await h.click('edit', a.id); const values = actorForm(h.c.state().actors[0]);
    for (const mode of ['melee', 'ranged']) for (const [type, definition] of Object.entries(EFFECTS)) {
        values.set(`${mode}-effect-${type}-turns`, String(definition.turns)); values.set(`${mode}-effect-${type}-damage`, definition.damage);
    }
    values.set('rangedResource', arrows.id); values.set('ranged-effect-burning', 'on'); values.set('ranged-effect-burning-turns', '4'); values.set('ranged-effect-burning-damage', '1d4');
    assert.equal(await submit(h.editor()), undefined); const weapon = h.c.state().actors[0].weapons.ranged;
    assert.equal(weapon.resource, arrows.id); assert.deepEqual(weapon.effects, [{ type: 'burning', turns: 4, damage: '1d4' }]); assert.equal(h.c.state().actors[0].weapons.melee.effects.length, 0); h.ui.destroy();
});

test('Invalid inventory and deleting linked ammo show an error without a partial save', async () => {
    const h = fixture(), a = h.c.state().actors[0], item = resourcePreset('ammo'); await h.c.edit(a.id, { resources: [item], weapons: { ...a.weapons, ranged: { ...a.weapons.ranged, resource: item.id } } });
    await h.click('supplies', a.id); supplyForm([{ ...item, quantity: -1 }]); assert.match(await submit(h.editor()), /ungültige Zahl/); assert.equal(h.c.state().actors[0].resources[0].quantity, 10);
    supplyForm([item]); await h.editor().querySelector('form').emit('click', { target: { closest: () => ({ dataset: { resourceRemove: '0' } }) } });
    supplyForm(); assert.match(await submit(h.editor()), /Waffenressource fehlt/); assert.equal(h.c.state().actors[0].resources.length, 1); h.ui.destroy();
});

test('A staged supply editor cannot write into another chat', async () => {
    const h = fixture(), a = h.c.state().actors[0]; await h.click('supplies', a.id); supplyForm(); await preset(h.editor(), 'healing');
    const d = h.editor(); supplyForm([resourcePreset('healing')]); h.switch('b');
    assert.match(await submit(d), /Chat wurde gewechselt/); assert(h.c.state().actors.every(a => !a.resources.length)); h.ui.destroy();
});

test('Every participant appears below the map and the current actor moves to the first overview card', async () => {
    const h = fixture(); await h.c.start(false);
    let html = h.ui.root.innerHTML, roster = html.slice(html.indexOf('ct-board-roster'), html.indexOf('<aside class="ct-sidebar">'));
    assert(html.indexOf('ct-board-roster') > html.indexOf('ct-board-scroll')); assert(roster.includes('Arin') && roster.includes('Lyra') && roster.includes('Goblin') && roster.includes('Warg'));
    assert(roster.indexOf('Arin') < roster.indexOf('Lyra')); await h.c.endTurn(); html = h.ui.root.innerHTML;
    roster = html.slice(html.indexOf('ct-board-roster'), html.indexOf('<aside class="ct-sidebar">'));
    assert(roster.indexOf('Lyra') < roster.indexOf('Arin')); assert(roster.includes('ct-roster-current')); assert(!html.slice(html.indexOf('<aside class="ct-sidebar">')).includes('ct-roster-card'));
    await h.click('select', h.c.state().actors[2].id); assert(h.ui.root.innerHTML.includes('ct-roster-selected')); h.ui.destroy();
});

test('Status symbols appear on the token and readable status badges in the overview', async () => {
    const h = fixture(); await h.c.edit(h.c.state().actors[0].id, { effects: [{ type: 'burning', turns: 2 }, { type: 'poisoned', turns: 3 }] });
    assert(h.ui.root.innerHTML.includes('ct-status-markers')); assert(h.ui.root.innerHTML.includes('ct-effect-burning')); assert(h.ui.root.innerHTML.includes('Brennend · 2 eigene Züge')); h.ui.destroy();
});

test('English map library, sounds, roster and cancellation controls are localized', async () => {
    const h = fixture('en'); assert(h.ui.root.innerHTML.includes('Map library')); assert(h.ui.root.innerHTML.includes('Participant overview'));
    await h.click('tab-settings'); for (const text of ['Combat sounds enabled', 'Volume (%)', 'Test sound']) assert(h.ui.root.innerHTML.includes(text), text);
    await h.click('maps'); const d = h.editor(); assert(d.innerHTML.includes('Map library')); assert(d.innerHTML.includes('Save current map as')); assert(!d.innerHTML.includes('Kartenbibliothek')); h.ui.destroy();
});

test('Cancel request remains accessible while a proposal promise never returns and unlocks the UI', async () => {
    let h; const gate = createModelRequests({ changed: () => h?.c.refresh() });
    h = fixture('de', { propose: () => gate.run(() => new Promise(() => {})), modelBusy: () => Boolean(gate.current()), requestBusy: () => Boolean(gate.current()), cancelRequest: () => gate.cancel(new Error('cancelled')) });
    await h.c.edit(h.c.state().actors[0].id, { control: 'dm' }); await h.c.start(false);
    const waiting = h.click('propose'); await new Promise(resolve => setTimeout(resolve, 0)); assert(h.ui.root.innerHTML.includes('data-action="cancel-request"'));
    await h.click('cancel-request'); await waiting; assert.equal(h.c.modelBusy(), false); assert(h.ui.root.innerHTML.includes('cancelled')); assert(!h.ui.root.innerHTML.includes('data-action="cancel-request"')); h.ui.destroy();
});

test('Map dialog saves a named place without changing combat and loads it outside combat', async () => {
    const h = fixture(), before = h.c.export(); await h.click('maps'); const d = h.editor(), form = d.querySelector('form'); form.elements.name = { value: 'Tavern Grün' };
    assert.equal(await submit(d), undefined); assert.equal(h.c.maps().length, 1); assert.deepEqual(h.c.export(), before);
    let downloaded, payload; const create = document.createElement, timeout = globalThis.setTimeout;
    document.createElement = tag => { const e = create(tag); if (tag === 'a') e.click = () => { downloaded = e.download; }; return e; };
    URL.createObjectURL = blob => { payload = blob; return 'blob:test'; };
    globalThis.setTimeout = fn => { fn(); return 0; };
    try { await h.editor().querySelector('form').emit('click', { target: { closest: () => ({ disabled: false, dataset: { mapAction: 'export', id: h.c.maps()[0].id } }) } }); }
    finally { document.createElement = create; globalThis.setTimeout = timeout; }
    assert.equal(downloaded, 'Tavern Grün.json'); assert.equal(JSON.parse(await payload.text()).name, 'Tavern Grün');
    await h.c.start(false); await h.click('maps');
    assert(h.editor().innerHTML.includes('Kartenladen gesperrt: Es läuft gerade ein Kampf.'));
    assert.match(h.editor().innerHTML, /data-map-action="load"[^>]*disabled aria-describedby="ct-map-load-reason"/);
    await h.c.stop(); await h.click('maps'); const next = h.editor(), list = next.querySelector('form'); list.elements.keepPositions = { checked: false };
    assert(!next.innerHTML.includes('id="ct-map-load-reason"'));
    await list.emit('click', { target: { closest: () => ({ disabled: false, dataset: { mapAction: 'load', id: h.c.maps()[0].id } }) } });
    assert(h.c.state().actors.every(a => !a.position)); assert.equal(h.c.state().actors.length, 4); h.ui.destroy();
});

test('Other actions are visible outside the manual attack fold with healing, stabilize, flee and custom description', async () => {
    const h = fixture('en'); await h.c.edit(h.c.state().actors[0].id, { control: 'basic' }); await h.c.start(false);
    const html = h.ui.root.innerHTML, section = html.slice(html.indexOf('ct-other-actions'));
    for (const text of ['Other actions', 'Choose action', 'Describe your own action', 'Heal / remedy', 'Stabilize', 'Flee']) assert(section.includes(text), text);
    assert(html.includes('Manual action')); assert(section.includes('name="otherDescription"'));
    await h.ui.root.emit('change', { target: { name: 'otherKind', value: 'stabilize' } }); assert(h.ui.root.innerHTML.includes('No unconscious participant available'));
    await h.ui.root.emit('change', { target: { name: 'otherKind', value: 'flee' } }); assert(h.ui.root.innerHTML.includes('data-action="flee" disabled')); h.ui.destroy();
});

test('Custom description consumes the action and is recorded without inventing numeric effects', async () => {
    const h = fixture(); await h.c.rules({ splitMovement: true }); await h.c.start(false); const hp = h.c.state().actors.map(a => a.hp);
    await h.ui.root.emit('input', { target: { name: 'otherDescription', value: 'I distract the raider.' } }); await h.click('other');
    assert.deepEqual(h.c.state().actors.map(a => a.hp), hp); assert(E.actionBudget(h.c.state()).used); assert.equal(h.c.state().log.at(-1).details.description, 'I distract the raider.'); h.ui.destroy();
});

test('Attack mode stays visible outside the manual fold and empty ranged ammo does not disable melee', async () => {
    const h = fixture(), a = h.c.state().actors[0]; await h.c.edit(a.id, { control: 'basic', attackMode: 'ranged', resources: [{ id: 'arrows', name: 'Arrows', kind: 'ammo', quantity: 0 }], weapons: { melee: { damage: '1d4' }, ranged: { damage: '1d6', resource: 'arrows', standard: { damage: '1d6', resource: 'arrows' } } } });
    await h.c.start(false); let html = h.ui.root.innerHTML; assert(html.indexOf('name="mode"') < html.indexOf('Manuelle Aktion')); assert(html.includes('data-action="attack" disabled'));
    await h.ui.root.emit('change', { target: { name: 'mode', value: 'melee' } }); html = h.ui.root.innerHTML;
    assert(!html.includes('data-action="attack" disabled')); await h.click('attack'); assert.equal(h.c.state().log.findLast(v => ['hit', 'miss'].includes(v.type)).details.mode, 'melee'); h.ui.destroy();
});

test('Standard-ammo and special-ammo editor settings save separately', async () => {
    const h = fixture(), a = h.c.state().actors[0], arrows = { ...resourcePreset('ammo'), id: 'normal', name: 'Normal arrows' };
    await h.c.edit(a.id, { resources: [arrows] }); await h.click('edit', a.id); const values = actorForm(h.c.state().actors[0]);
    values.set('rangedStandardDamage', '1d4'); values.set('rangedStandardBonus', '2'); values.set('rangedStandardResource', arrows.id);
    assert.equal(await submit(h.editor()), undefined); const standard = h.c.state().actors[0].weapons.ranged.standard;
    assert.equal(standard.damage, '1d4'); assert.equal(standard.resource, arrows.id); assert.equal(standard.damageBonus, 2); assert.equal(standard.radius, 0); assert.equal(standard.effects.length, 0); h.ui.destroy();
});


test('1.9.1 direct profile actions and German stat names are discoverable',async()=>{
    const f=fixture('de');assert.match(f.ui.root.innerHTML,/Figuren importieren/);assert.match(f.ui.root.innerHTML,/Karte zurücksetzen/);await f.click('tab-actors');assert.match(f.ui.root.innerHTML,/Als Vorlage speichern/);assert.match(f.ui.root.innerHTML,/data-action="export-actor"/);await f.click('edit',f.c.state().actors[0].id);assert.match(f.editor().innerHTML,/Stärke/);assert.match(f.editor().innerHTML,/Geschicklichkeit/);assert.match(f.editor().innerHTML,/Wahrnehmung/);assert(!f.editor().innerHTML.includes('>Strength<'));f.ui.destroy();
});
test('1.9.1 each editor exposes correctly named transfer controls',async()=>{
    const f=fixture('en'),id=f.c.state().actors[0].id;for(const action of ['weapons','skills','actions','supplies']){await f.click(action,id);const html=f.editor().innerHTML;assert.match(html,/data-profile-direction="import"/);assert.match(html,/data-profile-direction="export"/);assert.match(html,/Apply changes/);if(action==='supplies'){assert.match(html,/Current statuses/);assert.match(html,/data-profile-kind="resources"/);}}f.ui.destroy();
});
test('1.9.1 selecting a placed actor opens an inert target menu',async()=>{
    const f=fixture('en');await f.c.start(false);const before=E.clone(f.c.state()),b=f.c.state().actors[2];await f.click('select',b.id);const d=f.editor();assert.match(d.innerHTML,/Use participant as target/);assert.match(d.innerHTML,/Actions of the current actor/);assert.match(d.innerHTML,/Attacks/);assert.deepEqual(f.c.state(),before);await d.querySelector('form').emit('click',{target:{closest:s=>s==='[data-context-target]'?{}:null}});assert.deepEqual(f.c.state(),before);assert.equal(d.open,false);f.ui.destroy();
});
test('1.9.1 target menu prepares an attack without rolling',async()=>{
    const f=fixture('en');await f.c.start(false);const b=f.c.state().actors[2],before=E.clone(f.c.state());await f.click('select',b.id);const d=f.editor();await d.querySelector('form').emit('click',{target:{closest:s=>s==='[data-context-entry]'?{dataset:{contextEntry:'0'},disabled:false}:null}});assert.equal(d.open,false);assert.deepEqual(f.c.state(),before);assert.match(f.ui.root.innerHTML,/ct-action-form/);f.ui.destroy();
});
test('1.9.1 roster drag follows the existing placement rules',async()=>{
    const f=fixture('en'),a=f.c.state().actors[0];await f.c.move(a.id,null,true);const transfer={value:'',setData(_type,v){this.value=v;},getData(){return this.value;}};let prevented=false;
    await f.ui.root.emit('dragstart',{target:{closest:()=>({dataset:{id:a.id,dragActor:'true'}})},dataTransfer:transfer,preventDefault(){prevented=true;}});assert.equal(transfer.value,a.id);assert.equal(prevented,false);
    await f.ui.root.emit('drop',{target:{closest:()=>({dataset:{x:'7',y:'7'}})},dataTransfer:transfer,preventDefault(){}});await new Promise(resolve=>setTimeout(resolve,0));assert.deepEqual(f.c.state().actors[0].position,{x:7,y:7});f.ui.destroy();
});
test('1.9.1 invalid imported file is reported and logged without changing state',async()=>{
    const f=fixture('en'),before=E.clone(f.c.state());await f.click('profiles-actors');const d=f.editor();await d.querySelector('[data-profile-file]').emit('change',{target:{files:[{size:100,text:async()=>'{bad json'}]}});assert(d.querySelector('.ct-editor-error').textContent);assert(f.c.debugEntries().some(v=>v.type==='error'));assert.deepEqual(f.c.state(),before);f.ui.destroy();
});

test('1914 all off-board participants show their own last location; selecting a reserve never replaces the current actor',async()=>{
    const f=fixture('en');await f.c.start(false);const [a,b]=f.c.state().actors,positions=[a.position,b.position].map(p=>E.clone(p));
    await f.c.reserve(a.id);await f.c.reserve(b.id);const active=E.currentActor(f.c.state())?.id;
    for(const [i,v] of [a,b].entries()){const card=f.ui.root.innerHTML.split('data-reserve-id="'+v.id+'"')[1].split('</article>')[0];assert(card.includes(v.name));assert(card.includes('Last position: '+E.coordinate(positions[i])));assert(card.includes('Deploy / place'));}
    await f.click('select',a.id);assert.equal(E.currentActor(f.c.state())?.id,active);assert(f.ui.root.innerHTML.includes('ct-reserve-card ct-roster-selected" data-reserve-id="'+a.id+'"'));
    await f.click('place-actor',b.id);await f.ui.root.emit('click',{target:{closest:()=>({dataset:{action:'cell',x:'8',y:'8'},disabled:false})}});const d=f.editor(),form=d.querySelector('form');form.elements.joinTiming={value:'next'};await submit(d);
    assert.deepEqual(f.c.state().actors.find(v=>v.id===b.id).position,{x:8,y:8});assert.equal(f.c.state().actors.find(v=>v.id===a.id).position,null);assert.equal(E.currentActor(f.c.state())?.id,active);f.ui.destroy();
});
test('1914 management buttons are available on unselected cards and do not delete companion templates',async()=>{
    const f=fixture('en'),a=f.c.state().actors[1];await f.c.saveTemplate(a.id);const count=f.c.library().length;
    const html=f.ui.root.innerHTML.split('data-action="select" data-id="'+a.id+'"')[1];assert(html.includes('data-action="unplace"'));assert(html.includes('Delete from encounter: '+a.name));await f.click('remove',a.id);assert(!f.c.state().actors.some(v=>v.id===a.id));assert.equal(f.c.library().length,count);await f.c.undo();assert(f.c.state().actors.some(v=>v.id===a.id));f.ui.destroy();
});
test('1914 actor list has one return control for an escaped participant and returns that exact profile',async()=>{
    const f=fixture('en'),a=f.c.state().actors[1];await f.c.edit(a.id,{escaped:true,position:null});await f.click('tab-actors');assert.equal(f.ui.root.innerHTML.split('data-action="return-actor"').length-1,1);await f.click('return-actor',a.id);assert.equal(f.c.state().actors.find(v=>v.id===a.id).escaped,false);assert.equal(f.c.state().actors.find(v=>v.id===a.id).hp,a.hp);f.ui.destroy();
});
test('1914 rule search keeps drafts and query separate for each chat, and Save still applies staged values',async()=>{
    const f=fixture('en');await f.click('tab-rules');const original=f.c.state().rules.movementBase;
    await f.ui.root.emit('input',{target:{name:'movementBase',value:'7',closest:s=>s==='#ct-rules-form'?{}:null}});
    await f.ui.root.emit('input',{target:{name:'rulesSearch',value:'mana'}});assert.equal(f.c.state().rules.movementBase,original);
    f.switch('b');await f.click('tab-rules');assert(!f.ui.root.innerHTML.includes('name="rulesSearch" value="mana"'));f.switch('a');await f.click('tab-rules');assert(f.ui.root.innerHTML.includes('name="rulesSearch" value="mana"'));
    await f.click('save-rules');assert.equal(f.c.state().rules.movementBase,7);await f.click('clear-rule-search');assert.equal(f.c.state().rules.movementBase,7);f.ui.destroy();
});
test('1914 range boundary follows the chosen weapon plus Perception and vanishes when board checks are disabled',async()=>{
    const f=fixture('en'),a=f.c.state().actors[0];await f.c.edit(a.id,{stats:{...a.stats,perception:16},weaponList:[{id:'short',mode:'ranged',damage:'1d4',range:2},{id:'long',mode:'ranged',damage:'1d4',range:5}],preferredWeapon:'short'});await f.c.rules({perceptionRange:true});await f.c.start(false);
    assert.match(f.ui.root.innerHTML,/Cyan: ranged reach 5 cells/);assert.match(f.ui.root.innerHTML,/ct-range-edge ct-range-/);await f.ui.root.emit('change',{target:{name:'weapon',value:'long'}});assert.match(f.ui.root.innerHTML,/Cyan: ranged reach 8 cells/);
    await f.c.rules({boardEnabled:false});assert(!f.ui.root.innerHTML.includes('class="ct-range-edge '));f.ui.destroy();
});
test('1.9.1 resource file can be applied to multiple selected figures',async()=>{
    const f=fixture('en'),ids=f.c.state().actors.slice(0,2).map(a=>a.id);await f.click('profiles-actors');const d=f.editor(),form=d.querySelector('form');form.elements.profileKind={value:'resources'};form.elements.actor={value:ids[0]};form.elements.importMode={value:'append'};form.querySelectorAll=s=>s==='[name="recipient"]:checked'?ids.map(value=>({value})):[];
    await d.querySelector('[data-profile-file]').emit('change',{target:{files:[{size:100,text:async()=>JSON.stringify({kind:'combat-resources',version:1,resources:[{id:'heal',name:'Test healing',quantity:3,heal:'1d6'}]})}]}});assert.match(d.querySelector('[data-profile-preview]').textContent,/Test healing/);assert.equal(await submit(d),undefined);assert(f.c.state().actors.slice(0,2).every(a=>a.resources.some(r=>r.name==='Test healing')));assert.notEqual(f.c.state().actors[0].resources.at(-1).id,f.c.state().actors[1].resources.at(-1).id);f.ui.destroy();
});
test('1.9.1 debug remains accessible while a model request is busy',async()=>{
    const f=fixture('en',{modelBusy:()=>true});await f.click('debug');assert.match(f.editor().innerHTML,/Export error log/);assert.match(f.editor().innerHTML,/readonly/);f.ui.destroy();
});
test('1.9.4 abilities in the participant editor retain other unsaved fields and save atomically',async()=>{
    const f=fixture('en'),a=E.clone(f.c.state().actors[0]);await f.click('edit',a.id);const d=f.editor(),values=actorForm(a),host=d.querySelector('[data-actor-skills]');
    values.set('name','Updated wizard');values.set('hp','12');values.set('dc','13,5');values.set('notes','Keep my draft');
    await host.emit('click',{target:{closest:()=>({dataset:{skillAdd:'aim'}})}});assert.match(host.innerHTML,/data-skill-remove="0"/);assert.equal(f.c.historyLength(),0);
    for(const [k,v] of Object.entries({name:'Careful aim',stat:'perception',range:'0',dc:'15',bonus:'1,5',turns:'2',resource:'',ai:'on'}))values.set('skill-0-'+k,v);
    assert.equal(await submit(d),undefined);const saved=f.c.state().actors[0];assert.equal(saved.name,'Updated wizard');assert.equal(saved.hp,12);assert.equal(saved.dc,13.5);assert.equal(saved.notes,'Keep my draft');assert.equal(saved.skills[0].name,'Careful aim');assert.equal(saved.skills[0].bonus,1.5);assert(saved.skills[0].ai);assert.equal(f.c.historyLength(),1);
    await f.c.undo();assert.deepEqual(f.c.state().actors[0],a);f.ui.destroy();
});
test('1.9.4 cancelling participant ability additions leaves saved values intact',async()=>{
    const f=fixture(),a=E.clone(f.c.state().actors[0]);await f.click('edit',a.id);const d=f.editor();actorForm(a);await d.querySelector('[data-actor-skills]').emit('click',{target:{closest:()=>({dataset:{skillAdd:'sprint'}})}});d.close();assert.equal(f.c.historyLength(),0);assert.deepEqual(f.c.state().actors[0],a);f.ui.destroy();
});
test('1.9.4 central effect rules save global decimal bonuses and status overrides through the real UI handler',async()=>{
    const f=fixture('en');await f.click('tab-rules');assert.match(f.ui.root.innerHTML,/Stances &amp; effects/);assert.match(f.ui.root.innerHTML,/name="effectDamage-burning"/);
    const rules=f.c.state().rules,values=new Map(Object.entries(rules));for(const [k,v] of Object.entries(rules))if(typeof v==='boolean'){if(v)values.set(k,'on');else values.delete(k);}
    values.set('aimBonus','3,5');values.set('offensiveAttack','1,25');values.set('effectDuration-rooted','4');values.set('effectDamage-burning','1d6');globalThis.FormData=class{constructor(){return values;}};
    const original=f.ui.root.querySelector.bind(f.ui.root);f.ui.root.querySelector=s=>s==='#ct-rules-form'?{}:original(s);await f.click('save-rules');assert.equal(f.c.state().rules.aimBonus,3.5);assert.equal(f.c.state().rules.offensiveAttack,1.25);assert.equal(f.c.state().rules.effectDurationOverrides.rooted,4);assert.equal(f.c.state().rules.effectDamageOverrides.burning,'1d6');f.ui.destroy();
});
test('1.9.4 terrain palette places ladders before erase and the transfer dialog puts import before export',async()=>{
    const f=fixture('en');assert(f.ui.root.innerHTML.indexOf('data-action="ladder-mode"')<f.ui.root.innerHTML.indexOf('data-action="erase-mode"'));await f.click('profiles-actors');const html=f.editor().innerHTML;assert(html.indexOf('data-profile-file')<html.indexOf('data-profile-export'));f.ui.destroy();
});

test('195 default left click selects; right click and explicit Actions open an inert menu',async()=>{
    const f=fixture('en',{preferences:()=>({language:'en',contextOnClick:false})});await f.c.start(false);const before=E.clone(f.c.state()),id=before.actors[2].id;
    await f.click('select',id);assert.equal(f.editor(),f.ui.root);assert.match(f.ui.root.innerHTML,/data-action="actor-menu"/);
    let prevented=false;await f.ui.root.emit('contextmenu',{target:{closest:()=>({dataset:{id}})},preventDefault(){prevented=true;}});assert(prevented);assert.match(f.editor().innerHTML,/Use participant as target/);f.editor().close();await f.click('actor-menu',id);assert(f.editor().open);assert.deepEqual(f.c.state(),before);f.ui.destroy();
});
test('195 terrain mode shows a visible placement hint and can be deselected by clicking again',async()=>{
    const f=fixture('en');await f.click('height-mode');assert.match(f.ui.root.innerHTML,/Terrain editing is active/);await f.click('height-mode');assert(!f.ui.root.innerHTML.includes('ct-terrain-hint'));f.ui.destroy();
});
test('195 reactions, shields, dungeon size and deployment controls are accessible in English',async()=>{
    const f=fixture('en');assert.match(f.ui.root.innerHTML,/Random deployment/);await f.click('random-map');assert.match(f.editor().innerHTML,/Dungeon room size/);f.editor().close();await f.click('tab-rules');for(const n of ['Enable reactions','Enable shields','Damage reduction when blocking'])assert(f.ui.root.innerHTML.includes(n),n);await f.click('defense',f.c.state().actors[0].id);for(const n of ['Reaction control','Reaction cost','Reserve a normal action','Absorb one hit'])assert(f.editor().innerHTML.includes(n),n);f.ui.destroy();
});
test('195 manual reaction modal closes without reaction or cancels the incoming attack without any mutation',async()=>{
    const f=fixture('en'),a=f.c.state().actors[0],b=f.c.state().actors[2];await f.c.rules({reactionsEnabled:true});await f.c.edit(b.id,{reactionChoices:['block'],reactionControl:'manual'});await f.c.start(false);const before=E.clone(f.c.state());
    let action=f.c.act({type:'attack',actor:a.id,target:b.id,mode:'ranged'},{roll:n=>n});await new Promise(resolve=>setImmediate(resolve));let d=f.editor();assert.match(d.innerHTML,/Maximum base damage/);assert.match(d.innerHTML,/Cancel attack/);d.close();await action;assert.equal(f.c.pendingReaction(),null);
    await f.c.undo();action=f.c.act({type:'attack',actor:a.id,target:b.id,mode:'ranged'},{roll:()=>{throw Error('No dice');}});await new Promise(resolve=>setImmediate(resolve));d=f.editor();await d.querySelector('[data-cancel-incoming]').emit('click',{});const result=await action;assert(result.cancelled);assert.equal(f.c.state().actors[2].hp,b.hp);assert.equal(f.c.pendingReaction(),null);assert.equal(f.c.historyLength(),3);f.ui.destroy();
});
test('195 area healing preview exposes center cell and affected actors; use is still a separate action',async()=>{
    const f=fixture('en'),a=f.c.state().actors[0];await f.c.edit(a.id,{hp:10,resources:[{id:'mana',name:'Mana',kind:'ammo',quantity:6},{id:'area',name:'Healing area',kind:'supply',consumption:'linked',stock:'mana',cost:3,heal:'8',range:5,radius:1,targets:'allies'}]});await f.c.start(false);const before=E.clone(f.c.state());await f.ui.root.emit('change',{target:{name:'otherKind',value:'heal'}});assert(f.ui.root.innerHTML.includes('Recipients (green on the board)'));assert.match(f.ui.root.innerHTML,/ct-heal-recipient/);await f.ui.root.emit('change',{target:{name:'healCenterMode',value:'cell'}});assert.match(f.ui.root.innerHTML,/name="healX"/);assert.deepEqual(f.c.state(),before);f.ui.destroy();
});

for(const language of ['de','en'])test('196 refill picker and result work at full HP in '+language,async()=>{
    const f=fixture(language),a=f.c.state().actors[0];await f.c.edit(a.id,{resources:[{id:'mana',name:'Mana',kind:'ammo',quantity:0,capacity:20},{id:'potion',name:'Potion',kind:'supply',quantity:3,heal:'0',range:0,refill:{stock:'mana',amount:5}}]});await f.c.start(false);const hp=f.c.state().actors[0].hp;
    await f.ui.root.emit('change',{target:{name:'otherKind',value:'refill'}});assert(f.ui.root.innerHTML.includes(language==='en'?'No dice; own stock only.':'Ohne Würfel; nur eigener Vorrat.'));assert.match(f.ui.root.innerHTML,/Mana · 0\/20 → 5/);
    await f.click('use-resource');assert.equal(f.c.state().actors[0].resources[0].quantity,5);assert.equal(f.c.state().actors[0].resources[1].quantity,2);assert.equal(f.c.state().actors[0].hp,hp);assert(f.ui.root.innerHTML.includes(language==='en'?'Stock refilled':'Vorrat aufgefüllt'));f.ui.destroy();
});
test('196 supplies editor adds a refill preset targeting the existing stock and saves staged values',async()=>{
    const f=fixture('en'),a=f.c.state().actors[0];await f.c.edit(a.id,{resources:[{id:'mana',name:'Mana',kind:'ammo',quantity:0,capacity:20}]});await f.click('supplies',a.id);let d=f.editor();let values=new Map([['resource-0-name','Mana'],['resource-0-quantity','0'],['resource-0-capacity','20']]);globalThis.FormData=class{constructor(){return values;}};
    await d.querySelector('form').emit('click',{target:{closest:()=>({dataset:{resourcePreset:'refill'}})}});d=f.editor();assert.match(d.querySelector('[data-resource-entries]').innerHTML,/Stock to refill/);assert.match(d.querySelector('[data-resource-entries]').innerHTML,/Units restored per use/);assert.equal(f.c.state().actors[0].resources.length,1);
    values.set('resource-1-refill-amount','7');assert.equal(await submit(d),undefined);assert.equal(f.c.state().actors[0].resources[1].refill.amount,7);assert.equal(f.c.state().actors[0].resources[1].refill.stock,'mana');f.ui.destroy();
});
test('196 changing an item purpose to refill clears healing fields without saving until Apply',async()=>{
    const f=fixture('en'),a=f.c.state().actors[0];await f.c.edit(a.id,{resources:[{id:'mana',name:'Mana',kind:'ammo',quantity:0},{id:'heal',name:'Item',kind:'supply',quantity:3,heal:'5',range:3,cures:['poisoned'],radius:1}]});await f.click('supplies',a.id);const before=E.clone(f.c.state());let values=new Map([['resource-1-purpose','refill']]);globalThis.FormData=class{constructor(){return values;}};
    await f.editor().querySelector('form').emit('change',{target:{name:'resource-1-purpose'}});assert.deepEqual(f.c.state(),before);assert.equal(await submit(f.editor()),undefined);const item=f.c.state().actors[0].resources[1];assert.equal(item.heal,'0');assert.equal(item.range,0);assert.equal(item.radius,0);assert.deepEqual(item.cures,[]);assert.equal(item.refill.stock,'mana');f.ui.destroy();
});

for (const language of ['de', 'en']) {
    test(`197 Help follows Interface and explains reaction choices, shield checkboxes and explicit rule saves (${language})`,async()=>{
        const f=fixture(language);assert(f.ui.root.innerHTML.indexOf('data-action="tab-settings"')<f.ui.root.innerHTML.indexOf('data-action="tab-help"'));
        await f.click('tab-help');for(const label of language==='en'?['Combat help','Block','Activate shield','Absorb one hit','reserve','Separate reaction budget']:['Hilfe zur Kampfsteuerung','Blocken','Schutz aktivieren','Einen Treffer absorbieren','reservieren','Eigenes Reaktionsbudget'])assert(f.ui.root.innerHTML.includes(label),label);
        assert.match(f.ui.root.innerHTML,/data-fold="help-reactions"/);assert.match(f.ui.root.innerHTML,/data-fold="help-shields"/);f.ui.destroy();
    });
    test(`197 every restricted action kind is labelled in group and participant editors (${language})`, async () => {
        const f=fixture(language),a=f.c.state().actors[0];
        await f.c.edit(a.id,{bonusActions:[{id:'defense',name:'Defense',count:1,allowed:['shield','reserve','refill']}]});
        for(const group of [false,true]) {
            if(group) {await f.click('group-budgets');const d=f.editor();globalThis.FormData=class {constructor(){return new Map([['group-player','on'],['groupMode','append'],['actionsPerTurn','1']]);}};await d.querySelector('form').emit('click',{target:{closest:()=>({dataset:{poolAdd:''}})}});}
            else await f.click('actions',a.id);
            const html=f.editor().innerHTML;
            assert(!html.includes('undefined'));
            for(const label of language==='en'?['Activate protection','Reserve reaction','Refill stock']:['Schutz aktivieren','Reaktion reservieren','Vorrat auffüllen'])assert(html.includes(label),label);
            f.editor().close();
        }
        f.ui.destroy();
    });
    test(`197 unsaved rules survive tabs and another controller update, then save explicitly (${language})`, async () => {
        const f=fixture(language),before=E.clone(f.c.state().rules);
        await f.click('tab-rules');
        const input=async(name,value,checked)=>f.ui.root.emit('input',{target:{name,value,checked,closest:s=>s==='#ct-rules-form'?{}:null}});
        await input('reactionsEnabled',undefined,true);await input('movementBase','6');await input('effectDamage-burning','1d4');
        assert.deepEqual(f.c.state().rules,before);
        await f.click('tab-actors');assert(f.ui.root.innerHTML.includes(language==='en'?'Unsaved rule changes':'Ungespeicherte Regeländerungen'));
        await f.c.edit(f.c.state().actors[0].id,{notes:'Intervening edit'});
        await f.click('tab-rules');assert.match(f.ui.root.innerHTML,/name="movementBase"[^>]*value="6"/);assert.match(f.ui.root.innerHTML,/name="reactionsEnabled"[^>]*checked/);assert.match(f.ui.root.innerHTML,/name="effectDamage-burning" value="1d4"/);
        await f.click('tab-board');await f.click('save-rules');
        assert.equal(f.c.state().rules.movementBase,6);assert.equal(f.c.state().rules.reactionsEnabled,true);assert.equal(f.c.state().rules.effectDamageOverrides.burning,'1d4');assert.equal(f.c.state().rules.criticalDamage,before.criticalDamage);
        assert(!f.ui.root.innerHTML.includes('class="ct-rules-draft"'));f.ui.destroy();
    });
    test(`197 invalid rules retain the draft; discard and chat switching never apply it (${language})`, async () => {
        const f=fixture(language),before=E.clone(f.c.state().rules);
        await f.click('tab-rules');await f.ui.root.emit('input',{target:{name:'movementBase',value:'oops',closest:s=>s==='#ct-rules-form'?{}:null}});
        await f.click('tab-board');await f.click('save-rules');assert.deepEqual(f.c.state().rules,before);assert.match(f.ui.root.innerHTML,/ct-error/);
        f.switch('b');assert(!f.ui.root.innerHTML.includes('class="ct-rules-draft"'));assert.deepEqual(f.c.state().rules,before);
        f.switch('a');await f.click('tab-rules');assert.match(f.ui.root.innerHTML,/name="movementBase"[^>]*value="oops"/);
        await f.click('discard-rules');assert(!f.ui.root.innerHTML.includes('class="ct-rules-draft"'));assert.deepEqual(f.c.state().rules,before);f.ui.destroy();
    });
    test(`196 failed ability has a failure card and notice; successful retry clears both (${language})`, async () => {
        const f = fixture(language), a = f.c.state().actors[0];
        await f.c.edit(a.id, { skills: [{ ...skillPreset('acrobatics', language), id: 'acrobatics' }] });
        await f.c.rules({ splitMovement: true });
        await f.c.start(false);
        const act = f.c.act.bind(f.c);
        f.c.act = (intent, options) => act(intent, { ...options, roll: () => 1 });
        await f.ui.root.emit('change', { target: { name: 'otherKind', value: 'skill' } });
        await f.click('use-skill');
        assert.equal(f.c.state().log.findLast(e => e.type === 'skill').details.success, false);
        assert.match(f.ui.root.innerHTML, /ct-result-skill ct-result-failure/);
        assert.match(feedbackBar(f.ui.root.innerHTML), /ct-error ct-failure/);
        assert(f.ui.root.innerHTML.includes(language === 'en' ? 'Ability failed' : 'Fähigkeit fehlgeschlagen'));
        assert(!f.ui.root.innerHTML.includes('data-action="debug">'));
        await f.c.undo();
        f.c.act = (intent, options) => act(intent, { ...options, roll: n => n });
        await f.click('use-skill');
        assert.equal(f.c.state().log.findLast(e => e.type === 'skill').details.success, true);
        assert.match(f.ui.root.innerHTML, /class="ct-last-result ct-result-skill"/);
        assert(!f.ui.root.innerHTML.includes('ct-notice ct-failure'));
        assert(f.ui.root.innerHTML.includes(language === 'en' ? 'Ability succeeded' : 'Fähigkeit erfolgreich'));
        f.ui.destroy();
    });
    test(`196 attack miss remains a failure card after ending the turn (${language})`, async () => {
        const f = fixture(language);
        await f.c.rules({ splitMovement: true });
        await f.c.start(false);
        await f.c.act({ type: 'attack', actor: E.currentActor(f.c.state()).id, target: f.c.state().actors[2].id, mode: 'ranged' }, { roll: () => 1 });
        assert.match(f.ui.root.innerHTML, /ct-result-miss ct-result-failure/);
        await f.c.endTurn();
        assert.match(f.ui.root.innerHTML, /ct-result-miss ct-result-failure/);
        assert.match(f.ui.root.innerHTML, /ct-result-turn/);
        f.ui.destroy();
    });
}

test('197 Reserve button appears only for a usable configured reaction; protection controls are collapsed',async()=>{
    const f=fixture('en'),a=f.c.state().actors[0];await f.c.rules({reactionsEnabled:true,multiActionsEnabled:true,splitMovement:true});await f.c.edit(a.id,{reactionCost:'normal',reactionChoices:[],actionsPerTurn:2});await f.c.start(false);
    assert(!f.ui.root.innerHTML.includes('data-action="reserve-reaction"'));assert(f.ui.root.innerHTML.includes('No reaction choices are allowed for this participant'));
    assert.match(f.ui.root.innerHTML,/data-fold="action-defense-[^"]+" >/);
    await f.c.edit(a.id,{reactionChoices:['block']});assert.match(f.ui.root.innerHTML,/data-action="reserve-reaction"/);await f.click('reserve-reaction');assert(f.c.state().actors[0].reactionReserve);assert.equal(f.c.state().action.freeSpent,1);f.ui.destroy();
});

test('197 actual manual shield dialog preserves absorption on miss and removes its marker on a damaging hit',async()=>{
    const f=fixture('en',{preferences:()=>({language:'en',debugEnabled:true})}),a=f.c.state().actors[0],b=f.c.state().actors[2];
    await f.c.rules({splitMovement:true,multiActionsEnabled:true,reactionsEnabled:true,shieldsEnabled:true});
    await f.c.edit(a.id,{actionsPerTurn:3});await f.c.edit(b.id,{resources:[{id:'mana',name:'Mana',kind:'ammo',quantity:5}],shieldProfiles:[{id:'bubble',name:'Bubble',kind:'absorb',turns:1,resource:'mana',cost:2}],reactionChoices:['shield'],reactionControl:'manual'});
    await f.c.start(false);
    const intent={type:'attack',actor:a.id,target:b.id,mode:'ranged'},hp=f.c.state().actors[2].hp;
    const first=f.c.act(intent,{roll:()=>1});await new Promise(resolve=>setImmediate(resolve));
    const d=f.editor();assert.match(d.innerHTML,/Choose reaction/);assert.equal(f.c.state().actors[2].resources[0].quantity,5);
    d.querySelector('form').elements.reactionChoice={value:'1'};await submit(d);await first;
    assert.equal(f.c.state().actors[2].resources[0].quantity,3);assert.equal(f.c.state().actors[2].shields.length,1);assert.match(f.ui.root.innerHTML,/ct-effect-shield/);
    const hit=await f.c.act(intent,{roll:n=>n===20?19:n});assert(hit.hit);assert(hit.rawDamage>0);assert(hit.affected[0].absorbed);assert.equal(hit.damage,0);assert.equal(f.c.state().actors[2].hp,hp);assert.equal(f.c.state().actors[2].shields.length,0);assert(!f.ui.root.innerHTML.includes('ct-effect-shield'));
    const entry=f.c.debugEntries().filter(e=>e.type==='change').at(-1);assert(entry.detail.events.find(e=>e.type==='hit').defense[0].absorbed);assert.equal(entry.state.rules.shieldsEnabled,true);assert.equal(entry.state.actors[2].reactionControl,'manual');
    assert(f.c.debugEntries().some(e=>e.type==='reaction'&&e.detail.status==='decided'&&Number.isFinite(e.detail.waitMs)));
    await f.c.undo();assert.equal(f.c.state().actors[2].shields.length,1);assert.match(f.ui.root.innerHTML,/ct-effect-shield/);f.ui.destroy();
});

test('197 manual dialog Cancel attack leaves no changes; Do not react resolves a later attack and releases the queue',async()=>{
    const f=fixture('en'),a=f.c.state().actors[0],b=f.c.state().actors[2];await f.c.rules({reactionsEnabled:true});await f.c.edit(b.id,{reactionChoices:['block'],reactionControl:'manual'});await f.c.start(false);const before=E.clone(f.c.state());
    const intent={type:'attack',actor:a.id,target:b.id,mode:'ranged'},first=f.c.act(intent,{roll:()=>{throw new Error('Must not roll');}});await new Promise(resolve=>setImmediate(resolve));
    await f.editor().querySelector('[data-cancel-incoming]').emit('click',{});assert((await first).cancelled);assert.deepEqual(f.c.state(),before);assert.equal(f.c.pendingReaction(),null);
    const second=f.c.act(intent,{roll:()=>1});await new Promise(resolve=>setImmediate(resolve));f.editor().querySelector('form').elements.reactionChoice={value:'0'};await submit(f.editor());await second;
    assert.equal(f.c.state().actors[2].reactionUsed,false);assert.equal(f.c.pendingReaction(),null);await f.c.edit(a.id,{notes:'Queue continues'});assert.equal(f.c.state().actors[0].notes,'Queue continues');f.ui.destroy();
});

test('197 reaction footer explicitly says Continue without reacting and closing retains the reaction',async()=>{
    const f=fixture('en'),a=f.c.state().actors[0],b=f.c.state().actors[2];await f.c.rules({reactionsEnabled:true});await f.c.edit(b.id,{reactionChoices:['block'],reactionControl:'manual'});await f.c.start(false);
    const attack=f.c.act({type:'attack',actor:a.id,target:b.id,mode:'ranged'},{roll:()=>1});await new Promise(resolve=>setImmediate(resolve));
    assert.match(f.editor().innerHTML,/data-cancel>Continue without reacting</);assert.match(f.editor().innerHTML,/Cancel attack \/ stop AI/);
    f.editor().close();await attack;assert.equal(f.c.pendingReaction(),null);assert.equal(f.c.state().actors[2].reactionUsed,false);assert(f.c.state().log.some(e=>e.type==='miss'));f.ui.destroy();
});

for(const language of ['de','en']) {
    test(`198 resource preview refreshes changed costs/refill amount without committing the editor (${language})`,async()=>{
        const f=fixture(language),a=f.c.state().actors[0];
        await f.c.edit(a.id,{resources:[{id:'mana',name:'Mana',kind:'ammo',quantity:2,capacity:10},{id:'potion',name:'Potion',kind:'supply',quantity:3,heal:'0',range:0,cost:1,refill:{stock:'mana',amount:5}}]});
        await f.click('supplies',a.id);const before=E.clone(f.c.state()),values=new Map([['resource-1-cost','2'],['resource-1-refill-amount','3']]);
        globalThis.FormData=class {constructor(){return values;}};
        const same=f.editor(),preview={},entries=same.querySelector('[data-resource-entries]');entries.querySelectorAll=selector=>selector==='details[data-resource-id]'?[{dataset:{resourceId:'potion'},open:true,querySelector:()=>preview}]:[];
        await same.querySelector('form').emit('change',{target:{name:'resource-1-refill-amount'}});
        const changed=f.editor();assert.equal(changed,same);assert.match(preview.outerHTML,/2 → 5/);assert.match(preview.outerHTML,/2 Potion/);assert.deepEqual(f.c.state(),before);
        await submit(changed);assert.equal(f.c.state().actors[0].resources[1].cost,2);assert.equal(f.c.state().actors[0].resources[1].refill.amount,3);f.ui.destroy();
    });
    test(`198 editor explanations are collapsed and contextual Help preserves an unsaved participant (${language})`,async()=>{
        const f=fixture(language),a=f.c.state().actors[0],before=E.clone(f.c.state());await f.click('edit',a.id);const parent=f.editor(),values=actorForm(a);
        values.set('name','Unsaved wizard');values.set('notes','Keep this draft');assert.match(parent.innerHTML,/class="ct-fold ct-description"><summary>/);
        await parent.querySelector('form').emit('click',{target:{closest:selector=>selector==='[data-help-section]'?{dataset:{helpSection:'defense'}}:null}});
        const help=f.editor();assert.notEqual(help,parent);assert(parent.open);assert(help.open);assert(help.innerHTML.includes(language==='en'?'Absorb one hit':'Einen Treffer absorbieren'));assert.deepEqual(f.c.state(),before);
        await help.querySelector('[data-help-close]').emit('click',{});assert(parent.open);assert.equal(await submit(parent),undefined);assert.equal(f.c.state().actors[0].name,'Unsaved wizard');assert.equal(f.c.state().actors[0].notes,'Keep this draft');f.ui.destroy();
    });
    test(`198 weapon, budget and resources editors keep explanations collapsed with section Help (${language})`,async()=>{
        const f=fixture(language),a=f.c.state().actors[0];
        for(const action of ['weapons','actions','supplies','skills']) {await f.click(action,a.id);const d=f.editor();assert.match(d.innerHTML,/data-help-section=/);assert.match(d.innerHTML,/class="ct-fold ct-description"><summary>/);assert(!d.innerHTML.includes('ct-description" open'));d.close();}
        f.ui.destroy();
    });
    test(`198 own-check UI uses preset/custom DC and assigned effect, then switches to free narration without costs (${language})`,async()=>{
        const f=fixture(language),a=f.c.state().actors[0],b=f.c.state().actors[2];await f.c.rules({multiActionsEnabled:true,splitMovement:true,skillsEnabled:true,resourcesEnabled:true});await f.c.board({blocked:[],cover:[],heights:[],ladders:[]});
        await f.c.edit(a.id,{actionsPerTurn:2,resources:[{id:'mana',name:'Mana',kind:'ammo',quantity:5}],skills:[{...skillPreset('distract',language),id:'distract',range:100,resource:'mana',cost:2}]});await f.c.start(false);
        const act=f.c.act.bind(f.c);f.c.act=(i,o)=>act(i,{...o,roll:n=>n});await f.ui.root.emit('change',{target:{name:'otherKind',value:'check'}});
        assert(f.ui.root.innerHTML.includes(language==='en'?'Roll own check':'Eigene Probe auswürfeln'));
        const input=async(name,value,type='change')=>f.ui.root.emit(type,{target:{name:'check-'+name,value}});
        await input('description','An improvised distraction','input');await input('difficulty','custom');await input('dc','4,5');await input('effect','distract');await input('target',b.id);await f.click('resolve-check');
        const result=f.c.state().log.at(-1).details;assert.equal(result.type,'check');assert.equal(result.dc,4.5);assert(result.success);assert.equal(f.c.state().actors[0].resources[0].quantity,3);assert.equal(f.c.state().actors[0].skills.length,1);assert(f.c.state().actors[2].tactics.some(t=>t.type==='distracted'));
        assert(f.ui.root.innerHTML.includes(language==='en'?'Own check succeeded':'Eigene Probe erfolgreich'));
        await input('mode','narrative');assert.match(f.ui.root.innerHTML,/name="check-effect" disabled/);const before=E.clone(f.c.state());await input('description','Just a story check','input');await f.click('resolve-check');
        assert.deepEqual(f.c.state().action,before.action);assert.deepEqual(f.c.state().actors,before.actors);assert.equal(f.c.state().log.at(-1).details.effect,null);f.ui.destroy();
    });
    test(`198 failed own check has a red failure result and invalid description remains editable (${language})`,async()=>{
        const f=fixture(language);await f.c.rules({splitMovement:true,natural20:true});await f.c.start(false);const act=f.c.act.bind(f.c);f.c.act=(i,o)=>act(i,{...o,roll:()=>1});
        await f.ui.root.emit('change',{target:{name:'otherKind',value:'check'}});const before=E.clone(f.c.state());await f.click('resolve-check');assert.deepEqual(f.c.state(),before);
        assert(f.ui.root.innerHTML.includes(language==='en'?'a description of 1 to 500':'Beschreibung mit 1 bis 500'));
        await f.ui.root.emit('input',{target:{name:'check-description',value:'A risky attempt'}});await f.click('resolve-check');assert.match(f.ui.root.innerHTML,/ct-result-check ct-result-failure/);assert(f.ui.root.innerHTML.includes(language==='en'?'Own check failed':'Eigene Probe fehlgeschlagen'));f.ui.destroy();
    });
}

async function carryingFixture(language='en'){
 const f=fixture(language),[a,b]=f.c.state().actors;await f.c.rules({splitMovement:true,multiActionsEnabled:true,movementBase:5,movementStat:'none'});await f.c.board({blocked:[],cover:[],heights:[],ladders:[]});await f.c.move(f.c.state().actors[3].id,{x:9,y:8},true);await f.c.move(a.id,{x:2,y:3},true);await f.c.move(b.id,{x:1,y:3},true);await f.c.edit(b.id,{hp:0,condition:'stabilized'});await f.c.edit(a.id,{actionsPerTurn:3,skills:[{...skillPreset('carry'),id:'carry'}]});await f.c.start(false);await f.ui.root.emit('change',{target:{name:'otherKind',value:'skill'}});return {...f,a,b};
}
for(const language of ['de','en']){
 test('UI hotfix '+language+' self abilities never show an empty target list; manual retry and application switching work',async()=>{
  const f=await carryingFixture(language),a=f.a;const pair=acrobaticsPresets('de');await f.c.edit(a.id,{resources:[{id:'mana',kind:'ammo',name:'Mana',quantity:5}],skills:pair.map(v=>({...v,resource:'mana',cost:1}))});await f.ui.root.emit('change',{target:{name:'skill',value:pair[0].id}});assert(!f.ui.root.innerHTML.includes('name="skillTarget"'));
  const act=f.c.act.bind(f.c);let draws=0;f.c.act=(i,o)=>act(i,{...o,roll:()=>++draws===1?1:20});await f.click('use-skill');assert(!f.ui.root.innerHTML.includes('name="skillTarget"'));assert.match(f.ui.root.innerHTML,language==='en'?/already attempted/:/bereits versucht/);await f.ui.root.emit('change',{target:{name:'skillApplication',value:pair[1].id}});assert(!f.ui.root.innerHTML.includes('name="skillTarget"'));await f.ui.root.emit('change',{target:{name:'skillApplication',value:pair[0].id}});await f.ui.root.emit('change',{target:{name:'manualUnlimited',checked:true}});assert(!f.ui.root.innerHTML.includes('name="skillTarget"'));assert(!f.ui.root.innerHTML.includes('ct-ability-restriction'));await f.click('use-skill');assert.equal(f.c.state().actors[0].resources[0].quantity,3);assert.equal(f.c.state().actors[0].acrobaticsTurn,f.c.state().turnSerial);assert.equal(draws,2);f.ui.destroy();
 });
 test('UI hotfix '+language+' carry accepts coordinates and rejects invalid entries without spending anything',async()=>{
  const f=await carryingFixture(language);assert(!f.ui.root.innerHTML.includes('name="skillDestination"'));const before=E.clone(f.c.state());await f.ui.root.emit('change',{target:{name:'skillCarryCell',value:'Z99'}});await f.click('use-skill');assert.deepEqual(f.c.state(),before);assert.match(f.ui.root.innerHTML,language==='en'?/outside the board/:/außerhalb der Karte/);await f.ui.root.emit('change',{target:{name:'skillCarryCell',value:'f4'}});assert(f.ui.root.innerHTML.includes(f.a.name+' → G4'));assert(f.ui.root.innerHTML.includes(f.b.name+' → F4'));await f.click('use-skill');assert.deepEqual(f.c.state().actors[0].position,{x:6,y:3});assert.deepEqual(f.c.state().actors[1].position,{x:5,y:3});f.ui.destroy();
 });
 test('UI hotfix '+language+' choosing carry destination on the board prepares it without moving either figure',async()=>{
  const f=await carryingFixture(language),before=E.clone(f.c.state());await f.click('pick-carry-skill');assert(f.ui.root.innerHTML.includes('cancel-carry-pick'));await f.ui.root.emit('click',{target:{closest:()=>({dataset:{action:'cell',x:'5',y:'3'}})}});assert.deepEqual(f.c.state(),before);assert(f.ui.root.innerHTML.includes('value="F4"'));assert(f.ui.root.innerHTML.includes(f.a.name+' → G4'));assert(!f.ui.root.innerHTML.includes('data-action="cancel-carry-pick"'));await f.click('use-skill');assert.equal(f.c.state().movement.spent,4);f.ui.destroy();
 });
 test('UI hotfix '+language+' free-cell context menu selects carrying destination without resolving an action',async()=>{
  const f=await carryingFixture(language),before=E.clone(f.c.state()),cell={dataset:{x:'5',y:'3'}};let prevented=false;await f.ui.root.emit('contextmenu',{preventDefault(){prevented=true;},target:{closest:q=>q==='.ct-cell'?cell:null}});assert(prevented);const d=f.editor();assert(d.innerHTML.includes(f.a.name+' → G4'));assert.equal(await submit(d),undefined);assert.deepEqual(f.c.state(),before);assert(f.ui.root.innerHTML.includes('value="F4"'));await f.click('use-skill');assert.equal(f.c.state().movement.spent,4);f.ui.destroy();
 });
}
test('UI hotfix carry map selection cancels on Escape, turn change and switching the action',async()=>{
 const f=await carryingFixture();await f.click('pick-carry-skill');await f.ui.root.emit('keydown',{key:'Escape',preventDefault(){}});assert(!f.ui.root.innerHTML.includes('data-action="cancel-carry-pick"'));await f.click('pick-carry-skill');await f.ui.root.emit('change',{target:{name:'otherKind',value:'heal'}});assert(!f.ui.root.innerHTML.includes('data-action="cancel-carry-pick"'));await f.ui.root.emit('change',{target:{name:'otherKind',value:'skill'}});await f.click('pick-carry-skill');await f.c.endTurn();assert(!f.ui.root.innerHTML.includes('data-action="cancel-carry-pick"'));f.ui.destroy();
});
test('UI hotfix own-check carrying uses the same map picker and explicit destination, with no early movement',async()=>{
 const f=await carryingFixture();await f.ui.root.emit('change',{target:{name:'otherKind',value:'check'}});for(const [name,value]of Object.entries({effect:'carry',description:'Bring scout to safety',target:f.b.id}))await f.ui.root.emit('change',{target:{name:'check-'+name,value}});const before=E.clone(f.c.state());await f.click('pick-carry-check');await f.ui.root.emit('click',{target:{closest:()=>({dataset:{action:'cell',x:'5',y:'3'}})}});assert.deepEqual(f.c.state(),before);assert(f.ui.root.innerHTML.includes('name="check-carryCell"'));assert(f.ui.root.innerHTML.includes('value="F4"'));const act=f.c.act.bind(f.c);f.c.act=(i,o)=>act(i,{...o,roll:()=>20});await f.click('resolve-check');assert.deepEqual(f.c.state().actors[1].position,{x:5,y:3});assert.equal(f.c.state().movement.spent,4);f.ui.destroy();
});

for(const language of ['de','en']){
 test('paired carry '+language+' explicit helper selection is honored and preview rows are separate',async()=>{
  const f=await carryingFixture(language);await f.ui.root.emit('change',{target:{name:'skillCarryCell',value:'D4'}});await f.ui.root.emit('change',{target:{name:'skillCarrierCell',value:'C3'}});assert(f.ui.root.innerHTML.includes('name="skillCarrierCell"'));assert(f.ui.root.innerHTML.includes('value="C3" selected'));assert(f.ui.root.innerHTML.includes(f.a.name+' → C3'));const before=E.clone(f.c.state());await f.click('use-skill');assert.deepEqual(f.c.state().actors[0].position,{x:2,y:2});assert.deepEqual(f.c.state().actors[1].position,{x:3,y:3});assert.equal(f.c.state().movement.spent,2);await f.c.undo();assert.deepEqual(f.c.state().actors.map(a=>a.position),before.actors.map(a=>a.position));f.ui.destroy();
 });
 test('paired carry '+language+' helper can be chosen by board click or right-click without early movement',async()=>{
  const f=await carryingFixture(language);await f.ui.root.emit('change',{target:{name:'skillCarryCell',value:'D4'}});const before=E.clone(f.c.state());await f.click('pick-carrier-skill');await f.ui.root.emit('click',{target:{closest:()=>({dataset:{action:'cell',x:'2',y:'2'}})}});assert.deepEqual(f.c.state(),before);assert(f.ui.root.innerHTML.includes('value="C3" selected'));await f.click('pick-carrier-skill');const cell={dataset:{x:'4',y:'2'}};await f.ui.root.emit('contextmenu',{preventDefault(){},target:{closest:q=>q==='.ct-cell'?cell:null}});const d=f.editor();assert(d.innerHTML.includes(f.a.name+' → E3'));assert.equal(await submit(d),undefined);assert.deepEqual(f.c.state(),before);assert(f.ui.root.innerHTML.includes('value="E3" selected'));await f.click('use-skill');assert.deepEqual(f.c.state().actors[0].position,{x:4,y:2});f.ui.destroy();
 });
 test('paired carry '+language+' changing the rescued destination resets the previous helper choice',async()=>{
  const f=await carryingFixture(language);await f.ui.root.emit('change',{target:{name:'skillCarryCell',value:'D4'}});await f.ui.root.emit('change',{target:{name:'skillCarrierCell',value:'C3'}});await f.ui.root.emit('change',{target:{name:'skillCarryCell',value:'F4'}});assert(!f.ui.root.innerHTML.includes('value="C3" selected'));await f.click('use-skill');assert.deepEqual(f.c.state().actors[1].position,{x:5,y:3});assert.deepEqual(f.c.state().actors[0].position,{x:6,y:3});f.ui.destroy();
 });
 for(const success of [false,true])test('ability feedback '+language+' '+success+' appears under the board, links to details and dismisses without action',async()=>{
  const f=fixture(language),a=f.c.state().actors[0];await f.c.rules({splitMovement:true,multiActionsEnabled:true});await f.c.edit(a.id,{actionsPerTurn:3,skills:[{...skillPreset('acrobatics'),id:'cover'}]});await f.c.start(false);await f.ui.root.emit('change',{target:{name:'otherKind',value:'skill'}});const act=f.c.act.bind(f.c);f.c.act=(i,o)=>act(i,{...o,roll:()=>success?20:1});await f.click('use-skill');let html=f.ui.root.innerHTML,bar=html.match(/<p class="ct-board-notice ct-ability-feedback[\s\S]*?<\/p>/)?.[0];assert(bar);assert(bar.includes(success?(language==='en'?'Ability succeeded':'Fähigkeit erfolgreich'):(language==='en'?'Ability failed':'Fähigkeit fehlgeschlagen')));assert(bar.includes(success?'ct-success':'ct-error ct-failure'));assert(!bar.includes('DC'));assert(!bar.includes('W20'));
  const before=E.clone(f.c.state());let scrolled=false;const details={open:false},old=f.ui.root.querySelector.bind(f.ui.root);f.ui.root.querySelector=q=>q==='.ct-last-result'?{scrollIntoView(){scrolled=true;}}:q==='details[data-fold="result-details"]'?details:old(q);await f.click('show-last-result');assert(scrolled);assert(details.open);assert.deepEqual(f.c.state(),before);await f.click('dismiss-board');assert(!f.ui.root.innerHTML.includes('ct-board-notice ct-ability-feedback'));assert.deepEqual(f.c.state(),before);f.ui.destroy();
 });
 test('ability feedback '+language+' remains after own End turn and is not replayed from imported logs',async()=>{
  const f=fixture(language),a=f.c.state().actors[0];await f.c.rules({splitMovement:true,multiActionsEnabled:true});await f.c.edit(a.id,{actionsPerTurn:3,skills:[{...skillPreset('aim'),id:'aim'}]});await f.c.start(false);await f.c.act({type:'skill',actor:a.id,target:a.id,skill:'aim'});assert(f.ui.root.innerHTML.includes('ct-board-notice ct-ability-feedback'));const saved=f.c.export();await f.c.endTurn();assert(f.ui.root.innerHTML.includes('ct-board-notice ct-ability-feedback'));await f.c.import(saved);assert(!f.ui.root.innerHTML.includes('ct-board-notice ct-ability-feedback'));f.ui.destroy();
 });
}
test('paired carry own check keeps the selected helper field and produces compact ability feedback',async()=>{
 const f=await carryingFixture();await f.ui.root.emit('change',{target:{name:'otherKind',value:'check'}});for(const [key,value]of Object.entries({effect:'carry',description:'Rescue',target:f.b.id,carryCell:'D4',carrierCell:'C3'}))await f.ui.root.emit('change',{target:{name:'check-'+key,value}});const act=f.c.act.bind(f.c);f.c.act=(i,o)=>act(i,{...o,roll:()=>20});await f.click('resolve-check');assert.deepEqual(f.c.state().actors[0].position,{x:2,y:2});assert.deepEqual(f.c.state().actors[1].position,{x:3,y:3});assert(f.ui.root.innerHTML.includes('ct-board-notice ct-ability-feedback'));f.ui.destroy();
});

for(const language of ['de','en']){
 function compactFixture(){const prefs={language,compactUI:true};return fixture(language,{preferences:patch=>patch?Object.assign(prefs,patch):prefs});}
 test('beta3hf2 '+language+' compact Other actions and explanations fold while costs, controls and warnings remain available',async()=>{
  const f=compactFixture(),a=f.c.state().actors[0];await f.c.rules({splitMovement:true,multiActionsEnabled:true,stancesEnabled:true});await f.c.edit(a.id,{actionsPerTurn:3,resources:[{id:'bolts',name:'Bolts',kind:'ammo',quantity:5}],weaponList:[{id:'crossbow',name:'Crossbow',mode:'ranged',range:12,damage:'1d4',resource:'bolts',cost:1}]});await f.c.start(false);
  const key='other-actions-'+a.id,foldTag=()=>f.ui.root.innerHTML.match(new RegExp('<details class="ct-fold" data-fold="'+key+'"[^>]*>'))?.[0];assert(foldTag());assert(!foldTag().includes('open'));assert(f.ui.root.innerHTML.includes('name="otherKind"'));assert(f.ui.root.innerHTML.includes('name="stance"'));assert(f.ui.root.innerHTML.includes('Bolts'));assert(f.ui.root.innerHTML.includes(language==='en'?'Cost':'Kosten'));assert(f.ui.root.innerHTML.includes('data-fold="compact-help"'));
  const help=f.ui.root.innerHTML.indexOf('data-fold="compact-help"'),text=language==='en'?'Narrative intent only; does not change rolls or damage.':'Nur erzählerische Absicht; verändert keine Würfe oder Schäden.';assert(f.ui.root.innerHTML.indexOf(text)>help);assert(!f.ui.root.innerHTML.slice(0,help).includes(text));
  const before=E.clone(f.c.state()),query=f.ui.root.querySelectorAll;f.ui.root.querySelectorAll=q=>q==='details[data-fold]'?[{dataset:{fold:key},open:true},{dataset:{fold:'compact-help'},open:true}]:[];f.c.refresh();f.ui.root.querySelectorAll=query;assert(foldTag().includes('open'));assert(f.ui.root.innerHTML.includes('data-fold="compact-help" open'));assert.deepEqual(f.c.state(),before);
  await f.c.preferences({compactUI:false});f.c.refresh();assert(!f.ui.root.innerHTML.includes('data-fold="'+key+'"'));assert(!f.ui.root.innerHTML.includes('data-fold="compact-help"'));assert(f.ui.root.innerHTML.includes(text));f.ui.destroy();
 });
 test('beta3hf2 '+language+' compact miss remains named beneath board after rest movement, End turn and refresh; narrator selects it',async()=>{
  const f=compactFixture(),[a,,b]=f.c.state().actors;await f.c.rules({splitMovement:true,multiActionsEnabled:true,movementBase:5,movementStat:'none',natural20:false});await f.c.board({blocked:[],cover:[],heights:[],ladders:[],pits:[]});await f.c.edit(a.id,{actionsPerTurn:3,weaponList:[{id:'crossbow',name:'Crossbow',mode:'ranged',range:20,damage:'1d4'}]});await f.c.edit(b.id,{dc:99});await f.c.start(false);await f.c.act({type:'attack',actor:a.id,target:b.id,weapon:'crossbow'},{roll:()=>2});const event=latestResult(f.c.state().log).event;assert.equal(event.type,'miss');await f.c.move(a.id,{x:1,y:1});await f.c.endTurn();f.c.refresh();
  const bar=feedbackBar(f.ui.root.innerHTML);assert(bar.includes(language==='en'?'Attack missed':'Angriff verfehlt'));assert(bar.includes(a.name));assert(bar.includes(b.name));assert(f.ui.root.innerHTML.indexOf(bar)>f.ui.root.innerHTML.indexOf('data-board-feedback'));const prompt=E.buildPrompt(f.c.state(),{mode:'narrate'}),target=prompt.split('\n').find(v=>v.startsWith('NARRATION TARGET — '));assert(target.includes(event.id));assert(target.includes('"eventType":"miss"'));await f.click('dismiss-board');f.c.refresh();assert(!feedbackBar(f.ui.root.innerHTML));f.ui.destroy();
 });
 test('beta3hf2 '+language+' Advanced AI stabilization stays visible after its entire turn, then a different empty turn replaces it',async()=>{
  const f=compactFixture();let s=E.setRules(E.emptyState(),{splitMovement:true,multiActionsEnabled:true,movementBase:4,movementStat:'none',natural20:false,stancesEnabled:false}).state;s=E.setBoard(s,{width:12,height:8}).state;
  s.actors=[{id:'rauk',name:'Rauk',side:'enemy',control:'advanced',initiative:30,aiBehavior:'support',actionsPerTurn:2,position:{x:1,y:1},weaponList:[],aiConfig:{idle:'wait',free:false,radius:1,retreat:false}},{id:'hero',name:'Hero',side:'player',initiative:20,position:{x:8,y:5}},{id:'dog',name:'Moorhund',side:'enemy',initiative:10,position:{x:2,y:1},hp:0,maxHp:12,condition:'unconscious',roundsLeft:3}].map(v=>E.actorFrom(v,true));await f.c.import(s);await f.c.start(false);await f.click('ai-step');
  const bar=feedbackBar(f.ui.root.innerHTML);assert(bar.includes(language==='en'?'Participant stabilized':'Figur stabilisiert'));assert(bar.includes('Rauk'));assert(bar.includes('Moorhund'));assert(f.ui.root.innerHTML.includes('ct-result-stabilize'));assert.equal(E.currentActor(f.c.state()).id,'hero');f.c.refresh();assert.equal(feedbackBar(f.ui.root.innerHTML),bar);
  await f.c.endTurn();const next=feedbackBar(f.ui.root.innerHTML);assert(next.includes(language==='en'?'Turn ended without an action':'Zug ohne Aktion beendet'));assert(next.includes('Hero'));assert(!next.includes('Moorhund'));f.ui.destroy();
 });
 test('beta3hf2 '+language+' a full Advanced AI turn ending after misses keeps the actual final miss as both feedback and narration target',async()=>{
  const f=compactFixture();let s=E.setRules(E.emptyState(),{splitMovement:true,multiActionsEnabled:true,movementBase:3,movementStat:'none',natural20:false,stancesEnabled:false}).state;
  s.actors=[{id:'rauk',name:'Rauk',side:'enemy',control:'advanced',initiative:30,aiBehavior:'aggressive',actionsPerTurn:2,position:{x:1,y:1},attackBonus:5,weaponList:[{id:'crossbow',name:'Crossbow',mode:'ranged',range:20,damage:'1d4'}],aiConfig:{idle:'wait',free:false,radius:1,retreat:false}},{id:'hero',name:'Hero',side:'player',initiative:20,position:{x:4,y:1},maxHp:100,hp:100}].map(v=>E.actorFrom(v,true));await f.c.import(s);await f.c.start(false);const step=f.c.aiStep.bind(f.c);f.c.aiStep=options=>step({...options,roll:()=>2});await f.click('ai-step');
  const event=latestResult(f.c.state().log).event;assert.equal(event.type,'miss');assert.equal(event.details.actorName,'Rauk');assert(feedbackBar(f.ui.root.innerHTML).includes(language==='en'?'Attack missed':'Angriff verfehlt'));const target=E.buildPrompt(f.c.state(),{mode:'narrate'}).split('\n').find(v=>v.startsWith('NARRATION TARGET — '));assert(target.includes(event.id));assert(target.includes('"eventType":"miss"'));f.ui.destroy();
 });
}

for(const language of ['de','en']){
 test('1921 '+language+' folded protection distinguishes no reactions and leaves independent shields available',async()=>{
  const f=fixture(language),a=f.c.state().actors[0];await f.c.rules({splitMovement:true,shieldsEnabled:true});await f.c.edit(a.id,{reactionChoices:['block'],shieldProfiles:[{id:'bubble',name:'Bubble',kind:'absorb',turns:3}]});await f.c.start(false);assert(f.ui.root.innerHTML.includes('ct-reactions-off'));assert(f.ui.root.innerHTML.includes('data-action="activate-shield"'));await f.c.rules({reactionsEnabled:true,reactionsPerTurn:2});await f.c.edit(a.id,{reactionsPerTurn:null,reactionSpent:2,reactionUsed:true});assert(!f.ui.root.innerHTML.includes('ct-reactions-off'));assert(f.ui.root.innerHTML.includes('0 / 2'));await f.c.edit(a.id,{reactionsPerTurn:0});assert(f.ui.root.innerHTML.includes('data-reaction-state="none"'));assert(!f.ui.root.innerHTML.includes('ct-reactions-off'));assert(f.ui.root.innerHTML.includes('data-action="activate-shield"'));f.ui.destroy();
 });
 test('1921 '+language+' participant editor saves traits and numeric reaction override without resetting usage',async()=>{
  const f=fixture(language),a=f.c.state().actors[0];await f.c.edit(a.id,{reactionSpent:1,reactionUsed:true});await f.click('edit',a.id);const d=f.editor(),values=actorForm(E.findActor(f.c.state(),a.id));values.set('traits-present','1');values.set('immune-burning','on');values.set('resist-fire','on');values.set('reactionsPerTurn','3');assert(d.innerHTML.includes(language==='en'?'Immunities & resistances':'Immunitäten & Resistenzen'));assert.equal(await submit(d),undefined);const saved=E.findActor(f.c.state(),a.id);assert.equal(saved.reactionsPerTurn,3);assert.equal(saved.reactionSpent,1);assert.deepEqual(saved.conditionImmunities,['burning']);assert.deepEqual(saved.damageResistances,['fire']);f.ui.destroy();
 });
 test('1921 '+language+' resource editing retains unsaved immunities and explicit clearing affects only the selected condition',async()=>{
  const f=fixture(language),a=f.c.state().actors[0];await f.c.edit(a.id,{resources:[],effects:[{type:'burning',turns:3,damage:'2'},{type:'poisoned',turns:3,damage:'1'}]});await f.click('supplies',a.id);const before=E.clone(f.c.state()),values=new Map([['traits-present','1'],['immune-burning','on'],['resist-fire','on'],['clearImmuneStatuses','on'],['actor-effect-0-type','burning'],['actor-effect-0-turns','3'],['actor-effect-0-damage','2'],['actor-effect-1-type','poisoned'],['actor-effect-1-turns','3'],['actor-effect-1-damage','1']]);globalThis.FormData=class{constructor(){return values;}};await f.editor().querySelector('form').emit('click',{target:{closest:()=>({dataset:{resourceAdd:'ammo'}})}});assert.deepEqual(f.c.state(),before);const d=f.editor();assert(d.open);assert.equal(values.get('immune-burning'),'on');assert.equal(values.get('resist-fire'),'on');values.set('resource-0-name','Mana');values.set('resource-0-quantity','5');values.set('resource-0-cost','1');assert.equal(await submit(d),undefined);const saved=E.findActor(f.c.state(),a.id);assert.deepEqual(saved.conditionImmunities,['burning']);assert.deepEqual(saved.damageResistances,['fire']);assert(!saved.effects.some(e=>e.type==='burning'));f.ui.destroy();
 });
 test('1921 '+language+' calculations open from an editor using current saved rules and preserve its draft',async()=>{
  const f=fixture(language),a=f.c.state().actors[0];await f.c.rules({reactionsPerTurn:4,statMode:'bonuses'});await f.click('edit',a.id);const parent=f.editor(),values=actorForm(a);values.set('name','Unsaved calculation reader');await parent.querySelector('form').emit('click',{target:{closest:q=>q==='[data-help-section]'?{dataset:{helpSection:'calculations'}}:null}});const d=f.editor();assert.notEqual(d,parent);assert(d.innerHTML.includes('ct-calculations'));assert(d.innerHTML.includes(language==='en'?'entered value':'Bonus'));assert(d.innerHTML.includes('50%'));assert(parent.open);await d.querySelector('[data-help-close]').emit('click',{});assert.equal(await submit(parent),undefined);assert.equal(E.findActor(f.c.state(),a.id).name,'Unsaved calculation reader');f.ui.destroy();
 });
}
