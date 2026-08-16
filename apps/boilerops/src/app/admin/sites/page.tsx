"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

type SiteForm = {
  site_code: string;
  facility_name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  timezone: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
};

type Site = SiteForm & {
  id: string;
  public_id: string;
  qr_target_url: string;
  qr_storage_path: string | null;
  fastfield_source_site_id: string | null;
  last_fastfield_submission_id: string | null;
  updated_at: string;
  fastfield_sync: {
    status: string;
    error_message: string | null;
    last_synced_at: string | null;
  } | null;
};

const EMPTY_FORM: SiteForm = {
  site_code: "",
  facility_name: "",
  address: "",
  city: "",
  state: "",
  zip: "",
  timezone: "America/New_York",
  contact_name: "",
  contact_email: "",
  contact_phone: "",
};

function formFromSite(site: Site): SiteForm {
  return {
    site_code: site.site_code,
    facility_name: site.facility_name,
    address: site.address ?? "",
    city: site.city ?? "",
    state: site.state ?? "",
    zip: site.zip ?? "",
    timezone: site.timezone,
    contact_name: site.contact_name ?? "",
    contact_email: site.contact_email ?? "",
    contact_phone: site.contact_phone ?? "",
  };
}

function SyncBadge({ status }: { status: string | null }) {
  const classes =
    status === "synced"
      ? "bg-accent/10 text-accent"
      : status === "failed"
        ? "bg-danger/10 text-danger"
        : "bg-border/50 text-muted";
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${classes}`}
    >
      {status ?? "not synced"}
    </span>
  );
}

export default function SiteManagementPage() {
  const [sites, setSites] = useState<Site[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<SiteForm>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [action, setAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [qrVersion, setQrVersion] = useState(0);

  const selected = sites.find((site) => site.public_id === selectedId) ?? null;

  async function loadSites(preferredId?: string) {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/sites");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to load sites.");
      const loaded = (data.sites ?? []) as Site[];
      setSites(loaded);
      const nextId = preferredId ?? selectedId;
      if (nextId) {
        const next = loaded.find((site) => site.public_id === nextId);
        if (next) {
          setSelectedId(next.public_id);
          setForm(formFromSite(next));
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sites.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSites();
    // The initial list load should run once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function selectSite(site: Site) {
    setSelectedId(site.public_id);
    setForm(formFromSite(site));
    setError(null);
    setMessage(null);
  }

  function startNewSite() {
    setSelectedId(null);
    setForm(EMPTY_FORM);
    setError(null);
    setMessage(null);
  }

  function updateField(field: keyof SiteForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function saveSite(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(
        selectedId
          ? `/api/admin/sites/${encodeURIComponent(selectedId)}`
          : "/api/admin/sites",
        {
          method: selectedId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to save site.");
      setMessage(
        `${data.site.site_code} ${selectedId ? "updated" : "created"}. FastField sync: ${data.sync.status}.`,
      );
      await loadSites(data.site.public_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save site.");
    } finally {
      setSaving(false);
    }
  }

  async function runAction(kind: "sync" | "regenerate-qr") {
    if (!selected) return;
    setAction(kind);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/admin/sites/${encodeURIComponent(selected.public_id)}/${kind}`,
        { method: "POST" },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Action failed.");
      if (kind === "regenerate-qr") {
        setQrVersion(Date.now());
        setMessage("QR code regenerated.");
      } else {
        setMessage(`FastField sync status: ${data.sync.status}.`);
      }
      await loadSites(selected.public_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed.");
    } finally {
      setAction(null);
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-medium tracking-wide text-accent uppercase">
            Admin
          </p>
          <h2 className="text-2xl font-semibold text-foreground">
            Site management
          </h2>
          <p className="mt-1 text-sm text-muted">
            Create and maintain site records, QR codes, and FastField sync.
          </p>
        </div>
        <Link href="/admin" className="text-sm text-accent hover:underline">
          Back
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.75fr)]">
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">
              Sites ({sites.length})
            </h3>
            <button
              type="button"
              onClick={startNewSite}
              className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover"
            >
              New site
            </button>
          </div>

          {loading ? (
            <p className="text-sm text-muted">Loading sites…</p>
          ) : sites.length === 0 ? (
            <div className="rounded-xl border border-border bg-panel p-5 text-sm text-muted">
              No sites have been created yet.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border bg-panel">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-border bg-background">
                  <tr>
                    <th className="px-3 py-2 font-medium">Code</th>
                    <th className="px-3 py-2 font-medium">Facility</th>
                    <th className="px-3 py-2 font-medium">Contact</th>
                    <th className="px-3 py-2 font-medium">FastField</th>
                  </tr>
                </thead>
                <tbody>
                  {sites.map((site) => (
                    <tr
                      key={site.id}
                      onClick={() => selectSite(site)}
                      className={`cursor-pointer border-b border-border transition hover:bg-background ${
                        selectedId === site.public_id ? "bg-accent/5" : ""
                      }`}
                    >
                      <td className="px-3 py-3 font-mono font-medium">
                        {site.site_code}
                      </td>
                      <td className="px-3 py-3">
                        <p className="font-medium">{site.facility_name}</p>
                        <p className="font-mono text-xs text-muted">
                          {site.public_id}
                        </p>
                      </td>
                      <td className="px-3 py-3 text-muted">
                        {site.contact_name || "—"}
                      </td>
                      <td className="px-3 py-3">
                        <SyncBadge status={site.fastfield_sync?.status ?? null} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="space-y-4">
          <form
            onSubmit={saveSite}
            className="space-y-4 rounded-xl border border-border bg-panel p-5"
          >
            <div>
              <h3 className="text-sm font-semibold text-foreground">
                {selected ? `Edit ${selected.site_code}` : "Create site"}
              </h3>
              {selected ? (
                <p className="mt-1 font-mono text-xs text-muted">
                  {selected.public_id}
                </p>
              ) : null}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-1.5 text-sm">
                <span className="font-medium">Site code</span>
                <input
                  required
                  minLength={3}
                  maxLength={4}
                  pattern="[A-Za-z0-9]{3,4}"
                  value={form.site_code}
                  onChange={(event) =>
                    updateField("site_code", event.target.value.toUpperCase())
                  }
                  className="w-full rounded-md border border-border px-3 py-2 uppercase"
                  placeholder="CAP"
                />
              </label>
              <label className="space-y-1.5 text-sm">
                <span className="font-medium">Timezone</span>
                <input
                  required
                  value={form.timezone}
                  onChange={(event) =>
                    updateField("timezone", event.target.value)
                  }
                  className="w-full rounded-md border border-border px-3 py-2"
                />
              </label>
            </div>

            <label className="block space-y-1.5 text-sm">
              <span className="font-medium">Facility name</span>
              <input
                required
                value={form.facility_name}
                onChange={(event) =>
                  updateField("facility_name", event.target.value)
                }
                className="w-full rounded-md border border-border px-3 py-2"
                placeholder="Cape Coral VA Medical Center"
              />
            </label>

            <label className="block space-y-1.5 text-sm">
              <span className="font-medium">Street address</span>
              <input
                value={form.address}
                onChange={(event) => updateField("address", event.target.value)}
                className="w-full rounded-md border border-border px-3 py-2"
              />
            </label>

            <div className="grid gap-4 sm:grid-cols-3">
              <label className="space-y-1.5 text-sm">
                <span className="font-medium">City</span>
                <input
                  value={form.city}
                  onChange={(event) => updateField("city", event.target.value)}
                  className="w-full rounded-md border border-border px-3 py-2"
                />
              </label>
              <label className="space-y-1.5 text-sm">
                <span className="font-medium">State</span>
                <input
                  value={form.state}
                  onChange={(event) =>
                    updateField("state", event.target.value.toUpperCase())
                  }
                  className="w-full rounded-md border border-border px-3 py-2 uppercase"
                />
              </label>
              <label className="space-y-1.5 text-sm">
                <span className="font-medium">ZIP</span>
                <input
                  value={form.zip}
                  onChange={(event) => updateField("zip", event.target.value)}
                  className="w-full rounded-md border border-border px-3 py-2"
                />
              </label>
            </div>

            <div className="border-t border-border pt-4">
              <p className="mb-3 text-xs font-medium tracking-wide text-muted uppercase">
                Primary contact
              </p>
              <div className="space-y-3">
                <input
                  aria-label="Contact name"
                  value={form.contact_name}
                  onChange={(event) =>
                    updateField("contact_name", event.target.value)
                  }
                  className="w-full rounded-md border border-border px-3 py-2 text-sm"
                  placeholder="Contact name"
                />
                <input
                  aria-label="Contact email"
                  type="email"
                  value={form.contact_email}
                  onChange={(event) =>
                    updateField("contact_email", event.target.value)
                  }
                  className="w-full rounded-md border border-border px-3 py-2 text-sm"
                  placeholder="Contact email"
                />
                <input
                  aria-label="Contact phone"
                  value={form.contact_phone}
                  onChange={(event) =>
                    updateField("contact_phone", event.target.value)
                  }
                  className="w-full rounded-md border border-border px-3 py-2 text-sm"
                  placeholder="Contact phone"
                />
              </div>
            </div>

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
              {saving ? "Saving…" : selected ? "Save changes" : "Create site"}
            </button>
          </form>

          {selected ? (
            <div className="space-y-4 rounded-xl border border-border bg-panel p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">
                    Site QR code
                  </h3>
                  <p className="mt-1 text-xs text-muted">
                    Encodes the stable BoilerOps site URL.
                  </p>
                </div>
                <SyncBadge status={selected.fastfield_sync?.status ?? null} />
              </div>

              <div className="flex justify-center rounded-lg border border-border bg-white p-4">
                <Image
                  key={qrVersion}
                  src={`/i/site/${encodeURIComponent(selected.public_id)}/qr?v=${qrVersion}`}
                  alt={`QR code for ${selected.facility_name}`}
                  width={220}
                  height={220}
                  unoptimized
                />
              </div>

              {selected.fastfield_sync?.error_message ? (
                <p className="text-xs text-danger">
                  {selected.fastfield_sync.error_message}
                </p>
              ) : null}

              <div className="grid gap-2 sm:grid-cols-2">
                <a
                  href={`/i/site/${encodeURIComponent(selected.public_id)}/qr`}
                  download={`${selected.site_code}-site-qr.png`}
                  className="rounded-md border border-border px-3 py-2 text-center text-sm font-medium hover:border-accent"
                >
                  Download QR
                </a>
                <a
                  href={`/i/site/${encodeURIComponent(selected.public_id)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-md border border-border px-3 py-2 text-center text-sm font-medium hover:border-accent"
                >
                  View site JSON
                </a>
                <button
                  type="button"
                  disabled={action !== null}
                  onClick={() => void runAction("regenerate-qr")}
                  className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:border-accent disabled:opacity-60"
                >
                  {action === "regenerate-qr" ? "Regenerating…" : "Regenerate QR"}
                </button>
                <button
                  type="button"
                  disabled={action !== null}
                  onClick={() => void runAction("sync")}
                  className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:border-accent disabled:opacity-60"
                >
                  {action === "sync" ? "Syncing…" : "Sync FastField"}
                </button>
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
