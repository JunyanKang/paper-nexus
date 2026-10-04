/* Ordered article authors. No first/corresponding-author role inference. */
var CiteLensAuthors = (() => {
  const C=CiteLensCore,clean=C.clean;
  const name=a=>clean([a.firstName,a.lastName].filter(Boolean).join(' '));
  const pmid=s=>/^\d{1,12}$/.test(String(s||''))?String(s):'';
  const pmcid=s=>/^PMC\d{1,12}$/i.test(String(s||''))?String(s).toUpperCase():'';
  const ids=r=>({DOI:C.doi(r.DOI),PMID:pmid(r.PMID),PMCID:pmcid(r.PMCID)});
  const key=r=>{const i=ids(r);return i.DOI?'doi:'+i.DOI:i.PMID?'pmid:'+i.PMID:i.PMCID?'pmcid:'+i.PMCID:C.identity(r);};
  const eligible=r=>!['book','bookSection','thesis'].includes(r.type);
  function matches(expected,actual) {
    const a=ids(expected),b=ids(actual),shared=['DOI','PMID','PMCID'].filter(k=>a[k]&&b[k]);
    return !!shared.length&&shared.every(k=>a[k]===b[k]);
  }
  function selectPMC(input,data) {
    const hits=(data?.resultList?.result||[]).filter(r=>matches(input,{DOI:r.doi,PMID:r.pmid||(r.source==='MED'?r.id:''),PMCID:r.pmcid}));
    if(hits.length>1&&new Set(hits.map(x=>pmcid(x.pmcid)||x.source+':'+x.id)).size!==1)return null;
    const r=hits[0];if(!r||!C.compatibility(input,{title:r.title,year:r.pubYear,DOI:r.doi,creators:fromPMC(r)}).eligible)return null;return r;
  }
  function fromPMC(r) {
    return (r.authorList?.author||[]).map(a=>({firstName:clean(a.firstName),lastName:clean(a.lastName||(!a.firstName&&a.fullName)||a.collectiveName),creatorType:'author'}));
  }
  function visible(authors) {
    const indices=authors.length>6?[0,1,2,authors.length-3,authors.length-2,authors.length-1]:authors.map((_,i)=>i);
    return indices.map((index,i)=>({author:authors[index],index,gapAfter:authors.length>6&&i===2,omitted:authors.length-6}));
  }
  function shortName(a) {
    // Six compact slots; full spelling is available on hover and in details.
    const initials=clean(a.firstName).split(/[\s.\-]+/u).filter(Boolean).map(s=>s.match(/^\p{L}/u)?.[0]||'').filter(Boolean).map(s=>s+'.').join('');
    return clean([initials,a.lastName].filter(Boolean).join(' '))||'姓名未提供';
  }
  function cached(S,r) {
    const entry=S.state.authorCache?.[key(r)];return entry&&entry.value?.listVersion===1&&Date.now()<entry.expires?entry.value:null;
  }
  async function request(S,url) {
    if(!url.startsWith('https://www.ebi.ac.uk/europepmc/webservices/rest/search?'))throw Error('不支持的作者数据源');
    if(S.active>=2)await new Promise(resolve=>S.waiting.push(resolve));
    if(S.dead||S.state.settings.autoAuthors===false)throw Error('作者查询已关闭');S.active++;
    try{return (await Zotero.HTTP.request('GET',url,{responseType:'json',timeout:12000,headers:{Accept:'application/json'}})).response;}
    finally{S.active--;S.waiting.shift()?.();}
  }
  async function lookup(S,input,{force=false}={}) {
    if(!eligible(input))return {status:'not-applicable'};
    if(S.dead||S.state.settings.autoAuthors===false)return {status:'disabled'};
    const k=key(input),hit=!force&&cached(S,input);if(hit)return hit;
    S.authorFlight||=new Map();if(S.authorFlight.has(k))return S.authorFlight.get(k);
    const generation=S.authorGeneration||0,stopped=()=>S.dead||S.state.settings.autoAuthors===false||generation!==(S.authorGeneration||0);
    const work=(async()=>{
      let record={...input},ordered=[],source='',url='',transient=false;
      const result={listVersion:1,status:'missing',authors:[],checkedAt:new Date().toISOString(),inputKey:k};
      try{
        if(!Object.values(ids(record)).some(Boolean)){
          if(!record.title||record.title.length<12)return {...result,status:'review'};
          const resolved=await S.lookup(record);if(stopped())return {...result,status:'disabled'};
          if(resolved.status!=='matched')return {...result,status:'review'};
          record={...record,...resolved.ranked[0].record};ordered=record.creators||[];source='Crossref';url='https://doi.org/'+C.doi(record.DOI);
        }
        const i=ids(record),query=i.DOI?'DOI:"'+i.DOI+'"':i.PMID?'EXT_ID:'+i.PMID+' AND SRC:MED':'PMCID:'+i.PMCID;
        let article=null;
        try{article=selectPMC(record,await request(S,'https://www.ebi.ac.uk/europepmc/webservices/rest/search?query='+encodeURIComponent(query)+'&format=json&resultType=core&pageSize=5'));}catch(_){transient=true;}
        if(stopped())return {...result,status:'disabled'};
        if(article){
          record={...record,DOI:article.doi||i.DOI,PMID:article.pmid||(article.source==='MED'?article.id:'')||i.PMID,PMCID:article.pmcid||i.PMCID};
          const authors=fromPMC(article);if(authors.some(a=>name(a))){ordered=authors;source='Europe PMC';url=pmcid(record.PMCID)?'https://pmc.ncbi.nlm.nih.gov/articles/'+pmcid(record.PMCID)+'/':'https://europepmc.org/article/MED/'+pmid(record.PMID);}
        }
        if(!ordered.length&&C.doi(record.DOI))try{
          const resolved=await S.lookup(record);
          if(resolved.status==='matched'){ordered=resolved.ranked[0].record.creators||[];source='Crossref';url='https://doi.org/'+C.doi(record.DOI);}
        }catch(_){transient=true;}
        Object.assign(result,ids(record),{authors:ordered,source,url});result.status=ordered.length?'available':transient?'offline':'missing';
      }catch(_){result.status='offline';}
      return result;
    })();
    S.authorFlight.set(k,work);
    try{
      let result=await work;const prior=S.state.authorCache?.[k]?.value;
      if(result.status==='offline'&&prior?.listVersion===1&&prior?.authors?.length)result={...prior,status:'offline',lastAttemptAt:result.checkedAt};
      if(!stopped()){
        S.state.authorCache||={};const entry={expires:Date.now()+(result.status==='offline'?5*60000:result.status==='available'?30*86400000:86400000),value:result};S.state.authorCache[k]=entry;
        if(result.DOI)S.state.authorCache['doi:'+result.DOI]=entry;
        for(const stale of Object.keys(S.state.authorCache).sort((a,b)=>S.state.authorCache[b].expires-S.state.authorCache[a].expires).slice(500))delete S.state.authorCache[stale];
        await S.persist();
      }
      return result;
    }finally{S.authorFlight.delete(k);}
  }
  return {name,ids,key,eligible,matches,selectPMC,fromPMC,shortName,visible,cached,lookup};
})();
if(typeof module!=='undefined')module.exports=CiteLensAuthors;
