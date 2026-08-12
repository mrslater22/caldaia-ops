"use client";

import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") || "/admin";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        setError(data.error || "Unable to sign in.");
        return;
      }

      router.replace(nextPath);
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_#d9e6ea,_#f4f6f8_45%,_#eef1f4)] px-4 py-16">
      <div className="mx-auto flex w-full max-w-md flex-col gap-8">
        <div className="space-y-2">
          <p className="text-sm font-medium tracking-[0.18em] text-accent uppercase">
            Caldaia Controls
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">
            BoilerOps
          </h1>
          <p className="text-sm text-muted">
            Super admin sign-in for the proof-of-concept portal.
          </p>
        </div>

        <form
          onSubmit={onSubmit}
          className="rounded-xl border border-border bg-panel p-6"
        >
          <div className="space-y-4">
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-foreground">Email</span>
              <input
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm outline-none ring-accent focus:ring-2"
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-foreground">
                Password
              </span>
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm outline-none ring-accent focus:ring-2"
              />
            </label>

            {error ? (
              <p className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-md bg-accent px-3 py-2.5 text-sm font-medium text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
