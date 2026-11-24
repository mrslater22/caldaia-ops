/**
 * Inspection Info Data Table sync configuration.
 *
 * Off until FASTFIELD_INSPECTION_INFO_SYNC_ENABLED=true and the field map
 * is set. The listId and key column have known defaults. Field names below
 * have not been validated against a live form payload. Env overrides this
 * module. See docs/fastfield-inspection-asset-onboarding.md.
 */

import {
  loadNamedTableSyncConfig,
  type NamedTableSyncConfig,
} from "./data-table-sync-config.ts";
import type { DataTableSyncProfile } from "./data-table-sync.ts";

export const INSPECTION_INFO_TABLE_NAME = "Inspection Info";

/** Live listId for Inspection Info. Override with FASTFIELD_INSPECTION_INFO_LIST_ID. */
export const INSPECTION_INFO_LIST_ID = "d529b806-e0bb-497c-b852-cfec14c7102b";

/** Lookup-key display name. Override with FASTFIELD_INSPECTION_INFO_KEY_COLUMN. */
export const INSPECTION_INFO_KEY_COLUMN = "bo_targetid";

/**
 * Not applied until set in env or copied here. Keys are column display
 * names. Values are submission field keys. Identity is the expected map.
 */
export const INSPECTION_INFO_FIELD_MAP: Readonly<Record<string, string>> = {};

export const SUGGESTED_INSPECTION_INFO_FIELD_MAP: Readonly<Record<string, string>> = {
  bo_targetid: "bo_targetid",
  bo_siteid: "bo_siteid",
  inspection_scope: "inspection_scope",
  inspection_code: "inspection_code",
  inspection_name: "inspection_name",
};

export const INSPECTION_INFO_SYNC_PROFILE: DataTableSyncProfile = {
  subject: "Inspection info",
  subjectLower: "inspection info",
  keyNoun: "inspection key",
  logTag: "inspection-info",
};

export type InspectionInfoSyncConfig = NamedTableSyncConfig;

type Env = Record<string, string | undefined>;

export function loadInspectionInfoSyncConfig(
  env: Env = process.env,
): InspectionInfoSyncConfig {
  return loadNamedTableSyncConfig(env, {
    label: "Inspection info",
    enabledEnv: "FASTFIELD_INSPECTION_INFO_SYNC_ENABLED",
    tableNameEnv: "FASTFIELD_INSPECTION_INFO_TABLE_NAME",
    listIdEnv: "FASTFIELD_INSPECTION_INFO_LIST_ID",
    keyColumnEnv: "FASTFIELD_INSPECTION_INFO_KEY_COLUMN",
    fieldMapEnv: "FASTFIELD_INSPECTION_INFO_FIELD_MAP",
    defaultTableName: INSPECTION_INFO_TABLE_NAME,
    defaultListId: INSPECTION_INFO_LIST_ID,
    defaultKeyColumn: INSPECTION_INFO_KEY_COLUMN,
    defaultFieldMap: INSPECTION_INFO_FIELD_MAP,
    configFile: "apps/boilerops/src/lib/fastfield/inspection-info-sync-config.ts",
    offReason:
      "FASTFIELD_INSPECTION_INFO_SYNC_ENABLED is not true. Inspection info sync is off and submission ingest is unchanged.",
  });
}
