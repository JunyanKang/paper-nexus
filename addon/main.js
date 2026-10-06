var CiteLens = {
  id:'cite-lens@local.research',name:'Paper Nexus',label:'Paper Nexus',homepage:'https://github.com/JunyanKang/paper-nexus',toolbarNodes:new WeakMap(),readers:new Map(),panels:new Map(),windows:new Map(),dead:false,
  async start() {
    if(this.rootURI){const resources=Services.io.getProtocolHandler('resource').QueryInterface(Components.interfaces.nsIResProtocolHandler);this.assetResource='paper-nexus-'+this.version.replace(/\./g,'-');resources.setSubstitutionWithFlags(this.assetResource,Services.io.newURI(this.rootURI),resources.ALLOW_CONTENT_ACCESS);this.assetURI='resource://'+this.assetResource+'/assets/';}
    await Zotero.uiReadyPromise;await CiteLensServices.init();CiteLensTranslation.init();await CiteLensThemes.initialize();this.dead=false;await CiteLensUpdater.start(this);await CiteLensNetwork.start();await CiteLensModels.start();CiteLensSemantic.start();
    this.toolbarHandler=e=>{if(this.dead)return;const button=this.toolbar(e.doc,e.reader);if(!button.isConnected)e.append(button);this.normalizeToolbar(e.doc);e.doc.defaultView.setTimeout(()=>{if(!this.dead)this.normalizeToolbar(e.doc);},0);};
    this.selectionHandler=({doc,reader,params,append})=>{
      const raw=params.annotation?.text;if(!raw||raw.length<4)return;
      const b=CiteLensUI.button(doc,'识别引文',async()=>{
        const refs=await this.references(reader).catch(()=>[]),matched=CiteLensCore.findCitations(raw,refs);
        const record=matched.length===1?matched[0]:{...CiteLensCore.parse(raw,params.annotation?.position),source:'选区文本（待核对）'};
        if(matched.length>1)this.floating(doc,reader,matched,{x:24,y:80});else this.showPanel(reader,{record,context:CiteLensUI.context(reader,params.annotation?.position?.pageIndex)});
      });b.dataset.citeLens='selection';append(b);
    };
    Zotero.Reader.registerEventListener('renderToolbar',this.toolbarHandler,this.id);
    Zotero.Reader.registerEventListener('renderTextSelectionPopup',this.selectionHandler,this.id);
    for(const win of Zotero.getMainWindows())this.addWindow(win);
    this.scan();this.timer=Zotero.getMainWindow().setInterval(()=>this.scan(),1200);Zotero.CiteLens=this;
  },
  addWindow(win) {if(this.windows.has(win))return;const e=win.document.createXULElement('menuitem');e.id='cite-lens-tools';e.setAttribute('class','menuitem-iconic');e.setAttribute('image',this.assetURI+'nexus.png');e.setAttribute('label','Paper Nexus');e.addEventListener('command',()=>{const reader=Zotero.Reader.getByTabID(win.Zotero_Tabs.selectedID);this.showNetwork(reader);});win.document.getElementById('menu_ToolsPopup')?.append(e);this.windows.set(win,e);},
  removeWindow(win) {this.windows.get(win)?.remove();this.windows.delete(win);CiteLensThemes.release(win.document);},
  toolbar(doc,reader) {const existing=this.toolbarNodes.get(doc)||doc.querySelector('[data-cite-lens=toolbar]');if(existing){existing._paperToolbarLive=true;this.toolbarNodes.set(doc,existing);return existing;}const b=CiteLensUI.button(doc,'',()=>this.togglePanel(reader));b.prepend(CiteLensUI.logo(doc,24));b.dataset.citeLens='toolbar';b.setAttribute('aria-label','Paper Nexus');b.setAttribute('aria-expanded','false');b.style.cssText='display:inline-flex;align-items:center;justify-content:center;padding:3px;width:32px;min-height:30px;font-size:12px';b._paperToolbarLive=true;this.toolbarNodes.set(doc,b);return b;},
  normalizeToolbar(doc) {
    const host=doc.querySelector('.toolbar .end')||doc.querySelector('.toolbar');if(!host)return;
    const buttons=[];for(const selector of ['[data-paper-voice="toolbar"]','[data-cite-lens="toolbar"]']){const found=[...doc.querySelectorAll(selector)];if(!found.length)continue;const keep=(selector.includes('cite-lens')?this.toolbarNodes.get(doc):null)||found.find(node=>node._paperToolbarLive)||found[0];for(const duplicate of found)if(duplicate!==keep)duplicate.remove();buttons.push(keep);}
    const tail=[...host.children].slice(-buttons.length);if(buttons.some((button,i)=>button.parentNode!==host||tail[i]!==button))host.append(...buttons);
  },
  scan() {
    if(this.dead)return;const active=new Set(Zotero.Reader._readers);
    for(const reader of active){try{this.attach(reader);}catch(e){Zotero.logError(e);}}
    for(const reader of this.readers.keys())if(!active.has(reader))this.detach(reader);
  },
  attach(reader) {
    const doc=reader._iframeWindow?.document;if(!doc?.body)return;CiteLensUI.style(doc);
    if(!doc.querySelector('[data-cite-lens="toolbar"]'))(doc.querySelector('.toolbar .end')||doc.querySelector('.toolbar'))?.append(this.toolbar(doc,reader));this.normalizeToolbar(doc);
    let state=this.readers.get(reader);
    if(!state){state={doc,hooks:[],refPromise:null};this.readers.set(reader,state);
      state.observer=new doc.defaultView.MutationObserver(records=>{
        if(records.some(r=>r.target.closest?.('.toolbar')))this.normalizeToolbar(doc);
        // Ignore our own subtree updates so async status changes cannot start a mutation loop.
        if(records.every(r=>(r.target.nodeType===3?r.target.parentElement:r.target).closest?.('.cl-card,.cl-root,.cl-overlay,.cl-citation-group')))return;
        // Mutation delivery runs before paint. A timer here exposes the native blue
        // citation for one or more frames before our replacement is ready.
        this.enhance(reader);
      });state.observer.observe(doc.body,{childList:true,characterData:true,attributes:true,attributeFilter:['class'],subtree:true});
      const reflow=()=>{for(const popup of doc.querySelectorAll('.cl-native-host,.cl-floating')){CiteLensUI.fitAuthors(popup,doc);CiteLensUI.fitPopup(popup,doc);}doc._clAbstract?.position?.();};doc.defaultView.addEventListener('resize',reflow);state.hooks.push(()=>doc.defaultView.removeEventListener('resize',reflow));
      const key=e=>{if(e.key==='Escape'&&!e.defaultPrevented){doc.querySelector('.cl-floating')?.remove();}};doc.addEventListener('keydown',key);state.hooks.push(()=>doc.removeEventListener('keydown',key));
    }
    // Read-only native overlay access; never replace Zotero's event handlers or text layer.
    for(const view of [reader._internalReader?._primaryView,reader._internalReader?._secondaryView]) {
      const pdfdoc=view?._iframeWindow?.document;if(!pdfdoc?.body||state.hooks.some(h=>h.doc===pdfdoc))continue;
      let timer,last='',hoverEpoch=0;const move=e=>{
        if(e.buttons||doc.querySelector('.cl-overlay')||e.target.closest?.('.cl-root,.cl-card,.cl-overlay'))return;
        let position,overlay;try{position=view.pointerEventToPosition?.(e);overlay=view._getSelectableOverlay?.(position);}catch(_){}
        // Native citation popups are enhanced by the observer. Bibliography entries need a small independent card.
        if(!overlay&&position){const refs=view._pdfPages?.[position.pageIndex]?.overlays||view._processedPageOverlays?.[position.pageIndex]||[];const point=position.rects?.[0];if(point)overlay=refs.find(x=>x.type==='reference'&&x.position?.rects?.some(r=>point[0]>=r[0]&&point[0]<=r[2]&&point[1]>=r[1]&&point[1]<=r[3]));}
        if(!overlay||overlay.type!=='reference'){
          const chars=view._pdfPages?.[position?.pageIndex]?.chars,point=position?.rects?.[0];
          const numeric=overlay?.type!=='citation'&&CiteLensCitationLinks.atPoint(state.citationPages?.get(position?.pageIndex),point,state.referenceList||[]);
          if(numeric?.records?.length){const key=position.pageIndex+':sup:'+numeric.text;if(last===key)return;last=key;pdfdoc.defaultView.clearTimeout(timer);const ticket=++hoverEpoch,frame=view._iframeWindow.frameElement?.getBoundingClientRect(),xy={x:e.clientX+(frame?.left||0),y:e.clientY+(frame?.top||0)};timer=pdfdoc.defaultView.setTimeout(()=>{if(ticket===hoverEpoch&&!this.dead)this.floating(doc,reader,numeric.records,xy,this.citationContext(reader,position));},500);return;}
          if(overlay?.type!=='citation'&&chars?.length&&point){
            const index=chars.findIndex(c=>c.rect&&point[0]>=c.rect[0]&&point[0]<=c.rect[2]&&point[1]>=c.rect[1]&&point[1]<=c.rect[3]);
            if(index>=0){const start=Math.max(0,index-100),end=Math.min(chars.length,index+100);let text='',offset=0;for(let j=start;j<end;j++){if(j===index)offset=text.length;text+=chars[j].c+((chars[j].spaceAfter||chars[j].lineBreakAfter)?' ':'');}
              if(/(?:1[6-9]|20)\d{2}|\[\d/.test(text)){
                const key=position.pageIndex+':'+index;if(last===key)return;last=key;pdfdoc.defaultView.clearTimeout(timer);const ticket=++hoverEpoch,frame=view._iframeWindow.frameElement?.getBoundingClientRect(),xy={x:e.clientX+(frame?.left||0),y:e.clientY+(frame?.top||0)};
                timer=pdfdoc.defaultView.setTimeout(async()=>{try{const refs=await this.references(reader);if(ticket!==hoverEpoch||this.dead)return;const hits=CiteLensCore.citationAt(text,offset,refs);if(hits.length)this.floating(doc,reader,hits,xy,this.citationContext(reader,position,chars[index]?.offset));}catch(_){}},500);return;
              }
            }
          }
          hoverEpoch++;last='';pdfdoc.defaultView.clearTimeout(timer);this.dismissFloating(reader);return;
        }
        const refs=overlay.references||[overlay],key=refs.map(CiteLensCore.charsText).join('|');if(!key||key===last)return;const ticket=++hoverEpoch;last=key;pdfdoc.defaultView.clearTimeout(timer);
        const frame=view._iframeWindow.frameElement?.getBoundingClientRect(),xy={x:e.clientX+(frame?.left||0),y:e.clientY+(frame?.top||0)};
        timer=pdfdoc.defaultView.setTimeout(async()=>{try{await this.references(reader);if(!this.dead&&ticket===hoverEpoch)this.floating(doc,reader,refs.map(ref=>this.referenceRecord(reader,ref)),xy);}catch(e){Zotero.logError(e);}},500);
      };pdfdoc.addEventListener('pointermove',move,{passive:true});const cleanup=()=>{pdfdoc.removeEventListener('pointermove',move);pdfdoc.defaultView.clearTimeout(timer);};cleanup.doc=pdfdoc;state.hooks.push(cleanup);
    }
    if(!state.refPromise)this.references(reader).then(()=>{if(!this.dead)this.enhance(reader);}).catch(e=>Zotero.logError(e));
    this.enhance(reader);
  },
  enhance(reader) {
    if(this.dead)return;const state=this.readers.get(reader),doc=state?.doc;if(!doc)return;
    const native=reader._internalReader?._state;
    for(const popup of doc.querySelectorAll('.citation-popup,.reference-popup')) {
      if(popup._clRetained)continue;doc.querySelector('.cl-floating[data-retained]')?.remove();
      const rows=[...popup.querySelectorAll('.inner .reference-row')];
      const sets=[native?.primaryViewOverlayPopup,native?.secondaryViewOverlayPopup].filter(x=>x?.references);
      const source=sets.find(x=>x.references.length===rows.length&&CiteLensCore.norm(CiteLensCore.charsText(x.references[0]))===CiteLensCore.norm(rows[0]?.firstElementChild?.textContent))||sets.find(x=>x.references.length===rows.length);
      const signature=rows.map(row=>row.firstElementChild?.textContent||'').join('\n')+'|'+(source?.offset??'')+'|'+(source?.position?.pageIndex??'')+'|'+!!state.referenceList;
      const old=popup.querySelector(':scope > [data-cite-lens="group"]');if(old?.dataset.raw===signature){if(!popup.classList.contains('cl-native-host'))popup.classList.add('cl-native-host');CiteLensUI.fitPopup(popup,doc);continue;}
      if(popup._clFailedSignature===signature)continue;
      let records=rows.map((row,i)=>{const raw=row.firstElementChild?.textContent||'',ref=source?.references[i],same=ref&&CiteLensCore.norm(CiteLensCore.charsText(ref))===CiteLensCore.norm(raw);return this.referenceRecord(reader,same?ref:{text:raw});});
      const citation=popup.classList.contains('citation-popup');let audit;
      if(citation){audit=CiteLensCitationLinks.resolve(source,state.citationPages?.get(source?.position?.pageIndex),state.referenceList||[]);records=audit.records;}popup.classList.toggle('cl-non-citation',!!(citation&&state.referenceList&&audit.expected===0));
      try {
        // Never paint a guessed destination while source-text verification is pending.
        const group=records.length?CiteLensUI.citationGroup(doc,records,reader,{context:citation?this.citationContext(reader,source?.position,source?.word?.[0]?.offset??source?.offset):CiteLensUI.context(reader,source?.position?.pageIndex)}):citation?CiteLensUI.el(doc,'div',state.referenceList?'未找到可确定对应的文献':'正在读取参考文献…','cl-citation-group cl-unresolved'):null;
        if(group&&citation){group.dataset.citeLens='group';group._citationAudit=audit;if(audit?.unresolved.length)group.append(CiteLensUI.el(doc,'div','另有 '+audit.unresolved.length+' 条引文未能确定对应','cl-match-note'));}
        if(group){group.dataset.raw=signature;if(old)old.replaceWith(group);else popup.append(group);popup.classList.add('cl-native-host');}
        else {old?.remove();popup.classList.remove('cl-native-host');}
        popup.style.translate='';popup._clShift={x:0,y:0};CiteLensUI.fitPopup(popup,doc);
      } catch(e) {
        // A failed enhancement must restore the original, never keep a stale card.
        popup._clFailedSignature=signature;old?.remove();popup.classList.remove('cl-native-host','cl-non-citation');popup.style.translate='';Zotero.logError(e);
      }
    }
  },
  dismissFloating(reader) {const state=this.readers.get(reader);if(!state)return;state.doc.defaultView.clearTimeout(state.floatingCloseTimer);state.floatingCloseTimer=state.doc.defaultView.setTimeout(()=>{if(!state.doc.querySelector('.cl-overlay')&&!state.doc.querySelector('.cl-floating:focus-within,.cl-floating:hover,.cl-summary:hover,.cl-citation-locations:hover')&&!state.doc._clAbstract)state.doc.querySelector('.cl-floating')?.remove();},550);},
  citationContext(reader,position,rawOffset){
    const context=CiteLensUI.context(reader,position?.pageIndex);if(!position)return context;
    context.citationPosition={pageIndex:position.pageIndex,rects:(position.rects||[]).map(r=>Array.from(r))};
    const page=this.readers.get(reader)?.citationPages?.get(position.pageIndex),point=position.rects?.[0];
    const char=rawOffset===undefined&&point?page?.chars?.find(c=>c.rect&&point[0]>=c.rect[0]&&point[0]<=c.rect[2]&&point[1]>=c.rect[1]&&point[1]<=c.rect[3]):null;
    const offset=page?.offsets.get(rawOffset??char?.offset);if(offset===undefined)return context;context.citationOffset=offset;
    const before=page.text.slice(0,offset),open=before.lastIndexOf('('),closed=before.lastIndexOf(')'),end=page.text.indexOf(')',offset);if(open>closed&&end>offset&&end-open<1600&&!page.text.slice(open+1,end).includes('('))context.citationRange=[open+1,end];
    return context;
  },
  retainCitation(doc,card) {
    const native=card.closest('.cl-native-host'),group=card.closest('.cl-citation-group');if(!native||!group)return;
    const reader=[...this.readers].find(([,state])=>state.doc===doc)?.[0];if(!reader)return;
    const bounds=native.getBoundingClientRect(),root=CiteLensUI.el(doc,'section',null,'cl-floating');root.dataset.citeLens='floating';root.dataset.retained='true';root.setAttribute('aria-label','参考文献卡片');
    native._clRetained=true;doc.querySelector('.cl-floating')?.remove();root.style.cssText=`left:${bounds.left}px;top:${bounds.top}px;width:${bounds.width}px`;root.append(group);doc.body.append(root);
    for(const view of [reader._internalReader?._primaryView,reader._internalReader?._secondaryView])view?._onSetOverlayPopup?.(null);
    const state=this.readers.get(reader);root.addEventListener('pointerenter',()=>doc.defaultView.clearTimeout(state?.floatingCloseTimer));root.addEventListener('pointerleave',()=>this.dismissFloating(reader));CiteLensUI.fitPopup(root,doc);
  },
  floating(doc,reader,records,xy,context=null) {
    doc.querySelector('.cl-floating')?.remove();const root=CiteLensUI.el(doc,'section',null,'cl-floating');root.dataset.citeLens='floating';root.setAttribute('aria-label','参考文献卡片');
    root.append(CiteLensUI.citationGroup(doc,records.slice(0,100),reader,{context}));doc.body.append(root);const state=this.readers.get(reader);root.addEventListener('pointerenter',()=>doc.defaultView.clearTimeout(state?.floatingCloseTimer));root.addEventListener('pointerleave',()=>this.dismissFloating(reader));
    root.style.left=Math.max(12,Math.min(xy.x,doc.defaultView.innerWidth-root.offsetWidth-12))+'px';root.style.top=Math.max(12,Math.min(xy.y+12,doc.defaultView.innerHeight-root.offsetHeight-12))+'px';
  },
  referenceRecord(reader,ref) {
    const state=this.readers.get(reader),record=CiteLensBibliography.fromReference(ref,state?.runningHeaders),matches=(state?.referenceList||[]).filter(r=>record.number?r.number===record.number:CiteLensCore.identity(r)===CiteLensCore.identity(record));return matches.length===1?matches[0]:record;
  },
  async references(reader) {
    const state=this.readers.get(reader);if(state?.refPromise)return state.refPromise;
    const promise=(async()=>{
      const pdf=reader._internalReader?._primaryView?._iframeWindow?.PDFViewerApplication?.pdfDocument;
      if(!pdf?.getProcessedData)throw Error('此阅读器尚未提供原生参考文献数据；请选中参考文献后使用「识别引文」。');
      let cacheKey=null;try{cacheKey=await CiteLensNetwork.referenceKey(reader,pdf);const cached=await CiteLensNetwork.readCache('refs',cacheKey);if(cached?.refs?.length){if(state){state.runningHeaders=cached.runningHeaders;state.citationPages=cached.citationPages;}return cached.refs;}}catch(e){Zotero.logError(e);}
      const data=await pdf.getProcessedData(),refs=new Map(),runningHeaders=CiteLensBibliography.runningHeaders(data.pages);if(state)state.runningHeaders=runningHeaders;if(state){state.citationPages=new Map();let slice=Date.now();for(const [i,page] of Object.entries(data.pages||{})){state.citationPages.set(Number(i),CiteLensCitationLinks.page(page.chars,page.overlays));if(Date.now()-slice>=8){await Zotero.Promise.delay(0);slice=Date.now();if(this.dead)throw Error('已关闭');}}}
      for(const [pageIndex,page] of Object.entries(data.pages||{}))for(const overlay of page.overlays||[]) {
        const list=overlay.references||(overlay.type==='reference'?[overlay]:[]);
        for(const ref of list){const r=CiteLensBibliography.fromReference(ref,runningHeaders);if(r.raw.length<12)continue;const key=CiteLensCore.identity(r);if(!refs.has(key))refs.set(key,r);}
      }
      // Parse only the bibliography tail around the first native reference, or scan headings if none exist.
      const native=[...refs.values()],first=native.length?Math.min(...native.map(x=>x.position?.pageIndex??pdf.numPages-1)):0,pages=[];
      for(let n=Math.max(0,first-1);n<pdf.numPages;n++) {if(this.dead)break;const page=Components.utils.waiveXrays(await pdf.getPage(n+1));pages.push({pageIndex:n,items:(await page.getTextContent()).items,width:Math.abs(page.view[2]-page.view[0]),height:Math.abs(page.view[3]-page.view[1])});await Zotero.Promise.delay(0);}
      const result=CiteLensBibliography.merge(native,CiteLensBibliography.parse(pages,runningHeaders)).sort((a,b)=>(a.position?.pageIndex||0)-(b.position?.pageIndex||0)||Math.floor((a.position?.rects?.[0]?.[0]||0)/80)-Math.floor((b.position?.rects?.[0]?.[0]||0)/80)||(b.position?.rects?.[0]?.[3]||0)-(a.position?.rects?.[0]?.[3]||0));
      if(result.length)await CiteLensNetwork.writeCache('refs',cacheKey,{refs:result,runningHeaders,citationPages:state?.citationPages?await this.compactCitationPages(state.citationPages):null});return result;
    })();if(state)state.refPromise=promise;
    try{const refs=await promise;if(state)state.referenceList=refs;CiteLensNetwork.remember(reader,refs).catch(e=>Zotero.logError(e));if(!refs.length&&state)state.refPromise=null;return refs;}catch(e){if(state)state.refPromise=null;throw e;}
  },
  async compactCitationPages(citationPages){const pages=[];for(const [id,page] of citationPages){if(this.dead)throw Error('已关闭');const numeric=new Set((page.pointRuns||[]).flatMap(r=>r.offsets)),ranges=(page.mentions||[]).map(m=>[m.start,m.end]).sort((a,b)=>a[0]-b[0]),chars=[],offsets=new Map();let range=0;for(const c of page.chars||[]){const at=page.offsets.get(c.offset);while(range<ranges.length&&ranges[range][1]<=at)range++;if(numeric.has(c.offset)||range<ranges.length&&at>=ranges[range][0]&&at<ranges[range][1]){chars.push({offset:c.offset,ignorable:c.ignorable,rect:c.rect?Array.from(c.rect):null});offsets.set(c.offset,at);}}pages.push([id,{text:page.text,offsets,mentions:page.mentions,pointRuns:page.pointRuns,chars}]);await Zotero.Promise.delay(0);}return new Map(pages);},
  async citationLocations(reader,record){
    const refs=await this.references(reader),state=this.readers.get(reader);if(!state?.citationPages)return [];
    if(!state.locationIndex){
      if(!state.locationPromise){
        const report=(value,error='')=>{state.locationProgress=value;const doc=reader._iframeWindow?.document;if(doc)doc.dispatchEvent(new doc.defaultView.CustomEvent('cl-location-progress',{detail:{value,error}}));};
        report(0);
        const job=(async()=>{const pages=[...await this.compactCitationPages(state.citationPages)];
          const lookup=new Map();for(const ref of refs){lookup.set(CiteLensCore.identity(ref),CiteLensCore.identity(ref));if(ref.raw)lookup.set(ref.raw,CiteLensCore.identity(ref));}state.locationLookup=lookup;const result=await CiteLensNetwork.compute('citations',{pages,refs},{progress:value=>report(value)});if(this.dead||!this.readers.has(reader))throw Error('已关闭');state.locationIndex=result;report(100);return result;})();
        state.locationPromise=job;job.catch(()=>report(null,'引用位置暂不可用')).finally(()=>{if(state.locationPromise===job)state.locationPromise=null;});
      }
      await state.locationPromise;
    }
    const key=state.locationLookup?.get(CiteLensCore.identity(record))||state.locationLookup?.get(record.raw);return key?state.locationIndex.get(key)||[]:[];
  },
  async jumpToCitation(reader,location){
    const view=reader._internalReader?._primaryView,win=reader._iframeWindow;if(!view||!location?.position)throw Error('无法定位此引用');
    await view.navigate(Components.utils.cloneInto({position:location.position},win),Components.utils.cloneInto({behavior:'instant',block:'center'},win));
    const pdfwin=view._iframeWindow;await Zotero.Promise.delay(180);const page=pdfwin.PDFViewerApplication?.pdfViewer?._pages[location.position.pageIndex];if(!page?.div)return;
    for(const old of pdfwin.document.querySelectorAll('.cl-citation-flash'))old.remove();
    for(const r of location.position.rects){const rect=page.viewport.convertToViewportRectangle(Components.utils.cloneInto(Array.from(r),pdfwin)),flash=pdfwin.document.createElement('div');flash.className='cl-citation-flash';flash.style.cssText='position:absolute;pointer-events:none;border-radius:3px;z-index:3;left:'+Math.min(rect[0],rect[2])+'px;top:'+Math.min(rect[1],rect[3])+'px;width:'+Math.abs(rect[2]-rect[0])+'px;height:'+Math.abs(rect[3]-rect[1])+'px;background:'+CiteLensThemes.resolve(CiteLensServices.state.settings.theme).highlight;page.div.append(flash);pdfwin.setTimeout(()=>flash.remove(),2400);}
  },
  showNetwork(reader=null){const panel=this.panels.get(reader),focused=panel?.ownerDocument.activeElement;if(panel){panel.hidden=true;panel.inert=true;}return CiteLensNetworkUI.open(reader,{onClose:()=>{if(panel?.isConnected){panel.hidden=false;panel.inert=false;focused?.focus();}}});},
  togglePanel(reader){const panel=this.panels.get(reader);if(panel?.isConnected){panel._clSetOpen?.(!panel._clOpen);return panel;}return this.showPanel(reader);},
  showPanel(reader,options={}) {this.panels.get(reader)?.remove();const doc=reader._iframeWindow.document,panel=CiteLensUI.panel(doc,reader,options);this.panels.set(reader,panel);return panel;},
  refreshMetrics() {for(const reader of this.readers.keys()){const doc=reader._iframeWindow.document;for(const card of doc.querySelectorAll('[data-cite-lens=card]'))card.dispatchEvent(new doc.defaultView.Event('cl-metrics-changed'));this.enhance(reader);doc.querySelector('.cl-root')?.dispatchEvent(new doc.defaultView.Event('cl-metrics-changed'));}},
  refreshAuthors() {for(const {doc} of this.readers.values())for(const card of doc.querySelectorAll('[data-cite-lens=card]'))card.dispatchEvent(new doc.defaultView.Event('cl-authors-changed'));},
  async picker(mode,title,filters,defaultName='Paper-Nexus-references.ris') {
    const {FilePicker}=ChromeUtils.importESModule('chrome://zotero/content/modules/filePicker.mjs');const fp=new FilePicker();fp.init(Zotero.getMainWindow(),title,mode==='save'?fp.modeSave:mode==='folder'?fp.modeGetFolder:fp.modeOpen);for(const [name,pattern] of filters)fp.appendFilter(name,pattern);if(mode==='save')fp.defaultString=defaultName;const result=await fp.show();return result===fp.returnOK||result===fp.returnReplace?fp.file:null;
  },
  async importMetrics() {const file=await this.picker('open','导入有来源的 JCR 指标',[['CSV / JSON','*.csv;*.json']]);if(!file)return null;const stat=await IOUtils.stat(file);if(stat.size>20*1024*1024)throw Error('指标文件大于 20 MB');const n=await CiteLensServices.importMetrics(await IOUtils.readUTF8(file));this.refreshMetrics();return n;},
  async exportRIS(records) {if(!records.length)return;const file=await this.picker('save','导出参考文献',[['RIS','*.ris']]);if(file)await IOUtils.writeUTF8(file,CiteLensCore.ris(records));},
  detach(reader) {
    try{this.toolbarNodes.delete(reader._iframeWindow.document);}catch(_){}
    const s=this.readers.get(reader);
    // Zotero may destroy an iframe before notifying plugins that its reader closed.
    // Releasing all other hooks/maps must still proceed when a DOM wrapper is dead.
    try{s?.doc._clAbstract?.close(true);s?.doc._clClosingAbstract?.();}catch(_){}
    try{s?.observer.disconnect();}catch(_){}
    try{if(s?.timer)s.doc.defaultView.clearTimeout(s.timer);if(s?.floatingCloseTimer)s.doc.defaultView.clearTimeout(s.floatingCloseTimer);}catch(_){}
    for(const cleanup of s?.hooks||[])try{cleanup();}catch(_){}
    try{this.panels.get(reader)?.remove();}catch(_){}this.panels.delete(reader);
    try{if(s?.doc){
      for(const popup of s.doc.querySelectorAll('.cl-native-host,.cl-floating'))popup._clLayoutCleanup?.();
      for(const e of s.doc.querySelectorAll('[data-cite-lens],.cl-overlay,#cite-lens-style'))e.remove();
      for(const e of s.doc.querySelectorAll('.cl-native-host')){e.classList.remove('cl-native-host','cl-non-citation');e.style.removeProperty('translate');delete e._clShift;}
      for(const popup of s.doc.querySelectorAll('.citation-popup,.reference-popup'))delete popup._clFailedSignature;
      s.doc.documentElement.removeAttribute('data-cl-theme');for(const property of ['--cl-size','--cl-user-size','--cl-reading-font'])s.doc.documentElement.style.removeProperty(property);
    }}catch(_){}
    if(s?.doc)CiteLensThemes.release(s.doc);this.readers.delete(reader);
  },
  async stop() {this.dead=true;CiteLensThemes.stop();CiteLensTranslation.stop();CiteLensUpdater.stop();await CiteLensNetwork.stop();await CiteLensSemantic.stop();await CiteLensModels.stop();Zotero.getMainWindow()?.clearInterval(this.timer);Zotero.Reader.unregisterEventListener('renderToolbar',this.toolbarHandler);Zotero.Reader.unregisterEventListener('renderTextSelectionPopup',this.selectionHandler);for(const r of [...this.readers.keys()])this.detach(r);for(const w of [...this.windows.keys()]){w.document.getElementById('cite-lens-style')?.remove();w.document.documentElement.removeAttribute('data-cl-theme');w.document.documentElement.style.removeProperty('--cl-size');w.document.documentElement.style.removeProperty('--cl-user-size');w.document.documentElement.style.removeProperty('--cl-reading-font');this.removeWindow(w);}if(this.assetResource)Services.io.getProtocolHandler('resource').QueryInterface(Components.interfaces.nsIResProtocolHandler).setSubstitution(this.assetResource,null);await CiteLensServices.stop();delete Zotero.CiteLens;}
};
