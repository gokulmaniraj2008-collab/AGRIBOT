-- Allow admins to delete device_messages directly from the website.
-- (Previously only service_role could delete — the ESP32 and the
-- website's authenticated users had no delete path at all.)
create policy "admin delete device_messages"
  on public.device_messages for delete
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );
