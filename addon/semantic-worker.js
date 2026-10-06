/* Bundled WASM and weights only. No metadata is sent over the network. */
importScripts('semantic-core.js','vendor/onnx/ort.wasm.min.js');
let session,tokenizer;
onmessage=async event=>{const {id,texts,init}=event.data;try{
 if(init){ort.env.wasm.numThreads=1;ort.env.wasm.proxy=false;ort.env.wasm.wasmPaths=new URL('vendor/onnx/',location.href).href;tokenizer=init.tokenizer||await (await fetch(new URL('models/minilm/tokenizer.json',location.href))).json();session=await ort.InferenceSession.create(init.model||new URL('models/minilm/model_quantized.onnx',location.href).href,{executionProviders:['wasm'],graphOptimizationLevel:'all'});postMessage({id,ready:true});return;}
 if(!session)throw Error('本地模型尚未加载');const output=[];
 for(let start=0;start<texts.length;start+=4){const batch=texts.slice(start,start+4).map(t=>CiteLensSemanticCore.tokenize(t,tokenizer)),length=Math.max(...batch.map(t=>t.length)),size=batch.length*length,ids=new BigInt64Array(size),mask=new BigInt64Array(size),types=new BigInt64Array(size);
 for(let b=0;b<batch.length;b++)for(let t=0;t<batch[b].length;t++){ids[b*length+t]=BigInt(batch[b][t]);mask[b*length+t]=1n;}
 const shape=[batch.length,length],feed={input_ids:new ort.Tensor('int64',ids,shape),attention_mask:new ort.Tensor('int64',mask,shape),token_type_ids:new ort.Tensor('int64',types,shape)},result=await session.run(feed),hidden=result.last_hidden_state;output.push(...CiteLensSemanticCore.pool(hidden.data,hidden.dims,mask));for(const tensor of Object.values(feed))tensor.dispose();for(const tensor of Object.values(result))tensor.dispose();postMessage({id,progress:Math.min(texts.length,start+batch.length),total:texts.length});}
 postMessage({id,vectors:output});
}catch(error){postMessage({id,error:String(error.message||error)});}};
