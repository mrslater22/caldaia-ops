import { DEMO_ORGANIZATION_ID } from "@/lib/constants";
import type { DataTableSyncResult } from "@/lib/fastfield/data-table-sync";
import {
  mapAssetOnboarding,
  payloadForAssetInfoSync,
  type AssetOnboardingFieldMappings,
} from "@/lib/fastfield/asset-onboarding-mapper";
import { persistAssetOnboarding } from "@/lib/fastfield/asset-onboarding";
import { createDefaultAssetOnboardingRepository } from "@/lib/fastfield/asset-onboarding-repository";
import { syncAssetInfoFromSubmission } from "@/lib/fastfield/asset-info-sync";
import type { ResolvedDeviceForm } from "@/lib/fastfield/device-form-config";
import {
  mapDeviceSubmission,
  payloadForSiteInfoSync,
} from "@/lib/fastfield/device-submission";
import {
  classifyFastFieldSubmission,
  UNPROCESSED_PURPOSE,
} from "@/lib/fastfield/ingest-purpose";
import {
  mapInspectionOnboarding,
  payloadForInspectionInfoSync,
  type InspectionOnboardingFieldMappings,
} from "@/lib/fastfield/inspection-onboarding-mapper";
import { persistInspectionOnboarding } from "@/lib/fastfield/inspection-onboarding";
import { createDefaultInspectionOnboardingRepository } from "@/lib/fastfield/inspection-onboarding-repository";
import { syncInspectionInfoFromSubmission } from "@/lib/fastfield/inspection-info-sync";
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
import { payloadForSiteOnboardingSiteInfo } from "@/lib/fastfield/site-info-payload";
import {
  mapSiteOnboarding,
  type SiteOnboardingFieldMappings,
} from "@/lib/fastfield/site-onboarding-mapper";
import { syncSiteToFastField } from "@/lib/fastfield/site-table-sync";
import {
  syncSiteInfoFromSubmission,
  type SiteInfoSyncResult,
} from "@/lib/fastfield/site-info-sync";
import { recordDeviceVisit } from "@/lib/fastfield/site-visit";
import { createDefaultSiteVisitRepository } from "@/lib/fastfield/site-visit-repository";
import { makePublicId } from "@/lib/public-id";
import { persistSiteOnboarding } from "@/lib/sites/service";
import { createServiceClient } from "@/lib/supabase/server";

export type RegisteredForm = {
  id: string;
  fastfield_form_id: string;
  name: string;
  purpose: string;
  field_mappings_json:
    | OnboardingFieldMappings
    | SiteOnboardingFieldMappings
    | InspectionOnboardingFieldMappings
    | AssetOnboardingFieldMappings;
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
  sitePublicId: string | null;
  boilerPublicId: string | null;
  assetPublicIds: string[];
  fastFieldSyncStatus?: "pending" | "synced" | "failed";
  siteInfoSync?: SiteInfoSyncResult;
  inspectionInfoSync?: DataTableSyncResult;
  assetInfoSync?: DataTableSyncResult;
  visitPublicId: string | null;
  siteVisitId: string | null;
  visitCreated: boolean | null;
  targetPublicId: string | null;
  targetCreated: boolean | null;
  deviceTestPublicId: string | null;
  deviceTestCreated: boolean | null;
  reportPublicId: string | null;
  reportStatus: string | null;
  reportDeviceCount: number | null;
  warning?: string;
};

type DeviceResultFields = {
  visitPublicId: string | null;
  siteVisitId: string | null;
  visitCreated: boolean | null;
  targetPublicId: string | null;
  targetCreated: boolean | null;
  deviceTestPublicId: string | null;
  deviceTestCreated: boolean | null;
  reportPublicId: string | null;
  reportStatus: string | null;
  reportDeviceCount: number | null;
};

type DomainWrite = DeviceResultFields & {
  sitePublicId: string | null;
  boilerPublicId: string | null;
  assetPublicIds: string[];
  fastFieldSyncStatus?: "pending" | "synced" | "failed";
  siteInfoSync?: SiteInfoSyncResult;
  inspectionInfoSync?: DataTableSyncResult;
  assetInfoSync?: DataTableSyncResult;
};

type SyncPayloads = {
  siteInfo?: Record<string, unknown>;
  inspectionInfo?: Record<string, unknown>;
  assetInfo?: Record<string, unknown>;
};

function emptyDeviceFields(): DeviceResultFields {
  return {
    visitPublicId: null,
    siteVisitId: null,
    visitCreated: null,
    targetPublicId: null,
    targetCreated: null,
    deviceTestPublicId: null,
    deviceTestCreated: null,
    reportPublicId: null,
    reportStatus: null,
    reportDeviceCount: null,
  };
}

function deviceFieldsFrom(prior: Partial<DeviceResultFields>): DeviceResultFields {
  return {
    visitPublicId: prior.visitPublicId ?? null,
    siteVisitId: prior.siteVisitId ?? null,
    visitCreated: prior.visitCreated ?? null,
    targetPublicId: prior.targetPublicId ?? null,
    targetCreated: prior.targetCreated ?? null,
    deviceTestPublicId: prior.deviceTestPublicId ?? null,
    deviceTestCreated: prior.deviceTestCreated ?? null,
    reportPublicId: prior.reportPublicId ?? null,
    reportStatus: prior.reportStatus ?? null,
    reportDeviceCount: prior.reportDeviceCount ?? null,
  };
}

function joinWarning(left?: string, right?: string): string | undefined {
  const parts = [left, right].filter((part): part is string => Boolean(part));
  return parts.length ? parts.join(" ") : undefined;
}

const RETRYABLE_FAILED_PURPOSES = new Set([
  "high_pressure",
  "inspection_onboarding",
  "asset_onboarding",
]);

/**
 * Data Table upserts must not fail submission ingest. Each sync returns
 * failures, and these wrappers catch anything unexpected.
 */
async function runTableSync(
  label: string,
  payload: Record<string, unknown>,
  sync: (payload: Record<string, unknown>) => Promise<DataTableSyncResult>,
): Promise<DataTableSyncResult> {
  try {
    return await sync(payload);
  } catch (error) {
    const reason =
      error instanceof Error ? error.message : `${label} sync failed.`;
    console.error(`[fastfield ${label} sync] unexpected error: ${reason}`);
    return { status: "failed", reason };
  }
}

function noteTableSyncFailure(
  warning: string | undefined,
  label: string,
  sync: DataTableSyncResult | undefined,
): string | undefined {
  if (!sync || sync.status !== "failed") return warning;
  const note = `${label} Data Table sync failed: ${sync.reason}`;
  return warning ? `${warning} ${note}` : note;
}

async function applyTableSyncs(
  purpose: string,
  syncPayloads: SyncPayloads,
  deviceForm: ResolvedDeviceForm | null,
  warning?: string,
): Promise<{
  warning?: string;
  siteInfoSync?: SiteInfoSyncResult;
  inspectionInfoSync?: DataTableSyncResult;
  assetInfoSync?: DataTableSyncResult;
}> {
  const siteInfoSync = syncPayloads.siteInfo
    ? await runTableSync("site-info", syncPayloads.siteInfo, syncSiteInfoFromSubmission)
    : undefined;
  const inspectionInfoSync = syncPayloads.inspectionInfo
    ? await runTableSync(
        "inspection-info",
        syncPayloads.inspectionInfo,
        syncInspectionInfoFromSubmission,
      )
    : undefined;
  const assetInfoSync = syncPayloads.assetInfo
    ? await runTableSync(
        "asset-info",
        syncPayloads.assetInfo,
        syncAssetInfoFromSubmission,
      )
    : undefined;

  let next = noteTableSyncFailure(warning, "Site info", siteInfoSync);
  if (siteInfoSync) {
    next = noteVisitColumnSkipped(next, purpose, siteInfoSync, deviceForm);
  }
  next = noteTableSyncFailure(next, "Inspection info", inspectionInfoSync);
  next = noteTableSyncFailure(next, "Asset info", assetInfoSync);
  return { warning: next, siteInfoSync, inspectionInfoSync, assetInfoSync };
}

async function writeDomain(
  payload: Record<string, unknown>,
  registered: RegisteredForm | null,
  purpose: string,
  submissionId: string,
  deviceForm: ResolvedDeviceForm | null,
): Promise<{
  created: DomainWrite;
  warning?: string;
  syncPayloads: SyncPayloads;
}> {
  if (purpose === "site_onboarding") {
    const mappings = (registered?.field_mappings_json ??
      {}) as SiteOnboardingFieldMappings;
    const mapped = mapSiteOnboarding(payload, mappings);
    const persisted = await persistSiteOnboarding(mapped, submissionId);
    const sync = await syncSiteToFastField(persisted.site);
    return {
      created: {
        ...emptyDeviceFields(),
        sitePublicId: persisted.sitePublicId,
        boilerPublicId: null,
        assetPublicIds: [],
        fastFieldSyncStatus: sync.status,
      },
      warning: sync.error,
      syncPayloads: {
        siteInfo: payloadForSiteOnboardingSiteInfo(payload, {
          bo_siteid: persisted.site.public_id,
          bo_qrcode: persisted.site.qr_target_url,
          site_code: mapped.site_code,
          va_loc: mapped.facility_name,
          va_contact: mapped.contact_name,
          va_contact_email: mapped.contact_email,
          va_contact_phone: mapped.contact_phone,
        }),
      },
    };
  }

  if (purpose === "boiler_onboarding") {
    const mappings = (registered?.field_mappings_json ??
      {}) as OnboardingFieldMappings;
    const mapped = mapBoilerOnboarding(payload, mappings);
    const boiler = await persistOnboarding(mapped, submissionId);
    return {
      created: {
        ...emptyDeviceFields(),
        sitePublicId: null,
        boilerPublicId: boiler.boilerPublicId,
        assetPublicIds: boiler.assetPublicIds,
      },
      syncPayloads: { siteInfo: payload },
    };
  }

  if (purpose === "inspection_onboarding") {
    const mappings = (registered?.field_mappings_json ??
      {}) as InspectionOnboardingFieldMappings;
    const mapped = mapInspectionOnboarding(payload, mappings);
    const persisted = await persistInspectionOnboarding(mapped, {
      organizationId: DEMO_ORGANIZATION_ID,
      repository: createDefaultInspectionOnboardingRepository(),
    });
    return {
      created: {
        ...emptyDeviceFields(),
        sitePublicId: persisted.sitePublicId,
        boilerPublicId: null,
        assetPublicIds: [],
        targetPublicId: persisted.targetPublicId,
        targetCreated: persisted.created,
      },
      syncPayloads: {
        inspectionInfo: payloadForInspectionInfoSync(
          payload,
          mapped,
          {
            bo_targetid: persisted.targetPublicId,
            bo_siteid: persisted.sitePublicId,
          },
          mappings,
        ),
      },
    };
  }

  if (purpose === "asset_onboarding") {
    const mappings = (registered?.field_mappings_json ??
      {}) as AssetOnboardingFieldMappings;
    const mapped = mapAssetOnboarding(payload, mappings);
    const persisted = await persistAssetOnboarding(mapped, {
      organizationId: DEMO_ORGANIZATION_ID,
      repository: createDefaultAssetOnboardingRepository(),
    });
    return {
      created: {
        ...emptyDeviceFields(),
        sitePublicId: persisted.sitePublicId,
        boilerPublicId: null,
        assetPublicIds: [persisted.assetPublicId],
        targetPublicId: persisted.targetPublicId,
        targetCreated: false,
      },
      syncPayloads: {
        assetInfo: payloadForAssetInfoSync(
          payload,
          mapped,
          {
            bo_assetid: persisted.assetPublicId,
            bo_targetid: persisted.targetPublicId,
            bo_siteid: persisted.sitePublicId,
          },
          mappings,
        ),
      },
    };
  }

  if (purpose === "high_pressure") {
    if (!deviceForm) {
      throw new Error("High Pressure form could not be resolved.");
    }
    const mapped = mapDeviceSubmission(payload, deviceForm.definition);
    const recorded = await recordDeviceVisit({
      organizationId: DEMO_ORGANIZATION_ID,
      submissionId,
      formId: extractFormId(payload) ?? registered?.fastfield_form_id ?? null,
      mapped,
      repository: createDefaultSiteVisitRepository(),
    });
    return {
      created: {
        sitePublicId: recorded.sitePublicId,
        boilerPublicId: null,
        assetPublicIds: [recorded.targetPublicId],
        fastFieldSyncStatus: undefined,
        visitPublicId: recorded.visitPublicId,
        siteVisitId: recorded.externalVisitId,
        visitCreated: recorded.visitCreated,
        targetPublicId: recorded.targetPublicId,
        targetCreated: recorded.targetCreated,
        deviceTestPublicId: recorded.testPublicId,
        deviceTestCreated: recorded.testCreated,
        reportPublicId: recorded.reportPublicId,
        reportStatus: recorded.reportStatus,
        reportDeviceCount: recorded.reportDeviceCount,
      },
      syncPayloads: {
        siteInfo: payloadForSiteInfoSync(
          payload,
          deviceForm.definition,
          recorded.externalVisitId,
          mapped,
        ),
      },
    };
  }

  if (purpose === "low_pressure") {
    throw new Error(
      "Low Pressure submissions are recognized and are not implemented yet. Do not point that form at the webhook for this test. See docs/hp-device-e2e-test.md.",
    );
  }

  throw new Error(
    `Unsupported form purpose "${purpose}". Register a supported purpose.`,
  );
}

function noteVisitColumnSkipped(
  warning: string | undefined,
  purpose: string,
  sync: SiteInfoSyncResult,
  deviceForm: ResolvedDeviceForm | null,
): string | undefined {
  if (purpose !== "high_pressure" || sync.status !== "skipped") return warning;
  const column = deviceForm?.definition.visitIdColumn ?? "Site Visit ID";
  const fieldKey = deviceForm?.definition.fields.siteVisitId ?? "site_visit_id";
  return joinWarning(
    warning,
    `FastField site table visit ID was not written (${column} → ${fieldKey}). ${sync.reason}`,
  );
}

export async function ingestFastFieldSubmission(
  payload: Record<string, unknown>,
): Promise<IngestResult> {
  const supabase = createServiceClient();
  const submissionId = extractSubmissionId(payload);
  const formId = extractFormId(payload);
  const registered = await resolveRegisteredForm(payload);
  const classification = classifyFastFieldSubmission(payload, registered);
  const purpose = classification.purpose;
  const idempotencyKey = `fastfield:${purpose}:${submissionId}`;

  const { data: existing } = await supabase
    .from("integration_events")
    .select("id, status, payload_json, result_json")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();

  const retryFailed =
    existing?.status === "failed" && RETRYABLE_FAILED_PURPOSES.has(purpose);

  if (existing && !retryFailed) {
    const legacyPayload = existing.payload_json as {
      result?: DomainWrite;
    } | null;
    const prior = (existing.result_json ?? legacyPayload?.result ?? {}) as DomainWrite & {
      warning?: string;
    };
    return {
      eventId: existing.id,
      submissionId,
      formId: formId ?? registered?.fastfield_form_id ?? null,
      purpose,
      duplicate: true,
      sitePublicId: prior.sitePublicId ?? null,
      boilerPublicId: prior.boilerPublicId ?? null,
      assetPublicIds: prior.assetPublicIds ?? [],
      fastFieldSyncStatus: prior.fastFieldSyncStatus,
      siteInfoSync: prior.siteInfoSync,
      inspectionInfoSync: prior.inspectionInfoSync,
      assetInfoSync: prior.assetInfoSync,
      ...deviceFieldsFrom(prior),
      warning: prior.warning ?? classification.warning,
    };
  }

  let eventId = existing?.id;
  if (!existing) {
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
    eventId = event.id;
  } else {
    await supabase
      .from("integration_events")
      .update({
        status: "received",
        error_message: null,
        processed_at: null,
        event_type: purpose,
        payload_json: payload,
      })
      .eq("id", existing.id);
  }

  let warning = classification.warning;

  try {
    if (classification.unprocessed) {
      const reason =
        classification.warning ??
        "Unregistered FastField form. The raw submission was stored for review and was not processed as boiler onboarding.";
      await supabase
        .from("integration_events")
        .update({
          status: UNPROCESSED_PURPOSE,
          event_type: UNPROCESSED_PURPOSE,
          error_message: reason,
          processed_at: new Date().toISOString(),
          result_json: { warning: reason, review: true },
        })
        .eq("id", eventId);
      return {
        eventId: eventId!,
        submissionId,
        formId: formId ?? registered?.fastfield_form_id ?? null,
        purpose: UNPROCESSED_PURPOSE,
        duplicate: false,
        sitePublicId: null,
        boilerPublicId: null,
        assetPublicIds: [],
        ...emptyDeviceFields(),
        warning: reason,
      };
    }

    const written = await writeDomain(
      payload,
      registered,
      purpose,
      submissionId,
      classification.deviceForm,
    );
    warning = joinWarning(warning, written.warning);
    const synced = await applyTableSyncs(
      purpose,
      written.syncPayloads,
      classification.deviceForm,
      warning,
    );
    warning = synced.warning;
    written.created.siteInfoSync = synced.siteInfoSync;
    written.created.inspectionInfoSync = synced.inspectionInfoSync;
    written.created.assetInfoSync = synced.assetInfoSync;

    await supabase
      .from("integration_events")
      .update({
        status: "processed",
        processed_at: new Date().toISOString(),
        result_json: { ...written.created, warning },
      })
      .eq("id", eventId);

    return {
      eventId: eventId!,
      submissionId,
      formId: formId ?? registered?.fastfield_form_id ?? null,
      purpose,
      duplicate: false,
      sitePublicId: written.created.sitePublicId,
      boilerPublicId: written.created.boilerPublicId,
      assetPublicIds: written.created.assetPublicIds,
      fastFieldSyncStatus: written.created.fastFieldSyncStatus,
      siteInfoSync: synced.siteInfoSync,
      inspectionInfoSync: synced.inspectionInfoSync,
      assetInfoSync: synced.assetInfoSync,
      ...deviceFieldsFrom(written.created),
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
      .eq("id", eventId);
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

  const submissionId = extractSubmissionId(rawPayload);
  const registered = await resolveRegisteredForm(rawPayload);
  const classification = classifyFastFieldSubmission(rawPayload, registered);
  const purpose = classification.purpose;

  if (classification.unprocessed) {
    const reason =
      classification.warning ??
      "Unregistered FastField form. The raw submission was stored for review and was not processed as boiler onboarding.";
    await supabase
      .from("integration_events")
      .update({
        status: UNPROCESSED_PURPOSE,
        event_type: UNPROCESSED_PURPOSE,
        fastfield_form_id:
          extractFormId(rawPayload) ?? registered?.fastfield_form_id ?? null,
        error_message: reason,
        processed_at: new Date().toISOString(),
        payload_json: rawPayload,
        result_json: { warning: reason, review: true },
      })
      .eq("id", eventId);
    return {
      eventId,
      submissionId,
      purpose: UNPROCESSED_PURPOSE,
      sitePublicId: null,
      boilerPublicId: null,
      assetPublicIds: [],
      ...emptyDeviceFields(),
      warning: reason,
    };
  }

  const written = await writeDomain(
    rawPayload,
    registered,
    purpose,
    submissionId,
    classification.deviceForm,
  );
  const synced = await applyTableSyncs(
    purpose,
    written.syncPayloads,
    classification.deviceForm,
    joinWarning(classification.warning, written.warning),
  );
  const warning = synced.warning;
  written.created.siteInfoSync = synced.siteInfoSync;
  written.created.inspectionInfoSync = synced.inspectionInfoSync;
  written.created.assetInfoSync = synced.assetInfoSync;

  await supabase
    .from("integration_events")
    .update({
      status: "processed",
      event_type: purpose,
      fastfield_form_id:
        extractFormId(rawPayload) ?? registered?.fastfield_form_id ?? null,
      processed_at: new Date().toISOString(),
      error_message: null,
      payload_json: rawPayload,
      result_json: { ...written.created, warning },
    })
    .eq("id", eventId);

  return {
    eventId,
    submissionId,
    purpose,
    sitePublicId: written.created.sitePublicId,
    boilerPublicId: written.created.boilerPublicId,
    assetPublicIds: written.created.assetPublicIds,
    siteInfoSync: synced.siteInfoSync,
    inspectionInfoSync: synced.inspectionInfoSync,
    assetInfoSync: synced.assetInfoSync,
    fastFieldSyncStatus: written.created.fastFieldSyncStatus,
    ...deviceFieldsFrom(written.created),
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

  await supabase.from("legacy_assets").delete().eq("boiler_id", boilerId);

  const assetPublicIds: string[] = [];
  if (mapped.assets.length) {
    const rows = mapped.assets.map((asset) => {
      const assetPublicId = makePublicId("asset");
      assetPublicIds.push(assetPublicId);
      return {
        public_id: assetPublicId,
        boiler_id: boilerId,
        organization_id: DEMO_ORGANIZATION_ID,
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
        service_status: "active",
      };
    });

    const { error: assetsError } = await supabase
      .from("legacy_assets")
      .insert(rows);
    if (assetsError) {
      throw new Error(assetsError.message);
    }
  }

  return { boilerPublicId: publicId, assetPublicIds };
}
