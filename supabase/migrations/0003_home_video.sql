-- AgriBot AI — Home page video support (video hosted on Cloudinary)
-- Run this after 0002_admin.sql in the Supabase SQL Editor.

-- ============================================================
-- site_settings — simple key/value store for site-wide config.
-- Used to store the Cloudinary URL of the home page video.
-- ============================================================
create table if not exists public.site_settings (
  key text primary key,
  value text,
  updated_at timestamptz not null default now()
);

alter table public.site_settings enable row level security;

-- Anyone (even anonymous, e.g. the public welcome page) can read settings
create policy "public read site_settings"
  on public.site_settings for select
  to anon, authenticated
  using (true);

-- Only admins can write settings
create policy "admins insert site_settings"
  on public.site_settings for insert
  to authenticated
  with check (public.is_admin());

create policy "admins update site_settings"
  on public.site_settings for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "admins delete site_settings"
  on public.site_settings for delete
  to authenticated
  using (public.is_admin());
