import * as E from './engine.js?v=2.0.0-beta.6';
import { planAdvancedTurn } from './advanced-ai.js?v=2.0.0-beta.6';
import { aiTerritory } from './ai-state.js?v=2.0.0-beta.6';

function aggregate(state,results,id,paused=false){const ended=state.phase!=='active'||E.currentActor(state)?.id!==id;return {state,result:results.length?{...results.at(-1),advancedAI:true,...(results.length>1?{actions:results}:{}),initiative:E.turnOverview(state),turnEnded:ended,...(paused&&!ended?{paused:true}:{})}:{advancedAI:true,paused:true,actions:[]}};}
function visibleEnemies(s,id){const a=E.findActor(s,id);return s.actors.filter(b=>(a.side==='enemy')!==(b.side==='enemy')&&E.isCombatant(b)&&E.visibleTo(s,a,b));}
const actualPosition=(s,id)=>{const p=E.findActor(s,id).position;return p?{...p}:null;};
function* prepareFlow(state,plan){
    let staged=E.applyAIPlan(state,plan).state;
    if(!plan.move)return {state:staged,plan,discovered:false};
    const withdrawal=plan.intent.type==='endTurn'&&(plan.escape||plan.withdrawal)&&E.actionBudget(staged,E.findActor(staged,plan.actor)).available;
    const observeSearch=plan.intent.type==='endTurn'&&(plan.search||plan.patrol||plan.approach||plan.followCall)&&E.actionBudget(staged,E.findActor(staged,plan.actor)).available;
    if(!plan.reposition&&!observeSearch&&!withdrawal){const moved=yield {state:staged,id:plan.actor,position:plan.move};if(moved.result?.cancelled)return {state,plan,cancelled:true};return {state:moved.state,plan:{...plan,move:actualPosition(moved.state,plan.actor)},discovered:Boolean(moved.result?.interrupted&&moved.state.phase==='active'&&E.currentActor(moved.state)?.id===plan.actor)};}
    const a=E.findActor(staged,plan.actor),known=new Set(visibleEnemies(staged,a.id).map(b=>b.id)),routing=E.movementPaths(staged,a.position,a.id,E.movementBudget(staged,a).remaining,p=>aiTerritory(a,p));
    // Search and discretionary retreat observe legal stops as they move. A new
    // contact causes a fresh decision before a previously planned empty turn ends.
    for(const step of routing.pathTo(plan.move)){
        if(E.distance(E.findActor(staged,a.id).position,step)===0||!E.canOccupy(staged,step)||staged.actors.some(b=>b.id!==a.id&&b.position&&E.distance(b.position,step)===0))continue;
        const moved=yield {state:staged,id:a.id,position:step};if(moved.result?.cancelled)return {state,plan,cancelled:true};staged=moved.state;if(moved.result?.interrupted)return {state:staged,plan:{...plan,move:actualPosition(staged,a.id)},withdrawal,discovered:staged.phase==='active'&&E.currentActor(staged)?.id===a.id};
        if(staged.phase==='active'&&E.currentActor(staged)?.id===a.id&&visibleEnemies(staged,a.id).some(b=>!known.has(b.id))){
            staged=E.explainAI(staged,a.id,withdrawal?'Neue Sichtung beim Rückzug: verbleibende Aktionen neu bewerten':observeSearch?'Neue Sichtung während der Suche: verbleibende Aktion neu bewerten':'Neue Sichtung beim Umpositionieren: Lage neu bewerten',withdrawal?'New contact during withdrawal: reassess remaining actions':observeSearch?'New contact during search: reassess the remaining action':'New contact while repositioning: reassess the situation').state;
            return {state:staged,plan:{...plan,move:actualPosition(staged,a.id)},withdrawal,discovered:true};
        }
        if(staged.phase!=='active'||E.currentActor(staged)?.id!==a.id)break;
    }
    const reconsider=withdrawal&&staged.phase==='active'&&E.currentActor(staged)?.id===a.id&&E.actionBudget(staged,E.findActor(staged,a.id)).available;
    if(reconsider)staged=E.explainAI(staged,a.id,'Rückzug ausgeführt: verbleibende Aktionen vor dem Zugende prüfen','Withdrawal completed: check remaining actions before ending the turn').state;
    return {state:staged,plan:{...plan,move:actualPosition(staged,a.id)},discovered:false,reconsider,withdrawal};
}
function prepare(state,plan,options){const flow=prepareFlow(state,plan);let item=flow.next();while(!item.done){const v=item.value;item=flow.next(E.moveActor(v.state,v.id,v.position,false,options));}return item.value;}
async function prepareAsync(state,plan,options){const flow=prepareFlow(state,plan);let item=flow.next();while(!item.done){const v=item.value;item=flow.next(await(options.move??((s,id,p)=>E.moveActor(s,id,p,false,options)))(v.state,v.id,v.position));}return item.value;}
function discoveryResult(before,prepared){const a=E.findActor(before,prepared.plan.actor),from=E.coordinate(a.position),to=E.coordinate(E.findActor(prepared.state,a.id).position);return {type:'move',actor:a.id,actorName:a.name,turn:prepared.plan.intent.turn,round:before.round,from,to,movement:{from,to},advancedAI:true,discovered:Boolean(prepared.discovered),...(prepared.withdrawal?{reassessedAfterWithdrawal:true}:{}),plan:prepared.plan};}
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
export function resolveAdvancedTurn(s,options={}){const id=E.currentActor(s)?.id,results=[];let state=s,afterWithdrawal=false;for(let i=0;i<250&&state.phase==='active'&&E.currentActor(state)?.id===id;i++){
    if(options.shouldStop?.())return aggregate(state,results,id,true);const before=state,started=performance.now(),plan=planAdvancedTurn(state,{afterWithdrawal});timing(options,started,plan);const prepared=prepare(state,plan,options),staged=prepared.state;if(prepared.cancelled)return aggregate(before,results,id,true);
    if(prepared.discovered||prepared.reconsider){state=staged;afterWithdrawal||=Boolean(prepared.withdrawal);results.push(discoveryResult(before,prepared));continue;}
    const resolved=staged.phase!=='active'||E.currentActor(staged)?.id!==id?{state:staged,result:{type:'endTurn',actor:id}}:resolve(staged,prepared.plan,options);
    if(resolved.result?.cancelled)return aggregate(before,results,id,true);state=resolved.state;results.push(decorate(before,resolved,prepared.plan));
    }if(state.phase==='active'&&E.currentActor(state)?.id===id)state=E.endTurn(state).state;return aggregate(state,results,id);}
export async function resolveAdvancedTurnAsync(s,options={}){const id=E.currentActor(s)?.id,results=[];let state=s,afterWithdrawal=false;for(let i=0;i<250&&state.phase==='active'&&E.currentActor(state)?.id===id;i++){
    if(options.shouldStop?.())return aggregate(state,results,id,true);const before=state,started=performance.now(),plan=planAdvancedTurn(state,{afterWithdrawal});timing(options,started,plan);const prepared=await prepareAsync(state,plan,options),staged=prepared.state;if(prepared.cancelled)return aggregate(before,results,id,true);
    if(prepared.discovered||prepared.reconsider){state=staged;afterWithdrawal||=Boolean(prepared.withdrawal);results.push(discoveryResult(before,prepared));await(options.yield?.()??new Promise(r=>setTimeout(r,0)));continue;}
    const resolved=staged.phase!=='active'||E.currentActor(staged)?.id!==id?{state:staged,result:{type:'endTurn',actor:id}}:await resolve(staged,prepared.plan,options);
    if(resolved.result?.cancelled)return aggregate(before,results,id,true);state=resolved.state;results.push(decorate(before,resolved,prepared.plan));await(options.yield?.()??new Promise(r=>setTimeout(r,0)));
    }if(state.phase==='active'&&E.currentActor(state)?.id===id)state=E.endTurn(state).state;return aggregate(state,results,id);}
