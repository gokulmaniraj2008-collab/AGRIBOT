-- AgriBot AI — Initial schema
-- Run this in Supabase SQL Editor, or via `supabase db push` if using the CLI.

-- ============================================================
-- 1. sensor_data — time-series readings pushed by the ESP32
-- ============================================================
create table if not exists public.sensor_data (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  soil_moisture numeric,
  temperature numeric,
  humidity numeric,
  distance_cm numeric,
  battery_voltage numeric,
  battery_percent numeric,
  latitude double precision,
  longitude double precision
);

create index if not exists sensor_data_created_at_idx
  on public.sensor_data (created_at desc);

-- ============================================================
-- 2. robot_status — single-row-per-robot current state
-- ============================================================
create table if not exists public.robot_status (
  robot_id text primary key default 'agribot-01',
  updated_at timestamptz not null default now(),
  online boolean not null default false,
  mode text not null default 'manual' check (mode in ('manual', 'auto')),
  pump_status boolean not null default false,
  motor_state text not null default 'stopped'
    check (motor_state in ('stopped', 'forward', 'backward', 'left', 'right')),
  speed_value int not null default 0 check (speed_value between 0 and 255)
);

-- ============================================================
-- 3. robot_commands — dashboard writes commands here,
--    ESP32 polls or subscribes and marks them executed
-- ============================================================
create table if not exists public.robot_commands (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  robot_id text not null default 'agribot-01',
  command text not null check (command in ('forward','backward','left','right','stop','pump_on','pump_off','set_speed','set_mode_auto','set_mode_manual')),
  value int,
  executed boolean not null default false,
  executed_at timestamptz
);

create index if not exists robot_commands_pending_idx
  on public.robot_commands (robot_id, executed, created_at);

-- ============================================================
-- Row Level Security
-- ============================================================
alter table public.sensor_data enable row level security;
alter table public.robot_status enable row level security;
alter table public.robot_commands enable row level security;

create policy "authenticated read sensor_data"
  on public.sensor_data for select
  to authenticated
  using (true);

create policy "authenticated read robot_status"
  on public.robot_status for select
  to authenticated
  using (true);

create policy "authenticated read robot_commands"
  on public.robot_commands for select
  to authenticated
  using (true);

create policy "authenticated insert robot_commands"
  on public.robot_commands for insert
  to authenticated
  with check (true);

-- NOTE on ESP32 writes:
-- The ESP32 does NOT authenticate as a Supabase user. It writes using
-- the service_role key (kept only on the device, or better, only in a
-- backend it calls). service_role bypasses RLS entirely, so no policy
-- is needed for the ESP32's own inserts/updates. Never put the
-- service_role key in a public repo or client-side code.

insert into public.robot_status (robot_id)
values ('agribot-01')
on conflict (robot_id) do nothing;
