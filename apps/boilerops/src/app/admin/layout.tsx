import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { LogoutButton } from "@/components/logout-button";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-panel print:hidden">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4">
          <div>
            <p className="text-xs font-medium tracking-[0.16em] text-accent uppercase">
              Caldaia Controls
            </p>
            <h1 className="text-lg font-semibold text-foreground">
              BoilerOps Admin
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/admin/documentation"
              className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:border-accent"
            >
              Documentation
            </Link>
            <div className="text-right">
              <p className="text-sm font-medium text-foreground">
                {session.name}
              </p>
              <p className="text-xs text-muted">{session.email}</p>
            </div>
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
