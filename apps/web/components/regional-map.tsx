'use client';
import {useEffect,useRef,useState} from 'react';
import type {Map as LeafletMap,LayerGroup} from 'leaflet';
import type {RegionalMap as MapData,RegionalPoint} from '@askadia/contracts';
import 'leaflet/dist/leaflet.css';
import s from './regional-audience.module.css';
export function RegionalMap({data,point,radiusM,selected,onPoint,onToggle,disabled}:{data:MapData;point:RegionalPoint|null;radiusM:number;selected:string[];onPoint:(point:RegionalPoint)=>void;onToggle:(id:string)=>void;disabled:boolean}){
 const host=useRef<HTMLDivElement>(null),map=useRef<LeafletMap|null>(null),layer=useRef<LayerGroup|null>(null);const [ready,setReady]=useState(false),[error,setError]=useState('');
 const actions=useRef({onPoint,onToggle,disabled});useEffect(()=>{actions.current={onPoint,onToggle,disabled};},[onPoint,onToggle,disabled]);
 const initial=useRef({point,viewport:data.viewport}),framed=useRef('');
 useEffect(()=>{let cancelled=false;
  void import('leaflet').then(L=>{if(cancelled||!host.current)return;const center=initial.current.point??initial.current.viewport;const m=L.map(host.current,{scrollWheelZoom:false}).setView(center?[center.lat,center.lng]:[-14.2,-51.9],center?12:4);map.current=m;
   L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(m).on('tileerror',()=>setError('Alguns detalhes do mapa não carregaram. Você ainda pode ajustar o ponto pelas coordenadas e selecionar na lista.'));
   layer.current=L.layerGroup().addTo(m);m.on('click',event=>{if(!actions.current.disabled&&event.latlng.lat>=-34&&event.latlng.lat<=6&&event.latlng.lng>=-74&&event.latlng.lng<=-28)actions.current.onPoint({lat:Number(event.latlng.lat.toFixed(6)),lng:Number(event.latlng.lng.toFixed(6))});});setReady(true);
  }).catch(()=>setError('Não foi possível carregar o mapa. Use as coordenadas e a lista abaixo.'));
  return()=>{cancelled=true;map.current?.remove();map.current=null;layer.current=null;};
 },[]);
 useEffect(()=>{if(!ready)return;let cancelled=false;void import('leaflet').then(L=>{if(cancelled||!map.current||!layer.current)return;layer.current.clearLayers();if(point){const circle=L.circle([point.lat,point.lng],{radius:radiusM,color:'#123d46',fillColor:'#42d6b0',fillOpacity:.12,weight:2,interactive:false}).addTo(layer.current);L.circleMarker([point.lat,point.lng],{radius:9,color:'#fff',fillColor:'#123d46',fillOpacity:1,weight:3}).bindTooltip('Seu local de atendimento').addTo(layer.current);const frame=JSON.stringify([point.lat,point.lng,radiusM]);if(framed.current!==frame){map.current.invalidateSize();map.current.fitBounds(circle.getBounds(),{padding:[28,28],maxZoom:16});framed.current=frame;}}
   for(const c of data.competitors){const label=document.createElement('span');label.textContent=c.name;L.circleMarker([c.lat,c.lng],{radius:selected.includes(c.id)?9:6,color:selected.includes(c.id)?'#123d46':'#6e8587',fillColor:selected.includes(c.id)?'#42d6b0':'#fff',fillOpacity:1,weight:2,bubblingMouseEvents:false}).bindTooltip(label).on('click',()=>{if(!actions.current.disabled)actions.current.onToggle(c.id);}).addTo(layer.current);}
  });return()=>{cancelled=true;};
 },[data.competitors,point,radiusM,ready,selected]);
 return <><div ref={host} className={s.mapCanvas} aria-label="Mapa do atendimento e dos estabelecimentos próximos"/>{!ready&&!error&&<p role="status">Abrindo o mapa…</p>}{error&&<p role="status">{error}</p>}<small>Clique no mapa para posicionar o atendimento. Use a lista abaixo para selecionar concorrentes pelo teclado.</small></>;
}
