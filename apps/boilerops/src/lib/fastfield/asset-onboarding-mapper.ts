import { assignPayloadField, readMappedField } from "./submission-fields.ts";

/**
 * Canonical FastField keys for Asset onboarding.
 * Not validated against a live payload. Registry field_mappings_json may
 * point a domain field at a different key; the canonical key remains a fallback.
 */
export const ASSET_ONBOARDING_FIELD_KEYS = {
  bo_assetid: "bo_assetid",
  bo_targetid: "bo_targetid",
  bo_siteid: "bo_siteid",
  asset_code: "asset_code",
  asset_category: "asset_category",
  asset_classification: "asset_classification",
  asset_nomenclature: "asset_nomenclature",
  asset_name: "asset_name",
  manufacturer: "manufacturer",
  model: "model",
  serial_number: "serial_number",
} as const;

export type AssetOnboardingFieldKey = keyof typeof ASSET_ONBOARDING_FIELD_KEYS;

export type AssetOnboardingFieldMappings = Partial<
  Record<AssetOnboardingFieldKey, string>
>;

export type MappedAssetOnboarding = {
  bo_assetid: string | null;
  bo_targetid: string;
  bo_siteid: string | null;
  asset_code: string;
  asset_category: "safety" | "measurement";
  asset_classification: string;
  asset_nomenclature: string | null;
  asset_name: string | null;
  manufacturer: string | null;
  model: string | null;
  serial_number: string | null;
};

const CODE_PATTERN = /^[A-Z0-9]{2,8}$/;

export function mapAssetOnboarding(
  payload: Record<string, unknown>,
  mappings: AssetOnboardingFieldMappings = {},
): MappedAssetOnboarding {
  const keys = ASSET_ONBOARDING_FIELD_KEYS;
  const boTargetId = readMappedField(
    payload,
    mappings,
    "bo_targetid",
    keys.bo_targetid,
  );
  if (!boTargetId) {
    throw new Error(
      "Asset onboarding requires bo_targetid. No asset was created.",
    );
  }

  const assetCode = readMappedField(
    payload,
    mappings,
    "asset_code",
    keys.asset_code,
  )?.toUpperCase();
  if (!assetCode || !CODE_PATTERN.test(assetCode)) {
    throw new Error(
      "Asset onboarding asset_code must be 2 to 8 letters or digits. No asset was created.",
    );
  }

  const classification = readMappedField(
    payload,
    mappings,
    "asset_classification",
    keys.asset_classification,
  );
  if (!classification) {
    throw new Error(
      "Asset onboarding requires asset_classification. No asset was created.",
    );
  }

  const categoryRaw = readMappedField(
    payload,
    mappings,
    "asset_category",
    keys.asset_category,
  )?.toLowerCase();
  let assetCategory: "safety" | "measurement" = "safety";
  if (categoryRaw) {
    if (categoryRaw !== "safety" && categoryRaw !== "measurement") {
      throw new Error(
        "Asset onboarding asset_category must be safety or measurement. No asset was created.",
      );
    }
    assetCategory = categoryRaw;
  }

  return {
    bo_assetid: readMappedField(payload, mappings, "bo_assetid", keys.bo_assetid),
    bo_targetid: boTargetId,
    bo_siteid: readMappedField(payload, mappings, "bo_siteid", keys.bo_siteid),
    asset_code: assetCode,
    asset_category: assetCategory,
    asset_classification: classification,
    asset_nomenclature: readMappedField(
      payload,
      mappings,
      "asset_nomenclature",
      keys.asset_nomenclature,
    ),
    asset_name: readMappedField(payload, mappings, "asset_name", keys.asset_name),
    manufacturer: readMappedField(
      payload,
      mappings,
      "manufacturer",
      keys.manufacturer,
    ),
    model: readMappedField(payload, mappings, "model", keys.model),
    serial_number: readMappedField(
      payload,
      mappings,
      "serial_number",
      keys.serial_number,
    ),
  };
}

/**
 * Publish the saved asset id plus the parent target and site ids. Other
 * columns are filled only when the submission left them blank.
 */
export function payloadForAssetInfoSync(
  payload: Record<string, unknown>,
  mapped: MappedAssetOnboarding,
  ids: { bo_assetid: string; bo_targetid: string; bo_siteid: string },
  mappings: AssetOnboardingFieldMappings = {},
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...payload };
  const keys = ASSET_ONBOARDING_FIELD_KEYS;
  writeGenerated(next, keys.bo_assetid, mappings.bo_assetid, ids.bo_assetid);
  writeGenerated(next, keys.bo_targetid, mappings.bo_targetid, ids.bo_targetid);
  writeGenerated(next, keys.bo_siteid, mappings.bo_siteid, ids.bo_siteid);
  assignPayloadField(next, keys.asset_code, mapped.asset_code);
  assignPayloadField(next, keys.asset_category, mapped.asset_category);
  assignPayloadField(next, keys.asset_classification, mapped.asset_classification);
  assignPayloadField(next, keys.asset_nomenclature, mapped.asset_nomenclature);
  assignPayloadField(next, keys.asset_name, mapped.asset_name);
  assignPayloadField(next, keys.manufacturer, mapped.manufacturer);
  assignPayloadField(next, keys.model, mapped.model);
  assignPayloadField(next, keys.serial_number, mapped.serial_number);
  return next;
}

function writeGenerated(
  payload: Record<string, unknown>,
  canonicalKey: string,
  mappedKey: string | undefined,
  value: string,
): void {
  assignPayloadField(payload, canonicalKey, value, true);
  const override = mappedKey?.trim();
  if (override && override !== canonicalKey) {
    assignPayloadField(payload, override, value, true);
  }
}
