import Link from "next/link";

export default function AdminDashboardPage() {
  return (
    <div className="space-y-8">
      <section className="space-y-2">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">
          Operations console
        </h2>
        <p className="max-w-2xl text-sm text-muted">
          Plan inspection jobs, manage assets, and administer FastField
          integrations. Prefill JSON lives at{" "}
          <code className="text-foreground">/i/site/&#123;id&#125;</code>,{" "}
          <code className="text-foreground">/i/job/&#123;id&#125;</code>,{" "}
          <code className="text-foreground">/i/boiler/&#123;id&#125;</code> and{" "}
          <code className="text-foreground">/i/device/&#123;id&#125;</code>.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <Link
          href="/admin/documentation"
          className="rounded-xl border border-border bg-panel p-5 transition hover:border-accent"
        >
          <p className="text-xs font-medium tracking-wide text-accent uppercase">
            Reference
          </p>
          <h3 className="mt-2 text-base font-semibold text-foreground">
            Documentation library
          </h3>
          <p className="mt-2 text-sm text-muted">
            View and print native control-panel versions of the planning,
            architecture, report-review, and FastField device canvases.
          </p>
        </Link>

        <Link
          href="/admin/inspection-jobs"
          className="rounded-xl border border-border bg-panel p-5 transition hover:border-accent"
        >
          <p className="text-xs font-medium tracking-wide text-accent uppercase">
            Operations
          </p>
          <h3 className="mt-2 text-base font-semibold text-foreground">
            Inspection job planning
          </h3>
          <p className="mt-2 text-sm text-muted">
            Generate job numbers, assign Site and Boiler/Plant scope, and issue
            job QR codes for field work.
          </p>
        </Link>

        <Link
          href="/admin/sites"
          className="rounded-xl border border-border bg-panel p-5 transition hover:border-accent"
        >
          <p className="text-xs font-medium tracking-wide text-accent uppercase">
            Sites
          </p>
          <h3 className="mt-2 text-base font-semibold text-foreground">
            Site management
          </h3>
          <p className="mt-2 text-sm text-muted">
            Maintain site details, inspect FastField sync status, and view or
            download site QR codes.
          </p>
        </Link>

        <Link
          href="/admin/fastfield-sample"
          className="rounded-xl border border-border bg-panel p-5 transition hover:border-accent"
        >
          <p className="text-xs font-medium tracking-wide text-accent uppercase">
            Sample
          </p>
          <h3 className="mt-2 text-base font-semibold text-foreground">
            Capture FastField JSON
          </h3>
          <p className="mt-2 text-sm text-muted">
            Copy a POST URL, submit your test form, and inspect the raw payload
            before mapping.
          </p>
        </Link>

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
          href="/admin/fastfield-data-tables"
          className="rounded-xl border border-border bg-panel p-5 transition hover:border-accent"
        >
          <p className="text-xs font-medium tracking-wide text-accent uppercase">
            Data Tables
          </p>
          <h3 className="mt-2 text-base font-semibold text-foreground">
            FastField Data Table configuration
          </h3>
          <p className="mt-2 text-sm text-muted">
            Manage Site Info, Inspection Info, and Device Info endpoints,
            identifiers, field mappings, and activation status.
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
