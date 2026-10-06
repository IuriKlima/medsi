-- Guided medical intake. Existing confirmed profiles are preserved until explicitly edited.
begin;
alter table public.company_onboarding add column medical_intake jsonb check (medical_intake is null or jsonb_typeof(medical_intake)='object');
create table public.medical_intake_requests(
 company_id uuid not null references public.companies(id),request_id uuid not null,actor_id uuid not null references public.profiles(id),fingerprint text not null,created_at timestamptz not null default now(),primary key(company_id,request_id)
);
alter table public.medical_intake_requests enable row level security;
revoke all on public.medical_intake_requests from public,anon,authenticated;
create function private.valid_cnpj(v text) returns boolean language plpgsql immutable set search_path='' as $$
declare n integer; i integer; total integer; weight integer; digit integer;
begin
 if v is null or v !~ '^[A-Z0-9]{12}[0-9]{2}$' or v ~ '^(.)\1{13}$' then return false;end if;
 for n in 12..13 loop
  total:=0;weight:=2;
  for i in reverse n..1 loop total:=total+(ascii(substr(v,i,1))-48)*weight;weight:=case when weight=9 then 2 else weight+1 end;end loop;
  digit:=case when total%11<2 then 0 else 11-total%11 end;
  if digit<>substr(v,n+1,1)::integer then return false;end if;
 end loop;return true;
end;$$;
create function private.valid_medical_answer(c uuid,step text,j jsonb) returns boolean language plpgsql stable security definer set search_path='' as $$
declare keys text[];v jsonb;cnt integer;
begin
 if j is null or jsonb_typeof(j)<>'object' or length(j::text)>15000 then return false;end if;
 keys:=case step when 'cnpj' then array['value'] when 'address' then array['name','addressLine','city','uf','postalCode','businessType'] when 'specialty' then array['values'] when 'history' then case when j->>'mode'='pdf' then array['mode','attachmentId'] else array['mode','text'] end when 'logo' then case when j->>'mode'='upload' then array['mode','attachmentId'] else array['mode','style'] end when 'photos' then array['mode','attachmentIds'] when 'website' then case when j->>'mode'='existing' then array['mode','url'] else array['mode'] end else null end;
 if keys is null or exists(select 1 from jsonb_object_keys(j) k where not k=any(keys)) or exists(select 1 from unnest(keys) k where not j ? k) then return false;end if;
 if exists(select 1 from jsonb_each(j) p where p.key not in ('values','attachmentIds') and jsonb_typeof(p.value)<>'string') then return false;end if;
 case step
 when 'cnpj' then return private.valid_cnpj(j->>'value');
 when 'address' then return length(trim(j->>'name')) between 2 and 100 and length(trim(j->>'addressLine')) between 5 and 500 and length(trim(j->>'city')) between 2 and 90 and j->>'uf'=any(array['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO']) and j->>'postalCode' ~ '^[0-9]{8}$' and j->>'businessType' in ('clinic','medical_practice');
 when 'specialty' then
  if jsonb_typeof(j->'values')<>'array' or jsonb_array_length(j->'values') not between 1 and 20 then return false;end if;
  return not exists(select 1 from jsonb_array_elements(j->'values') a where jsonb_typeof(a)<>'string' or length(trim(a#>>'{}')) not between 2 and 100) and (select count(distinct a) from jsonb_array_elements_text(j->'values') a)=jsonb_array_length(j->'values');
 when 'history' then
  if j->>'mode'='text' then return length(trim(j->>'text')) between 20 and 6000;end if;
  return j->>'mode'='pdf' and exists(select 1 from public.onboarding_attachments where company_id=c and id=(j->>'attachmentId')::uuid and mime='application/pdf');
 when 'logo' then
  if j->>'mode'='create' then return j->>'style' in ('Minimalista','Acolhedor','Contemporâneo');end if;
  return j->>'mode'='upload' and exists(select 1 from public.onboarding_attachments where company_id=c and id=(j->>'attachmentId')::uuid and mime in ('image/png','image/jpeg','image/webp'));
 when 'photos' then
  if jsonb_typeof(j->'attachmentIds')<>'array' or jsonb_array_length(j->'attachmentIds')>12 then return false;end if;
  if j->>'mode'='skip' then return jsonb_array_length(j->'attachmentIds')=0;end if;
  if j->>'mode'<>'upload' or jsonb_array_length(j->'attachmentIds')=0 then return false;end if;
  for v in select value from jsonb_array_elements(j->'attachmentIds') loop if jsonb_typeof(v)<>'string' then return false;end if;end loop;
  select count(*) into cnt from public.onboarding_attachments where company_id=c and mime in ('image/png','image/jpeg','image/webp') and id in (select a::uuid from jsonb_array_elements_text(j->'attachmentIds') a);
  return cnt=jsonb_array_length(j->'attachmentIds');
 when 'website' then
  if j->>'mode'='create' then return true;end if;
  return j->>'mode'='existing' and length(j->>'url')<=2000 and j->>'url' ~ '^https://[^/@[:space:]]+([/?#][^[:space:]]*)?$';
 else return false;
 end case;
exception when invalid_text_representation then return false;
end;$$;
create function public.save_medical_intake(p_company_id uuid,p_request_id uuid,p_revision integer,p_step text,p_answer jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.company_onboarding;a jsonb;f jsonb;k text;pair record;fp text;prior public.medical_intake_requests;steps text[]:=array['cnpj','address','specialty','history','logo','photos','website'];new_version integer;
begin
 perform 1 from public.companies where id=p_company_id for update;
 if not coalesce(private.can_company_action(p_company_id,'marketing.write'),false) then raise exception 'Access denied' using errcode='42501';end if;
 select * into s from public.company_onboarding where company_id=p_company_id for update;
 if not found or p_request_id is null or p_step is null or (not p_step=any(steps) and p_step<>'confirm') or p_answer is null then raise exception 'Invalid intake request' using errcode='22023';end if;
 fp:=md5(jsonb_build_object('step',p_step,'answer',p_answer,'revision',p_revision)::text);
 select * into prior from public.medical_intake_requests where company_id=p_company_id and request_id=p_request_id;
 if found then
  if prior.actor_id is distinct from auth.uid() or prior.fingerprint is distinct from fp then raise exception 'Request changed; use a new request' using errcode='40001';end if;
  return public.company_onboarding_read(p_company_id);
 end if;
 if p_revision is null or p_revision<>s.revision then raise exception 'Profile changed; reload before saving' using errcode='40001';end if;
 a:=coalesce(s.medical_intake->'answers','{}'::jsonb);
 foreach k in array steps loop
  exit when k=p_step;
  if not coalesce(private.valid_medical_answer(p_company_id,k,a->k),false) then raise exception 'Complete the previous intake questions' using errcode='22023';end if;
 end loop;
 if p_step='confirm' then
  if p_answer<>'{}'::jsonb then raise exception 'Save answers before confirming' using errcode='22023';end if;
  f:=jsonb_build_object(
   'cnpj',a->'cnpj'->>'value','name',a->'address'->>'name','city',(a->'address'->>'city')||' - '||(a->'address'->>'uf'),'uf',a->'address'->>'uf',
   'businessType',case when a->'address'->>'businessType'='clinic' then 'Clínica' else 'Consultório médico' end,
   'address',(a->'address'->>'addressLine')||' · CEP '||(a->'address'->>'postalCode'),
   'services',(select string_agg(x,', ' order by n) from jsonb_array_elements_text(a->'specialty'->'values') with ordinality t(x,n)),
   'history',case when a->'history'->>'mode'='text' then a->'history'->>'text' else 'História profissional fornecida no currículo PDF privado. Usar o documento, sem inventar qualificações.' end,
   'curriculumAttachmentId',case when a->'history'->>'mode'='pdf' then a->'history'->>'attachmentId' else null end,
   'logoPreference',a->'logo'->>'mode','logoAttachmentId',case when a->'logo'->>'mode'='upload' then a->'logo'->>'attachmentId' else null end,
   'brand',case when a->'logo'->>'mode'='create' then 'Criar proposta de logo com estilo '||(a->'logo'->>'style')||'. Identidade própria da clínica; sujeita a revisão.' else 'Usar o logo anexado e preservar a identidade da clínica.' end,
   'clinicPhotoIds',(a->'photos'->'attachmentIds')::text,
   'websitePreference',a->'website'->>'mode','websiteUrl',case when a->'website'->>'mode'='existing' then a->'website'->>'url' else null end,
   'channels',case when a->'website'->>'mode'='existing' then 'Site: '||(a->'website'->>'url') else 'Criação automática de rascunho de site solicitada; publicação depende de revisão.' end
  );
  for pair in select * from jsonb_each(f) loop
   s.facts:=jsonb_set(s.facts,array[pair.key],jsonb_build_object('value',pair.value,'status',case when pair.value='null'::jsonb then 'unknown' else 'provided' end,'source','user','actorId',auth.uid(),'updatedAt',now()));
  end loop;
  -- Unasked questions remain explicit gaps, not fabricated answers or competitor approvals.
  foreach k in array array['audience','objective','structure','hours','offers','sales','budget','video','management','competitors','references'] loop
   if not s.facts ? k then s.facts:=jsonb_set(s.facts,array[k],jsonb_build_object('value',null,'status','deferred','source','user','actorId',auth.uid(),'updatedAt',now()));end if;
  end loop;
  new_version:=s.profile_version+1;
  insert into public.company_profile_versions(company_id,version,facts,confirmed_by) values(p_company_id,new_version,s.facts,auth.uid());
  if s.profile_version>0 then
   insert into public.company_profile_impacts(company_id,from_version,to_version,reason) values(p_company_id,s.profile_version,new_version,'Cadastro médico atualizado: revisar estratégia e materiais.');
   update public.company_strategy_briefs set status='superseded' where company_id=p_company_id and profile_version<new_version;
  end if;
  s.profile_version:=new_version;s.confirmed_revision:=s.revision+1;s.location_confirmed:=true;
  update public.companies set name=a->'address'->>'name',city=(a->'address'->>'city')||' - '||(a->'address'->>'uf'),segment=a->'address'->>'businessType' where id=p_company_id;
 else
  if not coalesce(private.valid_medical_answer(p_company_id,p_step,p_answer),false) then raise exception 'Invalid medical answer or attachment' using errcode='22023';end if;
  if p_step='cnpj' and a->'cnpj' is distinct from p_answer then a:=a-'address';s.location_confirmed:=false;end if;
  a:=jsonb_set(a,array[p_step],p_answer);s.confirmed_revision:=null;
 end if;
 s.revision:=s.revision+1;
 update public.company_onboarding set revision=s.revision,medical_intake=jsonb_build_object('version',1,'answers',a),facts=s.facts,location_confirmed=s.location_confirmed,confirmed_revision=s.confirmed_revision,profile_version=s.profile_version,updated_at=now() where company_id=p_company_id;
 insert into public.medical_intake_requests(company_id,request_id,actor_id,fingerprint) values(p_company_id,p_request_id,auth.uid(),fp);
 insert into public.onboarding_messages(company_id,role,body,actor_id,request_id) values(p_company_id,'user',case when p_step='confirm' then 'Confirmei as informações do cadastro médico.' else 'Resposta salva no cadastro médico: '||p_step end,auth.uid(),p_request_id);
 insert into public.audit_logs(workspace_id,company_id,actor_id,action,details) select workspace_id,id,auth.uid(),case when p_step='confirm' then 'profile.confirmed' else 'medical_intake.updated' end,jsonb_build_object('step',p_step,'revision',s.revision,'version',s.profile_version) from public.companies where id=p_company_id;
 return public.company_onboarding_read(p_company_id);
end;$$;
revoke all on function private.valid_cnpj(text),private.valid_medical_answer(uuid,text,jsonb) from public,anon,authenticated;
revoke all on function public.save_medical_intake(uuid,uuid,integer,text,jsonb) from public,anon;
grant execute on function public.save_medical_intake(uuid,uuid,integer,text,jsonb) to authenticated;




create table public.company_regional_research(
 id uuid primary key default gen_random_uuid(),company_id uuid not null references public.companies(id),profile_version integer not null,actor_id uuid not null references public.profiles(id),
 status text not null default 'pending' check(status in ('pending','running','ready','failed','stale')),revision integer not null default 1,
 snapshot jsonb,token uuid,lease_until timestamptz,attempts integer not null default 0,next_attempt_at timestamptz not null default now(),error text,updated_at timestamptz not null default now(),
 unique(company_id,profile_version),foreign key(company_id,profile_version) references public.company_profile_versions(company_id,version)
);
alter table public.company_regional_research enable row level security;
revoke all on public.company_regional_research from public,anon,authenticated;
grant select(id,company_id,profile_version,status,revision,snapshot,error,updated_at) on public.company_regional_research to authenticated;
create policy regional_read on public.company_regional_research for select to authenticated using(private.can_company_action(company_id,'marketing.read'));
create function private.regional_review(c uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce((select jsonb_build_object('id',r.id,'status',r.status,'revision',r.revision,'profileVersion',r.profile_version,'data',r.snapshot,'error',r.error) from public.company_regional_research r join public.company_onboarding s on s.company_id=r.company_id and s.profile_version=r.profile_version where r.company_id=c),jsonb_build_object('status','pending','revision',0,'data',null,'error',null))
$$;
create function public.request_regional_research(p_company_id uuid,p_refresh boolean default false) returns void language plpgsql security definer set search_path='' as $$
declare s public.company_onboarding;r public.company_regional_research;
begin
 perform 1 from public.companies where id=p_company_id for update;
 if not coalesce(private.can_company_action(p_company_id,'marketing.write'),false) then raise exception 'Access denied' using errcode='42501';end if;
 perform private.require_ai_access(p_company_id);
 select * into s from public.company_onboarding where company_id=p_company_id;
 if s.medical_intake is null or s.profile_version<1 or s.confirmed_revision is distinct from s.revision then raise exception 'Confirm the medical profile first' using errcode='22023';end if;
 select * into r from public.company_regional_research where company_id=p_company_id and profile_version=s.profile_version for update;
 if found then
  if r.status in ('pending','running') or (r.status='ready' and not p_refresh) then return;end if;
  if r.updated_at>now()-interval '5 minutes' then raise exception 'Aguarde cinco minutos antes de atualizar a coleta.' using errcode='22023';end if;
  update public.company_regional_research set status='pending',snapshot=null,revision=revision+1,actor_id=auth.uid(),attempts=0,token=null,lease_until=null,next_attempt_at=now(),error=null,updated_at=now() where id=r.id;
 else
  insert into public.company_regional_research(company_id,profile_version,actor_id) values(p_company_id,s.profile_version,auth.uid());
 end if;
 insert into public.audit_logs(workspace_id,company_id,actor_id,action,details) select workspace_id,id,auth.uid(),'regional.requested',jsonb_build_object('profileVersion',s.profile_version,'refresh',p_refresh) from public.companies where id=p_company_id;
end;$$;
create function private.regional_actor(r public.company_regional_research) returns boolean language plpgsql security definer set search_path='' as $$
declare previous text;allowed boolean;
begin
 previous:=current_setting('request.jwt.claim.sub',true);perform set_config('request.jwt.claim.sub',r.actor_id::text,true);
 allowed:=coalesce(private.can_company_action(r.company_id,'marketing.write'),false) and private.company_ai_access(r.company_id) and exists(select 1 from public.company_onboarding where company_id=r.company_id and profile_version=r.profile_version and confirmed_revision=revision);
 perform set_config('request.jwt.claim.sub',coalesce(previous,''),true);return allowed;
end;$$;
create function public.claim_regional_research_server() returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.company_regional_research;t uuid:=gen_random_uuid();
begin
 select * into r from public.company_regional_research where private.company_ai_access(company_id) and ((status='pending' and next_attempt_at<=now()) or (status='running' and lease_until<now())) order by next_attempt_at limit 1;
 if not found then return null;end if;
 perform 1 from public.companies where id=r.company_id for update skip locked;if not found then return null;end if;
 select * into r from public.company_regional_research where id=r.id and ((status='pending' and next_attempt_at<=now()) or (status='running' and lease_until<now())) for update skip locked;if not found then return null;end if;
 if not private.regional_actor(r) then update public.company_regional_research set status='stale',token=null,error='O perfil ou as permissões mudaram.',updated_at=now() where id=r.id;return null;end if;
 if r.attempts>=3 then update public.company_regional_research set status='failed',token=null,error='A coleta não concluiu. Tente atualizar mais tarde.',updated_at=now() where id=r.id;return null;end if;
 update public.company_regional_research set status='running',token=t,lease_until=now()+interval '3 minutes',attempts=attempts+1,updated_at=now() where id=r.id;
 return jsonb_build_object('id',r.id,'companyId',r.company_id,'actorId',r.actor_id,'profileVersion',r.profile_version,'token',t,'facts',(select facts from public.company_profile_versions where company_id=r.company_id and version=r.profile_version));
end;$$;
create function public.finish_regional_research_server(p_id uuid,p_token uuid,p_snapshot jsonb) returns boolean language plpgsql security definer set search_path='' as $$
declare r public.company_regional_research;k text;
begin
 select * into r from public.company_regional_research where id=p_id;if not found then return false;end if;
 perform 1 from public.companies where id=r.company_id for update;
 select * into r from public.company_regional_research where id=p_id and token=p_token and status='running' and lease_until>now() for update;if not found then return false;end if;
 if not private.regional_actor(r) then update public.company_regional_research set status='stale',token=null,error='O perfil ou as permissões mudaram durante a coleta.',updated_at=now() where id=r.id;return false;end if;
 if p_snapshot is not null then
  if jsonb_typeof(p_snapshot)<>'object' or length(p_snapshot::text)>150000 then raise exception 'Invalid regional evidence' using errcode='22023';end if;
  foreach k in array array['ibge','facebook','trends'] loop
   if coalesce(p_snapshot->k->>'state','') not in ('available','unavailable','unconfigured','pending','forbidden') then raise exception 'Provider state required' using errcode='22023';end if;
  end loop;
 end if;
 update public.company_regional_research set status=case when p_snapshot is not null then 'ready' when attempts<3 then 'pending' else 'failed' end,snapshot=p_snapshot,token=null,lease_until=null,next_attempt_at=now()+interval '1 minute',error=case when p_snapshot is null then 'A coleta não concluiu. Seus dados estão salvos.' else null end,updated_at=now() where id=r.id;
 return true;
end;$$;
revoke all on function private.regional_review(uuid),private.regional_actor(public.company_regional_research),public.claim_regional_research_server(),public.finish_regional_research_server(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.claim_regional_research_server(),public.finish_regional_research_server(uuid,uuid,jsonb) to service_role;
revoke all on function public.request_regional_research(uuid,boolean) from public,anon;
grant execute on function public.request_regional_research(uuid,boolean) to authenticated;
alter table public.company_visual_jobs drop constraint company_visual_jobs_kind_check;
alter table public.company_visual_jobs add constraint company_visual_jobs_kind_check check(kind in ('site_image','campaign_creative','brand_logo'));
create unique index one_logo_per_profile on public.company_visual_jobs(company_id,profile_version) where kind='brand_logo';

create or replace function private.journey_basis(c uuid,n integer) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v integer;data jsonb;prev jsonb;
begin
 select profile_version into v from public.company_onboarding where company_id=c;
 select coalesce(jsonb_agg(jsonb_build_object('stage',stage,'token',token) order by stage),'[]'::jsonb) into prev from public.company_marketing_approvals where company_id=c and profile_version=v and stage<n;
 if n=1 then
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'username',username,'label',label,'kind',kind) order by id),'[]'::jsonb) into data from public.company_instagram_watches where company_id=c;
  if exists(select 1 from public.company_competitor_research where company_id=c and status<>'stale') then
 select jsonb_build_object('profiles',coalesce((select jsonb_agg(jsonb_build_object('id',id,'username',username,'label',label,'kind',kind,'placeId',place_id) order by id) from public.company_instagram_watches where company_id=c),'[]'::jsonb),'localCompetitors',coalesce((select jsonb_agg(jsonb_build_object('placeId',place_id,'label',label,'city',city,'username',selected_username) order by place_id) from public.company_competitor_research where company_id=c and status<>'stale'),'[]'::jsonb)) into data;
  end if;
 elsif n=2 then select jsonb_build_object('id',id,'generation',generation,'output',output,'analysisCurrent',competitor_review_token is not distinct from (select token from public.company_marketing_approvals where company_id=c and profile_version=v and stage=1)) into data from public.company_strategy_briefs where company_id=c and profile_version=v;
 elsif n=3 then select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'date',i.planned_date,'idea',i.idea,'direction',i.direction,'format',i.format) order by i.position),'[]'::jsonb) into data from public.company_calendar_items i join public.company_strategy_briefs b on b.id=i.brief_id and b.generation=i.generation where i.company_id=c and b.profile_version=v;
 else select case when n=4 then jsonb_build_object('whatsapp',output->'whatsapp','messages',output->'messages') else output->'traffic' end into data from public.company_launch_jobs where company_id=c and profile_version=v and kind='recommendations' and status='completed';end if;
 if n=1 and exists(select 1 from public.company_onboarding where company_id=c and medical_intake is not null) then data:=jsonb_build_object('regional',private.regional_review(c));end if;
 return jsonb_build_object('profileVersion',v,'previous',prev,'data',data);
end;$$;
create or replace function public.approve_marketing_stage(p_company_id uuid,p_stage integer,p_basis text,p_limitations text default '',p_evidence_basis text default null) returns void language plpgsql security definer set search_path='' as $$
declare s public.company_onboarding;b jsonb;snap jsonb;brief public.company_strategy_briefs;
begin
 perform 1 from public.companies where id=p_company_id for update;
 if not coalesce(private.can_company_action(p_company_id,'strategy.approve'),false) then raise exception 'Approval permission required' using errcode='42501';end if;
 select * into s from public.company_onboarding where company_id=p_company_id;
 if p_stage is null or p_stage not between 1 and 5 or s.profile_version<1 or s.confirmed_revision is distinct from s.revision then raise exception 'Confirm current profile' using errcode='22023';end if;
 if p_stage>1 and not private.journey_valid(p_company_id,p_stage-1) then raise exception 'Approve previous stages first' using errcode='40001';end if;
 if p_stage=1 and s.medical_intake is null and p_evidence_basis is distinct from md5(private.competitor_review(p_company_id)::text) then raise exception 'A coleta mudou. Revise os dados atualizados antes de aprovar.' using errcode='40001';end if;
 b:=private.journey_basis(p_company_id,p_stage);if p_basis is distinct from md5(b::text) then raise exception 'Proposal changed; review current version' using errcode='40001';end if;
 -- Repeating the approval of an unchanged version must not invalidate downstream work.
 if private.journey_valid(p_company_id,p_stage) and exists(select 1 from public.company_marketing_approvals a where a.company_id=p_company_id and a.profile_version=s.profile_version and a.stage=p_stage and a.basis=p_basis) then return;end if;
 if p_stage=1 then
  if s.medical_intake is not null then
   if b->'data'->'regional'->>'status' is distinct from 'ready' then raise exception 'Aguarde a coleta regional antes de aprovar.' using errcode='22023';end if;
   if (b->'data'->'regional'->'data'->'ibge'->>'state' is distinct from 'available' or b->'data'->'regional'->'data'->'facebook'->>'state' is distinct from 'available' or b->'data'->'regional'->'data'->'trends'->>'state' is distinct from 'available') and length(trim(coalesce(p_limitations,'')))<10 then raise exception 'Registre as fontes indisponíveis antes de continuar.' using errcode='22023';end if;
   if length(coalesce(p_limitations,''))>1000 then raise exception 'Invalid limitation' using errcode='22023';end if;
   snap:=jsonb_build_object('regional',b->'data'->'regional','limitations',p_limitations,'profiles','[]'::jsonb);
  else
  if (exists(select 1 from public.company_competitor_research where company_id=p_company_id and status<>'stale' and selected_username is null) or not exists(select 1 from public.company_instagram_watches where company_id=p_company_id) or exists(select 1 from public.company_instagram_watches where company_id=p_company_id and snapshot is null)) and length(trim(coalesce(p_limitations,'')))<10 then raise exception 'Review missing competitor data explicitly' using errcode='22023';end if;
  if length(coalesce(p_limitations,''))>1000 then raise exception 'Invalid limitation' using errcode='22023';end if;
  select jsonb_build_object('profiles',coalesce(jsonb_agg(jsonb_build_object('username',username,'label',label,'kind',kind,'snapshot',snapshot) order by id),'[]'::jsonb),'limitations',p_limitations) into snap from public.company_instagram_watches where company_id=p_company_id;
 snap:=snap||jsonb_build_object('localCompetitors',coalesce(b->'data'->'localCompetitors','[]'::jsonb));

  end if;
 elsif p_stage=2 then
  select * into brief from public.company_strategy_briefs where company_id=p_company_id and profile_version=s.profile_version;
  if brief.competitor_review_token is distinct from (select token from public.company_marketing_approvals where company_id=p_company_id and profile_version=s.profile_version and stage=1) then raise exception 'A análise mudou. Gere um novo diagnóstico.' using errcode='40001';end if;
  if brief.output is null or brief.status not in ('review','approved') then raise exception 'Strategy not ready' using errcode='22023';end if;
  update public.company_launch_jobs set status='pending',attempts=0,output=null,token=null,next_attempt_at=now(),updated_at=now() where company_id=p_company_id and profile_version=s.profile_version and kind='recommendations' and status in ('completed','stale','failed');
  if brief.status='review' then perform public.approve_company_strategy(p_company_id,brief.id,brief.generation);end if;snap:=b->'data';
 elsif p_stage=3 then
  if jsonb_array_length(b->'data')=0 or exists(select 1 from jsonb_array_elements(b->'data') x where nullif(x->>'date','') is null or (x->>'date')::date<(now() at time zone 'America/Sao_Paulo')::date+7) then raise exception 'Plan dates at least seven days ahead' using errcode='22023';end if;snap:=b->'data';
 else if p_stage=5 and exists(select 1 from public.company_calendar_items i join public.company_strategy_briefs x on x.id=i.brief_id and x.generation=i.generation where i.company_id=p_company_id and x.profile_version=s.profile_version and i.planned_date<(now() at time zone 'America/Sao_Paulo')::date+7) then raise exception 'Atualize as primeiras datas para reservar sete dias de produção e revisão.' using errcode='22023';end if;
  if b->'data' is null or b->'data'='null'::jsonb then raise exception 'Suggestions not ready' using errcode='22023';end if;snap:=b->'data';end if;
 insert into public.company_marketing_approvals(company_id,profile_version,stage,basis,snapshot,approved_by) values(p_company_id,s.profile_version,p_stage,p_basis,snap,auth.uid())
 on conflict(company_id,profile_version,stage) do update set basis=excluded.basis,snapshot=excluded.snapshot,token=gen_random_uuid(),approved_by=auth.uid(),approved_at=now();
 update public.company_content_preparations set next_attempt_at=now(),updated_at=now() where company_id=p_company_id and profile_version=s.profile_version and status='pending';
 update public.company_launch_jobs set next_attempt_at=now(),updated_at=now() where company_id=p_company_id and profile_version=s.profile_version and status='pending';
 insert into public.audit_logs(workspace_id,company_id,actor_id,action,details) select workspace_id,id,auth.uid(),'marketing.stage.approved',jsonb_build_object('stage',p_stage,'profileVersion',s.profile_version,'basis',p_basis) from public.companies where id=p_company_id;
end;$$;
create or replace function public.enqueue_company_launch(p_company_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare s public.company_onboarding;
begin
 perform 1 from public.companies where id=p_company_id for update;
 if not coalesce(private.can_company_action(p_company_id,'marketing.write'),false) then raise exception 'Access denied' using errcode='42501';end if;
 select * into s from public.company_onboarding where company_id=p_company_id;
 if s.profile_version<1 or s.confirmed_revision is distinct from s.revision then raise exception 'Confirm the current profile first' using errcode='22023';end if;
 insert into public.company_launch_jobs(company_id,profile_version,actor_id,kind) select p_company_id,s.profile_version,auth.uid(),k from unnest(array['site','recommendations']) k where k<>'site' or s.medical_intake is null or s.facts->'websitePreference'->>'value'='create' on conflict do nothing;
 update public.company_launch_jobs set status='pending',attempts=0,actor_id=auth.uid(),token=null,lease_until=null,next_attempt_at=now(),error=null,updated_at=now() where company_id=p_company_id and profile_version=s.profile_version and status in ('failed','stale');
 if s.medical_intake is not null then
  if s.facts->'logoPreference'->>'value'='create' then
   insert into public.company_visual_jobs(id,company_id,actor_id,profile_version,kind,instructions,ratio,request)
   values(gen_random_uuid(),p_company_id,auth.uid(),s.profile_version,'brand_logo',coalesce(s.facts->'brand'->>'value','Criar uma proposta de logo própria para a clínica.'),'1:1',jsonb_build_object('origin','medical_intake','profileVersion',s.profile_version))
   on conflict(company_id,profile_version) where kind='brand_logo' do nothing;
   update public.company_visual_jobs set status='pending',actor_id=auth.uid(),attempts=0,token=null,lease_until=null,error=null,next_attempt_at=now(),updated_at=now() where company_id=p_company_id and profile_version=s.profile_version and kind='brand_logo' and status in ('failed','stale') and result_attachment_id is null;
  end if;
  if private.company_ai_access(p_company_id) then perform public.request_regional_research(p_company_id,false);end if;
 end if;
end;$$;
create or replace function public.finish_visual_job_server(p_id uuid,p_token uuid,p_result jsonb) returns boolean language plpgsql security definer set search_path='' as $$
declare j public.company_visual_jobs;s public.company_onboarding;path text;asset uuid;
begin
 select * into j from public.company_visual_jobs where id=p_id;if not found then return false;end if;
 perform 1 from public.companies where id=j.company_id for update;
 select * into j from public.company_visual_jobs where id=p_id and status='running' and token=p_token and lease_until>now() for update;if not found then return false;end if;
 perform set_config('request.jwt.claim.sub',j.actor_id::text,true);select * into s from public.company_onboarding where company_id=j.company_id;
 if not private.company_ai_access(j.company_id) or not coalesce(private.can_company_action(j.company_id,'marketing.write'),false) or s.profile_version<>j.profile_version or s.confirmed_revision is distinct from s.revision or (j.kind='campaign_creative' and not private.journey_valid(j.company_id,5)) then update public.company_visual_jobs set status='stale',token=null,error='A versão ou autorização mudou durante a geração.' where id=j.id;return false;end if;
 if p_result is null then update public.company_visual_jobs set status=case when attempts<3 then 'pending' else 'failed' end,token=null,next_attempt_at=now()+interval '1 minute',error='O provedor não concluiu a imagem. O original foi preservado.',updated_at=now() where id=j.id;return true;end if;
 asset:=(p_result->>'attachmentId')::uuid;path:=j.company_id::text||'/onboarding/'||asset::text||case p_result->>'mime' when 'image/jpeg' then '.jpg' when 'image/png' then '.png' when 'image/webp' then '.webp' else '' end;
 if asset is null or p_result->>'mime' not in ('image/jpeg','image/png','image/webp') or (p_result->>'size')::integer not between 1 and 10485760 or not exists(select 1 from storage.objects where bucket_id='company-assets' and name=path) then raise exception 'Stored image required' using errcode='22023';end if;
 insert into public.onboarding_attachments(id,company_id,name,mime,size,object_path,uploaded_by) values(asset,j.company_id,case j.kind when 'site_image' then 'Foto editada' when 'brand_logo' then 'Logo proposto · revisar antes de usar' else 'Criativo da campanha' end||' · '||j.ratio||' · '||left(j.id::text,8),p_result->>'mime',(p_result->>'size')::integer,path,j.actor_id);
 update public.company_visual_jobs set status='completed',token=null,result_attachment_id=asset,model=left(p_result->>'model',100),provider_usage=nullif(p_result->'usage','null'::jsonb),image_quality=left(p_result->>'quality',20),image_size=left(p_result->>'dimensions',30),error=null,updated_at=now() where id=j.id;
 insert into public.audit_logs(workspace_id,company_id,actor_id,action,details) select workspace_id,id,j.actor_id,'visual.completed',jsonb_build_object('jobId',j.id,'kind',j.kind,'attachmentId',asset,'sourceId',j.source_attachment_id) from public.companies where id=j.company_id;
 return true;
end;$$;
create or replace function public.save_company_onboarding(p_company_id uuid,p_request_id uuid,p_revision integer,p_message text,p_patch jsonb,p_action text default 'reply',p_source text default 'user') returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.company_onboarding;pair record;f jsonb;new_version integer;k text;location_changed boolean=false;
begin
 perform 1 from public.companies where id=p_company_id for update;
 if not coalesce(private.can_company_action(p_company_id,'marketing.write'),false) then raise exception 'Access denied' using errcode='42501';end if;
 select * into s from public.company_onboarding where company_id=p_company_id for update;
 if s.medical_intake is not null then raise exception 'Continue pelo formulário do cadastro médico.' using errcode='22023';end if;
 if p_request_id is null then raise exception 'Request ID required' using errcode='22023';end if;
 if exists(select 1 from public.onboarding_messages where company_id=p_company_id and request_id=p_request_id and role='user') then return public.company_onboarding_read(p_company_id);end if;
 if p_revision is null or s.revision<>p_revision then raise exception 'Profile changed; reload before saving' using errcode='40001';end if;
 if p_message is null or length(trim(p_message)) not between 1 and 6000 or p_patch is null or jsonb_typeof(p_patch)<>'object' or length(p_patch::text)>40000 or p_action is null or p_action not in ('reply','confirm_location','review_competitors','review_references','edit','confirm','reopen') or p_source is null or p_source not in ('user','assistant_suggestion') then raise exception 'Invalid reply' using errcode='22023';end if;
 if p_action='confirm' and p_patch<>'{}'::jsonb then raise exception 'Save edits before confirming' using errcode='22023';end if;
 for pair in select * from jsonb_each(p_patch) loop
  if pair.key not in ('name','city','businessType','address','services','audience','objective','structure','hours','offers','sales','history','budget','brand','channels','video','management','competitors','references','placeId','competitorPlaceIds') or jsonb_typeof(pair.value)<>'object' or coalesce(pair.value->>'status','') not in ('provided','unknown','deferred') then raise exception 'Invalid fact' using errcode='22023';end if;
  if (pair.value->>'status'='provided' and (jsonb_typeof(pair.value->'value')<>'string' or length(trim(coalesce(pair.value->>'value',''))) not between 1 and 6000)) or (pair.key in ('name','city','businessType') and length(coalesce(pair.value->>'value',''))>100) then raise exception 'Invalid fact value' using errcode='22023';end if;
  if pair.key in ('city','address','placeId') and coalesce(s.facts->pair.key->>'value','')<>coalesce(pair.value->>'value','') then location_changed=true;end if;
  f=jsonb_build_object('value',case when pair.value->>'status'='provided' then pair.value->>'value' else null end,'status',pair.value->>'status','source',p_source,'updatedAt',now(),'actorId',auth.uid());
  s.facts=jsonb_set(s.facts,array[pair.key],f);
 end loop;
 if location_changed then s.location_confirmed=false;s.competitors_reviewed=false;end if;
 if p_action='confirm_location' then
  if coalesce(s.facts->'name'->>'status','')<>'provided' or coalesce(s.facts->'city'->>'status','')<>'provided' then raise exception 'Name and region required' using errcode='22023';end if;
  s.location_confirmed=true;
 elsif p_action='review_competitors' then
  if not s.location_confirmed then raise exception 'Confirm location first' using errcode='22023';end if;s.competitors_reviewed=true;
 elsif p_action='review_references' then
  if not s.competitors_reviewed then raise exception 'Review local competitors first' using errcode='22023';end if;s.references_reviewed=true;
 elsif p_action='confirm' then
  if not s.location_confirmed or not s.competitors_reviewed or not s.references_reviewed then raise exception 'Review location, competitors and references' using errcode='22023';end if;
  foreach k in array array['name','city','businessType','services','audience','objective'] loop
   if coalesce(s.facts->k->>'status','')<>'provided' or trim(coalesce(s.facts->k->>'value',''))='' then raise exception 'Missing essential profile fact: %',k using errcode='22023';end if;
  end loop;
  new_version=s.profile_version+1;
  insert into public.company_profile_versions(company_id,version,facts,confirmed_by) values(p_company_id,new_version,s.facts,auth.uid());
  if s.profile_version>0 then
   insert into public.company_profile_impacts(company_id,from_version,to_version,reason) values(p_company_id,s.profile_version,new_version,'Perfil atualizado: revisar estratégia e materiais sem alterar aprovações.');
   update public.company_strategy_briefs set status='superseded' where company_id=p_company_id and profile_version<new_version;
  end if;
  s.profile_version=new_version;s.confirmed_revision=s.revision+1;
 else s.confirmed_revision=null;
 end if;
 s.revision=s.revision+1;
 update public.company_onboarding set revision=s.revision,facts=s.facts,location_confirmed=s.location_confirmed,competitors_reviewed=s.competitors_reviewed,references_reviewed=s.references_reviewed,confirmed_revision=s.confirmed_revision,profile_version=s.profile_version,updated_at=now() where company_id=p_company_id;
 if s.facts->'name'->>'status'='provided' then update public.companies set name=s.facts->'name'->>'value',city=coalesce(s.facts->'city'->>'value',city),segment=case when lower(s.facts->'businessType'->>'value') like '%academia%' then 'gym' when lower(s.facts->'businessType'->>'value') similar to '%(estúdio|estudio|studio|pilates)%' then 'studio' else segment end where id=p_company_id;end if;
 insert into public.onboarding_messages(company_id,role,body,actor_id,request_id) values(p_company_id,'user',trim(p_message),auth.uid(),p_request_id),(p_company_id,'assistant',private.onboarding_prompt(private.onboarding_step(s)),null,p_request_id);
 insert into public.audit_logs(workspace_id,company_id,actor_id,action,details) select workspace_id,id,auth.uid(),case when p_action='confirm' then 'profile.confirmed' else 'onboarding.updated' end,jsonb_build_object('revision',s.revision,'version',s.profile_version,'action',p_action) from public.companies where id=p_company_id;
 return public.company_onboarding_read(p_company_id);
end;$$;
notify pgrst,'reload schema';
commit;
