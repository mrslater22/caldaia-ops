import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { DEMO_ORGANIZATION_ID } from "@/lib/constants";
import { syncSiteToFastField } from "@/lib/fastfield/site-table-sync";
import {
  createAdminSite,
  SITE_ADMIN_COLUMNS,
  type SiteAdminRecord,
} from "@/lib/sites/service";
import { siteAdminInputSchema } from "@/lib/sites/validation";
import {
  createServiceClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

async function authorize() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized." },
      { status: 401 },
    );
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Supabase not configured." },
      { status: 503 },
    );
  }
  return null;
}

export async function GET() {
  const unauthorized = await authorize();
  if (unauthorized) return unauthorized;

  const supabase = createServiceClient();
  const [{ data: sites, error }, { data: syncRecords }] = await Promise.all([
    supabase
      .from("sites")
      .select(SITE_ADMIN_COLUMNS)
      .eq("organization_id", DEMO_ORGANIZATION_ID)
      .order("site_code"),
    supabase
      .from("fastfield_sync_records")
      .select(
        "local_entity_id, status, error_message, last_synced_at, updated_at",
      )
      .eq("local_entity_type", "site")
      .order("updated_at", { ascending: false }),
  ]);

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 },
    );
  }

  const syncBySite = new Map<
    string,
    {
      status: string;
      error_message: string | null;
      last_synced_at: string | null;
    }
  >();
  for (const record of syncRecords ?? []) {
    if (!syncBySite.has(record.local_entity_id)) {
      syncBySite.set(record.local_entity_id, record);
    }
  }

  return NextResponse.json({
    ok: true,
    sites: (sites ?? []).map((site) => ({
      ...site,
      fastfield_sync: syncBySite.get(site.id) ?? null,
    })),
  });
}

export async function POST(request: Request) {
  const unauthorized = await authorize();
  if (unauthorized) return unauthorized;

  const parsed = siteAdminInputSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: parsed.error.issues[0]?.message || "Invalid site details.",
      },
      { status: 400 },
    );
  }

  try {
    const site = await createAdminSite(parsed.data);
    const sync = await syncSiteToFastField(site as SiteAdminRecord);
    return NextResponse.json({ ok: true, site, sync }, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create site.";
    const status = /duplicate|unique/i.test(message) ? 409 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
