import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveSpecialistForIntent,
  specialistToolNames,
  listConversationSpecialists,
  CONVERSATION_SPECIALISTS
} from '../../src/services/conversation/agents/conversation-specialists.js';
import { isRegisteredConversationTool } from '../../src/services/conversation/tools/tool-registry.js';

test('roteia intents de manifesto para o especialista manifest', () => {
  assert.equal(resolveSpecialistForIntent('manifest.list_recent_top').id, 'manifest');
  assert.equal(resolveSpecialistForIntent('list_manifests').id, 'manifest');
  assert.equal(resolveSpecialistForIntent('memory.list_asked_manifests').id, 'manifest');
});

test('roteia CDF, operações e catálogo aos seus especialistas', () => {
  assert.equal(resolveSpecialistForIntent('cdf.list_by_manifest_selection').id, 'cdf');
  assert.equal(resolveSpecialistForIntent('list_cdf_certificates').id, 'cdf');
  assert.equal(resolveSpecialistForIntent('diagnose_operation').id, 'operations');
  assert.equal(resolveSpecialistForIntent('get_dashboard_overview').id, 'operations');
  assert.equal(resolveSpecialistForIntent('list_jobs').id, 'operations');
  assert.equal(resolveSpecialistForIntent('query_catalog').id, 'catalog');
  assert.equal(resolveSpecialistForIntent('search_partners').id, 'catalog');
});

test('conversa/saudação/unclear vão para o especialista conversacional (sem tools)', () => {
  assert.equal(resolveSpecialistForIntent('conversation').id, 'conversation');
  assert.equal(resolveSpecialistForIntent('greeting').id, 'conversation');
  assert.equal(resolveSpecialistForIntent('unclear').id, 'conversation');
  assert.deepEqual(specialistToolNames('conversation'), []);
});

test('intent desconhecido/vazio cai no fallback (manifest)', () => {
  assert.equal(resolveSpecialistForIntent('').id, 'manifest');
  assert.equal(resolveSpecialistForIntent(null).id, 'manifest');
  assert.equal(resolveSpecialistForIntent('xpto.qualquer').id, 'manifest');
});

test('toda tool mapeada num especialista é uma tool registrada de verdade', () => {
  for (const spec of listConversationSpecialists()) {
    for (const toolName of spec.tools) {
      assert.ok(isRegisteredConversationTool(toolName), `tool não registrada no specialist ${spec.id}: ${toolName}`);
    }
  }
});

test('não há tool duplicada entre especialistas (exceto o meta-orquestrador compartilhado)', () => {
  const SHARED = new Set(['orchestrate_manifest_operation']); // orquestrador cobre intents manifest + cdf-por-manifesto
  const seen = new Map();
  for (const spec of listConversationSpecialists()) {
    for (const toolName of spec.tools) {
      if (SHARED.has(toolName)) continue;
      assert.ok(!seen.has(toolName), `tool ${toolName} duplicada em ${spec.id} e ${seen.get(toolName)}`);
      seen.set(toolName, spec.id);
    }
  }
});

test('cada especialista tem foco e ao menos um intent/prefixo', () => {
  for (const spec of Object.values(CONVERSATION_SPECIALISTS)) {
    assert.ok(spec.focus.length > 10, `foco vazio em ${spec.id}`);
    assert.ok(spec.intentPrefixes.length + spec.intents.length > 0, `sem intents em ${spec.id}`);
  }
});
