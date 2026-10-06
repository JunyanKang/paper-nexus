/* Local-first semantic vectors. Worker inference and content-keyed caches keep Zotero responsive. */
var CiteLensSemantic={
 version:'minilm-751bff3-v2',dead:true,cache:new Map(),workers:new Set(),records:new Map(),cloud:new Map(),
 start(){this.dead=false;this.cache=new Map();this.records=new Map();this.cloud=new Map();this.loaded=null;this.write=Promise.resolve();this.path=PathUtils.join(PathUtils.parent(CiteLensServices.path),'semantic-vectors.json');},
 async load(){if(this.loaded)return this.loaded;this.loaded=(async()=>{try{if(await IOUtils.exists(this.path)&&(await IOUtils.stat(this.path)).size<40*1024*1024){const data=JSON.parse(await IOUtils.readUTF8(this.path));if(data.version===this.version){for(const [key,value] of data.entries||[])if(this.validVector(value))this.cache.set(key,value);for(const [key,value] of data.topics||[])if(typeof key==='string'&&typeof value?.topic==='string')this.cloud.set(key,value);}}}catch(_){} })();return this.loaded;},
 validVector(v){return Array.isArray(v)&&v.length===384&&v.every(Number.isFinite);},
 async key(text){const bytes=new (Zotero.getMainWindow().TextEncoder)().encode(this.version+'\0'+text),buffer=await Zotero.getMainWindow().crypto.subtle.digest('SHA-256',bytes);return Array.from(new Uint8Array(buffer),x=>x.toString(16).padStart(2,'0')).join('');},
 async persist(){const entries=[...this.cache].slice(-4500).map(([key,value])=>[key,value.map(x=>Math.round(x*1e6)/1e6)]);this.write=this.write.catch(()=>{}).then(()=>IOUtils.writeUTF8(this.path,JSON.stringify({version:this.version,entries,topics:[...this.cloud].slice(-12000)}),{tmpPath:this.path+'.tmp'}));return this.write;},
 async adapter(){if(this.adapterValue!==undefined)return this.adapterValue;this.adapterValue=null;try{const response=await Zotero.getMainWindow().fetch('resource://'+CiteLens.assetResource+'/models/personal/adapter.json');if(response.ok){const value=await response.json();if(CiteLensSemanticCore.validAdapter(value))this.adapterValue=value;}}catch(_){}return this.adapterValue;},
 async encode(texts,{signal,progress=()=>{}}={}){
  if(this.dead||signal?.aborted)throw Error('已取消');if(!texts.length)return [];
  const win=Zotero.getMainWindow();return new Promise((resolve,reject)=>{let worker,timer,done=false;const finish=(error,result)=>{if(done)return;done=true;win.clearTimeout(timer);signal?.removeEventListener('abort',cancel);if(worker){worker.terminate();this.workers.delete(worker);}error?reject(error):resolve(result);},cancel=()=>finish(Error('已取消'));
   try{worker=new win.ChromeWorker('resource://'+CiteLens.assetResource+'/semantic-worker.js');this.workers.add(worker);worker.cancel=cancel;worker.onmessage=e=>{const data=e.data;if(data.error)finish(Error(data.error));else if(data.ready)worker.postMessage({id:'encode',texts});else if(data.vectors)finish(null,data.vectors);else if(data.progress)progress(data.progress,data.total);};worker.onerror=()=>finish(Error('本地模型加载失败，请重新安装完整插件'));signal?.addEventListener('abort',cancel,{once:true});timer=win.setTimeout(()=>finish(Error('本地模型处理超时，请缩小文献夹范围')),15*60*1000);worker.postMessage({id:'init',init:{}});}catch(_){finish(Error('本地模型加载失败，请重新安装完整插件'));}
  });
 },
 async analyze(nodes,{signal,progress=()=>{}}={}){
  await this.load();const check=()=>{if(this.dead||signal?.aborted)throw Error('已取消');};check();const byText=new Map(),fields=[];let turns=0;
  for(const n of nodes){const title=CiteLensCore.researchTitle(n),chunks=CiteLensSemanticCore.abstractChunks(CiteLensCore.plainTitle(n.abstract||'')),entry={id:n.id,title,parts:chunks,keys:[]};for(const text of [title,...chunks].filter(Boolean)){check();if(!byText.has(text))byText.set(text,{text,key:await this.key(text)});entry.keys.push(byText.get(text).key);}fields.push(entry);if(++turns%24===0)await Zotero.Promise.delay(0);}
  const adapter=await this.adapter(),adapterKey=adapter?await this.key(JSON.stringify(adapter)):'base',needed=new Set();for(const f of fields){f.signature=JSON.stringify([this.version,adapterKey,f.keys]);if(this.records.get(f.id)?.signature!==f.signature)for(const key of f.keys)needed.add(key);}
  const available=new Map(this.cache),missing=[...byText.values()].filter(x=>needed.has(x.key)&&!this.cache.has(x.key));progress({phase:'encoding',completed:byText.size-missing.length,total:byText.size});
  // Bounded chunks keep completed work reusable after cancellation, library edits, and reopening.
  for(let at=0;at<missing.length;at+=96){check();const batch=missing.slice(at,at+96),vectors=await this.encode(batch.map(x=>x.text),{signal,progress:(done)=>progress({phase:'encoding',completed:byText.size-missing.length+at+done,total:byText.size})});check();if(vectors.length!==batch.length||vectors.some(v=>!this.validVector(v)))throw Error('本地模型返回了无效向量');batch.forEach((x,i)=>{this.cache.set(x.key,vectors[i]);available.set(x.key,vectors[i]);});while(this.cache.size>4500)this.cache.delete(this.cache.keys().next().value);await this.persist();}
  check();const vectors=[],signatures=[];let combined=0;
  for(const f of fields){check();const signature=f.signature,cached=this.records.get(f.id);signatures.push(signature);
   if(cached?.signature===signature){vectors.push(cached.vector);continue;}
   let vector;if(!f.keys.length)vector=Array(384).fill(0);else {const first=available.get(f.keys[0]),parts=(f.title?f.keys.slice(1):f.keys).map(k=>available.get(k));
    const mean=parts.length?CiteLensSemanticCore.normalize(Array.from({length:384},(_,i)=>parts.reduce((sum,v)=>sum+v[i],0)/parts.length)):null;
    vector=f.title?CiteLensSemanticCore.combine(first,mean,adapter):CiteLensSemanticCore.project(mean,adapter);
   }this.records.set(f.id,{signature,vector});vectors.push(vector);if(++combined%16===0)await Zotero.Promise.delay(0);
  }
  const assignments=null,classified=0;
  // Preserve unchanged records across collection switches and reference expansion.
  while(this.records.size>12000)this.records.delete(this.records.keys().next().value);
  while(this.cloud.size>12000)this.cloud.delete(this.cloud.keys().next().value);
  return {vectors,signatures,assignments,engine:assignments?'llm':'local',personalized:!!adapter,cached:byText.size-missing.length,encoded:missing.length,combined,classified};
 },
 async nameGroups(groups,nodes,{signal,progress=()=>{}}={}){
  await this.load();const config=CiteLensTranslation.llmTaskConfig('clustering'),scope=JSON.stringify(['group-names-v1',config.id,config.endpoint,config.model]),byID=new Map(nodes.map(n=>[n.id,n])),pending=[],labels=new Map();
  for(const group of groups){if(this.dead||signal?.aborted)throw Error('已取消');const papers=group.members.map(id=>byID.get(id)).filter(Boolean).map(n=>({title:CiteLensCore.researchTitle(n),abstract:CiteLensCore.plainTitle(n.abstract||'')})).sort((a,b)=>a.title.localeCompare(b.title));
   const key=await this.key(scope+'\0'+JSON.stringify(papers)),cached=this.cloud.get(key);if(cached)labels.set(group.id,cached.topic);else pending.push({id:group.id,key,papers});
  }
  for(let at=0;at<pending.length;at+=6){if(this.dead||signal?.aborted)throw Error('已取消');progress({phase:'naming',completed:at,total:pending.length});const batch=pending.slice(at,at+6),rows=await CiteLensTranslation.nameTopicsLLM(batch.map(g=>({id:g.id,papers:g.papers.slice(0,8)})),{signal});
   if(this.dead||signal?.aborted)throw Error('已取消');for(const row of rows){const group=batch.find(g=>g.id===row.id);this.cloud.set(group.key,{topic:row.topic});labels.set(row.id,row.topic);}await this.persist();
  }progress({phase:'naming',completed:pending.length,total:pending.length});return {labels,named:pending.length,cached:groups.length-pending.length};
 },
 async stop(){this.dead=true;for(const worker of [...this.workers])worker.cancel();this.workers.clear();await this.write?.catch(()=>{});this.cache.clear();this.records.clear();this.cloud.clear();this.loaded=null;delete this.adapterValue;}
};
