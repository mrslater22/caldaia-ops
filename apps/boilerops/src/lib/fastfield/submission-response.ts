import type { DataTableSyncResult } from "./data-table-sync.ts";

/**
 * Webhook JSON for POST /api/fastfield/submissions. Unprocessed forms use
 * the same 201/200 shape as a stored submission so FastField does not see
 * a crash. Domain ids stay null until a supported purpose runs.
 */
export type SubmissionResultView = {
  duplicate: boolean;
  eventId: string;
  submissionId: string;
  formId: string | null;
  purpose: string;
  warning?: string;
  sitePublicId: string | null;
  boilerPublicId: string | null;
  assetPublicIds: string[];
  fastFieldSyncStatus?: "pending" | "synced" | "failed";
  siteInfoSync?: DataTableSyncResult;
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
};

export function submissionHttpStatus(result: { duplicate: boolean }): number {
  return result.duplicate ? 200 : 201;
}

export function submissionResponseBody(
  result: SubmissionResultView,
  appUrl: string,
) {
  const urls = result.sitePublicId
    ? {
        site: `${appUrl}/i/site/${result.sitePublicId}`,
        site_qr: `${appUrl}/i/site/${result.sitePublicId}/qr`,
      }
    : result.boilerPublicId
      ? {
          boiler: `${appUrl}/i/boiler/${result.boilerPublicId}`,
          assets: result.assetPublicIds.map((id) => `${appUrl}/i/asset/${id}`),
        }
      : null;

  return {
    ok: true as const,
    duplicate: result.duplicate,
    event_id: result.eventId,
    submission_id: result.submissionId,
    form_id: result.formId,
    purpose: result.purpose,
    warning: result.warning ?? null,
    site_public_id: result.sitePublicId,
    boiler_public_id: result.boilerPublicId,
    asset_public_ids: result.assetPublicIds,
    fastfield_sync_status: result.fastFieldSyncStatus ?? null,
    site_info_sync: result.siteInfoSync ?? null,
    inspection_info_sync: result.inspectionInfoSync ?? null,
    asset_info_sync: result.assetInfoSync ?? null,
    visit_public_id: result.visitPublicId,
    site_visit_id: result.siteVisitId,
    visit_created: result.visitCreated,
    target_public_id: result.targetPublicId,
    target_created: result.targetCreated,
    device_test_public_id: result.deviceTestPublicId,
    device_test_created: result.deviceTestCreated,
    report_public_id: result.reportPublicId,
    report_status: result.reportStatus,
    report_device_count: result.reportDeviceCount,
    urls,
  };
}
