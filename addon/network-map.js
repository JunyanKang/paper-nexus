/* Graph model and bounded layout, run in a worker. No library writes or remote calls. */
var CiteLensNetworkMap=(()=>{
 const C=CiteLensCore,NC=CiteLensNetworkCore;
 const hash=s=>{let n=2166136261;for(const c of String(s))n=Math.imul(n^c.charCodeAt(0),16777619);return n>>>0;};
 function build({nodes,edges,mode='authors',limit=600,query='',selected='',positions=[],openEntities=[]}){
  const matches=query?NC.search(nodes,query):[],priority=new Set([selected,...matches.map(n=>n.id)]),ordered=[...nodes.filter(n=>priority.has(n.id)),...nodes.filter(n=>!priority.has(n.id))],visible=ordered.slice(0,limit),papers=new Map(visible.map(n=>[n.id,{...n,kind:'paper',local:true}])),links=[],linkKeys=new Set();
  for(const e of edges){if(!papers.has(e.source)||!papers.has(e.target)||e.source===e.target)continue;const key=JSON.stringify([e.source,e.target,e.kind]);if(linkKeys.has(key))continue;linkKeys.add(key);links.push({...e});}
  const groups=[],allPapers=[...papers.values()].sort((a,b)=>a.id.localeCompare(b.id));let authorsCount=0;
  const saved=new Map(positions.map(n=>[n.id,n]));for(const n of allPapers){const p=saved.get(n.id);n.topicTitle=C.researchTitle(n);n.color=6;if(p){n.x=p.x;n.y=p.y;n.pinned=p.pinned||false;}}
  const graph={mode,selected,positions,openEntities,nodes:allPapers,edges:links,groups,matches:matches.filter(n=>papers.has(n.id)).map(n=>n.id),stats:{total:nodes.length,local:allPapers.filter(n=>n.local).length,authors:authorsCount,topics:0,abstracts:allPapers.filter(n=>n.abstract).length,hidden:Math.max(0,nodes.length-visible.length)}};return mode==='authors'?authors(graph):graph;
 }
 // Topic representation is independent of clustering: bounded document support,
 // class-level contrast and representative-document support rank complete phrases.
 // Inspired by c-TF-IDF/KeyBERT representation; no additional encoder is loaded.
 const labelStop=new Set(('potential risk factor contributing contributes contribute causes cause modulates modulate modulated reduces reduce reduced rises rise improves improve improving ameliorates ameliorate attenuates attenuate declines decline protects protect prevents prevent promotes promote improves improve beneficial effectiveness vitro vivo situ et al but yet than then not only also both either neither although however despite versus vs among across toward against including reduced reducing low high higher lower less more most much very such no does did do been being will would should must whose which who where when why because therefore significantly associated dependent independent randomized controlled meta-analysis systematic trial trials meta analyses results conclusion conclusions background objective objectives purpose methods patients subjects participants healthy elderly male female the a an and or of in on for to by with from as at is are was were this that these those its their our using use study studies analysis review role effect effects new novel evidence reveals reveal based during within between through into under after before via how whether can could may might has have had shows show showed demonstrates demonstrate suggests suggest initiates initiate inactivates inactivate visualizing linking tracking mapping regulating inhibit inhibits inhibited enhance enhances enhanced suppress suppresses suppressed activate activates activated disrupt disrupts disrupted promote promotes regulate regulates restore restores restored increase increases increased decrease decreases decreased measured measure measuring induces induce induced mediates mediated controls control determine determines requires required identifies identified identification characterization characterisation contribution contributions compared comparison associated associates predicts predict underlying').split(' ')),labelHeads=new Set(('cell cells retina retinas fovea foveas foveae photoreceptor photoreceptors neuron neurons progenitor progenitors receptor receptors protein proteins gene genes genome genomes transcript transcripts rna dna chromatin epigenome epigenomes mutation mutations disease diseases disorder disorders syndrome syndromes cancer cancers tumor tumors tumour tumours tissue tissues organ organs organoid organoids embryo embryos synapse synapses junction junctions channel channels pigment pigments rhodopsin opsin opsins biofilm biofilms bacterium bacteria virus viruses microbiome microbiomes immunity inflammation metabolism apoptosis autophagy angiogenesis neurogenesis development maturation differentiation proliferation survival death repair regeneration signaling signalling expression regulation transcription translation splicing resistance response responses therapy therapies treatment treatments imaging microscopy tomography thickness sequencing structure structures function functions physiology anatomy detachment hole holes albinism hypoplasia degeneration dystrophy infection infections fiber fibre gas toxin toxins phosphate phosphates practice epidemiology production odor oxalate vitamins vitamin nanoparticles nanomaterials models model constipation homocysteine obesity diabetes nutrition diet diets intake supplementation consumption exposure cognition memory dementia stroke ischemia ischaemia infarction hypertension osteoporosis arthritis osteoarthritis vasodilation lipid lipids acid acids acidification methylation acetylation phosphorylation plasticity connectivity behavior behaviour learning pain sleep toxicity carcinogenesis mutagenesis carcinogen carcinogens biomarker biomarkers metabolite metabolites biogenesis endocytosis exocytosis transport trafficking migration adhesion fibrosis amyloid amyloidosis insulin glucose cholesterol glycemia glycaemia caffeine adenovirus probiotics microbiota feces faeces stool milk meat fish depression anxiety stress exercise ventilation respiration circulation perfusion absorption intolerance allergy allergies deficiency deficiencies disability disabilities impairment impairments activity activities fate homeostasis pathway pathways cycle cycles dynamics architecture assembly complex complexes dynamics pattern patterns autophagosome autophagosomes').split(' '));
 const phraseCache=new Map();
 function phraseCandidates(n){
  const title=C.researchTitle(n),abstract=C.plainTitle(n.abstract||n.abstractNote||''),signature=JSON.stringify([title,abstract,n.creators]);
  const cached=phraseCache.get(n.id);if(cached?.signature===signature)return cached.phrases;
  const lexicon=typeof CiteLensTopicLexicon==='undefined'?{has:()=>false}:CiteLensTopicLexicon,phrases=new Map(),authorWords=new Set((n.creators||[]).flatMap(a=>[a.firstName,a.lastName,a.name].filter(Boolean).flatMap(x=>x.toLowerCase().match(/[\p{L}\p{M}]{3,}/gu)||[])));
  const sources=[[title.slice(0,768),true],[abstract.length<=2000?abstract:abstract.slice(0,1100)+'\n'+abstract.slice(-900),false]];
  for(const [raw,isTitle] of sources){const text=raw.replace(/--+|[–—]/g,': '),nounPhrases=typeof nlp==='function'?nlp(text.replace(/[:;,]/g,'. ')).match('(#Adjective|#Noun)+').out('array').map(x=>x.toLowerCase().replace(/^[^\p{L}0-9]+|[^\p{L}0-9]+$/gu,'')):null,tokens=[...text.matchAll(/(?:[0-9]+-?)?[\p{L}][\p{L}\p{M}0-9-]*(?:['’][\p{L}]+)?/gu)];
   for(let size=1;size<=6;size++)for(let i=0;i<=tokens.length-size;i++){
    const part=tokens.slice(i,i+size).map(t=>t[0]),lower=part.map(w=>w.toLowerCase()),span=text.slice(tokens[i].index,tokens[i+size-1].index+tokens[i+size-1][0].length);
    if(/[.!?:;,()\[\]\n]/.test(span)||lower.some(w=>labelStop.has(w))||span.length>64)continue;
    const exact=lexicon.has(lower.join(' ')),head=labelHeads.has(lower.at(-1).replace(/-?\d+$/,''))||lexicon.has(lower.at(-1))||lexicon.has(lower.at(-1)+'s')||/(?:tion|sion|ment|sis|osis|oma|pathy|emia|ase|ogen|logy|nomics)$/.test(lower.at(-1));
    if(!head&&!exact||!exact&&lower.some(w=>authorWords.has(w)))continue;
    const phrase=lower.join(' ');if(nounPhrases&&!nounPhrases.some(np=>(np===phrase||np.includes(phrase))&&(exact||np.endsWith(phrase))))continue;
    if(lower.at(-1)==='stem')continue;
    if(size===1&&((part[0].length<5&&!exact)||/^(?:disease|diseases|disorder|disorders|treatment|treatments|response|responses|function|functions|protein|proteins|human|humans|patients|clinical|children|health|system|systems|exposure|intake|dietary|consumption|supplementation|association|relationships|findings|outcomes|levels|concentrations|longitudinal|prenatal|maternal|childhood|randomized|controlled|significant|safety|efficacy|mechanisms|mechanism|potential|diagnosis|prevention|administration|family|families|child|adult|adults|rats|mice|female|male|models|model|review|reviews|analysis|meat|milk|fish|diet|diets|activity|activities|pattern|patterns|dynamics)$/i.test(part[0])))continue;
    // Inflection grouping never edits the displayed scientific phrase.
    const key=lower.map(w=>w.length>4&&w.endsWith('s')&&!/(?:ss|sis|ics)$/.test(w)?w.slice(0,-1):w).join(' ');
    const previous=phrases.get(key);if(!previous||isTitle&&!previous.inTitle)phrases.set(key,{key,text:part.join(' '),size,exact,inTitle:isTitle});
   }
  }
  const priority=p=>Number(p.inTitle)*100+Number(p.exact)*8+Math.min(p.size,4);const bounded=new Map([...phrases].sort((a,b)=>priority(b[1])-priority(a[1])||a[0].localeCompare(b[0])).slice(0,128));phraseCache.set(n.id,{signature,phrases:bounded});while(phraseCache.size>2000)phraseCache.delete(phraseCache.keys().next().value);return bounded;
 }
 function conceptCandidates(n){
  const rows=[...phraseCandidates(n).values()],lexicon=typeof CiteLensTopicLexicon==='undefined'?{has:()=>false}:CiteLensTopicLexicon;
  for(const span of C.researchTitle(n).split(/[.!?:;,()\[\]\n]/)){const words=span.toLowerCase().match(/[\p{L}][\p{L}\p{M}0-9-]*/gu)||[];for(let size=2;size<=5;size++)for(let at=0;at+size<=words.length;at++){const text=words.slice(at,at+size).join(' ');if(lexicon.has(text)||lexicon.has(text+'s'))rows.push({text,key:text.replace(/s$/,''),size,inTitle:true});}}
  return [...new Map(rows.map(p=>[p.key,p])).values()];
 }
 function labelIndex(all,groups=null,vectors=null,needed=null,progress=()=>{}){
  const global=new Map(),terms=new Map(),phrases=new Map(),classWords=new Map();let done=0;
  for(const n of all){const words=new Set(NC.terms(C.researchTitle(n)));terms.set(n.id,words);for(const t of words)global.set(t,(global.get(t)||0)+1);if(!needed||needed.has(n.id)){phrases.set(n.id,phraseCandidates(n));if(++done%12===0)progress({phase:'naming',completed:done,total:needed?.size||all.length});}}
  const classes=groups||[all.map(n=>n.id)];classes.forEach((ids,i)=>{for(const word of new Set(ids.flatMap(id=>[...(terms.get(id)||[])]))){if(!classWords.has(word))classWords.set(word,new Set());classWords.get(word).add(i);}});
  const classFrequency=new Map();for(const rows of phrases.values())for(const p of rows.values())if(!classFrequency.has(p.key)){const words=NC.terms(p.text),sets=words.map(w=>classWords.get(w)||new Set()).sort((a,b)=>a.size-b.size);classFrequency.set(p.key,sets.length?[...sets[0]].filter(id=>sets.every(set=>set.has(id))).length:1);}
  return{global,terms,phrases,classFrequency,classCount:classes.length,vectors:vectors?new Map(all.map((n,i)=>[n.id,vectors[i]])):null};
 }
 function label(members,all,stats,excluded=new Set()){
  if(members.every(n=>/^(?:biography|obituary|in memoriam)\b/i.test(C.researchTitle(n))))return 'Scientific biographies';
  if(members.every(n=>/^(?:series page|contents|editorial board|front matter|copyright|index)\b/i.test(C.researchTitle(n))))return 'Publication information';
  stats ||= labelIndex(all);const phrases=new Map(),vectors=members.map(n=>stats.vectors?.get(n.id)).filter(v=>Array.isArray(v)&&v.length),centroid=vectors.length?CiteLensSemanticCore.normalize(vectors[0].map((_,i)=>vectors.reduce((sum,v)=>sum+v[i],0)/vectors.length)):null;
  for(const n of members){const v=stats.vectors?.get(n.id),central=centroid&&v?Math.max(0,CiteLensSemanticCore.dot(v,centroid)):1;
   for(const p of stats.phrases.get(n.id)||phraseCandidates(n)){const [key,row]=p;if(!phrases.has(key))phrases.set(key,{...row,count:0,titles:0,central:0});const item=phrases.get(key);item.count++;item.titles+=Number(row.inTitle);item.central+=central;}
  }
  const generic=/^(?:light|cells?|genes?|assembly|disruption|plasticity|development|regulation|expression|translation|transcription|proteins?|structure|function|research|signaling|signalling|dna|rna|retina|chromatin|aging|maturation|proliferation|synthesis|alignment|ribosome|single cells|tissues?|genomes?|embryos?|syndromes?|complex|complexes|structures?|enzymes?|methods?|mechanisms?|performance improvement|upward motion)$/i;
  const options=[...phrases.values()].filter(p=>!excluded.has(C.norm(p.text))&&!generic.test(p.text)),distinct=options.filter(p=>stats.classCount<3||(stats.classFrequency.get(p.key)||1)<stats.classCount*.8),eligible=distinct.length?distinct:options,repeated=eligible.filter(p=>p.count>=2&&p.count/members.length>=.3),supported=repeated.length?repeated:eligible;
  const extensions=new Map();for(const q of supported)if(q.size>1){const prefix=q.key.split(' ').slice(0,-1).join(' ');if(!extensions.has(prefix))extensions.set(prefix,[]);extensions.get(prefix).push(q);}const complete=supported.filter(p=>!(extensions.get(p.key)||[]).some(q=>q.count>=p.count*.8&&q.titles>=p.titles*.8));
  const score=p=>{const words=NC.terms(p.text),contrast=words.length?Math.max(...words.map(w=>Math.log1p(all.length/Math.max(1,stats.global.get(w)||1)))):1;
   const coverage=p.count/members.length,classContrast=Math.log1p(stats.classCount/Math.max(1,stats.classFrequency.get(p.key)||1)),fieldSupport=(p.titles+.35*(p.count-p.titles))/members.length,representative=.8+.2*p.central/p.count;
   return coverage**.5*fieldSupport*Math.sqrt(Math.min(4,p.size))*contrast**.7*classContrast*representative*(p.exact?1.1:1)*(p.size===1?.7:1)/(1+Math.max(0,p.size-4)*.25);};
  const ranked=complete.map(p=>({...p,score:score(p)})).sort((a,b)=>b.score-a.score||a.text.localeCompare(b.text));const best=ranked[0];return best?best.text.charAt(0).toUpperCase()+best.text.slice(1):fallbackLabel(members,excluded);
 }

 function fallbackLabel(members,excluded=new Set()){
  // Preserve a real title when NLP lacks a supported concept; never manufacture a scientific label.
  for(const n of [...members].sort((a,b)=>String(a.id).localeCompare(String(b.id)))){
   const title=C.researchTitle(n);if(title&&!excluded.has(C.norm(title)))return title;
  }return '';
 }
 function uniqueLabels(groups,papers,vectors=null,progress=()=>{}){
  const byID=new Map(papers.map(n=>[n.id,n])),stats=labelIndex(papers,groups.map(g=>g.members),vectors,null,progress),used=new Set();
  for(const g of [...groups].sort((a,b)=>b.members.length-a.members.length||a.id.localeCompare(b.id))){
   const members=g.members.map(id=>byID.get(id)).filter(Boolean);if(!members.length)continue;
   g.title=label(members,papers,stats,used);if(g.title)used.add(C.norm(g.title));
  }
 }
 function authors(graph){
  const authors=new Map(),pairs=new Map(),teams=new Map(),resolved=NC.authorIdentities(graph.nodes);let unattributed=0;
  for(const paper of graph.nodes){const ids=[];(paper.creators||[]).forEach((creator,position)=>{
   const identity=resolved.assignments.get(JSON.stringify([paper.id,position]));if(!identity)return;const {id}=identity;if(!authors.has(id))authors.set(id,{...identity,kind:'author',members:[],local:false,color:6});
   const node=authors.get(id);if(identity.title.length>node.title.length)node.title=identity.title;if(!node.members.includes(paper.id))node.members.push(paper.id);node.local ||= paper.local;ids.push(id);
  });const unique=[...new Set(ids)].sort();if(!unique.length)unattributed++;teams.set(paper.id,unique);
  }
  graph.identityMetrics=resolved.metrics;
  // A consortium with 2,000 authors must not allocate two million pair objects.
  // Rank true collaborators by fractional shared-paper support, keeping the
  // strongest 12 per person. Ties disperse deterministically, not into one hub.
  const ranks=new Map([...authors.keys()].map(id=>[id,hash(id)]));
  for(const node of authors.values()){
   const candidates=new Map();for(const pid of node.members){const team=teams.get(pid),weight=1/Math.max(1,team.length-1);for(const id of team)if(id!==node.id)candidates.set(id,(candidates.get(id)||0)+weight);}
   node.coauthorCount=candidates.size;
   const ranked=[...candidates].sort((a,b)=>b[1]-a[1]||((ranks.get(node.id)^ranks.get(a[0]))>>>0)-((ranks.get(node.id)^ranks.get(b[0]))>>>0)||a[0].localeCompare(b[0]));
   for(const [id,strength] of ranked.slice(0,12)){const ids=[node.id,id].sort(),key=JSON.stringify(ids);if(pairs.has(key))continue;const other=new Set(authors.get(id).members),shared=node.members.filter(pid=>other.has(pid));pairs.set(key,{source:ids[0],target:ids[1],kind:'coauthor',strength,evidence:shared.map(paperID=>({paperID}))});}
  }
  graph.paperNodes=graph.nodes;graph.paperEdges=graph.edges;graph.nodes=[...authors.values()].sort((a,b)=>a.id.localeCompare(b.id));graph.edges=[...pairs.values()];graph.stats.authors=graph.nodes.length;graph.stats.unattributed=unattributed;graph.groups=[];
  return expandMembers(graph);
 }
 function topics(graph,semantic,previous=null,progress=()=>{}){
  const papers=graph.nodes,byID=new Map(papers.map(n=>[n.id,n])),result=CiteLensSemanticCore.graph(papers,semantic.vectors,NC.communities,{previous,signatures:semantic.signatures,progress});
  graph.edges.push(...result.links.map(e=>({source:e.source,target:e.target,kind:'similarity',evidence:[{score:e.score}]})));
  // Reinforce sparse semantic neighborhoods only with specific shared concepts.
  // Generic methods and very frequent phrases never create a scientific relation.
  const conceptRows=new Map(),pairs=new Map(),vectorIDs=new Map(papers.map((p,i)=>[p.id,i]));
  for(const p of papers)for(const candidate of conceptCandidates(p))if(candidate.size>=2&&candidate.inTitle&&!/^(?:single cell sequencing|gene expression|protein expression|cell culture|research article|systematic review)$/i.test(candidate.text)){
   if(!conceptRows.has(candidate.key))conceptRows.set(candidate.key,[]);conceptRows.get(candidate.key).push(p.id);
  }
  for(const [concept,ids] of conceptRows)if(ids.length>=2&&ids.length<=Math.min(24,Math.max(4,papers.length*.08)))for(let i=0;i<ids.length;i++)for(let j=i+1;j<ids.length;j++){
   const score=CiteLensSemanticCore.dot(semantic.vectors[vectorIDs.get(ids[i])],semantic.vectors[vectorIDs.get(ids[j])]);if(score<.46)continue;
   const pair=[ids[i],ids[j]].sort(),key=JSON.stringify(pair);if(!pairs.has(key))pairs.set(key,{source:pair[0],target:pair[1],score,weight:score*score,concept});
  }
  const degrees=new Map(),known=new Set(result.links.map(e=>JSON.stringify([e.source,e.target].sort()))),support=[];
  for(const [key,e] of [...pairs].sort((a,b)=>b[1].score-a[1].score||a[0].localeCompare(b[0])))if(!known.has(key)&&(degrees.get(e.source)||0)<3&&(degrees.get(e.target)||0)<3){support.push(e);for(const id of [e.source,e.target])degrees.set(id,(degrees.get(id)||0)+1);}
  graph.edges.push(...support.map(e=>({source:e.source,target:e.target,kind:'similarity',evidence:[{score:e.score,concept:e.concept}]})));
  const decided=support.length?NC.communities(papers.map(n=>n.id),[...result.links,...support],1.05):result.groups,covered=new Set(decided.flat()),groups=[...decided,...papers.filter(n=>!covered.has(n.id)).map(n=>[n.id])],used=new Set(),prior=previous?.groups||[],signatures=new Map(papers.map((n,i)=>[n.id,semantic.signatures?.[i]||[C.researchTitle(n),n.abstract||'']]));
  graph.groups=groups.map(ids=>{const members=new Set(ids);const match=prior.filter(g=>!used.has(g.id)).map(g=>({g,overlap:g.members.filter(id=>members.has(id)).length})).filter(x=>x.overlap/Math.max(ids.length,x.g.members.length)>=.5).sort((a,b)=>b.overlap-a.overlap||a.g.id.localeCompare(b.g.id))[0]?.g;
   const id=match?.id||'topic:'+hash(ids.join('\0')).toString(36);used.add(id);const labelKey=JSON.stringify(['concept-contrast-4',...ids.map(id=>[id,signatures.get(id)])]),title=match?.labelKey===labelKey?match.title:'';
   return {id,title,labelKey,members:ids,kind:'topic',local:ids.some(id=>byID.get(id).local),color:hash(id)%6};
  });
  // Stable names are reused for unchanged groups; only changed scientific content
  // incurs part-of-speech analysis. The cache stores names/signatures, not NLP state.
  // Repair names at the sibling level, including collisions introduced by incremental updates.
  uniqueLabels(graph.groups,papers,semantic.vectors,progress);
  // Identical content can produce identical singleton names. Consolidate those only;
  // different scientific content is assigned its next evidence-backed phrase above.
  const canonical=new Map();for(const g of graph.groups){const key=C.norm(g.title)||JSON.stringify(g.members.map(id=>C.researchTitle(byID.get(id))));if(!canonical.has(key))canonical.set(key,g);else canonical.get(key).members.push(...g.members);}
  graph.groups=[...canonical.values()];progress({phase:'naming',completed:papers.length,total:papers.length});
  const owner=new Map(graph.groups.flatMap(g=>g.members.map(id=>[id,g.id]))),links=new Map();for(const edge of graph.edges){if(!['similarity','cites','related'].includes(edge.kind))continue;const a=owner.get(edge.source),b=owner.get(edge.target);if(!a||!b||a===b)continue;const pair=[a,b].sort(),key=JSON.stringify(pair);if(!links.has(key))links.set(key,{source:pair[0],target:pair[1],kind:'topic-relation',evidence:[]});const list=links.get(key).evidence;if(!list.some(e=>e.sourcePaper===edge.source&&e.targetPaper===edge.target&&e.kind===edge.kind))list.push({sourcePaper:edge.source,targetPaper:edge.target,kind:edge.kind,...(edge.evidence?.[0]||{})});}
  // A second semantic graph relates subtopics, independent of authors and citations.
  // Content-keyed centroids reuse unchanged neighbours when the library grows.
  const vectorByID=new Map(papers.map((n,i)=>[n.id,semantic.vectors[i]])),signatureByID=new Map(papers.map((n,i)=>[n.id,semantic.signatures?.[i]||semantic.vectors[i]]));
  const centroids=graph.groups.map(g=>{const vectors=g.members.map(id=>vectorByID.get(id)).filter(v=>Array.isArray(v)&&v.length&&v.every(Number.isFinite));return vectors.length?CiteLensSemanticCore.normalize(vectors[0].map((_,i)=>vectors.reduce((sum,v)=>sum+v[i],0)/vectors.length)):[];});
  for(const g of graph.groups)g.representatives=CiteLensSemanticCore.representatives(g.members.map(id=>byID.get(id)),g.members.map(id=>vectorByID.get(id)),8);
  const representatives=graph.groups.map((g,i)=>g.members.filter(id=>vectorByID.get(id)?.length===centroids[i].length).sort((a,b)=>CiteLensSemanticCore.dot(vectorByID.get(b),centroids[i])-CiteLensSemanticCore.dot(vectorByID.get(a),centroids[i])||a.localeCompare(b))[0]);
  const hierarchy=CiteLensSemanticCore.graph(graph.groups,centroids,NC.communities,{previous:previous?.hierarchy,signatures:graph.groups.map(g=>JSON.stringify(g.members.map(id=>[id,signatureByID.get(id)]))),threshold:.52,titleThreshold:.52,maxNeighbors:4,progress:p=>progress({...p,phase:'hierarchy'})});
  const groupIndex=new Map(graph.groups.map((g,i)=>[g.id,i]));
  for(const e of hierarchy.links){const pair=[e.source,e.target].sort(),key=JSON.stringify(pair);if(!links.has(key))links.set(key,{source:pair[0],target:pair[1],kind:'topic-relation',evidence:[]});links.get(key).evidence.push({kind:'semantic-centroid',score:e.score,sourcePaper:representatives[groupIndex.get(e.source)],targetPaper:representatives[groupIndex.get(e.target)]});}
  graph.hierarchyIncremental=hierarchy.incremental;
  graph.paperNodes=papers;graph.paperEdges=graph.edges;graph.nodes=graph.groups.map(g=>({...g}));graph.edges=[...links.values()];
  graph.semanticState={...result.state,hierarchy:hierarchy.state,groups:graph.groups.map(g=>({id:g.id,members:g.members,title:g.title,labelKey:g.labelKey}))};graph.incremental=result.incremental;graph.semantic={grouping:'local',naming:'local',combined:semantic.combined,engine:semantic.engine,personalized:semantic.personalized,encoded:semantic.encoded,cached:semantic.cached};graph.stats.topics=graph.groups.length;
  return expandMembers(graph);
 }
 function expandMembers(graph){
  const papers=new Map(graph.paperNodes.map(n=>[n.id,n])),opened=new Set(graph.openEntities||[]),shown=new Set();
  for(const node of [...graph.nodes]){if(!opened.has(node.id))continue;for(const id of [...new Set([...(node.members.includes(graph.selected)?[graph.selected]:[]),...node.members])].slice(0,120)){if(!shown.has(id)){const paper=papers.get(id);if(!paper)continue;graph.nodes.push({...paper,group:node.id});shown.add(id);}graph.edges.push({source:node.id,target:id,kind:'membership',evidence:[{paperID:id}]});}}
  const saved=new Map((graph.positions||[]).map(p=>[p.id,p]));for(const node of graph.nodes){const p=saved.get(node.id);if(p){node.x=p.x;node.y=p.y;node.pinned=!!p.pinned;node.layoutFixed=Number.isFinite(p.x)&&Number.isFinite(p.y);}}
  graph.matches=[...new Set(graph.matches.flatMap(id=>graph.nodes.some(n=>n.id===id)?[id]:graph.nodes.filter(n=>n.members?.includes(id)).map(n=>n.id)))];return graph;
 }

 // Merge local modularity communities at a second level, retaining the original
 // degree volumes. Dropping internal edges here would incorrectly merge whole fields.
 function communityGroups(ids,links,resolution=1.05){
  const initial=NC.communities(ids,links,resolution),owner=new Map(),groups=new Map();
  initial.forEach((members,i)=>{groups.set(i,{members:[...members],volume:0,near:new Map()});for(const id of members)owner.set(id,i);});
  let total=0;for(const e of links){const a=owner.get(e.source),b=owner.get(e.target),w=e.weight||1;if(a===undefined||b===undefined)continue;total+=2*w;groups.get(a).volume+=w;groups.get(b).volume+=w;if(a!==b){groups.get(a).near.set(b,(groups.get(a).near.get(b)||0)+w);groups.get(b).near.set(a,(groups.get(b).near.get(a)||0)+w);}}
  for(let pass=0;pass<16&&total;pass++){
   const candidates=[];for(const [a,g] of groups)for(const [b,w] of g.near)if(a<b){const gain=w-resolution*g.volume*groups.get(b).volume/total;if(gain>1e-9)candidates.push({a,b,gain});}
   candidates.sort((a,b)=>b.gain-a.gain||a.a-b.a||a.b-b.b);const used=new Set();let changed=false;
   for(const {a,b} of candidates){if(used.has(a)||used.has(b))continue;const g=groups.get(a),h=groups.get(b);if(!g||!h)continue;used.add(a);used.add(b);changed=true;g.members.push(...h.members);g.volume+=h.volume;g.near.delete(b);for(const [c,w] of h.near){if(c===a)continue;g.near.set(c,(g.near.get(c)||0)+w);const other=groups.get(c);other.near.delete(b);other.near.set(a,(other.near.get(a)||0)+w);}groups.delete(b);}
   if(!changed)break;
  }
  return [...groups.values()].map(g=>g.members.sort()).sort((a,b)=>b.length-a.length||a[0].localeCompare(b[0]));
 }
 function layout(graph,progress=()=>{}){
  const nodes=graph.nodes,byID=new Map(nodes.map(n=>[n.id,n])),labels=graph.mode==='topics'?null:labelIndex([]);if(!nodes.length){graph.communities=[];graph.stats.communities=0;return graph;}
  const weight=e=>e.kind==='coauthor'?Math.max(.02,e.strength??e.evidence?.length??1):e.kind==='similarity'?2*(e.evidence?.[0]?.score||.3):e.kind==='cites'?(graph.mode==='topics'?.015:.15):e.kind==='related'?1.5:['author','coauthor','topic-relation'].includes(e.kind)?Math.min(5,1+Math.log2(1+(e.evidence?.length||1))):1;
  const links=graph.edges.map(e=>({...e,weight:weight(e)}));
  // Only scientific similarity attracts topics; citation and coauthor evidence
  // remain inspectable but cannot manufacture a topic cluster.
  const topicStrength=e=>Math.max(0,...(e.evidence||[]).filter(p=>['similarity','semantic-centroid'].includes(p.kind)).map(p=>p.score||0));
  const clusterLinks=links.flatMap(e=>graph.mode!=='topics'||e.kind==='membership'?[e]:e.kind==='topic-relation'&&topicStrength(e)>0?[{...e,weight:2*topicStrength(e)**2}]:[]);
  const rawGroups=communityGroups(nodes.map(n=>n.id),clusterLinks,1.05);
  const groups=rawGroups.map(ids=>{const members=ids.map(id=>byID.get(id)),papers=members,id='community:'+(members.find(n=>n.kind!=='paper')?.id||ids[0]);return{id,members:ids,papers:papers.length,r:35+Math.sqrt(ids.length)*18,pinned:members.some(n=>n.pinned),vx:0,vy:0};});
  const owner=new Map();groups.forEach((g,i)=>{for(const id of g.members){owner.set(id,g);const n=byID.get(id);n.community=g.id;n.color=g.papers<2?6:hash(g.id)%6;}});
  const spacing=Math.max(110,Math.sqrt(nodes.length/groups.length)*55),old=new Map(),aspect=1.65;
  groups.forEach((g,i)=>{const saved=g.members.map(id=>byID.get(id)).filter(n=>Number.isFinite(n.x)&&Number.isFinite(n.y));if(saved.length){g.x=saved.reduce((s,n)=>s+n.x,0)/saved.length;g.y=saved.reduce((s,n)=>s+n.y,0)/saved.length;}else{const angle=i*Math.PI*(3-Math.sqrt(5)),radius=Math.sqrt(i+.5)*spacing*.72;g.x=Math.cos(angle)*radius*Math.sqrt(aspect);g.y=Math.sin(angle)*radius/Math.sqrt(aspect);}old.set(g.id,{x:g.x,y:g.y});});
  const bridges=new Map();for(const e of clusterLinks){const a=owner.get(e.source),b=owner.get(e.target);if(a===b)continue;const key=[a.id,b.id].sort().join('|');if(!bridges.has(key))bridges.set(key,{a,b,weight:0});bridges.get(key).weight+=e.weight*(graph.mode==='topics'&&e.kind==='cites'?.02:1);}
  // Self-organising community centres: pair separation and real bridge forces.
  // There is no nominated root and no fixed ring or common attraction point.
  const cellSize=2*Math.max(...groups.map(g=>g.r))+80;
  for(let step=0;step<(nodes.some(n=>n.layoutFixed)?55:160);step++){
   const grid=new Map();for(const g of groups){const key=Math.floor(g.x/cellSize)+','+Math.floor(g.y/cellSize);if(!grid.has(key))grid.set(key,[]);grid.get(key).push(g);}
   for(const a of groups){const gx=Math.floor(a.x/cellSize),gy=Math.floor(a.y/cellSize);for(let ox=-1;ox<=1;ox++)for(let oy=-1;oy<=1;oy++)for(const b of grid.get((gx+ox)+','+(gy+oy))||[]){if(a.id>=b.id)continue;let dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy);if(d<.01){dx=1;dy=.5;d=Math.hypot(dx,dy);}const ideal=a.r+b.r+65;if(d<ideal){const f=(ideal-d)*.1;a.vx-=dx/d*f;a.vy-=dy/d*f;b.vx+=dx/d*f;b.vy+=dy/d*f;}}}
   for(const {a,b,weight:w} of bridges.values()){const dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy)||1,ideal=a.r+b.r+90,k=(d-ideal)*Math.min(.045,.008*w);a.vx+=dx/d*k;a.vy+=dy/d*k;b.vx-=dx/d*k;b.vy-=dy/d*k;}
   for(const g of groups){g.vx*=.65;g.vy*=.65;if(!g.pinned){g.x+=Math.max(-12,Math.min(12,g.vx));g.y+=Math.max(-12,Math.min(12,g.vy));}}if(step%40===0)progress(38+Math.round(step/160*22));
  }
  for(const n of nodes){const g=owner.get(n.id),prior=old.get(g.id),angle=hash(n.id)%6283/1000,r=Math.sqrt((hash(n.id+'r')%1000)/1000)*g.r*.75;if(!Number.isFinite(n.x)||!Number.isFinite(n.y)){n.x=g.x+Math.cos(angle)*r;n.y=g.y+Math.sin(angle)*r;}else if(!n.pinned){n.x+=g.x-prior.x;n.y+=g.y-prior.y;}n.vx=n.vy=0;}
  const fixedNeighbors=new Map();for(const e of clusterLinks)for(const [a,b] of [[e.source,e.target],[e.target,e.source]])if(byID.get(b)?.layoutFixed){if(!fixedNeighbors.has(a))fixedNeighbors.set(a,[]);fixedNeighbors.get(a).push(byID.get(b));}
  for(const n of nodes)if(!n.layoutFixed&&!n.pinned){const near=fixedNeighbors.get(n.id)||[];if(near.length){const angle=hash(n.id)%6283/1000;n.x=near.reduce((s,n)=>s+n.x,0)/near.length+Math.cos(angle)*70;n.y=near.reduce((s,n)=>s+n.y,0)/near.length+Math.sin(angle)*70;}}
  const physical=clusterLinks.map(e=>({a:byID.get(e.source),b:byID.get(e.target),weight:e.weight,local:owner.get(e.source)===owner.get(e.target)}));
  for(let step=0;step<(nodes.some(n=>n.layoutFixed)?60:150);step++){
   const cells=new Map();for(const n of nodes){const g=owner.get(n.id),key=Math.floor(n.x/48)+','+Math.floor(n.y/48);if(!cells.has(key))cells.set(key,[]);cells.get(key).push(n);n.vx+=(g.x-n.x)*.009;n.vy+=(g.y-n.y)*.009;}
   for(const n of nodes){const gx=Math.floor(n.x/48),gy=Math.floor(n.y/48);for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(const m of cells.get((gx+dx)+','+(gy+dy))||[]){if(n.id>=m.id)continue;let x=n.x-m.x,y=n.y-m.y,d=Math.hypot(x,y);if(d<.01){const angle=hash(n.id+m.id)%6283/1000;x=Math.cos(angle);y=Math.sin(angle);d=1;}const distance=n.kind==='paper'&&m.kind==='paper'?24:38,f=Math.min(3.5,260/(d*d))+Math.max(0,distance-d)*.12;n.vx+=x/d*f;n.vy+=y/d*f;m.vx-=x/d*f;m.vy-=y/d*f;}}
   for(const {a,b,weight:w,local} of physical){const dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy)||1,ideal=local?55:160,k=(d-ideal)*(local?.014*Math.min(2,w):.0005);a.vx+=dx/d*k;a.vy+=dy/d*k;b.vx-=dx/d*k;b.vy-=dy/d*k;}
   for(const n of nodes){if(n.pinned)continue;n.vx*=.68;n.vy*=.68;n.x+=Math.max(-7,Math.min(7,n.vx));n.y+=Math.max(-7,Math.min(7,n.vy));}if(step%30===0)progress(62+Math.round(step/150*34));
  }
  for(const n of nodes){delete n.vx;delete n.vy;delete n.layoutFixed;}graph.communities=groups.map(g=>{const members=g.members.map(id=>byID.get(id));return{id:g.id,members:g.members,papers:g.papers,x:members.reduce((s,n)=>s+n.x,0)/members.length,y:members.reduce((s,n)=>s+n.y,0)/members.length};});graph.stats.communities=groups.filter(g=>g.papers>1).length;const degree=new Map(nodes.map(n=>[n.id,new Set()]));for(const e of graph.edges){degree.get(e.source)?.add(e.target);degree.get(e.target)?.add(e.source);}for(const n of nodes)n.degree=degree.get(n.id).size;for(const g of graph.communities){const members=g.members.map(id=>byID.get(id));const authorMembers=members.filter(n=>n.kind==='author').sort((a,b)=>(b.members?.length||0)-(a.members?.length||0)||(b.degree||0)-(a.degree||0)||a.id.localeCompare(b.id));g.title=(graph.mode==='authors'?authorMembers[0]?.title:null)||graph.groups.find(t=>t.members.filter(id=>g.members.includes(id)).length>=Math.max(2,g.members.length/2))?.title||(graph.mode==='topics'?members.find(n=>n.title)?.title:label(members,nodes,labels));g.color=members[0]?.color||0;}
  if(graph.mode==='topics'){
   const papers=graph.paperNodes||[],paperIDs=new Set(papers.map(n=>n.id)),communities=graph.communities.map(g=>({...g,members:[...new Set(g.members.flatMap(id=>{const n=byID.get(id);return n.kind==='paper'?[id]:n.members||[];}))].filter(id=>paperIDs.has(id))}));
   uniqueLabels(communities,papers);const titles=new Map(communities.map(g=>[g.id,g.title]));for(const g of graph.communities)g.title=titles.get(g.id)||g.title;
  }return graph;
 }
 return {build,layout,topics,authors,hash,communityGroups,expandMembers};
})();
if(typeof module!=='undefined')module.exports=CiteLensNetworkMap;
