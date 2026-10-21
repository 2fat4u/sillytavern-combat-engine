import test from 'node:test';
import assert from 'node:assert/strict';
import { initialize } from '../index.js';
class Element {
    constructor() { this.events={}; this.style={}; this.dataset={}; this.attributes={}; this.offsetWidth=120; this.offsetHeight=44; }
    addEventListener(name,fn) { this.events[name]=fn; }
    setAttribute(name,value) { this.attributes[name]=value; }
    getBoundingClientRect() { return {left:900,top:300}; }
    setPointerCapture() {}
}
const body=new Element(); body.append=e=>{body.child=e;};
globalThis.document={body,querySelector:()=>null,createElement:()=>new Element()};
globalThis.innerWidth=1024; globalThis.innerHeight=768;
let opened=0;
const context={chatId:'quick-test',chat:[],chatMetadata:{},extensionSettings:{},eventTypes:{},eventSource:{on(){}},setExtensionPrompt(){},saveMetadata:async()=>{},saveSettingsDebounced(){},saveMetadataDebounced(){},addOneMessage(){}};
globalThis.SillyTavern={getContext:()=>context};
const c=initialize({uiFactory:()=>({root:{open:false},open(){opened++;},chatChanged(){},destroy(){}})});
const button=body.child;
test('Schnellzugriff startet rechts und die Seite lässt sich zurücksetzen', async () => {
    assert.equal(button.style.right,'18px'); assert.equal(button.style.left,'auto'); assert.equal(button.style.bottom,'auto');
    await c.preferences({quickSide:'left'}); assert.equal(button.style.left,'18px'); assert.equal(button.style.right,'auto');
    await c.preferences({quickSide:'right'});
});
test('Button kann gezogen werden, bleibt im Fenster und löst beim Ziehen kein Öffnen aus', () => {
    button.events.pointerdown({button:0,pointerId:1,clientX:900,clientY:300});
    button.events.pointermove({pointerId:1,clientX:1200,clientY:900});
    button.events.pointerup({pointerId:1}); button.events.click();
    assert.equal(opened,0); assert.equal(button.style.left,'904px'); assert.equal(button.style.top,'724px');
    assert(context.extensionSettings.deterministic_combat_v1.quickPosition);
});
test('Sprachwahl übersetzt Schnellzugriff und Seitenwahl entfernt gespeicherte freie Position', async () => {
    await c.preferences({language:'en',quickSide:'right'});
    assert.equal(button.textContent,'⚔ Combat'); assert.equal(button.attributes['aria-label'],'Open combat control');
    assert.equal(context.extensionSettings.deterministic_combat_v1.quickPosition,null); assert.equal(button.style.right,'18px');
});
