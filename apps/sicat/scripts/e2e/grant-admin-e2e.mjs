#!/usr/bin/env node
/**
 * Concede acesso administrativo global ao usuário interno E2E (idempotente).
 *
 * Cria a role `admin.global` (se não existir) e vincula ao usuário E2E em
 * `access_user_roles` — exatamente o que `hasAdminGlobalAccessByUserId` exige.
 * Idempotente: re-executar não duplica role nem vínculo.
 *
 * Sem segredos hardcoded de CETESB. Usa DATABASE_URL local (postgres docker).
 */
import pg from 'pg';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

function loadDotenv(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const t = line.trim(); if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('='); if (i > 0 && process.env[t.slice(0, i).trim()] === undefined) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
}
loadDotenv(resolve(process.cwd(), '.env.e2e'));

const email = (process.env.SICAT_E2E_INTERNAL_USER_EMAIL || 'sicat.e2e.gerador.local@example.test').toLowerCase();
const connectionString = process.env.E2E_DATABASE_URL || 'postgres://postgres:postgres@127.0.0.1:5432/mtr_automation';

const client = new pg.Client({ connectionString });

async function main() {
  await client.connect();

  const role = await client.query(
    `insert into access_roles (id, role_name, description, is_system, is_active, created_at, updated_at)
     select 'role_admin_global_e2e', 'admin.global', 'Admin global (E2E)', false, true, now(), now()
     where not exists (select 1 from access_roles where lower(role_name) = 'admin.global')
     returning id`
  );
  console.log(`[grant-admin] role admin.global: ${role.rowCount ? 'criada' : 'já existia'}`);

  const link = await client.query(
    `insert into access_user_roles (id, user_id, role_id, assigned_at, assigned_by_user_id, created_at, updated_at)
     select 'aur_e2e_admin_global', u.id, r.id, now(), u.id, now(), now()
     from sicat_users u
     cross join access_roles r
     where lower(u.email) = $1 and lower(r.role_name) = 'admin.global'
       and not exists (select 1 from access_user_roles aur where aur.user_id = u.id and aur.role_id = r.id)
     returning id`,
    [email]
  );
  console.log(`[grant-admin] vínculo usuário↔admin.global: ${link.rowCount ? 'criado' : 'já existia'}`);

  const check = await client.query(
    `select exists(
       select 1 from access_user_roles aur
       inner join access_roles ar on ar.id = aur.role_id
       inner join sicat_users u on u.id = aur.user_id
       where lower(u.email) = $1 and ar.is_active = true
         and (aur.expires_at is null or aur.expires_at > now())
         and lower(ar.role_name) in ('admin.global','admin_global','admin','role_admin_global')
     ) as has_access`,
    [email]
  );
  console.log(`[grant-admin] hasAdminGlobalAccess = ${check.rows[0]?.has_access ? 'SIM ✅' : 'NÃO ❌'}`);
}

main()
  .catch((e) => { console.error('[grant-admin] erro:', e?.message || e); process.exitCode = 1; })
  .finally(() => client.end());
