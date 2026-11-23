import assert from "node:assert/strict";
import { describe, mock, test } from "node:test";
import { legacyProjectorHeaders } from "./auth.ts";
import { createDataTableClient } from "./datatables/client.ts";

const API_KEY = "APIKEY_SHOULD_NOT_BE_LOGGED";
const SESSION_TOKEN = "SESSION_SHOULD_NOT_BE_LOGGED";
const USERNAME = "tech@example.com";
const PASSWORD = "PASSWORD_SHOULD_NOT_BE_LOGGED";
const BASE = "https://api.fastfieldforms.com/services/v3";

type Env = Record<string, string | undefined>;
type Call = {
  url: string;
  method: string;
  body: unknown;
  headers: Headers;
};

function basic(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`, "utf8").toString("base64")}`;
}

function loginEnv(extra: Env = {}): Env {
  return {
    FASTFIELD_API_KEY: API_KEY,
    FASTFIELD_USERNAME: USERNAME,
    FASTFIELD_PASSWORD: PASSWORD,
    FASTFIELD_DATATABLES_BASE_URL: BASE,
    ...extra,
  };
}

function installFetch(
  handler: (call: Call) => { status: number; body?: unknown } | Promise<{ status: number; body?: unknown }>,
) {
  const calls: Call[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const headers = new Headers(init?.headers);
    const rawBody = init?.body == null ? null : String(init.body);
    const call: Call = {
      url: String(input),
      method: init?.method ?? "GET",
      body: rawBody ? (JSON.parse(rawBody) as unknown) : null,
      headers,
    };
    calls.push(call);
    const result = await handler(call);
    if (result.body === undefined) return new Response(null, { status: result.status });
    return new Response(JSON.stringify(result.body), {
      status: result.status,
      headers: { "content-type": "application/json" },
    });
  };
  return { calls, fetchImpl };
}

function assertNoSubscriptionHeader(headers: Headers) {
  assert.equal(headers.get("ocp-apim-subscription-key"), null);
  for (const name of headers.keys()) {
    assert.equal(/subscription|ocp-apim/i.test(name), false);
  }
}

function assertDataHeaders(headers: Headers, session: string) {
  assert.equal(headers.get("fastfield-api-key"), API_KEY);
  assert.equal(headers.get("x-gatekeeper-sessiontoken"), session);
  assert.equal(headers.get("authorization"), null);
  assertNoSubscriptionHeader(headers);
}

describe("FastField DataTables auth", () => {
  test("authenticate success sends the session token, then reuses it", async () => {
    const start = Date.parse("2026-01-01T00:00:00.000Z");
    let clock = start;
    let minted = 0;
    const { calls, fetchImpl } = installFetch((call) => {
      if (call.url.endsWith("/authenticate")) {
        minted += 1;
        assert.equal(call.method, "POST");
        assert.equal(call.body, null);
        assert.equal(call.headers.get("fastfield-api-key"), API_KEY);
        assert.equal(call.headers.get("authorization"), basic(USERNAME, PASSWORD));
        assert.equal(call.headers.get("x-gatekeeper-sessiontoken"), null);
        assertNoSubscriptionHeader(call.headers);
        return {
          status: 200,
          body: {
            sessionToken: `minted-${minted}`,
            sessionExpiration: new Date(clock + 60 * 60 * 1000).toISOString(),
          },
        };
      }
      return { status: 200, body: { items: [] } };
    });
    const client = createDataTableClient({
      env: loginEnv(),
      fetchImpl,
      now: () => clock,
    });

    const first = await client.listItems("table-1", 10, 1);
    const second = await client.listItems("table-1", 10, 1);
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal(minted, 1);
    const lists = calls.filter((call) => call.url.includes("/datatables/"));
    assert.equal(lists.length, 2);
    assertDataHeaders(lists[0].headers, "minted-1");
    assertDataHeaders(lists[1].headers, "minted-1");

    clock = start + 60 * 60 * 1000 - 30_000;
    const third = await client.listItems("table-1", 10, 1);
    assert.equal(third.status, 200);
    assert.equal(minted, 2);
    const refreshed = calls.filter((call) => call.url.includes("/datatables/"));
    assertDataHeaders(refreshed[2].headers, "minted-2");
  });

  test("sessionExpires in the past is replaced on the next call", async () => {
    let minted = 0;
    const { calls, fetchImpl } = installFetch((call) => {
      if (call.url.endsWith("/authenticate")) {
        minted += 1;
        return {
          status: 200,
          body: {
            sessionToken: `short-${minted}`,
            sessionExpires: "2000-01-01T00:00:00.000Z",
          },
        };
      }
      return { status: 200, body: [] };
    });
    const client = createDataTableClient({ env: loginEnv(), fetchImpl });
    await client.listItems("table-1", 10, 1);
    await client.listItems("table-1", 10, 1);
    assert.equal(minted, 2);
    const lists = calls.filter((call) => call.url.includes("/items"));
    assertDataHeaders(lists[0].headers, "short-1");
    assertDataHeaders(lists[1].headers, "short-2");
  });

  test("HTTP 401 re-authenticates once and then fails", async () => {
    let minted = 0;
    const echoed = "ECHOED_SESSION_SHOULD_NOT_BE_LOGGED";
    const logs: string[] = [];
    const infoMock = mock.method(console, "info", (...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    });
    try {
      const { calls, fetchImpl } = installFetch((call) => {
        if (call.url.endsWith("/authenticate")) {
          minted += 1;
          return {
            status: 200,
            body: { sessionToken: `minted-${minted}` },
          };
        }
        return { status: 401, body: { message: "expired", token: echoed } };
      });
      const client = createDataTableClient({ env: loginEnv(), fetchImpl });
      const result = await client.listItems("table-1", 10, 1);
      assert.equal(result.status, 401);
      assert.equal(minted, 2);
      const lists = calls.filter((call) => call.url.includes("/items"));
      assert.equal(lists.length, 2);
      assertDataHeaders(lists[0].headers, "minted-1");
      assertDataHeaders(lists[1].headers, "minted-2");
      assert.equal(calls.filter((call) => call.url.endsWith("/authenticate")).length, 2);
      const text = logs.join("\n");
      assert.equal(text.includes(echoed), false);
      assert.equal(text.includes(API_KEY), false);
      assert.equal(text.includes(PASSWORD), false);
      assert.equal(text.includes("minted-1"), false);
      assert.equal(text.includes("minted-2"), false);
    } finally {
      infoMock.mock.restore();
    }
  });

  test("a pre-issued session is used until HTTP 401, without calling authenticate when login is unset", async () => {
    const { calls, fetchImpl } = installFetch(() => {
      return { status: 401, body: { message: "expired" } };
    });
    const client = createDataTableClient({
      env: loginEnv({
        FASTFIELD_USERNAME: "",
        FASTFIELD_PASSWORD: "",
        FASTFIELD_SESSION_TOKEN: SESSION_TOKEN,
      }),
      fetchImpl,
    });
    const first = await client.listItems("table-1", 10, 1);
    assert.equal(first.status, 401);
    assert.equal(calls.length, 1);
    assertDataHeaders(calls[0].headers, SESSION_TOKEN);
    await assert.rejects(
      () => client.listItems("table-1", 10, 1),
      /FASTFIELD_USERNAME and FASTFIELD_PASSWORD are not set/,
    );
    assert.equal(calls.length, 1);
  });

  test("a rejected pre-issued session is replaced once when login is configured", async () => {
    let minted = 0;
    let lists = 0;
    const { calls, fetchImpl } = installFetch((call) => {
      if (call.url.endsWith("/authenticate")) {
        minted += 1;
        return { status: 200, body: { sessionToken: "minted-from-login" } };
      }
      lists += 1;
      return { status: lists === 1 ? 401 : 200, body: { items: [] } };
    });
    const client = createDataTableClient({
      env: loginEnv({ FASTFIELD_SESSION_TOKEN: SESSION_TOKEN }),
      fetchImpl,
    });
    const result = await client.listItems("table-1", 10, 1);
    assert.equal(result.status, 200);
    assert.equal(minted, 1);
    const dataCalls = calls.filter((call) => call.url.includes("/items"));
    assert.equal(dataCalls.length, 2);
    assertDataHeaders(dataCalls[0].headers, SESSION_TOKEN);
    assertDataHeaders(dataCalls[1].headers, "minted-from-login");
    await client.listItems("table-1", 10, 1);
    assert.equal(minted, 1);
  });

  test("missing or partial credentials fail before any request", async () => {
    let fetches = 0;
    const fetchImpl: typeof fetch = async () => {
      fetches += 1;
      throw new Error("fetch should not be called");
    };

    const missing = createDataTableClient({ env: {}, fetchImpl });
    await assert.rejects(
      () => missing.listItems("table-1", 10, 1),
      /Missing FASTFIELD_API_KEY[\s\S]*FASTFIELD_USERNAME[\s\S]*FASTFIELD_SESSION_TOKEN/,
    );

    const keyOnly = createDataTableClient({
      env: { FASTFIELD_API_KEY: "  " },
      fetchImpl,
    });
    await assert.rejects(
      () => keyOnly.listItems("table-1", 10, 1),
      /FASTFIELD_API_KEY/,
    );

    const half = createDataTableClient({
      env: loginEnv({ FASTFIELD_PASSWORD: " " }),
      fetchImpl,
    });
    await assert.rejects(
      () => half.listItems("table-1", 10, 1),
      /FASTFIELD_PASSWORD is required when FASTFIELD_USERNAME is set/,
    );
    assert.equal(fetches, 0);
  });

  test("authenticate failures do not echo the response and do not call DataTables", async () => {
    const logs: string[] = [];
    const infoMock = mock.method(console, "info", (...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    });
    try {
      const leaked = "AUTH_BODY_SHOULD_NOT_BE_LOGGED";
      const { calls, fetchImpl } = installFetch(() => ({
        status: 401,
        body: { message: "denied", sessionToken: leaked, password: PASSWORD },
      }));
      const client = createDataTableClient({ env: loginEnv(), fetchImpl });
      await assert.rejects(
        () => client.listItems("table-1", 10, 1),
        /POST \/authenticate failed with HTTP 401/,
      );
      assert.equal(calls.some((call) => call.url.includes("/datatables/")), false);
      const text = `${logs.join("\n")}`;
      assert.equal(text.includes(leaked), false);
      assert.equal(text.includes(PASSWORD), false);
      assert.equal(text.includes(API_KEY), false);

      const empty = installFetch(() => ({ status: 200, body: { ok: true } }));
      const noToken = createDataTableClient({
        env: loginEnv(),
        fetchImpl: empty.fetchImpl,
      });
      await assert.rejects(
        () => noToken.listItems("table-1", 10, 1),
        /returned no sessionToken/,
      );
    } finally {
      infoMock.mock.restore();
    }
  });

  test("deprecated subscription and user-token variables are not sent", async () => {
    const { calls, fetchImpl } = installFetch((call) => {
      if (call.url.endsWith("/authenticate")) {
        return { status: 200, body: { sessionToken: "minted-1" } };
      }
      return { status: 200, body: [] };
    });
    const client = createDataTableClient({
      env: loginEnv({
        FASTFIELD_SUBSCRIPTION_KEY: "SUBKEY_SHOULD_NOT_BE_SENT",
        FASTFIELD_USER_TOKEN: "USERTOKEN_SHOULD_NOT_BE_SENT",
        FASTFIELD_GATEKEEPER_SESSION_TOKEN: "GATE_SHOULD_NOT_BE_SENT",
      }),
      fetchImpl,
    });
    await client.listItems("table-1", 10, 1);
    assert.equal(calls.length, 2);
    for (const call of calls) {
      assertNoSubscriptionHeader(call.headers);
      const authorization = call.headers.get("authorization") ?? "";
      assert.equal(authorization.includes("USERTOKEN_SHOULD_NOT_BE_SENT"), false);
      assert.equal(
        call.headers.get("x-gatekeeper-sessiontoken"),
        call.url.endsWith("/authenticate") ? null : "minted-1",
      );
      const combined = [...call.headers.entries()]
        .map(([name, value]) => `${name}:${value}`)
        .join("\n");
      assert.equal(combined.includes("SUBKEY_SHOULD_NOT_BE_SENT"), false);
      assert.equal(combined.includes("USERTOKEN_SHOULD_NOT_BE_SENT"), false);
      assert.equal(combined.includes("GATE_SHOULD_NOT_BE_SENT"), false);
    }
  });

  test("the legacy projector keeps its own header names for the same env vars", () => {
    const headers = legacyProjectorHeaders({
      FASTFIELD_API_KEY: API_KEY,
      FASTFIELD_SESSION_TOKEN: SESSION_TOKEN,
    });
    assert.equal(headers.get("x-api-key"), API_KEY);
    assert.equal(headers.get("x-session-token"), SESSION_TOKEN);
    assert.equal(headers.get("fastfield-api-key"), null);
    assert.equal(headers.get("x-gatekeeper-sessiontoken"), null);
    assert.equal(headers.get("content-type"), "application/json");

    const renamed = legacyProjectorHeaders({
      FASTFIELD_API_KEY: API_KEY,
      FASTFIELD_SESSION_TOKEN: SESSION_TOKEN,
      FASTFIELD_API_KEY_HEADER: "FastField-API-Key",
      FASTFIELD_SESSION_TOKEN_HEADER: "X-Gatekeeper-SessionToken",
    });
    assert.equal(renamed.get("fastfield-api-key"), API_KEY);
    assert.equal(renamed.get("x-gatekeeper-sessiontoken"), SESSION_TOKEN);

    const absent = legacyProjectorHeaders({});
    assert.equal(absent.get("x-api-key"), null);
    assert.equal(absent.get("x-session-token"), null);
    assert.equal(absent.get("content-type"), "application/json");
  });
});
