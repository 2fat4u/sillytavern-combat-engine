import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../engine.js';
import { createController } from '../controller.js';
import { reactionMode } from '../reaction-budget.js';
import { defenseMarkup } from '../defense-ui.js';
import { customReactionStatus } from '../reaction-diagnostics.js';

const sharedName='BOSS · Vhal, Hüter der Arena';
function namesScene(){
    let s=E.emptyState();s.board={...s.board,width:20,height:12};s.rules=E.rulesFrom({...s.rules,visionEnabled:true,visionBase:4,visionPerception:false,hideUnseenEnemies:true,rngMode:'seeded',seed:'same-names'});
    s.actors=[{id:'hero',name:'Hero',side:'player',position:{x:1,y:1},initiative:100},{id:'visible-vhal',name:sharedName,side:'ally',position:{x:2,y:1},control:'basic',allegiance:{kind:'raise',source:'hero',originalSide:'enemy',originalControl:'advanced',turns:null,appliedTurn:1},initiative:80},{id:'secret-copy',name:sharedName,side:'enemy',position:{x:17,y:8},control:'advanced',initiative:60}].map(a=>E.actorFrom({...a,maxHp:80,hp:80},true));return E.startCombat(E.validateState(s)).state;
}
function fixture({control='advanced',mode='inherit',area=false}={}){
    let s=E.emptyState();s.rules=E.rulesFrom({...s.rules,reactionsEnabled:true,splitMovement:true,natural20:false,damageAbility:false,friendlyFireArea:true,rngMode:'seeded',seed:'reaction-inheritance'});
    const stock={id:'charges',name:'Charges',kind:'ammo',quantity:3};
    s.actors=[E.actorFrom({id:'attacker',name:'Attacker',side:'enemy',control:'advanced',position:{x:1,y:1},initiative:100,maxHp:60,hp:60,resources:[stock],weaponList:[{id:'weapon',name:'Weapon',mode:area?'ranged':'melee',damage:'1d6',range:8,radius:area?1:0,resource:'charges',cost:1}]},true),E.actorFrom({id:'defender',name:'Defender',side:'player',position:{x:area?3:2,y:1},initiative:60,maxHp:30,hp:30,control,reactionControl:mode,reactionChoices:['block']},true)];
    if(area)s.actors.push(E.actorFrom({id:'manual-defender',name:'Manual defender',side:'ally',position:{x:4,y:1},initiative:50,maxHp:30,hp:30,control:'manual',reactionControl:'manual',reactionChoices:['block']},true));
    s=E.startCombat(E.validateState(s)).state;let bundle={state:s,history:[],images:{},library:[]};const prompts=[];
    const c=createController({key:()=> 'hf1',read:()=>bundle,write:v=>{bundle=v;},save:async()=>{},preferences:()=>({}),connection:()=>({label:'test'})});
    c.subscribeReactions(request=>{prompts.push(request.actor);c.respondReaction({kind:'block'});});
    return {c,prompts,intent:{type:'attack',actor:'attacker',target:'defender',weapon:'weapon'}};
}

test('visible raised ally keeps its real name while an unseen same-name enemy remains private',()=>{
    const s=namesScene(),before=E.clone(s),view=E.playerView(s);assert.equal(view.actors.find(a=>a.id==='visible-vhal').name,sharedName);assert(!view.actors.some(a=>a.id==='secret-copy'));assert(!view.order.includes('secret-copy'));assert.deepEqual(s,before);assert.equal(E.findActor(s,'visible-vhal').allegiance.kind,'raise');
});
test('visible shared-name result/log is preserved by ID; secret-copy and ambiguous legacy events stay private',()=>{
    const s=namesScene(),visible={actor:'visible-vhal',actorName:sharedName,type:'attack',target:'hero'},secret={actor:'secret-copy',actorName:sharedName,type:'attack',target:'hero'};
    assert(E.publicValue(s,visible));assert(!E.publicValue(s,secret));assert(!E.publicValue(s,'BOSS · Vhal, Hüter der Arena attacks'));
    s.log.push({id:'public-event',type:'other',text:sharedName+' acts',details:visible},{id:'secret-event',type:'other',text:sharedName+' acts',details:secret},{id:'legacy-event',type:'other',text:sharedName+' acts',details:{}});
    const view=E.playerView(s);assert(view.log.some(e=>e.id==='public-event'));assert(!view.log.some(e=>e.id==='secret-event'||e.id==='legacy-event'));assert(!JSON.stringify(view).includes('secret-copy'));
});
test('public text keeps a known shared name but scrubs unknown IDs and coordinates',()=>{
    const s=namesScene();assert.equal(E.publicText(s,sharedName),sharedName);const text=E.publicText(s,sharedName+' · secret-copy · R9');assert(text.startsWith(sharedName));assert(!text.includes('secret-copy'));assert(!text.includes('R9'));
});
test('both model context formats retain the visible name without revealing the hidden copy',()=>{
    const s=namesScene();for(const compact of [true,false]){const text=E.buildPrompt(s,{compact});assert(text.includes(sharedName));assert(!text.includes('secret-copy'));assert(!text.includes('R9'));}
});
test('GM and newly revealed views keep duplicate names without changing the saved actors',()=>{
    let s=namesScene();assert.equal(E.playerView(s,true),s);s=E.editActor(s,'secret-copy',{position:{x:3,y:1}}).state;const view=E.playerView(s);assert.equal(view.actors.filter(a=>a.name===sharedName).length,2);assert.deepEqual(E.validateState(JSON.parse(JSON.stringify(s))).actors.map(a=>a.name),s.actors.map(a=>a.name));
});
for(const control of ['basic','advanced','manual','dm'])for(const mode of ['inherit','auto','manual','off']){
    test(control+' / '+mode+' resolves reaction policy, prompts and costs once',async()=>{
        const f=fixture({control,mode}),expected=mode==='inherit'?(['basic','advanced'].includes(control)?'auto':'manual'):mode;
        assert.equal(reactionMode(f.c.state().actors[1]),expected);const preview=E.attackPreview(f.c.state(),f.intent);if(mode==='off')assert.equal(preview.defenders.length,0);else assert.equal(preview.defenders[0].control,expected);
        await f.c.act(f.intent,{roll:n=>n===20?15:3});assert.equal(f.prompts.length,expected==='manual'?1:0);assert.equal(f.c.state().actors[0].resources[0].quantity,2);assert.equal(f.c.state().actors[1].reactionSpent,expected==='off'?0:1);assert.equal(f.c.state().actors[1].hp,expected==='off'?27:29);E.validateState(f.c.state());
    });
}
test('area damage asks only manual defenders; inherited Advanced reaction and stock are paid once',async()=>{
    const f=fixture({control:'advanced',mode:'inherit',area:true});await f.c.act(f.intent,{roll:n=>n===20?15:3});assert.deepEqual(f.prompts,['manual-defender']);assert.equal(f.c.state().actors[0].resources[0].quantity,2);assert.equal(f.c.state().actors[1].reactionSpent,1);assert.equal(f.c.state().actors[2].reactionSpent,1);E.validateState(f.c.state());
});
test('DE/EN settings and diagnostics describe the same inherited Advanced policy',()=>{
    const f=fixture();for(const language of ['de','en'])assert(defenseMarkup(f.c.state().actors[1],language,f.c.state().rules).includes('Basic/Advanced'));
    assert(customReactionStatus(f.c.state(),f.c.state().actors[1],'en').issues.some(v=>v.includes('Automatic control')));
});
