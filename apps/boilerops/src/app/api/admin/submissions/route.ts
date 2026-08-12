import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createServiceClient, isSupabaseConfigured } from "@/lib/supabase/server";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: false, error: "Supabase not configured." }, { status: 503 });
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("integration_events")
    .select(
      "id, source_system, event_type, external_id, fastfield_form_id, status, error_message, processed_at, created_at, payload_json",
    )
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, events: data ?? [] });
}
