import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  HIGH_PRESSURE_FIELD_KEYS,
  plannedDevicePurpose,
  resolveDeviceForm,
  SITE_VISIT_ID_COLUMN,
  SUGGESTED_LEGACY_SITE_INFO_FIELD_MAP,
  SUGGESTED_SITE_INFO_KEY_COLUMN,
} from "./device-form-config.ts";
import {
  canonicalAssetKey,
  mapDeviceSubmission,
  payloadForSiteInfoSync,
} from "./device-submission.ts";
import { SITE_INFO_FIELD_MAP } from "./site-info-sync-config.ts";
import { isUniqueViolation } from "./site-visit-repository.ts";
import {
  recordDeviceVisit,
  type DeviceTestRow,
  type InsertConflict,
  type ReportRow,
  type ReportSummary,
  type SiteRef,
  type SiteVisitRepository,
  type TargetRef,
  type VisitRow,
} from "./site-visit.ts";

const ORG = "00000000-0000-4000-8000-000000000001";

function site(overrides: Partial<SiteRef> = {}): SiteRef {
  return {
    id: "site-1",
    publicId: "site_abc",
    organizationId: ORG,
    siteCode: "CAP",
    facilityName: "Lovell",
    ...overrides,
  };
}

function hpPayload(extra: Record<string, unknown> = {}) {
  return {
    submissionId: "sub-1",
    formName: "High Pressure",
    formId: "9001",
    bo_siteid: "site_abc",
    site_code: "CAP",
    facility_name: "Lovell",
    site_visit_id: "VISIT-CAP-1",
    asset_id: "BLR1",
    asset_type: "boiler",
    ...extra,
  };
}

function createMemoryRepository(seed?: {
  sites?: SiteRef[];
  targets?: TargetRef[];
}): SiteVisitRepository & {
  visits: VisitRow[];
  tests: DeviceTestRow[];
  reports: ReportRow[];
  targets: TargetRef[];
} {
  const sites = [...(seed?.sites ?? [site()])];
  const targets = [...(seed?.targets ?? [])];
  const visits: VisitRow[] = [];
  const tests: DeviceTestRow[] = [];
  const reports: ReportRow[] = [];
  let sequence = 1;
  const nextId = () => `id-${sequence++}`;

  function conflict(): InsertConflict {
    return { conflict: true };
  }

  return {
    visits,
    tests,
    reports,
    targets,
    async findSiteByPublicId(organizationId, publicId) {
      return (
        sites.find(
          (item) =>
            item.organizationId === organizationId && item.publicId === publicId,
        ) ?? null
      );
    },
    async findSiteByCode(organizationId, siteCode) {
      return (
        sites.find(
          (item) =>
            item.organizationId === organizationId &&
            item.siteCode === siteCode.toUpperCase(),
        ) ?? null
      );
    },
    async findTargetByPublicId(publicId) {
      return targets.find((item) => item.publicId === publicId) ?? null;
    },
    async findTargetByCode(siteId, targetCode) {
      return (
        targets.find(
          (item) => item.siteId === siteId && item.targetCode === targetCode,
        ) ?? null
      );
    },
    async findTargetByDisplayName(siteId, displayName) {
      return (
        targets.find(
          (item) => item.siteId === siteId && item.displayName === displayName,
        ) ?? null
      );
    },
    async insertTarget(input) {
      if (
        targets.some(
          (item) => item.siteId === input.siteId && item.targetCode === input.targetCode,
        )
      ) {
        return conflict();
      }
      const row: TargetRef = {
        id: nextId(),
        publicId: input.publicId,
        siteId: input.siteId,
        organizationId: input.organizationId,
        targetType: input.targetType,
        targetCode: input.targetCode,
        displayName: input.displayName,
      };
      targets.push(row);
      return row;
    },
    async findVisitById(id) {
      return visits.find((item) => item.id === id) ?? null;
    },
    async findVisitByExternalId(organizationId, externalVisitId) {
      return (
        visits.find(
          (item) =>
            item.organizationId === organizationId &&
            item.externalVisitId === externalVisitId,
        ) ?? null
      );
    },
    async insertVisit(input) {
      if (
        visits.some(
          (item) =>
            item.organizationId === input.organizationId &&
            item.externalVisitId === input.externalVisitId,
        ) ||
        visits.some((item) => item.publicId === input.publicId)
      ) {
        return conflict();
      }
      const row: VisitRow = {
        id: nextId(),
        publicId: input.publicId,
        organizationId: input.organizationId,
        siteId: input.siteId,
        sitePublicId: input.sitePublicId,
        externalVisitId: input.externalVisitId,
        status: "open",
      };
      visits.push(row);
      return row;
    },
    async markVisitReportReady(id) {
      const visit = visits.find((item) => item.id === id);
      if (!visit) throw new Error("missing visit");
      visit.status = "report_ready";
    },
    async findTestBySubmission(submissionId) {
      return tests.find((item) => item.fastfieldSubmissionId === submissionId) ?? null;
    },
    async findTestByAsset(siteVisitId, deviceType, assetKey) {
      return (
        tests.find(
          (item) =>
            item.siteVisitId === siteVisitId &&
            item.deviceType === deviceType &&
            item.assetKey === assetKey,
        ) ?? null
      );
    },
    async insertTest(input) {
      if (
        tests.some((item) => item.fastfieldSubmissionId === input.fastfieldSubmissionId) ||
        tests.some(
          (item) =>
            item.siteVisitId === input.siteVisitId &&
            item.deviceType === input.deviceType &&
            item.assetKey === input.assetKey,
        )
      ) {
        return conflict();
      }
      const row: DeviceTestRow = {
        id: nextId(),
        publicId: input.publicId,
        siteVisitId: input.siteVisitId,
        organizationId: input.organizationId,
        siteId: input.siteId,
        deviceType: input.deviceType,
        assetKey: input.assetKey,
        inspectionTargetId: input.inspectionTargetId,
        targetPublicId: input.targetPublicId,
        fastfieldSubmissionId: input.fastfieldSubmissionId,
        fastfieldFormId: input.fastfieldFormId,
      };
      tests.push(row);
      return row;
    },
    async listTests(siteVisitId) {
      return tests.filter((item) => item.siteVisitId === siteVisitId);
    },
    async findReport(siteVisitId) {
      return reports.find((item) => item.siteVisitId === siteVisitId) ?? null;
    },
    async insertReport(input) {
      if (reports.some((item) => item.siteVisitId === input.siteVisitId)) {
        return conflict();
      }
      const row: ReportRow = {
        id: nextId(),
        publicId: input.publicId,
        siteVisitId: input.siteVisitId,
        organizationId: input.organizationId,
        siteId: input.siteId,
        status: "ready",
        deviceTestCount: input.deviceTestCount,
        summary: input.summary,
      };
      reports.push(row);
      return row;
    },
    async updateReport(id, input) {
      const row = reports.find((item) => item.id === id);
      if (!row) throw new Error("missing report");
      row.deviceTestCount = input.deviceTestCount;
      row.summary = input.summary;
      row.status = "ready";
      return row;
    },
  };
}

let publicSequence = 1;
function sequentialPublicId(prefix: "site" | "target" | "asset" | "job" | "report" | "blr" | "visit" | "dtest") {
  publicSequence += 1;
  return `${prefix}_seq${publicSequence}`;
}

function definition() {
  const resolved = resolveDeviceForm(hpPayload(), null, {});
  assert.ok(resolved);
  return resolved.definition;
}

describe("High Pressure form mapping", () => {
  test("reads placeholder keys, including a one-element array", () => {
    const mapped = mapDeviceSubmission(
      hpPayload({ asset_id: ["BLR1"], contact_phone: ["555"] }),
      definition(),
    );
    assert.equal(mapped.assetId, "BLR1");
    assert.equal(mapped.assetKey, "BLR1");
    assert.equal(mapped.siteVisitId, "VISIT-CAP-1");
    assert.equal(mapped.sitePublicId, "site_abc");
    assert.equal(mapped.siteCode, "CAP");
    assert.equal(mapped.assetType, "boiler");
    assert.equal(mapped.contactPhone, "555");
  });

  test("reads nested answers and treats plant as the asset type", () => {
    const mapped = mapDeviceSubmission(
      {
        formName: "High Pressure",
        fields: {
          asset_id: "plant-east",
          asset_type: "plant",
          bo_siteid: "site_abc",
          site_visit_id: "VISIT-CAP-1",
        },
      },
      definition(),
    );
    assert.equal(mapped.assetId, "plant-east");
    assert.equal(mapped.assetKey, "plant-east");
    assert.equal(mapped.assetType, "plant");
  });

  test("normalizes a target code and keeps a free-form asset id", () => {
    assert.equal(canonicalAssetKey(" blr1 "), "BLR1");
    assert.equal(canonicalAssetKey("target_abc"), "target_abc");
    assert.equal(canonicalAssetKey("boiler 1"), "boiler 1");
  });

  test("requires the asset id", () => {
    assert.throws(
      () => mapDeviceSubmission(hpPayload({ asset_id: "  " }), definition()),
      /asset_id/,
    );
  });

  test("promotes a blank visit id without overwriting a top-level site id", () => {
    const payload = {
      formName: "High Pressure",
      bo_siteid: "site_keep",
      fields: {
        bo_siteid: "site_nested",
        facility_name: "From nested",
        asset_id: "BLR1",
        site_code: "CAP",
      },
    };
    const mapped = mapDeviceSubmission(payload, definition());
    assert.equal(mapped.sitePublicId, "site_keep");
    assert.equal(mapped.facilityName, "From nested");
    const stamped = payloadForSiteInfoSync(
      payload,
      definition(),
      "VISIT-CAP-1",
      mapped,
    );
    assert.equal(stamped.bo_siteid, "site_keep");
    assert.equal(stamped.site_visit_id, "VISIT-CAP-1");
    assert.equal(stamped.facility_name, "From nested");
  });
});

describe("High Pressure form identification", () => {
  test("matches the form name and the configured form id", () => {
    const byName = resolveDeviceForm({ formName: " high   pressure " }, null, {});
    assert.equal(byName?.definition.purpose, "high_pressure");
    const byId = resolveDeviceForm(
      { formId: 42, formName: "Something else" },
      null,
      { FASTFIELD_HP_FORM_ID: "42" },
    );
    assert.equal(byId?.definition.deviceType, "high_pressure");
    assert.equal(resolveDeviceForm({ formName: "Boiler Onboarding" }, null, {}), null);
  });

  test("uses registry and env field overrides, and flags a mismatched purpose", () => {
    const resolved = resolveDeviceForm(
      { formName: "High Pressure" },
      {
        purpose: "boiler_onboarding",
        name: "High Pressure",
        fastfield_form_id: "9001",
        field_mappings_json: {
          assetId: "boiler_tag",
          not_a_domain_field: "ignored",
        },
      },
      { FASTFIELD_HP_FIELD_MAP: JSON.stringify({ siteVisitId: "visit_key" }) },
    );
    assert.equal(resolved?.purposeOverridden, true);
    assert.equal(resolved?.definition.fields.assetId, "boiler_tag");
    assert.equal(resolved?.definition.fields.siteVisitId, "visit_key");
    assert.deepEqual(resolved?.ignoredMappingKeys, ["not_a_domain_field"]);
  });

  test("rejects a broken field map and does not treat Low Pressure as High Pressure", () => {
    assert.throws(
      () =>
        resolveDeviceForm({ formName: "High Pressure" }, null, {
          FASTFIELD_HP_FIELD_MAP: "{",
        }),
      /FASTFIELD_HP_FIELD_MAP/,
    );
    assert.equal(
      resolveDeviceForm({ formName: "Low Pressure" }, null, {}),
      null,
    );
    assert.equal(
      plannedDevicePurpose({ formName: "Low Pressure" }, null, {}),
      "low_pressure",
    );
  });

  test("leaves the live site-info map empty and documents the visit column", () => {
    assert.deepEqual(SITE_INFO_FIELD_MAP, {});
    assert.equal(SUGGESTED_SITE_INFO_KEY_COLUMN, "bo_siteid");
    assert.equal(
      SUGGESTED_LEGACY_SITE_INFO_FIELD_MAP[SITE_VISIT_ID_COLUMN],
      HIGH_PRESSURE_FIELD_KEYS.siteVisitId,
    );
  });
});

describe("site visit recording", () => {
  test("creates a visit, target, test, and ready report", async () => {
    const repository = createMemoryRepository();
    const mapped = mapDeviceSubmission(hpPayload(), definition());
    const result = await recordDeviceVisit({
      organizationId: ORG,
      submissionId: "sub-1",
      formId: "9001",
      mapped,
      repository,
      newPublicId: sequentialPublicId,
    });

    assert.equal(result.visitCreated, true);
    assert.equal(result.targetCreated, true);
    assert.equal(result.testCreated, true);
    assert.equal(result.externalVisitId, "VISIT-CAP-1");
    assert.equal(result.reportStatus, "ready");
    assert.equal(result.reportDeviceCount, 1);
    assert.equal(repository.visits.length, 1);
    assert.equal(repository.visits[0]?.status, "report_ready");
    assert.equal(repository.targets[0]?.targetCode, "BLR1");
    assert.equal(repository.targets[0]?.targetType, "boiler");
    assert.equal(repository.reports.length, 1);
    const summary = repository.reports[0]?.summary as ReportSummary;
    assert.equal(summary.device_tests.length, 1);
    assert.equal(summary.device_tests[0]?.asset_key, "BLR1");
  });

  test("a repeated submission does not create another visit or test", async () => {
    const repository = createMemoryRepository();
    const mapped = mapDeviceSubmission(hpPayload(), definition());
    const first = await recordDeviceVisit({
      organizationId: ORG,
      submissionId: "sub-1",
      formId: "9001",
      mapped,
      repository,
      newPublicId: sequentialPublicId,
    });
    const second = await recordDeviceVisit({
      organizationId: ORG,
      submissionId: "sub-1",
      formId: "9001",
      mapped,
      repository,
      newPublicId: sequentialPublicId,
    });

    assert.equal(second.visitCreated, false);
    assert.equal(second.testCreated, false);
    assert.equal(second.visitPublicId, first.visitPublicId);
    assert.equal(second.testPublicId, first.testPublicId);
    assert.equal(second.reportPublicId, first.reportPublicId);
    assert.equal(repository.visits.length, 1);
    assert.equal(repository.tests.length, 1);
    assert.equal(repository.reports.length, 1);
    assert.equal(second.reportDeviceCount, 1);
  });

  test("several devices share one visit and one report", async () => {
    const repository = createMemoryRepository();
    const first = await recordDeviceVisit({
      organizationId: ORG,
      submissionId: "sub-1",
      formId: "9001",
      mapped: mapDeviceSubmission(hpPayload(), definition()),
      repository,
      newPublicId: sequentialPublicId,
    });
    const second = await recordDeviceVisit({
      organizationId: ORG,
      submissionId: "sub-2",
      formId: "9001",
      mapped: mapDeviceSubmission(
        hpPayload({ submissionId: "sub-2", asset_id: "blr2" }),
        definition(),
      ),
      repository,
      newPublicId: sequentialPublicId,
    });

    assert.equal(second.visitCreated, false);
    assert.equal(second.visitPublicId, first.visitPublicId);
    assert.equal(second.testCreated, true);
    assert.notEqual(second.testPublicId, first.testPublicId);
    assert.equal(second.reportPublicId, first.reportPublicId);
    assert.equal(second.reportDeviceCount, 2);
    assert.equal(repository.visits.length, 1);
    assert.equal(repository.tests.length, 2);
    assert.equal(repository.reports.length, 1);
    assert.deepEqual(
      repository.reports[0]?.summary.device_tests.map((item) => item.asset_key),
      ["BLR1", "BLR2"],
    );
  });

  test("the same asset on the same visit does not create a second test", async () => {
    const repository = createMemoryRepository();
    await recordDeviceVisit({
      organizationId: ORG,
      submissionId: "sub-1",
      formId: null,
      mapped: mapDeviceSubmission(hpPayload(), definition()),
      repository,
      newPublicId: sequentialPublicId,
    });
    const again = await recordDeviceVisit({
      organizationId: ORG,
      submissionId: "sub-9",
      formId: null,
      mapped: mapDeviceSubmission(
        hpPayload({ submissionId: "sub-9", asset_id: "blr1" }),
        definition(),
      ),
      repository,
      newPublicId: sequentialPublicId,
    });
    assert.equal(again.testCreated, false);
    assert.equal(repository.tests.length, 1);
    assert.equal(again.reportDeviceCount, 1);
  });

  test("a different visit id creates a different visit", async () => {
    const repository = createMemoryRepository();
    const first = await recordDeviceVisit({
      organizationId: ORG,
      submissionId: "sub-1",
      formId: null,
      mapped: mapDeviceSubmission(hpPayload(), definition()),
      repository,
      newPublicId: sequentialPublicId,
    });
    const second = await recordDeviceVisit({
      organizationId: ORG,
      submissionId: "sub-2",
      formId: null,
      mapped: mapDeviceSubmission(
        hpPayload({ submissionId: "sub-2", site_visit_id: "VISIT-CAP-2", asset_id: "BLR1" }),
        definition(),
      ),
      repository,
      newPublicId: sequentialPublicId,
    });
    assert.equal(second.visitCreated, true);
    assert.notEqual(second.externalVisitId, first.externalVisitId);
    assert.equal(repository.visits.length, 2);
    assert.equal(repository.tests.length, 2);
  });

  test("a blank visit id is minted once and reused by the next device", async () => {
    const repository = createMemoryRepository();
    const first = await recordDeviceVisit({
      organizationId: ORG,
      submissionId: "sub-1",
      formId: null,
      mapped: mapDeviceSubmission(hpPayload({ site_visit_id: "" }), definition()),
      repository,
      newPublicId: sequentialPublicId,
    });
    assert.match(first.externalVisitId, /^visit_/);
    assert.equal(first.visitPublicId, first.externalVisitId);
    const second = await recordDeviceVisit({
      organizationId: ORG,
      submissionId: "sub-2",
      formId: null,
      mapped: mapDeviceSubmission(
        hpPayload({
          submissionId: "sub-2",
          site_visit_id: first.externalVisitId,
          asset_id: "BLR2",
        }),
        definition(),
      ),
      repository,
      newPublicId: sequentialPublicId,
    });
    assert.equal(second.visitCreated, false);
    assert.equal(second.visitPublicId, first.visitPublicId);
    assert.equal(repository.visits.length, 1);
  });

  test("reuses an existing target and refuses an unknown target public id", async () => {
    const existing: TargetRef = {
      id: "target-row",
      publicId: "target_known",
      siteId: "site-1",
      organizationId: ORG,
      targetType: "boiler",
      targetCode: "BLR9",
      displayName: "Existing",
    };
    const repository = createMemoryRepository({ targets: [existing] });
    const reused = await recordDeviceVisit({
      organizationId: ORG,
      submissionId: "sub-1",
      formId: null,
      mapped: mapDeviceSubmission(hpPayload({ asset_id: "target_known" }), definition()),
      repository,
      newPublicId: sequentialPublicId,
    });
    assert.equal(reused.targetCreated, false);
    assert.equal(reused.targetPublicId, "target_known");
    assert.equal(repository.targets.length, 1);

    await assert.rejects(
      () =>
        recordDeviceVisit({
          organizationId: ORG,
          submissionId: "sub-2",
          formId: null,
          mapped: mapDeviceSubmission(
            hpPayload({ submissionId: "sub-2", asset_id: "target_missing" }),
            definition(),
          ),
          repository,
          newPublicId: sequentialPublicId,
        }),
      /Unknown asset id/,
    );
  });

  test("refuses a missing site and an unknown site public id", async () => {
    const repository = createMemoryRepository({ sites: [] });
    await assert.rejects(
      () =>
        recordDeviceVisit({
          organizationId: ORG,
          submissionId: "sub-1",
          formId: null,
          mapped: mapDeviceSubmission(hpPayload(), definition()),
          repository,
          newPublicId: sequentialPublicId,
        }),
      /Unknown site id/,
    );
    await assert.rejects(
      () =>
        recordDeviceVisit({
          organizationId: ORG,
          submissionId: "sub-2",
          formId: null,
          mapped: mapDeviceSubmission(
            hpPayload({ submissionId: "sub-2", bo_siteid: "", site_code: "" }),
            definition(),
          ),
          repository,
          newPublicId: sequentialPublicId,
        }),
      /missing bo_siteid and site_code/,
    );
  });

  test("finds the site by code when the public id is absent", async () => {
    const repository = createMemoryRepository();
    const result = await recordDeviceVisit({
      organizationId: ORG,
      submissionId: "sub-1",
      formId: null,
      mapped: mapDeviceSubmission(
        hpPayload({ bo_siteid: "", site_code: "cap" }),
        definition(),
      ),
      repository,
      newPublicId: sequentialPublicId,
    });
    assert.equal(result.sitePublicId, "site_abc");
  });
});

describe("database unique violations", () => {
  test("recognizes postgres unique errors", () => {
    assert.equal(isUniqueViolation({ code: "23505", message: "duplicate key" }), true);
    assert.equal(isUniqueViolation({ message: "unique constraint failed" }), true);
    assert.equal(isUniqueViolation({ message: "permission denied" }), false);
    assert.equal(isUniqueViolation(null), false);
  });
});
