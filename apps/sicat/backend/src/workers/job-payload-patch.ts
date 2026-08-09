/**
 * Patch incremental do `jobs.payload` durante a execução.
 *
 * Existe porque o job de mensagem de canal usa o próprio payload como LIVRO-RAZÃO de entrega
 * (`replyText` antes do envio, `replySentAt` depois) e `finishJob` só serve para o final — ele
 * REESCREVE o payload inteiro e conclui o job.
 *
 * ┌─ A MUTAÇÃO IN PLACE É LOAD-BEARING ───────────────────────────────────────────────────────────┐
 * │ `processClaimedJob` chama `processJob({ ...job, payload: job.payload ?? {} })`: o spread cria   │
 * │ um objeto novo, mas o `payload` é a MESMA referência. Depois, `handleDlqTransition` e           │
 * │ `handleFailedTransition` montam `{ ...job, payload: job.payload ?? {} }` a partir do objeto     │
 * │ ORIGINAL do runner. Sem o `Object.assign` abaixo, o side effect terminal leria o payload do     │
 * │ momento do claim — sem `userNotified`, sem `replyText` — e avisaria o usuário duas vezes; e     │
 * │ `moveJobToDLQ` copiaria a versão velha para a DLQ.                                             │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * Módulo próprio (em vez de uma função privada em `operation-handlers.ts`) para que a propriedade
 * acima seja testável sem Postgres e sem arrastar o grafo inteiro do worker: as duas escritas entram
 * por `deps`.
 */

import { updateJob, updateJobIfOwned } from '../repositories/job-repo.js';

type LooseRecord = Record<string, unknown>;

export type PatchableJob = {
  jobId: string;
  claimedBy?: string | null;
  payload: LooseRecord;
};

export type JobPayloadPatchDependencies = {
  updateJob: (jobId: string, patch: { payload: LooseRecord }) => Promise<unknown>;
  updateJobIfOwned: (jobId: string, claimedBy: string, patch: { payload: LooseRecord }) => Promise<unknown>;
};

const defaultDependencies: JobPayloadPatchDependencies = {
  updateJob: (jobId, patch) => updateJob(jobId, patch),
  updateJobIfOwned: (jobId, claimedBy, patch) => updateJobIfOwned(jobId, claimedBy, patch)
};

export async function patchJobPayload(
  job: PatchableJob,
  patch: LooseRecord,
  deps: JobPayloadPatchDependencies = defaultDependencies
): Promise<void> {
  const merged = { ...(job.payload || {}), ...patch };

  if (job.claimedBy) {
    const updated = await deps.updateJobIfOwned(job.jobId, job.claimedBy, { payload: merged });
    if (!updated) {
      // `job-runner.isOwnershipError` intercepta este código e aborta em silêncio — comportamento
      // correto: outro worker já é dono do job, e insistir duplicaria o efeito.
      const error: Error & { code?: string } = new Error(`Job ownership lost while patching payload ${job.jobId}`);
      error.code = 'JOB_OWNERSHIP_LOST';
      throw error;
    }
  } else {
    await deps.updateJob(job.jobId, { payload: merged });
  }

  Object.assign(job.payload, patch);
}
