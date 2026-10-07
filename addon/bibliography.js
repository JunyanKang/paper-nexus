/* Local text-layer fallback. Conservative hanging-indent/numbered segmentation. */
var CiteLensBibliography = {
  runningHeaders(pages) {
    const C=CiteLensCore,seen=new Map(),lines=[];
    for(const [index,page] of Object.entries(pages||{})){
      const top=page.viewBox?.[3]||800,rows=new Map();
      for(const c of page.chars||[]){if(!c.rect||c.rect[1]<top-55&&c.rect[1]>40)continue;const y=Math.round(c.rect[1]/3)*3;if(!rows.has(y))rows.set(y,[]);rows.get(y).push(c);}
      for(const chars of rows.values()){const text=C.charsText({chars}),doi=C.doi(text),key=doi||C.norm(text);if(key.length<12)continue;lines.push({chars,key,index});if(!seen.has(key))seen.set(key,new Set());seen.get(key).add(index);}
    }
    const repeated=lines.filter(x=>seen.get(x.key).size>=2),result=new Set(repeated.flatMap(x=>x.chars.map(c=>x.index+':'+c.offset)));result.lines=new Set(repeated.map(x=>x.key));return result;
  },
  fromReference(ref,headers=new Set()) {
    const chars=ref.chars?.filter(c=>!headers.has(c.pageIndex+':'+c.offset)),copy={...ref,chars};
    return CiteLensCore.fromReference(copy);
  },
  authorStart(text) {
    return /^[\p{L}][\p{L}'’\- ]{1,40},\s*(?:[A-Z]\.|[\p{Lu}][\p{Ll}])/u.test(text)||/^[\p{Lu}][\p{L}'’\-]*(?: [\p{L}'’\-]+){0,3} [A-Z]{1,5}(?:,|\.\s+(?:18|19|20)\d{2})/u.test(text);
  },
  lines(items,width,pageIndex) {
    const usable=items.filter(x=>x.str?.trim()&&x.transform?.length>=6&&Math.abs(x.transform[0])>=Math.abs(x.transform[1])).map(x=>({text:x.str,x:x.transform[4],y:x.transform[5],height:Math.abs(x.height||x.transform[3]||8),width:x.width||0}));
    const rightStarts=usable.filter(x=>x.x>width*.47&&x.x<width*.59).length;
    // A genuine gutter has no repeated text spans crossing it. Inline font
    // changes in a single wide column must not create an imaginary right column.
    const crossings=usable.filter(x=>x.x<width*.49&&x.x+x.width>width*.51).length;
    const columns=rightStarts>4&&crossings<Math.max(3,usable.length*.06)?2:1,out=[];
    for(let col=0;col<columns;col++) {
      const set=usable.filter(x=>columns===1||(x.x>=width/2?1:0)===col).sort((a,b)=>b.y-a.y||a.x-b.x);const rows=[];
      for(const item of set){let row=rows.find(r=>Math.abs(r.y-item.y)<Math.min(2,item.height*.3));if(!row){row={y:item.y,parts:[]};rows.push(row);}row.parts.push(item);}
      for(const row of rows){row.parts.sort((a,b)=>a.x-b.x);let text='';for(let i=0;i<row.parts.length;i++){const p=row.parts[i],prev=row.parts[i-1];if(prev&&p.x-prev.x-prev.width>Math.max(.6,p.height*.12)&&!text.endsWith(' '))text+=' ';text+=p.text;}const min=Math.min(...row.parts.map(p=>p.x)),max=Math.max(...row.parts.map(p=>p.x+p.width)),h=Math.max(...row.parts.map(p=>p.height));out.push({text:CiteLensCore.clean(text),x:min,y:row.y,height:h,column:col,pageIndex,rect:[min,row.y-h*.25,max,row.y+h]});}
    }
    return out;
  },
  parse(pages,headers=null) {
    const out=[];let active=false,current=null;
    const flush=()=>{if(!current)return;const raw=current.lines.map(l=>l.text).join(' ').replace(/([\p{L}])[-‐]\s+([a-z])/gu,'$1$2');const r=CiteLensCore.parse(raw,{pageIndex:current.lines[0].pageIndex,rects:current.lines.filter(l=>l.pageIndex===current.lines[0].pageIndex).map(l=>l.rect)});if(r.year&&r.author&&r.title.length>=8){r.source='PDF 本地分栏解析（需核对）';r.number=current.number;out.push(r);}current=null;};
    for(const page of pages){const lines=this.lines(page.items,page.width,page.pageIndex),bases=new Map();
      for(const l of lines)if(l.y>40&&l.y<page.height-20)bases.set(l.column,Math.min(bases.get(l.column)??Infinity,l.x));
      for(const l of lines){if(l.y<40||l.y>page.height-18)continue;if((l.y>page.height-55||l.y<40)&&headers?.lines?.has(CiteLensCore.doi(l.text)||CiteLensCore.norm(l.text)))continue;
        if(/^(references|bibliography|literature cited|参考文献)\s*$/i.test(l.text)){active=true;continue;}
        if(!active)continue;
        if(/^(appendix|supplement(?:ary material|al figures)|acknowledg(e)?ments|STAR\s*\+?\s*METHODS|Annual Review of|Contents)\b/i.test(l.text)){flush();active=false;continue;}
        if(l.text.length<3||/^\d+$/.test(l.text)||/^(?:A\.|[A-Z]\.\s*)?\s*Bringmann et al\./.test(l.text)||/Prog(?:ress)?\.? (?:in )?Retin/i.test(l.text)&&/\(20\d\d\)/.test(l.text))continue;
        const numbered=l.text.match(/^\[?(\d{1,4})\]?[.)]?\s+(?=[\p{L}])/u);
        const authorStart=this.authorStart(l.text);
        const atMargin=l.x<=(bases.get(l.column)||l.x)+3;
        const unfinishedAuthors=current&&!/\b(?:1[6-9]|20)\d{2}[a-z]?\b/.test(current.lines.map(x=>x.text).join(' '));
        if(atMargin&&(numbered||authorStart)&&!unfinishedAuthors){flush();current={lines:[l],number:numbered?Number(numbered[1]):undefined};}
        else if(current)current.lines.push(l);
      }
    }
    flush();return out;
  },
  merge(native,local) {
    const C=CiteLensCore,out=[];
    for(const r of [...native,...local]){
      const i=out.findIndex(x=>{
        const samePlace=x.position?.pageIndex===r.position?.pageIndex&&Math.abs((x.position?.rects?.[0]?.[0]||0)-(r.position?.rects?.[0]?.[0]||0))<8;
        const a=C.norm(x.raw).replace(/ /g,''),b=C.norm(r.raw).replace(/ /g,'');
        return (!(x.number&&r.number)||x.number===r.number)&&C.identity(x)===C.identity(r)||samePlace&&x.number&&x.number===r.number&&(a.startsWith(b)||b.startsWith(a))||C.norm(x.author)===C.norm(r.author)&&x.year===r.year&&x.suffix===r.suffix&&C.norm(x.title)===C.norm(r.title);
      });
      if(i<0)out.push(r);else if(r.raw.length>out[i].raw.length)out[i]=r;
    }
    return out;
  }
};
if(typeof module!=='undefined')module.exports=CiteLensBibliography;
