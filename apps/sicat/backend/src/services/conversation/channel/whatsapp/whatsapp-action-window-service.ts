/**
 * JANELA DE AÇÃO (step-up do N2) — a metade que acontece no NAVEGADOR.
 *
 * O conflito central da fase 5, nomeado: quem domina o WhatsApp recebe o código junto com a pergunta,
 * logo confirmação in-channel não prova posse de nada; mas se para emitir um MTR a pessoa precisar
 * abrir o navegador, ela emite pelo navegador e o canal deixa de existir.
 *
 * A resolução é TEMPORAL, não de intensidade: o atrito caro é pago UMA VEZ POR TURNO DE TRABALHO, e
 * não por ação. A pessoa abre a janela na sessão web autenticada — um clique, antes de sair do
 * escritório — escolhendo a conta CETESB, a duração e o orçamento de ações. No pátio, com luva, ela
 * digita 6 dígitos e mais nada.
 *
 * O que isso converte, sem maquiagem: "telefone comprometido = capacidade permanente de emitir MTR"
 * vira "telefone comprometido MAIS uma janela que a própria vítima abriu deliberadamente = capacidade
 * limitada, contada, presa a UMA conta CETESB, visível num contador na tela dela e cortável num
 * clique com efeito instantâneo". O atacante que só tem o telefone não abre janela nenhuma.
 *
 * Superfície: `POST/GET/DELETE /v1/sicat/channel-links/whatsapp/action-window`, toda sob
 * `sicatAuthMiddleware`. NENHUM token em URL, nenhum link assinado — o segredo do N2 é a credencial
 * SICAT, e ela nunca trafega pelo canal.
 */

import { AppError } from '../../../../lib/problem.js';
import { listConversationChannelLinksByUser } from '../../../../repositories/conversation-channel-link-repo.js';
import { resolveActiveAccountContext } from '../../../sicat-account-service.js';
import {
  clampWindowBudget,
  clampWindowHours,
  findLiveWhatsAppActionWindow,
  openWhatsAppActionWindow,
  revokeWhatsAppActionWindow,
  type WhatsAppActionWindow
} from './whatsapp-action-ticket-service.js';
import { maskChannelUserKey } from './types.js';

type LooseRecord = Record<string, unknown>;

export type ActionWindowDto = {
  id: string;
  maskedUserKey: string;
  integrationAccountId: string | null;
  expiresAt: string | null;
  actionsUsed: number;
  actionsBudget: number;
  openedAt: string | null;
};

function toDto(window: WhatsAppActionWindow): ActionWindowDto {
  return {
    id: window.id,
    // O DTO NUNCA devolve o E.164 cru: a tela mostra `+55 11 9••••-••32`, como o resto da fase 2.
    maskedUserKey: maskChannelUserKey(window.externalUserKey),
    integrationAccountId: window.integrationAccountId,
    expiresAt: window.expiresAt,
    actionsUsed: window.actionsUsed,
    actionsBudget: window.actionsBudget,
    openedAt: window.openedAt
  };
}

/**
 * O telefone é resolvido NO SERVIDOR a partir do vínculo `verified` do usuário — o cliente nunca
 * informa número. Sem isso, alguém abriria uma janela para o telefone de outra pessoa.
 */
async function requireVerifiedPhone(userId: string): Promise<string> {
  const links = await listConversationChannelLinksByUser(null, userId, 'whatsapp');
  const verified = links.find((link) => link.verificationStatus === 'verified');
  if (!verified) {
    throw new AppError(409, 'Conflict', 'Nenhum número de WhatsApp verificado neste usuário.', {
      code: 'CHANNEL_ACTION_WINDOW_NO_VERIFIED_LINK'
    });
  }
  return verified.externalUserKey;
}

export async function openWhatsAppActionWindowService(
  userId: string,
  body: LooseRecord,
  correlationId: string | null
): Promise<ActionWindowDto> {
  const externalUserKey = await requireVerifiedPhone(userId);

  // A conta CETESB é FIXADA na abertura, lida do servidor. É ela que limita o estrago: dentro da
  // janela, as ações só alcançam a conta que a pessoa escolheu aqui.
  const account = await resolveActiveAccountContext(userId);
  if (!account) {
    throw new AppError(409, 'Conflict', 'Selecione uma conta CETESB ativa antes de liberar ações pelo WhatsApp.', {
      code: 'CHANNEL_ACTION_WINDOW_ACCOUNT_REQUIRED'
    });
  }

  const window = await openWhatsAppActionWindow({
    userId,
    externalUserKey,
    integrationAccountId: account.integrationAccountId,
    sessionContextId: account.sessionContextId,
    hours: clampWindowHours(body.hours),
    budget: clampWindowBudget(body.actionsBudget ?? body.budget),
    correlationId
  });

  if (!window) {
    throw new AppError(503, 'Service Unavailable', 'Não foi possível abrir a liberação agora.', {
      code: 'CHANNEL_ACTION_WINDOW_UNAVAILABLE'
    });
  }
  return toDto(window);
}

export async function getWhatsAppActionWindowService(userId: string): Promise<{ window: ActionWindowDto | null }> {
  const externalUserKey = await requireVerifiedPhone(userId);
  const window = await findLiveWhatsAppActionWindow({ userId, externalUserKey });
  return { window: window ? toDto(window) : null };
}

/**
 * REVOGAR AGORA. É o primeiro botão de pânico do runbook, e é instantâneo: a janela é lida do BANCO
 * no momento da queima do ticket, sem passar pelo cache de 30 s do registro de runtime.
 *
 * `windowId` escopado por `userId` no próprio `where` — ninguém revoga a janela de outra conta.
 */
export async function revokeWhatsAppActionWindowService(userId: string, windowId: string): Promise<void> {
  const revoked = await revokeWhatsAppActionWindow({ id: windowId, userId });
  if (!revoked) {
    throw new AppError(404, 'Not Found', 'Liberação não encontrada ou já encerrada.', {
      code: 'CHANNEL_ACTION_WINDOW_NOT_FOUND'
    });
  }
}
