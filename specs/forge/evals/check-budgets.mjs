// =============================================================================
// check-budgets.mjs — checagem NIGHTLY de budget de custo de IA por app (Forja 4.0 — B4).
// Consulta o Prometheus da plataforma (sum by (app) (increase(ai_cost_usd_total[30d])))
// e compara com specs/forge/budgets.json. Saída: relatório markdown em stdout-friendly
// + arquivo (--out), e outputs p/ o workflow (exceeded=true/false via GITHUB_OUTPUT).
//
// NUNCA derruba app e NUNCA falha por estouro — estouro vira ISSUE no GitHub (criada
// pelo job forge-budget do ai-evals.yml). Degradações são honestas e warn-only:
//   - Prometheus inacessível          -> ::warning:: + exit 0 (exceeded=false)
//   - métrica ai_cost_usd_total vazia -> ::warning:: (apps sem instrumentação/tráfego)
// Só sai !=0 em erro de programação/entrada (budgets.json inválido).
//
// Uso:  PROMETHEUS_URL=http://localhost:19090 node specs/forge/evals/check-budgets.mjs [--out report.md]
// =============================================================================
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BUDGETS_FILE = path.join(__dirname, '..', 'budgets.json');
const WINDOW = process.env.BUDGET_WINDOW || '30d'; // ~mensal (janela rolante)

/** Compara linhas de custo {app, usd} com os budgets. PURO (testável). */
export function evaluateBudgets(costRows, budgets) {
  const def = Number(budgets?.default?.monthlyUsd);
  if (!Number.isFinite(def) || def <= 0) throw new Error('budgets.json: default.monthlyUsd inválido');
  const perApp = budgets.apps || {};
  const entries = costRows
    .filter((r) => r && r.app)
    .map((r) => {
      const budgetUsd = Number(perApp[r.app]?.monthlyUsd) > 0 ? Number(perApp[r.app].monthlyUsd) : def;
      const spentUsd = Number(r.usd) || 0;
      return { app: r.app, spentUsd, budgetUsd, ratio: budgetUsd ? spentUsd / budgetUsd : 0, exceeded: spentUsd > budgetUsd };
    })
    .sort((a, b) => b.ratio - a.ratio);
  return { entries, exceeded: entries.filter((e) => e.exceeded) };
}

/** Relatório markdown (usado no summary do job e no corpo da issue). PURO. */
export function renderReport({ entries, exceeded }, { window = WINDOW, generatedAt = new Date().toISOString() } = {}) {
  const L = [
    `## Budget de IA por app (janela ${window})`,
    '',
    `Gerado em ${generatedAt} pelo job nightly \`forge-budget\` (fonte: Prometheus \`ai_cost_usd_total\`; budgets: \`specs/forge/budgets.json\`).`,
    '',
  ];
  if (!entries.length) {
    L.push('_Nenhum app com métrica de custo na janela — apps sem instrumentação de IA ou sem tráfego._');
    return L.join('\n') + '\n';
  }
  L.push('| app | gasto (USD) | budget (USD) | uso | estourou? |', '|---|---:|---:|---:|:--:|');
  for (const e of entries) {
    L.push(`| ${e.app} | ${e.spentUsd.toFixed(4)} | ${e.budgetUsd.toFixed(2)} | ${(e.ratio * 100).toFixed(1)}% | ${e.exceeded ? 'SIM' : 'não'} |`);
  }
  if (exceeded.length) {
    L.push('', `**${exceeded.length} app(s) acima do budget:** ${exceeded.map((e) => e.app).join(', ')}.`,
      '', '> Política: estouro NUNCA derruba o app — esta issue é o alerta para o operador rever uso/budget.');
  }
  return L.join('\n') + '\n';
}

/** Consulta instantânea ao Prometheus. Fail-soft: { ok:false, error } sem lançar. */
export async function queryCostByApp(baseUrl, { window = WINDOW, timeoutMs = 10000, fetchImpl = fetch } = {}) {
  const base = String(baseUrl || '').replace(/\/+$/, '');
  if (!base) return { ok: false, error: 'PROMETHEUS_URL ausente', rows: [] };
  const promql = `sum by (app) (increase(ai_cost_usd_total[${window}]))`;
  const url = `${base}/api/v1/query?query=${encodeURIComponent(promql)}`;
  try {
    const r = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs), headers: { Accept: 'application/json' } });
    if (!r.ok) return { ok: false, error: `prometheus HTTP ${r.status}`, rows: [] };
    const j = await r.json();
    if (j.status !== 'success') return { ok: false, error: j.error || 'prometheus error', rows: [] };
    const rows = ((j.data && j.data.result) || []).map((s) => ({
      app: s.metric.app || s.metric.exported_app || '',
      usd: Number(Array.isArray(s.value) ? s.value[1] : 0),
    }));
    return { ok: true, rows };
  } catch (err) {
    return { ok: false, error: String((err && err.message) || err), rows: [] };
  }
}

function setOutput(key, value) {
  if (!process.env.GITHUB_OUTPUT) return;
  try { fs.appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`); } catch { /* fail-soft */ }
}

async function main() {
  const argOut = (() => { const i = process.argv.indexOf('--out'); return i >= 0 ? process.argv[i + 1] : null; })();
  const budgets = JSON.parse(fs.readFileSync(BUDGETS_FILE, 'utf8')); // inválido = erro real (exit 1)

  const q = await queryCostByApp(process.env.PROMETHEUS_URL || 'http://localhost:19090');
  if (!q.ok) {
    console.log(`::warning::forge-budget: Prometheus inacessível (${q.error}) — checagem de budget PULADA nesta noite (degradação honesta, nada derrubado).`);
    setOutput('exceeded', 'false');
    setOutput('degraded', 'true');
    return;
  }
  if (!q.rows.length) {
    console.log('::warning::forge-budget: métrica ai_cost_usd_total sem séries por app na janela — apps ainda sem instrumentação de IA ou sem tráfego. Nada a comparar.');
  }

  const result = evaluateBudgets(q.rows, budgets);
  const report = renderReport(result);
  console.log(report);
  if (argOut) fs.writeFileSync(argOut, report);
  setOutput('exceeded', result.exceeded.length ? 'true' : 'false');
  setOutput('degraded', 'false');
  if (result.exceeded.length) {
    console.log(`::warning::forge-budget: ${result.exceeded.length} app(s) acima do budget — o job cria/atualiza a issue de alerta (nunca derruba app).`);
  } else {
    console.log('[forge-budget] todos os apps dentro do budget.');
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((e) => { console.error('[forge-budget] FALHOU:', e.message); process.exit(1); });
}
