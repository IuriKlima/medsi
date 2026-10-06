import {verifyFirebaseActor} from '../platform/firebase-auth';
import { CanActivate, ExecutionContext, Inject, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
export const AUTH_CONFIG = 'AUTH_CONFIG';
export type AuthConfig = {url?:string;key?:string;provider?:string};
export type AuthenticatedActor = {id:string;email:string;client:SupabaseClient};
export type AuthRequest = {headers:{authorization?:string};actor:AuthenticatedActor};
@Injectable()
export class AuthService {
  constructor(@Inject(AUTH_CONFIG) private readonly config:AuthConfig) {}
  async verify(header?:string):Promise<AuthenticatedActor> {
    if (!header || !/^Bearer [^\s]+$/.test(header)) throw new UnauthorizedException('Faça login para continuar.');
    if((this.config.provider==='firebase_sql'||this.config.provider==='firestore'))return verifyFirebaseActor(header.slice(7));
    if (!this.config.url || !this.config.key) throw new ServiceUnavailableException('Autenticação não configurada.');
    const token=header.slice(7);
    const client=createClient(this.config.url,this.config.key,{
      global:{headers:{Authorization:'Bearer '+token}},
      auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
    });
    // Never trust getSession/user-supplied claims for identity verification.
    const {data,error}=await client.auth.getUser(token);
    if(error || !data.user || !data.user.email_confirmed_at) throw new UnauthorizedException('Sessão inválida ou e-mail não confirmado.');
    return {id:data.user.id,email:data.user.email ?? '',client};
  }
}
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(@Inject(AuthService) private readonly auth:AuthService) {}
  async canActivate(context:ExecutionContext) {
    const request=context.switchToHttp().getRequest<AuthRequest>();
    request.actor=await this.auth.verify(request.headers.authorization);
    return true;
  }
}
