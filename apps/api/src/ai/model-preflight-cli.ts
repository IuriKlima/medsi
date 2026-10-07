import {config} from 'dotenv';
import {resolve} from 'node:path';
import {preflightOpenAIModels} from './models';
config({path:resolve(__dirname,'../../../../.env'),quiet:true});
preflightOpenAIModels().then(report=>{console.log(JSON.stringify(report,null,2));if(report.state!=='completed'||Object.values(report.roles).some(role=>role.state!=='listed'))process.exitCode=2;}).catch(()=>{console.error('Model preflight failed; no provider response or credential is logged.');process.exitCode=1;});
