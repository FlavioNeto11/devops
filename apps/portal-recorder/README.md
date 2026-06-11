# portal-recorder

Captura interativa de portais externos (browser remoto) → contrato normalizado. Genérico para N
portais. Ver [`CLAUDE.md`](./CLAUDE.md) (manual) e [`AGENTS.md`](./AGENTS.md) (fronteiras).

## Contrato de API (envelope `{ data }` / `{ error: { code, message } }`)

```
GET    /health                         → { status, db }                       (nunca falha por DB)

POST   /v1/portals               [w]   { slug, name, entry_url, api_origins?, spa_kind?, notes? }
GET    /v1/portals
GET    /v1/portals/:id

POST   /v1/portals/:id/sessions  [w]   { title? }   → cria sessão + pede start ao recorder
GET    /v1/sessions?portal=&status=&limit=
GET    /v1/sessions/:id
POST   /v1/sessions/:id/stop     [w]   → finaliza (recorder stop)

# A2+: anotações, screenshots, eventos (timeline), normalização → contrato, export.
```
`[w]` = write: exige `Authorization: Bearer ${PORTAL_REC_TOKEN}` (fail-closed: sem token → 503).

## Build / deploy local

```powershell
cd apps/portal-recorder/api ; npm install ; node --test
docker build -t portal-recorder-api:local apps/portal-recorder/api
# criar os Secrets (ver k8s/secret.example.yaml) — portal-recorder-db, portal-recorder-config
kubectl apply -k apps/portal-recorder/k8s            # ou aguardar o Argo
curl http://xpto.localhost/portal-rec/api/health     # → { "status": "ok", "db": true }
```

## Fasamento

- **A1** (este) — api + postgres + health + Argo.
- **A2** — recorder (Playwright) + browser remoto + streaming (CDP screencast + WS).
- **A3** — captura de rede/cookies/screenshot redigidos.
- **A4** — anotações sincronizadas + revisão.
- **A5** — normalização → contrato + export (alimenta `docs/portal-contracts/`).
