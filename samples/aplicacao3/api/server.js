const express = require("express");
const app = express();
const PORT = process.env.PORT || 8080;
// Traefik faz StripPrefix do prefixo completo; as rotas ficam na raiz.
app.get("/health", (req, res) => res.json({ status: "ok" }));
app.get("/version", (req, res) => res.json({ app: "aplicacao3", service: "api", version: process.env.APP_VERSION || "local", commit: process.env.COMMIT_SHA || "local" }));
app.get("/hello", (req, res) => res.json({ message: "Ola de aplicacao3/api" }));
app.listen(PORT, () => console.log("[aplicacao3-api] porta " + PORT));
