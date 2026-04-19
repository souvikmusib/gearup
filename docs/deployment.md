# GearUp Servicing — Deployment Guide

## Prerequisites

- Node.js >= 20
- pnpm >= 9
- GitHub account
- Supabase project
- Sentry account
- Vercel account
- Render account

## 1. GitHub Repository

```bash
git init
git add .
git commit -m "Initial commit"
gh repo create gearup-servicing --private --push
```

Protect `main` branch with required reviews.

## 2. Supabase Setup

1. Create a new Supabase project
2. Copy the connection string from Settings > Database
3. Create storage buckets: `service-requests`, `job-cards`, `expenses`, `invoices`
4. Set `DATABASE_URL` in your `.env`

```bash
cd apps/api
npx prisma migrate dev --name init
npx tsx prisma/seed.ts
```

## 3. Sentry Setup

1. Create two Sentry projects: `gearup-web` (JavaScript/Next.js) and `gearup-api` (Node.js)
2. Copy DSNs to environment variables
3. Verify with a test error

## 4. Render (Backend)

1. Create a new Web Service
2. Connect GitHub repo
3. Root directory: `apps/api`
4. Build command: `pnpm install && pnpm build`
5. Start command: `node dist/server.js`
6. Set environment variables (see `docs/env.md`)
7. Verify: `https://your-service.onrender.com/api/health`

## 5. Vercel (Frontend)

1. Import GitHub repo
2. Framework: Next.js
3. Root directory: `apps/web`
4. Set environment variables:
   - `NEXT_PUBLIC_API_BASE_URL` = Render backend URL + `/api`
   - `NEXT_PUBLIC_SENTRY_DSN` = Sentry frontend DSN
5. Deploy

## 6. Post-Deploy Verification

- [ ] Health endpoint returns `{ status: "ok" }`
- [ ] CORS allows Vercel domain
- [ ] Admin login works
- [ ] Public booking form submits successfully
- [ ] Sentry receives test errors
- [ ] Cron jobs are running (check logs)

## 7. Custom Domain (Optional)

- Add custom domain in Vercel
- Update `CORS_ALLOWED_ORIGINS` on Render
- Update `APP_BASE_URL` and `PUBLIC_TRACK_URL_BASE`
