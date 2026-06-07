import { z } from 'zod';
import { AppError } from '../../../lib/problem.js';
import type { ConversationToolName } from './tool-types.js';

const manifestReferenceSchema = z.object({
  type: z.enum(['last', 'list_item', 'id', 'number']).optional(),
  index: z.coerce.number().int().min(1).max(50).optional(),
  manifestId: z.string().trim().min(1).max(64).optional(),
  manifestNumber: z.string().trim().min(1).max(32).optional()
}).passthrough();

const listManifestsSchema = z.object({
  integrationAccountId: z.string().trim().min(1).max(64).optional(),
  sessionContextId: z.string().trim().min(1).max(64).optional(),
  dateFrom: z.string().trim().min(8).max(32).optional(),
  dateTo: z.string().trim().min(8).max(32).optional(),
  status: z.string().trim().min(1).max(64).optional(),
  page: z.coerce.number().int().min(1).max(500).optional(),
  pageSize: z.coerce.number().int().min(1).max(200).optional(),
  top: z.coerce.number().int().min(1).max(20).optional(),
  orderBy: z.enum(['recency_desc', 'recency_asc']).optional()
}).passthrough();

const manifestActionSchema = z.object({
  manifestId: z.string().trim().min(1).max(64).optional(),
  manifestNumber: z.string().trim().min(1).max(32).optional(),
  reference: manifestReferenceSchema.optional(),
  requestedBy: z.string().trim().min(1).max(128).optional(),
  sessionContextId: z.string().trim().min(1).max(64).optional(),
  reason: z.string().trim().min(1).max(500).optional(),
  validateOnly: z.coerce.boolean().optional(),
  printAfterSubmit: z.coerce.boolean().optional(),
  confirmed: z.coerce.boolean().optional()
}).passthrough();

const rawPassThrough = z.object({}).passthrough();

const toolSchemas: Record<ConversationToolName, z.ZodTypeAny> = {
  orchestrate_manifest_operation: rawPassThrough,
  list_manifests: listManifestsSchema,
  get_manifest_details: manifestActionSchema,
  list_manifest_documents: z.object({
    manifestId: z.string().trim().min(1).max(64)
  }).passthrough(),
  list_cdf_certificates: z.object({
    integrationAccountId: z.string().trim().min(1).max(64).optional(),
    sessionContextId: z.string().trim().min(1).max(64).optional(),
    dateFrom: z.string().trim().min(8).max(32).optional(),
    dateTo: z.string().trim().min(8).max(32).optional()
  }).passthrough(),
  enqueue_cdf_download: z.object({
    integrationAccountId: z.string().trim().min(1).max(64).optional(),
    sessionContextId: z.string().trim().min(1).max(64).optional(),
    documentId: z.string().trim().min(1).max(128),
    confirmed: z.coerce.boolean().optional()
  }).passthrough(),
  get_job_status: z.object({
    jobId: z.string().trim().min(1).max(80)
  }).passthrough(),
  list_jobs: rawPassThrough,
  get_audit_trail: z.object({
    correlationId: z.string().trim().min(1).max(120).optional()
  }).passthrough(),
  query_catalog: z.object({
    catalogName: z.string().trim().min(1).max(120),
    search: z.string().trim().min(1).max(120).optional(),
    page: z.coerce.number().int().min(1).max(500).optional(),
    pageSize: z.coerce.number().int().min(1).max(200).optional(),
    integrationAccountId: z.string().trim().min(1).max(64).optional(),
    sessionContextId: z.string().trim().min(1).max(64).optional()
  }).passthrough(),
  search_partners: z.object({
    role: z.string().trim().min(1).max(64),
    q: z.string().trim().min(1).max(160).optional(),
    integrationAccountId: z.string().trim().min(1).max(64).optional(),
    sessionContextId: z.string().trim().min(1).max(64).optional(),
    page: z.coerce.number().int().min(1).max(500).optional(),
    pageSize: z.coerce.number().int().min(1).max(200).optional()
  }).passthrough(),
  get_operations_overview: rawPassThrough,
  list_dmr: rawPassThrough,
  list_mtr_provisorio: rawPassThrough,
  get_dashboard_overview: rawPassThrough,
  diagnose_operation: z.object({
    question: z.string().trim().min(1).max(2000).optional()
  }).passthrough(),
  replicate_manifest: rawPassThrough,
  submit_manifest: manifestActionSchema,
  print_manifest: manifestActionSchema,
  cancel_manifest: manifestActionSchema
};

function formatIssues(issues: z.ZodIssue[]) {
  return issues
    .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('; ');
}

export function validateConversationToolInput(toolName: ConversationToolName, rawArgs: Record<string, unknown>) {
  const parsed = toolSchemas[toolName].safeParse(rawArgs || {});
  if (!parsed.success) {
    throw new AppError(
      400,
      'Bad Request',
      `Invalid arguments for tool ${toolName}: ${formatIssues(parsed.error.issues)}`,
      { code: 'CONVERSATION_TOOL_VALIDATION_FAILED' }
    );
  }

  return parsed.data as Record<string, unknown>;
}
