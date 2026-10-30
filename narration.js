import { narrationEvents,narrationCause } from './model-context.js?v=2.0.0-beta.6';
const scopes=new Set(['auto','result','turn','batch']);
export function narrationScope(value='auto'){if(!scopes.has(value))throw Error('Ungültiger Erzählumfang.');return value;}
const boundaries=new Set(['undo','redo','import','reset','restore','time','start']);
const types=new Set(['hit','miss','move','skill','check','use','other','stabilize','rescue','shield','reserve','stance','reaction','conceal','effect','condition','turn','flee','end','remark']);
const token=e=>e.details?.afterTurn??e.details?.turn??e.details?.result?.turn;
export function narrationWindow(log,{scope='result',batch=null}={}){
 scope=narrationScope(scope);if(scope==='auto')scope=batch?.events?.length?'batch':'turn';
 let events,truncated=false;
 if(scope==='batch'){events=batch?.events??[];truncated=Boolean(batch?.truncated);}
 else if(scope==='result')events=narrationEvents(log);
 else{
  const visible=log.filter(e=>e.chatRelevant!==false),boundary=visible.findLast(e=>boundaries.has(e.type)),recent=visible.slice(boundary?visible.indexOf(boundary)+1:0),last=recent.findLast(e=>types.has(e.type)&&token(e)&&!e.details?.override&&!e.details?.deployment),turn=last&&token(last);
  events=turn?recent.filter(e=>types.has(e.type)&&token(e)===turn&&!e.details?.override&&!e.details?.deployment):boundary?[boundary]:narrationEvents(visible);
  if(recent.at(-1)?.type==='end'&&!events.includes(recent.at(-1)))events.push(recent.at(-1));
 }
 events=events.filter(e=>e.chatRelevant!==false);if(events.length>80){events=events.slice(-80);truncated=true;}
 let size=0;const kept=[];for(const event of events.slice().reverse()){const cost=briefEvent(event,'de').length+briefEvent(event,'en').length+JSON.stringify(damageDescriptions(event)).length;if(size+cost>24000){truncated=true;break;}size+=cost;kept.unshift(event);}
 return {scope,events:kept,truncated};
}
const finite=v=>typeof v==='number'&&Number.isFinite(v);
function severity(v,source){
 const amount=typeof v.damage==='number'?v.damage:v.damage?.damage??v.damage?.applied;
 if(!finite(amount)||amount<0)return null;
 const maxHp=finite(v.maxHp)&&v.maxHp>0?v.maxHp:null,ratio=maxHp?amount/maxHp:null,level=amount===0?'none':ratio===null?'damage':ratio>=.5?'devastating':ratio>=.25?'heavy':ratio>=.1?'solid':'light';
 const labels={none:['kein HP-Schaden','no HP damage'],damage:['Schaden','damage'],light:['leichter Schaden','light damage'],solid:['spürbarer Schaden','solid damage'],heavy:['schwerer Schaden','heavy damage'],devastating:['verheerender Schaden','devastating damage']};
 return {source,target:v.name??v.targetName??v.actorName??null,damage:amount,maxHp,level,de:labels[level][0],en:labels[level][1],...(v.condition||v.targetCondition?{condition:v.condition??v.targetCondition}:{}),...(finite(v.afterHp)?{afterHp:v.afterHp}:{}),...(finite(v.beforeHp)?{beforeHp:v.beforeHp}:{})};
}
export function damageDescriptions(event){
 const r=event.details?.result??event.details??{},values=[];
 if(r.type==='attack'||['hit','miss'].includes(event.type)){if(r.hit!==false&&!r.voided)for(const v of r.affected?.length?r.affected:[{...r,name:r.targetName}]){const item=severity(v,r.opportunity?'opportunity':r.reactionAttack?'counter':'attack');if(item)values.push(item);}}
 if(r.custom?.damage&&r.custom.success!==false){const item=severity({...r.custom,damage:r.custom.damage},'custom');if(item)values.push(item);}
 if(event.type==='effect'&&!r.skipped){const item=severity({...r,name:r.actorName},'periodic-damage');if(item)values.push(item);}
 return values;
}
export function briefEvent(event,language='de'){
 const en=language==='en',r=event.details?.result??event.details??{},actor=r.actorName??event.details?.actorName??'',target=r.targetName??'',l=(de,eng)=>en?eng:de;
 if(r.type==='attack'||['hit','miss'].includes(event.type))return actor+' → '+target+' · '+(r.weaponName??l('Angriff','Attack'))+': '+(r.voided?l('nicht ausgeführt','not executed'):r.hit?l('TREFFER','HIT'):l('FEHLSCHLAG','MISS'))+(r.critical?l(' · kritisch',' · critical'):'')+'. '+(r.affected??[]).map(v=>v.name+': '+v.damage+l(' Schaden',' damage')+', '+v.afterHp+'/'+v.maxHp+' HP'+(v.condition&&v.condition!=='fit'?' · '+v.condition:'')).join('; ')+(r.appliedEffects?.length?' · '+JSON.stringify(r.appliedEffects.map(v=>({target:v.name,status:v.type,turns:v.turns}))):'');
 if(event.type==='move')return actor+': '+r.from+' → '+r.to+(r.interrupted?l(' · unterbrochen',' · interrupted'):'');
 if(event.type==='use')return actor+' · '+r.resourceName+': '+(r.affected??[]).map(v=>v.name+' +'+v.healing+' HP'+(v.cures?.length?' · '+v.cures.join(', '):'')).join('; ')+(r.refill?' · '+r.refill.name+' +'+r.refill.amount+' ('+r.refill.before+' → '+r.refill.after+')':'');
 if(['skill','check','reaction'].includes(event.type)&&('success'in r))return actor+' → '+target+' · '+(r.skillName??r.description??l('Probe','Check'))+': '+(r.success?l('erfolgreich','succeeded'):l('fehlgeschlagen','failed'))+' · '+(r.custom?JSON.stringify(r.custom):r.outcome?.[language]??'');
 return (en?event.textEn:event.textDe)??event.text??'';
}
export function packNarrationEvent(event){
 const fields=['type','actor','actorName','target','targetName','source','round','turn','afterTurn','afterEvent','cause','automatic','condition','targetCondition','beforeHp','afterHp','maxHp','damage','hit','voided','critical','natural','mode','variant','ability','stat','attackBonus','total','dc','criticalFailure','rawDamage','damageType','damageRolls','damageFormula','damageBonus','opportunity','reactionAttack','description','weaponName','skillName','skillKind','success','from','to','interrupted','roundsLeft','effect','skipped','resourceName','alarm','callPosition','callApproach','callExpiresRound','cooldownRounds','recipients','stance','refill','outcome'];
 const data=event.details??{},details=Object.fromEntries(fields.filter(k=>Object.hasOwn(data,k)).map(k=>[k,data[k]]));
 for(const k of ['affected','appliedEffects','immuneEffects','custom','result','forcedMovement','opportunities','reactions'])if(data[k])details[k]=k==='opportunities'||k==='reactions'?data[k].map(v=>packNarrationEvent({details:v}).details):k==='result'||k==='forcedMovement'?packNarrationEvent({details:data[k]}).details:structuredClone(data[k]);
 return {id:event.id,type:event.type,at:event.at,chatRelevant:event.chatRelevant,details,textDe:briefEvent(event,'de').slice(0,2500),textEn:briefEvent(event,'en').slice(0,2500)};
}
export function narrationRecords(events,language='de',compact=false){
 const seen=new Set(events.flatMap(e=>{const r=e.details??{};return r.type==='attack'?[JSON.stringify([r.actor,r.target,r.turn,r.natural,r.damage])]:[];}));
 return events.map((e,i)=>{
  const r=e.details??{},damage=damageDescriptions(e);
  for(const nested of [...(r.opportunities??[]),...(r.reactions??[]),...(r.forcedMovement?.opportunities??[])]){const key=JSON.stringify([nested.actor,nested.target,nested.turn,nested.natural,nested.damage]);if(!seen.has(key)){seen.add(key);damage.push(...damageDescriptions({type:nested.hit?'hit':'miss',details:nested}));}}
  const cause=narrationCause(e),en=language==='en';
  // Keep automatic causes as structured facts, without making the prose repeat
  // the rescue timer. Stabilization preserves existing unconsciousness.
  const facts=cause==='rescue-expired'?(r.actorName??(en?'The participant':'Die Figur'))+(en?' dies.':' verstirbt.'):
   e.type==='stabilize'&&r.actorName&&r.targetName?r.actorName+(en?' stabilizes ':' stabilisiert ')+r.targetName+(en?'. The target remains unconscious; no HP were restored.':'. Das Ziel bleibt bewusstlos; keine HP wurden geheilt.'):
   compact?briefEvent(e,language):(en?e.textEn??e.text:e.textDe??e.text);
  return {eventId:e.id,eventType:e.type,role:compact?'recorded-action':i===0?'primary-result':'recorded-follow-up',cause,round:r.round??null,turn:token(e)??null,actor:r.actorName??null,target:r.targetName??null,facts,...(r.stance?{stance:r.stance}:{}),...(r.movement?{movement:r.movement}:{}),...(damage.length?{damageDescriptions:damage}:{})};
 });
}
