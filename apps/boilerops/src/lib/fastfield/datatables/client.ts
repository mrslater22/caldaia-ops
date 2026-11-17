import {
  interpretLookup,
  logResponseShape,
  parseItems,
  parseTables,
  type LookupOutcome,
  type ParsedItem,
} from "./shape.ts";

export const DEFAULT_DATATABLES_BASE_URL =
  "https://api.fastfieldforms.com/services/v3";

const REQUEST_TIMEOUT_MS = 15_000;

export class FastFieldDataTableError extends Error {
  readonly status: number | null;
  readonly operation: string;

  constructor(message: string, status: number | null, operation: string) {
    super(message);
    this.name = "FastFieldDataTableError";
    this.status = status;
    this.operation = operation;
  }
}

type Env = Record<string, string | undefined>;

export type DataTableResponse<T> = {
  status: number;
  body: unknown;
  parsed: T;
};

export type DataTableClient = {
  resolveTableId(
    tableName: string,
  ): Promise<{ ok: true; tableId: string } | { ok: false; reason: string }>;
  lookupItem(
    tableId: string,
    keyColumn: string,
    keyValue: unknown,
  ): Promise<DataTableResponse<LookupOutcome>>;
  listItems(
    tableId: string,
    pageSize: number,
    pageNumber: number,
  ): Promise<DataTableResponse<ParsedItem[]>>;
  getItem(
    tableId: string,
    itemId: string,
  ): Promise<DataTableResponse<ParsedItem | null>>;
  updateItem(
    tableId: string,
    id: string,
    data: Record<string, unknown>,
  ): Promise<DataTableResponse<null>>;
  createItem(
    tableId: string,
    data: Record<string, unknown>,
  ): Promise<DataTableResponse<null>>;
};

export function createDataTableClient(options?: {
  fetchImpl?: typeof fetch;
  env?: Env;
}): DataTableClient {
  const fetchImpl = options?.fetchImpl ?? fetch;
  const env = options?.env ?? process.env;
  const tableIds = new Map<string, string>();

  async function request(
    operation: string,
    path: string,
    init: { method: string; json?: unknown },
  ): Promise<{ status: number; body: unknown }> {
    const headers = authHeaders(env, init.json !== undefined);
    let response: Response;
    try {
      response = await fetchImpl(joinUrl(baseUrl(env), path), {
        method: init.method,
        headers,
        body: init.json !== undefined ? JSON.stringify(init.json) : undefined,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "request failed";
      throw new FastFieldDataTableError(
        `${operation} request failed: ${message}`,
        null,
        operation,
      );
    }

    const text = await response.text();
    let body: unknown = null;
    if (text) {
      try {
        body = JSON.parse(text) as unknown;
      } catch {
        body = { nonJsonBody: true, length: text.length };
      }
    }
    logResponseShape(operation, response.status, body);
    return { status: response.status, body };
  }

  return {
    async resolveTableId(tableName) {
      const cached = tableIds.get(tableName);
      if (cached) return { ok: true, tableId: cached };

      const listed = await request("list", "/datatables/list", { method: "GET" });
      if (listed.status < 200 || listed.status >= 300) {
        return {
          ok: false,
          reason: `GET /datatables/list failed with HTTP ${listed.status}. No row was written.`,
        };
      }

      const tables = parseTables(listed.body);
      const matches = tables.filter((table) => table.name === tableName);
      if (matches.length === 1) {
        tableIds.set(tableName, matches[0].id);
        return { ok: true, tableId: matches[0].id };
      }
      if (matches.length > 1) {
        return {
          ok: false,
          reason: `GET /datatables/list returned ${matches.length} tables named ${JSON.stringify(tableName)}. No row was written.`,
        };
      }
      const names = [...new Set(tables.map((table) => table.name))].slice(0, 30);
      return {
        ok: false,
        reason: `No Data Table named ${JSON.stringify(tableName)}. Names parsed from GET /datatables/list: ${names.length > 0 ? names.join(", ") : "(none)"}. No row was written.`,
      };
    },

    async lookupItem(tableId, keyColumn, keyValue) {
      const response = await request(
        "lookup",
        `/datatables/${encodeURIComponent(tableId)}/items/lookup`,
        {
          method: "POST",
          json: { data: { [keyColumn]: keyValue } },
        },
      );
      return {
        ...response,
        parsed: interpretLookup(response.status, response.body),
      };
    },

    async listItems(tableId, pageSize, pageNumber) {
      const params = new URLSearchParams({
        pageSize: String(pageSize),
        pageNumber: String(pageNumber),
      });
      const response = await request(
        "items",
        `/datatables/${encodeURIComponent(tableId)}/items?${params.toString()}`,
        { method: "GET" },
      );
      return { ...response, parsed: parseItems(response.body) };
    },

    async getItem(tableId, itemId) {
      const response = await request(
        "item",
        `/datatables/${encodeURIComponent(tableId)}/items/${encodeURIComponent(itemId)}`,
        { method: "GET" },
      );
      const items = parseItems(response.body);
      return { ...response, parsed: items[0] ?? null };
    },

    async updateItem(tableId, id, data) {
      const response = await request(
        "update",
        `/datatables/${encodeURIComponent(tableId)}/items`,
        {
          method: "PUT",
          json: { id, data },
        },
      );
      return { ...response, parsed: null };
    },

    async createItem(tableId, data) {
      const response = await request(
        "create",
        `/datatables/${encodeURIComponent(tableId)}/items`,
        {
          method: "POST",
          json: { data },
        },
      );
      return { ...response, parsed: null };
    },
  };
}

export function authHeaders(env: Env, json: boolean): Record<string, string> {
  const subscriptionKey = env.FASTFIELD_SUBSCRIPTION_KEY?.trim() ?? "";
  const userToken = env.FASTFIELD_USER_TOKEN?.trim() ?? "";
  if (!subscriptionKey || !userToken) {
    throw new FastFieldDataTableError(
      "Missing FASTFIELD_SUBSCRIPTION_KEY or FASTFIELD_USER_TOKEN.",
      null,
      "auth",
    );
  }

  const headers: Record<string, string> = {
    Accept: "application/json",
    "Ocp-Apim-Subscription-Key": subscriptionKey,
    Authorization: `Bearer ${userToken}`,
  };
  const gatekeeper = gatekeeperToken(env, userToken);
  if (gatekeeper) headers["X-Gatekeeper-SessionToken"] = gatekeeper;
  if (json) headers["Content-Type"] = "application/json";
  return headers;
}

/**
 * `X-Gatekeeper-SessionToken` is the only header named on the DataTables
 * PDFs. Whether it is the same value as the Bearer user token is unknown.
 * Unset: do not send the header. `bearer` or `user-token`: send
 * FASTFIELD_USER_TOKEN. Any other value is sent as the header itself.
 */
function gatekeeperToken(env: Env, userToken: string): string | null {
  const raw = env.FASTFIELD_GATEKEEPER_SESSION_TOKEN?.trim() ?? "";
  if (!raw) return null;
  if (raw === "bearer" || raw === "user-token") return userToken;
  return raw;
}

function baseUrl(env: Env): string {
  return (
    env.FASTFIELD_DATATABLES_BASE_URL?.trim() || DEFAULT_DATATABLES_BASE_URL
  ).replace(/\/$/, "");
}

function joinUrl(base: string, path: string): string {
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}
