import { assignPayloadField, readMappedField } from "./submission-fields.ts";

/**
 * Canonical FastField keys for Inspection Target onboarding.
 * Not validated against a live payload. Registry field_mappings_json may
 * point a domain field at a different key; the canonical key remains a fallback.
 */
export const INSPECTION_ONBOARDING_FIELD_KEYS = {
  bo_targetid: "bo_targetid",
  bo_siteid: "bo_siteid",
  site_code: "site_code",
  inspection_scope: "inspection_scope",
  inspection_code: "inspection_code",
  inspection_name: "inspection_name",
} as const;

export type InspectionOnboardingFieldKey =
  keyof typeof INSPECTION_ONBOARDING_FIELD_KEYS;

export type InspectionOnboardingFieldMappings = Partial<
  Record<InspectionOnboardingFieldKey, string>
>;

export type MappedInspectionOnboarding = {
  bo_targetid: string | null;
  bo_siteid: string | null;
  site_code: string | null;
  inspection_scope: "boiler" | "plant";
  inspection_code: string;
  inspection_name: string;
};

const CODE_PATTERN = /^[A-Z0-9]{2,8}$/;
const SITE_CODE_PATTERN = /^[A-Z0-9]{3,4}$/;

export function mapInspectionOnboarding(
  payload: Record<string, unknown>,
  mappings: InspectionOnboardingFieldMappings = {},
): MappedInspectionOnboarding {
  const keys = INSPECTION_ONBOARDING_FIELD_KEYS;
  const scopeRaw = readMappedField(
    payload,
    mappings,
    "inspection_scope",
    keys.inspection_scope,
  )?.toLowerCase();
  if (scopeRaw !== "boiler" && scopeRaw !== "plant") {
    throw new Error(
      "Inspection onboarding requires inspection_scope of boiler or plant. No inspection target was created.",
    );
  }

  const inspectionCode = readMappedField(
    payload,
    mappings,
    "inspection_code",
    keys.inspection_code,
  )?.toUpperCase();
  if (!inspectionCode || !CODE_PATTERN.test(inspectionCode)) {
    throw new Error(
      "Inspection onboarding inspection_code must be 2 to 8 letters or digits. No inspection target was created.",
    );
  }

  const inspectionName = readMappedField(
    payload,
    mappings,
    "inspection_name",
    keys.inspection_name,
  );
  if (!inspectionName) {
    throw new Error(
      "Inspection onboarding requires inspection_name. No inspection target was created.",
    );
  }

  const boSiteId = readMappedField(payload, mappings, "bo_siteid", keys.bo_siteid);
  const siteCodeRaw = readMappedField(
    payload,
    mappings,
    "site_code",
    keys.site_code,
  )?.toUpperCase();
  const siteCode =
    siteCodeRaw && SITE_CODE_PATTERN.test(siteCodeRaw) ? siteCodeRaw : null;
  if (!boSiteId && !siteCode) {
    throw new Error(
      "Inspection onboarding requires bo_siteid or a 3 to 4 character site_code. No inspection target was created.",
    );
  }

  return {
    bo_targetid: readMappedField(
      payload,
      mappings,
      "bo_targetid",
      keys.bo_targetid,
    ),
    bo_siteid: boSiteId,
    site_code: siteCode,
    inspection_scope: scopeRaw,
    inspection_code: inspectionCode,
    inspection_name: inspectionName,
  };
}

/**
 * Publish the saved target id and parent site id on the canonical keys
 * the Inspection Info field map reads. Other columns are filled only when
 * the submission left them blank.
 */
export function payloadForInspectionInfoSync(
  payload: Record<string, unknown>,
  mapped: MappedInspectionOnboarding,
  ids: { bo_targetid: string; bo_siteid: string },
  mappings: InspectionOnboardingFieldMappings = {},
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...payload };
  const keys = INSPECTION_ONBOARDING_FIELD_KEYS;
  writeGenerated(next, keys.bo_targetid, mappings.bo_targetid, ids.bo_targetid);
  writeGenerated(next, keys.bo_siteid, mappings.bo_siteid, ids.bo_siteid);
  assignPayloadField(next, keys.inspection_scope, mapped.inspection_scope);
  assignPayloadField(next, keys.inspection_code, mapped.inspection_code);
  assignPayloadField(next, keys.inspection_name, mapped.inspection_name);
  assignPayloadField(next, keys.site_code, mapped.site_code);
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
