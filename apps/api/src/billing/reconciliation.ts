import {Injectable,type OnModuleDestroy,type OnModuleInit} from '@nestjs/common';
import {firestoreStore} from '../platform/firestore/store';
import {queuePollDelay} from '../platform/queue-polling';
import {claimBillingReconciliation,finishBillingReconciliation} from '../platform/firestore/billing-queue';
import {asaasSandboxEnabled,configuredAsaasService} from './asaas-controller';
export {claimBillingReconciliation,finishBillingReconciliation} from '../platform/firestore/billing-queue';
/** API owns sandbox billing polling, alongside the existing business executors.
 * Transactional per-subscription leases serialize API replicas; BullMQ does not consume these jobs. */
@Injectable()
export class AsaasBillingReconciliationWorker implements OnModuleInit,OnModuleDestroy {
 private timer:ReturnType<typeof setTimeout>|undefined;private stopped=false;
 onModuleInit(){if(asaasSandboxEnabled()&&process.env.ASAAS_RECONCILIATION_ENABLED!=='false')this.timer=setTimeout(()=>void this.tick(),6000);}
 onModuleDestroy(){this.stopped=true;if(this.timer)clearTimeout(this.timer);}
 private async tick(){let hadJob=false,failed=false;
  try{if(!asaasSandboxEnabled())return;const store=firestoreStore(),job=await store.run(tx=>claimBillingReconciliation(tx));hadJob=Boolean(job);if(job&&!this.stopped){try{const result=await configuredAsaasService().reconcile(job.subscription_id);await store.run(tx=>finishBillingReconciliation(tx,job,true,result.status));}catch{failed=true;await store.run(tx=>finishBillingReconciliation(tx,job,false));}}}
  catch{failed=true;}
  finally{if(!this.stopped&&asaasSandboxEnabled())this.timer=setTimeout(()=>void this.tick(),queuePollDelay(hadJob,failed,7000));}
 }
}
