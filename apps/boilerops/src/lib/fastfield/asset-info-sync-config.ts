/**
 * Asset Info Data Table sync configuration.
 *
 * Off until FASTFIELD_ASSET_INFO_SYNC_ENABLED=true and the field map is
 * set. The listId and key column have known defaults. Field names below
 * have not been validated against a live form payload. Env overrides this
 * module. See docs/fastfield-inspection-asset-onboarding.md.
 */

import {
  loadNamedTableSyncConfig,
  type NamedTableSyncConfig,
} from "./data-table-sync-config.ts";
import type { DataTableSyncProfile } from "./data-table-sync.ts";

export const ASSET_INFO_TABLE_NAME = "Asset Info";

/** Live listId for Asset Info. Override with FASTFIELD_ASSET_INFO_LIST_ID. */
export const ASSET_INFO_LIST_ID = "2182c9f7-8045-4418-9bb1-eaddb13c097d";

/** Lookup-key display name. Override with FASTFIELD_ASSET_INFO_KEY_COLUMN. */
export const ASSET_INFO_KEY_COLUMN = "bo_assetid";

/**
 * Not applied until set in env or copied here. Keys are column display
 * names. Values are submission field keys. Identity is the expected map.
 */
export const ASSET_INFO_FIELD_MAP: Readonly<Record<string, string>> = {};

export const SUGGESTED_ASSET_INFO_FIELD_MAP: Readonly<Record<string, string>> = {
  bo_assetid: "bo_assetid",
  bo_targetid: "bo_targetid",
  bo_siteid: "bo_siteid",
  asset_code: "asset_code",
  asset_category: "asset_category",
  asset_classification: "asset_classification",
  asset_nomenclature: "asset_nomenclature",
  asset_name: "asset_name",
  manufacturer: "manufacturer",
  model: "model",
  serial_number: "serial_number",
};

export const ASSET_INFO_SYNC_PROFILE: DataTableSyncProfile = {
  subject: "Asset info",
  subjectLower: "asset info",
  keyNoun: "asset key",
  logTag: "asset-info",
};

export type AssetInfoSyncConfig = NamedTableSyncConfig;

type Env = Record<string, string | undefined>;

export function loadAssetInfoSyncConfig(env: Env = process.env): AssetInfoSyncConfig {
  return loadNamedTableSyncConfig(env, {
    label: "Asset info",
    enabledEnv: "FASTFIELD_ASSET_INFO_SYNC_ENABLED",
    tableNameEnv: "FASTFIELD_ASSET_INFO_TABLE_NAME",
    listIdEnv: "FASTFIELD_ASSET_INFO_LIST_ID",
    keyColumnEnv: "FASTFIELD_ASSET_INFO_KEY_COLUMN",
    fieldMapEnv: "FASTFIELD_ASSET_INFO_FIELD_MAP",
    defaultTableName: ASSET_INFO_TABLE_NAME,
    defaultListId: ASSET_INFO_LIST_ID,
    defaultKeyColumn: ASSET_INFO_KEY_COLUMN,
    defaultFieldMap: ASSET_INFO_FIELD_MAP,
    configFile: "apps/boilerops/src/lib/fastfield/asset-info-sync-config.ts",
    offReason:
      "FASTFIELD_ASSET_INFO_SYNC_ENABLED is not true. Asset info sync is off and submission ingest is unchanged.",
  });
}
