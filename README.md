# GearUp Servicing

Production-grade vehicle servicing management system.

## Stack

- **App:** Next.js 14 (App Router) on Vercel — frontend + API Route Handlers
- **Database:** Supabase Postgres via Prisma
- **Auth:** Custom JWT + RBAC (bcrypt passwords, role-based permissions)
- **Monitoring:** Sentry
- **Monorepo:** pnpm workspaces + Turborepo

## Getting Started

```bash
pnpm install
cp .env.example .env   # fill in Supabase + JWT values
pnpm db:generate
pnpm db:push
pnpm dev
```

App: http://localhost:3000
API: http://localhost:3000/api

## Project Structure

```
apps/web/                    – Next.js app (frontend + API)
  src/app/api/               – Route Handlers (replaces Express)
    admin/auth/              – Login, me, change-password
    admin/customers/         – CRUD + history
    admin/vehicles/          – CRUD
    admin/workers/           – CRUD + leave
    admin/appointments/      – CRUD + status actions
    admin/job-cards/         – CRUD + tasks, parts, workers
    admin/inventory/         – Items, categories, suppliers, stock
    admin/invoices/          – CRUD + finalize + payments
    admin/expenses/          – CRUD + categories
    admin/service-requests/  – List, get, update status
    admin/notifications/     – List, retry
    admin/settings/          – Key-value settings
    admin/reports/           – Dashboard, revenue, jobs
    admin/logs/              – Activity log viewer
    public/                  – Service requests, slots, tracking
    health/                  – DB health check
  src/lib/                   – Prisma client, auth, helpers
  prisma/schema.prisma       – Database schema
packages/types/              – Shared types, RBAC permissions
packages/ui/                 – Shared UI components
```

## API Authentication

All `/api/admin/*` routes require a Bearer token.
Public routes (`/api/public/*`, `/api/health`) require no auth.

```bash
# Login
curl -X POST http://localhost:3000/api/admin/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"adminUserId": "admin", "password": "your-password"}'

# Use token
curl http://localhost:3000/api/admin/customers \
  -H 'Authorization: Bearer <token>'
```
