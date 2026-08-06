/**
 * Métricas Prometheus dos CANAIS EXTERNOS (fase 3 da cadeia `whatsapp-channel-sicat`).
 *
 * Por que existe um arquivo só para isto: o descarte na recepção é SILENCIOSO por desenho — responder
 * qualquer coisa a um número não vinculado é oráculo de enumeração, e responder não-2xx ao provedor
 * faz o Meta desativar o webhook. O preço dessa mudez é que, sem contador, o modo de falha mais
 * perigoso do módulo (canonicalização divergente entre cadastro e recepção) fica indistinguível de
 * "ninguém mandou mensagem": `unlinked` sobe, e nada mais acontece no mundo.
 *
 * Registro: o MESMO `promClient.register` default de `ai-metrics.ts`, que é o que o servidor da porta
 * 9464 (`startAiMetricsServer`) serializa e o ServiceMonitor raspa. Nada aqui sobe servidor próprio.
 *
 * Nomes com `_` apenas: métrica Prometheus com hífen quebra o boot do processo.
 *
 * REGRA: telemetria JAMAIS derruba a recepção. Todo incremento é embrulhado — um registrador em
 * estado inválido não pode transformar uma mensagem legítima em 500 para o provedor.
 */

import promClient from 'prom-client';

type ChannelLabel = 'channel' | 'provider';
type DropLabel = ChannelLabel | 'reason';

/**
 * Idempotente por NOME. O módulo é carregado uma vez por processo, mas o registro default é global e
 * `new Counter` com nome repetido LANÇA — o que num reload de teste derrubaria a suíte inteira.
 */
function ensureCounter<T extends string>(name: string, help: string, labelNames: T[]): promClient.Counter<T> {
  const existing = promClient.register.getSingleMetric(name);
  if (existing) return existing as unknown as promClient.Counter<T>;
  return new promClient.Counter<T>({ name, help, labelNames, registers: [promClient.register] });
}

const receivedCounter = ensureCounter<ChannelLabel>(
  'sicat_channel_inbound_received_total',
  'Mensagens de canal externo recebidas no webhook (antes de qualquer guarda).',
  ['channel', 'provider']
);

const enqueuedCounter = ensureCounter<ChannelLabel>(
  'sicat_channel_inbound_enqueued_total',
  'Mensagens de canal externo que viraram job na fila.',
  ['channel', 'provider']
);

const droppedCounter = ensureCounter<DropLabel>(
  'sicat_channel_inbound_dropped_total',
  'Mensagens de canal externo descartadas na recepção, por motivo. `unlinked` e `invalid_phone` em '
    + 'alta são o sintoma de canonicalização divergente entre cadastro e recepção.',
  ['channel', 'provider', 'reason']
);

function safeInc<T extends string>(counter: promClient.Counter<T>, labels: Record<T, string>, count: number): void {
  if (!Number.isFinite(count) || count <= 0) return;
  try {
    counter.inc(labels, count);
  } catch (error) {
    console.warn(`[channel-metrics] incremento ignorado: ${error instanceof Error ? error.name : typeof error}`);
  }
}

export function recordChannelInboundReceived(channel: string, provider: string, count: number): void {
  safeInc(receivedCounter, { channel, provider }, count);
}

export function recordChannelInboundEnqueued(channel: string, provider: string, count: number): void {
  safeInc(enqueuedCounter, { channel, provider }, count);
}

export function recordChannelInboundDropped(channel: string, provider: string, reason: string, count = 1): void {
  safeInc(droppedCounter, { channel, provider, reason }, count);
}

export type ChannelInboundMetricsSnapshot = {
  received: number;
  enqueued: number;
  dropped: Record<string, number>;
};

/**
 * Leitura do registro REAL do prom-client — o teste afirma sobre o que o `/metrics` exporia, não
 * sobre um contador paralelo mantido pelo próprio teste.
 */
export async function readChannelInboundMetricsForTests(channel: string): Promise<ChannelInboundMetricsSnapshot> {
  const [received, enqueued, dropped] = await Promise.all([
    receivedCounter.get(),
    enqueuedCounter.get(),
    droppedCounter.get()
  ]);

  const sum = (metric: { values: Array<{ labels: Record<string, string | number>; value: number }> }): number =>
    metric.values
      .filter((entry) => String(entry.labels.channel ?? '') === channel)
      .reduce((total, entry) => total + entry.value, 0);

  const dropsByReason: Record<string, number> = {};
  for (const entry of dropped.values) {
    if (String(entry.labels.channel ?? '') !== channel) continue;
    const reason = String(entry.labels.reason ?? '');
    dropsByReason[reason] = (dropsByReason[reason] ?? 0) + entry.value;
  }

  return { received: sum(received), enqueued: sum(enqueued), dropped: dropsByReason };
}

export function resetChannelInboundMetricsForTests(): void {
  receivedCounter.reset();
  enqueuedCounter.reset();
  droppedCounter.reset();
}
