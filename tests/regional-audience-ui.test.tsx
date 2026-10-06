import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {afterAll,describe,expect,it,vi} from 'vitest';
import type {RegionalReview} from '@askadia/contracts';
import {RegionalAudienceReview} from '../apps/web/components/regional-audience';
const require=createRequire(resolve('apps/web/package.json'));
const React=require('react');const {renderToStaticMarkup}=require('react-dom/server');vi.stubGlobal('React',React);afterAll(()=>vi.unstubAllGlobals());
const source={state:'unconfigured' as const,query:'Pediatria Sumaré',region:'Estado SP',period:'Últimos 3 meses',rows:[],sourceUrl:'https://trends.google.com',message:'Fonte não configurada nesta fixture'};
const review:RegionalReview={id:'fixture',revision:1,status:'ready',error:null,data:{city:'Sumaré',uf:'SP',collectedAt:'2026-10-06T12:00:00Z',ibge:{state:'unavailable',data:null,sex:[],ages:[],sourceUrl:'https://www.ibge.gov.br',message:'Fixture indisponível'},facebook:{state:'unconfigured',estimates:[],cityKey:null,sourceUrl:'https://developers.facebook.com',message:'Fixture não conectada'},trends:{...source,geo:'BR-SP'},topics:{google:source,facebook:source,x:source},map:{state:'available',center:{lat:-22.82,lng:-47.27},viewport:null,radiusM:3000,locationConfirmed:true,selectionConfirmed:false,selectedIds:[],competitors:[{id:'node/1',name:'Consultório fixture',address:'Endereço de teste',lat:-22.821,lng:-47.271,distanceM:150,category:'doctor',sourceUrl:'https://www.openstreetmap.org/node/1'}],sourceUrl:'https://www.openstreetmap.org/copyright',message:'Dados OSM de teste'}}};
describe('regional dashboard presentation — fixtures only',()=>{
 it('places source-labelled indicators above map/trends and keeps missing counts unavailable',()=>{
  const html=renderToStaticMarkup(<RegionalAudienceReview companyId="fixture" review={review} available write onChanged={async()=>{}}/>);
  expect(html.indexOf('Indicadores da região')).toBeLessThan(html.indexOf('Seu território de atendimento'));expect(html).toContain('IBGE · população municipal');expect(html).toContain('Indisponível');expect(html).toContain('Facebook · assuntos');expect(html).toContain('X · assuntos recentes');
  expect(html).toContain('Consultório fixture');expect(html).toContain('Confirmar sem concorrentes selecionados');expect(html).not.toContain('checked=""');expect(html).toContain('recorte estadual');
 });
 it('does not claim a running job for a read-only unstarted placeholder',()=>{
  const html=renderToStaticMarkup(<RegionalAudienceReview companyId="fixture" review={{...review,id:undefined,revision:0,status:'pending',data:null}} available write={false} onChanged={async()=>{}}/>);
  expect(html).toContain('A pesquisa ainda não foi iniciada');expect(html).not.toContain('aria-busy="true"');expect(html).not.toContain('Consultando as fontes');
 });
 it('shows actual per-source progress while pending rather than a ready approval message',()=>{
  const html=renderToStaticMarkup(<RegionalAudienceReview companyId="fixture" review={{...review,status:'running',data:null,progress:[{source:'ibge',state:'completed',updatedAt:'2026-10-06T12:00:00Z'},{source:'google',state:'running',updatedAt:'2026-10-06T12:00:00Z'}]}} available write onChanged={async()=>{}}/>);
  expect(html).toContain('aria-busy="true"');expect(html).toContain('Concluído');expect(html).toContain('Em andamento');expect(html).toContain('Na fila');expect(html).not.toContain('100%');expect(html).not.toContain('Indicadores da região');
 });
});
