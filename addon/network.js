/* Local metadata and evidence cache. No document content is sent to remote services. */
var CiteLensNetwork = {
  semanticIndexes:new Map(),workers:new Set(),state:{schema:1,sources:{}},views:new Set(),listeners:new Set(),generation:0,dead:true,
  async start(){
    this.dead=false;this.dirty=true;this.fullDirty=true;this.dirtyItems=new Set();this.records=new Map();this.attachmentParents=new Map();this.semanticIndexes=new Map();this.generation++;this.path=PathUtils.join(PathUtils.parent(CiteLensServices.path),'network-citations.json');
    try{if(await IOUtils.exists(this.path)){if((await IOUtils.stat(this.path)).size>30*1024*1024)throw Error('Cache too large');const data=JSON.parse(await IOUtils.readUTF8(this.path));if(data.schema!==1||!data.sources||typeof data.sources!=='object'||Array.isArray(data.sources))throw Error('Invalid cache');this.state=data;}}
    catch(e){Zotero.logError(e);this.state={schema:1,sources:{}};this.warning='关联缓存无法读取，可重新读取论文中的引文。';}
    this.indexPath=PathUtils.join(PathUtils.parent(this.path),'network-semantic-index.json');try{if(await IOUtils.exists(this.indexPath)&&(await IOUtils.stat(this.indexPath)).size<16*1024*1024){const saved=JSON.parse(await IOUtils.readUTF8(this.indexPath));if(saved.schema===1)this.semanticIndexes=new Map(saved.entries||[]);}}catch(_){}
    this.observer=Zotero.Notifier.registerObserver({notify:(event,type,ids)=>this.invalidate(event,type,ids)},['item','collection','collection-item'],'paper-nexus-network');
  },
  invalidate(event,type,ids=[]){
    if(this.dead)return;this.dirty=true;this.generation++;
    if(type==='item'&&ids.length){for(const raw of ids){const id=Number(raw);if(!Number.isFinite(id)){this.fullDirty=true;continue;}this.dirtyItems.add(id);const parent=this.attachmentParents.get(id);if(parent)this.dirtyItems.add(parent);}}
    else if(type==='collection-item'&&ids.length){for(const pair of ids){const id=Number(String(pair).split('-')[1]);if(Number.isFinite(id))this.dirtyItems.add(id);else this.fullDirty=true;}}
    else if(type!=='collection')this.fullDirty=true;
    for(const f of this.listeners)f();
  },
  async readRecord(item){
    if(!item||typeof item.isRegularItem!=='function'||!item.isRegularItem()||item.deleted)return null;
    const creators=item.getCreators().filter(a=>Zotero.CreatorTypes.getName(a.creatorTypeID)==='author'),attachments=[];
    for(const a of await Zotero.Items.getAsync(item.getAttachments()))if(!a.deleted&&['application/pdf','application/epub+zip'].includes(a.attachmentContentType))attachments.push({id:a.id,key:a.key,type:a.attachmentContentType,dateModified:a.dateModified});
    return {id:CiteLensNetworkCore.id(item.libraryID,item.key),itemID:item.id,key:item.key,libraryID:item.libraryID,type:Zotero.ItemTypes.getName(item.itemTypeID),title:CiteLensCore.plainTitle(item.getField('title')),DOI:CiteLensCore.doi(item.getField('DOI')),year:String(item.getField('date')).match(/\b(?:1[6-9]|20)\d{2}\b/)?.[0]||'',journal:item.getField('publicationTitle')||item.getField('bookTitle')||item.getField('publisher'),abstract:CiteLensCore.plainTitle(item.getField('abstractNote')),creators,collections:item.getCollections(),relatedKeys:item.relatedItems,attachments};
  },
  compute(action,payload,{progress=()=>{},signal=null}={}){
    const win=Zotero.getMainWindow();return new Promise((resolve,reject)=>{
      if(this.dead||signal?.aborted){reject(Error('已取消'));return;}let worker,timer;const cancel=()=>finish(Error('已取消'));
      const finish=(error,value)=>{win.clearTimeout(timer);signal?.removeEventListener('abort',cancel);if(worker){worker.terminate();this.workers.delete(worker);}error?reject(error):resolve(value);};
      try{worker=new win.ChromeWorker('resource://'+CiteLens.assetResource+'/network-worker.js');this.workers.add(worker);worker.cancel=()=>finish(Error('已关闭'));worker.onmessage=e=>{if(e.data.error)finish(Error(e.data.error));else if(e.data.result)finish(null,e.data.result);else if(e.data.progress)progress(e.data.progress);};worker.onerror=e=>finish(Error(e.message||'网络计算失败'));signal?.addEventListener('abort',cancel,{once:true});timer=win.setTimeout(()=>finish(Error('网络计算超时，请缩小文献夹范围')),45000);worker.postMessage({action,payload});}catch(e){finish(e);}
    });
  },
  async map(payload,{signal,progress=()=>{},preview=null}={}){
    if(payload.mode!=='topics')return this.compute('map',payload,{signal,progress});
    const graph=await this.compute('prepare',payload,{signal});
    if(preview&&!payload.positions?.length){const initial=await this.compute('layout',graph,{signal});initial.communities=[];for(const node of initial.nodes)node.color=6;if(signal?.aborted)throw Error('已取消');preview(initial);}
    const semantic=await CiteLensSemantic.analyze(graph.nodes,{signal,progress});
    if(signal?.aborted)throw Error('已取消');
    const cacheKey=payload.cacheKey||'default',previous=this.semanticIndexes.get(cacheKey);
    const result=await this.compute('semantic-map',{graph,semantic,previous},{signal,progress});
    if(signal?.aborted||this.dead)throw Error('已取消');this.semanticIndexes.delete(cacheKey);this.semanticIndexes.set(cacheKey,result.semanticState);delete result.semanticState;while(this.semanticIndexes.size>4)this.semanticIndexes.delete(this.semanticIndexes.keys().next().value);if(this.indexPath){const data=JSON.stringify({schema:1,entries:[...this.semanticIndexes]});this.indexWrite=(this.indexWrite||Promise.resolve()).catch(()=>{}).then(()=>IOUtils.writeUTF8(this.indexPath,data,{tmpPath:this.indexPath+'.tmp'}));}
    if(CiteLensTranslation.get('networkEngine','local')==='llm'){
      try{const names=await CiteLensSemantic.nameGroups(result.groups,result.paperNodes,{signal,progress});for(const node of [...result.nodes,...result.groups])if(node.kind==='topic'&&names.labels.has(node.id))node.title=names.labels.get(node.id);result.semantic.engine='llm';result.semantic.named=names.named;result.semantic.namesCached=names.cached;}catch(error){if(signal?.aborted)throw error;result.namingError=error.message;}
    }
    if(signal?.aborted||this.dead)throw Error('已取消');return result;
  },
  subscribe(fn){this.listeners.add(fn);return ()=>this.listeners.delete(fn);},
  async remember(reader,refs){
    if(this.dead)return;const attachment=Zotero.Items.get(reader.itemID),parent=attachment?.parentItem;if(!parent||parent.deleted)return;
    const C=CiteLensCore,N=CiteLensNetworkCore,key=N.id(attachment.libraryID,attachment.key);
    this.state.sources[key]={source:N.id(parent.libraryID,parent.key),attachmentID:attachment.id,attachmentKey:attachment.key,modified:attachment.dateModified,refs:refs.slice(0,5000).map(r=>({title:C.plainTitle(r.title),DOI:C.recordDOI(r),year:r.year,author:r.author,creators:r.creators||r.authors||[],raw:r.raw,position:r.position})),collectedAt:new Date().toISOString(),total:refs.length};
    this.dirty=true;this.generation++;const data=JSON.stringify(this.state);this.write=(this.write||Promise.resolve()).catch(()=>{}).then(()=>IOUtils.writeUTF8(this.path,data,{tmpPath:this.path+'.tmp'}));await this.write;for(const f of this.listeners)f();
  },
  async snapshot({force=false,progress=()=>{}}={}){
    if(this.snapshotFlight){await this.snapshotFlight;return this.snapshot({force,progress});}
    if(this.data&&!this.dirty&&!force)return this.data;
    const full=force||this.fullDirty||!this.data,pending=new Set(this.dirtyItems);this.dirtyItems.clear();this.fullDirty=false;const ticket=this.generation;
    const work=(async()=>{
      const libraries=[],collections=[],records=full?new Map():new Map(this.records),ids=new Set(pending);await Zotero.Promise.delay(0);
      for(const library of Zotero.Libraries.getAll().filter(l=>['user','group'].includes(l.libraryType))){
        if(this.dead)throw Error('已关闭');libraries.push({id:library.libraryID,name:library.name,editable:library.editable});
        for(const col of Zotero.Collections.getByLibrary(library.libraryID,true).filter(c=>!c.deleted))collections.push({id:col.id,name:col.name,libraryID:col.libraryID,parentID:col.parentID||null,level:col.level||0});
        if(full)for(const id of await Zotero.Items.getAll(library.libraryID,true,false,true))ids.add(id);
      }
      const queue=[...ids];let completed=0,sliceStarted=Date.now();
      for(let i=0;i<queue.length;i++){
        if(this.dead)throw Error('已关闭');const id=queue[i],item=await Zotero.Items.getAsync(id);
        if(item?.parentID&&!ids.has(item.parentID)){ids.add(item.parentID);queue.push(item.parentID);}
        const record=await this.readRecord(item);if(record)records.set(id,record);else records.delete(id);
        completed++;if(Date.now()-sliceStarted>=8||i%24===0){progress({phase:'metadata',completed,total:queue.length});await Zotero.Promise.delay(0);sliceStarted=Date.now();}
      }
      const permitted=new Set(libraries.map(l=>l.id));for(const [id,n] of records)if(!permitted.has(n.libraryID))records.delete(id);
      const nodes=[...records.values()],byID=new Map(nodes.map(n=>[n.id,n])),sources=Object.values(this.state.sources).filter(s=>Array.isArray(s.refs)&&byID.get(s.source)?.attachments.some(a=>a.id===s.attachmentID&&a.key===s.attachmentKey&&a.dateModified===s.modified));
      progress({phase:'metadata',completed:queue.length,total:queue.length});const graph=await this.compute('snapshot',{nodes,sources});
      if(this.dead)throw Error('已关闭');this.records=records;this.attachmentParents=new Map(nodes.flatMap(n=>n.attachments.map(a=>[a.id,n.itemID])));
      this.data={...graph,libraries,collections,builtAt:Date.now(),incremental:{full,read:completed,reused:Math.max(0,nodes.length-completed)}};this.dirty=this.generation!==ticket;return this.data;
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
  async openItem(node){await Zotero.getActiveZoteroPane().selectItem(node.itemID);},
  async openPDF(node,evidence=null){
    const id=evidence?.attachmentID||node.attachments.find(a=>a.type==='application/pdf')?.id||node.attachments[0]?.id;if(!id)return this.openItem(node);
    const item=await Zotero.Items.getAsync(id);if(!item||item.deleted)throw Error('附件已移除，请刷新文献库');
    await Zotero.Reader.open(id,Number.isInteger(evidence?.pageIndex)?{pageIndex:evidence.pageIndex}:undefined);
  },
  async stop(){this.dead=true;for(const w of [...this.workers])w.cancel?.();this.workers.clear();this.generation++;if(this.observer)Zotero.Notifier.unregisterObserver(this.observer);for(const close of [...this.views])close();this.views.clear();this.listeners.clear();this.data=null;this.records?.clear();this.semanticIndexes.clear();await this.write?.catch(()=>{});await this.indexWrite?.catch(()=>{});}
};
