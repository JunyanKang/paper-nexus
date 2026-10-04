const base=Zotero.CiteLensTestRoot,{CiteLens:P,CiteLensUI:U,CiteLensNetwork:N,CiteLensServices:S}=Zotero.CiteLensQA,report={run:'network-interaction',checks:[]},check=(name,ok)=>{report.checks.push({name,ok});if(!ok)throw Error(name);},wait=()=>Zotero.Promise.delay(240);let frame;
try{
 const d=Zotero.getMainWindow().document;frame=P.showNetwork();for(let i=0;i<80&&!frame.querySelector('.pn-paper');i++)await wait();
 const byText=t=>[...frame.querySelectorAll('button')].find(x=>x.textContent===t),scopes=frame.querySelectorAll('.pn-scopes select'),mode=frame.querySelector('.pn-query select'),q=frame.querySelector('.pn-query input'),search=frame.querySelector('.pn-query button');
 check('Logo loads in the main document',frame.querySelector('.pn-logo').naturalWidth>0);
 const rows=[...frame.querySelectorAll('.pn-list-row')];check('Every paper title lies inside its clickable row without overlap',rows.every(row=>{const a=row.getBoundingClientRect(),b=row.querySelector('.cl-title').getBoundingClientRect();return b.top>=a.top&&b.bottom<=a.bottom+1;}));
 scopes[0].value='';scopes[0].dispatchEvent(new d.defaultView.Event('change'));await wait();byText('刷新').click();await wait();check('Refresh retains explicit all-library scope',scopes[0].value==='');
 q.value='NEXUS-NO-SUCH-ARTICLE-888';q.dispatchEvent(new d.defaultView.Event('input'));await wait();check('No-result search cannot leave an unrelated selected paper',!frame.querySelector('.pn-detail-head')&&frame.textContent.includes('没有匹配文献'));
 q.value='fovea';mode.value='fulltext';mode.dispatchEvent(new d.defaultView.Event('change'));for(let i=0;i<80&&search.disabled;i++)await wait();check('Fulltext search returns source snippets',!!frame.querySelector('.pn-snippet'));
 q.value='changed';q.dispatchEvent(new d.defaultView.Event('input'));check('Editing fulltext query removes stale hits',!frame.querySelector('.pn-snippet')&&!search.disabled);
 mode.value='metadata';q.value='';mode.dispatchEvent(new d.defaultView.Event('change'));await wait();
 const first=frame.querySelector('.pn-paper');first.click();await wait();const checkbox=frame.querySelector('.pn-filters input[value=author]');checkbox.click();const second=frame.querySelectorAll('.pn-list .pn-paper')[1];second.click();await wait();check('Relationship filter persists when changing focus',!frame.querySelector('.pn-filters input[value=author]').checked);
 byText('关系图')?.click();await wait();const svg=frame.querySelector('svg');if(svg){const group=svg.querySelector('g');svg.dispatchEvent(new d.defaultView.KeyboardEvent('keydown',{key:'+',bubbles:true}));check('Graph keyboard zoom changes viewport',group.getAttribute('transform').includes('1.2'));}
 byText('打开条目').click();await wait();check('Opening an item removes the obstructing dialog',!frame.isConnected);
 frame=P.showNetwork();await wait();check('Reopening works after opening library item',frame.isConnected);frame.querySelector('.cl-dialog-header button').click();report.passed=true;
}catch(e){report.passed=false;report.error=String(e);report.stack=e.stack;}
finally{frame?.querySelector('.cl-dialog-header button')?.click();await IOUtils.writeUTF8(base+'/test-results/network-interaction.json',JSON.stringify(report,null,2));}return report;
