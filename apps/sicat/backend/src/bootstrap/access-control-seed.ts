/**
 * Seed do catálogo RBAC da superfície conversacional (fase 4.5 da cadeia `whatsapp-channel-sicat`).
 *
 * ── POR QUE SEED DE BOOT E NÃO MIGRATION ────────────────────────────────────────────────────────
 * 1. Migration é ESTRUTURALMENTE incapaz de resolver o problema. O buraco não é dívida histórica: os
 *    três sítios que criam `sicat_users` (`ensureBootstrapUserIfNeeded`, `registerSicat`,
 *    `loginSicatViaKeycloak`) criam usuário SEM papel todo dia. Uma migration de dados conserta os
 *    usuários de hoje e nenhum de amanhã.
 * 2. Migration roda uma vez e CONGELA erro. Uma chave digitada errada entra em `schema_migrations`
 *    como aplicada e nunca reexecuta — conserto vira outra migration ou SQL manual em produção. Este
 *    seed reconcilia a cada boot e se autocorrige no deploy seguinte.
 * 3. Falha de migration derruba o SICAT INTEIRO (`server.ts` faz `await ensureStartup()` em top-level
 *    await sem try/catch; `worker.ts` faz `process.exit(1)`), não "chat degradado".
 * 4. ⚠️ `src/db/migrate.ts` NÃO tem advisory lock (35 linhas, sem lock nenhum), apesar de
 *    `apps/sicat/CLAUDE.md` e do comentário em `k8s/backend.yaml` afirmarem que tem — os dois foram
 *    corrigidos neste PR. Com `AUTO_MIGRATE=true` em `sicat-api` E `sicat-worker`, duas migrations
 *    inéditas na mesma corrida seria a aposta errada.
 *
 * ── IDEMPOTÊNCIA ────────────────────────────────────────────────────────────────────────────────
 * Chave = UNIQUE NATURAL, JAMAIS a PK. `createPrefixedId` é `randomBytes`, então copiar o
 * `on conflict (id)` de `ensureBaseData` duplicaria o catálogo a cada boot. As uniques da migration
 * 008: `access_permissions.permission_key`, `access_roles.role_name`,
 * `access_role_permissions (role_id, permission_id)`, `access_user_roles (user_id, role_id)`.
 * `(resource, action)` tem só ÍNDICE — a identidade é a chave.
 *
 * Este seed roda em DOIS pods ao mesmo tempo (api e worker sobem juntos, ambos `AUTO_SEED=true`).
 * Por isso todo statement é UM SÓ, com `on conflict`: upsert é serializado pelo Postgres no índice
 * único; read-then-write não é (é o anti-padrão de `ensureDefaultPromptsSeeded`). A ordem alfabética
 * fixa transforma a corrida em espera de índice em vez de deadlock. Uma única transação: "morreu no
 * meio" deixa de existir como estado.
 *
 * ── PROPRIEDADE POR COLUNA ──────────────────────────────────────────────────────────────────────
 * O seed é dono da DEFINIÇÃO (resource/action/description); o OPERADOR é dono de liga/desliga
 * (`is_active`) e das concessões. Por isso `is_active` fica FORA de todo `do update`: se o seed
 * reativasse, um `PATCH /v1/admin/access/permissions/:id {is_active:false}` seria desfeito no próximo
 * boot, sem aviso. O seed declara PISO, nunca TETO: só insere, nunca apaga, nunca desativa. Um
 * alargamento de emergência feito pelo admin SOBREVIVE a restart — é isso que torna o rollback de
 * Nível 0 durável.
 *
 * ⚠️ NUNCA reutilizar `replaceAdminAccessRolePermissions`: ela faz `delete from
 * access_role_permissions where role_id = $1` e reinsere. O motivo é suficiente sozinho: sendo
 * `delete` + reinsert, o PRIMEIRO restart desfaz um alargamento de emergência do operador e derruba o
 * rollback de Nível 0.
 * (Uma versão anterior deste cabeçalho — e do runbook — afirmava também que o `delete` abre uma janela
 * em que o papel fica sem permissão para leitores concorrentes. É FALSO: `delete` e inserts estão
 * dentro de `withTransaction`, e sob READ COMMITTED nenhuma sessão concorrente enxerga o estado
 * intermediário não-commitado. A frase foi removida dos dois arquivos porque mandava um investigador
 * futuro de `PERMISSION_DENIED` intermitente atrás de uma causa impossível.)
 *
 * ── TESTEMUNHA DE ALARGAMENTO DO PISO ───────────────────────────────────────────────────────────
 * O seed é aditivo, então um alargamento do papel-PISO (o que o auto-cadastro público concede)
 * sobrevive a todo restart, é invisível na métrica — com todo mundo tendo a chave, o gate retorna no
 * passo 2 e o contador para de emitir amostra — e não tem alerta nenhum. O boot passa a ser a
 * testemunha: se o piso tiver QUALQUER chave além das declaradas, sai `console.error` e uma linha
 * `ACCESS_CONTROL_FLOOR_ROLE_WIDENED` na trilha administrativa.
 *
 * ── TESTABILIDADE ───────────────────────────────────────────────────────────────────────────────
 * Os statements são construídos por `buildAccessControlSeedStatements()`, uma função PURA. O teste
 * afirma sobre o SQL que realmente vai ao banco (nenhum insert sem `on conflict`, nenhum `delete`,
 * `is_active` fora de todo `do update`, `returning id` no upsert de permissão) sem precisar de banco
 * — e sem que um double reimplemente a lógica e concorde consigo mesmo.
 */

import type { PoolClient } from 'pg';
import { withTransaction } from '../db/pool.js';
import { config } from '../lib/config.js';
import { createPrefixedId } from '../lib/ids.js';
import {
  FLOOR_ROLE_CONFLICT_SQL,
  buildHasEffectivePermissionSql
} from '../repositories/access-admin-repo.js';
import {
  ADMIN_ROLE_NAME_ALIASES,
  CANONICAL_ADMIN_ROLE_NAME,
  CONVERSATION_PERMISSION_CATALOG,
  FLOOR_ROLE_NAME,
  SEEDED_ACCESS_ROLES,
  listAdminRolePermissionKeys,
  listCatalogPermissionKeys,
  listFloorRolePermissionKeys
} from '../lib/conversation-permission-catalog.js';

export type AccessControlSeedStatement = {
  /** Rótulo estável — usado no resultado e nas asserções de teste. */
  name: string;
  sql: string;
  params: unknown[];
};

export type AccessControlSeedResult = {
  permissionsReconciled: number;
  rolesReconciled: number;
  rolePermissionLinksCreated: number;
  adminRolePermissionLinksCreated: number;
  adminRoleBootstrapped: boolean;
  floorRoleGrantsCreated: number;
  adminGrantBootstrapped: boolean;
  /** Chaves do papel-PISO ALÉM das declaradas. Não-vazio = a internet inteira tem essas chaves. */
  floorRoleExtraPermissionKeys: string[];
};

const ADMIN_ALIASES = [...ADMIN_ROLE_NAME_ALIASES];

/** Id textual gerado NO BANCO, para inserts EM CONJUNTO (onde não há uma linha por chamada JS). */
const GENERATED_ID = (prefix: string) => `'${prefix}_' || replace(gen_random_uuid()::text, '-', '')`;

/**
 * Colisão de nome de papel com um alias de ADMINISTRADOR é escalada de privilégio: criar um papel
 * chamado `admin` concederia a administração inteira a quem o recebesse. Falha ALTO, antes do banco.
 */
function assertNoAdminRoleNameCollision(): void {
  const collisions = SEEDED_ACCESS_ROLES
    .map((role) => role.roleName.toLowerCase())
    .filter((roleName) => ADMIN_ALIASES.includes(roleName));

  if (collisions.length > 0) {
    throw new Error(
      `[access-control-seed] role_name do catalogo colide com alias de administrador: ${collisions.join(', ')}. `
        + 'Um papel com esse nome concederia administracao global inteira.'
    );
  }
}

/** Cada chave declarada uma vez, na convenção `${resource}.${action}`, e existente no catálogo. */
function assertCatalogIsWellFormed(): void {
  const keys = CONVERSATION_PERMISSION_CATALOG.map((entry) => entry.permissionKey);
  const duplicated = keys.filter((key, index) => keys.indexOf(key) !== index);
  if (duplicated.length > 0) {
    throw new Error(`[access-control-seed] chave duplicada no catalogo: ${[...new Set(duplicated)].join(', ')}`);
  }

  for (const entry of CONVERSATION_PERMISSION_CATALOG) {
    const expected = `${entry.resource}.${entry.action}`.toLowerCase();
    if (entry.permissionKey !== expected) {
      throw new Error(
        `[access-control-seed] permission_key '${entry.permissionKey}' diverge de '${expected}' `
          + '(convencao resource.action de buildPermissionKey).'
      );
    }
  }

  const catalogKeys = new Set(keys);
  for (const role of SEEDED_ACCESS_ROLES) {
    for (const key of role.permissionKeys) {
      if (!catalogKeys.has(key)) {
        throw new Error(
          `[access-control-seed] papel '${role.roleName}' referencia chave inexistente no catalogo: ${key}`
        );
      }
    }
  }
}

/**
 * Statements do seed, em ordem de execução. Função PURA (a única variação externa é
 * `SICAT_BOOTSTRAP_EMAIL`, e ela só ACRESCENTA o último statement).
 */
export function buildAccessControlSeedStatements(): AccessControlSeedStatement[] {
  assertNoAdminRoleNameCollision();
  assertCatalogIsWellFormed();

  const statements: AccessControlSeedStatement[] = [];

  // 1. Permissões, em ordem alfabética determinística. Com api e worker semeando ao mesmo tempo, a
  //    ordem fixa faz a segunda transação ESPERAR no índice em vez de cruzar locks com a primeira.
  const orderedPermissions = [...CONVERSATION_PERMISSION_CATALOG]
    .sort((left, right) => left.permissionKey.localeCompare(right.permissionKey));

  for (const entry of orderedPermissions) {
    statements.push({
      name: `permission:${entry.permissionKey}`,
      // `do update` e NÃO `do nothing`: além de reconciliar resource/action a partir da chave (que é
      // a mitigação da divergência editável pela API administrativa), `do nothing ... returning id`
      // devolveria ZERO linhas na SEGUNDA execução — o bug mais provável desta fase inteira.
      // `is_active` fica só no `values`: liga/desliga é do operador.
      sql: `insert into access_permissions (id, permission_key, resource, action, description, is_active)
            values ($1, $2, $3, $4, $5, true)
            on conflict (permission_key) do update
              set resource = excluded.resource,
                  action = excluded.action,
                  description = excluded.description,
                  updated_at = now()
            returning id`,
      params: [
        createPrefixedId('prm'),
        entry.permissionKey,
        entry.resource,
        entry.action,
        entry.description
      ]
    });
  }

  // 2. Banco NOVO (dev local) sem NENHUM papel de administração: ninguém acessa
  //    `/v1/admin/access/*` (o gate admin é por nome de papel, e o token traz `roles: ['operator']`
  //    decorativo) e ninguém pode se promover — deadlock. No cluster a condição é falsa (o papel
  //    existe, com 2 usuários) → NO-OP garantido. Nunca renomeia, nunca desativa, nunca reescreve o
  //    papel existente: ele é a escada de saída do rollback de Nível 0.
  statements.push({
    name: 'admin-role-bootstrap',
    sql: `insert into access_roles (id, role_name, description, is_system, is_active)
          select $1, $2, $3, true, true
           where not exists (
             select 1 from access_roles where lower(role_name) = any($4::text[])
           )
          on conflict (role_name) do nothing`,
    params: [
      createPrefixedId('role'),
      CANONICAL_ADMIN_ROLE_NAME,
      'Administracao global do SICAT (perfis, acessos e sessoes)',
      ADMIN_ALIASES
    ]
  });

  // 3. Papéis semeados. `is_system` e `is_active` FORA do `set`: definição é do seed, estado é do
  //    operador.
  const orderedRoles = [...SEEDED_ACCESS_ROLES]
    .sort((left, right) => left.roleName.localeCompare(right.roleName));

  for (const role of orderedRoles) {
    statements.push({
      name: `role:${role.roleName}`,
      sql: `insert into access_roles (id, role_name, description, is_system, is_active)
            values ($1, $2, $3, true, true)
            on conflict (role_name) do update
              set description = excluded.description,
                  updated_at = now()`,
      params: [createPrefixedId('role'), role.roleName, role.description]
    });
  }

  // 4. Papel → permissões, EM CONJUNTO. `do nothing` serve aqui (ninguém precisa do id de volta).
  //    Aditivo: um alargamento manual do papel sobrevive ao restart.
  //    A ordenação vai num subselect — `insert ... select ... order by ... on conflict` é gramática
  //    ambígua o bastante para não valer a aposta, e a ordem é o que evita deadlock api × worker.
  for (const role of orderedRoles) {
    statements.push({
      name: `role-permissions:${role.roleName}`,
      sql: `insert into access_role_permissions (id, role_id, permission_id)
            select src.id, src.role_id, src.permission_id
              from (
                select ${GENERATED_ID('arp')} as id, ar.id as role_id, ap.id as permission_id
                  from access_roles ar
                  cross join access_permissions ap
                 where ar.role_name = $1
                   and ap.permission_key = any($2::text[])
                 order by ap.permission_key asc
              ) src
            on conflict (role_id, permission_id) do nothing`,
      params: [role.roleName, [...role.permissionKeys].sort()]
    });
  }

  // 5. `admin.global` (e aliases) recebe o catálogo INTEIRO — senão os administradores atuais perdem
  //    o chat no flip. Amarrado por `role_name`, JAMAIS por id (o id vivo é acidente de um ambiente).
  //    Vincula a TODO papel cujo nome esteja na lista, senão um ambiente com o papel chamado `admin`
  //    teria administrador de plataforma sem permissão de chat.
  statements.push({
    name: 'admin-role-permissions',
    sql: `insert into access_role_permissions (id, role_id, permission_id)
          select src.id, src.role_id, src.permission_id
            from (
              select ${GENERATED_ID('arp')} as id, ar.id as role_id, ap.id as permission_id
                from access_roles ar
                cross join access_permissions ap
               where lower(ar.role_name) = any($1::text[])
                 and ap.permission_key = any($2::text[])
               order by ar.role_name asc, ap.permission_key asc
            ) src
          on conflict (role_id, permission_id) do nothing`,
    params: [ADMIN_ALIASES, listAdminRolePermissionKeys()]
  });

  // 6. Backfill do papel-PISO: todo usuário ATIVO sem NENHUMA PERMISSÃO EFETIVA. É o par necessário
  //    de `ensureFloorRoleForUser` (que roda no login) — garante que no momento do flip todos já
  //    tenham chave sem depender de terem entrado, o que torna a verificação pré-flip DETERMINÍSTICA
  //    em vez de "esperar as pessoas aparecerem".
  //
  //    O predicado e a cláusula de conflito são IMPORTADOS de `access-admin-repo` — os dois sítios
  //    divergirem era o defeito: aqui condicionava-se o piso a TER PAPEL (papel vazio suprimia o piso)
  //    e o `do nothing` fazia grant expirado nunca reviver. Como o predicado é o mesmo de
  //    `listPermissionKeysByUserId`, quem tem `admin.global` NÃO ganha `sicat.reader`.
  //
  //    ⚠️ ORDEM IMPORTA: este statement roda DEPOIS de 4 e 5, dentro da MESMA transação, então os
  //    vínculos papel→permissão recém-criados já são visíveis aqui. Movê-lo para antes faria o
  //    backfill enxergar "ninguém tem permissão" num banco novo e dar piso até para o `admin.global`.
  statements.push({
    name: 'floor-role-backfill',
    sql: `insert into access_user_roles (id, user_id, role_id, assigned_by_user_id)
          select src.id, src.user_id, src.role_id, null
            from (
              select ${GENERATED_ID('aur')} as id, u.id as user_id, ar.id as role_id
                from sicat_users u
                cross join access_roles ar
               where ar.role_name = $1
                 and ar.is_active = true
                 and u.is_active = true
                 and not ${buildHasEffectivePermissionSql('u.id')}
               order by u.id asc
            ) src
          ${FLOOR_ROLE_CONFLICT_SQL}`,
    params: [FLOOR_ROLE_NAME]
  });

  // 7. Bootstrap de ADMINISTRADOR para banco NOVO: concede `admin.global` ao usuário de
  //    `SICAT_BOOTSTRAP_EMAIL` SOMENTE se (a) a env existe, (b) resolve para um `sicat_users` ativo e
  //    (c) NÃO há nenhum grant de papel admin no banco inteiro. No cluster a condição (c) é falsa (2
  //    grants) → NO-OP garantido, qualquer que seja o valor da env dentro do Secret selado.
  //    Deliberadamente NÃO existe flag do tipo `DEV_GRANT_ALL`: é o tipo de bypass que vaza para
  //    produção.
  //
  //    ⚠️ LIMITAÇÃO CONHECIDA, documentada em vez de mascarada: isto NÃO resolve o deadlock no boot
  //    em que o banco é criado — resolve no SEGUNDO. `ensureBootstrapUserIfNeeded` cria o usuário de
  //    bootstrap PREGUIÇOSAMENTE, dentro de `getValidatedUser` (ou seja, no LOGIN), então num banco
  //    vazio `sicat_users` está vazia quando este statement roda e (b) é falsa. Ambiente novo exige:
  //    boot → um login local → RESTART da api. Está escrito em `backend/.env.example` ao lado das
  //    duas envs. Chamar `ensureBootstrapUserIfNeeded()` antes do seed foi descartado aqui: puxaria
  //    `services/sicat-auth-service` (e hash de senha) para dentro de `bootstrap/`, e criar usuário
  //    com senha no caminho de seed é superfície que não se quer ganhar de graça.
  const bootstrapEmail = String(config.sicatBootstrapEmail || '').trim().toLowerCase();
  if (bootstrapEmail) {
    statements.push({
      name: 'admin-grant-bootstrap',
      sql: `insert into access_user_roles (id, user_id, role_id, assigned_by_user_id)
            select ${GENERATED_ID('aur')}, u.id, ar.id, null
              from sicat_users u
              cross join access_roles ar
             where lower(u.email) = $1
               and u.is_active = true
               and lower(ar.role_name) = $2
               and ar.is_active = true
               and not exists (
                 select 1
                   from access_user_roles aur_admin
                   inner join access_roles ar_admin on ar_admin.id = aur_admin.role_id
                  where lower(ar_admin.role_name) = any($3::text[])
               )
            on conflict (user_id, role_id) do nothing`,
      params: [bootstrapEmail, CANONICAL_ADMIN_ROLE_NAME, ADMIN_ALIASES]
    });
  }

  return statements;
}

/**
 * Trilha. Sem `schema_migrations` para consultar, esta linha é a ÚNICA resposta possível à pergunta
 * "o seed rodou?" — e o passo de verificação pré-flip depende dela.
 *
 * Vai em `access_session_admin_audit` (e não em `system_events`) porque `system_events.event_type`
 * tem CHECK com lista FECHADA: acrescentar um tipo exigiria justamente a migration que esta fase
 * evita. `access_session_admin_audit` é a trilha administrativa de acesso — o lugar semanticamente
 * certo, com `action_type` livre.
 */
export function buildAccessControlSeedTrailStatement(result: AccessControlSeedResult): AccessControlSeedStatement {
  return {
    name: 'seed-trail',
    sql: `insert into access_session_admin_audit (
            id, actor_user_id, target_user_id, target_session_id,
            action_type, action_status, reason, metadata
          ) values ($1, null, null, null, $2, 'succeeded', $3, $4::jsonb)`,
    params: [
      createPrefixedId('asa'),
      'ACCESS_CONTROL_SEED_APPLIED',
      'Reconciliacao do catalogo RBAC no boot (bootstrap/access-control-seed.ts)',
      JSON.stringify({
        permissionKeys: listCatalogPermissionKeys(),
        roles: SEEDED_ACCESS_ROLES.map((role) => role.roleName),
        ...result
      })
    ]
  };
}

/**
 * Chaves ATIVAS vinculadas ao papel-PISO que NÃO estão na lista declarada. Leitura pura.
 *
 * `$2` é a lista declarada (`listFloorRolePermissionKeys()`), não uma constante literal: se um dia o
 * piso ganhar uma segunda chave DE PROPÓSITO, a testemunha acompanha em vez de gritar falso positivo.
 */
export const FLOOR_ROLE_EXTRA_PERMISSIONS_SQL = `select ap.permission_key
       from access_roles ar
       inner join access_role_permissions arp on arp.role_id = ar.id
       inner join access_permissions ap on ap.id = arp.permission_id
      where ar.role_name = $1
        and ap.is_active = true
        and not (ap.permission_key = any($2::text[]))
      order by ap.permission_key asc`;

/**
 * Linha de trilha do alargamento. Builder PURO (o teste afirma sobre o SQL e sobre os params sem
 * precisar de banco), no mesmo padrão de `buildAccessControlSeedTrailStatement`.
 */
export function buildFloorRoleWideningAuditStatement(extraPermissionKeys: string[]): AccessControlSeedStatement {
  return {
    name: 'floor-role-widened-trail',
    sql: `insert into access_session_admin_audit (
            id, actor_user_id, target_user_id, target_session_id,
            action_type, action_status, reason, metadata
          ) values ($1, null, null, null, $2, 'failed', $3, $4::jsonb)`,
    params: [
      createPrefixedId('asa'),
      'ACCESS_CONTROL_FLOOR_ROLE_WIDENED',
      `O papel-PISO '${FLOOR_ROLE_NAME}' tem chave alem das declaradas. O piso e o que o auto-cadastro `
        + 'PUBLICO concede: toda pessoa que criar conta ganha estas chaves. Estreite o piso antes de fechar o incidente.',
      JSON.stringify({
        floorRoleName: FLOOR_ROLE_NAME,
        declaredPermissionKeys: listFloorRolePermissionKeys(),
        extraPermissionKeys
      })
    ]
  };
}

function toResult(rowCounts: Map<string, number>): AccessControlSeedResult {
  let rolePermissionLinksCreated = 0;
  for (const role of SEEDED_ACCESS_ROLES) {
    rolePermissionLinksCreated += rowCounts.get(`role-permissions:${role.roleName}`) ?? 0;
  }

  return {
    permissionsReconciled: CONVERSATION_PERMISSION_CATALOG.length,
    rolesReconciled: SEEDED_ACCESS_ROLES.length,
    rolePermissionLinksCreated,
    adminRolePermissionLinksCreated: rowCounts.get('admin-role-permissions') ?? 0,
    adminRoleBootstrapped: (rowCounts.get('admin-role-bootstrap') ?? 0) > 0,
    floorRoleGrantsCreated: rowCounts.get('floor-role-backfill') ?? 0,
    adminGrantBootstrapped: (rowCounts.get('admin-grant-bootstrap') ?? 0) > 0,
    floorRoleExtraPermissionKeys: []
  };
}

/**
 * Testemunha do alargamento do piso. Roda DEPOIS dos statements, na mesma transação: o estado que ela
 * observa é o estado final do boot.
 */
async function auditFloorRoleWideningIfAny(client: PoolClient): Promise<string[]> {
  const declared = listFloorRolePermissionKeys();
  const extras = await client.query<{ permission_key: string }>(
    FLOOR_ROLE_EXTRA_PERMISSIONS_SQL,
    [FLOOR_ROLE_NAME, declared]
  );

  const extraPermissionKeys = extras.rows
    .map((row) => String(row.permission_key || '').trim().toLowerCase())
    .filter(Boolean);

  if (extraPermissionKeys.length === 0) return [];

  console.error(
    `[access-control-seed] ALERTA: o papel-PISO '${FLOOR_ROLE_NAME}' esta ALARGADO com `
      + `${extraPermissionKeys.join(', ')}. O piso e o que o auto-cadastro PUBLICO concede — hoje qualquer `
      + 'pessoa que criar conta ganha estas chaves. Se isto foi rollback de emergencia, estreite o piso '
      + '(PATCH do papel com apenas os ids declarados) antes de fechar o incidente; o caminho reversivel '
      + 'de degradacao e CONVERSATION_PERMISSION_ENFORCEMENT=observe. Ver docs/05-operacao/runbook-rbac-conversacional.md.'
  );

  const trail = buildFloorRoleWideningAuditStatement(extraPermissionKeys);
  await client.query(trail.sql, trail.params);

  return extraPermissionKeys;
}

async function runSeedStatements(client: PoolClient): Promise<AccessControlSeedResult> {
  const rowCounts = new Map<string, number>();

  for (const statement of buildAccessControlSeedStatements()) {
    const executed = await client.query(statement.sql, statement.params);
    rowCounts.set(statement.name, executed.rowCount ?? 0);
  }

  const floorRoleExtraPermissionKeys = await auditFloorRoleWideningIfAny(client);
  const result = { ...toResult(rowCounts), floorRoleExtraPermissionKeys };
  const trail = buildAccessControlSeedTrailStatement(result);
  await client.query(trail.sql, trail.params);

  return result;
}

/**
 * Reconcilia o catálogo inteiro numa ÚNICA transação. NÃO engole exceção: quem decide o que fazer com
 * a falha é `ensureBaseData` (o boot continua, mas o erro aparece alto). Falha silenciosa de seed com
 * gate fechado é exatamente o modo de falha que esta fase existe para eliminar.
 */
export async function ensureAccessControlBaseData(): Promise<AccessControlSeedResult> {
  return withTransaction(runSeedStatements);
}
