import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  DeviceTestRow,
  ReportRow,
  ReportSummary,
  SiteRef,
  SiteVisitRepository,
  TargetRef,
  VisitRow,
} from "./site-visit.ts";
import { createServiceClient } from "../supabase/server.ts";

type DbError = { code?: string; message: string } | null;

type Row = Record<string, unknown>;

export function isUniqueViolation(error: DbError): boolean {
  if (!error) return false;
  if (error.code === "23505") return true;
  return /duplicate key|unique constraint/i.test(error.message);
}

function required(error: DbError, fallback: string): never {
  throw new Error(error?.message || fallback);
}

function text(row: Row, key: string): string {
  const value = row[key];
  if (typeof value !== "string" || !value) {
    throw new Error(`Expected ${key} on the database row.`);
  }
  return value;
}

function siteFrom(row: Row): SiteRef {
  return {
    id: text(row, "id"),
    publicId: text(row, "public_id"),
    organizationId: text(row, "organization_id"),
    siteCode: text(row, "site_code"),
    facilityName: text(row, "facility_name"),
  };
}

function targetFrom(row: Row): TargetRef {
  const targetType = text(row, "target_type");
  if (targetType !== "boiler" && targetType !== "plant") {
    throw new Error(`Unexpected target type "${targetType}".`);
  }
  return {
    id: text(row, "id"),
    publicId: text(row, "public_id"),
    siteId: text(row, "site_id"),
    organizationId: text(row, "organization_id"),
    targetType,
    targetCode: text(row, "target_code"),
    displayName: text(row, "display_name"),
  };
}

function visitFrom(row: Row, sitePublicId: string): VisitRow {
  const status = text(row, "status");
  if (status !== "open" && status !== "report_ready") {
    throw new Error(`Unexpected site visit status "${status}".`);
  }
  return {
    id: text(row, "id"),
    publicId: text(row, "public_id"),
    organizationId: text(row, "organization_id"),
    siteId: text(row, "site_id"),
    sitePublicId,
    externalVisitId: text(row, "external_visit_id"),
    status,
  };
}

function testFrom(row: Row): DeviceTestRow {
  const deviceType = text(row, "device_type");
  if (deviceType !== "high_pressure" && deviceType !== "low_pressure") {
    throw new Error(`Unexpected device type "${deviceType}".`);
  }
  return {
    id: text(row, "id"),
    publicId: text(row, "public_id"),
    siteVisitId: text(row, "site_visit_id"),
    organizationId: text(row, "organization_id"),
    siteId: text(row, "site_id"),
    deviceType,
    assetKey: text(row, "asset_key"),
    inspectionTargetId: text(row, "inspection_target_id"),
    targetPublicId: text(row, "target_public_id"),
    fastfieldSubmissionId: text(row, "fastfield_submission_id"),
    fastfieldFormId:
      typeof row.fastfield_form_id === "string" ? row.fastfield_form_id : null,
  };
}

function summaryFrom(value: unknown): ReportSummary {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { device_tests: [] };
  }
  const tests = (value as { device_tests?: unknown }).device_tests;
  if (!Array.isArray(tests)) return { device_tests: [] };
  return {
    device_tests: tests.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const row = item as Record<string, unknown>;
      if (typeof row.public_id !== "string") return [];
      return [
        {
          public_id: row.public_id,
          device_type: typeof row.device_type === "string" ? row.device_type : "",
          asset_key: typeof row.asset_key === "string" ? row.asset_key : "",
          target_public_id:
            typeof row.target_public_id === "string" ? row.target_public_id : "",
          fastfield_submission_id:
            typeof row.fastfield_submission_id === "string"
              ? row.fastfield_submission_id
              : "",
        },
      ];
    }),
  };
}

function reportFrom(row: Row): ReportRow {
  return {
    id: text(row, "id"),
    publicId: text(row, "public_id"),
    siteVisitId: text(row, "site_visit_id"),
    organizationId: text(row, "organization_id"),
    siteId: text(row, "site_id"),
    status: "ready",
    deviceTestCount: Number(row.device_test_count ?? 0),
    summary: summaryFrom(row.summary_json),
  };
}

async function sitePublicId(
  client: SupabaseClient,
  siteId: string,
): Promise<string> {
  const { data, error } = await client
    .from("sites")
    .select("public_id")
    .eq("id", siteId)
    .maybeSingle();
  if (error) required(error, "Failed to load the site for a visit.");
  if (!data?.public_id) throw new Error("Site public id was missing.");
  return String(data.public_id);
}

export function createSupabaseSiteVisitRepository(
  client: SupabaseClient,
): SiteVisitRepository {
  return {
    async findSiteByPublicId(organizationId, publicId) {
      const { data, error } = await client
        .from("sites")
        .select("id, public_id, organization_id, site_code, facility_name")
        .eq("organization_id", organizationId)
        .eq("public_id", publicId)
        .maybeSingle();
      if (error) required(error, "Failed to look up the site.");
      return data ? siteFrom(data) : null;
    },

    async findSiteByCode(organizationId, siteCode) {
      const { data, error } = await client
        .from("sites")
        .select("id, public_id, organization_id, site_code, facility_name")
        .eq("organization_id", organizationId)
        .eq("site_code", siteCode.toUpperCase())
        .maybeSingle();
      if (error) required(error, "Failed to look up the site code.");
      return data ? siteFrom(data) : null;
    },

    async findTargetByPublicId(publicId) {
      const { data, error } = await client
        .from("inspection_targets")
        .select(
          "id, public_id, site_id, organization_id, target_type, target_code, display_name",
        )
        .eq("public_id", publicId)
        .maybeSingle();
      if (error) required(error, "Failed to look up the asset.");
      return data ? targetFrom(data) : null;
    },

    async findTargetByCode(siteId, targetCode) {
      const { data, error } = await client
        .from("inspection_targets")
        .select(
          "id, public_id, site_id, organization_id, target_type, target_code, display_name",
        )
        .eq("site_id", siteId)
        .eq("target_code", targetCode)
        .maybeSingle();
      if (error) required(error, "Failed to look up the target code.");
      return data ? targetFrom(data) : null;
    },

    async findTargetByDisplayName(siteId, displayName) {
      const { data, error } = await client
        .from("inspection_targets")
        .select(
          "id, public_id, site_id, organization_id, target_type, target_code, display_name",
        )
        .eq("site_id", siteId)
        .eq("display_name", displayName)
        .limit(1);
      if (error) required(error, "Failed to look up the asset name.");
      const row = data?.[0];
      return row ? targetFrom(row) : null;
    },

    async insertTarget(input) {
      const { data, error } = await client
        .from("inspection_targets")
        .insert({
          public_id: input.publicId,
          organization_id: input.organizationId,
          site_id: input.siteId,
          target_type: input.targetType,
          target_code: input.targetCode,
          display_name: input.displayName,
          service_status: "active",
        })
        .select(
          "id, public_id, site_id, organization_id, target_type, target_code, display_name",
        )
        .single();
      if (error) {
        if (isUniqueViolation(error)) return { conflict: true };
        required(error, "Failed to create the inspection target.");
      }
      const target = targetFrom(data as Row);
      const details =
        input.targetType === "plant" ? "plant_target_details" : "boiler_target_details";
      const { error: detailsError } = await client.from(details).insert({
        inspection_target_id: target.id,
      });
      if (detailsError && !isUniqueViolation(detailsError)) {
        throw new Error(detailsError.message);
      }
      return target;
    },

    async findVisitById(id) {
      const { data, error } = await client
        .from("site_visits")
        .select(
          "id, public_id, organization_id, site_id, external_visit_id, status",
        )
        .eq("id", id)
        .maybeSingle();
      if (error) required(error, "Failed to load the site visit.");
      if (!data) return null;
      const publicId = await sitePublicId(client, text(data, "site_id"));
      return visitFrom(data, publicId);
    },

    async findVisitByExternalId(organizationId, externalVisitId) {
      const { data, error } = await client
        .from("site_visits")
        .select(
          "id, public_id, organization_id, site_id, external_visit_id, status",
        )
        .eq("organization_id", organizationId)
        .eq("external_visit_id", externalVisitId)
        .maybeSingle();
      if (error) required(error, "Failed to look up the site visit.");
      if (!data) return null;
      const publicId = await sitePublicId(client, text(data, "site_id"));
      return visitFrom(data, publicId);
    },

    async insertVisit(input) {
      const { data, error } = await client
        .from("site_visits")
        .insert({
          public_id: input.publicId,
          organization_id: input.organizationId,
          site_id: input.siteId,
          external_visit_id: input.externalVisitId,
          status: "open",
        })
        .select(
          "id, public_id, organization_id, site_id, external_visit_id, status",
        )
        .single();
      if (error) {
        if (isUniqueViolation(error)) return { conflict: true };
        required(error, "Failed to create the site visit.");
      }
      return visitFrom(data as Row, input.sitePublicId);
    },

    async markVisitReportReady(id) {
      const { error } = await client
        .from("site_visits")
        .update({ status: "report_ready" })
        .eq("id", id);
      if (error) required(error, "Failed to mark the site visit report ready.");
    },

    async findTestBySubmission(submissionId) {
      const { data, error } = await client
        .from("site_visit_device_tests")
        .select(
          "id, public_id, site_visit_id, organization_id, site_id, device_type, asset_key, inspection_target_id, target_public_id, fastfield_submission_id, fastfield_form_id",
        )
        .eq("fastfield_submission_id", submissionId)
        .maybeSingle();
      if (error) required(error, "Failed to look up the device test.");
      return data ? testFrom(data) : null;
    },

    async findTestByAsset(siteVisitId, deviceType, assetKey) {
      const { data, error } = await client
        .from("site_visit_device_tests")
        .select(
          "id, public_id, site_visit_id, organization_id, site_id, device_type, asset_key, inspection_target_id, target_public_id, fastfield_submission_id, fastfield_form_id",
        )
        .eq("site_visit_id", siteVisitId)
        .eq("device_type", deviceType)
        .eq("asset_key", assetKey)
        .maybeSingle();
      if (error) required(error, "Failed to look up the device test for this asset.");
      return data ? testFrom(data) : null;
    },

    async insertTest(input) {
      const { data, error } = await client
        .from("site_visit_device_tests")
        .insert({
          public_id: input.publicId,
          site_visit_id: input.siteVisitId,
          organization_id: input.organizationId,
          site_id: input.siteId,
          device_type: input.deviceType,
          asset_key: input.assetKey,
          inspection_target_id: input.inspectionTargetId,
          target_public_id: input.targetPublicId,
          fastfield_submission_id: input.fastfieldSubmissionId,
          fastfield_form_id: input.fastfieldFormId,
          mapped_json: input.mapped,
        })
        .select(
          "id, public_id, site_visit_id, organization_id, site_id, device_type, asset_key, inspection_target_id, target_public_id, fastfield_submission_id, fastfield_form_id",
        )
        .single();
      if (error) {
        if (isUniqueViolation(error)) return { conflict: true };
        required(error, "Failed to attach the device test.");
      }
      return testFrom(data as Row);
    },

    async listTests(siteVisitId) {
      const { data, error } = await client
        .from("site_visit_device_tests")
        .select(
          "id, public_id, site_visit_id, organization_id, site_id, device_type, asset_key, inspection_target_id, target_public_id, fastfield_submission_id, fastfield_form_id",
        )
        .eq("site_visit_id", siteVisitId)
        .order("created_at", { ascending: true });
      if (error) required(error, "Failed to list device tests.");
      return (data ?? []).map((row) => testFrom(row));
    },

    async findReport(siteVisitId) {
      const { data, error } = await client
        .from("site_visit_reports")
        .select(
          "id, public_id, site_visit_id, organization_id, site_id, status, device_test_count, summary_json",
        )
        .eq("site_visit_id", siteVisitId)
        .maybeSingle();
      if (error) required(error, "Failed to load the site visit report.");
      return data ? reportFrom(data) : null;
    },

    async insertReport(input) {
      const { data, error } = await client
        .from("site_visit_reports")
        .insert({
          public_id: input.publicId,
          site_visit_id: input.siteVisitId,
          organization_id: input.organizationId,
          site_id: input.siteId,
          status: "ready",
          device_test_count: input.deviceTestCount,
          summary_json: input.summary,
        })
        .select(
          "id, public_id, site_visit_id, organization_id, site_id, status, device_test_count, summary_json",
        )
        .single();
      if (error) {
        if (isUniqueViolation(error)) return { conflict: true };
        required(error, "Failed to create the site visit report.");
      }
      return reportFrom(data as Row);
    },

    async updateReport(id, input) {
      const { data, error } = await client
        .from("site_visit_reports")
        .update({
          status: "ready",
          device_test_count: input.deviceTestCount,
          summary_json: input.summary,
        })
        .eq("id", id)
        .select(
          "id, public_id, site_visit_id, organization_id, site_id, status, device_test_count, summary_json",
        )
        .single();
      if (error || !data) required(error, "Failed to update the site visit report.");
      return reportFrom(data);
    },
  };
}

export function createDefaultSiteVisitRepository(): SiteVisitRepository {
  return createSupabaseSiteVisitRepository(createServiceClient());
}
