/* Expensive graph calculations are isolated from the Zotero UI thread. */
importScripts('core.js','citation-links.js','network-core.js','semantic-core.js','semantic-kernel.js','network-map.js');
let searchIndex=null;
onmessage=async event=>{
 const {action,payload}=event.data;
 try{
  if(action==='semantic-map'||(action==='layout'&&payload.mode==='topics'))importScripts('topic-lexicon.js');
  if(action==='cache-encode'){postMessage({result:{text:JSON.stringify(payload.value,(_,v)=>v instanceof Map?{__pnMap:[...v]}:v instanceof Set?{__pnSet:[...v]}:v)}});}
  else if(action==='cache-decode'){postMessage({result:{value:JSON.parse(payload.text,(_,v)=>v&&typeof v==='object'&&Object.keys(v).length===1&&Array.isArray(v.__pnMap)?new Map(v.__pnMap):v&&typeof v==='object'&&Object.keys(v).length===1&&Array.isArray(v.__pnSet)?new Set(v.__pnSet):v)}});}
  else if(action==='search-init'){searchIndex=CiteLensNetworkCore.searchIndex(payload);postMessage({ready:true});}
  else if(action==='author-neighborhood'){const graph=CiteLensNetworkCore.authorNeighborhood(searchIndex,payload.id,payload.depth,payload.limit);for(const n of graph.nodes){const angle=CiteLensNetworkMap.hash(n.id)%6283/1000;n.x=n.depth?Math.cos(angle)*(n.depth===1?150:300):0;n.y=n.depth?Math.sin(angle)*(n.depth===1?150:300):0;n.pinned=n.depth===0;}CiteLensNetworkMap.layout(graph);graph.communities=[];postMessage({request:payload.request,result:graph});}
  else if(action==='author-links'){postMessage({request:payload.request,result:CiteLensNetworkCore.authorConnections(searchIndex,payload.id)});}
  else if(action==='search-query'){postMessage({request:payload.request,result:CiteLensNetworkCore.queryIndex(searchIndex,payload.query)});}
  else if(action==='citations'){postMessage({result:CiteLensCitationLinks.occurrences(new Map(payload.pages),payload.refs,p=>postMessage({progress:p}))});}
  else if(action==='snapshot'){const merged=CiteLensNetworkCore.consolidate(payload.nodes,payload.sources);postMessage({result:{...CiteLensNetworkCore.build(merged.nodes,merged.sources),aliases:merged.aliases}});}
  else if(action==='prepare'){postMessage({result:CiteLensNetworkMap.build(payload)});}
  else if(action==='layout'){postMessage({result:CiteLensNetworkMap.layout(payload)});}
  else if(action==='semantic-map'){CiteLensSemanticCore.setKernel(await CiteLensSimilarityKernel.create());const graph=CiteLensNetworkMap.topics(payload.graph,payload.semantic,payload.previous,p=>postMessage({progress:p}));postMessage({result:CiteLensNetworkMap.layout(graph,p=>postMessage({progress:p}))});}
  else if(action==='map'){postMessage({progress:{phase:'authors',completed:0,total:1}});const graph=CiteLensNetworkMap.build(payload);postMessage({progress:{phase:'authors',completed:1,total:1}});postMessage({result:CiteLensNetworkMap.layout(graph,p=>postMessage({progress:p}))});}
  else throw Error('Unknown graph operation');
 }catch(error){postMessage({error:error.message||String(error)});}
};
