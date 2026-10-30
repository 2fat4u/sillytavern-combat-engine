import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../engine.js';
import {movementThreatMarkup} from '../defense-ui.js';
import {statusMarkers} from '../status-ui.js';
import {skillPreset} from '../skills.js';
const roll=n=>n===20?15:2;
function scene({hero={},guard={},ally={},board={},rules={}}={}){
 let s=E.emptyState();s.rules=E.rulesFrom({...s.rules,opportunityEnabled:true,reactionsEnabled:true,multiActionsEnabled:true,splitMovement:true,movementBase:6,movementStat:'none',stancesEnabled:false,rngMode:'seeded',seed:'warning',...rules});s.board={...s.board,width:14,height:16,blocked:[{x:10,y:13}],...board};
 s.actors=[{id:'hero',name:'Hero',side:'player',initiative:100,position:{x:9,y:13},...hero},{id:'guard',name:'Guard',side:'enemy',reactionControl:'auto',initiative:50,position:{x:8,y:11},weaponList:[{id:'sword',name:'Sword',mode:'melee',damage:'1d4',range:9}],...guard},{id:'friend',name:'Friend',side:'ally',initiative:20,position:{x:8,y:13},...ally}].map(a=>E.actorFrom({hp:20,maxHp:20,dc:10,...a},true));return E.startCombat(E.validateState(s)).state;
}
function warning(s,to={x:10,y:12}){const flow=E.movementFlow(s,'hero',to,{roll}),next=flow.next();assert(!next.done);assert.equal(next.value.stage,'movement');return next.value;}
test('two-cell separation throughout the entire chosen path never triggers, regardless of melee range field',()=>{
 const s=scene({guard:{position:{x:11,y:13}}}),a=s.actors[0],p={x:9,y:10},path=E.movementPaths(s,a.position,a.id,6).pathTo(p);assert(path.every(v=>E.distance(v,s.actors[1].position)>=2));const r=E.moveActor(s,'hero',p,false,{roll});assert.equal(r.result.opportunities.length,0);assert.equal(r.state.actors[0].hp,20);assert.equal(r.state.actors[1].reactionSpent,0);
});
for(const [side,other] of [['player','ally'],['ally','player'],['enemy','enemy']])test(side+' cannot be attacked by a directly adjacent '+other+' on its own team',()=>{
 const s=scene({hero:{side,position:{x:9,y:12}},guard:{side:other},ally:{side:side==='enemy'?'player':'enemy',position:{x:13,y:15}}});assert.equal(E.opportunityChoices(s,s.actors[0],{x:10,y:12}).length,0);const r=E.moveActor(s,'hero',{x:10,y:12},false,{roll});assert.equal(r.result.opportunities.length,0);
});
test('cardinal and diagonal departures require exactly one adjacent cell',()=>{
 for(const p of [{x:8,y:12},{x:8,y:11}]){const s=scene({hero:{position:{x:9,y:12}},guard:{position:p}}),q=E.opportunityChoices(s,s.actors[0],{x:10,y:12});assert.equal(q.length,1);assert.equal(q[0].distance,1);}
});
test('warning identifies a forced intermediate departure instead of implying adjacency at the start',()=>{
 const s=scene(),before=E.clone(s),path=E.movementPaths(s,s.actors[0].position,'hero',6).pathTo({x:10,y:12});assert.deepEqual(path,[{x:9,y:13},{x:9,y:12},{x:10,y:12}]);const q=warning(s);assert.equal(q.origin,'J14');assert.equal(q.from,'J13');assert.equal(q.stepTo,'K13');assert.equal(q.to,'K13');assert.deepEqual(q.threats,[{id:'guard',name:'Guard',at:'I12',from:'J13',to:'K13',distance:1}]);assert.deepEqual(s,before);
});
test('committed opportunity result and both log languages retain the actual adjacent departure',()=>{
 const s=scene(),r=E.moveActor(s,'hero',{x:10,y:12},false,{roll}),hit=r.result.opportunities[0];assert.equal(hit.opportunityFrom,'J13');assert.equal(hit.opportunityTo,'K13');assert.equal(hit.opportunityAttackerAt,'I12');assert.equal(hit.opportunityDistance,1);for(const language of ['de','en']){const text=E.eventText(r.state.log.find(e=>e.details.opportunity),language);assert(text.includes('J13 → K13'));assert(text.includes('I12'));assert(text.includes(language==='en'?'directly adjacent (1 cell)':'direkt benachbart (1 Feld)'));}E.validateState(r.state);
});
test('jump/check preview carries the same per-enemy departure coordinates before rolling',()=>{
 const s=scene({hero:{position:{x:2,y:2},skills:[{...skillPreset('jump','en'),id:'jump',range:3}]},guard:{position:{x:3,y:2}},ally:{position:{x:1,y:2},hp:0,condition:'stabilized'},board:{blocked:[]}}),q=E.skillOpportunityPreview(s,{type:'skill',actor:'hero',target:'hero',skill:'jump',destination:{x:0,y:2}});assert.equal(q[0].conditional,true);assert.equal(q[0].origin,'C3');assert.equal(q[0].to,'A3');assert.equal(q[0].threats[0].from,'C3');assert.equal(q[0].threats[0].to,'B3');assert.equal(q[0].threats[0].at,'D3');assert.equal(q[0].threats[0].distance,1);
});
for(const language of ['de','en'])test(language+' movement warning shows the opponent and exact step',()=>{
 const s=scene(),q=warning(s),html=movementThreatMarkup(s,q,language);for(const text of ['Guard','I12','J14','J13','K13'])assert(html.includes(text));assert(html.includes(language==='en'?'during step':'beim Schritt'));assert(html.includes(language==='en'?'Allies do not':'Verbündete lösen keinen'));
});
test('movement warnings escape names and do not reveal an unseen opponent name or location',()=>{
 const s=scene(),q=warning(s);s.actors[1].name='<img src=x>';q.threats[0].name=s.actors[1].name;assert(movementThreatMarkup(s,q,'en').includes('&lt;img src=x&gt;'));assert(!movementThreatMarkup(s,q,'en').includes('<img'));
 s.rules={...s.rules,visionEnabled:true,hideUnseenEnemies:true,visionBase:1,visionPerception:false};s.actors[1].position={x:1,y:1};s.actors[1].name='Secret Guard';q.threats[0]={...q.threats[0],name:'Secret Guard',at:'B2'};const hidden=movementThreatMarkup(s,q,'en');assert(hidden.includes('Unseen opponent'));assert(!hidden.includes('Secret Guard'));assert(!hidden.includes('B2'));assert(movementThreatMarkup(s,q,'en',true).includes('Secret Guard'));
});
for(const language of ['de','en'])test(language+' unconscious and stabilized markers differ on the board and participant cards',()=>{
 const s=scene(),down=E.actorFrom({id:'down',name:'Down',hp:0,maxHp:20,condition:'unconscious',roundsLeft:2},true),safe=E.actorFrom({...down,condition:'stabilized',roundsLeft:null},true);for(const compact of [false,true]){const a=statusMarkers(s,down,language,compact),b=statusMarkers(s,safe,language,compact);assert(a.includes('ct-effect-unconscious'));assert(a.includes('aria-hidden="true">!</span>'));assert(a.includes(language==='en'?'Unconscious':'Bewusstlos'));assert(b.includes('ct-effect-stabilized'));assert(b.includes('aria-hidden="true">✚</span>'));assert(b.includes(language==='en'?'Stabilized':'Stabilisiert'));}
});
