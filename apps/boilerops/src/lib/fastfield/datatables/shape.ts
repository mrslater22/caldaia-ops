/**
 * Defensive parsers for FastField DataTables responses.
 *
 * List, lookup, get-item, and get-items response schemas are not in the
 * API PDFs. These helpers accept the shapes suggested by create/update
 * examples (`dataTableId`, `name`, `id`, `data`) and a few likely wrappers.
 * The first success and first error body per operation are logged with
 * scalar values replaced by type tags so the real schema can be pinned
 * down without writing secrets or row values to the logs.
 */

export type ParsedTable = {
  id: string;
  name: string;
};

export type ParsedItem = {
  id: string;
  data: Record<string, unknown>;
  /** False when the payload had an id but no column bag. Do not PUT it. */
  complete: boolean;
};

export type LookupOutcome =
  | { kind: "hit"; item: ParsedItem }
  | { kind: "multiple"; count: number }
  | { kind: "miss" }
  | { kind: "unusable" }
  | { kind: "auth" }
  | { kind: "error" };

const loggedShapes = new Set<string>();

const ITEM_ID_KEYS = [
  "id",
  "itemId",
  "item_id",
  "recordId",
  "record_id",
  "dataTableItemId",
];

const META_KEYS = new Set([
  ...ITEM_ID_KEYS,
  "dataTableId",
  "data_table_id",
  "tableId",
  "table_id",
  "createdAt",
  "updatedAt",
  "created_at",
  "updated_at",
  "version",
  "etag",
  "message",
  "code",
  "errors",
  "status",
  "success",
  "fields",
  "columns",
  "data",
]);

const ITEM_WRAPPER_KEYS = [
  "items",
  "records",
  "results",
  "rows",
  "value",
  "data",
  "item",
  "record",
  "result",
];

export function resetResponseShapeLogsForTests(): void {
  loggedShapes.clear();
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

/** Structure only. Scalar values never appear in the result. */
export function redactStructure(value: unknown, depth = 0): unknown {
  if (depth > 6) return "<max-depth>";
  if (value === null) return null;
  if (Array.isArray(value)) {
    return {
      _arrayLength: value.length,
      _sample: value.length > 0 ? [redactStructure(value[0], depth + 1)] : [],
    };
  }
  const record = asRecord(value);
  if (record) {
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(record)) {
      out[key] = redactStructure(inner, depth + 1);
    }
    return out;
  }
  if (typeof value === "string") return `<string len=${value.length}>`;
  if (typeof value === "number") return "<number>";
  if (typeof value === "boolean") return "<boolean>";
  return `<${typeof value}>`;
}

export function logResponseShape(
  operation: string,
  status: number,
  body: unknown,
): void {
  const kind = status >= 200 && status < 300 ? "success" : "error";
  const key = `${operation}:${kind}`;
  if (loggedShapes.has(key)) return;
  loggedShapes.add(key);
  console.info(
    `[fastfield site-info sync] first ${operation} ${kind} response shape status=${status} body=${JSON.stringify(redactStructure(body))}`,
  );
}

export function parseTables(body: unknown): ParsedTable[] {
  const strong: ParsedTable[] = [];
  const weak: ParsedTable[] = [];
  for (const record of collectRecords(body, 0)) {
    const name = firstString(record, [
      "name",
      "tableName",
      "table_name",
      "displayName",
      "display_name",
    ]);
    if (!name) continue;
    const strongId = firstString(record, [
      "dataTableId",
      "data_table_id",
      "tableId",
      "table_id",
    ]);
    if (strongId) {
      strong.push({ id: strongId, name });
      continue;
    }
    const id = firstString(record, ["id"]);
    if (id) weak.push({ id, name });
  }
  return dedupeTables(strong.length > 0 ? strong : weak);
}

export function parseItems(body: unknown): ParsedItem[] {
  return dedupeItems(collectItems(body, 0));
}

export function interpretLookup(status: number, body: unknown): LookupOutcome {
  if (status === 401 || status === 403) return { kind: "auth" };
  if (status === 404 || status === 204) return { kind: "miss" };

  const items = parseItems(body);
  if (status >= 200 && status < 300) {
    if (items.length > 1) return { kind: "multiple", count: items.length };
    if (items.length === 1) return { kind: "hit", item: items[0] };
    if (isExplicitEmpty(body)) return { kind: "miss" };
    return { kind: "unusable" };
  }

  if (isNotFoundMessage(body)) return { kind: "miss" };
  if (status === 400 || status === 405 || status === 409 || status === 422) {
    return { kind: "unusable" };
  }
  return { kind: "error" };
}

function collectItems(body: unknown, depth: number): ParsedItem[] {
  if (depth > 5 || body == null) return [];
  if (Array.isArray(body)) {
    return body.flatMap((entry) => {
      const direct = tryParseItem(entry);
      if (direct) return [direct];
      return collectItems(entry, depth + 1);
    });
  }
  const direct = tryParseItem(body);
  if (direct) return [direct];
  const record = asRecord(body);
  if (!record) return [];
  for (const key of ITEM_WRAPPER_KEYS) {
    if (!(key in record)) continue;
    const nested = collectItems(record[key], depth + 1);
    if (nested.length > 0) return nested;
  }
  return [];
}

function tryParseItem(value: unknown): ParsedItem | null {
  const record = asRecord(value);
  if (!record) return null;
  const id = firstString(record, ITEM_ID_KEYS);
  if (!id) return null;

  if ("data" in record) {
    const data = asRecord(record.data);
    if (data) return { id, data, complete: true };
  }

  const fromFields = fieldsArrayToRecord(record.fields ?? record.columns);
  if (fromFields) return { id, data: fromFields, complete: true };

  const data: Record<string, unknown> = {};
  let columns = 0;
  for (const [key, cell] of Object.entries(record)) {
    if (META_KEYS.has(key)) continue;
    data[key] = cell;
    columns += 1;
  }
  if (columns === 0) return { id, data: {}, complete: false };
  return { id, data, complete: true };
}

function fieldsArrayToRecord(value: unknown): Record<string, unknown> | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const data: Record<string, unknown> = {};
  for (const entry of value) {
    const record = asRecord(entry);
    if (!record) return null;
    const name = firstString(record, [
      "displayName",
      "display_name",
      "name",
      "columnName",
      "column",
    ]);
    if (!name) return null;
    if ("value" in record) data[name] = record.value;
    else if ("data" in record) data[name] = record.data;
    else return null;
  }
  return data;
}

function collectRecords(body: unknown, depth: number): Record<string, unknown>[] {
  if (depth > 5 || body == null) return [];
  if (Array.isArray(body)) {
    return body.flatMap((entry) => collectRecords(entry, depth + 1));
  }
  const record = asRecord(body);
  if (!record) return [];
  const nestedKeys = [
    "datatables",
    "dataTables",
    "tables",
    "items",
    "data",
    "value",
    "results",
    "records",
  ];
  const nested = nestedKeys.flatMap((key) =>
    key in record ? collectRecords(record[key], depth + 1) : [],
  );
  const named = ["name", "tableName", "table_name", "displayName"].some(
    (key) => key in record,
  );
  return named ? [record, ...nested] : nested;
}

function isExplicitEmpty(body: unknown): boolean {
  if (body == null) return true;
  if (Array.isArray(body)) return body.length === 0;
  const record = asRecord(body);
  if (!record) return false;
  const keys = Object.keys(record);
  if (keys.length === 0) return true;
  const ignored = new Set([
    ...ITEM_WRAPPER_KEYS,
    "message",
    "code",
    "errors",
    "status",
    "success",
  ]);
  let sawCollection = false;
  for (const key of ITEM_WRAPPER_KEYS) {
    if (!(key in record)) continue;
    sawCollection = true;
    const value = record[key];
    if (value == null) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    const inner = asRecord(value);
    if (inner && Object.keys(inner).length === 0) continue;
    return false;
  }
  if (!sawCollection) return isNotFoundMessage(body);
  return keys.every((key) => ignored.has(key));
}

function isNotFoundMessage(body: unknown): boolean {
  const record = asRecord(body);
  const message = record && typeof record.message === "string" ? record.message : "";
  return /not found|no match|no item|does not exist|no row/i.test(message);
}

function firstString(
  record: Record<string, unknown>,
  keys: string[],
): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

function dedupeTables(tables: ParsedTable[]): ParsedTable[] {
  const seen = new Set<string>();
  const out: ParsedTable[] = [];
  for (const table of tables) {
    const key = `${table.id}\u0000${table.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(table);
  }
  return out;
}

function dedupeItems(items: ParsedItem[]): ParsedItem[] {
  const seen = new Set<string>();
  const out: ParsedItem[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}
