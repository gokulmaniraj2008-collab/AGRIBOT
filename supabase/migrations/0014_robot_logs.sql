-- ============================================================
-- robot_logs — structured, per-step activity log for the
-- detect -> verify -> probe -> water -> save sequence.
-- Distinct from device_messages (free-text robot/website chat)
-- and robot_commands (the fixed-enum drive channel): this table
-- is a granular timeline of individual firmware events, written
-- by logEvent() in agribot_main.ino, one row per step
-- (e.g. "[SOIL] Moisture: 28%", "[PUMP] ON").
-- ============================================================
create table if not exists public.robot_logs (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  robot_id text not null default 'agribot-01',
  plant_id integer,
  event_type text not null,
  message text not null,
  value double precision
);

create index if not exists robot_logs_robot_created_idx
  on public.robot_logs (robot_id, created_at desc);

create index if not exists robot_logs_plant_idx
  on public.robot_logs (robot_id, plant_id, created_at desc);

alter table public.robot_logs enable row level security;

-- Website (logged-in) users can read the log; only the robot writes it.
create policy "authenticated read robot_logs"
  on public.robot_logs for select
  to authenticated
  using (true);

-- NOTE: the ESP32 writes using the service_role key on the device side,
-- which bypasses RLS entirely — no insert policy needed for its own
-- rows, same pattern as device_messages / plant_locations.
