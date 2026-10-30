import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../engine.js';
import { aiConfigFrom, aiMemoryFrom, surveyHas } from '../ai-state.js';
import { planAdvancedTurn } from '../advanced-ai.js';
import { resolveAdvancedTurn } from '../advanced-runner.js';
import { aiOptionsMarkup, readAIOptions } from '../ai-ui.js';
import { createController } from '../controller.js';
import { exportProfiles, profileFrom } from '../profiles.js';

function scene(actors=[],rules={}){
    let s=E.emptyState();s.board={...s.board,width:40,height:20};
    s.rules=E.rulesFrom({...s.rules,visionEnabled:true,visionBase:3,visionPerception:false,stancesEnabled:false,multiActionsEnabled:true,splitMovement:true,rngMode:'seeded',seed:'alpha2-search',...rules});
    s.actors=actors.map((v,i)=>E.actorFrom({id:'a'+i,name:'Actor '+i,position:{x:2+i,y:3},side:'player',control:'advanced',initiative:100-i,maxHp:50,hp:50,weaponList:[],aiConfig:{idle:'search',free:true,retreat:false},...v},true));
    return E.startCombat(E.validateState(s)).state;
}
const distant={side:'enemy',position:{x:35,y:16},control:'manual'};
function nextOwn(s,id='a0'){while(s.phase==='active'&&E.currentActor(s).id!==id)s=E.endTurn(s).state;return s;}

test('free search crosses its old home radius without returning to home',()=>{
    let s=scene([{},distant]);let max=0;
    for(let i=0;i<12;i++){const p=planAdvancedTurn(s);assert.notEqual(p.reasonEn,'Return to home territory');s=resolveAdvancedTurn(s).state;max=Math.max(max,E.distance(s.actors[0].position,s.actors[0].aiConfig.home));s=nextOwn(s);}
    assert(max>10,'search failed to leave the starting region');E.validateState(s);
});
test('search follows a persistent reachable goal around a wall rather than heading home',()=>{
    let s=scene([{},distant]);s.board.blocked=Array.from({length:12},(_,y)=>({x:7,y}));const p=planAdvancedTurn(s);assert(p.searchData.goal);s=E.applyAIPlan(s,p).state;
    const first=s.actors[0].aiMemory.searchGoal;assert.deepEqual(planAdvancedTurn(s).searchData.goal,first);assert.notEqual(planAdvancedTurn(s).reasonEn,'Return to home territory');
});
test('a nearby pair shares one exploration goal and does not mutate planning state',()=>{
    let s=scene([{aiConfig:{idle:'search',free:true,searchTogether:true}},{aiConfig:{idle:'search',free:true,searchTogether:true}},distant]);const before=E.clone(s),p=planAdvancedTurn(s);assert.deepEqual(s,before);assert.deepEqual(p.searchData.team,['a0','a1']);
    s=E.applyAIPlan(s,p).state;assert.deepEqual(s.actors[0].aiMemory.searchGoal,s.actors[1].aiMemory.searchGoal);assert.deepEqual(s.actors[1].aiMemory.searchTeam,['a0','a1']);
});
test('six nearby searchers form separate parties of at most three',()=>{
    let s=scene([...Array.from({length:6},(_,i)=>({position:{x:2+i%3,y:3+Math.floor(i/3)},aiConfig:{idle:'search',free:true,searchTogether:true}})),distant]);
    for(let i=0;i<6;i++){const p=planAdvancedTurn(s);assert(p.searchData.team.length<=3);s=resolveAdvancedTurn(s).state;}
    const groups=new Set(s.actors.slice(0,6).map(a=>a.aiMemory.searchTeam.join('|')));assert(groups.size>=2);assert([...groups].every(k=>k.split('|').length<=3));
    for(const a of s.actors.slice(0,6))for(const id of a.aiMemory.searchTeam)assert.deepEqual(E.findActor(s,id).aiMemory.searchTeam,a.aiMemory.searchTeam,'one participant was claimed by two parties');
});
test('a solitary group searcher keeps exploring and waiting guards do not join',()=>{
    const s=scene([{aiConfig:{idle:'search',free:true,searchTogether:true}},{aiConfig:{idle:'wait',free:false,radius:0,searchTogether:true}},distant]),p=planAdvancedTurn(s);assert.deepEqual(p.searchData.team,['a0']);assert(p.move);
});
test('small parties progress through a doorway without sharing a cell or stalling forever',()=>{
    let s=scene([{position:{x:3,y:4},aiConfig:{idle:'search',free:true,searchTogether:true}},{position:{x:3,y:5},aiConfig:{idle:'search',free:true,searchTogether:true}},{position:{x:2,y:5},aiConfig:{idle:'search',free:true,searchTogether:true}},distant]);
    s.board.blocked=Array.from({length:20},(_,y)=>({x:7,y})).filter(p=>p.y!==9);let right=0;
    for(let i=0;i<90;i++){if(E.currentActor(s).control==='manual')s=E.endTurn(s).state;else s=resolveAdvancedTurn(s).state;E.validateState(s);const positions=s.actors.filter(a=>a.position).map(a=>E.coordinate(a.position));assert.equal(new Set(positions).size,positions.length);right=Math.max(right,...s.actors.slice(0,3).map(a=>a.position.x));}
    assert(right>10,'party did not pass through the doorway');
});
test('lost or unavailable partners do not bind a searcher to an obsolete group',()=>{
    let s=scene([{aiConfig:{idle:'search',free:true,searchTogether:true}},{aiConfig:{idle:'search',free:true,searchTogether:true}},distant]);s=E.applyAIPlan(s,planAdvancedTurn(s)).state;s=E.moveActor(s,'a1',{x:28,y:3},true).state;const p=planAdvancedTurn(s);assert.deepEqual(p.searchData.team,['a0']);assert(p.move);
});
test('partners outside actual perception or behind a wall do not join or share terrain',()=>{
    for(const wall of [false,true]){const s=scene([{aiConfig:{idle:'search',free:true,searchTogether:true}},{position:{x:wall?4:6,y:3},aiConfig:{idle:'search',free:true,searchTogether:true}},distant],{visionBase:3});if(wall)s.board.blocked=[{x:3,y:3},{x:3,y:2},{x:3,y:4}];assert.deepEqual(planAdvancedTurn(s).searchData.team,['a0']);}
});
test('unknown distant enemies do not change the exploration goal or reveal concealed searchers',()=>{
    const s=scene([{hidden:{turns:5,appliedTurn:0},aiConfig:{idle:'search',free:true,searchTogether:true}},{hidden:{turns:5,appliedTurn:0},aiConfig:{idle:'search',free:true,searchTogether:true}},distant],{hideNeedsTerrain:false});
    const p=planAdvancedTurn(s),other=E.clone(s);other.actors[2].position={x:30,y:16};assert.deepEqual(planAdvancedTurn(other),p);const n=E.applyAIPlan(s,p).state;assert(n.actors[0].hidden);assert(n.actors[1].hidden);
});
test('public player views do not expose hidden search partners through a visible enemy memory',()=>{
    let s=scene([{control:'manual',initiative:10},{side:'enemy',initiative:100,position:{x:5,y:3},aiConfig:{idle:'search',free:true,searchTogether:true}},{side:'enemy',position:{x:8,y:3},aiConfig:{idle:'search',free:true,searchTogether:true}}],{hideUnseenEnemies:true});
    // The visible scout legitimately knows an ally that the player cannot see.
    assert(s.actors[1].aiMemory.allyContacts.some(v=>v.id==='a2'));assert(E.playerCanSee(s,s.actors[1]));assert(!E.playerCanSee(s,s.actors[2]));const view=E.playerView(s);assert(!view.actors.some(a=>a.id==='a2'));assert.deepEqual(view.actors.find(a=>a.id==='a1').aiMemory.allyContacts,[]);assert(s.actors[1].aiMemory.allyContacts.length>0);
});
test('survey and group knowledge survive reload and reset for a new combat',()=>{
    let s=scene([{aiConfig:{idle:'search',free:true,searchTogether:true}},{aiConfig:{idle:'search',free:true,searchTogether:true}},distant]);s=E.applyAIPlan(s,planAdvancedTurn(s)).state;const m=s.actors[0].aiMemory;assert(surveyHas(m.survey,s.actors[0].position));assert.deepEqual(E.validateState(JSON.parse(JSON.stringify(s))).actors[0].aiMemory,m);
    s.phase='setup';s=E.startCombat(s).state;assert.equal(s.actors[0].aiMemory.searchTeam.length,0);assert.equal(s.actors[0].aiMemory.searchGoal,null);
});
test('automatic home follows deployment while a fixed or legacy home is retained',()=>{
    let s=scene([{aiConfig:{idle:'wait',free:false,radius:1,homeMode:'deployment'}},distant]);s.phase='setup';s=E.deployActor(s,'a0',{x:15,y:4}).state;assert.deepEqual(s.actors[0].aiConfig.home,{x:15,y:4});s=E.startCombat(s).state;assert.deepEqual(s.actors[0].aiConfig.home,{x:15,y:4});
    let fixed=scene([{aiConfig:{idle:'wait',free:false,radius:1,home:{x:2,y:3}}},distant]);fixed.phase='setup';fixed=E.deployActor(fixed,'a0',{x:15,y:4}).state;assert.equal(fixed.actors[0].aiConfig.homeMode,'fixed');assert.deepEqual(fixed.actors[0].aiConfig.home,{x:2,y:3});
});
test('random deployment updates automatic homes and leaves deliberate fixed cells intact',()=>{
    let s=scene([{aiConfig:{homeMode:'deployment'}},{aiConfig:{homeMode:'fixed',home:{x:3,y:3}}},distant]);s.phase='setup';s=E.randomPlace(s,{scope:'all',seed:'alpha2-home'}).state;assert.deepEqual(s.actors[0].aiConfig.home,s.actors[0].position);assert.deepEqual(s.actors[1].aiConfig.home,{x:3,y:3});
});
test('portable profiles discard the previous map home and bind to their next deployment',()=>{
    const s=scene([{aiConfig:{homeMode:'fixed',home:{x:2,y:3},searchTogether:true}},distant]);const raw=exportProfiles(s,'actor','a0');assert.equal(raw.actors[0].aiConfig.home,null);assert.equal(raw.actors[0].aiConfig.homeMode,'deployment');const profile=profileFrom(raw).actors[0];assert.equal(profile.aiConfig.homeMode,'deployment');assert(profile.aiConfig.searchTogether);assert.deepEqual(profile.aiMemory.searchTeam,[]);
});
test('alarms can report a fresh observation after losing sight without tracking the target',()=>{
    let s=scene([{aiConfig:{alarm:true,alarmRadius:3,searchTurns:3},resources:[{id:'mana',name:'Mana',kind:'ammo',quantity:5}]},{position:{x:10,y:4}},{side:'enemy',position:{x:4,y:3},control:'manual'}]);s=E.moveActor(s,'a0',{x:9,y:3},true).state;const remembered=E.alarmReport(s,s.actors[0]);assert.deepEqual(remembered.position,{x:4,y:3});s=E.moveActor(s,'a2',{x:30,y:16},true).state;assert.deepEqual(E.alarmReport(s,s.actors[0]).position,{x:4,y:3});
    assert(E.canAlarm(s,s.actors[0]));s=E.resolveAction(s,{type:'alarm',actor:'a0'},{source:'advanced'}).state;assert.deepEqual(s.actors[1].aiMemory.alert.position,{x:4,y:3});assert.equal(s.action.freeSpent,1);assert(!E.canAlarm(s,s.actors[0]));
});
test('stale observations and unaffordable alarms cannot produce alerts',()=>{
    const s=scene([{aiConfig:{alarm:true,alarmRadius:5,alarmResource:'mana',alarmCost:2},resources:[{id:'mana',name:'Mana',kind:'ammo',quantity:1}]},{},{side:'enemy',position:{x:4,y:3},control:'manual'}]);assert(!E.canAlarm(s,s.actors[0]));const old=E.clone(s);old.turnSerial+=1000;old.actors[2].position={x:35,y:16};assert.equal(E.alarmReport(old,old.actors[0]),null);
});
test('threatened actors can prefer paid retreat toward known allies and then alert',()=>{
    let s=scene([{hp:12,aiConfig:{alarm:true,alarmRadius:3,retreat:true,free:true}}, {position:{x:0,y:9}}, ...Array.from({length:3},(_,i)=>({side:'enemy',position:{x:9,y:1+i},control:'manual'}))],{visionBase:7});let rally=0;
    for(let i=0;i<50;i++){s.rules.seed='rally-'+i;const p=planAdvancedTurn(s);if(p.rally&&p.move){rally++;assert(E.distance(p.move,s.actors[1].position)<E.distance(s.actors[0].position,s.actors[1].position));}}
    assert(rally>15,'rally never meaningfully competed with other responses');
    s.rules.seed='rally-1';const p=planAdvancedTurn(s);const n=resolveAdvancedTurn(s).state;E.validateState(n);assert(n.turnSerial>s.turnSerial);
});
test('no known allies and territory-bound bosses do not choose a rally plan',()=>{
    for(const config of [{free:true},{free:false,homeMode:'fixed',home:{x:2,y:3},radius:1}]){const s=scene([{hp:8,aiConfig:{...config,alarm:true,retreat:true}}, ...Array.from({length:3},(_,i)=>({side:'enemy',position:{x:4,y:2+i},control:'manual'}))]);for(let i=0;i<20;i++){s.rules.seed='norally-'+i;assert(!planAdvancedTurn(s).rally);}}
});
test('a combined retreat and alert pays normal movement and one stock cost exactly once',()=>{
    const s=scene([{hp:12,aiConfig:{alarm:true,alarmRadius:3,retreat:true,free:true,alarmResource:'mana',alarmCost:2},resources:[{id:'mana',name:'Mana',kind:'ammo',quantity:5}]},{position:{x:0,y:9}},...Array.from({length:3},(_,i)=>({side:'enemy',position:{x:9,y:1+i},control:'manual'}))],{visionBase:7});
    let chosen=false;for(let i=0;i<80;i++){s.rules.seed='paid-rally-'+i;const p=planAdvancedTurn(s);if(p.rally&&p.move&&p.intent.type==='alarm'){chosen=true;break;}}assert(chosen);
    const r=resolveAdvancedTurn(s),actions=r.result.actions??[r.result];assert.equal(actions.filter(v=>v.alarm).length,1);assert.equal(r.state.actors[0].resources[0].quantity,3);assert(r.state.log.some(e=>e.type==='move'&&e.details.actor==='a0'&&!e.details.override&&e.details.movement.spent>0));E.validateState(r.state);
});
test('Undo restores the exploration goal and survey together with the paid turn',async()=>{
    let bundle={state:scene([{aiConfig:{idle:'search',free:true,searchTogether:true}},{aiConfig:{idle:'search',free:true,searchTogether:true}},distant]),history:[],images:{},library:[]};const c=createController({key:()=> 'undo-search',read:()=>bundle,write:v=>{bundle=v;},save:async()=>{},preferences:()=>({}),connection:()=>({label:'test'})});const before=E.clone(c.state().actors[0].aiMemory),serial=c.state().turnSerial;await c.aiStep();assert(c.state().actors[0].aiMemory.counter>before.counter);await c.undo();const restored=E.clone(c.state().actors[0].aiMemory);for(const v of restored.allyContacts)v.seen-=c.state().turnSerial-serial;assert.deepEqual(restored,before);
});
test('new search settings reject malformed values and use native controls in both languages',()=>{
    assert.throws(()=>aiConfigFrom({searchTogether:'true'}));assert.throws(()=>aiConfigFrom({homeMode:'teleport'}));assert.throws(()=>aiMemoryFrom({survey:[2**51]}));assert.throws(()=>aiMemoryFrom({searchTeam:['1','2','3','4']}));
    const s=scene([{},distant]);for(const language of ['de','en']){const html=aiOptionsMarkup(s.actors[0],language);assert(html.includes('name="aiSearchTogether"'));assert(html.includes('name="aiHomeMode"'));}
    const form=new Map([['aiIdle','search'],['aiSearchTogether','on'],['aiHomeMode','deployment'],['aiFree','on'],['aiRadius','5'],['aiSearchTurns','3'],['aiAlarmRadius','6'],['aiAlarmCost','0']]);const config=readAIOptions(form,s.actors[0]);assert(config.searchTogether);assert.equal(config.homeMode,'deployment');
});
test('debug summaries include search and home controls without unbounded exploration data',async()=>{
    const state=scene([{},distant]);let bundle={state,history:[],images:{},library:[]};const c=createController({key:()=> 'test',read:()=>bundle,write:v=>{bundle=v;},save:async()=>{},preferences:()=>({debugEnabled:true}),connection:()=>({label:'test'})});await c.aiStep();const debug=JSON.parse(c.debugText());const snapshot=debug.entries.find(e=>e.state)?.state;assert(snapshot);assert(snapshot.actors[0].aiConfig);assert(snapshot.actors[0].aiSearch);assert(!Object.hasOwn(snapshot.actors[0].aiSearch,'survey'));
});
