const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),C=require('../addon/core.js');const ctx={CiteLensCore:C,CiteLensSemanticCore:require('../addon/semantic-core.js')};vm.createContext(ctx);for(const file of ['network-core.js','topic-lexicon.js','topic-concepts.js','vendor/compromise/compromise-two.js','network-map.js'])vm.runInContext(fs.readFileSync(require.resolve('../addon/'+file),'utf8'),ctx);const M=ctx.CiteLensNetworkMap;
const author=(firstName,lastName)=>({firstName,lastName}),paper=(key,title='Retinal cone photoreceptor development',extra={})=>({id:'1:'+key,title,year:'2020',DOI:'10.1234/'+key,libraryID:1,creators:[author('Anita','Hendrickson')],attachments:[],collections:[],...extra});
const input=(nodes,extra={})=>({nodes,edges:[],references:[],mode:'topics',...extra});
const topic=(nodes,vectors,extra={})=>M.topics(M.build(input(nodes,extra)),{vectors});
test('author nodes represent a person across publication years; edges count distinct coauthored papers',()=>{const nodes=[paper('a','Study A',{year:'2000',creators:[author('Anita','Hendrickson'),author('Jan','Provis')]}),paper('b','Study B',{year:'2024',creators:[author('Jan','Provis'),author('Anita','Hendrickson')]})],g=M.build(input(nodes,{mode:'authors'}));assert.equal(g.nodes.length,2);assert.ok(g.nodes.every(n=>n.kind==='author'&&!n.year&&n.members.length===2));assert.equal(g.edges.length,1);assert.equal(g.edges[0].kind,'coauthor');assert.equal(new Set(g.edges[0].evidence.map(e=>e.paperID)).size,2);assert.ok(!g.edges.some(e=>e.kind==='cites'));});
test('topic overview consists of research entities, with papers only on explicit expansion',()=>{const nodes=[paper('a'),paper('b','Retinal cone photoreceptor maturation'),paper('c','Bacterial biofilm antibiotic resistance')],vectors=[[1,0],[1,0],[0,1]],g=topic(nodes,vectors);assert.equal(g.nodes.length,2);assert.ok(g.nodes.every(n=>n.kind==='topic'&&!n.year&&!n.title.includes('·')));const chosen=g.nodes.find(n=>n.members.length===2),expanded=topic(nodes,vectors,{openEntities:[chosen.id]});assert.equal(expanded.nodes.filter(n=>n.kind==='paper').length,2);assert.equal(expanded.edges.filter(e=>e.kind==='membership').length,2);});
test('topic pair has one aggregated link with traceable distinct paper evidence',()=>{const nodes=[paper('a'),paper('b'),paper('c'),paper('d')],edges=[{source:'1:a',target:'1:c',kind:'cites',evidence:[{attachmentID:1}]},{source:'1:b',target:'1:d',kind:'cites',evidence:[{attachmentID:2}]}],g=topic(nodes,[[1,0],[1,0],[0,1],[0,1]],{edges});assert.equal(g.edges.length,1);assert.equal(g.edges[0].evidence.length,2);assert.ok(g.edges[0].evidence.every(e=>e.sourcePaper&&e.targetPaper));});
test('incremental topic identities and existing positions survive additions',()=>{const nodes=[paper('a'),paper('b')],first=topic(nodes,[[1,0],[1,0]]);M.layout(first);const initial=first.nodes[0],prepared=M.build(input([...nodes,paper('c')],{positions:[{id:initial.id,x:17,y:23}]})),next=M.topics(prepared,{vectors:[[1,0],[1,0],[1,0]]},first.semanticState);M.layout(next);assert.equal(next.nodes[0].id,initial.id);assert.equal(next.nodes[0].x,17);assert.equal(next.nodes[0].y,23);assert.equal(next.incremental.changed,1);});
test('independent author teams form separate centres; article citations cannot create a false social hub',()=>{const nodes=[];for(let g=0;g<3;g++)for(let i=0;i<3;i++)nodes.push(paper(g+'-'+i,'Different study',{creators:[author('Lead','Team'+g),author('Partner','Team'+g)]}));const graph=M.layout(M.build(input(nodes,{mode:'authors',edges:[{source:nodes[0].id,target:nodes[3].id,kind:'cites'}]})));assert.equal(graph.nodes.length,6);assert.equal(graph.edges.length,3);assert.equal(graph.communities.length,3);assert.ok(graph.nodes.every(n=>Number.isFinite(n.x)&&Number.isFinite(n.y)));});
test('bounded paper collection retains selected search matches before projection',()=>{const nodes=Array.from({length:1800},(_,i)=>paper(String(i),'Unique research paper '+i)),g=M.build(input(nodes,{limit:600,selected:'1:1700'}));assert.equal(g.stats.local,600);assert.equal(g.stats.hidden,1200);assert.ok(g.nodes.some(n=>n.id==='1:1700'));});
test('empty, singleton and disconnected topic layouts stay valid without fabricated links',()=>{assert.equal(M.layout(topic([],[])).nodes.length,0);const nodes=Array.from({length:25},(_,i)=>paper('solo'+i,'Different area '+i)),vectors=nodes.map((_,i)=>nodes.map((_,j)=>Number(i===j))),a=M.layout(topic(nodes,vectors)),b=M.layout(topic([...nodes].reverse(),[...vectors].reverse()));assert.equal(a.nodes.length,25);assert.equal(a.edges.length,0);for(const n of a.nodes){const other=b.nodes.find(x=>x.id===n.id);assert.equal(n.x,other.x);assert.equal(n.y,other.y);}});
test('author-contaminated bibliographies are cleaned before topic naming',()=>{const raw='Sjöstrand, J., Popovic, Z., Conradi, N., 1999Fb. Retinal ganglion cell displacement within the fovea. Vision Res. 39, 100–110.',g=topic([paper('a','Retinal ganglion cell displacement'),paper('b','Sjöstrand, J., Popovic, Z., Conradi, N., 1999Fb',{raw})],[[1,0],[1,0]]);assert.doesNotMatch(g.nodes[0].title,/sjöstrand|popovic|conradi/i);assert.ok(!g.nodes[0].title.includes('·'));});

test('local topic names retain scientific noun phrases instead of title result clauses',()=>{for(const [title,expected] of [['Microbial-type rhodopsin restores visual responses','Microbial-type rhodopsin'],['Human chorioretinal layer thickness measured by optical coherence tomography','Human chorioretinal layer thickness'],['Interglial cell gap junctions increase during development','Interglial cell gap junctions'],['Retinal ganglion cells in human albinism','Retinal ganglion cells']]){const g=topic([paper('a',title)],[[1,0]]);assert.doesNotMatch(g.nodes[0].title,/restores|measured|increase|during/i);assert.equal(g.nodes[0].title,expected);}});

test('shared generic single words do not displace supported research phrases',()=>{const g=topic([paper('a','Retinal ganglion cells in monkey retina'),paper('b','Retinal ganglion cells in human retina'),paper('c','Blood flow in the retina')],[[1,0],[1,0],[1,0]]);assert.equal(g.nodes[0].title,'Retinal ganglion cells');});

test('related subtopics form a second semantic community without hiding their topic identities',()=>{
 const nodes=[paper('a','Retinal cone differentiation'),paper('b','Retinal rod differentiation'),paper('c','Bacterial biofilm resistance')];
 // Related title-only papers remain separate at .58; centroids relate them at .52.
 const vectors=[[1,0,0],[.55,Math.sqrt(1-.55**2),0],[0,0,1]],g=M.layout(topic(nodes,vectors));
 assert.equal(g.nodes.length,3);assert.ok(g.nodes.every(n=>n.kind==='topic'));
 const a=g.nodes.find(n=>n.members.includes('1:a')),b=g.nodes.find(n=>n.members.includes('1:b')),c=g.nodes.find(n=>n.members.includes('1:c'));
 assert.equal(a.community,b.community);assert.notEqual(a.community,c.community);
 assert.equal(g.edges.length,1);assert.equal(g.edges[0].evidence[0].kind,'semantic-centroid');
 assert.ok(Math.hypot(a.x-b.x,a.y-b.y)<Math.hypot(a.x-c.x,a.y-c.y));
 const again=M.topics(M.build(input(nodes)),{vectors},g.semanticState);assert.equal(again.hierarchyIncremental.comparisons,0);
});
test('same authors or citation traffic never force unrelated scientific topics into one community',()=>{
 const nodes=[paper('a','Retinal cone differentiation'),paper('b','Bacterial biofilm resistance')],edges=[{source:'1:a',target:'1:b',kind:'author',evidence:[{authorKey:'anita'}]},{source:'1:a',target:'1:b',kind:'cites',evidence:[{attachmentID:8}]}];
 const g=M.layout(topic(nodes,[[1,0],[0,1]],{edges}));assert.equal(g.edges.length,1);assert.ok(g.edges[0].evidence.every(e=>e.kind==='cites'));assert.notEqual(g.nodes[0].community,g.nodes[1].community);
});
test('repeat coauthors cluster into teams despite a cross-team collaboration',()=>{
 const nodes=[];for(let team=0;team<3;team++)for(let p=0;p<5;p++)nodes.push(paper(`${team}-${p}`,'Research',{creators:Array.from({length:5},(_,i)=>author('Person'+i,'Team'+team))}));
 nodes.push(paper('bridge','Collaboration',{creators:[author('Person0','Team0'),author('Person0','Team1')]}));
 const g=M.layout(M.build(input(nodes,{mode:'authors'})));assert.equal(g.nodes.length,15);assert.equal(g.communities.length,3);
 for(let team=0;team<3;team++){const members=g.nodes.filter(n=>n.title.endsWith('Team'+team));assert.equal(new Set(members.map(n=>n.community)).size,1);}
 assert.ok(g.nodes.every(n=>n.kind==='author'&&!n.year));
});
test('legacy keyword assignments cannot reintroduce dotted topic names',()=>{
 const g=M.topics(M.build(input([paper('a','Uveal melanoma models')])),{vectors:[[1,0]],assignments:[{id:'1:a',topic:'uveal · melanoma · models'}]});assert.equal(g.nodes[0].title,'Uveal melanoma models');
});
test('large consortia remain bounded while repeated collaborators retain real paper evidence',()=>{
 const creators=Array.from({length:240},(_,i)=>author('Person'+i,'Consortium')),nodes=[paper('large','Collaborative atlas',{creators})];
 for(let i=0;i<4;i++)nodes.push(paper('team'+i,'Team study',{creators:creators.slice(0,3)}));
 const g=M.build(input(nodes,{mode:'authors'}));assert.equal(g.nodes.length,240);assert.ok(g.edges.length<=240*12);assert.ok(g.nodes.every(n=>n.coauthorCount===239));
 const leader=g.nodes.find(n=>n.title==='Person0 Consortium'),peer=g.nodes.find(n=>n.title==='Person1 Consortium'),e=g.edges.find(e=>[e.source,e.target].includes(leader.id)&&[e.source,e.target].includes(peer.id));assert.equal(e.evidence.length,5);assert.ok(e.strength>2);assert.ok(g.edges.every(e=>e.evidence.length>=1));
});
test('legacy expansion input cannot add external nodes; local citation edges remain available',()=>{
 const a=paper('a'),b=paper('b'),extra={expanded:[a.id],externalLimit:9999,references:[[a.id,[{status:'missing',ref:{title:'External study',creators:[author('Foreign','Researcher')]}}]]],edges:[{source:a.id,target:b.id,kind:'cites',evidence:[{pageIndex:2}]}]};
 const g=M.build(input([a,b],extra));assert.equal(g.nodes.length,2);assert.ok(g.nodes.every(n=>n.local));assert.equal(g.edges.length,1);assert.equal(g.edges[0].kind,'cites');assert.ok(!('external' in g.stats));
 const authors=M.build(input([a,b],{...extra,mode:'authors'}));assert.equal(authors.nodes.length,1);assert.ok(authors.nodes.every(n=>!n.title.includes('Foreign')));
});

test('scientific labels reject conjunction fragments, generic method labels and orphan modifiers',()=>{
 for(const [title,forbidden] of [
  ["A diet high in fat and meat but low in dietary fibre increases the genotoxic potential of 'faecal water'.",/meat but low|but|increases/],
  ['Statin use after diagnosis of breast cancer and survival: a population-based cohort study.',/diagnosis|cohort|population-based/],
  ['Methylmercury: A Potential Environmental Risk Factor Contributing to Epileptogenesis',/potential|contributing|risk factor/],
  ['Differences among total and in vitro digestible phosphorus content of plant foods and beverages.',/^vitro/]
 ]){const graph=topic([paper('a',title)],[[1,0]]);assert.doesNotMatch(graph.groups[0].title,forbidden);assert.notEqual(graph.groups[0].title,'A new perspective');}
});
test('medical phrases and acronyms remain intact while author text does not become a topic',()=>{
 assert.equal(topic([paper('a','Flatulence--causes, relation to diet and remedies.')],[[1,0]]).groups[0].title,'Flatulence');
 const g=topic([paper('a','Hendrickson retinal development')],[[1,0]]);assert.doesNotMatch(g.groups[0].title,/Hendrickson/);
 assert.match(topic([paper('a','DHEA, DHEAS and PCOS.')],[[1,0]]).groups[0].title,/DHEA|PCOS/i);
 assert.match(topic([paper('a','Parkinson disease',{creators:[author('James','Parkinson')]})],[[1,0]]).groups[0].title,/Parkinson disease/);
});
test('uninformative titles use bounded abstract evidence without inventing an unsupported topic',()=>{
 assert.equal(topic([paper('a','A new perspective',{abstract:'Retinal ganglion cell regeneration restores vision.'})],[[1,0]]).groups[0].title,'Retinal ganglion cell regeneration');
 assert.equal(topic([paper('a','A new perspective')],[[1,0]]).groups[0].title,'A new perspective');
});

test('concept identities preserve narrower meanings and normalize real synonyms',()=>{
 const K=ctx.CiteLensTopicConcepts;
 assert.equal(K.lookup('heart attack')[0].id,K.lookup('myocardial infarction')[0].id);
 assert.equal(K.lookup('cardiac surgery')[0].title,'Heart Surgery');
 assert.notEqual(K.lookup('cancer')[0].id,K.lookup('neoplasms')[0].id);
});
test('source contexts distinguish scientific concepts from population and publishing words',()=>{
 const cases=[
  ['Protocols for neural cell culture: Fourth edition',{},/neural cell culture/i],
  ['The neuroscience of cancer',{},/neuroscience of cancer/i],
  ['A toolkit for interpreting metabolomics data',{},/metabolomics data interpretation/i],
  ['Microglial hemoxygenase-1 deletion reduces inflammation in the retina of old mice with tauopathy',{abstract:'Microglia and tauopathy-induced neuroinflammation were examined in the retina. Reduction of microglial HO-1 could prevent tauopathy-induced neuroinflammation.'},/tauopathy|microglia|neuroinflammation/i],
 ];
 for(const [title,extra,wanted] of cases){const g=topic([paper('a',title,extra)],[[1,0]]);assert.match(g.nodes[0].title,wanted);assert.doesNotMatch(g.nodes[0].title,/^(?:old mice|edition|cancer|retinaldehyde)$/i);}
});
test('book-chapter context feeds the same input to naming and embeddings without editing the original title',()=>{
 const p=paper('a','Data analysis',{type:'bookSection',bookTitle:'ggplot2'});assert.equal(C.researchRecord(p).title,'ggplot2 data analysis');assert.equal(p.title,'Data analysis');
 const g=topic([p],[[1,0]]);assert.match(g.nodes[0].title,/ggplot2/i);assert.notEqual(g.nodes[0].title.toLowerCase(),'data analysis');
});
test('retinal adjective cannot create a retinaldehyde chemical relation',()=>{
 const g=topic([paper('a','Retinal microglia and inflammatory responses')],[[1,0]]);
 assert.ok(g.nodes[0].namingEvidence.every(e=>e.conceptID!=='M0018957'&&!e.anchors.includes('M0018957')));
});
test('sparse concept links join true synonyms only with independent semantic support',()=>{
 const nodes=[paper('a','Myocardial infarction and cardiac repair'),paper('b','Heart attack and cardiac regeneration'),paper('c','Heart attack in a fictional memoir')],vectors=[[1,0,0],[.48,Math.sqrt(1-.48**2),0],[0,0,1]],g=topic(nodes,vectors);
 assert.ok(g.groups.some(x=>x.members.includes('1:a')&&x.members.includes('1:b')));assert.ok(!g.groups.some(x=>x.members.includes('1:a')&&x.members.includes('1:c')));
 assert.ok(g.paperEdges.some(e=>e.evidence?.some(v=>v.conceptID==='M0014340')));
});
