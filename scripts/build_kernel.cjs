// Rebuild with wabt 1.0.39: node scripts/build_kernel.cjs <path-to-wabt>
process.chdir(require('node:path').resolve(__dirname, '..'));
(async()=>{const fs=require('fs'),wabt=await require(process.argv[2] || 'wabt')(),module=wabt.parseWat('semantic-kernel.wat',fs.readFileSync('scripts/semantic-kernel.wat','utf8'),{simd:true});module.validate();const {buffer}=module.toBinary({});fs.writeFileSync('addon/semantic-kernel.js',`/* Generated from scripts/semantic-kernel.wat. Portable SIMD; scalar fallback remains available. */
var CiteLensSimilarityKernel={
 bytes:new Uint8Array([${Array.from(buffer).join(',')}]),
 async create(){try{const {instance}=await WebAssembly.instantiate(this.bytes),kernel=instance.exports;return vectors=>{const n=vectors.length,d=vectors[0]?.length;if(d!==384||n<200||n>16000||vectors.some(v=>v.length!==d||!v.every(Number.isFinite)))return null;const offset=n*d*8,size=offset+n*8,pages=Math.ceil(size/65536);if(kernel.memory.buffer.byteLength<size)kernel.memory.grow(pages-kernel.memory.buffer.byteLength/65536);const input=new Float64Array(kernel.memory.buffer,0,n*d);vectors.forEach((v,i)=>input.set(v,i*d));const scores=new Float64Array(kernel.memory.buffer,offset,n);return(i,start=0)=>{kernel.row(i,n,d,start,offset);return scores;};};}catch(_){return null;}}
};
if(typeof module!=='undefined')module.exports=CiteLensSimilarityKernel;
`);console.log(buffer.length);})();
