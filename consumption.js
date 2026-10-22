// A use has one cost and one ultimate stock, even when an ability selects a linked supply.
export function unitCost(value=1) { const n=Number(value);if(value===''||value==null||typeof value==='boolean'||!Number.isSafeInteger(n)||n<0||n>1000000)throw new Error('Kosten: ganze Zahl 0 bis 1000000 erforderlich.');return n; }
export function stockSource(a,p,supply=false){
    const selected=supply?p:(a.resources??[]).find(r=>r.id===p.resource);
    const id=selected?.kind==='supply'?(selected.consumption==='none'?null:selected.consumption==='linked'?selected.stock:selected.id):supply?p.id:p.resource;
    return {id:id??null,stock:id?(a.resources??[]).find(r=>r.id===id):null};
}
export function stockLabel(a,r,language='de'){
    const {id,stock}=stockSource(a,r,true),l=(de,en)=>language==='en'?en:de;
    return r.name+' · '+(r.kind==='supply'&&r.consumption==='linked'&&!stock?l('Vorrat fehlt','stock missing'):!id?l('ohne Verbrauch','no consumption'):!stock?l('Vorrat fehlt','stock missing'):(stock.id!==r.id?stock.name+' · ':'')+stock.quantity+(stock.capacity!=null?' / '+stock.capacity:''));
}
export function consumption(s,a,p,supply=false) {
    const cost=s.rules.resourcesEnabled?unitCost(p.cost??1):0,{id,stock}=stockSource(a,p,supply);
    return {cost:id?cost:0,stock,id,available:!id||cost===0||Boolean(stock&&stock.quantity>=cost)};
}
export function canPay(s,a,p,supply=false) { return consumption(s,a,p,supply).available; }
export function pay(s,a,p,supply=false) {const v=consumption(s,a,p,supply);if(!v.available)throw new Error('Vorrat ist aufgebraucht oder reicht nicht für die Kosten dieses Einsatzes.');if(v.cost)v.stock.quantity-=v.cost;return v.stock?{id:v.stock.id,name:v.stock.name,quantity:v.stock.quantity,cost:v.cost}:null;}
