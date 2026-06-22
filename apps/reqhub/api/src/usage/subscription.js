// usage/subscription.js — uso da ASSINATURA Claude Code (Opus/Sonnet/Haiku) por janela 5h/24h/7d.
// A assinatura (janelas 5h/semana) NÃO tem API pública de limites; o painel só via modelos via
// API-key. Aqui guardamos (em memória) o AGREGADO dos transcripts locais, ingerido pelo sync host
// (scripts/sync-reqhub-claude-usage.ps1 -> POST /v1/ai-usage/subscription). Fail-soft: vazio se nada
// foi ingerido (o painel mostra a nota honesta). Perde no restart do pod; o sync re-popula.
let store = null;

export function ingestSubscription(payload) {
  if (!payload || typeof payload !== 'object' || !payload.byModel || typeof payload.byModel !== 'object') {
    throw new Error('payload inválido: esperado { byModel, totals, windows, generatedAt }');
  }
  store = {
    source: 'live',
    generatedAt: payload.generatedAt || null,
    ingestedAt: new Date().toISOString(),
    windows: Array.isArray(payload.windows) ? payload.windows : ['5h', '24h', '7d'],
    filesScanned: payload.filesScanned || null,
    messagesCounted: payload.messagesCounted || null,
    byModel: payload.byModel,
    totals: payload.totals || {},
  };
  return store;
}

export function getSubscription() {
  if (store) return store;
  return {
    source: 'empty',
    windows: ['5h', '24h', '7d'],
    byModel: {},
    totals: {},
    note: 'Sem dados da assinatura ingeridos. Rode scripts/sync-reqhub-claude-usage.ps1 (agrega os transcripts locais e envia para cá). A assinatura do Claude Code não tem API pública de limites — este número é o consumo REAL agregado localmente.',
  };
}

// p/ teste
export function _reset() { store = null; }
