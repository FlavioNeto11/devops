import { query, withTransaction } from '../db/pool.js';
import type { QueryResultRow } from 'pg';
import { ADMIN_ROLE_NAME_ALIASES } from '../lib/conversation-permission-catalog.js';

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
  /** Opcional só porque nem todo SELECT legado a projetava; todos os desta camada projetam. */
  permission_key?: string | null;
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

/**
 * ⚠️ `permissionKey` é ADITIVO e existe por causa da fase 4.5: a partir dela a chave é LOAD-BEARING
 * (é a string que `hasConversationPermission` compara), e esta camada a OMITIA. Como
 * `updateAdminAccessPermissionById` deixa alterar `resource`, `action` e `permission_key` de forma
 * independente, dava para editar `resource/action` e a chave real divergir do que a tela mostra, sem
 * nenhum aviso — quebrando o gate de forma invisível. Expor a chave é a metade barata da mitigação;
 * a outra é o seed, que reconcilia `resource`/`action` a partir da chave a cada boot.
 */
function mapPermission(row: PermissionRow) {
  return {
    permissionId: row.permission_id,
    permissionKey: row.permission_key || '',
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

/**
 * Administração global por NOME DE PAPEL — nunca por permissão.
 *
 * ⚠️ INVARIANTE DE ROLLBACK (fase 4.5): esta função e `ensureAdminAuthorization` NÃO leem
 * `access_permissions`. É isso que faz a tela de Acessos sobreviver ao fechamento do gate
 * conversacional: com o chat trancado, os administradores continuam podendo CONCEDER papel — que é o
 * rollback de Nível 0 (segundos, sem deploy, sem kubectl, sem SQL). Se um dia alguém tornar a API
 * administrativa gated por PERMISSÃO, este desenho PERDE a escada de saída e o rollback vira redeploy.
 *
 * A lista de aliases vem de `lib/conversation-permission-catalog.ts` — antes estava literal aqui E em
 * `access-admin-service.ts`, e as duas cópias podiam divergir.
 */
export async function hasAdminGlobalAccessByUserId(userId: string) {
  const result = await query<SessionRow>(
    `select exists(
       select 1
       from access_user_roles aur
       inner join access_roles ar on ar.id = aur.role_id
       where aur.user_id = $1
         and ar.is_active = true
         and (aur.expires_at is null or aur.expires_at > now())
         and lower(ar.role_name) = any($2::text[])
     ) as has_access`,
    [userId, [...ADMIN_ROLE_NAME_ALIASES]]
  );

  return Boolean(result.rows[0]?.has_access);
}

/**
 * Predicado "este usuário JÁ TEM alguma chave de permissão EFETIVA".
 *
 * ⚠️ É o MESMO caminho de `PERMISSION_KEYS_BY_USER_SQL` (papel ativo × grant não expirado × vínculo ×
 * permissão ativa). Isso não é preciosismo: a versão anterior deste predicado fazia join só em
 * `access_roles`, ou seja, condicionava o piso a TER ALGUM PAPEL e não a TER ALGUMA PERMISSÃO. Um
 * papel VAZIO — que `createAdminAccessRole` cria em um POST e a tela de Acessos concede em um clique —
 * satisfazia a condição, suprimia o piso e deixava a pessoa com conjunto de chaves VAZIO. Sob
 * `enforce`, chat morto; e durável, porque o backfill do boot repetia o mesmo engano.
 *
 * Fonte ÚNICA de propósito: o seed do boot (`bootstrap/access-control-seed.ts`) importa esta função em
 * vez de repetir o SQL. Os dois sítios divergirem foi exatamente o defeito.
 *
 * `userIdExpression` é uma EXPRESSÃO SQL do chamador (`$2` no grant de login, `u.id` no backfill em
 * conjunto) — nunca dado de usuário. Não há concatenação de valor aqui.
 */
export function buildHasEffectivePermissionSql(userIdExpression: string): string {
  return `exists (
            select 1
              from access_user_roles aur
              inner join access_roles ar_existing on ar_existing.id = aur.role_id
              inner join access_role_permissions arp on arp.role_id = aur.role_id
              inner join access_permissions ap on ap.id = arp.permission_id
             where aur.user_id = ${userIdExpression}
               and ar_existing.is_active = true
               and ap.is_active = true
               and (aur.expires_at is null or aur.expires_at > now())
          )`;
}

/**
 * Revive de grant EXPIRADO, e só dele.
 *
 * A unique `(user_id, role_id)` guarda a linha expirada, então `on conflict do nothing` fazia o piso
 * NUNCA ser reconcedido a quem tivesse um grant de `sicat.reader` vencido: o `not exists` dizia "sem
 * permissão", o insert disparava, o conflito engolia, e a pessoa ficava sem nenhuma chave para sempre
 * — sem login, refresh, restart ou backfill que reparasse.
 *
 * O `where` é a diferença entre isto e o `do update` cego de `grantAdminAccessRoleToUser`: uma
 * expiração deliberada AINDA NO FUTURO (terceirizado até 31/12) é preservada intacta.
 */
const FLOOR_ROLE_REVIVE_EXPIRED_CLAUSE = `on conflict (user_id, role_id) do update
        set expires_at = null,
            assigned_at = now(),
            updated_at = now()
      where access_user_roles.expires_at is not null
        and access_user_roles.expires_at <= now()`;

/**
 * Concede o papel-PISO a um usuário ATIVO que não tenha NENHUMA PERMISSÃO EFETIVA.
 *
 * Chamado no funil único de autenticação (`issueTokenPair`) — não nos sítios de criação de usuário.
 * Instrumentar os sítios seria pior: não conserta os usuários que já existem (viraria a migration de
 * dados que esta fase evita) e faria o endpoint PÚBLICO de registro conceder papel no ato da criação.
 *
 * Idempotente por construção: `not exists` + `on conflict ... do update` restrito a grant EXPIRADO.
 * NÃO usa o `do update` de `grantAdminAccessRoleToUser`, que reescreveria `assigned_by_user_id` e
 * `expires_at` e re-expiraria a cada login um grant deliberadamente temporário.
 *
 * ⚠️ Consequência ACEITA: revogar todos os papéis de alguém deixa de ser durável — o próximo login
 * reconcede o piso. O instrumento correto de corte é `sicat_users.is_active = false`, que a auth já
 * rejeita e por onde este SQL também filtra.
 */
export const FLOOR_ROLE_GRANT_SQL = `insert into access_user_roles (id, user_id, role_id, assigned_by_user_id)
     select $1, $2, ar.id, null
       from access_roles ar
      where ar.role_name = $3
        and ar.is_active = true
        and exists (select 1 from sicat_users u where u.id = $2 and u.is_active = true)
        and not ${buildHasEffectivePermissionSql('$2')}
     ${FLOOR_ROLE_REVIVE_EXPIRED_CLAUSE}`;

/** Cláusula de conflito do piso, compartilhada com o backfill do boot. */
export const FLOOR_ROLE_CONFLICT_SQL = FLOOR_ROLE_REVIVE_EXPIRED_CLAUSE;

export async function ensureFloorRoleForUser(input: {
  grantId: string;
  userId: string;
  roleName: string;
}): Promise<boolean> {
  const result = await query(
    FLOOR_ROLE_GRANT_SQL,
    [input.grantId, input.userId, input.roleName]
  );

  return (result.rowCount ?? 0) > 0;
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
       ap.permission_key,
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

/**
 * Chaves de permissão EFETIVAS de um usuário (papéis não expirados × permissões ativas).
 *
 * Usado pelo principal conversacional para resolver as permissões NO SERVIDOR — antes elas vinham
 * em `context.metadata.permissionKeys`, declaradas pelo próprio cliente.
 *
 * Resolvido POR TURNO — o access token não carrega permissão (`issueTokenPair` chumba um
 * `roles: ['operator']` decorativo). Consequência boa: não existe janela de token velho. Quem recebe
 * um grant passa a valer no turno SEGUINTE, sem relogin, e é isso que torna o rollback instantâneo.
 *
 * ⚠️ O join com `sicat_users.is_active` (fase 4.5) não é adorno: sem ele, desativar um funcionário
 * NÃO desligava o WhatsApp dele — no HTTP a janela é o TTL de 1 h do token, mas no canal não há token
 * e a identidade vem do vínculo, ou seja, era ilimitada. O join zera as permissões; a rejeição do
 * turno inteiro está em `resolveChannelPrincipal`, porque as tools sem chave exigida rodariam mesmo
 * com o conjunto vazio.
 */
export const PERMISSION_KEYS_BY_USER_SQL = `select distinct ap.permission_key
       from access_user_roles aur
       inner join sicat_users u on u.id = aur.user_id and u.is_active = true
       inner join access_role_permissions arp on arp.role_id = aur.role_id
       inner join access_permissions ap on ap.id = arp.permission_id
       inner join access_roles ar on ar.id = aur.role_id
      where aur.user_id = $1
        and ap.is_active = true
        and ar.is_active = true
        and (aur.expires_at is null or aur.expires_at > now())`;

export async function listPermissionKeysByUserId(userId: string): Promise<string[]> {
  const result = await query<{ permission_key: string }>(
    PERMISSION_KEYS_BY_USER_SQL,
    [userId]
  );

  return result.rows
    .map((row) => String(row.permission_key || '').trim().toLowerCase())
    .filter(Boolean);
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
       ap.permission_key,
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
       ap.permission_key,
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
       ap.permission_key,
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
       permission_key,
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
        permission_key,
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
