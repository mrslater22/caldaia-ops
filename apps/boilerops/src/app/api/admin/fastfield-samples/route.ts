import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
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
  const { data, error } = await supabase
    .from("integration_events")
    .select("id, external_id, status, created_at, payload_json")
    .eq("event_type", "sample_capture")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, samples: data ?? [] });
}
