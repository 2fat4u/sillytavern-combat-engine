import test from 'node:test';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import * as E from '../engine.js';
import { skillPreset, acrobaticsPresets, abilityGroups, abilityChoices } from '../skills.js';
import { STATUS_TYPES, TACTICS } from '../status-types.js';
import { resourcePreset } from '../effects.js';
import { exportProfiles, profileFrom, transferPatch } from '../profiles.js';
import { createController } from '../controller.js';
import { planBasicTurn, resolveBasicTurn } from '../ai.js';
import { readTactics, tacticalFields, readResources } from '../supplies-ui.js';
import { checkMarkup,createCheckDrafts } from '../checks-ui.js';
import { skillsMarkup } from '../skills-ui.js';
import { contextActions } from '../context-actions.js';
const point=(x,y=3)=>({x,y});
const who=(s,name)=>s.actors.find(a=>a.name===name);
function scene({active=true,side='player',movement=5}={}) {
 let s=E.setRules(E.emptyState(),{statMode:'bonuses',splitMovement:true,multiActionsEnabled:true,movementBase:movement,movementStat:'none',natural20:false,rngMode:'seeded',seed:'1919'}).state;
 s=E.setBoard(s,{width:10,height:7}).state;
 s=E.addActor(s,{name:'Helper',side,position:point(2),initiative:30,actionsPerTurn:4,resources:[{id:'mana',kind:'ammo',name:'Mana',quantity:10,capacity:10}],skills:[{...skillPreset('carry'),id:'carry',check:false,resource:'mana',cost:2}]}).state;
 s=E.addActor(s,{name:'Scout',side:side==='enemy'?'enemy':'ally',position:point(1),hp:0,maxHp:20,condition:'stabilized',initiative:1}).state;
 s=E.addActor(s,{name:'Foe',side:side==='enemy'?'player':'enemy',position:point(9,6),initiative:10,hp:50,maxHp:50}).state;
 return active?E.startCombat(s,false).state:s;
}
const skill=s=>({type:'skill',actor:who(s,'Helper').id,target:who(s,'Scout').id,skill:'carry',turn:E.turnToken(s)});
const pathFor=(s,p)=>E.carryDestinations(s,who(s,'Helper'),who(s,'Scout')).find(v=>v.x===p.x&&v.y===p.y);
const carry=(s,p,options={})=>E.resolveAction(s,{...skill(s),destination:p},options);
function controller(s){let bundle={state:s,history:[]};return createController({key:()=> '1919',read:()=>bundle,write:b=>bundle=b,save:async()=>{}});}

test('1919 transport moves both participants over several fields and pays the exact route once',()=>{
 const s=scene(),before=E.clone(s),plan=pathFor(s,point(5));assert(plan);assert.equal(plan.cost,4);
 const r=carry(s,point(5));assert.deepEqual(who(r.state,'Scout').position,point(5));assert.deepEqual(who(r.state,'Helper').position,plan.carrier);
 assert.equal(r.state.movement.spent,4);assert.equal(r.result.forcedMovement.cost,4);assert.equal(who(r.state,'Helper').resources[0].quantity,8);assert.equal(r.state.action.freeSpent,1);
 assert.deepEqual(r.state.actors.map(a=>a.hp),s.actors.map(a=>a.hp));assert.deepEqual(r.state.rng,s.rng);assert.deepEqual(s,before);
 for(let i=1;i<plan.path.length;i++){assert(E.canStep(s,plan.path[i-1].carrier,plan.path[i].carrier));assert(E.canStep(s,plan.path[i-1].target,plan.path[i].target));assert.notDeepEqual(plan.path[i].carrier,plan.path[i].target);}
});
test('1919 transport uses remaining rather than total movement and rejects an unaffordable destination atomically',()=>{
 const s=scene();s.movement={actorId:who(s,'Helper').id,turnSerial:s.turnSerial,spent:3};const before=E.clone(s);let draws=0;
 assert(!pathFor(s,point(5)));assert.throws(()=>carry(s,point(5),{roll:()=>{draws++;return 20;}}));assert.equal(draws,0);assert.deepEqual(s,before);
 const plan=pathFor(s,point(3));assert.equal(plan.cost,2);assert.equal(carry(s,point(3)).state.movement.spent,5);
});
test('1919 tandem transport works through a one-cell corridor without overlapping endpoints',()=>{
 let s=scene();s=E.moveActor(s,who(s,'Foe').id,point(9),true).state;s=E.setBoard(s,{blocked:Array.from({length:70},(_,i)=>point(i%10,Math.floor(i/10))).filter(p=>p.y!==3)}).state;
 const plan=pathFor(s,point(6));assert.equal(plan.cost,5);assert.deepEqual(plan.carrier,point(7));E.validateState(carry(s,point(6)).state);
});
for(const obstacle of ['wall','pit','height'])test('1919 transport cannot carry through a '+obstacle+' barrier',()=>{
 let s=scene();const cells=Array.from({length:7},(_,y)=>point(4,y));s=E.setBoard(s,{[obstacle==='wall'?'blocked':obstacle==='pit'?'pits':'heights']:obstacle==='height'?Array.from({length:42},(_,i)=>point(4+i%6,Math.floor(i/6))):cells}).state;
 assert(!pathFor(s,point(5)));assert.throws(()=>carry(s,point(5)));
});
test('1919 both carried and helper paths honor a connecting ladder and its movement cost',()=>{
 let s=scene();s=E.setBoard(s,{heights:Array.from({length:42},(_,i)=>point(4+i%6,Math.floor(i/6))),ladders:[{from:point(3),to:point(4)}]}).state;
 const p=pathFor(s,point(5));assert(p);assert.equal(p.cost,5);const r=carry(s,point(5));assert.equal(E.heightAt(r.state,who(r.state,'Scout').position),1);assert.equal(E.heightAt(r.state,who(r.state,'Helper').position),1);
});
test('1919 neither transport endpoint may be occupied or non-walkable cover',()=>{
 let s=scene();s=E.setBoard(s,{cover:[point(3)]}).state;assert(!pathFor(s,point(3)));
 s=E.addActor(s,{name:'Blocker',side:'ally',position:point(5)}).state;assert(!pathFor(s,point(5)));
 for(const p of E.carryDestinations(s,who(s,'Helper'),who(s,'Scout')))assert(!E.clone(s.actors).filter(a=>!['Helper','Scout'].includes(a.name)).some(a=>E.distance(a.position,p.carrier)===0));
});
for(const pass of [false,true])test('1919 transit past friendly bodies obeys ally rule without occupied landings: '+pass,()=>{
 let s=scene();s=E.moveActor(s,who(s,'Foe').id,point(9),true).state;s=E.setBoard(s,{blocked:Array.from({length:70},(_,i)=>point(i%10,Math.floor(i/10))).filter(p=>p.y!==3)}).state;s=E.addActor(s,{name:'Friend',side:'ally',position:point(4)}).state;s=E.setRules(s,{passAllies:pass}).state;
 assert.equal(Boolean(pathFor(s,point(6))),pass);assert(!pathFor(s,point(4)));if(pass){const r=carry(s,point(6));assert.equal(new Set(r.state.actors.filter(a=>a.position).map(a=>E.coordinate(a.position))).size,4);}
});
for(const status of ['rooted','stunned'])test('1919 a '+status+' helper cannot carry as a movement bypass',()=>{
 let s=scene();s=E.editActor(s,who(s,'Helper').id,status==='rooted'?{tactics:[{type:status,turns:2}]}:{effects:[{type:status,turns:2}]}).state;
 assert.equal(E.carryDestinations(s,who(s,'Helper'),who(s,'Scout')).length,0);assert.throws(()=>carry(s,point(3)));
});
test('1919 failed checked transport spends its action and stock, with no movement or healing',()=>{
 let s=scene();s=E.editActor(s,who(s,'Helper').id,{skills:[{...who(s,'Helper').skills[0],check:true,dc:99}]}).state;const r=carry(s,point(5),{roll:()=>1});assert(!r.result.success);assert.deepEqual(r.state.actors.map(a=>a.position),s.actors.map(a=>a.position));assert.equal(r.state.movement.spent,0);assert.equal(who(r.state,'Helper').resources[0].quantity,8);
});
test('1919 hypothetical approach spends movement before planning a carry',()=>{
 let s=scene();s=E.moveActor(s,who(s,'Helper').id,point(0),true).state;s=E.moveActor(s,who(s,'Scout').id,point(3),true).state;
 const plans=E.carryDestinations(s,who(s,'Helper'),who(s,'Scout'),point(2));assert(plans.length);assert(plans.every(p=>p.cost<=3));assert(!plans.some(p=>p.x===5&&p.y===3));
});
for(const side of ['player','enemy'])test('1919 carry follows current team allegiance for '+side,()=>{const s=scene({side});assert(pathFor(s,point(4)));const changed=E.editActor(s,who(s,'Scout').id,{side:side==='enemy'?'player':'enemy'}).state;assert.equal(E.carryDestinations(changed,who(changed,'Helper'),who(changed,'Scout')).length,0);});
test('1919 controller Undo restores both carried positions, movement and stock',async()=>{const s=scene(),c=controller(s);await c.act({...skill(s),destination:point(5)});await c.undo();assert.deepEqual(c.state().actors.map(a=>[a.position,a.hp,a.resources]),s.actors.map(a=>[a.position,a.hp,a.resources]));assert.equal(c.state().movement.spent,0);});
test('1919 Basic support AI chooses a legal paid transport and moves the helper with the scout',()=>{
 let s=scene();s=E.editActor(s,who(s,'Helper').id,{control:'basic',aiBehavior:'support',weaponList:[],skills:[{...who(s,'Helper').skills[0],ai:true}]}).state;
 const p=planBasicTurn(s);assert.equal(p.intent.skill,'carry');assert(p.intent.destination);const r=resolveBasicTurn(s,{roll:n=>n});assert.notDeepEqual(who(r.state,'Helper').position,who(s,'Helper').position);assert.notDeepEqual(who(r.state,'Scout').position,who(s,'Scout').position);E.validateState(r.state);
});

for(const type of Object.keys(STATUS_TYPES))test('1919 a zero-healing remedy can remove only '+type+' and consumes one stock use',()=>{
 let s=scene();const b=who(s,'Scout');s=E.editActor(s,b.id,{hp:20,condition:'fit',...(TACTICS[type]?{tactics:[{type,turns:3,source:who(s,'Foe').id,weapon:b.preferredWeapon}]}:{effects:[{type,turns:3}]}),...{}}).state;
 s=E.editActor(s,who(s,'Helper').id,{resources:[...who(s,'Helper').resources,{id:'remedy',name:'Remedy',quantity:3,heal:'0',range:1,cures:[type]}]}).state;let rolls=0;
 const r=E.resolveAction(s,{type:'use',actor:who(s,'Helper').id,target:b.id,resource:'remedy'},{roll:()=>{rolls++;return 1;}});
 assert.equal(rolls,0);assert.equal(who(r.state,'Scout').hp,20);assert.equal(who(r.state,'Scout').tactics.length+who(r.state,'Scout').effects.length,0);assert.deepEqual(r.result.cures,[type]);assert.equal(who(r.state,'Helper').resources.find(v=>v.id==='remedy').quantity,2);assert.match(E.resultText(r.result,'en'),new RegExp(STATUS_TYPES[type].en));
});
test('1919 tactical cures honor the skill module independently of classic effects',()=>{
 let s=scene();s=E.editActor(s,who(s,'Helper').id,{skills:[],resources:[{id:'focus',name:'Focus',quantity:2,heal:'0',range:1,cures:['rooted']}]}).state;s=E.editActor(s,who(s,'Scout').id,{hp:20,tactics:[{type:'rooted',turns:3}]}).state;
 s=E.setRules(s,{effectsEnabled:false}).state;assert.equal(E.resolveAction(s,{type:'use',actor:who(s,'Helper').id,target:who(s,'Scout').id,resource:'focus'}).result.cures[0],'rooted');
 s=E.setRules(s,{skillsEnabled:false}).state;assert.throws(()=>E.resolveAction(s,{type:'use',actor:who(s,'Helper').id,target:who(s,'Scout').id,resource:'focus'}));
});
test('1919 area remedy clears mixed chosen statuses, preserves others and pays linked mana once',()=>{
 let s=scene();s=E.editActor(s,who(s,'Helper').id,{resources:[...who(s,'Helper').resources,{id:'cleanse',name:'Cleanse',quantity:9,consumption:'linked',stock:'mana',cost:3,heal:'0',radius:1,range:3,targets:'allies',cures:['rooted','poisoned']}],effects:[{type:'burning',turns:2}],tactics:[{type:'rooted',turns:2},{type:'distracted',turns:2}]}).state;
 s=E.editActor(s,who(s,'Scout').id,{hp:20,effects:[{type:'poisoned',turns:2}],tactics:[{type:'rooted',turns:2}]}).state;
 const r=E.resolveAction(s,{type:'use',actor:who(s,'Helper').id,resource:'cleanse',center:point(2)});assert.equal(r.result.affected.length,2);assert.equal(who(r.state,'Helper').resources[0].quantity,7);assert.equal(who(r.state,'Helper').resources[1].quantity,9);assert.deepEqual(who(r.state,'Helper').tactics.map(v=>v.type),['distracted']);assert.equal(who(r.state,'Helper').effects[0].type,'burning');assert.equal(who(r.state,'Scout').effects.length+who(r.state,'Scout').tactics.length,0);
});
test('1919 Basic AI considers tactical cleansing even at full HP',()=>{
 let s=scene();s=E.editActor(s,who(s,'Scout').id,{hp:20,tactics:[{type:'rooted',turns:3}]}).state;s=E.editActor(s,who(s,'Helper').id,{control:'basic',aiBehavior:'support',skills:[],weaponList:[],resources:[{id:'release',name:'Release',quantity:1,heal:'0',range:1,cures:['rooted']}]}).state;
 const p=planBasicTurn(s);assert.equal(p.intent.type,'use');assert.equal(p.intent.target,who(s,'Scout').id);assert.equal(p.intent.resource,'release');
});
test('1919 manual editing of unrelated resources does not refresh existing tactical durations',()=>{
 let s=scene();s.turnSerial=10;s=E.editActor(s,who(s,'Helper').id,{tactics:[{type:'rooted',turns:3}]}).state;who(s,'Helper').tactics[0].appliedTurn=2;
 const r=E.editActor(s,who(s,'Helper').id,{tactics:who(s,'Helper').tactics,resources:who(s,'Helper').resources}).state;assert.equal(who(r,'Helper').tactics[0].appliedTurn,2);
 const changed=E.editActor(r,who(r,'Helper').id,{tactics:[{...who(r,'Helper').tactics[0],turns:4}]}).state;assert.equal(who(changed,'Helper').tactics[0].appliedTurn,10);
});
test('1919 status profiles preserve tactical fields and map portable source names to current actors',()=>{
 let s=scene({active:false});s=E.editActor(s,who(s,'Helper').id,{effects:[{type:'poisoned',turns:2}],tactics:[{type:'frightened',turns:4,source:who(s,'Foe').id},{type:'disarmed',turns:2,weapon:who(s,'Helper').preferredWeapon}]}).state;
 const p=profileFrom(exportProfiles(s,'effects',who(s,'Helper').id));assert.equal(p.tactics[0].sourceName,'Foe');let target=scene({active:false}),patch=transferPatch(who(target,'Helper'),p,'replace',target);target=E.editActor(target,who(target,'Helper').id,patch).state;assert.equal(who(target,'Helper').tactics[0].source,who(target,'Foe').id);assert.equal(who(target,'Helper').tactics[1].weapon,who(target,'Helper').preferredWeapon);
 assert.deepEqual(profileFrom(JSON.parse(JSON.stringify(p))),p);
});
test('1919 old classic-only status profiles preserve tactical states while new replacement can clear both',()=>{
 let s=scene();s=E.editActor(s,who(s,'Helper').id,{tactics:[{type:'rooted',turns:2}]}).state;const a=who(s,'Helper');assert(!Object.hasOwn(transferPatch(a,{kind:'combat-effects',version:1,effects:[]}), 'tactics'));assert.deepEqual(transferPatch(a,{kind:'combat-effects',version:1,effects:[],tactics:[]}).tactics,[]);
});
test('1919 status profile import with an unresolved required origin fails atomically',async()=>{
 const s=scene(),c=controller(s),raw={kind:'combat-effects',version:1,effects:[],tactics:[{type:'provoked',turns:2,source:'missing',sourceName:'Unknown'}]};
 await assert.rejects(()=>c.importProfiles(raw,[who(s,'Helper').id],{mode:'replace'}),/Auslösende/);assert.deepEqual(c.state(),s);
});
test('1919 all remedy templates and resource files retain tactical cure selections',()=>{
 for(const name of ['calming','focus','release']){const item=resourcePreset(name),p=profileFrom({kind:'combat-resources',version:1,resources:[item]});assert.deepEqual(p.resources[0].cures,item.cures);}
 assert.throws(()=>profileFrom({kind:'combat-resources',version:1,resources:[{id:'x',name:'Bad',cures:['dead']}]}));
 const item=resourcePreset('focus'),data=new Map([['resource-0-cure-distracted','on']]);assert.deepEqual(readResources(data,[item])[0].cures,['distracted']);
});
test('1919 shared status editor validates sources/weapons and preserves omitted legacy fields',()=>{
 const s=scene(),a=who(s,'Helper'),old=[{type:'rooted',turns:2}];assert.deepEqual(readTactics(new Map(),a,old,s),old);
 const fields=new Map([['actor-tactics-present','1'],['actor-tactic-provoked','on'],['actor-tactic-provoked-turns','3']]);assert.throws(()=>readTactics(fields,a,[],s),/Auslösende/);fields.set('actor-tactic-provoked-source',who(s,'Foe').id);assert.equal(readTactics(fields,a,[],s)[0].source,who(s,'Foe').id);
 const html=tacticalFields(a,[],s,'en');for(const type of Object.keys(TACTICS))assert(html.includes('name="actor-tactic-'+type+'"'));
});

test('1919 new acrobatics assignment groups two independent applications and hides duplicate presets',()=>{
 let s=scene();const pair=acrobaticsPresets('en');s=E.editActor(s,who(s,'Helper').id,{skills:pair}).state;const a=who(s,'Helper');assert.equal(abilityGroups(a.skills).length,1);assert.equal(abilityChoices(a.skills,'en')[0][1],'Acrobatics');assert.equal(new Set(a.skills.map(v=>v.acrobaticsGroup)).size,1);
 const html=skillsMarkup(a,a.skills,'en',s.rules);assert.equal((html.match(/class="ct-fold ct-acrobatics-group"/g)??[]).length,1);assert(!html.includes('data-skill-add="jump"'));assert(html.includes('Jump'));assert(html.includes('Overcome cover'));
});
test('1919 old individual acrobatics and jump profiles retain IDs, custom values and costs when grouped',()=>{
 const pair=[{...skillPreset('acrobatics'),id:'cover',name:'Balance',dc:18,cost:3},{...skillPreset('jump'),id:'jump',name:'Leap',dc:7,cost:2,range:4}];let s=scene();s=E.editActor(s,who(s,'Helper').id,{skills:pair}).state;const a=who(s,'Helper');assert.equal(abilityGroups(a.skills).length,1);assert.deepEqual(a.skills.map(v=>[v.id,v.dc,v.cost,v.range]),[['cover',18,3,0],['jump',7,2,4]]);
 const d=createCheckDrafts().get('1919',a.id);d.effect='jump';const html=checkMarkup(s,a,d,'en');assert(html.includes('check-effectApplication'));assert(html.includes('Acrobatics'));assert(contextActions(s,a.id,'en').filter(v=>v.kind==='skill').length===1);
});
test('1919 acrobatics profile export/import and append keep one grouped ability without duplicate applications',()=>{
 let s=scene();s=E.editActor(s,who(s,'Helper').id,{skills:acrobaticsPresets()}).state;const raw=exportProfiles(s,'skills',who(s,'Helper').id),a=who(s,'Helper'),patch=transferPatch(a,raw,'append');assert.equal(patch.skills.length,2);assert.equal(abilityGroups(patch.skills).length,1);
 const replace=transferPatch(a,raw,'replace');assert.equal(abilityGroups(replace.skills).length,1);assert.notEqual(replace.skills[0].acrobaticsGroup,a.skills[0].acrobaticsGroup);
});

const kit=async name=>JSON.parse(await readFile(new URL('../examples/features1919/'+name,import.meta.url),'utf8'));
test('1919 bundled test scene imports with six actors, grouped Acrobatics, full-HP tactical treatment and dead reserve',async()=>{
 const s=E.validateState(await kit('01-Testkampf-1.9.19.json'));assert.equal(s.actors.length,6);assert.equal(abilityGroups(E.findActor(s,'ivo').skills).length,1);assert.equal(E.findActor(s,'selene').hp,E.findActor(s,'selene').maxHp);assert.equal(E.findActor(s,'dead-watch').condition,'dead');assert.equal(E.findActor(s,'dead-watch').position,null);
 for(const name of ['02-Akrobatik.json','03-Gegenmittel.json','04-Zustaende-ohne-Quelle.json','05-Zustaende-Selene.json'])assert(profileFrom(await kit(name)).kind);
 const p=profileFrom(await kit('05-Zustaende-Selene.json'));assert.equal(transferPatch(E.findActor(s,'selene'),p,'replace',s).tactics[0].source,'raider');
});
test('1919 test kit carry route reaches I4 with two separate endpoints, exact cost and atomic undo',async()=>{
 const c=controller(await kit('01-Testkampf-1.9.19.json'));await c.start(false);const before=E.clone(c.state());await c.act({type:'skill',actor:'kara',target:'scout',skill:'carry',destination:{x:8,y:3}});assert.deepEqual(E.findActor(c.state(),'kara').position,{x:9,y:3});assert.deepEqual(E.findActor(c.state(),'scout').position,{x:8,y:3});assert.equal(c.state().movement.spent,5);assert.equal(E.findActor(c.state(),'scout').hp,0);await c.undo();assert.deepEqual(c.state().actors.map(a=>[a.position,a.resources,a.hp]),before.actors.map(a=>[a.position,a.resources,a.hp]));
});
test('1919 test kit supports targeted remedies, one paid area cleanse and the advertised straight jump',async()=>{
 let s=E.startCombat(await kit('01-Testkampf-1.9.19.json'),false).state;const r=E.resolveAction(s,{type:'use',actor:'kara',target:'selene',resource:'calming'});assert.deepEqual(E.findActor(r.state,'selene').tactics.map(v=>v.type),['distracted','rooted']);assert.equal(E.findActor(r.state,'selene').effects.length,1);s=r.state;
 const cleaned=E.resolveAction(s,{type:'use',actor:'kara',target:'selene',resource:'cleanse'}).state;assert.equal(E.findActor(cleaned,'selene').effects.length+E.findActor(cleaned,'selene').tactics.length,0);assert.equal(E.findActor(cleaned,'kara').resources[0].quantity,9);assert.equal(E.findActor(cleaned,'selene').hp,24);
 s=E.endTurn(s).state;const jump=E.findActor(s,'ivo').skills.find(v=>v.kind==='jump');const jumped=E.resolveAction(s,{type:'skill',actor:'ivo',target:'ivo',skill:jump.id,destination:{x:3,y:4}},{roll:()=>20}).state;assert.deepEqual(E.findActor(jumped,'ivo').position,{x:3,y:4});
});
