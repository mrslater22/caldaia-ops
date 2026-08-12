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
  devices: Array<{
    public_id: string;
    device_type: string;
    manufacturer: string | null;
    model: string | null;
    serial_number: string | null;
    location_description: string | null;
    service_status: string;
  }>;
};

export type DevicePrefillPayload = {
  ok: true;
  resource: "device";
  public_id: string;
  device: {
    public_id: string;
    device_type: string;
    equipment_group: string | null;
    manufacturer: string | null;
    model: string | null;
    serial_number: string | null;
    install_date: string | null;
    set_point: string | null;
    trip_point: string | null;
    location_description: string | null;
    service_status: string;
  };
  boiler: {
    public_id: string;
    facility_name: string;
    site_code: string | null;
    boiler_tag: string | null;
    manufacturer: string | null;
    model: string | null;
    serial_number: string | null;
  };
  last_test: {
    tested_at: string;
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
