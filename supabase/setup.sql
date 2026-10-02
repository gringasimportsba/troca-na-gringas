-- Gringas Troca: executar inteiro no SQL Editor do Supabase como postgres.
-- Instalação nova ou esquema original. Leia README.md antes de aplicar.
-- Ingresso anônimo deliberadamente aberto: limites abaixo NÃO impedem spam.
begin;
create extension if not exists pgcrypto;

-- 1. Schema original; nenhuma conta recebe administração automaticamente.
create table if not exists public.stores (
  id uuid primary key,
  slug text unique not null,
  name text not null,
  created_at timestamptz not null default now()
);
insert into public.stores (id, slug, name)
values ('11111111-1111-1111-1111-111111111111', 'gringas', 'Gringas Imports')
on conflict (id) do nothing;

create table if not exists public.store_members (
  store_id uuid not null references public.stores(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'viewer' check (role in ('owner','admin','seller','viewer')),
  created_at timestamptz not null default now(),
  primary key (store_id, user_id)
);
alter table public.store_members alter column role set default 'viewer';

create table if not exists public.evaluations (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  code text not null,
  status text not null default 'Nova',
  customer_name text not null,
  customer_phone text,
  preferred_service text,
  device_model text,
  device_storage text,
  battery integer,
  battery_label text,
  condition text,
  screen_condition text,
  issues jsonb not null default '[]'::jsonb,
  repair_history text,
  part_alert text,
  warranty_status text,
  warranty_date date,
  applecare text,
  accessories jsonb not null default '[]'::jsonb,
  notes text,
  photos jsonb not null default '{}'::jsonb,
  base_value numeric(12,2) not null default 0,
  total_discount numeric(12,2) not null default 0,
  estimated_value numeric(12,2) not null default 0,
  manual_review boolean not null default false,
  manual_reasons jsonb not null default '[]'::jsonb,
  calculation_lines jsonb not null default '[]'::jsonb,
  approved_value numeric(12,2),
  adjustment_reason text,
  upgrade_product_id text,
  upgrade_product_name text,
  upgrade_storage text,
  upgrade_trade_value numeric(12,2),
  upgrade_difference numeric(12,2),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, code)
);
create index if not exists evaluations_store_created_idx on public.evaluations(store_id, created_at desc);
create index if not exists evaluations_store_status_idx on public.evaluations(store_id, status);
drop function if exists public.claim_initial_gringas_admin();

-- 2. Remover policies e ACLs antigas destas três tabelas (inclusive de coluna).
-- Não altera dados/membros existentes; revisar owners legados manualmente.
do $$
declare p record; t text; cols text;
begin
  for p in select schemaname, tablename, policyname from pg_policies
    where schemaname = 'public' and tablename in ('stores','store_members','evaluations')
  loop
    execute format('drop policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
  end loop;
  foreach t in array array['stores','store_members','evaluations'] loop
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    select string_agg(quote_ident(attname), ', ') into cols from pg_attribute
      where attrelid = format('public.%I', t)::regclass and attnum > 0 and not attisdropped;
    execute format('revoke select (%s), insert (%s), update (%s), references (%s) on public.%I from public, anon, authenticated',
      cols, cols, cols, cols, t);
  end loop;
end;
$$;
alter table public.stores enable row level security;
alter table public.store_members enable row level security;
alter table public.evaluations enable row level security;
alter table public.stores force row level security;
alter table public.store_members force row level security;
alter table public.evaluations force row level security;

grant select on public.stores, public.store_members, public.evaluations to authenticated;
-- Mantém o payload do formulário, mas não permite escolher id/timestamps/upgrade.
grant insert (store_id, code, status, customer_name, customer_phone, preferred_service,
  device_model, device_storage, battery, battery_label, condition, screen_condition,
  issues, repair_history, part_alert, warranty_status, warranty_date, applecare,
  accessories, notes, photos, base_value, total_discount, estimated_value,
  manual_review, manual_reasons, calculation_lines, approved_value, adjustment_reason,
  metadata) on public.evaluations to anon, authenticated;
grant update (status, approved_value, adjustment_reason, upgrade_product_id,
  upgrade_product_name, upgrade_storage, upgrade_trade_value, upgrade_difference,
  updated_at) on public.evaluations to authenticated;

create policy members_read_self on public.store_members for select to authenticated
using (user_id = (select auth.uid()));
create policy members_read_stores on public.stores for select to authenticated
using (exists (select 1 from public.store_members m
  where m.store_id = stores.id and m.user_id = (select auth.uid())));
create policy public_create_evaluation on public.evaluations for insert to anon, authenticated
with check (store_id = '11111111-1111-1111-1111-111111111111'::uuid
  and status = 'Nova' and approved_value is null
  and coalesce(adjustment_reason, '') = '');
create policy members_read_evaluations on public.evaluations for select to authenticated
using (exists (select 1 from public.store_members m
  where m.store_id = evaluations.store_id and m.user_id = (select auth.uid())));
create policy operators_update_evaluations on public.evaluations for update to authenticated
using (exists (select 1 from public.store_members m
  where m.store_id = evaluations.store_id and m.user_id = (select auth.uid())
    and m.role in ('owner','admin','seller')))
with check (exists (select 1 from public.store_members m
  where m.store_id = evaluations.store_id and m.user_id = (select auth.uid())
    and m.role in ('owner','admin','seller')));
-- Não há SELECT/UPDATE/DELETE para anon, DELETE para membros ou escrita de memberships.

-- 3. Validação no banco; invoker, sem função privilegiada exposta por RPC.
create or replace function public.validate_evaluation_write()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare item record; value_json jsonb;
begin
  if tg_op = 'INSERT' then
    if new.code !~ '^GT-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or new.status <> 'Nova' or new.approved_value is not null
       or coalesce(new.adjustment_reason, '') <> '' then
      raise exception 'invalid code or initial approval' using errcode = '23514';
    end if;
    if length(btrim(new.customer_name)) not between 1 and 160
       or length(coalesce(new.customer_phone, '')) > 40
       or length(coalesce(new.notes, '')) > 4000
       or (new.battery is not null and new.battery not between 0 and 100)
       or octet_length(to_jsonb(new)::text) > 32768 then
      raise exception 'invalid customer, battery or payload size (32 KiB)' using errcode = '23514';
    end if;
    -- Demais strings descritivas: até 256 caracteres cada.
    for item in select key, value from jsonb_each(to_jsonb(new))
      where key in ('preferred_service','device_model','device_storage','battery_label',
        'condition','screen_condition','repair_history','part_alert','warranty_status','applecare')
    loop
      if length(item.value #>> '{}') > 256 then
        raise exception 'description too long' using errcode = '23514';
      end if;
    end loop;
    foreach value_json in array array[new.issues, new.accessories, new.manual_reasons, new.calculation_lines] loop
      if value_json is null or jsonb_typeof(value_json) <> 'array' then
        raise exception 'expected JSON array' using errcode = '23514';
      end if;
      if jsonb_array_length(value_json) > 32 or octet_length(value_json::text) > 8192 then
        raise exception 'JSON array too large' using errcode = '23514';
      end if;
    end loop;
    if new.metadata is null or jsonb_typeof(new.metadata) <> 'object'
       or octet_length(new.metadata::text) > 2048
       or not (new.base_value between 0 and 1000000)
       or not (new.total_discount between 0 and 1000000)
       or not (new.estimated_value between 0 and 1000000) then
      raise exception 'invalid metadata or estimate' using errcode = '23514';
    end if;
    if new.photos is null or jsonb_typeof(new.photos) <> 'object'
       or octet_length(new.photos::text) > 4096 then
      raise exception 'expected bounded photos object' using errcode = '23514';
    end if;
    if (select count(*) from jsonb_each(new.photos)) > 6 then
      raise exception 'at most six photo references' using errcode = '23514';
    end if;
    for item in select key, value from jsonb_each(new.photos) loop
      if item.key !~ '^[A-Za-z0-9_-]{1,40}$' or jsonb_typeof(item.value) <> 'string'
         or array_length(string_to_array(item.value #>> '{}', '/'), 1) <> 3
         or split_part(item.value #>> '{}', '/', 1) <> new.store_id::text
         or split_part(item.value #>> '{}', '/', 2) <> new.code
         or split_part(item.value #>> '{}', '/', 3) !~ '^[A-Za-z0-9_-]{1,100}\.(jpg|jpeg|png|webp)$' then
        raise exception 'invalid photo reference' using errcode = '23514';
      end if;
    end loop;
    new.created_at := statement_timestamp();
  else
    if new.id is distinct from old.id or new.store_id is distinct from old.store_id
       or new.code is distinct from old.code or new.created_at is distinct from old.created_at then
      raise exception 'evaluation identity is immutable' using errcode = '23514';
    end if;
  end if;
  -- Colunas operacionais validadas também no UPDATE, sem revalidar payload legado.
  if new.status not in ('Nova','Em análise','Cliente contatado','Aguardando aparelho',
      'Aprovado','Troca realizada','Recusado','Cliente desistiu')
     or (new.approved_value is not null and not (new.approved_value between 0 and 1000000))
     or length(coalesce(new.adjustment_reason, '')) > 4000
     or length(coalesce(new.upgrade_product_id, '')) > 120
     or length(coalesce(new.upgrade_product_name, '')) > 240
     or length(coalesce(new.upgrade_storage, '')) > 80
     or (new.upgrade_trade_value is not null and not (new.upgrade_trade_value between 0 and 1000000))
     or (new.upgrade_difference is not null and not (new.upgrade_difference between -1000000 and 1000000)) then
    raise exception 'invalid operational fields' using errcode = '23514';
  end if;
  new.updated_at := statement_timestamp();
  return new;
end;
$$;
revoke all on function public.validate_evaluation_write() from public, anon, authenticated;
drop trigger if exists validate_evaluation_write on public.evaluations;
create trigger validate_evaluation_write before insert or update on public.evaluations
for each row execute function public.validate_evaluation_write();

-- 4. Storage privado. 6 MiB por arquivo, não quota total nem limite de uploads.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('evaluation-photos','evaluation-photos',false,6291456,
  array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = 6291456,
  allowed_mime_types = array['image/jpeg','image/png','image/webp'];

-- Limpa policies conhecidas do setup original e da revisão anterior.
drop policy if exists "public can upload evaluation photos" on storage.objects;
drop policy if exists "members can read evaluation photos" on storage.objects;
drop policy if exists evaluation_photos_insert on storage.objects;
drop policy if exists evaluation_photos_read on storage.objects;
drop policy if exists evaluation_photos_read_guard on storage.objects;
drop policy if exists evaluation_photos_anon_read_guard on storage.objects;
drop policy if exists evaluation_photos_insert_guard on storage.objects;
drop policy if exists evaluation_photos_update_guard on storage.objects;
drop policy if exists evaluation_photos_delete_guard on storage.objects;

create policy evaluation_photos_insert on storage.objects for insert to anon, authenticated
with check (bucket_id = 'evaluation-photos'
  and name ~ '^11111111-1111-1111-1111-111111111111/GT-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[A-Za-z0-9_-]{1,100}\.(jpg|jpeg|png|webp)$');
create policy evaluation_photos_read on storage.objects for select to authenticated
using (bucket_id = 'evaluation-photos' and exists (
  select 1 from public.store_members m
  where m.user_id = (select auth.uid()) and m.store_id::text = split_part(name, '/', 1)
));

-- Guards evitam que policies permissivas antigas reabram este bucket.
-- Não removemos policies nem grants globais de outros buckets.
create policy evaluation_photos_insert_guard on storage.objects as restrictive for insert to public
with check (bucket_id <> 'evaluation-photos'
  or name ~ '^11111111-1111-1111-1111-111111111111/GT-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[A-Za-z0-9_-]{1,100}\.(jpg|jpeg|png|webp)$');
create policy evaluation_photos_anon_read_guard on storage.objects as restrictive for select to anon
using (bucket_id <> 'evaluation-photos');
create policy evaluation_photos_read_guard on storage.objects as restrictive for select to authenticated
using (bucket_id <> 'evaluation-photos' or exists (
  select 1 from public.store_members m
  where m.user_id = (select auth.uid()) and m.store_id::text = split_part(name, '/', 1)
));
create policy evaluation_photos_update_guard on storage.objects as restrictive for update to public
using (bucket_id <> 'evaluation-photos') with check (bucket_id <> 'evaluation-photos');
create policy evaluation_photos_delete_guard on storage.objects as restrictive for delete to public
using (bucket_id <> 'evaluation-photos');

-- Supabase padrão já habilita RLS em Storage; abortar se a premissa não valer.
do $$
begin
  if not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'storage' and c.relname = 'objects' and c.relrowsecurity)
    or exists (select 1 from pg_roles where rolname in ('anon','authenticated')
      and (rolsuper or rolbypassrls)) then
    raise exception 'Inspect Storage RLS and Supabase roles before applying';
  end if;
end;
$$;
notify pgrst, 'reload schema';
commit;
