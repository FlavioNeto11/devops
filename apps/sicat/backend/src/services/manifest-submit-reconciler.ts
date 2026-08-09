import { AppError } from '../lib/problem.js';
import { sleep as defaultSleep } from '../lib/time.js';
import {
  MANIFEST_SUBMIT_UNCONFIRMED_STATUS,
  buildManifestSubmitConfirmedExternalStatus,
  buildManifestSubmitFailureExternalStatus
} from '../lib/manifest-submit-status.js';
import { buildManifestCorrelationMarker } from '../lib/manifest-correlation.js';

// ---------------------------------------------------------------------------
// Reconciliador de submit contra a CETESB.
//
// Problema: um `manifest.submit` pode ficar em estado indeterminado quando a
// resposta HTTP do envio se perde (timeout, pod reiniciado, rede). O manifesto
// local não sabe se NASCEU na CETESB. Este módulo descobre isso pesquisando a
// janela de datas do manifesto via `searchManifests` e casando o item remoto
// pelo MARCADOR de correlação gravado no `manObservacao` antes do envio.
//
// Módulo PURO: recebe `{ searchManifests }` injetado — não importa o gateway
// nem toca em Postgres. Isso o torna testável sem CETESB e sem banco.
// ---------------------------------------------------------------------------

// Mesmos delays do padrão de polling já existente no cetesb-gateway
// (resolveCancelExternalReferenceRecursive): um envio recém-feito pode demorar
// a aparecer na pesquisa da CETESB. Não inventar outro esquema de backoff.
// Anatomia idêntica à do gateway: delays.length tentativas com sleep de
// delays[attempt] ENTRE elas — o último valor nunca vira sleep (paridade
// numérica com o gateway, não um knob).
export const SUBMIT_RECONCILE_POLLING_DELAYS_MS: readonly number[] = Object.freeze([2000, 5000, 10000, 15000, 20000]);

// Forma pareada com a unidade C1 (chave de correlação pré-submit). O FORMATO
// vem de `lib/manifest-correlation.ts` — o mesmo símbolo que o gateway usa para
// ESCREVER o marcador no `manObservacao` antes do PUT. Duplicar o template aqui
// deixaria os dois lados livres para divergir sem nenhum teste reclamar.
// Os colchetes delimitam o marcador: "[sicat:mtr-1]" NÃO é substring de
// "[sicat:mtr-10]", então o casamento por `includes` não sofre colisão de prefixo.
export function buildCorrelationMarker(manifestId: string): string {
  const normalized = String(manifestId ?? '').trim();
  if (!normalized) {
    throw new AppError(400, 'Bad Request', 'manifestId é obrigatório para montar o marcador de correlação do submit.', {
      code: 'SUBMIT_RECONCILE_INVALID_MANIFEST_ID'
    });
  }
  try {
    return buildManifestCorrelationMarker(normalized);
  } catch (error: unknown) {
    throw new AppError(400, 'Bad Request', `manifestId inválido para o marcador de correlação do submit: "${manifestId}"`, {
      code: 'SUBMIT_RECONCILE_INVALID_MANIFEST_ID',
      cause: error
    });
  }
}

export type GatewaySearchManifestsArgs = {
  integrationAccountId?: string | null;
  sessionContextId?: string | null;
  jwtToken?: string | null;
  partnerCode?: number | null;
  correlationId?: string | null;
  includeAudit?: boolean;
  dateFrom?: string | null;
  dateTo?: string | null;
  statusFilter?: string | null;
  page?: number;
  kind?: string;
};

export type SearchManifestsFn = (args: GatewaySearchManifestsArgs) => Promise<unknown>;

export type ManifestSubmitReconcilerDeps = {
  // Função do gateway CETESB (cetesb-gateway.js#searchManifests), injetada.
  searchManifests: SearchManifestsFn;
  // Injetável nos testes para não esperar o backoff real.
  sleep?: (ms: number) => Promise<void>;
  // Orçamento de polling do chamador (worker/coordenador); default fiel ao gateway.
  delaysMs?: readonly number[];
};

export type ReconcileManifestSubmitInput = {
  // Id local do manifesto em estado indeterminado.
  manifestId: string;
  // Marcador esperado no manObservacao remoto; default: buildCorrelationMarker(manifestId).
  expectedMarker?: string | null;
  // Janela/contexto repassados ao searchManifests (janela de datas do manifesto).
  search?: GatewaySearchManifestsArgs;
};

export type RemoteManifestMatch = {
  manCodigo: string | number | null;
  manNumero: string | number | null;
  manHashCode: string | null;
  manObservacao: string | null;
};

export type ReconcileManifestSubmitResult =
  | {
      outcome: 'found';
      manifestId: string;
      marker: string;
      attempts: number;
      match: RemoteManifestMatch;
    }
  | {
      outcome: 'not-found-after-polling';
      manifestId: string;
      marker: string;
      attempts: number;
    }
  | {
      outcome: 'error';
      manifestId: string;
      marker: string;
      attempts: number;
      error: AppError;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// searchManifests devolve um array de itens, ou `{ items, audit }` quando o
// chamador pede `includeAudit: true`. Normaliza defensivamente as duas formas.
function extractSearchItems(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) return result.filter(isRecord);
  if (isRecord(result) && Array.isArray(result['items'])) return result['items'].filter(isRecord);
  return [];
}

function itemContainsMarker(item: Record<string, unknown>, marker: string): boolean {
  const notes = item['manObservacao'];
  return typeof notes === 'string' && notes.includes(marker);
}

// Chave de identidade do item remoto, espelhando a função (não exportada)
// src/gateways/cetesb-gateway.js#buildManifestItemKey — manter em sincronia.
// searchManifests já deduplica por essa chave; este espelho é defesa extra para
// que dois "matches" só contem como ambiguidade se forem manifestos DISTINTOS.
function buildRemoteItemIdentityKey(item: Record<string, unknown>): string {
  const hash = String(item['manHashCode'] ?? '').trim();
  if (hash) return `hash:${hash}`;
  const manCodigo = item['manCodigo'] == null ? '' : String(item['manCodigo']).trim();
  const manNumero = item['manNumero'] == null ? '' : String(item['manNumero']).trim();
  if (manCodigo || manNumero) return `code:${manCodigo}|number:${manNumero}`;
  return JSON.stringify(item);
}

function toNullableIdentifier(value: unknown): string | number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) return value.trim();
  return null;
}

function toNullableString(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  return null;
}

function buildRemoteMatch(item: Record<string, unknown>): RemoteManifestMatch {
  return {
    manCodigo: toNullableIdentifier(item['manCodigo']),
    manNumero: toNullableIdentifier(item['manNumero']),
    manHashCode: toNullableString(item['manHashCode']),
    manObservacao: toNullableString(item['manObservacao'])
  };
}

function toReconcileSearchError(error: unknown, attempt: number): AppError {
  const source = isRecord(error) ? error : {};
  const remoteStatus = Number(source['remoteStatus'] ?? source['statusCode'] ?? source['status'] ?? 0) || null;
  const reconcileError = new AppError(502, 'CETESB Reconcile Error', 'Falha ao pesquisar manifestos na CETESB durante a reconciliação do submit.', {
    code: 'SUBMIT_RECONCILE_SEARCH_FAILED',
    // O erro original vai em `cause` (topo, não em context): os classificadores
    // de retry do repo (src/lib/retry.ts) leem error.remoteStatus e
    // error.cause?.code — embrulhar sem preservá-los mascararia um 4xx
    // definitivo como 502 re-tentável.
    cause: error,
    context: { attempt, causeCode: error instanceof AppError ? error.code ?? null : null }
  });
  if (remoteStatus) Object.assign(reconcileError, { remoteStatus });
  return reconcileError;
}

// Reconciliação: pesquisa a janela do manifesto e casa o item remoto cujo
// `manObservacao` CONTÉM o marcador de correlação. Segue o padrão de polling do
// gateway: N tentativas (N = delays.length) com sleep de delays[attempt] entre
// elas enquanto attempt < delays.length - 1 — não achar na primeira tentativa
// NUNCA é falha; só devolve `not-found-after-polling` após esgotar o polling.
export async function reconcileManifestSubmit(
  deps: ManifestSubmitReconcilerDeps,
  input: ReconcileManifestSubmitInput
): Promise<ReconcileManifestSubmitResult> {
  if (typeof deps?.searchManifests !== 'function') {
    throw new AppError(500, 'Internal Server Error', 'Dependência searchManifests é obrigatória para reconciliar o submit.', {
      code: 'SUBMIT_RECONCILE_MISSING_DEPENDENCY'
    });
  }
  const manifestId = String(input?.manifestId ?? '').trim();
  const marker = String(input?.expectedMarker ?? '').trim() || buildCorrelationMarker(manifestId);
  const sleep = deps.sleep ?? defaultSleep;
  const delays = deps.delaysMs ?? SUBMIT_RECONCILE_POLLING_DELAYS_MS;
  const searchArgs = input?.search ?? {};

  for (let attempt = 0; attempt < delays.length; attempt += 1) {
    let items: Record<string, unknown>[];
    try {
      // Espalha por tentativa para o gateway não contaminar a próxima chamada
      // caso mute o argumento recebido.
      const result = await deps.searchManifests({ ...searchArgs });
      items = extractSearchItems(result);
    } catch (error: unknown) {
      // Erro de pesquisa é INCONCLUSIVO — nunca "manifesto não existe".
      return { outcome: 'error', manifestId, marker, attempts: attempt + 1, error: toReconcileSearchError(error, attempt + 1) };
    }

    const matchesByIdentity = new Map<string, Record<string, unknown>>();
    for (const item of items) {
      if (itemContainsMarker(item, marker)) {
        matchesByIdentity.set(buildRemoteItemIdentityKey(item), item);
      }
    }

    if (matchesByIdentity.size > 1) {
      // Dois manifestos remotos DISTINTOS com o mesmo marcador (ex.: reenvio
      // duplicado). Resolver isso é decisão do chamador, não deste módulo.
      return {
        outcome: 'error',
        manifestId,
        marker,
        attempts: attempt + 1,
        error: new AppError(409, 'Conflict', `Mais de um manifesto remoto contém o marcador de correlação "${marker}".`, {
          code: 'SUBMIT_RECONCILE_AMBIGUOUS_MARKER_MATCH',
          context: { marker, matchCount: matchesByIdentity.size }
        })
      };
    }

    const [match] = matchesByIdentity.values();
    if (match) {
      return { outcome: 'found', manifestId, marker, attempts: attempt + 1, match: buildRemoteMatch(match) };
    }

    if (attempt < delays.length - 1) {
      await sleep(delays[attempt] ?? 0);
    }
  }

  return { outcome: 'not-found-after-polling', manifestId, marker, attempts: delays.length };
}

// ---------------------------------------------------------------------------
// Tradução do desfecho em patch de persistência.
//
// Fica AQUI e não nos chamadores porque os dois pontos que hoje declaram falha
// sem perguntar nada (`applyManifestSubmitTerminalFailureSideEffect` no worker e
// `reconcileManifestSubmitState` no serviço) precisam concordar byte a byte
// sobre o que cada desfecho significa. Continua PURO: devolve o patch, quem
// escreve no Postgres é o chamador (o módulo não importa repositório nenhum).
// ---------------------------------------------------------------------------

export type ManifestSubmitReconcilePatch = {
  status: string;
  externalStatus: string;
  externalHashCode?: string | null;
  externalReference?: { manCodigo: string | number | null; manNumero: string | number | null };
  /**
   * `true` quando o patch REGISTRA o nascimento do MTR na CETESB. O chamador usa
   * isto para NÃO tratar o caso como falha (nem gravar `jobResults` de erro).
   */
  confirmed: boolean;
};

export type BuildManifestSubmitReconcilePatchOptions = {
  /**
   * `false` no caminho de LEITURA (orçamento de 1 tentativa, sem sleep): uma
   * única pesquisa que não achou NÃO é prova de ausência — a pesquisa da CETESB
   * atrasa em relação ao envio. Nesse modo `not-found-after-polling` também vira
   * `submit_unconfirmed`, e só a varredura de fundo (orçamento cheio) tem
   * autoridade para declarar `failed`.
   */
  allowTerminalFailure: boolean;
  /** `dlq` | `failed` | `cancelled`, ou o status terminal do job de submit. */
  terminalAction?: string | null;
  detail?: string | null;
  technicalCause?: string | null;
};

/**
 * Desfecho `found` sem `manHashCode` NÃO pode virar `submitted`: a constraint
 * `chk_manifest_submitted_integrity` exige `external_hash_code not null` quando
 * `status = 'submitted'` — sem esta guarda o UPDATE estouraria 23514 e a
 * reconciliação falharia justamente no caso que ela existe para consertar.
 */
function buildConfirmedPatch(match: RemoteManifestMatch): ManifestSubmitReconcilePatch {
  const hasFullIdentity = match.manCodigo != null && match.manNumero != null;
  const externalStatus = buildManifestSubmitConfirmedExternalStatus({
    manNumero: match.manNumero,
    manCodigo: match.manCodigo
  });

  if (hasFullIdentity && match.manHashCode) {
    return {
      status: 'submitted',
      externalStatus,
      externalHashCode: match.manHashCode,
      externalReference: { manCodigo: match.manCodigo, manNumero: match.manNumero },
      confirmed: true
    };
  }

  return {
    status: 'processing',
    externalStatus,
    externalHashCode: match.manHashCode ?? null,
    ...(hasFullIdentity
      ? { externalReference: { manCodigo: match.manCodigo, manNumero: match.manNumero } }
      : {}),
    confirmed: true
  };
}

export function buildManifestSubmitReconcilePatch(
  result: ReconcileManifestSubmitResult,
  options: BuildManifestSubmitReconcilePatchOptions
): ManifestSubmitReconcilePatch {
  if (result.outcome === 'found') {
    return buildConfirmedPatch(result.match);
  }

  const isProvenAbsent = result.outcome === 'not-found-after-polling' && options.allowTerminalFailure === true;

  return {
    status: isProvenAbsent ? 'failed' : MANIFEST_SUBMIT_UNCONFIRMED_STATUS,
    externalStatus: buildManifestSubmitFailureExternalStatus({
      certainty: isProvenAbsent ? 'confirmed-absent' : 'unknown',
      terminalAction: options.terminalAction ?? null,
      detail: options.detail ?? null,
      technicalCause: options.technicalCause ?? null
    }),
    confirmed: false
  };
}

/**
 * Desfecho para quando NÃO HÁ COMO PERGUNTAR (nenhum `searchManifests`
 * injetado, sessão ausente, marcador impossível de derivar). Nunca `failed`:
 * "não perguntei" e "perguntei e não existe" são fatos diferentes, e só o
 * segundo autoriza reenvio.
 */
export function buildManifestSubmitUnaskedPatch(
  options: Omit<BuildManifestSubmitReconcilePatchOptions, 'allowTerminalFailure'>
): ManifestSubmitReconcilePatch {
  return {
    status: MANIFEST_SUBMIT_UNCONFIRMED_STATUS,
    externalStatus: buildManifestSubmitFailureExternalStatus({
      certainty: 'unknown',
      terminalAction: options.terminalAction ?? null,
      detail: options.detail ?? null,
      technicalCause: options.technicalCause ?? null
    }),
    confirmed: false
  };
}

// ---------------------------------------------------------------------------
// Fachada usada pelos DOIS pontos que antes declaravam falha sem perguntar
// (`workers/operation-handlers.ts` e `services/manifest-service.ts`).
//
// Mora AQUI e não no worker porque o serviço também precisa dela, e
// `manifest-service.ts` já é importado por `operation-handlers.ts` — a via
// inversa fecharia um ciclo de import ESM justamente sobre um módulo que
// instancia o gateway no topo.
// ---------------------------------------------------------------------------

/**
 * Dependências INJETADAS pelo chamador (o job-runner passa o `searchManifests`
 * do gateway real).
 *
 * Ausência de `searchManifests` NÃO é tratada como "o MTR não existe": sem meio
 * de perguntar, o desfecho é `submit_unconfirmed`. Isso também é a defesa dos
 * testes — nenhum caminho aqui instancia o gateway sozinho, então nenhum teste
 * pode acidentalmente bater na CETESB de verdade (`CETESB_GATEWAY_MODE=real` é
 * o default desta casa).
 */
export type ManifestSubmitReconcileDeps = {
  searchManifests?: SearchManifestsFn | null;
  sleep?: (ms: number) => Promise<void>;
  delaysMs?: readonly number[];
};

export type ManifestSubmitReconcileSubject = {
  id: string;
  integrationAccountId?: string | null;
  sessionContextId?: string | null;
  payload?: Record<string, unknown> | null;
  createdAt?: string | null;
};

export type ResolveManifestSubmitReconcilePatchOptions =
  BuildManifestSubmitReconcilePatchOptions & { correlationId?: string | null };

// Janela de pesquisa da CETESB em volta da data de negócio do manifesto. A
// folga de ±3 dias absorve fuso/virada de dia sem chegar perto do teto de 31
// dias da pesquisa.
const SUBMIT_RECONCILE_WINDOW_DAYS = 3;

function toNonEmptyStringOrNull(value: unknown): string | null {
  if (typeof value === 'string') {
    return value.trim() || null;
  }
  return null;
}

function shiftIsoDate(isoDate: string, days: number): string {
  const parsed = new Date(`${isoDate}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    return isoDate;
  }
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

function resolveManifestBusinessDate(subject: ManifestSubmitReconcileSubject): string {
  const payload = isRecord(subject.payload) ? subject.payload : {};
  const expeditionDate = toNonEmptyStringOrNull(payload['expeditionDate']);
  if (expeditionDate && /^\d{4}-\d{2}-\d{2}/.test(expeditionDate)) {
    return expeditionDate.slice(0, 10);
  }
  const createdAt = toNonEmptyStringOrNull(subject.createdAt);
  if (createdAt && /^\d{4}-\d{2}-\d{2}/.test(createdAt)) {
    return createdAt.slice(0, 10);
  }
  return new Date().toISOString().slice(0, 10);
}

export function buildManifestSubmitReconcileSearchArgs(
  subject: ManifestSubmitReconcileSubject,
  correlationId: string | null = null
): GatewaySearchManifestsArgs {
  const businessDate = resolveManifestBusinessDate(subject);
  return {
    integrationAccountId: subject.integrationAccountId ?? null,
    sessionContextId: subject.sessionContextId ?? null,
    correlationId,
    dateFrom: shiftIsoDate(businessDate, -SUBMIT_RECONCILE_WINDOW_DAYS),
    dateTo: shiftIsoDate(businessDate, SUBMIT_RECONCILE_WINDOW_DAYS)
  };
}

/**
 * O marcador vem de `payload.submitCorrelation.marker` — gravado por
 * `handleManifestSubmit` ANTES do PUT — e cai para a derivação determinística
 * quando a linha é anterior ao C1. Os dois caminhos produzem a mesma string:
 * `buildManifestCorrelationMarker` é a fonte única do formato.
 */
export function resolveManifestSubmitMarker(subject: ManifestSubmitReconcileSubject): string | null {
  const payload = isRecord(subject.payload) ? subject.payload : {};
  const submitCorrelation = isRecord(payload['submitCorrelation']) ? payload['submitCorrelation'] : {};
  const persistedMarker = toNonEmptyStringOrNull(submitCorrelation['marker']);
  if (persistedMarker) {
    return persistedMarker;
  }
  try {
    return buildManifestCorrelationMarker(subject.id);
  } catch {
    return null;
  }
}

/**
 * O CORAÇÃO desta unidade: pergunta à CETESB se o envio nasceu ANTES de
 * qualquer um declarar falha. Devolve o patch a persistir — a escrita fica com
 * o chamador, o que mantém este módulo sem repositório e sem Postgres.
 */
export async function resolveManifestSubmitReconcilePatch(
  subject: ManifestSubmitReconcileSubject,
  deps: ManifestSubmitReconcileDeps,
  options: ResolveManifestSubmitReconcilePatchOptions
): Promise<ManifestSubmitReconcilePatch> {
  const marker = resolveManifestSubmitMarker(subject);
  const unaskedOptions = {
    terminalAction: options.terminalAction ?? null,
    detail: options.detail ?? null,
    technicalCause: options.technicalCause ?? null
  };

  if (typeof deps?.searchManifests !== 'function' || !marker) {
    return buildManifestSubmitUnaskedPatch(unaskedOptions);
  }

  try {
    const result = await reconcileManifestSubmit(
      {
        searchManifests: deps.searchManifests,
        ...(deps.sleep ? { sleep: deps.sleep } : {}),
        ...(deps.delaysMs ? { delaysMs: deps.delaysMs } : {})
      },
      {
        manifestId: subject.id,
        expectedMarker: marker,
        search: buildManifestSubmitReconcileSearchArgs(subject, options.correlationId ?? null)
      }
    );
    return buildManifestSubmitReconcilePatch(result, {
      allowTerminalFailure: options.allowTerminalFailure,
      ...unaskedOptions
    });
  } catch (reconcileError: unknown) {
    // Reconciliação que explode é "não perguntei", nunca "não existe".
    const message = reconcileError instanceof Error ? reconcileError.message : String(reconcileError);
    console.warn(`[manifest-submit-reconciler] reconciliação falhou para ${subject.id}: ${message}`);
    return buildManifestSubmitUnaskedPatch(unaskedOptions);
  }
}
