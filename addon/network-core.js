/* Local, explainable connections. Shared names are never asserted to be verified identities. */
var CiteLensNetworkCore=(()=>{
  const C=CiteLensCore;
  const id=(libraryID,key)=>libraryID+':'+key;
  function authorKey(a){
    if(a.fieldMode||!a.lastName||!a.firstName)return '';
    const given=C.clean(a.firstName);
    if(!/[\p{Ll}]{2}|[\p{Script=Han}]/u.test(given))return '';
    return C.norm(a.lastName)+'|'+C.norm(given);
  }
  function build(nodes,sources=[]){
    const byID=new Map(nodes.map(x=>[x.id,x])),byDOI=new Map(),byTitle=new Map(),authors=new Map(),edges=new Map();
    const add=(map,key,value)=>{if(!key)return;if(!map.has(key))map.set(key,[]);map.get(key).push(value);};
    for(const node of nodes){add(byDOI,C.recordDOI(node),node);add(byTitle,C.norm(node.title),node);for(const a of node.creators||[]){const key=authorKey(a);if(key)add(authors,key,{id:node.id,name:[a.firstName,a.lastName].join(' ')});}}
    const edge=(source,target,kind,evidence)=>{if(source===target||!byID.has(source)||!byID.has(target))return;const key=[source,target,kind].join('|');if(!edges.has(key))edges.set(key,{source,target,kind,evidence:[]});const e=edges.get(key);if(e.evidence.length<5)e.evidence.push(evidence);};
    for(const node of nodes)for(const key of node.relatedKeys||[]){const target=id(node.libraryID,key);if(node.id<target||!(byID.get(target)?.relatedKeys||[]).includes(node.key))edge(node.id,target,'related',{label:'Zotero 相关条目'});}
    let matched=0,unresolved=0,ambiguous=0,sourceCount=0;
    for(const source of sources){if(!byID.has(source.source))continue;sourceCount++;
      for(const ref of source.refs||[]){
        const doi=C.recordDOI(ref);let candidates=doi?(byDOI.get(doi)||[]):(byTitle.get(C.norm(ref.title))||[]).filter(x=>C.norm(ref.title).length>=20&&ref.year&&ref.author&&x.year===ref.year&&C.norm(x.creators?.[0]?.lastName)===C.norm(ref.author));
        const sameLibrary=candidates.filter(x=>x.libraryID===byID.get(source.source).libraryID);if(sameLibrary.length)candidates=sameLibrary;
        candidates=candidates.filter(x=>x.id!==source.source);
        if(candidates.length===1){matched++;edge(source.source,candidates[0].id,'cites',{raw:ref.raw||C.citation(ref),attachmentID:source.attachmentID,attachmentKey:source.attachmentKey,pageIndex:ref.position?.pageIndex,method:doi?'DOI 一致':'题名、年份与首位作者一致'});}
        else if(candidates.length>1)ambiguous++;else unresolved++;
      }
    }
    const adjacency=new Map();for(const e of edges.values()){add(adjacency,e.source,e);add(adjacency,e.target,e);}
    return {nodes,byID,authors,edges:[...edges.values()],adjacency,coverage:{sources:sourceCount,matched,unresolved,ambiguous}};
  }
  function neighbors(graph,selected,{scope=null,kinds=['cites','related','author']}={}){
    if(!graph.byID.has(selected))return [];
    const output=new Map(),allow=new Set(kinds),permitted=scope?new Set(scope):null;
    const add=(target,kind,evidence,direction)=>{if(target===selected||permitted&&!permitted.has(target))return;if(!output.has(target))output.set(target,{node:graph.byID.get(target),relations:[]});const row=output.get(target);if(!row.relations.some(x=>x.kind===kind&&x.direction===direction&&x.authorKey===evidence.authorKey))row.relations.push({kind,direction,...evidence});};
    for(const e of graph.adjacency.get(selected)||[])if(allow.has(e.kind)){const outgoing=e.source===selected;add(outgoing?e.target:e.source,e.kind,{evidence:e.evidence},e.kind==='cites'?(outgoing?'out':'in'):'both');}
    if(allow.has('author'))for(const author of graph.byID.get(selected).creators||[]){const key=authorKey(author);if(key)for(const match of graph.authors.get(key)||[])add(match.id,'author',{authorKey:key,name:match.name},'both');}
    const weight=row=>row.relations.reduce((n,r)=>n+(r.kind==='cites'?100:r.kind==='related'?50:1),0);
    return [...output.values()].sort((a,b)=>weight(b)-weight(a)||String(b.node.year).localeCompare(String(a.node.year))||a.node.title.localeCompare(b.node.title));
  }
  function search(nodes,query){const words=C.norm(query).split(' ').filter(Boolean);return nodes.filter(node=>{const text=C.norm([node.title,node.journal,node.year,node.DOI,...(node.creators||[]).map(a=>a.firstName+' '+a.lastName)].join(' '));return words.every(w=>text.includes(w));});}
  return {id,authorKey,build,neighbors,search};
})();
if(typeof module!=='undefined')module.exports=CiteLensNetworkCore;
