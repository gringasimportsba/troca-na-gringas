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
alter table public.evaluations
  add column if not exists submitted_by uuid references auth.users(id) on delete set null;
alter table public.evaluations alter column submitted_by set default auth.uid();
create index if not exists evaluations_store_created_idx on public.evaluations(store_id, created_at desc);
create index if not exists evaluations_store_status_idx on public.evaluations(store_id, status);
create index if not exists evaluations_submitter_created_idx on public.evaluations(submitted_by, created_at desc);
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
-- O formulário usa uma sessão anônima do Auth. Não pode escolher id, timestamps,
-- submitted_by nem campos de upgrade; submitted_by vem de auth.uid().
grant insert (store_id, code, status, customer_name, customer_phone, preferred_service,
  device_model, device_storage, battery, battery_label, condition, screen_condition,
  issues, repair_history, part_alert, warranty_status, warranty_date, applecare,
  accessories, notes, photos, base_value, total_discount, estimated_value,
  manual_review, manual_reasons, calculation_lines, approved_value, adjustment_reason,
  metadata) on public.evaluations to authenticated;
grant update (status, customer_name, customer_phone, preferred_service, device_model,
  device_storage, battery, battery_label, condition, screen_condition, issues,
  repair_history, part_alert, warranty_status, warranty_date, applecare, accessories,
  notes, photos, base_value, total_discount, estimated_value, manual_review,
  manual_reasons, calculation_lines, approved_value, adjustment_reason, metadata,
  upgrade_product_id, upgrade_product_name, upgrade_storage, upgrade_trade_value,
  upgrade_difference, updated_at) on public.evaluations to authenticated;
grant delete on public.evaluations to authenticated;

create policy members_read_self on public.store_members for select to authenticated
using (user_id = (select auth.uid()));
create policy members_read_stores on public.stores for select to authenticated
using (exists (select 1 from public.store_members m
  where m.store_id = stores.id and m.user_id = (select auth.uid())));
create policy public_create_evaluation on public.evaluations for insert to authenticated
with check (store_id = '11111111-1111-1111-1111-111111111111'::uuid
  and submitted_by = (select auth.uid()) and status = 'Nova'
  and photos = '{}'::jsonb and approved_value is null
  and coalesce(adjustment_reason, '') = '');
-- O SELECT da própria linha é necessário para o UPDATE funcionar sob RLS.
create policy submitter_read_own_evaluation on public.evaluations for select to authenticated
using (submitted_by = (select auth.uid()));
create policy submitter_update_own_evaluation on public.evaluations for update to authenticated
using (submitted_by = (select auth.uid()) and status = 'Nova')
with check (submitted_by = (select auth.uid()) and status = 'Nova'
  and approved_value is null and coalesce(adjustment_reason, '') = ''
  and upgrade_product_id is null and upgrade_product_name is null
  and upgrade_storage is null and upgrade_trade_value is null and upgrade_difference is null);
-- Exclusivo para desfazer uma criação cujo upload falhou. Avaliações concluídas possuem fotos.
create policy submitter_delete_incomplete_evaluation on public.evaluations for delete to authenticated
using (submitted_by = (select auth.uid()) and status = 'Nova' and photos = '{}'::jsonb
  and created_at > statement_timestamp() - interval '15 minutes');
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
-- O remetente lê/altera somente a própria linha. Anon sem sessão não escreve nada.

-- 3. Limite básico por identidade do Auth. O Auth aplica também seus próprios
-- limites por IP para criação de usuários anônimos; não substitui CAPTCHA/WAF.
create or replace function public.enforce_evaluation_submission_rate()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or new.submitted_by is distinct from auth.uid() then
    raise exception 'authenticated submitter required' using errcode = '42501';
  end if;
  if (select count(*) from public.evaluations e
      where e.submitted_by = auth.uid()
        and e.created_at > statement_timestamp() - interval '15 minutes') >= 5 then
    raise exception 'submission rate limit exceeded' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_evaluation_submission_rate() from public, anon, authenticated;
drop trigger if exists enforce_evaluation_submission_rate on public.evaluations;
create trigger enforce_evaluation_submission_rate before insert on public.evaluations
for each row execute function public.enforce_evaluation_submission_rate();

-- Validação no banco; sem função de negócio exposta por RPC.
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
    new.created_at := statement_timestamp();
  elsif new.id is distinct from old.id or new.store_id is distinct from old.store_id
      or new.code is distinct from old.code or new.created_at is distinct from old.created_at
      or new.submitted_by is distinct from old.submitted_by then
    raise exception 'evaluation identity is immutable' using errcode = '23514';
  end if;

  -- Revalida o formulário no INSERT e quando seu payload for editado. Updates
  -- exclusivamente operacionais continuam compatíveis com registros legados.
  if tg_op = 'INSERT' or
     (to_jsonb(new) - array['status','approved_value','adjustment_reason',
       'upgrade_product_id','upgrade_product_name','upgrade_storage',
       'upgrade_trade_value','upgrade_difference','updated_at']) is distinct from
     (to_jsonb(old) - array['status','approved_value','adjustment_reason',
       'upgrade_product_id','upgrade_product_name','upgrade_storage',
       'upgrade_trade_value','upgrade_difference','updated_at']) then
    if length(btrim(new.customer_name)) not between 1 and 160
       or length(coalesce(new.customer_phone, '')) > 40
       or length(coalesce(new.notes, '')) > 4000
       or (new.battery is not null and new.battery not between 0 and 100)
       or octet_length(to_jsonb(new)::text) > 32768 then
      raise exception 'invalid customer, battery or payload size (32 KiB)' using errcode = '23514';
    end if;
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
       or octet_length(new.photos::text) > 4096
       or (select count(*) from jsonb_each(new.photos)) > 5 then
      raise exception 'expected at most five photo references' using errcode = '23514';
    end if;
    for item in select key, value from jsonb_each(new.photos) loop
      if item.key not in ('front','back','left','right','detail')
         or jsonb_typeof(item.value) <> 'string'
         or array_length(string_to_array(item.value #>> '{}', '/'), 1) <> 3
         or split_part(item.value #>> '{}', '/', 1) <> new.store_id::text
         or split_part(item.value #>> '{}', '/', 2) <> new.code
         or split_part(item.value #>> '{}', '/', 3) !~
           '^(front|back|left|right|detail)-[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$' then
        raise exception 'invalid photo reference' using errcode = '23514';
      end if;
    end loop;
  end if;

  -- Um remetente comum nunca altera campos operacionais, mesmo que faça a
  -- chamada manualmente com o JWT anônimo. Operadores preservam esse acesso.
  if tg_op = 'UPDATE' and new.submitted_by = auth.uid()
     and not exists (select 1 from public.store_members m
       where m.store_id = new.store_id and m.user_id = auth.uid()
         and m.role in ('owner','admin','seller'))
     and (new.status is distinct from old.status
       or new.approved_value is distinct from old.approved_value
       or new.adjustment_reason is distinct from old.adjustment_reason
       or new.upgrade_product_id is distinct from old.upgrade_product_id
       or new.upgrade_product_name is distinct from old.upgrade_product_name
       or new.upgrade_storage is distinct from old.upgrade_storage
       or new.upgrade_trade_value is distinct from old.upgrade_trade_value
       or new.upgrade_difference is distinct from old.upgrade_difference) then
    raise exception 'submitter cannot update operational fields' using errcode = '42501';
  end if;

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

-- 4. Storage privado. O upload só ocorre depois de existir uma avaliação do
-- próprio remetente. Cada slot aceita no máximo duas versões durante uma edição.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('evaluation-photos','evaluation-photos',false,6291456,
  array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = 6291456,
  allowed_mime_types = array['image/jpeg','image/png','image/webp'];

create or replace function public.can_upload_evaluation_photo(object_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
    and object_name ~ '^11111111-1111-1111-1111-111111111111/GT-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(front|back|left|right|detail)-[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$'
    and exists (
      select 1 from public.evaluations e
      where e.store_id::text = split_part(object_name, '/', 1)
        and e.code = split_part(object_name, '/', 2)
        and e.submitted_by = auth.uid() and e.status = 'Nova'
    )
    and (
      select count(*) from storage.objects o
      where o.bucket_id = 'evaluation-photos'
        and split_part(o.name, '/', 1) = split_part(object_name, '/', 1)
        and split_part(o.name, '/', 2) = split_part(object_name, '/', 2)
        and split_part(split_part(o.name, '/', 3), '-', 1) =
          split_part(split_part(object_name, '/', 3), '-', 1)
    ) < 2;
$$;
revoke all on function public.can_upload_evaluation_photo(text) from public, anon;
grant execute on function public.can_upload_evaluation_photo(text) to authenticated;

-- Limpa policies conhecidas do setup original e das revisões anteriores.
drop policy if exists "public can upload evaluation photos" on storage.objects;
drop policy if exists "members can read evaluation photos" on storage.objects;
drop policy if exists evaluation_photos_insert on storage.objects;
drop policy if exists evaluation_photos_read on storage.objects;
drop policy if exists evaluation_photos_submitter_read on storage.objects;
drop policy if exists evaluation_photos_delete_own on storage.objects;
drop policy if exists evaluation_photos_read_guard on storage.objects;
drop policy if exists evaluation_photos_anon_read_guard on storage.objects;
drop policy if exists evaluation_photos_insert_guard on storage.objects;
drop policy if exists evaluation_photos_update_guard on storage.objects;
drop policy if exists evaluation_photos_delete_guard on storage.objects;

create policy evaluation_photos_insert on storage.objects for insert to authenticated
with check (bucket_id = 'evaluation-photos' and public.can_upload_evaluation_photo(name));
create policy evaluation_photos_read on storage.objects for select to authenticated
using (bucket_id = 'evaluation-photos' and exists (
  select 1 from public.store_members m
  where m.user_id = (select auth.uid()) and m.store_id::text = split_part(name, '/', 1)
));
create policy evaluation_photos_submitter_read on storage.objects for select to authenticated
using (bucket_id = 'evaluation-photos' and owner_id::text = (select auth.uid())::text);
create policy evaluation_photos_delete_own on storage.objects for delete to authenticated
using (bucket_id = 'evaluation-photos' and owner_id::text = (select auth.uid())::text);

-- Guards evitam que policies permissivas antigas reabram este bucket.
-- Não removemos policies nem grants globais de outros buckets.
create policy evaluation_photos_insert_guard on storage.objects as restrictive for insert to public
with check (bucket_id <> 'evaluation-photos'
  or (auth.uid() is not null and public.can_upload_evaluation_photo(name)));
create policy evaluation_photos_anon_read_guard on storage.objects as restrictive for select to anon
using (bucket_id <> 'evaluation-photos');
create policy evaluation_photos_read_guard on storage.objects as restrictive for select to authenticated
using (bucket_id <> 'evaluation-photos'
  or owner_id::text = (select auth.uid())::text
  or exists (select 1 from public.store_members m
    where m.user_id = (select auth.uid()) and m.store_id::text = split_part(name, '/', 1)));
create policy evaluation_photos_update_guard on storage.objects as restrictive for update to public
using (bucket_id <> 'evaluation-photos') with check (bucket_id <> 'evaluation-photos');
create policy evaluation_photos_delete_guard on storage.objects as restrictive for delete to public
using (bucket_id <> 'evaluation-photos'
  or owner_id::text = (select auth.uid())::text);

-- 5. Preços, regras e cálculo no servidor.
-- O banco recalcula base, descontos e estimativa a partir das respostas e descarta os
-- valores enviados pelo navegador. Valores iniciais = js/evaluation/calculator.js
-- (demonstrativos). Rodar o setup de novo NÃO sobrescreve preços já editados; para
-- alterar preços use o Table Editor (pricing_models / pricing_rules).
create table if not exists public.pricing_models (
  store_id uuid not null references public.stores(id) on delete cascade,
  model text not null,
  base_price numeric(12,2) not null check (base_price between 0 and 1000000),
  storages text[] not null,
  sort_order integer not null default 0,
  primary key (store_id, model)
);
create table if not exists public.pricing_rules (
  store_id uuid primary key references public.stores(id) on delete cascade,
  rules jsonb not null check (jsonb_typeof(rules) = 'object'),
  updated_at timestamptz not null default now()
);
alter table public.pricing_models enable row level security;
alter table public.pricing_rules enable row level security;
alter table public.pricing_models force row level security;
alter table public.pricing_rules force row level security;
revoke all on public.pricing_models, public.pricing_rules from public, anon, authenticated;
grant select, insert, update, delete on public.pricing_models, public.pricing_rules to authenticated;
drop policy if exists pricing_models_members_read on public.pricing_models;
drop policy if exists pricing_models_admins_write on public.pricing_models;
drop policy if exists pricing_rules_members_read on public.pricing_rules;
drop policy if exists pricing_rules_admins_write on public.pricing_rules;
-- Membros da loja leem; só owner/admin alteram. Visitantes não leem a tabela de preços.
create policy pricing_models_members_read on public.pricing_models for select to authenticated
using (exists (select 1 from public.store_members m
  where m.store_id = pricing_models.store_id and m.user_id = (select auth.uid())));
create policy pricing_models_admins_write on public.pricing_models for all to authenticated
using (exists (select 1 from public.store_members m
  where m.store_id = pricing_models.store_id and m.user_id = (select auth.uid())
    and m.role in ('owner','admin')))
with check (exists (select 1 from public.store_members m
  where m.store_id = pricing_models.store_id and m.user_id = (select auth.uid())
    and m.role in ('owner','admin')));
create policy pricing_rules_members_read on public.pricing_rules for select to authenticated
using (exists (select 1 from public.store_members m
  where m.store_id = pricing_rules.store_id and m.user_id = (select auth.uid())));
create policy pricing_rules_admins_write on public.pricing_rules for all to authenticated
using (exists (select 1 from public.store_members m
  where m.store_id = pricing_rules.store_id and m.user_id = (select auth.uid())
    and m.role in ('owner','admin')))
with check (exists (select 1 from public.store_members m
  where m.store_id = pricing_rules.store_id and m.user_id = (select auth.uid())
    and m.role in ('owner','admin')));

insert into public.pricing_models (store_id, model, base_price, storages, sort_order) values
  ('11111111-1111-1111-1111-111111111111', 'iPhone 11', 900, array['64 GB','128 GB','256 GB'], 1),
  ('11111111-1111-1111-1111-111111111111', 'iPhone 11 Pro', 1150, array['64 GB','256 GB','512 GB'], 2),
  ('11111111-1111-1111-1111-111111111111', 'iPhone 11 Pro Max', 1350, array['64 GB','256 GB','512 GB'], 3),
  ('11111111-1111-1111-1111-111111111111', 'iPhone 12', 1250, array['64 GB','128 GB','256 GB'], 4),
  ('11111111-1111-1111-1111-111111111111', 'iPhone 12 Pro', 1550, array['128 GB','256 GB','512 GB'], 5),
  ('11111111-1111-1111-1111-111111111111', 'iPhone 12 Pro Max', 1800, array['128 GB','256 GB','512 GB'], 6),
  ('11111111-1111-1111-1111-111111111111', 'iPhone 13', 1750, array['128 GB','256 GB','512 GB'], 7),
  ('11111111-1111-1111-1111-111111111111', 'iPhone 13 Pro', 2200, array['128 GB','256 GB','512 GB','1 TB'], 8),
  ('11111111-1111-1111-1111-111111111111', 'iPhone 13 Pro Max', 2500, array['128 GB','256 GB','512 GB','1 TB'], 9),
  ('11111111-1111-1111-1111-111111111111', 'iPhone 14', 2250, array['128 GB','256 GB','512 GB'], 10),
  ('11111111-1111-1111-1111-111111111111', 'iPhone 14 Pro', 2850, array['128 GB','256 GB','512 GB','1 TB'], 11),
  ('11111111-1111-1111-1111-111111111111', 'iPhone 14 Pro Max', 3250, array['128 GB','256 GB','512 GB','1 TB'], 12),
  ('11111111-1111-1111-1111-111111111111', 'iPhone 15', 2800, array['128 GB','256 GB','512 GB'], 13),
  ('11111111-1111-1111-1111-111111111111', 'iPhone 15 Pro', 3650, array['128 GB','256 GB','512 GB','1 TB'], 14),
  ('11111111-1111-1111-1111-111111111111', 'iPhone 15 Pro Max', 4250, array['256 GB','512 GB','1 TB'], 15),
  ('11111111-1111-1111-1111-111111111111', 'iPhone 16', 3500, array['128 GB','256 GB','512 GB'], 16),
  ('11111111-1111-1111-1111-111111111111', 'iPhone 16 Pro', 4550, array['128 GB','256 GB','512 GB','1 TB'], 17),
  ('11111111-1111-1111-1111-111111111111', 'iPhone 16 Pro Max', 5350, array['256 GB','512 GB','1 TB'], 18),
  ('11111111-1111-1111-1111-111111111111', 'iPhone 17', 4300, array['256 GB','512 GB'], 19),
  ('11111111-1111-1111-1111-111111111111', 'iPhone 17 Pro', 5700, array['256 GB','512 GB','1 TB'], 20),
  ('11111111-1111-1111-1111-111111111111', 'iPhone 17 Pro Max', 6500, array['256 GB','512 GB','1 TB','2 TB'], 21),
  ('11111111-1111-1111-1111-111111111111', 'iPhone 18 Pro', 6900, array['256 GB','512 GB','1 TB'], 22),
  ('11111111-1111-1111-1111-111111111111', 'iPhone 18 Pro Max', 7800, array['256 GB','512 GB','1 TB','2 TB'], 23)
on conflict (store_id, model) do nothing;
insert into public.pricing_rules (store_id, rules) values ('11111111-1111-1111-1111-111111111111', '{"storageBonus":{"64 GB":0,"128 GB":100,"256 GB":250,"512 GB":500,"1 TB":800,"2 TB":1200},"conditionDiscount":{"Excelente":0,"Bom":100,"Regular":300,"Danificado":0},"screenDiscount":{"Sim, perfeitamente":0,"Possui riscos/manchas":180,"Está trincada":0,"Possui problema no touch":0,"Tela já foi substituída":220},"issueDiscount":{"Face ID / Touch ID":0,"Câmeras":350,"Alto-falantes":160,"Microfones":160,"Botões":120,"Wi‑Fi / Bluetooth":300,"Carregamento":250},"manualReasons":{"condition":["Danificado"],"screen":["Está trincada","Possui problema no touch"],"issues":["Face ID / Touch ID"]},"batteryDiscount":[{"min":90,"amount":0},{"min":85,"amount":100},{"min":80,"amount":220},{"min":0,"amount":400}],"repairDiscount":100,"maximumDiscountRate":0.3}'::jsonb)
on conflict (store_id) do nothing;

-- Mesma lógica de calculate() em js/evaluation/calculator.js. Roda antes dos demais
-- triggers (ordem alfabética), então validate_evaluation_write confere o resultado.
create or replace function public.calculate_evaluation_values()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  r jsonb; model_row record; base numeric; cap numeric; amount numeric; tier jsonb; issue text;
  labels text[] := '{}'; amounts numeric[] := '{}'; reasons text[] := '{}';
  lines jsonb; total numeric; manual jsonb;
begin
  -- Sem mudança nas respostas, os valores gravados são mantidos (ex.: o painel mudando
  -- o status), o que também impede o navegador de editar a estimativa diretamente.
  if tg_op = 'UPDATE' and
     (new.store_id, new.device_model, new.device_storage, new.battery, new.condition,
      new.screen_condition, new.issues, new.repair_history, new.part_alert)
     is not distinct from
     (old.store_id, old.device_model, old.device_storage, old.battery, old.condition,
      old.screen_condition, old.issues, old.repair_history, old.part_alert) then
    new.base_value := old.base_value;
    new.total_discount := old.total_discount;
    new.estimated_value := old.estimated_value;
    new.manual_review := old.manual_review;
    new.manual_reasons := old.manual_reasons;
    new.calculation_lines := old.calculation_lines;
    return new;
  end if;

  select p.rules into r from public.pricing_rules p where p.store_id = new.store_id;
  select * into model_row from public.pricing_models p
    where p.store_id = new.store_id and p.model = new.device_model;
  if r is null or not found or not (new.device_storage = any(model_row.storages))
     or not (r->'storageBonus' ? new.device_storage) then
    raise exception 'invalid model or storage for pricing' using errcode = '23514';
  end if;
  base := model_row.base_price + (r->'storageBonus'->>new.device_storage)::numeric;

  if new.battery is null then
    reasons := reasons || 'Saúde da bateria não informada'::text;
  else
    if new.battery not between 50 and 100 then
      raise exception 'invalid battery' using errcode = '23514';
    end if;
    amount := null;
    for tier in select value from jsonb_array_elements(r->'batteryDiscount') loop
      if new.battery >= (tier->>'min')::numeric then amount := (tier->>'amount')::numeric; exit; end if;
    end loop;
    labels := labels || ('Bateria ' || new.battery || '%'); amounts := amounts || coalesce(amount, 0);
  end if;

  if not (r->'conditionDiscount' ? new.condition) or not (r->'screenDiscount' ? new.screen_condition) then
    raise exception 'invalid condition or screen' using errcode = '23514';
  end if;
  labels := labels || ('Estado físico: ' || new.condition);
  amounts := amounts || (r->'conditionDiscount'->>new.condition)::numeric;
  if r->'manualReasons'->'condition' ? new.condition then
    reasons := reasons || 'Estado físico danificado'::text;
  end if;
  labels := labels || ('Tela: ' || new.screen_condition);
  amounts := amounts || (r->'screenDiscount'->>new.screen_condition)::numeric;
  if r->'manualReasons'->'screen' ? new.screen_condition then
    reasons := reasons || ('Tela: ' || new.screen_condition);
  end if;

  if jsonb_typeof(new.issues) <> 'array'
     or (select count(*) <> count(distinct value) from jsonb_array_elements_text(new.issues)) then
    raise exception 'invalid issues' using errcode = '23514';
  end if;
  for issue in select value from jsonb_array_elements_text(new.issues) loop
    if not (r->'issueDiscount' ? issue) then
      raise exception 'invalid issue' using errcode = '23514';
    end if;
    labels := labels || ('Função: ' || issue);
    amounts := amounts || (r->'issueDiscount'->>issue)::numeric;
    if r->'manualReasons'->'issues' ? issue then reasons := reasons || (issue || ' com problema'); end if;
  end loop;

  if new.repair_history = 'Sim' then
    labels := labels || 'Histórico de manutenção'::text;
    amounts := amounts || (r->>'repairDiscount')::numeric;
  end if;
  if new.part_alert = 'Sim' then reasons := reasons || 'Aviso de peça no sistema'::text; end if;
  if new.part_alert = 'Não sei' then reasons := reasons || 'Alerta de peça precisa ser verificado'::text; end if;

  select coalesce(jsonb_agg(jsonb_build_object('label', l, 'amount', a) order by i), '[]'::jsonb),
         coalesce(sum(a), 0)
    into lines, total
    from unnest(labels, amounts) with ordinality as t(l, a, i) where a > 0;
  cap := round(base * (r->>'maximumDiscountRate')::numeric);
  if total > cap then
    reasons := reasons || ('Descontos ultrapassam ' || round((r->>'maximumDiscountRate')::numeric * 100) || '% do valor-base');
  end if;
  select coalesce(jsonb_agg(x order by first_i), '[]'::jsonb) into manual
    from (select x, min(i) as first_i from unnest(reasons) with ordinality as t(x, i) group by x) s;

  new.base_value := base;
  new.total_discount := total;
  new.estimated_value := greatest(0, base - least(total, cap));
  new.manual_review := jsonb_array_length(manual) > 0;
  new.manual_reasons := manual;
  new.calculation_lines := lines;
  return new;
end;
$$;
revoke all on function public.calculate_evaluation_values() from public, anon, authenticated;
drop trigger if exists calculate_evaluation_values on public.evaluations;
create trigger calculate_evaluation_values before insert or update on public.evaluations
for each row execute function public.calculate_evaluation_values();

-- Supabase padrão já habilita RLS em Storage; abortar se a premissa não valer.
-- As funções security definer acima (limite de envios, upload de fotos e cálculo) leem tabelas
-- com RLS forçada: o dono delas (quem roda o script) precisa de BYPASSRLS, senão o
-- upload de fotos falharia sem explicação. No SQL Editor do Supabase esse papel é `postgres`.
do $$
begin
  if not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'storage' and c.relname = 'objects' and c.relrowsecurity)
    or exists (select 1 from pg_roles where rolname in ('anon','authenticated')
      and (rolsuper or rolbypassrls)) then
    raise exception 'Inspect Storage RLS and Supabase roles before applying';
  end if;
  if not exists (select 1 from pg_roles where rolname = current_user and (rolsuper or rolbypassrls)) then
    raise exception 'Execute este script no SQL Editor como postgres (o papel atual não tem BYPASSRLS)';
  end if;
end;
$$;
notify pgrst, 'reload schema';
commit;
