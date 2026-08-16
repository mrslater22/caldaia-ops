import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { syncSiteToFastField } from "@/lib/fastfield/site-table-sync";
import { getAdminSite } from "@/lib/sites/service";
import { isSupabaseConfigured } from "@/lib/supabase/server";

type Params = { params: Promise<{ publicId: string }> };

export async function POST(_request: Request, { params }: Params) {
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

  try {
    const { publicId } = await params;
    const sync = await syncSiteToFastField(await getAdminSite(publicId));
    return NextResponse.json({ ok: true, sync });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to sync site.";
    return NextResponse.json(
      { ok: false, error: message },
      { status: message === "Site not found." ? 404 : 500 },
    );
  }
}
