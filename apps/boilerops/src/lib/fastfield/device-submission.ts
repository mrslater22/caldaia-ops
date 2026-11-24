import type { DeviceFormDefinition } from "./device-form-config.ts";
import { ffPick, ffValue } from "./onboarding-mapper.ts";

const NESTED_WRAPPERS = ["fields", "formData", "answers", "data", "form"] as const;

export type MappedDeviceSubmission = {
  deviceType: "high_pressure";
  siteVisitId: string | null;
  assetId: string;
  assetKey: string;
  assetType: "boiler" | "plant";
  sitePublicId: string | null;
  siteCode: string | null;
  facilityName: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

/**
 * Read a FastField answer. Top-level keys win. One-level wrappers are
 * checked only when the top-level key is missing, because some deliveries
 * nest answers. Site-info sync reads top-level keys, so the ingest path
 * copies the values it needs back to the top level before that sync.
 */
export function readSubmissionField(
  payload: Record<string, unknown>,
  key: string,
): string | null {
  const direct = ffPick(payload, [key]);
  if (direct) return direct;
  for (const wrapper of NESTED_WRAPPERS) {
    const nested = asRecord(payload[wrapper]);
    if (!nested) continue;
    const value = ffPick(nested, [key]);
    if (value) return value;
  }
  return null;
}

/**
 * Target codes are 2–8 letters or digits. Anything else stays a free-form
 * asset id and is not used as a target code.
 */
export function canonicalAssetKey(assetId: string): string {
  const trimmed = assetId.trim();
  if (trimmed.toLowerCase().startsWith("target_")) return trimmed;
  const compact = trimmed.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const alnum = trimmed.replace(/[^A-Za-z0-9]/g, "");
  if (
    compact.length >= 2 &&
    compact.length <= 8 &&
    compact.length === alnum.length &&
    alnum.length === trimmed.length
  ) {
    return compact;
  }
  return trimmed;
}

export function mapDeviceSubmission(
  payload: Record<string, unknown>,
  definition: DeviceFormDefinition,
): MappedDeviceSubmission {
  const fields = definition.fields;
  const assetId = readSubmissionField(payload, fields.assetId);
  if (!assetId) {
    throw new Error(
      `High Pressure submission is missing ${fields.assetId} (asset id of the boiler or plant).`,
    );
  }

  const assetTypeRaw = readSubmissionField(payload, fields.assetType);
  const assetType = assetTypeRaw?.toLowerCase() === "plant" ? "plant" : "boiler";
  const siteCode = readSubmissionField(payload, fields.siteCode);

  return {
    deviceType: definition.deviceType,
    siteVisitId: readSubmissionField(payload, fields.siteVisitId),
    assetId,
    assetKey: canonicalAssetKey(assetId),
    assetType,
    sitePublicId: readSubmissionField(payload, fields.sitePublicId),
    siteCode: siteCode ? siteCode.toUpperCase() : null,
    facilityName: readSubmissionField(payload, fields.facilityName),
    address: readSubmissionField(payload, fields.address),
    city: readSubmissionField(payload, fields.city),
    state: readSubmissionField(payload, fields.state)?.toUpperCase() ?? null,
    zip: readSubmissionField(payload, fields.zip),
    contactName: readSubmissionField(payload, fields.contactName),
    contactEmail: readSubmissionField(payload, fields.contactEmail)?.toLowerCase() ?? null,
    contactPhone: readSubmissionField(payload, fields.contactPhone),
  };
}

/**
 * Copy visit and site values onto the top-level payload so the existing
 * site-info upsert can write the visit ID column. Does not replace a
 * non-blank top-level value.
 */
export function payloadForSiteInfoSync(
  payload: Record<string, unknown>,
  definition: DeviceFormDefinition,
  externalVisitId: string,
  mapped: MappedDeviceSubmission,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...payload };
  const copies: Array<[string, string | null]> = [
    [definition.fields.siteVisitId, externalVisitId],
    [definition.fields.sitePublicId, mapped.sitePublicId],
    [definition.fields.siteCode, mapped.siteCode],
    [definition.fields.facilityName, mapped.facilityName],
    [definition.fields.address, mapped.address],
    [definition.fields.city, mapped.city],
    [definition.fields.state, mapped.state],
    [definition.fields.zip, mapped.zip],
    [definition.fields.contactName, mapped.contactName],
    [definition.fields.contactEmail, mapped.contactEmail],
    [definition.fields.contactPhone, mapped.contactPhone],
    // Identity-map aliases. Blank keys are filled so one Site Info field
    // map can read va_* as well as the High Pressure field names.
    ["va_loc", mapped.facilityName],
    ["va_contact", mapped.contactName],
    ["va_contact_email", mapped.contactEmail],
    ["va_contact_phone", mapped.contactPhone],
  ];
  for (const [key, value] of copies) {
    if (!value) continue;
    if (ffValue(next[key])) continue;
    next[key] = value;
  }
  return next;
}
