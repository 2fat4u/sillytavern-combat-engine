import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../engine.js';
import {skillPreset} from '../skills.js';
import {planBasicTurn,resolveBasicTurn} from '../ai.js';
import {createController} from '../controller.js';
import {captureMap,mapFrom} from '../maps.js';
import {createCheckDrafts,checkMarkup} from '../checks-ui.js';
const stats={strength:1,dexterity:2,constitution:0,intelligence:2,charisma:1,perception:1};
function fixture(rules={}) {
    let s=E.setRules(E.emptyState(),{statMode:'bonuses',multiActionsEnabled:true,splitMovement:true,movementStat:'none',movementBase:3,...rules}).state;
    for(const [name,side,initiative,x] of [['A','player',30,3],['B','ally',20,5],['C','enemy',10,6]])s=E.addActor(s,{name,side,initiative,position:{x,y:3},hp:100,maxHp:100,dc:12,stats,actionsPerTurn:2,control:side==='enemy'?'basic':'manual',weaponList:[{id:'bolt',mode:'ranged',range:20,damage:'1d6'}]}).state;
    return E.startCombat(s,false).state;
}
const actor=(s,name)=>s.actors.find(a=>a.name===name);
const attack=s=>({type:'attack',actor:actor(s,'A').id,target:actor(s,'C').id,weapon:'bolt'});
const check=(s,patch={})=>({type:'check',actor:actor(s,'A').id,description:'An improvised check',stat:'intelligence',bonus:0,dc:10,...patch});
function hide(s,name='A') {
    s=E.editActor(s,actor(s,name).id,{skills:[{...skillPreset('hide','en'),id:'hide',check:false}]}).state;
    return E.resolveAction(s,{type:'skill',actor:actor(s,name).id,target:actor(s,name).id,skill:'hide'}).state;
}
for(const stance of ['offensive','defensive'])test('199 stance persists through rounds, reload and manual change: '+stance,()=>{
    let s=fixture();s=E.setStance(s,actor(s,'A').id,stance).state;for(let i=0;i<6;i++)s=E.endTurn(s).state;
    assert.equal(actor(s,'A').stance,stance);s=E.validateState(JSON.parse(JSON.stringify(s)));assert.equal(actor(s,'A').stance,stance);
    s=E.setStance(s,actor(s,'A').id,'neutral').state;assert.deepEqual(E.stanceBonus(s,actor(s,'A')),{attack:0,defense:0});
});
test('199 reserve a different actor retains values and other turns continue',()=>{
    let s=fixture(),id=actor(s,'B').id,before=E.clone(actor(s,'B'));s=E.reserveActor(s,id).state;
    assert.equal(E.currentActor(s).name,'A');assert(actor(s,'B').reserve);assert.deepEqual(actor(s,'B').lastPosition,before.position);assert.equal(actor(s,'B').hp,before.hp);
    s=E.endTurn(s).state;assert.equal(E.currentActor(s).name,'C');E.validateState(s);
});
test('199 all participants can be reserved and a later deployment resumes without a duplicate turn',()=>{
    let s=fixture();s=E.reserveActor(s,actor(s,'B').id).state;s=E.reserveActor(s,actor(s,'C').id).state;s=E.reserveActor(s,actor(s,'A').id).state;
    assert.equal(s.phase,'paused');E.validateState(s);s=E.deployActor(s,actor(s,'A').id,{x:3,y:3}).state;
    assert.equal(s.phase,'active');assert.equal(E.currentActor(s).name,'A');assert(s.round>=2);E.validateState(s);
});
for(const value of [25,15])test('199 a new actor joins sorted, current actor retained, first-turn eligibility: '+value,()=>{
    let s=fixture();s=E.endTurn(s).state;assert.equal(E.currentActor(s).name,'B');
    s=E.addActor(s,{name:'New',side:'enemy',initiative:value,hp:50,maxHp:50}).state;assert(actor(s,'New').reserve);
    s=E.deployActor(s,actor(s,'New').id,{x:8,y:8}).state;assert.equal(E.currentActor(s).name,'B');assert.equal(actor(s,'New').joinRound,value>20?2:1);
    s=E.endTurn(s).state;assert.equal(E.currentActor(s).name,value>20?'C':'New');E.validateState(s);
});
test('199 next-round timing overrides a still-pending initiative slot',()=>{
    let s=fixture();s=E.addActor(s,{name:'New',side:'enemy',initiative:25}).state;s=E.deployActor(s,actor(s,'New').id,{x:8,y:8},{timing:'next'}).state;
    assert.equal(actor(s,'New').joinRound,2);s=E.endTurn(s).state;assert.equal(E.currentActor(s).name,'B');
});
test('199 initiative is rolled once on first deployment, never again on returning',()=>{
    let s=fixture();s=E.addActor(s,{name:'New',side:'enemy',initiative:0,stats}).state;let draws=0;
    s=E.deployActor(s,actor(s,'New').id,{x:8,y:8},{initiativeMode:'roll',roll:()=>{draws++;return 10;}}).state;assert.equal(actor(s,'New').initiative,12);
    s=E.reserveActor(s,actor(s,'New').id).state;s=E.deployActor(s,actor(s,'New').id,{x:8,y:8},{initiativeMode:'roll',roll:()=>{throw Error('rerolled');}}).state;assert.equal(draws,1);assert.equal(actor(s,'New').initiative,12);
});
test('199 manual order changes cannot make an actor act twice in the same round',()=>{
    let s=fixture();s=E.endTurn(s).state;const ids=['B','C','A'].map(n=>actor(s,n).id);s=E.setOrder(s,ids).state;assert.equal(E.currentActor(s).name,'B');
    s=E.endTurn(s).state;assert.equal(E.currentActor(s).name,'C');s=E.endTurn(s).state;assert.equal(E.currentActor(s).name,'B');assert.equal(s.round,2);
});
test('199 start warning can proceed with an explicit unplaced reserve; empty board still rejected',()=>{
    let s=E.stopCombat(fixture()).state;s=E.moveActor(s,actor(s,'B').id,null,true).state;assert.throws(()=>E.startCombat(s,false),/platzieren/);
    s=E.startCombat(s,false,undefined,{allowUnplaced:true}).state;assert(actor(s,'B').reserve);s=E.endTurn(s).state;assert.equal(E.currentActor(s).name,'C');
    let empty=E.stopCombat(fixture()).state;for(const a of [...empty.actors])empty=E.moveActor(empty,a.id,null,true).state;assert.throws(()=>E.startCombat(empty,false,undefined,{allowUnplaced:true}),/Mindestens/);
});
test('199 custom check has a real None target and preserves the selection in markup and reload',()=>{
    let s=fixture(),drafts=createCheckDrafts(),d=drafts.get('chat',actor(s,'A').id);assert.equal(d.target,'');assert.match(checkMarkup(s,actor(s,'A'),d,'en'),/None \/ see description/);assert.equal(d.target,'');
    s=E.resolveAction(s,check(s),{roll:()=>10}).state;assert.equal(s.log.at(-1).details.target,null);assert.equal(E.validateState(s).log.at(-1).details.target,null);
});
for(const source of ['auto','normal','bonus:custom'])test('199 explicit DC cost source: '+source,()=>{
    let s=fixture();s=E.editActor(s,actor(s,'A').id,{bonusActions:[{id:'custom',name:'Custom extra',count:1,allowed:['other']},{id:'boss',name:'Boss attacks',count:2,allowed:['attack']}]}).state;
    const r=E.resolveAction(s,check(s,{actionSource:source}),{roll:()=>10});assert.equal(r.state.action.freeSpent,source==='normal'?1:0);assert.equal(r.state.action.bonusSpent.custom??0,source==='normal'?0:1);assert.equal(r.state.action.bonusSpent.boss??0,0);
    assert.equal(r.result.actionPool.kind,source==='normal'?'free':'bonus');
});
test('199 an ineligible explicit DC pool is atomic and rolls nothing',()=>{
    let s=fixture();s=E.editActor(s,actor(s,'A').id,{bonusActions:[{id:'boss',name:'Boss attacks',count:2,allowed:['attack']}]}).state;const before=E.clone(s);let draws=0;
    assert.throws(()=>E.resolveAction(s,check(s,{actionSource:'bonus:boss'}),{roll:()=>{draws++;return 10;}}));assert.equal(draws,0);assert.deepEqual(s,before);
});
test('199 manual action override allows more checks, retains movement/costs, does not authorize Basic/model',()=>{
    let s=fixture();s=E.setUnlimited(s,actor(s,'A').id,true).state;
    for(let i=0;i<5;i++)s=E.resolveAction(s,check(s),{roll:()=>10}).state;assert.equal(E.currentActor(s).name,'A');assert.equal(s.action.freeSpent,5);assert.equal(E.movementBudget(s,actor(s,'A')).remaining,3);
    for(const source of ['basic','model'])assert.throws(()=>E.resolveAction(s,{type:'other',actor:actor(s,'A').id},{source}));
    s=E.setUnlimited(s,actor(s,'A').id,false).state;assert.throws(()=>E.resolveAction(s,check(s)));assert.equal(s.action.freeSpent,5);
});
test('199 unlimited manual actions stop at End turn and do not reset ammunition',()=>{
    let s=fixture();s=E.editActor(s,actor(s,'A').id,{resources:[{id:'mana',name:'Mana',kind:'ammo',quantity:2}],weaponList:[{id:'bolt',mode:'ranged',range:20,damage:'1d6',resource:'mana',cost:1,standard:null}]}).state;s=E.setUnlimited(s,actor(s,'A').id,true).state;
    s=E.resolveAction(s,attack(s),{roll:n=>n===20?10:2}).state;s=E.resolveAction(s,attack(s),{roll:n=>n===20?10:2}).state;assert.equal(actor(s,'A').resources[0].quantity,0);assert.throws(()=>E.resolveAction(s,attack(s)));
    s=E.endTurn(s).state;assert.equal(E.currentActor(s).name,'B');assert(!E.manualUnlimited(s,actor(s,'A')));
});
test('199 dead-only board removal stores last position; unconscious remains placed and rescuable',()=>{
    let s=fixture({autoRemoveDead:true});s=E.editActor(s,actor(s,'B').id,{hp:0,condition:'dead'}).state;assert.equal(actor(s,'B').position,null);assert.deepEqual(actor(s,'B').lastPosition,{x:5,y:3});assert.equal(actor(s,'B').hp,0);
    s=E.editActor(s,actor(s,'C').id,{hp:0,condition:'unconscious',roundsLeft:3}).state;assert.deepEqual(actor(s,'C').position,{x:6,y:3});E.validateState(s);
});
test('199 hidden terrain prerequisite, leaving terrain and manually revealing are enforced',()=>{
    let s=fixture();assert.throws(()=>hide(s));s=E.setBoard(s,{blocked:[{x:3,y:2}]}).state;s=hide(s);assert(actor(s,'A').hidden);
    s=E.moveActor(s,actor(s,'A').id,{x:4,y:4}).state;assert.equal(actor(s,'A').hidden,null);
    let magic=hide(fixture({hideNeedsTerrain:false}));magic=E.revealActor(magic,actor(magic,'A').id).state;assert.equal(actor(magic,'A').hidden,null);
});
test('199 hidden last player stays in initiative; Basic patrols without selecting hidden coordinates',()=>{
    let s=fixture({hideNeedsTerrain:false});s=E.reserveActor(s,actor(s,'B').id).state;s=hide(s);s=E.endTurn(s).state;assert.equal(E.currentActor(s).name,'C');
    const r=resolveBasicTurn(s);assert.equal((r.result.actions??[r.result]).some(v=>v.type==='attack'),false);assert.equal(r.state.phase,'active');assert.equal(E.currentActor(r.state).name,'A');assert(actor(r.state,'A').hidden);E.validateState(r.state);
});
test('199 direct attacks/skills cannot target hidden foes',()=>{
    let s=fixture({hideNeedsTerrain:false});s=hide(s);s=E.endTurn(s).state;s=E.endTurn(s).state;
    assert(!E.canAttack(s,actor(s,'C'),actor(s,'A'),'ranged',actor(s,'C').position,'profile','bolt'));assert.throws(()=>E.resolveAction(s,{type:'attack',actor:actor(s,'C').id,target:actor(s,'A').id,weapon:'bolt'}));
});
for(const hit of [true,false])test('199 first hidden attack damage and reveal on hit/miss: '+hit,()=>{
    let s=hide(fixture({hideNeedsTerrain:false}));s=E.editActor(s,actor(s,'C').id,{dc:hit?10:99}).state;let draws=0;
    const r=E.resolveAction(s,attack(s),{roll:n=>{draws++;return n===20?10:2;}});assert.equal(actor(r.state,'A').hidden,null);assert(r.result.ambush);assert.equal(r.result.damage,hit?4:0);assert.equal(draws,hit?2:1);
});
for(const stacks of [false,true])test('199 ambush/critical combination is explicit: '+stacks,()=>{
    let s=hide(fixture({hideNeedsTerrain:false,natural20:true,hiddenDamageMultiplier:3,ambushStacksCritical:stacks}));const r=E.resolveAction(s,attack(s),{roll:n=>n===20?20:2});assert.equal(r.result.damage,stacks?12:4);
});
for(const friendlyFire of [false,true])test('199 area damage own-side toggle, with hidden splash victim: '+friendlyFire,()=>{
    let s=fixture({friendlyFireArea:friendlyFire,hideNeedsTerrain:false});s=E.editActor(s,actor(s,'B').id,{hidden:{turns:3,appliedTurn:s.turnSerial}}).state;const r=E.resolveAction(s,attack(s),{roll:n=>n===20?10:6,radiusOverride:1});assert.equal(actor(r.state,'B').hp,friendlyFire?97:100);assert.equal(Boolean(actor(r.state,'B').hidden),!friendlyFire);
});
test('199 shot risk uses one attack roll and strikes a closer low-DC companion on a miss',()=>{
    let s=fixture({shotRiskEnabled:true});s=E.editActor(s,actor(s,'B').id,{dc:8}).state;s=E.editActor(s,actor(s,'C').id,{dc:20}).state;let draws=0;
    const r=E.resolveAction(s,attack(s),{roll:n=>{draws++;return n===20?10:3;}});assert(r.result.misfire);assert.equal(r.result.target,actor(s,'B').id);assert.equal(r.result.intendedTarget,actor(s,'C').id);assert.equal(r.result.shotPenalty,2);assert.equal(draws,2);assert.equal(actor(r.state,'C').hp,100);assert.equal(actor(r.state,'B').hp,97);
});
test('199 shot risk disabled keeps ordinary attacks and natural 1 never strikes intervening actors',()=>{
    let s=fixture({natural20:true,shotRiskEnabled:true});const r=E.resolveAction(s,attack(s),{roll:()=>1});assert(!r.result.hit);assert(!r.result.misfire);assert.equal(actor(r.state,'B').hp,100);
    s=E.setRules(s,{shotRiskEnabled:false}).state;assert.equal(E.shotObstacles(s,actor(s,'A'),actor(s,'C')).length,0);
});
for(const [x,expected] of [[6,4],[7,6],[8,8]])test('199 distance-based cover damage at target x='+x,()=>{
    let s=fixture({coverDistanceEnabled:true});s=E.reserveActor(s,actor(s,'B').id).state;s=E.setBoard(s,{cover:[{x:5,y:3}]}).state;s=E.moveActor(s,actor(s,'C').id,{x,y:3},true).state;
    const r=E.resolveAction(s,attack(s),{damageOverride:'2d4',roll:n=>n});assert.equal(r.result.damage,expected);
});
function pitFixture() {
    let s=fixture();s=E.moveActor(s,actor(s,'A').id,{x:5,y:2},true).state;s=E.moveActor(s,actor(s,'B').id,{x:6,y:2},true).state;s=E.setBoard(s,{pits:[{x:7,y:3}]}).state;
    s=E.editActor(s,actor(s,'A').id,{skills:[{...skillPreset('shove'),id:'shove',check:false}]}).state;
    return E.resolveAction(s,{type:'skill',actor:actor(s,'A').id,target:actor(s,'C').id,skill:'shove',destination:{x:7,y:3}}).state;
}
test('199 pit cannot be walked into; shove hangs the target with retained HP and rescue deadline',()=>{
    const s=pitFixture();assert(!E.canOccupy(s,{x:7,y:3}));assert(actor(s,'C').hanging);assert.equal(actor(s,'C').hp,100);assert.equal(actor(s,'C').position,null);assert.equal(actor(s,'C').hanging.turns,3);E.validateState(s);
});
test('199 adjacent rescue costs one action, lands safely and keeps HP',()=>{
    let s=pitFixture();s=E.endTurn(s).state;assert.equal(E.currentActor(s).name,'B');const r=E.resolveAction(s,{type:'rescue',actor:actor(s,'B').id,target:actor(s,'C').id});
    assert.equal(actor(r.state,'C').hanging,null);assert.deepEqual(actor(r.state,'C').position,{x:6,y:3});assert.equal(actor(r.state,'C').hp,100);assert.equal(r.state.action.freeSpent,1);assert.equal(r.result.turnEnded,false);assert.equal(r.result.remainingActions,1);E.validateState(r.state);
});
test('199 unrescued pit victim dies only after the configured full rescue rounds',()=>{
    let s=E.stopCombat(pitFixture()).state;for(let i=0;i<2;i++)s=E.elapseRound(s).state;assert(actor(s,'C').hanging);s=E.elapseRound(s).state;assert.equal(actor(s,'C').condition,'dead');assert.equal(actor(s,'C').hp,0);assert.equal(actor(s,'C').hanging,null);
});
test('199 cliff maps, pit edits and portable map export preserve independent combat RNG',()=>{
    let s=E.stopCombat(fixture()).state;const rng=E.clone(s.rng);s=E.randomBoard(s,{preset:'cliff',seed:'cliff-test'}).state;assert(s.board.pits.length>0);assert.deepEqual(s.rng,rng);assert(s.actors.every(a=>E.canOccupy(s,a.position)));
    const map=captureMap(s,'Cliff');assert.deepEqual(mapFrom(JSON.parse(JSON.stringify(map))).board,s.board);
});
test('199 narrative intent is included with successful and failed attack results without changing damage',()=>{
    const s=fixture();for(const natural of [1,20]){const r=E.resolveAction(s,{...attack(s),description:'I aim for his head'},{roll:n=>n===20?natural:2});assert.match(E.resultText(r.result,'en'),/Narrative intent: I aim for his head/);assert.match(E.buildPrompt(r.state),/I aim for his head/);}
});
test('199 reserve/deployment/initiative and cost selection survive controller Undo and reload',async()=>{
    let bundle={state:fixture(),history:[]};const c=createController({key:()=> 'x',read:()=>bundle,write:v=>bundle=v,save:async()=>{}}),before=E.clone(c.state());
    await c.reserve(actor(c.state(),'B').id);await c.deploy(actor(c.state(),'B').id,{x:5,y:3},{timing:'next'});E.validateState(c.export());await c.undo();assert(actor(c.state(),'B').reserve);await c.undo();assert.deepEqual(c.state().actors,before.actors);
});
test('199 bench/redeploy also works during preparation and can start with explicit reserves',()=>{
    let s=E.stopCombat(fixture()).state;s=E.reserveActor(s,actor(s,'A').id).state;s=E.deployActor(s,actor(s,'A').id,{x:3,y:3}).state;assert(!actor(s,'A').reserve);s=E.reserveActor(s,actor(s,'B').id).state;s=E.reserveActor(s,actor(s,'C').id).state;s=E.startCombat(s).state;assert.equal(E.currentActor(s).name,'A');assert.equal(s.phase,'active');
});
test('199 migration recognizes existing initiative and preserves it on return',()=>{
    const raw=fixture();for(const a of raw.actors){delete a.initiativeReady;delete a.turnRound;delete a.joinRound;delete a.reserve;}let s=E.validateState(raw);assert(s.actors.every(a=>a.initiativeReady));assert.equal(actor(s,'A').turnRound,1);s=E.reserveActor(s,actor(s,'B').id).state;const before=actor(s,'B').initiative;s=E.deployActor(s,actor(s,'B').id,{x:5,y:3},{initiativeMode:'roll',roll:()=>{throw Error('rerolled');}}).state;assert.equal(actor(s,'B').initiative,before);
});
test('199 own checks can deliberately use normal actions while preserving matching extras',()=>{
    let s=fixture();s=E.editActor(s,actor(s,'A').id,{bonusActions:[{id:'other',name:'Other extra',count:1,allowed:['other']}]}).state;s=E.resolveAction(s,check(s,{actionSource:'normal'}),{roll:()=>10}).state;assert.equal(s.action.freeSpent,1);assert.equal(s.action.bonusSpent.other??0,0);assert.equal(s.log.at(-1).details.actionPool.kind,'free');
});
test('199 Basic can pull up a neighboring hanging ally and still finishes its strict turn',()=>{
    let s=pitFixture();s=E.addActor(s,{name:'Opponent',side:'player',hp:100,maxHp:100,position:{x:1,y:1},initiative:0}).state;s=E.editActor(s,actor(s,'A').id,{side:'enemy'}).state;s=E.editActor(s,actor(s,'B').id,{side:'enemy',control:'basic',aiBehavior:'support'}).state;s=E.endTurn(s).state;const r=resolveBasicTurn(s);assert(!actor(r.state,'C').hanging);assert(r.state.log.some(e=>e.type==='rescue'));E.validateState(r.state);
});
test('199 no hidden coordinates are exposed by nearest-figure or melee-approach guidance',()=>{
    let s=fixture({hideNeedsTerrain:false});s=hide(s);s=E.endTurn(s).state;s=E.endTurn(s).state;s=E.editActor(s,actor(s,'C').id,{control:'dm'}).state;const hidden=actor(s,'A').id;const relations=E.tacticalRelations(s);assert(relations.every(r=>!r.nearestFigures.some(v=>v.id===hidden)&&!r.adjacent.some(v=>v.id===hidden)));assert(!JSON.stringify(E.tacticalTargets(s)).includes(hidden));assert.match(E.buildPrompt(s),/"position":"hidden"/);
});
test('199 portable participant profiles reset temporary encounter flags; full combat retains them',async()=>{
    let bundle={state:hide(fixture({hideNeedsTerrain:false})),history:[]},library=[];const c=createController({key:()=> 'x',read:()=>bundle,write:v=>bundle=v,save:async()=>{},library:()=>library,saveTemplate:async a=>library.push(a)});
    await c.unlimited(actor(c.state(),'A').id,true);await c.reserve(actor(c.state(),'B').id);await c.saveTemplate(actor(c.state(),'B').id);assert(!library[0].reserve);assert.equal(library[0].lastPosition,null);const profiles=c.exportProfiles('actors');assert(profiles.actors.every(a=>!a.reserve&&!a.hidden&&!a.hanging&&a.unlimitedTurn===-1&&!a.initiativeReady));assert(E.validateState(c.export()).actors[0].hidden);
});
test('199 Undo keeps manual override and concealment grace aligned with the restored turn',async()=>{
    let bundle={state:hide(fixture({hideNeedsTerrain:false})),history:[]};const c=createController({key:()=> 'x',read:()=>bundle,write:v=>bundle=v,save:async()=>{}});await c.unlimited(actor(c.state(),'A').id,true);await c.act(check(c.state()),{roll:()=>10});await c.undo();assert(E.manualUnlimited(c.state()));assert.equal(actor(c.state(),'A').hidden.appliedTurn,c.state().turnSerial);E.validateState(c.export());
});
test('199 pits cannot carry elevated terrain or ladders in imported maps',()=>{
    const s=E.emptyState();assert.throws(()=>E.setBoard(s,{pits:[{x:2,y:2}],heights:[{x:2,y:2}]}));assert.throws(()=>E.setBoard(s,{pits:[{x:2,y:2}],heights:[{x:3,y:2}],ladders:[{from:{x:2,y:2},to:{x:3,y:2}}]}));
});
test('199 paused rescue deadlines can advance explicitly while bench timers remain paused',()=>{
    let s=pitFixture();s=E.reserveActor(s,actor(s,'B').id).state;s=E.reserveActor(s,actor(s,'A').id).state;assert.equal(s.phase,'paused');s=E.elapseRound(s).state;assert.equal(actor(s,'C').hanging.turns,2);E.validateState(s);
});
for(const width of [2,3,10,50])test('199 cliff generator preserves valid connected deployment and data at width '+width,()=>{
    let s=E.setBoard(E.emptyState(),{width,height:width}).state;s=E.addActor(s,{name:'Left',position:{x:0,y:0}}).state;s=E.addActor(s,{name:'Right',position:{x:width-1,y:width-1}}).state;
    for(let i=0;i<8;i++){const map=E.randomBoard(s,{preset:'cliff',seed:'cliff-'+i}).state;assert(map.board.pits.length>0);E.validateState(map);assert(E.reachable({...map,actors:[]},map.actors[0].position,map.actors[1].position,map.actors[0].id));}
});


test('199 deleting the current last living participant ends validly with dead profiles retained',()=>{let s=fixture();s=E.editActor(s,actor(s,'B').id,{hp:0,condition:'dead'}).state;s=E.editActor(s,actor(s,'C').id,{hp:0,condition:'dead'}).state;s.phase='active';s.turn=s.order.indexOf(actor(s,'A').id);s=E.removeActor(s,actor(s,'A').id).state;assert.equal(s.phase,'ended');E.validateState(s);});
