/* Reconcile source text with the bibliography. Native destinations are hints only. */
var CiteLensCitationLinks={
  page(chars){
    let text='';const offsets=new Map();
    for(const c of chars||[]){offsets.set(c.offset,text.length);if(!c.ignorable)text+=c.c+((c.spaceAfter||c.lineBreakAfter)?' ':'');}
    return {text,offsets,mentions:CiteLensCore.citationMentions(text)};
  },
  resolve(overlay,page,refs){
    const C=CiteLensCore,word=overlay?.word||[],offset=page?.offsets.get(word[0]?.offset??overlay?.offset);
    if(!page||offset===undefined)return {records:[],unresolved:[],expected:0,text:'',status:'unavailable'};
    let mentions=page.mentions.filter(m=>offset>=m.start&&offset<m.end);
    // Combine only within the same explicit parentheses, not neighboring prose.
    const before=page.text.slice(0,offset),open=before.lastIndexOf('('),closed=before.lastIndexOf(')'),end=page.text.indexOf(')',offset);
    if(open>closed&&end>offset&&end-open<1600&&!page.text.slice(open+1,end).includes('(')){
      const grouped=page.mentions.filter(m=>m.start>open&&m.end<=end);if(grouped.some(m=>offset>=m.start&&offset<m.end))mentions=grouped;
    }
    if(!mentions.length){const value=C.charsText({chars:word});if(/^\s*\d+(?:\s*[-–,;]\s*\d+)*\s*$/.test(value))mentions=C.citationMentions(value,{nativeNumeric:true});}
    const resolved=mentions.map(m=>C.resolveMention(m,refs)),records=[...new Map(resolved.flatMap(x=>x.records).map(r=>[C.identity(r),r])).values()],unresolved=resolved.flatMap(x=>x.unresolved);
    return {records,unresolved,expected:resolved.reduce((n,x)=>n+x.expected,0),text:mentions.map(m=>m.text).join('; '),status:records.length?(unresolved.length?'partial':'matched'):'unresolved'};
  }
};
if(typeof module!=='undefined')module.exports=CiteLensCitationLinks;
