"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";

type FastFieldForm = {
  id: string;
  fastfield_form_id: string;
  name: string;
  purpose: string;
  schema_json: unknown;
  field_mappings_json: unknown;
  active: boolean;
  notes: string | null;
  created_at: string;
};

const DEFAULT_MAPPINGS = `{
  "facility_name": "facility_name",
  "site_code": "site_code",
  "boiler_tag": "boiler_tag",
  "manufacturer": "boiler_manufacturer",
  "model": "boiler_model",
  "serial_number": "boiler_serial",
  "devices": "devices"
}`;

export default function FastFieldFormsAdminPage() {
  const [forms, setForms] = useState<FastFieldForm[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [formId, setFormId] = useState("");
  const [name, setName] = useState("Boiler Onboarding");
  const [purpose, setPurpose] = useState("boiler_onboarding");
  const [schemaText, setSchemaText] = useState("{\n  \"fields\": []\n}");
  const [mappingsText, setMappingsText] = useState(DEFAULT_MAPPINGS);
  const [notes, setNotes] = useState("");

  async function loadForms() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/fastfield-forms");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load forms.");
      setForms(data.forms ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load forms.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadForms();
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      let schema_json: unknown = {};
      let field_mappings_json: unknown = {};
      try {
        schema_json = JSON.parse(schemaText);
      } catch {
        throw new Error("Schema JSON is invalid.");
      }
      try {
        field_mappings_json = JSON.parse(mappingsText);
      } catch {
        throw new Error("Field mappings JSON is invalid.");
      }

      const res = await fetch("/api/admin/fastfield-forms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fastfield_form_id: formId,
          name,
          purpose,
          schema_json,
          field_mappings_json,
          notes,
          active: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed.");

      setMessage(`Saved form ${data.form.fastfield_form_id}.`);
      setFormId("");
      await loadForms();
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
            FastField forms
          </h2>
          <p className="mt-1 text-sm text-muted">
            Register form ID + schema so ingest knows how to process
            submissions. See{" "}
            <code className="text-foreground">docs/fastfield-form-schema.md</code>
            .
          </p>
        </div>
        <Link href="/admin" className="text-sm text-accent hover:underline">
          Back
        </Link>
      </div>

      <form
        onSubmit={onSubmit}
        className="space-y-4 rounded-xl border border-border bg-panel p-5"
      >
        <h3 className="text-sm font-semibold text-foreground">
          Register / update form
        </h3>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1.5 text-sm">
            <span className="font-medium">FastField form ID</span>
            <input
              required
              value={formId}
              onChange={(e) => setFormId(e.target.value)}
              className="w-full rounded-md border border-border px-3 py-2"
              placeholder="e.g. 12345 or GUID"
            />
          </label>
          <label className="space-y-1.5 text-sm">
            <span className="font-medium">Name</span>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border border-border px-3 py-2"
            />
          </label>
          <label className="space-y-1.5 text-sm">
            <span className="font-medium">Purpose</span>
            <select
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              className="w-full rounded-md border border-border px-3 py-2"
            >
              <option value="boiler_onboarding">boiler_onboarding</option>
            </select>
          </label>
          <label className="space-y-1.5 text-sm">
            <span className="font-medium">Notes</span>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-md border border-border px-3 py-2"
            />
          </label>
        </div>

        <label className="block space-y-1.5 text-sm">
          <span className="font-medium">Schema JSON</span>
          <textarea
            value={schemaText}
            onChange={(e) => setSchemaText(e.target.value)}
            rows={8}
            className="w-full rounded-md border border-border px-3 py-2 font-mono text-xs"
          />
        </label>

        <label className="block space-y-1.5 text-sm">
          <span className="font-medium">
            Field mappings JSON (BoilerOps field → FastField key)
          </span>
          <textarea
            value={mappingsText}
            onChange={(e) => setMappingsText(e.target.value)}
            rows={10}
            className="w-full rounded-md border border-border px-3 py-2 font-mono text-xs"
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
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save form"}
        </button>
      </form>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground">
          Registered forms
        </h3>
        {loading ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : forms.length === 0 ? (
          <p className="text-sm text-muted">
            No forms yet. Run the{" "}
            <code>20260731_fastfield_forms.sql</code> migration, then register
            your onboarding form.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-border bg-panel">
                <tr>
                  <th className="px-3 py-2 font-medium">Form ID</th>
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Purpose</th>
                  <th className="px-3 py-2 font-medium">Active</th>
                </tr>
              </thead>
              <tbody>
                {forms.map((form) => (
                  <tr key={form.id} className="border-b border-border">
                    <td className="px-3 py-2 font-mono text-xs">
                      {form.fastfield_form_id}
                    </td>
                    <td className="px-3 py-2">{form.name}</td>
                    <td className="px-3 py-2">{form.purpose}</td>
                    <td className="px-3 py-2">
                      {form.active ? "yes" : "no"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
