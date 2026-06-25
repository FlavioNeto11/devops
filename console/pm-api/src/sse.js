// =============================================================================
// sse.js — helpers de Server-Sent Events do pm-api (espelha o console-backend).
// Usado pelo stream de geração de portal CMS: transmite as ETAPAS (ingest → IA →
// validação → persistência → publicação) ao modal em tempo real.
//
// ATENÇÃO infra: a rota que usa isto NÃO pode passar pelo middleware `compress`
// do Traefik (bufferiza/quebra o stream) — ver console/k8s/pm/pm-ingressroute.yaml
// (IngressRoute dedicada sem compress). O X-Accel-Buffering:no é defesa em profundidade.
// =============================================================================

/** Cabeçalhos padrão de SSE + flush imediato dos headers. */
export function setSseHeaders(res) {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  if (typeof res.flushHeaders === 'function') res.flushHeaders();
}

/** Mantém a conexão viva através de proxies que encerram conexões ociosas. */
export function startSseKeepAlive(res, ms = 15000) {
  const id = setInterval(() => {
    try { res.write(`: keep-alive ${Date.now()}\n\n`); } catch { /* conexão fechada */ }
  }, ms);
  if (id.unref) id.unref();
  return id;
}

/** Escreve um frame SSE nomeado (event + data JSON). Tolerante a conexão fechada (não lança). */
export function writeFrame(res, event, data) {
  try {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data ?? {})}\n\n`);
    return true;
  } catch { return false; }
}
