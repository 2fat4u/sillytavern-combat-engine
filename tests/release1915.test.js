import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../engine.js';
import {skillPreset,skillsFrom} from '../skills.js';
import {createController} from '../controller.js';
import {exportProfiles,profileFrom,transferPatch} from '../profiles.js';
import {planBasicTurn} from '../ai.js';
import {contextActions} from '../context-actions.js';
import {deploymentMarkup,bindDeployment,bindMapOptions} from '../deployment-ui.js';
import {helpMarkup} from '../help-ui.js';
import {skillsMarkup,readSkills} from '../skills-ui.js';
import {movementEdges} from '../board-range.js';
import {readFile} from 'node:fs/promises';
function scene({check=false,active=true,board=true}={}){
 let s=E.setRules(E.emptyState(),{skillsEnabled:true,resourcesEnabled:true,autoRemoveDead:true,splitMovement:true,boardEnabled:board}).state;
 s=E.addActor(s,{id:'caster',name:'Necromancer',side:'player',position:{x:1,y:2},maxHp:24,initiative:30,stats:{intelligence:18},resources:[{id:'mana',name:'Mana',kind:'ammo',quantity:12,capacity:12}],skills:[{...skillPreset('revive','en'),id:'revive',resource:'mana',cost:4,reviveHp:8,range:4,check}]}).state;
 s=E.addActor(s,{id:'dead',name:'Fallen guard',side:'ally',hp:0,maxHp:20,condition:'dead',position:{x:3,y:2},initiative:20,resources:[{id:'arrows',name:'Arrows',kind:'ammo',quantity:3,capacity:10}]}).state;
 s=E.addActor(s,{id:'foe',name:'Raider',side:'enemy',position:{x:7,y:5},initiative:10,control:'basic'}).state;
 s.actors.forEach((a,i)=>{a.id=['caster','dead','foe'][i];});
 return active?E.startCombat(s,false).state:s;
}
const cast=(s,extra={})=>({type:'skill',actor:'caster',target:'dead',skill:'revive',turn:E.turnToken(s),...extra});
test('1915 revive returns automatically removed corpse, preserves side/stocks and pays one action once',()=>{
 const s=scene(),r=E.resolveAction(s,cast(s)),b=r.state.actors[1];assert.equal(s.actors[1].position,null);assert.equal(b.hp,8);assert.equal(b.condition,'fit');assert.deepEqual(b.position,{x:3,y:2});assert.equal(b.side,'ally');assert.equal(b.resources[0].quantity,3);assert.equal(r.state.actors[0].resources[0].quantity,8);assert.equal(r.state.action.freeSpent,1);assert.equal(b.joinRound,s.round+1);assert.equal(r.state.order.filter(v=>v==='dead').length,1);assert.match(E.resultText(r.result,'en'),/revived with 8\/20 HP/);
});
test('1915 revive caps HP, clears active impairments/shields and leaves profiles, stance and resources intact',()=>{
 let s=scene();s=E.editActor(s,'caster',{skills:[{...s.actors[0].skills[0],reviveHp:999}]}).state;s=E.editActor(s,'dead',{stance:'defensive',effects:[{type:'burning',turns:3,damage:'2'}],tactics:[{type:'rooted',turns:2}],hidden:null}).state;
 const b=E.resolveAction(s,cast(s)).state.actors[1];assert.equal(b.hp,20);assert.deepEqual(b.effects,[]);assert.deepEqual(b.tactics,[]);assert.deepEqual(b.shields,[]);assert.equal(b.stance,'defensive');assert.equal(b.roundsLeft,null);assert.equal(b.downedRound,null);assert.equal(b.hanging,null);assert.equal(b.reactionReserve,false);assert.equal(b.reactionUsed,true);
});
test('1915 revive from occupied last cell offers a safe neighboring landing and rejects occupied destinations atomically',()=>{
 let s=scene();s=E.addActor(s,{id:'blocker',name:'Blocker',side:'ally',position:{x:3,y:2}}).state;const choices=E.revivalDestinations(s,s.actors[0],s.actors[1],s.actors[0].skills[0]);assert(choices.length);assert(!choices.some(v=>v.x===3&&v.y===2));const before=E.clone(s);assert.throws(()=>E.resolveAction(s,cast(s,{destination:{x:3,y:2}})),/Wiederbelebungsfeld/);assert.deepEqual(s,before);assert.deepEqual(E.resolveAction(s,cast(s,{destination:choices.at(-1)})).state.actors[1].position,choices.at(-1));
});
test('1915 no last position, no safe cell or insufficient mana cannot consume action or resources',()=>{
 for(const variant of ['missing','walls','mana']){let s=scene();if(variant==='missing')s=E.editActor(s,'dead',{lastPosition:null}).state;if(variant==='walls')s=E.setBoard(s,{blocked:[{x:2,y:1},{x:3,y:1},{x:4,y:1},{x:2,y:2},{x:3,y:2},{x:4,y:2},{x:2,y:3},{x:3,y:3},{x:4,y:3}]}).state;if(variant==='mana')s=E.editActor(s,'caster',{resources:[{...s.actors[0].resources[0],quantity:3}]}).state;const before=E.clone(s);assert(!E.canUseSkill(s,s.actors[0],s.actors[1],s.actors[0].skills[0]));assert.throws(()=>E.resolveAction(s,cast(s)));assert.deepEqual(s,before);}
});
test('1915 revive requires death; unconscious, stabilized, fit, escaped and self targets are rejected',()=>{
 for(const state of ['unconscious','stabilized','fit']){let s=scene();s=E.editActor(s,'dead',{hp:state==='fit'?1:0,condition:state,roundsLeft:state==='unconscious'?3:null}).state;assert(!E.canUseSkill(s,s.actors[0],s.actors[1],s.actors[0].skills[0]));}
 let s=scene();s=E.editActor(s,'dead',{escaped:true}).state;assert(!E.canUseSkill(s,s.actors[0],s.actors[1],s.actors[0].skills[0]));assert.throws(()=>E.resolveAction(s,cast(s,{target:'caster'})));
});
test('1915 failed revive rolls once, consumes mana/action and does not change corpse',()=>{
 const s=scene({check:true});let draws=0;const r=E.resolveAction(s,cast(s),{roll:()=>{draws++;return 1;}});assert.equal(draws,1);assert(!r.result.success);assert.equal(r.state.actors[1].hp,0);assert.equal(r.state.actors[1].position,null);assert.equal(r.state.actors[0].resources[0].quantity,8);assert.equal(r.state.action.freeSpent,1);
});
test('1915 revival rejects malformed destination coordinates and extra payload without spending',()=>{
 const s=scene(),before=E.clone(s);for(const destination of [{x:'3',y:2},{x:3,y:2,hp:999},{x:3.5,y:2}])assert.throws(()=>E.resolveAction(s,cast(s,{destination})),/Wiederbelebungsfeld/);assert.deepEqual(s,before);
});
test('1915 optional target-based revive check uses the selected target bonus once',()=>{
 let s=scene({check:true});s=E.editActor(s,'caster',{skills:[{...s.actors[0].skills[0],dcMode:'strength',dcAdjustment:1}]}).state;let draws=0;const r=E.resolveAction(s,cast(s),{roll:()=>{draws++;return 20;}});assert.equal(draws,1);assert.equal(r.result.dc,11);assert(r.result.success);
});
test('1915 revival is range/sight/height constrained; walls and pits are not return cells',()=>{
 let s=scene(),a=s.actors[0],b=s.actors[1],skill=a.skills[0];s=E.setBoard(s,{blocked:[{x:2,y:2}]}).state;assert(!E.canUseSkill(s,a,b,skill));s=scene();s=E.editActor(s,'caster',{skills:[{...skill,range:1}]}).state;assert(!E.canUseSkill(s,s.actors[0],s.actors[1],s.actors[0].skills[0]));s=E.setBoard(scene(),{pits:[{x:2,y:1}],heights:[{x:4,y:2}]}).state;const cells=E.revivalDestinations(s,s.actors[0],s.actors[1],skill);assert(!cells.some(p=>E.isPit(s,p)||E.heightAt(s,p)!==0));
});
test('1915 returning corpse receives no same-round turn, including an earlier initiative slot',()=>{
 let s=scene();s=E.editActor(s,'dead',{initiative:40,initiativeReady:false}).state;s=E.resolveAction(s,cast(s)).state;assert.equal(E.currentActor(s).id,'caster');assert.equal(s.actors[1].joinRound,2);s=E.endTurn(s).state;assert.equal(E.currentActor(s).id,'foe');s=E.endTurn(s).state;assert.equal(E.currentActor(s).id,'dead');assert.equal(s.round,2);s=E.endTurn(s).state;assert.equal(E.currentActor(s).id,'caster');
});
test('1915 resurrection keeps an enemy an enemy and never restarts ended combat',()=>{
 let s=scene();s=E.editActor(s,'dead',{side:'enemy'}).state;s=E.stopCombat(s).state;const phase=s.phase,r=E.resolveAction(s,cast(s));assert.equal(r.state.actors[1].side,'enemy');assert.equal(r.state.phase,phase);assert.equal(r.state.actors[1].hp,8);
});
test('1915 board-disabled revival needs no invented coordinates; resource module toggle is respected',()=>{
 let s=scene({board:false});s=E.editActor(s,'dead',{position:null,lastPosition:null,reserve:true}).state;s=E.setRules(s,{resourcesEnabled:false}).state;const r=E.resolveAction(s,cast(s));assert.equal(r.state.actors[1].hp,8);assert.equal(r.state.actors[1].reserve,false);assert.equal(r.state.actors[0].resources[0].quantity,12);assert.equal(r.state.actors[1].position,null);
});
test('1915 existing corpse on board can be revived in place',()=>{
 let s=E.setRules(scene(),{autoRemoveDead:false}).state;s=E.editActor(s,'dead',{position:{x:3,y:2},reserve:false}).state;assert.deepEqual(E.resolveAction(s,cast(s)).state.actors[1].position,{x:3,y:2});
});
test('1915 revived state and skill HP survive save/load, profile transfer and one controller Undo',async()=>{
 let s=scene();const profile=profileFrom(exportProfiles(s,'skills','caster')),patch=transferPatch(s.actors[2],profile);assert.equal(patch.skills[0].reviveHp,8);assert(patch.skills[0].resource);let data={state:s,history:[]};const c=createController({key:()=> 'a',read:()=>data,write:v=>data=v,save:async()=>{}});await c.act(cast(s));assert.equal(c.state().actors[1].hp,8);assert.equal(E.validateState(JSON.parse(JSON.stringify(c.state()))).actors[1].hp,8);await c.undo();assert.deepEqual(c.state().actors,s.actors);
});
test('1915 Basic AI does not initiate revive, even if an imported profile has ai true',()=>{
 let s=scene();s=E.editActor(s,'caster',{control:'basic',skills:[{...s.actors[0].skills[0],ai:true}]}).state;assert.notEqual(planBasicTurn(s)?.intent?.skill,'revive');assert(contextActions(s,'dead','en').some(v=>v.skill==='revive'&&!v.reason));assert.match(E.buildPrompt(s,{compact:true,mode:'proposal'}),/Fallen guard/);
});
test('1915 revival editor explains real target/cost and preserves return HP',()=>{
 const s=scene(),a=s.actors[0],html=skillsMarkup(a,a.skills,'en',s.rules);assert.match(html,/HP after revival/);assert.match(html,/An actually dead participant/);assert.match(html,/Basic AI does not initiate/);const values=new Map(Object.entries({'skill-0-reviveHp':'17'}));const fields={get:k=>values.has(k)?values.get(k):({name:'Rebirth',stat:'intelligence',range:'4',dc:'15',dcMode:'fixed',dcAdjustment:'0',bonus:'0',cost:'4',turns:'1',resource:'mana'})[k.slice(8)]??null,has:()=>false};assert.equal(readSkills(fields,a.skills)[0].reviveHp,17);
 for(const v of [0,-1,1.5,'x'])assert.throws(()=>skillsFrom([{...a.skills[0],reviveHp:v}],Object.keys(E.STATS),a.resources));
});
function formationScene(){let s=E.setBoard(E.emptyState(),{width:50,height:50}).state;for(let i=0;i<24;i++)s=E.addActor(s,{id:'u'+i,name:'Unit '+i,side:i<12?'ally':'enemy',hp:10,position:i===0?{x:2,y:2}:null,reserve:i>0}).state;s.actors.forEach((a,i)=>{a.id='u'+i;});return s;}
test('1915 Only unplaced includes all living reserve participants and preserves the fixed actor',()=>{
 const s=formationScene(),r=E.randomPlace(s,{seed:'reserve'});assert.equal(r.result.count,23);assert(r.state.actors.every(a=>a.position&&!a.reserve));assert.deepEqual(r.state.actors[0],s.actors[0]);assert.deepEqual(r.state.rng,s.rng);assert.equal(new Set(r.state.actors.map(a=>E.coordinate(a.position))).size,24);
});
test('1915 dead, escaped and hanging actors are never randomly deployed',()=>{
 let s=formationScene();s=E.editActor(s,'u1',{hp:0,condition:'dead'}).state;s=E.editActor(s,'u2',{escaped:true}).state;s=E.editActor(s,'u3',{hanging:{anchor:{x:4,y:4},turns:3,round:0},lastPosition:{x:3,y:4}}).state;const r=E.randomPlace(s,{scope:'all'}).state;for(const i of [1,2,3])assert.deepEqual(r.actors[i],s.actors[i]);
});
for(const partyFormation of ['compact','loose','spread'])for(const enemyFormation of ['compact','loose','spread'])test('1915 independent formations '+partyFormation+'/'+enemyFormation+' are deterministic, legal and unique on a large board',()=>{
 const s=formationScene(),o={scope:'all',mode:'custom',partyFormation,enemyFormation,seed:'formations'},r=E.randomPlace(s,o).state;assert.deepEqual(r.actors,E.randomPlace(s,o).state.actors);assert(r.actors.every(a=>a.position&&E.canOccupy(r,a.position)&&!a.reserve));assert.equal(new Set(r.actors.map(a=>E.coordinate(a.position))).size,24);assert.deepEqual(r.actors.map(a=>a.hp),s.actors.map(a=>a.hp));
});
test('1915 compact armies are apart, loose groups have breathing room, scattered enemies cover more area',()=>{
 const s=formationScene(),r=E.randomPlace(s,{scope:'all',seed:'space'}).state,loose=E.randomPlace(s,{scope:'all',seed:'space',partyFormation:'loose',enemyFormation:'loose'}).state,spread=E.randomPlace(s,{scope:'all',seed:'space',mode:'scattered'}).state;
 const diameter=a=>Math.max(...a.flatMap(x=>a.map(y=>E.distance(x.position,y.position))));assert(diameter(r.actors.slice(0,12))<8);assert(E.distance(r.actors[0].position,r.actors[12].position)>20);assert(diameter(loose.actors.slice(0,12))>diameter(r.actors.slice(0,12)));assert(diameter(spread.actors.slice(12))>diameter(r.actors.slice(12)));
});
test('1915 deployment rejects paused encounter and insufficient space atomically',()=>{
 let s=scene();s=E.reserveActor(s,'caster').state;s=E.reserveActor(s,'foe').state;assert.equal(s.phase,'paused');assert.throws(()=>E.randomPlace(s));s=E.setBoard(E.emptyState(),{width:2,height:2,pits:[{x:0,y:0},{x:1,y:0},{x:0,y:1}]}).state;for(let i=0;i<2;i++)s=E.addActor(s,{name:'Unit '+i,reserve:true}).state;const before=E.clone(s);assert.throws(()=>E.randomPlace(s));assert.deepEqual(s,before);
});
test('1915 formation dialog includes reserve IDs and explains separated camps in both languages',()=>{
 const s=formationScene();for(const language of ['de','en']){const html=deploymentMarkup(s,language);assert.equal((html.match(/name="placeActor"/g)??[]).length,24);assert(html.includes('value="u1"'));assert.match(html,/name="partyFormation"/);assert.match(html,/name="enemyFormation"/);assert(!html.includes('enemies separate'));}
});
function control(value){return {value,disabled:false};}
function dialogHarness(){const events={},elements={preset:control('forest'),roomScale:control('large'),wallPercent:control('12'),placementMode:control('groups'),partyFormation:control('compact'),enemyFormation:control('compact')};const form={elements,addEventListener:(k,fn)=>(events[k]??=[]).push(fn)};const panel=(type,controls)=>({dataset:{mapOption:type},hidden:false,querySelectorAll:()=>controls});const panels=[panel('dungeon',[elements.roomScale]),panel('custom',[elements.wallPercent])];return {elements,panels,querySelector:()=>form,querySelectorAll:()=>panels,change(name,value){elements[name].value=value;for(const fn of events.change??[])fn({target:{name}});}};}
test('1915 preset selection updates both formations; individual selection switches to custom',()=>{
 const d=dialogHarness();bindDeployment(d);d.change('placementMode','scattered');assert.equal(d.elements.partyFormation.value,'compact');assert.equal(d.elements.enemyFormation.value,'spread');d.change('enemyFormation','loose');assert.equal(d.elements.placementMode.value,'custom');d.change('placementMode','random');assert.equal(d.elements.partyFormation.value,'spread');assert.equal(d.elements.enemyFormation.value,'spread');
});
test('1915 switching Dungeon/Forest/Custom hides irrelevant map settings and retains their values',()=>{
 const d=dialogHarness();bindMapOptions(d);assert(d.panels[0].hidden);assert(d.elements.roomScale.disabled);d.change('preset','dungeon');assert(!d.panels[0].hidden);assert(!d.elements.roomScale.disabled);assert(d.panels[1].hidden);d.change('preset','custom');assert(d.panels[0].hidden);assert(!d.panels[1].hidden);assert(!d.elements.wallPercent.disabled);d.change('preset','dungeon');assert.equal(d.elements.roomScale.value,'large');assert(!d.panels[0].hidden);
});
test('1915 help is thematic in both languages with unique topic keys and no patch heading',()=>{
 for(const lang of ['de','en']){const keys=[],titles=[];const html=helpMarkup(lang,(key,title,body)=>{keys.push(key);titles.push(title);return body;});assert.equal(new Set(keys).size,keys.length);assert(keys.includes('help-deployment'));assert(keys.includes('help-revival'));assert(!titles.some(t=>/1\.9\.|[Nn]ew in|Neu in|New rules in/.test(t)));assert.match(html,lang==='en'?/actually dead participants/:/tatsächlich Tote/);}
});
test('1915 movement boundary follows irregular reachable cells and excludes holes instead of a geometric rectangle',()=>{
 const cells=new Set(['0,0','1,0','2,0','0,1','2,1','0,2','1,2','2,2']);assert.equal(movementEdges(cells,1,1),'');assert.match(movementEdges(cells,1,0),/ct-move-bottom/);assert.match(movementEdges(cells,0,1),/ct-move-right/);assert.match(movementEdges(cells,2,2),/ct-move-bottom/);assert.equal(movementEdges(new Set(),1,1),'');
});
test('1915 revival test pack imports character/ability files and each caster can revive the intended corpse with declared cost',async()=>{
 const base=new URL('../examples/necromancy1915/',import.meta.url);for(const f of ['01-Necromancer-Character.json','02-Cleric-Character.json','03-Enemy-Necromancer-Character.json','05-Revival-Abilities.json'])assert(profileFrom(JSON.parse(await readFile(new URL(f,base),'utf8'))));
 const seed=E.validateState(JSON.parse(await readFile(new URL('04-Lantern-Crypt-Combat.json',base),'utf8')));assert.equal(seed.actors.length,7);
 for(const [casterIndex,targetIndex,hp,cost]of [[0,1,8,4],[2,1,12,6],[4,5,10,5]]){let s=E.clone(seed);s.actors[casterIndex].initiative=100;s=E.startCombat(s,false).state;const a=s.actors[casterIndex],b=s.actors[targetIndex],v=a.skills.find(v=>v.kind==='revive'),before=a.resources.find(v=>v.id==='mana').quantity;assert.equal(E.currentActor(s).id,a.id);const r=E.resolveAction(s,{type:'skill',actor:a.id,target:b.id,skill:v.id,turn:E.turnToken(s)});assert.equal(r.state.actors[targetIndex].hp,hp);assert.equal(r.state.actors[targetIndex].side,b.side);assert.equal(r.state.actors[casterIndex].resources.find(v=>v.id==='mana').quantity,before-cost);assert.equal(r.state.actors[targetIndex].joinRound,2);}
});
test('1915 revival after combat is manual only; other skills still require combat',()=>{
 const s=E.stopCombat(scene()).state;s.phase='ended';assert.throws(()=>E.resolveAction(s,cast(s),{source:'model'}),/starten/);assert.equal(E.resolveAction(s,cast(s)).state.phase,'ended');let t=E.editActor(s,'caster',{skills:[{...skillPreset('aim','en'),id:'aim'}]}).state;assert.throws(()=>E.resolveAction(t,{type:'skill',actor:'caster',target:'caster',skill:'aim'}),/starten/);
});
test('1915 resurrection from a hanging death uses a safe remembered ledge, not the pit',()=>{
 let s=scene();s=E.setBoard(s,{pits:[{x:4,y:2}]}).state;s=E.editActor(s,'dead',{hanging:null,lastPosition:{x:3,y:2},lastHeight:0}).state;const r=E.resolveAction(s,cast(s));assert.deepEqual(r.state.actors[1].position,{x:3,y:2});assert.equal(r.state.actors[1].hanging,null);
});
