import {assertFirestoreDocument,selectFirestorePage,selectFirestoreDocuments,matchesFirestorePredicate} from '../../apps/api/src/platform/firestore/store';
import type {DocumentStore,DocumentTransaction,Row} from '../../apps/api/src/platform/firestore/store';

export class MemoryStore implements DocumentStore {
 private rows=new Map<string,Row>();private queue:Promise<unknown>=Promise.resolve();
 run<T>(operation:(tx:DocumentTransaction)=>Promise<T>):Promise<T>{
  const task=this.queue.then(async()=>{
   const rows=structuredClone(this.rows);
   const tx:DocumentTransaction={
    get:async(c,id)=>structuredClone(rows.get(c+'/'+id)??null),
    list:async(c,filters=[],options)=>{const matching=new Map([...rows.entries()].filter(([k,r])=>k.startsWith(c+'/')&&filters.every(f=>matchesFirestorePredicate(r,f))).map(([k,r])=>[k.slice(c.length+1),structuredClone(r)]));return options?selectFirestorePage(matching,options):[...matching.values()];},
    count:async(c,filters=[])=>[...rows.entries()].filter(([k,r])=>k.startsWith(c+'/')&&filters.every(f=>matchesFirestorePredicate(r,f))).length,
    scan:async(c,filters,options)=>{if(options.orderBy&&options.orderBy!=='__name__'||options.descending||filters.some(filter=>filter.op&&filter.op!=='=='))throw new Error('Scan requires equality filters and ascending document order');const matching=new Map([...rows.entries()].filter(([k,r])=>k.startsWith(c+'/')&&filters.every(f=>matchesFirestorePredicate(r,f))).map(([k,r])=>[k.slice(c.length+1),structuredClone(r)]));const documents=selectFirestoreDocuments(matching,options);return {documents,nextCursor:documents.length===options.limit?documents.at(-1)!.id:undefined};},
    put:(c,id,r)=>{assertFirestoreDocument(r);rows.set(c+'/'+id,structuredClone(r));},
    remove:(c,id)=>{rows.delete(c+'/'+id);}
   };const result=await operation(tx);this.rows=rows;return result;
  });this.queue=task.catch(()=>{});return task;
 }
}
