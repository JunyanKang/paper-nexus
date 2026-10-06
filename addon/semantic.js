/* Local-first semantic vectors. Worker inference and content-keyed caches keep Zotero responsive. */
var CiteLensSemantic={
 version:'minilm-751bff3-v2',dead:true,cache:new Map(),workers:new Set(),records:new Map(),
 start(){this.dead=false;this.encodeEpoch=(this.encodeEpoch||0)+1;this.encodeTail=Promise.resolve();this.encoder=null;this.model=null;this.store=null;this.pendingVectors=new Map();this.fieldCache=new Map();this.cache=new Map();this.records=new Map();this.loaded=null;this.modelChange=Promise.resolve();this.write=Promise.resolve();this.path=PathUtils.join(PathUtils.parent(CiteLensServices.path),'semantic-vectors.json');},
 useModel(model){const job=(this.modelChange||Promise.resolve()).catch(()=>{}).then(async()=>{if(this.model?.cacheKey===model?.cacheKey&&this.model?.baseURL===model?.baseURL)return;this.encodeEpoch++;for(const w of [...this.workers])w.cancel();await this.write?.catch(()=>{});if(this.dead)throw Error('已取消');this.model=model;this.version=model?.cacheKey||this.version;this.cache.clear();this.records.clear();this.pendingVectors=new Map();this.fieldCache=new Map();this.store=null;this.loaded=null;delete this.adapterValue;});this.modelChange=job;return job;},
 async load(){if(this.loaded)return this.loaded;const model=await CiteLensModels.prepare();await this.useModel(model);if(this.loaded)return this.loaded;this.loaded=(async()=>{this.store=await new CiteLensVectorStore(PathUtils.parent(CiteLensServices.path),this.version).load();
  // The old MiniLM cache is imported once; it remains available for rollback.
  if(!this.store.entries.size&&model.id==='minilm')try{if(await IOUtils.exists(this.path)&&(await IOUtils.stat(this.path)).size<40*1024*1024){const old=JSON.parse(await IOUtils.readUTF8(this.path));if(old.version===this.version){const entries=(old.entries||[]).filter(([k,v])=>/^[a-f0-9]{64}$/.test(k)&&this.validVector(v));await this.store.put(entries,new Map());}}}catch(e){Zotero.logError(e);}
 })();return this.loaded;},
 validVector(v){return Array.isArray(v)&&v.length===384&&v.every(Number.isFinite);},
 async key(text,scope=this.version){const bytes=new (Zotero.getMainWindow().TextEncoder)().encode(scope+'\0'+text),buffer=await Zotero.getMainWindow().crypto.subtle.digest('SHA-256',bytes);return Array.from(new Uint8Array(buffer),x=>x.toString(16).padStart(2,'0')).join('');},
 async persist(){if(!this.store)return;const pending=[...this.pendingVectors];this.pendingVectors.clear();this.write=this.store.put(pending,new Map());try{await this.write;}catch(e){for(const [key,v] of pending)this.pendingVectors.set(key,v);throw e;}},
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
   try{CiteLens.ensureAssets?.();worker=this.encoder;if(!worker){worker=new win.ChromeWorker('resource://'+CiteLens.assetResource+'/semantic-worker.js');this.encoder=worker;this.workers.add(worker);}win.clearTimeout(worker.idleTimer);
    worker.cancel=()=>{if(done)dispose();else cancel();};worker.onmessage=e=>{const data=e.data;if(data.error)finish(Error(data.error));else if(data.ready){worker.ready=true;worker.postMessage({id:'encode',texts});}else if(data.vectors)finish(null,data.vectors);else if(data.progress)progress(data.progress,data.total);};worker.onerror=()=>finish(Error('本地模型加载失败，请在设置中重新安装模型'));signal?.addEventListener('abort',cancel,{once:true});timer=win.setTimeout(()=>finish(Error('本地模型处理超时，请缩小文献夹范围')),15*60*1000);worker.postMessage(worker.ready?{id:'encode',texts}:{id:'init',init:this.model?{model:this.model.baseURL+'model.onnx',tokenizerURL:this.model.baseURL+'tokenizer.json',wasm:this.model.baseURL+'runtime.wasm',pooling:this.model.pooling,maxTokens:this.model.maxTokens}:{}});
   }catch(_){finish(Error('本地模型加载失败，请在设置中重新安装模型'));}
  });
 },
 async analyze(nodes,{signal,progress=()=>{}}={}){
  progress({phase:'model',completed:0,total:1});await this.load();progress({phase:'model',completed:1,total:1});const epoch=this.encodeEpoch;const check=()=>{if(this.dead||signal?.aborted||epoch!==this.encodeEpoch)throw Error('已取消');};check();const byText=new Map(),fields=[];let turns=0;
  for(const n of nodes){const {title,abstract}=CiteLensCore.researchRecord(n),cached=this.fieldCache?.get(n.id);let entry;if(cached&&cached.title===title&&cached.abstract===abstract){entry={...cached.entry,keys:[...cached.entry.keys]};for(const row of cached.texts)byText.set(row.text,row);}else{const chunks=CiteLensSemanticCore.abstractChunks(abstract);entry={id:n.id,title,keys:[]};const texts=[];for(const text of (this.model?.input==='joint'?[title+(abstract?'\n'+abstract:'')]:[title,...chunks]).filter(Boolean)){check();if(!byText.has(text))byText.set(text,{text,key:await this.key(text)});const row=byText.get(text);entry.keys.push(row.key);texts.push(row);}this.fieldCache?.set(n.id,{title,abstract,entry:{...entry},texts});}fields.push(entry);if(++turns%24===0)await Zotero.Promise.delay(0);}
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
  // Preserve unchanged records across collection switches and reference expansion.
  while(this.fieldCache?.size>12000)this.fieldCache.delete(this.fieldCache.keys().next().value);
  while(this.records.size>12000)this.records.delete(this.records.keys().next().value);
  return {vectors,signatures,engine:'local',personalized:!!adapter,cached:byText.size-missing.length,encoded:missing.length,combined};
 },
 async stop(){this.dead=true;this.encodeEpoch=(this.encodeEpoch||0)+1;for(const worker of [...this.workers])worker.cancel();this.workers.clear();await this.write?.catch(()=>{});this.cache.clear();this.records.clear();this.fieldCache?.clear();this.loaded=null;delete this.adapterValue;}
};
