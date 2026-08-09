import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  ADMIN_ROLE_NAME_ALIASES,
  CANONICAL_ADMIN_ROLE_NAME,
  FLOOR_ROLE_NAME
} from '../../src/lib/conversation-permission-catalog.js';
import {
  FLOOR_ROLE_GRANT_SQL,
  PERMISSION_KEYS_BY_USER_SQL,
  buildHasEffectivePermissionSql
} from '../../src/repositories/access-admin-repo.js';
import { evaluateConversationPolicy } from '../../src/services/conversation/conversation-policy-service.js';
import { setConversationPermissionCatalogSnapshotForTests } from '../../src/services/conversation/conversation-permission-catalog-state.js';
import { setConfigOverride } from '../../src/lib/config.js';
import { listCatalogPermissionKeys } from '../../src/lib/conversation-permission-catalog.js';

/**
 * INVARIANTES DE CONTROLE DE ACESSO QUE NENHUM DOUBLE PROVA — fase 4.5.
 *
 * Este arquivo fecha as quatro mutações que sobreviveram ao teste de mutação e que a suíte inteira não
 * enxergava. Todas têm a mesma assinatura: o comportamento observável do módulo continua idêntico, e o
 * que muda é COM QUE DADO o banco é consultado, ou se uma linha existe.
 *
 *  m08a — a consulta de permissão passa a devolver as chaves de TODOS os usuários (o `$n` deixa de ser
 *         comparado ao usuário, ou o array de parâmetros muda de sujeito).
 *  m10  — a administração global passa a depender de `access_permissions`; com o catálogo vazio (que é
 *         o estado REAL do cluster hoje: `access_permissions` com 0 linhas) ninguém mais administra —
 *         some a escada de saída do rollback de Nível 0.
 *  m04  — some `ensureDefaultRoleForUser` de `issueTokenPair`; todo usuário novo nasce trancado.
 *  A4   — some `permissionShortfall` da trilha; a janela `observe` deixa de dizer A QUEM conceder.
 *
 * Por que TESTE DE FONTE. Estes quatro pontos só são observáveis contra um Postgres de verdade (que
 * esta suíte não tem) ou no texto do módulo. O padrão — leitor mínimo de fonte + CONTROLE NEGATIVO
 * que prova que o verificador enxerga — é o mesmo da fase 2
 * (`channel-link-security.test.js` §13/§14), pelo mesmo motivo. Onde dá para ir além do texto, este
 * arquivo vai: a projeção da trilha (A4) é EXECUTADA a partir do trecho de produção extraído da fonte,
 * alimentada com uma decisão real de `evaluateConversationPolicy`.
 */

// ---------------------------------------------------------------------------------------------
// Leitor mínimo de fonte
// ---------------------------------------------------------------------------------------------

/**
 * Remove comentários RESPEITANDO string e template literal. Precisa ser ciente de aspas porque os
 * módulos deste PR têm comentários cheios de crases (`` `manifest.read` ``): um `replace` ingênuo
 * deixaria crases órfãs e desbalancearia toda a varredura seguinte.
 */
function stripComments(source) {
  let out = '';
  let quote = null;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];

    if (quote) {
      out += char;
      if (char === '\\') {
        out += next ?? '';
        index += 1;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === "'" || char === '"' || char === '`') {
      quote = char;
      out += char;
      continue;
    }

    if (char === '/' && next === '/') {
      while (index < source.length && source[index] !== '\n') index += 1;
      out += '\n';
      continue;
    }

    if (char === '/' && next === '*') {
      index += 2;
      while (index < source.length && !(source[index] === '*' && source[index + 1] === '/')) index += 1;
      index += 1;
      out += ' ';
      continue;
    }

    out += char;
  }

  return out;
}

/** Conteúdo do grupo balanceado aberto em `openIndex`, ignorando delimitadores dentro de string. */
function sliceBalanced(text, openIndex) {
  let depth = 0;
  let quote = null;

  for (let index = openIndex; index < text.length; index += 1) {
    const char = text[index];
    if (quote) {
      if (char === '\\') index += 1;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === '"' || char === '`') quote = char;
    else if ('([{'.includes(char)) depth += 1;
    else if (')]}'.includes(char)) {
      depth -= 1;
      if (depth === 0) return text.slice(openIndex + 1, index);
    }
  }

  assert.fail(`grupo iniciado em ${openIndex} não fecha`);
  return '';
}

/** Divide por vírgulas de PRIMEIRO nível: `[...ADMIN_ROLE_NAME_ALIASES]` continua sendo uma entrada. */
function splitTopLevelCommas(text) {
  const parts = [];
  let depth = 0;
  let quote = null;
  let current = '';

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quote) {
      current += char;
      if (char === '\\') {
        current += text[index + 1] ?? '';
        index += 1;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === "'" || char === '"' || char === '`') quote = char;
    else if ('([{'.includes(char)) depth += 1;
    else if (')]}'.includes(char)) depth -= 1;
    else if (char === ',' && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += char;
  }

  parts.push(current);
  return parts.map((part) => part.replace(/\s+/g, ' ').trim()).filter((part) => part.length > 0);
}

/** Corpo de uma função (com ou sem `export`/`async`), do `{` do corpo ao `}` que o fecha. */
function functionBody(source, name) {
  const header = new RegExp(`(?:^|\\n)(?:export\\s+)?(?:async\\s+)?function\\s+${name}\\s*\\(`);
  const found = header.exec(source);
  assert.ok(found, `função ${name} não existe mais na fonte`);

  let index = source.indexOf('(', found.index);
  let depth = 0;
  let quote = null;
  for (; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (char === '\\') index += 1;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === '"' || char === '`') quote = char;
    else if (char === '(') depth += 1;
    else if (char === ')') {
      depth -= 1;
      if (depth === 0) break;
    }
  }

  const braceAt = source.indexOf('{', index);
  assert.ok(braceAt > index, `corpo de ${name} não encontrado`);
  return sliceBalanced(source, braceAt);
}

function normalizeSql(sql) {
  return String(sql).replace(/--[^\n]*/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Toda chamada `query(...)` / `client.query(...)` do corpo, já dividida em argumentos. */
function queryCallsIn(body) {
  const calls = [];
  const pattern = /(?:client\.)?query\s*(?:<[^<>()]*>)?\s*\(/g;
  let found = pattern.exec(body);

  while (found) {
    const openAt = found.index + found[0].length - 1;
    calls.push(splitTopLevelCommas(sliceBalanced(body, openAt)));
    found = pattern.exec(body);
  }

  return calls;
}

// ---------------------------------------------------------------------------------------------
// m08a — alinhamento placeholder ↔ parâmetro em TODA consulta escopada por usuário
// ---------------------------------------------------------------------------------------------

/**
 * MESMA CLASSE que sobreviveu na fase 2, no repositório de acesso desta vez.
 *
 * Duas mutações independentes, ambas invisíveis para qualquer double:
 *   (i)  neutralizar o predicado no TEXTO (`where aur.user_id = $1` -> `where ($1::text is not null)`,
 *        ou um ` or true` colado no fim) — a consulta devolve as chaves de TODOS os usuários;
 *   (ii) trocar/inverter o ARRAY de parâmetros (`[userId]` -> `[roleId]`, `[userId, roleId]` ->
 *        `[roleId, userId]`) — o texto do statement continua idêntico e o sujeito muda.
 *
 * O teste comportamental é cego às duas: o double decide o escopo em JavaScript e concorda consigo
 * mesmo. O congelamento do `where` mata (i); a amarração coluna↔parâmetro mata (ii). Ambos precisam
 * existir — nenhum dos dois sozinho fecha a classe.
 *
 * A prova definitiva continua sendo integração contra Postgres (dívida A5, registrada no runbook).
 */
describe('access-admin-repo — escopo por usuário: placeholder ↔ parâmetro', () => {
  const REPO = new URL('../../src/repositories/access-admin-repo.ts', import.meta.url);
  let source = '';

  before(() => {
    source = stripComments(readFileSync(REPO, 'utf8'));
  });

  /** SQLs que a fonte referencia por IDENTIFICADOR — resolvidos pelo valor REAL exportado. */
  const SQL_CONSTANTS = {
    PERMISSION_KEYS_BY_USER_SQL,
    FLOOR_ROLE_GRANT_SQL
  };

  function resolveSql(arg) {
    const text = arg.trim();
    if (text.startsWith('`')) return normalizeSql(text.slice(1, -1));
    assert.ok(
      Object.prototype.hasOwnProperty.call(SQL_CONSTANTS, text),
      `statement referenciado por identificador desconhecido: ${text}`
    );
    return normalizeSql(SQL_CONSTANTS[text]);
  }

  function resolveParams(arg) {
    const text = (arg ?? '').trim();
    assert.ok(text.startsWith('['), `array de parâmetros ausente: ${text}`);
    return splitTopLevelCommas(sliceBalanced(text, 0));
  }

  function callAt(text, fnName, position) {
    const calls = queryCallsIn(functionBody(text, fnName));
    assert.ok(calls[position], `${fnName} não tem a consulta #${position + 1}`);
    return {
      sql: resolveSql(calls[position][0]),
      params: resolveParams(calls[position][1])
    };
  }

  /** Posição do `$n` comparado a uma coluna. Aceita `col = $n` e `col = any($n::...)`. */
  function placeholderOf(sql, column) {
    const escaped = column.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const direct = new RegExp(`(?:^|[\\s(])${escaped}\\s*(?:=|<>)\\s*\\$(\\d+)`).exec(sql);
    if (direct) return Number(direct[1]);

    const viaAny = new RegExp(`(?:^|[\\s(])${escaped}\\s*=\\s*any\\s*\\(\\s*\\$(\\d+)`).exec(sql);
    assert.ok(viaAny, `não achei a comparação de \`${column}\` no statement: ${sql}`);
    return Number(viaAny[1]);
  }

  /**
   * Toda consulta de `access-admin-repo` escopada por identidade. `params` congela o array LITERAL
   * (pega a troca); `bindings` amarra cada coluna ao parâmetro (pega a INVERSÃO, que mantém o array).
   */
  const SCOPED_STATEMENTS = [
    {
      fn: 'hasAdminGlobalAccessByUserId',
      call: 0,
      params: ['userId', '[...ADMIN_ROLE_NAME_ALIASES]'],
      bindings: { 'aur.user_id': 'userId', 'lower(ar.role_name)': '[...ADMIN_ROLE_NAME_ALIASES]' }
    },
    {
      fn: 'ensureFloorRoleForUser',
      call: 0,
      params: ['FLOOR_ROLE_GRANT_SQL'].slice(0, 0).concat(['input.grantId', 'input.userId', 'input.roleName']),
      // `$2` aparece em TRÊS lugares do statement do piso (o `exists` de usuário ativo, o predicado de
      // permissão efetiva e o `select` do insert). Se algum deles trocasse de placeholder, o piso
      // passaria a ser decidido olhando outra pessoa.
      bindings: { 'u.id': 'input.userId', 'aur.user_id': 'input.userId', 'ar.role_name': 'input.roleName' }
    },
    {
      fn: 'listPermissionKeysByUserId',
      call: 0,
      params: ['userId'],
      bindings: { 'aur.user_id': 'userId' }
    },
    {
      fn: 'getAdminAccessUserById',
      call: 0,
      params: ['userId'],
      bindings: { 'u.id': 'userId' }
    },
    {
      fn: 'getAdminAccessUserById',
      call: 1,
      params: ['userId'],
      bindings: { 'aur.user_id': 'userId' }
    },
    {
      fn: 'findAdminAccessUserLightById',
      call: 0,
      params: ['userId'],
      bindings: { 'u.id': 'userId' }
    },
    {
      fn: 'revokeAdminAccessRoleFromUser',
      call: 0,
      params: ['userId', 'roleId'],
      // Invertidos, o delete não encontra linha nenhuma — e a revogação vira no-op SILENCIOSO
      // (`removed: false` não é lido por ninguém como erro).
      bindings: { user_id: 'userId', role_id: 'roleId' }
    },
    {
      fn: 'findAdminAccessRoleById',
      call: 0,
      params: ['roleId'],
      bindings: { 'ar.id': 'roleId' }
    },
    {
      fn: 'findAdminAccessRoleDetailsById',
      call: 0,
      params: ['roleId'],
      bindings: { 'ar.id': 'roleId' }
    },
    {
      fn: 'findAdminAccessRoleDetailsById',
      call: 1,
      params: ['roleId'],
      bindings: { 'arp.role_id': 'roleId' }
    },
    {
      fn: 'findAdminAccessPermissionById',
      call: 0,
      params: ['permissionId'],
      bindings: { 'ap.id': 'permissionId' }
    },
    {
      fn: 'deactivateAdminAccessPermissionById',
      call: 0,
      params: ['permissionId'],
      bindings: { id: 'permissionId' }
    },
    {
      fn: 'deactivateAdminAccessRoleById',
      call: 0,
      params: ['roleId'],
      bindings: { id: 'roleId' }
    }
  ];

  function assertAlignment(text, spec) {
    const { sql, params } = callAt(text, spec.fn, spec.call);

    assert.deepEqual(
      params,
      spec.params,
      `${spec.fn}#${spec.call}: o array de parâmetros mudou. Trocar uma entrada aqui não altera nenhuma `
        + 'cláusula do statement — nenhum double consegue enxergar essa mudança'
    );

    for (const [column, expected] of Object.entries(spec.bindings)) {
      const position = placeholderOf(sql, column);
      assert.equal(
        params[position - 1],
        expected,
        `${spec.fn}#${spec.call}: a coluna \`${column}\` está comparada com $${position}, que recebe `
          + `\`${params[position - 1]}\` — deveria receber \`${expected}\``
      );
    }
  }

  it('CONTROLE NEGATIVO: o verificador acusa troca E inversão de parâmetro', () => {
    const spec = SCOPED_STATEMENTS.find((entry) => entry.fn === 'revokeAdminAccessRoleFromUser');

    const swapped = source.replace('[userId, roleId]', '[roleId, userId]');
    assert.notEqual(swapped, source, 'a forma do array mudou — ajuste o controle');
    assert.throws(() => assertAlignment(swapped, spec), /o array de parâmetros mudou/);
    // Congelar só o array seria pouco: a inversão também tem de ser vista pela amarração coluna↔$n.
    assert.throws(
      () => assertAlignment(swapped, { ...spec, params: ['roleId', 'userId'] }),
      /a coluna `user_id` está comparada com \$1/
    );

    // E a troca do SUJEITO da consulta de permissões — a mutação m08a exata.
    const hijacked = source.replace(
      'PERMISSION_KEYS_BY_USER_SQL,\n    [userId]',
      'PERMISSION_KEYS_BY_USER_SQL,\n    [roleId]'
    );
    assert.notEqual(hijacked, source, 'a forma da chamada mudou — ajuste o controle');
    assert.throws(
      () => assertAlignment(hijacked, SCOPED_STATEMENTS.find((entry) => entry.fn === 'listPermissionKeysByUserId')),
      /o array de parâmetros mudou/
    );

    assert.throws(() => functionBody(source, 'funcaoQueNaoExiste'), /não existe mais/);
  });

  it('toda consulta escopada amarra `$n` ao parâmetro certo', () => {
    for (const spec of SCOPED_STATEMENTS) {
      assertAlignment(source, spec);
    }
  });

  /**
   * Congelamento do `where` das DUAS consultas que decidem permissão. O `where` é comparado INTEIRO
   * porque `includes` por cláusula é cego a NEUTRALIZAÇÃO: `and aur.user_id = $1 or true` mantém o
   * literal procurado e desliga a guarda.
   */
  it('o `where` de PERMISSION_KEYS_BY_USER_SQL está congelado (deleção E neutralização)', () => {
    const sql = normalizeSql(PERMISSION_KEYS_BY_USER_SQL);
    const at = sql.indexOf(' where ');
    assert.ok(at >= 0);

    assert.equal(
      sql.slice(at + ' where '.length).trim(),
      'aur.user_id = $1 and ap.is_active = true and ar.is_active = true '
        + 'and (aur.expires_at is null or aur.expires_at > now())',
      'o `where` que escopa as permissões do turno mudou. Qualquer ADIÇÃO (inclusive um ` or true`) '
        + 'faz a consulta devolver as chaves de OUTROS usuários — é a mutação m08a'
    );

    // O escopo por usuário tem DUAS metades: o `where` e o join que exclui usuário desativado.
    assert.ok(
      sql.includes('inner join sicat_users u on u.id = aur.user_id and u.is_active = true'),
      'sem este join, desativar um funcionário não desliga o WhatsApp dele (não há token no canal)'
    );
  });

  /**
   * Congelamento da CADEIA DE JOINS — o buraco que sobreviveu ao teste de mutação da fase 4.5
   * (sondas X5 e X6, reproduzidas em duas execuções independentes).
   *
   * O `where` já estava congelado, mas a mutação `on ar.id = aur.role_id` -> `on true` mora no JOIN,
   * fora dele. Com `on true` o join vira produto cartesiano: `ar.is_active = true` no `where` continua
   * satisfeito por QUALQUER papel ativo do sistema, e o usuário passa a herdar as permissões de todos
   * eles. É a mesma classe da m08a — a consulta devolvendo o que não é do sujeito — só que pela outra
   * metade da instrução.
   *
   * Congelamos o trecho INTEIRO entre `from` e `where`, pela mesma razão que o `where`: `includes` por
   * cláusula é cego a neutralização.
   */
  it('a cadeia de JOINS de PERMISSION_KEYS_BY_USER_SQL está congelada (X5)', () => {
    const sql = normalizeSql(PERMISSION_KEYS_BY_USER_SQL);
    const from = sql.indexOf('from access_user_roles aur');
    const where = sql.indexOf(' where ');
    assert.ok(from >= 0 && where > from, 'a forma da consulta mudou — ajuste o congelamento');

    assert.equal(
      sql.slice(from + 'from access_user_roles aur'.length, where).trim(),
      'inner join sicat_users u on u.id = aur.user_id and u.is_active = true '
        + 'inner join access_role_permissions arp on arp.role_id = aur.role_id '
        + 'inner join access_permissions ap on ap.id = arp.permission_id '
        + 'inner join access_roles ar on ar.id = aur.role_id',
      'a cadeia de joins mudou. Trocar qualquer `on <coluna> = <coluna>` por `on true` faz o join virar '
        + 'produto cartesiano, e o usuário herda as permissões de TODOS os papéis ativos'
    );
  });

  it('a cadeia de JOINS do predicado do piso está congelada (X6)', () => {
    // `buildHasEffectivePermissionSql` decide se o usuário JÁ tem permissão efetiva — é o que diz se o
    // papel-piso deve ou não ser concedido. Com `on true` ele passa a enxergar permissão que o usuário
    // não tem, e o piso deixa de ser concedido a quem precisa: trancamento silencioso.
    const sql = normalizeSql(buildHasEffectivePermissionSql('$1'));
    const from = sql.indexOf('from access_user_roles aur');
    const where = sql.indexOf(' where ');
    assert.ok(from >= 0 && where > from, 'a forma do predicado mudou — ajuste o congelamento');

    assert.equal(
      sql.slice(from + 'from access_user_roles aur'.length, where).trim(),
      'inner join access_roles ar_existing on ar_existing.id = aur.role_id '
        + 'inner join access_role_permissions arp on arp.role_id = aur.role_id '
        + 'inner join access_permissions ap on ap.id = arp.permission_id',
      'a cadeia de joins do predicado do piso mudou — ver a nota do caso anterior'
    );
  });

  it('CONTROLE NEGATIVO: o congelamento de JOIN acusa o `on true` que o `includes` deixaria passar', () => {
    // Prova que o congelamento enxerga a mutação exata das sondas X5/X6, e que a busca por substring
    // (o reflexo natural de quem for escrever este teste depois) NÃO enxergaria.
    const mutado = normalizeSql(
      PERMISSION_KEYS_BY_USER_SQL.replace('inner join access_roles ar on ar.id = aur.role_id', 'inner join access_roles ar on true')
    );

    assert.ok(
      mutado.includes('inner join access_roles ar'),
      'o `includes` da tabela continua satisfeito — é exatamente a cegueira que o congelamento cobre'
    );
    assert.ok(
      mutado.includes('ar.is_active = true'),
      'o `where` também continua satisfeito: a guarda de papel ativo sobrevive à mutação e não a denuncia'
    );

    const from = mutado.indexOf('from access_user_roles aur');
    const where = mutado.indexOf(' where ');
    assert.notEqual(
      mutado.slice(from + 'from access_user_roles aur'.length, where).trim(),
      'inner join sicat_users u on u.id = aur.user_id and u.is_active = true '
        + 'inner join access_role_permissions arp on arp.role_id = aur.role_id '
        + 'inner join access_permissions ap on ap.id = arp.permission_id '
        + 'inner join access_roles ar on ar.id = aur.role_id'
    );
  });

  it('CONTROLE NEGATIVO: o congelamento acusa o ` or true` que o `includes` deixaria passar', () => {
    const neutralized = normalizeSql(`${PERMISSION_KEYS_BY_USER_SQL} or true`);
    const at = neutralized.indexOf(' where ');
    const where = neutralized.slice(at + ' where '.length).trim();

    assert.ok(
      where.includes('aur.user_id = $1'),
      'o `includes` por cláusula continua satisfeito — é exatamente a cegueira que o congelamento cobre'
    );
    assert.notEqual(
      where,
      'aur.user_id = $1 and ap.is_active = true and ar.is_active = true '
        + 'and (aur.expires_at is null or aur.expires_at > now())'
    );
  });

  /**
   * Filtros DINÂMICOS (`buildUserFilters`, `listAdminAccessSessions`) montam o `$n` a partir de
   * `params.length`. Não dá para congelar o texto — mas dá para congelar o IDIOMA que mantém os dois
   * lados alinhados: todo `where` dinâmico usa `$${params.length}` e vem DEPOIS de um `params.push`.
   * Escrever `$1` na mão num filtro opcional é o jeito de desalinhar tudo silenciosamente.
   */
  it('filtros dinâmicos derivam o `$n` de `params.length`, nunca de número escrito à mão', () => {
    for (const fnName of ['buildUserFilters', 'listAdminAccessSessions']) {
      const body = functionBody(source, fnName);
      const pushes = body.match(/where\.push\(([\s\S]*?)\);/g) || [];
      assert.ok(pushes.length > 0, `${fnName} não tem mais filtro dinâmico`);

      for (const push of pushes) {
        if (!push.includes('$')) continue;
        assert.ok(
          push.includes('${params.length}'),
          `${fnName}: filtro com placeholder escrito à mão — \`${push.replace(/\s+/g, ' ').trim()}\``
        );
      }

      // Um `where.push` com `$n` sem o `params.push` que o alimenta desalinha TUDO o que vem depois:
      // cada filtro seguinte passa a ler o valor do anterior.
      const dynamicWheres = pushes.filter((push) => push.includes('$'));
      const parameterPushes = (body.match(/params\.push\(/g) || []).length;
      assert.equal(
        dynamicWheres.length,
        parameterPushes,
        `${fnName}: ${dynamicWheres.length} filtro(s) com placeholder para ${parameterPushes} `
          + 'parâmetro(s) empilhado(s) — os dois lados saíram de passo'
      );
    }
  });

  /**
   * `replaceAdminAccessRolePermissions` é a única função que APAGA vínculo papel→permissão — é a
   * alavanca que estreita (ou alarga) um papel. Um desalinhamento aqui não dá erro: o `delete`
   * apagaria o papel ERRADO e os inserts criariam vínculos cruzados, tudo com 200 na API.
   *
   * O `$1` da consulta de validação recebe `input.roleId` e NÃO é usado por ela (os placeholders das
   * permissões começam em `$2`). Funciona, mas é um convite a "limpar" o parâmetro sem renumerar os
   * outros — por isso a forma fica congelada aqui.
   */
  it('replaceAdminAccessRolePermissions: delete e inserts amarrados ao papel certo', () => {
    const calls = queryCallsIn(functionBody(source, 'replaceAdminAccessRolePermissions'));
    assert.equal(calls.length, 3, 'a função mudou de forma — reveja antes de atualizar a expectativa');

    const [validation, remove, insert] = calls;

    // 1. Validação das permissões: `$1` é o papel (não usado no where), permissões a partir de `$2`.
    assert.deepEqual(resolveParams(validation[1]), ['input.roleId', '...permissionIds']);
    assert.ok(
      resolveSql(validation[0]).includes('id in (${placeholders})'),
      'a validação deixou de checar a lista de permissões antes de apagar o que existe'
    );

    // 2. O delete é escopado pelo PAPEL, e o parâmetro é o papel.
    assert.equal(normalizeSql(remove[0].trim().slice(1, -1)), 'delete from access_role_permissions where role_id = $1');
    assert.deepEqual(resolveParams(remove[1]), ['input.roleId']);

    // 3. O insert alinha coluna a coluna. `role_id` recebendo `permissionId` (ou vice-versa) cria
    //    vínculo cruzado: um papel ganharia permissões de outro, sem erro nenhum.
    const insertSql = resolveSql(insert[0]);
    const insertParams = resolveParams(insert[1]);
    const columns = splitTopLevelCommas(sliceBalanced(insertSql, insertSql.indexOf('(')));
    const values = splitTopLevelCommas(sliceBalanced(insertSql, insertSql.indexOf('(', insertSql.indexOf(' values '))));

    assert.equal(columns.length, values.length);
    assert.deepEqual(
      Object.fromEntries(
        columns.map((column, index) => [
          column,
          values[index].replace(/\$(\d+)/g, (match, position) => `{${insertParams[Number(position) - 1]}}`)
        ])
      ),
      {
        id: '{input.createId()}',
        role_id: '{input.roleId}',
        permission_id: '{permissionId}',
        granted_at: 'now()',
        granted_by_user_id: '{input.grantedByUserId || null}',
        created_at: 'now()',
        updated_at: 'now()'
      }
    );
  });

  it('o insert de grant de papel alinha coluna a coluna', () => {
    // Insert desalinhado é pior que `where` errado: o banco aceita (as colunas são `text`) e grava o
    // valor certo na coluna errada — `user_id` recebendo o `role_id` cria grant para dono inexistente.
    const { sql, params } = callAt(source, 'grantAdminAccessRoleToUser', 0);
    const columns = splitTopLevelCommas(sliceBalanced(sql, sql.indexOf('(')));
    const values = splitTopLevelCommas(sliceBalanced(sql, sql.indexOf('(', sql.indexOf(' values '))));

    assert.equal(columns.length, values.length, 'o insert de grant está desalinhado');

    const resolved = Object.fromEntries(
      columns.map((column, index) => [
        column,
        values[index].replace(/\$(\d+)/g, (match, position) => {
          const param = params[Number(position) - 1];
          assert.ok(param !== undefined, `placeholder ${match} sem parâmetro`);
          return `{${param}}`;
        })
      ])
    );

    assert.deepEqual(resolved, {
      id: '{input.id}',
      user_id: '{input.userId}',
      role_id: '{input.roleId}',
      assigned_at: 'now()',
      assigned_by_user_id: '{input.assignedByUserId || null}',
      // ⚠️ É este campo que o `do update` CEGO desta função reescreve — e é por isso que o piso
      // (`FLOOR_ROLE_GRANT_SQL`) NÃO pode reusá-la: reconceder o piso a cada login re-expiraria um
      // grant deliberadamente temporário.
      expires_at: '{input.expiresAt || null}',
      created_at: 'now()',
      updated_at: 'now()'
    });
  });
});

// ---------------------------------------------------------------------------------------------
// m10 — a administração global é decidida por NOME DE PAPEL, de propósito
// ---------------------------------------------------------------------------------------------

/**
 * INVARIANTE DE ROLLBACK. `hasAdminGlobalAccessByUserId` e `ensureAdminAuthorization` NÃO podem ler
 * `access_permissions`.
 *
 * É isso que faz a tela de Acessos sobreviver ao fechamento do gate conversacional: com o chat
 * trancado — ou com o catálogo VAZIO, que é o estado real do cluster hoje (`access_permissions` com 0
 * linhas) — os administradores continuam podendo CONCEDER papel, que é o rollback de Nível 0
 * (segundos, sem deploy, sem kubectl, sem SQL). No dia em que a API administrativa virar gated por
 * PERMISSÃO, o rollback deixa de existir: para destravar alguém seria preciso já estar destravado.
 */
describe('administração global decide por NOME de papel, nunca por permissão', () => {
  const REPO = new URL('../../src/repositories/access-admin-repo.ts', import.meta.url);
  const SERVICE = new URL('../../src/services/access-admin-service.ts', import.meta.url);

  let repoSource = '';
  let serviceSource = '';

  before(() => {
    repoSource = stripComments(readFileSync(REPO, 'utf8'));
    serviceSource = stripComments(readFileSync(SERVICE, 'utf8'));
  });

  function adminGateSql(text) {
    const calls = queryCallsIn(functionBody(text, 'hasAdminGlobalAccessByUserId'));
    assert.ok(calls[0], 'hasAdminGlobalAccessByUserId não consulta mais o banco');
    const raw = calls[0][0].trim();
    assert.ok(raw.startsWith('`'), 'o statement do gate admin deixou de ser literal');
    return normalizeSql(raw.slice(1, -1));
  }

  function assertNoPermissionTables(sql) {
    for (const table of ['access_permissions', 'access_role_permissions', 'permission_key']) {
      assert.ok(
        !sql.includes(table),
        `o gate de administração passou a ler \`${table}\`. Com o catálogo vazio ou quebrado ninguém `
          + 'administra — e o rollback de Nível 0 (conceder papel) deixa de ser alcançável'
      );
    }
  }

  it('o SQL do gate admin toca APENAS access_user_roles × access_roles', () => {
    const sql = adminGateSql(repoSource);
    assertNoPermissionTables(sql);
    assert.ok(sql.includes('from access_user_roles aur'));
    assert.ok(sql.includes('inner join access_roles ar on ar.id = aur.role_id'));
    assert.ok(sql.includes('lower(ar.role_name) = any($2::text[])'), 'o gate deixou de decidir por NOME');
  });

  it('o gate admin ignora papel inativo e grant expirado — mas não permissão', () => {
    const sql = adminGateSql(repoSource);
    assert.ok(sql.includes('ar.is_active = true'));
    assert.ok(sql.includes('(aur.expires_at is null or aur.expires_at > now())'));
  });

  it('o nome canônico está entre os aliases reconhecidos (senão o papel semeado não administra nada)', () => {
    assert.ok(
      ADMIN_ROLE_NAME_ALIASES.includes(CANONICAL_ADMIN_ROLE_NAME),
      'o papel que o seed cria em banco novo deixou de ser reconhecido pelo gate — deadlock de bootstrap'
    );
    // E o piso JAMAIS pode virar alias de administrador: ele é o que o auto-cadastro público concede.
    assert.equal(ADMIN_ROLE_NAME_ALIASES.includes(FLOOR_ROLE_NAME.toLowerCase()), false);
  });

  it('ensureAdminAuthorization não consulta permissão nenhuma', () => {
    const body = functionBody(serviceSource, 'ensureAdminAuthorization')
      + functionBody(serviceSource, 'resolveAdminAccessSummary')
      + functionBody(serviceSource, 'hasAdminRoleInToken');

    for (const forbidden of ['listPermissionKeysByUserId', 'access_permissions', 'hasConversationPermission']) {
      assert.ok(
        !body.includes(forbidden),
        `o gate administrativo passou a depender de \`${forbidden}\` — perde-se a escada de saída`
      );
    }

    assert.ok(body.includes('hasAdminGlobalAccessByUserId'), 'o gate deixou de consultar o papel no banco');
  });

  it('CONTROLE NEGATIVO: a trava acusa o gate admin passando a ler o catálogo', () => {
    const gated = repoSource.replace(
      'inner join access_roles ar on ar.id = aur.role_id',
      'inner join access_roles ar on ar.id = aur.role_id\n       inner join access_role_permissions arp on arp.role_id = ar.id'
    );
    assert.notEqual(gated, repoSource, 'a forma do join mudou — ajuste o controle');
    assert.throws(() => assertNoPermissionTables(adminGateSql(gated)), /passou a ler `access_role_permissions`/);
  });
});

// ---------------------------------------------------------------------------------------------
// m04 — o papel-piso é concedido no funil ÚNICO de autenticação
// ---------------------------------------------------------------------------------------------

/**
 * A mutação: apagar `await ensureDefaultRoleForUser(user.id)` de `issueTokenPair`. Nenhum teste
 * quebrava, e é o ÚNICO fio que impede o usuário auto-cadastrado (`POST /v1/sicat/auth/register`, sem
 * middleware de auth — DL-043) de nascer sem nenhuma chave e com o chat morto desde o primeiro minuto.
 *
 * Não há como exercitar isto sem Postgres: os quatro fluxos leem o banco ANTES de chegar a
 * `issueTokenPair` (`findByEmail`, `findByRefreshTokenHash`, `findById`), então a chamada nunca é
 * alcançada numa suíte sem banco. O que este teste congela é a estrutura do funil — e, por ser um
 * FUNIL, congelar a estrutura é congelar a cobertura: a garantia vale para os quatro fluxos de uma vez.
 */
describe('papel-piso no funil de autenticação (m04)', () => {
  const AUTH = new URL('../../src/services/sicat-auth-service.ts', import.meta.url);
  let source = '';

  before(() => {
    source = stripComments(readFileSync(AUTH, 'utf8'));
  });

  function assertFloorRoleGrantedOnTokenIssue(text) {
    const body = functionBody(text, 'issueTokenPair');
    assert.ok(
      /await\s+ensureDefaultRoleForUser\s*\(\s*user\.id\s*\)/.test(body),
      'issueTokenPair deixou de conceder o papel-piso. Todo usuário novo passa a nascer sem nenhuma '
        + 'chave: sob `enforce`, chat morto desde o primeiro login, sem sintoma que aponte para aqui'
    );

    // Ordem: o grant vem ANTES de emitir o token. Emitir primeiro e conceder depois deixaria uma
    // janela em que o turno seguinte ao login roda com conjunto vazio.
    const grantAt = body.search(/await\s+ensureDefaultRoleForUser\s*\(/);
    const tokenAt = body.indexOf('createAccessToken');
    assert.ok(tokenAt > grantAt, 'o papel-piso passou a ser concedido DEPOIS de emitir o token');
  }

  it('issueTokenPair concede o papel-piso antes de emitir o token', () => {
    assertFloorRoleGrantedOnTokenIssue(source);
  });

  it('os QUATRO fluxos que emitem sessão passam por issueTokenPair', () => {
    // Se um fluxo novo emitisse token por fora, o funil deixaria de ser único e o piso viraria
    // opcional — sem que o teste acima percebesse.
    for (const flow of ['loginSicat', 'registerSicat', 'refreshSicatSession', 'loginSicatViaKeycloak']) {
      assert.ok(
        functionBody(source, flow).includes('issueTokenPair('),
        `${flow} emite sessão sem passar pelo funil que concede o papel-piso`
      );
    }

    // E nenhum outro sítio cria token de acesso por fora do funil.
    assert.equal(
      (source.match(/createAccessToken\(/g) || []).length,
      1,
      'apareceu um segundo sítio emitindo access token — o funil deixou de ser único'
    );
  });

  it('o grant usa o papel-PISO e o usuário do funil, pelo seam injetável', () => {
    const body = functionBody(source, 'ensureDefaultRoleForUser');
    assert.ok(body.includes('accessControlDependencies.ensureFloorRoleForUser'));
    assert.ok(/userId,?/.test(body), 'o grant deixou de usar o userId recebido');
    assert.ok(body.includes('roleName: FLOOR_ROLE_NAME'), 'o grant deixou de conceder o papel-PISO');

    // Best-effort DE PROPÓSITO: falhar o grant deixa a pessoa com ZERO chaves, o que sob o gate
    // fechado é fail-CLOSED. Um `throw` aqui derrubaria o login inteiro por causa do RBAC.
    assert.ok(body.includes('catch'), 'o grant do piso deixou de ser best-effort — falha nele derruba o login');
  });

  it('CONTROLE NEGATIVO: apagar a chamada de issueTokenPair quebra a trava', () => {
    const mutated = source.replace(/await\s+ensureDefaultRoleForUser\(user\.id\);\s*/, '');
    assert.notEqual(mutated, source, 'a forma da chamada mudou — ajuste o controle');
    assert.throws(
      () => assertFloorRoleGrantedOnTokenIssue(mutated),
      /issueTokenPair deixou de conceder o papel-piso/
    );
  });
});

// ---------------------------------------------------------------------------------------------
// A4 — `permissionShortfall` chega à trilha persistida
// ---------------------------------------------------------------------------------------------

/**
 * A métrica `sicat_conversation_permission_decision_total` não tem — e não pode ter — label `userId`
 * (cardinalidade + PII). Logo `would_deny{permission="manifest.submit"} 47` diz QUANTAS vezes e nunca
 * A QUEM conceder `sicat.operator`, que é o passo "CONCEDER ANTES DE NEGAR" do runbook e o
 * pré-requisito do flip. A trilha (`conversation_action_logs`, que já grava `userId`) é a ÚNICA
 * superfície que cruza a lacuna com a pessoa — e no canal WhatsApp é a única que existe, porque lá o
 * objeto de resposta é consumido pelo composer e descartado dentro do processo.
 *
 * Este caso não se contenta em ler o texto: ele EXECUTA a projeção `policy` do builder de produção,
 * extraída da fonte, alimentada com uma decisão real de `evaluateConversationPolicy` em modo `observe`.
 */
describe('trilha do turno carrega a lacuna de permissão (A4)', () => {
  const SERVICE = new URL('../../src/services/conversation/conversation-service.ts', import.meta.url);
  let source = '';

  before(() => {
    source = stripComments(readFileSync(SERVICE, 'utf8'));
  });

  /** Trecho `policy: input.policy ? { … } : null` do builder, como projeção EXECUTÁVEL. */
  function buildPolicyProjection(text) {
    const body = functionBody(text, 'buildConversationTracePayload');
    const at = body.indexOf('policy: input.policy');
    assert.ok(at >= 0, 'o builder da trilha não projeta mais o bloco `policy`');
    const open = body.indexOf('{', at);
    assert.ok(open > at, 'o bloco `policy` do builder mudou de forma');
    const block = sliceBalanced(body, open);

    return {
      keys: splitTopLevelCommas(block).map((entry) => entry.slice(0, entry.indexOf(':')).trim()),
      // `new Function` de propósito: o corpo vem da FONTE DE PRODUÇÃO, e é isso que transforma este
      // caso de "congelamento de texto" em teste de EFEITO da projeção.
      project: new Function('input', `return {${block}};`)
    };
  }

  function decisionInObserveMode() {
    setConfigOverride('conversationPermissionEnforcement', 'observe');
    setConversationPermissionCatalogSnapshotForTests(listCatalogPermissionKeys());
    try {
      return evaluateConversationPolicy({
        toolName: 'submit_manifest',
        channel: 'inapp',
        confirmed: true,
        allowActions: true,
        context: {
          channel: 'inapp',
          userId: 'usr_trace_a4',
          integrationAccountId: 'acc_trace_a4',
          sessionContextId: 'scx_trace_a4',
          channelSessionKey: 'inapp:usr_trace_a4:acc_trace_a4',
          permissionKeys: [],
          requestedBy: 'tester',
          correlationId: 'corr_trace_a4',
          conversationSessionId: 'csn_trace_a4',
          conversationTurnId: 'ctn_trace_a4',
          manifestId: null,
          jobId: null,
          auditCorrelationId: null,
          idempotencyKey: null,
          metadata: {}
        }
      });
    } finally {
      setConfigOverride('conversationPermissionEnforcement', 'enforce');
    }
  }

  it('em `observe`, a decisão que vai à trilha JÁ carrega a lacuna', () => {
    const decision = decisionInObserveMode();
    assert.equal(decision.allowed, true, 'observe deixou de permitir — este caso perdeu o alvo');
    assert.deepEqual(decision.permissionShortfall, {
      required: 'manifest.submit',
      catalogSatisfiable: true
    });
  });

  it('a projeção da trilha PRESERVA a lacuna (executada a partir da fonte de produção)', () => {
    const { keys, project } = buildPolicyProjection(source);
    assert.ok(keys.includes('permissionShortfall'), `o bloco projeta apenas: ${keys.join(', ')}`);

    const decision = decisionInObserveMode();
    const persisted = project({ policy: decision });

    assert.deepEqual(persisted.permissionShortfall, {
      required: 'manifest.submit',
      catalogSatisfiable: true
    });
    // O resto do bloco continua chegando — a trilha não pode perder o desfecho por causa deste campo.
    assert.equal(persisted.allowed, true);
    assert.equal(persisted.reasonCode, null);
  });

  it('PII: a lacuna persistida é só `{required, catalogSatisfiable}`', () => {
    // Ampliar este objeto com identificador de canal quebraria a mesma decisão de privacidade que
    // `requestedBy: whatsapp:<mascarado>` honra — e a métrica evita por cardinalidade.
    const { project } = buildPolicyProjection(source);
    const persisted = project({ policy: decisionInObserveMode() });
    assert.deepEqual(Object.keys(persisted.permissionShortfall).sort(), ['catalogSatisfiable', 'required']);
  });

  it('o ramo BLOQUEADO também persiste a lacuna (mesmo builder, mesma policy)', () => {
    setConversationPermissionCatalogSnapshotForTests(listCatalogPermissionKeys());
    const denied = evaluateConversationPolicy({
      toolName: 'cancel_manifest',
      channel: 'inapp',
      confirmed: true,
      allowActions: true,
      context: {
        channel: 'inapp',
        userId: 'usr_trace_a4',
        integrationAccountId: 'acc_trace_a4',
        sessionContextId: 'scx_trace_a4',
        channelSessionKey: 'inapp:usr_trace_a4:acc_trace_a4',
        permissionKeys: ['manifest.read'],
        requestedBy: 'tester',
        correlationId: 'corr_trace_a4',
        conversationSessionId: 'csn_trace_a4',
        conversationTurnId: 'ctn_trace_a4',
        manifestId: null,
        jobId: null,
        auditCorrelationId: null,
        idempotencyKey: null,
        metadata: {}
      }
    });

    assert.equal(denied.allowed, false);
    const { project } = buildPolicyProjection(source);
    assert.deepEqual(project({ policy: denied }).permissionShortfall, {
      required: 'manifest.cancel',
      catalogSatisfiable: true
    });
  });

  it('todo sítio que persiste trilha passa a policy VIVA do turno', () => {
    // Se um sítio passasse um objeto de policy montado à mão, a lacuna sumiria só daquele desfecho —
    // e justamente os desfechos bloqueados são os que interessam na janela `observe`.
    const expressions = new Set();
    const pattern = /buildConversationTracePayload\s*\(/g;
    let found = pattern.exec(source);

    while (found) {
      const args = sliceBalanced(source, found.index + found[0].length - 1);
      const entry = splitTopLevelCommas(sliceBalanced(args, args.indexOf('{')))
        .find((field) => field.startsWith('policy:'));
      if (entry) expressions.add(entry.slice('policy:'.length).trim());
      found = pattern.exec(source);
    }

    assert.ok(expressions.size > 0, 'nenhum sítio da trilha passa policy — o builder perdeu o alvo');
    assert.deepEqual(
      [...expressions],
      ['baseResponse.policy'],
      'apareceu sítio de trilha com policy montada à mão; a lacuna não chegaria à trilha por ali'
    );
  });

  it('a policy da resposta é montada a partir do veredito, com a lacuna incluída', () => {
    const service = stripComments(readFileSync(SERVICE, 'utf8'));
    assert.ok(
      /permissionShortfall:\s*policyDecision\.permissionShortfall\s*\?\?\s*null/.test(service),
      '`baseResponse.policy` deixou de copiar a lacuna do veredito — a trilha receberia `undefined`'
    );
  });

  it('CONTROLE NEGATIVO: apagar a linha do builder derruba os casos acima', () => {
    const mutated = source.replace(/\n\s*permissionShortfall: input\.policy\.permissionShortfall \?\? null/, '');
    assert.notEqual(mutated, source, 'a forma da linha mudou — ajuste o controle');

    const { keys, project } = buildPolicyProjection(mutated);
    assert.equal(keys.includes('permissionShortfall'), false);
    assert.equal(project({ policy: decisionInObserveMode() }).permissionShortfall, undefined);
  });
});
