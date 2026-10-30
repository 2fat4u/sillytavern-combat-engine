import * as E from './engine.js?v=2.0.0-beta.6';
import { protection } from './defense.js?v=2.0.0-beta.6';
import { resistDamage } from './combat-traits.js?v=2.0.0-beta.6';
const key=p=>p.x+','+p.y;
export function observedHit(s,a,b,peak=false){
    const k=a.aiMemory.opponents.find(v=>v.id===b.id),p=protection(s,a);if(p.absorb||!k?.samples.length)return 0;
    const groups=new Map();for(const v of k.observations?.length?k.observations:k.samples.map(amount=>({type:k.damageType,amount}))){const values=groups.get(v.type)??[];values.push(v.amount);groups.set(v.type,values);}
    return Math.max(0,...[...groups].map(([type,values])=>Math.max(0,resistDamage(a,Math.floor(peak?Math.max(...values):values.reduce((n,v)=>n+v,0)/values.length),type).damage-p.reduce)));
}
// Forecast from witnessed attacks/movement, with modest generic assumptions for
// unknown opponents. Never inspect an enemy's weapon list, actions or movement stats.
export function makeDanger(s,a,enemies){
    const known=new Set(s.actors.filter(v=>v.id===a.id||E.visibleTo(s,a,v)).map(v=>v.id));
    const view={...s,actors:s.actors.map(v=>v.id===a.id?{...v,position:null}:known.has(v.id)?v:{...v,position:null})};
    const occupied=new Set(view.actors.filter(v=>v.position).map(v=>key(v.position))),cache=new Map();
    const forecasts=enemies.filter(b=>b.position&&known.has(b.id)).map(b=>{
        const k=a.aiMemory.opponents.find(v=>v.id===b.id),c=k?.combat,unknown=!c?.melee&&!c?.ranged;
        const stride=Math.max(3,c?.movement??0),routing=s.rules.boardEnabled?E.movementPaths(view,b.position,b.id,stride,p=>E.distance(p,b.position)<=stride):null;
        const sites=routing?[...routing.costs].filter(([k,cost])=>cost<=stride&&(!occupied.has(k)||k===key(b.position))).map(([k,cost])=>{const [x,y]=k.split(',').map(Number);return {position:{x,y},cost};}).filter(v=>E.canOccupy(view,v.position)):[{position:b.position,cost:0}];
        // A witnessed shot establishes a minimum, not the weapon's maximum range.
        return {b,unknown,melee:Boolean(c?.melee)||unknown,ranged:c?.ranged?Math.max(6,c.ranged):unknown?6:0,weight:unknown?.5:1,sites,damage:observedHit(s,a,b)||(!k?.samples.length?3:0),peak:observedHit(s,a,b,true)||(!k?.samples.length?3:0),attacks:c?.attacks??1};
    });
    function at(p){
        if(!s.rules.boardEnabled||!p){const damage=forecasts.reduce((n,f)=>n+f.damage*f.attacks,0),peak=Math.max(0,...forecasts.map(f=>f.peak*f.attacks));return {risk:damage/Math.max(1,a.maxHp)*8,damage,peak,melee:0,ranged:0};}
        const k=key(p);if(cache.has(k))return cache.get(k);let risk=0,damage=0,peak=0,melee=0,ranged=0;
        for(const f of forecasts){
            let close=false,shot=0;for(const site of f.sites){
                if(f.melee&&E.adjacentAccess(view,site.position,p))close=true;
                if(f.ranged&&E.distance(site.position,p)<=f.ranged&&E.clearSight(view,site.position,p))shot=Math.max(shot,E.coverDamagePercent(view,site.position,p)/100*Math.max(.45,1-site.cost*.15));
            }
            const exposure=Math.max(close?f.weight:0,shot*f.weight),expected=f.damage*f.attacks*exposure,possible=f.peak*f.attacks*exposure;
            damage+=expected;peak=Math.max(peak,possible);melee+=close?f.weight:0;ranged+=shot*f.weight;
            // Cover never reduces an observed melee threat. A hostile body can
            // reach this endpoint next turn even when it is not adjacent now.
            risk+=(close?(E.adjacentAccess(view,f.b.position,p)?5:3):0)*f.weight+expected/Math.max(1,a.maxHp)*8+(possible>=a.hp&&possible>0?12*exposure:0);
        }
        const value={risk,damage,peak,melee,ranged};cache.set(k,value);return value;
    }
    function benefit(from,to,wantsEscape){
        if(!from||!to||E.distance(from,to)===0)return 0;const old=at(from),next=at(to);
        let value=(wantsEscape?(old.melee-next.melee)*10:0);
        for(const f of forecasts)if(f.ranged){
            const oldCover=E.clearSight(s,f.b.position,from)?E.coverDamagePercent(s,f.b.position,from):0,newCover=E.clearSight(s,f.b.position,to)?E.coverDamagePercent(s,f.b.position,to):0;
            value+=(oldCover-newCover)*.1*f.weight;
        }
        for(const b of enemies){const near=E.adjacentAccess(s,b.position,from),newNear=E.adjacentAccess(s,b.position,to);value+=near&&!newNear&&wantsEscape?4:!near&&newNear?-4:0;}
        return value;
    }
    return {at,benefit};
}
