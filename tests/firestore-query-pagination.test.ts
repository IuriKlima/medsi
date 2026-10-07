import {randomUUID} from 'node:crypto';
import {describe,expect,it} from 'vitest';
import {queueScan} from '../apps/api/src/platform/firestore/queue-scan';
import {firestoreClient} from '../apps/api/src/platform/firestore/client';
import {FIRESTORE_ROOT,firestoreStore,matchesFirestorePredicate,type Predicate,type Row} from '../apps/api/src/platform/firestore/store';

type Reference={path:string};
type Ordering={field:string;descending:boolean};
/** Local SDK boundary fixture. Queries execute native filters/order/offset/cursor
 * before returning snapshots to the real FirestoreTransaction implementation. */
class Query {
 constructor(readonly path:string,readonly filters:Predicate[]=[],readonly maximum=Infinity,readonly orders:Ordering[]=[],readonly after?:string,readonly skipped=0,readonly aggregate=false){}
 doc(id:string):Reference{return {path:this.path+'/'+id};}
 where(field:string,op:Predicate['op'],value:unknown){return new Query(this.path,[...this.filters,{field,op,value}],this.maximum,this.orders,this.after,this.skipped,this.aggregate);}
 limit(maximum:number){return new Query(this.path,this.filters,maximum,this.orders,this.after,this.skipped,this.aggregate);}
 orderBy(field:unknown,direction='asc'){return new Query(this.path,this.filters,this.maximum,[...this.orders,{field:typeof field==='string'?field:'__name__',descending:direction==='desc'}],this.after,this.skipped,this.aggregate);}
 startAfter(id:string){return new Query(this.path,this.filters,this.maximum,this.orders,id,this.skipped,this.aggregate);}
 offset(skipped:number){return new Query(this.path,this.filters,this.maximum,this.orders,this.after,skipped,this.aggregate);}
 count(){return new Query(this.path,this.filters,this.maximum,this.orders,this.after,this.skipped,true);}
}
class SdkFixture {
 readonly rows=new Map<string,Row>();
 readonly reads:{query:Query;ids:string[]}[]=[];
 put(collection:string,id:string,row:Row){this.rows.set(FIRESTORE_ROOT+'/'+collection+'/'+id,structuredClone(row));}
 collection(path:string){return new Query(path);}
 async runTransaction<T>(operation:(tx:unknown)=>Promise<T>):Promise<T>{
  const staged=new Map<string,Row|null>();
  const result=await operation({
   get:async(ref:Reference|Query)=>{
    if(!(ref instanceof Query)){const row=this.rows.get(ref.path);return {exists:row!==undefined,data:()=>structuredClone(row)};}
    const orders=ref.orders.length?ref.orders:[{field:'__name__',descending:false}];
    const inequality=ref.filters.find(f=>f.op&&f.op!=='==');
    if(inequality&&ref.orders.length&&ref.orders[0].field!==inequality.field)throw new Error('Invalid leading inequality order');
    const docs=[...this.rows].filter(([path,row])=>path.startsWith(ref.path+'/')&&ref.filters.every(f=>matchesFirestorePredicate(row,f))&&orders.every(order=>order.field==='__name__'||row[order.field]!==undefined)).map(([path,row])=>({id:path.slice(ref.path.length+1),row}));
    const compare=(a:unknown,b:unknown)=>a===b?0:a!<b!?-1:1;
    docs.sort((a,b)=>{for(const order of orders){const value=compare(order.field==='__name__'?a.id:a.row[order.field],order.field==='__name__'?b.id:b.row[order.field]);if(value)return value*(order.descending?-1:1);}return compare(a.id,b.id)*(orders.at(-1)!.descending?-1:1);});
    const page=docs.filter(doc=>ref.after===undefined||doc.id>ref.after).slice(ref.skipped,ref.skipped+ref.maximum);
    this.reads.push({query:ref,ids:ref.aggregate?[]:page.map(doc=>doc.id)});
    return ref.aggregate?{data:()=>({count:page.length})}:{size:page.length,docs:page.map(doc=>({id:doc.id,data:()=>structuredClone(doc.row)}))};
   },
   set:(ref:Reference,row:Row)=>staged.set(ref.path,structuredClone(row)),
   delete:(ref:Reference)=>staged.set(ref.path,null),
  });
  for(const [path,row] of staged)if(row===null)this.rows.delete(path);else this.rows.set(path,row);
  return result;
 }
 store(){return firestoreStore(this as unknown as Parameters<typeof firestoreStore>[0]);}
}
function setup(){
 const fixture=new SdkFixture(),store=fixture.store(),owner=randomUUID(),workspace=randomUUID(),company=randomUUID(),foreign=randomUUID();
 fixture.put('companies',company,{id:company,workspace_id:workspace,name:'Owned',archived_at:null});
 fixture.put('workspace_members',workspace+'_'+owner,{workspace_id:workspace,user_id:owner,role:'owner'});
 fixture.put('companies',foreign,{id:foreign,workspace_id:randomUUID(),name:'Foreign'});
 return {fixture,store,owner,workspace,company,foreign,client:firestoreClient('authenticated',owner,store)};
}
const id=(n:number)=>String(n).padStart(5,'0');
function populate(fixture:SdkFixture,company:string,foreign:string,total=1205){
 for(let n=0;n<total;n++)fixture.put('contacts',id(n),{id:id(n),company_id:company,name:'Contact '+id(n),created_at:id(n),status:n%2?'open':'closed',nullable:n%3?null:'value'});
 for(let n=0;n<1500;n++)fixture.put('contacts','foreign-'+id(n),{id:'foreign-'+id(n),company_id:foreign,status:'open',created_at:'99999'});
}

describe('query pagination through native Firestore adapter (isolated SDK fixture)',()=>{
 it('reproduces the legacy unbounded guard and returns a scoped range beyond 1000 with native offset and limit',async()=>{
  const {fixture,store,client,company,foreign}=setup();populate(fixture,company,foreign);
  await expect(store.run(tx=>tx.list('contacts',[{field:'company_id',value:company}]))).rejects.toThrow('Use a narrower');fixture.reads.length=0;
  const result=await client.from('contacts').select('id').eq('company_id',company).range(1000,1009);
  expect(result.error).toBeNull();expect(result.data).toEqual(Array.from({length:10},(_,i)=>({id:id(1000+i)})));
  const reads=fixture.reads.filter(read=>read.query.path.endsWith('/contacts'));
  expect(reads.map(read=>read.ids.length)).toEqual([10]);expect(reads[0].query.skipped).toBe(1000);
  expect(reads.every(read=>read.query.filters.some(f=>f.field==='company_id'&&f.value===company)&&read.ids.every(value=>!value.startsWith('foreign-')))).toBe(true);
 });
 it('pushes additional scalar equality and stops after the requested result window',async()=>{
  const {fixture,client,company,foreign}=setup();populate(fixture,company,foreign);
  const result=await client.from('contacts').select('id').eq('company_id',company).eq('status','open').limit(3);
  expect(result.error).toBeNull();expect(result.data?.map(row=>row.id)).toEqual(['00001','00003','00005']);
  expect(fixture.reads.filter(read=>read.query.path.endsWith('/contacts')).map(read=>read.ids.length)).toEqual([3]);
 });
 it('uses a scoped aggregate for exact head counts without fetching document bodies',async()=>{
  const {fixture,client,company,foreign}=setup();populate(fixture,company,foreign);
  const result=await client.from('contacts').select('*',{head:true,count:'exact'}).eq('company_id',company).limit(0);
  expect(result.error).toBeNull();expect(result.data).toBeNull();expect(result.count).toBe(1205);
  const reads=fixture.reads.filter(read=>read.query.path.endsWith('/contacts'));expect(reads).toHaveLength(1);expect(reads[0].query.aggregate).toBe(true);expect(reads[0].ids).toEqual([]);
 });
 it('keeps exact filtered count independent of a native offset result page',async()=>{
  const {fixture,client,company,foreign}=setup();populate(fixture,company,foreign);
  const result=await client.from('contacts').select('id',{count:'exact'}).eq('company_id',company).eq('status','open').range(500,502);
  expect(result.error).toBeNull();expect(result.count).toBe(602);expect(result.data?.map(row=>row.id)).toEqual(['01001','01003','01005']);
  const reads=fixture.reads.filter(read=>read.query.path.endsWith('/contacts'));expect(reads.map(read=>read.ids.length)).toEqual([0,3]);
 });
 it('counts residual filters even when result limit is zero and preserves missing versus null',async()=>{
  const {fixture,client,company,foreign}=setup();populate(fixture,company,foreign);
  fixture.put('contacts','missing',{id:'missing',company_id:company});
  const result=await client.from('contacts').select('*',{head:true,count:'exact'}).eq('company_id',company).neq('nullable',null).limit(0);
  expect(result.error).toBeNull();expect(result.count).toBe(403);
  const nulls=await client.from('contacts').select('id',{count:'exact'}).eq('company_id',company).is('nullable',null).limit(1);
  expect(nulls.error).toBeNull();expect(nulls.count).toBe(803);expect(nulls.data).toEqual([{id:'00001'}]);
 });
 it('preserves missing ordered fields rather than silently excluding legacy documents',async()=>{
  const {fixture,client,company}=setup();
  fixture.put('contacts','a',{id:'a',company_id:company});fixture.put('contacts','b',{id:'b',company_id:company,name:'B'});
  const result=await client.from('contacts').select('id',{count:'exact'}).eq('company_id',company).order('name');
  expect(result.error).toBeNull();expect(result.count).toBe(2);expect(result.data?.map(row=>row.id).sort()).toEqual(['a','b']);
 });
 it('combines owner-workspace and direct membership access without exposing other companies',async()=>{
  const {fixture,client,owner,workspace}=setup();
  for(let n=0;n<1001;n++)fixture.put('companies','owned-'+id(n),{id:'owned-'+id(n),workspace_id:workspace,name:id(n)});
  const member=randomUUID();fixture.put('companies',member,{id:member,workspace_id:randomUUID(),name:'Member'});fixture.put('company_members',member+'_'+owner,{company_id:member,user_id:owner,role:'reader'});
  const result=await client.from('companies').select('id',{count:'exact'}).order('name').range(1000,1009);
  expect(result.error).toBeNull();expect(result.count).toBe(1003);expect(result.data).toHaveLength(3);
  expect(fixture.reads.filter(read=>read.query.path.endsWith('/companies')).every(read=>read.query.filters.some(f=>f.field==='workspace_id'&&f.value===workspace))).toBe(true);
 });
 it('rejects foreign-company reads and private invitation field filters before document queries',async()=>{
  const {fixture,client,company,foreign}=setup();
  const denied=await client.from('contacts').select('*').eq('company_id',foreign).range(1000,1009);
  expect(denied.error?.code).toBe('42501');expect(fixture.reads).toEqual([]);
  const privateField=await client.from('company_invitations').select('*').eq('company_id',company).eq('token_hash','secret');
  expect(privateField.error?.code).toBe('42501');expect(fixture.reads).toEqual([]);
 });
 it('returns only safe invitation fields after 1000 records',async()=>{
  const {fixture,client,company}=setup();for(let n=0;n<1002;n++)fixture.put('company_invitations',id(n),{id:id(n),company_id:company,email:'fixture@example.test',token_hash:'private'});
  const result=await client.from('company_invitations').select('*').eq('company_id',company).range(1000,1001);
  expect(result.error).toBeNull();expect(result.data).toHaveLength(2);expect(result.data?.every(row=>!('token_hash' in row))).toBe(true);
 });
 it('preserves real document IDs for legacy rows and staged deletion/insertion across pages',async()=>{
  const {fixture,store}=setup();for(let n=0;n<1005;n++)fixture.put('legacy',id(n),{status:'ready'});
  const first=await store.run(tx=>tx.scan!('legacy',[{field:'status',value:'ready'}],{limit:1000}));
  expect(first.documents[0]).toEqual({id:'00000',data:{status:'ready'}});expect(first.nextCursor).toBe('00999');
  const next=await store.run(async tx=>{tx.remove('legacy','01000');tx.put('legacy','01000a',{status:'ready'});return tx.scan!('legacy',[{field:'status',value:'ready'}],{limit:3,afterId:first.nextCursor});});
  expect(next.documents.map(row=>row.id)).toEqual(['01000a','01001','01002']);
  const last=await store.run(tx=>tx.scan!('legacy',[{field:'status',value:'ready'}],{limit:3,afterId:next.nextCursor}));expect(last.documents.map(row=>row.id)).toEqual(['01003','01004']);expect(last.nextCursor).toBeUndefined();
 });
 it('executes explicit ordered offsets, tie direction and timestamp range filters at the SDK boundary',async()=>{
  const {fixture,store,company}=setup();for(let n=0;n<1100;n++)fixture.put('audit_logs',id(n),{id:id(n),company_id:company,created_at:'2026-10-07'});
  const rows=await store.run(tx=>tx.list('audit_logs',[{field:'company_id',value:company},{field:'created_at',op:'>=',value:'2026-10-01'}],{limit:3,offset:1000,orderBy:'created_at',descending:true,tieBreakerDescending:false}));
  expect(rows.map(row=>row.id)).toEqual(['01000','01001','01002']);expect(fixture.reads[0].ids).toHaveLength(3);expect(fixture.reads[0].query.skipped).toBe(1000);
 });
 it('returns a manager audit range past 1000 using a native offset without loading history',async()=>{
  const {fixture,client,company}=setup();for(let n=0;n<1100;n++)fixture.put('audit_logs',id(n),{id:id(n),company_id:company,created_at:id(n)});
  const result=await client.from('audit_logs').select('id').eq('company_id',company).order('created_at',{ascending:false}).range(1000,1002);
  expect(result.error).toBeNull();expect(result.data?.map(row=>row.id)).toEqual(['00099','00098','00097']);
  const reads=fixture.reads.filter(read=>read.query.path.endsWith('/audit_logs'));expect(reads).toHaveLength(1);expect(reads[0].ids).toHaveLength(3);expect(reads[0].query.skipped).toBe(1000);
 });
 it('persists bounded queue cursor progress through more than 1000 legacy documents and wraps',async()=>{
  const {fixture,store}=setup();for(let n=0;n<1005;n++)fixture.put('legacy_jobs',id(n),{status:'ready',label:id(n)});
  const seen:string[]=[];
  for(let poll=0;poll<3;poll++)seen.push(...(await store.run(tx=>queueScan(tx,'legacy_jobs',[{field:'status',value:'ready'}],'fixture',500))).map(row=>row.label));
  expect(seen).toEqual(Array.from({length:1005},(_,n)=>id(n)));
  const wrapped=await store.run(tx=>queueScan(tx,'legacy_jobs',[{field:'status',value:'ready'}],'fixture',500));expect(wrapped[0].label).toBe('00000');
  const reads=fixture.reads.filter(read=>read.query.path.endsWith('/legacy_jobs'));expect(reads.map(read=>read.ids.length)).toEqual([500,500,5,500]);
 });
 it('rejects range filters with document-ID scans before issuing an invalid native query',async()=>{
  const {fixture,store}=setup();await expect(store.run(tx=>tx.scan!('contacts',[{field:'created_at',op:'>',value:'2026-01-01'}],{limit:10}))).rejects.toThrow('Scan requires equality');expect(fixture.reads).toEqual([]);
 });
 it('fails explicitly instead of returning a truncated sorted/count compatibility query over its bounded scope',async()=>{
  const {fixture,client,company}=setup();for(let n=0;n<10001;n++)fixture.put('contacts',id(n),{id:id(n),company_id:company,name:id(n)});
  const result=await client.from('contacts').select('*').eq('company_id',company).order('name').limit(1);
  expect(result.error?.code).toBe('54000');expect(result.data).toBeNull();expect(fixture.reads.every(read=>read.ids.length<=500)).toBe(true);
 });
});
