import type {GeneratedStrategy} from './strategy';
import type {InstagramWatch} from './instagram';
export type StrategyBrief={id:string;status:string;profile_version:number;generation:number;output:GeneratedStrategy|null;created_at:string;feedback?:string};
export type JourneyStage={stage:number;basis:string;approved:boolean;approvedAt:string|null;data:unknown};
export type PreparationProgress={status:string;stage?:string;error:string|null};
export type MarketingJourney={profileVersion:number;confirmed:boolean;canApprove:boolean;regionalAvailable?:boolean;competitorReview?:{basis:string;watches:InstagramWatch[]};stages:JourneyStage[];strategy?:StrategyBrief|null;preparation?:{available:boolean;content:PreparationProgress|null;recommendations:PreparationProgress|null}};
export function stageReady(stage:JourneyStage|undefined,strategy?:StrategyBrief|null):boolean{
 if(!stage)return false;
 if(stage.stage===1){const data=stage.data as {regional?:{status?:string}}|null;return data?.regional?data.regional.status==='ready':true;}
 if(stage.stage===2){
  const data=stage.data as {id?:string;generation?:number;output?:unknown;analysisCurrent?:boolean}|null;
  return Boolean(data?.output&&data.analysisCurrent!==false&&strategy?.output&&['review','approved'].includes(strategy.status)&&strategy.id===data.id&&strategy.generation===data.generation);
 }
 if(stage.stage===3)return Array.isArray(stage.data)&&stage.data.length>0&&stage.data.every(i=>Boolean(i.date));
 if(stage.stage===4){const data=stage.data as {whatsapp?:unknown;messages?:unknown}|null;return Array.isArray(data?.whatsapp)&&data.whatsapp.length>0&&Array.isArray(data?.messages)&&data.messages.length>0;}
 return stage.stage===5&&Array.isArray(stage.data)&&stage.data.length>0;
}
// The server enforces its own five-minute generation lock. UI recovery never bypasses it.
export function strategyTimedOut(brief:StrategyBrief|null|undefined,now=Date.now()):boolean{
 return brief?.status==='generating'&&Number.isFinite(Date.parse(brief.created_at))&&now-Date.parse(brief.created_at)>5*60_000;
}
