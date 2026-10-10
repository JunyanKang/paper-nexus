const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),C=require('../addon/core.js'),ctx={CiteLensCore:C};vm.createContext(ctx);vm.runInContext(fs.readFileSync(require.resolve('../addon/citation-format.js'),'utf8'),ctx);const F=ctx.CiteLensCitationFormat;
test('CSL data preserves authors, years, journal, pagination and DOI without library writes',()=>{const r=F.item({title:'<i>Retinal</i> development',creators:[{firstName:'Jane',lastName:'Smith'},{name:'Retina Consortium'}],year:'2020',journal:'Development',volume:'147',issue:'3',pages:'1–9',DOI:'https://doi.org/10.1234/test'});assert.equal(r.title,'Retinal development');assert.equal(r.author[0].given,'Jane');assert.equal(r.author[1].literal,'Retina Consortium');assert.equal(r.issued['date-parts'][0][0],2020);assert.equal(r.DOI,'10.1234/test');assert.equal(r.page,'1–9');assert.equal(r.type,'article-journal');});
test('CSL never invents a year or given names and handles books and chapters',()=>{const r=F.item({title:'Research methods',type:'bookSection',publisher:'University Press',author:'Smith'});assert.equal(r.type,'chapter');assert.equal(r.publisher,'University Press');assert.equal(r.issued,undefined);assert.equal(r.author[0].literal,'Smith');});
test('official styles use safe IDs and include requested general and biomedical presets',()=>{assert.throws(()=>F.id('../../private'));assert.throws(()=>F.id('https://evil.example/style'));const ids=F.presets.map(p=>p[0]);for(const key of ['apa','american-medical-association','modern-language-association','nlm-citation-sequence','nlm-name-year','nature','science','cell','pnas','investigative-ophthalmology-and-visual-science'])assert.ok(ids.includes(key));assert.equal(new Set(ids).size,ids.length);});
test('CSL preserves publisher abbreviation and book publication fields',()=>{
 const article=F.item({title:'Müller Cell Alignment in Bird Fovea',journal:'Journal of Neuroscience and Neuroengineering',journalAbbreviation:'J Neurosci Neuroengng'});assert.equal(article['container-title-short'],'J Neurosci Neuroengng');
 const book=F.item({type:'book',title:'Retinal Methods',journal:'Retinal Methods',edition:'2',place:'London',publisher:'Academic Press',ISBN:'9781234567890'});assert.equal(book['container-title'],'');assert.equal(book['publisher-place'],'London');assert.equal(book.edition,'2');
 const chapter=F.item({type:'bookSection',title:'Photoreceptors',bookTitle:'Retinal Methods',pages:'12–30'});assert.equal(chapter['container-title'],'Retinal Methods');assert.equal(chapter.page,'12–30');
});
test('locator round trips volume, issue, electronic pages and chapter pages',()=>{
 for(const record of [{volume:'42',issue:'2',pages:'68–81.e6'},{volume:'42',issue:'',pages:'68-81.e6'},{volume:'',issue:'',pages:'12–30'},{volume:'',issue:'4',pages:'e01234'},{volume:'',issue:'',pages:''}])assert.deepEqual(JSON.parse(JSON.stringify(F.parseLocator(F.locator(record)))),record);
 assert.throws(()=>F.parseLocator('42(2)(3), 1–4'));
});
test('cached bibliographic enrichment cannot overwrite edits or borrow a different journal abbreviation',()=>{
 const r={title:'Retinal development',year:'2020',DOI:'10.1234/retina',journal:'Development',volume:'3'},remote={...r,journal:'Old Journal',journalAbbreviation:'Old J',volume:'2'};
 ctx.CiteLensServices={state:{cache:{[C.identity(r)]:{value:{ranked:[{record:remote}]}}}}};
 const edited=F.enriched(r);assert.equal(edited.volume,'3');assert.equal(edited.journal,'Development');assert.equal(edited.journalAbbreviation,'');
 remote.journal='Development';remote.journalAbbreviation='Dev';assert.equal(F.enriched(r).journalAbbreviation,'Dev');
});
test('CSL accepts date-only metadata and chapter container aliases',()=>{
 const r=F.item({title:'Chapter',type:'bookSection',containerTitle:'Methods',date:'2022-05-06',publisher:'Press'});assert.equal(r['container-title'],'Methods');assert.equal(r.issued['date-parts'][0][0],2022);
});
