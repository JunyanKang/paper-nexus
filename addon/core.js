/* Pure citation and metric rules. No network, UI, or library writes. */
var CiteLensCore = (() => {
  const clean = s => String(s ?? '').replace(/\\u([0-9a-f]{4})/gi, (_,h)=>String.fromCharCode(parseInt(h,16))).replace(/[\u00ad\u200b]/g,'').replace(/ﬁ/g,'fi').replace(/ﬂ/g,'fl').replace(/\s+/g,' ').trim();
  const titleEntities={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ',thinsp:' ',ensp:' ',emsp:' ',ndash:'–',mdash:'—',minus:'−',times:'×',plusmn:'±',middot:'·',micro:'µ',deg:'°',prime:'′',Prime:'″',rsquo:'’',lsquo:'‘',rdquo:'”',ldquo:'“',hellip:'…',le:'≤',ge:'≥',ne:'≠',infin:'∞',alpha:'α',beta:'β',gamma:'γ',delta:'δ',epsilon:'ε',zeta:'ζ',eta:'η',theta:'θ',iota:'ι',kappa:'κ',lambda:'λ',mu:'μ',nu:'ν',xi:'ξ',omicron:'ο',pi:'π',rho:'ρ',sigma:'σ',tau:'τ',upsilon:'υ',phi:'φ',chi:'χ',psi:'ψ',omega:'ω',Alpha:'Α',Beta:'Β',Gamma:'Γ',Delta:'Δ',Theta:'Θ',Lambda:'Λ',Pi:'Π',Sigma:'Σ',Phi:'Φ',Psi:'Ψ',Omega:'Ω',aacute:'á',eacute:'é',ouml:'ö',uuml:'ü',auml:'ä',szlig:'ß'};
  // Parse metadata as text tokens, never as HTML. Only these inline styles may reach the UI.
  function titleParts(value) {
    let text=String(value??'');
    for(let n=0;n<2;n++)text=text.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]+);/gi,(match,key)=>{if(key[0]!=='#')return titleEntities[key]??match;const number=key[1]?.toLowerCase()==='x'?parseInt(key.slice(2),16):Number(key.slice(1));return number>0&&number<=0x10ffff&&!(number>=0xd800&&number<=0xdfff)?String.fromCodePoint(number):'�';});
    text=text.replace(/<(?:script|style)\b[^>]*>[\s\S]*?<\/(?:script|style)\s*>/gi,'');
    const styles={i:'i',italic:'i',em:'i',b:'b',bold:'b',strong:'b',sub:'sub',sup:'sup'},stack=[],parts=[];
    for(const part of text.split(/(<\/?[a-z][\w:-]*(?:\s+[^<>]*?)?\s*\/?>)/gi)){
      const tag=part.match(/^<(\/?)([a-z][\w:-]*)(?:\s+[^<>]*?)?\s*\/?>$/i);
      if(tag){const name=tag[2].toLowerCase().replace(/^(?:jats|mml):/,''),style=styles[name];if(style){if(tag[1]){const i=stack.lastIndexOf(style);if(i>=0)stack.splice(i);}else if(stack.length<8&&!part.endsWith('/>'))stack.push(style);}else if(['br','p','title','div','section','sec','li','h1','h2','h3','h4','h5','h6'].includes(name))parts.push({text:' ',styles:[]});continue;}
      if(part)parts.push({text:part,styles:[...stack]});
    }
    return parts;
  }
  const plainTitle = value => clean(titleParts(value).map(p=>p.text).join(''));
  const norm = s => plainTitle(s).normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
  function doi(s) {
    let text=clean(s).replace(/10\.\s+(?=\d{4,9}\/)/g,'10.');try{text=decodeURIComponent(text);}catch(_){}
    const m=text.match(/10\.\d{4,9}\/(?:[^\s<>"#]|<\d+::[a-z0-9._;:-]+>)+/i); if(!m)return '';
    let d=m[0].replace(/[.,;:]+$/,'');
    while(d.endsWith(')')&&(d.match(/\)/g)||[]).length>(d.match(/\(/g)||[]).length)d=d.slice(0,-1);
    return d.toLowerCase();
  }
  function recordDOI(record) {
    const value=doi(record.DOI),linked=/^https?:\/\/(?:dx\.)?doi\.org\//i.test(record.url||'')?doi(record.url):'';
    // Earlier builds cut legacy SICI identifiers at '<'. Repair only that exact prefix.
    return linked&&(!value||linked.startsWith(value+'<')&&/<\d+::[^>]+>/.test(linked))?linked:value;
  }
  function charsText(ref) {
    return clean(ref.chars?.length ? ref.chars.filter(c=>!c.ignorable).map(c=>c.c+((c.spaceAfter||c.lineBreakAfter)?' ':'')).join('') : ref.text);
  }
  function repairPDFAccents(text) {
    const marks={'´':'\u0301','`':'\u0300','¨':'\u0308','ˆ':'\u0302','˜':'\u0303'};
    return String(text??'').replace(/([\p{L}])\s*([\p{M}´`¨ˆ˜])\s*(?=[\p{L}])/gu,(_,letter,mark)=>letter+(marks[mark]||mark)).normalize('NFC');
  }
  function parse(raw,position=null) {
    raw=clean(repairPDFAccents(raw)).replace(/(10\.\d{4,9}\/[^\s]*[-/])\s+(?=[a-z0-9])/gi,'$1');const yearMatch=raw.match(/\b(1[6-9]\d{2}|20\d{2})([a-z])?\)(?=[.\s]|$)/)||raw.match(/\b(1[6-9]\d{2}|20\d{2})(?:F(?=[a-z][.)]))?([a-z])?(?:[–-](?:(?:19|20)\d{2}|\d{2}))?\b/);
    const year=yearMatch?.[1]||'', suffix=yearMatch?.[2]||'';
    const before=yearMatch?raw.slice(0,yearMatch.index).replace(/^\[?\d+\]?[.)]?\s*/, '').trim():'';
    let author=before.split(',')[0].replace(/\(\s*$/,'').trim();
    const tail=yearMatch?raw.slice(yearMatch.index+yearMatch[0].length).replace(/^[\s).,:;]+/,''):raw;
    const parts=tail.split(/\.\s+(?=[\p{Lu}\d])/u);
    let title=parts[0]||raw,creatorText=before;
    // Vancouver places the year after journal/title. Only split at initials-to-title boundary.
    if (yearMatch && (title.length<12 || /^(?:\d|https?:\/\/)/.test(title))) {
      const vm=raw.match(/^(?:\[?\d+\]?[.)]?\s*)?(.+?)\.\s+(.{12,}?)\.\s+(.+?)\s+(?:19|20)\d{2}/);
      if(vm){title=vm[2];creatorText=vm[1];author=creatorText.split(',')[0].replace(/\s+[A-Z]{1,5}$/,'').trim();}else title=raw;
    }
    const chapter=/\bIn:\s*.+?\(Eds?\.?\)/i.test(tail);
    const book=/\b(?:University[^.]*Press|Press|Verlag|Publishers?|Publishing|Lippincott|Springer)\b/i.test(tail)&&!doi(raw);
    let journal=!book&&!chapter && parts.length>1?parts.slice(1).join('. ').replace(/\s+\d.*$/,'').replace(/[.,]+$/,''):'';
    // A question/exclamation mark can terminate a title without a following period.
    // Require a journal + volume + page tail, so internal questions stay in the title.
    if(!book&&!chapter){const end=tail.match(/^(.{12,}[?!])\s+([\p{Lu}][\p{L}\s.&’'–-]{1,100}?)\s+(\d+)(?:\s*\([^)]*\))?[,;:]\s*\d+(?:[-–]\d+)?[.]?$/u);if(end&&(!journal||/^(?:[A-Z][a-z]{0,5}\.\s*){1,8}$/.test(end[2]))){title=end[1];journal=clean(end[2]).replace(/[.,]+$/,'');}}
    const creators=[];
    const rx=/([\p{L}][\p{L}'’\- ]+(?:\s+(?:Jr|Sr)\.)?),\s*((?:[A-Z]\.\s*){1,5})/gu;
    const authorMatches=[...creatorText.matchAll(rx)];
    for(const m of authorMatches)creators.push({lastName:m[1].trim().replace(/^(?:and|&)\s+/i,''),firstName:m[2].replace(/\s+/g,''),creatorType:'author'});
    if(title===raw&&authorMatches.length){const last=authorMatches.at(-1),rest=creatorText.slice(last.index+last[0].length).replace(/^[\s,&]+/,'').replace(/^et al\.\s*/,'');const split=rest.match(/^(.{12,}?)\.\s+(.+)$/);if(split){title=split[1];journal=split[2].replace(/\s+\d.*$/,'').replace(/[.,(\s]+$/,'');}}
    if(!creators.length){for(const part of creatorText.replace(/et al\.?/g,'').split(',')){const m=part.trim().replace(/[\s(.]+$/,'').match(/^([\p{L}][\p{L}'’\- ]+?)\s+([A-Z]{1,5})$/u);if(m)creators.push({lastName:m[1],firstName:m[2],creatorType:'author'});}}
    if(!creators.length&&author)creators.push({lastName:author,firstName:'',creatorType:'author'});
    if(creators.length)author=creators[0].lastName;
    const publisher=book?clean(parts.slice(1).join('. ').match(/^(.+?(?:Press|Verlag|Publishing|Publishers)|Springer|Lippincott)(?:[,.;]|$)/i)?.[1]):chapter?clean(tail.match(/\b(Elsevier|Springer|Academic Press|Morgan & Claypool Life Sciences)[,.;]/)?.[1]):'';
    const locator=(!book&&!chapter?raw:'').match(/\s(\d+)(?:\s*\(([^)]+)\))?[,;:]\s*(\d+(?:[-–]\d+(?:\.[a-z]\d+)?)?)\s*(?:\((?:19|20)\d{2}\))?[.]?$/);
    return {raw,title:clean(title),year,suffix,author,creators,journal,publisher,volume:locator?.[1]||'',issue:locator?.[2]||'',pages:locator?.[3]||'',number:Number(raw.match(/^\[?(\d{1,4})\]?[.)]?\s/)?.[1])||undefined,DOI:doi(raw),type:chapter?'bookSection':book?'book':'journalArticle',position,source:'PDF 原始参考文献',verified:false};
  }
  function fromReference(ref) { return parse(charsText(ref),ref.position?JSON.parse(JSON.stringify(ref.position)):null); }
  function researchTitle(record) {
    const title=plainTitle(record.title),authorList=/^(?:\[?\d+\]?[.)]?\s*)?[\p{L}][\p{L}'’–\- ]*,\s*\p{Lu}\./u;
    if(!authorList.test(title))return title;
    // Repair only recognisable bibliography strings, including old cached PDF records.
    // Never delete eponymous scientific terms such as Müller cells or Parkinson disease.
    const parsed=parse(record.raw||title),candidate=plainTitle(parsed.title);
    return parsed.year&&candidate.length>=12&&!authorList.test(candidate)?candidate:'';
  }
  // Shared title/abstract record for research analysis and source evidence.
  // Identity/creator evidence for author graphs is carried separately by coauthor edges.
  function researchRecord(record) {
    let title=researchTitle(record);const abstract=plainTitle(record.abstract||record.abstractNote||record.abstractText||''),container=plainTitle(record.containerTitle||record.bookTitle||(record.type==='bookSection'?record.journal:''));
    if(container&&/^(?:data analysis|introduction|methods?|results?|discussion|conclusions?|preface|appendix)$/i.test(title))title=container+' '+title.toLowerCase();
    return {schema:'nexus-paper/1',id:record.id,title,abstract,evidence:abstract?'provided-abstract':'title-only'};
  }
  const identity = r => recordDOI(r)?'doi:'+recordDOI(r):r.raw||r.title?'text:'+norm(r.raw||r.title)+'|'+(r.year||''):'number:'+r.number;
  const similarity = (a,b) => { const x=new Set(norm(a).split(' ').filter(Boolean)),y=new Set(norm(b).split(' ').filter(Boolean));return x.size&&y.size?2*[...x].filter(t=>y.has(t)).length/(x.size+y.size):0; };
  function fromCrossref(m) {
    const types={'book':'book','monograph':'book','edited-book':'book','book-chapter':'bookSection','proceedings-article':'conferencePaper','posted-content':'preprint'};
    const date=(m['published-print']||m.published||m['published-online']||m.issued)?.['date-parts']?.[0];
    return {title:plainTitle(m.title?.[0]),titleMarkup:clean(m.title?.[0]),DOI:doi(m.DOI),type:types[m.type]||'journalArticle',year:String(date?.[0]||''),date:date?.join('-')||'',journal:clean(m['container-title']?.[0]),journalAbbreviation:clean(m['short-container-title']?.[0]),bookTitle:types[m.type]==='bookSection'?clean(m['container-title']?.[0]):'',edition:clean(m.edition),bibliographyVersion:2,repository:m.type==='posted-content'?clean(m.institution?.[0]?.name):'',preprintMetadataVersion:1,ISSN:(m.ISSN||[]).join(', '),ISBN:(m.ISBN||[]).join(', '),volume:clean(m.volume),issue:clean(m.issue),pages:clean(m.page),publisher:clean(m.publisher),url:m.URL||'',creators:(m.author||[]).map(a=>({firstName:clean(a.given),lastName:clean(a.family||a.name),creatorType:'author',...(a.ORCID?{ORCID:clean(a.ORCID)}:{}),...(a.affiliation?.length?{affiliations:a.affiliation.map(x=>clean(x.name)).filter(Boolean)}:{})})),author:clean(m.author?.[0]?.family),abstract:plainTitle(m.abstract||''),abstractParserVersion:1,updates:m['update-to']||[],source:'Crossref',fetchedAt:new Date().toISOString(),verified:true};
  }
  function compatibility(input,r) {
    const title=similarity(input.title,r.title),leftDOI=recordDOI(input),rightDOI=recordDOI(r),exact=!!leftDOI&&leftDOI===rightDOI;
    const lead=x=>norm(x.creators?.[0]?.lastName||x.author),author=!!lead(input)&&lead(input)===lead(r);
    const expected=(input.creators||[]).map(a=>norm(a.lastName)).filter(Boolean),actual=(r.creators||[]).map(a=>norm(a.lastName)).filter(Boolean);
    const overlap=expected.length&&actual.length?expected.filter(n=>actual.includes(n)).length/Math.min(expected.length,actual.length):null;
    const year=!!input.year&&String(input.year)===String(r.year),delta=input.year&&r.year?Math.abs(Number(input.year)-Number(r.year)):null;
    const hasTitle=norm(input.title).length>=10&&norm(r.title).length>=10,rejected=[];if(!norm(r.title))rejected.push('缺少题名');
    if(leftDOI&&rightDOI&&!exact)rejected.push('DOI 不同');
    if(hasTitle&&title<.52)rejected.push('题名不符');
    if(delta!==null&&delta>1)rejected.push('年份不符');
    if(lead(input)&&lead(r)&&!author)rejected.push('首作者不符');
    if(expected.length>=3&&actual.length>=3&&overlap<.5)rejected.push('作者列表不符');
    // One-year online/print differences stay reviewable, never silently overwrite.
    return {title,author,year,exact,delta,overlap,rejected,eligible:!rejected.length};
  }
  function rank(input,candidates) {
    const seen=new Set();
    return candidates.map(r=>{
      const v=compatibility(input,r),key=identity(r);if(seen.has(key))return null;seen.add(key);
      if(!v.eligible)return null;
      const reasons=[...(v.exact?['DOI 相同']:[]),...(v.title>=.8?['题名接近']:[]),...(v.author?['首作者相同']:[]),...(v.year?['年份相同']:v.delta===1?['出版年份相差 1 年']:[])];
      return {record:r,score:v.exact?1:v.title*.7+Number(v.author)*.18+Number(v.year)*.12,conflict:false,reasons};
    }).filter(Boolean).sort((a,b)=>b.score-a.score);
  }
  function decide(input,candidates) {
    const ranked=rank(input,candidates),top=ranked[0];
    if(!top)return {status:'missing',ranked};
    const v=compatibility(input,top.record),exact=v.exact&&(v.delta===null||v.year);
    const strong=!recordDOI(input)&&top.score>=.93&&(!ranked[1]||top.score-ranked[1].score>=.12)&&v.year&&v.author;
    return {status:exact||strong?'matched':'review',ranked};
  }
  function issn(s) {
    const x=String(s||'').toUpperCase().replace(/[^0-9X]/g,''); if(!/^\d{7}[\dX]$/.test(x))return '';
    const sum=[...x.slice(0,7)].reduce((a,c,i)=>a+Number(c)*(8-i),0)+(x[7]==='X'?10:Number(x[7]));
    return sum%11===0?x.slice(0,4)+'-'+x.slice(4):'';
  }
  function parseCSV(text) {
    text=String(text).replace(/^\uFEFF/,'');const rows=[];let row=[],field='',quoted=false;
    for(let i=0;i<=text.length;i++) {
      const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}
      else if(!quoted&&(c===','||c==='\n'||c===undefined)){row.push(field.trim());field='';if(c!==','){if(row.some(Boolean))rows.push(row);row=[];}}
      else if(c!=='\r')field+=c||'';
    }
    if(quoted)throw Error('CSV 引号未闭合');const headers=rows.shift()||[];
    return rows.map(row=>Object.fromEntries(headers.map((h,i)=>[h,row[i]||''])));
  }
  function metricsImport(text) {
    let entries=text.trim().startsWith('[')||text.trim().startsWith('{')?JSON.parse(text):parseCSV(text);
    if(!Array.isArray(entries))entries=entries.journals;
    if(!Array.isArray(entries)||entries.length>50000)throw Error('指标文件须为 journals 数组或 CSV，最多 50,000 行');
    const result=[];
    for(const [i,e] of entries.entries()) {
      const ISSNs=String(e.issn||e.ISSN||'').split(/[;,\s]+/).filter(Boolean).map(issn);
      const metricYear=Number(e.metricYear||e.year),jifRaw=String(e.jif??'').trim(),jif=jifRaw===''?null:Number(jifRaw),journal=clean(e.journal),source=clean(e.source);
      const categories=e.categories||[{name:e.category,quartile:e.quartile}];
      if(!ISSNs.length||ISSNs.some(x=>!x)||!journal||!source||!Number.isInteger(metricYear)||metricYear<1975||metricYear>new Date().getFullYear()||jif!==null&&(!Number.isFinite(jif)||jif<0))throw Error(`第 ${i+1} 行：请检查 ISSN、期刊名、指标年份、JIF 和来源`);
      if(!Array.isArray(categories)||categories.some(c=>!clean(c.name)||!/^Q[1-4]$/.test(c.quartile)))throw Error(`第 ${i+1} 行：JCR 学科类别与 Q1–Q4 必须成对填写`);
      const record={issns:ISSNs,journal,metricYear,jif,categories:categories.map(c=>({name:clean(c.name),quartile:c.quartile})),source,importedAt:new Date().toISOString()};
      // Merge multiple category rows only when their JIF and provenance agree.
      const previous=result.find(x=>x.metricYear===metricYear&&x.issns.some(v=>ISSNs.includes(v)));
      if(previous){if(previous.jif!==jif||previous.source!==source||norm(previous.journal)!==norm(journal))throw Error(`第 ${i+1} 行：同一 ISSN／年份有冲突的指标或来源`);for(const c of record.categories){const old=previous.categories.find(x=>x.name===c.name);if(old&&old.quartile!==c.quartile)throw Error(`第 ${i+1} 行：同学科分区冲突`);if(!old)previous.categories.push(c);}}
      else result.push(record);
    }
    if(!result.length)throw Error('文件中没有有效指标');return result;
  }
  function metricFor(record,metrics,year=null) {
    if(['book','bookSection','thesis','preprint'].includes(record.type))return {status:'not-applicable',label:'期刊指标不适用'};
    const ids=String(record.ISSN||'').split(/[;,\s]+/).map(issn).filter(Boolean);
    let hits=metrics.filter(m=>ids.length?m.issns.some(x=>ids.includes(x)):norm(m.journal)===norm(record.journal)&&!!record.journal);
    if(year)hits=hits.filter(m=>m.metricYear===Number(year));
    if(!hits.length)return {status:'missing',label:year?`${year} 年指标未提供`:'JCR / JIF 未提供'};
    hits.sort((a,b)=>b.metricYear-a.metricYear);const same=hits.filter(m=>m.metricYear===hits[0].metricYear);
    if(same.length>1)return {status:'ambiguous',label:'期刊指标匹配不唯一'};
    return {status:'available',match:ids.length?'ISSN':'完整期刊名',...hits[0]};
  }
  function citationMentions(text,{nativeNumeric=false}={}) {
    const out=[],numeric=/\[(\d+(?:\s*[-–,;]\s*\d+)*)\]/g;
    const numbers=value=>{const nums=[];for(const part of value.split(/[,;]/)){const [a,b]=part.trim().split(/[-–]/).map(Number);if(!a||a>9999||b!==undefined&&(b<a||b-a>100))return [];for(let n=a;n<=(b??a);n++)nums.push({number:n});}return nums;};
    for(const m of text.matchAll(numeric))out.push({start:m.index,end:m.index+m[0].length,text:m[0],keys:numbers(m[1])});
    if(nativeNumeric&&/^\s*\d+(?:\s*[-–,;]\s*\d+)*\s*$/.test(text))out.push({start:0,end:text.length,text,keys:numbers(text)});
    const surname="(?:(?:[Vv]an|[Vv]on|[Dd]e|[Dd]el|[Dd]er|[Dd]en|[Dd]a|[Dd]i|[Ll]a|[Ll]e) +)*[\\p{Lu}](?:[\\p{L}\\p{M}'’\\-]| *[\\p{M}´`¨ˆ˜] *)+(?: +(?:y +)?[\\p{Lu}](?:[\\p{L}\\p{M}'’\\-]| *[\\p{M}´`¨ˆ˜] *)+){0,2}";
    const authors="("+surname+")(?:(?:,? +et +al\\.?)|(?: +(?:and|&) +("+surname+")))?";
    const years="((?:1[6-9]|20)\\d{2}[a-z]?(?:\\s*,\\s*(?:(?:1[6-9]|20)\\d{2}[a-z]?|[a-z](?![\\p{L}\\p{N}])))*)(?![\\d])";
    const rx=new RegExp(authors+"\\s*[,（(\\[]?\\s*"+years,'gu');
    for(const m of text.matchAll(rx)){
      if(/^(?:January|February|March|April|May|June|July|August|September|October|November|December)$/.test(m[1]))continue;
      const keys=[];let year='';for(const token of m[3].split(/\s*,\s*/)){const y=token.match(/^(\d{4})([a-z])?$/);if(y)year=y[1];keys.push({author:repairPDFAccents(m[1]),second:repairPDFAccents(m[2]||''),etal:/et\s+al/.test(m[0]),year,suffix:y?y[2]||'':token});}
      out.push({start:m.index,end:m.index+m[0].length,text:m[0],keys});
    }
    return out.filter(m=>m.keys[0]?.number===undefined||!out.some(a=>a.keys[0]?.author&&a.start<=m.start&&a.end>=m.end-1)).sort((a,b)=>a.start-b.start);
  }
  function resolveMention(mention,refs) {
    const records=[],unresolved=[];
    for(const key of mention?.keys||[]){
      let hits=refs.filter(r=>key.number!==undefined?Number(r.number)===key.number:norm(r.author).replace(/ /g,'')===norm(key.author).replace(/ /g,'')&&String(r.year)===key.year&&(!key.suffix||r.suffix===key.suffix)&&(!key.second||norm(r.creators?.[1]?.lastName).replace(/ /g,'')===norm(key.second).replace(/ /g,''))&&(!key.etal||r.creators?.length>=3||/et\s+al/.test(r.raw||'')||!r.creators?.length));
      if(hits.length>1&&key.author&&!key.etal&&!key.second){const single=hits.filter(r=>r.creators?.length===1);if(single.length===1)hits=single;}
      const unique=[...new Map(hits.map(r=>[identity(r),r])).values()];
      if(unique.length===1)records.push(unique[0]);else unresolved.push({...key,reason:unique.length?'ambiguous':'missing'});
    }
    return {records:[...new Map(records.map(r=>[identity(r),r])).values()],unresolved,expected:mention?.keys.length||0,text:mention?.text||''};
  }
  function findCitations(text,refs) {return [...new Map(citationMentions(text).flatMap(m=>resolveMention(m,refs).records).map(r=>[identity(r),r])).values()];}
  function citationAt(text,offset,refs) {const m=citationMentions(text).find(m=>offset>=m.start&&offset<m.end);return resolveMention(m,refs).records;}
  // Display-only cleanup: keep scientific text and remove explicit terminal publishing notices.
  function abstractBody(value,record={}) {
    let text=String(value||'').trim();
    const notice=/(?:©|&copy;|copyright\s*(?:©|\(c\))?)\s*(?:19|20)\d{2}\b[\s\S]{0,500}$/i.exec(text);
    if(notice){text=text.slice(0,notice.index).replace(/(?:<(?:p|div|section)[^>]*>\s*)+$/gi,'').trim();const journal=plainTitle(record.journal||'');if(journal){const escaped=journal.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');text=text.replace(new RegExp('(?:<[^>]+>|\\s)*'+escaped+'\\s+\\d+[\\s\\S]{0,70}?(?:19|20)\\d{2}\\s*\\.?\\s*(?:<[^>]+>\\s*)*$','i'),'').trim();}}
    return text;
  }
  function publicationLine(r) {
    const journal=plainTitle(r.journal||r.publicationTitle||r.bookTitle||''),year=clean(r.year||String(r.date||'').match(/\b(?:18|19|20)\d{2}\b/)?.[0]),volume=clean(r.volume),issue=clean(r.issue),pages=clean(r.pages);
    if(r.type==='preprint'){const repository=plainTitle(r.repository||r.journal||r.publisher||''),date=clean(r.date||year).replace(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?$/,(_,y,m,d)=>y+'-'+m.padStart(2,'0')+(d?'-'+d.padStart(2,'0'):''));return [repository?repository+' [Preprint]':'Preprint',date].filter(Boolean).join('. ');}
    if(['book','bookSection'].includes(r.type)){
      const container=r.type==='bookSection'?plainTitle(r.bookTitle||r.containerTitle||r.journal||''):'',publisher=plainTitle(r.publisher||''),place=plainTitle(r.place||''),edition=plainTitle(r.edition||'');
      const editionLabel=/^\d+$/.test(edition)?edition+([11,12,13].includes(Number(edition)%100)?'th':({1:'st',2:'nd',3:'rd'}[Number(edition)%10]||'th'))+' ed.':edition;
      const parts=[container,editionLabel,[place,publisher].filter(Boolean).join(': '),year,pages?'pp. '+pages.replace(/(\d)\s*[-–]\s*(\d)/g,'$1–$2'):''].filter(Boolean);return parts.map((x,i)=>i<parts.length-1?x.replace(/\.$/,''):x).join('. ');
    }
    const citation=[year,volume+(issue?'('+issue+')':'')].filter(Boolean).join('; ')+(pages?': '+pages.replace(/(\d)\s*[-–]\s*(\d)/g,'$1–$2'):'');
    return [journal,citation.replace(/^:\s*/,'')].filter(Boolean).join('. ');
  }
  function citation(r) {return r.raw?plainTitle(r.raw):`${r.creators?.map(c=>c.lastName+(c.firstName?', '+c.firstName:'')).join(', ')||r.author||''} (${r.year||'n.d.'}). ${plainTitle(r.title)}. ${r.journal||r.publisher||''}${recordDOI(r)?' https://doi.org/'+recordDOI(r):''}`;}
  function ris(records) {
    const one=r=>{const lines=['TY  - '+({book:'BOOK',bookSection:'CHAP',conferencePaper:'CONF',preprint:'UNPB'}[r.type]||'JOUR'),'TI  - '+plainTitle(r.title)];for(const a of r.creators||[])lines.push('AU  - '+clean(a.lastName)+', '+clean(a.firstName));for(const [k,v] of Object.entries({PY:r.year,JO:r.journal,DO:recordDOI(r),VL:r.volume,IS:r.issue,SP:r.pages,UR:r.url||recordDOI(r)&&'https://doi.org/'+recordDOI(r),N1:r.raw}))if(v)lines.push(k+'  - '+clean(v));return lines.join('\n')+'\nER  - \n';};return records.map(one).join('\n');
  }
  return {repairPDFAccents,abstractBody,publicationLine,clean,titleParts,plainTitle,researchTitle,researchRecord,norm,doi,recordDOI,charsText,parse,fromReference,identity,similarity,fromCrossref,compatibility,rank,decide,issn,parseCSV,metricsImport,metricFor,citationMentions,resolveMention,findCitations,citationAt,citation,ris};
})();
if(typeof module!=='undefined')module.exports=CiteLensCore;
