import {z} from 'zod';
export const planningPreferencesSchema=z.object({postsPerMonth:z.number().int().min(1).max(31),maxPostsPerWeek:z.number().int().min(1).max(7)}).strict();
export type PlanningPreferences=z.infer<typeof planningPreferencesSchema>;
export const defaultPlanningPreferences:PlanningPreferences={postsPerMonth:8,maxPostsPerWeek:2};
const week=(date:string)=>{const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));return d.toISOString().slice(0,10);};
/** Evenly spread editable proposals in the remaining days of the requested month. */
export function proposeCurrentMonthDates(month:string,today:string,count:number,weeklyLimit:number):string[]{
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||!Number.isInteger(count)||count<1||count>31||!Number.isInteger(weeklyLimit)||weeklyLimit<1||weeklyLimit>7)throw new Error('Invalid planning preferences');
 const first=month+'-01',end=new Date(Number(month.slice(0,4)),Number(month.slice(5,7)),0).getDate();
 const days=Array.from({length:end},(_,i)=>month+'-'+String(i+1).padStart(2,'0')).filter(d=>d>=today&&d>=first);
 const selected:string[]=[],counts=new Map<string,number>();
 for(let n=0;n<count;n++){
  const ideal=days.length*(n+.5)/count;
  const candidates=days.filter(d=>!selected.includes(d)&&(counts.get(week(d))??0)<weeklyLimit);
  candidates.sort((a,b)=>Math.abs(days.indexOf(a)-ideal)-Math.abs(days.indexOf(b)-ideal)||a.localeCompare(b));
  const date=candidates[0];if(!date)throw new Error('Quantidade não cabe nos dias restantes do mês com a frequência escolhida. Reduza a quantidade ou aumente a frequência.');
  selected.push(date);counts.set(week(date),(counts.get(week(date))??0)+1);
 }
 return selected.sort();
}
