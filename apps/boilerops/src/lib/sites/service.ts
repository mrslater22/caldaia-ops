import { DEMO_ORGANIZATION_ID } from "@/lib/constants";
import type { MappedSiteOnboarding } from "@/lib/fastfield/site-onboarding-mapper";
import type { SiteForFastFieldSync } from "@/lib/fastfield/site-table-sync";
import { makePublicId } from "@/lib/public-id";
import { generateAndStoreSiteQr, siteQrTargetUrl } from "@/lib/qr";
import { createServiceClient } from "@/lib/supabase/server";

export const SITE_ADMIN_COLUMNS =
  "id, organization_id, public_id, site_code, facility_name, address, city, state, zip, timezone, contact_name, contact_email, contact_phone, fastfield_source_site_id, last_fastfield_submission_id, qr_target_url, qr_storage_path, created_at, updated_at";

export type SiteAdminRecord = SiteForFastFieldSync & {
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  timezone: string;
  fastfield_source_site_id: string | null;
  last_fastfield_submission_id: string | null;
  qr_storage_path: string | null;
  created_at: string;
  updated_at: string;
};

export type SiteAdminInput = {
  site_code: string;
  facility_name: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  timezone?: string;
  contact_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
};

function cleanNullable(value: string | null | undefined): string | null {
  const cleaned = value?.trim();
  return cleaned ? cleaned : null;
}

function adminValues(input: SiteAdminInput) {
  return {
    site_code: input.site_code.trim().toUpperCase(),
    facility_name: input.facility_name.trim(),
    address: cleanNullable(input.address),
    city: cleanNullable(input.city),
    state: cleanNullable(input.state)?.toUpperCase() ?? null,
    zip: cleanNullable(input.zip),
    timezone: input.timezone?.trim() || "America/New_York",
    contact_name: cleanNullable(input.contact_name),
    contact_email: cleanNullable(input.contact_email)?.toLowerCase() ?? null,
    contact_phone: cleanNullable(input.contact_phone),
  };
}

async function storeSiteQr(
  site: Pick<SiteAdminRecord, "id" | "public_id">,
): Promise<void> {
  const qr = await generateAndStoreSiteQr(site.public_id);
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("sites")
    .update({
      qr_target_url: qr.targetUrl,
      qr_storage_path: qr.storagePath,
    })
    .eq("id", site.id)
    .eq("organization_id", DEMO_ORGANIZATION_ID);
  if (error) throw new Error(error.message);
}

export async function createAdminSite(
  input: SiteAdminInput,
): Promise<SiteAdminRecord> {
  const supabase = createServiceClient();
  const publicId = makePublicId("site");
  const { data, error } = await supabase
    .from("sites")
    .insert({
      ...adminValues(input),
      public_id: publicId,
      organization_id: DEMO_ORGANIZATION_ID,
      qr_target_url: siteQrTargetUrl(publicId),
    })
    .select(SITE_ADMIN_COLUMNS)
    .single();
  if (error || !data) {
    throw new Error(error?.message || "Failed to create site.");
  }

  await storeSiteQr(data as SiteAdminRecord);
  return getAdminSite(publicId);
}

export async function getAdminSite(
  publicId: string,
): Promise<SiteAdminRecord> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("sites")
    .select(SITE_ADMIN_COLUMNS)
    .eq("organization_id", DEMO_ORGANIZATION_ID)
    .eq("public_id", publicId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Site not found.");
  return data as SiteAdminRecord;
}

export async function updateAdminSite(
  publicId: string,
  input: SiteAdminInput,
): Promise<SiteAdminRecord> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("sites")
    .update(adminValues(input))
    .eq("organization_id", DEMO_ORGANIZATION_ID)
    .eq("public_id", publicId)
    .select(SITE_ADMIN_COLUMNS)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Site not found.");
  return data as SiteAdminRecord;
}

export async function regenerateAdminSiteQr(
  publicId: string,
): Promise<SiteAdminRecord> {
  const site = await getAdminSite(publicId);
  await storeSiteQr(site);
  return getAdminSite(publicId);
}

export async function persistSiteOnboarding(
  mapped: MappedSiteOnboarding,
  submissionId: string,
): Promise<{ sitePublicId: string; site: SiteForFastFieldSync }> {
  const supabase = createServiceClient();
  const syncColumns =
    "id, organization_id, public_id, site_code, facility_name, contact_name, contact_email, contact_phone, qr_target_url";
  let existing: SiteForFastFieldSync | null = null;

  if (mapped.boilerops_site_id) {
    const { data, error } = await supabase
      .from("sites")
      .select(syncColumns)
      .eq("organization_id", DEMO_ORGANIZATION_ID)
      .eq("public_id", mapped.boilerops_site_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) {
      throw new Error(
        `Unknown bo_siteid "${mapped.boilerops_site_id}"; refusing to create a duplicate site.`,
      );
    }
    existing = data as SiteForFastFieldSync;
  }

  if (!existing && mapped.source_site_id) {
    const { data, error } = await supabase
      .from("sites")
      .select(syncColumns)
      .eq("organization_id", DEMO_ORGANIZATION_ID)
      .eq("fastfield_source_site_id", mapped.source_site_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    existing = data as SiteForFastFieldSync | null;
  }

  if (!existing) {
    const { data, error } = await supabase
      .from("sites")
      .select(syncColumns)
      .eq("organization_id", DEMO_ORGANIZATION_ID)
      .eq("site_code", mapped.site_code)
      .maybeSingle();
    if (error) throw new Error(error.message);
    existing = data as SiteForFastFieldSync | null;
  }

  const publicId = existing?.public_id ?? makePublicId("site");
  const values = {
    organization_id: DEMO_ORGANIZATION_ID,
    site_code: mapped.site_code,
    facility_name: mapped.facility_name,
    address: mapped.address,
    city: mapped.city,
    state: mapped.state,
    zip: mapped.zip,
    timezone: mapped.timezone,
    contact_name: mapped.contact_name,
    contact_email: mapped.contact_email,
    contact_phone: mapped.contact_phone,
    fastfield_source_site_id: mapped.source_site_id,
    last_fastfield_submission_id: submissionId,
    qr_target_url: siteQrTargetUrl(publicId),
  };

  const query = existing
    ? supabase.from("sites").update(values).eq("id", existing.id)
    : supabase.from("sites").insert({ ...values, public_id: publicId });
  const { data, error } = await query.select(syncColumns).single();
  if (error || !data) {
    throw new Error(error?.message || "Failed to save site.");
  }

  const site = data as SiteForFastFieldSync;
  await storeSiteQr({ id: site.id, public_id: site.public_id });
  site.qr_target_url = siteQrTargetUrl(site.public_id);
  return { sitePublicId: site.public_id, site };
}
