import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../engine.js';
import { aiConfigFrom, emptyAIMemory, aiRecord } from '../ai-state.js';
import { planAdvancedTurn, estimatedAttack } from '../advanced-ai.js';
import { resolveAdvancedTurn, resolveAdvancedTurnAsync } from '../advanced-runner.js';
import { skillPreset } from '../skills.js';
import { exportProfiles, profileFrom } from '../profiles.js';
import { createController } from '../controller.js';
import { aiOptionsMarkup, readAIOptions } from '../ai-ui.js';
import { compactPreferences, compactSettingsMarkup, applyCompact } from '../compact-ui.js';

const ability=(kind,extra={})=>({...skillPreset(kind),id:kind,ai:true,check:false,...extra});
function scene(actors=[],rules={}){
    let s=E.emptyState();s.rules=E.rulesFrom({...s.rules,stancesEnabled:false,splitMovement:true,multiActionsEnabled:true,rngMode:'seeded',seed:'alpha-test',visionEnabled:false,resourcesEnabled:true,...rules});s.board={...s.board,width:16,height:12};
    s.actors=actors.map((v,i)=>E.actorFrom({id:'a'+i,name:'Actor '+i,side:i?'enemy':'player',position:{x:2+i,y:2},maxHp:50,hp:50,initiative:100-i,control:i?'manual':'advanced',...v},true));return E.startCombat(E.validateState(s)).state;
}
function controller(state){let bundle={state,history:[],images:{},library:[]},prefs={};return {c:createController({key:()=> 'alpha',read:()=>bundle,write:v=>{bundle=v;},save:async()=>{},preferences:p=>p?Object.assign(prefs,p):prefs,connection:()=>({label:'test'})}),bundle:()=>bundle};}

test('old actors retain their control; Advanced configuration is validated and survives state roundtrip',()=>{
    const a=E.actorFrom({name:'Legacy'});assert.equal(a.control,'manual');assert.equal(a.aiConfig.free,true);assert.deepEqual(a.aiMemory,emptyAIMemory());
    const s=scene([{aiConfig:{idle:'wait',free:false,radius:2}},{}]);assert.deepEqual(E.validateState(s),s);assert.deepEqual(s.actors[0].aiConfig.home,{x:2,y:2});
    for(const raw of [{idle:'teleport'},{free:'false'},{radius:-1},{home:{x:100,y:0}},{searchTurns:100}])assert.throws(()=>aiConfigFrom(raw));
});
test('planning is pure, repeatable and consumes no combat dice',()=>{
    const s=scene([{},{}]),before=E.clone(s),plan=planAdvancedTurn(s);for(let i=0;i<4;i++)assert.deepEqual(planAdvancedTurn(s),plan);assert.deepEqual(s,before);
    const next=E.applyAIPlan(s,plan).state;assert.equal(next.rng.cursor,s.rng.cursor);assert.equal(next.actors[0].aiMemory.counter,1);assert.throws(()=>E.applyAIPlan(next,plan));
});
test('realistic finishing opportunity strongly outweighs a known healthy healer',()=>{
    const s=scene([{weapons:{melee:{damage:'1d6+8'},ranged:null}},{hp:5},{position:{x:2,y:3},name:'Healer'}]);aiRecord(s.actors[0],'a2').roles=['healer'];
    for(let i=0;i<30;i++){s.rules.seed='finish-'+i;assert.equal(planAdvancedTurn(s).intent.target,'a1');}
});
test('observed healer increases focus chance but leaves a chance for another useful target',()=>{
    const s=scene([{}, {hp:40}, {hp:40,position:{x:2,y:3}}]);aiRecord(s.actors[0],'a1').roles=['healer'];let healer=0,other=0;
    for(let i=0;i<400;i++){s.rules.seed='focus-'+i;const p=planAdvancedTurn(s);if(p.intent.target==='a1')healer++;if(p.intent.target==='a2')other++;}
    assert(healer>other);assert(other>0);assert(healer<400);
});
test('experienced lethal damage raises threat priority without reading unseen weapon formulas',()=>{
    const s=scene([{hp:12,aiConfig:{retreat:false}}, {}, {position:{x:2,y:3}}]);aiRecord(s.actors[0],'a2').samples=[20,22];let dangerous=0;
    for(let i=0;i<100;i++){s.rules.seed='threat-'+i;if(planAdvancedTurn(s).intent.target==='a2')dangerous++;}assert(dangerous>65);
    const changed=E.clone(s);changed.actors[1].weapons.melee.damage='50d100';assert.deepEqual(planAdvancedTurn(changed),planAdvancedTurn(s));
});
test('explicit immune result is learned; failed checks do not prove immunity',()=>{
    let s=scene([{actionsPerTurn:2,weaponList:[],skills:[ability('intimidate')]},{conditionImmunities:['frightened']}]);
    s=E.resolveAction(s,{type:'skill',actor:'a0',target:'a1',skill:'intimidate'},{source:'advanced'}).state;assert(aiRecord(s.actors[0],'a1').immune.includes('frightened'));assert.notEqual(planAdvancedTurn(s).intent.skill,'intimidate');
    let failed=scene([{actionsPerTurn:2,weaponList:[],skills:[ability('intimidate',{check:true})]},{conditionImmunities:['frightened']}]);failed=E.resolveAction(failed,{type:'skill',actor:'a0',target:'a1',skill:'intimidate'},{source:'advanced',roll:()=>1}).state;assert.equal(failed.actors[0].aiMemory.opponents[0].immune.length,0);
});
test('damage immunity is learned separately; shield absorption does not prove immunity',()=>{
    let s=scene([{actionsPerTurn:2},{damageImmunities:['physical']}]);s=E.resolveAction(s,{type:'attack',actor:'a0',target:'a1'},{source:'advanced',roll:n=>n===20?15:4}).state;const k=aiRecord(s.actors[0],'a1');assert.deepEqual(k.damageImmune,['physical']);assert.deepEqual(k.immune,[]);assert.equal(estimatedAttack(s,s.actors[0],s.actors[1],E.weaponFor(s.actors[0])).damage,0);
    let shield=scene([{actionsPerTurn:2},{shieldProfiles:[{id:'absorb',name:'Bubble',kind:'absorb'}],shields:[{profile:'absorb',turns:3,charges:1}]}],{shieldsEnabled:true});shield=E.resolveAction(shield,{type:'attack',actor:'a0',target:'a1'},{source:'advanced',roll:n=>n===20?15:4}).state;assert.deepEqual(aiRecord(shield.actors[0],'a1').damageImmune,[]);
});
test('changing protection invalidates learned immunity',()=>{
    let s=scene([{}, {conditionImmunities:['frightened']}]);aiRecord(s.actors[0],'a1').immune=['frightened'];s=E.editActor(s,'a1',{conditionImmunities:[]}).state;assert.deepEqual(aiRecord(s.actors[0],'a1').immune,[]);
});
test('observed healing becomes knowledge; unobserved healing does not',()=>{
    for(const visible of [true,false]){
        let s=scene([{initiative:50,position:{x:1,y:1}}, {initiative:100,position:{x:visible?3:12,y:1},resources:[{id:'heal',name:'Heal',kind:'supply',heal:'8',quantity:3,range:1}]}, {hp:10,position:{x:visible?4:13,y:1}}],{visionEnabled:true,visionBase:4,visionPerception:false});
        s=E.resolveAction(s,{type:'use',actor:'a1',target:'a2',resource:'heal'}).state;assert.equal(Boolean(s.actors[0].aiMemory.opponents.find(v=>v.id==='a1')?.roles.includes('healer')),visible);
    }
});
test('ordinary observed damage is recorded, critical outliers are excluded',()=>{
    for(const critical of [true,false]){
        let s=scene([{initiative:50,position:{x:1,y:1}}, {initiative:100,position:{x:2,y:1},weapons:{melee:{damage:'1d6'},ranged:null}}],{natural20:true});s=E.resolveAction(s,{type:'attack',actor:'a1',target:'a0'},{roll:n=>n===20?(critical?20:15):5}).state;assert.equal(aiRecord(s.actors[0],'a1').samples.length,critical?0:1);
    }
});
test('waiting boss stays in its territory despite a visible attractive target',()=>{
    let s=scene([{aiConfig:{idle:'wait',free:false,radius:1},weaponList:[]},{position:{x:8,y:2}}]);for(let i=0;i<5;i++){const r=resolveAdvancedTurn(s);s=r.state;assert(E.distance(s.actors[0].position,{x:2,y:2})<=1);if(s.phase==='active')s=E.endTurn(s).state;}E.validateState(s);
});
test('territory limits every path cell, including shortcuts around a blocking wall',()=>{
    let s=scene([{position:{x:1,y:2},aiConfig:{home:{x:2,y:2},radius:1,free:false}}, {position:{x:9,y:9}}]);s.board.blocked=[{x:2,y:1},{x:2,y:2},{x:2,y:3}];assert(E.pathDistances(s,s.actors[0].position,'a0').has('3,2'));assert.throws(()=>E.moveActor(s,'a0',{x:3,y:2}));
});
test('forced displacement permits a paid return rather than teleporting home',()=>{
    let s=scene([{aiConfig:{idle:'wait',free:false,radius:0},weaponList:[]},{position:{x:12,y:9}}],{visionEnabled:true,visionBase:1});s=E.moveActor(s,'a0',{x:4,y:2},true).state;const p=planAdvancedTurn(s);assert.deepEqual(p.move,{x:2,y:2});const r=resolveAdvancedTurn(s);assert.deepEqual(r.state.actors[0].position,{x:2,y:2});assert(r.state.log.some(v=>v.type==='move'&&v.details.movement.spent===2));
});
test('invisible opponents do not determine waiting or search positions',()=>{
    const s=scene([{aiConfig:{idle:'search',free:false,radius:2}},{position:{x:13,y:9}}],{visionEnabled:true,visionBase:2});const p=planAdvancedTurn(s),changed=E.clone(s);changed.actors[1].position={x:14,y:10};assert.deepEqual(planAdvancedTurn(changed),p);assert(!p.intent.target);
});
test('alarm costs one action, shares only a clue and leaves recipient territory intact',()=>{
    let s=scene([{actionsPerTurn:2,aiConfig:{alarm:true,alarmRadius:7,alarmResource:'mana',alarmCost:2},resources:[{id:'mana',name:'Mana',kind:'ammo',quantity:5}]},{side:'player',control:'advanced',position:{x:7,y:2},aiConfig:{idle:'wait',free:false,radius:0}},{position:{x:2,y:3}}],{visionEnabled:true,visionBase:2});const cursor=s.rng.cursor;
    assert(E.canAlarm(s,s.actors[0]));s=E.resolveAction(s,{type:'alarm',actor:'a0'},{source:'advanced'}).state;assert.equal(s.actors[0].resources[0].quantity,3);assert.equal(s.action.freeSpent,1);assert.equal(s.rng.cursor,cursor);assert(!E.canAlarm(s,s.actors[0]));assert.deepEqual(s.actors[1].aiMemory.alert.position,{x:2,y:3});assert.equal(s.actors[1].aiMemory.opponents.length,0);
    s=E.endTurn(s).state;assert.equal(planAdvancedTurn(s).move,null);
});
test('alarm remains valid when paying the last eligible action',()=>{
    const s=scene([{aiConfig:{alarm:true,alarmRadius:7}},{side:'player',control:'advanced',position:{x:6,y:2}},{position:{x:2,y:3}}],{visionEnabled:true,visionBase:2});assert(E.canAlarm(s,s.actors[0]));const r=E.resolveAction(s,{type:'alarm',actor:'a0'},{source:'advanced'});assert(r.result.alarm);assert.equal(r.state.action.freeSpent,1);assert(!E.canAlarm(r.state,r.state.actors[0]));assert(r.state.actors[1].aiMemory.alert);
});
test('a rescue is not planned when the helper would occupy the only legal landing cell',()=>{
    const s=scene([{weaponList:[]},{side:'ally',position:null,hanging:{anchor:{x:3,y:2},turns:2,round:1},lastHeight:0},{position:{x:12,y:9}}]);s.board.pits=[{x:3,y:2}];s.board.blocked=[];for(let x=2;x<=4;x++)for(let y=1;y<=3;y++)if(!(x===2&&y===2)&&!(x===3&&y===2))s.board.blocked.push({x,y});assert(!E.canRescue(s,s.actors[0],s.actors[1]));assert.notEqual(planAdvancedTurn(s).intent.type,'rescue');
});
test('offensive and defensive stance choices respect the first-action timing',()=>{
    for(const style of ['aggressive','cautious']){const s=scene([{aiBehavior:style},{}],{stancesEnabled:true}),p=planAdvancedTurn(s);assert.equal(p.intent.type,'stance');assert.equal(p.intent.stance,style==='aggressive'?'offensive':'defensive');const r=resolveAdvancedTurn(s);E.validateState(r.state);assert(r.state.log.some(e=>e.type==='stance'));}
});
test('explicit custom effects can run automatically once; prose-only abilities stay manual',()=>{
    const mana={id:'mana',name:'Mana',kind:'ammo',quantity:5};let s=scene([{weaponList:[],resources:[mana],skills:[ability('narrative',{resource:'mana',cost:2,mechanics:{target:'selected',damage:{dice:'1d6',bonus:0,type:'fire'}}})]},{}]);const p=planAdvancedTurn(s);assert.equal(p.intent.type,'skill');const r=resolveAdvancedTurn(s,{roll:()=>4});assert.equal(r.state.actors[0].resources[0].quantity,3);assert.equal(r.state.actors[1].hp,46);assert.equal(r.state.rng.cursor,1);
    s=scene([{weaponList:[],skills:[ability('narrative',{description:'Teleport anywhere'})]},{}]);assert.notEqual(planAdvancedTurn(s).intent.type,'skill');
});
test('AI does not refresh an already active condition unnecessarily',()=>{
    const s=scene([{weaponList:[],skills:[ability('hold')]},{tactics:[{type:'rooted',turns:3}]}]);assert.notEqual(planAdvancedTurn(s).intent.skill,'hold');
});
test('movement preparation is resolved before spending the movement it is intended to improve',()=>{
    const s=scene([{aiBehavior:'cautious',aiConfig:{retreat:false},weaponList:[],skills:[ability('acrobatics')]},{}]);s.board.cover=[{x:4,y:4}];const r=resolveAdvancedTurn(s);E.validateState(r.state);assert(r.result.turnEnded);assert(r.state.actors[0].hp>0);
});
test('assigned revival, raise and domination are available to Advanced AI',()=>{
    for(const kind of ['revive','raise','dominate']){const corpse=kind!=='dominate',s=scene([{weaponList:[],skills:[ability(kind,{reviveHp:15})]}, {side:kind==='revive'?'ally':'enemy',hp:corpse?0:50,condition:corpse?'dead':'fit',position:{x:3,y:2}}, {position:{x:12,y:9}}]);const p=planAdvancedTurn(s);assert.equal(p.intent.skill,kind);const r=resolveAdvancedTurn(s);E.validateState(r.state);assert(r.state.actors[1].hp>0);if(kind!=='revive')assert.equal(r.state.actors[1].side,'ally');}
});
test('a visible corpse remains a known raising target after automatic board removal',()=>{
    const s=scene([{weaponList:[],skills:[ability('raise',{reviveHp:15})]},{hp:0,condition:'dead'},{position:{x:12,y:9}}],{autoRemoveDead:true,visionEnabled:true,visionBase:4});assert.equal(s.actors[1].position,null);assert(knowledgeTarget(s,'a1'));assert.equal(planAdvancedTurn(s).intent.skill,'raise');
    function knowledgeTarget(state,id){return state.actors[0].aiMemory.opponents.some(v=>v.id===id);}
});
test('mechanical custom reactions may be selected automatically; narrative-only ones are skipped',()=>{
    const s=scene([{hp:20,skills:[ability('narrative',{reaction:true,reactionTiming:'after',mechanics:{target:'self',healing:{dice:'1d6',bonus:0}}})]},{}]);
    const reaction={kind:'narrative',skill:'narrative',mechanical:true,targets:[{id:'a0'}]};assert.equal(E.automaticReaction(s,s.actors[0],[reaction,{kind:'block',amount:2}]).kind,'narrative');assert.equal(E.automaticReaction(s,s.actors[0],[{...reaction,mechanical:false}]).kind,'none');
});
test('experience and decision randomness survive reload/Undo and reset on a new battle',async()=>{
    const s=scene([{},{}]),f=controller(s),before=E.clone(s);await f.c.aiStep();assert(f.c.state().actors[0].aiMemory.counter>0);const saved=E.validateState(f.c.export().state??f.c.export());assert.equal(saved.actors[0].aiMemory.counter,f.c.state().actors[0].aiMemory.counter);await f.c.undo();assert.equal(f.c.state().actors[0].aiMemory.counter,0);assert.equal(f.c.state().rng.cursor,before.rng.cursor);
    const stopped=E.stopCombat(saved).state,restarted=E.startCombat(stopped).state;assert.equal(restarted.actors[0].aiMemory.counter,0);
});
test('portable profiles keep Advanced options but discard experience and previous map home',()=>{
    const s=scene([{aiConfig:{idle:'search',free:false,radius:3}},{}]);aiRecord(s.actors[0],'a1').roles=['healer'];const portable=exportProfiles(s,'actor','a0');assert.equal(portable.actors[0].aiMemory,null);const actor=profileFrom(portable).actors[0];assert.equal(actor.control,'advanced');assert.equal(actor.aiConfig.idle,'search');assert.equal(actor.aiConfig.home,null);assert.deepEqual(actor.aiMemory.opponents,[]);
});
test('mixed Basic/Advanced batches stop at manual control and can be cancelled',async()=>{
    const s=scene([{weaponList:[],aiConfig:{idle:'wait'}},{side:'ally',control:'basic',weaponList:[]},{position:{x:12,y:9},control:'manual'}]),f=controller(s),r=await f.c.aiRun(10);assert.equal(r.count,2);assert.equal(E.currentActor(f.c.state()).control,'manual');
    let calls=0;const stopped=await resolveAdvancedTurnAsync(scene([{},{}]),{shouldStop:()=>++calls>1});assert(stopped.result.paused);assert(calls>=2);
});
test('model actions cannot seize Advanced AI turns',()=>{const s=scene([{},{}]);assert.throws(()=>E.resolveAction(s,{type:'attack',actor:'a0',target:'a1'},{source:'model'}));});
test('visible overwhelming force gives a reproducible chance of retreat, not a compulsory flight',()=>{
    const s=scene([{hp:15}, {position:{x:3,y:2}}, {position:{x:3,y:3}}, {position:{x:2,y:3}}]);let retreat=0,fight=0;
    for(let i=0;i<160;i++){s.rules.seed='overmatch-'+i;const p=planAdvancedTurn(s);if(/Rückzug/.test(p.reasonDe))retreat++;else fight++;}
    assert(retreat>0);assert(fight>0);assert.deepEqual(planAdvancedTurn(s),planAdvancedTurn(s));
});
test('territory-bound bosses and explicitly disabled retreat do not choose flight',()=>{
    for(const aiConfig of [{free:false,idle:'wait',radius:1},{retreat:false}]){const s=scene([{hp:8,aiConfig},{},{position:{x:3,y:3}},{position:{x:2,y:3}}]);for(let i=0;i<30;i++){s.rules.seed='hold-'+i;assert(!/Rückzug vor/.test(planAdvancedTurn(s).reasonDe));assert.notEqual(planAdvancedTurn(s).intent.type,'flee');}}
});
test('unseen reinforcements cannot influence the retreat decision',()=>{
    const s=scene([{hp:20},{}],{visionEnabled:true,visionBase:2});const p=planAdvancedTurn(s),other=E.clone(s);for(let i=0;i<4;i++)other.actors.push(E.actorFrom({id:'hidden'+i,position:{x:11+i,y:10},control:'manual'},true));assert.deepEqual(planAdvancedTurn(other),p);
});
test('urgent antidote can avert a lethal end-of-turn damage tick',()=>{
    const s=scene([{hp:20,effects:[{type:'burning',damage:'25',turns:3,appliedTurn:0}],resources:[{id:'water',name:'Water',kind:'supply',quantity:2,heal:'0',range:0,cures:['burning']}]},{}]);assert.equal(planAdvancedTurn(s).intent.resource,'water');const r=resolveAdvancedTurn(s);assert(r.state.actors[0].hp>0);assert(!r.state.actors[0].effects.some(v=>v.type==='burning'));
});
test('absorption shields can be broken without confusing them with immunity',()=>{
    const s=scene([{aiConfig:{retreat:false}},{shieldProfiles:[{id:'absorb',name:'Bubble',kind:'absorb'}],shields:[{profile:'absorb',turns:3,charges:1}]}],{shieldsEnabled:true});assert.equal(planAdvancedTurn(s).intent.type,'attack');const r=resolveAdvancedTurn(s,{roll:n=>n===20?15:4});assert.equal(r.state.actors[1].shields.length,0);assert.equal(r.state.actors[0].aiMemory.opponents[0].damageImmune.length,0);
});
for(const language of ['de','en'])test(language+' advanced options and compact settings use native collapsible fields',()=>{
    const s=scene([{},{}]),html=aiOptionsMarkup(s.actors[0],language);assert(html.includes('<details'));for(const name of ['aiIdle','aiFree','aiHome','aiRadius','aiSearchTurns','aiAlarm','aiAlarmRadius','aiAlarmResource','aiAlarmCost'])assert(html.includes('name="'+name+'"'));
    const data=new Map([['aiIdle','wait'],['aiHome','H8'],['aiRadius','2'],['aiSearchTurns','3'],['aiAlarmRadius','5'],['aiAlarmCost','0']]);const c=readAIOptions(data,s.actors[0]);assert.equal(c.free,false);assert.deepEqual(c.home,{x:7,y:7});
    assert(compactSettingsMarkup({},language).includes('name="compactUI"'));assert.deepEqual(compactPreferences({}).compactSections,{movement:false,batch:false,stance:false});
    const nodes=[{dataset:{compactSection:'movement'}},{dataset:{compactSection:'batch'}}],root={classList:{toggle(){}},querySelectorAll:()=>nodes};applyCompact(root,{compactUI:true,compactSections:{movement:true}});assert.equal(nodes[0].hidden,false);assert.equal(nodes[1].hidden,true);applyCompact(root,{});assert(nodes.every(v=>!v.hidden));
});
