import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  createAdminInspectionJob,
  getInspectionJobPlanningData,
} from "@/lib/inspection-jobs/service";
import { inspectionJobInputSchema } from "@/lib/inspection-jobs/validation";
import { isSupabaseConfigured } from "@/lib/supabase/server";

async function authorize() {
  if (!(await getSession())) {
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

  try {
    const data = await getInspectionJobPlanningData();
    return NextResponse.json({ ok: true, ...data });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load inspection jobs.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const unauthorized = await authorize();
  if (unauthorized) return unauthorized;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }
  const parsed = inspectionJobInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: parsed.error.issues[0]?.message || "Invalid inspection job.",
      },
      { status: 400 },
    );
  }

  try {
    const job = await createAdminInspectionJob(parsed.data);
    return NextResponse.json({ ok: true, job }, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create inspection job.";
    const status =
      message === "Site not found."
        ? 404
        : /inactive|do not belong/i.test(message)
          ? 400
          : /duplicate|unique/i.test(message)
            ? 409
            : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
