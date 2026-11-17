import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, mock, test } from "node:test";
import { createDataTableClient } from "./datatables/client.ts";
import { resetResponseShapeLogsForTests } from "./datatables/shape.ts";
import {
  resetSiteInfoSyncStateForTests,
  SITE_INFO_PAGE_SIZE,
  syncSiteInfoFromSubmission,
} from "./site-info-sync.ts";

const SUBSCRIPTION_KEY = "SUBKEY_SHOULD_NOT_BE_LOGGED";
const USER_TOKEN = "USERTOKEN_SHOULD_NOT_BE_LOGGED";
const SITE_CODE = "CAP-SHOULD_NOT_BE_LOGGED";

type Env = Record<string, string | undefined>;
type Call = {
  url: string;
  method: string;
  body: unknown;
  headers: Headers;
};

const ENV_KEYS = [
  "FASTFIELD_SITE_INFO_SYNC_ENABLED",
  "FASTFIELD_SITE_INFO_TABLE_NAME",
  "FASTFIELD_SITE_INFO_KEY_COLUMN",
  "FASTFIELD_SITE_INFO_FIELD_MAP",
  "FASTFIELD_SUBSCRIPTION_KEY",
  "FASTFIELD_USER_TOKEN",
  "FASTFIELD_GATEKEEPER_SESSION_TOKEN",
  "FASTFIELD_DATATABLES_BASE_URL",
];

let envSnapshot: Record<string, string | undefined> = {};
let infoMock: ReturnType<typeof mock.method> | undefined;
let warnMock: ReturnType<typeof mock.method> | undefined;
let errorMock: ReturnType<typeof mock.method> | undefined;
const logs: string[] = [];

function readyEnv(extra: Env = {}): Env {
  return {
    FASTFIELD_SITE_INFO_SYNC_ENABLED: "true",
    FASTFIELD_SITE_INFO_TABLE_NAME: "site info",
    FASTFIELD_SITE_INFO_KEY_COLUMN: "Site Code",
    FASTFIELD_SITE_INFO_FIELD_MAP: JSON.stringify({
      "Site Code": "site_code",
      Phone: "phone",
    }),
    FASTFIELD_SUBSCRIPTION_KEY: SUBSCRIPTION_KEY,
    FASTFIELD_USER_TOKEN: USER_TOKEN,
    FASTFIELD_DATATABLES_BASE_URL: "https://api.fastfieldforms.com/services/v3",
    ...extra,
  };
}

function submission(extra: Record<string, unknown> = {}) {
  return {
    submissionId: "sub-1",
    site_code: SITE_CODE,
    phone: ["222"],
    ...extra,
  };
}

function listBody() {
  return {
    dataTables: [
      { name: "other", id: "not-the-table" },
      { name: "site info", id: "wrong-id", dataTableId: "table-9" },
    ],
  };
}

function jsonResponse(status: number, body: unknown): Response {
  if (body === undefined) {
    return new Response(null, { status });
  }
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function installFetch(
  handler: (
    call: Call,
  ) =>
    | { status: number; body?: unknown }
    | Promise<{ status: number; body?: unknown }>,
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
    return jsonResponse(result.status, result.body);
  };
  return { calls, fetchImpl };
}

function clientFor(
  env: Env,
  handler: (call: Call) => { status: number; body?: unknown },
) {
  const installed = installFetch(handler);
  return {
    ...installed,
    client: createDataTableClient({
      env,
      fetchImpl: installed.fetchImpl,
    }),
  };
}

function loggedText(): string {
  return logs.join("\n");
}

function assertNoSecrets(text: string) {
  assert.equal(text.includes(SUBSCRIPTION_KEY), false);
  assert.equal(text.includes(USER_TOKEN), false);
  assert.equal(text.includes(SITE_CODE), false);
  assert.equal(text.includes("keep me"), false);
}

describe("site info DataTables sync", { concurrency: false }, () => {
  beforeEach(() => {
    envSnapshot = Object.fromEntries(
      ENV_KEYS.map((key) => [key, process.env[key]]),
    );
    for (const key of ENV_KEYS) delete process.env[key];
    logs.length = 0;
    resetSiteInfoSyncStateForTests();
    resetResponseShapeLogsForTests();
    infoMock = mock.method(console, "info", (...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    });
    warnMock = mock.method(console, "warn", (...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    });
    errorMock = mock.method(console, "error", (...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    });
  });

  afterEach(() => {
    infoMock?.mock.restore();
    warnMock?.mock.restore();
    errorMock?.mock.restore();
    resetSiteInfoSyncStateForTests();
    resetResponseShapeLogsForTests();
    for (const key of ENV_KEYS) {
      const value = envSnapshot[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  test("resolves the table id from a wrapped list and caches it", async () => {
    const env = readyEnv();
    let lookups = 0;
    const { calls, client } = clientFor(env, (call) => {
      if (call.url.endsWith("/datatables/list")) {
        return { status: 200, body: listBody() };
      }
      if (call.url.endsWith("/items/lookup")) {
        lookups += 1;
        return {
          status: 200,
          body: {
            item: {
              id: "row-1",
              data: { "Site Code": "OLD", Notes: "keep me" },
            },
          },
        };
      }
      if (call.method === "PUT") return { status: 200, body: { ok: true } };
      throw new Error(`unexpected ${call.method} ${call.url}`);
    });

    const first = await syncSiteInfoFromSubmission(submission(), { client, env });
    const second = await syncSiteInfoFromSubmission(submission(), { client, env });

    assert.equal(first.status, "updated");
    assert.equal(first.tableId, "table-9");
    assert.equal(second.status, "updated");
    assert.equal(calls.filter((call) => call.url.endsWith("/datatables/list")).length, 1);
    assert.equal(lookups, 2);
    assert.equal(
      calls[0].headers.get("ocp-apim-subscription-key"),
      SUBSCRIPTION_KEY,
    );
    assert.equal(
      calls[0].headers.get("authorization"),
      `Bearer ${USER_TOKEN}`,
    );
    assert.equal(calls[0].headers.get("x-gatekeeper-sessiontoken"), null);
    assert.match(calls[1].url, /\/datatables\/table-9\/items\/lookup$/);
    assertNoSecrets(loggedText());
    assert.match(loggedText(), /first list success response shape/);
    assert.match(loggedText(), /<string len=/);
  });

  test("lookup hit merges onto the full row and PUTs id plus data", async () => {
    const env = readyEnv();
    const { calls, client } = clientFor(env, (call) => {
      if (call.url.endsWith("/datatables/list")) {
        return { status: 200, body: listBody() };
      }
      if (call.url.endsWith("/items/lookup")) {
        assert.deepEqual(call.body, { data: { "Site Code": SITE_CODE } });
        return {
          status: 200,
          body: {
            item: {
              id: "row-1",
              data: {
                "Site Code": "OLD",
                Notes: "keep me",
                Phone: "111",
                Empty: null,
              },
            },
          },
        };
      }
      if (call.method === "PUT") return { status: 200, body: {} };
      throw new Error(`unexpected ${call.method} ${call.url}`);
    });

    const result = await syncSiteInfoFromSubmission(submission(), { client, env });
    const put = calls.find((call) => call.method === "PUT");
    const putBody = put?.body as { id: string; data: Record<string, unknown> };

    assert.equal(result.status, "updated");
    assert.equal(result.itemId, "row-1");
    assert.equal(calls.some((call) => call.method === "POST" && call.url.endsWith("/items")), false);
    assert.ok(put);
    assert.match(put.url, /\/datatables\/table-9\/items$/);
    assert.equal(putBody.id, "row-1");
    assert.deepEqual(putBody.data, {
      "Site Code": SITE_CODE,
      Notes: "keep me",
      Phone: "222",
      Empty: null,
    });
    assertNoSecrets(loggedText());
  });

  test("lookup miss inserts with POST and does not page or PUT", async () => {
    const env = readyEnv();
    const { calls, client } = clientFor(env, (call) => {
      if (call.url.endsWith("/datatables/list")) {
        return { status: 200, body: listBody() };
      }
      if (call.url.endsWith("/items/lookup")) {
        return { status: 404, body: { message: "not found" } };
      }
      if (call.method === "POST" && call.url.endsWith("/items")) {
        return { status: 201, body: { id: "new-row" } };
      }
      throw new Error(`unexpected ${call.method} ${call.url}`);
    });

    const result = await syncSiteInfoFromSubmission(submission(), { client, env });
    const post = calls.find(
      (call) => call.method === "POST" && call.url.endsWith("/items"),
    );

    assert.equal(result.status, "created");
    assert.equal(calls.some((call) => call.method === "PUT"), false);
    assert.equal(calls.some((call) => call.url.includes("/items?")), false);
    assert.deepEqual(post?.body, {
      data: { "Site Code": SITE_CODE, Phone: "222" },
    });
    assertNoSecrets(loggedText());
  });

  test("pages through items when lookup is unusable, then PUTs the full row", async () => {
    const env = readyEnv();
    const { calls, client } = clientFor(env, (call) => {
      if (call.url.endsWith("/datatables/list")) {
        return { status: 200, body: listBody() };
      }
      if (call.url.endsWith("/items/lookup")) {
        return { status: 400, body: { message: "not a lookup key" } };
      }
      const page = new URL(call.url).searchParams.get("pageNumber");
      if (call.method === "GET" && page === "1") {
        return {
          status: 200,
          body: {
            items: Array.from({ length: SITE_INFO_PAGE_SIZE }, (_, index) => ({
              id: `p1-${index}`,
              data: { "Site Code": `other-${index}`, Notes: "x", Extra: index },
            })),
          },
        };
      }
      if (call.method === "GET" && page === "0") {
        return { status: 200, body: { items: [] } };
      }
      if (call.method === "GET" && page === "2") {
        return {
          status: 200,
          body: {
            items: [
              {
                id: "target",
                data: {
                  "Site Code": SITE_CODE,
                  Notes: "keep me",
                  Extra: 1,
                  Phone: "111",
                },
              },
            ],
          },
        };
      }
      if (call.method === "PUT") return { status: 200, body: {} };
      throw new Error(`unexpected ${call.method} ${call.url}`);
    });

    const result = await syncSiteInfoFromSubmission(submission(), { client, env });
    const put = calls.find((call) => call.method === "PUT");
    const pages = calls
      .filter((call) => call.method === "GET" && call.url.includes("/items?"))
      .map((call) => new URL(call.url).searchParams.get("pageNumber"));

    assert.equal(result.status, "updated");
    assert.equal(result.itemId, "target");
    assert.deepEqual(pages, ["1", "0", "2"]);
    assert.equal(
      calls.some((call) => call.method === "POST" && call.url.endsWith("/items")),
      false,
    );
    assert.deepEqual((put?.body as { data: Record<string, unknown> }).data, {
      "Site Code": SITE_CODE,
      Notes: "keep me",
      Extra: 1,
      Phone: "222",
    });
    assertNoSecrets(loggedText());
  });

  test("stays a no-op until the flag, key column, and field map are set", async () => {
    const fetchImpl: typeof fetch = async () => {
      throw new Error("fetch should not be called");
    };
    const client = createDataTableClient({ fetchImpl, env: readyEnv() });

    const disabled = await syncSiteInfoFromSubmission(submission(), {
      client,
      env: readyEnv({ FASTFIELD_SITE_INFO_SYNC_ENABLED: undefined }),
    });
    assert.equal(disabled.status, "skipped");
    assert.match(disabled.reason, /FASTFIELD_SITE_INFO_SYNC_ENABLED/);
    assert.match(loggedText(), /no-op: FASTFIELD_SITE_INFO_SYNC_ENABLED/);

    resetSiteInfoSyncStateForTests();
    logs.length = 0;
    const unconfigured = await syncSiteInfoFromSubmission(submission(), {
      client,
      env: readyEnv({
        FASTFIELD_SITE_INFO_KEY_COLUMN: "",
        FASTFIELD_SITE_INFO_FIELD_MAP: "",
      }),
    });
    assert.equal(unconfigured.status, "skipped");
    assert.match(unconfigured.reason, /key column is empty/);
    assert.match(unconfigured.reason, /field map is empty/);
    assert.match(unconfigured.reason, /site-info-sync-config\.ts/);
    assert.match(loggedText(), /no-op:/);

    resetSiteInfoSyncStateForTests();
    const invalid = await syncSiteInfoFromSubmission(submission(), {
      client,
      env: readyEnv({ FASTFIELD_SITE_INFO_FIELD_MAP: "{not json" }),
    });
    assert.equal(invalid.status, "skipped");
    assert.match(invalid.reason, /not valid JSON/);

    const missingKey = await syncSiteInfoFromSubmission(
      { submissionId: "sub-1", phone: "222" },
      { client, env: readyEnv() },
    );
    assert.equal(missingKey.status, "skipped");
    assert.match(missingKey.reason, /site_code/);
    assertNoSecrets(loggedText());
  });

  test("API and network errors do not throw and do not insert on a failed search", async () => {
    const env = readyEnv();
    const listFailure = clientFor(env, (call) => {
      if (call.url.endsWith("/datatables/list")) {
        return { status: 500, body: { message: "boom", token: USER_TOKEN } };
      }
      throw new Error(`unexpected ${call.method} ${call.url}`);
    });
    const listed = await syncSiteInfoFromSubmission(submission(), {
      client: listFailure.client,
      env,
    });
    assert.equal(listed.status, "failed");
    assert.match(listed.reason, /HTTP 500/);
    assert.equal(listFailure.calls.some((call) => call.method === "POST"), false);
    assert.equal(listFailure.calls.some((call) => call.method === "PUT"), false);

    const putFailure = clientFor(env, (call) => {
      if (call.url.endsWith("/datatables/list")) {
        return { status: 200, body: listBody() };
      }
      if (call.url.endsWith("/items/lookup")) {
        return {
          status: 200,
          body: { id: "row-1", data: { "Site Code": "OLD", Notes: "keep me" } },
        };
      }
      if (call.method === "PUT") {
        return { status: 422, body: { message: "bad type", token: USER_TOKEN } };
      }
      throw new Error(`unexpected ${call.method} ${call.url}`);
    });
    const updated = await syncSiteInfoFromSubmission(submission(), {
      client: putFailure.client,
      env,
    });
    assert.equal(updated.status, "failed");
    assert.match(updated.reason, /HTTP 422/);
    assert.equal(
      putFailure.calls.some(
        (call) => call.method === "POST" && call.url.endsWith("/items"),
      ),
      false,
    );

    const searchFailure = clientFor(env, (call) => {
      if (call.url.endsWith("/datatables/list")) {
        return { status: 200, body: listBody() };
      }
      return { status: 500, body: { message: USER_TOKEN } };
    });
    const searched = await syncSiteInfoFromSubmission(submission(), {
      client: searchFailure.client,
      env,
    });
    assert.equal(searched.status, "failed");
    assert.equal(
      searchFailure.calls.some(
        (call) => call.method === "POST" && call.url.endsWith("/items"),
      ),
      false,
    );

    let fetches = 0;
    const missingCreds = createDataTableClient({
      env: readyEnv({
        FASTFIELD_SUBSCRIPTION_KEY: "",
        FASTFIELD_USER_TOKEN: "",
      }),
      fetchImpl: async () => {
        fetches += 1;
        throw new Error("fetch should not be called");
      },
    });
    const unauthenticated = await syncSiteInfoFromSubmission(submission(), {
      client: missingCreds,
      env: readyEnv({
        FASTFIELD_SUBSCRIPTION_KEY: " ",
        FASTFIELD_USER_TOKEN: "",
      }),
    });
    assert.equal(unauthenticated.status, "failed");
    assert.match(unauthenticated.reason, /FASTFIELD_SUBSCRIPTION_KEY/);
    assert.match(unauthenticated.reason, /FASTFIELD_USER_TOKEN/);
    assert.equal(fetches, 0);

    const network = clientFor(env, () => {
      throw new Error("network down");
    });
    const networked = await syncSiteInfoFromSubmission(submission(), {
      client: network.client,
      env,
    });
    assert.equal(networked.status, "failed");
    assert.match(networked.reason, /network down/);

    const multiple = clientFor(env, (call) => {
      if (call.url.endsWith("/datatables/list")) {
        return { status: 200, body: listBody() };
      }
      if (call.url.endsWith("/items/lookup")) {
        return {
          status: 200,
          body: [
            { id: "a", data: { "Site Code": SITE_CODE, Notes: "one" } },
            { id: "b", data: { "Site Code": SITE_CODE, Notes: "two" } },
          ],
        };
      }
      throw new Error(`unexpected ${call.method} ${call.url}`);
    });
    const ambiguous = await syncSiteInfoFromSubmission(submission(), {
      client: multiple.client,
      env,
    });
    assert.equal(ambiguous.status, "failed");
    assert.match(ambiguous.reason, /2 rows/);
    assert.equal(multiple.calls.some((call) => call.method === "PUT"), false);
    assert.equal(
      multiple.calls.some(
        (call) => call.method === "POST" && call.url.endsWith("/items"),
      ),
      false,
    );

    assertNoSecrets(loggedText());
  });

  test("sends X-Gatekeeper-SessionToken only when configured", async () => {
    const env = readyEnv({
      FASTFIELD_GATEKEEPER_SESSION_TOKEN: "bearer",
    });
    const { calls, client } = clientFor(env, (call) => {
      if (call.url.endsWith("/datatables/list")) {
        return { status: 200, body: listBody() };
      }
      if (call.url.endsWith("/items/lookup")) {
        return { status: 404, body: [] };
      }
      if (call.method === "POST") return { status: 201, body: {} };
      throw new Error(`unexpected ${call.method} ${call.url}`);
    });

    const result = await syncSiteInfoFromSubmission(submission(), { client, env });
    assert.equal(result.status, "created");
    assert.equal(
      calls[0].headers.get("x-gatekeeper-sessiontoken"),
      USER_TOKEN,
    );

    const distinct = readyEnv({
      FASTFIELD_GATEKEEPER_SESSION_TOKEN: "distinct-gate-token",
    });
    const second = clientFor(distinct, (call) => {
      if (call.url.endsWith("/datatables/list")) {
        return { status: 200, body: listBody() };
      }
      if (call.url.endsWith("/items/lookup")) return { status: 404, body: [] };
      if (call.method === "POST") return { status: 201, body: {} };
      throw new Error(`unexpected ${call.method} ${call.url}`);
    });
    await syncSiteInfoFromSubmission(submission(), {
      client: second.client,
      env: distinct,
    });
    assert.equal(
      second.calls[0].headers.get("x-gatekeeper-sessiontoken"),
      "distinct-gate-token",
    );
    assert.equal(loggedText().includes("distinct-gate-token"), false);
    assertNoSecrets(loggedText());
  });

  test("serializes concurrent upserts for the same site key in one process", async () => {
    const env = readyEnv();
    let lookups = 0;
    let releaseFirst: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const { calls, client } = clientFor(env, async (call) => {
      if (call.url.endsWith("/datatables/list")) {
        return { status: 200, body: listBody() };
      }
      if (call.url.endsWith("/items/lookup")) {
        lookups += 1;
        if (lookups === 1) {
          await gate;
          return { status: 404, body: { message: "not found" } };
        }
        return {
          status: 200,
          body: {
            id: "row-1",
            data: { "Site Code": SITE_CODE, Notes: "keep me", Phone: "old" },
          },
        };
      }
      if (call.method === "POST") return { status: 201, body: {} };
      if (call.method === "PUT") return { status: 200, body: {} };
      throw new Error(`unexpected ${call.method} ${call.url}`);
    });

    const first = syncSiteInfoFromSubmission(
      submission({ submissionId: "sub-a", phone: "111" }),
      { client, env },
    );
    const second = syncSiteInfoFromSubmission(
      submission({ submissionId: "sub-b", phone: "222" }),
      { client, env },
    );
    for (let attempt = 0; attempt < 50 && lookups < 1; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.equal(lookups, 1);
    releaseFirst();
    const [created, updated] = await Promise.all([first, second]);

    assert.equal(created.status, "created");
    assert.equal(updated.status, "updated");
    assert.equal(
      calls.filter((call) => call.method === "POST" && call.url.endsWith("/items"))
        .length,
      1,
    );
    const put = calls.find((call) => call.method === "PUT");
    assert.equal(
      (put?.body as { data: Record<string, unknown> }).data.Phone,
      "222",
    );
    assert.equal(
      (put?.body as { data: Record<string, unknown> }).data.Notes,
      "keep me",
    );
    assertNoSecrets(loggedText());
  });
});
