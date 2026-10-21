import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../engine.js';
import { skillPreset, SKILLS } from '../skills.js';
import { createController } from '../controller.js';
import { latestResult } from '../results.js';
import { resourcePreview } from '../supplies-ui.js';
import { createCheckDrafts } from '../checks-ui.js';
import { cuesForChange } from '../sounds.js';
import { visualCues } from '../visual-effects.js';
const stats=Object.fromEntries(Object.keys(E.STATS).map(k=>[k,k==='charisma'?2:0]));
function fixture(rules={}) {
    let s=E.setRules(E.emptyState(),{statMode:'bonuses',multiActionsEnabled:true,splitMovement:true,skillsEnabled:true,effectsEnabled:true,resourcesEnabled:true,movementStat:'none',movementBase:3,natural20:false,...rules}).state;
    s=E.setBoard(s,{blocked:[{x:0,y:0}]}).state;
    s=E.addActor(s,{name:'Bard',side:'player',position:{x:1,y:1},maxHp:20,hp:20,initiative:20,actionsPerTurn:2,stats,resources:[{id:'mana',name:'Mana',kind:'ammo',quantity:10}],skills:Object.keys(SKILLS).map(kind=>({...skillPreset(kind,'en'),id:kind,resource:'mana',cost:2}))}).state;
    s=E.addActor(s,{name:'Enemy',side:'enemy',position:{x:2,y:1},maxHp:20,hp:20,initiative:10,weaponList:[{id:'club',mode:'melee',damage:'1d4'}]}).state;
    s=E.addActor(s,{name:'Ally',side:'ally',position:{x:1,y:2},maxHp:20,hp:0,condition:'unconscious',roundsLeft:3,initiative:5}).state;
    return E.startCombat(s,false).state;
}
const intent=(s,patch={})=>({type:'check',actor:s.actors[0].id,turn:E.turnToken(s),description:'A creative attempt',stat:'charisma',bonus:0,dc:12,...patch});
const roll=()=>10;
test('198 check drafts remain separate for chats/actors and narrative mode clears a paid effect',()=>{
    const s=fixture(),a=s.actors[0],drafts=createCheckDrafts();
    drafts.update('chat-a',a,{name:'check-description',value:'Keep this description'},s);
    drafts.update('chat-a',a,{name:'check-effect',value:'distract'},s);
    assert.equal(drafts.get('chat-a',a.id).effect,'distract');
    assert.equal(drafts.get('chat-b',a.id).description,'');
    assert.equal(drafts.get('chat-a',s.actors[1].id).description,'');
    drafts.update('chat-a',a,{name:'check-mode',value:'narrative'},s);
    assert.equal(drafts.get('chat-a',a.id).effect,'');
    assert.equal(drafts.get('chat-a',a.id).description,'Keep this description');
});
test('198 paid-check feedback matches committed success/failure; free checks and undo stay quiet',()=>{
    const before=fixture();
    for(const [free,dc] of [[false,1],[false,99],[true,1],[true,99]]){
        const r=E.resolveAction(before,intent(before,{free,dc}),{roll}),events=[r.state.log.at(-1)];
        assert.deepEqual(cuesForChange(before,r.state,events),free?[]:[r.result.success?'effect':'miss']);
        assert.equal(visualCues(before,r.state,events).length,free?0:1);
        if(!free)assert.equal(visualCues(before,r.state,events)[0].kind,r.result.success?'move':'miss');
        assert.deepEqual(cuesForChange(before,r.state,[...events,{type:'undo'}]),[]);
        assert.deepEqual(visualCues(before,r.state,[...events,{type:'undo'}]),[]);
    }
});
test('198 own check rolls once, honours chosen decimal DC/bonus and spends one custom action without damage',()=>{
    const s=fixture();let draws=0;const r=E.resolveAction(s,intent(s,{bonus:'1,5',dc:'13,5'}),{roll:()=>{draws++;return 10;}});
    assert.equal(draws,1);assert.equal(r.result.total,13.5);assert(r.result.success);assert.equal(r.state.action.freeSpent,1);assert.deepEqual(r.state.actors.map(a=>a.hp),s.actors.map(a=>a.hp));assert.equal(r.state.actors[0].resources[0].quantity,10);
    assert.equal(r.state.log.at(-1).type,'check');assert.equal(latestResult(r.state.log).event.type,'check');
});
test('198 ties and natural 1/20 follow actual rules, with no second damage roll',()=>{
    for(const [rule,natural,dc,expected] of [[{hitEqual:false},10,12,false],[{hitEqual:true},10,12,true],[{natural20:true},1,0,false],[{natural20:true},20,100,true],[{natural20:false},1,0,true],[{natural20:false},20,100,false]]) {
        const s=fixture(rule),r=E.resolveAction(s,intent(s,{dc}),{roll:()=>natural});assert.equal(r.result.success,expected);assert.equal(r.result.damage,undefined);
    }
});
test('198 free narrative check after action exhaustion changes no actor, action, movement or turn and does not consume support',()=>{
    let s=fixture();s=E.resolveAction(s,{type:'other',actor:s.actors[0].id}).state;s=E.resolveAction(s,{type:'other',actor:s.actors[0].id}).state;
    s=E.editActor(s,s.actors[0].id,{tactics:[{type:'supported',turns:2,source:s.actors[2].id,amount:2}]}).state;const before=E.clone(s);
    const r=E.resolveAction(s,intent(s,{free:true}),{roll});assert.deepEqual(r.state.actors,before.actors);assert.deepEqual(r.state.action,before.action);assert.deepEqual(r.state.movement,before.movement);assert.equal(r.state.turnSerial,before.turnSerial);assert.equal(r.result.bonus,0);assert(!r.result.turnEnded);assert(!E.resultText(r.result).includes('Aktion verbraucht'));
});
test('198 paid check consumes the existing support bonus once',()=>{
    let s=fixture();s=E.editActor(s,s.actors[0].id,{tactics:[{type:'supported',turns:2,source:s.actors[2].id,amount:2}]}).state;
    const r=E.resolveAction(s,intent(s),{roll});assert.equal(r.result.total,14);assert(!r.state.actors[0].tactics.some(t=>t.type==='supported'));
});
for(const kind of Object.keys(SKILLS))test('198 own check applies assigned '+kind+' through its normal effect once',()=>{
    let s=fixture();if(kind==='support')s=E.editActor(s,s.actors[2].id,{hp:20,condition:'fit',roundsLeft:null}).state;
    if(['revive','raise'].includes(kind))s=E.editActor(s,s.actors[2].id,{hp:0,condition:'dead',roundsLeft:null}).state;
    const target=SKILLS[kind].target==='self'?s.actors[0]:['carry','support','revive','raise'].includes(kind)?s.actors[2]:s.actors[1];
    let draws=0;const r=E.resolveAction(s,intent(s,{target:target.id,effect:kind,dc:1}),{roll:()=>{draws++;return 10;}});
    assert(r.result.success);assert.equal(draws,1);assert.equal(r.result.effectKind,kind);assert.equal(r.state.actors[0].resources[0].quantity,8);assert.equal(r.state.action.freeSpent,1);assert.equal(r.state.log.filter(e=>e.type==='check').length,1);
    if(['shove','carry'].includes(kind))assert(r.result.forcedMovement);
    if(kind==='carry'){assert.equal(r.state.movement.spent,r.result.forcedMovement.cost);assert.notDeepEqual(r.state.actors[0].position,s.actors[0].position);}
    if(['revive','raise'].includes(kind))assert.equal(r.state.actors[2].hp,5);else assert.deepEqual(r.state.actors.map(a=>a.hp),s.actors.map(a=>a.hp));
});
test('198 failed ability effect pays its resource once, applies nothing and uses the custom DC instead of the profile DC',()=>{
    const s=fixture();let draws=0;const r=E.resolveAction(s,intent(s,{effect:'distract',target:s.actors[1].id,dc:99}),{roll:()=>{draws++;return 10;}});
    assert(!r.result.success);assert.equal(draws,1);assert.equal(r.result.dc,99);assert.equal(r.state.actors[0].resources[0].quantity,8);assert.equal(r.state.actors[1].tactics.length,0);
});
test('198 failed acrobatics retains its existing movement penalty',()=>{
    const s=fixture(),r=E.resolveAction(s,intent(s,{effect:'acrobatics',dc:99}),{roll});assert(!r.result.success);assert.equal(r.state.movement.spent,1);assert.equal(r.state.actors[0].resources[0].quantity,8);
});
test('198 critical intimidation uses the existing flee policy',()=>{
    const s=fixture({natural20:true}),r=E.resolveAction(s,intent(s,{target:s.actors[1].id,effect:'intimidate',dc:99}),{roll:()=>20});assert(r.result.critical);assert.equal(r.state.actors[1].tactics[0].policy,'flee');
});
test('198 restricted custom and skill pools stay distinct; healing-only extras cannot pay a check',()=>{
    for(const [effect,allowed,ok] of [[undefined,'other',true],['distract','skill',true],['distract','other',false],[undefined,'skill',false],[undefined,'use',false]]){
        let s=fixture();s=E.editActor(s,s.actors[0].id,{actionsPerTurn:1,bonusActions:[{id:'extra',name:'Extra',count:1,allowed:[allowed]}]}).state;s=E.resolveAction(s,{type:'attack',actor:s.actors[0].id,target:s.actors[1].id,mode:'melee'},{roll:n=>n===20?10:1}).state;
        const action=intent(s,{effect,target:s.actors[1].id});
        if(ok){const r=E.resolveAction(s,action,{roll});assert.equal(r.state.action.bonusSpent.extra,1);assert.equal(r.state.action.freeSpent,1);}else assert.throws(()=>E.resolveAction(s,action,{roll}));
    }
});
const invalid=[{free:true,effect:'distract'}, {description:''},{description:'x'.repeat(501)},{stat:'luck'},{dc:null},{dc:'1.234'},{bonus:Infinity},{free:1},{effect:'invented'},{hp:999},{weapon:'club'},{destination:{x:1,y:1}}];
for(const patch of invalid)test('198 invalid own-check input is rejected without rolling or partial writes: '+JSON.stringify(patch),()=>{
    const s=fixture(),before=E.clone(s);let draws=0;assert.throws(()=>E.resolveAction(s,intent(s,patch),{roll:()=>{draws++;return 10;}}));assert.equal(draws,0);assert.deepEqual(s,before);
});
test('198 range, disabled effects, depleted stock and invalid forced destinations reject before dice',()=>{
    for(const variant of ['range','effects','stock','destination']){
        let s=fixture();if(variant==='range')s=E.moveActor(s,s.actors[1].id,{x:9,y:9},true).state;if(variant==='effects')s=E.setRules(s,{effectsEnabled:false}).state;if(variant==='stock')s=E.editActor(s,s.actors[0].id,{resources:[{id:'mana',name:'Mana',kind:'ammo',quantity:0}]}).state;
        const action=intent(s,{effect:variant==='range'?'hold':variant==='destination'?'shove':'stun',target:s.actors[1].id,...(variant==='destination'?{destination:{x:3,y:1,z:1}}:{})});let draws=0;assert.throws(()=>E.resolveAction(s,action,{roll:()=>{draws++;return 10;}}));assert.equal(draws,0);
    }
});
test('198 model and Basic sources cannot execute a custom check; human override of Basic actors is allowed',()=>{
    let s=fixture();s=E.editActor(s,s.actors[0].id,{control:'basic'}).state;
    for(const source of ['model','basic'])assert.throws(()=>E.resolveAction(s,intent(s),{source,roll}));assert(E.resolveAction(s,intent(s),{source:'manual',roll}).result.success);
});
test('198 duplicate receipt, persisted result and free-check undo remain authoritative in context and chat',async()=>{
    let bundle={state:fixture(),history:[]};const events=[];const c=createController({key:()=> 'check',read:()=>bundle,write:b=>bundle=b,save:async()=>{},onChange:(_b,e)=>events.push(...e)}),before=E.clone(c.state());
    await c.act(intent(c.state(),{free:true}),{roll,receipt:'once'});assert(events.at(-1).chatRelevant);assert.equal(c.state().log.at(-1).type,'check');assert.match(E.buildPrompt(c.state()),/A creative attempt/);
    assert((await c.act(intent(c.state(),{free:true}),{roll:()=>{throw Error('No second draw');},receipt:'once'})).duplicate);
    const restored=E.validateState(JSON.parse(JSON.stringify(c.export())));assert.equal(restored.log.at(-1).details.type,'check');
    await c.undo();assert.deepEqual(c.state().rng,before.rng);assert.equal(events.at(-1).type,'undo');assert(events.at(-1).chatRelevant);assert(!E.buildPrompt(c.state()).includes('Own check: SUCCESS'));
});
test('198 cost/refill preview separates item stock, linked stock and full-stock no-use',()=>{
    const resources=[{id:'mana',name:'Mana',kind:'ammo',quantity:0,capacity:20},{id:'coins',name:'Coins',kind:'ammo',quantity:10}],v={id:'potion',name:'Potion',kind:'supply',quantity:3,cost:1,refill:{stock:'mana',amount:5}};
    assert.match(resourcePreview(v,resources,'en'),/1 Potion/);assert.match(resourcePreview(v,resources,'en'),/\+5 Mana · 0 → 5/);
    assert.match(resourcePreview({...v,consumption:'linked',stock:'coins',cost:2},resources,'en'),/2 Coins/);
    assert.match(resourcePreview({...v,consumption:'none'},resources,'en'),/No consumption/);
    assert.match(resourcePreview(v,[{...resources[0],quantity:20}], 'en'),/Stock full/);
});
