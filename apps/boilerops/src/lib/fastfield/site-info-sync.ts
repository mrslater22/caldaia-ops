import type { DataTableClient } from "./datatables/client.ts";
import {
  DATA_TABLE_MAX_PAGES,
  DATA_TABLE_PAGE_SIZE,
  resetDataTableSyncStateForTests,
  syncConfiguredDataTable,
  type DataTableSyncProfile,
  type DataTableSyncResult,
} from "./data-table-sync.ts";
import { loadSiteInfoSyncConfig } from "./site-info-sync-config.ts";

/**
 * Site Info upsert. Behavior and env vars match the pre-generalization
 * sync: name resolution, GUID keys, full-row merge, fail closed. listId is
 * not configured here, so the table is still chosen by name.
 */

export const SITE_INFO_PAGE_SIZE = DATA_TABLE_PAGE_SIZE;
export const SITE_INFO_MAX_PAGES = DATA_TABLE_MAX_PAGES;

export type SiteInfoSyncResult = DataTableSyncResult;

export const SITE_INFO_SYNC_PROFILE: DataTableSyncProfile = {
  subject: "Site info",
  subjectLower: "site info",
  keyNoun: "site key",
  logTag: "site-info",
};

type Env = Record<string, string | undefined>;

export function resetSiteInfoSyncStateForTests(): void {
  resetDataTableSyncStateForTests();
}

export async function syncSiteInfoFromSubmission(
  payload: Record<string, unknown>,
  deps?: { client?: DataTableClient; env?: Env },
): Promise<SiteInfoSyncResult> {
  const env = deps?.env ?? process.env;
  const config = loadSiteInfoSyncConfig(env);
  return syncConfiguredDataTable(
    payload,
    { ...config, listId: "" },
    SITE_INFO_SYNC_PROFILE,
    deps,
  );
}
