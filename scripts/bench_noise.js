// plain-node speed check for the exact noise functions used by the game
function hash3(x,y,z,s){let h=Math.imul(x|0,374761393)+Math.imul(y|0,1103515245)+Math.imul(z|0,668265263)+Math.imul(s|0,1442695040);
  h=(h^(h>>>13));h=Math.imul(h,1274126177);return ((h^(h>>>16))>>>0)/4294967296;}
function hash3v2(x,y,z,s){let h=Math.imul(x|0,374761393)^Math.imul(y|0,1103515245)^Math.imul(z|0,668265263)^Math.imul(s|0,1442695040);
  h=Math.imul(h^(h>>>15),2246822519);h=Math.imul(h^(h>>>13),3266489917);return ((h^(h>>>16))>>>0)/4294967296;}
const smooth=t=>t*t*(3-2*t);
const lerp=(a,b,t)=>a+(b-a)*t;
function noise3(x,y,z,s){const xi=Math.floor(x),yi=Math.floor(y),zi=Math.floor(z);
  const xf=smooth(x-xi),yf=smooth(y-yi),zf=smooth(z-zi);
  const c000=hash3(xi,yi,zi,s),c100=hash3(xi+1,yi,zi,s),c010=hash3(xi,yi+1,zi,s),c110=hash3(xi+1,yi+1,zi,s),
        c001=hash3(xi,yi,zi+1,s),c101=hash3(xi+1,yi,zi+1,s),c011=hash3(xi,yi+1,zi+1,s),c111=hash3(xi+1,yi+1,zi+1,s);
  return lerp(lerp(lerp(c000,c100,xf),lerp(c010,c110,xf),yf),
              lerp(lerp(c001,c101,xf),lerp(c011,c111,xf),yf),zf);}
function fbm3(x,y,z,s,oct,lac,gain){lac=lac||2;gain=gain||.5;let a=1,f=1,sum=0,norm=0;
  for(let i=0;i<oct;i++){sum+=a*noise3(x*f,y*f,z*f,s+i*31);norm+=a;a*=gain;f*=lac;}return sum/norm;}
function bench(label,n,fn){const t0=Date.now();let acc=0;for(let i=0;i<n;i++)acc+=fn(i);
  const dt=Date.now()-t0;console.log("  "+label.padEnd(24)+(dt+"ms").padEnd(12)+(dt*1000/n).toFixed(4)+" us/call");
  return acc;}
console.log("plain node (no vm):");
bench("hash3",2000000,(i)=>hash3(i&1023,(i>>10)&1023,(i>>20)&127,7));
bench("hash3v2",2000000,(i)=>hash3v2(i&1023,(i>>10)&1023,(i>>20)&127,7));
bench("noise3",200000,(i)=>noise3(i*0.1,i*0.07,i*0.05,3));
bench("fbm3 2oct",100000,(i)=>fbm3(i*0.1,i*0.07,i*0.05,3,2));
// simulate one chunk's ore+cave work: 256 columns x 60 cells x 3 fbm3(2oct)
const t0=Date.now();let acc=0;
for(let c=0;c<256;c++)for(let y=0;y<60;y++){acc+=fbm3(c*0.055,y*0.062,y*0.05,3,2);acc+=fbm3(c*0.021,y*0.028,y*0.02,63,2);acc+=fbm3(c*0.16,y*0.16,y*0.17,71,2);}
console.log("  one chunk's noise workload: "+(Date.now()-t0)+"ms  (acc "+acc.toFixed(0)+")");
