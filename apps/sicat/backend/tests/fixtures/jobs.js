// Fixtures de jobs para testes
export const queuedSubmitJob = {
  jobId: 'job_test_submit_001',
  commandId: 'cmd_test_submit_001',
  entityType: 'manifest',
  entityId: 'man_test_draft_001',
  operation: 'manifest.submit',
  payload: {
    sessionContextId: 'scx_test_001',
    validateOnly: false,
    printAfterSubmit: false,
    requestedBy: 'test.user'
  },
  status: 'queued',
  maxAttempts: 3,
  attempts: 0,
  correlationId: 'corr_test_submit_001',
  idempotencyKey: 'idem_test_submit_001',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
};

export const runningSubmitJob = {
  ...queuedSubmitJob,
  status: 'running',
  attempts: 1,
  startedAt: new Date().toISOString()
};

export const succeededSubmitJob = {
  ...queuedSubmitJob,
  status: 'succeeded',
  attempts: 1,
  startedAt: new Date().toISOString(),
  finishedAt: new Date().toISOString(),
  payload: {
    ...queuedSubmitJob.payload,
    outcome: 'manifest_submitted'
  }
};

export const failedSubmitJob = {
  ...queuedSubmitJob,
  status: 'failed',
  attempts: 3,
  startedAt: new Date().toISOString(),
  finishedAt: new Date().toISOString(),
  lastErrorCode: 'GATEWAY_ERROR',
  lastErrorMessage: 'Failed to submit manifest to CETESB'
};
