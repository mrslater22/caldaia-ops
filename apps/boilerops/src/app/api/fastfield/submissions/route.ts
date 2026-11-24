import { NextResponse } from "next/server";
import { ingestFastFieldSubmission } from "@/lib/fastfield/ingest";
import {
  submissionHttpStatus,
  submissionResponseBody,
} from "@/lib/fastfield/submission-response";
import { authorizeFastFieldRequest } from "@/lib/fastfield/webhook-auth";
import { isSupabaseConfigured } from "@/lib/supabase/server";

export async function POST(request: Request) {
  if (!authorizeFastFieldRequest(request)) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized." },
      { status: 401 },
    );
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Supabase is not configured." },
      { status: 503 },
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

    return NextResponse.json(submissionResponseBody(result, appUrl), {
      status: submissionHttpStatus(result),
    });
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
    purpose:
      "FastField form submission ingest (form-registry aware, including High Pressure device visits)",
    auth: "Required. Send FASTFIELD_WEBHOOK_SECRET in the x-boilerops-secret header or as the HTTP Basic password.",
  });
}
