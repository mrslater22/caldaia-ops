import Link from "next/link";

export default function AdminDashboardPage() {
  return (
    <div className="space-y-8">
      <section className="space-y-2">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">
          Proof-of-concept console
        </h2>
        <p className="max-w-2xl text-sm text-muted">
          Register your FastField form ID + schema, then manage incoming
          submissions. Prefill JSON lives at{" "}
          <code className="text-foreground">/i/boiler/&#123;id&#125;</code> and{" "}
          <code className="text-foreground">/i/device/&#123;id&#125;</code>.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <Link
          href="/admin/fastfield-forms"
          className="rounded-xl border border-border bg-panel p-5 transition hover:border-accent"
        >
          <p className="text-xs font-medium tracking-wide text-accent uppercase">
            Forms
          </p>
          <h3 className="mt-2 text-base font-semibold text-foreground">
            FastField form registry
          </h3>
          <p className="mt-2 text-sm text-muted">
            Store form ID, schema JSON, and field mappings for onboarding
            ingest.
          </p>
        </Link>

        <Link
          href="/admin/submissions"
          className="rounded-xl border border-border bg-panel p-5 transition hover:border-accent"
        >
          <p className="text-xs font-medium tracking-wide text-accent uppercase">
            Submissions
          </p>
          <h3 className="mt-2 text-base font-semibold text-foreground">
            Manage ingest events
          </h3>
          <p className="mt-2 text-sm text-muted">
            Review raw payloads, status, errors, and reprocess failed or
            updated mappings.
          </p>
        </Link>
      </section>

      <section className="rounded-xl border border-border bg-panel p-5">
        <h3 className="text-sm font-semibold text-foreground">
          Ingest endpoint
        </h3>
        <p className="mt-2 text-sm text-muted">
          Point FastField HTTP/HTTPS delivery to{" "}
          <code className="text-foreground">
            POST /api/fastfield/submissions
          </code>{" "}
          on a public HTTPS host.
        </p>
      </section>
    </div>
  );
}
