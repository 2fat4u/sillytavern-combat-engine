import * as E from './engine.js?v=2.0.0-beta.4-hotfix.3';
import { planAdvancedTurn } from './advanced-ai.js?v=2.0.0-beta.4-hotfix.3';
import { aiTerritory } from './ai-state.js?v=2.0.0-beta.4-hotfix.3';

function aggregate(state,results,id,paused=false){const ended=state.phase!=='active'||E.currentActor(state)?.id!==id;return {state,result:results.length?{...results.at(-1),advancedAI:true,...(results.length>1?{actions:results}:{}),initiative:E.turnOverview(state),turnEnded:ended,...(paused&&!ended?{paused:true}:{})}:{advancedAI:true,paused:true,actions:[]}};}
function visibleEnemies(s,id){const a=E.findActor(s,id);return s.actors.filter(b=>(a.side==='enemy')!==(b.side==='enemy')&&E.isCombatant(b)&&E.visibleTo(s,a,b));}
function prepare(state,plan){
    let staged=E.applyAIPlan(state,plan).state;
    if(!plan.move)return {state:staged,plan,discovered:false};
    if(!plan.reposition)return {state:E.moveActor(staged,plan.actor,plan.move).state,plan,discovered:false};
    const a=E.findActor(staged,plan.actor),known=new Set(visibleEnemies(staged,a.id).map(b=>b.id)),routing=E.movementPaths(staged,a.position,a.id,E.movementBudget(staged,a).remaining,p=>aiTerritory(a,p));
    // A discretionary retreat observes the map as it moves. Stop on a legal cell
    // and reassess a newly seen opponent before continuing around another corner.
    for(const step of routing.pathTo(plan.move)){
        if(E.distance(E.findActor(staged,a.id).position,step)===0||!E.canOccupy(staged,step)||staged.actors.some(b=>b.id!==a.id&&b.position&&E.distance(b.position,step)===0))continue;
        staged=E.moveActor(staged,a.id,step).state;
        if(staged.phase==='active'&&E.currentActor(staged)?.id===a.id&&visibleEnemies(staged,a.id).some(b=>!known.has(b.id)))return {state:staged,plan:{...plan,move:{...E.findActor(staged,a.id).position}},discovered:true};
        if(staged.phase!=='active'||E.currentActor(staged)?.id!==a.id)break;
    }
    return {state:staged,plan,discovered:false};
}
function discoveryResult(before,prepared){const a=E.findActor(before,prepared.plan.actor),from=E.coordinate(a.position),to=E.coordinate(E.findActor(prepared.state,a.id).position);return {type:'move',actor:a.id,actorName:a.name,turn:prepared.plan.intent.turn,round:before.round,from,to,movement:{from,to},advancedAI:true,discovered:true,plan:prepared.plan};}
function resolve(state,plan,options){
    if(plan.intent.type==='stance')return E.setStance(state,plan.actor,plan.intent.stance,plan.intent.turn);
    if(plan.intent.type==='endTurn')return E.endTurn(state,plan.intent,options);
    return (options.resolve??E.resolveAction)(state,plan.intent,{...options,source:'advanced'});
}
function decorate(before,resolved,plan){const result={...(resolved.result??{type:'stance',actor:plan.actor}),advancedAI:true,plan};
    if(plan.move){result.movement={from:E.coordinate(E.findActor(before,plan.actor).position),to:E.coordinate(plan.move)};const event=resolved.state.log.findLast(e=>e.details===resolved.result);if(event&&plan.intent.type!=='endTurn'){Object.assign(event.details,result);event.textDe=E.resultText(result,'de');event.textEn=E.resultText(result,'en');event.text=resolved.state.rules.language==='en'?event.textEn:event.textDe;}}
    return result;
}
function timing(options,started,plan){try{options.onPlanTiming?.({planMs:Math.round((performance.now()-started)*100)/100,actor:plan.actor,type:plan.intent.type});}catch{/* Optional diagnostics. */}}
export function resolveAdvancedTurn(s,options={}){const id=E.currentActor(s)?.id,results=[];let state=s;for(let i=0;i<250&&state.phase==='active'&&E.currentActor(state)?.id===id;i++){
    if(options.shouldStop?.())return aggregate(state,results,id,true);const before=state,started=performance.now(),plan=planAdvancedTurn(state);timing(options,started,plan);const prepared=prepare(state,plan),staged=prepared.state;
    if(prepared.discovered){state=staged;results.push(discoveryResult(before,prepared));continue;}
    const resolved=staged.phase!=='active'||E.currentActor(staged)?.id!==id?{state:staged,result:{type:'endTurn',actor:id}}:resolve(staged,plan,options);
    if(resolved.result?.cancelled)return aggregate(before,results,id,true);state=resolved.state;results.push(decorate(before,resolved,prepared.plan));
    }if(state.phase==='active'&&E.currentActor(state)?.id===id)state=E.endTurn(state).state;return aggregate(state,results,id);}
export async function resolveAdvancedTurnAsync(s,options={}){const id=E.currentActor(s)?.id,results=[];let state=s;for(let i=0;i<250&&state.phase==='active'&&E.currentActor(state)?.id===id;i++){
    if(options.shouldStop?.())return aggregate(state,results,id,true);const before=state,started=performance.now(),plan=planAdvancedTurn(state);timing(options,started,plan);const prepared=prepare(state,plan),staged=prepared.state;
    if(prepared.discovered){state=staged;results.push(discoveryResult(before,prepared));await(options.yield?.()??new Promise(r=>setTimeout(r,0)));continue;}
    const resolved=staged.phase!=='active'||E.currentActor(staged)?.id!==id?{state:staged,result:{type:'endTurn',actor:id}}:await resolve(staged,plan,options);
    if(resolved.result?.cancelled)return aggregate(before,results,id,true);state=resolved.state;results.push(decorate(before,resolved,prepared.plan));await(options.yield?.()??new Promise(r=>setTimeout(r,0)));
    }if(state.phase==='active'&&E.currentActor(state)?.id===id)state=E.endTurn(state).state;return aggregate(state,results,id);}
