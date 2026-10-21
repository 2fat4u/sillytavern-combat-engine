// Map randomness uses only the supplied map hash, never the combat dice cursor.
const key=p=>`${p.x},${p.y}`;
const neighbors=p=>[{x:p.x-1,y:p.y},{x:p.x+1,y:p.y},{x:p.x,y:p.y-1},{x:p.x,y:p.y+1}];
export function cliffMap(board,actors,protectedCells,hash) {
    const forms=['coast','bridge','hole','edge-hole','island','headland'];
    const form=board.cliffForm==='random'?forms[hash('form',0)%forms.length]:board.cliffForm;
    const rotation=hash('orientation',0)%4, pits=[],blocked=[],cover=[];
    const occupied=new Set(actors.filter(a=>a.position).map(a=>key(a.position)));
    const variation=(hash('shape',0)%100)/100,band=.10+variation*.08;
    for(let y=0;y<board.height;y++)for(let x=0;x<board.width;x++){
        const p={x,y},cell=key(p);if(occupied.has(cell)||protectedCells.has(cell))continue;
        let u=(x+.5)/board.width,v=(y+.5)/board.height;
        [u,v]=rotation===0?[u,v]:rotation===1?[v,1-u]:rotation===2?[1-u,1-v]:[1-v,u];
        let abyss=false;
        if(form==='coast')abyss=u>.43+.13*variation+.35*(v-.5)+.04*Math.sin(v*11+variation*6);
        if(form==='bridge')abyss=Math.abs(u-(.47+.06*Math.sin(v*6)))>band;
        if(form==='hole')abyss=((u-.5)/(.20+variation*.09))**2+((v-.5)/(.20+variation*.08))**2<1;
        if(form==='edge-hole')abyss=((u-.98)/(.30+variation*.12))**2+((v-.5)/(.25+variation*.10))**2<1;
        if(form==='island')abyss=((u-.5)/(.36+variation*.06))**2+((v-.5)/(.36+variation*.06))**2>1;
        if(form==='headland')abyss=v>.95||Math.abs(u-.5)>(.44*(1-v)+.04+variation*.03);
        if(abyss){pits.push(p);continue;}
        if(board.cliffScenery==='scattered'){
            const value=hash('scenery',y*board.width+x)%100;
            if(value<6)blocked.push(p);else if(value<17)cover.push(p);
        }
    }
    if(!pits.length){
        const candidates=[];for(let y=0;y<board.height;y++)for(let x=0;x<board.width;x++){const p={x,y};if(!occupied.has(key(p))&&!protectedCells.has(key(p)))candidates.push(p);}
        if(candidates.length){const p=candidates[hash('small-map',0)%candidates.length];pits.push(p);for(const list of [blocked,cover]){const at=list.findIndex(q=>key(q)===key(p));if(at>=0)list.splice(at,1);}}
    }
    return {...board,pits,blocked,cover,heights:[],ladders:[],coverFaces:[]};
}
export function dungeonMap(board,actors,hash) {
    const {width:w,height:h}=board, floors=new Map(), safe=new Set(), rooms=[];
    const carve=(x,y,protect=true)=>{if(x<0||y<0||x>=w||y>=h)return;const p={x,y};floors.set(key(p),p);if(protect)safe.add(key(p));};
    const connect=(a,b,index)=>{let {x,y}=a;const wide=hash('choke',index)%10!==0;const corridor=()=>{carve(x,y);if(wide){carve(x+1,y);carve(x,y+1);carve(x+1,y+1);}};corridor();const axes=hash('bend',index)%2?['x','y']:['y','x'];for(const axis of axes){while((axis==='x'?x:y)!==b[axis]){if(axis==='x')x+=Math.sign(b.x-x);else y+=Math.sign(b.y-y);corridor();}}};
    const partition=board.roomScale==='large'?18:12;
    const nx=Math.max(1,Math.floor(w/partition)),ny=Math.max(1,Math.floor(h/partition));
    for(let row=0;row<ny;row++)for(let col=0;col<nx;col++){
        const i=row*nx+col,left=Math.floor(col*w/nx),right=Math.floor((col+1)*w/nx)-1,top=Math.floor(row*h/ny),bottom=Math.floor((row+1)*h/ny)-1;
        const insetX=right-left>6?1+hash('room-x',i)%Math.max(1,Math.floor((right-left)/4)):0,insetY=bottom-top>6?1+hash('room-y',i)%Math.max(1,Math.floor((bottom-top)/4)):0;
        const x0=left+insetX,x1=Math.max(x0+1,right-insetX),y0=top+insetY,y1=Math.max(y0+1,bottom-insetY);
        const center={x:Math.floor((x0+x1)/2),y:Math.floor((y0+y1)/2)};rooms.push(center);
        for(let y=y0;y<=Math.min(h-1,y1);y++)for(let x=x0;x<=Math.min(w-1,x1);x++)carve(x,y,false);
        safe.add(key(center));
        if(col)connect(center,rooms[i-1],i);else if(row)connect(center,rooms[i-nx],i);
        if(row&&col&&hash('loop',i)%3===0)connect(center,rooms[i-nx],i+100);
        // Some neighboring rooms merge into a hall while the other rooms remain varied.
        if(col&&hash('hall',i)%4===0){const previous=rooms[i-1];for(let y=y0;y<=Math.min(h-1,y1);y++)for(let x=previous.x;x<=x1;x++)carve(x,y,false);}
    }
    for(const [i,a] of actors.entries())if(a.position){const closest=[...rooms].sort((a1,b1)=>Math.abs(a1.x-a.position.x)+Math.abs(a1.y-a.position.y)-Math.abs(b1.x-a.position.x)-Math.abs(b1.y-a.position.y))[0];connect(a.position,closest,1000+i);}
    const blocked=[];for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(!floors.has(`${x},${y}`))blocked.push({x,y});
    // Furniture stays in room corners, leaving the connected corridor network clear.
    const cover=[...floors.values()].filter(p=>!safe.has(key(p))&&neighbors(p).filter(q=>floors.has(key(q))).length===2&&hash('furniture',p.y*w+p.x)%5===0);
    return {...board,blocked,cover,heights:[],ladders:[],coverFaces:[]};
}
export function castleMap(board,actors,protectedCells,hash) {
    const rotation=hash('orientation',0)%4,shape=hash('form',0)%6;
    const W=rotation%2?board.height:board.width,H=rotation%2?board.width:board.height;
    const transform=(x,y)=>rotation===0?{x,y}:rotation===1?{x:H-1-y,y:x}:rotation===2?{x:W-1-x,y:H-1-y}:{x:y,y:W-1-x};
    const high=new Map(),blocked=new Map(),cover=new Map(),faces=[],ladders=[];
    const occupied=new Set(actors.filter(a=>a.position).map(a=>key(a.position)));
    const strip=(x0,y0,x1,y1)=>{for(let y=Math.max(0,y0);y<=Math.min(H-1,y1);y++)for(let x=Math.max(0,x0);x<=Math.min(W-1,x1);x++){const p=transform(x,y);high.set(key(p),p);}};
    const margin=Math.min(2,Math.floor(Math.min(W,H)/6)),thick=Math.min(3,Math.max(1,Math.floor(Math.min(W,H)/4)));
    const central=Math.min(W,H)>=14&&shape>=2;
    const fw=central?Math.max(10,Math.floor(W*(.45+(hash('span',0)%25)/100))):W-2*margin;
    const fh=central?Math.max(10,Math.floor(H*(.45+(hash('span',1)%25)/100))):H-2*margin;
    const left=central?2+hash('origin',0)%Math.max(1,W-fw-3):margin,right=Math.min(W-1-margin,left+fw-1),top=central?2+hash('origin',1)%Math.max(1,H-fh-3):margin,bottom=Math.min(H-1-margin,top+fh-1);
    if(Math.min(W,H)<8||shape===0)strip(left,top,right,top+thick-1);
    else if(shape===1){const mid=Math.max(1,Math.floor(H/2)-1);strip(0,mid,W-1,mid+thick-1);}
    else{
        strip(left,top,right,top+thick-1);strip(left,top,left+thick-1,bottom);
        if(shape>=3)strip(right-thick+1,top,right,bottom);
        if(shape>=4)strip(left,bottom-thick+1,right,bottom);
    }
    // Towers protrude from the wall and remain connected to its broad walkway.
    if(Math.min(W,H)>=14){
        const tower=4+hash('tower-size',0)%2;
        const towerTop=shape===1?Math.max(1,Math.floor(H/2)-1):top;
        strip(left-1,towerTop-1,left+tower-2,towerTop+tower-2);
        strip(right-tower+2,towerTop-1,right+1,towerTop+tower-2);
        if(shape>=4){strip(left-1,bottom-tower+2,left+tower-2,bottom+1);strip(right-tower+2,bottom-tower+2,right+1,bottom+1);}
        if(shape===5){const mid=Math.floor((left+right)/2),out=Math.max(0,top-3-hash('outwork',0)%3);strip(mid-1,out,mid+1,top+1);strip(mid-2,out,mid+2,out+2);}
        // A two-cell gate connects a protected courtyard to the surrounding ground.
        if(shape>=4){const mid=Math.floor((left+right)/2);for(let y=bottom-thick+1;y<=bottom+1;y++)for(let x=mid;x<=mid+1;x++)high.delete(key(transform(x,y)));}
    }
    // A rear wall is optional. It is ground terrain and never overlaps a walkway.
    if(shape===0&&hash('rear-wall',0)%2&&margin>0)for(let x=left;x<=right;x++){const p=transform(x,top-1);if(!occupied.has(key(p))&&!protectedCells.has(key(p)))blocked.set(key(p),p);}
    const inside=p=>p.x>=0&&p.y>=0&&p.x<board.width&&p.y<board.height;
    // Every ground region gets access to the connected raised walkway, including a courtyard.
    const ground=new Map();for(let y=0;y<board.height;y++)for(let x=0;x<board.width;x++){const p={x,y};if(!high.has(key(p))&&!blocked.has(key(p)))ground.set(key(p),p);}
    const visited=new Set();let region=0;
    for(const p of ground.values())if(!visited.has(key(p))){const queue=[p],candidates=[];visited.add(key(p));for(let i=0;i<queue.length;i++)for(const q of neighbors(queue[i])){
        if(!inside(q))continue;if(high.has(key(q)))candidates.push({from:queue[i],to:q});else if(ground.has(key(q))&&!visited.has(key(q))){visited.add(key(q));queue.push(q);}
    }if(candidates.length){const offset=hash('ladder',region++)%candidates.length;ladders.push(candidates[offset]);if(candidates.length>12)ladders.push(candidates[(offset+Math.floor(candidates.length/2))%candidates.length]);}}
    const endpoints=new Set(ladders.flatMap(l=>[key(l.from),key(l.to)]));
    // Sparse outer crenellations retain a walkable inner route and all ladder exits.
    if(thick>=3)for(let x=left;x<=right;x++)if((x+hash('crenel',0)%3)%3===0){const p=transform(x,top);if(!high.has(key(p))||occupied.has(key(p))||endpoints.has(key(p))||protectedCells.has(key(p)))continue;cover.set(key(p),p);faces.push({...p,facing:['north','east','south','west'][rotation]});}
    return {...board,blocked:[...blocked.values()],cover:[...cover.values()],heights:[...high.values()],ladders,coverFaces:faces};
}
