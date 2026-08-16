# BoilerOps Development Summary

**Client:** Caldaia Controls  
**Project:** BoilerOps Intelligence Platform  
**Last updated:** August 15, 2026
**Current phase:** Operational foundation and inspection-job planning

## Executive Summary

BoilerOps is being developed as the central system of record for boiler sites,
equipment, safety devices, inspections, reports, and future operational
intelligence. FastField will remain the field data-collection platform, while
BoilerOps will manage structured records, QR-linked assets, historical data,
client access, and integrations.

The current development effort has moved beyond the initial proof of concept.
In addition to Site Onboarding and FastField integration, BoilerOps now has the
data foundation and first administrative workflow for planning inspection jobs,
assigning Boiler and Plant scope, generating job numbers, and issuing job QR
codes.

## Completed Development

### Platform foundation

- Established the Next.js BoilerOps application and Supabase PostgreSQL backend.
- Added an initial protected administration interface.
- Created secure server-side Supabase access and private storage buckets for
  reports and QR-code images.
- Established immutable integration-event storage for incoming FastField data.
- Added a FastField form registry so each form can have its own purpose and
  field mapping.

### FastField submission intake

- Created the FastField JSON submission endpoint.
- Added optional shared-secret authentication for inbound submissions.
- Added submission idempotency to prevent duplicate processing.
- Added administrative capture and reprocessing support.
- Validated actual submission structures from the Site Onboarding and Boiler
  Onboarding forms.

### Site Onboarding

- Validated FastField Site Onboarding form `1244818`, version 10.
- Mapped the site name, site code, FastField source ID, and primary contact
  details.
- Added the Supabase `sites` data model.
- Added safe matching for new and updated sites using:
  1. BoilerOps Site ID
  2. FastField source Site ID
  3. Organization and Site Code
- Added 3–4 character Site Code validation.
- Added immutable BoilerOps public IDs for links and integrations.
- Added automatic QR-code generation and private Supabase Storage.
- Added site information and QR image lookup routes.
- Added authenticated Site Management for creating and editing sites, reviewing
  FastField sync status, regenerating QR codes, and viewing or downloading QR
  images.

### FastField Data Table synchronization

- Designed reusable configuration for multiple FastField Data Tables rather
  than creating site-specific integration code for every table.
- Added configuration for table identity, purpose, endpoint, HTTP method,
  upsert key, field mappings, and activation status.
- Added generic synchronization records for sites, boilers, devices, and future
  entity types.
- Added payload hashing, external record IDs, synchronization status, attempt
  history, and error reporting.
- Aligned the integration with FastField's three-table account limit:
  1. Site Info
  2. Inspection Info
  3. Device Info
- Seeded stable BoilerOps upsert keys for each table.
- Kept API credentials outside the database in protected environment settings.
- Added authenticated Data Table administration for editing table IDs,
  FastField endpoints, HTTP methods, upsert keys, field mappings, and active
  status while enforcing the three-table account limit.

### Inspection-target and safety-device modeling

- Evaluated a representative Boiler Onboarding submission.
- Defined Boiler and Plant as persistent inspectable target types rather than
  historical inspection records.
- Separated inspectable targets from completed inspection events.
- Confirmed that one inspection contains multiple safety-test report sections.
- Confirmed that each test section can contain one or more participating safety
  devices.
- Defined the intended relationship:

  `Inspection → Safety Test / Report Section → Devices Tested`

- Established the planned human-readable asset label format:

  `SITE-BOILER-DEVICE`, for example `CAP-BLR1-WL1`

- Kept human-readable labels separate from immutable database and QR
  identifiers so labels can change without breaking links or history.

### Inspection jobs and reporting foundation

- Added administrator-created inspection jobs scoped to one Site and one or
  more Boiler or Plant targets.
- Added automatic job numbers in the approved `YYYY-####` format.
- Added immutable BoilerOps Job IDs and stored job QR codes.
- Added a public job lookup containing only the job, Site, and target IDs needed
  for FastField prefill.
- Added an authenticated job-planning interface for creating, editing, and
  reviewing jobs and downloading or regenerating job QR codes.
- Added a minimal target-creation path so administrators can establish job
  scope without direct database changes.
- Added versioned safety-test definitions and structured question records.
- Added structured inspection answers at test or device scope.
- Added append-only safety-device observations and inspection certifications.
- Added versioned report-package records that can combine multiple target
  inspections into one final client deliverable.

## Current Technical Status

- The initial Site Onboarding migration has been applied.
- The generic FastField Data Table configuration migration is ready to apply:
  `20260814_fastfield_data_table_config.sql`.
- The inspectable-target and inspection-history migration is ready to apply:
  `20260815_inspection_target_model.sql`.
- The operational workflow foundation migration is ready to apply:
  `20260816_operational_workflow_foundation.sql`.
- TypeScript validation passes.
- Source linting passes with no errors.
- The Site Info synchronization code is ready for the account-specific
  FastField Data Table endpoint and authentication configuration.

## Next Milestone

Apply and validate the operational workflow:

1. Apply the generic FastField Data Table configuration migration.
2. Apply the inspection-target migration.
3. Apply the operational workflow foundation migration.
4. Create Boiler and Plant targets for a test Site.
5. Create an inspection job and confirm its `YYYY-####` number.
6. Verify the job QR image and public job lookup payload.
7. Test Job QR prefill and hidden ID persistence in a blank FastField form.
8. Complete the existing live Site Info synchronization test.

## Subsequent Development

After Site Onboarding is validated:

- Update target onboarding to select an existing site using `bo_siteid`.
- Validate Inspection Info and Device Info column names and payloads.
- Implement hierarchical human-readable labels such as `CAP-BLR1-WL1`.
- Generate the technician job-summary PDF containing job and permanent asset
  QR codes.
- Validate submitted Job, Site, target, and Device IDs against planned scope.
- Map all production safety-test sections from the final inspection form.
- Build the consolidated report renderer on the versioned report-package model.
- Add portal views for sites, boilers, devices, inspection history, and reports.

## Dependencies and Decisions Needed

- Obtain the account-specific FastField Data Table API endpoint and
  authentication contract.
- Confirm the final Site Info Data Table column names and data types.
- Decide what site information may be displayed through public QR links before
  production release.
- Finalize boiler and device code-generation rules, including duplicate and
  replacement-device handling.
- Confirm the final FastField question keys and repeating-section behavior
  before seeding production test-definition versions.

## Development Log

### August 12, 2026

- Validated the Site Onboarding JSON payload.
- Implemented Site Onboarding persistence and QR generation.
- Added Site Info Data Table synchronization.
- Generalized synchronization configuration for future FastField tables.
- Established Site Info, Inspection Info, and Device Info as the three
  FastField Data Tables.
- Added the Boiler/Plant inspection-target model and device relationships.
- Documented the proposed relational model for boilers, safety tests, and
  safety devices.

### August 15, 2026

- Added the inspection-job, test-answer, observation, certification, and
  report-package schema foundation.
- Implemented automatic `YYYY-####` job numbering.
- Added inspection-job administration, target assignment, and job QR handling.
- Added public job lookup JSON for the upcoming FastField QR-prefill test.
