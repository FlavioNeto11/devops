import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeConversationStructuredError,
  normalizeConversationStructuredResult
} from '../../src/services/conversation/results/conversation-result-normalizer.js';

describe('conversation result normalizer', () => {
  it('normaliza resultado de acao em lote para contrato estruturado', () => {
    const normalized = normalizeConversationStructuredResult({
      kind: 'action',
      data: {
        intent: 'manifest.batch_cancel_selected',
        affectedItems: [{ manifestId: 'man_1' }]
      },
      artifacts: [{
        type: 'notice',
        title: 'Preview',
        payload: { total: 1 }
      }],
      actions: [{
        type: 'confirm_tool_execution',
        label: 'Confirmar',
        payload: { confirmed: true }
      }]
    });

    assert.equal(normalized.type, 'manifest_batch_action');
    assert.equal(Array.isArray(normalized.actions), true);
    assert.equal(Array.isArray(normalized.artifacts), true);
    assert.equal(normalized.data.intent, 'manifest.batch_cancel_selected');
  });

  it('normaliza erro acionavel com correlationId e sugestao', () => {
    const normalized = normalizeConversationStructuredError({
      correlationId: 'corr_123',
      message: 'Falha de validacao',
      reasonCode: 'VALIDATION_ERROR',
      suggestion: 'Ajuste os campos obrigatorios.'
    });

    assert.equal(normalized.type, 'error_explanation');
    assert.equal(normalized.data.correlationId, 'corr_123');
    assert.equal(normalized.data.reasonCode, 'VALIDATION_ERROR');
    assert.equal(Array.isArray(normalized.actions), true);
    assert.equal(normalized.actions.length > 0, true);
  });

  it('normaliza preview de lote para manifest_batch_preview em modo query', () => {
    const normalized = normalizeConversationStructuredResult({
      kind: 'query',
      data: {
        intent: 'manifest.preview_batch_cancel_selected',
        requiresConfirmation: true
      }
    });

    assert.equal(normalized.type, 'manifest_batch_preview');
  });

  it('normaliza missing fields de criacao guiada para manifest_missing_fields', () => {
    const normalized = normalizeConversationStructuredResult({
      kind: 'query',
      data: {
        intent: 'manifest.create_missing_fields',
        missingFields: ['generator.partnerCode']
      }
    });

    assert.equal(normalized.type, 'manifest_missing_fields');
  });

  it('normaliza acao de cdf download em lote para cdf_action', () => {
    const normalized = normalizeConversationStructuredResult({
      kind: 'action',
      data: {
        intent: 'cdf.download_batch_selected',
        total: 2
      }
    });

    assert.equal(normalized.type, 'cdf_action');
  });
});
