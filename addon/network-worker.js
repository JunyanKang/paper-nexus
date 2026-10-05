/* Expensive graph calculations are isolated from the Zotero UI thread. */
importScripts('core.js','network-core.js','network-map.js');
onmessage=event=>{
 const {action,payload}=event.data;
 try{
  if(action==='snapshot'){const merged=CiteLensNetworkCore.consolidate(payload.nodes,payload.sources);postMessage({result:{...CiteLensNetworkCore.build(merged.nodes,merged.sources),aliases:merged.aliases}});}
  else if(action==='map'){postMessage({progress:15});const graph=CiteLensNetworkMap.build(payload);postMessage({progress:35});postMessage({result:CiteLensNetworkMap.layout(graph,p=>postMessage({progress:p}))});}
  else throw Error('Unknown graph operation');
 }catch(error){postMessage({error:error.message||String(error)});}
};
