import type {Row} from '../platform/firestore/store';
/** Derive delivery state from current pieces, never from the diagnosis queue. */
export function calendarProduction(items:Row[],assets:Row[],jobs:Row[],current:Row|null){
 const active=current?items.filter(i=>i.brief_id===current.id&&i.generation===current.generation):[];
 const missingTexts=active.filter(i=>!i.details).length;
 const missingImages=active.filter(i=>i.details&&i.format!=='video').reduce((n,i)=>n+Array.from({length:i.format==='carrossel'?i.details.slides.length:1},(_,frame)=>frame).filter(frame=>!assets.some(a=>a.item_id===i.id&&a.revision===i.revision&&a.frame===frame)).length,0);
 const pending=jobs.filter(j=>j.brief_id===current?.id&&j.generation===current?.generation&&(j.kind==='details'?missingTexts>0:active.some(i=>i.id===j.item_id&&i.revision===j.revision&&!assets.some(a=>a.item_id===i.id&&a.revision===i.revision&&a.frame===j.frame))));
 const failed=pending.find(j=>j.status==='failed');
 const status=active.length&&!missingTexts&&!missingImages?'completed':pending.some(j=>j.status==='running')?'running':pending.some(j=>j.status==='pending')?'pending':failed?'failed':'waiting';
 return {status,missingTexts,missingImages,error:status==='failed'?failed?.error??'A produção precisa de revisão.':null};
}
