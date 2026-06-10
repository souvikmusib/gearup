import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth';
import { handleApiError } from '@/lib/errors';
import { logActivity } from '@/lib/activity-logger';
import { PERMISSIONS } from '@gearup/types';

// Setting keys (or substrings) whose values may contain secrets / credentials
// and must be redacted from the export blob. Keep this conservative — better
// to over-redact than to leak an API key.
const SECRET_KEY_PATTERNS = [
  'token',
  'secret',
  'password',
  'apikey',
  'api_key',
  'api-key',
  'credential',
  'private',
  'webhook',
  'twilio',
  'razorpay',
  'whatsapp',
  'smtp',
];

function isSecretKey(key: unknown): boolean {
  if (typeof key !== 'string') return false;
  const lower = key.toLowerCase();
  return SECRET_KEY_PATTERNS.some((p) => lower.includes(p));
}

function redactSettings(rows: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  return rows.map((row) => {
    const key = (row as { key?: unknown }).key;
    if (isSecretKey(key)) {
      return { ...row, value: '[REDACTED]' };
    }
    return row;
  });
}

export async function GET(request: Request) {
  try {
    // Dedicated DATA_EXPORT permission (SUPER_ADMIN-only) on top of
    // SETTINGS_MANAGE — bulk PII/payments dump must not be reachable by
    // anyone who can merely toggle a settings flag.
    const user = requirePermission(PERMISSIONS.SETTINGS_MANAGE, PERMISSIONS.DATA_EXPORT);

    const [customers, vehicles, workers, serviceRequests, appointments, jobCards, invoices, payments, expenses, inventoryItems, inventoryCategories, suppliers, settings] = await Promise.all([
      prisma.customer.findMany(),
      prisma.vehicle.findMany(),
      prisma.worker.findMany(),
      prisma.serviceRequest.findMany(),
      prisma.appointment.findMany(),
      prisma.jobCard.findMany({ include: { tasks: true, parts: true, assignments: true } }),
      prisma.invoice.findMany({ include: { lineItems: true } }),
      prisma.payment.findMany(),
      prisma.expense.findMany(),
      prisma.inventoryItem.findMany(),
      prisma.inventoryCategory.findMany(),
      prisma.supplier.findMany(),
      prisma.setting.findMany(),
    ]);

    const redactedSettings = redactSettings(settings as Array<Record<string, unknown>>);

    const rowCounts = {
      customers: customers.length,
      vehicles: vehicles.length,
      workers: workers.length,
      serviceRequests: serviceRequests.length,
      appointments: appointments.length,
      jobCards: jobCards.length,
      invoices: invoices.length,
      payments: payments.length,
      expenses: expenses.length,
      inventoryItems: inventoryItems.length,
      inventoryCategories: inventoryCategories.length,
      suppliers: suppliers.length,
      settings: redactedSettings.length,
    };

    const exportedAt = new Date().toISOString();
    const watermark = {
      exportedBy: user.sub,
      exportedAt,
      note: 'Contains customer PII, payments, and business data. Handle per DPDP Act. Settings with secret-like keys are redacted.',
    };

    const backup = {
      exportedAt,
      watermark,
      customers, vehicles, workers, serviceRequests, appointments,
      jobCards, invoices, payments, expenses,
      inventoryItems, inventoryCategories, suppliers,
      settings: redactedSettings,
    };

    // Audit log BEFORE returning — DPDP compliance requires tracking bulk
    // access to customer PII. Fire-and-forget would lose the record on
    // crash; await it.
    const ipAddress =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      undefined;
    const userAgent = request.headers.get('user-agent') || undefined;
    await logActivity({
      entityType: 'Backup',
      action: 'data.exported',
      newValue: { rowCounts, redactedSettingsKeys: true },
      actorType: 'ADMIN',
      actorId: user.sub,
      ipAddress,
      userAgent,
    });

    return new NextResponse(JSON.stringify(backup, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="gearup-backup-${exportedAt.slice(0, 10)}.json"`,
      },
    });
  } catch (e) { return handleApiError(e); }
}
