import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  isPendingFormId,
  isRegisteredFormPurpose,
  pendingFormId,
  registrationFormId,
} from "@/lib/fastfield/form-registration";
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

  const purpose = body.purpose?.trim() ?? "";
  if (!body.name?.trim() || !purpose) {
    return NextResponse.json(
      { ok: false, error: "name and purpose are required." },
      { status: 400 },
    );
  }
  if (!isRegisteredFormPurpose(purpose)) {
    return NextResponse.json(
      {
        ok: false,
        error: `Unsupported purpose "${purpose}". Choose a purpose from Admin → FastField forms.`,
      },
      { status: 400 },
    );
  }

  const formId = registrationFormId(purpose, body.fastfield_form_id);
  const supabase = createServiceClient();
  const row = {
    fastfield_form_id: formId,
    name: body.name.trim(),
    purpose,
    schema_json: body.schema_json ?? {},
    field_mappings_json: body.field_mappings_json ?? {},
    notes: body.notes ?? null,
    active: body.active ?? true,
    last_synced_at: new Date().toISOString(),
  };

  // Filling in a real form id replaces the placeholder row for that purpose
  // instead of leaving a second registration behind.
  if (!isPendingFormId(formId)) {
    const { data: placeholder, error: placeholderError } = await supabase
      .from("fastfield_forms")
      .select("id")
      .eq("fastfield_form_id", pendingFormId(purpose))
      .maybeSingle();
    if (placeholderError) {
      return NextResponse.json(
        { ok: false, error: placeholderError.message },
        { status: 500 },
      );
    }
    if (placeholder) {
      const { data: clash, error: clashError } = await supabase
        .from("fastfield_forms")
        .select("id")
        .eq("fastfield_form_id", formId)
        .maybeSingle();
      if (clashError) {
        return NextResponse.json(
          { ok: false, error: clashError.message },
          { status: 500 },
        );
      }
      if (clash && clash.id !== placeholder.id) {
        return NextResponse.json(
          {
            ok: false,
            error: "A form with that FastField form ID is already registered.",
          },
          { status: 409 },
        );
      }
      const { data, error } = await supabase
        .from("fastfield_forms")
        .update(row)
        .eq("id", placeholder.id)
        .select("*")
        .single();
      if (error) {
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      }
      return NextResponse.json({ ok: true, form: data }, { status: 201 });
    }
  }

  const { data, error } = await supabase
    .from("fastfield_forms")
    .upsert(row, { onConflict: "fastfield_form_id" })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, form: data }, { status: 201 });
}
