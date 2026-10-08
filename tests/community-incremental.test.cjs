const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const ctx=vm.createContext({CiteLensCore:require('../addon/core.js')});vm.runInContext(fs.readFileSync('addon/network-core.js','utf8'),ctx);const N=ctx.CiteLensNetworkCore;
const canonical=groups=>JSON.stringify(groups.map(g=>[...g].sort()).sort((a,b)=>a[0].localeCompare(b[0])));
test('certified incremental partition equals full global modularity after weighted changes, bridges and splits',()=>{
 let seed=784;const rand=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);let reused=0;
 for(let round=0;round<30;round++){
  const ids=Array.from({length:80},(_,i)=>'n'+String(i).padStart(3,'0')),edges=[];
  for(let i=0;i<ids.length;i++)for(let j=i+1;j<ids.length;j++)if(Math.floor(i/20)===Math.floor(j/20)&&rand()<.25)edges.push({source:ids[i],target:ids[j],weight:.1+rand()});
  let result=N.incrementalCommunities(ids,edges);assert.equal(canonical(result.groups),canonical(N.multilevelCommunities(ids,edges)));
  for(let step=0;step<9;step++){
   if(step%3===0)edges.push({source:ids[0],target:ids[1+Math.floor(rand()*19)],weight:.01+rand()*.1});
   else if(step%3===1)edges.shift();else edges.push({source:ids[0],target:ids[21],weight:.01+rand()*.1});
   result=N.incrementalCommunities(ids,edges,1.05,JSON.parse(JSON.stringify(result.state)));
   assert.equal(canonical(result.groups),canonical(N.multilevelCommunities(ids,edges)),`round ${round} step ${step}`);reused+=result.stats.reusedNodes;
  }
 }
 assert.ok(reused>0);
});
test('warm partitions reuse all components; deletion, split and changed global mass stay exact',()=>{
 let ids=Array.from({length:12},(_,i)=>'p'+i),edges=[];
 for(let i=0;i<11;i++)edges.push({source:ids[i],target:ids[i+1],weight:1});
 let r=N.incrementalCommunities(ids,edges),warm=N.incrementalCommunities(ids,edges,1.05,r.state);assert.equal(warm.stats.recomputedNodes,0);
 for(const mutate of [()=>edges.splice(5,1),()=>{ids=ids.filter(id=>id!=='p0');edges=edges.filter(e=>e.source!=='p0'&&e.target!=='p0');},()=>edges.push({source:'p7',target:'p9',weight:1000})]){
  mutate();r=N.incrementalCommunities(ids,edges,1.05,r.state);assert.equal(canonical(r.groups),canonical(N.multilevelCommunities(ids,edges)));
 }
});
test('partition input order and serialized state do not alter membership',()=>{
 const ids=['d','c','b','a'],edges=[{source:'a',target:'b',weight:1},{source:'c',target:'d',weight:.8}];const r=N.incrementalCommunities(ids,edges);
 assert.equal(canonical(r.groups),canonical(N.incrementalCommunities([...ids].reverse(),[...edges].reverse(),1.05,JSON.parse(JSON.stringify(r.state))).groups));
 assert.equal(N.incrementalCommunities(ids,edges,2,r.state).stats.reusedNodes,0);
});
