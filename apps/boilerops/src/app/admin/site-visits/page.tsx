"use client";

import { useEffect, useState } from "react";

type VisitTest = {
  public_id: string;
  device_type: string;
  asset_key: string;
  target_public_id: string;
  fastfield_submission_id: string;
};

type Visit = {
  id: string;
  public_id: string;
  external_visit_id: string;
  status: string;
  created_at: string;
  site: {
    public_id: string;
    site_code: string;
    facility_name: string;
  } | null;
  tests: VisitTest[];
  report: {
    public_id: string;
    status: string;
    device_test_count: number;
  } | null;
};

export default function SiteVisitsPage() {
  const [visits, setVisits] = useState<Visit[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/admin/site-visits");
        const body = await response.json();
        if (!response.ok) {
          throw new Error(body.error || "Failed to load site visits.");
        }
        setVisits(body.visits ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load site visits.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium tracking-wide text-accent uppercase">
          Field
        </p>
        <h2 className="text-2xl font-semibold text-foreground">Site visits</h2>
        <p className="mt-1 max-w-3xl text-sm text-muted">
          High Pressure submissions create one visit per site visit ID, attach
          each boiler or plant test, and mark one site report ready. This list
          is empty until the site-visit migration is applied and a form is
          submitted.
        </p>
      </div>

      {loading ? <p className="text-sm text-muted">Loading visits…</p> : null}
      {error ? (
        <p className="rounded-md border border-border bg-panel px-3 py-2 text-sm text-foreground">
          {error}
        </p>
      ) : null}
      {!loading && !error && visits.length === 0 ? (
        <p className="text-sm text-muted">
          No site visits yet. Submit the High Pressure form, or use the curl
          sample in docs/hp-device-e2e-test.md.
        </p>
      ) : null}

      <div className="space-y-4">
        {visits.map((visit) => (
          <article
            key={visit.id}
            className="rounded-xl border border-border bg-panel p-4"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-base font-semibold text-foreground">
                {visit.external_visit_id}
              </h3>
              <p className="text-xs text-muted">
                {visit.status} · {new Date(visit.created_at).toLocaleString()}
              </p>
            </div>
            <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted">Site</dt>
                <dd>
                  {visit.site
                    ? `${visit.site.site_code} · ${visit.site.facility_name}`
                    : "Unknown site"}
                </dd>
              </div>
              <div>
                <dt className="text-muted">Site public id</dt>
                <dd className="font-mono text-xs">{visit.site?.public_id ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-muted">Visit public id</dt>
                <dd className="font-mono text-xs">{visit.public_id}</dd>
              </div>
              <div>
                <dt className="text-muted">Report</dt>
                <dd>
                  {visit.report
                    ? `${visit.report.status} · ${visit.report.device_test_count} device tests · ${visit.report.public_id}`
                    : "No report row"}
                </dd>
              </div>
            </dl>
            <table className="mt-4 w-full text-left text-sm">
              <thead className="text-xs text-muted">
                <tr>
                  <th className="py-1 pr-3 font-medium">Asset</th>
                  <th className="py-1 pr-3 font-medium">Target</th>
                  <th className="py-1 pr-3 font-medium">Device</th>
                  <th className="py-1 font-medium">Submission</th>
                </tr>
              </thead>
              <tbody>
                {visit.tests.map((test) => (
                  <tr key={test.public_id} className="border-t border-border">
                    <td className="py-2 pr-3">{test.asset_key}</td>
                    <td className="py-2 pr-3 font-mono text-xs">
                      {test.target_public_id}
                    </td>
                    <td className="py-2 pr-3">{test.device_type}</td>
                    <td className="py-2 font-mono text-xs">
                      {test.fastfield_submission_id}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </article>
        ))}
      </div>
    </div>
  );
}
