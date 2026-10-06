import {BadRequestException,Body,Controller,Param,Post,Req,UseGuards} from '@nestjs/common';
import {z} from 'zod';
import {cnpjSchema,medicalIntakeRequestSchema} from '@askadia/contracts';
import {AuthGuard,type AuthRequest} from '../identity/auth';
import {adsAccess} from '../campaigns/ads';
import {result} from '../identity/service';
import {snapshot} from './controller';
import {lookupCnpj} from './cnpj';
import {publicWebsiteUrl} from './providers';
@Controller('onboarding/companies/:id')
@UseGuards(AuthGuard)
export class MedicalIntakeController{
 @Post('cnpj') async cnpj(@Req() r:AuthRequest,@Param('id') id:string,@Body() body:unknown){
  await adsAccess(r,id,'marketing.write');
  const input=z.object({cnpj:cnpjSchema,requestId:z.uuid()}).strict().safeParse(body);
  if(!input.success)throw new BadRequestException('Confira o CNPJ informado.');
  if(!result<boolean>(await r.actor.client.rpc('reserve_onboarding_provider',{p_company_id:id,p_request_id:input.data.requestId,p_kind:'places'})))throw new BadRequestException('Limite de consultas atingido. Você pode informar o endereço manualmente.');
  const value=await lookupCnpj(input.data.cnpj);
  await r.actor.client.rpc('finish_onboarding_provider',{p_company_id:id,p_request_id:input.data.requestId,p_kind:'places',p_outcome:value.status==='available'?'completed':'failed'});
  await adsAccess(r,id,'marketing.write');
  return value;
 }
 @Post('intake') async save(@Req() r:AuthRequest,@Param('id') id:string,@Body() body:unknown){
  await adsAccess(r,id,'marketing.write');
  const input=medicalIntakeRequestSchema.safeParse(body);
  if(!input.success)throw new BadRequestException(input.error.issues[0]?.message??'Revise sua resposta.');
  if(input.data.step==='website'&&input.data.answer.mode==='existing'){
   try{publicWebsiteUrl(input.data.answer.url);}catch{throw new BadRequestException('Informe um site público HTTPS sem credenciais, porta ou parâmetros.');}
  }
  result(await r.actor.client.rpc('save_medical_intake',{p_company_id:id,p_request_id:input.data.requestId,p_revision:input.data.revision,p_step:input.data.step,p_answer:input.data.answer}));
  return snapshot(r.actor,id);
 }
}
