import { nowIso } from './time.js';

type CommandEntityType = 'manifest' | 'cadastro' | 'job' | string;

type BuildCommandAcceptedInput = {
  commandId: string;
  jobId: string;
  correlationId: string;
  entityType: CommandEntityType;
  entityId: string;
  operation: string;
  /**
   * Link explícito do recurso — usado quando o link do contrato NÃO é derivável só de
   * `entityType`/`entityId` (ex.: `ciot_operation`: `entityId` é o id da `transport_operations` pai
   * — para o job dedupar por operação — mas o GET do ciclo do CIOT vive em
   * `/v1/transporte/operacoes/{operationId}/ciot`). Quando informado, sobrepõe o ternário abaixo.
   */
  entityLink?: string;
};

type CommandAcceptedResponse = {
  commandId: string;
  jobId: string;
  correlationId: string;
  entityType: string;
  entityId: string;
  operation: string;
  status: 'queued';
  submittedAt: string;
  links: {
    job: string;
    entity: string;
    audit: string;
  };
};

export function buildCommandAccepted({
  commandId,
  jobId,
  correlationId,
  entityType,
  entityId,
  operation,
  entityLink
}: BuildCommandAcceptedInput): CommandAcceptedResponse {
  return {
    commandId,
    jobId,
    correlationId,
    entityType,
    entityId,
    operation,
    status: 'queued',
    submittedAt: nowIso(),
    links: {
      job: `/v1/jobs/${jobId}`,
      entity:
        entityLink
          ?? (entityType === 'manifest'
            ? `/v1/manifestos/${entityId}`
            : entityType === 'cadastro'
              ? `/v1/cadastros/${entityId}`
              : entityType === 'dmr'
                ? `/v1/dmr/${entityId}`
                : entityType === 'mtr_provisorio'
                  ? `/v1/mtr-provisorio/${entityId}`
                  : entityType === 'transport_party'
                    ? `/v1/transporte/transportadores/${entityId}`
                    : `/v1/jobs/${jobId}`),
      audit: `/v1/audit/${correlationId}`
    }
  };
}
