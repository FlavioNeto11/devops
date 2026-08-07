/**
 * Métricas do gate de permissão conversacional (fase 4.5 da cadeia `whatsapp-channel-sicat`).
 *
 * Por que existe: a etapa intermediária `observe` decide EXATAMENTE como `enforce` e permite mesmo
 * assim. Sem contador ela é silenciosa — e observe silencioso não serve para nada. Cada `would_deny`
 * é literalmente "esta pessoa precisa de `sicat.operator` ANTES do flip"; o flip só acontece quando a
 * soma fica estável em zero.
 *
 * Registro: o MESMO `promClient.register` default de `ai-metrics.ts`/`channel-metrics.ts`, que é o
 * que o servidor da porta 9464 serializa. Nada aqui sobe servidor próprio.
 *
 * Nomes com `_` apenas: métrica Prometheus com hífen quebra o boot do processo (já custou incidente).
 *
 * SEM `userId` como label — cardinalidade e PII. O `userId` já vai na trilha do turno, junto do campo
 * `permissionShortfall` da decisão.
 */

import promClient from 'prom-client';

export type ConversationPermissionOutcome =
  /** Usuário não tem a chave e a chave é satisfazível: negado de verdade. */
  | 'denied'
  /** Modo `observe`: teria negado, mas permitiu. É a fila de trabalho antes do flip. */
  | 'would_deny'
  /** Chave ausente/inativa no catálogo + operação de AÇÃO: negado por catálogo degradado. */
  | 'catalog_degraded_denied'
  /** Chave ausente/inativa no catálogo + LEITURA: permitido, mas o catálogo está quebrado. */
  | 'catalog_degraded_allowed';

type DecisionLabel = 'mode' | 'outcome' | 'permission' | 'channel' | 'catalog_satisfiable';

function ensureCounter<T extends string>(name: string, help: string, labelNames: T[]): promClient.Counter<T> {
  const existing = promClient.register.getSingleMetric(name);
  if (existing) return existing as unknown as promClient.Counter<T>;
  return new promClient.Counter<T>({ name, help, labelNames, registers: [promClient.register] });
}

const decisionCounter = ensureCounter<DecisionLabel>(
  'sicat_conversation_permission_decision_total',
  'Decisoes NAO-TRIVIAIS do gate de permissao conversacional, por modo e desfecho. '
    + '`would_deny` em `observe` e a fila de concessoes pendentes; `catalog_degraded_*` significa '
    + 'catalogo de permissoes ausente ou desativado (o seed nao rodou ou alguem desativou a chave). '
    + '`catalog_satisfiable=false` em `observe` e o MESMO sinal, e sem este label ele nao existiria: '
    + 'o ramo `observe` retorna antes da checagem de integridade, entao catalogo quebrado e usuario '
    + 'sem papel produziriam amostras identicas durante toda a janela de observacao.',
  ['mode', 'outcome', 'permission', 'channel', 'catalog_satisfiable']
);

/** Telemetria JAMAIS derruba um turno: incremento embrulhado, igual ao padrão de `channel-metrics`. */
export function recordConversationPermissionDecision(input: {
  mode: string;
  outcome: ConversationPermissionOutcome;
  permission: string;
  channel: string;
  /** Integridade da chave no catálogo. Dois valores — cardinalidade irrelevante. */
  catalogSatisfiable: boolean;
}): void {
  try {
    decisionCounter.inc({
      mode: input.mode,
      outcome: input.outcome,
      permission: input.permission,
      channel: input.channel,
      catalog_satisfiable: input.catalogSatisfiable ? 'true' : 'false'
    });
  } catch (error) {
    console.warn(
      `[conversation-permission-metrics] incremento ignorado: ${error instanceof Error ? error.name : typeof error}`
    );
  }
}

export async function readConversationPermissionDecisionsForTests(): Promise<
  Array<{
    mode: string;
    outcome: string;
    permission: string;
    channel: string;
    catalogSatisfiable: string;
    value: number;
  }>
> {
  const metric = await decisionCounter.get();
  return metric.values.map((entry) => ({
    mode: String(entry.labels.mode ?? ''),
    outcome: String(entry.labels.outcome ?? ''),
    permission: String(entry.labels.permission ?? ''),
    channel: String(entry.labels.channel ?? ''),
    catalogSatisfiable: String(entry.labels.catalog_satisfiable ?? ''),
    value: entry.value
  }));
}

export function resetConversationPermissionDecisionsForTests(): void {
  decisionCounter.reset();
}
