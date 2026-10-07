import 'reflect-metadata';
import {productionConfigurationIssues} from '../platform/production-config';
import {BackgroundRunner,backgroundExecutor,type BackgroundMode} from './runner';
export {BackgroundRunner,backgroundExecutor} from './runner';
export type {BackgroundMode} from './runner';

export function createWorkerRuntime(mode:BackgroundMode='disabled') {
 // Preserve the worker's unconditional production guard while homologation is pending.
 if(process.env.NODE_ENV==='production')throw new Error('Production worker disabled: durable business workflows require homologation.');
 const issues=productionConfigurationIssues();
 if(issues.length)throw new Error('Worker production configuration is incomplete.');
 if(!['disabled','dry-run','enabled'].includes(mode))throw new Error('WORKER_MODE must be disabled, dry-run or enabled.');
 if(mode==='enabled'&&backgroundExecutor()!=='worker')throw new Error('Enabled worker requires BACKGROUND_EXECUTOR=worker.');
 return new BackgroundRunner('worker',mode);
}
