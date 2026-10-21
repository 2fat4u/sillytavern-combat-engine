import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../engine.js';
import { skillPreset } from '../skills.js';
import { resolveBasicTurn, resolveBasicTurnAsync } from '../ai.js';
import { createController } from '../controller.js';
import { captureMap, mapFrom } from '../maps.js';
import { effectRulesMarkup, readEffectRules } from '../effect-rules-ui.js';
import { visualCues, createVisualEffects } from '../visual-effects.js';
import { combatFilename } from '../profiles-ui.js';
function fixture(rules={},a={},b={},board={}) {
    let s=E.setRules(E.emptyState(),{multiActionsEnabled:true,splitMovement:true,movementStat:'none',movementBase:3,rngMode:'seeded',...rules}).state;
    s=E.setBoard(s,{width:12,height:12,...board}).state;
    s=E.addActor(s,{name:'Hero',side:'player',maxHp:100,initiative:20,position:{x:1,y:1},actionsPerTurn:4,skills:[{...skillPreset('aim'),id:'aim'},{...skillPreset('status'),id:'status',check:false},{...skillPreset('sprint'),id:'sprint',ai:true}],...a}).state;
    s=E.addActor(s,{name:'Enemy',side:'enemy',maxHp:100,initiative:10,position:{x:2,y:1},...b}).state;
    return E.startCombat(s).state;
}
const intent=(s,type,extra={})=>({type,actor:s.actors[0].id,turn:E.turnToken(s),...extra});
function controller(s,extra={}){let bundle={state:s,history:[]};return createController({key:()=> 'test',read:()=>bundle,write:b=>{bundle=b;},save:async()=>{},...extra});}
test('Global stance decimals are used in actual hit/DC results and language output',()=>{
    let s=fixture({offensiveAttack:'1,5',offensiveDefense:-3.25,defensiveDefense:4.5});s=E.setStance(s,s.actors[0].id,'offensive').state;
    assert.match(s.log.at(-1).text,/\+1.5.*−?|-3.25/);assert.equal(E.stanceBonus(s,s.actors[0]).defense,-3.25);
    s.actors[1].stance='defensive';const r=E.resolveAction(s,intent(s,'attack',{target:s.actors[1].id}),{roll:()=>10}).result;
    assert.equal(r.posture,1.5);assert.equal(r.dc,s.actors[1].dc+4.5);
    assert.match(E.buildPrompt(s),/offensive attack\/DC 1.5\/-3.25/);
});
test('Global aim/support/distract amounts apply immediately to existing tactics and consume once',()=>{
    let s=fixture({aimBonus:3.5});s=E.resolveAction(s,intent(s,'skill',{skill:'aim',target:s.actors[0].id})).state;
    assert.equal(s.actors[0].tactics[0].amount,3.5);s=E.setRules(s,{aimBonus:4.25,supportBonus:1.5,distractBonus:3}).state;
    s.actors[0].tactics.push({type:'supported',amount:2,turns:1,appliedTurn:0});s.actors[1].tactics.push({type:'distracted',amount:2,turns:1,appliedTurn:0});
    s=E.editActor(s,s.actors[0].id,{weaponList:[{id:'bow',name:'Bow',mode:'ranged',damage:'1d4',range:10}]}).state;
    const step=E.resolveAction(s,intent(s,'attack',{target:s.actors[1].id,weapon:'bow'}),{roll:()=>1});assert.equal(step.result.tacticalBonus,8.75);
    assert.equal(step.state.actors[0].tactics.length,0);assert.equal(step.state.actors[1].tactics.length,0);
});
test('Poison penalty and slowed percentage use configured values with whole movement points',()=>{
    const s=fixture({poisonPenalty:1.5,slowedPercent:75,movementBase:7},{effects:[{type:'poisoned',turns:3},{type:'slowed',turns:2}]});
    assert.equal(E.movementBudget(s,s.actors[0]).total,5);const r=E.resolveAction(s,intent(s,'attack',{target:s.actors[1].id}),{roll:()=>10}).result;assert.equal(r.effectPenalty,-1.5);assert.match(E.resultText(r,'en'),/-1.5 poison/);
});
test('Global status duration applies on next infliction and damage overrides existing periodic ticks',()=>{
    let s=fixture({effectDurationOverrides:{burning:5},effectDamageOverrides:{burning:'1d4+1'}},{skills:[{...skillPreset('status'),id:'fire',check:false,status:'burning',turns:1,statusDamage:1}]});
    s=E.resolveAction(s,intent(s,'skill',{skill:'fire',target:s.actors[1].id})).state;assert.equal(s.actors[1].effects[0].turns,5);
    s=E.setRules(s,{effectDurationOverrides:{burning:1},effectDamageOverrides:{burning:'7'}}).state;assert.equal(s.actors[1].effects[0].turns,5);
    s=E.endTurn(s).state;s=E.endTurn(s).state;assert.equal(s.actors[1].hp,93);assert.equal(s.actors[1].effects[0].turns,4);assert.equal(s.log.findLast(e=>e.type==='effect').details.formula,'7');
});
test('Global duration and damage also apply to weapon statuses; no mutation of profile',()=>{
    const s=fixture({effectDurationOverrides:{poisoned:6},effectDamageOverrides:{poisoned:'0'}},{weaponList:[{id:'blade',mode:'melee',damage:'1d4',effects:[{type:'poisoned',turns:1,damage:'2'}]}]});
    const step=E.resolveAction(s,intent(s,'attack',{target:s.actors[1].id}),{roll:n=>n});assert.equal(step.state.actors[1].effects[0].turns,6);assert.equal(step.result.appliedEffects[0].damage,'0');assert.equal(s.actors[0].weaponList[0].effects[0].damage,'2');
});
test('Global tactical duration controls aim, with no countdown restart on rules edit',()=>{
    let s=fixture({effectDurationOverrides:{aimed:4}});s=E.resolveAction(s,intent(s,'skill',{skill:'aim',target:s.actors[0].id})).state;assert.equal(s.actors[0].tactics[0].turns,4);
    s=E.setRules(s,{effectDurationOverrides:{aimed:8}}).state;assert.equal(s.actors[0].tactics[0].turns,4);
});
test('Effect rules reject malformed fields and remain portable with default legacy values',()=>{
    for(const patch of [{offensiveAttack:1.234},{poisonPenalty:-1},{slowedPercent:0},{effectDamageOverrides:{burning:'bad'}},{effectDurationOverrides:{unknown:2}},{effectDurationOverrides:{stunned:1.5}}])assert.throws(()=>E.setRules(E.emptyState(),patch));
    const s=E.validateState({...E.emptyState(),rules:{}});assert.equal(s.rules.aimBonus,2);assert.equal(s.rules.slowedPercent,50);assert.deepEqual(s.rules.effectDurationOverrides,{});
    const configured=E.setRules(s,{effectDurationOverrides:{rooted:3},offensiveAttack:1.5}).state;assert.deepEqual(E.validateState(JSON.parse(JSON.stringify(configured))).rules,configured.rules);
});
test('Central effects UI has all status types, decimal bonuses and profile-default overrides in both languages',()=>{
    for(const lang of ['de','en']){const html=effectRulesMarkup(E.defaultRules(),lang);for(const name of ['offensiveAttack','aimBonus','supportBonus','poisonPenalty','effectDamage-burning','effectDuration-rooted','effectDuration-stunned'])assert(html.includes('name="'+name+'"'));assert(html.includes(lang==='en'?'existing countdowns do not restart':'laufende Countdown-Werte werden nicht neu gestartet'));}
    const d=new Map([['offensiveAttack','1,5'],['effectDamage-burning','1d6'],['effectDuration-rooted','4']]);const patch=readEffectRules(d);assert.equal(E.rulesFrom(patch).offensiveAttack,1.5);assert.equal(E.rulesFrom(patch).effectDurationOverrides.rooted,4);
});
for(const budget of ['single','two','healing'])test('AI sprint follows a necessary detour with '+budget+' budget',()=>{
    const s=fixture({multiActionsEnabled:budget!=='single'},{control:'basic',actionsPerTurn:budget==='two'?2:1,bonusActions:budget==='healing'?[{id:'med',count:1,allowed:['use']}]:[],position:{x:3,y:1},weaponList:[{id:'blade',mode:'melee',damage:'1d6'}]},{position:{x:20,y:1}},{width:24,height:18,blocked:Array.from({length:12},(_,y)=>({x:4,y}))});
    const step=resolveBasicTurn(s);assert.notDeepEqual(step.state.actors[0].position,s.actors[0].position);assert(step.state.actors[0].position.y>1);assert.equal(E.movementBudget(s,s.actors[0]).total,3);assert.notEqual(E.currentActor(step.state).id,s.actors[0].id);assert.deepEqual(E.validateState(step.state).actors,step.state.actors);
});
test('Async AI can pause after sprint, retain consumed action, then finish movement without replaying',async()=>{
    const s=fixture({}, {control:'basic',actionsPerTurn:1,bonusActions:[{id:'med',count:1,allowed:['use']}],weaponList:[{id:'blade',mode:'melee',damage:'1d6'}]}, {position:{x:10,y:10}});let stop=false;
    const paused=await resolveBasicTurnAsync(s,{shouldStop:()=>stop,yield:()=>{stop=true;}});assert(paused.result.paused);assert.equal(E.currentActor(paused.state).id,s.actors[0].id);assert.equal(paused.state.action.freeSpent,1);assert.deepEqual(paused.state.actors[0].position,s.actors[0].position);
    const done=await resolveBasicTurnAsync(paused.state,{yield:()=>{}});assert.notDeepEqual(done.state.actors[0].position,s.actors[0].position);assert.equal(done.state.log.filter(e=>e.details.skillKind==='sprint').length,1);assert(done.result.turnEnded);
});
test('Async and sync AI have identical combat outcome, RNG and sequence of mechanical event types',async()=>{
    const s=fixture({}, {control:'basic'},{position:{x:8,y:8}}),a=resolveBasicTurn(s,{roll:()=>10}),b=await resolveBasicTurnAsync(s,{roll:()=>10,yield:()=>{}});
    for(const key of ['actors','rng','turn','turnSerial','movement','action'])assert.deepEqual(a.state[key],b.state[key]);assert.deepEqual(a.state.log.map(e=>e.type),b.state.log.map(e=>e.type));
});
test('Controller checks chat again after yielding before committing any AI state or result',async()=>{
    let key='old',writes=0;const s=fixture({}, {control:'basic'}),c=controller(s,{key:()=>key,write:()=>writes++});await assert.rejects(c.aiStep({yield:()=>{key='new';}}),/Chat wurde gewechselt/);assert.equal(writes,0);assert.deepEqual(c.state(),s);
});
test('Controller counts completed turns, yields between actions and exposes progress/actual timing',async()=>{
    const s=fixture({movementBase:1},{control:'basic',skills:[],attackBonus:-100,weaponList:[{id:'bow',mode:'ranged',damage:'1d4',range:30}],actionsPerTurn:2},{control:'basic',attackBonus:-100,weaponList:[{id:'bow2',mode:'ranged',damage:'1d4',range:30}]});
    const c=controller(s,{preferences:()=>({debugEnabled:true,aiBatchSize:10})}),changes=[];c.subscribeProgress(p=>changes.push(p));const result=await c.aiRun(2);assert.equal(result.count,2);assert(result.limited);assert.equal(c.aiProgress().running,false);assert(changes.some(v=>v.count===1));assert(c.debugEntries().some(v=>v.type==='timing'&&v.detail.operationMs>=0));
    await assert.rejects(c.aiRun(0),/1 bis 100/);
});
test('Blank map seed generates a new seed; explicit seed remains repeatable without changing combat RNG',async()=>{
    const c=controller(E.emptyState());const before=E.clone(c.state().rng);await c.randomBoard({preset:'dungeon'});const first=c.state().board.mapSeed;await c.randomBoard({preset:'dungeon'});assert.notEqual(c.state().board.mapSeed,first);await c.randomBoard({preset:'dungeon',seed:first});const saved=E.clone(c.state().board);await c.randomBoard({preset:'dungeon',seed:first});assert.deepEqual(c.state().board,saved);assert.deepEqual(c.state().rng,before);
});
for(const preset of ['dungeon','castle'])for(const [w,h] of [[2,2],[6,9],[10,10],[23,17],[50,50]])test(preset+' '+w+'×'+h+' is reproducible, has legal terrain and connects participants for 12 seeds',()=>{
    const variants=new Set();for(let i=0;i<12;i++){
        let s=E.setBoard(E.emptyState(),{width:w,height:h}).state;s=E.addActor(s,{name:'A',side:'player',position:{x:0,y:0}}).state;s=E.addActor(s,{name:'B',side:'enemy',position:{x:w-1,y:h-1}}).state;
        const opts={preset,seed:'layout-'+i},next=E.randomBoard(s,opts).state;assert.deepEqual(next.board,E.randomBoard(s,opts).state.board);assert.deepEqual(next.actors,s.actors);assert.deepEqual(next.rng,s.rng);E.validateState(next);
        const walk={...next,actors:[]},paths=E.pathDistances(walk,next.actors[0].position,'');assert(paths.has(`${w-1},${h-1}`),'unreachable actor '+i);
        for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(E.canOccupy(walk,{x,y}))assert(paths.has(`${x},${y}`),'isolated cell '+preset+' '+i+' '+x+','+y);
        for(const ladder of next.board.ladders){assert.equal(E.distance(ladder.from,ladder.to),1);assert.notEqual(E.heightAt(next,ladder.from),E.heightAt(next,ladder.to));assert(E.canOccupy(next,ladder.from));assert(E.canOccupy(next,ladder.to));}
        assert.deepEqual(mapFrom(JSON.parse(JSON.stringify(captureMap(next,'Map')))).board,next.board);variants.add(JSON.stringify([next.board.heights,next.board.blocked,next.board.cover]));
    }if(w>=10)assert(variants.size>3);
});
test('Combat name persists across import/export and remains undoable without a chat announcement',async()=>{
    const c=controller(E.emptyState());await c.name('Battle of Falkenfurt');assert.equal(c.export().name,'Battle of Falkenfurt');assert.equal(c.state().log.at(-1).chatRelevant,false);const other=controller(E.emptyState());await other.import(c.export());assert.equal(other.state().name,'Battle of Falkenfurt');await c.undo();assert.equal(c.state().name,'');
});
test('Visual cues show collateral hits, miss, heal, move and next turn; import/undo/reset do not replay',()=>{
    const before=fixture(),after=E.clone(before);after.turnSerial++;after.turn=1;const ids=after.actors.map(a=>a.id),events=[{type:'hit',details:{affected:[{id:ids[0]},{id:ids[1]}]}},{type:'miss',details:{target:ids[1]}},{type:'use',details:{target:ids[0]}},{type:'move',details:{actor:ids[0]}}];const cues=visualCues(before,after,events);for(const kind of ['hit','miss','heal','move','turn'])assert(cues.some(v=>v.kind===kind));for(const type of ['undo','import','reset'])assert.deepEqual(visualCues(before,after,[...events,{type}]),[]);
});
test('Visual timers can be refreshed, toggled and destroyed without mutating state or blocking',()=>{
    const classes=new Set(),cell={classList:{add:v=>classes.add(v),remove:v=>classes.delete(v)}},callbacks=new Map();let timer=0,enabled=true;const fx=createVisualEffects({querySelector:()=>cell},()=>({visualEffects:enabled}),{schedule:fn=>{callbacks.set(++timer,fn);return timer;},cancel:id=>callbacks.delete(id)});
    fx.play([{x:1,y:1,kind:'hit'}]);assert(classes.has('ct-flash-hit'));fx.play([{x:1,y:1,kind:'heal'}]);assert.equal(callbacks.size,1);[...callbacks.values()][0]();assert.equal(classes.size,0);fx.play([{x:1,y:1,kind:'miss'}]);enabled=false;fx.play([]);assert.equal(classes.size,0);fx.destroy();
});
test('Removing a live damage override restores the configured weapon damage without resetting duration',()=>{
    let s=fixture({effectDamageOverrides:{burning:'8'}},{weaponList:[{id:'fire',mode:'melee',damage:'1d4',effects:[{type:'burning',damage:'2',turns:3}]}]});
    s=E.resolveAction(s,intent(s,'attack',{target:s.actors[1].id}),{roll:n=>n}).state;assert.equal(s.actors[1].effects[0].damage,'2');
    s=E.setRules(s,{effectDamageOverrides:{}}).state;s=E.endTurn(s).state;const hp=s.actors[1].hp;s=E.endTurn(s).state;assert.equal(s.actors[1].hp,hp-2);assert.equal(s.actors[1].effects[0].turns,2);
});
test('Scoped height and ladder path indexes do not survive changes to the same board object',()=>{
    const s=fixture({}, {}, {},{heights:Array.from({length:12},(_,y)=>({x:4,y})),ladders:[]});const from={x:1,y:1};
    assert(!E.pathDistances(s,from,s.actors[0].id).has('6,1'));s.board.ladders.push({from:{x:3,y:3},to:{x:4,y:3}},{from:{x:4,y:4},to:{x:5,y:4}});
    assert(E.pathDistances(s,from,s.actors[0].id).has('6,1'));s.board.ladders.length=0;assert(!E.pathDistances(s,from,s.actors[0].id).has('6,1'));
});
test('Optional battle export names retain readable text, sanitize forbidden characters and fall back for empty names',()=>{
    assert.equal(combatFilename('Battle of Falkenfurt'),'Battle of Falkenfurt.json');assert.equal(combatFilename('Bridge: night / rain'),'Bridge- night - rain.json');for(const v of ['',null,'   ','...'])assert.equal(combatFilename(v),'kampf.json');
});
test('A pending visual cue survives a normal final render without restarting its expiry',()=>{
    const oldClasses=new Set(),newClasses=new Set(),node=set=>({classList:{add:v=>set.add(v),remove:v=>set.delete(v)}});let cell=node(oldClasses),callback,timers=0;
    const fx=createVisualEffects({querySelector:()=>cell},()=>({}),{schedule:fn=>{callback=fn;return ++timers;},cancel:()=>{}});fx.play([{x:2,y:3,kind:'hit'}]);cell=node(newClasses);fx.refresh();assert(newClasses.has('ct-flash-hit'));assert.equal(timers,1);callback();assert.equal(oldClasses.size,0);assert.equal(newClasses.size,0);
});
