import { describe, it, afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { setConfigOverride } from '../../src/lib/config.js';
import { sanitizeRenderedValue } from '../../src/services/conversation/channel/whatsapp/whatsapp-render-blocks.js';
import {
  renderStructuredResultForWhatsApp,
  readWhatsAppRenderEmptyFamilyCounters,
  resetWhatsAppRenderCountersForTests
} from '../../src/services/conversation/channel/whatsapp/whatsapp-result-renderer.js';
import { composeWhatsAppReply } from '../../src/services/conversation/channel/whatsapp/whatsapp-reply-composer.js';
import {
  runWhatsAppInboundTurn,
  resetWhatsAppExpiredNoticeThrottleForTests,
  setWhatsAppTurnDependenciesForTests
} from '../../src/services/conversation/channel/whatsapp/whatsapp-turn-service.js';

/**
 * FASE 4 — CONTRATO DA SAÍDA (rodada de remediação).
 *
 * ┌─ POR QUE ESTE ARQUIVO EXISTE, E POR QUE ELE NÃO É "MAIS CASOS" ───────────────────────────────┐
 * │ A verificação da fase provou que o suite anterior provava a FUNÇÃO correta e nunca provava     │
 * │ que o TEXTO QUE SAI é correto. A cobertura de grafema existia e era boa — toda dentro de       │
 * │ `cutAtGrapheme` e de `splitIntoSegments` — mas o corte FINAL de todo segmento passa por        │
 * │ `truncateWhatsAppReply`, que ninguém checava: uma mutação NEUTRA EM COMPRIMENTO (trocar o      │
 * │ último caractere do corte por um high surrogate solto) sobreviveu aos 552 testes sem uma       │
 * │ única falha.                                                                                   │
 * │                                                                                                │
 * │ A resposta não é cobrir aquele sítio. É afirmar a invariante sobre a SAÍDA — o array de        │
 * │ strings que o compositor entrega ao provedor — para uma matriz ampla de payloads. Qualquer     │
 * │ sítio de corte, presente OU FUTURO, cai dentro dela. O mesmo raciocínio vale para a contagem:  │
 * │ o par (exibidos, total) é afirmado POR FAMÍLIA contra a FONTE, para que zerar o `rendered` de  │
 * │ UMA família quebre exatamente um caso — e não fique escondido atrás da cobertura concentrada   │
 * │ em `manifest_list`/`cdf_list`.                                                                 │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * DISCIPLINA (herdada de `whatsapp-reply-renderer.test.js`):
 *  · nenhum double reimplementa formatação, contagem ou divisão — as asserções contam LINHAS e
 *    EXTRAEM NÚMEROS do texto entregue, e comparam com o que a FIXTURE colocou lá dentro;
 *  · fixtures vêm do PRODUTOR (`conversation-tool-dispatcher.ts` e os repositórios), nunca do Vue;
 *  · cada caso foi conferido contra a NEUTRALIZAÇÃO da guarda (não só contra a deleção); onde a
 *    neutralização é interessante, ela está escrita no comentário.
 */

/* ══════════════════════════════════════════════════════════════════════════════════════════════ */
/* FERRAMENTAL COMUM                                                                              */
/* ══════════════════════════════════════════════════════════════════════════════════════════════ */

/** UTF-16 mal-formado. Casa high surrogate sem par À FRENTE e low surrogate sem par ATRÁS. */
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

/**
 * Telefone em claro. Exige o `+55`, o DDD entre parênteses ou os 13 dígitos do formato de canal —
 * um número de MTR tem 10 dígitos CRUS e não pode casar aqui (senão o guarda vira ruído).
 */
const PHONE_IN_CLEAR = /\+55[\s.-]?\d{2}[\s.-]?9?\d{4}[\s.-]?\d{4}|\(\d{2}\)\s?9?\d{4}[\s.-]?\d{4}|\b55\d{2}9\d{8}\b/;

const PHONE_SENTINELS = ['+55 11 98765-4321', '(11) 98765-4321', '5511987654321'];

/** Plural de formulário burocrático. Proibido em mensagem de celular. */
const FORM_PLURAL = /\((?:s|ns|es|is)\)/;

const RENDER_OPTIONS = { itemCap: 8, cardCap: 3, nowMs: Date.parse('2026-08-07T12:00:00Z') };

function render(result, options = {}) {
  return renderStructuredResultForWhatsApp(result, { ...RENDER_OPTIONS, ...options });
}

function renderedText(result, options = {}) {
  return render(result, options).blocks.map((block) => block.text).join('\n');
}

function delivered(output, ctx = {}) {
  return composeWhatsAppReply(output, ctx);
}

function deliveredText(output, ctx = {}) {
  return delivered(output, ctx).join('\n');
}

/** Linhas de item numeradas, contadas no TEXTO — nunca perguntadas ao renderer. */
function countItemLines(text) {
  return text.split('\n').filter((line) => /^\d+\)\s/.test(line)).length;
}

/** Inteiros que aparecem numa linha, na ordem. É assim que o par (exibidos, total) é conferido. */
function numbersIn(line) {
  return (line.match(/\d+/g) ?? []).map(Number);
}

function lineStartingWith(text, prefix) {
  return text.split('\n').find((line) => line.startsWith(prefix)) ?? null;
}

/** Restaura TODO override tocado por este arquivo. `setConfigOverride(k, undefined)` não limpa. */
function restoreWhatsAppConfigDefaults() {
  setConfigOverride('whatsappReplyMaxChars', 3500);
  setConfigOverride('whatsappSegmentSoftChars', 1200);
  setConfigOverride('whatsappReplyMaxSegments', 2);
  setConfigOverride('whatsappRenderMaxItems', 8);
  setConfigOverride('whatsappRenderMaxCards', 3);
}

/* ══════════════════════════════════════════════════════════════════════════════════════════════ */
/* FIXTURES DO PRODUTOR — os 21 tipos + os aliases + as três famílias novas                       */
/* ══════════════════════════════════════════════════════════════════════════════════════════════ */

/** `summarizeManifestReference` (`conversation-tool-dispatcher.ts:610-627`). */
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

/** `list_cdf_certificates` / `cdf.list_by_manifest_selection` — amostra enxuta, sem snapshot. */
function certificate(index, overrides = {}) {
  return {
    id: `cdf_${index}`,
    certificateCode: String(4700 + index),
    issuedAt: '2026-07-30',
    receiver: { partnerCode: `P${index}`, description: 'Aterro Sanitario XPTO' },
    ...overrides
  };
}

/** `dmr-repo.ts` — a declaração tem PERÍODO, não número de MTR. */
function dmrRecord(index, overrides = {}) {
  return {
    id: `dmr_3f2a91b0c4d5e6f7a8b9c0d1e${index}`,
    status: 'pending_review',
    periodStart: '2026-07-01',
    periodLabel: `0${(index % 9) + 1}/2026`,
    role: 'generator',
    ...overrides
  };
}

/** `mtr-provisorio-repo.ts:186` (`mapListItem`) — o discriminante é `kind: 'provisorio'`. */
function provisorioRecord(index, overrides = {}) {
  return {
    id: `mtrp_aa11bb22cc33dd44ee55ff${index}`,
    kind: 'provisorio',
    status: 'submitting',
    externalStatus: null,
    manifestNumber: null,
    provisionalNumber: `PROV-${1000 + index}`,
    expeditionDate: '2026-08-03',
    ...overrides
  };
}

/** `partner-repo.ts:64-79` (`mapRow`) — sem `manifestNumber`, sem `id`. */
function partnerRecord(index, overrides = {}) {
  return {
    partnerCode: String(90000 + index),
    role: 'receiver',
    description: `Destinadora Ambiental ${index} Ltda`,
    tradeName: `Destinadora ${index}`,
    document: '12.345.678/0001-99',
    ...overrides
  };
}

/** `jobsSearch` (`operations-service.ts:281`) — `job_list` não tem cap no produtor. */
function jobRecord(index, overrides = {}) {
  return {
    jobId: `job_${index}`,
    entityType: 'manifest',
    entityId: `man_${index}`,
    operation: 'manifest.submit',
    status: index % 2 === 0 ? 'dlq' : 'running',
    attempts: 3,
    maxAttempts: 3,
    ...overrides
  };
}

/** `listManifestDocuments` — a lista de artefatos de um manifesto. */
function documentRecord(index, overrides = {}) {
  return {
    documentId: `doc_${index}`,
    fileName: index === 0 ? 'MTR-8901234567.pdf' : `CDF-2026-000${430 + index}.pdf`,
    status: 'available',
    ...overrides
  };
}

function catalogRecord(index) {
  return { code: `A0${index}`, description: `Oleo lubrificante usado tipo ${index}` };
}

function auditEntry(index) {
  return {
    entityType: 'manifest',
    entityId: '8901234567',
    occurredAt: `2026-08-0${(index % 3) + 1}T14:09:00Z`,
    direction: 'outbound',
    component: 'cetesb-gateway',
    httpMethod: 'POST',
    endpoint: '/api/mtr/SENTINELA_ENDPOINT',
    httpStatus: 503,
    latencyMs: 987321,
    sanitizedBody: { campo: 'SENTINELA_BODY' }
  };
}

function repeat(factory, count) {
  return Array.from({ length: count }, (_, index) => factory(index));
}

/**
 * Catálogo de payloads: um por TIPO/ALIAS/INTENT que o dispatcher realmente emite, mais os três
 * tipos sem produtor (`download_artifact`, `zip_artifact`, `action_confirmation`), que chegam por
 * `artifacts[]`/`actions[]` e atravessam qualquer família.
 *
 * `size` controla a cardinalidade e `taint` injeta conteúdo hostil nos campos de TEXTO LIVRE — que
 * é por onde emoji, astral, ZWJ e bandeira entram no orçamento de caracteres.
 */
function buildFixtureCatalog({ size, taint }) {
  const mark = (value) => (taint ? `${value} ${taint}` : value);
  const manifests = repeat((index) => manifestReference(8901234500 + index, {
    generator: mark('Industria Quimica Paulista Ltda'),
    carrier: mark('Transresiduos Log Ltda'),
    receiver: mark('Sansuy Ambiental S.A.'),
    driverName: mark('Jose Carlos de Souza'),
    // Campos FORA de qualquer allowlist: é o vetor de telefone em claro.
    driverPhone: PHONE_SENTINELS[0],
    contactPhone: PHONE_SENTINELS[1],
    whatsapp: PHONE_SENTINELS[2]
  }), size);

  return [
    {
      name: 'manifest_list',
      result: {
        kind: 'query',
        type: 'manifest_list',
        data: { intent: 'manifest.list_recent_top', affectedItems: manifests, totalItems: size * 3 },
        artifacts: [],
        actions: []
      }
    },
    {
      name: 'list (alias de withNormalizedShape)',
      result: { type: 'list', data: { items: manifests, totalItems: size }, artifacts: [], actions: [] }
    },
    {
      name: 'grouped_manifest_list',
      result: {
        type: 'grouped_manifest_list',
        data: {
          intent: 'manifest.group_by_receiver',
          grouped: repeat((index) => ({ group: mark(`Destinadora ${index}`), total: index + 1 }), size)
        },
        artifacts: [],
        actions: []
      }
    },
    {
      name: 'manifest_detail (cartão único)',
      result: { type: 'detail', data: manifests[0] ?? manifestReference(8901234500), artifacts: [], actions: [] }
    },
    {
      name: 'manifest_detail (conjunto)',
      result: {
        type: 'manifest_detail',
        data: { intent: 'manifest.detail_selected_set', manifests, totalItems: size },
        artifacts: [],
        actions: []
      }
    },
    {
      name: 'catalog_list (query_catalog mascarado de manifest_detail)',
      result: {
        type: 'manifest_detail',
        data: { items: repeat((index) => ({ ...catalogRecord(index), description: mark(catalogRecord(index).description) }), size), totalItems: size * 7 },
        artifacts: [],
        actions: []
      }
    },
    {
      name: 'cdf_list',
      result: {
        type: 'cdf_list',
        data: { items: repeat((index) => certificate(index, { receiver: { partnerCode: 'P1', description: mark('Aterro Sanitario XPTO') } }), size), totalItems: size * 4, truncated: true },
        artifacts: [],
        actions: []
      }
    },
    {
      name: 'cdf_list por intent (cdf.list_by_manifest_selection)',
      result: {
        kind: 'query',
        data: {
          intent: 'cdf.list_by_manifest_selection',
          manifestIds: repeat((index) => `man_${index}`, size),
          linkedHashCodes: [],
          certificates: repeat((index) => certificate(index), size)
        },
        artifacts: [],
        actions: []
      }
    },
    {
      name: 'cdf_reference',
      result: {
        kind: 'query',
        data: {
          intent: 'cdf.resolve_by_manifest_reference',
          sourceManifest: manifests[0] ?? manifestReference(8901234500),
          suggestedCertificateCriteria: { integrationAccountId: 'acc_1', sessionContextId: 'sess_1' }
        },
        artifacts: [],
        actions: []
      }
    },
    {
      name: 'cdf_action',
      result: {
        kind: 'action',
        data: {
          intent: 'cdf.generate_from_manifest_selection',
          execution: repeat((index) => ({ manifestId: `man_${index}`, jobId: `job_${index}` }), size),
          total: size
        },
        artifacts: [],
        actions: [],
        jobId: 'corr_cdfgen'
      }
    },
    {
      name: 'action_refusal (manifest_batch_preview)',
      result: {
        type: 'manifest_batch_preview',
        data: {
          intent: 'manifest.preview_manifest.batch_submit_selected',
          affectedItems: manifests,
          requiresConfirmation: true,
          selectionSnapshot: 'sel_9f2b41'
        },
        artifacts: [],
        actions: [{ type: 'confirm_tool_execution', label: 'Confirmar', payload: {} }]
      }
    },
    {
      name: 'action_confirmation (tipo sem produtor)',
      result: {
        type: 'action_confirmation',
        data: { intent: 'manifest.batch_submit_selected', requiresConfirmation: true },
        artifacts: [],
        actions: []
      }
    },
    {
      name: 'batch_action',
      result: {
        kind: 'action',
        type: 'manifest_batch_action',
        data: {
          intent: 'manifest.batch_submit_selected',
          operation: 'manifest.submit',
          response: { items: repeat((index) => ({ manifestId: `m${index}`, jobId: `j${index}` }), size), total: size }
        },
        artifacts: [],
        actions: [],
        jobId: 'corr_batch'
      }
    },
    {
      name: 'batch_action por kind (manifest.cancel_recent_excluding_first)',
      result: {
        kind: 'action',
        data: {
          intent: 'manifest.cancel_recent_excluding_first',
          operation: 'manifest.cancel',
          execution: repeat((index) => ({ manifestId: `m${index}`, jobId: `j${index}` }), size)
        },
        artifacts: [],
        actions: [],
        jobId: 'corr_cancel'
      }
    },
    {
      name: 'job_card',
      result: {
        type: 'job_card',
        data: { jobId: 'job_1', operation: 'manifest.submit', status: 'dlq', dlqReason: 'X', attempts: 3, maxAttempts: 3, queuedAt: '2026-08-07T11:00:00Z' },
        artifacts: [],
        actions: [],
        jobId: 'corr_job'
      }
    },
    {
      name: 'job_list',
      result: { type: 'job_list', data: { items: repeat(jobRecord, size), totalItems: size * 8 }, artifacts: [], actions: [] }
    },
    {
      name: 'operation_progress (progresso explícito)',
      result: { type: 'status', data: { progress: { completed: 6, total: 10 } }, artifacts: [], actions: [], jobId: 'corr_prog' }
    },
    {
      name: 'operation_progress (get_operations_overview)',
      result: {
        type: 'operation_progress',
        data: {
          generatedAt: '2026-08-07T12:00:00Z',
          jobs: { queued: 4, running: 2, retry_wait: 1, dlq_total: 5, total: 12 },
          recentDlq: repeat((index) => ({ jobId: `job_${index}`, operation: 'manifest.submit' }), size)
        },
        artifacts: [],
        actions: []
      }
    },
    {
      name: 'operation_progress (get_dashboard_overview)',
      result: {
        type: 'operation_progress',
        data: { health: { status: 'ok' }, workers: { online: 1 }, activeJobs: { total: 3, items: [] }, performance: {} },
        artifacts: [],
        actions: []
      }
    },
    {
      name: 'audit_timeline',
      result: {
        type: 'audit_timeline',
        data: { correlationId: 'corr_9a41b0', entityType: 'manifest', entityId: '8901234567', entries: repeat(auditEntry, size) },
        artifacts: [],
        actions: []
      }
    },
    {
      name: 'artifact_list (list_manifest_documents)',
      result: {
        type: 'artifact_list',
        data: { manifestId: 'man_1', items: repeat((index) => documentRecord(index, { fileName: mark(documentRecord(index).fileName) }), size) },
        artifacts: [],
        actions: []
      }
    },
    {
      name: 'download_artifact (tipo sem produtor)',
      result: {
        type: 'download_artifact',
        data: {},
        artifacts: [{ type: 'document', payload: { artifactId: 'art_1', fileName: mark('MTR-8901234567.pdf'), status: 'available', links: { downloadUrl: '/v1/x' } } }],
        actions: []
      }
    },
    {
      name: 'zip_artifact (tipo sem produtor)',
      result: {
        type: 'zip_artifact',
        data: {},
        artifacts: [{ type: 'zip_bundle', payload: { artifactId: 'art_2', fileName: mark('cdfs-2026-08.zip'), status: 'collecting', progress: { total: 10, completed: 6 } } }],
        actions: [],
        jobId: 'job_zip1'
      }
    },
    {
      name: 'error_explanation',
      result: {
        type: 'error_explanation',
        data: { message: mark('O sistema da CETESB nao respondeu a tempo.'), reasonCode: 'REMOTE_TIMEOUT', correlationId: 'corr_c31f77' },
        artifacts: [],
        actions: []
      }
    },
    {
      name: 'dmr_list',
      result: { kind: 'query', type: 'manifest_list', data: { items: repeat(dmrRecord, size), total: size * 2 }, artifacts: [], actions: [] }
    },
    {
      name: 'mtr_provisorio_list',
      result: { kind: 'query', type: 'manifest_list', data: { items: repeat(provisorioRecord, size), totalItems: size * 2 }, artifacts: [], actions: [] }
    },
    {
      name: 'partner_list (search_partners)',
      result: {
        kind: 'query',
        type: 'manifest_list',
        data: { items: repeat((index) => partnerRecord(index, { description: mark(partnerRecord(index).description) }), size), totalItems: size * 2 },
        artifacts: [],
        actions: []
      }
    },
    {
      name: 'tipo desconhecido (degrada para prosa sozinha)',
      result: { type: 'coisa_que_o_dispatcher_ainda_nao_emite', data: { qualquer: 'coisa' }, artifacts: [], actions: [] }
    }
  ];
}

/* ══════════════════════════════════════════════════════════════════════════════════════════════ */
/* 1. ASSERÇÃO DE SAÍDA UNIVERSAL — mata o SÍTIO DE CORTE presente OU FUTURO                      */
/* ══════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * Conteúdo hostil por CLASSE de grafema. Cada um quebra de um jeito diferente num `slice` cru:
 * emoji BMP+astral parte o par surrogate; ZWJ parte a junção; bandeira é um par de indicadores
 * regionais (dois pares surrogate que só significam algo juntos); a marca combinante fica órfã.
 */
const TAINT_VARIANTS = [
  { name: 'texto simples', taint: '' },
  { name: 'emoji astral', taint: '👍😀🚛' },
  { name: 'ZWJ (família)', taint: '👨‍👩‍👧‍👦' },
  { name: 'bandeira (indicadores regionais)', taint: '🇧🇷🇵🇹' },
  { name: 'matemático astral + combinante', taint: '𝒜𝔅𝕮 àé' },
  { name: 'invisíveis + marcadores do WhatsApp', taint: '*​؜­~`_\u{E0041}' }
];

const CONFIG_VARIANTS = [
  { name: 'padrão (3500/1200)', overrides: {}, hardCap: 3500 },
  { name: 'teto apertado (300/300)', overrides: { whatsappReplyMaxChars: 300, whatsappSegmentSoftChars: 300 }, hardCap: 300 },
  { name: 'teto médio (900/400) com 3 bolhas', overrides: { whatsappReplyMaxChars: 900, whatsappSegmentSoftChars: 400, whatsappReplyMaxSegments: 3 }, hardCap: 900 },
  // Config INVÁLIDA no Secret (`WHATSAPP_REPLY_MAX_CHARS=abc` ou `=0`): o teto tem de cair no
  // default de 3500, nunca desaparecer. Era o achado BAIXO do compositor (`:189`).
  { name: 'config inválida (abc/0) → default 3500', overrides: { whatsappReplyMaxChars: 'abc', whatsappSegmentSoftChars: 0 }, hardCap: 3500 }
];

const PROSE_WITH_ASTRAL = [
  'Você tem 12 MTRs no período 👍😀🚛 e um deles está com pendência 👨‍👩‍👧‍👦.',
  ...Array.from({ length: 60 }, () => 'Detalhe adicional que o modelo escreveu 🚛🇧🇷 e que pode ser cortado no meio. ')
].join(' ');

/**
 * O guarda universal. Roda sobre CADA segmento realmente entregue ao provedor.
 *
 * NEUTRALIZAÇÃO CONFERIDA: trocar `cutAtGrapheme` por `value.slice(0, room)` em
 * `truncateWhatsAppReply` faz (a) quebrar; devolver o texto intacto quando o config é inválido faz
 * (b) quebrar; emitir segmento em branco faz (c) quebrar; pôr um campo de telefone na allowlist faz
 * (d) quebrar.
 */
function assertDeliverableSegments(segments, { hardCap, label }) {
  assert.ok(Array.isArray(segments), `${label}: a saída não é um array`);
  for (const [index, segment] of segments.entries()) {
    const where = `${label} [segmento ${index + 1}/${segments.length}]`;

    // (a) UTF-16 BEM-FORMADO. Lone surrogate = payload inválido = mensagem REJEITADA pelo provedor,
    //     e o pior desfecho do canal é o operador ficar MUDO sem ver nem o erro.
    assert.ok(!LONE_SURROGATE.test(segment), `${where}: lone surrogate na saída`);
    // (b) DENTRO DO TETO. Acima de ~4096 o provedor rejeita; o teto técnico é o único freio.
    assert.ok(segment.length <= hardCap, `${where}: ${segment.length} caracteres > teto ${hardCap}`);
    // (c) NÃO-VAZIO, e não-vazio DE CONTEÚDO: uma bolha que contém só o aviso de corte é uma
    //     mensagem paga que não diz nada. É o desfecho de um teto NaN/0 lido cru do config — o
    //     mesmo defeito que produz o excesso, com o sinal invertido.
    assert.ok(segment.trim().length > 0, `${where}: segmento vazio`);
    assert.ok(!segment.trimStart().startsWith('[...]'), `${where}: segmento reduzido ao aviso de corte`);
    // (d) SEM TELEFONE EM CLARO.
    for (const sentinel of PHONE_SENTINELS) {
      assert.ok(!segment.includes(sentinel), `${where}: telefone em claro (${sentinel})`);
    }
    assert.ok(!PHONE_IN_CLEAR.test(segment), `${where}: padrão de telefone na saída`);
  }
}

describe('saída entregue ao provedor — invariante UNIVERSAL sobre CADA segmento', () => {
  afterEach(restoreWhatsAppConfigDefaults);

  for (const configVariant of CONFIG_VARIANTS) {
    it(`toda família × todo tamanho × todo grafema sobrevive ao contrato — ${configVariant.name}`, () => {
      for (const [key, value] of Object.entries(configVariant.overrides)) setConfigOverride(key, value);

      let checked = 0;
      for (const taintVariant of TAINT_VARIANTS) {
        for (const size of [1, 9, 60]) {
          for (const fixture of buildFixtureCatalog({ size, taint: taintVariant.taint })) {
            const label = `${fixture.name} · ${taintVariant.name} · size=${size} · ${configVariant.name}`;
            const segments = delivered({
              status: 'executed',
              responseText: PROSE_WITH_ASTRAL,
              policy: { reasonCode: null },
              result: fixture.result
            });
            assertDeliverableSegments(segments, { hardCap: configVariant.hardCap, label });
            checked += segments.length;
          }
        }
      }

      // CONTROLE POSITIVO: se a matriz parar de produzir saída (fixture quebrada, família que passou
      // a degradar em silêncio), o guarda acima passaria vacuamente. Aqui ele não passa.
      assert.ok(checked >= 400, `a matriz só produziu ${checked} segmentos — cobertura vacuosa`);
    });
  }

  it('os caminhos SEM ficha (blocked/failed/estáticos) obedecem ao mesmo contrato', () => {
    // `composeWhatsAppNotice` não passa pelo segmentador: é justamente onde o teto sumia quando o
    // config vinha inválido. NEUTRALIZAÇÃO: ler `config.whatsappReplyMaxChars` cru devolve os 9.000
    // caracteres intactos e (b) quebra.
    setConfigOverride('whatsappReplyMaxChars', 'abc');
    const longo = `${'Resposta operacional muito longa 🚛🇧🇷👨‍👩‍👧‍👦 '.repeat(300)}`;

    for (const output of [
      { status: 'blocked', responseText: longo, policy: { reasonCode: 'CHANNEL_BLOCKED' } },
      { status: 'blocked', responseText: longo, policy: { reasonCode: 'REASON_QUE_NAO_EXISTE' } },
      { status: 'failed', responseText: longo, policy: { reasonCode: 'PROVIDER_UNAVAILABLE' } },
      { status: 'failed', responseText: longo, policy: { reasonCode: 'CETESB_TIMEOUT' } },
      { status: 'responded', responseText: longo, policy: { reasonCode: null } }
    ]) {
      const segments = delivered(output, { correlationId: 'corr_1', mediaIgnored: true, textTruncated: true });
      assertDeliverableSegments(segments, { hardCap: 3500, label: `status=${output.status}` });
    }
  });

  it('teto inválido no Secret: cai no default de 3500 sem perder o teto E sem perder o texto', () => {
    // `WHATSAPP_REPLY_MAX_CHARS` digitado errado produz `0`/`NaN` (`Number(env || 3500)`). As duas
    // saídas erradas são simétricas e igualmente mudas para quem opera: teto DESLIGADO (a mensagem
    // passa dos 4096 e o provedor rejeita) ou teto NaN (a truncagem devolve só o aviso e o conteúdo
    // some). O compositor lê tudo por `readPositiveConfig` — os dois lados são afirmados aqui.
    for (const invalido of ['abc', 0, -1, null, '', Number.NaN, {}]) {
      setConfigOverride('whatsappReplyMaxChars', invalido);
      const segments = delivered({
        status: 'responded',
        responseText: `Você tem 3 MTRs hoje. ${'z'.repeat(9000)}`,
        policy: { reasonCode: null }
      });

      assert.equal(segments.length, 1, `teto ${String(invalido)}: número de bolhas`);
      assert.ok(segments[0].length <= 3500, `teto ${String(invalido)}: ${segments[0].length} caracteres`);
      assert.match(segments[0], /^Você tem 3 MTRs hoje\./, `teto ${String(invalido)}: o conteúdo foi destruído`);
      assert.match(segments[0], /foi cortada aqui/, `teto ${String(invalido)}: corte silencioso`);
    }
  });

  /**
   * A MUTAÇÃO QUE SOBREVIVEU. Ela é NEUTRA EM COMPRIMENTO: o corte continua com o mesmo tamanho, só
   * termina num high surrogate solto. Nenhuma asserção de comprimento a pega — e nenhum teste de
   * `cutAtGrapheme` a pega, porque o sítio é `truncateWhatsAppReply`, DEPOIS dele.
   *
   * A varredura de comprimento existe porque a paridade importa: num texto de emojis, metade dos
   * pontos de corte cai DENTRO de um par surrogate e a outra metade não. Um caso único tem 50% de
   * chance de passar por acidente; 48 comprimentos consecutivos, nenhuma.
   */
  it('varredura de comprimento: nenhum ponto de corte produz UTF-16 inválido', () => {
    setConfigOverride('whatsappReplyMaxChars', 400);
    setConfigOverride('whatsappSegmentSoftChars', 400);

    let cortes = 0;
    for (let extra = 0; extra < 48; extra += 1) {
      // Prosa densa em emoji: cada caractere adicional desloca a fronteira em uma unidade UTF-16.
      const prose = `${'a'.repeat(extra)}${'😀'.repeat(400)}`;
      const segments = delivered({ status: 'responded', responseText: prose, policy: { reasonCode: null } });

      for (const segment of segments) {
        assert.ok(!LONE_SURROGATE.test(segment), `lone surrogate com prefixo de ${extra} caracteres`);
        assert.ok(segment.length <= 400, `segmento com ${segment.length} caracteres (extra=${extra})`);
      }
      // Só conta como cobertura o caso em que o corte DE FATO aconteceu.
      if (segments.some((segment) => segment.includes('foi cortada aqui'))) cortes += 1;
    }

    assert.equal(cortes, 48, 'a varredura precisa exercitar a truncagem em TODOS os comprimentos');
  });

  it('a mesma varredura com a ficha no meio (o corte final é POR SEGMENTO, não pela prosa)', () => {
    setConfigOverride('whatsappReplyMaxChars', 500);
    setConfigOverride('whatsappSegmentSoftChars', 500);

    for (let extra = 0; extra < 32; extra += 1) {
      const items = repeat((index) => manifestReference(8901234500 + index, {
        // O nome do parceiro entra no orçamento do segmento com emoji na cauda.
        receiver: `${'x'.repeat(extra)}${'🚛'.repeat(30)}`
      }), 8);
      const segments = delivered({
        status: 'executed',
        responseText: `Você tem 8 MTRs hoje 😀${'!'.repeat(extra)}`,
        result: { type: 'manifest_list', data: { items, totalItems: 8 }, artifacts: [], actions: [] }
      });
      assertDeliverableSegments(segments, { hardCap: 500, label: `ficha com cauda de ${extra}` });
    }
  });

  it('plural de FORMULÁRIO não aparece em nenhuma saída da matriz', () => {
    // "documento(s)", "item(ns)", "registro(s)" são tipografia de formulário burocrático. O módulo
    // já fazia singular/plural correto em `buildDropNotice`: a inconsistência era interna à fase.
    for (const size of [1, 2, 9, 47]) {
      for (const fixture of buildFixtureCatalog({ size, taint: '' })) {
        const texto = renderedText(fixture.result);
        assert.ok(!FORM_PLURAL.test(texto), `plural de formulário em ${fixture.name} (size=${size}): ${texto}`);
      }
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════════════════════════ */
/* 2. HONESTIDADE DE CONTAGEM POR FAMÍLIA — parametrizado, um caso por família                    */
/* ══════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * Cada entrada declara: como construir a fonte, quantos itens a família exibe, como CONTAR na saída
 * e quais números a linha de escopo deve trazer.
 *
 * O par (exibidos, total) é conferido contra a FONTE — nunca contra o que o renderer devolveu em
 * `totalKnown`. Perguntar ao renderer quantos ele emitiu é deixá-lo concordar consigo mesmo.
 *
 * A mutação global (zerar `rendered` em `buildScopeLine`) morreu com 14 testes; as sondas por
 * família mostraram que a cobertura estava concentrada em `manifest_list` e `cdf_list`. Aqui, zerar
 * o `rendered` de UMA família quebra EXATAMENTE o caso dela.
 */
const COUNTING_FAMILIES = [
  {
    family: 'manifest_list',
    familyKey: 'manifest_list',
    junkHead: { manifestNumber: null, expeditionDate: '2026-08-07' },
    cap: 8,
    build: (items, totalItems) => ({
      kind: 'query',
      type: 'manifest_list',
      data: { intent: 'manifest.list_recent_top', affectedItems: items, totalItems },
      artifacts: [],
      actions: []
    }),
    item: (index) => manifestReference(8901234500 + index),
    countRendered: countItemLines,
    scopePrefix: 'Mostro',
    scopeNumbers: (rendered, total) => [rendered, total]
  },
  {
    family: 'cdf_list',
    familyKey: 'cdf_list',
    junkHead: { certificateCode: null, issuedAt: '2026-07-30' },
    cap: 8,
    build: (items, totalItems) => ({ type: 'cdf_list', data: { items, totalItems }, artifacts: [], actions: [] }),
    item: certificate,
    countRendered: countItemLines,
    scopePrefix: 'Mostro',
    scopeNumbers: (rendered, total) => [rendered, total]
  },
  {
    family: 'catalog_list',
    familyKey: 'catalog_list',
    junkHead: { nada: 1 },
    cap: 8,
    build: (items, totalItems) => ({ type: 'manifest_detail', data: { items, totalItems }, artifacts: [], actions: [] }),
    item: catalogRecord,
    countRendered: countItemLines,
    scopePrefix: 'Mostro',
    scopeNumbers: (rendered, total) => [rendered, total]
  },
  {
    family: 'job_list',
    familyKey: 'job_list',
    junkHead: { operation: null, status: null },
    // O cap de `job_list` é PRÓPRIO e menor (linha de job carrega mais texto por item).
    cap: 5,
    build: (items, totalItems) => ({ type: 'job_list', data: { items, totalItems }, artifacts: [], actions: [] }),
    item: jobRecord,
    countRendered: countItemLines,
    scopePrefix: 'Mostro',
    scopeNumbers: (rendered, total) => [rendered, total]
  },
  {
    family: 'dmr_list',
    familyKey: 'dmr_list',
    junkHead: { periodLabel: null, status: 'draft' },
    cap: 8,
    build: (items, totalItems) => ({ kind: 'query', type: 'manifest_list', data: { items, totalItems }, artifacts: [], actions: [] }),
    item: dmrRecord,
    countRendered: countItemLines,
    scopePrefix: 'Mostro',
    scopeNumbers: (rendered, total) => [rendered, total]
  },
  {
    family: 'mtr_provisorio_list',
    familyKey: 'mtr_provisorio_list',
    junkHead: { kind: 'provisorio' },
    cap: 8,
    build: (items, totalItems) => ({ kind: 'query', type: 'manifest_list', data: { items, totalItems }, artifacts: [], actions: [] }),
    item: provisorioRecord,
    countRendered: countItemLines,
    scopePrefix: 'Mostro',
    scopeNumbers: (rendered, total) => [rendered, total]
  },
  {
    family: 'partner_list',
    familyKey: 'partner_list',
    junkHead: { partnerCode: '90000' },
    cap: 8,
    build: (items, totalItems) => ({ kind: 'query', type: 'manifest_list', data: { items, totalItems }, artifacts: [], actions: [] }),
    item: partnerRecord,
    countRendered: countItemLines,
    scopePrefix: 'Mostro',
    scopeNumbers: (rendered, total) => [rendered, total]
  },
  {
    family: 'manifest_detail (cartões)',
    familyKey: 'manifest_detail',
    junkHead: { manifestNumber: null },
    cap: 3,
    build: (items, totalItems) => ({ type: 'manifest_detail', data: { manifests: items, totalItems }, artifacts: [], actions: [] }),
    item: (index) => manifestReference(8901234500 + index),
    countRendered: (text) => text.split('\n').filter((line) => /^\*MTR \d+\*$/.test(line)).length,
    scopePrefix: 'Mostro',
    // O cartão declara também quantos ficaram de fora — é o mesmo par, com a diferença explícita.
    scopeNumbers: (rendered, total) => [rendered, total, total - rendered]
  }
];

describe('honestidade de contagem — por FAMÍLIA, contra a FONTE', () => {
  for (const spec of COUNTING_FAMILIES) {
    it(`${spec.family}: o par (exibidos, total DECLARADO) bate com a fonte`, () => {
      // 37 registros na fonte (fora de qualquer cap conhecido do produtor) e um total declarado de
      // 214 — o contrato que a correção do OOM criou: a amostra é pequena, o total real é grande.
      const items = repeat(spec.item, 37);
      const text = renderedText(spec.build(items, 214));

      assert.equal(spec.countRendered(text), spec.cap, `${spec.family}: linhas exibidas ≠ cap`);

      const scope = lineStartingWith(text, spec.scopePrefix);
      assert.ok(scope, `${spec.family}: sem linha de escopo — a omissão ficou MUDA`);
      assert.deepEqual(
        numbersIn(scope),
        spec.scopeNumbers(spec.cap, 214),
        `${spec.family}: a linha de escopo não declara o par (exibidos, total): "${scope}"`
      );
    });

    it(`${spec.family}: sem total declarado, o total é a CONTAGEM DO QUE CHEGOU (nunca inventado)`, () => {
      const items = repeat(spec.item, 37);
      const text = renderedText(spec.build(items, undefined));

      assert.equal(spec.countRendered(text), spec.cap);
      const scope = lineStartingWith(text, spec.scopePrefix);
      assert.ok(scope, `${spec.family}: sem linha de escopo`);
      assert.deepEqual(numbersIn(scope), spec.scopeNumbers(spec.cap, 37), `${spec.family}: "${scope}"`);
    });

    it(`${spec.family}: item inválido não vira linha NEM entra na contagem`, () => {
      // O produtor alimenta esses campos com resposta CRUA da busca. Com metade dos itens lixo, o
      // total era calculado sobre o array cru: "Mostro os 1 mais recentes de 3 manifestos" — total
      // inventado a partir de lixo, omissão que nunca houve, na única linha cujo propósito é nunca
      // mentir sobre contagem.
      //
      // NEUTRALIZAÇÃO: voltar `resolveTotal(..., source.length)` faz a linha de escopo NASCER (o
      // total inflado passa a ser maior que o exibido) e este caso quebra em `assert.equal(…, null)`.
      const validos = repeat(spec.item, 2);
      const sujos = [validos[0], validos[1], null, undefined, 0, '', false, []];
      const text = renderedText(spec.build(sujos, undefined));

      assert.equal(spec.countRendered(text), 2, `${spec.family}: item de lixo virou linha`);
      assert.equal(
        lineStartingWith(text, spec.scopePrefix),
        null,
        `${spec.family}: declarou omissão que não houve — o total veio do array CRU`
      );
    });

    it(`${spec.family}: fonte 100% inválida não produz ficha nenhuma`, () => {
      // O primeiro item carrega o DISCRIMINANTE da família (é por ele que a forma é reconhecida) e
      // nenhum conteúdo projetável — sem isso o caso testaria a família errada.
      const result = render(spec.build([spec.junkHead, null, undefined, 0, '', false, []], undefined));

      assert.equal(result.family, spec.familyKey, `${spec.family}: a forma deixou de ser reconhecida`);
      assert.deepEqual(result.blocks, [], `${spec.family}: lixo produziu blocos`);
      assert.equal(result.totalKnown, null, `${spec.family}: total inventado a partir de lixo`);
      // Família reconhecida com ZERO blocos NÃO é degradação — mas tem de aparecer na métrica.
      assert.equal(result.degraded, false);
    });
  }

  it('grouped_manifest_list: "+ N outros grupos" conta o que sobrou da FONTE', () => {
    const grupos = repeat((index) => ({ group: `Destinadora ${index}`, total: index + 1 }), 37);
    const text = renderedText({ type: 'grouped_manifest_list', data: { grouped: grupos }, artifacts: [], actions: [] });

    // O cap de grupos é 4 (o WhatsApp não tem lista aninhada).
    assert.equal(countItemLines(text), 0, 'grupo não é item numerado');
    assert.equal(text.split('\n').filter((line) => /^\*Destinadora \d+\*:/.test(line)).length, 4);
    assert.match(text, /\+ 33 outros grupos\./);
  });

  it('grouped_manifest_list: grupo inválido não entra na conta do resto', () => {
    const grupos = [null, { group: 'A', total: 1 }, 0, { group: 'B', total: 2 }, [], { semTotal: true }];
    const text = renderedText({ type: 'grouped_manifest_list', data: { grouped: grupos }, artifacts: [], actions: [] });

    assert.equal(text.split('\n').filter((line) => /^\*[AB]\*:/.test(line)).length, 2);
    // 3 registros PROJETÁVEIS chegaram ({group,total}×2 + {semTotal}); 2 saíram → sobra 1.
    assert.match(text, /\+ 1 outro grupo\./);
    assert.ok(!/\+ 4 outros/.test(text), 'o resto foi calculado sobre o array CRU');
  });

  it('audit_timeline: a contagem agregada é dos registros REAIS, não do array cru', () => {
    const entries = [null, ...repeat(auditEntry, 3), undefined, 0, []];
    const text = renderedText({
      type: 'audit_timeline',
      data: { entityType: 'manifest', entityId: '8901234567', entries },
      artifacts: [],
      actions: []
    });

    assert.match(text, /^3 registros\.$/m);
    assert.ok(!/7 registros/.test(text), 'o lixo do array entrou na contagem');
  });

  it('audit_timeline: 1 registro fala no SINGULAR', () => {
    const text = renderedText({
      type: 'audit_timeline',
      data: { entityType: 'manifest', entityId: '8901234567', entries: [auditEntry(0)] },
      artifacts: [],
      actions: []
    });
    assert.match(text, /^1 registro\.$/m);
  });
});

/* ══════════════════════════════════════════════════════════════════════════════════════════════ */
/* 3. C1 — CONSULTA DE CDF NÃO PODE AFIRMAR QUE REGISTROU UM PEDIDO                               */
/* ══════════════════════════════════════════════════════════════════════════════════════════════ */

/** Payload EXATO de `handleCdfListByManifestSelection` (`conversation-tool-dispatcher.ts:2077-2087`). */
function cdfListByManifestSelectionResult(certificateCount = 3, manifestCount = 5) {
  return {
    kind: 'query',
    data: {
      intent: 'cdf.list_by_manifest_selection',
      manifestIds: repeat((index) => `man_${index}`, manifestCount),
      linkedHashCodes: repeat((index) => `hash_${index}`, manifestCount),
      certificates: repeat((index) => certificate(index), certificateCount)
    },
    // O handler NÃO emite `type` — a resolução tem de acontecer pelo intent.
    assistantSummary: 'Encontrei 3 certificados CDF/CDR vinculados ao conjunto de 5 manifestos.',
    jobId: null
  };
}

describe('C1 — `cdf.list_by_manifest_selection` é CONSULTA, e o texto não pode dizer o contrário', () => {
  it('a família é de LISTA e os certificados aparecem; nenhuma afirmação de pedido registrado', () => {
    // O canal é read-only justamente para NUNCA insinuar que executou algo. Afirmar "Pedido de CDF
    // registrado" para uma pergunta que só consultou manda o operador procurar no SICAT um job que
    // não existe — e descarta os certificados que a consulta ACHOU.
    const resultado = render(cdfListByManifestSelectionResult());
    const text = resultado.blocks.map((block) => block.text).join('\n');

    assert.equal(resultado.family, 'cdf_list');
    assert.equal(resultado.refusal, false);
    assert.ok(!/[Pp]edido de CDF registrado/.test(text), 'o assistente afirmou uma execução que não houve');
    assert.ok(!/acompanhamento fica no SICAT/.test(text));

    assert.match(text, /\*Seus CDFs\*/);
    assert.equal(countItemLines(text), 3, 'os certificados achados foram descartados');
    for (const index of [0, 1, 2]) {
      assert.match(text, new RegExp(`CDF ${4700 + index} - 30/07 - Aterro Sanitario XPTO`), `certificado ${index} sumiu`);
    }
  });

  it('a resolução é por NOME EXATO: consulta e ação de CDF NÃO compartilham prefixo de despacho', () => {
    // NEUTRALIZAÇÃO EXATA DO DEFEITO: voltar a `if (intent.startsWith('cdf.')) return 'cdf_action'`
    // faz a primeira e a última linha desta tabela quebrarem — as DUAS consultas do namespace.
    const esperado = [
      ['cdf.list_by_manifest_selection', 'cdf_list'],
      ['cdf.resolve_by_manifest_reference', 'cdf_reference'],
      ['cdf.generate_from_manifest_selection', 'cdf_action'],
      ['cdf.download_batch_selected', 'cdf_action']
    ];

    for (const [intent, family] of esperado) {
      const resultado = render({
        kind: intent.includes('list') || intent.includes('resolve') ? 'query' : 'action',
        data: {
          intent,
          certificates: repeat((index) => certificate(index), 2),
          sourceManifest: manifestReference(8901234567),
          execution: [{ manifestId: 'man_1', jobId: 'job_1' }],
          total: 1
        },
        artifacts: [],
        actions: [],
        jobId: 'corr_cdf'
      });
      assert.equal(resultado.family, family, `intent ${intent} resolveu para ${resultado.family}`);
    }
  });

  it('intent NOVO sob o prefixo `cdf.` não é promovido a AÇÃO por acidente', () => {
    // O mapa exato é a defesa; a rede de segurança (`kind`/`data.execution`) é o que impede que um
    // intent que o mapa ainda não conhece caia numa família de execução. Uma CONSULTA nova tem de
    // continuar sendo consulta.
    const resultado = render({
      kind: 'query',
      data: { intent: 'cdf.list_by_period_that_does_not_exist_yet', certificates: repeat((index) => certificate(index), 2) },
      artifacts: [],
      actions: []
    });

    const text = resultado.blocks.map((block) => block.text).join('\n');
    assert.ok(!/[Pp]edido de CDF registrado/.test(text));
    assert.equal(resultado.refusal, false);
  });

  it('o SINAL INVERTIDO: `manifest.cancel_recent_excluding_first` executado não vira "*Seus MTRs*"', () => {
    // A mesma classe do CDF, com o sinal trocado: o intent casa `includes('recent')` e uma EXECUÇÃO
    // sairia como lista de manifestos. NEUTRALIZAÇÃO: remover a rede `kind === 'action'` E a entrada
    // do mapa exato faz este caso quebrar.
    const text = renderedText({
      kind: 'action',
      data: {
        intent: 'manifest.cancel_recent_excluding_first',
        operation: 'manifest.cancel',
        execution: [{ manifestId: 'm1', jobId: 'j1' }, { manifestId: 'm2', jobId: 'j2' }]
      },
      artifacts: [],
      actions: [],
      jobId: 'corr_cancel'
    });

    assert.ok(!/\*Seus MTRs\*/.test(text), 'uma execução foi rotulada como lista');
    assert.match(text, /Cancelamento do MTR: 2 itens em processamento no momento da consulta\./);
  });

  it('no compositor, a consulta de CDF entrega os códigos e nenhuma promessa de execução', () => {
    // Caminho PÚBLICO — é o texto que chega ao celular, não o array de blocos.
    const texto = deliveredText({
      status: 'executed',
      responseText: 'Encontrei 3 CDFs vinculados aos 5 manifestos que você separou.',
      policy: { reasonCode: null },
      result: cdfListByManifestSelectionResult()
    });

    assert.ok(!/[Pp]edido de CDF registrado/.test(texto));
    assert.match(texto, /CDF 4700/);
    assert.match(texto, /CDF 4702/);
  });
});

/* ══════════════════════════════════════════════════════════════════════════════════════════════ */
/* 4. C4 — A CONTAGEM ANUNCIADA DE ARTEFATOS BATE COM A FONTE                                     */
/* ══════════════════════════════════════════════════════════════════════════════════════════════ */

describe('C4 — artefatos: contagem da FONTE, nomes sempre que existirem', () => {
  it('2 documentos: os DOIS nomes saem e a contagem é 2', () => {
    // O operador que perguntou QUAIS documentos existem não descobria que havia um MTR e um CDF: os
    // nomes estavam no payload, na allowlist, e eram jogados fora a partir de 2 documentos.
    const text = renderedText({
      type: 'artifact_list',
      data: { manifestId: 'man_1', items: [documentRecord(0), documentRecord(1)] },
      artifacts: [],
      actions: []
    });

    assert.match(text, /2 documentos: pronto\./);
    assert.match(text, /MTR-8901234567\.pdf/);
    assert.match(text, /CDF-2026-000431\.pdf/);
    assert.ok(!/e mais/.test(text), 'com 2 de 2 não há resto');
  });

  it('50 documentos: contagem 50, 3 nomes exibidos e "e mais 47"', () => {
    // NEUTRALIZAÇÃO: `rest = total - names.length` (em vez de `total - min(cap, total)`) dá 47 aqui
    // por coincidência, mas dá 0 quando algum `fileName` falta — por isso o caso seguinte existe.
    const text = renderedText({
      type: 'artifact_list',
      data: { manifestId: 'man_1', items: repeat(documentRecord, 50) },
      artifacts: [],
      actions: []
    });

    assert.match(text, /50 documentos: pronto\./);
    assert.equal((text.match(/\*[A-Z]+-[^*]+\.pdf\*/g) ?? []).length, 3, 'o cap de nomes é 3');
    assert.match(text, /— e mais 47\./);
  });

  it('nome ausente não encolhe o resto anunciado (o resto é do CAP, não de quantos nomes existiam)', () => {
    // Fonte com 10 documentos, mas o segundo SEM `fileName`: saem 2 nomes e o resto continua sendo
    // 7 (10 menos os 3 que couberam no cap), nunca 8 (10 menos os 2 nomes que por acaso existiam).
    const items = repeat((index) => (index === 1 ? { documentId: 'doc_1', status: 'available' } : documentRecord(index)), 10);
    const text = renderedText({ type: 'artifact_list', data: { manifestId: 'man_1', items }, artifacts: [], actions: [] });

    assert.match(text, /10 documentos: pronto\./);
    assert.equal((text.match(/\*[A-Z]+-[^*]+\.pdf\*/g) ?? []).length, 2);
    assert.match(text, /— e mais 7\./, 'o resto foi calculado sobre os nomes que por acaso existiam');
    assert.ok(!/e mais 8/.test(text));
  });

  it('não-objeto na lista não conta como documento', () => {
    const text = renderedText({
      type: 'artifact_list',
      data: { manifestId: 'man_1', items: [null, undefined, 0, '', documentRecord(0)] },
      artifacts: [],
      actions: []
    });

    assert.match(text, /Documento \*MTR-8901234567\.pdf\*: pronto\./);
    assert.ok(!/5 documentos/.test(text));
    assert.ok(!/2 documentos/.test(text));
  });

  it('PASSE TRANSVERSAL: a contagem de artefatos sobre OUTRA família também vem da fonte', () => {
    // `download_artifact`/`zip_artifact` não têm produtor: vêm por `artifacts[]` e atravessam
    // qualquer família. Uma subcontagem aqui pega carona em resposta de MTR, de CDF e de job.
    const text = renderedText({
      type: 'cdf_list',
      data: { items: repeat((index) => certificate(index), 4), totalItems: 4 },
      artifacts: repeat((index) => ({
        type: 'document',
        payload: { artifactId: `art_${index}`, fileName: `CDF-2026-0004${index}.pdf`, status: 'available' }
      }), 9),
      actions: [],
      jobId: 'corr_x'
    });

    assert.equal(countItemLines(text), 4, 'a família continua sendo a lista de CDF');
    assert.match(text, /9 documentos: pronto\./, 'a contagem de artefatos veio do subconjunto exibido');
    assert.match(text, /— e mais 6\./);
  });

  it('PASSE TRANSVERSAL: `data.items` da família NÃO é contado como documento', () => {
    // Sem a trava, uma lista de 50 CDFs vira "50 documentos" e a resposta ganha uma linha de
    // artefato inventada em cima de uma consulta que não gerou arquivo nenhum.
    const text = renderedText({
      type: 'cdf_list',
      data: { items: repeat((index) => certificate(index), 8), totalItems: 8 },
      artifacts: [],
      actions: []
    });

    assert.ok(!/documentos?:/.test(text), 'itens da família viraram "documentos"');
    assert.ok(!/ainda não consigo enviar arquivos/.test(text));
  });

  it('PASSE TRANSVERSAL: `Protocolo:` sai UMA vez só, e no fim da mensagem', () => {
    // Duas linhas de protocolo idênticas com a nota de artefato encaixada no meio lê como mensagem
    // remontada errado. NEUTRALIZAÇÃO: emitir o bloco de protocolo também no passe transversal faz
    // a contagem virar 2 e a última linha deixar de ser o protocolo.
    const segments = delivered({
      status: 'executed',
      responseText: 'Seu pacote de CDFs está sendo gerado.',
      result: {
        kind: 'action',
        data: { intent: 'cdf.generate_from_manifest_selection', execution: [{ jobId: 'j1' }], total: 1 },
        artifacts: [{ type: 'zip_bundle', payload: { artifactId: 'art_1', fileName: 'cdfs-2026-08.zip', status: 'collecting', progress: { total: 10, completed: 6 } } }],
        actions: [],
        jobId: 'job_zip1'
      }
    });

    const texto = segments.join('\n');
    assert.equal((texto.match(/^Protocolo: /gm) ?? []).length, 1, 'o protocolo saiu mais de uma vez');
    assert.match(segments[segments.length - 1].trim(), /Protocolo: job_zip1$/);
    assert.match(texto, /cdfs-2026-08\.zip/);
  });
});

/* ══════════════════════════════════════════════════════════════════════════════════════════════ */
/* 5. DEMAIS ACHADOS CORRIGIDOS                                                                    */
/* ══════════════════════════════════════════════════════════════════════════════════════════════ */

describe('ordenação declarada na linha de escopo — afirmação, não adjetivo', () => {
  it('"mais recentes" SÓ onde o produtor ordena por data', () => {
    // Dizer "os 8 mais recentes de 120" faz o operador concluir que os 112 omitidos são mais
    // ANTIGOS. Em catálogo (ordenado por descrição) e em `jobsSearch` (ordem não declarada) isso é
    // falso — mentira produzida pela própria camada de honestidade.
    const comRecencia = [
      { nome: 'manifest_list', result: { type: 'manifest_list', data: { items: repeat((index) => manifestReference(8901234500 + index), 37), totalItems: 120 }, artifacts: [], actions: [] } },
      { nome: 'cdf_list', result: { type: 'cdf_list', data: { items: repeat(certificate, 37), totalItems: 120 }, artifacts: [], actions: [] } }
    ];
    const semRecencia = [
      { nome: 'catalog_list', result: { type: 'manifest_detail', data: { items: repeat(catalogRecord, 37), totalItems: 120 }, artifacts: [], actions: [] } },
      { nome: 'job_list', result: { type: 'job_list', data: { items: repeat(jobRecord, 37), totalItems: 120 }, artifacts: [], actions: [] } },
      { nome: 'dmr_list', result: { kind: 'query', type: 'manifest_list', data: { items: repeat(dmrRecord, 37), totalItems: 120 }, artifacts: [], actions: [] } },
      { nome: 'mtr_provisorio_list', result: { kind: 'query', type: 'manifest_list', data: { items: repeat(provisorioRecord, 37), totalItems: 120 }, artifacts: [], actions: [] } },
      { nome: 'partner_list', result: { kind: 'query', type: 'manifest_list', data: { items: repeat(partnerRecord, 37), totalItems: 120 }, artifacts: [], actions: [] } }
    ];

    for (const caso of comRecencia) {
      const scope = lineStartingWith(renderedText(caso.result), 'Mostro');
      assert.match(scope, /mais recentes/, `${caso.nome}: perdeu a ordenação que PODE afirmar`);
    }
    for (const caso of semRecencia) {
      const scope = lineStartingWith(renderedText(caso.result), 'Mostro');
      assert.ok(scope, `${caso.nome}: sem linha de escopo`);
      assert.ok(!/mais recentes/.test(scope), `${caso.nome}: afirmou recência que não pode verificar — "${scope}"`);
      assert.match(scope, /^Mostro \d+ de \d+ /, `${caso.nome}: "${scope}"`);
    }
  });

  it('concordância com 1 item exibido: nunca "Mostro os 1 mais recentes"', () => {
    const items = [null, null, manifestReference(8901234567)];
    const text = renderedText({ type: 'manifest_list', data: { items, totalItems: 90 }, artifacts: [], actions: [] });
    const scope = lineStartingWith(text, 'Mostro');

    assert.match(scope, /^Mostro o mais recente de 90 manifestos\.$/);
    assert.ok(!/os 1 /.test(scope));
  });
});

describe('DMR, MTR provisório e parceiro têm nome PRÓPRIO — nomear o documento errado é falha fiscal', () => {
  it('`list_dmr` não vira "*Seus MTRs*" nem imprime id interno', () => {
    // Uma DMR (Declaração de Movimentação de Resíduos) rotulada como MTR é documento fiscal ERRADO;
    // e a affordance mandava o operador digitar de volta um id de 30 caracteres.
    const text = renderedText({
      kind: 'query',
      type: 'manifest_list',
      data: { items: [dmrRecord(0), dmrRecord(1, { status: 'consolidating' })], total: 2 },
      artifacts: [],
      actions: []
    });

    assert.match(text, /\*Suas DMRs\*/);
    assert.ok(!/MTR/.test(text), 'a DMR foi chamada de MTR');
    assert.ok(!/dmr_3f2a91b0/.test(text), 'id interno no lugar do rótulo humano');
    assert.match(text, /1\) DMR 01\/2026 - Bloqueado por dado externo/);
    assert.match(text, /2\) DMR 02\/2026 - Em execução/);
    assert.ok(!/Pending Review|Consolidating/.test(text), 'status em inglês Title-Case');
  });

  it('`list_mtr_provisorio` usa o rótulo de provisório e status em pt-BR', () => {
    const text = renderedText({
      kind: 'query',
      type: 'manifest_list',
      data: { items: [provisorioRecord(0), provisorioRecord(1, { status: 'awaiting_remote' })], totalItems: 2 },
      artifacts: [],
      actions: []
    });

    assert.match(text, /\*Seus MTRs provisórios\*/);
    assert.match(text, /MTR provisório PROV-1000 - Em execução/);
    assert.match(text, /MTR provisório PROV-1001 - Aguardando confirmação remota/);
    assert.ok(!/mtrp_aa11/.test(text), 'id interno vazou');
    assert.ok(!/Submitting|Awaiting Remote/.test(text));
  });

  it('`search_partners` produz ficha de PARCEIRO e nunca o CNPJ', () => {
    // Antes: `projectManifestRow` devolvia `null` para todos e a ficha saía VAZIA — lacuna invisível
    // em produção, porque `degraded` continuava `false`.
    const resultado = render({
      kind: 'query',
      type: 'manifest_list',
      data: { items: [partnerRecord(0), partnerRecord(1)], totalItems: 2 },
      artifacts: [],
      actions: []
    });
    const text = resultado.blocks.map((block) => block.text).join('\n');

    assert.equal(resultado.family, 'partner_list');
    assert.match(text, /\*Parceiros encontrados\*/);
    assert.match(text, /1\) Destinadora Ambiental 0 Ltda \(90000\)/);
    assert.ok(!text.includes('12.345.678/0001-99'), 'CNPJ não está em allowlist nenhuma');
    assert.ok(!/\*Seus MTRs\*/.test(text));
  });
});

describe('linha de manifesto — número humano ou nada', () => {
  it('`memory.list_asked_manifests` (só `manifestId`) falha FECHADA: zero blocos', () => {
    // O payload real (`conversation-tool-dispatcher.ts:2453-2458`) só tem `manifestId`. Imprimir
    // `MTR man_3` faz o operador ler um id interno como número de MTR e digitar de volta algo que
    // não resolve. Sem número e sem hash, a linha NÃO SAI e a prosa segue sozinha.
    const resultado = render({
      kind: 'query',
      data: {
        intent: 'memory.list_asked_manifests',
        source: 'conversation_memory',
        manifestIds: ['man_1', 'man_2', 'man_3'],
        affectedItems: [{ manifestId: 'man_1' }, { manifestId: 'man_2' }, { manifestId: 'man_3' }]
      },
      artifacts: [],
      actions: []
    });

    assert.equal(resultado.family, 'manifest_list');
    assert.deepEqual(resultado.blocks, []);
  });

  it('rascunho sem número não é rotulado como MTR e não recebe a affordance de digitar', () => {
    // `toManifestListItem` preserva `id` e deixa `manifestNumber: null` — é o caso NORMAL de
    // rascunho/provisório. NEUTRALIZAÇÃO: devolver `manifestId`/`id` ao `pickIdentifier` faz a
    // primeira asserção quebrar.
    const items = [
      manifestReference(8901234567),
      manifestReference(0, { manifestNumber: null, externalHashCode: 'a1b2c3d4e5f60718293a4b5c6d7e8f90', statusLabel: 'Rascunho' })
    ];
    const text = renderedText({ type: 'manifest_list', data: { items, totalItems: 2 }, artifacts: [], actions: [] });

    assert.match(text, /1\) MTR 8901234567/);
    assert.match(text, /2\) Rascunho sem número \(ainda não enviado à CETESB\)/);
    assert.ok(!/MTR a1b2c3d4/.test(text), 'hash impresso como se fosse número de MTR');
    // A affordance existe (há UM item numerado) e cita justamente o numerado.
    assert.match(text, /Me manda o número, ex\.: \*MTR 8901234567\*/);
  });

  it('lista só de rascunhos NÃO oferece "me manda o número"', () => {
    const items = repeat((index) => manifestReference(0, {
      manifestNumber: null,
      externalHashCode: `hash_rascunho_${index}`,
      statusLabel: 'Rascunho'
    }), 3);
    const text = renderedText({ type: 'manifest_list', data: { items, totalItems: 3 }, artifacts: [], actions: [] });

    assert.equal(countItemLines(text), 3);
    assert.ok(!/Me manda o número/.test(text), 'mandou digitar de volta algo que não existe');
  });
});

describe('operation_progress — os dois produtores reais emitem ficha', () => {
  it('`get_operations_overview` vira contagens em pt-BR, não silêncio', () => {
    // A família estava coberta no papel e VAZIA na prática: `readProgress` exigia `{completed,total}`
    // e nenhum dos dois produtores tem esses campos.
    const resultado = render({
      type: 'operation_progress',
      data: {
        generatedAt: '2026-08-07T12:00:00Z',
        jobs: { queued: 4, running: 2, retry_wait: 1, dlq_total: 5 },
        manifests: {},
        accounts: {},
        sessions: {},
        recentDlq: repeat((index) => ({ jobId: `job_${index}` }), 5),
        recentJobs: [],
        recentErrors: []
      },
      artifacts: [],
      actions: []
    });
    const text = resultado.blocks.map((block) => block.text).join('\n');

    assert.ok(resultado.blocks.length > 0, 'a família emitiu ZERO blocos');
    assert.match(text, /\*Como está a operação\*/);
    assert.match(text, /^7 pedidos na fila no momento da consulta\.$/m);
    assert.match(text, /^5 pedidos parados esperando alguém revisar\.$/m);
  });

  it('`get_dashboard_overview` usa `activeJobs.total`', () => {
    const text = renderedText({
      type: 'operation_progress',
      data: { health: { status: 'ok' }, workers: {}, activeJobs: { total: 3, items: [] }, performance: {} },
      artifacts: [],
      actions: []
    });

    assert.match(text, /^3 pedidos em andamento no momento da consulta\.$/m);
  });

  it('overview de operação PARADA fala no singular e sem número inventado', () => {
    const text = renderedText({
      type: 'operation_progress',
      data: { jobs: { queued: 1, running: 0, retry_wait: 0, dlq_total: 1 } },
      artifacts: [],
      actions: []
    });

    assert.match(text, /^1 pedido na fila no momento da consulta\.$/m);
    assert.match(text, /^1 pedido parado esperando alguém revisar\.$/m);
  });

  it('payload sem NENHUM contador reconhecível não inventa zero — e a lacuna vira MÉTRICA', () => {
    // Família reconhecida com ficha vazia é a lacuna INVISÍVEL: `degraded` fica `false`, a prosa sai
    // sozinha e nada é contado. NEUTRALIZAÇÃO: remover `countEmptyFamily` faz este caso quebrar.
    resetWhatsAppRenderCountersForTests();
    const resultado = render({ type: 'operation_progress', data: { health: { status: 'ok' } }, artifacts: [], actions: [] });

    assert.deepEqual(resultado.blocks, []);
    assert.equal(resultado.degraded, false);
    assert.equal(readWhatsAppRenderEmptyFamilyCounters().operation_progress, 1);
  });

  it('a métrica de família vazia guarda a FAMÍLIA, nunca o payload', () => {
    resetWhatsAppRenderCountersForTests();
    render({ type: 'job_list', data: { items: [null, null], segredo: 'sk-abc123' }, artifacts: [], actions: [] });
    render({ type: 'job_list', data: { items: [] }, artifacts: [], actions: [] });

    const contadores = readWhatsAppRenderEmptyFamilyCounters();
    assert.equal(contadores.job_list, 2);
    assert.ok(!Object.keys(contadores).some((chave) => chave.includes('sk-abc123')));
  });
});

describe('cabeçalho de auditoria — só número humano vira título', () => {
  it('UUID interno NÃO entra no título', () => {
    const text = renderedText({
      type: 'audit_timeline',
      data: { entityType: 'manifest', entityId: 'a1b2c3d4-5e6f-7890-abcd-ef1234567890', entries: [auditEntry(0)], correlationId: 'corr_1' },
      artifacts: [],
      actions: []
    });

    assert.match(text, /\*Histórico deste registro\*/);
    assert.ok(!/a1b2c3d4/.test(text), 'id interno truncado como título');
    assert.match(text, /Protocolo: corr_1/, 'o handle de suporte continua saindo — uma vez');
  });

  it('`man_0011223344` também não é número humano', () => {
    const text = renderedText({
      type: 'audit_timeline',
      data: { entityType: 'manifest', entityId: 'man_0011223344', entries: [auditEntry(0)] },
      artifacts: [],
      actions: []
    });
    assert.match(text, /\*Histórico deste registro\*/);
    assert.ok(!/man_0011223344/.test(text));
  });

  it('número de MTR de 10 dígitos com `entityType: manifest` VIRA título (controle positivo)', () => {
    const text = renderedText({
      type: 'audit_timeline',
      data: { entityType: 'manifest', entityId: '8901234567', entries: [auditEntry(0)] },
      artifacts: [],
      actions: []
    });
    assert.match(text, /\*Histórico do MTR 8901234567\*/);
  });

  it('10 dígitos com `entityType` de OUTRA coisa não vira "MTR"', () => {
    const text = renderedText({
      type: 'audit_timeline',
      data: { entityType: 'job', entityId: '8901234567', entries: [auditEntry(0)] },
      artifacts: [],
      actions: []
    });
    assert.match(text, /\*Histórico deste registro\*/);
  });
});

describe('família de erro — o próximo passo diz o que FAZER', () => {
  it('ação primeiro, alternativa depois', () => {
    // A única família cujo propósito é dizer o que fazer não dizia: "Se continuar, o SICAT no
    // navegador está funcionando normalmente" não tem sujeito e não é uma ação.
    const text = renderedText({
      type: 'error_explanation',
      data: { message: 'O sistema da CETESB não respondeu a tempo.', reasonCode: 'REMOTE_TIMEOUT', correlationId: 'corr_c31f77' },
      artifacts: [],
      actions: []
    });

    const acao = text.indexOf('me pergunte de novo');
    const alternativa = text.indexOf('Se for urgente');
    assert.ok(acao > 0, 'o texto não diz o que fazer');
    assert.ok(alternativa > acao, 'a alternativa veio antes da ação');
    assert.ok(!/^Se continuar,/m.test(text), 'frase sem antecedente e sem ação');
    assert.ok(!text.includes('REMOTE_TIMEOUT'));
  });
});

describe('higiene de valor — a classe dos invisíveis, por CODE POINT', () => {
  /** Cada um destes sobrevivia à classe anterior, verificado por execução. */
  const INVISIVEIS = [
    ['U+00AD SOFT HYPHEN', '­'],
    ['U+061C ARABIC LETTER MARK', '؜'],
    ['U+180E MONGOLIAN VOWEL SEPARATOR', '᠎'],
    ['U+2065 (não atribuído, invisível)', '⁥'],
    ['U+206A INHIBIT SYMMETRIC SWAPPING', '⁪'],
    ['U+206F NOMINAL DIGIT SHAPES', '⁯'],
    ['U+E0041 TAG LATIN A', '\u{E0041}'],
    ['U+E007F CANCEL TAG', '\u{E007F}'],
    // Os que a classe original já cobria — controle negativo da tabela.
    ['U+200B ZERO WIDTH SPACE', '​'],
    ['U+200E LEFT-TO-RIGHT MARK', '‎'],
    ['U+202E RIGHT-TO-LEFT OVERRIDE', '‮'],
    ['U+2066 LEFT-TO-RIGHT ISOLATE', '⁦'],
    ['U+FEFF ZERO WIDTH NO-BREAK SPACE', '﻿']
  ];

  it('NENHUM code point invisível sobrevive à higiene de valor', () => {
    // Um único caractere invisível inverte VISUALMENTE um número de MTR na tela do celular — é
    // falsificação de conteúdo fiscal, não sujeira estética. E as TAGs ainda consomem orçamento de
    // caracteres sem aparecer.
    for (const [nome, ponto] of INVISIVEIS) {
      const limpo = sanitizeRenderedValue(`A${ponto}B`);
      assert.equal(limpo, 'AB', `${nome} sobreviveu: ${[...limpo].map((c) => c.codePointAt(0).toString(16)).join(' ')}`);
    }
  });

  it('nenhum deles atravessa o renderer num campo de texto livre', () => {
    // O vetor real são os campos de CADASTRO da CETESB (gerador, transportador, destinador) — o
    // conteúdo lido na cabine do caminhão.
    for (const [nome, ponto] of INVISIVEIS) {
      const text = renderedText({
        type: 'detail',
        data: manifestReference(8901234567, { generator: `ACME${ponto} 123 456 Ltda` }),
        artifacts: [],
        actions: []
      });
      assert.ok(!text.includes(ponto), `${nome} chegou ao texto entregue`);
      assert.match(text, /\*Gerador:\* ACME 123 456 Ltda/, `${nome}: o campo útil sumiu junto`);
    }
  });
});

describe('pré-corte antes da higiene — o custo escala com o TETO, não com o payload', () => {
  it('campo de 20 MB não vira segundos de CPU no worker', () => {
    // `sanitizeConversationText` faz ~16 varreduras COM ALOCAÇÃO sobre a string INTEIRA para depois
    // capar em 60 caracteres. Medido antes: 20 MB → 567 ms POR CAMPO. O cap de ITENS limita a
    // quantidade de campos, não o tamanho de cada um.
    const gigante = 'A'.repeat(20 * 1024 * 1024);
    const items = repeat(() => manifestReference(8901234567, {
      generator: gigante,
      carrier: gigante,
      receiver: gigante
    }), 3);

    const inicio = Date.now();
    const text = renderedText({ type: 'manifest_detail', data: { manifests: items }, artifacts: [], actions: [] });
    const duracao = Date.now() - inicio;

    // 9 campos × 567 ms = ~5 s no comportamento anterior. O teto aqui é generoso de propósito: o
    // proxy é "não varreu a árvore inteira", não um benchmark.
    assert.ok(duracao < 1500, `renderização levou ${duracao}ms — sinal de varredura do payload inteiro`);
    assert.match(text, /\*Gerador:\* A+…/, 'o campo continua saindo, capado e COM marca de corte');
  });

  it('o corte do pré-corte nunca é silencioso', () => {
    const text = renderedText({
      type: 'detail',
      data: manifestReference(8901234567, { generator: `${'B'.repeat(5_000_000)}` }),
      artifacts: [],
      actions: []
    });
    const linha = lineStartingWith(text, '*Gerador:*');

    assert.ok(linha.endsWith('…'), 'truncagem silenciosa é a falha que a escada de honestidade elimina');
    assert.ok(linha.length <= '*Gerador:* '.length + 60);
  });
});

/* ══════════════════════════════════════════════════════════════════════════════════════════════ */
/* 6. LIVRO-RAZÃO — o texto do operador não pode ficar residente na tabela `jobs`                 */
/* ══════════════════════════════════════════════════════════════════════════════════════════════ */

function installTurnHarness(options = {}) {
  const state = { turnCalls: 0, sends: [], patches: [] };

  setWhatsAppTurnDependenciesForTests({
    findLink: async (id) => ({ id, userId: 'usr_1', externalUserKey: '5511987654321', verificationStatus: 'verified' }),
    resolveChannelPrincipal: async (input) => ({ channel: 'whatsapp', userId: input.userId, permissionKeys: [] }),
    processTurn: async () => {
      state.turnCalls += 1;
      return options.turnOutput ?? { status: 'responded', responseText: 'Você tem 3 MTRs hoje.', policy: { reasonCode: null } };
    },
    resolveProvider: () => (options.providerDisabled ? null : {
      name: 'meta',
      async sendText(input) {
        state.sends.push(input);
        return { providerMessageId: `wamid.${state.sends.length}` };
      }
    }),
    insertAuditEntry: async () => {},
    now: () => Date.now()
  });

  const patchJobPayload = async (job, patch) => {
    state.patches.push(patch);
    Object.assign(job.payload, patch);
  };

  return { state, patchJobPayload };
}

function inboundJob(overrides = {}) {
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

function multiSegmentTurnOutput() {
  const items = repeat((index) => manifestReference(9800000000 + index), 40);
  return {
    status: 'executed',
    responseText: 'Você tem 40 MTRs no período.',
    policy: { reasonCode: null },
    result: {
      kind: 'query',
      type: 'manifest_list',
      data: { intent: 'manifest.list_recent_top', affectedItems: items, totalItems: 40 },
      artifacts: [],
      actions: []
    }
  };
}

describe('privacidade do livro-razão — os DOIS retornos que podem ocorrer com segmentos persistidos', () => {
  beforeEach(() => {
    setWhatsAppTurnDependenciesForTests(null);
    resetWhatsAppExpiredNoticeThrottleForTests();
  });

  afterEach(() => {
    restoreWhatsAppConfigDefaults();
    setWhatsAppTurnDependenciesForTests(null);
    resetWhatsAppExpiredNoticeThrottleForTests();
  });

  it('`already_answered` zera `replySegments` E `segmentMessageIds`', async () => {
    // `finishJob` faz MERGE (`payload: { ...job.payload, ...patch }`), não rewrite. Numa resposta de
    // N>=2 que morreu entre o último `sendText` e o `finishJob` (requeue por WORKER_CLAIM_STALE), o
    // job concluiria como `succeeded` com os segmentos residentes em `jobs` — carregando nome de
    // gerador, transportador, destinador, motorista e placa.
    //
    // NEUTRALIZAÇÃO: remover as duas chaves do patch faz `undefined !== null` e o caso quebra.
    const harness = installTurnHarness();
    const job = inboundJob({
      replySentAt: new Date().toISOString(),
      replySegments: ['Parte 1 com Jose Carlos de Souza', 'Parte 2'],
      segmentMessageIds: ['wamid.1', 'wamid.2']
    });

    const result = await runWhatsAppInboundTurn({ job, patchJobPayload: harness.patchJobPayload });

    assert.equal(result.outcome, 'whatsapp_inbound_already_answered');
    assert.equal(result.patch.replySegments, null, 'os segmentos ficariam residentes no MERGE');
    assert.equal(result.patch.segmentMessageIds, null);
    assert.equal(result.patch.replyText, null);
    assert.equal(result.patch.text, null);
    assert.equal(harness.state.sends.length, 0, 'nada foi reenviado');
  });

  it('`channel_disabled` (canal desligado DEPOIS de persistir) também zera os dois campos', async () => {
    // Este ramo roda DEPOIS de C6 ter persistido os segmentos — é a segunda das duas únicas saídas
    // que podem ocorrer com `replySegments` já no payload.
    setConfigOverride('whatsappSegmentSoftChars', 400);
    const harness = installTurnHarness({ turnOutput: multiSegmentTurnOutput(), providerDisabled: true });
    const job = inboundJob();

    const result = await runWhatsAppInboundTurn({ job, patchJobPayload: harness.patchJobPayload });

    assert.equal(result.outcome, 'whatsapp_inbound_channel_disabled');
    // CONTROLE POSITIVO: os segmentos DE FATO chegaram a existir no payload antes do retorno —
    // sem isso o caso passaria vacuamente com qualquer patch.
    assert.equal(job.payload.replySegments.length, 2);
    assert.ok(job.payload.replySegments.join(' ').includes('MTR 98000000'));
    assert.equal(result.patch.replySegments, null, 'texto do operador ficaria residente em `jobs`');
    assert.equal(result.patch.segmentMessageIds, null);
    assert.equal(result.patch.replyText, null);
  });

  it('os segmentos entregues ao provedor são exatamente os que foram persistidos', async () => {
    // ESPIÃO DE ARGUMENTO, não double que reimplementa: o que o provedor recebeu é comparado com o
    // que o livro-razão gravou. Re-renderizar no envio entregaria um segmento 2 incoerente com o 1.
    setConfigOverride('whatsappSegmentSoftChars', 400);
    const harness = installTurnHarness({ turnOutput: multiSegmentTurnOutput() });
    const job = inboundJob();

    const preparado = [];
    const espiao = async (target, patch) => {
      if (Array.isArray(patch.replySegments)) preparado.push(...patch.replySegments);
      return harness.patchJobPayload(target, patch);
    };

    await runWhatsAppInboundTurn({ job, patchJobPayload: espiao });

    assert.equal(preparado.length, 2);
    assert.deepEqual(harness.state.sends.map((send) => send.text), preparado);
    for (const send of harness.state.sends) {
      assert.ok(!LONE_SURROGATE.test(send.text));
      assert.ok(send.text.length <= 3500);
    }
  });
});
