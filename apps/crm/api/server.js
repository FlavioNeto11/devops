const express = require("express");
const { pool } = require("./src/db");
const { migrate } = require("./src/migrate");
const { seed } = require("./src/seed");
const companiesRouter = require("./src/routes/companies");
const contactsRouter = require("./src/routes/contacts");
const dealsRouter = require("./src/routes/deals");

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json());

// Traefik faz StripPrefix do prefixo completo; as rotas ficam na raiz.
app.get("/health", (req, res) => res.json({ status: "ok", db: "connected" }));
app.get("/version", (req, res) => res.json({ app: "crm", service: "api", version: process.env.APP_VERSION || "local", commit: process.env.COMMIT_SHA || "local" }));

app.use("/companies", companiesRouter);
app.use("/contacts", contactsRouter);
app.use("/deals", dealsRouter);

app.use((err, req, res, _next) => {
  console.error("[crm-api] error", err.message);
  res.status(500).json({ error: "internal server error" });
});

async function start() {
  await migrate(pool);
  await seed(pool);
  app.listen(PORT, () => console.log("[crm-api] porta " + PORT));
}

start().catch((err) => {
  console.error("[crm-api] startup error", err);
  process.exit(1);
});

module.exports = { app, pool };
