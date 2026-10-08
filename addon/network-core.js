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
  function enrichCreators(creators,evidence){
    const compatible=(a,b)=>{if(a.fieldMode||b.fieldMode||!a.firstName||!b.firstName||C.norm(a.lastName)!==C.norm(b.lastName))return false;const x=C.norm(a.firstName).split(' '),y=C.norm(b.firstName).split(' ');return x.every((part,i)=>!y[i]||part===y[i]||part[0]===y[i][0]&&(part.length===1||y[i].length===1))&&y.every((part,i)=>!x[i]||part===x[i]||part[0]===x[i][0]&&(part.length===1||x[i].length===1));};
    return creators.map(a=>{const matches=evidence.filter(b=>compatible(a,b));if(matches.length!==1||creators.filter(b=>compatible(b,matches[0])).length!==1)return {...a};const b=matches[0],own=orcid(a.ORCID||a.orcid),remote=orcid(b.ORCID||b.orcid);if(own&&remote&&own!==remote)return {...a};
      return {...a,...(C.clean(b.firstName).length>C.clean(a.firstName).length?{firstName:b.firstName}:{}),...(remote?{ORCID:remote}:{}),affiliations:[...new Set([...(a.affiliations||[]),a.affiliation,...(b.affiliations||[]),b.affiliation].filter(x=>typeof x==='string'&&x.trim()))]};
    });
  }
  // Bounded same-name evidence blocks; these are conservative local hypotheses,
  // not a substitute for an authoritative author registry.
  function authorIdentities(papers){
    const blocks=new Map(),contexts=new Map(),knownNames=new Map(),assignments=new Map(),metrics={blocks:0,comparisons:0,splitNames:0,orcidRecords:0,capped:0,resolvedByEvidence:0,ambiguousSignatures:0};
    const normalizedName=a=>authorKey(a),put=(map,key,row)=>{if(!map.has(key))map.set(key,[]);map.get(key).push(row);};
    for(const paper of papers){const names=new Set((paper.creators||[]).map(normalizedName).filter(Boolean));contexts.set(paper.id,{paper,names,oids:new Set((paper.creators||[]).map(a=>orcid(a.ORCID||a.orcid)).filter(Boolean)),words:null});
      (paper.creators||[]).forEach((a,position)=>{const oid=orcid(a.ORCID||a.orcid),name=normalizedName(a);if(!name&&!oid)return;
        const signature=JSON.stringify([paper.id,position]),affiliations=(Array.isArray(a.affiliations)?a.affiliations:[a.affiliation]).filter(x=>typeof x==='string').map(C.norm).filter(x=>x.length>=12);
        const email=String(a.email||'').trim().toLowerCase(),row={signature,paperID:paper.id,name:name||'orcid:'+oid,oid,affiliations,email:/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)?email:'',title:C.clean([a.firstName,a.lastName].filter(Boolean).join(' '))};put(blocks,row.name,row);if(oid){metrics.orcidRecords++;if(!knownNames.has(row.name))knownNames.set(row.name,new Set());knownNames.get(row.name).add(oid);}
      });
    }
    const evidence=(a,b)=>{const ca=contexts.get(a.paperID),cb=contexts.get(b.paperID);if(a.paperID===b.paperID)return 0;
      if(a.oid&&b.oid)return a.oid===b.oid?100:0;
      if(!ca.words)ca.words=new Set(terms(C.researchTitle(ca.paper)+' '+String(ca.paper.abstract||'').slice(0,1200)));
      if(!cb.words)cb.words=new Set(terms(C.researchTitle(cb.paper)+' '+String(cb.paper.abstract||'').slice(0,1200)));
      let shared=0;if(ca.names.size<=64&&cb.names.size<=64)for(const name of ca.names)if(name!==a.name&&cb.names.has(name)&&(knownNames.get(name)?.size||0)<=1)shared++;
      let overlap=0;for(const word of ca.words)if(cb.words.has(word))overlap++;const similarity=overlap/Math.max(1,Math.min(ca.words.size,cb.words.size));
      let verifiedShared=0;for(const oid of ca.oids)if(oid!==a.oid&&oid!==b.oid&&cb.oids.has(oid))verifiedShared++;
      const affiliation=a.affiliations.some(x=>b.affiliations.includes(x)),email=!!a.email&&a.email===b.email;
      if(!email&&!(verifiedShared>=1&&similarity>=.18||shared>=2||shared>=1&&similarity>=.18||affiliation&&similarity>=.3))return 0;
      // Content can corroborate a team or institution, but cannot identify a person alone.
      return Number(email)*20+Number(affiliation)*5+Math.min(verifiedShared,3)*3+Math.min(shared,6)*2+Math.min(similarity,1);
    };
    for(const [name,raw] of blocks){metrics.blocks++;if(raw.length===1){const row=raw[0];assignments.set(row.signature,{id:row.oid?'author:orcid:'+row.oid:'author:'+name,title:row.title,identity:row.oid?'orcid':'name',orcid:row.oid||'',nameKey:name,disambiguated:false});continue;}const rows=raw.sort((a,b)=>a.signature.localeCompare(b.signature)),parent=rows.map((_,i)=>i),paperSets=rows.map(r=>new Set([r.paperID])),ids=rows.map(r=>r.oid),root=i=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;};
      const join=(a,b)=>{a=root(a);b=root(b);if(a===b)return;if(ids[a]&&ids[b]&&ids[a]!==ids[b])return;if(!(ids[a]&&ids[a]===ids[b]))for(const paperID of paperSets[a])if(paperSets[b].has(paperID))return;const keep=Math.min(a,b),drop=Math.max(a,b);parent[drop]=keep;ids[keep]=ids[a]||ids[b];for(const paperID of paperSets[drop])paperSets[keep].add(paperID);};
      const byORCID=new Map(),postings=new Map();rows.forEach((r,i)=>{if(r.oid){if(byORCID.has(r.oid))join(i,byORCID.get(r.oid));else byORCID.set(r.oid,i);}const context=contexts.get(r.paperID);
        if(context.names.size<=64)for(const coauthor of context.names)if(coauthor!==name)put(postings,'c:'+coauthor,i);
        for(const oid of context.oids)if(oid!==r.oid)put(postings,'o:'+oid,i);for(const affiliation of r.affiliations)put(postings,'a:'+affiliation,i);if(r.email)put(postings,'e:'+r.email,i);
      });
      const candidates=rows.map(()=>new Set());for(const posting of postings.values())for(let i=0;i<posting.length;i++)for(let j=i+1;j<Math.min(posting.length,i+17);j++){
        const a=posting[i],b=posting[j];if(candidates[a].size<64&&candidates[b].size<64){candidates[a].add(b);candidates[b].add(a);}else metrics.capped++;
      }
      // Include identifier anchors even when they are far apart in a large posting.
      // A truncated anchor set must never masquerade as an unambiguous match.
      const incomplete=new Set();for(const posting of postings.values()){
        const anchored=[...new Map(posting.filter(i=>rows[i].oid).map(i=>[rows[i].oid,i])).values()];
        for(const i of posting){if(anchored.length>32)incomplete.add(i);for(const j of anchored.slice(0,32))if(i!==j){if(candidates[i].has(j)||candidates[i].size<96){candidates[i].add(j);candidates[j].add(i);}else incomplete.add(i);}}
      }
      const supportedEdges=[],adj=rows.map(()=>[]);for(let i=0;i<rows.length;i++)for(const j of candidates[i])if(j>i){metrics.comparisons++;const score=evidence(rows[i],rows[j]);if(score){supportedEdges.push([i,j,score]);adj[i].push([j,score]);adj[j].push([i,score]);}}
      const known=rows.map(r=>r.oid),resolved=[...known],direct=rows.map(()=>new Map()),winning=rows.map(()=>null);
      const rank=(i,labels)=>{const scores=new Map();for(const [j,score] of adj[i])if(labels[j]){const oid=labels[j];if(!scores.has(oid)||scores.get(oid).score<score)scores.set(oid,{oid,score,paperID:rows[j].paperID});}return [...scores.values()].sort((a,b)=>b.score-a.score||a.oid.localeCompare(b.oid));};
      rows.forEach((row,i)=>{if(!row.oid)direct[i]=new Map(rank(i,known).map(r=>[r.oid,r]));});
      // Decide per paper signature before unioning. Otherwise one ambiguous paper
      // can contaminate an entire chain, even when each endpoint has clear evidence.
      for(let pass=0;pass<3;pass++){const next=[...resolved];let changes=0;
        for(let i=0;i<rows.length;i++){if(resolved[i]||incomplete.has(i))continue;const choices=rank(i,resolved),best=choices[0],runner=choices[1];
          if(!best||contexts.get(rows[i].paperID).oids.has(best.oid))continue;
          // Require a material evidence margin; these scores are not probabilities.
          if(runner&&(best.score<6||best.score-runner.score<3||best.score<runner.score*1.4))continue;
          // A directly conflicting anchor cannot be bypassed by weak transitive support.
          const competitor=[...direct[i].values()].filter(r=>r.oid!==best.oid).sort((a,b)=>b.score-a.score)[0];
          if(competitor&&(best.score-competitor.score<3||best.score<competitor.score*1.4))continue;
          next[i]=best.oid;winning[i]=best;changes++;
        }
        const perPaper=new Map();for(let i=0;i<rows.length;i++)if(next[i]){const key=rows[i].paperID+'|'+next[i];put(perPaper,key,i);}for(const peers of perPaper.values())if(peers.length>1)for(const i of peers)if(!known[i]){next[i]='';winning[i]=null;}
        for(let i=0;i<rows.length;i++)resolved[i]=next[i];if(!changes)break;
      }
      rows.forEach((row,i)=>{if(!row.oid&&resolved[i]){ids[i]=resolved[i];join(i,byORCID.get(resolved[i]));metrics.resolvedByEvidence++;}});
      for(const [i,j] of supportedEdges)if(!resolved[i]&&!resolved[j])join(i,j);
      const anchors=new Map();for(let i=0;i<rows.length;i++)if(!resolved[i]){const key=root(i);if(!anchors.has(key))anchors.set(key,new Set());for(const row of rank(i,resolved))anchors.get(key).add(row.oid);}
      const ambiguous=new Set();for(const [key,choices] of anchors)if(choices.size>1)ambiguous.add(root(key));
      for(let i=0;i<rows.length;i++)if(!resolved[i]&&(ambiguous.has(root(i))||incomplete.has(i)))metrics.ambiguousSignatures++;
      const rowIndex=new Map(rows.map((r,i)=>[r.signature,i])),components=new Map();rows.forEach((r,i)=>put(components,root(i),r));
      const supported=[...components.values()].filter(g=>g.length>=2),split=byORCID.size>1||supported.length>=2||new Set(rows.map(r=>r.paperID)).size<rows.length;
      if(split)metrics.splitNames++;
      for(const [key,group] of components){const oid=ids[root(key)];for(const row of group){
        // An unanchored signature cannot bridge two different verified ORCIDs.
        const identity=oid?'orcid':ambiguous.has(root(key))?'unresolved':split?(group.length>=2?'coauthor-evidence':'unresolved'):'name';
        const id=oid?'author:orcid:'+oid:split||byORCID.size?'author:'+name+'#'+encodeURIComponent(group[0].signature):'author:'+name;
        const support=winning[rowIndex.get(row.signature)];assignments.set(row.signature,{id,title:row.title,identity,orcid:oid||'',nameKey:name,disambiguated:split,...(support?{linkEvidence:{paperID:support.paperID,score:support.score}}:{})});
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
  const searchText=value=>C.norm(value).normalize('NFKD').replace(/\p{M}/gu,'').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
  function nameForms(name){const words=searchText(name).split(' ').filter(Boolean).slice(0,10),forms=new Set();for(let i=0;i<words.length;i++)forms.add([...words.slice(i),...words.slice(0,i)].join(''));return [...forms];}
  function searchIndex({nodes,papers=[],mode}){
    const entities=nodes.filter(n=>n.kind!=='paper'),owners=new Map();for(const n of entities)for(const id of n.members||[]){if(!owners.has(id))owners.set(id,[]);owners.get(id).push(n.id);}
    const entries=[...entities,...(papers.length?papers:nodes.filter(n=>n.kind==='paper'))].map(n=>{const titleText=searchText(n.title),names=n.kind==='author'?[n.title]:(n.creators||[]).map(a=>a.name||[a.firstName,a.lastName].filter(Boolean).join(' '));return {id:n.id,title:n.title,year:n.kind==='author'||n.kind==='topic'?'':n.year,kind:n.kind||'paper',titleText,compactTitle:titleText.replace(/ /g,''),titleWords:[...new Set(titleText.split(' '))],names:names.flatMap(nameForms),text:searchText([n.title,n.abstract,n.journal,n.DOI,...names].join(' '))};});
    return {entries,owners,entities:new Map(entities.map(n=>[n.id,n])),mode,visible:new Set(nodes.map(n=>n.id))};
  }
  // Bounded one-edit matching for longer title terms; abstracts keep cheap substring search.
  function oneEdit(a,b){if(a===b)return true;if(Math.abs(a.length-b.length)>1)return false;let i=0;while(i<a.length&&i<b.length&&a[i]===b[i])i++;if(a.length===b.length)return a.slice(i+1)===b.slice(i+1)||(a[i]===b[i+1]&&a[i+1]===b[i]&&a.slice(i+2)===b.slice(i+2));return a.length>b.length?a.slice(i+1)===b.slice(i):a.slice(i)===b.slice(i+1);}
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
    const normalized=searchText(String(query).slice(0,240)),words=normalized.split(' ').filter(Boolean),compact=words.join('');if(!words.length)return {matches:[],results:[]};
    const ranked=[];for(const n of index.entries){let score=0;
      if(n.titleText===normalized||n.compactTitle===compact||n.names.includes(compact))score=100;
      else if(words.every(w=>n.titleText.includes(w))||n.names.some(name=>words.every(w=>name.includes(w))))score=85;
      else if(n.compactTitle.includes(compact))score=75;
      else if(words.every(w=>n.text.includes(w)))score=60;
      else if(n.kind!=='author'&&words.length<=8&&words.every(w=>n.titleWords.some(t=>t.includes(w)||(w.length>=5&&t.length>=5&&oneEdit(w,t)))))score=35;
      if(score)ranked.push({n,score});
    }
    ranked.sort((a,b)=>Number(b.n.kind!=='paper')-Number(a.n.kind!=='paper')||b.score-a.score||a.n.title.localeCompare(b.n.title));
    const entities=ranked.filter(x=>x.n.kind!=='paper'),papers=ranked.filter(x=>x.n.kind==='paper'),matches=new Set(entities.map(x=>x.n.id));
    if(index.mode!=='authors'||!entities.length)for(const {n:paper} of papers){if(index.visible.has(paper.id))matches.add(paper.id);for(const id of index.owners.get(paper.id)||[])matches.add(id);}
    return {matches:[...matches],results:ranked.slice(0,8).map(({n})=>({id:n.id,title:n.title,year:n.year,kind:n.kind}))};
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
 // Multilevel weighted modularity with self-loop-preserving aggregation.
 // Each level operates on the sparse neighbour graph, never on all paper pairs.
 function multilevelCommunities(ids,edges,resolution=1.05,certificate=null){
  let members=[...ids].sort().map(id=>[id]),positions=new Map(members.map((m,i)=>[m[0],i])),adj=members.map(()=>new Map());
  for(const e of edges){const a=positions.get(e.source),b=positions.get(e.target),w=Number(e.weight)||1;if(a===undefined||b===undefined||a===b||w<=0)continue;adj[a].set(b,(adj[a].get(b)||0)+w);adj[b].set(a,(adj[b].get(a)||0)+w);}
  for(let level=0;level<8;level++){
   const degree=adj.map(row=>[...row.values()].reduce((s,w)=>s+w,0)),total=certificate?.total??degree.reduce((s,w)=>s+w,0);if(!total)break;
   const label=members.map((_,i)=>i),volume=[...degree];let moved=false;
   for(let pass=0;pass<24;pass++){let moves=0;for(let i=0;i<members.length;i++){
    const k=degree[i];if(!k)continue;const old=label[i],weights=new Map();for(const [j,w] of adj[i])if(j!==i)weights.set(label[j],(weights.get(label[j])||0)+w);
    volume[old]-=k;const score=c=>(weights.get(c)||0)-(level?Math.max(2,resolution):resolution)*k*volume[c]/total;let best=old,gain=score(old);
    for(const c of [...weights.keys()].sort((a,b)=>a-b)){const value=score(c),take=value>gain+1e-10;
     if(certificate){const a=(weights.get(c)||0)-(weights.get(best)||0)-1e-10,b=(level?Math.max(2,resolution):resolution)*k*(volume[c]-volume[best]);
      // Every decision is a linear inequality in global graph volume. A cached
      // component is reusable only while all observed decisions remain identical.
      if(a!==0){const bound=b/a;if((a>0)===take)certificate.lower=Math.max(certificate.lower,bound);else certificate.upper=Math.min(certificate.upper,bound);}
     }
     if(take){best=c;gain=value;}}
    label[i]=best;volume[best]+=k;if(best!==old){moves++;moved=true;}
   }if(!moves)break;}
   const groups=new Map(),seen=new Set();for(let i=0;i<members.length;i++){if(seen.has(i))continue;const block=[i];seen.add(i);for(let at=0;at<block.length;at++)for(const j of adj[block[at]].keys())if(!seen.has(j)&&label[j]===label[i]){seen.add(j);block.push(j);}groups.set(i,block);}if(!moved||groups.size===members.length)break;
   const blocks=[...groups.values()].sort((a,b)=>members[a[0]][0].localeCompare(members[b[0]][0])),owner=new Map(blocks.flatMap((g,i)=>g.map(j=>[j,i]))),next=blocks.map(()=>new Map());
   for(let i=0;i<adj.length;i++)for(const [j,w] of adj[i]){const a=owner.get(i),b=owner.get(j);next[a].set(b,(next[a].get(b)||0)+w);}
   members=blocks.map(g=>g.flatMap(i=>members[i]).sort());adj=next;
  }
  return members.sort((a,b)=>b.length-a.length||a[0].localeCompare(b[0]));
 }

 // Exact component-local recomputation at the original global modularity scale.
 // Certificates also invalidate unchanged components if a global-volume change
 // can alter any local-move decision. A bridge or split changes its full component.
 function incrementalCommunities(ids,edges,resolution=1.05,previous=null){
  const ordered=[...ids].sort(),adj=new Map(ordered.map(id=>[id,[]])),valid=[];
  let total=0;for(const e of edges){const weight=Number(e.weight)||1;if(e.source===e.target||!adj.has(e.source)||!adj.has(e.target)||weight<=0)continue;adj.get(e.source).push(e.target);adj.get(e.target).push(e.source);valid.push({...e,weight});total+=2*weight;}
  const seen=new Set(),owner=new Map(),blocks=[];
  for(const id of ordered){if(seen.has(id))continue;const queue=[id];seen.add(id);for(let i=0;i<queue.length;i++)for(const next of adj.get(queue[i]))if(!seen.has(next)){seen.add(next);queue.push(next);}queue.sort();for(const member of queue)owner.set(member,blocks.length);blocks.push({ids:queue,edges:[]});}
  for(const e of valid)blocks[owner.get(e.source)].edges.push(e);
  const prior=new Map(previous?.version===1&&previous.resolution===resolution?(previous.blocks||[]).map(b=>[b.ids[0],b]):[]),state=[],groups=[],stats={reusedComponents:0,recomputedComponents:0,reusedNodes:0,recomputedNodes:0};
  for(const block of blocks){
   const signature=JSON.stringify([block.ids,block.edges.map(e=>{const pair=[e.source,e.target].sort();return [...pair,e.weight];}).sort((a,b)=>a[0].localeCompare(b[0])||a[1].localeCompare(b[1])||a[2]-b[2])]),old=prior.get(block.ids[0]);
   let result,lower=0,upper=Number.MAX_VALUE;
   const cachedIDs=old?.groups?.flat();
   if(old?.signature===signature&&total>old.lower&&total<old.upper&&Array.isArray(cachedIDs)&&cachedIDs.length===block.ids.length&&new Set(cachedIDs).size===block.ids.length&&cachedIDs.every(id=>owner.get(id)===owner.get(block.ids[0]))){result=old.groups;lower=old.lower;upper=old.upper;stats.reusedComponents++;stats.reusedNodes+=block.ids.length;}
   else{const certificate={total,lower,upper};result=multilevelCommunities(block.ids,block.edges,resolution,certificate);lower=certificate.lower;upper=certificate.upper;stats.recomputedComponents++;stats.recomputedNodes+=block.ids.length;}
   groups.push(...result);state.push({ids:block.ids,signature,groups:result,lower,upper});
  }
  groups.sort((a,b)=>b.length-a.length||a[0].localeCompare(b[0]));
  return {groups,state:{version:1,resolution,blocks:state},stats};
 }

  return {incrementalCommunities,multilevelCommunities,id,authorKey,orcid,enrichCreators,authorIdentities,build,neighbors,search,consolidate,workspace,communities,terms,searchIndex,queryIndex,authorConnections,authorNeighborhood};
})();
if(typeof module!=='undefined')module.exports=CiteLensNetworkCore;
