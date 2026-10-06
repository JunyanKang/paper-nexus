/* Local-first semantic vectors. Worker inference and content-keyed caches keep Zotero responsive. */
var CiteLensSemantic={
 version:'minilm-751bff3-v2',dead:true,cache:new Map(),workers:new Set(),records:new Map(),cloud:new Map(),
 start(){this.dead=false;this.encodeEpoch=(this.encodeEpoch||0)+1;this.encodeTail=Promise.resolve();this.encoder=null;this.model=null;this.store=null;this.pendingVectors=new Map();this.fieldCache=new Map();this.cache=new Map();this.records=new Map();this.cloud=new Map();this.loaded=null;this.modelChange=Promise.resolve();this.write=Promise.resolve();this.groupingCache=new Map();this.groupingLoaded=null;this.groupingTail=Promise.resolve();this.groupingWrite=Promise.resolve();this.groupingPath=PathUtils.join(PathUtils.parent(CiteLensServices.path),'network-api-groups.json');this.path=PathUtils.join(PathUtils.parent(CiteLensServices.path),'semantic-vectors.json');},
 useModel(model){const job=(this.modelChange||Promise.resolve()).catch(()=>{}).then(async()=>{if(this.model?.cacheKey===model?.cacheKey&&this.model?.baseURL===model?.baseURL)return;this.encodeEpoch++;for(const w of [...this.workers])w.cancel();await this.write?.catch(()=>{});if(this.dead)throw Error('已取消');this.model=model;this.version=model?.cacheKey||this.version;this.cache.clear();this.records.clear();this.cloud.clear();this.pendingVectors=new Map();this.fieldCache=new Map();this.store=null;this.loaded=null;delete this.adapterValue;});this.modelChange=job;return job;},
 async load(){if(this.loaded)return this.loaded;const model=await CiteLensModels.prepare();await this.useModel(model);if(this.loaded)return this.loaded;this.loaded=(async()=>{this.store=await new CiteLensVectorStore(PathUtils.parent(CiteLensServices.path),this.version).load();this.cloud=new Map(this.store.topics);
  // The old MiniLM cache is imported once; it remains available for rollback.
  if(!this.store.entries.size&&model.id==='minilm')try{if(await IOUtils.exists(this.path)&&(await IOUtils.stat(this.path)).size<40*1024*1024){const old=JSON.parse(await IOUtils.readUTF8(this.path));if(old.version===this.version){const entries=(old.entries||[]).filter(([k,v])=>/^[a-f0-9]{64}$/.test(k)&&this.validVector(v));this.cloud=new Map(old.topics||[]);await this.store.put(entries,this.cloud);}}}catch(e){Zotero.logError(e);}
 })();return this.loaded;},
 validVector(v){return Array.isArray(v)&&v.length===384&&v.every(Number.isFinite);},
 async key(text,scope=this.version){const bytes=new (Zotero.getMainWindow().TextEncoder)().encode(scope+'\0'+text),buffer=await Zotero.getMainWindow().crypto.subtle.digest('SHA-256',bytes);return Array.from(new Uint8Array(buffer),x=>x.toString(16).padStart(2,'0')).join('');},
 async persist(){if(!this.store)return;const pending=[...this.pendingVectors];this.pendingVectors.clear();this.write=this.store.put(pending,this.cloud);try{await this.write;}catch(e){for(const [key,v] of pending)this.pendingVectors.set(key,v);throw e;}},
 async adapter(){if(this.model?.id!=='minilm')return null;if(this.adapterValue!==undefined)return this.adapterValue;this.adapterValue=null;try{const response=await Zotero.getMainWindow().fetch('resource://'+CiteLens.assetResource+'/models/personal/adapter.json');if(response.ok){const value=await response.json();if(CiteLensSemanticCore.validAdapter(value))this.adapterValue=value;}}catch(_){}return this.adapterValue;},
 async encode(texts,options={}){
  if(!this.model&&typeof CiteLensModels!=='undefined')await this.load();
  const epoch=this.encodeEpoch;
  // Multiple network windows share one inference lane, not one model per window.
  const task=(this.encodeTail||Promise.resolve()).catch(()=>{}).then(()=>{if(this.dead||epoch!==this.encodeEpoch||options.signal?.aborted)throw Error('已取消');return this.encodeBatch(texts,options);});
  this.encodeTail=task.catch(()=>{});return task;
 },
 async encodeBatch(texts,{signal,progress=()=>{}}={}){
  if(this.dead||signal?.aborted)throw Error('已取消');if(!texts.length)return [];
  const win=Zotero.getMainWindow();return new Promise((resolve,reject)=>{let worker,timer,done=false;
   const dispose=()=>{if(!worker)return;win.clearTimeout(worker.idleTimer);worker.terminate();this.workers.delete(worker);if(this.encoder===worker)this.encoder=null;};
   const finish=(error,result)=>{if(done)return;done=true;win.clearTimeout(timer);signal?.removeEventListener('abort',cancel);if(error)dispose();else worker.idleTimer=win.setTimeout(dispose,8000);error?reject(error):resolve(result);},cancel=()=>finish(Error('已取消'));
   try{worker=this.encoder;if(!worker){worker=new win.ChromeWorker('resource://'+CiteLens.assetResource+'/semantic-worker.js');this.encoder=worker;this.workers.add(worker);}win.clearTimeout(worker.idleTimer);
    worker.cancel=()=>{if(done)dispose();else cancel();};worker.onmessage=e=>{const data=e.data;if(data.error)finish(Error(data.error));else if(data.ready){worker.ready=true;worker.postMessage({id:'encode',texts});}else if(data.vectors)finish(null,data.vectors);else if(data.progress)progress(data.progress,data.total);};worker.onerror=()=>finish(Error('本地模型加载失败，请在设置中重新安装模型'));signal?.addEventListener('abort',cancel,{once:true});timer=win.setTimeout(()=>finish(Error('本地模型处理超时，请缩小文献夹范围')),15*60*1000);worker.postMessage(worker.ready?{id:'encode',texts}:{id:'init',init:this.model?{model:this.model.baseURL+'model.onnx',tokenizerURL:this.model.baseURL+'tokenizer.json',wasm:this.model.baseURL+'runtime.wasm',pooling:this.model.pooling,maxTokens:this.model.maxTokens}:{}});
   }catch(_){finish(Error('本地模型加载失败，请在设置中重新安装模型'));}
  });
 },
 async analyze(nodes,{signal,progress=()=>{}}={}){
  progress({phase:'model',completed:0,total:1});await this.load();progress({phase:'model',completed:1,total:1});const epoch=this.encodeEpoch;const check=()=>{if(this.dead||signal?.aborted||epoch!==this.encodeEpoch)throw Error('已取消');};check();const byText=new Map(),fields=[];let turns=0;
  for(const n of nodes){const title=CiteLensCore.researchTitle(n),abstract=CiteLensCore.plainTitle(n.abstract||''),cached=this.fieldCache?.get(n.id);let entry;if(cached&&cached.title===title&&cached.abstract===abstract){entry={...cached.entry,keys:[...cached.entry.keys]};for(const row of cached.texts)byText.set(row.text,row);}else{const chunks=CiteLensSemanticCore.abstractChunks(abstract);entry={id:n.id,title,keys:[]};const texts=[];for(const text of (this.model?.input==='joint'?[title+(abstract?'\n'+abstract:'')]:[title,...chunks]).filter(Boolean)){check();if(!byText.has(text))byText.set(text,{text,key:await this.key(text)});const row=byText.get(text);entry.keys.push(row.key);texts.push(row);}this.fieldCache?.set(n.id,{title,abstract,entry:{...entry},texts});}fields.push(entry);if(++turns%24===0)await Zotero.Promise.delay(0);}
  const adapter=await this.adapter(),adapterKey=adapter?await this.key(JSON.stringify(adapter)):'base',needed=new Set();for(const f of fields){f.signature=JSON.stringify([this.version,adapterKey,f.keys]);if(this.records.get(f.id)?.signature!==f.signature)for(const key of f.keys)needed.add(key);}
  const disk=this.store?await this.store.getMany([...needed].filter(key=>!this.cache.has(key)),{signal}):new Map();for(const [key,v] of disk)this.cache.set(key,v);const available=new Map(this.cache),missing=[...byText.values()].filter(x=>needed.has(x.key)&&!this.cache.has(x.key));progress({phase:'encoding',completed:byText.size-missing.length,total:byText.size});
  // Bounded chunks keep completed work reusable after cancellation, library edits, and reopening.
  for(let at=0;at<missing.length;at+=96){check();const batch=missing.slice(at,at+96),vectors=await this.encode(batch.map(x=>x.text),{signal,progress:(done)=>progress({phase:'encoding',completed:byText.size-missing.length+at+done,total:byText.size})});check();if(vectors.length!==batch.length||vectors.some(v=>!this.validVector(v)))throw Error('本地模型返回了无效向量');batch.forEach((x,i)=>{this.cache.set(x.key,vectors[i]);this.pendingVectors?.set(x.key,vectors[i]);available.set(x.key,vectors[i]);});while(this.cache.size>4500)this.cache.delete(this.cache.keys().next().value);await this.persist();}
  check();const vectors=[],signatures=[];let combined=0;
  for(const f of fields){check();const signature=f.signature,cached=this.records.get(f.id);signatures.push(signature);
   if(cached?.signature===signature){vectors.push(cached.vector);continue;}
   let vector;if(!f.keys.length)vector=Array(384).fill(0);else {const first=available.get(f.keys[0]),parts=(f.title?f.keys.slice(1):f.keys).map(k=>available.get(k));
    const mean=parts.length?CiteLensSemanticCore.normalize(Array.from({length:384},(_,i)=>parts.reduce((sum,v)=>sum+v[i],0)/parts.length)):null;
    vector=this.model?.input==='joint'?first:f.title?CiteLensSemanticCore.combine(first,mean,adapter):CiteLensSemanticCore.project(mean,adapter);
   }this.records.set(f.id,{signature,vector});vectors.push(vector);if(++combined%16===0)await Zotero.Promise.delay(0);
  }
  const assignments=null,classified=0;
  // Preserve unchanged records across collection switches and reference expansion.
  while(this.fieldCache?.size>12000)this.fieldCache.delete(this.fieldCache.keys().next().value);
  while(this.records.size>12000)this.records.delete(this.records.keys().next().value);
  while(this.cloud.size>12000)this.cloud.delete(this.cloud.keys().next().value);
  return {vectors,signatures,assignments,engine:assignments?'llm':'local',personalized:!!adapter,cached:byText.size-missing.length,encoded:missing.length,combined,classified};
 },
 async loadGrouping(){if(this.groupingLoaded)return this.groupingLoaded;this.groupingCache ||= new Map();this.groupingLoaded=(async()=>{if(!this.groupingPath)return;try{if(await IOUtils.exists(this.groupingPath)&&(await IOUtils.stat(this.groupingPath)).size<24*1024*1024){const saved=JSON.parse(await IOUtils.readUTF8(this.groupingPath));if(saved.schema===1)for(const [key,row] of (saved.entries||[]).slice(-12000))if(typeof key==='string'&&row&&typeof row.topic==='string'&&typeof row.topicId==='string'&&/^api-topic:[a-f0-9]{64}$/.test(row.topicId))this.groupingCache.set(key,row);}}catch(e){Zotero.logError(e);}})();return this.groupingLoaded;},
 async persistGrouping(){while(this.groupingCache.size>12000)this.groupingCache.delete(this.groupingCache.keys().next().value);if(!this.groupingPath)return;const data=JSON.stringify({schema:1,entries:[...this.groupingCache]});this.groupingWrite=(this.groupingWrite||Promise.resolve()).catch(()=>{}).then(()=>IOUtils.writeUTF8(this.groupingPath,data,{tmpPath:this.groupingPath+'.tmp'}));await this.groupingWrite;},
 classifyTopics(nodes,options={}){const task=(this.groupingTail||Promise.resolve()).catch(()=>{}).then(()=>this.classifyTopicBatch(nodes,options));this.groupingTail=task.catch(()=>{});return task;},
 async classifyTopicBatch(nodes,{signal,progress=()=>{}}={}){
  await this.loadGrouping();const T=CiteLensTranslation,config=T.llmTaskConfig('clustering'),scope=JSON.stringify(['api-grouping-v1',config.id,config.endpoint,config.model]),epoch=this.encodeEpoch,check=()=>{if(this.dead||signal?.aborted||epoch!==this.encodeEpoch)throw Error('已取消');};
  const pending=[],rows=[],catalog=new Map(),canonical=new Map();let scanned=0;
  const add=(entry,paper)=>{rows.push({id:paper.id,topic:entry.topic,topicId:entry.topicId,keywords:[]});if(!catalog.has(entry.topicId))catalog.set(entry.topicId,{id:entry.topicId,topic:entry.topic,examples:[]});const group=catalog.get(entry.topicId);if(group.examples.length<2)group.examples.push(paper.title);canonical.set(entry.topic.toLocaleLowerCase(),entry.topicId);};
  for(const node of [...nodes].sort((a,b)=>a.id.localeCompare(b.id))){check();const paper={id:node.id,title:CiteLensCore.researchTitle(node),abstract:CiteLensCore.plainTitle(node.abstract||'')};if(!paper.title)continue;const key=await this.key(scope+'\0'+JSON.stringify([paper.title,paper.abstract]),'api-grouping'),entry=this.groupingCache.get(key);if(entry)add(entry,paper);else pending.push({paper,key});if(++scanned%24===0)await Zotero.Promise.delay(0);}
  const cached=rows.length;progress({phase:'classification',completed:cached,total:cached+pending.length});
  const terms=text=>new Set((text.toLocaleLowerCase().match(/[\p{L}\p{N}]{3,}/gu)||[]));
  for(let at=0;at<pending.length;at+=24){check();const batch=pending.slice(at,at+24),query=terms(batch.map(x=>x.paper.title+' '+x.paper.abstract.slice(0,600)).join(' '));
   // A bounded candidate catalogue helps the API join existing topics across batches.
   // Retrieval chooses context only; group membership and names come from the API.
   const topics=[...catalog.values()].map(t=>({t,score:[...terms(t.topic+' '+t.examples.join(' '))].filter(w=>query.has(w)).length})).sort((a,b)=>b.score-a.score||a.t.id.localeCompare(b.t.id)).slice(0,64).map(x=>x.t);
   const result=await T.clusterLLM(batch.map(x=>x.paper),{config,topics,signal});check();const expected=new Set(batch.map(x=>x.paper.id));if(!Array.isArray(result)||result.length!==expected.size||result.some(r=>!expected.delete(r.id)))throw Error('模型未完成全部文献的主题分组');
   for(const row of result){const source=batch.find(x=>x.paper.id===row.id),existing=topics.find(t=>t.id===row.topicId),topic=existing?.topic||row.topic,topicId=existing?.id||canonical.get(topic.toLocaleLowerCase())||'api-topic:'+await this.key(scope+'\0'+topic.toLocaleLowerCase(),'api-group-id');const entry={topic,topicId};this.groupingCache.set(source.key,entry);add(entry,source.paper);}
   await this.persistGrouping();progress({phase:'classification',completed:cached+Math.min(at+24,pending.length),total:cached+pending.length});await Zotero.Promise.delay(0);
  }check();return {assignments:rows,classified:pending.length,assignmentCached:cached,engine:'llm',authoritative:true};
 },
 async classifyAuthors(graph,{signal,progress=()=>{}}={}){
  const authors=graph.nodes.filter(n=>n.kind==='author'),byID=new Map(authors.map(n=>[n.id,n])),near=new Map(authors.map(n=>[n.id,[]])),edges=graph.edges.filter(e=>e.kind==='coauthor');
  for(const e of edges){near.get(e.source)?.push(e.target);near.get(e.target)?.push(e.source);}
  const seen=new Set(),components=[];for(const a of authors){if(seen.has(a.id))continue;const ids=[a.id];seen.add(a.id);for(let i=0;i<ids.length;i++)for(const id of near.get(ids[i])||[])if(!seen.has(id)){seen.add(id);ids.push(id);}components.push(ids);}
  const T=CiteLensTranslation,config=T.llmTaskConfig('clustering'),scope=JSON.stringify(['author-groups-v1',config.id,config.endpoint,config.model]),papers=new Map((graph.paperNodes||[]).map(p=>[p.id,p])),groups=[];let classified=0,cached=0,fallback=0;
  for(let i=0;i<components.length;i++){
   if(this.dead||signal?.aborted)throw Error('已取消');const ids=components[i],members=new Set(ids);progress({phase:'authorClassification',completed:i,total:components.length});
   if(ids.length===1){groups.push({members:ids,title:byID.get(ids[0]).title});continue;}
   // Large consortium components stay in the bounded local worker, never in an oversized prompt.
   if(ids.length>80){fallback+=ids.length;continue;}
   const input=ids.sort().map(id=>{const n=byID.get(id);return{id,title:n.title,papers:n.members.map(pid=>CiteLensCore.researchTitle(papers.get(pid)||{})).filter(Boolean).sort().slice(0,2)};}),links=edges.filter(e=>members.has(e.source)&&members.has(e.target)).sort((a,b)=>(a.source+a.target).localeCompare(b.source+b.target));
   const key=await this.key(scope+'\0'+JSON.stringify([input,links]),'author-grouping');let rows=await CiteLensNetwork.readCache('author',key);if(rows)cached+=ids.length;else{rows=await T.groupAuthorsLLM(input,links,{signal});if(this.dead||signal?.aborted)throw Error('已取消');await CiteLensNetwork.writeCache('author',key,rows);classified+=ids.length;}
   groups.push(...rows);await Zotero.Promise.delay(0);
  }
  progress({phase:'authorClassification',completed:components.length,total:components.length});return{groups,classified,cached,fallback};
 },
 async nameGroups(groups,nodes,{signal,progress=()=>{}}={}){
  await this.load();const epoch=this.encodeEpoch,config=CiteLensTranslation.llmTaskConfig('clustering'),scope=JSON.stringify(['group-names-v3',config.id,config.endpoint,config.model]),byID=new Map(nodes.map(n=>[n.id,n])),pending=[],labels=new Map();
  for(const group of groups){if(this.dead||signal?.aborted||epoch!==this.encodeEpoch)throw Error('已取消');const papers=group.members.map(id=>byID.get(id)).filter(Boolean).map(n=>({title:CiteLensCore.researchTitle(n),abstract:CiteLensCore.plainTitle(n.abstract||'')})).sort((a,b)=>a.title.localeCompare(b.title));
   const key=await this.key(scope+'\0'+JSON.stringify(papers)),cached=this.cloud.get(key);if(cached)labels.set(group.id,cached.topic);else {const selected=(group.representatives||[]).map(id=>byID.get(id)).filter(Boolean).slice(0,8).map(n=>({title:CiteLensCore.researchTitle(n),abstract:CiteLensCore.plainTitle(n.abstract||'')}));pending.push({id:group.id,key,papers:selected.length?selected:papers.slice(0,8)});}
  }
  for(let at=0;at<pending.length;at+=6){if(this.dead||signal?.aborted||epoch!==this.encodeEpoch)throw Error('已取消');progress({phase:'naming',completed:at,total:pending.length});const batch=pending.slice(at,at+6),rows=await CiteLensTranslation.nameTopicsLLM(batch.map(g=>({id:g.id,papers:g.papers.slice(0,8)})),{signal});
   if(this.dead||signal?.aborted||epoch!==this.encodeEpoch)throw Error('已取消');for(const row of rows){const group=batch.find(g=>g.id===row.id);this.cloud.set(group.key,{topic:row.topic});labels.set(row.id,row.topic);}await this.persist();
  }progress({phase:'naming',completed:pending.length,total:pending.length});return {labels,named:pending.length,cached:groups.length-pending.length};
 },
 async stop(){this.dead=true;this.encodeEpoch=(this.encodeEpoch||0)+1;for(const worker of [...this.workers])worker.cancel();this.workers.clear();await this.write?.catch(()=>{});await this.groupingWrite?.catch(()=>{});this.cache.clear();this.records.clear();this.fieldCache?.clear();this.cloud.clear();this.loaded=null;delete this.adapterValue;}
};
