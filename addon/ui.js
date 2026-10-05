var CiteLensUI = {
  sequence:0,
  el(doc,tag,text,className) {
    const e=doc.createElement(tag);
    if(text!==undefined&&text!==null)e.textContent=text;
    if(className)e.className=className;
    // Reader arrow navigation respects explicit editing boundaries.
    if(className&&/(?:^| )(?:cl-root|cl-dialog|cl-card)(?: |$)/.test(className))e.setAttribute('contenteditable','false');
    return e;
  },
  logo(doc,size=26) {const img=this.el(doc,'img',null,'pn-logo');img.src=CiteLens.assetURI+'nexus.png';img.alt='';img.width=size;img.height=size;return img;},
  title(doc,record,tag='div') {
    const text=record.title||record.raw||'',markup=record.titleMarkup&&CiteLensCore.plainTitle(record.titleMarkup)===CiteLensCore.plainTitle(text)?record.titleMarkup:text,node=this.el(doc,tag,null,'cl-title');
    for(const part of CiteLensCore.titleParts(markup)){let parent=node;for(const style of part.styles){const child=doc.createElement(style);parent.append(child);parent=child;}parent.append(doc.createTextNode(part.text));}
    return node;
  },
  button(doc,text,run,primary=false) {
    const b=this.el(doc,'button',text,primary?'cl-primary':'');b.type='button';
    b.addEventListener('click',async e=>{
      e.preventDefault();e.stopPropagation();if(b.disabled)return;if(!b.closest('.cl-summary'))doc._clAbstract?.close();
      try{await run(b);}catch(error){
        Zotero.logError(error);
        const status=b.closest('.cl-card,.cl-dialog,.cl-root')?.querySelector('.cl-status');
        if(status)this.status(status,error.message||String(error),true);
        else Zotero.getMainWindow().alert(error.message||String(error));
      }
    });return b;
  },
  quiet(doc,text,run) {const b=this.button(doc,text,run);b.className='cl-quiet';return b;},
  iconButton(doc,label,icon,run) {const b=this.button(doc,'',run);b.classList.add('cl-icon-button');this.setButtonLabel(b,label,icon);return b;},
  setButtonLabel(button,label,icon=button.dataset.icon) {
    const doc=button.ownerDocument;button.replaceChildren();button.title=label;button.setAttribute('aria-label',label);button.dataset.icon=icon;
    const paths={save:'M12 3v12m-4-4 4 4 4-4M4 15v5h16v-5',open:'M14 3h7v7m0-7L10 14M10 5H4v15h15v-6',bookmark:'M6 3h12v18l-6-4-6 4V3',bookmarked:'M6 3h12v18l-6-4-6 4V3m3 6 2 2 4-4',more:'M5 12h.01M12 12h.01M19 12h.01',translate:'M2 5h13M8 2v3m4 0c-1 6-4 9-9 12m1-9c2 4 5 6 8 7m1 6 5-13 5 13m-8-4h6',original:'M14 2H5v20h14V7l-5-5v5h5M8 12h8m-8 4h8',retry:'M20 7v5h-5M4 17v-5h5M6 6a8 8 0 0 1 14 6M4 12a8 8 0 0 0 14 6'};
    const svg=doc.createElementNS('http://www.w3.org/2000/svg','svg'),path=doc.createElementNS(svg.namespaceURI,'path');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width',icon==='more'?'3':'1.7');svg.setAttribute('stroke-linecap','round');svg.setAttribute('stroke-linejoin','round');path.setAttribute('d',paths[icon]||paths.more);svg.append(path);button.append(svg,this.el(doc,'span',label,'cl-action-label'));
  },
  actionMenu(doc,owner) {
    if(owner._menu){owner._menu._close();return;}
    const menu=this.el(doc,'div',null,'cl-menu');menu.setAttribute('popover','auto');menu.setAttribute('role','menu');menu.setAttribute('aria-label','文献操作');menu.id='cl-menu-'+(++this.sequence);
    owner._menu=menu;owner.append(menu);let closed=false;const cleanups=[];
    const close=(focus=true)=>{if(closed)return;closed=true;for(const clean of cleanups)clean();if(menu.matches(':popover-open'))menu.hidePopover();menu.remove();delete owner._menu;const anchor=owner.querySelector('.cl-more');anchor?.setAttribute('aria-expanded','false');if(focus&&anchor?.isConnected)anchor.focus();};menu._close=close;
    for(const [label,run] of [['更新信息',()=>owner._lookup.click()],['另存文献',()=>owner._save()],['复制引用',()=>owner._copy()],['偏好设置',()=>this.settingsDialog(doc)]]){
      const b=this.button(doc,label,()=>{close();return run();});b.setAttribute('role','menuitem');menu.append(b);
    }
    const activate=button=>{for(const item of menu.children)item.dataset.active=String(item===button);};
    const focusItem=item=>{activate(item);item.focus({preventScroll:true});};
    menu.addEventListener('focus',e=>activate(e.target.closest('[role=menuitem]')),true);
    const point=e=>{const item=e.target.closest('[role=menuitem]');if(item)focusItem(item);};
    menu.addEventListener('pointermove',point);menu.addEventListener('mousemove',point);
    menu.addEventListener('toggle',e=>{if(e.newState==='closed')close(false);});
    // PDF content lives in a child document; native popover light-dismiss does not cross that boundary.
    const outside=e=>{if(!menu.contains(e.target)&&!owner.querySelector('.cl-more')?.contains(e.target))close(false);};
    const documents=new Set([doc]);for(const frame of doc.querySelectorAll('iframe'))try{if(frame.contentDocument)documents.add(frame.contentDocument);}catch(_){}
    try{if(doc.defaultView.frameElement?.ownerDocument)documents.add(doc.defaultView.frameElement.ownerDocument);}catch(_){}
    for(const surface of documents){surface.addEventListener('pointerdown',outside,true);surface.addEventListener('mousedown',outside,true);cleanups.push(()=>{surface.removeEventListener('pointerdown',outside,true);surface.removeEventListener('mousedown',outside,true);});}
    const observer=new doc.defaultView.MutationObserver(()=>{if(!menu.isConnected)close(false);});observer.observe(doc.body,{childList:true,subtree:true});cleanups.push(()=>observer.disconnect());
    menu.addEventListener('keydown',e=>{
      const buttons=[...menu.querySelectorAll('button')],index=buttons.indexOf(e.target);
      if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();e.stopPropagation();focusItem(buttons[e.key==='Home'?0:e.key==='End'?buttons.length-1:(index+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]);}
      else if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();}
      else if(e.key==='Tab'){e.preventDefault();e.stopPropagation();close();const available=this.focusables(owner),i=available.indexOf(owner.querySelector('.cl-more'));available[i+(e.shiftKey?-1:1)]?.focus();}
    });
    const anchor=owner.querySelector('.cl-more');anchor.setAttribute('aria-expanded','true');anchor.setAttribute('aria-controls',menu.id);menu.showPopover();this.positionMenu(menu,doc);focusItem(menu.firstElementChild);
  },
  positionMenu(menu,doc) {
    if(!menu?.isConnected||!menu.matches(':popover-open'))return;
    const anchor=menu.parentElement.querySelector('.cl-more')?.getBoundingClientRect();if(!anchor)return;
    menu.style.left=Math.max(8,Math.min(anchor.right-menu.offsetWidth,doc.defaultView.innerWidth-menu.offsetWidth-8))+'px';
    menu.style.top=Math.max(8,Math.min(anchor.bottom+5,doc.defaultView.innerHeight-menu.offsetHeight-8))+'px';
  },
  bindAbstract(doc,card,title,getRecord) {
    const win=doc.defaultView;let timer;
    title.removeAttribute('title');title.tabIndex=0;title.setAttribute('role','button');title.setAttribute('aria-label',title.textContent+'；查看文献摘要');title.setAttribute('aria-expanded','false');
    const open=()=>{win.clearTimeout(timer);if(title.isConnected)this.abstractPopover(doc,card,title,getRecord);};
    title.addEventListener('pointerenter',()=>{win.clearTimeout(timer);timer=win.setTimeout(open,320);});
    title.addEventListener('pointerleave',()=>win.clearTimeout(timer));
    title.addEventListener('focus',()=>{if(Date.now()<(title._clSummaryDismissed||0))return;timer=win.setTimeout(open,320);});
    title.addEventListener('blur',()=>win.clearTimeout(timer));
    title.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();open();});
    title.addEventListener('keydown',e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();e.stopPropagation();open();}});
  },
  abstractPopover(doc,card,title,getRecord) {
    if(doc._clAbstract?.title===title)return;
    doc._clAbstract?.close(true);doc._clClosingAbstract?.();
    const win=doc.defaultView,host=card.closest('.cl-native-host,.cl-floating')||card,record={...getRecord()},key=CiteLensCore.identity(record);
    const panel=this.el(doc,'aside',null,'cl-summary'),body=this.el(doc,'div',null,'cl-summary-body'),content=this.el(doc,'div','正在读取摘要…','cl-summary-content'),source=this.el(doc,'div',null,'cl-summary-source');
    let closed=false,closeTimer,inline=false,loading=false,abstractResult=null,translationTicket=0,translationView=false,keyboardHeld=title.matches(':focus-visible'),animation;const cleanups=[];
    content.lang='en';panel.dataset.citeLens='summary';panel.id='cl-summary-'+(++this.sequence);panel.setAttribute('aria-label','文献摘要');panel.setAttribute('role','region');panel.setAttribute('popover','manual');body.setAttribute('aria-live','polite');
    const animate=(opening)=>{animation?.cancel();if(win.matchMedia('(prefers-reduced-motion: reduce)').matches)return null;
      const offset=inline?'translateY(-5px)':'scaleX(.97)';
      return panel.animate(opening?[{opacity:0,transform:offset},{opacity:1,transform:'none'}]:[{opacity:1,transform:'none'},{opacity:0,transform:offset}],{duration:opening?180:140,easing:'cubic-bezier(.2,.75,.25,1)',fill:'both'});
    };
    const finish=()=>{animation?.cancel();if(panel.matches(':popover-open'))panel.hidePopover();panel.remove();if(doc._clClosingAbstract===finish)delete doc._clClosingAbstract;};
    const close=(immediate=false)=>{if(closed){if(immediate)finish();return;}closed=true;win.clearTimeout(closeTimer);for(const fn of cleanups)fn();delete host.dataset.summarySide;title.setAttribute('aria-expanded','false');title.removeAttribute('aria-controls');if(doc._clAbstract?.title===title)delete doc._clAbstract;
      if(immediate||!panel.isConnected){finish();return;}panel.dataset.closing='true';doc._clClosingAbstract=finish;animation=animate(false);if(animation)animation.finished.then(finish,()=>{});else finish();
    };
    const cancel=()=>win.clearTimeout(closeTimer),later=()=>{cancel();closeTimer=win.setTimeout(()=>{if(!panel.matches(':hover')&&!title.matches(':hover')&&!(keyboardHeld&&(panel.contains(doc.activeElement)||doc.activeElement===title)))close();},300);};
    const position=()=>{if(closed)return;if(!title.isConnected||!host.isConnected){close(true);return;}const p=CiteLensAbstracts.placement(host.getBoundingClientRect(),{width:win.innerWidth,height:win.innerHeight},card.getBoundingClientRect().top,panel.offsetHeight||280);
      host.dataset.summarySide=p.side;panel.dataset.side=p.side;
      if(p.side==='inline'){if(!inline){animation?.cancel();if(panel.matches(':popover-open'))panel.hidePopover();panel.removeAttribute('popover');panel.classList.add('cl-summary-inline');card.append(panel);inline=true;}panel.removeAttribute('style');this.fitPopup(host,doc);}
      else{if(inline){animation?.cancel();panel.setAttribute('popover','manual');panel.classList.remove('cl-summary-inline');inline=false;}panel.style.cssText=`left:${p.left}px;top:${p.top}px;width:${p.width}px;max-height:${p.maxHeight}px`;if(!panel.matches(':popover-open'))panel.showPopover();}
    };
    const retry=this.button(doc,'重新加载',()=>{cancel();return load(true);});retry.classList.add('cl-summary-retry');retry.hidden=true;
    const tools=this.el(doc,'div',null,'cl-summary-tools'),translate=this.iconButton(doc,'翻译摘要','translate',()=>translateAbstract()),translationStatus=this.el(doc,'span','','cl-action-label');translate.hidden=true;translate.classList.add('cl-translate');translate.setAttribute('aria-pressed','false');translationStatus.setAttribute('role','status');tools.append(source,translationStatus,translate);body.append(content,retry);panel.append(body,tools);card.append(panel);doc._clAbstract={title,close,position};title.setAttribute('aria-expanded','true');title.setAttribute('aria-controls',panel.id);position();animation=animate(true);
    // Keep controls and selection inside the preview from activating reader-level pointer handlers.
    for(const type of ['pointerdown','mousedown'])panel.addEventListener(type,e=>{keyboardHeld=false;cancel();e.stopPropagation();});
    panel.addEventListener('keydown',()=>{keyboardHeld=true;});
    for(const el of [title,panel]){el.addEventListener('pointerenter',cancel);el.addEventListener('pointerleave',later);cleanups.push(()=>{el.removeEventListener('pointerenter',cancel);el.removeEventListener('pointerleave',later);});}
    const outside=e=>{if(!card.contains(e.target)&&!panel.contains(e.target))close();},escape=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();title._clSummaryDismissed=Date.now()+600;close();title.focus({preventScroll:true});}},scroll=e=>{if(!panel.contains(e.target))position();};
    const surfaces=new Set([doc]);for(const frame of doc.querySelectorAll('iframe'))try{if(frame.contentDocument)surfaces.add(frame.contentDocument);}catch(_){}
    for(const surface of surfaces){surface.addEventListener('pointerdown',outside,true);cleanups.push(()=>surface.removeEventListener('pointerdown',outside,true));}
    doc.addEventListener('keydown',escape,true);doc.addEventListener('scroll',scroll,true);win.addEventListener('resize',position);
    cleanups.push(()=>{doc.removeEventListener('keydown',escape,true);doc.removeEventListener('scroll',scroll,true);win.removeEventListener('resize',position);});
    const observer=new win.MutationObserver(()=>{if(!title.isConnected||!panel.isConnected)close(true);});observer.observe(doc.body,{childList:true,subtree:true});cleanups.push(()=>observer.disconnect());
    let requestTicket=0;
    const load=async(force=false)=>{const ticket=++requestTicket;loading=true;translationTicket++;abstractResult=null;translationView=false;translate.hidden=true;translationStatus.textContent='';cancel();retry.disabled=true;body.style.minHeight=Math.min(body.clientHeight,180)+'px';content.textContent='正在读取摘要…';body.setAttribute('aria-busy','true');source.replaceChildren();position();
      let result;try{result=await CiteLensAbstracts.lookup(CiteLensServices,record,{force});}catch(_){result={status:'offline'};}
      if(closed||ticket!==requestTicket||!title.isConnected||CiteLensCore.identity(getRecord())!==key)return;
      loading=false;abstractResult=result;translate.hidden=result.status!=='available';body.setAttribute('aria-busy','false');body.style.minHeight='';retry.disabled=false;retry.hidden=result.status==='available';
      if(retry.hidden&&doc.activeElement===retry){panel.tabIndex=-1;panel.focus({preventScroll:true});}
      content.textContent=result.status==='available'?result.text:result.status==='offline'?'暂时无法连接摘要服务，请重试。':'公开来源暂未返回可匹配的摘要。';
      if(result.status==='available'){
        content.replaceChildren();for(const part of result.text.split(/\n\s*\n/).filter(Boolean)){const p=this.el(doc,'p',part);if(/^(purpose|background|objective[s]?|method[s]?|result[s]?|conclusion[s]?|significance|design|setting|participants|intervention[s]?|measurement[s]?|interpretation|funding|摘要|目的|方法|结果|结论)$/i.test(part.trim()))p.className='cl-summary-section';content.append(p);}
        const facts=[...(result.record?.publicationTypes||[]).filter(x=>!/^journal article|research support/i.test(x)),...(result.record?.keywords||[])].slice(0,6);
        if(facts.length){const details=this.el(doc,'details',null,'cl-summary-facts');details.append(this.el(doc,'summary','研究类型与关键词'),this.el(doc,'p',facts.join(' · ')));content.append(details);}
        const links=[];
        if(/^https:\/\/(?:doi\.org|europepmc\.org|pubmed\.ncbi\.nlm\.nih\.gov|pmc\.ncbi\.nlm\.nih\.gov)\//.test(result.url))links.push([result.source,result.url]);
        const ids=CiteLensAuthors.ids(result.record||{});if(ids.PMID&&result.source!=='PubMed')links.push(['PubMed','https://pubmed.ncbi.nlm.nih.gov/'+ids.PMID+'/']);if(ids.PMCID&&result.source!=='PMC')links.push(['PMC 全文','https://pmc.ncbi.nlm.nih.gov/articles/'+ids.PMCID+'/']);
        for(const [label,url] of links){const link=this.el(doc,'a',label+' ↗');link.href=url;link.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();Zotero.launchURL(url);});source.append(link);}if(!links.length)source.textContent=result.source;
      }position();
    };
    const showText=text=>{content.replaceChildren();for(const part of text.split(/\n\s*\n/).filter(Boolean))content.append(this.el(doc,'p',part));position();};
    const translateAbstract=async()=>{
      if(!abstractResult?.text)return;
      if(translationView){translationTicket++;translationView=false;this.setButtonLabel(translate,'翻译摘要','translate');translate.setAttribute('aria-pressed','false');delete translate.dataset.loading;translationStatus.textContent='';showText(abstractResult.text);content.lang='en';content.removeAttribute('aria-label');return;}
      const T=CiteLensTranslation,ticket=++translationTicket;body.style.minHeight=Math.min(body.clientHeight,160)+'px';translationView=true;this.setButtonLabel(translate,'查看原文','original');translate.setAttribute('aria-pressed','true');translate.dataset.loading='true';delete translate.dataset.error;translationStatus.textContent='正在翻译';content.lang=T.get('translationTarget','zh-Hans');
      const current=()=>!closed&&panel.isConnected&&ticket===translationTicket;
      try{const result=await T.abstract(abstractResult.text,{cancelled:()=>!current(),onPartial:text=>{if(current())showText(text);}});if(!current())return;showText(result.text);delete translate.dataset.loading;translationStatus.textContent='译文已显示';translate.title='查看原文 · '+result.source;content.setAttribute('aria-label','机器翻译');}
      catch(error){if(!current())return;translationView=false;showText(abstractResult.text);content.lang='en';content.removeAttribute('aria-label');delete translate.dataset.loading;translate.dataset.error='true';translate.setAttribute('aria-pressed','false');this.setButtonLabel(translate,'重试翻译','retry');translationStatus.textContent=error.message;translate.title='重试翻译 · '+error.message;}
    };load();
  },
  style(doc) {
    if(!doc.getElementById('cite-lens-style')){const s=this.el(doc,'style',CiteLensStyle);s.id='cite-lens-style';(doc.head||doc.documentElement).append(s);}
    else if(doc.getElementById('cite-lens-style').textContent!==CiteLensStyle)doc.getElementById('cite-lens-style').textContent=CiteLensStyle;
    this.appearance(doc);
  },
  appearance(doc) {
    const s=CiteLensServices.state.settings,html=doc.documentElement;
    CiteLensThemes.apply(doc);
    html.style.setProperty('--cl-size',Math.max(12,Math.min(16,Number(s.fontSize)||13))+'px');html.style.setProperty('--cl-user-size',Math.max(12,Math.min(16,Number(s.fontSize)||13))+'px');
    const font=s.readingFont==='serif'?'Georgia,"Songti SC",serif':s.readingFont&&s.readingFont!=='system'?JSON.stringify(s.readingFont)+',sans-serif':'-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif';
    html.style.setProperty('--cl-reading-font',font);
  },
  status(node,text,error=false) {node.textContent=text;node.className='cl-status'+(error?' cl-error':'');node.title=text;node.setAttribute('role','status');node.setAttribute('aria-live','polite');},
  context(reader,pageIndex=null) {const attachment=Zotero.Items.get(reader.itemID),parent=attachment?.parentItem;return {parentID:parent?.id,sourceTitle:parent?.getField('title')||attachment?.getField('title'),attachmentKey:attachment?.key,pageIndex};},
  type(record) {return {book:'书籍',bookSection:'书籍章节',conferencePaper:'会议论文',preprint:'预印本',thesis:'学位论文'}[record.type]||'期刊论文';},
  byline(record) {
    const names=(record.creators||[]).map(a=>a.lastName).filter(Boolean);
    return [names.length>2?names.slice(0,2).join(', ')+' et al.':names.join(' & ')||record.author||'作者待核对',record.year||'年份待核对'].join(' · ');
  },
  queued(record) {const C=CiteLensCore;return CiteLensServices.state.queue.find(x=>x.status!=='saved'&&(x.key===C.identity(record)||record.raw&&C.norm(x.record.raw)===C.norm(record.raw)));},
  authorList(doc,authors,{incomplete=false}={}) {
    const row=this.el(doc,'div',null,'cl-byline cl-authors');row.setAttribute('aria-label','作者列表');
    for(const slot of CiteLensAuthors.visible(authors)){
      const cell=this.el(doc,'span',null,'cl-author-slot'),label=this.el(doc,'span',CiteLensAuthors.shortName(slot.author),'cl-author-name');
      cell.dataset.authorIndex=String(slot.index);cell.title=CiteLensAuthors.name(slot.author)||'姓名未提供';label.dataset.surname=slot.author.lastName||label.textContent;cell.append(label);
      if(slot.gapAfter){const gap=this.el(doc,'span','…','cl-author-gap');gap.setAttribute('aria-label',`省略中间 ${slot.omitted} 位作者`);cell.append(gap);}
      row.append(cell);
    }
    if(incomplete&&authors.length){const tail=this.el(doc,'span','…','cl-author-gap');tail.title='原始书目省略了部分作者，完整名单待获取';row.lastElementChild.append(tail);}
    return row;
  },
  fitAuthors(root,doc) {
    for(const row of root.querySelectorAll('.cl-authors')){
      if(!row.isConnected||!row.clientWidth)continue;
      const labels=[...row.querySelectorAll('.cl-author-name')],fits=()=>labels.every(x=>x.scrollWidth<=x.clientWidth+1);
      let size=parseFloat(doc.defaultView.getComputedStyle(row).fontSize),minimum=Math.max(10,size-2);
      while(!fits()&&size>minimum){size-=.5;row.style.fontSize=size+'px';}
      // Long names still get six positions; full names remain in the tooltip/details.
      if(!fits())for(const label of labels)label.textContent=label.dataset.surname;
    }
  },
  metricSource(metric) {return metric.provider==='greenfrog'?'本地文献指标':metric.provider==='style'?'本地期刊指标':metric.provider==='easypubmed'?'离线期刊指标':metric.source||'自备指标';},
  metric(doc,record,detailed=false) {
    const S=CiteLensServices,m=S.metricFor(record),box=this.el(doc,'div',null,'cl-metrics');
    if(m.status!=='available'){box.textContent=m.status==='not-applicable'?m.label:`JCR — · JIF — · ${m.status==='ambiguous'?'匹配歧义':S.state.settings.metricYear?S.state.settings.metricYear+' 年未提供':S.state.metrics.length||S.epIndex&&S.state.settings.easyPubMedEnabled!==false?'未匹配期刊':'未启用指标'}`;box.title=m.label;if(!detailed&&m.status!=='not-applicable')box.append(this.quiet(doc,'设置',()=>this.settingsDialog(doc,'metrics')));return box;}
    if(m.jif!==null||detailed)box.append(this.el(doc,'strong',`IF ${m.jif===null?'未提供':m.jif}`));
    if(detailed)box.append(this.el(doc,'span',m.metricYear?String(m.metricYear):'年份未标注'));
    if(detailed&&m.jci!==undefined&&m.jci!==null)box.append(this.el(doc,'span','JCI '+m.jci,'cl-chip'));
    const quartiles=[...new Set(m.categories.map(c=>c.quartile).filter(q=>/^Q[1-4]$/.test(q)))].sort();
    if(quartiles.length||detailed)box.append(this.el(doc,'span',(detailed?'JCR ':'')+(quartiles[0]||'未提供'),'cl-chip'));
    if(detailed&&m.categories.length>1)box.append(this.el(doc,'span',m.provider==='greenfrog'||m.provider==='style'?`${m.categories.length} 项分区`:`${m.categories.length} 个学科`));
    if(detailed&&m.alternatives?.length)box.append(this.el(doc,'span','来源有差异','cl-muted'));
    box.title=`${m.metricYear?m.metricYear+' 指标年':'年份未标注'}${m.jci!==undefined&&m.jci!==null?' · JCI '+m.jci:''}\n${quartiles.length>1?'显示最佳学科分区 '+quartiles[0]:'JCR 分区'}\n`+m.categories.map(c=>c.name+' · '+(c.quartile||'未提供')).join('\n');
    if(detailed)box.append(this.el(doc,'span','期刊层面指标','cl-muted'));
    return box;
  },
  resolved(record) {
    record={...record,DOI:CiteLensCore.recordDOI(record)};if(record.verified)return record;
    const cached=CiteLensServices.state.cache[CiteLensCore.identity(record)];
    if(cached&&Date.now()-cached.time<7*86400000&&cached.value?.status==='matched'&&CiteLensCore.decide(record,[cached.value.ranked[0].record]).status==='matched')return {...record,...cached.value.ranked[0].record,DOI:CiteLensCore.recordDOI(cached.value.ranked[0].record),raw:record.raw,position:record.position};
    return record;
  },
  card(doc,initial,reader,{compact=false,detailed=false,context=null,onChange=null,onRecord=null,onCollapse=null}={}) {
    const C=CiteLensCore,S=CiteLensServices,root=this.el(doc,'article',null,'cl-card');
    root.dataset.citeLens='card';root.dataset.compact=String(compact);root.dataset.detailed=String(detailed);context=context||this.context(reader);
    let record={...this.resolved(initial)},epoch=0,lookupBusy=false;record.DOI=C.recordDOI(record);
    let authorBusy=false,authorTicket=0,authorTimer;
    const loadAuthors=async(force=false)=>{
      if(authorBusy===CiteLensAuthors.key(record)||!root.isConnected||S.dead||S.state.settings.autoAuthors===false||!CiteLensAuthors.eligible(record))return;
      const key=CiteLensAuthors.key(record),ticket=++authorTicket;authorBusy=key;
      try {
        const result=await S.authors(record,{force});
        if(ticket!==authorTicket||S.dead||S.state.settings.autoAuthors===false||!root.isConnected||CiteLensAuthors.key(record)!==key)return;
        record.authorData=result;onRecord?.(record);render();
      }catch(e){if(force&&root.isConnected)this.status(root.querySelector('.cl-status'),'作者查询暂不可用，请稍后重试');}
      finally{if(authorBusy===key)authorBusy=false;}
    };
    const update=next=>{
      record={...initial,...next,raw:initial.raw,position:initial.position};record.DOI=C.recordDOI(record);
      onRecord?.(record);render();
    };
    const render=()=>{
      const summaryOpen=doc._clAbstract?.title?.closest('.cl-card')===root;if(summaryOpen)doc._clAbstract.close(true);
      const ticket=++epoch;for(const child of [...root.children])if(child!==root._menu)child.remove();root.dataset.verified=String(!!record.verified);
      if(record.authorData&&record.authorData.inputKey!==CiteLensAuthors.key(record)&&(!record.DOI||C.doi(record.DOI)!==record.authorData.DOI))delete record.authorData;
      record.authorData=S.cachedAuthors(record)||record.authorData;
      const eyebrow=this.el(doc,'div',null,'cl-eyebrow');
      const kicker=this.el(doc,'span',null,'cl-kicker');if(onCollapse){const collapse=this.quiet(doc,'⌃',onCollapse);collapse.classList.add('cl-collapse-detail');collapse.setAttribute('aria-label','收起文献详情');collapse.title='收起文献详情';kicker.append(collapse);}kicker.append(this.el(doc,'span',this.type(record),'cl-kicker-type'));if(record.year)kicker.append(this.el(doc,'span',' · ','cl-kicker-separator'),this.el(doc,'span',record.year,'cl-kicker-year'));eyebrow.append(kicker);
      const title=this.title(doc,record,'h3');
      root.append(eyebrow,title);
      this.bindAbstract(doc,root,title,()=>record);
      const authorData=record.authorData,authors=authorData?.authors?.length?authorData.authors:record.creators?.length?record.creators:record.author?[{lastName:record.author}]:[];
      if(authors.length)root.append(this.authorList(doc,authors,{incomplete:!authorData?.authors?.length&&!record.verified&&/et al\b|…|\.\.\./i.test(record.raw||'')}));
      const journal=this.el(doc,'div',null,'cl-journal'),journalName=this.el(doc,'strong',C.plainTitle(record.journal||(['book','bookSection'].includes(record.type)?record.publisher:'')||''),'cl-journal-name');journalName.title=journalName.textContent;journal.append(journalName);root.append(journal);
      const currentMetric=S.metricFor(record);if(currentMetric.status==='available')journal.append(this.metric(doc,record));
      const doi=C.doi(record.DOI||authorData?.DOI);
      if(doi){const link=this.el(doc,'a','DOI ↗','cl-doi');link.href='https://doi.org/'+doi;link.title=doi;link.setAttribute('aria-label','打开 DOI '+doi);link.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();Zotero.launchURL(link.href);});journal.append(link);}
      if(['book','bookSection'].includes(record.type)&&record.journal&&record.publisher){const publisher=this.el(doc,'div',C.plainTitle(record.publisher),'cl-publisher');publisher.title=publisher.textContent;root.append(publisher);}
      const actions=this.el(doc,'div',null,'cl-actions cl-card-tools'),status=this.el(doc,'div','','cl-status');actions.setAttribute('aria-label','文献操作');
      const saveRun=()=>this.saveDialog(doc,record,context,result=>{
        render();this.status(root.querySelector('.cl-status'),result.created?'已保存到所选位置':'已复用库中条目，未新增重复记录');onChange?.();
      });
      const save=this.iconButton(doc,'保存','save',saveRun);save.title='保存到 Zotero';save.setAttribute('aria-label',save.title);
      const later=this.iconButton(doc,this.queued(record)?'已在清单':'稍后读',this.queued(record)?'bookmarked':'bookmark',async b=>{
        await S.enqueue(record,context);this.setButtonLabel(b,'已在清单','bookmarked');b.setAttribute('aria-pressed','true');this.status(status,'已加入本地阅读清单');onChange?.();
      });later.setAttribute('aria-pressed',String(!!this.queued(record)));
      later.title='加入稍后阅读清单';actions.append(save,later);
      const more=this.iconButton(doc,'更多','more',()=>this.actionMenu(doc,root));more.classList.add('cl-more');more.setAttribute('aria-label','更多操作');more.setAttribute('aria-haspopup','menu');more.setAttribute('aria-expanded',String(!!root._menu));if(root._menu)more.setAttribute('aria-controls',root._menu.id);more.title='更多操作';actions.append(more);
      eyebrow.append(status,actions);
      const runLookup=async(interactive,b=null)=>{
        if(lookupBusy)return;lookupBusy=true;if(b)b.disabled=true;
        try{
          const queryKey=C.identity(record);
          if(interactive){if(!await this.networkConsent(doc))return;this.status(status,'正在更新…');}
          else if(!S.state.settings.autoLookup||!S.state.settings.networkConsent)return;
          if(!root.isConnected||S.dead)return;
          const result=await S.lookup(record);if(queryKey!==C.identity(record)||!root.isConnected||S.dead||!S.state.settings.networkConsent||!interactive&&!S.state.settings.autoLookup)return;
          const apply=async(next,reasons)=>{
            const wasQueued=this.queued(record);
            record={...initial,...next,raw:initial.raw,position:initial.position};record.DOI=C.recordDOI(record);
            if(wasQueued)await S.enqueue(record,context);
            onRecord?.(record);render();onChange?.();
          };
          if(result.status==='matched')await apply(result.ranked[0].record,result.ranked[0].reasons);
          else if(interactive&&result.status==='review'){
            this.status(status,'找到相近候选，请核对后选择');
            this.candidates(doc,record,result.ranked,next=>apply(next,['你已核对并选择候选']));
          }else if(interactive)this.status(status,'未找到相符文献，已保留原始条目。');
          if(interactive&&result.status!=='review')await loadAuthors(true);
        }catch(e){if(interactive&&root.isConnected)this.status(root.querySelector('.cl-status'),e.message,true);}
        finally{lookupBusy=false;if(b)b.disabled=false;}
      };
      const lookup=this.button(doc,'更新信息',b=>runLookup(true,b));
      root._save=saveRun;root._copy=()=>{Zotero.Utilities.Internal.copyTextToClipboard(C.citation(record));this.status(root.querySelector('.cl-status'),'已复制引用');};
      S.locate(record).then(items=>{
        if(!root.isConnected||epoch!==ticket||!items.length)return;
        const libraries=[...new Set(items.map(x=>x.libraryName))],duplicates=new Set(items.map(x=>x.libraryID)).size<items.length;
        const locations=items.map(x=>x.libraryName+' › '+(x.collections?.length?x.collections.map(c=>c.path).join('；'):'未归入文献夹')+(x.editable?'':'（只读）'));
        const line=this.el(doc,'div',null,'cl-existing'),locationText=this.el(doc,'span',(duplicates?'发现重复条目 · ':'已在库中 · ')+locations.join(' / '));line.append(locationText);line.title=locations.join('\n');
        if(items.length>1||items.some(x=>(x.collections?.length||0)>1))line.append(this.quiet(doc,'查看位置',()=>this.existingDialog(doc,items)));root.append(line);
        save.textContent=items.length===1?'打开 Zotero':'选择已有条目';
        // Replace the action itself, so an existing item is never silently re-created.
        const open=this.iconButton(doc,items.length===1?'打开':'选择','open',()=>items.length===1?Zotero.getActiveZoteroPane().selectItem(items[0].item.id):this.existingDialog(doc,items));open.title=save.textContent;open.setAttribute('aria-label',save.textContent);save.replaceWith(open);
        if(items.length===1){
          const item=items[0].item,publisher=item.getField('publisher'),publication=item.getField('publicationTitle');
          const identifier=item.getField('ISSN'),metricChanged=(!record.ISSN&&!!identifier)||(!record.journal&&!!publication);
          if(!record.ISSN&&identifier)record.ISSN=identifier;
          if(!record.publisher&&publisher){record.publisher=publisher;if(['book','bookSection'].includes(record.type)){if(!record.journal)journal.firstElementChild.textContent=publisher;else{const publisherLine=this.el(doc,'div','出版 · '+publisher,'cl-publisher');journal.after(publisherLine);}}}
          if(!record.journal&&publication){record.journal=publication;journal.firstElementChild.textContent=publication;}
          if(metricChanged){render();return;}
        }
        doc.defaultView.requestAnimationFrame(()=>this.fitPopup(root,doc));
      }).catch(()=>{if(root.isConnected&&ticket===epoch)this.status(status,'暂时无法确认库中状态；保存时仍会检查重复。');});
      const metricSnapshot=JSON.stringify(S.metricFor(record));
      S.prepareLocalMetrics(record).then(()=>{if(root.isConnected&&ticket===epoch&&JSON.stringify(S.metricFor(record))!==metricSnapshot)render();}).catch(e=>Zotero.logError(e));
      root._lookup=lookup;root._autoLookup=()=>runLookup(false);doc.defaultView.requestAnimationFrame(()=>{this.fitAuthors(root,doc);this.fitPopup(root,doc);this.positionMenu(root._menu,doc);});
      doc.defaultView.clearTimeout(authorTimer);
      if(summaryOpen)this.abstractPopover(doc,root,title,()=>record);
      if(!S.cachedAuthors(record)&&S.state.settings.autoAuthors!==false&&CiteLensAuthors.eligible(record))authorTimer=doc.defaultView.setTimeout(()=>loadAuthors(),220);
    };
    root.addEventListener('keydown',e=>{if(!root.closest('.cl-root,.cl-overlay'))this.tab(root,e,false);});
    root.addEventListener('cl-metrics-changed',render);
    root.addEventListener('cl-authors-changed',()=>{authorTicket++;authorBusy=false;delete record.authorData;render();});render();
    if(compact&&S.state.settings.autoLookup&&S.state.settings.networkConsent&&!record.verified)doc.defaultView.setTimeout(()=>{
      if(root.isConnected&&S.state.settings.autoLookup&&S.state.settings.networkConsent)root._autoLookup();
    },0);
    return root;
  },
  fitPopup(node,doc) {
    const popup=node.closest?.('.cl-native-host,.cl-floating')||node;
    if(!popup.isConnected||!popup.matches('.cl-native-host,.cl-floating'))return;
    if(!popup._clResize){
      const win=doc.defaultView,reflow=()=>{if(!popup.isConnected)return;this.fitAuthors(popup,doc);this.fitPopup(popup,doc);doc._clAbstract?.position?.();for(const menu of popup.querySelectorAll('.cl-menu'))this.positionMenu(menu,doc);};
      const release=()=>{try{resize.disconnect();removed.disconnect();win.removeEventListener('resize',reflow);delete popup._clResize;delete popup._clLayoutCleanup;}catch(_){}};const resize=new win.ResizeObserver(reflow),removed=new win.MutationObserver(()=>{try{if(!popup.isConnected||!doc.getElementById('cite-lens-style'))release();}catch(_){release();}});popup._clResize=resize;popup._clLayoutCleanup=release;resize.observe(popup);win.addEventListener('resize',reflow);removed.observe(doc.body,{childList:true,subtree:true});
    }
    const b=popup.getBoundingClientRect(),width=doc.defaultView.innerWidth,height=doc.defaultView.innerHeight;
    const dx=b.left<8?8-b.left:b.right>width-8?width-8-b.right:0,dy=b.top<42?42-b.top:b.bottom>height-8?height-8-b.bottom:0;
    const shift=popup._clShift||{x:0,y:0};shift.x+=dx;shift.y+=dy;popup._clShift=shift;popup.style.translate=shift.x+'px '+shift.y+'px';
  },
  citationGroup(doc,records,reader,{context=null}={}) {
    const root=this.el(doc,'section',null,'cl-citation-group');root.dataset.citeLens='group';root.setAttribute('contenteditable','false');
    root.setAttribute('aria-label',records.length+' 篇参考文献');
    if(records.length>1)root.classList.add('cl-group-stack');
    for(const [index,record] of records.entries())root.append(this.card(doc,record,reader,{compact:true,context,onRecord:updated=>{records[index]=updated;}}));
    root.addEventListener('keydown',e=>this.tab(root,e,false));
    return root;
  },
  existingDialog(doc,matches) {
    const {root,footer,close}=this.dialog(doc,'库中已有的文献');
    const perLibrary=new Map();for(const match of matches)perLibrary.set(match.libraryID,(perLibrary.get(match.libraryID)||0)+1);
    if([...perLibrary.values()].some(n=>n>1))root.append(this.el(doc,'p','同一文献库中有重复记录。请选择要打开的条目；保存前需先在 Zotero 合并重复条目。','cl-note'));
    for(const match of matches){const item=match.item,box=this.el(doc,'div',null,'cl-candidate');box.append(this.el(doc,'div',match.libraryName+(match.editable?'':' · 只读'),'cl-kicker'),this.title(doc,{title:item.getField('title')}));
      const names=(match.collections||CiteLensServices.collectionPaths(item)).map(x=>x.path);box.append(this.el(doc,'div',names.length?names.join('；'):'未归入文献夹','cl-muted'),this.button(doc,'在 Zotero 打开',()=>{Zotero.getActiveZoteroPane().selectItem(item.id);close();}));root.append(box);}
  },
  details(doc,record,reader,options={}) {
    const dialog=this.dialog(doc,'文献详情',{className:'cl-detail-dialog',header:false});
    dialog.root.append(this.card(doc,record,reader,{...options,detailed:true,onClose:dialog.close,onPin:current=>{CiteLens.showPanel(reader,{record:current,context:options.context});dialog.close();}}));
    dialog.overlay.addEventListener('pointerdown',e=>{if(e.target===dialog.overlay)dialog.close();});
    return dialog;
  },
  focusables(root) {
    return [...root.querySelectorAll('button,a[href],input,select,textarea,summary,[tabindex]')].filter(x=>{
      if(x.disabled||x.tabIndex<0||x.closest('[hidden]')||!x.getClientRects().length)return false;
      for(let parent=x.parentElement;parent&&parent!==root;parent=parent.parentElement)if(parent.tagName==='DETAILS'&&!parent.open&&!parent.querySelector(':scope > summary')?.contains(x))return false;
      return true;
    });
  },
  tab(root,e,wrap=true) {
    if(e.key!=='Tab')return;
    // Zotero also handles Tab during capture. Use the original target, not its moved activeElement.
    const focus=this.focusables(root),index=focus.indexOf(e.target),next=index+(e.shiftKey?-1:1);
    if(!wrap&&(next<0||next>=focus.length))return;
    e.preventDefault();e.stopPropagation();focus[(next+focus.length)%focus.length]?.focus();
  },
  dialog(doc,title,{onClose=null,className='',header=true}={}) {
    this.style(doc);
    const previous=doc.activeElement,parent=[...doc.querySelectorAll('.cl-overlay,.cl-root')].reverse().find(x=>!x.hidden),overlay=this.el(doc,'div',null,'cl-overlay'),frame=this.el(doc,'section',null,'cl-dialog '+className),head=this.el(doc,'header',null,'cl-dialog-header'),root=this.el(doc,'div',null,'cl-dialog-body'),footer=this.el(doc,'footer',null,'cl-dialog-footer');
    const heading=this.el(doc,'h2',title);heading.id='cl-dialog-title-'+(++this.sequence);
    frame.setAttribute('role','dialog');frame.setAttribute('aria-modal','true');if(header)frame.setAttribute('aria-labelledby',heading.id);else frame.setAttribute('aria-label',title);frame.tabIndex=-1;
    let closed=false,busy=false;const win=doc.defaultView;
    doc._clAbstract?.close(true);doc.querySelector('.cl-menu')?._close?.();
    const rect=parent?.classList.contains('cl-root')?parent.getBoundingClientRect():null;
    if(parent){parent.hidden=true;parent.inert=true;}
    if(rect&&className==='cl-settings'){overlay.classList.add('cl-context-page');overlay.style.setProperty('--cl-context-right',Math.max(8,win.innerWidth-rect.right)+'px');overlay.style.setProperty('--cl-context-top',rect.top+'px');frame.style.width=rect.width+'px';}
    const release=()=>{if(closed)return;closed=true;try{removed.disconnect();win.removeEventListener('pagehide',release);}catch(_){}if(parent?.isConnected){parent.hidden=false;parent.inert=false;}onClose?.();};
    const removed=new win.MutationObserver(()=>{try{if(!overlay.isConnected||parent&&!parent.isConnected){overlay.remove();release();}}catch(_){release();}});removed.observe(doc.body||doc.documentElement,{childList:true,subtree:true});win.addEventListener('pagehide',release);
    const close=()=>{if(closed||busy)return;overlay.remove();release();try{if(previous?.isConnected)previous.focus();}catch(_){}};
    const dismiss=this.quiet(doc,'×',close);dismiss.classList.add('cl-dismiss');dismiss.setAttribute('aria-label','关闭'+title);
    if(title.startsWith('Paper Nexus')){heading.classList.add('pn-brand-heading');heading.prepend(this.logo(doc,24));}if(parent){const back=this.quiet(doc,'‹',close);back.classList.add('cl-dismiss','cl-back');back.setAttribute('aria-label','返回上一页');head.append(back);}head.append(heading,dismiss);if(header)frame.append(head);frame.append(root,footer);overlay.append(frame);(doc.body||doc.documentElement).append(overlay);
    overlay.addEventListener('keydown',e=>{
      if(e.key==='Escape'){e.stopPropagation();e.preventDefault();close();return;}
      this.tab(frame,e);
    });frame.focus();
    return {root,frame,footer,overlay,close,setBusy(value){busy=value;dismiss.disabled=value;const back=head.querySelector('.cl-back');if(back)back.disabled=value;frame.setAttribute('aria-busy',String(value));}};
  },
  field(doc,parent,label,value='',tag='input') {
    const lab=this.el(doc,'label',label,'cl-field'),input=this.el(doc,tag);input.value=value??'';lab.append(input);parent.append(lab);return input;
  },
  disclosure(doc,label,open=false) {const d=this.el(doc,'details',null,'cl-disclosure');d.open=open;d.append(this.el(doc,'summary',label));return d;},
  async networkConsent(doc) {
    const S=CiteLensServices;if(S.state.settings.networkConsent)return true;
    return new Promise(resolve=>{
      let done=false;const finish=value=>{if(done)return;done=true;resolve(value);};
      const {root,footer,close}=this.dialog(doc,'联网更新文献信息',{onClose:()=>finish(false)});
      root.append(this.el(doc,'p','将 DOI 或当前这一条参考文献发送到 Crossref，以核对题名、作者和年份。','cl-raw'),this.el(doc,'p','PDF 和文献库保留在本机。自动更新默认关闭。','cl-note'));
      footer.append(this.button(doc,'暂不联网',close),this.button(doc,'允许并继续',async()=>{S.state.settings.networkConsent=true;await S.persist();finish(true);close();},true));
    });
  },
  candidates(doc,original,ranked,apply) {
    ranked=CiteLensCore.rank(original,ranked.map(x=>x.record));if(!ranked.length)return;
    const {root,footer,close}=this.dialog(doc,'选择文献');
    const source=this.disclosure(doc,'查看原始参考文献');source.append(this.el(doc,'p',original.raw,'cl-raw'));root.append(this.title(doc,original),this.el(doc,'div',this.byline(original),'cl-byline'),source);
    for(const c of ranked){
      const box=this.el(doc,'div',null,'cl-candidate');
      box.append(this.title(doc,c.record),this.authorList(doc,c.record.creators||[]),this.el(doc,'div',c.record.year||'','cl-byline'),this.el(doc,'div',c.record.journal,'cl-muted'),this.el(doc,'div',c.record.DOI,'cl-muted'),this.el(doc,'p',c.reasons.join('；'),c.conflict?'cl-error':'cl-muted'),this.button(doc,'选择此文献',async()=>{await apply(c.record);close();}));root.append(box);
    }
    footer.append(this.button(doc,'保留原始条目',close));
  },
  saveDialog(doc,original,context,onSaved,records=null) {
    const C=CiteLensCore,S=CiteLensServices,dialog=this.dialog(doc,records?'批量保存到 Zotero':'保存到 Zotero',{className:'cl-save-dialog',header:false}),{root,footer,close}=dialog,targets=S.targets();
    if(!targets.length){root.append(this.el(doc,'p','没有可写入的文献库。请在 Zotero 中检查个人库或群组权限。'));footer.append(this.button(doc,'关闭',close));return dialog;}
    const summary=this.el(doc,'div',null,'cl-save-summary');
    summary.append(records?this.el(doc,'div',`${records.length} 篇文献`,'cl-title'):this.title(doc,original),this.el(doc,'div',records?'相同条目会复用，失败条目保留在清单。':this.byline(original),'cl-muted'));root.append(summary);
    const destination=this.el(doc,'div',null,'cl-destination');destination.setAttribute('role','group');destination.setAttribute('aria-label','保存位置');root.append(destination);
    const library=this.field(doc,destination,'文献库','','select'),collection=this.field(doc,destination,'文献夹','','select');
    for(const input of [library,collection]){input.setAttribute('aria-label',input===library?'文献库':'文献夹');input.parentElement.classList.add('cl-target-field');input.parentElement.firstChild.remove();}
    const describe=()=>{for(const input of [library,collection])input.title=input.getAttribute('aria-label')+'：'+(input.selectedOptions[0]?.textContent||'');};
    const create=this.disclosure(doc,'新建文献夹');const newCollection=this.field(doc,create,'新建文献夹名称');newCollection.placeholder='在所选位置内建立';newCollection.maxLength=150;root.append(create);
    for(const t of targets){const o=this.el(doc,'option',t.name);o.value=t.id;library.append(o);}
    library.value=String(targets.find(t=>t.id===S.state.settings.lastTarget?.libraryID)?.id||targets[0].id);
    const populate=()=>{
      collection.replaceChildren();const o=this.el(doc,'option','文献库根目录');o.value='';collection.append(o);
      for(const c of targets.find(t=>String(t.id)===library.value).collections){const option=this.el(doc,'option',c.name);option.value=c.id;collection.append(option);}
      const last=S.state.settings.lastTarget;if(last?.libraryID===Number(library.value)&&[...collection.options].some(o=>o.value===String(last.collectionID)))collection.value=String(last.collectionID);
      describe();
    };populate();library.addEventListener('change',populate);collection.addEventListener('change',describe);
    let title,type,year,journal,doi,authors,review;
    if(!records){
      review=this.disclosure(doc,original.verified?'检查 / 编辑书目信息':'核对书目信息 · 保存前请确认');
      if(!original.verified)review.append(this.el(doc,'p','字段来自 PDF 解析，可能不完整。请核对后保存；也可在文献详情中联网核验。','cl-note'));
      title=this.field(doc,review,'题名',C.plainTitle(original.title),'textarea');title.rows=2;
      const grid=this.el(doc,'div',null,'cl-grid');type=this.field(doc,grid,'条目类型','','select');
      for(const [v,t] of [['journalArticle','期刊论文'],['book','书籍'],['bookSection','书籍章节'],['conferencePaper','会议论文'],['preprint','预印本'],['thesis','学位论文']]){const o=this.el(doc,'option',t);o.value=v;type.append(o);}type.value=original.type||'journalArticle';
      year=this.field(doc,grid,'年份',original.year);year.inputMode='numeric';root.append(review);review.append(grid);
      authors=this.field(doc,review,'作者（每行：姓, 名）',(original.creators||[]).map(a=>a.lastName+(a.firstName?', '+a.firstName:'')).join('\n'),'textarea');
      journal=this.field(doc,review,'期刊或书名',original.journal);doi=this.field(doc,review,'DOI（可留空）',original.DOI);
      if(original.raw)review.append(this.el(doc,'p',original.raw,'cl-raw cl-reference-text'));
    }else{
      review=this.disclosure(doc,'查看本次保存的文献');for(const e of records)review.append(this.el(doc,'p',`${e.record.title} · ${this.byline(e.record)}`,'cl-raw'));root.append(review);
    }
    const status=this.el(doc,'div','','cl-status');root.append(status);const cancel=this.button(doc,'取消',close);
    let checked=!!original?.verified;
    const save=this.button(doc,records?'保存 '+records.length+' 篇':checked?'保存':'核对并保存',async b=>{
      if(!records&&!checked){review.open=true;review.scrollIntoView({block:'start'});title.focus();checked=true;b.textContent='确认保存';this.status(status,'请检查展开的字段，然后点击「确认保存」。');return;}
      b.disabled=true;cancel.disabled=true;dialog.setBusy(true);
      try{
        const target={libraryID:library.value,collectionID:collection.value,newCollection:create.open?newCollection.value:''};
        if(records){
          let ok=0,failed=[];
          for(const entry of records){this.status(status,`正在保存 ${ok+failed.length+1} / ${records.length}…`);try{await S.save(entry.record,target,entry.context);entry.status='saved';ok++;}catch(e){failed.push(`${entry.record.title}: ${e.message}`);}}
          await S.persist();onSaved?.({batch:true,ok,failed});
          if(failed.length){this.status(status,`已保存 ${ok} 篇；${failed.length} 篇失败：${failed.join('；')}`,true);b.textContent='重试失败条目';records=records.filter(x=>x.status!=='saved');}
          else{dialog.setBusy(false);close();}
        }else{
          const invalid=(field,message)=>{review.open=true;field.setAttribute('aria-invalid','true');field.focus();throw Error(message);};
          for(const field of [title,year,doi])field.removeAttribute('aria-invalid');
          if(!title.value.trim())invalid(title,'请填写题名');
          if(doi.value.trim()&&!C.doi(doi.value))invalid(doi,'DOI 格式不正确');
          if(year.value.trim()&&!/^(1[6-9]|20)\d{2}$/.test(year.value.trim()))invalid(year,'年份需为四位数字');
          const creators=authors.value.split('\n').map(x=>x.trim()).filter(Boolean).map(x=>{const [lastName,...rest]=x.split(',');return {lastName:lastName.trim(),firstName:rest.join(',').trim(),creatorType:'author'};});
          const changedYear=year.value.trim()!==String(original.year||'');
          const edited={...original,title:title.value.trim(),type:type.value,year:year.value.trim(),date:changedYear?year.value.trim():original.date||year.value.trim(),journal:journal.value.trim(),DOI:C.doi(doi.value),creators,author:creators[0]?.lastName||'',verified:true};
          const result=await S.save(edited,target,context);onSaved?.(result);dialog.setBusy(false);close();
        }
      }catch(e){this.status(status,e.message,true);}finally{dialog.setBusy(false);b.disabled=false;cancel.disabled=false;}
    },true);
    footer.append(cancel,save);return dialog;
  },
  panel(doc,reader,options={}) {
    this.style(doc);
    const root=this.el(doc,'section',null,'cl-root');root.dataset.citeLens='panel';root.setAttribute('aria-label','Paper Nexus 文献工作台');
    const previous=doc.activeElement,head=this.el(doc,'header',null,'cl-header'),row=this.el(doc,'div',null,'cl-row'),body=this.el(doc,'div',null,'cl-body'),search=this.el(doc,'input',null,'cl-search'),footer=this.el(doc,'footer',null,'cl-panel-footer');
    const close=()=>{root.remove();CiteLens.panels.delete(reader);if(previous?.isConnected)previous.focus();};
    const dismiss=this.quiet(doc,'×',close);dismiss.classList.add('cl-dismiss');dismiss.setAttribute('aria-label','关闭文献清单');
    const controls=this.el(doc,'div',null,'cl-header-tools');controls.append(this.quiet(doc,'文献网络',()=>CiteLens.showNetwork(reader)),this.quiet(doc,'设置',()=>this.settingsDialog(doc)),dismiss);const brand=this.el(doc,'div','Paper Nexus','cl-brand');brand.prepend(this.logo(doc,24));row.append(brand,controls);
    const subtitle=this.el(doc,'div','阅读与关联','cl-subtitle'),tabs=this.el(doc,'div',null,'cl-tabs');tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','文献范围');
    search.type='search';search.placeholder='搜索题名、作者、年份或 DOI';search.setAttribute('aria-label','搜索参考文献');
    head.append(row,tabs,search);root.append(head,body,footer);doc.body.append(root);
    body.id='cl-panel-body-'+(++this.sequence);body.setAttribute('role','tabpanel');
    let view='references',selected=options.record?{record:options.record,context:options.context}:null,generation=0,scroll=0;
    const queries={references:'',queue:''};
    const render=async()=>{
      const ticket=++generation;body.replaceChildren();footer.replaceChildren();
      const queueCount=CiteLensServices.state.queue.filter(x=>x.status!=='saved').length;
      for(const b of tabs.children){const active=b.dataset.view===view;b.setAttribute('aria-selected',String(active));b.tabIndex=active?0:-1;if(active)body.setAttribute('aria-labelledby',b.id);if(b.dataset.view==='queue')b.textContent='稍后阅读'+(queueCount?' · '+queueCount:'');}
      root.classList.toggle('cl-selected',!!selected);search.hidden=!!selected;tabs.hidden=!!selected;subtitle.textContent=selected?'文献详情':'本篇引用与本地阅读清单';
      if(selected){
        const backbar=this.el(doc,'div',null,'cl-backbar');backbar.append(this.quiet(doc,'返回列表',()=>{selected=null;render();}));body.append(backbar);
        body.append(this.card(doc,selected.record,reader,{detailed:true,context:selected.context,onRecord:record=>{selected.record=record;},onChange:()=>{}}));
        body.scrollTop=0;return;
      }
      let rows;
      if(view==='queue')rows=CiteLensServices.state.queue.filter(x=>x.status!=='saved');
      else{
        body.append(this.el(doc,'p','正在读取本篇参考文献…','cl-empty'));
        try{rows=(await CiteLens.references(reader)).map(record=>({record:this.resolved(record),context:this.context(reader)}));}
        catch(e){if(ticket===generation&&root.isConnected){body.replaceChildren(this.el(doc,'p',e.message,'cl-empty'));footer.append(this.quiet(doc,'粘贴参考文献',()=>this.manualDialog(doc,reader)));}return;}
      }
      if(ticket!==generation||!root.isConnected)return;
      body.replaceChildren();const q=CiteLensCore.norm(search.value),total=rows.length;
      rows=rows.filter(x=>!q||CiteLensCore.norm(CiteLensCore.citation(x.record)+' '+(x.record.DOI||'')).includes(q));
      const bar=this.el(doc,'div',null,'cl-listbar'),tools=this.el(doc,'div',null,'cl-actions');
      bar.append(this.el(doc,'span',q?`${rows.length} / ${total} 条`:`${total} 条${view==='queue'?'待阅读':'参考文献'}`,'cl-muted'));
      const exp=this.quiet(doc,'导出 RIS',()=>CiteLens.exportRIS(rows.map(x=>x.record)));exp.disabled=!rows.length;tools.append(exp);
      if(view==='queue'&&rows.length)tools.append(this.quiet(doc,'批量保存',()=>this.batchDialog(doc,rows,render)));bar.append(tools);body.append(bar);
      if(!rows.length){
        const empty=this.el(doc,'div',null,'cl-empty');empty.append(this.el(doc,'strong',q?'没有匹配结果':view==='queue'?'把想读的文献留在这里':'暂未读取到参考文献'),this.el(doc,'p',q?'尝试作者姓氏、年份或更短的题名。':view==='queue'?'悬浮卡片中点击「稍后读」，稍后集中核对、保存和导出。':'选中 PDF 中的整条参考文献，点击「识别引文」；也可以粘贴文本。'));
        if(q)empty.append(this.button(doc,'清除搜索',()=>{search.value='';queries[view]='';render();}));body.append(empty);
      }
      let count=0;const limit=60;
      const appendPage=()=>{
        for(const entry of rows.slice(count,count+limit)){
          const record=entry.record,item=this.el(doc,'article',null,'cl-list-row');
          const title=this.button(doc,'',()=>{
            const expanded=item.querySelector('.cl-inline-detail');
            if(expanded){expanded.remove();title.setAttribute('aria-expanded','false');return;}
            for(const open of body.querySelectorAll('.cl-inline-detail')){open.parentElement.querySelector('.cl-row-title')?.setAttribute('aria-expanded','false');open.remove();}
            const detail=this.el(doc,'div',null,'cl-inline-detail');const card=this.card(doc,entry.record,reader,{detailed:true,context:entry.context,onRecord:r=>{entry.record=r;title.replaceChildren(this.title(doc,r,'span'));const byline=item.querySelector(':scope > .cl-byline');if(byline)byline.textContent=this.byline(r)+(r.journal?' · '+r.journal:'');},onChange:()=>{},onCollapse:()=>{detail.remove();title.setAttribute('aria-expanded','false');title.focus();}});detail.append(card);item.append(detail);title.setAttribute('aria-expanded','true');card.querySelector('.cl-collapse-detail').focus();
          });title.className='cl-row-title';title.append(this.title(doc,record,'span'));title.setAttribute('aria-expanded','false');
          item.append(title,this.el(doc,'div',this.byline(record)+(record.journal?' · '+record.journal:''),'cl-byline'));
          const meta=this.el(doc,'div',null,'cl-list-meta');meta.append(this.el(doc,'span',this.type(record),'cl-chip'));
          const metric=CiteLensServices.metricFor(record);
          if(metric.status==='available'){const brief=this.el(doc,'span',`IF ${metric.jif===null?'未提供':metric.jif} · ${metric.categories.map(x=>x.quartile).filter(q=>/^Q[1-4]$/.test(q)).sort()[0]||'分区未提供'}`,'cl-muted');brief.title=(metric.metricYear?metric.metricYear+' 指标年':'年份未标注')+' · 最佳学科分区\n'+metric.categories.map(x=>x.name+' '+(x.quartile||'未提供')).join('\n');meta.append(brief);}
          if(view==='queue')meta.append(this.quiet(doc,'移出清单',async()=>{
            await CiteLensServices.removeQueue(entry.key);await render();
            const undo=this.button(doc,'撤销移出',async()=>{await CiteLensServices.enqueue(record,entry.context);render();});footer.replaceChildren(this.el(doc,'span','已移出阅读清单','cl-muted'),undo);
          }));
          else meta.append(this.quiet(doc,this.queued(record)?'已在清单':'稍后读',async b=>{await CiteLensServices.enqueue(record,entry.context);b.textContent='已在清单';const tab=tabs.querySelector('[data-view=queue]');tab.textContent='稍后阅读 · '+CiteLensServices.state.queue.filter(x=>x.status!=='saved').length;}));
          item.append(meta);body.append(item);
        }
        count+=limit;if(count<rows.length){const b=this.button(doc,`继续显示 ${Math.min(limit,rows.length-count)} 条`,()=>{b.remove();appendPage();});b.style.margin='14px 18px';body.append(b);}
      };appendPage();body.scrollTop=scroll;
      footer.append(this.quiet(doc,'粘贴参考文献',()=>this.manualDialog(doc,reader)));
    };
    for(const [key,label] of [['references','本篇文献'],['queue','稍后阅读']]){
      const b=this.button(doc,label,()=>{queries[view]=search.value;view=key;selected=null;scroll=0;search.value=queries[key];render();});b.dataset.view=key;b.setAttribute('role','tab');b.setAttribute('aria-controls',body.id);b.id='cl-tab-'+this.sequence+'-'+key;tabs.append(b);
    }
    tabs.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();e.stopPropagation();const list=[...tabs.children],index=list.indexOf(e.target);const next=e.key==='Home'?0:e.key==='End'?list.length-1:(index+(e.key==='ArrowRight'?1:-1)+list.length)%list.length;list[next].click();list[next].focus();});
    root.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();const detail=root.querySelector('.cl-inline-detail');if(detail){const button=detail.parentElement.querySelector('.cl-row-title');detail.remove();button.setAttribute('aria-expanded','false');button.focus();}else if(selected){selected=null;render();}else close();}else this.tab(root,e,false);});
    search.addEventListener('input',()=>{queries[view]=search.value;scroll=0;render();});
    root.addEventListener('cl-metrics-changed',render);render();return root;
  },
  manualDialog(doc,reader) {
    const {root,footer,close}=this.dialog(doc,'粘贴参考文献'),input=this.field(doc,root,'完整参考文献','','textarea'),status=this.el(doc,'div','','cl-status');
    input.placeholder='粘贴作者、年份、题名和期刊等信息';input.rows=5;root.append(status);
    footer.append(this.button(doc,'取消',close),this.button(doc,'识别并查看',()=>{if(input.value.trim().length<12){this.status(status,'请粘贴完整的参考文献。',true);input.focus();return;}const record={...CiteLensCore.parse(input.value),source:'手动粘贴 · 待核对'};close();CiteLens.showPanel(reader,{record});},true));input.focus();
  },
  batchDialog(doc,rows,refresh) {
    const ready=rows.filter(x=>x.record.verified);
    if(!ready.length){const {root,footer,close}=this.dialog(doc,'保存文献');root.append(this.el(doc,'p','请先打开文献检查书目信息，再批量保存。','cl-note'));footer.append(this.button(doc,'返回清单',close));return;}
    const dialog=this.saveDialog(doc,null,null,refresh,ready);
    const summary=dialog.root.querySelector('.cl-save-summary .cl-muted');if(ready.length!==rows.length&&summary)summary.textContent=`${rows.length-ready.length} 篇尚未确认，仍保留在阅读清单。`;
  },
  settingsDialog(doc) {
    const S=CiteLensServices,existing=doc.querySelector('.cl-settings');if(existing){existing.focus();return;}
    let unsubscribe=()=>{};
    const {root,footer,close}=this.dialog(doc,'Paper Nexus 设置',{className:'cl-settings',onClose:()=>unsubscribe()}),status=this.el(doc,'div','','cl-status');
    const version=this.quiet(doc,'v'+CiteLens.version,()=>Zotero.launchURL(CiteLens.homepage+'/releases/latest'));version.title='版本说明与手动下载安装包';version.classList.add('cl-version');
    const update=this.quiet(doc,'检查更新',()=>CiteLensUpdater.phase==='available'?CiteLensUpdater.apply():CiteLensUpdater.check()),updateStatus=this.el(doc,'div','','cl-status');updateStatus.dataset.updateStatus='true';updateStatus.setAttribute('role','status');updateStatus.setAttribute('aria-live','polite');updateStatus.setAttribute('aria-atomic','true');
    const release=this.quiet(doc,'打开发布页',()=>Zotero.launchURL(CiteLens.homepage+'/releases/latest'));release.hidden=true;
    footer.append(version,updateStatus,release,update);
    const persist=async()=>{await S.persist();CiteLensThemes.refresh();};
    const row=(parent,label,key,input,description='')=>{const row=this.el(doc,'div',null,'cl-setting-row'),text=this.el(doc,'div'),lab=this.el(doc,'label',label);input.id='cl-setting-'+key;lab.htmlFor=input.id;text.append(lab);if(description)input.title=description;row.append(text,input);parent.append(row);return input;};
    const select=(parent,label,key,choices)=>{
      const input=this.el(doc,'select');for(const [value,name] of choices){const option=this.el(doc,'option',name);option.value=value;input.append(option);}input.value=String(S.state.settings[key]??choices[0][0]);
      input.addEventListener('change',async()=>{try{S.state.settings[key]=key==='fontSize'?Number(input.value):input.value;await persist();if(key==='metricYear')CiteLens.refreshMetrics();}catch(e){this.status(status,e.message,true);}});return row(parent,label,key,input);
    };
    const toggle=(parent,label,key,enabled,description='',changed=null)=>{
      const input=this.el(doc,'input');input.type='checkbox';input.checked=enabled;
      input.addEventListener('change',async()=>{input.disabled=true;try{if(key==='autoLookup'&&input.checked&&!await this.networkConsent(doc)){input.checked=false;return;}S.state.settings[key]=input.checked;await persist();changed?.();}catch(e){this.status(status,e.message,true);}finally{input.disabled=false;}});return row(parent,label,key,input,description);
    };
    const tabs=this.el(doc,'nav',null,'cl-tabs cl-settings-tabs');tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','设置分类');root.before(tabs);
    const panes={};let active='appearance';
    const activate=key=>{active=key;for(const [id,pane] of Object.entries(panes)){pane.hidden=id!==key;const b=tabs.querySelector('[data-pane="'+id+'"]');b.setAttribute('aria-selected',String(id===key));b.tabIndex=id===key?0:-1;}root.scrollTop=0;status.textContent='';};
    for(const [key,label] of [['appearance','外观'],['reading','阅读'],['translation','翻译'],['data','数据']]){
      const pane=this.el(doc,'section',null,'cl-settings-pane'),b=this.button(doc,label,()=>activate(key));pane.id='cl-settings-pane-'+this.sequence+'-'+key;pane.setAttribute('role','tabpanel');b.id=pane.id+'-tab';b.setAttribute('role','tab');b.setAttribute('aria-controls',pane.id);pane.setAttribute('aria-labelledby',b.id);b.dataset.pane=key;panes[key]=pane;tabs.append(b);root.append(pane);
    }
    tabs.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();e.stopPropagation();const list=[...tabs.children],i=list.indexOf(e.target),n=e.key==='Home'?0:e.key==='End'?list.length-1:(i+(e.key==='ArrowRight'?1:-1)+list.length)%list.length;list[n].click();list[n].focus();});
    const appearance=panes.appearance,reading=panes.reading,data=panes.data;
    const themeGrid=this.el(doc,'div',null,'cl-theme-grid');themeGrid.setAttribute('role','group');themeGrid.setAttribute('aria-label','主题配色');
    const system=this.el(doc,'input');system.type='checkbox';row(appearance,'跟随系统','themeSystem',system);
    const syncThemes=()=>{system.checked=!S.state.settings.theme||S.state.settings.theme==='system';const current=CiteLensThemes.resolve(S.state.settings.theme,doc.defaultView.matchMedia('(prefers-color-scheme: dark)').matches);for(const b of themeGrid.children)b.setAttribute('aria-pressed',String(!system.checked&&b.dataset.themeChoice===current.id));};
    system.addEventListener('change',async()=>{S.state.settings.theme=system.checked?'system':CiteLensThemes.resolve('system',doc.defaultView.matchMedia('(prefers-color-scheme: dark)').matches).id;await persist();syncThemes();});
    for(const t of CiteLensThemes.themes){const b=this.button(doc,'',async()=>{S.state.settings.theme=t.id;await persist();syncThemes();});b.className='cl-theme-choice';b.dataset.themeChoice=t.id;b.setAttribute('aria-label',t.name+'主题');const swatch=this.el(doc,'span',null,'cl-theme-swatch');swatch.style.backgroundColor=t.paper;swatch.style.backgroundImage='url("'+CiteLens.assetURI+'themes/'+t.art+'")';swatch.style.color=t.accent;swatch.style.setProperty('--preview-mask',t.paper+'99');swatch.style.setProperty('--preview-accent',t.accent);swatch.style.setProperty('--preview-text',t.ink);swatch.style.setProperty('--preview-ink',t.dark?t.paper:'#ffffff');const first=this.el(doc,'i'),second=this.el(doc,'i');first.setAttribute('aria-hidden','true');second.setAttribute('aria-hidden','true');swatch.append(first,second,this.el(doc,'span',t.name,'cl-theme-name'));b.append(swatch);themeGrid.append(b);}appearance.append(themeGrid);syncThemes();
    toggle(appearance,'主题纹理','themeArtwork',!!S.state.settings.themeArtwork);

    select(appearance,'字号','fontSize',[13,12,14,15,16].map(n=>[String(n),n===13?'13 · 默认':String(n)]));
    const fonts=[['system','系统默认'],['serif','衬线阅读']];
    try{const installed=Array.from(Components.classes['@mozilla.org/gfx/fontenumerator;1'].createInstance(Components.interfaces.nsIFontEnumerator).EnumerateAllFonts());for(const f of ['Arial','Helvetica Neue','Aptos','Noto Sans','Noto Sans CJK SC','Microsoft YaHei','PingFang SC'])if(installed.includes(f))fonts.push([f,f]);}catch(_){}
    if(S.state.settings.readingFont&&!fonts.some(x=>x[0]===S.state.settings.readingFont))fonts.push([S.state.settings.readingFont,S.state.settings.readingFont]);
    select(appearance,'题名字体','readingFont',fonts);
    const completion=this.el(doc,'div',null,'cl-setting-pair');reading.append(completion);
    toggle(completion,'补全作者','autoAuthors',S.state.settings.autoAuthors!==false,'超过六位时显示前三位与后三位',()=>{S.authorGeneration=(S.authorGeneration||0)+1;CiteLens.refreshAuthors();});
    toggle(completion,'补全文献','autoLookup',!!S.state.settings.autoLookup,'后台更新，不弹出候选窗口');
    const yearChoices=()=>{const years=S.metricYears().map(String);if(S.state.settings.metricYear&&!years.includes(String(S.state.settings.metricYear)))years.unshift(String(S.state.settings.metricYear));return [['','最新可用年份'],...years.map(y=>[y,y])];};
    const year=select(data,'指标年份','metricYear',yearChoices());year.closest('.cl-setting-row').classList.add('cl-metric-setting');
    let busy=false;
    const sync=()=>{download.textContent=S.epIndex?'更新数据':'下载指标';const value=year.value;year.replaceChildren();for(const [v,label] of yearChoices()){const o=this.el(doc,'option',label);o.value=v;year.append(o);}year.value=value;};
    const load=async(file=null)=>{if(busy)return;busy=true;download.disabled=true;this.status(status,file?'正在导入…':'正在下载指标…');try{await S.loadEasyPubMed(file);CiteLens.refreshMetrics();sync();this.status(status,'指标已更新');}catch(e){this.status(status,e.message,true);}finally{busy=false;download.disabled=false;}};
    const download=this.quiet(doc,'',()=>load());year.closest('.cl-setting-row').append(download);sync();
    const T=CiteLensTranslation,translation=panes.translation;translation.classList.add('cl-translation-settings');
    const translationSelect=(parent,label,key,choices,fallback)=>{const input=this.el(doc,'select');input.dataset.translationSetting=key;for(const [value,name] of choices){const option=this.el(doc,'option',name);option.value=value;input.append(option);}input.value=T.get(key,fallback);input.addEventListener('change',()=>{T.set(key,input.value);syncTranslation();});return row(parent,label,key,input);};
    const provider=translationSelect(translation,'翻译引擎','translationProvider',[['tencenttransmart','腾讯交互翻译'],['bing','微软翻译'],['google','Google 翻译'],['llm','大模型 · API']],'tencenttransmart');
    const target=translationSelect(translation,'目标语言','translationTarget',T.languages,'zh-Hans');
    const llm=this.el(doc,'div',null,'cl-llm-settings');translation.append(llm);
    const service=this.el(doc,'select');service.dataset.translationSetting='llmProvider';for(const preset of T.llmPresets){const option=this.el(doc,'option',preset.name);option.value=preset.id;service.append(option);}service.value=T.get('llmProvider','minimax');row(llm,'服务商','llmProvider',service);
    const endpoint=this.field(doc,llm,'API 地址','','input'),model=this.field(doc,llm,'模型名称'),secret=this.field(doc,llm,'API Key（本机保存）');endpoint.dataset.llm='endpoint';model.dataset.llm='model';secret.dataset.llm='key';secret.type='password';secret.autocomplete='off';secret.spellcheck=false;
    const llmStatus=this.el(doc,'span','','cl-translation-status');llmStatus.setAttribute('role','status');
    const loadLLM=()=>{const config=T.llmConfig(service.value);endpoint.value=config.endpoint;model.value=config.model;secret.value='';secret.placeholder=config.endpoint&&T.llmKey(config)?'已保存 · 留空保留':'填写服务商密钥';};service.addEventListener('change',loadLLM);loadLLM();
    const apiActions=this.el(doc,'div',null,'cl-actions');apiActions.append(llmStatus,this.button(doc,'移除密钥',()=>{const config=T.llmConfig(service.value);T.removeLLMKey(config);secret.value='';loadLLM();llmStatus.textContent='密钥已移除';}),this.button(doc,'保存并测试',async button=>{button.disabled=true;llmStatus.textContent='连接中…';try{const config=await T.saveLLM({...T.llmConfig(service.value),endpoint:endpoint.value,model:model.value},secret.value);secret.value='';loadLLM();provider.value='llm';const result=await T.translateLLM('Gene expression regulates retinal development.','en',{target:target.value,noCache:true});llmStatus.textContent='连接成功';llmStatus.title=result.text;}catch(e){llmStatus.textContent='连接失败';llmStatus.title=e.message;this.status(status,e.message,true);}finally{button.disabled=false;}}));llm.append(apiActions);
    const syncTranslation=()=>{llm.hidden=provider.value!=='llm';for(const option of target.options)option.disabled=provider.value==='tencenttransmart'&&option.value==='zh-Hant';if(target.selectedOptions[0]?.disabled){target.value='zh-Hans';T.set('translationTarget',target.value);}};syncTranslation();
    const more=data;
    const apiLabel=this.el(doc,'label','PubMed API key（可选）','cl-field'),apiInput=this.el(doc,'input',null,'cl-api-key');apiInput.type='password';apiInput.autocomplete='off';apiInput.spellcheck=false;apiInput.placeholder='可选';apiInput.value=CiteLensAbstracts.apiKey();apiLabel.append(apiInput);reading.append(apiLabel);
    apiInput.addEventListener('change',()=>{try{CiteLensAbstracts.apiKey(apiInput.value);this.status(status,apiInput.value.trim()?'API key 已保存在本机':'API key 已移除');}catch(e){this.status(status,e.message,true);}});

    const automatic=this.el(doc,'input');automatic.type='checkbox';row(data,'自动更新插件','autoUpdate',automatic);
    automatic.addEventListener('change',async()=>{automatic.disabled=true;try{await CiteLensUpdater.setAutomatic(automatic.checked);}finally{automatic.disabled=false;}});
    unsubscribe=CiteLensUpdater.subscribe(state=>{try{if(!root.isConnected){unsubscribe();return;}}catch(_){unsubscribe();return;}automatic.checked=state.automatic;automatic.title=state.globallyEnabled?'由 Zotero 定期检查并安装更新':'Zotero 的全局自动更新已关闭';version.textContent='v'+state.version;update.textContent=state.phase==='available'?'安装 v'+state.availableVersion:state.phase==='checking'?'检查中…':state.phase==='installing'?'更新中…':state.phase==='error'?'重试检查':'检查更新';update.disabled=['checking','installing'].includes(state.phase);const message=state.phase==='error'?(/超时/.test(state.message)?'检查超时':'连接失败'):['current','available'].includes(state.phase)?state.message:'';this.status(updateStatus,message,state.phase==='error');updateStatus.title=state.message;updateStatus.setAttribute('aria-label',state.message);release.hidden=state.phase!=='error';});
    toggle(more,'使用本地已有指标','preferInstalledMetrics',S.state.settings.preferInstalledMetrics!==false,'',()=>CiteLens.refreshMetrics());
    toggle(more,'使用离线指标','easyPubMedEnabled',S.state.settings.easyPubMedEnabled!==false,'',()=>CiteLens.refreshMetrics());
    const actions=this.el(doc,'div',null,'cl-actions');
    actions.append(this.button(doc,'导入指标文件',async()=>{const file=await CiteLens.picker('open','导入期刊指标',[['CSV / JSON / ZIP','*.csv;*.json;*.zip']]);if(!file)return;if(/\.zip$/i.test(file)){await load(file);return;}if((await IOUtils.stat(file)).size>20*1024*1024)throw Error('指标文件大于 20 MB');await S.importMetrics(await IOUtils.readUTF8(file));CiteLens.refreshMetrics();sync();this.status(status,'指标已导入');}),this.button(doc,'清除查询缓存',async()=>{S.state.cache={};S.state.authorCache={};S.state.abstractCache={};S.authorGeneration=(S.authorGeneration||0)+1;await persist();this.status(status,'缓存已清除');}));more.append(actions);
    root.append(status);activate(active);
    if(S.metricWarning||S.loadWarning)this.status(status,S.metricWarning||S.loadWarning,true);
  }
};
