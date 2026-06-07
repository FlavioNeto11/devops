import { before, beforeEach, after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { pool, query } from '../../src/db/pool.js';
import { createConversationService } from '../../src/services/conversation/conversation-service.js';

// Cenario reportado (MARDAN): na grid aparecem 3 manifestos de 29/05 (status "salvo"),
// porem o chat respondia o manifesto 260012058818 (28/05). Causa raiz: a janela de
// candidatos era ordenada por created_at (tempo de sync no espelho), nao pela data de
// negocio (expedicao). Um re-sync da CETESB reescreve created_at de manifestos antigos,
// fazendo-os "subir" e enterrando os realmente mais recentes.
const ACCOUNT_ID = 'acc_test_recency_scn_001';
const STALE_MANIFEST = '260012058818'; // 28/05 — NAO pode ser eleito o "mais recente"
const RECENT_MANIFESTS = ['260012073434', '260012073529', '260012073636']; // 29/05 (empate)

async function insertManifest({ id, number, expeditionDate, createdAt, externalStatus = 'salvo', status = 'submitted' }) {
  const payload = {
    expeditionDate,
    generator: { partnerCode: '1001', description: 'Consorcio Gerador QA' },
    carrier: { partnerCode: '2002', description: 'VR DEMOLIDORA LTDA' },
    receiver: { partnerCode: '3003', description: 'MARDAN FIRE ENGENHARIA, CONSTRUCAO E EXTINTORES LTDA.' }
  };

  await query(
    `INSERT INTO manifests(
      id, integration_account_id, session_context_id, status, external_status,
      external_reference, external_hash_code, payload, requested_by, correlation_id, created_at, last_sync_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$11)`,
    [
      id,
      ACCOUNT_ID,
      null,
      status,
      externalStatus,
      number ? { manNumero: String(number) } : null,
      // submitted exige external_hash_code (chk_manifest_submitted_integrity); espelha o real.
      `hash_${id}`,
      JSON.stringify(payload),
      'cetesb.search',
      'corr_test_recency_scn',
      createdAt
    ]
  );
}

function buildTurn(messageText, overrides = {}) {
  return {
    body: {
      channel: 'inapp',
      message: { text: messageText },
      context: { integrationAccountId: ACCOUNT_ID, requestedBy: 'qa_recency' },
      options: { allowActions: true },
      conversationSessionId: overrides.conversationSessionId || 'csn_test_recency_scn_001'
    },
    correlationId: overrides.correlationId || 'corr_test_recency_scn_t1',
    headers: {},
    idempotencyKey: overrides.idempotencyKey || 'idem_test_recency_scn_t1'
  };
}

// Planner fixo: roteia a pergunta de recencia para o intent correto. O foco do teste
// e a CAMADA DE DADOS (janela/ordenacao) + a EVIDENCIA entregue ao LLM, nao o roteamento.
const recencyPlanner = {
  async plan() {
    return {
      provider: 'layered-llm',
      confidence: 0.95,
      outputText: 'Consulta de recencia.',
      toolCall: {
        name: 'orchestrate_manifest_operation',
        arguments: {
          intent: 'manifest.list_recent_top',
          selection: { top: 1, skipMostRecent: 0, orderBy: 'recency_desc' }
        },
        confirmed: true
      }
    };
  }
};

describe('conversation recency scenario (MARDAN 29/05 vs 28/05)', () => {
  before(async () => {
    await pool.connect().then((client) => client.release());
  });

  beforeEach(async () => {
    await query('DELETE FROM conversation_action_logs WHERE conversation_session_id LIKE $1', ['csn_test_recency_scn_%']);
    await query('DELETE FROM conversation_messages WHERE conversation_session_id LIKE $1', ['csn_test_recency_scn_%']);
    await query('DELETE FROM conversation_sessions WHERE id LIKE $1', ['csn_test_recency_scn_%']);
    await query('DELETE FROM manifests WHERE integration_account_id = $1', [ACCOUNT_ID]);
    await query('DELETE FROM integration_accounts WHERE id = $1', [ACCOUNT_ID]);
    await query(
      'INSERT INTO integration_accounts(id, account_name, is_active) VALUES ($1, $2, $3)',
      [ACCOUNT_ID, 'MARDAN QA Recency', true]
    );

    // 29/05 (os realmente mais recentes) — created_at MAIS ANTIGO.
    await insertManifest({ id: 'man_scn_2905_a', number: RECENT_MANIFESTS[0], expeditionDate: '2026-05-29', createdAt: '2026-05-29T19:32:53.066Z' });
    await insertManifest({ id: 'man_scn_2905_b', number: RECENT_MANIFESTS[1], expeditionDate: '2026-05-29', createdAt: '2026-05-29T19:32:53.062Z' });
    await insertManifest({ id: 'man_scn_2905_c', number: RECENT_MANIFESTS[2], expeditionDate: '2026-05-29', createdAt: '2026-05-29T19:32:53.047Z' });

    // 28/05 — created_at POSTERIOR aos de 29/05 (re-sync). Pela logica antiga (created_at desc)
    // este apareceria em 1o lugar; pela data de negocio, deve ficar ABAIXO dos de 29/05.
    await insertManifest({ id: 'man_scn_2805', number: STALE_MANIFEST, expeditionDate: '2026-05-28', createdAt: '2026-05-29T19:47:35.416Z' });

    // Bulk re-sync de 60 manifestos antigos (21/05) com created_at AINDA MAIS NOVO:
    // pela logica antiga, encheriam a janela (pageSize) e enterrariam os de 29/05.
    for (let i = 0; i < 60; i += 1) {
      await insertManifest({
        id: `man_scn_2105_${String(i).padStart(2, '0')}`,
        number: `2600119${String(10000 + i)}`,
        expeditionDate: '2026-05-21',
        createdAt: `2026-05-29T20:02:${String(11 + (i % 40)).padStart(2, '0')}.000Z`,
        externalStatus: 'Recebido'
      });
    }
  });

  after(async () => {
    await query('DELETE FROM conversation_action_logs WHERE conversation_session_id LIKE $1', ['csn_test_recency_scn_%']);
    await query('DELETE FROM conversation_messages WHERE conversation_session_id LIKE $1', ['csn_test_recency_scn_%']);
    await query('DELETE FROM conversation_sessions WHERE id LIKE $1', ['csn_test_recency_scn_%']);
    await query('DELETE FROM manifests WHERE integration_account_id = $1', [ACCOUNT_ID]);
    await query('DELETE FROM integration_accounts WHERE id = $1', [ACCOUNT_ID]);
    await pool.end();
  });

  it('elege os manifestos de 29/05 (dados atuais) e NUNCA o 260012058818 (28/05), mesmo com created_at invertido e bulk-sync enterrando a janela', async () => {
    // Synthesizer que SIMULA o LLM decidindo sobre a EVIDENCIA (sem rede). Captura o que
    // recebeu para provarmos que recebe FATOS estruturados, nao um veredito pronto.
    let captured = { evidence: null, userMessage: null };
    const reasoningSynthesizer = async ({ userMessage, evidence }) => {
      captured = { evidence, userMessage };
      const data = JSON.parse(evidence);
      const tie = data.empateNaDataMaisRecente;
      if (tie && tie.count > 1 && Array.isArray(tie.manifests)) {
        const nums = tie.manifests.map((m) => m.manifestNumber).join(', ');
        const statusLabel = tie.manifests[0].externalStatus || tie.manifests[0].status || 'sem status';
        return `Ha ${tie.count} manifestos na data mais recente (${tie.expeditionDate}), todos com status ${statusLabel}: ${nums}.`;
      }
      const top = data.candidatos[0];
      return `O manifesto mais recente e o ${top.numero}, de ${top.dataExpedicao} (status ${top.status}).`;
    };

    const service = createConversationService({ llmProvider: recencyPlanner, synthesizer: reasoningSynthesizer });
    const result = await service.processTurn(buildTurn('qual meu manifesto mais recente'));

    // 1) Dados corretos: a selecao vem dos manifestos de 29/05, nao do 28/05.
    assert.equal(result.status, 'executed');
    const affected = result.result?.data?.affectedItems;
    assert.ok(Array.isArray(affected) && affected.length === 1);
    assert.equal(affected[0].expeditionDate, '2026-05-29');
    assert.ok(RECENT_MANIFESTS.includes(String(affected[0].manifestNumber)));
    assert.notEqual(String(affected[0].manifestNumber), STALE_MANIFEST);

    // 2) Rastreabilidade / evidencia: fonte, momento, campo de recencia e empate explicito.
    const criteria = result.result?.data?.criteria;
    assert.equal(criteria?.recencyField, 'expeditionDate');
    assert.equal(criteria?.source, 'local_mirror');
    assert.equal(criteria?.orderBy, 'recency_desc');
    assert.ok(typeof criteria?.consultedAt === 'string' && criteria.consultedAt.length > 0);
    assert.equal(criteria?.ambiguousTopExpeditionDate?.count, 3);
    assert.equal(criteria?.ambiguousTopExpeditionDate?.expeditionDate, '2026-05-29');
    const tieNumbers = criteria.ambiguousTopExpeditionDate.manifests.map((m) => String(m.manifestNumber)).sort();
    assert.deepEqual(tieNumbers, [...RECENT_MANIFESTS].sort());

    // 3) Arquitetura (#4/#7): o LLM recebe EVIDENCIA estruturada (candidatos), nao um veredito.
    assert.ok(typeof captured.evidence === 'string' && captured.evidence.length > 0);
    const evidence = JSON.parse(captured.evidence);
    assert.ok(Array.isArray(evidence.candidatos));
    assert.equal(evidence.empateNaDataMaisRecente.count, 3);
    assert.equal(evidence.campoDeRecencia, 'expeditionDate');
    // A evidencia NAO carrega a frase de veredito (a decisao e do LLM).
    assert.doesNotMatch(captured.evidence, /o manifesto mais recente e o/i);

    // 4) Resposta final coerente com os dados atuais e sem o manifesto antigo.
    assert.doesNotMatch(result.responseText, new RegExp(STALE_MANIFEST));
    assert.match(result.responseText, /2026-05-29/);
    assert.match(result.responseText, /salvo/i);
    for (const number of RECENT_MANIFESTS) {
      assert.match(result.responseText, new RegExp(number));
    }
    // Sem labels internos de orquestracao.
    assert.doesNotMatch(result.responseText, /manifest\.list_recent_top/i);
  });

  it('quando a sintese (LLM) fica indisponivel, degrada para resumo deterministico ainda CORRETO (29/05, nao 28/05)', async () => {
    const failingSynthesizer = async () => {
      throw new Error('synthesis offline');
    };
    const service = createConversationService({ llmProvider: recencyPlanner, synthesizer: failingSynthesizer });
    const result = await service.processTurn(
      buildTurn('qual meu manifesto mais recente', {
        conversationSessionId: 'csn_test_recency_scn_002',
        correlationId: 'corr_test_recency_scn_t2',
        idempotencyKey: 'idem_test_recency_scn_t2'
      })
    );

    assert.equal(result.status, 'executed');
    // Fallback deterministico: ainda baseado nos dados corretos (29/05) e status do portal.
    assert.doesNotMatch(result.responseText, new RegExp(STALE_MANIFEST));
    assert.match(result.responseText, /2026-05-29/);
    assert.match(result.responseText, /salvo/i);
    assert.equal(result.result?.data?.affectedItems?.[0]?.expeditionDate, '2026-05-29');
  });
});
