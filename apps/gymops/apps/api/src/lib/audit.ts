import { db } from './prisma.js';

export async function logAudit(params: {
  organizationId: string;
  userId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
}): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        organizationId: params.organizationId,
        userId: params.userId,
        action: params.action,
        resourceType: params.resourceType,
        resourceId: params.resourceId,
        metadata: params.metadata ? params.metadata as unknown as import('@gymops/db').Prisma.InputJsonValue : undefined,
        ipAddress: params.ipAddress,
      },
    });
  } catch {
    // Audit log failures must not interrupt business operations
  }
}
