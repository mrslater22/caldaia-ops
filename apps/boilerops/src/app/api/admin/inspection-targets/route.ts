import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createAdminInspectionTarget } from "@/lib/inspection-jobs/service";
import { inspectionTargetInputSchema } from "@/lib/inspection-jobs/validation";
import { isSupabaseConfigured } from "@/lib/supabase/server";

export async function POST(request: Request) {
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }
  const parsed = inspectionTargetInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error:
          parsed.error.issues[0]?.message || "Invalid inspection target.",
      },
      { status: 400 },
    );
  }

  try {
    const target = await createAdminInspectionTarget(parsed.data);
    return NextResponse.json({ ok: true, target }, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to create inspection target.";
    const status =
      message === "Site not found."
        ? 404
        : /duplicate|unique/i.test(message)
          ? 409
          : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
