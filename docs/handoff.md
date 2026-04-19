# GearUp Servicing — Post-Build Handoff Guide

## Step 1: Create GitHub Repository

```bash
cd gearup-servicing
git init && git add . && git commit -m "Initial commit"
gh repo create gearup-servicing --private --push
```

- Protect `main` branch
- Enable required PR reviews

## Step 2: Set Up Supabase

1. Create project at [supabase.com](https://supabase.com)
2. Copy connection string → `DATABASE_URL`
3. Create storage buckets: `service-requests`, `job-cards`, `expenses`, `invoices`
4. Run migrations:
   ```bash
   cd apps/api
   npx prisma migrate dev --name init
   npx tsx prisma/seed.ts
   ```

## Step 3: Set Up Sentry

1. Create frontend project (Next.js) → copy DSN → `NEXT_PUBLIC_SENTRY_DSN`
2. Create backend project (Node.js) → copy DSN → `SENTRY_DSN`
3. Verify: throw a test error and confirm it appears in Sentry

## Step 4: Deploy Backend to Render

1. Create Web Service → connect GitHub
2. Root directory: `apps/api`
3. Build: `cd apps/api && npm install && npx tsc`
4. Start: `node dist/server.js`
5. Set all backend env vars from `docs/env.md`
6. Verify: `GET /api/health` returns `{ status: "ok" }`

## Step 5: Deploy Frontend to Vercel

1. Import repo → select `apps/web` as root
2. Set env vars: `NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_SENTRY_DSN`
3. Deploy and verify public pages load
4. Verify admin login works

## Step 6: Configure Notification Providers

1. Choose WhatsApp provider (e.g., Twilio, Gupshup)
2. Set `WHATSAPP_PROVIDER`, `WHATSAPP_API_KEY`, `WHATSAPP_API_URL`
3. Choose email provider (e.g., Resend, SendGrid)
4. Set `EMAIL_PROVIDER`, `EMAIL_API_KEY`, `EMAIL_FROM_ADDRESS`
5. Run test sends and verify notification logs

## Step 7: Create Initial Admin Users

Default seed creates: `superadmin` / `admin123`

**⚠️ Change this password immediately after first login.**

Create additional admins via the admin panel or database.

## Step 8: QA Before Go-Live

Run through `docs/qa-matrix.md`:
- [ ] Public service request submission
- [ ] Appointment confirm flow
- [ ] Job card creation and worker assignment
- [ ] Inventory reserve/consume
- [ ] Invoice finalization
- [ ] Payment recording
- [ ] WhatsApp/email notification delivery
- [ ] Sentry error capture
- [ ] Cron job execution
- [ ] Public tracking security

## Step 9: Production Go-Live

1. Set `NODE_ENV=production` on Render
2. Run migrations on production database
3. Seed only baseline configs (roles, permissions, settings) — not demo data
4. Create real admin accounts
5. Verify Supabase backups are enabled
6. Verify Sentry alerts are configured

## Step 10: First Week Monitoring

- Monitor Sentry daily for unhandled errors
- Check notification delivery logs for failures
- Monitor booking conversion rates
- Track no-show rates
- Collect UI feedback from staff
- Review activity logs for unusual patterns
