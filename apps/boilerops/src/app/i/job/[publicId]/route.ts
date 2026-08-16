import { NextResponse } from "next/server";
import {
  createServiceClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

type Params = { params: Promise<{ publicId: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { publicId } = await params;
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Supabase is not configured." },
      { status: 503 },
    );
  }

  const supabase = createServiceClient();
  const { data: job, error: jobError } = await supabase
    .from("inspection_jobs")
    .select(
      "id, site_id, public_id, job_num, title, status, scheduled_start_date, scheduled_end_date, qr_target_url, updated_at",
    )
    .eq("public_id", publicId)
    .maybeSingle();
  if (jobError) {
    console.error("Failed to load public inspection job:", jobError);
    return NextResponse.json(
      { ok: false, error: "Failed to load inspection job." },
      { status: 500 },
    );
  }
  if (!job) {
    return NextResponse.json(
      { ok: false, error: "Inspection job not found." },
      { status: 404 },
    );
  }

  const [{ data: site, error: siteError }, { data: scope, error: scopeError }] =
    await Promise.all([
      supabase
        .from("sites")
        .select("public_id, site_code, facility_name")
        .eq("id", job.site_id)
        .single(),
      supabase
        .from("inspection_job_targets")
        .select("inspection_target_id")
        .eq("inspection_job_id", job.id),
    ]);
  if (siteError || scopeError) {
    console.error("Failed to load public inspection job scope:", {
      siteError,
      scopeError,
    });
    return NextResponse.json(
      { ok: false, error: "Failed to load inspection job scope." },
      { status: 500 },
    );
  }

  const targetIds = (scope ?? []).map((item) => item.inspection_target_id);
  let targets: {
    public_id: string;
    target_type: string;
    target_code: string;
    display_name: string;
  }[] = [];
  if (targetIds.length > 0) {
    const { data, error } = await supabase
      .from("inspection_targets")
      .select("public_id, target_type, target_code, display_name")
      .in("id", targetIds)
      .order("target_code");
    if (error) {
      console.error("Failed to load public inspection job targets:", error);
      return NextResponse.json(
        { ok: false, error: "Failed to load inspection job targets." },
        { status: 500 },
      );
    }
    targets = data ?? [];
  }

  return NextResponse.json({
    ok: true,
    kind: "inspection_job",
    job: {
      boilerops_job_id: job.public_id,
      job_num: job.job_num,
      title: job.title,
      status: job.status,
      scheduled_start_date: job.scheduled_start_date,
      scheduled_end_date: job.scheduled_end_date,
      qr_target_url: job.qr_target_url,
      updated_at: job.updated_at,
    },
    site: {
      boilerops_site_id: site.public_id,
      site_code: site.site_code,
      facility_name: site.facility_name,
    },
    targets: targets.map((target) => ({
      boilerops_target_id: target.public_id,
      target_type: target.target_type,
      target_code: target.target_code,
      display_name: target.display_name,
    })),
  });
}
