import { config } from '../lib/config.js';
import { createPrefixedId } from '../lib/ids.js';
import { AppError } from '../lib/problem.js';
import { login as loginCetesb } from './auth-service.js';
import {
  listByUserId,
  insert as insertCetesbAccount,
  findByIdAndUserId,
  deactivateAllByUserId,
  activateById,
  deleteByIdAndUserId
} from '../repositories/sicat-cetesb-account-repo.js';
import { ensureIntegrationAccount } from '../repositories/integration-account-repo.js';
import {
  insertSessionContext,
  updateSessionContext,
  findLatestActiveSessionContextByIntegrationAccount
} from '../repositories/session-context-repo.js';
import { createCetesbGateway } from '../gateways/cetesb-gateway.js';
import { decryptSecret, encryptSecret } from '../lib/sicat-security.js';
import { toSicatUserResponse } from './sicat-auth-service.js';

type LooseRecord = Record<string, unknown>;
type SicatUserInput = {
  userId: string;
  id?: string;
  email?: string;
  name?: string | null;
  passwordHash?: string;
  isActive?: boolean;
};
type SicatAccountEntity = {
  id: string;
  userId: string;
  partnerCode: string | null;
  partnerDocument: string | null;
  partnerName: string | null;
  accountType: string;
  cetesbLogin: string | null;
  cetesbEmail: string | null;
  cetesbPasswordCiphertext: string | null;
  cetesbPasswordIv: string | null;
  cetesbPasswordTag: string | null;
  lastConnectionAt: string | Date | null;
  lastUsageAt: string | Date | null;
  usageSummary: Record<string, unknown> | null;
  isActive: boolean;
};
type SessionContextSummary = {
  id: string;
  integrationAccountId: string;
  status: string;
  jwtTokenRef?: string | null;
};
type SicatUserForResponse = {
  id: string;
  email: string;
  name?: string | null;
  passwordHash: string;
  isActive?: boolean;
};
type CetesbAuthResponse = {
  token: string;
  expiresAt: string | null;
  user?: {
    name?: string;
    email?: string;
  };
  partner?: {
    accountType?: string;
    partnerCode?: string | number | null;
    document?: string;
    description?: string;
  };
};
type BootstrapResult = {
  token: string;
  expiresAt: string | null;
  authPayload?: {
    cookieHeader?: string | null;
    paaCodigo?: string | number | null;
    paaNome?: string | null;
  } | null;
};
type GatewayBootstrap = {
  bootstrapSession(input: LooseRecord): Promise<BootstrapResult>;
};

let gatewayBootstrapOverrideFactory: (() => GatewayBootstrap) | null = null;

export function setSicatAccountGatewayOverrideForTests(factory: (() => GatewayBootstrap) | null): void {
  gatewayBootstrapOverrideFactory = factory;
}

function getGateway() {
  if (gatewayBootstrapOverrideFactory) {
    return gatewayBootstrapOverrideFactory();
  }
  return createCetesbGateway();
}

function getErrorCode(error: unknown): string | null {
  if (error && typeof error === 'object' && 'code' in error && typeof (error as { code: unknown }).code === 'string') {
    return (error as { code: string }).code;
  }
  return null;
}

function toPrimitiveString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  return '';
}

function toTrimmedString(value: unknown): string {
  return toPrimitiveString(value).trim();
}

function toNullableString(value: unknown): string | null {
  const normalized = toTrimmedString(value);
  return normalized || null;
}

function toStringOrNull(value: unknown): string | null {
  return value == null ? null : toPrimitiveString(value);
}

function assertEncryptedCredentials(account: SicatAccountEntity): void {
  if (!account.cetesbPasswordCiphertext || !account.cetesbPasswordIv || !account.cetesbPasswordTag) {
    throw new AppError(400, 'Bad Request', 'Conta CETESB sem credenciais criptografadas completas para ativação.', {
      code: 'CETESB_ACCOUNT_INCOMPLETE'
    });
  }
}

function decryptAccountPassword(account: SicatAccountEntity): string {
  assertEncryptedCredentials(account);

  try {
    return decryptSecret({
      ciphertext: account.cetesbPasswordCiphertext as string,
      iv: account.cetesbPasswordIv as string,
      tag: account.cetesbPasswordTag as string
    }, {
      secret: config.sicatCetesbPasswordSecret
    });
  } catch {
    throw new AppError(500, 'Internal Server Error', 'Falha ao descriptografar credenciais CETESB da conta selecionada.', {
      code: 'CETESB_ACCOUNT_DECRYPT_FAILED'
    });
  }
}

function buildSessionContextPayload(context: {
  account: SicatAccountEntity;
  partnerType: string | null;
  partnerCode: number | null;
  email: string;
  boot: BootstrapResult;
  nowIso: string;
  metadata: Record<string, unknown>;
  jwtTokenRef: string;
}) {
  return {
    status: 'active',
    partnerDocument: context.account.partnerDocument,
    partnerType: context.partnerType,
    partnerCode: toStringOrNull(context.partnerCode),
    userAccessCode: toStringOrNull(context.boot?.authPayload?.paaCodigo),
    userName: context.boot?.authPayload?.paaNome ?? null,
    email: context.email,
    authMode: 'manual-token',
    jwtToken: context.boot.token,
    jwtTokenRef: context.jwtTokenRef,
    expiresAt: context.boot.expiresAt || null,
    lastValidatedAt: context.nowIso,
    metadata: context.metadata
  };
}

function toUsageSummary(value: unknown) {
  const input = (value && typeof value === 'object' && !Array.isArray(value))
    ? value as Record<string, unknown>
    : {};
  return {
    manifestsCreated: Number(input.manifestsCreated || 0),
    manifestsSubmitted: Number(input.manifestsSubmitted || 0),
    manifestsPrinted: Number(input.manifestsPrinted || 0),
    manifestsCancelled: Number(input.manifestsCancelled || 0)
  };
}

function toAccountCard(account: SicatAccountEntity | null | undefined) {
  if (!account) return null;
  return {
    accountId: account.id,
    partnerCode: Number(account.partnerCode || 0),
    partnerDocument: account.partnerDocument || '',
    partnerName: account.partnerName || '',
    accountType: account.accountType || 'unknown',
    lastConnectionAt: account.lastConnectionAt || null,
    lastUsageAt: account.lastUsageAt || null,
    usageSummary: toUsageSummary(account.usageSummary),
    isActive: Boolean(account.isActive)
  };
}

function buildIntegrationAccountId(account: Pick<SicatAccountEntity, 'id'>) {
  return `acc_${account.id}`;
}

function toSessionContextSummary(sessionContext: SessionContextSummary | null | undefined) {
  if (!sessionContext) return null;
  return {
    sessionContextId: sessionContext.id,
    integrationAccountId: sessionContext.integrationAccountId,
    status: sessionContext.status
  };
}

function resolvePartnerType(partnerDocument: string | null | undefined) {
  const digits = String(partnerDocument || '').replaceAll(/\D/g, '');
  if (digits.length === 14) return 'J';
  if (digits.length === 11) return 'F';
  return null;
}

function parsePartnerCode(value: unknown): number | null {
  if (value === undefined || value === null) {
    return null;
  }

  return Number(value);
}

function toSicatUserForResponse(user: SicatUserInput): SicatUserForResponse {
  return {
    id: String(user.id || user.userId),
    email: String(user.email || ''),
    name: user.name || null,
    passwordHash: String(user.passwordHash || '***'),
    isActive: user.isActive
  };
}

function assertEncryptionKeyConfigured() {
  if (!config.sicatCetesbPasswordSecret || String(config.sicatCetesbPasswordSecret).length < 16) {
    throw new AppError(500, 'Internal Server Error', 'Segredo de criptografia CETESB inválido no backend.', {
      code: 'SICAT_CETESB_PASSWORD_SECRET_INVALID'
    });
  }
}

export async function listSicatCetesbAccounts(sicatUser: SicatUserInput) {
  const accounts = (await listByUserId(sicatUser.userId)) as SicatAccountEntity[];
  const active = accounts.find((item) => item.isActive) || null;
  return {
    activeAccountId: active?.id || null,
    accounts: accounts.map(toAccountCard)
  };
}

export async function addSicatCetesbAccount(sicatUser: SicatUserInput, payload: LooseRecord) {
  const login = toTrimmedString(payload?.login);
  const password = toPrimitiveString(payload?.password);
  const email = toTrimmedString(payload?.email);
  const partnerCode = parsePartnerCode(payload?.partnerCode);
  const recaptchaToken = toPrimitiveString(payload?.recaptchaToken);

  if (!login || !password) {
    throw new AppError(400, 'Bad Request', 'Campos obrigatórios ausentes: login e password.', {
      code: 'MISSING_CETESB_CREDENTIALS'
    });
  }

  assertEncryptionKeyConfigured();

  const auth = await loginCetesb({
    login,
    password,
    email,
    parCodigo: partnerCode,
    recaptchaToken
  }) as CetesbAuthResponse;

  const encryptedPassword = encryptSecret(password, {
    secret: config.sicatCetesbPasswordSecret
  });

  const accountType = String(auth?.partner?.accountType || '').trim().toLowerCase();
  if (!['generator', 'carrier', 'receiver'].includes(accountType)) {
    throw new AppError(502, 'Bad Gateway', 'Tipo da conta CETESB não foi retornado corretamente no login.', {
      code: 'CETESB_ACCOUNT_TYPE_MISSING'
    });
  }

  try {
    const inserted = await insertCetesbAccount({
      id: createPrefixedId('acc'),
      userId: sicatUser.userId,
      partnerCode: String(auth?.partner?.partnerCode || partnerCode || ''),
      partnerDocument: auth?.partner?.document || login,
      partnerName: auth?.partner?.description || auth?.user?.name || 'Conta CETESB',
      accountType,
      cetesbLogin: login,
      cetesbEmail: email || auth?.user?.email || null,
      cetesbPasswordCiphertext: encryptedPassword.ciphertext,
      cetesbPasswordIv: encryptedPassword.iv,
      cetesbPasswordTag: encryptedPassword.tag,
      lastConnectionAt: new Date().toISOString(),
      lastUsageAt: null,
      usageSummary: {
        manifestsCreated: 0,
        manifestsSubmitted: 0,
        manifestsPrinted: 0,
        manifestsCancelled: 0
      },
      isActive: false
    });

    return toAccountCard(inserted as SicatAccountEntity | null | undefined);
  } catch (error: unknown) {
    if (getErrorCode(error) === '23505') {
      throw new AppError(409, 'Conflict', 'Conta CETESB já vinculada para este usuário SICAT.', {
        code: 'CETESB_ACCOUNT_ALREADY_LINKED'
      });
    }
    throw error;
  }
}

export async function activateSicatCetesbAccount(sicatUser: SicatUserInput, accountId: string) {
  const gateway = getGateway() as unknown as GatewayBootstrap;

  const account = await findByIdAndUserId(accountId, sicatUser.userId) as SicatAccountEntity | undefined;
  if (!account) {
    throw new AppError(404, 'Not Found', 'Conta CETESB não encontrada para o usuário SICAT.', {
      code: 'CETESB_ACCOUNT_NOT_FOUND'
    });
  }

  assertEncryptionKeyConfigured();
  const password = decryptAccountPassword(account);
  const login = toTrimmedString(account.cetesbLogin || account.partnerDocument);
  const email = toTrimmedString(account.cetesbEmail);
  const partnerCode = parsePartnerCode(account.partnerCode);

  if (!login || !email || !partnerCode) {
    throw new AppError(400, 'Bad Request', 'Conta CETESB sem dados suficientes para ativação. Informe login, email e partnerCode válidos.', {
      code: 'CETESB_ACCOUNT_INCOMPLETE'
    });
  }

  const boot = await gateway.bootstrapSession({
    partnerCode,
    partnerDocument: login,
    email,
    password,
    recaptchaToken: '',
    metadata: {
      recaptchaToken: '',
      partnerCode,
      credentials: {
        login,
        email,
        password
      }
    }
  });

  await deactivateAllByUserId(sicatUser.userId);
  const activeAccount = await activateById(account.id) as SicatAccountEntity | undefined;

  const integrationAccountId = buildIntegrationAccountId(account);
  await ensureIntegrationAccount(integrationAccountId, {
    accountName: account.partnerName || integrationAccountId,
    partnerCode: toStringOrNull(partnerCode),
    partnerDocument: account.partnerDocument,
    stateCode: config.cetesbDefaultStateCode ? String(config.cetesbDefaultStateCode) : null
  });

  const nowIso = new Date().toISOString();
  const metadata = {
    source: 'sicat-dual-auth',
    accountId: account.id,
    sicatUserId: sicatUser.userId,
    recaptchaToken: '',
    partnerDescription: account.partnerName || null,
    cookieHeader: boot?.authPayload?.cookieHeader || null,
    credentials: {
      login,
      email
    }
  };

  const existingSessionContext = await findLatestActiveSessionContextByIntegrationAccount(integrationAccountId) as SessionContextSummary | undefined;
  const partnerType = resolvePartnerType(account.partnerDocument);

  let sessionContext: SessionContextSummary | undefined;
  if (existingSessionContext) {
    sessionContext = await updateSessionContext(existingSessionContext.id, buildSessionContextPayload({
      account,
      partnerType,
      partnerCode,
      email,
      boot,
      nowIso,
      metadata,
      jwtTokenRef: existingSessionContext.jwtTokenRef || `vault://mtr/session-contexts/${existingSessionContext.id}`
    })) as SessionContextSummary | undefined;
  } else {
    const sessionContextId = createPrefixedId('scx');
    sessionContext = await insertSessionContext({
      id: sessionContextId,
      integrationAccountId,
      ...buildSessionContextPayload({
        account,
        partnerType,
        partnerCode,
        email,
        boot,
        nowIso,
        metadata,
        jwtTokenRef: `vault://mtr/session-contexts/${sessionContextId}`
      })
    }) as SessionContextSummary | undefined;
  }

  return {
    user: await toSicatUserResponse(toSicatUserForResponse(sicatUser)),
    activeAccount: toAccountCard(activeAccount),
    sessionContext: toSessionContextSummary(sessionContext)
  };
}

export async function removeSicatCetesbAccount(sicatUser: SicatUserInput, accountId: string) {
  const account = await findByIdAndUserId(accountId, sicatUser.userId) as SicatAccountEntity | undefined;
  if (!account) {
    throw new AppError(404, 'Not Found', 'Conta CETESB não encontrada para o usuário SICAT.', {
      code: 'CETESB_ACCOUNT_NOT_FOUND'
    });
  }

  const removed = await deleteByIdAndUserId(accountId, sicatUser.userId);
  if (!removed) {
    throw new AppError(500, 'Internal Server Error', 'Falha ao remover conta CETESB vinculada.', {
      code: 'CETESB_ACCOUNT_REMOVE_FAILED'
    });
  }

  return {
    removed: true,
    accountId
  };
}

export async function getSicatActiveSession(sicatUser: SicatUserInput) {
  const accounts = (await listByUserId(sicatUser.userId)) as SicatAccountEntity[];
  const active = accounts.find((item) => item.isActive) || null;

  if (!active) {
    return {
      user: await toSicatUserResponse(toSicatUserForResponse(sicatUser)),
      activeAccount: null,
      sessionContext: null
    };
  }

  const integrationAccountId = buildIntegrationAccountId(active);
  const sessionContext = await findLatestActiveSessionContextByIntegrationAccount(integrationAccountId) as SessionContextSummary | undefined;

  return {
    user: await toSicatUserResponse(toSicatUserForResponse(sicatUser)),
    activeAccount: toAccountCard(active),
    sessionContext: toSessionContextSummary(sessionContext)
  };
}
