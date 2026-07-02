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

# Contratos (A5 + E3 Forja 4.1):
GET    /v1/contracts?portal=<id|slug>     → lista leve (id, version, created_at, session_id, endpoint_count)
GET    /v1/contracts/:id                  → contrato completo (endpoints com samples redigidos)
GET    /v1/contracts/:id/export           → FORMATO CANÔNICO docs/portal-contracts (manifest +
                                            endpoints SEM sample_request/sample_response)
POST   /v1/contracts/:id/promote  [w]     → PROMOÇÃO p/ o git (padrão forge-launch): a API NÃO
                                            escreve git — dispara repository_dispatch
                                            `portal-contract-promote` com o export no payload
                                            (teto 60KB). Fail-closed em 2 camadas: Bearer
                                            PORTAL_REC_TOKEN E GITHUB_DISPATCH_TOKEN no env
                                            (sem o PAT → 503 claro). O runner valida, escreve
                                            docs/portal-contracts/<slug>/<yyyy-mm-dd>/ + LATEST
                                            e abre PR idempotente (branch portal-contract/<slug>).
```
`[w]` = write: exige `Authorization: Bearer ${PORTAL_REC_TOKEN}` (fail-closed: sem token → 503).

> **Acesso operador-only (OIDC).** Todas as rotas externas (`/portal-rec`, `/portal-rec/api`,
> `/portal-rec/stream`) exigem login via Keycloak — middlewares `console-auth-redirect` (302 na
> navegação) e `console-auth-401` (401 em XHR/WS), reusados do Console (`k8s/ingressroute.yaml`).
> Anônimo não acessa nem leitura. O token Bearer acima é defesa em profundidade nas escritas.

## Build / deploy local

```powershell
cd apps/portal-recorder/api ; npm install ; node --test
docker build -t portal-recorder-api:local apps/portal-recorder/api
# criar os Secrets (ver k8s/secret.example.yaml) — portal-recorder-db, portal-recorder-config
kubectl apply -k apps/portal-recorder/k8s            # ou aguardar o Argo
curl http://nvit.localhost/portal-rec/api/health     # → { "status": "ok", "db": true }
```

## Fasamento

- **A1** (este) — api + postgres + health + Argo.
- **A2** — recorder (Playwright) + browser remoto + streaming (CDP screencast + WS).
- **A3** — captura de rede/cookies/screenshot redigidos.
- **A4** — anotações sincronizadas + revisão.
- **A5** — normalização → contrato + export (alimenta `docs/portal-contracts/`).
