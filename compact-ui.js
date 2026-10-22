export function compactPreferences(raw={}){const sections=raw.compactSections??{};return {compactUI:raw.compactUI===true,compactSections:{movement:sections.movement===true,batch:sections.batch===true,stance:sections.stance===true}};}
export function compactSettingsMarkup(raw={},language='de'){
    const l=(de,en)=>language==='en'?en:de,p=compactPreferences(raw);
    return '<h3>'+l('Kompakte Oberfläche','Compact interface')+'</h3><label class="ct-rule"><input type="checkbox" name="compactUI" '+(p.compactUI?'checked':'')+'><span>'+l('Kompaktmodus einschalten','Enable compact mode')+'</span></label><p class="ct-muted">'+l('Kampfhaltung, Aktionsbudget und Einsatzkosten bleiben sichtbar. Bewegungsdetails, KI-Serie, Vorräte und andere Aktionen lassen sich aufklappen. Zusätzliche Erklärungen stehen gesammelt im Bereich Erklärungen.','Combat stance, action budget and use costs remain visible. Expand movement details, AI batch settings, stocks and other actions. Extra explanations are collected in the Explanations section.')+'</p><details class="ct-fold"><summary>'+l('Standardmäßig aufgeklappte Bereiche','Sections expanded by default')+'</summary><div class="ct-fold-body">'+[['movement',l('Bewegung: Details','Movement: details')],['batch',l('KI-Serie: Einstellungen und Fortschritt','AI batch: settings and progress')],['stance',l('Kampfhaltung: Erklärung','Combat stance: explanation')]].map(([id,label])=>'<label class="ct-rule"><input type="checkbox" name="compact-'+id+'" '+(p.compactSections[id]?'checked':'')+'><span>'+label+'</span></label>').join('')+'</div></details>';
}
export function applyCompact(root,raw={}){const p=compactPreferences(raw);root.classList?.toggle?.('ct-compact',p.compactUI);for(const node of root.querySelectorAll('[data-compact-section]'))node.hidden=false;}

// Only explicitly tagged explanations move into this fold; live costs,
// availability, targeting restrictions and warnings remain in their controls.
export function compactExplanations(html,preferences={},open=false){
    if(!preferences.compactUI||!html.includes('</aside>'))return html;
    const notes=[];
    const body=html.replace(/<(p|small) class="[^"]*\bct-compact-explanation\b[^"]*"[^>]*>[\s\S]*?<\/\1>/g,part=>{if(/<(input|select|button|textarea)\b/.test(part))return part;if(!notes.includes(part))notes.push(part);return '';});
    const title=preferences.language==='en'?'Explanations':'Erklärungen';
    return notes.length?body.replace('</aside>','<details class="ct-fold ct-compact-help" data-fold="compact-help" '+(open?'open':'')+'><summary>'+title+'</summary><div class="ct-fold-body">'+notes.join('')+'</div></details></aside>'):body;
}
