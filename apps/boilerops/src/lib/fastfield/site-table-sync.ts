import { createHash } from "crypto";
import { createServiceClient } from "@/lib/supabase/server";

export type SiteForFastFieldSync = {
  id: string;
  organization_id: string;
  public_id: string;
  site_code: string;
  facility_name: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  qr_target_url: string;
};

export type SiteSyncResult = {
  status: "pending" | "synced" | "failed";
  error?: string;
};

type FastFieldDataTableConfig = {
  id: string;
  sync_url: string | null;
  http_method: "POST" | "PUT" | "PATCH";
  upsert_key: string;
  field_mappings_json: Record<string, string>;
};

function siteInfoRow(
  site: SiteForFastFieldSync,
  mappings: Record<string, string>,
) {
  const source: Record<string, string | null> = {
    public_id: site.public_id,
    qr_target_url: site.qr_target_url,
    site_code: site.site_code,
    facility_name: site.facility_name,
    contact_name: site.contact_name,
    contact_email: site.contact_email,
    contact_phone: site.contact_phone,
  };

  return Object.fromEntries(
    Object.entries(mappings).map(([fastFieldColumn, sourceField]) => [
      fastFieldColumn,
      source[sourceField] ?? null,
    ]),
  );
}

function responseRecordId(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const id = record.recordId ?? record.record_id ?? record.id;
  return id == null ? null : String(id);
}

export async function syncSiteToFastField(
  site: SiteForFastFieldSync,
): Promise<SiteSyncResult> {
  const supabase = createServiceClient();
  const { data: configData, error: configError } = await supabase
    .from("fastfield_data_tables")
    .select("id, sync_url, http_method, upsert_key, field_mappings_json")
    .eq("organization_id", site.organization_id)
    .eq("purpose", "site_info")
    .eq("active", true)
    .maybeSingle();
  if (configError) {
    return { status: "failed", error: configError.message };
  }
  if (!configData) {
    return {
      status: "pending",
      error: "No active site_info FastField Data Table configuration exists.",
    };
  }

  const config = configData as FastFieldDataTableConfig;
  const row = siteInfoRow(site, config.field_mappings_json);
  if (!(config.upsert_key in row) || !row[config.upsert_key]) {
    return {
      status: "failed",
      error: `FastField mapping does not produce upsert key "${config.upsert_key}".`,
    };
  }

  const payloadHash = createHash("sha256")
    .update(JSON.stringify(row))
    .digest("hex");
  const syncUrl = config.sync_url?.trim();

  const { error: syncStateError } = await supabase
    .from("fastfield_sync_records")
    .upsert(
      {
        data_table_id: config.id,
        local_entity_type: "site",
        local_entity_id: site.id,
        local_public_id: site.public_id,
        payload_hash: payloadHash,
        status: "pending",
        error_message: syncUrl
          ? null
          : "The site_info Data Table sync_url is not configured.",
      },
      { onConflict: "data_table_id,local_entity_type,local_entity_id" },
    );
  if (syncStateError) {
    throw new Error(
      `Failed to create FastField sync state: ${syncStateError.message}`,
    );
  }

  if (!syncUrl) {
    return {
      status: "pending",
      error: "The site_info Data Table sync_url is not configured.",
    };
  }

  const headers = new Headers({ "content-type": "application/json" });
  const apiKey = process.env.FASTFIELD_API_KEY?.trim();
  const sessionToken = process.env.FASTFIELD_SESSION_TOKEN?.trim();
  if (apiKey) {
    headers.set(
      process.env.FASTFIELD_API_KEY_HEADER?.trim() || "x-api-key",
      apiKey,
    );
  }
  if (sessionToken) {
    headers.set(
      process.env.FASTFIELD_SESSION_TOKEN_HEADER?.trim() ||
        "x-session-token",
      sessionToken,
    );
  }

  try {
    const response = await fetch(syncUrl, {
      method: config.http_method,
      headers,
      body: JSON.stringify(row),
      signal: AbortSignal.timeout(15_000),
    });
    const responseBody: unknown = await response
      .json()
      .catch(() => null);

    if (!response.ok) {
      throw new Error(
        `FastField returned ${response.status}: ${JSON.stringify(responseBody)}`,
      );
    }

    await supabase
      .from("fastfield_sync_records")
      .update({
        external_record_id: responseRecordId(responseBody),
        status: "synced",
        last_attempted_at: new Date().toISOString(),
        last_synced_at: new Date().toISOString(),
        error_message: null,
      })
      .eq("data_table_id", config.id)
      .eq("local_entity_type", "site")
      .eq("local_entity_id", site.id);

    return { status: "synced" };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown FastField sync error.";
    await supabase
      .from("fastfield_sync_records")
      .update({
        status: "failed",
        last_attempted_at: new Date().toISOString(),
        error_message: message,
      })
      .eq("data_table_id", config.id)
      .eq("local_entity_type", "site")
      .eq("local_entity_id", site.id);

    return { status: "failed", error: message };
  }
}
