-- Gestão — estrutura inicial para Supabase/Postgres
-- Aplicar em um projeto Supabase SEPARADO quando o protótipo for aprovado.
-- Todas as tabelas expostas usam RLS e não concedem acesso ao papel anon.

create extension if not exists pgcrypto;

create table if not exists public.studios (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  slug text unique,
  timezone text not null default 'America/Sao_Paulo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.studio_members (
  studio_id uuid not null references public.studios(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner','admin','staff')),
  created_at timestamptz not null default now(),
  primary key (studio_id, user_id)
);

create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  name text not null,
  description text,
  duration_minutes integer check (duration_minutes is null or duration_minutes > 0),
  price numeric(10,2) not null default 0 check (price >= 0),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  full_name text not null,
  phone text,
  birthday date,
  notes text,
  return_interval_days integer check (return_interval_days is null or return_interval_days > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete restrict,
  service_id uuid not null references public.services(id) on delete restrict,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'confirmed' check (status in ('waiting','confirmed','done','cancelled','no_show')),
  notes text,
  price_snapshot numeric(10,2) not null default 0 check (price_snapshot >= 0),
  payment_status text check (payment_status is null or payment_status in ('received','pending','refunded','not_paid')),
  payment_method text check (payment_method is null or payment_method in ('pix','cash','card','other')),
  refund_status text check (refund_status is null or refund_status in ('refunded','not_refunded')),
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create table if not exists public.blocked_times (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  description text not null,
  amount numeric(10,2) not null check (amount > 0),
  expense_date date not null default current_date,
  category text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.studio_settings (
  studio_id uuid primary key references public.studios(id) on delete cascade,
  default_gap_minutes integer not null default 15 check (default_gap_minutes >= 0),
  default_return_days integer not null default 21 check (default_return_days > 0),
  agenda_fields jsonb not null default '{"service":true,"price":true,"phone":false,"status":true,"notes":false}'::jsonb,
  work_hours jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists clients_studio_name_idx on public.clients (studio_id, full_name);
create index if not exists appointments_studio_starts_at_idx on public.appointments (studio_id, starts_at);
create index if not exists appointments_client_idx on public.appointments (client_id, starts_at desc);
create index if not exists expenses_studio_date_idx on public.expenses (studio_id, expense_date desc);
create index if not exists blocked_times_studio_starts_at_idx on public.blocked_times (studio_id, starts_at);

alter table public.studios enable row level security;
alter table public.studio_members enable row level security;
alter table public.services enable row level security;
alter table public.clients enable row level security;
alter table public.appointments enable row level security;
alter table public.blocked_times enable row level security;
alter table public.expenses enable row level security;
alter table public.studio_settings enable row level security;

-- O dono gerencia o próprio studio.
create policy "studios_select_owner" on public.studios for select to authenticated
using ((select auth.uid()) = owner_id);
create policy "studios_insert_owner" on public.studios for insert to authenticated
with check ((select auth.uid()) = owner_id);
create policy "studios_update_owner" on public.studios for update to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);
create policy "studios_delete_owner" on public.studios for delete to authenticated
using ((select auth.uid()) = owner_id);

-- O usuário pode se vincular apenas a studio do qual ele próprio é dono.
-- Uma política administrativa mais ampla pode ser criada no futuro quando houver equipe/convites.
create policy "members_select_self" on public.studio_members for select to authenticated
using ((select auth.uid()) = user_id);
create policy "members_insert_owner_self" on public.studio_members for insert to authenticated
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1 from public.studios s
    where s.id = studio_id and s.owner_id = (select auth.uid())
  )
);
create policy "members_delete_owner_self" on public.studio_members for delete to authenticated
using (
  (select auth.uid()) = user_id
  and exists (
    select 1 from public.studios s
    where s.id = studio_id and s.owner_id = (select auth.uid())
  )
);

-- Políticas por participação no studio.
create policy "services_member_all_select" on public.services for select to authenticated
using (exists (select 1 from public.studio_members m where m.studio_id = services.studio_id and m.user_id = (select auth.uid())));
create policy "services_member_insert" on public.services for insert to authenticated
with check (exists (select 1 from public.studio_members m where m.studio_id = services.studio_id and m.user_id = (select auth.uid())));
create policy "services_member_update" on public.services for update to authenticated
using (exists (select 1 from public.studio_members m where m.studio_id = services.studio_id and m.user_id = (select auth.uid())))
with check (exists (select 1 from public.studio_members m where m.studio_id = services.studio_id and m.user_id = (select auth.uid())));
create policy "services_member_delete" on public.services for delete to authenticated
using (exists (select 1 from public.studio_members m where m.studio_id = services.studio_id and m.user_id = (select auth.uid())));

create policy "clients_member_select" on public.clients for select to authenticated
using (exists (select 1 from public.studio_members m where m.studio_id = clients.studio_id and m.user_id = (select auth.uid())));
create policy "clients_member_insert" on public.clients for insert to authenticated
with check (exists (select 1 from public.studio_members m where m.studio_id = clients.studio_id and m.user_id = (select auth.uid())));
create policy "clients_member_update" on public.clients for update to authenticated
using (exists (select 1 from public.studio_members m where m.studio_id = clients.studio_id and m.user_id = (select auth.uid())))
with check (exists (select 1 from public.studio_members m where m.studio_id = clients.studio_id and m.user_id = (select auth.uid())));
create policy "clients_member_delete" on public.clients for delete to authenticated
using (exists (select 1 from public.studio_members m where m.studio_id = clients.studio_id and m.user_id = (select auth.uid())));

create policy "appointments_member_select" on public.appointments for select to authenticated
using (exists (select 1 from public.studio_members m where m.studio_id = appointments.studio_id and m.user_id = (select auth.uid())));
create policy "appointments_member_insert" on public.appointments for insert to authenticated
with check (exists (select 1 from public.studio_members m where m.studio_id = appointments.studio_id and m.user_id = (select auth.uid())));
create policy "appointments_member_update" on public.appointments for update to authenticated
using (exists (select 1 from public.studio_members m where m.studio_id = appointments.studio_id and m.user_id = (select auth.uid())))
with check (exists (select 1 from public.studio_members m where m.studio_id = appointments.studio_id and m.user_id = (select auth.uid())));
create policy "appointments_member_delete" on public.appointments for delete to authenticated
using (exists (select 1 from public.studio_members m where m.studio_id = appointments.studio_id and m.user_id = (select auth.uid())));

create policy "blocked_member_select" on public.blocked_times for select to authenticated
using (exists (select 1 from public.studio_members m where m.studio_id = blocked_times.studio_id and m.user_id = (select auth.uid())));
create policy "blocked_member_insert" on public.blocked_times for insert to authenticated
with check (exists (select 1 from public.studio_members m where m.studio_id = blocked_times.studio_id and m.user_id = (select auth.uid())));
create policy "blocked_member_update" on public.blocked_times for update to authenticated
using (exists (select 1 from public.studio_members m where m.studio_id = blocked_times.studio_id and m.user_id = (select auth.uid())))
with check (exists (select 1 from public.studio_members m where m.studio_id = blocked_times.studio_id and m.user_id = (select auth.uid())));
create policy "blocked_member_delete" on public.blocked_times for delete to authenticated
using (exists (select 1 from public.studio_members m where m.studio_id = blocked_times.studio_id and m.user_id = (select auth.uid())));

create policy "expenses_member_select" on public.expenses for select to authenticated
using (exists (select 1 from public.studio_members m where m.studio_id = expenses.studio_id and m.user_id = (select auth.uid())));
create policy "expenses_member_insert" on public.expenses for insert to authenticated
with check (exists (select 1 from public.studio_members m where m.studio_id = expenses.studio_id and m.user_id = (select auth.uid())));
create policy "expenses_member_update" on public.expenses for update to authenticated
using (exists (select 1 from public.studio_members m where m.studio_id = expenses.studio_id and m.user_id = (select auth.uid())))
with check (exists (select 1 from public.studio_members m where m.studio_id = expenses.studio_id and m.user_id = (select auth.uid())));
create policy "expenses_member_delete" on public.expenses for delete to authenticated
using (exists (select 1 from public.studio_members m where m.studio_id = expenses.studio_id and m.user_id = (select auth.uid())));

create policy "settings_member_select" on public.studio_settings for select to authenticated
using (exists (select 1 from public.studio_members m where m.studio_id = studio_settings.studio_id and m.user_id = (select auth.uid())));
create policy "settings_member_insert" on public.studio_settings for insert to authenticated
with check (exists (select 1 from public.studio_members m where m.studio_id = studio_settings.studio_id and m.user_id = (select auth.uid())));
create policy "settings_member_update" on public.studio_settings for update to authenticated
using (exists (select 1 from public.studio_members m where m.studio_id = studio_settings.studio_id and m.user_id = (select auth.uid())))
with check (exists (select 1 from public.studio_members m where m.studio_id = studio_settings.studio_id and m.user_id = (select auth.uid())));

-- Acesso via Data API apenas para usuários autenticados.
grant select, insert, update, delete on public.studios to authenticated;
grant select, insert, update, delete on public.studio_members to authenticated;
grant select, insert, update, delete on public.services to authenticated;
grant select, insert, update, delete on public.clients to authenticated;
grant select, insert, update, delete on public.appointments to authenticated;
grant select, insert, update, delete on public.blocked_times to authenticated;
grant select, insert, update, delete on public.expenses to authenticated;
grant select, insert, update on public.studio_settings to authenticated;
