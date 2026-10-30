import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../engine.js';
import {skillPreset,skillsFrom} from '../skills.js';
import {skillsMarkup,readSkills} from '../skills-ui.js';
import {skillExplanation} from '../skill-help.js';
import {abilityRestriction,selfAbility} from '../ability-ui.js';
import {planBasicTurn,resolveBasicTurn,resolveBasicTurnAsync} from '../ai.js';
import {planAdvancedTurn} from '../advanced-ai.js';
import {resolveAdvancedTurnAsync} from '../advanced-runner.js';
import {createController} from '../controller.js';
import {exportProfiles,profileFrom} from '../profiles.js';
const roll=n=>n===20?15:2,noRoll=()=>{throw Error('No roll expected');};
const alert=(extra={})=>({...skillPreset('alert','en'),id:'call',ai:true,...extra});
function scene({caller={},helper={},foe={},others=[],rules={},board={}}={}){
 let s=E.emptyState();s.rules=E.rulesFrom({...s.rules,visionEnabled:true,visionBase:3,visionPerception:false,hideUnseenEnemies:true,statMode:'bonuses',splitMovement:true,multiActionsEnabled:true,movementBase:3,movementStat:'none',natural20:false,stancesEnabled:false,damageAbility:false,rngMode:'seeded',seed:'alert-hf9',...rules});s.board={...s.board,width:16,height:9,...board};
 s.actors=[{id:'caller',name:'Caller',side:'player',control:'manual',initiative:100,position:{x:2,y:2},skills:[alert()],...caller},{id:'helper',name:'Helper',side:'ally',control:'basic',initiative:80,position:{x:0,y:5},...helper},{id:'foe',name:'Foe',side:'enemy',control:'manual',initiative:50,position:{x:4,y:2},...foe},...others].map(v=>E.actorFrom({hp:30,maxHp:30,dc:12,...v},true,s.rules.statMode));return E.startCombat(E.validateState(s)).state;
}
const caller=s=>s.actors.find(v=>v.id==='caller'),helper=s=>s.actors.find(v=>v.id==='helper'),ability=s=>caller(s).skills.find(v=>v.kind==='alert');
const call=(s,options={roll:noRoll})=>E.resolveAction(s,{type:'skill',actor:'caller',target:'caller',skill:'call',turn:E.turnToken(s)},options);
const next=(s,id='helper')=>{while(s.phase==='active'&&E.currentActor(s)?.id!==id)s=E.endTurn(s,undefined,{roll}).state;return s;};
const rounds=(s,n)=>{const end=s.round+n;while(s.phase==='active'&&s.round<end)s=E.endTurn(s,undefined,{roll}).state;return s;};
function harness(state){let key='a';const chats={a:{state,history:[]},b:{state:E.emptyState(),history:[]}};const c=createController({key:()=>key,read:()=>chats[key],write:v=>chats[key]=v,save:async()=>{},preferences:()=>({language:'en'})});return {c,chats,switch:()=>key='b'};}

test('Alert defaults to a self action with no d20 check, radius 6 and three-round cooldown',()=>{
 const s=scene(),v=ability(s);assert.equal(v.check,false);assert.equal(v.range,6);assert.equal(v.alertCooldown,3);assert.equal(v.turns,6);assert(selfAbility(v));assert.equal(E.alertAbilityStatus(s,caller(s),v).ready,true);
 const forced=E.actorFrom({...caller(s),skills:[{...v,check:true}]},true,'bonuses');assert.equal(forced.skills[0].check,false);
});
test('manual alert consumes exactly one action and stock once, without dice, movement or granted actions',()=>{
 const s=scene({caller:{resources:[{id:'horn',name:'Horn',kind:'ammo',quantity:3}],skills:[alert({resource:'horn',cost:2})]}}),before=E.clone(s),r=call(s),a=caller(r.state),b=helper(r.state);
 assert.deepEqual(s,before);assert.equal(a.resources[0].quantity,1);assert.equal(E.actionBudget(r.state,a).free.remaining,0);assert.deepEqual(a.position,caller(s).position);assert.deepEqual(b.position,helper(s).position);assert.equal(E.actionBudget(r.state,b).free.remaining,1);assert.deepEqual(r.state.rng,s.rng);assert.equal(r.result.alarm,true);assert.deepEqual(r.result.recipients,['helper']);assert.equal(b.aiMemory.packCall.source,'caller');assert.deepEqual(b.aiMemory.packCall.position,{x:4,y:2});assert.equal(b.aiMemory.packCall.approach,true);assert.equal(a.aiMemory.callCooldown,4);E.validateState(r.state);
});
test('manual callers may regroup allies even without a visible enemy',()=>{
 const s=scene({foe:{position:{x:15,y:8}}});assert(!E.visibleTo(s,caller(s),s.actors[2]));assert.equal(call(s).result.success,true);
});
for(const [name,patch]of Object.entries({dead:{hp:0,condition:'dead'},unconscious:{hp:0,condition:'unconscious'},escaped:{escaped:true,position:null},reserve:{reserve:true,position:null},opponent:{side:'enemy'},nearby:{position:{x:2,y:3}},outside:{position:{x:15,y:7}},stunned:{effects:[{type:'stunned',turns:2}]},rooted:{tactics:[{type:'rooted',turns:2}]},engaged:{position:{x:5,y:3}}}))test('no useful recipient: '+name+' rejects atomically before paying or rolling',()=>{
 const s=scene({helper:patch,caller:{resources:[{id:'horn',name:'Horn',kind:'ammo',quantity:3}],skills:[alert({resource:'horn'})]}}),before=E.clone(s);assert.equal(E.alertAbilityStatus(s,caller(s),ability(s)).ready,false);assert.throws(()=>call(s));assert.deepEqual(s,before);
});
test('unreachable allies behind a sealed wall cannot be the only recipients',()=>{
 const s=scene({helper:{position:{x:0,y:2}},board:{blocked:Array.from({length:9},(_,y)=>({x:1,y}))}});assert.equal(E.alertAbilityStatus(s,caller(s),ability(s)).ready,false);assert.throws(()=>call(s));
});
test('a protected Advanced territory need not be left to answer a rally call',()=>{
 const s=scene({helper:{control:'advanced',aiConfig:{free:false,radius:0,idle:'wait'}}});assert.equal(E.alertAbilityStatus(s,caller(s),ability(s)).ready,false);
});
test('disabled abilities, board, insufficient stock or a non-self target reject without a change',()=>{
 for(const rules of [{skillsEnabled:false},{boardEnabled:false}]){const s=scene({rules}),before=E.clone(s);assert.throws(()=>call(s));assert.deepEqual(s,before);}
 const s=scene({caller:{resources:[{id:'horn',kind:'ammo',name:'Horn',quantity:0}],skills:[alert({resource:'horn'})]}});assert.throws(()=>call(s));const valid=scene();assert.throws(()=>E.resolveAction(valid,{type:'skill',actor:'caller',target:'foe',skill:'call'}));
});
test('a duplicate receipt does not charge again or create another call',()=>{
 const r=call(scene(),{roll:noRoll,receipt:'once'}),id=helper(r.state).aiMemory.packCall.id,again=call(r.state,{roll:noRoll,receipt:'once'});assert.equal(again.state,r.state);assert(again.result.duplicate);assert.equal(helper(again.state).aiMemory.packCall.id,id);
});
test('matching skill extras pay the call; healing-only extras cannot',()=>{
 const s=scene({caller:{actionsPerTurn:1,bonusActions:[{id:'skill',name:'Ability',count:1,allowed:['skill']}]}});assert.equal(call(s).result.actionPool.id,'skill');const bad=scene({caller:{actionsPerTurn:1,bonusActions:[{id:'heal',name:'Heal',count:1,allowed:['use']}]}});const spent=E.resolveAction(bad,{type:'other',actor:'caller',description:'Wait'}).state;assert.throws(()=>call(spent));assert.match(abilityRestriction(spent,caller(spent),caller(spent),ability(spent),'en'),/No matching action/);
});
test('Basic AI calls once only with an enabled ability and a visible opponent',()=>{
 const s=scene({caller:{control:'basic'}}),before=E.clone(s),plan=planBasicTurn(s);assert.equal(plan.intent.type,'skill');assert.equal(plan.intent.skill,'call');assert.equal(plan.move,null);assert.deepEqual(s,before);
 for(const patch of [{skills:[]},{skills:[alert({ai:false})]}]){const other=scene({caller:{control:'basic',...patch}});assert.notEqual(planBasicTurn(other).intent.skill,'call');}
 const unseen=scene({caller:{control:'basic'},foe:{position:{x:15,y:8}}});assert.notEqual(planBasicTurn(unseen).intent.skill,'call');
});
test('an existing nearby ally already fighting prevents an automatic Basic reinforcement call',()=>{
 const s=scene({caller:{control:'basic'},others:[{id:'support',name:'Support',side:'ally',position:{x:3,y:2}}]});assert.equal(E.automaticAlert(s,caller(s)),undefined);assert.notEqual(planBasicTurn(s).intent.skill,'call');
});
test('received calls suppress chain howling and fresh-opponent bypasses in the whole group',()=>{
 let s=call(scene({helper:{skills:[alert()]},others:[{id:'third',name:'Third',side:'ally',control:'basic',position:{x:0,y:4},skills:[alert()]}]})).state;
 assert.equal(E.alertAbilityStatus(s,caller(s),ability(s)).reason,'cooldown');assert.equal(helper(s).aiMemory.callCooldown,4);s=next(s);assert.notEqual(planBasicTurn(s).intent.skill,'call');
 s=E.moveActor(s,'foe',{x:1,y:4},true).state;assert.equal(E.automaticAlert(s,helper(s)),undefined);assert.equal(E.alertAbilityStatus(s,helper(s),helper(s).skills[0]).ready,false);
});
test('after cooldown, help already en route still suppresses another call',()=>{
 let s=call(scene()).state;s=rounds(s,3);s=next(s,'caller');assert.equal(E.alertAbilityStatus(s,caller(s),ability(s)).reason,'informed');assert.throws(()=>call(s));
});
test('arrived reinforcement suppresses a repeat even after the notice lifetime',()=>{
 let s=call(scene()).state;s=E.moveActor(s,'helper',{x:1,y:2},true).state;assert(helper(s).aiMemory.packCall.done);s=rounds(s,7);s=next(s,'caller');assert.equal(E.alertAbilityStatus(s,caller(s),ability(s)).reason,'informed');
});
test('a later expired call can reach a genuinely new available ally without following a stale point',()=>{
 let s=call(scene()).state;s=E.editActor(s,'helper',{escaped:true,position:null}).state;s=rounds(s,7);s=next(s,'caller');assert.equal(E.rallyNotice(s,helper(s)),null);s=E.addActor(s,{id:'new-helper',name:'New helper',side:'ally',position:{x:0,y:4},control:'basic'}).state;const r=call(s);assert.deepEqual(r.result.recipients,[r.state.actors.find(a=>a.name==='New helper').id]);
});
test('the rally point is fixed when the caller subsequently moves',()=>{
 let s=call(scene()).state;s=E.moveActor(s,'caller',{x:3,y:1}).state;assert.deepEqual(helper(s).aiMemory.packCall.position,{x:4,y:2});assert.deepEqual(E.rallyNotice(s,helper(s)).position,{x:4,y:2});
});
test('manual recipients receive a notice and retain their exact position/control/budget',()=>{
 const s=scene({helper:{control:'manual'}}),r=call(s);assert.equal(helper(r.state).control,'manual');assert.deepEqual(helper(r.state).position,helper(s).position);assert.equal(E.actionBudget(r.state,helper(r.state)).free.remaining,1);assert(E.rallyNotice(r.state,helper(r.state)));assert.equal(helper(r.state).aiMemory.opponents.length,0);
});
for(const async of [false,true])test((async?'async':'sync')+' Basic reinforcement notices new opponents on the route and still uses its action',async()=>{
 let s=next(call(scene()).state);assert.equal(E.visibleTo(s,helper(s),s.actors[2]),false);const planned=planBasicTurn(s);assert(planned.followCall);const r=await(async?resolveBasicTurnAsync:resolveBasicTurn)(s,{roll,yield:async()=>{}}),log=r.state.log.filter(e=>e.details?.actor==='helper');assert(log.some(e=>e.type==='move'));assert(log.some(e=>['hit','miss'].includes(e.type)));assert(E.movementBudget(r.state,helper(r.state)).spent<=3);assert.equal(helper(r.state).aiMemory.packCall.done,true);assert.notEqual(E.currentActor(r.state).id,'helper');
});
test('following a call ticks a periodic status once at the actual turn end',()=>{
 let s=next(call(scene({helper:{effects:[{type:'bleeding',turns:3,damage:'1',appliedTurn:0}]},foe:{position:{x:15,y:8}}})).state);const r=resolveBasicTurn(s,{roll}),ticks=r.state.log.filter(e=>e.type==='effect'&&e.details.actor==='helper');assert.equal(ticks.length,1);assert.equal(helper(r.state).hp,29);assert.equal(helper(r.state).effects[0].turns,2);
});
test('an arrived Basic recipient waits near the point instead of immediately patrolling away',()=>{
 let s=call(scene({foe:{position:{x:15,y:8}}})).state;s=E.moveActor(s,'helper',{x:1,y:2},true).state;s=next(s);const plan=planBasicTurn(s);assert.equal(plan.move,null);assert.equal(plan.intent.type,'endTurn');
});
test('asynchronous stop after a rally step preserves the remaining action for resuming',async()=>{
 const s=next(call(scene()).state);let stop=false;const r=await resolveBasicTurnAsync(s,{roll,shouldStop:()=>stop,yield:async()=>{stop=true;}});assert(r.result.paused);assert.equal(E.currentActor(r.state).id,'helper');assert.equal(E.actionBudget(r.state,helper(r.state)).free.remaining,1);assert(E.movementBudget(r.state,helper(r.state)).spent>0);const resumed=await resolveBasicTurnAsync(r.state,{roll,yield:async()=>{}});assert.notEqual(E.currentActor(resumed.state)?.id,'helper');
});
test('advanced recipients receive only the reported clue, without extra sight or observed target records',()=>{
 const r=call(scene({helper:{control:'advanced',aiConfig:{idle:'search',free:true}}})),b=helper(r.state);assert.equal(b.aiMemory.alert.target,'foe');assert.deepEqual(b.aiMemory.alert.position,{x:4,y:2});assert.equal(b.aiMemory.opponents.length,0);assert.equal(E.visibleTo(r.state,b,r.state.actors[2]),false);assert.deepEqual(E.rallyNotice(r.state,b).position,{x:4,y:2});
});
test('Advanced automatic calling uses the assigned skill costs instead of the old configuration',()=>{
 const s=scene({caller:{control:'advanced',actionsPerTurn:2,aiConfig:{alarm:true,alarmResource:'old',alarmCost:99},resources:[{id:'old',name:'Old mana',kind:'ammo',quantity:5},{id:'horn',name:'Horn',kind:'ammo',quantity:2}],skills:[alert({resource:'horn',cost:1})]}});assert(E.canAlarm(s,caller(s)));const r=E.resolveAction(s,{type:'alarm',actor:'caller'},{source:'advanced',roll:noRoll});assert.equal(r.result.skillKind,'alert');assert(r.state.log.some(e=>e.details?.skillKind==='alert'));assert.equal(caller(r.state).resources[0].quantity,5);assert.equal(caller(r.state).resources[1].quantity,1);assert.equal(E.actionBudget(r.state,caller(r.state)).free.remaining,1);
});
test('explicitly disabling the ability AI permission or Advanced automatic alert cannot fall back to legacy use',()=>{
 for(const config of [{control:'advanced',aiConfig:{alarm:true},skills:[alert({ai:false})]},{control:'advanced',aiConfig:{alarm:false}}]){const s=scene({caller:config});assert(!E.canAlarm(s,caller(s)));assert.throws(()=>E.resolveAction(s,{type:'alarm',actor:'caller'},{source:'advanced'}));assert(call(s).result.alarm);}
});
test('legacy Advanced alert continues to report threats and can summon a Basic recipient',()=>{
 const s=scene({caller:{control:'advanced',skills:[],aiConfig:{alarm:true,alarmRadius:6}}});assert(E.canAlarm(s,caller(s)));const r=E.resolveAction(s,{type:'alarm',actor:'caller'},{source:'advanced'});assert.equal(r.result.type,'other');assert(E.rallyNotice(r.state,helper(r.state)));assert.deepEqual(helper(r.state).aiMemory.packCall.position,{x:2,y:2});
});
test('an Advanced recipient can follow a generic call with no target report',async()=>{
 let s=call(scene({helper:{control:'advanced',aiConfig:{idle:'wait',free:true}},foe:{position:{x:15,y:8}}})).state;s=next(s);const p=planAdvancedTurn(s);assert(p.followCall);assert(p.move);const r=await resolveAdvancedTurnAsync(s,{roll,yield:async()=>{}});assert.notDeepEqual(helper(r.state).position,helper(s).position);
});
test('call state persists across JSON, Undo and Redo without restarting the cooldown or rerolling',async()=>{
 const {c,chats}=harness(scene());await c.act({type:'skill',actor:'caller',target:'caller',skill:'call'},{roll:noRoll});const memory=E.clone(helper(c.state()).aiMemory),rng=E.clone(c.state().rng);chats.a=JSON.parse(JSON.stringify(chats.a));E.validateState(c.state());assert.deepEqual(helper(c.state()).aiMemory,memory);await c.undo();assert.equal(helper(c.state()).aiMemory.packCall,null);assert.equal(caller(c.state()).aiMemory.callCooldown,0);await c.redo();assert.deepEqual(helper(c.state()).aiMemory,memory);assert.deepEqual(c.state().rng,rng);
});
test('restart and portable actor profiles clear encounter calls while retaining the ability',()=>{
 const s=call(scene()).state,restarted=E.startCombat(E.stopCombat(s).state).state;assert.equal(helper(restarted).aiMemory.packCall,null);assert.equal(caller(restarted).aiMemory.callCooldown,0);const profiles=profileFrom(exportProfiles(s,'actors'));assert.equal(profiles.actors[0].skills[0].kind,'alert');assert(profiles.actors.every(a=>a.aiMemory.packCall===null&&a.aiMemory.callCooldown===0));
});
test('changing allegiance invalidates the group rather than revealing a now-hostile caller',()=>{
 let s=call(scene()).state;s=E.editActor(s,'caller',{side:'enemy'}).state;assert.equal(helper(s).aiMemory.packCall,null);assert.equal(E.rallyNotice(s,helper(s)),null);
});
test('hidden enemy pack calls do not expose their members or rally point to player model context',()=>{
 const s=scene({caller:{side:'enemy',name:'SECRET_CALLER',position:{x:2,y:2}},helper:{side:'enemy',name:'SECRET_HELPER',position:{x:0,y:5}},foe:{side:'player',position:{x:15,y:8}},rules:{visionBase:1}}),r=call(s),p=E.buildPrompt(r.state,{mode:'narrate',narrationScope:'turn'});assert(!p.includes('SECRET_CALLER'));assert(!p.includes('SECRET_HELPER'));assert(!p.includes('"callPosition":{"x":2'));
});
test('public call state survives fog filtering for known allies without exposing opponent memories',()=>{
 const s=call(scene({foe:{position:{x:15,y:8}}})).state,view=E.playerView(s);assert(view._playerView);assert(E.rallyNotice(view,helper(view)));assert.equal(E.alertAbilityStatus(view,caller(view),ability(view)).reason,'cooldown');const p=E.buildPrompt(s,{compact:true});assert(p.includes('"rallyCall"'));assert(!p.includes('"opponents"'));
});
test('call snapshots reject invalid coordinates, negative cooldown or reversed lifetimes',()=>{
 const s=call(scene()).state;for(const change of [a=>a.aiMemory.callCooldown=-1,a=>a.aiMemory.packCall.position.x=99,a=>a.aiMemory.packCall.expires=0,a=>a.aiMemory.packCall.source='',a=>a.aiMemory.packCall.done='yes']){const raw=E.clone(s);change(raw.actors[1]);assert.throws(()=>E.validateState(raw));}
});
for(const language of ['de','en'])test(language+' ability editor/help describe radius, shared cooldown and manual recipient control',()=>{
 const s=scene(),a=caller(s),v=ability(s),html=skillsMarkup(a,a.skills,language,s.rules),help=skillExplanation(a,v,language,s.rules);assert(html.includes('name="skill-0-alertCooldown"'));assert(html.includes(language==='en'?'Alert radius':'Alarmradius'));assert(html.includes(language==='en'?'Rally point lifetime':'Sammelpunkt gültig'));assert(!help.includes('target own turns'));assert(help.includes(language==='en'?'Manual recipients receive a notice only':'Manuelle Empfänger erhalten nur einen Hinweis'));assert(help.includes(language==='en'?'shared with the notified group':'auch für die verständigte Gruppe'));assert.equal(abilityRestriction(s,a,a,v,language),'');
 const r=call(s);assert(abilityRestriction(r.state,caller(r.state),caller(r.state),ability(r.state),language).includes('Cooldown')||language==='en'&&abilityRestriction(r.state,caller(r.state),caller(r.state),ability(r.state),language).includes('cooldown'));
});
test('a whole Basic wolf pack produces one call across ten combat rounds, not one howl per wolf',()=>{
 let s=scene({caller:{side:'enemy',control:'basic',weaponList:[{id:'claws',name:'Claws',mode:'melee',damage:'1d4'}]},helper:{side:'enemy',skills:[alert()],weaponList:[{id:'claws',mode:'melee',damage:'1d4'}]},foe:{side:'player',hp:500,maxHp:500},others:[{id:'wolf-three',name:'Wolf three',side:'enemy',control:'basic',initiative:70,position:{x:0,y:4},skills:[alert()],weaponList:[{id:'claws',mode:'melee',damage:'1d4'}]}]});
 let steps=0;while(s.phase==='active'&&s.round<11&&steps++<80){s=E.currentActor(s).control==='basic'?resolveBasicTurn(s,{roll}).state:E.endTurn(s,undefined,{roll}).state;E.validateState(s);}
 const calls=s.log.filter(e=>e.details?.alarm);assert.equal(calls.length,1);assert.equal(calls[0].details.actor,'caller');assert.equal(s.round,11);assert(s.log.some(e=>e.type==='hit'&&e.details.actor==='helper'));
});
test('a failed custom DC check linked to Alert consumes its attempt cost but does not notify anyone',()=>{
 const s=scene({caller:{resources:[{id:'horn',name:'Horn',kind:'ammo',quantity:3}],skills:[alert({resource:'horn'})]}}),r=E.resolveAction(s,{type:'check',actor:'caller',target:'caller',effect:'call',description:'Call through the storm',stat:'charisma',dc:99,bonus:0},{roll:n=>10});assert.equal(r.result.success,false);assert.equal(caller(r.state).resources[0].quantity,2);assert.equal(helper(r.state).aiMemory.packCall,null);assert.equal(caller(r.state).aiMemory.callCooldown,0);
});
test('resource-disabled calls do not consume a configured empty stock',()=>{
 const s=scene({rules:{resourcesEnabled:false},caller:{resources:[{id:'horn',name:'Horn',kind:'ammo',quantity:0}],skills:[alert({resource:'horn'})]}}),r=call(s);assert(r.result.alarm);assert.equal(caller(r.state).resources[0].quantity,0);
});
test('a call can be queued only for the original chat',async()=>{
 const f=harness(scene()),before=E.clone(f.chats.b);const pending=f.c.act({type:'skill',actor:'caller',target:'caller',skill:'call'});f.switch();await assert.rejects(pending,/Chat/);assert.deepEqual(f.chats.b,before);assert.equal(helper(f.chats.a.state).aiMemory.packCall,null);
});
test('an incapacitating opportunity attack interrupts a responding Basic ally without completing its rally',()=>{
 let s=scene({rules:{opportunityEnabled:true,reactionsEnabled:true,hideNeedsTerrain:false},foe:{position:{x:1,y:5},hidden:{turns:3,appliedTurn:0,round:1},reactionControl:'auto',weaponList:[{id:'blade',mode:'melee',damage:'1d4',damageBonus:40}]}});s=next(call(s).state);const r=resolveBasicTurn(s,{roll});assert.equal(helper(r.state).hp,0);assert(r.state.log.some(e=>e.details?.opportunity));assert.notDeepEqual(helper(r.state).position,{x:2,y:2});assert.notEqual(E.currentActor(r.state)?.id,'helper');
});
test('with vision disabled, distant globally known foes do not prevent manual rallying or Basic response',()=>{
 let s=scene({rules:{visionEnabled:false},foe:{position:{x:15,y:8}}});assert(E.visibleTo(s,helper(s),s.actors[2]));assert(!E.alertEngaged(s,helper(s)));s=next(call(s).state);const plan=planBasicTurn(s);assert(plan.followCall);assert(plan.move);const r=resolveBasicTurn(s,{roll});assert(E.distance(helper(r.state).position,{x:2,y:2})<E.distance(helper(s).position,{x:2,y:2}));
});
test('a responding Basic ally can heal first and still spend its remaining movement on the call',()=>{
 let s=scene({helper:{hp:5,resources:[{id:'potion',name:'Potion',kind:'supply',quantity:1,heal:'1d4+2',range:0}]},foe:{position:{x:15,y:8}}});s=next(call(s).state);const r=resolveBasicTurn(s,{roll});assert.equal(helper(r.state).hp,9);assert.equal(helper(r.state).resources[0].quantity,0);assert(E.distance(helper(r.state).position,{x:2,y:2})<E.distance(helper(s).position,{x:2,y:2}));assert.equal(r.state.log.filter(e=>e.type==='use'&&e.details.actor==='helper').length,1);assert(E.movementBudget(r.state,helper(r.state)).spent<=3);
});
test('a visible enemy howl stays narratable without exposing hidden pack members or their count',()=>{
 const s=scene({caller:{side:'enemy',name:'Visible wolf'},helper:{side:'enemy',name:'SECRET_REINFORCEMENT'},foe:{side:'player',position:{x:4,y:2}}}),r=call(s),before=E.clone(r.state),view=E.playerView(r.state),event=view.log.findLast(e=>e.details?.alarm);assert(event);assert.equal(event.details.actorName,'Visible wolf');assert.deepEqual(event.details.recipients,[]);assert(!JSON.stringify(event).includes('SECRET_REINFORCEMENT'));const prompt=E.buildPrompt(r.state,{mode:'narrate',narrationScope:'turn'});assert(prompt.includes('Visible wolf'));assert(prompt.includes('reinforcements'));assert(!prompt.includes('SECRET_REINFORCEMENT'));assert.deepEqual(r.state,before);
});
