/**
 * Renderer de `ConversationStructuredResult` -> BLOCOS DE TEXTO para o WhatsApp (fase 4).
 *
 * PURO. Recebe orcamento e relogio por parametro; NAO importa `lib/config`, repositorio, dispatcher
 * nem `conversation-service`. Isso mata a classe inteira de "renderer que consulta banco para
 * enfeitar texto" e torna o teste deterministico sem monkeypatch.
 *
 * +- REGRAS QUE VEM DE INCIDENTE, NAO DE TEORIA ----------------------------------------------+
 * | 1. `JSON.stringify` EH PROIBIDO neste arquivo - inclusive em log de erro. Foi serializacao |
 * |    multipla que estourou o heap deste modulo (OOM -> CrashLoop). Igualmente proibido rodar |
 * |    `sanitizeConversationValue` sobre `data` cru: ele desce 8 niveis e ALOCA UMA COPIA da   |
 * |    arvore inteira - seria reintroduzir o vetor de OOM dentro da propria defesa.            |
 * | 2. CAP ANTES DE PROJETAR: `items.slice(0, cap).map(project)`, NUNCA o contrario. Quatro    |
 * |    tipos nao tem cap algum no produtor (`audit_timeline.entries`, `job_list.items`,        |
 * |    `artifact_list.items`, `manifest_list.items`) - este eh o unico ponto de corte.         |
 * | 3. ALLOWLIST DE CAMPOS, NUNCA DENYLIST. `externalSnapshot`, `storagePath`,                 |
 * |    `links.downloadUrl`, `sanitizedBody`, `integrationAccountId`, `selectionSnapshot`,      |
 * |    `payloadPreview` nao saem porque NAO ESTAO EM LISTA NENHUMA. Uma denylist falha ABERTA  |
 * |    no primeiro campo novo do dispatcher.                                                   |
 * | 4. PROFUNDIDADE MAXIMA 1 ABAIXO DE `data`, SEM RECURSAO. Le-se `data.items[i].campo` e     |
 * |    `data.items[i].receiver.description`; nada mais fundo.                                   |
 * | 5. NUNCA INVENTAR UM TOTAL. `totalItems` so vale se for inteiro seguro e plausivel; senao  |
 * |    a frase eh "pode haver mais alem destes", jamais "N de M".                              |
 * +-------------------------------------------------------------------------------------------+
 *
 * POR QUE NAO EH UM `switch` DE 21 BRACOS. Tres fatos do contrato real: (a) `inferTypeFromPayload`
 * faz `return explicitType as ConversationResultType` - cast NAO CHECADO, entao qualquer string vira
 * "tipo" em runtime; (b) `withNormalizedShape` injeta `'list'|'detail'|'action'|'status'`, FORA da
 * uniao, e sao justamente os 5 tools mais usados; (c) tres dos "21 tipos" (`download_artifact`,
 * `zip_artifact`, `action_confirmation`) nao tem produtor - sao canais paralelos (`artifacts[]`,
 * `actions[]`) que atravessam qualquer familia. Por isso: CASCATA de intent -> tipo (com aliases) ->
 * FORMA do payload, e um `default` honesto que emite ZERO blocos.
 */

import { resolveManifestSituationLabelPtBr } from '../../conversation-status-vocabulary.js';
import {
  describeDmrOperationalStatus,
  describeJobOperationalStatus,
  describeMtrProvisorioOperationalStatus
} from '../../../../lib/operational-status.js';
import {
  FIELD_CAPS,
  buildBlock,
  coerceIdentifierText,
  coerceScalarText,
  type RenderBlock
} from './whatsapp-render-blocks.js';

type LooseRecord = Record<string, unknown>;

export type RenderOptions = {
  /** Itens de lista exibidos. Roda ANTES de qualquer projecao. */
  itemCap: number;
  /** Cartoes (detalhe multi-linha) exibidos. */
  cardCap: number;
  /** Relogio INJETADO - nenhum `Date.now()` dentro deste modulo. */
  nowMs: number;
  timeZone?: string;
};

export type RenderedResult = {
  blocks: RenderBlock[];
  /** Quantos itens o RENDERER descartou. */
  omittedItems: number;
  /** Total confiavel e VALIDADO. `null` = "nao sei, e nao invento". */
  totalKnown: number | null;
  /** O PRODUTOR ja havia cortado (`cdf_list.truncated`, cap de `top`, `enforceSafeBatchLimit`). */
  producerTruncated: boolean;
  /** Metrica/log. NUNCA vai para o texto. */
  family: string;
  /** Familia de acao -> o compositor descarta a prosa. */
  refusal: boolean;
  /** Tipo/forma irreconhecivel -> zero blocos, a prosa sai sozinha (comportamento de hoje). */
  degraded: boolean;
};

const DEFAULT_TIME_ZONE = 'America/Sao_Paulo';

/** Total absurdo eh sinal de payload adversarial ou de bug do produtor - nao de operacao real. */
const MAX_PLAUSIBLE_TOTAL = 10_000_000;

/** Caps conhecidos a montante. Bater EXATAMENTE neles sem total valido = "pode haver mais". */
const KNOWN_PRODUCER_CAPS = new Set([10, 20, 25, 50, 100, 200]);

/* ──────────────────────────────────────────────────────────────────────────────────────────────
 * Metrica de familia desconhecida.
 *
 * Existe para que a fase 5/6 descubra em PRODUCAO um `type` novo emitido pelo dispatcher. Guarda
 * apenas a CHAVE (o valor de `type`), nunca o payload - logar `data` eh por onde um telefone
 * entraria neste modulo.
 * ────────────────────────────────────────────────────────────────────────────────────────────── */
const unknownFamilyCounters = new Map<string, number>();
const UNKNOWN_FAMILY_MAX_KEYS = 100;

function countUnknownFamily(typeKey: string): void {
  const key = typeKey || '(sem tipo)';
  if (!unknownFamilyCounters.has(key) && unknownFamilyCounters.size >= UNKNOWN_FAMILY_MAX_KEYS) return;
  unknownFamilyCounters.set(key, (unknownFamilyCounters.get(key) ?? 0) + 1);
}

export function readWhatsAppRenderUnknownFamilyCounters(): Record<string, number> {
  return Object.fromEntries(unknownFamilyCounters);
}

/* ──────────────────────────────────────────────────────────────────────────────────────────────
 * Metrica de FAMILIA RECONHECIDA COM ZERO BLOCOS.
 *
 * O contador de familia desconhecida so enxerga `type` novo. A lacuna que ele NAO enxerga eh a
 * pior: familia reconhecida, `degraded: false`, e ficha vazia — a prosa sai sozinha e a falha eh
 * INVISIVEL em producao. Foi assim que `operation_progress` ficou coberto no papel e vazio na
 * pratica para os seus dois unicos produtores, e assim que um campo renomeado no dispatcher faria
 * uma linha SUMIR em silencio. Aqui a chave eh o NOME DA FAMILIA (constante nossa), nunca o payload.
 * ────────────────────────────────────────────────────────────────────────────────────────────── */
const emptyFamilyCounters = new Map<string, number>();

function countEmptyFamily(family: string): void {
  emptyFamilyCounters.set(family, (emptyFamilyCounters.get(family) ?? 0) + 1);
}

export function readWhatsAppRenderEmptyFamilyCounters(): Record<string, number> {
  return Object.fromEntries(emptyFamilyCounters);
}

export function resetWhatsAppRenderCountersForTests(): void {
  unknownFamilyCounters.clear();
  emptyFamilyCounters.clear();
}

/* ── utilitarios de leitura (sem recursao, sem copia de arvore) ──────────────────────────────── */

function toRecord(value: unknown): LooseRecord {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as LooseRecord;
  return {};
}

function toArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function firstArray(...candidates: unknown[]): unknown[] {
  for (const candidate of candidates) {
    if (Array.isArray(candidate) && candidate.length > 0) return candidate;
  }
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
  }
  return [];
}

/**
 * Normalização para DECIDIR (chave de mapa, comparação de tipo/intent) — nunca para EMITIR.
 *
 * Separada de `coerceScalarText` porque aquela remove `_` dos valores (higiene de formatação do
 * WhatsApp) e isso destruiria justamente as chaves do contrato: `job_card` viraria `jobcard`,
 * `zip_bundle` viraria `zipbundle`, `confirm_tool_execution` viraria `confirmtoolexecution` — e o
 * despacho cairia todo no `default`. Foi exatamente esse o defeito encontrado no primeiro ensaio.
 */
function readKeyToken(value: unknown, maxChars = 64): string {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  return String(value).trim().toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, maxChars);
}

function readString(record: LooseRecord, key: string, cap: number): string | null {
  return coerceScalarText(record[key], cap);
}

/** Allowlist de campos que a pessoa precisa DIGITAR de volta — preserva `_`, `-`, `.`. */
function pickIdentifier(record: LooseRecord, keys: string[], cap: number): string | null {
  for (const key of keys) {
    const value = coerceIdentifierText(record[key], cap);
    if (value) return value;
  }
  return null;
}

/** Primeiro campo nao-vazio da allowlist. A ORDEM eh o contrato (numero humano antes de id opaco). */
function pickString(record: LooseRecord, keys: string[], cap: number): string | null {
  for (const key of keys) {
    const value = readString(record, key, cap);
    if (value) return value;
  }
  return null;
}

/**
 * `receiver` eh string em manifesto e objeto `{partnerCode, description}` em CDF. Um nivel abaixo -
 * o limite de profundidade declarado no cabecalho.
 */
function readPartnerName(value: unknown, cap: number): string | null {
  const direct = coerceScalarText(value, cap);
  if (direct) return direct;
  const record = toRecord(value);
  return pickString(record, ['description', 'name', 'corporateName', 'partnerCode'], cap);
}

/* ── datas: parse estrito, fuso EXPLICITO ─────────────────────────────────────────────────────── */

const ISO_DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const BR_DATE = /^(\d{2})\/(\d{2})\/(\d{4})/;

type DateParts = { day: string; month: string; year: string; hour: string | null; minute: string | null };

/**
 * Data-only (`2026-08-05`) NAO passa por `Date.parse` + fuso: `Date.parse` a le como meia-noite UTC
 * e a formatacao em America/Sao_Paulo (UTC-3) devolveria o DIA ANTERIOR. Erro de correcao, nao de
 * estetica - e num documento fiscal a data errada eh o defeito mais caro que este renderer poderia
 * produzir.
 */
function extractDateParts(value: unknown, timeZone: string): DateParts | null {
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (!raw) return null;

  const isoOnly = ISO_DATE_ONLY.exec(raw);
  if (isoOnly) {
    const [, year, month, day] = isoOnly;
    if (year && month && day) return { year, month, day, hour: null, minute: null };
  }

  const br = BR_DATE.exec(raw);
  if (br) {
    const [, day, month, year] = br;
    if (year && month && day) return { year, month, day, hour: null, minute: null };
  }

  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) return null;

  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('pt-BR', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).formatToParts(new Date(ms));
  } catch {
    return null;
  }

  const read = (type: string): string | null => parts.find((part) => part.type === type)?.value ?? null;
  const year = read('year');
  const month = read('month');
  const day = read('day');
  if (!year || !month || !day) return null;
  return { year, month, day, hour: read('hour'), minute: read('minute') };
}

/** `dd/MM`. Data invalida OMITE a linha - nunca imprime `Invalid Date` nem o valor cru. */
function formatShortDate(value: unknown, timeZone: string): string | null {
  const parts = extractDateParts(value, timeZone);
  return parts ? `${parts.day}/${parts.month}` : null;
}

function formatFullDate(value: unknown, timeZone: string): string | null {
  const parts = extractDateParts(value, timeZone);
  return parts ? `${parts.day}/${parts.month}/${parts.year}` : null;
}

function formatDateTime(value: unknown, timeZone: string): string | null {
  const parts = extractDateParts(value, timeZone);
  if (!parts) return null;
  if (parts.hour == null || parts.minute == null) return `${parts.day}/${parts.month}`;
  return `${parts.day}/${parts.month} às ${parts.hour}h${parts.minute}`;
}

/* ── totais: validados, nunca inventados ──────────────────────────────────────────────────────── */

/**
 * Um `totalItems` adversarial (`"9e99"`, `-1`, `NaN`, `1e308`) faria o assistente afirmar que o
 * operador tem novecentos quintilhoes de MTRs. Sem total confiavel, a frase muda - nao o numero.
 */
function validateTotal(candidate: unknown, atLeast: number): number | null {
  if (typeof candidate !== 'number') return null;
  if (!Number.isSafeInteger(candidate)) return null;
  if (candidate < atLeast) return null;
  if (candidate > MAX_PLAUSIBLE_TOTAL) return null;
  return candidate;
}

/** Total DECLARADO pelo produtor e validado. `null` = o produtor nao declarou nada confiavel. */
function resolveExplicitTotal(candidates: unknown[], rendered: number): number | null {
  for (const candidate of candidates) {
    const valid = validateTotal(candidate, rendered);
    if (valid != null) return valid;
  }
  return null;
}

function resolveTotal(candidates: unknown[], rendered: number, receivedCount: number): number | null {
  const explicit = resolveExplicitTotal(candidates, rendered);
  if (explicit != null) return explicit;
  // O que chegou eh, ele proprio, uma contagem verdadeira do que o produtor devolveu.
  return receivedCount >= rendered ? receivedCount : null;
}

/* ── escada de honestidade ────────────────────────────────────────────────────────────────────── */

/**
 * Ordenacao da FONTE. `'recency'` eh uma AFIRMACAO sobre o recorte, nao um adjetivo de enfeite:
 * dizer "os 8 mais recentes de 120" faz o operador concluir que os 112 omitidos sao mais ANTIGOS.
 * Em catalogo (ordenado por descricao) e em `jobsSearch` (ordem nao declarada) isso eh simplesmente
 * falso — mentira produzida pela propria camada de honestidade. Sem ordenacao conhecida, "N de M".
 */
type ScopeOrdering = 'recency' | 'unspecified';

type ScopeInput = {
  rendered: number;
  total: number | null;
  /** `true` quando `total` veio DECLARADO pelo produtor, e nao da contagem do que chegou. */
  totalIsExplicit: boolean;
  producerTruncated: boolean;
  /** Plural do substantivo ("manifestos", "certificados"). */
  noun: string;
  ordering: ScopeOrdering;
};

/**
 * Tres camadas NUNCA confundidas: (a) o PRODUTOR ja capou; (b) o RENDERER descartou; (c) nenhuma das
 * duas. E jamais "8 de 8" quando o produtor ja cortou em 50 - seria mentira produzida pela propria
 * camada de honestidade.
 */
function buildScopeLine(input: ScopeInput): string | null {
  const { rendered, total, totalIsExplicit, producerTruncated, noun, ordering } = input;
  if (rendered <= 0) return null;

  // Concordancia: "Mostro os 1 mais recentes" eh tipografia de formulario, nao de mensagem de
  // celular — e o caso `rendered === 1` acontece sempre que os demais itens sao invalidos.
  const head = ordering === 'recency'
    ? (rendered === 1 ? 'Mostro o mais recente' : `Mostro os ${rendered} mais recentes`)
    : `Mostro ${rendered}`;
  const tail = rendered === 1 ? 'além deste' : 'além destes';

  // DERIVA DE CAP: o produtor cortou e NAO declarou a contagem real. Dizer "de 50" sugeriria
  // completude usando o tamanho da AMOSTRA como se fosse o total - mentira produzida pela propria
  // camada de honestidade.
  if (producerTruncated && !totalIsExplicit) {
    return `${head}; pode haver mais ${noun} ${tail}.`;
  }
  if (total != null && total > rendered) {
    return `${head} de ${total} ${noun}.`;
  }
  if (producerTruncated) {
    return `${head}; pode haver mais ${noun} ${tail}.`;
  }
  return null;
}

/** Plural de operador, nunca "documento(s)". */
function pluralize(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural;
}

/* ── vocabulario pt-BR (reuso obrigatorio) ────────────────────────────────────────────────────── */

/**
 * `describeOperationalStatus` com codigo desconhecido devolve `label: status` - isto eh,
 * `snake_case` CRU na cara do operador. Guarda obrigatoria: quando o rotulo eh igual ao codigo, o
 * texto diz que nao sabe e aponta o SICAT.
 */
const UNIDENTIFIED_STATUS_LABEL = 'Situação não identificada aqui';

/**
 * A comparação é feita sobre os valores CRUS do descritor, não sobre o rótulo já higienizado:
 * `coerceScalarText` remove `_`, e comparar as formas higienizadas faria `estadozumbi` divergir de
 * `estado_zumbi` — a guarda passaria batido e o `snake_case` iria direto para a tela do operador.
 */
function resolveOperationalLabel(descriptor: { status: string; label: string }): { label: string; identified: boolean } {
  if (readKeyToken(descriptor.label) === readKeyToken(descriptor.status)) {
    return { label: UNIDENTIFIED_STATUS_LABEL, identified: false };
  }
  const label = coerceScalarText(descriptor.label, FIELD_CAPS.statusLabel);
  if (!label) return { label: UNIDENTIFIED_STATUS_LABEL, identified: false };
  return { label, identified: true };
}

/** `recommendedAction` do registry eh lingua de operador de PLATAFORMA. Aqui tem mapa proprio. */
const BUCKET_NEXT_STEP: Record<string, string> = {
  blocked: 'Esse pedido não vai se resolver sozinho. Abra o SICAT no navegador para corrigir os dados e enviar de novo.',
  terminal_failure: 'Não deu certo. Abra o SICAT no navegador para revisar e tentar outra vez.',
  in_flight: 'Ainda está em andamento. Me pergunte de novo daqui a pouco que eu digo como está.',
  lifecycle: 'Ainda não começou. Me pergunte de novo daqui a pouco que eu digo como está.',
  terminal_success: 'Concluído. O resultado está no SICAT pelo navegador.'
};

const OPERATION_LABELS: Record<string, string> = {
  'manifest.submit': 'Envio do MTR',
  'manifest.print': 'Impressão do MTR',
  'manifest.cancel': 'Cancelamento do MTR',
  'manifest.receive': 'Recebimento do MTR',
  'manifest.create': 'Criação de MTR',
  'manifest.replicate': 'Replicação de MTR',
  'cdf.download': 'Download de CDF',
  'cdf.generate': 'Geração de CDF',
  'catalog.sync': 'Sincronização de catálogo',
  'cadastro.submit': 'Envio de cadastro'
};

function describeOperationPtBr(operation: unknown): string {
  const raw = readKeyToken(operation);
  if (!raw) return 'Operação';
  const mapped = OPERATION_LABELS[raw];
  if (mapped) return mapped;
  // SEM `snake_case` na saida: sem rotulo humano, o generico vence o termo tecnico.
  return 'Operação no SICAT';
}

/** Rotulos de componente de auditoria. De MAPA, nunca humanizando o valor cru. */
const AUDIT_COMPONENT_LABELS: Record<string, string> = {
  'cetesb-gateway': 'comunicação com a CETESB',
  'whatsapp-channel': 'mensagem no WhatsApp',
  conversation: 'consulta pelo assistente',
  'conversation-service': 'consulta pelo assistente',
  worker: 'processamento em segundo plano'
};

const ARTIFACT_STATUS_LABELS: Record<string, string> = {
  collecting: 'sendo gerado',
  processing: 'sendo gerado',
  running: 'sendo gerado',
  pending: 'na fila',
  queued: 'na fila',
  available: 'pronto',
  completed: 'pronto',
  partial: 'pronto em parte',
  failed: 'com falha'
};

/* ── resolucao de familia (cascata, nao switch) ───────────────────────────────────────────────── */

type Family =
  | 'manifest_list'
  | 'dmr_list'
  | 'mtr_provisorio_list'
  | 'partner_list'
  | 'grouped_manifest_list'
  | 'manifest_detail'
  | 'catalog_list'
  | 'cdf_list'
  | 'cdf_reference'
  | 'cdf_action'
  | 'action_refusal'
  | 'batch_action'
  | 'job_card'
  | 'job_list'
  | 'operation_progress'
  | 'audit_timeline'
  | 'artifact_list'
  | 'error_explanation'
  | 'unknown';

/** Aliases de `withNormalizedShape`, que emite fora da uniao declarada. */
const TYPE_TO_FAMILY: Record<string, Family> = {
  manifest_list: 'manifest_list',
  list: 'manifest_list',
  grouped_manifest_list: 'grouped_manifest_list',
  manifest_detail: 'manifest_detail',
  detail: 'manifest_detail',
  cdf_list: 'cdf_list',
  cdf_action: 'cdf_action',
  cdf_detail: 'action_refusal',
  manifest_batch_preview: 'action_refusal',
  manifest_replication_preview: 'action_refusal',
  manifest_creation_draft: 'action_refusal',
  manifest_missing_fields: 'action_refusal',
  action_confirmation: 'action_refusal',
  manifest_batch_action: 'batch_action',
  action: 'batch_action',
  job_card: 'job_card',
  job_list: 'job_list',
  status: 'operation_progress',
  operation_progress: 'operation_progress',
  audit_timeline: 'audit_timeline',
  artifact_list: 'artifact_list',
  download_artifact: 'artifact_list',
  zip_artifact: 'artifact_list',
  error_explanation: 'error_explanation'
};

function looksLikeManifest(record: LooseRecord): boolean {
  return 'manifestNumber' in record
    || 'manifestId' in record
    || 'externalHashCode' in record
    || 'expeditionDate' in record;
}

/**
 * `manifest_list` eh usado como TIPO GUARDA-CHUVA por produtores que nao devolvem manifestos:
 * `list_dmr` (declaracoes), `list_mtr_provisorio` (MTR provisorio) e `search_partners` (parceiros).
 * Rotular uma DMR como "MTR" eh nomear o documento fiscal ERRADO — por isso a FORMA do item decide
 * antes do nome do tipo, a mesma disciplina ja aplicada ao `query_catalog` mascarado.
 */
function detectListShape(first: LooseRecord): Family | null {
  if (readKeyToken(first.kind) === 'provisorio') return 'mtr_provisorio_list';
  if ('periodLabel' in first || 'periodStart' in first) return 'dmr_list';
  if ('partnerCode' in first && !looksLikeManifest(first)) return 'partner_list';
  return null;
}

/**
 * A familia de ACAO eh detectada por SINAL, nao so por nome de tipo: tres dos tipos de acao sao
 * INFERIDOS pelo normalizer (`intent.includes('batch')`), nunca emitidos. Quem mudar a policy sem
 * olhar aqui depende de um casamento por nome que pode nao acontecer.
 */
function isActionFamily(type: string, intent: string, data: LooseRecord, actions: unknown[]): boolean {
  if (data.requiresConfirmation === true) return true;
  if (intent.includes('preview_') || intent.includes('missing_fields') || intent.includes('create_draft')) return true;
  if (TYPE_TO_FAMILY[type] === 'action_refusal') return true;
  for (const action of actions) {
    if (readKeyToken(toRecord(action).type) === 'confirm_tool_execution') return true;
  }
  return false;
}

/**
 * Intents resolvidos por NOME EXATO.
 *
 * A resolucao por PREFIXO (`intent.startsWith('cdf.')`) mandava `cdf.list_by_manifest_selection` —
 * uma CONSULTA read-only, explicitamente liberada neste canal — para a familia de ACAO, e o
 * operador recebia "Pedido de CDF registrado" para uma pergunta que so consultou, num canal cuja
 * premissa inteira eh nunca insinuar que executou algo (e os certificados encontrados eram
 * descartados de quebra). CONSULTA E ACAO NAO PODEM COMPARTILHAR UM PREFIXO DE DESPACHO: quando os
 * dois moram sob o mesmo namespace, o nome tem de ser exato.
 */
const INTENT_TO_FAMILY: Record<string, Family> = {
  // CDF: duas consultas e duas acoes, sob o mesmo prefixo.
  'cdf.resolve_by_manifest_reference': 'cdf_reference',
  'cdf.list_by_manifest_selection': 'cdf_list',
  'cdf.generate_from_manifest_selection': 'cdf_action',
  'cdf.download_batch_selected': 'cdf_action',
  // Manifesto: `manifest.cancel_recent_excluding_first` casa `includes('recent')` e sairia como
  // "*Seus MTRs*" — a mesma classe de defeito do CDF, com o sinal invertido (acao lida como lista).
  'manifest.cancel_recent_excluding_first': 'batch_action',
  'manifest.batch_submit_selected': 'batch_action',
  'manifest.batch_print_selected': 'batch_action',
  'manifest.batch_cancel_selected': 'batch_action',
  'manifest.receive_with_receipt': 'batch_action',
  'manifest.create_from_payload': 'batch_action',
  'manifest.replicate_with_patch': 'batch_action',
  'manifest.replicate_segmented': 'batch_action',
  'manifest.detail_selected_set': 'manifest_detail',
  'manifest.list_recent_top': 'manifest_list',
  'manifest.lookup_generator_by_number': 'manifest_list',
  'memory.list_asked_manifests': 'manifest_list'
};

function resolveFamily(input: {
  type: string;
  intent: string;
  kind: string;
  data: LooseRecord;
  actions: unknown[];
}): Family {
  const { type, intent, kind, data, actions } = input;

  if (isActionFamily(type, intent, data, actions)) return 'action_refusal';

  // 1) INTENT POR NOME EXATO. Precede qualquer heuristica de substring.
  const byIntent = intent ? INTENT_TO_FAMILY[intent] : undefined;
  if (byIntent) {
    // `manifest.list_recent_top` pode voltar AGREGADO (`groupBy` do planner) — a forma decide.
    if (byIntent === 'manifest_list' && Array.isArray(data.grouped) && data.grouped.length > 0) {
      return 'grouped_manifest_list';
    }
    return byIntent;
  }

  // 2) ACAO NUNCA CAI EM FAMILIA DE CONSULTA. Rede de seguranca para intent de acao que este mapa
  //    ainda nao conhece: sem ela a heuristica de substring abaixo pode rotular uma execucao como
  //    lista, e o texto vira uma afirmacao falsa sobre o que aconteceu.
  if (kind === 'action' || Array.isArray(data.execution)) return 'batch_action';

  // 3) INTENT POR HEURISTICA - so para o que o mapa exato nao cobre.
  if (intent) {
    if (intent.includes('audit')) return 'audit_timeline';
    if (intent.includes('group') || intent.includes('aggregate') || intent.includes('compare')) {
      return Array.isArray(data.grouped) && data.grouped.length > 0 ? 'grouped_manifest_list' : 'manifest_list';
    }
    if (intent.includes('detail')) return 'manifest_detail';
    if (intent.includes('batch') || intent.includes('replicate')) return 'batch_action';
    if (intent.includes('list') || intent.includes('recent')) return 'manifest_list';
  }

  // 4) TIPO (com aliases). `query_catalog` emite `manifest_detail` com `data.items` de CATALOGO - o
  //    nome MENTE, por isso a FORMA eh conferida antes de confiar nele.
  const mapped = TYPE_TO_FAMILY[type];
  if (mapped === 'manifest_detail') {
    const items = toArray(data.items);
    const first = toRecord(items[0]);
    if (items.length > 0 && !looksLikeManifest(first)) return 'catalog_list';
    if (Array.isArray(data.manifests) || looksLikeManifest(data)) return 'manifest_detail';
    if (items.length > 0) return 'catalog_list';
    return 'manifest_detail';
  }
  if (mapped === 'manifest_list') {
    // MESMA disciplina do `query_catalog` mascarado: `list_dmr`, `list_mtr_provisorio` e
    // `search_partners` emitem `manifest_list` com registros que NAO sao manifestos.
    const byShape = detectListShape(toRecord(toArray(data.items)[0]));
    if (byShape) return byShape;
    return 'manifest_list';
  }
  if (mapped) return mapped;

  // 5) FORMA do payload.
  if (Array.isArray(data.entries)) return 'audit_timeline';
  if (Array.isArray(data.manifests) || Array.isArray(data.affectedItems)) return 'manifest_list';
  if (Array.isArray(data.items)) {
    const first = toRecord(toArray(data.items)[0]);
    const byShape = detectListShape(first);
    if (byShape) return byShape;
    if (looksLikeManifest(first)) return 'manifest_list';
    if ('certificateCode' in first || 'issuedAt' in first) return 'cdf_list';
    if ('jobId' in first || 'operation' in first) return 'job_list';
    return 'unknown';
  }
  if (Array.isArray(data.certificates)) return 'cdf_list';
  if (looksLikeManifest(data)) return 'manifest_detail';

  return 'unknown';
}

/* ── projecoes por allowlist ──────────────────────────────────────────────────────────────────── */

/** Rotulo de item SEM numero da CETESB. Nunca "MTR <hash>": o hash nao eh numero de manifesto. */
const UNNUMBERED_MANIFEST_LABEL = 'Rascunho sem número (ainda não enviado à CETESB)';

type ManifestRow = {
  /** Numero HUMANO do MTR. `null` = rascunho/provisorio ainda sem numero da CETESB. */
  number: string | null;
  /** Rotulo pronto para a linha - `MTR <numero>` ou o rotulo de rascunho. */
  label: string;
  situation: string;
  date: string | null;
};

function projectManifestRow(value: unknown, timeZone: string): ManifestRow | null {
  const record = toRecord(value);
  // `manifestId`/`id` NAO entram: sao ids INTERNOS opacos, e a linha os imprimia como se fossem
  // numero de MTR — ainda truncados em 32 chars com reticencia, o que fazia a affordance "me manda o
  // numero" apontar para um handle que nunca vai casar. Sem numero E sem hash a linha NAO SAI
  // (falha FECHADA): a prosa segue sozinha, que eh melhor que um numero fiscal falso.
  const number = pickIdentifier(record, ['manifestNumber'], FIELD_CAPS.identifier);
  // O hash EXISTE como evidencia de que o registro eh um manifesto, mas nao vira rotulo: 32 hex
  // chars nao sao "o numero do MTR" e a pessoa nao tem como digitar isso de volta.
  const hash = pickIdentifier(record, ['externalHashCode'], FIELD_CAPS.identifier);
  if (!number && !hash) return null;

  // `statusLabel` ja vem pronto de `summarizeManifestReference`; senao, o MESMO vocabulario das
  // telas. Emitir `status: "received"` cru seria regressao de uma correcao ja feita e documentada.
  const situation = coerceScalarText(record.statusLabel, FIELD_CAPS.statusLabel)
    || coerceScalarText(
      resolveManifestSituationLabelPtBr({ status: record.status, externalStatus: record.externalStatus }, ''),
      FIELD_CAPS.statusLabel
    )
    || '';

  return {
    number,
    label: number ? `MTR ${number}` : UNNUMBERED_MANIFEST_LABEL,
    situation,
    date: formatShortDate(record.expeditionDate, timeZone)
  };
}

type ManifestCardFields = {
  number: string | null;
  label: string;
  situation: string;
  expedition: string | null;
  generator: string | null;
  carrier: string | null;
  receiver: string | null;
  driver: string | null;
  plate: string | null;
};

function projectManifestCard(value: unknown, timeZone: string): ManifestCardFields | null {
  const record = toRecord(value);
  const row = projectManifestRow(record, timeZone);
  if (!row) return null;

  return {
    number: row.number,
    label: row.label,
    situation: row.situation,
    expedition: formatFullDate(record.expeditionDate, timeZone),
    generator: readPartnerName(record.generator ?? record.generatorDescription, FIELD_CAPS.personName),
    carrier: readPartnerName(record.carrier ?? record.carrierDescription, FIELD_CAPS.personName),
    receiver: readPartnerName(record.receiver ?? record.receiverDescription, FIELD_CAPS.personName),
    // ASSIMETRIA DE PII DELIBERADA: motorista e placa PERMANECEM - no DETALHE, nunca em lista -
    // porque sao o dado operacional que o operador usa para telefonar; tirar quebraria o produto.
    // CPF/CNPJ ficam de fora por ALLOWLIST (nao estao em lista nenhuma), nao por regex.
    driver: coerceScalarText(record.driverName, FIELD_CAPS.personName),
    plate: coerceIdentifierText(record.vehiclePlate, FIELD_CAPS.identifier)
  };
}

function buildManifestCardText(card: ManifestCardFields): string | null {
  if (!card.label) return null;
  const lines = [`*${card.label}*`];
  // Campo ausente eh OMITIDO, nunca "nao informado" - e nunca INFERIDO (a falta do campo de CDF
  // nao autoriza escrever "o CDF ainda nao foi emitido"; isso seria invencao).
  if (card.situation) lines.push(`*Situação:* ${card.situation}`);
  if (card.expedition) lines.push(`*Expedição:* ${card.expedition}`);
  if (card.generator) lines.push(`*Gerador:* ${card.generator}`);
  if (card.carrier) lines.push(`*Transportador:* ${card.carrier}`);
  if (card.receiver) lines.push(`*Destinador:* ${card.receiver}`);
  if (card.driver && card.plate) lines.push(`*Motorista:* ${card.driver} - placa ${card.plate}`);
  else if (card.driver) lines.push(`*Motorista:* ${card.driver}`);
  else if (card.plate) lines.push(`*Placa:* ${card.plate}`);
  return lines.length > 1 ? lines.join('\n') : lines[0] ?? null;
}

/* ── construcao por familia ───────────────────────────────────────────────────────────────────── */

type BuildContext = {
  data: LooseRecord;
  artifacts: unknown[];
  actions: unknown[];
  jobId: string | null;
  options: RenderOptions;
  timeZone: string;
};

type FamilyOutput = {
  blocks: Array<RenderBlock | null>;
  omittedItems?: number;
  totalKnown?: number | null;
  producerTruncated?: boolean;
};

/**
 * Registro PROJETAVEL: objeto simples.
 *
 * A contagem honesta era feita sobre o array CRU. Com `items: [null, null, {manifestNumber:…}]` a
 * frase saia "Mostro os 1 mais recentes de 3 manifestos" — total INVENTADO a partir de lixo, mais
 * uma omissao que nunca houve, na unica linha cujo proposito eh nunca mentir sobre contagem. O teste
 * eh estrutural e O(1) por item DE PROPOSITO: projetar tudo para contar reintroduziria o custo que
 * a regra "cap antes de projetar" existe para evitar.
 */
function isProjectableRecord(value: unknown): boolean {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function countProjectableRecords(source: unknown[]): number {
  let count = 0;
  for (const item of source) if (isProjectableRecord(item)) count += 1;
  return count;
}

function buildProtocolBlock(context: BuildContext): RenderBlock | null {
  // EXCECAO UNICA E DECLARADA ao "sem id opaco": `jobId`/`correlationId` saem sob o rotulo
  // `Protocolo:` porque sao o handle que o suporte usa e nao ha equivalente humano.
  const protocol = context.jobId
    || coerceIdentifierText(context.data.correlationId, FIELD_CAPS.identifier);
  return buildBlock('note', protocol ? `Protocolo: ${protocol}` : null);
}

function buildManifestListFamily(context: BuildContext): FamilyOutput {
  const { data, options, timeZone } = context;
  const artifactItems = toArray(context.artifacts)
    .map((artifact) => toRecord(artifact))
    .find((artifact) => readKeyToken(artifact.type) === 'manifest_list');

  const source = firstArray(
    data.affectedItems,
    data.items,
    data.manifests,
    artifactItems ? toRecord(artifactItems.payload).items : undefined
  );

  // CAP ANTES DE PROJETAR. Invertido, materializaria os 200 objetos - a classe do OOM original.
  const cap = Math.max(1, Math.floor(options.itemCap));
  const rows = source.slice(0, cap)
    .map((item) => projectManifestRow(item, timeZone))
    .filter((row): row is ManifestRow => row !== null);

  if (rows.length === 0) return { blocks: [] };

  const receivedCount = countProjectableRecords(source);
  const criteria = toRecord(data.criteria);
  const totalCandidates = [data.totalItems, data.total, criteria.totalInRange];
  const explicitTotal = resolveExplicitTotal(totalCandidates, rows.length);
  const total = resolveTotal(totalCandidates, rows.length, receivedCount);
  const producerTruncated = data.truncated === true
    || (explicitTotal == null && KNOWN_PRODUCER_CAPS.has(receivedCount));

  // SUPRESSAO DE CAMPO CONSTANTE: repetir "- 07/08" oito vezes eh ruido puro; a data sobe para o
  // cabecalho e sai das linhas.
  const dates = rows.map((row) => row.date);
  const firstDate = dates[0] ?? null;
  const sameDate = Boolean(firstDate) && dates.every((date) => date === firstDate);

  const header = sameDate ? `*Seus MTRs de ${firstDate}*` : '*Seus MTRs*';
  const blocks: Array<RenderBlock | null> = [buildBlock('header', header)];
  blocks.push(buildBlock('scope', buildScopeLine({
    rendered: rows.length,
    total,
    totalIsExplicit: explicitTotal != null,
    producerTruncated,
    noun: 'manifestos',
    // `listManifests` ordena por `expeditionDate` - aqui "mais recentes" eh verificavel.
    ordering: 'recency'
  })));

  rows.forEach((row, index) => {
    const parts = [`${index + 1}) ${row.label}`];
    if (row.situation) parts.push(row.situation);
    if (!sameDate && row.date) parts.push(row.date);
    blocks.push(buildBlock('item', parts.join(' - '), true));
  });

  if (total != null && total > rows.length) {
    blocks.push(buildBlock(
      'affordance',
      'Peça um período menor (ex.: "MTRs de ontem") ou veja a lista inteira no SICAT pelo navegador.'
    ));
  }
  // A affordance so existe se houver NUMERO para digitar de volta: oferece-la para uma lista de
  // rascunhos manda a pessoa digitar algo que nao resolve.
  const numbered = rows.filter((row) => row.number !== null);
  if (rows.length >= 2 && numbered.length > 0) {
    blocks.push(buildBlock('affordance', `Quer o detalhe de um? Me manda o número, ex.: *MTR ${numbered[0]?.number}*.`));
  }

  return {
    blocks,
    omittedItems: Math.max(0, receivedCount - rows.length),
    totalKnown: total,
    producerTruncated
  };
}

function buildGroupedFamily(context: BuildContext): FamilyOutput {
  const groups = toArray(context.data.grouped);
  // O WhatsApp NAO tem lista aninhada: a hierarquia vira UMA camada plana. Os itens do grupo nao
  // sao renderizados - o valor do agrupamento eh a distribuicao, e a lista plana ja existe em F1.
  const cap = 4;
  const rows = groups.slice(0, cap)
    .map((entry) => {
      const record = toRecord(entry);
      const label = pickString(record, ['group', 'label', 'key'], FIELD_CAPS.personName);
      const total = coerceScalarText(record.total, FIELD_CAPS.identifier);
      return label && total ? `*${label}*: ${total}` : null;
    })
    .filter((line): line is string => line !== null);

  if (rows.length === 0) return { blocks: [] };

  const blocks: Array<RenderBlock | null> = [buildBlock('header', '*Distribuição*')];
  for (const row of rows) blocks.push(buildBlock('item', row, true));
  const rest = countProjectableRecords(groups) - rows.length;
  if (rest > 0) blocks.push(buildBlock('note', `+ ${rest} ${pluralize(rest, 'outro grupo', 'outros grupos')}.`));

  return { blocks, omittedItems: Math.max(0, rest) };
}

/* ── familias proprias de DMR, MTR provisorio e parceiro ──────────────────────────────────────────
 *
 * Existem porque o dispatcher usa `type: 'manifest_list'` como GUARDA-CHUVA para tres produtores que
 * nao devolvem manifestos. Reaproveitar o cabecalho `*Seus MTRs*` chamaria uma DMR (Declaracao de
 * Movimentacao de Residuos) de MTR - documento fiscal ERRADO - e ainda imprimiria id interno no
 * lugar do rotulo humano que existe no payload (`periodLabel`, `description`).
 * ────────────────────────────────────────────────────────────────────────────────────────────── */

/** Rotulo de situacao pelo vocabulario canonico, ja em pt-BR. `null` quando fora da taxonomia. */
function describeLifecycleLabel(descriptor: { status: string; label: string }): string {
  return resolveOperationalLabel(descriptor).label;
}

function buildDmrListFamily(context: BuildContext): FamilyOutput {
  const { data, options } = context;
  const source = toArray(data.items);
  const cap = Math.max(1, Math.floor(options.itemCap));

  const rows = source.slice(0, cap)
    .map((item) => {
      const record = toRecord(item);
      // O periodo eh o rotulo humano da declaracao ("07/2026"); o `id` interno nunca sai.
      const period = pickString(record, ['periodLabel'], FIELD_CAPS.statusLabel)
        || pickString(record, ['periodStart'], FIELD_CAPS.statusLabel);
      if (!period) return null;
      const situation = describeLifecycleLabel(describeDmrOperationalStatus(
        readKeyToken(record.status),
        readKeyToken(record.lastErrorCode).toUpperCase()
      ));
      return `DMR ${period} - ${situation}`;
    })
    .filter((line): line is string => line !== null);

  if (rows.length === 0) return { blocks: [] };

  const receivedCount = countProjectableRecords(source);
  const totalCandidates = [data.totalItems, data.total];
  const explicitTotal = resolveExplicitTotal(totalCandidates, rows.length);
  const total = resolveTotal(totalCandidates, rows.length, receivedCount);

  const blocks: Array<RenderBlock | null> = [buildBlock('header', '*Suas DMRs*')];
  blocks.push(buildBlock('scope', buildScopeLine({
    rendered: rows.length,
    total,
    totalIsExplicit: explicitTotal != null,
    producerTruncated: false,
    noun: 'declarações',
    // A DMR eh ordenada por PERIODO declaratorio, nao por data de emissao: "mais recentes" seria
    // uma afirmacao sobre o recorte que este renderer nao tem como verificar.
    ordering: 'unspecified'
  })));
  rows.forEach((row, index) => blocks.push(buildBlock('item', `${index + 1}) ${row}`, true)));
  blocks.push(buildBlock('affordance', 'O detalhe da declaração está no SICAT pelo navegador, em DMR.'));

  return { blocks, omittedItems: Math.max(0, receivedCount - rows.length), totalKnown: total };
}

function buildMtrProvisorioListFamily(context: BuildContext): FamilyOutput {
  const { data, options, timeZone } = context;
  const source = toArray(data.items);
  const cap = Math.max(1, Math.floor(options.itemCap));

  const rows = source.slice(0, cap)
    .map((item) => {
      // FILTRO ANTES DA PROJECAO, como em `job_list`: `toRecord(null)` vira `{}` e sairia como
      // "MTR provisório sem número - Aguardando execução" — um provisorio FANTASMA, inventado a
      // partir de lixo, na familia cujo cabecalho afirma serem OS SEUS documentos.
      if (!isProjectableRecord(item)) return null;
      const record = toRecord(item);
      const number = pickIdentifier(record, ['manifestNumber', 'provisionalNumber'], FIELD_CAPS.identifier);
      // Sem numero E sem situacao reconhecivel nao ha o que dizer sobre o registro.
      if (!number && !readKeyToken(record.status)) return null;
      const situation = describeLifecycleLabel(describeMtrProvisorioOperationalStatus(
        readKeyToken(record.status),
        readKeyToken(record.lastErrorCode).toUpperCase()
      ));
      const date = formatShortDate(record.expeditionDate, timeZone);
      const label = number ? `MTR provisório ${number}` : 'MTR provisório sem número';
      return [label, situation, date].filter((part): part is string => Boolean(part)).join(' - ');
    })
    .filter((line): line is string => Boolean(line));

  if (rows.length === 0) return { blocks: [] };

  const receivedCount = countProjectableRecords(source);
  const totalCandidates = [data.totalItems, data.total];
  const explicitTotal = resolveExplicitTotal(totalCandidates, rows.length);
  const total = resolveTotal(totalCandidates, rows.length, receivedCount);

  const blocks: Array<RenderBlock | null> = [buildBlock('header', '*Seus MTRs provisórios*')];
  blocks.push(buildBlock('scope', buildScopeLine({
    rendered: rows.length,
    total,
    totalIsExplicit: explicitTotal != null,
    producerTruncated: false,
    noun: 'provisórios',
    ordering: 'unspecified'
  })));
  rows.forEach((row, index) => blocks.push(buildBlock('item', `${index + 1}) ${row}`, true)));
  blocks.push(buildBlock('affordance', 'Emitir o definitivo e imprimir ficam no SICAT pelo navegador.'));

  return { blocks, omittedItems: Math.max(0, receivedCount - rows.length), totalKnown: total };
}

function buildPartnerListFamily(context: BuildContext): FamilyOutput {
  const { data, options } = context;
  const source = toArray(data.items);
  const cap = Math.max(1, Math.floor(options.itemCap));

  const rows = source.slice(0, cap)
    .map((item) => {
      const record = toRecord(item);
      // FORA da allowlist: `document` (CNPJ/CPF), `address`, `registration`, `raw`.
      const label = pickString(record, ['description', 'tradeName', 'name'], FIELD_CAPS.freeText);
      const code = pickIdentifier(record, ['partnerCode'], FIELD_CAPS.identifier);
      if (!label) return null;
      return code ? `${label} (${code})` : label;
    })
    .filter((line): line is string => line !== null);

  if (rows.length === 0) return { blocks: [] };

  const receivedCount = countProjectableRecords(source);
  const totalCandidates = [data.totalItems, data.total];
  const explicitTotal = resolveExplicitTotal(totalCandidates, rows.length);
  const total = resolveTotal(totalCandidates, rows.length, receivedCount);

  const blocks: Array<RenderBlock | null> = [buildBlock('header', '*Parceiros encontrados*')];
  blocks.push(buildBlock('scope', buildScopeLine({
    rendered: rows.length,
    total,
    totalIsExplicit: explicitTotal != null,
    producerTruncated: false,
    noun: 'parceiros',
    ordering: 'unspecified'
  })));
  rows.forEach((row, index) => blocks.push(buildBlock('item', `${index + 1}) ${row}`, true)));

  return { blocks, omittedItems: Math.max(0, receivedCount - rows.length), totalKnown: total };
}

function buildManifestDetailFamily(context: BuildContext): FamilyOutput {
  const { data, options, timeZone } = context;
  const artifactDetail = toArray(context.artifacts)
    .map((artifact) => toRecord(artifact))
    .find((artifact) => readKeyToken(artifact.type) === 'manifest_detail');

  const collection = Array.isArray(data.manifests) ? data.manifests : null;
  const cardCap = Math.max(1, Math.floor(options.cardCap));

  const sources = collection
    ? collection.slice(0, cardCap)
    // ⚠️ O ARTEFATO `manifest_detail` carrega o manifesto CRU inteiro. Ele eh lido pela MESMA
    //    projecao de 7 campos, NUNCA como objeto.
    : [looksLikeManifest(data) ? data : toRecord(artifactDetail?.payload)];

  const cards = sources
    .map((item) => projectManifestCard(item, timeZone))
    .filter((card): card is ManifestCardFields => card !== null)
    .map((card) => buildManifestCardText(card))
    .filter((text): text is string => text !== null);

  if (cards.length === 0) return { blocks: [] };

  const received = collection ? countProjectableRecords(collection) : 1;
  const total = resolveTotal([data.totalItems, data.total], cards.length, received);
  const blocks: Array<RenderBlock | null> = [];

  if (total != null && total > cards.length) {
    blocks.push(buildBlock('scope', `Mostro ${cards.length} de ${total} - os outros ${total - cards.length} ficaram de fora para caber aqui.`));
  }
  for (const card of cards) blocks.push(buildBlock('card', card, true));
  blocks.push(buildBlock('affordance', 'Para imprimir, cancelar ou baixar o CDF, use o SICAT no navegador.'));

  return { blocks, omittedItems: Math.max(0, received - cards.length), totalKnown: total };
}

function buildCatalogFamily(context: BuildContext): FamilyOutput {
  const { data, options } = context;
  const source = toArray(data.items);
  const cap = Math.max(1, Math.floor(options.itemCap));
  const rows = source.slice(0, cap)
    .map((item) => {
      const record = toRecord(item);
      const label = pickString(record, ['description', 'name', 'label', 'corporateName'], FIELD_CAPS.freeText);
      const code = pickIdentifier(record, ['code', 'partnerCode', 'externalCode'], FIELD_CAPS.identifier);
      if (!label) return code;
      return code ? `${label} (${code})` : label;
    })
    .filter((line): line is string => Boolean(line));

  if (rows.length === 0) return { blocks: [] };

  const receivedCount = countProjectableRecords(source);
  const explicitTotal = resolveExplicitTotal([data.totalItems, data.total], rows.length);
  const total = resolveTotal([data.totalItems, data.total], rows.length, receivedCount);
  const blocks: Array<RenderBlock | null> = [buildBlock('header', '*Resultados da consulta*')];
  blocks.push(buildBlock('scope', buildScopeLine({
    rendered: rows.length,
    total,
    totalIsExplicit: explicitTotal != null,
    producerTruncated: false,
    noun: 'registros',
    // CATALOGO NAO TEM DATA. `queryCatalog` devolve classes de residuo, unidades e parceiros
    // ordenados por DESCRICAO: dizer "os 8 mais recentes de 120" faria o operador concluir que os
    // 112 omitidos sao mais antigos - afirmacao falsa sobre o recorte, produzida pela propria
    // camada de honestidade.
    ordering: 'unspecified'
  })));
  rows.forEach((row, index) => blocks.push(buildBlock('item', `${index + 1}) ${row}`, true)));

  return { blocks, omittedItems: Math.max(0, receivedCount - rows.length), totalKnown: total };
}

function buildCdfListFamily(context: BuildContext): FamilyOutput {
  const { data, options, timeZone } = context;
  // `data.certificates` entra na allowlist de fonte ao lado de `data.items`: eh o campo que
  // `cdf.list_by_manifest_selection` devolve. Sem ele, os certificados achados eram DESCARTADOS -
  // a consulta ainda por cima saia como "Pedido de CDF registrado".
  const source = firstArray(data.certificates, data.items);
  const cap = Math.max(1, Math.floor(options.itemCap));

  const rows = source.slice(0, cap)
    .map((item) => {
      const record = toRecord(item);
      // FORA da allowlist: `downloadUrl` (rota interna; entrega eh fase 6), `id`, `notes` (texto
      // livre = superficie de injecao) e `externalSnapshot` (o objeto cru da CETESB - a causa do OOM).
      const code = pickIdentifier(record, ['certificateCode', 'documentId'], FIELD_CAPS.identifier);
      if (!code) return null;
      const issued = formatShortDate(record.issuedAt, timeZone);
      const receiver = readPartnerName(record.receiver, FIELD_CAPS.personName);
      return [`CDF ${code}`, issued, receiver].filter((part): part is string => Boolean(part)).join(' - ');
    })
    .filter((line): line is string => line !== null);

  if (rows.length === 0) return { blocks: [] };

  // `cdf_list` eh o UNICO tipo com vocabulario de honestidade pronto (`totalItems`/`returnedItems`/
  // `truncated`) - eh o contrato que a correcao do OOM criou. Usar `items.length` aqui seria mentir.
  const receivedCount = countProjectableRecords(source);
  const explicitTotal = resolveExplicitTotal([data.totalItems, data.total], rows.length);
  const total = resolveTotal([data.totalItems, data.total], rows.length, receivedCount);
  const producerTruncated = data.truncated === true
    || (explicitTotal == null && KNOWN_PRODUCER_CAPS.has(receivedCount));

  const blocks: Array<RenderBlock | null> = [buildBlock('header', '*Seus CDFs*')];
  blocks.push(buildBlock('scope', buildScopeLine({
    rendered: rows.length,
    total,
    totalIsExplicit: explicitTotal != null,
    producerTruncated,
    noun: 'certificados',
    // `searchCdfCertificates` ordena por `issuedAt` - "mais recentes" eh verificavel aqui.
    ordering: 'recency'
  })));
  rows.forEach((row, index) => blocks.push(buildBlock('item', `${index + 1}) ${row}`, true)));

  if ((total != null && total > rows.length) || producerTruncated) {
    blocks.push(buildBlock('affordance', 'A lista inteira está no SICAT pelo navegador, em CDF.'));
  }
  if (rows.length >= 2) {
    const firstCode = rows[0]?.split(' - ')[0] ?? '';
    blocks.push(buildBlock('affordance', `Quer o detalhe de um? Me manda o código, ex.: *${firstCode}*.`));
  }

  return { blocks, omittedItems: Math.max(0, receivedCount - rows.length), totalKnown: total, producerTruncated };
}

function buildCdfReferenceFamily(context: BuildContext): FamilyOutput {
  // `suggestedCertificateCriteria` carrega `integrationAccountId`/`sessionContextId`: nao esta na
  // allowlist, ponto.
  const source = toRecord(context.data.sourceManifest);
  const card = projectManifestCard(source, context.timeZone);
  if (!card?.number) return { blocks: [] };

  return {
    blocks: [
      buildBlock('header', `*CDF do MTR ${card.number}*`),
      buildBlock('note', card.situation ? `Situação do manifesto: ${card.situation}.` : null),
      buildBlock('affordance', 'Posso procurar o certificado desse manifesto. O documento em si fica no SICAT pelo navegador.')
    ]
  };
}

function buildCdfActionFamily(context: BuildContext): FamilyOutput {
  const execution = toArray(context.data.execution);
  const total = validateTotal(context.data.total, 0) ?? execution.length;
  const line = total > 0
    ? `Pedido de CDF registrado para ${total} ${pluralize(total, 'documento', 'documentos')}. O acompanhamento fica no SICAT pelo navegador.`
    : 'Pedido de CDF registrado. O acompanhamento fica no SICAT pelo navegador.';

  return { blocks: [buildBlock('note', line), buildProtocolBlock(context)] };
}

const REFUSAL_TEXT = 'Essa operação precisa de confirmação, e por aqui eu só consulto.';
const REFUSAL_NEXT_STEP = 'Abra o SICAT no navegador para revisar os itens e confirmar.';

function buildActionRefusalFamily(): FamilyOutput {
  // Fica ESTRUTURALMENTE fora: `selectionSnapshot`/`creationSnapshot` (tokens opacos impronunciaveis),
  // `payloadPreview` (dados cadastrais de gerador/transportador - candidato numero 1 a vazar PII) e
  // `assistantSummary` (onde vive o literal `confirmo manifest.create_from_payload`).
  return {
    blocks: [
      buildBlock('note', REFUSAL_TEXT),
      buildBlock('affordance', REFUSAL_NEXT_STEP)
    ]
  };
}

function buildBatchActionFamily(context: BuildContext): FamilyOutput {
  const { data } = context;
  const response = toRecord(data.response);
  const items = firstArray(response.items, data.execution, data.affectedItems);
  const total = validateTotal(response.total, 0) ?? validateTotal(data.total, 0) ?? items.length;
  const operation = describeOperationPtBr(data.operation);

  const line = total > 0
    ? `${operation}: ${total} ${pluralize(total, 'item', 'itens')} em processamento no momento da consulta.`
    : `${operation}: pedido registrado.`;

  return {
    blocks: [
      buildBlock('note', line),
      buildBlock('affordance', 'Me pergunte de novo daqui a pouco que eu digo como está, ou acompanhe no SICAT pelo navegador.'),
      buildProtocolBlock(context)
    ]
  };
}

function buildJobCardFamily(context: BuildContext): FamilyOutput {
  const { data, timeZone } = context;
  const descriptor = describeJobOperationalStatus({
    status: readKeyToken(data.status),
    lastErrorCode: readKeyToken(data.lastErrorCode).toUpperCase(),
    dlqReason: readKeyToken(data.dlqReason).toUpperCase(),
    resultSummary: readKeyToken(data.resultSummary).toUpperCase()
  });

  // `entityId` NAO entra no titulo: eh id opaco, e a regra eh "sem id opaco quando ha rotulo
  // humano". O handle que o suporte usa sai uma unica vez, sob `Protocolo:`.
  const situation = resolveOperationalLabel(descriptor);
  const lines = [`*${describeOperationPtBr(data.operation)}*`];
  lines.push(`*Situação:* ${situation.label}`);

  const attempts = validateTotal(data.attempts, 0);
  const maxAttempts = validateTotal(data.maxAttempts, 0);
  if (attempts != null && attempts > 1) {
    lines.push(maxAttempts != null ? `*Tentativas:* ${attempts} de ${maxAttempts}` : `*Tentativas:* ${attempts}`);
  }
  const updated = formatDateTime(data.finishedAt ?? data.startedAt ?? data.queuedAt, timeZone);
  if (updated) lines.push(`*Última atualização:* ${updated}`);

  return {
    blocks: [
      buildBlock('card', lines.join('\n')),
      // Situação fora da taxonomia não autoriza afirmar "ainda não começou" nem "concluído": o
      // próximo passo honesto é mandar a pessoa ver no SICAT.
      buildBlock('affordance', situation.identified
        ? (BUCKET_NEXT_STEP[descriptor.bucket] ?? BUCKET_NEXT_STEP.in_flight ?? null)
        : 'Não consegui identificar a situação por aqui. Veja no SICAT pelo navegador.'),
      buildProtocolBlock(context)
    ]
  };
}

function buildJobListFamily(context: BuildContext): FamilyOutput {
  const source = toArray(context.data.items);
  // `job_list` nao tem cap no produtor. Cap proprio, e menor que o de manifesto: linha de job carrega
  // mais texto por item.
  const cap = 5;
  const rows = source.slice(0, cap)
    .map((item) => {
      if (!isProjectableRecord(item)) return null;
      const record = toRecord(item);
      // FILTRO, nao so projecao: `toRecord(null)` vira `{}` e saia como uma linha de pedido que nao
      // existe - cinco pedidos fantasmas e um total inventado a partir de lixo.
      const operationKey = readKeyToken(record.operation);
      const statusKey = readKeyToken(record.status);
      if (!operationKey && !statusKey) return null;
      const descriptor = describeJobOperationalStatus({
        status: statusKey,
        lastErrorCode: readKeyToken(record.lastErrorCode).toUpperCase(),
        dlqReason: readKeyToken(record.dlqReason).toUpperCase(),
        resultSummary: readKeyToken(record.resultSummary).toUpperCase()
      });
      return `${describeOperationPtBr(record.operation)} - ${resolveOperationalLabel(descriptor).label}`;
    })
    .filter((row): row is string => row !== null);

  if (rows.length === 0) return { blocks: [] };

  const receivedCount = countProjectableRecords(source);
  const totalCandidates = [context.data.totalItems, context.data.total];
  const explicitTotal = resolveExplicitTotal(totalCandidates, rows.length);
  const total = resolveTotal(totalCandidates, rows.length, receivedCount);
  const blocks: Array<RenderBlock | null> = [buildBlock('header', '*Seus pedidos recentes*')];
  blocks.push(buildBlock('scope', buildScopeLine({
    rendered: rows.length,
    total,
    totalIsExplicit: explicitTotal != null,
    producerTruncated: false,
    noun: 'pedidos',
    // `jobsSearch` nao declara a ordenacao: com 40 pedidos na fila, "os 5 mais recentes" seria uma
    // afirmacao que este renderer nao tem como sustentar. "Mostro 5 de 40" ele sustenta.
    ordering: 'unspecified'
  })));
  rows.forEach((row, index) => blocks.push(buildBlock('item', `${index + 1}) ${row}`, true)));
  blocks.push(buildBlock('affordance', 'O acompanhamento completo está no SICAT pelo navegador.'));

  return { blocks, omittedItems: Math.max(0, receivedCount - rows.length), totalKnown: total };
}

function readProgress(source: LooseRecord): { completed: number; total: number } | null {
  const progress = toRecord(source.progress);
  const total = validateTotal(progress.total, 0) ?? validateTotal(source.total, 0);
  const completed = validateTotal(progress.completed, 0) ?? validateTotal(source.completed, 0);
  if (total == null || completed == null || total <= 0) return null;
  return { completed: Math.min(completed, total), total };
}

/** Contador nao-negativo e plausivel. `null` = campo ausente ou adversarial (nao vira zero). */
function readCounter(value: unknown): number | null {
  return validateTotal(value, 0);
}

/**
 * Panorama operacional dos DOIS unicos produtores desta familia.
 *
 * `get_operations_overview` devolve `{jobs:{queued,running,retry_wait,dlq_total,…}, recentDlq, …}` e
 * `get_dashboard_overview` devolve `{activeJobs:{total,items}, health, workers, performance}` -
 * NENHUM dos dois tem `{completed,total}`, que era a unica leitura implementada. Resultado: a
 * familia estava coberta no papel e emitia ZERO blocos na pratica, e a resposta caia na prosa do
 * LLM sem ficha nenhuma. Aqui saem contagens que os dois payloads DE FATO tem.
 */
function buildOverviewLines(data: LooseRecord): string[] {
  const lines: string[] = [];

  const jobs = toRecord(data.jobs);
  const queued = readCounter(jobs.queued);
  const running = readCounter(jobs.running);
  const retryWait = readCounter(jobs.retry_wait);
  const dlq = readCounter(jobs.dlq_total);

  const inFlight = [queued, running, retryWait].filter((value): value is number => value != null);
  if (inFlight.length > 0) {
    const pending = inFlight.reduce((sum, value) => sum + value, 0);
    lines.push(`${pending} ${pluralize(pending, 'pedido', 'pedidos')} na fila no momento da consulta.`);
  }

  const activeTotal = readCounter(toRecord(data.activeJobs).total);
  if (inFlight.length === 0 && activeTotal != null) {
    lines.push(`${activeTotal} ${pluralize(activeTotal, 'pedido', 'pedidos')} em andamento no momento da consulta.`);
  }

  const stuck = dlq ?? (Array.isArray(data.recentDlq) ? countProjectableRecords(data.recentDlq) : null);
  if (stuck != null && stuck > 0) {
    lines.push(`${stuck} ${pluralize(stuck, 'pedido parado', 'pedidos parados')} esperando alguém revisar.`);
  }

  return lines;
}

function buildOperationProgressFamily(context: BuildContext): FamilyOutput {
  const fromData = readProgress(context.data);
  const fromArtifact = toArray(context.artifacts)
    .map((artifact) => readProgress(toRecord(toRecord(artifact).payload)))
    .find((progress): progress is { completed: number; total: number } => progress !== null);

  const progress = fromData ?? fromArtifact ?? null;
  if (progress) {
    const ratio = Math.round((progress.completed / progress.total) * 100);
    return {
      blocks: [
        // ANCORA TEMPORAL OBRIGATORIA: sem push nem re-render, o numero ja nasce velho. Uma barra
        // congelada num historico de conversa MENTE.
        buildBlock('note', `${progress.completed} de ${progress.total} (${ratio}%) no momento da consulta.`),
        buildBlock('affordance', 'Me pergunte de novo daqui a pouco que eu digo como está.'),
        buildProtocolBlock(context)
      ]
    };
  }

  const overview = buildOverviewLines(context.data);
  if (overview.length === 0) return { blocks: [] };

  return {
    blocks: [
      buildBlock('header', '*Como está a operação*'),
      ...overview.map((line) => buildBlock('note', line)),
      buildBlock('affordance', 'O painel completo está no SICAT pelo navegador.'),
      buildProtocolBlock(context)
    ]
  };
}

/**
 * `entityId` so vira titulo quando for um NUMERO DE MTR reconhecivel: manifesto + 10 a 13 digitos.
 * Qualquer outra coisa (UUID, `man_0011223344`, hash) eh id interno - ruido tecnico que o operador
 * nao reconhece como documento seu.
 */
const HUMAN_MANIFEST_NUMBER = /^\d{10,13}$/;

function readHumanManifestNumber(entityType: unknown, entityId: unknown): string | null {
  if (readKeyToken(entityType) !== 'manifest') return null;
  const candidate = coerceIdentifierText(entityId, FIELD_CAPS.identifier);
  if (!candidate || !HUMAN_MANIFEST_NUMBER.test(candidate)) return null;
  return candidate;
}

function buildAuditFamily(context: BuildContext): FamilyOutput {
  const entries = toArray(context.data.entries);
  if (entries.length === 0) return { blocks: [] };

  // O tipo mais hostil a texto puro: N eventos x 10 campos, SEM cap no produtor, e
  // `endpoint`/`httpStatus`/`latencyMs`/`sanitizedHeaders`/`sanitizedBody` sao superficie interna.
  // A tela ja desistiu e mostra contagem + ultima acao. Aqui: AGREGADO, jamais a serie.
  const last = toRecord(entries[entries.length - 1]);
  const component = readKeyToken(last.component);
  const componentLabel = (component && AUDIT_COMPONENT_LABELS[component]) || 'registro do sistema';
  const when = formatDateTime(last.occurredAt, context.timeZone);

  // SO NUMERO HUMANO no titulo. `getAuditTrail` devolve o `entityId` CRU - UUID interno de 36 chars,
  // acima do cap de 32, que saia truncado com reticencia como titulo: nao identifica o documento,
  // nao eh copiavel e nao eh digitavel. O handle para o suporte ja sai uma vez em `Protocolo:`.
  const manifestNumber = readHumanManifestNumber(context.data.entityType, context.data.entityId);
  const header = manifestNumber ? `*Histórico do MTR ${manifestNumber}*` : '*Histórico deste registro*';
  const count = countProjectableRecords(entries);

  return {
    blocks: [
      buildBlock('header', header),
      buildBlock('scope', `${count} ${pluralize(count, 'registro', 'registros')}.`),
      buildBlock('note', when ? `Última ação: ${componentLabel}, em ${when}.` : `Última ação: ${componentLabel}.`),
      buildBlock('affordance', 'O histórico detalhado está no SICAT pelo navegador.'),
      buildProtocolBlock(context)
    ]
  };
}

/**
 * @param includeDataItems `true` só quando a família É `artifact_list`. No PASSE TRANSVERSAL isto
 * precisa ser `false`: senão `data.items` de uma lista de CDF seria lido como "50 documentos" e a
 * resposta ganharia uma linha de artefato inventada em cima de uma consulta que não gerou arquivo
 * nenhum. (Aconteceu no primeiro ensaio.)
 */
function buildArtifactFamily(context: BuildContext, includeDataItems = true): FamilyOutput {
  const fromArtifacts = toArray(context.artifacts)
    .map((artifact) => toRecord(artifact))
    .filter((artifact) => {
      const type = readKeyToken(artifact.type);
      return type === 'document' || type === 'zip_bundle' || type === 'zip';
    })
    .map((artifact) => toRecord(artifact.payload));

  const fromList = includeDataItems
    ? toArray(context.data.items).filter(isProjectableRecord).map((item) => toRecord(item))
    : [];
  const source = fromArtifacts.length > 0 ? fromArtifacts : fromList;
  // CONTAGEM SEMPRE DA FONTE, nunca do subconjunto exibido. E este passe eh TRANSVERSAL (atravessa
  // resposta de MTR, de CDF e de job), entao uma subcontagem aqui pega carona em qualquer familia -
  // numero dito ao operador eh DADO, nao enfeite.
  const total = source.length;
  if (total === 0) return { blocks: [] };

  const cap = 3;
  const names = source.slice(0, cap)
    .map((record) => coerceScalarText(record.fileName, FIELD_CAPS.freeText))
    .filter((name): name is string => name !== null);

  const first = source[0] ?? {};
  const statusKey = readKeyToken(first.status);
  const statusLabel = ARTIFACT_STATUS_LABELS[statusKey] ?? 'em preparo';
  const progress = readProgress(first);

  // A contagem anunciada vem de `total` (a FONTE), nunca de `names.length`. `names` é o subconjunto
  // exibido: está limitado ao `cap` de 3 E descarta registros sem `fileName`. Usá-lo aqui fazia 50
  // documentos serem anunciados como "3 documentos" — e 50 documentos sem nome, como "0 documentos".
  // Como este passe é TRANSVERSAL (atravessa resposta de MTR, de CDF e de job), a subcontagem pegava
  // carona em qualquer família. Número dito ao operador é DADO, não enfeite.
  const headline = total === 1 && names[0]
    ? `Documento *${names[0]}*: ${statusLabel}`
    : `${total} ${pluralize(total, 'documento', 'documentos')}: ${statusLabel}`;
  const withProgress = progress
    ? `${headline} - ${progress.completed} de ${progress.total} no momento da consulta.`
    : `${headline}.`;

  // Os nomes existiam no payload, estavam na allowlist e eram JOGADOS FORA a partir de 2 documentos:
  // quem perguntou QUAIS documentos existem nao descobria que havia um MTR e um CDF. `rest` conta
  // sobre o CAP (o que nao coube), nao sobre quantos nomes por acaso existiam.
  const shown = Math.min(cap, total);
  const rest = Math.max(0, total - shown);
  const nameLine = total >= 2 && names.length > 0
    ? `${pluralize(names.length, 'Documento', 'Documentos')}: ${joinNames(names)}${rest > 0 ? ` — e mais ${rest}.` : '.'}`
    : null;

  return {
    blocks: [
      buildBlock('note', withProgress),
      buildBlock('note', nameLine),
      // NUNCA `links.downloadUrl`/`statusUrl`. Nao eh so vazamento de superficie interna: o WhatsApp
      // AUTO-LINKA URL nua, e a rota viraria um link tocavel que devolve 401 - fazendo o operador
      // concluir que o SICAT esta quebrado.
      buildBlock('note', 'Por aqui eu ainda não consigo enviar arquivos; o download fica no SICAT pelo navegador.'),
      // PROTOCOLO SO NA FAMILIA. No passe transversal a linha `Protocolo:` sairia DUAS vezes na mesma
      // mensagem, com a nota de artefato encaixada no meio - le como mensagem remontada errado. O
      // protocolo pertence ao fim da mensagem, uma vez so.
      includeDataItems ? buildProtocolBlock(context) : null
    ],
    omittedItems: rest
  };
}

/** "a", "a e b", "a, b e c" - concordancia de operador, nao lista separada por virgula. */
function joinNames(names: string[]): string {
  const marked = names.map((name) => `*${name}*`);
  if (marked.length <= 1) return marked[0] ?? '';
  return `${marked.slice(0, -1).join(', ')} e ${marked[marked.length - 1]}`;
}

function buildErrorFamily(context: BuildContext): FamilyOutput {
  // `reasonCode` NUNCA vira texto (a defesa primaria eh nao emitir; `sanitizeWhatsAppLeakage` eh o
  // cinto). `suggestion` do motor costuma apontar para tela do navegador de forma errada - fora.
  const message = coerceScalarText(context.data.message, FIELD_CAPS.errorMessage);
  if (!message) return { blocks: [] };

  return {
    blocks: [
      buildBlock('note', message),
      // ACAO PRIMEIRO, ALTERNATIVA DEPOIS. A frase anterior ("Se continuar, ...") nao tinha sujeito
      // (o antecedente vinha do produtor) e nao dizia o que fazer - na UNICA familia cujo proposito
      // eh justamente dizer o que fazer.
      buildBlock(
        'affordance',
        'Costuma ser passageiro — me pergunte de novo daqui a alguns minutos. Se for urgente, o SICAT no navegador está funcionando normalmente.'
      ),
      buildProtocolBlock(context)
    ]
  };
}

/* ── entrada publica ──────────────────────────────────────────────────────────────────────────── */

const EMPTY_RESULT: RenderedResult = Object.freeze({
  blocks: [],
  omittedItems: 0,
  totalKnown: null,
  producerTruncated: false,
  family: 'unknown',
  refusal: false,
  degraded: true
});

/**
 * Converte um `ConversationStructuredResult` (na forma CRUA do dispatcher) em blocos de texto.
 *
 * `result: unknown` e NAO `ConversationStructuredResult`: tipar com a uniao seria uma mentira que o
 * `tsc` cobraria de nos e nao do payload. Com `unknown`, `noUncheckedIndexedAccess` obriga narrowing
 * em cada acesso - que eh exatamente a disciplina que este modulo precisa.
 *
 * NAO LANCA. Excecao aqui viraria job em retry -> LLM re-executado (custo triplicado) ou, pior,
 * silencio. Formatacao nunca pode causar isso.
 */
export function renderStructuredResultForWhatsApp(result: unknown, options: RenderOptions): RenderedResult {
  try {
    if (!result || typeof result !== 'object' || Array.isArray(result)) return EMPTY_RESULT;

    const payload = result as LooseRecord;
    const data = toRecord(payload.data);
    const artifacts = toArray(payload.artifacts);
    const actions = toArray(payload.actions);
    const type = readKeyToken(payload.type);
    const intent = readKeyToken(data.intent, 128);
    // `kind` ('query' | 'action') sobrevive ao `...payload` de `ensureNormalizedConversationResult`.
    // Eh o unico sinal que separa consulta de execucao quando nem o `type` nem o intent bastam.
    const kind = readKeyToken(payload.kind);
    const timeZone = options.timeZone || DEFAULT_TIME_ZONE;

    const family = resolveFamily({ type, intent, kind, data, actions });

    if (family === 'unknown') {
      countUnknownFamily(type || intent);
      return { ...EMPTY_RESULT, family: 'unknown', degraded: true };
    }

    const context: BuildContext = {
      data,
      artifacts,
      actions,
      jobId: coerceIdentifierText(payload.jobId, FIELD_CAPS.identifier),
      options,
      timeZone
    };

    const builders: Record<Exclude<Family, 'unknown'>, (input: BuildContext) => FamilyOutput> = {
      manifest_list: buildManifestListFamily,
      dmr_list: buildDmrListFamily,
      mtr_provisorio_list: buildMtrProvisorioListFamily,
      partner_list: buildPartnerListFamily,
      grouped_manifest_list: buildGroupedFamily,
      manifest_detail: buildManifestDetailFamily,
      catalog_list: buildCatalogFamily,
      cdf_list: buildCdfListFamily,
      cdf_reference: buildCdfReferenceFamily,
      cdf_action: buildCdfActionFamily,
      action_refusal: buildActionRefusalFamily,
      batch_action: buildBatchActionFamily,
      job_card: buildJobCardFamily,
      job_list: buildJobListFamily,
      operation_progress: buildOperationProgressFamily,
      audit_timeline: buildAuditFamily,
      artifact_list: buildArtifactFamily,
      error_explanation: buildErrorFamily
    };

    const output = builders[family](context);
    let blocks = output.blocks.filter((block): block is RenderBlock => block !== null);

    // PASSE TRANSVERSAL de artefatos: `download_artifact`/`zip_artifact` nao tem produtor - vem por
    // `artifacts[]` e atravessam QUALQUER familia.
    if (family !== 'artifact_list' && blocks.length > 0) {
      const artifactOutput = buildArtifactFamily(context, false);
      const artifactBlocks = artifactOutput.blocks.filter((block): block is RenderBlock => block !== null);
      if (artifactBlocks.length > 0) {
        // O `Protocolo:` da familia volta para o FIM. Com a nota de artefato encaixada DEPOIS dele a
        // mensagem termina com duas linhas de protocolo separadas por texto - le como remontada
        // errado. Uma vez so, e no fim.
        const last = blocks[blocks.length - 1];
        const protocol = last && last.kind === 'note' && last.text.startsWith('Protocolo: ') ? last : null;
        const head = protocol ? blocks.slice(0, -1) : blocks;
        blocks = protocol ? [...head, ...artifactBlocks, protocol] : [...head, ...artifactBlocks];
      }
    }

    if (blocks.length === 0) {
      // FAMILIA RECONHECIDA, ZERO BLOCOS: a prosa sai sozinha e a lacuna eh invisivel em producao.
      // Sem esta metrica, um campo renomeado no dispatcher faz a ficha SUMIR em silencio.
      countEmptyFamily(family);
      return {
        blocks: [],
        omittedItems: output.omittedItems ?? 0,
        totalKnown: output.totalKnown ?? null,
        producerTruncated: output.producerTruncated ?? false,
        family,
        refusal: false,
        degraded: false
      };
    }

    return {
      blocks,
      omittedItems: output.omittedItems ?? 0,
      totalKnown: output.totalKnown ?? null,
      producerTruncated: output.producerTruncated ?? false,
      family,
      refusal: family === 'action_refusal',
      degraded: false
    };
  } catch (error: unknown) {
    // FAIL-SOFT. Log SEM payload - e sem `stringify`, que eh o caminho lateral pelo qual o OOM
    // voltaria disfarcado de defesa.
    const name = error instanceof Error ? error.name : 'unknown';
    console.warn(`[whatsapp-render] ficha descartada (${name}); a prosa segue sozinha`);
    return EMPTY_RESULT;
  }
}
