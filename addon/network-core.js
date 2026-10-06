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
  function orcid(value){
    const raw=String(value||'').trim().replace(/^https?:\/\/(?:www\.)?orcid\.org\//i,'').replace(/-/g,'').toUpperCase();
    if(!/^\d{15}[\dX]$/.test(raw))return '';
    let sum=0;for(const digit of raw.slice(0,15))sum=(sum+Number(digit))*2;const check=(12-sum%11)%11;
    return raw.at(-1)===(check===10?'X':String(check))?raw.match(/.{4}/g).join('-'):'';
  }
  // Bounded same-name evidence blocks; these are conservative local hypotheses,
  // not a substitute for an authoritative author registry (see docs/RESEARCH.md).
  function authorIdentities(papers){
    const blocks=new Map(),contexts=new Map(),assignments=new Map(),metrics={blocks:0,comparisons:0,splitNames:0,orcidRecords:0,capped:0};
    const normalizedName=a=>authorKey(a),put=(map,key,row)=>{if(!map.has(key))map.set(key,[]);map.get(key).push(row);};
    for(const paper of papers){const names=new Set((paper.creators||[]).map(normalizedName).filter(Boolean));contexts.set(paper.id,{paper,names,words:null});
      (paper.creators||[]).forEach((a,position)=>{const oid=orcid(a.ORCID||a.orcid),name=normalizedName(a);if(!name&&!oid)return;
        const signature=JSON.stringify([paper.id,position]),affiliations=(Array.isArray(a.affiliations)?a.affiliations:[a.affiliation]).filter(x=>typeof x==='string').map(C.norm).filter(x=>x.length>=12);
        const row={signature,paperID:paper.id,name:name||'orcid:'+oid,oid,affiliations,title:C.clean([a.firstName,a.lastName].filter(Boolean).join(' '))};put(blocks,row.name,row);if(oid)metrics.orcidRecords++;
      });
    }
    const evidence=(a,b)=>{const ca=contexts.get(a.paperID),cb=contexts.get(b.paperID);if(a.paperID===b.paperID)return false;
      if(a.oid&&b.oid)return a.oid===b.oid;
      if(!ca.words)ca.words=new Set(terms(C.researchTitle(ca.paper)+' '+String(ca.paper.abstract||'').slice(0,1200)));
      if(!cb.words)cb.words=new Set(terms(C.researchTitle(cb.paper)+' '+String(cb.paper.abstract||'').slice(0,1200)));
      let shared=0;if(ca.names.size<=64&&cb.names.size<=64)for(const name of ca.names)if(name!==a.name&&cb.names.has(name))shared++;
      let overlap=0;for(const word of ca.words)if(cb.words.has(word))overlap++;const similarity=overlap/Math.max(1,Math.min(ca.words.size,cb.words.size));
      const affiliation=a.affiliations.some(x=>b.affiliations.includes(x));return shared>=2||shared>=1&&similarity>=.18||affiliation&&similarity>=.3;
    };
    for(const [name,raw] of blocks){metrics.blocks++;if(raw.length===1){const row=raw[0];assignments.set(row.signature,{id:row.oid?'author:orcid:'+row.oid:'author:'+name,title:row.title,identity:row.oid?'orcid':'name',orcid:row.oid||'',nameKey:name,disambiguated:false});continue;}const rows=raw.sort((a,b)=>a.signature.localeCompare(b.signature)),parent=rows.map((_,i)=>i),ids=rows.map(r=>r.oid),root=i=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;};
      const join=(a,b)=>{a=root(a);b=root(b);if(a===b)return;if(ids[a]&&ids[b]&&ids[a]!==ids[b])return;const keep=Math.min(a,b),drop=Math.max(a,b);parent[drop]=keep;ids[keep]=ids[a]||ids[b];};
      const byORCID=new Map(),postings=new Map();rows.forEach((r,i)=>{if(r.oid){if(byORCID.has(r.oid))join(i,byORCID.get(r.oid));else byORCID.set(r.oid,i);}const context=contexts.get(r.paperID);
        if(context.names.size<=64)for(const coauthor of context.names)if(coauthor!==name)put(postings,'c:'+coauthor,i);
        for(const affiliation of r.affiliations)put(postings,'a:'+affiliation,i);
      });
      const candidates=rows.map(()=>new Set());for(const posting of postings.values())for(let i=0;i<posting.length;i++)for(let j=i+1;j<Math.min(posting.length,i+17);j++){
        const a=posting[i],b=posting[j];if(candidates[a].size<64&&candidates[b].size<64){candidates[a].add(b);candidates[b].add(a);}else metrics.capped++;
      }
      for(let i=0;i<rows.length;i++)for(const j of candidates[i])if(j>i){metrics.comparisons++;if(evidence(rows[i],rows[j]))join(i,j);}
      const components=new Map();rows.forEach((r,i)=>put(components,root(i),r));
      const supported=[...components.values()].filter(g=>g.length>=2),split=byORCID.size>1||supported.length>=2;
      if(split)metrics.splitNames++;
      for(const [key,group] of components){const oid=ids[root(key)];for(const row of group){
        // An unanchored signature cannot bridge two different verified ORCIDs.
        const identity=oid?'orcid':split?(group.length>=2?'coauthor-evidence':'unresolved'):'name';
        const id=oid?'author:orcid:'+oid:split||byORCID.size?'author:'+name+'#'+encodeURIComponent(group[0].signature):'author:'+name;
        assignments.set(row.signature,{id,title:row.title,identity,orcid:oid||'',nameKey:name,disambiguated:split});
      }}
    }
    return {assignments,metrics};
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
  function searchIndex({nodes,papers=[],mode}){
    const entities=nodes.filter(n=>n.kind!=='paper'),owners=new Map();for(const n of entities)for(const id of n.members||[]){if(!owners.has(id))owners.set(id,[]);owners.get(id).push(n.id);}
    const entries=[...entities,...(papers.length?papers:nodes.filter(n=>n.kind==='paper'))].map(n=>({id:n.id,title:n.title,year:n.kind==='author'||n.kind==='topic'?'':n.year,kind:n.kind||'paper',text:C.norm([n.title,n.abstract,n.journal,n.DOI,...(n.creators||[]).map(a=>a.firstName+' '+a.lastName)].join(' '))}));
    return {entries,owners,entities:new Map(entities.map(n=>[n.id,n])),mode,visible:new Set(nodes.map(n=>n.id))};
  }
  function authorConnections(index,id){
    const node=index.entities.get(id);if(node?.kind!=='author')return [];
    const pairs=new Map();for(const paperID of node.members||[])for(const target of index.owners.get(paperID)||[]){if(target===id)continue;if(!pairs.has(target))pairs.set(target,{source:id,target,kind:'coauthor',evidence:[]});pairs.get(target).evidence.push({paperID});}
    return [...pairs.values()].sort((a,b)=>b.evidence.length-a.evidence.length||a.target.localeCompare(b.target));
  }
  function authorNeighborhood(index,id,depth=1,limit=600){
    const direct=authorConnections(index,id),selected=new Set([id,...direct.slice(0,limit-1).map(e=>e.target)]),first=new Set(selected),rows=[...direct],scores=new Map();
    if(depth===2)for(const author of [...first].filter(x=>x!==id))for(const edge of authorConnections(index,author)){rows.push(edge);if(!first.has(edge.target))scores.set(edge.target,(scores.get(edge.target)||0)+edge.evidence.length);}
    for(const [other] of [...scores].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).slice(0,Math.max(0,limit-selected.size)))selected.add(other);
    const pairs=new Map();for(const edge of rows){if(!selected.has(edge.source)||!selected.has(edge.target))continue;const pair=[edge.source,edge.target].sort(),key=JSON.stringify(pair);if(!pairs.has(key))pairs.set(key,{...edge,source:pair[0],target:pair[1],strength:edge.evidence.length});}
    const nodes=[...selected].map(id=>index.entities.get(id)).filter(Boolean).map(n=>({...n,depth:n.id===id?0:first.has(n.id)?1:2}));
    return {mode:'authors',selected:id,nodes,edges:[...pairs.values()],groups:[],stats:{authors:nodes.length,available:1+direct.length+scores.size},depth};
  }
  function queryIndex(index,query){
    const words=C.norm(query).split(' ').filter(Boolean);if(!words.length)return {matches:[],results:[]};
    const found=index.entries.filter(n=>words.every(w=>n.text.includes(w))),entities=found.filter(n=>n.kind!=='paper'),papers=found.filter(n=>n.kind==='paper'),matches=new Set(entities.map(n=>n.id));
    if(index.mode!=='authors'||!entities.length)for(const paper of papers){if(index.visible.has(paper.id))matches.add(paper.id);for(const id of index.owners.get(paper.id)||[])matches.add(id);}
    return {matches:[...matches],results:[...entities,...papers].slice(0,8).map(({text,...n})=>n)};
  }
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
  function terms(text){const words=C.plainTitle(text).normalize('NFC').toLowerCase().match(/[\p{Script=Han}]+|[\p{Script=Latin}][\p{Script=Latin}\p{M}0-9-]{2,}/gu)||[],out=[];for(let w of words){if(/[\p{Script=Han}]/u.test(w)){for(let i=0;i<w.length-1;i++){const t=w.slice(i,i+2);if(!['研究','结果','方法','目的','结论','分析','我们','以及','中的','通过'].includes(t))out.push(t);}}else{if(!stop.has(w)&&w.length>2)out.push(w);}}return out;}
  // Weighted modularity local moves, followed by connected-component refinement.
  // Layout communities are navigation aids; they never add a citation relation.
  function communities(ids,edges,resolution=1.15){
    const ordered=[...ids].sort(),adj=new Map(ordered.map(id=>[id,new Map()]));
    for(const e of edges){if(e.source===e.target||!adj.has(e.source)||!adj.has(e.target))continue;const w=Number(e.weight)||1;if(w<=0)continue;for(const [a,b] of [[e.source,e.target],[e.target,e.source]])adj.get(a).set(b,(adj.get(a).get(b)||0)+w);}
    const degree=new Map(ordered.map(id=>[id,[...adj.get(id).values()].reduce((a,b)=>a+b,0)])),total=[...degree.values()].reduce((a,b)=>a+b,0),labels=new Map(ordered.map(id=>[id,id])),volume=new Map(degree);
    if(total)for(let pass=0;pass<24;pass++){let moves=0;for(const id of ordered){const k=degree.get(id);if(!k)continue;const previous=labels.get(id),weights=new Map();for(const [other,w] of adj.get(id)){const c=labels.get(other);weights.set(c,(weights.get(c)||0)+w);}volume.set(previous,volume.get(previous)-k);const score=c=>(weights.get(c)||0)-resolution*k*(volume.get(c)||0)/total;let best=previous,gain=score(previous);for(const c of [...weights.keys()].sort()){const value=score(c);if(value>gain+1e-9){best=c;gain=value;}}labels.set(id,best);volume.set(best,(volume.get(best)||0)+k);if(best!==previous)moves++;}if(!moves)break;}
    const seen=new Set(),groups=[];for(const id of ordered){if(seen.has(id))continue;const members=[],queue=[id];seen.add(id);for(let i=0;i<queue.length;i++){const current=queue[i];members.push(current);for(const other of adj.get(current).keys())if(!seen.has(other)&&labels.get(other)===labels.get(id)){seen.add(other);queue.push(other);}}groups.push(members.sort());}return groups.sort((a,b)=>b.length-a.length||a[0].localeCompare(b[0]));
  }
  function topics(nodes){
    const docs=[],df=new Map();for(const n of [...nodes].sort((a,b)=>a.id.localeCompare(b.id))){const tokens=[...terms(n.title),...terms(n.title),...terms(n.abstract||'')],tf=new Map();for(const t of tokens)tf.set(t,(tf.get(t)||0)+1);for(const t of tf.keys())df.set(t,(df.get(t)||0)+1);docs.push({node:n,tf});}
    const index=new Map();for(const d of docs){d.vector=new Map();let norm=0;for(const [t,f] of d.tf){const w=(1+Math.log(f))*(1+Math.log((1+nodes.length)/(1+df.get(t))));d.vector.set(t,w);norm+=w*w;}for(const [t,w] of d.vector){d.vector.set(t,w/Math.sqrt(norm||1));if(!index.has(t))index.set(t,[]);index.get(t).push(d);}}
    // A sparse nearest-neighbour graph avoids attaching every document to the
    // first broad review. High-frequency terms have bounded candidate lists.
    const links=new Map();for(const d of docs){const candidates=new Set(),features=[...d.vector].sort((a,b)=>b[1]-a[1]).slice(0,32);for(const [t] of features){const list=index.get(t),stride=Math.max(1,Math.ceil(list.length/256));for(let i=0;i<list.length;i+=stride)candidates.add(list[i]);}const ranked=[];for(const other of candidates){if(other===d)continue;let dot=0;for(const [t,w] of d.vector)dot+=w*(other.vector.get(t)||0);if(dot>=.24)ranked.push({other,dot});}ranked.sort((a,b)=>b.dot-a.dot||a.other.node.id.localeCompare(b.other.node.id));for(const {other,dot} of ranked.slice(0,8)){const pair=[d.node.id,other.node.id].sort(),key=JSON.stringify(pair);links.set(key,{source:pair[0],target:pair[1],weight:dot*dot});}}
    const byID=new Map(docs.map(d=>[d.node.id,d]));return communities(docs.map(d=>d.node.id),[...links.values()],1.1).filter(g=>g.length>1).map(ids=>{const members=ids.map(id=>byID.get(id)),weights=new Map();for(const d of members)for(const [t,w] of d.vector)weights.set(t,(weights.get(t)||0)+w);const keywords=[...weights].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).slice(0,3).map(x=>x[0]);return {id:ids[0],keywords,nodes:members.map(d=>d.node),abstracts:members.filter(d=>!!d.node.abstract).length,links:[...links.values()].filter(e=>ids.includes(e.source)||ids.includes(e.target))};});
  }
  return {id,authorKey,orcid,authorIdentities,build,neighbors,search,consolidate,workspace,topics,communities,terms,searchIndex,queryIndex,authorConnections,authorNeighborhood};
})();
if(typeof module!=='undefined')module.exports=CiteLensNetworkCore;
