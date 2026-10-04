const base=Zotero.CiteLensTestRoot,P=Zotero.CiteLensQA.CiteLens,C=Zotero.CiteLensQA.CiteLensCore,report={run:'corpus',papers:[],passed:true};
for(const file of ['ou-2013.pdf','alexander-2023.pdf']) {
 try{
  const a=await Zotero.Attachments.importFromFile({file:Zotero.CiteLensTestFixtures+'/'+file}),r=await Zotero.Reader.open(a.id);await r._initPromise;await Zotero.Promise.delay(700);P.attach(r);const refs=await P.references(r),data=await r._internalReader._primaryView._iframeWindow.PDFViewerApplication.pdfDocument.getProcessedData();const citations=Object.values(data.pages).flatMap(p=>p.overlays.filter(x=>x.type==='citation'));
  const result={file,pages:r._internalReader._primaryView._iframeWindow.PDFViewerApplication.pdfDocument.numPages,references:refs.length,nativeCitationOverlays:citations.length,examples:refs.slice(0,4).map(x=>({raw:x.raw,title:x.title,year:x.year})),passed:refs.length>10&&citations.length>10};report.papers.push(result);if(!result.passed)report.passed=false;
 }catch(e){report.passed=false;report.papers.push({file,error:String(e)});}
 await IOUtils.writeUTF8(base+'/test-results/corpus.json',JSON.stringify(report,null,2));
}
return report;
