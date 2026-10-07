import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
vi.mock('../apps/api/src/platform/firebase-auth',()=>({verifyFirebaseActor:vi.fn()}));
import {RegionalResearchController,regionalResearchReadiness,regionalResearchConfigured} from '../apps/api/src/onboarding/regional-research';
import type {AuthRequest} from '../apps/api/src/identity/auth';
const company='10000000-0000-4000-8000-000000000001',requestId='20000000-0000-4000-8000-000000000001';
let version=2,allowed=true,quota=true;
const rpc=vi.fn(async(name:string)=>({error:null,data:name==='company_capabilities'?{actions:allowed?['marketing.write']:[]}:name==='company_purchase_state'?{aiAllowed:true}:name==='company_onboarding_read'?{state:{revision:version,confirmed_revision:version},confirmedProfile:{version,facts:{address:{status:'provided',value:'Rua fictícia, 123',source:'user'},city:{status:'provided',value:'Sumaré - SP'}}}}:name==='reserve_onboarding_provider'?quota:null}));
const req={actor:{id:'fixture-owner',client:{rpc}}} as unknown as AuthRequest;
const call=()=>new RegionalResearchController().mapPreview(req,company,{requestId,profileVersion:2});
beforeEach(()=>{version=2;allowed=true;quota=true;rpc.mockClear();vi.stubEnv('GOOGLE_PLACES_SERVER_KEY','fixture-key');});
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
describe('regional address preview authorization and configuration',()=>{
 it('reports missing configuration without reserving quota or calling a provider',async()=>{vi.stubEnv('GOOGLE_PLACES_SERVER_KEY','');const fetch=vi.fn();vi.stubGlobal('fetch',fetch);expect(await call()).toMatchObject({status:'unconfigured',map:null});expect(fetch).not.toHaveBeenCalled();expect(rpc.mock.calls.some(([n])=>n==='reserve_onboarding_provider')).toBe(false);});
 it('denies unauthorized company access before reading its address',async()=>{allowed=false;await expect(call()).rejects.toThrow();expect(rpc.mock.calls.map(([n])=>n)).toEqual(['company_capabilities']);});
 it('does not use an outdated profile or exhausted provider allowance',async()=>{version=3;await expect(call()).rejects.toThrow('endereço mudou');version=2;quota=false;const fetch=vi.fn();vi.stubGlobal('fetch',fetch);expect(await call()).toMatchObject({status:'unavailable',map:null});expect(fetch).not.toHaveBeenCalled();});
 it('returns transient pins only after rechecking the profile and permission',async()=>{vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL)=>String(input).includes('googleapis')?Response.json({places:[{location:{latitude:-22.82,longitude:-47.27}}]}):Response.json({elements:[]})));expect(await call()).toMatchObject({status:'available',map:{center:{lat:-22.82,lng:-47.27},locationConfirmed:false}});expect(rpc.mock.calls.filter(([n])=>n==='company_onboarding_read')).toHaveLength(2);expect(rpc.mock.calls.map(([n])=>n)).not.toContain('request_regional_research');});
 it('discards a preview when the profile changes while providers are running',async()=>{vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL)=>{if(String(input).includes('googleapis'))return Response.json({places:[{location:{latitude:-22.82,longitude:-47.27}}]});version=3;return Response.json({elements:[]});}));await expect(call()).rejects.toThrow('endereço mudou');});
});

describe('regional runtime readiness without secrets',()=>{
 it('distinguishes the enabled flag from missing database and source credentials',()=>{vi.stubEnv('DATABASE_PROVIDER','firestore');vi.stubEnv('FIREBASE_PROJECT_ID','');vi.stubEnv('REGIONAL_RESEARCH_ENABLED','true');vi.stubEnv('SERPAPI_API_KEY','');vi.stubEnv('GOOGLE_PLACES_SERVER_KEY','');expect(regionalResearchReadiness()).toEqual({enabled:true,databaseConfigured:false,trendsConfigured:false,placesConfigured:false});expect(regionalResearchConfigured()).toBe(false);});
 it('reports configured sources without exposing credentials or claiming homologation',()=>{vi.stubEnv('DATABASE_PROVIDER','firestore');vi.stubEnv('FIREBASE_PROJECT_ID','fixture');vi.stubEnv('REGIONAL_RESEARCH_ENABLED','true');vi.stubEnv('SERPAPI_API_KEY','private-fixture');expect(regionalResearchReadiness()).toEqual({enabled:true,databaseConfigured:true,trendsConfigured:true,placesConfigured:true});expect(regionalResearchConfigured()).toBe(true);expect(JSON.stringify(regionalResearchReadiness())).not.toContain('private-fixture');});
});
