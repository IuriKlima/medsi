import type {OnboardingSnapshot,PurchaseState} from '@askadia/contracts';
import {journeyApi} from './journey-api';

// A deadline for these two resume reads only. Mutations retain their own semantics.
export async function readPurchaseResume(base:string,signal:AbortSignal):Promise<[PurchaseState,OnboardingSnapshot]>{
 const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;let onAbort=()=>{};
 const interrupted=new Promise<never>((_resolve,reject)=>{
  onAbort=()=>{controller.abort();reject(new DOMException('Retomada cancelada.','AbortError'));};
  if(signal.aborted){onAbort();return;}
  signal.addEventListener('abort',onAbort,{once:true});
  timer=setTimeout(()=>{reject(new Error('A consulta está demorando além do esperado. Tente novamente para retomar seu cadastro.'));controller.abort();},20_000);
 });
 try{
  if(signal.aborted)return await interrupted;
  return await Promise.race([Promise.all([journeyApi<PurchaseState>(base+'/purchase',undefined,controller.signal),journeyApi<OnboardingSnapshot>(base,undefined,controller.signal)]),interrupted]);
 }finally{clearTimeout(timer);signal.removeEventListener('abort',onAbort);controller.abort();}
}
