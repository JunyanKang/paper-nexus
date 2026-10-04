const {test}=require('node:test'),assert=require('node:assert/strict');global.CiteLensCore=require('../addon/core.js');const C=global.CiteLensCore,L=require('../addon/citation-links.js');
const ref=(author,year,suffix='',second='')=>({title:author+' '+year+suffix+' retinal development',author,year,suffix,creators:[{lastName:author},...(second?[{lastName:second}]:[])]});
test('repeated years, suffix shorthand, and second author retain independent identity',()=>{
 const refs=[ref('Smith','2020','a'),ref('Smith','2020','b'),ref('Smith','2021'),ref('Jones','2008','','Brown'),ref('Jones','2008','','Green')];
 assert.deepEqual(C.findCitations('Smith, 2020a,b, 2021; Jones and Brown, 2008',refs),refs.slice(0,4));assert.deepEqual(C.findCitations('Jones and Black, 2008',refs),[]);
});
test('numbered references reject ambiguous numbers, reversed and oversized ranges',()=>{assert.equal(C.findCitations('[2]',[{number:2,title:'one'},{number:2,title:'other'}]).length,0);for(const x of ['[3–1]','[1–999]'])assert.equal(C.findCitations(x,[{number:1}]).length,0);});
test('source group excludes wrong native destinations and neighboring parentheses',()=>{
 const text='Text (Smith, 2020, 2021; Jones, 2008), more (Brown, 2002).',chars=[...text].map((c,offset)=>({c,offset})),refs=[ref('Smith','2020'),ref('Smith','2021'),ref('Jones','2008'),ref('Brown','2002')];
 const o={word:chars.slice(6,11),references:[refs[3]]},out=L.resolve(o,L.page(chars),refs);assert.deepEqual(out.records,refs.slice(0,3));assert.equal(out.expected,3);assert.equal(out.status,'matched');
});
test('partial groups disclose unresolved identities and never adopt unverified destination',()=>{const text='Smith, 2020, 2021',chars=[...text].map((c,offset)=>({c,offset}));const r=L.resolve({word:chars.slice(0,5),references:[ref('Jones','2008')]},L.page(chars),[ref('Smith','2020')]);assert.equal(r.records.length,1);assert.equal(r.unresolved.length,1);assert.equal(r.status,'partial');});
test('missing source text cannot validate native targets',()=>assert.equal(L.resolve({references:[ref('Smith','2020')]},null,[]).records.length,0));
test('metadata candidates with major conflicts are discarded before user selection',()=>{const original={...ref('Smith','2020'),DOI:'10.1234/a',creators:['Smith','Jones','Brown'].map(lastName=>({lastName}))};for(const bad of [{title:'Quantum black hole physics'},{author:'Jones',creators:[{lastName:'Jones'}]},{year:'2017'},{DOI:'10.1234/b'},{creators:['Smith','Black','White'].map(lastName=>({lastName}))}])assert.equal(C.decide(original,[{...original,...bad}]).status,'missing');assert.equal(C.decide(original,[{...original,year:'2021'}]).status,'review');});
