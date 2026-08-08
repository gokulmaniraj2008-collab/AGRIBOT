-- AgriBot AI — pH/NPK/water-tank sensors + climate, irrigation &
-- ventilation actuator control
-- Run this after 0005_avatar.sql in the Supabase SQL Editor, or via
-- `supabase db push` if using the CLI.

-- ============================================================
-- 1. sensor_data — add pH, NPK, and water tank level columns
-- ============================================================
alter table public.sensor_data
  add column if not exists ph_level numeric,
  add column if not exists nitrogen numeric,
  add column if not exists phosphorus numeric,
  add column if not exists potassium numeric,
  add column if not exists water_tank_percent numeric;

-- ============================================================
-- 2. robot_status — add climate/irrigation/ventilation actuator
--    state alongside the existing pump/motor/mode fields
-- ============================================================
alter table public.robot_status
  add column if not exists heater_status boolean not null default false,
  add column if not exists cooler_status boolean not null default false,
  add column if not exists vent_fan_status boolean not null default false,
  add column if not exists irrigation_auto boolean not null default false,
  add column if not exists irrigation_threshold numeric not null default 30,
  add column if not exists ventilation_auto boolean not null default false,
  add column if not exists target_temp_min numeric not null default 18,
  add column if not exists target_temp_max numeric not null default 30;

-- ============================================================
-- 3. robot_commands — widen the allowed command list to cover
--    the new actuators. Postgres check constraints can't be
--    altered in place, so drop and recreate it.
-- ============================================================
alter table public.robot_commands
  drop constraint if exists robot_commands_command_check;

alter table public.robot_commands
  add constraint robot_commands_command_check
  check (command in (
    'forward','backward','left','right','stop',
    'pump_on','pump_off','set_speed',
    'set_mode_auto','set_mode_manual',
    'heater_on','heater_off',
    'cooler_on','cooler_off',
    'vent_on','vent_off',
    'set_irrigation_auto_on','set_irrigation_auto_off',
    'set_irrigation_threshold',
    'set_ventilation_auto_on','set_ventilation_auto_off',
    'set_target_temp_min','set_target_temp_max'
  ));

-- ============================================================
-- No new RLS policies needed — sensor_data and robot_status
-- already have authenticated-read / admin-write policies from
-- 0001_init.sql and 0002_admin.sql that cover these new columns.
-- ============================================================
