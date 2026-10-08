const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),C=require('../addon/core.js');
const record={DOI:'10.1234/a',title:'A reliable retinal study with a complete title',year:'2020',author:'Smith'},article={doi:record.DOI,title:record.title,pubYear:'2020',source:'MED',id:'123',abstractText:'<h4>Methods</h4><p>We measured retinal cells &amp; tissue.</p><h4>Results</h4><p>Results were heterogeneous.</p>',authorList:{author:[{lastName:'Smith'}]}};
function setup(transport=async url=>JSON.stringify(url.includes('europepmc')?{resultList:{result:[article]}}:url.includes('esearch')?{esearchresult:{idlist:[]}}:{message:{items:[]}})){
 const prefs=new Map(),ctx={CiteLensCore:C,Zotero:{getMainWindow:()=>({setTimeout,clearTimeout}),Prefs:{get:k=>prefs.get(k),set:(k,v)=>prefs.set(k,v),clear:k=>prefs.delete(k)}}};vm.createContext(ctx);for(const file of ['authors','abstracts'])vm.runInContext(fs.readFileSync(require.resolve('../addon/'+file+'.js'),'utf8'),ctx);const S={state:{settings:{autoAuthors:false}},active:2,waiting:[],dead:false,locate:async()=>[],persist:async()=>{}};ctx.CiteLensAbstracts.transport=transport;return {A:ctx.CiteLensAbstracts,S,prefs};
}
test('existing library abstract takes precedence without online requests',async()=>{let calls=0;const {A,S}=setup(async()=>{calls++;throw Error();});S.locate=async()=>[{item:{getField:()=>'<p>Local abstract.</p>'}}];const r=await A.lookup(S,record);assert.equal(r.text,'Local abstract.');assert.equal(r.source,'本地文献库');assert.equal(calls,0);});
test('published abstract is sanitized, deduplicated and independent of full background queues',async()=>{let calls=0;const {A,S}=setup(async url=>{calls++;return JSON.stringify(url.includes('europepmc')?{resultList:{result:[article]}}:{esearchresult:{idlist:[]}});});const [a,b]=await Promise.all([A.lookup(S,record),A.lookup(S,record)]);assert.equal(a.status,'available');assert.equal(a.text,b.text);assert.ok(a.text.includes('Methods\n\nWe measured'));assert.ok(a.text.includes('tissue.\n\nResults\n\nResults'));assert.equal(calls,2);await A.lookup(S,record);assert.equal(calls,2);assert.equal(A.text('<script>evil()</script><p>Safe &alpha;</p>'),'Safe α');assert.equal(S.waiting.length,0);});
test('conflicting DOI, title, authors and years cannot contribute an abstract',async()=>{for(const bad of [{...article,doi:'10.1234/b'},{...article,title:'Unrelated geology and mineral study'},{...article,pubYear:'1990'},{...article,authorList:{author:[{lastName:'Jones'}]}}]){const {A,S}=setup(async url=>JSON.stringify(url.includes('europepmc')?{resultList:{result:[bad]}}:url.includes('esearch')?{esearchresult:{idlist:[]}}:{message:{DOI:'10.1234/b',title:['Not this paper']}}));assert.equal((await A.lookup(S,record)).status,'missing');}});
test('ambiguous title-only matches cannot contribute an abstract',()=>{const {A}=setup();assert.equal(A.select({title:record.title,year:'2020',author:'Smith'},[{...record,DOI:'10.1234/x'},{...record,DOI:'10.1234/y'}]),null);});
test('unresponsive providers and library cannot leave preview loading indefinitely',async()=>{const {A,S}=setup(()=>new Promise(()=>{}));S.locate=()=>new Promise(()=>{});const start=Date.now(),r=await A.lookup(S,record,{budget:30});assert.equal(r.status,'offline');assert.ok(Date.now()-start<250);assert.equal(r.text,undefined);});
test('force retry ignores transient failure cache',async()=>{const {A,S}=setup(async()=>{throw Error('offline');});assert.equal((await A.lookup(S,record)).status,'offline');A.transport=async url=>JSON.stringify(url.includes('europepmc')?{resultList:{result:[article]}}:{esearchresult:{idlist:[]}});assert.equal((await A.lookup(S,record,{force:true})).status,'available');});
test('conflicting library abstracts do not arbitrarily select the first copy',async()=>{const {A,S}=setup();S.locate=async()=>['First local','Second local'].map(text=>({item:{getField:()=>text}}));assert.equal((await A.lookup(S,record)).source,'Europe PMC');});
test('API key stays in local preferences and NCBI POST body, never URLs or state',async()=>{const calls=[],{A,S}=setup(async(url,opts)=>{calls.push([url,opts]);return JSON.stringify(url.includes('europepmc')?{resultList:{result:[article]}}:{esearchresult:{idlist:[]}});}),secret='synthetic-test-key-12345678';A.apiKey(secret);await A.lookup(S,record);assert.ok(calls.some(([url,o])=>url.includes('ncbi')&&o.body.includes('api_key='+secret)));assert.ok(calls.every(([url,o])=>!url.includes(secret)&&(!url.includes('europepmc')||!o.body)));assert.ok(!JSON.stringify(S.state).includes(secret));A.apiKey('');assert.equal(A.apiKey(),'');});
test('abstract side placement is joined, bounded and nonoverlapping',()=>{const {A}=setup();for(const width of [360,620,900,1400])for(const x of [8,180,width-428]){if(x<0||x+420>width)continue;const anchor={left:x,right:x+420,top:450,bottom:580},p=A.placement(anchor,{width,height:700},450,380);if(p.side==='inline')continue;assert.ok(p.left>=8&&p.left+p.width<=width-8);assert.ok(p.left+p.width<=anchor.left||p.left>=anchor.right||p.top+Math.min(380,p.maxHeight)<=anchor.top||p.top>=anchor.bottom);assert.ok(p.top>=8&&p.top+Math.max(p.minHeight||0,Math.min(380,p.maxHeight))<=692);}});

test('cached abstract is rechecked against a changed title or year sharing the DOI',async()=>{const {A,S}=setup();assert.equal((await A.lookup(S,record)).status,'available');A.transport=async url=>JSON.stringify(url.includes('esearch')?{esearchresult:{idlist:[]}}:url.includes('europepmc')?{resultList:{result:[]}}:{message:{DOI:record.DOI,title:[record.title],abstract:'Old abstract',published:{'date-parts':[[2020]]},author:[{family:'Smith'}]}});assert.equal((await A.lookup(S,{...record,title:'Completely different geological and volcanic findings',year:'1990'})).status,'missing');});
test('title-only abstract lookup reaches Europe PMC and revalidates title author and year',async()=>{const queries=[],{A,S}=setup(async(url)=>{queries.push(url);return JSON.stringify(url.includes('europepmc')?{resultList:{result:[article]}}:{esearchresult:{idlist:[]}});});const r=await A.lookup(S,{title:record.title,year:'2020',author:'Smith'});assert.equal(r.status,'available');assert.equal(r.record.PMID,'123');assert.ok(queries.some(url=>decodeURIComponent(url).includes('TITLE:"'+record.title+'"')));assert.ok(r.url.endsWith('/MED/123'));});
test('NCBI title clauses preserve phrases rather than ANDing unindexed stopwords',async()=>{const calls=[],{A,S}=setup(async(url,opts)=>{calls.push([url,opts]);return JSON.stringify(url.includes('europepmc')?{resultList:{result:[]}}:url.includes('esearch')?{esearchresult:{idlist:[]}}:{message:{items:[]}});});await A.lookup(S,{title:'Causes and consequences of RNA polymerase II stalling during transcript elongation',year:'2021',author:'Noe Gonzalez'});const terms=calls.filter(([u])=>u.includes('esearch')).map(([,o])=>new URLSearchParams(o.body).get('term'));assert.equal(terms.length,2);assert.ok(terms[0].startsWith('"Causes'));assert.ok(terms.every(t=>!t.includes('during[Title]'))&&terms[1].includes(' AND '));});
test('negative caches from the old query strategy are bypassed after the query fix',async()=>{const {A,S}=setup();S.state.abstractCache={['doi:'+record.DOI]:{version:2,expires:Date.now()+86400000,value:{status:'missing'}}};assert.equal((await A.lookup(S,record)).status,'available');assert.equal(S.state.abstractCache['doi:'+record.DOI].version,4);});

test('E-utilities connection test supports no key and sends configured credentials only via POST',async()=>{const calls=[],{A}=setup(async(u,o)=>{calls.push([u,o]);return JSON.stringify({einforesult:{dbinfo:[{dbname:'pubmed'}]}});});assert.equal((await A.testConnection()).ok,true);assert.ok(!calls[0][1].body.includes('api_key'));A.apiKey('synthetic-test-key-12345678');assert.equal((await A.testConnection()).ok,true);assert.ok(calls[1][1].body.includes('api_key=synthetic'));assert.ok(!calls[1][0].includes('synthetic'));});
test('E-utilities test rejects error payloads and unexpected data without disclosing credentials',async()=>{for(const response of [{error:'API key invalid synthetic-test-key-12345678'},{einforesult:{}},{einforesult:{dbinfo:[{dbname:'gene'}]}}]){const {A}=setup(async()=>JSON.stringify(response));await assert.rejects(A.testConnection(),e=>!e.message.includes('synthetic')&&/NCBI/.test(e.message));}});
test('E-utilities connection deadline also aborts an unresponsive transport',async()=>{let aborted=false;const {A}=setup(async(u,o)=>{o.signal.add(()=>aborted=true);return new Promise(()=>{});});const start=Date.now();await assert.rejects(A.testConnection({budget:20}),/连接失败/);assert.ok(Date.now()-start<250);assert.ok(aborted);});

test('drag docking joins either edge only when it fits and overlaps the reference vertically',()=>{const {A}=setup(),anchor={left:500,right:900,top:100,bottom:340},viewport={width:1400,height:800},size={width:440,height:260};for(const [left,side,expected] of [[70,'left',60],[885,'right',900],[300,'bottom',460]]){const p=A.dragPlacement(anchor,viewport,size,{left,top:115});assert.equal(p.side,side);assert.equal(p.left,expected);if(['left','right'].includes(side))assert.equal(p.top,100);}assert.equal(A.dragPlacement(anchor,viewport,size,{left:900,top:420}).side,'free');const constrained=A.dragPlacement(anchor,{width:1120,height:800},size,{left:900,top:115});assert.ok(['top','bottom','left'].includes(constrained.side));});
test('dragging remains reachable on small viewports and can detach from either edge',()=>{const {A}=setup(),anchor={left:8,right:300,top:50,bottom:200};for(const width of [320,620,1400])for(const point of [{left:-300,top:-500},{left:2000,top:3000}]){const p=A.dragPlacement(anchor,{width,height:480},{width:440,height:600},point,false);assert.equal(p.side,'free');assert.ok(p.left>=8&&p.left+p.width<=width-8);assert.ok(p.top>=8&&p.top+p.maxHeight<=472);}});

test('overlap docks to the longest crossed edge, including top and bottom',()=>{const {A}=setup(),anchor={left:450,right:850,top:300,bottom:500},viewport={width:1400,height:900},size={width:440,height:220};for(const [point,side] of [[{left:450,top:160},'top'],[{left:450,top:420},'bottom'],[{left:40,top:310},'left'],[{left:825,top:310},'right']]){const p=A.dragPlacement(anchor,viewport,size,point);assert.equal(p.side,side);assert.ok(p.left+p.width<=anchor.left||p.left>=anchor.right||p.top+Math.min(size.height,p.maxHeight)<=anchor.top||p.top>=anchor.bottom);}});
test('a window with no usable exterior space uses inline placement instead of hiding the article',()=>{const {A}=setup();assert.equal(A.dragPlacement({left:8,right:312,top:8,bottom:472},{width:320,height:480},{width:304,height:320},{left:8,top:70}).side,'inline');});
test('resizing keeps opposite edges fixed and respects the viewport and minimum reading size',()=>{const {A}=setup(),box={left:100,top:100,right:540,bottom:400},v={width:1000,height:700};for(const edge of ['n','e','s','w','ne','nw','se','sw']){const p=A.resizePlacement(box,v,edge,40,30);assert.ok(p.width>=240&&p.height>=120);assert.ok(p.left>=8&&p.top>=8&&p.left+p.width<=992&&p.top+p.height<=692);}const p=A.resizePlacement(box,v,'nw',-999,-999);assert.equal(p.left,8);assert.equal(p.top,8);assert.equal(p.left+p.width,540);assert.equal(p.top+p.height,400);});

test('a distinctive complete title alone can retrieve an abstract without inventing authors or year',async()=>{
 const {A,S}=setup(),input={title:record.title};assert.equal(A.select(input,[record])?.DOI,record.DOI);
 const r=await A.lookup(S,input);assert.equal(r.status,'available');assert.equal(input.DOI,undefined);assert.equal(input.year,undefined);
 assert.equal(A.select({title:'Data analysis'},[{title:'Data analysis',DOI:'10.1234/x'}]),null);
 assert.equal(A.select(input,[{...record,title:'A reliable retinal study with a nearly complete title'}]),null);
 assert.equal(A.select(input,[record,{...record,DOI:'10.1234/reprint'}]),null);
 assert.equal(A.select(input,[record,{...record,DOI:'10.1234/similar',title:record.title+' revisited'}]),null);
 assert.equal(A.select({...input,year:'1980'},[record]),null);
});
test('OpenAlex restores complete abstract word order and rejects damaged indexes',()=>{
 const {A}=setup();assert.equal(A.invertedAbstract({cells:[1,3],Retinal:[0],and:[2]}),'Retinal cells and cells');
 for(const bad of [{cells:[1]},{one:[0],two:[0]},{cells:[10000]},{cells:[-1]},null])assert.equal(A.invertedAbstract(bad),'');
});
test('cross-disciplinary abstract fallback reaches OpenAlex and retains source identity',async()=>{
 const {A,S}=setup(async url=>JSON.stringify(url.includes('openalex')?{display_name:record.title,doi:'https://doi.org/'+record.DOI,publication_year:2020,authorships:[{author:{display_name:'Jane Smith'}}],abstract_inverted_index:{The:[0],published:[1],abstract:[2]},id:'https://openalex.org/W123'}:url.includes('esearch')?{esearchresult:{idlist:[]}}:url.includes('europepmc')?{resultList:{result:[]}}:{message:{items:[]}}));
 const r=await A.lookup(S,record);assert.equal(r.source,'OpenAlex');assert.equal(r.text,'The published abstract');assert.equal(r.record.DOI,record.DOI);
});
test('a slow biomedical provider cannot consume the entire cross-disciplinary fallback budget',async()=>{
 const {A,S}=setup(url=>url.includes('ncbi')?new Promise(()=>{}):Promise.resolve(JSON.stringify(url.includes('openalex')?{display_name:record.title,doi:record.DOI,abstract_inverted_index:{Valid:[0],abstract:[1]}}:{resultList:{result:[]},message:{items:[]}})));
 const start=Date.now(),r=await A.lookup(S,record,{budget:200});assert.equal(r.source,'OpenAlex');assert.ok(Date.now()-start<400);
});
test('provider throttling cools down across different papers rather than hammering the API',async()=>{
 let calls=0;const {A,S}=setup(async url=>{if(url.includes('openalex')){calls++;throw Error('busy');}return JSON.stringify(url.includes('europepmc')?{resultList:{result:[]}}:url.includes('esearch')?{esearchresult:{idlist:[]}}:{message:{items:[]}});});
 await A.lookup(S,record);await A.lookup(S,{...record,DOI:'10.1234/different'});assert.equal(calls,1);
});

test('first verified abstract aborts in-flight providers and prevents fallback requests',async()=>{
 let cancelled=0,cross=0;const {A,S}=setup((url,options)=>{
  if(url.includes('ncbi'))return new Promise((resolve,reject)=>{options.signal.add(()=>{cancelled++;reject(Error('cancelled'));});});
  if(url.includes('europepmc'))return Promise.resolve(JSON.stringify({resultList:{result:[article]}}));
  cross++;throw Error('Fallback must not start');
 });
 const r=await A.lookup(S,record);assert.equal(r.source,'Europe PMC');assert.equal(cancelled,1);assert.equal(cross,0);
 await new Promise(r=>setTimeout(r,20));assert.equal(S.state.abstractCache['doi:'+record.DOI].value.source,'Europe PMC');
});
test('invalid fast candidate cannot cancel the matching slower provider',async()=>{
 const {A,S}=setup(async url=>{
  if(url.includes('europepmc'))return JSON.stringify({resultList:{result:[{...article,title:'Wrong unrelated geological article'}]}});
  if(url.includes('ncbi'))return JSON.stringify({esearchresult:{idlist:[]}});
  if(url.includes('crossref'))return JSON.stringify({message:{DOI:record.DOI,title:[record.title],abstract:'Verified published abstract',published:{'date-parts':[[2020]]},author:[{family:'Smith'}]}});
  return new Promise(()=>{});
 });
 assert.equal((await A.lookup(S,record)).source,'Crossref');
});
test('same DOI with conflicting metadata does not share another pending result',async()=>{
 const {A,S}=setup();const [good,bad]=await Promise.all([A.lookup(S,record),A.lookup(S,{...record,title:'Completely different geological and volcanic findings',year:'1990'})]);
 assert.equal(good.status,'available');assert.notEqual(bad.status,'available');
});

test('anonymous Semantic Scholar is a validated final fallback',async()=>{
 const calls=[],{A,S}=setup(async(url,opts)=>{calls.push([url,opts]);return JSON.stringify(url.includes('semanticscholar')?{title:record.title,year:2020,externalIds:{DOI:record.DOI},authors:[{name:'Jane Smith'}],abstract:'A verified cross-disciplinary abstract.',url:'https://www.semanticscholar.org/paper/example'}:url.includes('esearch')?{esearchresult:{idlist:[]}}:{resultList:{result:[]},message:{items:[]},results:[]});});
 const r=await A.lookup(S,record);assert.equal(r.source,'Semantic Scholar');assert.equal(r.text,'A verified cross-disciplinary abstract.');assert.ok(calls.at(-1)[0].includes('DOI%3A'));assert.ok(!JSON.stringify(calls).includes('x-api-key'));
});
test('Semantic Scholar rejects conflicting bibliographic candidates',async()=>{
 const {A,S}=setup(async url=>JSON.stringify(url.includes('semanticscholar')?{title:'An unrelated geology paper',year:1990,externalIds:{DOI:record.DOI},authors:[{name:'Jane Smith'}],abstract:'Wrong abstract'}:url.includes('esearch')?{esearchresult:{idlist:[]}}:{resultList:{result:[]},message:{items:[]},results:[]}));assert.equal((await A.lookup(S,record)).status,'missing');
});

test('DOI PMID and exact bibliographic aliases reuse one persisted abstract across consumers',async()=>{
 let calls=0;const {A,S}=setup(async url=>{calls++;return JSON.stringify(url.includes('europepmc')?{resultList:{result:[{...article,pmcid:'PMC456'}]}}:{esearchresult:{idlist:[]}});});
 const first=await A.lookup(S,record),before=calls;
 for(const input of [{PMID:'123'},{PMCID:'PMC456'},{title:record.title,year:'2020',author:'Smith'}])assert.equal((await A.lookup(S,input)).text,first.text);
 assert.equal(calls,before);assert.equal(Object.keys(S.state.abstractCache).length,1);
 const restored=setup(async()=>{throw Error('cache should survive restart');});restored.S.state.abstractCache=JSON.parse(JSON.stringify(S.state.abstractCache));assert.equal((await restored.A.lookup(restored.S,{PMID:'123'})).text,first.text);
 assert.equal(A.cached(S,{PMID:'123',title:'Completely unrelated geological findings',year:'1990'}),null);
});
test('obsolete Crossref-only abstracts are refetched without invalidating other providers',async()=>{
 const {A,S}=setup(),key='doi:'+record.DOI,old={status:'available',text:'Previously truncated text.',source:'Crossref',record:{...record,abstract:'Previously truncated text.'}};
 S.state.abstractCache={[key]:{version:4,expires:Date.now()+86400000,value:old}};assert.equal(A.cached(S,record),null);assert.equal(A.current(old),false);
 const renewed=await A.lookup(S,record);assert.equal(renewed.source,'Europe PMC');assert.equal(A.cached(S,record).text,renewed.text);
 assert.equal(A.current({...old,source:'PubMed'}),true);assert.equal(A.current({...old,record:{...old.record,abstractParserVersion:1}}),true);
});

test('reading and network share verified metadata abstracts without another provider request',async()=>{
 let calls=0;const {A,S}=setup(async()=>{calls++;throw Error('No remote lookup expected');}),resolved={...record,abstract:'Published retinal study abstract with source details.',source:'Crossref',abstractParserVersion:1};
 S.state.cache={'legacy-title-key':{time:Date.now(),value:{status:'matched',ranked:[{record:resolved}]}}};
 assert.equal(A.cached(S,record).text,resolved.abstract);assert.equal((await A.lookup(S,record)).source,'Crossref');assert.equal(calls,0);
 assert.equal(A.cached(S,{...record,title:'Unrelated geological study of a volcanic eruption'}),null);
 resolved.abstractParserVersion=0;assert.equal(A.cached(S,record),null);resolved.abstractParserVersion=1;S.state.cache['legacy-title-key'].time=1;assert.equal(A.cached(S,record),null);
});

test('side docks cover the selected card rather than center-aligning the whole host',()=>{
 const {A}=setup(),host={left:500,right:900,top:80,bottom:700},v={width:1400,height:900};
 for(const target of [{left:500,right:900,top:90,bottom:310},{left:500,right:900,top:400,bottom:680}])for(const side of ['left','right'])for(const top of [8,180,690]){
  const p=A.dragPlacement(host,v,{width:400,height:140},{side,left:60,top},false,{target}),h=Math.max(p.minHeight,Math.min(140,p.maxHeight));
  assert.equal(p.side,side);assert.ok(p.top<=target.top&&p.top+h>=target.bottom);assert.ok(p.top>=8&&p.top+h<=892);
  const link=A.linkPosition(target,{...p,height:h});assert.equal(p.top+link.y,(target.top+target.bottom)/2);assert.ok(link.y-11>=20&&link.y+11<=h-20);
 }
});
test('top and bottom docking cover the target projection touching the host',()=>{
 const {A}=setup(),host={left:400,right:840,top:300,bottom:550},target={left:420,right:820,top:350,bottom:480},v={width:1400,height:900};
 for(const side of ['top','bottom'])for(const left of [8,450,1100]){
  const p=A.dragPlacement(host,v,{width:280,height:200},{side,left,top:300},false,{target});assert.equal(p.side,side);assert.ok(p.left<=target.left&&p.left+p.width>=target.right);
  assert.equal(side==='top'?host.top-(p.top+200):p.top-host.bottom,0);
  const link=A.linkPosition(target,{...p,height:200});assert.equal(p.left+link.x,620);assert.ok(link.x-11>=20&&link.x+11<=p.width-20);
 }
});
test('list summaries only dock on the left, for initial placement, overlap and explicit side requests',()=>{
 const {A}=setup(),host={left:950,right:1290,top:80,bottom:700},target={left:950,right:1290,top:300,bottom:420},v={width:1400,height:900},options={target,sides:['left']};
 assert.equal(A.placement(host,v,300,300,options).side,'left');
 for(const side of ['left','right','top','bottom','free'])for(const point of [{left:850,top:350},{left:400,top:100},{left:960,top:600}]){const p=A.dragPlacement(host,v,{width:400,height:300},{...point,side},true,options);assert.ok(['left','free'].includes(p.side));}
});
test('indicator endpoints keep an extra 8px beyond rounded corners even at extreme offsets',()=>{
 const {A}=setup();for(const center of [-100,0,100,999]){const p=A.linkPosition({left:center,right:center,top:center,bottom:center},{left:0,top:0,width:240,height:180});assert.ok(p.x-11>=20&&p.x+11<=220);assert.ok(p.y-11>=20&&p.y+11<=160);}
});
test('initial placement accepts browser DOMRect properties inherited through getters',()=>{
 const {A}=setup(),rect=Object.create({left:600,right:980,top:42,bottom:550}),target=Object.create({left:612,right:968,top:160,bottom:250});
 const p=A.placement(rect,{width:1000,height:600},160,300,{target,sides:['left']});assert.equal(p.side,'left');assert.equal(p.left+p.width,600);assert.ok(Number.isFinite(p.top+p.width));
});
