// =============================================================================
// orchestrate-build.mjs — scheduler STATELESS do build greenfield. Compara o
// build-plan (ordem/waves) × implementation-status (estado real REQ->PR->deploy) e
// decide o que disparar agora. Idempotente e retomável: o estado de verdade é o
// implementation-status.json; re-rodar continua de onde parou (REQ já em andamento
// é no-op). NÃO ganha privilégio novo — apenas dispara a esteira req-implement.
//
// Uso:
//   node orchestrate-build.mjs <product> --status     # imprime progresso por requisito
//   node orchestrate-build.mjs <product> --next       # lista os REQ prontos p/ disparar
//   node orchestrate-build.mjs <product> --dispatch [--max N]
//        # dispara `gh workflow run req-implement.yml -f req_id=<id>` p/ os prontos (teto N=3).
// =============================================================================
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SPECS_DIR = path.resolve(__dirname, '..');
const DONE = new Set(['merged', 'deployed', 'done']);
const IN_FLIGHT = new Set(['in_progress', 'pr_open']);

// Pura/testável: progresso do produto. `statusMap` = items do implementation-status.json.
export function planProgress(plan, statusMap = {}) {
  const st = (id) => (statusMap[id] && statusMap[id].status) || 'not_started';
  const result = { scaffold: null, ready: [], inFlight: [], blocked: [], done: [], byReq: {}, complete: false };
  for (const id of plan.order || []) result.byReq[id] = st(id);

  let prevWavesDone = true;
  for (const w of plan.waves || []) {
    const unlocked = prevWavesDone;
    for (const id of w.work_orders) {
      if (id === plan.scaffold_req) continue; // tratado à parte (humano)
      const s = st(id);
      if (DONE.has(s)) result.done.push(id);
      else if (IN_FLIGHT.has(s)) result.inFlight.push(id);
      else if (s === 'blocked') result.blocked.push({ req: id, reason: 'blocked' });
      else if (unlocked) result.ready.push(id);
      else result.blocked.push({ req: id, reason: 'wave anterior incompleta' });
    }
    const wDone = w.work_orders.every((id) => DONE.has(st(id)));
    prevWavesDone = prevWavesDone && wDone;
  }

  if (plan.scaffold_req) {
    const s = st(plan.scaffold_req);
    result.scaffold = {
      req: plan.scaffold_req,
      status: s,
      done: DONE.has(s),
      action: DONE.has(s) ? 'pronto' : 'rode scripts/scaffold-product.ps1 + commit (PR de bootstrap) + impl-status.mjs --set <req> status=merged',
    };
  }
  // build completo = todo REQ do plano done E (sem scaffold OU scaffold done)
  result.complete = (plan.order || []).every((id) => DONE.has(st(id)));
  return result;
}

function load(product) {
  const planPath = path.join(SPECS_DIR, 'products', product, 'build-plan.json');
  if (!fs.existsSync(planPath)) { console.error(`[orchestrate] sem build-plan: ${planPath} (gere com build-plan.mjs e aprove na fase de arquitetura)`); process.exit(1); }
  const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
  const isPath = path.join(SPECS_DIR, 'baseline', 'implementation-status.json');
  const items = fs.existsSync(isPath) ? (JSON.parse(fs.readFileSync(isPath, 'utf8')).items || {}) : {};
  return { plan, items };
}

function main() {
  const args = process.argv.slice(2);
  const product = args.find((a) => !a.startsWith('--'));
  if (!product) { console.error('uso: node orchestrate-build.mjs <product> [--status|--next|--dispatch] [--max N]'); process.exit(2); }
  const { plan, items } = load(product);
  const prog = planProgress(plan, items);

  if (args.includes('--status') || (!args.includes('--next') && !args.includes('--dispatch'))) {
    console.log(`# build de '${product}' — ${plan.order.length} requisitos, ${plan.waves.length} waves`);
    if (prog.scaffold) console.log(`scaffold (${prog.scaffold.req}): ${prog.scaffold.status}${prog.scaffold.done ? '' : ' -> ' + prog.scaffold.action}`);
    for (const id of plan.order) console.log(`  ${prog.byReq[id].padEnd(12)} ${id}`);
    console.log(`done=${prog.done.length} inflight=${prog.inFlight.length} ready=${prog.ready.length} blocked=${prog.blocked.length} ${prog.complete ? '\n✅ BUILD COMPLETO' : ''}`);
    return;
  }
  if (args.includes('--next')) {
    if (prog.scaffold && !prog.scaffold.done) { console.log(`[scaffold pendente] ${prog.scaffold.req}: ${prog.scaffold.action}`); return; }
    console.log(prog.ready.length ? prog.ready.join('\n') : '(nada pronto: aguardando deps/scaffold ou tudo em andamento)');
    return;
  }
  if (args.includes('--dispatch')) {
    if (prog.scaffold && !prog.scaffold.done) { console.error(`[orchestrate] scaffold pendente (${prog.scaffold.req}) — faça a fase C antes. ${prog.scaffold.action}`); process.exit(1); }
    const maxIdx = args.indexOf('--max');
    const max = maxIdx >= 0 ? Math.max(1, Number(args[maxIdx + 1]) || 3) : 3;
    const targets = prog.ready.slice(0, max);
    if (!targets.length) { console.log('[orchestrate] nada para disparar agora.'); return; }
    for (const id of targets) {
      console.log(`[orchestrate] gh workflow run req-implement.yml -f req_id=${id}`);
      try { execFileSync('gh', ['workflow', 'run', 'req-implement.yml', '-f', `req_id=${id}`], { stdio: 'inherit' }); }
      catch (e) { console.error(`[orchestrate] falha ao disparar ${id}: ${e.message}`); process.exit(1); }
    }
    console.log(`[orchestrate] disparados ${targets.length} requisito(s) (teto ${max}); acompanhe em Actions / Reqhub.`);
  }
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('orchestrate-build.mjs')) main();
