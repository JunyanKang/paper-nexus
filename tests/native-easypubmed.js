const base=Zotero.CiteLensTestRoot,{CiteLens:P,CiteLensServices:S,CiteLensCore:C,CiteLensUI:U}=Zotero.CiteLensQA;
if(Services.dirsvc.get('ProfD',Components.interfaces.nsIFile).path!==base+'/qa-profile')throw Error('Isolated QA profile required');
const report={run:'easypubmed',version:P.version,checks:[],startedAt:new Date().toISOString()},check=(name,ok)=>{report.checks.push({name,ok});if(!ok)throw Error(name);},settings={...S.state.settings},local=S.state.metrics,request=Zotero.HTTP.request;
const reader=Zotero.Reader._readers.find(x=>x._internalReader?._primaryView?._iframeWindow?.PDFViewerApplication?.pdfDocument.numPages===36),doc=reader._iframeWindow.document;
const capture=async(el,name)=>{await Zotero.Promise.delay(220);const b=el.getBoundingClientRect(),canvas=doc.createElement('canvas');canvas.width=Math.ceil(b.width+24)*2;canvas.height=Math.ceil(b.height+24)*2;const ctx=canvas.getContext('2d');ctx.scale(2,2);ctx.drawWindow(doc.defaultView,b.x-12,b.y-12,canvas.width/2,canvas.height/2,'#f0f2ef');await IOUtils.write(base+'/test-results/'+name+'.png',Uint8Array.from(doc.defaultView.atob(canvas.toDataURL('image/png').split(',')[1]),x=>x.charCodeAt(0)));return {width:b.width,height:b.height};};
const click=(root,text)=>{const b=[...root.querySelectorAll('button')].find(x=>x.textContent===text);if(!b)throw Error('Missing '+text);b.click();};
try{
 let requests=[];Zotero.HTTP.request=function(method,url,options){requests.push(url);return request.call(this,method,url,options);};
 const [index,duplicate]=await Promise.all([S.loadEasyPubMed(),S.loadEasyPubMed()]);
 check('Public archive downloaded once without a key or paper identifiers',requests.length===1&&requests[0].endsWith('/EasyPubMedicine_0.1.24.zip')&&!requests[0].includes('?')&&index===duplicate);
 check('Real archive yields a large yearly dataset',index.journals.length>22000&&index.count>100000&&index.years[0]===2025);
 report.dataset={journals:index.journals.length,rows:index.count,years:index.years,skipped:index.skipped,provenance:index.provenance};
 check('Separate dataset persisted',await IOUtils.exists(S.epPath));check('User metrics are not overwritten',S.state.metrics===local);
 S.state.metrics=[];S.state.settings={...settings,easyPubMedEnabled:true,metricYear:'',theme:'light',fontSize:13,readingFont:'system'};
 const science=S.metricFor({ISSN:'1095-9203',journal:'Science'}),retina=S.metricFor({journal:'Prog. Retin. Eye Res.'});
 check('Science eISSN resolves to source value and explicit metric year',science.jif===47.3&&science.metricYear===2025&&science.categories[0].quartile==='Q1');
 check('PubMed abbreviation resolves independently',retina.jif===16.2&&retina.journal==='PROGRESS IN RETINAL AND EYE RESEARCH');
 check('All five metric years survive import',science.history.length===5&&S.metricFor({ISSN:'0036-8075'},2021).jif===63.832);
 check('Requested absent year remains missing',S.metricFor({ISSN:'0036-8075'},2026).status==='missing');
 check('Conflicting journal identifiers require review',S.metricFor({ISSN:'0036-8075,0028-0836'}).status==='ambiguous');
 check('Book metrics remain inapplicable',S.metricFor({type:'book',journal:'Science'}).status==='not-applicable');
 const synthetic=C.metricsImport(JSON.stringify([{issn:'0036-8075',journal:'Science',metricYear:2024,jif:1.2,category:'SYNTHETIC QA ONLY',quartile:'Q3',source:'SYNTHETIC QA ONLY'}]));S.state.metrics=synthetic;
 check('User-supplied source is preferred even if older',S.metricFor({ISSN:'0036-8075'}).source==='SYNTHETIC QA ONLY');S.state.metrics=[];
 let rejected=false;try{await S.loadEasyPubMed(base+'/addon/manifest.json');}catch(_){rejected=true;}check('Invalid local package preserves previous dataset',rejected&&S.epIndex===index);
 Zotero.HTTP.request=async()=>{throw Error('SIMULATED OFFLINE');};rejected=false;try{await S.loadEasyPubMed();}catch(_){rejected=true;}
 check('Download failure preserves last usable data',rejected&&S.epIndex===index&&S.metricFor({ISSN:'0036-8075'}).jif===47.3);
 await S.persist();S.epIndex=null;await S.init();check('Dataset reload and lookup work while network is disabled',S.metricFor({journal:'Science'}).jif===47.3);
 S.state.settings.easyPubMedEnabled=false;check('Provider can be disabled',S.metricFor({journal:'Science'}).status==='missing');S.state.settings.easyPubMedEnabled=true;
 await Zotero.Reader.open(reader.itemID);for(const n of doc.querySelectorAll('.cl-overlay,.cl-floating,.cl-root'))n.remove();U.appearance(doc);
 const refs=await P.references(reader),original=refs.find(x=>x.author==='Abramov'&&x.year==='1982');P.floating(doc,reader,[original],{x:250,y:160});await Zotero.Promise.delay(600);
 const root=doc.querySelector('.cl-floating');check('Actual cited paper displays the retrieved metric',root.textContent.includes('IF 47.3')&&root.textContent.includes('2025')&&root.textContent.includes('JCR Q1'));
 report.card=await capture(root,'23-easypubmed-hover');check('Enriched hover remains compact',report.card.height<300&&report.card.width<=422&&root.scrollWidth<=root.clientWidth+2);
 U.details(doc,U.resolved(original),reader,{expanded:true});await Zotero.Promise.delay(200);let dialog=doc.querySelector('.cl-dialog');click(dialog,'指标与来源');await Zotero.Promise.delay(100);
 check('Details show data source, ISSNs and all historical rows',dialog.textContent.includes('离线期刊指标')&&dialog.textContent.includes('0036-8075')&&dialog.querySelectorAll('.cl-history tr').length===6);
 dialog.querySelector('details:has(.cl-history)').open=true;await capture(dialog,'24-easypubmed-history');doc.querySelector('.cl-overlay').remove();
 U.settingsDialog(doc,'metrics');await Zotero.Promise.delay(150);dialog=doc.querySelector('.cl-settings');check('Secondary settings expose keyless dataset and yearly selection',dialog.textContent.includes('重新获取离线数据')&&dialog.textContent.includes('2021–2025')&&!dialog.querySelector('input[type=password]'));await capture(dialog,'25-easypubmed-settings');
 [...dialog.querySelectorAll('details')].find(x=>x.querySelector('summary')?.textContent==='高级数据管理').open=true;const select=dialog.querySelector('#cl-setting-easyPubMedEnabled');select.value='false';select.dispatchEvent(new doc.defaultView.Event('change',{bubbles:true}));await Zotero.Promise.delay(250);check('Disable setting refreshes an open hover immediately',!root.textContent.includes('IF 47.3'));
 select.value='true';select.dispatchEvent(new doc.defaultView.Event('change',{bubbles:true}));await Zotero.Promise.delay(250);check('Enable setting refreshes an open hover immediately',root.textContent.includes('IF 47.3'));
 report.corpus=[];for(const r of Zotero.Reader._readers){const pdf=r._internalReader?._primaryView?._iframeWindow?.PDFViewerApplication?.pdfDocument;if(!pdf)continue;const refs=await P.references(r);report.corpus.push({pages:pdf.numPages,references:refs.length,locallyMatchedMetrics:refs.filter(x=>S.metricFor(U.resolved(x)).status==='available').length});}
 report.passed=true;
}catch(e){report.passed=false;report.error=String(e);report.stack=e.stack;}
finally{Zotero.HTTP.request=request;S.state.metrics=local;S.state.settings={...settings,easyPubMedEnabled:true};await S.persist();U.appearance(doc);for(const n of doc.querySelectorAll('.cl-overlay,.cl-floating'))n.remove();await IOUtils.writeUTF8(base+'/test-results/easypubmed.json',JSON.stringify(report,null,2));}
return report;
