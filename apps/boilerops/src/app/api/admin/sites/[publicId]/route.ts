import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { syncSiteToFastField } from "@/lib/fastfield/site-table-sync";
import { getAdminSite, updateAdminSite } from "@/lib/sites/service";
import { siteAdminInputSchema } from "@/lib/sites/validation";
import { isSupabaseConfigured } from "@/lib/supabase/server";

type Params = { params: Promise<{ publicId: string }> };

async function authorize() {
  const session = await getSession();
  if (!session) {
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

export async function GET(_request: Request, { params }: Params) {
  const unauthorized = await authorize();
  if (unauthorized) return unauthorized;
  try {
    const { publicId } = await params;
    return NextResponse.json({
      ok: true,
      site: await getAdminSite(publicId),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load site.";
    return NextResponse.json(
      { ok: false, error: message },
      { status: message === "Site not found." ? 404 : 500 },
    );
  }
}

export async function PATCH(request: Request, { params }: Params) {
  const unauthorized = await authorize();
  if (unauthorized) return unauthorized;

  const parsed = siteAdminInputSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: parsed.error.issues[0]?.message || "Invalid site details.",
      },
      { status: 400 },
    );
  }

  try {
    const { publicId } = await params;
    const site = await updateAdminSite(publicId, parsed.data);
    const sync = await syncSiteToFastField(site);
    return NextResponse.json({ ok: true, site, sync });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update site.";
    const status =
      message === "Site not found."
        ? 404
        : /duplicate|unique/i.test(message)
          ? 409
          : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
