-- Beyond-POC operational foundation.
-- Adds inspection-job planning, versioned test questions/results, device
-- observations, certifications, and versioned report-package records.

create table if not exists public.inspection_job_number_counters (
  organization_id uuid not null
    references public.organizations (id) on delete cascade,
  job_year integer not null,
  last_value integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (organization_id, job_year),
  constraint inspection_job_number_counters_year_check
    check (job_year between 2000 and 9999),
  constraint inspection_job_number_counters_value_check
    check (last_value >= 0)
);

create or replace function public.next_inspection_job_num(
  requested_organization_id uuid,
  requested_year integer
)
returns text
language plpgsql
set search_path = ''
as $$
declare
  next_value integer;
begin
  if requested_year < 2000 or requested_year > 9999 then
    raise exception 'Inspection job year % is invalid', requested_year;
  end if;

  insert into public.inspection_job_number_counters (
    organization_id,
    job_year,
    last_value
  )
  values (requested_organization_id, requested_year, 1)
  on conflict (organization_id, job_year) do update
  set
    last_value = public.inspection_job_number_counters.last_value + 1,
    updated_at = now()
  returning last_value into next_value;

  return requested_year::text || '-' || lpad(next_value::text, 4, '0');
end;
$$;

create table if not exists public.inspection_jobs (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique,
  organization_id uuid not null
    references public.organizations (id) on delete cascade,
  site_id uuid not null,
  job_num text not null,
  title text,
  status text not null default 'draft',
  scheduled_start_date date,
  scheduled_end_date date,
  notes text,
  qr_target_url text not null,
  qr_storage_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inspection_jobs_site_organization_fkey
    foreign key (site_id, organization_id)
    references public.sites (id, organization_id) on delete cascade,
  constraint inspection_jobs_organization_job_num_key
    unique (organization_id, job_num),
  constraint inspection_jobs_job_num_format_check
    check (job_num ~ '^[0-9]{4}-[0-9]{4,}$'),
  constraint inspection_jobs_status_check
    check (status in (
      'draft',
      'planned',
      'in_progress',
      'completed',
      'cancelled'
    )),
  constraint inspection_jobs_schedule_check
    check (
      scheduled_end_date is null
      or scheduled_start_date is null
      or scheduled_end_date >= scheduled_start_date
    )
);

create unique index if not exists inspection_jobs_id_organization_id_key
  on public.inspection_jobs (id, organization_id);
create unique index if not exists inspection_jobs_id_site_organization_key
  on public.inspection_jobs (id, site_id, organization_id);
create index if not exists inspection_jobs_site_status_idx
  on public.inspection_jobs (site_id, status);
create index if not exists inspection_jobs_scheduled_start_idx
  on public.inspection_jobs (scheduled_start_date);

create table if not exists public.inspection_job_targets (
  inspection_job_id uuid not null,
  inspection_target_id uuid not null,
  organization_id uuid not null,
  site_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (inspection_job_id, inspection_target_id),
  constraint inspection_job_targets_job_scope_fkey
    foreign key (inspection_job_id, site_id, organization_id)
    references public.inspection_jobs (id, site_id, organization_id)
    on delete cascade,
  constraint inspection_job_targets_target_scope_fkey
    foreign key (inspection_target_id, site_id, organization_id)
    references public.inspection_targets (id, site_id, organization_id)
    on delete cascade
);

create index if not exists inspection_job_targets_target_id_idx
  on public.inspection_job_targets (inspection_target_id);

create or replace function public.replace_inspection_job_targets(
  requested_job_id uuid,
  requested_target_ids uuid[]
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  job_scope public.inspection_jobs%rowtype;
  expected_count integer;
  validated_count integer;
begin
  select *
  into job_scope
  from public.inspection_jobs
  where id = requested_job_id;

  if not found then
    raise exception 'Inspection job % was not found', requested_job_id;
  end if;

  select count(distinct target_id)
  into expected_count
  from unnest(requested_target_ids) as requested(target_id);

  if expected_count = 0 then
    raise exception 'An inspection job requires at least one target';
  end if;

  perform 1
  from public.inspection_targets
  where id = any(requested_target_ids)
  for share;

  select count(*)
  into validated_count
  from public.inspection_targets as target
  where target.id = any(requested_target_ids)
    and target.organization_id = job_scope.organization_id
    and target.site_id = job_scope.site_id
    and (
      target.service_status = 'active'
      or exists (
        select 1
        from public.inspection_job_targets as current_scope
        where current_scope.inspection_job_id = requested_job_id
          and current_scope.inspection_target_id = target.id
      )
    );

  insert into public.inspection_job_targets (
    inspection_job_id,
    inspection_target_id,
    organization_id,
    site_id
  )
  select
    job_scope.id,
    target_id,
    job_scope.organization_id,
    job_scope.site_id
  from (
    select distinct unnest(requested_target_ids) as target_id
  ) as requested
  on conflict (inspection_job_id, inspection_target_id) do nothing;

  if validated_count <> expected_count then
    raise exception
      'Inspection job targets must be active and belong to the job site';
  end if;

  delete from public.inspection_job_targets
  where inspection_job_id = requested_job_id
    and not (inspection_target_id = any(requested_target_ids));
end;
$$;

create or replace function public.create_inspection_job_plan(
  requested_public_id text,
  requested_organization_id uuid,
  requested_site_id uuid,
  requested_job_year integer,
  requested_title text,
  requested_status text,
  requested_scheduled_start_date date,
  requested_scheduled_end_date date,
  requested_notes text,
  requested_qr_target_url text,
  requested_target_ids uuid[]
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  created_job_id uuid;
  created_job_num text;
begin
  created_job_num := public.next_inspection_job_num(
    requested_organization_id,
    requested_job_year
  );

  insert into public.inspection_jobs (
    public_id,
    organization_id,
    site_id,
    job_num,
    title,
    status,
    scheduled_start_date,
    scheduled_end_date,
    notes,
    qr_target_url
  )
  values (
    requested_public_id,
    requested_organization_id,
    requested_site_id,
    created_job_num,
    requested_title,
    requested_status,
    requested_scheduled_start_date,
    requested_scheduled_end_date,
    requested_notes,
    requested_qr_target_url
  )
  returning id into created_job_id;

  perform public.replace_inspection_job_targets(
    created_job_id,
    requested_target_ids
  );

  return created_job_id;
end;
$$;

create or replace function public.update_inspection_job_plan(
  requested_job_id uuid,
  requested_organization_id uuid,
  requested_title text,
  requested_status text,
  requested_scheduled_start_date date,
  requested_scheduled_end_date date,
  requested_notes text,
  requested_target_ids uuid[]
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  update public.inspection_jobs
  set
    title = requested_title,
    status = requested_status,
    scheduled_start_date = requested_scheduled_start_date,
    scheduled_end_date = requested_scheduled_end_date,
    notes = requested_notes
  where id = requested_job_id
    and organization_id = requested_organization_id;

  if not found then
    raise exception 'Inspection job % was not found', requested_job_id;
  end if;

  perform public.replace_inspection_job_targets(
    requested_job_id,
    requested_target_ids
  );
end;
$$;

alter table public.inspections
  add column if not exists inspection_job_id uuid;

alter table public.inspections
  drop constraint if exists inspections_job_scope_fkey;
alter table public.inspections
  add constraint inspections_job_scope_fkey
  foreign key (inspection_job_id, site_id, organization_id)
  references public.inspection_jobs (id, site_id, organization_id)
  on delete restrict;

create unique index if not exists inspections_job_target_key
  on public.inspections (inspection_job_id, inspection_target_id)
  where inspection_job_id is not null;

alter table public.inspections
  drop constraint if exists inspections_job_target_scope_fkey;
alter table public.inspections
  add constraint inspections_job_target_scope_fkey
  foreign key (inspection_job_id, inspection_target_id)
  references public.inspection_job_targets (
    inspection_job_id,
    inspection_target_id
  )
  on delete restrict;

create table if not exists public.safety_test_definition_versions (
  id uuid primary key default gen_random_uuid(),
  test_definition_id uuid not null
    references public.safety_test_definitions (id) on delete cascade,
  version_number integer not null,
  version_label text,
  procedure_reference text,
  diagram_reference text,
  response_schema_json jsonb not null default '{}'::jsonb,
  report_config_json jsonb not null default '{}'::jsonb,
  effective_from timestamptz not null default now(),
  retired_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint safety_test_definition_versions_number_check
    check (version_number > 0),
  constraint safety_test_definition_versions_dates_check
    check (retired_at is null or retired_at >= effective_from),
  constraint safety_test_definition_versions_active_check
    check (not active or retired_at is null),
  constraint safety_test_definition_versions_definition_number_key
    unique (test_definition_id, version_number),
  constraint safety_test_definition_versions_id_definition_key
    unique (id, test_definition_id)
);

create unique index if not exists safety_test_definition_versions_one_active_idx
  on public.safety_test_definition_versions (test_definition_id)
  where active;

create table if not exists public.safety_test_questions (
  id uuid primary key default gen_random_uuid(),
  test_definition_version_id uuid not null
    references public.safety_test_definition_versions (id) on delete cascade,
  question_code text not null,
  prompt text not null,
  response_type text not null,
  answer_scope text not null default 'test',
  required boolean not null default false,
  unit_label text,
  options_json jsonb not null default '[]'::jsonb,
  validation_json jsonb not null default '{}'::jsonb,
  report_label text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint safety_test_questions_code_format_check
    check (question_code ~ '^[a-z][a-z0-9_]{1,99}$'),
  constraint safety_test_questions_response_type_check
    check (response_type in (
      'text',
      'long_text',
      'number',
      'boolean',
      'date',
      'time',
      'datetime',
      'single_select',
      'multi_select',
      'photo',
      'signature'
    )),
  constraint safety_test_questions_answer_scope_check
    check (answer_scope in ('test', 'device')),
  constraint safety_test_questions_version_code_key
    unique (test_definition_version_id, question_code),
  constraint safety_test_questions_id_version_key
    unique (id, test_definition_version_id)
);

alter table public.inspection_tests
  add column if not exists test_definition_version_id uuid;

insert into public.safety_test_definition_versions (
  test_definition_id,
  version_number,
  version_label
)
select
  id,
  1,
  'Initial imported version'
from public.safety_test_definitions
on conflict (test_definition_id, version_number) do nothing;

update public.inspection_tests as test
set test_definition_version_id = (
  select id
  from public.safety_test_definition_versions as version
  where version.test_definition_id = test.test_definition_id
  order by active desc, version_number desc
  limit 1
)
where test.test_definition_version_id is null;

create unique index if not exists inspection_tests_id_version_key
  on public.inspection_tests (id, test_definition_version_id);

alter table public.inspection_tests
  drop constraint if exists inspection_tests_definition_version_fkey;
alter table public.inspection_tests
  add constraint inspection_tests_definition_version_fkey
  foreign key (test_definition_version_id, test_definition_id)
  references public.safety_test_definition_versions (id, test_definition_id);

alter table public.inspection_tests
  alter column test_definition_version_id set not null;

create table if not exists public.inspection_test_answers (
  id uuid primary key default gen_random_uuid(),
  inspection_test_id uuid not null,
  test_definition_version_id uuid not null,
  question_id uuid not null,
  safety_device_id uuid references public.safety_devices (id),
  answer_value_json jsonb not null,
  notes text,
  source_field_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inspection_test_answers_test_version_fkey
    foreign key (inspection_test_id, test_definition_version_id)
    references public.inspection_tests (id, test_definition_version_id)
    on delete cascade,
  constraint inspection_test_answers_question_version_fkey
    foreign key (question_id, test_definition_version_id)
    references public.safety_test_questions (id, test_definition_version_id),
  constraint inspection_test_answers_assigned_device_fkey
    foreign key (inspection_test_id, safety_device_id)
    references public.inspection_test_devices (
      inspection_test_id,
      safety_device_id
    )
);

create unique index if not exists inspection_test_answers_test_question_key
  on public.inspection_test_answers (inspection_test_id, question_id)
  where safety_device_id is null;
create unique index if not exists inspection_test_answers_device_question_key
  on public.inspection_test_answers (
    inspection_test_id,
    question_id,
    safety_device_id
  )
  where safety_device_id is not null;
create index if not exists inspection_test_answers_device_id_idx
  on public.inspection_test_answers (safety_device_id)
  where safety_device_id is not null;

create unique index if not exists safety_devices_id_organization_id_key
  on public.safety_devices (id, organization_id);
create unique index if not exists inspections_id_organization_id_key
  on public.inspections (id, organization_id);
create unique index if not exists inspection_tests_id_inspection_id_key
  on public.inspection_tests (id, inspection_id);

create table if not exists public.safety_device_observations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations (id) on delete cascade,
  safety_device_id uuid not null,
  inspection_id uuid not null,
  inspection_test_id uuid
    references public.inspection_tests (id) on delete cascade,
  observed_at timestamptz not null default now(),
  result text,
  observed_condition text,
  manufacturer text,
  model text,
  serial_number text,
  install_date date,
  set_point text,
  trip_point text,
  readings_json jsonb not null default '{}'::jsonb,
  technician_notes text,
  created_at timestamptz not null default now(),
  constraint safety_device_observations_device_organization_fkey
    foreign key (safety_device_id, organization_id)
    references public.safety_devices (id, organization_id),
  constraint safety_device_observations_inspection_organization_fkey
    foreign key (inspection_id, organization_id)
    references public.inspections (id, organization_id)
    on delete cascade,
  constraint safety_device_observations_test_inspection_fkey
    foreign key (inspection_test_id, inspection_id)
    references public.inspection_tests (id, inspection_id)
    on delete cascade,
  constraint safety_device_observations_assigned_device_fkey
    foreign key (inspection_test_id, safety_device_id)
    references public.inspection_test_devices (
      inspection_test_id,
      safety_device_id
    )
);

create index if not exists safety_device_observations_device_time_idx
  on public.safety_device_observations (safety_device_id, observed_at desc);
create index if not exists safety_device_observations_inspection_id_idx
  on public.safety_device_observations (inspection_id);

create table if not exists public.inspection_certifications (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null
    references public.inspections (id) on delete cascade,
  certification_type text not null default 'technician',
  statement_snapshot text not null,
  signed_by_name text not null,
  signed_by_title text,
  signed_by_company text,
  signed_at timestamptz not null,
  signature_storage_path text,
  created_at timestamptz not null default now(),
  constraint inspection_certifications_type_check
    check (certification_type in (
      'technician',
      'reviewer',
      'client_acknowledgement'
    )),
  constraint inspection_certifications_inspection_type_key
    unique (inspection_id, certification_type)
);

create table if not exists public.report_packages (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique,
  organization_id uuid not null
    references public.organizations (id) on delete cascade,
  site_id uuid not null,
  inspection_job_id uuid not null,
  version_number integer not null,
  status text not null default 'draft',
  file_name text,
  storage_bucket text,
  storage_path text,
  mime_type text,
  file_size bigint,
  checksum_sha256 text,
  generated_at timestamptz,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint report_packages_job_scope_fkey
    foreign key (inspection_job_id, site_id, organization_id)
    references public.inspection_jobs (id, site_id, organization_id)
    on delete cascade,
  constraint report_packages_job_version_key
    unique (inspection_job_id, version_number),
  constraint report_packages_version_check
    check (version_number > 0),
  constraint report_packages_status_check
    check (status in ('draft', 'generating', 'ready', 'failed', 'superseded')),
  constraint report_packages_file_size_check
    check (file_size is null or file_size >= 0)
);

create index if not exists report_packages_site_created_idx
  on public.report_packages (site_id, created_at desc);
create unique index if not exists report_packages_id_job_id_key
  on public.report_packages (id, inspection_job_id);
create unique index if not exists inspections_id_job_id_key
  on public.inspections (id, inspection_job_id);

create table if not exists public.report_package_inspections (
  report_package_id uuid not null,
  inspection_id uuid not null,
  inspection_job_id uuid not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (report_package_id, inspection_id),
  constraint report_package_inspections_package_job_fkey
    foreign key (report_package_id, inspection_job_id)
    references public.report_packages (id, inspection_job_id)
    on delete cascade,
  constraint report_package_inspections_inspection_job_fkey
    foreign key (inspection_id, inspection_job_id)
    references public.inspections (id, inspection_job_id)
);

create index if not exists report_package_inspections_inspection_id_idx
  on public.report_package_inspections (inspection_id);

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

  if required_scope = 'device' and new.safety_device_id is null then
    raise exception 'Question % requires a device-scoped answer',
      new.question_id;
  end if;

  if required_scope = 'test' and new.safety_device_id is not null then
    raise exception 'Question % requires a test-scoped answer',
      new.question_id;
  end if;

  return new;
end;
$$;

create or replace function public.enforce_safety_device_observation_scope()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  inspection_target uuid;
  device_target uuid;
  test_inspection uuid;
begin
  select inspection_target_id
  into inspection_target
  from public.inspections
  where id = new.inspection_id;

  select inspection_target_id
  into device_target
  from public.safety_devices
  where id = new.safety_device_id;

  if inspection_target is distinct from device_target then
    raise exception 'Safety device % does not belong to inspection target %',
      new.safety_device_id, inspection_target;
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

create or replace function public.enforce_report_package_inspection_scope()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  package_job_id uuid;
  observed_job_id uuid;
begin
  select inspection_job_id
  into package_job_id
  from public.report_packages
  where id = new.report_package_id;

  select inspection_job_id
  into observed_job_id
  from public.inspections
  where id = new.inspection_id;

  if package_job_id is distinct from observed_job_id then
    raise exception 'Inspection % does not belong to report package job %',
      new.inspection_id, package_job_id;
  end if;

  return new;
end;
$$;

create or replace function public.protect_inspection_scope_history()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.inspection_tests
    where inspection_id = old.id
  ) or exists (
    select 1
    from public.safety_device_observations
    where inspection_id = old.id
  ) or exists (
    select 1
    from public.report_package_inspections
    where inspection_id = old.id
  ) then
    raise exception
      'Inspection scope cannot change after results or reports exist';
  end if;
  return new;
end;
$$;

create or replace function public.protect_safety_device_target_history()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.inspection_test_devices
    where safety_device_id = old.id
  ) or exists (
    select 1
    from public.safety_device_observations
    where safety_device_id = old.id
  ) then
    raise exception
      'Safety device target cannot change after inspection history exists';
  end if;
  return new;
end;
$$;

create or replace function public.protect_question_answer_scope()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.inspection_test_answers
    where question_id = old.id
  ) then
    raise exception 'Question answer scope cannot change after answers exist';
  end if;
  return new;
end;
$$;

drop trigger if exists inspection_jobs_set_updated_at
  on public.inspection_jobs;
create trigger inspection_jobs_set_updated_at
  before update on public.inspection_jobs
  for each row execute function public.set_updated_at();

drop trigger if exists safety_test_definition_versions_set_updated_at
  on public.safety_test_definition_versions;
create trigger safety_test_definition_versions_set_updated_at
  before update on public.safety_test_definition_versions
  for each row execute function public.set_updated_at();

drop trigger if exists safety_test_questions_set_updated_at
  on public.safety_test_questions;
create trigger safety_test_questions_set_updated_at
  before update on public.safety_test_questions
  for each row execute function public.set_updated_at();

drop trigger if exists inspection_test_answers_set_updated_at
  on public.inspection_test_answers;
create trigger inspection_test_answers_set_updated_at
  before update on public.inspection_test_answers
  for each row execute function public.set_updated_at();

drop trigger if exists report_packages_set_updated_at
  on public.report_packages;
create trigger report_packages_set_updated_at
  before update on public.report_packages
  for each row execute function public.set_updated_at();

drop trigger if exists inspection_test_answers_enforce_target
  on public.inspection_test_answers;
create trigger inspection_test_answers_enforce_target
  before insert or update on public.inspection_test_answers
  for each row execute function public.enforce_inspection_test_answer_scope();

drop trigger if exists safety_device_observations_enforce_scope
  on public.safety_device_observations;
create trigger safety_device_observations_enforce_scope
  before insert or update on public.safety_device_observations
  for each row execute function public.enforce_safety_device_observation_scope();

drop trigger if exists report_package_inspections_enforce_scope
  on public.report_package_inspections;
create trigger report_package_inspections_enforce_scope
  before insert or update on public.report_package_inspections
  for each row execute function public.enforce_report_package_inspection_scope();

drop trigger if exists inspections_protect_scope_history
  on public.inspections;
create trigger inspections_protect_scope_history
  before update of inspection_target_id, site_id, organization_id
  on public.inspections
  for each row
  when (
    old.inspection_target_id is distinct from new.inspection_target_id
    or old.site_id is distinct from new.site_id
    or old.organization_id is distinct from new.organization_id
  )
  execute function public.protect_inspection_scope_history();

drop trigger if exists safety_devices_protect_target_history
  on public.safety_devices;
create trigger safety_devices_protect_target_history
  before update of inspection_target_id, organization_id
  on public.safety_devices
  for each row
  when (
    old.inspection_target_id is distinct from new.inspection_target_id
    or old.organization_id is distinct from new.organization_id
  )
  execute function public.protect_safety_device_target_history();

drop trigger if exists safety_test_questions_protect_answer_scope
  on public.safety_test_questions;
create trigger safety_test_questions_protect_answer_scope
  before update of answer_scope on public.safety_test_questions
  for each row
  when (old.answer_scope is distinct from new.answer_scope)
  execute function public.protect_question_answer_scope();

alter table public.inspection_job_number_counters enable row level security;
alter table public.inspection_jobs enable row level security;
alter table public.inspection_job_targets enable row level security;
alter table public.safety_test_definition_versions enable row level security;
alter table public.safety_test_questions enable row level security;
alter table public.inspection_test_answers enable row level security;
alter table public.safety_device_observations enable row level security;
alter table public.inspection_certifications enable row level security;
alter table public.report_packages enable row level security;
alter table public.report_package_inspections enable row level security;

drop policy if exists inspection_job_number_counters_deny_all
  on public.inspection_job_number_counters;
create policy inspection_job_number_counters_deny_all
  on public.inspection_job_number_counters for all to anon, authenticated
  using (false) with check (false);

drop policy if exists inspection_jobs_deny_all on public.inspection_jobs;
create policy inspection_jobs_deny_all
  on public.inspection_jobs for all to anon, authenticated
  using (false) with check (false);

drop policy if exists inspection_job_targets_deny_all
  on public.inspection_job_targets;
create policy inspection_job_targets_deny_all
  on public.inspection_job_targets for all to anon, authenticated
  using (false) with check (false);

drop policy if exists safety_test_definition_versions_deny_all
  on public.safety_test_definition_versions;
create policy safety_test_definition_versions_deny_all
  on public.safety_test_definition_versions for all to anon, authenticated
  using (false) with check (false);

drop policy if exists safety_test_questions_deny_all
  on public.safety_test_questions;
create policy safety_test_questions_deny_all
  on public.safety_test_questions for all to anon, authenticated
  using (false) with check (false);

drop policy if exists inspection_test_answers_deny_all
  on public.inspection_test_answers;
create policy inspection_test_answers_deny_all
  on public.inspection_test_answers for all to anon, authenticated
  using (false) with check (false);

drop policy if exists safety_device_observations_deny_all
  on public.safety_device_observations;
create policy safety_device_observations_deny_all
  on public.safety_device_observations for all to anon, authenticated
  using (false) with check (false);

drop policy if exists inspection_certifications_deny_all
  on public.inspection_certifications;
create policy inspection_certifications_deny_all
  on public.inspection_certifications for all to anon, authenticated
  using (false) with check (false);

drop policy if exists report_packages_deny_all on public.report_packages;
create policy report_packages_deny_all
  on public.report_packages for all to anon, authenticated
  using (false) with check (false);

drop policy if exists report_package_inspections_deny_all
  on public.report_package_inspections;
create policy report_package_inspections_deny_all
  on public.report_package_inspections for all to anon, authenticated
  using (false) with check (false);
