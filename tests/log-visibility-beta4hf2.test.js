import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../engine.js';
import { skillPreset } from '../skills.js';
import { latestResult } from '../results.js';
import { narrationEvents } from '../model-context.js';

function scene(language='en'){
 let s=E.emptyState();s.rules=E.rulesFrom({...s.rules,language,visionEnabled:true,visionBase:4,visionPerception:false,hideUnseenEnemies:true,splitMovement:true,natural20:false,stancesEnabled:false});s.board={...s.board,width:16,height:12};
 s.actors=[{id:'hero',name:'Visible hero',side:'player',initiative:100,position:{x:1,y:1},weaponList:[{id:'blade',name:'Blade',mode:'melee',damage:'1d6',damageBonus:2}],attackMode:'melee',skills:[{...skillPreset('intimidate'),id:'fear',check:false,range:4}]},{id:'hidden-archer',name:'Secret archer',side:'enemy',initiative:80,position:{x:14,y:9}},{id:'visible-foe',name:'Visible foe',side:'enemy',initiative:60,position:{x:2,y:1}}].map(a=>E.actorFrom({...a,hp:20,maxHp:20,dc:10},true));
 return E.startCombat(E.validateState(s)).state;
}
function attack(language='en',hit=true){return E.resolveAction(scene(language),{type:'attack',actor:'hero',target:'visible-foe',weapon:'blade'},{roll:n=>n===20?(hit?15:1):1});}
const privateFree=value=>{const text=JSON.stringify(value);assert(!text.includes('hidden-archer'));assert(!text.includes('Secret archer'));assert(!text.includes('O10'));};

for(const language of ['de','en'])for(const hit of [true,false])test(language+' visible '+(hit?'hit':'miss')+' stays in the log when next initiative belongs to an unseen actor',()=>{
 const {state:s,result}=attack(language,hit),before=E.clone(s),original=s.log.find(e=>e.details.type==='attack'),view=E.playerView(s),event=view.log.find(e=>e.id===original.id);
 assert(event);assert.equal(event.details.hit,hit);assert.equal(event.details.damage,hit?3:0);assert.equal(event.details.target,'visible-foe');assert(!event.details.initiative);
 assert(E.eventText(event,language).includes(hit?(language==='en'?'HIT':'TREFFER'):(language==='en'?'MISS':'FEHLSCHLAG')));assert(E.publicValue(s,original));assert(E.publicValue(s,result));
 privateFree(view);assert.deepEqual(s,before);assert.equal(original.details.initiative.next.id,'hidden-archer');assert(original.textEn.includes('Next: Secret archer'));
});

for(const language of ['de','en'])test(language+' visible ability result and ended turn survive an unseen next/current actor',()=>{
 const resolved=E.resolveAction(scene(language),{type:'skill',actor:'hero',target:'visible-foe',skill:'fear'}),s=E.endTurn(resolved.state).state,view=E.playerView(s);
 assert(view.unseenTurn);assert.equal(E.currentActor(view),null);assert(view.log.some(e=>e.type==='skill'&&e.details.success));assert(view.log.some(e=>e.type==='turn'&&e.details.actor==='hero'));
 const selected=latestResult(view.log);assert.equal(selected.event.type,'skill');assert.equal(selected.turn.type,'turn');assert.equal(narrationEvents(view.log)[0].details.skill,'fear');privateFree(view);
});

test('the latest attack and focused narration retain damage after the turn advances to an unseen actor',()=>{
 const s=E.endTurn(attack().state).state,view=E.playerView(s),last=latestResult(view.log);assert.equal(last.event.type,'hit');assert.equal(last.event.details.damage,3);assert.equal(last.turn.details.actor,'hero');
 for(const compact of [true,false]){const prompt=E.buildPrompt(s,{compact,mode:'narrate'});assert(prompt.includes('Visible hero'));assert(prompt.includes('Visible foe'));assert(prompt.includes('3'));privateFree(prompt);}
});

for(const field of ['actor','target'])test('actual unseen '+field+' still hides a result even when its initiative footer is removable',()=>{
 const s=attack().state,source=s.log.find(e=>e.details.type==='attack'),event=E.clone(source);event.id='private-action';event.details[field]='hidden-archer';event.details[field+'Name']='Secret archer';s.log.push(event);
 assert(!E.publicValue(s,event));assert(!E.publicValue(s,event.details));assert(!E.playerView(s).log.some(e=>e.id===event.id));
});

test('removing a hidden initiative footer does not make other private narrative details public',()=>{
 const s=attack().state,event=s.log.find(e=>e.details.type==='attack');event.details.description='Secret archer waits at O10';assert(!E.publicValue(s,event));assert(!E.playerView(s).log.some(e=>e.id===event.id));
});

test('a visible same-name participant remains public while the hidden copy ID and initiative stay private',()=>{
 let s=scene();s.actors.find(a=>a.id==='hidden-archer').name='Visible foe';s=E.resolveAction(s,{type:'attack',actor:'hero',target:'visible-foe',weapon:'blade'},{roll:n=>n===20?15:1}).state;
 const original=s.log.find(e=>e.details.type==='attack'),view=E.playerView(s),event=view.log.find(e=>e.id===original.id);assert(event);assert.equal(event.details.targetName,'Visible foe');assert(!JSON.stringify(view).includes('hidden-archer'));assert(E.publicValue(s,original));
});

test('GM view and disabling enemy hiding preserve the complete original log and initiative metadata',()=>{
 const s=attack().state,original=s.log.find(e=>e.details.type==='attack');assert.equal(E.playerView(s,true),s);assert(E.playerView(s,true).log.includes(original));
 const revealed=E.setRules(s,{hideUnseenEnemies:false}).state;assert.equal(E.playerView(revealed),revealed);assert(revealed.log.find(e=>e.id===original.id).details.initiative);
});
