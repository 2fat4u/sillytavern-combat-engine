import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../engine.js';
import { createController } from '../controller.js';
import { resolveBasicTurn, resolveBasicTurnAsync, planBasicTurn } from '../ai.js';
import { protection } from '../defense.js';
import { statusMarkers } from '../status-ui.js';
import { contextActions } from '../context-actions.js';
import { createBoardView } from '../board-view.js';
import { exportProfiles, transferPatch, profileFrom, resourceDependencies } from '../profiles.js';
import { combatChanged } from '../chat-events.js';
const mana={id:'mana',name:'Mana',kind:'ammo',quantity:10};
const heal={id:'heal',name:'Healing spell',kind:'supply',quantity:0,consumption:'linked',stock:'mana',cost:3,heal:'1d8',range:8,radius:2,targets:'allies',falloff:'half'};
const shield={id:'bubble',name:'Bubble',kind:'absorb',turns:2,resource:'mana',cost:2,amount:0,attackLock:false,ai:true};
function fixture(rules={},hero={},enemy={}) {
    let s=E.setRules(E.emptyState(),{splitMovement:true,movementStat:'none',rngMode:'seeded',seed:'regression-195',...rules}).state;
    s=E.addActor(s,{name:'Hero',side:'player',maxHp:100,hp:30,dc:10,initiative:20,attackBonus:20,position:{x:1,y:1},weaponList:[{id:'bow',name:'Bow',mode:'ranged',range:20,damage:'1d8'}],resources:[mana],...hero}).state;
    s=E.addActor(s,{name:'Enemy',side:'enemy',maxHp:100,hp:40,dc:10,initiative:10,attackBonus:20,position:{x:3,y:1},weaponList:[{id:'claw',name:'Claw',mode:'ranged',range:20,damage:'1d4'}],...enemy}).state;
    return E.startCombat(s).state;
}
const intent=(s,type,extra={})=>({type,actor:E.currentActor(s).id,turn:E.turnToken(s),...extra});
const attack=(s,options={})=>E.resolveAction(s,intent(s,'attack',{target:s.actors[1].id}),{roll:n=>n===20?10:n,...options});
function controller(s,extra={}){let b={state:s,history:[],images:{}};return createController({key:()=> 'same',read:()=>b,write:v=>b=v,save:async()=>{},...extra});}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('195 defaults preserve legacy play; old consuming profiles migrate to cost one',()=>{
    const s=fixture();assert.equal(s.rules.reactionsEnabled,false);assert.equal(s.rules.shieldsEnabled,false);assert.deepEqual(s.actors[0].shieldProfiles,[]);
    const a=E.actorFrom({resources:[mana],weaponList:[{id:'old',mode:'ranged',resource:'mana',damage:'1d4'}]});assert.equal(a.weaponList[0].cost,1);assert.equal(a.weaponList[0].standard.cost,1);
});
for(const cost of [-1,1.5,'',null,true,1000001])test('195 rejects invalid per-use cost '+JSON.stringify(cost),()=>{
    const s=fixture(),before=E.clone(s);assert.throws(()=>E.editActor(s,s.actors[0].id,{weaponList:[{id:'bad',mode:'ranged',damage:'1d4',cost}]}));assert.deepEqual(s,before);
});
test('Different attack and standard costs share the same stock; miss pays and insufficient stock is atomic',()=>{
    let s=fixture({multiActionsEnabled:true,natural20:true}, {resources:[{...mana,quantity:6}],weaponList:[{id:'bow',mode:'ranged',range:20,damage:'1d4',resource:'mana',cost:4,standard:{damage:'1d4',resource:'mana',cost:2}}]});
    s=attack(s,{roll:()=>1}).state;assert.equal(s.actors[0].resources[0].quantity,2);
    const before=E.clone(s);assert.throws(()=>attack(s));assert.deepEqual(s,before);
    s=E.resolveAction(E.editActor(s,s.actors[0].id,{actionsPerTurn:2}).state,intent(s,'attack',{target:s.actors[1].id,variant:'standard'}),{roll:()=>1}).state;
});
test('Zero cost uses an empty linked stock; turning resources off remains unlimited',()=>{
    let s=fixture({}, {resources:[{...mana,quantity:0}],weaponList:[{id:'bow',mode:'ranged',range:20,damage:'1d4',resource:'mana',cost:0}]});assert(E.canAttack(s,s.actors[0],s.actors[1],'ranged'));s=attack(s).state;assert.equal(s.actors[0].resources[0].quantity,0);
    s=fixture({resourcesEnabled:false},{resources:[{...mana,quantity:0}],weaponList:[{id:'bow',mode:'ranged',range:20,damage:'1d4',resource:'mana',cost:5}]});assert.equal(attack(s).state.actors[0].resources[0].quantity,0);
});
test('Area healing uses one roll and payment, caps HP, revives unconscious allies and excludes enemies',()=>{
    let s=fixture({}, {resources:[mana,heal]});s=E.addActor(s,{name:'Ally',side:'ally',maxHp:10,hp:0,condition:'stabilized',position:{x:2,y:1}}).state;
    let rolls=0;const r=E.resolveAction(s,intent(s,'use',{target:s.actors[0].id,resource:'heal'}),{roll:n=>{rolls++;return n;}});
    assert.equal(rolls,1);assert.equal(r.state.actors[0].hp,38);assert.equal(r.state.actors[2].hp,4);assert.equal(r.state.actors[2].condition,'fit');assert.equal(r.state.actors[1].hp,40);assert.equal(r.state.actors[0].resources[0].quantity,7);assert.equal(r.result.affected.length,2);assert.match(E.resultText(r.result,'en'),/Ally: \+4 HP/);
});
test('Free cell and uniform area healing use range to center and radius from center',()=>{
    const s=fixture({}, {resources:[mana,{...heal,falloff:'uniform',targets:'all'}]});const r=E.resolveAction(s,intent(s,'use',{resource:'heal',center:{x:2,y:2}}),{roll:n=>n});assert.equal(r.state.actors[0].hp,38);assert.equal(r.state.actors[1].hp,48);
    for(const center of [{x:1.5,y:2},{x:-1,y:2},{x:50,y:2}])assert.throws(()=>E.resolveAction(s,intent(s,'use',{resource:'heal',center})));
    assert.throws(()=>E.resolveAction(s,intent(s,'use',{resource:'heal',target:s.actors[0].id,center:{x:2,y:2}})));
});
test('Dead or escaped recipients never revive; blocked rays exclude healing but cover does not halve it',()=>{
    let s=fixture({}, {resources:[mana,{...heal,targets:'all',falloff:'uniform'}]});s=E.addActor(s,{name:'Dead',side:'ally',hp:0,condition:'dead',position:{x:1,y:2}}).state;s=E.addActor(s,{name:'Gone',side:'ally',escaped:true,hp:0,condition:'stabilized'}).state;
    s=E.setBoard(s,{cover:[{x:2,y:1}]}).state;let r=E.resolveAction(s,intent(s,'use',{resource:'heal',target:s.actors[0].id}),{roll:n=>n});assert.equal(r.state.actors[1].hp,48);assert.equal(r.state.actors[2].hp,0);assert.equal(r.state.actors[3].hp,0);
    s=E.setBoard(s,{cover:[],blocked:[{x:2,y:1}]}).state;r=E.resolveAction(s,intent(s,'use',{resource:'heal',target:s.actors[0].id}),{roll:n=>n});assert.equal(r.state.actors[1].hp,40);
});
test('Cure-only area healing consumes once and does not draw healing dice',()=>{
    let s=fixture({}, {resources:[mana,{...heal,heal:'0',cures:['poisoned']}],effects:[{type:'poisoned',turns:3}]});s=E.addActor(s,{name:'Ally',side:'ally',position:{x:2,y:1},effects:[{type:'poisoned',turns:3}]}).state;
    let draws=0;const r=E.resolveAction(s,intent(s,'use',{target:s.actors[0].id,resource:'heal'}),{roll:()=>{draws++;return 1;}});assert.equal(draws,0);assert(r.state.actors.every(a=>!a.effects.length));assert.equal(r.state.actors[0].resources[0].quantity,7);
});
test('One stock pays shield, ability, attack and healing costs in the same turn',()=>{
    let s=fixture({multiActionsEnabled:true,shieldsEnabled:true},{actionsPerTurn:4,resources:[{...mana,quantity:12},{...heal,radius:0}],shieldProfiles:[shield],skills:[{id:'aim',kind:'aim',name:'Aim',check:false,resource:'mana',cost:2}],weaponList:[{id:'bow',mode:'ranged',range:20,damage:'1d4',resource:'mana',cost:3}]});
    for(const [type,extra]of[['shield',{profile:'bubble'}],['skill',{skill:'aim',target:s.actors[0].id}],['attack',{target:s.actors[1].id}],['use',{resource:'heal',target:s.actors[0].id}]])s=E.resolveAction(s,intent(s,type,extra),{roll:n=>n===20?10:n}).state;
    assert.equal(s.actors[0].resources[0].quantity,2);assert.equal(s.action.freeSpent,4);assert.equal(s.actors[1].resources.length,0);
});
for(const kind of ['dc','reduce','absorb'])test('Shield '+kind+' applies to the original hit and consumes its stock once',()=>{
    let s=fixture({reactionsEnabled:true,shieldsEnabled:true},{},{resources:[mana],shieldProfiles:[{...shield,kind,amount:100}],reactionChoices:['shield'],reactionControl:'auto'});const r=attack(s);assert.equal(r.state.actors[1].resources[0].quantity,8);assert.equal(r.result.damage,0);assert.equal(r.result.hit,kind!=='dc');assert.equal(r.state.actors[1].shields.length,kind==='absorb'?0:1);assert(r.state.actors[1].reactionUsed);
});
test('Fixed protection and blocking clamp damage; decimal reduction does not create fractional HP',()=>{
    const s=fixture({reactionsEnabled:true,shieldsEnabled:true,reactionBlock:2.5},{},{shieldProfiles:[{...shield,resource:null,kind:'reduce',amount:2.5}],shields:[{profile:'bubble',turns:2,charges:1,appliedTurn:0}],reactionChoices:['block'],reactionControl:'auto'});const r=attack(s);assert.equal(r.result.damage,3);assert(Number.isInteger(r.state.actors[1].hp));assert.match(E.resultText(r.result,'en'),/damage reduction 5/);
});
test('Absorption survives misses and zero-damage hits and is consumed by the first damaging hit',()=>{
    let s=fixture({shieldsEnabled:true,multiActionsEnabled:true,natural20:true},{actionsPerTurn:3},{shieldProfiles:[{...shield,resource:null}],shields:[{profile:'bubble',turns:2,charges:1,appliedTurn:0}]});s=attack(s,{roll:()=>1}).state;assert.equal(s.actors[1].shields.length,1);s=attack(s,{damageOverride:'1d4-100'}).state;assert.equal(s.actors[1].shields.length,1);s=attack(s).state;assert.equal(s.actors[1].shields.length,0);
});
test('Attack lock affects direct attacks, counters, Basic AI and context legality',()=>{
    const s=fixture({shieldsEnabled:true,reactionsEnabled:true},{shieldProfiles:[{...shield,resource:null,attackLock:true}],shields:[{profile:'bubble',turns:2,charges:1,appliedTurn:0}],reactionChoices:['counter']});assert(!E.canAttack(s,s.actors[0],s.actors[1],'ranged'));assert.deepEqual(E.reactionOptions(s,s.actors[0],s.actors[1]),[]);assert(contextActions(s,s.actors[1].id).find(v=>v.kind==='attack').reason);assert.throws(()=>attack(s));
});
test('Shield duration has same-turn grace; disabling shields pauses duration and bonuses',()=>{
    let s=fixture({shieldsEnabled:true});s=E.editActor(s,s.actors[0].id,{shieldProfiles:[{...shield,turns:1}]}).state;s=E.resolveAction(s,intent(s,'shield',{profile:'bubble'})).state;s=E.endTurn(s).state;assert.equal(s.actors[0].shields[0].turns,1);s=E.setRules(s,{shieldsEnabled:false}).state;assert.equal(protection(s,s.actors[0]).active.length,0);s=E.endTurn(s).state;s=E.endTurn(s).state;assert.equal(s.actors[0].shields.length,1);s=E.setRules(s,{shieldsEnabled:true}).state;s=E.endTurn(s).state;s=E.endTurn(s).state;assert.equal(s.actors[0].shields.length,0);
});
test('One automatic counter follows the original attack, spends stock once, never chains, and is undoable',async()=>{
    const s=fixture({reactionsEnabled:true},{reactionChoices:['counter'],reactionControl:'auto'},{reactionChoices:['counter'],reactionControl:'auto',resources:[mana],weaponList:[{id:'claw',mode:'ranged',range:20,damage:'1d4',resource:'mana',cost:3}]});const c=controller(s);const r=await c.act(intent(s,'attack',{target:s.actors[1].id}),{roll:n=>n===20?10:n});assert.equal(r.reactions.length,1);assert.equal(c.state().actors[0].hp,26);assert.equal(c.state().actors[1].resources[0].quantity,7);assert.equal(c.state().actors[0].reactionUsed,false);assert.equal(c.state().log.filter(e=>e.details?.reactionAttack).length,1);await c.undo();assert.equal(c.state().actors[0].hp,30);assert.equal(c.state().actors[1].resources[0].quantity,10);assert.equal(c.state().actors[1].reactionUsed,false);
});
test('A lethal hit cancels its counter without spending weapon stock, but reaction is spent',()=>{
    const s=fixture({reactionsEnabled:true},{},{hp:1,reactionChoices:['counter'],reactionControl:'auto',resources:[mana],weaponList:[{id:'claw',mode:'ranged',range:20,damage:'1d4',resource:'mana',cost:3}]});const r=attack(s);assert.equal(r.result.reactions.length,0);assert.equal(r.state.actors[1].resources[0].quantity,10);assert.equal(r.state.actors[1].reactionUsed,true);assert(r.state.log.some(e=>e.details.cancelled));
});
test('Stun applied by the original attack prevents a subsequent counter',()=>{
    const s=fixture({reactionsEnabled:true},{weaponList:[{id:'bow',mode:'ranged',range:20,damage:'1d4',effects:[{type:'stunned',turns:2}]}]},{reactionChoices:['counter'],reactionControl:'auto'});const r=attack(s);assert.equal(r.result.reactions.length,0);assert.equal(r.state.actors[0].hp,30);
});
test('Reaction budget resets at own next turn, not on another attack in the same turn',()=>{
    let s=fixture({reactionsEnabled:true,multiActionsEnabled:true},{actionsPerTurn:3},{reactionChoices:['block'],reactionControl:'auto'});let r=attack(s);assert.equal(r.result.damage,6);s=r.state;r=attack(s);assert.equal(r.result.damage,8);s=E.endTurn(r.state).state;assert.equal(s.actors[1].reactionUsed,false);
});
for(const source of ['normal','bonus'])test('Reservation '+source+' spends the explicit pool before an enemy attack',()=>{
    let s=fixture({reactionsEnabled:true,multiActionsEnabled:true},{reactionCost:source,reactionChoices:['block'],actionsPerTurn:2,bonusActions:[{id:'rx',name:'Reaction',count:1,allowed:['reserve']}]});assert.deepEqual(E.reactionOptions(s,s.actors[0],s.actors[1]),[]);s=E.resolveAction(s,intent(s,'reserve')).state;assert(s.actors[0].reactionReserve);assert.equal(s.action.freeSpent,source==='normal'?1:0);assert.equal(s.action.bonusSpent.rx??0,source==='bonus'?1:0);assert.throws(()=>E.resolveAction(s,intent(s,'reserve')));
    s=E.endTurn(s).state;const r=E.resolveAction(s,intent(s,'attack',{target:s.actors[0].id}),{roll:n=>n===20?10:n,reactionDecisions:{[s.actors[0].id]:{kind:'block'}}});assert.equal(r.result.damage,2);assert.equal(r.state.actors[0].reactionReserve,false);
});
test('Missing matching bonus reserve and off reactions reject without spending actions',()=>{
    const s=fixture({reactionsEnabled:true},{reactionCost:'bonus',reactionChoices:['block']});assert.throws(()=>E.resolveAction(s,intent(s,'reserve')));assert.equal(s.action.used,false);
});
test('Manual reaction request precedes rolls and writes; no reaction choice continues once',async()=>{
    const s=fixture({reactionsEnabled:true},{},{reactionControl:'manual',reactionChoices:['block']}),c=controller(s);let request,draws=0;c.subscribeReactions(v=>request=v);const promise=c.act(intent(s,'attack',{target:s.actors[1].id}),{roll:n=>{draws++;return n===20?10:n;}});await tick();assert(request);assert.equal(draws,0);assert.deepEqual(c.state(),s);assert.equal(c.historyLength(),0);c.respondReaction('none');await promise;assert.equal(draws,2);assert.equal(c.historyLength(),1);assert.equal(c.pendingReaction(),null);
});
test('Canceling a manual reaction cancels the incoming attack, consumes nothing, and releases the queue',async()=>{
    const s=fixture({reactionsEnabled:true},{},{reactionControl:'manual',reactionChoices:['counter']}),c=controller(s);c.subscribeReactions(()=>{});const promise=c.act(intent(s,'attack',{target:s.actors[1].id}),{roll:()=>{throw Error('No dice expected');}});await tick();c.cancelReactions();assert((await promise).cancelled);assert.deepEqual(c.state(),s);await c.edit(s.actors[0].id,{notes:'queue released'});assert.equal(c.state().actors[0].notes,'queue released');
});
test('Stopping Basic AI at a manual reaction discards the upcoming planned move and commits no attack',async()=>{
    const s=fixture({reactionsEnabled:true},{control:'basic',position:{x:0,y:0},weaponList:[{id:'blade',mode:'melee',damage:'1d4'}]},{position:{x:3,y:0},reactionControl:'manual',reactionChoices:['block']}),c=controller(s);const waiting=new Promise(resolve=>c.subscribeReactions(resolve));const run=c.aiRun(2);await waiting;assert(c.pendingReaction());c.stopAI();const r=await run;assert(r.stopped);assert.deepEqual(c.state(),s);assert.equal(c.aiRunning(),false);
});
test('Chat switch during reaction never writes the old action into the new chat',async()=>{
    let key='old',writes=0;const s=fixture({reactionsEnabled:true},{},{reactionControl:'manual',reactionChoices:['block']}),c=controller(s,{key:()=>key,write:()=>writes++});c.subscribeReactions(()=>{});const p=c.act(intent(s,'attack',{target:s.actors[1].id}));await tick();key='new';c.cancelReactions();await assert.rejects(p,/Chat wurde gewechselt/);assert.equal(writes,0);
});
test('Duplicate receipts and invalid model fields never reopen a manual reaction',async()=>{
    const s=fixture({reactionsEnabled:true},{},{reactionControl:'manual',reactionChoices:['block']}),c=controller(s);let requests=0;c.subscribeReactions(()=>{requests++;c.respondReaction('none');});const a=intent(s,'attack',{target:s.actors[1].id});await assert.rejects(c.act({...a,damage:100}));assert.equal(requests,0);await c.act(a,{receipt:'same'});assert((await c.act(a,{receipt:'same'})).duplicate);assert.equal(requests,1);
});
test('Basic AI can reserve bonus reactions and use a configured defensive profile with the same stock gate',()=>{
    const s=fixture({shieldsEnabled:true,reactionsEnabled:true,multiActionsEnabled:true},{control:'basic',reactionCost:'bonus',reactionChoices:['block'],shieldProfiles:[shield],bonusActions:[{id:'rx',name:'Reaction',count:1,allowed:['reserve']}],actionsPerTurn:2});assert.equal(planBasicTurn(s).intent.type,'reserve');const r=resolveBasicTurn(s,{roll:n=>n===20?10:n});assert(r.state.actors[0].reactionReserve);assert.equal(r.state.actors[0].resources[0].quantity,8);assert(r.state.actors[0].shields.length);
});
test('Linked area healing is usable by Basic AI and sync/async outcomes agree',async()=>{
    const s=fixture({}, {control:'basic',resources:[mana,heal]}),a=resolveBasicTurn(s,{roll:n=>n===20?10:n}),b=await resolveBasicTurnAsync(s,{roll:n=>n===20?10:n,yield:()=>{}});assert.equal(a.result.type,'use');assert.equal(a.state.actors[0].resources[0].quantity,7);assert.deepEqual(a.state.actors,b.state.actors);assert.deepEqual(a.state.rng,b.state.rng);
});
test('Actor profiles retain defense configuration, clear runtime shields/reactions, and export linked dependencies',()=>{
    const s=fixture({shieldsEnabled:true},{resources:[mana,heal],shieldProfiles:[shield],reactionChoices:['counter'],shields:[{profile:'bubble',turns:2,charges:1,appliedTurn:0}],reactionUsed:true});const p=profileFrom(exportProfiles(s,'actor',s.actors[0].id));assert.equal(p.actors[0].shieldProfiles.length,1);assert.equal(p.actors[0].shields.length,0);assert.equal(p.actors[0].reactionUsed,false);assert.equal(resourceDependencies(s.actors[0].resources,['heal']).length,2);
});
test('Resource imports remap linked heal stocks and retain stocks referenced by shields',()=>{
    const s=fixture({}, {shieldProfiles:[shield]}),p={kind:'combat-resources',version:1,resources:[mana,heal]},patch=transferPatch(s.actors[0],p,'replace'),a=E.editActor(s,s.actors[0].id,patch).state.actors[0];assert(a.resources.some(r=>r.id==='mana'));assert.equal(a.resources.find(r=>r.id==='heal')?.stock??a.resources.find(r=>r.name==='Healing spell').stock,'mana');
});
test('Visual edit undo stays quiet with active shields and retains their same-turn grace',async()=>{
    let s=fixture({shieldsEnabled:true,reactionsEnabled:true},{shieldProfiles:[shield]});s=E.resolveAction(s,intent(s,'shield',{profile:'bubble'})).state;const c=controller(s);await c.edit(s.actors[0].id,{notes:'edited'});assert.equal(c.state().log.at(-1).chatRelevant,false);await c.undo();assert.equal(c.state().log.at(-1).chatRelevant,false);assert.equal(c.state().actors[0].shields[0].appliedTurn,c.state().turnSerial);assert(!combatChanged(s,c.state()));
});
test('Shield markers show profile/duration on card and board, and disabled protection is marked paused',()=>{
    const s=fixture({shieldsEnabled:true},{shieldProfiles:[shield],shields:[{profile:'bubble',turns:2,charges:1,appliedTurn:0}]});assert.match(statusMarkers(s,s.actors[0],'en',true),/🛡/);assert.match(statusMarkers(s,s.actors[0],'en'),/Bubble · 2 own turns/);s.rules.shieldsEnabled=false;assert.match(statusMarkers(s,s.actors[0],'en'),/paused/);
});
test('Camera retains viewport across rerenders and only explicit centering moves to an actor',()=>{
    let p={scrollLeft:700,scrollTop:500,clientWidth:400,clientHeight:300,scrollWidth:2500,scrollHeight:2500};const camera=createBoardView({querySelector:s=>s==='.ct-board-scroll'?p:null});camera.capture('map',44);p={...p,scrollLeft:0,scrollTop:0};camera.restore('map',44);assert.equal(p.scrollLeft,700);assert.equal(p.scrollTop,500);camera.center({x:40,y:40},44);assert(p.scrollLeft>1000);camera.clear();p.scrollLeft=0;camera.restore('map',44);assert.equal(p.scrollLeft,0);
});
test('Zoom retains the viewed center accounting for cell gaps, while another map does not restore an old viewport',()=>{
    let p={scrollLeft:500,scrollTop:400,clientWidth:400,clientHeight:300,scrollWidth:5000,scrollHeight:5000};const camera=createBoardView({querySelector:()=>p});camera.capture('map',44);p.scrollLeft=0;p.scrollTop=0;camera.restore('map',90);assert.equal(p.scrollLeft,1172);assert.equal(p.scrollTop,922);p.scrollLeft=0;camera.restore('other',90);assert.equal(p.scrollLeft,0);
});
for(const mode of ['groups','random'])test('Random deployment '+mode+' is repeatable, unique, reachable and independent of combat dice',()=>{
    let s=E.stopCombat(fixture()).state;for(let i=0;i<6;i++)s=E.addActor(s,{name:'Unit'+i,side:i%2?'enemy':'ally'}).state;s=E.randomBoard(s,{preset:'dungeon',seed:'deploy-room'}).state;
    const next=E.randomPlace(s,{mode,scope:'all',seed:'stable'}).state,again=E.randomPlace(s,{mode,scope:'all',seed:'stable'}).state;assert.deepEqual(next.actors,again.actors);assert.deepEqual(next.rng,s.rng);assert.equal(new Set(next.actors.map(a=>E.coordinate(a.position))).size,8);const paths=E.pathDistances({...next,actors:[]},next.actors[0].position,'');assert(next.actors.every(a=>E.canOccupy(next,a.position)&&paths.has(`${a.position.x},${a.position.y}`)));assert.deepEqual(next.actors.map(a=>a.hp),s.actors.map(a=>a.hp));
});
test('Grouped deployment clusters sides with distinct anchors on an open map',()=>{
    let s=E.emptyState();for(let i=0;i<8;i++)s=E.addActor(s,{name:'U'+i,side:i<4?'ally':'enemy'}).state;const a=E.randomPlace(s,{seed:'groups'}).state.actors;const party=a.slice(0,4),enemies=a.slice(4);assert(Math.max(...party.map(p=>E.distance(p.position,party[0].position)))<=2);assert(Math.min(...enemies.map(e=>E.distance(e.position,party[0].position)))>2);
});
test('Unplaced-only deployment retains fixed positions; active and insufficient-space attempts are atomic',()=>{
    let s=E.stopCombat(fixture()).state;s=E.addActor(s,{name:'New',side:'ally'}).state;const n=E.randomPlace(s,{seed:'new'}).state;assert.deepEqual(n.actors.slice(0,2).map(a=>a.position),s.actors.slice(0,2).map(a=>a.position));assert(n.actors[2].position);assert.throws(()=>E.randomPlace(fixture()));
    s=E.setBoard(E.emptyState(),{width:2,height:2,blocked:[{x:1,y:0},{x:0,y:1},{x:1,y:1}]}).state;for(let i=0;i<2;i++)s=E.addActor(s,{name:'U'+i}).state;const before=E.clone(s);assert.throws(()=>E.randomPlace(s));assert.deepEqual(s,before);
});
test('Controller random deployment has one undo frame and no stat/resource reset',async()=>{
    const s=E.stopCombat(fixture()).state,c=controller(s);await c.randomPlace({scope:'all',seed:'controller'});assert.equal(c.historyLength(),1);await c.undo();assert.deepEqual(c.state().actors,s.actors);
});
test('Larger dungeon room setting creates fewer/larger partitions and survives map serialization',()=>{
    const s=E.setBoard(E.emptyState(),{width:50,height:50}).state,a=E.randomBoard(s,{preset:'dungeon',seed:'hall',roomScale:'mixed'}).state,b=E.randomBoard(s,{preset:'dungeon',seed:'hall',roomScale:'large'}).state;assert.notDeepEqual(a.board.blocked,b.board.blocked);assert.equal(E.validateState(JSON.parse(JSON.stringify(b))).board.roomScale,'large');assert.deepEqual(a.rng,b.rng);
});
test('An area attack offers each other eligible recipient one reaction with its own cost and mitigation',()=>{
    let s=fixture({reactionsEnabled:true,shieldsEnabled:true},{weaponList:[{id:'ball',mode:'ranged',range:20,radius:1,damage:'1d8'}]},{reactionControl:'manual',reactionChoices:['block']});
    s=E.addActor(s,{name:'Collateral',side:'enemy',position:{x:3,y:2},maxHp:30,resources:[mana],shieldProfiles:[shield],reactionControl:'manual',reactionChoices:['shield']}).state;
    const preview=E.attackPreview(s,intent(s,'attack',{target:s.actors[1].id}));assert.equal(preview.defenders.length,2);
    const r=attack(s,{reactionDecisions:{[s.actors[1].id]:{kind:'block'},[s.actors[2].id]:{kind:'shield',profile:'bubble'}}});
    assert.equal(r.result.damage,6);assert.equal(r.state.actors[2].hp,30);assert.equal(r.state.actors[2].resources[0].quantity,8);assert(r.state.actors[1].reactionUsed&&r.state.actors[2].reactionUsed);
});
test('A linked heal with insufficient stock is unavailable and changes neither rolls nor HP',()=>{
    const s=fixture({}, {resources:[{...mana,quantity:2},heal]}),before=E.clone(s);assert(!E.canUseResource(s,s.actors[0],s.actors[0],s.actors[0].resources[1]));assert.throws(()=>E.resolveAction(s,intent(s,'use',{target:s.actors[0].id,resource:'heal'}),{roll:()=>{throw Error('No dice');}}),/aufgebraucht/);assert.deepEqual(s,before);
});
test('Basic AI declines area healing that would benefit the opposing side more than its own',()=>{
    let s=fixture({}, {control:'basic',hp:98,resources:[mana,{...heal,targets:'all',radius:2,heal:'1d8'}]},{hp:10});
    s=E.addActor(s,{name:'Enemy 2',side:'enemy',hp:1,maxHp:100,position:{x:2,y:2}}).state;
    const plan=planBasicTurn(s);assert.notEqual(plan.intent.type,'use');
});
test('Exported stopped action budgets reload without adding implicit fields',()=>{
    const s=E.stopCombat(fixture()).state;assert.deepEqual(E.validateState(JSON.parse(JSON.stringify(s))),s);
});
test('Quiet visual undo stays quiet with an active stance, sprint and tactical same-turn grace',async()=>{
    let s=fixture({multiActionsEnabled:true},{actionsPerTurn:3,skills:[{id:'sprint',kind:'sprint'},{id:'aim',kind:'aim'}]});s=E.setStance(s,s.actors[0].id,'defensive').state;s=E.resolveAction(s,intent(s,'skill',{skill:'sprint',target:s.actors[0].id})).state;s=E.resolveAction(s,intent(s,'skill',{skill:'aim',target:s.actors[0].id})).state;
    const c=controller(s);await c.edit(s.actors[0].id,{notes:'visual edit'});await c.undo();assert.equal(c.state().log.at(-1).chatRelevant,false);assert(!combatChanged(s,c.state()));assert.equal(E.movementBudget(c.state(),c.state().actors[0]).total,6);
});
