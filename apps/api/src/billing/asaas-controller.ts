import {BadRequestException,Body,Controller,ForbiddenException,Headers,HttpCode,HttpException,Post,ServiceUnavailableException,UnauthorizedException} from '@nestjs/common';
import {firestoreStore} from '../platform/firestore/store';
import {verifyAsaasWebhookToken} from '../platform/firestore/billing';
import {AsaasBillingService,AsaasSandboxAdapter} from './asaas';
export function asaasSandboxEnabled(){return process.env.DATABASE_PROVIDER==='firestore'&&process.env.CHECKOUT_MODE==='asaas_sandbox'&&process.env.ASAAS_ENVIRONMENT==='sandbox'&&process.env.NODE_ENV!=='production'&&Boolean(process.env.ASAAS_API_KEY);}
export function configuredAsaasService(){if(!asaasSandboxEnabled())throw new ServiceUnavailableException('A cobrança Asaas em sandbox não está configurada. Nenhuma cobrança real foi iniciada.');return new AsaasBillingService(firestoreStore(),new AsaasSandboxAdapter(process.env.ASAAS_API_KEY!));}
export async function asaasResponse<T>(operation:()=>Promise<T>):Promise<T>{
 try{return await operation();}catch(error){const code=(error as {code?:string})?.code;
  if(code==='42501')throw new ForbiddenException('Você não tem permissão para esta cobrança.');
  if(code==='22023')throw new BadRequestException('Confira a assinatura, a empresa e o estado da cobrança.');
  if(code?.startsWith('BILLING_'))throw new ServiceUnavailableException('Cobrança pendente de configuração ou conciliação do provedor. Tente consultar o estado novamente.');
  if(error instanceof HttpException)throw error;
  throw new ServiceUnavailableException('Não foi possível consultar o provedor de cobrança. Nenhum pagamento foi confirmado.');
 }
}
@Controller('billing/asaas')
export class AsaasBillingWebhookController {
 @Post('webhook') @HttpCode(200)
 async webhook(@Headers('asaas-access-token') token:unknown,@Body() body:unknown){
  try{verifyAsaasWebhookToken(token,process.env.ASAAS_WEBHOOK_AUTH_TOKEN);}catch{throw new UnauthorizedException('Webhook não autenticado.');}
  return asaasResponse(()=>configuredAsaasService().webhook(token,body,process.env.ASAAS_WEBHOOK_AUTH_TOKEN));
 }
}
