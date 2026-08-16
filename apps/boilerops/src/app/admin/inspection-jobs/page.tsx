"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";

type Site = {
  id: string;
  public_id: string;
  site_code: string;
  facility_name: string;
};

type Target = {
  id: string;
  public_id: string;
  site_id: string;
  target_type: "boiler" | "plant";
  target_code: string;
  display_name: string;
  location_description: string | null;
  service_status: string;
};

type Job = {
  id: string;
  public_id: string;
  job_num: string;
  title: string | null;
  status: string;
  scheduled_start_date: string | null;
  scheduled_end_date: string | null;
  notes: string | null;
  qr_target_url: string;
  qr_storage_path: string | null;
  updated_at: string;
  site: Site;
  targets: Target[];
};

type JobForm = {
  site_public_id: string;
  target_public_ids: string[];
  title: string;
  status: "draft" | "planned" | "in_progress" | "completed" | "cancelled";
  scheduled_start_date: string;
  scheduled_end_date: string;
  notes: string;
};

type TargetForm = {
  target_type: "boiler" | "plant";
  target_code: string;
  display_name: string;
  location_description: string;
};

const EMPTY_JOB: JobForm = {
  site_public_id: "",
  target_public_ids: [],
  title: "",
  status: "draft",
  scheduled_start_date: "",
  scheduled_end_date: "",
  notes: "",
};

const EMPTY_TARGET: TargetForm = {
  target_type: "boiler",
  target_code: "",
  display_name: "",
  location_description: "",
};

function formFromJob(job: Job): JobForm {
  return {
    site_public_id: job.site.public_id,
    target_public_ids: job.targets.map((target) => target.public_id),
    title: job.title ?? "",
    status: job.status as JobForm["status"],
    scheduled_start_date: job.scheduled_start_date ?? "",
    scheduled_end_date: job.scheduled_end_date ?? "",
    notes: job.notes ?? "",
  };
}

function StatusBadge({ status }: { status: string }) {
  const classes =
    status === "completed"
      ? "bg-accent/10 text-accent"
      : status === "cancelled"
        ? "bg-danger/10 text-danger"
        : "bg-border/50 text-muted";
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${classes}`}
    >
      {status.replaceAll("_", " ")}
    </span>
  );
}

export default function InspectionJobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [targets, setTargets] = useState<Target[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<JobForm>(EMPTY_JOB);
  const [targetForm, setTargetForm] = useState<TargetForm>(EMPTY_TARGET);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [creatingTarget, setCreatingTarget] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [qrVersion, setQrVersion] = useState(0);

  const selected =
    jobs.find((job) => job.public_id === selectedId) ?? null;
  const selectedSite =
    sites.find((site) => site.public_id === form.site_public_id) ?? null;
  const availableTargets = useMemo(
    () =>
      targets.filter(
        (target) =>
          target.site_id === selectedSite?.id &&
          (target.service_status === "active" ||
            form.target_public_ids.includes(target.public_id)),
      ),
    [form.target_public_ids, selectedSite, targets],
  );

  async function loadData(preferredId?: string) {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/inspection-jobs");
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to load inspection jobs.");
      }
      const loadedJobs = (data.jobs ?? []) as Job[];
      setJobs(loadedJobs);
      setSites((data.sites ?? []) as Site[]);
      setTargets((data.targets ?? []) as Target[]);
      const nextId = preferredId ?? selectedId;
      if (nextId) {
        const next = loadedJobs.find((job) => job.public_id === nextId);
        if (next) {
          setSelectedId(next.public_id);
          setForm(formFromJob(next));
        }
      }
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Failed to load inspection jobs.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
    // Initial admin data load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function selectJob(job: Job) {
    setSelectedId(job.public_id);
    setForm(formFromJob(job));
    setError(null);
    setMessage(null);
  }

  function startNewJob() {
    setSelectedId(null);
    setForm({
      ...EMPTY_JOB,
      site_public_id: sites[0]?.public_id ?? "",
    });
    setError(null);
    setMessage(null);
  }

  function selectSite(publicId: string) {
    setForm((current) => ({
      ...current,
      site_public_id: publicId,
      target_public_ids: [],
    }));
  }

  function toggleTarget(publicId: string) {
    setForm((current) => ({
      ...current,
      target_public_ids: current.target_public_ids.includes(publicId)
        ? current.target_public_ids.filter((id) => id !== publicId)
        : [...current.target_public_ids, publicId],
    }));
  }

  async function saveJob(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(
        selectedId
          ? `/api/admin/inspection-jobs/${encodeURIComponent(selectedId)}`
          : "/api/admin/inspection-jobs",
        {
          method: selectedId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        },
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to save inspection job.");
      }
      setMessage(
        `${data.job.job_num} ${selectedId ? "updated" : "created"}.`,
      );
      await loadData(data.job.public_id);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Failed to save inspection job.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function createTarget(event: FormEvent) {
    event.preventDefault();
    if (!form.site_public_id) return;
    setCreatingTarget(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/inspection-targets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          site_public_id: form.site_public_id,
          ...targetForm,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to create inspection target.");
      }
      setTargetForm(EMPTY_TARGET);
      await loadData(selectedId ?? undefined);
      if (!selectedId) {
        setForm((current) => ({
          ...current,
          target_public_ids: [
            ...current.target_public_ids,
            data.target.public_id,
          ],
        }));
      }
      setMessage(`${data.target.target_code} target created.`);
    } catch (targetError) {
      setError(
        targetError instanceof Error
          ? targetError.message
          : "Failed to create inspection target.",
      );
    } finally {
      setCreatingTarget(false);
    }
  }

  async function regenerateQr() {
    if (!selected) return;
    setRegenerating(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/admin/inspection-jobs/${encodeURIComponent(selected.public_id)}/regenerate-qr`,
        { method: "POST" },
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to regenerate job QR.");
      }
      setQrVersion(Date.now());
      setMessage("Job QR regenerated.");
      await loadData(selected.public_id);
    } catch (qrError) {
      setError(
        qrError instanceof Error ? qrError.message : "Failed to regenerate QR.",
      );
    } finally {
      setRegenerating(false);
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-medium tracking-wide text-accent uppercase">
            Operations
          </p>
          <h2 className="text-2xl font-semibold text-foreground">
            Inspection jobs
          </h2>
          <p className="mt-1 text-sm text-muted">
            Plan site scope, assign Boiler and Plant targets, and issue the job
            QR used in FastField.
          </p>
        </div>
        <Link href="/admin" className="text-sm text-accent hover:underline">
          Back
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(380px,0.85fr)]">
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Jobs ({jobs.length})</h3>
            <button
              type="button"
              onClick={startNewJob}
              className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover"
            >
              New job
            </button>
          </div>
          {loading ? (
            <p className="text-sm text-muted">Loading jobs…</p>
          ) : jobs.length === 0 ? (
            <div className="rounded-xl border border-border bg-panel p-5 text-sm text-muted">
              No inspection jobs have been created.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border bg-panel">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-border bg-background">
                  <tr>
                    <th className="px-3 py-2 font-medium">Job</th>
                    <th className="px-3 py-2 font-medium">Site</th>
                    <th className="px-3 py-2 font-medium">Scope</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((job) => (
                    <tr
                      key={job.id}
                      onClick={() => selectJob(job)}
                      className={`cursor-pointer border-b border-border transition hover:bg-background ${
                        selectedId === job.public_id ? "bg-accent/5" : ""
                      }`}
                    >
                      <td className="px-3 py-3">
                        <p className="font-mono font-medium">{job.job_num}</p>
                        <p className="text-xs text-muted">
                          {job.title || "Untitled inspection"}
                        </p>
                      </td>
                      <td className="px-3 py-3">{job.site.site_code}</td>
                      <td className="px-3 py-3 text-muted">
                        {job.targets.length} target
                        {job.targets.length === 1 ? "" : "s"}
                      </td>
                      <td className="px-3 py-3">
                        <StatusBadge status={job.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <form
            onSubmit={createTarget}
            className="space-y-3 rounded-xl border border-border bg-panel p-5"
          >
            <div>
              <h3 className="text-sm font-semibold">Quick-create target</h3>
              <p className="mt-1 text-xs text-muted">
                Creates the minimum Boiler or Plant identity needed for job
                scope. Detailed onboarding remains a separate workflow.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <select
                value={targetForm.target_type}
                onChange={(event) =>
                  setTargetForm((current) => ({
                    ...current,
                    target_type: event.target.value as TargetForm["target_type"],
                  }))
                }
                className="rounded-md border border-border px-3 py-2 text-sm"
              >
                <option value="boiler">Boiler</option>
                <option value="plant">Plant</option>
              </select>
              <input
                required
                value={targetForm.target_code}
                onChange={(event) =>
                  setTargetForm((current) => ({
                    ...current,
                    target_code: event.target.value.toUpperCase(),
                  }))
                }
                placeholder="Target code (BLR1)"
                className="rounded-md border border-border px-3 py-2 text-sm uppercase"
              />
            </div>
            <input
              required
              value={targetForm.display_name}
              onChange={(event) =>
                setTargetForm((current) => ({
                  ...current,
                  display_name: event.target.value,
                }))
              }
              placeholder="Display name"
              className="w-full rounded-md border border-border px-3 py-2 text-sm"
            />
            <input
              value={targetForm.location_description}
              onChange={(event) =>
                setTargetForm((current) => ({
                  ...current,
                  location_description: event.target.value,
                }))
              }
              placeholder="Location description"
              className="w-full rounded-md border border-border px-3 py-2 text-sm"
            />
            <button
              type="submit"
              disabled={creatingTarget || !form.site_public_id}
              className="w-full rounded-md border border-border px-3 py-2 text-sm font-medium hover:border-accent disabled:opacity-60"
            >
              {creatingTarget
                ? "Creating target…"
                : form.site_public_id
                  ? "Create target for selected site"
                  : "Select a site first"}
            </button>
          </form>
        </section>

        <section className="space-y-4">
          <form
            onSubmit={saveJob}
            className="space-y-4 rounded-xl border border-border bg-panel p-5"
          >
            <div>
              <h3 className="text-sm font-semibold">
                {selected ? `Edit ${selected.job_num}` : "Create job"}
              </h3>
              {selected ? (
                <p className="mt-1 font-mono text-xs text-muted">
                  {selected.public_id}
                </p>
              ) : null}
            </div>

            <label className="block space-y-1.5 text-sm">
              <span className="font-medium">Site</span>
              <select
                required
                disabled={Boolean(selected)}
                value={form.site_public_id}
                onChange={(event) => selectSite(event.target.value)}
                className="w-full rounded-md border border-border px-3 py-2 disabled:opacity-60"
              >
                <option value="">Select a site</option>
                {sites.map((site) => (
                  <option key={site.id} value={site.public_id}>
                    {site.site_code} — {site.facility_name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-1.5 text-sm">
              <span className="font-medium">Title</span>
              <input
                value={form.title}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
                className="w-full rounded-md border border-border px-3 py-2"
                placeholder="Annual safety device inspection"
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1.5 text-sm">
                <span className="font-medium">Start date</span>
                <input
                  type="date"
                  value={form.scheduled_start_date}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      scheduled_start_date: event.target.value,
                    }))
                  }
                  className="w-full rounded-md border border-border px-3 py-2"
                />
              </label>
              <label className="space-y-1.5 text-sm">
                <span className="font-medium">End date</span>
                <input
                  type="date"
                  value={form.scheduled_end_date}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      scheduled_end_date: event.target.value,
                    }))
                  }
                  className="w-full rounded-md border border-border px-3 py-2"
                />
              </label>
            </div>

            <label className="block space-y-1.5 text-sm">
              <span className="font-medium">Status</span>
              <select
                value={form.status}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    status: event.target.value as JobForm["status"],
                  }))
                }
                className="w-full rounded-md border border-border px-3 py-2"
              >
                <option value="draft">Draft</option>
                <option value="planned">Planned</option>
                <option value="in_progress">In progress</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </label>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">
                Inspection targets
              </legend>
              {!form.site_public_id ? (
                <p className="text-xs text-muted">Select a site first.</p>
              ) : availableTargets.length === 0 ? (
                <p className="text-xs text-muted">
                  No active targets exist for this site. Use quick-create.
                </p>
              ) : (
                <div className="max-h-48 space-y-2 overflow-y-auto rounded-md border border-border p-3">
                  {availableTargets.map((target) => (
                    <label
                      key={target.id}
                      className="flex items-start gap-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={form.target_public_ids.includes(
                          target.public_id,
                        )}
                        onChange={() => toggleTarget(target.public_id)}
                        className="mt-1"
                      />
                      <span>
                        <span className="font-mono">{target.target_code}</span>{" "}
                        {target.display_name}
                        <span className="ml-1 text-xs text-muted">
                          ({target.target_type}
                          {target.service_status === "active"
                            ? ""
                            : `, ${target.service_status}`}
                          )
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </fieldset>

            <label className="block space-y-1.5 text-sm">
              <span className="font-medium">Internal notes</span>
              <textarea
                value={form.notes}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    notes: event.target.value,
                  }))
                }
                rows={3}
                className="w-full rounded-md border border-border px-3 py-2"
              />
            </label>

            {error ? (
              <p className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
                {error}
              </p>
            ) : null}
            {message ? (
              <p className="rounded-md border border-accent/30 bg-accent/5 px-3 py-2 text-sm text-accent">
                {message}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-60"
            >
              {saving ? "Saving…" : selected ? "Save changes" : "Create job"}
            </button>
          </form>

          {selected ? (
            <div className="space-y-4 rounded-xl border border-border bg-panel p-5">
              <div>
                <h3 className="text-sm font-semibold">Job QR code</h3>
                <p className="mt-1 text-xs text-muted">
                  Scan this first to establish the FastField job context.
                </p>
              </div>
              <div className="flex justify-center rounded-lg border border-border bg-white p-4">
                <Image
                  key={qrVersion}
                  src={`/i/job/${encodeURIComponent(selected.public_id)}/qr?v=${qrVersion}`}
                  alt={`QR code for job ${selected.job_num}`}
                  width={220}
                  height={220}
                  unoptimized
                />
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <a
                  href={`/i/job/${encodeURIComponent(selected.public_id)}/qr`}
                  download={`${selected.job_num}-job-qr.png`}
                  className="rounded-md border border-border px-3 py-2 text-center text-sm font-medium hover:border-accent"
                >
                  Download QR
                </a>
                <a
                  href={`/i/job/${encodeURIComponent(selected.public_id)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-md border border-border px-3 py-2 text-center text-sm font-medium hover:border-accent"
                >
                  View job JSON
                </a>
                <button
                  type="button"
                  disabled={regenerating}
                  onClick={() => void regenerateQr()}
                  className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:border-accent disabled:opacity-60 sm:col-span-2"
                >
                  {regenerating ? "Regenerating…" : "Regenerate QR"}
                </button>
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
