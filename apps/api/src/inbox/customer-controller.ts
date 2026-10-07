import {preferredContactName} from './contact-name';
import {Controller,Get,Param,Req,UseGuards,BadRequestException,ForbiddenException} from '@nestjs/common';
import {z} from 'zod';
import type {InboxMessage} from '@askadia/contracts';
import {AuthGuard,type AuthRequest} from '../identity/auth';
import {result} from '../identity/service';
import {evolutionChats,evolutionMessages,validJid} from './evolution';
import {conversationMetrics} from './customer-history';
@Controller('onboarding/companies/:id/crm')
@UseGuards(AuthGuard)
export class CustomerHistoryController {
 @Get('contacts/:contactId/history') async history(@Req() r:AuthRequest,@Param('id') company:string,@Param('contactId') contactId:string){
  if(!z.uuid().safeParse(company).success||!z.uuid().safeParse(contactId).success)throw new BadRequestException();
  const authorize=async()=>{const c=result<{actions:string[]}>(await r.actor.client.rpc('company_capabilities',{p_company_id:company}));if(!c.actions.includes('crm.read'))throw new ForbiddenException();};await authorize();
  const db=r.actor.client;
  const contact=result<{id:string;name:string;phone_e164:string|null;email:string|null;created_at:string}|null>(await db.from('contacts').select('id,name,phone_e164,email,created_at').eq('company_id',company).eq('id',contactId).maybeSingle());if(!contact)throw new ForbiddenException('Contato indisponível nesta empresa.');
  const opportunities=result(await db.from('opportunities').select('id,stage,interest').eq('company_id',company).eq('contact_id',contactId));
  const conversations=result(await db.from('company_conversations').select('id,channel,triage_summary,created_at').eq('company_id',company).eq('contact_id',contactId));
  const notes=conversations.length?result(await db.from('company_conversation_notes').select('id,body,created_at').eq('company_id',company).in('conversation_id',conversations.map(c=>c.id)).order('created_at',{ascending:false}).limit(50)):[];
  const stages=opportunities.length?result(await db.from('stage_history').select('id,stage,reason,created_at').eq('company_id',company).in('opportunity_id',opportunities.map(o=>o.id)).order('created_at',{ascending:false}).limit(50)):[];
  const link=result<{remote_id:string}|null>(await db.from('company_contact_channels').select('remote_id').eq('company_id',company).eq('contact_id',contactId).eq('channel','whatsapp').limit(1).maybeSingle());
  let messages:InboxMessage[]=[],warning='',hasMore=false,firstAvailableAt:string|null=null;
  if(link&&validJid(link.remote_id))try{
   const official=result<{status:string;metadata:{webhookReady?:boolean}|null}|null>(await db.from('company_channels').select('status,metadata').eq('company_id',company).eq('provider','whatsapp_cloud').maybeSingle());
   if(official){messages=result<InboxMessage[]>(await db.rpc('read_whatsapp_cloud_inbox',{p_company_id:company,p_thread:link.remote_id}));firstAvailableAt=messages.find(m=>m.time)?.time??null;if(official.status!=='connected'||!official.metadata?.webhookReady)warning='O WhatsApp oficial está desconectado. O histórico recebido está disponível.';}else{
   const channel=result<{remote_id:string;status:string}|null>(await db.from('company_channels').select('remote_id,status').eq('company_id',company).eq('provider','evolution').maybeSingle());
   if(channel?.status==='connected'&&channel.remote_id==='askadia-'+company){const recent=await evolutionMessages(channel.remote_id,link.remote_id,1);messages=recent.messages;contact.name=preferredContactName(contact.name,recent.contactName);try{const chat=(await evolutionChats(channel.remote_id)).find(c=>c.id===Buffer.from(link.remote_id).toString('base64url'));contact.name=preferredContactName(contact.name,chat?.name);}catch{/* Keep the CRM name when chat lookup is unavailable. */}hasMore=recent.hasMore;if(recent.totalPages>1){const oldest=await evolutionMessages(channel.remote_id,link.remote_id,recent.totalPages);firstAvailableAt=oldest.messages.find(m=>m.time)?.time??null;}else firstAvailableAt=messages.find(m=>m.time)?.time??null;}else warning='Reconecte o WhatsApp para consultar o histórico.';
   }
  }catch{warning='Não foi possível consultar o histórico do WhatsApp. Os registros do CRM estão disponíveis.';}
  await authorize();
  return {contact,opportunities,conversations,notes,stages,messages,metrics:{...conversationMetrics(messages),firstAvailableAt},hasMore,warning,thread:link?Buffer.from(link.remote_id).toString('base64url'):null};
 }
}
