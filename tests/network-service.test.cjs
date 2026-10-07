const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),C=require('../addon/core.js');
async function setup(){const items=new Map(),reads=[],context={CiteLensCore:C,PathUtils:{join:(...a)=>a.join('/'),parent:()=>'/qa'},CiteLensServices:{path:'/qa/services.json'},IOUtils:{exists:async()=>false,writeUTF8:async()=>{}},Zotero:{Promise:{delay:()=>Promise.resolve()},Notifier:{registerObserver:()=>1},Libraries:{getAll:()=>[{libraryID:1,libraryType:'user',name:'Fixture',editable:true}]},Collections:{getByLibrary:()=>[]},CreatorTypes:{getName:()=> 'author'},ItemTypes:{getName:()=> 'journalArticle'},Items:{getAll:async()=>[...items.keys()],getAsync:async ids=>{if(Array.isArray(ids))return ids.map(id=>items.get(id)).filter(Boolean);reads.push(ids);return items.get(ids)||false;}}}};vm.createContext(context);for(const file of ['network-core.js','network.js'])vm.runInContext(fs.readFileSync(require.resolve('../addon/'+file),'utf8'),context);const N=context.CiteLensNetwork,NC=context.CiteLensNetworkCore;N.compute=async(action,p)=>{const merged=NC.consolidate(p.nodes,p.sources);return {...NC.build(merged.nodes,merged.sources),aliases:merged.aliases};};await N.start();const make=id=>({id,key:'K'+id,libraryID:1,itemTypeID:1,relatedItems:[],getAttachments:()=>[],getCreators:()=>[],getCollections:()=>[],isRegularItem:()=>true,getField:k=>k==='title'?'Research article '+id:k==='date'?'2020':''});for(let i=1;i<=20;i++)items.set(i,make(i));return{N,items,reads,make};}
test('library notification reads only added/changed metadata and removes deleted entries',async()=>{const {N,items,reads,make}=await setup();await N.snapshot();reads.length=0;items.set(21,make(21));N.invalidate('add','item',[21]);const added=await N.snapshot();assert.deepEqual(reads,[21]);assert.equal(added.nodes.length,21);assert.equal(added.incremental.full,false);reads.length=0;items.delete(7);N.invalidate('delete','item',[7]);await N.snapshot();assert.deepEqual(reads,[7]);assert.ok(!N.data.byID.has('1:K7'));});
test('attachment changes reread their parent, including deleted attachments',async()=>{const {N,items,reads}=await setup(),parent=items.get(1);parent.getAttachments=()=>[101];items.set(101,{id:101,key:'A101',parentID:1,attachmentContentType:'application/pdf',dateModified:'today',isRegularItem:()=>false});await N.snapshot();reads.length=0;items.delete(101);parent.getAttachments=()=>[];N.invalidate('delete','item',[101]);const next=await N.snapshot();assert.deepEqual([...reads].sort((a,b)=>a-b),[1,101]);assert.equal(next.byID.get('1:K1').attachments.length,0);});
test('collection membership updates reread only the member; collection rename reads no paper',async()=>{const {N,reads}=await setup();await N.snapshot();reads.length=0;N.invalidate('add','collection-item',['42-3']);await N.snapshot();assert.deepEqual(reads,[3]);reads.length=0;N.invalidate('modify','collection',[42]);await N.snapshot();assert.deepEqual(reads,[]);});
test('a change arriving during calculation remains queued for the next incremental snapshot',async()=>{const {N,reads,items}=await setup();await N.snapshot();items.get(2).getCollections=()=>[8];const compute=N.compute;let notified=false;N.compute=async(...args)=>{if(!notified){notified=true;N.invalidate('modify','item',[3]);}return compute(...args);};N.invalidate('modify','item',[2]);reads.length=0;await N.snapshot();assert.equal(N.dirty,true);await N.snapshot();assert.deepEqual(reads,[2,3]);assert.equal(N.dirty,false);});
test('failed delta leaves the last snapshot intact and retries the pending IDs',async()=>{const {N,reads,items}=await setup(),old=await N.snapshot(),compute=N.compute;items.get(2).getCollections=()=>[8];N.invalidate('modify','item',[2]);N.compute=async()=>{throw Error('fixture failure');};await assert.rejects(N.snapshot(),/fixture failure/);assert.equal(N.data,old);N.compute=compute;reads.length=0;await N.snapshot();assert.deepEqual(reads,[2]);});
test('unchanged notifications retain snapshot identity and never rebuild the graph',async()=>{const {N,items}=await setup(),first=await N.snapshot(),compute=N.compute;let builds=0;N.compute=async(...args)=>{builds++;return compute(...args);};for(let i=0;i<4;i++){N.invalidate('modify','item',[2]);assert.equal(await N.snapshot(),first);assert.equal(N.dirty,false);}N.invalidate('modify','collection',[7]);assert.equal(await N.snapshot(),first);assert.equal(builds,0);const old=items.get(2).getField;items.get(2).getField=k=>k==='title'?'Changed scientific title':old(k);N.invalidate('modify','item',[2]);assert.notEqual(await N.snapshot(),first);assert.equal(builds,1);});
test('network stays local even with stale API preferences and never requests a model service',async()=>{let calls=0;const S={analyze:async()=>({vectors:[[1,0],[1,0]],engine:'local'}),classifyTopics:()=>{calls++;throw Error('Removed API');},classifyAuthors:()=>{calls++;throw Error('Removed API');}},ctx=vm.createContext({CiteLensTranslation:{get:()=> 'llm',llmTaskConfig:()=>{calls++;throw Error('Removed API');}},CiteLensSemantic:S});vm.runInContext(fs.readFileSync(require.resolve('../addon/network.js'),'utf8'),ctx);const N=ctx.CiteLensNetwork;N.dead=false;N.compute=async(action,p)=>action==='prepare'?{nodes:[{id:'a'},{id:'b'}]}:action==='map'?{nodes:[],local:true}:{semantic:{...p.semantic},semanticState:{},nodes:[],groups:[]};assert.equal((await N.map({mode:'topics'})).semantic.engine,'local');assert.equal((await N.map({mode:'authors'})).local,true);assert.equal(calls,0);});

async function cacheService(files=new Map()){
 const crypto=require('node:crypto'),ctx=vm.createContext({Map,Set,JSON,CiteLensCore:C,PathUtils:{join:(...a)=>a.join('/'),parent:()=>'/qa'},CiteLensServices:{path:'/qa/service.json'},CiteLensTranslation:{get:()=> 'local'},CiteLensSemantic:{key:async(text,scope)=>crypto.createHash('sha256').update(scope+text).digest('hex')},Zotero:{logError:()=>{}},IOUtils:{exists:async p=>files.has(p),stat:async p=>({size:files.get(p).length,lastModified:1}),readUTF8:async p=>files.get(p),writeUTF8:async(p,text)=>files.set(p,text),makeDirectory:async()=>{},getChildren:async()=>[...files.keys()],remove:async p=>files.delete(p)}});
 vm.runInContext(fs.readFileSync('addon/network.js','utf8'),ctx);const N=ctx.CiteLensNetwork;N.dead=false;N.cacheRoot='/cache';let expensive=0;
 const worker=vm.createContext({Map,Set,JSON,importScripts:()=>{},postMessage:()=>{}});vm.runInContext(fs.readFileSync('addon/network-worker.js','utf8'),worker);
 N.compute=async(action,payload)=>{let output;worker.postMessage=x=>{output=x;};await worker.onmessage({data:{action,payload}});if(output?.error)throw Error(output.error);return output.result;};
 N.buildMap=async p=>{expensive++;return{nodes:p.nodes.map(n=>({...n,x:10,y:20})),mode:p.mode,groups:[],communities:[],stats:{},references:new Map([['paper',[1]]])};};return{N,ctx,files,count:()=>expensive};
}
test('disk graph cache survives restart, keeps Maps, separates modes/scopes, and invalidates changed content',async()=>{
 const s=await cacheService(),p={mode:'authors',cacheKey:'library1:collection2',nodes:[{id:'1',title:'Alice Smith'}],positions:[]};await s.N.map(p);const warm=await s.N.map(p);assert.equal(s.count(),1);assert.equal(warm.cache.hit,true);assert.ok(warm.references instanceof Map);
 warm.nodes[0].title='UI mutation';const restarted=await cacheService(s.files),restored=await restarted.N.map(p);assert.equal(restarted.count(),0);assert.equal(restored.nodes[0].title,'Alice Smith');
 await restarted.N.map({...p,mode:'topics'});await restarted.N.map({...p,cacheKey:'library1:collection3'});await restarted.N.map({...p,nodes:[{id:'1',title:'Edited author'}]});await restarted.N.map({...p,nodes:[]});assert.equal(restarted.count(),4);
 const abort=new AbortController();abort.abort();await assert.rejects(restarted.N.map(p,{signal:abort.signal}),/已取消/);
 const key=await s.N.cacheKey([{test:true}]);await s.N.writeCache('refs',key,{refs:[{title:'Retina'}],citationPages:new Map([[0,{offsets:new Map([[1,2]])}]]),runningHeaders:new Set(['header'])});const refs=await restarted.N.readCache('refs',key);assert.equal(refs.citationPages.get(0).offsets.get(1),2);assert.ok(refs.runningHeaders.has('header'));
 s.files.set('/cache/refs-'+key+'.json','corrupt');assert.equal(await restarted.N.readCache('refs',key),null);
});
test('cache eviction bounds persistent resource use and API failures are not cached as successful results',async()=>{
 const s=await cacheService();for(let i=0;i<66;i++)await s.N.writeCache('author',String(i).padStart(64,'0'),[{members:['a']}]);assert.ok(s.files.size<=64);
 let calls=0;s.N.buildMap=async()=>{calls++;return{nodes:[],groupingError:'timeout'};};const p={mode:'authors',nodes:[]};await s.N.map(p);await s.N.map(p);assert.equal(calls,2);
});

test('network reuses cached author identity evidence without metadata requests or library edits',async()=>{
 const {N,items}=await setup(),item=items.get(1),local=[{firstName:'J.',lastName:'Smith',creatorTypeID:1}],oid='0000-0002-1825-0097';item.getCreators=()=>local;const field=item.getField;item.getField=k=>k==='DOI'?'10.1234/example':field(k);
 // Exercise the actual record reader with an isolated service cache.
 const ctx=vm.createContext({CiteLensCore:C,CiteLensServices:{state:{authorCache:{'doi:10.1234/example':{value:{DOI:'10.1234/example',authors:[{firstName:'Jane',lastName:'Smith',ORCID:oid,affiliations:['Example University Department of Retina']}]}}}}},Zotero:{CreatorTypes:{getName:()=> 'author'},ItemTypes:{getName:()=> 'journalArticle'},Items:{getAsync:async()=>[]}}});for(const f of ['network-core.js','network.js'])vm.runInContext(fs.readFileSync('addon/'+f,'utf8'),ctx);
 const result=await ctx.CiteLensNetwork.readRecord(item);assert.equal(result.creators[0].ORCID,oid);assert.equal(result.creators[0].firstName,'Jane');assert.equal(local[0].firstName,'J.');assert.equal(local[0].ORCID,undefined);
 await N.snapshot();N.authorMetadataChanged('10.1234/example');assert.deepEqual([...N.dirtyItems],[1]);
});

test('unchanged modes reuse completed and in-flight jobs without canceling one another',async()=>{
 const s=await cacheService();s.ctx.Zotero.getMainWindow=()=>({AbortController});s.ctx.Zotero.Promise={delay:()=>new Promise(r=>setTimeout(r,0))};
 let builds=0,releases=[];s.N.map=async payload=>{builds++;await new Promise(r=>releases.push(r));return{nodes:[],mode:payload.mode};};
 const snapshot={},p={mode:'authors',cacheKey:'1:2',nodes:[],openEntities:[]};
 const author=s.N.graphJob(snapshot,p),topic=s.N.graphJob(snapshot,{...p,mode:'topics'});
 assert.equal(s.N.graphJob(snapshot,{...p,query:'Alice',positions:[{id:'a',x:4}]}),author);
 await new Promise(r=>setTimeout(r,5));assert.equal(builds,2);assert.equal(author.controller.signal.aborted,false);
 releases.splice(0).forEach(r=>r());await Promise.all([author.promise,topic.promise]);
 assert.equal(s.N.graphJob(snapshot,p),author);assert.equal(s.N.graphJob(snapshot,{...p,mode:'topics'}),topic);assert.equal(builds,2);
 const changed=s.N.graphJob({},p);assert.notEqual(changed,author);await new Promise(r=>setTimeout(r,5));releases.splice(0).forEach(r=>r());await changed.promise;assert.equal(builds,3);
 s.N.clearGraphJobs('topics');assert.equal(topic.controller.signal.aborted,true);assert.equal(changed.controller.signal.aborted,false);
});

test('cancelled and failed jobs can retry; prepared graphs replace the unprepared copy',async()=>{
 const s=await cacheService();s.ctx.Zotero.getMainWindow=()=>({AbortController});s.ctx.Zotero.Promise={delay:()=>Promise.resolve()};
 let attempts=0;s.N.map=async()=>{if(++attempts===1)throw Error('fixture failure');return{nodes:[],mode:'authors'};};
 const snapshot={},p={mode:'authors',cacheKey:'1:2',nodes:[],openEntities:[]};
 const failed=s.N.graphJob(snapshot,p);await assert.rejects(failed.promise,/fixture failure/);
 const retried=s.N.graphJob(snapshot,p);assert.notEqual(retried,failed);await retried.promise;
 const initial=retried.value;s.N.compute=async()=>({graph:{...initial,prepared:true},index:{}});
 const view=await s.N.presentation(retried);assert.equal(await retried.promise,view.graph);assert.equal(retried.value,view.graph);assert.notEqual(retried.value,initial);
 retried.controller.abort();const next=s.N.graphJob(snapshot,p);assert.notEqual(next,retried);await next.promise;assert.equal(attempts,3);
});

test('startup warmup prepares both modes silently and shares jobs with later views',async()=>{
 const s=await cacheService();s.ctx.Zotero.getMainWindow=()=>({AbortController});s.ctx.Zotero.getActiveZoteroPane=()=>({getSelectedLibraryID:()=>1});s.ctx.Zotero.Promise={delay:()=>Promise.resolve()};s.ctx.CiteLensModels={installed:new Map([['local',{}]]),selected:()=> 'local'};
 const data={nodes:[{id:'1',libraryID:1,collections:[]}],edges:[],collections:[]};s.N.snapshot=async()=>data;s.N.presentation=j=>j.promise;let calls=0;s.N.map=async p=>{calls++;return{nodes:[],mode:p.mode};};await s.N.warmup();assert.equal(s.N.views.size,0);assert.equal(calls,4);await s.N.warmup();assert.equal(calls,4);assert.equal(s.N.graphJobs.size,4);
 const job=s.N.graphJob(data,{mode:'topics',cacheKey:'1:',limit:Number.MAX_SAFE_INTEGER,openEntities:[]});await job.promise;assert.equal(calls,4);
});
test('repeated topic drilldowns cannot evict or recompute either base network',async()=>{
 const s=await cacheService();s.ctx.Zotero.getMainWindow=()=>({AbortController});s.ctx.Zotero.Promise={delay:()=>Promise.resolve()};
 let builds=0,expansions=0;s.N.map=async p=>{builds++;return {nodes:[],mode:p.mode};};s.N.compute=async(action,p)=>{assert.equal(action,'expand');expansions++;return {...p.graph};};
 const snapshot={},p={cacheKey:'1:',mode:'topics',nodes:[],openEntities:[]};
 const topic=s.N.graphJob(snapshot,p),author=s.N.graphJob(snapshot,{...p,mode:'authors'});await Promise.all([topic.promise,author.promise]);
 for(let i=0;i<12;i++)await s.N.graphJob(snapshot,{...p,selected:'topic'+i,openEntities:['topic'+i]}).promise;
 assert.equal(builds,2);assert.equal(expansions,12);assert.equal(s.N.graphJob(snapshot,p),topic);assert.equal(s.N.graphJob(snapshot,{...p,mode:'authors'}),author);assert.equal(topic.controller.signal.aborted,false);assert.equal(author.controller.signal.aborted,false);assert.ok(s.N.graphJobs.size<=8);
});

function abstractService(){
 const ctx=vm.createContext({CiteLensCore:C,CiteLensServices:{state:{}},Zotero:{Promise:{delay:async()=>{}},getMainWindow:()=>({clearTimeout:()=>{},setTimeout:()=>0}),logError:()=>{}}});
 for(const f of ['authors','abstracts','network'])vm.runInContext(fs.readFileSync('addon/'+f+'.js','utf8'),ctx);
 const N=ctx.CiteLensNetwork;N.dead=false;N.abstractEpoch=1;N.abstracts=new Map();const requests=[],changes=[],schedules=[];
 const paper=i=>({id:'1:K'+i,itemID:i,type:'journalArticle',title:'A reliable retinal study with a complete title '+i,DOI:'10.1234/paper'+i,year:'2020',creators:[]});
 ctx.CiteLensAbstracts.lookup=async(_,n)=>{requests.push(n.id);return{status:'available',text:'Published abstract about retinal neural development. '.repeat(3),source:'PubMed',record:{...n}};};
 N.invalidate=(...args)=>changes.push(args);N.scheduleAbstracts=(...args)=>schedules.push(args);return{ctx,N,requests,changes,schedules,paper};
}

test('abstract pass completes its scope once, preserves records, and reuses saved successes',async()=>{
 const {N,requests,changes,paper}=abstractService(),nodes=Array.from({length:15},(_,i)=>paper(i+1)),before=JSON.stringify(nodes);
 const result=await N.fillAbstracts({nodes});assert.equal(result.updated,15);assert.equal(requests.length,15);assert.equal(changes.length,1);assert.equal(changes[0][2].length,15);assert.equal(JSON.stringify(nodes),before);
 assert.equal(N.applyAbstract(nodes[0]).abstractSource,'PubMed');assert.equal(N.applyAbstract({...nodes[0],title:'Unrelated geological study of volcanoes'}).abstract,undefined);
 assert.equal(N.applyAbstract({...nodes[0],abstract:'Original user abstract. '.repeat(5)}).abstract,'Original user abstract. '.repeat(5));
 await N.fillAbstracts({nodes});assert.equal(requests.length,15);assert.equal(changes.length,1);
});
test('missing abstracts expire by strategy and manual refresh; books never enter the queue',async()=>{
 const {N,ctx,requests,paper}=abstractService();ctx.CiteLensAbstracts.lookup=async(_,n)=>{requests.push(n.id);return{status:'missing'};};
 const nodes=[paper(1),{...paper(2),type:'bookSection'}];await N.ensureAbstracts(nodes);await N.ensureAbstracts(nodes);assert.equal(requests.length,1);
 N.revisions={...N.revisions,abstracts:'new-provider'};await N.ensureAbstracts(nodes);assert.equal(requests.length,2);
 N.abstracts.get(nodes[0].id).checked=1;await N.ensureAbstracts(nodes,{refresh:Date.now()});assert.equal(requests.length,3);
});
test('offline pauses enrichment and leaves prior graph and negative cache intact',async()=>{
 const {N,ctx,paper}=abstractService();let calls=0;ctx.CiteLensAbstracts.lookup=async()=>{calls++;return{status:'offline'};};
 await assert.rejects(N.ensureAbstracts([paper(1)]),/摘要服务暂不可用/);assert.equal(calls,3);assert.equal(N.abstracts.size,0);assert.equal(N.abstractRequests.size,0);
});
test('an old abstract request cannot mutate a restarted network',async()=>{
 const {N,ctx,changes,paper}=abstractService();let release;ctx.CiteLensAbstracts.lookup=()=>new Promise(r=>release=r);
 const n=paper(1),job=N.ensureAbstracts([n]);N.abstractEpoch++;release({status:'available',text:'Verified abstract. '.repeat(20),record:n});await assert.rejects(job,/已取消/);assert.equal(N.abstracts.size,0);assert.equal(changes.length,0);
});
test('foreground scopes preempt background queue and overlapping requests share downloads',async()=>{
 const {N,ctx,paper}=abstractService(),seen=[],releases=[];ctx.CiteLensAbstracts.lookup=(_,n)=>{seen.push(n.id);return new Promise(r=>releases.push(()=>r({status:'available',text:'Verified scientific abstract. '.repeat(8),record:n})));};
 const nodes=[paper(1),paper(2),paper(3)],background=N.ensureAbstracts(nodes),foreground=N.ensureAbstracts([nodes[2]],{foreground:true});releases.shift()();await new Promise(r=>setImmediate(r));assert.equal(seen[1],nodes[2].id);releases.shift()();await foreground;await new Promise(r=>setImmediate(r));assert.equal(seen[2],nodes[1].id);releases.shift()();await background;assert.equal(seen.length,3);
});
test('cancelling one scope does not cancel another scope using the same abstract queue',async()=>{
 const {N,ctx,paper}=abstractService();let release;ctx.CiteLensAbstracts.lookup=(_,n)=>new Promise(r=>release=()=>r({status:'missing'}));const abort=new AbortController(),a=N.ensureAbstracts([paper(1)],{signal:abort.signal}),b=N.ensureAbstracts([paper(1)]);abort.abort();await assert.rejects(a,/已取消/);release();await b;assert.equal(N.abstractRequests.size,0);
});
test('algorithm revisions invalidate graph caches while last completed graph remains available',async()=>{
 const s=await cacheService(),p={mode:'topics',cacheKey:'1:',nodes:[{id:'1'}],positions:[]};await s.N.map(p);s.N.revisions={...s.N.revisions,topics:'new-algorithm'};const previous=await s.N.previousGraph(p);assert.equal(previous.nodes[0].id,'1');assert.equal(s.count(),1);await s.N.map(p);assert.equal(s.count(),2);await s.N.map({...p,refresh:1});assert.equal(s.count(),3);await s.N.map(p);assert.equal(s.count(),3);
});
test('topic jobs wait for abstract completion; author jobs do not wait',async()=>{
 const s=await cacheService();s.ctx.Zotero.getMainWindow=()=>({AbortController});s.ctx.Zotero.Promise={delay:()=>Promise.resolve()};let release,topics=0,authors=0;s.N.ensureAbstracts=nodes=>new Promise(r=>release=()=>r(nodes.map(n=>({...n,abstract:'Completed abstract'}))));s.N.map=async p=>{if(p.mode==='topics'){topics++;assert.equal(p.nodes[0].abstract,'Completed abstract');}else authors++;return {nodes:p.nodes};};
 const snapshot={},p={mode:'topics',nodes:[{id:'1'}]};const t=s.N.graphJob(snapshot,p),a=s.N.graphJob(snapshot,{...p,mode:'authors'});await a.promise;assert.equal(authors,1);assert.equal(topics,0);release();await t.promise;assert.equal(topics,1);
});
