/* Published abstracts, fetched on demand. Credentials never enter shared state or URLs. */
var CiteLensAbstracts = (() => {
  const C=CiteLensCore,A=CiteLensAuthors,clock=()=>Zotero.getMainWindow(),pending=new Map();let nextNCBI=0;
  const text=value=>String(value||'').replace(/<(?:\/?(?:jats:)?(?:p|title|sec|h[1-6])\b)[^>]*>/gi,'\n\n').split(/\n\s*\n/).map(C.plainTitle).filter(Boolean).join('\n\n').slice(0,30000);
  const later=(fn,ms)=>clock().setTimeout(fn,ms),clear=id=>clock().clearTimeout(id);
  function deadline(work,ms){let id;return Promise.race([work,new Promise((_,reject)=>{id=later(()=>reject(Error('timeout')),Math.max(1,ms));})]).finally(()=>clear(id));}
  function placement(anchor,viewport,cardTop=anchor.top,height=360){
    const gap=0,edge=8,right=viewport.width-anchor.right-gap-edge,left=anchor.left-gap-edge;
    if(Math.max(left,right)<220)return {side:'inline'};
    const side=right>=420||right>=left?'right':'left',width=Math.min(440,side==='right'?right:left),maxHeight=Math.max(90,Math.min(400,viewport.height*.6,viewport.height-58));
    return {side,width,maxHeight,left:side==='right'?anchor.right+gap:anchor.left-gap-width,top:Math.max(42,Math.min(cardTop,viewport.height-Math.min(height,maxHeight)-edge))};
  }
  function apiKey(value){
    if(value===undefined)return Zotero.Prefs.get('citeLens.ncbiApiKey')||'';
    value=String(value).trim();if(value&&!/^[a-zA-Z0-9_-]{16,128}$/.test(value))throw Error('请填写完整的 NCBI API key');
    if(value)Zotero.Prefs.set('citeLens.ncbiApiKey',value);else Zotero.Prefs.clear('citeLens.ncbiApiKey');return value;
  }
  function transport(url,{body=null,timeout=7000,signal}={}){
    return new Promise((resolve,reject)=>{
      // Native XHR avoids Zotero's debug logger printing credential-bearing POST bodies.
      const xhr=new (clock().XMLHttpRequest)();xhr.open(body?'POST':'GET',url,true);xhr.timeout=timeout;
      const abort=()=>xhr.abort(),done=()=>signal?.delete(abort);signal?.add(abort);
      xhr.onload=()=>{done();if(xhr.status>=200&&xhr.status<300)resolve(xhr.responseText);else reject(Error(xhr.status===429?'busy':'network'));};
      xhr.onerror=xhr.ontimeout=xhr.onabort=()=>{done();reject(Error('network'));};
      if(body)xhr.setRequestHeader('Content-Type','application/x-www-form-urlencoded');xhr.send(body);
    });
  }
  const xml=value=>{const doc=new (clock().DOMParser)().parseFromString(value,'application/xml');if(doc.querySelector('parsererror'))throw Error('invalid response');return doc;};
  const content=(node,selector)=>C.plainTitle(node?.querySelector(selector)?.textContent||'');
  function pubmedRecords(value){return [...xml(value).querySelectorAll('PubmedArticle')].map(n=>{
    const a=n.querySelector('MedlineCitation > Article'),get=s=>content(a,s),id=type=>content(n,'PubmedData > ArticleIdList > ArticleId[IdType="'+type+'"]');
    return {title:get('ArticleTitle'),PMID:content(n,'MedlineCitation > PMID'),DOI:C.doi(id('doi')||get('ELocationID[EIdType="doi"]')),PMCID:id('pmc'),year:(get('Journal > JournalIssue > PubDate > Year')||get('ArticleDate > Year')||get('Journal > JournalIssue > PubDate > MedlineDate')).slice(0,4),journal:get('Journal > Title'),creators:[...a.querySelectorAll('AuthorList > Author')].map(x=>({firstName:content(x,'ForeName')||content(x,'Initials'),lastName:content(x,'LastName')||content(x,'CollectiveName'),creatorType:'author'})),abstract:[...a.querySelectorAll('Abstract > AbstractText')].map(x=>[x.getAttribute('Label')==='UNLABELLED'?'':x.getAttribute('Label'),text(x.innerHTML)].filter(Boolean).join('\n')).join('\n\n'),keywords:[...n.querySelectorAll('MedlineCitation > KeywordList > Keyword')].map(x=>C.clean(x.textContent)),publicationTypes:[...a.querySelectorAll('PublicationTypeList > PublicationType')].map(x=>C.clean(x.textContent))};
  });}
  function pmcRecords(value){return [...xml(value).querySelectorAll('article')].map(n=>{const a=n.querySelector(':scope > front > article-meta');if(!a)return null;const id=type=>content(a,'article-id[pub-id-type="'+type+'"]');return {title:content(a,'title-group > article-title'),DOI:C.doi(id('doi')),PMCID:A.ids({PMCID:(id('pmc')||id('pmcid')).replace(/^(\d)/,'PMC$1')}).PMCID,PMID:id('pmid'),year:content(a,'pub-date > year'),journal:content(n,'front > journal-meta > journal-title-group > journal-title'),creators:[...a.querySelectorAll('contrib-group > contrib[contrib-type="author"]')].map(x=>({firstName:content(x,'name > given-names'),lastName:content(x,'name > surname')||content(x,'collab'),creatorType:'author'})),abstract:text(a.querySelector(':scope > abstract:not([abstract-type="graphical"])')?.innerHTML),keywords:[...a.querySelectorAll('kwd-group > kwd')].map(x=>C.clean(x.textContent)),publicationTypes:[]};}).filter(Boolean);}
  function select(input,records){const identifiable=Object.values(A.ids(input)).some(Boolean),eligible=records.filter(r=>C.compatibility(input,r).eligible&&(!identifiable||A.matches(input,r)));if(identifiable)return eligible.length===1?eligible[0]:null;const result=C.decide(input,eligible);return result.status==='matched'?result.ranked[0].record:null;}
  async function request(ctx,url,body){if(ctx.stopped())throw Error('cancelled');return deadline(api.transport(url,{body,timeout:Math.min(7000,Math.max(1,ctx.until-Date.now())),signal:ctx.abort}),ctx.until-Date.now());}
  async function ncbi(ctx,method,params){
    const key=apiKey(),wait=Math.max(0,nextNCBI-Date.now());nextNCBI=Date.now()+wait+(key?120:380);
    if(wait)await deadline(new Promise(resolve=>later(resolve,wait)),ctx.until-Date.now());if(ctx.stopped())throw Error('cancelled');
    const body=Object.entries({...params,tool:'PaperNexus',...(key?{api_key:key}:{})}).map(([k,v])=>encodeURIComponent(k)+'='+encodeURIComponent(v)).join('&');
    return request(ctx,'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/'+method+'.fcgi',body);
  }
  const found=(r,source,url)=>({status:'available',text:text(r.abstract),source,url,record:r});
  async function pubmed(ctx,input){
    const ids=A.ids(input);let r;
    if(ids.PMCID){r=select(input,pmcRecords(await ncbi(ctx,'efetch',{db:'pmc',id:ids.PMCID.replace('PMC',''),retmode:'xml'})));if(r?.abstract)return found(r,'PMC','https://pmc.ncbi.nlm.nih.gov/articles/'+ids.PMCID+'/');}
    let pmid=ids.PMID;
    if(!pmid){const title=C.plainTitle(input.title).replace(/["\[\]]/g,' '),term=ids.DOI?ids.DOI+'[AID]':title.length>=12?'"'+title+'"[Title]':'';if(!term)return null;
      let search=JSON.parse(await ncbi(ctx,'esearch',{db:'pubmed',term,retmode:'json',retmax:5}));if(search.error)throw Error('NCBI unavailable');
      // A separate [Title] clause for a stopword (e.g. "during") makes ESearch return zero.
      // Long titles are not always in the phrase index. Retry informative words without stopwords.
      const words=title.split(/\W+/).filter(w=>w.length>2&&!/^(the|and|for|with|from|are|was|were|has|have|had|not|but|during|into|that|this|these|those|their|through|between|among|both|can|may|than|then|which|while|using)$/i.test(w)).slice(0,12);
      if(!search.esearchresult?.idlist?.length&&!ids.DOI&&words.length&&!ctx.stopped())search=JSON.parse(await ncbi(ctx,'esearch',{db:'pubmed',term:words.map(w=>w+'[Title]').join(' AND '),retmode:'json',retmax:5}));
      if(search.error)throw Error('NCBI unavailable');const list=search.esearchresult?.idlist||[];if(!list.length)return null;pmid=list.filter(x=>/^\d+$/.test(x)).join(',');}
    r=select(input,pubmedRecords(await ncbi(ctx,'efetch',{db:'pubmed',id:pmid,retmode:'xml'})));
    if(r?.abstract)return found(r,'PubMed','https://pubmed.ncbi.nlm.nih.gov/'+r.PMID+'/');
    if(r?.PMCID){const p=select({...input,...A.ids(r)},pmcRecords(await ncbi(ctx,'efetch',{db:'pmc',id:r.PMCID.replace('PMC',''),retmode:'xml'})));if(p?.abstract)return found(p,'PMC','https://pmc.ncbi.nlm.nih.gov/articles/'+r.PMCID+'/');}return null;
  }
  async function europe(ctx,input){const ids=A.ids(input),identified=Object.values(ids).some(Boolean),title=C.plainTitle(input.title).replace(/["\\]/g,' ');if(!identified&&title.length<12)return null;const query=ids.DOI?'DOI:"'+ids.DOI+'"':ids.PMID?'EXT_ID:'+ids.PMID+' AND SRC:MED':ids.PMCID?'PMCID:'+ids.PMCID:'TITLE:"'+title+'"';
    const data=JSON.parse(await request(ctx,'https://www.ebi.ac.uk/europepmc/webservices/rest/search?query='+encodeURIComponent(query)+'&format=json&resultType=core&pageSize=5'));
    const candidates=(data?.resultList?.result||[]).map(r=>({title:r.title,year:r.pubYear,creators:A.fromPMC(r),...A.ids({DOI:r.doi,PMID:r.pmid||(r.source==='MED'?r.id:''),PMCID:r.pmcid}),original:r}));
    const r=identified?A.selectPMC(input,data):select(input,candidates)?.original;
    if(!r?.abstractText)return null;return found({title:r.title,year:r.pubYear,creators:A.fromPMC(r),abstract:r.abstractText,...A.ids({DOI:r.doi,PMID:r.pmid||(r.source==='MED'?r.id:''),PMCID:r.pmcid}),keywords:r.keywordList?.keyword||[],publicationTypes:r.pubTypeList?.pubType||[]},'Europe PMC',r.pmcid?'https://europepmc.org/articles/'+r.pmcid:r.source==='MED'?'https://europepmc.org/article/MED/'+r.id:'https://doi.org/'+C.doi(r.doi));
  }
  async function crossref(ctx,input){const doi=C.doi(input.DOI);if(!doi&&C.plainTitle(input.title).length<12)return null;const url=doi?'https://api.crossref.org/works/'+encodeURIComponent(doi):'https://api.crossref.org/works?rows=3&query.bibliographic='+encodeURIComponent((input.raw||C.citation(input)).slice(0,1200));const data=JSON.parse(await request(ctx,url)).message,r=select(input,doi?[C.fromCrossref(data)]:(data?.items||[]).map(C.fromCrossref));if(r?.abstract)return found(r,'Crossref','https://doi.org/'+C.doi(r.DOI));if(r?.DOI&&!doi&&!ctx.stopped())return europe(ctx,r);return null;}
  async function lookup(S,input,{force=false,budget=12000}={}){
    if(S.dead)return {status:'offline'};
    if(text(input.abstract))return found(input,input.source||'文献记录',C.doi(input.DOI)?'https://doi.org/'+C.doi(input.DOI):'');
    const key=A.key(input),cached=S.state.abstractCache?.[key];if(!force&&cached?.version===3&&cached.expires>Date.now()&&(cached.value.status!=='available'||C.compatibility(input,cached.value.record||{}).eligible&&(!Object.values(A.ids(input)).some(Boolean)||A.matches(input,cached.value.record||{}))))return cached.value;
    if(pending.has(key))return pending.get(key);
    const ctx={until:Date.now()+budget,abort:new Set(),done:false,stopped(){return this.done||S.dead||Date.now()>=this.until;}};
    const work=(async()=>{let transient=false;
      // Local lookup has a short budget; it must not block a slow or busy library indefinitely.
      try{const local=await deadline(S.locate(input),Math.min(700,budget)),values=[...new Set(local.map(x=>text(x.item.getField('abstractNote'))).filter(Boolean))];if(values.length===1)return found({...input,abstract:values[0]},'本地文献库','');}catch(_){}
      const attempt=fn=>fn(ctx,input).then(value=>{if(value?.text)return value;throw Error('missing');}).catch(e=>{if(e.message!=='missing')transient=true;throw e;});
      // Two independent providers race; author/metadata background queues cannot hold up the preview.
      try{return await deadline(Promise.any([attempt(pubmed),attempt(europe)]),ctx.until-Date.now());}catch(_){}
      if(!ctx.stopped())try{const value=await crossref(ctx,input);if(value)return value;}catch(_){transient=true;}
      return {status:transient||ctx.stopped()?'offline':'missing'};
    })();
    const bounded=deadline(work,budget).catch(()=>({status:'offline'})).then(result=>{
      if(!S.dead){S.state.abstractCache||={};S.state.abstractCache[key]={version:3,value:result,expires:Date.now()+(result.status==='available'?30*86400000:result.status==='offline'?15000:3600000)};for(const stale of Object.keys(S.state.abstractCache).sort((a,b)=>S.state.abstractCache[b].expires-S.state.abstractCache[a].expires).slice(500))delete S.state.abstractCache[stale];S.persist().catch(()=>{});}return result;
    }).finally(()=>{ctx.done=true;for(const abort of ctx.abort)abort();pending.delete(key);});pending.set(key,bounded);return bounded;
  }
  const api={text,placement,apiKey,transport,pubmedRecords,pmcRecords,select,lookup};return api;
})();
if(typeof module!=='undefined')module.exports=CiteLensAbstracts;
