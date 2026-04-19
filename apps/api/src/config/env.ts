import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string(),
  CORS_ALLOWED_ORIGINS: z.string().default('http://localhost:3000'),
  JWT_SECRET: z.string().min(16),
  SESSION_SECRET: z.string().min(16),
  SENTRY_DSN: z.string().optional(),
  SUPABASE_URL: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  SUPABASE_STORAGE_BUCKET_SERVICE_REQUESTS: z.string().default('service-requests'),
  SUPABASE_STORAGE_BUCKET_JOB_CARDS: z.string().default('job-cards'),
  SUPABASE_STORAGE_BUCKET_EXPENSES: z.string().default('expenses'),
  SUPABASE_STORAGE_BUCKET_INVOICES: z.string().default('invoices'),
  WHATSAPP_PROVIDER: z.string().optional(),
  WHATSAPP_API_KEY: z.string().optional(),
  WHATSAPP_API_URL: z.string().optional(),
  EMAIL_PROVIDER: z.string().optional(),
  EMAIL_API_KEY: z.string().optional(),
  EMAIL_FROM_ADDRESS: z.string().default('noreply@gearupservicing.com'),
  CRON_ENABLED: z.coerce.boolean().default(true),
  OWNER_SUMMARY_EMAIL: z.string().optional(),
  APP_BASE_URL: z.string().default('http://localhost:3000'),
  PUBLIC_TRACK_URL_BASE: z.string().default('http://localhost:3000/track'),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('❌ Invalid environment variables:', result.error.flatten().fieldErrors);
    process.exit(1);
  }
  return result.data;
}

export const env = loadEnv();
