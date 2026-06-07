import { query, withTransaction } from '../db/pool.js';
import type { QueryResultRow } from 'pg';

type IsoLike = Date | string | null | undefined;

type AdminAccessUserFilters = {
  search?: string | null;
  status?: 'active' | 'disabled' | null;
  roleId?: string | null;
  page?: number;
  pageSize?: number;
};

type AdminAccessPermissionFilters = {
  resource?: string | null;
  action?: string | null;
};

type AdminAccessSessionFilters = {
  userId?: string | null;
  status?: string | null;
  page?: number;
  pageSize?: number;
};

type RoleRow = {
  role_id: string;
  role_name: string;
  description: string | null;
  is_system: boolean;
  users_count: number | string | null;
  permissions_count: number | string | null;
};

type PermissionRow = {
  permission_id: string;
  resource: string;
  action: string;
  description: string | null;
};

type UserRow = {
  user_id: string;
  name: string | null;
  email: string;
  is_active: boolean;
  roles: unknown[] | null;
  created_at: IsoLike;
  updated_at: IsoLike;
};

type SessionRow = QueryResultRow & {
  session_context_id: string;
  user_id: string;
  integration_account_id: string | null;
  status: string;
  last_validated_at: IsoLike;
  expires_at: IsoLike;
};

function toIso(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  return null;
}

function mapRole(row: RoleRow) {
  return {
    roleId: row.role_id,
    name: row.role_name,
    description: row.description || '',
    isSystem: Boolean(row.is_system),
    usersCount: Number(row.users_count || 0),
    permissionsCount: Number(row.permissions_count || 0)
  };
}

function mapPermission(row: PermissionRow) {
  return {
    permissionId: row.permission_id,
    resource: row.resource,
    action: row.action,
    description: row.description || ''
  };
}

const mapPermissionSummary = (row: PermissionRow) => mapPermission(row);

function mapUser(row: UserRow) {
  return {
    userId: row.user_id,
    name: row.name || '',
    email: row.email,
    status: row.is_active ? 'active' : 'disabled',
    roles: Array.isArray(row.roles) ? row.roles : [],
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  };
}

function buildUserFilters(filters: AdminAccessUserFilters = {}) {
  const where = [];
  const params = [];

  if (filters.search) {
    params.push(`%${String(filters.search).trim()}%`);
    where.push(`(u.name ilike $${params.length} or u.email ilike $${params.length} or u.id ilike $${params.length})`);
  }

  if (filters.status === 'active') {
    where.push('u.is_active = true');
  }

  if (filters.status === 'disabled') {
    where.push('u.is_active = false');
  }

  if (filters.roleId) {
    params.push(String(filters.roleId).trim());
    where.push(
      `exists (
         select 1
         from access_user_roles aur_filter
         where aur_filter.user_id = u.id
           and aur_filter.role_id = $${params.length}
           and (aur_filter.expires_at is null or aur_filter.expires_at > now())
       )`
    );
  }

  return {
    whereSql: where.length ? `where ${where.join(' and ')}` : '',
    params
  };
}

export async function hasAdminGlobalAccessByUserId(userId: string) {
  const result = await query<SessionRow>(
    `select exists(
       select 1
       from access_user_roles aur
       inner join access_roles ar on ar.id = aur.role_id
       where aur.user_id = $1
         and ar.is_active = true
         and (aur.expires_at is null or aur.expires_at > now())
         and lower(ar.role_name) in ('admin.global', 'admin_global', 'admin', 'role_admin_global')
     ) as has_access`,
    [userId]
  );

  return Boolean(result.rows[0]?.has_access);
}

export async function listAdminAccessUsers(filters: AdminAccessUserFilters = {}) {
  const page = Number(filters.page);
  const pageSize = Number(filters.pageSize);
  const offset = (page - 1) * pageSize;
  const { whereSql, params } = buildUserFilters(filters);

  const countResult = await query(
    `select count(*)::int as total
     from sicat_users u
     ${whereSql}`,
    params
  );

  const dataParams = [...params, pageSize, offset];
  const limitParam = dataParams.length - 1;
  const offsetParam = dataParams.length;

  const rowsResult = await query(
    `select
       u.id as user_id,
       u.name,
       u.email,
       u.is_active,
       u.created_at,
       u.updated_at,
       coalesce(
         jsonb_agg(
           distinct jsonb_build_object(
             'roleId', ar.id,
             'name', ar.role_name,
             'description', coalesce(ar.description, ''),
             'isSystem', ar.is_system,
             'usersCount', 0,
             'permissionsCount', 0
           )
         ) filter (where ar.id is not null),
         '[]'::jsonb
       ) as roles
     from sicat_users u
     left join access_user_roles aur
       on aur.user_id = u.id
      and (aur.expires_at is null or aur.expires_at > now())
     left join access_roles ar
       on ar.id = aur.role_id
      and ar.is_active = true
     ${whereSql}
     group by u.id
     order by u.updated_at desc, u.created_at desc
     limit $${limitParam} offset $${offsetParam}`,
    dataParams
  );

  const items = rowsResult.rows.map((row) => mapUser(row as UserRow));
  const total = Number(countResult.rows[0]?.total || 0);

  return {
    items,
    total,
    page,
    pageSize
  };
}

export async function getAdminAccessUserById(userId: string) {
  const userResult = await query(
    `select
       u.id as user_id,
       u.name,
       u.email,
       u.is_active,
       u.created_at,
       u.updated_at,
       coalesce(
         jsonb_agg(
           distinct jsonb_build_object(
             'roleId', ar.id,
             'name', ar.role_name,
             'description', coalesce(ar.description, ''),
             'isSystem', ar.is_system,
             'usersCount', 0,
             'permissionsCount', 0
           )
         ) filter (where ar.id is not null),
         '[]'::jsonb
       ) as roles
     from sicat_users u
     left join access_user_roles aur
       on aur.user_id = u.id
      and (aur.expires_at is null or aur.expires_at > now())
     left join access_roles ar
       on ar.id = aur.role_id
      and ar.is_active = true
     where u.id = $1
     group by u.id`,
    [userId]
  );

  if (!userResult.rows[0]) {
    return null;
  }

  const permissionRows = await query(
    `select distinct
       ap.id as permission_id,
       ap.resource,
       ap.action,
       coalesce(ap.description, '') as description
     from access_user_roles aur
     inner join access_role_permissions arp on arp.role_id = aur.role_id
     inner join access_permissions ap on ap.id = arp.permission_id
     where aur.user_id = $1
       and ap.is_active = true
       and (aur.expires_at is null or aur.expires_at > now())
     order by ap.resource asc, ap.action asc`,
    [userId]
  );

  return {
    ...mapUser(userResult.rows[0] as UserRow),
    permissions: permissionRows.rows.map((row) => mapPermission(row as PermissionRow))
  };
}

export async function listAdminAccessRoles() {
  const result = await query(
    `select
       ar.id as role_id,
       ar.role_name,
       coalesce(ar.description, '') as description,
       ar.is_system,
       count(distinct aur.user_id)::int as users_count,
       count(distinct arp.permission_id)::int as permissions_count
     from access_roles ar
     left join access_user_roles aur
       on aur.role_id = ar.id
      and (aur.expires_at is null or aur.expires_at > now())
     left join access_role_permissions arp
       on arp.role_id = ar.id
     where ar.is_active = true
     group by ar.id
     order by ar.role_name asc`
  );

  const items = result.rows.map((row) => mapRole(row as RoleRow));
  return {
    items,
    total: items.length
  };
}

export async function listAdminAccessPermissions(filters: AdminAccessPermissionFilters = {}) {
  const where = ['ap.is_active = true'];
  const params = [];

  if (filters.resource) {
    params.push(String(filters.resource).trim());
    where.push(`ap.resource = $${params.length}`);
  }

  if (filters.action) {
    params.push(String(filters.action).trim());
    where.push(`ap.action = $${params.length}`);
  }

  const result = await query(
    `select
       ap.id as permission_id,
       ap.resource,
       ap.action,
       coalesce(ap.description, '') as description
     from access_permissions ap
     where ${where.join(' and ')}
     order by ap.resource asc, ap.action asc`,
    params
  );

  const items = result.rows.map((row) => mapPermission(row as PermissionRow));
  return {
    items,
    total: items.length
  };
}

export async function listAdminAccessSessions(filters: AdminAccessSessionFilters = {}) {
  const page = Number(filters.page);
  const pageSize = Number(filters.pageSize);
  const offset = (page - 1) * pageSize;

  const where = [];
  const params = [];

  if (filters.userId) {
    params.push(String(filters.userId).trim());
    where.push(`u.id = $${params.length}`);
  }

  if (filters.status) {
    params.push(String(filters.status).trim());
    where.push(`sc.status = $${params.length}`);
  }

  const whereSql = where.length ? `where ${where.join(' and ')}` : '';

  const countResult = await query(
    `select count(*)::int as total
     from session_contexts sc
     left join sicat_users u on lower(u.email) = lower(sc.email)
     ${whereSql}`,
    params
  );

  const dataParams = [...params, pageSize, offset];
  const limitParam = dataParams.length - 1;
  const offsetParam = dataParams.length;

  const result = await query(
    `select
       sc.id as session_context_id,
       coalesce(u.id, '') as user_id,
       sc.integration_account_id,
       sc.status,
       sc.last_validated_at,
       sc.expires_at
     from session_contexts sc
     left join sicat_users u on lower(u.email) = lower(sc.email)
     ${whereSql}
     order by sc.updated_at desc, sc.created_at desc
     limit $${limitParam} offset $${offsetParam}`,
    dataParams
  );

  return {
    items: result.rows.map((row) => ({
      sessionContextId: row.session_context_id,
      userId: row.user_id,
      integrationAccountId: row.integration_account_id,
      status: row.status,
      lastValidatedAt: toIso(row.last_validated_at),
      expiresAt: toIso(row.expires_at)
    })),
    total: Number(countResult.rows[0]?.total || 0),
    page,
    pageSize
  };
}

export async function findAdminAccessRoleById(roleId: string) {
  const result = await query(
    `select
       ar.id as role_id,
       ar.role_name,
       coalesce(ar.description, '') as description,
       ar.is_system,
       0::int as users_count,
       0::int as permissions_count
     from access_roles ar
     where ar.id = $1
       and ar.is_active = true`,
    [roleId]
  );

  if (!result.rows[0]) {
    return null;
  }

  return mapRole(result.rows[0] as RoleRow);
}

export async function findAdminAccessRoleDetailsById(roleId: string) {
  const roleResult = await query(
    `select
       ar.id as role_id,
       ar.role_name,
       coalesce(ar.description, '') as description,
       ar.is_system,
       count(distinct aur.user_id)::int as users_count,
       count(distinct arp.permission_id)::int as permissions_count
     from access_roles ar
     left join access_user_roles aur
       on aur.role_id = ar.id
      and (aur.expires_at is null or aur.expires_at > now())
     left join access_role_permissions arp
       on arp.role_id = ar.id
     where ar.id = $1
       and ar.is_active = true
     group by ar.id`,
    [roleId]
  );

  if (!roleResult.rows[0]) {
    return null;
  }

  const permissionResult = await query(
    `select
       ap.id as permission_id,
       ap.resource,
       ap.action,
       coalesce(ap.description, '') as description
     from access_role_permissions arp
     inner join access_permissions ap on ap.id = arp.permission_id
     where arp.role_id = $1
       and ap.is_active = true
     order by ap.resource asc, ap.action asc`,
    [roleId]
  );

  return {
    ...mapRole(roleResult.rows[0] as RoleRow),
    permissions: permissionResult.rows.map((row) => mapPermissionSummary(row as PermissionRow))
  };
}

export async function createAdminAccessRole(input: {
  id: string;
  name: string;
  description?: string | null;
  isSystem?: boolean;
}) {
  const result = await query(
    `insert into access_roles(
       id,
       role_name,
       description,
       is_system,
       is_active,
       created_at,
       updated_at
     ) values ($1,$2,$3,$4,true,now(),now())
     returning
       id as role_id,
       role_name,
       coalesce(description, '') as description,
       is_system,
       0::int as users_count,
       0::int as permissions_count`,
    [
      input.id,
      input.name,
      input.description || null,
      Boolean(input.isSystem)
    ]
  );

  return mapRole(result.rows[0] as RoleRow);
}

export async function updateAdminAccessRoleById(input: {
  roleId: string;
  name?: string | null;
  description?: string | null;
}) {
  const result = await query(
    `update access_roles
        set role_name = coalesce($2, role_name),
            description = coalesce($3, description),
            updated_at = now()
      where id = $1
        and is_active = true
      returning
        id as role_id,
        role_name,
        coalesce(description, '') as description,
        is_system,
        0::int as users_count,
        0::int as permissions_count`,
    [input.roleId, input.name ?? null, input.description ?? null]
  );

  if (!result.rows[0]) {
    return null;
  }

  return mapRole(result.rows[0] as RoleRow);
}

export async function deactivateAdminAccessRoleById(roleId: string) {
  const result = await query(
    `update access_roles
        set is_active = false,
            updated_at = now()
      where id = $1
        and is_active = true
      returning id`,
    [roleId]
  );

  return {
    removed: (result.rowCount || 0) > 0
  };
}

export async function replaceAdminAccessRolePermissions(input: {
  roleId: string;
  permissionIds?: string[];
  grantedByUserId?: string | null;
  createId: () => string;
}) {
  const permissionIds = Array.isArray(input.permissionIds)
    ? [...new Set(input.permissionIds.map((value: string) => String(value || '').trim()).filter(Boolean))]
    : [];

  const assignedPermissionIds = await withTransaction(async (client) => {
    if (permissionIds.length > 0) {
      const placeholders = permissionIds.map((_, index) => `$${index + 2}`).join(', ');
      const allowedPermissionsResult = await client.query(
        `select id
         from access_permissions
         where is_active = true
           and id in (${placeholders})`,
        [input.roleId, ...permissionIds]
      );

      if (allowedPermissionsResult.rowCount !== permissionIds.length) {
        const found = new Set(allowedPermissionsResult.rows.map((row: { id: string }) => row.id));
        const missing = permissionIds.filter((permissionId) => !found.has(permissionId));
        const missingList = missing.join(', ');
        throw new Error(`PERMISSION_NOT_FOUND:${missingList}`);
      }
    }

    await client.query('delete from access_role_permissions where role_id = $1', [input.roleId]);

    for (const permissionId of permissionIds) {
      await client.query(
        `insert into access_role_permissions(
           id,
           role_id,
           permission_id,
           granted_at,
           granted_by_user_id,
           created_at,
           updated_at
         ) values ($1,$2,$3,now(),$4,now(),now())`,
        [
          input.createId(),
          input.roleId,
          permissionId,
          input.grantedByUserId || null
        ]
      );
    }

    return permissionIds;
  });

  return {
    permissionIds: assignedPermissionIds
  };
}

export async function findAdminAccessUserLightById(userId: string) {
  const result = await query(
    `select
       u.id as user_id,
       u.name,
       u.email,
       u.is_active,
       u.created_at,
       u.updated_at,
       '[]'::jsonb as roles
     from sicat_users u
     where u.id = $1`,
    [userId]
  );

  if (!result.rows[0]) {
    return null;
  }

  return mapUser(result.rows[0] as UserRow);
}

export async function grantAdminAccessRoleToUser(input: {
  id: string;
  userId: string;
  roleId: string;
  assignedByUserId?: string | null;
  expiresAt?: string | null;
}) {
  const result = await query(
    `insert into access_user_roles(
       id,
       user_id,
       role_id,
       assigned_at,
       assigned_by_user_id,
       expires_at,
       created_at,
       updated_at
     ) values ($1,$2,$3,now(),$4,$5,now(),now())
     on conflict (user_id, role_id)
     do update set
       assigned_at = now(),
       assigned_by_user_id = excluded.assigned_by_user_id,
       expires_at = excluded.expires_at,
       updated_at = now()
     returning id, user_id, role_id, assigned_at, expires_at`,
    [
      input.id,
      input.userId,
      input.roleId,
      input.assignedByUserId || null,
      input.expiresAt || null
    ]
  );

  const row = result.rows[0];
  return {
    id: row?.id,
    userId: row?.user_id,
    roleId: row?.role_id,
    assignedAt: toIso(row?.assigned_at),
    expiresAt: toIso(row?.expires_at)
  };
}

export async function revokeAdminAccessRoleFromUser(userId: string, roleId: string) {
  const result = await query(
    `delete from access_user_roles
      where user_id = $1 and role_id = $2
      returning id`,
    [userId, roleId]
  );

  return {
    removed: (result.rowCount || 0) > 0
  };
}

export async function insertAccessAdminAudit(entry: {
  id: string;
  actorUserId?: string | null;
  targetUserId?: string | null;
  targetSessionId?: string | null;
  actionType: string;
  actionStatus?: string;
  reason?: string | null;
  correlationId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  await query(
    `insert into access_session_admin_audit(
       id,
       actor_user_id,
       target_user_id,
       target_session_id,
       action_type,
       action_status,
       reason,
       correlation_id,
       metadata
     ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)`,
    [
      entry.id,
      entry.actorUserId || null,
      entry.targetUserId || null,
      entry.targetSessionId || null,
      entry.actionType,
      entry.actionStatus || 'succeeded',
      entry.reason || null,
      entry.correlationId || null,
      JSON.stringify(entry.metadata || {})
    ]
  );
}

export async function findAdminAccessPermissionById(permissionId: string) {
  const result = await query(
    `select
       ap.id as permission_id,
       ap.resource,
       ap.action,
       coalesce(ap.description, '') as description
     from access_permissions ap
     where ap.id = $1
       and ap.is_active = true`,
    [permissionId]
  );

  if (!result.rows[0]) {
    return null;
  }

  return mapPermission(result.rows[0] as PermissionRow);
}

export async function createAdminAccessPermission(input: {
  id: string;
  permissionKey: string;
  resource: string;
  action: string;
  description?: string | null;
}) {
  const result = await query(
    `insert into access_permissions(
       id,
       permission_key,
       resource,
       action,
       description,
       is_active,
       created_at,
       updated_at
     ) values ($1,$2,$3,$4,$5,true,now(),now())
     returning
       id as permission_id,
       resource,
       action,
       coalesce(description, '') as description`,
    [
      input.id,
      input.permissionKey,
      input.resource,
      input.action,
      input.description || null
    ]
  );

  return mapPermission(result.rows[0] as PermissionRow);
}

export async function updateAdminAccessPermissionById(input: {
  permissionId: string;
  resource?: string | null;
  action?: string | null;
  description?: string | null;
  permissionKey?: string | null;
}) {
  const result = await query(
    `update access_permissions
        set resource = coalesce($2, resource),
            action = coalesce($3, action),
            description = coalesce($4, description),
            permission_key = coalesce($5, permission_key),
            updated_at = now()
      where id = $1
        and is_active = true
      returning
        id as permission_id,
        resource,
        action,
        coalesce(description, '') as description`,
    [
      input.permissionId,
      input.resource ?? null,
      input.action ?? null,
      input.description ?? null,
      input.permissionKey ?? null
    ]
  );

  if (!result.rows[0]) {
    return null;
  }

  return mapPermission(result.rows[0] as PermissionRow);
}

export async function deactivateAdminAccessPermissionById(permissionId: string) {
  const result = await query(
    `update access_permissions
        set is_active = false,
            updated_at = now()
      where id = $1
        and is_active = true
      returning id`,
    [permissionId]
  );

  return {
    removed: (result.rowCount || 0) > 0
  };
}
