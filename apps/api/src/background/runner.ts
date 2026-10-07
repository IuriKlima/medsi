import {closeBackgroundResources} from './resources';
import {backgroundHandlers} from './registry';
import {drainBackgroundTasks} from './tasks';

export type BackgroundRole='api'|'worker';
export type BackgroundMode='enabled'|'disabled'|'dry-run';
export type BackgroundHandler={id:string;processor:new()=>{onModuleInit():void;onModuleDestroy():void};configured:()=>boolean;apiOnly?:boolean};
export function backgroundExecutor():BackgroundRole|'disabled' {
 const value=process.env.BACKGROUND_EXECUTOR??'api';
 if(value!=='api'&&value!=='worker'&&value!=='disabled')throw new Error('BACKGROUND_EXECUTOR must be api, worker or disabled.');
 return value;
}

/** Shared lifecycle, not a business scheduler. Each processor retains its own durable claims. */
export class BackgroundRunner {
 private readonly executor=backgroundExecutor();
 private state:'new'|'running'|'failed'|'stopping'|'stopped'='new';
 private active=new Map<string,InstanceType<BackgroundHandler['processor']>>();
 private closing:Promise<void>|undefined;
 constructor(readonly role:BackgroundRole,readonly mode:BackgroundMode='enabled',private readonly handlers:BackgroundHandler[]=backgroundHandlers,private readonly closeDatabase:()=>Promise<void>=closeBackgroundResources){}
 private owner(handler:BackgroundHandler){return this.executor==='disabled'?'disabled':handler.apiOnly?'api':this.executor;}
 onModuleInit():void {
  if(this.state!=='new')return;
  this.state='running';
  if(this.mode!=='enabled')return;
  try{
   for(const handler of this.handlers){
    if(this.owner(handler)!==this.role||!handler.configured())continue;
    const processor=new handler.processor();this.active.set(handler.id,processor);processor.onModuleInit();
   }
  }catch(error){this.state='failed';for(const processor of this.active.values())processor.onModuleDestroy();throw error;}
 }
 health(){
  const handlers=this.handlers.map(handler=>({id:handler.id,owner:this.owner(handler),configured:handler.configured(),polling:this.state==='running'&&this.active.has(handler.id)}));
  const processing=handlers.some(handler=>handler.polling);
  return {status:this.state==='failed'||this.state==='stopping'||this.state==='stopped'?this.state:this.mode!=='enabled'?this.mode:processing?'running':'idle',role:this.role,executor:this.executor,mode:this.mode,processing,verification:'configuration-only' as const,handlers};
 }
 onModuleDestroy():Promise<void> {
  if(this.closing)return this.closing;
  this.state='stopping';
  // Stop every timer before awaiting any in-flight durable claim/provider response.
  for(const processor of this.active.values())processor.onModuleDestroy();
  this.closing=(async()=>{
   await Promise.all([...this.active.values()].map(drainBackgroundTasks));
   if(this.role==='api'||this.active.size)await this.closeDatabase();
   this.active.clear();this.state='stopped';
  })();
  return this.closing;
 }
}
