const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),C=require('../addon/core.js');const ctx={CiteLensCore:C};vm.createContext(ctx);for(const file of ['network-core.js','network-map.js'])vm.runInContext(fs.readFileSync(require.resolve('../addon/'+file),'utf8'),ctx);const M=ctx.CiteLensNetworkMap;
const author=(firstName,lastName)=>({firstName,lastName}),paper=(key,title='Retinal cone photoreceptor development',extra={})=>({id:'1:'+key,title,year:'2020',DOI:'10.1234/'+key,libraryID:1,creators:[author('Anita','Hendrickson')],attachments:[],collections:[],...extra});
const input=(nodes,extra={})=>({nodes,edges:[],references:[],mode:'authors',...extra});
test('author nodes represent a person across publication years; edges count distinct coauthored papers',()=>{const nodes=[paper('a','Study A',{year:'2000',creators:[author('Anita','Hendrickson'),author('Jan','Provis')]}),paper('b','Study B',{year:'2024',creators:[author('Jan','Provis'),author('Anita','Hendrickson')]})],g=M.build(input(nodes,{mode:'authors'}));assert.equal(g.nodes.length,2);assert.ok(g.nodes.every(n=>n.kind==='author'&&!n.year&&n.members.length===2));assert.equal(g.edges.length,1);assert.equal(g.edges[0].kind,'coauthor');assert.equal(new Set(g.edges[0].evidence.map(e=>e.paperID)).size,2);assert.ok(!g.edges.some(e=>e.kind==='cites'));});
test('independent author teams form separate centres; article citations cannot create a false social hub',()=>{const nodes=[];for(let g=0;g<3;g++)for(let i=0;i<3;i++)nodes.push(paper(g+'-'+i,'Different study',{creators:[author('Lead','Team'+g),author('Partner','Team'+g)]}));const graph=M.layout(M.build(input(nodes,{mode:'authors',edges:[{source:nodes[0].id,target:nodes[3].id,kind:'cites'}]})));assert.equal(graph.nodes.length,6);assert.equal(graph.edges.length,3);assert.equal(graph.communities.length,3);assert.ok(graph.nodes.every(n=>Number.isFinite(n.x)&&Number.isFinite(n.y)));});
test('repeat coauthors cluster into teams despite a cross-team collaboration',()=>{
 const nodes=[];for(let team=0;team<3;team++)for(let p=0;p<5;p++)nodes.push(paper(`${team}-${p}`,'Research',{creators:Array.from({length:5},(_,i)=>author('Person'+i,'Team'+team))}));
 nodes.push(paper('bridge','Collaboration',{creators:[author('Person0','Team0'),author('Person0','Team1')]}));
 const g=M.layout(M.build(input(nodes,{mode:'authors'})));assert.equal(g.nodes.length,15);assert.equal(g.communities.length,3);
 for(let team=0;team<3;team++){const members=g.nodes.filter(n=>n.title.endsWith('Team'+team));assert.equal(new Set(members.map(n=>n.community)).size,1);}
 assert.ok(g.nodes.every(n=>n.kind==='author'&&!n.year));
});
test('large consortia remain bounded while repeated collaborators retain real paper evidence',()=>{
 const creators=Array.from({length:240},(_,i)=>author('Person'+i,'Consortium')),nodes=[paper('large','Collaborative atlas',{creators})];
 for(let i=0;i<4;i++)nodes.push(paper('team'+i,'Team study',{creators:creators.slice(0,3)}));
 const g=M.build(input(nodes,{mode:'authors'}));assert.equal(g.nodes.length,240);assert.ok(g.edges.length<=240*12);assert.ok(g.nodes.every(n=>n.coauthorCount===239));
 const leader=g.nodes.find(n=>n.title==='Person0 Consortium'),peer=g.nodes.find(n=>n.title==='Person1 Consortium'),e=g.edges.find(e=>[e.source,e.target].includes(leader.id)&&[e.source,e.target].includes(peer.id));assert.equal(e.evidence.length,5);assert.ok(e.strength>2);assert.ok(g.edges.every(e=>e.evidence.length>=1));
});
test('author communities use all authorships independently of the rendered edge budget',()=>{
 const nodes=[];for(let team=0;team<3;team++)for(let p=0;p<4;p++)nodes.push(paper(`incidence-${team}-${p}`,'Research',{creators:Array.from({length:18},(_,i)=>author('Researcher'+i,'Team'+team))}));
 nodes.push(paper('joint','Joint paper',{creators:[author('Researcher0','Team0'),author('Researcher0','Team1')]}));
 const graph=M.build(input(nodes,{mode:'authors'}));assert.equal(graph.authorship.projection,'author-paper');assert.equal(graph.authorship.contributions,218);assert.equal(new Set(graph.authorCommunities.flat()).size,54);
 const sparse={...graph,nodes:graph.nodes.map(n=>({...n})),edges:graph.edges.slice(0,2)},dense=M.layout(graph),small=M.layout(sparse),members=g=>g.communities.map(c=>[...c.members].sort().join('|')).sort();assert.deepEqual(members(dense),members(small));assert.equal(dense.communities.length,3);
});

test('topic mode is explicitly unavailable',()=>assert.throws(()=>M.build(input([],{mode:'topics'})),/开发中/));
test('empty and solo author graphs do not invent connections',()=>{assert.equal(M.layout(M.build(input([]))).nodes.length,0);const g=M.layout(M.build(input([paper('solo')])));assert.equal(g.nodes.length,1);assert.equal(g.edges.length,0);assert.ok(Number.isFinite(g.nodes[0].x));});
