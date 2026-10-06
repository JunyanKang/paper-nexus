/* Expensive graph calculations are isolated from the Zotero UI thread. */
importScripts('core.js','citation-links.js','network-core.js','semantic-core.js','network-map.js');
onmessage=event=>{
 const {action,payload}=event.data;
 try{
  if(action==='citations'){postMessage({result:CiteLensCitationLinks.occurrences(new Map(payload.pages),payload.refs,p=>postMessage({progress:p}))});}
  else if(action==='snapshot'){const merged=CiteLensNetworkCore.consolidate(payload.nodes,payload.sources);postMessage({result:{...CiteLensNetworkCore.build(merged.nodes,merged.sources),aliases:merged.aliases}});}
  else if(action==='prepare'){postMessage({result:CiteLensNetworkMap.build(payload)});}
  else if(action==='layout'){postMessage({result:CiteLensNetworkMap.layout(payload)});}
  else if(action==='semantic-map'){const graph=CiteLensNetworkMap.topics(payload.graph,payload.semantic,payload.previous,p=>postMessage({progress:p}));postMessage({result:CiteLensNetworkMap.layout(graph,p=>postMessage({progress:p}))});}
  else if(action==='map'){postMessage({progress:15});const graph=CiteLensNetworkMap.build(payload);postMessage({progress:35});postMessage({result:CiteLensNetworkMap.layout(graph,p=>postMessage({progress:p}))});}
  else throw Error('Unknown graph operation');
 }catch(error){postMessage({error:error.message||String(error)});}
};
