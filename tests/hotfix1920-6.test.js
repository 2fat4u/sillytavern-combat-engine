import test from 'node:test';import assert from 'node:assert/strict';
import * as E from '../engine.js';import {skillPreset} from '../skills.js';import {createController} from '../controller.js';
import {customReactionStatus,customReactionStatusMarkup} from '../reaction-diagnostics.js';
import {mountPreviewStorage,createPreviewStorage} from '../preview-storage.js';
function scene(cost='extra',control='manual',range=0){
 let s=E.setRules(E.emptyState(),{reactionsEnabled:true,splitMovement:true,multiActionsEnabled:true,natural20:false,rngMode:'seeded',seed:'react-self'}).state;
 s=E.addActor(s,{name:'Nadir',side:'player',initiative:20,position:{x:1,y:1},hp:30,maxHp:30,actionsPerTurn:2,reactionChoices:['narrative'],reactionControl:control,reactionCost:cost,resources:[{id:'mana',name:'Mana',kind:'ammo',quantity:5}],skills:[{...skillPreset('narrative'),id:'concentrate',name:'Concentrate',description:'I concentrate to respond',reaction:true,range,dc:5,resource:'mana',cost:1}]}).state;
 s=E.addActor(s,{name:'Goblin',side:'enemy',initiative:10,position:{x:7,y:1},hp:30,maxHp:30,weaponList:[{id:'bow',name:'Bow',mode:'ranged',range:20,damage:'1d4'}]}).state;return E.startCombat(s,false).state;
}
test('self custom reaction at range zero is offered against a distant attacker and resolves once',()=>{
 let s=E.endTurn(scene()).state;const [a,b]=s.actors,skill=a.skills[0];assert(E.canUseNarrativeReaction(s,a,b,skill));assert(E.reactionOptions(s,a,b).some(v=>v.skill===skill.id));const draw=E.narrativeReactionPreview(s,a.id,b.id,skill.id,{roll:()=>20});assert(draw.result.success);const r=E.resolveAction(s,{type:'attack',actor:b.id,target:a.id,weapon:'bow'},{roll:n=>n,reactionDraws:{[a.id]:draw},reactionDecisions:{[a.id]:{kind:'narrative',skill:skill.id,resolution:'continue'}}});assert.equal(r.result.narrativeReactions.length,1);assert.equal(r.state.actors[0].resources[0].quantity,4);assert(r.state.actors[0].reactionUsed);assert.equal(r.state.log.filter(v=>v.type==='hit'||v.type==='miss').length,1);
});
test('nonzero custom reaction range still requires the attacker to be within reach',()=>{
 const s=scene('extra','manual',1),[a,b]=s.actors;assert(!E.canUseNarrativeReaction(s,a,b,a.skills[0]));assert(!E.reactionOptions(s,a,b).some(v=>v.kind==='narrative'));assert.match(customReactionStatus(s,a,'en').issues.join(' '),/range/);
});
for(const language of ['de','en'])test('reaction readiness '+language+' explains actual normal reservation and automatic-control blockers',()=>{
 let s=scene('normal','auto');let r=customReactionStatus(s,s.actors[0],language);assert(!r.ready);assert.equal(r.issues.length,2);assert(r.canReserve);assert.match(r.issues.join(' '),language==='en'?/Choosing the cost source alone/:/Kostenwahl allein/);assert.match(r.issues.join(' '),language==='en'?/Automatic control/:/Automatik/);
 s=E.editActor(s,s.actors[0].id,{reactionControl:'manual'}).state;s=E.resolveAction(s,{type:'reserve',actor:s.actors[0].id}).state;r=customReactionStatus(s,s.actors[0],language);assert(r.ready);assert.equal(r.reachable.length,1);assert.match(customReactionStatusMarkup(s,s.actors[0],language),language==='en'?/ready to ask/:/bereit für Nachfrage/);
});
test('readiness does not reject all profiles because one other profile is unaffordable',()=>{
 let s=scene();s=E.editActor(s,s.actors[0].id,{skills:[...s.actors[0].skills,{...s.actors[0].skills[0],id:'expensive',cost:100}]}).state;assert(customReactionStatus(s,s.actors[0]).ready);s=E.editActor(s,s.actors[0].id,{resources:[{id:'mana',name:'Mana',kind:'ammo',quantity:0}]}).state;assert.match(customReactionStatus(s,s.actors[0],'en').issues.join(' '),/Insufficient stock/);
});
test('readiness identifies a Basic-controlled actor inheriting automatic reactions',()=>{
 let s=scene('extra','inherit');s=E.editActor(s,s.actors[0].id,{control:'basic'}).state;assert.match(customReactionStatus(s,s.actors[0],'en').issues.join(' '),/Automatic control/);
});
for(const stage of ['choice','result'])test('failed reaction '+stage+' renderer stops attack without spending, drawing or silently continuing',async()=>{
 let bundle={state:E.endTurn(scene()).state,history:[]};const c=createController({key:()=> 'test',read:()=>bundle,write:v=>{bundle=v;},save:async()=>{}}),before=E.clone(c.state()),[a,b]=c.state().actors;
 c.subscribeReactions(request=>{if(stage==='choice'||request.stage==='narrative-result')throw Error('dialog failed');c.respondReaction({kind:'narrative',skill:'concentrate'});});
 await assert.rejects(c.act({type:'attack',actor:b.id,target:a.id,weapon:'bow'},{roll:()=>20}),/dialog failed/);assert.deepEqual(c.state(),before);assert.equal(c.pendingReaction(),null);
});
class Element{constructor(){this.innerHTML='';this.events={};this.children=[];}append(e){this.children.push(e);}addEventListener(n,f){(this.events[n]??=[]).push(f);}async emit(n,e){for(const f of this.events[n]??[])await f(e);}showModal(){}remove(){}}
test('storage checkbox and label clicks never rebuild controls before native activation/change',async()=>{
 const previous=globalThis.document;try{const doc={body:new Element(),createElement:()=>new Element()};globalThis.document=doc;const key='ct-combat-demo-v1',old='ct-adventure-testpack-199-v1',data=new Map([[old,'{}']]),storage={get length(){return data.size;},key:i=>[...data.keys()][i],getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)},bundle={state:{},history:[]};const store=createPreviewStorage({storage:()=>storage,key,getBundle:()=>bundle,setBundle:()=>{}});mountPreviewStorage(store,{getBundle:()=>bundle});const bar=doc.body.children[0];await bar.emit('click',{target:{closest:q=>q==='[data-storage-open]'?{}:null}});const dialog=doc.body.children[1],before=dialog.innerHTML;
 for(const kind of ['checkbox','label','confirmation-checkbox']){await dialog.emit('click',{target:{kind,closest:()=>null}});assert.equal(dialog.innerHTML,before);}
 await dialog.emit('change',{target:{dataset:{storageKey:old},checked:true}});assert(dialog.innerHTML.includes('data-storage-key="'+old+'" checked'));assert(!dialog.innerHTML.includes('data-storage-key="'+old+'" disabled'));
 }finally{globalThis.document=previous;}
});
