/**
 * Shared env loader for FastField Data Table syncs other than Site Info.
 * Site Info keeps its own loader so its no-op messages stay stable.
 * Every sync is off until its enable flag is true and the field map is set.
 */

export type NamedTableSyncConfig = {
  ready: boolean;
  enabled: boolean;
  tableName: string;
  listId: string;
  keyColumn: string;
  fieldMap: Record<string, string>;
  reason: string;
};

type Env = Record<string, string | undefined>;

const ENABLED_VALUES = new Set(["1", "true", "yes", "on"]);

export function loadNamedTableSyncConfig(
  env: Env,
  options: {
    label: string;
    enabledEnv: string;
    tableNameEnv: string;
    listIdEnv: string;
    keyColumnEnv: string;
    fieldMapEnv: string;
    defaultTableName: string;
    defaultListId: string;
    defaultKeyColumn: string;
    defaultFieldMap: Readonly<Record<string, string>>;
    configFile: string;
    offReason: string;
  },
): NamedTableSyncConfig {
  const enabled = ENABLED_VALUES.has(
    env[options.enabledEnv]?.trim().toLowerCase() ?? "",
  );
  const tableName = env[options.tableNameEnv]?.trim() || options.defaultTableName;
  const listId = env[options.listIdEnv]?.trim() || options.defaultListId;
  const keyColumn = env[options.keyColumnEnv]?.trim() || options.defaultKeyColumn.trim();
  const parsedMap = parseFieldMap(env[options.fieldMapEnv], options.fieldMapEnv);
  const fieldMap = parsedMap.provided ? parsedMap.map : { ...options.defaultFieldMap };

  if (!enabled) {
    return {
      ready: false,
      enabled: false,
      tableName,
      listId,
      keyColumn,
      fieldMap,
      reason: options.offReason,
    };
  }

  const problems: string[] = [];
  if (parsedMap.error) problems.push(parsedMap.error);
  if (!listId && !tableName) {
    problems.push(
      `table name and listId are both empty. Set ${options.listIdEnv} or ${options.tableNameEnv}.`,
    );
  }
  if (!keyColumn) {
    problems.push(
      `key column is empty. Set ${options.keyColumnEnv} to the exact column display name.`,
    );
  }
  if (!parsedMap.error && Object.keys(fieldMap).length === 0) {
    problems.push(
      `field map is empty. Set ${options.fieldMapEnv} to a JSON object of column display names to submission field keys, or fill the map in ${options.configFile}.`,
    );
  }

  if (problems.length > 0) {
    return {
      ready: false,
      enabled: true,
      tableName,
      listId,
      keyColumn,
      fieldMap,
      reason: `${options.label} sync is not configured, so this is a no-op. ${problems.join(" ")}`,
    };
  }

  return {
    ready: true,
    enabled: true,
    tableName,
    listId,
    keyColumn,
    fieldMap,
    reason: "",
  };
}

function parseFieldMap(
  raw: string | undefined,
  envName: string,
): { provided: boolean; map: Record<string, string>; error?: string } {
  const trimmed = raw?.trim() ?? "";
  if (!trimmed) return { provided: false, map: {} };
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return {
      provided: true,
      map: {},
      error: `${envName} is not valid JSON.`,
    };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      provided: true,
      map: {},
      error: `${envName} must be a JSON object.`,
    };
  }
  const map: Record<string, string> = {};
  for (const [column, fieldKey] of Object.entries(parsed)) {
    if (typeof fieldKey !== "string" || !fieldKey.trim() || !column.trim()) {
      return {
        provided: true,
        map: {},
        error: `${envName} values must be non-empty submission field keys, and keys must be non-empty column display names.`,
      };
    }
    map[column] = fieldKey.trim();
  }
  return { provided: true, map };
}
