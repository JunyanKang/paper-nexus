/* Local metadata and evidence cache. No document content is sent to remote services. */
var CiteLensNetwork = {
  state:{schema:1,sources:{}},views:new Set(),listeners:new Set(),generation:0,dead:true,
  async start(){
    this.dead=false;this.dirty=true;this.generation++;this.path=PathUtils.join(PathUtils.parent(CiteLensServices.path),'network-citations.json');
    try{if(await IOUtils.exists(this.path)){if((await IOUtils.stat(this.path)).size>30*1024*1024)throw Error('Cache too large');const data=JSON.parse(await IOUtils.readUTF8(this.path));if(data.schema!==1||!data.sources||typeof data.sources!=='object'||Array.isArray(data.sources))throw Error('Invalid cache');this.state=data;}}
    catch(e){Zotero.logError(e);this.state={schema:1,sources:{}};this.warning='关联缓存无法读取，可重新读取论文中的引文。';}
    this.observer=Zotero.Notifier.registerObserver({notify:()=>{this.dirty=true;this.generation++;for(const f of this.listeners)f();}},['item','collection','collection-item'],'paper-nexus-network');
  },
  subscribe(fn){this.listeners.add(fn);return ()=>this.listeners.delete(fn);},
  async remember(reader,refs){
    if(this.dead)return;const attachment=Zotero.Items.get(reader.itemID),parent=attachment?.parentItem;if(!parent||parent.deleted)return;
    const C=CiteLensCore,N=CiteLensNetworkCore,key=N.id(attachment.libraryID,attachment.key);
    this.state.sources[key]={source:N.id(parent.libraryID,parent.key),attachmentID:attachment.id,attachmentKey:attachment.key,modified:attachment.dateModified,refs:refs.slice(0,5000).map(r=>({title:C.plainTitle(r.title),DOI:C.recordDOI(r),year:r.year,author:r.author,raw:r.raw,position:r.position})),collectedAt:new Date().toISOString(),total:refs.length};
    this.dirty=true;this.generation++;const data=JSON.stringify(this.state);this.write=(this.write||Promise.resolve()).catch(()=>{}).then(()=>IOUtils.writeUTF8(this.path,data,{tmpPath:this.path+'.tmp'}));await this.write;for(const f of this.listeners)f();
  },
  async snapshot({force=false}={}){
    if(this.snapshotFlight)return this.snapshotFlight;if(this.data&&!this.dirty&&!force)return this.data;
    const ticket=this.generation;
    const work=(async()=>{
      const N=CiteLensNetworkCore,nodes=[],libraries=[],collections=[];
      for(const library of Zotero.Libraries.getAll().filter(l=>['user','group'].includes(l.libraryType))){
        if(this.dead)throw Error('已关闭');libraries.push({id:library.libraryID,name:library.name,editable:library.editable});
        for(const col of Zotero.Collections.getByLibrary(library.libraryID,true).filter(c=>!c.deleted))collections.push({id:col.id,name:col.name,libraryID:col.libraryID,parentID:col.parentID||null,level:col.level||0});
        const ids=await Zotero.Items.getAll(library.libraryID,true,false,true);
        for(let i=0;i<ids.length;i+=80){
          if(this.dead)throw Error('已关闭');
          for(const item of await Zotero.Items.getAsync(ids.slice(i,i+80))){
            if(!item.isRegularItem()||item.deleted)continue;
            const creators=item.getCreators().filter(a=>Zotero.CreatorTypes.getName(a.creatorTypeID)==='author');
            const attachments=[];for(const a of await Zotero.Items.getAsync(item.getAttachments()))if(!a.deleted&&['application/pdf','application/epub+zip'].includes(a.attachmentContentType))attachments.push({id:a.id,key:a.key,type:a.attachmentContentType,dateModified:a.dateModified});
            nodes.push({id:N.id(item.libraryID,item.key),itemID:item.id,key:item.key,libraryID:item.libraryID,type:Zotero.ItemTypes.getName(item.itemTypeID),title:CiteLensCore.plainTitle(item.getField('title')),DOI:CiteLensCore.doi(item.getField('DOI')),year:String(item.getField('date')).match(/\b(?:1[6-9]|20)\d{2}\b/)?.[0]||'',journal:item.getField('publicationTitle')||item.getField('bookTitle')||item.getField('publisher'),creators,collections:item.getCollections(),relatedKeys:item.relatedItems,attachments});
          }
          await Zotero.Promise.delay(0);
        }
      }
      nodes.sort((a,b)=>String(b.year).localeCompare(String(a.year))||a.title.localeCompare(b.title));
      const byID=new Map(nodes.map(n=>[n.id,n])),sources=Object.values(this.state.sources).filter(s=>Array.isArray(s.refs)&&byID.get(s.source)?.attachments.some(a=>a.id===s.attachmentID&&a.key===s.attachmentKey&&a.dateModified===s.modified));
      const graph=N.build(nodes,sources);this.data={...graph,libraries,collections,builtAt:Date.now()};this.dirty=this.generation!==ticket;return this.data;
    })();this.snapshotFlight=work;try{return await work;}finally{this.snapshotFlight=null;}
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
  async stop(){this.dead=true;this.generation++;if(this.observer)Zotero.Notifier.unregisterObserver(this.observer);for(const close of [...this.views])close();this.views.clear();this.listeners.clear();this.data=null;await this.write?.catch(()=>{});}
};
