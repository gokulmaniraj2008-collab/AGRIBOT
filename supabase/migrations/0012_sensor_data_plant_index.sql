-- patrolRow() in the firmware has always sent a "plant_index" field on
-- each per-plant soil_moisture insert into sensor_data, but this column
-- never existed. PostgREST rejects unknown JSON keys by default, so
-- every patrol run's soil readings were likely failing silently
-- (error only visible on the ESP32's USB serial monitor, not the app).

alter table public.sensor_data
  add column if not exists plant_index integer;
