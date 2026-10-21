import test from 'node:test';import assert from 'node:assert/strict';
import * as E from '../engine.js';import {DAMAGE_TYPES,traitsFrom,resistDamage} from '../combat-traits.js';
import {checkOutcome,checkText} from '../checks.js';import {compactResultFeedback} from '../results.js';
import {readTraits,traitsMarkup} from '../traits-ui.js';import {skillPreset} from '../skills.js';
import {exportProfiles,profileFrom,transferPatch} from '../profiles.js';import {createController} from '../controller.js';
import {prepareHistory,packHistory,unpackHistory,historyCount} from '../history-codec.js';import {planBasicTurn} from '../ai.js';
function scene(extra={}){let s=E.setRules(E.emptyState(),{boardEnabled:false,natural20:true,damageAbility:false,splitMovement:true,multiActionsEnabled:true,rngMode:'seeded',seed:'hf1',...extra}).state;
 s=E.addActor(s,{id:'a',name:'Actor',side:'player',position:{x:1,y:1},initiative:30,hp:100,maxHp:100,actionsPerTurn:10,attackBonus:100,weaponList:[{id:'fire',name:'Fire',mode:'ranged',range:20,damage:'1d6',damageType:'fire'}],skills:[{...skillPreset('aim'),id:'aim',check:true,dc:2}]}).state;
 s=E.addActor(s,{id:'b',name:'Target',side:'enemy',position:{x:6,y:1},initiative:20,hp:100,maxHp:100,dc:2}).state;s.actors[0].id='a';s.actors[1].id='b';return E.startCombat(s,false).state;}
const attack={type:'attack',actor:'a',target:'b',weapon:'fire'};
for(const type of Object.keys(DAMAGE_TYPES))test('damage immunity supersedes resistance: '+type,()=>{
 const a={damageImmunities:[type],damageResistances:[type]};assert.equal(resistDamage(a,13,type).damage,0);assert.equal(resistDamage(a,13,type).resistancePercent,0);assert.equal(resistDamage({...a,damageImmunities:[]},13,type).damage,6);
 const old=E.actorFrom({name:'Legacy'});assert.deepEqual(old.damageImmunities,[]);assert.throws(()=>traitsFrom({damageImmunities:[type,type]}));
});
test('immune hit preserves an active absorption charge, HP and typed breakdown after a critical roll',()=>{
 let s=scene({shieldsEnabled:true});s=E.editActor(s,'b',{damageImmunities:['fire'],damageResistances:['fire'],shieldProfiles:[{id:'bubble',name:'Bubble',kind:'absorb',turns:3}],shields:[{profile:'bubble',turns:3,charges:1}]}).state;
 const r=E.resolveAction(s,attack,{roll:n=>n===20?20:6});assert.equal(r.result.hit,true);assert.equal(r.result.damage,0);assert.equal(r.state.actors[1].hp,100);assert.equal(r.state.actors[1].shields[0].charges,1);assert.equal(r.result.affected[0].resistancePercent,0);assert.match(E.resultText(r.result,'en'),/× 0% = 0/);
});
test('typed custom damage can be immune while its independent explicit condition still applies',()=>{
 let s=scene();s=E.editActor(s,'b',{damageImmunities:['fire']}).state;
 s=E.editActor(s,'a',{skills:[{...skillPreset('narrative'),id:'flame',range:20,check:false,mechanics:{target:'selected',damage:{dice:'1d4',type:'fire'},status:{mode:'apply',type:'burning',turns:2}}}]}).state;
 const r=E.resolveAction(s,{type:'skill',actor:'a',target:'b',skill:'flame'},{roll:()=>4});assert.equal(r.result.custom.damage.applied,0);assert.equal(r.result.custom.status.changed,true);assert(r.state.actors[1].effects.some(e=>e.type==='burning'));assert.equal(r.state.actors[1].hp,100);
});
test('periodic fire immunity does not remove burning and records zero damage',()=>{
 let s=scene();s=E.editActor(s,'a',{damageImmunities:['fire'],effects:[{type:'burning',turns:3,damage:'4',appliedTurn:0}]}).state;const hp=s.actors[0].hp;s.actors[0].effects[0].appliedTurn=0;s=E.endTurn(s).state;assert.equal(s.actors[0].hp,hp);assert(s.actors[0].effects.some(e=>e.type==='burning'));assert.match(s.log.find(e=>e.type==='effect').textEn,/immune: 0%/);
});
test('three-state editor roundtrips all types and preserves omitted fields',()=>{
 const a={conditionImmunities:['poisoned'],damageResistances:['cold'],damageImmunities:['fire']};assert.deepEqual(readTraits(new Map(),a),a);
 const d=new Map([['traits-present','1'],['damage-trait-fire','immune'],['damage-trait-cold','resistant'],['damage-trait-acid','normal']]);const p=readTraits(d,a);assert.deepEqual(p.damageImmunities,['fire']);assert.deepEqual(p.damageResistances,['cold']);
 const html=traitsMarkup(a,'en');assert.match(html,/<select name="damage-trait-fire"><option value="normal" >Normal<\/option><option value="resistant" >Resistant · ½<\/option><option value="immune" selected>Immune · 0/);assert(!html.includes('name="resist-fire"'));
});
test('combat/profile export, merge, replacement and legacy profiles retain immunity correctly',()=>{
 let s=scene();s=E.editActor(s,'a',{damageImmunities:['fire'],damageResistances:['cold']}).state;const a=s.actors[0],p=exportProfiles(s,'effects','a');assert.deepEqual(p.damageImmunities,['fire']);assert.deepEqual(profileFrom(p).damageImmunities,['fire']);
 assert.deepEqual(transferPatch(a,profileFrom(p),'replace').damageImmunities,['fire']);const legacy=profileFrom({kind:'combat-effects',version:1,effects:[],damageResistances:['acid']});assert(!Object.hasOwn(transferPatch(a,legacy,'replace'),'damageImmunities'));assert.deepEqual(E.validateState(JSON.parse(JSON.stringify(s))).actors[0].damageImmunities,['fire']);
 assert(E.buildPrompt(s).includes('damageImmunities'));
});
for(const enabled of [true,false])test('natural one marker follows the saved rule, without extra draw/cost: '+enabled,()=>{
 const s=scene({natural20:enabled});let draws=0;const r=E.resolveAction(s,attack,{roll:()=>{draws++;return 1;}});assert.equal(r.result.criticalFailure,enabled);assert.equal(r.result.hit,!enabled);assert.equal(draws,enabled?1:2);assert.equal(r.state.action.freeSpent,1);assert.equal(r.state.actors[0].hp,100);
 assert.equal(compactResultFeedback(r.result,'en').label,enabled?'Critical failure':'Hit');assert.equal(E.resultText(r.result,'en').includes('CRITICAL FAILURE'),enabled);
 const c=checkOutcome(s.rules,1,0,0,1);assert.equal(c.criticalFailure,enabled);assert.equal(checkText({...c,type:'check',actorName:'A',description:'test',stat:'str',free:true},'en').includes('CRITICAL FAILURE'),enabled);
});
test('skill natural one is marked, no-check skill and old results are not relabeled',()=>{
 let s=scene();const r=E.resolveAction(s,{type:'skill',actor:'a',target:'a',skill:'aim'},{roll:()=>1});assert.equal(r.result.criticalFailure,true);assert.equal(r.result.success,false);assert.equal(r.state.action.freeSpent,1);assert.match(E.resultText(r.result,'de'),/KRITISCHER MISSERFOLG/);
 s=E.editActor(s,'a',{skills:[{...skillPreset('aim'),id:'auto',check:false}]}).state;const auto=E.resolveAction(s,{type:'skill',actor:'a',target:'a',skill:'auto'},{roll:()=>{throw Error('unexpected roll');}});assert.equal(auto.result.criticalFailure,false);assert.equal(compactResultFeedback({type:'attack',hit:false,natural:1},'en').label,'Attack missed');
});
for(const sides of [4,6,8,10,12,20,100])test('free d'+sides+' is exactly one roll with no actor or action or critical outcome',()=>{
 for(const s of [E.emptyState(),scene()]){const before=E.clone(s);let draws=0;const r=E.freeRoll(s,sides,{roll:n=>{draws++;assert.equal(n,sides);return 1;}});assert.equal(draws,1);assert.deepEqual(r.result,{type:'free-roll',sides,value:1});assert.equal(r.state.rng.cursor,s.rng.cursor+1);assert.deepEqual(r.state.actors,before.actors);assert.deepEqual(r.state.action,before.action);assert.deepEqual(r.state.movement,before.movement);assert.equal(r.state.phase,before.phase);assert.equal(r.state.log.at(-1).chatRelevant,false);assert.match(r.state.log.at(-1).textEn,/Free roll/);assert.equal(compactResultFeedback(r.result),null);assert.equal(s.rng.cursor,before.rng.cursor);}
});
test('free dice reject unsupported and invalid values without a draw or mutation',()=>{
 const s=scene(),before=E.clone(s);for(const n of [0,1,3,21,1000,'20',NaN])assert.throws(()=>E.freeRoll(s,n,{roll:()=>{throw Error('draw');}}));assert.deepEqual(s,before);
});
test('free dice use controller undo/save, remain absent from automatic chat and narrator calls',async()=>{
 let b={state:E.emptyState(),history:[]},saved=0,events=[];const c=createController({key:()=>1,read:()=>b,write:v=>b=v,save:async()=>saved++,onChange:(_b,e)=>events.push(...e)});await c.freeRoll(20,{roll:()=>1});assert.equal(saved,1);assert(events.every(e=>e.chatRelevant===false));assert.equal(c.historyLength(),1);await c.undo();assert.equal(c.state().rng.cursor,0);assert.equal(c.state().log.filter(e=>e.type==='free-roll').length,0);
});
function histories(){const s=scene(),a=[];for(let i=0;i<30;i++){const v=E.clone(s);v.revision=i;v.rng.cursor=i;v.actors[0].hp=100-i;v.log.push({id:'specific-'+i,type:'test',text:'event '+i,details:{n:i}});a.push(v);}return a;}
test('history pack is lossless for all thirty snapshots including distinct events, rules, RNG and receipts',()=>{
 const values=histories();values[3].receipts=['test'];const packed=packHistory(values);assert.equal(historyCount(packed),30);assert.deepEqual(unpackHistory(JSON.parse(JSON.stringify(packed))),values);assert(JSON.stringify(packed).length<JSON.stringify(values).length/2);
 const decoded=unpackHistory(packed);decoded[0].actors[1].name='changed';decoded[0].log[0].text='changed';decoded[0].board.width=99;assert.notEqual(decoded[1].actors[1].name,'changed');assert.notEqual(decoded[1].log[0].text,'changed');assert.notEqual(decoded[1].board.width,99);
});
test('runtime history remains cloneable and serializes compactly after pop/push',()=>{
 const h=prepareHistory(histories()),clone=structuredClone(h);assert.deepEqual(clone,Array.from(h));assert.equal(JSON.parse(JSON.stringify(h)).kind,'combat-history');h.pop();assert.equal(unpackHistory(JSON.parse(JSON.stringify(h))).length,29);h.push(clone[29]);assert.deepEqual(unpackHistory(JSON.parse(JSON.stringify(h))),clone);assert.equal(Array.isArray(JSON.parse(JSON.stringify(prepareHistory(clone.slice(0,2))))),true);
});
test('corrupt packed history fails explicitly and old array history remains readable',()=>{
 assert.deepEqual(prepareHistory(),[]);for(const mutate of [p=>p.version=9,p=>p.frames[0].actors[0]=-1,p=>p.frames[0].board=999999,p=>p.frames[0].log='bad']){const p=packHistory(histories());mutate(p);assert.throws(()=>unpackHistory(p),/Rückgängig/);}assert.equal(historyCount({kind:'bad'}),0);
});
test('controller reload restores packed history and can undo every retained snapshot',async()=>{
 let b={state:scene(),history:prepareHistory(histories())};b=JSON.parse(JSON.stringify(b));const c=createController({key:()=>1,read:()=>b,write:v=>b=v,save:async()=>{}});assert.equal(c.historyLength(),30);for(let i=29;i>=0;i--){await c.undo();assert.equal(c.state().actors[0].hp,100-i);}assert.equal(c.historyLength(),0);
});
test('Basic carry requires genuine improvement over the downed target position',()=>{
 let s=E.setRules(E.emptyState(),{multiActionsEnabled:true,splitMovement:true,movementBase:4,movementStat:'none',natural20:false,reactionsEnabled:false}).state;s=E.setBoard(s,{width:8,height:5}).state;
 s=E.addActor(s,{id:'helper',name:'Helper',side:'player',control:'basic',aiBehavior:'support',initiative:30,position:{x:2,y:2},actionsPerTurn:2,skills:[{...skillPreset('carry'),id:'carry',check:false,ai:true}]}).state;
 s=E.addActor(s,{id:'down',name:'Downed',side:'ally',hp:0,maxHp:20,condition:'stabilized',position:{x:1,y:2}}).state;
 s=E.addActor(s,{id:'foe',name:'Enemy',side:'enemy',initiative:10,position:{x:6,y:2}}).state;s.actors[0].id='helper';s.actors[1].id='down';s.actors[2].id='foe';s=E.startCombat(s,false).state;
 let carried=0;for(let i=0;i<2;i++){const before=E.clone(s),p=planBasicTurn(s);if(p.intent.type!=='skill'||p.intent.skill!=='carry')break;assert(E.distance(p.intent.destination,before.actors[2].position)>E.distance(before.actors[1].position,before.actors[2].position));if(p.move)s=E.moveActor(s,'helper',p.move).state;const r=E.resolveAction(s,p.intent,{roll:()=>15});s=r.state;carried++;assert(E.distance(s.actors[1].position,s.actors[2].position)>E.distance(before.actors[1].position,before.actors[2].position));}assert(carried>0);
});

for(const mechanical of [true,false])test('natural one reaction marker is preserved in nested result/log without extra cost: '+mechanical,()=>{
 let s=scene({reactionsEnabled:true,resourcesEnabled:true,reactionsPerTurn:2});s=E.editActor(s,'b',{reactionControl:'manual',reactionCost:'extra',reactionChoices:['narrative'],resources:[{id:'mana',name:'Mana',kind:'ammo',quantity:5}],skills:[{...skillPreset('narrative'),id:'react',name:'Reaction',check:true,dc:2,reaction:true,reactionTiming:'before',range:0,resource:'mana',cost:1,...(mechanical?{mechanics:{target:'self',healing:{dice:'1d4'}}}:{})}]}).state;
 let calls=0;const r=E.resolveAction(s,attack,{roll:n=>{calls++;return calls===1?1:n===20?15:4;},reactionDecisions:{b:{kind:'narrative',skill:'react',...(mechanical?{target:'b'}:{resolution:'continue'})}}});assert.equal(r.result.narrativeReactions[0].criticalFailure,true);assert.equal(r.state.actors[1].resources[0].quantity,4);assert.equal(r.state.actors[1].reactionSpent,1);assert.equal(calls,3);assert.match(E.resultText(r.result,'en'),/CRITICAL FAILURE/);assert.match(r.state.log.find(e=>e.type==='reaction').textEn,/CRITICAL FAILURE/);
});
test('fear and provocation use the same target-priority decision with or without shared planning context',()=>{
 let s=scene({boardEnabled:true,movementBase:3,movementStat:'none'});s=E.editActor(s,'a',{position:{x:3,y:3},tactics:[{type:'provoked',turns:3,source:'b'},{type:'frightened',turns:3,source:'b',policy:'cover'}]}).state;s=E.editActor(s,'b',{position:{x:6,y:3}}).state;s=E.addActor(s,{name:'Other foe',side:'enemy',position:{x:3,y:5}}).state;s=E.setBoard(s,{cover:[{x:4,y:3}]}).state;
 const a=s.actors[0],context=E.planningContext(s,a),before=E.clone(s);for(const b of s.actors.slice(1))for(const from of [a.position,{x:3,y:2},{x:2,y:3}])assert.equal(E.canAttack(s,a,b,'ranged',from,'profile','fire',context),E.canAttack(s,a,b,'ranged',from,'profile','fire'));assert.deepEqual(s,before);
});


