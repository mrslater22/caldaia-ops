import { isUniqueViolation } from "./site-visit-repository.ts";
import type {
  InspectionOnboardingRepository,
  InspectionTargetRecord,
  InsertConflict,
  ParentSite,
} from "./inspection-onboarding.ts";
import { createServiceClient } from "../supabase/server.ts";

type DbError = { code?: string; message: string } | null;
type Row = Record<string, unknown>;

const TARGET_COLUMNS =
  "id, public_id, site_id, organization_id, target_type, target_code, display_name";

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

function targetFrom(row: Row): InspectionTargetRecord {
  const targetType = text(row, "target_type");
  if (targetType !== "boiler" && targetType !== "plant") {
    throw new Error(`Unexpected target_type "${targetType}".`);
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

function siteFrom(row: Row): ParentSite {
  return {
    id: text(row, "id"),
    publicId: text(row, "public_id"),
    siteCode: text(row, "site_code"),
    organizationId: text(row, "organization_id"),
  };
}

export function createSupabaseInspectionOnboardingRepository(
  client = createServiceClient(),
): InspectionOnboardingRepository {
  return {
    async findSiteByPublicId(organizationId, publicId) {
      const { data, error } = await client
        .from("sites")
        .select("id, public_id, site_code, organization_id")
        .eq("organization_id", organizationId)
        .eq("public_id", publicId)
        .maybeSingle();
      if (error) required(error, "Failed to look up the site.");
      return data ? siteFrom(data) : null;
    },

    async findSiteByCode(organizationId, siteCode) {
      const { data, error } = await client
        .from("sites")
        .select("id, public_id, site_code, organization_id")
        .eq("organization_id", organizationId)
        .eq("site_code", siteCode.toUpperCase())
        .maybeSingle();
      if (error) required(error, "Failed to look up the site code.");
      return data ? siteFrom(data) : null;
    },

    async findTargetByPublicId(organizationId, publicId) {
      const { data, error } = await client
        .from("inspection_targets")
        .select(TARGET_COLUMNS)
        .eq("organization_id", organizationId)
        .eq("public_id", publicId)
        .maybeSingle();
      if (error) required(error, "Failed to look up the inspection target.");
      return data ? targetFrom(data) : null;
    },

    async findTargetByCode(siteId, targetCode) {
      const { data, error } = await client
        .from("inspection_targets")
        .select(TARGET_COLUMNS)
        .eq("site_id", siteId)
        .eq("target_code", targetCode)
        .maybeSingle();
      if (error) required(error, "Failed to look up the inspection code.");
      return data ? targetFrom(data) : null;
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
        .select(TARGET_COLUMNS)
        .single();
      if (error) {
        if (isUniqueViolation(error)) return { conflict: true } satisfies InsertConflict;
        required(error, "Failed to create the inspection target.");
      }
      return targetFrom(data as Row);
    },

    async updateTarget(id, input) {
      const { data, error } = await client
        .from("inspection_targets")
        .update({
          target_type: input.targetType,
          target_code: input.targetCode,
          display_name: input.displayName,
        })
        .eq("id", id)
        .eq("organization_id", input.organizationId)
        .select(TARGET_COLUMNS)
        .maybeSingle();
      if (error) required(error, "Failed to update the inspection target.");
      if (!data) throw new Error("Inspection target not found.");
      return targetFrom(data);
    },

    async ensureTargetDetails(targetId, targetType) {
      const drop =
        targetType === "boiler" ? "plant_target_details" : "boiler_target_details";
      const keep =
        targetType === "boiler" ? "boiler_target_details" : "plant_target_details";
      const removed = await client
        .from(drop)
        .delete()
        .eq("inspection_target_id", targetId);
      if (removed.error) {
        throw new Error(removed.error.message);
      }
      const inserted = await client.from(keep).insert({
        inspection_target_id: targetId,
      });
      if (inserted.error && !isUniqueViolation(inserted.error)) {
        throw new Error(inserted.error.message);
      }
    },
  };
}

export function createDefaultInspectionOnboardingRepository(): InspectionOnboardingRepository {
  return createSupabaseInspectionOnboardingRepository();
}
