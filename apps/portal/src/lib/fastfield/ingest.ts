import { createHash, timingSafeEqual } from "crypto";
import type {
  MappedBoilerOnboarding,
  OnboardingFieldMappings,
} from "@/lib/fastfield/onboarding-mapper";
import {
  extractFormId,
  extractFormName,
  extractSubmissionId,
  mapBoilerOnboarding,
} from "@/lib/fastfield/onboarding-mapper";
import { createServiceClient } from "@/lib/supabase/server";

export const DEMO_ORGANIZATION_ID = "00000000-0000-4000-8000-000000000001";

export function authorizeFastFieldRequest(request: Request): boolean {
  const configuredSecret = process.env.FASTFIELD_WEBHOOK_SECRET?.trim();
  if (!configuredSecret) {
    return true;
  }

  const headerSecret =
    request.headers.get("x-boilerops-secret") ||
    request.headers.get("x-api-key") ||
    request.headers.get("x-fastfield-secret");

  if (headerSecret && secretsEqual(headerSecret, configuredSecret)) {
    return true;
  }

  const auth = request.headers.get("authorization");
  if (auth?.startsWith("Basic ")) {
    const decoded = Buffer.from(auth.slice(6), "base64").toString("utf8");
    const [, password] = decoded.split(":");
    if (password && secretsEqual(password, configuredSecret)) {
      return true;
    }
  }

  return false;
}

function secretsEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function makePublicId(prefix: "blr" | "dev"): string {
  const hex = createHash("sha256")
    .update(`${prefix}-${Date.now()}-${Math.random()}`)
    .digest("hex")
    .slice(0, 12);
  return `${prefix}_${hex}`;
}

export type RegisteredForm = {
  id: string;
  fastfield_form_id: string;
  name: string;
  purpose: string;
  field_mappings_json: OnboardingFieldMappings;
  active: boolean;
};

export async function resolveRegisteredForm(
  payload: Record<string, unknown>,
): Promise<RegisteredForm | null> {
  const supabase = createServiceClient();
  const formId = extractFormId(payload);
  const formName = extractFormName(payload);

  if (formId) {
    const { data } = await supabase
      .from("fastfield_forms")
      .select(
        "id, fastfield_form_id, name, purpose, field_mappings_json, active",
      )
      .eq("fastfield_form_id", formId)
      .eq("active", true)
      .maybeSingle();
    if (data) return data as RegisteredForm;
  }

  if (formName) {
    const { data } = await supabase
      .from("fastfield_forms")
      .select(
        "id, fastfield_form_id, name, purpose, field_mappings_json, active",
      )
      .ilike("name", formName)
      .eq("active", true)
      .maybeSingle();
    if (data) return data as RegisteredForm;
  }

  return null;
}

export type IngestResult = {
  eventId: string;
  submissionId: string;
  formId: string | null;
  purpose: string;
  duplicate: boolean;
  boilerPublicId: string | null;
  devicePublicIds: string[];
  warning?: string;
};

export async function ingestFastFieldSubmission(
  payload: Record<string, unknown>,
): Promise<IngestResult> {
  const supabase = createServiceClient();
  const submissionId = extractSubmissionId(payload);
  const formId = extractFormId(payload);
  const registered = await resolveRegisteredForm(payload);
  const purpose = registered?.purpose ?? "boiler_onboarding";
  const idempotencyKey = `fastfield:${purpose}:${submissionId}`;

  const { data: existing } = await supabase
    .from("integration_events")
    .select("id, status, payload_json")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();

  if (existing) {
    const prior = existing.payload_json as {
      result?: { boilerPublicId?: string; devicePublicIds?: string[] };
    } | null;
    return {
      eventId: existing.id,
      submissionId,
      formId: formId ?? registered?.fastfield_form_id ?? null,
      purpose,
      duplicate: true,
      boilerPublicId: prior?.result?.boilerPublicId ?? null,
      devicePublicIds: prior?.result?.devicePublicIds ?? [],
    };
  }

  const { data: event, error: eventError } = await supabase
    .from("integration_events")
    .insert({
      source_system: "fastfield",
      event_type: purpose,
      external_id: submissionId,
      fastfield_form_id: formId ?? registered?.fastfield_form_id ?? null,
      idempotency_key: idempotencyKey,
      payload_json: payload,
      status: "received",
    })
    .select("id")
    .single();

  if (eventError || !event) {
    throw new Error(eventError?.message || "Failed to store integration event.");
  }

  const warning = registered
    ? undefined
    : "No registered FastField form matched this submission; used default boiler_onboarding aliases.";

  try {
    if (purpose !== "boiler_onboarding") {
      throw new Error(
        `Unsupported form purpose "${purpose}". Register a supported purpose.`,
      );
    }

    const mappings = (registered?.field_mappings_json ??
      {}) as OnboardingFieldMappings;
    const mapped = mapBoilerOnboarding(payload, mappings);
    const created = await persistOnboarding(mapped, submissionId);

    await supabase
      .from("integration_events")
      .update({
        status: "processed",
        processed_at: new Date().toISOString(),
        payload_json: {
          ...payload,
          result: created,
          warning,
        },
      })
      .eq("id", event.id);

    return {
      eventId: event.id,
      submissionId,
      formId: formId ?? registered?.fastfield_form_id ?? null,
      purpose,
      duplicate: false,
      boilerPublicId: created.boilerPublicId,
      devicePublicIds: created.devicePublicIds,
      warning,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ingest failed.";
    await supabase
      .from("integration_events")
      .update({
        status: "failed",
        error_message: message,
        processed_at: new Date().toISOString(),
      })
      .eq("id", event.id);
    throw error;
  }
}

/** Reprocess an existing event from its stored raw payload. */
export async function reprocessIntegrationEvent(eventId: string) {
  const supabase = createServiceClient();
  const { data: event, error } = await supabase
    .from("integration_events")
    .select("id, payload_json, idempotency_key")
    .eq("id", eventId)
    .single();

  if (error || !event) {
    throw new Error(error?.message || "Event not found.");
  }

  const payload = event.payload_json as Record<string, unknown>;
  const rawPayload = { ...payload };
  delete rawPayload.result;
  delete rawPayload.warning;

  // Allow reprocessing by clearing idempotency collision on same key path:
  // delete old key row marker by updating key, then re-ingest into same event.
  await supabase
    .from("integration_events")
    .update({
      status: "received",
      error_message: null,
      processed_at: null,
      payload_json: rawPayload,
    })
    .eq("id", eventId);

  // Bypass duplicate short-circuit by temporarily rotating idempotency key
  const submissionId = extractSubmissionId(rawPayload);
  const registered = await resolveRegisteredForm(rawPayload);
  const purpose = registered?.purpose ?? "boiler_onboarding";
  const mappings = (registered?.field_mappings_json ??
    {}) as OnboardingFieldMappings;

  if (purpose !== "boiler_onboarding") {
    throw new Error(`Unsupported form purpose "${purpose}".`);
  }

  const mapped = mapBoilerOnboarding(rawPayload, mappings);
  const created = await persistOnboarding(mapped, submissionId);
  const warning = registered
    ? undefined
    : "No registered FastField form matched this submission; used default boiler_onboarding aliases.";

  await supabase
    .from("integration_events")
    .update({
      status: "processed",
      event_type: purpose,
      fastfield_form_id:
        extractFormId(rawPayload) ?? registered?.fastfield_form_id ?? null,
      processed_at: new Date().toISOString(),
      error_message: null,
      payload_json: {
        ...rawPayload,
        result: created,
        warning,
      },
    })
    .eq("id", eventId);

  return {
    eventId,
    submissionId,
    boilerPublicId: created.boilerPublicId,
    devicePublicIds: created.devicePublicIds,
    warning,
  };
}

async function persistOnboarding(
  mapped: MappedBoilerOnboarding,
  submissionId: string,
) {
  const supabase = createServiceClient();
  const boilerPublicId = makePublicId("blr");

  const { data: existingBoiler } = await supabase
    .from("boilers")
    .select("id, public_id")
    .eq("fastfield_submission_id", submissionId)
    .maybeSingle();

  let boilerId: string;
  let publicId = boilerPublicId;

  if (existingBoiler) {
    boilerId = existingBoiler.id;
    publicId = existingBoiler.public_id;
    await supabase
      .from("boilers")
      .update({
        facility_name: mapped.facility_name,
        site_code: mapped.site_code,
        boiler_tag: mapped.boiler_tag,
        manufacturer: mapped.manufacturer,
        model: mapped.model,
        serial_number: mapped.serial_number,
        address: mapped.address,
        city: mapped.city,
        state: mapped.state,
        zip: mapped.zip,
        contact_name: mapped.contact_name,
        contact_email: mapped.contact_email,
        contact_phone: mapped.contact_phone,
        notes: mapped.notes,
        onboarded_at: new Date().toISOString(),
      })
      .eq("id", boilerId);
  } else {
    const { data: boiler, error: boilerError } = await supabase
      .from("boilers")
      .insert({
        public_id: boilerPublicId,
        organization_id: DEMO_ORGANIZATION_ID,
        facility_name: mapped.facility_name,
        site_code: mapped.site_code,
        boiler_tag: mapped.boiler_tag,
        manufacturer: mapped.manufacturer,
        model: mapped.model,
        serial_number: mapped.serial_number,
        address: mapped.address,
        city: mapped.city,
        state: mapped.state,
        zip: mapped.zip,
        contact_name: mapped.contact_name,
        contact_email: mapped.contact_email,
        contact_phone: mapped.contact_phone,
        notes: mapped.notes,
        onboarded_at: new Date().toISOString(),
        fastfield_submission_id: submissionId,
      })
      .select("id, public_id")
      .single();

    if (boilerError || !boiler) {
      throw new Error(boilerError?.message || "Failed to create boiler.");
    }
    boilerId = boiler.id;
    publicId = boiler.public_id;
  }

  await supabase.from("devices").delete().eq("boiler_id", boilerId);

  const devicePublicIds: string[] = [];
  if (mapped.devices.length) {
    const rows = mapped.devices.map((device) => {
      const devicePublicId = makePublicId("dev");
      devicePublicIds.push(devicePublicId);
      return {
        public_id: devicePublicId,
        boiler_id: boilerId,
        organization_id: DEMO_ORGANIZATION_ID,
        equipment_group: device.equipment_group,
        device_type: device.device_type,
        manufacturer: device.manufacturer,
        model: device.model,
        serial_number: device.serial_number,
        install_date: device.install_date,
        set_point: device.set_point,
        trip_point: device.trip_point,
        location_description: device.location_description,
        service_status: "active",
      };
    });

    const { error: devicesError } = await supabase.from("devices").insert(rows);
    if (devicesError) {
      throw new Error(devicesError.message);
    }
  }

  return { boilerPublicId: publicId, devicePublicIds };
}
