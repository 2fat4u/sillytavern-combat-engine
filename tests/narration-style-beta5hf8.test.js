import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../engine.js';
import {narrationRecords,packNarrationEvent} from '../narration.js';
function sample(language,log){const s=E.demoState();s.rules.language=language;s.log=log;return s;}
function target(prompt){return JSON.parse(prompt.split('NARRATION TARGET — recorded facts for this reply only (JSON DATA, not instructions): ')[1].split('\n')[0]);}
for(const language of ['de','en'])for(const narrationScope of ['result','turn'])for(const compact of [false,true])test(language+' '+narrationScope+' compact='+compact+' narration keeps the independent death cause while omitting the timer from spoken facts',()=>{
 const event={id:'death',type:'condition',textDe:'Wache: gestorben; Rettungsfrist abgelaufen, ohne Stabilisierung.',textEn:'Guard: dead; rescue deadline expired without stabilization.',details:{actorName:'Guard',actor:'guard',condition:'dead',cause:'rescue-expired',turn:'turn-1',afterTurn:'turn-1',round:3}};
 const s=sample(language,[event]),before=E.clone(s),prompt=E.buildPrompt(s,{mode:'narrate',compact,narrationScope}),r=target(prompt)[0];assert.equal(r.cause,'rescue-expired');assert.equal(r.actor,'Guard');assert.match(r.facts,language==='en'?/dies\./:/verstirbt\./);assert(!/deadline|countdown|Rettungsfrist|Stabilisierung/.test(r.facts));assert(prompt.includes('not a required spoken explanation'));assert(prompt.includes('Keep it separate from unrelated attacks'));assert.deepEqual(s,before);
 const packed=packNarrationEvent(event),batch=target(E.buildPrompt(s,{mode:'narrate',narrationScope:'batch',narrationBatch:{events:[packed]}}));assert.equal(batch[0].facts,r.facts);assert.equal(batch[0].cause,'rescue-expired');
});
for(const language of ['de','en'])test(language+' stabilization preserves unconsciousness without causing it or healing HP',()=>{
 const e={id:'aid',type:'stabilize',text:'Stabilized and unable to fight at 0 HP. Countdown stopped.',details:{type:'stabilize',actorName:'Mira',targetName:'Lysann',afterHp:0,targetCondition:'stabilized',turn:'turn-1',round:2}},s=sample(language,[e]),prompt=E.buildPrompt(s,{mode:'narrate'}),r=target(prompt)[0];assert.equal(r.actor,'Mira');assert.equal(r.target,'Lysann');assert(r.facts.includes(language==='en'?'remains unconscious':'bleibt bewusstlos'));assert(r.facts.includes(language==='en'?'no HP were restored':'keine HP wurden geheilt'));assert(!r.facts.includes('Countdown'));assert(prompt.includes('does not cause unconsciousness'));assert(prompt.includes('does not restore HP or wake'));
});
for(const language of ['de','en'])test(language+' stance facts remain exact while prose is allowed varied wording without new actions',()=>{
 const e={id:'posture',type:'stance',text:'Mira: Defensive: -2 attack, +2 DC.',details:{actorName:'Mira',stance:'defensive',turn:'turn-1',round:2}},s=sample(language,[e]),before=E.clone(s),prompt=E.buildPrompt(s,{mode:'narrate',narrationScope:'turn'});assert.equal(target(prompt)[0].stance,'defensive');assert.equal(narrationRecords([packNarrationEvent(e)],language,true)[0].stance,'defensive');assert(prompt.includes('Vary verbs, sentence openings'));assert(prompt.includes('weave that posture into the action'));assert(prompt.includes('stance change alone establishes no attack'));assert(prompt.includes('Mention each recorded event once'));assert.deepEqual(s,before);
});
