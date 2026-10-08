/* Factual author graph and bounded layout, run in a worker. */
var CiteLensNetworkMap=(()=>{
 const C=CiteLensCore,NC=CiteLensNetworkCore;
 const hash=s=>{let n=2166136261;for(const c of String(s))n=Math.imul(n^c.charCodeAt(0),16777619);return n>>>0;};
 function build({nodes,edges,mode='authors',limit=Number.MAX_SAFE_INTEGER,query='',selected='',positions=[],openEntities=[],previous=null}){
  if(mode!=='authors')throw Error('主题网络正在开发中');
  const matches=query?NC.search(nodes,query):[],priority=new Set([selected,...matches.map(n=>n.id)]),ordered=[...nodes.filter(n=>priority.has(n.id)),...nodes.filter(n=>!priority.has(n.id))],visible=ordered.slice(0,limit),papers=new Map(visible.map(n=>[n.id,{...n,kind:'paper',local:n.local!==false&&!n.external}])),links=[],seen=new Set();
  for(const edge of edges||[]){if(!papers.has(edge.source)||!papers.has(edge.target)||edge.source===edge.target)continue;const key=JSON.stringify([edge.source,edge.target,edge.kind]);if(seen.has(key))continue;seen.add(key);links.push({...edge});}
  const saved=new Map(positions.map(n=>[n.id,n])),paperNodes=[...papers.values()].sort((a,b)=>a.id.localeCompare(b.id));
  for(const node of paperNodes){node.color=6;const p=saved.get(node.id);if(p){node.x=p.x;node.y=p.y;node.pinned=!!p.pinned;}}
  const graph={mode:'authors',selected,positions,openEntities,nodes:paperNodes,edges:links,groups:[],matches:matches.filter(n=>papers.has(n.id)).map(n=>n.id),stats:{total:nodes.length,local:paperNodes.filter(n=>n.local).length,authors:0,hidden:Math.max(0,nodes.length-paperNodes.length)}};
  return authors(graph,previous);
 }
 function authors(graph,previous=null){
  const people=new Map(),pairs=new Map(),teams=new Map(),resolved=NC.authorIdentities(graph.nodes);let unattributed=0;
  for(const paper of graph.nodes){const ids=[];(paper.creators||[]).forEach((creator,position)=>{
   const identity=resolved.assignments.get(JSON.stringify([paper.id,position]));if(!identity)return;const {id}=identity;
   if(!people.has(id))people.set(id,{...identity,kind:'author',members:[],local:false,color:6});
   const node=people.get(id);if(identity.title.length>node.title.length)node.title=identity.title;if(!node.members.includes(paper.id))node.members.push(paper.id);node.local ||= paper.local;ids.push(id);
  });const unique=[...new Set(ids)].sort();if(!unique.length)unattributed++;teams.set(paper.id,unique);}
  // Use the complete author-paper incidence graph so consortium papers never
  // allocate a quadratic author clique.
  const incidenceIDs=[...people.keys()],incidenceEdges=[];
  for(const [paperID,ids] of teams){if(!ids.length)continue;const authorship='authorship:'+paperID;incidenceIDs.push(authorship);for(const id of ids)incidenceEdges.push({source:id,target:authorship,weight:1});}
  const partition=NC.incrementalCommunities(incidenceIDs,incidenceEdges,1.05,previous?.authors);
  graph.partitionState={authors:partition.state};graph.incremental=partition.stats;
  graph.authorCommunities=partition.groups.map(ids=>ids.filter(id=>people.has(id))).filter(ids=>ids.length);
  graph.authorship={papers:teams.size,contributions:incidenceEdges.length,projection:'author-paper'};
  // Keep the strongest twelve collaborators per author in the display graph.
  // Retained links still carry every shared-paper evidence record.
  const ranks=new Map([...people.keys()].map(id=>[id,hash(id)]));
  for(const node of people.values()){
   const candidates=new Map();for(const paperID of node.members){const team=teams.get(paperID)||[],weight=1/Math.max(1,team.length-1);for(const id of team)if(id!==node.id)candidates.set(id,(candidates.get(id)||0)+weight);}
   node.coauthorCount=candidates.size;
   const ranked=[...candidates].sort((a,b)=>b[1]-a[1]||((ranks.get(node.id)^ranks.get(a[0]))>>>0)-((ranks.get(node.id)^ranks.get(b[0]))>>>0)||a[0].localeCompare(b[0]));
   for(const [id,strength] of ranked.slice(0,12)){const ends=[node.id,id].sort(),key=JSON.stringify(ends);if(pairs.has(key))continue;const other=new Set(people.get(id).members),shared=node.members.filter(paperID=>other.has(paperID));pairs.set(key,{source:ends[0],target:ends[1],kind:'coauthor',strength,evidence:shared.map(paperID=>({paperID}))});}
  }
  graph.identityMetrics=resolved.metrics;graph.paperNodes=graph.nodes;graph.paperEdges=graph.edges;graph.nodes=[...people.values()].sort((a,b)=>a.id.localeCompare(b.id));graph.edges=[...pairs.values()];graph.stats.authors=graph.nodes.length;graph.stats.unattributed=unattributed;
  return expandMembers(graph);
 }
 function expandMembers(graph){
  const papers=new Map((graph.paperNodes||[]).map(n=>[n.id,n])),opened=new Set(graph.openEntities||[]),shown=new Set();
  for(const node of [...graph.nodes]){if(!opened.has(node.id))continue;for(const id of (node.members||[]).slice(0,120)){if(shown.has(id))continue;const paper=papers.get(id);if(!paper)continue;graph.nodes.push({...paper,group:node.id});shown.add(id);graph.edges.push({source:node.id,target:id,kind:'membership',evidence:[{paperID:id}]});}}
  const saved=new Map((graph.positions||[]).map(p=>[p.id,p]));for(const node of graph.nodes){const p=saved.get(node.id);if(p){node.x=p.x;node.y=p.y;node.pinned=!!p.pinned;node.layoutFixed=Number.isFinite(p.x)&&Number.isFinite(p.y);}}
  graph.matches=[...new Set((graph.matches||[]).flatMap(id=>graph.nodes.some(n=>n.id===id)?[id]:graph.nodes.filter(n=>n.members?.includes(id)).map(n=>n.id)))];return graph;
 }
 function communityGroups(ids,links,resolution=1.05){return NC.multilevelCommunities(ids,links,resolution);}
 function communityRelations(groups,links){
  const owner=new Map(),volume=new Map(groups.map(g=>[g.id,0])),external=new Map(groups.map(g=>[g.id,0])),pairs=new Map();
  for(const group of groups)for(const id of group.members)owner.set(id,group);
  for(const edge of links){const a=owner.get(edge.source),b=owner.get(edge.target),weight=Math.max(0,edge.weight||0);if(!a||!b||!weight)continue;volume.set(a.id,volume.get(a.id)+weight);volume.set(b.id,volume.get(b.id)+weight);if(a===b)continue;const key=[a.id,b.id].sort().join('|');if(!pairs.has(key))pairs.set(key,{a,b,weight:0});pairs.get(key).weight+=weight;external.set(a.id,external.get(a.id)+weight);external.set(b.id,external.get(b.id)+weight);}
  return [...pairs.values()].map(pair=>{const total=pair.weight/Math.sqrt(volume.get(pair.a.id)*volume.get(pair.b.id)),cross=pair.weight/Math.sqrt(external.get(pair.a.id)*external.get(pair.b.id)),affinity=1-Math.exp(-6*Math.sqrt(total*cross));return {...pair,affinity,gap:48+250*(1-affinity)**2};});
 }
 // Count papers once per pair of communities from full membership, before display sparsification.
 function publicationRelations(groups,nodes){
  const byID=new Map(nodes.map(n=>[n.id,n])),papers=new Map(),volume=new Map(),pairs=new Map();
  for(const group of groups){const ids=new Set();for(const id of group.members)for(const paper of byID.get(id)?.members||[])ids.add(paper);volume.set(group.id,ids.size);for(const paper of ids){if(!papers.has(paper))papers.set(paper,[]);papers.get(paper).push(group);}}
  for(const [paper,teams] of papers)for(let i=0;i<teams.length;i++)for(let j=i+1;j<teams.length;j++){
   const [a,b]=[teams[i],teams[j]].sort((a,b)=>a.id.localeCompare(b.id)),key=JSON.stringify([a.id,b.id]);if(!pairs.has(key))pairs.set(key,{a,b,evidence:[]});pairs.get(key).evidence.push({paperID:paper});
  }
  return [...pairs.values()].map(pair=>{const count=pair.evidence.length,relative=count/Math.sqrt(volume.get(pair.a.id)*volume.get(pair.b.id)),support=Math.log2(1+count),affinity=1-Math.exp(-support*.45-relative*.55);return {...pair,count,weight:count,affinity,gap:42+260*(1-affinity)};});
 }
 function layout(graph,progress=()=>{}){
  if(graph.mode!=='authors')throw Error('主题网络正在开发中');const nodes=graph.nodes,byID=new Map(nodes.map(n=>[n.id,n]));if(!nodes.length){graph.communities=[];graph.stats.communities=0;return graph;}
  const links=graph.edges.map(edge=>({...edge,weight:edge.kind==='coauthor'?Math.max(.02,edge.strength??edge.evidence?.length??1):1}));
  let raw=graph.authorCommunities?graph.authorCommunities.map(ids=>[...ids]):communityGroups(nodes.filter(n=>n.kind==='author').map(n=>n.id),links.filter(e=>e.kind==='coauthor'),1.05);
  const assigned=new Set(raw.flat());for(const node of nodes)if(node.kind==='author'&&!assigned.has(node.id))raw.push([node.id]);
  const authorGroup=new Map();raw.forEach((ids,index)=>ids.forEach(id=>authorGroup.set(id,index)));for(const node of nodes)if(node.kind==='paper'&&authorGroup.has(node.group))raw[authorGroup.get(node.group)].push(node.id);
  const groups=raw.filter(ids=>ids.length).map(ids=>{const members=ids.map(id=>byID.get(id)).filter(Boolean),lead=members.filter(n=>n.kind==='author').sort((a,b)=>(b.members?.length||0)-(a.members?.length||0)||a.id.localeCompare(b.id))[0],id='community:'+(lead?.id||ids[0]);return{id,members:members.map(n=>n.id),papers:members.length,r:24+Math.sqrt(members.length)*15,pinned:members.some(n=>n.pinned),vx:0,vy:0,title:lead?.title||'',color:hash(id)%6};});
  const owner=new Map();for(const group of groups)for(const id of group.members){owner.set(id,group);const node=byID.get(id);node.community=group.id;node.color=group.papers<2?6:group.color;}
  const spacing=Math.max(110,Math.sqrt(nodes.length/groups.length)*55),old=new Map(),aspect=1.65;
  groups.forEach((group,index)=>{const saved=group.members.map(id=>byID.get(id)).filter(n=>Number.isFinite(n.x)&&Number.isFinite(n.y));if(saved.length){group.x=saved.reduce((sum,n)=>sum+n.x,0)/saved.length;group.y=saved.reduce((sum,n)=>sum+n.y,0)/saved.length;}else{const angle=index*Math.PI*(3-Math.sqrt(5)),radius=Math.sqrt(index+.5)*spacing*.72;group.x=Math.cos(angle)*radius*Math.sqrt(aspect);group.y=Math.sin(angle)*radius/Math.sqrt(aspect);}old.set(group.id,{x:group.x,y:group.y});});
  const bridges=graph.authorship?publicationRelations(groups,nodes):communityRelations(groups,links),relations=new Map(bridges.map(edge=>[[edge.a.id,edge.b.id].sort().join('|'),edge])),cellSize=2*Math.max(...groups.map(g=>g.r))+300,steps=nodes.some(n=>n.layoutFixed)?100:240;
  for(let step=0;step<steps;step++){
   const grid=new Map();for(const group of groups){const key=Math.floor(group.x/cellSize)+','+Math.floor(group.y/cellSize);if(!grid.has(key))grid.set(key,[]);grid.get(key).push(group);}
   for(const a of groups){const gx=Math.floor(a.x/cellSize),gy=Math.floor(a.y/cellSize);for(let ox=-1;ox<=1;ox++)for(let oy=-1;oy<=1;oy++)for(const b of grid.get((gx+ox)+','+(gy+oy))||[]){if(a.id>=b.id)continue;let dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy);if(d<.01){dx=1;dy=.5;d=Math.hypot(dx,dy);}const relation=relations.get([a.id,b.id].sort().join('|')),ideal=a.r+b.r+(relation?Math.min(130,relation.gap):160);if(d<ideal){const force=(ideal-d)*.12;a.vx-=dx/d*force;a.vy-=dy/d*force;b.vx+=dx/d*force;b.vy+=dy/d*force;}}}
   for(const {a,b,affinity,gap} of bridges){const dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy)||1,ideal=a.r+b.r+gap,force=(d-ideal)*(.065+.12*affinity);a.vx+=dx/d*force;a.vy+=dy/d*force;b.vx-=dx/d*force;b.vy-=dy/d*force;}
   for(const group of groups){group.vx*=.65;group.vy*=.65;if(!group.pinned){group.x+=Math.max(-12,Math.min(12,group.vx));group.y+=Math.max(-12,Math.min(12,group.vy));}}if(step%40===0)progress(38+Math.round(step/steps*22));
  }
  for(const node of nodes){const group=owner.get(node.id),prior=old.get(group.id),angle=hash(node.id)%6283/1000,radius=Math.sqrt((hash(node.id+'r')%1000)/1000)*group.r*.75;if(!Number.isFinite(node.x)||!Number.isFinite(node.y)){node.x=group.x+Math.cos(angle)*radius;node.y=group.y+Math.sin(angle)*radius;}else if(!node.pinned){node.x+=group.x-prior.x;node.y+=group.y-prior.y;}node.vx=node.vy=0;}
  const physical=links.map(edge=>({a:byID.get(edge.source),b:byID.get(edge.target),weight:edge.weight,local:owner.get(edge.source)===owner.get(edge.target)})).filter(edge=>edge.a&&edge.b);
  for(let step=0;step<(nodes.some(n=>n.layoutFixed)?60:150);step++){
   const cells=new Map();for(const node of nodes){const group=owner.get(node.id),key=Math.floor(node.x/48)+','+Math.floor(node.y/48);if(!cells.has(key))cells.set(key,[]);cells.get(key).push(node);node.vx+=(group.x-node.x)*.018;node.vy+=(group.y-node.y)*.018;}
   for(const node of nodes){const gx=Math.floor(node.x/48),gy=Math.floor(node.y/48);for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(const other of cells.get((gx+dx)+','+(gy+dy))||[]){if(node.id>=other.id)continue;let x=node.x-other.x,y=node.y-other.y,d=Math.hypot(x,y);if(d<.01){const angle=hash(node.id+other.id)%6283/1000;x=Math.cos(angle);y=Math.sin(angle);d=1;}const distance=node.kind==='paper'&&other.kind==='paper'?24:38,force=Math.min(3.5,260/(d*d))+Math.max(0,distance-d)*.12;node.vx+=x/d*force;node.vy+=y/d*force;other.vx-=x/d*force;other.vy-=y/d*force;}}
   for(const {a,b,weight,local} of physical){const dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy)||1,ideal=local?42:180,force=(d-ideal)*(local?.014*Math.min(2,weight):.0005);a.vx+=dx/d*force;a.vy+=dy/d*force;b.vx-=dx/d*force;b.vy-=dy/d*force;}
   for(const node of nodes){if(node.pinned)continue;node.vx*=.68;node.vy*=.68;node.x+=Math.max(-7,Math.min(7,node.vx));node.y+=Math.max(-7,Math.min(7,node.vy));}if(step%30===0)progress(62+Math.round(step/150*34));
  }
  const degree=new Map(nodes.map(n=>[n.id,new Set()]));for(const edge of graph.edges){degree.get(edge.source)?.add(edge.target);degree.get(edge.target)?.add(edge.source);}for(const node of nodes){node.degree=degree.get(node.id).size;delete node.vx;delete node.vy;delete node.layoutFixed;}
  graph.communityEdges=bridges.filter(e=>e.evidence).map(e=>({source:e.a.id,target:e.b.id,kind:'coauthor',evidence:e.evidence,count:e.count}));
  graph.communities=groups.map(group=>{const members=group.members.map(id=>byID.get(id));return{id:group.id,title:group.title,color:group.color,members:group.members,papers:group.papers,x:members.reduce((sum,n)=>sum+n.x,0)/members.length,y:members.reduce((sum,n)=>sum+n.y,0)/members.length};});graph.stats.communities=groups.filter(g=>g.members.length>1).length;return graph;
 }
 return {build,layout,authors,hash,communityGroups,communityRelations,publicationRelations,expandMembers};
})();
if(typeof module!=='undefined')module.exports=CiteLensNetworkMap;
