import { resultSelection } from './model-context.js?v=2.0.0-beta.4-hotfix.1';
// Every completed action uses the same compact board feedback, regardless of
// whether it was a weapon attack, an ability, a check or a support action.
export function compactResultFeedback(result,language='de') {
    if(!result)return null;
    const l=(de,en)=>language==='en'?en:de,failed=result.hit===false||result.success===false;
    if(result.skipped&&result.actor)return {label:l('Zug ausgesetzt','Turn skipped'),kind:'info'};
    let label;
    switch(result.type){
        case 'attack':
            if(result.interrupted)return {label:l('Angriff unterbrochen','Attack interrupted'),kind:'info'};
            if(result.voided)return {label:l('Angriff aufgehoben','Attack voided'),kind:'info'};
            label=result.misfire?'Friendly Fire':result.hit===false?l('Angriff verfehlt','Attack missed'):result.critical?l('Kritischer Treffer','Critical hit'):l('Treffer','Hit');break;
        case 'skill':label=failed?l('Fähigkeit fehlgeschlagen','Ability failed'):l('Fähigkeit erfolgreich','Ability succeeded');break;
        case 'check':label=failed?l('Eigene Probe fehlgeschlagen','Own check failed'):l('Eigene Probe erfolgreich','Own check succeeded');break;
        case 'use':label=result.refill?l('Vorrat aufgefüllt','Stock refilled'):l('Behandlung ausgeführt','Treatment used');break;
        case 'shield':label=l('Schutz aktiviert','Shield activated');break;
        case 'reserve':label=l('Reaktion reserviert','Reaction reserved');break;
        case 'rescue':label=l('Figur hochgezogen','Participant pulled up');break;
        case 'stabilize':label=l('Figur stabilisiert','Participant stabilized');break;
        case 'flee':label=failed?l('Flucht fehlgeschlagen','Flee failed'):l('Figur geflohen','Participant fled');break;
        case 'other':label=result.alarm?l('Verbündete alarmiert','Allies alerted'):l('Aktion abgeschlossen','Action completed');break;
        case 'move':return {label:l('Figur bewegt','Participant moved'),kind:'info'};
        case 'endTurn':return {label:result.actionUsed?l('Zug beendet','Turn ended'):l('Zug ohne Aktion beendet','Turn ended without an action'),kind:'info'};
        default:return null;
    }
    if(result.criticalFailure)label=l('Kritischer Misserfolg','Critical failure');
    return {label,kind:failed||result.misfire?'failure':'success'};
}
export function latestResult(log) {
    const selected=resultSelection(log),action=selected.event&&['hit','miss','use','skill','other','stabilize','flee','shield','reserve','check','rescue','remark'].includes(selected.event.type);
    // The result card may also show subsequent status ticks as separate facts;
    // focused narration keeps only the immediately associated effects.
    return {...selected,following:action?log.slice(log.indexOf(selected.event)+1).filter(e=>e.chatRelevant!==false&&e.type==='effect'&&!e.details?.skipped):[]};
}
export function compactResultContext(result,language='de'){
    const l=(de,en)=>language==='en'?en:de,people=[result?.actorName,result?.targetName].filter(Boolean),parts=[];
    if(people.length)parts.push(people.join(' → '));
    if(result?.type==='attack'&&!result.voided&&Number.isFinite(result.damage))parts.push(result.damage+l(' Schaden',' damage'));
    if(result?.type==='move'&&result.from&&result.to)parts.push(result.from+' → '+result.to);
    if(result?.type==='other'&&result.alarm)parts.push((result.recipients?.length??0)+l(' alarmiert',' alerted'));
    return parts.join(' · ');
}
