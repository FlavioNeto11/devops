import { query } from '../db/pool.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import os from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageJsonPath = resolve(__dirname, '../../package.json');

type WorkerHeartbeatStats = {
  lastJobClaimedAt?: string | Date | null;
  lastJobCompletedAt?: string | Date | null;
  totalJobsClaimed?: number;
  totalJobsSucceeded?: number;
  totalJobsFailed?: number;
  totalJobsDLQ?: number;
  avgJobDurationMs?: number | null;
};

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error || '');
}

function toInteger(value: unknown) {
  return Number.parseInt(String(value ?? ''), 10) || 0;
}

function toDecimal(value: unknown) {
  return Number.parseFloat(String(value ?? '')) || 0;
}

/**
 * Registra worker e inicia health monitoring
 */
export async function registerWorker(workerId: string, workerName: string) {
  const result = await query(
    `insert into worker_health (
      worker_id, worker_name, hostname, pid, started_at, 
      last_heartbeat_at, status, metadata
    ) values ($1, $2, $3, $4, now(), now(), 'healthy', $5::jsonb)
    on conflict (worker_id) do update set
      worker_name = excluded.worker_name,
      hostname = excluded.hostname,
      pid = excluded.pid,
      started_at = excluded.started_at,
      last_heartbeat_at = now(),
      status = 'healthy',
      updated_at = now()
    returning *`,
    [
      workerId,
      workerName,
      os.hostname(),
      process.pid,
      JSON.stringify({
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        cpus: os.cpus().length,
        totalMemoryMb: Math.round(os.totalmem() / 1024 / 1024)
      })
    ]
  );
  
  return result.rows[0];
}

/**
 * Atualiza heartbeat do worker
 */
export async function sendWorkerHeartbeat(workerId: string, stats: WorkerHeartbeatStats = {}) {
  const status = determineWorkerStatus(stats);
  
  const result = await query(
    `update worker_health set
      last_heartbeat_at = now(),
      last_job_claimed_at = coalesce($2::timestamptz, last_job_claimed_at),
      last_job_completed_at = coalesce($3::timestamptz, last_job_completed_at),
      total_jobs_claimed = coalesce($4::integer, total_jobs_claimed),
      total_jobs_succeeded = coalesce($5::integer, total_jobs_succeeded),
      total_jobs_failed = coalesce($6::integer, total_jobs_failed),
      total_jobs_dlq = coalesce($7::integer, total_jobs_dlq),
      avg_job_duration_ms = coalesce($8::integer, avg_job_duration_ms),
      status = $9,
      updated_at = now()
    where worker_id = $1
    returning *`,
    [
      workerId,
      stats.lastJobClaimedAt || null,
      stats.lastJobCompletedAt || null,
      stats.totalJobsClaimed ?? null,
      stats.totalJobsSucceeded ?? null,
      stats.totalJobsFailed ?? null,
      stats.totalJobsDLQ ?? null,
      stats.avgJobDurationMs ?? null,
      status
    ]
  );
  
  return result.rows[0];
}

/**
 * Determina status do worker baseado em métricas
 */
function determineWorkerStatus(stats: WorkerHeartbeatStats) {
  if (!stats || Object.keys(stats).length === 0) {
    return 'healthy';
  }
  
  const totalJobs = (stats.totalJobsSucceeded || 0) + (stats.totalJobsFailed || 0);
  const successRate = totalJobs > 0 ? (stats.totalJobsSucceeded || 0) / totalJobs : 1;
  
  // Degradado se success rate < 80%
  if (successRate < 0.8 && totalJobs >= 10) {
    return 'degraded';
  }
  
  // Degradado se avg duration > 60 segundos
  if (stats.avgJobDurationMs && stats.avgJobDurationMs > 60000) {
    return 'degraded';
  }
  
  return 'healthy';
}

/**
 * Marca worker como stopped
 */
export async function stopWorker(workerId: string, reason: string) {
  await query(
    `update worker_health set
      status = 'stopped',
      metadata = metadata || jsonb_build_object('stop_reason', $2::text, 'stopped_at', now()),
      updated_at = now()
    where worker_id = $1`,
    [workerId, reason]
  );
  
  // Registrar evento de sistema
  await logSystemEvent({
    eventType: 'WORKER_STOPPED',
    severity: 'info',
    component: 'worker-health',
    message: `Worker ${workerId} stopped: ${reason}`,
    details: { workerId, reason }
  });
}

/**
 * Detecta workers não responsivos
 */
export async function detectUnhealthyWorkers(heartbeatTimeoutSeconds = 300) {
  const result = await query(
    `select * from detect_unhealthy_workers($1)`,
    [heartbeatTimeoutSeconds]
  );
  
  return result.rows;
}

/**
 * Registra evento de sistema
 */
export async function logSystemEvent({
  eventType,
  severity = 'info',
  component,
  message,
  details = {},
  correlationId = null
}: {
  eventType: string;
  severity?: 'info' | 'warning' | 'error';
  component: string;
  message: string;
  details?: Record<string, unknown>;
  correlationId?: string | null;
}) {
  await query(
    `insert into system_events (
      event_type, severity, component, message, details, correlation_id
    ) values ($1, $2, $3, $4, $5::jsonb, $6)`,
    [eventType, severity, component, message, JSON.stringify(details), correlationId]
  );
}

/**
 * Calcula métricas de performance dos jobs
 */
export async function calculateJobPerformanceMetrics(hoursBack = 24) {
  try {
    const result = await query(`
      select
        j.operation,
        count(*)::bigint as total_jobs,
        count(*) filter (where j.status = 'succeeded')::bigint as succeeded_jobs,
        count(*) filter (where j.status = 'failed')::bigint as failed_jobs,
        count(*) filter (where j.status = 'dlq')::bigint as dlq_jobs,
        avg(j.execution_time_ms) as avg_duration_ms,
        percentile_cont(0.50) within group (order by j.execution_time_ms) as p50_duration_ms,
        percentile_cont(0.95) within group (order by j.execution_time_ms) as p95_duration_ms,
        percentile_cont(0.99) within group (order by j.execution_time_ms) as p99_duration_ms,
        (
          count(*) filter (where j.status = 'succeeded')::numeric
          / nullif(count(*), 0)
          * 100
        ) as success_rate
      from jobs j
      where j.finished_at >= now() - ($1::integer || ' hours')::interval
        and j.status in ('succeeded', 'failed', 'dlq')
      group by j.operation
      order by total_jobs desc
    `, [hoursBack]);

    const operations = result.rows.map(row => ({
      operation: row.operation,
      total_jobs: toInteger(row.total_jobs),
      succeeded_jobs: toInteger(row.succeeded_jobs),
      failed_jobs: toInteger(row.failed_jobs),
      dlq_jobs: toInteger(row.dlq_jobs),
      avg_duration_ms: toDecimal(row.avg_duration_ms),
      p50_duration_ms: toDecimal(row.p50_duration_ms),
      p95_duration_ms: toDecimal(row.p95_duration_ms),
      p99_duration_ms: toDecimal(row.p99_duration_ms),
      success_rate: toDecimal(row.success_rate)
    }));

    // Calcular agregações globais
    const totalJobs = operations.reduce((sum, op) => sum + op.total_jobs, 0);
    const succeededJobs = operations.reduce((sum, op) => sum + op.succeeded_jobs, 0);
    // Percentis globais (média ponderada dos percentis por operação)
    const p50Global = totalJobs > 0
      ? operations.reduce((sum, op) => sum + (op.p50_duration_ms * op.total_jobs), 0) / totalJobs
      : 0;
    const p95Global = totalJobs > 0
      ? operations.reduce((sum, op) => sum + (op.p95_duration_ms * op.total_jobs), 0) / totalJobs
      : 0;
    const p99Global = totalJobs > 0
      ? operations.reduce((sum, op) => sum + (op.p99_duration_ms * op.total_jobs), 0) / totalJobs
      : 0;

    // Success rate global
    const successRateGlobal = totalJobs > 0
      ? (succeededJobs / totalJobs) * 100
      : 0;

    // Worker utilization (jobs running / workers ativos)
    const workersResult = await query(`
      select count(*) as active_workers
      from worker_health
      where last_heartbeat_at >= now() - interval '5 minutes'
    `);
    const activeWorkers = toInteger(workersResult.rows[0]?.active_workers);

    const runningJobsResult = await query(`
      select count(*) as running_jobs
      from jobs
      where status = 'running'
    `);
    const runningJobs = toInteger(runningJobsResult.rows[0]?.running_jobs);

    const workerUtilization = activeWorkers > 0
      ? (runningJobs / activeWorkers) * 100
      : 0;

    return {
      metrics: {
        job_execution_ms: {
          p50: Math.round(p50Global),
          p95: Math.round(p95Global),
          p99: Math.round(p99Global)
        },
        job_success_rate: toDecimal(successRateGlobal.toFixed(2)),
        worker_utilization: toDecimal(workerUtilization.toFixed(2))
      },
      by_operation: operations
    };
  } catch (error: unknown) {
    console.error('[health-repo] calculateJobPerformanceMetrics error:', getErrorMessage(error));
    // Retorna métricas vazias em caso de erro
    return {
      metrics: {
        job_execution_ms: { p50: 0, p95: 0, p99: 0 },
        job_success_rate: 0,
        worker_utilization: 0
      },
      by_operation: []
    };
  }
}

export async function calculateCetesbPerformanceMetrics(hoursBack = 24) {
  const safeHoursBack = Number.isFinite(Number(hoursBack))
    ? Math.max(1, Math.min(24 * 30, Math.floor(Number(hoursBack))))
    : 24;

  try {
    const result = await query(
      `with normalized as (
         select
           case
             when endpoint like '%/api/mtr/imprimir/imprimeManifesto/%' then 'GET /api/mtr/imprimir/imprimeManifesto/{hash}'
             when endpoint like '%/api/mtr/pesquisaManifesto/%' then 'GET /api/mtr/pesquisaManifesto/{filtros}'
             when endpoint like '%/api/mtr/manifesto/cancelaManifesto%' then 'POST /api/mtr/manifesto/cancelaManifesto'
             when endpoint like '%/api/mtr/manifesto%' and upper(http_method) = 'PUT' then 'PUT /api/mtr/manifesto'
             else concat(upper(coalesce(http_method, 'GET')), ' ', regexp_replace(split_part(coalesce(endpoint, ''), '?', 1), '^https?://[^/]+', ''))
           end as operation,
           latency_ms,
           http_status
         from audit_logs
         where occurred_at >= now() - ($1::integer || ' hours')::interval
           and endpoint is not null
           and endpoint like 'https://mtrr.cetesb.sp.gov.br/%'
       )
       select
         operation,
         count(*)::integer as total_jobs,
         count(*) filter (where coalesce(http_status, 0) between 200 and 399)::integer as succeeded_jobs,
         count(*) filter (where coalesce(http_status, 0) >= 400)::integer as failed_jobs,
         0::integer as dlq_jobs,
         round(avg(latency_ms) filter (where latency_ms is not null))::integer as avg_duration_ms,
         round(percentile_cont(0.50) within group (order by latency_ms) filter (where latency_ms is not null))::integer as p50_duration_ms,
         round(percentile_cont(0.95) within group (order by latency_ms) filter (where latency_ms is not null))::integer as p95_duration_ms,
         round(percentile_cont(0.99) within group (order by latency_ms) filter (where latency_ms is not null))::integer as p99_duration_ms,
         case
           when count(*) = 0 then 0
           else round((count(*) filter (where coalesce(http_status, 0) between 200 and 399)::numeric / count(*)::numeric) * 100, 2)
         end as success_rate
       from normalized
       group by operation
       order by total_jobs desc`,
      [safeHoursBack]
    );

    const operations = result.rows.map((row) => ({
      operation: row.operation,
      total_jobs: Number(row.total_jobs) || 0,
      succeeded_jobs: Number(row.succeeded_jobs) || 0,
      failed_jobs: Number(row.failed_jobs) || 0,
      dlq_jobs: 0,
      avg_duration_ms: Number(row.avg_duration_ms) || 0,
      p50_duration_ms: Number(row.p50_duration_ms) || 0,
      p95_duration_ms: Number(row.p95_duration_ms) || 0,
      p99_duration_ms: Number(row.p99_duration_ms) || 0,
      success_rate: Number(row.success_rate) || 0
    }));

    const totalJobs = operations.reduce((sum, operation) => sum + operation.total_jobs, 0);
    const succeededJobs = operations.reduce((sum, operation) => sum + operation.succeeded_jobs, 0);
    const p50Global = totalJobs > 0
      ? operations.reduce((sum, operation) => sum + (operation.p50_duration_ms * operation.total_jobs), 0) / totalJobs
      : 0;
    const p95Global = totalJobs > 0
      ? operations.reduce((sum, operation) => sum + (operation.p95_duration_ms * operation.total_jobs), 0) / totalJobs
      : 0;
    const p99Global = totalJobs > 0
      ? operations.reduce((sum, operation) => sum + (operation.p99_duration_ms * operation.total_jobs), 0) / totalJobs
      : 0;
    const successRateGlobal = totalJobs > 0
      ? (succeededJobs / totalJobs) * 100
      : 0;

    return {
      metrics: {
        job_execution_ms: {
          p50: Math.round(p50Global),
          p95: Math.round(p95Global),
          p99: Math.round(p99Global)
        },
        job_success_rate: Number(successRateGlobal.toFixed(2)),
        worker_utilization: 0
      },
      by_operation: operations
    };
  } catch (error: unknown) {
    console.error('[health-repo] calculateCetesbPerformanceMetrics error:', getErrorMessage(error));
    return {
      metrics: {
        job_execution_ms: { p50: 0, p95: 0, p99: 0 },
        job_success_rate: 0,
        worker_utilization: 0
      },
      by_operation: []
    };
  }
}

export async function getJobMetricsTimeline(hoursBack = 24, bucket = 'hour') {
  const safeHoursBack = Number.isFinite(Number(hoursBack))
    ? Math.max(1, Math.min(24 * 30, Math.floor(Number(hoursBack))))
    : 24;

  const bucketConfig = bucket === 'day'
    ? { trunc: 'day', step: "1 day" }
    : { trunc: 'hour', step: "1 hour" };

  try {
    const result = await query(
      `with buckets as (
         select generate_series(
           date_trunc('${bucketConfig.trunc}', now() - ($1::integer || ' hours')::interval),
           date_trunc('${bucketConfig.trunc}', now()),
           '${bucketConfig.step}'::interval
         ) as bucket_start
       ),
       jobs_agg as (
         select
           date_trunc('${bucketConfig.trunc}', j.finished_at) as bucket_start,
           count(*)::integer as total_jobs,
           count(*) filter (where j.status = 'succeeded')::integer as succeeded_jobs,
           count(*) filter (where j.status = 'failed')::integer as failed_jobs,
           count(*) filter (where j.status = 'dlq')::integer as dlq_jobs,
           avg(j.execution_time_ms) filter (where j.execution_time_ms is not null) as avg_duration_ms,
           percentile_cont(0.95) within group (order by j.execution_time_ms)
             filter (where j.execution_time_ms is not null) as p95_duration_ms
         from jobs j
         where j.finished_at >= now() - ($1::integer || ' hours')::interval
           and j.status in ('succeeded', 'failed', 'dlq')
         group by 1
       )
       select
         b.bucket_start,
         coalesce(a.total_jobs, 0) as total_jobs,
         coalesce(a.succeeded_jobs, 0) as succeeded_jobs,
         coalesce(a.failed_jobs, 0) as failed_jobs,
         coalesce(a.dlq_jobs, 0) as dlq_jobs,
         round(coalesce(a.avg_duration_ms, 0))::integer as avg_duration_ms,
         round(coalesce(a.p95_duration_ms, 0))::integer as p95_duration_ms,
         case
           when coalesce(a.total_jobs, 0) = 0 then 0
           else round((coalesce(a.succeeded_jobs, 0)::numeric / a.total_jobs::numeric), 4)
         end as success_rate
       from buckets b
       left join jobs_agg a on a.bucket_start = b.bucket_start
       order by b.bucket_start asc`,
      [safeHoursBack]
    );

    return result.rows.map((row) => ({
      bucket_start: row.bucket_start?.toISOString?.() || row.bucket_start,
      total_jobs: Number(row.total_jobs) || 0,
      succeeded_jobs: Number(row.succeeded_jobs) || 0,
      failed_jobs: Number(row.failed_jobs) || 0,
      dlq_jobs: Number(row.dlq_jobs) || 0,
      avg_duration_ms: Number(row.avg_duration_ms) || 0,
      p95_duration_ms: Number(row.p95_duration_ms) || 0,
      success_rate: Number(row.success_rate) || 0
    }));
  } catch (error: unknown) {
    console.error('[health-repo] getJobMetricsTimeline error:', getErrorMessage(error));
    return [];
  }
}

export async function getCetesbMetricsTimeline(hoursBack = 24, bucket = 'hour') {
  const safeHoursBack = Number.isFinite(Number(hoursBack))
    ? Math.max(1, Math.min(24 * 30, Math.floor(Number(hoursBack))))
    : 24;

  const bucketConfig = bucket === 'day'
    ? { trunc: 'day', step: '1 day' }
    : { trunc: 'hour', step: '1 hour' };

  try {
    const result = await query(
      `with buckets as (
         select generate_series(
           date_trunc('${bucketConfig.trunc}', now() - ($1::integer || ' hours')::interval),
           date_trunc('${bucketConfig.trunc}', now()),
           '${bucketConfig.step}'::interval
         ) as bucket_start
       ),
       audit_agg as (
         select
           date_trunc('${bucketConfig.trunc}', occurred_at) as bucket_start,
           count(*)::integer as total_calls,
           count(*) filter (where coalesce(http_status, 0) between 200 and 399)::integer as succeeded_calls,
           count(*) filter (where coalesce(http_status, 0) >= 400)::integer as failed_calls,
           round(avg(latency_ms) filter (where latency_ms is not null))::integer as avg_latency_ms,
           round(
             percentile_cont(0.95) within group (order by latency_ms)
             filter (where latency_ms is not null)
           )::integer as p95_latency_ms
         from audit_logs
         where occurred_at >= now() - ($1::integer || ' hours')::interval
           and endpoint is not null
           and endpoint like 'https://mtrr.cetesb.sp.gov.br/%'
         group by 1
       )
       select
         b.bucket_start,
         coalesce(a.total_calls, 0) as total_calls,
         coalesce(a.succeeded_calls, 0) as succeeded_calls,
         coalesce(a.failed_calls, 0) as failed_calls,
         coalesce(a.avg_latency_ms, 0) as avg_latency_ms,
         coalesce(a.p95_latency_ms, 0) as p95_latency_ms,
         case
           when coalesce(a.total_calls, 0) = 0 then 0
           else round((coalesce(a.succeeded_calls, 0)::numeric / a.total_calls::numeric), 4)
         end as success_rate
       from buckets b
       left join audit_agg a on a.bucket_start = b.bucket_start
       order by b.bucket_start asc`,
      [safeHoursBack]
    );

    return result.rows.map((row) => ({
      bucket_start: row.bucket_start?.toISOString?.() || row.bucket_start,
      total_jobs: Number(row.total_calls) || 0,
      succeeded_jobs: Number(row.succeeded_calls) || 0,
      failed_jobs: Number(row.failed_calls) || 0,
      dlq_jobs: 0,
      avg_duration_ms: Number(row.avg_latency_ms) || 0,
      p95_duration_ms: Number(row.p95_latency_ms) || 0,
      success_rate: Number(row.success_rate) || 0
    }));
  } catch (error: unknown) {
    console.error('[health-repo] getCetesbMetricsTimeline error:', getErrorMessage(error));
    return [];
  }
}

export async function getCetesbEndpointLatency(hoursBack = 24, limit = 10) {
  const safeHoursBack = Number.isFinite(Number(hoursBack))
    ? Math.max(1, Math.min(24 * 30, Math.floor(Number(hoursBack))))
    : 24;
  const safeLimit = Number.isFinite(Number(limit))
    ? Math.max(1, Math.min(20, Math.floor(Number(limit))))
    : 10;

  try {
    const result = await query(
      `with normalized as (
         select
           case
             when endpoint like '%/api/mtr/imprimir/imprimeManifesto/%' then 'GET /api/mtr/imprimir/imprimeManifesto/{hash}'
             when endpoint like '%/api/mtr/pesquisaManifesto/%' then 'GET /api/mtr/pesquisaManifesto/{filtros}'
             when endpoint like '%/api/mtr/manifesto/cancelaManifesto%' then 'POST /api/mtr/manifesto/cancelaManifesto'
             when endpoint like '%/api/mtr/manifesto%' and upper(http_method) = 'PUT' then 'PUT /api/mtr/manifesto'
             else concat(upper(coalesce(http_method, 'GET')), ' ', regexp_replace(split_part(coalesce(endpoint, ''), '?', 1), '^https?://[^/]+', ''))
           end as endpoint_group,
           latency_ms,
           http_status
         from audit_logs
         where occurred_at >= now() - ($1::integer || ' hours')::interval
           and endpoint is not null
           and endpoint like 'https://mtrr.cetesb.sp.gov.br/%'
       )
       select
         endpoint_group,
         count(*)::integer as total_calls,
         round(avg(latency_ms) filter (where latency_ms is not null))::integer as avg_latency_ms,
         round(
           percentile_cont(0.95) within group (order by latency_ms)
           filter (where latency_ms is not null)
         )::integer as p95_latency_ms,
         count(*) filter (where coalesce(http_status, 0) >= 400)::integer as error_calls,
         round(
           case
             when count(*) = 0 then 0
             else (count(*) filter (where coalesce(http_status, 0) >= 400)::numeric / count(*)::numeric)
           end,
           4
         ) as error_rate
       from normalized
       group by endpoint_group
       order by total_calls desc, p95_latency_ms desc nulls last
       limit $2`,
      [safeHoursBack, safeLimit]
    );

    return result.rows.map((row) => ({
      endpoint: row.endpoint_group,
      total_calls: Number(row.total_calls) || 0,
      avg_latency_ms: Number(row.avg_latency_ms) || 0,
      p95_latency_ms: Number(row.p95_latency_ms) || 0,
      error_calls: Number(row.error_calls) || 0,
      error_rate: Number(row.error_rate) || 0
    }));
  } catch (error: unknown) {
    console.error('[health-repo] getCetesbEndpointLatency error:', getErrorMessage(error));
    return [];
  }
}

/**
 * Captura snapshot de performance
 */
export async function capturePerformanceSnapshot(metricName: string, metricValue: number, tags: Record<string, unknown> = {}) {
  await query(
    `insert into performance_snapshots (metric_name, metric_value, tags)
     values ($1, $2, $3::jsonb)
     on conflict (snapshot_at, metric_name, tags) do update
     set metric_value = excluded.metric_value`,
    [metricName, metricValue, JSON.stringify(tags)]
  );
}

export async function captureDashboardSnapshots({
  hoursBack = 24,
  systemHealth = null,
  performance = null,
  endpointLatency = null
} = {}) {
  const safeHoursBack = Number.isFinite(Number(hoursBack))
    ? Math.max(1, Math.min(24 * 30, Math.floor(Number(hoursBack))))
    : 24;

  const snapshotAt = new Date().toISOString();
  const resolvedSystemHealth = systemHealth || await getSystemHealth();
  const resolvedPerformance = performance || await calculateJobPerformanceMetrics(safeHoursBack);
  const resolvedEndpointLatency = Array.isArray(endpointLatency)
    ? endpointLatency
    : await getCetesbEndpointLatency(safeHoursBack, 5);

  const systemStats = resolvedSystemHealth?.statistics || {};
  const perfMetrics = resolvedPerformance?.metrics || {};
  const operations = Array.isArray(resolvedPerformance?.by_operation)
    ? resolvedPerformance.by_operation
    : [];

  const rowsToPersist = [
    {
      metric_name: 'dashboard.jobs_queued',
      metric_value: Number(systemStats.jobs_queued || 0),
      tags: { scope: 'dashboard', window_hours: safeHoursBack }
    },
    {
      metric_name: 'dashboard.jobs_running',
      metric_value: Number(systemStats.jobs_running || 0),
      tags: { scope: 'dashboard', window_hours: safeHoursBack }
    },
    {
      metric_name: 'dashboard.jobs_dlq_total',
      metric_value: Number(systemStats.jobs_dlq_total || 0),
      tags: { scope: 'dashboard', window_hours: safeHoursBack }
    },
    {
      metric_name: 'dashboard.job_success_rate',
      metric_value: Number(perfMetrics?.job_success_rate || 0),
      tags: { scope: 'dashboard', window_hours: safeHoursBack }
    },
    {
      metric_name: 'dashboard.job_p95_ms',
      metric_value: Number(perfMetrics?.job_execution_ms?.p95 || 0),
      tags: { scope: 'dashboard', window_hours: safeHoursBack }
    },
    {
      metric_name: 'dashboard.worker_utilization',
      metric_value: Number(perfMetrics?.worker_utilization || 0),
      tags: { scope: 'dashboard', window_hours: safeHoursBack }
    }
  ];

  rowsToPersist.push(
    ...operations.slice(0, 5).flatMap(operation => ([
      {
        metric_name: 'dashboard.operation.success_rate',
        metric_value: Number(operation.success_rate || 0),
        tags: {
          scope: 'dashboard',
          window_hours: safeHoursBack,
          operation: operation.operation
        }
      },
      {
        metric_name: 'dashboard.operation.p95_ms',
        metric_value: Number(operation.p95_duration_ms || 0),
        tags: {
          scope: 'dashboard',
          window_hours: safeHoursBack,
          operation: operation.operation
        }
      }
    ])),
    ...resolvedEndpointLatency.slice(0, 5).flatMap(endpoint => ([
      {
        metric_name: 'dashboard.endpoint.p95_ms',
        metric_value: Number(endpoint.p95_latency_ms || 0),
        tags: {
          scope: 'dashboard',
          window_hours: safeHoursBack,
          endpoint: endpoint.endpoint
        }
      },
      {
        metric_name: 'dashboard.endpoint.error_rate',
        metric_value: Number(endpoint.error_rate || 0),
        tags: {
          scope: 'dashboard',
          window_hours: safeHoursBack,
          endpoint: endpoint.endpoint
        }
      }
    ]))
  );

  let persistedCount = 0;
  for (const row of rowsToPersist) {
    await query(
      `insert into performance_snapshots (snapshot_at, metric_name, metric_value, tags)
       values ($1::timestamptz, $2, $3, $4::jsonb)
       on conflict (snapshot_at, metric_name, tags) do update
       set metric_value = excluded.metric_value`,
      [snapshotAt, row.metric_name, row.metric_value, JSON.stringify(row.tags || {})]
    );
    persistedCount += 1;
  }

  return {
    snapshot_at: snapshotAt,
    persisted_count: persistedCount
  };
}

/**
 * Obtém health status geral do sistema
 */
export async function getSystemHealth() {
  try {
    // Buscar dados da view v_system_health
    const healthResult = await query(`
      select * from v_system_health
    `);

    const health = healthResult.rows[0] || {};

    // Determinar status geral
    let status = 'healthy';
    const workersActive = toInteger(health.workers_active_5m);
    const workersDegraded = toInteger(health.workers_degraded);
    const jobsQueued = toInteger(health.jobs_queued);

    if (workersActive === 0) {
      status = 'unhealthy'; // Nenhum worker ativo
    } else if (workersDegraded > 0 || jobsQueued > 100) {
      status = 'degraded'; // Workers com problemas ou fila crescendo
    }

    // Buscar versão do package.json
    let version = process.env.VERSION || '2.0.0';
    try {
      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
      version = packageJson.version || version;
    } catch (err: unknown) {
      console.warn('[health-repo] getSystemHealth version fallback:', getErrorMessage(err));
    }

    // Calcular uptime (assumimos que o sistema está rodando desde o boot do primeiro worker)
    const uptimeResult = await query(`
      select extract(epoch from (now() - min(started_at))) * 1000 as uptime_ms
      from worker_health
      where status != 'stopped'
    `);
    const uptimeMs = Math.floor(toDecimal(uptimeResult.rows[0]?.uptime_ms || 0));

    return {
      status,
      version,
      uptime_ms: uptimeMs,
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      statistics: {
        jobs_queued: toInteger(health.jobs_queued),
        jobs_running: toInteger(health.jobs_running),
        jobs_retry_wait: toInteger(health.jobs_retry_wait),
        jobs_succeeded_1h: toInteger(health.jobs_succeeded_1h),
        jobs_failed_1h: toInteger(health.jobs_failed_1h),
        jobs_dlq_total: toInteger(health.jobs_dlq_total),
        workers_healthy: toInteger(health.workers_healthy),
        workers_degraded: toInteger(health.workers_degraded),
        workers_active_5m: workersActive,
        avg_job_duration_ms_1h: toInteger(health.avg_job_duration_ms_1h)
      }
    };
  } catch (error: unknown) {
    // Falha graciosamente - se view não existe ou erro de DB, retorna degraded
    console.error('[health-repo] getSystemHealth error:', getErrorMessage(error));
    return {
      status: 'unhealthy',
      version: process.env.VERSION || '2.0.0',
      uptime_ms: 0,
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      statistics: {
        jobs_queued: 0,
        jobs_running: 0,
        jobs_retry_wait: 0,
        jobs_succeeded_1h: 0,
        jobs_failed_1h: 0,
        jobs_dlq_total: 0,
        workers_healthy: 0,
        workers_degraded: 0,
        workers_active_5m: 0,
        avg_job_duration_ms_1h: 0
      }
    };
  }
}

/**
 * Lista jobs ativos
 */
export async function listActiveJobs(limit = 100) {
  try {
    const result = await query(`
      select
        job_id,
        operation,
        entity_type,
        entity_id,
        status,
        attempts,
        max_attempts,
        priority,
        correlation_id,
        queued_at,
        claimed_at,
        claimed_by,
        next_retry_at,
        last_error_code,
        last_error_message,
        created_at,
        extract(epoch from (now() - queued_at))::integer as age_seconds
      from jobs
      where status in ('queued', 'running', 'retry_wait')
      order by created_at asc
      limit $1
    `, [limit]);

    return result.rows.map(row => ({
      job_id: row.job_id,
      operation: row.operation,
      entity_type: row.entity_type,
      entity_id: row.entity_id,
      status: row.status,
      attempts: row.attempts,
      max_attempts: row.max_attempts,
      priority: row.priority,
      correlation_id: row.correlation_id,
      queued_at: row.queued_at?.toISOString?.() || row.queued_at,
      claimed_at: row.claimed_at?.toISOString?.() || row.claimed_at,
      claimed_by: row.claimed_by,
      next_retry_at: row.next_retry_at?.toISOString?.() || row.next_retry_at,
      last_error_code: row.last_error_code,
      last_error_message: row.last_error_message,
      created_at: row.created_at?.toISOString?.() || row.created_at,
      age_seconds: row.age_seconds
    }));
  } catch (error: unknown) {
    console.error('[health-repo] listActiveJobs error:', getErrorMessage(error));
    // Retorna array vazio em caso de erro
    return [];
  }
}

/**
 * Executa cleanup de jobs antigos
 */
export async function cleanupOldJobs(retentionDays = 90, batchSize = 1000) {
  try {
    const result = await query(`
      select * from cleanup_old_jobs($1, $2)
    `, [retentionDays, batchSize]);

    const deletedCount = toInteger(result.rows[0]?.deleted_count);
    return deletedCount;
  } catch (error: unknown) {
    console.error('[health-repo] cleanupOldJobs error:', getErrorMessage(error));
    // Em caso de erro, retorna 0 deletados
    return 0;
  }
}

/**
 * Estatísticas agregadas de workers
 */
export async function getWorkerStatistics() {
  try {
    const result = await query(`
      select
        count(*) as total_workers,
        count(*) filter (where status = 'healthy') as healthy_workers,
        count(*) filter (where status = 'degraded') as degraded_workers,
        count(*) filter (where status = 'unhealthy') as unhealthy_workers,
        count(*) filter (where status = 'stopped') as stopped_workers,
        count(*) filter (where last_heartbeat_at >= now() - interval '5 minutes') as active_last_5m,
        coalesce(sum(total_jobs_claimed), 0) as total_jobs_claimed_all,
        coalesce(sum(total_jobs_succeeded), 0) as total_jobs_succeeded_all,
        coalesce(sum(total_jobs_failed), 0) as total_jobs_failed_all,
        coalesce(sum(total_jobs_dlq), 0) as total_jobs_dlq_all,
        coalesce(avg(avg_job_duration_ms), 0)::integer as avg_job_duration_ms_all
      from worker_health
    `);

    const row = result.rows[0] || {};

    return {
      total_workers: toInteger(row.total_workers),
      healthy_workers: toInteger(row.healthy_workers),
      degraded_workers: toInteger(row.degraded_workers),
      unhealthy_workers: toInteger(row.unhealthy_workers),
      stopped_workers: toInteger(row.stopped_workers),
      active_last_5m: toInteger(row.active_last_5m),
      total_jobs_claimed_all: toInteger(row.total_jobs_claimed_all),
      total_jobs_succeeded_all: toInteger(row.total_jobs_succeeded_all),
      total_jobs_failed_all: toInteger(row.total_jobs_failed_all),
      total_jobs_dlq_all: toInteger(row.total_jobs_dlq_all),
      avg_job_duration_ms_all: toInteger(row.avg_job_duration_ms_all)
    };
  } catch (error: unknown) {
    console.error('[health-repo] getWorkerStatistics error:', getErrorMessage(error));
    // Retorna estrutura vazia em caso de erro
    return {
      total_workers: 0,
      healthy_workers: 0,
      degraded_workers: 0,
      unhealthy_workers: 0,
      stopped_workers: 0,
      active_last_5m: 0,
      total_jobs_claimed_all: 0,
      total_jobs_succeeded_all: 0,
      total_jobs_failed_all: 0,
      total_jobs_dlq_all: 0,
      avg_job_duration_ms_all: 0
    };
  }
}
