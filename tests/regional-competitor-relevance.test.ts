import {describe,it,expect} from 'vitest';
import {assessCompetitor} from '../packages/contracts/src/competitor-relevance';
import {collectRegionalMap} from '../apps/api/src/onboarding/regional-map';
const center={lat:-22.82,lng:-47.27};
const facts={name:{status:'provided' as const,value:'Clínica da Conta A'},services:{status:'provided' as const,value:'Cardiologia; Eletrocardiograma'},city:{status:'provided' as const,value:'Sumaré - SP'}};
const node=(id:number,name:string,tags:Record<string,string>={})=>({type:'node',id,lat:center.lat+id/10000,lon:center.lng,tags:{name,healthcare:'clinic',...tags}});
const rows=[node(1,'Clínica Aurora',{'healthcare:speciality':'cardiology'}),node(2,'Clínica Infantil',{'healthcare:speciality':'paediatrics'}),node(3,'Clínica Genérica'),node(4,'Clínica Multiespecialidade',{'healthcare:speciality':'dermatology;cardiology'}),node(5,'Clínica Dental',{healthcare:'dentist'}),node(6,'Centro Multiespecialidade'),node(7,'Clínica Eletrocardiograma')];
const collect=(elements:unknown[],services=facts.services.value)=>collectRegionalMap(undefined,{center,radiusM:3000},async()=>Response.json({elements}),{facts:{...facts,services:{...facts.services,value:services}},persistentEvidence:true});
describe('competitor niche reproduction — isolated provider evidence',()=>{
 it('keeps only evidence-compatible competitors in the main list and separates generic or unproven candidates',async()=>{const map=await collect(rows);expect(map.competitors.map(c=>c.id)).toEqual(['node/1','node/4','node/7']);expect(map.reviewCandidates?.map(c=>c.id)).toEqual(['node/3','node/6']);expect(map.selectedIds).toEqual([]);expect(map.competitors[0].relevance?.evidence[0].value).toBe('cardiology');});
 it('changes the main list when the confirmed specialty changes',async()=>{const map=await collect(rows,'Pediatria');expect(map.competitors.map(c=>c.id)).toEqual(['node/2']);expect(map.selectedIds).toEqual([]);});
 it('keeps a truly empty result empty instead of inventing or padding competitors',async()=>{const map=await collect([]);expect(map.competitors).toEqual([]);expect(map.reviewCandidates??[]).toEqual([]);expect(map.state).toBe('available');});
});

describe('conservative evidence classification',()=>{
 const c={id:'node/1',name:'Clínica Genérica',address:'',...center,distanceM:0,category:'clinic',specialty:'Cardiologia',sourceUrl:'https://www.openstreetmap.org/node/1'};
 it('never treats the search query copied into legacy specialty as provider evidence',()=>{expect(assessCompetitor(c,facts).status).toBe('ambiguous');});
 it('does not accept unconfirmed assistant services or a negated specialty',()=>{expect(assessCompetitor({...c,name:'Cardiologia'},{...facts,services:{...facts.services,source:'assistant_suggestion'}}).status).toBe('ambiguous');expect(assessCompetitor({...c,name:'Clínica sem cardiologia'},facts).status).toBe('ambiguous');});
 it('does not claim two specialties when evidence supports only one part of a combined answer',()=>{expect(assessCompetitor({...c,name:'Cardiologia Aurora'},{...facts,services:{...facts.services,value:'Cardiologia e Pediatria'}}).matchedServices).toEqual(['cardiologia']);});
 it('accepts an uncommon service only when it is explicitly named in the evidence',()=>{const profile={...facts,services:{...facts.services,value:'Teste ergométrico'}};expect(assessCompetitor(c,profile).status).toBe('ambiguous');expect(assessCompetitor({...c,name:'Teste ergométrico'},profile).status).toBe('compatible');});
 it('does not classify generic Google results from a specialty query as matches',async()=>{const map=await collectRegionalMap(undefined,{center,radiusM:3000},async()=>Response.json({places:[{id:'fixture-place',displayName:{text:'Clínica Genérica'},location:{latitude:center.lat,longitude:center.lng},types:['medical_clinic']}]}),{facts,placesKey:'fixture-key'});expect(map.competitors).toEqual([]);expect(map.reviewCandidates).toHaveLength(1);expect(map.reviewCandidates?.[0].specialty).toBeUndefined();});
});
