import {
  plannedDevicePurpose,
  resolveDeviceForm,
  type RegisteredFormRef,
  type ResolvedDeviceForm,
} from "./device-form-config.ts";
import { extractFormId, extractFormName } from "./onboarding-mapper.ts";

/**
 * Purposes ingest will apply to domain tables. Anything else, including an
 * unregistered form, is stored and left for review. It is not boiler onboarding.
 */
export const PROCESS_PURPOSES = [
  "site_onboarding",
  "boiler_onboarding",
  "high_pressure",
  "low_pressure",
  "inspection_onboarding",
  "asset_onboarding",
] as const;

export const UNPROCESSED_PURPOSE = "unprocessed";

const PROCESS_PURPOSE_SET = new Set<string>(PROCESS_PURPOSES);

/** Known Site Onboarding form. Registration is preferred; this id still resolves. */
export const SITE_ONBOARDING_FORM_ID = "1244818";

type Env = Record<string, string | undefined>;

export type IngestClassification = {
  registered: RegisteredFormRef | null;
  purpose: string;
  deviceForm: ResolvedDeviceForm | null;
  /** True when the raw submission must be stored and not applied. */
  unprocessed: boolean;
  warning?: string;
};

export function isProcessPurpose(purpose: string): boolean {
  return PROCESS_PURPOSE_SET.has(purpose);
}

function isKnownSiteOnboarding(payload: Record<string, unknown>): boolean {
  const formId = extractFormId(payload);
  const formName = extractFormName(payload)?.toLowerCase();
  return formId === SITE_ONBOARDING_FORM_ID || formName === "site onboarding";
}

function unprocessedReason(
  payload: Record<string, unknown>,
  registered: RegisteredFormRef | null,
  rawPurpose: string | null,
): string {
  if (registered && rawPurpose && !isProcessPurpose(rawPurpose)) {
    return `Registered FastField form purpose ${JSON.stringify(rawPurpose)} is not a supported ingest purpose. The raw submission was stored for review and was not processed as boiler onboarding.`;
  }
  const formId = extractFormId(payload);
  const formName = extractFormName(payload);
  const identity = [
    formId ? `form id ${JSON.stringify(formId)}` : null,
    formName ? `form name ${JSON.stringify(formName)}` : null,
  ]
    .filter((part): part is string => Boolean(part))
    .join(" and ");
  const subject = identity || "this submission";
  return `No registered FastField form matched ${subject}. The raw submission was stored for review and was not processed as boiler onboarding.`;
}

/**
 * Decide which processor runs. Unregistered forms no longer fall through to
 * boiler onboarding. Site Onboarding's known form id, High Pressure's form
 * catalog, and an explicit registered purpose still resolve.
 */
export function classifyFastFieldSubmission(
  payload: Record<string, unknown>,
  registered: RegisteredFormRef | null,
  env: Env = process.env,
): IngestClassification {
  const deviceForm = resolveDeviceForm(payload, registered, env);
  const planned = deviceForm
    ? null
    : plannedDevicePurpose(payload, registered, env);
  const rawPurpose =
    deviceForm?.definition.purpose ??
    planned ??
    registered?.purpose ??
    (isKnownSiteOnboarding(payload) ? "site_onboarding" : null);
  const unprocessed = !rawPurpose || !isProcessPurpose(rawPurpose);
  const parts: string[] = [];

  if (unprocessed) {
    parts.push(unprocessedReason(payload, registered, rawPurpose));
  } else {
    if (!registered) {
      parts.push(
        `No registered FastField form matched this submission; inferred ${rawPurpose}.`,
      );
    }
    if (deviceForm?.purposeOverridden) {
      parts.push(
        `Registered purpose was "${registered?.purpose}". The form matched ${deviceForm.definition.displayName}, so it was ingested as ${deviceForm.definition.purpose}.`,
      );
    }
    if (deviceForm && deviceForm.ignoredMappingKeys.length > 0) {
      parts.push(
        `Ignored field mapping keys that are not device-form fields: ${deviceForm.ignoredMappingKeys.join(", ")}.`,
      );
    }
  }

  return {
    registered,
    purpose: unprocessed ? UNPROCESSED_PURPOSE : rawPurpose,
    deviceForm: unprocessed ? null : deviceForm,
    unprocessed,
    warning: parts.length ? parts.join(" ") : undefined,
  };
}
