import { HIGH_PRESSURE_FIELD_KEYS } from "./device-form-config.ts";
import { ASSET_ONBOARDING_FIELD_KEYS } from "./asset-onboarding-mapper.ts";
import { INSPECTION_ONBOARDING_FIELD_KEYS } from "./inspection-onboarding-mapper.ts";

/**
 * Purposes an administrator can register before the FastField form id exists.
 * low_pressure stays available so that planned form is not forced onto
 * boiler onboarding. The real form ids are filled in later.
 */
export const FORM_REGISTRATION_PRESETS = [
  {
    value: "site_onboarding",
    name: "Site Onboarding",
    mappings: {
      facility_name: "va_loc",
      site_code: "site_code",
      source_site_id: "site_id",
      contact_name: "va_contact",
      contact_email: "va_contact_email",
      contact_phone: "va_contact_phone",
      boilerops_site_id: "bo_siteid",
    },
  },
  {
    value: "boiler_onboarding",
    name: "Boiler Onboarding",
    mappings: {
      facility_name: "facility_name",
      site_code: "site_code",
      boiler_tag: "boiler_tag",
      manufacturer: "boiler_manufacturer",
      model: "boiler_model",
      serial_number: "boiler_serial",
      assets: "assets",
    },
  },
  {
    value: "high_pressure",
    name: "High Pressure",
    mappings: { ...HIGH_PRESSURE_FIELD_KEYS },
  },
  {
    value: "low_pressure",
    name: "Low Pressure",
    mappings: { ...HIGH_PRESSURE_FIELD_KEYS },
  },
  {
    value: "inspection_onboarding",
    name: "Inspection Onboarding",
    mappings: { ...INSPECTION_ONBOARDING_FIELD_KEYS },
  },
  {
    value: "asset_onboarding",
    name: "Asset Onboarding",
    mappings: { ...ASSET_ONBOARDING_FIELD_KEYS },
  },
] as const;

export type FormRegistrationPurpose =
  (typeof FORM_REGISTRATION_PRESETS)[number]["value"];

const PURPOSE_SET = new Set<string>(
  FORM_REGISTRATION_PRESETS.map((preset) => preset.value),
);

export function isRegisteredFormPurpose(
  purpose: string,
): purpose is FormRegistrationPurpose {
  return PURPOSE_SET.has(purpose);
}

export function formRegistrationPreset(purpose: string) {
  return FORM_REGISTRATION_PRESETS.find((preset) => preset.value === purpose);
}

/** Stored until Michael replaces it with the real FastField form id. */
export function pendingFormId(purpose: string): string {
  return `pending:${purpose}`;
}

export function registrationFormId(
  purpose: string,
  requested: string | null | undefined,
): string {
  const trimmed = requested?.trim() ?? "";
  return trimmed || pendingFormId(purpose);
}

export function isPendingFormId(formId: string): boolean {
  return formId.startsWith("pending:");
}
