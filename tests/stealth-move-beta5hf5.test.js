import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../engine.js';
import {skillPreset} from '../skills.js';
import {readHidden} from '../hidden-ui.js';
import {statusMarkers} from '../status-ui.js';
import {createController} from '../controller.js';
import {exportProfiles,profileFrom} from '../profiles.js';
import {planAdvancedTurn} from '../advanced-ai.js';
const noRoll=()=>{throw Error('No roll expected');};
const user=s=>s.actors.find(a=>a.id==='sneak'),foe=s=>s.actors.find(a=>a.id==='foe');
const action=(type,extra={})=>({type,actor:'sneak',...extra});
const skill=(kind,extra={})=>({...skillPreset(kind,'en'),id:kind,check:false,...extra});
function scene({opportunity=false,rules={},actor={}}={}){
 let s=E.emptyState();s.rules=E.rulesFrom({...s.rules,statMode:'bonuses',multiActionsEnabled:true,splitMovement:true,movementBase:8,movementStat:'none',damageAbility:false,natural20:true,stancesEnabled:false,reactionsEnabled:true,opportunityEnabled:opportunity,hideNeedsTerrain:true,rngMode:'seeded',seed:'sneak',...rules});
 s.board={...s.board,width:12,height:10,blocked:[{x:2,y:1}]};
 s.actors=[{id:'sneak',name:'Sneak',side:'player',initiative:100,position:{x:2,y:2},hp:10,maxHp:20,actionsPerTurn:5,attackBonus:20,weaponList:[{id:'bow',mode:'ranged',range:12,damage:'1d4'}],resources:[{id:'potion',kind:'supply',name:'Potion',quantity:2,heal:'2',range:0},{id:'charges',name:'Charges',kind:'ammo',quantity:3}],skills:[skill('hide'),skill('narrative',{id:'gated',prerequisite:'hidden',check:true,dc:10,dcMode:'fixed',range:0,resource:'charges',cost:1,mechanics:{target:'self',healing:{dice:'1d4',bonus:0}}}),skill('aim')],...actor},{id:'foe',name:'Foe',side:'enemy',initiative:50,position:{x:8,y:2},hp:50,maxHp:50,weaponList:[{id:'blast',mode:'ranged',range:20,damage:'1d4',radius:3}]},{id:'friend',name:'Friend',side:'ally',initiative:10,position:{x:6,y:3},hp:30,maxHp:30}].map(a=>E.actorFrom({dc:10,...a},true));
 return E.startCombat(E.validateState(s)).state;
}
const hide=s=>E.resolveAction(s,action('skill',{skill:'hide',target:'sneak'}),{roll:noRoll}).state;
const leave=(s,p={x:5,y:2})=>E.moveActor(s,'sneak',p,false,{roll:noRoll}).state;
const open=options=>leave(hide(scene(options)));
for(const opportunity of [false,true]){
 test('leaving cover preserves concealment and ordinary movement costs; multiple moves, OA='+opportunity,()=>{
  const original=hide(scene({opportunity})),before=E.clone(original);let s=leave(original);assert.deepEqual(original,before);assert(user(s).hidden.pendingReveal);assert.equal(E.movementBudget(s,user(s)).spent,3);assert(!E.visibleTo(s,foe(s),user(s)));assert(!E.canAttack(s,foe(s),user(s),'ranged',foe(s).position,'profile','blast'));
  s=leave(s,{x:5,y:3});assert(user(s).hidden.pendingReveal);assert.equal(E.movementBudget(s,user(s)).spent,4);assert.equal(user(s).hidden.turns,3);E.validateState(s);
 });
 for(const hit of [false,true])test('first open-ground attack retains ambush and reveals on hit/miss; OA='+opportunity+', hit='+hit,()=>{
  const s=open({opportunity}),r=E.resolveAction(s,action('attack',{target:'foe',weapon:'bow'}),{roll:n=>n===20?(hit?15:1):2});assert.equal(r.result.hit,hit);assert.equal(r.result.damage,hit?4:0);assert.equal(user(r.state).hidden,null);assert.equal(foe(r.state).hp,hit?46:50);
 });
 test('returning to cover does not refresh the pending final action; OA='+opportunity,()=>{
  let s=open({opportunity});s=leave(s,{x:2,y:2});assert(user(s).hidden.pendingReveal);s=E.resolveAction(s,action('use',{resource:'potion',target:'sneak'}),{roll:noRoll}).state;assert.equal(user(s).hp,12);assert.equal(user(s).resources[0].quantity,1);assert.equal(user(s).hidden,null);
 });
}
test('ordinary nonoffensive actions in cover keep the original hiding behavior',()=>{
 let s=hide(scene());s=E.moveActor(s,'sneak',{x:3,y:2}).state;assert(user(s).hidden);assert(!user(s).hidden.pendingReveal);s=E.resolveAction(s,action('skill',{skill:'aim',target:'sneak'})).state;assert(user(s).hidden);assert(!user(s).hidden.pendingReveal);
});
for(const success of [false,true])test('hidden-prerequisite ability works outdoors, pays once and then reveals; success='+success,()=>{
 const s=open(),a=user(s),v=a.skills.find(v=>v.id==='gated');assert(E.skillRequirementMet(s,a,v));assert(E.canUseSkill(s,a,a,v));const r=E.resolveAction(s,action('skill',{skill:'gated',target:'sneak'}),{roll:n=>n===20?(success?15:1):2});assert.equal(r.result.success,success);assert.equal(user(r.state).hp,success?12:10);assert.equal(user(r.state).resources.find(v=>v.id==='charges').quantity,2);assert.equal(user(r.state).hidden,null);
});
test('invalid action remains atomic and does not consume open-ground concealment',()=>{
 const s=open(),before=E.clone(s);assert.throws(()=>E.resolveAction(s,action('attack',{target:'foe',weapon:'missing'}),{roll:noRoll}));assert.deepEqual(s,before);assert(user(s).hidden.pendingReveal);
});
test('free narrative checks and manual edits do not consume a real action',()=>{
 let s=open();s=E.resolveAction(s,action('check',{description:'Look around',stat:'perception',bonus:0,dc:10,free:true}),{roll:()=>10}).state;assert(user(s).hidden.pendingReveal);s=E.editActor(s,'sneak',{notes:'Still waiting'}).state;assert(user(s).hidden.pendingReveal);
});
test('a normal own DC check consumes pending hiding even when it fails',()=>{
 const r=E.resolveAction(open(),action('check',{description:'Try something',stat:'strength',bonus:0,dc:99}),{roll:()=>1});assert(!r.result.success);assert.equal(user(r.state).hidden,null);
});
test('ending a turn keeps only the existing bounded hiding duration, with no refresh',()=>{
 let s=open();s=E.endTurn(s).state;assert(user(s).hidden.pendingReveal);assert.equal(user(s).hidden.turns,3);s=E.endTurn(s).state;s=E.endTurn(s).state;assert.equal(E.currentActor(s).id,'sneak');s=E.endTurn(s).state;assert.equal(user(s).hidden.turns,2);
});
test('expiry, HP damage, manual reveal, reserve and disabling hiding still reveal outdoors',()=>{
 for(const kind of ['expiry','damage','manual','reserve','rule','board']){
  let s=open();if(kind==='expiry'){s=E.editActor(s,'sneak',{hidden:{...user(s).hidden,turns:1,appliedTurn:0}}).state;s=E.endTurn(s).state;}
  if(kind==='damage')s=E.editActor(s,'sneak',{hp:user(s).hp-1}).state;
  if(kind==='manual')s=E.revealActor(s,'sneak').state;
  if(kind==='reserve')s=E.reserveActor(s,'sneak').state;
  if(kind==='rule')s=E.setRules(s,{stealthEnabled:false}).state;
  if(kind==='board')s=E.setRules(s,{boardEnabled:false}).state;
  assert.equal(user(s).hidden,null,kind);
 }
});
test('terrain-free hiding keeps its old rules, including turning off the terrain requirement',()=>{
 let s=open({rules:{hideNeedsTerrain:false}});assert(user(s).hidden);assert(!user(s).hidden.pendingReveal);s=E.resolveAction(s,action('use',{resource:'potion',target:'sneak'})).state;assert(user(s).hidden);
 s=E.setRules(open(),{hideNeedsTerrain:false}).state;assert(!user(s).hidden.pendingReveal);s=E.resolveAction(s,action('use',{resource:'potion',target:'sneak'})).state;assert(user(s).hidden);
});
test('new hide attempts in the open remain forbidden; GM corrections do not grant a movement grace',()=>{
 let s=scene();s=E.moveActor(s,'sneak',{x:5,y:2}).state;assert.throws(()=>hide(s));s=E.moveActor(hide(scene()),'sneak',{x:5,y:2},true).state;assert.equal(user(s).hidden,null);
});
test('a gap on a route between two covers grants the same pending action with or without OA',()=>{
 for(const opportunity of [false,true]){let s=scene({opportunity});s=E.setBoard(s,{blocked:[{x:2,y:1},{x:6,y:1}]}).state;s=E.moveActor(hide(s),'sneak',{x:6,y:2}).state;assert(user(s).hidden.pendingReveal);s=E.resolveAction(s,action('other',{description:'Wait'})).state;assert.equal(user(s).hidden,null);}
});
test('route risk previews do not mutate the live pending flag or choose hidden enemies for OA',()=>{
 const s=hide(scene({opportunity:true})),before=E.clone(s);assert.equal(E.opportunityRisk(s,user(s),{x:5,y:2}),0);assert.deepEqual(s,before);const advanced=E.editActor(s,'sneak',{control:'advanced'}).state,copy=E.clone(advanced);planAdvancedTurn(advanced);assert.deepEqual(advanced,copy);
});
test('full saved states preserve pending hiding, templates clear it and malformed flags are rejected',()=>{
 const s=open(),loaded=E.validateState(JSON.parse(JSON.stringify(s)));assert.deepEqual(user(loaded).hidden,user(s).hidden);assert(E.retainsConcealment(loaded,user(loaded)));const p=profileFrom(exportProfiles(s,'actor','sneak'));assert.equal(p.actors[0].hidden,null);
 for(const value of ['true',1,null]){const invalid=E.clone(s);user(invalid).hidden.pendingReveal=value;assert.throws(()=>E.validateState(invalid));}
});
test('resource editor can save existing pending hiding outdoors without granting fresh hiding there',()=>{
 const s=open(),data=new FormData();data.set('actor-hidden-present','1');data.set('actor-hidden','on');data.set('actor-hidden-turns','2');const hidden=readHidden(data,user(s),s,'en');assert(hidden.pendingReveal);assert.equal(hidden.turns,2);assert.throws(()=>readHidden(data,{...user(s),hidden:null},s,'en'));data.delete('actor-hidden');assert.equal(readHidden(data,user(s),s,'en'),null);
});
for(const language of ['de','en'])test('status and authoritative context explain pending concealment in '+language,()=>{
 let s=E.setRules(open(),{language}).state;for(const compact of [false,true])assert(statusMarkers(s,user(s),language,compact).includes(language==='en'?'until next action':'bis zur nächsten Aktion'));
 const prompt=E.buildPrompt(s,{mode:'narrate',compact:true});assert(prompt.includes('"hiddenUntilNextAction":true'));assert(prompt.includes('Moving alone does not reveal them'));assert(user(s).hidden.pendingReveal);
});
test('controller undo/import restores the one-action grace without resetting charges or its duration',async()=>{
 let bundle={state:open(),history:[]};const c=createController({key:()=> 'stealth-test',read:()=>bundle,write:v=>bundle=v,save:async()=>{}}),before=E.clone(c.state());await c.act(action('use',{resource:'potion',target:'sneak'}));assert.equal(user(c.state()).hidden,null);await c.undo();assert(user(c.state()).hidden.pendingReveal);assert.equal(user(c.state()).resources[0].quantity,2);assert.equal(user(c.state()).hidden.turns,user(before).hidden.turns);await c.import(JSON.parse(JSON.stringify(c.export())));assert(user(c.state()).hidden.pendingReveal);await c.act(action('other'));assert.equal(user(c.state()).hidden,null);
});
for(const kind of ['block','narrative'])test('an actually executed area-defense reaction consumes pending hiding: '+kind,()=>{
 const custom=skill('narrative',{id:'reaction',reaction:true,reactionTiming:'before',prerequisite:'hidden',range:0,mechanics:{target:'self',healing:{dice:'1d4',bonus:0}}});let s=open({actor:{reactionChoices:[kind],reactionCost:'extra',reactionControl:'manual',skills:[skill('hide'),custom]}});s=E.endTurn(s).state;assert.equal(E.currentActor(s).id,'foe');assert(E.reactionOptions(s,user(s),foe(s)).some(v=>v.kind===kind));const choice=kind==='block'?{kind}:{kind:'narrative',skill:'reaction',target:'sneak'};
 const r=E.resolveAction(s,{type:'attack',actor:'foe',target:'friend',weapon:'blast'},{roll:n=>n===20?1:2,reactionDecisions:{sneak:choice}});assert.equal(user(r.state).reactionSpent,1);assert.equal(user(r.state).hidden,null);assert.equal(user(r.state).hp,kind==='narrative'?12:10);
});
test('sneaking adjacent permits the first melee ambush without extra movement or action costs',()=>{
 let s=open();s=E.editActor(s,'sneak',{weaponList:[{id:'blade',mode:'melee',damage:'1d4'}]}).state;s=leave(s,{x:7,y:2});assert(user(s).hidden.pendingReveal);const before=E.actionBudget(s,user(s)),r=E.resolveAction(s,action('attack',{target:'foe',weapon:'blade'}),{roll:n=>n===20?15:2});assert(r.result.hit);assert.equal(r.result.damage,4);assert.equal(user(r.state).hidden,null);assert.equal(E.movementBudget(r.state,user(r.state)).spent,5);assert.equal(E.actionBudget(r.state,user(r.state)).free.remaining,before.free.remaining-1);
});
test('area damage can still hit a hidden participant without a chosen reaction',()=>{
 let s=E.endTurn(open()).state;const r=E.resolveAction(s,{type:'attack',actor:'foe',target:'friend',weapon:'blast'},{roll:n=>n===20?15:2});assert.equal(user(r.state).hp,9);assert.equal(user(r.state).hidden,null);
});
test('own shield activation is the next action and reveals after applying the shield',()=>{
 let s=open();s=E.setRules(s,{shieldsEnabled:true}).state;s=E.editActor(s,'sneak',{shieldProfiles:[{id:'protect',name:'Protection',kind:'absorb',turns:1,amount:0}]}).state;const r=E.resolveAction(s,action('shield',{profile:'protect'}));assert.equal(user(r.state).hidden,null);assert.equal(user(r.state).shields.length,1);
});
test('hidden movement avoids OA, but movement after the revealing action permits ordinary OA',()=>{
 let s=scene({opportunity:true});s=E.editActor(s,'foe',{reactionControl:'auto',reactionCost:'extra',attackBonus:20,weaponList:[{id:'blade',mode:'melee',damage:'1d4'}]}).state;s=leave(hide(s),{x:7,y:2});const hidden=E.moveActor(s,'sneak',{x:6,y:2},false,{roll:noRoll});assert.equal(hidden.result.opportunities.length,0);s=E.resolveAction(s,action('other')).state;assert.equal(user(s).hidden,null);const r=E.moveActor(s,'sneak',{x:6,y:2},false,{roll:n=>n===20?15:2});assert.equal(r.result.opportunities.length,1);assert.equal(user(r.state).hp,8);
});
