import { NextResponse } from "next/server";
import { authorizeFastFieldRequest } from "@/lib/fastfield/ingest";
import {
  readRequestPayload,
  storeFastFieldSample,
} from "@/lib/fastfield/capture";
import { isSupabaseConfigured } from "@/lib/supabase/server";

export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: "/api/fastfield/sample",
    methods: ["POST"],
    purpose:
      "Capture a raw FastField payload for form mapping. Does not create boilers or devices.",
    view: "/admin/fastfield-sample",
  });
}

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

  try {
    const payload = await readRequestPayload(request);
    const stored = await storeFastFieldSample(payload, {
      contentType: request.headers.get("content-type"),
      userAgent: request.headers.get("user-agent"),
    });

    return NextResponse.json(
      {
        ok: true,
        captured: true,
        event_id: stored.captureId,
        message:
          "Sample stored. Open Admin → FastField sample to view the JSON.",
      },
      { status: 201 },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to capture sample.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
