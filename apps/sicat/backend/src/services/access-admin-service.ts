import { AppError } from '../lib/problem.js';
import { createPrefixedId } from '../lib/ids.js';
import { parsePage, parsePageSize } from '../lib/pagination.js';
import { hashPassword } from '../lib/sicat-security.js';
import {
  hasAdminGlobalAccessByUserId,
  listAdminAccessUsers as repoListAdminAccessUsers,
  getAdminAccessUserById,
  listAdminAccessRoles as repoListAdminAccessRoles,
  listAdminAccessPermissions as repoListAdminAccessPermissions,
  listAdminAccessSessions as repoListAdminAccessSessions,
  findAdminAccessRoleById,
  findAdminAccessRoleDetailsById,
  createAdminAccessRole as repoCreateAdminAccessRole,
  updateAdminAccessRoleById,
  deactivateAdminAccessRoleById,
  replaceAdminAccessRolePermissions,
  findAdminAccessUserLightById,
  grantAdminAccessRoleToUser,
  revokeAdminAccessRoleFromUser,
  findAdminAccessPermissionById,
  createAdminAccessPermission as repoCreateAdminAccessPermission,
  updateAdminAccessPermissionById,
  deactivateAdminAccessPermissionById,
  insertAccessAdminAudit
} from '../repositories/access-admin-repo.js';
import { updatePassword, updatePasswordExpiration } from '../repositories/sicat-user-repo.js';
import { revokeActiveByUserId } from '../repositories/sicat-session-repo.js';

type LooseRecord = Record<string, unknown>;
type SicatUser = {
  userId?: string;
  id?: string;
  roles?: unknown[];
};

type AuditActionInput = {
  correlationId?: string | null;
  actorUserId: string;
  actionType: string;
  targetUserId?: string | null;
  targetSessionId?: string | null;
  metadata?: LooseRecord;
  actionStatus?: string;
};

const ADMIN_ROLE_TOKENS = new Set([
  'admin',
  'admin.global',
  'admin_global',
  'role_admin_global'
]);

function hasAdminRoleInToken(sicatUser: SicatUser | null | undefined) {
  const roles = Array.isArray(sicatUser?.roles) ? sicatUser.roles : [];
  return roles.some((role) => ADMIN_ROLE_TOKENS.has(String(role || '').trim().toLowerCase()));
}

export async function resolveAdminAccessSummary(sicatUser: SicatUser | null | undefined) {
  const userId = String(sicatUser?.userId || sicatUser?.id || '').trim();
  if (!userId) {
    return {
      allowed: false,
      source: 'none'
    };
  }

  if (hasAdminRoleInToken(sicatUser)) {
    return {
      allowed: true,
      source: 'token-role'
    };
  }

  const hasDbAdminAccess = await hasAdminGlobalAccessByUserId(userId);
  return {
    allowed: hasDbAdminAccess,
    source: hasDbAdminAccess ? 'database' : 'none'
  };
}

async function ensureAdminAuthorization(sicatUser: SicatUser | null | undefined) {
  if (!sicatUser?.userId) {
    throw new AppError(401, 'Unauthorized', 'Sessão SICAT inválida.');
  }

  if (hasAdminRoleInToken(sicatUser)) {
    return;
  }

  const adminAccess = await resolveAdminAccessSummary(sicatUser);
  if (!adminAccess.allowed) {
    throw new AppError(403, 'Forbidden', 'Usuário sem permissão administrativa.');
  }
}

async function auditReadAction({
  correlationId,
  actorUserId,
  actionType,
  targetUserId = null,
  targetSessionId = null,
  metadata = {}
}: AuditActionInput) {
  try {
    await insertAccessAdminAudit({
      id: createPrefixedId('aaud'),
      actorUserId,
      targetUserId,
      targetSessionId,
      actionType,
      actionStatus: 'succeeded',
      correlationId,
      metadata
    });
  } catch {
  }
}

async function auditWriteAction({
  correlationId,
  actorUserId,
  actionType,
  targetUserId = null,
  targetSessionId = null,
  metadata = {},
  actionStatus = 'succeeded'
}: AuditActionInput) {
  try {
    await insertAccessAdminAudit({
      id: createPrefixedId('aaud'),
      actorUserId,
      targetUserId,
      targetSessionId,
      actionType,
      actionStatus,
      correlationId,
      metadata
    });
  } catch {
  }
}

function ensureStrongPassword(newPassword: unknown) {
  const normalized = String(newPassword || '');
  if (normalized.length < 8) {
    throw new AppError(400, 'Bad Request', 'A nova senha deve ter no mínimo 8 caracteres.');
  }

  return normalized;
}

function normalizeOptionalString(value: unknown) {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function hasOwnValue(payload: unknown, key: string) {
  return Object.hasOwn((payload || {}) as object, key);
}

function readOptionalNormalizedField(payload: LooseRecord | null | undefined, key: string) {
  if (!hasOwnValue(payload, key)) {
    return undefined;
  }

  return normalizeOptionalString(payload?.[key]);
}

function ensureFieldNotEmpty(value: string | null | undefined, fieldName: string) {
  if (value === undefined || value) {
    return;
  }

  throw new AppError(400, 'Bad Request', `Campo ${fieldName} não pode ser vazio.`);
}

function requireActorUserId(sicatUser: SicatUser): string {
  const actorUserId = String(sicatUser.userId || '').trim();
  if (!actorUserId) {
    throw new AppError(401, 'Unauthorized', 'Sessão SICAT inválida.');
  }
  return actorUserId;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error || '');
}

function getPgErrorCode(error: unknown): string | null {
  if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string') {
    return error.code;
  }
  return null;
}

function buildPermissionKey(resource: string, action: string): string {
  return `${resource.trim().toLowerCase()}.${action.trim().toLowerCase()}`;
}

async function replaceRolePermissionsOrThrow({ roleId, permissionIds, grantedByUserId }: { roleId: string; permissionIds: string[]; grantedByUserId: string }) {
  try {
    await replaceAdminAccessRolePermissions({
      roleId,
      permissionIds,
      grantedByUserId,
      createId: () => createPrefixedId('arp')
    });
  } catch (error: unknown) {
    const message = getErrorMessage(error);
    if (message.startsWith('PERMISSION_NOT_FOUND:')) {
      const missing = message.split(':')[1] || '';
      throw new AppError(400, 'Bad Request', `Permissões inválidas: ${missing}`);
    }
    throw error;
  }
}

export async function listAdminAccessUsers(sicatUser: SicatUser, query: LooseRecord | null | undefined, correlationId: string | null) {
  await ensureAdminAuthorization(sicatUser);
  const actorUserId = requireActorUserId(sicatUser);

  const filters = {
    search: normalizeOptionalString(query?.search),
    roleId: normalizeOptionalString(query?.roleId),
    status: normalizeOptionalString(query?.status) as 'active' | 'disabled' | null,
    page: parsePage(query?.page, 1),
    pageSize: parsePageSize(query?.pageSize, 20)
  };

  const response = await repoListAdminAccessUsers(filters);

  await auditReadAction({
    correlationId,
    actorUserId,
    actionType: 'admin.access.users.list',
    metadata: {
      filters
    }
  });

  return response;
}

export async function getAdminAccessUserDetails(sicatUser: SicatUser, userId: string, correlationId: string | null) {
  await ensureAdminAuthorization(sicatUser);
  const actorUserId = requireActorUserId(sicatUser);

  const response = await getAdminAccessUserById(userId);
  if (!response) {
    throw new AppError(404, 'Not Found', `Usuário ${userId} não encontrado.`);
  }

  await auditReadAction({
    correlationId,
    actorUserId,
    targetUserId: userId,
    actionType: 'admin.access.users.get',
    metadata: {
      userId
    }
  });

  return response;
}

export async function listAdminAccessRoles(sicatUser: SicatUser, correlationId: string | null) {
  await ensureAdminAuthorization(sicatUser);
  const actorUserId = requireActorUserId(sicatUser);

  const response = await repoListAdminAccessRoles();

  await auditReadAction({
    correlationId,
    actorUserId,
    actionType: 'admin.access.roles.list'
  });

  return response;
}

export async function getAdminAccessRoleDetails(sicatUser: SicatUser, roleId: string, correlationId: string | null) {
  await ensureAdminAuthorization(sicatUser);
  const actorUserId = requireActorUserId(sicatUser);

  const response = await findAdminAccessRoleDetailsById(roleId);
  if (!response) {
    throw new AppError(404, 'Not Found', `Perfil ${roleId} não encontrado.`);
  }

  await auditReadAction({
    correlationId,
    actorUserId,
    actionType: 'admin.access.roles.get',
    metadata: {
      roleId
    }
  });

  return response;
}

export async function createAdminAccessRole(sicatUser: SicatUser, payload: LooseRecord | null | undefined, correlationId: string | null) {
  await ensureAdminAuthorization(sicatUser);
  const actorUserId = requireActorUserId(sicatUser);

  const name = normalizeOptionalString(payload?.name);
  if (!name) {
    throw new AppError(400, 'Bad Request', 'Campo obrigatório ausente: name.');
  }

  const description = normalizeOptionalString(payload?.description);
  const isSystem = Boolean(payload?.isSystem);
  const permissionIds = Array.isArray(payload?.permissionIds) ? payload.permissionIds : [];

  let role;
  try {
    role = await repoCreateAdminAccessRole({
      id: createPrefixedId('role'),
      name,
      description,
      isSystem
    });
  } catch (error: unknown) {
    if (getPgErrorCode(error) === '23505') {
      throw new AppError(409, 'Conflict', `Já existe um perfil com o nome ${name}.`);
    }
    throw error;
  }

    await replaceRolePermissionsOrThrow({
      roleId: role.roleId,
      permissionIds,
      grantedByUserId: actorUserId
    });

  const response = await findAdminAccessRoleDetailsById(role.roleId);

  await auditWriteAction({
    correlationId,
    actorUserId,
    actionType: 'admin.access.roles.create',
    metadata: {
      roleId: role.roleId,
      permissionIds
    }
  });

  return response;
}

export async function updateAdminAccessRole(sicatUser: SicatUser, roleId: string, payload: LooseRecord | null | undefined, correlationId: string | null) {
  await ensureAdminAuthorization(sicatUser);
  const actorUserId = requireActorUserId(sicatUser);

  const existingRole = await findAdminAccessRoleById(roleId);
  if (!existingRole) {
    throw new AppError(404, 'Not Found', `Perfil ${roleId} não encontrado.`);
  }

  const name = readOptionalNormalizedField(payload, 'name');
  const description = readOptionalNormalizedField(payload, 'description');
  const permissionIds = payload?.permissionIds;

  ensureFieldNotEmpty(name, 'name');

  try {
    await updateAdminAccessRoleById({
      roleId,
      name,
      description
    });
  } catch (error: unknown) {
    if (getPgErrorCode(error) === '23505') {
      throw new AppError(409, 'Conflict', `Já existe um perfil com o nome ${name}.`);
    }
    throw error;
  }

  if (permissionIds !== undefined) {
    if (!Array.isArray(permissionIds)) {
      throw new AppError(400, 'Bad Request', 'permissionIds deve ser um array.');
    }

    await replaceRolePermissionsOrThrow({
      roleId,
      permissionIds,
      grantedByUserId: actorUserId
    });
  }

  const response = await findAdminAccessRoleDetailsById(roleId);

  await auditWriteAction({
    correlationId,
    actorUserId,
    actionType: 'admin.access.roles.update',
    metadata: {
      roleId,
      changedFields: {
        name: name !== undefined,
        description: description !== undefined,
        permissionIds: permissionIds !== undefined
      }
    }
  });

  return response;
}

export async function deleteAdminAccessRole(sicatUser: SicatUser, roleId: string, correlationId: string | null) {
  await ensureAdminAuthorization(sicatUser);
  const actorUserId = requireActorUserId(sicatUser);

  const role = await findAdminAccessRoleById(roleId);
  if (!role) {
    throw new AppError(404, 'Not Found', `Perfil ${roleId} não encontrado.`);
  }

  if (role.isSystem) {
    throw new AppError(409, 'Conflict', 'Perfis de sistema não podem ser removidos.');
  }

  const removed = await deactivateAdminAccessRoleById(roleId);
  const status = removed.removed ? 'applied' : 'noop';

  await auditWriteAction({
    correlationId,
    actorUserId,
    actionType: 'admin.access.roles.delete',
    metadata: {
      roleId,
      status
    }
  });

  return {
    action: 'delete',
    status,
    roleId,
    correlationId,
    performedAt: new Date().toISOString()
  };
}
export async function listAdminAccessPermissions(sicatUser: SicatUser, query: LooseRecord | null | undefined, correlationId: string | null) {
  await ensureAdminAuthorization(sicatUser);
  const actorUserId = requireActorUserId(sicatUser);

  const filters = {
    resource: normalizeOptionalString(query?.resource),
    action: normalizeOptionalString(query?.action)
  };

  const response = await repoListAdminAccessPermissions(filters);

  await auditReadAction({
    correlationId,
    actorUserId,
    actionType: 'admin.access.permissions.list',
    metadata: {
      filters
    }
  });

  return response;
}

export async function getAdminAccessPermissionDetails(sicatUser: SicatUser, permissionId: string, correlationId: string | null) {
  await ensureAdminAuthorization(sicatUser);
  const actorUserId = requireActorUserId(sicatUser);

  const response = await findAdminAccessPermissionById(permissionId);
  if (!response) {
    throw new AppError(404, 'Not Found', `Permissão ${permissionId} não encontrada.`);
  }

  await auditReadAction({
    correlationId,
    actorUserId,
    actionType: 'admin.access.permissions.get',
    metadata: {
      permissionId
    }
  });

  return response;
}

export async function createAdminAccessPermission(sicatUser: SicatUser, payload: LooseRecord | null | undefined, correlationId: string | null) {
  await ensureAdminAuthorization(sicatUser);
  const actorUserId = requireActorUserId(sicatUser);

  const resource = normalizeOptionalString(payload?.resource);
  const action = normalizeOptionalString(payload?.action);
  const description = normalizeOptionalString(payload?.description);

  if (!resource || !action) {
    throw new AppError(400, 'Bad Request', 'Campos obrigatórios ausentes: resource e action.');
  }

  const permissionKey = normalizeOptionalString(payload?.permissionKey) || buildPermissionKey(resource, action);

  let response;
  try {
    response = await repoCreateAdminAccessPermission({
      id: createPrefixedId('perm'),
      permissionKey,
      resource,
      action,
      description
    });
  } catch (error: unknown) {
    if (getPgErrorCode(error) === '23505') {
      throw new AppError(409, 'Conflict', `Já existe uma permissão com a chave ${permissionKey}.`);
    }
    throw error;
  }

  await auditWriteAction({
    correlationId,
    actorUserId,
    actionType: 'admin.access.permissions.create',
    metadata: {
      permissionId: response.permissionId,
      permissionKey
    }
  });

  return response;
}

export async function updateAdminAccessPermission(sicatUser: SicatUser, permissionId: string, payload: LooseRecord | null | undefined, correlationId: string | null) {
  await ensureAdminAuthorization(sicatUser);
  const actorUserId = requireActorUserId(sicatUser);

  const existing = await findAdminAccessPermissionById(permissionId);
  if (!existing) {
    throw new AppError(404, 'Not Found', `Permissão ${permissionId} não encontrada.`);
  }

  const resource = readOptionalNormalizedField(payload, 'resource');
  const action = readOptionalNormalizedField(payload, 'action');
  const description = readOptionalNormalizedField(payload, 'description');
  const permissionKey = readOptionalNormalizedField(payload, 'permissionKey');

  ensureFieldNotEmpty(resource, 'resource');
  ensureFieldNotEmpty(action, 'action');
  ensureFieldNotEmpty(permissionKey, 'permissionKey');

  let response;
  try {
    response = await updateAdminAccessPermissionById({
      permissionId,
      resource,
      action,
      description,
      permissionKey
    });
  } catch (error: unknown) {
    if (getPgErrorCode(error) === '23505') {
      throw new AppError(409, 'Conflict', `Já existe uma permissão com a chave ${permissionKey}.`);
    }
    throw error;
  }

  if (!response) {
    throw new AppError(404, 'Not Found', `Permissão ${permissionId} não encontrada.`);
  }

  await auditWriteAction({
    correlationId,
    actorUserId,
    actionType: 'admin.access.permissions.update',
    metadata: {
      permissionId
    }
  });

  return response;
}

export async function deleteAdminAccessPermission(sicatUser: SicatUser, permissionId: string, correlationId: string | null) {
  await ensureAdminAuthorization(sicatUser);
  const actorUserId = requireActorUserId(sicatUser);

  const existing = await findAdminAccessPermissionById(permissionId);
  if (!existing) {
    throw new AppError(404, 'Not Found', `Permissão ${permissionId} não encontrada.`);
  }

  const removed = await deactivateAdminAccessPermissionById(permissionId);
  const status = removed.removed ? 'applied' : 'noop';

  await auditWriteAction({
    correlationId,
    actorUserId,
    actionType: 'admin.access.permissions.delete',
    metadata: {
      permissionId,
      status
    }
  });

  return {
    action: 'delete',
    status,
    permissionId,
    correlationId,
    performedAt: new Date().toISOString()
  };
}
export async function listAdminAccessSessions(sicatUser: SicatUser, query: LooseRecord | null | undefined, correlationId: string | null) {
  await ensureAdminAuthorization(sicatUser);
  const actorUserId = requireActorUserId(sicatUser);

  const filters = {
    userId: normalizeOptionalString(query?.userId),
    status: normalizeOptionalString(query?.status),
    page: parsePage(query?.page, 1),
    pageSize: parsePageSize(query?.pageSize, 20)
  };

  const response = await repoListAdminAccessSessions(filters);

  await auditReadAction({
    correlationId,
    actorUserId,
    actionType: 'admin.access.sessions.list',
    metadata: {
      filters
    }
  });

  return response;
}

export async function grantAccessRoleForUser(sicatUser: SicatUser, userId: string, roleId: string, payload: LooseRecord | null | undefined, correlationId: string | null) {
  await ensureAdminAuthorization(sicatUser);
  const actorUserId = requireActorUserId(sicatUser);

  const user = await findAdminAccessUserLightById(userId);
  if (!user) {
    throw new AppError(404, 'Not Found', `Usuário ${userId} não encontrado.`);
  }

  const role = await findAdminAccessRoleById(roleId);
  if (!role) {
    throw new AppError(404, 'Not Found', `Perfil ${roleId} não encontrado.`);
  }

  const rawExpiresAt = normalizeOptionalString(payload?.expiresAt);
  const expiresAt = rawExpiresAt ? new Date(rawExpiresAt) : null;
  if (expiresAt && Number.isNaN(expiresAt.getTime())) {
    throw new AppError(400, 'Bad Request', 'expiresAt deve estar no formato date-time válido.');
  }

  const assignment = await grantAdminAccessRoleToUser({
    id: createPrefixedId('aur'),
    userId,
    roleId,
    assignedByUserId: actorUserId,
    expiresAt: expiresAt ? expiresAt.toISOString() : null
  });

  const response = {
    action: 'grant',
    status: 'applied',
    userId,
    roleId,
    assignedAt: assignment.assignedAt,
    expiresAt: assignment.expiresAt,
    correlationId,
    performedAt: new Date().toISOString()
  };

  await auditWriteAction({
    correlationId,
    actorUserId,
    targetUserId: userId,
    actionType: 'admin.access.role.grant',
    metadata: {
      roleId,
      reason: payload?.reason || null,
      expiresAt: response.expiresAt
    }
  });

  return response;
}

export async function revokeAccessRoleForUser(sicatUser: SicatUser, userId: string, roleId: string, payload: LooseRecord | null | undefined, correlationId: string | null) {
  await ensureAdminAuthorization(sicatUser);
  const actorUserId = requireActorUserId(sicatUser);

  const user = await findAdminAccessUserLightById(userId);
  if (!user) {
    throw new AppError(404, 'Not Found', `Usuário ${userId} não encontrado.`);
  }

  const role = await findAdminAccessRoleById(roleId);
  if (!role) {
    throw new AppError(404, 'Not Found', `Perfil ${roleId} não encontrado.`);
  }

  const removed = await revokeAdminAccessRoleFromUser(userId, roleId);
  const status = removed.removed ? 'applied' : 'noop';

  const response = {
    action: 'revoke',
    status,
    userId,
    roleId,
    correlationId,
    performedAt: new Date().toISOString()
  };

  await auditWriteAction({
    correlationId,
    actorUserId,
    targetUserId: userId,
    actionType: 'admin.access.role.revoke',
    metadata: {
      roleId,
      removed: removed.removed,
      reason: payload?.reason || null
    }
  });

  return response;
}

export async function resetAccessUserPassword(sicatUser: SicatUser, userId: string, payload: LooseRecord | null | undefined, correlationId: string | null) {
  await ensureAdminAuthorization(sicatUser);
  const actorUserId = requireActorUserId(sicatUser);

  const user = await findAdminAccessUserLightById(userId);
  if (!user) {
    throw new AppError(404, 'Not Found', `Usuário ${userId} não encontrado.`);
  }

  const newPassword = ensureStrongPassword(payload?.newPassword);
  const revokeSessions = payload?.revokeSessions !== false;

  await updatePassword({
    userId,
    passwordHash: hashPassword(newPassword),
    passwordExpiresAt: null
  });

  let revokedCount = 0;
  if (revokeSessions) {
    const revokeResult = await revokeActiveByUserId(userId);
    revokedCount = Number(revokeResult.revokedCount || 0);
  }

  const response = {
    action: 'reset',
    status: 'applied',
    userId,
    revokeSessions,
    revokedSessions: revokedCount,
    correlationId,
    performedAt: new Date().toISOString()
  };

  await auditWriteAction({
    correlationId,
    actorUserId,
    targetUserId: userId,
    actionType: 'admin.access.password.reset',
    metadata: {
      revokeSessions,
      revokedSessions: revokedCount,
      reason: payload?.reason || null
    }
  });

  return response;
}

export async function expireAccessUserPassword(sicatUser: SicatUser, userId: string, payload: LooseRecord | null | undefined, correlationId: string | null) {
  await ensureAdminAuthorization(sicatUser);
  const actorUserId = requireActorUserId(sicatUser);

  const user = await findAdminAccessUserLightById(userId);
  if (!user) {
    throw new AppError(404, 'Not Found', `Usuário ${userId} não encontrado.`);
  }

  const revokeSessions = payload?.revokeSessions !== false;
  const expiredAt = new Date().toISOString();

  await updatePasswordExpiration(userId, expiredAt);

  let revokedCount = 0;
  if (revokeSessions) {
    const revokeResult = await revokeActiveByUserId(userId);
    revokedCount = Number(revokeResult.revokedCount || 0);
  }

  const response = {
    action: 'expire',
    status: 'applied',
    userId,
    expiresAt: expiredAt,
    revokeSessions,
    revokedSessions: revokedCount,
    correlationId,
    performedAt: new Date().toISOString()
  };

  await auditWriteAction({
    correlationId,
    actorUserId,
    targetUserId: userId,
    actionType: 'admin.access.password.expire',
    metadata: {
      expiresAt: expiredAt,
      revokeSessions,
      revokedSessions: revokedCount,
      reason: payload?.reason || null
    }
  });

  return response;
}
