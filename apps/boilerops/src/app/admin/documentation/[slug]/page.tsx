import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ADMIN_DOCUMENTS,
  getAdminDocument,
  type DocumentationTone,
} from "@/lib/admin-documentation";
import { PrintButton } from "../print-button";

type Params = { params: Promise<{ slug: string }> };

const toneClasses: Record<DocumentationTone, string> = {
  neutral: "border-border bg-panel text-foreground",
  info: "border-accent/30 bg-accent/5 text-foreground",
  warning: "border-amber-500/30 bg-amber-500/5 text-foreground",
  success: "border-emerald-600/30 bg-emerald-600/5 text-foreground",
};

export function generateStaticParams() {
  return ADMIN_DOCUMENTS.map((document) => ({ slug: document.slug }));
}

export default async function AdminDocumentPage({ params }: Params) {
  const { slug } = await params;
  const document = getAdminDocument(slug);
  if (!document) notFound();

  return (
    <article className="space-y-8 print:space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium tracking-wide text-accent uppercase">
            {document.category}
          </p>
          <h2 className="text-2xl font-semibold text-foreground">
            {document.title}
          </h2>
          <p className="mt-2 max-w-3xl text-sm text-muted">
            {document.summary}
          </p>
          <p className="mt-2 text-xs text-muted">
            Updated {document.updated}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2 print:hidden">
          <Link
            href="/admin/documentation"
            className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:border-accent"
          >
            All documents
          </Link>
          <PrintButton />
        </div>
      </div>

      {document.stats ? (
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {document.stats.map((stat) => (
            <div
              key={`${stat.value}-${stat.label}`}
              className={`rounded-xl border p-4 ${
                toneClasses[stat.tone ?? "neutral"]
              }`}
            >
              <p className="text-xl font-semibold">{stat.value}</p>
              <p className="mt-1 text-xs text-muted">{stat.label}</p>
            </div>
          ))}
        </section>
      ) : null}

      {document.callout ? (
        <section
          className={`rounded-xl border p-5 ${
            toneClasses[document.callout.tone]
          }`}
        >
          <h3 className="text-sm font-semibold">{document.callout.title}</h3>
          <p className="mt-2 text-sm text-muted">{document.callout.body}</p>
        </section>
      ) : null}

      {document.sections.map((section) => (
        <section
          key={section.title}
          className="space-y-3 break-inside-avoid"
        >
          <h3 className="text-lg font-semibold text-foreground">
            {section.title}
          </h3>
          {section.intro ? (
            <p className="text-sm text-muted">{section.intro}</p>
          ) : null}
          {section.bullets ? (
            <ul className="list-disc space-y-2 pl-5 text-sm text-foreground">
              {section.bullets.map((bullet) => (
                <li key={bullet}>{bullet}</li>
              ))}
            </ul>
          ) : null}
          {section.table ? (
            <div className="overflow-x-auto rounded-xl border border-border bg-panel">
              <table className="min-w-full border-collapse text-left text-sm">
                <thead className="bg-background">
                  <tr>
                    {section.table.headers.map((header) => (
                      <th
                        key={header}
                        className="border-b border-border px-3 py-2 font-medium text-foreground"
                      >
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {section.table.rows.map((row, rowIndex) => (
                    <tr
                      key={`${section.title}-${rowIndex}`}
                      className="border-b border-border last:border-b-0"
                    >
                      {row.map((cell, cellIndex) => (
                        <td
                          key={`${rowIndex}-${cellIndex}`}
                          className={`px-3 py-2 align-top ${
                            cellIndex === 0
                              ? "font-medium text-foreground"
                              : "text-muted"
                          }`}
                        >
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      ))}

      <footer className="border-t border-border pt-4 text-xs text-muted">
        Source: {document.source}
      </footer>
    </article>
  );
}
