/* Factual coauthor networks derived from the user's Zotero library. */
var CiteLensNetwork = {
  partitionIndexes:new Map(),workers:new Set(),state:{schema:1,sources:{}},views:new Set(),listeners:new Set(),generation:0,dead:true,
  revisions:{references:'references-5',authors:'authors-8',abstracts:'abstracts-5',input:'input-2',snapshot:'snapshot-4'},
  isEnabled(){return typeof CiteLensServices!=='undefined'&&CiteLensServices.state?.settings?.networkEnabled===true;},
  cancelNetworkWork(){
    this.activityEpoch=(this.activityEpoch||0)+1;
    const win=Zotero.getMainWindow?.();win?.clearTimeout(this.warmupTimer);win?.clearTimeout(this.identityTimer);this.identityTimer=0;this.identityQueue?.clear();
    if(this.observer){Zotero.Notifier.unregisterObserver(this.observer);this.observer=null;}
    this.clearGraphJobs();
    for(const close of [...this.views])close();this.views.clear();
  },
  setEnabled(enabled){
    if(!enabled)this.cancelNetworkWork();
    const transition=async()=>{
      if(this.dead)return;
      if(!enabled){
        if(this.active)this.active=false;
        return;
      }
      if(!this.isEnabled()||this.active)return;
      this.active=true;this.fullDirty=true;this.dirty=true;

      try{
        if(!this.isEnabled()||this.dead)return;
        this.observer=Zotero.Notifier.registerObserver({notify:(event,type,ids)=>this.invalidate(event,type,ids)},['item','collection','collection-item'],'paper-nexus-network');
      }catch(e){this.active=false;throw e;}
    };
    const task=(this.transitionTail||Promise.resolve()).catch(()=>{}).then(transition);this.transitionTail=task;return task;
  },
  async start(){
    if(typeof CiteLens!=='undefined'&&typeof Services!=='undefined'&&Services.scriptloader){try{const scope={};Services.scriptloader.loadSubScript(CiteLens.rootURI+'network-revisions.js',scope);const versions=scope.PaperNexusNetworkRevisions;if(versions.schema!==1||!['references','authors','abstracts','input','snapshot'].every(k=>/^[a-f0-9]{64}$/.test(versions[k])))throw Error('Invalid network revisions');this.revisions=versions;}catch(e){Zotero.logError(e);for(const key of Object.keys(this.revisions))this.revisions[key]+=':unverified:'+Date.now();}}
    this.refreshSerial=0;
    this.dead=false;this.identityQueue=new Map();this.identitySeen=new Map();this.graphJobs=new Map();this.cacheRoot=PathUtils.join(PathUtils.parent(CiteLensServices.path),'network-cache-v3');this.cacheWrite=Promise.resolve();this.dirty=true;this.fullDirty=true;this.dirtyItems=new Set();this.records=new Map();this.attachmentParents=new Map();this.partitionIndexes=new Map();this.generation++;this.path=PathUtils.join(PathUtils.parent(CiteLensServices.path),'network-citations.json');
    try{if(await IOUtils.exists(this.path)){if((await IOUtils.stat(this.path)).size>30*1024*1024)throw Error('Cache too large');const data=JSON.parse(await IOUtils.readUTF8(this.path));if(data.schema!==1||!data.sources||typeof data.sources!=='object'||Array.isArray(data.sources))throw Error('Invalid cache');this.state=data;}}
    catch(e){Zotero.logError(e);this.state={schema:1,sources:{}};this.warning='关联缓存无法读取，可重新读取论文中的引文。';}
    this.indexPath=PathUtils.join(PathUtils.parent(this.path),'network-author-partitions.json');
    this.active=false;this.networkDataLoaded=false;this.networkDataFlight=null;
    // Reading uses reference caches; network-only state is loaded after explicit opt-in.
  },
  async ensureNetworkData(){
    if(this.networkDataLoaded)return;
    if(this.networkDataFlight)return this.networkDataFlight;
    const epoch=this.activityEpoch,check=()=>{if(this.dead||!this.isEnabled()||epoch!==this.activityEpoch)throw Error('已关闭');};
    const task=(async()=>{
      check();
      try{if(await IOUtils.exists(this.indexPath)&&(await IOUtils.stat(this.indexPath)).size<16*1024*1024){const saved=JSON.parse(await IOUtils.readUTF8(this.indexPath));check();if(saved.schema===1)this.partitionIndexes=new Map(saved.entries||[]);}}catch(e){check();Zotero.logError(e);}
      check();this.networkDataLoaded=true;
    })();this.networkDataFlight=task;
    try{await task;}finally{if(this.networkDataFlight===task)this.networkDataFlight=null;}
  },
  scheduleWarmup(delay=6000){
    if(this.dead||!this.isEnabled()||!Zotero.getMainWindow)return;const win=Zotero.getMainWindow();if(!win?.setTimeout)return;
    win.clearTimeout(this.warmupTimer);this.warmupTimer=win.setTimeout(()=>this.warmup().catch(e=>Zotero.logError(e)),delay);
  },
  async warmup(){
    if(this.dead||!this.isEnabled()||this.warming)return;this.warming=true;let failed=false;
    try{const snapshot=await this.snapshot();if(this.dead)return;
      // Warm the default library first, then the all-library view. No collection explosion.
      const library=String((Zotero.getActiveZoteroPane()?.getSelectedLibraryIDs?.()?.[0]||Zotero.getActiveZoteroPane()?.getSelectedLibraryID?.())||'');
      for(const scope of [...new Set([library,''])]){
        if(this.dead||!this.isEnabled())return;
        const nodes=this.scope(snapshot,scope,''),ids=new Set(nodes.map(n=>n.id));
        const job=this.graphJob(snapshot,{nodes,edges:snapshot.edges.filter(e=>ids.has(e.source)&&ids.has(e.target)),mode:'authors',cacheKey:scope+':',openEntities:[],limit:Number.MAX_SAFE_INTEGER,query:'',selected:'',positions:[]});
        const ready=await this.presentation(job);this.queueAuthorIdentity(ready.graph);await Zotero.Promise.delay(this.views.size?0:250);
      }

    }catch(e){failed=true;throw e;}finally{this.warming=false;if(!this.dead)this.scheduleWarmup(failed?180000:this.dirty?6000:6*3600000);}
  },
  invalidate(event,type,ids=[]){
    if(this.dead||!this.isEnabled())return;this.dirty=true;this.generation++;
    if(type==='item'&&ids.length){for(const raw of ids){const id=Number(raw);if(!Number.isFinite(id)){this.fullDirty=true;continue;}this.dirtyItems.add(id);const parent=this.attachmentParents.get(id);if(parent)this.dirtyItems.add(parent);}}
    else if(type==='collection-item'&&ids.length){for(const pair of ids){const id=Number(String(pair).split('-')[1]);if(Number.isFinite(id))this.dirtyItems.add(id);else this.fullDirty=true;}}
    else if(type!=='collection')this.fullDirty=true;
    this.scheduleWarmup();for(const f of this.listeners)f();
  },
  applyAbstract(n){
    if((n.abstract||'').length>=80||typeof CiteLensAbstracts==='undefined')return n;
    const result=CiteLensAbstracts.cached(CiteLensServices,n);
    if(result?.status==='available'&&result.text?.length>=80&&CiteLensAbstracts.select(n,[result.record]))return {...n,abstract:result.text,abstractMarkup:result.text,abstractSource:result.source,abstractURL:result.url};return n;
  },
  async readRecord(item){
    if(!item||typeof item.isRegularItem!=='function'||!item.isRegularItem()||item.deleted)return null;
    let creators=item.getCreators().filter(a=>Zotero.CreatorTypes.getName(a.creatorTypeID)==='author');const attachments=[],doi=CiteLensCore.doi(item.getField('DOI'));
    // Reuse identity evidence already fetched while reading; graph construction
    // does not request remote author identity analysis.
    if(doi){const authors=CiteLensServices.state?.authorCache?.['doi:'+doi]?.value,lookup=CiteLensServices.state?.cache?.['doi:'+doi]?.value,record=lookup?.status==='matched'?lookup.ranked?.[0]?.record:lookup?.doiRecord&&CiteLensCore.norm(lookup.doiRecord.title)===CiteLensCore.norm(item.getField('title'))?lookup.doiRecord:null;
      for(const source of [record&&CiteLensCore.recordDOI(record)===doi?record.creators:null,authors&&CiteLensCore.doi(authors.DOI)===doi?authors.authors:null])if(Array.isArray(source))creators=CiteLensNetworkCore.enrichCreators(creators,source);
    }
    for(const a of await Zotero.Items.getAsync(item.getAttachments()))if(!a.deleted&&['application/pdf','application/epub+zip'].includes(a.attachmentContentType))attachments.push({id:a.id,key:a.key,type:a.attachmentContentType,dateModified:a.dateModified});
    const local={id:CiteLensNetworkCore.id(item.libraryID,item.key),itemID:item.id,key:item.key,libraryID:item.libraryID,type:Zotero.ItemTypes.getName(item.itemTypeID),title:CiteLensCore.plainTitle(item.getField('title')),DOI:CiteLensCore.doi(item.getField('DOI')),PMID:String(item.getField('extra')||'').match(/^PMID:\s*(\d{1,12})\s*$/im)?.[1]||'',PMCID:String(item.getField('extra')||'').match(/^PMCID:\s*(PMC\d{1,12})\s*$/im)?.[1]?.toUpperCase()||'',year:String(item.getField('date')).match(/\b(?:1[6-9]|20)\d{2}\b/)?.[0]||'',journal:item.getField('publicationTitle')||item.getField('bookTitle')||item.getField('publisher'),containerTitle:item.getField('bookTitle'),volume:item.getField('volume'),issue:item.getField('issue'),pages:item.getField('pages'),abstract:CiteLensCore.plainTitle(item.getField('abstractNote')),abstractMarkup:item.getField('abstractNote'),creators,collections:item.getCollections(),relatedKeys:item.relatedItems,attachments};
    const metadata=CiteLensServices.state.cache?.[CiteLensCore.identity(local)]?.value,remote=metadata?.ranked?.[0]?.record;
    if(metadata?.status==='matched'&&remote&&CiteLensCore.decide(local,[remote]).status==='matched')for(const field of ['journal','year','volume','issue','pages','PMID','PMCID'])if(!local[field]&&remote[field])local[field]=remote[field];
    return this.applyAbstract(local);
  },
  queueAuthorIdentity(graph){
    if(this.dead||!this.isEnabled()||!graph?.paperNodes?.length)return;this.identityQueue||=new Map();this.identitySeen||=new Map();const byPaper=new Map(),papers=graph.paperNodes,byID=new Map(papers.map(p=>[p.id,p]));
    for(const node of graph.nodes||[]){if(node.kind!=='author'||this.authorORCIDOverride(node)||CiteLensNetworkCore.orcid(node.orcid)||this.cachedAuthorORCID(node,byID))continue;for(const id of node.members||[]){if(!byPaper.has(id))byPaper.set(id,[]);byPaper.get(id).push(node);}}
    for(const paper of [...papers].sort((a,b)=>(Number(b.year)||0)-(Number(a.year)||0))){const authors=byPaper.get(paper.id),doi=CiteLensCore.recordDOI(paper);if(!doi||!authors?.length)continue;const key=doi+'|'+CiteLensCore.norm(paper.title),seen=this.identitySeen.get(key);if(seen&&seen>Date.now())continue;this.identityQueue.set(key,{paper,authors,papers});}
    this.scheduleAuthorIdentity(4000);
  },
  scheduleAuthorIdentity(delay=2000){if(this.dead||!this.isEnabled()||this.identityRunning||this.identityTimer||!this.identityQueue?.size)return;const win=Zotero.getMainWindow?.();if(!win?.setTimeout)return;this.identityTimer=win.setTimeout(()=>{this.identityTimer=0;this.authorIdentityStep().catch(e=>Zotero.logError(e));},delay);},
  async authorIdentityStep(){
    if(this.identityRunning||this.dead||!this.isEnabled()||!this.identityQueue?.size)return;
    const S=CiteLensServices,epoch=this.activityEpoch,cancelled=()=>this.dead||!this.isEnabled()||epoch!==this.activityEpoch;if(S.active>0||this.warming){this.scheduleAuthorIdentity(4000);return;}
    const [key,entry]=this.identityQueue.entries().next().value;this.identityQueue.delete(key);this.identityRunning=true;let offline=false;
    try{await S.lookup(entry.paper);if(cancelled())return;let i=0,changed=false;for(const node of entry.authors){if(cancelled())return;const result=await this.authorORCID(node,entry.papers,{cachedOnly:true,cancelled,persist:false});if(['available','ambiguous'].includes(result.status)){changed=true;}if(['available','ambiguous'].includes(result.status))for(const fn of this.authorORCIDListeners||[])try{fn(node.id);}catch(e){Zotero.logError(e);}if(++i%8===0)await Zotero.Promise.delay(0);}if(changed&&!cancelled())await S.persist();this.identitySeen.set(key,Date.now()+7*86400000);while(this.identitySeen.size>5000)this.identitySeen.delete(this.identitySeen.keys().next().value);}
    catch(_){offline=true;if(!cancelled()){this.identitySeen.set(key,Date.now()+300000);this.identityQueue.set(key,entry);}}
    finally{this.identityRunning=false;if(!this.dead&&this.isEnabled())this.scheduleAuthorIdentity(offline?60000:2000);}
  },
  authorIdentitySignature(node,rows){return JSON.stringify([node.nameKey,CiteLensCore.norm(node.title),rows.map(p=>[p.id,CiteLensCore.recordDOI(p),CiteLensCore.norm(p.title),(p.creators||[]).map(a=>CiteLensNetworkCore.authorKey(a))])]);},
  authorORCIDOverride(node){
    const entry=CiteLensServices.state.authorORCIDOverrides?.[node.id];
    if(!entry||entry.nameKey!==node.nameKey||entry.name!==CiteLensCore.norm(node.title))return null;
    return entry.orcid===''||CiteLensNetworkCore.orcid(entry.orcid)?entry:null;
  },
  subscribeAuthorORCID(fn){this.authorORCIDListeners||=new Set();this.authorORCIDListeners.add(fn);return ()=>this.authorORCIDListeners.delete(fn);},
  async setAuthorORCID(node,input){
    if(this.dead||node.kind!=='author')throw Error('无法编辑此作者');
    const raw=String(input??'').trim().replace(/\/$/,''),oid=CiteLensNetworkCore.orcid(raw);
    if(input!==null&&raw&&!oid)throw Error('请输入有效的 ORCID 编号或 orcid.org 链接');
    const S=CiteLensServices,entries=S.state.authorORCIDOverrides||={},previous=entries[node.id];
    const next=input===null?undefined:{orcid:oid,nameKey:node.nameKey,name:CiteLensCore.norm(node.title),source:'user',updatedAt:Date.now()};
    if(next)entries[node.id]=next;else delete entries[node.id];S.state.authorORCIDOverrides=entries;
    try{await S.persist();}catch(e){if(entries[node.id]===next){if(previous)entries[node.id]=previous;else delete entries[node.id];}throw e;}
    for(const fn of this.authorORCIDListeners||[])try{fn(node.id);}catch(e){Zotero.logError(e);}
    return next;
  },
  cachedAuthorORCID(node,papersByID){
    const manual=this.authorORCIDOverride(node);if(manual)return manual.orcid;
    const hit=CiteLensServices.state.networkAuthorIDs?.[node.id];if(hit?.value?.status!=='available'||hit.expires<=Date.now())return '';
    const rows=(node.members||[]).map(id=>papersByID.get(id)).filter(p=>p&&CiteLensCore.recordDOI(p)).sort((a,b)=>(Number(b.year)||0)-(Number(a.year)||0));
    return hit.signature===this.authorIdentitySignature(node,rows)?CiteLensNetworkCore.orcid(hit.value.orcid):'';
  },
  async authorORCID(node,papers,{force=false,cachedOnly=false,persist=true,cancelled=()=>false}={}){
    const manual=this.authorORCIDOverride(node);if(manual)return {status:manual.orcid?'available':'missing',orcid:manual.orcid,source:'user'};
    const C=CiteLensCore,NC=CiteLensNetworkCore,S=CiteLensServices,known=NC.orcid(node.orcid||node.ORCID);if(known)return {status:'available',orcid:known};
    const members=new Set(node.members||[]),rows=papers.filter(p=>members.has(p.id)&&C.recordDOI(p)).sort((a,b)=>(Number(b.year)||0)-(Number(a.year)||0));
    const signature=this.authorIdentitySignature(node,rows),cache=S.state.networkAuthorIDs||={},hit=cache[node.id];if(!force&&!cachedOnly&&hit?.signature===signature&&hit.expires>Date.now())return hit.value;
    const extract=(paper,remote)=>{
      if(C.recordDOI(remote)!==C.recordDOI(paper))return '';
      const creators=paper.creators||[],indices=creators.map((a,i)=>({a,i})).filter(({a})=>NC.authorKey(a)===node.nameKey||C.norm([a.firstName,a.lastName].filter(Boolean).join(' '))===C.norm(node.title));if(indices.length!==1)return '';
      return NC.orcid(NC.enrichCreators(creators,remote.creators||[])[indices[0].i]?.ORCID);
    };
    const found=new Map();for(const paper of rows){const entry=S.state.cache?.[C.identity(paper)]?.value;if(entry){const remote=entry.doiRecord||entry.ranked?.[0]?.record||{};if(entry.status!=='matched'&&C.norm(remote.title)!==C.norm(paper.title))continue;const oid=extract(paper,remote);if(oid)found.set(oid,C.recordDOI(paper));}}
    const finish=async value=>{if(cancelled()||this.dead)return {status:'cancelled'};cache[node.id]={signature,value,expires:Date.now()+(value.status==='available'?30*86400000:value.status==='offline'?300000:86400000)};for(const key of Object.keys(cache).sort((a,b)=>cache[b].expires-cache[a].expires).slice(5000))delete cache[key];S.state.networkAuthorIDs=cache;if(persist)await S.persist();return value;};
    if(found.size>1)return finish({status:'ambiguous'});if(found.size===1){const [orcid,DOI]=[...found][0];return finish({status:'available',orcid,DOI});}
    if(cachedOnly)return {status:'pending'};
    let offline=false;
    for(const paper of rows.slice(0,6)){
      if(cancelled()||this.dead)return {status:'cancelled'};
      try{const result=await S.lookup(paper,{force});if(cancelled()||this.dead)return {status:'cancelled'};const remote=result.doiRecord||result.ranked?.[0]?.record||{},orcid=result.status==='matched'||C.norm(remote.title)===C.norm(paper.title)?extract(paper,remote):'';if(orcid)return finish({status:'available',orcid,DOI:C.recordDOI(paper)});}
      catch(_){offline=true;}
    }
    return finish({status:offline?'offline':'missing'});
  },
  authorMetadataChanged(doi){if(this.dead||!doi)return;const ids=[];for(const row of this.records?.values()||[])if(row.DOI===doi)ids.push(row.itemID);if(ids.length)this.invalidate('modify','item',ids);},
  compute(action,payload,{progress=()=>{},signal=null}={}){
    const win=Zotero.getMainWindow();return new Promise((resolve,reject)=>{
      if(this.dead||signal?.aborted){reject(Error('已取消'));return;}let worker,timer;const cancel=()=>finish(Error('已取消'));
      const finish=(error,value)=>{win.clearTimeout(timer);signal?.removeEventListener('abort',cancel);if(worker){worker.terminate();this.workers.delete(worker);}error?reject(error):resolve(value);};
      try{CiteLens.ensureAssets();worker=new win.ChromeWorker('resource://'+CiteLens.assetResource+'/network-worker.js');this.workers.add(worker);worker.cancel=()=>finish(Error('已关闭'));worker.onmessage=e=>{if(e.data.error)finish(Error(e.data.error));else if(e.data.result)finish(null,e.data.result);else if(e.data.progress)progress(e.data.progress);};worker.onerror=e=>{Zotero.logError(Error('[Paper Nexus network] '+action+': '+(e.message||'worker resource failed')));finish(Error('网络暂不可用，请重试'));};signal?.addEventListener('abort',cancel,{once:true});timer=win.setTimeout(()=>finish(Error('网络计算超时，请缩小文献夹范围')),45000);worker.postMessage({action,payload});}catch(e){finish(e);}
    });
  },
  computeSession({signal=null}={}){
    const N=this,win=Zotero.getMainWindow(),queue=[];let worker=null,active=null,timer=null,closed=false;
    const close=(error=Error('网络计算已结束'))=>{
      if(closed)return;closed=true;win.clearTimeout(timer);signal?.removeEventListener('abort',abort);
      if(worker){worker.onmessage=worker.onerror=null;try{worker.terminate();}catch(_){}N.workers.delete(worker);}
      if(active){active.reject(error);active=null;}for(const task of queue.splice(0))task.reject(error);
    };
    const abort=()=>close(Error('已取消'));
    const pump=()=>{
      if(closed||active||!queue.length)return;if(N.dead||signal?.aborted){abort();return;}
      active=queue.shift();timer=win.setTimeout(()=>close(Error('网络计算超时，请缩小文献夹范围')),45000);
      try{worker.postMessage({action:active.action,payload:active.payload});}catch(error){close(error);}
    };
    try{
      if(N.dead||signal?.aborted)throw Error('已取消');CiteLens.ensureAssets();worker=new win.ChromeWorker('resource://'+CiteLens.assetResource+'/network-worker.js');N.workers.add(worker);worker.cancel=()=>close(Error('已关闭'));
      worker.onmessage=event=>{
        if(closed||!active)return;const data=event.data;
        if(data.progress){try{active.progress(data.progress);}catch(error){close(error);}return;}
        if(!Object.prototype.hasOwnProperty.call(data,'result')&&!data.error){close(Error('无效的网络计算响应'));return;}
        win.clearTimeout(timer);const task=active;active=null;if(data.error)task.reject(Error(data.error));else task.resolve(data.result);pump();
      };
      worker.onerror=event=>close(Error(event.message||'网络暂不可用，请重试'));signal?.addEventListener('abort',abort,{once:true});
    }catch(error){close(error);throw error;}
    return{compute:(action,payload,{progress=()=>{}}={})=>new Promise((resolve,reject)=>{
      if(closed||N.dead||signal?.aborted){reject(Error('已取消'));return;}
      if(queue.length>=32){reject(Error('后台计算队列已满'));return;}
      queue.push({action,payload,progress,resolve,reject});pump();
    }),close,get closed(){return closed;}};
  },
  searchSession(model){
    CiteLens.ensureAssets();const win=Zotero.getMainWindow(),worker=new win.ChromeWorker('resource://'+CiteLens.assetResource+'/network-worker.js'),pending=new Map();let serial=0,closed=false,readyResolve,readyReject;
    const ready=new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject;});ready.catch(()=>{});
    const timer=win.setTimeout(()=>close(Error('搜索索引加载超时')),45000);
    const close=(error=Error('已取消'))=>{if(closed)return;closed=true;win.clearTimeout(timer);worker.terminate();this.workers.delete(worker);readyReject(error);for(const task of pending.values())task.reject(error);pending.clear();};
    worker.cancel=()=>close();this.workers.add(worker);worker.onerror=e=>close(Error(e.message||'搜索暂不可用'));
    worker.onmessage=e=>{const data=e.data;if(data.error){close(Error(data.error));return;}if(data.ready){win.clearTimeout(timer);readyResolve();return;}const task=pending.get(data.request);if(task){pending.delete(data.request);task.resolve(data.result);}};
    worker.postMessage({action:'search-init',payload:{mode:model.mode,nodes:model.nodes.map(n=>({id:n.id,title:n.title,kind:n.kind,members:n.members,local:n.local,identity:n.identity,orcid:n.orcid})),papers:(model.paperNodes||[]).map(n=>({id:n.id,title:n.title,abstract:n.abstract,journal:n.journal,DOI:n.DOI,year:n.year,creators:n.creators}))}});
    const request=async(action,payload)=>{await ready;if(closed)throw Error('已取消');const id=++serial;return new Promise((resolve,reject)=>{pending.set(id,{resolve,reject});worker.postMessage({action,payload:{...payload,request:id}});});};
    return {close,get closed(){return closed;},query:query=>request('search-query',{query}),relations:id=>request('author-links',{id}),neighborhood:(id,depth,limit)=>request('author-neighborhood',{id,depth,limit})};
  },
  async cacheKey(value,compute=null){
    if(!this.cacheRoot)return null;const {text}=await (compute||this.compute.bind(this))('cache-encode',{value}),win=Zotero.getMainWindow?.();
    if(!win?.crypto?.subtle||!win.TextEncoder)throw Error('当前环境不支持安全缓存标识');
    const bytes=new win.TextEncoder().encode('network-cache-v3\0'+text),buffer=await win.crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(buffer)].map(x=>x.toString(16).padStart(2,'0')).join('');
  },
  async readCache(kind,key){
    if(!this.cacheRoot||!key||this.dead)return null;const path=PathUtils.join(this.cacheRoot,kind+'-'+key+'.json');
    try{if(!await IOUtils.exists(path)||(await IOUtils.stat(path)).size>12*1024*1024)return null;const {value}=await this.compute('cache-decode',{text:await IOUtils.readUTF8(path)});if(value.schema!==2)return null;return value.data;}catch(e){Zotero.logError(e);return null;}
  },
  async writeCache(kind,key,data){
    if(!this.cacheRoot||!key||this.dead)return;const {text}=await this.compute('cache-encode',{value:{schema:2,data}});if(text.length>6*1024*1024)return;
    const root=this.cacheRoot,path=PathUtils.join(root,kind+'-'+key+'.json');
    const task=(this.cacheWrite||Promise.resolve()).catch(()=>{}).then(async()=>{if(this.dead)return;await IOUtils.makeDirectory(root,{ignoreExisting:true});await IOUtils.writeUTF8(path,text,{tmpPath:path+'.tmp'});
      const files=[];for(const file of await IOUtils.getChildren(root)){if(!/\/(?:graph|lastgraph|snapshot|refs|locations|author|abstracts)-[a-f0-9]{64}\.json$/.test(file.replace(/\\/g,'/')))continue;const stat=await IOUtils.stat(file);files.push({path:file,size:stat.size,time:stat.lastModified});}files.sort((a,b)=>b.time-a.time);let bytes=0;for(let i=0;i<files.length;i++){bytes+=files[i].size;if(i>=64||bytes>64*1024*1024)await IOUtils.remove(files[i].path,{ignoreAbsent:true});}
    });this.cacheWrite=task;try{await task;}catch(e){Zotero.logError(e);}
  },
  async referenceKey(reader,pdf){
    const item=await Zotero.Items.getAsync(reader.itemID);if(!item?.getFilePathAsync)return null;const file=await item.getFilePathAsync();if(!file)return null;const stat=await IOUtils.stat(file);
    return this.cacheKey(['references-v5',this.revisions.references,item.libraryID,item.key,item.dateModified,stat.size,stat.lastModified,pdf.fingerprints||pdf.fingerprint||'',pdf.numPages]);
  },
  // Keep one job per unchanged snapshot/scope/mode, including jobs still running.
  // Changing the visible tab never cancels or restarts inference.
  graphJobs:new Map(),
  graphJob(snapshot,payload){
    if(!this.isEnabled())throw Error('文献网络未启用');
    if(payload.mode!=='authors')throw Error('主题网络正在开发中');
    const key=JSON.stringify([payload.cacheKey,'authors',payload.limit,[...(payload.openEntities||[])].sort(),payload.openEntities?.length?payload.selected:'',this.revisions.authors,payload.refresh||0]);
    let job=this.graphJobs.get(key);if(job&&job.snapshot===snapshot&&!job.controller.signal.aborted){this.graphJobs.delete(key);this.graphJobs.set(key,job);return job;}
    job?.controller.abort();const win=Zotero.getMainWindow();
    job={snapshot,mode:'authors',expanded:!!payload.openEntities?.length,controller:new win.AbortController(),listeners:new Set(),value:null,progress:null};this.graphJobs.set(key,job);
    job.promise=(async()=>{await Zotero.Promise.delay(0);const emit=p=>{job.progress=p;for(const fn of job.listeners)fn(p);};const result=payload.openEntities?.length?await this.compute('expand',{graph:await this.graphJob(snapshot,{...payload,openEntities:[],selected:'',positions:[]}).promise,openEntities:payload.openEntities,selected:payload.selected,positions:payload.positions},{signal:job.controller.signal}):await this.map({...payload,query:''},{signal:job.controller.signal,progress:emit});if(job.controller.signal.aborted)throw Error('已取消');job.value=result;if(!job.expanded)this.queueAuthorIdentity(result);return result;})().catch(e=>{if(this.graphJobs.get(key)===job)this.graphJobs.delete(key);throw e;});job.promise.catch(()=>{});
    // Navigation variants cannot evict the expensive base networks.
    for(const expanded of [false,true]){const entries=[...this.graphJobs].filter(([,value])=>value.expanded===expanded);while(entries.length>4){const [oldest,previous]=entries.shift();previous.controller.abort();this.graphJobs.delete(oldest);}}
    return job;
  },
  async presentation(job){
    if(!job.presentation)job.presentation=job.promise.then(graph=>this.compute('presentation',{graph},{signal:job.controller.signal})).then(value=>{job.value=value.graph;job.promise=Promise.resolve(value.graph);return value;}).catch(error=>{job.presentation=null;throw error;});
    return job.presentation;
  },
  clearGraphJobs(mode){for(const [key,job] of this.graphJobs){if(!mode||job.mode===mode){job.controller.abort();this.graphJobs.delete(key);}}},
  async map(payload,options={}){
    const {signal,progress=()=>{}}=options;
    if(payload.mode!=='authors')throw Error('主题网络正在开发中');
    const {positions,refresh,...content}=payload;
    const key=await this.cacheKey([this.revisions.authors,content]);if(signal?.aborted)throw Error('已取消');
    const stored=await this.readCache('graph',key);if(signal?.aborted)throw Error('已取消');
    if(!payload.refresh&&stored&&Array.isArray(stored.nodes)&&Array.isArray(stored.communities)&&stored.stats){const saved=new Map((positions||[]).map(p=>[p.id,p]));for(const n of stored.nodes){const p=saved.get(n.id);if(p)Object.assign(n,p);}stored.cache={hit:true};progress({phase:'layout',completed:1,total:1});return stored;}
    const result=await this.buildMap(payload,options);if(signal?.aborted)throw Error('已取消');result.revisions={algorithm:this.revisions.authors,input:this.revisions.input,builtAt:Date.now()};await this.writeCache('graph',key,result);return result;
  },
  async buildMap(payload,{signal,progress=()=>{},preview=null}={}){
    if(payload.mode!=='authors')throw Error('主题网络正在开发中');
    const cacheKey=JSON.stringify([payload.cacheKey||'default','authors',this.revisions.authors]),previous=this.partitionIndexes.get(cacheKey),result=await this.compute('map',{...payload,previous},{signal,progress});await this.rememberPartition(cacheKey,result,signal);return result;
  },
  async rememberPartition(cacheKey,result,signal){
    if(signal?.aborted||this.dead)throw Error('已取消');this.partitionIndexes.delete(cacheKey);this.partitionIndexes.set(cacheKey,result.partitionState);delete result.partitionState;while(this.partitionIndexes.size>4)this.partitionIndexes.delete(this.partitionIndexes.keys().next().value);if(this.indexPath){const {text:data}=await this.compute('cache-encode',{value:{schema:1,entries:[...this.partitionIndexes]}});this.indexWrite=(this.indexWrite||Promise.resolve()).catch(()=>{}).then(()=>IOUtils.writeUTF8(this.indexPath,data,{tmpPath:this.indexPath+'.tmp'}));}
  },
  subscribe(fn){this.listeners.add(fn);return ()=>this.listeners.delete(fn);},
  async remember(reader,refs){
    if(this.dead)return;const attachment=Zotero.Items.get(reader.itemID),parent=attachment?.parentItem;if(!parent||parent.deleted)return;
    const C=CiteLensCore,N=CiteLensNetworkCore,key=N.id(attachment.libraryID,attachment.key);
    const next={source:N.id(parent.libraryID,parent.key),attachmentID:attachment.id,attachmentKey:attachment.key,modified:attachment.dateModified,refs:refs.slice(0,5000).map(r=>({title:C.plainTitle(r.title),DOI:C.recordDOI(r),year:r.year,author:r.author,creators:r.creators||r.authors||[],raw:r.raw,position:r.position})),total:refs.length};
    const previous=this.state.sources[key];if(previous){const {collectedAt,...content}=previous;if(JSON.stringify(content)===JSON.stringify(next))return;}this.state.sources[key]={...next,collectedAt:new Date().toISOString()};this.scheduleWarmup();
    this.dirty=true;this.generation++;const data=JSON.stringify(this.state);this.write=(this.write||Promise.resolve()).catch(()=>{}).then(()=>IOUtils.writeUTF8(this.path,data,{tmpPath:this.path+'.tmp'}));await this.write;for(const f of this.listeners)f();
  },
  async snapshot({force=false,progress=()=>{}}={}){
    if(!this.isEnabled())throw Error('文献网络未启用');const activity=this.activityEpoch;
    if(typeof CiteLens!=='undefined'&&CiteLens.prepareNetwork)await CiteLens.prepareNetwork();
    await this.ensureNetworkData();if(this.dead||!this.isEnabled()||activity!==this.activityEpoch)throw Error('已关闭');
    if(this.snapshotFlight){await this.snapshotFlight;return this.snapshot({force,progress});}
    if(this.data&&!this.dirty&&!force)return this.data;
    const full=force||this.fullDirty||!this.data,pending=new Set(this.dirtyItems);this.dirtyItems.clear();this.fullDirty=false;const ticket=this.generation;
    const work=(async()=>{
      const libraries=[],collections=[],records=full?new Map():new Map(this.records),ids=new Set(pending);await Zotero.Promise.delay(0);
      for(const library of Zotero.Libraries.getAll().filter(l=>['user','group'].includes(l.libraryType))){
        if(this.dead||!this.isEnabled()||activity!==this.activityEpoch)throw Error('已关闭');libraries.push({id:library.libraryID,name:library.name,editable:library.editable});
        for(const col of Zotero.Collections.getByLibrary(library.libraryID,true).filter(c=>!c.deleted))collections.push({id:col.id,name:col.name,libraryID:col.libraryID,parentID:col.parentID||null,level:col.level||0});
        if(full)for(const id of await Zotero.Items.getAll(library.libraryID,true,false,true))ids.add(id);
      }
      const queue=[...ids];let completed=0,sliceStarted=Date.now();
      for(let i=0;i<queue.length;i++){
        if(this.dead||!this.isEnabled()||activity!==this.activityEpoch)throw Error('已关闭');const id=queue[i],item=await Zotero.Items.getAsync(id);
        if(item?.parentID&&!ids.has(item.parentID)){ids.add(item.parentID);queue.push(item.parentID);}
        const record=await this.readRecord(item),previous=this.records.get(id);if(record)records.set(id,previous&&JSON.stringify(previous)===JSON.stringify(record)?previous:record);else records.delete(id);
        completed++;if(Date.now()-sliceStarted>=8||i%24===0){progress({phase:'metadata',completed,total:queue.length});await Zotero.Promise.delay(this.views.size?0:24);sliceStarted=Date.now();}
      }
      const permitted=new Set(libraries.map(l=>l.id));for(const [id,n] of records)if(!permitted.has(n.libraryID))records.delete(id);
      const nodes=[...records.values()],byID=new Map(nodes.map(n=>[n.id,n])),sources=Object.values(this.state.sources).filter(s=>Array.isArray(s?.refs)&&byID.get(s.source)?.attachments.some(a=>a.id===s.attachmentID&&a.key===s.attachmentKey&&a.dateModified===s.modified));
      progress({phase:'metadata',completed:queue.length,total:queue.length});const scopeSignature=JSON.stringify([libraries,collections,sources]);
      if(this.dead||!this.isEnabled()||activity!==this.activityEpoch)throw Error('已关闭');
      if(this.data&&this.snapshotScope===scopeSignature&&records.size===this.records.size&&[...records].every(([id,n])=>this.records.get(id)===n)){this.dirty=this.generation!==ticket;return this.data;}
      const snapshotKey=await this.cacheKey({version:this.revisions.snapshot,nodes,sources}),cachedSnapshot=await this.readCache('snapshot',snapshotKey),graph=cachedSnapshot||await this.compute('snapshot',{nodes,sources});if(!cachedSnapshot)await this.writeCache('snapshot',snapshotKey,graph);
      if(this.dead||!this.isEnabled()||activity!==this.activityEpoch)throw Error('已关闭');this.records=records;this.attachmentParents=new Map(nodes.flatMap(n=>n.attachments.map(a=>[a.id,n.itemID])));
      if(this.generation===ticket){const valid=new Set(sources);let cleaned=false;for(const [key,value] of Object.entries(this.state.sources))if(!valid.has(value)){delete this.state.sources[key];cleaned=true;}if(cleaned){const text=JSON.stringify(this.state);this.write=(this.write||Promise.resolve()).catch(()=>{}).then(()=>IOUtils.writeUTF8(this.path,text,{tmpPath:this.path+'.tmp'}));await this.write.catch(e=>Zotero.logError(e));}}
      this.snapshotScope=scopeSignature;this.data={...graph,libraries,collections,builtAt:Date.now(),incremental:{full,read:completed,reused:Math.max(0,nodes.length-completed)}};this.dirty=this.generation!==ticket;return this.data;
    })();this.snapshotFlight=work;try{return await work;}catch(error){this.dirty=true;this.fullDirty ||= full;for(const id of pending)this.dirtyItems.add(id);throw error;}finally{this.snapshotFlight=null;}
  },
  scope(data,libraryID,collectionID){
    const ids=new Set();if(collectionID){ids.add(Number(collectionID));let changed=true;while(changed){changed=false;for(const c of data.collections)if(ids.has(c.parentID)&&!ids.has(c.id)){ids.add(c.id);changed=true;}}}
    return data.nodes.filter(n=>(!libraryID||n.libraryID===Number(libraryID))&&(!ids.size||n.collections.some(id=>ids.has(id))));
  },
  async searchFulltext(nodes,query,{cancelled=()=>false,progress=()=>{}}={}){
    const term=query.trim().toLocaleLowerCase();if(term.length<2)throw Error('全文关键词至少两个字符');
    const results=new Map(),stats={attachments:0,searched:0,unindexed:0,tooLarge:0,errors:0};
    const total=nodes.reduce((n,x)=>n+x.attachments.length,0);
    for(const node of nodes)for(const attachment of node.attachments){
      if(cancelled()||this.dead)return {results,stats,cancelled:true};stats.attachments++;
      try{
        const item=await Zotero.Items.getAsync(attachment.id);if(item.deleted)continue;
        const path=Zotero.Fulltext.getItemCacheFile(item).path;if(!await IOUtils.exists(path)){stats.unindexed++;continue;}
        if((await IOUtils.stat(path)).size>16*1024*1024){stats.tooLarge++;continue;}
        const text=await IOUtils.readUTF8(path),at=text.toLocaleLowerCase().indexOf(term);stats.searched++;
        if(at>=0){if(!results.has(node.id))results.set(node.id,[]);results.get(node.id).push({attachmentID:attachment.id,attachmentKey:attachment.key,snippet:CiteLensCore.clean(text.slice(Math.max(0,at-90),at+query.length+160))});}
      }catch(_){stats.errors++;}
      finally{progress(stats.attachments,total);if(stats.attachments%10===0)await Zotero.Promise.delay(0);}
    }
    return {results,stats,cancelled:false};
  },
  async openItem(node){return CiteLensUI.openLibraryItem(Zotero.getMainWindow().document,await Zotero.Items.getAsync(node.itemID));},
  async openPDF(node,evidence=null){
    const id=evidence?.attachmentID||node.attachments?.find(a=>a.type==='application/pdf')?.id||node.attachments?.[0]?.id;if(!id)return this.openItem(node);
    const item=await Zotero.Items.getAsync(id);if(!item||item.deleted)throw Error('附件已移除，请刷新文献库');
    await Zotero.Reader.open(id,Number.isInteger(evidence?.pageIndex)?{pageIndex:evidence.pageIndex}:undefined);
  },
  async stop(){this.dead=true;Zotero.getMainWindow()?.clearTimeout(this.warmupTimer);Zotero.getMainWindow()?.clearTimeout(this.identityTimer);this.identityTimer=0;this.identityQueue?.clear();this.identitySeen?.clear();this.clearGraphJobs();for(const w of [...this.workers])w.cancel?.();this.workers.clear();this.generation++;if(this.observer)Zotero.Notifier.unregisterObserver(this.observer);for(const close of [...this.views])close();this.views.clear();this.listeners.clear();this.authorORCIDListeners?.clear();this.data=null;this.records?.clear();this.partitionIndexes.clear();await this.write?.catch(()=>{});await this.indexWrite?.catch(()=>{});await this.cacheWrite?.catch(()=>{});}
};
