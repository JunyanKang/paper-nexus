/* Local semantic math/tokenization. Bibliographic fields are data, never prompts. */
var CiteLensSemanticCore=(()=>{
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
 function graph(nodes,vectors,partition,assignments=null,{previous=null,signatures=null,progress=()=>{}}={}){
  const valid=v=>Array.isArray(v)&&v.length>0&&v.every(Number.isFinite),topics=new Map((assignments||[]).map(r=>[r.id,r.topic.trim().toLowerCase()])),byID=new Map(nodes.map((n,i)=>[n.id,i]));
  const keys=nodes.map((n,i)=>JSON.stringify([signatures?.[i]||vectors[i],!!(n.abstract?.length>=80),topics.get(n.id)||'',!!topics.size]));
  const old=new Map(previous?.version===1?previous.rows:[]),changed=new Set(nodes.filter((n,i)=>old.get(n.id)?.key!==keys[i]).map(n=>n.id)),removed=new Set([...old.keys()].filter(id=>!byID.has(id))),repair=new Set(changed),near=nodes.map(()=>[]);
  for(let i=0;i<nodes.length;i++)if(!changed.has(nodes[i].id)){
   const row=old.get(nodes[i].id);if(!Array.isArray(row?.near)||row.near.some(x=>changed.has(x.id)||removed.has(x.id))){repair.add(nodes[i].id);continue;}
   near[i]=row.near.filter(x=>byID.has(x.id)).map(x=>({j:byID.get(x.id),score:x.score}));
  }
  const offer=(i,j,score)=>{const list=near[i];list.push({j,score});list.sort((a,b)=>b.score-a.score||nodes[a.j].id.localeCompare(nodes[b.j].id));if(list.length>7)list.pop();};
  const usable=vectors.map(valid);let comparisons=0;const targets=[...repair].map(id=>byID.get(id)).sort((a,b)=>a-b),done=new Set();
  for(let at=0;at<targets.length;at++){const i=targets[at];if(usable[i])for(let j=0;j<nodes.length;j++){
   if(i===j||done.has(j)||!usable[j]||vectors[i].length!==vectors[j].length||topics.size&&topics.get(nodes[i].id)!==topics.get(nodes[j].id))continue;
   // Unchanged repaired rows need a refill; ordinary unchanged rows only need
   // candidates from changed/new papers, never duplicate their retained list.
   const sendI=true,sendJ=repair.has(nodes[j].id)||changed.has(nodes[i].id);
   let score=0;for(let k=0;k<vectors[i].length;k++)score+=vectors[i][k]*vectors[j][k];comparisons++;
   const threshold=(nodes[i].abstract?.length>=80&&nodes[j].abstract?.length>=80)?.50:.58;
   if(score>=threshold){if(sendI)offer(i,j,score);if(sendJ)offer(j,i,score);}
  }done.add(i);if(at%16===0)progress({phase:'neighbors',completed:at+1,total:targets.length});}
  const edges=new Map();for(let i=0;i<nodes.length;i++)for(const {j,score} of near[i]){if(!near[j].some(n=>n.j===i))continue;const ids=[nodes[i].id,nodes[j].id].sort();edges.set(JSON.stringify(ids),{source:ids[0],target:ids[1],weight:score*score,score});}
  const links=[...edges.values()].sort((a,b)=>a.source.localeCompare(b.source)||a.target.localeCompare(b.target)),groups=partition(nodes.map(n=>n.id),links,1.05);
  return {groups:groups.filter(g=>g.length>1),links,state:{version:1,rows:nodes.map((n,i)=>[n.id,{key:keys[i],near:near[i].map(x=>({id:nodes[x.j].id,score:x.score}))}])},incremental:{changed:changed.size,removed:removed.size,repaired:repair.size,comparisons,reused:nodes.length-changed.size}};
 }
 function validateTopics(result,nodes){if(!Array.isArray(result?.papers))throw Error('模型未返回有效的主题结果');const allowed=new Set(nodes.map(n=>n.id)),seen=new Set();const rows=[];for(const row of result.papers){if(!allowed.has(row.id)||seen.has(row.id)||typeof row.topic!=='string'||!row.topic.trim()||row.topic.length>120)throw Error('模型返回了不匹配的文献或主题');seen.add(row.id);rows.push({id:row.id,topic:row.topic.trim(),keywords:Array.isArray(row.keywords)?row.keywords.filter(x=>typeof x==='string').map(x=>x.slice(0,50)).slice(0,5):[]});}if(seen.size!==allowed.size)throw Error('模型未完成全部文献的主题分析');return rows;}
 return{normalize,tokenize,pool,dot,project,combine,graph,validateTopics,validAdapter,abstractChunks};
})();
if(typeof module!=='undefined')module.exports=CiteLensSemanticCore;
