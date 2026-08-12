-- Supabase Storage buckets for BoilerOps.
-- Run in the Supabase SQL Editor. Safe to re-run.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'reports',
    'reports',
    false,
    26214400, -- 25 MB
    array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'application/octet-stream']
  ),
  (
    'qr-codes',
    'qr-codes',
    false,
    1048576, -- 1 MB
    array['image/png', 'image/svg+xml']
  )
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Deny PostgREST/anon access. The Next.js app uses the service role.
drop policy if exists reports_objects_deny_all on storage.objects;
create policy reports_objects_deny_all
  on storage.objects
  for all
  to anon, authenticated
  using (bucket_id = 'reports' and false)
  with check (bucket_id = 'reports' and false);

drop policy if exists qr_codes_objects_deny_all on storage.objects;
create policy qr_codes_objects_deny_all
  on storage.objects
  for all
  to anon, authenticated
  using (bucket_id = 'qr-codes' and false)
  with check (bucket_id = 'qr-codes' and false);
