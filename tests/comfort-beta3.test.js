import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../engine.js';
import {skillsFrom,skillPreset} from '../skills.js';
import {STATUS_TYPES,CLASSIC_STATUSES} from '../status-types.js';
import {consumption,stockLabel} from '../consumption.js';
import {resourcesFrom} from '../effects.js';
import {customDraft} from '../custom-effects-ui.js';
import {checkMarkup} from '../checks-ui.js';
import {skillsMarkup,readSkills} from '../skills-ui.js';
import {abilityRestriction} from '../ability-ui.js';
import {resourceFields,readResources,openSupplies} from '../supplies-ui.js';
import {exportProfiles,profileFrom,transferPatch} from '../profiles.js';
import {planAdvancedTurn} from '../advanced-ai.js';

const supplies=()=>[{id:'stock',name:'Shared potions',kind:'ammo',quantity:5,capacity:8},{id:'drink',name:'Drink',kind:'supply',consumption:'linked',stock:'stock',quantity:99,heal:'3',range:0},{id:'throw',name:'Throw',kind:'supply',consumption:'linked',stock:'stock',quantity:0,heal:'3',range:5,recipient:'other'}];
const custom=(patch={})=>({...skillPreset('narrative'),id:'custom',name:'Special',check:false,range:5,ai:true,resource:'drink',cost:2,mechanics:{target:'other',damage:{dice:'1d4',bonus:0}},...patch});
function scene(patch={}){
 let s=E.setRules(E.emptyState(),{multiActionsEnabled:true,splitMovement:true,reactionsEnabled:true,natural20:false,statMode:'bonuses',hideNeedsTerrain:false,damageAbility:false,...patch.rules}).state;
 s=E.setBoard(s,{width:8,height:8}).state;
 for(const actor of [{name:'Tester',side:'player',control:'advanced',initiative:30,maxHp:30,hp:15,actionsPerTurn:8,position:{x:1,y:1},resources:supplies(),skills:[custom()],...patch.actor},{name:'Enemy',side:'enemy',initiative:20,maxHp:30,hp:20,position:{x:3,y:1},attackBonus:100,weaponList:[{id:'bow',name:'Bow',mode:'ranged',range:20,damage:'1d4'}],...patch.enemy},{name:'Friend',side:'ally',initiative:10,maxHp:20,hp:10,position:{x:1,y:2}}])s=E.addActor(s,actor).state;
 return E.startCombat(s,false).state;
}
const skillIntent=s=>({type:'skill',actor:s.actors[0].id,target:s.actors[1].id,skill:'custom'});
const noRoll=()=>{throw Error('Must not roll');};
test('linked supply, indirect ability and own check each spend only the ultimate shared stock',()=>{
 let s=scene();
 for(const intent of [{type:'use',actor:s.actors[0].id,resource:'drink'},skillIntent(s),{type:'check',actor:s.actors[0].id,description:'Quick trial',stat:'strength',bonus:0,dc:1,resource:'throw',cost:1}]){
   s=E.resolveAction(s,intent,{roll:n=>n===20?15:2}).state;
 }
 assert.deepEqual(s.actors[0].resources.map(r=>r.quantity),[1,99,0]);assert.equal(s.action.freeSpent,3);E.validateState(s);
 assert.equal(consumption(s,s.actors[0],s.actors[0].skills[0]).available,false);
 const old=E.clone(s);assert.throws(()=>E.resolveAction(s,skillIntent(s),{roll:noRoll}));assert.deepEqual(s,old);
});
test('failed skill pays its own configured cost once from linked stock; supply cost is not added',()=>{
 let s=scene({actor:{skills:[custom({check:true,dc:99})]}});s.actors[0].resources[1].cost=4;
 const r=E.resolveAction(s,skillIntent(s),{roll:()=>2});assert.equal(r.result.success,false);assert.deepEqual(r.state.actors[0].resources.map(v=>v.quantity),[3,99,0]);assert.equal(r.state.actors[1].hp,20);
});
test('unlimited supplies selected indirectly stay unlimited, while direct ammo and own supplies retain stock semantics',()=>{
 const s=scene(),a=s.actors[0];a.resources[1].consumption='none';assert.equal(consumption(s,a,a.skills[0]).cost,0);
 a.resources[1].consumption='own';assert.equal(consumption(s,a,a.skills[0]).stock.id,'drink');
 assert.equal(consumption(s,a,{resource:'stock',cost:1}).stock.id,'stock');assert.equal(consumption(s,a,{resource:'missing',cost:1}).available,false);
 assert.equal(consumption({...s,rules:{...s.rules,resourcesEnabled:false}},a,a.skills[0]).cost,0);
});
test('only-other resource works on an ally or enemy, rejects self without dice or payment',()=>{
 const s=scene(),a=s.actors[0],item=a.resources[2];assert(!E.canUseResource(s,a,a,item));
 for(const b of s.actors.slice(1)){assert(E.canUseResource(s,a,b,item));const r=E.resolveAction(s,{type:'use',actor:a.id,target:b.id,resource:item.id},{roll:noRoll});assert.equal(r.state.actors[0].resources[0].quantity,4);assert.equal(E.findActor(r.state,b.id).hp,b.hp+3);}
 assert.throws(()=>E.resolveAction(s,{type:'use',actor:a.id,target:a.id,resource:item.id},{roll:noRoll}));assert.equal(a.resources[0].quantity,5);
});
test('only-other area healing excludes caster for coordinate centers and still pays once',()=>{
 const s=scene(),a=s.actors[0],item=a.resources[2];Object.assign(item,{radius:2,falloff:'uniform'});
 const r=E.resolveAction(s,{type:'use',actor:a.id,resource:item.id,center:a.position},{roll:noRoll});assert.equal(r.state.actors[0].hp,15);assert.equal(r.state.actors[1].hp,23);assert.equal(r.state.actors[2].hp,13);assert.equal(r.state.actors[0].resources[0].quantity,4);assert(!r.result.affected.some(b=>b.id===a.id));
 item.recipient='self';assert.deepEqual(E.healingTargets(s,a,item,a.position).map(v=>v.actor.id),[a.id]);assert.equal(E.healingTargets(s,a,item,s.actors[1].position).length,0);
});
test('only-other custom mechanics reject self with and without board; target DC still belongs to target',()=>{
 for(const boardEnabled of [false,true]){const s=scene({rules:{boardEnabled}}),a=s.actors[0],before=E.clone(s);assert(!E.canUseSkill(s,a,a,a.skills[0]));assert.throws(()=>E.resolveAction(s,{...skillIntent(s),target:a.id},{roll:noRoll}));assert.deepEqual(s,before);}
 let s=scene({actor:{skills:[custom({check:true,dcMode:'target-dc',bonus:0})]}});s=E.editActor(s,s.actors[1].id,{dc:99}).state;const r=E.resolveAction(s,skillIntent(s),{roll:()=>15});assert.equal(r.result.dc,99);assert.equal(r.result.success,false);
});
test('pure narrative custom abilities also support self-only and other-only recipients',()=>{
 for(const recipient of ['self','other']){const s=scene({actor:{skills:[custom({mechanics:null,recipient,ai:false})]}}),a=s.actors[0];assert.equal(E.canUseSkill(s,a,a,a.skills[0]),recipient==='self');assert.equal(E.canUseSkill(s,a,s.actors[1],a.skills[0]),recipient==='other');}
});
for(const prerequisite of ['hidden',...Object.keys(STATUS_TYPES)])test('custom prerequisite '+prerequisite+' is enforced before dice/cost and follows the active condition module',()=>{
 let s=scene({actor:{skills:[custom({prerequisite})]}}),a=s.actors[0],before=E.clone(s);assert(!E.canUseSkill(s,a,s.actors[1],a.skills[0]));assert.throws(()=>E.resolveAction(s,skillIntent(s),{roll:noRoll}),/Voraussetzung/);assert.deepEqual(s,before);
 if(prerequisite==='hidden')s=E.editActor(s,a.id,{hidden:{turns:3,appliedTurn:s.turnSerial}}).state;
 else if(Object.hasOwn(CLASSIC_STATUSES,prerequisite))s=E.editActor(s,a.id,{effects:[{type:prerequisite,turns:3,damage:'0'}]}).state;
 else s=E.editActor(s,a.id,{tactics:[{type:prerequisite,turns:3,source:s.actors[1].id}]}).state;
 a=s.actors[0];assert(E.skillRequirementMet(s,a,a.skills[0]));
 const inactive=E.clone(s);inactive.rules[prerequisite==='hidden'?'stealthEnabled':Object.hasOwn(CLASSIC_STATUSES,prerequisite)?'effectsEnabled':'skillsEnabled']=false;assert(!E.skillRequirementMet(inactive,inactive.actors[0],a.skills[0]));
 // Stunned still blocks acting, even though its prerequisite is satisfied.
 if(prerequisite==='stunned'){assert(!E.canUseSkill(s,a,s.actors[1],a.skills[0]));return;}
 // Frightened also imposes its independent movement-before-offense restriction.
 const ability={...a.skills[0],mechanics:{target:'self',healing:{dice:'1d4',bonus:0}}};s=E.editActor(s,a.id,{skills:[ability]}).state;
 const r=E.resolveAction(s,{...skillIntent(s),target:a.id},{roll:()=>2});assert(r.result.success);assert.equal(r.state.actors[0].resources[0].quantity,3);
 if(prerequisite==='hidden')assert(r.state.actors[0].hidden);else assert([...r.state.actors[0].effects,...r.state.actors[0].tactics].some(v=>v.type===prerequisite));
});
test('profile export/import retains prerequisites, target restrictions and shared stock dependencies',()=>{
 const s=scene({actor:{skills:[custom({prerequisite:'bleeding'})]}}),a=s.actors[0],profile=profileFrom(exportProfiles(s,'skills',a.id));assert.equal(profile.resources.length,2);assert(profile.resources.some(v=>v.id==='stock'));assert.equal(profile.skills[0].prerequisite,'bleeding');assert.equal(profile.skills[0].mechanics.target,'other');
 const patch=transferPatch(s.actors[2],profile,'append');const receiver=E.editActor(s,s.actors[2].id,patch).state.actors[2],ability=receiver.skills.find(v=>v.prerequisite==='bleeding');assert.equal(consumption(s,receiver,ability).stock.name,'Shared potions');
 const legacy=skillsFrom([skillPreset('narrative')],Object.keys(E.STATS));assert(!legacy[0].prerequisite);assert(!legacy[0].recipient);assert.throws(()=>skillsFrom([custom({prerequisite:'invented'})],Object.keys(E.STATS),a.resources));assert.throws(()=>resourcesFrom([{...supplies()[2],recipient:'enemy'}],E.parseDice));
});
test('prerequisite applies to own check profile and advanced AI selection too',()=>{
 const s=scene({actor:{skills:[custom({prerequisite:'bleeding'})]}}),a=s.actors[0];assert.throws(()=>E.resolveAction(s,{type:'check',actor:a.id,target:s.actors[1].id,effect:'custom',stat:'intelligence',description:'Use gated ability',dc:0,bonus:0},{roll:noRoll}),/Voraussetzung/);
 const plan=planAdvancedTurn(s);assert(plan.intent.type!=='skill'||plan.intent.skill!=='custom');
});
for(const timing of ['before','after'])test('gated '+timing+' reaction checks prerequisite again and never double-pays linked stock',()=>{
 let s=scene({actor:{control:'manual',reactionChoices:['narrative'],reactionControl:'auto',reactionCost:'extra',effects:[{type:'bleeding',turns:3,damage:'0'}],skills:[custom({prerequisite:'bleeding',reaction:true,reactionTiming:timing,mechanics:{target:'self',healing:{dice:'1d4',bonus:0}}})]}});const id=s.actors[0].id;s=E.endTurn(s).state;const [defender,attacker]=s.actors;
 assert(E.reactionOptions(s,defender,attacker).some(v=>v.skill==='custom'));
 const r=E.resolveAction(s,{type:'attack',actor:attacker.id,target:id,weapon:'bow'},{roll:n=>n===20?15:2,reactionDecisions:{[id]:{kind:'narrative',skill:'custom',target:id}}});assert.equal(r.result.narrativeReactions.length,1);assert.equal(r.state.actors[0].reactionSpent,1);assert.deepEqual(r.state.actors[0].resources.map(v=>v.quantity),[3,99,0]);
 const missing=E.editActor(s,id,{effects:[]}).state;assert(!E.reactionOptions(missing,missing.actors[0],missing.actors[1]).some(v=>v.skill==='custom'));
});
test('after reaction requiring Hidden is skipped after damage reveals caster and costs no stock/reaction',()=>{
 let s=scene({actor:{reactionChoices:['narrative'],reactionControl:'manual',reactionCost:'extra',hidden:{turns:3,appliedTurn:0},skills:[custom({prerequisite:'hidden',reaction:true,reactionTiming:'after',mechanics:{target:'self',healing:{dice:'1d4',bonus:0}}})]}});
 // An area hit on the visible friend also damages the hidden neighbor.
 s=E.editActor(s,s.actors[1].id,{weaponList:[{id:'bow',name:'Blast',mode:'ranged',range:20,damage:'1d4',radius:2,falloff:'uniform'}]}).state;s=E.endTurn(s).state;const [b,a,friend]=s.actors;assert(E.reactionOptions(s,b,a).some(v=>v.skill==='custom'));
 const r=E.resolveAction(s,{type:'attack',actor:a.id,target:friend.id,weapon:'bow'},{roll:n=>n===20?15:2,reactionDecisions:{[b.id]:{kind:'narrative',skill:'custom',target:b.id}}});assert(r.result.narrativeReactions[0].skipped);assert.equal(r.state.actors[0].reactionSpent,0);assert.equal(r.state.actors[0].resources[0].quantity,5);
});
for(const language of ['de','en'])test(language+' editor shows true shared stock, other-only, prerequisites, jump/shove distances and automatic success explanation',()=>{
 const s=scene(),a=s.actors[0],html=skillsMarkup(a,[...a.skills,skillPreset('jump'),skillPreset('shove')],language,s.rules);assert(html.includes('Shared potions · 5 / 8'));assert(!html.includes('Drink · 99'));assert(html.includes('value="other"'));assert(html.includes('name="skill-0-prerequisite"'));assert(html.includes(language==='en'?'Jump distance (cells)':'Sprungweite (Felder)'));assert(html.includes(language==='en'?'shove distance: 1 cell':'Schubsen: 1 Feld'));assert(html.includes(language==='en'?'automatic success':'automatischer Erfolg'));assert.match(html,/<select name="skill-0-dcMode" disabled>/);
 const fields=resourceFields(a.resources,language);assert.equal((fields.match(/data-resource-id=/g)??[]).length,3);assert(!fields.includes('name="resource-1-quantity"'));assert(!fields.includes('name="resource-2-quantity"'));const read=readResources(new Map(),a.resources);assert.equal(read[1].quantity,99);assert.equal(read[2].quantity,0);
 const d={...customDraft({target:'other',damage:{dice:'1d4',bonus:0}}),mode:'paid',effect:'',description:'Test',stat:'intelligence',bonus:'0',dc:'15',dcMode:'fixed',dcAdjustment:'0',actionSource:'auto',target:a.id,resource:'drink',cost:1};const check=checkMarkup(s,a,d,language);assert(!check.includes('<option value="'+a.id+'"'));assert(check.includes('Shared potions · 5 / 8'));assert(!check.includes('Drink · 99'));
 const gated=custom({prerequisite:'bleeding'});assert(abilityRestriction(s,a,s.actors[1],gated,language).includes(STATUS_TYPES.bleeding[language]));
});
test('disabling a check preserves the edited defense values, and mechanical recipient follows single ability selector',()=>{
 const skill=custom({check:true,dc:17,dcMode:'strength',dcBase:12,dcAdjustment:2}),data=new Map([['skill-0-name','Special'],['skill-0-stat','intelligence'],['skill-0-range','5'],['skill-0-turns','1'],['skill-0-bonus','0'],['skill-0-recipient','other'],['skill-0-prerequisite','hidden']]);const draft=readSkills(data,[skill])[0];assert.equal(draft.check,false);assert.equal(draft.dcBase,12);assert.equal(draft.dcAdjustment,2);assert.equal(draft.dcMode,'strength');assert.equal(draft.mechanics.target,'other');assert.equal(draft.prerequisite,'hidden');
});

// Focus/scroll checks use a small DOM contract, with no browser or layout emulation.
for(const language of ['de','en'])test(language+' resource editor keeps dialog, untouched status drafts, fold state and scroll while changing source',async()=>{
 const s=scene(),a=s.actors[0],values=new Map(),events={},folds=a.resources.map((r,i)=>({dataset:{resourceId:r.id},open:i!==0,querySelector(){return null;}})),body={scrollTop:460},input={name:'resource-1-consumption',type:'select-one',focus(options){assert(options.preventScroll);this.focused=true;}},host={innerHTML:'',querySelectorAll(q){return q==='details[data-resource-id]'?folds:q==='input,select,textarea,button'?[input]:[];}},form={addEventListener(n,f){events[n]=f;},querySelectorAll(q){return host.querySelectorAll(q);}},d={scrollTop:220,querySelector(q){return q==='form'?form:q==='[data-resource-entries]'?host:q==='.ct-editor-body'?body:null;}};
 let dialogs=0,saved;const c={chatKey:()=>1,state:()=>s,preferences:()=>({language}),edit:async(_id,patch)=>{saved=patch;}};const original=globalThis.FormData;globalThis.FormData=class{constructor(){return values;}};
 try{openSupplies(c,a,(_title,html,save)=>{dialogs++;d.html=html;d.save=save;return d;});values.set('resource-1-consumption','own');events.change({target:input});assert.equal(dialogs,1);assert(input.focused);assert.equal(body.scrollTop,460);assert.equal(d.scrollTop,220);assert.match(host.innerHTML,/data-resource-id="drink" open/);assert(host.innerHTML.includes('name="resource-1-quantity" value="99"'));values.set('resource-1-quantity','6');events.change({target:{name:'resource-1-quantity'}});values.set('actor-effect-bleeding-turns','3');values.set('actor-effect-bleeding','on');await d.save();assert.equal(saved.resources[1].quantity,6);assert(saved.effects.some(v=>v.type==='bleeding'));assert.equal(dialogs,1);}finally{globalThis.FormData=original;}
});
