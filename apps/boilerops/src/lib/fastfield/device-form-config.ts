import { extractFormId, extractFormName } from "./onboarding-mapper.ts";

/**
 * Per-device-type FastField form catalog.
 *
 * High Pressure is the only implemented entry. Low Pressure is named here
 * so a submission can be refused instead of falling through to boiler
 * onboarding. Adding Low Pressure is a new catalog entry plus the same
 * visit recorder; see docs/hp-device-e2e-test.md.
 *
 * Field keys are placeholders. Michael must create FastField fields with
 * these keys, or override them with FASTFIELD_HP_FIELD_MAP or the form
 * registry `field_mappings_json` (domain field → FastField key).
 */

export const DEVICE_FIELD_KEYS = [
  "siteVisitId",
  "assetId",
  "assetType",
  "sitePublicId",
  "siteCode",
  "facilityName",
  "address",
  "city",
  "state",
  "zip",
  "contactName",
  "contactEmail",
  "contactPhone",
] as const;

export type DeviceFieldKey = (typeof DEVICE_FIELD_KEYS)[number];

export type DeviceType = "high_pressure" | "low_pressure";

export type DeviceFormFields = Record<DeviceFieldKey, string>;

/**
 * Placeholder FastField field keys for the High Pressure form.
 * These are the names Michael should use unless he overrides them.
 */
export const HIGH_PRESSURE_FIELD_KEYS: DeviceFormFields = {
  siteVisitId: "site_visit_id",
  assetId: "asset_id",
  assetType: "asset_type",
  sitePublicId: "bo_siteid",
  siteCode: "site_code",
  facilityName: "facility_name",
  address: "address",
  city: "city",
  state: "state",
  zip: "zip",
  contactName: "contact_name",
  contactEmail: "contact_email",
  contactPhone: "contact_phone",
};

/** Exact form names that identify a High Pressure submission. */
export const HIGH_PRESSURE_FORM_NAMES = [
  "High Pressure",
  "High Pressure Device",
  "High Pressure Test",
] as const;

/**
 * Column display name to add on the FastField site info table.
 * Override with FASTFIELD_HP_VISIT_ID_COLUMN if the live column differs.
 * This name is not written by itself. The site-info field map must point
 * this column at the site visit submission key (default `site_visit_id`).
 */
export const SITE_VISIT_ID_COLUMN = "Site Visit ID";

/**
 * Suggested key column when the live table still uses the legacy projector
 * column `bo_siteid`. Confirm the display name before setting the env var.
 */
export const SUGGESTED_SITE_INFO_KEY_COLUMN = "bo_siteid";

/**
 * Suggested FASTFIELD_SITE_INFO_FIELD_MAP. Not applied automatically.
 * Keys are column display names. Values are submission field keys.
 * Confirm every display name against the live table before use.
 */
export const SUGGESTED_LEGACY_SITE_INFO_FIELD_MAP: Record<string, string> = {
  bo_siteid: HIGH_PRESSURE_FIELD_KEYS.sitePublicId,
  site_code: HIGH_PRESSURE_FIELD_KEYS.siteCode,
  va_loc: HIGH_PRESSURE_FIELD_KEYS.facilityName,
  va_contact: HIGH_PRESSURE_FIELD_KEYS.contactName,
  va_contact_email: HIGH_PRESSURE_FIELD_KEYS.contactEmail,
  va_contact_phone: HIGH_PRESSURE_FIELD_KEYS.contactPhone,
  [SITE_VISIT_ID_COLUMN]: HIGH_PRESSURE_FIELD_KEYS.siteVisitId,
};

export type DeviceFormDefinition = {
  deviceType: "high_pressure";
  purpose: "high_pressure";
  displayName: string;
  formNames: readonly string[];
  fields: DeviceFormFields;
  visitIdColumn: string;
};

export type RegisteredFormRef = {
  purpose: string;
  name: string;
  fastfield_form_id: string;
  field_mappings_json: unknown;
};

export type ResolvedDeviceForm = {
  definition: DeviceFormDefinition;
  /** Registered purpose was not high_pressure, but the form id or name matched. */
  purposeOverridden: boolean;
  ignoredMappingKeys: string[];
};

const PLANNED_LOW_PRESSURE_NAMES = [
  "Low Pressure",
  "Low Pressure Device",
  "Low Pressure Test",
];

type Env = Record<string, string | undefined>;

function normalizeName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function namesMatch(left: string, right: string): boolean {
  return normalizeName(left) === normalizeName(right);
}

function highPressureNames(env: Env): string[] {
  const extra = env.FASTFIELD_HP_FORM_NAME?.trim();
  const names: string[] = [...HIGH_PRESSURE_FORM_NAMES];
  if (extra) names.push(extra);
  return names;
}

function nameIsHighPressure(
  name: string | null,
  env: Env,
): boolean {
  if (!name) return false;
  return highPressureNames(env).some((candidate) => namesMatch(candidate, name));
}

export function plannedDevicePurpose(
  payload: Record<string, unknown>,
  registered: RegisteredFormRef | null,
  env: Env = process.env,
): "low_pressure" | null {
  if (registered?.purpose === "low_pressure") return "low_pressure";
  const name = extractFormName(payload) ?? registered?.name ?? null;
  if (!name) return null;
  if (nameIsHighPressure(name, env)) return null;
  if (PLANNED_LOW_PRESSURE_NAMES.some((candidate) => namesMatch(candidate, name))) {
    return "low_pressure";
  }
  return null;
}

function parseFieldOverride(
  raw: unknown,
): { fields: Partial<DeviceFormFields>; ignored: string[] } | { error: string } {
  if (raw == null || raw === "") return { fields: {}, ignored: [] };
  let value: unknown = raw;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return { fields: {}, ignored: [] };
    try {
      value = JSON.parse(trimmed) as unknown;
    } catch {
      return { error: "Field map is not valid JSON." };
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { error: "Field map must be a JSON object of domain field to FastField key." };
  }
  const fields: Partial<DeviceFormFields> = {};
  const ignored: string[] = [];
  for (const [key, fieldKey] of Object.entries(value)) {
    if (!DEVICE_FIELD_KEYS.includes(key as DeviceFieldKey)) {
      ignored.push(key);
      continue;
    }
    if (typeof fieldKey !== "string" || !fieldKey.trim()) {
      return { error: `Field map value for "${key}" must be a non-empty FastField field key.` };
    }
    fields[key as DeviceFieldKey] = fieldKey.trim();
  }
  return { fields, ignored };
}

function highPressureDefinition(
  env: Env,
  overrides: Partial<DeviceFormFields>,
): DeviceFormDefinition {
  const visitIdColumn =
    env.FASTFIELD_HP_VISIT_ID_COLUMN?.trim() || SITE_VISIT_ID_COLUMN;
  return {
    deviceType: "high_pressure",
    purpose: "high_pressure",
    displayName: "High Pressure",
    formNames: highPressureNames(env),
    fields: { ...HIGH_PRESSURE_FIELD_KEYS, ...overrides },
    visitIdColumn,
  };
}

/**
 * Resolve the High Pressure form from the webhook, the form registry, and
 * env overrides. Returns null when the submission is not a High Pressure form.
 * Throws when an override map is present but invalid.
 */
export function resolveDeviceForm(
  payload: Record<string, unknown>,
  registered: RegisteredFormRef | null,
  env: Env = process.env,
): ResolvedDeviceForm | null {
  const formId = extractFormId(payload);
  const formName = extractFormName(payload) ?? registered?.name ?? null;
  const configuredFormId = env.FASTFIELD_HP_FORM_ID?.trim() || "";
  const idHit = Boolean(
    configuredFormId && formId && formId === configuredFormId,
  );
  const registeredHit = registered?.purpose === "high_pressure";
  const nameHit = nameIsHighPressure(formName, env);
  if (!idHit && !registeredHit && !nameHit) return null;

  const envOverride = parseFieldOverride(env.FASTFIELD_HP_FIELD_MAP);
  if ("error" in envOverride) {
    throw new Error(`FASTFIELD_HP_FIELD_MAP ${envOverride.error}`);
  }
  const registryOverride =
    registeredHit || idHit || nameHit
      ? parseFieldOverride(registered?.field_mappings_json)
      : { fields: {}, ignored: [] as string[] };
  if ("error" in registryOverride) {
    throw new Error(
      `fastfield_forms.field_mappings_json ${registryOverride.error}`,
    );
  }

  const fields = {
    ...envOverride.fields,
    ...registryOverride.fields,
  };
  return {
    definition: highPressureDefinition(env, fields),
    purposeOverridden: Boolean(registered && registered.purpose !== "high_pressure"),
    ignoredMappingKeys: [
      ...envOverride.ignored,
      ...registryOverride.ignored,
    ],
  };
}
