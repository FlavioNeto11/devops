/**
 * Testes de integração: persistência e isolamento de memória multi-turno
 *
 * Valida que o `conversation-service.processTurn` persiste mensagens no banco
 * entre turnos (via `conversation_messages`) e que sessões diferentes têm
 * isolamento completo de histórico.
 *
 * Não depende de OpenAI/LangGraph — usa mock de llmProvider que captura
 * o `history` recebido para assertivas diretas.
 */

import { before, beforeEach, after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { pool, query } from '../../src/db/pool.js';
import { createConversationService } from '../../src/services/conversation/conversation-service.js';

const ACCOUNT_ID = 'acc_test_conv_mem_001';
const ACCOUNT_ID_ALT = 'acc_test_conv_mem_002';
const SESSION_A = 'csn_test_conv_mem_A';
const SESSION_B = 'csn_test_conv_mem_B';

function buildTurnInput(overrides = {}) {
  return {
    body: {
      channel: 'inapp',
      message: { text: 'mensagem de teste' },
      context: {
        integrationAccountId: ACCOUNT_ID,
        sessionContextId: null,
        requestedBy: 'qa_tester'
      },
      options: { allowActions: false }
    },
    correlationId: 'corr_test_conv_mem_001',
    headers: {},
    idempotencyKey: null,
    ...overrides
  };
}

/** Cria um provider mock que armazena o history recebido no último plano. */
function createCapturingProvider(responseText = 'Resposta mock.') {
  let capturedHistory = null;

  return {
    capturedHistory: () => capturedHistory,
    provider: {
      async plan(input) {
        capturedHistory = input.history ?? [];
        return {
          provider: 'langchain',
          confidence: 0.9,
          outputText: responseText,
          toolCall: null
        };
      }
    }
  };
}

describe('conversation multi-turn memory integration', () => {
  before(async () => {
    await pool.connect().then((c) => c.release());
  });

  beforeEach(async () => {
    await query(
      'DELETE FROM conversation_action_logs WHERE conversation_session_id LIKE $1',
      ['csn_test_conv_mem_%']
    );
    await query(
      'DELETE FROM conversation_messages WHERE conversation_session_id LIKE $1',
      ['csn_test_conv_mem_%']
    );
    await query(
      'DELETE FROM conversation_sessions WHERE id LIKE $1',
      ['csn_test_conv_mem_%']
    );
    await query('DELETE FROM integration_accounts WHERE id = ANY($1)', [[ACCOUNT_ID, ACCOUNT_ID_ALT]]);
    await query(
      'INSERT INTO integration_accounts(id, account_name, is_active) VALUES ($1, $2, $3)',
      [ACCOUNT_ID, 'Conversation Memory QA Account', true]
    );
    await query(
      'INSERT INTO integration_accounts(id, account_name, is_active) VALUES ($1, $2, $3)',
      [ACCOUNT_ID_ALT, 'Conversation Memory QA Account Alt', true]
    );
  });

  after(async () => {
    await query(
      'DELETE FROM conversation_action_logs WHERE conversation_session_id LIKE $1',
      ['csn_test_conv_mem_%']
    );
    await query(
      'DELETE FROM conversation_messages WHERE conversation_session_id LIKE $1',
      ['csn_test_conv_mem_%']
    );
    await query(
      'DELETE FROM conversation_sessions WHERE id LIKE $1',
      ['csn_test_conv_mem_%']
    );
    await query('DELETE FROM integration_accounts WHERE id = ANY($1)', [[ACCOUNT_ID, ACCOUNT_ID_ALT]]);
    await pool.end();
  });

  it('persiste mensagens entre turnos na mesma sessao via DB', async () => {
    const cap1 = createCapturingProvider('Entendido no turno 1.');
    const service1 = createConversationService({ llmProvider: cap1.provider });

    // Turno 1 — envia mensagem, mock não usa histórico ainda
    const turn1 = await service1.processTurn(
      buildTurnInput({
        body: {
          channel: 'inapp',
          message: { text: 'Meu manifesto preferido e o MTR-999.' },
          context: { integrationAccountId: ACCOUNT_ID, requestedBy: 'qa_tester' },
          options: { allowActions: false },
          conversationSessionId: SESSION_A
        },
        correlationId: 'corr_test_conv_mem_t1',
        idempotencyKey: 'idem_test_conv_mem_t1'
      })
    );

    assert.equal(turn1.status, 'responded');
    assert.equal(turn1.conversationSessionId, SESSION_A);
    // No turno 1 o histórico deve estar vazio (sem turnos prévios)
    assert.deepEqual(cap1.capturedHistory(), []);

    // Turno 2 na mesma sessão — o service deve carregar as mensagens do turno 1
    const cap2 = createCapturingProvider('Turno 2 com historico.');
    const service2 = createConversationService({ llmProvider: cap2.provider });

    const turn2 = await service2.processTurn(
      buildTurnInput({
        body: {
          channel: 'inapp',
          message: { text: 'Qual e o meu manifesto preferido?' },
          context: { integrationAccountId: ACCOUNT_ID, requestedBy: 'qa_tester' },
          options: { allowActions: false },
          conversationSessionId: SESSION_A
        },
        correlationId: 'corr_test_conv_mem_t2',
        idempotencyKey: 'idem_test_conv_mem_t2'
      })
    );

    assert.equal(turn2.status, 'responded');

    const history = cap2.capturedHistory();
    assert.ok(Array.isArray(history), 'history deve ser array');
    assert.ok(history.length > 0, `history deve conter mensagens do turno 1 — recebeu: ${JSON.stringify(history)}`);

    // Ao menos uma entrada de histórico deve conter texto do turno 1
    const hasUserTurn1 = history.some(
      (h) => h.role === 'user' && typeof h.text === 'string' && h.text.includes('MTR-999')
    );
    const hasAssistantTurn1 = history.some(
      (h) => h.role === 'assistant' && typeof h.text === 'string' && h.text.includes('Entendido no turno 1')
    );
    assert.ok(
      hasUserTurn1,
      `O histórico deve conter a mensagem do turno 1 com "MTR-999". Histórico recebido: ${JSON.stringify(history)}`
    );
    assert.ok(
      hasAssistantTurn1,
      `O histórico deve conter a resposta do assistente do turno 1. Histórico recebido: ${JSON.stringify(history)}`
    );
  });

  it('isola historico entre sessoes diferentes', async () => {
    // Sessão A — turno 1
    const capA = createCapturingProvider('Resposta sessao A.');
    const serviceA = createConversationService({ llmProvider: capA.provider });

    await serviceA.processTurn(
      buildTurnInput({
        body: {
          channel: 'inapp',
          message: { text: 'Segredo exclusivo da sessao A.' },
          context: { integrationAccountId: ACCOUNT_ID, requestedBy: 'qa_tester' },
          options: { allowActions: false },
          conversationSessionId: SESSION_A
        },
        correlationId: 'corr_test_conv_mem_iso_A1',
        idempotencyKey: 'idem_test_conv_mem_iso_A1'
      })
    );

    // Sessão B — primeiro turno, não deve ver histórico da sessão A
    const capB = createCapturingProvider('Resposta sessao B.');
    const serviceB = createConversationService({ llmProvider: capB.provider });

    const turnB = await serviceB.processTurn(
      buildTurnInput({
        body: {
          channel: 'inapp',
          message: { text: 'Alguma mensagem na sessao B.' },
          context: { integrationAccountId: ACCOUNT_ID, requestedBy: 'qa_tester' },
          options: { allowActions: false },
          conversationSessionId: SESSION_B
        },
        correlationId: 'corr_test_conv_mem_iso_B1',
        idempotencyKey: 'idem_test_conv_mem_iso_B1'
      })
    );

    assert.equal(turnB.status, 'responded');

    const historyB = capB.capturedHistory();
    assert.ok(Array.isArray(historyB), 'historico da sessao B deve ser array');

    const leaked = historyB.some(
      (h) => typeof h.text === 'string' && h.text.includes('Segredo exclusivo da sessao A')
    );
    assert.equal(
      leaked,
      false,
      `Sessao B nao deve receber historico da sessao A. Historico B: ${JSON.stringify(historyB)}`
    );
  });

  it('nao compartilha historico quando a mesma session id e usada por contas diferentes', async () => {
    // Conta A grava o primeiro turno na sessao compartilhada.
    const capA = createCapturingProvider('Resposta conta A.');
    const serviceA = createConversationService({ llmProvider: capA.provider });

    await serviceA.processTurn(
      buildTurnInput({
        body: {
          channel: 'inapp',
          message: { text: 'Segredo da conta A na mesma session id.' },
          context: { integrationAccountId: ACCOUNT_ID, requestedBy: 'qa_tester' },
          options: { allowActions: false },
          conversationSessionId: SESSION_A
        },
        correlationId: 'corr_test_conv_mem_cross_acc_A1',
        idempotencyKey: 'idem_test_conv_mem_cross_acc_A1'
      })
    );

    // Conta B usa exatamente a mesma sessao; historico da conta A nao pode aparecer.
    const capB = createCapturingProvider('Resposta conta B.');
    const serviceB = createConversationService({ llmProvider: capB.provider });

    const turnB = await serviceB.processTurn(
      buildTurnInput({
        body: {
          channel: 'inapp',
          message: { text: 'Pergunta da conta B na mesma session id.' },
          context: { integrationAccountId: ACCOUNT_ID_ALT, requestedBy: 'qa_tester' },
          options: { allowActions: false },
          conversationSessionId: SESSION_A
        },
        correlationId: 'corr_test_conv_mem_cross_acc_B1',
        idempotencyKey: 'idem_test_conv_mem_cross_acc_B1'
      })
    );

    assert.equal(turnB.status, 'responded');

    const historyB = capB.capturedHistory();
    assert.ok(Array.isArray(historyB), 'historico da conta B deve ser array');

    const leakedFromAccountA = historyB.some(
      (h) => typeof h.text === 'string' && h.text.includes('Segredo da conta A na mesma session id')
    );
    assert.equal(
      leakedFromAccountA,
      false,
      `Conta B nao deve receber historico da conta A na mesma session id. Historico B: ${JSON.stringify(historyB)}`
    );
  });
});
