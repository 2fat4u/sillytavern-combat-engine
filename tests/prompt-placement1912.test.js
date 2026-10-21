import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../engine.js';
import {ensureCombatContext,promptText} from '../prompt-bridge.js';
const state=()=>E.startCombat(E.demoState(),false).state;
const context=(options={})=>E.buildPrompt(state(),{compact:true,...options});
const system=content=>({role:'system',content});
const count=text=>(text.match(/^\[DETERMINISTIC COMBAT — AUTHORITATIVE STATE\]/gm)??[]).length;

test('1912 existing state before a stale post-history summary moves to the final system message',()=>{
 const expected=context(),summary=system('[Summary: No encounter state has been provided yet.]'),payload={chat:[system(expected),summary]};
 assert(ensureCombatContext(payload,expected));assert.equal(payload.chat.length,2);assert.equal(payload.chat[0],summary);assert.equal(payload.chat.at(-1).content,expected);assert(!ensureCombatContext(payload,expected));
});
test('1912 merged system instructions survive extraction of the engine block',()=>{
 const expected=context(),prefix='Character instructions\n',suffix='Post-history instructions',payload={messages:[system(prefix+expected+'\n'+suffix)]};
 assert(ensureCombatContext(payload,expected));assert.equal(payload.messages[0].content,prefix+suffix);assert.equal(payload.messages.at(-1).content,expected);assert.equal(count(promptText(payload)),1);
});
test('1912 multiple stale or current system copies become one fresh final copy',()=>{
 const expected=context(),stale=context({mode:'narrate'}),payload={prompt:[system(stale),system(expected),system('Keep this summary'),system(expected)]};
 assert(ensureCombatContext(payload,expected));assert.equal(payload.prompt.length,2);assert.equal(payload.prompt[0].content,'Keep this summary');assert.equal(payload.prompt[1].content,expected);assert.equal(count(promptText(payload)),1);
});
test('1912 old full context is recognized without deleting neighboring character text',()=>{
 const expected=context(),legacy=E.buildPrompt(state()),payload={chat:[system('Start\n'+legacy+'\nEnd')]};
 assert(ensureCombatContext(payload,expected));assert.equal(payload.chat[0].content,'Start\nEnd');assert.equal(payload.chat.at(-1).content,expected);assert.equal(count(promptText(payload)),1);
});
test('1912 inline marker references and incomplete quotations are preserved',()=>{
 const expected=context(),reference='Read [DETERMINISTIC COMBAT — AUTHORITATIVE STATE] when provided.\n[/DETERMINISTIC COMBAT]',quote='[DETERMINISTIC COMBAT — AUTHORITATIVE STATE]\nExample marker, not engine state\n[/DETERMINISTIC COMBAT]',incomplete='[DETERMINISTIC COMBAT — AUTHORITATIVE STATE]\nPhase: active';
 const payload={messages:[system(reference),system(quote),system(incomplete)]};assert(ensureCombatContext(payload,expected));assert.deepEqual(payload.messages.slice(0,3).map(m=>m.content),[reference,quote,incomplete]);
});
test('1912 manual state pasted as user or assistant history is not edited',()=>{
 const expected=context(),user={role:'user',content:expected},assistant={role:'assistant',content:expected},payload={chat:[user,assistant]};
 assert(ensureCombatContext(payload,expected));assert.equal(payload.chat[0],user);assert.equal(payload.chat[1],assistant);assert.equal(payload.chat.at(-1).role,'system');assert(!ensureCombatContext(payload,expected));
});
test('1912 copied outgoing messages do not mutate stored message objects',()=>{
 const expected=context(),stored=[system('Before\n'+expected+'\nAfter')],before=structuredClone(stored),payload={chat:[...stored]};
 assert(ensureCombatContext(payload,expected));assert.deepEqual(stored,before);assert.notEqual(payload.chat[0],stored[0]);
});
test('1912 multipart system messages preserve images, non-engine text and metadata',()=>{
 const expected=context(),image={type:'image_url',image_url:{url:'data:image/png;base64,test'}},message={role:'system',name:'combined',content:[{type:'text',text:'Before\n'+expected+'\nAfter'},image]},payload={chat:[message]};
 assert(ensureCombatContext(payload,expected));assert.equal(payload.chat[0].name,'combined');assert.equal(payload.chat[0].content[0].text,'Before\nAfter');assert.equal(payload.chat[0].content[1],image);assert.equal(message.content[0].text,'Before\n'+expected+'\nAfter');assert.equal(payload.chat.at(-1).content,expected);assert(!ensureCombatContext(payload,expected));
});
test('1912 engine-only multipart system message is removed; unknown content is retained',()=>{
 const expected=context(),unknown={role:'system',content:{custom:'keep'}},payload={chat:[system([{type:'text',text:expected}]),unknown]};
 assert(ensureCombatContext(payload,expected));assert.equal(payload.chat.length,2);assert.equal(payload.chat[0],unknown);assert.equal(payload.chat.at(-1).content,expected);
});
test('1912 CRLF engine block is replaced without rewriting other line endings',()=>{
 const expected=context(),old=expected.replaceAll('\n','\r\n'),payload={chat:[system('Before\r\n'+old+'\r\nAfter')]};
 assert(ensureCombatContext(payload,expected));assert.equal(payload.chat[0].content,'Before\r\nAfter');assert.equal(payload.chat.at(-1).content,expected);
});
test('1912 empty, dry and string requests stay unchanged',()=>{
 const expected=context(),dry={chat:[system(expected),system('Summary')],dryRun:true},before=structuredClone(dry);assert(!ensureCombatContext(dry,expected));assert.deepEqual(dry,before);
 for(const payload of [{prompt:'raw assistant prefix'},{messages:'raw'},{}]){const old=structuredClone(payload);assert(!ensureCombatContext(payload,expected));assert.deepEqual(payload,old);}const payload={chat:[]};assert(!ensureCombatContext(payload,''));assert.deepEqual(payload.chat,[]);
});
test('1912 proposal explicitly asks the model itself for JSON; narration and DM idle do not',()=>{
 let s=state();s=E.editActor(s,E.currentActor(s).id,{control:'dm'}).state;
 const proposal=E.buildPrompt(s,{compact:true,mode:'proposal'}),narration=E.buildPrompt(s,{compact:true,mode:'narrate'}),idle=E.buildPrompt(s,{compact:true});
 assert.match(proposal,/You create the JSON yourself/);assert(E.parseActionBlock(proposal));assert.match(proposal,/Older summaries.*outdated/);assert(!narration.includes('```combat'));assert(!idle.includes('```combat'));assert.match(idle,/no new proposal was requested/);
});
