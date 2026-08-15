/**
 * DÍVIDA DE AVISO — o desfecho que a janela de 24 h impediu de empurrar (fase 6).
 *
 * Fora da janela o provedor só aceita template pré-aprovado, e esta fase RECUSOU construir o caminho
 * de template (ver `whatsapp-outbound-notice-service`). O aviso então não é empurrado: ele vira
 * dívida, e a dívida é paga DE CARONA no próximo turno do canal — que é grátis, está dentro da
 * janela por construção (a pergunta nova É um inbound) e não gera bolha própria.
 *
 * ┌─ O LIMITE, COM TODAS AS LETRAS ───────────────────────────────────────────────────────────────┐
 * │ A dívida só funciona SE A PESSOA VOLTAR. Quem confirma uma ação e some não é avisado. Para N1  │
 * │ isso é aceitável (nada mudou no mundo e o PDF fica 72 h no SICAT); é uma das razões de o portão│
 * │ do N2 continuar fechado.                                                                       │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠️ TETO E TTL APLICADOS ANTES DE MATERIALIZAR. O OOM deste módulo veio exatamente de serializar
 * lista grande antes de cortar — aqui o corte acontece sobre a fatia, e o texto de cada entrada tem
 * teto próprio. `metadata` de vínculo é jsonb numa linha que a api e o worker leem a cada mensagem;
 * deixá-lo crescer sem limite degrada o canal inteiro, não só o aviso.
 *
 * Mora em `conversation_channel_links.metadata` (jsonb que já existe desde a 011) — ZERO DDL. O merge
 * é feito pelo Postgres (`patchConversationChannelLinkMetadata`), nunca por read-modify-write em JS.
 */

import { config } from '../../../../lib/config.js';
import { createPrefixedId } from '../../../../lib/ids.js';
import {
  findConversationChannelLinkForChannel,
  patchConversationChannelLinkMetadata
} from '../../../../repositories/conversation-channel-link-repo.js';

type LooseRecord = Record<string, unknown>;

export type PendingChannelNotice = {
  noticeId: string;
  text: string;
  createdAt: string;
};

/** Teto por entrada. Um aviso é sempre curto; acima disso é dado corrompido, não mensagem. */
const MAX_NOTICE_CHARS = 1200;

type PendingNoticeDependencies = {
  findLinkMetadata: (channelLinkId: string) => Promise<LooseRecord | null>;
  patchLinkMetadata: (channelLinkId: string, metadataPatch: LooseRecord) => Promise<unknown>;
  now: () => number;
};

const defaultDependencies: PendingNoticeDependencies = {
  findLinkMetadata: async (channelLinkId: string) => {
    const link = await findConversationChannelLinkForChannel(null, channelLinkId);
    return link ? (link.metadata as LooseRecord) : null;
  },
  patchLinkMetadata: (channelLinkId: string, metadataPatch: LooseRecord) =>
    patchConversationChannelLinkMetadata(null, { id: channelLinkId, metadataPatch }),
  now: () => Date.now()
};

let dependencies: PendingNoticeDependencies = defaultDependencies;

/** Seam de teste: doubles devolvem o `metadata` CRU da linha e registram o patch. Nada mais. */
export function setPendingNoticeDependenciesForTests(overrides: Partial<PendingNoticeDependencies> | null): void {
  dependencies = overrides ? { ...defaultDependencies, ...overrides } : defaultDependencies;
}

function resolveMax(): number {
  const value = Number(config.whatsappPendingNoticeMax);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 3;
}

function resolveTtlMs(): number {
  const value = Number(config.whatsappPendingNoticeTtlMs);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 259200000;
}

/**
 * Lê a lista já SANEADA: descarta entrada malformada, vencida pelo TTL, e corta no teto — nesta
 * ordem, e sempre sobre a fatia mais recente.
 *
 * PURA de propósito: o `metadata` chega de quem JÁ leu a linha do vínculo (o turno lê o vínculo em
 * C2 de qualquer jeito). Uma função que fizesse a própria consulta custaria um SELECT por turno para
 * descobrir, quase sempre, que não há dívida — custo permanente pago pelo caso raro.
 */
export function readPendingNoticesFromMetadata(metadata: LooseRecord | null, nowMs: number): PendingChannelNotice[] {
  const stored = metadata?.pendingNotices;
  if (!Array.isArray(stored)) return [];

  const ttlMs = resolveTtlMs();
  const max = resolveMax();

  // A fatia vem ANTES do map: `slice(-max)` limita quanto entra em memória mesmo que a linha tenha
  // sido corrompida com um array gigante.
  const recent = stored.slice(-max * 2);
  const notices: PendingChannelNotice[] = [];

  for (const entry of recent) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const record = entry as LooseRecord;
    const text = typeof record.text === 'string' ? record.text.trim().slice(0, MAX_NOTICE_CHARS) : '';
    const createdAt = typeof record.createdAt === 'string' ? record.createdAt : '';
    if (!text || !createdAt) continue;

    const createdAtMs = Date.parse(createdAt);
    if (!Number.isFinite(createdAtMs) || nowMs - createdAtMs > ttlMs) continue;

    notices.push({
      noticeId: typeof record.noticeId === 'string' && record.noticeId ? record.noticeId : createPrefixedId('pnot'),
      text,
      createdAt
    });
  }

  return notices.slice(-max);
}

/**
 * Enfileira a dívida. Acima do teto, DESCARTA O MAIS ANTIGO e conta em `pendingNoticesDropped` — sem
 * o contador, o descarte seria silencioso e ninguém saberia que uma pessoa perdeu um desfecho.
 *
 * Só entra na dívida o aviso que foi PULADO. Aviso enviado, ou ainda pendente, jamais entra: a mesma
 * informação não pode sair por dois caminhos.
 */
export async function enqueuePendingChannelNotice(input: { channelLinkId: string; text: string }): Promise<boolean> {
  const text = String(input.text || '').trim().slice(0, MAX_NOTICE_CHARS);
  if (!input.channelLinkId || !text) return false;

  try {
    const nowMs = dependencies.now();
    const metadata = await dependencies.findLinkMetadata(input.channelLinkId);
    const current = readPendingNoticesFromMetadata(metadata, nowMs);
    const max = resolveMax();

    const appended = [...current, { noticeId: createPrefixedId('pnot'), text, createdAt: new Date(nowMs).toISOString() }];
    const kept = appended.slice(-max);
    const dropped = Number(metadata?.pendingNoticesDropped) || 0;
    const droppedNow = appended.length - kept.length;

    await dependencies.patchLinkMetadata(input.channelLinkId, {
      pendingNotices: kept,
      pendingNoticesDropped: dropped + droppedNow
    });
    return true;
  } catch (error) {
    // A dívida é rede de segurança, não caminho principal: falhar aqui não pode derrubar o job de
    // aviso (que já decidiu, corretamente, não empurrar nada).
    console.warn(
      `[whatsapp-pending-notice] divida nao enfileirada: ${error instanceof Error ? error.name : typeof error}`
    );
    return false;
  }
}

/**
 * Limpa a dívida — chamado SÓ DEPOIS de o turno confirmar a entrega.
 *
 * A ordem é deliberada e a consequência é assumida: se o processo morrer entre a entrega e a limpeza,
 * a dívida pode ir de carona uma segunda vez. É at-least-once, e é a direção certa — repetir um bloco
 * informativo que já foi lido é muito menos grave que apagar um desfecho antes de ele chegar, e não
 * custa mensagem paga (a carona vai na resposta que já ia sair).
 */
export async function clearPendingChannelNotices(channelLinkId: string, noticeIds: string[]): Promise<void> {
  if (!channelLinkId || noticeIds.length === 0) return;
  try {
    const metadata = await dependencies.findLinkMetadata(channelLinkId);
    const remaining = readPendingNoticesFromMetadata(metadata, dependencies.now())
      .filter((notice) => !noticeIds.includes(notice.noticeId));
    await dependencies.patchLinkMetadata(channelLinkId, { pendingNotices: remaining });
  } catch (error) {
    console.warn(
      `[whatsapp-pending-notice] limpeza da divida falhou: ${error instanceof Error ? error.name : typeof error}`
    );
  }
}
