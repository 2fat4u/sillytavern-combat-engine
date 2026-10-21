import test from 'node:test';import assert from 'node:assert/strict';
import {applyRuleSearch} from '../rules-search.js';
function setup(){const sections=[{tagName:'DETAILS',textContent:'Spielfeld Deckung Stärke',dataset:{},open:false},{tagName:'DETAILS',textContent:'Mana Heilung Konstitution',dataset:{},open:true},{tagName:'DIV',textContent:'Gruppensteuerung Initiative',dataset:{}}],status={textContent:''},input={value:'17.5',checked:true};const root={querySelectorAll:()=>sections,querySelector:()=>status};return {sections,status,input,root};}
test('1914 rule search matches labels without accents and opens matching sections while retaining actual controls',()=>{
 const {sections,status,input,root}=setup(),before=input;assert.equal(applyRuleSearch(root,'starke').matches,1);assert.equal(sections[0].open,true);assert.equal(sections[0].hidden,false);assert.equal(sections[1].hidden,true);assert.equal(status.textContent,'1 / 3 Bereiche');assert.equal(input,before);assert.equal(input.value,'17.5');
});
test('1914 clearing rule search restores disclosure state and all sections without changing values',()=>{
 const {sections,input,root}=setup();applyRuleSearch(root,'deckung');input.value='18.5';applyRuleSearch(root,'');assert.equal(sections[0].open,false);assert.equal(sections[1].open,true);assert(sections.every(s=>!s.hidden));assert.equal(input.value,'18.5');assert.equal(sections[0].dataset.searchOpen,undefined);
});
test('1914 multiword search and zero results are explicit; whitespace behaves as cleared query',()=>{
 const {sections,status,root}=setup();assert.equal(applyRuleSearch(root,'mana heilung','en').matches,1);assert.equal(applyRuleSearch(root,'mana initiative','en').matches,0);assert.equal(status.textContent,'No matching rule section');assert(sections.every(s=>s.hidden));assert.equal(applyRuleSearch(root,'  ').matches,3);
});
test('1914 module aliases make Mana and ammunition find the resource section without including arbitrary field values',()=>{
 const {sections,root}=setup();sections[1].textContent='Resources and effects';sections[1].dataset.searchTerms='mana munition ammunition charges';assert.equal(applyRuleSearch(root,'mana','en').matches,1);assert.equal(sections[1].hidden,false);assert.equal(applyRuleSearch(root,'17.5','en').matches,0);
});
