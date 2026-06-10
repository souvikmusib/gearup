import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth';
import { AppError, ValidationError, NotFoundError, handleApiError } from '@/lib/errors';
import { logActivity } from '@/lib/activity-logger';
import { PERMISSIONS } from '@gearup/types';

// Hard caps (defense-in-depth) for template fields.
const MAX_SUBJECT_LEN = 200;
const MAX_BODY_LEN = 4000;
const MAX_VARIABLE_KEYS = 40;
const MAX_VARIABLE_KEY_LEN = 60;
const MAX_TEMPLATE_KEY_LEN = 100;
const MAX_EVENT_TYPE_LEN = 100;

const CHANNELS = ['WHATSAPP', 'EMAIL'] as const;

// A {{variableName}} placeholder. Whitespace is tolerated inside braces.
const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;

// variableSchemaJson must be a flat object: { varName: "string"|"number"|"boolean"|"date" }
const VARIABLE_TYPE = z.enum(['string', 'number', 'boolean', 'date']);
const variableSchemaSchema = z
  .record(z.string().min(1).max(MAX_VARIABLE_KEY_LEN), VARIABLE_TYPE)
  .refine((obj) => Object.keys(obj).length <= MAX_VARIABLE_KEYS, {
    message: `variableSchemaJson may not contain more than ${MAX_VARIABLE_KEYS} keys.`,
  });

const templateKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(MAX_TEMPLATE_KEY_LEN)
  .regex(/^[a-z0-9][a-z0-9._-]*$/, 'templateKey must be lowercase alphanumeric with . _ -');

const createSchema = z.object({
  channel: z.enum(CHANNELS),
  eventType: z.string().trim().min(1).max(MAX_EVENT_TYPE_LEN),
  templateKey: templateKeySchema,
  subject: z.string().trim().max(MAX_SUBJECT_LEN).optional().nullable(),
  messageBody: z.string().min(1).max(MAX_BODY_LEN),
  variableSchemaJson: variableSchemaSchema.optional().nullable(),
  isActive: z.boolean().optional(),
});

const updateSchema = z.object({
  id: z.string().min(1),
  channel: z.enum(CHANNELS).optional(),
  eventType: z.string().trim().min(1).max(MAX_EVENT_TYPE_LEN).optional(),
  templateKey: templateKeySchema.optional(),
  subject: z.string().trim().max(MAX_SUBJECT_LEN).optional().nullable(),
  messageBody: z.string().min(1).max(MAX_BODY_LEN).optional(),
  variableSchemaJson: variableSchemaSchema.optional().nullable(),
  isActive: z.boolean().optional(),
});

const deleteSchema = z.object({ id: z.string().min(1) });

/**
 * Verify that every {{var}} placeholder used in subject + messageBody is
 * declared in variableSchemaJson (when provided). Returns the list of unknown
 * placeholder names so the caller can produce a friendly error.
 */
function findUnknownPlaceholders(
  subject: string | null | undefined,
  body: string,
  declared: Record<string, string> | null | undefined,
): string[] {
  if (!declared) return [];
  const declaredKeys = new Set(Object.keys(declared));
  const seen = new Set<string>();
  const collect = (s: string | null | undefined) => {
    if (!s) return;
    for (const m of s.matchAll(PLACEHOLDER_RE)) {
      const name = m[1];
      if (!declaredKeys.has(name)) seen.add(name);
    }
  };
  collect(subject);
  collect(body);
  return Array.from(seen);
}

export async function GET() {
  try {
    requirePermission(PERMISSIONS.NOTIFICATIONS_VIEW);
    const templates = await prisma.notificationTemplate.findMany({
      orderBy: [{ eventType: 'asc' }, { channel: 'asc' }],
    });
    return NextResponse.json({ success: true, data: templates });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = requirePermission(PERMISSIONS.NOTIFICATIONS_TEMPLATES_MANAGE);
    const raw = await req.json().catch(() => null);
    const parsed = createSchema.safeParse(raw);
    if (!parsed.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path.join('.') || '_';
        (fieldErrors[key] ||= []).push(issue.message);
      }
      throw new ValidationError('Invalid template payload.', fieldErrors);
    }
    const input = parsed.data;

    const unknownVars = findUnknownPlaceholders(
      input.subject,
      input.messageBody,
      input.variableSchemaJson ?? null,
    );
    if (unknownVars.length) {
      throw new ValidationError('Template uses undeclared variables.', {
        variableSchemaJson: [`Undeclared placeholders: ${unknownVars.join(', ')}`],
      });
    }

    const existing = await prisma.notificationTemplate.findUnique({
      where: { templateKey: input.templateKey },
      select: { id: true },
    });
    if (existing) {
      throw new AppError(409, `templateKey '${input.templateKey}' already exists.`, 'CONFLICT');
    }

    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.notificationTemplate.create({
        data: {
          channel: input.channel,
          eventType: input.eventType,
          templateKey: input.templateKey,
          subject: input.subject ?? null,
          messageBody: input.messageBody,
          variableSchemaJson: input.variableSchemaJson ?? undefined,
          isActive: input.isActive ?? true,
        },
      });
      await logActivity({
        entityType: 'NotificationTemplate',
        entityId: row.id,
        action: 'notification_template.created',
        newValue: row,
        actorType: 'ADMIN',
        actorId: user.sub,
        tx,
      });
      return row;
    });

    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = requirePermission(PERMISSIONS.NOTIFICATIONS_TEMPLATES_MANAGE);
    const raw = await req.json().catch(() => null);
    const parsed = updateSchema.safeParse(raw);
    if (!parsed.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path.join('.') || '_';
        (fieldErrors[key] ||= []).push(issue.message);
      }
      throw new ValidationError('Invalid template payload.', fieldErrors);
    }
    const { id, ...patch } = parsed.data;

    const updated = await prisma.$transaction(async (tx) => {
      const previous = await tx.notificationTemplate.findUnique({ where: { id } });
      if (!previous) throw new NotFoundError('NotificationTemplate', id);

      // Compose effective subject/body/variableSchema for placeholder validation.
      const nextSubject = patch.subject === undefined ? previous.subject : patch.subject;
      const nextBody = patch.messageBody ?? previous.messageBody;
      const nextSchema =
        patch.variableSchemaJson === undefined
          ? (previous.variableSchemaJson as Record<string, string> | null)
          : (patch.variableSchemaJson as Record<string, string> | null);

      const unknownVars = findUnknownPlaceholders(nextSubject, nextBody, nextSchema);
      if (unknownVars.length) {
        throw new ValidationError('Template uses undeclared variables.', {
          variableSchemaJson: [`Undeclared placeholders: ${unknownVars.join(', ')}`],
        });
      }

      // If templateKey is being changed, enforce uniqueness explicitly so we
      // return a 409 instead of a raw Prisma unique-violation.
      if (patch.templateKey && patch.templateKey !== previous.templateKey) {
        const clash = await tx.notificationTemplate.findUnique({
          where: { templateKey: patch.templateKey },
          select: { id: true },
        });
        if (clash) {
          throw new AppError(409, `templateKey '${patch.templateKey}' already exists.`, 'CONFLICT');
        }
      }

      // Race-safe conditional update: only update if updatedAt matches what we
      // just read. If a concurrent edit landed first, count===0 and we 409.
      const result = await tx.notificationTemplate.updateMany({
        where: { id, updatedAt: previous.updatedAt },
        data: {
          ...(patch.channel !== undefined ? { channel: patch.channel } : {}),
          ...(patch.eventType !== undefined ? { eventType: patch.eventType } : {}),
          ...(patch.templateKey !== undefined ? { templateKey: patch.templateKey } : {}),
          ...(patch.subject !== undefined ? { subject: patch.subject } : {}),
          ...(patch.messageBody !== undefined ? { messageBody: patch.messageBody } : {}),
          ...(patch.variableSchemaJson !== undefined
            ? { variableSchemaJson: patch.variableSchemaJson ?? undefined }
            : {}),
          ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}),
        },
      });
      if (result.count !== 1) {
        throw new AppError(
          409,
          'Template was modified by another request. Reload and try again.',
          'CONFLICT',
        );
      }

      const row = await tx.notificationTemplate.findUniqueOrThrow({ where: { id } });
      await logActivity({
        entityType: 'NotificationTemplate',
        entityId: id,
        action: 'notification_template.updated',
        previousValue: previous,
        newValue: row,
        actorType: 'ADMIN',
        actorId: user.sub,
        tx,
      });
      return row;
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = requirePermission(PERMISSIONS.NOTIFICATIONS_TEMPLATES_MANAGE);
    // Accept id either as ?id= or in JSON body for flexibility.
    const url = new URL(req.url);
    let id = url.searchParams.get('id') ?? undefined;
    if (!id) {
      const raw = await req.json().catch(() => null);
      const parsed = deleteSchema.safeParse(raw);
      if (!parsed.success) throw new ValidationError('Missing template id.');
      id = parsed.data.id;
    }

    await prisma.$transaction(async (tx) => {
      const previous = await tx.notificationTemplate.findUnique({ where: { id: id! } });
      if (!previous) throw new NotFoundError('NotificationTemplate', id);
      const result = await tx.notificationTemplate.deleteMany({ where: { id: id! } });
      if (result.count !== 1) {
        throw new AppError(409, 'Template was already deleted.', 'CONFLICT');
      }
      await logActivity({
        entityType: 'NotificationTemplate',
        entityId: id,
        action: 'notification_template.deleted',
        previousValue: previous,
        actorType: 'ADMIN',
        actorId: user.sub,
        tx,
      });
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    return handleApiError(e);
  }
}
