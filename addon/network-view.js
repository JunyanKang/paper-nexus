/* Screen-space navigation and level of detail. Independent of Zotero and the renderer. */
var CiteLensNetworkView=(()=>{
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 function nodeLabel(node,mode='topics',max=52){
  const title=String(node.title||'').replace(/\s+/g,' ').trim();
  const text=node.kind==='paper'?String(node.topicTitle??title):title;
  const chars=Array.from(text);if(chars.length<=max)return text;
  let short=chars.slice(0,max-1).join('');const boundary=short.lastIndexOf(' ');if(boundary>max*.65)short=short.slice(0,boundary);
  return short+'…';
 }
 function wheel(e,height=600){
  const unit=e.deltaMode===1?16:e.deltaMode===2?height:1,dx=e.deltaX*unit,dy=e.deltaY*unit;
  // Precision scrolling pans; pinch arrives as Ctrl+wheel. Discrete mouse wheels zoom.
  const discrete=e.deltaMode!==0||(!e.deltaX&&Math.abs(e.deltaY)>=50&&[50,100,120].some(n=>Math.abs(e.deltaY)%n===0));
  return e.ctrlKey||discrete?{zoom:Math.exp(-clamp(dy,-180,180)*(e.ctrlKey?.008:.0025)),x:0,y:0}:{zoom:1,x:-dx,y:-dy};
 }
 function zoom(camera,factor,x,y){const k=clamp(camera.k*factor,.06,5),ratio=k/camera.k;return{x:x-(x-camera.x)*ratio,y:y-(y-camera.y)*ratio,k};}
 function step(camera,target,dt=16,reduced=false){const alpha=reduced?1:1-Math.exp(-clamp(dt,1,40)/35);for(const key of ['x','y','k'])camera[key]+=(target[key]-camera[key])*alpha;const pending=Math.abs(camera.x-target.x)+Math.abs(camera.y-target.y)>.08||Math.abs(camera.k-target.k)>.0001;if(!pending)Object.assign(camera,target);return pending;}
 function index(model){const byID=new Map(model.nodes.map(n=>[n.id,n])),adj=new Map(model.nodes.map(n=>[n.id,new Set([n.id])])),primary=new Map(),links=new Map(model.nodes.map(n=>[n.id,[]]));for(const e of model.edges){adj.get(e.source)?.add(e.target);adj.get(e.target)?.add(e.source);links.get(e.source)?.push(e);links.get(e.target)?.push(e);}for(const n of model.nodes)if(n.group){if(!primary.has(n.group))primary.set(n.group,[]);primary.get(n.group).push(n);}return{byID,adj,primary,links};}
 function scene(model,index,{selected='',focused=false,k=1,detail=false,community=''}={}){
  if(model.communities?.length)return communityScene(model,index,{selected,focused,k,community});
  if(index.overview){const near=index.detail?.id===selected?index.detail.near:index.adj.get(selected),allEdges=index.detail?index.detail.edges:index.overview,nodes=focused?model.nodes.filter(n=>near?.has(n.id)):model.nodes,ids=focused?new Set(nodes.map(n=>n.id)):null;return {nodes,edges:ids?allEdges.filter(e=>ids.has(e.source)&&ids.has(e.target)):allEdges,near,aggregate:!focused&&!detail&&model.nodes.length>70&&k<.9,hidden:model.nodes.length-nodes.length};}
  const near=index.adj.get(selected),aggregate=!focused&&!detail&&model.nodes.length>70&&k<.9,representatives=new Map(),nodes=[];
  const essential=new Set([selected,...(model.matches||[])]);
  if(near&&(focused||near.size<=50))for(const id of near)essential.add(id);
  for(const n of model.nodes){
   if(focused&&!near?.has(n.id))continue;
   // Paper locations remain visible at every zoom; only annotations simplify.
   // Single-paper coauthors are available on search/focus without cluttering the overview.

   representatives.set(n.id,n.id);nodes.push(n);
  }
  const ids=new Set(nodes.map(n=>n.id)),combined=new Map();
  for(const e of model.edges){const source=representatives.get(e.source),target=representatives.get(e.target);if(!ids.has(source)||!ids.has(target)||source===target)continue;const pair=[source,target].sort(),key=JSON.stringify(pair);if(!combined.has(key))combined.set(key,{source:pair[0],target:pair[1],kinds:new Set(),signals:new Set(),directions:new Set()});const link=combined.get(key);link.kinds.add(e.kind);
   // Repeated PDF occurrences/copies of the same citing work count once.
   // Shared author identities are distinct; a text-similarity score is one signal.
   if(e.kind==='cites'){link.signals.add('cites:'+e.source+'>'+e.target);link.directions.add(e.source===link.source?'forward':'backward');}
   else if(['coauthor','membership','topic-relation'].includes(e.kind)){for(const proof of e.evidence||[])link.signals.add(proof.paperID||[proof.sourcePaper,proof.targetPaper].sort().join('|'));}
   else if(e.kind==='author'){const names=(e.evidence||[]).map(x=>x?.authorKey).filter(Boolean);for(const name of names.length?names:[key])link.signals.add('author:'+name);}
   else link.signals.add(e.kind+':'+key);
  }
  const edges=[...combined.values()].map(e=>({...e,kinds:[...e.kinds].sort(),directions:[...e.directions],count:e.signals.size,kind:e.kinds.has('cites')?'cites':[...e.kinds][0]}));for(const e of edges)delete e.signals;
  edges.sort((a,b)=>Number(b.kinds.some(k=>['author','topic','similarity'].includes(k)))-Number(a.kinds.some(k=>['author','topic','similarity'].includes(k)))||b.count-a.count);if(!focused)index.overview=edges;return{nodes,edges,near,aggregate,hidden:model.nodes.length-nodes.length};
 }
 function communityScene(model,index,{selected='',focused=false,k=1,community=''}={}){
  if(!index.projections)index.projections=new Map();const key=community+'|'+(index.detail?.id||'');let projected=index.projections.get(key);
  if(!projected){
   const owner=new Map(),nodes=[],contextNodes=[],contextOwner=new Map(),byCommunity=new Map((model.communities||[]).map(g=>[g.id,g]));
   if(community){const group=byCommunity.get(community),ids=new Set(group?.members||[]);for(const n of model.nodes)if(ids.has(n.id)){nodes.push(n);owner.set(n.id,n.id);}}
   else for(const g of model.communities){const members=g.members.map(id=>index.byID.get(id)).filter(Boolean);if(!members.length)continue;if(members.length===1){nodes.push(members[0]);owner.set(members[0].id,members[0].id);continue;}
    const representative=(model.mode==='authors'&&members.find(n=>n.kind==='author'&&n.title===g.title))||[...members].filter(n=>n.kind!=='paper').sort((a,b)=>(b.members?.length||0)-(a.members?.length||0)||(b.degree||0)-(a.degree||0)||a.id.localeCompare(b.id))[0]||members[0];
    for(const n of [...members].sort((a,b)=>(b.degree||0)-(a.degree||0)||a.id.localeCompare(b.id)).slice(0,24)){if(contextNodes.length>=1200)break;contextNodes.push(n);contextOwner.set(n.id,g.id);}
    const node={id:g.id,kind:'community',title:model.mode==='topics'?(g.title||representative.title):representative.title,representative:representative.id,members:g.members,color:g.color,local:members.some(n=>n.local),x:g.x,y:g.y,degree:0};nodes.push(node);for(const n of members)owner.set(n.id,g.id);
   }
   const combined=new Map(),sourceEdges=index.detail?[...model.edges.filter(e=>e.source!==index.detail.id&&e.target!==index.detail.id),...index.detail.relations]:model.edges;
   for(const e of sourceEdges){const a=owner.get(e.source),b=owner.get(e.target);if(!a||!b||a===b)continue;const pair=[a,b].sort(),key=JSON.stringify(pair);if(!combined.has(key))combined.set(key,{source:pair[0],target:pair[1],kind:e.kind,kinds:new Set(),directions:[],signals:new Set()});const edge=combined.get(key);edge.kinds.add(e.kind);for(const proof of e.evidence||[])edge.signals.add(proof.paperID||JSON.stringify([proof.sourcePaper,proof.targetPaper].sort()));if(!e.evidence?.length)edge.signals.add(JSON.stringify([e.source,e.target].sort()));}
   const edges=[...combined.values()].map(e=>({...e,kinds:[...e.kinds],count:e.signals.size}));for(const e of edges)delete e.signals;edges.sort((a,b)=>b.count-a.count||a.source.localeCompare(b.source));
   const contextEdges=sourceEdges.filter(e=>contextOwner.has(e.source)&&contextOwner.get(e.source)===contextOwner.get(e.target)).slice(0,1800);projected={nodes,edges,owner,contextNodes,contextEdges,contextOwner,contextByID:new Map(contextNodes.map(n=>[n.id,n])),index:windowlessIndex(nodes,edges)};index.projections.set(key,projected);
  }
  const mappedSelected=projected.owner.get(selected)||selected,near=projected.index.adj.get(mappedSelected),nodes=focused&&near?projected.nodes.filter(n=>near.has(n.id)):projected.nodes,ids=focused&&near?new Set(nodes.map(n=>n.id)):null;
  return {...projected,nodes,edges:ids?projected.edges.filter(e=>ids.has(e.source)&&ids.has(e.target)):projected.edges,near,matches:[...new Set((model.matches||[]).map(id=>projected.owner.get(id)).filter(Boolean))],aggregate:!community,hidden:model.nodes.length-nodes.length};
 }
 function windowlessIndex(nodes,edges){return index({nodes,edges});}
 function detail(index,id,relations){
  const keys=new Set(relations.map(e=>JSON.stringify([e.source,e.target].sort()))),edges=(index.overview||[]).filter(e=>!keys.has(JSON.stringify([e.source,e.target].sort())));
  for(const e of relations)edges.push({...e,kinds:['coauthor'],directions:[],count:e.evidence.length});
  index.projections?.clear();index.detail={id,relations,edges,near:new Set([id,...relations.map(e=>e.target)])};
 }
 function emphasis(model,index,{selected='',hover=''}={}){
  const searching=!!model.searchActive,roots=new Set(searching?(model.matches||[]):[hover||selected].filter(Boolean));
  if(!searching&&!roots.size)return {roots,near:null,searching};const near=new Set(roots);if(searching&&model.searchGroups)return {roots,near,searching};for(const id of roots)for(const other of (index.detail?.id===id?index.detail.near:index.adj.get(id))||[])near.add(other);
  return {roots,near,searching};
 }
 // Screen-space feedback never alters scientific graph coordinates or layout.
 function nearest(nodes,point,camera,current='',radius=30){
  if(!point)return null;let best=null,distance=radius,held=null,heldDistance=Infinity;
  for(const n of nodes){const d=Math.hypot(point.x-(n.x*camera.k+camera.x),point.y-(n.y*camera.k+camera.y));if(n.id===current){held=n;heldDistance=d;}if(d<distance){distance=d;best=n;}}
  return held&&heldDistance<radius*1.4&&(!best||best.id===current||distance>heldDistance*.65)?held:best;
 }
 function magnetic(state,targets,dt=16,reduced=false){
  let pending=false;const step=clamp(dt,1,32)/1000;
  for(const [id,target] of targets)if(!state.has(id))state.set(id,{x:0,y:0,vx:0,vy:0});
  for(const [id,p] of state){const t=targets.get(id)||{x:0,y:0};if(reduced){p.x=p.y=p.vx=p.vy=0;state.delete(id);continue;}
   for(const axis of ['x','y']){const v='v'+axis;p[v]+=(190*(t[axis]-p[axis])-25*p[v])*step;p[axis]+=p[v]*step;}
   if(Math.abs(p.x-t.x)+Math.abs(p.y-t.y)+Math.abs(p.vx)+Math.abs(p.vy)<.06){p.x=t.x;p.y=t.y;p.vx=p.vy=0;if(!targets.has(id))state.delete(id);}else pending=true;
  }return pending;
 }
 function opacity(current,target,dt=16,reduced=false){const value=reduced?target:current+(target-current)*(1-Math.exp(-clamp(dt,1,40)/85));return Math.abs(value-target)<.004?target:value;}
 function lineWidth(count,active=false){return Math.min(3.2,.75+Math.log2(Math.max(1,count))*.55)+(active?.45:0);}
 function labels(candidates,width,height){
  const grid=new Map(),accepted=[],cell=48;
  const cells=r=>{const out=[];for(let x=Math.floor(r.x/cell);x<=Math.floor((r.x+r.w)/cell);x++)for(let y=Math.floor(r.y/cell);y<=Math.floor((r.y+r.h)/cell);y++)out.push(x+','+y);return out;};
  for(const c of candidates.sort((a,b)=>b.priority-a.priority||a.id.localeCompare(b.id))){
   const placements=[c.preferred||[0,0],[0,-c.rect.h-2*(c.r||5)-8],[c.rect.w/2+12,-12],[-c.rect.w/2-12,-12],[0,23],[0,-48],[0,46],[0,-71],[c.rect.w/2+12,20],[-c.rect.w/2-12,20]];
   for(const [dx,dy] of placements){const r={...c.rect,x:c.rect.x+dx,y:c.rect.y+dy};if(r.x<6||r.y<5||r.x+r.w>width-6||r.y+r.h>height-35)continue;const keys=cells(r),occupied=keys.flatMap(k=>grid.get(k)||[]);if(occupied.some(o=>r.x<o.x+o.w&&r.x+r.w>o.x&&r.y<o.y+o.h&&r.y+r.h>o.y))continue;accepted.push({...c,dx,dy});for(const key of keys){if(!grid.has(key))grid.set(key,[]);grid.get(key).push(r);}break;}
  }
  return accepted;
 }
 return{nearest,magnetic,opacity,wheel,zoom,step,index,scene,labels,lineWidth,nodeLabel,emphasis,detail};
})();
if(typeof module!=='undefined')module.exports=CiteLensNetworkView;
