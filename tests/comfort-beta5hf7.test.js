import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../engine.js';
import {createController} from '../controller.js';
import {prepareHistory} from '../history-codec.js';
import {skillPreset,defenseText} from '../skills.js';
import {narrationWindow,narrationRecords,damageDescriptions,packNarrationEvent} from '../narration.js';
import {exportRules,ruleFileFrom} from '../rule-transfer.js';
import {createRulesDrafts} from '../rules-draft.js';
const roll=n=>n===20?12:2;
const acid={type:'acid_damage',turns:2,damage:'1',appliedTurn:0};
const skill=(kind,extra={})=>({...skillPreset(kind,'en'),id:kind,check:false,...extra});
function scene({rules={},hero={},foe={},others=[]}={}){
 let s=E.emptyState();s.rules=E.rulesFrom({...s.rules,language:'en',rngMode:'seeded',seed:'hf7',statMode:'bonuses',splitMovement:true,multiActionsEnabled:true,movementBase:6,movementStat:'none',damageAbility:false,stancesEnabled:false,hideNeedsTerrain:false,...rules});s.board={...s.board,width:12,height:8};
 s.actors=[{id:'hero-main',name:'Hero',side:'player',initiative:100,position:{x:2,y:2},actionsPerTurn:4,weaponList:[{id:'bow',name:'Bow',mode:'ranged',range:12,damage:'1d4'}],skills:[skill('hide')],...hero},{id:'enemy-main',name:'Guard',side:'enemy',initiative:50,position:{x:5,y:2},weaponList:[{id:'sword',name:'Sword',mode:'melee',damage:'1d4'}],...foe},...others].map(v=>E.actorFrom({hp:30,maxHp:30,dc:13,stats:{strength:0,dexterity:0,constitution:0,intelligence:0,charisma:0,perception:0},...v},true,s.rules.statMode));return E.startCombat(E.validateState(s)).state;
}
const hero=s=>s.actors.find(v=>v.id==='hero-main'),enemy=s=>s.actors.find(v=>v.id==='enemy-main');
const attack=(s,options={roll})=>E.resolveAction(s,{type:'attack',actor:'hero-main',target:'enemy-main',weapon:'bow',mode:'ranged',turn:E.turnToken(s)},options);
function harness(state=scene(),preferences={narrationScope:'auto'}){
 let key='a';const chats={a:{state,history:[]},b:{state:E.emptyState(),history:[]}};let busy=false;
 const c=createController({key:()=>key,read:()=>chats[key],write:b=>{chats[key]=b;},save:async()=>{},preferences:patch=>patch?Object.assign(preferences,patch):preferences,modelBusy:()=>busy});
 return {c,chats,switch:()=>key='b',busy:v=>busy=v};
}
function promptRecords(s,opts={}){const p=E.buildPrompt(s,{mode:'narrate',...opts}),line=p.split('\n').find(v=>v.startsWith('NARRATION TARGET —'));return {p,records:JSON.parse(line.slice(line.indexOf(': ')+2))};}

test('Redo restores exact seeded attack rolls, stock, HP and RNG without rolling again',async()=>{
 const {c}=harness(scene({hero:{resources:[{id:'arrows',kind:'ammo',name:'Arrows',quantity:5}],weaponList:[{id:'bow',mode:'ranged',range:12,damage:'1d4',resource:'arrows',standard:null}]}}));
 await c.act({type:'attack',actor:'hero-main',target:'enemy-main',weapon:'bow',mode:'ranged'});const after=E.clone(c.state()),hit=after.log.findLast(v=>['hit','miss'].includes(v.type));
 await c.undo();assert.equal(hero(c.state()).resources[0].quantity,5);assert.equal(c.redoLength(),1);const token=E.turnToken(c.state());await c.redo();
 assert.equal(enemy(c.state()).hp,enemy(after).hp);assert.equal(hero(c.state()).resources[0].quantity,4);assert.deepEqual(c.state().rng,after.rng);assert.deepEqual(c.state().log.find(v=>v.id===hit.id),hit);assert.notEqual(E.turnToken(c.state()),token);assert.equal(c.state().log.at(-1).type,'redo');assert.equal(c.redoLength(),0);E.validateState(c.state());
});
test('several Undo/Redo steps preserve their order across a JSON reload',async()=>{
 const {c,chats}=harness();for(const hp of [27,22,19])await c.edit('hero-main',{hp});await c.undo();await c.undo();assert.equal(hero(c.state()).hp,27);
 chats.a=JSON.parse(JSON.stringify(chats.a));assert.equal(c.redoLength(),2);await c.redo();assert.equal(hero(c.state()).hp,22);await c.redo();assert.equal(hero(c.state()).hp,19);assert.equal(c.historyLength(),3);await c.undo();assert.equal(hero(c.state()).hp,22);
});
test('a new successful branch clears Redo, while failed and duplicate actions preserve it',async()=>{
 const {c}=harness();await c.act({type:'other',actor:'hero-main',description:'Wait'}, {receipt:'used'});await c.edit('hero-main',{hp:24});await c.undo();assert.equal(c.redoLength(),1);
 await assert.rejects(c.edit('hero-main',{hp:-1}));assert.equal(c.redoLength(),1);await c.act({type:'other',actor:'hero-main',description:'Wait'}, {receipt:'used'});assert.equal(c.redoLength(),1);await c.edit('hero-main',{hp:23});assert.equal(c.redoLength(),0);await assert.rejects(c.redo());
});
test('Redo keeps stale action tokens invalid and never replays a completed receipt',async()=>{
 const {c}=harness(),old=E.turnToken(c.state());await c.act({type:'other',actor:'hero-main',description:'Once',turn:old},{receipt:'once'});await c.undo();await c.redo();await assert.rejects(c.act({type:'other',actor:'hero-main',description:'Stale',turn:old}),/Veralteter/);const rev=c.state().revision;await c.act({type:'other',actor:'hero-main',description:'Once'},{receipt:'once'});assert.equal(c.state().revision,rev);
});
test('Undo/Redo keep spent movement and same-turn hiding clocks after rebasing',async()=>{
 const {c}=harness();await c.act({type:'skill',actor:'hero-main',target:'hero-main',skill:'hide'});await c.move('hero-main',{x:3,y:2});const remaining=E.movementBudget(c.state(),hero(c.state())).remaining;await c.undo();await c.redo();assert.equal(E.movementBudget(c.state(),hero(c.state())).remaining,remaining);assert.equal(hero(c.state()).hidden.appliedTurn,c.state().turnSerial);E.validateState(c.state());
});
test('history stacks cap at 30 and keep compressed snapshots readable',async()=>{
 const {c,chats}=harness();for(let i=0;i<33;i++)await c.edit('hero-main',{hp:i%2?25:26});assert.equal(c.historyLength(),30);for(let i=0;i<30;i++)await c.undo();assert.equal(c.redoLength(),30);chats.a=JSON.parse(JSON.stringify(chats.a));assert.equal(prepareHistory(chats.a.redo).length,30);for(let i=0;i<30;i++)await c.redo();assert.equal(hero(c.state()).hp,26);
});
test('Undo/Redo are blocked during generation and queued history never modifies a switched chat',async()=>{
 const f=harness();await f.c.edit('hero-main',{hp:20});f.busy(true);await assert.rejects(f.c.undo(),/KI/);f.busy(false);await f.c.undo();const pending=f.c.redo();f.switch();await assert.rejects(pending,/Chat/);assert.equal(f.chats.b.state.actors.length,0);assert.equal(f.chats.a.redo.length,1);
});
test('Redo is an authoritative narration boundary rather than a newly executed attack',async()=>{
 const {c}=harness();await c.act({type:'attack',actor:'hero-main',target:'enemy-main',weapon:'bow',mode:'ranged'},{roll});await c.undo();await c.redo();for(const scope of ['result','turn','auto'])assert.deepEqual(promptRecords(c.state(),{narrationScope:scope}).records.map(v=>v.eventType),['redo']);
});

test('optional acid rule defaults off and old complete rule recipes remain compatible',()=>{
 assert.equal(E.defaultRules().acidDcEnabled,false);const s=scene({foe:{effects:[acid]}});assert.equal(E.profileDC(s,enemy(s)),13);const file=exportRules(s);delete file.rules.acidDcEnabled;delete file.rules.acidDcPenalty;assert.equal(ruleFileFrom(file).rules.acidDcEnabled,false);assert.equal(ruleFileFrom(file).rules.acidDcPenalty,2);
});
test('Corroding reduces effective profile DC once, without changing the editable base',()=>{
 const s=scene({rules:{acidDcEnabled:true,acidDcPenalty:2.25},foe:{effects:[acid]}});assert.equal(E.profileDC(s,enemy(s)),10.75);assert.equal(enemy(s).dc,13);const r=attack(s).result;assert.equal(r.dc,10.75);assert.equal(r.hit,true);assert.equal(r.defenseModifiers.base,13);assert.equal(r.defenseModifiers.corrosion,-2.25);assert.equal(E.profileDC(E.validateState(s),enemy(s)),10.75);
});
test('effects disabled, no Corroding and plain acid damage do not reduce DC',()=>{
 for(const options of [{rules:{acidDcEnabled:true,effectsEnabled:false},foe:{effects:[acid]}},{rules:{acidDcEnabled:true}},{rules:{acidDcEnabled:false},foe:{effects:[acid]}}]){const s=scene(options);assert.equal(E.profileDC(s,enemy(s)),13);}
 let s=scene({rules:{acidDcEnabled:true},hero:{attackBonus:20,weaponList:[{id:'bow',mode:'ranged',range:12,damage:'1d4',damageType:'acid'}]}});s=attack(s).state;assert.equal(E.profileDC(s,enemy(s)),13);assert.equal(enemy(s).effects.length,0);
});
test('expiration and cure remove the DC penalty and leave base DC intact',()=>{
 let s=scene({rules:{acidDcEnabled:true},hero:{effects:[{...acid,turns:1}],hp:20,resources:[{id:'wash',kind:'supply',name:'Wash',quantity:1,heal:'0',range:0,cures:['acid_damage']}]}});assert.equal(E.profileDC(s,hero(s)),11);const cured=E.resolveAction(s,{type:'use',actor:'hero-main',target:'hero-main',resource:'wash'}).state;assert.equal(E.profileDC(cured,hero(cured)),13);s=E.endTurn(s,undefined,{roll}).state;assert.equal(E.profileDC(s,hero(s)),13);assert.equal(hero(s).dc,13);
});
test('target-profile checks use Corroding while fixed and attribute DCs retain their meaning',()=>{
 const s=scene({rules:{acidDcEnabled:true},foe:{effects:[acid]}}),b=enemy(s),base=skill('intimidate',{check:true,dcMode:'target-dc',dcAdjustment:1});const d=E.skillDefense(s,b,base);assert.equal(d.dc,12);assert.match(defenseText(d,'en'),/13.*-2 Corroding.*\+1/);assert.equal(E.skillDefense(s,b,{...base,dcMode:'fixed',dc:15}).dc,15);assert.equal(E.skillDefense(s,b,{...base,dcMode:'strength',dcBase:10}).dc,11);
});
test('the rules draft and validated import/export preserve the optional penalty',()=>{
 const s=scene(),d=createRulesDrafts();assert(d.stage('test',s.rules,'acidDcEnabled',true));assert(d.stage('test',s.rules,'acidDcPenalty','3.5'));const patch=d.patch('test',s.rules);assert.equal(E.rulesFrom({...s.rules,...patch}).acidDcPenalty,3.5);const on=scene({rules:{acidDcEnabled:true,acidDcPenalty:3.5}});assert.equal(ruleFileFrom(exportRules(on)).rules.acidDcPenalty,3.5);assert.throws(()=>E.rulesFrom({...s.rules,acidDcPenalty:-1}));assert.throws(()=>E.rulesFrom({...s.rules,acidDcEnabled:'yes'}));
});
test('acid rule changes can be undone and redone without baking penalty into profile',async()=>{
 const {c}=harness(scene({foe:{effects:[acid]}}));await c.rules({acidDcEnabled:true,acidDcPenalty:3});assert.equal(E.profileDC(c.state(),enemy(c.state())),10);await c.undo();assert.equal(E.profileDC(c.state(),enemy(c.state())),13);await c.redo();assert.equal(E.profileDC(c.state(),enemy(c.state())),10);assert.equal(enemy(c.state()).dc,13);
});

test('turn narration collects attack, movement and hiding in order, including after End turn',()=>{
 let s=attack(scene(),{roll:n=>n===20?15:2}).state;s=E.moveActor(s,'hero-main',{x:3,y:2}).state;s=E.resolveAction(s,{type:'skill',actor:'hero-main',target:'hero-main',skill:'hide'}).state;
 const types=()=>promptRecords(s,{narrationScope:'turn'}).records.map(v=>v.eventType);assert.deepEqual(types(),['hit','move','skill']);s=E.endTurn(s).state;assert.deepEqual(types(),['hit','move','skill','turn']);assert.equal(promptRecords(s).records[0].eventType,'skill');
});
test('a later movement-only turn does not retell a preceding actor attack',()=>{
 let s=attack(scene()).state;s=E.endTurn(s).state;s=E.moveActor(s,'enemy-main',{x:6,y:2}).state;const r=promptRecords(s,{narrationScope:'turn'}).records;assert.deepEqual(r.map(v=>v.eventType),['move']);assert.equal(r[0].actor,'Guard');
});
test('unseen later turns do not revive older visible actions or leak identities',()=>{
 let s=attack(scene({rules:{visionEnabled:true,visionBase:6,visionPerception:false,hideUnseenEnemies:true}})).state;s=E.endTurn(s).state;s=E.moveActor(s,'enemy-main',{x:11,y:2},true).state;s=E.endTurn(s).state;const r=promptRecords(s,{narrationScope:'turn'}).records;assert.equal(r.length,0);
});
test('a bounded batch keeps chronology, reports truncation and excludes private opponents',()=>{
 const s=scene({rules:{visionEnabled:true,visionBase:3,visionPerception:false,hideUnseenEnemies:true},foe:{position:{x:11,y:2}}});const ev=i=>({id:'e'+i,type:'other',text:'Action '+i,details:{turn:'t'+i,actor:'hero-main',actorName:'Hero'}});const list=Array.from({length:90},(_,i)=>ev(i));list.push({id:'secret',type:'other',text:'Guard hidden',details:{actor:'enemy-main',actorName:'Guard'}});const selected=E.selectNarration(s,{scope:'batch',batch:{events:list}});assert(selected.truncated);assert(selected.events.length<=80);assert(!JSON.stringify(selected).includes('Guard'));assert.equal(selected.events.at(-1).text,'Action 89');
});
test('auto prefers the last AI batch and explicit empty batch never falls back to an old hit',()=>{
 const s=attack(scene()).state,batch={events:[{id:'batch',type:'other',text:'Batch action',details:{actor:'hero-main',actorName:'Hero',turn:'batch-turn'}}]};assert.equal(E.selectNarration(s,{scope:'auto',batch}).scope,'batch');assert.equal(E.selectNarration(s,{scope:'batch'}).events.length,0);assert.equal(E.selectNarration(s,{scope:'auto'}).scope,'turn');
});
test('AI until manual turn stores all public actions from multiple actors, not only the final one',async()=>{
 const {c,chats}=harness(scene({hero:{control:'basic'},foe:{control:'basic',position:{x:3,y:2}},others:[{id:'manual-ally',name:'Player',side:'ally',control:'manual',initiative:1,position:{x:1,y:1}}]}));await c.aiRun(3);const batch=c.narrationBatch();assert(batch?.events.length);const actors=new Set(batch.events.map(e=>e.details.actor));assert(actors.has('hero-main'));assert(actors.has('enemy-main'));assert.equal(c.narrationSelection().scope,'batch');assert(batch.events.some(e=>['hit','miss'].includes(e.type)));chats.a=JSON.parse(JSON.stringify(chats.a));assert(c.narrationBatch());await c.edit('hero-main',{hp:17});assert.equal(c.narrationBatch(),null);
});
test('stopping or switching chats cannot store an AI batch in the other chat',async()=>{
 const f=harness(scene({hero:{control:'basic'},foe:{control:'basic',position:{x:3,y:2}}}));f.c.subscribeEvents(()=>{f.c.stopAI();f.switch();});await f.c.aiRun(2);assert.equal(f.chats.b.narrationBatch,undefined);assert.equal(f.chats.b.state.actors.length,0);
});
test('narration scope preference rejects unsupported values',()=>{
 const {c}=harness();assert.throws(()=>c.preferences({narrationScope:'whole-world'}));
});
for(const language of ['de','en'])test(language+' grouped prompt requests chronological prose without combat numbers',()=>{
 const s=attack(scene({rules:{language},hero:{attackBonus:20}})).state,{p,records}=promptRecords(s,{narrationScope:'turn'});assert.equal(records.length,1);assert.match(p,/multiple recorded actions in chronological order/);assert.match(p,/Do not read out damage amounts/);assert.match(p,/opportunity attacks and periodic condition damage/);assert(records[0].damageDescriptions[0].level);assert.match(p,/No events outside this window/);
});
for(const [amount,level]of [[0,'none'],[1,'light'],[2,'solid'],[5,'heavy'],[10,'devastating']])test('damage severity '+amount+'/20 = '+level+' without inventing injuries',()=>{
 const d=damageDescriptions({type:'hit',details:{type:'attack',hit:true,affected:[{name:'Target',damage:amount,maxHp:20,afterHp:20-amount,condition:'fit'}]}})[0];assert.equal(d.level,level);assert.equal(d.damage,amount);assert.equal(d.condition,'fit');
});
test('custom, periodic and nested opportunity damage all receive severity hints without duplication',()=>{
 const oa={type:'attack',actor:'enemy-main',actorName:'Guard',target:'hero-main',targetName:'Hero',opportunity:true,turn:'t',natural:12,hit:true,damage:4,maxHp:20,afterHp:16};const list=[{id:'oa',type:'hit',details:oa},{id:'move',type:'move',details:{actor:'hero-main',from:'A1',to:'B1',opportunities:[oa]}},{id:'tick',type:'effect',details:{actorName:'Hero',damage:2,maxHp:20}},{id:'custom',type:'skill',details:{custom:{targetName:'Guard',damage:{applied:6},maxHp:20,afterHp:14}}}];const records=narrationRecords(list.map(packNarrationEvent),'en',true);assert.equal(records.flatMap(v=>v.damageDescriptions??[]).length,3);assert.equal(records[0].damageDescriptions[0].source,'opportunity');assert.equal(records[2].damageDescriptions[0].source,'periodic-damage');assert.equal(records[3].damageDescriptions[0].source,'custom');
});
test('misses, voided attacks, skipped ticks and legacy unknown max HP do not invent damage severity',()=>{
 assert.deepEqual(damageDescriptions({type:'miss',details:{hit:false,damage:0}}),[]);assert.deepEqual(damageDescriptions({type:'hit',details:{voided:true,damage:9}}),[]);assert.deepEqual(damageDescriptions({type:'effect',details:{skipped:true,damage:3}}),[]);assert.equal(damageDescriptions({type:'hit',details:{hit:true,damage:2}})[0].level,'damage');
});
test('Redo retains image assets while a new branch prunes abandoned portraits',async()=>{
 const {c,chats}=harness(),src='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';await c.edit('hero-main',{portraitImage:{kind:'portrait',width:1,height:1,src}});const id=hero(c.state()).portrait;await c.undo();assert(c.image(id));await c.redo();assert.equal(hero(c.state()).portrait,id);await c.undo();await c.edit('hero-main',{hp:21});assert.equal(c.redoLength(),0);assert.equal(chats.a.images[id],undefined);
});
test('successive acid condition hits refresh instead of stacking DC penalties',()=>{
 let s=scene({rules:{acidDcEnabled:true},hero:{attackBonus:20,weaponList:[{id:'bow',mode:'ranged',range:12,damage:'1d4',damageType:'acid',effects:[acid]}]}});s=attack(s).state;assert.equal(E.profileDC(s,enemy(s)),11);s=attack(s).state;assert.equal(E.profileDC(s,enemy(s)),11);assert.equal(enemy(s).effects.filter(v=>v.type==='acid_damage').length,1);assert.equal(enemy(s).dc,13);
});
test('acid condition immunity prevents both application and the optional defense penalty',()=>{
 let s=scene({rules:{acidDcEnabled:true},hero:{attackBonus:20,weaponList:[{id:'bow',mode:'ranged',range:12,damage:'1d4',damageType:'acid',effects:[acid]}]},foe:{conditionImmunities:['acid_damage']}});s=attack(s).state;assert.equal(E.profileDC(s,enemy(s)),13);assert.equal(enemy(s).effects.length,0);
});
test('opportunity attacks and their preview use the same reduced defense as ordinary attacks',()=>{
 const s=scene({rules:{acidDcEnabled:true,opportunityEnabled:true,reactionsEnabled:true},hero:{effects:[acid]},foe:{position:{x:3,y:2},reactionControl:'auto'}});const r=E.moveActor(s,'hero-main',{x:1,y:2},false,{roll});assert.equal(r.result.opportunities[0].dc,11);assert.equal(r.result.opportunities[0].hit,true);assert.equal(hero(r.state).hp,28);
});
test('corrosion is reflected in public participants and target-profile context, without mutating state',()=>{
 const s=scene({rules:{acidDcEnabled:true},foe:{effects:[acid]}}),before=E.clone(s),p=E.buildPrompt(s,{compact:true});assert(p.includes('"dc":11,"baseDc":13,"corrosionPenalty":2'));assert.deepEqual(s,before);
});
test('an unseen opportunity attacker remains sanitized in saved narration batches',()=>{
 let s=scene({rules:{visionEnabled:true,visionBase:3,visionPerception:false,hideUnseenEnemies:true,opportunityEnabled:true,reactionsEnabled:true},foe:{position:{x:3,y:2},reactionControl:'auto'}});s=E.moveActor(s,'hero-main',{x:1,y:2},false,{roll}).state;const event=s.log.find(v=>v.details?.opportunity);assert(event);const packed=packNarrationEvent(event);enemy(s).position={x:11,y:2};const result=E.selectNarration(s,{scope:'batch',batch:{events:[packed]}});assert.equal(result.events.length,1);assert.equal(result.events[0].details.actor,null);assert(!JSON.stringify(result).includes('Guard'));assert(!JSON.stringify(result).includes('enemy-main'));
});
test('periodic damage and an independent death retain explicit causes after a whole turn',()=>{
 let s=scene({hero:{effects:[{type:'bleeding',turns:2,damage:'1',appliedTurn:0}]},foe:{initiative:200},others:[{id:'fallen',name:'Fallen',side:'ally',initiative:1,position:{x:1,y:1},hp:0,condition:'unconscious',roundsLeft:1}]});s=E.endTurn(s).state;s=attack(s).state;s=E.endTurn(s).state;const records=promptRecords(s,{narrationScope:'turn'}).records;assert(records.some(v=>v.eventType==='hit'||v.eventType==='miss'));assert(records.some(v=>v.cause==='periodic-damage'));assert(records.some(v=>v.cause==='rescue-expired'));
});
test('a long batch is bounded in storage and marked explicitly as an excerpt',async()=>{
 const {c}=harness(scene({hero:{control:'basic',weaponList:[],weapons:{melee:null,ranged:null}},foe:{control:'basic',weaponList:[],weapons:{melee:null,ranged:null}}}));await c.aiRun(60);const b=c.narrationBatch();assert(b);assert(b.events.length<=80);assert(JSON.stringify(b.events).length<=64000);assert(b.truncated);const {p}=promptRecords(c.state(),{narrationScope:'batch',narrationBatch:b});assert(p.includes('bounded excerpt'));
});
