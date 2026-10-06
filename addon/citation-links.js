/* Reconcile source text with the bibliography. Native destinations are hints only. */
var CiteLensCitationLinks={
  superscripts(chars){
    const runs=[],numeric=c=>c&&!c.ignorable&&/^[0-9,;–−-]$/.test(c.c)&&c.rotation===0&&Number.isFinite(c.baseline)&&c.fontSize>0&&c.rect;
    for(let i=1;i<(chars||[]).length;i++){
      const first=chars[i],before=chars[i-1];if(!numeric(first)||!/^\d$/.test(first.c)||!before.rect||!Number.isFinite(before.baseline)||!before.fontSize)continue;
      const ratio=first.fontSize/before.fontSize,rise=(first.baseline-before.baseline)/before.fontSize,gap=first.rect[0]-before.rect[2];
      // A raised small-font run attached to prose. Baseline digits and units are not citations.
      if(ratio<.42||ratio>.84||rise<.16||rise>.8||gap<-.45*before.fontSize||gap>1.2*before.fontSize)continue;
      let token=before.c;for(let n=i-2;n>=Math.max(0,i-32)&&!chars[n].spaceAfter&&!chars[n].lineBreakAfter;n--)token=chars[n].c+token;
      if(/^(?:[\d.,]+|[a-z]|cm|mm|nm|µm|μm|um|m|s|kg|mol)$/i.test(token.trim()))continue;
      let end=i+1;
      while(end<chars.length){const prev=chars[end-1],next=chars[end];if(!numeric(next)||Math.abs(next.fontSize-first.fontSize)>.15*first.fontSize||Math.abs(next.baseline-first.baseline)>.25*first.fontSize||next.rect[0]<prev.rect[0]||next.rect[0]-prev.rect[2]>.65*first.fontSize)break;end++;}
      while(end>i+1&&!/^\d$/.test(chars[end-1].c))end--;
      const group=chars.slice(i,end),text=group.map(c=>c.c).join('').replace(/−/g,'–');if(!/^\d+(?:[-–,;]\d+)*$/.test(text))continue;
      runs.push({text,ratio,offsets:group.map(c=>c.offset),rects:group.map(c=>c.rect)});i=end-1;
    }
    return runs;
  },
  page(chars,overlays=[]){
    let text='';const offsets=new Map();
    for(const c of chars||[]){offsets.set(c.offset,text.length);if(!c.ignorable)text+=c.c+((c.spaceAfter||c.lineBreakAfter)?' ':'');}
    const numericRuns=this.superscripts(chars),native=new Set(overlays.filter(o=>o.type==='citation').flatMap(o=>(o.word||[]).map(c=>c.offset))),ratios=numericRuns.filter(r=>r.offsets.some(o=>native.has(o))).map(r=>r.ratio);
    // Unlinked raised numbers need the page's established citation typography.
    // This excludes the differently scaled author-affiliation numbers on article page 1.
    const pointRuns=numericRuns.filter(r=>ratios.some(ratio=>Math.abs(ratio-r.ratio)<.025));
    return {text,offsets,chars,overlays,mentions:CiteLensCore.citationMentions(text),numericRuns,pointRuns};
  },
  occurrences(pages,refs,progress=()=>{}){
    const C=CiteLensCore,index=new Map();let completed=0;
    for(const [pageIndex,page] of pages){
      const bibliography=refs.filter(r=>r.position?.pageIndex===pageIndex).flatMap(r=>r.position.rects||[]),overlap=(a,b)=>a[0]<b[2]&&a[2]>b[0]&&a[1]<b[3]&&a[3]>b[1];
      const add=(mentions,chars,start,end)=>{
        const rects=chars.filter(c=>!c.ignorable&&c.rect).map(c=>Array.from(c.rect));if(!rects.length||rects.some(r=>bibliography.some(b=>overlap(r,b))))return;
        const records=this.result(mentions,refs).records;if(!records.length)return;
        const groups=[];for(const rect of rects){const line=groups.find(r=>Math.abs(r[1]-rect[1])<2&&Math.abs(r[3]-rect[3])<2&&rect[0]-r[2]<14);if(line){line[0]=Math.min(line[0],rect[0]);line[2]=Math.max(line[2],rect[2]);}else groups.push(rect.slice());}
        for(const record of records){const key=C.identity(record),rows=index.get(key)||[];if(rows.some(x=>x.position.pageIndex===pageIndex&&start<x.end&&end>x.start))continue;rows.push({position:{pageIndex,rects:groups},start,end,label:mentions.map(m=>m.text).join('; '),snippet:page.text.slice(Math.max(0,start-85),Math.min(page.text.length,end+105)).trim()});index.set(key,rows);}
      };
      for(const mention of page.mentions){const chars=(page.chars||[]).filter(c=>{const at=page.offsets.get(c.offset);return at>=mention.start&&at<mention.end;});add([mention],chars,mention.start,mention.end);}
      for(const run of page.pointRuns||[]){const chars=(page.chars||[]).filter(c=>run.offsets.includes(c.offset)),start=page.offsets.get(run.offsets[0]),end=page.offsets.get(run.offsets.at(-1))+1;add(C.citationMentions(run.text,{nativeNumeric:true}),chars,start,end);}
      progress(Math.round(++completed/pages.size*100));
    }
    for(const rows of index.values())rows.sort((a,b)=>a.position.pageIndex-b.position.pageIndex||a.start-b.start);return index;
  },
  currentOccurrence(locations,context){
    if(!context?.citationPosition)return null;
    const position=context.citationPosition,rows=locations.filter(l=>l.position.pageIndex===position.pageIndex),offset=context.citationOffset,range=context.citationRange;
    const exact=rows.filter(l=>Number.isFinite(offset)&&offset>=l.start&&offset<l.end);
    if(exact.length===1)return exact[0];
    const intersects=(a,b)=>a[0]<=b[2]&&a[2]>=b[0]&&a[1]<=b[3]&&a[3]>=b[1];
    const nearby=rows.filter(l=>(position.rects||[]).some(a=>l.position.rects.some(b=>intersects(a,b))));
    if(nearby.length===1)return nearby[0];
    const grouped=rows.filter(l=>range&&l.start>=range[0]&&l.end<=range[1]);return grouped.length===1?grouped[0]:null;
  },
  result(mentions,refs){
    const C=CiteLensCore,resolved=mentions.map(m=>C.resolveMention(m,refs)),records=[...new Map(resolved.flatMap(x=>x.records).map(r=>[C.identity(r),r])).values()],unresolved=resolved.flatMap(x=>x.unresolved);
    return {records,unresolved,expected:resolved.reduce((n,x)=>n+x.expected,0),text:mentions.map(m=>m.text).join('; '),status:records.length?(unresolved.length?'partial':'matched'):'unresolved'};
  },
  atPoint(page,point,refs){
    if(!page||!point||!refs.some(r=>r.number))return null;
    const run=page.pointRuns?.find(run=>run.rects.some(r=>point[0]>=r[0]-.3&&point[0]<=r[2]+.3&&point[1]>=r[1]-.3&&point[1]<=r[3]+.3));
    return run?this.result(CiteLensCore.citationMentions(run.text,{nativeNumeric:true}),refs):null;
  },
  resolve(overlay,page,refs){
    const C=CiteLensCore,word=overlay?.word||[],offset=page?.offsets.get(word[0]?.offset??overlay?.offset);
    if(!page||offset===undefined)return {records:[],unresolved:[],expected:0,text:'',status:'unavailable'};
    // Native word segmentation can split RPB1 followed by superscript 26 into RPB12 + 6.
    const run=page.numericRuns?.find(run=>word.some(c=>run.offsets.includes(c.offset))||run.offsets.includes(overlay?.offset));
    if(run)return this.result(C.citationMentions(run.text,{nativeNumeric:true}),refs);
    let mentions=page.mentions.filter(m=>offset>=m.start&&offset<m.end);
    // Combine only within the same explicit parentheses, not neighboring prose.
    const before=page.text.slice(0,offset),open=before.lastIndexOf('('),closed=before.lastIndexOf(')'),end=page.text.indexOf(')',offset);
    if(open>closed&&end>offset&&end-open<1600&&!page.text.slice(open+1,end).includes('(')){
      const grouped=page.mentions.filter(m=>m.start>open&&m.end<=end);if(grouped.some(m=>offset>=m.start&&offset<m.end))mentions=grouped;
    }
    if(!mentions.length){const value=C.charsText({chars:word});if(/^\s*\d+(?:\s*[-–,;]\s*\d+)*\s*$/.test(value))mentions=C.citationMentions(value,{nativeNumeric:true});}
    return this.result(mentions,refs);
  }
};
if(typeof module!=='undefined')module.exports=CiteLensCitationLinks;
