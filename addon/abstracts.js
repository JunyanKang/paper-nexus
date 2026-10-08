/* Published abstracts, fetched on demand. Credentials never enter shared state or URLs. */
var CiteLensAbstracts = (() => {
  const C=CiteLensCore,A=CiteLensAuthors,clock=()=>Zotero.getMainWindow(),pending=new Map(),cooldowns=new Map();let nextNCBI=0;
  const text=value=>String(value||'').replace(/<(?:\/?(?:jats:)?(?:p|title|sec|h[1-6])\b)[^>]*>/gi,'\n\n').split(/\n\s*\n/).map(C.plainTitle).filter(Boolean).join('\n\n').slice(0,30000);
  const later=(fn,ms)=>clock().setTimeout(fn,ms),clear=id=>clock().clearTimeout(id);
  function deadline(work,ms){let id;return Promise.race([work,new Promise((_,reject)=>{id=later(()=>reject(Error('timeout')),Math.max(1,ms));})]).finally(()=>clear(id));}
  function placement(anchor,viewport,cardTop=anchor.top,height=360,options={}){
    const sides=options.sides||['left','right','top','bottom'],right=viewport.width-anchor.right-8,left=anchor.left-8;
    const side=sides.includes('right')&&(right>=420||right>=left)?'right':sides.includes('left')?'left':sides[0];
    anchor={left:anchor.left,right:anchor.right,top:anchor.top,bottom:anchor.bottom??anchor.top};
    for(const candidate of [side,...sides.filter(x=>x!==side)]){const p=dragPlacement(anchor,viewport,{width:440,height},{side:candidate,left:candidate==='right'?anchor.right:anchor.left-440,top:cardTop},false,options);if(p.side===candidate)return p;}
    return options.sides?dragPlacement(anchor,viewport,{width:440,height},{left:8,top:cardTop},false,options):{side:'inline'};
  }
  // Keep the fixed source marker and the moving panel marker on the same projection.
  // 12px corner + 8px breathing room + half of the 22px marker.
  function linkPosition(target,panel){
    const clamp=(value,length)=>Math.max(Math.min(31,length/2),Math.min(value,length-Math.min(31,length/2)));
    return {x:clamp((target.left+target.right)/2-panel.left,panel.width),y:clamp((target.top+target.bottom)/2-panel.top,panel.height)};
  }
  // Shared pointer/keyboard geometry. Overlap is resolved by the longest crossed edge.
  function resizePlacement(rect,viewport,edge,dx,dy){
    const minW=Math.min(240,viewport.width-16),minH=Math.min(120,viewport.height-16),clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
    let left=rect.left,right=rect.right,top=rect.top,bottom=rect.bottom;
    if(edge.includes('w'))left=clamp(left+dx,8,right-minW);if(edge.includes('e'))right=clamp(right+dx,left+minW,viewport.width-8);
    if(edge.includes('n'))top=clamp(top+dy,8,bottom-minH);if(edge.includes('s'))bottom=clamp(bottom+dy,top+minH,viewport.height-8);
    return{left,top,width:right-left,height:bottom-top};
  }
  function dragPlacement(anchor,viewport,size,point,snap=true,options={}){
    const edge=8,gap=0,width=Math.min(size.width,Math.max(1,viewport.width-2*edge)),maxHeight=Math.max(40,Math.min(size.userSized?viewport.height:400,viewport.height-2*edge)),height=Math.min(size.height,maxHeight);
    const clamp=(v,min,max)=>Math.max(min,Math.min(v,Math.max(min,max)));
    const result={side:'free',width,maxHeight,left:clamp(point.left,edge,viewport.width-width-edge),top:clamp(point.top,edge,viewport.height-height-edge)};
    const right=result.left+width,bottom=result.top+height,overlapX=Math.max(0,Math.min(right,anchor.right)-Math.max(result.left,anchor.left)),overlapY=Math.max(0,Math.min(bottom,anchor.bottom)-Math.max(result.top,anchor.top));
    const target=options.target||anchor,sides=options.sides||['left','right','top','bottom'];
    const t={left:clamp(target.left,edge,viewport.width-edge),right:clamp(target.right,edge,viewport.width-edge),top:clamp(target.top,edge,viewport.height-edge),bottom:clamp(target.bottom??target.top,edge,viewport.height-edge)};
    const cover=(value,start,end,length,limit)=>{const center=(start+end)/2;start=Math.max(edge,Math.min(start,center-31));end=Math.min(limit-edge,Math.max(end,center+31));return clamp(value,Math.max(edge,end-length),Math.min(start,limit-length-edge));};
    const docks=[];
    for(const side of sides){
      const horizontal=side==='left'||side==='right',space=side==='left'?anchor.left-edge-gap:side==='right'?viewport.width-anchor.right-edge-gap:side==='top'?anchor.top-edge-gap:viewport.height-anchor.bottom-edge-gap;
      if(space<(horizontal?Math.min(220,width):Math.min(90,height)))continue;
      const minHeight=horizontal?Math.max(t.bottom-t.top,Math.min(viewport.height-16,62)):0;
      const w=horizontal?Math.min(width,space):Math.max(width,t.right-t.left),m=horizontal?Math.max(maxHeight,minHeight):Math.min(maxHeight,space),h=Math.max(Math.min(size.height,m),minHeight);
      const left=side==='left'?anchor.left-w-gap:side==='right'?anchor.right+gap:cover(result.left,t.left,t.right,w,viewport.width);
      const top=side==='top'?anchor.top-h-gap:side==='bottom'?anchor.bottom+gap:cover(result.top,t.top,t.bottom,h,viewport.height);
      const distance=side==='left'?Math.abs(right-anchor.left):side==='right'?Math.abs(result.left-anchor.right):side==='top'?Math.abs(bottom-anchor.top):Math.abs(result.top-anchor.bottom);
      const crossed=side==='left'?result.left<=anchor.left&&right>=anchor.left:side==='right'?result.left<=anchor.right&&right>=anchor.right:side==='top'?result.top<=anchor.top&&bottom>=anchor.top:result.top<=anchor.bottom&&bottom>=anchor.bottom;
      docks.push({side,width:w,maxHeight:m,minHeight,left,top,distance,score:horizontal?overlapY:overlapX,crossed});
    }
    const clean=p=>({side:p.side,width:p.width,maxHeight:p.maxHeight,minHeight:p.minHeight,left:p.left,top:p.top});
    if(point.side&&point.side!=='free'){const dock=docks.find(d=>d.side===point.side);if(dock)return clean(dock);}
    if(!snap)return result;
    if(overlapX>0&&overlapY>0){
      const crossed=docks.filter(d=>d.crossed),candidates=crossed.length?crossed:docks;
      candidates.sort((a,b)=>b.score-a.score||a.distance-b.distance);
      return candidates.length?clean(candidates[0]):(options.sides?result:{side:'inline'});
    }
    const near=docks.filter(d=>d.distance<=28&&d.score>16).sort((a,b)=>a.distance-b.distance);
    return near.length?clean(near[0]):result;
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
      xhr.onload=()=>{done();if(xhr.status>=200&&xhr.status<300)resolve(xhr.responseText);else reject(Object.assign(Error(xhr.status===429?'busy':'network'),{status:xhr.status}));};
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
  function pmcAbstract(meta){
    const nodes=[...meta.querySelectorAll(':scope > abstract')],standard=nodes.find(n=>!n.getAttribute('abstract-type'))||nodes.find(n=>/^(abstract|summary)$/i.test(n.getAttribute('abstract-type')||''));
    return text(standard?.innerHTML);
  }
  function pmcRecords(value){return [...xml(value).querySelectorAll('article')].map(n=>{const a=n.querySelector(':scope > front > article-meta');if(!a)return null;const id=type=>content(a,'article-id[pub-id-type="'+type+'"]');return {title:content(a,'title-group > article-title'),DOI:C.doi(id('doi')),PMCID:A.ids({PMCID:(id('pmc')||id('pmcid')).replace(/^(\d)/,'PMC$1')}).PMCID,PMID:id('pmid'),year:content(a,'pub-date > year'),journal:content(n,'front > journal-meta > journal-title-group > journal-title'),creators:[...a.querySelectorAll('contrib-group > contrib[contrib-type="author"]')].map(x=>({firstName:content(x,'name > given-names'),lastName:content(x,'name > surname')||content(x,'collab'),creatorType:'author'})),abstract:pmcAbstract(a),keywords:[...a.querySelectorAll('kwd-group > kwd')].map(x=>C.clean(x.textContent)),publicationTypes:[]};}).filter(Boolean);}
  // Read outgoing bibliography entries, never the list of papers citing this article.
  function referenceRecords(value,input,kind='pubmed'){
    const doc=xml(value),records=kind==='pmc'?pmcRecords(value):pubmedRecords(value),parent=select(input,records);
    if(!parent)return {refs:[],parent:null};
    const root=kind==='pmc'?[...doc.querySelectorAll('article')].find(n=>content(n,'front > article-meta > article-id[pub-id-type="pmid"]')===parent.PMID&&content(n,'front > article-meta > title-group > article-title')===parent.title):[...doc.querySelectorAll('PubmedArticle')].find(n=>content(n,'MedlineCitation > PMID')===parent.PMID);
    const refs=[...(root?.querySelectorAll(kind==='pmc'?':scope > back ref-list > ref':'PubmedData > ReferenceList Reference')||[])].map(n=>{
      if(kind==='pubmed'){
        const raw=content(n,'Citation'),ids=A.ids({PMID:content(n,'ArticleId[IdType="pubmed"]'),DOI:content(n,'ArticleId[IdType="doi"]')});
        return {...C.parse(raw),...ids,raw,source:'PubMed',metadataVerified:false};
      }
      const citation=n.querySelector('element-citation, mixed-citation, nlm-citation')||n,raw=C.clean(citation.textContent),id=t=>content(citation,'pub-id[pub-id-type="'+t+'"]');
      const names=citation.querySelectorAll('person-group[person-group-type="author"] name, person-group[person-group-type="author"] string-name, :scope > name, :scope > string-name');
      return {title:content(citation,'article-title'),year:content(citation,'year'),journal:content(citation,'source'),volume:content(citation,'volume'),pages:[content(citation,'fpage'),content(citation,'lpage')].filter(Boolean).join('–'),...A.ids({PMID:id('pmid'),DOI:id('doi')}),creators:[...names].map(a=>({firstName:content(a,'given-names'),lastName:content(a,'surname'),creatorType:'author'})).filter(a=>a.lastName),raw,source:'PMC',metadataVerified:false};
    });return {refs,parent};
  }
  async function referenceList(input,{budget=60000,limit=200,signal}={}){
    const ctx={until:Date.now()+budget,requestTimeout:12000,retryNetwork:true,abort:new Set(),done:false,stopped(){return this.done||signal?.aborted||Date.now()>=this.until;}},cancel=()=>{ctx.done=true;for(const abort of ctx.abort)abort();};
    if(signal?.aborted)throw Error('cancelled');signal?.addEventListener('abort',cancel,{once:true});
    try{
      const ids=A.ids(input);let pmid=ids.PMID,pmcid=ids.PMCID,result={refs:[],parent:null},source='PubMed';
      if(!pmid&&!pmcid){const title=C.plainTitle(input.title).replace(/["\[\]]/g,' '),term=ids.DOI?ids.DOI+'[AID]':title.length>=24?'"'+title+'"[Title]':'';if(!term)return {...result,source};
        const data=JSON.parse(await ncbi(ctx,'esearch',{db:'pubmed',term,retmode:'json',retmax:5}));if(data.error)throw Error('NCBI unavailable');pmid=(data.esearchresult?.idlist||[]).filter(x=>/^\d+$/.test(x)).slice(0,5).join(',');}
      if(pmid){result=referenceRecords(await ncbi(ctx,'efetch',{db:'pubmed',id:pmid,retmode:'xml'}),input);pmcid=result.parent?.PMCID||pmcid;}
      if(!result.refs.length&&pmcid){result=referenceRecords(await ncbi(ctx,'efetch',{db:'pmc',id:pmcid.replace('PMC',''),retmode:'xml'}),input,'pmc');source='PMC';}
      const cap=Math.max(1,Math.min(200,Number(limit)||200)),refs=result.refs.slice(0,cap),pmids=[...new Set(refs.map(r=>r.PMID).filter(Boolean))],hydrated=new Map();
      // Batch metadata for cited PMIDs; a bibliography entry alone is not a complete author record.
      for(let i=0;i<pmids.length;i+=25){
        const batch=pmids.slice(i,i+25),rows=pubmedRecords(await ncbi(ctx,'efetch',{db:'pubmed',id:batch.join(','),retmode:'xml'}));
        for(const r of rows)if(batch.includes(r.PMID))hydrated.set(r.PMID,r);
      }
      return {source,parent:result.parent,limited:result.refs.length>cap,refs:refs.map(r=>{const full=hydrated.get(r.PMID);return full&&(!r.DOI||r.DOI===full.DOI)?{...r,...full,source:'PubMed',metadataVerified:true}:r;})};
    }finally{cancel();signal?.removeEventListener('abort',cancel);}
  }
  function select(input,records){
    const identifiable=Object.values(A.ids(input)).some(Boolean),eligible=records.filter(r=>r&&C.compatibility(input,r).eligible&&(!identifiable||A.matches(input,r)));
    if(identifiable)return eligible.length===1?eligible[0]:null;
    const result=C.decide(input,eligible);if(result.status==='matched')return result.ranked[0].record;
    // A complete, distinctive title can identify an abstract even with no author/year.
    // Keep word order; similar titles and separate editions remain ambiguous.
    const title=C.norm(input.title),words=title.split(' ').filter(Boolean),informative=words.filter(w=>w.length>2&&!/^(the|and|for|with|from|are|was|were|has|have|into|that|this|their|using|study|review|analysis|research|data)$/.test(w));
    if(title.length<24||words.length<4||new Set(informative).size<3)return null;
    const exact=eligible.filter(r=>C.norm(r.title)===title),identities=new Set(exact.map(r=>A.key(r)));
    if(!exact.length||identities.size!==1||eligible.some(r=>C.norm(r.title)!==title&&C.similarity(input.title,r.title)>=.88))return null;
    return exact[0];
  }
  function invertedAbstract(index){
    if(!index||typeof index!=='object'||Array.isArray(index))return '';
    const words=[];let count=0;
    for(const [word,positions] of Object.entries(index)){
      if(!Array.isArray(positions)||++count>10000)return '';
      for(const pos of positions){if(!Number.isInteger(pos)||pos<0||pos>=10000||words[pos]!==undefined&&words[pos]!==word)return '';words[pos]=word;}
    }
    // Missing or conflicting positions are not a complete published abstract.
    if(!words.length||Array.from(words).some(w=>w===undefined))return '';
    return text(words.join(' '));
  }
  async function openalex(ctx,input){
    const doi=C.recordDOI(input),title=C.plainTitle(input.title);if(!doi&&title.length<24)return null;
    const url='https://api.openalex.org/works'+(doi?'/https://doi.org/'+encodeURIComponent(doi):'?search='+encodeURIComponent(title)+'&per-page=5');
    const data=JSON.parse(await request(ctx,url)),rows=doi?[data]:data.results||[];
    const records=rows.map(r=>({title:r.display_name||r.title,DOI:C.doi(r.doi),year:String(r.publication_year||''),creators:(r.authorships||[]).map(a=>{const name=C.clean(a.author?.display_name),parts=name.split(/\s+/);return {firstName:parts.slice(0,-1).join(' '),lastName:parts.at(-1)||'',creatorType:'author'};}),abstract:invertedAbstract(r.abstract_inverted_index),url:r.id}));
    const r=select(input,records);return r?.abstract?found(r,'OpenAlex',r.url):null;
  }
  async function semanticScholar(ctx,input){
    const ids=A.ids(input),title=C.plainTitle(input.title),identifier=ids.DOI?'DOI:'+ids.DOI:ids.PMID?'PMID:'+ids.PMID:'';
    if(!identifier&&title.length<24)return null;
    const fields='title,abstract,year,externalIds,authors,url',url='https://api.semanticscholar.org/graph/v1/paper/'+(identifier?encodeURIComponent(identifier)+'?fields='+fields:'search?query='+encodeURIComponent(title)+'&limit=5&fields='+fields);
    const data=JSON.parse(await request(ctx,url)),records=(identifier?[data]:data.data||[]).map(r=>({title:r.title,abstract:r.abstract,year:String(r.year||''),...A.ids({DOI:r.externalIds?.DOI,PMID:r.externalIds?.PubMed,PMCID:r.externalIds?.PubMedCentral}),creators:(r.authors||[]).map(a=>{const parts=C.clean(a.name).split(/\s+/);return {firstName:parts.slice(0,-1).join(' '),lastName:parts.at(-1)||'',creatorType:'author'};}),url:r.url}));
    const r=select(input,records);return r?.abstract?found(r,'Semantic Scholar',r.url):null;
  }
  async function request(ctx,url,body){
    if(ctx.stopped())throw Error('cancelled');const provider=url.match(/^https:\/\/([^/]+)/)?.[1]||url;
    if((cooldowns.get(provider)||0)>Date.now())throw Error('busy');
    try{return await deadline(api.transport(url,{body,timeout:Math.min(ctx.requestTimeout||7000,Math.max(1,ctx.until-Date.now())),signal:ctx.abort}),ctx.until-Date.now());}
    catch(e){if(e.message==='busy')cooldowns.set(provider,Date.now()+60000);throw e;}
  }
  async function ncbi(ctx,method,params){
    const key=apiKey(),wait=Math.max(0,nextNCBI-Date.now());nextNCBI=Date.now()+wait+(key?120:380);
    if(wait)await deadline(new Promise(resolve=>later(resolve,wait)),ctx.until-Date.now());if(ctx.stopped())throw Error('cancelled');
    const body=Object.entries({...params,tool:'PaperNexus',...(key?{api_key:key}:{})}).map(([k,v])=>encodeURIComponent(k)+'='+encodeURIComponent(v)).join('&');
    const url='https://eutils.ncbi.nlm.nih.gov/entrez/eutils/'+method+'.fcgi';
    try{return await request(ctx,url,body);}catch(e){
      if(!ctx.retryNetwork||ctx.stopped()||!['network','timeout'].includes(e.message)||e.status&&e.status<500||ctx.until-Date.now()<13000)throw e;
      // One bounded retry for a gateway/connection failure; never retry a rejected key or rate limit.
      await deadline(new Promise(resolve=>later(resolve,600)),ctx.until-Date.now());return request(ctx,url,body);
    }
  }
  async function testConnection({budget=8000}={}){
    const ctx={until:Date.now()+budget,abort:new Set(),done:false,stopped(){return this.done||Date.now()>=this.until;}};
    try{const response=JSON.parse(await ncbi(ctx,'einfo',{db:'pubmed',retmode:'json'}));
      if(response.error)throw Error('rejected');
      const info=response.einforesult?.dbinfo,db=Array.isArray(info)?info[0]:info;
      if(db?.dbname!=='pubmed')throw Error('invalid');return {ok:true};
    }catch(e){throw Error(e.message==='rejected'?'NCBI 拒绝请求，请检查 API key':e.message==='invalid'?'NCBI 返回异常，请稍后重试':'连接失败，请检查网络或 API key 后重试');}
    finally{ctx.done=true;for(const abort of ctx.abort)abort();}
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
  async function crossref(ctx,input){const doi=C.doi(input.DOI);if(!doi&&C.plainTitle(input.title).length<12)return null;const url=doi?'https://api.crossref.org/works/'+encodeURIComponent(doi):'https://api.crossref.org/works?rows=3&query.bibliographic='+encodeURIComponent((input.raw||C.citation(input)).slice(0,1200));const data=JSON.parse(await request(ctx,url)).message,r=select(input,doi?[C.fromCrossref(data)]:(data?.items||[]).map(C.fromCrossref));if(r?.abstract)return found(r,'Crossref','https://doi.org/'+C.doi(r.DOI));return null;}
  // One stored abstract, multiple verified bibliographic entry points. The derived
  // index is rebuilt lazily after writes, and is never persisted as duplicate text.
  // Crossref abstracts parsed before version 1 may have lost comparison text.
  // Re-fetch only that provider's old copies; other providers and user notes remain usable.
  const current=result=>result?.source!=='Crossref'||result.record?.abstractParserVersion===1;
  const cacheIndexes=new WeakMap(),metadataIndexes=new WeakMap();
  function identityKeys(r){const ids=A.ids(r),keys=Object.entries(ids).filter(([,v])=>v).map(([k,v])=>k.toLowerCase()+':'+v);const title=C.norm(r.title);if(title)keys.push('title:'+title);return keys;}
  function cached(S,input){
    const cache=S.state.abstractCache||{};const direct=cache[A.key(input)],valid=e=>e&&[3,4].includes(e.version)&&e.expires>Date.now()&&e.value?.status==='available'&&current(e.value)&&select(input,[e.value.record]);
    if(valid(direct))return direct.value;
    // Reading metadata already carries many abstracts. Reuse that same verified
    // record before asking any provider again, including from the network panel.
    const metadataCache=S.state.cache;
    if(metadataCache){
      let indexed=metadataIndexes.get(metadataCache);
      if(!indexed||indexed.generation!==(S.cacheGeneration||0)){
        const keys=new Map();for(const entry of Object.values(metadataCache))if(entry.value?.status==='matched'){
          const record=entry.value.ranked?.[0]?.record;if(!record||!text(record.abstract))continue;
          for(const key of identityKeys(record)){if(!keys.has(key))keys.set(key,new Set());keys.get(key).add(entry);}
        }
        indexed={generation:S.cacheGeneration||0,keys};metadataIndexes.set(metadataCache,indexed);
      }
      const entries=new Set();for(const key of identityKeys(input))for(const entry of indexed.keys.get(key)||[])if(entry.time>Date.now()-7*86400000)entries.add(entry);
      const record=select(input,[...entries].map(entry=>entry.value.ranked[0].record));
      if(record&&current({source:record.source,record}))return found(record,record.source||'文献记录',C.recordDOI(record)?'https://doi.org/'+C.recordDOI(record):'');
    }
    let index=cacheIndexes.get(cache);if(!index){index=new Map();for(const entry of Object.values(cache)){if(entry?.value?.status!=='available'||![3,4].includes(entry.version))continue;for(const key of identityKeys(entry.value.record||{})){if(!index.has(key))index.set(key,new Set());index.get(key).add(entry);}}cacheIndexes.set(cache,index);}
    const candidates=new Set();for(const key of identityKeys(input))for(const e of index.get(key)||[])if(valid(e))candidates.add(e);
    const rows=[...new Map([...candidates].sort((a,b)=>b.expires-a.expires).map(e=>[A.key(e.value.record),e])).values()];if(rows.length){const record=select(input,rows.map(e=>e.value.record));if(record)return rows.find(e=>e.value.record===record)?.value||null;}
    if(direct?.version===4&&direct.strategy===(typeof CiteLensNetwork!=='undefined'?CiteLensNetwork.revisions.abstracts:'abstracts-5')&&direct.expires>Date.now()&&direct.value?.status!=='available')return direct.value;return null;
  }
  async function lookup(S,input,{force=false,budget=12000}={}){
    if(S.dead)return {status:'offline'};
    if(text(input.abstract)&&current({source:input.source,record:input}))return found(input,input.source||'文献记录',C.doi(input.DOI)?'https://doi.org/'+C.doi(input.DOI):'');
    const key=A.key(input),hit=!force&&cached(S,input);if(hit)return hit;
    const flightKey=JSON.stringify([key,C.norm(input.title),input.year||'',input.creators||[],input.author||'']);
    if(pending.has(flightKey))return pending.get(flightKey);
    const ctx={until:Date.now()+budget,abort:new Set(),done:false,stopped(){return this.done||S.dead||Date.now()>=this.until;}};
    const work=(async()=>{let transient=false,answered=0;
      // Local lookup has a short budget; it must not block a slow or busy library indefinitely.
      try{const local=await deadline(S.locate(input),Math.min(700,budget)),values=[...new Set(local.map(x=>text(x.item.getField('abstractNote'))).filter(Boolean))];if(values.length===1)return found({...input,abstract:values[0]},'本地文献库','');}catch(_){}
      const stage=async(fns,ms)=>{
        const child={until:Math.min(ctx.until,Date.now()+ms),abort:new Set(),done:false,stopped(){return this.done||ctx.stopped()||Date.now()>=this.until;}},cancel=()=>{child.done=true;for(const abort of child.abort)abort();};ctx.abort.add(cancel);
        const attempt=fn=>fn(child,input).then(value=>{if(value?.text)return value;answered++;throw Error('missing');}).catch(e=>{if(e.message!=='missing')transient=true;throw e;});
        try{return await deadline(Promise.any(fns.map(attempt)),child.until-Date.now());}finally{cancel();ctx.abort.delete(cancel);}
      };
      // Two independent providers race; author/metadata background queues cannot hold up the preview.
      try{return await stage([pubmed,europe],Math.max(1,budget*.4));}catch(_){}
      if(!ctx.stopped())try{return await stage([crossref,openalex],Math.max(1,budget*.4));}catch(_){ }
      if(!ctx.stopped())try{return await stage([semanticScholar],ctx.until-Date.now());}catch(_){}
      return {status:answered?'missing':'offline'};
    })();
    const bounded=deadline(work,budget).catch(()=>({status:'offline'})).then(result=>{
      if(!S.dead){S.state.abstractCache||={};cacheIndexes.delete(S.state.abstractCache);S.state.abstractCache[key]={version:4,strategy:typeof CiteLensNetwork!=='undefined'?CiteLensNetwork.revisions.abstracts:'abstracts-5',value:result,expires:Date.now()+(result.status==='available'?30*86400000:result.status==='offline'?15000:3600000)};for(const stale of Object.keys(S.state.abstractCache).sort((a,b)=>S.state.abstractCache[b].expires-S.state.abstractCache[a].expires).slice(500))delete S.state.abstractCache[stale];S.persist().catch(()=>{});}return result;
    }).finally(()=>{ctx.done=true;for(const abort of ctx.abort)abort();pending.delete(flightKey);});pending.set(flightKey,bounded);return bounded;
  }
  const api={current,text,placement,dragPlacement,resizePlacement,linkPosition,apiKey,testConnection,transport,invertedAbstract,pubmedRecords,pmcRecords,referenceRecords,referenceList,select,cached,lookup};return api;
})();
if(typeof module!=='undefined')module.exports=CiteLensAbstracts;
