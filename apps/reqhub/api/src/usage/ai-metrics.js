// ai-metrics.js — instrumenta o PRÓPRIO reqhub-api com as métricas canônicas ai_* (igual
// a sicat/gymops), num servidor /metrics separado na 9464 (nunca via Traefik). Assim o reqhub
// aparece como um "módulo" no painel de Uso da IA e prova o caminho provider-tag ponta a ponta.
// Best-effort: telemetria NUNCA derruba a API.
import http from 'node:http';
import promClient from 'prom-client';
import { createAiMetrics, estimateCostUsd, extractTokenUsage } from '@flavioneto11/ai-core';

promClient.collectDefaultMetrics();
export const aiMetrics = createAiMetrics({ promClient, app: 'reqhub' });

// Registra tokens + custo estimado de uma resposta de LLM (usage = { prompt_tokens, completion_tokens }).
export function recordUsage(model, usage) {
  try {
    if (!aiMetrics.enabled || !usage) return;
    const { inputTokens, outputTokens } = extractTokenUsage(usage);
    aiMetrics.addTokens(model, inputTokens, outputTokens);
    aiMetrics.addCost(model, estimateCostUsd(model, inputTokens, outputTokens));
  } catch { /* telemetria nunca quebra o caminho de IA */ }
}

let _server = null;
export function startAiMetricsServer() {
  if (_server) return _server;
  const port = Number.parseInt(process.env.METRICS_PORT || '9464', 10);
  _server = http.createServer(async (req, res) => {
    if (req.url === '/metrics') {
      try {
        res.setHeader('Content-Type', promClient.register.contentType);
        res.end(await promClient.register.metrics());
      } catch (err) { res.statusCode = 500; res.end(String((err && err.message) || err)); }
    } else if (req.url === '/healthz') {
      res.end('ok');
    } else { res.statusCode = 404; res.end('not found'); }
  });
  _server.on('error', (err) => { console.error('[reqhub-api] metrics server error:', err && err.message); _server = null; });
  _server.listen(port, () => console.log(`[reqhub-api] ai metrics on :${port}/metrics`));
  return _server;
}
