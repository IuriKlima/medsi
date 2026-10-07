/* global console */
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
const root='apps/api/src',native=join(root,'platform/firestore');
const implemented=new Set();
for(const file of readdirSync(native).filter(f=>f.endsWith('.ts')&&f!=='client.ts')){
 const source=readFileSync(join(native,file),'utf8');
 for(const match of source.matchAll(/export const \w+Operations=\[([^\]]+)\]/g))for(const literal of match[1].matchAll(/'([a-z_]+)'/g))implemented.add(literal[1]);
}
implemented.add('record_onboarding_attachment');
function sources(dir){return readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?sources(join(dir,entry.name)):entry.name.endsWith('.ts')?[join(dir,entry.name)]:[]);}
const called=new Set();for(const file of sources(root))for(const match of readFileSync(file,'utf8').matchAll(/\.rpc\(\s*['"]([a-z_]+)['"]/g))called.add(match[1]);
const report={provider:'firestore',status:'migration-in-progress',productionReady:false,validation:'isolated-fixtures; provider and infrastructure homologation pending',implemented:[...implemented].sort(),literalCalls:[...called].sort(),pending:[...called].filter(name=>!implemented.has(name)).sort(),notes:['Static literal inventory; dynamic RPC names and direct queries require separate review.','Exported domain operations must also appear in the client registry; this inventory does not prove authorization, cloud execution or provider readiness.','Billing scheduler owns direct transactional helpers; it is not a client RPC.']};
writeFileSync('docs/medsi-firestore-operations.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({implemented:implemented.size,literalCalls:called.size,pending:report.pending.length}));
