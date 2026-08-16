import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { DEMO_ORGANIZATION_ID } from "@/lib/constants";
import { fastFieldDataTableInputSchema } from "@/lib/fastfield/data-table-config";
import {
  createServiceClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
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

  const { id } = await params;
  const input = parsed.data;
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("fastfield_data_tables")
    .update({
      name: input.name,
      fastfield_table_id: input.fastfield_table_id || null,
      sync_url: input.sync_url || null,
      http_method: input.http_method,
      upsert_key: input.upsert_key,
      field_mappings_json: input.field_mappings_json,
      active: input.active,
    })
    .eq("id", id)
    .eq("organization_id", DEMO_ORGANIZATION_ID)
    .select("*")
    .maybeSingle();
  if (error) {
    const status = /duplicate|unique/i.test(error.message) ? 409 : 500;
    return NextResponse.json(
      { ok: false, error: error.message },
      { status },
    );
  }
  if (!data) {
    return NextResponse.json(
      { ok: false, error: "Data Table configuration not found." },
      { status: 404 },
    );
  }

  return NextResponse.json({ ok: true, data_table: data });
}
