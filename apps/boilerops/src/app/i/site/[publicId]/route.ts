import { NextResponse } from "next/server";
import {
  createServiceClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

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
  const { data: site, error } = await supabase
    .from("sites")
    .select(
      "public_id, site_code, facility_name, address, city, state, zip, timezone, contact_name, contact_email, contact_phone, qr_target_url, updated_at",
    )
    .eq("public_id", publicId)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 },
    );
  }
  if (!site) {
    return NextResponse.json(
      { ok: false, error: "Site not found." },
      { status: 404 },
    );
  }

  return NextResponse.json({
    ok: true,
    kind: "site",
    site: {
      boilerops_site_id: site.public_id,
      site_code: site.site_code,
      facility_name: site.facility_name,
      address: site.address,
      city: site.city,
      state: site.state,
      zip: site.zip,
      timezone: site.timezone,
      contact: {
        name: site.contact_name,
        email: site.contact_email,
        phone: site.contact_phone,
      },
      qr_target_url: site.qr_target_url,
      updated_at: site.updated_at,
    },
  });
}
