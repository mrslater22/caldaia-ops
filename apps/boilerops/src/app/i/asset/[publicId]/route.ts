import { NextResponse } from "next/server";
import {
  createServiceClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";
import type {
  AssetPrefillPayload,
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
  const { data: canonicalAsset, error: canonicalError } = await supabase
    .from("assets")
    .select(
      `
      id,
      public_id,
      inspection_target_id,
      asset_code,
      asset_category,
      asset_classification,
      asset_nomenclature,
      asset_name,
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

  if (canonicalError) {
    return NextResponse.json<PrefillErrorPayload>(
      { ok: false, error: canonicalError.message },
      { status: 500 },
    );
  }

  if (canonicalAsset) {
    const [{ data: target, error: targetError }, { data: observation, error: observationError }] =
      await Promise.all([
        supabase
          .from("inspection_targets")
          .select(
            "public_id, target_type, target_code, display_name, location_description, service_status",
          )
          .eq("id", canonicalAsset.inspection_target_id)
          .single(),
        supabase
          .from("asset_observations")
          .select(
            "observed_at, result, technician_notes, readings_json",
          )
          .eq("asset_id", canonicalAsset.id)
          .order("observed_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

    if (targetError || !target || observationError) {
      return NextResponse.json<PrefillErrorPayload>(
        {
          ok: false,
          error:
            targetError?.message ||
            observationError?.message ||
            "Asset context was not found.",
        },
        { status: 500 },
      );
    }

    const payload: AssetPrefillPayload = {
      ok: true,
      resource: "asset",
      public_id: canonicalAsset.public_id,
      asset: {
        public_id: canonicalAsset.public_id,
        asset_code: canonicalAsset.asset_code,
        asset_category: canonicalAsset.asset_category,
        asset_classification: canonicalAsset.asset_classification,
        asset_nomenclature: canonicalAsset.asset_nomenclature,
        asset_name: canonicalAsset.asset_name,
        manufacturer: canonicalAsset.manufacturer,
        model: canonicalAsset.model,
        serial_number: canonicalAsset.serial_number,
        install_date: canonicalAsset.install_date,
        set_point: canonicalAsset.set_point,
        trip_point: canonicalAsset.trip_point,
        location_description: canonicalAsset.location_description,
        service_status: canonicalAsset.service_status,
      },
      inspection_target: {
        public_id: target.public_id,
        target_type: target.target_type,
        target_code: target.target_code,
        display_name: target.display_name,
        location_description: target.location_description,
        service_status: target.service_status,
      },
      boiler: null,
      last_observation: observation
        ? {
            observed_at: observation.observed_at,
            technician_name: null,
            result: observation.result,
            notes: observation.technician_notes,
            readings:
              (observation.readings_json as Record<string, unknown> | null) ??
              {},
          }
        : null,
    };

    return NextResponse.json(payload, {
      headers: { "Cache-Control": "no-store" },
    });
  }

  const { data: asset, error: assetError } = await supabase
    .from("legacy_assets")
    .select(
      `
      id,
      public_id,
      boiler_id,
      asset_code,
      asset_category,
      asset_classification,
      asset_nomenclature,
      asset_name,
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

  if (assetError) {
    return NextResponse.json<PrefillErrorPayload>(
      { ok: false, error: assetError.message },
      { status: 500 },
    );
  }

  if (!asset) {
    return NextResponse.json<PrefillErrorPayload>(
      { ok: false, error: "Asset not found." },
      { status: 404 },
    );
  }

  const { data: boiler, error: boilerError } = await supabase
    .from("boilers")
    .select(
      "public_id, facility_name, site_code, boiler_tag, manufacturer, model, serial_number",
    )
    .eq("id", asset.boiler_id)
    .single();

  if (boilerError || !boiler) {
    return NextResponse.json<PrefillErrorPayload>(
      { ok: false, error: boilerError?.message || "Boiler not found." },
      { status: 500 },
    );
  }

  const { data: lastObservation, error: lastObservationError } = await supabase
    .from("legacy_asset_tests")
    .select("tested_at, technician_name, result, notes, readings_json")
    .eq("asset_id", asset.id)
    .order("tested_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastObservationError) {
    return NextResponse.json<PrefillErrorPayload>(
      { ok: false, error: lastObservationError.message },
      { status: 500 },
    );
  }

  const payload: AssetPrefillPayload = {
    ok: true,
    resource: "asset",
    public_id: asset.public_id,
    asset: {
      public_id: asset.public_id,
      asset_code: asset.asset_code,
      asset_category: asset.asset_category,
      asset_classification: asset.asset_classification,
      asset_nomenclature: asset.asset_nomenclature,
      asset_name: asset.asset_name,
      manufacturer: asset.manufacturer,
      model: asset.model,
      serial_number: asset.serial_number,
      install_date: asset.install_date,
      set_point: asset.set_point,
      trip_point: asset.trip_point,
      location_description: asset.location_description,
      service_status: asset.service_status,
    },
    inspection_target: null,
    boiler: {
      public_id: boiler.public_id,
      facility_name: boiler.facility_name,
      site_code: boiler.site_code,
      boiler_tag: boiler.boiler_tag,
      manufacturer: boiler.manufacturer,
      model: boiler.model,
      serial_number: boiler.serial_number,
    },
    last_observation: lastObservation
      ? {
          observed_at: lastObservation.tested_at,
          technician_name: lastObservation.technician_name,
          result: lastObservation.result,
          notes: lastObservation.notes,
          readings:
            (lastObservation.readings_json as Record<string, unknown> | null) ??
            {},
        }
      : null,
  };

  return NextResponse.json(payload, {
    headers: { "Cache-Control": "no-store" },
  });
}
