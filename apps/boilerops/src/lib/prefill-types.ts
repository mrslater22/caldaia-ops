export type BoilerPrefillPayload = {
  ok: true;
  resource: "boiler";
  public_id: string;
  boiler: {
    public_id: string;
    facility_name: string;
    site_code: string | null;
    boiler_tag: string | null;
    manufacturer: string | null;
    model: string | null;
    serial_number: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    contact_name: string | null;
    contact_email: string | null;
    contact_phone: string | null;
    notes: string | null;
    onboarded_at: string | null;
  };
  assets: Array<{
    public_id: string;
    asset_code: string | null;
    asset_category: "safety" | "measurement";
    asset_classification: string;
    asset_nomenclature: string | null;
    asset_name: string | null;
    manufacturer: string | null;
    model: string | null;
    serial_number: string | null;
    location_description: string | null;
    service_status: string;
  }>;
};

export type AssetPrefillPayload = {
  ok: true;
  resource: "asset";
  public_id: string;
  asset: {
    public_id: string;
    asset_code: string | null;
    asset_category: "safety" | "measurement";
    asset_classification: string;
    asset_nomenclature: string | null;
    asset_name: string | null;
    manufacturer: string | null;
    model: string | null;
    serial_number: string | null;
    install_date: string | null;
    set_point: string | null;
    trip_point: string | null;
    location_description: string | null;
    service_status: string;
  };
  inspection_target: {
    public_id: string;
    target_type: "boiler" | "plant";
    target_code: string;
    display_name: string;
    location_description: string | null;
    service_status: string;
  } | null;
  boiler: {
    public_id: string;
    facility_name: string;
    site_code: string | null;
    boiler_tag: string | null;
    manufacturer: string | null;
    model: string | null;
    serial_number: string | null;
  } | null;
  last_observation: {
    observed_at: string;
    technician_name: string | null;
    result: string | null;
    notes: string | null;
    readings: Record<string, unknown>;
  } | null;
};

export type PrefillErrorPayload = {
  ok: false;
  error: string;
};
