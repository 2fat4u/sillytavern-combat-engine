import { retainsConcealment,isCombatant } from './engine.js?v=2.0.0-beta.6';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
export function hiddenFields(actor,state,language='de'){
 const l=(de,en)=>language==='en'?en:de;
 return '<details class="ct-fold"><summary>'+l('Versteckt','Hidden')+'</summary><div class="ct-fold-body"><input type="hidden" name="actor-hidden-present" value="1"><label><input type="checkbox" name="actor-hidden" '+(actor.hidden?'checked':'')+'> '+l('Versteckt','Hidden')+'</label><label class="ct-field"><span>'+l('Dauer: eigene Züge','Duration: own turns')+'</span><input type="number" name="actor-hidden-turns" min="1" max="100" value="'+esc(actor.hidden?.turns??3)+'"></label><p class="ct-muted">'+l('Manuelle Statuskorrektur ohne Aktion oder Probe. Verstecken muss aktiv sein; bei entsprechender Regel wird Deckung oder benachbartes Gelände benötigt. Nach dem Verlassen der Deckung bleibt der Status bis zur nächsten Aktion oder Reaktion erhalten; Schaden und Ablauf decken weiterhin auf. Im Kampfvorfeld gesetzte Verstecke bleiben beim Start erhalten.','Manual status correction without an action or check. Hiding must be enabled; the terrain rule may require cover or adjacent terrain. After leaving cover, the status lasts until the next action or reaction; damage and expiry still reveal. Concealment set before combat is retained at combat start.')+'</p></div></details>';
}
export function readHidden(data,actor,state,language='de'){
 if(!data.has('actor-hidden-present'))return actor.hidden;
 if(!data.has('actor-hidden'))return null;
 const l=(de,en)=>language==='en'?en:de,turns=Number(data.get('actor-hidden-turns'));
 if(!Number.isInteger(turns)||turns<1||turns>100)throw Error(l('Versteckt: Dauer von 1 bis 100 eigenen Zügen wählen.','Hidden: choose 1 to 100 own turns.'));
 if(!state.rules.stealthEnabled||!isCombatant(actor)||!actor.position||!retainsConcealment(state,actor))throw Error(l('Verstecken nicht möglich: Regel, Platzierung, Zustand und benötigtes Gelände prüfen.','Cannot hide: check the rule, placement, condition and required terrain.'));
 return {turns,appliedTurn:actor.hidden?.appliedTurn??state.turnSerial,...(actor.hidden?.pendingReveal?{pendingReveal:true}:{})};
}
