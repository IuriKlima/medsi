import {assertFirestoreDocument,selectFirestorePage} from '../../apps/api/src/platform/firestore/store';
import type {DocumentStore,DocumentTransaction,Row} from '../../apps/api/src/platform/firestore/store';

export class MemoryStore implements DocumentStore {
 private rows=new Map<string,Row>();private queue:Promise<unknown>=Promise.resolve();
 run<T>(operation:(tx:DocumentTransaction)=>Promise<T>):Promise<T>{
  const task=this.queue.then(async()=>{
   const rows=structuredClone(this.rows);
   const tx:DocumentTransaction={
    get:async(c,id)=>structuredClone(rows.get(c+'/'+id)??null),
    list:async(c,filters=[],options)=>{const matching=new Map([...rows.entries()].filter(([k,r])=>k.startsWith(c+'/')&&filters.every(f=>r[f.field]===f.value)).map(([k,r])=>[k.slice(c.length+1),structuredClone(r)]));return options?selectFirestorePage(matching,options):[...matching.values()];},
    put:(c,id,r)=>{assertFirestoreDocument(r);rows.set(c+'/'+id,structuredClone(r));},
    remove:(c,id)=>{rows.delete(c+'/'+id);}
   };const result=await operation(tx);this.rows=rows;return result;
  });this.queue=task.catch(()=>{});return task;
 }
}
