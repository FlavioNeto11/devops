import fs from 'node:fs/promises';
import path from 'node:path';
import { withTransaction } from '../src/db/pool.ts';

function normalizeStoragePath(value) {
  return String(value || '').trim();
}

async function removeManifestArtifacts(storagePaths) {
  const uniquePaths = [...new Set((Array.isArray(storagePaths) ? storagePaths : [])
    .map(normalizeStoragePath)
    .filter(Boolean))];

  let removedFiles = 0;
  const manifestDirectories = new Set();

  for (const storagePath of uniquePaths) {
    try {
      await fs.rm(storagePath, { force: true });
      removedFiles += 1;
    } catch {}

    const manifestDirectory = path.dirname(storagePath);
    if (manifestDirectory) {
      manifestDirectories.add(manifestDirectory);
    }
  }

  for (const manifestDirectory of manifestDirectories) {
    try {
      await fs.rm(manifestDirectory, { recursive: true, force: true });
    } catch {}
  }

  return {
    removedFiles,
    removedDirectories: manifestDirectories.size
  };
}

async function resetManifestDomain() {
  const summary = await withTransaction(async (client) => {
    const manifestRows = await client.query(
      `select id, correlation_id
         from manifests`
    );
    const manifestCorrelationIds = manifestRows.rows.map((row) => row.correlation_id).filter(Boolean);

    const documentRows = await client.query(
      `select storage_path
         from manifest_documents`
    );
    const storagePaths = documentRows.rows.map((row) => row.storage_path).filter(Boolean);

    const jobRows = await client.query(
      `select job_id, correlation_id
         from jobs
        where entity_type = 'manifest'
           or operation like 'manifest.%'`
    );
    const jobIds = jobRows.rows.map((row) => row.job_id).filter(Boolean);
    const jobCorrelationIds = jobRows.rows.map((row) => row.correlation_id).filter(Boolean);

    const correlationIds = [...new Set([...manifestCorrelationIds, ...jobCorrelationIds])];

    const deletedManifestAuditLogs = await client.query('delete from manifest_audit_logs');
    const deletedManifestDocuments = await client.query('delete from manifest_documents');
    const deletedManifests = await client.query('delete from manifests');

    const deletedDlq = jobIds.length > 0
      ? await client.query('delete from job_dead_letter_queue where job_id = any($1::text[])', [jobIds])
      : { rowCount: 0 };

    const deletedJobs = await client.query(
      `delete from jobs
        where entity_type = 'manifest'
           or operation like 'manifest.%'`
    );

    const deletedIdempotency = await client.query(
      `delete from idempotency_registry
        where operation like 'manifest.%'`
    );

    const deletedHourlyMetrics = await client.query(
      `delete from job_metrics_hourly
        where operation like 'manifest.%'`
    );

    const deletedAuditLogs = correlationIds.length > 0
      ? await client.query(
        `delete from audit_logs
          where entity_type = 'manifest'
             or correlation_id = any($1::text[])`,
        [correlationIds]
      )
      : await client.query(`delete from audit_logs where entity_type = 'manifest'`);

    return {
      storagePaths,
      deletedManifests: deletedManifests.rowCount || 0,
      deletedManifestDocuments: deletedManifestDocuments.rowCount || 0,
      deletedManifestAuditLogs: deletedManifestAuditLogs.rowCount || 0,
      deletedJobs: deletedJobs.rowCount || 0,
      deletedDlq: deletedDlq.rowCount || 0,
      deletedAuditLogs: deletedAuditLogs.rowCount || 0,
      deletedIdempotency: deletedIdempotency.rowCount || 0,
      deletedHourlyMetrics: deletedHourlyMetrics.rowCount || 0
    };
  });

  const artifactSummary = await removeManifestArtifacts(summary.storagePaths);

  return {
    ...summary,
    ...artifactSummary
  };
}

try {
  const result = await resetManifestDomain();

  console.log('✅ Reset do domínio de manifestos concluído.');
  console.log(`- manifestos removidos: ${result.deletedManifests}`);
  console.log(`- documentos removidos: ${result.deletedManifestDocuments}`);
  console.log(`- auditorias de manifesto removidas: ${result.deletedManifestAuditLogs}`);
  console.log(`- jobs removidos: ${result.deletedJobs}`);
  console.log(`- DLQ removida: ${result.deletedDlq}`);
  console.log(`- audit_logs removidos: ${result.deletedAuditLogs}`);
  console.log(`- idempotência removida: ${result.deletedIdempotency}`);
  console.log(`- métricas horárias removidas: ${result.deletedHourlyMetrics}`);
  console.log(`- arquivos removidos: ${result.removedFiles}`);
  console.log(`- diretórios limpos: ${result.removedDirectories}`);
  console.log('ℹ️ Preservado: login SICAT, sessões SICAT, contas CETESB, session_contexts e tabelas de acesso.');
  process.exit(0);
} catch (error) {
  console.error('❌ Falha ao resetar o domínio de manifestos.');
  console.error(error?.stack || error?.message || error);
  process.exit(1);
}