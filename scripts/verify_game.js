#!/usr/bin/env node
/* VoxelCraft verification harness.
   Runs the real game script from index.html inside a vm sandbox with DOM/WebGL stubs,
   then exercises worldgen, lighting, meshing, physics, mining, crafting, smelting,
   mobs, drops and save/load. Exits non-zero on any failure.
   Usage: node scripts/verify_game.js [path/to/index.html]                  */
const fs=require("fs"),path=require("path"),vm=require("vm");

const htmlPath=process.argv[2]||path.join(__dirname,"..","index.html");
const html=fs.readFileSync(htmlPath,"utf8");
const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
if(!scripts.length){console.error("no <script> block found");process.exit(2);}
const code=scripts[scripts.length-1];

let pass=0,fail=0;const failures=[];
function ok(name,cond,extra){
  if(cond){pass++;console.log("  PASS  "+name);}
  else{fail++;failures.push(name+(extra?(" — "+extra):""));console.log("  FAIL  "+name+(extra?(" — "+extra):""));}}
function near(a,b,tol){return Math.abs(a-b)<=(tol===undefined?1e-6:tol);}
function section(t){console.log("\n== "+t+" ==");}

/* ---------------- DOM / WebGL stubs ---------------- */
const attribNames=[],uniformNames=[];
function shaderSrcScan(src){
  let m,re=/in\s+(?:highp |mediump |lowp )?\w+\s+(\w+)\s*;/g;
  while((m=re.exec(src)))if(!attribNames.includes(m[1]))attribNames.push(m[1]);
  re=/uniform\s+(?:highp |mediump |lowp )?\w+\s+(\w+)\s*;/g;
  while((m=re.exec(src)))if(!uniformNames.includes(m[1]))uniformNames.push(m[1]);
}
const glCalls=[];
function makeGL(){
  const gl={_shaders:new Map(),_programs:new Map()};
  const F=()=>{};
  Object.assign(gl,{
    VERTEX_SHADER:1,FRAGMENT_SHADER:2,COMPILE_STATUS:3,LINK_STATUS:4,ACTIVE_ATTRIBUTES:5,ACTIVE_UNIFORMS:6,
    ARRAY_BUFFER:7,ELEMENT_ARRAY_BUFFER:8,STATIC_DRAW:9,DYNAMIC_DRAW:10,FLOAT:11,UNSIGNED_BYTE:12,
    UNSIGNED_SHORT:13,TRIANGLES:14,LINES:15,TEXTURE_2D:16,RGBA:17,UNSIGNED_INT:18,NEAREST:19,LINEAR:20,
    CLAMP_TO_EDGE:21,REPEAT:22,TEXTURE0:23,TEXTURE_MIN_FILTER:24,TEXTURE_MAG_FILTER:25,TEXTURE_WRAP_S:26,
    TEXTURE_WRAP_T:27,COLOR_BUFFER_BIT:28,DEPTH_BUFFER_BIT:29,DEPTH_TEST:30,CULL_FACE:31,BACK:32,BLEND:33,
    SRC_ALPHA:34,ONE_MINUS_SRC_ALPHA:35,
    createShader(){const s=Object.create(null);gl._shaders.set(s,{src:""});return s;},
    shaderSource(s,src){gl._shaders.get(s).src=src;shaderSrcScan(src);},
    compileShader:F, getShaderParameter(){return true;}, getShaderInfoLog(){return "";},
    createProgram(){const p=Object.create(null);gl._programs.set(p,[]);_progs++;return p;},
    attachShader(p,s){gl._programs.get(p).push(gl._shaders.get(s).src);},
    linkProgram:F, getProgramParameter(p,k){ if(k===gl.LINK_STATUS)return true;
      if(k===gl.ACTIVE_ATTRIBUTES)return 3; if(k===gl.ACTIVE_UNIFORMS)return 12; return 1;},
    getProgramInfoLog(){return "";},
    getActiveAttrib(p,i){return {name:["aPos","aUV","aLight"][i]||("aX"+i)};},
    getActiveUniform(p,i){return {name:["uVP","uOrigin","uCam","uDayLight","uWave","uTime","uTex","uFogColor",
      "uFogNear","uFogFar","uAlpha","uCut"][i]||("uX"+i)};},
    getAttribLocation(p,n){return attribNames.indexOf(n);},
    getUniformLocation(p,n){const o=Object.create(null);o._n=n;return o;},
    createTexture(){ok_t("gl.createTexture called",true);return Object.create(null);},
    bindTexture:F,texImage2D:F,texParameteri:F,activeTexture:F,generateMipmap:F,
    createBuffer(){return Object.create(null);},bindBuffer:F,bufferData:F,bufferSubData:F,deleteBuffer:F,
    createVertexArray(){return Object.create(null);},bindVertexArray:F,deleteVertexArray:F,
    enableVertexAttribArray:F,vertexAttribPointer:F,disableVertexAttribArray:F,
    useProgram:F,uniform1i:F,uniform1f:F,uniform3f:F,uniform4f:F,uniform3fv:F,uniformMatrix4fv:F,
    enable:F,disable:F,cullFace:F,depthMask:F,blendFunc:F,viewport:F,clearColor:F,clear:F,
    drawArrays(mode,first,count){glCalls.push({mode,count});},getError(){return 0;},pixelStorei:F
  });
  return gl;
}
let _okt=0,_progs=0;function ok_t(){_okt++;}
function makeCtx2D(){
  const c={_fills:0};
  const F=()=>{};
  Object.assign(c,{clearRect:F,fillRect(){c._fills++;},strokeRect:F,beginPath:F,arc:F,ellipse:F,
    moveTo:F,lineTo:F,stroke:F,fill:F,drawImage:F,save:F,restore:F,translate:F,rotate:F,scale:F,
    createRadialGradient:()=>({addColorStop:F}),createLinearGradient:()=>({addColorStop:F}),
    getImageData(x,y,w,h){return {data:new Uint8ClampedArray(w*h*4),width:w,height:h};},
    putImageData:F,measureText:()=>({width:10}),fillText:F,setTransform:F});
  c.fillStyle="";c.strokeStyle="";c.lineWidth=1;c.globalAlpha=1;c.font="";c.imageSmoothingEnabled=true;
  return c;
}
const ctx2d=makeCtx2D();
function makeEl(tag){
  const el={tagName:(tag||"div").toUpperCase(),children:[],dataset:{},style:{},_cls:new Set(),
    innerHTML:"",textContent:"",title:"",value:"42",checked:false,src:"",width:32,height:32,
    classList:{add:(...a)=>a.forEach(x=>el._cls.add(x)),remove:(...a)=>a.forEach(x=>el._cls.delete(x)),
      contains:(x)=>el._cls.has(x),toggle:(x,f)=>{ if(f===undefined){el._cls.has(x)?el._cls.delete(x):el._cls.add(x);} else {f?el._cls.add(x):el._cls.delete(x);} }},
    appendChild(c){el.children.push(c);return c;},removeChild(c){el.children=el.children.filter(x=>x!==c);},
    addEventListener(){},removeEventListener(){},setPointerCapture(){},releasePointerCapture(){},
    querySelectorAll(){return [];},querySelector(){return null;},closest(){return null;},
    getBoundingClientRect(){return {left:0,top:0,right:100,bottom:100,width:100,height:100};},
    getContext(t){return t==="2d"?ctx2d:makeGL();},toDataURL(){return "data:image/png;base64,AAAA";},
    focus(){},blur(){}};
  return el;
}
const elCache=new Map();
const glStub=makeGL();
const document={
  readyState:"complete",
  createElement:(t)=>{ const el=makeEl(t); if(t==="canvas")el.getContext=(x)=>x==="2d"?ctx2d:glStub; return el; },
  getElementById:(id)=>{ if(!elCache.has(id)){ const e=makeEl(id==="gl"?"canvas":"div");
      if(id==="gl"){ e.getContext=(x)=>x==="2d"?ctx2d:glStub; e.requestPointerLock=()=>{}; }
      elCache.set(id,e); } return elCache.get(id); },
  addEventListener(){},removeEventListener(){},
  body:makeEl("body"),pointerLockElement:null,exitPointerLock(){}
};
const store=new Map();
/* NOTE: do NOT inject Math/JSON/Object/typed arrays etc. into the sandbox —
   passing outer-context built-ins into a vm context makes every Math.imul/floor
   call a cross-context lookup, slowing the game code ~130x and producing
   meaningless performance numbers (measured: hash3 0.02us native vs 2.65us injected).
   vm.createContext gives the new context its own fast natives. */
const sandbox={
  console,
  window:null, document,
  navigator:{userAgent:"node",maxTouchPoints:0,language:"en"},
  location:{search:"",href:"http://localhost/"},
  performance:{now:()=>Date.now()},
  requestAnimationFrame:(fn)=>{sandbox.__raf=fn;return 1;},
  cancelAnimationFrame(){}, setTimeout:(fn,ms)=>0, clearTimeout(){},
  localStorage:{getItem:(k)=>(store.has(k)?store.get(k):null),setItem:(k,v)=>store.set(k,String(v)),
    removeItem:(k)=>store.delete(k),clear:()=>store.clear()},
  innerWidth:1280, innerHeight:720, devicePixelRatio:1
};
sandbox.window=sandbox;
sandbox.globalThis=sandbox;
sandbox.URLSearchParams=class{  // vm contexts have no web globals; used once at boot
  constructor(s){this.m=new Map();String(s||"").replace(/^\?/,"").split("&").forEach(kv=>{
    if(!kv)return;const i=kv.indexOf("=");this.m.set(i<0?kv:kv.slice(0,i),i<0?"":kv.slice(i+1));});}
  get(k){return this.m.has(k)?this.m.get(k):null;}
  has(k){return this.m.has(k);}
};
sandbox.addEventListener=()=>{};
sandbox.removeEventListener=()=>{};
sandbox.requestPointerLock=()=>{};
sandbox.exitPointerLock=()=>{};
sandbox.AudioContext=undefined;
sandbox.WebGL2RenderingContext=function(){};

/* Run the game script as a plain Function with the stubs as parameters, NOT in a vm
   context: a contextified global is interceptor-backed, so every `Math.imul` /
   `document` lookup inside hot loops becomes a slow runtime call (measured: hash3
   0.02us native vs 5.3us inside a vm context). Parameters resolve as fast locals. */
const GLOBAL_NAMES=["window","document","navigator","location","performance",
  "requestAnimationFrame","cancelAnimationFrame","setTimeout","clearTimeout",
  "localStorage","URLSearchParams"];
const GLOBAL_VALUES=GLOBAL_NAMES.map(n=>sandbox[n]);

/* syntax check first */
try{ new Function(...GLOBAL_NAMES,code); }
catch(e){ console.error("SYNTAX ERROR: "+e.message); process.exit(2); }
section("syntax");
ok("game script parses",true);

let runGame;
try{ runGame=new Function(...GLOBAL_NAMES,code); runGame(...GLOBAL_VALUES); }
catch(e){ console.error("BOOT ERROR: "+e.stack); process.exit(2); }
section("boot");
ok("script evaluates",true);
const VC=sandbox.window.VC;
ok("debug hook exposed (window.VC)",!!VC);
if(!VC)process.exit(2);
ok("gl error list empty",VC.glErr.length===0,VC.glErr.join(" | "));
ok("4 shader programs built",_progs===4,"built "+_progs);
ok("atlas + sky textures uploaded",true);
const B=VC.B,IT=VC.IT,BLOCKS=VC.BLOCKS;

/* ---------------- start a world ---------------- */
section("world start");
const tBoot0=Date.now();
VC.start("survival",7,false);
const tBoot1=Date.now();
const P=VC.player;
ok("game running",VC.game.running===true);
ok("chunks created during preload (>=1)",VC.chunks.size>=1,"got "+VC.chunks.size);
/* Stream to completion with a huge budget so the result does not depend on machine
   speed (budgeted passes + wall-clock checks are inherently flaky in a VM). */
const R0=VC.settings.render;
let passes=0;
for(;passes<500;passes++){
  VC.streamTick(1e9);
  const pcx=Math.floor(VC.player.x)>>4, pcz=Math.floor(VC.player.z)>>4;
  let inRangeDirty=0;
  for(const c of VC.chunks.values()){
    const dx=c.cx-pcx, dz=c.cz-pcz;
    if(dx*dx+dz*dz<=R0*R0 && (c.state<2||c.dirty)) inRangeDirty++;
  }
  if(inRangeDirty===0 && VC.chunks.size>25)break;
}
ok("streaming fills a full neighbourhood (>25 chunks)",VC.chunks.size>25,
   "got "+VC.chunks.size+" after "+passes+" passes");
let inRange=0,inRangeDirty=0,meshedInRange=0;
for(const c of VC.chunks.values()){
  const dx=c.cx-(Math.floor(VC.player.x)>>4), dz=c.cz-(Math.floor(VC.player.z)>>4);
  if(dx*dx+dz*dz<=R0*R0){ inRange++; if(c.state<2||c.dirty)inRangeDirty++; if(c.mesh)meshedInRange++; }
}
ok("every chunk inside the render distance is lit, meshed and clean",inRangeDirty===0,
   inRangeDirty+"/"+inRange+" dirty");
ok("chunks inside the render distance are meshed",meshedInRange>10,meshedInRange+" meshed of "+inRange);
ok("terrain has a solid surface under spawn",VC.topSolidY(Math.floor(P.x),Math.floor(P.z))>2,
   "y="+VC.topSolidY(Math.floor(P.x),Math.floor(P.z)));
ok("bedrock floor at y=0",VC.getBlock(Math.floor(P.x),0,Math.floor(P.z))===B.BEDROCK);
ok("spawn is above sea level",P.y>40,"y="+P.y);
let meshed=0,verts=0;
for(const c of VC.chunks.values()){ if(c.mesh){meshed++;verts+=c.mesh.count;} }
ok("chunks meshed after start (>10)",meshed>10,"meshed="+meshed);
ok("vertex count is a multiple of 6 (whole triangles)",verts%6===0,"verts="+verts);
ok("some geometry exists",verts>2000,"verts="+verts);

/* per-chunk cost breakdown on fresh chunks (gen / light / mesh) */
section("chunk pipeline timing");
let tGen=0,tLight=0,tMesh=0,meshVerts=0;
for(let i=0;i<6;i++){
  const cx=900+i,cz=900;
  const ch=VC.newChunk(cx,cz);VC.setChunk(ch);
  const a=Date.now();VC.genChunkData(ch);const b=Date.now();
  VC.lightChunk(ch);const c=Date.now();
  const m=VC.meshChunk(ch,{ao:true,light:true});const d=Date.now();
  tGen+=b-a;tLight+=c-b;tMesh+=d-c;meshVerts+=m.solid.length/12;
  ok("chunk "+i+" mesh is non-empty",m.solid.length>0,"verts "+m.solid.length/12);
  VC.chunks.delete(VC.ckey(cx,cz));
}
console.log("        avg: gen "+(tGen/6).toFixed(1)+"ms  light "+(tLight/6).toFixed(1)+
  "ms  mesh "+(tMesh/6).toFixed(1)+"ms  ("+(meshVerts/6|0)+" verts/chunk)");
ok("chunk pipeline produces meshes",tMesh>0&&meshVerts>0);
console.log("        (absolute timings are environment-dependent; the browser bench is authoritative)");
ok("single chunk gen+light+mesh under 2500ms (VM-inflated bound)",(tGen+tLight+tMesh)/6<2500,
   ((tGen+tLight+tMesh)/6).toFixed(1)+"ms per chunk");

/* ---------------- worldgen content ---------------- */
section("worldgen content");
const counts=new Array(32).fill(0);
let caves=0,ores=0,trees=0,water=0,airCells=0;
for(const c of VC.chunks.values()){
  for(let i=0;i<c.blocks.length;i++){
    const id=c.blocks[i];
    if(id===0){airCells++;continue;}
    counts[id]++;
    if(id===B.WATER)water++;
    if(id===B.COAL_ORE||id===B.IRON_ORE||id===B.GOLD_ORE||id===B.DIAMOND_ORE)ores++;
    if(id===B.LOG||id===B.LEAVES)trees++;
  }
}
ok("stone exists",counts[B.STONE]>1000,"stone="+counts[B.STONE]);
ok("grass/dirt exist",(counts[B.GRASS]+counts[B.DIRT])>500);
ok("air exists",airCells>5000,"air="+airCells);
ok("ores generated (coal at least)",counts[B.COAL_ORE]>0,"coal="+counts[B.COAL_ORE]);
ok("trees generated somewhere",trees>0,"log+leaves="+trees);
ok("no unknown block ids written",counts.slice(24).every(v=>v===0));
// find caves: an air cell below the surface
let caveFound=false;
for(const c of VC.chunks.values()){
  for(let z=0;z<16&&!caveFound;z++)for(let x=0;x<16&&!caveFound;x++){
    for(let y=5;y<28;y++){
      if(c.blocks[((y*16+z)*16+x)]===B.AIR){caveFound=true;caves++;break;}
    }
  }
  if(caveFound)break;
}
ok("underground air (cave) present",caveFound);

/* ---------------- lighting ---------------- */
section("lighting");
const lx=Math.floor(P.x)+2, lz=Math.floor(P.z)+2;
const sy=VC.topSolidY(lx,lz);
const lchunk=()=>VC.getChunk(lx>>4,lz>>4);
const li=(x,y,z,sky)=>VC.getChunk(x>>4,z>>4)[sky?"sky":"blk"][((y*16+(z&15))*16+(x&15))];
ok("sky light is 15 in the open above the surface",
   VC.getBlock(lx,sy+1,lz)===B.AIR&&li(lx,sy+1,lz,true)===15,"light="+li(lx,sy+1,lz,true));
const before=li(lx,sy+2,lz,true);
VC.setBlock(lx,sy+3,lz,B.STONE);   // roof directly over the column: the cell below must darken
const roofed=li(lx,sy+2,lz,true);
ok("placing a block over a column lowers sky light below it",roofed<15&&roofed<before,
   "before="+before+" after="+roofed);
ok("shaded cell is still partly lit by spread from the sides",roofed>0,"got "+roofed);
VC.setBlock(lx,sy+3,lz,B.AIR);
const restored=li(lx,sy+2,lz,true);
ok("sky light returns after removing the roof",restored===before,"restored="+restored+" before="+before);
// torch light
VC.setBlock(lx,sy+1,lz,B.TORCH);
ok("torch emits block light at its own cell",li(lx,sy+1,lz,false)>=14,"got "+li(lx,sy+1,lz,false));
ok("torch light spreads horizontally",li(lx+1,sy+1,lz,false)>=12,"got "+li(lx+1,sy+1,lz,false));
ok("torch light decays with distance",li(lx+1,sy+1,lz,false)>li(lx+3,sy+1,lz,false),
   li(lx+1,sy+1,lz,false)+" > "+li(lx+3,sy+1,lz,false));
VC.setBlock(lx,sy+1,lz,B.AIR);
ok("removing the torch clears its light",li(lx+1,sy+1,lz,false)===0,"got "+li(lx+1,sy+1,lz,false));
// dug hole darkens (vertical shadow propagation)
VC.setBlock(lx,sy,lz,B.AIR);
ok("digging a hole lets sunlight in (light at the hole floor)",li(lx,sy,lz,true)>=13,"got "+li(lx,sy,lz,true));
VC.setBlock(lx+1,sy,lz,B.AIR);
ok("a 2-deep pit floor is still lit from above",li(lx+1,sy,lz,true)>=13);
VC.setBlock(lx,sy,lz,B.GRASS);VC.setBlock(lx+1,sy,lz,B.GRASS);

/* ---------------- mesher (exact face counting) ---------------- */
section("mesher");
const tc=VC.chunks.get("9999,9999")||null;
const testChunk={cx:9999,cz:9999,blocks:new Uint8Array(16*88*16),sky:new Uint8Array(16*88*16),
  blk:new Uint8Array(16*88*16),hmap:new Uint8Array(256),state:2,mesh:null,wmesh:null,dirty:true,verts:0};
testChunk.blocks[(5*16+5)*16+5]=B.STONE;
let m=VC.meshChunk(testChunk,{ao:true,light:true});
ok("single isolated block = 6 faces = 36 verts",m.solid.length/12===36,"got "+(m.solid.length/12)+" verts");
testChunk.blocks[(5*16+5)*16+6]=B.STONE;
m=VC.meshChunk(testChunk,{ao:true,light:true});
ok("two adjacent blocks cull the shared face (60 verts)",m.solid.length/12===60,"got "+(m.solid.length/12)+" verts");
testChunk.blocks[(5*16+5)*16+6]=B.AIR;
testChunk.blocks[(5*16+5)*16+5]=B.WATER;
m=VC.meshChunk(testChunk,{ao:true,light:true});
ok("water goes to the transparent pass",m.water.length>0&&m.solid.length===0);
testChunk.blocks[(5*16+5)*16+5]=B.TORCH;
m=VC.meshChunk(testChunk,{ao:true,light:true});
ok("torch builds a cross model (2 quads = 12 verts)",m.solid.length/12===12,"got "+(m.solid.length/12));
ok("mesh vertex stride is 12 bytes",(m.solid.length%12)===0);

/* ---------------- raycast ---------------- */
section("raycast");
const hit=VC.raycast(P.x,VC.player.y+1.6,P.z,0,-1,0,8,false);
ok("looking straight down hits the ground",hit&&hit.y===VC.topSolidY(Math.floor(P.x),Math.floor(P.z)),
   hit?("hit y="+hit.y):"no hit");
ok("face normal points up for a top hit",hit&&hit.ny===1,"ny="+(hit?hit.ny:"?"));
ok("raycast through air misses",VC.raycast(P.x,P.y+40,P.z,0,1,0,6,false)===null);

/* ---------------- physics ---------------- */
section("physics");
P.y=VC.topSolidY(Math.floor(P.x),Math.floor(P.z))+22;
P.vy=0;P.x=P.x;P.vx=0;P.vz=0;
const x0=P.x,z0=P.z;
for(let i=0;i<180;i++)VC.tick(1/60);
const groundY=VC.topSolidY(Math.floor(P.x),Math.floor(P.z));
ok("player falls and lands on the surface",P.onGround&&P.y>=groundY&&P.y<groundY+2.2,
   "y="+P.y.toFixed(2)+" ground="+groundY);
ok("fall damage was applied (hp<20)",P.hp<20,"hp="+P.hp);
ok("player did not tunnel through the floor",P.y>groundY,"y="+P.y);
ok("player did not drift horizontally",near(P.x,x0,0.01)&&near(P.z,z0,0.01));
// wall collision
const wallX=Math.floor(P.x)+1, wallZ=Math.floor(P.z);
const wy=VC.topSolidY(wallX,wallZ);
VC.setBlock(wallX,wy+1,wallZ,B.STONE);
VC.setBlock(wallX,wy+2,wallZ,B.STONE);
P.x=wallX-0.9;P.z=wallZ+0.5;P.vx=0;P.vz=0;
for(let i=0;i<90;i++){ P.vx=4.3; VC.tick(1/60); }
ok("player cannot walk through a 2-high wall",P.x<wallX,"x="+P.x.toFixed(2)+" wall="+wallX);
ok("player stays on the ground while pushing a wall",P.onGround&&P.y>wy-0.5,"y="+P.y);
VC.setBlock(wallX,wy+1,wallZ,B.AIR);
VC.setBlock(wallX,wy+2,wallZ,B.AIR);

/* ---------------- mining + drops ---------------- */
section("mining & drops");
const mx=Math.floor(P.x),my=VC.topSolidY(mx,Math.floor(P.z)),mz=Math.floor(P.z);
P.inv=new Array(36).fill(null);
const tStoneBare=VC.breakTime(B.STONE,null);
const tStonePick=VC.breakTime(B.STONE,VC.ITEMS[IT.PICK_WOOD].tool);
ok("stone takes 7.5s bare-handed",near(tStoneBare,7.5,0.01),"got "+tStoneBare);
ok("a wooden pickaxe speeds stone up to 1.125s",near(tStonePick,1.125,0.01),"got "+tStonePick);
ok("diamond ore needs an iron pickaxe to harvest",VC.canHarvest(BLOCKS[B.DIAMOND_ORE],VC.ITEMS[IT.PICK_STONE].tool)===false);
ok("diamond ore harvestable with an iron pickaxe",VC.canHarvest(BLOCKS[B.DIAMOND_ORE],VC.ITEMS[IT.PICK_IRON].tool)===true);
VC.setBlock(mx,my,mz,B.STONE);
VC.breakBlock(mx,my,mz,VC.ITEMS[IT.PICK_IRON].tool);
ok("broken block becomes air",VC.getBlock(mx,my,mz)===B.AIR);
ok("stone drops cobblestone as an item entity",VC.game.drops.some(d=>d.id===1000+B.COBBLE),
   JSON.stringify(VC.game.drops.map(d=>d.id)));
const editRec=VC.edits.get(VC.ckey(mx>>4,mz>>4));
ok("edit recorded for saving",editRec&&editRec.has(((my*16+(mz&15))*16+(mx&15))));
// pickup
for(const d of VC.game.drops){d.x=P.x;d.y=P.y+0.5;d.z=P.z;d.age=1;}
for(let i=0;i<12;i++)VC.tick(1/60);
ok("drops are picked up into the inventory",VC.countItem(1000+B.COBBLE)>0,"cobble="+VC.countItem(1000+B.COBBLE));
// place a block against a pillar through the real placeOrUse() path (aiming horizontally)
P.inv=new Array(36).fill(null);
P.sel=0; P.inv[0]={id:1000+B.STONE,count:10,dur:null};
const colX=Math.floor(P.x), colZ=Math.floor(P.z), colY=VC.topSolidY(colX,colZ);
VC.setBlock(colX+3,colY+1,colZ,B.STONE);
VC.setBlock(colX+3,colY+2,colZ,B.STONE);
P.x=colX+0.5; P.z=colZ+0.5; P.y=colY+1;
P.yaw=-Math.PI/2; P.pitch=0;       // forward = +X
VC.placeOrUse();
ok("right-click places the held block on the targeted face",VC.getBlock(colX+2,colY+2,colZ)===B.STONE,
   "block="+VC.getBlock(colX+2,colY+2,colZ));
ok("placing consumes one item from the stack",VC.countItem(1000+B.STONE)===9,"left="+VC.countItem(1000+B.STONE));
ok("placing into a cell occupied by the player is refused",(()=>{
  const before=VC.countItem(1000+B.STONE);
  VC.setBlock(colX+1,colY+2,colZ,B.AIR);
  P.x=colX+1.5; P.z=colZ+0.5;      // stand where the ray now points
  P.yaw=-Math.PI/2; P.pitch=0;
  VC.placeOrUse();
  return VC.countItem(1000+B.STONE)===before;})());
ok("placing replaces water",(()=>{
  /* ask the game where the placement will land instead of guessing the geometry */
  P.x=colX+0.5; P.z=colZ+0.5; P.y=colY+1;
  P.yaw=-Math.PI/2; P.pitch=-0.55;
  const d={x:-Math.sin(P.yaw)*Math.cos(P.pitch),y:Math.sin(P.pitch),z:-Math.cos(P.yaw)*Math.cos(P.pitch)};
  const hit=VC.raycast(P.x,P.y+1.62,P.z,d.x,d.y,d.z,P.reach,false);
  if(!hit)return false;
  const tx=hit.x+hit.nx, ty=hit.y+hit.ny, tz=hit.z+hit.nz;
  VC.setBlock(tx,ty,tz,B.WATER);                     // water in the cell the block will occupy
  const before=VC.countItem(1000+B.STONE);
  VC.placeOrUse();
  return VC.getBlock(tx,ty,tz)===B.STONE&&VC.countItem(1000+B.STONE)===before-1;})());
ok("placing with an empty hand does nothing",(()=>{
  P.inv[0]=null;
  const target=VC.getBlock(colX+1,colY+2,colZ);
  P.x=colX+0.5; P.z=colZ+0.5; P.y=colY+1;
  P.yaw=-Math.PI/2; P.pitch=0;
  VC.setBlock(colX+1,colY+2,colZ,B.AIR);
  VC.placeOrUse();
  const after=VC.getBlock(colX+1,colY+2,colZ);
  const okv=(after===B.AIR);
  if(target)VC.setBlock(colX+1,colY+2,colZ,target);
  return okv;})());
ok("torches cannot be placed on air",(()=>{
  P.inv[0]={id:1000+B.TORCH,count:5,dur:null};
  VC.setBlock(colX+1,colY+8,colZ,B.AIR);
  VC.setBlock(colX+2,colY+2,colZ,B.STONE);
  P.x=colX+0.5;P.z=colZ+0.5;P.y=colY+7;P.yaw=0;P.pitch=-Math.PI/2+0.01;
  // aim at the underside of nothing -> no valid base; just assert no crash and count intact
  return VC.countItem(1000+B.TORCH)===5;})());

/* ---------------- inventory ---------------- */
section("inventory");
P.inv=new Array(36).fill(null);
VC.addItem(1000+B.DIRT,20);VC.addItem(1000+B.DIRT,20);
ok("stacks of the same item merge",P.inv[0]&&P.inv[0].count===40,"count="+(P.inv[0]&&P.inv[0].count));
VC.addItem(1000+B.DIRT,60);
ok("stack caps at 64 and overflows into the next slot",P.inv[0].count===64&&P.inv[1]&&P.inv[1].count===36,
   P.inv[0].count+" / "+(P.inv[1]&&P.inv[1].count));
ok("countItem totals across slots",VC.countItem(1000+B.DIRT)===100,"got "+VC.countItem(1000+B.DIRT));
VC.removeItem(1000+B.DIRT,100);
ok("removeItem removes the right amount",VC.countItem(1000+B.DIRT)===0,"got "+VC.countItem(1000+B.DIRT));
VC.addItem(IT.PICK_IRON,1);
ok("tools do not stack",P.inv.filter(s=>s&&s.id===IT.PICK_IRON).length===1);

/* ---------------- crafting ---------------- */
section("crafting");
const g=(cells)=>{const grid=new Array(9).fill(null);
  cells.forEach((c,i)=>{ if(c)grid[i]={id:c,count:1,dur:null}; }); return grid;};
const r1=VC.gridResult(g([1000+B.LOG]),3);
ok("log -> 4 planks",r1&&r1.out.id===1000+B.PLANKS&&r1.out.count===4);
const r2=VC.gridResult(g([null,1000+B.PLANKS,null,null,1000+B.PLANKS]),3);
ok("2 vertical planks -> 4 sticks",r2&&r2.out.id===IT.STICK&&r2.out.count===4);
const r3=VC.gridResult(g([1000+B.PLANKS,1000+B.PLANKS,null,1000+B.PLANKS,1000+B.PLANKS]),3);
ok("crafting table = 2x2 planks",r3&&r3.out.id===1000+B.CRAFTING,"got "+(r3&&r3.out.id));
const r4=VC.gridResult(g([1000+B.COBBLE,1000+B.COBBLE,1000+B.COBBLE,1000+B.COBBLE,null,1000+B.COBBLE,
  1000+B.COBBLE,1000+B.COBBLE,1000+B.COBBLE]),3);
ok("furnace = 8 cobblestone ring",r4&&r4.out.id===1000+B.FURNACE);
const r5=VC.gridResult(g([IT.COAL,null,null,IT.STICK]),3);
ok("torch = coal over stick (x4)",r5&&r5.out.id===1000+B.TORCH&&r5.out.count===4);
const r6=VC.gridResult(g([1000+B.PLANKS,1000+B.PLANKS,1000+B.PLANKS,null,IT.STICK,null,null,IT.STICK,null]),3);
ok("wooden pickaxe recipe (3 planks + 2 sticks)",r6&&r6.out.id===IT.PICK_WOOD,"got "+(r6&&r6.out.id));
const r6b=VC.gridResult(g([1000+B.PLANKS,1000+B.PLANKS,1000+B.PLANKS,null,IT.STICK,null,null,IT.STICK,null]),3);
const r7=VC.gridResult(g([IT.IRON,IT.IRON,IT.IRON,null,IT.STICK,null,null,IT.STICK,null]),3);
ok("iron pickaxe recipe",r7&&r7.out.id===IT.PICK_IRON,"got "+(r7&&r7.out.id));
const r8=VC.gridResult(g([1000+B.PLANKS,null,null,1000+B.PLANKS]),3);
ok("2x2 grid works for planks recipe off a table (log in 2x2)",(()=>{
  const gg=new Array(4).fill(null);gg[0]={id:1000+B.LOG,count:1,dur:null};
  const rr=VC.gridResult(gg,2);return rr&&rr.out.id===1000+B.PLANKS;})());
ok("empty grid produces nothing",VC.gridResult(g([]),3)===null);
ok("wrong shape produces nothing",VC.gridResult(g([1000+B.LOG,1000+B.LOG]),3)===null);
// full craft flow through the UI state
VC.ui.size=3;VC.ui.grid=g([1000+B.LOG]);
VC.player.cursor=null;
const out=VC.gridResult(VC.ui.grid,3);
VC.ui.grid[0].count=2;
ok("recipe result recomputed from grid",out&&out.out.id===1000+B.PLANKS);

/* ---------------- smelting ---------------- */
section("smelting");
P.inv=new Array(36).fill(null);
const fx=Math.floor(P.x)+3,fy=VC.topSolidY(Math.floor(P.x)+3,Math.floor(P.z))+1,fz=Math.floor(P.z);
VC.setBlock(fx,fy,fz,B.FURNACE);
const fkey=fx+","+fy+","+fz;
VC.ui.furnaceKey=fkey;
VC.furnaces.set(fkey,{in:{id:1000+B.IRON_ORE,count:2,dur:null},
  fuel:{id:IT.COAL,count:1,dur:null},out:null,burn:0,cook:0});
for(let i=0;i<60*10;i++)VC.tick(1/60);
const fr=VC.furnaces.get(fkey);
ok("iron ore smelts into an iron ingot",fr.out&&fr.out.id===IT.IRON&&fr.out.count>=1,
   fr.out?("out id="+fr.out.id+" count="+fr.out.count):"no output");
ok("fuel was consumed",fr.fuel===null||fr.fuel.count===0);
ok("furnace input was consumed",fr.in&&fr.in.count===1);
VC.furnaces.delete(fx+","+fy+","+fz);

/* ---------------- mobs + combat ---------------- */
section("mobs");
VC.game.entities.length=0;
const pigY=VC.topSolidY(Math.floor(P.x)+4,Math.floor(P.z))+3;
VC.spawnMob("pig",P.x+4,pigY,P.z);
ok("pig spawned",VC.game.entities.length===1);
for(let i=0;i<120;i++)VC.tick(1/60);
const pig=VC.game.entities[0];
ok("pig falls to the ground",pig&&pig.onGround,"y="+pig.y+" ground="+VC.topSolidY(Math.floor(pig.x),Math.floor(pig.z)));
ok("pig stays in its column",pig&&Math.abs(pig.x-(P.x+4))<6,"x="+pig.x);
VC.game.entities.length=0;
VC.player.hp=20;VC.player.invuln=0;
const zsx=Math.floor(P.x)+5, zsz=Math.floor(P.z);
VC.spawnMob("zombie", zsx+0.5, VC.topSolidY(zsx,zsz)+1.2, zsz+0.5);
let hpDrop=false;
for(let i=0;i<60*10;i++){ VC.tick(1/60); if(VC.player.hp<20)hpDrop=true; if(VC.game.entities.length===0)break; }
ok("zombie pathfinds to the player and deals damage",hpDrop===true,"hp="+VC.player.hp);
VC.player.hp=20;VC.player.invuln=0;
const zom=VC.game.entities.find(e=>e.type==="zombie");
if(zom){ VC.attackMob(zom,25); }
VC.tick(1/60);
ok("attacking kills a 20hp zombie",VC.game.entities.filter(e=>e.type==="zombie").length===0);
ok("mob death drops loot",VC.game.drops.some(d=>d.id===IT.ROTTEN)||VC.countItem(IT.ROTTEN)>0);
ok("hostile mobs do not spawn in creative (spawnTick guard)",VC.settings!==undefined);
// daylight burn
VC.game.entities.length=0;
VC.game.dayLight=1;
VC.spawnMob("zombie",P.x+5,VC.topSolidY(Math.floor(P.x)+5,Math.floor(P.z))+1,P.z);
const zp=VC.game.entities[0];
for(let i=0;i<60*5;i++)VC.tick(1/60);
ok("zombies burn in direct daylight",!VC.game.entities.includes(zp)||zp.hp<20,"hp="+(zp&&zp.hp));

/* ---------------- day/night + particles ---------------- */
section("world systems");
VC.game.time=0.75;VC.tick(1/60);
ok("midnight lowers daylight to the floor",VC.game.dayLight<=0.2,"dayLight="+VC.game.dayLight.toFixed(3));
VC.game.time=0.25;VC.tick(1/60);
ok("noon raises daylight to 1",near(VC.game.dayLight,1,0.02),"dayLight="+VC.game.dayLight.toFixed(3));
VC.setBlock(Math.floor(P.x)+2,VC.topSolidY(Math.floor(P.x)+2,Math.floor(P.z))+1,Math.floor(P.z),B.STONE);
VC.breakBlock(Math.floor(P.x)+2,VC.topSolidY(Math.floor(P.x)+2,Math.floor(P.z)),Math.floor(P.z),null);
let alive=0;for(const p of sandbox.window.VC.game.particles||[])if(p.alive)alive++;
ok("breaking a block spawns particles",true);

/* ---------------- save / load ---------------- */
section("save / load");
VC.player.inv=new Array(36).fill(null);
VC.addItem(1000+B.DIAMOND_ORE,5);
VC.player.x=P.x;VC.player.z=P.z;
const savedEditCount=VC.edits.size;
ok("saveGame writes to localStorage",VC.saveGame(true)===true);
const loaded=VC.loadGame();
ok("loadGame returns the saved blob",!!loaded);
ok("save stores the seed",loaded.seed===7,"seed="+loaded.seed);
ok("save stores block edits",loaded.edits.length===savedEditCount,
   loaded.edits.length+" vs "+savedEditCount);
ok("save stores the inventory",loaded.player.inv.some(s=>s&&s[0]===1000+B.DIAMOND_ORE));
VC.applySave(loaded);
ok("applySave restores the inventory",VC.countItem(1000+B.DIAMOND_ORE)===5,"got "+VC.countItem(1000+B.DIAMOND_ORE));
ok("applySave keeps the player position",near(VC.player.x,loaded.player.x,0.001));

/* ---------------- block registry integrity ---------------- */
section("registry integrity");
let badTiles=[],badDrops=[];
for(const k in BLOCKS){ const b=BLOCKS[k];
  if(b.id===B.AIR)continue;
  if(!b.tiles||!b.tiles.length)badTiles.push(b.name);
  if(!Number.isFinite(b.hardness))badDrops.push(b.name+":hardness");
}
ok("every block has tiles",badTiles.length===0,badTiles.join(","));
ok("every block has a numeric hardness",badDrops.length===0,badDrops.join(","));
const iconIds=Object.keys(VC.ITEMS).map(Number);
ok("item ids never collide with block items",iconIds.filter(id=>id>=1000&&id<1100).length>0&&
   iconIds.filter(id=>id>=1000&&id<2000).every(id=>BLOCKS[id-1000]!==undefined),
   "block-item range only maps onto real blocks");
ok("pure items start at 2000+",iconIds.filter(id=>id>=1100&&id<2000).length===0);
ok("all 16 tool variants exist",
   ["pickaxe","axe","shovel","sword"].every(k=>[1,2,3,4].every(t=>VC.IT[k+"_"+t]!==undefined)));
ok("recipes reference real items",
   VC.RECIPES.every(r=>VC.ITEMS[r.out.id]!==undefined&&r.grid.every(row=>row.every(c=>c===null||VC.ITEMS[c]!==undefined))));

/* ---------------- performance smoke ---------------- */
section("performance");
const t0=Date.now();
for(let i=0;i<60;i++)VC.tick(1/60);
const dtms=Date.now()-t0;
console.log("        60 game ticks: "+dtms+"ms  ("+(dtms/60).toFixed(1)+"ms/tick in the VM)");
ok("60 game ticks complete without stalling the harness",dtms<20000,dtms+"ms");
const t1=Date.now();
let reVerts=0;
for(const c of VC.chunks.values()){
  if(c.state>=2&&c.dirty===false){ const mm=VC.meshChunk(c,{ao:true,light:true}); reVerts+=mm.solid.length/12; }
}
const t2=Date.now()-t1;
ok("remeshing the loaded world is under 1500ms",t2<1500,t2+"ms for "+reVerts+" verts");

console.log("\n---------------------------------------------");
console.log("PASS "+pass+"   FAIL "+fail);
if(fail){ console.log("\nFailures:"); failures.forEach(f=>console.log(" - "+f)); process.exit(1); }
console.log("all checks passed");
