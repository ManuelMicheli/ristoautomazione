import { FastifyInstance, FastifyRequest } from 'fastify';

export async function logAudit(
  db: FastifyInstance['db'],
  request: FastifyRequest,
  params: {
    action: string;
    entityType: string;
    entityId: string;
    oldValues?: Record<string, unknown> | null;
    newValues?: Record<string, unknown> | null;
  },
) {
  const { auditLog } = await import('@cph/db');

  await db.insert(auditLog).values({
    tenantId: request.user?.tenantId,
    userId: request.user?.id,
    action: params.action,
    entityType: params.entityType,
    entityId: params.entityId,
    oldValues: params.oldValues || null,
    newValues: params.newValues || null,
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'] || null,
  });
}
