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
 function scene(model,index,{selected='',focused=false,k=1,detail=false}={}){
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
  edges.sort((a,b)=>Number(b.kinds.some(k=>['author','topic','similarity'].includes(k)))-Number(a.kinds.some(k=>['author','topic','similarity'].includes(k)))||b.count-a.count);return{nodes,edges,near,aggregate,hidden:model.nodes.length-nodes.length};
 }
 function lineWidth(count,active=false){return Math.min(3.2,.75+Math.log2(Math.max(1,count))*.55)+(active?.45:0);}
 function labels(candidates,width,height){
  const grid=new Map(),accepted=[],cell=48;
  const cells=r=>{const out=[];for(let x=Math.floor(r.x/cell);x<=Math.floor((r.x+r.w)/cell);x++)for(let y=Math.floor(r.y/cell);y<=Math.floor((r.y+r.h)/cell);y++)out.push(x+','+y);return out;};
  for(const c of candidates.sort((a,b)=>b.priority-a.priority||a.id.localeCompare(b.id))){const r=c.rect;if(r.x<6||r.y<5||r.x+r.w>width-6||r.y+r.h>height-62)continue;const keys=cells(r),occupied=keys.flatMap(k=>grid.get(k)||[]);if(occupied.some(o=>r.x<o.x+o.w&&r.x+r.w>o.x&&r.y<o.y+o.h&&r.y+r.h>o.y))continue;accepted.push(c);for(const key of keys){if(!grid.has(key))grid.set(key,[]);grid.get(key).push(r);}}
  return accepted;
 }
 return{wheel,zoom,step,index,scene,labels,lineWidth,nodeLabel};
})();
if(typeof module!=='undefined')module.exports=CiteLensNetworkView;
