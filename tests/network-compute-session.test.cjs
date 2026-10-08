const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function setup(){const workers=[],win={crypto:require("node:crypto").webcrypto,TextEncoder,setTimeout,clearTimeout,ChromeWorker:class{constructor(){workers.push(this);this.sent=[];this.terminated=false;}postMessage(value){this.sent.push(value);}terminate(){this.terminated=true;}}},ctx=vm.createContext({CiteLens:{ensureAssets(){},assetResource:'fixture'},Zotero:{getMainWindow:()=>win}});vm.runInContext(fs.readFileSync('addon/network.js','utf8'),ctx);ctx.CiteLensNetwork.dead=false;return{N:ctx.CiteLensNetwork,workers,win};}
test('one worker serializes computations, forwards progress, and handles false/empty results',async()=>{
 const {N,workers}=setup(),session=N.computeSession(),progress=[],one=session.compute('first',{n:1},{progress:p=>progress.push(p)}),two=session.compute('second',{n:2});assert.equal(workers.length,1);const w=workers[0];assert.equal(w.sent.length,1);w.onmessage({data:{progress:{completed:1}}});assert.equal(progress.length,1);w.onmessage({data:{result:false}});assert.equal(await one,false);assert.equal(w.sent.length,2);w.onmessage({data:{result:[]}});assert.equal((await two).length,0);assert.equal(N.workers.size,1);session.close();assert.equal(N.workers.size,0);assert.equal(w.terminated,true);await assert.rejects(session.compute('closed',{}),/已取消/);
});
test('aborting or stopping a worker session rejects active and queued jobs and releases the worker',async()=>{
 const {N,workers}=setup(),controller=new AbortController(),session=N.computeSession({signal:controller.signal}),pending=Promise.allSettled([session.compute('a',{}),session.compute('b',{})]);controller.abort();const results=await pending;assert.ok(results.every(r=>r.status==='rejected'));assert.equal(N.workers.size,0);assert.equal(workers[0].terminated,true);assert.equal(session.closed,true);
 const next=N.computeSession(),task=next.compute('c',{});workers[1].cancel();await assert.rejects(task,/已关闭/);assert.equal(N.workers.size,0);
});
test('request errors do not cross-wire queued replies and native worker errors close the session',async()=>{
 const {N,workers}=setup(),session=N.computeSession(),one=session.compute('bad',{}),two=session.compute('good',{}),failure=assert.rejects(one,/fixture/),w=workers[0];w.onmessage({data:{error:'fixture'}});await failure;w.onmessage({data:{result:{ok:true}}});assert.equal((await two).ok,true);const pending=session.compute('crash',{});w.onerror({message:'worker crash'});await assert.rejects(pending,/worker crash/);assert.equal(session.closed,true);assert.equal(N.workers.size,0);
});
test('cache hashing can use the same worker session instead of creating another worker',async()=>{
 const {N,workers}=setup();N.cacheRoot='/fixture';const session=N.computeSession(),hash=N.cacheKey({original:'source'},session.compute);assert.equal(workers.length,1);assert.equal(workers[0].sent[0].action,'cache-encode');workers[0].onmessage({data:{result:{text:'encoded source'}}});assert.equal(await hash,require('node:crypto').createHash('sha256').update('network-cache-v3\0encoded source').digest('hex'));session.close();
});

test('search starts lazily, shares initialization, and suspends only after pending replies',async()=>{
 const {N,workers}=setup(),s=N.searchSession({mode:'authors',nodes:[],paperNodes:[]});assert.equal(workers.length,0);
 const a=s.query('Smith'),b=s.relations('id');assert.equal(workers.length,1);const w=workers[0];assert.equal(w.sent[0].action,'search-init');s.suspend();assert.equal(w.terminated,false);w.onmessage({data:{ready:true}});await Promise.resolve();assert.equal(w.sent.length,3);
 for(const m of w.sent.slice(1))w.onmessage({data:{request:m.payload.request,result:m.action}});assert.equal(await a,'search-query');assert.equal(await b,'author-links');assert.equal(w.terminated,true);assert.equal(N.workers.size,0);assert.equal(s.closed,false);
 const next=s.neighborhood('id',1,100);assert.equal(workers.length,2);const w2=workers[1];w2.onmessage({data:{ready:true}});await Promise.resolve();w2.onmessage({data:{request:w2.sent[1].payload.request,result:{nodes:[]}}});assert.equal((await next).nodes.length,0);s.close();assert.equal(w2.terminated,true);await assert.rejects(s.query('closed'),/已取消/);
});
test('search close during initialization and worker failure reject all waiters',async()=>{
 for(const fail of [w=>w.cancel(),w=>w.onerror({message:'failed'})]){const {N,workers}=setup(),s=N.searchSession({nodes:[]}),outcomes=Promise.allSettled([s.query('one'),s.query('two')]);fail(workers[0]);assert.ok((await outcomes).every(r=>r.status==='rejected'));assert.equal(s.closed,true);assert.equal(N.workers.size,0);}
});
test('search idle timeout releases the worker without closing the reusable session',async()=>{
 const {N,workers,win}=setup(),timers=new Map();let serial=0;win.setTimeout=(fn,ms)=>{timers.set(++serial,{fn,ms});return serial;};win.clearTimeout=id=>timers.delete(id);const s=N.searchSession({nodes:[]}),p=s.query('test'),w=workers[0];w.onmessage({data:{ready:true}});await Promise.resolve();w.onmessage({data:{request:w.sent[1].payload.request,result:[]}});await p;const idle=[...timers.values()].find(t=>t.ms===30000);assert.ok(idle);idle.fn();assert.equal(N.workers.size,0);assert.equal(s.closed,false);s.close();
});
