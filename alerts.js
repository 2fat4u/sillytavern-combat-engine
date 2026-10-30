// Bounded rally notices shared by manual actors, Basic AI and Advanced AI.
// Engine geometry, visibility and action checks are supplied through env.
const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
const require=(v,m)=>{if(!v)throw Error(m);};
const integer=(v,min,max)=>{require(typeof v!=='boolean'&&v!==''&&Number.isSafeInteger(Number(v))&&Number(v)>=min&&Number(v)<=max,'Alarm: ungültiger Zahlenwert.');return Number(v);};
const id=v=>{require(typeof v==='string'&&v.length>0&&v.length<=100,'Alarm: ungültige Kennung.');return v;};
export function callMemoryFrom(v){
 if(v==null)return null;require(object(v)&&object(v.position),'Alarm: ungültiger Sammelpunkt.');require(['party','enemy'].includes(v.side)&&typeof v.done==='boolean','Alarm: ungültiger Ruf.');
 const round=integer(v.round,0,Number.MAX_SAFE_INTEGER),expires=integer(v.expires,round,Number.MAX_SAFE_INTEGER);
 require((v.approach==null||typeof v.approach==='boolean')&&(v.engaged==null||typeof v.engaged==='boolean'),'Alarm: ungültige Annäherung.');
 return {id:id(v.id),source:id(v.source),side:v.side,position:{x:integer(v.position.x,0,49),y:integer(v.position.y,0,49)},round,expires,done:v.done,...(v.approach?{approach:true}:{}),...(v.engaged?{engaged:true}:{})};
}
export function callCooldownFrom(v=0){return integer(v,0,Number.MAX_SAFE_INTEGER);}
const faction=a=>a.side==='enemy'?'enemy':'party';
export function activeCall(s,a){
 const v=a?.aiMemory?.packCall,source=v&&s.actors.find(b=>b.id===v.source);
 return v&&v.expires>s.round&&v.side===faction(a)&&source&&faction(source)===v.side&&!source.escaped&&source.condition!=='dead'?v:null;
}
const seesEnemy=(s,a,env)=>s.actors.some(b=>env.isCombatant(b)&&faction(b)!==faction(a)&&env.visibleTo(s,a,b));
export function callEngaged(s,a,env){return s.actors.some(b=>env.isCombatant(b)&&faction(b)!==faction(a)&&env.visibleTo(s,a,b)&&(s.rules.visionEnabled||env.distance(a.position,b.position)<=3&&(!env.clearSight||env.clearSight(s,a.position,b.position))));}
export function callArrived(s,a,call,env){
 if(!a.position||!call?.position)return false;const d=env.distance(a.position,call.position);
 return call.approach?d>=2&&d<=Math.min(3,Math.max(2,s.rules.visionEnabled?(env.visionRange?.(s,a)??3):3))&&(!env.clearSight||env.clearSight(s,a.position,call.position)):d<=1;
}
export function callBusy(s,a,env){
 const call=a?.aiMemory?.packCall;if(!call||call.side!==faction(a))return false;
 if(call.source!==a.id)return Boolean(activeCall(s,a));
 return s.actors.some(b=>b.id!==a.id&&env.isCombatant(b)&&faction(b)===faction(a)&&b.aiMemory?.packCall?.id===call.id&&
  (activeCall(s,b)||(b.aiMemory.packCall.done&&b.position&&env.distance(a.position,b.position)<=2)));
}
export function callRecipients(s,a,config,env){
 if(!a.position)return [];
 const point=config.position??a.position;
 return s.actors.filter(b=>(!config.controls||config.controls.includes(b.control))&&b.id!==a.id&&faction(b)===faction(a)&&env.isCombatant(b)&&b.position&&(config.approach?!callArrived(s,b,{position:point,approach:true},env):env.distance(a.position,b.position)>1)&&env.distance(a.position,b.position)<=config.range&&
  !env.immobile(s,b)&&!callEngaged(s,b,env)&&!activeCall(s,b)&&(b.aiMemory?.callCooldown??0)<=s.round&&env.canReach(s,b,point,config.approach));
}
export function callStatus(s,a,config,env){
 if(s.phase!=='active'||!s.rules.boardEnabled||!env.isCombatant(a)||!a.position||env.stunned(s,a))return {ready:false,reason:'unavailable',recipients:[]};
 const remaining=Math.max(0,(a.aiMemory?.callCooldown??0)-s.round);
 if(remaining)return {ready:false,reason:'cooldown',remaining,recipients:[]};
 if(callBusy(s,a,env))return {ready:false,reason:'informed',recipients:[]};
 const recipients=callRecipients(s,a,config,env);return {ready:recipients.length>0,reason:recipients.length?'ready':'none',recipients};
}
export function beginCall(s,a,config,recipients,env){
 const notice={id:env.uid(),source:a.id,side:faction(a),position:{...(config.position??a.position)},round:s.round,expires:s.round+config.turns,done:false,...(config.approach?{approach:true}:{})};
 for(const b of [a,...recipients]){
  b.aiMemory.packCall={...notice,position:{...notice.position},done:b.id===a.id};
  b.aiMemory.callCooldown=Math.max(b.aiMemory.callCooldown??0,s.round+config.cooldown);
 }
 return {alarm:true,callPosition:{...notice.position},...(config.approach?{callApproach:true}:{}),callExpiresRound:notice.expires,cooldownRounds:config.cooldown,recipients:recipients.map(b=>b.id)};
}
export function refreshCall(s,a,env){
 const v=a.aiMemory?.packCall;if(!v)return;
 const source=s.actors.find(b=>b.id===v.source);
 if(v.side!==faction(a)||!source||faction(source)!==v.side){a.aiMemory.packCall=null;return;}
 if(activeCall(s,a)&&v.source!==a.id&&a.position){if(callEngaged(s,a,env)){v.done=true;v.engaged=true;}else if(callArrived(s,a,v,env))v.done=true;}
}
export function autoCallAllowed(s,a,config,env){
 return (seesEnemy(s,a,env)||a.control==='advanced'&&env.hasClue?.(s,a))&&!s.actors.some(b=>b.id!==a.id&&faction(a)===faction(b)&&env.isCombatant(b)&&b.position&&env.distance(a.position,b.position)<=Math.min(config.range,3)&&callEngaged(s,b,env));
}
export function callReason(status,language='de'){
 const en=language==='en';return ({unavailable:en?'Alert requires an active board and a conscious caller.':'Alarmieren benötigt ein aktives Spielfeld und eine kampffähige Figur.',cooldown:en?'Alert cooldown: '+status.remaining+' rounds.':'Alarm-Cooldown: noch '+status.remaining+' Runden.',informed:en?'Reinforcements already informed, on their way or nearby.':'Verstärkung ist bereits verständigt, unterwegs oder vor Ort.',none:en?'No additional available allies can be alerted in range.':'Keine weiteren verfügbaren Verbündeten im Alarmradius.'})[status.reason]??'';
}
