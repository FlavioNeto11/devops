import { query } from '../db/pool.js';

type StringOrArray = string | string[] | undefined | null;

export type JobsSearchFilters = {
  dateFrom?: string | null;
  dateTo?: string | null;
  status?: StringOrArray;
  operation?: StringOrArray;
  entityType?: string | null;
  entityId?: string | null;
  integrationAccountId?: string | null;
  sessionContextId?: string | null;
  correlationId?: string | null;
  page: number;
  pageSize: number;
};

export type AuditSearchFilters = {
  dateFrom?: string | null;
  dateTo?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  component?: string | null;
  correlationId?: string | null;
  direction?: string | null;
  httpStatusMin?: number | null;
  httpStatusMax?: number | null;
  page: number;
  pageSize: number;
};

export type ReportsMtrFilters = {
  dateFrom?: string | null;
  dateTo?: string | null;
  status?: StringOrArray;
  externalStatus?: StringOrArray;
  manifestType?: number | null;
  integrationAccountId?: string | null;
  generatorCode?: string | null;
  carrierCode?: string | null;
  receiverCode?: string | null;
  partnerCode?: string | null;
  page: number;
  pageSize: number;
};

function toArray(value: StringOrArray): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map((entry) => String(entry).trim())
      .filter((entry) => entry.length > 0);
  }
  return String(value)
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function pushTextFilter(values: unknown[], where: string[], expr: string, value: string | null | undefined) {
  if (value === undefined || value === null || value === '') return;
  values.push(value);
  where.push(`${expr} = $${values.length}`);
}

function pushArrayFilter(values: unknown[], where: string[], expr: string, raw: StringOrArray) {
  const list = toArray(raw);
  if (list.length === 0) return;
  values.push(list);
  where.push(`${expr} = any($${values.length}::text[])`);
}

function pushDateFilter(values: unknown[], where: string[], expr: string, value: string | null | undefined, op: '>=' | '<=') {
  if (!value) return;
  values.push(value);
  where.push(`${expr} ${op} $${values.length}::timestamptz`);
}

export type JobSearchRow = {
  job_id: string;
  command_id: string | null;
  entity_type: string;
  entity_id: string;
  operation: string;
  status: string;
  attempts: number;
  max_attempts: number;
  queued_at: string | Date | null;
  started_at: string | Date | null;
  finished_at: string | Date | null;
  next_retry_at: string | Date | null;
  correlation_id: string | null;
  idempotency_key: string | null;
  last_error_code: string | null;
  last_error_message: string | null;
  dlq_reason: string | null;
  dlq_moved_at: string | Date | null;
  execution_time_ms: number | null;
  integration_account_id: string | null;
  session_context_id: string | null;
  version: number | null;
};

export async function searchJobs(filters: JobsSearchFilters) {
  const values: unknown[] = [];
  const where: string[] = [];

  pushDateFilter(values, where, 'queued_at', filters.dateFrom, '>=');
  pushDateFilter(values, where, 'queued_at', filters.dateTo, '<=');
  pushArrayFilter(values, where, 'status', filters.status);
  pushArrayFilter(values, where, 'operation', filters.operation);
  pushTextFilter(values, where, 'entity_type', filters.entityType);
  pushTextFilter(values, where, 'entity_id', filters.entityId);
  pushTextFilter(values, where, 'correlation_id', filters.correlationId);

  if (filters.integrationAccountId) {
    values.push(filters.integrationAccountId);
    where.push(`payload ->> 'integrationAccountId' = $${values.length}`);
  }
  if (filters.sessionContextId) {
    values.push(filters.sessionContextId);
    where.push(`payload ->> 'sessionContextId' = $${values.length}`);
  }

  const whereSql = where.length ? `where ${where.join(' and ')}` : '';
  const offset = (filters.page - 1) * filters.pageSize;
  const limitIndex = values.length + 1;
  const offsetIndex = values.length + 2;
  values.push(filters.pageSize, offset);

  const rows = await query<JobSearchRow & {
    integration_account_id: string | null;
    session_context_id: string | null;
  }>(
    `select
       j.job_id,
       j.command_id,
       j.entity_type,
       j.entity_id,
       j.operation,
       j.status,
       j.attempts,
       j.max_attempts,
       j.queued_at,
       j.started_at,
       j.finished_at,
       j.next_retry_at,
       j.correlation_id,
       j.idempotency_key,
       j.last_error_code,
       j.last_error_message,
       j.dlq_reason,
       j.dlq_moved_at,
       j.execution_time_ms,
       j.payload ->> 'integrationAccountId' as integration_account_id,
       j.payload ->> 'sessionContextId' as session_context_id,
       j.version
     from jobs j
     ${whereSql}
     order by coalesce(j.queued_at, j.created_at) desc, j.job_id desc
     limit $${limitIndex} offset $${offsetIndex}`,
    values
  );

  const countParams = values.slice(0, -2);
  const total = await query<{ count: number }>(
    `select count(*)::int as count from jobs ${whereSql}`,
    countParams
  );

  return {
    items: rows.rows,
    totalItems: total.rows[0]?.count || 0
  };
}

export type AuditSearchRow = {
  correlation_id: string;
  entity_type: string;
  entity_id: string | null;
  occurred_at: string | Date | null;
  direction: string;
  component: string | null;
  http_method: string | null;
  endpoint: string | null;
  http_status: number | null;
  latency_ms: number | null;
};

export async function searchAuditEntries(filters: AuditSearchFilters) {
  const values: unknown[] = [];
  const where: string[] = [];

  pushDateFilter(values, where, 'occurred_at', filters.dateFrom, '>=');
  pushDateFilter(values, where, 'occurred_at', filters.dateTo, '<=');
  pushTextFilter(values, where, 'entity_type', filters.entityType);
  pushTextFilter(values, where, 'entity_id', filters.entityId);
  pushTextFilter(values, where, 'component', filters.component);
  pushTextFilter(values, where, 'correlation_id', filters.correlationId);
  pushTextFilter(values, where, 'direction', filters.direction);

  if (typeof filters.httpStatusMin === 'number') {
    values.push(filters.httpStatusMin);
    where.push(`http_status >= $${values.length}`);
  }
  if (typeof filters.httpStatusMax === 'number') {
    values.push(filters.httpStatusMax);
    where.push(`http_status <= $${values.length}`);
  }

  const whereSql = where.length ? `where ${where.join(' and ')}` : '';
  const offset = (filters.page - 1) * filters.pageSize;
  const limitIndex = values.length + 1;
  const offsetIndex = values.length + 2;
  values.push(filters.pageSize, offset);

  const rows = await query<AuditSearchRow>(
    `select
       correlation_id,
       entity_type,
       entity_id,
       occurred_at,
       direction,
       component,
       http_method,
       endpoint,
       http_status,
       latency_ms
     from audit_logs
     ${whereSql}
     order by occurred_at desc, id desc
     limit $${limitIndex} offset $${offsetIndex}`,
    values
  );

  const countParams = values.slice(0, -2);
  const total = await query<{ count: number }>(
    `select count(*)::int as count from audit_logs ${whereSql}`,
    countParams
  );

  return {
    items: rows.rows,
    totalItems: total.rows[0]?.count || 0
  };
}

export type OperationsOverviewSummary = {
  jobs: {
    queued: number;
    running: number;
    retry_wait: number;
    succeeded_24h: number;
    failed_24h: number;
    dlq_total: number;
  };
  manifests: {
    total: number;
    submitted: number;
    printed: number;
    cancelled: number;
    draft_or_failed: number;
  };
  accounts: {
    total: number;
    active: number;
  };
  sessions: {
    active: number;
    pending_auth: number;
    expired: number;
    invalid: number;
    revoked: number;
  };
  recentDlq: Array<{
    job_id: string;
    operation: string;
    entity_type: string;
    entity_id: string;
    dlq_reason: string | null;
    moved_at: string | Date | null;
  }>;
  recentJobs: Array<OverviewRecentJobRow>;
  recentErrors: Array<OverviewRecentErrorRow>;
  generatedAt: string;
};

export type OverviewRecentJobRow = {
  job_id: string;
  operation: string;
  entity_type: string;
  entity_id: string;
  status: string;
  attempts: number;
  last_error_code: string | null;
  last_error_message: string | null;
  dlq_reason: string | null;
  queued_at: string | Date | null;
  started_at: string | Date | null;
  finished_at: string | Date | null;
  correlation_id: string | null;
};

export type OverviewRecentErrorRow = OverviewRecentJobRow;

export async function getOperationsOverviewSummary(): Promise<OperationsOverviewSummary> {
  const jobsCounters = await query<{
    queued: number;
    running: number;
    retry_wait: number;
    succeeded_24h: number;
    failed_24h: number;
    dlq_total: number;
  }>(
    `select
       count(*) filter (where status = 'queued')::int as queued,
       count(*) filter (where status = 'running')::int as running,
       count(*) filter (where status = 'retry_wait')::int as retry_wait,
       count(*) filter (where status = 'succeeded' and finished_at >= now() - interval '24 hours')::int as succeeded_24h,
       count(*) filter (where status = 'failed' and finished_at >= now() - interval '24 hours')::int as failed_24h,
       count(*) filter (where status = 'dlq')::int as dlq_total
     from jobs`
  );

  const manifestCounters = await query<{
    total: number;
    submitted: number;
    printed: number;
    cancelled: number;
    draft_or_failed: number;
  }>(
    `select
       count(*)::int as total,
       count(*) filter (where status in ('submitted'))::int as submitted,
       count(*) filter (where status in ('printed'))::int as printed,
       count(*) filter (where status in ('cancelled'))::int as cancelled,
       count(*) filter (where status in ('draft','failed'))::int as draft_or_failed
     from manifests`
  );

  const accountCounters = await query<{ total: number; active: number }>(
    `select
       count(*)::int as total,
       count(*) filter (where is_active = true)::int as active
     from sicat_cetesb_accounts`
  );

  const sessionCounters = await query<{
    active: number;
    pending_auth: number;
    expired: number;
    invalid: number;
    revoked: number;
  }>(
    `select
       count(*) filter (where status = 'active')::int as active,
       count(*) filter (where status = 'pending_auth')::int as pending_auth,
       count(*) filter (where status = 'expired')::int as expired,
       count(*) filter (where status = 'invalid')::int as invalid,
       count(*) filter (where status = 'revoked')::int as revoked
     from session_contexts`
  );

  const recentDlq = await query<{
    job_id: string;
    operation: string;
    entity_type: string;
    entity_id: string;
    dlq_reason: string | null;
    moved_at: string | Date | null;
  }>(
    `select job_id, operation, entity_type, entity_id, reason as dlq_reason, moved_at
     from job_dead_letter_queue
     order by moved_at desc
     limit 10`
  );

  const recentJobs = await query<OverviewRecentJobRow>(
    `select job_id, operation, entity_type, entity_id, status, attempts,
            last_error_code, last_error_message, dlq_reason,
            queued_at, started_at, finished_at, correlation_id
     from jobs
     order by greatest(
       coalesce(finished_at, to_timestamp(0)),
       coalesce(started_at, to_timestamp(0)),
       coalesce(queued_at, to_timestamp(0))
     ) desc
     limit 10`
  );

  const recentErrors = await query<OverviewRecentErrorRow>(
    `select job_id, operation, entity_type, entity_id, status, attempts,
            last_error_code, last_error_message, dlq_reason,
            queued_at, started_at, finished_at, correlation_id
     from jobs
     where status in ('failed','cancelled','dlq')
     order by coalesce(finished_at, queued_at) desc
     limit 10`
  );

  return {
    jobs: jobsCounters.rows[0] || {
      queued: 0,
      running: 0,
      retry_wait: 0,
      succeeded_24h: 0,
      failed_24h: 0,
      dlq_total: 0
    },
    manifests: manifestCounters.rows[0] || {
      total: 0,
      submitted: 0,
      printed: 0,
      cancelled: 0,
      draft_or_failed: 0
    },
    accounts: accountCounters.rows[0] || { total: 0, active: 0 },
    sessions: sessionCounters.rows[0] || {
      active: 0,
      pending_auth: 0,
      expired: 0,
      invalid: 0,
      revoked: 0
    },
    recentDlq: recentDlq.rows,
    recentJobs: recentJobs.rows,
    recentErrors: recentErrors.rows,
    generatedAt: new Date().toISOString()
  };
}

export type AccountHealthRow = {
  account_id: string;
  user_id: string;
  partner_code: string | null;
  partner_document: string | null;
  partner_name: string | null;
  account_type: string;
  is_active: boolean;
  last_connection_at: string | Date | null;
  last_usage_at: string | Date | null;
  active_sessions: number;
  pending_sessions: number;
  expired_sessions: number;
  invalid_sessions: number;
  jobs_failed_24h: number;
  jobs_dlq_total: number;
};

export async function getAccountsHealth(): Promise<AccountHealthRow[]> {
  const result = await query<AccountHealthRow>(
    `select
       a.id as account_id,
       a.user_id,
       a.partner_code,
       a.partner_document,
       a.partner_name,
       a.account_type,
       a.is_active,
       a.last_connection_at,
       a.last_usage_at,
       coalesce(s.active_sessions, 0)::int as active_sessions,
       coalesce(s.pending_sessions, 0)::int as pending_sessions,
       coalesce(s.expired_sessions, 0)::int as expired_sessions,
       coalesce(s.invalid_sessions, 0)::int as invalid_sessions,
       coalesce(j.jobs_failed_24h, 0)::int as jobs_failed_24h,
       coalesce(j.jobs_dlq_total, 0)::int as jobs_dlq_total
     from sicat_cetesb_accounts a
     left join (
       select integration_account_id,
              count(*) filter (where status = 'active') as active_sessions,
              count(*) filter (where status = 'pending_auth') as pending_sessions,
              count(*) filter (where status = 'expired') as expired_sessions,
              count(*) filter (where status = 'invalid') as invalid_sessions
       from session_contexts
       group by integration_account_id
     ) s on s.integration_account_id = ('acc_' || a.id)
     left join (
       select payload ->> 'integrationAccountId' as integration_account_id,
              count(*) filter (where status = 'failed' and finished_at >= now() - interval '24 hours') as jobs_failed_24h,
              count(*) filter (where status = 'dlq') as jobs_dlq_total
       from jobs
       group by payload ->> 'integrationAccountId'
     ) j on j.integration_account_id = ('acc_' || a.id)
     order by a.is_active desc, a.last_usage_at desc nulls last`
  );
  return result.rows;
}

export type SessionHealthRow = {
  session_context_id: string;
  integration_account_id: string;
  status: string;
  partner_document: string | null;
  partner_code: string | null;
  user_name: string | null;
  email: string | null;
  auth_mode: string | null;
  expires_at: string | Date | null;
  last_validated_at: string | Date | null;
  created_at: string | Date | null;
  updated_at: string | Date | null;
};

export async function getSessionsHealth(filters: { status?: StringOrArray; integrationAccountId?: string | null } = {}): Promise<SessionHealthRow[]> {
  const values: unknown[] = [];
  const where: string[] = [];

  pushArrayFilter(values, where, 'status', filters.status);
  pushTextFilter(values, where, 'integration_account_id', filters.integrationAccountId);

  const whereSql = where.length ? `where ${where.join(' and ')}` : '';

  const result = await query<SessionHealthRow>(
    `select
       id as session_context_id,
       integration_account_id,
       status,
       partner_document,
       partner_code,
       user_name,
       email,
       auth_mode,
       expires_at,
       last_validated_at,
       created_at,
       updated_at
     from session_contexts
     ${whereSql}
     order by updated_at desc
     limit 500`,
    values
  );
  return result.rows;
}

export type ReportsMtrRow = {
  id: string;
  integration_account_id: string;
  status: string;
  external_status: string | null;
  manifest_type: number | null;
  expedition_date: string | Date | null;
  external_reference: Record<string, unknown> | null;
  external_hash_code: string | null;
  generator_code: string | null;
  generator_name: string | null;
  carrier_code: string | null;
  carrier_name: string | null;
  receiver_code: string | null;
  receiver_name: string | null;
  created_at: string | Date | null;
  last_sync_at: string | Date | null;
};

export async function searchReportsMtrs(filters: ReportsMtrFilters) {
  const values: unknown[] = [];
  const where: string[] = [];

  pushTextFilter(values, where, 'integration_account_id', filters.integrationAccountId);
  pushArrayFilter(values, where, 'status', filters.status);
  pushArrayFilter(values, where, 'external_status', filters.externalStatus);

  if (filters.manifestType != null) {
    values.push(filters.manifestType);
    where.push(`(payload ->> 'manifestType')::int = $${values.length}`);
  }

  if (filters.dateFrom) {
    values.push(filters.dateFrom);
    where.push(`coalesce((payload ->> 'expeditionDate')::date, created_at::date) >= $${values.length}::date`);
  }
  if (filters.dateTo) {
    values.push(filters.dateTo);
    where.push(`coalesce((payload ->> 'expeditionDate')::date, created_at::date) <= $${values.length}::date`);
  }

  if (filters.generatorCode) {
    values.push(String(filters.generatorCode));
    where.push(`payload -> 'generator' ->> 'partnerCode' = $${values.length}`);
  }
  if (filters.carrierCode) {
    values.push(String(filters.carrierCode));
    where.push(`payload -> 'carrier' ->> 'partnerCode' = $${values.length}`);
  }
  if (filters.receiverCode) {
    values.push(String(filters.receiverCode));
    where.push(`payload -> 'receiver' ->> 'partnerCode' = $${values.length}`);
  }
  if (filters.partnerCode) {
    values.push(String(filters.partnerCode));
    const idx = `$${values.length}`;
    where.push(`(
      payload -> 'generator' ->> 'partnerCode' = ${idx}
      or payload -> 'carrier' ->> 'partnerCode' = ${idx}
      or payload -> 'receiver' ->> 'partnerCode' = ${idx}
    )`);
  }

  const whereSql = where.length ? `where ${where.join(' and ')}` : '';
  const offset = (filters.page - 1) * filters.pageSize;
  const limitIndex = values.length + 1;
  const offsetIndex = values.length + 2;
  values.push(filters.pageSize, offset);

  const rows = await query<ReportsMtrRow>(
    `select
       id,
       integration_account_id,
       status,
       external_status,
       (payload ->> 'manifestType')::int as manifest_type,
       (payload ->> 'expeditionDate')::date as expedition_date,
       external_reference,
       external_hash_code,
       payload -> 'generator' ->> 'partnerCode' as generator_code,
       payload -> 'generator' ->> 'description' as generator_name,
       payload -> 'carrier' ->> 'partnerCode' as carrier_code,
       payload -> 'carrier' ->> 'description' as carrier_name,
       payload -> 'receiver' ->> 'partnerCode' as receiver_code,
       payload -> 'receiver' ->> 'description' as receiver_name,
       created_at,
       last_sync_at
     from manifests
     ${whereSql}
     order by coalesce((payload ->> 'expeditionDate')::date, created_at::date) desc, id desc
     limit $${limitIndex} offset $${offsetIndex}`,
    values
  );

  const countParams = values.slice(0, -2);
  const total = await query<{ count: number }>(
    `select count(*)::int as count from manifests ${whereSql}`,
    countParams
  );

  return {
    items: rows.rows,
    totalItems: total.rows[0]?.count || 0
  };
}
