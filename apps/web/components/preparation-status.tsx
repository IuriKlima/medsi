'use client';
import {useEffect,useState} from 'react';
import {Check,LoaderCircle} from 'lucide-react';
import type {RegionalProgress} from '@askadia/contracts';
import s from './preparation-status.module.css';
const names={ibge:'Consultando população e perfil no IBGE',facebook:'Consultando a audiência do Facebook',google:'Pesquisando assuntos no Google Trends',x:'Consultando assuntos recentes no X',map:'Preparando mapa e estabelecimentos próximos'};
export function PreparationStatus({title,detail,progress}:{title:string;detail:string;progress?:RegionalProgress[]}){
 const [seconds,setSeconds]=useState(0);useEffect(()=>{const start=Date.now();const timer=setInterval(()=>setSeconds(Math.floor((Date.now()-start)/1000)),1000);return()=>clearInterval(timer);},[]);
 return <aside className={s.panel} aria-busy="true"><div className={s.heading}><LoaderCircle className={s.spinner} size={24}/><div role="status" aria-live="polite"><strong>{title}</strong><p>{detail}</p></div></div>{progress&&<ul>{Object.entries(names).map(([source,label])=>{const state=progress.find(p=>p.source===source)?.state;return <li key={source}>{state==='completed'?<Check size={16}/>:state==='running'?<LoaderCircle size={16} className={s.spinner}/>:<span className={s.dot}/>}<span>{label}</span><small>{state==='completed'?'Concluído':state==='unavailable'?'Fonte indisponível':state==='running'?'Em andamento':'Na fila'}</small></li>;})}</ul>}<small>Tempo nesta tela: {Math.floor(seconds/60)}min {seconds%60}s · {seconds>=60?'A consulta está demorando mais. Você pode sair e retomar; o resultado aparecerá quando estiver pronto.':'Seu progresso fica salvo. A preparação continua no servidor.'}</small></aside>;
}
