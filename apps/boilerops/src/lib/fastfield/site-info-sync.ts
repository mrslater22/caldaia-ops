import {
  createDataTableClient,
  FastFieldDataTableError,
  type DataTableClient,
} from "./datatables/client.ts";
import type { ParsedItem } from "./datatables/shape.ts";
import {
  loadSiteInfoSyncConfig,
  type SiteInfoSyncConfig,
} from "./site-info-sync-config.ts";

/**
 * Upsert one "site info" Data Table row from a FastField submission.
 *
 * Recipe (DataTables API v3): resolve tableId from GET /datatables/list
 * (cached), POST /items/lookup by the configured key column, and on a hit
 * PUT the full merged row. A lookup miss inserts with POST. Lookup responses
 * that are not a clear hit or miss fall back to paged GET /items because
 * lookup requires the column to be a configured lookup key, and the
 * no-match response is not documented. Omitted columns are nulled by
 * FastField, so PUT always sends every column from the row that was read.
 *
 * Failures are returned, not thrown, so submission ingest can continue.
 */

/** Documented query name. Default and maximum are not in the API PDFs. */
export const SITE_INFO_PAGE_SIZE = 100;

/** Stop paging rather than insert when the search cannot be finished. */
export const SITE_INFO_MAX_PAGES = 50;

export type SiteInfoSyncResult = {
  status: "skipped" | "updated" | "created" | "failed";
  reason: string;
  tableId?: string;
  itemId?: string;
};

type Env = Record<string, string | undefined>;

const skipLogs = new Set<string>();
const inflight = new Map<string, Promise<SiteInfoSyncResult>>();
let defaultClient: DataTableClient | null = null;
let loggedPageZero = false;

export function resetSiteInfoSyncStateForTests(): void {
  skipLogs.clear();
  inflight.clear();
  defaultClient = null;
  loggedPageZero = false;
}

export async function syncSiteInfoFromSubmission(
  payload: Record<string, unknown>,
  deps?: { client?: DataTableClient; env?: Env },
): Promise<SiteInfoSyncResult> {
  const env = deps?.env ?? process.env;
  const config = loadSiteInfoSyncConfig(env);
  if (!config.ready) {
    logSkipOnce(config);
    return { status: "skipped", reason: config.reason };
  }

  const submissionId = submissionIdForLog(payload);
  const extracted = extractMappedSubmission(payload, config);
  if (!extracted.ok) {
    console.info(
      `[fastfield site-info sync] no-op: ${extracted.reason} submissionId=${submissionId}`,
    );
    return { status: "skipped", reason: extracted.reason };
  }

  const lockKey = `${config.tableName}\u0000${config.keyColumn}\u0000${JSON.stringify(extracted.keyValue)}`;
  const previous = inflight.get(lockKey) ?? Promise.resolve();
  const run = previous
    .catch(() => undefined)
    .then(() =>
      performSync(config, extracted.updates, extracted.keyValue, submissionId, deps),
    );
  inflight.set(lockKey, run);
  void run.finally(() => {
    if (inflight.get(lockKey) === run) inflight.delete(lockKey);
  });
  return run;
}

async function performSync(
  config: SiteInfoSyncConfig,
  updates: Record<string, unknown>,
  keyValue: unknown,
  submissionId: string,
  deps?: { client?: DataTableClient; env?: Env },
): Promise<SiteInfoSyncResult> {
  try {
    const client = clientFor(deps);
    const resolved = await client.resolveTableId(config.tableName);
    if (!resolved.ok) {
      console.error(`[fastfield site-info sync] ${resolved.reason}`);
      return { status: "failed", reason: resolved.reason };
    }

    const found = await findExistingRow(
      client,
      resolved.tableId,
      config.keyColumn,
      keyValue,
    );
    if (found.kind === "failed") {
      console.error(
        `[fastfield site-info sync] ${found.reason} submissionId=${submissionId}`,
      );
      return {
        status: "failed",
        reason: found.reason,
        tableId: resolved.tableId,
      };
    }

    if (found.kind === "found") {
      const data = mergeRow(found.item.data, updates);
      const updated = await client.updateItem(
        resolved.tableId,
        found.item.id,
        data,
      );
      if (updated.status < 200 || updated.status >= 300) {
        const reason = `PUT /datatables/{tableId}/items failed with HTTP ${updated.status}. The existing row was not replaced.`;
        console.error(
          `[fastfield site-info sync] ${reason} submissionId=${submissionId}`,
        );
        return {
          status: "failed",
          reason,
          tableId: resolved.tableId,
          itemId: found.item.id,
        };
      }
      console.info(
        `[fastfield site-info sync] updated tableId=${resolved.tableId} itemId=${found.item.id} submissionId=${submissionId}`,
      );
      return {
        status: "updated",
        reason: "Merged submission values onto the existing site info row.",
        tableId: resolved.tableId,
        itemId: found.item.id,
      };
    }

    const created = await client.createItem(resolved.tableId, updates);
    if (created.status < 200 || created.status >= 300) {
      const reason = `POST /datatables/{tableId}/items failed with HTTP ${created.status}. No row was written.`;
      console.error(
        `[fastfield site-info sync] ${reason} submissionId=${submissionId}`,
      );
      return {
        status: "failed",
        reason,
        tableId: resolved.tableId,
      };
    }
    console.info(
      `[fastfield site-info sync] created tableId=${resolved.tableId} submissionId=${submissionId}`,
    );
    return {
      status: "created",
      reason: "Inserted a site info row from the submission.",
      tableId: resolved.tableId,
    };
  } catch (error) {
    const reason =
      error instanceof FastFieldDataTableError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Site info sync failed.";
    console.error(
      `[fastfield site-info sync] failed: ${reason} submissionId=${submissionId}`,
    );
    return { status: "failed", reason };
  }
}

type FoundRow =
  | { kind: "found"; item: ParsedItem }
  | { kind: "missing" }
  | { kind: "failed"; reason: string };

async function findExistingRow(
  client: DataTableClient,
  tableId: string,
  keyColumn: string,
  keyValue: unknown,
): Promise<FoundRow> {
  const lookup = await client.lookupItem(tableId, keyColumn, keyValue);
  if (lookup.parsed.kind === "auth") {
    return {
      kind: "failed",
      reason: `Lookup was not authorized (HTTP ${lookup.status}). No row was written.`,
    };
  }
  if (lookup.parsed.kind === "multiple") {
    return {
      kind: "failed",
      reason: `Lookup returned ${lookup.parsed.count} rows for the site key. No row was written.`,
    };
  }
  if (lookup.parsed.kind === "hit") {
    const full = await fullRow(client, tableId, lookup.parsed.item);
    if (full) return { kind: "found", item: full };
    return {
      kind: "failed",
      reason: `Lookup found item ${lookup.parsed.item.id} but not a full column set. Refusing to PUT a partial row or insert a duplicate.`,
    };
  }
  if (lookup.parsed.kind === "miss") return { kind: "missing" };

  console.info(
    `[fastfield site-info sync] lookup was not usable (HTTP ${lookup.status}, ${lookup.parsed.kind}); paging GET /items for the site key.`,
  );
  return pageForKey(client, tableId, keyColumn, keyValue);
}

async function fullRow(
  client: DataTableClient,
  tableId: string,
  item: ParsedItem,
): Promise<ParsedItem | null> {
  if (item.complete) return item;
  const loaded = await client.getItem(tableId, item.id);
  if (
    loaded.status >= 200 &&
    loaded.status < 300 &&
    loaded.parsed?.complete
  ) {
    return loaded.parsed;
  }
  return null;
}

/**
 * Page size, the first page number, and the end-of-pages signal are not
 * documented. Page 1 is requested first. Page 0 is probed once because the
 * start index is unknown; a non-2xx on that probe is treated as "this index
 * is not supported" and does not by itself fail the sync. A later page error,
 * a repeated page, or a short page ends the scan. Hitting the page cap fails
 * closed so we do not insert a row we might have missed.
 */
async function pageForKey(
  client: DataTableClient,
  tableId: string,
  keyColumn: string,
  keyValue: unknown,
): Promise<FoundRow> {
  const seenIds = new Set<string>();
  const seenSignatures = new Set<string>();
  const matches: ParsedItem[] = [];
  let incomplete = false;

  const readPage = async (
    pageNumber: number,
    probe: boolean,
  ): Promise<"next" | "done" | "failed"> => {
    const page = await client.listItems(
      tableId,
      SITE_INFO_PAGE_SIZE,
      pageNumber,
    );
    if (page.status < 200 || page.status >= 300) {
      if (probe) {
        if (!loggedPageZero) {
          loggedPageZero = true;
          console.info(
            `[fastfield site-info sync] pageNumber=0 returned HTTP ${page.status}. The items start index is undocumented; continuing from pageNumber=1.`,
          );
        }
        return "done";
      }
      return "failed";
    }
    if (page.parsed.length === 0) return "done";

    const signature = page.parsed
      .map((item) => item.id || JSON.stringify(item.data))
      .join("|");
    if (seenSignatures.has(signature)) return "done";
    seenSignatures.add(signature);

    for (const item of page.parsed) {
      if (item.id && seenIds.has(item.id)) continue;
      if (item.id) seenIds.add(item.id);
      if (!cellMatches(item.data[keyColumn], keyValue)) continue;
      const full = await fullRow(client, tableId, item);
      if (!full) {
        incomplete = true;
        return "failed";
      }
      matches.push(full);
    }

    if (matches.length > 1) return "done";
    if (page.parsed.length < SITE_INFO_PAGE_SIZE) return "done";
    return "next";
  };

  const finished = (): FoundRow => {
    if (incomplete) {
      return {
        kind: "failed",
        reason:
          "Found a site key row but not its full column set. Refusing to PUT a partial row or insert a duplicate.",
      };
    }
    if (matches.length > 1) {
      return {
        kind: "failed",
        reason: `Paging found ${matches.length} rows for the site key. No row was written.`,
      };
    }
    if (matches.length === 1) return { kind: "found", item: matches[0] };
    return { kind: "missing" };
  };

  const first = await readPage(1, false);
  if (first === "failed") {
    return incomplete
      ? finished()
      : {
          kind: "failed",
          reason:
            "GET /datatables/{tableId}/items failed while searching for the site key. No row was written.",
        };
  }
  if (matches.length > 1) return finished();

  await readPage(0, true);
  if (incomplete || matches.length > 1) return finished();

  if (first === "next") {
    for (let pageNumber = 2; pageNumber <= SITE_INFO_MAX_PAGES; pageNumber += 1) {
      const step = await readPage(pageNumber, false);
      if (step === "failed") {
        return incomplete
          ? finished()
          : {
              kind: "failed",
              reason:
                "GET /datatables/{tableId}/items failed while searching for the site key. No row was written.",
            };
      }
      if (matches.length > 1 || step === "done") return finished();
    }
    if (matches.length === 1) {
      return {
        kind: "failed",
        reason: `Found one site key row but stopped after ${SITE_INFO_MAX_PAGES} full pages before confirming it is the only match. No row was written.`,
      };
    }
    return {
      kind: "failed",
      reason: `Stopped after ${SITE_INFO_MAX_PAGES} item pages without confirming the site key is absent. No row was written.`,
    };
  }

  return finished();
}

function clientFor(deps?: {
  client?: DataTableClient;
  env?: Env;
}): DataTableClient {
  if (deps?.client) return deps.client;
  if (deps?.env) return createDataTableClient({ env: deps.env });
  defaultClient ??= createDataTableClient();
  return defaultClient;
}

function mergeRow(
  existing: Record<string, unknown>,
  updates: Record<string, unknown>,
): Record<string, unknown> {
  return { ...existing, ...updates };
}

function cellMatches(cell: unknown, expected: unknown): boolean {
  if (Object.is(cell, expected)) return true;
  if (cell == null || expected == null) return false;
  if (
    (typeof cell === "string" || typeof cell === "number" || typeof cell === "boolean") &&
    (typeof expected === "string" ||
      typeof expected === "number" ||
      typeof expected === "boolean")
  ) {
    return String(cell).trim() === String(expected).trim();
  }
  return false;
}

function extractMappedSubmission(
  payload: Record<string, unknown>,
  config: SiteInfoSyncConfig,
):
  | { ok: true; keyValue: unknown; updates: Record<string, unknown> }
  | { ok: false; reason: string } {
  const keyField = config.fieldMap[config.keyColumn] ?? config.keyColumn;
  const keyRead = readField(payload, keyField);
  if (!keyRead.present) {
    return {
      ok: false,
      reason: `Submission has no value for site key field "${keyField}" (site info column "${config.keyColumn}").`,
    };
  }

  const updates: Record<string, unknown> = {
    [config.keyColumn]: keyRead.value,
  };
  for (const [column, fieldKey] of Object.entries(config.fieldMap)) {
    const read = readField(payload, fieldKey);
    if (!read.present) continue;
    updates[column] = read.value;
  }
  return { ok: true, keyValue: keyRead.value, updates };
}

/**
 * Reads one top-level submission field. Single-element arrays are unwrapped
 * because existing FastField mappers see scalars delivered that way. Blank
 * strings are treated as absent so a PUT does not clear a column with "".
 */
function readField(
  payload: Record<string, unknown>,
  fieldKey: string,
): { present: true; value: unknown } | { present: false } {
  if (!Object.prototype.hasOwnProperty.call(payload, fieldKey)) {
    return { present: false };
  }
  return normalizeCell(payload[fieldKey]);
}

function normalizeCell(
  raw: unknown,
): { present: true; value: unknown } | { present: false } {
  if (raw == null) return { present: false };
  if (Array.isArray(raw)) {
    if (raw.length === 0) return { present: false };
    if (raw.length === 1) return normalizeCell(raw[0]);
    return { present: true, value: raw };
  }
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return { present: false };
    return { present: true, value: trimmed };
  }
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) return { present: false };
    return { present: true, value: raw };
  }
  if (typeof raw === "boolean") return { present: true, value: raw };
  if (typeof raw === "object") return { present: true, value: raw };
  return { present: false };
}

function submissionIdForLog(payload: Record<string, unknown>): string {
  for (const key of ["submissionId", "submission_id", "documentId", "document_id"]) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "unknown";
}

function logSkipOnce(config: SiteInfoSyncConfig): void {
  if (skipLogs.has(config.reason)) return;
  skipLogs.add(config.reason);
  const line = `[fastfield site-info sync] no-op: ${config.reason}`;
  if (config.enabled) console.warn(line);
  else console.info(line);
}
