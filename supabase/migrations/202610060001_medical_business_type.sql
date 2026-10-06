-- First choose clinic or medical practice. No existing rows or confirmed versions are rewritten.
begin;
create or replace function private.valid_medical_answer(c uuid,step text,j jsonb) returns boolean language plpgsql stable security definer set search_path='' as $$
declare keys text[];v jsonb;cnt integer;
begin
 if j is null or jsonb_typeof(j)<>'object' or length(j::text)>15000 then return false;end if;
 keys:=case step when 'businessType' then array['value'] when 'cnpj' then array['value'] when 'address' then array['name','addressLine','city','uf','postalCode','businessType'] when 'specialty' then array['values'] when 'history' then case when j->>'mode'='pdf' then array['mode','attachmentId'] else array['mode','text'] end when 'logo' then case when j->>'mode'='upload' then array['mode','attachmentId'] else array['mode','style'] end when 'photos' then array['mode','attachmentIds'] when 'website' then case when j->>'mode'='existing' then array['mode','url'] else array['mode'] end else null end;
 if keys is null or exists(select 1 from jsonb_object_keys(j) k where not k=any(keys)) or exists(select 1 from unnest(keys) k where not j ? k) then return false;end if;
 if exists(select 1 from jsonb_each(j) p where p.key not in ('values','attachmentIds') and jsonb_typeof(p.value)<>'string') then return false;end if;
 case step
 when 'businessType' then return j->>'value' in ('clinic','medical_practice');
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
create or replace function public.save_medical_intake(p_company_id uuid,p_request_id uuid,p_revision integer,p_step text,p_answer jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.company_onboarding;a jsonb;f jsonb;k text;pair record;fp text;prior public.medical_intake_requests;steps text[]:=array['businessType','cnpj','address','specialty','history','logo','photos','website'];new_version integer;
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
 -- Derive legacy choices only during an authorized save, preserving confirmed history.
 if not a ? 'businessType' and coalesce(private.valid_medical_answer(p_company_id,'address',a->'address'),false) then
  a:=jsonb_set(a,array['businessType'],jsonb_build_object('value',a->'address'->>'businessType'));
 end if;
 foreach k in array steps loop
  exit when k=p_step;
  if not coalesce(private.valid_medical_answer(p_company_id,k,a->k),false) then raise exception 'Complete the previous intake questions' using errcode='22023';end if;
 end loop;
 if p_step='confirm' then
  if p_answer<>'{}'::jsonb then raise exception 'Save answers before confirming' using errcode='22023';end if;
  f:=jsonb_build_object(
   'cnpj',a->'cnpj'->>'value','name',a->'address'->>'name','city',(a->'address'->>'city')||' - '||(a->'address'->>'uf'),'uf',a->'address'->>'uf',
   'businessType',case when a->'businessType'->>'value'='clinic' then 'Clínica' else 'Consultório médico' end,
   'address',(a->'address'->>'addressLine')||' · CEP '||(a->'address'->>'postalCode'),
   'services',(select string_agg(x,', ' order by n) from jsonb_array_elements_text(a->'specialty'->'values') with ordinality t(x,n)),
   'history',case when a->'history'->>'mode'='text' then a->'history'->>'text' else 'História profissional fornecida no currículo PDF privado. Usar o documento, sem inventar qualificações.' end,
   'curriculumAttachmentId',case when a->'history'->>'mode'='pdf' then a->'history'->>'attachmentId' else null end,
   'logoPreference',a->'logo'->>'mode','logoAttachmentId',case when a->'logo'->>'mode'='upload' then a->'logo'->>'attachmentId' else null end,
   'brand',case when a->'logo'->>'mode'='create' then 'Criar proposta de logo com estilo '||(a->'logo'->>'style')||'. Identidade própria '||(case when a->'businessType'->>'value'='clinic' then 'da clínica' else 'do consultório' end)||'; sujeita a revisão.' else 'Usar o logo anexado e preservar a identidade '||(case when a->'businessType'->>'value'='clinic' then 'da clínica' else 'do consultório' end)||'.' end,
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
  update public.companies set name=a->'address'->>'name',city=(a->'address'->>'city')||' - '||(a->'address'->>'uf'),segment=a->'businessType'->>'value' where id=p_company_id;
 else
  if not coalesce(private.valid_medical_answer(p_company_id,p_step,p_answer),false) then raise exception 'Invalid medical answer or attachment' using errcode='22023';end if;
  if p_step='address' and (p_answer->>'businessType') is distinct from (a->'businessType'->>'value') then raise exception 'Address type must match the first answer' using errcode='22023';end if;
  if p_step='businessType' and a ? 'address' then a:=jsonb_set(a,array['address','businessType'],p_answer->'value');end if;
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
revoke all on function private.valid_medical_answer(uuid,text,jsonb) from public,anon,authenticated;
revoke all on function public.save_medical_intake(uuid,uuid,integer,text,jsonb) from public,anon;
grant execute on function public.save_medical_intake(uuid,uuid,integer,text,jsonb) to authenticated;
commit;
