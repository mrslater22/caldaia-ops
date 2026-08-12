import { NextResponse } from "next/server";
import {
  createServiceClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";
import type {
  BoilerPrefillPayload,
  PrefillErrorPayload,
} from "@/lib/prefill-types";

type Params = { params: Promise<{ publicId: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { publicId } = await params;

  if (!isSupabaseConfigured()) {
    return NextResponse.json<PrefillErrorPayload>(
      { ok: false, error: "Supabase is not configured." },
      { status: 503 },
    );
  }

  const supabase = createServiceClient();

  const { data: boiler, error: boilerError } = await supabase
    .from("boilers")
    .select(
      `
      id,
      public_id,
      facility_name,
      site_code,
      boiler_tag,
      manufacturer,
      model,
      serial_number,
      address,
      city,
      state,
      zip,
      contact_name,
      contact_email,
      contact_phone,
      notes,
      onboarded_at
    `,
    )
    .eq("public_id", publicId)
    .maybeSingle();

  if (boilerError) {
    return NextResponse.json<PrefillErrorPayload>(
      { ok: false, error: boilerError.message },
      { status: 500 },
    );
  }

  if (!boiler) {
    return NextResponse.json<PrefillErrorPayload>(
      { ok: false, error: "Boiler not found." },
      { status: 404 },
    );
  }

  const { data: devices, error: devicesError } = await supabase
    .from("devices")
    .select(
      "public_id, device_type, manufacturer, model, serial_number, location_description, service_status",
    )
    .eq("boiler_id", boiler.id)
    .order("device_type");

  if (devicesError) {
    return NextResponse.json<PrefillErrorPayload>(
      { ok: false, error: devicesError.message },
      { status: 500 },
    );
  }

  const payload: BoilerPrefillPayload = {
    ok: true,
    resource: "boiler",
    public_id: boiler.public_id,
    boiler: {
      public_id: boiler.public_id,
      facility_name: boiler.facility_name,
      site_code: boiler.site_code,
      boiler_tag: boiler.boiler_tag,
      manufacturer: boiler.manufacturer,
      model: boiler.model,
      serial_number: boiler.serial_number,
      address: boiler.address,
      city: boiler.city,
      state: boiler.state,
      zip: boiler.zip,
      contact_name: boiler.contact_name,
      contact_email: boiler.contact_email,
      contact_phone: boiler.contact_phone,
      notes: boiler.notes,
      onboarded_at: boiler.onboarded_at,
    },
    devices: devices ?? [],
  };

  return NextResponse.json(payload, {
    headers: { "Cache-Control": "no-store" },
  });
}
