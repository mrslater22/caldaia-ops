import { NextResponse } from "next/server";
import {
  createServiceClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";
import type {
  DevicePrefillPayload,
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

  const { data: device, error: deviceError } = await supabase
    .from("devices")
    .select(
      `
      id,
      public_id,
      boiler_id,
      device_type,
      equipment_group,
      manufacturer,
      model,
      serial_number,
      install_date,
      set_point,
      trip_point,
      location_description,
      service_status
    `,
    )
    .eq("public_id", publicId)
    .maybeSingle();

  if (deviceError) {
    return NextResponse.json<PrefillErrorPayload>(
      { ok: false, error: deviceError.message },
      { status: 500 },
    );
  }

  if (!device) {
    return NextResponse.json<PrefillErrorPayload>(
      { ok: false, error: "Device not found." },
      { status: 404 },
    );
  }

  const { data: boiler, error: boilerError } = await supabase
    .from("boilers")
    .select(
      "public_id, facility_name, site_code, boiler_tag, manufacturer, model, serial_number",
    )
    .eq("id", device.boiler_id)
    .single();

  if (boilerError || !boiler) {
    return NextResponse.json<PrefillErrorPayload>(
      { ok: false, error: boilerError?.message || "Boiler not found." },
      { status: 500 },
    );
  }

  const { data: lastTest, error: lastTestError } = await supabase
    .from("device_tests")
    .select("tested_at, technician_name, result, notes, readings_json")
    .eq("device_id", device.id)
    .order("tested_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastTestError) {
    return NextResponse.json<PrefillErrorPayload>(
      { ok: false, error: lastTestError.message },
      { status: 500 },
    );
  }

  const payload: DevicePrefillPayload = {
    ok: true,
    resource: "device",
    public_id: device.public_id,
    device: {
      public_id: device.public_id,
      device_type: device.device_type,
      equipment_group: device.equipment_group,
      manufacturer: device.manufacturer,
      model: device.model,
      serial_number: device.serial_number,
      install_date: device.install_date,
      set_point: device.set_point,
      trip_point: device.trip_point,
      location_description: device.location_description,
      service_status: device.service_status,
    },
    boiler: {
      public_id: boiler.public_id,
      facility_name: boiler.facility_name,
      site_code: boiler.site_code,
      boiler_tag: boiler.boiler_tag,
      manufacturer: boiler.manufacturer,
      model: boiler.model,
      serial_number: boiler.serial_number,
    },
    last_test: lastTest
      ? {
          tested_at: lastTest.tested_at,
          technician_name: lastTest.technician_name,
          result: lastTest.result,
          notes: lastTest.notes,
          readings:
            (lastTest.readings_json as Record<string, unknown> | null) ?? {},
        }
      : null,
  };

  return NextResponse.json(payload, {
    headers: { "Cache-Control": "no-store" },
  });
}
