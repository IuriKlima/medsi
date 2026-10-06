-- MedSI: additive segments and medical onboarding. No existing customer data rewritten.
begin;
alter table public.companies drop constraint companies_segment_check;
alter table public.companies add constraint companies_segment_check check (segment in ('clinic','medical_practice','gym','studio','other'));
create or replace function private.onboarding_prompt(p_step text) returns text language sql immutable set search_path='' as $$
 select case p_step when 'identity' then 'Qual é o nome da sua clínica ou consultório?'
 when 'city' then 'Em qual cidade fica sua clínica? Se puder, informe também o estado.'
 when 'businessType' then 'Que tipo de negócio é o seu: clínica, consultório médico ou outra atividade de saúde?'
 when 'location' then 'Vamos confirmar a localização da empresa. Informe o endereço ou a região atendida. Você pode conferir as opções no Google ou continuar manualmente.'
 when 'competitors' then 'Agora vamos conhecer os concorrentes locais. Revise os resultados da pesquisa ou indique quem disputa o mesmo público na sua região.'
 when 'references' then 'Quais marcas ou empresas você admira, mesmo de outras regiões? Conte o que gosta na comunicação, oferta, estética ou atendimento delas.'
 when 'services' then 'Quais especialidades, consultas e serviços sua clínica ou consultório oferece?'
 when 'audience' then 'Quem você quer atrair? Conte sobre o público, suas necessidades e principais objeções.'
 when 'objective' then 'Qual é o principal objetivo do marketing agora? Se souber, inclua uma meta e quantas pessoas sua equipe consegue atender.'
 when 'structure' then 'O que diferencia sua empresa? Conte sobre instalações, equipe, acessibilidade e diferenciais verificáveis. Informe também a identificação profissional autorizada: nome, CRM/UF e RQE quando aplicável, e responsável técnico da clínica. Não envie dados de pacientes.'
 when 'hours' then 'Quais são os horários de funcionamento e os períodos que precisam de mais movimento?'
 when 'offers' then 'Quais valores, convênios e condições de atendimento podemos informar? Inclua apenas dados que sua equipe autorizou divulgar. O que não souber fica pendente.'
 when 'sales' then 'Como funciona o atendimento de uma pessoa interessada? Conte quem responde, em quais horários, como ela solicita uma consulta e quem confirma o agendamento.'
 when 'history' then 'O que sua clínica ou consultório já fez de marketing? Conte o que funcionou e o que gostaria de mudar.'
 when 'budget' then 'Existe um orçamento disponível para anúncios? Informar um valor aqui não autoriza nenhum gasto.'
 when 'brand' then 'Como sua marca deve se apresentar? Conte sobre cores, estilo e tom de voz. Você pode anexar logo, fotos e materiais autorizados agora ou depois.'
 when 'channels' then 'Sua empresa tem site, Instagram, Facebook ou WhatsApp? Informe os endereços ou diga quais ainda precisa criar. Conecte as contas no painel desta etapa para autorizar o acesso.'
 when 'video' then 'Sua equipe consegue gravar vídeos? Quem seria responsável e com qual frequência? Conteúdos estáticos também são uma opção.'
 when 'management' then 'Qual sistema de gestão sua empresa utiliza? Essa informação ajuda a planejar uma futura integração, sem conectar nada automaticamente.'
 when 'review' then 'Confira o resumo do seu negócio. Corrija o que precisar e confirme apenas as informações que podem orientar o trabalho dos agentes.'
 when 'complete' then 'Seu perfil está confirmado. Vamos revisar os concorrentes e aprovar sua estratégia por etapas. Depois das aprovações, a MedSI prepara as entregas.' else 'Confira o resumo do seu negócio. Corrija o que precisar e confirme apenas as informações que podem orientar o trabalho dos agentes.' end;
$$;
create or replace function private.seed_company_onboarding() returns trigger language plpgsql security definer set search_path='' as $$
declare f jsonb='{}';
begin
 if new.name<>'Nova empresa' then
 f=jsonb_build_object('name',jsonb_build_object('value',new.name,'status','provided','source','existing','actorId',null,'updatedAt',now()),'businessType',jsonb_build_object('value',case new.segment when 'clinic' then 'Clínica' when 'medical_practice' then 'Consultório médico' when 'gym' then 'Academia' when 'studio' then 'Estúdio' else 'Outro' end,'status','provided','source','existing','actorId',null,'updatedAt',now()));
 if trim(coalesce(new.city,''))<>'' then f=f||jsonb_build_object('city',jsonb_build_object('value',new.city,'status','provided','source','existing','actorId',null,'updatedAt',now()));end if;
 end if;
 insert into public.company_onboarding(company_id,facts) values(new.id,f) on conflict do nothing;
 insert into public.onboarding_messages(company_id,role,body) select new.id,'assistant',private.onboarding_prompt(private.onboarding_step(s)) from public.company_onboarding s where s.company_id=new.id;
 return new;
end;$$;
create or replace function private.sync_medical_segment() returns trigger language plpgsql security definer set search_path='' as $$
declare kind text; target_segment text;
begin
 if new.facts->'businessType' is not distinct from old.facts->'businessType' then return new;end if;
 if new.facts->'businessType'->>'status'<>'provided' then return new;end if;
 kind=translate(lower(new.facts->'businessType'->>'value'),'áàâãéêíóôõúç','aaaaeeiooouc');
 target_segment=case when kind like '%clinica%' then 'clinic' when kind similar to '%(consultorio|medico|medica)%' then 'medical_practice' else null end;
 if target_segment is not null then update public.companies set segment=target_segment where id=new.company_id and segment is distinct from target_segment;end if;
 return new;
end;$$;
revoke all on function private.sync_medical_segment() from public,anon,authenticated;
create trigger sync_medical_segment after update of facts on public.company_onboarding for each row execute function private.sync_medical_segment();
-- Rename only the known catalog labels; preserve IDs, prices, features and subscriptions.
update public.plan_catalog set name='MedSI Mensal' where id='askadia_monthly' and name='Askadia Mensal';
update public.plan_catalog set name='MedSI Anual · 12 parcelas' where id='askadia_annual' and name='Askadia Anual · 12 parcelas';
update public.plan_catalog set name='MedSI Semestral · até 6 parcelas' where id='askadia_semiannual' and name='Askadia Semestral · até 6 parcelas';
commit;
