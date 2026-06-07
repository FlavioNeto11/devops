import { config } from '../lib/config.js';
import { createPrefixedId } from '../lib/ids.js';
import { AppError } from '../lib/problem.js';
import { findByEmail, findById, insert as insertSicatUser } from '../repositories/sicat-user-repo.js';
import {
  insert as insertSicatSession,
  findByRefreshTokenHash,
  revokeById as revokeSicatSessionById
} from '../repositories/sicat-session-repo.js';
import {
  createAccessToken,
  createRefreshToken,
  hashTokenSha256,
  hashPassword,
  verifyPassword
} from '../lib/sicat-security.js';
import { resolveAdminAccessSummary } from './access-admin-service.js';

type LooseRecord = Record<string, unknown>;
type SicatUserLike = {
  id: string;
  email: string;
  name?: string | null;
  isActive?: boolean;
  passwordHash: string;
  passwordExpiresAt?: string | Date | null;
};
type AuthContext = {
  correlationId?: string | null;
  userAgent?: string | null;
};

function getErrorCode(error: unknown): string | null {
  if (error && typeof error === 'object' && 'code' in error && typeof (error as { code: unknown }).code === 'string') {
    return (error as { code: string }).code;
  }
  return null;
}

function normalizeEmail(email: unknown) {
  return String(email || '').trim().toLowerCase();
}

async function buildUserView(user: SicatUserLike) {
  const adminAccess = await resolveAdminAccessSummary(user);

  return {
    userId: user.id,
    name: user.name || user.email,
    email: user.email,
    roles: ['operator'],
    adminAccess
  };
}

function asIsoFromNow(seconds: unknown) {
  return new Date(Date.now() + Number(seconds || 0) * 1000).toISOString();
}

async function ensureBootstrapUserIfNeeded() {
  const bootstrapEmail = normalizeEmail(config.sicatBootstrapEmail);
  const bootstrapPassword = String(config.sicatBootstrapPassword || '');
  if (!bootstrapEmail || !bootstrapPassword) return;

  const existing = await findByEmail(bootstrapEmail);
  if (existing) return;

  try {
    await insertSicatUser({
      id: createPrefixedId('usr'),
      email: bootstrapEmail,
      passwordHash: hashPassword(bootstrapPassword),
      name: config.sicatBootstrapName || 'SICAT Bootstrap User',
      isActive: true
    });
  } catch (error: unknown) {
    if (getErrorCode(error) !== '23505') throw error;
  }
}

async function getValidatedUser(email: unknown, password: unknown) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || !password) {
    throw new AppError(400, 'Bad Request', 'Campos obrigatórios ausentes: email e password.', {
      code: 'MISSING_CREDENTIALS'
    });
  }

  await ensureBootstrapUserIfNeeded();

  const user = await findByEmail(normalizedEmail);
  if (!user?.isActive) {
    throw new AppError(401, 'Unauthorized', 'Credenciais SICAT inválidas.', {
      code: 'INVALID_SICAT_CREDENTIALS'
    });
  }

  if (user.passwordExpiresAt) {
    const passwordExpiresAtMs = new Date(user.passwordExpiresAt).getTime();
    if (Number.isFinite(passwordExpiresAtMs) && passwordExpiresAtMs <= Date.now()) {
      throw new AppError(401, 'Unauthorized', 'Senha SICAT expirada. Solicite reset de senha ao administrador.', {
        code: 'SICAT_PASSWORD_EXPIRED'
      });
    }
  }

  const passwordMatches = verifyPassword(String(password), user.passwordHash);
  if (!passwordMatches) {
    throw new AppError(401, 'Unauthorized', 'Credenciais SICAT inválidas.', {
      code: 'INVALID_SICAT_CREDENTIALS'
    });
  }

  return user;
}

async function issueTokenPair(user: SicatUserLike, metadata: LooseRecord = {}) {
  const accessToken = createAccessToken({
    sub: user.id,
    email: user.email,
    name: user.name || user.email,
    roles: ['operator']
  }, {
    secret: config.sicatAccessTokenSecret,
    ttlSeconds: config.sicatAccessTokenTtlSeconds
  });

  const refreshToken = createRefreshToken();
  const refreshTokenHash = hashTokenSha256(refreshToken);
  await insertSicatSession({
    id: createPrefixedId('ssn'),
    userId: user.id,
    refreshTokenHash,
    expiresAt: asIsoFromNow(config.sicatRefreshTokenTtlSeconds),
    metadata
  });

  return {
    accessToken,
    refreshToken,
    expiresAt: asIsoFromNow(config.sicatAccessTokenTtlSeconds)
  };
}

export async function loginSicat(payload: LooseRecord, context: AuthContext = {}) {
  const user = await getValidatedUser(payload?.email, payload?.password);
  const tokens = await issueTokenPair(user, {
    flow: 'login',
    correlationId: context.correlationId || null,
    userAgent: context.userAgent || null
  });

  return {
    ...tokens,
    user: await buildUserView(user)
  };
}

export async function registerSicat(payload: LooseRecord, context: AuthContext = {}) {
  const normalizedEmail = normalizeEmail(payload?.email);
  const password = String(payload?.password || '');
  const name = String(payload?.name || '').trim();

  if (!normalizedEmail || !password || !name) {
    throw new AppError(400, 'Bad Request', 'Campos obrigatórios ausentes: name, email e password.', {
      code: 'MISSING_REGISTER_FIELDS'
    });
  }

  if (password.length < 8) {
    throw new AppError(400, 'Bad Request', 'A senha deve ter no mínimo 8 caracteres.', {
      code: 'INVALID_PASSWORD_LENGTH'
    });
  }

  const existing = await findByEmail(normalizedEmail);
  if (existing) {
    throw new AppError(409, 'Conflict', 'Já existe um usuário SICAT com este e-mail.', {
      code: 'SICAT_USER_ALREADY_EXISTS'
    });
  }

  let createdUser: SicatUserLike | undefined;
  try {
    createdUser = await insertSicatUser({
      id: createPrefixedId('usr'),
      email: normalizedEmail,
      passwordHash: hashPassword(password),
      name,
      isActive: true
    });
  } catch (error: unknown) {
    if (getErrorCode(error) === '23505') {
      throw new AppError(409, 'Conflict', 'Já existe um usuário SICAT com este e-mail.', {
        code: 'SICAT_USER_ALREADY_EXISTS'
      });
    }

    throw error;
  }

  if (!createdUser) {
    throw new AppError(500, 'Internal Server Error', 'Falha ao criar usuário SICAT.');
  }

  const tokens = await issueTokenPair(createdUser, {
    flow: 'register',
    correlationId: context.correlationId || null,
    userAgent: context.userAgent || null
  });

  return {
    ...tokens,
    user: await buildUserView(createdUser)
  };
}

export async function refreshSicatSession(payload: LooseRecord, context: AuthContext = {}) {
  const refreshToken = String(payload?.refreshToken || '');
  if (!refreshToken) {
    throw new AppError(400, 'Bad Request', 'Campo obrigatório ausente: refreshToken.', {
      code: 'MISSING_REFRESH_TOKEN'
    });
  }

  const refreshHash = hashTokenSha256(refreshToken);
  const session = await findByRefreshTokenHash(refreshHash);
  if (!session || session.revokedAt) {
    throw new AppError(401, 'Unauthorized', 'Refresh token inválido ou revogado.', {
      code: 'INVALID_REFRESH_TOKEN'
    });
  }

  const expiresAtMs = new Date(session.expiresAt).getTime();
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
    await revokeSicatSessionById(session.id);
    throw new AppError(401, 'Unauthorized', 'Refresh token expirado.', {
      code: 'EXPIRED_REFRESH_TOKEN'
    });
  }

  const user = await findById(session.userId);
  if (!user?.isActive) {
    await revokeSicatSessionById(session.id);
    throw new AppError(401, 'Unauthorized', 'Sessão inválida para usuário inativo.', {
      code: 'INVALID_SESSION_USER'
    });
  }

  await revokeSicatSessionById(session.id);
  return issueTokenPair(user as SicatUserLike, {
    flow: 'refresh',
    correlationId: context.correlationId || null,
    userAgent: context.userAgent || null,
    rotatedFromSessionId: session.id
  });
}

export async function getSicatUserById(userId: string) {
  const user = await findById(userId);
  if (!user?.isActive) {
    throw new AppError(401, 'Unauthorized', 'Usuário SICAT inválido.', {
      code: 'INVALID_SICAT_USER'
    });
  }
  return user;
}

export async function toSicatUserResponse(user: SicatUserLike) {
  return buildUserView(user);
}
