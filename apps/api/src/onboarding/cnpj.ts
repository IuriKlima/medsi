import {cnpjSchema,type CnpjLookupResult} from '@askadia/contracts';
const source={source:'BrasilAPI · dados públicos de CNPJ',sourceUrl:'https://brasilapi.com.br/docs#tag/CNPJ'};
/** Public registration data via an adapter, not a live or certified Receita connection. */
export async function lookupCnpj(value:string,transport:typeof fetch=fetch,enabled=process.env.CNPJ_LOOKUP_ENABLED!=='false'):Promise<CnpjLookupResult>{
 const cnpj=cnpjSchema.parse(value);
 const base={...source,collectedAt:null,data:null};
 if(!enabled)return {...base,status:'unconfigured',message:'A consulta de CNPJ está desativada. Você pode confirmar os dados manualmente.'};
 try{
  const r=await transport('https://brasilapi.com.br/api/cnpj/v1/'+encodeURIComponent(cnpj),{redirect:'error',signal:AbortSignal.timeout(8000),headers:{Accept:'application/json'}});
  if(r.status===404)return {...base,status:'not_found',message:'CNPJ não encontrado nessa base. Confira o número ou informe o endereço manualmente.'};
  if(!r.ok)throw new Error('CNPJ_PROVIDER_UNAVAILABLE');
  const text=await r.text();if(text.length>1000000)throw new Error('CNPJ_RESPONSE_TOO_LARGE');
  const data=JSON.parse(text) as Record<string,unknown>;
  const str=(key:string,max=200)=>typeof data[key]==='string'?(data[key] as string).trim().slice(0,max):'';
  if(cnpjSchema.safeParse(str('cnpj')).data!==cnpj||!str('razao_social')||!str('municipio')||!/^[A-Z]{2}$/.test(str('uf')))throw new Error('CNPJ_RESPONSE_MISMATCH');
  const addressLine=[str('descricao_tipo_de_logradouro'),str('logradouro'),str('numero'),str('complemento'),str('bairro')].filter(Boolean).join(' ').slice(0,500);
  return {...source,status:'available',collectedAt:new Date().toISOString(),message:'Dados públicos sugeridos pela BrasilAPI. Confira o endereço onde você atende e ajuste o que mudou; a base pode ter defasagem.',data:{cnpj,legalName:str('razao_social'),tradeName:str('nome_fantasia',100),addressLine,city:str('municipio',90),uf:str('uf',2),postalCode:str('cep',12).replace(/\D/g,''),registrationStatus:str('descricao_situacao_cadastral')}};
 }catch{return {...base,status:'unavailable',message:'A base de CNPJ não respondeu ou não suporta esse cadastro. Suas respostas continuam salvas; informe o endereço manualmente ou tente consultar novamente.'};}
}
