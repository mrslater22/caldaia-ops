import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { regenerateAdminSiteQr } from "@/lib/sites/service";
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
    return NextResponse.json({
      ok: true,
      site: await regenerateAdminSiteQr(publicId),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to regenerate QR code.";
    return NextResponse.json(
      { ok: false, error: message },
      { status: message === "Site not found." ? 404 : 500 },
    );
  }
}
