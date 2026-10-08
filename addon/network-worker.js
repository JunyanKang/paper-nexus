/* Expensive author-graph and citation calculations stay off the Zotero UI thread. */
importScripts('core.js','citation-links.js','network-core.js','network-map.js','network-view.js');
let searchIndex=null;
onmessage=event=>{
 const {action,payload}=event.data;
 try{
  if(action==='cache-encode')postMessage({result:{text:JSON.stringify(payload.value,(_,value)=>value instanceof Map?{__pnMap:[...value]}:value instanceof Set?{__pnSet:[...value]}:value)}});
  else if(action==='cache-decode')postMessage({result:{value:JSON.parse(payload.text,(_,value)=>value&&typeof value==='object'&&Object.keys(value).length===1&&Array.isArray(value.__pnMap)?new Map(value.__pnMap):value&&typeof value==='object'&&Object.keys(value).length===1&&Array.isArray(value.__pnSet)?new Set(value.__pnSet):value)}});
  else if(action==='expand'){
   const graph=payload.graph;graph.openEntities=payload.openEntities;graph.selected=payload.selected;graph.positions=payload.positions?.length?payload.positions:graph.nodes.map(n=>({id:n.id,x:n.x,y:n.y,pinned:n.pinned}));CiteLensNetworkMap.expandMembers(graph);
   const byID=new Map(graph.nodes.map(n=>[n.id,n]));for(const id of graph.openEntities){const parent=byID.get(id);if(!parent)continue;const members=graph.nodes.filter(n=>n.group===id),community=graph.communities.find(g=>g.id===parent.community);members.forEach((n,i)=>{const angle=i*Math.PI*(3-Math.sqrt(5)),radius=65+Math.sqrt(i)*38,previous=graph.positions.find(p=>p.id===n.id);n.x=previous?.x??parent.x+Math.cos(angle)*radius;n.y=previous?.y??parent.y+Math.sin(angle)*radius;n.community=parent.community;if(community&&!community.members.includes(n.id))community.members.push(n.id);});}
   postMessage({result:graph});
  }else if(action==='presentation'){const graph=payload.graph,index=CiteLensNetworkView.index(graph);CiteLensNetworkView.scene(graph,index);postMessage({result:{graph,index}});}
  else if(action==='search-init'){searchIndex=CiteLensNetworkCore.searchIndex(payload);postMessage({ready:true});}
  else if(action==='author-neighborhood'){const graph=CiteLensNetworkCore.authorNeighborhood(searchIndex,payload.id,payload.depth,payload.limit);for(const n of graph.nodes){const angle=CiteLensNetworkMap.hash(n.id)%6283/1000;n.x=n.depth?Math.cos(angle)*(n.depth===1?150:300):0;n.y=n.depth?Math.sin(angle)*(n.depth===1?150:300):0;n.pinned=n.depth===0;}CiteLensNetworkMap.layout(graph);graph.communities=[];postMessage({request:payload.request,result:graph});}
  else if(action==='author-links')postMessage({request:payload.request,result:CiteLensNetworkCore.authorConnections(searchIndex,payload.id)});
  else if(action==='search-query')postMessage({request:payload.request,result:CiteLensNetworkCore.queryIndex(searchIndex,payload.query)});
  else if(action==='bibliography'){importScripts('bibliography.js');postMessage({result:CiteLensBibliography.parse(payload.pages,payload.headers)});}
  else if(action==='citations')postMessage({result:CiteLensCitationLinks.occurrences(new Map(payload.pages),payload.refs,p=>postMessage({progress:p}))});
  else if(action==='snapshot'){const merged=CiteLensNetworkCore.consolidate(payload.nodes,payload.sources);postMessage({result:{...CiteLensNetworkCore.build(merged.nodes,merged.sources),aliases:merged.aliases}});}
  else if(action==='map'){if(payload.mode!=='authors')throw Error('主题网络正在开发中');postMessage({progress:{phase:'authors',completed:0,total:1}});const graph=CiteLensNetworkMap.build(payload);postMessage({progress:{phase:'authors',completed:1,total:1}});postMessage({result:CiteLensNetworkMap.layout(graph,p=>postMessage({progress:p}))});}
  else throw Error('Unknown graph operation');
 }catch(error){postMessage({error:error.message||String(error)});}
};
