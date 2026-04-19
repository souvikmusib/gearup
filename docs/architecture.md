# GearUp Servicing — Architecture

## Overview

GearUp Servicing is a monorepo-based vehicle servicing management system.

## Stack

| Layer | Technology | Hosting |
|-------|-----------|---------|
| Frontend | Next.js 14 (App Router) | Vercel |
| Backend | Express.js + TypeScript | Render |
| Database | PostgreSQL via Prisma | Supabase |
| Storage | Supabase Storage | Supabase |
| Monitoring | Sentry | Sentry Cloud |
| Monorepo | pnpm workspaces + Turborepo | — |

## Monorepo Structure

```
gearup-servicing/
├── apps/
│   ├── web/          # Next.js frontend (public + admin)
│   └── api/          # Express backend
├── packages/
│   ├── types/        # Shared TypeScript types
│   ├── db/           # Prisma client wrapper
│   ├── ui/           # Shared UI components
│   ├── notifications/# Notification events + renderers
│   └── config/       # Shared tsconfig, eslint, prettier
└── docs/             # Documentation
```

## Data Flow

1. Public user submits service request via Next.js frontend
2. Frontend calls Express API (`/api/public/service-requests`)
3. API validates with Zod, creates Customer/Vehicle/ServiceRequest in Supabase Postgres via Prisma
4. Notification is queued in the Notification table
5. Cron job picks up queued notifications and sends via WhatsApp/Email providers
6. Admin logs in, views dashboard, manages workflow through admin API endpoints
7. All mutations create ActivityLog entries for audit trail
8. Sentry captures errors on both frontend and backend

## Authentication

- JWT-based auth for admin users
- Token stored in localStorage on frontend
- Backend validates token via middleware on all `/api/admin/*` routes
- RBAC enforced via permission middleware

## RBAC

- 5 roles: SUPER_ADMIN, ADMIN, SERVICE_MANAGER, WORKER, BILLING
- Permissions defined in `@gearup/types` package
- Backend enforces via `requirePermission()` middleware
- Frontend gates routes and UI elements via `useAuth().hasPermission()`

## Cron Jobs

6 scheduled jobs run in the backend process:
- Appointment reminders (every 15 min)
- Missed appointment follow-up (every 30 min)
- Ready for pickup reminder (daily 10am)
- Invoice reminder (daily 11am)
- Notification retry (every 10 min)
- Daily summary (daily 8am)
