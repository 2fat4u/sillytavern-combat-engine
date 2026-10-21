import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs/promises';
import * as E from '../engine.js';
import { modelEventCount, modelEvents } from '../model-context.js';
import { compactPreferences } from '../compact-ui.js';
import { soundPreferences } from '../sounds.js';
import { promptText } from '../prompt-bridge.js';
const e=(id,type='remark',chatRelevant=true)=>({id,type,text:'EVENT_'+id,chatRelevant,details:{}});
const ids=events=>events.map(e=>e.id);
test('history count defaults to eight, accepts 1–30, and rejects invalid values',()=>{
 assert.equal(modelEventCount(),8);for(const n of [1,8,30,'4'])assert.equal(modelEventCount(n),Number(n));
 for(const v of [null,'',false,true,0,-1,31,1.5,NaN,Infinity,'bad'])assert.throws(()=>modelEventCount(v),/1 bis 30/);
});
test('last-action context keeps a resolved action across End turn, edits and private events',()=>{
 const log=[e('old','hit'),e('current','skill'),e('next','turn'),e('profile','edit'),e('secret','skill',false)],before=structuredClone(log);
 assert.deepEqual(ids(modelEvents(log,1)),['current']);assert.deepEqual(log,before);
});
test('last-action context retains immediate effects with and without End turn',()=>{
 const log=[e('action','hit'),e('status','effect')];assert.deepEqual(ids(modelEvents(log,1)),['action','status']);
 log.push(e('next','turn'),e('private','effect',false));assert.deepEqual(ids(modelEvents(log,1)),['action','status']);
});
for(const type of ['undo','reset','restore','end','time','condition','start','import'])test('last-action context respects '+type+' instead of replaying an old outcome',()=>{
 const log=[e('old','hit'),e('boundary',type),e('edit','edit')];assert.deepEqual(ids(modelEvents(log,1)),['boundary']);
 log.push(e('fresh','check'));assert.deepEqual(ids(modelEvents(log,1)),['fresh']);
});
test('empty/setup-only histories, multiple-event limits and pinned result are handled without private data',()=>{
 assert.deepEqual(modelEvents([],1),[]);assert.deepEqual(ids(modelEvents([e('setup','edit')],1)),['setup']);
 const log=[e('action','hit'),...Array.from({length:12},(_,i)=>e('edit'+i,'edit')),e('secret','skill',false)];
 assert.deepEqual(ids(modelEvents(log,3)),['action','edit9','edit10','edit11']);assert.equal(modelEvents(log).length,9);assert.equal(modelEvents(log,30).length,13);
});
test('compact/full prompts honor count while preserving current facts, proposal legality and original state',()=>{
 const s=E.startCombat(E.demoState(),false).state;s.log=[...Array.from({length:12},(_,i)=>e('story'+i,'other')),e('next','turn'),e('edit','edit')];const before=E.clone(s);
 for(const compact of [false,true]){
  const one=E.buildPrompt(s,{compact,mode:'proposal',contextEventCount:1}),four=E.buildPrompt(s,{compact,mode:'proposal',contextEventCount:4});
  assert(one.includes('EVENT_story11'));assert(!one.includes('EVENT_story10'));assert(four.includes('EVENT_story10'));assert(one.length<four.length);for(const a of s.actors)assert(one.includes(a.name));assert(one.includes(E.turnToken(s)));if(compact){const intent=E.parseActionBlock(one);assert(intent);E.resolveAction(s,intent,{roll:n=>n===20?20:2});}
 }
 assert.deepEqual(s,before);assert.equal(E.buildPrompt(s,{compact:true}),E.buildPrompt(s,{compact:true,contextEventCount:8}));
});
const index=await fs.readFile(new URL('../index.js',import.meta.url),'utf8');
const extract=(from,to)=>index.slice(index.indexOf(from),index.indexOf(to,index.indexOf(from)));
function livePreferences(){
 const state=E.startCombat(E.demoState(),false).state;state.log=Array.from({length:10},(_,i)=>e('live'+i,'other'));state.log.push(e('next','turn'));
 const key='deterministic_combat_v1',context={extensionSettings:{},extensionPrompts:{},chat:[{role:'user',mes:'Keep my chat'}],saveSettingsDebounced(){},saveMetadataDebounced(){},setExtensionPrompt(k,value){this.extensionPrompts[k]={value};}};
 const sandbox={compactPreferences,playerView:E.playerView,modelEventCount,modelEvents,buildPrompt:E.buildPrompt,currentActor:E.currentActor,eventText:E.eventText,turnToken:E.turnToken,promptText,soundPreferences,ctx:()=>context,KEY:key,controller:{state:()=>state,refresh(){}},readBundle:()=>({state}),hasChat:()=>true,toolsSupported:()=>false,chatKey:()=> 'chat',local:(de,en)=>de,positionQuickButton(){},proposalRequest:null,generation:{active:false,used:false},pendingNarration:false,status:'',ui:undefined,english:()=>false,escaped:v=>v,PROMPT_MARKER:'[DETERMINISTIC COMBAT — AUTHORITATIVE STATE]',lastPromptCheck:null};
 vm.createContext(sandbox);vm.runInContext(extract('function settings()','function hasChat()')+extract('function updatePreferences(','function requireConnection(')+extract('function refreshPrompt()','function onAction()')+extract('function inspectPrompt(','function preparedPrompt(')+'\nglobalThis.api={get:()=>updatePreferences(),set:p=>updatePreferences(p),inspect:p=>inspectPrompt(p),check:()=>lastPromptCheck};',sandbox);
 return {context,state,api:sandbox.api,key};
}
test('actual extension preference setter persists the count and refreshes its outgoing context without changing the chat/state',()=>{
 const f=livePreferences(),state=E.clone(f.state),chat=structuredClone(f.context.chat);assert.equal(f.api.get().contextEventCount,8);
 f.api.set({contextEventCount:1});assert.equal(f.context.extensionSettings[f.key].contextEventCount,1);let prompt=f.context.extensionPrompts[f.key].value;assert(prompt.includes('EVENT_live9'));assert(!prompt.includes('EVENT_live8'));
 f.api.inspect({chat:[{role:'system',content:prompt}]});assert.equal(f.api.check().latestFound,true);assert.equal(f.api.check().contextAtEnd,true);
 f.api.set({contextEventCount:4});prompt=f.context.extensionPrompts[f.key].value;assert(prompt.includes('EVENT_live8'));assert.deepEqual(f.state,state);assert.deepEqual(f.context.chat,chat);
});
test('actual extension rejects invalid count before preference side effects and repairs malformed saved values',()=>{
 const f=livePreferences();f.api.set({contextEventCount:4});for(const v of [0,31,1.5,'',false])assert.throws(()=>f.api.set({contextEventCount:v}),/1 bis 30/);assert.equal(f.api.get().contextEventCount,4);f.context.extensionSettings[f.key].contextEventCount='bad';assert.equal(f.api.get().contextEventCount,8);
});
