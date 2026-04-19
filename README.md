# GearUp Servicing

Production-grade vehicle servicing management system.

## Stack

- **Frontend:** Next.js 14 (App Router) on Vercel
- **Backend:** Express.js on Render
- **Database:** Supabase Postgres via Prisma
- **Storage:** Supabase Storage
- **Monitoring:** Sentry
- **Monorepo:** pnpm workspaces + Turborepo

## Getting Started

```bash
pnpm install
cp .env.example .env   # fill in values
pnpm db:generate
pnpm db:push
pnpm db:seed
pnpm dev
```

Frontend: http://localhost:3000 Backend: http://localhost:4000 .. ..

## Project Structure

```
apps/web    – Next.js frontend
apps/api    – Express backend
packages/   – Shared packages (types, db, config, notifications, ui)
docs/       – Architecture, deployment, API contracts, RBAC, QA
```

See `docs/` for full documentation.
