/* Independent adapter for EasyPubMedicine's published JSON tables. No upstream executable code. */
var CiteLensEPMetrics = (() => {
  const C=CiteLensCore;
  const SOURCE=Object.freeze({version:'0.1.24',revision:'90762673f9919f984dfd5d59c0f46ec09aba2226',url:'https://raw.githubusercontent.com/naivenaive/EasyPubMed/90762673f9919f984dfd5d59c0f46ec09aba2226/EasyPubMedicine_0.1.24.zip'});
  const ids=s=>[...new Set(String(s||'').split(/[;,\s]+/).map(C.issn).filter(Boolean))];
  function build(payload) {
    if(payload.schema!==1||!payload.history||Array.isArray(payload.history)||!Array.isArray(payload.aliases)||payload.aliases.length>100000)throw Error('EasyPubMed 数据格式不受支持');
    const entries=Object.entries(payload.history);if(!entries.length||entries.length>50000)throw Error('EasyPubMed 期刊表为空或过大');
    const byISSN=new Map(),byName=new Map(),journals=[],years=new Set();let count=0,skipped=0;
    const add=(map,key,id)=>{if(!key)return;if(!map.has(key))map.set(key,new Set());map.get(key).add(id);};
    for(const [key,value] of entries){
      const meta=value?.meta,issns=ids([meta?.issn,meta?.eissn].join(' ')),journal=C.clean(meta?.journalName||key),rows=[];
      if(!journal||!issns.length||!Array.isArray(value?.dataByYear)||value.dataByYear.length>100){skipped++;continue;}
      for(const row of value.dataByYear){
        const metricYear=Number(row.jcrYear),raw=C.clean(row.jif),bounded=/^<\s*\d+(?:\.\d+)?$/.test(raw),jif=bounded?raw.replace(/\s/g,''):raw&&!/^(?:N\/A|NA|NAN|—|-)$/i.test(raw)?Number(raw):null;
        if(!Number.isInteger(metricYear)||metricYear<1975||metricYear>new Date().getFullYear()||jif!==null&&!bounded&&(!Number.isFinite(jif)||jif<0)){skipped++;continue;}
        const categories=(Array.isArray(row.category)?row.category:[]).map(x=>({name:C.clean(x.category),quartile:/^Q[1-4]$/.test(x.quartile)?x.quartile:null,index:C.clean(x.source)})).filter(x=>x.name);
        const normalized={metricYear,jif,categories};
        if(rows.some(x=>x.metricYear===metricYear))throw Error('EasyPubMed 同一期刊年份重复，已保留原数据');
        rows.push(normalized);years.add(metricYear);count++;
      }
      if(!rows.length){skipped++;continue;}
      rows.sort((a,b)=>b.metricYear-a.metricYear);const id=journals.length;
      journals.push({journal,issns,rows});for(const issn of issns)add(byISSN,issn,id);add(byName,C.norm(journal),id);add(byName,C.norm(key),id);
    }
    for(const alias of payload.aliases){
      const matches=new Set();for(const issn of ids([alias.issn,alias.pubmed_issn,alias.pubmed_eissn].join(' ')))for(const id of byISSN.get(issn)||[])matches.add(id);
      for(const name of [alias.journal,alias.jcr,alias.abb,alias.pubmed_journal])for(const id of matches)add(byName,C.norm(name),id);
    }
    if(!count)throw Error('EasyPubMed 数据没有有效指标');
    return {byISSN,byName,journals,years:[...years].sort((a,b)=>b-a),count,skipped,provenance:payload.provenance||{}};
  }
  function match(record,index){
    const identifiers=ids(record.ISSN),hits=new Set();
    if(identifiers.length){for(const identifier of identifiers)for(const id of index.byISSN.get(identifier)||[])hits.add(id);}
    else for(const id of index.byName.get(C.norm(record.journal))||[])hits.add(id);
    return {hits:[...hits],method:identifiers.length?'ISSN / eISSN':'期刊名 / 已收录缩写'};
  }
  function lookup(record,index,year=null){
    if(['book','bookSection','thesis','preprint'].includes(record.type))return {status:'not-applicable',label:'期刊指标不适用'};
    const missing={status:'missing',label:year?`${year} 年指标未提供`:'离线表未匹配此期刊'};
    if(!index)return missing;
    const {hits,method}=match(record,index);
    if(hits.length>1)return {status:'ambiguous',label:'期刊标识或缩写匹配不唯一，请核对 ISSN'};
    if(!hits.length)return missing;
    const journal=index.journals[hits[0]],row=year?journal.rows.find(x=>x.metricYear===Number(year)):journal.rows[0];
    if(!row)return missing;
    return {status:'available',journal:journal.journal,issns:journal.issns,...row,history:journal.rows,provider:'easypubmed',source:'EasyPubMedicine '+index.provenance.version,importedAt:index.provenance.importedAt||'',match:method,provenance:index.provenance};
  }
  return {SOURCE,build,lookup};
})();
if(typeof module!=='undefined')module.exports=CiteLensEPMetrics;
