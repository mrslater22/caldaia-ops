"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type IntegrationEvent = {
  id: string;
  event_type: string;
  external_id: string | null;
  fastfield_form_id: string | null;
  status: string;
  error_message: string | null;
  created_at: string;
  processed_at: string | null;
  payload_json: Record<string, unknown>;
};

export default function SubmissionsAdminPage() {
  const [events, setEvents] = useState<IntegrationEvent[]>([]);
  const [selected, setSelected] = useState<IntegrationEvent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function loadEvents() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/submissions");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load submissions.");
      setEvents(data.events ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadEvents();
  }, []);

  async function reprocess(eventId: string) {
    setBusyId(eventId);
    setError(null);
    try {
      const res = await fetch(`/api/admin/submissions/${eventId}/reprocess`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Reprocess failed.");
      await loadEvents();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reprocess failed.");
    } finally {
      setBusyId(null);
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
            Submissions
          </h2>
          <p className="mt-1 text-sm text-muted">
            Inspect FastField ingest events and reprocess after mapping changes.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void loadEvents()}
            className="rounded-md border border-border bg-white px-3 py-1.5 text-sm"
          >
            Refresh
          </button>
          <Link href="/admin" className="text-sm text-accent hover:underline">
            Back
          </Link>
        </div>
      </div>

      {error ? (
        <p className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : events.length === 0 ? (
        <p className="text-sm text-muted">No submissions yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-border bg-panel">
              <tr>
                <th className="px-3 py-2 font-medium">Created</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Submission</th>
                <th className="px-3 py-2 font-medium">Form ID</th>
                <th className="px-3 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id} className="border-b border-border align-top">
                  <td className="px-3 py-2 text-xs text-muted">
                    {new Date(event.created_at).toLocaleString()}
                  </td>
                  <td className="px-3 py-2">
                    <span className="font-medium">{event.status}</span>
                    {event.error_message ? (
                      <p className="mt-1 max-w-xs text-xs text-danger">
                        {event.error_message}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">{event.event_type}</td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {event.external_id ?? "—"}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {event.fastfield_form_id ?? "—"}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-col gap-2">
                      <button
                        type="button"
                        className="text-left text-accent hover:underline"
                        onClick={() => setSelected(event)}
                      >
                        View JSON
                      </button>
                      <button
                        type="button"
                        disabled={busyId === event.id}
                        className="text-left text-foreground hover:underline disabled:opacity-60"
                        onClick={() => void reprocess(event.id)}
                      >
                        {busyId === event.id ? "Reprocessing…" : "Reprocess"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected ? (
        <div className="rounded-xl border border-border bg-panel p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">
              Payload · {selected.external_id ?? selected.id}
            </h3>
            <button
              type="button"
              className="text-sm text-muted hover:text-foreground"
              onClick={() => setSelected(null)}
            >
              Close
            </button>
          </div>
          <pre className="max-h-[28rem] overflow-auto rounded-md bg-background p-3 text-xs">
            {JSON.stringify(selected.payload_json, null, 2)}
          </pre>
        </div>
      ) : null}
    </div>
  );
}
