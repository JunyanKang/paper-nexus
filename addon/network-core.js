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
    let matched=0,unresolved=0,ambiguous=0,sourceCount=0;const references=new Map();
    for(const source of sources){if(!byID.has(source.source))continue;sourceCount++;if(!references.has(source.source))references.set(source.source,[]);
      for(const ref of source.refs||[]){
        const doi=C.recordDOI(ref);let candidates=doi?(byDOI.get(doi)||[]):(byTitle.get(C.norm(ref.title))||[]).filter(x=>C.norm(ref.title).length>=20&&ref.year&&ref.author&&x.year===ref.year&&C.norm(x.creators?.[0]?.lastName)===C.norm(ref.author));
        const sameLibrary=candidates.filter(x=>x.libraryID===byID.get(source.source).libraryID);if(sameLibrary.length)candidates=sameLibrary;
        candidates=candidates.filter(x=>x.id!==source.source);
        const evidence={raw:ref.raw||C.citation(ref),attachmentID:source.attachmentID,attachmentKey:source.attachmentKey,pageIndex:ref.position?.pageIndex};references.get(source.source).push({ref,evidence,status:candidates.length===1?'matched':candidates.length?'ambiguous':'missing',target:candidates.length===1?candidates[0].id:null});
        if(candidates.length===1){matched++;edge(source.source,candidates[0].id,'cites',{raw:ref.raw||C.citation(ref),attachmentID:source.attachmentID,attachmentKey:source.attachmentKey,pageIndex:ref.position?.pageIndex,method:doi?'DOI 一致':'题名、年份与首位作者一致'});}
        else if(candidates.length>1)ambiguous++;else unresolved++;
      }
    }
    const adjacency=new Map();for(const e of edges.values()){add(adjacency,e.source,e);add(adjacency,e.target,e);}
    return {nodes,byID,authors,references,edges:[...edges.values()],adjacency,coverage:{sources:sourceCount,matched,unresolved,ambiguous}};
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
  // Display consolidation never mutates Zotero. Conflicting metadata remains separate.
  function consolidate(nodes,sources=[]){
    const groups=new Map(),aliases=new Map(),buckets=new Map();
    const ordered=[...nodes].sort((a,b)=>Number(!!C.recordDOI(b))-Number(!!C.recordDOI(a))||Number(!!b.creators?.length)-Number(!!a.creators?.length)||a.id.localeCompare(b.id));
    for(const n of ordered){const doi=C.recordDOI(n),title=C.norm(n.title),author=C.norm(n.creators?.[0]?.lastName||'');
      const base=title.length>=20&&n.year?`${n.libraryID}|${title}|${n.year}`:n.id;
      const candidates=(buckets.get(base)||[]).filter(g=>(!doi||!C.recordDOI(g)||doi===C.recordDOI(g))&&(!author||!g.creators.length||author===C.norm(g.creators[0].lastName)));
      let g=candidates.length===1?candidates[0]:null;
      if(!g){g={...n,_base:base,creators:[...(n.creators||[])],collections:[],attachments:[],copies:[],relatedKeys:[]};groups.set(n.id,g);if(!buckets.has(base))buckets.set(base,[]);buckets.get(base).push(g);}
      if(!g.creators.length&&n.creators?.length)g.creators=n.creators;
      g.copies.push(n);g.collections.push(...(n.collections||[]));g.attachments.push(...(n.attachments||[]));g.relatedKeys.push(...(n.relatedKeys||[]));if(!g.abstract&&n.abstract)g.abstract=n.abstract;aliases.set(n.id,g.id);
    }
    const result=[...groups.values()].sort((a,b)=>String(b.year).localeCompare(String(a.year))||a.title.localeCompare(b.title));for(const n of result){n.collections=[...new Set(n.collections)];n.attachments=[...new Map(n.attachments.map(a=>[a.id,a])).values()];n.relatedKeys=[...new Set(n.relatedKeys.map(k=>(aliases.get(id(n.libraryID,k))||id(n.libraryID,k)).split(':').slice(1).join(':')))];}
    return {nodes:result,sources:sources.map(s=>({...s,source:aliases.get(s.source)||s.source})),aliases};
  }
  function referenceKey(r){const doi=C.recordDOI(r);if(doi)return 'doi:'+doi;const title=C.norm(r.title);return title.length>=20&&r.year&&r.author?'title:'+title+'|'+r.year+'|'+C.norm(r.author):'';}
  function workspace(graph,selected,scope=graph.nodes.map(n=>n.id)){
    const permitted=new Set(scope),all=neighbors(graph,selected,{scope,kinds:['cites','related','author']}),unique=new Map();
    for(const r of graph.references?.get(selected)||[]){const k=referenceKey(r.ref)||C.norm(r.ref.raw||r.ref.title);if(k&&!unique.has(k))unique.set(k,r);}
    const own=new Set([...unique.values()].map(x=>referenceKey(x.ref)).filter(Boolean)),shared=[];
    for(const [source,refs] of graph.references||[]){if(source===selected||!permitted.has(source))continue;const overlap=new Map();for(const r of refs){const key=referenceKey(r.ref);if(key&&own.has(key))overlap.set(key,r);}if(overlap.size)shared.push({node:graph.byID.get(source),shared:[...overlap.values()]});}
    shared.sort((a,b)=>b.shared.length-a.shared.length||String(b.node.year).localeCompare(String(a.node.year)));
    return {references:[...unique.values()],incoming:all.filter(x=>x.relations.some(r=>r.kind==='cites'&&r.direction==='in')),shared,authors:all.filter(x=>x.relations.some(r=>r.kind==='author')),related:all.filter(x=>x.relations.some(r=>r.kind==='related'))};
  }
  // Deterministic local TF-IDF. Content similarity is not agreement or scientific evidence.
  const stop=new Set(('the and for with from into this that these those using use used study studies results conclusion conclusions background methods abstract review analysis effects effect based role new approach during between through their were was are has have had not but also more than can its our we a an of in on to by as at is it be or which show shows paper research human patients group significant respectively').split(' '));
  function terms(text){const words=C.plainTitle(text).toLowerCase().match(/[a-z][a-z0-9-]{2,}|[\p{Script=Han}]+/gu)||[],out=[];for(let w of words){if(/[\p{Script=Han}]/u.test(w)){for(let i=0;i<w.length-1;i++){const t=w.slice(i,i+2);if(!['研究','结果','方法','目的','结论','分析','我们','以及','中的','通过'].includes(t))out.push(t);}}else{if(!stop.has(w)&&w.length>2)out.push(w);}}return out;}
  function topics(nodes){
    const docs=[],df=new Map();for(const n of nodes){const tokens=[...terms(n.title),...terms(n.title),...terms(n.abstract||'')],tf=new Map();for(const t of tokens)tf.set(t,(tf.get(t)||0)+1);for(const t of tf.keys())df.set(t,(df.get(t)||0)+1);docs.push({node:n,tf});}
    for(const d of docs){d.vector=new Map();let norm=0;for(const [t,f] of d.tf){const w=(1+Math.log(f))*(1+Math.log((1+nodes.length)/(1+df.get(t))));d.vector.set(t,w);norm+=w*w;}for(const [t,w] of d.vector)d.vector.set(t,w/Math.sqrt(norm||1));}
    const groups=[],index=new Map();for(const d of docs){const candidates=new Set();for(const t of d.vector.keys())for(const g of index.get(t)||[])candidates.add(g);let best=null,score=.22;for(const g of candidates){let dot=0;for(const [t,w] of d.vector)dot+=w*(g.seed.vector.get(t)||0);if(dot>score){score=dot;best=g;}}if(best)best.docs.push(d);else{const g={seed:d,docs:[d]};groups.push(g);for(const t of d.vector.keys()){if(!index.has(t))index.set(t,[]);index.get(t).push(g);}}}
    return groups.filter(g=>g.docs.length>1).map(g=>{const weights=new Map();for(const d of g.docs)for(const [t,w] of d.vector)weights.set(t,(weights.get(t)||0)+w);const keywords=[...weights].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).slice(0,3).map(x=>x[0]);return {id:g.seed.node.id,keywords,nodes:g.docs.map(x=>x.node),abstracts:g.docs.filter(x=>!!x.node.abstract).length};}).sort((a,b)=>b.nodes.length-a.nodes.length);
  }
  return {id,authorKey,build,neighbors,search,consolidate,workspace,topics};
})();
if(typeof module!=='undefined')module.exports=CiteLensNetworkCore;
