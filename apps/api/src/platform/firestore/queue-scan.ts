import {createHash} from 'node:crypto';
import type {DocumentTransaction,Predicate,Row} from './store';

export const QUEUE_SCAN_SIZE=25;
const origins=new WeakMap<Row,{id:string;collection:string;scope:string;documentId:string}>();
/** Persist the actual claimed document, not the rest of its prefetched page. */
export function queueClaimed(tx:DocumentTransaction,row:Row){const origin=origins.get(row);if(origin)tx.put('worker_scan_cursors',origin.id,{collection:origin.collection,scope:origin.scope,after_id:origin.documentId,updated_at:new Date().toISOString()});}
/** Recurring jobs must yield to candidates never/less recently claimed. */
export function queueClaimOrder(a:Row,b:Row){return String(a.queue_claimed_at??'').localeCompare(String(b.queue_claimed_at??''));}
const continuations=new WeakMap<DocumentTransaction,Map<string,boolean>>();
export function queueHasMore(tx:DocumentTransaction,collection:string,scope='default'){return continuations.get(tx)?.get(collection+'/'+scope)??false;}
/** One durable page per poll. The cursor commits even when all candidates are
 * delayed, leased or ineligible; replicas share the transactional cursor. A
 * completed pass wraps on the next poll. We never materialize the whole queue.
 * Ordering priorities apply within the page; repeated polls provide fairness. */
export async function queueScan(tx:DocumentTransaction,collection:string,filters:Predicate[]=[],scope='default',limit=QUEUE_SCAN_SIZE):Promise<Row[]>{
 const id=createHash('sha256').update(JSON.stringify({collection,filters,scope})).digest('hex');
 const cursor=await tx.get('worker_scan_cursors',id);
 if(!tx.scan)throw new Error('Durable queue polling requires document cursor support');
 let page=await tx.scan(collection,filters,{limit,...(cursor?.after_id?{afterId:cursor.after_id}:{})});
 // An empty tail costs one bounded query; wrap immediately so small queues do
 // not acquire an artificial idle poll after every exactly-full page.
 const wrapped=!page.documents.length&&Boolean(cursor?.after_id);
 if(wrapped)page=await tx.scan(collection,filters,{limit});
 const continuation=continuations.get(tx)??new Map<string,boolean>();continuation.set(collection+'/'+scope,!wrapped&&Boolean(page.nextCursor));continuations.set(tx,continuation);
 const next=page.nextCursor??null;
 if((cursor?.after_id??null)!==next)tx.put('worker_scan_cursors',id,{collection,scope,after_id:next,updated_at:new Date().toISOString()});
 return page.documents.map(document=>{origins.set(document.data,{id,collection,scope,documentId:document.id});return document.data;});
}
export async function queueStates(tx:DocumentTransaction,collection:string,states:string[],field='status',filters:Predicate[]=[],scope='default'){
 const rows:Row[]=[];
 for(const state of states)rows.push(...await queueScan(tx,collection,[...filters,{field,value:state}],scope));
 return rows;
}
