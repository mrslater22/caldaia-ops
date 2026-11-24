import { isUniqueViolation } from "./site-visit-repository.ts";
import type {
  AssetOnboardingRepository,
  AssetParentTarget,
  AssetRecord,
} from "./asset-onboarding.ts";
import type { InsertConflict } from "./inspection-onboarding.ts";
import { createServiceClient } from "../supabase/server.ts";

type DbError = { code?: string; message: string } | null;
type Row = Record<string, unknown>;

const ASSET_COLUMNS =
  "id, public_id, organization_id, inspection_target_id, asset_code, asset_category, asset_classification, asset_nomenclature, asset_name, manufacturer, model, serial_number";

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

function nullable(row: Row, key: string): string | null {
  const value = row[key];
  if (value == null) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function assetFrom(row: Row): AssetRecord {
  const category = text(row, "asset_category");
  if (category !== "safety" && category !== "measurement") {
    throw new Error(`Unexpected asset_category "${category}".`);
  }
  return {
    id: text(row, "id"),
    publicId: text(row, "public_id"),
    inspectionTargetId: text(row, "inspection_target_id"),
    organizationId: text(row, "organization_id"),
    assetCode: text(row, "asset_code"),
    assetCategory: category,
    assetClassification: text(row, "asset_classification"),
    assetNomenclature: nullable(row, "asset_nomenclature"),
    assetName: nullable(row, "asset_name"),
    manufacturer: nullable(row, "manufacturer"),
    model: nullable(row, "model"),
    serialNumber: nullable(row, "serial_number"),
  };
}

export function createSupabaseAssetOnboardingRepository(
  client = createServiceClient(),
): AssetOnboardingRepository {
  return {
    async findTargetByPublicId(organizationId, publicId) {
      const { data, error } = await client
        .from("inspection_targets")
        .select("id, public_id, site_id, organization_id")
        .eq("organization_id", organizationId)
        .eq("public_id", publicId)
        .maybeSingle();
      if (error) required(error, "Failed to look up the inspection target.");
      if (!data) return null;
      const siteId = text(data, "site_id");
      const { data: site, error: siteError } = await client
        .from("sites")
        .select("public_id")
        .eq("id", siteId)
        .eq("organization_id", organizationId)
        .maybeSingle();
      if (siteError) required(siteError, "Failed to look up the target site.");
      if (!site) {
        throw new Error(
          `Inspection target ${publicId} has no site in this organization.`,
        );
      }
      const parent: AssetParentTarget = {
        id: text(data, "id"),
        publicId: text(data, "public_id"),
        siteId,
        sitePublicId: text(site, "public_id"),
        organizationId: text(data, "organization_id"),
      };
      return parent;
    },

    async findAssetByPublicId(organizationId, publicId) {
      const { data, error } = await client
        .from("assets")
        .select(ASSET_COLUMNS)
        .eq("organization_id", organizationId)
        .eq("public_id", publicId)
        .maybeSingle();
      if (error) required(error, "Failed to look up the asset.");
      return data ? assetFrom(data) : null;
    },

    async findAssetByCode(targetId, assetCode) {
      const { data, error } = await client
        .from("assets")
        .select(ASSET_COLUMNS)
        .eq("inspection_target_id", targetId)
        .eq("asset_code", assetCode)
        .maybeSingle();
      if (error) required(error, "Failed to look up the asset code.");
      return data ? assetFrom(data) : null;
    },

    async insertAsset(input) {
      const { data, error } = await client
        .from("assets")
        .insert({
          public_id: input.publicId,
          organization_id: input.organizationId,
          inspection_target_id: input.inspectionTargetId,
          asset_code: input.assetCode,
          asset_category: input.assetCategory,
          asset_classification: input.assetClassification,
          asset_nomenclature: input.assetNomenclature,
          asset_name: input.assetName,
          manufacturer: input.manufacturer,
          model: input.model,
          serial_number: input.serialNumber,
          service_status: "active",
        })
        .select(ASSET_COLUMNS)
        .single();
      if (error) {
        if (isUniqueViolation(error)) return { conflict: true } satisfies InsertConflict;
        required(error, "Failed to create the asset.");
      }
      return assetFrom(data as Row);
    },

    async updateAsset(id, input) {
      const { data, error } = await client
        .from("assets")
        .update({
          asset_code: input.assetCode,
          asset_category: input.assetCategory,
          asset_classification: input.assetClassification,
          asset_nomenclature: input.assetNomenclature,
          asset_name: input.assetName,
          manufacturer: input.manufacturer,
          model: input.model,
          serial_number: input.serialNumber,
        })
        .eq("id", id)
        .eq("organization_id", input.organizationId)
        .select(ASSET_COLUMNS)
        .maybeSingle();
      if (error) required(error, "Failed to update the asset.");
      if (!data) throw new Error("Asset not found.");
      return assetFrom(data);
    },
  };
}

export function createDefaultAssetOnboardingRepository(): AssetOnboardingRepository {
  return createSupabaseAssetOnboardingRepository();
}
