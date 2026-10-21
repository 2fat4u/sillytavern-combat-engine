import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../engine.js';
import {createController} from '../controller.js';
import {markChatEvents} from '../chat-events.js';
const points=Array.from({length:6},(_,x)=>({x:x+2,y:3}));
const fields={wall:'blocked',cover:'cover',height:'heights',pit:'pits'};
for(const [tool,field] of Object.entries(fields))test('Terrain stroke draws '+tool+' and revisiting a cell never toggles it back',()=>{
 const s=E.emptyState(),r=E.paintTerrain(s,tool,[...points,...points.slice().reverse()],{remove:false});assert.equal(r.state.board[field].length,6);assert.equal(r.result.count,6);assert.equal(s.board[field].length,0);assert.deepEqual(r.state.rng,s.rng);E.validateState(r.state);
 const again=E.paintTerrain(r.state,tool,points,{remove:false});assert.equal(again.result.count,0);assert.equal(again.state,r.state);
});
for(const [tool,field] of Object.entries(fields))test('Starting on existing '+tool+' erases only that type across the stroke',()=>{
 let s=E.paintTerrain(E.emptyState(),tool,points.slice(0,2),{remove:false}).state;s=E.paintTerrain(s,'wall',[{x:8,y:3}],{remove:false}).state;
 const r=E.paintTerrain(s,tool,[...points,{x:8,y:3}]);assert.equal(r.state.board[field].filter(p=>p.x<8).length,0);if(tool!=='wall')assert(r.state.board.blocked.some(p=>p.x===8));E.validateState(r.state);
});
test('A stroke cannot bury participants or hanging actors',()=>{
 let s=E.addActor(E.emptyState(),{name:'A',position:{x:3,y:3}}).state;
 s=E.setBoard(s,{pits:[{x:4,y:3}]}).state;s=E.addActor(s,{name:'Hanging',position:null,hanging:{anchor:{x:4,y:3},turns:3,round:1}}).state;
 const r=E.paintTerrain(s,'wall',points,{remove:false});assert.equal(r.result.skipped,2);assert(!r.state.board.blocked.some(p=>p.x===3||p.x===4));assert(r.state.board.pits.some(p=>p.x===4));assert.deepEqual(r.state.actors,s.actors);
});
test('Pits replace incompatible terrain; painting a wall replaces pit and elevation',()=>{
 let s=E.setBoard(E.emptyState(),{heights:[{x:2,y:3}],cover:[{x:2,y:3}],coverFaces:[{x:2,y:3,facing:'north'}]}).state;
 s=E.paintTerrain(s,'pit',[{x:2,y:3}],{remove:false}).state;assert.equal(s.board.heights.length,0);assert.equal(s.board.cover.length,0);assert.equal(s.board.coverFaces.length,0);
 s=E.paintTerrain(s,'wall',[{x:2,y:3}],{remove:false}).state;assert.equal(s.board.pits.length,0);assert.equal(s.board.blocked.length,1);E.validateState(s);
});
test('Cover retains height and every painted cover gets the selected facing',()=>{
 let s=E.setBoard(E.emptyState(),{heights:points}).state;s=E.paintTerrain(s,'cover',points,{facing:'east',remove:false}).state;
 assert.equal(s.board.cover.length,6);assert.equal(s.board.heights.length,6);assert(s.board.coverFaces.every(p=>p.facing==='east'));E.validateState(s);
});
test('Erasing terrain removes affected ladder endpoints without deleting participants or background settings',()=>{
 let s=E.setBoard(E.emptyState(),{heights:[{x:2,y:3}],ladders:[{from:{x:2,y:2},to:{x:2,y:3}}],blocked:[{x:4,y:3}],cover:[{x:5,y:3}],pits:[{x:6,y:3}]}).state;
 s=E.paintTerrain(s,'erase',points).state;for(const field of ['heights','ladders','blocked','cover','pits'])assert.equal(s.board[field].length,0);E.validateState(s);
});
test('Terrain stroke validates atomically and rejects stale revisions',()=>{
 const s=E.emptyState(),before=E.clone(s);
 for(const [tool,cells,options] of [['ladder',points,{}],['pit',[...points,{x:90,y:2}],{}],['wall',points,{revision:s.revision+1}],['wall',points,{remove:'yes'}],['cover',points,{facing:'diagonal'}]])assert.throws(()=>E.paintTerrain(s,tool,cells,options));
 assert.deepEqual(s,before);
});
test('One full-board stroke is one saved change, one undo and no combat/RNG expenditure',async()=>{
 const base=E.setBoard(E.emptyState(),{width:50,height:50}).state;let bundle={state:base,history:[]},saves=0;const c=createController({key:()=> 'paint',read:()=>bundle,write:v=>bundle=v,save:async()=>{saves++;}});
 const cells=Array.from({length:2500},(_,i)=>({x:i%50,y:Math.floor(i/50)}));await c.paint('pit',cells,{remove:false});assert.equal(c.state().board.pits.length,2500);assert.equal(c.historyLength(),1);assert.equal(saves,1);assert.deepEqual(c.state().rng,base.rng);
 await c.undo();assert.deepEqual(c.state().board,base.board);assert.equal(c.historyLength(),0);
});
test('Empty strokes over occupied cells create no save or undo entry',async()=>{
 let bundle={state:E.addActor(E.emptyState(),{name:'A',position:{x:3,y:3}}).state,history:[]},saves=0;const c=createController({key:()=> 'paint',read:()=>bundle,write:v=>bundle=v,save:async()=>{saves++;}});await c.paint('pit',[{x:3,y:3}]);assert.equal(saves,0);assert.equal(c.historyLength(),0);
});
test('Terrain-only brush edit is quiet in chat and preserves an active turn',()=>{
 let s=E.demoState();s=E.startCombat(s).state;const before=E.clone(s),r=E.paintTerrain(s,'pit',[{x:9,y:9}],{remove:false}),events=r.state.log.filter(e=>!s.log.some(v=>v.id===e.id));markChatEvents(s,r.state,events);assert(events.every(e=>!e.chatRelevant));assert.equal(r.state.turnSerial,before.turnSerial);assert.deepEqual(r.state.action,before.action);assert.deepEqual(r.state.movement,before.movement);assert.deepEqual(r.state.rng,before.rng);
});
