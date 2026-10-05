/* Graph model and bounded layout, run in a worker. No library writes or remote calls. */
var CiteLensNetworkMap=(()=>{
 const C=CiteLensCore,NC=CiteLensNetworkCore;
 const hash=s=>{let n=2166136261;for(const c of String(s))n=Math.imul(n^c.charCodeAt(0),16777619);return n>>>0;};
 function build({nodes,edges,references,mode='authors',expanded=[],limit=600,externalLimit=300,query='',selected='',positions=[]}){
  const byID=new Map(nodes.map(n=>[n.id,n])),matches=query?NC.search(nodes,query):[],priority=new Set([selected,...matches.map(n=>n.id)]),ordered=[...nodes.filter(n=>priority.has(n.id)),...nodes.filter(n=>!priority.has(n.id))],visible=ordered.slice(0,limit),papers=new Map(visible.map(n=>[n.id,{...n,kind:'paper',local:true}])),links=[],linkKeys=new Set(),refMap=new Map(references),visibleIDs=new Set(papers.keys()),knownDOI=new Map(),knownTitle=new Map();
  const addLink=(source,target,kind,evidence=[])=>{if(source===target)return;const key=source+'|'+target+'|'+kind;if(linkKeys.has(key))return;linkKeys.add(key);links.push({source,target,kind,evidence});};
  for(const n of nodes){const doi=C.recordDOI(n);if(doi){if(!knownDOI.has(doi))knownDOI.set(doi,[]);knownDOI.get(doi).push(n);}const key=C.norm(n.title)+'|'+n.year;if(!knownTitle.has(key))knownTitle.set(key,[]);knownTitle.get(key).push(n);}
  for(const e of edges)if(papers.has(e.source)&&papers.has(e.target))addLink(e.source,e.target,e.kind,e.evidence);
  let externalCount=0,omittedReferences=0;
  for(const source of expanded){if(!papers.has(source))continue;for(const [i,r] of (refMap.get(source)||[]).entries()){
   if(r.status==='ambiguous'){omittedReferences++;continue;}let target=r.target&&byID.get(r.target);const ref=r.ref;
   if(!target){const doi=C.recordDOI(ref),candidates=doi?knownDOI.get(doi)||[]:knownTitle.get(C.norm(ref.title)+'|'+ref.year)||[];if(candidates.length===1)target=candidates[0];}
   const key=target?.id||'ref:'+(C.recordDOI(ref)||[C.norm(ref.title),ref.year,ref.author].join('|'));
   if(!target&&(!C.norm(ref.title)||C.norm(ref.title).length<12)){omittedReferences++;continue;}
   if(!papers.has(key)){if(!target&&externalCount>=externalLimit){omittedReferences++;continue;}const n=target||{...ref,id:key,creators:ref.author?[{lastName:ref.author}]:[],attachments:[],collections:[]};papers.set(key,{...n,kind:'paper',local:!!target});if(!target)externalCount++;}
   addLink(source,key,'cites',[r.evidence]);
  }}
  const hubs=[],groups=[],allPapers=[...papers.values()];
  if(mode==='authors'){
   const authors=new Map();for(const n of allPapers)for(const a of n.creators||[]){const key=NC.authorKey(a);if(!key)continue;if(!authors.has(key))authors.set(key,{id:'author:'+key,kind:'author',title:[a.firstName,a.lastName].join(' '),members:[]});const hub=authors.get(key);if(!hub.members.includes(n.id))hub.members.push(n.id);}
   const ranked=[...authors.values()].sort((a,b)=>b.members.length-a.members.length||a.title.localeCompare(b.title));
   for(const hub of ranked.slice(0,160)){hubs.push(hub);groups.push({id:hub.id,title:hub.title,members:hub.members});for(const id of hub.members){addLink(hub.id,id,'author');if(!papers.get(id).group)papers.get(id).group=hub.id;}}
  }else{
   for(const g of NC.topics(allPapers)){const hub={id:'topic:'+g.id,kind:'topic',title:g.keywords.join(' · '),members:g.nodes.map(n=>n.id),abstracts:g.abstracts};hubs.push(hub);groups.push(hub);for(const n of g.nodes){papers.get(n.id).group=hub.id;addLink(hub.id,n.id,'topic');}}
  }
  // Incomplete external author names are grouped by their real citing source, never invented identities.
  const ungrouped=new Map();for(const e of links)if(e.kind==='cites'){const n=papers.get(e.target);if(n&&!n.group&&!n.local){if(!ungrouped.has(e.source))ungrouped.set(e.source,[]);ungrouped.get(e.source).push(n.id);n.group='references:'+e.source;}}
  for(const [source,members] of ungrouped){const n=papers.get(source),hub={id:'references:'+source,kind:'references',title:(n.creators?.[0]?.lastName||n.author||n.title.slice(0,22))+' · '+(n.year||'')+' 引文',members,source};hubs.push(hub);groups.push(hub);for(const id of members)addLink(hub.id,id,'reference-group');}
  const output=[...allPapers,...hubs],ids=new Set(output.map(n=>n.id)),saved=new Map(positions.map(n=>[n.id,n]));
  for(const n of output){const p=saved.get(n.id);n.color=hash(n.group||n.id)%6;if(p){n.x=p.x;n.y=p.y;n.pinned=p.pinned||false;}}
  return {nodes:output,edges:links.filter(e=>ids.has(e.source)&&ids.has(e.target)),groups,matches:matches.filter(n=>papers.has(n.id)).map(n=>n.id),stats:{total:nodes.length,local:allPapers.filter(n=>n.local).length,external:externalCount,authors:hubs.filter(n=>n.kind==='author').length,topics:hubs.filter(n=>n.kind==='topic').length,abstracts:allPapers.filter(n=>n.abstract).length,omittedReferences,hidden:Math.max(0,nodes.length-visible.length),referencesExpanded:expanded.length}};
 }
 function layout(graph,progress=()=>{}){
  const nodes=graph.nodes,count=nodes.length,byID=new Map(nodes.map(n=>[n.id,n])),groups=graph.groups,anchors=new Map(),radius=Math.max(180,Math.sqrt(count)*55);
  groups.forEach((g,i)=>{const angle=i*2.399963229728653,r=radius*Math.sqrt((i+.5)/Math.max(1,groups.length));anchors.set(g.id,{x:Math.cos(angle)*r,y:Math.sin(angle)*r});});
  for(const n of nodes){const a=anchors.get(n.kind==='paper'?n.group:n.id)||{x:0,y:0},angle=hash(n.id)%6283/1000;n.ax=a.x;n.ay=a.y;if(!Number.isFinite(n.x)){n.x=a.x+Math.cos(angle)*(35+hash(n.id)%110);n.y=a.y+Math.sin(angle)*(35+hash(n.id+'y')%110);}n.vx=n.vy=0;}
  const edges=graph.edges.map(e=>({a:byID.get(e.source),b:byID.get(e.target),kind:e.kind}));
  for(let step=0;step<120;step++){
   const cells=new Map();for(const n of nodes){const k=Math.floor(n.x/64)+','+Math.floor(n.y/64);if(!cells.has(k))cells.set(k,[]);cells.get(k).push(n);n.vx+=(n.ax-n.x)*.028;n.vy+=(n.ay-n.y)*.028;}
   for(const n of nodes){const gx=Math.floor(n.x/64),gy=Math.floor(n.y/64);for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(const m of cells.get((gx+dx)+','+(gy+dy))||[]){if(n===m)continue;const x=n.x-m.x,y=n.y-m.y,d2=Math.max(16,x*x+y*y),f=Math.min(2.8,240/d2);n.vx+=x/Math.sqrt(d2)*f;n.vy+=y/Math.sqrt(d2)*f;}}
   for(const {a,b,kind} of edges){const dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy)||1,ideal=kind==='cites'?110:75,k=(d-ideal)*(kind==='cites'?.0003:.015);a.vx+=dx/d*k;a.vy+=dy/d*k;b.vx-=dx/d*k;b.vy-=dy/d*k;}
   for(const n of nodes){if(n.pinned)continue;n.vx*=.7;n.vy*=.7;n.x+=Math.max(-8,Math.min(8,n.vx));n.y+=Math.max(-8,Math.min(8,n.vy));}if(step%20===0)progress(35+Math.round(step/120*60));
  }
  for(const n of nodes){delete n.vx;delete n.vy;delete n.ax;delete n.ay;}return graph;
 }
 return {build,layout,hash};
})();
if(typeof module!=='undefined')module.exports=CiteLensNetworkMap;
