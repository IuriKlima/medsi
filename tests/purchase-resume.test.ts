import {afterEach,describe,expect,it,vi} from 'vitest';
import {readPurchaseResume} from '../apps/web/lib/purchase-resume';

afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
describe('purchase resume reads',()=>{
 for(const pending of ['purchase','profile'])it(`times out when the ${pending} read never settles and cancels both reads`,async()=>{
  vi.useFakeTimers();const signals:AbortSignal[]=[];
  vi.stubGlobal('fetch',(url:string,init:RequestInit)=>{signals.push(init.signal as AbortSignal);return url.endsWith('/purchase')===(pending==='purchase')?new Promise(()=>{}):Promise.resolve(Response.json({ready:true}));});
  const result=readPurchaseResume('companies/fixture',new AbortController().signal);const rejected=expect(result).rejects.toThrow('demorando');
  await vi.advanceTimersByTimeAsync(20_000);await rejected;expect(signals).toHaveLength(2);expect(signals.every(signal=>signal.aborted)).toBe(true);expect(vi.getTimerCount()).toBe(0);
 });
 it('keeps the timeout explanation when a real transport rejects on abort',async()=>{
  vi.useFakeTimers();
  vi.stubGlobal('fetch',(_url:string,init:RequestInit)=>new Promise<Response>((_resolve,reject)=>{init.signal!.addEventListener('abort',()=>reject(new DOMException('The operation was aborted.','AbortError')),{once:true});}));
  const result=readPurchaseResume('companies/fixture',new AbortController().signal);const rejected=expect(result).rejects.toThrow('demorando');
  await vi.advanceTimersByTimeAsync(20_000);await rejected;expect(vi.getTimerCount()).toBe(0);
 });
 it('reports an HTTP failure, cancels the other read and permits a fresh retry',async()=>{
  const signals:AbortSignal[]=[];
  vi.stubGlobal('fetch',(url:string,init:RequestInit)=>{signals.push(init.signal as AbortSignal);return url.endsWith('/purchase')?Promise.resolve(Response.json({error:'Retomada indisponível'},{status:500})):new Promise(()=>{});});
  await expect(readPurchaseResume('companies/fixture',new AbortController().signal)).rejects.toThrow('temporariamente indisponível');expect(signals.every(signal=>signal.aborted)).toBe(true);
  vi.stubGlobal('fetch',(url:string)=>Promise.resolve(Response.json(url.endsWith('/purchase')?{aiAllowed:false}:{step:'complete'})));
  await expect(readPurchaseResume('companies/fixture',new AbortController().signal)).resolves.toEqual([{aiAllowed:false},{step:'complete'}]);
 });
 it('discards an old result after unmount even when the transport ignores cancellation',async()=>{
  vi.useFakeTimers();const controller=new AbortController();const resolves:((response:Response)=>void)[]=[];const signals:AbortSignal[]=[];
  vi.stubGlobal('fetch',(_url:string,init:RequestInit)=>{signals.push(init.signal as AbortSignal);return new Promise<Response>(resolve=>resolves.push(resolve));});
  const result=readPurchaseResume('companies/fixture',controller.signal);const rejected=expect(result).rejects.toMatchObject({name:'AbortError'});controller.abort();await rejected;
  resolves.forEach(resolve=>resolve(Response.json({stale:true})));await Promise.resolve();expect(signals.every(signal=>signal.aborted)).toBe(true);expect(vi.getTimerCount()).toBe(0);
 });
});
