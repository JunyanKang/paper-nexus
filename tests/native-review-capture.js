const base=Zotero.CiteLensTestRoot,{CiteLens:P,CiteLensCore:C,CiteLensServices:S,CiteLensUI:U}=Zotero.CiteLensQA,round=(await IOUtils.readUTF8(base+'/test-results/review-round.txt')).trim(),report={passed:true,round,shots:[],checks:[]};
const capture=async(d,node,name)=>{await Zotero.Promise.delay(180);const b=node.getBoundingClientRect(),canvas=d.createElement('canvas');canvas.width=Math.ceil(b.width)*2;canvas.height=Math.ceil(b.height)*2;const ctx=canvas.getContext('2d');ctx.scale(2,2);ctx.drawWindow(d.defaultView,b.x,b.y,canvas.width/2,canvas.height/2,'#fff');const path=base+'/test-results/review-'+round+'-'+name+'.png';await IOUtils.write(path,Uint8Array.from(d.defaultView.atob(canvas.toDataURL('image/png').split(',')[1]),x=>x.charCodeAt(0)));report.shots.push(path);};
try{
const r=Zotero.Reader._readers.find(r=>r._internalReader?._primaryView?._iframeWindow?.PDFViewerApplication?.pdfDocument.numPages===36),d=r._iframeWindow.document,main=Zotero.getMainWindow().document;
S.state.settings.theme='light';S.state.settings.fontSize=13;S.state.settings.readingFont='system';S.state.settings.autoAuthors=false;S.state.settings.autoLookup=false;S.state.settings.networkConsent=true;
for(const x of main.querySelectorAll('.pn-network .cl-dialog-header button'))x.click();
const frame=P.showNetwork(r);for(let i=0;i<100&&!frame.querySelector('.pn-paper');i++)await Zotero.Promise.delay(100);
const selects=frame.querySelectorAll('.pn-scopes select'),col=Zotero.Collections.getByLibrary(Zotero.Libraries.userLibraryID).find(c=>c.name==='Paper Nexus · Retina QA');selects[1].value=String(col.id);selects[1].dispatchEvent(new main.defaultView.Event('change'));await Zotero.Promise.delay(150);
await capture(main,frame,'network');report.checks.push({name:'Visible list titles',ok:[...frame.querySelectorAll('.pn-paper .cl-title')].every(x=>x.getBoundingClientRect().height>12)});
[...frame.querySelectorAll('button')].find(x=>x.textContent==='关系图')?.click();frame.querySelector('.pn-graph')?.scrollIntoView({block:'center'});await capture(main,frame,'graph');frame.querySelector('.cl-dialog-header button').click();
await Zotero.Reader.open(r.itemID);for(const x of d.querySelectorAll('.cl-root,.cl-overlay,.cl-floating'))x.remove();
const refs=await P.references(r),record=refs.find(x=>x.author==='Hendrickson'&&x.year==='2000'),resolved=U.resolved(record);
P.floating(d,r,[record,refs.find(x=>x.author==='Polyak'&&x.year==='1957')],{x:90,y:100});await Zotero.Promise.delay(300);const hover=d.querySelector('.cl-floating');await capture(d,hover,'hover');hover.querySelector('.cl-more').click();await capture(d,d.querySelector('.cl-menu'),'menu');d.querySelector('.cl-menu')._close();
const save=U.saveDialog(d,{...resolved,verified:true},U.context(r));await capture(d,save.frame,'save');save.close();
U.settingsDialog(d);await capture(d,d.querySelector('.cl-dialog'),'settings');for(const node of d.querySelectorAll('.cl-dialog details'))node.open=true;d.querySelector('.cl-dialog-body').scrollTop=d.querySelector('.cl-dialog-body').scrollHeight;await capture(d,d.querySelector('.cl-dialog'),'settings-more');d.querySelector('.cl-overlay button[aria-label^=关闭]').click();
P.showPanel(r);await Zotero.Promise.delay(500);await capture(d,d.querySelector('.cl-root'),'panel');
report.passed=report.checks.every(x=>x.ok);
}catch(e){report.passed=false;report.error=String(e);report.stack=e.stack;}
await IOUtils.writeUTF8(base+'/test-results/review-'+round+'.json',JSON.stringify(report,null,2));return report;
