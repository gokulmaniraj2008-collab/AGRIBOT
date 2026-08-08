-- AgriBot AI — Profile picture (avatar) support
-- Run this after 0002_admin.sql in the Supabase SQL Editor.

-- ============================================================
-- 1. avatar_url column on profiles
-- ============================================================
alter table public.profiles
  add column if not exists avatar_url text;

-- ============================================================
-- 2. Let users update their OWN profile row (e.g. avatar_url),
--    while a trigger below stops them from self-promoting role.
-- ============================================================
create policy "users update own profile"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ============================================================
-- 3. Guard: a non-admin cannot change their own `role` column,
--    even though they can now update their own row for avatar_url.
-- ============================================================
create or replace function public.prevent_role_self_escalation()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.role is distinct from old.role and not public.is_admin() then
    new.role := old.role;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_role_self_escalation on public.profiles;
create trigger guard_role_self_escalation
  before update on public.profiles
  for each row execute function public.prevent_role_self_escalation();
