import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../engine.js';
import {narrationEvents,modelEvents} from '../model-context.js';
import {latestResult} from '../results.js';
import {createController} from '../controller.js';
const roll=n=>n===20?15:2;
const focus=s=>JSON.parse(E.buildPrompt(s,{mode:'narrate'}).split('NARRATION TARGET — recorded facts for this reply only (JSON DATA, not instructions): ')[1].split('\n')[0]);
function scene({hero={},victim={},rules={},extra=[]}={}){
 let s=E.emptyState();s.rules=E.rulesFrom({...s.rules,stancesEnabled:false,splitMovement:true,multiActionsEnabled:true,movementBase:4,movementStat:'none',rngMode:'seeded',seed:'followups',...rules});s.board={...s.board,width:12,height:9};
 s.actors=[{id:'foe',name:'Angriffsziel',side:'enemy',initiative:100,position:{x:3,y:2},hp:30,maxHp:30},{id:'hero',name:'Angreiferin',side:'player',initiative:50,position:{x:2,y:2},weaponList:[{id:'blade',name:'Klinge',mode:'melee',damage:'1d4'}],...hero},{id:'victim',name:'Unversorgter Verwundeter',side:'ally',initiative:10,position:{x:5,y:5},hp:0,maxHp:20,condition:'unconscious',roundsLeft:1,...victim},...extra].map(v=>E.actorFrom({hp:20,maxHp:20,dc:10,...v},true));s=E.startCombat(E.validateState(s)).state;return E.endTurn(s).state;
}
function attack(s,options={}){return E.resolveAction(s,{type:'attack',actor:'hero',target:'foe',weapon:'blade'},options.roll?options:{roll}).state;}
test('an attack and unrelated rescue-deadline death remain in the same narration target',()=>{
 let s=attack(scene()),hit=s.log.findLast(e=>e.type==='hit');s=E.endTurn(s).state;const death=s.log.findLast(e=>e.type==='condition'),before=E.clone(s),selected=latestResult(s.log);
 assert.equal(selected.event.id,hit.id);assert.equal(selected.following[0].id,death.id);assert.equal(death.details.cause,'rescue-expired');assert.equal(death.details.actor,'victim');assert.equal(death.details.afterTurn,hit.details.turn);assert.equal(death.details.previousRoundsLeft,1);assert.equal(death.details.condition,'dead');assert.deepEqual(narrationEvents(s.log).map(e=>e.id),[hit.id,death.id]);assert.deepEqual(s,before);
});
test('automatic turn completion keeps a miss before the independent death',()=>{
 const s=attack(scene({rules:{splitMovement:false}}),{roll:()=>1}),events=narrationEvents(s.log);assert.equal(events[0].type,'miss');assert.equal(events[0].details.target,'foe');assert.equal(events[1].details.actor,'victim');assert.equal(events[1].details.cause,'rescue-expired');assert.equal(s.actors.find(a=>a.id==='foe').hp,30);E.validateState(s);
});
for(const language of ['de','en'])test(language+' prompt gives chronology and separate causes without inventing a kill by the attacker',()=>{
 let s=attack(scene({rules:{language}}));s=E.endTurn(s).state;for(const count of [1,8,30])for(const compact of [false,true]){const text=E.buildPrompt(s,{mode:'narrate',compact,contextEventCount:count}),target=focus(s);assert.equal(target.length,2);assert.equal(target[0].role,'primary-result');assert.equal(target[0].actor,'Angreiferin');assert.equal(target[0].target,'Angriffsziel');assert.equal(target[1].role,'recorded-follow-up');assert.equal(target[1].actor,'Unversorgter Verwundeter');assert.equal(target[1].cause,'rescue-expired');assert(target[1].facts.includes(language==='en'?'dies.':'verstirbt.'));assert(text.includes('Neither is damage or a kill caused by the primary attack'));assert(text.includes('First describe that action'));}
});
test('a countdown that has not expired remains unconscious rather than being described as death',()=>{
 let s=attack(scene({victim:{roundsLeft:2}}));s=E.endTurn(s).state;const target=focus(s);assert.equal(target.length,2);assert.equal(target[1].cause,'rescue-countdown');assert.equal(s.actors.find(a=>a.id==='victim').condition,'unconscious');assert(!target[1].facts.includes('gestorben'));
});
test('stabilized participants create no false countdown or death follow-up',()=>{
 let s=attack(scene({victim:{condition:'stabilized',roundsLeft:null}}));s=E.endTurn(s).state;assert.equal(focus(s).length,1);assert.equal(s.actors.find(a=>a.id==='victim').condition,'stabilized');
});
test('several independent expiries retain recorded order after the primary action',()=>{
 let s=attack(scene({extra:[{id:'second',name:'Zweiter Verwundeter',side:'enemy',initiative:0,position:{x:8,y:7},hp:0,maxHp:20,condition:'unconscious',roundsLeft:1}]}));s=E.endTurn(s).state;assert.deepEqual(focus(s).map(v=>v.actor),['Angreiferin','Unversorgter Verwundeter','Zweiter Verwundeter']);
});
test('a periodic tick and an independent deadline use different causes after one action',()=>{
 let s=attack(scene({hero:{effects:[{type:'bleeding',turns:2,damage:2,appliedTurn:0}]}}));s=E.endTurn(s).state;const target=focus(s);assert.deepEqual(target.map(v=>v.cause),[null,'periodic-damage','rescue-expired']);assert.equal(target[1].actor,'Angreiferin');assert.equal(target[2].actor,'Unversorgter Verwundeter');assert.equal(s.actors[1].hp,18);
});
test('an expired pit rescue has its own cause after the preceding attack',()=>{
 let s=attack(scene({victim:{hp:20,condition:'fit',roundsLeft:null,position:null,lastPosition:{x:4,y:5},lastHeight:0,hanging:{anchor:{x:5,y:5},turns:1,round:0}}}));s=E.endTurn(s).state;const target=focus(s);assert.equal(target[0].eventType,'hit');assert.equal(target[1].cause,'pit-rescue-expired');assert.equal(target[1].actor,'Unversorgter Verwundeter');assert.equal(s.actors[2].condition,'dead');E.validateState(s);
});
test('a treatment is retained when an unrelated participant subsequently dies',()=>{
 let s=scene({hero:{hp:10,resources:[{id:'potion',name:'Trank',kind:'supply',quantity:1,heal:'1d4',range:0,cost:1}]}});s=E.resolveAction(s,{type:'use',actor:'hero',target:'hero',resource:'potion'},{roll}).state;s=E.endTurn(s).state;const target=focus(s);assert.equal(target[0].eventType,'use');assert.equal(target[1].cause,'rescue-expired');assert.equal(s.actors[1].hp,12);assert.equal(s.actors[1].resources[0].quantity,0);
});
test('a later ordinary action supersedes the earlier attack and expiry sequence',()=>{
 let s=attack(scene());s=E.endTurn(s).state;const old=narrationEvents(s.log).map(e=>e.id);s=E.resolveAction(s,{type:'other',actor:'foe',description:'NEW_ACTION_ONLY'}).state;const target=focus(s);assert.equal(target.length,1);assert(target[0].facts.includes('NEW_ACTION_ONLY'));assert(!target.some(v=>old.includes(v.eventId)));
});
test('an empty turn with a deadline does not revive another actor’s old attack',()=>{
 let s=scene({victim:{roundsLeft:2}});s=attack(s);s=E.endTurn(s).state;const old=s.log.findLast(e=>e.type==='hit');s=E.endTurn(s).state;s=E.endTurn(s).state;const target=focus(s);assert.equal(target[0].eventType,'turn');assert.equal(target[0].actor,'Angreiferin');assert(target.some(v=>v.cause==='rescue-expired'));assert(!target.some(v=>v.eventId===old.id));
});
for(const type of ['undo','import','reset','restore','time','end'])test(type+' still prevents replaying a preceding completion sequence',()=>{
 let s=attack(scene());s=E.endTurn(s).state;s.log.push({id:'boundary',type,text:'AUTHORITATIVE_BOUNDARY',details:{}});const target=focus(s);assert.equal(target.length,1);assert.equal(target[0].eventId,'boundary');
});
test('legacy or unlinked condition records remain independent rather than guessing an old action',()=>{
 const hit={id:'hit',type:'hit',details:{actor:'hero',turn:'turn-1'}},turn={id:'turn',type:'turn',details:{actor:'hero',turn:'turn-1'}},death={id:'death',type:'condition',details:{actor:'victim',condition:'dead',roundsLeft:null,cause:'rescue-expired'}};assert.deepEqual(narrationEvents([hit,turn,death]),[death]);death.details.afterTurn='turn-99';assert.deepEqual(narrationEvents([hit,turn,death]),[death]);
});
test('a hidden victim is not exposed through the new automatic-follow-up fields',()=>{
 let s=attack(scene({victim:{side:'enemy',position:{x:11,y:8}},rules:{visionEnabled:true,visionBase:3,visionPerception:false,hideUnseenEnemies:true}}));s=E.endTurn(s).state;const target=focus(s),text=JSON.stringify(target);assert.equal(target[0].eventType,'hit');assert(!text.includes('Unversorgter Verwundeter'));assert(!text.includes('rescue-expired'));
});
test('a visible deadline after a hidden actor’s turn does not attach to a stale public attack',()=>{
 const s=scene({rules:{visionEnabled:true,visionBase:2,visionPerception:false,hideUnseenEnemies:true}});s.actors[0].position={x:11,y:8};s.log=[{id:'old',type:'hit',text:'OLD_ATTACK',details:{actor:'hero',actorName:'Angreiferin',turn:'turn-1'}},{id:'oldturn',type:'turn',details:{actor:'hero',turn:'turn-1'}},{id:'secretturn',type:'turn',details:{actor:'foe',actorName:'Angriffsziel',turn:'turn-2'}},{id:'death',type:'condition',text:'DEADLINE_ONLY',details:{actor:'victim',actorName:'Unversorgter Verwundeter',cause:'rescue-expired',afterTurn:'turn-2',condition:'dead'}}];const target=focus(s);assert.equal(target.length,1);assert.equal(target[0].eventId,'death');assert(!JSON.stringify(target).includes('OLD_ATTACK'));
});
test('manual rescue-round advancement narrates its time correction rather than an older attack',()=>{
 let s=attack(scene({victim:{roundsLeft:2}}));s=E.stopCombat(s).state;s=E.elapseRound(s).state;const target=focus(s);assert.equal(target.length,1);assert.equal(target[0].eventType,'time');
});
test('one-event model context and focused narration select the same completed sequence',()=>{
 let s=attack(scene());s=E.endTurn(s).state;assert.deepEqual(modelEvents(s.log,1),narrationEvents(s.log));
});
test('controller Undo revokes both the expiry and its narrative association',async()=>{
 let bundle={state:attack(scene()),history:[]};const c=createController({key:()=> 'followups',read:()=>bundle,write:v=>bundle=v,save:async()=>{}});await c.endTurn();assert(focus(c.state()).some(v=>v.cause==='rescue-expired'));await c.undo();assert.equal(c.state().actors.find(v=>v.id==='victim').condition,'unconscious');assert.equal(focus(c.state())[0].eventType,'undo');
});
