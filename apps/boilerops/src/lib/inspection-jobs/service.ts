import { DEMO_ORGANIZATION_ID } from "@/lib/constants";
import { makePublicId } from "@/lib/public-id";
import {
  generateAndStoreJobQr,
  jobQrTargetUrl,
} from "@/lib/qr";
import { createServiceClient } from "@/lib/supabase/server";
import { QR_CODES_BUCKET } from "@/lib/supabase/storage";

const JOB_COLUMNS =
  "id, public_id, organization_id, site_id, job_num, title, status, scheduled_start_date, scheduled_end_date, notes, qr_target_url, qr_storage_path, created_at, updated_at";

export type InspectionJobInput = {
  site_public_id: string;
  target_public_ids: string[];
  title?: string | null;
  status?: "draft" | "planned" | "in_progress" | "completed" | "cancelled";
  scheduled_start_date?: string | null;
  scheduled_end_date?: string | null;
  notes?: string | null;
};

export type SitePlanningOption = {
  id: string;
  public_id: string;
  site_code: string;
  facility_name: string;
};

export type TargetPlanningOption = {
  id: string;
  public_id: string;
  site_id: string;
  target_type: "boiler" | "plant";
  target_code: string;
  display_name: string;
  location_description: string | null;
  service_status: string;
};

export type InspectionJobRecord = {
  id: string;
  public_id: string;
  organization_id: string;
  site_id: string;
  job_num: string;
  title: string | null;
  status: string;
  scheduled_start_date: string | null;
  scheduled_end_date: string | null;
  notes: string | null;
  qr_target_url: string;
  qr_storage_path: string | null;
  created_at: string;
  updated_at: string;
  site: SitePlanningOption;
  targets: TargetPlanningOption[];
};

type JobRow = Omit<InspectionJobRecord, "site" | "targets">;

function nullableText(value: string | null | undefined): string | null {
  const cleaned = value?.trim();
  return cleaned ? cleaned : null;
}

function nullableDate(value: string | null | undefined): string | null {
  return value || null;
}

function uniquePublicIds(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

async function resolveScope(
  sitePublicId: string,
  targetPublicIds: string[],
): Promise<{ site: SitePlanningOption; targets: TargetPlanningOption[] }> {
  const supabase = createServiceClient();
  const { data: siteData, error: siteError } = await supabase
    .from("sites")
    .select("id, public_id, site_code, facility_name")
    .eq("organization_id", DEMO_ORGANIZATION_ID)
    .eq("public_id", sitePublicId)
    .maybeSingle();
  if (siteError) throw new Error(siteError.message);
  if (!siteData) throw new Error("Site not found.");

  const publicIds = uniquePublicIds(targetPublicIds);
  const { data: targetData, error: targetError } = await supabase
    .from("inspection_targets")
    .select(
      "id, public_id, site_id, target_type, target_code, display_name, location_description, service_status",
    )
    .eq("organization_id", DEMO_ORGANIZATION_ID)
    .eq("site_id", siteData.id)
    .in("public_id", publicIds);
  if (targetError) throw new Error(targetError.message);
  if ((targetData ?? []).length !== publicIds.length) {
    throw new Error(
      "One or more selected inspection targets do not belong to this site.",
    );
  }

  return {
    site: siteData as SitePlanningOption,
    targets: (targetData ?? []) as TargetPlanningOption[],
  };
}

async function storeJobQr(
  job: Pick<JobRow, "id" | "public_id">,
  removeObjectOnFailure = false,
): Promise<void> {
  const qr = await generateAndStoreJobQr(job.public_id);
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("inspection_jobs")
    .update({
      qr_target_url: qr.targetUrl,
      qr_storage_path: qr.storagePath,
    })
    .eq("id", job.id)
    .eq("organization_id", DEMO_ORGANIZATION_ID);
  if (error) {
    if (removeObjectOnFailure) {
      await supabase.storage.from(QR_CODES_BUCKET).remove([qr.storagePath]);
    }
    throw new Error(error.message);
  }
}

export async function getInspectionJobPlanningData(): Promise<{
  jobs: InspectionJobRecord[];
  sites: SitePlanningOption[];
  targets: TargetPlanningOption[];
}> {
  const supabase = createServiceClient();
  const [
    { data: jobData, error: jobError },
    { data: siteData, error: siteError },
    { data: targetData, error: targetError },
  ] = await Promise.all([
    supabase
      .from("inspection_jobs")
      .select(JOB_COLUMNS)
      .eq("organization_id", DEMO_ORGANIZATION_ID)
      .order("created_at", { ascending: false }),
    supabase
      .from("sites")
      .select("id, public_id, site_code, facility_name")
      .eq("organization_id", DEMO_ORGANIZATION_ID)
      .order("site_code"),
    supabase
      .from("inspection_targets")
      .select(
        "id, public_id, site_id, target_type, target_code, display_name, location_description, service_status",
      )
      .eq("organization_id", DEMO_ORGANIZATION_ID)
      .order("target_code"),
  ]);
  if (jobError) throw new Error(jobError.message);
  if (siteError) throw new Error(siteError.message);
  if (targetError) throw new Error(targetError.message);

  const rows = (jobData ?? []) as JobRow[];
  const sites = (siteData ?? []) as SitePlanningOption[];
  const targets = (targetData ?? []) as TargetPlanningOption[];
  const siteById = new Map(sites.map((site) => [site.id, site]));
  const targetById = new Map(targets.map((target) => [target.id, target]));
  const targetIdsByJob = new Map<string, string[]>();

  if (rows.length > 0) {
    const { data: scopeData, error: scopeError } = await supabase
      .from("inspection_job_targets")
      .select("inspection_job_id, inspection_target_id")
      .in(
        "inspection_job_id",
        rows.map((job) => job.id),
      );
    if (scopeError) throw new Error(scopeError.message);
    for (const scope of scopeData ?? []) {
      const targetIds = targetIdsByJob.get(scope.inspection_job_id) ?? [];
      targetIds.push(scope.inspection_target_id);
      targetIdsByJob.set(scope.inspection_job_id, targetIds);
    }
  }

  const jobs = rows.map((job) => {
    const site = siteById.get(job.site_id);
    if (!site) throw new Error(`Site for job ${job.job_num} was not found.`);
    return {
      ...job,
      site,
      targets: (targetIdsByJob.get(job.id) ?? [])
        .map((targetId) => targetById.get(targetId))
        .filter((target): target is TargetPlanningOption => Boolean(target)),
    };
  });

  return { jobs, sites, targets };
}

export async function getAdminInspectionJob(
  publicId: string,
): Promise<InspectionJobRecord> {
  const planningData = await getInspectionJobPlanningData();
  const job = planningData.jobs.find((item) => item.public_id === publicId);
  if (!job) throw new Error("Inspection job not found.");
  return job;
}

export async function createAdminInspectionJob(
  input: InspectionJobInput,
): Promise<InspectionJobRecord> {
  const scope = await resolveScope(input.site_public_id, input.target_public_ids);
  const supabase = createServiceClient();
  const publicId = makePublicId("job");
  const year = Number((input.scheduled_start_date || "").slice(0, 4)) ||
    new Date().getUTCFullYear();
  const { data: jobId, error: createError } = await supabase.rpc(
    "create_inspection_job_plan",
    {
      requested_public_id: publicId,
      requested_organization_id: DEMO_ORGANIZATION_ID,
      requested_site_id: scope.site.id,
      requested_job_year: year,
      requested_title: nullableText(input.title),
      requested_status: input.status ?? "draft",
      requested_scheduled_start_date: nullableDate(
        input.scheduled_start_date,
      ),
      requested_scheduled_end_date: nullableDate(input.scheduled_end_date),
      requested_notes: nullableText(input.notes),
      requested_qr_target_url: jobQrTargetUrl(publicId),
      requested_target_ids: scope.targets.map((target) => target.id),
    },
  );
  if (createError || !jobId) {
    throw new Error(createError?.message || "Failed to create inspection job.");
  }

  try {
    await storeJobQr({ id: String(jobId), public_id: publicId }, true);
  } catch (qrError) {
    await supabase
      .from("inspection_jobs")
      .delete()
      .eq("id", String(jobId))
      .eq("organization_id", DEMO_ORGANIZATION_ID);
    throw qrError;
  }

  return getAdminInspectionJob(publicId);
}

export async function updateAdminInspectionJob(
  publicId: string,
  input: InspectionJobInput,
): Promise<InspectionJobRecord> {
  const existing = await getAdminInspectionJob(publicId);
  const scope = await resolveScope(input.site_public_id, input.target_public_ids);
  if (existing.site_id !== scope.site.id) {
    throw new Error("A job's site cannot be changed after creation.");
  }

  const supabase = createServiceClient();
  const { error } = await supabase.rpc("update_inspection_job_plan", {
    requested_job_id: existing.id,
    requested_organization_id: DEMO_ORGANIZATION_ID,
    requested_title: nullableText(input.title),
    requested_status: input.status ?? existing.status,
    requested_scheduled_start_date: nullableDate(input.scheduled_start_date),
    requested_scheduled_end_date: nullableDate(input.scheduled_end_date),
    requested_notes: nullableText(input.notes),
    requested_target_ids: scope.targets.map((target) => target.id),
  });
  if (error) throw new Error(error.message);
  return getAdminInspectionJob(publicId);
}

export async function regenerateAdminInspectionJobQr(
  publicId: string,
): Promise<InspectionJobRecord> {
  const job = await getAdminInspectionJob(publicId);
  await storeJobQr(job);
  return getAdminInspectionJob(publicId);
}

export async function createAdminInspectionTarget(input: {
  site_public_id: string;
  target_type: "boiler" | "plant";
  target_code: string;
  display_name: string;
  location_description?: string | null;
}): Promise<TargetPlanningOption> {
  const supabase = createServiceClient();
  const { data: site, error: siteError } = await supabase
    .from("sites")
    .select("id")
    .eq("organization_id", DEMO_ORGANIZATION_ID)
    .eq("public_id", input.site_public_id)
    .maybeSingle();
  if (siteError) throw new Error(siteError.message);
  if (!site) throw new Error("Site not found.");

  const { data, error } = await supabase
    .from("inspection_targets")
    .insert({
      public_id: makePublicId("target"),
      organization_id: DEMO_ORGANIZATION_ID,
      site_id: site.id,
      target_type: input.target_type,
      target_code: input.target_code.trim().toUpperCase(),
      display_name: input.display_name.trim(),
      location_description: nullableText(input.location_description),
    })
    .select(
      "id, public_id, site_id, target_type, target_code, display_name, location_description, service_status",
    )
    .single();
  if (error || !data) {
    throw new Error(error?.message || "Failed to create inspection target.");
  }
  return data as TargetPlanningOption;
}
