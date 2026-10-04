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
  logo(doc,size=26) {const img=this.el(doc,'img',null,'pn-logo');img.src=CiteLens.assetURI+'icon.png';img.alt='';img.width=size;img.height=size;return img;},
  title(doc,record,tag='div') {
    const text=record.title||record.raw||'',markup=record.titleMarkup&&CiteLensCore.plainTitle(record.titleMarkup)===CiteLensCore.plainTitle(text)?record.titleMarkup:text,node=this.el(doc,tag,null,'cl-title');
    for(const part of CiteLensCore.titleParts(markup)){let parent=node;for(const style of part.styles){const child=doc.createElement(style);parent.append(child);parent=child;}parent.append(doc.createTextNode(part.text));}
    node.title=CiteLensCore.plainTitle(text);return node;
  },
  button(doc,text,run,primary=false) {
    const b=this.el(doc,'button',text,primary?'cl-primary':'');b.type='button';
    b.addEventListener('click',async e=>{
      e.preventDefault();e.stopPropagation();if(b.disabled)return;
      try{await run(b);}catch(error){
        Zotero.logError(error);
        const status=b.closest('.cl-card,.cl-dialog,.cl-root')?.querySelector('.cl-status');
        if(status)this.status(status,error.message||String(error),true);
        else Zotero.getMainWindow().alert(error.message||String(error));
      }
    });return b;
  },
  quiet(doc,text,run) {const b=this.button(doc,text,run);b.className='cl-quiet';return b;},
  actionMenu(doc,owner) {
    if(owner._menu){owner._menu._close();return;}
    const menu=this.el(doc,'div',null,'cl-menu');menu.setAttribute('popover','auto');menu.setAttribute('role','menu');menu.setAttribute('aria-label','文献操作');menu.id='cl-menu-'+(++this.sequence);
    owner._menu=menu;owner.append(menu);let closed=false;const cleanups=[];
    const close=(focus=true)=>{if(closed)return;closed=true;for(const clean of cleanups)clean();if(menu.matches(':popover-open'))menu.hidePopover();menu.remove();delete owner._menu;const anchor=owner.querySelector('.cl-more');anchor?.setAttribute('aria-expanded','false');if(focus&&anchor?.isConnected)anchor.focus();};menu._close=close;
    for(const [label,run] of [['更新信息',()=>owner._lookup.click()],['另存到…',()=>owner._save()],['复制引用',()=>owner._copy()],['设置',()=>this.settingsDialog(doc)]]){
      const b=this.button(doc,label,()=>{close();return run();});b.setAttribute('role','menuitem');menu.append(b);
    }
    menu.addEventListener('toggle',e=>{if(e.newState==='closed')close(false);});
    // PDF content lives in a child document; native popover light-dismiss does not cross that boundary.
    const outside=e=>{if(!menu.contains(e.target)&&!owner.querySelector('.cl-more')?.contains(e.target))close(false);};
    const documents=new Set([doc]);for(const frame of doc.querySelectorAll('iframe'))try{if(frame.contentDocument)documents.add(frame.contentDocument);}catch(_){}
    try{if(doc.defaultView.frameElement?.ownerDocument)documents.add(doc.defaultView.frameElement.ownerDocument);}catch(_){}
    for(const surface of documents){surface.addEventListener('pointerdown',outside,true);surface.addEventListener('mousedown',outside,true);cleanups.push(()=>{surface.removeEventListener('pointerdown',outside,true);surface.removeEventListener('mousedown',outside,true);});}
    const observer=new doc.defaultView.MutationObserver(()=>{if(!menu.isConnected)close(false);});observer.observe(doc.body,{childList:true,subtree:true});cleanups.push(()=>observer.disconnect());
    menu.addEventListener('keydown',e=>{
      const buttons=[...menu.querySelectorAll('button')],index=buttons.indexOf(e.target);
      if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();e.stopPropagation();buttons[e.key==='Home'?0:e.key==='End'?buttons.length-1:(index+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length].focus();}
      else if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();}
      else if(e.key==='Tab'){e.preventDefault();e.stopPropagation();close();const available=this.focusables(owner),i=available.indexOf(owner.querySelector('.cl-more'));available[i+(e.shiftKey?-1:1)]?.focus();}
    });
    const anchor=owner.querySelector('.cl-more');anchor.setAttribute('aria-expanded','true');anchor.setAttribute('aria-controls',menu.id);menu.showPopover();this.positionMenu(menu,doc);menu.firstElementChild.focus();
  },
  positionMenu(menu,doc) {
    if(!menu?.isConnected||!menu.matches(':popover-open'))return;
    const anchor=menu.parentElement.querySelector('.cl-more')?.getBoundingClientRect();if(!anchor)return;
    menu.style.left=Math.max(8,Math.min(anchor.right-menu.offsetWidth,doc.defaultView.innerWidth-menu.offsetWidth-8))+'px';
    menu.style.top=Math.max(8,Math.min(anchor.bottom+5,doc.defaultView.innerHeight-menu.offsetHeight-8))+'px';
  },
  style(doc) {
    if(!doc.getElementById('cite-lens-style')){const s=this.el(doc,'style',CiteLensStyle);s.id='cite-lens-style';(doc.head||doc.documentElement).append(s);}
    else if(doc.getElementById('cite-lens-style').textContent!==CiteLensStyle)doc.getElementById('cite-lens-style').textContent=CiteLensStyle;
    this.appearance(doc);
  },
  appearance(doc) {
    const s=CiteLensServices.state.settings,html=doc.documentElement;
    html.dataset.clTheme=['light','paper','dark'].includes(s.theme)?s.theme:'system';
    html.style.setProperty('--cl-size',Math.max(12,Math.min(16,Number(s.fontSize)||13))+'px');
    const font=s.readingFont==='serif'?'Georgia,"Songti SC",serif':s.readingFont&&s.readingFont!=='system'?JSON.stringify(s.readingFont)+',sans-serif':'-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif';
    html.style.setProperty('--cl-reading-font',font);
  },
  status(node,text,error=false) {node.textContent=text;node.className='cl-status'+(error?' cl-error':'');node.setAttribute('role','status');node.setAttribute('aria-live','polite');},
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
  card(doc,initial,reader,{compact=false,detailed=false,context=null,onChange=null,onRecord=null}={}) {
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
      const ticket=++epoch;for(const child of [...root.children])if(child!==root._menu)child.remove();root.dataset.verified=String(!!record.verified);
      if(record.authorData&&record.authorData.inputKey!==CiteLensAuthors.key(record)&&(!record.DOI||C.doi(record.DOI)!==record.authorData.DOI))delete record.authorData;
      record.authorData=S.cachedAuthors(record)||record.authorData;
      const eyebrow=this.el(doc,'div',null,'cl-eyebrow');
      eyebrow.append(this.el(doc,'span',this.type(record)+(record.year?' · '+record.year:''),'cl-kicker'));
      const title=this.title(doc,record,'h3');
      root.append(eyebrow,title);
      const authorData=record.authorData,authors=authorData?.authors?.length?authorData.authors:record.creators?.length?record.creators:record.author?[{lastName:record.author}]:[];
      if(authors.length)root.append(this.authorList(doc,authors,{incomplete:!authorData?.authors?.length&&!record.verified&&/et al\b|…|\.\.\./i.test(record.raw||'')}));
      const journal=this.el(doc,'div',null,'cl-journal'),journalName=this.el(doc,'strong',record.journal||record.publisher||'','cl-journal-name');journalName.title=journalName.textContent;journal.append(journalName);root.append(journal);
      const currentMetric=S.metricFor(record);if(currentMetric.status==='available')journal.append(this.metric(doc,record));
      const doi=C.doi(record.DOI||authorData?.DOI);
      if(doi){const link=this.el(doc,'a','DOI ↗','cl-doi');link.href='https://doi.org/'+doi;link.title=doi;link.setAttribute('aria-label','打开 DOI '+doi);link.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();Zotero.launchURL(link.href);});journal.append(link);}
      if(record.journal&&record.publisher)root.append(this.el(doc,'div',record.publisher,'cl-publisher'));
      const actions=this.el(doc,'div',null,'cl-actions cl-card-tools'),status=this.el(doc,'div','','cl-status');actions.setAttribute('aria-label','文献操作');
      const saveRun=()=>this.saveDialog(doc,record,context,result=>{
        render();this.status(root.querySelector('.cl-status'),result.created?'已保存到所选位置':'已复用库中条目，未新增重复记录');onChange?.();
      });
      const save=this.button(doc,'保存',saveRun,true);save.title='保存到 Zotero';save.setAttribute('aria-label',save.title);
      const later=this.button(doc,this.queued(record)?'已在清单':'稍后读',async b=>{
        await S.enqueue(record,context);b.textContent='已在清单';b.setAttribute('aria-pressed','true');this.status(status,'已加入本地阅读清单');onChange?.();
      });later.setAttribute('aria-pressed',String(!!this.queued(record)));
      later.title='加入稍后阅读清单';actions.append(save,later);
      const more=this.quiet(doc,'…',()=>this.actionMenu(doc,root));more.classList.add('cl-more');more.setAttribute('aria-label','更多操作');more.setAttribute('aria-haspopup','menu');more.setAttribute('aria-expanded',String(!!root._menu));if(root._menu)more.setAttribute('aria-controls',root._menu.id);more.title='更多操作';actions.append(more);
      eyebrow.append(actions);root.append(status);
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
        if(items.length>1||items.some(x=>(x.collections?.length||0)>1))line.append(this.quiet(doc,'查看位置',()=>this.existingDialog(doc,items)));root.insertBefore(line,status);
        save.textContent=items.length===1?'打开 Zotero':'选择已有条目';
        // Replace the action itself, so an existing item is never silently re-created.
        const open=this.button(doc,items.length===1?'打开':'选择',()=>items.length===1?Zotero.getActiveZoteroPane().selectItem(items[0].item.id):this.existingDialog(doc,items),true);open.title=save.textContent;open.setAttribute('aria-label',save.textContent);save.replaceWith(open);
        if(items.length===1){
          const item=items[0].item,publisher=item.getField('publisher'),publication=item.getField('publicationTitle');
          const identifier=item.getField('ISSN'),metricChanged=(!record.ISSN&&!!identifier)||(!record.journal&&!!publication);
          if(!record.ISSN&&identifier)record.ISSN=identifier;
          if(!record.publisher&&publisher){record.publisher=publisher;if(!record.journal)journal.firstElementChild.textContent=publisher;else{const publisherLine=this.el(doc,'div','出版 · '+publisher,'cl-publisher');journal.after(publisherLine);}}
          if(!record.journal&&publication){record.journal=publication;journal.firstElementChild.textContent=publication;}
          if(metricChanged){render();return;}
        }
        doc.defaultView.requestAnimationFrame(()=>this.fitPopup(root,doc));
      }).catch(()=>{if(root.isConnected&&ticket===epoch)this.status(status,'暂时无法确认库中状态；保存时仍会检查重复。');});
      const metricSnapshot=JSON.stringify(S.metricFor(record));
      S.prepareLocalMetrics(record).then(()=>{if(root.isConnected&&ticket===epoch&&JSON.stringify(S.metricFor(record))!==metricSnapshot)render();}).catch(e=>Zotero.logError(e));
      root._lookup=lookup;root._autoLookup=()=>runLookup(false);doc.defaultView.requestAnimationFrame(()=>{this.fitAuthors(root,doc);this.fitPopup(root,doc);this.positionMenu(root._menu,doc);});
      doc.defaultView.clearTimeout(authorTimer);
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
    const b=popup.getBoundingClientRect(),width=doc.defaultView.innerWidth,height=doc.defaultView.innerHeight;
    const dx=b.left<8?8-b.left:b.right>width-8?width-8-b.right:0,dy=b.top<42?42-b.top:b.bottom>height-8?height-8-b.bottom:0;
    const shift=popup._clShift||{x:0,y:0};shift.x+=dx;shift.y+=dy;popup._clShift=shift;popup.style.translate=shift.x+'px '+shift.y+'px';
  },
  citationGroup(doc,records,reader,{context=null}={}) {
    const root=this.el(doc,'section',null,'cl-citation-group');root.dataset.citeLens='group';root.setAttribute('contenteditable','false');
    const slot=this.el(doc,'div',null,'cl-group-slot');let index=0,select,previous,next;
    const render=()=>{slot.replaceChildren(this.card(doc,records[index],reader,{compact:true,context,onRecord:record=>{records[index]=record;}}));if(select){select.value=String(index);previous.disabled=index===0;next.disabled=index===records.length-1;}};
    if(records.length>1){
      const head=this.el(doc,'div',null,'cl-group-head'),row=this.el(doc,'div',null,'cl-group-row');
      row.append(this.el(doc,'strong','此处引用 '+records.length+' 篇'));
      const controls=this.el(doc,'div',null,'cl-group-controls');previous=this.quiet(doc,'上一篇',()=>{index--;render();});next=this.quiet(doc,'下一篇',()=>{index++;render();});controls.append(previous,next);row.append(controls);
      select=this.el(doc,'select');select.setAttribute('aria-label','选择此处引用的文献');
      for(const [i,record] of records.entries()){const o=this.el(doc,'option',`${i+1}. ${record.author||'作者待核对'} ${record.year||''} · ${CiteLensCore.plainTitle(record.title||record.raw)}`);o.value=i;select.append(o);}
      select.addEventListener('change',()=>{index=Number(select.value);render();});head.append(row,select);root.append(head);
      // Only visible citation groups are checked; workbench lists do not launch hundreds of library queries.
      (async()=>{for(let offset=0;offset<records.length;offset+=3){if(!root.isConnected&&offset)return;await Promise.all(records.slice(offset,offset+3).map(async(record,j)=>{try{const matches=await CiteLensServices.locate(record),option=select.options[offset+j];if(matches.length)option.textContent+=' [已入库'+(matches.length>1?' '+matches.length+' 条':'')+']';}catch(_){}}));}})();
    }
    root.append(slot);render();return root;
  },
  existingDialog(doc,matches) {
    const {root,footer,close}=this.dialog(doc,'库中已有的文献');
    const perLibrary=new Map();for(const match of matches)perLibrary.set(match.libraryID,(perLibrary.get(match.libraryID)||0)+1);
    root.append(this.el(doc,'p',[...perLibrary.values()].some(n=>n>1)?'同一文献库中有重复记录。请选择要打开的条目；保存前需先在 Zotero 合并重复条目。':'这些记录位于不同文献库，请选择要打开的位置。','cl-note'));
    for(const match of matches){const item=match.item,box=this.el(doc,'div',null,'cl-candidate');box.append(this.el(doc,'div',match.libraryName+(match.editable?'':' · 只读'),'cl-kicker'),this.title(doc,{title:item.getField('title')}));
      const names=(match.collections||CiteLensServices.collectionPaths(item)).map(x=>x.path);box.append(this.el(doc,'div',names.length?names.join('；'):'未归入文献夹','cl-muted'),this.button(doc,'在 Zotero 打开',()=>{Zotero.getActiveZoteroPane().selectItem(item.id);close();}));root.append(box);}
    footer.append(this.button(doc,'返回',close));
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
    const previous=doc.activeElement,overlay=this.el(doc,'div',null,'cl-overlay'),frame=this.el(doc,'section',null,'cl-dialog '+className),head=this.el(doc,'header',null,'cl-dialog-header'),root=this.el(doc,'div',null,'cl-dialog-body'),footer=this.el(doc,'footer',null,'cl-dialog-footer');
    const heading=this.el(doc,'h2',title);heading.id='cl-dialog-title-'+(++this.sequence);
    frame.setAttribute('role','dialog');frame.setAttribute('aria-modal','true');if(header)frame.setAttribute('aria-labelledby',heading.id);else frame.setAttribute('aria-label',title);frame.tabIndex=-1;
    let closed=false,busy=false;
    const close=()=>{if(closed||busy)return;closed=true;overlay.remove();onClose?.();if(previous?.isConnected)previous.focus();};
    const dismiss=this.quiet(doc,'关闭',close);dismiss.setAttribute('aria-label','关闭'+title);
    if(title.startsWith('Paper Nexus')){heading.classList.add('pn-brand-heading');heading.prepend(this.logo(doc,30));}head.append(heading,dismiss);if(header)frame.append(head);frame.append(root,footer);overlay.append(frame);(doc.body||doc.documentElement).append(overlay);
    overlay.addEventListener('keydown',e=>{
      if(e.key==='Escape'){e.stopPropagation();e.preventDefault();close();return;}
      this.tab(frame,e);
    });frame.focus();
    return {root,frame,footer,overlay,close,setBusy(value){busy=value;dismiss.disabled=value;frame.setAttribute('aria-busy',String(value));}};
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
    const C=CiteLensCore,S=CiteLensServices,dialog=this.dialog(doc,records?'批量保存到 Zotero':'保存到 Zotero'),{root,footer,close}=dialog,targets=S.targets();
    if(!targets.length){root.append(this.el(doc,'p','没有可写入的文献库。请在 Zotero 中检查个人库或群组权限。'));footer.append(this.button(doc,'关闭',close));return dialog;}
    const summary=this.el(doc,'div',null,'cl-save-summary');
    summary.append(records?this.el(doc,'div',`${records.length} 篇文献`,'cl-title'):this.title(doc,original),this.el(doc,'div',records?'相同条目会复用，失败条目保留在清单。':this.byline(original),'cl-muted'));root.append(summary);
    const library=this.field(doc,root,'文献库','','select'),collection=this.field(doc,root,'文献夹','','select');
    const create=this.disclosure(doc,'新建文献夹');const newCollection=this.field(doc,create,'新建文献夹名称');newCollection.placeholder='在所选位置内建立';newCollection.maxLength=150;root.append(create);
    for(const t of targets){const o=this.el(doc,'option',t.name);o.value=t.id;library.append(o);}
    library.value=String(targets.find(t=>t.id===S.state.settings.lastTarget?.libraryID)?.id||targets[0].id);
    const populate=()=>{
      collection.replaceChildren();const o=this.el(doc,'option','文献库根目录');o.value='';collection.append(o);
      for(const c of targets.find(t=>String(t.id)===library.value).collections){const option=this.el(doc,'option',c.name);option.value=c.id;collection.append(option);}
      const last=S.state.settings.lastTarget;if(last?.libraryID===Number(library.value)&&[...collection.options].some(o=>o.value===String(last.collectionID)))collection.value=String(last.collectionID);
    };populate();library.addEventListener('change',populate);
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
      const raw=this.disclosure(doc,'对照原始参考文献');raw.append(this.el(doc,'p',original.raw,'cl-raw cl-reference-text'));review.append(raw);
    }else{
      review=this.disclosure(doc,'查看本次保存的文献');for(const e of records)review.append(this.el(doc,'p',`${e.record.title} · ${this.byline(e.record)}`,'cl-raw'));root.append(review);
    }
    const advanced=this.disclosure(doc,'其他保存位置');advanced.append(this.el(doc,'p','文献夹用于分类。若需要独立的群组文献库，请先在 Zotero 创建群组并同步。','cl-muted'),this.quiet(doc,'前往 Zotero 创建群组',()=>Zotero.launchURL('https://www.zotero.org/groups/new')));root.append(advanced);
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
    const controls=this.el(doc,'div',null,'cl-header-tools');controls.append(this.quiet(doc,'文献网络',()=>CiteLens.showNetwork(reader)),this.quiet(doc,'设置',()=>this.settingsDialog(doc)),this.quiet(doc,'关闭',close));const brand=this.el(doc,'div','Paper Nexus','cl-brand');brand.prepend(this.logo(doc,28));row.append(brand,controls);
    const subtitle=this.el(doc,'div','研联 · 阅读与关联','cl-subtitle'),tabs=this.el(doc,'div',null,'cl-tabs');tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','文献范围');
    search.type='search';search.placeholder='搜索题名、作者、年份或 DOI';search.setAttribute('aria-label','搜索参考文献');
    head.append(row,subtitle,tabs,search);root.append(head,body,footer);doc.body.append(root);
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
          const title=this.button(doc,'',()=>{scroll=body.scrollTop;selected=entry;render();});title.className='cl-row-title';title.append(this.title(doc,record,'span'));title.title=CiteLensCore.plainTitle(record.title||record.raw);
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
    root.addEventListener('keydown',e=>{if(e.key==='Escape'){e.stopPropagation();close();}else this.tab(root,e,false);});
    search.addEventListener('input',()=>{queries[view]=search.value;scroll=0;render();});
    root.addEventListener('keydown',e=>{if(!root.closest('.cl-root,.cl-overlay'))this.tab(root,e,false);});
    root.addEventListener('cl-metrics-changed',render);render();return root;
  },
  manualDialog(doc,reader) {
    const {root,footer,close}=this.dialog(doc,'粘贴参考文献'),input=this.field(doc,root,'完整参考文献','','textarea'),status=this.el(doc,'div','','cl-status');
    input.placeholder='粘贴作者、年份、题名和期刊等信息';input.rows=5;root.append(this.el(doc,'p','粘贴后即可查看并保存。','cl-muted'),status);
    footer.append(this.button(doc,'取消',close),this.button(doc,'识别并查看',()=>{if(input.value.trim().length<12){this.status(status,'请粘贴完整的参考文献。',true);input.focus();return;}const record={...CiteLensCore.parse(input.value),source:'手动粘贴 · 待核对'};close();CiteLens.showPanel(reader,{record});},true));input.focus();
  },
  batchDialog(doc,rows,refresh) {
    const ready=rows.filter(x=>x.record.verified);
    if(ready.length!==rows.length){
      const {root,footer,close}=this.dialog(doc,'选择可保存的文献');
      root.append(this.el(doc,'p',`${ready.length} / ${rows.length} 篇可直接保存，其余文献请打开后检查信息。`,'cl-note'));
      footer.append(this.button(doc,'返回清单',close));
      if(ready.length)footer.append(this.button(doc,`保存这 ${ready.length} 篇`,()=>{close();this.saveDialog(doc,null,null,refresh,ready);},true));return;
    }
    this.saveDialog(doc,null,null,refresh,ready);
  },
  settingsDialog(doc) {
    const S=CiteLensServices,existing=doc.querySelector('.cl-settings');if(existing){existing.focus();return;}
    let unsubscribe=()=>{};
    const {root,footer,close}=this.dialog(doc,'Paper Nexus 设置',{className:'cl-settings',onClose:()=>unsubscribe()}),status=this.el(doc,'div','','cl-status');
    const version=this.quiet(doc,'v'+CiteLens.version,()=>Zotero.launchURL(CiteLens.homepage+'/releases/latest'));version.title='版本说明与手动下载安装包';version.classList.add('cl-version');
    const update=this.button(doc,'检查更新',()=>CiteLensUpdater.phase==='available'?CiteLensUpdater.apply():CiteLensUpdater.check()),updateStatus=this.el(doc,'div','','cl-status');updateStatus.dataset.updateStatus='true';
    footer.append(version,update,this.button(doc,'完成',close));
    const persist=async()=>{await S.persist();for(const reader of CiteLens.readers.keys())this.appearance(reader._iframeWindow.document);this.appearance(doc);};
    const row=(parent,label,key,input,description='')=>{const row=this.el(doc,'div',null,'cl-setting-row'),text=this.el(doc,'div'),lab=this.el(doc,'label',label);input.id='cl-setting-'+key;lab.htmlFor=input.id;text.append(lab);if(description)text.append(this.el(doc,'p',description,'cl-muted'));row.append(text,input);parent.append(row);return input;};
    const select=(parent,label,key,choices)=>{
      const input=this.el(doc,'select');for(const [value,name] of choices){const option=this.el(doc,'option',name);option.value=value;input.append(option);}input.value=String(S.state.settings[key]??choices[0][0]);
      input.addEventListener('change',async()=>{try{S.state.settings[key]=key==='fontSize'?Number(input.value):input.value;await persist();if(key==='metricYear')CiteLens.refreshMetrics();}catch(e){this.status(status,e.message,true);}});return row(parent,label,key,input);
    };
    const toggle=(parent,label,key,enabled,description='',changed=null)=>{
      const input=this.el(doc,'input');input.type='checkbox';input.checked=enabled;
      input.addEventListener('change',async()=>{input.disabled=true;try{if(key==='autoLookup'&&input.checked&&!await this.networkConsent(doc)){input.checked=false;return;}S.state.settings[key]=input.checked;await persist();changed?.();}catch(e){this.status(status,e.message,true);}finally{input.disabled=false;}});return row(parent,label,key,input,description);
    };
    const heading=text=>root.append(this.el(doc,'h3',text,'cl-section-title'));
    heading('外观');const appearance=this.el(doc,'div',null,'cl-appearance-grid');root.append(appearance);
    select(appearance,'配色','theme',[['system','跟随系统'],['light','明亮'],['paper','纸色'],['dark','深色']]);
    select(appearance,'字号','fontSize',[13,12,14,15,16].map(n=>[String(n),n===13?'13 · 默认':String(n)]));
    const fonts=[['system','系统默认'],['serif','衬线阅读']];
    try{const installed=Array.from(Components.classes['@mozilla.org/gfx/fontenumerator;1'].createInstance(Components.interfaces.nsIFontEnumerator).EnumerateAllFonts());for(const f of ['Arial','Helvetica Neue','Aptos','Noto Sans','Noto Sans CJK SC','Microsoft YaHei','PingFang SC'])if(installed.includes(f))fonts.push([f,f]);}catch(_){}
    if(S.state.settings.readingFont&&!fonts.some(x=>x[0]===S.state.settings.readingFont))fonts.push([S.state.settings.readingFont,S.state.settings.readingFont]);
    select(appearance,'题名字体','readingFont',fonts);
    heading('自动补全');
    toggle(root,'作者列表','autoAuthors',S.state.settings.autoAuthors!==false,'超过六位时显示前三位与后三位',()=>{S.authorGeneration=(S.authorGeneration||0)+1;CiteLens.refreshAuthors();});
    toggle(root,'文献信息','autoLookup',!!S.state.settings.autoLookup,'后台更新，不弹出候选窗口');
    heading('期刊指标');
    const yearChoices=()=>{const years=S.metricYears().map(String);if(S.state.settings.metricYear&&!years.includes(String(S.state.settings.metricYear)))years.unshift(String(S.state.settings.metricYear));return [['','最新可用年份'],...years.map(y=>[y,y])];};
    const year=select(root,'指标年份','metricYear',yearChoices()),dataRow=this.el(doc,'div',null,'cl-setting-row'),ready=this.el(doc,'span','','cl-muted');
    let busy=false;
    const sync=()=>{ready.textContent=S.epIndex?'离线指标已就绪':'下载后可离线显示 IF / JCR';download.textContent=S.epIndex?'更新数据':'下载指标';const value=year.value;year.replaceChildren();for(const [v,label] of yearChoices()){const o=this.el(doc,'option',label);o.value=v;year.append(o);}year.value=value;};
    const load=async(file=null)=>{if(busy)return;busy=true;download.disabled=true;this.status(status,file?'正在导入…':'正在下载指标…');try{await S.loadEasyPubMed(file);CiteLens.refreshMetrics();sync();this.status(status,'指标已更新');}catch(e){this.status(status,e.message,true);}finally{busy=false;download.disabled=false;}};
    const download=this.button(doc,'',()=>load());dataRow.append(ready,download);root.append(dataRow);sync();
    const more=this.disclosure(doc,'更多设置');root.append(more);
    const automatic=this.el(doc,'input');automatic.type='checkbox';row(more,'自动更新插件','autoUpdate',automatic);
    automatic.addEventListener('change',async()=>{automatic.disabled=true;try{await CiteLensUpdater.setAutomatic(automatic.checked);}finally{automatic.disabled=false;}});
    unsubscribe=CiteLensUpdater.subscribe(state=>{if(!root.isConnected){unsubscribe();return;}automatic.checked=state.automatic;automatic.title=state.globallyEnabled?'由 Zotero 定期检查并安装更新':'Zotero 的全局自动更新已关闭';version.textContent='v'+state.version;update.textContent=state.phase==='available'?'安装 v'+state.availableVersion:state.phase==='checking'?'检查中…':state.phase==='installing'?'更新中…':'检查更新';update.disabled=['checking','installing'].includes(state.phase);this.status(updateStatus,state.message||(!state.globallyEnabled?'Zotero 自动更新已关闭，仍可手动检查。':''),state.phase==='error');});
    toggle(more,'使用本地已有指标','preferInstalledMetrics',S.state.settings.preferInstalledMetrics!==false,'',()=>CiteLens.refreshMetrics());
    toggle(more,'使用离线指标','easyPubMedEnabled',S.state.settings.easyPubMedEnabled!==false,'',()=>CiteLens.refreshMetrics());
    const actions=this.el(doc,'div',null,'cl-actions');
    actions.append(this.button(doc,'导入指标文件',async()=>{const file=await CiteLens.picker('open','导入期刊指标',[['CSV / JSON / ZIP','*.csv;*.json;*.zip']]);if(!file)return;if(/\.zip$/i.test(file)){await load(file);return;}if((await IOUtils.stat(file)).size>20*1024*1024)throw Error('指标文件大于 20 MB');await S.importMetrics(await IOUtils.readUTF8(file));CiteLens.refreshMetrics();sync();this.status(status,'指标已导入');}),this.button(doc,'清除查询缓存',async()=>{S.state.cache={};S.state.authorCache={};S.authorGeneration=(S.authorGeneration||0)+1;await persist();this.status(status,'缓存已清除');}));more.append(actions);
    root.append(this.el(doc,'p','仅查询当前参考文献，不上传 PDF 或文献库。','cl-settings-note'),status,updateStatus);
    if(S.metricWarning||S.loadWarning)this.status(status,S.metricWarning||S.loadWarning,true);
  }
};
