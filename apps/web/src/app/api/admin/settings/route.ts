import { NextRequest, NextResponse } from 'next/server';
import { z, ZodSchema } from 'zod';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth';
import { handleApiError, ValidationError } from '@/lib/errors';
import { logActivity } from '@/lib/activity-logger';
import { PERMISSIONS } from '@gearup/types';

// Per-key Zod schemas. Unknown keys are rejected outright.
// Keep keys grouped by prefix for readability.
const boolSchema = z.boolean();
const nonEmptyStr = z.string().trim().min(1).max(500);
const optionalStr = z.string().trim().max(500);
const urlSchema = z.string().trim().url().max(500);
const positiveInt = z.number().int().positive();
const nonNegativeInt = z.number().int().nonnegative();
const hourOfDay = z.number().int().min(0).max(23);
const percent = z.number().min(0).max(100);

const SETTING_SCHEMAS: Record<string, ZodSchema> = {
  // business.*
  'business.name': nonEmptyStr,
  'business.legalName': optionalStr,
  'business.address': optionalStr,
  'business.city': optionalStr,
  'business.state': optionalStr,
  'business.pincode': optionalStr,
  'business.phone': optionalStr,
  'business.email': z.string().trim().email().max(500).or(z.literal('')),
  'business.gst': optionalStr,
  'business.logoUrl': urlSchema.or(z.literal('')),
  'business.currency': z.string().trim().length(3),
  'business.timezone': nonEmptyStr,

  // invoice.*
  'invoice.prefix': z.string().trim().max(10),
  'invoice.nextNumber': positiveInt,
  'invoice.taxPercent': percent,
  'invoice.termsAndConditions': z.string().max(4000),
  'invoice.footerNote': z.string().max(2000),
  'invoice.showLogo': boolSchema,

  // notification.*
  'notification.whatsappEnabled': boolSchema,
  'notification.emailEnabled': boolSchema,
  'notification.reminderHours': nonNegativeInt,
  'notification.reminderEnabled': boolSchema,
  'notification.dailyDigestEnabled': boolSchema,
  'notification.dailyDigestHour': hourOfDay,
  'notification.fromEmail': z.string().trim().email().max(500).or(z.literal('')),
  'notification.fromName': optionalStr,

  // integration.*
  'integration.whatsappApiUrl': urlSchema.or(z.literal('')),
  'integration.whatsappApiKey': z.string().max(500),
  'integration.smtpHost': optionalStr,
  'integration.smtpPort': z.number().int().min(1).max(65535),
  'integration.smtpUser': optionalStr,
  'integration.smtpPassword': z.string().max(500),
  'integration.smtpSecure': boolSchema,

  // quick line items (pre-configured items for one-tap add on invoices)
  'invoice.quickLineItems': z.string().max(8000),
};

// Hard cap on serialized size of any single setting value (defense-in-depth).
const MAX_VALUE_BYTES = 8 * 1024;

export async function GET() {
  try {
    requirePermission(PERMISSIONS.SETTINGS_VIEW);
    const settings = await prisma.setting.findMany();
    return NextResponse.json({ success: true, data: Object.fromEntries(settings.map((s: any) => [s.key, s.value])) });
  } catch (e) { return handleApiError(e); }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = requirePermission(PERMISSIONS.SETTINGS_MANAGE);
    const body = await req.json() as Record<string, unknown>;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new ValidationError('Request body must be an object of {key: value} pairs.');
    }
    const entries = Object.entries(body);
    if (entries.length === 0) {
      throw new ValidationError('No settings provided.');
    }

    // 1. Reject unknown keys outright (registry-based, not prefix-based).
    const unknown = entries.filter(([key]) => !(key in SETTING_SCHEMAS));
    if (unknown.length) {
      throw new ValidationError(`Unknown setting keys: ${unknown.map(([k]) => k).join(', ')}`);
    }

    // 2. Validate each value against its registered schema + size cap.
    const validated: Array<[string, unknown]> = [];
    const fieldErrors: Record<string, string[]> = {};
    for (const [key, value] of entries) {
      const serialized = JSON.stringify(value ?? null);
      if (serialized.length > MAX_VALUE_BYTES) {
        fieldErrors[key] = [`Value exceeds max size of ${MAX_VALUE_BYTES} bytes.`];
        continue;
      }
      const parsed = SETTING_SCHEMAS[key].safeParse(value);
      if (!parsed.success) {
        fieldErrors[key] = parsed.error.issues.map((i) => i.message);
        continue;
      }
      validated.push([key, parsed.data]);
    }
    if (Object.keys(fieldErrors).length) {
      throw new ValidationError('Invalid setting values.', fieldErrors);
    }

    // 3. Snapshot previous values for audit, then upsert atomically.
    const keys = validated.map(([k]) => k);
    const previousRows = await prisma.setting.findMany({ where: { key: { in: keys } } });
    const previousMap = Object.fromEntries(previousRows.map((r: any) => [r.key, r.value]));
    const previousValue: Record<string, unknown> = Object.fromEntries(
      keys.map((k) => [k, previousMap[k] ?? null]),
    );
    const newValue: Record<string, unknown> = Object.fromEntries(validated);

    await prisma.$transaction(
      validated.map(([key, value]) =>
        prisma.setting.upsert({
          where: { key },
          create: { key, value: value as any },
          update: { value: value as any },
        }),
      ),
    );

    logActivity({
      entityType: 'Setting',
      action: 'settings.updated',
      previousValue,
      newValue,
      actorType: 'ADMIN',
      actorId: user.sub,
    });

    return NextResponse.json({ success: true });
  } catch (e) { return handleApiError(e); }
}
