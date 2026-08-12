import { Suspense } from "react";
import LoginPage from "./page-client";

export default function LoginRoute() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center text-sm text-muted">
          Loading…
        </main>
      }
    >
      <LoginPage />
    </Suspense>
  );
}
