-- Firebase/Cloud SQL foundation. Run only in the selected MedSI database.
-- medsi_owner owns application objects; service_role inherits ownership, avoiding
-- a Cloud SQL superuser/BYPASSRLS requirement. End-user requests SET LOCAL ROLE authenticated.
do $$ begin
 if not exists(select 1 from pg_roles where rolname='medsi_owner') then create role medsi_owner nologin;end if;
 if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin;end if;
 if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin;end if;
 if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin;end if;
end $$;
grant medsi_owner to service_role;
do $$ begin execute format('grant medsi_owner,authenticated,anon,service_role to %I',current_user);end $$;
do $$ begin execute format('grant create on database %I to medsi_owner',current_database());end $$;
grant usage,create on schema public to medsi_owner;
revoke create on schema public from public;
create extension if not exists pgcrypto;
create schema if not exists auth authorization medsi_owner;
create schema if not exists storage authorization medsi_owner;
set role medsi_owner;
create table if not exists auth.users(
 id uuid primary key default gen_random_uuid(),email text,email_confirmed_at timestamptz,
 raw_user_meta_data jsonb not null default '{}',created_at timestamptz not null default now()
);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth to authenticated,anon;
grant execute on function auth.uid() to authenticated,anon;
create table storage.buckets(id text primary key,name text not null,public boolean not null default false,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text not null references storage.buckets(id),name text not null,metadata jsonb not null default '{}',created_at timestamptz not null default now(),unique(bucket_id,name));
alter table storage.objects enable row level security;
grant usage on schema storage to authenticated,anon;
grant select on storage.buckets to authenticated,anon;
grant select,insert,update,delete on storage.objects to authenticated;
create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1] $$;
reset role;
