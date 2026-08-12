# BoilerOps Portal

Next.js App Router proof-of-concept for Caldaia Controls.

## Run locally

```bash
cd apps/portal
cp .env.example .env.local
# edit SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD, AUTH_SECRET
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and sign in with the super admin credentials from `.env.local`.

## Auth (POC)

Env-based super admin session (JWT cookie via `jose`). This is temporary until Supabase Auth is wired for multi-tenant portal users.

## Next

1. FastField boiler onboarding webhook → DB
2. QR codes for boiler + devices
3. QR scan → API prefill for field testing forms
