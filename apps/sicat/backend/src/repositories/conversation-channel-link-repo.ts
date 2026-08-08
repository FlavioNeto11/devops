import type { PoolClient, QueryResult, QueryResultRow } from 'pg';
import { query } from '../db/pool.js';
import { AppError } from '../lib/problem.js';

type JsonObject = Record<string, unknown>;
type IsoLike = Date | string | null | undefined;

type ConversationChannelLinkRow = {
  id: string;
  channel_type: string;
  external_user_key: string;
  user_id: string | null;
  integration_account_id: string | null;
  verification_status: string;
  verified_at: IsoLike;
  metadata: JsonObject | null;
  created_at: IsoLike;
  updated_at: IsoLike;
};

function toIso(value: IsoLike): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  return value;
}

function mapConversationChannelLink(row?: ConversationChannelLinkRow) {
  if (!row) return null;
  return {
    id: row.id,
    channelType: row.channel_type,
    externalUserKey: row.external_user_key,
    userId: row.user_id,
    integrationAccountId: row.integration_account_id,
    verificationStatus: row.verification_status,
    verifiedAt: toIso(row.verified_at),
    metadata: row.metadata || {},
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  };
}

export async function upsertConversationChannelLink(input: {
  id: string;
  channelType: string;
  externalUserKey: string;
  userId?: string | null;
  integrationAccountId?: string | null;
  verificationStatus?: string;
  verifiedAt?: string | null;
  metadata?: JsonObject;
}) {
  const result = await query<ConversationChannelLinkRow>(
    `insert into conversation_channel_links(
      id,
      channel_type,
      external_user_key,
      user_id,
      integration_account_id,
      verification_status,
      verified_at,
      metadata
    ) values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
    on conflict (channel_type, external_user_key) do update set
      user_id = coalesce(excluded.user_id, conversation_channel_links.user_id),
      integration_account_id = coalesce(excluded.integration_account_id, conversation_channel_links.integration_account_id),
      verification_status = coalesce(excluded.verification_status, conversation_channel_links.verification_status),
      verified_at = coalesce(excluded.verified_at, conversation_channel_links.verified_at),
      metadata = coalesce(excluded.metadata, conversation_channel_links.metadata),
      updated_at = now()
    returning *`,
    [
      input.id,
      input.channelType,
      input.externalUserKey,
      input.userId || null,
      input.integrationAccountId || null,
      input.verificationStatus || 'pending',
      input.verifiedAt || null,
      JSON.stringify(input.metadata || {})
    ]
  );
  return mapConversationChannelLink(result.rows[0]);
}

export async function findConversationChannelLink(channelType: string, externalUserKey: string) {
  const result = await query<ConversationChannelLinkRow>(
    `select *
       from conversation_channel_links
      where channel_type = $1
        and external_user_key = $2
      limit 1`,
    [channelType, externalUserKey]
  );
  return mapConversationChannelLink(result.rows[0]);
}

/*
 * ---------------------------------------------------------------------------------------------
 * Fase 2 da cadeia `whatsapp-channel-sicat` — vínculo por OTP.
 *
 * As funções abaixo recebem `client: PoolClient | null` como PRIMEIRO argumento (`null` = pool)
 * porque a confirmação do OTP precisa lockar o vínculo, decidir a posse e gravar dentro de UMA
 * transação. As duas funções acima continuam com a assinatura original, intocadas.
 * ---------------------------------------------------------------------------------------------
 */

/** `null` = pool; client = transação em curso. */
async function run<T extends QueryResultRow = QueryResultRow>(
  client: PoolClient | null,
  text: string,
  params: readonly unknown[] = []
): Promise<QueryResult<T>> {
  if (client) return client.query<T>(text, [...params]);
  return query<T>(text, params);
}

export async function listConversationChannelLinksByUser(
  client: PoolClient | null,
  userId: string,
  channelType: string
) {
  const result = await run<ConversationChannelLinkRow>(
    client,
    `select *
       from conversation_channel_links
      where user_id = $1
        and channel_type = $2
      order by created_at desc`,
    [userId, channelType]
  );
  return result.rows
    .map((row) => mapConversationChannelLink(row))
    .filter((row): row is NonNullable<ReturnType<typeof mapConversationChannelLink>> => row !== null);
}

export async function findConversationChannelLinkById(
  client: PoolClient | null,
  id: string,
  userId: string
) {
  const result = await run<ConversationChannelLinkRow>(
    client,
    `select *
       from conversation_channel_links
      where id = $1
        and user_id = $2
      limit 1`,
    [id, userId]
  );
  return mapConversationChannelLink(result.rows[0]);
}

/**
 * Vínculo por id, SEM escopo de usuário — para o worker do canal (fase 3).
 *
 * A irmã `findConversationChannelLinkById` exige `userId` porque atende a superfície autenticada
 * (o dono lendo os próprios vínculos). Aqui é o oposto: o job de mensagem recebida deliberadamente
 * **não** carrega `userId` no payload, para que a revogação seja efetiva — quem manda é a linha
 * RELIDA no momento da execução, não uma cópia congelada na fila. Passar o `userId` do payload como
 * filtro reintroduziria exatamente o congelamento que se quis evitar.
 *
 * O chamador é obrigado a conferir `verificationStatus === 'verified'`: esta função devolve a linha
 * como ela está, inclusive `pending`.
 */
export async function findConversationChannelLinkForChannel(
  client: PoolClient | null,
  id: string
) {
  const result = await run<ConversationChannelLinkRow>(
    client,
    `select *
       from conversation_channel_links
      where id = $1
      limit 1`,
    [id]
  );
  return mapConversationChannelLink(result.rows[0]);
}

/**
 * Acrescenta chaves ao `metadata` do vínculo, sem reescrever o que já está lá (fase 6).
 *
 * O merge é feito pelo POSTGRES (`||` de jsonb), não em JavaScript: um read-modify-write daria lost
 * update entre o pod da api (webhook) e o worker do canal, e a dívida de aviso — que é justamente o
 * que mora aqui — sumiria sem erro nenhum.
 *
 * Só ACRESCENTA no primeiro nível; passar `{ pendingNotices: [...] }` SUBSTITUI o array inteiro, que
 * é o comportamento desejado (quem monta a lista já aplicou teto e TTL antes de materializar).
 */
export async function patchConversationChannelLinkMetadata(
  client: PoolClient | null,
  input: { id: string; metadataPatch: JsonObject }
) {
  const result = await run<ConversationChannelLinkRow>(
    client,
    `update conversation_channel_links
        set metadata = coalesce(metadata, '{}'::jsonb) || $2::jsonb,
            updated_at = now()
      where id = $1
      returning *`,
    [input.id, JSON.stringify(input.metadataPatch || {})]
  );
  return mapConversationChannelLink(result.rows[0]);
}

/** Teto de vínculos por usuário. Conta só o que já está verificado — `pending` não ocupa vaga. */
export async function countConversationChannelLinksByUser(
  client: PoolClient | null,
  userId: string,
  channelType: string
): Promise<number> {
  const result = await run<{ total: string | number }>(
    client,
    `select count(*) as total
       from conversation_channel_links
      where user_id = $1
        and channel_type = $2
        and verification_status = 'verified'`,
    [userId, channelType]
  );
  const total = Number(result.rows[0]?.total ?? 0);
  return Number.isFinite(total) ? total : 0;
}

/**
 * Serializa POR USUÁRIO tudo o que decide o teto de vínculos. O lock de linha do telefone não fecha
 * esse TOCTOU: quando o número ainda não existe, o `select … for update` não trava nada, e duas
 * confirmações concorrentes de telefones DIFERENTES leem o mesmo `count` e gravam as duas — usuário
 * com teto 3 termina com 4 vínculos (cada vínculo extra é, na fase 3, mais uma porta de entrada
 * conversacional com acesso pleno à conta).
 *
 * `_xact_` porque o lock morre com a transação (commit OU rollback) — não há como vazar um lock por
 * caminho de erro. A chave é namespaced (`channel_link:<userId>`) para não colidir com nenhum outro
 * uso de advisory lock no processo.
 *
 * **`pg_TRY_advisory_xact_lock`, nunca a variante bloqueante.** Quando chegamos aqui a transação já
 * tomou uma das 10 conexões do pool (`withTransaction` conecta ANTES de qualquer statement), então
 * esperar no lock não segura só a operação: segura a CONEXÃO. 10 confirmações concorrentes do mesmo
 * usuário serializariam prendendo as 10 conexões, e TODA a API (health, manifestos, worker)
 * passaria a estourar o `connectionTimeout` de 5 s — uma disputa local viraria indisponibilidade
 * global. `set local lock_timeout` também resolveria o pior caso, mas ainda paga a espera com a
 * conexão na mão; a versão `try` devolve em UM round-trip, sem espera nenhuma.
 *
 * O preço é explícito: quem perde a corrida recebe 409 `CHANNEL_LINK_CONCURRENT_OPERATION` (código
 * estável, retentável) em vez de ser enfileirado. Duas confirmações realmente simultâneas do MESMO
 * usuário são double-click ou retry de cliente — o certo é o segundo repetir, não o primeiro
 * derrubar a API. Nada foi escrito quando o lock é tomado, então a recusa não deixa estado sujo.
 *
 * Ordem de aquisição SEMPRE: advisory (usuário) → linha do vínculo (telefone). Inverter abriria
 * ciclo de deadlock entre duas confirmações cruzadas.
 *
 * A recusa mora AQUI, e não no chamador, de propósito: só este módulo sabe que o statement virou
 * booleano em vez de bloquear. Devolver `false` para o service conferir seria uma guarda que dá para
 * esquecer — e esquecê-la voltaria a permitir duas transações concorrentes no mesmo escopo, em
 * silêncio.
 */
export async function lockChannelLinkUserScope(client: PoolClient, userId: string): Promise<void> {
  const result = await run<{ acquired: boolean | null }>(
    client,
    `select pg_try_advisory_xact_lock(hashtext($1)) as acquired`,
    [`channel_link:${userId}`]
  );
  if (result.rows[0]?.acquired !== true) {
    throw new AppError(
      409,
      'Conflict',
      'Outra operação de vínculo deste usuário está em andamento. Tente novamente em instantes.',
      { code: 'CHANNEL_LINK_CONCURRENT_OPERATION' }
    );
  }
}

/**
 * Lock da linha do vínculo pelo par (canal, telefone). Serializa duas confirmações concorrentes para
 * o MESMO número — sem isso, duas contas com códigos válidos poderiam decidir a posse em paralelo.
 * Só faz sentido dentro de uma transação.
 */
export async function findConversationChannelLinkForUpdate(
  client: PoolClient,
  channelType: string,
  externalUserKey: string
) {
  const result = await run<ConversationChannelLinkRow>(
    client,
    `select *
       from conversation_channel_links
      where channel_type = $1
        and external_user_key = $2
      limit 1
        for update`,
    [channelType, externalUserKey]
  );
  return mapConversationChannelLink(result.rows[0]);
}

/**
 * Grava o vínculo VERIFICADO depois da posse provada. É a única escrita do fluxo de OTP em
 * `conversation_channel_links`.
 *
 * Existe separada de `upsertConversationChannelLink` porque aquela faz
 * `user_id = coalesce(excluded.user_id, …)`: ela sobrescreve o dono sem erro e sem decisão, o que
 * tornaria o OTP decorativo. O `unique (channel_type, external_user_key)` da 011 garante uma LINHA
 * por número, NÃO um dono. Aqui a troca de dono só acontece quando o predicado permite:
 * linha órfã, mesmo dono, ou transferência explicitamente autorizada. `rowCount = 0` (nenhuma linha
 * devolvida) significa conflito de posse — o service decide o erro. O predicado no SQL é o cinto de
 * segurança: mesmo chamada errado, esta função não rouba um número em silêncio.
 */
export async function claimConversationChannelLink(
  client: PoolClient,
  input: {
    id: string;
    channelType: string;
    externalUserKey: string;
    userId: string;
    allowTransfer: boolean;
    metadata?: JsonObject;
  }
) {
  const result = await run<ConversationChannelLinkRow>(
    client,
    `insert into conversation_channel_links(
       id,
       channel_type,
       external_user_key,
       user_id,
       integration_account_id,
       verification_status,
       verified_at,
       metadata
     ) values ($1,$2,$3,$4,null,'verified',now(),$5::jsonb)
     on conflict (channel_type, external_user_key) do update set
       user_id = excluded.user_id,
       -- Zerar a conta de integração é OBRIGATÓRIO na TRANSFERÊNCIA de posse: resolveChannelPrincipal
       -- prioriza o integration_account_id do vínculo sobre a conta ativa do usuário, então preservar
       -- o valor do dono ANTERIOR faria o novo dono entrar no canal amarrado à conta CETESB de outra
       -- pessoa. A conta correta é escolhida de novo depois do vínculo, nunca herdada.
       --
       -- Mas SÓ na transferência. Re-verificar o próprio número é fluxo explicitamente suportado
       -- (o start nem trata isso como erro), e zerar incondicionalmente derrubava a escolha de
       -- conta do PRÓPRIO dono a cada re-verificação — perda de estado silenciosa, sem transferência
       -- nenhuma. O case compara o dono ATUAL da linha com o que está entrando: iguais = preserva,
       -- diferentes (ou linha órfã, cujo user_id é null e portanto nunca "igual") = zera.
       integration_account_id = case
         when conversation_channel_links.user_id = excluded.user_id
           then conversation_channel_links.integration_account_id
         else null
       end,
       verification_status = 'verified',
       verified_at = now(),
       metadata = excluded.metadata,
       updated_at = now()
     where conversation_channel_links.user_id is null
        or conversation_channel_links.user_id = excluded.user_id
        or $6::boolean
     returning *`,
    [
      input.id,
      input.channelType,
      input.externalUserKey,
      input.userId,
      JSON.stringify(input.metadata || {}),
      input.allowTransfer
    ]
  );
  return mapConversationChannelLink(result.rows[0]);
}

/**
 * DELETE físico, escopado por `id + user_id`. Soft delete é impossível aqui: o
 * `unique (channel_type, external_user_key)` da 011 bloquearia um futuro re-vínculo do mesmo número.
 * A história sobrevive na 020 e na auditoria.
 */
export async function deleteConversationChannelLinkById(
  client: PoolClient | null,
  id: string,
  userId: string
) {
  const result = await run<ConversationChannelLinkRow>(
    client,
    `delete from conversation_channel_links
      where id = $1
        and user_id = $2
      returning *`,
    [id, userId]
  );
  return mapConversationChannelLink(result.rows[0]);
}
