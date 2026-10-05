const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const context=vm.createContext({});vm.runInContext(fs.readFileSync('addon/dock-motion.js','utf8'),context);const motion=context.CiteLensDockMotion;
test('mesh unfolds exactly to the panel with no residual distortion',()=>{
 for(const a of [{x:280,y:460},{x:20,y:-30},{x:180,y:200}])for(let i=0;i<=96;i++){
  const v=i/96,r=motion.row(1,v,324,432,a);assert.ok(Math.abs(r.center-162)<1e-8);assert.ok(Math.abs(r.y-v*432)<1e-8);assert.equal(r.scale,1);
 }
});
test('closed mesh converges to the icon independent of panel position',()=>{
 for(const a of [{x:280,y:460},{x:20,y:-30},{x:180,y:200}])for(let i=0;i<=96;i++){
  const r=motion.row(0,i/96,324,432,a);assert.equal(r.center,a.x);assert.equal(r.y,a.y);
 }
});
test('mesh has finite, continuous geometry and no inverted strips for an icon above or below',()=>{
 for(const a of [{x:280,y:460},{x:20,y:-30},{x:180,y:200},{x:300,y:436}])for(let p=0;p<=1;p+=.002){
  let previous=-Infinity;for(let i=0;i<=96;i++){const v=i/96,r=motion.row(p,v,324,432,a);assert.ok(Number.isFinite(r.center+r.y+r.scale));assert.ok(r.scale>0&&r.scale<=1);assert.ok(r.y>=previous-1e-8);previous=r.y;const next=motion.row(p+.00001,v,324,432,a);assert.ok(Math.abs(next.y-r.y)<.1);}
 }
});
