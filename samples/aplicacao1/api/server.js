// =============================================================================
// server.js - API (Express) da aplicacao1
// -----------------------------------------------------------------------------
// Como o Traefik aplica StripPrefix /aplicacao1/api, as rotas dentro do
// container ficam na RAIZ. Exemplos do ponto de vista do cliente -> backend:
//   /aplicacao1/api/health  -> /health
//   /aplicacao1/api/version -> /version
//   /aplicacao1/api/hello   -> /hello
//
// Por isso registramos as rotas em "/health", "/version", "/hello" (sem prefixo).
// =============================================================================

const express = require("express");

const app = express();
const PORT = process.env.PORT || 8080;

// Health check (usado por liveness/readiness probes do Kubernetes).
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// Versao da aplicacao (preenchida via env no build/deploy; fallback "local").
app.get("/version", (req, res) => {
  res.json({
    app: "aplicacao1",
    service: "api",
    version: process.env.APP_VERSION || "local",
    commit: process.env.COMMIT_SHA || "local",
  });
});

// Endpoint de exemplo.
app.get("/hello", (req, res) => {
  res.json({ message: "Ola da API da aplicacao1" });
});

app.listen(PORT, () => {
  console.log(`[aplicacao1-api] ouvindo na porta ${PORT}`);
});
