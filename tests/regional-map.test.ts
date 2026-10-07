import {describe,it,expect} from 'vitest';
import {collectRegionalMap,previewRegionalMap} from '../apps/api/src/onboarding/regional-map';
describe('regional map — isolated provider fixtures',()=>{
 it('shows municipal viewport without inventing a clinic coordinate or competitors',async()=>{
  const fetcher:typeof fetch=async()=>new Response(JSON.stringify({features:[{geometry:{type:'Polygon',coordinates:[[[-47,-23],[-46,-23],[-46,-22],[-47,-23]]]}}]}));
  const map=await collectRegionalMap('3552403',undefined,fetcher);
  expect(map).toMatchObject({center:null,viewport:{lat:-22.5,lng:-46.5},locationConfirmed:false,competitors:[],state:'pending'});
 });
 it('computes a municipal viewport for a bounded large geometry without recursive or spread overflow',async()=>{
  const coordinates=[...Array.from({length:140000},()=>[-47,-23]),[-46,-22]];
  const map=await collectRegionalMap('3552403',undefined,async()=>new Response(JSON.stringify({features:[{geometry:{coordinates:[coordinates]}}]})));
  expect(map).toMatchObject({center:null,viewport:{lat:-22.5,lng:-46.5},competitors:[],locationConfirmed:false});
 });
 it('filters named health establishments to the confirmed radius and keeps selection empty',async()=>{
  const center={lat:-22.82,lng:-47.27};let request='';
  const fetcher:typeof fetch=async(_,init)=>{request=String(init?.body);return new Response(JSON.stringify({elements:[{type:'node',id:1,lat:-22.821,lon:-47.271,tags:{name:'Consultório fixture',healthcare:'doctor'}},{type:'node',id:2,lat:-23.5,lon:-47.2,tags:{name:'Fora do raio',healthcare:'doctor'}},{type:'node',id:3,lat:-22.821,lon:-47.271,tags:{name:'Loja fixture',shop:'books'}}]}));};
  const map=await collectRegionalMap(undefined,{center,radiusM:1000},fetcher);
  expect(request).toContain('around');expect(map.reviewCandidates?.map(v=>v.id)).toEqual(['node/1']);expect(map.selectedIds).toEqual([]);expect(map.selectionConfirmed).toBe(false);
 });
 it('does not treat Overpass timeout remarks in HTTP 200 as an empty successful search',async()=>{
  const map=await collectRegionalMap(undefined,{center:{lat:-22,lng:-47},radiusM:3000},async()=>new Response(JSON.stringify({remark:'runtime error: Query timed out',elements:[]})));
  expect(map.state).toBe('unavailable');expect(map.competitors).toEqual([]);
 });
 it('keeps batch Google details out of persisted regional snapshots while preserving transient lookup support',async()=>{
  const calls:string[]=[];const transport:typeof fetch=async(input)=>{calls.push(String(input));return new Response(JSON.stringify({elements:[]}));};
  const result=await collectRegionalMap(undefined,{center:{lat:-22,lng:-47},radiusM:3000},transport,{placesKey:'fixture-key',persistentEvidence:true});
  expect(result).toMatchObject({provider:'osm',competitors:[],state:'available'});expect(calls.every(url=>!url.includes('google'))).toBe(true);
 });
 it('returns unavailable rather than claiming no competitors when the provider fails',async()=>{
  const map=await collectRegionalMap(undefined,{center:{lat:-22,lng:-47},radiusM:3000},async()=>{throw Error('fixture outage');});
  expect(map.state).toBe('unavailable');expect(map.competitors).toEqual([]);expect(map.locationConfirmed).toBe(true);
 });
 it('bounds and deduplicates the nearest candidates while preserving canonical public sources',async()=>{
  const center={lat:-22,lng:-47},places=Array.from({length:65},(_,i)=>({type:'node',id:i+1,lat:-22-i/10000,lon:-47,tags:{name:'Fixture '+i,healthcare:'clinic'}}));
  const map=await collectRegionalMap(undefined,{center,radiusM:1000},async()=>new Response(JSON.stringify({elements:[...places.reverse(),places[0]]})));
  expect(map.reviewCandidates).toHaveLength(50);expect(new Set(map.reviewCandidates?.map(c=>c.id)).size).toBe(50);expect(map.reviewCandidates?.[0].id).toBe('node/1');
  expect(map.reviewCandidates?.every(c=>c.sourceUrl==='https://www.openstreetmap.org/'+c.id&&c.distanceM<=1000)).toBe(true);
 });
 it('ignores invalid provider coordinates instead of producing evidence that cannot be persisted',async()=>{
  const center={lat:-22,lng:-47};
  const map=await collectRegionalMap(undefined,{center,radiusM:1000},async()=>new Response(JSON.stringify({elements:[{type:'node',id:1,lat:-22,lon:313,tags:{name:'Wrapped coordinate',healthcare:'doctor'}}]})));
  expect(map).toMatchObject({state:'available',competitors:[]});
 });
});

const confirmedFacts={address:{status:'provided' as const,value:'Rua de Teste, 123',source:'user' as const},city:{status:'provided' as const,value:'Sumaré - SP'},uf:{status:'provided' as const,value:'SP'}};
describe('automatic address preview — transient coordinates, persistent OSM candidates',()=>{
 it('locates the confirmed address and searches OSM without fetching Google competitor details',async()=>{
  const calls:string[]=[];const transport:typeof fetch=async(input)=>{calls.push(String(input));return String(input).includes('googleapis')?Response.json({places:[{id:'fixture-place',location:{latitude:-22.82,longitude:-47.27}}]}):Response.json({elements:[{type:'node',id:1,lat:-22.821,lon:-47.271,tags:{name:'Consultório fictício',healthcare:'doctor'}}]});};
  const map=await previewRegionalMap(confirmedFacts,'fixture-key',transport);
  expect(map).toMatchObject({center:{lat:-22.82,lng:-47.27},centerSource:'address',locationConfirmed:false,provider:'osm',state:'available'});expect(map?.reviewCandidates).toHaveLength(1);expect(calls).toHaveLength(2);expect(calls[1]).toContain('overpass');
 });
 it('never guesses a point from only the city, an assistant suggestion, an empty response or a provider failure',async()=>{
  const never:typeof fetch=async()=>{throw Error('No provider result');};
  expect(await previewRegionalMap({city:confirmedFacts.city},'fixture',never)).toBeNull();
  expect(await previewRegionalMap({...confirmedFacts,address:{...confirmedFacts.address,source:'assistant_suggestion'}},'fixture',never)).toBeNull();
  expect(await previewRegionalMap(confirmedFacts,'fixture',async()=>Response.json({places:[]}))).toBeNull();
  expect(await previewRegionalMap(confirmedFacts,'fixture',never)).toBeNull();
 });
});
