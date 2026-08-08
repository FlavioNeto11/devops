/**
 * Repositório dos desafios de verificação de canal (migration `020_channel_link_verifications.sql`).
 *
 * Guarda apenas o HASH do código (`hashPassword`, scrypt com salt por linha). Nenhuma função aqui
 * aceita ou devolve o código em claro — a comparação é sempre hash-contra-hash, feita pelo service
 * com `verifyPassword`.
 *
 * Duas invariantes moram no SQL, não no service, porque só o banco consegue garanti-las sob
 * concorrência:
 *  - a tentativa é incrementada e o hash devolvido no MESMO `update … returning` (sem isso, N
 *    requisições concorrentes leem `attempt_count = 0` e ganham N palpites paralelos — TOCTOU);
 *  - a expiração é avaliada por `expires_at > now()` DENTRO do `where`, nunca comparando
 *    `Date.now()` em JS depois de ler a linha.
 *
 * Toda função recebe `client: PoolClient | null` como PRIMEIRO argumento: `null` usa o pool
 * (`query`), um client usa a transação em curso. É o que permite ao `confirm` consumir o desafio e
 * gravar o vínculo atomicamente.
 */

import type { PoolClient, QueryResult, QueryResultRow } from 'pg';
import { query } from '../db/pool.js';

type IsoLike = Date | string | null | undefined;
type JsonObject = Record<string, unknown>;

type ChannelVerificationRow = {
  id: string;
  channel_type: string;
  external_user_key: string;
  user_id: string;
  code_hash: string;
  attempt_count: number | string;
  max_attempts: number | string;
  send_count: number | string;
  max_sends: number | string;
  last_sent_at: IsoLike;
  expires_at: IsoLike;
  consumed_at: IsoLike;
  outcome: string | null;
  delivery_status: string;
  provider_name: string | null;
  provider_message_id: string | null;
  delivery_error: string | null;
  correlation_id: string | null;
  metadata: JsonObject | null;
  created_at: IsoLike;
  updated_at: IsoLike;
};

export type ChannelVerificationOutcome =
  | 'verified'
  | 'expired'
  | 'exhausted'
  | 'cancelled'
  | 'superseded'
  | 'send_failed'
  | 'conflict';

export type ChannelVerificationDeliveryStatus =
  | 'pending'
  | 'sent'
  | 'failed'
  | 'delivered'
  | 'read'
  | 'undelivered';

/**
 * Registro do desafio. `codeHash` está aqui porque o service precisa dele para `verifyPassword` —
 * e é justamente por isso que NENHUM DTO de resposta HTTP pode ser este objeto: o mapper do service
 * escolhe campo a campo.
 */
export type ChannelVerificationRecord = {
  id: string;
  channelType: string;
  externalUserKey: string;
  userId: string;
  codeHash: string;
  attemptCount: number;
  maxAttempts: number;
  sendCount: number;
  maxSends: number;
  lastSentAt: string | null;
  expiresAt: string | null;
  consumedAt: string | null;
  outcome: ChannelVerificationOutcome | null;
  deliveryStatus: ChannelVerificationDeliveryStatus;
  providerName: string | null;
  providerMessageId: string | null;
  deliveryError: string | null;
  correlationId: string | null;
  metadata: JsonObject;
  createdAt: string | null;
  updatedAt: string | null;
};

export type InsertChannelVerificationInput = {
  id: string;
  channelType: string;
  externalUserKey: string;
  userId: string;
  codeHash: string;
  maxAttempts: number;
  maxSends: number;
  expiresAt: string;
  correlationId?: string | null;
  metadata?: JsonObject;
};

function toIso(value: IsoLike): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  return value;
}

function toCount(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function mapChannelVerification(row?: ChannelVerificationRow): ChannelVerificationRecord | null {
  if (!row) return null;
  return {
    id: row.id,
    channelType: row.channel_type,
    externalUserKey: row.external_user_key,
    userId: row.user_id,
    codeHash: row.code_hash,
    attemptCount: toCount(row.attempt_count),
    maxAttempts: toCount(row.max_attempts),
    sendCount: toCount(row.send_count),
    maxSends: toCount(row.max_sends),
    lastSentAt: toIso(row.last_sent_at),
    expiresAt: toIso(row.expires_at),
    consumedAt: toIso(row.consumed_at),
    outcome: (row.outcome as ChannelVerificationOutcome | null) ?? null,
    deliveryStatus: row.delivery_status as ChannelVerificationDeliveryStatus,
    providerName: row.provider_name,
    providerMessageId: row.provider_message_id,
    deliveryError: row.delivery_error,
    correlationId: row.correlation_id,
    metadata: row.metadata || {},
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  };
}

/** `null` = pool; client = transação em curso. */
async function run<T extends QueryResultRow = QueryResultRow>(
  client: PoolClient | null,
  text: string,
  params: readonly unknown[] = []
): Promise<QueryResult<T>> {
  if (client) return client.query<T>(text, [...params]);
  return query<T>(text, params);
}

export async function insertChannelVerification(
  client: PoolClient | null,
  input: InsertChannelVerificationInput
): Promise<ChannelVerificationRecord | null> {
  // `send_count = 1` já na criação: o que se conta é a TENTATIVA de envio, não o sucesso — senão um
  // provedor instável vira loop infinito de retry pago.
  const result = await run<ChannelVerificationRow>(
    client,
    `insert into conversation_channel_verifications(
       id,
       channel_type,
       external_user_key,
       user_id,
       code_hash,
       attempt_count,
       max_attempts,
       send_count,
       max_sends,
       last_sent_at,
       expires_at,
       delivery_status,
       correlation_id,
       metadata
     ) values ($1,$2,$3,$4,$5,0,$6,1,$7,now(),$8,'pending',$9,$10::jsonb)
     returning *`,
    [
      input.id,
      input.channelType,
      input.externalUserKey,
      input.userId,
      input.codeHash,
      input.maxAttempts,
      input.maxSends,
      input.expiresAt,
      input.correlationId || null,
      JSON.stringify(input.metadata || {})
    ]
  );
  return mapChannelVerification(result.rows[0]);
}

/**
 * Fecha os desafios vivos de um usuário. Usado pelo `start` (`superseded`, para a UI ter no máximo
 * um desafio pendente) e pela remoção de vínculo (`cancelled`, para não deixar código válido
 * circulando depois de desvincular). `externalUserKey` restringe a um número específico.
 */
export async function closeLiveChannelVerificationsByUser(
  client: PoolClient | null,
  input: {
    userId: string;
    channelType: string;
    outcome: ChannelVerificationOutcome;
    externalUserKey?: string | null;
    exceptId?: string | null;
  }
): Promise<number> {
  const result = await run(
    client,
    `update conversation_channel_verifications
        set consumed_at = now(),
            outcome = $3,
            updated_at = now()
      where user_id = $1
        and channel_type = $2
        and consumed_at is null
        and ($4::text is null or external_user_key = $4)
        and ($5::text is null or id <> $5)`,
    [input.userId, input.channelType, input.outcome, input.externalUserKey || null, input.exceptId || null]
  );
  return result.rowCount ?? 0;
}

/**
 * Fecha os desafios vivos de OUTROS usuários para o mesmo número. Chamado quando alguém prova posse:
 * a partir daí os códigos que os demais receberam não valem mais nada.
 */
export async function closeLiveChannelVerificationsByPhoneExcept(
  client: PoolClient | null,
  input: {
    channelType: string;
    externalUserKey: string;
    exceptUserId: string;
    outcome: ChannelVerificationOutcome;
  }
): Promise<number> {
  const result = await run(
    client,
    `update conversation_channel_verifications
        set consumed_at = now(),
            outcome = $4,
            updated_at = now()
      where channel_type = $1
        and external_user_key = $2
        and user_id <> $3
        and consumed_at is null`,
    [input.channelType, input.externalUserKey, input.exceptUserId, input.outcome]
  );
  return result.rowCount ?? 0;
}

/** Escopado por usuário: ninguém lê o desafio de outra conta. */
export async function findChannelVerificationById(
  client: PoolClient | null,
  id: string,
  userId: string
): Promise<ChannelVerificationRecord | null> {
  const result = await run<ChannelVerificationRow>(
    client,
    `select *
       from conversation_channel_verifications
      where id = $1
        and user_id = $2
      limit 1`,
    [id, userId]
  );
  return mapChannelVerification(result.rows[0]);
}

export async function findLiveChannelVerificationById(
  client: PoolClient | null,
  id: string,
  userId: string
): Promise<ChannelVerificationRecord | null> {
  const result = await run<ChannelVerificationRow>(
    client,
    `select *
       from conversation_channel_verifications
      where id = $1
        and user_id = $2
        and consumed_at is null
      limit 1`,
    [id, userId]
  );
  return mapChannelVerification(result.rows[0]);
}

/**
 * O desafio pendente que a tela retoma depois de um F5. Já filtra expirado. `externalUserKey`
 * restringe a um número específico — é o que o `start` usa para reler o desafio vivo quando duas
 * requisições concorrentes do mesmo usuário disputam o índice único vivo.
 */
export async function findLiveChannelVerificationByUser(
  client: PoolClient | null,
  userId: string,
  channelType: string,
  externalUserKey: string | null = null
): Promise<ChannelVerificationRecord | null> {
  const result = await run<ChannelVerificationRow>(
    client,
    `select *
       from conversation_channel_verifications
      where user_id = $1
        and channel_type = $2
        and consumed_at is null
        and expires_at > now()
        and ($3::text is null or external_user_key = $3)
      order by created_at desc
      limit 1`,
    [userId, channelType, externalUserKey]
  );
  return mapChannelVerification(result.rows[0]);
}

/**
 * A ÚLTIMA linha do par (usuário, tipo de canal), VIVA OU MORTA.
 *
 * Existe para desfechos que `findLiveChannelVerificationByUser` torna estruturalmente inalcançáveis:
 * o `where` dele filtra `consumed_at is null and expires_at > now()`, então um código digitado depois
 * da queima ou do TTL não encontra linha nenhuma — e "não há ticket" é indistinguível de "esse número
 * é texto comum", o que manda os 6 dígitos para o LLM. Para responder "essa confirmação já foi usada
 * às 14:32" é preciso ler a linha MORTA.
 *
 * ⚠️ `external_user_key` NÃO entra no `where`, de propósito. Quem compara telefone é o service. Um
 * `where` que já filtrasse o telefone tornaria a guarda de telefone do service INVISÍVEL — o double
 * de banco a satisfaria sozinho e a mutação "apague a comparação de telefone" sobreviveria. É a
 * lição que esta cadeia já pagou duas vezes.
 *
 * A janela (`maxAgeSeconds`) impede que um ticket antigo sequestre para sempre qualquer mensagem de
 * 6 dígitos deste usuário.
 */
export async function findRecentChannelVerificationByUser(
  client: PoolClient | null,
  input: { userId: string; channelType: string; maxAgeSeconds: number }
): Promise<ChannelVerificationRecord | null> {
  const result = await run<ChannelVerificationRow>(
    client,
    `select *
       from conversation_channel_verifications
      where user_id = $1
        and channel_type = $2
        and created_at > now() - make_interval(secs => $3::double precision)
      order by created_at desc
      limit 1`,
    [input.userId, input.channelType, input.maxAgeSeconds]
  );
  return mapChannelVerification(result.rows[0]);
}

/**
 * Acrescenta fatos ao `metadata` de uma linha JÁ FECHADA. Não toca `outcome` nem `consumed_at`.
 *
 * `closeChannelVerification` carrega `consumed_at is null` no `where` — é o portão de corrida da
 * queima — e por isso é incapaz de registrar o que aconteceu DEPOIS dela. Sem este statement, o
 * desfecho do despacho (o fato que diz se a ação saiu ou não) não teria onde ser gravado, e a linha
 * `verified` continuaria sendo lida como "executado".
 */
export async function patchChannelVerificationMetadata(
  client: PoolClient | null,
  input: { id: string; userId: string; metadataPatch: JsonObject }
): Promise<ChannelVerificationRecord | null> {
  const result = await run<ChannelVerificationRow>(
    client,
    `update conversation_channel_verifications
        set metadata = metadata || $3::jsonb,
            updated_at = now()
      where id = $1
        and user_id = $2
      returning *`,
    [input.id, input.userId, JSON.stringify(input.metadataPatch || {})]
  );
  return mapChannelVerification(result.rows[0]);
}

/**
 * Reenvio: ROTACIONA o código e renova o TTL num único statement, preservando `attempt_count`.
 * Rotacionar invalida no ato a mensagem que pode ter ido para um número digitado errado; preservar
 * as tentativas impede que o reenvio vire o bypass do limite de palpites.
 */
export async function rotateChannelVerificationCode(
  client: PoolClient | null,
  input: { id: string; userId: string; codeHash: string; expiresAt: string }
): Promise<ChannelVerificationRecord | null> {
  const result = await run<ChannelVerificationRow>(
    client,
    `update conversation_channel_verifications
        set code_hash = $3,
            expires_at = $4,
            send_count = send_count + 1,
            last_sent_at = now(),
            delivery_status = 'pending',
            delivery_error = null,
            provider_message_id = null,
            provider_name = null,
            updated_at = now()
      where id = $1
        and user_id = $2
        and consumed_at is null
        and send_count < max_sends
      returning *`,
    [input.id, input.userId, input.codeHash, input.expiresAt]
  );
  return mapChannelVerification(result.rows[0]);
}

/**
 * Cobra a tentativa e devolve o hash no MESMO statement. Sem linha devolvida não há sequer
 * `code_hash` para verificar — é o que fecha o TOCTOU do contador de OTP. `rowCount = 0` significa
 * cinco coisas (inexistente, de outro usuário, expirado, consumido, esgotado); desambiguar é papel
 * de um `select` POSTERIOR, que escolhe apenas a mensagem e nunca decide.
 */
export async function consumeChannelVerificationAttempt(
  client: PoolClient | null,
  input: { id: string; userId: string }
): Promise<ChannelVerificationRecord | null> {
  const result = await run<ChannelVerificationRow>(
    client,
    `update conversation_channel_verifications
        set attempt_count = attempt_count + 1,
            updated_at = now()
      where id = $1
        and user_id = $2
        and consumed_at is null
        and expires_at > now()
        and attempt_count < max_attempts
      returning *`,
    [input.id, input.userId]
  );
  return mapChannelVerification(result.rows[0]);
}

/**
 * DÉBITO ATÔMICO de uma SAÍDA PAGA do desafio — o irmão do statement acima, para o outro contador.
 *
 * `send_count < max_sends` mora no `where`, junto com o incremento: orçamento estourado devolve ZERO
 * linhas. Um `if` em JS sobre uma linha lida antes deixaria duas mensagens concorrentes passarem
 * juntas, do mesmo jeito que deixava no contador de tentativas.
 *
 * Separado de `rotateChannelVerificationCode` porque aquele ROTACIONA o código e RENOVA o TTL — usá-lo
 * para cobrar um lembrete de "sim" invalidaria, no ato, o código que a pessoa tem na mão.
 */
export async function consumeChannelVerificationSend(
  client: PoolClient | null,
  input: { id: string; userId: string }
): Promise<ChannelVerificationRecord | null> {
  const result = await run<ChannelVerificationRow>(
    client,
    `update conversation_channel_verifications
        set send_count = send_count + 1,
            last_sent_at = now(),
            updated_at = now()
      where id = $1
        and user_id = $2
        and consumed_at is null
        and send_count < max_sends
      returning *`,
    [input.id, input.userId]
  );
  return mapChannelVerification(result.rows[0]);
}

/**
 * Fechamento EXCLUSIVO: `consumed_at is null` no where faz deste o portão de corrida do confirm —
 * `rowCount = 1` ganhou, `rowCount = 0` perdeu (e o vencedor já gravou o vínculo).
 */
export async function closeChannelVerification(
  client: PoolClient | null,
  input: {
    id: string;
    outcome: ChannelVerificationOutcome;
    userId?: string | null;
    metadataPatch?: JsonObject;
  }
): Promise<ChannelVerificationRecord | null> {
  const result = await run<ChannelVerificationRow>(
    client,
    `update conversation_channel_verifications
        set consumed_at = now(),
            outcome = $3,
            metadata = metadata || $4::jsonb,
            updated_at = now()
      where id = $1
        and ($2::text is null or user_id = $2)
        and consumed_at is null
      returning *`,
    [input.id, input.userId || null, input.outcome, JSON.stringify(input.metadataPatch || {})]
  );
  return mapChannelVerification(result.rows[0]);
}

/**
 * Trilha de entrega. `sent` significa "o provedor ACEITOU", nunca "chegou no aparelho" — os estados
 * `delivered`/`read`/`undelivered` são alimentados pelos recibos do webhook na fase 3.
 */
export async function markChannelVerificationDelivery(
  client: PoolClient | null,
  input: {
    id: string;
    deliveryStatus: ChannelVerificationDeliveryStatus;
    providerName?: string | null;
    providerMessageId?: string | null;
    deliveryError?: string | null;
  }
): Promise<ChannelVerificationRecord | null> {
  const result = await run<ChannelVerificationRow>(
    client,
    `update conversation_channel_verifications
        set delivery_status = $2,
            provider_name = coalesce($3, provider_name),
            provider_message_id = coalesce($4, provider_message_id),
            delivery_error = $5,
            updated_at = now()
      where id = $1
      returning *`,
    [
      input.id,
      input.deliveryStatus,
      input.providerName || null,
      input.providerMessageId || null,
      input.deliveryError || null
    ]
  );
  return mapChannelVerification(result.rows[0]);
}

/**
 * Escudo da VÍTIMA: quantas contas distintas de TERCEIROS pediram código para este número na janela.
 * O limitador por usuário contém o atacante; só esta contagem fecha o bombing multi-conta contra um
 * mesmo número, que é o abuso que atinge quem nem é usuário do sistema.
 *
 * Três exclusões são o que impedem o escudo de trancar justamente a vítima:
 *  - `user_id <> $4` — o próprio solicitante NUNCA conta contra si mesmo. Sem isso, com o limiar em
 *    3, bastavam DUAS contas descartáveis para trancar o dono legítimo do número: a tentativa dele
 *    virava a terceira;
 *  - `outcome <> 'verified'` — desafio que terminou em posse PROVADA não é sinal de bombing, é o
 *    fluxo feliz. Contá-lo faria o dono se trancar sozinho ao re-verificar o próprio número;
 *  - `outcome <> 'send_failed'` — o único outcome terminal em que NENHUMA mensagem chegou ao
 *    aparelho: o provedor recusou o envio. O que este escudo mede é incômodo REAL no telefone da
 *    vítima, e um envio que nunca saiu não incomodou ninguém. Excluir só encolhe a contagem, então
 *    não abre bombing: o atacante não tem como preferir falhar. `cancelled` NÃO entra nesta lista —
 *    o `start` já despachou a mensagem antes de o solicitante cancelar, e cancelar depois seria um
 *    jeito barato de zerar o próprio rastro.
 */
export async function countDistinctChallengersForPhone(
  client: PoolClient | null,
  input: { channelType: string; externalUserKey: string; windowHours: number; exceptUserId: string }
): Promise<number> {
  const result = await run<{ total: string | number }>(
    client,
    `select count(distinct user_id) as total
       from conversation_channel_verifications
      where channel_type = $1
        and external_user_key = $2
        and created_at > now() - make_interval(hours => $3::int)
        and user_id <> $4
        and (outcome is null or outcome <> 'verified')
        and (outcome is null or outcome <> 'send_failed')`,
    [input.channelType, input.externalUserKey, input.windowHours, input.exceptUserId]
  );
  return toCount(result.rows[0]?.total);
}

/**
 * Higiene: fecha os expirados que ninguém tocou. Não é requisito de correção (o `where` atômico já
 * filtra por `expires_at`), só evita que a tabela acumule linhas vivas mortas. `limit` via subselect
 * para não travar a tabela inteira num pico.
 */
export async function sweepExpiredChannelVerifications(
  client: PoolClient | null,
  limit = 100
): Promise<number> {
  const result = await run(
    client,
    `update conversation_channel_verifications
        set consumed_at = now(),
            outcome = 'expired',
            updated_at = now()
      where id in (
        select id
          from conversation_channel_verifications
         where consumed_at is null
           and expires_at < now()
         order by expires_at
         limit $1
      )`,
    [limit]
  );
  return result.rowCount ?? 0;
}
