// budgets.js — cálculo PURO de orçamento/limite. Sem orçamento configurado -> null (fail-soft).
// gasto = custo da conta (real) quando fresco, senão o estimado (interno). Janela = mês corrente.
export function computeBudget({ provider, monthlyUsd, spentUsd, warnPct = 80, breachPct = 100 } = {}) {
  if (!Number.isFinite(monthlyUsd) || monthlyUsd <= 0) return null;
  const spent = Number.isFinite(spentUsd) ? spentUsd : 0;
  const pct = (spent / monthlyUsd) * 100;
  let threshold = 'ok';
  if (pct >= breachPct) threshold = 'breach';
  else if (pct >= warnPct) threshold = 'warn';
  return {
    provider,
    monthlyUsd,
    spentUsd: Math.round(spent * 1e6) / 1e6,
    pctOfLimit: Math.round(pct * 10) / 10,
    threshold,
    breach: threshold === 'breach',
  };
}

// Deriva alertas (banners) a partir dos budgets + rate-limits computados.
export function deriveAlerts({ budgetsByProvider = {}, limitsByProvider = {} } = {}) {
  const alerts = [];
  for (const [provider, b] of Object.entries(budgetsByProvider)) {
    if (!b || b.threshold === 'ok') continue;
    alerts.push({
      id: `budget-${provider}`,
      severity: b.threshold === 'breach' ? 'critical' : 'warning',
      provider,
      title: b.threshold === 'breach' ? `Orçamento de ${provider} estourado` : `Orçamento de ${provider} em ${b.pctOfLimit}%`,
      detail: `US$ ${b.spentUsd.toFixed(2)} de US$ ${b.monthlyUsd.toFixed(2)} no mês.`,
    });
  }
  for (const [provider, lim] of Object.entries(limitsByProvider)) {
    for (const rl of (lim && lim.rateLimits) || []) {
      if (Number.isFinite(rl.pctUsed) && rl.pctUsed >= 90) {
        alerts.push({
          id: `rate-${provider}-${rl.kind}`,
          severity: rl.pctUsed >= 98 ? 'critical' : 'warning',
          provider,
          title: `Rate limit de ${provider} (${rl.kind}) em ${Math.round(rl.pctUsed)}%`,
          detail: `${rl.remaining ?? '?'} restantes de ${rl.limit ?? '?'} (${rl.unit || ''}).`,
        });
      }
    }
  }
  return alerts;
}
