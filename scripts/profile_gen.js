#!/usr/bin/env node
/* Focused diagnostic: where does chunk-generation time actually go?
   Reuses the verification harness's DOM/WebGL stubs, boots the game script,
   benchmarks the noise primitives and prints the gen phase profile.
   Usage: node scripts/profile_gen.js                                                */
const fs=require("fs"),path=require("path"),vm=require("vm");
const ROOT=path.join(__dirname,"..");
process.chdir(ROOT);
const html=fs.readFileSync(path.join(ROOT,"index.html"),"utf8");
const code=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].pop()[1];
const harness=fs.readFileSync(path.join(ROOT,"scripts","verify_game.js"),"utf8").replace(/^#![^\n]*\n/,"");
const setup=harness.split("/* syntax check first */")[0];

const body=`
const ctxP=vm.createContext(sandbox);
vm.runInContext(code, ctxP, {filename:"game.js"});
const VC=sandbox.window.VC;
function bench(label,n,fn){
  const t0=Date.now(); let acc=0;
  for(let i=0;i<n;i++) acc+=fn(i);
  const dt=Date.now()-t0;
  console.log("  "+label.padEnd(28)+(dt+"ms for "+n).padEnd(22)+"("+(dt*1000/n).toFixed(2)+" us/call)  checksum "+acc.toFixed(0));
  return dt;
}
console.log("\\n== noise primitives ==");
bench("hash3",2000000,(i)=>VC.hash3(i&1023,(i>>10)&1023,(i>>20)&127,7));
bench("noise3",200000,(i)=>VC.noise3(i*0.1,i*0.07,i*0.05,3));
bench("fbm3 (2 octaves)",100000,(i)=>VC.fbm3(i*0.1,i*0.07,i*0.05,3,2));
bench("fbm3 (3 octaves)",100000,(i)=>VC.fbm3(i*0.1,i*0.07,i*0.05,3,3));
bench("noise2",500000,(i)=>VC.noise2(i*0.1,i*0.07,3));
bench("fbm2 (4 octaves)",200000,(i)=>VC.fbm2(i*0.1,i*0.07,3,4));
bench("biomeAt (per column)",20000,(i)=>VC.biomeAt(i*3,i*5).h);

console.log("\\n== actual per-chunk cost ==");
const ch=VC.newChunk(2000,2000);VC.setChunk(ch);
let t0=Date.now(); VC.genChunkData(ch); let gen=Date.now()-t0;
t0=Date.now(); VC.lightChunk(ch); let light=Date.now()-t0;
t0=Date.now(); const m=VC.meshChunk(ch,{ao:true,light:true}); let mesh=Date.now()-t0;
console.log("  gen "+gen+"ms   light "+light+"ms   mesh "+mesh+"ms   verts "+m.solid.length/12);
const p=VC.genProfile;
if(p.chunks){
  console.log("  gen breakdown over "+p.chunks+" chunk(s):");
  console.log("    columns(caves+ores+biome) "+(p.columns/p.chunks).toFixed(1)+"ms/chunk");
  console.log("    trees                     "+(p.trees/p.chunks).toFixed(1)+"ms/chunk");
  console.log("    total measured            "+(p.total/p.chunks).toFixed(1)+"ms/chunk");
}
let nonAir=0; for(const b of ch.blocks) if(b) nonAir++;
console.log("  non-air blocks in chunk: "+nonAir);
`;
const fn=new Function("require","module","exports","__dirname",setup+"\n"+body);
fn(require,{exports:{}},{},path.join(ROOT,"scripts"));
