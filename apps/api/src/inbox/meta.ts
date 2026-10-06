import {serviceDatabase} from '../platform/service';
import {databaseConfigured} from '../platform/config';
import {createHmac,timingSafeEqual} from 'node:crypto';
import {BadRequestException,ForbiddenException,ServiceUnavailableException} from '@nestjs/common';

import {z} from 'zod';
import {metaAccess,type InboxThread,type InboxMessage} from '@askadia/contracts';
import type {AuthRequest} from '../identity/auth';
import {result} from '../identity/service';
import {openChannel} from '../onboarding/channels';
export type MetaContext={page:string;instagram:string|null;token:string;userToken?:string;access:ReturnType<typeof metaAccess>};
export async function metaContext(r:AuthRequest,company:string,action='crm.read'):Promise<MetaContext>{
 if(!z.uuid().safeParse(company).success)throw new BadRequestException();
 const cap=result<{actions:string[]}>(await r.actor.client.rpc('company_capabilities',{p_company_id:company}));if(!cap.actions.includes(action))throw new ForbiddenException();
 if(!databaseConfigured())throw new ServiceUnavailableException('Consulta de canais indisponível no servidor.');
 const db=serviceDatabase();
 const row=result<{remote_id:string;metadata:{scopes?:string[];tasks?:string[];instagramId?:string;expiresAt?:string};cipher:string}|null>(await db.rpc('read_company_meta_server',{p_company_id:company,p_actor:r.actor.id,p_action:action}));
 if(!row)throw new BadRequestException('Selecione e conecte a Página desta empresa em Integrações.');
 if(row.metadata.expiresAt&&Date.parse(row.metadata.expiresAt)<=Date.now())throw new BadRequestException('A autorização Meta expirou. Atualize as autorizações em Integrações.');
 return {page:row.remote_id,instagram:row.metadata.instagramId??null,...openChannel<{token:string;userToken?:string}>(company,row.cipher),access:metaAccess(row.metadata.scopes??[],row.metadata.instagramId??null,row.metadata.tasks??[])};
}
export async function metaGraph<T>(path:string,token:string,params:Record<string,string>={},body?:unknown):Promise<T>{
 const version=process.env.META_GRAPH_API_VERSION;if(!/^v\d+\.\d+$/.test(version??''))throw new ServiceUnavailableException('Versão da Meta não configurada.');
 if(!/^[a-zA-Z0-9_%=:./-]+$/.test(path)||path.includes('..'))throw new BadRequestException();
 const url=new URL('https://graph.facebook.com/'+version+'/'+path);for(const [key,value] of Object.entries(params))url.searchParams.set(key,value);
 const response=await fetch(url,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000),redirect:'error'});
 if(!response.ok){const data=await response.json().catch(()=>({})) as {error?:{code?:number}};throw new ServiceUnavailableException(data.error?.code===190?'A autorização Meta expirou. Reconecte em Integrações.':response.status===429?'Limite de consultas da Meta atingido. Tente novamente em instantes.':'A Meta recusou esta consulta. Confira as permissões, o acesso avançado do aplicativo e o acesso da conta às mensagens.');}
 return response.json() as Promise<T>;
}
type ThreadRef={company:string;page:string;channel:'instagram'|'facebook';conversation:string;peer:string};
function signature(payload:string){const key=process.env.SECRETS_ENCRYPTION_KEY;if(!key)throw new ServiceUnavailableException();return createHmac('sha256',key).update('meta-inbox:'+payload).digest();}
export function encodeMetaThread(value:ThreadRef){const payload=Buffer.from(JSON.stringify(value)).toString('base64url');return 'meta.'+payload+'.'+signature(payload).toString('base64url');}
export function decodeMetaThread(raw:string,company:string,page:string):ThreadRef{
 try{const [prefix,payload,sig,...extra]=raw.split('.');if(prefix!=='meta'||!payload||!sig||extra.length||raw.length>2000)throw new Error();const actual=Buffer.from(sig,'base64url'),expected=signature(payload);if(actual.length!==expected.length||!timingSafeEqual(actual,expected))throw new Error();const ref=z.object({company:z.uuid(),page:z.string().regex(/^\d+$/),channel:z.enum(['facebook','instagram']),conversation:z.string().regex(/^[a-zA-Z0-9_:=-]{1,200}$/),peer:z.string().regex(/^\d+$/)}).strict().parse(JSON.parse(Buffer.from(payload,'base64url').toString()));if(ref.company!==company||ref.page!==page)throw new Error();return ref;}catch{throw new ForbiddenException('Conversa não autorizada nesta empresa.');}
}
export type MetaCollection<T>={data:T[];paging?:{cursors?:{after?:string};next?:string}};
type Participant={id:string;name?:string;username?:string};
type MetaMessage={id:string;message?:string;created_time?:string;from?:Participant;attachments?:{data:unknown[]}};
type Conversation={id:string;updated_time?:string;participants?:{data:Participant[]};messages?:MetaCollection<MetaMessage>};
export function assertMessaging(context:MetaContext,channel:'facebook'|'instagram'){if(!(channel==='instagram'?context.access.instagramMessaging:context.access.facebookMessaging))throw new ForbiddenException('Permissão de mensagens pendente para este canal. Atualize as autorizações Meta em Integrações.');}
export async function metaThreads(context:MetaContext,company:string,channel:'facebook'|'instagram',page=1){
 assertMessaging(context,channel);let after:string|undefined;let collection:MetaCollection<Conversation>={data:[]};
 for(let i=0;i<page;i++){collection=await metaGraph(context.page+'/conversations',context.token,{platform:channel==='instagram'?'instagram':'messenger',fields:'id,updated_time,participants,messages.limit(1){id,message,created_time,from}',limit:'50',...(after?{after}:{})});after=collection.paging?.next?collection.paging.cursors?.after:undefined;if(!after)break;}
 const threads:InboxThread[]=collection.data.flatMap(c=>{const peer=c.participants?.data.find(p=>p.id!==context.page&&p.id!==context.instagram);if(!peer||!/^\d+$/.test(peer.id))return [];return [{id:encodeMetaThread({company,page:context.page,channel,conversation:c.id,peer:peer.id}),channel,name:peer.name||peer.username||'Contato '+peer.id,preview:c.messages?.data[0]?.message??'Mensagem com mídia',time:c.updated_time??null,unread:0,group:false}];});
 return {threads,hasMore:Boolean(after)};
}
export async function metaMessages(context:MetaContext,ref:ThreadRef,page=1){
 assertMessaging(context,ref.channel);let after:string|undefined;let collection:MetaCollection<MetaMessage>={data:[]};
 for(let i=0;i<page;i++){collection=await metaGraph(encodeURIComponent(ref.conversation)+'/messages',context.token,{fields:'id,message,created_time,from,attachments',limit:'50',...(after?{after}:{})});after=collection.paging?.next?collection.paging.cursors?.after:undefined;if(!after)break;}
 const messages:InboxMessage[]=collection.data.filter(m=>m.from?.id===ref.peer||m.from?.id===context.page||m.from?.id===context.instagram).map(m=>({id:m.id,body:m.message||'[Anexo — abra no aplicativo de origem]',time:m.created_time??null,fromMe:m.from?.id!==ref.peer,kind:'text',status:'received'})).sort((a,b)=>(a.time??'').localeCompare(b.time??''));return {messages,hasMore:Boolean(after)};
}
