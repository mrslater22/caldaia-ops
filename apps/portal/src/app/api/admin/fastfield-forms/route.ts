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
    .from("fastfield_forms")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, forms: data ?? [] });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: false, error: "Supabase not configured." }, { status: 503 });
  }

  const body = (await request.json()) as {
    fastfield_form_id?: string;
    name?: string;
    purpose?: string;
    schema_json?: unknown;
    field_mappings_json?: unknown;
    notes?: string;
    active?: boolean;
  };

  if (!body.fastfield_form_id?.trim() || !body.name?.trim()) {
    return NextResponse.json(
      { ok: false, error: "fastfield_form_id and name are required." },
      { status: 400 },
    );
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("fastfield_forms")
    .upsert(
      {
        fastfield_form_id: body.fastfield_form_id.trim(),
        name: body.name.trim(),
        purpose: body.purpose?.trim() || "boiler_onboarding",
        schema_json: body.schema_json ?? {},
        field_mappings_json: body.field_mappings_json ?? {},
        notes: body.notes ?? null,
        active: body.active ?? true,
        last_synced_at: new Date().toISOString(),
      },
      { onConflict: "fastfield_form_id" },
    )
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, form: data }, { status: 201 });
}
