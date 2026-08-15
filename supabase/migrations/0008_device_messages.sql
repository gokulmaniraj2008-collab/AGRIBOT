-- ============================================================
-- device_messages — a lightweight two-way message log.
--   origin = 'esp32'   → messages the robot sends up to the site
--   origin = 'website' → messages/notes sent down to the robot
-- Distinct from robot_commands, which stays as the fixed-enum
-- channel that actually drives motors/pump/mode.
-- ============================================================
create table if not exists public.device_messages (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  robot_id text not null default 'agribot-01',
  origin text not null check (origin in ('esp32', 'website')),
  level text not null default 'info' check (level in ('info', 'warning', 'error', 'success')),
  message text not null,
  read boolean not null default false
);

create index if not exists device_messages_robot_created_idx
  on public.device_messages (robot_id, created_at desc);

alter table public.device_messages enable row level security;

-- Website (logged-in) users can read all messages and send new ones.
create policy "authenticated read device_messages"
  on public.device_messages for select
  to authenticated
  using (true);

create policy "authenticated insert device_messages"
  on public.device_messages for insert
  to authenticated
  with check (origin = 'website');

-- NOTE: the ESP32 writes/reads using the service_role key on the
-- device side, which bypasses RLS entirely — no policy needed for
-- its own inserts (origin = 'esp32') or its polling reads of
-- origin = 'website' rows. Same pattern as robot_commands.
