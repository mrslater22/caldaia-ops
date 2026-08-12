"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type SampleEvent = {
  id: string;
  external_id: string | null;
  status: string;
  created_at: string;
  payload_json: Record<string, unknown>;
};

export default function FastFieldSamplePage() {
  const [samples, setSamples] = useState<SampleEvent[]>([]);
  const [selected, setSelected] = useState<SampleEvent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const captureUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/api/fastfield/sample`;
  }, []);

  async function loadSamples() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/fastfield-samples");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load samples.");
      const next = (data.samples ?? []) as SampleEvent[];
      setSamples(next);
      if (!selected && next[0]) setSelected(next[0]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load samples.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSamples();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function copyUrl() {
    await navigator.clipboard.writeText(captureUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function copyJson() {
    if (!selected) return;
    await navigator.clipboard.writeText(
      JSON.stringify(selected.payload_json, null, 2),
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-medium tracking-wide text-accent uppercase">
            Admin
          </p>
          <h2 className="text-2xl font-semibold text-foreground">
            FastField sample capture
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Point your test form&apos;s HTTP/HTTPS delivery at this URL, submit
            once, then refresh. This only stores raw JSON — it does not create
            boilers or devices.
          </p>
        </div>
        <Link href="/admin" className="text-sm text-accent hover:underline">
          Back
        </Link>
      </div>

      <section className="space-y-3 rounded-xl border border-border bg-panel p-5">
        <h3 className="text-sm font-semibold text-foreground">
          Capture URL (POST)
        </h3>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <code className="flex-1 break-all rounded-md bg-background px-3 py-2 text-sm">
            {captureUrl || "/api/fastfield/sample"}
          </code>
          <button
            type="button"
            onClick={() => void copyUrl()}
            className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent-hover"
          >
            {copied ? "Copied" : "Copy URL"}
          </button>
        </div>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-muted">
          <li>FastField Form Builder → Delivery → HTTP/HTTPS</li>
          <li>Format: JSON</li>
          <li>Paste the URL above</li>
          <li>Submit the test form, then click Refresh</li>
        </ol>
      </section>

      {error ? (
        <p className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">
          Captured samples
        </h3>
        <button
          type="button"
          onClick={() => void loadSamples()}
          className="rounded-md border border-border bg-white px-3 py-1.5 text-sm"
        >
          Refresh
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : samples.length === 0 ? (
        <p className="text-sm text-muted">
          No samples yet. Submit the FastField form to the capture URL.
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
          <ul className="space-y-2">
            {samples.map((sample) => (
              <li key={sample.id}>
                <button
                  type="button"
                  onClick={() => setSelected(sample)}
                  className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${
                    selected?.id === sample.id
                      ? "border-accent bg-accent/5"
                      : "border-border bg-panel"
                  }`}
                >
                  <p className="font-medium text-foreground">
                    {new Date(sample.created_at).toLocaleString()}
                  </p>
                  <p className="font-mono text-xs text-muted">
                    {sample.id.slice(0, 8)}
                  </p>
                </button>
              </li>
            ))}
          </ul>

          {selected ? (
            <div className="rounded-xl border border-border bg-panel p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h4 className="text-sm font-semibold text-foreground">
                  Raw JSON
                </h4>
                <button
                  type="button"
                  onClick={() => void copyJson()}
                  className="text-sm text-accent hover:underline"
                >
                  Copy JSON
                </button>
              </div>
              <pre className="max-h-[36rem] overflow-auto rounded-md bg-background p-3 text-xs">
                {JSON.stringify(selected.payload_json, null, 2)}
              </pre>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
