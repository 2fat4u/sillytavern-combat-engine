import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../engine.js';
import { captureMap, mapFrom } from '../maps.js';
import { createController } from '../controller.js';

const key=p=>`${p.x},${p.y}`;
const neighbors=p=>[{x:p.x-1,y:p.y},{x:p.x+1,y:p.y},{x:p.x,y:p.y-1},{x:p.x,y:p.y+1}];
function scene(width,height){return E.setBoard(E.emptyState(),{width,height}).state;}
function generate(width,height,roomScale,seed){return E.randomBoard(scene(width,height),{preset:'dungeon',roomScale,seed}).state;}

// Count separated areas with space for a 3x3 room. Two-cell corridors do not count.
function spaciousAreas(board){
    const walls=new Set(board.blocked.map(key)),areas=new Set();
    for(let y=1;y<board.height-1;y++)for(let x=1;x<board.width-1;x++){
        const square=Array.from({length:9},(_,i)=>`${x+i%3-1},${y+Math.floor(i/3)-1}`);
        if(square.every(p=>!walls.has(p)))areas.add(`${x},${y}`);
    }
    let count=0;
    while(areas.size){
        count++;const queue=[areas.values().next().value];areas.delete(queue[0]);
        for(let i=0;i<queue.length;i++){
            const [x,y]=queue[i].split(',').map(Number);
            for(const p of neighbors({x,y}))if(areas.delete(key(p)))queue.push(key(p));
        }
    }
    return count;
}

for(const roomScale of ['mixed','large'])for(const size of [10,12,16,20,24,30]){
    test(`${roomScale} ${size}x${size}: compact dungeons retain multiple distinct rooms`,()=>{
        for(let i=0;i<20;i++){
            const s=generate(size,size,roomScale,'compact-'+i);
            assert(spaciousAreas(s.board)>=2,`Only one open hall: ${roomScale} ${size}, seed ${i}`);
            assert(s.board.blocked.length>0);
        }
    });
}

test('Large-room mode retains larger spaces than mixed mode on 30x30 and 50x50 maps',()=>{
    for(const size of [30,50])for(let i=0;i<20;i++){
        const seed='room-scale-'+i,large=generate(size,size,'large',seed),mixed=generate(size,size,'mixed',seed);
        assert(spaciousAreas(large.board)<spaciousAreas(mixed.board));
    }
});

test('Dungeon cover is distributed through room interiors instead of unusable corners',()=>{
    for(const roomScale of ['mixed','large'])for(let i=0;i<20;i++){
        const s=generate(30,30,roomScale,'furniture-'+i),walls=new Set(s.board.blocked.map(key));
        const quadrants=new Set(s.board.cover.map(p=>`${p.x<15},${p.y<15}`));
        assert(s.board.cover.length>=4);
        assert.equal(quadrants.size,4,'Cover should be available in different parts of the dungeon');
        for(const p of s.board.cover){
            assert(neighbors(p).every(q=>q.x>=0&&q.y>=0&&q.x<30&&q.y<30&&!walls.has(key(q))),'No cover squeezed into a corner or against a wall');
            assert(s.board.cover.every(q=>q===p||E.distance(p,q)>1),'Leave space around individual cover cells');
        }
    }
});

for(const roomScale of ['mixed','large'])test(`${roomScale}: small, narrow and large dungeons keep every free cell connected`,()=>{
    for(const [width,height] of [[2,2],[4,4],[6,9],[8,8],[10,10],[12,18],[23,17],[30,30],[50,50],[2,30],[30,2]])for(let i=0;i<12;i++){
        let s=E.setRules(scene(width,height),{coverCrossable:false}).state;
        s=E.addActor(s,{name:'Party',side:'player',position:{x:0,y:0}}).state;
        s=E.addActor(s,{name:'Enemy',side:'enemy',position:{x:width-1,y:height-1}}).state;
        const options={preset:'dungeon',roomScale,seed:'reachable-'+i},next=E.randomBoard(s,options).state;
        assert.deepEqual(next.board,E.randomBoard(s,options).state.board);
        assert.deepEqual(next.actors,s.actors);assert.deepEqual(next.rng,s.rng);
        const walk={...next,actors:[]},paths=E.pathDistances(walk,{x:0,y:0},'');
        assert(paths.has(`${width-1},${height-1}`));
        for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(E.canOccupy(walk,{x,y}))assert(paths.has(`${x},${y}`),`Isolated cell ${x},${y} on ${width}x${height}, seed ${i}`);
        assert.deepEqual(E.validateState(JSON.parse(JSON.stringify(next))),next);
    }
});

test('Generated dungeons support random deployment, map transfer and Undo without changing combat data',async()=>{
    let s=scene(30,30);
    for(let i=0;i<12;i++)s=E.addActor(s,{name:'Actor '+i,side:i<6?'player':'enemy',maxHp:30,hp:20,reserve:true}).state;
    let bundle={state:s,history:[]};
    const c=createController({key:()=> 'dungeon',read:()=>bundle,write:v=>bundle=v,save:async()=>{}});
    await c.randomBoard({preset:'dungeon',roomScale:'large',seed:'transfer'});
    assert.deepEqual(mapFrom(JSON.parse(JSON.stringify(captureMap(c.state(),'Dungeon')))).board,c.state().board);
    const placed=E.randomPlace(c.state(),{scope:'all',seed:'party'}).state;
    assert(placed.actors.every(a=>a.position&&E.canOccupy(placed,a.position)));
    assert.equal(new Set(placed.actors.map(a=>key(a.position))).size,12);
    assert.deepEqual(placed.actors.map(a=>a.hp),s.actors.map(a=>a.hp));
    await c.undo();
    for(const field of ['board','actors','rules','rng','phase','round','order'])assert.deepEqual(c.state()[field],s[field]);
    assert.equal(c.historyLength(),0);assert.equal(c.state().log.at(-1).type,'undo');
});
