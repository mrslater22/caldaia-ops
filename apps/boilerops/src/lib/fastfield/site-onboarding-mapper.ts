import { ffPick } from "@/lib/fastfield/onboarding-mapper";

export type SiteOnboardingFieldMappings = Partial<{
  facility_name: string;
  site_code: string;
  source_site_id: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  timezone: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  boilerops_site_id: string;
}>;

export type MappedSiteOnboarding = {
  facility_name: string;
  site_code: string;
  source_site_id: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  timezone: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  boilerops_site_id: string | null;
};

function mappedOrAliases(
  payload: Record<string, unknown>,
  mappedKey: string | undefined,
  aliases: string[],
): string | null {
  return ffPick(payload, mappedKey ? [mappedKey, ...aliases] : aliases);
}

export function mapSiteOnboarding(
  payload: Record<string, unknown>,
  mappings: SiteOnboardingFieldMappings = {},
): MappedSiteOnboarding {
  const facilityName = mappedOrAliases(payload, mappings.facility_name, [
    "va_loc",
    "facility_name",
    "site_name",
  ]);
  if (!facilityName) {
    throw new Error("Site Onboarding requires va_loc/facility_name.");
  }

  const siteCode = mappedOrAliases(payload, mappings.site_code, [
    "site_code",
  ])?.toUpperCase();
  if (!siteCode || !/^[A-Z0-9]{3,4}$/.test(siteCode)) {
    throw new Error(
      "Site Onboarding site_code must contain 3 or 4 uppercase letters/numbers.",
    );
  }

  return {
    facility_name: facilityName,
    site_code: siteCode,
    source_site_id: mappedOrAliases(payload, mappings.source_site_id, [
      "site_id",
    ]),
    address: mappedOrAliases(payload, mappings.address, [
      "site_address",
      "address",
      "street_address",
    ]),
    city: mappedOrAliases(payload, mappings.city, ["site_city", "city"]),
    state: mappedOrAliases(payload, mappings.state, ["site_state", "state"]),
    zip: mappedOrAliases(payload, mappings.zip, [
      "site_zip",
      "zip",
      "postal_code",
    ]),
    timezone:
      mappedOrAliases(payload, mappings.timezone, ["timezone"]) ??
      "America/New_York",
    contact_name: mappedOrAliases(payload, mappings.contact_name, [
      "va_contact",
      "contact_name",
    ]),
    contact_email: mappedOrAliases(payload, mappings.contact_email, [
      "va_contact_email",
      "contact_email",
    ]),
    contact_phone: mappedOrAliases(payload, mappings.contact_phone, [
      "va_contact_phone",
      "contact_phone",
    ]),
    boilerops_site_id: mappedOrAliases(payload, mappings.boilerops_site_id, [
      "bo_siteid",
      "boilerops_site_id",
    ]),
  };
}
