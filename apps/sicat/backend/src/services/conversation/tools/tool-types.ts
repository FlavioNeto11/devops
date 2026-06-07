import type { ConversationChannel } from '../conversation-context-service.js';

export type ConversationToolRiskLevel = 'R1' | 'R2' | 'R3' | 'R4';

export type ConversationToolName =
  | 'orchestrate_manifest_operation'
  | 'list_manifests'
  | 'get_manifest_details'
  | 'list_manifest_documents'
  | 'list_cdf_certificates'
  | 'enqueue_cdf_download'
  | 'get_job_status'
  | 'list_jobs'
  | 'get_audit_trail'
  | 'query_catalog'
  | 'search_partners'
  | 'get_operations_overview'
  | 'list_dmr'
  | 'list_mtr_provisorio'
  | 'get_dashboard_overview'
  | 'diagnose_operation'
  | 'replicate_manifest'
  | 'submit_manifest'
  | 'print_manifest'
  | 'cancel_manifest';

export type ConversationToolPolicy = {
  riskLevel: ConversationToolRiskLevel;
  allowChannels: ConversationChannel[];
  requiresConfirmation: boolean;
  isAction: boolean;
};

export type ConversationToolInventoryItem = {
  toolName: ConversationToolName;
  category:
  | 'manifest'
  | 'jobs'
  | 'audit'
  | 'dashboard'
  | 'orchestration'
  | 'cdf'
  | 'catalog'
  | 'partner'
  | 'operations'
  | 'dmr'
  | 'mtr_provisorio';
  objective: string;
  dependencies: string[];
  policy: ConversationToolPolicy;
};

export type ConversationDispatcherContext = {
  correlationId: string;
  integrationAccountId: string | null;
  sessionContextId: string | null;
  requestedBy: string | null;
  manifestId: string | null;
  idempotencyKey: string | null;
  lastManifestSelectionIds?: string[];
};

export type ConversationActionCard = {
  type: 'confirm_tool_execution' | 'open_manifest' | 'open_job' | 'follow_up';
  label: string;
  payload: Record<string, unknown>;
};

export type ConversationArtifact = {
  type: 'manifest_list' | 'manifest_detail' | 'job' | 'notice' | 'document' | 'zip_bundle';
  title: string;
  payload: Record<string, unknown>;
};

export type ConversationNormalizedToolResult = {
  type: 'list' | 'detail' | 'action' | 'status';
  artifacts: ConversationArtifact[];
  actions: ConversationActionCard[];
};
