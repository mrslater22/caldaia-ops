import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { reprocessIntegrationEvent } from "@/lib/fastfield/ingest";
import { isSupabaseConfigured } from "@/lib/supabase/server";

type Params = { params: Promise<{ eventId: string }> };

export async function POST(_request: Request, { params }: Params) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: false, error: "Supabase not configured." }, { status: 503 });
  }

  const { eventId } = await params;

  try {
    const result = await reprocessIntegrationEvent(eventId);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Reprocess failed.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
