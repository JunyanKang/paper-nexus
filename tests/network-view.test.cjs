const {test}=require('node:test'),assert=require('node:assert/strict'),V=require('../addon/network-view.js');
test('labels follow entity identity in either mode; author labels never acquire publication years',()=>{const node={title:'Retinal photoreceptor differentiation',author:'Masuda',creators:[{lastName:'Brat'}],year:2015};assert.equal(V.nodeLabel(node,'topics'),node.title);assert.equal(V.nodeLabel({...node,author:'Other',creators:[{lastName:'Different'}]},'topics'),node.title);assert.equal(V.nodeLabel({kind:'author',title:'Anita Hendrickson',year:2015},'authors'),'Anita Hendrickson');assert.equal(V.nodeLabel({kind:'topic',title:'Retinal development'},'authors'),'Retinal development');assert.equal(V.nodeLabel({...node,title:''},'topics'),'');assert.ok(V.nodeLabel({...node,title:'Long scientific title '.repeat(10)},'topics').length<=52);});
test('pinch keeps the cursor on the same world coordinate throughout smoothing',()=>{const camera={x:12,y:34,k:.5},x=280,y=170,wx=(x-camera.x)/camera.k,wy=(y-camera.y)/camera.k,target=V.zoom(camera,1.7,x,y);let n=0;while(V.step(camera,target,16)){assert.ok(Math.abs((x-camera.x)/camera.k-wx)<1e-8);assert.ok(Math.abs((y-camera.y)/camera.k-wy)<1e-8);assert.ok(++n<100);}assert.equal(camera.k,.85);});
test('precision trackpad pans on both axes, pinch and discrete mouse wheel zoom',()=>{assert.deepEqual(V.wheel({deltaMode:0,deltaX:12.5,deltaY:-3.2}),{x:-12.5,y:3.2,zoom:1});assert.ok(V.wheel({deltaMode:0,deltaX:0,deltaY:-3.2,ctrlKey:true}).zoom>1);assert.ok(V.wheel({deltaMode:1,deltaX:0,deltaY:3}).zoom<1);assert.ok(V.wheel({deltaMode:0,deltaX:0,deltaY:120}).zoom<1);});
test('large event spikes and reversed gestures remain bounded, reduced motion settles immediately',()=>{const c={x:0,y:0,k:1};let t=V.zoom(c,1e20,50,50);assert.equal(t.k,5);t=V.zoom(c,1e-20,50,50);assert.equal(t.k,.06);assert.equal(V.step(c,t,100,true),false);assert.deepEqual(c,t);});
test('dense overview retains every paper location and focused neighborhoods retain identity',()=>{const papers=Array.from({length:100},(_,i)=>({id:'p'+i,kind:'paper',group:'g',x:i,y:i})),hub={id:'g',kind:'author',members:papers.map(p=>p.id)},model={nodes:[...papers,hub],edges:papers.map(p=>({source:'g',target:p.id,kind:'author'})),matches:[]},index=V.index(model);const overview=V.scene(model,index,{k:.3});assert.equal(overview.nodes.length,101);const focus=V.scene(model,index,{k:.3,selected:'g',focused:true});assert.equal(focus.nodes.length,101);model.matches=['p99'];assert.ok(V.scene(model,index,{k:.3}).nodes.some(n=>n.id==='p99'));});
test('screen label grid prevents overlap and preserves priority labels',()=>{const candidates=[{id:'a',priority:1,rect:{x:10,y:10,w:90,h:18}},{id:'b',priority:9,rect:{x:20,y:10,w:90,h:18}},{id:'c',priority:2,rect:{x:10,y:40,w:90,h:18}}];assert.deepEqual(V.labels(candidates,300,300).map(n=>n.id),['b','c']);});

test('one visual line merges relation types and reciprocal citations without counting repeated evidence',()=>{const nodes=[{id:'a',kind:'paper'},{id:'b',kind:'paper'}],edges=[{source:'a',target:'b',kind:'cites',evidence:[{pageIndex:1},{pageIndex:2}]},{source:'a',target:'b',kind:'cites',evidence:[{pageIndex:3}]},{source:'b',target:'a',kind:'cites'},{source:'a',target:'b',kind:'similarity',evidence:[{score:.8}]},{source:'a',target:'b',kind:'author',evidence:[{authorKey:'A'},{authorKey:'B'},{authorKey:'A'}]}],model={nodes,edges},scene=V.scene(model,V.index(model));assert.equal(scene.edges.length,1);const edge=scene.edges[0];assert.equal(edge.count,5);assert.deepEqual(edge.directions,['forward','backward']);assert.deepEqual(edge.kinds,['author','cites','similarity']);assert.ok(V.lineWidth(5)>V.lineWidth(1));assert.equal(V.lineWidth(10000),3.2);});
test('distinct node pairs each keep one line and duplicate layout hints do not thicken it',()=>{const nodes=['a','b','c'].map(id=>({id,kind:'paper'})),edges=[{source:'a',target:'b',kind:'topic'},{source:'b',target:'a',kind:'topic'},{source:'a',target:'c',kind:'topic'}],model={nodes,edges},scene=V.scene(model,V.index(model));assert.equal(scene.edges.length,2);assert.ok(scene.edges.every(e=>e.count===1));});
test('search highlights matches and direct neighbours even above forty connections; no-match fades everything',()=>{
 const nodes=Array.from({length:100},(_,i)=>({id:'n'+i,kind:'author'})),model={nodes,edges:nodes.slice(1,65).map(n=>({source:'n0',target:n.id,kind:'coauthor',evidence:[{paperID:n.id}]})),searchActive:true,matches:['n0']},index=V.index(model);
 const e=V.emphasis(model,index);assert.equal(e.near.size,65);assert.ok(!e.near.has('n90'));model.matches=[];assert.equal(V.emphasis(model,index).near.size,0);model.searchActive=false;assert.equal(V.emphasis(model,index).near,null);assert.equal(V.emphasis(model,index,{selected:'n0'}).near.size,65);
 const first=V.scene(model,index),second=V.scene(model,index,{selected:'n1'});assert.equal(first.edges,second.edges);
});
test('overview shows one stable representative per community; entering and leaving never exposes hover labels from hidden members',()=>{
 const nodes=[{id:'a',kind:'author',title:'Anita',members:['p1','p2'],x:0,y:0},{id:'b',kind:'author',title:'Jan',members:['p1'],x:10,y:0},{id:'c',kind:'author',title:'Other',members:['p3'],x:100,y:0}],model={nodes,edges:[{source:'a',target:'b',kind:'coauthor',evidence:[{paperID:'p1'}]}],communities:[{id:'community:a',members:['a','b'],x:5,y:0,color:0},{id:'community:c',members:['c'],x:100,y:0,color:1}],matches:['b']},i=V.index(model);
 const overview=V.scene(model,i);assert.equal(overview.nodes.length,2);assert.equal(overview.nodes[0].kind,'community');assert.equal(overview.nodes[0].title,'Anita');assert.deepEqual(overview.matches,['community:a']);assert.ok(!overview.index.byID.has('b'));
 const detail=V.scene(model,i,{community:'community:a'});assert.deepEqual(detail.nodes.map(n=>n.id),['a','b']);assert.equal(detail.edges.length,1);assert.deepEqual(detail.matches,['b']);assert.equal(V.scene(model,i).nodes,overview.nodes);
});
test('topic search can retain multiple matching groups without lighting unrelated neighbours',()=>{const model={searchActive:true,searchGroups:true,matches:['a','c']},i={adj:new Map([['a',new Set(['a','b'])],['c',new Set(['c','d'])]])};assert.deepEqual([...V.emphasis(model,i).near].sort(),['a','c']);});

test('pointer attraction stays local, releases to rest and preserves graph coordinates',()=>{
 const nodes=[{id:'a',x:0,y:0},{id:'b',x:36,y:0}],camera={x:0,y:0,k:1},saved=JSON.stringify(nodes);
 assert.equal(V.nearest(nodes,{x:18,y:0},camera,'a').id,'a');
 assert.equal(V.nearest(nodes,{x:35,y:0},camera,'a').id,'b');
 assert.equal(V.nearest(nodes,{x:120,y:0},camera,'a'),null);
 const offsets=new Map();for(let i=0;i<120;i++)V.magnetic(offsets,new Map([['a',{x:8,y:2}]]),16);
 assert.ok(Math.abs(offsets.get('a').x-8)<.05);let running=true;
 for(let i=0;i<180;i++)running=V.magnetic(offsets,new Map(),16);
 assert.equal(running,false);assert.equal(offsets.size,0);assert.equal(JSON.stringify(nodes),saved);
 V.magnetic(offsets,new Map([['a',{x:8,y:2}]]),16,true);assert.equal(offsets.size,0);
 let alpha=1;for(let i=0;i<100;i++)alpha=V.opacity(alpha,.32,16);assert.equal(alpha,.32);
});

test('nearby labels use alternative placements before hiding text',()=>{
 const a={id:'a',priority:2,rect:{x:120,y:120,w:70,h:19},p:{x:155,y:110},r:5},b={id:'b',priority:1,rect:{x:140,y:122,w:70,h:19},p:{x:175,y:112},r:5};
 const labels=V.labels([a,b],500,400);assert.equal(labels.length,2);assert.ok(labels.some(x=>x.dx||x.dy));
});
test('overview group previews retain real members and edges without exposing individual hit targets',()=>{
 const nodes=Array.from({length:40},(_,i)=>({id:'a'+i,kind:'author',title:'Person '+i,x:i,y:i%4,degree:40-i,members:['p']})),edges=nodes.slice(1).map(n=>({source:'a0',target:n.id,kind:'coauthor',evidence:[{paperID:'p'}]})),model={mode:'authors',nodes,edges,communities:[{id:'community:a',title:'Person 0',members:nodes.map(n=>n.id),x:20,y:2,color:0}]},scene=V.scene(model,V.index(model));
 assert.equal(scene.nodes.length,1);assert.equal(scene.contextNodes.length,24);assert.ok(scene.contextEdges.length>0);assert.ok(scene.contextEdges.every(e=>edges.includes(e)));assert.ok(!scene.index.byID.has('a1'));assert.equal(scene.contextOwner.get('a1'),'community:a');
});
test('source evidence groups passages by paper without repeating titles or inventing text',()=>{
 const named=[{paperID:'p1',source:{text:'First original passage.'}},{paperID:'p1',source:{text:'Second original passage.'}},{paperID:'p1',source:{text:'First original passage.'}},{paperID:'p2',source:{text:'Another source.'}}];
 const expected=[{paperID:'p1',quotes:['First original passage.','Second original passage.']},{paperID:'p2',quotes:['Another source.']}];assert.deepEqual(V.evidenceGroups(named),expected);
 const shared=[{kind:'shared-source',sources:named.map(x=>({paperID:x.paperID,quote:x.source.text}))}];assert.deepEqual(V.evidenceGroups(shared),expected);assert.deepEqual(V.evidenceGroups([{paperID:'p',question:'Generated explanation is not an original passage'}]),[]);
});

test('contextual relationship descriptions remain separate from source quotations and same-question evidence',()=>{
 const evidence=[{kind:'research-link',relation:'related-context',question:' Shared therapeutic context ',sources:[{paperID:'p',quote:'Original outcome.'}]},{kind:'research-link',relation:'same-question',question:'A narrower scientific question'},{kind:'shared-source',question:'Not an inferred relationship'},{kind:'research-link',relation:'related-context',question:'Shared therapeutic context'}];
 assert.deepEqual(V.contextDescriptions(evidence),['Shared therapeutic context']);assert.deepEqual(V.evidenceGroups(evidence),[{paperID:'p',quotes:['Original outcome.']}]);assert.deepEqual(V.contextDescriptions([{kind:'research-link',relation:'related-context',question:'x'.repeat(301)}]),[]);
});

test('scientific labels wrap within measured bounds and preserve full short phrases',()=>{
 const measure=s=>Array.from(s).length*7,title='Epigenetic and SIRT1 control of ferroptosis in sepsis-associated AKI',lines=V.textLines(title,measure,245,3);assert.equal(lines.length,3);assert.equal(lines.join(' '),title);assert.ok(lines.every(s=>measure(s)<=245));
 const clipped=V.textLines(title,measure,126,2);assert.equal(clipped.length,2);assert.ok(clipped[1].endsWith('…'));assert.ok(clipped.every(s=>measure(s)<=126));
 const unicode=V.textLines('小胶质细胞与神经回路重塑',measure,49,3);assert.equal(unicode.join(''),'小胶质细胞与神经回路重塑');assert.ok(unicode.every(s=>measure(s)<=49));
 assert.deepEqual(V.textLines('',measure,40,2),[]);
});

test('hover attenuation is a smooth local circle and leaves distant nodes untouched',()=>{
 const c={x:100,y:150},r=200,at=d=>V.hoverOpacity({x:100+d,y:150},c,r);
 assert.equal(at(0),.18);assert.ok(at(50)<at(100)&&at(100)<at(150));assert.equal(at(200),1);assert.equal(at(2000),1);assert.equal(V.hoverOpacity({x:100,y:250},c,r),at(100));assert.equal(V.hoverOpacity({x:0,y:0},null,r),1);assert.ok(at(200)-at(199)<.001);
});
test('overview lines retain full distinct-publication counts independently of sparsified author links',()=>{
 const model={mode:'authors',nodes:[{id:'a',kind:'author',title:'A',members:['p1','p2']},{id:'b',kind:'author',title:'B',members:['p1','p2']}],edges:[],communities:[{id:'ga',members:['a']},{id:'gb',members:['b']}],communityEdges:[{source:'ga',target:'gb',evidence:[{paperID:'p1'},{paperID:'p2'}]}]};
 const s=V.scene(model,V.index(model));assert.equal(s.edges.length,1);assert.equal(s.edges[0].count,2);assert.equal(s.edges[0].source,'a');assert.equal(s.edges[0].target,'b');assert.ok(V.lineWidth(4)>V.lineWidth(1));
});

test('paper sorting toggles numeric year, impact and title with missing values always last',()=>{
 const papers=[{id:'a',title:'Zebra',year:'2024'},{id:'b',title:'alpha',year:'2020'},{id:'c',title:'Beta',year:''}],metrics=new Map([['a',3.5],['b',20],['c',null]]);
 assert.deepEqual(V.sortPapers(papers,'impact','desc',metrics).map(p=>p.id),['b','a','c']);assert.deepEqual(V.sortPapers(papers,'impact','asc',metrics).map(p=>p.id),['a','b','c']);assert.deepEqual(V.sortPapers(papers,'year','asc').map(p=>p.id),['b','a','c']);assert.deepEqual(V.sortPapers(papers,'year','desc').map(p=>p.id),['a','b','c']);assert.deepEqual(V.sortPapers(papers,'title','asc').map(p=>p.id),['b','c','a']);assert.deepEqual(V.sortPapers(papers,'title','desc').map(p=>p.id),['a','c','b']);assert.deepEqual(papers.map(p=>p.id),['a','b','c']);
});

test('overview member names reveal only when zoom and spacing permit, with hysteresis and a budget',()=>{const nodes=Array.from({length:150},(_,i)=>({id:'a'+i,x:(i%15)*60,y:Math.floor(i/15)*60})),view={w:2000,h:2000};assert.equal(V.revealMembers(nodes,{x:50,y:50,k:.9},view).size,0);const shown=V.revealMembers(nodes,{x:50,y:50,k:1.3},view,new Set(),new Set(['a0']));assert.equal(shown.has('a0'),false);assert.equal(shown.size,100);assert.equal(V.revealMembers(nodes,{x:50,y:50,k:1.15},view,shown).size,100);assert.equal(V.revealMembers(nodes,{x:50,y:50,k:1.15},view).size,0);assert.equal(V.revealMembers([{id:'a',x:10,y:10},{id:'b',x:11,y:11}],{x:50,y:50,k:2},view).size,0);assert.equal(V.revealMembers(nodes,{x:-10000,y:-10000,k:2},view).size,0);});
test('author search exposes multiple real identities instead of their community representative',()=>{
 const nodes=Array.from({length:30},(_,i)=>({id:'a'+i,kind:'author',title:i>27?'Dawang '+i:'Author '+i,x:i*12,y:i*3,degree:30-i,members:['p'+i]})),edges=nodes.slice(1).map(n=>({source:'a0',target:n.id,kind:'coauthor',evidence:[{paperID:'p'+n.id}]})),model={mode:'authors',nodes,edges,communities:[{id:'community:a',title:'Author 0',members:nodes.map(n=>n.id),x:80,y:30,color:0}]},idx=V.index(model),before=V.scene(model,idx),positions=nodes.map(n=>[n.x,n.y]);
 model.searchActive=true;model.matches=['a28','a29'];const found=V.scene(model,idx);
 assert.deepEqual(found.matches,['a28','a29']);assert.ok(found.nodes.find(n=>n.id==='community:a').hideLabel);for(const id of model.matches){assert.equal(found.index.byID.get(id),idx.byID.get(id));assert.ok(!found.contextByID.has(id));assert.ok(found.edges.some(e=>e.source===id||e.target===id));}assert.deepEqual(nodes.map(n=>[n.x,n.y]),positions);
 model.searchActive=false;model.matches=[];const cleared=V.scene(model,idx);assert.equal(cleared.nodes,before.nodes);assert.ok(!cleared.nodes[0].hideLabel);
 model.searchActive=true;model.matches=['missing'];assert.equal(V.scene(model,idx).nodes,before.nodes);
});
