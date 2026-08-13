import { NextResponse } from "next/server";
import {
  createServiceClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";
import { QR_CODES_BUCKET } from "@/lib/supabase/storage";

type Params = { params: Promise<{ publicId: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { publicId } = await params;
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Supabase is not configured." },
      { status: 503 },
    );
  }

  const supabase = createServiceClient();
  const { data: site, error: siteError } = await supabase
    .from("sites")
    .select("qr_storage_path")
    .eq("public_id", publicId)
    .maybeSingle();

  if (siteError) {
    return NextResponse.json(
      { ok: false, error: siteError.message },
      { status: 500 },
    );
  }
  if (!site?.qr_storage_path) {
    return NextResponse.json(
      { ok: false, error: "Site QR code not found." },
      { status: 404 },
    );
  }

  const { data, error } = await supabase.storage
    .from(QR_CODES_BUCKET)
    .download(site.qr_storage_path);
  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 },
    );
  }

  return new Response(await data.arrayBuffer(), {
    headers: {
      "content-type": "image/png",
      "cache-control": "public, max-age=3600",
      "content-disposition": `inline; filename="${publicId}.png"`,
    },
  });
}
