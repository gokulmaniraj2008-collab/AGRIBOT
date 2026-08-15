-- Plant GPS navigation (prototype). Two parts:

-- 1. New table: saved GPS spot per plant, per robot.
create table if not exists public.plant_locations (
  id bigint generated always as identity primary key,
  robot_id text not null default 'agribot-01',
  plant_index integer not null,
  latitude double precision not null,
  longitude double precision not null,
  created_at timestamptz not null default now(),
  unique (robot_id, plant_index)
);

alter table public.plant_locations enable row level security;

create policy "authenticated read plant_locations"
  on public.plant_locations for select
  to authenticated
  using (true);

-- No insert policy for authenticated users: only the ESP32 (service_role,
-- bypasses RLS) writes these, since only the robot's own GPS fix is
-- trustworthy as "this is where I actually was."

-- 2. Widen robot_commands to accept the two new commands.
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
    'set_target_temp_min','set_target_temp_max',
    'patrol_row',
    'save_plant_location','goto_plant'
  ));
