import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { config, setConfigOverride } from '../../src/lib/config.js';
import {
  coerceIdentifierText,
  coerceScalarText,
  cutAtGrapheme,
  sanitizeRenderedValue
} from '../../src/services/conversation/channel/whatsapp/whatsapp-render-blocks.js';
import {
  renderStructuredResultForWhatsApp,
  readWhatsAppRenderUnknownFamilyCounters,
  resetWhatsAppRenderCountersForTests
} from '../../src/services/conversation/channel/whatsapp/whatsapp-result-renderer.js';
import { splitIntoSegments } from '../../src/services/conversation/channel/whatsapp/whatsapp-segmenter.js';
import { composeWhatsAppReply } from '../../src/services/conversation/channel/whatsapp/whatsapp-reply-composer.js';
import { buildChannelStyleDirective } from '../../src/services/conversation/prompts/conversation-channel-style.js';
import {
  runWhatsAppInboundTurn,
  resetWhatsAppExpiredNoticeThrottleForTests,
  setWhatsAppTurnDependenciesForTests
} from '../../src/services/conversation/channel/whatsapp/whatsapp-turn-service.js';

/**
 * FASE 4 — o resultado estruturado vira TEXTO de WhatsApp.
 *
 * DISCIPLINA DE ESCRITA (a cadeia aprendeu do jeito difícil):
 *  · nenhum double reimplementa formatação nem recomputa a divisão esperada — um double que
 *    implementa em JavaScript a lógica que deveria testar CONCORDA CONSIGO MESMO e não testa nada;
 *  · cada caso foi checado contra a NEUTRALIZAÇÃO da guarda, não só contra a deleção. Onde a
 *    neutralização é interessante, ela está escrita no comentário do caso;
 *  · as fixtures vêm do PRODUTOR (`conversation-tool-dispatcher.ts`), NUNCA do Vue: cinco
 *    componentes Vue leem campos que o backend não produz (`selectedItems`, `payload`, `items`,
 *    `sourceManifest/patch`, `selectedCdfs`), e uma fixture copiada de lá testaria um contrato
 *    inexistente;
 *  · asserção por `includes()` de substring detecta deleção mas não neutralização — por isso os
 *    casos de cap CONTAM LINHAS na saída em vez de perguntar ao renderer quantas ele emitiu.
 */

const RENDER_OPTIONS = { itemCap: 8, cardCap: 3, nowMs: Date.parse('2026-08-07T12:00:00Z') };

/** `summarizeManifestReference` do dispatcher (`:610-627`) — o item canônico da família de lista. */
function manifestReference(number, overrides = {}) {
  return {
    manifestId: `mtr_${number}`,
    manifestNumber: String(number),
    expeditionDate: '2026-08-07',
    status: 'received',
    externalStatus: null,
    statusLabel: 'Recebido',
    externalHashCode: `hash_${number}`,
    generator: 'Industria Quimica Paulista Ltda',
    carrier: 'Transresiduos Log Ltda',
    receiver: 'Sansuy Ambiental S.A.',
    driverName: 'Jose Carlos de Souza',
    vehiclePlate: 'EBX-4H21',
    ...overrides
  };
}

function manifestListResult(items, overrides = {}) {
  return {
    kind: 'query',
    data: { intent: 'manifest.list_recent_top', criteria: { top: 8 }, affectedItems: items, ...overrides },
    artifacts: [],
    actions: []
  };
}

function render(result, options = {}) {
  return renderStructuredResultForWhatsApp(result, { ...RENDER_OPTIONS, ...options });
}

function renderedText(result, options = {}) {
  return render(result, options).blocks.map((block) => block.text).join('\n');
}

/** Linhas de ITEM da saída, contadas no TEXTO — não perguntadas ao renderer. */
function countItemLines(text) {
  return text.split('\n').filter((line) => /^\d+\)\s/.test(line)).length;
}

function delivered(output, ctx = {}) {
  return composeWhatsAppReply(output, ctx);
}

/* ============================================================================================== */
/* 1. TETO DURO + TRUNCAGEM HONESTA — o OOM já aconteceu neste módulo                             */
/* ============================================================================================== */

describe('cap de itens — o corte acontece ANTES da projeção e é declarado', () => {
  it('500 itens produzem EXATAMENTE 8 linhas e o par ordenado (8, 500) aparece no texto', () => {
    // NEUTRALIZAÇÃO: trocar `items.slice(0, cap)` por `items.slice()` faz este caso quebrar em DOIS
    // lugares — na contagem de linhas e na frase de escopo. Um teste com `includes('Mostro')`
    // sobreviveria à neutralização e por isso não serviria.
    const items = Array.from({ length: 500 }, (_, index) => manifestReference(9000000000 + index));
    const text = renderedText(manifestListResult(items, { totalItems: 500 }));

    assert.equal(countItemLines(text), 8, 'o cap do renderer é a ÚLTIMA barreira contra o OOM');
    assert.match(text, /Mostro os 8 mais recentes de 500 manifestos\./);
  });

  it('a contagem verdadeira vence `items.length`: 50 exibidos na amostra, 214 no total', () => {
    // É o contrato que a correção do OOM criou em `list_cdf_certificates`: a amostra é 50, o total
    // real vai em `totalItems`. Usar `items.length` aqui faria o assistente dizer "50 de 50".
    const items = Array.from({ length: 50 }, (_, index) => ({
      id: `cdf_${index}`,
      certificateCode: `2026-000${400 + index}`,
      issuedAt: '2026-07-31',
      receiver: { partnerCode: 'P1', description: 'Sansuy Ambiental' },
      downloadUrl: '/v1/conversations/artifacts/abc/content'
    }));
    const text = renderedText({
      type: 'cdf_list',
      data: { items, totalItems: 214, returnedItems: 50, truncated: true },
      artifacts: [],
      actions: []
    });

    assert.match(text, /Mostro os 8 mais recentes de 214 certificados\./);
    assert.ok(!text.includes('de 50'), 'a amostra do produtor não pode virar o total');
  });

  it('sem total confiável a frase MUDA (nunca o número): "pode haver mais"', () => {
    // Bater exatamente num cap conhecido do produtor sem `totalItems` válido não autoriza sugerir
    // completude. NEUTRALIZAÇÃO: emitir "Mostro os 8 mais recentes de 50" quebra aqui.
    const items = Array.from({ length: 50 }, (_, index) => manifestReference(8800000000 + index));
    const text = renderedText(manifestListResult(items, { totalItems: null }));

    assert.match(text, /pode haver mais manifestos além destes/);
    assert.ok(!/de 50 manifestos/.test(text));
  });

  it('nada omitido, nada de escopo — a honestidade não inventa corte que não houve', () => {
    // CONTROLE NEGATIVO do caso acima: prova que a asserção anterior consegue falhar.
    const text = renderedText(manifestListResult([manifestReference(1), manifestReference(2)], { totalItems: 2 }));

    assert.equal(countItemLines(text), 2);
    assert.ok(!/Mostro os/.test(text), 'com 2 de 2 não existe o que declarar');
  });

  it('`totalItems` adversarial NÃO vira texto: "9e99", -1 e NaN caem para a contagem real', () => {
    // Sem esta validação o assistente afirmaria que o operador tem novecentos quintilhões de MTRs.
    const items = Array.from({ length: 12 }, (_, index) => manifestReference(7000000000 + index));

    for (const hostile of ['9e99', -1, Number.NaN, 1e308, 10_000_001]) {
      const text = renderedText(manifestListResult(items, { totalItems: hostile }));
      assert.match(text, /Mostro os 8 mais recentes de 12 manifestos\./, `total hostil aceito: ${hostile}`);
      assert.ok(!text.includes('9e99'));
      assert.ok(!text.includes('-1'));
      assert.ok(!text.includes('NaN'));
    }
  });

  it('total VÁLIDO maior que o exibido é usado tal e qual (5 de 37)', () => {
    const items = Array.from({ length: 5 }, (_, index) => manifestReference(6000000000 + index));
    const text = renderedText(manifestListResult(items, { totalItems: 37 }), { itemCap: 5 });

    assert.equal(countItemLines(text), 5);
    assert.match(text, /Mostro os 5 mais recentes de 37 manifestos\./);
  });
});

/* ============================================================================================== */
/* 2. ALLOWLIST DE CAMPOS — falha FECHADA, inclusive para campo que ninguém previu                */
/* ============================================================================================== */

describe('allowlist de campos — o que não está em lista nenhuma não sai', () => {
  it('nenhuma sentinela de campo interno chega ao texto, INCLUSIVE de um campo novo', () => {
    // NEUTRALIZAÇÃO: trocar a allowlist por uma denylist dos campos conhecidos deixa a sentinela do
    // CAMPO NOVO vazar — que é exatamente como uma denylist falha ABERTA no primeiro campo que o
    // dispatcher inventar.
    const sentinelas = [
      'SENTINELA_EXTERNAL_SNAPSHOT',
      'SENTINELA_STORAGE_PATH',
      'SENTINELA_DOWNLOAD_URL',
      'SENTINELA_SELECTION_SNAPSHOT',
      'SENTINELA_INTEGRATION_ACCOUNT',
      'SENTINELA_SANITIZED_BODY',
      'SENTINELA_CAMPO_QUE_AINDA_NAO_EXISTE'
    ];

    const item = manifestReference(8901234567, {
      externalSnapshot: { raw: 'SENTINELA_EXTERNAL_SNAPSHOT' },
      storagePath: 'SENTINELA_STORAGE_PATH',
      downloadUrl: 'SENTINELA_DOWNLOAD_URL',
      campoQueAindaNaoExiste: 'SENTINELA_CAMPO_QUE_AINDA_NAO_EXISTE'
    });

    const text = renderedText(manifestListResult([item], {
      selectionSnapshot: 'SENTINELA_SELECTION_SNAPSHOT',
      integrationAccountId: 'SENTINELA_INTEGRATION_ACCOUNT',
      sanitizedBody: 'SENTINELA_SANITIZED_BODY',
      totalItems: 1
    }));

    for (const sentinela of sentinelas) {
      assert.ok(!text.includes(sentinela), `vazou: ${sentinela}`);
    }
    assert.match(text, /MTR 8901234567/, 'o dado útil continua saindo (controle positivo)');
  });

  it('`suggestedCertificateCriteria` não expõe identificadores internos de sessão/conta', () => {
    const text = renderedText({
      data: {
        intent: 'cdf.resolve_by_manifest_reference',
        sourceManifest: { manifestId: 'm1', manifestNumber: '8901234567', status: 'received', externalStatus: 'Recebido' },
        suggestedCertificateCriteria: {
          integrationAccountId: 'SENTINELA_ACCOUNT',
          sessionContextId: 'SENTINELA_SESSION',
          certificateHashCode: 'SENTINELA_HASH'
        }
      },
      artifacts: [],
      actions: []
    });

    assert.ok(!text.includes('SENTINELA_ACCOUNT'));
    assert.ok(!text.includes('SENTINELA_SESSION'));
    assert.ok(!text.includes('SENTINELA_HASH'));
    assert.match(text, /CDF do MTR 8901234567/);
  });

  it('artefato NÃO vira link: `downloadUrl`/`statusUrl` ficam fora (o WhatsApp auto-linka URL nua)', () => {
    // Não é só vazamento de superfície interna: a rota vira link tocável que devolve 401 e faz o
    // operador concluir que o SICAT está quebrado.
    const text = renderedText({
      type: 'artifact_list',
      data: { manifestId: 'm1', items: [] },
      artifacts: [{
        type: 'zip_bundle',
        title: 'Pacote de CDFs',
        payload: {
          artifactId: 'art_1',
          status: 'collecting',
          fileName: 'cdfs.zip',
          progress: { total: 10, completed: 6, failed: 0, pending: 4 },
          links: {
            statusUrl: '/v1/conversations/artifacts/art_1',
            downloadUrl: '/v1/conversations/artifacts/art_1/content'
          }
        }
      }],
      actions: []
    });

    assert.ok(!text.includes('/v1/conversations/artifacts'));
    assert.ok(!text.includes('art_1'));
    assert.match(text, /6 de 10/);
    assert.match(text, /no momento da consulta/, 'âncora temporal: sem ela o número finge estar vivo');
    assert.match(text, /ainda não consigo enviar arquivos/);
  });
});

/* ============================================================================================== */
/* 3. VOCABULÁRIO pt-BR — sem termo técnico, sem snake_case                                        */
/* ============================================================================================== */

describe('vocabulário canônico pt-BR', () => {
  it('`externalStatus: "Salvo"` vira "Aguardando baixa" — nunca "salvo", nunca "received"', () => {
    // "Aguardando baixa" é a situação CETESB `Salvo` e NÃO é `received` — confundir os dois foi a
    // causa de uma resposta errada em produção. NEUTRALIZAÇÃO: imprimir `status` cru quebra nos dois
    // lados da asserção.
    const item = manifestReference(8901234567, { statusLabel: undefined, status: 'received', externalStatus: 'Salvo' });
    const text = renderedText(manifestListResult([item], { totalItems: 1 }));

    assert.match(text, /Aguardando baixa/);
    assert.ok(!/salvo/i.test(text));
    assert.ok(!text.includes('received'));
  });

  it('job com código FORA da taxonomia não imprime snake_case na cara do operador', () => {
    // `describeOperationalStatus` com código desconhecido devolve `label: status` — isto é,
    // `snake_case` cru. NEUTRALIZAÇÃO: remover a guarda `label === status` faz "estado_zumbi"
    // aparecer no texto.
    const text = renderedText({
      type: 'job_card',
      data: { jobId: 'job_1', operation: 'operacao_desconhecida_qualquer', status: 'estado_zumbi' },
      artifacts: [],
      actions: [],
      jobId: 'corr_1'
    });

    assert.ok(!/estado_zumbi/.test(text));
    assert.ok(!/operacao_desconhecida_qualquer/.test(text));
    assert.match(text, /Situação não identificada aqui/);
  });

  it('`recommendedAction` de operador de PLATAFORMA não sai; o mapa do canal sai', () => {
    // O registry sugere "reenfileirar via /v1/jobs/{id}/retry" e "verificar logs/correlationId" —
    // língua de quem opera a plataforma, não de quem opera resíduos.
    const text = renderedText({
      type: 'job_card',
      data: { jobId: 'job_1', operation: 'manifest.submit', status: 'dlq', dlqReason: 'X', attempts: 3, maxAttempts: 3 },
      artifacts: [],
      actions: [],
      jobId: 'corr_9a41b0'
    });

    assert.match(text, /Em fila morta \(DLQ\)/);
    assert.ok(!text.includes('/v1/jobs'));
    assert.ok(!/logs|correlationId/i.test(text));
    assert.match(text, /Abra o SICAT no navegador/);
  });

  it('o nome do TIPO nunca é impresso (a tela faz isso; o texto, não)', () => {
    const text = renderedText({
      type: 'error_explanation',
      data: { message: 'O sistema da CETESB não respondeu a tempo.', reasonCode: 'REMOTE_TIMEOUT', correlationId: 'corr_c31f77' },
      artifacts: [],
      actions: []
    });

    assert.ok(!text.includes('error_explanation'));
    assert.ok(!text.includes('REMOTE_TIMEOUT'), 'reasonCode nunca vira texto');
    assert.match(text, /Protocolo: corr_c31f77/);
  });
});

/* ============================================================================================== */
/* 4. FAMÍLIAS — a cascata, e o `manifest_detail` que MENTE                                        */
/* ============================================================================================== */

describe('resolução de família', () => {
  it('alias `list`/`detail` do `withNormalizedShape` não cai no default', () => {
    // São os 5 tools mais usados (`list_manifests`, `get_manifest_details`, submit/print/cancel).
    // NEUTRALIZAÇÃO: um `switch` pelos 21 nomes da união deixa os dois casos abaixo degradados.
    const lista = render({
      type: 'list',
      data: { items: [manifestReference(1), manifestReference(2)], totalItems: 2 },
      artifacts: [],
      actions: []
    });
    assert.equal(lista.family, 'manifest_list');
    assert.equal(lista.degraded, false);

    const detalhe = render({ type: 'detail', data: manifestReference(8901234567), artifacts: [], actions: [] });
    assert.equal(detalhe.family, 'manifest_detail');
    assert.match(detalhe.blocks.map((b) => b.text).join('\n'), /\*MTR 8901234567\*/);
  });

  it('`query_catalog` emite `manifest_detail` com dados de CATÁLOGO — a FORMA vence o nome', () => {
    // O nome do tipo mente. Renderizar como detalhe de manifesto produziria um cartão vazio.
    const result = render({
      type: 'manifest_detail',
      data: {
        items: [
          { code: 'RES-001', description: 'Residuo Classe I' },
          { code: 'RES-002', description: 'Residuo Classe II-A' }
        ],
        totalItems: 2
      },
      artifacts: [],
      actions: []
    });

    assert.equal(result.family, 'catalog_list');
    const text = result.blocks.map((b) => b.text).join('\n');
    assert.match(text, /Residuo Classe I \(RES-001\)/);
    assert.ok(!/\*MTR /.test(text), 'catálogo não é manifesto');
  });

  it('tipo desconhecido → ZERO blocos, métrica contada, nenhum dump de `data`', () => {
    resetWhatsAppRenderCountersForTests();
    const result = render({ type: 'coisa_nova', data: { qualquer: 'coisa', segredo: 'sk-abc123' } });

    assert.equal(result.degraded, true);
    assert.deepEqual(result.blocks, [], 'não existe branch "renderiza genérico o que der"');
    assert.equal(readWhatsAppRenderUnknownFamilyCounters().coisa_nova, 1);
  });

  it('lista VAZIA não é degradação: família reconhecida, zero blocos, prosa sozinha', () => {
    const result = render(manifestListResult([], { totalItems: 0 }));
    assert.equal(result.family, 'manifest_list');
    assert.equal(result.degraded, false);
    assert.deepEqual(result.blocks, []);
  });
});

/* ============================================================================================== */
/* 5. FAMÍLIA DE AÇÃO — recusa, inclusive no caso INFERIDO                                         */
/* ============================================================================================== */

describe('família de ação — recusa por SINAL, não só por nome de tipo', () => {
  const previewData = {
    intent: 'manifest.preview_manifest.batch_submit_selected',
    actionIntent: 'manifest.batch_submit_selected',
    operation: 'manifest.batch_submit',
    affectedItems: Array.from({ length: 8 }, (_, i) => ({ manifestId: `m${i}` })),
    requiresConfirmation: true,
    selectionSnapshot: 'sel_9f2b41'
  };

  it('prévia EXPLÍCITA (`manifest_batch_preview`) recusa e não enumera nada', () => {
    const result = render({
      type: 'manifest_batch_preview',
      data: previewData,
      artifacts: [],
      actions: [{ type: 'confirm_tool_execution', label: 'Confirmar', payload: { intent: 'x', selectionSnapshot: 'sel_9f2b41' } }]
    });

    assert.equal(result.refusal, true);
    const text = result.blocks.map((b) => b.text).join('\n');
    assert.match(text, /precisa de confirmação/);
    assert.ok(!text.includes('sel_9f2b41'), 'token de snapshot é impronunciável e não sai');
    assert.equal(countItemLines(text), 0);
  });

  it('prévia INFERIDA (sem `type`, só `intent` com "batch") também recusa', () => {
    // Três tipos de ação NÃO têm produtor: são inferidos por `intent.includes('batch')`. Quem mudar
    // a policy sem olhar aqui depende de um casamento por nome que pode não acontecer.
    const result = render({ kind: 'preview', data: previewData, artifacts: [], actions: [] });
    assert.equal(result.refusal, true);
  });

  it('recusa por AÇÃO pendente, mesmo sem `requiresConfirmation` e sem intent de prévia', () => {
    const result = render({
      data: { intent: 'cdf.download_batch_selected_preview_stage', documentIds: ['d1', 'd2'] },
      artifacts: [],
      actions: [{ type: 'confirm_tool_execution', label: 'Confirmar', payload: {} }]
    });
    assert.equal(result.refusal, true);
  });

  it('`manifest_creation_draft` não deixa o `payloadPreview` do operador vazar', () => {
    const result = render({
      type: 'manifest_creation_draft',
      data: {
        intent: 'manifest.preview_create_from_payload',
        payloadPreview: { generatorName: 'SENTINELA_GERADOR', driverCpf: 'SENTINELA_CPF' },
        creationSnapshot: 'crt_1',
        requiresConfirmation: true
      },
      artifacts: [],
      actions: [],
      assistantSummary: 'responda "confirmo manifest.create_from_payload"'
    });

    const text = result.blocks.map((b) => b.text).join('\n');
    assert.ok(!text.includes('SENTINELA_GERADOR'));
    assert.ok(!text.includes('SENTINELA_CPF'));
    assert.ok(!/confirmo manifest/.test(text));
  });

  it('execução JÁ FEITA (`manifest_batch_action`) NÃO é recusa — conta e aponta o protocolo', () => {
    // CONTROLE NEGATIVO da recusa: prova que o ramo consegue distinguir prévia de execução.
    const result = render({
      type: 'manifest_batch_action',
      data: {
        intent: 'manifest.batch_submit_selected',
        operation: 'manifest.submit',
        response: { items: [{ manifestId: 'a', jobId: 'j1' }, { manifestId: 'b', jobId: 'j2' }], total: 2 }
      },
      artifacts: [],
      actions: [],
      jobId: 'corr_batch'
    });

    assert.equal(result.refusal, false);
    const text = result.blocks.map((b) => b.text).join('\n');
    // Plural de OPERADOR, não de formulário: "2 item(ns)" é tipografia de formulário burocrático e
    // a regra de linguagem do canal proíbe. O módulo já fazia certo em `buildDropNotice`.
    assert.match(text, /Envio do MTR: 2 itens em processamento no momento da consulta\./);
    assert.match(text, /Protocolo: corr_batch/);
  });

  it('no compositor, a recusa DESCARTA a prosa (que nessa família é a própria prévia)', () => {
    const segments = delivered({
      status: 'executed',
      responseText: 'Prévia da ação: 8 manifestos serão enviados. Para confirmar, responda "confirmo manifest.batch_submit_selected".',
      result: { type: 'manifest_batch_preview', data: previewData, artifacts: [], actions: [] }
    });

    const text = segments.join('\n');
    assert.ok(!text.includes('Prévia da ação'));
    assert.ok(!/8 manifestos/.test(text));
    assert.match(text, /precisa de confirmação/);
  });
});

/* ============================================================================================== */
/* 6. AUDITORIA — agregado, jamais a série                                                        */
/* ============================================================================================== */

describe('audit_timeline', () => {
  it('400 entradas viram contagem + última ação; nenhum campo HTTP, nenhuma sentinela', () => {
    // NEUTRALIZAÇÃO: listar os eventos estoura o teto E vaza a sentinela do `sanitizedBody`.
    const entries = Array.from({ length: 400 }, (_, index) => ({
      entityType: 'manifest',
      entityId: '8901234567',
      occurredAt: `2026-08-0${(index % 3) + 1}T14:09:00Z`,
      direction: 'outbound',
      component: 'cetesb-gateway',
      httpMethod: 'POST',
      endpoint: '/api/mtr/SENTINELA_ENDPOINT',
      httpStatus: 503,
      latencyMs: 987321,
      sanitizedHeaders: { 'x-teste': 'SENTINELA_HEADER' },
      sanitizedBody: { campo: 'SENTINELA_BODY' }
    }));

    const text = renderedText({
      type: 'audit_timeline',
      data: { correlationId: 'corr_9a41b0', entityType: 'manifest', entityId: '8901234567', entries },
      artifacts: [],
      actions: []
    });

    // Idem: "400 registro(s)" é plural de formulário. A concordância correta está coberta nos dois
    // sentidos (1 e N) em `whatsapp-output-contract.test.js`.
    assert.match(text, /^400 registros\.$/m);
    assert.ok(!text.includes('SENTINELA_ENDPOINT'));
    assert.ok(!text.includes('SENTINELA_HEADER'));
    assert.ok(!text.includes('SENTINELA_BODY'));
    assert.ok(!text.includes('503'), 'httpStatus não é tocado nem para contar');
    assert.ok(!text.includes('987321'), 'latência é superfície interna');
    assert.ok(!text.includes('POST'));

    // NO MÁXIMO UMA data de evento: a série inteira é o que este ramo existe para não emitir.
    const datas = text.match(/\d{2}\/\d{2} às \d{2}h\d{2}/g) ?? [];
    assert.equal(datas.length, 1);
    assert.ok(text.split('\n').length <= 6, 'teto de linhas do agregado');
  });
});

/* ============================================================================================== */
/* 7. HIGIENE DE VALOR — controle, bidi, marcador, grafema                                         */
/* ============================================================================================== */

describe('higiene de valor', () => {
  it('valor NUNCA cria linha: `\\n` vira espaço e não forja um "Protocolo:" falso', () => {
    // NEUTRALIZAÇÃO: deixar o `\n` passar faz o campo adversarial imprimir uma linha nossa.
    const sujo = sanitizeRenderedValue('Empresa X\nProtocolo: corr_falso\r\nMais uma linha');
    assert.ok(!sujo.includes('\n'));
    // O `_` some porque em VALOR ele é marcador de itálico (ver o caso de identificador abaixo, que
    // é o único lugar onde ele sobrevive). O que importa aqui é a linha não ter sido forjada.
    assert.equal(sujo, 'Empresa X Protocolo: corrfalso Mais uma linha');
  });

  it('marcadores de formatação saem por REMOÇÃO (o WhatsApp não tem escape)', () => {
    // Um `*` órfão aplica negrito ao RESTO da mensagem inteira; três crases viram monoespaçado.
    const sujo = sanitizeRenderedValue('ACME *S.A.* ~x~ `y` _z_');
    for (const marcador of ['*', '~', '`', '_']) {
      assert.ok(!sujo.includes(marcador), `marcador sobreviveu: ${marcador}`);
    }
  });

  it('controles BIDI e zero-width somem (inverter um número de MTR é falsificação fiscal)', () => {
    const sujo = sanitizeRenderedValue('MTR ‮7654321‬0​‍');
    assert.ok(!/[‪-‮⁦-⁩​-‏]/.test(sujo));
    assert.match(sujo, /MTR/);
  });

  it('IDENTIFICADOR preserva `_`: `corr_9a41b0` não pode virar `corr9a41b0`', () => {
    // Entre "id mangleado" e "id que talvez fique em itálico", o segundo é o dano menor: o protocolo
    // é o handle que o suporte usa. NEUTRALIZAÇÃO: usar `coerceScalarText` aqui quebra o caso.
    assert.equal(coerceIdentifierText('corr_9a41b0', 32), 'corr_9a41b0');
    assert.equal(coerceScalarText('corr_9a41b0', 32), 'corr9a41b0');
    assert.equal(coerceIdentifierText('corr*9a41`b0', 32), 'corr9a41b0', 'os marcadores perigosos continuam caindo fora');
  });

  it('não-escalar devolve `null` — sem `String()`, sem `[object Object]`, sem `stringify`', () => {
    for (const valor of [{ a: 1 }, [1, 2], null, undefined, Number.NaN, Infinity, true, () => 1]) {
      assert.equal(coerceScalarText(valor, 60), null, `escapou: ${typeof valor}`);
    }
  });

  it('corte não parte par surrogate, sequência ZWJ nem marca combinante', () => {
    // Lone surrogate = UTF-16 inválido = mensagem possivelmente REJEITADA pelo provedor, e o pior
    // desfecho do canal é operador MUDO. O ZWJ pendurado não invalida o UTF-16, mas renderiza como
    // junção quebrada — por isso a asserção do ZWJ é separada: é ela que morre quando o recuo em
    // fronteira de grafema é trocado por `slice` cru (o cinto do lone surrogate mascararia o resto).
    const familia = '\u{1F468}\u200D\u{1F469}\u200D\u{1F467}';
    // NFD explícito: base + marca combinante em posições DISTINTAS — é assim que a marca fica órfã
    // se o corte cair ENTRE as duas.
    const acentuado = 'a\u0300e\u0301i\u0303';

    for (const amostra of [`abc${familia}def`, `${familia}${acentuado}`, `${acentuado}${familia}`]) {
      // Índices onde uma marca combinante segue sua base: cortar EXATAMENTE aí decapita o acento.
      const cortesProibidos = new Set();
      for (let posicao = 1; posicao < amostra.length; posicao += 1) {
        if (/[\u0300-\u036F]/.test(amostra.charAt(posicao))) cortesProibidos.add(posicao);
      }

      for (let limite = 1; limite <= 24; limite += 1) {
        const cortado = cutAtGrapheme(amostra, limite);
        assert.ok(!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(cortado), `lone high surrogate em ${limite}`);
        assert.ok(!/(^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(cortado), `lone low surrogate em ${limite}`);
        assert.ok(!cortado.endsWith('\u200D'), `ZWJ pendurado em ${limite}`);
        assert.ok(!cortesProibidos.has(cortado.length), `base separada da marca combinante em ${limite}`);
        assert.ok(cortado.length <= limite);
      }
    }
  });

  it('campo gigante é capado COM marca de corte, nunca em silêncio', () => {
    const capado = coerceScalarText('a'.repeat(50_000), 60);
    assert.equal(capado.length, 60);
    assert.ok(capado.endsWith('…'), 'truncagem silenciosa é a falha que a escada elimina');
  });
});

/* ============================================================================================== */
/* 8. SEGMENTADOR — atomicidade por propriedade                                                    */
/* ============================================================================================== */

function syntheticBlocks(count, size, kind = 'item') {
  return Array.from({ length: count }, (_, index) => ({
    kind,
    // Cada bloco carrega um número de MTR ÚNICO e INTEIRO: é o que permite provar que nenhum foi
    // partido ao meio, sem reimplementar a divisão esperada no teste.
    text: `${index + 1}) MTR 99${String(index).padStart(8, '0')} ${'x'.repeat(Math.max(1, size))}`,
    droppable: true
  }));
}

describe('segmentador', () => {
  const options = { softChars: 1200, hardChars: 3500, maxSegments: 2, minLeftoverBlocksForExtraSegment: 2 };

  it('bloco é ÁTOMO: todo número de MTR aparece INTEIRO e num único segmento', () => {
    // NEUTRALIZAÇÃO: trocar o empacotamento por um `slice` ingênuo de caracteres sobre o texto
    // concatenado quebra esta asserção. Um teste que só checasse `segments.length === 2` PASSARIA
    // com o slice ingênuo — por isso não serve.
    const blocks = syntheticBlocks(40, 120);
    const { segments } = splitIntoSegments(blocks, { ...options, maxSegments: 6 });

    for (const block of blocks) {
      const numero = block.text.match(/MTR \d+/)[0];
      const ocorrencias = segments.filter((segment) => segment.includes(numero));
      if (ocorrencias.length === 0) continue; // descartado com nota — coberto no caso seguinte
      assert.equal(ocorrencias.length, 1, `${numero} apareceu em mais de um segmento`);
    }

    for (const segment of segments) {
      assert.ok(segment.length <= options.hardChars, 'segmento acima do teto duro');
    }
  });

  it('todo item EMITIDO sobrevive à concatenação (nada some no empacotamento)', () => {
    const blocks = syntheticBlocks(6, 100);
    const { segments, droppedBlocks } = splitIntoSegments(blocks, options);
    const juntos = segments.join('\n');

    assert.equal(droppedBlocks, 0);
    for (const block of blocks) assert.ok(juntos.includes(block.text), `linha perdida: ${block.text.slice(0, 20)}`);
  });

  it('a segunda mensagem é GANHA: 1 bloco sobrando é cortado COM nota, não vira bolha nova', () => {
    // Cada mensagem é paga e uma rajada lê como spam. Mas o corte nunca é mudo.
    const blocks = [...syntheticBlocks(3, 380), ...syntheticBlocks(1, 380)];
    const { segments, droppedBlocks } = splitIntoSegments(blocks, options);

    assert.equal(segments.length, 1);
    assert.equal(droppedBlocks, 1);
    assert.match(segments[0], /Cortei 1 item para a mensagem caber aqui/);
  });

  it('sobrando 2 blocos inteiros, o segundo segmento nasce', () => {
    const blocks = syntheticBlocks(8, 300);
    const { segments } = splitIntoSegments(blocks, options);
    assert.equal(segments.length, 2);
  });

  it('bloco obrigatório NUNCA é descartado — é ele que carrega a contagem e a saída', () => {
    const blocks = [
      { kind: 'header', text: '*Seus MTRs*', droppable: false },
      { kind: 'scope', text: 'Mostro os 8 mais recentes de 500 manifestos.', droppable: false },
      ...syntheticBlocks(30, 300),
      { kind: 'affordance', text: 'Veja a lista inteira no SICAT pelo navegador.', droppable: false }
    ];
    const { segments } = splitIntoSegments(blocks, options);
    const juntos = segments.join('\n');

    assert.match(juntos, /Mostro os 8 mais recentes de 500 manifestos\./);
    assert.match(juntos, /Veja a lista inteira no SICAT pelo navegador\./);
  });

  it('SEGMENTO 1 é autossuficiente: contagem honesta E saída para o SICAT nele', () => {
    // É isto que autoriza o `userNotified: true` no primeiro envio: morrer depois do segmento 1 é
    // TRUNCAGEM, não silêncio. Mover a linha de escopo para o segmento 2 quebra aqui — e quebraria
    // também a decisão do livro-razão.
    const items = Array.from({ length: 500 }, (_, index) => manifestReference(9500000000 + index));
    const segments = delivered({
      status: 'executed',
      responseText: 'Você tem 500 MTRs no período.',
      result: manifestListResult(items, { totalItems: 500 })
    });

    assert.match(segments[0], /Mostro os 8 mais recentes de 500 manifestos\./);
    assert.match(segments[0], /SICAT/);
  });

  it('bloco sozinho acima do teto duro é cortado COM aviso (e sem lone surrogate)', () => {
    const gigante = [{ kind: 'note', text: `${'\u{1F600}'.repeat(4000)}`, droppable: false }];
    const { segments } = splitIntoSegments(gigante, { ...options, hardChars: 500 });

    assert.equal(segments.length, 1);
    assert.ok(segments[0].length <= 500);
    assert.match(segments[0], /Cortei aqui para caber na mensagem/);
    assert.ok(!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(segments[0]));
  });
});

/* ============================================================================================== */
/* 9. COMPOSITOR — marcador, lead, e o caminho sem ficha                                          */
/* ============================================================================================== */

describe('compositor com ficha', () => {
  afterEach(() => {
    setConfigOverride('whatsappReplyMaxSegments', 2);
    setConfigOverride('whatsappSegmentSoftChars', 1200);
    setConfigOverride('whatsappRenderMaxCards', 3);
  });

  it('N=1 não ganha marcador "(1/1)"', () => {
    const segments = delivered({ status: 'responded', responseText: 'Você tem 3 MTRs hoje.', policy: { reasonCode: null } });
    assert.equal(segments.length, 1);
    assert.equal(segments[0], 'Você tem 3 MTRs hoje.', 'byte-idêntico ao comportamento da fase 3');
  });

  it('N>1 numera TODAS as bolhas (a ordem de entrega não é garantida pelo protocolo)', () => {
    setConfigOverride('whatsappSegmentSoftChars', 400);
    const items = Array.from({ length: 40 }, (_, index) => manifestReference(9700000000 + index));
    const segments = delivered({
      status: 'executed',
      responseText: 'Você tem 40 MTRs no período.',
      result: manifestListResult(items, { totalItems: 40 })
    });

    assert.equal(segments.length, 2);
    assert.match(segments[0], /\(1\/2\)$/);
    assert.match(segments[1], /\(2\/2\)$/);
  });

  it('a prosa vira MANCHETE: só o primeiro parágrafo sobrevive quando há ficha', () => {
    // A prosa pode INVENTAR número de MTR; a ficha lê campo por campo de uma allowlist. Onde
    // divergem, quem manda é a ficha — então a prosa não pode ser a fonte dos dados.
    const segments = delivered({
      status: 'executed',
      responseText: 'Você tem 2 MTRs hoje.\n\nSão eles: MTR 1111111111 (inventado) e MTR 2222222222 (inventado).',
      result: manifestListResult([manifestReference(8901234567), manifestReference(8901234566)], { totalItems: 2 })
    });

    const texto = segments.join('\n');
    assert.match(texto, /Você tem 2 MTRs hoje\./);
    assert.ok(!texto.includes('1111111111'), 'o parágrafo com números inventados foi podado');
    assert.match(texto, /MTR 8901234567/);
  });

  it('sem ficha, a prosa INTEIRA passa — comportamento da fase 3, intocado', () => {
    const segments = delivered({
      status: 'executed',
      responseText: 'Primeiro parágrafo.\n\nSegundo parágrafo, que precisa sobreviver.',
      result: { type: 'coisa_nova', data: {} }
    });

    assert.equal(segments.length, 1);
    assert.match(segments[0], /Segundo parágrafo, que precisa sobreviver\./);
  });

  it('renderer que LANÇA não derruba a resposta: a prosa sai sozinha (fail-soft)', () => {
    // Um bug de formatação virando exceção significaria job em retry → LLM re-executado (custo
    // triplicado) ou, pior, silêncio. Formatação nunca pode causar isso.
    const explosivo = {
      type: 'manifest_list',
      get data() { throw new Error('BOOM'); },
      artifacts: [],
      actions: []
    };
    const segments = delivered({ status: 'executed', responseText: 'Você tem 3 MTRs hoje.', result: explosivo });

    assert.deepEqual(segments, ['Você tem 3 MTRs hoje.']);
  });

  it('nenhum segmento passa do teto duro, nem com carga adversarial', () => {
    setConfigOverride('whatsappReplyMaxChars', 900);
    try {
      const items = Array.from({ length: 200 }, (_, index) => manifestReference(9900000000 + index, {
        receiver: 'Z'.repeat(50_000),
        generator: 'A'.repeat(50_000)
      }));
      const inicio = Date.now();
      const segments = delivered({
        status: 'executed',
        responseText: 'Você tem 200 MTRs no período.',
        result: manifestListResult(items, { totalItems: 200 })
      });
      const duracao = Date.now() - inicio;

      for (const segment of segments) assert.ok(segment.length <= 900, `segmento com ${segment.length}`);
      // Proxy barato para "não copiou a árvore inteira": projetar 200 x 50k levaria muito mais.
      assert.ok(duracao < 2000, `renderização levou ${duracao}ms — sinal de cópia de árvore`);
      assert.ok(!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(segments.join('')));
    } finally {
      setConfigOverride('whatsappReplyMaxChars', 3500);
    }
  });

  it('campo ausente/null é OMITIDO, nunca "não informado" e nunca inferido', () => {
    const texto = renderedText({
      type: 'detail',
      data: manifestReference(8901234567, { generator: null, carrier: undefined, receiver: '', driverName: null, vehiclePlate: null }),
      artifacts: [],
      actions: []
    });

    assert.match(texto, /\*MTR 8901234567\*/);
    assert.ok(!/Gerador/.test(texto));
    assert.ok(!/Motorista/.test(texto));
    assert.ok(!/não informado/i.test(texto));
    assert.ok(!/CDF ainda não/i.test(texto), 'ausência de campo não autoriza inferir estado');
  });
});

/* ============================================================================================== */
/* 10. PORTÃO DO CANAL NO PROMPT                                                                  */
/* ============================================================================================== */

describe('injeção de canal na redação', () => {
  it('fora do WhatsApp NÃO existe diretiva — o chat nativo fica byte-a-byte igual', () => {
    // NEUTRALIZAÇÃO: injetar sempre (remover o portão) quebra este caso. É ele que prova que a fase
    // não mexeu no navegador nem no copiloto in-app.
    for (const canal of ['native_chat', 'inapp', '', null, undefined, 'WHATSAPP_FALSO']) {
      assert.equal(buildChannelStyleDirective(canal), null, `vazou diretiva para ${canal}`);
    }
  });

  it('no WhatsApp a diretiva existe E exige o número na primeira frase', () => {
    // Não é estilo: `validateIntentResponseGuardrails` REPROVA redação sem número da evidência. Uma
    // diretiva só de brevidade faria TODA resposta cair no template determinístico do dispatcher —
    // o texto de navegador que esta fase existe para matar.
    const directive = buildChannelStyleDirective('whatsapp');

    assert.ok(directive);
    assert.match(directive, /PRIMEIRA frase precisa trazer o numero/);
    assert.match(directive, /nao havia nada/);
    assert.match(directive, /NAO liste os itens/);
    assert.match(directive, /nao envia arquivos/);
    assert.match(directive, /nunca escreva 'responda confirmo/);
  });
});

/* ============================================================================================== */
/* 11. LIVRO-RAZÃO DE ENTREGA — retomada, byte-identidade e parcial visível                        */
/* ============================================================================================== */

/**
 * Harness do worker. Os doubles são FONTE DE DADO e ESPIÃO DE ARGUMENTO — nenhum deles decide nada
 * nem reimplementa o livro-razão.
 */
function installLedgerHarness(options = {}) {
  const state = { turnCalls: 0, sends: [], patches: [] };
  const failOnSendIndex = options.failOnSendIndex ?? -1;

  setWhatsAppTurnDependenciesForTests({
    findLink: async (id) => ({ id, userId: 'usr_1', externalUserKey: '5511987654321', verificationStatus: 'verified' }),
    resolveChannelPrincipal: async (input) => ({ channel: 'whatsapp', userId: input.userId, permissionKeys: [] }),
    processTurn: async () => {
      state.turnCalls += 1;
      return options.turnOutput ?? { status: 'responded', responseText: 'Você tem 3 MTRs hoje.', policy: { reasonCode: null } };
    },
    resolveProvider: () => ({
      name: 'meta',
      async sendText(input) {
        if (state.sends.length === failOnSendIndex) {
          state.sends.push({ ...input, falhou: true });
          throw Object.assign(new Error('provedor caiu'), { code: 'WHATSAPP_SEND_FAILED' });
        }
        state.sends.push(input);
        return { providerMessageId: `wamid.${state.sends.length}` };
      }
    }),
    insertAuditEntry: async () => {},
    now: () => Date.now()
  });

  const patchJobPayload = async (job, patch) => {
    state.patches.push(Object.keys(patch).join('+'));
    Object.assign(job.payload, patch);
  };

  return { state, patchJobPayload };
}

function buildInboundJob(overrides = {}) {
  return {
    jobId: 'job_1',
    entityId: 'cimsg_1',
    correlationId: 'corr_1',
    payload: {
      channel: 'whatsapp',
      providerName: 'meta',
      providerMessageId: 'wamid.in',
      channelLinkId: 'cclk_1',
      disposition: 'process_turn',
      messageType: 'text',
      text: 'meus MTRs de hoje',
      receivedAt: new Date().toISOString(),
      maskedUserKey: '55****4321',
      ...overrides
    }
  };
}

/** Resposta longa o bastante para render DOIS segmentos com o orçamento reduzido do caso. */
function multiSegmentTurnOutput() {
  const items = Array.from({ length: 40 }, (_, index) => manifestReference(9800000000 + index));
  return {
    status: 'executed',
    responseText: 'Você tem 40 MTRs no período.',
    policy: { reasonCode: null },
    result: manifestListResult(items, { totalItems: 40 })
  };
}

describe('livro-razão de entrega por segmento', () => {
  beforeEach(() => {
    setWhatsAppTurnDependenciesForTests(null);
    resetWhatsAppExpiredNoticeThrottleForTests();
  });

  afterEach(() => {
    setConfigOverride('whatsappSegmentSoftChars', 1200);
    setConfigOverride('whatsappMaxSendAttempts', 2);
    setWhatsAppTurnDependenciesForTests(null);
    resetWhatsAppExpiredNoticeThrottleForTests();
  });

  it('N=1: sequência de patches e texto BYTE-IDÊNTICOS à fase 3', async () => {
    // REGRA DE OURO DA MIGRAÇÃO. NEUTRALIZAÇÃO: gravar `replySegments` sempre (mesmo com N=1) quebra
    // o `deepEqual` abaixo — e quebraria também os dois testes-âncora do `whatsapp-worker-hardening`,
    // que esta regra existe para NÃO precisar editar.
    const harness = installLedgerHarness();
    const job = buildInboundJob();

    const result = await runWhatsAppInboundTurn({ job, patchJobPayload: harness.patchJobPayload });

    assert.deepEqual(harness.state.patches, [
      'replyText+replyPreparedAt',
      'sendAttempts',
      'replySentAt+replyProviderMessageId+userNotified'
    ]);
    assert.equal(harness.state.sends.length, 1);
    assert.equal(harness.state.sends[0].text, 'Você tem 3 MTRs hoje.', 'sem marcador, sem sufixo');
    assert.equal(job.payload.replySegments, undefined, 'campo novo não existe quando N=1');
    assert.equal(job.payload.sentSegmentCount, undefined);
    assert.equal(result.patch.replyChars, 'Você tem 3 MTRs hoje.'.length);
  });

  it('RETOMADA: falha no 2º segmento não reenvia o 1º nem reexecuta o LLM', async () => {
    // O teste mais importante do lote: é o único que prova que o TERCEIRO desfecho existe.
    // NEUTRALIZAÇÃO (a): carimbar `sentSegmentCount` só no fim → o 1º sai duas vezes, quebra.
    // NEUTRALIZAÇÃO (b): carimbar `replySentAt` no primeiro envio → o 2º nunca sai, quebra.
    setConfigOverride('whatsappSegmentSoftChars', 400);
    const harness = installLedgerHarness({ turnOutput: multiSegmentTurnOutput(), failOnSendIndex: 1 });
    const job = buildInboundJob();

    await assert.rejects(() => runWhatsAppInboundTurn({ job, patchJobPayload: harness.patchJobPayload }));

    // Snapshot ANTES do C9, que zera os segmentos do payload por privacidade.
    const preparados = [...job.payload.replySegments];
    assert.equal(preparados.length, 2, 'o orçamento reduzido produziu 2 mensagens');
    assert.equal(harness.state.sends.length, 2, 'o 1º saiu, o 2º falhou');
    assert.equal(job.payload.sentSegmentCount, 1, 'o índice do último entregue ficou persistido');
    assert.equal(job.payload.replySentAt, undefined, '`replySentAt` só quando TUDO saiu');

    // Re-execução do MESMO job (retry do job-runner / requeue de claim stale).
    const retomada = installLedgerHarness({ turnOutput: multiSegmentTurnOutput() });
    await runWhatsAppInboundTurn({ job, patchJobPayload: retomada.patchJobPayload });

    assert.equal(retomada.state.turnCalls, 0, 'retry de ENTREGA, nunca de LLM');
    assert.equal(retomada.state.sends.length, 1, 'só o que faltava');
    assert.equal(retomada.state.sends[0].text, preparados[1], 'retomou do índice, não do começo');
    assert.ok(job.payload.replySentAt, 'agora sim o carimbo de "acabei"');
    assert.equal(job.payload.replyFullyDelivered, true);

    // Somando as duas execuções, o texto do segmento 1 saiu EXATAMENTE UMA VEZ com sucesso.
    const enviosComSucesso = [...harness.state.sends.filter((send) => !send.falhou), ...retomada.state.sends];
    const primeiroSegmento = enviosComSucesso.filter((send) => send.text === preparados[0]);
    assert.equal(primeiroSegmento.length, 1, 'duplicata é o desfecho que a retomada elimina');
  });

  it('C9 zera `replySegments`/`segmentMessageIds` — o texto não fica residente na tabela `jobs`', async () => {
    setConfigOverride('whatsappSegmentSoftChars', 400);
    const harness = installLedgerHarness({ turnOutput: multiSegmentTurnOutput() });
    const job = buildInboundJob();

    const result = await runWhatsAppInboundTurn({ job, patchJobPayload: harness.patchJobPayload });

    assert.equal(result.patch.replySegments, null);
    assert.equal(result.patch.segmentMessageIds, null);
    assert.equal(result.patch.replyText, null);
    assert.equal(result.patch.text, null);
  });

  it('entrega PARCIAL não some do painel como sucesso mudo', async () => {
    // Sem o outcome próprio, a parcial viraria "concluído" — a falha que a fase 3 gastou o bloco de
    // EXPIRAÇÃO DE BACKLOG para eliminar.
    const job = buildInboundJob({
      replyText: 'Parte 1',
      replySegments: ['Parte 1', 'Parte 2'],
      sentSegmentCount: 1,
      sendAttempts: 3
    });
    const harness = installLedgerHarness();

    const result = await runWhatsAppInboundTurn({ job, patchJobPayload: harness.patchJobPayload });

    assert.equal(result.outcome, 'whatsapp_inbound_partially_answered');
    assert.equal(result.patch.userNotified, true);
    assert.equal(harness.state.sends.length, 0);
  });

  it('teto de tentativas ESCALA com o número de segmentos (2 segmentos não estouram o limite)', async () => {
    // O contador conta MENSAGENS ao provedor. Sem escalar o teto, uma resposta de 2 bolhas
    // declararia `reply_undeliverable` na própria execução feliz seguinte.
    setConfigOverride('whatsappSegmentSoftChars', 400);
    setConfigOverride('whatsappMaxSendAttempts', 2);
    const harness = installLedgerHarness({ turnOutput: multiSegmentTurnOutput() });
    const job = buildInboundJob();

    await runWhatsAppInboundTurn({ job, patchJobPayload: harness.patchJobPayload });

    assert.equal(harness.state.sends.length, 2);
    assert.equal(job.payload.sendAttempts, 2);
    assert.ok(job.payload.replyFullyDelivered);
  });

  it('rollout com fila cheia: job antigo (só `replyText`) NÃO reexecuta o LLM', async () => {
    // É UMA LINHA de código e a ausência dela é silenciosa: custo dobrado e possibilidade de a
    // pessoa receber resposta DIFERENTE da que já recebeu.
    const harness = installLedgerHarness();
    const job = buildInboundJob({ replyText: 'Resposta preparada pela versão anterior.' });

    await runWhatsAppInboundTurn({ job, patchJobPayload: harness.patchJobPayload });

    assert.equal(harness.state.turnCalls, 0);
    assert.equal(harness.state.sends.length, 1);
    assert.equal(harness.state.sends[0].text, 'Resposta preparada pela versão anterior.');
  });
});
