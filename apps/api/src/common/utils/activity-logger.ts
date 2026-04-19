import { prisma } from '@gearup/db';
import type { ActorType } from '@gearup/types';

interface LogActivityParams {
  entityType: string;
  entityId?: string;
  action: string;
  previousValue?: unknown;
  newValue?: unknown;
  actorType: ActorType;
  actorId?: string;
  requestId?: string;
  ipAddress?: string;
  userAgent?: string;
}

export async function logActivity(params: LogActivityParams) {
  await prisma.activityLog.create({
    data: {
      entityType: params.entityType,
      entityId: params.entityId,
      action: params.action,
      previousValueJson: params.previousValue ? JSON.parse(JSON.stringify(params.previousValue)) : undefined,
      newValueJson: params.newValue ? JSON.parse(JSON.stringify(params.newValue)) : undefined,
      actorType: params.actorType,
      actorId: params.actorId,
      requestId: params.requestId,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
    },
  });
}
