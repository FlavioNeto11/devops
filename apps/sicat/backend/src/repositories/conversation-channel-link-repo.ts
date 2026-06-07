import { query } from '../db/pool.js';

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
