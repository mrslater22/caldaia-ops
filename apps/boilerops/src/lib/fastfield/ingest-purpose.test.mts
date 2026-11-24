import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  isRegisteredFormPurpose,
  pendingFormId,
  registrationFormId,
} from "./form-registration.ts";
import {
  classifyFastFieldSubmission,
  UNPROCESSED_PURPOSE,
} from "./ingest-purpose.ts";
import { payloadForSiteOnboardingSiteInfo } from "./site-info-payload.ts";
import { SUGGESTED_SITE_INFO_IDENTITY_FIELD_MAP } from "./site-info-sync-config.ts";
import {
  submissionHttpStatus,
  submissionResponseBody,
  type SubmissionResultView,
} from "./submission-response.ts";

function emptyResult(
  overrides: Partial<SubmissionResultView>,
): SubmissionResultView {
  return {
    duplicate: false,
    eventId: "evt-1",
    submissionId: "sub-1",
    formId: "999",
    purpose: UNPROCESSED_PURPOSE,
    sitePublicId: null,
    boilerPublicId: null,
    assetPublicIds: [],
    visitPublicId: null,
    siteVisitId: null,
    visitCreated: null,
    targetPublicId: null,
    targetCreated: null,
    deviceTestPublicId: null,
    deviceTestCreated: null,
    reportPublicId: null,
    reportStatus: null,
    reportDeviceCount: null,
    ...overrides,
  };
}

describe("unknown FastField forms", () => {
  test("does not default an unregistered form to boiler onboarding", () => {
    const classified = classifyFastFieldSubmission(
      { formId: "999", formName: "Mystery Form", submissionId: "sub-1" },
      null,
      {},
    );
    assert.equal(classified.unprocessed, true);
    assert.equal(classified.purpose, UNPROCESSED_PURPOSE);
    assert.notEqual(classified.purpose, "boiler_onboarding");
    assert.match(
      classified.warning ?? "",
      /not processed as boiler onboarding/,
    );
    assert.match(classified.warning ?? "", /Mystery Form/);
  });

  test("keeps a registered boiler form, site onboarding, and high pressure", () => {
    const boiler = classifyFastFieldSubmission(
      { formId: "10", formName: "Boiler Onboarding" },
      {
        purpose: "boiler_onboarding",
        name: "Boiler Onboarding",
        fastfield_form_id: "10",
        field_mappings_json: {},
      },
      {},
    );
    assert.equal(boiler.unprocessed, false);
    assert.equal(boiler.purpose, "boiler_onboarding");

    const site = classifyFastFieldSubmission(
      { formId: "1244818", formName: "Something else" },
      null,
      {},
    );
    assert.equal(site.purpose, "site_onboarding");

    const highPressure = classifyFastFieldSubmission(
      { formName: "High Pressure" },
      null,
      {},
    );
    assert.equal(highPressure.purpose, "high_pressure");
    assert.equal(highPressure.unprocessed, false);
  });

  test("accepts inspection and asset purposes and rejects an unknown registered purpose", () => {
    const inspection = classifyFastFieldSubmission(
      { formName: "Inspection Onboarding" },
      {
        purpose: "inspection_onboarding",
        name: "Inspection Onboarding",
        fastfield_form_id: pendingFormId("inspection_onboarding"),
        field_mappings_json: {},
      },
      {},
    );
    assert.equal(inspection.purpose, "inspection_onboarding");

    const asset = classifyFastFieldSubmission(
      { formName: "Asset Onboarding" },
      {
        purpose: "asset_onboarding",
        name: "Asset Onboarding",
        fastfield_form_id: "pending:asset_onboarding",
        field_mappings_json: {},
      },
      {},
    );
    assert.equal(asset.purpose, "asset_onboarding");

    const unknown = classifyFastFieldSubmission(
      { formId: "50", formName: "Future Form" },
      {
        purpose: "asset_test",
        name: "Future Form",
        fastfield_form_id: "50",
        field_mappings_json: {},
      },
      {},
    );
    assert.equal(unknown.unprocessed, true);
    assert.match(unknown.warning ?? "", /asset_test/);
    assert.match(unknown.warning ?? "", /not processed as boiler onboarding/);
  });

  test("webhook response for an unprocessed form is ok and does not throw", () => {
    const classified = classifyFastFieldSubmission(
      { formId: "999", formName: "Mystery Form" },
      null,
      {},
    );
    const body = submissionResponseBody(
      emptyResult({ warning: classified.warning, purpose: classified.purpose }),
      "https://boilerops.example",
    );
    assert.equal(body.ok, true);
    assert.equal(body.purpose, "unprocessed");
    assert.equal(body.site_public_id, null);
    assert.equal(body.urls, null);
    assert.match(String(body.warning), /not processed as boiler onboarding/);
    assert.equal(submissionHttpStatus({ duplicate: false }), 201);
    assert.equal(submissionHttpStatus({ duplicate: true }), 200);
  });
});

describe("form registration without a FastField id", () => {
  test("uses a pending id until a real form id is supplied", () => {
    assert.equal(
      registrationFormId("inspection_onboarding", "  "),
      "pending:inspection_onboarding",
    );
    assert.equal(registrationFormId("asset_onboarding", " 8841 "), "8841");
    assert.equal(isRegisteredFormPurpose("inspection_onboarding"), true);
    assert.equal(isRegisteredFormPurpose("asset_onboarding"), true);
    assert.equal(isRegisteredFormPurpose("boiler_onboarding"), true);
    assert.equal(isRegisteredFormPurpose(""), false);
  });
});

describe("site onboarding site info payload", () => {
  test("emits generated bo_siteid and bo_qrcode and fills blank identity keys", () => {
    const payload = payloadForSiteOnboardingSiteInfo(
      {
        site_code: "TST1",
        va_loc: "Already named",
        facility_name: "Ignored alias",
      },
      {
        bo_siteid: "site_generated",
        bo_qrcode: "https://boilerops.example/i/site/site_generated",
        site_code: "TST1",
        va_loc: "Tampa VA",
        va_contact: "Ada",
        va_contact_email: "ada@example.com",
        va_contact_phone: "813-555-0100",
      },
    );
    assert.equal(payload.bo_siteid, "site_generated");
    assert.equal(
      payload.bo_qrcode,
      "https://boilerops.example/i/site/site_generated",
    );
    assert.equal(payload.site_code, "TST1");
    assert.equal(payload.va_loc, "Already named");
    assert.equal(payload.va_contact, "Ada");
    assert.equal(payload.va_contact_email, "ada@example.com");
    assert.equal(payload.va_contact_phone, "813-555-0100");
    assert.deepEqual(SUGGESTED_SITE_INFO_IDENTITY_FIELD_MAP, {
      site_code: "site_code",
      va_loc: "va_loc",
      va_contact: "va_contact",
      va_contact_email: "va_contact_email",
      va_contact_phone: "va_contact_phone",
      bo_siteid: "bo_siteid",
      bo_qrcode: "bo_qrcode",
    });
  });

  test("replaces a submitted bo_siteid with the saved public id", () => {
    const payload = payloadForSiteOnboardingSiteInfo(
      { bo_siteid: "site_old", bo_qrcode: "https://old.example/qr" },
      {
        bo_siteid: "site_saved",
        bo_qrcode: "https://boilerops.example/i/site/site_saved",
        site_code: "TST1",
        va_loc: "Tampa VA",
        va_contact: null,
        va_contact_email: null,
        va_contact_phone: null,
      },
    );
    assert.equal(payload.bo_siteid, "site_saved");
    assert.equal(payload.bo_qrcode, "https://boilerops.example/i/site/site_saved");
    assert.equal(payload.va_contact, undefined);
  });
});
