import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../engine.js';

test('1918 pit rescue rejects an absent helper without dereferencing its position',()=>{
    const s=E.demoState(),victim={...s.actors[1],position:null,hanging:{anchor:{x:5,y:4},turns:3,round:1},lastHeight:0};
    for(const helper of [undefined,null])assert.equal(E.canRescue(s,helper,victim),false);
    assert.equal(E.canRescue(s,{...s.actors[0],position:null},victim),false);
    assert.equal(E.canRescue(s,{...s.actors[0],position:{x:4,y:4}},victim),true);
});

test('1918 resetting a map preserves hanging participants and values without an eligible rescue helper',()=>{
    let s=E.demoState();const victim=s.actors[1];victim.position=null;victim.hanging={anchor:{x:5,y:4},turns:3,round:1};victim.lastPosition={x:4,y:4};victim.lastHeight=0;
    s=E.validateState(s);const before=E.clone(s),next=E.resetScenario(s,'map').state;
    assert(next.actors.every(a=>!a.position));assert.deepEqual(next.actors[1].hanging,before.actors[1].hanging);
    assert.deepEqual(next.actors.map(a=>[a.hp,a.resources,a.effects]),before.actors.map(a=>[a.hp,a.resources,a.effects]));
    const helpers=next.actors.filter(a=>E.isCombatant(a)&&a.position);assert.equal(helpers.length,0);
    assert.equal(E.canRescue(next,helpers[0],next.actors[1]),false);
    assert.equal(E.randomBoard(next,{preset:'forest',seed:'reset1918'}).state.board.preset,'forest');
});
