// services/audit-service.js — consultas de trilha de auditoria.
import { listAuditLogs } from '../repositories/audit-repo.js';

export async function getAuditTrail(tenantId, { entityId, entityType, limit } = {}) {
  return listAuditLogs(tenantId, { entityId, entityType, limit });
}
