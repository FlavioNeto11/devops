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

/**
 * Aviso de conclusão (fase 6). `outcome` = o desfecho agregado da ação (`succeeded`, `partial`,
 * `failed`, `dlq`, `timeout`); `path` = o que o canal REALMENTE fez com ele.
 *
 * ⚠️ TELEFONE NUNCA VIRA LABEL — nem cru (é dado pessoal, restrição do módulo) nem mascarado (a
 * cardinalidade explodiria a série). `channelLinkId` idem. Os dois vão no log estruturado, o
 * telefone só por `maskChannelUserKey`.
 *
 * `skipped_media_oversize` é OBRIGATÓRIA: sem ela a degradação de anexo para texto fica invisível e
 * o teto de `whatsappMediaMaxBytes` nunca é calibrado com dado real.
 *
 * As QUATRO degradações de mídia têm rótulo PRÓPRIO, e isso é contrato — não estética:
 *   · `skipped_media_disabled` ............... POLÍTICA desligada (flag `false` ou teto de docs 0);
 *   · `skipped_media_provider_unsupported` ... CAPACIDADE — o provedor não aceita bytes (Twilio);
 *   · `skipped_media_over_cap` ............... nº de documentos acima de `whatsappNoticeMaxDocuments`;
 *   · `skipped_media_oversize` ............... um arquivo acima de `whatsappMediaMaxBytes`.
 * Colapsar os dois primeiros no mesmo rótulo já aconteceu e é a pior variante: o operador liga a
 * flag numa instalação Twilio, o comportamento não muda, e a única série que explicaria o porquê
 * diz "disabled" — indistinguível de a flag não ter sido lida.
 */
type NoticeLabel = 'outcome' | 'path';

const outboundNoticeCounter = ensureCounter<NoticeLabel>(
  'sicat_channel_outbound_notice_total',
  'Avisos de conclusão de ação confirmada emitidos no canal externo, por desfecho e caminho de entrega.',
  ['outcome', 'path']
);

export type ChannelNoticePath =
  | 'text'
  | 'media'
  | 'skipped_outside_window'
  | 'skipped_link_revoked'
  | 'skipped_link_transferred'
  | 'skipped_media_oversize'
  | 'skipped_media_disabled'
  | 'skipped_media_provider_unsupported'
  | 'skipped_media_over_cap'
  | 'skipped_undeliverable';

export function recordChannelOutboundNotice(outcome: string, path: ChannelNoticePath, count = 1): void {
  safeInc(outboundNoticeCounter, { outcome, path }, count);
}

export async function readChannelOutboundNoticeMetricsForTests(): Promise<Array<{ outcome: string; path: string; value: number }>> {
  const metric = await outboundNoticeCounter.get();
  return metric.values.map((entry) => ({
    outcome: String(entry.labels.outcome ?? ''),
    path: String(entry.labels.path ?? ''),
    value: entry.value
  }));
}

export function resetChannelOutboundNoticeMetricsForTests(): void {
  outboundNoticeCounter.reset();
}

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
