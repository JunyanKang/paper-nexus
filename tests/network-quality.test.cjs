const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),C=require('../addon/core.js'),SC=require('../addon/semantic-core.js');
const ctx={CiteLensCore:C,CiteLensSemanticCore:SC};vm.createContext(ctx);for(const f of ['network-core.js','topic-lexicon.js','vendor/compromise/compromise-two.js','network-map.js'])vm.runInContext(fs.readFileSync(require.resolve('../addon/'+f),'utf8'),ctx);const N=ctx.CiteLensNetworkCore,M=ctx.CiteLensNetworkMap;
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
test('representative evidence covers central content without alphabetical outlier bias',()=>{
 const nodes=Array.from({length:12},(_,i)=>({id:'p'+i,title:i===0?'A peripheral report':'Retinal development'})),vectors=nodes.map((_,i)=>i===0?[0,1]:[1,0]);const ids=SC.representatives(nodes,vectors,8);assert.equal(ids.length,8);assert.notEqual(ids[0],'p0');assert.equal(new Set(ids).size,8);assert.deepEqual(ids,SC.representatives([...nodes].reverse(),[...vectors].reverse(),8));
});
test('topic contrast prefers a distinguishing biological phrase over generic recurring methods',()=>{
 const groups=[['Single cell sequencing of retinal ganglion cells','Single cell sequencing during retinal ganglion cell development'],['Single cell sequencing of immune cells','Single cell sequencing during immune cell activation'],['Single cell sequencing of cancer cells','Single cell sequencing of tumor cell invasion']],nodes=groups.flatMap((g,i)=>g.map((title,j)=>paper(i+':'+j,title,[]))),vectors=nodes.map((_,i)=>[0,1,2].map(k=>Number(k===Math.floor(i/2))));const g=M.topics(M.build({nodes,edges:[],references:[],mode:'topics'}),{vectors});assert.ok(g.nodes.every(n=>!/^Single cell sequencing$/i.test(n.title)));assert.equal(new Set(g.nodes.map(n=>n.title)).size,3);assert.ok(g.groups.every(n=>n.representatives.length<=8));
});
test('topic labels do not concatenate fragments across title punctuation',()=>{
 const nodes=[paper('a','Primate fovea. Structure, function and development',[])],g=M.topics(M.build({nodes,edges:[],references:[],mode:'topics'}),{vectors:[[1,0]]});assert.equal(g.nodes[0].title,'Primate fovea');
});

test('shared disease or compound names outrank isolated generic phrases',()=>{
 const titles=['Calcified neurocysticercosis among patients with primary headache','Neurocysticercosis and oncogenesis','Neurocysticercosis: an enigmatic disease','Cognitive changes in neurocysticercosis'],nodes=titles.map((title,i)=>paper('n'+i,title,[])),graph=M.topics(M.build({nodes,edges:[],references:[],mode:'topics'}),{vectors:nodes.map(()=>[1,0])});assert.match(graph.nodes[0].title,/neurocysticercosis/i);assert.doesNotMatch(graph.nodes[0].title,/enigmatic/i);
 const more=['Curcumin for osteoarthritis management','Curcumin and obesity','Curcumin effects on cognitive disorders'].map((title,i)=>paper('c'+i,title,[])),g=M.topics(M.build({nodes:more,edges:[],references:[],mode:'topics'}),{vectors:more.map(()=>[1,0])});assert.match(g.nodes[0].title,/curcumin/i);
});
test('scientific possessives stay readable in extracted topic phrases',()=>{const nodes=[paper('p1',"Cow's milk protein allergy",[]),paper('p2',"Cow's milk protein intolerance",[])],g=M.topics(M.build({nodes,edges:[],references:[],mode:'topics'}),{vectors:nodes.map(()=>[1,0])});assert.match(g.nodes[0].title,/Cow's milk protein/i);assert.doesNotMatch(g.nodes[0].title,/Cow s/i);});

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
