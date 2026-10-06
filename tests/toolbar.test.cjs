const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function setup(){
 const scope={};vm.createContext(scope);vm.runInContext(fs.readFileSync(require.resolve('../addon/main.js'),'utf8'),scope);const p=scope.CiteLens;
 function el(marker){return {marker,parentNode:null,children:[],dataset:{},setAttribute(){},style:{},prepend(){},remove(){if(this.parentNode)this.parentNode.children.splice(this.parentNode.children.indexOf(this),1);this.parentNode=null;},append(...nodes){this.writes=(this.writes||0)+1;for(const n of nodes){n.remove();n.parentNode=this;this.children.push(n);}}};}
 const host=el(),wrapper=el(),other=el('other');host.append(other,wrapper);
 const doc={querySelector:s=>s.startsWith('.toolbar')?host:doc.querySelectorAll(s)[0],querySelectorAll:s=>{const marker=s.includes('paper-voice')?'voice':'nexus',walk=n=>n.children.flatMap(c=>[c,...walk(c)]);return walk(host).filter(n=>n.marker===marker);}};
 scope.CiteLensUI={button:(_d,_t,click)=>Object.assign(el('nexus'),{click}),logo:()=>({})};return {p,doc,host,wrapper,other,el};
}
test('toolbar normalization removes duplicates without discarding live handlers and is idempotent',()=>{
 const {p,doc,host,wrapper,other,el}=setup();const voice=el('voice');voice._paperToolbarLive=true;const nexus=p.toolbar(doc,{});wrapper.append(voice,nexus);host.append(el('voice'),el('nexus'));p.normalizeToolbar(doc);
 assert.deepEqual(host.children,[other,wrapper,voice,nexus]);assert.equal(doc.querySelectorAll('[data-paper-voice=toolbar]').length,1);assert.equal(doc.querySelectorAll('[data-cite-lens=toolbar]').length,1);
 const writes=host.writes;for(let i=0;i<10;i++)p.normalizeToolbar(doc);assert.equal(host.writes,writes);let clicks=0;p.togglePanel=()=>clicks++;nexus.click();assert.equal(clicks,1);
});
test('reader buttons are reused per document even after being detached',()=>{
 const {p,doc,host}=setup(),r={};const first=p.toolbar(doc,r);host.append(first);first.remove();assert.equal(p.toolbar(doc,r),first);const other=setup().doc;assert.notEqual(p.toolbar(other,r),first);
});
test('legacy buttons are deduplicated without affecting unrelated toolbar controls',()=>{
 const {p,doc,host,wrapper,other,el}=setup(),v=el('voice'),n=el('nexus');host.append(n,v);wrapper.append(el('voice'));p.normalizeToolbar(doc);assert.equal(host.children[0],other);assert.deepEqual(host.children.slice(-2).map(n=>n.marker),['voice','nexus']);
});

test('a detached canonical Nexus button replaces a listenerless duplicate left by another renderer',()=>{
 const {p,doc,host,el}=setup(),button=p.toolbar(doc,{});host.append(button);button.remove();host.append(el('nexus'));p.normalizeToolbar(doc);assert.equal(doc.querySelector('[data-cite-lens=toolbar]'),button);let clicks=0;p.togglePanel=()=>clicks++;button.click();assert.equal(clicks,1);
});
