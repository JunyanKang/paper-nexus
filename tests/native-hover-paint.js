const base=Zotero.CiteLensTestRoot,{CiteLens:P,CiteLensServices:S,CiteLensCore:C,CiteLensUI:U}=Zotero.CiteLensQA;
const report={run:'hover-first-paint',checks:[],samples:[]},check=(name,ok,extra={})=>{report.checks.push({name,ok,...extra});if(!ok)throw Error(name);};
const r=Zotero.Reader._readers.find(x=>x._internalReader?._primaryView?._iframeWindow?.PDFViewerApplication?.pdfDocument.numPages===36),d=r._iframeWindow.document,v=r._internalReader._primaryView,w=d.defaultView,settings={...S.state.settings};
const show=o=>v._onSetOverlayPopup(Components.utils.cloneInto({...o,rect:v.getClientRect(o.position.rects[0],o.position.pageIndex)},r._iframeWindow));
let original=U.citationGroup;Zotero.getMainWindow().clearInterval(P.timer);
try{
 S.state.settings.autoAuthors=false;S.state.settings.autoLookup=false;
 await Zotero.Reader.open(r.itemID);for(const el of d.querySelectorAll('.cl-root,.cl-overlay,.cl-floating'))el.remove();
 const data=await v._iframeWindow.PDFViewerApplication.pdfDocument.getProcessedData(),refs=Object.values(data.pages).flatMap(p=>(p.overlays||[]).filter(x=>x.type==='citation'&&x.references?.length));
 await P.references(r);const state=P.readers.get(r),audit=o=>Zotero.CiteLensQA.CiteLensCitationLinks.resolve(o,state.citationPages.get(o.position.pageIndex),state.referenceList),verified=refs.map(o=>({o,a:audit(o)})).filter(x=>x.a.records.length);
 const single=verified.find(x=>x.a.records.length===1&&x.a.records[0].author==='Polyak'&&x.a.records[0].year==='1957')?.o,multi=verified.find(x=>x.a.records.length===4)?.o,large=verified.reduce((a,b)=>a.a.records.length>b.a.records.length?a:b).o;check('Real source-verified single and grouped fixtures exist',!!single&&!!multi&&!!large);
 for(const [idx,o] of [single,multi,single,large,multi].entries()){
  v._onSetOverlayPopup(null);await r.navigate({position:o.position});await Zotero.Promise.delay(1300);
  const samples=[];let running=true;const sample=()=>{if(!running)return;const pop=d.querySelector('.citation-popup');if(pop){const inner=pop.querySelector(':scope > .inner'),group=pop.querySelector(':scope > [data-cite-lens=group]');samples.push({nativeVisible:!!inner&&w.getComputedStyle(inner).display!=='none'&&inner.getBoundingClientRect().height>0,card:!!group&&group.getBoundingClientRect().height>0&&w.getComputedStyle(pop).display!=='none',title:group?.querySelector('.cl-title')?.textContent});}w.requestAnimationFrame(sample);};w.requestAnimationFrame(sample);show(o);await Zotero.Promise.delay(330);running=false;
  report.samples.push({trial:idx,count:audit(o).records.length,frames:samples});check('Every visible frame directly shows enhanced card '+idx,samples.length>0&&samples.every(x=>x.card&&!x.nativeVisible),{frames:samples.length});
 }
 const popup=d.querySelector('.citation-popup');check('One group per native popup',popup.querySelectorAll(':scope > [data-cite-lens=group]').length===1);
 popup.classList.remove('cl-native-host');await new Promise(resolve=>w.requestAnimationFrame(resolve));check('Native class updates cannot remove compact width',popup.classList.contains('cl-native-host')&&popup.getBoundingClientRect().width<=420);
 P.detach(r);await Zotero.Promise.delay(30);check('Detach restores native original immediately',w.getComputedStyle(popup.querySelector('.inner')).display!=='none'&&!popup.querySelector('.cl-card'));
 // Enhancement failure restores the real native popup, without retry loops.
 U.citationGroup=()=>{throw Error('Intentional QA render failure');};P.attach(r);await P.references(r);P.enhance(r);await Zotero.Promise.delay(80);check('Failed enhancement leaves native text usable',w.getComputedStyle(popup.querySelector('.inner')).display!=='none'&&!popup.classList.contains('cl-native-host'));
 U.citationGroup=original;P.detach(r);P.attach(r);await P.references(r);P.enhance(r);await Zotero.Promise.delay(80);check('Reattach clears failure marker and restores card',!!popup.querySelector('.cl-card')&&w.getComputedStyle(popup.querySelector('.inner')).display==='none');
 report.passed=true;
}catch(e){report.passed=false;report.error=String(e);report.stack=e.stack;}
finally{P.timer=Zotero.getMainWindow().setInterval(()=>P.scan(),1200);U.citationGroup=original;S.state.settings=settings;await IOUtils.writeUTF8(base+'/test-results/hover-first-paint.json',JSON.stringify(report,null,2));}
return report;
