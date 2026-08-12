-- Fix mutable search_path warnings on POC helper functions.
-- Safe to re-run in the Supabase SQL Editor.

create or replace function public.generate_public_id(prefix text)
returns text
language plpgsql
set search_path = ''
as $$
declare
  candidate text;
begin
  loop
    candidate := prefix || '_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
    if prefix = 'blr' and not exists (select 1 from public.boilers where public_id = candidate) then
      return candidate;
    end if;
    if prefix = 'dev' and not exists (select 1 from public.devices where public_id = candidate) then
      return candidate;
    end if;
  end loop;
end;
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
