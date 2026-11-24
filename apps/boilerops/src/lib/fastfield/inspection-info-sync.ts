import type { DataTableClient } from "./datatables/client.ts";
import {
  syncConfiguredDataTable,
  type DataTableSyncResult,
} from "./data-table-sync.ts";
import {
  INSPECTION_INFO_SYNC_PROFILE,
  loadInspectionInfoSyncConfig,
} from "./inspection-info-sync-config.ts";

export type InspectionInfoSyncResult = DataTableSyncResult;

type Env = Record<string, string | undefined>;

/**
 * Inspection Info upsert. A failure is returned, not thrown. Does nothing
 * until FASTFIELD_INSPECTION_INFO_SYNC_ENABLED=true and the field map is set.
 */
export async function syncInspectionInfoFromSubmission(
  payload: Record<string, unknown>,
  deps?: { client?: DataTableClient; env?: Env },
): Promise<InspectionInfoSyncResult> {
  const env = deps?.env ?? process.env;
  const config = loadInspectionInfoSyncConfig(env);
  return syncConfiguredDataTable(
    payload,
    config,
    INSPECTION_INFO_SYNC_PROFILE,
    deps,
  );
}
