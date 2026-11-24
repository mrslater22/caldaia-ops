/**
 * Site Info Data Table sync configuration.
 *
 * MICHAEL — this mapping is intentionally blank. Do not guess column names.
 * The sync is a no-op until both of the following are set (here or via env)
 * AND `FASTFIELD_SITE_INFO_SYNC_ENABLED=true`:
 *
 * 1. The site-info column display name that identifies one site (the key).
 * 2. The map of site-info column display names → submission field keys.
 *
 * The list entry's `config.fields[].key` is the GUID used in row `data`.
 * Display names in this config are translated to those keys before lookup,
 * PUT, and POST. Env values override this module.
 * See docs/fastfield-site-info-sync.md.
 */

/**
 * Data Table `name` from `GET /datatables/list`. The live table is "Site Info".
 * Matching trims and ignores case. Override with `FASTFIELD_SITE_INFO_TABLE_NAME`.
 */
export const SITE_INFO_TABLE_NAME = "Site Info";

/**
 * Live lookup-key display name (`config.fields` `isLookupKey`).
 * Override with `FASTFIELD_SITE_INFO_KEY_COLUMN`.
 */
export const SITE_INFO_KEY_COLUMN = "site_code";

/**
 * PLACEHOLDER. Site-info column display name → submission payload field key.
 * Leave this empty until the columns are confirmed.
 * Override with `FASTFIELD_SITE_INFO_FIELD_MAP` (JSON object).
 *
 * Suggested identity map, not applied until set in env or copied here:
 * site_code, va_loc, va_contact, va_contact_email, va_contact_phone,
 * bo_siteid, bo_qrcode. See SUGGESTED_SITE_INFO_IDENTITY_FIELD_MAP and
 * docs/fastfield-site-info-sync.md. The live table has no visit ID column
 * yet. Add that column before mapping it.
 */
export const SITE_INFO_FIELD_MAP: Readonly<Record<string, string>> = {};

/**
 * Identity map Michael sets as FASTFIELD_SITE_INFO_FIELD_MAP. Not applied
 * until that env var is set. Site Onboarding copies generated bo_siteid and
 * bo_qrcode onto the payload, and fills va_* keys when the form left them
 * blank. High Pressure also copies va_* when those keys are blank.
 */
export const SUGGESTED_SITE_INFO_IDENTITY_FIELD_MAP: Readonly<Record<string, string>> = {
  site_code: "site_code",
  va_loc: "va_loc",
  va_contact: "va_contact",
  va_contact_email: "va_contact_email",
  va_contact_phone: "va_contact_phone",
  bo_siteid: "bo_siteid",
  bo_qrcode: "bo_qrcode",
};

export type SiteInfoSyncConfig = {
  /** True only when the flag is on and the key column and field map are set. */
  ready: boolean;
  enabled: boolean;
  tableName: string;
  keyColumn: string;
  fieldMap: Record<string, string>;
  /** Human-readable reason when `ready` is false. Empty when ready. */
  reason: string;
};

type Env = Record<string, string | undefined>;

const ENABLED_VALUES = new Set(["1", "true", "yes", "on"]);

export function isSiteInfoSyncEnabled(env: Env): boolean {
  const raw = env.FASTFIELD_SITE_INFO_SYNC_ENABLED?.trim().toLowerCase() ?? "";
  return ENABLED_VALUES.has(raw);
}

export function loadSiteInfoSyncConfig(env: Env = process.env): SiteInfoSyncConfig {
  const enabled = isSiteInfoSyncEnabled(env);
  const tableName =
    env.FASTFIELD_SITE_INFO_TABLE_NAME?.trim() || SITE_INFO_TABLE_NAME;
  const keyColumn =
    env.FASTFIELD_SITE_INFO_KEY_COLUMN?.trim() || SITE_INFO_KEY_COLUMN.trim();

  const parsedMap = parseFieldMap(env.FASTFIELD_SITE_INFO_FIELD_MAP);
  const fieldMap = parsedMap.provided
    ? parsedMap.map
    : { ...SITE_INFO_FIELD_MAP };

  if (!enabled) {
    return {
      ready: false,
      enabled: false,
      tableName,
      keyColumn,
      fieldMap,
      reason:
        "FASTFIELD_SITE_INFO_SYNC_ENABLED is not true. Site info sync is off and submission ingest is unchanged.",
    };
  }

  const problems: string[] = [];
  if (parsedMap.error) problems.push(parsedMap.error);
  if (!keyColumn) {
    problems.push(
      "site key column is empty. Set FASTFIELD_SITE_INFO_KEY_COLUMN or SITE_INFO_KEY_COLUMN in apps/boilerops/src/lib/fastfield/site-info-sync-config.ts to the exact site-info column display name.",
    );
  }
  if (!parsedMap.error && Object.keys(fieldMap).length === 0) {
    problems.push(
      "field map is empty. Set FASTFIELD_SITE_INFO_FIELD_MAP to a JSON object of site-info column display names to submission field keys, or fill SITE_INFO_FIELD_MAP in apps/boilerops/src/lib/fastfield/site-info-sync-config.ts.",
    );
  }

  if (problems.length > 0) {
    return {
      ready: false,
      enabled: true,
      tableName,
      keyColumn,
      fieldMap,
      reason: `Site info sync is not configured, so this is a no-op. ${problems.join(" ")} See docs/fastfield-site-info-sync.md.`,
    };
  }

  return {
    ready: true,
    enabled: true,
    tableName,
    keyColumn,
    fieldMap,
    reason: "",
  };
}

function parseFieldMap(raw: string | undefined): {
  provided: boolean;
  map: Record<string, string>;
  error?: string;
} {
  const trimmed = raw?.trim() ?? "";
  if (!trimmed) return { provided: false, map: {} };
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return {
      provided: true,
      map: {},
      error: "FASTFIELD_SITE_INFO_FIELD_MAP is not valid JSON.",
    };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      provided: true,
      map: {},
      error: "FASTFIELD_SITE_INFO_FIELD_MAP must be a JSON object.",
    };
  }
  const map: Record<string, string> = {};
  for (const [column, fieldKey] of Object.entries(parsed)) {
    if (typeof fieldKey !== "string" || !fieldKey.trim() || !column.trim()) {
      return {
        provided: true,
        map: {},
        error:
          "FASTFIELD_SITE_INFO_FIELD_MAP values must be non-empty submission field keys, and keys must be non-empty column display names.",
      };
    }
    map[column] = fieldKey.trim();
  }
  return { provided: true, map };
}
