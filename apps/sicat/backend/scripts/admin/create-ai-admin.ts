/**
 * Cria/atualiza um usuário ADMIN global do SICAT (acesso a todas as telas, incl.
 * AI Control Center). Usa o código real do projeto (hashing scrypt, repos, IDs),
 * então o login `POST /v1/sicat/auth/login` e o gate `canAccessAdmin` funcionam.
 *
 * Uso (dentro do container api):
 *   npx tsx scripts/admin/create-ai-admin.ts [email] [senha] [nome]
 *
 * Idempotente: re-executar atualiza a senha e reforça o vínculo admin.
 */
import { query } from '../../src/db/pool.js';
import { createPrefixedId } from '../../src/lib/ids.js';
import { hashPassword } from '../../src/lib/sicat-security.js';
import { findByEmail, insert as insertSicatUser, updatePassword } from '../../src/repositories/sicat-user-repo.js';
import { createAdminAccessRole, grantAdminAccessRoleToUser } from '../../src/repositories/access-admin-repo.js';

const ADMIN_ROLE_NAME = 'admin.global';

async function ensureAdminRoleId(): Promise<string> {
  const existing = await query<{ id: string }>(
    `select id from access_roles where lower(role_name) = $1 order by created_at asc limit 1`,
    [ADMIN_ROLE_NAME]
  );
  const found = existing.rows[0];
  if (found?.id) {
    await query(`update access_roles set is_active = true, updated_at = now() where id = $1`, [found.id]);
    return found.id;
  }
  const roleId = createPrefixedId('role');
  await createAdminAccessRole({
    id: roleId,
    name: ADMIN_ROLE_NAME,
    description: 'Acesso administrativo global SICAT (todas as telas, incl. AI Control Center).',
    isSystem: true
  });
  return roleId;
}

async function main(): Promise<void> {
  const email = (process.argv[2] || 'admin@sicat.local').toLowerCase().trim();
  const password = process.argv[3] || 'Admin@Sicat2026';
  const name = process.argv[4] || 'Administrador SICAT';

  const passwordHash = hashPassword(password);

  let user = await findByEmail(email);
  if (user) {
    await updatePassword({ userId: user.id, passwordHash, passwordExpiresAt: null });
    await query(`update sicat_users set is_active = true, name = coalesce($2, name), updated_at = now() where id = $1`, [user.id, name]);
    user = await findByEmail(email);
  } else {
    user = await insertSicatUser({ id: createPrefixedId('usr'), email, passwordHash, passwordExpiresAt: null, name, isActive: true });
  }
  if (!user) {
    throw new Error('Falha ao criar/atualizar o usuário admin.');
  }

  const roleId = await ensureAdminRoleId();
  await grantAdminAccessRoleToUser({ id: createPrefixedId('aur'), userId: user.id, roleId, assignedByUserId: null, expiresAt: null });

  const verify = await query<{ has_access: boolean }>(
    `select exists(
       select 1 from access_user_roles aur
         join access_roles ar on ar.id = aur.role_id
        where aur.user_id = $1
          and ar.is_active = true
          and (aur.expires_at is null or aur.expires_at > now())
          and lower(ar.role_name) in ('admin.global','admin_global','admin','role_admin_global')
     ) as has_access`,
    [user.id]
  );
  const adminAccess = verify.rows[0]?.has_access === true;

  console.log(JSON.stringify({ ok: true, userId: user.id, email, name, roleId, adminAccess, loginEndpoint: 'POST /v1/sicat/auth/login' }, null, 2));
  console.log(`\n>>> Credenciais de acesso: ${email} / ${password}`);
  if (!adminAccess) {
    console.error('AVISO: vínculo admin não verificado — confira access_user_roles/access_roles.');
    process.exit(2);
  }
  process.exit(0);
}

main().catch((error: unknown) => {
  console.error('ERRO:', error instanceof Error ? error.message : error);
  process.exit(1);
});
