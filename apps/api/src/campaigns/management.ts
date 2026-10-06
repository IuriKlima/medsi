import {serviceDatabase} from '../platform/service';
import {databaseConfigured} from '../platform/config';
import {createHash,randomBytes,randomUUID} from 'node:crypto';

import {BadRequestException,Body,Controller,Get,Param,Post,Req,ServiceUnavailableException,UnauthorizedException,UseGuards} from '@nestjs/common';
import {z} from 'zod';
import {studentSchema} from '@askadia/contracts';
import {AuthGuard,type AuthRequest} from '../identity/auth';
import {result} from '../identity/service';
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
export const managementBatchSchema=z.object({eventId:z.uuid(),observedAt:z.iso.datetime({offset:true}),students:z.array(studentSchema).min(1).max(500)}).strict().refine(v=>new Set(v.students.map(s=>s.externalId)).size===v.students.length,{message:'Duplicate student IDs'});
@Controller('onboarding/companies/:id/management')
@UseGuards(AuthGuard)
export class ManagementController{
 @Get() async status(@Req() r:AuthRequest,@Param('id') id:string){if(!z.uuid().safeParse(id).success)throw new BadRequestException();return {integration:result(await r.actor.client.rpc('management_ingestion_status',{p_company_id:id})),endpoint:new URL('/api/integrations/management/students',process.env.WEB_ORIGIN||'http://127.0.0.1:3000').href};}
 @Post('key') async key(@Req() r:AuthRequest,@Param('id') id:string,@Body() body:unknown){const input=z.object({revoke:z.boolean()}).strict().safeParse(body);if(!input.success||!z.uuid().safeParse(id).success)throw new BadRequestException();const key=input.data.revoke?null:'ask_mgmt_'+randomBytes(32).toString('base64url');result(await r.actor.client.rpc('set_management_ingestion_key',{p_company_id:id,p_id:randomUUID(),p_hash:key?hash(key):null}));return {key};}
}
@Controller('integrations/management')
export class ManagementIngestionController{
 @Post('students') async ingest(@Req() r:{headers:{authorization?:string}},@Body() body:unknown){const auth=r.headers.authorization;if(!auth||!/^Bearer ask_mgmt_[A-Za-z0-9_-]{43}$/.test(auth))throw new UnauthorizedException('Credencial de integração inválida.');const parsed=managementBatchSchema.safeParse(body);if(!parsed.success)throw new BadRequestException('Confira o contrato de pacientes da MedSI.');if(!databaseConfigured())throw new ServiceUnavailableException('Recebimento de dados não configurado.');const db=serviceDatabase();return result(await db.rpc('ingest_management_students',{p_hash:hash(auth.slice(7)),p_event:parsed.data.eventId,p_observed_at:parsed.data.observedAt,p_students:parsed.data.students,p_body_hash:hash(JSON.stringify(parsed.data))}));}
}
