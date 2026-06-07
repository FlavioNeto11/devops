import { before, beforeEach, after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { pool, query } from '../../src/db/pool.js';
import { createConversationService } from '../../src/services/conversation/conversation-service.js';
import { validManifestDraft } from '../fixtures/manifests.js';

const ACCOUNT_ID = 'acc_test_conv_ops_001';
const ACCOUNT_ID_ALT = 'acc_test_conv_ops_002';

// Síntese determinística para testes: a redação final usa o resumo determinístico
// (fallbackSummary), evitando dependência de rede/LLM real e mantendo as asserções
// estáveis. Em produção o synthesizer padrão (LLM) raciocina sobre a evidência.
const DETERMINISTIC_SYNTHESIZER = async ({ fallbackSummary }) => fallbackSummary;

function buildTurnInput(overrides = {}) {
  return {
    body: {
      channel: 'inapp',
      message: { text: 'acao composta' },
      context: {
        integrationAccountId: ACCOUNT_ID,
        sessionContextId: null,
        requestedBy: 'qa_tester'
      },
      options: {
        allowActions: true
      }
    },
    correlationId: 'corr_test_conv_ops_001',
    headers: {},
    idempotencyKey: 'idem_test_conv_ops_001',
    ...overrides
  };
}

async function insertManifestWithDate(id, expeditionDate, options = {}) {
  const integrationAccountId = options.integrationAccountId ?? ACCOUNT_ID;
  const payload = {
    ...validManifestDraft.payload,
    expeditionDate,
    driverName: options.driverName ?? 'Motorista Teste',
    vehiclePlate: options.vehiclePlate ?? 'ABC1D23',
    generator: {
      partnerCode: options.generatorCode ?? '1001',
      description: options.generator ?? 'Gerador QA'
    },
    carrier: {
      partnerCode: options.carrierCode ?? '2002',
      description: options.carrier ?? 'Transportador QA'
    },
    receiver: {
      partnerCode: options.receiverCode ?? '3003',
      description: options.receiver ?? 'Destinador QA'
    },
    requestedBy: 'qa_tester'
  };

  await query(
    `INSERT INTO manifests(
      id, integration_account_id, session_context_id, status,
      external_status, external_reference, external_hash_code, payload, correlation_id, last_sync_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9, now())`,
    [
      id,
      integrationAccountId,
      null,
      options.status ?? 'draft',
      options.externalStatus ?? null,
      options.externalReference ?? (options.manifestNumber
        ? { manNumero: String(options.manifestNumber) }
        : null),
      options.externalHashCode ?? null,
      JSON.stringify(payload),
      'corr_test_conv_ops_seed'
    ]
  );
}

describe('conversation composed operations integration', () => {
  before(async () => {
    await pool.connect().then((client) => client.release());
  });

  beforeEach(async () => {
    await query('DELETE FROM conversation_action_logs WHERE conversation_session_id LIKE $1', ['csn_test_conv_ops_%']);
    await query('DELETE FROM conversation_messages WHERE conversation_session_id LIKE $1', ['csn_test_conv_ops_%']);
    await query('DELETE FROM conversation_sessions WHERE id LIKE $1', ['csn_test_conv_ops_%']);
    await query('DELETE FROM jobs WHERE correlation_id LIKE $1', ['corr_test_conv_ops_%']);
    await query('DELETE FROM manifests WHERE integration_account_id = ANY($1)', [[ACCOUNT_ID, ACCOUNT_ID_ALT]]);
    await query('DELETE FROM integration_accounts WHERE id = ANY($1)', [[ACCOUNT_ID, ACCOUNT_ID_ALT]]);

    await query(
      'INSERT INTO integration_accounts(id, account_name, is_active) VALUES ($1, $2, $3)',
      [ACCOUNT_ID, 'Conversation Ops QA Account', true]
    );
    await query(
      'INSERT INTO integration_accounts(id, account_name, is_active) VALUES ($1, $2, $3)',
      [ACCOUNT_ID_ALT, 'Conversation Ops QA Account Alt', true]
    );
  });

  after(async () => {
    await query('DELETE FROM conversation_action_logs WHERE conversation_session_id LIKE $1', ['csn_test_conv_ops_%']);
    await query('DELETE FROM conversation_messages WHERE conversation_session_id LIKE $1', ['csn_test_conv_ops_%']);
    await query('DELETE FROM conversation_sessions WHERE id LIKE $1', ['csn_test_conv_ops_%']);
    await query('DELETE FROM jobs WHERE correlation_id LIKE $1', ['corr_test_conv_ops_%']);
    await query('DELETE FROM manifests WHERE integration_account_id = ANY($1)', [[ACCOUNT_ID, ACCOUNT_ID_ALT]]);
    await query('DELETE FROM integration_accounts WHERE id = ANY($1)', [[ACCOUNT_ID, ACCOUNT_ID_ALT]]);
    await pool.end();
  });

  it('bloqueia cancelamento composto sem confirmacao explicita', async () => {
    const service = createConversationService({
      synthesizer: DETERMINISTIC_SYNTHESIZER,
      llmProvider: {
        async plan() {
          return {
            provider: 'langchain',
            confidence: 1,
            outputText: 'Plano de cancelamento composto.',
            toolCall: {
              name: 'orchestrate_manifest_operation',
              arguments: {
                intent: 'manifest.cancel_recent_excluding_first',
                selection: {
                  top: 3,
                  skipMostRecent: 1
                }
              },
              confirmed: false
            }
          };
        }
      }
    });

    const result = await service.processTurn(
      buildTurnInput({
        body: {
          channel: 'inapp',
          message: { text: 'cancelar os 3 manifestos mais recentes ignorando o primeiro mais recente' },
          context: {
            integrationAccountId: ACCOUNT_ID,
            requestedBy: 'qa_tester'
          },
          options: {
            allowActions: true
          },
          conversationSessionId: 'csn_test_conv_ops_block_001'
        },
        correlationId: 'corr_test_conv_ops_block_001',
        idempotencyKey: 'idem_test_conv_ops_block_001'
      })
    );

    assert.equal(result.status, 'blocked');
    assert.equal(result.policy.allowed, false);
    assert.equal(result.policy.reasonCode, 'CONFIRMATION_REQUIRED');
    assert.equal(result.policy.requiresConfirmation, true);
    assert.equal(result.toolCall?.name, 'orchestrate_manifest_operation');

    assert.ok(result.conversationSessionId);
    assert.ok(result.conversationTurnId);
    assert.ok(result.correlationId);
    assert.ok(result.llm);
    assert.ok(result.context);
  });

  it('executa cancelamento composto com snapshot confirmado e trilha deterministica persistida', async () => {
    await insertManifestWithDate('man_test_conv_ops_001', '2026-04-10');
    await insertManifestWithDate('man_test_conv_ops_002', '2026-04-11');
    await insertManifestWithDate('man_test_conv_ops_003', '2026-04-12');
    await insertManifestWithDate('man_test_conv_ops_004', '2026-04-13');
    await insertManifestWithDate('man_test_conv_ops_005', '2026-04-14');

    const service = createConversationService({
      synthesizer: DETERMINISTIC_SYNTHESIZER,
      llmProvider: {
        async plan() {
          return {
            provider: 'langchain',
            confidence: 1,
            outputText: 'Texto generico do provider',
            toolCall: {
              name: 'orchestrate_manifest_operation',
              arguments: {
                intent: 'manifest.cancel_recent_excluding_first',
                selection: {
                  top: 3,
                  skipMostRecent: 1
                },
                previewOnly: true
              },
              confirmed: true
            }
          };
        }
      }
    });

    const preview = await service.processTurn(
      buildTurnInput({
        body: {
          channel: 'inapp',
          message: { text: 'preview cancelar os 3 manifestos mais recentes ignorando o primeiro mais recente' },
          context: {
            integrationAccountId: ACCOUNT_ID,
            requestedBy: 'qa_tester'
          },
          options: {
            allowActions: true
          },
          conversationSessionId: 'csn_test_conv_ops_cancel_001'
        },
        correlationId: 'corr_test_conv_ops_cancel_001_preview',
        idempotencyKey: 'idem_test_conv_ops_cancel_001_preview'
      })
    );

    assert.equal(preview.status, 'executed');
    const selectionSnapshot = preview.result?.data?.selectionSnapshot;
    assert.ok(typeof selectionSnapshot === 'string' && selectionSnapshot.length > 12);
    const serviceWithSnapshot = createConversationService({
      synthesizer: DETERMINISTIC_SYNTHESIZER,
      llmProvider: {
        async plan() {
          return {
            provider: 'langchain',
            confidence: 1,
            outputText: 'Texto generico do provider',
            toolCall: {
              name: 'orchestrate_manifest_operation',
              arguments: {
                intent: 'manifest.cancel_recent_excluding_first',
                selectionSnapshot,
                reason: 'cancelamento aprovado em teste'
              },
              confirmed: true
            }
          };
        }
      }
    });

    const result = await serviceWithSnapshot.processTurn(
      buildTurnInput({
        body: {
          channel: 'inapp',
          message: { text: 'confirmar cancelamento do conjunto congelado' },
          context: {
            integrationAccountId: ACCOUNT_ID,
            requestedBy: 'qa_tester'
          },
          options: {
            allowActions: true
          },
          conversationSessionId: 'csn_test_conv_ops_cancel_001'
        },
        correlationId: 'corr_test_conv_ops_cancel_001',
        idempotencyKey: 'idem_test_conv_ops_cancel_001'
      })
    );

    assert.equal(result.status, 'executed');
    assert.equal(result.policy.allowed, true);
    assert.equal(result.policy.reasonCode, null);
    assert.equal(result.toolCall?.name, 'orchestrate_manifest_operation');

    const affectedItems = result.result?.data?.affectedItems;
    const execution = result.result?.data?.execution;

    assert.ok(Array.isArray(affectedItems));
    assert.equal(affectedItems.length, 3);
    assert.ok(Array.isArray(execution));
    assert.equal(execution.length, 3);

    const affectedIds = affectedItems.map((item) => item.manifestId);
    assert.deepEqual(affectedIds, ['man_test_conv_ops_004', 'man_test_conv_ops_003', 'man_test_conv_ops_002']);
    assert.ok(execution.every((item) => typeof item.jobId === 'string' && item.jobId.length > 0));

    const trailRows = await query(
      `select phase, execution_status, snapshot_token, intent
         from conversation_deterministic_trails
        where conversation_session_id = $1
        order by created_at asc`,
      ['csn_test_conv_ops_cancel_001']
    );

    assert.ok(trailRows.rows.some((row) => row.phase === 'snapshot' && row.snapshot_token));
    assert.ok(trailRows.rows.some((row) => row.phase === 'plan' && row.intent === 'manifest.cancel_recent_excluding_first'));
    assert.ok(trailRows.rows.some((row) => row.phase === 'result' && row.execution_status !== 'failed'));

  });

  it('identifica terceiro manifesto mais recente em resposta coesiva sem labels internos', async () => {
    await insertManifestWithDate('man_test_conv_ops_r001', '2026-04-10');
    await insertManifestWithDate('man_test_conv_ops_r002', '2026-04-11');
    await insertManifestWithDate('man_test_conv_ops_r003', '2026-04-12');
    await insertManifestWithDate('man_test_conv_ops_r004', '2026-04-13');
    await insertManifestWithDate('man_test_conv_ops_r005', '2026-04-14');

    const service = createConversationService({
      synthesizer: DETERMINISTIC_SYNTHESIZER,
      llmProvider: {
        async plan() {
          return {
            provider: 'langchain',
            confidence: 1,
            outputText: 'Texto generico do provider',
            toolCall: {
              name: 'orchestrate_manifest_operation',
              arguments: {
                intent: 'manifest.list_recent_top',
                selection: {
                  top: 1,
                  skipMostRecent: 2
                }
              },
              confirmed: true
            }
          };
        }
      }
    });

    const result = await service.processTurn(
      buildTurnInput({
        body: {
          channel: 'inapp',
          message: { text: 'qual o meu terceiro manifesto mais recente?' },
          context: {
            integrationAccountId: ACCOUNT_ID,
            requestedBy: 'qa_tester'
          },
          options: {
            allowActions: true
          },
          conversationSessionId: 'csn_test_conv_ops_top3_001'
        },
        correlationId: 'corr_test_conv_ops_top3_001',
        idempotencyKey: 'idem_test_conv_ops_top3_001'
      })
    );

    assert.equal(result.status, 'executed');
    assert.equal(result.policy.allowed, true);
    assert.equal(result.toolCall?.name, 'orchestrate_manifest_operation');

    // O 3º mais recente entre r005(14), r004(13), r003(12), r002(11), r001(10)
    // skipMostRecent=2 descarta r005 e r004, top=1 retorna r003
    assert.match(result.responseText, /man_test_conv_ops_r003/i);

    // Nenhum label interno deve aparecer na resposta sintetizada
    assert.doesNotMatch(result.responseText, /manifest\.list_recent_top/i);
    assert.doesNotMatch(result.responseText, /Criterio aplicado:/i);
    assert.doesNotMatch(result.responseText, /Itens afetados:/i);
    assert.doesNotMatch(result.responseText, /sourceManifestId=/i);
    assert.doesNotMatch(result.responseText, /motorista=/i);
    assert.doesNotMatch(result.responseText, /placa=/i);

    const affectedItems = result.result?.data?.affectedItems;
    assert.ok(Array.isArray(affectedItems));
    assert.equal(affectedItems.length, 1);
    assert.equal(affectedItems[0].manifestId, 'man_test_conv_ops_r003');
  });

  it('retorna top 5 manifestos mais recentes com datas reais e status', async () => {
    await insertManifestWithDate('man_test_conv_ops_t5_001', '2026-04-10');
    await insertManifestWithDate('man_test_conv_ops_t5_002', '2026-04-11');
    await insertManifestWithDate('man_test_conv_ops_t5_003', '2026-04-12');
    await insertManifestWithDate('man_test_conv_ops_t5_004', '2026-04-13');
    await insertManifestWithDate('man_test_conv_ops_t5_005', '2026-04-14');

    const service = createConversationService({
      synthesizer: DETERMINISTIC_SYNTHESIZER,
      llmProvider: {
        async plan() {
          return {
            provider: 'langchain',
            confidence: 1,
            outputText: 'Top 5 mais recentes com datas e status.',
            toolCall: {
              name: 'orchestrate_manifest_operation',
              arguments: {
                intent: 'manifest.list_recent_top',
                selection: {
                  top: 5,
                  skipMostRecent: 0
                }
              },
              confirmed: true
            }
          };
        }
      }
    });

    const result = await service.processTurn(
      buildTurnInput({
        body: {
          channel: 'inapp',
          message: { text: 'me retorne os 5 manifestos mais recentes com as datas' },
          context: {
            integrationAccountId: ACCOUNT_ID,
            requestedBy: 'qa_tester'
          },
          options: {
            allowActions: true
          },
          conversationSessionId: 'csn_test_conv_ops_top5_001'
        },
        correlationId: 'corr_test_conv_ops_top5_001',
        idempotencyKey: 'idem_test_conv_ops_top5_001'
      })
    );

    assert.equal(result.status, 'executed');
    assert.equal(result.toolCall?.name, 'orchestrate_manifest_operation');
    assert.match(result.responseText, /data/i);
    assert.match(result.responseText, /status/i);
    assert.doesNotMatch(result.responseText, /nao\s+(?:possuo|tenho).+datas?/i);
    assert.doesNotMatch(result.responseText, /indisponibil.+datas?/i);

    const affectedItems = result.result?.data?.affectedItems;
    assert.ok(Array.isArray(affectedItems));
    assert.equal(affectedItems.length, 5);
    assert.ok(affectedItems.every((item) => typeof item.expeditionDate === 'string' && item.expeditionDate.length > 0));
    assert.ok(affectedItems.every((item) => typeof item.status === 'string' && item.status.length > 0));
  });

  it('aplica intervalo 17-20 abril 2026 para variacoes equivalentes de linguagem natural', async () => {
    await insertManifestWithDate('man_test_conv_ops_rng_001', '2026-04-16');
    await insertManifestWithDate('man_test_conv_ops_rng_002', '2026-04-17');
    await insertManifestWithDate('man_test_conv_ops_rng_003', '2026-04-18');
    await insertManifestWithDate('man_test_conv_ops_rng_004', '2026-04-19');
    await insertManifestWithDate('man_test_conv_ops_rng_005', '2026-04-20');
    await insertManifestWithDate('man_test_conv_ops_rng_006', '2026-04-21');

    const prompts = [
      'me retorne os manifestos entre o dia 17 e o dia 20 de abril de 2026',
      'do dia 17/04/2026 ao dia 20/04/2026',
      'de 17 de abril de 2026 ate 20 de abril de 2026'
    ];

    let turn = 0;
    const service = createConversationService({
      synthesizer: DETERMINISTIC_SYNTHESIZER,
      llmProvider: {
        async plan() {
          turn += 1;
          return {
            provider: 'langchain',
            confidence: 1,
            outputText: 'Consulta por intervalo temporal.',
            toolCall: {
              name: 'orchestrate_manifest_operation',
              arguments: {
                intent: 'manifest.list_recent_top',
                selection: {
                  top: 10,
                  dateFrom: '2026-04-17',
                  dateTo: '2026-04-20'
                }
              },
              confirmed: true
            }
          };
        }
      }
    });

    for (let index = 0; index < prompts.length; index += 1) {
      const result = await service.processTurn(
        buildTurnInput({
          body: {
            channel: 'inapp',
            message: { text: prompts[index] },
            context: {
              integrationAccountId: ACCOUNT_ID,
              requestedBy: 'qa_tester'
            },
            options: {
              allowActions: true
            },
            conversationSessionId: `csn_test_conv_ops_rng_var_00${index + 1}`
          },
          correlationId: `corr_test_conv_ops_rng_var_00${index + 1}`,
          idempotencyKey: `idem_test_conv_ops_rng_var_00${index + 1}`
        })
      );

      assert.equal(result.status, 'executed');
      assert.equal(result.toolCall?.name, 'orchestrate_manifest_operation');
      assert.equal(result.result?.data?.criteria?.dateFrom, '2026-04-17');
      assert.equal(result.result?.data?.criteria?.dateTo, '2026-04-20');
      assert.equal(result.result?.data?.criteria?.totalInRange, 4);

      const affectedItems = result.result?.data?.affectedItems;
      assert.ok(Array.isArray(affectedItems));
      assert.equal(affectedItems.length, 4);
      assert.deepEqual(
        affectedItems.map((item) => item.manifestId),
        [
          'man_test_conv_ops_rng_005',
          'man_test_conv_ops_rng_004',
          'man_test_conv_ops_rng_003',
          'man_test_conv_ops_rng_002'
        ]
      );
      assert.match(result.responseText, /Considerei 4 manifesto\(s\) no periodo de 2026-04-17 ate 2026-04-20\./i);
    }

    assert.equal(turn, 3);
  });

  it('combina intervalo temporal com orderBy mais antigos e mais recentes', async () => {
    await insertManifestWithDate('man_test_conv_ops_ord_001', '2026-04-16');
    await insertManifestWithDate('man_test_conv_ops_ord_002', '2026-04-17');
    await insertManifestWithDate('man_test_conv_ops_ord_003', '2026-04-18');
    await insertManifestWithDate('man_test_conv_ops_ord_004', '2026-04-19');
    await insertManifestWithDate('man_test_conv_ops_ord_005', '2026-04-20');
    await insertManifestWithDate('man_test_conv_ops_ord_006', '2026-04-21');

    const service = createConversationService({
      synthesizer: DETERMINISTIC_SYNTHESIZER,
      llmProvider: {
        async plan(input) {
          if (/mais antigos/i.test(input.messageText)) {
            return {
              provider: 'langchain',
              confidence: 1,
              outputText: 'Consulta por intervalo - mais antigos.',
              toolCall: {
                name: 'orchestrate_manifest_operation',
                arguments: {
                  intent: 'manifest.list_recent_top',
                  selection: {
                    top: 2,
                    orderBy: 'recency_asc',
                    dateFrom: '2026-04-17',
                    dateTo: '2026-04-20'
                  }
                },
                confirmed: true
              }
            };
          }

          return {
            provider: 'langchain',
            confidence: 1,
            outputText: 'Consulta por intervalo - mais recentes.',
            toolCall: {
              name: 'orchestrate_manifest_operation',
              arguments: {
                intent: 'manifest.list_recent_top',
                selection: {
                  top: 2,
                  orderBy: 'recency_desc',
                  dateFrom: '2026-04-17',
                  dateTo: '2026-04-20'
                }
              },
              confirmed: true
            }
          };
        }
      }
    });

    const oldest = await service.processTurn(
      buildTurnInput({
        body: {
          channel: 'inapp',
          message: { text: 'me retorne os 2 mais antigos entre 17/04/2026 e 20/04/2026' },
          context: {
            integrationAccountId: ACCOUNT_ID,
            requestedBy: 'qa_tester'
          },
          options: { allowActions: true },
          conversationSessionId: 'csn_test_conv_ops_order_mix_001'
        },
        correlationId: 'corr_test_conv_ops_order_mix_001',
        idempotencyKey: 'idem_test_conv_ops_order_mix_001'
      })
    );

    assert.equal(oldest.status, 'executed');
    assert.deepEqual(
      oldest.result?.data?.affectedItems?.map((item) => item.manifestId),
      ['man_test_conv_ops_ord_002', 'man_test_conv_ops_ord_003']
    );
    assert.match(oldest.responseText, /Os 2 manifestos mais antigos sao:/i);

    const newest = await service.processTurn(
      buildTurnInput({
        body: {
          channel: 'inapp',
          message: { text: 'agora me retorne os 2 mais recentes no mesmo periodo' },
          context: {
            integrationAccountId: ACCOUNT_ID,
            requestedBy: 'qa_tester'
          },
          options: { allowActions: true },
          conversationSessionId: 'csn_test_conv_ops_order_mix_002'
        },
        correlationId: 'corr_test_conv_ops_order_mix_002',
        idempotencyKey: 'idem_test_conv_ops_order_mix_002'
      })
    );

    assert.equal(newest.status, 'executed');
    assert.deepEqual(
      newest.result?.data?.affectedItems?.map((item) => item.manifestId),
      ['man_test_conv_ops_ord_005', 'man_test_conv_ops_ord_004']
    );
    assert.match(newest.responseText, /Os 2 manifestos mais recentes sao:/i);
    assert.match(newest.responseText, /no periodo de 2026-04-17 ate 2026-04-20/i);
  });

  it('falha de forma acionavel em follow-up com periodo invertido sem autocorrecao silenciosa', async () => {
    await insertManifestWithDate('man_test_conv_ops_inv_001', '2026-04-17');
    await insertManifestWithDate('man_test_conv_ops_inv_002', '2026-04-18');
    await insertManifestWithDate('man_test_conv_ops_inv_003', '2026-04-19');

    let turn = 0;
    const service = createConversationService({
      synthesizer: DETERMINISTIC_SYNTHESIZER,
      llmProvider: {
        async plan() {
          turn += 1;

          if (turn === 1) {
            return {
              provider: 'langchain',
              confidence: 1,
              outputText: 'Consulta inicial para follow-up.',
              toolCall: {
                name: 'orchestrate_manifest_operation',
                arguments: {
                  intent: 'manifest.list_recent_top',
                  selection: {
                    top: 3,
                    orderBy: 'recency_desc',
                    dateFrom: '2026-04-17',
                    dateTo: '2026-04-19'
                  }
                },
                confirmed: true
              }
            };
          }

          return {
            provider: 'langchain',
            confidence: 1,
            outputText: 'Follow-up com periodo invertido.',
            toolCall: {
              name: 'orchestrate_manifest_operation',
              arguments: {
                intent: 'manifest.list_recent_top',
                selection: {
                  top: 3,
                  orderBy: 'recency_desc',
                  dateFrom: '2026-04-20',
                  dateTo: '2026-04-17'
                }
              },
              confirmed: true
            }
          };
        }
      }
    });

    const sessionId = 'csn_test_conv_ops_inverted_followup_001';

    const firstTurn = await service.processTurn(
      buildTurnInput({
        body: {
          channel: 'inapp',
          message: { text: 'me retorne os manifestos entre 17/04/2026 e 19/04/2026' },
          context: {
            integrationAccountId: ACCOUNT_ID,
            requestedBy: 'qa_tester'
          },
          options: { allowActions: true },
          conversationSessionId: sessionId
        },
        correlationId: 'corr_test_conv_ops_inverted_followup_001_t1',
        idempotencyKey: 'idem_test_conv_ops_inverted_followup_001_t1'
      })
    );

    assert.equal(firstTurn.status, 'executed');
    assert.equal(firstTurn.result?.data?.affectedItems?.length, 3);

    const secondTurn = await service.processTurn(
      buildTurnInput({
        body: {
          channel: 'inapp',
          message: { text: 'agora use de 20/04/2026 ate 17/04/2026 no mesmo filtro' },
          context: {
            integrationAccountId: ACCOUNT_ID,
            requestedBy: 'qa_tester'
          },
          options: { allowActions: true },
          conversationSessionId: sessionId
        },
        correlationId: 'corr_test_conv_ops_inverted_followup_001_t2',
        idempotencyKey: 'idem_test_conv_ops_inverted_followup_001_t2'
      })
    );

    assert.equal(secondTurn.status, 'failed');
    assert.match(secondTurn.responseText, /Periodo invalido/i);
    assert.match(secondTurn.responseText, /Ajuste o intervalo e tente novamente/i);
    assert.equal(secondTurn.result?.data?.reasonCode, 'CONVERSATION_INVALID_DATE_RANGE');
    assert.equal(secondTurn.toolCall?.name, 'orchestrate_manifest_operation');
  });

  it('mantem regressao correta para consulta sem filtro temporal', async () => {
    await insertManifestWithDate('man_test_conv_ops_reg_001', '2026-04-10');
    await insertManifestWithDate('man_test_conv_ops_reg_002', '2026-04-11');
    await insertManifestWithDate('man_test_conv_ops_reg_003', '2026-04-12');

    const service = createConversationService({
      synthesizer: DETERMINISTIC_SYNTHESIZER,
      llmProvider: {
        async plan() {
          return {
            provider: 'langchain',
            confidence: 1,
            outputText: 'Consulta sem intervalo temporal.',
            toolCall: {
              name: 'orchestrate_manifest_operation',
              arguments: {
                intent: 'manifest.list_recent_top',
                selection: {
                  top: 2,
                  orderBy: 'recency_desc'
                }
              },
              confirmed: true
            }
          };
        }
      }
    });

    const result = await service.processTurn(
      buildTurnInput({
        body: {
          channel: 'inapp',
          message: { text: 'quais sao os 2 manifestos mais recentes?' },
          context: {
            integrationAccountId: ACCOUNT_ID,
            requestedBy: 'qa_tester'
          },
          options: { allowActions: true },
          conversationSessionId: 'csn_test_conv_ops_regression_no_range_001'
        },
        correlationId: 'corr_test_conv_ops_regression_no_range_001',
        idempotencyKey: 'idem_test_conv_ops_regression_no_range_001'
      })
    );

    assert.equal(result.status, 'executed');
    assert.equal(result.result?.data?.criteria?.dateFrom, null);
    assert.equal(result.result?.data?.criteria?.dateTo, null);
    assert.equal(result.result?.data?.criteria?.totalInRange, 3);
    assert.deepEqual(
      result.result?.data?.affectedItems?.map((item) => item.manifestId),
      ['man_test_conv_ops_reg_003', 'man_test_conv_ops_reg_002']
    );
    assert.doesNotMatch(result.responseText, /no periodo de/i);
  });

  it('entra em fallback consultivo minimo quando provider fica indisponivel apos o primeiro turno', async () => {
    await insertManifestWithDate('man_test_conv_ops_md_001', '2026-04-10', {
      status: 'submitted',
      externalStatus: 'registered',
      externalHashCode: 'cdf-hash-001',
      generator: 'Gerador A',
      carrier: 'Transportador A',
      receiver: 'Destinador A',
      driverName: 'Motorista A',
      vehiclePlate: 'AAA1A11'
    });
    await insertManifestWithDate('man_test_conv_ops_md_002', '2026-04-11', {
      status: 'processing',
      externalStatus: 'in_queue',
      externalHashCode: 'cdf-hash-002',
      generator: 'Gerador B',
      carrier: 'Transportador B',
      receiver: 'Destinador B',
      driverName: 'Motorista B',
      vehiclePlate: 'BBB2B22'
    });
    await insertManifestWithDate('man_test_conv_ops_md_003', '2026-04-12', {
      status: 'validated',
      externalStatus: 'synced',
      externalHashCode: 'cdf-hash-003'
    });

    let planCalls = 0;
    const service = createConversationService({
      synthesizer: DETERMINISTIC_SYNTHESIZER,
      llmProvider: {
        async plan() {
          planCalls += 1;
          if (planCalls === 1) {
            return {
              provider: 'langchain',
              confidence: 1,
              outputText: 'Consulta inicial dos manifestos recentes.',
              toolCall: {
                name: 'orchestrate_manifest_operation',
                arguments: {
                  intent: 'manifest.list_recent_top',
                  selection: {
                    top: 2,
                    skipMostRecent: 0
                  }
                },
                confirmed: true
              }
            };
          }

          throw new Error('provider offline');
        }
      }
    });

    const sessionId = 'csn_test_conv_ops_more_data_001';

    const firstTurn = await service.processTurn(
      buildTurnInput({
        body: {
          channel: 'inapp',
          message: { text: 'me retorne os 2 manifestos mais recentes com as datas' },
          context: {
            integrationAccountId: ACCOUNT_ID,
            requestedBy: 'qa_tester'
          },
          options: {
            allowActions: true
          },
          conversationSessionId: sessionId
        },
        correlationId: 'corr_test_conv_ops_more_data_001_t1',
        idempotencyKey: 'idem_test_conv_ops_more_data_001_t1'
      })
    );

    assert.equal(firstTurn.status, 'executed');

    const secondTurn = await service.processTurn(
      buildTurnInput({
        body: {
          channel: 'inapp',
          message: { text: 'quais sao os geradores deles' },
          context: {
            integrationAccountId: ACCOUNT_ID,
            requestedBy: 'qa_tester'
          },
          options: {
            allowActions: true
          },
          conversationSessionId: sessionId
        },
        correlationId: 'corr_test_conv_ops_more_data_001_t2',
        idempotencyKey: 'idem_test_conv_ops_more_data_001_t2'
      })
    );

    assert.equal(secondTurn.status, 'failed');
    assert.equal(secondTurn.llm.provider, 'provider-unavailable');
    assert.equal(secondTurn.toolCall, null);
    assert.match(secondTurn.responseText, /PROVIDER_UNAVAILABLE/i);
    assert.equal(secondTurn.result?.reasonCode, 'PROVIDER_UNAVAILABLE');

    const thirdTurn = await service.processTurn(
      buildTurnInput({
        body: {
          channel: 'inapp',
          message: { text: 'oi' },
          context: {
            integrationAccountId: ACCOUNT_ID,
            requestedBy: 'qa_tester'
          },
          options: {
            allowActions: true
          },
          conversationSessionId: sessionId
        },
        correlationId: 'corr_test_conv_ops_more_data_001_t3',
        idempotencyKey: 'idem_test_conv_ops_more_data_001_t3'
      })
    );

    assert.equal(thirdTurn.status, 'failed');
    assert.equal(thirdTurn.llm.provider, 'provider-unavailable');
    assert.equal(thirdTurn.toolCall, null);
    assert.match(thirdTurn.responseText, /PROVIDER_UNAVAILABLE/i);
    assert.equal(thirdTurn.result?.reasonCode, 'PROVIDER_UNAVAILABLE');
  });

  it('executa replicacao com patch e preserva contrato base de resposta', async () => {
    await insertManifestWithDate('man_test_conv_ops_src_001', '2026-04-15');

    const service = createConversationService({
      synthesizer: DETERMINISTIC_SYNTHESIZER,
      llmProvider: {
        async plan() {
          return {
            provider: 'langchain',
            confidence: 1,
            outputText: 'Texto generico do provider',
            toolCall: {
              name: 'orchestrate_manifest_operation',
              arguments: {
                intent: 'manifest.replicate_with_patch',
                sourceManifestId: 'man_test_conv_ops_src_001',
                overrides: {
                  driverName: 'Joao Silva',
                  vehiclePlate: 'abc1d23'
                }
              },
              confirmed: true
            }
          };
        }
      }
    });

    const result = await service.processTurn(
      buildTurnInput({
        body: {
          channel: 'inapp',
          message: { text: 'replicar manifesto man_test_conv_ops_src_001 alterando nome do caminhoneiro e placa' },
          context: {
            integrationAccountId: ACCOUNT_ID,
            requestedBy: 'qa_tester'
          },
          options: {
            allowActions: true
          },
          conversationSessionId: 'csn_test_conv_ops_repl_001'
        },
        correlationId: 'corr_test_conv_ops_repl_001',
        idempotencyKey: 'idem_test_conv_ops_repl_001'
      })
    );

    assert.equal(result.status, 'executed');
    assert.equal(result.policy.allowed, true);
    assert.equal(result.toolCall?.name, 'orchestrate_manifest_operation');
    // O texto natural pode variar por síntese; validar somente presença e tipo.
    assert.equal(typeof result.responseText, 'string');
    assert.ok(result.responseText.trim().length > 0);

    const actionData = result.result?.data;
    const segments = actionData?.segments;
    assert.ok(Array.isArray(segments));
    assert.equal(segments.length, 1);
    assert.equal(segments[0]?.sourceManifestId, 'man_test_conv_ops_src_001');
    assert.equal(segments[0]?.overrides?.driverName, 'Joao Silva');
    assert.equal(segments[0]?.overrides?.vehiclePlate, 'ABC1D23');

    const execution = actionData?.execution;
    assert.ok(Array.isArray(execution));
    assert.equal(execution.length, 1);

    const replicatedManifest = await query(
      "SELECT payload->>'driverName' AS driver_name, payload->>'vehiclePlate' AS vehicle_plate FROM manifests WHERE payload->>'driverName' = $1 AND payload->>'vehiclePlate' = $2 ORDER BY created_at DESC LIMIT 1",
      ['Joao Silva', 'ABC1D23']
    );

    assert.equal(replicatedManifest.rowCount, 1);
    assert.equal(replicatedManifest.rows[0].driver_name, 'Joao Silva');
    assert.equal(replicatedManifest.rows[0].vehicle_plate, 'ABC1D23');

    assert.ok(result.conversationSessionId);
    assert.ok(result.conversationTurnId);
    assert.ok(result.correlationId);
    assert.ok(result.channel);
    assert.ok(result.llm);
    assert.ok(result.policy);
    assert.ok(result.context);
    assert.ok(Object.hasOwn(result, 'responseText'));
    assert.ok(Object.hasOwn(result, 'toolCall'));
  });

  it('recupera top 4 e no turno seguinte responde origem dos mesmos manifestos', async () => {
    await insertManifestWithDate('man_test_conv_ops_org_001', '2026-04-10', { generator: 'Gerador Origem A' });
    await insertManifestWithDate('man_test_conv_ops_org_002', '2026-04-11', { generator: 'Gerador Origem B' });
    await insertManifestWithDate('man_test_conv_ops_org_003', '2026-04-12', { generator: 'Gerador Origem C' });
    await insertManifestWithDate('man_test_conv_ops_org_004', '2026-04-13', { generator: 'Gerador Origem D' });
    await insertManifestWithDate('man_test_conv_ops_org_005', '2026-04-14', { generator: 'Gerador Origem E' });

    let turn = 0;
    const service = createConversationService({
      synthesizer: DETERMINISTIC_SYNTHESIZER,
      llmProvider: {
        async plan(input) {
          turn += 1;
          if (turn === 1) {
            return {
              provider: 'layered-llm',
              confidence: 0.95,
              outputText: 'Vou listar os 4 mais recentes.',
              toolCall: {
                name: 'orchestrate_manifest_operation',
                arguments: {
                  intent: 'manifest.list_recent_top',
                  selection: { top: 4, skipMostRecent: 0 }
                }
              }
            };
          }

          assert.ok(Array.isArray(input.context.lastManifestSelectionIds));
          assert.equal(input.context.lastManifestSelectionIds.length, 4);

          return {
            provider: 'layered-llm',
            confidence: 0.95,
            outputText: 'Vou detalhar a origem dos manifestos anteriores.',
            toolCall: {
              name: 'orchestrate_manifest_operation',
              arguments: {
                intent: 'manifest.detail_selected_set',
                manifestIds: input.context.lastManifestSelectionIds
              }
            }
          };
        }
      }
    });

    const sessionId = 'csn_test_conv_ops_origin_001';

    const firstTurn = await service.processTurn(
      buildTurnInput({
        body: {
          channel: 'inapp',
          message: { text: 'quais sao os ultimos 4 manifestos?' },
          context: {
            integrationAccountId: ACCOUNT_ID,
            requestedBy: 'qa_tester'
          },
          options: { allowActions: true },
          conversationSessionId: sessionId
        },
        correlationId: 'corr_test_conv_ops_origin_001_t1',
        idempotencyKey: 'idem_test_conv_ops_origin_001_t1'
      })
    );

    assert.equal(firstTurn.status, 'executed');
    assert.equal(firstTurn.result?.data?.affectedItems?.length, 4);

    const secondTurn = await service.processTurn(
      buildTurnInput({
        body: {
          channel: 'inapp',
          message: { text: 'esses manifestos sao de qual origem?' },
          context: {
            integrationAccountId: ACCOUNT_ID,
            requestedBy: 'qa_tester'
          },
          options: { allowActions: true },
          conversationSessionId: sessionId
        },
        correlationId: 'corr_test_conv_ops_origin_001_t2',
        idempotencyKey: 'idem_test_conv_ops_origin_001_t2'
      })
    );

    assert.equal(secondTurn.status, 'executed');
    assert.match(secondTurn.responseText, /gerador/i);
    assert.equal(secondTurn.result?.data?.manifests?.length, 4);
  });

  it('recupera do contexto os manifestos perguntados na sessao', async () => {
    await insertManifestWithDate('man_test_conv_ops_hist_001', '2026-04-10', {
      manifestNumber: '260011455990',
      generator: 'Gerador Historico'
    });

    let turn = 0;
    const service = createConversationService({
      synthesizer: DETERMINISTIC_SYNTHESIZER,
      llmProvider: {
        async plan(input) {
          turn += 1;
          if (turn === 1) {
            return {
              provider: 'layered-llm',
              confidence: 0.95,
              outputText: 'Vou consultar o gerador do manifesto solicitado.',
              toolCall: {
                name: 'orchestrate_manifest_operation',
                arguments: {
                  intent: 'manifest.lookup_generator_by_number',
                  manifestNumber: '260011455990'
                }
              }
            };
          }

          assert.ok(Array.isArray(input.context.askedManifestIds));
          assert.ok(input.context.askedManifestIds.includes('260011455990'));

          return {
            provider: 'layered-llm',
            confidence: 0.95,
            outputText: 'Vou listar os manifestos consultados nesta sessao.',
            toolCall: {
              name: 'orchestrate_manifest_operation',
              arguments: {
                intent: 'memory.list_asked_manifests',
                manifestIds: input.context.askedManifestIds
              }
            }
          };
        }
      }
    });

    const sessionId = 'csn_test_conv_ops_history_001';

    const firstTurn = await service.processTurn(
      buildTurnInput({
        body: {
          channel: 'inapp',
          message: { text: 'quem e o gerador do manifesto 260011455990?' },
          context: {
            integrationAccountId: ACCOUNT_ID,
            requestedBy: 'qa_tester'
          },
          options: { allowActions: true },
          conversationSessionId: sessionId
        },
        correlationId: 'corr_test_conv_ops_history_001_t1',
        idempotencyKey: 'idem_test_conv_ops_history_001_t1'
      })
    );

    assert.equal(firstTurn.status, 'executed');

    const secondTurn = await service.processTurn(
      buildTurnInput({
        body: {
          channel: 'inapp',
          message: { text: 'e quais manifestos eu perguntei pra vc?' },
          context: {
            integrationAccountId: ACCOUNT_ID,
            requestedBy: 'qa_tester'
          },
          options: { allowActions: true },
          conversationSessionId: sessionId
        },
        correlationId: 'corr_test_conv_ops_history_001_t2',
        idempotencyKey: 'idem_test_conv_ops_history_001_t2'
      })
    );

    assert.equal(secondTurn.status, 'executed');
    assert.match(secondTurn.responseText, /260011455990/i);
    assert.equal(secondTurn.result?.data?.manifestIds?.includes('260011455990'), true);
  });

  it('lookup direto retorna gerador correto por numero de manifesto', async () => {
    await insertManifestWithDate('man_test_conv_ops_lookup_001', '2026-04-16', {
      manifestNumber: '260011455990',
      generator: 'Gerador Correto Lookup',
      carrier: 'Transportador Lookup',
      receiver: 'Destinador Lookup'
    });

    const service = createConversationService({
      synthesizer: DETERMINISTIC_SYNTHESIZER,
      llmProvider: {
        async plan() {
          return {
            provider: 'layered-llm',
            confidence: 0.95,
            outputText: 'Consultando gerador por numero.',
            toolCall: {
              name: 'orchestrate_manifest_operation',
              arguments: {
                intent: 'manifest.lookup_generator_by_number',
                manifestNumber: '260011455990'
              }
            }
          };
        }
      }
    });

    const result = await service.processTurn(
      buildTurnInput({
        body: {
          channel: 'inapp',
          message: { text: 'quem e o gerador do manifesto 260011455990?' },
          context: {
            integrationAccountId: ACCOUNT_ID,
            requestedBy: 'qa_tester'
          },
          options: { allowActions: true },
          conversationSessionId: 'csn_test_conv_ops_lookup_001'
        },
        correlationId: 'corr_test_conv_ops_lookup_001',
        idempotencyKey: 'idem_test_conv_ops_lookup_001'
      })
    );

    assert.equal(result.status, 'executed');
    assert.match(result.responseText, /gerador\s+correto\s+lookup/i);
    assert.equal(result.result?.data?.found, true);
    assert.equal(result.result?.data?.manifestNumber, '260011455990');
    assert.equal(result.result?.data?.affectedItems?.[0]?.generator, 'Gerador Correto Lookup');
  });

  it('nao reaproveita memoria operacional quando mesma conversationSessionId e usada em outra conta', async () => {
    await insertManifestWithDate('man_test_conv_ops_cross_a_001', '2026-04-17', {
      integrationAccountId: ACCOUNT_ID,
      manifestNumber: '260011455990',
      generator: 'Gerador Conta A'
    });

    await insertManifestWithDate('man_test_conv_ops_cross_b_001', '2026-04-17', {
      integrationAccountId: ACCOUNT_ID_ALT,
      manifestNumber: '260011455990',
      generator: 'Gerador Conta B'
    });

    let turn = 0;
    const service = createConversationService({
      synthesizer: DETERMINISTIC_SYNTHESIZER,
      llmProvider: {
        async plan(input) {
          turn += 1;

          if (turn === 1) {
            return {
              provider: 'layered-llm',
              confidence: 0.95,
              outputText: 'Consultando manifesto na conta A.',
              toolCall: {
                name: 'orchestrate_manifest_operation',
                arguments: {
                  intent: 'manifest.lookup_generator_by_number',
                  manifestNumber: '260011455990'
                }
              }
            };
          }

          // Na conta B com a mesma session id nao pode existir memoria anterior da conta A.
          assert.deepEqual(input.history, []);
          assert.deepEqual(input.context.lastManifestSelectionIds, []);
          assert.deepEqual(input.context.askedManifestIds, []);

          return {
            provider: 'layered-llm',
            confidence: 0.95,
            outputText: 'Consultando manifesto na conta B sem memoria herdada.',
            toolCall: {
              name: 'orchestrate_manifest_operation',
              arguments: {
                intent: 'manifest.lookup_generator_by_number',
                manifestNumber: '260011455990'
              }
            }
          };
        }
      }
    });

    const sharedSessionId = 'csn_test_conv_ops_cross_account_001';

    const turnA = await service.processTurn(
      buildTurnInput({
        body: {
          channel: 'inapp',
          message: { text: 'quem e o gerador do manifesto 260011455990?' },
          context: {
            integrationAccountId: ACCOUNT_ID,
            requestedBy: 'qa_tester'
          },
          options: { allowActions: true },
          conversationSessionId: sharedSessionId
        },
        correlationId: 'corr_test_conv_ops_cross_account_a1',
        idempotencyKey: 'idem_test_conv_ops_cross_account_a1'
      })
    );

    assert.equal(turnA.status, 'executed');
    assert.match(turnA.responseText, /gerador\s+conta\s+a/i);

    const turnB = await service.processTurn(
      buildTurnInput({
        body: {
          channel: 'inapp',
          message: { text: 'quem e o gerador do manifesto 260011455990?' },
          context: {
            integrationAccountId: ACCOUNT_ID_ALT,
            requestedBy: 'qa_tester'
          },
          options: { allowActions: true },
          conversationSessionId: sharedSessionId
        },
        correlationId: 'corr_test_conv_ops_cross_account_b1',
        idempotencyKey: 'idem_test_conv_ops_cross_account_b1'
      })
    );

    assert.equal(turnB.status, 'executed');
    assert.match(turnB.responseText, /gerador\s+conta\s+b/i);
    assert.doesNotMatch(turnB.responseText, /gerador\s+conta\s+a/i);
  });
});
