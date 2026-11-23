import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { DEMO_ORGANIZATION_ID } from "@/lib/constants";
import { createServiceClient, isSupabaseConfigured } from "@/lib/supabase/server";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Supabase not configured." },
      { status: 503 },
    );
  }

  const supabase = createServiceClient();
  const { data: visits, error } = await supabase
    .from("site_visits")
    .select(
      "id, public_id, site_id, external_visit_id, status, created_at, updated_at",
    )
    .eq("organization_id", DEMO_ORGANIZATION_ID)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const visitRows = visits ?? [];
  const visitIds = visitRows.map((visit) => visit.id);
  const siteIds = [...new Set(visitRows.map((visit) => visit.site_id))];

  const [sitesResult, testsResult, reportsResult] = await Promise.all([
    siteIds.length
      ? supabase
          .from("sites")
          .select("id, public_id, site_code, facility_name")
          .in("id", siteIds)
      : Promise.resolve({ data: [], error: null }),
    visitIds.length
      ? supabase
          .from("site_visit_device_tests")
          .select(
            "site_visit_id, public_id, device_type, asset_key, target_public_id, fastfield_submission_id, created_at",
          )
          .in("site_visit_id", visitIds)
          .order("created_at", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    visitIds.length
      ? supabase
          .from("site_visit_reports")
          .select("site_visit_id, public_id, status, device_test_count, updated_at")
          .in("site_visit_id", visitIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const relatedError = sitesResult.error || testsResult.error || reportsResult.error;
  if (relatedError) {
    return NextResponse.json(
      { ok: false, error: relatedError.message },
      { status: 500 },
    );
  }

  const sites = new Map(
    (sitesResult.data ?? []).map((item) => [item.id, item]),
  );
  const testsByVisit = new Map<string, typeof testsResult.data>();
  for (const test of testsResult.data ?? []) {
    const list = testsByVisit.get(test.site_visit_id) ?? [];
    list.push(test);
    testsByVisit.set(test.site_visit_id, list);
  }
  const reports = new Map(
    (reportsResult.data ?? []).map((item) => [item.site_visit_id, item]),
  );

  return NextResponse.json({
    ok: true,
    visits: visitRows.map((visit) => ({
      ...visit,
      site: sites.get(visit.site_id) ?? null,
      tests: testsByVisit.get(visit.id) ?? [],
      report: reports.get(visit.id) ?? null,
    })),
  });
}
