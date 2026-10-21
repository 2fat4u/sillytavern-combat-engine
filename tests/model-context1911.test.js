import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../engine.js';
import {skillPreset} from '../skills.js';
import {promptText,ensureCombatContext} from '../prompt-bridge.js';
const active=()=>E.startCombat(E.demoState(),false).state;
const compact=(s,options={})=>E.buildPrompt(s,{compact:true,...options});

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
