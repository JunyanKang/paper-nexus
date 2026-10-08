const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),C=require('../addon/core.js');
const ctx={CiteLensCore:C};vm.createContext(ctx);for(const f of ['network-core.js','network-map.js'])vm.runInContext(fs.readFileSync(require.resolve('../addon/'+f),'utf8'),ctx);const N=ctx.CiteLensNetworkCore,M=ctx.CiteLensNetworkMap;
const person=(firstName,lastName,extra={})=>({firstName,lastName,...extra}),paper=(id,title,creators)=>({id,title,creators,local:true}),build=nodes=>M.build({nodes,edges:[],references:[],mode:'authors'});
test('ORCID checksum, normalization and hard identity conflicts',()=>{
 const a='0000-0002-1825-0097',b='0000-0001-5109-3700';assert.equal(N.orcid('https://orcid.org/'+a),a);assert.equal(N.orcid(a.slice(0,-1)+'8'),'');assert.equal(N.orcid(b),b);
 const names=[person('Wei','Li',{ORCID:a}),person('Wei','Li',{ORCID:b})],co=[person('Alice','Jones'),person('Robert','Brown')],g=build(names.map((n,i)=>paper('p'+i,'Retinal development',[n,...co])));
 assert.equal(g.nodes.filter(n=>n.title==='Wei Li').length,2);assert.equal(g.nodes.filter(n=>n.orcid).length,2);
});
test('verified ORCID joins spelling variants and abbreviated given names',()=>{
 const oid='0000-0002-1825-0097',g=build([paper('a','Retinal development',[person('Jane','Smith',{orcid:oid})]),paper('b','Cell differentiation',[person('J.','Smith',{ORCID:oid})])]);assert.equal(g.nodes.length,1);assert.equal(g.nodes[0].members.length,2);assert.equal(g.nodes[0].identity,'orcid');
});
test('two supported homonym teams separate, while a researcher changing fields keeps shared-team evidence',()=>{
 const wei=person('Wei','Li'),a=[person('Anne','Green'),person('Roger','Field')],b=[person('Jean','White'),person('Robin','Lake')];
 const papers=[paper('a1','Photoreceptor regeneration',[wei,...a]),paper('a2','Retinal cone development',[wei,...a]),paper('b1','Bacterial antibiotic resistance',[wei,...b]),paper('b2','Biofilm resistance pathways',[wei,...b])],g=build(papers),people=g.nodes.filter(n=>n.title==='Wei Li');assert.equal(people.length,2);assert.ok(people.every(n=>n.members.length===2&&n.identity==='coauthor-evidence'));
 const moved=build([...papers,paper('a3','Novel bacterial method',[wei,...a])]);assert.deepEqual(Array.from(moved.nodes.filter(n=>n.title==='Wei Li'),n=>n.members.length).sort(),[2,3]);
});
test('unknown signatures cannot transitively bridge conflicting verified identities',()=>{
 const a='0000-0002-1825-0097',b='0000-0001-5109-3700',co=[person('Alice','Jones'),person('Robert','Brown')],g=build([paper('a','Retinal development',[person('Wei','Li',{orcid:a}),...co]),paper('b','Retinal development',[person('Wei','Li'),...co]),paper('c','Retinal development',[person('Wei','Li',{orcid:b}),...co])]);assert.equal(g.nodes.filter(n=>n.title==='Wei Li').length,3);assert.ok(g.nodes.filter(n=>n.title==='Wei Li').every(n=>!(n.members.includes('a')&&n.members.includes('c'))));assert.equal(g.nodes.find(n=>n.title==='Wei Li'&&n.members.includes('b')).identity,'unresolved');
});
test('missing identity evidence remains provisional rather than fabricating verified people',()=>{
 const g=build([paper('a','Photoreceptor development',[person('Wei','Li')]),paper('b','Bacterial resistance',[person('Wei','Li')])]);assert.equal(g.nodes[0].identity,'name');assert.equal(g.nodes[0].orcid,'');
});
test('large same-name blocks have bounded evidence comparisons and stable output',()=>{
 const co=[person('Alice','Jones'),person('Robert','Brown')],papers=Array.from({length:500},(_,i)=>paper('p'+i,'Retinal development',[person('Wei','Li'),...co])),a=build(papers),b=build([...papers].reverse());assert.ok(a.identityMetrics.comparisons<=papers.length*3*32);assert.deepEqual(a.nodes.map(n=>[n.id,[...n.members].sort()]),b.nodes.map(n=>[n.id,[...n.members].sort()]));
});
test('ambiguous evidence chains cannot inherit an arbitrary ORCID or depend on input order',()=>{
 const co=[person('Alice','Jones'),person('Robert','Brown')],papers=[paper('a','Retinal development',[person('Wei','Li',{orcid:'0000-0002-1825-0097'}),...co]),paper('b','Retinal development',[person('Wei','Li'),...co]),paper('c','Retinal development',[person('Wei','Li'),...co]),paper('d','Retinal development',[person('Wei','Li',{orcid:'0000-0001-5109-3700'}),...co])];
 const rows=g=>Array.from(g.nodes.filter(n=>n.title==='Wei Li'),n=>[n.identity,Array.from(n.members).sort()]).sort();const a=build(papers),b=build([...papers].reverse());assert.deepEqual(rows(a),rows(b));const unknown=a.nodes.find(n=>n.members.includes('b')&&n.title==='Wei Li');assert.equal(unknown.identity,'unresolved');assert.deepEqual(Array.from(unknown.members).sort(),['b','c']);
});

test('institution and coauthor evidence resolve competing anchors per paper, without chain contamination',()=>{
 const a='0000-0002-1825-0097',b='0000-0001-5109-3700',co=[person('Alice','Jones'),person('Robert','Brown')];
 const who=(affiliation,orcid)=>person('Wei','Li',{affiliation,orcid});
 const papers=[paper('a','Retinal development',[who('University A Department of Retina',a),...co]),paper('b','Retinal development',[who('University B Department of Retina',b),...co]),paper('u1','Retinal development',[who('University A Department of Retina'),...co]),paper('u2','Retinal development',[who('University B Department of Retina'),...co])];
 for(const input of [papers,[...papers].reverse()]){const graph=build(input),people=graph.nodes.filter(n=>n.title==='Wei Li');assert.equal(people.length,2);assert.deepEqual(Array.from(people.find(n=>n.orcid===a).members).sort(),['a','u1']);assert.deepEqual(Array.from(people.find(n=>n.orcid===b).members).sort(),['b','u2']);assert.equal(graph.identityMetrics.resolvedByEvidence,2);}
});
test('new affiliation evidence automatically resolves an earlier tie and is reversible',()=>{
 const co=[person('Alice','Jones'),person('Robert','Brown')],a=person('Wei','Li',{orcid:'0000-0002-1825-0097',affiliation:'Example University Department A'}),b=person('Wei','Li',{orcid:'0000-0001-5109-3700',affiliation:'Example University Department B'}),unknown=person('Wei','Li'),papers=[paper('a','Retinal development',[a,...co]),paper('b','Retinal development',[b,...co]),paper('u','Retinal development',[unknown,...co])];
 assert.equal(build(papers).nodes.filter(n=>n.title==='Wei Li').length,3);
 unknown.affiliation=a.affiliation;assert.deepEqual(Array.from(build(papers).nodes.find(n=>n.orcid===a.orcid).members).sort(),['a','u']);
 unknown.affiliation=b.affiliation;assert.deepEqual(Array.from(build(papers).nodes.find(n=>n.orcid===b.orcid).members).sort(),['b','u']);
});
test('two same-name people on one paper cannot both inherit the same ORCID',()=>{
 const co=[person('Alice','Jones'),person('Robert','Brown')],papers=[paper('a','Retinal development',[person('Wei','Li',{orcid:'0000-0002-1825-0097'}),...co]),paper('u','Retinal development',[person('Wei','Li'),person('Wei','Li'),...co])],graph=build(papers);
 assert.ok(!graph.nodes.find(n=>n.orcid==='0000-0002-1825-0097').members.includes('u'));
 assert.equal(graph.nodes.filter(n=>n.title==='Wei Li'&&n.members.includes('u')).length,2);
});
test('topic similarity alone never links an unanchored signature to an ORCID',()=>{
 const graph=build([paper('a','Retinal cone development and differentiation',[person('Wei','Li',{orcid:'0000-0002-1825-0097'})]),paper('u','Retinal cone development and differentiation',[person('Wei','Li')])]);assert.equal(graph.nodes.filter(n=>n.title==='Wei Li').length,2);
});

test('metadata alignment rejects duplicate same-name authors and conflicting identifiers',()=>{
 const known=person('Jane','Smith',{ORCID:'0000-0002-1825-0097'}),other=person('Jane','Smith',{ORCID:'0000-0001-5109-3700'});assert.equal(N.enrichCreators([known],[other])[0].ORCID,known.ORCID);
 const rows=N.enrichCreators([person('J.','Smith')],[known,person('John','Smith')]);assert.equal(rows[0].ORCID,undefined);assert.equal(rows[0].firstName,'J.');
 const duplicate=N.enrichCreators([person('J.','Smith'),person('Jane','Smith')],[known]);assert.ok(duplicate.every(r=>!r.ORCID));
});

test('multilevel communities preserve sparse boundaries, isolates and input-order stability',()=>{
 const ids=Array.from({length:17},(_,i)=>'p'+String(i).padStart(2,'0')),edges=[];
 for(let group=0;group<2;group++)for(let i=0;i<8;i++)for(let j=i+1;j<8;j++)edges.push({source:ids[group*8+i],target:ids[group*8+j],weight:1});
 edges.push({source:ids[0],target:ids[8],weight:.02});const groups=N.multilevelCommunities(ids,edges);
 assert.deepEqual(JSON.parse(JSON.stringify(groups)),[ids.slice(0,8),ids.slice(8,16),[ids[16]]]);assert.deepEqual(N.multilevelCommunities([...ids].reverse(),[...edges].reverse()),groups);
});
test('multilevel aggregation joins local fragments while each final community stays connected',()=>{
 const ids=Array.from({length:36},(_,i)=>'n'+String(i).padStart(2,'0')),edges=[];
 for(let block=0;block<6;block++)for(let i=0;i<6;i++)for(let j=i+1;j<6;j++)edges.push({source:ids[block*6+i],target:ids[block*6+j],weight:1});
 for(let block=0;block<5;block++)edges.push({source:ids[block*6],target:ids[(block+1)*6],weight:.05});
 const groups=N.multilevelCommunities(ids,edges);assert.equal(new Set(groups.flat()).size,ids.length);
 for(const group of groups){const seen=new Set([group[0]]);for(let pass=0;pass<group.length;pass++)for(const e of edges)if(group.includes(e.source)&&group.includes(e.target)){if(seen.has(e.source))seen.add(e.target);if(seen.has(e.target))seen.add(e.source);}assert.equal(seen.size,group.length);}
 assert.ok(groups.length>=6);
});
test('group affinity uses cross-team evidence without favoring team size or repeated scaling',()=>{
 const groups=['a','b','c'].map(id=>({id,members:[id+'1',id+'2']})),links=groups.map(g=>({source:g.members[0],target:g.members[1],weight:10}));
 links.push({source:'a1',target:'b1',weight:4},{source:'a2',target:'c1',weight:.2});
 const a=M.communityRelations(groups,links,'authors'),b=M.communityRelations(groups,links.map(e=>({...e,weight:e.weight*10})),'authors');
 assert.ok(a[0].affinity>a[1].affinity);assert.ok(a[0].gap<a[1].gap);a.forEach((r,i)=>assert.ok(Math.abs(r.affinity-b[i].affinity)<1e-9));
});
test('author groups with repeated cross-team collaboration sit closer than weakly linked teams',()=>{
 const nodes=[],edges=[];for(let k=0;k<3;k++)for(let i=0;i<8;i++){nodes.push({id:k+':'+i,title:'Team '+k+' Author '+i,kind:'author',members:['p'+k]});for(let j=0;j<i;j++)edges.push({source:k+':'+i,target:k+':'+j,kind:'coauthor',strength:3});}
 edges.push({source:'0:0',target:'1:0',kind:'coauthor',strength:2},{source:'0:1',target:'1:1',kind:'coauthor',strength:2},{source:'0:0',target:'2:0',kind:'coauthor',strength:.1});const g=M.layout({mode:'authors',nodes,edges,groups:[],stats:{}}),group=k=>g.communities.find(c=>c.members.includes(k+':0')),d=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);assert.equal(g.communities.length,3);assert.ok(d(group(0),group(1))<d(group(0),group(2))*.8);
});

test('overview affinity counts distinct shared papers, not author pair multiplicity',()=>{
 const groups=['a','b','c'].map(id=>({id,members:[id+'1',id+'2']})),nodes=groups.flatMap(g=>g.members.map(id=>({id,members:g.id==='a'?['ab1','ab2','ab3','ac1']:g.id==='b'?['ab1','ab2','ab3']:['ac1']}))),relations=M.publicationRelations(groups,nodes),ab=relations.find(e=>e.b.id==='b'),ac=relations.find(e=>e.b.id==='c');
 assert.equal(ab.count,3);assert.equal(ac.count,1);assert.ok(ab.gap<ac.gap);assert.ok(ab.affinity>ac.affinity);
 const duplicateAuthors=groups.map(g=>({...g,members:[...g.members,g.members[0]]}));assert.deepEqual(M.publicationRelations(duplicateAuthors,nodes).map(e=>e.count),relations.map(e=>e.count));
});
test('complete publication membership affects overview even without display bridges',()=>{
 const nodes=[],groups=[];for(let k=0;k<3;k++){const members=[];for(let i=0;i<4;i++){const id=k+':'+i;members.push(id);nodes.push({id,title:id,kind:'author',members:k===0?['ab1','ab2','ab3','ab4','ac']:k===1?['ab1','ab2','ab3','ab4']:['ac']});}groups.push(members);}
 const graph=M.layout({mode:'authors',nodes,edges:[],authorCommunities:groups,authorship:{},stats:{}}),g=k=>graph.communities.find(g=>g.members.includes(k+':0')),d=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
 assert.equal(graph.communityEdges.length,2);assert.deepEqual(Array.from(graph.communityEdges,e=>e.count).sort(),[1,4]);assert.ok(d(g(0),g(1))<d(g(0),g(2))*.9);
});
