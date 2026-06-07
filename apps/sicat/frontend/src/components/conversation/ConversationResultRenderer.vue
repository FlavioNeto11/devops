<script setup>
import { computed } from 'vue';
import ManifestCardResult from './renderers/ManifestCardResult.vue';
import ManifestListResult from './renderers/ManifestListResult.vue';
import CdfCardResult from './renderers/CdfCardResult.vue';
import JobCardResult from './renderers/JobCardResult.vue';
import AuditCardResult from './renderers/AuditCardResult.vue';
import DownloadArtifactResult from './renderers/DownloadArtifactResult.vue';
import ArtifactListResult from './renderers/ArtifactListResult.vue';
import ZipArtifactResult from './renderers/ZipArtifactResult.vue';
import ActionConfirmationResult from './renderers/ActionConfirmationResult.vue';
import MissingFieldsResult from './renderers/MissingFieldsResult.vue';
import OperationProgressResult from './renderers/OperationProgressResult.vue';
import ErrorExplanationResult from './renderers/ErrorExplanationResult.vue';
import PolicyDecisionErrorResult from './renderers/PolicyDecisionErrorResult.vue';
import BatchPreviewResult from './renderers/BatchPreviewResult.vue';
import CreationPreviewResult from './renderers/CreationPreviewResult.vue';
import ReplicationPreviewResult from './renderers/ReplicationPreviewResult.vue';
import GroupedManifestCardsResult from './renderers/GroupedManifestCardsResult.vue';
import CdfBatchPreviewResult from './renderers/CdfBatchPreviewResult.vue';
import OperationFeedbackResult from './renderers/OperationFeedbackResult.vue';
import { asArray, asRecord, toNullableText } from './renderers/result-helpers.js';

const props = defineProps({
  message: {
    type: Object,
    required: true
  }
});

const emit = defineEmits(['action', 'download-artifact']);

const result = computed(() => asRecord(props.message?.result));
const data = computed(() => asRecord(result.value.data));
const artifacts = computed(() => asArray(result.value.artifacts));
const actions = computed(() => asArray(result.value.actions));

const cdfPayload = computed(() => {
  if (toNullableText(data.value.intent) !== 'cdf.resolve_by_manifest_reference') {
    return null;
  }

  return data.value;
});

const missingFields = computed(() => {
  const fields = asArray(data.value.missingFields);
  if (fields.length > 0) {
    return fields;
  }

  const context = asRecord(data.value.context);
  return asArray(context.missingFields);
});

const hasError = computed(() => {
  return Boolean(props.message?.status === 'failed' || toNullableText(result.value.error));
});

const progressArtifact = computed(() => {
  return artifacts.value.find((item) => {
    const artifact = asRecord(item);
    const payload = asRecord(artifact.payload);
    const status = toNullableText(payload.status) || '';
    return ['collecting', 'running', 'processing', 'pending'].includes(status);
  }) || null;
});

const confirmationAction = computed(() => {
  const fromActions = actions.value.find((action) => asRecord(action).type === 'confirm_tool_execution');
  if (fromActions) {
    return fromActions;
  }

  return props.message?.confirmationAction || null;
});

const isAuditResult = computed(() => {
  const toolName = toNullableText(props.message?.toolName);
  return toolName === 'get_audit_trail' || Array.isArray(data.value.items);
});

// ===== Phase 06 - New Result Type Detection =====

const policyDecision = computed(() => {
  const reasonCode = toNullableText(result.value.reasonCode || data.value.reasonCode);
  if (reasonCode && ['BATCH_LIMIT_EXCEEDED', 'CROSS_ACCOUNT_VIOLATION', 'SESSION_SCOPE_MISMATCH', 'CHANNEL_BLOCKED', 'PERMISSION_DENIED'].includes(reasonCode)) {
    return {
      reasonCode,
      reason: toNullableText(result.value.reason || data.value.reason),
      requiresConfirmation: Boolean(result.value.requiresConfirmation),
      riskLevel: toNullableText(result.value.riskLevel),
      maxBatchSize: Number(result.value.maxBatchSize || data.value.maxBatchSize || 0),
      enforcedScope: toNullableText(result.value.enforcedScope || data.value.enforcedScope)
    };
  }
  return null;
});

const batchPreviewData = computed(() => {
  const intent = toNullableText(data.value.intent);
  if (intent && intent.includes('batch_') && data.value.selectedItems) {
    return data.value;
  }
  return null;
});

const creationPreviewData = computed(() => {
  const intent = toNullableText(data.value.intent);
  if (intent === 'manifest.preview_create_from_payload' || data.value.missingFields) {
    return data.value;
  }
  return null;
});

const replicationPreviewData = computed(() => {
  const intent = toNullableText(data.value.intent);
  if (intent === 'manifest.replicate_with_patch' || intent === 'manifest.replicate_segmented') {
    if (data.value.sourceManifest || data.value.patch) {
      return data.value;
    }
  }
  return null;
});

const groupedManifestsData = computed(() => {
  const intent = toNullableText(data.value.intent);
  if ((intent === 'manifest.group_recent_top' || data.value.groupBy) && Array.isArray(data.value.items)) {
    return data.value;
  }
  return null;
});

const cdfBatchPreviewData = computed(() => {
  const intent = toNullableText(data.value.intent);
  if (intent && intent.includes('cdf') && intent.includes('batch')) {
    if (Array.isArray(data.value.selectedCdfs) || Array.isArray(data.value.cdfDocuments)) {
      return data.value;
    }
  }
  return null;
});

const operationFeedbackData = computed(() => {
  const feedbackType = toNullableText(data.value.feedbackType || data.value.type);
  if (feedbackType && ['partial_failure', 'retry_available', 'operation_success', 'operation_failure', 'batch_feedback'].includes(feedbackType)) {
    return data.value;
  }
  return null;
});


function onAction(action) {
  emit('action', action);
}

function onDownload(artifact) {
  emit('download-artifact', artifact);
}
</script>

<template>
  <div class="result-grid" v-if="result.type || artifacts.length || hasError || missingFields.length || policyDecision || batchPreviewData || creationPreviewData || replicationPreviewData || groupedManifestsData || cdfBatchPreviewData || operationFeedbackData">
    <!-- Order 1: Policy Decision Errors (highest priority - must block before any action) -->
    <PolicyDecisionErrorResult
      v-if="policyDecision"
      :decision="policyDecision"
      @action="onAction"
    />

    <!-- Order 2: Batch Preview with snapshot -->
    <BatchPreviewResult
      v-if="batchPreviewData"
      :data="batchPreviewData"
      @action="onAction"
    />

    <!-- Order 3: Creation Preview (guided creation with missing fields) -->
    <CreationPreviewResult
      v-if="creationPreviewData && !batchPreviewData"
      :data="creationPreviewData"
      @action="onAction"
    />

    <!-- Order 4: Replication Preview -->
    <ReplicationPreviewResult
      v-if="replicationPreviewData && !batchPreviewData && !creationPreviewData"
      :data="replicationPreviewData"
      @action="onAction"
    />

    <!-- Order 5: Grouped Manifests -->
    <GroupedManifestCardsResult
      v-if="groupedManifestsData"
      :data="groupedManifestsData"
    />

    <!-- Order 6: CDF Batch Preview -->
    <CdfBatchPreviewResult
      v-if="cdfBatchPreviewData"
      :data="cdfBatchPreviewData"
      @action="onAction"
    />

    <!-- Order 7: Operation Feedback (partial failures, retries, success) -->
    <OperationFeedbackResult
      v-if="operationFeedbackData"
      :data="operationFeedbackData"
      @action="onAction"
    />

    <!-- Order 8: Standard Artifacts (manifest lists, details, jobs) -->
    <ManifestListResult
      v-for="(artifact, index) in artifacts.filter((item) => asRecord(item).type === 'manifest_list')"
      :key="`manifest-list-${index}`"
      :artifact="artifact"
    />

    <ManifestCardResult
      v-for="(artifact, index) in artifacts.filter((item) => asRecord(item).type === 'manifest_detail')"
      :key="`manifest-card-${index}`"
      :manifest="asRecord(artifact).payload"
    />

    <CdfCardResult v-if="cdfPayload" :data="cdfPayload" />

    <JobCardResult
      v-for="(artifact, index) in artifacts.filter((item) => asRecord(item).type === 'job')"
      :key="`job-card-${index}`"
      :artifact="artifact"
    />

    <AuditCardResult
      v-if="isAuditResult"
      :data="data"
      :correlation-id="message.correlationId"
    />

    <!-- Order 9: Downloads and Artifacts (documents, zips) -->
    <DownloadArtifactResult
      v-for="(artifact, index) in artifacts.filter((item) => asRecord(item).type === 'document')"
      :key="`doc-${index}`"
      :artifact="artifact"
      @download="onDownload"
    />

    <ZipArtifactResult
      v-for="(artifact, index) in artifacts.filter((item) => asRecord(item).type === 'zip_bundle')"
      :key="`zip-${index}`"
      :artifact="artifact"
      @download="onDownload"
    />

    <ArtifactListResult
      v-if="artifacts.length > 1"
      :artifacts="artifacts"
      @download="onDownload"
    />

    <!-- Order 10: Confirmations and operations -->
    <ActionConfirmationResult
      v-if="confirmationAction"
      :action="confirmationAction"
      :description="message.confirmationText || message.text"
      @confirm="onAction"
      @cancel="onAction({ kind: 'cancel_confirmation', action: confirmationAction })"
    />

    <!-- Order 11: Missing fields and Progress -->
    <MissingFieldsResult v-if="missingFields.length" :fields="missingFields" />

    <OperationProgressResult
      v-if="progressArtifact"
      :title="'operation_progress'"
      :progress="asRecord(asRecord(progressArtifact).payload).progress"
      :status="asRecord(asRecord(progressArtifact).payload).status || 'running'"
    />

    <!-- Order 12: Errors (last resort - catches unhandled errors) -->
    <ErrorExplanationResult
      v-if="hasError && !policyDecision && !operationFeedbackData"
      :detail="toNullableText(result.error) || message.text"
      :title="'error_explanation'"
    />

    <!-- Order 13: Generic actions (fallback) -->
    <div v-if="actions.length" class="result-actions">
      <v-btn
        v-for="(action, index) in actions.filter((item) => asRecord(item).type !== 'confirm_tool_execution')"
        :key="`result-action-${index}`"
        variant="tonal"
        color="primary"
        size="small"
        @click="onAction(action)"
      >
        {{ asRecord(action).label || 'Acao' }}
      </v-btn>
    </div>
  </div>
</template>

<style scoped>
.result-grid {
  display: grid;
  gap: 10px;
  margin-top: 8px;
}

.result-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
</style>
