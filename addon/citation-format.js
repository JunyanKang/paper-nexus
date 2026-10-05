/* CSL formatting uses Zotero's installed engine and official style definitions.
 * No temporary library items, custom punctuation templates, or global engine mutations. */
var CiteLensCitationFormat={
 presets:[["apa", "APA 7"], ["american-medical-association", "AMA 11"], ["modern-language-association", "MLA 9"], ["nlm-citation-sequence", "NLM · Citation–sequence"], ["nlm-name-year", "NLM · Name–year"], ["vancouver-nlm", "Vancouver / NLM"], ["nature", "Nature"], ["science", "Science"], ["cell", "Cell"], ["pnas", "PNAS"], ["nature-communications", "Nature Communications"], ["nature-medicine", "Nature Medicine"], ["the-lancet", "The Lancet"], ["the-new-england-journal-of-medicine", "NEJM"], ["jama", "JAMA"], ["elife", "eLife"], ["plos-biology", "PLOS Biology"], ["plos-medicine", "PLOS Medicine"], ["plos-one", "PLOS ONE"], ["biomed-central", "BMC"], ["genome-biology", "Genome Biology"], ["genome-research", "Genome Research"], ["nucleic-acids-research", "Nucleic Acids Research"], ["bioinformatics", "Bioinformatics"], ["development", "Development"], ["the-journal-of-cell-biology", "Journal of Cell Biology"], ["the-journal-of-neuroscience", "Journal of Neuroscience"], ["frontiers-in-cell-and-developmental-biology", "Frontiers · Cell and Developmental Biology"], ["investigative-ophthalmology-and-visual-science", "IOVS"], ["ophthalmology", "Ophthalmology"], ["ieee", "IEEE"], ["chicago-author-date", "Chicago · Author–date"], ["china-national-standard-gb-t-7714-2015-numeric", "GB/T 7714—2015"]],
 pending:new Map(),cache:new Map(),
 id(value){const slug=String(value||'nature').replace(/^https?:\/\/www.zotero.org\/styles\//,'');if(!/^[a-z0-9][a-z0-9-]{0,180}$/.test(slug))throw Error('无效的引文格式');return 'http://www.zotero.org/styles/'+slug;},
 async choices(){await Zotero.Styles.init();const rows=this.presets.map(([id,label])=>[this.id(id),label]),seen=new Set(rows.map(x=>x[0]));for(const s of Zotero.Styles.getVisible())if(!seen.has(s.styleID)){rows.push([s.styleID,s.title]);seen.add(s.styleID);}return rows;},
 async load(value,seen=new Set()){
  const id=this.id(value);if(seen.has(id)||seen.size>5)throw Error('引文格式依赖异常');seen.add(id);await Zotero.Styles.init();const installed=Zotero.Styles.get(id);if(installed)return installed.getXML();if(this.cache.has(id))return this.cache.get(id);
  if(this.pending.has(id))return this.pending.get(id);
  const work=(async()=>{const slug=id.split('/').pop(),dir=PathUtils.join(PathUtils.parent(CiteLensServices.path),'styles'),path=PathUtils.join(dir,slug+'.csl');let xml;
   if(await IOUtils.exists(path))xml=await IOUtils.readUTF8(path);
   else{for(const sub of ['', 'dependent/']){try{const r=await Zotero.HTTP.request('GET','https://raw.githubusercontent.com/citation-style-language/styles/master/'+sub+slug+'.csl',{responseType:'text',timeout:12000});xml=r.responseText;break;}catch(e){if(e.status!==404||sub)throw Error('无法获取引文格式，请联网后重试');}}}
   if(!xml||xml.length>1000000)throw Error('引文格式文件无效');const style=new Zotero.Style(xml);if(this.id(style.styleID)!==id)throw Error('引文格式标识不匹配');
   const resolved=style.source?await this.load(style.source,new Set(seen)):xml;
   if(!await IOUtils.exists(path)){await IOUtils.makeDirectory(dir,{ignoreExisting:true});await IOUtils.writeUTF8(path,xml,{tmpPath:path+'.tmp'});}this.cache.set(id,resolved);return resolved;
  })();this.pending.set(id,work);try{return await work;}finally{this.pending.delete(id);}
 },
 item(record){const C=CiteLensCore,authors=record.creators||record.authors||[],item={id:'paper-nexus-citation',type:({book:'book',bookSection:'chapter',conferencePaper:'paper-conference',thesis:'thesis',preprint:'article'})[record.type]||'article-journal',title:C.plainTitle(record.title),'container-title':C.plainTitle(record.journal||''),publisher:record.publisher||'',volume:record.volume||'',issue:record.issue||'',page:record.pages||record.page||'',DOI:C.recordDOI(record),URL:record.url||''};
  const year=String(record.year||'').match(/\b\d{4}\b/);if(year)item.issued={'date-parts':[[Number(year[0])]]};if(authors.length)item.author=authors.map(a=>a.name?{literal:a.name}:{family:a.lastName||a.family||'',given:a.firstName||a.given||''}).filter(a=>a.literal||a.family||a.given);else if(record.author)item.author=[{literal:record.author}];return item;
 },
 async format(record,value=CiteLensServices.state.settings.citationStyle||'nature'){
  const xml=await this.load(value),item=this.item(record);if(!item.title)throw Error('缺少文献题目，无法生成引文');
  const system=new Zotero.Cite.System({automaticJournalAbbreviations:true,uppercaseSubtitles:/\/apa$/.test(this.id(value))});system.retrieveItem=id=>{if(String(id)!==item.id)throw Error('未知文献');return JSON.parse(JSON.stringify(item));};
  const engine=new Zotero.CiteProc.CSL.Engine(system,xml,'en-US');try{engine.setOutputFormat('text');engine.updateItems([item.id]);const bib=engine.makeBibliography();if(!bib?.[1]?.length)throw Error('所选格式无法生成参考文献');return bib[1].join('').trim();}finally{engine.free?.();}
 }
};
