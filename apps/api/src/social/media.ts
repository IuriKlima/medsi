import {createHash} from 'node:crypto';
import {BadRequestException,ServiceUnavailableException} from '@nestjs/common';
import sharp from 'sharp';
import {serviceDatabase} from '../platform/service';
import {result} from '../identity/service';
import type {Row} from '../platform/firestore/store';
/** Re-encode a bounded static image; strips metadata and flattens alpha onto
 * white. No public object, upsert, user supplied URL or provider call is used. */
export async function convertSocialImage(bytes:Buffer){
 if(!bytes.length||bytes.length>10485760)throw new BadRequestException('Imagem acima do limite de 10 MB.');
 const input=sharp(bytes,{limitInputPixels:40000000,failOn:'error'}),metadata=await input.metadata();if(!['jpeg','png','webp'].includes(metadata.format??'')||(metadata.pages??1)>1)throw new BadRequestException('Use uma imagem estática PNG, WebP ou JPEG.');
 const converted=await input.rotate().flatten({background:'#ffffff'}).resize({width:1440,height:1440,fit:'inside',withoutEnlargement:true}).jpeg({quality:90,chromaSubsampling:'4:4:4',progressive:false}).toBuffer({resolveWithObject:true});const ratio=converted.info.width/converted.info.height;
 if(converted.info.width<320||ratio<0.8||ratio>1.91)throw new BadRequestException('A imagem precisa ter ao menos 320 px de largura e proporção entre 4:5 e 1,91:1 para Instagram.');if(converted.data.length>10485760)throw new BadRequestException('JPEG convertido acima do limite.');
 return {bytes:converted.data,sha256:createHash('sha256').update(converted.data).digest('hex'),width:converted.info.width,height:converted.info.height};
}
export async function prepareSocialMedia(company:string,actor:string,item:string,creative:string){
 const db=serviceDatabase(),params={p_company_id:company,p_actor:actor,p_item_id:item,p_creative_id:creative};const context=result<Row>(await db.rpc('prepare_social_media_context_server',params));
 if(context.sourceMime==='video/mp4')return null;
 const file=await db.storage.from('company-assets').download(context.sourcePath);if(file.error||!file.data)throw new ServiceUnavailableException('Não foi possível ler a arte privada aprovada.');const bytes=Buffer.from(await file.data.arrayBuffer());if(createHash('sha256').update(bytes).digest('hex')!==context.sourceSha256)throw new BadRequestException('A arte aprovada mudou. Revise uma nova versão.');
 const converted=await convertSocialImage(bytes),stored=await db.storage.from('company-assets').upload(context.targetPath,converted.bytes,{contentType:'image/jpeg',upsert:false});if(stored.error)throw new ServiceUnavailableException('Não foi possível salvar o JPEG privado para revisão.');
 return result<Row>(await db.rpc('record_social_media_server',{...params,p_id:context.key,p_source_sha256:context.sourceSha256}));
}
export async function prepareSocialPublicationMedia(company:string,actor:string,item:string,creative:string){
 const context=result<Row>(await serviceDatabase().rpc('prepare_social_media_context_server',{p_company_id:company,p_actor:actor,p_item_id:item,p_creative_id:creative}));const records:Row[]=[];
 for(const id of [...new Set([creative,...(context.requiredCreativeIds??[])])]){const prepared=await prepareSocialMedia(company,actor,item,id);if(prepared)records.push(prepared);}return records;
}
