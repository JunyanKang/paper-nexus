const base=Zotero.CiteLensTestRoot,{CiteLens:P,CiteLensCore:C,CiteLensServices:S,CiteLensUI:U,CiteLensNetwork:N,CiteLensNetworkCore:NC}=Zotero.CiteLensQA,report={run:'local-network',version:P.version,checks:[]},check=(name,ok,extra={})=>{report.checks.push({name,ok,...extra});if(!ok)throw Error(name);};
let frame;
try{
 const r=Zotero.Reader._readers.find(x=>x._internalReader?._primaryView?._iframeWindow?.PDFViewerApplication?.pdfDocument.numPages===36);if(!r)throw Error('Open the real 36-page PDF fixture first');
 const refs=await P.references(r);await N.remember(r,refs);const parent=Zotero.Items.get(r.itemID).parentItem;parent.setField('date','2018');await parent.saveTx();
 const name='Paper Nexus · Retina QA',lib=Zotero.Libraries.userLibraryID;let col=Zotero.Collections.getByLibrary(lib).find(c=>c.name===name);if(!col){col=new Zotero.Collection();col.libraryID=lib;col.name=name;await col.saveTx();}
 parent.addToCollection(col.id);await parent.saveTx();const cached=Object.values(S.state.cache).flatMap(x=>x.value?.ranked||[]).map(x=>x.record);
 const chosen=[['Hendrickson','2006'],['Hendrickson','2000'],['Provis','1998'],['Abramov','1982'],['Polyak','1957']];
 for(const [author,year] of chosen){const ref=refs.find(x=>x.author===author&&x.year===year);if(!ref)continue;const meta=cached.find(x=>x.author===author&&x.year===year&&C.similarity(x.title,ref.title)>.5);await S.save({...ref,...meta,DOI:C.recordDOI(meta||ref),verified:true},{libraryID:lib,collectionID:col.id},{parentID:parent.id,attachmentKey:Zotero.Items.get(r.itemID).key});}
 const data=await N.snapshot({force:true}),selected=NC.id(parent.libraryID,parent.key),neighbors=NC.neighbors(data,selected,{scope:N.scope(data,lib,col.id).map(x=>x.id)});
 check('Local metadata aggregates real library items without feeds or trash',data.nodes.length>=6&&data.nodes.every(x=>x.id===x.libraryID+':'+x.key));
 check('Native bibliography creates traceable local citation edges',neighbors.filter(x=>x.relations.some(r=>r.kind==='cites')).length>=2,{connections:neighbors.map(x=>({title:x.node.title,kinds:x.relations.map(r=>r.kind)})),coverage:data.coverage});
 check('Citation evidence carries a real source attachment and page',neighbors.some(x=>x.relations.some(rel=>rel.kind==='cites'&&rel.evidence.some(e=>e.attachmentID===r.itemID&&Number.isInteger(e.pageIndex)))));
 const authorNodes=data.nodes.filter(x=>x.creators.some(a=>a.firstName==='Anita'&&a.lastName==='Hendrickson'));check('Full-name author associations are available but typed as same-name only',authorNodes.length>=2&&NC.neighbors(data,authorNodes[0].id).some(x=>x.relations.some(r=>r.kind==='author')));
 const local=N.scope(data,lib,col.id);check('Collection scope includes only selected local collection',local.length>=6&&local.every(x=>x.collections.includes(col.id)));
 const result=await N.searchFulltext(local,'fovea');check('Existing Zotero PDF index is searchable locally',result.results.has(selected),{stats:result.stats});check('Fulltext result includes a bounded readable source snippet',result.results.get(selected)[0].snippet.toLowerCase().includes('fovea')&&result.results.get(selected)[0].snippet.length<350);
 let stop=true;check('A cancelled fulltext search cannot publish late results',(await N.searchFulltext(local,'fovea',{cancelled:()=>stop})).cancelled);
 frame=P.showNetwork(r);for(let i=0;i<100&&!frame.querySelector('.pn-paper');i++)await Zotero.Promise.delay(100);
 check('Network opens from Zotero main document without a web page or server',!!frame&&frame.ownerDocument===Zotero.getMainWindow().document&&!!frame.querySelector('.pn-paper'));
 const selects=frame.querySelectorAll('.pn-scopes select');selects[1].value=String(col.id);selects[1].dispatchEvent(new frame.ownerDocument.defaultView.Event('change'));
 await Zotero.Promise.delay(120);[...frame.querySelectorAll('button')].find(x=>x.textContent==='关系图')?.click();check('Every visible connection is actionable and graph is interactive',frame.querySelectorAll('.pn-node[role=button]').length>=2&&!![...frame.querySelectorAll('button')].find(x=>x.textContent==='读取引文'));
 check('No account, API-key or remote-query UI in local workspace',!/API key|密钥|登录/.test(frame.textContent));
 report.passed=true;
}catch(e){report.passed=false;report.error=String(e);report.stack=e.stack;}
await IOUtils.writeUTF8(base+'/test-results/local-network.json',JSON.stringify(report,null,2));return report;
