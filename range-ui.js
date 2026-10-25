import { rangeText } from './engine.js?v=2.0.0-beta.4-hotfix.2';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
export function throwRangeFields(profile,state,actor,language,rangeName,flagName,{weapon=false,modeName=''}={}){
    const l=(de,en)=>language==='en'?en:de;
    return '<input type="hidden" name="'+flagName+'-present" value="1"><label class="ct-field ct-check"><span><input type="checkbox" name="'+flagName+'" '+(profile.strengthRange?'checked':'')+' '+(weapon&&profile.mode!=='ranged'?'disabled':'')+'> '+l('Stärkemodifikator zur Wurfreichweite','Add Strength modifier to throwing range')+'</span></label>'+
        '<small class="ct-range-preview" data-range-name="'+rangeName+'" data-range-flag="'+flagName+'" data-range-weapon="'+weapon+'" data-range-mode="'+modeName+'">'+(state&&actor?esc(rangeText(state,actor,profile,language,weapon)):'')+'</small>'+
        '<small class="ct-muted">'+l('Optional für geworfene Gegenstände. Mindestens 1 Feld; Reichweite 0 bleibt selbst.','Optional for thrown items. Minimum 1 cell; range 0 remains self.')+(state?.rules.strengthRangeEnabled===false?' '+l('STR-Wurfweite ist unter Regeln ausgeschaltet.','Strength throwing range is disabled under Rules.'):'')+(weapon?' '+l('Mit STR-Option gilt für diese Wurfwaffe kein Wahrnehmungsbonus.','With the STR option, Perception does not apply to this throwing weapon.'):'')+'</small>';
}
export function readThrowRange(data,name,old=false){return data.has(name+'-present')?data.has(name):old;}
export function bindThrowRanges(form,state,actor,language){
    const refresh=()=>{for(const node of form.querySelectorAll('[data-range-name]')){
        const d=node.dataset,base=form.elements?.namedItem?.(d.rangeName)??form.elements?.[d.rangeName],flag=form.elements?.namedItem?.(d.rangeFlag)??form.elements?.[d.rangeFlag],mode=form.elements?.namedItem?.(d.rangeMode)??form.elements?.[d.rangeMode];
        if(!base||!flag)continue;const weapon=d.rangeWeapon==='true',profile={range:Number(base.value),strengthRange:flag.checked,mode:mode?.value??'ranged'};
        flag.disabled=weapon&&profile.mode!=='ranged';node.textContent=base.value!==''&&Number.isFinite(profile.range)?rangeText(state,actor,profile,language,weapon):'';
    }};
    form.addEventListener('input',refresh);form.addEventListener('change',refresh);refresh();
}
