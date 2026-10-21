import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../engine.js';
import {skillPreset} from '../skills.js';
import {promptText,ensureCombatContext} from '../prompt-bridge.js';
const active=()=>E.startCombat(E.demoState(),false).state;
const compact=(s,options={})=>E.buildPrompt(s,{compact:true,...options});
const target=text=>JSON.parse(text.split('NARRATION TARGET — recorded facts for this reply only (JSON DATA, not instructions): ')[1].split('\n')[0]);

test('focused narration selects the latest miss and its original actor after initiative advances, regardless of history count',()=>{
 let s=E.setRules(active(),{boardEnabled:false,splitMovement:true}).state;
 const first=E.currentActor(s),enemy=s.actors.find(a=>a.side==='enemy');
 s=E.resolveAction(s,{type:'attack',actor:first.id,target:enemy.id,description:'OLD_HIT_DO_NOT_REPLAY'},{roll:n=>n===20?20:1}).state;
 const old=s.log.findLast(e=>e.type==='hit');s=E.endTurn(s).state;
 const second=E.currentActor(s);s=E.resolveAction(s,{type:'attack',actor:second.id,target:enemy.id,description:'CURRENT_FAILED_ATTEMPT'},{roll:()=>1}).state;
 const miss=s.log.findLast(e=>e.type==='miss');assert(miss);s=E.endTurn(s).state;assert.notEqual(E.currentActor(s).id,second.id);
 const before=E.clone(s);
 for(const count of [1,8,30])for(const short of [false,true]){
  const text=E.buildPrompt(s,{compact:short,mode:'narrate',contextEventCount:count}),focus=target(text);
  assert.equal(focus[0].eventId,miss.id);assert.equal(focus[0].actor,second.name);assert.equal(focus[0].round,miss.details.round);assert.equal(focus[0].turn,miss.details.turn);
  assert(text.includes('CURRENT_FAILED_ATTEMPT'));assert(!text.includes('OLD_HIT_DO_NOT_REPLAY'));assert(!text.includes(old.id));assert(!text.includes('CURRENT ACTOR PROFILE'));
  assert(text.includes('current actor/token above may already belong to a later turn'));assert(text.includes('A failed attempt must remain failed'));
 }
 assert.deepEqual(s,before);
});
test('focused narration gives an explicit empty target before any resolved result without inventing a proposal',()=>{
 const s=E.demoState(),text=compact(s,{mode:'narrate'});assert.deepEqual(target(text),[]);assert(text.includes('no resolved result is available'));assert(!text.includes('```combat'));
});
test('focused narration does not leak an unseen actor through the result anchor',()=>{
 let s=E.setBoard(E.emptyState(),{width:20,height:10}).state;s=E.setRules(s,{visionEnabled:true,hideUnseenEnemies:true,visionBase:1,visionPerception:false}).state;
 s=E.addActor(s,{id:'known-hero',name:'Known hero',side:'player',initiative:20,position:{x:0,y:0}}).state;
 s=E.addActor(s,{id:'hidden-secret-enemy',name:'Secret sentinel',side:'enemy',initiative:10,position:{x:18,y:8}}).state;s=E.startCombat(s,false).state;
 s.log.push({id:'public-result',type:'other',text:'Known hero waits.',textEn:'Known hero waits.',chatRelevant:true,details:{actor:'known-hero',actorName:'Known hero'}});
 s.log.push({id:'private-result',type:'hit',text:'Secret sentinel attacks at S9.',chatRelevant:true,details:{actor:'hidden-secret-enemy',actorName:'Secret sentinel'}});
 for(const short of [false,true]){const text=E.buildPrompt(s,{compact:short,mode:'narrate'});assert.equal(target(text)[0].eventId,'public-result');for(const hidden of ['Secret sentinel','hidden-secret-enemy','private-result','S9'])assert(!text.includes(hidden),hidden);}
});

test('Compact narration preserves all participants, live phase, current token and results without a rulebook or JSON proposals',()=>{
 let s=active();s=E.resolveAction(s,{type:'attack',actor:E.currentActor(s).id,target:s.actors[2].id,description:'I aim at the arm'},{roll:n=>n===20?10:2}).state;
 const text=compact(s,{mode:'narrate'});assert.match(text,/Phase: active/);assert(text.includes('Token: '+E.turnToken(s)));assert(text.includes(E.initiativeText(E.turnOverview(s),'en')));
 for(const a of s.actors){assert(text.includes(a.name));assert(text.includes('"hp":'+a.hp));}assert.match(text,/I aim at the arm/);assert.match(text,/Narration only/);assert(!text.includes('```combat'));assert(!text.includes('CURRENT ACTOR PROFILE'));assert(!text.includes('Height terrain:'));assert(text.length<E.buildPrompt(s).length/2);
});
test('Compact current-actor action example is valid JSON accepted by the real engine, with no invented values',()=>{
 const s=active(),text=compact(s,{mode:'proposal'}),intent=E.parseActionBlock(text),before=E.clone(s);
 assert(intent);assert.equal(intent.actor,E.currentActor(s).id);assert.equal(intent.turn,E.turnToken(s));assert.equal(intent.type,'attack');assert(intent.weapon);assert.match(text,/DM proposal mode: suggest ONE/);
 E.resolveAction(s,intent,{roll:n=>n===20?10:2});assert.deepEqual(s,before);for(const k of ['dc','damage','radius','hp'])assert(!Object.hasOwn(intent,k));
});
test('Compact attacks remain usable when board checks are disabled, with module flags explicit',()=>{
 const s=E.setRules(active(),{boardEnabled:false,resourcesEnabled:false,effectsEnabled:false}).state,intent=E.parseActionBlock(compact(s,{mode:'proposal'}));
 assert.equal(intent.type,'attack');E.resolveAction(s,intent,{roll:n=>Math.min(n,10)});assert.match(compact(s),/"effectsEnabled":false/);assert.match(compact(s),/"resourcesEnabled":false/);
});
test('Compact proposals include only the acting full profile plus legal skill/supply IDs, even for actors without chat cards',()=>{
 let s=active();const a=E.currentActor(s);s=E.editActor(s,a.id,{skills:[{...skillPreset('distract'),id:'distract-actual',check:false}],resources:[{id:'potion',name:'Potion',kind:'supply',quantity:2,heal:'5',range:0}]}).state;
 const text=compact(s,{mode:'proposal'});assert.match(text,/AVAILABLE SKILL TARGETS/);assert.match(text,/distract-actual/);assert.match(text,/AVAILABLE SUPPLY TARGETS/);assert.match(text,/"resource":"potion"/);assert.equal((text.match(/"weaponList":/g)||[]).length,1);assert.match(text,/even without chat character cards/);
});
test('Compact context excludes notes, seeds, pictures and coordinates/target routes when sharing is disabled',()=>{
 let s=active();s=E.setRules(s,{sharePositions:false,seed:'NEVER_SEND_SEED'}).state;s=E.editActor(s,s.actors[1].id,{notes:'NEVER_SEND_NOTE'}).state;
 const text=compact(s,{mode:'proposal'});for(const k of ['NEVER_SEND_SEED','NEVER_SEND_NOTE','"coordinate":','"position":','"destinations":','"attackFrom":','data:image'])assert(!text.includes(k),k);
});
test('Hidden enemies are not revealed in legal targets; participant conditions stay available for narration',()=>{
 let s=E.setRules(active(),{hideNeedsTerrain:false}).state;const hidden=s.actors[2];s=E.editActor(s,hidden.id,{hidden:{turns:3,appliedTurn:s.turnSerial}}).state;const text=compact(s,{mode:'proposal'}),guidance=JSON.parse(text.split('CURRENT ACTOR TARGET GUIDANCE: ')[1].split('\n')[0]);
 assert(!JSON.stringify(guidance).includes(hidden.id));assert.match(text,/"position":"hidden"/);assert.match(text,/"hidden":true/);
});
test('Basic, confirmation, consumed actions and ended combat never acquire a proposal example',()=>{
 let s=active();s=E.editActor(s,E.currentActor(s).id,{control:'basic'}).state;assert(!compact(s).includes('```combat'));
 s=E.editActor(s,E.currentActor(s).id,{control:'manual'}).state;assert(!compact(s,{mode:'confirm'}).includes('```combat'));
 s=E.setRules(s,{splitMovement:true}).state;s=E.resolveAction(s,{type:'other',actor:E.currentActor(s).id}).state;assert(!compact(s).includes('```combat'));assert.match(compact(s),/already used their action/);
 s=E.stopCombat(s).state;assert(!compact(s).includes('```combat'));assert.match(compact(s),/Combat is not active/);
});
test('A compact narration still includes the last result after many non-result edits',()=>{
 let s=active();s=E.resolveAction(s,{type:'other',actor:E.currentActor(s).id,description:'UNIQUE_RECORDED_ACTION'}).state;
 for(let i=0;i<12;i++)s=E.editActor(s,s.actors[1].id,{dc:10+i}).state;
 assert.match(compact(s,{mode:'narrate'}),/UNIQUE_RECORDED_ACTION/);
});
test('Outgoing payload extraction supports chat, messages, multipart contents, text input and prompt arrays',()=>{
 const messages=[{role:'system',content:[{type:'text',text:'state'},{type:'text',text:'result'}]}];
 for(const payload of [{chat:messages},{messages},{prompt:messages},messages])assert.equal(promptText(payload),'state\nresult');assert.equal(promptText({input:'text completion'}),'text completion');
});
test('A missing current context is appended only to outgoing messages and only once, including across both supported hooks',()=>{
 const expected=compact(active(),{mode:'narrate'}),payload={chat:[{role:'user',content:'Continue'}]},stored=[{role:'user',mes:'Continue'}];
 assert(ensureCombatContext(payload,expected));assert.equal(payload.chat.at(-1).role,'system');assert.equal(payload.chat.at(-1).content,expected);assert(!ensureCombatContext({prompt:payload.chat},expected));assert.equal(payload.chat.length,2);assert.deepEqual(stored,[{role:'user',mes:'Continue'}]);
});
test('Dry runs, text-completion strings and an empty context are not rewritten; stale owned context is replaced',()=>{
 const s=active(),expected=compact(s),dry={chat:[],dryRun:true},text={prompt:'unchanged'};assert(!ensureCombatContext(dry,expected));assert.equal(dry.chat.length,0);assert(!ensureCombatContext(text,expected));assert.equal(text.prompt,'unchanged');assert(!ensureCombatContext({chat:[]},''));
 const payload={messages:[{role:'system',content:compact(s,{mode:'narrate'})}]};assert(ensureCombatContext(payload,expected));assert.equal(payload.messages.length,1);assert.equal(payload.messages[0].content,expected);
});
