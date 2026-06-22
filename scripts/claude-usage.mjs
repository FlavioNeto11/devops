// =============================================================================
// claude-usage.mjs — agrega o CONSUMO REAL da assinatura Claude Code (Opus/Sonnet)
// a partir dos transcripts locais (~/.claude/projects/**/*.jsonl), incluindo os
// subagentes de Workflow (agent-*.jsonl) — que é onde o grosso dos tokens vai.
//
// Por quê: a assinatura do Claude Code (janelas 5h/semana) NÃO tem API pública de
// limites; o painel /reqs/#/aiusage só mostra modelos via API-key. Este agregador é
// a fonte honesta do gasto da assinatura, por janela (5h / 24h / 7d), por modelo.
//
// Uso:  node scripts/claude-usage.mjs            # tabela 5h/24h/7d
//       node scripts/claude-usage.mjs --json     # JSON (p/ o sync do painel)
//       node scripts/claude-usage.mjs --root <dir>  # outra raiz de projetos
// =============================================================================
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const rootArg = (() => { const i = args.indexOf('--root'); return i >= 0 ? args[i + 1] : null; })();
const ROOT = rootArg || path.join(os.homedir(), '.claude', 'projects');

// janelas (rolling, a partir de agora)
const NOW = Date.now();
const WINDOWS = [
  { id: '5h', label: 'Janela 5h (assinatura)', ms: 5 * 3600e3 },
  { id: '24h', label: 'Últimas 24h', ms: 24 * 3600e3 },
  { id: '7d', label: 'Últimos 7 dias (semanal)', ms: 7 * 24 * 3600e3 },
];
// custo-equivalente aproximado por modelo (USD/Mtok) — só p/ referência; a assinatura é flat.
const PRICE = {
  'claude-opus-4-8': { in: 15, out: 75, cacheWrite: 18.75, cacheRead: 1.5 },
  'claude-sonnet-4-6': { in: 3, out: 15, cacheWrite: 3.75, cacheRead: 0.3 },
  'claude-haiku-4-5-20251001': { in: 0.8, out: 4, cacheWrite: 1.0, cacheRead: 0.08 },
};

function* walk(dir) {
  let ents = [];
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of ents) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (e.name.endsWith('.jsonl')) yield p;
  }
}

// acumulador: model -> window -> {input,output,cacheWrite,cacheRead,msgs}
const acc = {};
const bump = (model, winId, u) => {
  acc[model] = acc[model] || {};
  const w = (acc[model][winId] = acc[model][winId] || { input: 0, output: 0, cacheWrite: 0, cacheRead: 0, msgs: 0 });
  w.input += u.input_tokens || 0;
  w.output += u.output_tokens || 0;
  w.cacheWrite += u.cache_creation_input_tokens || 0;
  w.cacheRead += u.cache_read_input_tokens || 0;
  w.msgs += 1;
};

let files = 0, lines = 0;
for (const file of walk(ROOT)) {
  files++;
  let content = '';
  try { content = fs.readFileSync(file, 'utf8'); } catch { continue; }
  for (const line of content.split('\n')) {
    if (!line.trim()) continue;
    let o; try { o = JSON.parse(line); } catch { continue; }
    const msg = o.message || o;
    const usage = msg && msg.usage;
    const model = (msg && msg.model) || o.model;
    if (!usage || !model || model === '<synthetic>') continue;
    const tsRaw = o.timestamp || msg.timestamp;
    const ts = tsRaw ? Date.parse(tsRaw) : NaN;
    if (!isFinite(ts)) continue;
    const age = NOW - ts;
    lines++;
    for (const w of WINDOWS) if (age >= 0 && age <= w.ms) bump(model, w.id, usage);
  }
}

const fmt = (n) => n.toLocaleString('pt-BR');
const costOf = (model, w) => {
  const p = PRICE[model]; if (!p) return null;
  return (w.input * p.in + w.output * p.out + w.cacheWrite * p.cacheWrite + w.cacheRead * p.cacheRead) / 1e6;
};
// "tokens da janela" relevantes ao limite: input + output + cacheWrite (cacheRead é barato/descontado)
const billable = (w) => w.input + w.output + w.cacheWrite;

const report = {
  generatedAt: new Date(NOW).toISOString(),
  root: ROOT, filesScanned: files, messagesCounted: lines,
  windows: WINDOWS.map((w) => w.id),
  byModel: {},
  totals: {},
};
for (const model of Object.keys(acc)) {
  report.byModel[model] = {};
  for (const w of WINDOWS) {
    const d = acc[model][w.id] || { input: 0, output: 0, cacheWrite: 0, cacheRead: 0, msgs: 0 };
    report.byModel[model][w.id] = { ...d, billable: billable(d), costUsdApiEquiv: costOf(model, d) };
  }
}
for (const w of WINDOWS) {
  let bill = 0, cost = 0, msgs = 0;
  for (const model of Object.keys(acc)) { const d = acc[model][w.id]; if (!d) continue; bill += billable(d); const c = costOf(model, d); if (c) cost += c; msgs += d.msgs; }
  report.totals[w.id] = { billable: bill, costUsdApiEquiv: cost, msgs };
}

if (asJson) { process.stdout.write(JSON.stringify(report, null, 2) + '\n'); process.exit(0); }

// ---- tabela legível ----
console.log('Uso da ASSINATURA Claude Code (agregado dos transcripts locais)');
console.log('  raiz: ' + ROOT + ' | arquivos: ' + files + ' | mensagens: ' + lines + ' | agora: ' + report.generatedAt);
console.log('  (custo USD = EQUIVALENTE de API, só referência; a assinatura é flat por janela)\n');
for (const w of WINDOWS) {
  console.log('=== ' + w.label + ' ===');
  const models = Object.keys(acc).filter((m) => acc[m][w.id] && acc[m][w.id].msgs);
  if (!models.length) { console.log('  (sem uso na janela)\n'); continue; }
  for (const m of models.sort()) {
    const d = acc[m][w.id];
    const c = costOf(m, d);
    console.log('  ' + m.padEnd(28) + ' billable ' + fmt(billable(d)).padStart(12) + ' tok  (in ' + fmt(d.input) + ' / out ' + fmt(d.output) + ' / cacheW ' + fmt(d.cacheWrite) + ' / cacheR ' + fmt(d.cacheRead) + ')' + (c != null ? '  ~US$ ' + c.toFixed(2) : '') + '  [' + d.msgs + ' msgs]');
  }
  const t = report.totals[w.id];
  console.log('  ' + 'TOTAL'.padEnd(28) + ' billable ' + fmt(t.billable).padStart(12) + ' tok  ~US$ ' + t.costUsdApiEquiv.toFixed(2) + '  [' + t.msgs + ' msgs]\n');
}
