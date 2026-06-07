import { AppError } from '../lib/problem.js';
import { listAuditEntries } from '../repositories/audit-repo.js';

export async function getAuditTrail(correlationId: string) {
  const entries = await listAuditEntries(correlationId);
  if (!entries.length) {
    throw new AppError(404, 'Not Found', `Audit trail for correlation ${correlationId} was not found.`);
  }

  const first = entries[0];
  return {
    correlationId,
    entityType: first?.entityType || 'unknown',
    entityId: first?.entityId || null,
    entries
  };
}
