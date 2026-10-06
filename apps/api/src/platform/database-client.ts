import type {SupabaseClient} from '@supabase/supabase-js';
import type {DbRole,SqlExecutor,SqlSession} from './postgres';
import {sqlExecutor} from './postgres';
import {firebaseStorage} from './storage';
export type DatabaseError={code:string;message:string;details:string;hint:string};
export type DatabaseResult<T=unknown>={data:T|null;error:DatabaseError|null;count?:number|null};
export const databaseError=(e:unknown):DatabaseError=>({code:typeof e==='object'&&e&&'code'in e?String(e.code):'DB_UNAVAILABLE',message:e instanceof Error?e.message:'Database unavailable',details:'',hint:''});
export function identifier(value:string){if(!/^[a-z_][a-z0-9_]*$/.test(value))throw new Error('Invalid SQL identifier');return '"'+value+'"';}
type Filter={column:string;op:string;value:unknown};
type Context={role:DbRole;actorId:string|null;executor:SqlExecutor};
export class DatabaseQuery implements PromiseLike<DatabaseResult>{
 private fields='*';private filters:Filter[]=[];private orders:{column:string;ascending:boolean;nullsFirst?:boolean}[]=[];private max:number|undefined;private offset=0;private cardinality:'many'|'one'|'optional'='many';private count=false;private head=false;
 constructor(private context:Context,private table:string|null,private procedure?:{name:string;args:Record<string,unknown>}){if(table)identifier(table);if(procedure)identifier(procedure.name);}
 select(fields='*',options?:{count?:string;head?:boolean}){if(fields!=='*')fields.split(',').forEach(f=>identifier(f.trim()));this.fields=fields;this.count=options?.count==='exact';this.head=options?.head===true;return this;}
 eq(column:string,value:unknown){return this.filter(column,'=',value);}
 neq(column:string,value:unknown){return this.filter(column,'<>',value);}
 lt(column:string,value:unknown){return this.filter(column,'<',value);}
 lte(column:string,value:unknown){return this.filter(column,'<=',value);}
 gt(column:string,value:unknown){return this.filter(column,'>',value);}
 gte(column:string,value:unknown){return this.filter(column,'>=',value);}
 in(column:string,value:unknown[]){if(!Array.isArray(value)||value.length>10000)throw new Error('Invalid filter');return this.filter(column,'in',value);}
 is(column:string,value:null|boolean){if(value!==null&&typeof value!=='boolean')throw new Error('Invalid null filter');return this.filter(column,'is',value);}
 private filter(column:string,op:string,value:unknown){identifier(column);this.filters.push({column,op,value});return this;}
 order(column:string,options?:{ascending?:boolean;nullsFirst?:boolean}){identifier(column);this.orders.push({column,ascending:options?.ascending!==false,nullsFirst:options?.nullsFirst});return this;}
 limit(n:number){if(!Number.isInteger(n)||n<0||n>100000)throw new Error('Invalid query limit');this.max=n;return this;}
 range(from:number,to:number){if(!Number.isInteger(from)||from<0||to<from)throw new Error('Invalid query range');this.offset=from;return this.limit(to-from+1);}
 single(){this.cardinality='one';return this;}
 maybeSingle(){this.cardinality='optional';return this;}
 private async rpc(db:SqlSession){
  const rpc=this.procedure!,keys=Object.keys(rpc.args).filter(k=>rpc.args[k]!==undefined);keys.forEach(identifier);
  type Definition={names:string[]|null;types:string[];defaults:number;set:boolean};
  const candidates=await db.query<{definition:Definition}>("select jsonb_build_object('names',p.proargnames,'types',array(select format_type(t,null) from unnest(p.proargtypes) t),'defaults',p.pronargdefaults,'set',p.proretset) as definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=$1 and p.prokind='f'",[rpc.name]);
  const matches=candidates.rows.map(r=>r.definition).filter(d=>{const names=(d.names??[]).slice(0,d.types.length);return keys.every(k=>names.includes(k))&&names.slice(0,Math.max(0,names.length-d.defaults)).every(n=>Object.hasOwn(rpc.args,n));});
  if(matches.length!==1)throw Object.assign(new Error('Database procedure unavailable or ambiguous'),{code:'42883'});
  const definition=matches[0]!,values:unknown[]=[];
  const params=keys.map(k=>{const type=definition.types[definition.names!.indexOf(k)]!;if(!/^[a-z ]+(?:\[\])?$/.test(type))throw new Error('Unsupported database argument type');const value=rpc.args[k];values.push(value!==null&&value!==undefined&&['json','jsonb'].includes(type)?JSON.stringify(value):value??null);return identifier(k)+'=>$'+values.length+'::'+type;});
  const result=await db.query<{data:unknown}>('select to_jsonb(public.'+identifier(rpc.name)+'('+params.join(',')+')) as data',values);
  return {values:result.rows.map(r=>r.data),scalar:!definition.set};
 }
 private async execute():Promise<DatabaseResult>{
  try{return await this.context.executor.run(this.context.role,this.context.actorId,async db=>{
   let rows:unknown[],scalar=false,total:number|undefined;
   if(this.procedure){const r=await this.rpc(db);rows=r.values;scalar=r.scalar;}
   else{
    const values:unknown[]=[];const bind=(value:unknown)=>{values.push(value);return '$'+values.length;};
    const conditions=this.filters.map(f=>{const col=identifier(f.column);if(f.op==='is')return col+' is '+(f.value===null?'null':f.value?'true':'false');if(f.op==='in'){const list=f.value as unknown[];return list.length?col+' in ('+list.map(bind).join(',')+')':'false';}return col+' '+f.op+' '+bind(f.value);});
    const where=conditions.length?' where '+conditions.join(' and '):'';
    const relation='public.'+identifier(this.table!);
    if(this.count){const count=await db.query<{count:string}>('select count(*)::text as count from '+relation+where,values);total=Number(count.rows[0]!.count);}
    const columns=this.fields==='*'?'*':this.fields.split(',').map(f=>identifier(f.trim())).join(',');
    let sql='select '+columns+' from '+relation+where;
    if(this.orders.length)sql+=' order by '+this.orders.map(o=>identifier(o.column)+(o.ascending?' asc':' desc')+(o.nullsFirst===undefined?'':o.nullsFirst?' nulls first':' nulls last')).join(',');
    if(this.max!==undefined)sql+=' limit '+this.max;if(this.offset)sql+=' offset '+this.offset;
    const result=this.head?{rows:[]}:await db.query<{data:unknown}>('select to_jsonb(medsi_row) as data from ('+sql+') medsi_row',values);rows=result.rows.map(r=>r.data);
   }
   if(this.cardinality!=='many'&&!scalar){if(rows.length>1||this.cardinality==='one'&&rows.length!==1)throw Object.assign(new Error('Expected one database row'),{code:'PGRST116'});return {data:rows[0]??null,error:null,count:total};}
   return {data:this.head?null:scalar?rows[0]??null:rows,error:null,count:total};
  });}catch(e){return {data:null,error:databaseError(e)};}
 }
 then<TResult1=DatabaseResult,TResult2=never>(onfulfilled?:((value:DatabaseResult)=>TResult1|PromiseLike<TResult1>)|null,onrejected?:((reason:unknown)=>TResult2|PromiseLike<TResult2>)|null):PromiseLike<TResult1|TResult2>{return this.execute().then(onfulfilled,onrejected);}
}
/** Compatibility is deliberately limited to the repository's audited query surface.
 * All operations execute as the same PostgreSQL roles/RLS used by the existing API.
 * The client is server-only and never accepts raw SQL or role names from a request.
 */
export function firebaseSqlClient(role:DbRole,actorId:string|null,executor:SqlExecutor=sqlExecutor):SupabaseClient{
 const context={role,actorId,executor};
 return {from:(table:string)=>new DatabaseQuery(context,table),rpc:(name:string,args:Record<string,unknown>={})=>new DatabaseQuery(context,null,{name,args}),storage:{from:(bucket:string)=>firebaseStorage(context,bucket)}} as unknown as SupabaseClient;
}
