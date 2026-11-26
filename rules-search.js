const normalize=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase().replaceAll('ß','ss');
export function applyRuleSearch(root,query,language='de',scope='rule') {
    const terms=normalize(query).trim().split(/\s+/).filter(Boolean),sections=[...root.querySelectorAll(`[data-${scope}-search-section]`)];let matches=0;
    for(const section of sections){
        const text=normalize(section.textContent+' '+(section.dataset.searchTerms??''));
        const match=terms.every(t=>text.includes(t));section.hidden=!match;if(match)matches++;
        if(scope==='help')section.classList.toggle('ct-help-search-match',match&&terms.length>0);
        if(section.tagName==='DETAILS'){
            if(terms.length&&match){if(section.dataset.searchOpen===undefined){section.dataset.searchOpen='true';section.dataset.searchWasOpen=String(section.open);}section.open=true;}
            else if(section.dataset.searchOpen!==undefined){section.open=section.dataset.searchWasOpen==='true';delete section.dataset.searchOpen;delete section.dataset.searchWasOpen;}
        }
    }
    const status=root.querySelector(`[data-${scope}-search-status]`);
    const empty=scope==='help'?(language==='en'?'No matching help section':'Kein passender Hilfeabschnitt'):(language==='en'?'No matching rule section':'Kein passender Regelbereich');
    if(status)status.textContent=!terms.length?'':matches?matches+' / '+sections.length+(language==='en'?' sections':' Bereiche'):empty;
    return {matches,total:sections.length};
}
