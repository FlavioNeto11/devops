// src/repositories/audit-log-repo.js
// HANDOFF 4: Auditoria de operações de manifesto - Repository para manifest_audit_logs

import { query } from '../db/pool.js';

type AuditLogInput = {
  manifestId: string;
  userId?: string | null;
  correlationId?: string | null;
  action: string;
  status: string;
  details?: Record<string, unknown>;
  tags?: unknown[];
};

type AuditLogRow = {
  id: string;
  manifest_id: string;
  user_id: string | null;
  correlation_id: string;
  action: string;
  status: string;
  details: Record<string, unknown> | null;
  tags: unknown[] | null;
  created_at: string | Date;
  updated_at: string | Date;
};

export async function insertAuditLog(auditEntry: AuditLogInput) {
  // Validar entrada
  if (!auditEntry.manifestId || !auditEntry.action || !auditEntry.status) {
    throw new Error('auditEntry deve conter: manifestId, action, status');
  }

  const sql = `
    insert into manifest_audit_logs (
      manifest_id,
      user_id,
      correlation_id,
      action,
      status,
      details,
      tags
    ) values ($1, $2, $3, $4, $5, $6, $7)
    returning *
  `;

  const result = await query<AuditLogRow>(sql, [
    auditEntry.manifestId,
    auditEntry.userId || null,
    auditEntry.correlationId || '',
    auditEntry.action,
    auditEntry.status,
    JSON.stringify(auditEntry.details || {}),
    JSON.stringify(auditEntry.tags || [])
  ]);

  return result.rows[0];
}

export async function findAuditLogsByManifestId(manifestId: string) {
  const sql = `
    select *
    from manifest_audit_logs
    where manifest_id = $1
    order by created_at desc
  `;

  const result = await query<AuditLogRow>(sql, [manifestId]);
  return result.rows;
}

export async function findAuditLogsByAction(action: string, limit = 100) {
  const sql = `
    select *
    from manifest_audit_logs
    where action = $1
    order by created_at desc
    limit $2
  `;

  const result = await query<AuditLogRow>(sql, [action, limit]);
  return result.rows;
}

export async function findAuditLogsByUserId(userId: string, limit = 100) {
  const sql = `
    select *
    from manifest_audit_logs
    where user_id = $1
    order by created_at desc
    limit $2
  `;

  const result = await query<AuditLogRow>(sql, [userId, limit]);
  return result.rows;
}

export async function updateAuditLogStatus(auditLogId: string, newStatus: string, details: Record<string, unknown> = {}) {
  const sql = `
    update manifest_audit_logs
    set status = $1, details = details || $2::jsonb, updated_at = now()
    where id = $3
    returning *
  `;

  const result = await query<AuditLogRow>(sql, [newStatus, JSON.stringify(details), auditLogId]);
  return result.rows[0];
}

export async function findAuditLogById(auditLogId: string) {
  const sql = `
    select *
    from manifest_audit_logs
    where id = $1
  `;

  const result = await query<AuditLogRow>(sql, [auditLogId]);
  return result.rows[0];
}
