import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../engine.js';
import {skillPreset,skillDefense,skillDefenseText} from '../skills.js';
import {rangeFrame,rangeEdges} from '../board-range.js';
import {exportProfiles,transferPatch} from '../profiles.js';
function setup(statMode='scores') {
 let s=E.setRules(E.emptyState(),{statMode,skillsEnabled:true,splitMovement:true,natural20:false,hitEqual:true}).state;
 const stats=values=>Object.fromEntries(Object.keys(E.STATS).map(k=>[k,values[k]??(statMode==='scores'?10:0)]));
 s=E.addActor(s,{name:'Caster',side:'player',initiative:30,position:{x:2,y:2},stats:stats({strength:statMode==='scores'?14:2}),skills:[{...skillPreset('shove'),id:'push'}]}).state;
 s=E.addActor(s,{name:'Target',side:'enemy',initiative:20,position:{x:3,y:2},dc:17.5,stats:stats({strength:statMode==='scores'?16:3,dexterity:statMode==='scores'?18:4})}).state;
 s=E.addActor(s,{name:'Ally',side:'ally',initiative:10,position:{x:7,y:7}}).state;return E.startCombat(s,false).state;
}
const push=(s,extra={})=>({type:'skill',actor:s.actors[0].id,target:s.actors[1].id,skill:'push',turn:E.turnToken(s),...extra});
test('1914 new shove uses higher target physical modifier; equality follows saved rule and default move is straight',()=>{
 const s=setup(),before=E.clone(s),result=E.resolveAction(s,push(s),{roll:()=>12});
 assert.equal(result.result.dc,14);assert.equal(result.result.total,14);assert(result.result.success);assert.equal(result.result.defense.attribute,'dexterity');assert.deepEqual(result.state.actors[1].position,{x:4,y:2});assert.equal(result.state.actors[1].hp,s.actors[1].hp);assert.deepEqual(s,before);
 assert.match(E.resultText(result.result,'en'),/Defense: DC 14 = 10 \+4 \(Dexterity\) \+0/);
});
test('1914 failed shove pays once and consumes one roll without moving target; natural override and tie options still apply',()=>{
 let s=setup();s=E.setRules(s,{hitEqual:false}).state;const r=E.resolveAction(s,push(s),{roll:()=>12});assert.equal(r.result.success,false);assert.deepEqual(r.state.actors[1].position,s.actors[1].position);assert.equal(E.actionBudget(r.state).used,true);
 s=E.setRules(s,{natural20:true}).state;assert.equal(E.resolveAction(s,push(s),{roll:()=>20}).result.success,true);assert.equal(E.resolveAction(s,push(s),{roll:()=>1}).result.success,false);
});
test('1914 defense modes use chosen target attribute once and allow decimal adjustments',()=>{
 const s=setup(),target=s.actors[1],skill=s.actors[0].skills[0];
 assert.equal(skillDefense(s,target,{...skill,dcMode:'fixed',dc:12.5,dcAdjustment:9}).dc,12.5);
 assert.equal(skillDefense(s,target,{...skill,dcMode:'target-dc',dcAdjustment:-1.5}).dc,16);
 assert.equal(skillDefense(s,target,{...skill,dcMode:'strength',dcAdjustment:0.5}).dc,13.5);
 assert.equal(skillDefense(s,target,{...skill,dcMode:'dexterity',dcAdjustment:-2}).dc,12);
 assert.equal(skillDefense(s,target,{...skill,dcMode:'charisma'}).dc,10);assert.match(skillDefenseText(s,target,skill,'de'),/Geschicklichkeit/);
});
test('1914 direct attribute bonuses are not converted again, including negative and decimal values',()=>{
 const s=setup('bonuses'),target={...s.actors[1],stats:{...s.actors[1].stats,strength:-2.5,dexterity:1.5}},skill={...s.actors[0].skills[0],dcAdjustment:0.25};
 assert.equal(skillDefense(s,target,skill).dc,11.75);assert.equal(skillDefense(s,target,{...skill,dcMode:'strength'}).dc,7.75);
});
test('1914 legacy shove profile without defense fields remains fixed through validation and export/import',()=>{
 let s=setup();const legacy={...s.actors[0].skills[0],dc:18};delete legacy.dcMode;delete legacy.dcAdjustment;s=E.editActor(s,s.actors[0].id,{skills:[legacy]}).state;
 const restored=E.validateState(JSON.parse(JSON.stringify(s)));assert.equal(restored.actors[0].skills[0].dcMode,'fixed');assert.equal(skillDefense(restored,restored.actors[1],restored.actors[0].skills[0]).dc,18);
 assert.equal(E.resolveAction(restored,push(restored),{roll:()=>14}).result.success,false);
});
test('1914 invalid defense modes/adjustments are rejected atomically',()=>{
 const s=setup(),before=E.clone(s);for(const patch of [{dcMode:'made-up'},{dcAdjustment:'x'},{dcAdjustment:101}])assert.throws(()=>E.editActor(s,s.actors[0].id,{skills:[{...s.actors[0].skills[0],...patch}]}));assert.deepEqual(s,before);
});
test('1914 straight shove direction works diagonally and preserves manual alternatives; wall blocks only that candidate',()=>{
 let s=setup();s=E.moveActor(s,s.actors[1].id,{x:3,y:3},true).state;assert.deepEqual(E.forcedDestinations(s,s.actors[0],s.actors[1])[0],{x:4,y:4});
 const choices=E.forcedDestinations(s,s.actors[0],s.actors[1]);assert(choices.length>1);const chosen=choices.at(-1),r=E.resolveAction(s,push(s,{destination:chosen}),{roll:()=>20});assert.deepEqual(r.state.actors[1].position,chosen);
 s=E.setBoard(s,{blocked:[{x:4,y:4}]}).state;assert(!E.forcedDestinations(s,s.actors[0],s.actors[1]).some(p=>p.x===4&&p.y===4));assert(E.forcedDestinations(s,s.actors[0],s.actors[1]).length>0);
});
test('1914 shove into a straight pit leaves the target hanging and unable to attack',()=>{
 let s=setup();s=E.setBoard(s,{pits:[{x:4,y:2}]}).state;const r=E.resolveAction(s,push(s),{roll:()=>20});assert.equal(r.state.actors[1].position,null);assert.deepEqual(r.state.actors[1].hanging.anchor,{x:4,y:2});assert(!E.isCombatant(r.state.actors[1]));assert.equal(r.state.actors[1].hp,s.actors[1].hp);
});
test('1914 manual remove records coordinates/height and rejoin records destination without duplicate initiative',()=>{
 let s=setup();s=E.setBoard(s,{heights:[{x:7,y:7}]}).state;const ally=s.actors[2];s=E.reserveActor(s,ally.id).state;const event=s.log.at(-1);assert.match(E.eventText(event,'en'),/Last position: H8 · Height 1/);assert.deepEqual(s.actors[2].lastPosition,{x:7,y:7});
 const restored=E.validateState(JSON.parse(JSON.stringify(s)));const r=E.deployActor(restored,ally.id,{x:6,y:6},{timing:'next'}).state;assert.match(E.eventText(r.log.findLast(e=>e.type==='presence'),'en'),/deployed at G7 · Height 0/);assert.equal(r.order.filter(id=>id===ally.id).length,1);assert.equal(r.actors[2].joinRound,s.round+1);assert.deepEqual(r.rng,s.rng);
});
test('1914 current model guidance exposes computed legal-target DC, while JSON retains profile IDs only',()=>{
 const s=setup(),text=E.buildPrompt(s,{compact:true,mode:'proposal'});const line=text.split('AVAILABLE SKILL TARGETS: ')[1].split('\n')[0],skills=JSON.parse(line);assert.equal(skills[0].targets.find(t=>t.id===s.actors[1].id).dc,14);
});
test('1914 range outline uses engine effective reach and Chebyshev geometry without changing line of sight',()=>{
 let s=setup();s=E.setRules(s,{perceptionRange:true}).state;const a={...s.actors[0],stats:{...s.actors[0].stats,perception:16}},w={mode:'ranged',range:3},reach=E.effectiveRange(s,a,w),frame=rangeFrame(s.board,a.position,reach);
 assert.equal(reach,6);assert.equal(frame.right,8);assert.equal(frame.left,0);assert.match(rangeEdges(frame,8,8),/right/);assert.match(rangeEdges(frame,8,8),/bottom/);assert.equal(rangeEdges(frame,2,2),'');assert.equal(rangeEdges(frame,9,2),'');
 s=E.setBoard(s,{blocked:[{x:3,y:3}]}).state;assert(!E.clearSight(s,a.position,{x:4,y:4}));assert(rangeFrame(s.board,a.position,reach));assert.equal(rangeFrame(s.board,null,reach),null);
});
test('1914 50x50 range outline has at most one board perimeter of marks, even with oversized range',()=>{
 const board={width:50,height:50},frame=rangeFrame(board,{x:25,y:25},100);let marked=0;for(let y=0;y<50;y++)for(let x=0;x<50;x++)if(rangeEdges(frame,x,y))marked++;assert.equal(marked,196);
});
test('1914 ability profile transfer preserves target defense mode/decimal adjustment while assigning new profile IDs',()=>{
 let s=setup();s=E.editActor(s,s.actors[0].id,{skills:[{...s.actors[0].skills[0],dcMode:'charisma',dcAdjustment:1.25}]}).state;
 const profile=exportProfiles(s,'skills',s.actors[0].id),patch=transferPatch(s.actors[2],profile);assert.equal(patch.skills[0].dcMode,'charisma');assert.equal(patch.skills[0].dcAdjustment,1.25);assert.notEqual(patch.skills[0].id,'push');s=E.editActor(s,s.actors[2].id,patch).state;assert.equal(skillDefense(s,s.actors[1],s.actors[2].skills[0]).dc,11.25);
});
