const base=Zotero.CiteLensTestRoot,{CiteLens:P,CiteLensCore:C,CiteLensServices:S,CiteLensUI:U}=Zotero.CiteLensQA,r=Zotero.Reader._readers[0],d=r._iframeWindow.document,lookup=S.lookup,settings={...S.state.settings},report={run:'selection-race',checks:[]};const check=(name,ok)=>{report.checks.push({name,ok});if(!ok)throw Error(name);};
let root;
try{
 S.state.settings.autoAuthors=false;
 S.state.settings.autoLookup=false;S.state.settings.networkConsent=true;let resolve;S.lookup=()=>new Promise(r=>resolve=r);
 const a=C.parse('First, A., 2000. Original first reference for race checking. Journal 1, 2.'),b=C.parse('Second, B., 2001. Original second reference for race checking. Journal 2, 3.');root=U.citationGroup(d,[a,b],r);d.body.append(root);root.querySelector('.cl-card')._lookup.click();await Zotero.Promise.delay(30);
 const select=root.querySelector('select');select.value='1';select.dispatchEvent(new d.defaultView.Event('change',{bubbles:true}));resolve({status:'matched',ranked:[{record:{...a,title:'Late metadata for first reference',verified:true},reasons:['test fixture']}]});await Zotero.Promise.delay(100);
 check('Late lookup never overwrites the newly selected reference',root.querySelector('.cl-title').textContent===b.title);check('Only the newly selected card remains',root.querySelectorAll('.cl-card').length===1);report.passed=true;
}catch(e){report.passed=false;report.error=String(e);}
finally{root?.remove();S.lookup=lookup;S.state.settings=settings;await S.persist();await IOUtils.writeUTF8(base+'/test-results/selection-race.json',JSON.stringify(report,null,2));}
return report;
