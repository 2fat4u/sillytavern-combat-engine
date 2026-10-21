import test from 'node:test';
import assert from 'node:assert/strict';
import {createPreviewStorage,previewInventory,previewStorageKey} from '../preview-storage.js';
const current='ct-eigene-faehigkeiten-1920hf4-v1',old='ct-bergen-zustaende-1919-hotfix3-v1',older='ct-adventure-testpack-199-v1';
class MemoryStorage{
 constructor(entries=[]){this.data=new Map(entries);this.limit=Infinity;this.removed=[];}
 get length(){return this.data.size;}key(i){return [...this.data.keys()][i]??null;}getItem(k){return this.data.get(k)??null;}
 setItem(k,v){const next=new Map(this.data);next.set(k,v);if([...next].reduce((n,[k,v])=>n+2*(k.length+v.length),0)>this.limit)throw Object.assign(Error('quota'),{name:'QuotaExceededError'});this.data=next;}
 removeItem(k){this.removed.push(k);this.data.delete(k);}
}
function fixture(){let bundle={state:{name:'Current',actors:[{id:'a',hp:8}]},history:[{name:'before'}],images:{picture:'image'},library:[{name:'Wizard'}],maps:[{name:'Castle'}],preferences:{language:'de'}};const storage=new MemoryStorage([[current,JSON.stringify(bundle)],[old,JSON.stringify({state:{name:'Old map',actors:[]},history:[1,2]})],['other-app-data','do not touch']]);const changes=[];const store=createPreviewStorage({storage:()=>storage,key:current,getBundle:()=>bundle,setBundle:next=>{bundle=next;},onChange:()=>changes.push('changed')});return {storage,store,get:()=>bundle,changes};}
test('preview storage only recognizes exact standalone preview namespaces',()=>{
 for(const key of [current,old,older,'ct-combat-demo-v1','ct-features-test1917-v1'])assert(previewStorageKey(key));
 for(const key of ['ct-other-v1','ct-combat-demo-v2','sillytavern','ct-eigene-faehigkeiten-x-v1-evil',null,'ct-eigene-faehigkeiten-'+ 'x'.repeat(100)+'-v1'])assert(!previewStorageKey(key));
});
test('inventory lists accessible preview records with approximate size and protects current',()=>{
 const f=fixture(),rows=previewInventory(f.storage,current);assert.equal(rows.length,2);assert(rows[0].current);assert.equal(rows[1].name,'Old map');assert.equal(rows[1].history,2);assert.equal(rows[1].bytes,2*(old.length+f.storage.getItem(old).length));
});
test('damaged old preview JSON remains listed for backup without interpreting it',()=>{
 const f=fixture();f.storage.setItem(older,'not JSON');const item=f.store.inventory().find(v=>v.key===older);assert.equal(item.name,older);assert.equal(item.value,'not JSON');assert.equal(f.store.backup().entries.find(v=>v.key===older).value,'not JSON');
});
test('quota failure retains live battle, old persisted data and every other key; retry saves once space is available',()=>{
 const f=fixture(),before=f.storage.getItem(current),size=f.storage.data.size;f.get().state.actors[0].hp=7;f.storage.limit=0;assert.equal(f.store.save(),false);assert.deepEqual(f.store.status(),{saved:false,error:'quota'});assert.equal(f.storage.getItem(current),before);assert.equal(f.storage.data.size,size);assert.equal(f.get().state.actors[0].hp,7);assert.deepEqual(f.storage.removed,[]);f.storage.limit=Infinity;assert(f.store.save());assert.equal(JSON.parse(f.storage.getItem(current)).state.actors[0].hp,7);assert.deepEqual(f.store.status(),{saved:true,error:null});
});
test('backup retains unsaved current state and full bundle separately from persisted snapshots',()=>{
 const f=fixture();f.get().state.actors[0].hp=4;const backup=f.store.backup();assert.equal(backup.type,'deterministic-combat-preview-backup');assert.equal(backup.entries.length,2);assert.equal(JSON.parse(backup.entries.find(v=>v.key===current).value).state.actors[0].hp,8);assert.deepEqual(JSON.parse(backup.current.value),f.get());assert.equal(JSON.parse(backup.current.value).state.actors[0].hp,4);assert(!JSON.stringify(backup).includes('other-app-data'));assert.deepEqual(f.storage.removed,[]);
});
test('selected old records alone are deleted and current live state is saved afterwards',()=>{
 const f=fixture();f.storage.setItem(older,'oldest');const backup=f.store.backup();f.get().state.actors[0].hp=6;assert.equal(f.store.remove([old,old],backup),1);assert.equal(f.storage.getItem(old),null);assert.equal(f.storage.getItem(older),'oldest');assert.equal(f.storage.getItem('other-app-data'),'do not touch');assert.equal(JSON.parse(f.storage.getItem(current)).state.actors[0].hp,6);assert.deepEqual(f.storage.removed,[old]);
});
test('current and unrelated keys cannot be deleted, including mixed selections',()=>{
 for(const keys of [[current],['other-app-data'],[old,current],[old,'ct-unknown-v1']]){const f=fixture(),backup=f.store.backup();assert.throws(()=>f.store.remove(keys,backup),/protected/);assert.deepEqual(f.storage.removed,[]);}
});
test('deletion requires a nonempty choice and a matching backup',()=>{
 const f=fixture();assert.throws(()=>f.store.remove([],f.store.backup()),/empty/);assert.throws(()=>f.store.remove([old],null),/backup/);assert.deepEqual(f.storage.removed,[]);
});
test('changes made by another tab invalidate the entire selected deletion before any removal',()=>{
 const f=fixture();f.storage.setItem(older,'oldest');const backup=f.store.backup();f.storage.setItem(older,'new work from another tab');assert.throws(()=>f.store.remove([old,older],backup),/changed/);assert(f.storage.getItem(old));assert.deepEqual(f.storage.removed,[]);
});
test('an entry created after the backup cannot be deleted using that backup',()=>{
 const f=fixture(),backup=f.store.backup();f.storage.setItem(older,'new');assert.throws(()=>f.store.remove([older],backup),/changed/);assert.deepEqual(f.storage.removed,[]);
});
test('history cleanup retains exact state, images, templates, maps and settings and refreshes Undo',()=>{
 const f=fixture(),before=structuredClone(f.get()),backup=f.store.backup();assert(f.store.trimHistory(backup));assert.deepEqual(f.get(),{...before,history:[]});assert.deepEqual(JSON.parse(f.storage.getItem(current)),f.get());assert.equal(f.changes.length,1);assert(f.storage.getItem(old));assert.deepEqual(f.storage.removed,[]);
});
test('history cleanup refuses a changed current battle until it is backed up again',()=>{
 const f=fixture(),backup=f.store.backup();f.get().state.actors[0].hp=1;assert.throws(()=>f.store.trimHistory(backup),/changed/);assert.equal(f.get().history.length,1);assert.equal(f.changes.length,0);
});
test('failed history cleanup leaves the live undo history intact',()=>{
 const f=fixture(),before=structuredClone(f.get()),backup=f.store.backup();f.storage.limit=0;assert.equal(f.store.trimHistory(backup),false);assert.deepEqual(f.get(),before);assert.equal(f.changes.length,0);assert.equal(f.store.status().error,'quota');
});
test('browser storage denial reports unavailable rather than propagating a failed combat action',()=>{
 const f=fixture(),store=createPreviewStorage({storage:()=>{throw Object.assign(Error('denied'),{name:'SecurityError'});},key:current,getBundle:f.get,setBundle:()=>{}});assert.equal(store.save(),false);assert.equal(store.status().error,'storage');assert.throws(()=>store.backup(),/denied/);
});
test('interrupted deletion reports its completed count without touching unrelated data',()=>{
 const f=fixture();f.storage.setItem(older,'oldest');const backup=f.store.backup(),remove=f.storage.removeItem.bind(f.storage);f.storage.removeItem=k=>{if(k===older)throw Error('denied');remove(k);};assert.throws(()=>f.store.remove([old,older],backup),e=>e.message==='delete'&&e.removed===1);assert.equal(f.storage.getItem('other-app-data'),'do not touch');assert(f.storage.getItem(current));assert.equal(f.storage.getItem(older),'oldest');
});
