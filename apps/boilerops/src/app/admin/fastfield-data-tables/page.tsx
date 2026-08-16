"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

type DataTableConfig = {
  id: string;
  purpose: string;
  name: string;
  fastfield_table_id: string | null;
  sync_url: string | null;
  http_method: "POST" | "PUT" | "PATCH";
  upsert_key: string;
  field_mappings_json: Record<string, string>;
  active: boolean;
  updated_at: string;
};

type ConfigForm = {
  purpose: string;
  name: string;
  fastfield_table_id: string;
  sync_url: string;
  http_method: "POST" | "PUT" | "PATCH";
  upsert_key: string;
  mappings: string;
  active: boolean;
};

const PURPOSES = [
  { value: "site_info", label: "Site Info", upsertKey: "bo_siteid" },
  {
    value: "inspection_info",
    label: "Inspection Info",
    upsertKey: "bo_targetid",
  },
  { value: "device_info", label: "Device Info", upsertKey: "bo_deviceid" },
];

const DEFAULT_MAPPINGS: Record<string, Record<string, string>> = {
  site_info: {
    bo_siteid: "public_id",
    bo_qrcode: "qr_target_url",
    site_code: "site_code",
    va_loc: "facility_name",
    va_contact: "contact_name",
    va_contact_email: "contact_email",
    va_contact_phone: "contact_phone",
  },
  inspection_info: {
    bo_targetid: "public_id",
    bo_siteid: "site.public_id",
    inspection_scope: "target_type",
    inspection_code: "target_code",
    inspection_name: "display_name",
  },
  device_info: {
    bo_deviceid: "public_id",
    bo_targetid: "inspection_target.public_id",
    bo_siteid: "inspection_target.site.public_id",
    device_code: "device_code",
    device_type: "device_type",
    manufacturer: "manufacturer",
    model: "model",
    serial_number: "serial_number",
  },
};

function emptyForm(purpose = "site_info"): ConfigForm {
  const definition = PURPOSES.find((item) => item.value === purpose)!;
  return {
    purpose,
    name: definition.label,
    fastfield_table_id: "",
    sync_url: "",
    http_method: "POST",
    upsert_key: definition.upsertKey,
    mappings: JSON.stringify(DEFAULT_MAPPINGS[purpose], null, 2),
    active: true,
  };
}

function formFromConfig(config: DataTableConfig): ConfigForm {
  return {
    purpose: config.purpose,
    name: config.name,
    fastfield_table_id: config.fastfield_table_id ?? "",
    sync_url: config.sync_url ?? "",
    http_method: config.http_method,
    upsert_key: config.upsert_key,
    mappings: JSON.stringify(config.field_mappings_json, null, 2),
    active: config.active,
  };
}

export default function FastFieldDataTablesPage() {
  const [configs, setConfigs] = useState<DataTableConfig[]>([]);
  const [limit, setLimit] = useState(3);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<ConfigForm>(emptyForm());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const selected =
    configs.find((config) => config.id === selectedId) ?? null;

  async function loadConfigs(preferredId?: string) {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/fastfield-data-tables");
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to load Data Tables.");
      }
      const loaded = (data.data_tables ?? []) as DataTableConfig[];
      setConfigs(loaded);
      setLimit(data.limit ?? 3);
      const nextId = preferredId ?? selectedId;
      if (nextId) {
        const next = loaded.find((config) => config.id === nextId);
        if (next) {
          setSelectedId(next.id);
          setForm(formFromConfig(next));
        }
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load Data Tables.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadConfigs();
    // The initial list load should run once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function chooseConfig(config: DataTableConfig) {
    setSelectedId(config.id);
    setForm(formFromConfig(config));
    setError(null);
    setMessage(null);
  }

  function startNew() {
    const available =
      PURPOSES.find(
        (purpose) =>
          !configs.some((config) => config.purpose === purpose.value),
      ) ?? PURPOSES[0];
    setSelectedId(null);
    setForm(emptyForm(available.value));
    setError(null);
    setMessage(null);
  }

  function changePurpose(purpose: string) {
    setForm(emptyForm(purpose));
  }

  async function saveConfig(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      let mappings: unknown;
      try {
        mappings = JSON.parse(form.mappings);
      } catch {
        throw new Error("Field mappings must be valid JSON.");
      }
      if (
        !mappings ||
        typeof mappings !== "object" ||
        Array.isArray(mappings)
      ) {
        throw new Error("Field mappings must be a JSON object.");
      }

      const response = await fetch(
        selectedId
          ? `/api/admin/fastfield-data-tables/${selectedId}`
          : "/api/admin/fastfield-data-tables",
        {
          method: selectedId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            purpose: form.purpose,
            name: form.name,
            fastfield_table_id: form.fastfield_table_id,
            sync_url: form.sync_url,
            http_method: form.http_method,
            upsert_key: form.upsert_key,
            field_mappings_json: mappings,
            active: form.active,
          }),
        },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Save failed.");
      setMessage(`${data.data_table.name} configuration saved.`);
      await loadConfigs(data.data_table.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
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
            FastField Data Tables
          </h2>
          <p className="mt-1 text-sm text-muted">
            Configure the three outbound tables without storing API credentials
            in the database.
          </p>
        </div>
        <Link href="/admin" className="text-sm text-accent hover:underline">
          Back
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(440px,1.2fr)]">
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-foreground">
              Configured tables ({configs.length}/{limit})
            </h3>
            <button
              type="button"
              onClick={startNew}
              disabled={configs.length >= limit}
              className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              New configuration
            </button>
          </div>

          {loading ? (
            <p className="text-sm text-muted">Loading configurations…</p>
          ) : configs.length === 0 ? (
            <div className="rounded-xl border border-border bg-panel p-5 text-sm text-muted">
              No Data Table configurations exist. Apply migration{" "}
              <code>20260814_fastfield_data_table_config.sql</code>.
            </div>
          ) : (
            <div className="space-y-3">
              {configs.map((config) => (
                <button
                  key={config.id}
                  type="button"
                  onClick={() => chooseConfig(config)}
                  className={`w-full rounded-xl border bg-panel p-4 text-left transition ${
                    selectedId === config.id
                      ? "border-accent"
                      : "border-border hover:border-accent"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-foreground">
                        {config.name}
                      </p>
                      <p className="mt-1 font-mono text-xs text-muted">
                        {config.purpose}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        config.active
                          ? "bg-accent/10 text-accent"
                          : "bg-border/50 text-muted"
                      }`}
                    >
                      {config.active ? "active" : "inactive"}
                    </span>
                  </div>
                  <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <dt className="text-muted">Table ID</dt>
                      <dd className="mt-0.5 truncate font-mono">
                        {config.fastfield_table_id || "not set"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted">Endpoint</dt>
                      <dd className="mt-0.5">
                        {config.sync_url ? "configured" : "not configured"}
                      </dd>
                    </div>
                  </dl>
                </button>
              ))}
            </div>
          )}

          <div className="rounded-xl border border-border bg-panel p-4">
            <p className="text-xs font-semibold text-foreground">
              Credentials remain protected
            </p>
            <p className="mt-1 text-xs leading-5 text-muted">
              API and user tokens stay in Vercel environment variables. This
              page manages only table metadata and field mappings.
            </p>
          </div>
        </section>

        <form
          onSubmit={saveConfig}
          className="space-y-5 rounded-xl border border-border bg-panel p-5"
        >
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              {selected ? `Edit ${selected.name}` : "New configuration"}
            </h3>
            <p className="mt-1 text-xs text-muted">
              Deactivate a table instead of deleting it to preserve sync
              history.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1.5 text-sm">
              <span className="font-medium">Purpose</span>
              <select
                value={form.purpose}
                disabled={Boolean(selected)}
                onChange={(event) => changePurpose(event.target.value)}
                className="w-full rounded-md border border-border px-3 py-2 disabled:bg-background disabled:text-muted"
              >
                {PURPOSES.map((purpose) => (
                  <option
                    key={purpose.value}
                    value={purpose.value}
                    disabled={configs.some(
                      (config) =>
                        config.purpose === purpose.value &&
                        config.id !== selectedId,
                    )}
                  >
                    {purpose.value}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="font-medium">Display name</span>
              <input
                required
                value={form.name}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                className="w-full rounded-md border border-border px-3 py-2"
              />
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1.5 text-sm">
              <span className="font-medium">FastField Table ID</span>
              <input
                value={form.fastfield_table_id}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    fastfield_table_id: event.target.value,
                  }))
                }
                className="w-full rounded-md border border-border px-3 py-2 font-mono text-sm"
                placeholder="Account table identifier"
              />
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="font-medium">Upsert key</span>
              <input
                required
                value={form.upsert_key}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    upsert_key: event.target.value,
                  }))
                }
                className="w-full rounded-md border border-border px-3 py-2 font-mono text-sm"
              />
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-[120px_1fr]">
            <label className="space-y-1.5 text-sm">
              <span className="font-medium">Method</span>
              <select
                value={form.http_method}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    http_method: event.target.value as ConfigForm["http_method"],
                  }))
                }
                className="w-full rounded-md border border-border px-3 py-2"
              >
                <option>POST</option>
                <option>PUT</option>
                <option>PATCH</option>
              </select>
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="font-medium">Row upsert endpoint</span>
              <input
                type="url"
                value={form.sync_url}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    sync_url: event.target.value,
                  }))
                }
                className="w-full rounded-md border border-border px-3 py-2 font-mono text-xs"
                placeholder="https://api.fastfieldforms.com/..."
              />
            </label>
          </div>

          <label className="block space-y-1.5 text-sm">
            <span className="font-medium">
              Field mappings (FastField column → BoilerOps field)
            </span>
            <textarea
              required
              rows={13}
              value={form.mappings}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  mappings: event.target.value,
                }))
              }
              className="w-full rounded-md border border-border px-3 py-2 font-mono text-xs"
            />
          </label>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  active: event.target.checked,
                }))
              }
              className="size-4"
            />
            <span className="font-medium">Active for synchronization</span>
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
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save configuration"}
          </button>
        </form>
      </div>
    </div>
  );
}
