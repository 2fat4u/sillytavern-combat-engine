import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../engine.js';
import { resourcesFrom } from '../effects.js';
import { damageItemPreset,damageItemFields,readDamageItems,resourceFields } from '../supplies-ui.js';
import { exportProfiles,profileFrom,weaponProfilePatch } from '../profiles.js';
import { planAdvancedTurn } from '../advanced-ai.js';
import { createController } from '../controller.js';

function scene(strength=14,weapon={}){
 let s=E.emptyState();s.board={...s.board,width:14,height:10};s.rules=E.rulesFrom({...s.rules,stancesEnabled:false,splitMovement:true,multiActionsEnabled:true,perceptionRange:true,statMode:'scores',natural20:false,rngMode:'seeded',seed:'throwing-beta4'});
 s.actors=[E.actorFrom({id:'hero',name:'Thrower',side:'player',initiative:100,position:{x:1,y:3},stats:{strength,perception:18},resources:[{id:'flasks',name:'Flasks',kind:'ammo',quantity:3}],weaponList:[{id:'flask',name:'Flask',mode:'ranged',range:4,strengthRange:true,consumable:true,damage:'1d4',damageType:'fire',resource:'flasks',...weapon}]},true),E.actorFrom({id:'foe',name:'Target',side:'enemy',position:{x:7,y:3},hp:30,maxHp:30},true)];
 return E.startCombat(E.validateState(s)).state;
}
test('positive Strength replaces Perception for an explicitly configured throwing weapon',()=>{
 const s=scene(),a=s.actors[0],w=E.weaponFor(a);assert.deepEqual(E.rangeCalculation(s,a,w,true),{base:4,bonus:2,stat:'strength',total:6});assert(E.canAttack(s,a,s.actors[1],'ranged'));assert.match(E.rangeText(s,a,w,'en',true),/4 \+ 2 STR = 6 cells/);
});
test('negative throwing modifiers shorten range with a minimum of one cell',()=>{
 for(const [score,total] of [[8,3],[6,2],[1,1]]){const s=scene(score);assert.equal(E.effectiveRange(s,s.actors[0],E.weaponFor(s.actors[0])),total);assert(!E.canAttack(s,s.actors[0],s.actors[1],'ranged'));}
});
test('modifier-valued attributes use their signed integer Strength modifier',()=>{
 const s=scene();s.rules.statMode='bonuses';s.actors[0].stats.strength=-1;assert.equal(E.effectiveRange(s,s.actors[0],E.weaponFor(s.actors[0])),3);
});
test('legacy weapons and melee keep their existing range rules',()=>{
 const s=scene(14,{strengthRange:false}),a=s.actors[0];assert.equal(E.effectiveRange(s,a,E.weaponFor(a)),8);assert.equal(E.effectiveRange(s,a,{range:1,mode:'melee',strengthRange:true}),1);
});
test('a standard weapon variant inherits the same throwing range',()=>{
 const s=scene(14,{standard:{damage:'1d4'}}),a=s.actors[0];assert.equal(E.effectiveRange(s,a,E.weaponFor(a,'ranged','standard')),6);
});
test('unmarked limited weapons keep the legacy standard variant; consumables do not gain a free one',()=>{
 assert.equal(E.weaponFor(scene().actors[0]).standard,null);const s=scene(14,{consumable:false});assert(E.weaponFor(s.actors[0]).standard);
});
test('invalid range/consumable switches are rejected rather than silently enabled',()=>{
 for(const key of ['strengthRange','consumable'])assert.throws(()=>scene(14,{[key]:'true'}));assert.throws(()=>resourcesFrom([{name:'Potion',strengthRange:'true'}],E.parseDice));
});
test('out-of-range throwing attempts are atomic and a valid miss spends the shared stock once',()=>{
 const s=scene(8),before=E.clone(s);assert.throws(()=>E.resolveAction(s,{type:'attack',actor:'hero',target:'foe',weapon:'flask'}));assert.deepEqual(s,before);
 const valid=scene();valid.actors[1].dc=99;const r=E.resolveAction(valid,{type:'attack',actor:'hero',target:'foe',weapon:'flask'},{roll:()=>1});assert.equal(r.result.hit,false);assert.equal(r.state.actors[0].resources[0].quantity,2);assert.equal(r.state.action.freeSpent,1);
});
test('flask damage uses the normal resistance path and costs one item',()=>{
 const s=scene();s.actors[0].attackBonus=99;s.actors[1].damageResistances=['fire'];const r=E.resolveAction(s,{type:'attack',actor:'hero',target:'foe',weapon:'flask'},{roll:n=>n===20?10:4});assert.equal(r.result.damage,2);assert.equal(r.state.actors[1].hp,28);assert.equal(r.state.actors[0].resources[0].quantity,2);
});
test('healing throws, target lists and area centers use the same effective range',()=>{
 let s=scene(),a=s.actors[0];a.resources=resourcesFrom([{id:'heal',name:'Heal',kind:'supply',quantity:3,heal:'1d4',range:4,radius:1,strengthRange:true}],E.parseDice);const item=a.resources[0];s.actors[1].side='ally';s.actors[1].hp=10;
 assert.equal(E.resourceRange(s,a,item),6);assert(E.canUseResource(s,a,s.actors[1],item));assert.equal(E.healingTargets(s,a,item,{x:7,y:3}).length,1);assert.equal(E.healingTargets(s,a,item,{x:8,y:3}).length,0);
 const r=E.resolveAction(s,{type:'use',actor:'hero',resource:'heal',center:{x:7,y:3}},{roll:()=>4});assert.equal(r.state.actors[1].hp,14);assert.equal(r.state.actors[0].resources[0].quantity,2);
});
test('zero-range supplies remain self-only and a throwing modifier never changes area radius',()=>{
 const s=scene(),a=s.actors[0],item=resourcesFrom([{name:'Self',quantity:2,heal:'1d4',range:0,radius:0,strengthRange:true}],E.parseDice)[0];assert.equal(E.resourceRange(s,a,item),0);assert(!E.canUseResource(s,a,s.actors[1],item));
 const area={...item,range:4,radius:1};assert.equal(E.resourceRange(s,a,area),6);assert.equal(area.radius,1);
});
test('Advanced AI uses the thrown reach instead of approaching a target already in range',()=>{
 const s=scene();s.actors[0].control='advanced';s.actors[0].aiConfig.retreat=false;const p=planAdvancedTurn(s);assert.equal(p.intent.type,'attack');assert.equal(p.intent.weapon,'flask');assert.equal(p.move,null);
});
test('normalizing, full actor profiles and weapon profiles preserve item flags and shared dependencies',()=>{
 const s=scene();assert.deepEqual(E.validateState(JSON.parse(JSON.stringify(s))),s);const actor=profileFrom(exportProfiles(s,'actor','hero')).actors[0];assert(actor.weaponList[0].strengthRange);assert(actor.weaponList[0].consumable);
 const p=profileFrom(exportProfiles(s,'weapons','hero')),patch=weaponProfilePatch(s.actors[1],p),w=patch.weaponList[0];assert(w.strengthRange&&w.consumable);assert(patch.resources.some(r=>r.id===w.resource));assert.equal(w.standard,null);
});
for(const language of ['de','en'])test(language+' flask presets and common editor expose attacks and one shared stock',()=>{
 const acid=damageItemPreset('acid',language),fire=damageItemPreset('fire',language);assert.equal(acid.weapon.damageType,'acid');assert.equal(fire.weapon.damageType,'fire');assert.equal(acid.weapon.resource,acid.stock.id);assert.equal(acid.weapon.standard,null);
 const html=damageItemFields([acid.weapon,{...acid.weapon,id:'second',resource:acid.stock.id}],[acid.stock],language),stockName='name="damage-stock-'+acid.stock.id+'-quantity"';assert.equal(html.split(stockName).length-1,1);assert(html.includes('damage-item-0-damage'));assert(html.includes('damage-item-0-strengthRange'));
 assert.equal(resourceFields([acid.stock],language,null,{damageStocks:new Set([acid.stock.id])}),'');
});
test('common editor saves a stock and attack together without changing an ordinary weapon',async()=>{
 let s=scene();const a=s.actors[0],ordinary={...a.weaponList[0],id:'bow',name:'Bow',consumable:false};a.weaponList.push(ordinary);const item=a.weaponList[0];const data=new Map([['damage-stock-flasks-name','Fire stock'],['damage-stock-flasks-quantity','7'],['damage-stock-flasks-capacity','10'],['damage-item-0-name','Fire bomb'],['damage-item-0-range','5'],['damage-item-0-strengthRange-present','1'],['damage-item-0-strengthRange','on'],['damage-item-0-stat','dexterity'],['damage-item-0-hit','1'],['damage-item-0-damage','2d4'],['damage-item-0-type','fire'],['damage-item-0-bonus','2'],['damage-item-0-radius','1'],['damage-item-0-stock','flasks'],['damage-item-0-cost','2']]);
 const before=E.clone(a),patch=readDamageItems(data,a.weaponList,a.resources);assert.deepEqual(a,before);assert.deepEqual(patch.weaponList[1],ordinary);assert.equal(patch.resources[0].quantity,7);assert.equal(patch.weaponList[0].damage,'2d4');
 let bundle={state:s,history:[]};const c=createController({key:()=> 'items',read:()=>bundle,write:v=>{bundle=v;},save:async()=>{}});await c.edit('hero',patch);assert.equal(c.state().actors[0].resources[0].quantity,7);await c.undo();assert.deepEqual(c.state().actors[0].weaponList,a.weaponList);
});
test('missing shared stock is rejected before the common editor can produce a partial patch',()=>{
 const s=scene(),a=s.actors[0],before=E.clone(a);assert.throws(()=>readDamageItems(new Map([['damage-item-0-name','Broken'],['damage-item-0-stock','absent']]),a.weaponList,a.resources));assert.deepEqual(a,before);
});
test('imported stock IDs and item names are escaped in the common editor',()=>{
 const item=damageItemPreset('acid','en');item.stock.id='stock" autofocus="x';item.weapon.resource=item.stock.id;item.weapon.name='<img src=x onerror=alert(1)>';
 const html=damageItemFields([item.weapon],[item.stock],'en');assert(html.includes('name="damage-stock-stock&quot; autofocus=&quot;x-quantity"'));assert(!html.includes('name="damage-stock-stock" autofocus='));assert(!html.includes('<img src=x'));assert(html.includes('&lt;img'));
});
