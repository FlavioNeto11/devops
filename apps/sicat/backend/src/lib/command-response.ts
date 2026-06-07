import { nowIso } from './time.js';

type CommandEntityType = 'manifest' | 'cadastro' | 'job' | string;

type BuildCommandAcceptedInput = {
  commandId: string;
  jobId: string;
  correlationId: string;
  entityType: CommandEntityType;
  entityId: string;
  operation: string;
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
  operation
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
        entityType === 'manifest'
          ? `/v1/manifestos/${entityId}`
          : entityType === 'cadastro'
            ? `/v1/cadastros/${entityId}`
            : entityType === 'dmr'
              ? `/v1/dmr/${entityId}`
              : entityType === 'mtr_provisorio'
                ? `/v1/mtr-provisorio/${entityId}`
                : `/v1/jobs/${jobId}`,
      audit: `/v1/audit/${correlationId}`
    }
  };
}
