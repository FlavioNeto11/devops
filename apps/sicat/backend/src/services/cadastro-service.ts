import { createPrefixedId } from '../lib/ids.js';
import { AppError } from '../lib/problem.js';
import { buildCommandAccepted } from '../lib/command-response.js';
import { insertCadastro, updateCadastro, findCadastroById } from '../repositories/cadastro-repo.js';
import { ensureIntegrationAccount } from '../repositories/integration-account-repo.js';
import { insertJob, listJobsByEntity } from '../repositories/job-repo.js';
import { config } from '../lib/config.js';
import { getIdempotentResponse, rememberIdempotentResponse } from './idempotency-service.js';
import { calculateJobPriority, getRetryConfig, extractJobTags } from '../lib/retry.js';

type LooseRecord = Record<string, unknown>;
type HeaderMap = Record<string, string | undefined>;
type CadastroBody = {
  integrationAccountId: string;
  enterprise?: {
    document?: string | null;
  };
  address?: {
    stateCode?: string | null;
  };
  requestedBy?: string | null;
  [key: string]: unknown;
};

export async function createCadastro(body: CadastroBody, headers: HeaderMap, correlationId: string | null) {
  if (!body?.integrationAccountId) {
    throw new AppError(400, 'Bad Request', 'integrationAccountId is required.');
  }

  const idempotencyKey = headers['idempotency-key'];
  const reused = await getIdempotentResponse('cadastro.submit', idempotencyKey);
  if (reused) return reused;

  await ensureIntegrationAccount(body.integrationAccountId, {
    partnerDocument: body.enterprise?.document || null,
    stateCode: body.address?.stateCode || null
  });

  const cadastroId = createPrefixedId('cad');
  const jobId = createPrefixedId('job');
  const commandId = createPrefixedId('cmd');

  await insertCadastro({
    id: cadastroId,
    integrationAccountId: body.integrationAccountId,
    status: 'queued',
    requestedBy: body.requestedBy || null,
    correlationId,
    payload: body
  });

  const operation = 'cadastro.submit';
  const retryConfig = getRetryConfig(operation);
  const priority = calculateJobPriority(operation);

  await insertJob({
    jobId,
    commandId,
    entityType: 'cadastro',
    entityId: cadastroId,
    operation,
    payload: body,
    status: 'queued',
    maxAttempts: retryConfig.maxAttempts,
    correlationId,
    idempotencyKey,
    priority,
    retryStrategy: retryConfig.strategy,
    baseDelayMs: retryConfig.baseDelayMs,
    maxDelayMs: retryConfig.maxDelayMs,
    tags: extractJobTags({ operation, entityType: 'cadastro', status: 'queued' })
  });

  const response = buildCommandAccepted({
    commandId,
    jobId,
    correlationId: String(correlationId || ''),
    entityType: 'cadastro',
    entityId: cadastroId,
    operation: 'cadastro.submit'
  });

  await rememberIdempotentResponse({ operation: 'cadastro.submit', idempotencyKey, entityType: 'cadastro', entityId: cadastroId, response });
  return response;
}

export async function getCadastro(id: string) {
  const cadastro = await findCadastroById(id);
  if (!cadastro) {
    throw new AppError(404, 'Not Found', `Cadastro ${id} was not found.`);
  }

  const jobs = (await listJobsByEntity('cadastro', id)).map((job) => ({
    jobId: job.jobId,
    operation: job.operation,
    status: job.status
  }));
  return {
    id: cadastro.id,
    integrationAccountId: cadastro.integrationAccountId,
    status: cadastro.status,
    requestedBy: cadastro.requestedBy,
    ...cadastro.payload,
    external: cadastro.externalResponse,
    jobs,
    createdAt: cadastro.createdAt,
    updatedAt: cadastro.updatedAt
  };
}


export async function markCadastroSubmitted(cadastroId: string, externalResponse: Record<string, unknown>) {
  return updateCadastro(cadastroId, { status: 'submitted', externalResponse });
}
