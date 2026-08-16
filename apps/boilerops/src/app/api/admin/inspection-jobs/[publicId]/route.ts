import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  getAdminInspectionJob,
  updateAdminInspectionJob,
} from "@/lib/inspection-jobs/service";
import { inspectionJobInputSchema } from "@/lib/inspection-jobs/validation";
import { isSupabaseConfigured } from "@/lib/supabase/server";

type Params = { params: Promise<{ publicId: string }> };

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

export async function GET(_request: Request, { params }: Params) {
  const unauthorized = await authorize();
  if (unauthorized) return unauthorized;
  try {
    const { publicId } = await params;
    return NextResponse.json({
      ok: true,
      job: await getAdminInspectionJob(publicId),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load inspection job.";
    return NextResponse.json(
      { ok: false, error: message },
      { status: message === "Inspection job not found." ? 404 : 500 },
    );
  }
}

export async function PATCH(request: Request, { params }: Params) {
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
    const { publicId } = await params;
    return NextResponse.json({
      ok: true,
      job: await updateAdminInspectionJob(publicId, parsed.data),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update inspection job.";
    const status =
      message === "Inspection job not found." || message === "Site not found."
        ? 404
        : /cannot be changed|do not belong/i.test(message)
          ? 400
          : /duplicate|unique|foreign key|still referenced/i.test(message)
            ? 409
            : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
