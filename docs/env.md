# GearUp Servicing — Environment Variables

## Frontend (`apps/web`)

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_APP_NAME` | No | Display name (default: GearUp Servicing) |
| `NEXT_PUBLIC_API_BASE_URL` | Yes | Backend API URL (e.g., `https://api.gearup.com/api`) |
| `NEXT_PUBLIC_SENTRY_DSN` | No | Sentry DSN for frontend error tracking |
| `NEXT_PUBLIC_THEME_DEFAULT` | No | Default theme: `light` or `dark` |

## Backend (`apps/api`)

| Variable | Required | Description |
|----------|----------|-------------|
| `NODE_ENV` | Yes | `development`, `production`, or `test` |
| `PORT` | No | Server port (default: 4000) |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `CORS_ALLOWED_ORIGINS` | Yes | Comma-separated allowed origins |
| `JWT_SECRET` | Yes | JWT signing secret (min 16 chars) |
| `SESSION_SECRET` | Yes | Session secret (min 16 chars) |
| `SENTRY_DSN` | No | Sentry DSN for backend |
| `SUPABASE_URL` | No | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | No | Supabase service role key |
| `SUPABASE_STORAGE_BUCKET_*` | No | Storage bucket names |
| `WHATSAPP_PROVIDER` | No | WhatsApp provider name |
| `WHATSAPP_API_KEY` | No | WhatsApp API key |
| `WHATSAPP_API_URL` | No | WhatsApp API endpoint |
| `EMAIL_PROVIDER` | No | Email provider name |
| `EMAIL_API_KEY` | No | Email API key |
| `EMAIL_FROM_ADDRESS` | No | Sender email address |
| `CRON_ENABLED` | No | Enable cron jobs (default: true) |
| `OWNER_SUMMARY_EMAIL` | No | Email for daily summary |
| `APP_BASE_URL` | No | Frontend base URL |
| `PUBLIC_TRACK_URL_BASE` | No | Public tracking page URL |

## Security Notes

- Never commit `.env` files
- Use different secrets for each environment
- Rotate `JWT_SECRET` periodically
- Use Render/Vercel secret management for production values
