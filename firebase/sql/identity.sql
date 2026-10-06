-- Applied after the application migrations; trusted Firebase tokens are verified
-- in the API before calling this function. No email-based account merging.
set role medsi_owner;
create table if not exists auth.firebase_identities(firebase_uid text primary key,user_id uuid not null unique references auth.users(id),created_at timestamptz not null default now(),check(length(firebase_uid) between 1 and 128));
create or replace function public.ensure_firebase_identity_server(p_uid text,p_email text,p_name text) returns uuid language plpgsql security definer set search_path='' as $$
declare identity uuid;
begin
 if length(p_uid) not between 1 and 128 or nullif(trim(p_email),'') is null or length(p_email)>320 then raise exception 'Invalid Firebase identity' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('firebase-identity:'||p_uid,0));
 select user_id into identity from auth.firebase_identities where firebase_uid=p_uid;
 if identity is null then
  identity:=gen_random_uuid();
  insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values(identity,p_email,now(),jsonb_build_object('name',left(coalesce(p_name,'Usuário'),100)));
  insert into public.profiles(id,display_name) values(identity,left(coalesce(p_name,'Usuário'),100)) on conflict(id) do nothing;
  insert into auth.firebase_identities(firebase_uid,user_id) values(p_uid,identity);
 else update auth.users set email=p_email,email_confirmed_at=coalesce(email_confirmed_at,now()) where id=identity;end if;
 return identity;
end;$$;
revoke all on auth.firebase_identities from public,anon,authenticated;
revoke all on function public.ensure_firebase_identity_server(text,text,text) from public,anon,authenticated;
grant execute on function public.ensure_firebase_identity_server(text,text,text) to service_role;
reset role;
