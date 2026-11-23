import { createHash } from "crypto";
import type { MappedDeviceSubmission } from "./device-submission.ts";
import { makePublicId } from "../public-id.ts";

export type SiteRef = {
  id: string;
  publicId: string;
  organizationId: string;
  siteCode: string;
  facilityName: string;
};

export type TargetRef = {
  id: string;
  publicId: string;
  siteId: string;
  organizationId: string;
  targetType: "boiler" | "plant";
  targetCode: string;
  displayName: string;
};

export type VisitRow = {
  id: string;
  publicId: string;
  organizationId: string;
  siteId: string;
  sitePublicId: string;
  externalVisitId: string;
  status: "open" | "report_ready";
};

export type DeviceTestRow = {
  id: string;
  publicId: string;
  siteVisitId: string;
  organizationId: string;
  siteId: string;
  deviceType: "high_pressure" | "low_pressure";
  assetKey: string;
  inspectionTargetId: string;
  targetPublicId: string;
  fastfieldSubmissionId: string;
  fastfieldFormId: string | null;
};

export type ReportSummary = {
  device_tests: Array<{
    public_id: string;
    device_type: string;
    asset_key: string;
    target_public_id: string;
    fastfield_submission_id: string;
  }>;
};

export type ReportRow = {
  id: string;
  publicId: string;
  siteVisitId: string;
  organizationId: string;
  siteId: string;
  status: "ready";
  deviceTestCount: number;
  summary: ReportSummary;
};

export type InsertConflict = { conflict: true };

export type SiteVisitRepository = {
  findSiteByPublicId(
    organizationId: string,
    publicId: string,
  ): Promise<SiteRef | null>;
  findSiteByCode(
    organizationId: string,
    siteCode: string,
  ): Promise<SiteRef | null>;
  findTargetByPublicId(publicId: string): Promise<TargetRef | null>;
  findTargetByCode(siteId: string, targetCode: string): Promise<TargetRef | null>;
  findTargetByDisplayName(
    siteId: string,
    displayName: string,
  ): Promise<TargetRef | null>;
  insertTarget(input: {
    publicId: string;
    organizationId: string;
    siteId: string;
    targetType: "boiler" | "plant";
    targetCode: string;
    displayName: string;
  }): Promise<TargetRef | InsertConflict>;
  findVisitById(id: string): Promise<VisitRow | null>;
  findVisitByExternalId(
    organizationId: string,
    externalVisitId: string,
  ): Promise<VisitRow | null>;
  insertVisit(input: {
    publicId: string;
    organizationId: string;
    siteId: string;
    sitePublicId: string;
    externalVisitId: string;
  }): Promise<VisitRow | InsertConflict>;
  markVisitReportReady(id: string): Promise<void>;
  findTestBySubmission(submissionId: string): Promise<DeviceTestRow | null>;
  findTestByAsset(
    siteVisitId: string,
    deviceType: string,
    assetKey: string,
  ): Promise<DeviceTestRow | null>;
  insertTest(input: {
    publicId: string;
    siteVisitId: string;
    organizationId: string;
    siteId: string;
    deviceType: "high_pressure";
    assetKey: string;
    inspectionTargetId: string;
    targetPublicId: string;
    fastfieldSubmissionId: string;
    fastfieldFormId: string | null;
    mapped: MappedDeviceSubmission;
  }): Promise<DeviceTestRow | InsertConflict>;
  listTests(siteVisitId: string): Promise<DeviceTestRow[]>;
  findReport(siteVisitId: string): Promise<ReportRow | null>;
  insertReport(input: {
    publicId: string;
    siteVisitId: string;
    organizationId: string;
    siteId: string;
    deviceTestCount: number;
    summary: ReportSummary;
  }): Promise<ReportRow | InsertConflict>;
  updateReport(
    id: string,
    input: { deviceTestCount: number; summary: ReportSummary },
  ): Promise<ReportRow>;
};

export type RecordDeviceVisitInput = {
  organizationId: string;
  submissionId: string;
  formId: string | null;
  mapped: MappedDeviceSubmission;
  repository: SiteVisitRepository;
  newPublicId?: typeof makePublicId;
};

export type RecordDeviceVisitResult = {
  sitePublicId: string;
  visitPublicId: string;
  externalVisitId: string;
  visitCreated: boolean;
  targetPublicId: string;
  targetCreated: boolean;
  testPublicId: string;
  testCreated: boolean;
  reportPublicId: string;
  reportStatus: "ready";
  reportDeviceCount: number;
};

function summaryFor(tests: DeviceTestRow[]): ReportSummary {
  return {
    device_tests: tests.map((test) => ({
      public_id: test.publicId,
      device_type: test.deviceType,
      asset_key: test.assetKey,
      target_public_id: test.targetPublicId,
      fastfield_submission_id: test.fastfieldSubmissionId,
    })),
  };
}

async function saveReport(
  repository: SiteVisitRepository,
  visit: VisitRow,
  tests: DeviceTestRow[],
  newPublicId: typeof makePublicId,
): Promise<ReportRow> {
  const summary = summaryFor(tests);
  const existing = await repository.findReport(visit.id);
  if (existing) {
    return repository.updateReport(existing.id, {
      deviceTestCount: tests.length,
      summary,
    });
  }
  const inserted = await repository.insertReport({
    publicId: newPublicId("report"),
    siteVisitId: visit.id,
    organizationId: visit.organizationId,
    siteId: visit.siteId,
    deviceTestCount: tests.length,
    summary,
  });
  if (!("conflict" in inserted)) {
    await repository.markVisitReportReady(visit.id);
    return inserted;
  }
  const afterConflict = await repository.findReport(visit.id);
  if (!afterConflict) {
    throw new Error("Site visit report conflicted, but the report row was not found.");
  }
  const updated = await repository.updateReport(afterConflict.id, {
    deviceTestCount: tests.length,
    summary,
  });
  await repository.markVisitReportReady(visit.id);
  return updated;
}

async function finishFromTest(
  repository: SiteVisitRepository,
  test: DeviceTestRow,
  newPublicId: typeof makePublicId,
  flags: { visitCreated: boolean; targetCreated: boolean; testCreated: boolean },
): Promise<RecordDeviceVisitResult> {
  const visit = await repository.findVisitById(test.siteVisitId);
  if (!visit) {
    throw new Error("Device test is missing its site visit.");
  }
  const tests = await repository.listTests(visit.id);
  const report = await saveReport(repository, visit, tests, newPublicId);
  return {
    sitePublicId: visit.sitePublicId,
    visitPublicId: visit.publicId,
    externalVisitId: visit.externalVisitId,
    visitCreated: flags.visitCreated,
    targetPublicId: test.targetPublicId,
    targetCreated: flags.targetCreated,
    testPublicId: test.publicId,
    testCreated: flags.testCreated,
    reportPublicId: report.publicId,
    reportStatus: "ready",
    reportDeviceCount: report.deviceTestCount,
  };
}

async function resolveSite(
  repository: SiteVisitRepository,
  organizationId: string,
  mapped: MappedDeviceSubmission,
): Promise<SiteRef> {
  if (mapped.sitePublicId) {
    const site = await repository.findSiteByPublicId(
      organizationId,
      mapped.sitePublicId,
    );
    if (!site) {
      throw new Error(
        `Unknown site id "${mapped.sitePublicId}". Create the site in BoilerOps before the High Pressure test.`,
      );
    }
    return site;
  }
  if (mapped.siteCode) {
    const site = await repository.findSiteByCode(organizationId, mapped.siteCode);
    if (!site) {
      throw new Error(
        `No BoilerOps site with site code "${mapped.siteCode}". Create the site before the High Pressure test.`,
      );
    }
    return site;
  }
  throw new Error(
    "High Pressure submission is missing bo_siteid and site_code. The site QR or lookup must fill one of them.",
  );
}

function explicitTargetCode(assetId: string): string | null {
  const trimmed = assetId.trim();
  if (trimmed.toLowerCase().startsWith("target_")) return null;
  const compact = trimmed.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const alnum = trimmed.replace(/[^A-Za-z0-9]/g, "");
  if (
    compact.length >= 2 &&
    compact.length <= 8 &&
    compact.length === alnum.length &&
    alnum.length === trimmed.length
  ) {
    return compact;
  }
  return null;
}

function generatedTargetCodes(assetId: string): string[] {
  const hash = createHash("sha256").update(assetId).digest("hex").toUpperCase();
  return [`H${hash.slice(0, 6)}`, `H${hash.slice(6, 12)}`, `H${hash.slice(12, 18)}`];
}

async function insertTarget(
  repository: SiteVisitRepository,
  site: SiteRef,
  mapped: MappedDeviceSubmission,
  targetCode: string,
  newPublicId: typeof makePublicId,
): Promise<TargetRef | InsertConflict> {
  return repository.insertTarget({
    publicId: newPublicId("target"),
    organizationId: site.organizationId,
    siteId: site.id,
    targetType: mapped.assetType,
    targetCode,
    displayName: mapped.assetId.trim(),
  });
}

async function resolveTarget(
  repository: SiteVisitRepository,
  site: SiteRef,
  mapped: MappedDeviceSubmission,
  newPublicId: typeof makePublicId,
): Promise<{ target: TargetRef; created: boolean }> {
  if (mapped.assetId.trim().toLowerCase().startsWith("target_")) {
    const found = await repository.findTargetByPublicId(mapped.assetId.trim());
    if (!found || found.siteId !== site.id) {
      throw new Error(
        `Unknown asset id "${mapped.assetId}" for site ${site.publicId}. Use an inspection target public id or a target code such as BLR1.`,
      );
    }
    return { target: found, created: false };
  }

  const code = explicitTargetCode(mapped.assetId);
  if (code) {
    const found = await repository.findTargetByCode(site.id, code);
    if (found) return { target: found, created: false };
    const created = await insertTarget(repository, site, mapped, code, newPublicId);
    if (!("conflict" in created)) return { target: created, created: true };
    const after = await repository.findTargetByCode(site.id, code);
    if (after) return { target: after, created: false };
    throw new Error(`Could not create target code ${code} for site ${site.publicId}.`);
  }

  const byName = await repository.findTargetByDisplayName(site.id, mapped.assetId.trim());
  if (byName) return { target: byName, created: false };

  for (const generated of generatedTargetCodes(mapped.assetId.trim())) {
    const existing = await repository.findTargetByCode(site.id, generated);
    if (existing) {
      if (existing.displayName === mapped.assetId.trim()) {
        return { target: existing, created: false };
      }
      continue;
    }
    const created = await insertTarget(
      repository,
      site,
      mapped,
      generated,
      newPublicId,
    );
    if (!("conflict" in created)) return { target: created, created: true };
  }

  throw new Error(
    `Could not allocate a target code for asset id "${mapped.assetId}".`,
  );
}

async function findOrCreateVisit(
  repository: SiteVisitRepository,
  site: SiteRef,
  externalVisitId: string,
  newPublicId: typeof makePublicId,
): Promise<{ visit: VisitRow; created: boolean }> {
  const existing = await repository.findVisitByExternalId(
    site.organizationId,
    externalVisitId,
  );
  if (existing) {
    if (existing.siteId !== site.id) {
      throw new Error(
        `Site visit id "${externalVisitId}" is already used by site ${existing.sitePublicId}.`,
      );
    }
    return { visit: existing, created: false };
  }

  const publicId = externalVisitId.startsWith("visit_")
    ? externalVisitId
    : newPublicId("visit");
  const inserted = await repository.insertVisit({
    publicId,
    organizationId: site.organizationId,
    siteId: site.id,
    sitePublicId: site.publicId,
    externalVisitId,
  });
  if (!("conflict" in inserted)) return { visit: inserted, created: true };
  const after = await repository.findVisitByExternalId(
    site.organizationId,
    externalVisitId,
  );
  if (!after) {
    throw new Error(
      `Site visit id "${externalVisitId}" conflicted with an existing row that could not be reloaded.`,
    );
  }
  if (after.siteId !== site.id) {
    throw new Error(
      `Site visit id "${externalVisitId}" is already used by site ${after.sitePublicId}.`,
    );
  }
  return { visit: after, created: false };
}

/**
 * Find or create the site visit for this submission and attach one device
 * test. The same submission id, and the same visit plus asset, do not
 * create another visit, target, or test. A later device with the same
 * visit id and a different asset attaches to the existing visit and
 * refreshes the one site report.
 */
export async function recordDeviceVisit(
  input: RecordDeviceVisitInput,
): Promise<RecordDeviceVisitResult> {
  const newPublicId = input.newPublicId ?? makePublicId;
  const repository = input.repository;

  const existingSubmission = await repository.findTestBySubmission(
    input.submissionId,
  );
  if (existingSubmission) {
    return finishFromTest(repository, existingSubmission, newPublicId, {
      visitCreated: false,
      targetCreated: false,
      testCreated: false,
    });
  }

  const site = await resolveSite(repository, input.organizationId, input.mapped);
  const externalVisitId =
    input.mapped.siteVisitId?.trim() || newPublicId("visit");
  const { visit, created: visitCreated } = await findOrCreateVisit(
    repository,
    site,
    externalVisitId,
    newPublicId,
  );

  const existingAsset = await repository.findTestByAsset(
    visit.id,
    input.mapped.deviceType,
    input.mapped.assetKey,
  );
  if (existingAsset) {
    return finishFromTest(repository, existingAsset, newPublicId, {
      visitCreated,
      targetCreated: false,
      testCreated: false,
    });
  }

  const { target, created: targetCreated } = await resolveTarget(
    repository,
    site,
    input.mapped,
    newPublicId,
  );
  const inserted = await repository.insertTest({
    publicId: newPublicId("dtest"),
    siteVisitId: visit.id,
    organizationId: site.organizationId,
    siteId: site.id,
    deviceType: input.mapped.deviceType,
    assetKey: input.mapped.assetKey,
    inspectionTargetId: target.id,
    targetPublicId: target.publicId,
    fastfieldSubmissionId: input.submissionId,
    fastfieldFormId: input.formId,
    mapped: input.mapped,
  });

  if ("conflict" in inserted) {
    const raced =
      (await repository.findTestBySubmission(input.submissionId)) ??
      (await repository.findTestByAsset(
        visit.id,
        input.mapped.deviceType,
        input.mapped.assetKey,
      ));
    if (!raced) {
      throw new Error(
        "Device test insert conflicted, but the existing test was not found.",
      );
    }
    return finishFromTest(repository, raced, newPublicId, {
      visitCreated,
      targetCreated,
      testCreated: false,
    });
  }

  const tests = await repository.listTests(visit.id);
  const report = await saveReport(repository, visit, tests, newPublicId);
  return {
    sitePublicId: site.publicId,
    visitPublicId: visit.publicId,
    externalVisitId: visit.externalVisitId,
    visitCreated,
    targetPublicId: target.publicId,
    targetCreated,
    testPublicId: inserted.publicId,
    testCreated: true,
    reportPublicId: report.publicId,
    reportStatus: "ready",
    reportDeviceCount: report.deviceTestCount,
  };
}
