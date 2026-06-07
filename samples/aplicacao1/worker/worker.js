// =============================================================================
// worker.js - Worker de background da aplicacao1
// -----------------------------------------------------------------------------
// - Loop de trabalho: loga "worker tick" a cada 5 segundos (setInterval).
// - Servidor HTTP minimo (modulo nativo "http") apenas para health check:
//   GET /health -> 200 {status:"ok"} (usado pelos probes do Kubernetes).
//
// Este servico NAO e exposto via ingress (expose=false no devops.yaml).
// =============================================================================

const http = require("http");

const PORT = process.env.PORT || 8081;

// ---------------------------------------------------------------------------
// Loop de trabalho.
// ---------------------------------------------------------------------------
setInterval(() => {
  console.log(`[aplicacao1-worker] worker tick - ${new Date().toISOString()}`);
}, 5000);

// ---------------------------------------------------------------------------
// Servidor HTTP minimo para health check.
// ---------------------------------------------------------------------------
const server = http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "not found" }));
});

server.listen(PORT, () => {
  console.log(`[aplicacao1-worker] health server ouvindo na porta ${PORT}`);
});
