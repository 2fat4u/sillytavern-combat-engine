import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../engine.js';
import { captureMap, mapFrom } from '../maps.js';
import { createController } from '../controller.js';
import { bindMapOptions } from '../deployment-ui.js';

const key=p=>`${p.x},${p.y}`;
const styles=['light','groves','dense','path'];
function scene(width,height){return E.setBoard(E.emptyState(),{width,height}).state;}

for(const forestStyle of styles)test(`${forestStyle}: forest maps are repeatable, connected and preserve placed actors and combat dice`,()=>{
    for(const [width,height] of [[2,2],[4,7],[10,10],[17,23],[30,30],[50,50],[2,30],[30,2]])for(let i=0;i<10;i++){
        let s=E.setRules(scene(width,height),{coverCrossable:false}).state;
        for(const [name,side,position] of [['Party','player',{x:0,y:0}],['Foe','enemy',{x:width-1,y:height-1}]])s=E.addActor(s,{name,side,position}).state;
        const opts={preset:'forest',forestStyle,seed:'woodland-'+i},next=E.randomBoard(s,opts).state;
        assert.equal(next.board.forestStyle,forestStyle);
        assert.deepEqual(next.board,E.randomBoard(s,opts).state.board);
        assert.deepEqual(next.actors,s.actors);assert.deepEqual(next.rng,s.rng);
        const walk={...next,actors:[]},paths=E.pathDistances(walk,{x:0,y:0},'');
        for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(E.canOccupy(walk,{x,y}))assert(paths.has(`${x},${y}`),`Isolated clearing: ${forestStyle} ${width}x${height}, seed ${i}`);
        assert(paths.has(`${width-1},${height-1}`));
        assert.deepEqual(E.validateState(JSON.parse(JSON.stringify(next))),next);
    }
});

test('Light woodland, clusters and dense forest have different densities, with sparse separated cover',()=>{
    const treeCounts={light:0,groves:0,dense:0,path:0},coverCounts={...treeCounts};
    for(let i=0;i<24;i++)for(const forestStyle of styles){
        const s=E.randomBoard(scene(30,30),{preset:'forest',forestStyle,seed:'density-'+i}).state;
        treeCounts[forestStyle]+=s.board.blocked.length;coverCounts[forestStyle]+=s.board.cover.length;
        for(const p of s.board.cover)assert(s.board.cover.every(q=>q===p||E.distance(p,q)>1),'Cover cells must have breathing room');
        const walls=new Set(s.board.blocked.map(key));
        assert(s.board.blocked.some(p=>walls.has(`${p.x+1},${p.y}`)&&walls.has(`${p.x},${p.y+1}`)),'Retain tree clusters');
    }
    assert(treeCounts.light<treeCounts.groves);assert(treeCounts.groves<treeCounts.dense);
    assert(treeCounts.light<treeCounts.path);assert(treeCounts.path<treeCounts.dense);
    for(const forestStyle of styles)assert(coverCounts[forestStyle]/(24*900)<.08,'Avoid the old blanket of adjacent cover');
});

function broadTrail(board){
    const solid=new Set([...board.blocked,...board.cover].map(key)),core=new Set();
    for(let y=1;y<board.height-1;y++)for(let x=1;x<board.width-1;x++){
        if(Array.from({length:9},(_,i)=>`${x+i%3-1},${y+Math.floor(i/3)-1}`).every(p=>!solid.has(p)))core.add(`${x},${y}`);
    }
    for(const axis of ['x','y']){
        const size=axis==='x'?board.width:board.height,queue=[...core].filter(v=>Number(v.split(',')[axis==='x'?0:1])===1),seen=new Set(queue);
        for(let i=0;i<queue.length;i++){
            const [x,y]=queue[i].split(',').map(Number);if((axis==='x'?x:y)===size-2)return true;
            for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const p=`${x+dx},${y+dy}`;if(core.has(p)&&!seen.has(p)){seen.add(p);queue.push(p);}}
        }
    }
    return false;
}

test('Forest trail leaves a continuous broad passage between opposite map edges',()=>{
    for(const [width,height] of [[10,10],[20,30],[30,20],[30,30],[50,50]])for(let i=0;i<20;i++){
        const s=E.randomBoard(scene(width,height),{preset:'forest',forestStyle:'path',seed:'trail-'+i}).state;
        assert(broadTrail(s.board),`Missing clear trail: ${width}x${height}, seed ${i}`);
    }
});

test('Forest choice survives map/combat transfer and regeneration; legacy maps are not regenerated',()=>{
    for(const forestStyle of styles){
        const s=E.randomBoard(scene(30,30),{preset:'forest',forestStyle,seed:'save'}).state;
        const saved=mapFrom(JSON.parse(JSON.stringify(captureMap(s,'Forest'))));assert.equal(saved.board.forestStyle,forestStyle);
        const loaded=E.validateState(JSON.parse(JSON.stringify(s)));
        assert.deepEqual(E.randomBoard(loaded,{preset:'forest',seed:'save'}).state.board,s.board);
        delete loaded.board.forestStyle;
        const legacy=E.validateState(loaded);
        assert.equal(legacy.board.forestStyle,'groves');
        assert.deepEqual(legacy.board.blocked,s.board.blocked);assert.deepEqual(legacy.board.cover,s.board.cover);
    }
    const s=scene(30,30),before=E.clone(s);
    assert.throws(()=>E.randomBoard(s,{preset:'forest',forestStyle:'invalid'}),/Waldaufteilung/);assert.deepEqual(s,before);
});

test('Changing the forest style has one Undo step and preserves the actor setup',async()=>{
    const s=scene(30,30);let bundle={state:s,history:[]};
    const c=createController({key:()=> 'forest',read:()=>bundle,write:v=>bundle=v,save:async()=>{}});
    await c.randomBoard({preset:'forest',forestStyle:'dense',seed:'dense'});
    const previous=E.clone(c.state().board);
    await c.randomBoard({preset:'forest',forestStyle:'path',seed:'trail'});
    assert.equal(c.state().board.forestStyle,'path');await c.undo();assert.deepEqual(c.state().board,previous);
    assert.deepEqual(c.state().actors,s.actors);assert.deepEqual(c.state().rng,s.rng);
});

test('Forest options are shown/enabled only for Forest and retain the last selected variant',()=>{
    const listeners={},forestStyle={value:'dense',disabled:false},roomScale={value:'large',disabled:false};
    const form={elements:{preset:{value:'dungeon'},forestStyle,roomScale},addEventListener:(name,fn)=>listeners[name]=fn};
    const panels=[{dataset:{mapOption:'forest'},querySelectorAll:()=>[forestStyle]},{dataset:{mapOption:'dungeon'},querySelectorAll:()=>[roomScale]}];
    bindMapOptions({querySelector:()=>form,querySelectorAll:()=>panels});
    assert(panels[0].hidden);assert(forestStyle.disabled);assert(!panels[1].hidden);
    form.elements.preset.value='forest';listeners.change({target:{name:'preset'}});
    assert(!panels[0].hidden);assert(!forestStyle.disabled);assert(panels[1].hidden);assert(roomScale.disabled);
    form.elements.preset.value='open';listeners.change({target:{name:'preset'}});assert(panels.every(p=>p.hidden));
    form.elements.preset.value='forest';listeners.change({target:{name:'preset'}});assert.equal(forestStyle.value,'dense');
});
