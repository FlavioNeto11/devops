/**
 * Principal conversacional — a identidade CONFIÁVEL de um turno.
 *
 * Antes desta camada, `channel`, `userId`, `integrationAccountId` e `sessionContextId` chegavam
 * auto-declarados no corpo de `POST /v1/conversations/turns`. Como a matriz de policy é indexada por
 * canal (`conversation-policy-service.ts` → `allowChannels`), qualquer cliente que declarasse
 * `channel: 'inapp'` escapava de TODO bloqueio de canal — e qualquer `integrationAccountId` de outro
 * usuário era aceito sem checagem de posse.
 *
 * O principal fecha isso: é montado no servidor a partir do token SICAT já verificado e **vence o
 * corpo da requisição**. O corpo continua podendo carregar contexto de tela (rota, manifesto em foco,
 * dicas de campo) — o que ele não pode mais é dizer QUEM é o usuário nem POR ONDE ele fala.
 *
 * Dois construtores, um por origem:
 *  - `resolveHttpPrincipal`    — clientes HTTP autenticados (chat nativo, copiloto in-app).
 *  - `resolveChannelPrincipal` — adaptadores de canal externo (WhatsApp), executados server-side a
 *                                partir de um vínculo já verificado em `conversation_channel_links`.
 *
 * REGRA DURA: `whatsapp` NUNCA é declarável por um cliente HTTP. Só o adaptador de canal o produz.
 * É isso que impede que a política restritiva do WhatsApp seja contornada — e, na direção oposta,
 * que um navegador se passe por WhatsApp para explorar um caminho menos exercitado.
 */

import { AppError } from '../../lib/problem.js';
import { listPermissionKeysByUserId } from '../../repositories/access-admin-repo.js';
import { resolveActiveAccountContext } from '../sicat-account-service.js';
import type { ConversationChannel } from './conversation-context-service.js';

/** Canais que um cliente HTTP autenticado pode declarar. Deliberadamente NÃO inclui `whatsapp`. */
const CLIENT_DECLARABLE_CHANNELS = new Set<ConversationChannel>(['native_chat', 'inapp']);

export type ConversationPrincipal = {
  /** Canal efetivo do turno. Resolvido no servidor — nunca copiado cru do corpo. */
  channel: ConversationChannel;
  /** `sicat_users.id` do token verificado, ou o usuário vinculado ao canal externo. */
  userId: string;
  /** Conta CETESB ativa do usuário, lida do banco. `null` = ainda não escolheu conta. */
  integrationAccountId: string | null;
  /** Sessão CETESB corrente da conta ativa. `null` = sem bootstrap de sessão ainda. */
  sessionContextId: string | null;
  /** Chave estável de sessão conversacional, derivada da identidade — não do cliente. */
  channelSessionKey: string;
  /** Permissões efetivas resolvidas no servidor (hoje `[]` — ver `listPermissionKeysByUserId`). */
  permissionKeys: string[];
  /** Rótulo de autoria para trilha de auditoria. */
  requestedBy: string;
};

export type AuthenticatedSicatUser = {
  userId: string;
  email?: string;
  name?: string;
  roles?: string[];
};

function normalizeDeclaredChannel(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

/**
 * Valida o canal declarado por um cliente HTTP.
 *
 * Ausente → `inapp` (retrocompatível: o copiloto in-app é o caminho mais restrito dos dois de
 * navegador, e ambos têm exatamente os mesmos `allowChannels` em todas as tools).
 * Desconhecido → 400. `whatsapp` → 403 explícito, porque é tentativa de assumir um canal de servidor.
 */
function requireClientChannel(value: unknown): ConversationChannel {
  const declared = normalizeDeclaredChannel(value);
  if (!declared) return 'inapp';

  if (declared === 'whatsapp') {
    throw new AppError(
      403,
      'Forbidden',
      'O canal `whatsapp` é atribuído pelo adaptador de canal do servidor e não pode ser declarado por um cliente HTTP.',
      { code: 'CONVERSATION_CHANNEL_NOT_CLIENT_DECLARABLE' }
    );
  }

  if (!CLIENT_DECLARABLE_CHANNELS.has(declared as ConversationChannel)) {
    throw new AppError(
      400,
      'Bad Request',
      `Canal conversacional inválido: \`${declared}\`. Valores aceitos: ${[...CLIENT_DECLARABLE_CHANNELS].join(', ')}.`,
      { code: 'CONVERSATION_CHANNEL_INVALID' }
    );
  }

  return declared as ConversationChannel;
}

/**
 * Chave de sessão conversacional. Determinística e derivada só de dados confiáveis, para que o mesmo
 * usuário na mesma conta retome a mesma sessão (o índice único parcial
 * `(channel_type, channel_session_key)` faz o upsert reaproveitar a linha existente).
 */
function buildChannelSessionKey(
  channel: ConversationChannel,
  userId: string,
  integrationAccountId: string | null
): string {
  return [channel, userId, integrationAccountId || 'no-account'].join(':');
}

function buildRequestedBy(user: AuthenticatedSicatUser): string {
  return user.email || user.name || user.userId;
}

/**
 * Principal de um cliente HTTP autenticado. `sicatUser` vem de `sicatAuthMiddleware`, ou seja, de um
 * access token SICAT cuja assinatura já foi verificada.
 */
export async function resolveHttpPrincipal(input: {
  sicatUser: AuthenticatedSicatUser;
  declaredChannel?: unknown;
}): Promise<ConversationPrincipal> {
  const channel = requireClientChannel(input.declaredChannel);
  const userId = String(input.sicatUser.userId || '').trim();

  if (!userId) {
    throw new AppError(401, 'Unauthorized', 'Token SICAT sem identificação de usuário.', {
      code: 'CONVERSATION_PRINCIPAL_UNRESOLVED'
    });
  }

  // Conta ativa e permissões saem do banco, não do corpo. Em paralelo: são leituras independentes.
  const [accountContext, permissionKeys] = await Promise.all([
    resolveActiveAccountContext(userId),
    listPermissionKeysByUserId(userId)
  ]);

  const integrationAccountId = accountContext?.integrationAccountId || null;

  return {
    channel,
    userId,
    integrationAccountId,
    sessionContextId: accountContext?.sessionContextId || null,
    channelSessionKey: buildChannelSessionKey(channel, userId, integrationAccountId),
    permissionKeys,
    requestedBy: buildRequestedBy(input.sicatUser)
  };
}

/**
 * Principal de um canal externo (WhatsApp). Só é construído DEPOIS de resolver o número para um
 * vínculo `verified` em `conversation_channel_links` — quem faz essa resolução é o adaptador, não
 * esta função. Aqui já se assume identidade estabelecida.
 *
 * `externalUserKey` (o telefone E.164) entra na chave de sessão para que cada número tenha a sua
 * própria conversa, mesmo que dois números apontem para o mesmo usuário SICAT.
 */
export async function resolveChannelPrincipal(input: {
  channel: Exclude<ConversationChannel, 'native_chat' | 'inapp'>;
  userId: string;
  externalUserKey: string;
  integrationAccountId?: string | null;
  requestedBy?: string | null;
}): Promise<ConversationPrincipal> {
  const userId = String(input.userId || '').trim();
  const externalUserKey = String(input.externalUserKey || '').trim();

  if (!userId || !externalUserKey) {
    throw new AppError(
      401,
      'Unauthorized',
      'Principal de canal externo exige usuário SICAT vinculado e identificador externo.',
      { code: 'CONVERSATION_PRINCIPAL_UNRESOLVED' }
    );
  }

  const [accountContext, permissionKeys] = await Promise.all([
    resolveActiveAccountContext(userId),
    listPermissionKeysByUserId(userId)
  ]);

  // O vínculo do canal pode fixar uma conta específica; senão vale a conta ativa do usuário.
  const integrationAccountId = input.integrationAccountId
    || accountContext?.integrationAccountId
    || null;

  return {
    channel: input.channel,
    userId,
    integrationAccountId,
    sessionContextId: accountContext?.sessionContextId || null,
    channelSessionKey: `${input.channel}:${externalUserKey}`,
    permissionKeys,
    requestedBy: input.requestedBy || externalUserKey
  };
}
