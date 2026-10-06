import type {AuthRequest} from '../identity/auth';
import {credentials} from './ads';
import {metaContext,metaGraph} from '../inbox/meta';
export type MetaBilling={status:'unavailable'|'restricted'|'unverified';message:string;accountStatus:number|null;checkedAt:string;url:string};
/** AdAccount.balance is not proof of spendable credit. Never infer available funds from it. */
export function billingObservation(value:{account_status?:unknown}):Pick<MetaBilling,'status'|'message'|'accountStatus'>{
 const status=typeof value.account_status==='number'&&Number.isInteger(value.account_status)?value.account_status:null;
 if(status===null)return {status:'unavailable',accountStatus:null,message:'A Meta não retornou a situação da conta. Não foi possível verificar as condições de veiculação.'};
 if(status!==1)return {status:'restricted',accountStatus:status,message:'A Meta informou uma restrição nesta conta. Confira o faturamento, a forma de pagamento e a situação da conta antes de veicular.'};
 return {status:'unverified',accountStatus:status,message:'Conta ativa na Meta. O saldo disponível não foi confirmado pela API; confira o faturamento e os limites antes de autorizar investimento.'};
}
export async function metaBilling(r:AuthRequest,company:string):Promise<MetaBilling>{
 const checkedAt=new Date().toISOString();let url='https://business.facebook.com/billing_hub/';
 try{const connection=await credentials(r,company,'meta');if(connection?.status!=='connected'||!connection.account_id)return {status:'unavailable',accountStatus:null,checkedAt,url,message:'Selecione a conta de anúncios Meta desta empresa para consultar sua situação.'};const context=await metaContext(r,company,'marketing.read');if(!context.userToken||!context.access.adsRead||connection.source_page!==context.page)throw new Error('Account authorization unavailable');url+='?asset_id='+encodeURIComponent(connection.account_id.replace(/^act_/,''));const account=await metaGraph<{account_status?:unknown}>(connection.account_id,context.userToken,{fields:'account_status'});return {...billingObservation(account),checkedAt,url};}
 catch{return {status:'unavailable',accountStatus:null,checkedAt,url,message:'Não foi possível consultar o faturamento da Meta. Confira a autorização e o saldo na plataforma; a MedSI não confirmou crédito disponível.'};}
}
