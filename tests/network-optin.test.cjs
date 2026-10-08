const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function fixture(enabled=false){
 const calls={reads:[],scans:0,starts:0,stops:0,observers:0,unregistered:0,bibliographyCancelled:0},timers=new Map(),ctx=vm.createContext({Map,Set,Promise,PathUtils:{join:(...x)=>x.join('/'),parent:()=>'/qa'},CiteLensServices:{path:'/qa/services.json',state:{settings:{networkEnabled:enabled}}},Zotero:{getMainWindow:()=>({clearTimeout:id=>timers.delete(id),setTimeout:fn=>(timers.set(1,fn),1)}),logError(){},Notifier:{registerObserver:()=>++calls.observers,unregisterObserver:()=>calls.unregistered++},Promise:{delay:async()=>{}},Libraries:{getAll:()=>{calls.scans++;return[];}}},IOUtils:{exists:async p=>(calls.reads.push(p),false)},CiteLensSemantic:{start:()=>calls.starts++,stop:async()=>calls.stops++}});
 vm.runInContext(fs.readFileSync('addon/network.js','utf8'),ctx);const N=ctx.CiteLensNetwork;N.workers.add({cancel:()=>calls.bibliographyCancelled++});return{N,ctx,calls,timers};
}
test('disabled internal service never scans libraries or cancels reading jobs',async()=>{
 for(const saved of [false,undefined,'true',1]){const {N,ctx,calls,timers}=fixture(saved);await N.start();await N.setEnabled(false);N.scheduleWarmup();await N.warmup();await assert.rejects(N.snapshot(),/未启用/);assert.equal(calls.scans,0);assert.equal(calls.starts,0);assert.equal(timers.size,0);assert.deepEqual(calls.reads,['/qa/network-citations.json']);assert.equal(calls.bibliographyCancelled,0);assert.equal(N.workers.size,1);}
});
test('enabling is idempotent, disabling cancels network jobs and retains reading workers and saved results',async()=>{
 const {N,ctx,calls}=fixture(true);await N.start();await N.setEnabled(true);await N.setEnabled(true);assert.equal(calls.starts,0);assert.equal(calls.observers,1);
 let aborted=0,closed=0;N.graphJobs.set('a',{controller:{abort:()=>aborted++}});N.views.add(()=>closed++);N.data={nodes:[{id:'a'}]};ctx.CiteLensServices.state.settings.networkEnabled=false;await N.setEnabled(false);assert.equal(aborted,1);assert.equal(closed,1);assert.equal(calls.stops,0);assert.equal(calls.unregistered,1);assert.equal(calls.bibliographyCancelled,0);assert.equal(N.data.nodes[0].id,'a');
 ctx.CiteLensServices.state.settings.networkEnabled=true;await N.setEnabled(true);assert.equal(calls.starts,0);assert.equal(N.data.nodes[0].id,'a');assert.equal(N.fullDirty,true);
});
test('rapid disable and re-enable leaves exactly one live observer',async()=>{
 const {N,ctx,calls}=fixture(true);await N.start();await N.setEnabled(true);ctx.CiteLensServices.state.settings.networkEnabled=false;const off=N.setEnabled(false);ctx.CiteLensServices.state.settings.networkEnabled=true;const on=N.setEnabled(true);await Promise.all([off,on]);assert.equal(N.active,true);assert.equal(calls.observers-calls.unregistered,1);assert.equal(calls.starts,0);
});
test('disabling during a library read prevents publishing a partial or stale network',async()=>{
 const {N,ctx,calls}=fixture(true);await N.start();await N.setEnabled(true);N.ensureNetworkData=async()=>{};ctx.Zotero.Libraries.getAll=()=>[{libraryID:1,libraryType:'user'}];ctx.Zotero.Collections={getByLibrary:()=>[]};let finish;ctx.Zotero.Items={getAll:()=>new Promise(r=>finish=r)};const pending=N.snapshot();await new Promise(r=>setImmediate(r));ctx.CiteLensServices.state.settings.networkEnabled=false;await N.setEnabled(false);finish([1]);await assert.rejects(pending,/已关闭/);assert.equal(N.data,undefined);assert.equal(N.dirty,true);assert.equal(calls.bibliographyCancelled,0);
});
test('packaged algorithm revisions load directly from jar resources without the HTTP path',async()=>{
 const {N,ctx}=fixture();const versions={schema:1,...Object.fromEntries(['authors','abstracts','input','snapshot'].map(k=>[k,'a'.repeat(64)]))};ctx.CiteLens={rootURI:'jar:file:///qa/plugin.xpi!/'};ctx.Zotero.File={getContentsFromURLAsync:()=>{throw Error('HTTP must not load jar resources');}};ctx.Services={scriptloader:{loadSubScript:(url,scope)=>{assert.equal(url,'jar:file:///qa/plugin.xpi!/network-revisions.js');scope.PaperNexusNetworkRevisions=versions;}}};await N.start();assert.equal(N.revisions.authors,versions.authors);
});
test('failed revision loading cannot reuse a fixed release-only algorithm fingerprint',async()=>{
 const {N,ctx}=fixture();ctx.CiteLens={rootURI:'jar:file:///qa/plugin.xpi!/',version:'fixed'};ctx.Services={scriptloader:{loadSubScript:()=>{throw Error('missing resource');}}};await N.start();assert.match(N.revisions.authors,/:unverified:/);assert.ok(!N.revisions.authors.endsWith(':fixed'));
});
