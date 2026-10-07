// Track existing durable ticks for graceful shutdown; retries remain in their queues.
const pending=new WeakMap<object,Set<Promise<void>>>();
export function trackBackgroundTask(owner:object,work:()=>Promise<void>):void {
 const tasks=pending.get(owner)??new Set<Promise<void>>();pending.set(owner,tasks);
 const task=Promise.resolve().then(work).catch(()=>{/* Durable leases recover failures; never log provider payloads. */});
 tasks.add(task);void task.finally(()=>tasks.delete(task));
}
export async function drainBackgroundTasks(owner:object):Promise<void> {
 await Promise.allSettled([...(pending.get(owner)??[])]);
}
