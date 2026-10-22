import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareHistory,packHistory,unpackHistory} from '../history-codec.js';
import {patchChildren,patchView} from '../view-patch.js';
import * as E from '../engine.js';
import {createController} from '../controller.js';
import {planAdvancedTurn} from '../advanced-ai.js';

function snapshots(){const s=E.demoState();return Array.from({length:10},(_,i)=>({...E.clone(s),revision:i}));}
test('prepared history freezes past snapshots while retaining mutable live state and history push/pop',()=>{
 const values=snapshots(),live=E.clone(values[0]),h=prepareHistory(values);assert(Object.isFrozen(h[0].actors[0].resources));assert(!Object.isFrozen(h));assert(!Object.isFrozen(live));live.actors[0].name='Live edit';assert.notEqual(h[0].actors[0].name,live.actors[0].name);assert.throws(()=>{h[0].actors[0].name='Corruption';});h.pop();assert.equal(h.length,9);
});
test('unchanged immutable history content is serialized once across saves',()=>{
 const h=prepareHistory(snapshots()),original=JSON.stringify;let actorKeys=0;
 JSON.stringify=function(value,...args){if(value?.id===h[0].actors[0].id)actorKeys++;return original.call(JSON,value,...args);};
 try{const a=packHistory(h),first=actorKeys;assert(first>0);const b=packHistory(h);assert.equal(actorKeys,first);assert.deepEqual(a,b);assert.deepEqual(unpackHistory(b),Array.from(h));}finally{JSON.stringify=original;}
});
test('direct mutable packHistory inputs are never cached as immutable content',()=>{
 const h=snapshots();packHistory(h);h[0].actors[0].name='Changed before next save';const loaded=unpackHistory(packHistory(h));assert.equal(loaded[0].actors[0].name,'Changed before next save');
});
test('loaded history snapshots remain independent and a restored live state stays editable',async()=>{
 let bundle={state:E.demoState(),history:prepareHistory(snapshots())};bundle=JSON.parse(JSON.stringify(bundle));const c=createController({key:()=> 'cached-undo',read:()=>bundle,write:v=>{bundle=v;},save:async()=>{}});
 await c.undo();const id=c.state().actors[0].id;assert(!Object.isFrozen(c.state()));await c.edit(id,{name:'After Undo'});assert.equal(c.state().actors[0].name,'After Undo');await c.undo();assert.notEqual(c.state().actors[0].name,'After Undo');E.validateState(c.state());
});

// Small DOM test double: native-style tree/attribute operations, no layout or browser claims.
class Node {
 constructor(name,attrs={},children=[]){this.nodeName=name;this.nodeType=name==='#text'?3:1;this.nodeValue=this.nodeType===3?String(attrs):null;this.map=new Map(this.nodeType===1?Object.entries(attrs):[]);this.childNodes=[];this.value=this.map.get('value')??'';this.checked=this.map.has('checked');this.selectionStart=0;for(const n of children)this.insertBefore(n,null);}
 get attributes(){return [...this.map].map(([name,value])=>({name,value}));}
 get outerHTML(){return this.nodeType===3?this.nodeValue:'<'+this.nodeName+[...this.map].map(([k,v])=>' '+k+'="'+v+'"').join('')+'>'+this.childNodes.map(n=>n.outerHTML).join('')+'</'+this.nodeName+'>';}
 getAttribute(k){return this.map.get(k)??null;}hasAttribute(k){return this.map.has(k);}setAttribute(k,v){this.map.set(k,v);}removeAttribute(k){this.map.delete(k);}
 insertBefore(node,before){if(node.parentNode)node.parentNode.removeChild(node);const i=before?this.childNodes.indexOf(before):this.childNodes.length;this.childNodes.splice(i,0,node);node.parentNode=this;return node;}
 removeChild(node){this.childNodes.splice(this.childNodes.indexOf(node),1);node.parentNode=null;return node;}
 cloneNode(deep){const n=new Node(this.nodeName,this.nodeType===3?this.nodeValue:Object.fromEntries(this.map));n.value=this.value;n.checked=this.checked;if(deep)for(const c of this.childNodes)n.insertBefore(c.cloneNode(true),null);return n;}
}
const text=s=>new Node('#text',s),input=(name,value)=>new Node('INPUT',{name,value}),cell=(x,y,children=[])=>new Node('BUTTON',{'data-action':'cell','data-x':String(x),'data-y':String(y)},children);
test('HP-only rendering preserves the board cell, focused draft input and its selection',()=>{
 const draft=input('damage','1d4'),tile=cell(1,2),hp=new Node('SPAN',{'data-render-key':'hp'},[text('20 HP')]),root=new Node('DIV',{},[tile,draft,hp]);draft.value='2d6+1';draft.selectionStart=3;
 patchChildren(root,new Node('DIV',{},[cell(1,2),input('damage','1d4'),new Node('SPAN',{'data-render-key':'hp'},[text('17 HP')])]));
 assert.equal(root.childNodes[0],tile);assert.equal(root.childNodes[1],draft);assert.equal(draft.value,'2d6+1');assert.equal(draft.selectionStart,3);assert.equal(hp.childNodes[0].nodeValue,'17 HP');
});
test('keyed board cells and controls move without becoming different cells',()=>{
 const a=cell(1,2),b=cell(2,2),root=new Node('DIV',{},[a,b]);patchChildren(root,new Node('DIV',{},[cell(2,2),cell(1,2)]));assert.equal(root.childNodes[0],b);assert.equal(root.childNodes[1],a);
});
test('partial rendering adds/removes warnings without retaining stale controls or disabled attributes',()=>{
 const button=new Node('BUTTON',{'data-action':'endTurn',disabled:''},[text('End turn')]),root=new Node('DIV',{},[new Node('P',{class:'ct-error'},[text('Old error')]),button]);
 patchChildren(root,new Node('DIV',{},[new Node('BUTTON',{'data-action':'endTurn'},[text('End turn')])]));assert.equal(root.childNodes.length,1);assert.equal(root.childNodes[0],button);assert(!button.hasAttribute('disabled'));
});
test('changed selected values and checkboxes follow the new authoritative view',()=>{
 const field=input('quantity','3'),box=new Node('INPUT',{name:'enabled',checked:''}),root=new Node('DIV',{},[field,box]);patchChildren(root,new Node('DIV',{},[input('quantity','2'),new Node('INPUT',{name:'enabled'})]));assert.equal(field.value,'2');assert.equal(box.checked,false);
});
test('repeated identical view updates avoid additional full DOM replacement in the fallback harness',()=>{
 let writes=0,html='';const root={get innerHTML(){return html;},set innerHTML(v){writes++;html=v;}};assert(patchView(root,'<p>View</p>'));assert(!patchView(root,'<p>View</p>'));assert.equal(writes,1);patchView(root,'<p>New</p>');assert.equal(writes,2);
});
test('identical markup repairs an externally disabled or changed view after cancellation',()=>{
 const root={innerHTML:''};const html='<button>Act</button>';patchView(root,html);root.innerHTML='<button disabled>Act</button>';assert(patchView(root,html));assert.equal(root.innerHTML,html);
});
test('cached AI rankings remain pure and repeatable with several supplies and skills',()=>{
 let s=E.demoState();s.rules.stancesEnabled=false;s.actors[0].control='advanced';s=E.startCombat(s).state;const before=E.clone(s),p=planAdvancedTurn(s);assert.deepEqual(planAdvancedTurn(s),p);assert.deepEqual(s,before);
});
