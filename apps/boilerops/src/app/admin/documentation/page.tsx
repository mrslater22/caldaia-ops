import Link from "next/link";
import { ADMIN_DOCUMENTS } from "@/lib/admin-documentation";

export default function AdminDocumentationPage() {
  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium tracking-wide text-accent uppercase">
            Admin
          </p>
          <h2 className="text-2xl font-semibold text-foreground">
            Documentation
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Native, printable versions of the BoilerOps planning and analysis
            canvases. These pages remain available with the deployed control
            panel and do not require Cursor.
          </p>
        </div>
        <Link href="/admin" className="text-sm text-accent hover:underline">
          Back
        </Link>
      </div>

      <section className="grid gap-4 md:grid-cols-2">
        {ADMIN_DOCUMENTS.map((document) => (
          <Link
            key={document.slug}
            href={`/admin/documentation/${document.slug}`}
            className="rounded-xl border border-border bg-panel p-5 transition hover:border-accent"
          >
            <p className="text-xs font-medium tracking-wide text-accent uppercase">
              {document.category}
            </p>
            <h3 className="mt-2 text-base font-semibold text-foreground">
              {document.title}
            </h3>
            <p className="mt-2 text-sm text-muted">{document.summary}</p>
            <div className="mt-4 flex items-center justify-between gap-3 text-xs text-muted">
              <span>Updated {document.updated}</span>
              <span className="font-medium text-accent">Open document</span>
            </div>
          </Link>
        ))}
      </section>

      <section className="rounded-xl border border-border bg-panel p-5">
        <h3 className="text-sm font-semibold text-foreground">
          Printing and distribution
        </h3>
        <p className="mt-2 text-sm text-muted">
          Open any document and choose Print. The browser print dialog can send
          it to a printer or save it as a PDF for client documentation.
        </p>
      </section>
    </div>
  );
}
