import {FieldPath,type DocumentData,type Firestore,type Transaction,type Query} from 'firebase-admin/firestore';
import {firebaseFirestore} from '../firebase-admin';

export type Row=DocumentData;
export type Predicate={field:string;value:unknown;op?:'=='|'<'|'<='|'>'|'>='};
export function matchesFirestorePredicate(row:Row,filter:Predicate):boolean{const a=row[filter.field],b=filter.value;if(!filter.op||filter.op==='==')return a===b;if(a===undefined||a===null||b===undefined||b===null)return false;switch(filter.op){case '<':return a<(b as never);case '<=':return a<=(b as never);case '>':return a>(b as never);case '>=':return a>=(b as never);}}
export type ListOptions={limit:number;orderBy?:string;descending?:boolean;afterId?:string;offset?:number;tieBreakerDescending?:boolean};
export type DocumentPage={documents:{id:string;data:Row}[];nextCursor?:string};
export interface DocumentTransaction {
 get(collection:string,id:string):Promise<Row|null>;
 list(collection:string,filters?:Predicate[],options?:ListOptions):Promise<Row[]>;
 /** Bounded ascending document-ID page; cursors use stored IDs, never row fields. */
 scan?(collection:string,filters:Predicate[],options:ListOptions):Promise<DocumentPage>;
 count?(collection:string,filters?:Predicate[]):Promise<number>;
 put(collection:string,id:string,value:Row):void;
 remove(collection:string,id:string):void;
}
export interface DocumentStore {run<T>(operation:(tx:DocumentTransaction)=>Promise<T>):Promise<T>}
export const FIRESTORE_ROOT='medsi/v1';
/** Reject values the Firestore SDK cannot persist before committing any writes. */
export function assertFirestoreDocument(value:unknown,path='document'):void{
 if(value===undefined)throw new Error('Undefined Firestore field: '+path);
 if(typeof value==='number'&&!Number.isFinite(value))throw new Error('Nonfinite Firestore field: '+path);
 if(value&&typeof value==='object')for(const [key,child] of Object.entries(value))assertFirestoreDocument(child,path+'.'+key);
}
export function firestoreDatabase(){
 if(process.env.NODE_ENV==='production'&&process.env.FIRESTORE_EMULATOR_HOST)throw new Error('Firestore emulator is forbidden in production');
 return firebaseFirestore();
}
const segment=(value:string)=>{if(!value||value.includes('/')||value==='.'||value==='..'||value.length>500)throw new Error('Invalid document path');return value;};

/** Apply the same ordered page to staged writes and isolated test stores. */
export function selectFirestoreDocuments(rows:Map<string,Row>,options:ListOptions):DocumentPage['documents']{
 const field=options.orderBy??'__name__';
 if(!Number.isInteger(options.limit)||options.limit<1||options.limit>1000||!/^[_a-z][_a-z0-9]*$/.test(field)||options.afterId!==undefined&&(field!=='__name__'||options.descending))throw new Error('Invalid Firestore page');
 if(options.offset!==undefined&&(!Number.isSafeInteger(options.offset)||options.offset<0||options.afterId!==undefined))throw new Error('Invalid Firestore offset');
 if(options.afterId!==undefined)segment(options.afterId);
 const entries=[...rows].filter(([id,row])=>(field==='__name__'||row[field]!==undefined)&&(options.afterId===undefined||id>options.afterId));
 const compare=(a:unknown,b:unknown)=>a===b?0:a!<b!?-1:1;
 entries.sort(([aid,a],[bid,b])=>compare(field==='__name__'?aid:a[field],field==='__name__'?bid:b[field])*(options.descending?-1:1)||compare(aid,bid)*((options.tieBreakerDescending??options.descending)?-1:1));
 return entries.slice(options.offset??0,(options.offset??0)+options.limit).map(([id,data])=>({id,data}));
}

export function selectFirestorePage(rows:Map<string,Row>,options:ListOptions):Row[]{return selectFirestoreDocuments(rows,options).map(document=>document.data);}

/** Stage writes until every read/permission check has completed. Firestore may
 * retry the callback, so external effects (files, email, AI) never run here. */
class FirestoreTransaction implements DocumentTransaction {
 private writes=new Map<string,{collection:string;id:string;value:Row|null}>();
 constructor(private db:Firestore,private tx:Transaction){}
 private ref(collection:string,id:string){return this.db.collection(FIRESTORE_ROOT+'/'+segment(collection)).doc(segment(id));}
 async get(collection:string,id:string){
  const key=collection+'/'+id,staged=this.writes.get(key);
  if(staged)return staged.value===null?null:structuredClone(staged.value);
  const snapshot=await this.tx.get(this.ref(collection,id));
  return snapshot.exists?snapshot.data()!:null;
 }
 private async documents(collection:string,filters:Predicate[]=[],options?:ListOptions){
  if(options)selectFirestorePage(new Map(),options);
  const stagedCount=[...this.writes.values()].filter(w=>w.collection===collection).length;
  let query=this.db.collection(FIRESTORE_ROOT+'/'+segment(collection)).limit(options?options.limit+stagedCount+(stagedCount?options.offset??0:0):1001);
  for(const filter of filters){if(!/^[a-z_][a-z0-9_]*$/.test(filter.field))throw new Error('Invalid query field');query=query.where(filter.field,filter.op??'==',filter.value);}
  if(options){query=query.orderBy(options.orderBy&&options.orderBy!=='__name__'?options.orderBy:FieldPath.documentId(),options.descending?'desc':'asc');if(options.tieBreakerDescending!==undefined&&options.orderBy&&options.orderBy!=='__name__')query=query.orderBy(FieldPath.documentId(),options.tieBreakerDescending?'desc':'asc');if(options.afterId!==undefined)query=query.startAfter(options.afterId);if(options.offset&&!stagedCount)query=query.offset(options.offset);}
  const snapshot=await this.tx.get(query);
  if(!options&&snapshot.size>1000)throw new Error('Use a narrower Firestore query');
  const rows=new Map(snapshot.docs.map(doc=>[doc.id,doc.data()]));
  for(const write of this.writes.values())if(write.collection===collection){rows.delete(write.id);if(write.value&&filters.every(f=>matchesFirestorePredicate(write.value!,f)))rows.set(write.id,structuredClone(write.value));}
  return options?selectFirestoreDocuments(rows,stagedCount?options:{...options,offset:undefined}):[...rows].map(([id,data])=>({id,data}));
 }
 async list(collection:string,filters:Predicate[]=[],options?:ListOptions){return (await this.documents(collection,filters,options)).map(document=>document.data);}
 async count(collection:string,filters:Predicate[]=[]):Promise<number>{
  if([...this.writes.values()].some(write=>write.collection===collection))throw new Error('Aggregate count requires no staged collection writes');
  let query:Query=this.db.collection(FIRESTORE_ROOT+'/'+segment(collection));
  for(const filter of filters){if(!/^[a-z_][a-z0-9_]*$/.test(filter.field))throw new Error('Invalid query field');query=query.where(filter.field,filter.op??'==',filter.value);}
  return (await this.tx.get(query.count())).data().count;
 }
 async scan(collection:string,filters:Predicate[],options:ListOptions):Promise<DocumentPage>{
  if(options.orderBy&&options.orderBy!=='__name__'||options.descending||filters.some(filter=>filter.op&&filter.op!=='=='))throw new Error('Scan requires equality filters and ascending document order');
  const documents=await this.documents(collection,filters,options);
  return {documents,nextCursor:documents.length===options.limit?documents.at(-1)!.id:undefined};
 }
 put(collection:string,id:string,value:Row){this.ref(collection,id);assertFirestoreDocument(value);if(Buffer.byteLength(JSON.stringify(value),'utf8')>800000)throw new Error('Document size limit exceeded');this.writes.set(collection+'/'+id,{collection,id,value:structuredClone(value)});}
 remove(collection:string,id:string){this.ref(collection,id);this.writes.set(collection+'/'+id,{collection,id,value:null});}
 flush(){for(const write of this.writes.values()){const ref=this.ref(write.collection,write.id);if(write.value===null)this.tx.delete(ref);else this.tx.set(ref,write.value);}}
}
export function firestoreStore(db?:Firestore):DocumentStore{return {run:operation=>(db??firestoreDatabase()).runTransaction(async transaction=>{const tx=new FirestoreTransaction(db??firestoreDatabase(),transaction);const result=await operation(tx);tx.flush();return result;})};}

/** Deliberately bounded full result for an authorized scope; never a global drain. */
export async function scopedRows(tx:DocumentTransaction,collection:string,filters:Predicate[],maximum=10000):Promise<Row[]>{
 if(!filters.length||!Number.isSafeInteger(maximum)||maximum<1)throw new Error('A bounded Firestore scope is required');
 if(!tx.scan){const rows=await tx.list(collection,filters);if(rows.length>maximum)throw Object.assign(new Error('Use a narrower Firestore query: scoped read exceeds '+maximum+' documents'),{code:'54000'});return rows;}
 const rows:Row[]=[];let afterId:string|undefined;
 do{const page=await tx.scan(collection,filters,{limit:Math.min(500,maximum+1-rows.length),afterId});rows.push(...page.documents.map(document=>document.data));if(rows.length>maximum)throw Object.assign(new Error('Use a narrower Firestore query: scoped read exceeds '+maximum+' documents'),{code:'54000'});if(page.nextCursor!==undefined&&(page.documents.length===0||afterId!==undefined&&page.nextCursor<=afterId))throw new Error('Firestore cursor did not advance');afterId=page.nextCursor;}while(afterId!==undefined);
 return rows;
}
