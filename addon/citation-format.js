/* CSL formatting uses Zotero's installed engine and official style definitions.
 * No temporary library items, custom punctuation templates, or global engine mutations. */
var CiteLensCitationFormat={
 presets:[["apa", "APA 7"], ["american-medical-association", "AMA 11"], ["modern-language-association", "MLA 9"], ["nlm-citation-sequence", "NLM · Citation–sequence"], ["nlm-name-year", "NLM · Name–year"], ["vancouver-nlm", "Vancouver / NLM"], ["nature", "Nature"], ["science", "Science"], ["cell", "Cell"], ["pnas", "PNAS"], ["nature-communications", "Nature Communications"], ["nature-medicine", "Nature Medicine"], ["the-lancet", "The Lancet"], ["the-new-england-journal-of-medicine", "NEJM"], ["jama", "JAMA"], ["elife", "eLife"], ["plos-biology", "PLOS Biology"], ["plos-medicine", "PLOS Medicine"], ["plos-one", "PLOS ONE"], ["biomed-central", "BMC"], ["genome-biology", "Genome Biology"], ["genome-research", "Genome Research"], ["nucleic-acids-research", "Nucleic Acids Research"], ["bioinformatics", "Bioinformatics"], ["development", "Development"], ["the-journal-of-cell-biology", "Journal of Cell Biology"], ["the-journal-of-neuroscience", "Journal of Neuroscience"], ["frontiers-in-cell-and-developmental-biology", "Frontiers · Cell and Developmental Biology"], ["investigative-ophthalmology-and-visual-science", "IOVS"], ["ophthalmology", "Ophthalmology"], ["ieee", "IEEE"], ["chicago-author-date", "Chicago · Author–date"], ["china-national-standard-gb-t-7714-2015-numeric", "GB/T 7714—2015"]],
 pending:new Map(),cache:new Map(),
 id(value){const slug=String(value||'nature').replace(/^https?:\/\/www.zotero.org\/styles\//,'');if(!/^[a-z0-9][a-z0-9-]{0,180}$/.test(slug))throw Error('无效的引文格式');return 'http://www.zotero.org/styles/'+slug;},
 async choices(){await Zotero.Styles.init();const rows=this.presets.map(([id,label])=>[this.id(id),label]),seen=new Set(rows.map(x=>x[0]));for(const s of Zotero.Styles.getVisible())if(!seen.has(s.styleID)){rows.push([s.styleID,s.title]);seen.add(s.styleID);}return rows;},
 async load(value,seen=new Set()){
  const id=this.id(value);if(seen.has(id)||seen.size>5)throw Error('引文格式依赖异常');seen.add(id);await Zotero.Styles.init();const installed=Zotero.Styles.get(id);if(installed)return installed.source?this.load(installed.source,new Set(seen)):installed.getXML();if(this.cache.has(id))return this.cache.get(id);
  if(this.pending.has(id))return this.pending.get(id);
  const work=(async()=>{const slug=id.split('/').pop(),dir=PathUtils.join(PathUtils.parent(CiteLensServices.path),'styles'),path=PathUtils.join(dir,slug+'.csl');let xml;
   if(await IOUtils.exists(path))xml=await IOUtils.readUTF8(path);
   else{for(const sub of ['', 'dependent/']){try{const r=await Zotero.HTTP.request('GET','https://raw.githubusercontent.com/citation-style-language/styles/master/'+sub+slug+'.csl',{responseType:'text',timeout:12000});xml=r.responseText;break;}catch(e){if(e.status!==404||sub)throw Error('无法获取引文格式，请联网后重试');}}}
   if(!xml||xml.length>1000000)throw Error('引文格式文件无效');const style=new Zotero.Style(xml);if(this.id(style.styleID)!==id)throw Error('引文格式标识不匹配');
   const resolved=style.source?await this.load(style.source,new Set(seen)):xml;
   if(!await IOUtils.exists(path)){await IOUtils.makeDirectory(dir,{ignoreExisting:true});await IOUtils.writeUTF8(path,xml,{tmpPath:path+'.tmp'});}this.cache.set(id,resolved);return resolved;
  })();this.pending.set(id,work);try{return await work;}finally{this.pending.delete(id);}
 },
 item(record){const C=CiteLensCore,authors=record.creators||record.authors||[],item={id:'paper-nexus-citation',type:({book:'book',bookSection:'chapter',conferencePaper:'paper-conference',thesis:'thesis',preprint:'article'})[record.type]||'article-journal',title:C.plainTitle(record.title),'container-title':C.plainTitle(record.type==='book'?'':record.bookTitle||record.containerTitle||record.journal||record.publicationTitle||record.repository||''),'container-title-short':C.plainTitle(record.journalAbbreviation||''),'publisher-place':record.place||'',edition:record.edition||'',ISBN:record.ISBN||'',publisher:record.publisher||'',volume:record.volume||'',issue:record.issue||'',page:record.pages||record.page||'',DOI:C.recordDOI(record),URL:record.url||''};
  const year=String(record.year||record.date||'').match(/\b\d{4}\b/);if(year)item.issued={'date-parts':[[Number(year[0])]]};if(authors.length)item.author=authors.map(a=>a.name?{literal:a.name}:{family:a.lastName||a.family||'',given:a.firstName||a.given||''}).filter(a=>a.literal||a.family||a.given);else if(record.author)item.author=[{literal:record.author}];return item;
 },
 // Render every publication surface with the selected CSL rules. Metadata stays canonical.
 results:new Map(),renderTail:Promise.resolve(),bindings:new Set(),observers:new WeakMap(),
 enriched(record){
  const C=CiteLensCore,cached=CiteLensServices.state.cache?.[C.identity(record)]?.value?.ranked?.[0]?.record;
  if(!cached||C.decide(record,[cached]).status!=='matched')return record;
  const sameContainer=C.norm(record.journal||record.bookTitle||record.publicationTitle)===C.norm(cached.journal||cached.bookTitle||cached.publicationTitle);
  return {...cached,...record,journalAbbreviation:record.journalAbbreviation||(sameContainer?cached.journalAbbreviation:'')};
 },
 projection(xml,part){
  if(part==='citation')return xml;
  const win=Zotero.getMainWindow(),doc=new win.DOMParser().parseFromString(xml,'application/xml');
  if(doc.querySelector('parsererror'))throw Error('引文格式文件无效');
  // Retain original conditions, macros, locale, punctuation and date/number formatting.
  const allowed=new Set(part==='container'?['container-title','container-title-short']:['container-title','container-title-short','collection-title','publisher','publisher-place','volume','issue','page','edition','number','genre','event-title','event-place']);
  for(const e of [...doc.getElementsByTagName('*')]){
   if(e.closest('info,locale'))continue;
   if(['sort','citation'].includes(e.localName)){e.remove();continue;}
   if(e.localName==='names'){e.remove();continue;}
   if(e.localName==='date'&&(part==='container'||e.getAttribute('variable')!=='issued')){e.remove();continue;}
   if(['text','number','label'].includes(e.localName)){
    const variable=e.getAttribute('variable');if(variable&&!variable.split(/\s+/).some(x=>allowed.has(x)))e.remove();
    else if(part==='container'&&(e.hasAttribute('term')||e.hasAttribute('value')))e.remove();
   }
  }
  const macros=[...doc.getElementsByTagName('macro')],live=new Set();
  const substantive=e=>[e,...e.querySelectorAll('*')].some(n=>!n.closest('info,locale')&&((['text','number'].includes(n.localName)&&n.hasAttribute('variable'))||n.localName==='date'&&n.getAttribute('variable')==='issued'||n.localName==='text'&&live.has(n.getAttribute('macro'))));
  for(let changed=true;changed;){changed=false;for(const macro of macros)if(!live.has(macro.getAttribute('name'))&&substantive(macro)){live.add(macro.getAttribute('name'));changed=true;}}
  for(const e of [...doc.getElementsByTagName('*')].reverse()){
   if(e.closest('info,locale'))continue;
   if(e.localName==='text'&&e.hasAttribute('macro')&&!live.has(e.getAttribute('macro')))e.remove();
   else if(['macro','group','choose'].includes(e.localName)&&!substantive(e))e.remove();
   if(part==='container'){e.removeAttribute('prefix');e.removeAttribute('suffix');}
  }
  for(const e of doc.getElementsByTagName('layout'))e.removeAttribute('prefix');
  return new win.XMLSerializer().serializeToString(doc);
 },
 async format(record,value=CiteLensServices.state.settings.citationStyle||'nature',part='citation'){
  const item=this.item(this.enriched(record)),id=this.id(value),key=JSON.stringify([id,part,item]);
  if(this.results.has(key))return this.results.get(key);
  const work=(async()=>{
   const xml=this.projection(await this.load(value),part);
   const run=async()=>{
    // Yield between engines; long lists must not monopolize the reader UI.
    await new Promise(resolve=>Zotero.getMainWindow().setTimeout(resolve,0));
    const C=CiteLensCore,system=new Zotero.Cite.System({automaticJournalAbbreviations:!item['container-title-short']||C.norm(item['container-title-short'])===C.norm(item['container-title']),uppercaseSubtitles:/\/apa$/.test(id)});
    system.retrieveItem=key=>{if(String(key)!==item.id)throw Error('未知文献');return JSON.parse(JSON.stringify(item));};
    const engine=new Zotero.CiteProc.CSL.Engine(system,xml,'en-US');try{engine.setOutputFormat('text');engine.updateItems([item.id]);const bib=engine.makeBibliography();if(!bib?.[1]?.length)throw Error('所选格式无法生成参考文献');return bib[1].join('').replace(/\s+/g,' ').trim();}finally{engine.free?.();}
   };
   const result=this.renderTail.then(run,run);this.renderTail=result.catch(()=>{});return result;
  })();
  this.results.set(key,work);while(this.results.size>192)this.results.delete(this.results.keys().next().value);
  try{return await work;}catch(e){this.results.delete(key);throw e;}
 },
 bind(node,record,{part='publication',onText=null}={}){
  const state={record:{...record},part,onText,ticket:0};node._clCitation=state;node.dataset.clCitation=part;
  if(this.bindings.size>512)for(const ref of this.bindings)if(!ref.deref()?.isConnected)this.bindings.delete(ref);
  if(!node._clCitationRef)node._clCitationRef=new WeakRef(node);this.bindings.add(node._clCitationRef);
  const win=node.ownerDocument.defaultView;
  const update=()=>{const current=node._clCitation;if(!current||!node.isConnected)return;const ticket=++current.ticket;node.setAttribute('aria-busy','true');this.format(current.record,undefined,current.part).then(text=>{
   if(!node.isConnected||node._clCitation!==current||ticket!==current.ticket)return;
   node.textContent=text;node.removeAttribute('title');node.removeAttribute('aria-busy');const owner=node.closest('.cl-journal-name');owner?.setAttribute('aria-label',text);current.onText?.(text);
  }).catch(()=>{if(node._clCitation!==current||ticket!==current.ticket)return;node.textContent='';node.removeAttribute('aria-busy');node.setAttribute('title','引文格式暂不可用，请在设置中重试');});};
  node._clCitationUpdate=update;
  win.requestAnimationFrame(()=>{if(!node.isConnected)return;if(part==='citation'||!win.IntersectionObserver){update();return;}
   let observer=this.observers.get(node.ownerDocument);if(!observer){observer=new win.IntersectionObserver(entries=>{for(const entry of entries){if(!entry.target.isConnected){observer.unobserve(entry.target);continue;}if(entry.isIntersecting){observer.unobserve(entry.target);entry.target._clCitationUpdate?.();}}},{rootMargin:'100px'});this.observers.set(node.ownerDocument,observer);win.addEventListener('unload',()=>observer.disconnect(),{once:true});}observer.observe(node);
  });return node;
 },
 refresh(){for(const ref of [...this.bindings]){const node=ref.deref();if(!node?.isConnected){this.bindings.delete(ref);continue;}this.bind(node,node._clCitation.record,node._clCitation);}},
 locator(record){const volume=(record.volume||'')+(record.issue?'('+record.issue+')':'');return volume+(record.pages?', '+record.pages:'');},
 parseLocator(value){const text=CiteLensCore.clean(value);if(!text)return {volume:'',issue:'',pages:''};const match=text.match(/^([^,()]+)?(?:\(([^()]+)\))?(?:\s*,\s*(.+))?$/);if(!match)throw Error('请按 卷(期), 页码 填写');return {volume:(match[1]||'').trim(),issue:(match[2]||'').trim(),pages:(match[3]||'').trim()};}
};
