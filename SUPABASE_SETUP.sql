-- ============================================================
-- GRINGAS TROCA 5.6 — SUPABASE SETUP
-- Cole TODO este arquivo no SQL Editor do Supabase e clique RUN.
-- ============================================================

create extension if not exists pgcrypto;

-- 1) Lojas (já preparada para multiempresa)
create table if not exists public.stores (
  id uuid primary key,
  slug text unique not null,
  name text not null,
  created_at timestamptz not null default now()
);

insert into public.stores (id,slug,name)
values ('11111111-1111-1111-1111-111111111111','gringas','Gringas Imports')
on conflict (id) do nothing;

-- 2) Membros administrativos
create table if not exists public.store_members (
  store_id uuid not null references public.stores(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'admin' check (role in ('owner','admin','seller','viewer')),
  created_at timestamptz not null default now(),
  primary key (store_id,user_id)
);

-- 3) Avaliações
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

  unique(store_id,code)
);

create index if not exists evaluations_store_created_idx on public.evaluations(store_id,created_at desc);
create index if not exists evaluations_store_status_idx on public.evaluations(store_id,status);

-- 4) RLS
alter table public.stores enable row level security;
alter table public.store_members enable row level security;
alter table public.evaluations enable row level security;

-- Apaga políticas anteriores com mesmos nomes, se existirem
drop policy if exists "public can read store identity" on public.stores;
drop policy if exists "members can read own memberships" on public.store_members;
drop policy if exists "public can insert gringas evaluations" on public.evaluations;
drop policy if exists "members can read evaluations" on public.evaluations;
drop policy if exists "members can update evaluations" on public.evaluations;

create policy "public can read store identity"
on public.stores for select
to anon, authenticated
using (true);

create policy "members can read own memberships"
on public.store_members for select
to authenticated
using (user_id = auth.uid());

-- O formulário público só pode criar avaliações da Gringas.
-- Ele NÃO pode ler avaliações.
create policy "public can insert gringas evaluations"
on public.evaluations for insert
to anon, authenticated
with check (store_id = '11111111-1111-1111-1111-111111111111'::uuid);

-- Usuários do painel só leem/alteram lojas das quais são membros.
create policy "members can read evaluations"
on public.evaluations for select
to authenticated
using (
  exists (
    select 1 from public.store_members sm
    where sm.store_id = evaluations.store_id and sm.user_id = auth.uid()
  )
);

create policy "members can update evaluations"
on public.evaluations for update
to authenticated
using (
  exists (
    select 1 from public.store_members sm
    where sm.store_id = evaluations.store_id and sm.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.store_members sm
    where sm.store_id = evaluations.store_id and sm.user_id = auth.uid()
  )
);

-- 5) Primeiro administrador:
-- O PRIMEIRO usuário autenticado que chamar esta função entra como OWNER.
-- Depois que existir um membro, ninguém mais consegue se auto-promover.
create or replace function public.claim_initial_gringas_admin()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  if exists (
    select 1 from public.store_members
    where store_id='11111111-1111-1111-1111-111111111111'::uuid
  ) then
    return false;
  end if;

  insert into public.store_members(store_id,user_id,role)
  values ('11111111-1111-1111-1111-111111111111'::uuid, auth.uid(), 'owner')
  on conflict do nothing;

  return true;
end;
$$;

revoke all on function public.claim_initial_gringas_admin() from public;
grant execute on function public.claim_initial_gringas_admin() to authenticated;

-- 6) Storage privado para fotos
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values (
  'evaluation-photos',
  'evaluation-photos',
  false,
  6291456,
  array['image/jpeg','image/png','image/webp','image/heic','image/heif']
)
on conflict (id) do update set
  public=false,
  file_size_limit=6291456,
  allowed_mime_types=array['image/jpeg','image/png','image/webp','image/heic','image/heif'];

drop policy if exists "public can upload evaluation photos" on storage.objects;
drop policy if exists "members can read evaluation photos" on storage.objects;

-- O visitante pode enviar imagem para a pasta da Gringas, mas não pode listar/ler.
create policy "public can upload evaluation photos"
on storage.objects for insert
to anon, authenticated
with check (
  bucket_id='evaluation-photos'
  and (storage.foldername(name))[1] = '11111111-1111-1111-1111-111111111111'
);

-- O painel só consegue ler fotos se o usuário for membro da Gringas.
create policy "members can read evaluation photos"
on storage.objects for select
to authenticated
using (
  bucket_id='evaluation-photos'
  and exists (
    select 1 from public.store_members sm
    where sm.store_id='11111111-1111-1111-1111-111111111111'::uuid
      and sm.user_id=auth.uid()
  )
);

-- FIM.
