const base=Zotero.CiteLensTestRoot,{CiteLens:P,CiteLensServices:S,CiteLensCore:C,CiteLensUI:U,CiteLensAuthors:A}=Zotero.CiteLensQA;
if(Services.dirsvc.get('ProfD',Components.interfaces.nsIFile).path!==base+'/qa-profile')throw Error('QA only');
const report={run:'automatic-authors',checks:[],live:[],version:P.version},settings={...S.state.settings},original=S.authors;
const check=(name,ok,details={})=>{report.checks.push({name,ok,...details});if(!ok)throw Error(name);};let d,group;
const capture=async(node,name)=>{const b=node.getBoundingClientRect(),canvas=d.createElement('canvas');canvas.width=Math.ceil(b.width+20)*2;canvas.height=Math.ceil(b.height+20)*2;const ctx=canvas.getContext('2d');ctx.scale(2,2);ctx.drawWindow(d.defaultView,b.x-10,b.y-10,canvas.width/2,canvas.height/2,'#fff');await IOUtils.write(base+'/test-results/'+name+'.png',Uint8Array.from(d.defaultView.atob(canvas.toDataURL('image/png').split(',')[1]),x=>x.charCodeAt(0)));};
try {
 S.state.settings={...settings,autoAuthors:true,autoLookup:false,theme:'light',fontSize:13};
 const r=Zotero.Reader._readers.find(x=>x._internalReader?._primaryView?._iframeWindow?.PDFViewerApplication?.pdfDocument.numPages===36);await Zotero.Reader.open(r.itemID);d=r._iframeWindow.document;U.appearance(d);
 for(const el of d.querySelectorAll('.cl-floating,.cl-root,.cl-overlay'))el.remove();
 for(const n of [0,1,2,3,5,6,7,10]){
  const authors=Array.from({length:n},(_,i)=>({firstName:'Full',lastName:'Author'+i})),row=U.authorList(d,authors);d.body.append(row);
  check('Six-slot author layout preserves order for '+n,[...row.querySelectorAll('.cl-author-slot')].map(x=>Number(x.dataset.authorIndex)).join(',')===(n>6?[0,1,2,n-3,n-2,n-1]:authors.map((_,i)=>i)).join(','));check('Middle ellipsis appears only above six authors '+n,row.querySelectorAll('.cl-author-gap').length===(n>6?1:0));row.remove();
 }
 const papers=[{DOI:'10.1371/journal.pone.0059247',title:'Vax1/2 genes counteract Mitf-induced respecification of the retinal pigment epithelium',count:5,expected:['Ou','Bharti','Nodari','Bertuzzi','Arnheiter']},{DOI:'10.1038/s41467-023-37408-w',title:'A-MYB and BRDT-dependent RNA Polymerase II pause release orchestrates transcriptional regulation in mammalian meiosis',count:10,expected:['Alexander','Rice','Lujic','Lama','Cohen','Danko']}];
 for(const [idx,paper] of papers.entries()){
  delete S.state.authorCache['doi:'+paper.DOI];
  const rec={...paper,type:'journalArticle',journal:idx?'Nature Communications':'PLOS ONE',year:idx?'2023':'2013',creators:[],raw:paper.title};
  P.floating(d,r,[rec],{x:180,y:120});const host=d.querySelector('.cl-floating'),card=host.querySelector('.cl-card');
  for(let n=0;n<450&&!S.cachedAuthors(rec);n++)await Zotero.Promise.delay(100);
  const result=S.cachedAuthors(rec);report.live.push({DOI:paper.DOI,result});
  check('Visible card automatically retrieves complete real author list '+idx,result?.status==='available'&&result.authors.length===paper.count,{status:result?.status,count:result?.authors?.length});
  await Zotero.Promise.delay(150);const slots=[...card.querySelectorAll('.cl-author-slot')];
  check('Authors remain on one line '+idx,slots.every(x=>Math.abs(x.getBoundingClientRect().top-slots[0].getBoundingClientRect().top)<1));
  const top=card.querySelector('.cl-card-tools');check('Actions occupy the top-right with no footer row '+idx,top.parentElement===card.querySelector('.cl-eyebrow')&&!card.querySelector(':scope > .cl-actions')&&top.getBoundingClientRect().right<=card.getBoundingClientRect().right);
  check('Real card uses exact first-three last-three order '+idx,slots.map(x=>x.title.split(' ').at(-1)).join(',')===paper.expected.join(','));
  check('No role or verification labels on main card '+idx,!/一作|通讯|核验补全|已核验|待补全/.test(card.textContent));
  const journal=card.querySelector('.cl-journal'),link=journal.querySelector('.cl-doi'),quartile=journal.querySelector('.cl-metrics .cl-chip:last-child');
  check('DOI follows JCR on the same visual row '+idx,!!link&&!!quartile&&link.getBoundingClientRect().left>quartile.getBoundingClientRect().right&&Math.abs(link.getBoundingClientRect().top-quartile.getBoundingClientRect().top)<4);
  check('DOI keeps full identifier in tooltip '+idx,link.title===paper.DOI&&link.href==='https://doi.org/'+paper.DOI);
  const b=host.getBoundingClientRect();check('Six-author hover stays compact '+idx,b.height<=210&&host.scrollWidth<=host.clientWidth+1,{height:b.height,width:b.width});
  await capture(host,idx?'33-ten-author-hover':'32-five-author-hover');
  card.querySelector('.cl-more').click();check('Menu keeps only four actions '+idx,card.querySelectorAll('.cl-menu button').length===4&&!card.querySelector('.cl-metadata'));host.remove();
 }
 const raw='Ou, J., Bharti, K., Nodari, A., Bertuzzi, S., Arnheiter, H., 2013. Vax1/2 Genes Counteract Mitf-Induced Respecification of the Retinal Pigment Epithelium. PLoS ONE 8, e59247.';
 const noDOI=C.parse(raw),authors=await S.authors(noDOI,{force:true});check('Real citation without DOI resolves before retrieving authors',authors.DOI===papers[0].DOI&&authors.authors.length===5,{status:authors.status});
 let release;S.authors=rec=>rec.DOI==='10.1234/slow'?new Promise(resolve=>{release=resolve;}):Promise.resolve({listVersion:1,status:'available',inputKey:A.key(rec),authors:[{firstName:'Current',lastName:'Author'}]});
 group=U.citationGroup(d,[{DOI:'10.1234/slow',title:'Slow paper',type:'journalArticle'},{DOI:'10.1234/current',title:'Current paper',type:'journalArticle'}],r);d.body.append(group);await Zotero.Promise.delay(300);const select=group.querySelector('select');select.value='1';select.dispatchEvent(new d.defaultView.Event('change'));await Zotero.Promise.delay(300);release({listVersion:1,status:'available',inputKey:'doi:10.1234/slow',authors:[{firstName:'Wrong',lastName:'Person'}]});await Zotero.Promise.delay(100);check('Late author query cannot overwrite selected citation',group.querySelector('.cl-author-slot').title==='Current Author'&&!group.textContent.includes('Person'));group.remove();S.authors=original;
 S.state.settings.autoAuthors=false;check('Disabled author lookup makes no query',(await S.authors({DOI:'10.1234/disabled'})).status==='disabled');report.passed=true;
}catch(e){report.passed=false;report.error=String(e);report.stack=e.stack;}
finally{S.authors=original;group?.remove();S.state.settings=settings;d?.querySelector('.cl-floating')?.remove();await S.persist();if(d)U.appearance(d);await IOUtils.writeUTF8(base+'/test-results/automatic-authors.json',JSON.stringify(report,null,2));}
return report;
