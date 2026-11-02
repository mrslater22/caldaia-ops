import * as crypto from "crypto";

/** Preferred header FastField should send on inbound webhooks. */
export const FASTFIELD_WEBHOOK_SECRET_HEADER = "x-boilerops-secret";

/**
 * Headers accepted in addition to the preferred header.
 * Any one of them may carry the secret. The secret is never read from the URL.
 */
const SECRET_HEADERS = [
  FASTFIELD_WEBHOOK_SECRET_HEADER,
  "x-api-key",
  "x-fastfield-secret",
] as const;

export const FASTFIELD_WEBHOOK_SECRET_ENV = "FASTFIELD_WEBHOOK_SECRET";

/**
 * Explicit local opt-in. Honored only when NODE_ENV is not production and
 * FASTFIELD_WEBHOOK_SECRET is unset. Ignored in production.
 */
export const FASTFIELD_WEBHOOK_DEV_BYPASS_ENV =
  "FASTFIELD_WEBHOOK_ALLOW_INSECURE_DEV";

const MISSING_SECRET_PRODUCTION_LOG =
  "FastField webhook authentication is misconfigured: FASTFIELD_WEBHOOK_SECRET is missing or empty. Inbound FastField webhook requests are rejected until the secret is set. FASTFIELD_WEBHOOK_ALLOW_INSECURE_DEV is ignored when NODE_ENV=production.";

const MISSING_SECRET_DEVELOPMENT_LOG =
  "FastField webhook authentication is misconfigured: FASTFIELD_WEBHOOK_SECRET is missing or empty. Inbound FastField webhook requests are rejected. Set FASTFIELD_WEBHOOK_SECRET, or set FASTFIELD_WEBHOOK_ALLOW_INSECURE_DEV=true to accept unauthenticated webhooks in local development only. That flag is ignored when NODE_ENV=production.";

const DEV_BYPASS_LOG =
  "FastField webhook dev bypass is active because FASTFIELD_WEBHOOK_ALLOW_INSECURE_DEV=true and FASTFIELD_WEBHOOK_SECRET is unset. Accepting this inbound webhook without a secret. This bypass is ignored when NODE_ENV=production.";

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

function configuredSecret(): string {
  return process.env[FASTFIELD_WEBHOOK_SECRET_ENV]?.trim() ?? "";
}

function devBypassEnabled(): boolean {
  if (isProduction()) return false;
  const flag = process.env[FASTFIELD_WEBHOOK_DEV_BYPASS_ENV]?.trim().toLowerCase();
  return flag === "true";
}

/**
 * Compare two strings with crypto.timingSafeEqual.
 * Both sides are padded to the same length first so a length mismatch
 * cannot throw and cannot skip the comparison.
 */
function secretsEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  const length = Math.max(leftBuffer.length, rightBuffer.length);
  if (length === 0) {
    return true;
  }

  const leftPadded = Buffer.alloc(length);
  const rightPadded = Buffer.alloc(length);
  leftBuffer.copy(leftPadded);
  rightBuffer.copy(rightPadded);

  const bytesMatch = crypto.timingSafeEqual(leftPadded, rightPadded);
  return bytesMatch && leftBuffer.length === rightBuffer.length;
}

function headerCandidates(request: Request): string[] {
  const values: string[] = [];
  for (const name of SECRET_HEADERS) {
    const value = request.headers.get(name)?.trim();
    if (value) values.push(value);
  }
  return values;
}

function basicAuthPassword(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;

  const prefix = /^Basic\s+/i.exec(header);
  if (!prefix) return null;

  const encoded = header.slice(prefix[0].length).trim();
  if (!encoded) return null;

  const decoded = Buffer.from(encoded, "base64").toString("utf8");
  const separator = decoded.indexOf(":");
  if (separator < 0) return null;

  const password = decoded.slice(separator + 1).trim();
  return password.length > 0 ? password : null;
}

/**
 * Authorize one inbound FastField webhook.
 * Returns false when the secret is missing, wrong, or unset.
 * In production an unset secret fails closed and is logged without the
 * secret or the caller-supplied value.
 */
export function authorizeFastFieldRequest(request: Request): boolean {
  const expected = configuredSecret();
  if (!expected) {
    if (devBypassEnabled()) {
      console.warn(DEV_BYPASS_LOG);
      return true;
    }

    console.error(
      isProduction()
        ? MISSING_SECRET_PRODUCTION_LOG
        : MISSING_SECRET_DEVELOPMENT_LOG,
    );
    return false;
  }

  const candidates = headerCandidates(request);
  const password = basicAuthPassword(request);
  if (password) candidates.push(password);
  if (candidates.length === 0) return false;

  let matched = false;
  for (const candidate of candidates) {
    if (secretsEqual(candidate, expected)) matched = true;
  }
  return matched;
}
