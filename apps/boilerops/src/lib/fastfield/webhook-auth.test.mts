import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, mock, test } from "node:test";
import { fileURLToPath } from "node:url";
import { authorizeFastFieldRequest } from "./webhook-auth.ts";

const ENV_KEYS = [
  "NODE_ENV",
  "FASTFIELD_WEBHOOK_SECRET",
  "FASTFIELD_WEBHOOK_ALLOW_INSECURE_DEV",
];

const SECRET = "configured-secret-SHOULD-NOT-APPEAR-IN-LOGS";
const PROVIDED = "provided-value-SHOULD-NOT-APPEAR-IN-LOGS";

let envSnapshot: Record<string, string | undefined> = {};
let errorMock: ReturnType<typeof mock.method> | undefined;
let warnMock: ReturnType<typeof mock.method> | undefined;
const errorLogs: string[] = [];
const warnLogs: string[] = [];

function request(
  headers?: Record<string, string>,
  url = "https://boilerops.example/api/fastfield/submissions",
): Request {
  return new Request(url, { method: "POST", headers });
}

function basic(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`, "utf8").toString("base64")}`;
}

function loggedText(): string {
  return [...errorLogs, ...warnLogs].join("\n");
}

describe("authorizeFastFieldRequest", { concurrency: false }, () => {
  beforeEach(() => {
    envSnapshot = Object.fromEntries(
      ENV_KEYS.map((key) => [key, process.env[key]]),
    );
    for (const key of ENV_KEYS) delete process.env[key];
    errorLogs.length = 0;
    warnLogs.length = 0;
    errorMock = mock.method(console, "error", (...args: unknown[]) => {
      errorLogs.push(args.map(String).join(" "));
    });
    warnMock = mock.method(console, "warn", (...args: unknown[]) => {
      warnLogs.push(args.map(String).join(" "));
    });
  });

  afterEach(() => {
    errorMock?.mock.restore();
    warnMock?.mock.restore();
    for (const key of ENV_KEYS) {
      const value = envSnapshot[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  test("accepts the preferred header when the secret matches", () => {
    process.env.NODE_ENV = "production";
    process.env.FASTFIELD_WEBHOOK_SECRET = SECRET;

    assert.equal(
      authorizeFastFieldRequest(
        request({ "x-boilerops-secret": SECRET }),
      ),
      true,
    );
    assert.equal(errorLogs.length, 0);
    assert.equal(warnLogs.length, 0);
  });

  test("accepts x-api-key, x-fastfield-secret, and HTTP Basic password", () => {
    process.env.NODE_ENV = "production";
    process.env.FASTFIELD_WEBHOOK_SECRET = SECRET;

    assert.equal(
      authorizeFastFieldRequest(request({ "x-api-key": SECRET })),
      true,
    );
    assert.equal(
      authorizeFastFieldRequest(request({ "x-fastfield-secret": SECRET })),
      true,
    );
    assert.equal(
      authorizeFastFieldRequest(
        request({ authorization: basic("fastfield", SECRET) }),
      ),
      true,
    );
  });

  test("keeps colons inside an HTTP Basic password", () => {
    process.env.NODE_ENV = "production";
    process.env.FASTFIELD_WEBHOOK_SECRET = `pass:${SECRET}`;

    assert.equal(
      authorizeFastFieldRequest(
        request({ authorization: basic("fastfield", `pass:${SECRET}`) }),
      ),
      true,
    );
    assert.equal(
      authorizeFastFieldRequest(
        request({ authorization: basic("fastfield", "pass") }),
      ),
      false,
    );
  });

  test("rejects a missing secret and a wrong secret", () => {
    process.env.NODE_ENV = "production";
    process.env.FASTFIELD_WEBHOOK_SECRET = SECRET;

    assert.equal(authorizeFastFieldRequest(request()), false);
    assert.equal(
      authorizeFastFieldRequest(
        request({ "x-boilerops-secret": "not-the-secret" }),
      ),
      false,
    );
    assert.equal(
      authorizeFastFieldRequest(
        request({ authorization: basic("fastfield", "not-the-secret") }),
      ),
      false,
    );
    assert.equal(
      authorizeFastFieldRequest(
        request({ authorization: "Bearer " + SECRET }),
      ),
      false,
    );
    assert.equal(errorLogs.length, 0);
    assert.equal(loggedText().includes(SECRET), false);
    assert.equal(loggedText().includes("not-the-secret"), false);
  });

  test("rejects a different-length secret without throwing", () => {
    process.env.NODE_ENV = "production";
    process.env.FASTFIELD_WEBHOOK_SECRET = "short";

    assert.equal(
      authorizeFastFieldRequest(
        request({ "x-boilerops-secret": "short-but-longer" }),
      ),
      false,
    );
    assert.equal(
      authorizeFastFieldRequest(request({ "x-boilerops-secret": "no" })),
      false,
    );
    assert.equal(errorLogs.length, 0);

    const source = readFileSync(
      new URL("./webhook-auth.ts", import.meta.url),
      "utf8",
    );
    assert.match(source, /crypto\.timingSafeEqual/);
    assert.match(source, /Buffer\.alloc\(length\)/);
    assert.equal(source.includes("=== expected"), false);
    assert.equal(source.includes("!== expected"), false);
  });

  test("does not accept the secret from the query string", () => {
    process.env.NODE_ENV = "production";
    process.env.FASTFIELD_WEBHOOK_SECRET = SECRET;

    const url =
      "https://boilerops.example/api/fastfield/submissions?x-boilerops-secret=" +
      encodeURIComponent(SECRET);
    assert.equal(authorizeFastFieldRequest(request(undefined, url)), false);
  });

  test("secret comparison is case-sensitive and trims surrounding whitespace", () => {
    process.env.NODE_ENV = "development";
    process.env.FASTFIELD_WEBHOOK_SECRET = `  ${SECRET}  `;

    assert.equal(
      authorizeFastFieldRequest(request({ "x-boilerops-secret": SECRET })),
      true,
    );
    assert.equal(
      authorizeFastFieldRequest(
        request({ "x-boilerops-secret": SECRET.toUpperCase() }),
      ),
      false,
    );
  });

  test("unset secret in production fails closed and logs the misconfiguration", () => {
    process.env.NODE_ENV = "production";
    delete process.env.FASTFIELD_WEBHOOK_SECRET;
    process.env.FASTFIELD_WEBHOOK_ALLOW_INSECURE_DEV = "true";

    assert.equal(
      authorizeFastFieldRequest(
        request({ "x-boilerops-secret": PROVIDED }),
      ),
      false,
    );
    assert.equal(warnLogs.length, 0);
    assert.equal(errorLogs.length, 1);
    assert.match(errorLogs[0], /FASTFIELD_WEBHOOK_SECRET/);
    assert.match(errorLogs[0], /misconfigured|missing or empty/i);
    assert.match(errorLogs[0], /FASTFIELD_WEBHOOK_ALLOW_INSECURE_DEV/);
    assert.match(errorLogs[0], /ignored/i);
    assert.equal(errorLogs[0].includes(PROVIDED), false);
  });

  test("whitespace-only secret in production fails closed", () => {
    process.env.NODE_ENV = "production";
    process.env.FASTFIELD_WEBHOOK_SECRET = "   ";

    assert.equal(authorizeFastFieldRequest(request()), false);
    assert.match(errorLogs[0], /missing or empty/);
    assert.equal(errorLogs[0].includes("   "), false);
  });

  test("dev bypass accepts unauthenticated requests only outside production", () => {
    process.env.NODE_ENV = "development";
    delete process.env.FASTFIELD_WEBHOOK_SECRET;
    process.env.FASTFIELD_WEBHOOK_ALLOW_INSECURE_DEV = "true";

    assert.equal(
      authorizeFastFieldRequest(
        request({ "x-boilerops-secret": PROVIDED }),
      ),
      true,
    );
    assert.equal(errorLogs.length, 0);
    assert.equal(warnLogs.length, 1);
    assert.match(warnLogs[0], /FASTFIELD_WEBHOOK_ALLOW_INSECURE_DEV/);
    assert.equal(warnLogs[0].includes(PROVIDED), false);
  });

  test("dev bypass flag is case-insensitive true and is not implied by other values", () => {
    process.env.NODE_ENV = "development";

    process.env.FASTFIELD_WEBHOOK_ALLOW_INSECURE_DEV = "TRUE";
    assert.equal(authorizeFastFieldRequest(request()), true);

    warnLogs.length = 0;
    process.env.FASTFIELD_WEBHOOK_ALLOW_INSECURE_DEV = "1";
    assert.equal(authorizeFastFieldRequest(request()), false);
    assert.match(errorLogs.at(-1) ?? "", /FASTFIELD_WEBHOOK_ALLOW_INSECURE_DEV/);

    process.env.FASTFIELD_WEBHOOK_ALLOW_INSECURE_DEV = "false";
    assert.equal(authorizeFastFieldRequest(request()), false);
  });

  test("empty secret outside production rejects when the dev bypass is off", () => {
    process.env.NODE_ENV = "development";
    delete process.env.FASTFIELD_WEBHOOK_SECRET;

    assert.equal(
      authorizeFastFieldRequest(
        request({ "x-boilerops-secret": PROVIDED }),
      ),
      false,
    );
    assert.equal(warnLogs.length, 0);
    assert.match(errorLogs[0], /FASTFIELD_WEBHOOK_SECRET/);
    assert.match(errorLogs[0], /local development/i);
    assert.equal(errorLogs[0].includes(PROVIDED), false);
  });

  test("a configured secret is required even when the dev bypass flag is set", () => {
    process.env.NODE_ENV = "development";
    process.env.FASTFIELD_WEBHOOK_SECRET = SECRET;
    process.env.FASTFIELD_WEBHOOK_ALLOW_INSECURE_DEV = "true";

    assert.equal(authorizeFastFieldRequest(request()), false);
    assert.equal(
      authorizeFastFieldRequest(
        request({ "x-boilerops-secret": "wrong" }),
      ),
      false,
    );
    assert.equal(
      authorizeFastFieldRequest(
        request({ "x-boilerops-secret": SECRET }),
      ),
      true,
    );
    assert.equal(warnLogs.length, 0);
    assert.equal(errorLogs.length, 0);
  });

  test("webhook routes share this helper and do not read the secret themselves", () => {
    const here = fileURLToPath(new URL(".", import.meta.url));
    const srcRoot = join(here, "..", "..");
    const submissions = readFileSync(
      join(srcRoot, "app/api/fastfield/submissions/route.ts"),
      "utf8",
    );
    const sample = readFileSync(
      join(srcRoot, "app/api/fastfield/sample/route.ts"),
      "utf8",
    );

    for (const source of [submissions, sample]) {
      assert.match(source, /authorizeFastFieldRequest/);
      assert.match(source, /@\/lib\/fastfield\/webhook-auth/);
      assert.equal(source.includes("process.env.FASTFIELD_WEBHOOK_SECRET"), false);
      assert.equal(source.includes("timingSafeEqual"), false);
    }

    const authAt = submissions.indexOf("authorizeFastFieldRequest(request)");
    const supabaseAt = submissions.indexOf("isSupabaseConfigured()");
    assert.ok(authAt > 0);
    assert.ok(supabaseAt > authAt);

    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        if (entry === "node_modules" || entry === ".next") continue;
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.(ts|tsx|mts|js|mjs)$/.test(entry)) files.push(path);
      }
    };
    walk(srcRoot);

    const readers = files.filter((path) => {
      if (/\.test\.[cm]?[jt]s$/.test(path)) return false;
      const source = readFileSync(path, "utf8");
      return (
        source.includes("process.env.FASTFIELD_WEBHOOK_SECRET") ||
        source.includes("process.env[FASTFIELD_WEBHOOK_SECRET_ENV]") ||
        source.includes("process.env[FASTFIELD_WEBHOOK_DEV_BYPASS_ENV]")
      );
    });
    assert.deepEqual(
      readers.map((path) => path.slice(srcRoot.length + 1)).sort(),
      ["lib/fastfield/webhook-auth.ts"],
    );
  });
});
