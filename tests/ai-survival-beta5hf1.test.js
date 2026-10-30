import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../engine.js';
import { aiRecord,aiMemoryFrom } from '../ai-state.js';
import { makeDanger,observedHit } from '../ai-danger.js';
import { planAdvancedTurn } from '../advanced-ai.js';
import { resolveAdvancedTurn,resolveAdvancedTurnAsync } from '../advanced-runner.js';
import { createController } from '../controller.js';
import { skillPreset } from '../skills.js';
const blade={id:'blade',name:'Blade',mode:'melee',damage:'1d4'};
const potion={id:'potion',name:'Last healing flask',kind:'supply',quantity:1,heal:'1d6+2',range:3,radius:1};
function scene({hero={},foe={},others=[],rules={},board={}}={}){
 let s=E.emptyState();s.rules=E.rulesFrom({...s.rules,stancesEnabled:false,splitMovement:true,multiActionsEnabled:true,movementBase:4,movementStat:'none',rngMode:'seeded',seed:'survival',visionEnabled:true,visionBase:8,visionPerception:false,...rules});s.board={...s.board,width:12,height:10,...board};
 s.actors=[{id:'hero',name:'Healer',side:'ally',control:'advanced',initiative:100,position:{x:2,y:3},hp:5,maxHp:15,resources:[potion],weaponList:[blade],aiConfig:{idle:'wait',retreat:false},...hero},{id:'foe',name:'Guard',side:'enemy',control:'manual',initiative:50,position:{x:5,y:3},maxHp:40,hp:40,weaponList:[blade],...foe},...others].map(a=>E.actorFrom({maxHp:40,hp:40,dc:10,...a},true));
 return E.startCombat(E.validateState(s)).state;
}
function experience(s,{damage=7,mode='melee',range=0,movement=3,attacks=1}={}){const k=aiRecord(s.actors[0],'foe');k.samples=[damage];k.observations=[{type:'physical',amount:damage}];Object.assign(k.combat,{melee:mode==='melee',ranged:mode==='ranged'?range:0,movement,attacks});return s;}
const roll=n=>n===20?15:2;

test('5/15 HP and a final 1d6+2 flask remain an emergency-healing choice across seeds',()=>{
 const s=experience(scene()),before=E.clone(s);for(let i=0;i<35;i++){s.rules.seed='last-flask-'+i;const plan=planAdvancedTurn(s);assert.equal(plan.intent.type,'use');assert.equal(plan.intent.target,'hero');assert.equal(plan.intent.resource,'potion');assert(plan.survival);assert(plan.reasonDe.includes('Notfallheilung'));}s.rules.seed=before.rules.seed;assert.deepEqual(s,before);
});
for(const asyncRun of [false,true])test((asyncRun?'async':'sync')+' emergency healing spends the last flask and one action exactly once',async()=>{
 const s=experience(scene()),r=asyncRun?await resolveAdvancedTurnAsync(s,{roll,yield:()=>Promise.resolve()}):resolveAdvancedTurn(s,{roll});assert.equal(r.state.actors[0].resources[0].quantity,0);assert.equal(r.state.actors[0].hp,9);assert.equal(r.state.log.filter(e=>e.type==='use'&&e.details.actor==='hero').length,1);assert(!r.state.log.some(e=>['hit','miss'].includes(e.type)&&e.details.actor==='hero'));E.validateState(r.state);
});
test('a linked shared stock is paid once for emergency self-healing',()=>{
 const s=experience(scene({hero:{resources:[{id:'stock',name:'Shared flasks',kind:'ammo',quantity:1},{...potion,quantity:0,consumption:'linked',stock:'stock'}]}})),r=resolveAdvancedTurn(s,{roll});assert.equal(r.state.actors[0].resources[0].quantity,0);assert.equal(r.state.actors[0].resources[1].quantity,0);assert.equal(r.state.actors[0].hp,9);
});
test('emergency configured healing abilities retain their requirements and one stock cost',()=>{
 const skill={...skillPreset('narrative'),id:'heal',ai:true,check:false,range:0,resource:'ki',mechanics:{target:'self',healing:{dice:'1d6',bonus:2}}};
 const s=experience(scene({hero:{resources:[{id:'ki',name:'Ki',kind:'ammo',quantity:1}],skills:[skill]}}));assert.equal(planAdvancedTurn(s).intent.skill,'heal');const r=resolveAdvancedTurn(s,{roll});assert.equal(r.state.actors[0].resources[0].quantity,0);assert.equal(r.state.actors[0].hp,9);
 const hiddenRequired=E.editActor(s,'hero',{skills:[{...skill,prerequisite:'hidden'}]}).state;assert.notEqual(planAdvancedTurn(hiddenRequired).intent.skill,'heal');
});
for(const variant of ['empty','disabled','other-only'])test('self-healing respects '+variant+' resource restrictions',()=>{
 const s=experience(scene({hero:{resources:[{...potion,quantity:variant==='empty'?0:1,...(variant==='other-only'?{recipient:'other'}:{})}]},rules:variant==='disabled'?{resourcesEnabled:false}:{}})),p=planAdvancedTurn(s);assert(!(p.intent.type==='use'&&p.intent.target==='hero'));
});
test('healthy actors do not drink a large last potion for one missing HP',()=>{
 const s=experience(scene({hero:{hp:14,maxHp:15}})),p=planAdvancedTurn(s);assert.equal(p.intent.type,'attack');
});
test('a very likely finishing attack remains an alternative to emergency healing',()=>{
 const s=experience(scene({hero:{attackBonus:100,weaponList:[{...blade,damage:'1d4+7'}]},foe:{hp:1,maxHp:40,position:{x:3,y:3}}})),p=planAdvancedTurn(s);assert.equal(p.intent.type,'attack');assert(p.finisher);
});
test('known damage that cannot hurt an immune actor does not manufacture a healing emergency',()=>{
 const s=experience(scene({hero:{damageImmunities:['physical']}}));assert.equal(observedHit(s,s.actors[0],s.actors[1],true),0);assert(!planAdvancedTurn(s).survival);
});
test('enemy weapon formulas, private movement bonuses and configured action counts do not influence learned danger',()=>{
 const s=experience(scene()),before=E.clone(s),a=s.actors[0],v=makeDanger(s,a,[s.actors[1]]).at(a.position),plan=planAdvancedTurn(s),changed=E.clone(s);Object.assign(changed.actors[1],{weaponList:[{...blade,damage:'99d100'}],movementBonus:90,actionsPerTurn:20});assert.deepEqual(makeDanger(changed,changed.actors[0],[changed.actors[1]]).at(a.position),v);assert.deepEqual(planAdvancedTurn(changed),plan);assert.deepEqual(s,before);
});
test('unseen reinforcements do not influence danger or self-healing priorities',()=>{
 const s=experience(scene({rules:{visionBase:4},others:[{id:'secret',name:'Secret',side:'enemy',position:{x:11,y:9}}]})),a=s.actors[0],first=makeDanger(s,a,s.actors.slice(1)).at(a.position),changed=E.clone(s);changed.actors[2].position={x:10,y:8};assert.deepEqual(makeDanger(changed,changed.actors[0],changed.actors.slice(1)).at(a.position),first);assert.deepEqual(planAdvancedTurn(changed),planAdvancedTurn(s));
});
test('cover does not reduce an observed melee attack forecast',()=>{
 const s=experience(scene({hero:{hp:15,resources:[]},foe:{position:{x:6,y:3}}})),first=makeDanger(s,s.actors[0],[s.actors[1]]).at(s.actors[0].position);s.board.cover=[{x:4,y:3}];assert.equal(E.coverDamagePercent(s,s.actors[1].position,s.actors[0].position),50);const covered=makeDanger(s,s.actors[0],[s.actors[1]]).at(s.actors[0].position);assert.equal(covered.damage,first.damage);assert.equal(covered.risk,first.risk);
});
test('cover still has value against observed ranged attacks',()=>{
 const s=experience(scene({hero:{hp:15,resources:[]},foe:{position:{x:8,y:3}}}),{mode:'ranged',range:8}),first=makeDanger(s,s.actors[0],[s.actors[1]]).at(s.actors[0].position);s.board.cover=[{x:3,y:3}];assert(makeDanger(s,s.actors[0],[s.actors[1]]).at(s.actors[0].position).risk<first.risk);
});
test('known melee danger includes the next enemy movement, not just current adjacency',()=>{
 const s=experience(scene(),{movement:4}),d=makeDanger(s,s.actors[0],[s.actors[1]]);assert(d.at({x:2,y:3}).melee>0);assert.equal(d.at({x:0,y:9}).melee,0);
});
test('legacy knowledge loads conservative combat defaults and rejects invalid observations',()=>{
 const s=scene();aiRecord(s.actors[0],'foe');const raw=E.clone(s.actors[0].aiMemory);delete raw.opponents[0].combat;const loaded=aiMemoryFrom(raw);assert.equal(loaded.opponents[0].combat.attacks,1);assert.equal(loaded.opponents[0].combat.melee,false);assert.equal(loaded.opponents[0].combat.movement,0);raw.opponents[0].combat={movement:-1};assert.throws(()=>aiMemoryFrom(raw));
});
test('visible ordinary attacks teach mode, damage and multiple attacks; Undo restores the earlier experience',async()=>{
 const s=scene({hero:{hp:30,maxHp:30,position:{x:2,y:3}},foe:{initiative:200,position:{x:3,y:3},actionsPerTurn:2}});let bundle={state:s,history:[]};const c=createController({key:()=> 'learn',read:()=>bundle,write:v=>{bundle=v;},save:async()=>{}});
 const attack=()=>c.act({type:'attack',actor:'foe',target:'hero',weapon:'blade'},{roll});await attack();await attack();let k=aiRecord(c.state().actors[0],'foe');assert.equal(k.combat.melee,true);assert.equal(k.combat.attacks,2);assert.deepEqual(k.samples,[2,2]);assert.deepEqual(E.validateState(JSON.parse(JSON.stringify(c.state()))).actors[0].aiMemory,c.state().actors[0].aiMemory);await c.undo();k=aiRecord(c.state().actors[0],'foe');assert.equal(k.combat.attacks,1);assert.deepEqual(k.samples,[2]);
});
test('critical strikes and misses teach attack mode but do not add ordinary damage samples',()=>{
 for(const natural of [1,20]){let s=scene({hero:{hp:30,maxHp:30},foe:{initiative:200,position:{x:3,y:3}},rules:{natural20:true}});s=E.resolveAction(s,{type:'attack',actor:'foe',target:'hero',weapon:'blade'},{roll:n=>n===20?natural:1}).state;const k=aiRecord(s.actors[0],'foe');assert.equal(k.combat.melee,true);assert.equal(k.samples.length,0);}
});
test('a visible shot teaches only the witnessed range rather than the private configured range',()=>{
 let s=scene({hero:{hp:30,maxHp:30,position:{x:2,y:3}},foe:{initiative:200,position:{x:6,y:3},weaponList:[{id:'bow',mode:'ranged',damage:'1d4',range:40}]}});s=E.resolveAction(s,{type:'attack',actor:'foe',target:'hero',weapon:'bow',mode:'ranged'},{roll}).state;assert.equal(aiRecord(s.actors[0],'foe').combat.ranged,4);
});
test('observed movement records travelled cells, not the private unused movement capacity',()=>{
 let s=scene({hero:{hp:30,maxHp:30},foe:{initiative:200,position:{x:7,y:3},movementBonus:40}});s=E.moveActor(s,'foe',{x:6,y:3}).state;assert.equal(aiRecord(s.actors[0],'foe').combat.movement,1);s=E.moveActor(s,'foe',{x:5,y:3}).state;assert.equal(aiRecord(s.actors[0],'foe').combat.movement,2);
});
test('a close observed shot is not mistaken for the maximum weapon range',()=>{
 const s=experience(scene({foe:{position:{x:6,y:3}},hero:{hp:15,resources:[]}}),{mode:'ranged',range:1,movement:0}),d=makeDanger(s,s.actors[0],[s.actors[1]]);assert(d.at(s.actors[0].position).ranged>0);assert(d.at(s.actors[0].position).damage>0);
});
test('a witnessed lethal shot still teaches its mode and distance after automatic body removal',()=>{
 let s=scene({hero:{hp:30,maxHp:30},foe:{initiative:200,position:{x:6,y:4},weaponList:[{id:'bow',mode:'ranged',damage:'1d4',range:10}]},others:[{id:'victim',side:'ally',hp:1,maxHp:10,deathRounds:0,position:{x:2,y:4}}],rules:{autoRemoveDead:true}});s=E.resolveAction(s,{type:'attack',actor:'foe',target:'victim',weapon:'bow',mode:'ranged'},{roll}).state;assert.equal(s.actors.find(v=>v.id==='victim').position,null);assert.equal(aiRecord(s.actors[0],'foe').combat.ranged,4);
});
test('entering sight does not reveal the unseen part of an enemy movement',()=>{
 let s=scene({hero:{hp:30,maxHp:30},foe:{initiative:200,position:{x:9,y:3},movementBonus:40},rules:{visionBase:4}});assert(!E.visibleTo(s,s.actors[0],s.actors[1]));s=E.moveActor(s,'foe',{x:6,y:3}).state;assert(E.visibleTo(s,s.actors[0],s.actors[1]));assert.equal(aiRecord(s.actors[0],'foe').combat.movement,0);
});
test('a low-health closing attack is scored together with the reachable post-action endpoint',()=>{
 const s=experience(scene({hero:{resources:[],attackMode:'ranged',weaponList:[{...blade,damage:'1d4'},{id:'bow',mode:'ranged',damage:'1d4',range:5}]},foe:{position:{x:6,y:3}}}),{movement:4}),p=planAdvancedTurn(s);assert(p.plannedEnd);assert(p.intent.type==='attack');assert.equal(p.intent.weapon,'bow');assert.equal(p.move,null);assert(E.distance(p.plannedEnd,s.actors[1].position)>E.distance(s.actors[0].position,s.actors[1].position));
});
test('post-action planning respects disabled split movement and does not invent free movement',()=>{
 const s=experience(scene({hero:{resources:[],attackMode:'ranged',weaponList:[{id:'bow',mode:'ranged',damage:'1d4',range:5}]},foe:{position:{x:6,y:3}},rules:{splitMovement:false}})),p=planAdvancedTurn(s);assert.deepEqual(p.plannedEnd,p.move??s.actors[0].position);
});
test('post-action planning remains within a fixed boss territory',()=>{
 const s=experience(scene({hero:{resources:[],attackMode:'ranged',weaponList:[{id:'bow',mode:'ranged',damage:'1d4',range:6}],aiConfig:{idle:'wait',retreat:false,free:false,radius:1}},foe:{position:{x:6,y:3}}})),p=planAdvancedTurn(s);if(p.plannedEnd)assert(E.distance(p.plannedEnd,s.actors[0].aiConfig.home)<=1);
});
