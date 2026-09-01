-- Breaking device-to-asset terminology cutover.
-- Preserves row UUIDs and existing public_id values while renaming the
-- canonical inventory, inspection history, legacy bridge, and FastField contract.

-- ---------------------------------------------------------------------------
-- Rename the POC bridge first. Existing foreign keys follow table renames.
-- ---------------------------------------------------------------------------
alter table public.devices rename to legacy_assets;
alter table public.device_tests rename to legacy_asset_tests;

alter table public.legacy_assets rename column device_type to asset_classification;
alter table public.legacy_assets
  add column asset_category text not null default 'safety',
  add column asset_code text,
  add column asset_nomenclature text,
  add column asset_name text;
alter table public.legacy_assets
  add constraint legacy_assets_category_check
  check (asset_category in ('safety', 'measurement'));

alter table public.legacy_asset_tests rename column device_id to asset_id;

-- ---------------------------------------------------------------------------
-- Rename the canonical inventory and its inspection relationships.
-- ---------------------------------------------------------------------------
alter table public.safety_devices rename to assets;
alter table public.inspection_test_devices rename to inspection_test_assets;
alter table public.safety_device_observations rename to asset_observations;

alter table public.assets rename column device_code to asset_code;
alter table public.assets rename column device_type to asset_classification;
alter table public.assets rename column legacy_device_id to legacy_asset_id;
alter table public.assets
  add column asset_category text not null default 'safety',
  add column asset_nomenclature text,
  add column asset_name text;
alter table public.assets
  add constraint assets_category_check
  check (asset_category in ('safety', 'measurement'));

alter table public.inspection_test_assets
  rename column safety_device_id to asset_id;
alter table public.inspection_test_assets
  rename column device_role_code to asset_role_code;
alter table public.inspection_test_answers
  rename column safety_device_id to asset_id;
alter table public.asset_observations
  rename column safety_device_id to asset_id;

-- ---------------------------------------------------------------------------
-- Rename constraints and indexes so schema diagnostics use asset terminology.
-- ---------------------------------------------------------------------------
alter table public.legacy_assets rename constraint devices_pkey to legacy_assets_pkey;
alter table public.legacy_assets rename constraint devices_public_id_key to legacy_assets_public_id_key;
alter table public.legacy_assets rename constraint devices_boiler_id_fkey to legacy_assets_boiler_id_fkey;
alter table public.legacy_assets rename constraint devices_organization_id_fkey to legacy_assets_organization_id_fkey;
alter table public.legacy_asset_tests rename constraint device_tests_pkey to legacy_asset_tests_pkey;
alter table public.legacy_asset_tests rename constraint device_tests_device_id_fkey to legacy_asset_tests_asset_id_fkey;
alter table public.legacy_asset_tests rename constraint device_tests_boiler_id_fkey to legacy_asset_tests_boiler_id_fkey;
alter table public.legacy_asset_tests rename constraint device_tests_organization_id_fkey to legacy_asset_tests_organization_id_fkey;

alter table public.assets rename constraint safety_devices_pkey to assets_pkey;
alter table public.assets rename constraint safety_devices_public_id_key to assets_public_id_key;
alter table public.assets rename constraint safety_devices_organization_id_fkey to assets_organization_id_fkey;
alter table public.assets rename constraint safety_devices_legacy_device_id_key to assets_legacy_asset_id_key;
alter table public.assets rename constraint safety_devices_legacy_device_id_fkey to assets_legacy_asset_id_fkey;
alter table public.assets rename constraint safety_devices_code_format_check to assets_code_format_check;
alter table public.assets rename constraint safety_devices_service_status_check to assets_service_status_check;
alter table public.assets rename constraint safety_devices_target_organization_fkey to assets_target_organization_fkey;
alter table public.assets rename constraint safety_devices_target_code_key to assets_target_code_key;

alter table public.inspection_test_assets
  rename constraint inspection_test_devices_pkey to inspection_test_assets_pkey;
alter table public.inspection_test_assets
  rename constraint inspection_test_devices_inspection_test_id_fkey
  to inspection_test_assets_inspection_test_id_fkey;
alter table public.inspection_test_assets
  rename constraint inspection_test_devices_safety_device_id_fkey
  to inspection_test_assets_asset_id_fkey;

alter table public.inspection_test_answers
  rename constraint inspection_test_answers_safety_device_id_fkey
  to inspection_test_answers_asset_id_fkey;
alter table public.inspection_test_answers
  rename constraint inspection_test_answers_assigned_device_fkey
  to inspection_test_answers_assigned_asset_fkey;

alter table public.asset_observations
  rename constraint safety_device_observations_pkey to asset_observations_pkey;
alter table public.asset_observations
  rename constraint safety_device_observations_device_organization_fkey
  to asset_observations_asset_organization_fkey;
alter table public.asset_observations
  rename constraint safety_device_observations_inspection_organization_fkey
  to asset_observations_inspection_organization_fkey;
alter table public.asset_observations
  rename constraint safety_device_observations_test_inspection_fkey
  to asset_observations_test_inspection_fkey;
alter table public.asset_observations
  rename constraint safety_device_observations_assigned_device_fkey
  to asset_observations_assigned_asset_fkey;

alter index public.devices_boiler_id_idx rename to legacy_assets_boiler_id_idx;
alter index public.devices_organization_id_idx rename to legacy_assets_organization_id_idx;
alter index public.devices_device_type_idx rename to legacy_assets_classification_idx;
alter index public.device_tests_device_id_tested_at_idx
  rename to legacy_asset_tests_asset_id_tested_at_idx;
alter index public.safety_devices_organization_id_idx rename to assets_organization_id_idx;
alter index public.safety_devices_target_id_idx rename to assets_target_id_idx;
alter index public.safety_devices_type_idx rename to assets_classification_idx;
alter index public.inspection_test_devices_device_id_idx
  rename to inspection_test_assets_asset_id_idx;
alter index public.inspection_test_answers_device_question_key
  rename to inspection_test_answers_asset_question_key;
alter index public.inspection_test_answers_device_id_idx
  rename to inspection_test_answers_asset_id_idx;
alter index public.safety_devices_id_organization_id_key
  rename to assets_id_organization_id_key;
alter index public.safety_device_observations_device_time_idx
  rename to asset_observations_asset_time_idx;
alter index public.safety_device_observations_inspection_id_idx
  rename to asset_observations_inspection_id_idx;

-- ---------------------------------------------------------------------------
-- Replace policies and triggers with asset-native names.
-- ---------------------------------------------------------------------------
drop policy if exists devices_deny_all on public.legacy_assets;
create policy legacy_assets_deny_all
  on public.legacy_assets for all to anon, authenticated
  using (false) with check (false);

drop policy if exists device_tests_deny_all on public.legacy_asset_tests;
create policy legacy_asset_tests_deny_all
  on public.legacy_asset_tests for all to anon, authenticated
  using (false) with check (false);

drop policy if exists safety_devices_deny_all on public.assets;
create policy assets_deny_all
  on public.assets for all to anon, authenticated
  using (false) with check (false);

drop policy if exists inspection_test_devices_deny_all
  on public.inspection_test_assets;
create policy inspection_test_assets_deny_all
  on public.inspection_test_assets for all to anon, authenticated
  using (false) with check (false);

drop policy if exists safety_device_observations_deny_all
  on public.asset_observations;
create policy asset_observations_deny_all
  on public.asset_observations for all to anon, authenticated
  using (false) with check (false);

drop trigger if exists devices_set_updated_at on public.legacy_assets;
create trigger legacy_assets_set_updated_at
  before update on public.legacy_assets
  for each row execute function public.set_updated_at();

drop trigger if exists safety_devices_set_updated_at on public.assets;
create trigger assets_set_updated_at
  before update on public.assets
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Asset-scoped validation and immutable-history functions.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_inspection_test_asset_target()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  test_target_id uuid;
  asset_target_id uuid;
begin
  select inspection.inspection_target_id
  into test_target_id
  from public.inspection_tests as test
  join public.inspections as inspection on inspection.id = test.inspection_id
  where test.id = new.inspection_test_id;

  select inspection_target_id
  into asset_target_id
  from public.assets
  where id = new.asset_id;

  if test_target_id is distinct from asset_target_id then
    raise exception 'Asset % does not belong to inspection target %',
      new.asset_id, test_target_id;
  end if;

  return new;
end;
$$;

drop trigger if exists inspection_test_devices_enforce_target
  on public.inspection_test_assets;
create trigger inspection_test_assets_enforce_target
  before insert or update on public.inspection_test_assets
  for each row execute function public.enforce_inspection_test_asset_target();

drop trigger if exists safety_test_questions_protect_answer_scope
  on public.safety_test_questions;
alter table public.safety_test_questions
  drop constraint safety_test_questions_answer_scope_check;
update public.safety_test_questions
set answer_scope = 'asset'
where answer_scope = 'device';
alter table public.safety_test_questions
  add constraint safety_test_questions_answer_scope_check
  check (answer_scope in ('test', 'asset'));

create or replace function public.enforce_inspection_test_answer_scope()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  required_scope text;
begin
  select answer_scope
  into required_scope
  from public.safety_test_questions
  where id = new.question_id;

  if required_scope = 'asset' and new.asset_id is null then
    raise exception 'Question % requires an asset-scoped answer',
      new.question_id;
  end if;

  if required_scope = 'test' and new.asset_id is not null then
    raise exception 'Question % requires a test-scoped answer',
      new.question_id;
  end if;

  return new;
end;
$$;

create or replace function public.enforce_asset_observation_scope()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  inspection_target uuid;
  asset_target uuid;
  test_inspection uuid;
begin
  select inspection_target_id
  into inspection_target
  from public.inspections
  where id = new.inspection_id;

  select inspection_target_id
  into asset_target
  from public.assets
  where id = new.asset_id;

  if inspection_target is distinct from asset_target then
    raise exception 'Asset % does not belong to inspection target %',
      new.asset_id, inspection_target;
  end if;

  if new.inspection_test_id is not null then
    select inspection_id
    into test_inspection
    from public.inspection_tests
    where id = new.inspection_test_id;

    if test_inspection is distinct from new.inspection_id then
      raise exception 'Inspection test % does not belong to inspection %',
        new.inspection_test_id, new.inspection_id;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists safety_device_observations_enforce_scope
  on public.asset_observations;
create trigger asset_observations_enforce_scope
  before insert or update on public.asset_observations
  for each row execute function public.enforce_asset_observation_scope();

create or replace function public.protect_inspection_scope_history()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.inspection_tests where inspection_id = old.id
  ) or exists (
    select 1 from public.asset_observations where inspection_id = old.id
  ) or exists (
    select 1 from public.report_package_inspections where inspection_id = old.id
  ) then
    raise exception
      'Inspection scope cannot change after results or reports exist';
  end if;
  return new;
end;
$$;

create or replace function public.protect_asset_target_history()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.inspection_test_assets where asset_id = old.id
  ) or exists (
    select 1 from public.asset_observations where asset_id = old.id
  ) then
    raise exception
      'Asset target cannot change after inspection history exists';
  end if;
  return new;
end;
$$;

drop trigger if exists safety_devices_protect_target_history on public.assets;
create trigger assets_protect_target_history
  before update of inspection_target_id, organization_id
  on public.assets
  for each row
  when (
    old.inspection_target_id is distinct from new.inspection_target_id
    or old.organization_id is distinct from new.organization_id
  )
  execute function public.protect_asset_target_history();

create trigger safety_test_questions_protect_answer_scope
  before update of answer_scope on public.safety_test_questions
  for each row
  when (old.answer_scope is distinct from new.answer_scope)
  execute function public.protect_question_answer_scope();

drop function if exists public.enforce_inspection_test_device_target();
drop function if exists public.enforce_safety_device_observation_scope();
drop function if exists public.protect_safety_device_target_history();

-- ---------------------------------------------------------------------------
-- Public ID helper and FastField table configuration.
-- ---------------------------------------------------------------------------
create or replace function public.generate_public_id(prefix text)
returns text
language plpgsql
set search_path = ''
as $$
declare
  candidate text;
begin
  if prefix not in ('blr', 'asset') then
    raise exception 'Unsupported public ID prefix: %', prefix;
  end if;

  loop
    candidate := prefix || '_' ||
      substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
    if prefix = 'blr'
      and not exists (
        select 1 from public.boilers where public_id = candidate
      ) then
      return candidate;
    end if;
    if prefix = 'asset'
      and not exists (
        select 1 from public.assets where public_id = candidate
      ) then
      return candidate;
    end if;
  end loop;
end;
$$;

delete from public.fastfield_data_tables as duplicate
where duplicate.organization_id =
    '00000000-0000-4000-8000-000000000001'
  and duplicate.purpose = 'asset_info'
  and exists (
    select 1
    from public.fastfield_data_tables as current
    where current.organization_id = duplicate.organization_id
      and current.purpose = 'device_info'
  );

update public.fastfield_data_tables
set
  purpose = 'asset_info',
  name = 'Asset Info',
  upsert_key = 'bo_assetid',
  field_mappings_json = '{
    "bo_assetid": "public_id",
    "bo_targetid": "inspection_target.public_id",
    "bo_siteid": "inspection_target.site.public_id",
    "asset_code": "asset_code",
    "asset_category": "asset_category",
    "asset_classification": "asset_classification",
    "asset_nomenclature": "asset_nomenclature",
    "asset_name": "asset_name",
    "manufacturer": "manufacturer",
    "model": "model",
    "serial_number": "serial_number"
  }'::jsonb,
  updated_at = now()
where organization_id = '00000000-0000-4000-8000-000000000001'
  and purpose = 'device_info';

-- Move registered form mappings and stored ingest results to the asset contract.
update public.fastfield_forms
set field_mappings_json =
  (field_mappings_json - 'devices') ||
  jsonb_build_object(
    'assets',
    coalesce(field_mappings_json -> 'assets', field_mappings_json -> 'devices')
  )
where field_mappings_json ? 'devices'
  and not (field_mappings_json ? 'assets');

update public.integration_events
set result_json =
  (result_json - 'devicePublicIds') ||
  jsonb_build_object('assetPublicIds', result_json -> 'devicePublicIds')
where result_json ? 'devicePublicIds'
  and not (result_json ? 'assetPublicIds');

