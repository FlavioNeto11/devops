// =============================================================================
// guard-worktree.mjs — BARREIRA TÉCNICA de blast-radius da esteira Claude→PR.
// -----------------------------------------------------------------------------
// A skill `implement-req` declara guardrails (só `allowed_paths`, nunca main/
// secrets/platform/.github). Isso, sozinho, é REGRA DE PROMPT — não barreira.
// Este guard transforma em barreira: dado o conjunto de arquivos ALTERADOS por
// uma execução headless e a `work-order` (com `allowed_paths`/`restricted`),
// FALHA (exit 1) se qualquer arquivo alterado:
//   (1) bater na DENYLIST (sempre proibido: .github/**, platform/**, .claude/**,
//       specs/requirements/**, **/.env*, **/*.secret.yaml, ...), OU
//   (2) estiver FORA de `allowed_paths` (ou o escopo for `restricted` → vazio).
// A esteira roda este guard ANTES de `git push`/`gh pr create`; o auto-merge
// roda de novo sobre o diff do PR antes de mesclar (defesa em profundidade).
//
// Função pura `evaluate(changedFiles, {allowedPaths, restricted})` (node:test).
// Uso: node guard-worktree.mjs --work-order work-order.json --changed-file changed.txt
//      node guard-worktree.mjs --work-order wo.json --changed "a.js,b.js" [--req REQ-X]
// =============================================================================
import fs from 'node:fs';

// Sempre proibido, mesmo dentro de allowed_paths (segredos, infra, CI/CD, a própria
// governança e os requisitos — a Claude implementa CÓDIGO, não reescreve a intenção).
export const DENYLIST = [
  '.github/**',
  'platform/**',
  '.claude/**',
  'specs/requirements/**',
  '**/.env',
  '**/.env.*',
  '**/*.secret.yaml',
  '**/*.secret.yml',
  '**/secret.yaml',
  '**/secret.yml',
  // Testes LOCKED gerados na concepção (make-test-suite.mjs): o headless implementa CÓDIGO,
  // nunca enfraquece o contrato de teste. Mudar exige spec + regenerar (humano). Ver verify-test-locks.mjs.
  'apps/*/tests/locked/**',
  'apps/*/tests/.test-locks.json',
];

// Exceções legítimas que a skill atualiza fora do escopo do produto.
export const ALWAYS_ALLOW = new Set(['specs/baseline/implementation-status.json']);

// Glob mínimo (sem deps): `**` cruza segmentos, `*`/`?` ficam dentro de um segmento.
export function globToRegExp(glob) {
  let re = '^';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        re += '.*';
        i++;
        if (glob[i + 1] === '/') i++; // consome a barra de `**/`
      } else {
        re += '[^/]*';
      }
    } else if (c === '?') {
      re += '[^/]';
    } else if ('.+^${}()|[]\\'.includes(c)) {
      re += '\\' + c;
    } else {
      re += c;
    }
  }
  return new RegExp(re + '$');
}

function norm(p) {
  return String(p).replace(/\\/g, '/').replace(/^\.\//, '').trim();
}

const matchAny = (file, globs) => globs.some((g) => globToRegExp(g).test(file));

// Pura e testável. Retorna { ok, violations: [{file, reason}] }.
export function evaluate(changedFiles, { allowedPaths = [], restricted = false } = {}) {
  const violations = [];
  for (const raw of changedFiles) {
    const file = norm(raw);
    if (!file) continue;
    if (matchAny(file, DENYLIST)) {
      violations.push({ file, reason: 'denylist (segredo/infra/CI-CD/governança)' });
    } else if (ALWAYS_ALLOW.has(file)) {
      // exceção explícita
    } else if (restricted) {
      violations.push({ file, reason: 'escopo RESTRITO (infra/CI-CD): nenhuma edição headless permitida' });
    } else if (!matchAny(file, allowedPaths)) {
      violations.push({ file, reason: `fora de allowed_paths (${allowedPaths.join(', ') || 'nenhum'})` });
    }
  }
  return { ok: violations.length === 0, violations };
}

function flag(args, name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
}

function main() {
  const args = process.argv.slice(2);
  const woPath = flag(args, '--work-order') || 'work-order.json';
  const changedFile = flag(args, '--changed-file');
  const changedInline = flag(args, '--changed');
  const reqArg = flag(args, '--req');

  let changed = [];
  if (changedFile) changed = fs.readFileSync(changedFile, 'utf8').split(/\r?\n/);
  else if (changedInline) changed = changedInline.split(/[,\n]+/);
  changed = changed.map((s) => s.trim()).filter(Boolean);

  const woRaw = JSON.parse(fs.readFileSync(woPath, 'utf8'));
  const order = Array.isArray(woRaw.orders)
    ? (reqArg ? woRaw.orders.find((o) => o.req_id === reqArg) : woRaw.orders[0])
    : woRaw;
  if (!order) {
    console.error(`[guard] ordem de trabalho não encontrada em ${woPath}${reqArg ? ` p/ ${reqArg}` : ''}`);
    process.exit(2);
  }

  const { ok, violations } = evaluate(changed, { allowedPaths: order.allowed_paths || [], restricted: !!order.restricted });
  const tag = `${order.req_id} [${order.product_scope}${order.restricted ? ', RESTRITO' : ''}]`;
  if (!ok) {
    console.error(`\x1b[31m[guard] REPROVADO ${tag}: ${violations.length} arquivo(s) fora do blast-radius:\x1b[0m`);
    for (const v of violations) console.error(`  ✗ ${v.file} — ${v.reason}`);
    console.error('Ação: NÃO abrir/mesclar PR; revisão humana (PR-rascunho para escopo restrito).');
    process.exit(1);
  }
  console.log(`\x1b[32m[guard] OK ${tag}: ${changed.length} arquivo(s), todos dentro do blast-radius.\x1b[0m`);
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('guard-worktree.mjs')) main();
