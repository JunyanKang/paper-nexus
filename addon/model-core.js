/* Data-only model manifests. Shared by the desktop installer and contract tests. */
var CiteLensModelCore=(()=>{
 const safeName=s=>typeof s==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,100}$/.test(s)&&!s.includes('..')&&!s.endsWith('.')&&!/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(s);
 const compare=(a,b)=>{const x=String(a).split('.').map(Number),y=String(b).split('.').map(Number);for(let i=0;i<3;i++){const d=(x[i]||0)-(y[i]||0);if(d)return Math.sign(d);}return 0;};
 function manifest(m){if(!m||m.schema!==1||m.abi!==1||!safeName(m.id)||!/^\d+\.\d+\.\d+$/.test(m.version)||!safeName(m.cacheKey)||m.dimension!==384||!['mean','sentence'].includes(m.pooling)||!['multi','joint'].includes(m.input)||![256,384,512].includes(m.maxTokens)||m.runtime!=='onnxruntime-web@1.30.0')throw Error('模型包与当前插件不兼容');
  const names=new Set();if(!Array.isArray(m.files)||m.files.length<3||m.files.length>12)throw Error('模型文件清单无效');let total=0;
  for(const f of m.files){if(!safeName(f.name)||names.has(f.name.toLowerCase())||!Number.isSafeInteger(f.bytes)||f.bytes<1||f.bytes>160*1024*1024||!/^[a-f0-9]{64}$/.test(f.sha256))throw Error('模型文件清单无效');names.add(f.name.toLowerCase());total+=f.bytes;if(!f.url)throw Error('模型下载地址无效');if(f.url){const u=new URL(f.url);if(u.protocol!=='https:'||u.username||u.password||!['huggingface.co','cdn.jsdelivr.net','github.com','raw.githubusercontent.com'].includes(u.hostname))throw Error('模型下载地址无效');}}
  if(total>220*1024*1024||!['model.onnx','tokenizer.json','runtime.wasm'].every(n=>names.has(n)))throw Error('模型文件不完整');return m;
 }
 function catalog(c){if(c?.schema!==1||!Array.isArray(c.models)||!c.models.length||c.models.length>8)throw Error('模型目录无效');const ids=new Set();for(const m of c.models){manifest(m);if(ids.has(m.id))throw Error('模型目录重复');ids.add(m.id);}return c;}
 function equivalent(a,b){return a.id===b.id&&a.version===b.version&&a.cacheKey===b.cacheKey&&a.pooling===b.pooling&&a.input===b.input&&a.maxTokens===b.maxTokens&&a.files.length===b.files.length&&a.files.every(f=>b.files.some(g=>g.name===f.name&&g.bytes===f.bytes&&g.sha256===f.sha256));}
 return {safeName,compare,manifest,catalog,equivalent};
})();
if(typeof module!=='undefined')module.exports=CiteLensModelCore;
