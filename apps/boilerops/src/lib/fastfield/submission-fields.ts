import { ffPick, ffValue } from "./onboarding-mapper.ts";

/**
 * Read a FastField answer. A registry mapping wins, then the canonical key.
 * Field names for Inspection and Asset onboarding are not validated against
 * a live payload, so both stay in this one place.
 */
export function readMappedField(
  payload: Record<string, unknown>,
  mappings: Partial<Record<string, string>>,
  domainKey: string,
  canonicalKey: string,
): string | null {
  const mapped = mappings[domainKey]?.trim();
  const keys =
    mapped && mapped !== canonicalKey ? [mapped, canonicalKey] : [canonicalKey];
  return ffPick(payload, keys);
}

/**
 * Copy a value onto the payload when that key is blank. Generated ids use
 * `overwrite` so the saved BoilerOps id is what DataTables sync publishes.
 */
export function assignPayloadField(
  payload: Record<string, unknown>,
  key: string,
  value: string | null | undefined,
  overwrite = false,
): void {
  if (!value) return;
  if (!overwrite && ffValue(payload[key])) return;
  payload[key] = value;
}
