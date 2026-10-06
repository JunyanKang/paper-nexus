/* Local semantic math/tokenization. Bibliographic fields are data, never prompts. */
var CiteLensSemanticCore=(()=>{
 let kernelFactory=null;const setKernel=factory=>{kernelFactory=factory;};
 const normalize=v=>{let length=Math.sqrt(v.reduce((s,x)=>s+x*x,0))||1;return Array.from(v,x=>x/length);};
 function tokenize(text,tokenizer,max=256){
  const vocab=tokenizer.model.vocab,unknown=vocab['[UNK]']??100;
  const cleaned=String(text).replace(/[\u0000\ufffd]/g,'').replace(/[\p{Cc}\p{Cf}]/gu,c=>/\s/.test(c)?' ':'').toLowerCase().normalize('NFD').replace(/\p{Mn}/gu,'').replace(/([\p{Script=Han}]|[\p{P}\u0021-\u002f\u003a-\u0040\u005b-\u0060\u007b-\u007e])/gu,' $1 ');
  const ids=[vocab['[CLS]']??101];for(const word of cleaned.split(/\s+/).filter(Boolean)){if(ids.length>=max-1)break;if(word.length>100){ids.push(unknown);continue;}let start=0,pieces=[];while(start<word.length){let end=word.length,found=null;while(end>start){const part=(start?'##':'')+word.slice(start,end);if(Object.prototype.hasOwnProperty.call(vocab,part)){found=vocab[part];break;}end--;}if(found===null){pieces=[unknown];break;}pieces.push(found);start=end;}for(const id of pieces){if(ids.length>=max-1)break;ids.push(id);}}
  ids.push(vocab['[SEP]']??102);return ids;
 }
 function pool(data,shape,masks){const [batch,length,width]=shape,result=[];for(let b=0;b<batch;b++){const vector=new Array(width).fill(0);let count=0;for(let t=0;t<length;t++){if(!masks[b*length+t])continue;count++;for(let k=0;k<width;k++)vector[k]+=data[(b*length+t)*width+k];}result.push(normalize(vector.map(x=>x/Math.max(1,count))));}return result;}
 const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
 function project(vector,adapter){if(!adapter||adapter.dimension!==vector.length)return vector;const d=vector.length,r=adapter.rank;if(!Number.isInteger(r)||r<1||r>128||adapter.a?.length!==d*r||adapter.b?.length!==r*d)return vector;const latent=new Array(r).fill(0),out=[...vector];for(let i=0;i<d;i++)for(let k=0;k<r;k++)latent[k]+=vector[i]*adapter.a[i*r+k];for(let k=0;k<r;k++)for(let j=0;j<d;j++)out[j]+=latent[k]*adapter.b[k*d+j];return normalize(out);}
 function combine(title,abstract=null,adapter=null){const t=project(title,adapter);if(!abstract)return t;const a=project(abstract,adapter);return normalize(t.map((x,i)=>.45*x+.55*a[i]));}
 function validAdapter(a){return !!a&&a.model==='Xenova/all-MiniLM-L6-v2'&&a.revision==='751bff37182d3f1213fa05d7196b954e230abad9'&&a.dimension===384&&Number.isInteger(a.rank)&&a.rank>0&&a.rank<=128&&Array.isArray(a.a)&&a.a.length===384*a.rank&&Array.isArray(a.b)&&a.b.length===a.rank*384&&a.a.every(Number.isFinite)&&a.b.every(Number.isFinite);}
 function abstractChunks(text){
  const words=String(text||'').trim().split(/\s+/).filter(Boolean);if(words.length<15)return [];
  const chunks=[];for(let at=0;at<words.length;at+=130)chunks.push(words.slice(at,at+150).join(' '));
  // Long abstracts retain the conclusion as well as the opening; bounded inference cost.
  return chunks.length<=4?chunks:[chunks[0],chunks[1],chunks[Math.floor(chunks.length/2)],chunks[chunks.length-1]];
 }
 // Exact incremental mutual top-k: unchanged pairs are reused. Deleting or
 // changing a top neighbour repairs that row, so results equal a fresh build.
 function graph(nodes,vectors,partition,{previous=null,signatures=null,progress=()=>{},threshold=.50,titleThreshold=.58,maxNeighbors=7}={}){
  const valid=v=>Array.isArray(v)&&v.length>0&&v.every(Number.isFinite),byID=new Map(nodes.map((n,i)=>[n.id,i]));
  const keys=nodes.map((n,i)=>JSON.stringify([signatures?.[i]||vectors[i],!!(n.abstract?.length>=80),threshold,titleThreshold,maxNeighbors]));
  const old=new Map(previous?.version===1?previous.rows:[]),changed=new Set(nodes.filter((n,i)=>old.get(n.id)?.key!==keys[i]).map(n=>n.id)),removed=new Set([...old.keys()].filter(id=>!byID.has(id))),repair=new Set(changed),near=nodes.map(()=>[]);
  for(let i=0;i<nodes.length;i++)if(!changed.has(nodes[i].id)){
   const row=old.get(nodes[i].id);if(!Array.isArray(row?.near)||row.near.some(x=>changed.has(x.id)||removed.has(x.id))){repair.add(nodes[i].id);continue;}
   near[i]=row.near.filter(x=>byID.has(x.id)).map(x=>({j:byID.get(x.id),score:x.score}));
  }
  const offer=(i,j,score)=>{const list=near[i],last=list[list.length-1];if(list.length>=maxNeighbors&&(score<last.score||score===last.score&&nodes[j].id.localeCompare(nodes[last.j].id)>=0))return;let at=list.length;while(at>0&&(score>list[at-1].score||score===list[at-1].score&&nodes[j].id.localeCompare(nodes[list[at-1].j].id)<0))at--;list.splice(at,0,{j,score});if(list.length>maxNeighbors)list.pop();};
  const fast=kernelFactory?.(vectors),usable=vectors.map(valid);let comparisons=0;const targets=[...repair].map(id=>byID.get(id)).sort((a,b)=>a-b),done=new Set();
  for(let at=0;at<targets.length;at++){const i=targets[at],scores=fast?.(i,targets.length===nodes.length?i+1:0);if(usable[i])for(let j=0;j<nodes.length;j++){
   if(i===j||done.has(j)||!usable[j]||vectors[i].length!==vectors[j].length)continue;
   // Unchanged repaired rows need a refill; ordinary unchanged rows only need
   // candidates from changed/new papers, never duplicate their retained list.
   const sendI=true,sendJ=repair.has(nodes[j].id)||changed.has(nodes[i].id);
   let score=0;if(scores)score=scores[j];else for(let k=0;k<vectors[i].length;k++)score+=vectors[i][k]*vectors[j][k];comparisons++;
   const minimum=(nodes[i].abstract?.length>=80&&nodes[j].abstract?.length>=80)?threshold:titleThreshold;
   if(score>=minimum){if(sendI)offer(i,j,score);if(sendJ)offer(j,i,score);}
  }done.add(i);if(at%16===0)progress({phase:'neighbors',completed:at+1,total:targets.length});}
  const edges=new Map();for(let i=0;i<nodes.length;i++)for(const {j,score} of near[i]){if(!near[j].some(n=>n.j===i))continue;const ids=[nodes[i].id,nodes[j].id].sort();edges.set(JSON.stringify(ids),{source:ids[0],target:ids[1],weight:score*score,score});}
  const links=[...edges.values()].sort((a,b)=>a.source.localeCompare(b.source)||a.target.localeCompare(b.target)),groups=partition(nodes.map(n=>n.id),links,1.05);
  return {groups:groups.filter(g=>g.length>1),links,state:{version:1,rows:nodes.map((n,i)=>[n.id,{key:keys[i],near:near[i].map(x=>({id:nodes[x.j].id,score:x.score}))}])},incremental:{changed:changed.size,removed:removed.size,repaired:repair.size,comparisons,reused:nodes.length-changed.size}};
 }
 // Select central, nonredundant evidence using vectors already in memory.
 // At most 48 candidates x 8 selections, independent of cluster size.
 function representatives(nodes,vectors,max=8){
  const valid=[];for(let i=0;i<nodes.length;i++)if(Array.isArray(vectors[i])&&vectors[i].length&&vectors[i].every(Number.isFinite)&&vectors[i].some(x=>x!==0))valid.push({node:nodes[i],vector:vectors[i]});
  if(!valid.length)return [...nodes].sort((a,b)=>String(a.id).localeCompare(String(b.id))).slice(0,max).map(n=>n.id);
  const d=valid[0].vector.length,centroid=new Array(d).fill(0);for(const row of valid)for(let i=0;i<d;i++)centroid[i]+=row.vector[i]/valid.length;const mean=normalize(centroid);
  const candidates=valid.map(row=>({...row,score:dot(row.vector,mean),redundancy:0})).sort((a,b)=>b.score-a.score||String(a.node.id).localeCompare(String(b.node.id))).slice(0,48),chosen=[];
  while(candidates.length&&chosen.length<max){candidates.sort((a,b)=>(.75*b.score-.25*b.redundancy)-(.75*a.score-.25*a.redundancy)||String(a.node.id).localeCompare(String(b.node.id)));const best=candidates.shift();chosen.push(best.node.id);for(const row of candidates)row.redundancy=Math.max(row.redundancy,dot(row.vector,best.vector));}
  return chosen;
 }
 return{setKernel,normalize,representatives,tokenize,pool,dot,project,combine,graph,validAdapter,abstractChunks};
})();
if(typeof module!=='undefined')module.exports=CiteLensSemanticCore;
