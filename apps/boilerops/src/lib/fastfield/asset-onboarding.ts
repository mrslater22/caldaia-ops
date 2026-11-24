import type { MappedAssetOnboarding } from "./asset-onboarding-mapper.ts";
import { makePublicId } from "../public-id.ts";
import type { InsertConflict } from "./inspection-onboarding.ts";

export type AssetParentTarget = {
  id: string;
  publicId: string;
  siteId: string;
  sitePublicId: string;
  organizationId: string;
};

export type AssetRecord = {
  id: string;
  publicId: string;
  inspectionTargetId: string;
  organizationId: string;
  assetCode: string;
  assetCategory: "safety" | "measurement";
  assetClassification: string;
  assetNomenclature: string | null;
  assetName: string | null;
  manufacturer: string | null;
  model: string | null;
  serialNumber: string | null;
};

export type AssetOnboardingRepository = {
  findTargetByPublicId(
    organizationId: string,
    publicId: string,
  ): Promise<AssetParentTarget | null>;
  findAssetByPublicId(
    organizationId: string,
    publicId: string,
  ): Promise<AssetRecord | null>;
  findAssetByCode(targetId: string, assetCode: string): Promise<AssetRecord | null>;
  insertAsset(input: {
    publicId: string;
    organizationId: string;
    inspectionTargetId: string;
    assetCode: string;
    assetCategory: "safety" | "measurement";
    assetClassification: string;
    assetNomenclature: string | null;
    assetName: string | null;
    manufacturer: string | null;
    model: string | null;
    serialNumber: string | null;
  }): Promise<AssetRecord | InsertConflict>;
  updateAsset(
    id: string,
    input: {
      organizationId: string;
      assetCode: string;
      assetCategory: "safety" | "measurement";
      assetClassification: string;
      assetNomenclature: string | null;
      assetName: string | null;
      manufacturer: string | null;
      model: string | null;
      serialNumber: string | null;
    },
  ): Promise<AssetRecord>;
};

export type PersistedAssetOnboarding = {
  assetPublicId: string;
  targetPublicId: string;
  sitePublicId: string;
  created: boolean;
};

/**
 * Upsert one asset onto an existing inspection target. bo_targetid is
 * required. An unknown target or asset id does not create a row. When
 * bo_siteid is present it must be the target's site; that site id is
 * returned for the Asset Info sync.
 */
export async function persistAssetOnboarding(
  mapped: MappedAssetOnboarding,
  options: {
    organizationId: string;
    repository: AssetOnboardingRepository;
    newPublicId?: () => string;
  },
): Promise<PersistedAssetOnboarding> {
  const { organizationId, repository } = options;
  const target = await repository.findTargetByPublicId(
    organizationId,
    mapped.bo_targetid,
  );
  if (!target) {
    throw new Error(
      `Unknown bo_targetid "${mapped.bo_targetid}". No asset was created.`,
    );
  }
  if (mapped.bo_siteid && mapped.bo_siteid !== target.sitePublicId) {
    throw new Error(
      `bo_siteid "${mapped.bo_siteid}" does not match the site ${target.sitePublicId} for target ${target.publicId}. No asset was created.`,
    );
  }

  const fields = {
    assetCode: mapped.asset_code,
    assetCategory: mapped.asset_category,
    assetClassification: mapped.asset_classification,
    assetNomenclature: mapped.asset_nomenclature,
    assetName: mapped.asset_name,
    manufacturer: mapped.manufacturer,
    model: mapped.model,
    serialNumber: mapped.serial_number,
  };

  if (mapped.bo_assetid) {
    const existing = await repository.findAssetByPublicId(
      organizationId,
      mapped.bo_assetid,
    );
    if (!existing) {
      throw new Error(
        `Unknown bo_assetid "${mapped.bo_assetid}". Refusing to create a duplicate asset.`,
      );
    }
    if (existing.inspectionTargetId !== target.id) {
      throw new Error(
        `bo_assetid "${mapped.bo_assetid}" belongs to a different inspection target. No asset was changed.`,
      );
    }
    const updated = await repository.updateAsset(existing.id, {
      organizationId,
      ...fields,
    });
    return {
      assetPublicId: updated.publicId,
      targetPublicId: target.publicId,
      sitePublicId: target.sitePublicId,
      created: false,
    };
  }

  const byCode = await repository.findAssetByCode(target.id, mapped.asset_code);
  if (byCode) {
    const updated = await repository.updateAsset(byCode.id, {
      organizationId,
      ...fields,
    });
    return {
      assetPublicId: updated.publicId,
      targetPublicId: target.publicId,
      sitePublicId: target.sitePublicId,
      created: false,
    };
  }

  const nextPublicId = options.newPublicId ?? (() => makePublicId("asset"));
  const inserted = await repository.insertAsset({
    publicId: nextPublicId(),
    organizationId,
    inspectionTargetId: target.id,
    ...fields,
  });
  if ("conflict" in inserted) {
    const again = await repository.findAssetByCode(target.id, mapped.asset_code);
    if (!again) {
      throw new Error(
        `Asset code "${mapped.asset_code}" conflicted and the existing asset could not be reloaded.`,
      );
    }
    const updated = await repository.updateAsset(again.id, {
      organizationId,
      ...fields,
    });
    return {
      assetPublicId: updated.publicId,
      targetPublicId: target.publicId,
      sitePublicId: target.sitePublicId,
      created: false,
    };
  }

  return {
    assetPublicId: inserted.publicId,
    targetPublicId: target.publicId,
    sitePublicId: target.sitePublicId,
    created: true,
  };
}
