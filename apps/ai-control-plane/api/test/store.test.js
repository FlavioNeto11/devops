// Testes das funções PURAS do ai-control-plane (node:test, SEM banco):
// validação de payload, normalização, montagem de params SQL e agregação.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EVAL_MODES,
  FEEDBACK_KINDS,
  buildEvalRunInsertParams,
  buildFeedbackInsertParams,
  computePassRate,
  genId,
  normalizePromptName,
  parseDays,
  parseLimit,
  summarizeFeedbackRows,
  validateActivatePayload,
  validateCreateVersionPayload,
  validateEvalRunPayload,
  validateFeedbackPayload,
} from '../src/store.js';
import { evaluateWriteAuth, timingSafeEqualStr } from '../src/auth.js';

describe('genId', () => {
  test('gera id com prefixo e hex aleatório', () => {
    const id = genId('pv');
    assert.match(id, /^pv_[0-9a-f]{16}$/);
    assert.notEqual(genId('pv'), genId('pv'));
  });
});

describe('normalizePromptName', () => {
  test('aceita nomes pontuados e faz trim', () => {
    assert.equal(normalizePromptName('gymops.chat.system'), 'gymops.chat.system');
    assert.equal(normalizePromptName('  sicat.copilot_v2-x  '), 'sicat.copilot_v2-x');
  });
  test('rejeita vazio, não-string, chars inválidos e nome gigante', () => {
    assert.equal(normalizePromptName(''), null);
    assert.equal(normalizePromptName('   '), null);
    assert.equal(normalizePromptName(null), null);
    assert.equal(normalizePromptName(42), null);
    assert.equal(normalizePromptName('a b'), null);
    assert.equal(normalizePromptName('.starts.with.dot'), null);
    assert.equal(normalizePromptName('a/b'), null);
    assert.equal(normalizePromptName('a'.repeat(201)), null);
  });
});

describe('parseDays / parseLimit', () => {
  test('defaults e clamp', () => {
    assert.equal(parseDays(undefined), 7);
    assert.equal(parseDays(''), 7);
    assert.equal(parseDays('30'), 30);
    assert.equal(parseDays('0'), 1);
    assert.equal(parseDays('9999'), 365);
    assert.equal(parseDays('abc'), 7);
    assert.equal(parseLimit(undefined), 20);
    assert.equal(parseLimit('5'), 5);
    assert.equal(parseLimit('1000'), 200);
    assert.equal(parseLimit('-3'), 1);
    assert.equal(parseLimit('zzz'), 20);
  });
});

describe('computePassRate', () => {
  test('total 0 ou inválido -> null', () => {
    assert.equal(computePassRate(0, 0), null);
    assert.equal(computePassRate(-1, 0), null);
    assert.equal(computePassRate('10', 5), null);
    assert.equal(computePassRate(10, '5'), null);
  });
  test('razão passed/total', () => {
    assert.equal(computePassRate(10, 7), 0.7);
    assert.equal(computePassRate(3, 3), 1);
    assert.equal(computePassRate(4, 0), 0);
  });
});

describe('validateCreateVersionPayload', () => {
  test('promptText obrigatório', () => {
    for (const body of [undefined, null, 'str', {}, { promptText: '' }, { promptText: '   ' }, { promptText: 7 }]) {
      const r = validateCreateVersionPayload(body);
      assert.equal(r.ok, false);
      assert.equal(r.error.code, 'VALIDATION_ERROR');
    }
  });
  test('payload mínimo válido com defaults', () => {
    const r = validateCreateVersionPayload({ promptText: 'You are a helpful assistant.' });
    assert.equal(r.ok, true);
    assert.deepEqual(r.value, {
      promptText: 'You are a helpful assistant.',
      label: null,
      createdBy: null,
      description: null,
      activate: false,
    });
  });
  test('payload completo normalizado', () => {
    const r = validateCreateVersionPayload({
      promptText: 'text',
      label: '  v2-shorter  ',
      createdBy: 'flavio',
      description: 'desc',
      activate: true,
    });
    assert.equal(r.ok, true);
    assert.equal(r.value.label, 'v2-shorter');
    assert.equal(r.value.activate, true);
  });
  test('tipos errados em campos opcionais', () => {
    assert.equal(validateCreateVersionPayload({ promptText: 'x', label: 9 }).ok, false);
    assert.equal(validateCreateVersionPayload({ promptText: 'x', activate: 'yes' }).ok, false);
    assert.equal(validateCreateVersionPayload({ promptText: 'x', createdBy: {} }).ok, false);
  });
});

describe('validateActivatePayload', () => {
  test('sem confirmed=true -> CONFIRMATION_REQUIRED', () => {
    for (const body of [{}, { versionId: 'pv_x' }, { versionId: 'pv_x', confirmed: false }, { versionId: 'pv_x', confirmed: 'true' }]) {
      const r = validateActivatePayload(body);
      assert.equal(r.ok, false);
      assert.equal(r.error.code, 'CONFIRMATION_REQUIRED');
    }
  });
  test('confirmed=true sem versionId -> VALIDATION_ERROR', () => {
    const r = validateActivatePayload({ confirmed: true });
    assert.equal(r.ok, false);
    assert.equal(r.error.code, 'VALIDATION_ERROR');
  });
  test('payload válido', () => {
    const r = validateActivatePayload({ confirmed: true, versionId: ' pv_abc123 ' });
    assert.equal(r.ok, true);
    assert.deepEqual(r.value, { versionId: 'pv_abc123' });
  });
});

describe('validateFeedbackPayload', () => {
  test('app e kind obrigatórios; kind precisa ser do enum', () => {
    assert.equal(validateFeedbackPayload({}).ok, false);
    assert.equal(validateFeedbackPayload({ app: 'gymops' }).ok, false);
    assert.equal(validateFeedbackPayload({ app: 'gymops', kind: 'meh' }).ok, false);
    assert.equal(validateFeedbackPayload({ kind: 'thumbs_up' }).ok, false);
  });
  test('defaults: surface=chat, metadata={}', () => {
    const r = validateFeedbackPayload({ app: ' gymops ', kind: 'thumbs_up' });
    assert.equal(r.ok, true);
    assert.deepEqual(r.value, {
      app: 'gymops',
      surface: 'chat',
      kind: 'thumbs_up',
      refId: null,
      toolName: null,
      comment: null,
      metadata: {},
    });
  });
  test('metadata precisa ser objeto plano', () => {
    assert.equal(validateFeedbackPayload({ app: 'a', kind: 'thumbs_down', metadata: [] }).ok, false);
    assert.equal(validateFeedbackPayload({ app: 'a', kind: 'thumbs_down', metadata: 'x' }).ok, false);
    const r = validateFeedbackPayload({ app: 'a', kind: 'thumbs_down', metadata: { model: 'gpt-5' } });
    assert.equal(r.ok, true);
    assert.deepEqual(r.value.metadata, { model: 'gpt-5' });
  });
  test('todos os kinds do enum passam', () => {
    for (const kind of FEEDBACK_KINDS) {
      assert.equal(validateFeedbackPayload({ app: 'sicat', kind }).ok, true);
    }
  });
});

describe('validateEvalRunPayload', () => {
  const base = { app: 'sicat', mode: 'sample', total: 10, passed: 8, failed: 2 };
  test('payload válido calcula passRate', () => {
    const r = validateEvalRunPayload(base);
    assert.equal(r.ok, true);
    assert.equal(r.value.passRate, 0.8);
    assert.deepEqual(r.value.kpis, {});
    assert.deepEqual(r.value.metadata, {});
  });
  test('total=0 -> passRate null', () => {
    const r = validateEvalRunPayload({ ...base, total: 0, passed: 0, failed: 0 });
    assert.equal(r.ok, true);
    assert.equal(r.value.passRate, null);
  });
  test('mode fora do enum -> erro', () => {
    assert.equal(validateEvalRunPayload({ ...base, mode: 'prod' }).ok, false);
    for (const mode of EVAL_MODES) {
      assert.equal(validateEvalRunPayload({ ...base, mode }).ok, true);
    }
  });
  test('contadores precisam ser inteiros >= 0', () => {
    assert.equal(validateEvalRunPayload({ ...base, total: -1 }).ok, false);
    assert.equal(validateEvalRunPayload({ ...base, passed: 1.5 }).ok, false);
    assert.equal(validateEvalRunPayload({ ...base, failed: '2' }).ok, false);
    assert.equal(validateEvalRunPayload({ ...base, total: undefined }).ok, false);
  });
});

describe('montagem de params SQL', () => {
  test('buildFeedbackInsertParams na ordem das colunas', () => {
    const value = validateFeedbackPayload({
      app: 'gymops',
      surface: 'copilot',
      kind: 'thumbs_down',
      refId: 'msg-1',
      toolName: 'list_activities',
      comment: 'resposta errada',
      metadata: { model: 'gpt-5' },
    }).value;
    const params = buildFeedbackInsertParams('fb_1', value);
    assert.deepEqual(params, [
      'fb_1',
      'gymops',
      'copilot',
      'thumbs_down',
      'msg-1',
      'list_activities',
      'resposta errada',
      '{"model":"gpt-5"}',
    ]);
  });
  test('buildEvalRunInsertParams na ordem das colunas (jsonb serializado)', () => {
    const value = validateEvalRunPayload({
      app: 'sicat',
      mode: 'ci',
      total: 20,
      passed: 19,
      failed: 1,
      kpis: { p50_ms: 1200 },
    }).value;
    const params = buildEvalRunInsertParams('er_1', value);
    assert.deepEqual(params, ['er_1', 'sicat', 'ci', 20, 19, 1, 0.95, '{"p50_ms":1200}', '{}']);
  });
});

describe('summarizeFeedbackRows', () => {
  test('agrega byKind, byApp e total', () => {
    const rows = [
      { app: 'gymops', kind: 'thumbs_up', count: 5 },
      { app: 'gymops', kind: 'thumbs_down', count: 2 },
      { app: 'sicat', kind: 'thumbs_up', count: 3 },
    ];
    assert.deepEqual(summarizeFeedbackRows(rows), {
      byKind: { thumbs_up: 8, thumbs_down: 2 },
      byApp: {
        gymops: { thumbs_up: 5, thumbs_down: 2 },
        sicat: { thumbs_up: 3, thumbs_down: 0 },
      },
      total: 10,
    });
  });
  test('vazio/null -> zeros', () => {
    assert.deepEqual(summarizeFeedbackRows([]), {
      byKind: { thumbs_up: 0, thumbs_down: 0 },
      byApp: {},
      total: 0,
    });
    assert.deepEqual(summarizeFeedbackRows(null).total, 0);
  });
  test('kind desconhecido não contamina byKind mas entra no total', () => {
    const s = summarizeFeedbackRows([{ app: 'x', kind: 'other', count: 4 }]);
    assert.deepEqual(s.byKind, { thumbs_up: 0, thumbs_down: 0 });
    assert.equal(s.total, 4);
  });
});

describe('evaluateWriteAuth (auth pura)', () => {
  test('sem token configurado -> 503 WRITES_DISABLED (fail-closed)', () => {
    for (const configured of [undefined, null, '', '   ']) {
      const r = evaluateWriteAuth('Bearer whatever', configured);
      assert.equal(r.ok, false);
      assert.equal(r.status, 503);
      assert.equal(r.code, 'WRITES_DISABLED');
    }
  });
  test('header ausente/malformado/token errado -> 401', () => {
    for (const header of [undefined, '', 'Basic abc', 'Bearer wrong-token']) {
      const r = evaluateWriteAuth(header, 'secret-token');
      assert.equal(r.ok, false);
      assert.equal(r.status, 401);
      assert.equal(r.code, 'UNAUTHORIZED');
    }
  });
  test('token correto -> ok (case-insensitive no scheme)', () => {
    assert.equal(evaluateWriteAuth('Bearer secret-token', 'secret-token').ok, true);
    assert.equal(evaluateWriteAuth('bearer secret-token', 'secret-token').ok, true);
  });
  test('timingSafeEqualStr', () => {
    assert.equal(timingSafeEqualStr('abc', 'abc'), true);
    assert.equal(timingSafeEqualStr('abc', 'abd'), false);
    assert.equal(timingSafeEqualStr('abc', 'abcd'), false);
  });
});
