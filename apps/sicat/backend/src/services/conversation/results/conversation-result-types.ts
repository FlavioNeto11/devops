export type ConversationResultType =
  | 'manifest_list'
  | 'manifest_detail'
  | 'grouped_manifest_list'
  | 'manifest_batch_preview'
  | 'manifest_batch_action'
  | 'manifest_replication_preview'
  | 'manifest_creation_draft'
  | 'manifest_missing_fields'
  | 'cdf_list'
  | 'cdf_detail'
  | 'cdf_action'
  | 'job_card'
  | 'job_list'
  | 'audit_timeline'
  | 'download_artifact'
  | 'artifact_list'
  | 'zip_artifact'
  | 'action_confirmation'
  | 'operation_progress'
  | 'error_explanation';

export type ConversationResultAction = {
  type: string;
  label: string;
  payload: Record<string, unknown>;
};

export type ConversationResultArtifact = {
  type: string;
  title: string;
  payload: Record<string, unknown>;
};

export type ConversationStructuredResult = {
  type: ConversationResultType;
  data: Record<string, unknown>;
  artifacts: ConversationResultArtifact[];
  actions: ConversationResultAction[];
  assistantSummary?: string;
  jobId?: string | null;
};
