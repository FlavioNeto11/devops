// =============================================================================
// verify-test-locks.mjs — verifica a INTEGRIDADE da suíte de testes LOCKED de um app.
// -----------------------------------------------------------------------------
// A suíte é gerada na concepção por make-test-suite.mjs em apps/<app>/tests/locked/**
// + um manifesto apps/<app>/tests/.test-locks.json. O guard (DENYLIST) já impede o
// headless de editar/apagar esses arquivos; este verificador é a defesa em profundidade
// no CI (forge-tests) e no auto-merge: confirma que cada teste locked EXISTE, que o
// sha256 BATE (não foi enfraquecido), que a contagem não caiu abaixo de `minCount`, e
// que ninguém ADICIONOU um arquivo dentro de tests/locked/ fora do manifesto (sneak-add).
//
// Função pura `verify(manifest, { shaOf, lockedOnDisk })` (node:test).
// Uso: node verify-test-locks.mjs --app apps/<app>
// =============================================================================
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

const norm = (p) => String(p).replace(/\\/g, '/').replace(/^\.\//, '');

// Pura/testável. shaOf(path)->hex|null (null = ausente); lockedOnDisk = paths relativos no disco.
export function verify(manifest, { shaOf, lockedOnDisk = [] } = {}) {
  const problems = [];
  const files = Array.isArray(manifest && manifest.files) ? manifest.files : [];
  const manifestPaths = new Set(files.map((f) => norm(f.path)));
  for (const entry of files) {
    const p = norm(entry.path);
    const actual = shaOf(p);
    if (actual == null) problems.push({ path: p, reason: 'ausente — teste locked apagado' });
    else if (actual !== entry.sha256) problems.push({ path: p, reason: 'hash divergente — teste locked alterado/enfraquecido' });
  }
  const minCount = Number.isInteger(manifest && manifest.minCount) ? manifest.minCount : files.length;
  const onDisk = (lockedOnDisk || []).map(norm);
  if (onDisk.length < minCount) {
    problems.push({ path: '(contagem)', reason: `${onDisk.length} teste(s) locked no disco; mínimo ${minCount}` });
  }
  for (const p of onDisk) {
    if (!manifestPaths.has(p)) problems.push({ path: p, reason: 'arquivo dentro de tests/locked/ ausente do manifesto (sneak-add)' });
  }
  return { ok: problems.length === 0, problems };
}

function walk(dir, base) {
  const out = [];
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(full, base));
    else out.push(norm(path.relative(base, full)));
  }
  return out;
}

function flag(args, name) { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; }

function main() {
  const args = process.argv.slice(2);
  const appDir = flag(args, '--app');
  if (!appDir) { console.error('uso: node verify-test-locks.mjs --app apps/<app>'); process.exit(2); }
  const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..');
  const appAbs = path.isAbsolute(appDir) ? appDir : path.join(repoRoot, appDir);
  const manifestPath = path.join(appAbs, 'tests', '.test-locks.json');
  if (!fs.existsSync(manifestPath)) {
    // app sem suíte locked → nada a verificar (não falha; o gate só roda em apps com manifesto).
    console.log(`[verify-test-locks] ${norm(appDir)}: sem .test-locks.json — nada a verificar.`);
    return;
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const lockedDir = path.join(appAbs, 'tests', 'locked');
  const lockedOnDisk = walk(lockedDir, repoRoot);
  const shaOf = (rel) => {
    const abs = path.join(repoRoot, rel);
    try { return sha256(fs.readFileSync(abs)); } catch { return null; }
  };
  const { ok, problems } = verify(manifest, { shaOf, lockedOnDisk });
  if (!ok) {
    console.error(`\x1b[31m[verify-test-locks] REPROVADO ${norm(appDir)}: ${problems.length} problema(s):\x1b[0m`);
    for (const p of problems) console.error(`  ✗ ${p.path} — ${p.reason}`);
    console.error('Ação: testes LOCKED não podem ser alterados/apagados. Mudar exige atualizar o spec e regenerar (make-test-suite).');
    process.exit(1);
  }
  console.log(`\x1b[32m[verify-test-locks] OK ${norm(appDir)}: ${manifest.files.length} teste(s) locked íntegros.\x1b[0m`);
}

if (process.argv[1] && process.argv[1].endsWith('verify-test-locks.mjs')) main();
