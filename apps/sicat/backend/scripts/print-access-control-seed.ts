/**
 * Imprime o SQL do seed RBAC (fase 4.5) como um script psql executável em transação DESCARTÁVEL.
 *
 * ── POR QUE ESTE SCRIPT EXISTE ──────────────────────────────────────────────────────────────────
 * Dívida ASSUMIDA e nomeada: nenhum teste executa os statements do seed contra um Postgres. A suíte
 * unitária afirma sobre as STRINGS devolvidas por `buildAccessControlSeedStatements()` — o que prova
 * FORMA (nenhum insert sem `on conflict`, nenhum `delete`, `is_active` fora de todo `do update`) e
 * NÃO prova sintaxe, nem que o conflict target casa com o índice único, nem idempotência. Agravantes
 * verificados: `ensureBaseData` captura a exceção do seed e só faz `console.error` (o boot continua),
 * os testes de BACKEND não estão em CI nenhum, e em modo `observe` um seed totalmente falho é
 * comportamentalmente invisível.
 *
 * Enquanto não houver teste de integração, a verificação é MANUAL e BLOQUEANTE do flip — o passo 4
 * do runbook (`docs/05-operacao/runbook-rbac-conversacional.md`). Este script existe para que esse
 * passo seja um comando, não uma transcrição à mão.
 *
 * ── O QUE ELE NÃO FAZ ───────────────────────────────────────────────────────────────────────────
 * NÃO abre conexão, NÃO lê `DATABASE_URL`, NÃO executa nada. Só imprime. O `begin;` … `rollback;`
 * está no texto de propósito: o operador valida sintaxe e semântica sem deixar rastro. Trocar o
 * `rollback` por `commit` é uma edição deliberada de quem executa, nunca um default deste arquivo.
 *
 * Uso:
 *   npm run seed:access-control:print > /tmp/access-control-seed.sql
 *   kubectl exec -n apps -i deploy/sicat-postgres -- psql -U <user> -d mtr_automation \
 *     -v ON_ERROR_STOP=1 -f - < /tmp/access-control-seed.sql
 *
 * `ON_ERROR_STOP=1` é o que transforma "imprimiu erro no meio" em código de saída != 0.
 */

import {
  buildAccessControlSeedStatements,
  buildAccessControlSeedTrailStatement,
  buildFloorRoleWideningAuditStatement,
  FLOOR_ROLE_EXTRA_PERMISSIONS_SQL,
  type AccessControlSeedStatement
} from '../src/bootstrap/access-control-seed.js';
import { FLOOR_ROLE_NAME, listFloorRolePermissionKeys } from '../src/lib/conversation-permission-catalog.js';

/** Literal SQL. Os valores vêm do catálogo em código — não há entrada de usuário nesta superfície. */
function toSqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) {
    // SEM `::text[]` aqui: todo sítio que recebe array já escreve `any($N::text[])`, e um segundo
    // cast só produziria `::text[]::text[]` no arquivo gerado (válido, mas ilegível na revisão).
    return `array[${value.map((entry) => toSqlLiteral(entry)).join(', ')}]`;
  }
  return `'${String(value).replace(/'/g, "''")}'`;
}

/**
 * Substitui `$1..$N` pelos literais. Ordem DECRESCENTE de propósito: substituir `$1` antes de `$10`
 * corromperia `$10` em `<literal>0`. (Hoje nenhum statement passa de 5 parâmetros; a ordem existe
 * para que acrescentar o sexto não vire um bug de impressão silencioso.)
 */
function inlineParams(statement: AccessControlSeedStatement): string {
  let sql = statement.sql;
  for (let index = statement.params.length; index >= 1; index -= 1) {
    const literal = toSqlLiteral(statement.params[index - 1]);
    sql = sql.split(`$${index}`).join(literal);
  }
  return sql;
}

function emit(statement: AccessControlSeedStatement): string {
  return `-- ── ${statement.name}\n${inlineParams(statement)};\n`;
}

function main(): void {
  const statements = buildAccessControlSeedStatements();

  const lines: string[] = [
    '-- Seed RBAC conversacional (fase 4.5) — GERADO por scripts/print-access-control-seed.ts.',
    '-- NAO EDITE A MAO: regenere. Roda em transacao descartavel (rollback ao final).',
    `-- Statements: ${statements.length} (a lista varia com SICAT_BOOTSTRAP_EMAIL).`,
    '',
    '\\set ON_ERROR_STOP on',
    'begin;',
    ''
  ];

  for (const statement of statements) {
    lines.push(emit(statement));
  }

  lines.push('-- ── testemunha de alargamento do papel-PISO (leitura pura)');
  lines.push(
    `${inlineParams({
      name: 'floor-role-extra-permissions',
      sql: FLOOR_ROLE_EXTRA_PERMISSIONS_SQL,
      params: [FLOOR_ROLE_NAME, listFloorRolePermissionKeys()]
    })};`
  );
  lines.push('');

  lines.push(emit(buildFloorRoleWideningAuditStatement(['<exemplo>'])));

  lines.push(emit(buildAccessControlSeedTrailStatement({
    permissionsReconciled: 0,
    rolesReconciled: 0,
    rolePermissionLinksCreated: 0,
    adminRolePermissionLinksCreated: 0,
    adminRoleBootstrapped: false,
    floorRoleGrantsCreated: 0,
    adminGrantBootstrapped: false,
    floorRoleExtraPermissionKeys: []
  })));

  lines.push('-- Rode o bloco DUAS VEZES na mesma sessao antes do rollback: idempotencia se prova');
  lines.push('-- executando, nao lendo. Qualquer 23505 aqui e defeito do seed, nao do banco.');
  lines.push('rollback;');

  console.log(lines.join('\n'));
}

main();
