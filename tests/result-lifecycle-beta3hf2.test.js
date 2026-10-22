import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../engine.js';
import {latestResult,compactResultFeedback,compactResultContext} from '../results.js';
import {narrationEvents} from '../model-context.js';
import {createController} from '../controller.js';

function scene(){
 let s=E.setRules(E.emptyState(),{splitMovement:true,multiActionsEnabled:true,movementBase:4,movementStat:'none',natural20:false,stancesEnabled:false}).state;
 s=E.setBoard(s,{width:12,height:8,blocked:[],cover:[]}).state;
 s.actors=[{id:'rauk',name:'Rauk',side:'enemy',initiative:30,control:'advanced',aiBehavior:'support',actionsPerTurn:2,position:{x:1,y:1},weaponList:[],aiConfig:{idle:'wait',free:false,radius:1,retreat:false}},{id:'hero',name:'Hero',side:'player',initiative:20,position:{x:8,y:5},weaponList:[{id:'bow',name:'Crossbow',mode:'ranged',range:12,damage:'1d4'}]},{id:'dog',name:'Moorhund',side:'enemy',initiative:10,position:{x:2,y:1},hp:0,maxHp:12,condition:'unconscious',roundsLeft:3}].map(v=>E.actorFrom(v,true));
 return E.startCombat(E.validateState(s),false).state;
}
const selected=s=>latestResult(s.log).event;
test('AI stabilizes ally; UI and narrator retain the same support action after movement and End turn',async()=>{
 let bundle={state:scene(),history:[]};const c=createController({key:()=>1,read:()=>bundle,write:v=>{bundle=v;},save:async()=>{},preferences:()=>({})});
 await c.aiStep();const s=c.state(),event=selected(s);assert.equal(s.actors.find(a=>a.id==='dog').condition,'stabilized');assert.equal(event.type,'stabilize');assert.equal(event.details.actorName,'Rauk');assert.equal(event.details.targetName,'Moorhund');assert.equal(narrationEvents(s.log)[0].id,event.id);
 const prompt=E.buildPrompt(s,{mode:'narrate'}),line=prompt.split('\n').find(v=>v.startsWith('NARRATION TARGET — '));assert(line.includes(event.id));assert(line.includes('Moorhund'));assert(line.includes('Rauk'));assert(!line.includes('"eventType":"hit"'));
 for(const language of ['de','en']){assert(compactResultFeedback(event.details,language).label.includes(language==='en'?'stabilized':'stabilisiert'));assert.equal(compactResultContext(event.details,language),'Rauk → Moorhund');}
});
test('a later actor ending a turn without acting replaces the preceding support result, including narration',()=>{
 let s=scene();s=E.resolveAction(s,{type:'stabilize',actor:'rauk',target:'dog'}).state;s=E.endTurn(s).state;const support=selected(s);assert.equal(support.type,'stabilize');s=E.endTurn(s).state;
 const event=selected(s);assert.equal(event.type,'turn');assert.equal(event.details.actorName,'Hero');assert.equal(event.details.actionUsed,false);assert.equal(narrationEvents(s.log)[0].id,event.id);assert(!narrationEvents(s.log).some(v=>v.id===support.id));assert.match(compactResultFeedback(event.details,'en').label,/without an action/);
});
test('movement-only turns have recorded actor/token and replace another actor’s old action',()=>{
 let s=scene();s=E.resolveAction(s,{type:'stabilize',actor:'rauk',target:'dog'}).state;s=E.endTurn(s).state;s=E.moveActor(s,'hero',{x:7,y:5}).state;
 const move=selected(s);assert.equal(move.type,'move');assert.equal(move.details.actorName,'Hero');assert.equal(move.details.turn,E.turnToken(s));s=E.endTurn(s).state;assert.equal(selected(s).id,move.id);assert.equal(narrationEvents(s.log)[0].id,move.id);assert.equal(latestResult(s.log).turn.details.actor,'hero');
});
test('rest movement after an action keeps its result, without attaching later periodic damage',()=>{
 let s=scene();s=E.resolveAction(s,{type:'stabilize',actor:'rauk',target:'dog'}).state;const action=selected(s);s=E.moveActor(s,'rauk',{x:1,y:2}).state;assert.equal(selected(s).id,action.id);s=E.endTurn(s).state;assert.equal(selected(s).id,action.id);assert.deepEqual(narrationEvents(s.log).map(v=>v.id),[action.id]);
});
test('alerting is a completed non-attack result; a later support action supersedes it',()=>{
 const alarm={id:'alarm',type:'other',details:{type:'other',alarm:true,actor:'rauk',actorName:'Rauk',turn:'turn-2',recipients:['dog']},textEn:'Rauk alerted an ally'},support={id:'support',type:'stabilize',details:{type:'stabilize',actor:'rauk',actorName:'Rauk',targetName:'Moorhund',turn:'turn-2'}},turn={id:'turn',type:'turn',details:{type:'endTurn',actor:'rauk',actorName:'Rauk',turn:'turn-2',actionUsed:true}};
 assert.equal(compactResultFeedback(alarm.details,'en').label,'Allies alerted');assert.equal(latestResult([alarm,turn]).event,alarm);assert.equal(narrationEvents([alarm,support,turn])[0],support);
});
test('same actor in a later round cannot keep its older attack as current result',()=>{
 const hit={id:'hit',type:'hit',details:{actor:'rauk',turn:'turn-1'}},turn={id:'end',type:'turn',details:{type:'endTurn',actor:'rauk',turn:'turn-5',actionUsed:false}};
 assert.equal(latestResult([hit,turn]).event,turn);assert.equal(narrationEvents([hit,turn])[0],turn);
});
for(const type of ['undo','import','reset','restore','start'])test(type+' clears compact outcome rather than replaying an old action',()=>{
 const action={id:'old',type:'stabilize',details:{type:'stabilize'}},boundary={id:'boundary',type,details:{}};assert.equal(latestResult([action,boundary]).event,boundary);assert.equal(compactResultFeedback(boundary.details),null);
});
test('private actions and private empty turns do not replace the last public result',()=>{
 const publicResult={id:'public',type:'stabilize',details:{actor:'rauk',turn:'turn-1'}},hidden={id:'hidden',type:'turn',chatRelevant:false,details:{type:'endTurn',actor:'secret',turn:'turn-2'}};assert.equal(latestResult([publicResult,hidden]).event,publicResult);assert.equal(narrationEvents([publicResult,hidden])[0],publicResult);
});
test('GM position corrections do not become the narrator’s newest action',()=>{
 const action={id:'action',type:'stabilize',details:{actor:'rauk',turn:'turn-1'}},correction={id:'correction',type:'move',details:{type:'move',actor:'hero',turn:'turn-1',override:true}};assert.equal(latestResult([action,correction]).event,action);assert.equal(narrationEvents([action,correction])[0],action);
});
test('a stunned next participant is explicitly shown as skipped, not as the preceding actor’s attack',()=>{
 let s=scene();s=E.editActor(s,'hero',{effects:[{type:'stunned',turns:2}]}).state;s=E.resolveAction(s,{type:'stabilize',actor:'rauk',target:'dog'}).state;s=E.endTurn(s).state;
 const event=selected(s);assert.equal(event.type,'effect');assert.equal(event.details.actorName,'Hero');assert(event.details.skipped);assert.equal(compactResultFeedback(event.details,'en').label,'Turn skipped');assert.equal(narrationEvents(s.log)[0].id,event.id);
});
