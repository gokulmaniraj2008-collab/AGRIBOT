-- AgriBot AI — Multiple home page videos (replaces the single
-- site_settings.home_video_url approach from 0003_home_video.sql)
-- Run this after 0003_home_video.sql in the Supabase SQL Editor.

create table if not exists public.home_videos (
  id bigint generated always as identity primary key,
  url text not null,
  title text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists home_videos_order_idx
  on public.home_videos (sort_order, created_at);

alter table public.home_videos enable row level security;

-- Anyone (even anonymous) can view the videos — they show on the
-- logged-in Dashboard, but reading the list itself is harmless.
create policy "public read home_videos"
  on public.home_videos for select
  to anon, authenticated
  using (true);

-- Only admins can add, edit, or remove videos
create policy "admins insert home_videos"
  on public.home_videos for insert
  to authenticated
  with check (public.is_admin());

create policy "admins update home_videos"
  on public.home_videos for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "admins delete home_videos"
  on public.home_videos for delete
  to authenticated
  using (public.is_admin());
