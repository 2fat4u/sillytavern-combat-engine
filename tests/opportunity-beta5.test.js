import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../engine.js';
import { skillPreset,skillsFrom } from '../skills.js';
import { hiddenFields,readHidden } from '../hidden-ui.js';
import { skillsMarkup } from '../skills-ui.js';
import { exportRules,ruleFileFrom } from '../rule-transfer.js';
import { exportProfiles,profileFrom } from '../profiles.js';
import { createController } from '../controller.js';
import { latestResult,compactResultFeedback,compactResultContext } from '../results.js';
import { narrationEvents } from '../model-context.js';
import { planBasicTurn,resolveBasicTurn,resolveBasicTurnAsync } from '../ai.js';
import { planAdvancedTurn } from '../advanced-ai.js';
import { resolveAdvancedTurn,resolveAdvancedTurnAsync } from '../advanced-runner.js';

const ability=(kind,extra={})=>({...skillPreset(kind,'en'),id:kind,ai:true,check:false,...extra});
const roll=n=>n===20?15:2;
function scene({actor={},foe={},others=[],rules={},board={}}={}){
 let s=E.emptyState();s.rules=E.rulesFrom({...s.rules,opportunityEnabled:true,reactionsEnabled:true,splitMovement:true,multiActionsEnabled:true,movementBase:6,movementStat:'none',stancesEnabled:false,hideNeedsTerrain:false,rngMode:'seeded',seed:'beta5-test',language:'en',...rules});s.board={...s.board,width:10,height:8,...board};
 s.actors=[{id:'hero-main',name:'Hero',side:'player',initiative:100,position:{x:2,y:2},skills:[ability('disengage')],...actor},{id:'enemy-main',name:'Guard',side:'enemy',initiative:50,position:{x:3,y:2},reactionControl:'auto',weaponList:[{id:'sword',name:'Sword',mode:'melee',damage:'1d4'}],...foe},...others].map(v=>E.actorFrom({maxHp:30,hp:30,dc:10,...v},true));
 return E.startCombat(E.validateState(s)).state;
}
const move=(s,p={x:1,y:2},options={})=>E.moveActor(s,'hero-main',p,false,{roll,...options});
const intent=(s,kind,target='hero-main',extra={})=>({type:'skill',actor:'hero-main',skill:kind,target,turn:E.turnToken(s),...extra});
function harness(s){let key='a';const chats={a:{state:s,history:[]},b:{state:E.emptyState(),history:[]}},c=createController({key:()=>key,read:()=>chats[key],write:v=>{chats[key]=v;},save:async()=>{}});return {c,chats,switch:()=>{key='b';c.cancelReactions();}};}
const down={id:'down-ally',name:'Fallen ally',side:'ally',position:{x:2,y:3},hp:0,condition:'stabilized'};

test('the rule is opt-in and old complete rule recipes retain it off',()=>{
 assert.equal(E.defaultRules().opportunityEnabled,false);const file=exportRules(E.emptyState());delete file.rules.opportunityEnabled;assert.equal(ruleFileFrom(file).rules.opportunityEnabled,false);
 assert.equal(E.validateState(JSON.parse(JSON.stringify(scene()))).rules.opportunityEnabled,true);
});
for(const rules of [{opportunityEnabled:false},{reactionsEnabled:false},{boardEnabled:false}])test('disabled module does not provoke or spend reactions '+JSON.stringify(rules),()=>{
 const s=scene({rules}),r=move(s);assert.equal(r.state.actors[0].hp,30);assert.equal(r.state.actors[1].reactionSpent,0);
});
test('leaving reach attacks at departure, spends one reaction but no normal action',()=>{
 const s=scene(),before=E.clone(s),r=move(s);assert.deepEqual(s,before);assert.equal(r.state.actors[0].hp,28);assert.equal(r.state.actors[1].reactionSpent,1);assert.equal(E.actionBudget(r.state).free.remaining,1);assert.deepEqual(r.state.actors[0].position,{x:1,y:2});assert.equal(r.result.opportunities.length,1);assert.equal(E.movementBudget(r.state,r.state.actors[0]).spent,1);E.validateState(r.state);
 assert(r.state.log.find(e=>e.details.opportunity).textEn.includes('Opportunity attack'));
});
test('remaining within reach, approaching or crossing only diagonal access does not provoke',()=>{
 assert.equal(move(scene(),{x:2,y:1}).result.opportunities.length,0);
 const s=scene({actor:{position:{x:1,y:2}}});assert.equal(move(s,{x:2,y:2}).result.opportunities.length,0);
});
for(const foe of [{reactionControl:'off'},{reactionsPerTurn:0},{reactionCost:'normal'},{effects:[{type:'stunned',turns:2}]},{position:null,reserve:true},{weaponList:[],weapons:{melee:null,ranged:{damage:'1d4',range:8}}}])test('unavailable reactor is excluded '+JSON.stringify(foe),()=>{
 assert.equal(move(scene({foe})).result.opportunities.length,0);
});
test('reserved normal-action reactions can trigger exactly once',()=>{
 const s=scene({foe:{reactionCost:'normal',reactionReserved:1,reactionReserve:true}}),r=move(s);assert.equal(r.result.opportunities.length,1);assert.equal(r.state.actors[1].reactionReserved,0);assert.equal(r.state.actors[1].reactionSpent,1);
});
test('weapon stock pays on a miss; exhausted stock and disarmed weapons cannot trigger',()=>{
 const foe={resources:[{id:'charge',name:'Charges',kind:'ammo',quantity:1}],weaponList:[{id:'sword',name:'Sword',mode:'melee',damage:'1d4',resource:'charge',standard:null}]};
 const r=move(scene({foe}),undefined,{roll:()=>1});assert.equal(r.result.opportunities[0].hit,false);assert.equal(r.state.actors[1].resources[0].quantity,0);assert.equal(r.state.actors[1].reactionSpent,1);
 assert.equal(move(scene({foe:{...foe,resources:[{...foe.resources[0],quantity:0}]}})).result.opportunities.length,0);
 assert.equal(move(scene({foe:{tactics:[{type:'disarmed',weapon:'sword',turns:2,appliedTurn:0}]}})).result.opportunities.length,0);
});
test('an enemy unable to see the hidden mover cannot attack; GM correction never triggers',()=>{
 let s=scene();s=E.editActor(s,'hero-main',{hidden:{turns:3,appliedTurn:s.turnSerial}}).state;assert.equal(move(s).result.opportunities.length,0);
 const gm=E.moveActor(scene(),'hero-main',{x:1,y:2},true);assert.equal(gm.state.actors[0].hp,30);assert.equal(gm.state.actors[1].reactionSpent,0);
});
test('multiple foes each react once and later movement cannot reuse their spent budget',()=>{
 const s=scene({others:[{id:'second-guard',name:'Second',side:'enemy',position:{x:2,y:3},reactionControl:'auto',reactionsPerTurn:1,initiative:40}]}),r=move(s,{x:0,y:0});assert.equal(r.result.opportunities.length,2);assert.equal(r.state.actors[0].hp,26);assert.equal(r.state.actors[1].reactionSpent,1);assert.equal(r.state.actors[2].reactionSpent,1);assert.equal(move(r.state,{x:1,y:1}).result.opportunities.length,0);
});
test('path detects intermediate reach departure even when both endpoints are outside',()=>{
 const s=scene({actor:{position:{x:0,y:2}},foe:{position:{x:2,y:1}},board:{height:3}}),r=move(s,{x:4,y:2});assert.equal(r.result.opportunities.length,1);assert.equal(r.state.actors[0].hp,28);assert.deepEqual(r.state.actors[0].position,{x:4,y:2});
});
test('KO stops before departing, pays no untraversed movement and advances turn',()=>{
 const s=scene({actor:{hp:1},others:[{id:'ally-safe',name:'Ally',side:'ally',initiative:10,position:{x:8,y:7}}]}),r=move(s,{x:0,y:2});assert.equal(r.state.actors[0].hp,0);assert.deepEqual(r.state.actors[0].position,{x:2,y:2});assert.equal(r.result.interrupted,true);assert.equal(r.result.movement.spent,0);assert.notEqual(E.currentActor(r.state)?.id,'hero-main');E.validateState(r.state);
});
test('a stun on the opportunity hit interrupts a surviving mover without teleporting',()=>{
 const s=scene({foe:{weaponList:[{id:'sword',name:'Stunning sword',mode:'melee',damage:'1d4',effects:[{type:'stunned',turns:1}]}]}}),r=move(s,{x:0,y:2});assert.equal(r.result.interrupted,true);assert.deepEqual(r.state.actors[0].position,{x:2,y:2});assert.equal(r.state.actors[0].hp,28);E.validateState(r.state);
});
test('resistance and active protection apply without counter-reaction chains',()=>{
 const s=scene({actor:{damageResistances:['physical'],reactionControl:'auto',reactionChoices:['counter']}}),r=move(s);assert.equal(r.state.actors[0].hp,29);assert.equal(r.state.actors[0].reactionSpent,0);assert.equal(r.state.log.filter(e=>e.details.opportunity).length,1);
});
test('Disengage always has no check and one-turn duration, regardless of imported values',()=>{
 const a=skillsFrom([ability('disengage',{check:true,turns:8})],Object.keys(E.STATS));assert.equal(a[0].check,false);assert.equal(a[0].turns,1);const html=skillsMarkup(scene().actors[0],a,'en',scene().rules);assert(html.includes('name="skill-0-check" disabled'));assert(html.includes('Disengage'));
});
test('Disengage spends one action and shared stock once without rolling',()=>{
 const s=scene({actor:{resources:[{id:'ki',name:'Ki',kind:'ammo',quantity:2}],skills:[ability('disengage',{resource:'ki'})]}}),r=move(s,undefined,{disengageSkill:'disengage',roll:()=>{throw Error('must not roll');}});assert.equal(r.state.actors[0].hp,30);assert.equal(r.state.actors[0].resources[0].quantity,1);assert.equal(E.actionBudget(r.state).free.remaining,0);assert.equal(r.state.actors[1].reactionSpent,0);assert.equal(r.state.actors[0].disengageTurn,s.turnSerial);
});
test('Disengage permits remaining movement without split movement and expires next own turn',()=>{
 const s=scene({rules:{splitMovement:false}}),d=E.resolveAction(s,intent(s,'disengage')).state;assert.equal(E.currentActor(d).id,'hero-main');assert(E.movementBudget(d,d.actors[0]).remaining>0);const r=move(d).state;assert.equal(r.actors[0].hp,30);let next=E.endTurn(r).state;next=E.endTurn(next).state;assert.notEqual(next.turnSerial,s.turnSerial);assert.equal(E.disengageSkills(next,next.actors[0]).length,1);
});
test('after spending an action, only a matching bonus action can pay Disengage',()=>{
 const s=scene(),spent=E.resolveAction(s,{type:'other',actor:'hero-main',description:'Wait'}).state;assert.equal(E.disengageSkills(spent,spent.actors[0]).length,0);
 const b=scene({actor:{bonusActions:[{id:'extra',name:'Skill action',count:1,allowed:['skill']}]}}),r=move(b,undefined,{disengageSkill:'disengage'});assert.equal(r.state.log.find(e=>e.type==='skill').details.actionPool.id,'extra');assert.equal(E.actionBudget(r.state).free.remaining,1);
});
test('movement validation rejects occupied or unaffordable destinations before spending',()=>{
 const s=scene({rules:{movementBase:1}}),before=E.clone(s);assert.throws(()=>move(s,{x:8,y:7}));assert.throws(()=>move(s,{x:3,y:2}));assert.deepEqual(s,before);
});
test('manual movement can cancel atomically or choose Disengage in the popup',async()=>{
 for(const decision of ['cancel',{kind:'disengage',skill:'disengage'}]){const s=scene(),{c}=harness(s),stages=[];c.subscribeReactions(r=>{stages.push(r.stage);c.respondReaction(decision);});const r=await c.move('hero-main',{x:1,y:2},false,{roll});assert.deepEqual(stages,['movement']);if(decision==='cancel'){assert(r.cancelled);assert.deepEqual(c.state(),s);}else{assert.equal(c.state().actors[0].hp,30);assert.equal(c.state().actors[0].disengageTurn,s.turnSerial);}}
});
for(const attack of [false,true])test('manual reactor can '+(attack?'attack':'decline'),async()=>{
 const {c}=harness(scene({foe:{reactionControl:'manual'}})),stages=[];c.subscribeReactions(r=>{stages.push(r.stage);c.respondReaction(r.stage==='movement'?{kind:'continue'}:attack?r.options[0]:{kind:'none'});});await c.move('hero-main',{x:1,y:2},false,{roll});assert.deepEqual(stages,['movement','opportunity']);assert.equal(c.state().actors[0].hp,attack?28:30);assert.equal(c.state().actors[1].reactionSpent,attack?1:0);
});
test('chat switch during a movement request leaves both chats untouched',async()=>{
 const s=scene(),h=harness(s);h.c.subscribeReactions(()=>{h.switch();});await assert.rejects(h.c.move('hero-main',{x:1,y:2},false,{roll}),/Chat/);assert.deepEqual(h.chats.a.state,s);assert.equal(h.chats.b.state.actors.length,0);
});
test('Undo restores movement damage, reactions, stock and the previous protection marker',async()=>{
 const {c}=harness(scene());c.subscribeReactions(()=>c.respondReaction({kind:'continue'}));await c.move('hero-main',{x:1,y:2},false,{roll});await c.undo();assert.equal(c.state().actors[0].hp,30);assert.equal(c.state().actors[1].reactionSpent,0);assert.deepEqual(c.state().actors[0].position,{x:2,y:2});
 await c.act(intent(c.state(),'disengage'));await c.move('hero-main',{x:1,y:2},false,{roll});await c.undo();assert.equal(c.state().actors[0].disengageTurn,c.state().turnSerial);assert.equal(move(c.state()).state.actors[0].hp,30);
});
for(const kind of ['jump','carry'])test(kind+' voluntary movement provokes only after a successful ability',()=>{
 const s=scene({actor:{skills:[ability(kind,{check:true,range:3})]},others:[kind==='carry'?down:{...down,position:{x:1,y:2}}]}),target=kind==='jump'?'hero-main':'down-ally',destination=kind==='jump'?{x:0,y:2}:{x:0,y:3};
 const failed=E.resolveAction(s,intent(s,kind,target,{destination}),{roll:()=>1});assert.equal(failed.result.success,false);assert.equal(failed.state.actors[1].reactionSpent,0);assert.deepEqual(failed.state.actors[0].position,{x:2,y:2});
 const success=E.resolveAction(s,intent(s,kind,target,{destination}),{roll});assert(success.result.forcedMovement.opportunities.length);assert.equal(success.state.actors[1].reactionSpent,1);assert.equal(success.state.actors[0].hp,28);assert.equal(E.movementBudget(success.state,success.state.actors[0]).spent,kind==='jump'?0:success.result.forcedMovement.cost);E.validateState(success.state);
});
test('shove is forced movement and cannot provoke from either participant',()=>{
 const s=scene({actor:{skills:[ability('shove')]}}),r=E.resolveAction(s,intent(s,'shove','enemy-main',{destination:{x:4,y:2}}),{roll});assert.equal(r.state.actors[0].hp,30);assert.equal(r.state.actors[1].reactionSpent,0);
});
test('jump is interrupted on KO instead of completing its destination',()=>{
 const s=scene({actor:{hp:1,skills:[ability('jump',{range:3})]},others:[{...down,position:{x:1,y:2}},{id:'ally-safe',name:'Ally',side:'ally',position:{x:8,y:7},initiative:10}]}),r=E.resolveAction(s,intent(s,'jump','hero-main',{destination:{x:0,y:2}}),{roll});assert.equal(r.result.interrupted,true);assert.deepEqual(r.state.actors[0].position,{x:2,y:2});E.validateState(r.state);
});
test('manual own-check jump uses the same pre-movement decisions',async()=>{
 const s=scene({actor:{skills:[ability('jump',{range:3})]},others:[{...down,position:{x:1,y:2}}]}),{c}=harness(s),stages=[];c.subscribeReactions(r=>{stages.push(r.stage);assert.equal(r.conditional,true);c.respondReaction({kind:'continue'});});await c.act({type:'check',description:'Jump over ally',actor:'hero-main',stat:'dexterity',dc:10,effect:'jump',target:'hero-main',destination:{x:0,y:2},turn:E.turnToken(s)},{roll});assert(stages.includes('movement'));assert.equal(c.state().actors[0].hp,28);
});
test('opportunity movement is the latest narration target with actual rolls, damage and endpoint',()=>{
 let s=scene();s=E.resolveAction(s,{type:'other',actor:'hero-main',description:'Earlier action'}).state;const r=move(s),selected=latestResult(r.state.log).event;assert.equal(selected.type,'move');assert.equal(narrationEvents(r.state.log)[0].id,selected.id);assert(E.eventText(selected,'en').includes('Opportunity attack'));assert(E.eventText(selected,'en').includes('28'));assert.equal(compactResultFeedback(r.result,'en').kind,'failure');assert(compactResultContext(r.result,'en').includes('2 opportunity damage'));assert(E.buildPrompt(r.state,{mode:'narrate'}).includes('Opportunity attack'));
});
test('moving away keeps known damage visible without revealing the now-unseen reactor',()=>{
 const s=scene({rules:{visionEnabled:true,visionBase:1,visionPerception:false,hideUnseenEnemies:true}}),r=move(s,{x:0,y:2}),before=E.clone(r.state),view=E.playerView(r.state),selected=latestResult(view.log).event;
 assert.equal(view.actors.length,1);assert.equal(selected.type,'move');assert.equal(selected.details.opportunityDamage,2);assert.equal(selected.details.opportunities[0].actor,null);assert(E.publicValue(r.state,r.result));const publicJSON=JSON.stringify({event:selected,narration:narrationEvents(view.log)});assert(!publicJSON.includes('enemy-main'));assert(!publicJSON.includes('Guard'));assert(!publicJSON.includes('Sword'));assert(publicJSON.includes('28'));assert.deepEqual(r.state,before);
});
for(const lang of ['de','en'])test('Hidden editor '+lang+' validates setting, clearing and legacy forms without action cost',()=>{
 const s=scene(),a=s.actors[0],data=new FormData();data.set('actor-hidden-present','1');data.set('actor-hidden','on');data.set('actor-hidden-turns','3');const hidden=readHidden(data,a,s,lang),r=E.editActor(s,a.id,{hidden});assert.equal(r.state.actors[0].hidden.turns,3);assert.equal(E.actionBudget(r.state).free.remaining,1);data.delete('actor-hidden');assert.equal(readHidden(data,r.state.actors[0],r.state,lang),null);assert.deepEqual(readHidden(new FormData(),r.state.actors[0],r.state,lang),hidden);assert(hiddenFields(a,s,lang).includes(lang==='en'?'Hidden':'Versteckt'));
 data.set('actor-hidden','on');data.set('actor-hidden-turns','0');assert.throws(()=>readHidden(data,a,s,lang));data.set('actor-hidden-turns','3');assert.throws(()=>readHidden(data,a,{...s,rules:{...s.rules,stealthEnabled:false}},lang));assert.throws(()=>readHidden(data,a,{...s,rules:{...s.rules,hideNeedsTerrain:true}},lang));
});
test('precombat Hidden is retained on start, exported state roundtrips, profile runtime protection resets',()=>{
 const active=scene(),s={...E.clone(active),phase:'setup'};s.actors[1].hidden={turns:3,appliedTurn:s.turnSerial};const start=E.startCombat(E.validateState(s)).state;assert.equal(start.actors[1].hidden.turns,3);assert.deepEqual(E.validateState(JSON.parse(JSON.stringify(start))).actors[1].hidden,start.actors[1].hidden);
 const d=E.resolveAction(active,intent(active,'disengage')).state;const profiles=profileFrom(exportProfiles(d,'actor',d.actors[0].id));assert.equal(profiles.actors[0].disengageTurn,-1);assert.equal(profiles.actors[0].hidden,null);
});
for(const control of ['basic','advanced'])test(control+' AI can use affordable Disengage and finishes without invalid movement',async()=>{
 const s=scene({actor:{control,attackMode:'ranged',aiBehavior:'cautious',weaponList:[{id:'bow',name:'Bow',mode:'ranged',damage:'1d4',range:8}]}}),plan=(control==='basic'?planBasicTurn:planAdvancedTurn)(s);assert.equal(plan.intent.skill,'disengage');const sync=(control==='basic'?resolveBasicTurn:resolveAdvancedTurn)(s,{roll}),asyncResult=await(control==='basic'?resolveBasicTurnAsync:resolveAdvancedTurnAsync)(s,{roll,yield:()=>Promise.resolve()});assert.equal(sync.state.actors[0].hp,30);assert.equal(asyncResult.state.actors[0].hp,30);assert(sync.state.log.some(e=>e.type==='skill'&&e.details.skillKind==='disengage'));E.validateState(sync.state);E.validateState(asyncResult.state);
});
test('AI risk ignores an unseen opponent rather than consulting its hidden position',()=>{
 const s=scene({actor:{control:'advanced'},rules:{visionEnabled:true,visionBase:0,visionPerception:false,hideUnseenEnemies:true}});assert.equal(E.opportunityRisk(s,s.actors[0],{x:1,y:2}),0);
});
