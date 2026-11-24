import type { MappedInspectionOnboarding } from "./inspection-onboarding-mapper.ts";
import { makePublicId } from "../public-id.ts";

export type ParentSite = {
  id: string;
  publicId: string;
  siteCode: string;
  organizationId: string;
};

export type InspectionTargetRecord = {
  id: string;
  publicId: string;
  siteId: string;
  organizationId: string;
  targetType: "boiler" | "plant";
  targetCode: string;
  displayName: string;
};

export type InsertConflict = { conflict: true };

export type InspectionOnboardingRepository = {
  findSiteByPublicId(
    organizationId: string,
    publicId: string,
  ): Promise<ParentSite | null>;
  findSiteByCode(
    organizationId: string,
    siteCode: string,
  ): Promise<ParentSite | null>;
  findTargetByPublicId(
    organizationId: string,
    publicId: string,
  ): Promise<InspectionTargetRecord | null>;
  findTargetByCode(
    siteId: string,
    targetCode: string,
  ): Promise<InspectionTargetRecord | null>;
  insertTarget(input: {
    publicId: string;
    organizationId: string;
    siteId: string;
    targetType: "boiler" | "plant";
    targetCode: string;
    displayName: string;
  }): Promise<InspectionTargetRecord | InsertConflict>;
  updateTarget(
    id: string,
    input: {
      organizationId: string;
      targetType: "boiler" | "plant";
      targetCode: string;
      displayName: string;
    },
  ): Promise<InspectionTargetRecord>;
  ensureTargetDetails(
    targetId: string,
    targetType: "boiler" | "plant",
  ): Promise<void>;
};

export type PersistedInspectionOnboarding = {
  targetPublicId: string;
  sitePublicId: string;
  siteCode: string;
  created: boolean;
  targetType: "boiler" | "plant";
};

/**
 * Upsert one inspection target and its boiler or plant detail row.
 * Match bo_targetid first. An unknown bo_targetid is rejected. Without
 * that id, match site plus inspection_code. The parent site is bo_siteid,
 * then site_code. Nothing is inserted when the parent is missing.
 */
export async function persistInspectionOnboarding(
  mapped: MappedInspectionOnboarding,
  options: {
    organizationId: string;
    repository: InspectionOnboardingRepository;
    newPublicId?: () => string;
  },
): Promise<PersistedInspectionOnboarding> {
  const { organizationId, repository } = options;
  const site = await resolveParentSite(mapped, organizationId, repository);
  const nextPublicId = options.newPublicId ?? (() => makePublicId("target"));

  if (mapped.bo_targetid) {
    const existing = await repository.findTargetByPublicId(
      organizationId,
      mapped.bo_targetid,
    );
    if (!existing) {
      throw new Error(
        `Unknown bo_targetid "${mapped.bo_targetid}". Refusing to create a duplicate inspection target.`,
      );
    }
    if (existing.siteId !== site.id) {
      throw new Error(
        `bo_targetid "${mapped.bo_targetid}" belongs to a different site than ${site.publicId}. No inspection target was changed.`,
      );
    }
    return saveExisting(existing, mapped, site, repository);
  }

  const byCode = await repository.findTargetByCode(site.id, mapped.inspection_code);
  if (byCode) return saveExisting(byCode, mapped, site, repository);

  const inserted = await repository.insertTarget({
    publicId: nextPublicId(),
    organizationId,
    siteId: site.id,
    targetType: mapped.inspection_scope,
    targetCode: mapped.inspection_code,
    displayName: mapped.inspection_name,
  });
  if ("conflict" in inserted) {
    const again = await repository.findTargetByCode(site.id, mapped.inspection_code);
    if (!again) {
      throw new Error(
        `Inspection code "${mapped.inspection_code}" conflicted and the existing target could not be reloaded.`,
      );
    }
    return saveExisting(again, mapped, site, repository);
  }

  await repository.ensureTargetDetails(inserted.id, mapped.inspection_scope);
  return {
    targetPublicId: inserted.publicId,
    sitePublicId: site.publicId,
    siteCode: site.siteCode,
    created: true,
    targetType: mapped.inspection_scope,
  };
}

async function resolveParentSite(
  mapped: MappedInspectionOnboarding,
  organizationId: string,
  repository: InspectionOnboardingRepository,
): Promise<ParentSite> {
  if (mapped.bo_siteid) {
    const site = await repository.findSiteByPublicId(
      organizationId,
      mapped.bo_siteid,
    );
    if (!site) {
      throw new Error(
        `Unknown bo_siteid "${mapped.bo_siteid}". No inspection target was created.`,
      );
    }
    return site;
  }
  if (mapped.site_code) {
    const site = await repository.findSiteByCode(organizationId, mapped.site_code);
    if (!site) {
      throw new Error(
        `No site with site_code "${mapped.site_code}". No inspection target was created.`,
      );
    }
    return site;
  }
  throw new Error(
    "Inspection onboarding requires bo_siteid or site_code. No inspection target was created.",
  );
}

async function saveExisting(
  existing: InspectionTargetRecord,
  mapped: MappedInspectionOnboarding,
  site: ParentSite,
  repository: InspectionOnboardingRepository,
): Promise<PersistedInspectionOnboarding> {
  const updated = await repository.updateTarget(existing.id, {
    organizationId: existing.organizationId,
    targetType: mapped.inspection_scope,
    targetCode: mapped.inspection_code,
    displayName: mapped.inspection_name,
  });
  await repository.ensureTargetDetails(updated.id, mapped.inspection_scope);
  return {
    targetPublicId: updated.publicId,
    sitePublicId: site.publicId,
    siteCode: site.siteCode,
    created: false,
    targetType: mapped.inspection_scope,
  };
}
