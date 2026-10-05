/* A scoped reading workspace: connections always have an inspectable reason. */
var CiteLensNetworkUI={
  open(reader=null,{doc=Zotero.getMainWindow().document,onClose=null}={}){
    const U=CiteLensUI,N=CiteLensNetwork,C=CiteLensCore,NC=CiteLensNetworkCore;
    const existing=doc.querySelector('.pn-network');if(existing){existing.focus();return existing;}
    let loaded=false,activeKinds=new Set(['cites','related','author']),alive=true,unsubscribe=()=>{},searchEpoch=0,data,nodes=[],results=[],selected='',graphVisible=false,fulltext=null,history=[],evidenceDialog=null;
    const dialog=U.dialog(doc,'Paper Nexus · 文献网络',{className:'pn-network',onClose:()=>{alive=false;searchEpoch++;unsubscribe();evidenceDialog?.close();N.views.delete(dialog.close);onClose?.();}}),{root,frame,footer}=dialog;N.views.add(dialog.close);
    const settings=U.quiet(doc,'设置',()=>U.settingsDialog(doc));frame.querySelector('.cl-dialog-header').insertBefore(settings,frame.querySelector('.cl-dismiss'));
    frame.dataset.paperNexus='network';root.classList.add('pn-body');
    const controls=U.el(doc,'div',null,'pn-controls'),library=U.el(doc,'select'),collection=U.el(doc,'select'),search=U.el(doc,'input'),mode=U.el(doc,'select'),status=U.el(doc,'div','','cl-status');
    library.setAttribute('aria-label','文献库');collection.setAttribute('aria-label','文献夹');search.type='search';search.placeholder='题名、作者或关键词';search.setAttribute('aria-label','搜索本地文献');mode.setAttribute('aria-label','搜索范围');
    for(const [value,label] of [['metadata','书目信息'],['fulltext','已索引全文']]){const o=U.el(doc,'option',label);o.value=value;mode.append(o);}
    const searchButton=U.button(doc,'搜索',()=>runSearch()),refresh=U.button(doc,'刷新',()=>reload(true));refresh.title='重新读取本地文献库';
    const scopes=U.el(doc,'div',null,'pn-scopes');scopes.append(library,collection,refresh);const query=U.el(doc,'div',null,'pn-query');query.append(search,mode,searchButton);controls.append(scopes,query);
    const split=U.el(doc,'div',null,'pn-split'),sidebar=U.el(doc,'section',null,'pn-sidebar'),count=U.el(doc,'div','','pn-list-count'),list=U.el(doc,'div',null,'pn-list'),detail=U.el(doc,'section',null,'pn-detail');list.setAttribute('aria-label','本地文献');sidebar.append(count,list);split.append(sidebar,detail);root.append(controls,status,split);
    const coverage=U.el(doc,'span','','cl-muted');footer.append(coverage,U.quiet(doc,'导出列表',()=>CiteLens.exportRIS(results)));
    const option=(parent,value,label)=>{const o=U.el(doc,'option',label);o.value=value;parent.append(o);};
    const focusItem=id=>{if(id!==selected&&selected)history.push(selected);selected=id;renderDetail();for(const b of list.querySelectorAll('.pn-paper'))b.setAttribute('aria-current',String(b.dataset.node===selected));};
    const updateCollections=()=>{collection.replaceChildren();option(collection,'','所有文献夹');for(const c of data.collections.filter(c=>!library.value||c.libraryID===Number(library.value)))option(collection,String(c.id),'　'.repeat(c.level)+c.name);};
    const scoped=()=>N.scope(data,library.value,collection.value);
    const resultSnippet=(node,parent)=>{const hit=fulltext?.results.get(node.id)?.[0];if(hit){parent.append(U.el(doc,'p',hit.snippet,'pn-snippet'));const open=U.quiet(doc,'打开命中附件',async()=>{await N.openPDF(node,hit);dialog.close();});open.title='打开包含这段文字的附件';parent.append(open);}};
    const renderList=()=>{
      list.replaceChildren();count.textContent=results.length+' 篇文献';let shown=0;
      const append=()=>{for(const node of results.slice(shown,shown+50)){
        const row=U.el(doc,'article',null,'pn-list-row'),b=U.button(doc,'',()=>focusItem(node.id));b.className='pn-paper';b.dataset.node=node.id;b.setAttribute('aria-current',String(node.id===selected));b.append(U.title(doc,node,'span'),U.el(doc,'span',[node.creators[0]?.lastName,node.year,node.journal].filter(Boolean).join(' · '),'cl-muted'));row.append(b);resultSnippet(node,row);list.append(row);
      }shown+=50;if(shown<results.length){const more=U.button(doc,'继续显示',()=>{more.remove();append();});more.classList.add('pn-load-more');list.append(more);}};
      if(!results.length)list.append(U.el(doc,'p',search.value?'没有匹配文献。试试更短的关键词。':'此范围暂无文献。','pn-empty'));else append();
    };
    const evidence=(relation,node,parent)=>{
      if(relation.kind==='cites'){
        const source=relation.direction==='out'?data.byID.get(selected):node;
        const button=U.quiet(doc,relation.direction==='out'?'引用':'被引用',()=>{
          evidenceDialog?.close();const proof=U.dialog(doc,'引用依据');evidenceDialog=proof;
          for(const e of relation.evidence){proof.root.append(U.el(doc,'p',e.raw,'pn-snippet'));proof.root.append(U.quiet(doc,Number.isInteger(e.pageIndex)?'打开来源 · 第 '+(e.pageIndex+1)+' 页':'打开来源 PDF',async()=>{await N.openPDF(source,e);proof.close();dialog.close();}));}
        });button.classList.add('pn-citation-evidence');button.title=(relation.direction==='out'?'当前文献引用此文':'此文引用当前文献')+' · 查看引用依据';parent.append(button);
      }else{
        const reason=U.el(doc,'span',relation.kind==='author'?'同名署名 · '+relation.name:'相关条目','pn-relation-label');
        if(relation.kind==='author')reason.title='完整署名相同，不代表已确认是同一位作者';parent.append(reason);
      }
    };
    const renderDetail=()=>{
      detail.replaceChildren();const node=data?.byID.get(selected);if(!node){detail.append(U.el(doc,'p','选择一篇文献，查看它的作者、引用和本地关联。','pn-empty'));return;}
      const head=U.el(doc,'header',null,'pn-detail-head'),nav=U.el(doc,'div',null,'cl-actions'),back=U.quiet(doc,'返回',()=>{selected=history.pop()||selected;renderDetail();renderList();});back.disabled=!history.length;
      const graph=U.quiet(doc,graphVisible?'收起关系图':'关系图',()=>{graphVisible=!graphVisible;renderDetail();});graph.setAttribute('aria-pressed',String(graphVisible));
      const openPDF=U.quiet(doc,'打开全文',async()=>{await N.openPDF(node);dialog.close();});openPDF.disabled=!node.attachments.length;openPDF.title=openPDF.disabled?'此条目没有本地全文附件':'';nav.append(back,U.quiet(doc,'打开条目',async()=>{await N.openItem(node);dialog.close();}),openPDF,graph);
      const publication=U.el(doc,'div',null,'pn-publication'),journal=U.el(doc,'span',[node.year,node.journal].filter(Boolean).join(' · '),'cl-muted');journal.title=journal.textContent;publication.append(journal);head.append(nav,U.title(doc,node,'h3'),publication);
      if(node.creators.length){
        const authorLine=U.el(doc,'div',null,'pn-authors');let expanded=false;
        const renderAuthors=()=>{
          authorLine.replaceChildren();authorLine.dataset.expanded=String(expanded);
          const authors=expanded?node.creators.map(author=>({author})):CiteLensAuthors.visible(node.creators);
          for(const {author:a,gapAfter} of authors){const name=[a.firstName,a.lastName].filter(Boolean).join(' '),b=U.quiet(doc,expanded?name:(a.lastName||a.firstName),()=>{mode.value='metadata';search.value=name;runSearch();});b.classList.add('pn-author');b.title=name+' · 查找此署名的本地文献';authorLine.append(b);
            if(gapAfter){const more=U.quiet(doc,'…',()=>{expanded=true;renderAuthors();authorLine.querySelector('.pn-author-toggle').focus();});more.classList.add('pn-author-toggle');more.setAttribute('aria-label','展开全部 '+node.creators.length+' 位作者');more.setAttribute('aria-expanded','false');authorLine.append(more);}
          }
          if(expanded){const less=U.quiet(doc,'收起',()=>{expanded=false;renderAuthors();authorLine.querySelector('.pn-author-toggle').focus();});less.classList.add('pn-author-toggle');less.setAttribute('aria-expanded','true');authorLine.append(less);}
        };renderAuthors();head.append(authorLine);
      }
      const read=U.quiet(doc,'读取引文',async b=>{
        const attachment=node.attachments.find(a=>a.type==='application/pdf');if(!attachment)return;b.disabled=true;U.status(status,'正在读取此文的参考文献…');
        try{const r=await Zotero.Reader.open(attachment.id);await r._initPromise;CiteLens.attach(r);const refs=await CiteLens.references(r);await N.remember(r,refs);if(alive){await reload(true);U.status(status,'已读取 '+refs.length+' 条参考文献');}}catch(e){if(alive)U.status(status,e.message,true);}finally{if(b.isConnected)b.disabled=false;}
      });read.disabled=!node.attachments.some(a=>a.type==='application/pdf');read.title=read.disabled?'需要本地 PDF 附件':'从 PDF 参考文献中匹配库内文献，不联网';nav.append(read);detail.append(head);if(node.collections.length){const paths=node.collections.map(id=>{const names=[],seen=new Set();let c=data.collections.find(x=>x.id===id);while(c&&!seen.has(c.id)){seen.add(c.id);names.unshift(c.name);c=data.collections.find(x=>x.id===c.parentID);}return names.join(' › ');}).filter(Boolean);const loc=U.el(doc,'span',paths.join(' · '),'pn-location');loc.title=paths.join('\n');publication.append(loc);}
      const filters=U.el(doc,'div',null,'pn-filters'),kinds=['cites','related','author'],labels=['引用关系','已有相关条目','同名署名'];for(let i=0;i<kinds.length;i++){const label=U.el(doc,'label'),input=U.el(doc,'input');input.type='checkbox';input.checked=activeKinds.has(kinds[i]);input.value=kinds[i];label.append(input,doc.createTextNode(labels[i]));input.addEventListener('change',()=>{input.checked?activeKinds.add(input.value):activeKinds.delete(input.value);renderConnections();});filters.append(label);}detail.append(filters);
      const count=U.el(doc,'span','','pn-connection-count');filters.append(count);const content=U.el(doc,'div',null,'pn-connections');detail.append(content);
      const renderConnections=()=>{
        content.replaceChildren();const active=[...filters.querySelectorAll('input:checked')].map(x=>x.value),relations=NC.neighbors(data,selected,{scope:nodes.map(n=>n.id),kinds:active});
        if(graphVisible&&relations.length){const area=U.el(doc,'div',null,'pn-graph');content.append(area);this.graph(doc,area,node,relations.slice(0,12),focusItem);if(relations.length>12)content.append(U.el(doc,'div','图中显示前 12 项，完整关联见下方列表。','pn-graph-note'));}
        count.textContent=relations.length+' 篇关联文献';
        if(!relations.length)content.append(U.el(doc,'p','当前范围内尚无已知关联。可读取此文引文，或扩大文献夹范围。','pn-empty'));
        for(const result of relations){const row=U.el(doc,'article',null,'pn-connection'),b=U.button(doc,'',()=>focusItem(result.node.id));b.className='pn-paper';b.append(U.title(doc,result.node,'span'));const meta=U.el(doc,'div',null,'pn-connection-meta');meta.append(U.el(doc,'span',[result.node.creators[0]?.lastName,result.node.year].filter(Boolean).join(' · '),'cl-muted'));row.append(b,meta);for(const r of result.relations.filter(r=>r.kind!=='author'&&(r.kind!=='related'||!result.relations.some(x=>x.kind==='cites'))))evidence(r,result.node,meta);const shared=result.relations.filter(r=>r.kind==='author');if(shared.length){const names=[...new Set(shared.map(r=>r.name))],label=U.el(doc,'span','同名署名 · '+(names.length===1?names[0]:names.length+' 位'),'pn-relation-label');label.title=names.join('；')+'\n完整署名相同，不代表已确认是同一位作者';meta.append(label);}content.append(row);}
      };renderConnections();
    };
    const applySearch=()=>{nodes=scoped();results=fulltext?nodes.filter(n=>fulltext.results.has(n.id)):NC.search(nodes,search.value);if(!results.some(n=>n.id===selected))selected=results[0]?.id||'';renderList();renderDetail();coverage.textContent='全库已读取 '+data.coverage.sources+' 份 PDF 引文';count.textContent=results.length===nodes.length?results.length+' 篇文献':results.length+' / '+nodes.length+' 篇文献';};
    const runSearch=async()=>{
      const ticket=++searchEpoch;fulltext=null;searchButton.disabled=false;if(!data)return;
      if(mode.value==='fulltext'&&search.value.trim()){
        searchButton.disabled=true;results=[];selected='';renderList();renderDetail();U.status(status,'正在搜索本地已索引全文…');
        try{const found=await N.searchFulltext(scoped(),search.value,{cancelled:()=>!alive||ticket!==searchEpoch,progress:(done,total)=>{if(alive&&ticket===searchEpoch)U.status(status,'搜索附件 '+done+' / '+total);}});if(!alive||ticket!==searchEpoch||found.cancelled)return;fulltext=found;U.status(status,'搜索了 '+found.stats.searched+' 份已索引附件'+(found.stats.unindexed?' · '+found.stats.unindexed+' 份未索引':'')+(found.stats.tooLarge?' · '+found.stats.tooLarge+' 份过大已跳过':'')+(found.stats.errors?' · '+found.stats.errors+' 份暂不可读':''));}
        catch(e){if(alive&&ticket===searchEpoch)U.status(status,e.message,true);return;}finally{if(alive&&ticket===searchEpoch)searchButton.disabled=false;}
      }else U.status(status,'');if(alive&&ticket===searchEpoch)applySearch();
    };
    const reload=async(force=false)=>{
      refresh.disabled=true;U.status(status,'正在读取本地文献库…');const previousLibrary=library.value,previousCollection=collection.value;searchEpoch++;searchButton.disabled=false;
      try{data=await N.snapshot({force});if(!alive)return;library.replaceChildren();option(library,'','全部文献库');for(const lib of data.libraries)option(library,String(lib.id),lib.name);library.value=loaded?previousLibrary:String(Zotero.Items.get(reader?.itemID)?.libraryID||Zotero.getActiveZoteroPane().getSelectedLibraryID()||'');loaded=true;updateCollections();collection.value=previousCollection;const current=Zotero.Items.get(reader?.itemID)?.parentItem||Zotero.getActiveZoteroPane().getSelectedItems()?.[0];if(!selected&&current?.isRegularItem())selected=NC.id(current.libraryID,current.key);refresh.textContent='刷新';await runSearch();}
      catch(e){if(alive)U.status(status,e.message,true);}finally{if(alive)refresh.disabled=false;}
    };
    library.addEventListener('change',()=>{searchEpoch++;fulltext=null;updateCollections();selected='';history=[];runSearch();});collection.addEventListener('change',()=>{selected='';history=[];runSearch();});mode.addEventListener('change',()=>runSearch());search.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();runSearch();}});
    let timer;search.addEventListener('input',()=>{doc.defaultView.clearTimeout(timer);if(mode.value==='metadata')timer=doc.defaultView.setTimeout(()=>{if(alive)runSearch();},160);else{searchEpoch++;searchButton.disabled=false;fulltext=null;results=[];selected='';renderList();renderDetail();U.status(status,'按 Enter 搜索当前全文关键词');}});
    unsubscribe=N.subscribe(()=>{if(alive){refresh.textContent='刷新 ·';refresh.title='文献库或引用记录已有变化';}});reload();return frame;
  },
  graph(doc,host,center,relations,select){
    const NS='http://www.w3.org/2000/svg',svg=doc.createElementNS(NS,'svg');svg.setAttribute('viewBox','0 0 600 260');svg.setAttribute('role','img');svg.setAttribute('aria-label','当前文献的局部关系图；下方列表提供同样内容');host.append(svg);
    const defs=doc.createElementNS(NS,'defs'),marker=doc.createElementNS(NS,'marker'),arrow=doc.createElementNS(NS,'path'),markerID='pn-arrow-'+(++CiteLensUI.sequence);for(const [k,v] of Object.entries({id:markerID,viewBox:'0 0 10 10',refX:'8',refY:'5',markerWidth:'6',markerHeight:'6',orient:'auto-start-reverse'}))marker.setAttribute(k,v);arrow.setAttribute('d','M 0 0 L 10 5 L 0 10 z');arrow.setAttribute('fill','var(--cl-accent)');marker.append(arrow);defs.append(marker);svg.append(defs);const group=doc.createElementNS(NS,'g');svg.append(group);let zoom=1,offset={x:0,y:0};
    const nodes=[{node:center,x:300,y:130,center:true},...relations.map((r,i)=>({node:r.node,kind:(r.relations.find(x=>x.kind==='cites')||r.relations[0]).kind,direction:r.relations.find(x=>x.kind==='cites')?.direction,x:300+210*Math.cos(i/relations.length*Math.PI*2-Math.PI/2),y:130+95*Math.sin(i/relations.length*Math.PI*2-Math.PI/2)}))],lines=[];
    for(const n of nodes.slice(1)){const line=doc.createElementNS(NS,'line');line.setAttribute('class','pn-edge pn-edge-'+n.kind);if(n.kind==='cites')line.setAttribute(n.direction==='out'?'marker-end':'marker-start','url(#'+markerID+')');group.append(line);lines.push({line,n});}
    const render=()=>{for(const {line,n} of lines){const dx=n.x-nodes[0].x,dy=n.y-nodes[0].y,len=Math.hypot(dx,dy)||1;for(const [k,v] of Object.entries({x1:nodes[0].x+dx/len*14,y1:nodes[0].y+dy/len*14,x2:n.x-dx/len*10,y2:n.y-dy/len*10}))line.setAttribute(k,v);}for(const n of nodes)n.element.setAttribute('transform',`translate(${n.x} ${n.y})`);};
    for(const n of nodes){const g=doc.createElementNS(NS,'g');n.element=g;g.setAttribute('class','pn-node'+(n.center?' pn-center':''));g.setAttribute('tabindex','0');g.setAttribute('role','button');g.setAttribute('aria-label',n.node.title);const title=doc.createElementNS(NS,'title');title.textContent=n.node.title;const circle=doc.createElementNS(NS,'circle');circle.setAttribute('r',n.center?'11':'7');const text=doc.createElementNS(NS,'text');text.setAttribute('y','24');text.setAttribute('text-anchor','middle');text.textContent=[n.node.creators?.[0]?.lastName||n.node.title.slice(0,12),n.node.year].filter(Boolean).join(' · ');g.append(title,circle,text);group.append(g);
      let drag=null,moved=false;g.addEventListener('pointerdown',e=>{e.stopPropagation();g.setPointerCapture(e.pointerId);drag={x:e.clientX,y:e.clientY,nx:n.x,ny:n.y};moved=false;});g.addEventListener('pointermove',e=>{if(!drag)return;const scale=600/svg.getBoundingClientRect().width/zoom,dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(Math.abs(dx)+Math.abs(dy)>4)moved=true;n.x=drag.nx+dx*scale;n.y=drag.ny+dy*scale;render();});g.addEventListener('pointercancel',()=>{drag=null;moved=false;});g.addEventListener('pointerup',e=>{if(!drag)return;drag=null;g.releasePointerCapture(e.pointerId);if(!moved&&!n.center)select(n.node.id);});g.addEventListener('keydown',e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();e.stopPropagation();select(n.node.id);}});
    }
    render();const transform=()=>group.setAttribute('transform',`translate(${offset.x} ${offset.y}) translate(300 130) scale(${zoom}) translate(-300 -130)`);
    let pan;svg.addEventListener('pointerdown',e=>{if(e.target.closest('.pn-node'))return;pan={x:e.clientX,y:e.clientY,ox:offset.x,oy:offset.y};svg.setPointerCapture(e.pointerId);});svg.addEventListener('pointermove',e=>{if(pan){const scale=600/svg.getBoundingClientRect().width;offset={x:pan.ox+(e.clientX-pan.x)*scale,y:pan.oy+(e.clientY-pan.y)*scale};transform();}});svg.addEventListener('pointerup',()=>pan=null);svg.addEventListener('pointercancel',()=>pan=null);svg.setAttribute('tabindex','0');svg.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','-','0'].includes(e.key))return;e.preventDefault();e.stopPropagation();if(e.key==='+')zoom=Math.min(2.5,zoom+.2);else if(e.key==='-')zoom=Math.max(.6,zoom-.2);else if(e.key==='0'){zoom=1;offset={x:0,y:0};}else{offset.x+=(e.key==='ArrowRight'?20:e.key==='ArrowLeft'?-20:0);offset.y+=(e.key==='ArrowDown'?20:e.key==='ArrowUp'?-20:0);}transform();});
    const buttons=CiteLensUI.el(doc,'div',null,'pn-graph-tools');for(const [label,run] of [['＋',()=>zoom=Math.min(2.5,zoom+.2)],['−',()=>zoom=Math.max(.6,zoom-.2)],['复位',()=>{zoom=1;offset={x:0,y:0};}]]){const b=CiteLensUI.quiet(doc,label,()=>{run();transform();});b.setAttribute('aria-label',label==='＋'?'放大关系图':label==='−'?'缩小关系图':'复位关系图');buttons.append(b);}host.append(buttons);const legend=CiteLensUI.el(doc,'div',null,'pn-graph-legend');legend.append(CiteLensUI.el(doc,'span','→ 引用方向'),CiteLensUI.el(doc,'span','— 相关条目'),CiteLensUI.el(doc,'span','┄ 同名署名'));host.append(legend);
  }
};
