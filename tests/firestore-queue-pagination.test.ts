import {queueScan} from '../apps/api/src/platform/firestore/queue-scan';
import {describe,expect,it,vi} from 'vitest';
import {MemoryStore} from './helpers/firestore-memory';
import type {DocumentStore} from '../apps/api/src/platform/firestore/store';
import {claimBillingReconciliation,finishBillingReconciliation} from '../apps/api/src/platform/firestore/billing-queue';

/** Isolated persisted queue fixtures: no Firestore or provider connection. */
describe('bounded durable queue scans',()=>{
 it('reaches due billing work beyond 1000 delayed jobs and isolates live leases and environment',async()=>{
  const memory=new MemoryStore();let largestRead=0,scans=0;
  const store:DocumentStore={run:operation=>memory.run(tx=>operation({...tx,scan:async(collection,filters,options)=>{scans++;expect(filters).toContainEqual({field:'environment',value:'sandbox'});const page=await tx.scan!(collection,filters,options);largestRead=Math.max(largestRead,page.documents.length);return page;},list:async(collection,filters,options)=>{const rows=await tx.list(collection,filters,options);largestRead=Math.max(largestRead,rows.length);if(rows.length>1000)throw new Error('Use a narrower Firestore query');return rows;}}))};
  await memory.run(async tx=>{
   for(let i=0;i<1001;i++)tx.put('billing_reconciliation_jobs','a'+String(i).padStart(4,'0'),{subscription_id:'a'+String(i).padStart(4,'0'),company_id:'other',environment:'sandbox',status:'pending',attempts:0,next_attempt_at:'2099-01-01',lease_until:null});
   for(const [id,environment,lease] of [['z_due','sandbox',null],['z_live','sandbox','2099-01-01'],['z_production','production',null]])tx.put('billing_reconciliation_jobs',id!,{subscription_id:id,company_id:id,environment,status:'pending',attempts:0,next_attempt_at:'2020-01-01',lease_until:lease});
  });
  let claimed=null;for(let i=0;i<50&&!claimed;i++)claimed=await store.run(claimBillingReconciliation);
  expect(claimed).toMatchObject({subscription_id:'z_due',company_id:'z_due',attempts:1});expect(largestRead).toBe(25);expect(scans).toBeGreaterThan(2);expect(scans).toBeLessThanOrEqual(100);
  expect(await store.run(claimBillingReconciliation)).toBeNull();
  await memory.run(async tx=>{const current=await tx.get('billing_reconciliation_jobs','z_due');tx.put('billing_reconciliation_jobs','z_due',{...current,status:'cancelled',lease_token:null,lease_until:null});});
  expect(await store.run(tx=>finishBillingReconciliation(tx,claimed!,true,'active'))).toBe(false);
 });
 it('wraps sparse scans and keeps distinct modes and tenant scopes independent',async()=>{
  const store=new MemoryStore();await store.run(async tx=>{for(const id of ['a','b','c'])tx.put('fixture_queue',id,{id,company_id:'a'});tx.put('fixture_queue','foreign',{id:'foreign',company_id:'b'});});
  const scan=(scope:string)=>store.run(tx=>queueScan(tx,'fixture_queue',[{field:'company_id',value:'a'}],scope,2));
  expect((await scan('prepare')).map(r=>r.id)).toEqual(['a','b']);expect((await scan('execute')).map(r=>r.id)).toEqual(['a','b']);expect((await scan('prepare')).map(r=>r.id)).toEqual(['c']);expect((await scan('prepare')).map(r=>r.id)).toEqual(['a','b']);
 });
 it('does not scan terminal billing history or give two workers the same lease',async()=>{
  const store=new MemoryStore();await store.run(async tx=>{for(let i=0;i<1001;i++)tx.put('billing_reconciliation_jobs','old'+i,{subscription_id:'old'+i,environment:'sandbox',status:'cancelled'});tx.put('billing_reconciliation_jobs','work',{subscription_id:'work',environment:'sandbox',status:'pending',attempts:0,next_attempt_at:'2020-01-01',lease_until:null});});
  const results=await Promise.all([store.run(claimBillingReconciliation),store.run(claimBillingReconciliation)]);expect(results.filter(Boolean)).toHaveLength(1);expect(results.find(Boolean)).toMatchObject({subscription_id:'work',attempts:1});
 });
 it('gives every recurring billing job a turn even when all become due again on every poll',async()=>{
  vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-10-07T12:00:00Z'));
  try{const store=new MemoryStore();await store.run(async tx=>{for(let n=0;n<76;n++){const id=String(n).padStart(3,'0');tx.put('billing_reconciliation_jobs',id,{subscription_id:id,environment:'sandbox',status:'pending',attempts:0,next_attempt_at:'2020-01-01',lease_until:null});}});
   const seen=new Set<string>();for(let n=0;n<100&&seen.size<76;n++){const job=(await store.run(claimBillingReconciliation))!;expect(job).not.toBeNull();seen.add(job.subscription_id);expect(await store.run(tx=>finishBillingReconciliation(tx,job,true,'active'))).toBe(true);vi.setSystemTime(new Date(Date.now()+3600001));}expect(seen.size).toBe(76);
  }finally{vi.useRealTimers();}
 });

});
