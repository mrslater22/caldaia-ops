import type { DataTableClient } from "./datatables/client.ts";
import {
  syncConfiguredDataTable,
  type DataTableSyncResult,
} from "./data-table-sync.ts";
import {
  ASSET_INFO_SYNC_PROFILE,
  loadAssetInfoSyncConfig,
} from "./asset-info-sync-config.ts";

export type AssetInfoSyncResult = DataTableSyncResult;

type Env = Record<string, string | undefined>;

/**
 * Asset Info upsert. A failure is returned, not thrown. Does nothing until
 * FASTFIELD_ASSET_INFO_SYNC_ENABLED=true and the field map is set.
 */
export async function syncAssetInfoFromSubmission(
  payload: Record<string, unknown>,
  deps?: { client?: DataTableClient; env?: Env },
): Promise<AssetInfoSyncResult> {
  const env = deps?.env ?? process.env;
  const config = loadAssetInfoSyncConfig(env);
  return syncConfiguredDataTable(payload, config, ASSET_INFO_SYNC_PROFILE, deps);
}
