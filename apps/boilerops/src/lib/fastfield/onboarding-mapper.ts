/**
 * FastField often wraps scalar answers in single-element arrays.
 */
export function ffValue(raw: unknown): string | null {
  if (raw == null) return null;
  if (Array.isArray(raw)) {
    if (raw.length === 0) return null;
    return ffValue(raw[0]);
  }
  if (typeof raw === "object") {
    return null;
  }
  const text = String(raw).trim();
  return text.length ? text : null;
}

export function ffPick(
  payload: Record<string, unknown>,
  keys: string[],
): string | null {
  for (const key of keys) {
    if (key in payload) {
      const value = ffValue(payload[key]);
      if (value) return value;
    }
    // case-insensitive fallback
    const found = Object.keys(payload).find(
      (k) => k.toLowerCase() === key.toLowerCase(),
    );
    if (found) {
      const value = ffValue(payload[found]);
      if (value) return value;
    }
  }
  return null;
}

export function extractSubmissionId(payload: Record<string, unknown>): string {
  const id = ffPick(payload, [
    "submissionId",
    "submission_id",
    "documentId",
    "document_id",
    "id",
    "guid",
    "GUID",
  ]);
  if (id) return id;
  return `generated_${Date.now()}`;
}

export function extractFormId(payload: Record<string, unknown>): string | null {
  return ffPick(payload, [
    "formId",
    "form_id",
    "FormId",
    "formID",
    "fastfield_form_id",
  ]);
}

export function extractFormName(payload: Record<string, unknown>): string | null {
  return ffPick(payload, ["formName", "form_name", "FormName"]);
}

/** BoilerOps domain field -> FastField payload key */
export type OnboardingFieldMappings = Partial<{
  facility_name: string;
  site_code: string;
  boiler_tag: string;
  manufacturer: string;
  model: string;
  serial_number: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  notes: string;
  devices: string;
}>;

export type MappedOnboardingDevice = {
  device_type: string;
  equipment_group: string | null;
  manufacturer: string | null;
  model: string | null;
  serial_number: string | null;
  install_date: string | null;
  set_point: string | null;
  trip_point: string | null;
  location_description: string | null;
};

export type MappedBoilerOnboarding = {
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
  devices: MappedOnboardingDevice[];
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function mapDeviceRow(row: Record<string, unknown>): MappedOnboardingDevice | null {
  const device_type =
    ffPick(row, [
      "device_type",
      "deviceType",
      "type",
      "equipment_type",
      "safety_device_type",
    ]) ?? "unknown";

  const manufacturer = ffPick(row, ["manufacturer", "mfr", "make"]);
  const model = ffPick(row, ["model", "model_number", "modelNumber"]);
  const serial_number = ffPick(row, [
    "serial_number",
    "serialNumber",
    "serial",
  ]);

  // Skip completely empty placeholder rows
  if (
    device_type === "unknown" &&
    !manufacturer &&
    !model &&
    !serial_number
  ) {
    return null;
  }

  return {
    device_type,
    equipment_group: ffPick(row, ["equipment_group", "equipmentGroup", "group"]),
    manufacturer,
    model,
    serial_number,
    install_date: ffPick(row, ["install_date", "installDate", "installed"]),
    set_point: ffPick(row, ["set_point", "setPoint", "setpoint"]),
    trip_point: ffPick(row, ["trip_point", "tripPoint", "trippoint"]),
    location_description: ffPick(row, [
      "location_description",
      "location",
      "locationDescription",
    ]),
  };
}

function extractDeviceRows(
  payload: Record<string, unknown>,
  mappedDevicesKey?: string | null,
): MappedOnboardingDevice[] {
  const listKeys = [
    mappedDevicesKey,
    "devices",
    "safety_devices",
    "safetyDevices",
    "equipment",
    "device_list",
    "deviceList",
  ].filter((key): key is string => Boolean(key));

  for (const key of listKeys) {
    const raw = payload[key];
    if (!Array.isArray(raw)) continue;
    return raw
      .map((item) => asRecord(item))
      .filter((item): item is Record<string, unknown> => Boolean(item))
      .map(mapDeviceRow)
      .filter((item): item is MappedOnboardingDevice => Boolean(item));
  }

  // Some FastField payloads nest repeating sections under a parent object
  for (const [key, value] of Object.entries(payload)) {
    if (!/device|equipment|safety/i.test(key)) continue;
    if (!Array.isArray(value)) continue;
    const mapped = value
      .map((item) => asRecord(item))
      .filter((item): item is Record<string, unknown> => Boolean(item))
      .map(mapDeviceRow)
      .filter((item): item is MappedOnboardingDevice => Boolean(item));
    if (mapped.length) return mapped;
  }

  return [];
}

function mappedOrAliases(
  payload: Record<string, unknown>,
  mappedKey: string | undefined,
  aliases: string[],
): string | null {
  const keys = mappedKey ? [mappedKey, ...aliases] : aliases;
  return ffPick(payload, keys);
}

/**
 * Best-effort mapper for boiler onboarding.
 * Prefer explicit field_mappings from fastfield_forms when available.
 */
export function mapBoilerOnboarding(
  payload: Record<string, unknown>,
  mappings: OnboardingFieldMappings = {},
): MappedBoilerOnboarding {
  const facility_name =
    mappedOrAliases(payload, mappings.facility_name, [
      "facility_name",
      "facilityName",
      "facility",
      "plant_name",
      "plantName",
      "site_name",
      "siteName",
      "customer_name",
      "customerName",
      "building_name",
      "buildingName",
    ]) ?? "Unnamed Facility";

  return {
    facility_name,
    site_code: mappedOrAliases(payload, mappings.site_code, [
      "site_code",
      "siteCode",
      "site",
    ]),
    boiler_tag: mappedOrAliases(payload, mappings.boiler_tag, [
      "boiler_tag",
      "boilerTag",
      "boiler_name",
      "boilerName",
      "unit_tag",
      "unitTag",
      "equipment_tag",
    ]),
    manufacturer: mappedOrAliases(payload, mappings.manufacturer, [
      "boiler_manufacturer",
      "boilerManufacturer",
      "manufacturer",
      "mfr",
      "make",
    ]),
    model: mappedOrAliases(payload, mappings.model, [
      "boiler_model",
      "boilerModel",
      "model",
      "model_number",
    ]),
    serial_number: mappedOrAliases(payload, mappings.serial_number, [
      "boiler_serial_number",
      "boilerSerialNumber",
      "serial_number",
      "serialNumber",
      "serial",
    ]),
    address: mappedOrAliases(payload, mappings.address, [
      "address",
      "street",
      "street_address",
    ]),
    city: mappedOrAliases(payload, mappings.city, ["city"]),
    state: mappedOrAliases(payload, mappings.state, ["state", "province"]),
    zip: mappedOrAliases(payload, mappings.zip, [
      "zip",
      "zipcode",
      "postal_code",
      "postalCode",
    ]),
    contact_name: mappedOrAliases(payload, mappings.contact_name, [
      "contact_name",
      "contactName",
      "site_contact",
      "siteContact",
    ]),
    contact_email: mappedOrAliases(payload, mappings.contact_email, [
      "contact_email",
      "contactEmail",
      "email",
    ]),
    contact_phone: mappedOrAliases(payload, mappings.contact_phone, [
      "contact_phone",
      "contactPhone",
      "phone",
      "telephone",
    ]),
    notes: mappedOrAliases(payload, mappings.notes, [
      "notes",
      "comments",
      "remarks",
    ]),
    devices: extractDeviceRows(payload, mappings.devices),
  };
}
