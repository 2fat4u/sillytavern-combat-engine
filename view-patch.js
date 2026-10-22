// Keep unchanged native controls and board cells in place; events are delegated on the root.
const rendered=new WeakMap();
function nodeKey(node){
    if(node.nodeType!==1)return '';
    const attr=name=>node.getAttribute(name);
    const explicit=attr('id')||attr('data-render-key')||attr('data-cell')||attr('name');
    if(explicit)return node.nodeName+':'+explicit;
    if(attr('data-x')!==null&&attr('data-y')!==null)return node.nodeName+':cell:'+attr('data-x')+','+attr('data-y');
    if(attr('data-action'))return node.nodeName+':'+attr('data-action')+':'+(attr('data-id')??'');
    return node.nodeName+':'+(attr('class')??'').split(/\s+/)[0];
}
function compatible(a,b){return a&&a.nodeType===b.nodeType&&a.nodeName===b.nodeName&&nodeKey(a)===nodeKey(b);}
function patchNode(node,next){
    if(node.nodeType!==1){if(node.nodeValue!==next.nodeValue)node.nodeValue=next.nodeValue;return;}
    if(node.outerHTML===next.outerHTML)return;
    for(const attr of [...node.attributes])if(!next.hasAttribute(attr.name))node.removeAttribute(attr.name);
    for(const attr of [...next.attributes])if(node.getAttribute(attr.name)!==attr.value)node.setAttribute(attr.name,attr.value);
    patchChildren(node,next);
    if(['INPUT','TEXTAREA','SELECT'].includes(node.nodeName)&&node.value!==next.value)node.value=next.value;
    if(node.nodeName==='INPUT'&&node.checked!==next.checked)node.checked=next.checked;
}
export function patchChildren(parent,next){
    const desired=[...next.childNodes];
    for(let i=0;i<desired.length;i++){
        const wanted=desired[i];let current=parent.childNodes[i];
        if(!compatible(current,wanted)){
            const match=[...parent.childNodes].slice(i+1).find(n=>compatible(n,wanted));
            if(match){parent.insertBefore(match,current??null);current=match;}
            else {parent.insertBefore(wanted.cloneNode(true),current??null);continue;}
        }
        patchNode(current,wanted);
    }
    while(parent.childNodes.length>desired.length)parent.removeChild(parent.childNodes[desired.length]);
}
export function patchView(root,html){
    // Busy/disabled flags and other native updates can change DOM after a render.
    if(rendered.get(root)===html&&root.innerHTML===html)return false;
    const template=(root.ownerDocument??globalThis.document)?.createElement?.('template');
    if(template?.content&&root.insertBefore&&root.removeChild){template.innerHTML=html;patchChildren(root,template.content);}
    else root.innerHTML=html; // Limited DOM harnesses and older embedders retain the full-render path.
    rendered.set(root,html);return true;
}
