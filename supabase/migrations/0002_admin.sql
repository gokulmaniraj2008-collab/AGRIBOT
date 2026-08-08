-- AgriBot AI — Admin panel support
-- Run this after 0001_init.sql in the Supabase SQL Editor, or via `supabase db push`.

-- ============================================================
-- 1. profiles — one row per auth user, holds the role
-- ============================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  role text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz not null default now()
);

-- Auto-create a profile row whenever a new auth user signs up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill profiles for any users that already exist
insert into public.profiles (id, email)
select id, email from auth.users
on conflict (id) do nothing;

-- ============================================================
-- 2. is_admin() — security-definer helper so RLS policies can
--    check role without recursively re-querying profiles under RLS
-- ============================================================
create or replace function public.is_admin()
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- ============================================================
-- 3. RLS for profiles
-- ============================================================
alter table public.profiles enable row level security;

create policy "users read own profile"
  on public.profiles for select
  to authenticated
  using (id = auth.uid() or public.is_admin());

create policy "admins update profiles"
  on public.profiles for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ============================================================
-- 4. Let admins manage robot state, commands, and sensor data
--    (regular users already have read access from 0001_init.sql)
-- ============================================================
create policy "admins update robot_status"
  on public.robot_status for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "admins delete robot_commands"
  on public.robot_commands for delete
  to authenticated
  using (public.is_admin());

create policy "admins update robot_commands"
  on public.robot_commands for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "admins delete sensor_data"
  on public.sensor_data for delete
  to authenticated
  using (public.is_admin());

-- ============================================================
-- 5. Make yourself an admin (run manually, once):
--
--   update public.profiles set role = 'admin'
--   where email = 'you@example.com';
--
-- ============================================================
