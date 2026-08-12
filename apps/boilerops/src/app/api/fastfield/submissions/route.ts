import { NextResponse } from "next/server";
import {
  authorizeFastFieldRequest,
  ingestFastFieldSubmission,
} from "@/lib/fastfield/ingest";
import { isSupabaseConfigured } from "@/lib/supabase/server";

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Supabase is not configured." },
      { status: 503 },
    );
  }

  if (!authorizeFastFieldRequest(request)) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized." },
      { status: 401 },
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Request body must be JSON." },
      { status: 400 },
    );
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return NextResponse.json(
      { ok: false, error: "JSON body must be an object." },
      { status: 400 },
    );
  }

  try {
    const result = await ingestFastFieldSubmission(
      payload as Record<string, unknown>,
    );

    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
      "http://localhost:3000";

    return NextResponse.json(
      {
        ok: true,
        duplicate: result.duplicate,
        event_id: result.eventId,
        submission_id: result.submissionId,
        form_id: result.formId,
        purpose: result.purpose,
        warning: result.warning ?? null,
        boiler_public_id: result.boilerPublicId,
        device_public_ids: result.devicePublicIds,
        urls: result.boilerPublicId
          ? {
              boiler: `${appUrl}/i/boiler/${result.boilerPublicId}`,
              devices: result.devicePublicIds.map(
                (id) => `${appUrl}/i/device/${id}`,
              ),
            }
          : null,
      },
      { status: result.duplicate ? 200 : 201 },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to ingest submission.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: "/api/fastfield/submissions",
    methods: ["POST"],
    purpose: "FastField form submission ingest (form-registry aware)",
  });
}
