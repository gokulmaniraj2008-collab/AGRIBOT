-- AgriBot AI — Plant analysis persistence
-- Run this after 0006_climate_control.sql in the Supabase SQL Editor,
-- or via `supabase db push`.
--
-- Closes the gap the README's roadmap flagged as not-yet-built: results
-- from the AI Plant Analysis page (src/app/recommendations/plant-analysis.tsx)
-- were previously thrown away on page refresh. This migration adds a table
-- to persist each analysis plus a private Storage bucket for the source
-- images, so /api/plant-analysis (new route) has somewhere to write.

-- ============================================================
-- 1. plant_analysis — one row per AI photo analysis
-- ============================================================
create table if not exists public.plant_analysis (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  user_id uuid not null references auth.users (id) on delete cascade,
  image_path text not null,
  plant text,
  condition text,
  confidence int check (confidence between 0 and 100),
  severity text check (severity in ('Low', 'Moderate', 'High', 'None')),
  recommended_action text,
  -- populated instead of the fields above when Gemini didn't return
  -- clean JSON — mirrors the client's existing "rawAnswer" fallback
  raw_response text
);

create index if not exists plant_analysis_user_created_idx
  on public.plant_analysis (user_id, created_at desc);

alter table public.plant_analysis enable row level security;

create policy "users read own plant_analysis"
  on public.plant_analysis for select
  to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy "users insert own plant_analysis"
  on public.plant_analysis for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "users delete own plant_analysis"
  on public.plant_analysis for delete
  to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- ============================================================
-- 2. Storage bucket — private, one folder per user
--    Path convention: {user_id}/{uuid}.{ext}
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'plant-images',
  'plant-images',
  false,
  5242880, -- 5 MB
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
on conflict (id) do nothing;

create policy "users manage own plant images"
  on storage.objects for all
  to authenticated
  using (bucket_id = 'plant-images' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'plant-images' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "admins read all plant images"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'plant-images' and public.is_admin());
