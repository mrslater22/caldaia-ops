-- Explicit deny policies for anon/authenticated.
-- App access uses the service role (bypasses RLS). Clears rls_enabled_no_policy INFO.

create policy organizations_deny_all
  on public.organizations
  for all
  to anon, authenticated
  using (false)
  with check (false);

create policy boilers_deny_all
  on public.boilers
  for all
  to anon, authenticated
  using (false)
  with check (false);

create policy devices_deny_all
  on public.devices
  for all
  to anon, authenticated
  using (false)
  with check (false);

create policy device_tests_deny_all
  on public.device_tests
  for all
  to anon, authenticated
  using (false)
  with check (false);

create policy integration_events_deny_all
  on public.integration_events
  for all
  to anon, authenticated
  using (false)
  with check (false);
