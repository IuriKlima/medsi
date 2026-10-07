import {getFirestore,type DocumentData,type Firestore,type Transaction} from 'firebase-admin/firestore';
import {firebaseAdmin} from '../firebase-admin';

export type Row=DocumentData;
export type Predicate={field:string;value:unknown};
export interface DocumentTransaction {
 get(collection:string,id:string):Promise<Row|null>;
 list(collection:string,filters?:Predicate[]):Promise<Row[]>;
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
 return getFirestore(firebaseAdmin(),process.env.FIRESTORE_DATABASE_ID||'(default)');
}
const segment=(value:string)=>{if(!value||value.includes('/')||value==='.'||value==='..'||value.length>500)throw new Error('Invalid document path');return value;};

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
 async list(collection:string,filters:Predicate[]=[]){
  let query=this.db.collection(FIRESTORE_ROOT+'/'+segment(collection)).limit(1001);
  for(const filter of filters){if(!/^[a-z_][a-z0-9_]*$/.test(filter.field))throw new Error('Invalid query field');query=query.where(filter.field,'==',filter.value);}
  const snapshot=await this.tx.get(query);
  if(snapshot.size>1000)throw new Error('Use a narrower Firestore query');
  const rows=new Map(snapshot.docs.map(doc=>[doc.id,doc.data()]));
  for(const write of this.writes.values())if(write.collection===collection){rows.delete(write.id);if(write.value&&filters.every(f=>write.value![f.field]===f.value))rows.set(write.id,structuredClone(write.value));}
  return [...rows.values()];
 }
 put(collection:string,id:string,value:Row){this.ref(collection,id);assertFirestoreDocument(value);if(Buffer.byteLength(JSON.stringify(value),'utf8')>800000)throw new Error('Document size limit exceeded');this.writes.set(collection+'/'+id,{collection,id,value:structuredClone(value)});}
 remove(collection:string,id:string){this.ref(collection,id);this.writes.set(collection+'/'+id,{collection,id,value:null});}
 flush(){for(const write of this.writes.values()){const ref=this.ref(write.collection,write.id);if(write.value===null)this.tx.delete(ref);else this.tx.set(ref,write.value);}}
}
export function firestoreStore(db?:Firestore):DocumentStore{return {run:operation=>(db??firestoreDatabase()).runTransaction(async transaction=>{const tx=new FirestoreTransaction(db??firestoreDatabase(),transaction);const result=await operation(tx);tx.flush();return result;})};}
