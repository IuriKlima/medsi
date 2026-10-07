import {agentModel} from './models';
export type ImageReference={name:string;mime:string;bytes:Buffer};
export type ImageRatio='16:9'|'4:5'|'1:1'|'9:16';
export const imageSizes:Record<ImageRatio,string>={'16:9':'2048x1152','4:5':'1536x1920','1:1':'1792x1792','9:16':'1152x2048'};
export const imageModel=()=>agentModel('image');
export const imageQuality=()=>{const value=process.env.OPENAI_IMAGE_QUALITY?.trim()||'high';if(!['low','medium','high','xhigh','max'].includes(value))throw new Error('Qualidade de imagem inválida.');return value;};
export type ImageUsage={input_tokens:number;output_tokens:number;total_tokens:number;input_tokens_details?:{text_tokens:number;image_tokens:number}};
function usageOf(value:unknown):ImageUsage|null{if(!value||typeof value!=='object')return null;const u=value as Record<string,unknown>;const valid=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0; if(!valid(u.input_tokens)||!valid(u.output_tokens)||!valid(u.total_tokens))return null;const d=u.input_tokens_details as Record<string,unknown>|undefined;return {input_tokens:u.input_tokens,output_tokens:u.output_tokens,total_tokens:u.total_tokens,...(d&&valid(d.text_tokens)&&valid(d.image_tokens)?{input_tokens_details:{text_tokens:d.text_tokens,image_tokens:d.image_tokens}}:{})};}
/** One bounded provider request. No fallback silently changes provider, quality or source images. */
export async function renderImage(prompt:string,ratio:ImageRatio,references:ImageReference[]=[]){
 if(!process.env.OPENAI_API_KEY)throw new Error('Configure a OpenAI para gerar imagens.');
 if(references.length>6||references.reduce((n,r)=>n+r.bytes.length,0)>24*1024*1024||references.some(r=>!r.bytes.length||r.bytes.length>10*1024*1024||!['image/jpeg','image/png','image/webp'].includes(r.mime)))throw new Error('Materiais excedem o limite da edição.');
 const model=imageModel(),quality=imageQuality(),size=imageSizes[ratio];if(!size)throw new Error('Formato de imagem inválido.');
 const fields={model,prompt:prompt+'\nReferências, na ordem dos anexos: '+JSON.stringify(references.map((r,i)=>({image:i+1,name:r.name}))),size,quality,n:1,output_format:'png'};
 let body:BodyInit;const headers:Record<string,string>={Authorization:'Bearer '+process.env.OPENAI_API_KEY};
 if(references.length){const form=new FormData();for(const [key,value] of Object.entries(fields))form.append(key,String(value));references.forEach((r,i)=>form.append('image[]',new Blob([new Uint8Array(r.bytes)],{type:r.mime}),'reference-'+i+(r.mime==='image/jpeg'?'.jpg':r.mime==='image/webp'?'.webp':'.png')));body=form;}
 else{headers['Content-Type']='application/json';body=JSON.stringify(fields);}
 const response=await fetch('https://api.openai.com/v1/images/'+(references.length?'edits':'generations'),{method:'POST',redirect:'error',headers,body,signal:AbortSignal.timeout(240000)});
 if(!response.ok)throw new Error(response.status===429?'A OpenAI recusou a geração por limite ou crédito. O material original foi preservado.':response.status===401||response.status===403?'A OpenAI não autorizou o gerador de imagens. Confira a chave, o acesso ao modelo e a verificação da organização.':'A OpenAI não concluiu a imagem. O material original foi preservado.');
 const output=await response.json() as {data?:{b64_json?:string}[];usage?:unknown};const encoded=output.data?.[0]?.b64_json;
 if(typeof encoded!=='string'||encoded.length>14*1024*1024)throw new Error('A OpenAI não retornou uma imagem válida.');
 const bytes=Buffer.from(encoded,'base64');if(bytes.length<8||bytes.length>10*1024*1024||!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw new Error('A OpenAI não retornou um PNG válido de até 10 MB.');
 return {bytes,mime:'image/png' as const,model,quality,size,usage:usageOf(output.usage)};
}
