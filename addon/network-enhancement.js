/* One-hop reference enrichment. Only local papers are roots; never write Zotero items. */
var CiteLensEnhancement={
 state:{schema:1,sources:{},records:{}},dead:true,listeners:new Set(),requests:new Set(),running:null,write:Promise.resolve(),epoch:0,
 get config(){const s=CiteLensServices.state.settings;return {enabled:!!s.networkEnhanceEnabled,paused:!!s.networkEnhancePaused,limit:[0,250,500,1000].includes(s.networkEnhanceLimit)?s.networkEnhanceLimit:500,foregroundOnly:s.networkEnhancePace==='foreground'};},
 async start(network){this.network=network;this.dead=false;this.epoch++;this.requests=new Set();this.running=null;this.path=PathUtils.join(PathUtils.parent(CiteLensServices.path),'network-enhancement.json');try{if(await IOUtils.exists(this.path)){const v=JSON.parse(await IOUtils.readUTF8(this.path));if(v.schema===1&&v.sources&&v.records)this.state=v;}}catch(e){Zotero.logError(e);}this.status={phase:'idle',completed:0,total:0,papers:Object.keys(this.state.records).length};},
 async cancelBuild(){await this.configure({networkEnhancePaused:true});for(const job of this.network.graphJobs.values())if(job.enhanced&&!job.value)job.controller.abort();this.status={...this.status,phase:'cancelled',message:'增强构建已取消，已取得的资料保留'};this.emit();},
 async configure(value){Object.assign(CiteLensServices.state.settings,value);await CiteLensServices.persist();if(!this.config.enabled||this.config.paused)this.cancel();this.emit();},
 subscribe(fn){this.listeners.add(fn);return()=>this.listeners.delete(fn);},emit(){for(const fn of this.listeners)fn(this.status);},
 cancel(){this.epoch++;this.referenceController?.abort();for(const r of this.requests){r.signal?.removeEventListener('abort',r.cancel);r.reject(Error('引文增强已暂停'));}this.requests.clear();this.requests=new Set();},
 async stop(){this.dead=true;this.cancel();await this.write.catch(()=>{});this.listeners.clear();},
 async persist(){const {text}=await this.network.compute('cache-encode',{value:this.state});this.write=this.write.catch(()=>{}).then(()=>IOUtils.writeUTF8(this.path,text,{tmpPath:this.path+'.tmp'}));await this.write;},
 noteSource(id){const s=this.state.sources[id];if(s)s.signature='';},
 needsUpdate(nodes){if(!this.config.enabled||this.config.paused)return false;return nodes.filter(n=>!n.external&&n.itemID).some(n=>{const s=this.state.sources[n.id];return !s||s.signature!==this.signature(n)||!s.complete&&(!s.bounded||s.boundLimit!==this.config.limit)||s.complete&&s.checked<Date.now()-30*86400000;});},
 signature(n){return JSON.stringify([CiteLensCore.recordDOI(n),CiteLensCore.norm(n.title),n.year,n.PMID||'',n.PMCID||'',this.network.revisions.enhancement||'references-1']);},
 key(n){const doi=CiteLensCore.recordDOI(n);return doi?'ref:doi:'+doi:/^\d{1,12}$/.test(String(n.PMID||''))?'ref:pmid:'+n.PMID:n.S2ID?'ref:s2:'+n.S2ID:'';},
 verified(n){return !!(this.key(n)&&CiteLensCore.plainTitle(n.title).length>=12&&n.creators?.length&&n.year);},
 normalize(n){return {...n,id:this.key(n),title:CiteLensCore.plainTitle(n.title),abstract:CiteLensCore.plainTitle(n.abstract||''),year:String(n.year||''),type:n.type||'journalArticle',external:true,local:false,collections:[],attachments:[],relatedKeys:[]};},
 source(n){let row=this.state.sources[n.id];if(row?.complete&&row.checked<Date.now()-30*86400000){row.loaded=false;row.complete=false;row.cursor=0;}if(!row||row.signature!==this.signature(n)){row={signature:this.signature(n),refs:[],cursor:0,checked:0,complete:false};this.state.sources[n.id]=row;}return row;},
 async json(url){if(!/^https:\/\/api\.(?:semanticscholar\.org|crossref\.org)\//.test(url))throw Error('Unsupported reference source');const response=await Zotero.HTTP.request('GET',url,{responseType:'json',timeout:14000,headers:{Accept:'application/json'}});return response.response;},
 async references(n){
  const controller=new (Zotero.getMainWindow().AbortController)();this.referenceController=controller;const check=()=>{if(controller.signal.aborted)throw Error('cancelled');};
  const C=CiteLensCore,local=Object.values(this.network.state.sources||{}).filter(s=>s.source===n.id).flatMap(s=>s.refs||[]);let doi=C.recordDOI(n),failures=0,answered=0;
  const ncbi=async()=>{try{const result=await CiteLensAbstracts.referenceList({...n,DOI:doi},{signal:controller.signal});check();answered++;if(result.refs.some(r=>this.key(r)||C.plainTitle(r.title).length>=20))return {...result,refs:[...result.refs,...local]};}catch(e){check();failures++;}return null;};
  if(n.PMID||n.PMCID){const result=await ncbi();if(result)return result;}
  if(!doi&&!n.PMID&&!n.PMCID){try{const match=await CiteLensServices.lookup(n),r=match.status==='matched'?match.ranked?.[0]?.record:null;if(r&&CiteLensAbstracts.select(n,[r]))doi=C.recordDOI(r);}catch(_){}}
  if(!n.PMID&&!n.PMCID){const result=await ncbi();if(result)return result;}
  if(!doi){if(!local.length&&!answered&&failures)throw Error('公开引文服务暂不可用，请稍后重试');return {refs:local,source:'PDF',unavailable:!local.length};}
  check();
  // A single S2 response often supplies title, full author list and abstract together.
  try{const data=await this.json('https://api.semanticscholar.org/graph/v1/paper/DOI:'+encodeURIComponent(doi)+'/references?fields=title,year,authors,abstract,externalIds,journal&limit=200');check();answered++;
   const rows=(data.data||[]).map(x=>x.citedPaper).filter(Boolean).map(r=>({title:r.title,year:r.year,DOI:C.doi(r.externalIds?.DOI),PMID:r.externalIds?.PubMed,PMCID:r.externalIds?.PubMedCentral,S2ID:r.paperId,journal:r.journal?.name,volume:r.journal?.volume,pages:r.journal?.pages,abstract:r.abstract,metadataVerified:true,source:'Semantic Scholar',creators:(r.authors||[]).map(a=>{const parts=C.clean(a.name).split(/\s+/);return {firstName:parts.slice(0,-1).join(' '),lastName:parts.at(-1)||'',creatorType:'author'};})}));
   if(rows.length)return {refs:[...rows,...local],source:'Semantic Scholar',limited:data.next!=null};
  }catch(e){check();if((e.status||e.xmlhttp?.status)!==404)failures++;else answered++;}
  try{const data=await this.json('https://api.crossref.org/works/'+encodeURIComponent(doi)),m=data.message;check();answered++;if(C.doi(m?.DOI)!==doi)throw Error('Reference source identity mismatch');const rows=(m.reference||[]).map(r=>({...C.parse(r.unstructured||''),DOI:C.doi(r.DOI),title:r['article-title']||C.parse(r.unstructured||'').title,author:r.author,year:String(r.year||''),raw:r.unstructured,source:'Crossref'}));return {refs:[...rows,...local],source:'Crossref'};}catch(_){check();failures++;}
  if(local.length)return {refs:local,source:'PDF'};if(!answered&&failures)throw Error('公开引文服务暂不可用，请稍后重试');return {refs:[],source:'public',unavailable:true};
 },
 async resolve(ref){
  const C=CiteLensCore,key=this.key(ref),saved=key&&this.state.records[key];if(saved)return saved;if(ref.metadataVerified&&this.verified(ref))return this.normalize(ref);
  let record;if(C.recordDOI(ref)){let data;try{data=await this.json('https://api.crossref.org/works/'+encodeURIComponent(C.recordDOI(ref)));}catch(e){if((e.status||e.xmlhttp?.status)===404)return null;throw e;}record=C.fromCrossref(data.message);if(C.recordDOI(record)!==C.recordDOI(ref)||!CiteLensAbstracts.select(ref,[record]))return null;}
  else if(C.plainTitle(ref.title).length>=20){const match=await CiteLensServices.lookup(ref);record=match.status==='matched'?match.ranked?.[0]?.record:null;if(record&&!CiteLensAbstracts.select(ref,[record]))record=null;}
  return record&&this.verified(record)?this.normalize(record):null;
 },
 ensure(nodes,{signal,progress=()=>{},foreground=false,refresh=0}={}){
  if(!this.config.enabled||this.config.paused)return Promise.resolve();if(this.dead||signal?.aborted)return Promise.reject(Error('已取消'));
  const roots=nodes.filter(n=>!n.external&&n.itemID);return new Promise((resolve,reject)=>{const rootIDs=new Set(roots.map(n=>n.id)),localDOIs=new Set(roots.map(n=>CiteLensCore.recordDOI(n)).filter(Boolean)),localPMIDs=new Set(roots.map(n=>String(n.PMID||'')).filter(Boolean)),keys=new Set();for(const n of roots)for(const row of this.state.sources[n.id]?.refs||[]){const item=this.state.records[row.key];if(item&&!localDOIs.has(CiteLensCore.recordDOI(item))&&!localPMIDs.has(String(item.PMID||'')))keys.add(item.id);}const r={roots,rootIDs,localDOIs,localPMIDs,keys,signal,progress,foreground,refresh,resolve,reject,added:new Set(),pending:new Map(roots.map(n=>[n.id,n])),completed:0};r.cancel=()=>{this.requests.delete(r);signal?.removeEventListener('abort',r.cancel);reject(Error('已取消'));};signal?.addEventListener('abort',r.cancel,{once:true});this.requests.add(r);this.run();});
 },
 async run(){
  if(this.running)return;const task={epoch:this.epoch},requests=this.requests;this.running=task;const valid=()=>!this.dead&&task.epoch===this.epoch&&this.config.enabled&&!this.config.paused;
  const finish=(r,error)=>{requests.delete(r);r.signal?.removeEventListener('abort',r.cancel);error?r.reject(error):r.resolve();};let processed=0;
  try{while(valid()&&requests.size){
   if(this.config.foregroundOnly&&!this.network.views.size){this.status.phase='waiting';this.emit();await Zotero.Promise.delay(2000);continue;}
   let target=null,priority=-1;
   for(const r of [...requests]){if(r.signal?.aborted){r.cancel();continue;}let next=r.pending.values().next().value;while(next){const s=this.source(next);if(s.bounded&&(s.boundLimit!==this.config.limit||r.refresh>s.boundAt))s.bounded=false;if(!s.bounded&&(!s.complete||s.checked<=Date.now()-30*86400000))break;r.pending.delete(next.id);r.completed++;next=r.pending.values().next().value;}const done=r.completed;
    const limitReached=this.config.limit>0&&r.added.size>=this.config.limit;this.status={phase:limitReached?'limited':'references',completed:done,total:r.roots.length,papers:r.keys.size};r.progress({phase:'references',completed:done,total:r.roots.length,limited:limitReached});this.emit();
    if(!next||limitReached){if(limitReached)for(const n of r.pending.values()){const s=this.source(n);s.bounded=true;s.boundAt=Date.now();s.boundLimit=this.config.limit;}finish(r);continue;}const score=(r.foreground?10:0)+(this.network.abstractPriority?.has(CiteLensCore.recordDOI(next)||CiteLensCore.norm(next.title))?100:0);if(score>priority){target=next;priority=score;}
   }
   if(!target)break;const source=this.source(target);
   if(!source.loaded){const fetched=await this.references(target);if(!valid())break;const unique=new Map();for(const ref of fetched.refs){const key=this.key(ref)||CiteLensCore.identity(ref);if(key&&!unique.has(key))unique.set(key,ref);}source.refs=[...unique.values()].slice(0,200).map(ref=>({ref,key:this.key(ref)}));source.source=fetched.source;source.limited=!!fetched.limited||unique.size>200;source.loaded=true;source.cursor=0;}
   // Resolve at most one reference before yielding, so reading and cancellation stay responsive.
   if(source.cursor<source.refs.length){const row=source.refs[source.cursor];try{const record=await this.resolve(row.ref);if(!valid())break;if(record){this.state.records[record.id]=record;row.key=record.id;for(const r of requests)if(r.rootIDs.has(target.id)&&!r.localDOIs.has(CiteLensCore.recordDOI(record))&&!r.localPMIDs.has(String(record.PMID||''))){if(!r.keys.has(record.id))r.added.add(record.id);r.keys.add(record.id);}}row.resolved=true;source.cursor++;}catch(e){throw e;}}
   if(source.cursor>=source.refs.length){source.complete=true;source.checked=Date.now();}
   if(++processed%10===0)await this.persist();await Zotero.Promise.delay(this.network.views.size?700:2500);
  }}catch(e){this.status={...this.status,phase:'error',message:e.message};this.emit();for(const r of [...requests])finish(r,e);}finally{
   if(!this.dead)try{await this.persist();}catch(e){Zotero.logError(e);}if(!valid())for(const r of [...requests])finish(r,Error('引文增强已暂停'));
   if(this.running===task){this.running=null;if(!this.dead&&this.config.enabled&&!this.config.paused&&this.requests.size)this.run();else if(this.status.phase==='references'){this.status.phase='ready';this.emit();}}
  }
 },
 augment(nodes,edges){
  if(!this.config.enabled)return {nodes,edges};const C=CiteLensCore,byDOI=new Map(nodes.filter(n=>C.recordDOI(n)).map(n=>[C.recordDOI(n),n])),byPMID=new Map(nodes.filter(n=>n.PMID).map(n=>[String(n.PMID),n])),byID=new Map(nodes.map(n=>[n.id,n])),links=new Map(edges.map(e=>[e.source+'|'+e.target+'|'+e.kind,e]));let added=0;
  for(const parent of nodes){if(parent.external)continue;const source=this.state.sources[parent.id];if(!source||source.signature!==this.signature(parent)||!source.complete&&!source.bounded)continue;for(const row of source.refs){const r=this.state.records[row.key];if(!r)continue;let target=byDOI.get(C.recordDOI(r))||byPMID.get(String(r.PMID||''))||byID.get(r.id);if(!target){target={...r,libraryID:parent.libraryID};byID.set(r.id,target);if(C.recordDOI(r))byDOI.set(C.recordDOI(r),target);if(r.PMID)byPMID.set(String(r.PMID),target);added++;}if(target.id===parent.id)continue;links.set(parent.id+'|'+target.id+'|cites',{source:parent.id,target:target.id,kind:'cites',evidence:[{source:source.source,sourcePaper:parent.id,targetPaper:target.id}]});}}
  return {nodes:[...byID.values()],edges:[...links.values()]};
 },
 dialog(doc,onChange){
  const U=CiteLensUI,d=U.dialog(doc,'网络增强',{className:'pn-enhancement',onClose:()=>unsubscribe()}),{root,footer}=d;root.append(U.el(doc,'p','将本地论文直接引用的文献纳入主题与朋友圈。','cl-muted'));
  const row=(label,control)=>{const r=U.el(doc,'label',null,'pn-enhancement-row');r.append(U.el(doc,'span',label),control);root.append(r);};
  const enabled=U.el(doc,'input');enabled.type='checkbox';enabled.checked=this.config.enabled;row('纳入引用文献',enabled);
  const limit=U.el(doc,'select');for(const n of [250,500,1000,0]){const o=U.el(doc,'option',n?String(n):'不设限制');o.value=n;limit.append(o);}limit.value=String(this.config.limit);row('新增论文上限',limit);
  const pace=U.el(doc,'select');for(const [id,label] of [['background','后台低速准备'],['foreground','仅查看网络时准备']]){const o=U.el(doc,'option',label);o.value=id;pace.append(o);}pace.value=this.config.foregroundOnly?'foreground':'background';row('准备方式',pace);
  const progress=U.el(doc,'progress'),message=U.el(doc,'p','','cl-muted');progress.max=1;root.append(progress,message,U.el(doc,'p','上限按单次新增计，不限制已有网络。只扩展一层引文，不自动添加到 Zotero 文献库。','cl-muted'));
  const pause=U.button(doc,'',async()=>{if(this.config.paused)await this.configure({networkEnhancePaused:false});else await this.cancelBuild();onChange();render();});footer.append(pause);const render=()=>{const s=this.status||{};pause.textContent=this.config.paused?'继续准备':'取消增强构建';pause.disabled=!this.config.enabled;progress.value=s.total?s.completed/s.total:0;message.textContent=(s.phase==='limited'?'已达到本次新增上限；点击更新网络可继续。':s.message||'')+(s.total?s.completed+' / '+s.total+' 篇来源论文 · ':'')+(s.papers||0)+' 篇引用文献';};const unsubscribe=this.subscribe(render);
  pause.dataset.cancelEnhancement='true';for(const control of [enabled,limit,pace])control.addEventListener('change',async()=>{await this.configure({networkEnhanceEnabled:enabled.checked,networkEnhanceLimit:Number(limit.value),networkEnhancePace:pace.value,networkEnhancePaused:false});onChange();render();});render();return d.frame;
 }
};
