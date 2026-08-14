-- AgriBot AI — keep robot_status.updated_at fresh on every heartbeat/update
-- The ESP32 upserts robot_status every 5 seconds. The original default now()
-- only sets updated_at when the row is first inserted, so this trigger keeps
-- the dashboard's online/offline calculation accurate on subsequent updates.

create or replace function public.set_robot_status_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists robot_status_updated_at on public.robot_status;

create trigger robot_status_updated_at
before update on public.robot_status
for each row
execute function public.set_robot_status_updated_at();
