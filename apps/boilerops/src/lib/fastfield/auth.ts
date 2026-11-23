/**
 * Shared FastField credential reading.
 *
 * DataTables API v3 (and the rest of `/services/v3`) does not read
 * `Ocp-Apim-Subscription-Key`. Public clients authenticate with
 * `POST /services/v3/authenticate` (`FastField-API-Key` plus HTTP Basic
 * of the portal email and password) and then send `FastField-API-Key` and
 * `X-Gatekeeper-SessionToken` on each call. `sessionToken` is cached in
 * this process.
 *
 * The legacy `sync_url` projector still posts with configurable header
 * names (defaults `x-api-key` and `x-session-token`). It reads the same
 * `FASTFIELD_API_KEY` and `FASTFIELD_SESSION_TOKEN` variables, but it does
 * not call `/authenticate`.
 *
 * `FASTFIELD_SUBSCRIPTION_KEY`, `FASTFIELD_USER_TOKEN`, and
 * `FASTFIELD_GATEKEEPER_SESSION_TOKEN` are ignored.
 */

export const DEFAULT_DATATABLES_BASE_URL =
  "https://api.fastfieldforms.com/services/v3";

export const FASTFIELD_API_KEY_HEADER = "FastField-API-Key";
export const FASTFIELD_SESSION_HEADER = "X-Gatekeeper-SessionToken";
export const FASTFIELD_REQUEST_TIMEOUT_MS = 15_000;

/** Refresh this long before a parsed session expiry. */
const SESSION_EXPIRY_SKEW_MS = 60_000;

/** Live sessions last 24 hours when the response omits a usable expiry. */
const SESSION_LIFETIME_MS = 24 * 60 * 60 * 1000;

const SESSION_EXPIRY_KEYS = [
  "sessionExpiration",
  "sessionExpires",
  "expiration",
  "expires",
];

export type FastFieldEnv = Record<string, string | undefined>;

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

type CachedSession = {
  token: string;
  /** Epoch milliseconds. Null when the source did not give an expiry. */
  expiresAt: number | null;
};

type Credentials = {
  apiKey: string;
  username: string;
  password: string;
  sessionToken: string;
};

export type FastFieldAuth = {
  dataHeaders(json: boolean): Promise<Record<string, string>>;
  canReauthenticate(): boolean;
  /**
   * Drop `rejectedToken` when it is still the cached session, then mint a
   * new one. A no-op when another caller already replaced it.
   */
  reauthenticate(rejectedToken: string): Promise<void>;
  /** Drop a session that a DataTables call has already rejected. */
  noteRejected(rejectedToken: string): void;
};

export function createFastFieldAuth(options: {
  env: FastFieldEnv;
  fetchImpl: typeof fetch;
  now?: () => number;
}): FastFieldAuth {
  const env = options.env;
  const fetchImpl = options.fetchImpl;
  const now = options.now ?? Date.now;
  let cached: CachedSession | null = null;
  let staticRejected = false;
  let pending: Promise<string> | null = null;

  function read(): Credentials {
    return {
      apiKey: env.FASTFIELD_API_KEY?.trim() ?? "",
      username: env.FASTFIELD_USERNAME?.trim() ?? "",
      password: env.FASTFIELD_PASSWORD?.trim() ?? "",
      sessionToken: env.FASTFIELD_SESSION_TOKEN?.trim() ?? "",
    };
  }

  function canReauthenticate(): boolean {
    const { username, password } = read();
    return username.length > 0 && password.length > 0;
  }

  function assertReady(): void {
    const { apiKey, username, password, sessionToken } = read();
    const hasUsername = username.length > 0;
    const hasPassword = password.length > 0;
    if (hasUsername !== hasPassword) {
      throw new FastFieldDataTableError(
        hasUsername
          ? "FASTFIELD_PASSWORD is required when FASTFIELD_USERNAME is set."
          : "FASTFIELD_USERNAME is required when FASTFIELD_PASSWORD is set.",
        null,
        "auth",
      );
    }
    if (!apiKey) {
      throw new FastFieldDataTableError(
        hasUsername
          ? "Missing FASTFIELD_API_KEY."
          : "Missing FASTFIELD_API_KEY. Set FASTFIELD_USERNAME and FASTFIELD_PASSWORD to create a session, or set FASTFIELD_SESSION_TOKEN.",
        null,
        "auth",
      );
    }
    if (!sessionToken && !hasUsername) {
      throw new FastFieldDataTableError(
        "Missing FastField session credentials. Set FASTFIELD_USERNAME and FASTFIELD_PASSWORD, or set FASTFIELD_SESSION_TOKEN.",
        null,
        "auth",
      );
    }
  }

  function isExpired(session: CachedSession): boolean {
    if (session.expiresAt == null) return false;
    return session.expiresAt <= now() + SESSION_EXPIRY_SKEW_MS;
  }

  function rejectToken(rejectedToken: string): void {
    if (!rejectedToken) return;
    if (read().sessionToken === rejectedToken) staticRejected = true;
    if (cached?.token === rejectedToken) cached = null;
  }

  async function authenticate(): Promise<string> {
    if (pending) return pending;
    const run = mintSession();
    pending = run;
    try {
      return await run;
    } finally {
      if (pending === run) pending = null;
    }
  }

  async function mintSession(): Promise<string> {
    assertReady();
    const { apiKey, username, password } = read();
    if (!username || !password) {
      throw new FastFieldDataTableError(
        "The FastField session is no longer valid, and FASTFIELD_USERNAME and FASTFIELD_PASSWORD are not set.",
        null,
        "auth",
      );
    }

    let response: Response;
    try {
        response = await fetchImpl(serviceUrl(env, "/authenticate"), {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          [FASTFIELD_API_KEY_HEADER]: apiKey,
          Authorization: basicAuthorization(username, password),
        },
        body: "{}",
        signal: AbortSignal.timeout(FASTFIELD_REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "request failed";
      throw new FastFieldDataTableError(
        `POST /authenticate request failed: ${message}`,
        null,
        "auth",
      );
    }

    const body = await readJsonBody(response);
    if (response.status < 200 || response.status >= 300) {
      throw new FastFieldDataTableError(
        `POST /authenticate failed with HTTP ${response.status}.`,
        response.status,
        "auth",
      );
    }

    const token = sessionTokenFrom(body);
    if (!token) {
      throw new FastFieldDataTableError(
        "POST /authenticate returned no sessionToken.",
        response.status,
        "auth",
      );
    }

    logExpiryShape(body);
    cached = { token, expiresAt: expiryFrom(body, now) };
    return token;
  }

  async function getSession(): Promise<string> {
    assertReady();
    if (cached && !isExpired(cached)) return cached.token;

    const expiredCache = cached != null && isExpired(cached);
    if (expiredCache) cached = null;

    const { sessionToken } = read();
    if (!expiredCache && !staticRejected && sessionToken) {
      cached = { token: sessionToken, expiresAt: null };
      return sessionToken;
    }

    return authenticate();
  }

  return {
    canReauthenticate,
    noteRejected: rejectToken,
    async reauthenticate(rejectedToken: string) {
      if (!canReauthenticate()) return;
      if (cached && cached.token !== rejectedToken && !isExpired(cached)) {
        return;
      }
      rejectToken(rejectedToken);
      cached = null;
      await authenticate();
    },
    async dataHeaders(json: boolean) {
      const token = await getSession();
      const headers: Record<string, string> = {
        Accept: "application/json",
        [FASTFIELD_API_KEY_HEADER]: read().apiKey,
        [FASTFIELD_SESSION_HEADER]: token,
      };
      if (json) headers["Content-Type"] = "application/json";
      return headers;
    },
  };
}

/**
 * Headers for the legacy site-row projector (`fastfield_data_tables.sync_url`).
 * Header names stay configurable because that URL is account-specific and is
 * not the DataTables v3 API. Values still come from `FASTFIELD_API_KEY` and
 * `FASTFIELD_SESSION_TOKEN`.
 */
export function legacyProjectorHeaders(env: FastFieldEnv = process.env): Headers {
  const headers = new Headers({ "content-type": "application/json" });
  const apiKey = env.FASTFIELD_API_KEY?.trim();
  const sessionToken = env.FASTFIELD_SESSION_TOKEN?.trim();
  if (apiKey) {
    headers.set(env.FASTFIELD_API_KEY_HEADER?.trim() || "x-api-key", apiKey);
  }
  if (sessionToken) {
    headers.set(
      env.FASTFIELD_SESSION_TOKEN_HEADER?.trim() || "x-session-token",
      sessionToken,
    );
  }
  return headers;
}

export function fastFieldServiceBaseUrl(env: FastFieldEnv): string {
  return (
    env.FASTFIELD_DATATABLES_BASE_URL?.trim() || DEFAULT_DATATABLES_BASE_URL
  ).replace(/\/$/, "");
}

export function serviceUrl(env: FastFieldEnv, path: string): string {
  const base = fastFieldServiceBaseUrl(env);
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

function basicAuthorization(username: string, password: string): string {
  const encoded = Buffer.from(`${username}:${password}`, "utf8").toString(
    "base64",
  );
  return `Basic ${encoded}`;
}

async function readJsonBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function sessionTokenFrom(body: unknown): string | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const token = (body as Record<string, unknown>).sessionToken;
  if (typeof token !== "string") return null;
  const trimmed = token.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function expiryFrom(body: unknown, now: () => number): number {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    const record = body as Record<string, unknown>;
    for (const key of SESSION_EXPIRY_KEYS) {
      const parsed = parseExpiry(record[key]);
      if (parsed != null) return parsed;
    }
  }
  return now() + SESSION_LIFETIME_MS;
}

/**
 * Shape only. The timestamp string and any numeric instant stay out of the log.
 */
function logExpiryShape(body: unknown): void {
  const value =
    body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>).sessionExpiration
      : undefined;
  console.info(
    `[fastfield auth] sessionExpiration shape=${expiryShape(value)}`,
  );
}

function expiryShape(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value < 1_000_000_000_000 ? "epoch-seconds" : "epoch-milliseconds";
  }
  if (typeof value !== "string") {
    return value == null ? "absent" : typeof value;
  }
  const trimmed = value.trim();
  if (!trimmed) return "empty-string";
  if (/^[0-9]+$/.test(trimmed)) {
    return trimmed.length >= 13
      ? "epoch-milliseconds-string"
      : "epoch-seconds-string";
  }
  if (!Number.isNaN(Date.parse(trimmed))) return "iso-8601";
  return `unparsed-string len=${trimmed.length}`;
}

function parseExpiry(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value < 1_000_000_000_000 ? value * 1000 : value;
  }
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const numeric = Number(trimmed);
  if (Number.isFinite(numeric) && /^[0-9]+$/.test(trimmed)) {
    return numeric < 1_000_000_000_000 ? numeric * 1000 : numeric;
  }
  const parsed = Date.parse(trimmed);
  return Number.isNaN(parsed) ? null : parsed;
}
