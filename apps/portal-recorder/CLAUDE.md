---
title: "portal-recorder — Manual para Claude Code"
status: canonical
applies_to: [portal-recorder]
updated: 2026-06-11
language: pt-BR
---

# portal-recorder — Manual para Claude Code

> **Comece por aqui.** Fronteiras: [`AGENTS.md`](./AGENTS.md). Contrato de API + setup:
> [`README.md`](./README.md). Plataforma: [`../../CLAUDE.md`](../../CLAUDE.md). A camada de contrato
> que consome o que este app captura: [`../../docs/portal-contracts/README.md`](../../docs/portal-contracts/README.md).

## O que é

Plataforma genérica de **captura de portais externos**: abre um portal (ex.: MTR/CETESB) num
**browser remoto** (Chromium via Playwright/CDP) dentro da plataforma, o usuário opera de verdade, e
captura **tudo** (chamadas de API com corpo, cookies, headers, payloads, respostas, DOM, screenshots)
+ **anotações** do que está fazendo. Normaliza em um **contrato de portal** (endpoints/método/payload/
auth) que alimenta `docs/portal-contracts/` e o comparador read-only vs o acesso do SICAT à CETESB.

Na plataforma: `basePath /portal-rec`, namespace `apps`. Frontend em `/portal-rec`; API em
`/portal-rec/api` (strip); WS de streaming em `/portal-rec/stream` (recorder). Contrato:
[`devops.yaml`](./devops.yaml).

## Componentes

| Serviço | Stack | Papel |
|---|---|---|
| **api** | Express ESM puro (clone do ai-control-plane) | CRUD de portais/sessões/anotações/contratos; writes fail-closed (Bearer `PORTAL_REC_TOKEN`); `/health` nunca falha por DB |
| **recorder** | Node ESM + Playwright (base `mcr.microsoft.com/playwright`) | dirige o Chromium efêmero por sessão; captura via CDP; WS de streaming (`Page.startScreencast` + `Input.dispatch`) |
| **frontend** | React + Vite + nginx (clone do console, base `/portal-rec/`) | lista de portais/sessões, tela de captura, revisão |
| **postgres** | postgres:16-alpine + PVC | sessões/eventos/anotações/contratos (capturas redigidas) |

## Regras inegociáveis

- **Segredos REDIGIDOS na origem** (recorder), antes de qualquer escrita: token/cookie/senha/
  recaptcha → `***` + `sha256` (correlação sem expor). Reusa `redactObject`/`sanitizeHeaders` do
  `cetesb-gateway.js`. O banco e o frontend de revisão **nunca** veem segredo cru. Captura crua nunca
  no git — só no Postgres do app (ns `apps`).
- **Sessão de browser efêmera e isolada** (`newContext()` → `context.close()`). Credenciais reais
  trafegam só no Chromium efêmero. `MAX_CONCURRENT_SESSIONS` + idle-TTL (não deixar Chromium órfão).
- **Writes fail-closed** (Bearer `PORTAL_REC_TOKEN`, 503 sem token). Rotas internas (api↔recorder)
  com `RECORDER_INTERNAL_TOKEN`, **não roteadas** no Traefik.

## Armadilhas

- Chromium em container: `--no-sandbox --disable-dev-shm-usage` (ou `/dev/shm` emptyDir Memory).
  Imagem Playwright ~1.5GB → cold start lento; `replicas:1`, `IfNotPresent`.
- 1 contexto por sessão → escala mal (RAM 300–800MB/contexto); limite por `MAX_CONCURRENT_SESSIONS`.
- A rota WS do stream é declarada **à mão** no IngressRoute (priority 40 > api 30 > frontend 10).
- `Network.getResponseBody` falha em respostas grandes/streaming → limitar + `body_truncated` + PVC.

## Como trabalhar aqui

```powershell
cd apps/portal-recorder/api ; npm install ; node --test       # testes puros (sem banco)
docker build -t portal-recorder-api:local apps/portal-recorder/api
# secrets imperativos (ver k8s/secret.example.yaml), depois:
kubectl apply -k apps/portal-recorder/k8s      # ou aguardar o Argo (Application portal-recorder)
curl http://nvit.localhost/portal-rec/api/health
```
