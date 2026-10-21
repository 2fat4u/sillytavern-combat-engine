import test from 'node:test';import assert from 'node:assert/strict';
import * as E from '../engine.js';import {skillPreset,skillsFrom,skillDefense,defenseText} from '../skills.js';
import {createController} from '../controller.js';import {exportProfiles,profileFrom} from '../profiles.js';
import {createCheckDrafts,checkIntent,narrativeFromCheck} from '../checks-ui.js';
import {reactionFields,customReactionPatch} from '../skills-ui.js';import {customReactionStatus} from '../reaction-diagnostics.js';
const roll=n=>n===20?15:n;
function scene({timing='after',mechanics={target:'self',status:{mode:'remove',type:'burning'}},check=false,cost='extra',hp=18,weapon={}}={}){
 let s=E.setRules(E.emptyState(),{reactionsEnabled:true,multiActionsEnabled:true,splitMovement:true,natural20:false,rngMode:'seeded',seed:'hotfix8',damageAbility:false}).state;
 s=E.addActor(s,{id:'def',name:'Defender',side:'player',hp,maxHp:20,initiative:cost==='extra'?20:40,position:{x:1,y:1},actionsPerTurn:3,reactionChoices:['narrative'],reactionControl:'manual',reactionCost:cost,resources:[{id:'mana',name:'Mana',kind:'ammo',quantity:10}],skills:[{...skillPreset('narrative'),id:'custom',name:'Custom response',description:'My response',reaction:true,reactionTiming:timing,check,dc:5,range:0,cost:2,resource:'mana',mechanics}]}).state;
 s=E.addActor(s,{id:'atk',name:'Attacker',side:'enemy',hp:30,maxHp:30,initiative:30,position:{x:3,y:1},actionsPerTurn:3,attackBonus:100,resources:[{id:'ammo',name:'Arrows',kind:'ammo',quantity:8}],weaponList:[{id:'bow',name:'Fire arrow',mode:'ranged',range:20,damage:'1d4',resource:'ammo',cost:1,effects:[{type:'burning',turns:3,damage:'2'}],...weapon}]}).state;
 s.actors[0].id='def';s.actors[1].id='atk';s=E.startCombat(s,false).state;if(cost!=='extra'){s=E.resolveAction(s,{type:'reserve',actor:'def'}).state;s=E.endTurn(s).state;}return s;
}
const attack={type:'attack',actor:'atk',target:'def',weapon:'bow'};
const decide=(s,target)=>({def:{kind:'narrative',skill:'custom',...(target?{target}:{})}});
const perform=(s,options={})=>E.resolveAction(s,attack,{roll,reactionDecisions:decide(s),...options});
const by=(s,id)=>E.findActor(s,id);
function controller(state){let bundle={state,history:[]};return createController({key:()=> 'hotfix8',read:()=>bundle,write:v=>bundle=v,save:async()=>{}});}

test('legacy attribute profiles keep base 10 even when their ignored fixed DC was 87; target DC stays independent',()=>{
 const s=scene(),target=by(s,'atk');target.stats.strength=16;
 const legacy=skillsFrom([{...skillPreset('shove'),dc:87,dcMode:'strength',dcAdjustment:1}],Object.keys(E.STATS))[0];assert.equal(legacy.dcBase,10);assert.equal(skillDefense(s,target,legacy).dc,14);
 assert.equal(skillDefense(s,target,{...legacy,dcBase:8}).dc,12);assert.equal(skillDefense(s,target,{...legacy,dcMode:'target-dc',dcBase:99}).dc,target.dc+1);
 assert.equal(skillDefense(s,target,{...legacy,dcMode:'fixed',dc:6}).dc,6);assert.equal(skillDefense(s,target,skillsFrom([{...skillPreset('aim'),dc:8,dcMode:'fixed'}],Object.keys(E.STATS))[0]).dc,8);
});
for(const statMode of ['scores','bonuses'])test('defense base, highest physical bonus and decimal adjustment in '+statMode,()=>{
 const s=scene();s.rules.statMode=statMode;const b=by(s,'atk');b.stats.strength=statMode==='scores'?16:3;b.stats.dexterity=statMode==='scores'?18:4;
 const skill={dc:91,dcBase:8.5,dcMode:'best-physical',dcAdjustment:.25},defense=skillDefense(s,b,skill);assert.equal(defense.dc,12.75);assert.equal(defense.attribute,'dexterity');assert.equal(defense.base,8.5);
 assert.match(defenseText(defense,'en'),/12.75 = 8.5 \+4/);assert.match(defenseText(skillDefense(s,null,skill),'en'),/8.5 \+ higher/);
});
test('own check UI sends its entered attribute base once and saved ability retains it',()=>{
 let s=scene(),a=by(s,'atk');const d=createCheckDrafts().get('chat',a.id);Object.assign(d,{description:'A test',dc:'8',dcMode:'strength',target:'def'});const i=checkIntent(s,a,d);assert.equal(i.dcBase,'8');const r=E.resolveAction(s,i,{roll}).result;assert.equal(r.defense.base,8);assert.match(E.resultText(r,'en'),/Defense: DC/);
 const saved=narrativeFromCheck(d,'Saved');assert.equal(saved.dcBase,'8');assert.equal(saved.dcMode,'strength');
});
test('invalid new defense bases and missing or unknown mechanical reaction timing reject atomically',()=>{
 const s=scene(),before=E.clone(s),skill=by(s,'def').skills[0];for(const value of [-1,101,'',true,1.234])assert.throws(()=>E.editActor(s,'def',{skills:[{...skill,dcMode:'strength',dcBase:value}]}));
 for(const reactionTiming of ['',null,'later'])assert.throws(()=>E.editActor(s,'def',{skills:[{...skill,reactionTiming}]}),/Reaktionszeitpunkt/);
 assert.deepEqual(s,before);assert.doesNotThrow(()=>E.editActor(s,'def',{skills:[{...skill,reaction:false,reactionTiming:''}]}));
});
test('mechanical reaction config has an enabled checkbox, required unselected timing, and synchronizes permission',()=>{
 const skill={...skillPreset('narrative'),reaction:true,mechanics:{target:'self',healing:{dice:'1d4'}}};for(const language of ['de','en']){const html=reactionFields(skill,'skill-0',language);assert(!html.includes('disabled'));assert(html.includes('required'));assert(html.includes('value=""'));assert(html.includes('value="before"'));assert(html.includes('value="after"'));}assert.deepEqual(customReactionPatch([skill],[]),{reactionChoices:['narrative']});
});
for(const timing of ['before','after'])test(timing+' cleansing uses one reaction and cost; only after removes the newly inflicted burn',()=>{
 const s=scene({timing}),before=E.clone(s);let draws=0;const r=perform(s,{roll:n=>{draws++;return roll(n);}}),b=by(r.state,'def');assert.equal(b.effects.some(e=>e.type==='burning'),timing==='before');assert.equal(b.hp,14);assert.equal(b.resources[0].quantity,8);assert(b.reactionUsed);assert.equal(by(r.state,'atk').resources[0].quantity,7);assert.equal(r.state.action.freeSpent,1);assert.equal(draws,2);assert.equal(r.result.narrativeReactions.length,1);assert.equal(r.result.narrativeReactions[0].timing,timing);assert.deepEqual(s,before);assert.equal(r.state.log.filter(e=>e.type==='hit').length,1);assert.match(E.eventText(r.state.log.find(e=>e.type==='hit'),'en'),timing==='before'?/Before/:/After/);
});
for(const timing of ['before','after'])test(timing+' healing respects execution order and maximum HP without reducing original attack damage',()=>{
 const s=scene({timing,mechanics:{target:'self',healing:{dice:'1d4'}}}),r=perform(s);assert.equal(r.result.damage,4);assert.equal(by(r.state,'def').hp,timing==='before'?16:18);assert.equal(r.result.finalHp,by(r.state,'def').hp);assert.equal(r.result.narrativeReactions[0].custom.healing.applied,timing==='before'?2:4);
});
test('failed reaction check spends mana and reaction once but applies no effect',()=>{
 const s=scene({check:true}),r=perform(s,{roll:n=>n===20?1:n});assert(!r.result.narrativeReactions[0].success);assert(by(r.state,'def').effects.some(e=>e.type==='burning'));assert.equal(by(r.state,'def').resources[0].quantity,8);assert(by(r.state,'def').reactionUsed);assert.equal(r.state.rng.cursor-s.rng.cursor,3);
});
for(const timing of ['before','after'])test(timing+' damage to the attacker is not a damage block or a reaction chain',()=>{
 const s=scene({timing,mechanics:{target:'selected',damage:{dice:'1d4'}}});by(s,'def').skills[0].range=10;const r=perform(s,{reactionDecisions:decide(s,'atk')});assert.equal(by(r.state,'atk').hp,26);assert.equal(by(r.state,'def').hp,14);assert.equal(r.result.damage,4);assert.equal(r.state.log.filter(e=>e.type==='hit').length,1);assert.equal(r.state.log.filter(e=>e.type==='reaction').length,1);
});
test('before stun can make the attack illegal: attempt and ammo spent, no attack dice, reaction recorded',()=>{
 const s=scene({timing:'before',mechanics:{target:'selected',status:{mode:'apply',type:'stunned',turns:2}}});by(s,'def').skills[0].range=10;let draws=0;const r=perform(s,{reactionDecisions:decide(s,'atk'),roll:n=>{draws++;return roll(n);}});assert(r.result.interrupted);assert.equal(draws,0);assert.equal(by(r.state,'atk').resources[0].quantity,7);assert.equal(by(r.state,'def').hp,18);assert.match(E.resultText(r.result,'en'),/interrupted/);assert.equal(r.state.log.filter(e=>e.type==='hit'||e.type==='miss').length,0);
});
test('after reaction is skipped without a new charge if the attack incapacitates or stuns its owner',()=>{
 for(const kind of ['down','stun']){const s=scene({hp:kind==='down'?2:18,weapon:kind==='stun'?{effects:[{type:'stunned',turns:2,damage:'0'}]}:{}}),r=perform(s);assert(r.result.narrativeReactions[0].skipped);assert.equal(by(r.state,'def').resources[0].quantity,10);assert(!by(r.state,'def').reactionUsed);assert.equal(r.state.log.filter(e=>e.type==='hit').length,1);}
});
test('mechanical recipients are self or incoming attacker; fixed self needs no reach to a distant attacker',()=>{
 const s=scene(),b=by(s,'def'),a=by(s,'atk');assert(E.canUseNarrativeReaction(s,b,a,b.skills[0]));assert(customReactionStatus(s,b,'en').ready);assert.deepEqual(E.reactionOptions(s,b,a)[0].targets.map(v=>v.id),['def']);
 assert.throws(()=>perform(s,{reactionDecisions:decide(s,'atk')}),/Wirkungsziel/);assert.throws(()=>perform(s,{reactionDecisions:{def:{kind:'narrative',skill:'custom',resolution:'void'}}}),/Aufhebung/);
 const selected=scene({mechanics:{target:'selected',healing:{dice:'1d4'}}});assert.deepEqual(E.reactionOptions(selected,by(selected,'def'),by(selected,'atk'))[0].targets.map(v=>v.id),['def']);
});
test('reserved normal action supports a mechanical response once; no extra own action is charged during the attack',()=>{
 const s=scene({cost:'normal'});assert(by(s,'def').reactionReserve);const r=perform(s);assert.equal(by(r.state,'def').resources[0].quantity,8);assert(!by(r.state,'def').reactionReserve);assert.equal(r.state.action.freeSpent,1);assert(by(r.state,'def').reactionUsed);
});
test('mixed area reactions retain confirmed narrative draw order and independently cleanse survivors',()=>{
 let s=scene({weapon:{radius:2}});const addition=E.addActor(s,{id:'friend',name:'Friend',side:'ally',position:{x:1,y:2},hp:20,maxHp:20,reactionChoices:['narrative'],reactionControl:'manual',skills:[{...skillPreset('narrative'),id:'story',reaction:true,range:0,dc:5}],initiative:1});s=addition.state;const prior=s.actors.at(-1).id;s.actors.at(-1).id='friend';s.order=s.order.map(id=>id===prior?'friend':id);
 const draw=E.narrativeReactionPreview(s,'friend','atk','story',{roll});const r=perform(s,{reactionDraws:{friend:draw},reactionDecisions:{...decide(s),friend:{kind:'narrative',skill:'story',resolution:'continue'}}});assert.equal(r.result.narrativeReactions.length,2);assert.equal(r.result.narrativeReactions[0].actor,'friend');assert.equal(r.result.narrativeReactions[1].actor,'def');assert.equal(by(r.state,'def').effects.length,0);assert(by(r.state,'friend').effects.some(e=>e.type==='burning'));assert.equal(r.state.log.filter(e=>e.type==='hit').length,1);
});
for(const stop of [false,true])test('controller mechanical response has one choice window, no narrative GM window; cancelled='+stop,async()=>{
 const s=scene({check:true}),c=controller(s),before=E.clone(c.state());let windows=0,draws=0;c.subscribeReactions(r=>{windows++;assert(!r.stage);c.respondReaction(stop?'cancel':{kind:'narrative',skill:'custom',target:'def'});});const r=await c.act(attack,{receipt:'once',roll:n=>{draws++;return roll(n);}});assert.equal(windows,1);
 if(stop){assert(r.cancelled);assert.equal(draws,0);assert.deepEqual(c.state(),before);}else{assert.equal(draws,3);assert.equal(by(c.state(),'def').resources[0].quantity,8);const duplicate=await c.act(attack,{receipt:'once',roll});assert(duplicate.duplicate);assert.equal(windows,1);await c.undo();assert.deepEqual(c.state().actors.map(a=>({...a,reactionTurn:0})),before.actors.map(a=>({...a,reactionTurn:0})));assert.deepEqual(c.state().rng,before.rng);assert.equal(c.state().action.freeSpent,0);}assert.equal(c.pendingReaction(),null);
});
test('reaction timing and numeric defense base survive profile and battle roundtrip',()=>{
 let s=scene();s=E.editActor(s,'def',{skills:[{...by(s,'def').skills[0],dcMode:'strength',dcBase:8}]}).state;const profile=profileFrom(exportProfiles(s,'skills','def'));assert.equal(profile.skills[0].dcBase,8);assert.equal(profile.skills[0].reactionTiming,'after');const restored=E.validateState(JSON.parse(JSON.stringify(s)));assert.deepEqual(by(restored,'def').skills,by(s,'def').skills);
});
test('two mechanical area reactions: incapacitated center skips, surviving neighbor cleanses without ending combat',()=>{
 let s=scene({hp:2,weapon:{radius:2}});s=E.addActor(s,{name:'Second reactor',side:'ally',position:{x:1,y:2},hp:20,maxHp:20,reactionChoices:['narrative'],reactionControl:'manual',skills:[{...by(s,'def').skills[0],id:'neighbor',resource:null}]}).state;const friend=s.actors.at(-1),r=perform(s,{reactionDecisions:{...decide(s),[friend.id]:{kind:'narrative',skill:'neighbor'}}});assert.equal(r.state.phase,'active');assert.equal(by(r.state,'def').resources[0].quantity,10);assert(r.result.narrativeReactions[0].skipped);assert.equal(by(r.state,friend.id).hp,18);assert.equal(by(r.state,friend.id).effects.length,0);assert(r.result.narrativeReactions[1].custom.status.changed);
});
test('critical mechanical after-damage honors global double dice and existing damage shield without another attack roll',()=>{
 let s=scene({check:true,mechanics:{target:'selected',damage:{dice:'1d4'}}});s=E.setRules(s,{natural20:true,shieldsEnabled:true,criticalDamage:'doubleDice'}).state;by(s,'def').skills[0].range=10;const a=by(s,'atk');a.shieldProfiles=[{id:'shield',name:'Ward',kind:'reduce',amount:2,turns:3,cost:0,resource:null,attackLock:false,ai:false}];a.shields=[{profile:'shield',turns:3,charges:1,appliedTurn:s.turnSerial}];let d20=0,draws=0;
 const r=perform(s,{reactionDecisions:decide(s,'atk'),roll:n=>{draws++;return n===20?(++d20===1?15:20):n;}});assert.equal(draws,5);assert.equal(d20,2);assert.equal(r.result.damage,4);assert.equal(r.result.narrativeReactions[0].custom.damage.raw,8);assert.equal(r.result.narrativeReactions[0].custom.damage.applied,6);assert.equal(by(r.state,'atk').hp,24);assert.equal(r.state.log.filter(e=>e.type==='hit').length,1);
});
