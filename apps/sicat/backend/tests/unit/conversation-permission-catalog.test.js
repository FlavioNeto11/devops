import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  getRequiredPermissionForTool,
  listOrchestratedIntentsWithPermission,
  listRequiredPermissionKeys,
  listSupportedOrchestratedIntents
} from '../../src/services/conversation/conversation-policy-service.js';
import { getConversationToolInventory } from '../../src/services/conversation/tools/tool-registry.js';
import {
  ADMIN_ROLE_NAME_ALIASES,
  CONVERSATION_PERMISSION_CATALOG,
  FLOOR_ROLE_NAME,
  OPERATOR_ROLE_NAME,
  SEEDED_ACCESS_ROLES,
  listCatalogPermissionKeys
} from '../../src/lib/conversation-permission-catalog.js';
import { buildAccessControlSeedStatements } from '../../src/bootstrap/access-control-seed.js';
import {
  FLOOR_ROLE_CONFLICT_SQL,
  FLOOR_ROLE_GRANT_SQL,
  PERMISSION_KEYS_BY_USER_SQL,
  buildHasEffectivePermissionSql
} from '../../src/repositories/access-admin-repo.js';

/** Comentários `--` fora, espaços colapsados, minúsculas — mesma normalização da fase 2. */
function normalizeSql(sql) {
  return String(sql).replace(/--[^\n]*/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * O TESTE MAIS IMPORTANTE DA FASE 4.5.
 *
 * Duas fontes independentes: o que o gate CONSULTA (derivado dos mapas do próprio policy-service) e o
 * que o seed ESCREVE (`CONVERSATION_PERMISSION_CATALOG`). Um lado é função de produção, então isto
 * não é um double concordando consigo mesmo.
 *
 * Comparação nos DOIS sentidos, de propósito: chave exigida que ninguém semeia é quebra silenciosa
 * (a permissão fica insatisfazível por qualquer um); chave semeada que ninguém consulta é ruído que
 * envelhece no banco e engana quem lê a tela de Acessos.
 */
describe('catalogo de permissoes x o que o codigo consulta', () => {
  it('o conjunto exigido pelo policy-service e o catalogo semeado sao IGUAIS (dois sentidos)', () => {
    const required = listRequiredPermissionKeys();
    const seeded = listCatalogPermissionKeys();

    assert.deepEqual(required, seeded);

    // Mensagens dirigidas: quem quebrar isto precisa saber QUAL lado mexer.
    const missingInCatalog = required.filter((key) => !seeded.includes(key));
    const unusedInCode = seeded.filter((key) => !required.includes(key));

    assert.deepEqual(
      missingInCatalog,
      [],
      `chave exigida pelo policy-service e NAO semeada (ninguem consegue te-la): ${missingInCatalog.join(', ')}`
    );
    assert.deepEqual(
      unusedInCode,
      [],
      `chave semeada que nenhuma tool/intent consulta (ruido): ${unusedInCode.join(', ')}`
    );
  });

  it('o catalogo tem exatamente 8 chaves, as do desenho da fase', () => {
    assert.deepEqual(listCatalogPermissionKeys(), [
      'audit.read',
      'manifest.cancel',
      'manifest.create',
      'manifest.print',
      'manifest.read',
      'manifest.receive',
      'manifest.replicate',
      'manifest.submit'
    ]);
  });

  it('cada permission_key segue a convencao ${resource}.${action} de buildPermissionKey', () => {
    for (const entry of CONVERSATION_PERMISSION_CATALOG) {
      assert.equal(
        entry.permissionKey,
        `${entry.resource}.${entry.action}`.toLowerCase(),
        `permission_key '${entry.permissionKey}' nao reproduz resource.action`
      );
    }
  });

  it('NENHUMA tool registrada resolve permissao nula', () => {
    const orphans = getConversationToolInventory()
      .map((item) => item.toolName)
      // `orchestrate_manifest_operation` resolve pelo INTENT — coberto no teste seguinte.
      .filter((toolName) => toolName !== 'orchestrate_manifest_operation')
      .filter((toolName) => getRequiredPermissionForTool(toolName) === null);

    assert.deepEqual(
      orphans,
      [],
      `tool sem permissao exigida (passaria com o gate FECHADO, para qualquer usuario): ${orphans.join(', ')}`
    );
  });

  it('todo intent SUPORTADO tem permissao mapeada, e vice-versa', () => {
    assert.deepEqual(listSupportedOrchestratedIntents(), listOrchestratedIntentsWithPermission());

    for (const intent of listSupportedOrchestratedIntents()) {
      assert.notEqual(
        getRequiredPermissionForTool('orchestrate_manifest_operation', intent),
        null,
        `intent suportado sem permissao exigida: ${intent}`
      );
    }
  });

  it('get_audit_trail exige chave PROPRIA, nao manifest.read', () => {
    // `requiresOperationalAccount` devolve `false` para esta tool: sem chave própria, um estranho
    // auto-cadastrado pelo endpoint publico de registro leria a trilha de auditoria.
    assert.equal(getRequiredPermissionForTool('get_audit_trail'), 'audit.read');
  });

  it('as tools antes orfas passam a exigir manifest.read', () => {
    for (const toolName of ['get_job_status', 'get_dashboard_overview', 'diagnose_operation']) {
      assert.equal(getRequiredPermissionForTool(toolName), 'manifest.read', toolName);
    }
  });
});

describe('papeis semeados', () => {
  it('sicat.reader tem EXATAMENTE manifest.read', () => {
    const reader = SEEDED_ACCESS_ROLES.find((role) => role.roleName === FLOOR_ROLE_NAME);
    assert.ok(reader, 'papel-piso ausente do catalogo');
    // É este teste que impede o seed conceder demais no futuro: o piso é o que QUALQUER pessoa da
    // internet ganha ao se auto-cadastrar.
    assert.deepEqual([...reader.permissionKeys], ['manifest.read']);
  });

  it('sicat.operator tem as 8 chaves do catalogo', () => {
    const operator = SEEDED_ACCESS_ROLES.find((role) => role.roleName === OPERATOR_ROLE_NAME);
    assert.ok(operator, 'papel de operador ausente do catalogo');
    assert.deepEqual([...operator.permissionKeys].sort(), listCatalogPermissionKeys());
  });

  it('o seed NAO cria papel com nome reconhecido como administrador', () => {
    for (const role of SEEDED_ACCESS_ROLES) {
      assert.equal(
        ADMIN_ROLE_NAME_ALIASES.includes(role.roleName.toLowerCase()),
        false,
        `papel '${role.roleName}' colide com alias de administrador — concederia administracao global`
      );
    }
  });

  it('os papeis semeados levam prefixo `sicat.` (o token JWT chumba um `operator` decorativo)', () => {
    for (const role of SEEDED_ACCESS_ROLES) {
      assert.equal(role.roleName.startsWith('sicat.'), true, role.roleName);
    }
  });
});

/**
 * O seed roda contra o banco no boot — aqui afirmamos sobre o SQL que ele REALMENTE emite, sem banco.
 * Cada asserção corresponde a um erro concreto já mapeado no desenho da fase.
 */
describe('forma dos statements do seed', () => {
  const statements = buildAccessControlSeedStatements();
  const allSql = statements.map((statement) => statement.sql).join('\n');

  it('todo insert tem `on conflict` (idempotencia sob api + worker concorrentes)', () => {
    for (const statement of statements) {
      assert.match(statement.sql, /on conflict/i, `statement sem on conflict: ${statement.name}`);
    }
  });

  it('o upsert de permissao usa `do update ... returning id`, nunca `do nothing`', () => {
    const permissionStatements = statements.filter((statement) => statement.name.startsWith('permission:'));
    assert.equal(permissionStatements.length, CONVERSATION_PERMISSION_CATALOG.length);

    for (const statement of permissionStatements) {
      // `on conflict (permission_key) do nothing ... returning id` devolve ZERO linhas na segunda
      // execucao — primeiro boot correto, segundo boot com papel ligado a `undefined`.
      assert.match(statement.sql, /on conflict \(permission_key\) do update/i, statement.name);
      assert.doesNotMatch(statement.sql, /on conflict \(permission_key\) do nothing/i, statement.name);
      assert.match(statement.sql, /returning id/i, statement.name);
    }
  });

  it('nenhuma clausula `do update` toca `is_active` (liga/desliga e do operador)', () => {
    // Recorta, DENTRO de cada statement, só o trecho entre `do update` e o fim/`returning`.
    const doUpdateBlocks = statements
      .map((statement) => {
        const start = statement.sql.toLowerCase().indexOf('do update');
        if (start < 0) return null;
        const tail = statement.sql.slice(start);
        const returningAt = tail.toLowerCase().indexOf('returning');
        return { name: statement.name, block: returningAt < 0 ? tail : tail.slice(0, returningAt) };
      })
      .filter(Boolean);

    assert.ok(doUpdateBlocks.length > 0, 'nenhum `do update` encontrado — o teste perdeu o alvo');

    for (const entry of doUpdateBlocks) {
      assert.doesNotMatch(
        entry.block,
        /is_active/i,
        `${entry.name}: o seed reativaria uma permissao/papel desativado pelo operador a cada boot`
      );
      assert.doesNotMatch(
        entry.block,
        /is_system/i,
        `${entry.name}: o seed reescreveria is_system a cada boot`
      );
    }
  });

  it('o seed NUNCA apaga nem desativa (declara PISO, nao TETO)', () => {
    assert.doesNotMatch(allSql, /\bdelete\b/i, 'delete desfaria o rollback de Nivel 0 no proximo restart');
    assert.doesNotMatch(allSql, /is_active\s*=\s*false/i);
    assert.doesNotMatch(allSql, /\bupdate\s+access_/i, 'update solto sobrescreveria concessao manual');
  });

  it('nenhum `on conflict (id)` — a PK e aleatoria e nao serve de chave de idempotencia', () => {
    assert.doesNotMatch(allSql, /on conflict \(id\)/i);
  });

  /**
   * O que MUDOU e por quê (achado A1 da rodada de revisão).
   *
   * A versão anterior exigia `on conflict (user_id, role_id) do nothing` — e essa exigência ERA o
   * defeito. A unique `(user_id, role_id)` guarda também a linha EXPIRADA: o `not exists` (que só
   * enxerga grant não expirado) dizia "sem permissão", o insert disparava, o `do nothing` engolia, e o
   * piso NUNCA era reconcedido a quem tivesse `sicat.reader` vencido — nem no login, nem no refresh,
   * nem no restart, nem no backfill. Com `enforce`, chat morto para sempre, sem sintoma que aponte
   * para uma data posta meses antes.
   *
   * A INTENÇÃO da regra antiga (não re-expirar um grant deliberadamente temporário) continua sendo
   * exigida — só que por quem realmente a garante: o `where` do conflito. Por isso este teste afirma
   * as DUAS metades e o caso `admin-grant-bootstrap` (que não é o piso) continua com `do nothing`.
   */
  it('o grant do PISO revive grant EXPIRADO (`do update` com `where` restritivo), nunca re-expira o vigente', () => {
    const floorGrants = statements.filter((statement) => statement.name === 'floor-role-backfill');
    assert.equal(floorGrants.length, 1, 'o backfill do piso sumiu do seed');

    for (const statement of floorGrants) {
      const sql = normalizeSql(statement.sql);
      assert.match(sql, /on conflict \(user_id, role_id\) do update/, statement.name);
      assert.match(sql, /set expires_at = null/, statement.name);
      // ⚠️ ESTA é a guarda: sem o `where`, o `do update` viraria o `do update` CEGO de
      // `grantAdminAccessRoleToUser` e limparia a expiração de um grant deliberadamente temporário
      // (terceirizado até 31/12) a cada boot.
      assert.match(
        sql,
        /where access_user_roles\.expires_at is not null and access_user_roles\.expires_at <= now\(\)/,
        `${statement.name}: o \`do update\` do piso deixou de ser restrito ao grant JÁ EXPIRADO`
      );
    }

    // O bootstrap de admin NÃO é o piso: ali `do nothing` é o correto (não se revive grant de
    // administração automaticamente).
    const adminGrant = statements.find((statement) => statement.name === 'admin-grant-bootstrap');
    if (adminGrant) {
      assert.match(normalizeSql(adminGrant.sql), /on conflict \(user_id, role_id\) do nothing/);
    }
  });

  it('o backfill do piso alcanca usuario ATIVO sem nenhuma PERMISSAO EFETIVA (nao "sem papel")', () => {
    const backfill = statements.find((statement) => statement.name === 'floor-role-backfill');
    assert.ok(backfill);
    const sql = normalizeSql(backfill.sql);

    assert.match(sql, /u\.is_active = true/);
    assert.match(sql, /not exists/);
    assert.match(sql, /aur\.expires_at is null or aur\.expires_at > now\(\)/);
    assert.deepEqual(backfill.params, [FLOOR_ROLE_NAME]);

    // ⚠️ Achado A2: condicionar o piso a TER PAPEL fazia um papel VAZIO — que `createAdminAccessRole`
    // cria num POST e a tela concede num clique — SUPRIMIR o piso e deixar a pessoa com conjunto de
    // chaves vazio. O predicado tem de percorrer até `access_permissions`.
    assert.match(
      sql,
      /inner join access_role_permissions arp on arp\.role_id = aur\.role_id/,
      'o predicado do piso voltou a olhar só `access_roles`: papel VAZIO suprime o piso (achado A2)'
    );
    assert.match(sql, /inner join access_permissions ap on ap\.id = arp\.permission_id/);
    assert.match(sql, /ap\.is_active = true/);
  });

  it('o papel de administracao e alcancado por NOME, nunca por id', () => {
    const adminLinks = statements.find((statement) => statement.name === 'admin-role-permissions');
    assert.ok(adminLinks);
    assert.match(adminLinks.sql, /lower\(ar\.role_name\) = any/);
    assert.deepEqual(adminLinks.params[0], [...ADMIN_ROLE_NAME_ALIASES]);
    assert.deepEqual(adminLinks.params[1], listCatalogPermissionKeys());
  });

  it('o bootstrap do papel de admin so dispara quando NAO existe papel de admin algum', () => {
    const bootstrap = statements.find((statement) => statement.name === 'admin-role-bootstrap');
    assert.ok(bootstrap);
    assert.match(bootstrap.sql, /where not exists/i);
    assert.match(bootstrap.sql, /on conflict \(role_name\) do nothing/i);
  });

  /**
   * ORDEM É COMPORTAMENTO, não estética.
   *
   * O backfill do piso (statement 6) pergunta "quem não tem NENHUMA permissão efetiva?". Ele roda na
   * MESMA transação dos vínculos papel→permissão (statements 4 e 5), então só enxerga o que já foi
   * escrito. Movido para ANTES deles, num banco novo a resposta é "TODO MUNDO" — e o `admin.global`
   * recém-adotado ganharia `sicat.reader` de brinde, no boot em que o ambiente nasce.
   */
  it('o backfill do piso roda DEPOIS dos vinculos papel -> permissao', () => {
    const order = statements.map((statement) => statement.name);
    const backfillAt = order.indexOf('floor-role-backfill');
    assert.ok(backfillAt >= 0, 'o backfill do piso sumiu do seed');

    const linkPositions = order
      .map((name, index) => ({ name, index }))
      .filter((entry) => entry.name.startsWith('role-permissions:') || entry.name === 'admin-role-permissions')
      .map((entry) => entry.index);

    assert.ok(linkPositions.length >= 3, 'sumiram statements de vínculo papel → permissão');
    for (const position of linkPositions) {
      assert.ok(
        position < backfillAt,
        `\`${order[position]}\` passou a rodar DEPOIS do backfill: num banco novo o piso enxergaria `
          + '"ninguém tem permissão" e daria `sicat.reader` até para o administrador'
      );
    }

    // E o papel-piso precisa EXISTIR antes de ser concedido.
    assert.ok(order.indexOf(`role:${FLOOR_ROLE_NAME}`) < backfillAt);
  });

  it('as permissoes sao emitidas em ordem alfabetica (evita deadlock api x worker)', () => {
    const emitted = statements
      .filter((statement) => statement.name.startsWith('permission:'))
      .map((statement) => statement.name.replace('permission:', ''));

    assert.deepEqual(emitted, [...emitted].sort());
    assert.deepEqual(emitted, listCatalogPermissionKeys());
  });
});

/**
 * Invariantes do SQL que resolve as permissões do turno. São afirmadas sobre a constante que a função
 * de produção executa — não sobre uma cópia no teste.
 */
describe('SQL de resolucao de permissoes por usuario', () => {
  it('exclui usuario INATIVO', () => {
    // Sem este join, desativar um funcionário NÃO desliga o WhatsApp dele: no canal não há token,
    // a identidade vem do vínculo e a janela seria ilimitada.
    assert.match(PERMISSION_KEYS_BY_USER_SQL, /inner join sicat_users u on u\.id = aur\.user_id and u\.is_active = true/);
  });

  it('exclui grant EXPIRADO, papel inativo e permissao desativada', () => {
    assert.match(PERMISSION_KEYS_BY_USER_SQL, /aur\.expires_at is null or aur\.expires_at > now\(\)/);
    assert.match(PERMISSION_KEYS_BY_USER_SQL, /ar\.is_active = true/);
    assert.match(PERMISSION_KEYS_BY_USER_SQL, /ap\.is_active = true/);
  });
});

describe('SQL do papel-piso concedido na autenticacao', () => {
  const grantSql = normalizeSql(FLOOR_ROLE_GRANT_SQL);

  it('so alcanca usuario ATIVO', () => {
    assert.match(grantSql, /from sicat_users u where u\.id = \$2 and u\.is_active = true/);
  });

  it('so concede a quem tem ZERO CHAVE EFETIVA (papel vazio NAO suprime o piso)', () => {
    // Sem o `not exists`, um admin ganharia `sicat.reader` de brinde a cada login. Com o `not exists`
    // olhando SÓ `access_roles` (a versão anterior), um papel vazio deixava a pessoa com conjunto
    // vazio e chat morto sob `enforce` — achado A2.
    assert.match(grantSql, /not exists/);
    assert.match(grantSql, /ar_existing\.is_active = true/);
    assert.match(grantSql, /aur\.expires_at is null or aur\.expires_at > now\(\)/);
    assert.match(grantSql, /inner join access_role_permissions arp on arp\.role_id = aur\.role_id/);
    assert.match(grantSql, /inner join access_permissions ap on ap\.id = arp\.permission_id/);
    assert.match(grantSql, /ap\.is_active = true/);
  });

  it('REVIVE grant EXPIRADO e preserva expiracao ainda no futuro (achado A1)', () => {
    // Caso real que o `do nothing` trancava para sempre: admin concede `sicat.reader` com validade
    // (campo de data existe no diálogo da tela de Acessos). Na virada da data a pessoa fica com ZERO
    // chaves — e nada repara, porque a linha expirada já ocupa a unique `(user_id, role_id)`.
    assert.match(grantSql, /on conflict \(user_id, role_id\) do update/);
    assert.match(grantSql, /set expires_at = null, assigned_at = now\(\), updated_at = now\(\)/);
    assert.match(
      grantSql,
      /where access_user_roles\.expires_at is not null and access_user_roles\.expires_at <= now\(\)/,
      'o `where` do conflito é o que distingue REVIVER o expirado de RE-EXPIRAR o vigente'
    );
  });

  it('CONTROLE NEGATIVO: sem o `where` do conflito, o teste acima quebra', () => {
    // Prova que a asserção anterior mede a guarda, e não a mera presença de `do update`. A mutação é
    // exatamente o `do update` cego de `grantAdminAccessRoleToUser`, que limparia `expires_at` de um
    // grant temporário legítimo a cada login.
    const blind = normalizeSql(
      FLOOR_ROLE_GRANT_SQL.replace(
        /where access_user_roles\.expires_at is not null[\s\S]*$/,
        ''
      )
    );
    assert.notEqual(blind, grantSql, 'a cláusula alvo do controle mudou de forma — ajuste o controle');
    assert.doesNotMatch(blind, /where access_user_roles\.expires_at is not null/);
    assert.match(blind, /do update/, 'a mutação mantém o `do update` — é por isso que só o `where` prova algo');
  });
});

/**
 * FONTE ÚNICA dos dois sítios do piso.
 *
 * O defeito A1/A2 foi exatamente a DIVERGÊNCIA: o grant do login (`FLOOR_ROLE_GRANT_SQL`) e o backfill
 * do boot (`floor-role-backfill`) repetiam o mesmo predicado escrito duas vezes, e as duas cópias
 * ficaram diferentes. Este teste não afirma que os textos são "parecidos" — afirma que os dois SQL
 * CONTÊM literalmente o que as funções compartilhadas produzem. Reintroduzir uma cópia local em
 * qualquer um dos lados quebra aqui.
 */
describe('piso: os dois sitios usam as MESMAS pecas', () => {
  const statements = buildAccessControlSeedStatements();
  const backfill = statements.find((statement) => statement.name === 'floor-role-backfill');

  it('o grant do login usa o predicado compartilhado, com `$2` como sujeito', () => {
    assert.ok(
      normalizeSql(FLOOR_ROLE_GRANT_SQL).includes(normalizeSql(buildHasEffectivePermissionSql('$2'))),
      'FLOOR_ROLE_GRANT_SQL deixou de usar buildHasEffectivePermissionSql'
    );
  });

  it('o backfill do boot usa o MESMO predicado, com `u.id` como sujeito', () => {
    assert.ok(backfill, 'o backfill do piso sumiu do seed');
    assert.ok(
      normalizeSql(backfill.sql).includes(normalizeSql(buildHasEffectivePermissionSql('u.id'))),
      'o backfill voltou a ter cópia local do predicado — foi assim que os dois sítios divergiram'
    );
  });

  it('os dois usam a MESMA clausula de conflito', () => {
    const conflict = normalizeSql(FLOOR_ROLE_CONFLICT_SQL);
    assert.ok(normalizeSql(FLOOR_ROLE_GRANT_SQL).includes(conflict));
    assert.ok(normalizeSql(backfill.sql).includes(conflict));
  });

  it('o predicado compartilhado e o MESMO caminho de PERMISSION_KEYS_BY_USER_SQL', () => {
    // Se o piso enxergasse um conjunto de chaves diferente do que o gate enxerga, existiria um estado
    // em que o gate vê "vazio" e o piso vê "tem permissão" — o trancamento silencioso da fase.
    const predicate = normalizeSql(buildHasEffectivePermissionSql('$1'));
    const resolution = normalizeSql(PERMISSION_KEYS_BY_USER_SQL);

    for (const clause of [
      'inner join access_role_permissions arp on arp.role_id = aur.role_id',
      'inner join access_permissions ap on ap.id = arp.permission_id',
      'ap.is_active = true',
      'aur.expires_at is null or aur.expires_at > now()'
    ]) {
      assert.ok(predicate.includes(clause), `predicado do piso sem \`${clause}\``);
      assert.ok(resolution.includes(clause), `PERMISSION_KEYS_BY_USER_SQL sem \`${clause}\``);
    }

    assert.ok(predicate.includes('aur.user_id = $1'), 'o predicado do piso não é escopado por usuário');
  });
});

/**
 * m03b — a lista literal de `sicat.operator` é POLÍTICA, não redundância.
 *
 * A mutação que sobreviveu: trocar as 8 strings por `[...ALL_PERMISSION_KEYS]`. Hoje os dois conjuntos
 * são IDÊNTICOS, então nenhum teste de VALOR consegue distingui-los — só um teste sobre a FORMA da
 * declaração. O que a derivação muda é o futuro: a fase 4.6 já prevê `cdf.download`, e com a lista
 * derivada acrescentar essa chave ALARGARIA o operador num commit cujo diff diz apenas "nova
 * permissão". Alargamento de papel tem de ser decisão escrita, revisável no diff.
 *
 * `admin.global` é o único conjunto derivado de propósito (`listAdminRolePermissionKeys`) — e por isso
 * NÃO é alvo desta trava.
 */
describe('papeis semeados — forma da declaracao (m03b)', () => {
  const CATALOG_SOURCE = new URL('../../src/lib/conversation-permission-catalog.ts', import.meta.url);
  let source = '';

  before(() => {
    source = readFileSync(CATALOG_SOURCE, 'utf8');
  });

  /** Entradas do `permissionKeys` do papel indicado, como estão ESCRITAS na fonte. */
  function readDeclaredKeys(text, roleNameConstant) {
    const rolesAt = text.indexOf('export const SEEDED_ACCESS_ROLES');
    assert.ok(rolesAt >= 0, 'SEEDED_ACCESS_ROLES sumiu da fonte');
    const roleAt = text.indexOf(`roleName: ${roleNameConstant}`, rolesAt);
    assert.ok(roleAt >= 0, `papel ${roleNameConstant} sumiu de SEEDED_ACCESS_ROLES`);

    const keysAt = text.indexOf('permissionKeys:', roleAt);
    assert.ok(keysAt >= 0, `papel ${roleNameConstant} sem permissionKeys`);
    const open = text.indexOf('[', keysAt);
    const close = text.indexOf(']', open);
    assert.ok(open >= 0 && close > open, `permissionKeys de ${roleNameConstant} não é literal de array`);

    return text
      .slice(open + 1, close)
      .split(',')
      .map((entry) => entry.replace(/\/\/[^\n]*/g, '').trim())
      .filter((entry) => entry.length > 0);
  }

  function assertLiteralPolicy(text, roleNameConstant) {
    const entries = readDeclaredKeys(text, roleNameConstant);
    assert.ok(entries.length > 0, `${roleNameConstant} sem nenhuma chave declarada`);
    for (const entry of entries) {
      assert.match(
        entry,
        /^'[a-z][a-z.]*'$/,
        `${roleNameConstant}: a chave \`${entry}\` deixou de ser literal. Derivar o conjunto do catálogo `
          + 'faz a próxima permissão nova ALARGAR o papel sem aparecer no diff'
      );
    }
    return entries;
  }

  it('sicat.operator declara as 8 chaves LITERALMENTE (nunca derivadas do catalogo)', () => {
    const entries = assertLiteralPolicy(source, 'OPERATOR_ROLE_NAME');
    assert.deepEqual(
      entries.map((entry) => entry.replace(/'/g, '')).sort(),
      listCatalogPermissionKeys(),
      'o conjunto do operador mudou — se foi de propósito, o diff tem de mostrar chave por chave'
    );
  });

  it('sicat.reader declara `manifest.read` LITERALMENTE (e o piso da internet inteira)', () => {
    assert.deepEqual(assertLiteralPolicy(source, 'FLOOR_ROLE_NAME'), ["'manifest.read'"]);
  });

  it('CONTROLE NEGATIVO: a trava acusa a derivacao do catalogo', () => {
    // A mutação exata: as 8 strings viram um spread do conjunto do catálogo. Valor idêntico hoje,
    // política diferente amanhã.
    const derived = source.replace(
      /permissionKeys: Object\.freeze\(\[\s*'audit\.read',[\s\S]*?'manifest\.submit'\s*\]\)/,
      'permissionKeys: Object.freeze([...ALL_PERMISSION_KEYS])'
    );
    assert.notEqual(derived, source, 'a forma da declaração mudou — ajuste o controle');

    assert.throws(
      () => assertLiteralPolicy(derived, 'OPERATOR_ROLE_NAME'),
      /deixou de ser literal/
    );

    // E a prova de que um teste de VALOR seria cego a esta mutação:
    assert.deepEqual(
      [...CONVERSATION_PERMISSION_CATALOG].map((entry) => entry.permissionKey).sort(),
      listCatalogPermissionKeys(),
      'o conjunto derivado é idêntico ao literal — é por isso que a trava tem de ser sobre a FORMA'
    );
  });
});
