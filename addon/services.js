var CiteLensServices = {
  state:{schema:1,queue:[],metrics:[],cache:{},settings:{autoLookup:true,autoAuthors:true,networkConsent:true,networkEnabled:true,metricYear:''}},
  inFlight:new Map(), locks:new Map(), active:0, waiting:[], dead:false,
  async init() {
    this.path=PathUtils.join(Zotero.DataDirectory.dir,'cite-lens','state.json');
    await IOUtils.makeDirectory(PathUtils.parent(this.path),{ignoreExisting:true});
    if(await IOUtils.exists(this.path)) {
      try{const s=JSON.parse(await IOUtils.readUTF8(this.path));if(s.schema!==1||!Array.isArray(s.queue)||!Array.isArray(s.metrics)||!s.cache||!s.settings)throw Error('Unsupported state');this.state=s;}
      catch(e){await IOUtils.copy(this.path,this.path+'.backup-'+Date.now());Zotero.logError(e);this.loadWarning='设置文件异常，已保留备份并恢复默认设置';}
    }
    // Current-item enrichment is automatic, including installations with older opt-out switches.
    Object.assign(this.state.settings,{autoLookup:true,autoAuthors:true,networkConsent:true,preferInstalledMetrics:true,easyPubMedEnabled:true,metricYear:''});
    this.state.settings.networkEnabled=true;
    delete this.state.settings.networkEnhanceEnabled;
    delete this.state.settings.themeArtwork;
    delete this.state.settings.readingFont;
    delete this.state.settings.fontSize;
    this.dead=false;
    this.state.authorCache||={};this.authorGeneration=(this.authorGeneration||0)+1;
    this.localMetricCache=new Map();this.localMetricFlight=new Map();
    await this.detectMetricPlugins();
    if(!this.metricObserver&&Zotero.Notifier)this.metricObserver=Zotero.Notifier.registerObserver({notify:()=>{this.localMetricCache.clear();}},['item'],'cite-lens-metrics');
    this.epPath=PathUtils.join(PathUtils.parent(this.path),'easypubmed.json');
    this.epIndex=null;
    if(await IOUtils.exists(this.epPath)){
      try{if((await IOUtils.stat(this.epPath)).size>60*1024*1024)throw Error('指标文件过大');this.epIndex=CiteLensEPMetrics.build(JSON.parse(await IOUtils.readUTF8(this.epPath)));}
      catch(e){this.metricWarning='离线指标无法读取，请重新下载；原文件已保留';Zotero.logError(e);}
    }
  },
  persist() {
    const data=JSON.stringify(this.state,null,2);
    this.writePromise=(this.writePromise||Promise.resolve()).catch(()=>{}).then(()=>IOUtils.writeUTF8(this.path,data,{tmpPath:this.path+'.tmp'}));return this.writePromise;
  },
  async request(url) {
    if(this.dead)throw Error('插件已关闭');
    if(!/^https:\/\/api\.crossref\.org\//.test(url))throw Error('不支持的数据源地址');
    if(this.active>=2)await new Promise(resolve=>this.waiting.push(resolve));
    if(this.dead)throw Error('插件已关闭');this.active++;
    try{
      const response=await Zotero.HTTP.request('GET',url,{responseType:'json',timeout:15000,headers:{Accept:'application/json'}});
      return response.response?.message;
    }catch(e){const status=e.status||e.xmlhttp?.status;if(status===429)throw Error('Crossref 请求繁忙，请稍后重试');if(status===404)throw Error('Crossref 未收录此 DOI');throw Error('暂时无法连接 Crossref；原始参考文献仍可使用');}
    finally{this.active--;this.waiting.shift()?.();}
  },
  async lookup(record,{force=false}={}) {
    const C=CiteLensCore,key=C.identity(record),cached=this.state.cache[key];
    if(!force&&cached&&Date.now()-cached.time<7*86400000)return {...C.decide(record,(cached.value.ranked||[]).map(x=>x.record)),cached:true};
    if(this.inFlight.has(key))return this.inFlight.get(key);
    const work=(async()=>{
      const url=record.DOI?'https://api.crossref.org/works/'+encodeURIComponent(C.doi(record.DOI)):'https://api.crossref.org/works?rows=5&query.bibliographic='+encodeURIComponent((record.raw||C.citation(record)).slice(0,1800));
      const m=await this.request(url),candidates=record.DOI?[C.fromCrossref(m)]:(m.items||[]).map(C.fromCrossref),result=C.decide(record,candidates);
      if(!this.dead){this.state.cache[key]={time:Date.now(),value:result};this.cacheGeneration=(this.cacheGeneration||0)+1;const keys=Object.keys(this.state.cache).sort((a,b)=>this.state.cache[b].time-this.state.cache[a].time);for(const k of keys.slice(500))delete this.state.cache[k];await this.persist();}
      return result;
    })();this.inFlight.set(key,work);try{return await work;}finally{this.inFlight.delete(key);}
  },
  authors(record,options) {return CiteLensAuthors.lookup(this,record,options);},
  cachedAuthors(record) {return CiteLensAuthors.cached(this,record);},
  targets() {
    return Zotero.Libraries.getAll().filter(l=>l.editable&&['user','group'].includes(l.libraryType)).map(l=>({id:l.libraryID,name:l.name,collections:Zotero.Collections.getByLibrary(l.libraryID,true).filter(c=>!c.deleted).map(c=>({id:c.id,name:('　'.repeat(c.level||0))+c.name}))}));
  },
  async existing(record,libraryID) {
    const C=CiteLensCore,doi=C.doi(record.DOI),ids=new Set();
    const search=async(field,value)=>{const s=new Zotero.Search();s.libraryID=libraryID;s.addCondition('deleted','false');s.addCondition('itemType','isNot','attachment');s.addCondition('itemType','isNot','note');s.addCondition(field,'contains',value);for(const id of await s.search())ids.add(id);};
    if(doi)await search('DOI',doi);
    if(record.title&&record.year&&record.author){const words=record.title.match(/[\p{L}\p{N}]+/gu)||[];await search('title',words.sort((a,b)=>b.length-a.length)[0]||record.title);}
    const items=await Zotero.Items.getAsync([...ids]);
    return items.filter(i=>{
      const existingDOI=C.doi(i.getField('DOI'));if(doi&&existingDOI)return existingDOI===doi;
      // Older saved items often lack a DOI. Exact title/year/lead-name matches
      // remain valid after online enrichment, but conflicting DOIs never merge.
      return !!record.title&&!!record.year&&!!record.author&&C.norm(i.getField('title'))===C.norm(record.title)&&String(i.getField('date')).slice(0,4)===record.year&&C.norm(i.getCreators()[0]?.lastName)===C.norm(record.author);
    });
  },
  async locate(record) {
    // Search all readable personal/group libraries. Saving remains scoped to the chosen writable target.
    this.locating=this.locating||new Map();const key=CiteLensCore.identity(record);
    if(this.locating.has(key))return this.locating.get(key);
    const work=(async()=>{
      const matches=[];
      for(const library of Zotero.Libraries.getAll().filter(x=>['user','group'].includes(x.libraryType))){
        for(const item of await this.existing(record,library.libraryID))matches.push({item,libraryID:library.libraryID,libraryName:library.name,editable:library.editable,collections:this.collectionPaths(item)});
      }
      return matches;
    })();this.locating.set(key,work);try{return await work;}finally{this.locating.delete(key);}
  },
  collectionPaths(item) {
    return (item.getCollections?.()||[]).map(id=>{const names=[],seen=new Set();let current=Zotero.Collections.get(id);while(current&&!seen.has(current.id)){seen.add(current.id);names.unshift(current.name);current=current.parentID?Zotero.Collections.get(current.parentID):null;}return {id,path:names.join(' › ')};}).filter(x=>x.path);
  },
  async save(record,target,context={}) {
    const C=CiteLensCore,libraryID=Number(target.libraryID),key=libraryID+'|'+C.identity(record);
    // Serialize all saves to this library, including different records creating the same collection.
    const lockKey='library:'+libraryID,previous=this.locks.get(lockKey)||Promise.resolve();
    const work=previous.catch(()=>{}).then(async()=>{
      const library=Zotero.Libraries.get(libraryID);if(!library?.editable||!['user','group'].includes(library.libraryType))throw Error('目标文献库不可写');
      if(!record.title?.trim())throw Error('请填写题名');
      const parent=target.collectionID?Zotero.Collections.get(Number(target.collectionID)):null;
      if(target.collectionID&&(!parent||parent.deleted||parent.libraryID!==libraryID))throw Error('文献夹与目标库不一致');
      const matches=await this.existing(record,libraryID);if(matches.length>1)throw Error('目标库已有多个相同记录，请先在 Zotero 中合并重复条目');
      let result;
      await Zotero.DB.executeTransaction(async()=>{
        let collectionID=parent?.id||null;
        const name=C.clean(target.newCollection);if(name.length>150)throw Error('文献夹名称过长');
        if(name){const children=parent?Zotero.Collections.getByParent(parent.id):Zotero.Collections.getByLibrary(libraryID);let col=children.find(c=>c.name===name&&!c.deleted);if(!col){col=new Zotero.Collection();col.libraryID=libraryID;col.name=name;if(parent)col.parentID=parent.id;await col.save();}collectionID=col.id;}
        let item=matches[0],created=!item;
        if(!item){item=new Zotero.Item(record.type||'journalArticle');item.libraryID=libraryID;
          const fields={title:C.plainTitle(record.title),date:record.date||record.year,DOI:C.recordDOI(record),publicationTitle:record.journal,bookTitle:record.type==='bookSection'?record.journal:undefined,ISSN:record.ISSN,ISBN:record.ISBN,volume:record.volume,issue:record.issue,pages:record.pages,publisher:record.publisher,url:record.DOI?'https://doi.org/'+C.doi(record.DOI):record.url,abstractNote:record.abstract};
          for(const [field,value] of Object.entries(fields))if(value&&Zotero.ItemFields.isValidForType(Zotero.ItemFields.getID(field),item.itemTypeID))item.setField(field,C.clean(value));
          item.setCreators(record.creators||[]);item.setField('extra',`CiteLens source: ${record.source||'PDF'}\nCiteLens checked: ${record.verified?'metadata reviewed':'manual review'}\nOriginal reference: ${record.raw||''}`);await item.save();
        }
        if(collectionID){item.addToCollection(collectionID);await item.save();}
        let source=context.parentID?await Zotero.Items.getAsync(context.parentID):null;
        if(source&&source.id!==item.id&&source.libraryID===libraryID&&source.isRegularItem()){item.addRelatedItem(source);source.addRelatedItem(item);await item.save();await source.save();}
        // A source-specific note is appended once; existing bibliographic data is never overwritten.
        if(context.sourceTitle||record.raw){const marker='CiteLens source key: '+(source?.key||context.attachmentKey||'manual');const notes=await Zotero.Items.getAsync(item.getNotes());
          if(!notes.some(n=>n.getNote().includes(marker))){const escape=x=>String(x||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));const note=new Zotero.Item('note');note.libraryID=libraryID;note.parentID=item.id;note.setNote('<h2>Paper Nexus · 引用来源</h2><p>'+escape(context.sourceTitle||'手动核对参考文献')+'</p><p>'+escape(record.raw)+'</p><p>'+escape(marker)+'</p><p>'+escape('来源页：'+(context.pageIndex==null?'未记录':context.pageIndex+1)+'；保存时间：'+new Date().toISOString())+'</p>');await note.save();}}
        result={id:item.id,key:item.key,created,collectionID,libraryID};
      });
      this.state.settings.lastTarget={libraryID,collectionID:result.collectionID};await this.persist();return result;
    });this.locks.set(lockKey,work);try{return await work;}finally{if(this.locks.get(lockKey)===work)this.locks.delete(lockKey);}
  },
  async enqueue(record,context) {const C=CiteLensCore,key=C.identity(record),existing=this.state.queue.find(x=>x.key===key||record.raw&&C.norm(x.record.raw)===C.norm(record.raw));if(existing){existing.status='unread';if(record.verified||!existing.record.verified){existing.record=record;existing.key=key;existing.context=context;}}else this.state.queue.push({key,record,context,addedAt:new Date().toISOString(),status:'unread'});await this.persist();},
  async removeQueue(key) {this.state.queue=this.state.queue.filter(x=>x.key!==key);await this.persist();},
  async importMetrics(text) {const metrics=CiteLensCore.metricsImport(text);this.state.metrics=metrics;await this.persist();return metrics.length;},
  metricFor(record,year=null) {
    const local=CiteLensCore.metricFor(record,this.state.metrics,year);
    if(['not-applicable','ambiguous'].includes(local.status))return local;
    const cached=this.localMetricCache?.get(this.localMetricKey(record,year)),installed=cached&&Date.now()-cached.time<60000?cached.value:null,offline=this.epIndex?CiteLensEPMetrics.lookup(record,this.epIndex,year):null;
    // Prefer the newest explicit metric year; source priority resolves same-year ties.
    const candidates=[local,installed,offline].filter(x=>x&&['available','ambiguous'].includes(x.status));
    return candidates.sort((a,b)=>(Number(b.metricYear)||0)-(Number(a.metricYear)||0))[0]||local;
  },
  async ensureOfflineMetrics(){
    if(this.dead||this.epIndex||Date.now()<(this.epRetryAt||0))return false;
    if(this.offlinePreparing)return this.offlinePreparing;
    const work=(async()=>{try{await this.loadEasyPubMed();return !this.dead;}catch(_){this.epRetryAt=Date.now()+600000;return false;}})();this.offlinePreparing=work;
    try{return await work;}finally{this.offlinePreparing=null;}
  },
  metricYears() {return [...new Set([...this.state.metrics.map(x=>x.metricYear),...(this.epIndex?.years||[])])].sort((a,b)=>b-a);},
  localMetricKey(record,year) {return [String(record.ISSN||''),CiteLensCore.norm(record.journal),year||'latest'].join('|');},
  async detectMetricPlugins() {
    try{const {AddonManager}=ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs');
      const [frog,style]=await Promise.all(['greenfrog@redleafnew.me','zoterostyle@polygon.org'].map(id=>AddonManager.getAddonByID(id)));
      this.metricPlugins={greenfrog:frog?.isActive?frog.version:null,style:style?.isActive?style.version:null};
    }catch(_){this.metricPlugins={greenfrog:Zotero.greenfrog?'检测到':null,style:Zotero.ZoteroStyle?'检测到':null};}
    this.pluginCheckedAt=Date.now();return this.metricPlugins;
  },
  async greenFrogMetrics(record) {
    const C=CiteLensCore,L=CiteLensLocalMetrics,ids=String(record.ISSN||'').split(/[;,\s]+/).map(C.issn).filter(Boolean),found=new Map();
    if(!ids.length&&!record.journal)return [];
    for(const library of Zotero.Libraries.getAll().filter(x=>['user','group'].includes(x.libraryType))){
      for(const value of ids.length?ids:[record.journal]){
        const search=new Zotero.Search();search.libraryID=library.libraryID;search.addCondition('deleted','false');search.addCondition('itemType','is','journalArticle');search.addCondition(ids.length?'ISSN':'publicationTitle',ids.length?'contains':'is',value);
        const itemIDs=await search.search();
        // Do not choose a winner from a truncated set of journals.
        if(itemIDs.length>500)return [{status:'ambiguous',label:'同刊条目过多，请使用明确年度的自备指标',source:'Green Frog 兼容字段',jif:null,categories:[],metricYear:null}];
        for(const item of await Zotero.Items.getAsync(itemIDs)){
          if(found.has(item.id))continue;const itemIDs=String(item.getField('ISSN')).split(/[;,\s]+/).map(C.issn).filter(Boolean);
          if(ids.length?!ids.some(x=>itemIDs.includes(x)):C.norm(item.getField('publicationTitle'))!==C.norm(record.journal))continue;
          const metric=L.fromExtra(item.getField('extra'),{journal:item.getField('publicationTitle'),match:ids.length?'同刊 ISSN / eISSN':'同刊完整刊名',itemID:item.id,libraryName:library.name,readAt:new Date().toISOString()});if(metric)found.set(item.id,metric);
        }
      }
    }
    return [...found.values()];
  },
  async styleMetrics(record) {
    if(!record.journal)return [];
    const path=PathUtils.join(Zotero.DataDirectory.dir,'zoterostyle.json');if(!await IOUtils.exists(path))return [];
    const stat=await IOUtils.stat(path);if(stat.size>30*1024*1024)return [];
    if(!this.styleCache||this.styleCache.modified!==stat.lastModified||this.styleCache.size!==stat.size){this.styleCache={modified:stat.lastModified,size:stat.size,data:JSON.parse(await IOUtils.readUTF8(path))};}
    const canonical=this.epIndex?CiteLensEPMetrics.lookup(record,this.epIndex):null,names=new Set([record.journal]);if(canonical?.status==='available')names.add(canonical.journal);
    return [...names].flatMap(name=>CiteLensLocalMetrics.styleEntries(this.styleCache.data,name)).map(x=>({...x,readAt:new Date().toISOString()}));
  },
  async prepareLocalMetrics(record,year=null) {
    if(this.dead||['book','bookSection','thesis','preprint'].includes(record.type))return null;
    void this.ensureOfflineMetrics().then(changed=>{if(changed&&!this.dead&&typeof CiteLens!=='undefined')CiteLens.refreshMetrics();});
    if(Date.now()-(this.pluginCheckedAt||0)>30000)await this.detectMetricPlugins();
    const key=this.localMetricKey(record,year),cached=this.localMetricCache.get(key);if(cached&&Date.now()-cached.time<60000)return cached.value;
    if(this.localMetricFlight.has(key))return this.localMetricFlight.get(key);
    const work=(async()=>{
      const L=CiteLensLocalMetrics;let frog=null,style=null;
      try{if(this.metricPlugins?.greenfrog)frog=L.choose(await this.greenFrogMetrics(record),year);}catch(e){Zotero.logError(e);}
      try{if(this.metricPlugins?.style)style=L.choose(await this.styleMetrics(record),year);}catch(e){Zotero.logError(e);}
      const value=[frog,style].filter(Boolean).sort((a,b)=>(Number(b.metricYear)||0)-(Number(a.metricYear)||0))[0]||null;
      if(frog&&style&&frog.status==='available'&&(style.status!=='available'||L.signature(frog)!==L.signature(style)))frog.alternatives=style.alternatives||[style];
      if(!this.dead){this.localMetricCache.set(key,{time:Date.now(),value});if(this.localMetricCache.size>500)this.localMetricCache.delete(this.localMetricCache.keys().next().value);}
      return value;
    })();this.localMetricFlight.set(key,work);try{return await work;}finally{this.localMetricFlight.delete(key);}
  },
  async readEPZip(path,provenance) {
    const zip=Components.classes['@mozilla.org/libjar/zip-reader;1'].createInstance(Components.interfaces.nsIZipReader);
    zip.open(Zotero.File.pathToFile(path));
    const read=(name,max)=>{
      const entry=zip.getEntry(name);if(!entry||entry.realSize>max)throw Error('扩展包缺少数据文件或大小异常');
      const stream=Components.classes['@mozilla.org/intl/converter-input-stream;1'].createInstance(Components.interfaces.nsIConverterInputStream);
      stream.init(zip.getInputStream(name),'UTF-8',65536,0);let text='',part={};
      try{while(stream.readString(65536,part))text+=part.value;}finally{stream.close();}
      return JSON.parse(text);
    };
    try{
      const prefix=zip.hasEntry('dist/manifest.json')?'dist/':'',manifest=read(prefix+'manifest.json',100000);
      if(manifest.name!=='EasyPubMedicine'||!/^\d+\.\d+\.\d+$/.test(manifest.version))throw Error('请选择兼容的期刊指标数据包');
      return {schema:1,provenance:{...provenance,version:manifest.version,importedAt:new Date().toISOString()},history:read(prefix+'data/5year.json',30*1024*1024),aliases:[...read(prefix+'data/ifqbt.json',8*1024*1024),...read(prefix+'data/pubmed_abb_data.json',12*1024*1024)]};
    }finally{zip.close();}
  },
  async installEP(path,provenance) {
    const payload=await this.readEPZip(path,provenance),index=CiteLensEPMetrics.build(payload);
    if(this.dead)throw Error('插件已关闭');
    await IOUtils.writeUTF8(this.epPath,JSON.stringify(payload),{tmpPath:this.epPath+'.tmp'});
    this.epIndex=index;this.metricWarning='';this.state.settings.easyPubMedEnabled=true;await this.persist();return index;
  },
  async loadEasyPubMed(file=null) {
    if(this.epWork)return this.epWork;
    const work=(async()=>{
      if(this.dead)throw Error('插件已关闭');
      if(file){if((await IOUtils.stat(file)).size>40*1024*1024)throw Error('扩展包大于 40 MB');return this.installEP(file,{origin:'用户选择的 EasyPubMedicine ZIP'});}
      const source=CiteLensEPMetrics.SOURCE,path=PathUtils.join(PathUtils.parent(this.path),'easypubmed-download.zip');
      try{
        const response=await Zotero.HTTP.request('GET',source.url,{responseType:'arraybuffer',timeout:90000});
        const bytes=new Uint8Array(response.response);if(!bytes.length||bytes.length>40*1024*1024)throw Error('扩展包大小异常');
        if(this.dead)throw Error('插件已关闭');
        await IOUtils.write(path,bytes);
        return await this.installEP(path,{origin:source.url,revision:source.revision});
      }catch(e){Zotero.logError(e);throw Error('未能准备离线指标，已有数据已保留。请检查网络后重试，或导入兼容数据包。');}
      finally{await IOUtils.remove(path,{ignoreAbsent:true});}
    })();this.epWork=work;try{return await work;}finally{this.epWork=null;}
  },
  async stop() {this.dead=true;if(this.metricObserver){Zotero.Notifier.unregisterObserver(this.metricObserver);this.metricObserver=null;}this.styleCache=null;for(const resolve of this.waiting.splice(0))resolve();await this.writePromise;}
};
