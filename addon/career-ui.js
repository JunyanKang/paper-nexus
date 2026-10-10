/* Academic history is a reversible page inside the existing network window. */
var CiteLensCareerUI={
 open(doc,{orcid,name='',host=null,author=null}){
  const U=CiteLensUI,C=CiteLensCareer,win=doc.defaultView;
  host=host||doc.querySelector('.pn-network');if(!host)return null;
  const mount=host.querySelector('.pn-map-stage');if(!mount)return null;
  const existing=mount.querySelector('.pn-career');if(existing){if(existing._careerORCID===orcid){existing.focus();return existing;}existing._clClose(false);}
  let alive=true,request=0,data=null,kind='all',descending=false,shownEvents=24,orderedEvents=[],lastYear=null;
  const paperRecords=new Map(),pending=[];let running=0,visibleObserver,resizeObserver,moreObserver;
  const previous=doc.activeElement,originals=[...mount.children].map(el=>({el,inert:el.inert}));
  const frame=U.el(doc,'section',null,'pn-career'),head=U.el(doc,'header',null,'pn-career-header'),root=U.el(doc,'div',null,'pn-career-body');
  frame.tabIndex=-1;frame.setAttribute('aria-label','学术履历');frame.setAttribute('role','region');
  function close(restore=true){if(!alive)return;alive=false;request++;pending.length=0;visibleObserver?.disconnect();resizeObserver?.disconnect();moreObserver?.disconnect();host.removeEventListener('keydown',escape,true);win.cancelAnimationFrame(branchFrame);frame.remove();delete mount.dataset.career;delete host.dataset.career;delete host._pnCareerClose;for(const x of originals)x.el.inert=x.inert;if(restore&&host.isConnected){try{(previous?.isConnected?previous:host).focus({preventScroll:true});}catch(_){host.focus();}}}
  frame._clClose=close;frame._careerORCID=orcid;host._pnCareerClose=close;mount.dataset.career='true';host.dataset.career='true';for(const x of originals)x.el.inert=true;
  const back=U.iconButton(doc,'返回朋友圈','back',()=>close()),actions=U.el(doc,'div',null,'cl-header-tools'),home=U.iconButton(doc,'打开 ORCID','orcid',()=>Zotero.launchURL('https://orcid.org/'+orcid)),refresh=U.iconButton(doc,'更新信息','retry',()=>load(true));
  actions.append(refresh);head.append(back,actions);frame.append(head,root);mount.append(frame);
  function escape(e){if(e.key==='Escape'){if(e.target.closest?.('.pn-map-search')&&host.querySelector('.pn-search-results')?.hidden===false)return;e.preventDefault();e.stopPropagation();close();}}host.addEventListener('keydown',escape,true);doc._clAbstract?.close(true);frame.focus();
  const hero=U.el(doc,'section',null,'pn-career-hero'),identity=U.el(doc,'div',null,'pn-career-identity'),nameLine=U.el(doc,'div',null,'pn-career-name-line'),title=U.el(doc,'h2',name||orcid),affiliation=U.el(doc,'p',null,'pn-career-affiliation');
  title.dataset.clData='true';affiliation.dataset.clData='true';nameLine.append(title,home);identity.append(nameLine,affiliation);
  if(author&&host._pnEditAuthorORCID){const edit=()=>host._pnEditAuthorORCID(author,()=>{const oid=CiteLensNetwork.authorORCIDOverride(author)?.orcid??(CiteLensNetwork.cachedAuthorORCID(author,new Map((host._pnModel?.paperNodes||[]).map(p=>[p.id,p])))||author.orcid||'');if(oid!==orcid){close(false);if(oid)CiteLensCareerUI.open(doc,{orcid:oid,name:author.title,host,author});}});U.orcidActions(doc,home,edit);const secondary=e=>{e.preventDefault();e.stopImmediatePropagation();edit();};nameLine.addEventListener('contextmenu',secondary);home.addEventListener('click',e=>{if(e.ctrlKey)secondary(e);},true);}
  hero.append(identity);
  const controls=U.el(doc,'div',null,'pn-career-controls'),filters=U.el(doc,'div',null,'pn-career-filters'),order=U.iconButton(doc,'从早到晚','calendar',()=>{descending=!descending;syncOrder();renderTimeline();}),status=U.el(doc,'div','','cl-status pn-career-status'),timeline=U.el(doc,'div',null,'pn-career-timeline');
  status.hidden=true;status.setAttribute('role','status');timeline.tabIndex=0;timeline.setAttribute('aria-label','学术履历');controls.append(filters,order);root.append(hero,controls,status,timeline);
  const labels={all:'全部',education:'教育',employment:'任职',funding:'资助',work:'成果',distinction:'荣誉',membership:'学术团体',service:'学术服务'};
  const t=s=>CiteLensI18n.text(s),datum=(tag,text,cls)=>{const e=U.el(doc,tag,text,cls);e.dataset.clData='true';return e;};
  function syncOrder(){U.setButtonLabel(order,descending?'年份：近到远':'年份：远到近','calendar');order.dataset.direction=descending?'desc':'asc';order.setAttribute('aria-pressed','true');order.append(U.el(doc,'span',descending?'↓':'↑','pn-sort-direction'));}syncOrder();
  function setStatus(message){status.textContent=t(message);status.hidden=!message;}
  const types={'journal-article':'journalArticle','review':'journalArticle','conference-paper':'conferencePaper','preprint':'preprint','book':'book','book-chapter':'bookSection','dissertation':'thesis'};
  const context=host._clReader?U.context(host._clReader):{};
  function schedule(card){pending.push(card);pump();}
  function pump(){while(alive&&running<2&&pending.length){const card=pending.shift();if(!card.isConnected)continue;running++;card._hydrate().catch(()=>{}).finally(()=>{running--;pump();});}}
  visibleObserver=new win.IntersectionObserver(entries=>{for(const e of entries){if(e.isIntersecting){visibleObserver.unobserve(e.target);schedule(e.target);}}},{root:timeline,rootMargin:'60px 0px'});
  moreObserver=new win.IntersectionObserver(entries=>{if(alive&&entries.some(e=>e.isIntersecting))appendEvents();},{root:timeline,rootMargin:'240px 0px'});
  resizeObserver=new win.ResizeObserver(()=>{U.fitAuthors(timeline,doc);scheduleBranches();});resizeObserver.observe(timeline);
  let branchFrame=0;
  function scheduleBranches(){if(branchFrame||!alive)return;branchFrame=win.requestAnimationFrame(()=>{branchFrame=0;if(!alive||!timeline.clientWidth)return;
   const years=new Map();for(const mark of timeline.querySelectorAll('.pn-career-year-mark[data-repeat=false]'))years.set(mark.dataset.year,mark);
   for(const row of timeline.querySelectorAll('.pn-career-year')){
    let svg=row.querySelector('.pn-career-branches');if(!svg){svg=doc.createElementNS('http://www.w3.org/2000/svg','svg');svg.classList.add('pn-career-branches');svg.setAttribute('aria-hidden','true');row.prepend(svg);}svg.setAttribute('viewBox',`0 0 ${row.clientWidth} ${row.offsetHeight}`);svg.replaceChildren();
    for(const card of row.querySelectorAll('.pn-career-event')){const side=card.dataset.side,mark=years.get(card.dataset.year);if(!mark)continue;const axis=mark.parentElement,origin=axis.parentElement,sign=side==='left'?-1:1,sx=axis.offsetLeft+mark.offsetLeft+sign*mark.offsetWidth/2,sy=origin.offsetTop-row.offsetTop+mark.offsetTop+mark.offsetHeight/2,ex=side==='left'?card.offsetLeft+card.offsetWidth:card.offsetLeft,ey=card.offsetTop+20,span=Math.abs(ex-sx),lane=sx+sign*span*.5,bend=Math.min(6,span*.22),group=doc.createElementNS(svg.namespaceURI,'g');group.dataset.side=side;group.dataset.year=card.dataset.year;group.style.color=win.getComputedStyle(card).getPropertyValue('--pn-event-color');
      const ribbon=doc.createElementNS(svg.namespaceURI,'path');ribbon.setAttribute('d',`M${lane} ${ey-.5} Q${ex-sign*6} ${ey-4} ${ex} ${ey-4} L${ex} ${ey+4} Q${ex-sign*6} ${ey+4} ${lane} ${ey+.5} Z`);ribbon.setAttribute('class','pn-career-branch-ribbon');
      const line=doc.createElementNS(svg.namespaceURI,'path'),dy=ey-sy;line.setAttribute('d',Math.abs(dy)<bend*2?`M${sx} ${sy} C${lane} ${sy} ${lane} ${ey} ${ex} ${ey}`:`M${sx} ${sy} H${lane-sign*bend} Q${lane} ${sy} ${lane} ${sy+Math.sign(dy)*bend} V${ey-Math.sign(dy)*bend} Q${lane} ${ey} ${lane+sign*bend} ${ey} H${ex}`);line.setAttribute('class','pn-career-branch-line');group.append(ribbon,line);svg.append(group);
    }
   }
  });}
  function paperFooter(card,event){
   const S=CiteLensServices,Core=CiteLensCore,key=event.id;let entry=paperRecords.get(key)||U.resolved({title:event.title,DOI:event.DOI,year:event.year?String(event.year):'',journal:event.journal||'',url:event.url,type:types[event.workType]||'document'}),located=[],hydrated=false,flight=null;
   const line=U.el(doc,'div',null,'pn-career-publication'),meta=U.el(doc,'span',null,'cl-journal-name'),text=datum('span','','cl-journal-text'),tools=U.el(doc,'div',null,'pn-career-paper-tools');meta.append(text);tools.setAttribute('aria-label','文献操作');line.append(meta,tools);card.append(line);
   const paint=()=>{paperRecords.set(key,entry);CiteLensCitationFormat.bind(text,entry,{onText:()=>{if(card.isConnected)U.fitAuthors(card,doc);}});doi.hidden=!Core.recordDOI(entry);U.setButtonLabel(save,located.length?'打开 Zotero 条目':'保存到 Zotero',located.length?'open':'save');U.setButtonLabel(later,U.queued(entry)?'已在清单':'稍后读',U.queued(entry)?'bookmarked':'bookmark');later.setAttribute('aria-pressed',String(!!U.queued(entry)));if(card.isConnected)win.requestAnimationFrame(()=>{if(alive&&card.isConnected)U.fitAuthors(card,doc);});};
   const presence=async()=>{located=await S.locate(entry);if(located.length===1){const item=located[0].item;entry.verified=true;for(const [field,k] of [['publicationTitle','journal'],['volume','volume'],['issue','issue'],['pages','pages'],['publisher','publisher'],['DOI','DOI']]){const value=item.getField(field);if(!entry[k]&&value)entry[k]=value;}if(!entry.creators?.length)entry.creators=item.getCreators().filter(c=>Zotero.CreatorTypes.getName(c.creatorTypeID)==='author').map(c=>({firstName:c.firstName,lastName:c.lastName,creatorType:'author'}));}if(card.isConnected)paint();return located;};
   const hydrate=()=>flight||(flight=(async()=>{await presence();if(!alive||!card.isConnected)return;entry=await S.publicationMetadata(entry,{complete:true});hydrated=true;if(alive&&card.isConnected)paint();})().finally(()=>{flight=null;}));
   const prepare=async()=>{if(!hydrated)await hydrate().catch(()=>{});return entry;};
   const doi=U.iconButton(doc,'打开 DOI','doi',()=>Zotero.launchURL('https://doi.org/'+Core.recordDOI(entry)));
   const save=U.iconButton(doc,'保存到 Zotero','save',async b=>{b.disabled=true;try{await presence();if(located.length===1)await U.openLibraryItem(doc,located[0].item);else if(located.length)U.existingDialog(doc,located);else{await prepare();if(alive)U.saveDialog(doc,entry,context,()=>presence());}}finally{b.disabled=false;}});
   const later=U.iconButton(doc,'稍后读','bookmark',async b=>{b.disabled=true;try{await prepare();await S.enqueue(entry,context);paint();}finally{b.disabled=false;}});
   const copy=U.iconButton(doc,'复制引文','copy',async b=>{b.disabled=true;try{const record=await prepare();Zotero.Utilities.Internal.copyTextToClipboard(await CiteLensCitationFormat.format(record));U.setButtonLabel(b,'已复制引用','copy');}finally{b.disabled=false;}});
   tools.append(doi,save,later,copy);paint();card._hydrate=hydrate;visibleObserver.observe(card);
  }
  function eventCard(event){
   const card=U.el(doc,'article',null,'pn-career-event');card.dataset.kind=event.kind;
   const date=event.start?.label||(event.endOnly?t('结束于')+' '+event.end.label:t('未注明时间')),period=event.start&&event.end?date+' — '+event.end.label:date;
   const top=U.el(doc,'div',null,'pn-career-event-top'),title=datum('h3',event.title),when=datum('time',period);
   const glyphs={education:'M2 8l10-5 10 5-10 5L2 8m4 3v6c4 3 8 3 12 0v-6M22 8v8',employment:'M3 7h18v14H3V7m5 0V3h8v4M3 12h18m-9-2v5',work:'M5 3h10l4 4v14H5V3m10 0v5h4M8 12h8m-8 4h6',funding:'M4 6h16v14H4V6m4 0V3h8v3M8 11h8m-4-2v8',distinction:'M12 2l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1 3-6',membership:'M8 11a4 4 0 1 1 8 0m-13 10v-3c0-7 18-7 18 0v3',service:'M5 3h14v18H5V3m3 5 2 2 5-5M8 15h8'};const svg=doc.createElementNS('http://www.w3.org/2000/svg','svg'),path=doc.createElementNS(svg.namespaceURI,'path');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');svg.classList.add('pn-career-kind-icon');path.setAttribute('d',glyphs[event.kind]||glyphs.work);svg.append(path);title.prepend(svg);
   top.append(title);if(event.kind!=='work')top.append(when);card.append(top);
   if(event.kind==='work'){paperFooter(card,event);return card;}
   const detail=[event.organization!==event.title?event.organization:'',event.department,event.journal].filter(Boolean).join('; ');
   if(detail)card.append(datum('p',detail,'pn-career-event-meta'));return card;
  }
  const sentinel=U.el(doc,'div',null,'pn-career-sentinel');sentinel.setAttribute('aria-hidden','true');
  function appendEvents(){
   if(!alive||shownEvents>=orderedEvents.length)return;
   const start=shownEvents,end=Math.min(start+24,orderedEvents.length),fragment=doc.createDocumentFragment();
   for(let i=start;i<end;i+=2){
    const pair=orderedEvents.slice(i,Math.min(i+2,end)),row=U.el(doc,'section',null,'pn-career-year'),axis=U.el(doc,'div',null,'pn-career-axis');row.dataset.year=pair[0].year||0;row.dataset.sameYear=String(pair.length===2&&pair[0].year===pair[1].year);row.append(axis);
    for(let j=0;j<pair.length;j++){
     const event=pair[j],side=j?'right':'left',card=eventCard(event);card.dataset.side=side;card.dataset.year=event.year||0;row.append(card);
     const year=event.year||0,same=j&&year===(pair[0].year||0);if(same)continue;
     const marker=datum('span',lastYear===year?'':String(year||t('未注明')),'pn-career-year-mark');marker.dataset.side=side;marker.dataset.year=year;marker.dataset.repeat=String(lastYear===year);marker.setAttribute('aria-hidden','true');axis.append(marker);lastYear=year;
    }fragment.append(row);
   }
   timeline.insertBefore(fragment,sentinel);for(const row of timeline.querySelectorAll('.pn-career-year'))resizeObserver.observe(row);scheduleBranches();shownEvents=end;moreObserver.disconnect();if(shownEvents<orderedEvents.length)moreObserver.observe(sentinel);
  }
  function renderTimeline({preserve=false}={}){
   visibleObserver.disconnect();moreObserver.disconnect();pending.length=0;const scroll=timeline.scrollTop,previousCount=shownEvents,grouped=C.groups(data.events,{kind,descending});orderedEvents=grouped.flatMap(g=>g.events);
   resizeObserver.disconnect();resizeObserver.observe(timeline);frame.dataset.density=orderedEvents.length<=6?'sparse':'full';timeline.replaceChildren();order.hidden=orderedEvents.length<2;shownEvents=0;lastYear=null;
   if(!orderedEvents.length){timeline.append(U.stateScene(doc,{kind:'authors',title:data.partial?'履历暂不可用':'尚无公开履历',detail:'可前往 ORCID 查看个人主页',busy:false}));return;}
   timeline.append(sentinel);do{appendEvents();}while(preserve&&shownEvents<Math.min(previousCount,orderedEvents.length));timeline.scrollTop=preserve?scroll:0;
  }

  function render({preserve=false}={}){
   const profile=data.profile,displayName=profile.name||name||orcid;title.textContent=displayName;const latest=data.events.filter(e=>e.kind==='employment').sort((a,b)=>(b.start?.sort||b.end?.sort||0)-(a.start?.sort||a.end?.sort||0))[0];affiliation.textContent=latest?[latest.title,latest.organization!==latest.title?latest.organization:''].filter(Boolean).join(' · '):'';affiliation.hidden=!latest;
   const counts=new Map();for(const e of data.events)counts.set(e.kind,(counts.get(e.kind)||0)+1);if(kind!=='all'&&!counts.has(kind))kind='all';
   filters.replaceChildren();for(const key of ['all',...Object.keys(labels).filter(k=>k!=='all'&&counts.has(k))]){const b=U.quiet(doc,labels[key],()=>{kind=key;shownEvents=24,orderedEvents=[],lastYear=null;for(const x of filters.children)x.setAttribute('aria-pressed',String(x===b));renderTimeline();});b.append(U.el(doc,'span',String(key==='all'?data.events.length:counts.get(key))));b.dataset.kind=key;b.setAttribute('aria-pressed',String(kind===key));filters.append(b);}filters.hidden=counts.size<2;
   setStatus(data.stale?'连接暂不可用，显示已保存履历':data.partial?'部分公开资料暂不可用':'');renderTimeline({preserve});
  }
  async function load(force=false){const ticket=++request;refresh.disabled=true;refresh.setAttribute('aria-busy','true');if(data)setStatus('');else{hero.hidden=true;controls.hidden=true;timeline.replaceChildren(U.stateScene(doc,{kind:'authors',title:'正在展开学术履历',detail:'整理公开经历与研究成果',busy:true}));}
   try{const next=await C.load(orcid,{force});if(!alive||ticket!==request)return;data={...next,events:next.events.filter(e=>Object.hasOwn(labels,e.kind)&&e.kind!=='all')};hero.hidden=false;controls.hidden=false;render({preserve:force});}
   catch(e){if(!alive||ticket!==request)return;setStatus(e.message);if(!data){hero.hidden=false;title.textContent=name||orcid;timeline.replaceChildren(U.stateScene(doc,{kind:'authors',title:'履历暂不可用',detail:'可重试，或打开 ORCID 主页',busy:false}));}}
   finally{if(alive&&ticket===request){refresh.disabled=false;refresh.removeAttribute('aria-busy');}}
  }
  frame._careerLoad=load;load();return frame;
 }
};
