import {afterEach,describe,expect,it,vi} from 'vitest';
import {collectRegionalAudience} from '../apps/api/src/onboarding/regional-providers';
import type {ProfileFacts} from '@askadia/contracts';

const facts:ProfileFacts={city:{status:'provided',value:'Sumaré - SP'},uf:{status:'provided',value:'SP'},services:{status:'provided',value:'Cardiologia; Pediatria'}};
const noFacebook=async()=>{throw Error('Not connected');};
afterEach(()=>vi.unstubAllEnvs());
describe('Regional research after plan confirmation — isolated provider fixtures',()=>{
 it('keeps location and every confirmed specialty in each Google search and preserves growth units',async()=>{
  vi.stubEnv('SERPAPI_API_KEY','fixture');vi.stubEnv('X_BEARER_TOKEN','');
  const queries:string[]=[];
  const transport:typeof fetch=async input=>{const url=new URL(String(input));if(url.hostname!=='serpapi.com')throw Error('No fixture');queries.push(url.searchParams.get('q')!);expect(url.searchParams.get('geo')).toBe('BR-SP');return Response.json({related_queries:{top:[{query:'consulta',extracted_value:70}],rising:[{query:'consulta local',value:'+250%',extracted_value:250}]}});};
  const result=await collectRegionalAudience(facts,noFacebook,transport);
  expect(queries).toEqual(expect.arrayContaining(['Cardiologia Sumaré','Pediatria Sumaré']));
  expect(result.topics?.google.rows).toHaveLength(2);
  expect(result.topics?.google.rows[0]).toMatchObject({metricValue:250,metricLabel:'crescimento (%)'});
  expect(result.topics?.google.message).toContain('estadual');
 });
 it('reports unavailable sources honestly and reports each actual collection phase',async()=>{
  vi.stubEnv('SERPAPI_API_KEY','');vi.stubEnv('X_BEARER_TOKEN','');
  const steps:{source:string;state:string}[]=[];
  const result=await collectRegionalAudience(facts,noFacebook,async()=>{throw Error('offline');},undefined,async(source,state)=>{steps.push({source,state});});
  expect(result.topics?.facebook).toMatchObject({state:'unconfigured',rows:[]});
  expect(result.topics?.x).toMatchObject({state:'unconfigured',rows:[]});
  expect(result.topics?.google).toMatchObject({state:'unconfigured',rows:[]});
  expect(steps).toContainEqual({source:'ibge',state:'running'});
  expect(steps).toContainEqual({source:'ibge',state:'unavailable'});
  expect(result.specialties).toEqual(['Cardiologia','Pediatria']);
 });
 it('keeps disconnected Meta and empty topic feeds without fabricated metrics',async()=>{
  vi.stubEnv('SERPAPI_API_KEY','fixture');vi.stubEnv('X_BEARER_TOKEN','fixture');
  const transport:typeof fetch=async input=>new URL(String(input)).hostname==='api.x.com'?Response.json({meta:{result_count:0}}):Response.json({related_queries:{top:[],rising:[]}});
  const result=await collectRegionalAudience(facts,async()=>null,transport);
  expect(result.facebook).toMatchObject({state:'unconfigured',estimates:[],cityKey:null});
  expect(result.topics?.google).toMatchObject({state:'available',rows:[]});
  expect(result.topics?.x).toMatchObject({state:'pending',rows:[]});
  expect(result.trends.rows).toEqual([]);
 });
 it('records provider timeouts as missing evidence without losing the other sources',async()=>{
  vi.stubEnv('SERPAPI_API_KEY','fixture');vi.stubEnv('X_BEARER_TOKEN','fixture');
  const result=await collectRegionalAudience(facts,async()=>null,async()=>{throw new DOMException('Timed out','TimeoutError');});
  expect(result.ibge).toMatchObject({state:'unavailable',data:null});
  expect(result.topics?.google).toMatchObject({state:'unavailable',rows:[]});
  expect(result.topics?.x).toMatchObject({state:'unavailable',rows:[]});
  expect(result.facebook?.estimates).toEqual([]);
 });
 it('discards Meta estimates when the company account changes during collection',async()=>{
  vi.stubEnv('SERPAPI_API_KEY','');vi.stubEnv('X_BEARER_TOKEN','');
  let reads=0;
  const graph=async<T>(path:string):Promise<T>=>(path==='search'?{data:[{key:'123',name:'Sumaré',country_code:'BR',region:'São Paulo'}]}:{data:{estimate_ready:true,users_lower_bound:10,users_upper_bound:20}}) as T;
  const result=await collectRegionalAudience(facts,async()=>({account:++reads===1?'act_123':'act_456',token:'fixture'}),async()=>{throw Error('IBGE offline');},graph);
  expect(result.facebook).toMatchObject({state:'unavailable',estimates:[],cityKey:null});
  expect(JSON.stringify(result)).not.toContain('fixture');
 });
 it('collects bounded X evidence matching city and specialty without claiming resident counts or growth',async()=>{
  vi.stubEnv('SERPAPI_API_KEY','');vi.stubEnv('X_BEARER_TOKEN','private-fixture-token');
  const calls:URL[]=[];
  const transport:typeof fetch=async(input,init)=>{const url=new URL(String(input));if(url.hostname!=='api.x.com')throw Error('No fixture');calls.push(url);expect(new Headers(init?.headers).get('authorization')).toBe('Bearer private-fixture-token');return Response.json({data:[{id:'123456',text:'Cardiologia em Sumaré: prevenção',created_at:new Date().toISOString(),public_metrics:{like_count:5,reply_count:2,retweet_count:1,quote_count:0}}]});};
  const result=await collectRegionalAudience(facts,noFacebook,transport);
  expect(calls).toHaveLength(2);expect(calls.every(url=>url.searchParams.get('query')?.includes('"Sumaré"'))).toBe(true);
  expect(result.topics?.x.rows[0]).toMatchObject({metricLabel:'interações na amostra',metricValue:8,sourceUrl:'https://x.com/i/web/status/123456'});
  expect(result.topics?.x.message).toContain('menções');expect(JSON.stringify(result)).not.toContain('private-fixture-token');
 });
});
