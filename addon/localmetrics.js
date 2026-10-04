/* Read-only compatibility with locally stored journal metrics. Never reads provider secrets. */
var CiteLensLocalMetrics=(()=>{
  const C=CiteLensCore;
  function number(value){const s=C.clean(value);if(/^<\s*\d+(?:\.\d+)?$/.test(s))return s.replace(/\s/g,'');return /^\d+(?:\.\d+)?$/.test(s)?Number(s):null;}
  function year(value){const s=C.clean(value);return /^(?:19|20)\d{2}$/.test(s)&&Number(s)<=new Date().getFullYear()?Number(s):null;}
  function quartiles(value,name){return [...new Set((C.clean(value).toUpperCase().match(/\bQ[1-4]\b/g)||[]))].map(quartile=>({name,quartile}));}
  function fromExtra(extra,meta={}){
    const fields=new Map();for(const line of String(extra||'').split(/\r?\n/)){const m=line.match(/^\s*([^:：]+)[:：]\s*(.*?)\s*$/);if(m){const key=C.clean(m[1]);if(!fields.has(key))fields.set(key,[]);fields.get(key).push(m[2]);}}
    const get=key=>fields.get(key)?.[0];
    const jif=number(get('影响因子')),jif5=number(get('5年影响因子')),categories=[...quartiles(get('JCR分区'),'JCR（学科未提供）'),...quartiles(get('SSCI')||get('SSCI分区'),'SSCI（学科未提供）')];
    if(jif===null&&!categories.length)return null;
    const years=['指标年份','JCR年份','JIF年份','JCR Year','JIF Year'].map(k=>year(get(k))).filter(Boolean),distinct=[...new Set(years)];
    const conflict=distinct.length>1||['影响因子','JCR分区','SSCI','SSCI分区'].some(k=>new Set(fields.get(k)||[]).size>1);
    return {status:conflict?'ambiguous':'available',label:conflict?'本地条目指标或年份存在冲突':'',jif,jif5,jci:number(get('JCI')),categories,metricYear:distinct[0]||null,provider:'greenfrog',source:'Green Frog 兼容字段 · Zotero Extra',sourceNote:'读取本地条目的兼容字段；Extra 未记录写入者及完整学科，不能证明一定由该插件写入。',cas:C.clean(get('中科院分区升级版')),...meta};
  }
  function fromStyle(value,meta={}){
    if(!value||typeof value!=='object'||Array.isArray(value))return null;
    const jif=number(value.sciif),categories=[...quartiles(value.sci,'SCI（学科未提供）'),...quartiles(value.ssci,'SSCI（学科未提供）')];
    if(jif===null&&!categories.length)return null;
    return {status:'available',jif,jif5:number(value.sciif5),jci:number(value.jci),categories,metricYear:year(value.metricYear||value.jcrYear),provider:'style',source:'Ethereal Style · 本地期刊标签缓存',sourceNote:'缓存没有完整学科或指标年份时明确保留缺失状态；缓存文件时间不是指标年份。',cas:C.clean(value.sciUp),...meta};
  }
  const signature=m=>JSON.stringify([m.metricYear,m.jif,m.jci??null,m.categories.map(c=>[c.name,c.quartile]).sort()]);
  function choose(candidates,selectedYear=null){
    const usable=candidates.filter(m=>m&&(!selectedYear||m.metricYear===Number(selectedYear)));
    if(!usable.length)return null;
    const distinct=[...new Map(usable.map(m=>[signature(m),m])).values()];
    if(usable.some(m=>m.status==='ambiguous')||distinct.length>1)return {status:'ambiguous',label:'本地指标来源有冲突，请在详情核对',source:usable[0].source,alternatives:distinct};
    return distinct[0];
  }
  function styleEntries(cache,journal){
    if(!journal||!cache||typeof cache!=='object')return [];
    // Exact stored name only; no fuzzy title or undocumented alias merging.
    return Object.entries(cache).filter(([name,v])=>C.norm(name)===C.norm(journal)&&v?.rank&&(!v.rankQuery||validQuery(v.rankQuery,journal))).map(([name,v])=>fromStyle(v.rank,{journal:name,match:'缓存刊名精确匹配'})).filter(Boolean);
  }
  function validQuery(value,journal){try{const query=JSON.parse(value);return Array.isArray(query)&&query[0]==='easyscholar'&&query.slice(1).some(x=>C.norm(x)===C.norm(journal));}catch(_){return false;}}
  return {number,year,fromExtra,fromStyle,signature,choose,styleEntries};
})();
if(typeof module!=='undefined')module.exports=CiteLensLocalMetrics;
