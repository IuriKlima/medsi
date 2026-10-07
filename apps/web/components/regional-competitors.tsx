'use client';
import {useCallback,useEffect,useState} from 'react';
import Link from 'next/link';
import type {MarketingJourney,OnboardingSnapshot,RegionalReview} from '@askadia/contracts';
import {journeyApi} from '../lib/journey-api';
import {LoadState} from './load-state';
import {RegionalAudienceReview} from './regional-audience';
import {InstagramProfiles} from './instagram-profiles';
export function RegionalCompetitors({companyId,profile,write}:{companyId:string;profile:OnboardingSnapshot|null;write:boolean}){
 const [journey,setJourney]=useState<MarketingJourney|null>(null),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 const load=useCallback(async(signal?:AbortSignal)=>{const value=await journeyApi<MarketingJourney>('companies/'+companyId+'/launch/journey',undefined,signal);if(!signal?.aborted){setJourney(value);setError('');}},[companyId]);
 const regional=(journey?.stages[0]?.data as {regional?:RegionalReview}|null)?.regional;
 const working=Boolean(regional?.revision&&['pending','running'].includes(regional.status));
 useEffect(()=>{const c=new AbortController();let timer:ReturnType<typeof setTimeout>;async function refresh(){try{if(!document.hidden)await load(c.signal);}catch(e){if(!c.signal.aborted)setError(e instanceof Error?e.message:'Não foi possível consultar a pesquisa.');}finally{if(!c.signal.aborted)timer=setTimeout(()=>void refresh(),working?15000:300000);}}void refresh();return()=>{c.abort();clearTimeout(timer);};},[load,working,retry]);
 return <section aria-label="Pesquisa de concorrentes"><h2>Mapa e concorrentes da região</h2><p>Confira o endereço e os estabelecimentos compatíveis com as especialidades e os serviços do seu cadastro. Alterar a seleção exige revisar novamente a estratégia.</p>
  {error&&<LoadState error={error} retry={()=>setRetry(v=>v+1)}/>}
  {!journey&&!error&&<LoadState label="Carregando a pesquisa regional…"/>}
  {journey&&!journey.confirmed&&<p><Link href={'/empresa/'+companyId+'/onboarding'}>Concluir e confirmar o cadastro</Link> para pesquisar os concorrentes.</p>}
  {journey?.confirmed&&<>{regional?<RegionalAudienceReview key={companyId+'_'+journey.profileVersion} companyId={companyId} review={regional} address={profile?.state.facts.address?.value??undefined} available={journey.regionalAvailable===true} write={write} onChanged={load}/>:<p>A pesquisa regional ainda não está disponível nesta versão. Retome a análise na estratégia.</p>}
   <p><Link className="button button-primary" href={'/empresa/'+companyId+'/estrategia'}>Revisar a análise e continuar a estratégia →</Link></p>
   <details><summary>Perfis e referências no Instagram</summary><InstagramProfiles key={companyId} companyId={companyId} onChanged={load}/></details>
  </>}
 </section>;
}
