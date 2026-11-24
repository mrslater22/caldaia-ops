import { assignPayloadField } from "./submission-fields.ts";

/**
 * Identity keys FASTFIELD_SITE_INFO_FIELD_MAP will use in production.
 * Site Onboarding emits these after the site row exists. Generated
 * bo_siteid and bo_qrcode always replace whatever the form sent.
 */
export const SITE_ONBOARDING_SITE_INFO_KEYS = {
  site_code: "site_code",
  va_loc: "va_loc",
  va_contact: "va_contact",
  va_contact_email: "va_contact_email",
  va_contact_phone: "va_contact_phone",
  bo_siteid: "bo_siteid",
  bo_qrcode: "bo_qrcode",
} as const;

export function payloadForSiteOnboardingSiteInfo(
  payload: Record<string, unknown>,
  values: {
    bo_siteid: string;
    bo_qrcode: string;
    site_code: string | null;
    va_loc: string | null;
    va_contact: string | null;
    va_contact_email: string | null;
    va_contact_phone: string | null;
  },
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...payload };
  const keys = SITE_ONBOARDING_SITE_INFO_KEYS;
  assignPayloadField(next, keys.bo_siteid, values.bo_siteid, true);
  assignPayloadField(next, keys.bo_qrcode, values.bo_qrcode, true);
  assignPayloadField(next, keys.site_code, values.site_code);
  assignPayloadField(next, keys.va_loc, values.va_loc);
  assignPayloadField(next, keys.va_contact, values.va_contact);
  assignPayloadField(next, keys.va_contact_email, values.va_contact_email);
  assignPayloadField(next, keys.va_contact_phone, values.va_contact_phone);
  return next;
}
