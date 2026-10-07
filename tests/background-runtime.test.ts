import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {BackgroundRunner,backgroundExecutor,type BackgroundHandler} from '../apps/api/src/background/runner';
import {trackBackgroundTask} from '../apps/api/src/background/tasks';

beforeEach(()=>{vi.stubEnv('BACKGROUND_EXECUTOR','api');vi.useFakeTimers();});
afterEach(()=>{vi.useRealTimers();vi.unstubAllEnvs();});
function fixture(){
 const events:string[]=[];let finish:()=>void=()=>{};
 const job=new Promise<void>(resolve=>{finish=resolve;});
 class Processor {
  timer:ReturnType<typeof setTimeout>|undefined;stopped=false;
  onModuleInit(){events.push('started');this.timer=setTimeout(()=>trackBackgroundTask(this,async()=>{events.push('claimed');await job;events.push('finished');if(!this.stopped)this.onModuleInit();}),10);}
  onModuleDestroy(){events.push('stopped');this.stopped=true;clearTimeout(this.timer);}
 }
 const handlers:BackgroundHandler[]=[{id:'fixture',processor:Processor,configured:()=>true}];
 return {events,finish,handlers,close:async()=>{events.push('database closed');}};
}
describe('shared durable processor lifecycle',()=>{
 it('retains API ownership by default and rejects unknown selectors',()=>{
  vi.stubEnv('BACKGROUND_EXECUTOR',undefined);expect(backgroundExecutor()).toBe('api');
  vi.stubEnv('BACKGROUND_EXECUTOR','both');expect(()=>backgroundExecutor()).toThrow('BACKGROUND_EXECUTOR');
 });
 it('runs exactly one lifecycle when explicitly assigning worker ownership',async()=>{
  vi.stubEnv('BACKGROUND_EXECUTOR','worker');const f=fixture();
  const api=new BackgroundRunner('api','enabled',f.handlers,f.close),worker=new BackgroundRunner('worker','enabled',f.handlers,f.close);
  api.onModuleInit();worker.onModuleInit();worker.onModuleInit();
  expect(f.events).toEqual(['started']);expect(api.health().processing).toBe(false);expect(worker.health().processing).toBe(true);
  await worker.onModuleDestroy();await api.onModuleDestroy();expect(vi.getTimerCount()).toBe(0);
 });
 it.each(['disabled','dry-run'] as const)('%s never constructs a handler or opens a database',async mode=>{
  vi.stubEnv('BACKGROUND_EXECUTOR','worker');const construct=vi.fn(),close=vi.fn();
  class Forbidden {constructor(){construct();}onModuleInit(){}onModuleDestroy(){}}
  const runner=new BackgroundRunner('worker',mode,[{id:'fixture',processor:Forbidden,configured:()=>true}],close);
  runner.onModuleInit();expect(runner.health()).toMatchObject({processing:false,mode,verification:'configuration-only',handlers:[{id:'fixture',configured:true,polling:false}]});
  await runner.onModuleDestroy();expect(construct).not.toHaveBeenCalled();expect(close).not.toHaveBeenCalled();
 });
 it('reports unconfigured handlers without claiming provider connectivity',async()=>{
  const f=fixture();f.handlers[0]!.configured=()=>false;const runner=new BackgroundRunner('api','enabled',f.handlers,f.close);runner.onModuleInit();
  expect(f.events).toEqual([]);expect(runner.health()).toMatchObject({status:'idle',processing:false,verification:'configuration-only',handlers:[{configured:false,polling:false}]});await runner.onModuleDestroy();
 });
 it('stops timers first, drains the current durable job and only then closes the database',async()=>{
  const f=fixture();const runner=new BackgroundRunner('api','enabled',f.handlers,f.close);runner.onModuleInit();await vi.advanceTimersByTimeAsync(10);
  const closing=runner.onModuleDestroy();expect(f.events).toEqual(['started','claimed','stopped']);expect(runner.health().status).toBe('stopping');
  f.finish();await closing;await runner.onModuleDestroy();await vi.advanceTimersByTimeAsync(100);
  expect(f.events).toEqual(['started','claimed','stopped','finished','database closed']);expect(vi.getTimerCount()).toBe(0);expect(runner.health().status).toBe('stopped');
 });
 it('cleans already started handlers when startup fails',async()=>{
  const f=fixture();class Broken {onModuleInit(){throw new Error('fixture startup failure');}onModuleDestroy(){f.events.push('broken stopped');}}
  const runner=new BackgroundRunner('api','enabled',[...f.handlers,{id:'broken',processor:Broken,configured:()=>true}],f.close);
  expect(()=>runner.onModuleInit()).toThrow('fixture startup failure');expect(runner.health()).toMatchObject({status:'failed',processing:false});await runner.onModuleDestroy();expect(vi.getTimerCount()).toBe(0);expect(f.events).toContain('stopped');
 });
});
