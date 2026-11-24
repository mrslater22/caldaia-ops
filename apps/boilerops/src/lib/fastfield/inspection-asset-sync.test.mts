import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, mock, test } from "node:test";
import { syncAssetInfoFromSubmission } from "./asset-info-sync.ts";
import {
  ASSET_INFO_FIELD_MAP,
  ASSET_INFO_LIST_ID,
  SUGGESTED_ASSET_INFO_FIELD_MAP,
} from "./asset-info-sync-config.ts";
import { createDataTableClient } from "./datatables/client.ts";
import { resetResponseShapeLogsForTests } from "./datatables/shape.ts";
import { resetDataTableSyncStateForTests } from "./data-table-sync.ts";
import { syncInspectionInfoFromSubmission } from "./inspection-info-sync.ts";
import {
  INSPECTION_INFO_FIELD_MAP,
  INSPECTION_INFO_LIST_ID,
  SUGGESTED_INSPECTION_INFO_FIELD_MAP,
} from "./inspection-info-sync-config.ts";

const API_KEY = "APIKEY_SHOULD_NOT_BE_LOGGED";
const SESSION_TOKEN = "SESSION_SHOULD_NOT_BE_LOGGED";
const TARGET_ID = "target_SHOULD_NOT_BE_LOGGED";
const FIELD_TARGET = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const FIELD_SITE = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const FIELD_NAME = "cccccccccccccccccccccccccccccccc";
const FIELD_EXTRA = "dddddddddddddddddddddddddddddddd";

type Env = Record<string, string | undefined>;
type Call = { url: string; method: string; body: unknown };

function readyInspectionEnv(extra: Env = {}): Env {
  return {
    FASTFIELD_INSPECTION_INFO_SYNC_ENABLED: "true",
    FASTFIELD_INSPECTION_INFO_FIELD_MAP: JSON.stringify({
      bo_targetid: "bo_targetid",
      bo_siteid: "bo_siteid",
      inspection_name: "inspection_name",
    }),
    FASTFIELD_API_KEY: API_KEY,
    FASTFIELD_SESSION_TOKEN: SESSION_TOKEN,
    FASTFIELD_DATATABLES_BASE_URL: "https://api.fastfieldforms.com/services/v3",
    ...extra,
  };
}

function listBody() {
  return {
    dataTables: [
      {
        name: "Site Info",
        listId: "bae377fe-a4e9-4b70-b424-83b5d0e5a592",
        config: { fields: [] },
      },
      {
        name: "Inspection Info",
        id: "wrong-id",
        listId: INSPECTION_INFO_LIST_ID,
        config: {
          fields: [
            { key: FIELD_TARGET, displayName: "bo_targetid", isLookupKey: true },
            { key: FIELD_SITE, displayName: "bo_siteid", isLookupKey: false },
            { key: FIELD_NAME, displayName: "inspection_name", isLookupKey: false },
            { key: FIELD_EXTRA, displayName: "Extra", isLookupKey: false },
          ],
        },
      },
    ],
  };
}

function jsonResponse(status: number, body: unknown): Response {
  if (body === undefined) return new Response(null, { status });
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function installFetch(
  handler: (call: Call) => { status: number; body?: unknown },
) {
  const calls: Call[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const rawBody = init?.body == null ? null : String(init.body);
    const call: Call = {
      url: String(input),
      method: init?.method ?? "GET",
      body: rawBody ? (JSON.parse(rawBody) as unknown) : null,
    };
    calls.push(call);
    const result = handler(call);
    return jsonResponse(result.status, result.body);
  };
  return { calls, fetchImpl };
}

describe("inspection and asset DataTables sync", { concurrency: false }, () => {
  let infoMock: ReturnType<typeof mock.method> | undefined;
  let warnMock: ReturnType<typeof mock.method> | undefined;
  let errorMock: ReturnType<typeof mock.method> | undefined;

  beforeEach(() => {
    resetDataTableSyncStateForTests();
    resetResponseShapeLogsForTests();
    infoMock = mock.method(console, "info", () => undefined);
    warnMock = mock.method(console, "warn", () => undefined);
    errorMock = mock.method(console, "error", () => undefined);
  });

  afterEach(() => {
    infoMock?.mock.restore();
    warnMock?.mock.restore();
    errorMock?.mock.restore();
    resetDataTableSyncStateForTests();
    resetResponseShapeLogsForTests();
  });

  test("both syncs are off and their field maps are empty until configured", async () => {
    const inspection = await syncInspectionInfoFromSubmission(
      { bo_targetid: TARGET_ID },
      { env: {} },
    );
    const asset = await syncAssetInfoFromSubmission(
      { bo_assetid: "asset_1" },
      { env: {} },
    );
    assert.equal(inspection.status, "skipped");
    assert.match(inspection.reason, /FASTFIELD_INSPECTION_INFO_SYNC_ENABLED/);
    assert.equal(asset.status, "skipped");
    assert.match(asset.reason, /FASTFIELD_ASSET_INFO_SYNC_ENABLED/);
    assert.deepEqual(INSPECTION_INFO_FIELD_MAP, {});
    assert.deepEqual(ASSET_INFO_FIELD_MAP, {});
    assert.equal(INSPECTION_INFO_LIST_ID, "d529b806-e0bb-497c-b852-cfec14c7102b");
    assert.equal(ASSET_INFO_LIST_ID, "2182c9f7-8045-4418-9bb1-eaddb13c097d");
    assert.equal(SUGGESTED_INSPECTION_INFO_FIELD_MAP.bo_targetid, "bo_targetid");
    assert.equal(SUGGESTED_ASSET_INFO_FIELD_MAP.bo_assetid, "bo_assetid");
    assert.equal(SUGGESTED_ASSET_INFO_FIELD_MAP.bo_siteid, "bo_siteid");
  });

  test("an enabled empty map does not call FastField", async () => {
    let fetches = 0;
    const fetchImpl: typeof fetch = async () => {
      fetches += 1;
      return jsonResponse(500, {});
    };
    const client = createDataTableClient({
      env: { FASTFIELD_API_KEY: API_KEY, FASTFIELD_SESSION_TOKEN: SESSION_TOKEN },
      fetchImpl,
    });
    const result = await syncInspectionInfoFromSubmission(
      { bo_targetid: TARGET_ID },
      {
        env: { FASTFIELD_INSPECTION_INFO_SYNC_ENABLED: "true" },
        client,
      },
    );
    assert.equal(result.status, "skipped");
    assert.match(result.reason, /field map is empty/);
    assert.equal(fetches, 0);
  });

  test("resolves listId, maps display names to GUIDs, and merges the full row", async () => {
    const env = readyInspectionEnv();
    const { calls, fetchImpl } = installFetch((call) => {
      if (call.url.endsWith("/datatables/list")) {
        return { status: 200, body: listBody() };
      }
      if (call.url.endsWith("/items/lookup")) {
        return {
          status: 200,
          body: {
            id: "row-1",
            data: {
              [FIELD_TARGET]: TARGET_ID,
              [FIELD_SITE]: "site_old",
              [FIELD_NAME]: "Old name",
              [FIELD_EXTRA]: "keep me",
            },
          },
        };
      }
      if (call.method === "PUT") return { status: 200, body: { id: "row-1" } };
      return { status: 500, body: { unexpected: true } };
    });
    const client = createDataTableClient({ env, fetchImpl });
    const result = await syncInspectionInfoFromSubmission(
      {
        submissionId: "sub-1",
        bo_targetid: TARGET_ID,
        bo_siteid: "site_tst1",
        inspection_name: "Boiler 1",
      },
      { env, client },
    );
    assert.equal(result.status, "updated");
    assert.equal(result.tableId, INSPECTION_INFO_LIST_ID);
    const lookup = calls.find((call) => call.url.endsWith("/items/lookup"));
    assert.ok(lookup);
    assert.match(lookup.url, new RegExp(`/datatables/${INSPECTION_INFO_LIST_ID}/items/lookup$`));
    assert.deepEqual(lookup.body, { data: { [FIELD_TARGET]: TARGET_ID } });
    const put = calls.find((call) => call.method === "PUT");
    assert.deepEqual(put?.body, {
      id: "row-1",
      data: {
        [FIELD_TARGET]: TARGET_ID,
        [FIELD_SITE]: "site_tst1",
        [FIELD_NAME]: "Boiler 1",
        [FIELD_EXTRA]: "keep me",
      },
    });
    const logged = String((infoMock?.mock.calls ?? []).map((call) => call.arguments.join(" ")));
    assert.equal(logged.includes(API_KEY), false);
    assert.equal(logged.includes(TARGET_ID), false);
    assert.equal(logged.includes("keep me"), false);
  });

  test("fails closed when a configured display name is missing and does not throw", async () => {
    const env = readyInspectionEnv({
      FASTFIELD_INSPECTION_INFO_FIELD_MAP: JSON.stringify({
        bo_targetid: "bo_targetid",
        "Not A Column": "inspection_name",
      }),
    });
    let writes = 0;
    const { fetchImpl } = installFetch((call) => {
      if (call.url.endsWith("/datatables/list")) {
        return { status: 200, body: listBody() };
      }
      writes += 1;
      return { status: 500, body: {} };
    });
    const client = createDataTableClient({ env, fetchImpl });
    const result = await syncInspectionInfoFromSubmission(
      { bo_targetid: TARGET_ID, inspection_name: "Boiler 1" },
      { env, client },
    );
    assert.equal(result.status, "failed");
    assert.match(result.reason, /Not A Column/);
    assert.match(result.reason, /No row was written/);
    assert.equal(writes, 0);

    const thrown = await syncAssetInfoFromSubmission(
      { bo_assetid: "asset_1" },
      {
        env: {
          FASTFIELD_ASSET_INFO_SYNC_ENABLED: "true",
          FASTFIELD_ASSET_INFO_FIELD_MAP: JSON.stringify({
            bo_assetid: "bo_assetid",
          }),
          FASTFIELD_API_KEY: API_KEY,
          FASTFIELD_SESSION_TOKEN: SESSION_TOKEN,
        },
        client: createDataTableClient({
          env: {
            FASTFIELD_API_KEY: API_KEY,
            FASTFIELD_SESSION_TOKEN: SESSION_TOKEN,
          },
          fetchImpl: async () => {
            throw new Error("network down");
          },
        }),
      },
    );
    assert.equal(thrown.status, "failed");
    assert.match(thrown.reason, /network down/);
  });
});
