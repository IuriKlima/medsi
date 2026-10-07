import {randomUUID} from 'node:crypto';
import {companyAccess,fail,hash,user,uuid,type FirestoreActor} from './access';
import type {DocumentTransaction,Row} from './store';

export const supportOperations=['create_support_ticket','reply_support_ticket','set_support_ticket_status','support_ticket_detail','support_ticket_list'];
const statuses=['open','in_progress','waiting_customer','resolved'];
const ticketFields=['id','number','company_id','created_by','subject','status','page','transcript','version','created_at','updated_at'];
const messageFields=['id','ticket_id','author_id','author_kind','body','created_at'];
const project=(row:Row,fields:string[])=>Object.fromEntries(fields.map(field=>[field,row[field]]));
const compare=(a:unknown,b:unknown)=>String(a)<String(b)?-1:String(a)>String(b)?1:0;
const messageOrder=(a:Row,b:Row)=>compare(a.created_at,b.created_at)||compare(a.id,b.id);
function content(value:unknown,min:number,max:number,label:string){
 if(typeof value!=='string'||[...value.trim()].length<min||[...value.trim()].length>max)fail('22023','Invalid '+label);
 return (value as string).trim();
}
// Match the JSONB text byte bound, including separator whitespace.
function jsonText(value:unknown):string{
 if(Array.isArray(value))return '['+value.map(jsonText).join(', ')+']';
 if(value&&typeof value==='object')return '{'+Object.entries(value).map(([key,v])=>JSON.stringify(key)+': '+jsonText(v)).join(', ')+'}';
 return JSON.stringify(value);
}
function transcript(value:unknown){
 if(!Array.isArray(value)||value.length>8||Buffer.byteLength(jsonText(value),'utf8')>24000)fail('22023','Invalid transcript');
 for(const item of value as unknown[]){
  if(!item||typeof item!=='object'||Array.isArray(item))fail('22023','Invalid transcript');
  const row=item as Row;
  if(Object.keys(row).length!==2||!['user','assistant'].includes(row.role))fail('22023','Invalid transcript');
  content(row.text,1,2000,'transcript');
 }
 return value as Row[];
}
async function staffRole(tx:DocumentTransaction,actor:FirestoreActor){
 const staff=await tx.get('platform_staff',user(actor));
 return staff?.active===true&&['platform_admin','support'].includes(staff.role)?String(staff.role):null;
}
async function assigned(tx:DocumentTransaction,actor:FirestoreActor,companyId:string|null){
 const role=await staffRole(tx,actor);
 if(role==='platform_admin')return true;
 if(role!=='support'||companyId===null)return false;
 return (await tx.list('company_assignments',[{field:'staff_id',value:actor.id},{field:'company_id',value:companyId}])).length>0;
}
async function visible(tx:DocumentTransaction,actor:FirestoreActor,ticket:Row){
 const actorId=user(actor);
 if(ticket.created_by===actorId){
  if(ticket.company_id===null)return true;
  try{await companyAccess(tx,actor,ticket.company_id);return true;}catch(error){if((error as {code?:string}).code!=='42501')throw error;}
 }
 return assigned(tx,actor,ticket.company_id);
}
async function ticketForActor(tx:DocumentTransaction,actor:FirestoreActor,id:string){
 user(actor);const ticket=await tx.get('support_tickets',id);
 if(!ticket||!await visible(tx,actor,ticket))fail('42501','Access denied');
 return ticket!;
}
async function ticketRow(tx:DocumentTransaction,ticket:Row){
 const company=ticket.company_id===null?null:await tx.get('companies',ticket.company_id);
 return {...project(ticket,ticketFields),company_name:company?.name??null};
}
async function detail(tx:DocumentTransaction,actor:FirestoreActor,id:string){
 const ticket=await ticketForActor(tx,actor,id);
 const messages=(await tx.list('support_messages',[{field:'ticket_id',value:id}])).sort(messageOrder).slice(-100).map(row=>project(row,messageFields));
 return {ticket:await ticketRow(tx,ticket),messages};
}
function audit(tx:DocumentTransaction,actor:FirestoreActor,companyId:string|null,action:string,details:Row,now:string){
 const id=randomUUID();tx.put('platform_audit',id,{id,actor_id:actor.id,company_id:companyId,session_id:null,action,details,created_at:now});
}
async function nextNumber(tx:DocumentTransaction){
 const counter=await tx.get('support_counters','tickets');
 // A ported collection may already contain protocols before its first native write.
 const previous=counter?Number(counter.last_number):(await tx.list('support_tickets')).reduce((max,row)=>Math.max(max,Number(row.number)||0),0);
 if(!Number.isSafeInteger(previous)||previous<0||!Number.isSafeInteger(previous+1))fail('22023','Invalid support counter');
 tx.put('support_counters','tickets',{last_number:previous+1});return previous+1;
}
export async function supportRpc(tx:DocumentTransaction,actor:FirestoreActor,name:string,args:Row):Promise<Row|Row[]>{
 const actorId=user(actor),now=new Date().toISOString(),hour=Date.now()-60*60*1000;
 if(name==='support_ticket_detail')return detail(tx,actor,uuid(args.p_id));
 if(name==='support_ticket_list'){
  const team=args.p_team===undefined?false:args.p_team,offset=args.p_offset===undefined?0:args.p_offset;
  if(typeof team!=='boolean'||!Number.isInteger(offset)||offset<0||offset>10000)fail('22023','Invalid offset');
  let tickets:Row[];
  if(team){
   const role=await staffRole(tx,actor);if(!role)fail('42501','Access denied');
   if(role==='platform_admin')tickets=await tx.list('support_tickets');
   else{
    const assignments=await tx.list('company_assignments',[{field:'staff_id',value:actorId}]);
    const groups=await Promise.all([...new Set(assignments.map(row=>row.company_id))].map(id=>tx.list('support_tickets',[{field:'company_id',value:id}])));
    tickets=groups.flat();
   }
  }else tickets=await tx.list('support_tickets',[{field:'created_by',value:actorId}]);
  const allowed:Row[]=[];for(const ticket of tickets)if(await visible(tx,actor,ticket))allowed.push(ticket);
  allowed.sort((a,b)=>compare(b.updated_at,a.updated_at)||compare(a.id,b.id));
  return Promise.all(allowed.slice(offset,offset+20).map(ticket=>ticketRow(tx,ticket)));
 }
 if(name==='create_support_ticket'){
  if(!await tx.get('profiles',actorId))fail('42501','Access denied');
  const companyId=args.p_company_id===null?null:uuid(args.p_company_id);
  if(companyId!==null)await companyAccess(tx,actor,companyId);
  const id=uuid(args.p_id),subject=content(args.p_subject,5,160,'ticket'),message=content(args.p_message,10,4000,'ticket');
  const page=args.p_page;
  if(typeof page!=='string'||page.length>160||!/^\/[a-zA-Z0-9/_-]*$/.test(page))fail('22023','Invalid ticket');
  const shared=transcript(args.p_transcript===undefined?[]:args.p_transcript);
  const existing=await tx.get('support_tickets',id);
  if(existing){
   const first=await tx.get('support_messages',id);
   if(existing.created_by!==actorId||existing.company_id!==companyId||existing.subject!==subject||existing.page!==page||hash(existing.transcript)!==hash(shared)||first?.ticket_id!==id||first?.body!==message)fail('23505','Ticket request conflict');
   return detail(tx,actor,id);
  }
  if((await tx.list('support_tickets',[{field:'created_by',value:actorId}])).filter(row=>Date.parse(row.created_at)>hour).length>=10)fail('P0429','Support rate limit');
  // Message IDs are global: never overwrite a reply whose request ID was reused.
  if(await tx.get('support_messages',id))fail('23505','Ticket request conflict');
  const number=await nextNumber(tx);
  tx.put('support_tickets',id,{id,number,company_id:companyId,created_by:actorId,subject,status:'open',page,transcript:shared,version:1,created_at:now,updated_at:now});
  tx.put('support_messages',id,{id,ticket_id:id,author_id:actorId,author_kind:'customer',body:message,created_at:now});
  audit(tx,actor,companyId,'support.ticket_created',{ticketId:id},now);
  return detail(tx,actor,id);
 }
 if(name==='reply_support_ticket'){
  const ticketId=uuid(args.p_ticket_id),ticket=await ticketForActor(tx,actor,ticketId);
  const id=uuid(args.p_id),message=content(args.p_message,1,4000,'reply'),existing=await tx.get('support_messages',id);
  if(existing){
   if(existing.ticket_id!==ticketId||existing.author_id!==actorId||existing.body!==message)fail('23505','Reply request conflict');
   return detail(tx,actor,ticketId);
  }
  if((await tx.list('support_messages',[{field:'ticket_id',value:ticketId},{field:'author_id',value:actorId}])).filter(row=>Date.parse(row.created_at)>hour).length>=30)fail('P0429','Support rate limit');
  const staff=ticket.created_by!==actorId&&await assigned(tx,actor,ticket.company_id);
  tx.put('support_messages',id,{id,ticket_id:ticketId,author_id:actorId,author_kind:staff?'staff':'customer',body:message,created_at:now});
  tx.put('support_tickets',ticketId,{...ticket,status:staff?'waiting_customer':'open',version:ticket.version+1,updated_at:now});
  audit(tx,actor,ticket.company_id,'support.ticket_replied',{ticketId},now);
  return detail(tx,actor,ticketId);
 }
 if(name==='set_support_ticket_status'){
  const id=uuid(args.p_id),ticket=await tx.get('support_tickets',id);
  if(!ticket||!await assigned(tx,actor,ticket.company_id))fail('42501','Access denied');
  if(!statuses.includes(args.p_status)||!Number.isInteger(args.p_version))fail('22023','Invalid status');
  if(ticket!.version!==args.p_version)fail('40001','Ticket changed');
  tx.put('support_tickets',id,{...ticket!,status:args.p_status,version:ticket!.version+1,updated_at:now});
  audit(tx,actor,ticket!.company_id,'support.ticket_status',{ticketId:id,status:args.p_status},now);
  return detail(tx,actor,id);
 }
 return fail('FIRESTORE_OPERATION_PENDING','Support operation unavailable');
}
