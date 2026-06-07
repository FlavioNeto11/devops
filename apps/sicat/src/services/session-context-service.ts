import { createPrefixedId } from '../lib/ids.js';
import { AppError } from '../lib/problem.js';
import { insertSessionContext, findSessionContextById } from '../repositories/session-context-repo.js';
import { ensureIntegrationAccount } from '../repositories/integration-account-repo.js';
import { createCetesbGateway } from '../gateways/cetesb-gateway.js';
import { getJwtExpirationIso } from '../lib/jwt.js';

const gateway = createCetesbGateway();

type LooseRecord = Record<string, unknown>;
type SessionContextBody = {
  integrationAccountId?: string;
  partnerCode?: string | null;
  partnerDocument?: string | null;
  partnerType?: string | null;
  userAccessCode?: string | null;
  userName?: string | null;
  email?: string | null;
  authMode?: string | null;
  jwtToken?: string | null;
  expiresAt?: string | null;
  metadata?: {
    stateCode?: string | null;
    credentials?: {
      password?: string | null;
    };
    [key: string]: unknown;
  };
};
type BootstrapGateway = {
  bootstrapSession(input: SessionContextBody): Promise<{
    token: string;
    expiresAt: string | null;
    authPayload?: {
      parCodigo?: string | null;
      paaCodigo?: string | null;
      paaNome?: string | null;
      email?: string | null;
    } | null;
  }>;
};

function withoutJwtToken<T extends { jwtToken: string | null }>(row: T): Omit<T, 'jwtToken'> {
  const { jwtToken: _jwtToken, ...rest } = row;
  return rest;
}

export async function createSessionContext(body: SessionContextBody) {
  if (!body?.integrationAccountId) {
    throw new AppError(400, 'Bad Request', 'integrationAccountId is required.');
  }

  await ensureIntegrationAccount(body.integrationAccountId, {
    partnerCode: body.partnerCode || null,
    partnerDocument: body.partnerDocument || null,
    stateCode: body.metadata?.stateCode || null
  });

  let jwtToken = body.jwtToken || null;
  let expiresAt = body.expiresAt || (jwtToken ? getJwtExpirationIso(jwtToken) : null);
  let bootstrapAuth = null;
  let status = jwtToken ? 'active' : 'pending_auth';

  if (!jwtToken && body.authMode !== 'manual-token') {
    const canBootstrap =
      Boolean(body.metadata?.credentials?.password) &&
      Boolean(body.partnerCode) &&
      Boolean(body.partnerDocument) &&
      Boolean(body.email);

    if (canBootstrap) {
      const boot = await (gateway as unknown as BootstrapGateway).bootstrapSession(body);
      jwtToken = boot.token;
      expiresAt = boot.expiresAt;
      bootstrapAuth = boot.authPayload || null;
      status = 'active';
    }
  }

  const id = createPrefixedId('scx');
  const row = await insertSessionContext({
    id,
    integrationAccountId: body.integrationAccountId,
    status,
    partnerDocument: body.partnerDocument || null,
    partnerType: body.partnerType || null,
    partnerCode: bootstrapAuth?.parCodigo ?? body.partnerCode ?? null,
    userAccessCode: bootstrapAuth?.paaCodigo ?? body.userAccessCode ?? null,
    userName: bootstrapAuth?.paaNome ?? body.userName ?? null,
    email: bootstrapAuth?.email ?? body.email ?? null,
    authMode: body.authMode || 'bootstrap',
    jwtToken,
    jwtTokenRef: `vault://mtr/session-contexts/${id}`,
    expiresAt,
    lastValidatedAt: jwtToken ? new Date().toISOString() : null,
    metadata: body.metadata || {}
  });

  if (!row) {
    throw new AppError(500, 'Internal Server Error', 'Failed to persist session context.');
  }
  return withoutJwtToken(row);
}

export async function getSessionContext(id: string) {
  const row = await findSessionContextById(id);
  if (!row) {
    throw new AppError(404, 'Not Found', `Session context ${id} was not found.`);
  }
  return withoutJwtToken(row);
}
