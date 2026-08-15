-- Add a human-readable display name per device, so the /devices page
-- can list connected ESP32 units by name instead of raw robot_id.
alter table public.robot_status
  add column if not exists name text not null default 'AgriBot 01';
