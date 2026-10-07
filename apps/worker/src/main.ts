import {config} from 'dotenv';
import {resolve} from 'node:path';
import {createServer} from 'node:http';
import {z} from 'zod';
import {createWorkerRuntime} from '@askadia/api/background';

config({path:resolve(__dirname,'../../../.env'),quiet:true});
const env=z.object({
 NODE_ENV:z.enum(['development','test','production']).default('development'),
 WORKER_HEALTH_PORT:z.coerce.number().int().min(1).max(65535).default(4001),
 WORKER_MODE:z.enum(['disabled','dry-run','enabled']).default('disabled'),
}).parse(process.env);
const runtime=createWorkerRuntime(env.WORKER_MODE);
let shuttingDown=false;
const server=createServer((req,res)=>{
 if(req.url!=='/health'){res.writeHead(404);res.end();return;}
 res.writeHead(shuttingDown?503:200,{'content-type':'application/json'});
 res.end(JSON.stringify({service:'medsi-worker',...runtime.health()}));
});
async function shutdown(){
 if(shuttingDown)return;
 shuttingDown=true;
 const closed=new Promise<void>(resolve=>server.close(()=>resolve()));
 try{await runtime.onModuleDestroy();await closed;}catch{console.error('Worker shutdown failed.');process.exitCode=1;}
}
process.once('SIGINT',()=>void shutdown());
process.once('SIGTERM',()=>void shutdown());
server.once('error',()=>{console.error('Worker health server unavailable.');process.exitCode=1;void shutdown();});
server.listen(env.WORKER_HEALTH_PORT,'127.0.0.1',()=>{
 if(shuttingDown)return;
 try{runtime.onModuleInit();console.log('Worker runtime started; health reports configuration only.');}
 catch{console.error('Worker initialization failed. Check runtime configuration.');process.exitCode=1;void shutdown();}
});
