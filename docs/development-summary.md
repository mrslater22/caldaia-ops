# BoilerOps Development Summary

**Client:** Caldaia Controls  
**Project:** BoilerOps Intelligence Platform  
**Last updated:** August 12, 2026  
**Current phase:** FastField integration and asset onboarding proof of concept

## Executive Summary

BoilerOps is being developed as the central system of record for boiler sites,
equipment, safety devices, inspections, reports, and future operational
intelligence. FastField will remain the field data-collection platform, while
BoilerOps will manage structured records, QR-linked assets, historical data,
client access, and integrations.

The current development effort has validated real FastField submission data and
established the initial Site Onboarding workflow. The next milestone is a live
end-to-end test that creates a site in BoilerOps, generates its QR code, and
synchronizes the site into FastField's Site Info Data Table.

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

## Current Technical Status

- The initial Site Onboarding migration has been applied.
- The generic FastField Data Table configuration migration is ready to apply:
  `20260814_fastfield_data_table_config.sql`.
- The inspectable-target and inspection-history migration is ready to apply:
  `20260815_inspection_target_model.sql`.
- TypeScript validation passes.
- Source linting passes with no errors.
- The Site Info synchronization code is ready for the account-specific
  FastField Data Table endpoint and authentication configuration.

## Next Milestone

Complete the Site Onboarding live test:

1. Apply the generic FastField Data Table configuration migration.
2. Enter the Site Info table ID and row-upsert endpoint.
3. Confirm `bo_siteid` is configured as the unique FastField lookup key.
4. Submit the Site Onboarding form to the production ingestion endpoint.
5. Verify the site record in Supabase.
6. Verify the generated site QR code.
7. Verify the Site Info row in FastField.
8. Submit an update form containing `bo_siteid` and confirm the existing site is
   updated rather than duplicated.

## Subsequent Development

After Site Onboarding is validated:

- Update target onboarding to select an existing site using `bo_siteid`.
- Validate Inspection Info and Device Info column names and payloads.
- Implement hierarchical human-readable labels such as `CAP-BLR1-WL1`.
- Map all production safety-test sections from the final inspection form.
- Add report and attachment synchronization.
- Add portal views for sites, boilers, devices, inspection history, and reports.

## Dependencies and Decisions Needed

- Obtain the account-specific FastField Data Table API endpoint and
  authentication contract.
- Confirm the final Site Info Data Table column names and data types.
- Decide what site information may be displayed through public QR links before
  production release.
- Finalize boiler and device code-generation rules, including duplicate and
  replacement-device handling.

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
