import { AppError } from '../lib/problem.js';
import { sleep as defaultSleep } from '../lib/time.js';

// ---------------------------------------------------------------------------
// Reconciliador de submit contra a CETESB (módulo INERTE — ainda sem chamador).
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

// forma pareada com a unidade C1 (chave de correlação pré-submit)
// Quando C1 integrar, ESTA função deve ser a fonte única do formato — o lado
// que escreve o manObservacao e o lado que lê precisam importar o mesmo símbolo.
export function buildCorrelationMarker(manifestId: string): string {
  const normalized = String(manifestId ?? '').trim();
  if (!normalized) {
    throw new AppError(400, 'Bad Request', 'manifestId é obrigatório para montar o marcador de correlação do submit.', {
      code: 'SUBMIT_RECONCILE_INVALID_MANIFEST_ID'
    });
  }
  // Os colchetes delimitam o marcador: "[sicat:mtr-1]" NÃO é substring de
  // "[sicat:mtr-10]", então o casamento por `includes` não sofre colisão de prefixo.
  return `[sicat:${normalized}]`;
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
