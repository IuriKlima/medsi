import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {collectRegionalTopics} from '../apps/api/src/onboarding/regional-topics';
import type {ProfileFacts} from '@askadia/contracts';

const fact=(value:string)=>({status:'provided' as const,value,source:'user' as const,updatedAt:'2026-10-01T00:00:00Z',actorId:null});
const facts:ProfileFacts={city:fact('Sumaré - SP'),uf:fact('SP'),services:fact('Cardiologia; Pediatria\nDermatologia, Cardiologia')};
beforeEach(()=>{vi.stubEnv('SERPAPI_API_KEY','');vi.stubEnv('X_BEARER_TOKEN','');});
afterEach(()=>vi.unstubAllEnvs());
describe('Regional topic adapters — fixture transport only',()=>{
 it('does not invent topics or make calls without configured sources',async()=>{
  let calls=0;const result=await collectRegionalTopics(facts,async()=>{calls++;throw Error('Network prohibited');});
  expect(calls).toBe(0);expect(result.specialties).toEqual(['Cardiologia','Pediatria','Dermatologia']);
  for(const source of Object.values(result.topics))expect(source).toMatchObject({state:'unconfigured',rows:[]});
 });
 it('retains state-scoped top interest separately from rising percentages and Breakout for every specialty',async()=>{
  vi.stubEnv('SERPAPI_API_KEY','fixture-secret');const calls:URL[]=[];const phases:string[]=[];
  const result=await collectRegionalTopics(facts,async(input,init)=>{const url=new URL(String(input));calls.push(url);expect(init?.redirect).toBe('error');expect(init?.signal).toBeDefined();return Response.json({search_parameters:{q:url.searchParams.get('q'),geo:'BR-SP',date:'today 3-m'},related_queries:{top:[{query:'consulta',extracted_value:70},{query:'bad',extracted_value:101}],rising:[{query:'consulta local',value:'+250%',extracted_value:250},{query:'checkup',value:'Breakout',extracted_value:8700}]}});},async(source,state)=>{phases.push(source+':'+state);});
  expect(calls.map(url=>url.searchParams.get('q'))).toEqual(['Cardiologia Sumaré','Pediatria Sumaré','Dermatologia Sumaré']);
  expect(calls.every(url=>url.hostname==='serpapi.com'&&url.searchParams.get('geo')==='BR-SP'&&url.searchParams.get('data_type')==='RELATED_QUERIES')).toBe(true);
  expect(result.trends.rows.map(row=>row.interest)).toEqual([70,70,70]);
  expect(result.topics.google.rows).toHaveLength(6);
  expect(result.topics.google.rows[0]).toMatchObject({metricValue:250,metricLabel:'crescimento (%)'});
  expect(result.topics.google.rows[1]).toMatchObject({metricValue:null,metricLabel:'Breakout'});
  expect(phases).toEqual(expect.arrayContaining(['google:running','google:completed']));
  expect(JSON.stringify(result)).not.toContain('fixture-secret');
 });
 it('rejects wrong provider scope and fails independently by specialty',async()=>{
  vi.stubEnv('SERPAPI_API_KEY','fixture');
  const result=await collectRegionalTopics(facts,async input=>{const q=new URL(String(input)).searchParams.get('q');if(q?.startsWith('Pediatria'))throw Error('secret failure');return Response.json({search_parameters:{q,geo:'BR-RJ'},related_queries:{rising:[{query:'untrusted',extracted_value:400}]}});});
  expect(result.topics.google).toMatchObject({state:'unavailable',rows:[]});expect(JSON.stringify(result)).not.toContain('secret failure');
 });
 it('keeps only relevant recent X posts, deduplicates IDs and sums only supplied engagement counts',async()=>{
  vi.stubEnv('X_BEARER_TOKEN','fixture-secret');const calls:URL[]=[];
  const now=new Date().toISOString();const result=await collectRegionalTopics(facts,async(input,init)=>{const url=new URL(String(input));calls.push(url);expect(new Headers(init?.headers).get('authorization')).toBe('Bearer fixture-secret');return Response.json({data:[
   {id:'123',text:'Cardiologia em Sumaré: prevenção',created_at:now,lang:'pt',public_metrics:{like_count:5,reply_count:2,retweet_count:1,quote_count:0}},
   {id:'123',text:'Cardiologia em Sumaré: prevenção',created_at:now},
   {id:'124',text:'Cardiologia em outro município',created_at:now},
   {id:'125',text:'Futebol em Sumaré',created_at:now},
   {id:'126',text:'Cardiologia em Sumaré',created_at:'2020-01-01T00:00:00Z'},
   {id:'127',text:'Cardiologia em Sumaré',created_at:now,lang:'en'},
   {id:'bad/path',text:'Cardiologia em Sumaré',created_at:now},
   {id:'128',text:'Pediatria em Sumaré: vacinação',created_at:now},
   {id:'129',text:'Cardiologia em Sumaré',created_at:new Date(Date.now()+60000).toISOString()},
   {id:'130',text:'Cardiologia em Sumaré',created_at:now,referenced_tweets:[{id:'123',type:'retweeted'}]},
   {id:'131',text:'Cardiologia em Sumaré',created_at:now,public_metrics:{like_count:-1}},
   {id:'132',text:'Cardiologia em Sumarézinha',created_at:now},
  ]});});
  expect(calls).toHaveLength(3);expect(calls.every(url=>url.hostname==='api.x.com'&&url.pathname==='/2/tweets/search/recent'&&url.searchParams.get('query')?.includes('"Sumaré"')&&Number(url.searchParams.get('max_results'))<=100&&url.searchParams.has('start_time'))).toBe(true);
  expect(result.topics.x.rows).toHaveLength(2);
  expect(result.topics.x.rows[0]).toMatchObject({metricValue:8,metricLabel:'interações na amostra',sourceUrl:'https://x.com/i/web/status/123'});
  expect(result.topics.x.rows[1]?.metricValue).toBeNull();expect(JSON.stringify(result)).not.toContain('fixture-secret');
 });
 it('rejects unconfirmed or oversized profile scope instead of searching a fallback keyword',async()=>{
  vi.stubEnv('X_BEARER_TOKEN','fixture');let calls=0;const transport:typeof fetch=async()=>{calls++;throw Error('No network');};
  await expect(collectRegionalTopics({...facts,city:{...fact('Sumaré'),status:'unknown'}},transport)).rejects.toThrow();
  await expect(collectRegionalTopics({...facts,services:fact(Array.from({length:21},(_,i)=>'Especialidade '+i).join(';'))},transport)).rejects.toThrow();
  expect(calls).toBe(0);
 });
 it('neutralizes user query operators and does not widen to a general search',async()=>{
  vi.stubEnv('X_BEARER_TOKEN','fixture');let query='';
  await collectRegionalTopics({...facts,services:fact('Cardiologia" OR from:attacker')},async input=>{query=new URL(String(input)).searchParams.get('query')??'';return Response.json({meta:{result_count:0}});});
  expect(query).not.toContain('from:');expect(query).not.toContain(' OR ');expect(query).toContain('"Sumaré"');expect(query).toContain('lang:pt -is:retweet');
 });
 it('bounds provider payloads and treats invalid responses as unavailable',async()=>{
  vi.stubEnv('X_BEARER_TOKEN','fixture');
  const result=await collectRegionalTopics(facts,async()=>new Response('x'.repeat(1_000_001)));
  expect(result.topics.x).toMatchObject({state:'unavailable',rows:[]});
 });
 it('covers all 20 specialties with bounded concurrency and caps the snapshot without starving later specialties',async()=>{
  vi.stubEnv('SERPAPI_API_KEY','fixture');let active=0,peak=0,calls=0;
  const result=await collectRegionalTopics({...facts,services:fact(Array.from({length:20},(_,index)=>'Especialidade '+index).join(';'))},async()=>{
   active++;peak=Math.max(peak,active);calls++;await new Promise(resolve=>setTimeout(resolve,1));active--;
   return Response.json({related_queries:{top:Array.from({length:10},(_,index)=>({query:'Consulta '+index,extracted_value:90})),rising:Array.from({length:10},(_,index)=>({query:'Tema '+index,extracted_value:250}))}});
  });
  expect(calls).toBe(20);expect(peak).toBeLessThanOrEqual(3);expect(result.topics.google.rows).toHaveLength(100);expect(result.trends.rows).toHaveLength(100);
  expect(new Set(result.topics.google.rows.map(row=>row.specialty)).size).toBe(20);
 });
});
