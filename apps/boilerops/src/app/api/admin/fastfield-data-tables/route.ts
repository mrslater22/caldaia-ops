import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { DEMO_ORGANIZATION_ID } from "@/lib/constants";
import { fastFieldDataTableInputSchema } from "@/lib/fastfield/data-table-config";
import {
  createServiceClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

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

export async function GET() {
  const unauthorized = await authorize();
  if (unauthorized) return unauthorized;

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("fastfield_data_tables")
    .select("*")
    .eq("organization_id", DEMO_ORGANIZATION_ID)
    .order("name");
  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    data_tables: data ?? [],
    limit: 3,
  });
}

export async function POST(request: Request) {
  const unauthorized = await authorize();
  if (unauthorized) return unauthorized;

  const body = await request.json().catch(() => null);
  const parsed = fastFieldDataTableInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error:
          parsed.error.issues[0]?.message || "Invalid Data Table configuration.",
      },
      { status: 400 },
    );
  }

  const supabase = createServiceClient();
  const { count, error: countError } = await supabase
    .from("fastfield_data_tables")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", DEMO_ORGANIZATION_ID);
  if (countError) {
    return NextResponse.json(
      { ok: false, error: countError.message },
      { status: 500 },
    );
  }
  if ((count ?? 0) >= 3) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "The FastField account is limited to three Data Tables. Edit or deactivate an existing configuration.",
      },
      { status: 409 },
    );
  }

  const input = parsed.data;
  const { data, error } = await supabase
    .from("fastfield_data_tables")
    .insert({
      organization_id: DEMO_ORGANIZATION_ID,
      ...input,
      fastfield_table_id: input.fastfield_table_id || null,
      sync_url: input.sync_url || null,
    })
    .select("*")
    .single();
  if (error) {
    const status = /duplicate|unique/i.test(error.message) ? 409 : 500;
    return NextResponse.json(
      { ok: false, error: error.message },
      { status },
    );
  }

  return NextResponse.json({ ok: true, data_table: data }, { status: 201 });
}
