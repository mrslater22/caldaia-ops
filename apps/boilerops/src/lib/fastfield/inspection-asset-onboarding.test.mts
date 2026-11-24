import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  mapAssetOnboarding,
  payloadForAssetInfoSync,
} from "./asset-onboarding-mapper.ts";
import {
  persistAssetOnboarding,
  type AssetOnboardingRepository,
  type AssetParentTarget,
  type AssetRecord,
} from "./asset-onboarding.ts";
import {
  mapInspectionOnboarding,
  payloadForInspectionInfoSync,
} from "./inspection-onboarding-mapper.ts";
import {
  persistInspectionOnboarding,
  type InspectionOnboardingRepository,
  type InspectionTargetRecord,
  type ParentSite,
} from "./inspection-onboarding.ts";
import type { InsertConflict } from "./inspection-onboarding.ts";

const ORG = "00000000-0000-4000-8000-000000000001";

function site(overrides: Partial<ParentSite> = {}): ParentSite {
  return {
    id: "site-1",
    publicId: "site_tst1",
    siteCode: "TST1",
    organizationId: ORG,
    ...overrides,
  };
}

function memoryInspection(seed?: {
  sites?: ParentSite[];
  targets?: InspectionTargetRecord[];
}): InspectionOnboardingRepository & {
  targets: InspectionTargetRecord[];
  details: Map<string, "boiler" | "plant">;
  inserts: number;
} {
  const sites = [...(seed?.sites ?? [site()])];
  const targets = [...(seed?.targets ?? [])];
  const details = new Map<string, "boiler" | "plant">();
  let sequence = 1;
  const state = { inserts: 0 };

  return {
    targets,
    details,
    get inserts() {
      return state.inserts;
    },
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
    async findTargetByPublicId(organizationId, publicId) {
      return (
        targets.find(
          (item) =>
            item.organizationId === organizationId && item.publicId === publicId,
        ) ?? null
      );
    },
    async findTargetByCode(siteId, targetCode) {
      return (
        targets.find(
          (item) => item.siteId === siteId && item.targetCode === targetCode,
        ) ?? null
      );
    },
    async insertTarget(input) {
      if (
        targets.some(
          (item) =>
            item.siteId === input.siteId && item.targetCode === input.targetCode,
        )
      ) {
        return { conflict: true } satisfies InsertConflict;
      }
      const row: InspectionTargetRecord = {
        id: `target-${sequence++}`,
        publicId: input.publicId,
        siteId: input.siteId,
        organizationId: input.organizationId,
        targetType: input.targetType,
        targetCode: input.targetCode,
        displayName: input.displayName,
      };
      targets.push(row);
      state.inserts += 1;
      return row;
    },
    async updateTarget(id, input) {
      const row = targets.find((item) => item.id === id);
      if (!row) throw new Error("missing target");
      row.targetType = input.targetType;
      row.targetCode = input.targetCode;
      row.displayName = input.displayName;
      return row;
    },
    async ensureTargetDetails(targetId, targetType) {
      details.set(targetId, targetType);
    },
  };
}

function parentTarget(
  overrides: Partial<AssetParentTarget> = {},
): AssetParentTarget {
  return {
    id: "target-1",
    publicId: "target_blr1",
    siteId: "site-1",
    sitePublicId: "site_tst1",
    organizationId: ORG,
    ...overrides,
  };
}

function asset(overrides: Partial<AssetRecord> = {}): AssetRecord {
  return {
    id: "asset-1",
    publicId: "asset_sv1",
    inspectionTargetId: "target-1",
    organizationId: ORG,
    assetCode: "SV1",
    assetCategory: "safety",
    assetClassification: "safety valve",
    assetNomenclature: null,
    assetName: "Safety valve",
    manufacturer: null,
    model: null,
    serialNumber: null,
    ...overrides,
  };
}

function memoryAssets(seed?: {
  targets?: AssetParentTarget[];
  assets?: AssetRecord[];
}): AssetOnboardingRepository & { assets: AssetRecord[]; inserts: number } {
  const targets = [...(seed?.targets ?? [parentTarget()])];
  const assets = [...(seed?.assets ?? [])];
  let sequence = 1;
  const state = { inserts: 0 };
  return {
    assets,
    get inserts() {
      return state.inserts;
    },
    async findTargetByPublicId(organizationId, publicId) {
      return (
        targets.find(
          (item) =>
            item.organizationId === organizationId && item.publicId === publicId,
        ) ?? null
      );
    },
    async findAssetByPublicId(organizationId, publicId) {
      return (
        assets.find(
          (item) =>
            item.organizationId === organizationId && item.publicId === publicId,
        ) ?? null
      );
    },
    async findAssetByCode(targetId, assetCode) {
      return (
        assets.find(
          (item) =>
            item.inspectionTargetId === targetId && item.assetCode === assetCode,
        ) ?? null
      );
    },
    async insertAsset(input) {
      if (
        assets.some(
          (item) =>
            item.inspectionTargetId === input.inspectionTargetId &&
            item.assetCode === input.assetCode,
        )
      ) {
        return { conflict: true };
      }
      const row: AssetRecord = {
        id: `asset-${sequence++}`,
        publicId: input.publicId,
        inspectionTargetId: input.inspectionTargetId,
        organizationId: input.organizationId,
        assetCode: input.assetCode,
        assetCategory: input.assetCategory,
        assetClassification: input.assetClassification,
        assetNomenclature: input.assetNomenclature,
        assetName: input.assetName,
        manufacturer: input.manufacturer,
        model: input.model,
        serialNumber: input.serialNumber,
      };
      assets.push(row);
      state.inserts += 1;
      return row;
    },
    async updateAsset(id, input) {
      const row = assets.find((item) => item.id === id);
      if (!row) throw new Error("missing asset");
      row.assetCode = input.assetCode;
      row.assetCategory = input.assetCategory;
      row.assetClassification = input.assetClassification;
      row.assetNomenclature = input.assetNomenclature;
      row.assetName = input.assetName;
      row.manufacturer = input.manufacturer;
      row.model = input.model;
      row.serialNumber = input.serialNumber;
      return row;
    },
  };
}

describe("inspection onboarding mapper", () => {
  test("normalizes scope and code and requires a parent key", () => {
    const mapped = mapInspectionOnboarding({
      inspection_scope: " Boiler ",
      inspection_code: "blr1",
      inspection_name: "Boiler 1",
      site_code: "tst1",
    });
    assert.equal(mapped.inspection_scope, "boiler");
    assert.equal(mapped.inspection_code, "BLR1");
    assert.equal(mapped.site_code, "TST1");
    assert.equal(mapped.bo_targetid, null);
  });

  test("reads configured field keys before the canonical names", () => {
    const mapped = mapInspectionOnboarding(
      {
        scope_key: "plant",
        code_key: "plt1",
        name_key: "Plant 1",
        site_key: "site_tst1",
      },
      {
        inspection_scope: "scope_key",
        inspection_code: "code_key",
        inspection_name: "name_key",
        bo_siteid: "site_key",
      },
    );
    assert.equal(mapped.inspection_scope, "plant");
    assert.equal(mapped.inspection_code, "PLT1");
    assert.equal(mapped.bo_siteid, "site_tst1");
  });

  test("rejects a missing scope, code, name, or parent", () => {
    assert.throws(
      () => mapInspectionOnboarding({ inspection_code: "BLR1" }),
      /inspection_scope/,
    );
    assert.throws(
      () =>
        mapInspectionOnboarding({
          inspection_scope: "boiler",
          inspection_code: "B",
          inspection_name: "Boiler",
          site_code: "TST1",
        }),
      /inspection_code/,
    );
    assert.throws(
      () =>
        mapInspectionOnboarding({
          inspection_scope: "boiler",
          inspection_code: "BLR1",
          site_code: "TST1",
        }),
      /inspection_name/,
    );
    assert.throws(
      () =>
        mapInspectionOnboarding({
          inspection_scope: "boiler",
          inspection_code: "BLR1",
          inspection_name: "Boiler 1",
        }),
      /bo_siteid or a 3 to 4 character site_code/,
    );
  });
});

describe("inspection onboarding persist", () => {
  test("creates a boiler target and detail row, then updates by code", async () => {
    const repository = memoryInspection();
    const created = await persistInspectionOnboarding(
      mapInspectionOnboarding({
        inspection_scope: "boiler",
        inspection_code: "BLR1",
        inspection_name: "Boiler 1",
        bo_siteid: "site_tst1",
      }),
      {
        organizationId: ORG,
        repository,
        newPublicId: () => "target_generated",
      },
    );
    assert.equal(created.created, true);
    assert.equal(created.targetPublicId, "target_generated");
    assert.equal(created.sitePublicId, "site_tst1");
    assert.equal(repository.inserts, 1);
    assert.equal(repository.details.get(repository.targets[0].id), "boiler");

    const updated = await persistInspectionOnboarding(
      mapInspectionOnboarding({
        inspection_scope: "plant",
        inspection_code: "BLR1",
        inspection_name: "Renamed",
        site_code: "TST1",
      }),
      { organizationId: ORG, repository },
    );
    assert.equal(updated.created, false);
    assert.equal(updated.targetPublicId, "target_generated");
    assert.equal(repository.inserts, 1);
    assert.equal(repository.targets[0].displayName, "Renamed");
    assert.equal(repository.targets[0].targetType, "plant");
    assert.equal(repository.details.get(repository.targets[0].id), "plant");
  });

  test("rejects an unknown bo_targetid and a missing parent without inserting", async () => {
    const repository = memoryInspection();
    await assert.rejects(
      () =>
        persistInspectionOnboarding(
          mapInspectionOnboarding({
            bo_targetid: "target_missing",
            inspection_scope: "boiler",
            inspection_code: "BLR1",
            inspection_name: "Boiler 1",
            bo_siteid: "site_tst1",
          }),
          { organizationId: ORG, repository },
        ),
      /Unknown bo_targetid/,
    );
    await assert.rejects(
      () =>
        persistInspectionOnboarding(
          mapInspectionOnboarding({
            inspection_scope: "boiler",
            inspection_code: "BLR1",
            inspection_name: "Boiler 1",
            bo_siteid: "site_missing",
          }),
          { organizationId: ORG, repository },
        ),
      /Unknown bo_siteid/,
    );
    await assert.rejects(
      () =>
        persistInspectionOnboarding(
          mapInspectionOnboarding({
            inspection_scope: "boiler",
            inspection_code: "BLR1",
            inspection_name: "Boiler 1",
            site_code: "NONE",
          }),
          { organizationId: ORG, repository },
        ),
      /No site with site_code/,
    );
    assert.equal(repository.inserts, 0);
    assert.equal(repository.details.size, 0);
  });

  test("stamps generated ids onto the Inspection Info payload", () => {
    const payload = payloadForInspectionInfoSync(
      { bo_targetid: "stale", inspection_name: "From form" },
      mapInspectionOnboarding({
        inspection_scope: "boiler",
        inspection_code: "BLR1",
        inspection_name: "Boiler 1",
        bo_siteid: "site_tst1",
      }),
      { bo_targetid: "target_generated", bo_siteid: "site_tst1" },
    );
    assert.equal(payload.bo_targetid, "target_generated");
    assert.equal(payload.bo_siteid, "site_tst1");
    assert.equal(payload.inspection_code, "BLR1");
    assert.equal(payload.inspection_name, "From form");
  });
});

describe("asset onboarding", () => {
  test("requires a target id, code, and classification", () => {
    assert.throws(() => mapAssetOnboarding({ asset_code: "SV1" }), /bo_targetid/);
    assert.throws(
      () =>
        mapAssetOnboarding({
          bo_targetid: "target_blr1",
          asset_code: "S",
          asset_classification: "valve",
        }),
      /asset_code/,
    );
    assert.throws(
      () =>
        mapAssetOnboarding({
          bo_targetid: "target_blr1",
          asset_code: "SV1",
        }),
      /asset_classification/,
    );
    const mapped = mapAssetOnboarding({
      bo_targetid: "target_blr1",
      asset_code: "sv1",
      asset_classification: "safety valve",
    });
    assert.equal(mapped.asset_code, "SV1");
    assert.equal(mapped.asset_category, "safety");
  });

  test("uses a configured field key and rejects a bad category", () => {
    const mapped = mapAssetOnboarding(
      {
        target_key: "target_blr1",
        code_key: "sv1",
        class_key: "relief valve",
        category_key: "measurement",
      },
      {
        bo_targetid: "target_key",
        asset_code: "code_key",
        asset_classification: "class_key",
        asset_category: "category_key",
      },
    );
    assert.equal(mapped.asset_category, "measurement");
    assert.throws(
      () =>
        mapAssetOnboarding({
          bo_targetid: "target_blr1",
          asset_code: "SV1",
          asset_classification: "valve",
          asset_category: "tool",
        }),
      /asset_category/,
    );
  });

  test("links the asset to the target and passes the site through", async () => {
    const repository = memoryAssets();
    const created = await persistAssetOnboarding(
      mapAssetOnboarding({
        bo_targetid: "target_blr1",
        bo_siteid: "site_tst1",
        asset_code: "SV1",
        asset_classification: "safety valve",
        asset_name: "Safety valve",
        manufacturer: "Kunkle",
      }),
      {
        organizationId: ORG,
        repository,
        newPublicId: () => "asset_generated",
      },
    );
    assert.equal(created.created, true);
    assert.equal(created.assetPublicId, "asset_generated");
    assert.equal(created.targetPublicId, "target_blr1");
    assert.equal(created.sitePublicId, "site_tst1");
    assert.equal(repository.assets[0].inspectionTargetId, "target-1");
    assert.equal(repository.assets[0].manufacturer, "Kunkle");

    const updated = await persistAssetOnboarding(
      mapAssetOnboarding({
        bo_targetid: "target_blr1",
        asset_code: "SV1",
        asset_classification: "safety valve",
        model: "6252",
      }),
      { organizationId: ORG, repository },
    );
    assert.equal(updated.created, false);
    assert.equal(updated.assetPublicId, "asset_generated");
    assert.equal(repository.inserts, 1);
    assert.equal(repository.assets[0].model, "6252");
  });

  test("does not create an asset when the parent or id is missing or mismatched", async () => {
    const repository = memoryAssets({
      assets: [asset({ publicId: "asset_other", inspectionTargetId: "target-9" })],
    });
    await assert.rejects(
      () =>
        persistAssetOnboarding(
          mapAssetOnboarding({
            bo_targetid: "target_missing",
            asset_code: "SV1",
            asset_classification: "safety valve",
          }),
          { organizationId: ORG, repository },
        ),
      /Unknown bo_targetid/,
    );
    await assert.rejects(
      () =>
        persistAssetOnboarding(
          mapAssetOnboarding({
            bo_targetid: "target_blr1",
            bo_siteid: "site_other",
            asset_code: "SV1",
            asset_classification: "safety valve",
          }),
          { organizationId: ORG, repository },
        ),
      /does not match the site/,
    );
    await assert.rejects(
      () =>
        persistAssetOnboarding(
          mapAssetOnboarding({
            bo_assetid: "asset_missing",
            bo_targetid: "target_blr1",
            asset_code: "SV1",
            asset_classification: "safety valve",
          }),
          { organizationId: ORG, repository },
        ),
      /Unknown bo_assetid/,
    );
    await assert.rejects(
      () =>
        persistAssetOnboarding(
          mapAssetOnboarding({
            bo_assetid: "asset_other",
            bo_targetid: "target_blr1",
            asset_code: "SV1",
            asset_classification: "safety valve",
          }),
          { organizationId: ORG, repository },
        ),
      /different inspection target/,
    );
    assert.equal(repository.inserts, 0);
  });

  test("stamps generated asset, target, and site ids", () => {
    const mapped = mapAssetOnboarding({
      bo_targetid: "target_blr1",
      asset_code: "SV1",
      asset_classification: "safety valve",
      serial_number: "SN-1",
    });
    const payload = payloadForAssetInfoSync(
      { bo_assetid: "stale", serial_number: "SN-1" },
      mapped,
      {
        bo_assetid: "asset_generated",
        bo_targetid: "target_blr1",
        bo_siteid: "site_tst1",
      },
    );
    assert.equal(payload.bo_assetid, "asset_generated");
    assert.equal(payload.bo_targetid, "target_blr1");
    assert.equal(payload.bo_siteid, "site_tst1");
    assert.equal(payload.asset_code, "SV1");
    assert.equal(payload.serial_number, "SN-1");
  });
});
