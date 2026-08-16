"use client";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:border-accent print:hidden"
    >
      Print / Save PDF
    </button>
  );
}
