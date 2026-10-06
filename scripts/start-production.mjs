import {spawn} from 'node:child_process';
import {setTimeout} from 'node:timers';
import process from 'node:process';
import {resolve} from 'node:path';
if(process.env.NODE_ENV!=='production'){
 process.stderr.write('O comando de producao exige NODE_ENV=production, exatamente. Corrija a variavel no Easypanel.\n');
 process.exit(1);
}
const children=[];let stopping=false;
function stop(code=0){if(stopping)return;stopping=true;for(const child of children)child.kill('SIGTERM');setTimeout(()=>process.exit(code),1000).unref();}
function start(args,cwd){const child=spawn(process.execPath,args,{cwd,stdio:'inherit',env:process.env});children.push(child);child.on('error',()=>stop(1));child.on('exit',code=>{if(!stopping)stop(code||1);});}
start(['dist/main.js'],resolve('apps/api'));
start(['node_modules/next/dist/bin/next','start','--hostname','0.0.0.0','--port',process.env.PORT||'3000'],resolve('apps/web'));
process.on('SIGTERM',()=>stop());process.on('SIGINT',()=>stop());
