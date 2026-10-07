import {randomUUID} from 'node:crypto';
import {beforeEach,describe,expect,it} from 'vitest';
import {firestoreClient} from '../apps/api/src/platform/firestore/client';
import {FIRESTORE_ROOT,firestoreStore,type DocumentStore,type Predicate,type Row} from '../apps/api/src/platform/firestore/store';

type Reference={path:string};
/** SDK boundary fixture only: production FirestoreTransaction enforces its own
 * query cap. Unlike MemoryStore, this fixture applies SDK order/cursor/limit. */
class Query {
 constructor(readonly path:string,readonly filters:Predicate[]=[],readonly maximum=Infinity,readonly ordering='__name__',readonly descending=false,readonly after?:string){}
 doc(id:string):Reference{return {path:this.path+'/'+id};}
 where(field:string,operator:string,value:unknown){if(operator!=='==')throw new Error('Unsupported fixture operator');return new Query(this.path,[...this.filters,{field,value}],this.maximum,this.ordering,this.descending,this.after);}
 limit(maximum:number){return new Query(this.path,this.filters,maximum,this.ordering,this.descending,this.after);}
 orderBy(field:unknown,direction='asc'){return new Query(this.path,this.filters,this.maximum,typeof field==='string'?field:'__name__',direction==='desc',this.after);}
 startAfter(id:string){if(this.ordering!=='__name__')throw new Error('Fixture cursor requires document order');return new Query(this.path,this.filters,this.maximum,this.ordering,this.descending,id);}
}
class SdkFixture {
 readonly rows=new Map<string,Row>();
 put(collection:string,id:string,row:Row){this.rows.set(FIRESTORE_ROOT+'/'+collection+'/'+id,structuredClone(row));}
 collection(path:string){return new Query(path);}
 async runTransaction<T>(operation:(tx:unknown)=>Promise<T>):Promise<T>{
  return operation({
   get:async(ref:Reference|Query)=>{
    if(!(ref instanceof Query)){const row=this.rows.get(ref.path);return {exists:row!==undefined,data:()=>structuredClone(row)};}
    const docs=[...this.rows].filter(([path,row])=>path.startsWith(ref.path+'/')&&ref.filters.every(f=>row[f.field]===f.value)&&(ref.ordering==='__name__'||row[ref.ordering]!==undefined)).map(([path,row])=>({id:path.slice(ref.path.length+1),row}));
    const value=(doc:typeof docs[number])=>ref.ordering==='__name__'?doc.id:doc.row[ref.ordering];
    const compare=(a:unknown,b:unknown)=>a===b?0:String(a)<String(b)?-1:1;
    docs.sort((a,b)=>(compare(value(a),value(b))||compare(a.id,b.id))*(ref.descending?-1:1));
    const page=docs.filter(doc=>ref.after===undefined||(ref.descending?doc.id<ref.after:doc.id>ref.after)).slice(0,ref.maximum);
    return {size:page.length,docs:page.map(doc=>({id:doc.id,data:()=>structuredClone(doc.row)}))};
   },
   set:()=>{throw new Error('Unexpected write in read regression');},
   delete:()=>{throw new Error('Unexpected delete in read regression');},
  });
 }
 store(){return firestoreStore(this as unknown as Parameters<typeof firestoreStore>[0]);}
}

describe('native Firestore read limits — local SDK boundary, no provider access',()=>{
 let fixture:SdkFixture,store:DocumentStore,company:string,workspace:string,support:string,admin:string,owner:string,session:string;
 const client=(actor:string)=>firestoreClient('authenticated',actor,store);
 const populateCompanies=()=>{
  const companies=[];
  for(let i=0;i<1000;i++){
   const id=randomUUID(),row={id,workspace_id:workspace,name:'Unassigned clinic '+String(i).padStart(4,'0'),archived_at:null,created_at:new Date(Date.UTC(2026,0,1)+i*1000).toISOString()};
   fixture.put('companies',id,row);companies.push(row);
  }
  return companies.reverse();
 };
 const populateAudits=()=>{
  for(let i=0;i<1001;i++)fixture.put('audit_logs','audit-'+i,{id:'audit-'+i,company_id:company,workspace_id:workspace,actor_id:owner,action:'fixture.'+i,details:{fixture:true},created_at:new Date(Date.UTC(2026,0,1)+i*1000).toISOString()});
  fixture.put('audit_logs','foreign',{id:'foreign',company_id:randomUUID(),action:'foreign',created_at:'2099-01-01'});
 };
 beforeEach(()=>{
  fixture=new SdkFixture();store=fixture.store();[company,workspace,support,admin,owner,session]=Array.from({length:6},()=>randomUUID());
  fixture.put('companies',company,{id:company,workspace_id:workspace,name:'Assigned clinic',archived_at:null,created_at:'2026-10-01'});
  fixture.put('workspaces',workspace,{id:workspace,name:'Fixture workspace'});
  fixture.put('workspace_members',workspace+'_'+owner,{workspace_id:workspace,user_id:owner,role:'owner'});
  fixture.put('platform_staff',support,{user_id:support,role:'support',active:true});
  fixture.put('platform_staff',admin,{user_id:admin,role:'platform_admin',active:true});
  fixture.put('company_assignments',company+'_'+support,{company_id:company,staff_id:support});
  fixture.put('internal_access_sessions',session,{id:session,company_id:company,operator_id:support,ended_at:null,expires_at:'2099-01-01'});
 });
 it('retains the native guard against unbounded reads over 1000 documents',async()=>{
  populateCompanies();await expect(store.run(tx=>tx.list('companies'))).rejects.toThrow('Use a narrower Firestore query');
 });
 it('returns the assigned support portfolio when other tenants exceed the global query cap',async()=>{
  populateCompanies();const result=await client(support).rpc('internal_portfolio',{p_search:'Assigned',p_offset:0});
  expect(result.error).toBeNull();expect(result.data).toMatchObject({total:1,companies:[{id:company}]});
 });
 it('preserves administrator search, total and page ordering across native query pages',async()=>{
  const companies=populateCompanies(),result=await client(admin).rpc('internal_portfolio',{p_search:'Unassigned',p_offset:30});
  expect(result.error).toBeNull();expect(result.data).toMatchObject({total:1000,offset:30,pageSize:30});
  expect(result.data.companies.map((row:Row)=>row.id)).toEqual(companies.slice(30,60).map(row=>row.id));
 });
 it('returns the latest 30 internal audit actions after history exceeds 1000 documents',async()=>{
  populateAudits();const result=await client(support).rpc('internal_company_context',{p_session_id:session});
  expect(result.error).toBeNull();expect(result.data.history).toHaveLength(30);
  expect(result.data.history.map((row:Row)=>row.action)).toEqual(Array.from({length:30},(_,i)=>'fixture.'+(1000-i)));
  expect(result.data.history[0]).not.toHaveProperty('details');
 });
 it('returns the latest manager audit page without loading all company history',async()=>{
  populateAudits();const result=await client(owner).from('audit_logs').select('id,action,created_at').eq('company_id',company).order('created_at',{ascending:false}).limit(50);
  expect(result.error).toBeNull();expect(result.data).toHaveLength(50);
  expect(result.data?.map(row=>row.id)).toEqual(Array.from({length:50},(_,i)=>'audit-'+(1000-i)));
 });
 it('fills an ordered page after staged removal, reorder and insertion',async()=>{
  for(let i=0;i<5;i++)fixture.put('audit_logs','audit-'+i,{id:'audit-'+i,company_id:company,created_at:'2026-01-0'+(i+1)});
  let page:Row[]=[];
  await expect(store.run(async tx=>{
   tx.remove('audit_logs','audit-4');
   tx.put('audit_logs','audit-3',{id:'audit-3',company_id:company,created_at:'2025-01-01'});
   tx.put('audit_logs','new',{id:'new',company_id:company,created_at:'2026-02-01'});
   page=await tx.list('audit_logs',[{field:'company_id',value:company}],{limit:2,orderBy:'created_at',descending:true});
   throw new Error('Discard staged fixture changes');
  })).rejects.toThrow('Discard staged fixture changes');
  expect(page.map(row=>row.id)).toEqual(['new','audit-2']);
 });
 it('applies document cursors to staged documents while filling a page after deletion',async()=>{
  for(const id of ['a','b','c','d','e'])fixture.put('page_fixture',id,{id});
  let page:Row[]=[];
  await expect(store.run(async tx=>{
   tx.remove('page_fixture','c');tx.put('page_fixture','aa',{id:'aa'});tx.put('page_fixture','cc',{id:'cc'});
   page=await tx.list('page_fixture',[],{limit:2,afterId:'b'});
   throw new Error('Discard staged fixture changes');
  })).rejects.toThrow('Discard staged fixture changes');
  expect(page.map(row=>row.id)).toEqual(['cc','d']);
 });
 it.each([
  {limit:2,orderBy:'created_at',afterId:'b'},
  {limit:2,descending:true,afterId:'b'},
  {limit:2,afterId:'invalid/path'},
  {limit:1001},
 ])('rejects unsupported native page options %j',async options=>{
  await expect(store.run(tx=>tx.list('page_fixture',[],options))).rejects.toThrow(/Invalid (Firestore page|document path)/);
 });
});
