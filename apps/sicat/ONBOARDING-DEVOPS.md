# SICAT — Mapeamento e Onboarding na Esteira DevOps

Documento do estado do **SICAT** (automação de **MTR/CDF/DMR da CETESB-SP**, com camada
de IA — LangChain/LangGraph/OpenAI, AI Control Center, RAG e observabilidade Langfuse)
depois de trazido para o monorepo `C:\devops` (`apps/sicat`) e publicado na plataforma.

> Importado via `git subtree` **squash** (estado atual, sem histórico): o histórico do
> repo legado `FlavioNeto11/sicat` continha uma **GCP API Key vazada** (`.vscode/mcp.json`,
> commit `7e5cbf7`) que o GitHub Push Protection bloqueia. **A chave deve ser rotacionada**
> e o histórico do repo legado limpo (tarefa de segurança à parte).

## 1. Estrutura (monorepo de workspaces npm)

```
apps/sicat/
├── package.json          # raiz: workspaces ["backend","frontend"]
├── backend/              # @ workspace: API + Worker (Node 20 + TS via tsx)
│   ├── src/              #   server.ts (HTTP) · worker.ts (fila) · db/ services/ routes/ ...
│   ├── openapi/  scripts/  tests/  storage/
│   ├── package.json  tsconfig*.json  Dockerfile  .dockerignore
├── frontend/             # @ workspace: SPA Vue 3 + Vuetify + Vite
│   ├── src/  public/  Dockerfile  nginx.conf
├── certs/                # cetesb-chain.pem (CA da CETESB; vai p/ ConfigMap)
├── k8s/                  # manifests da plataforma (+ kustomization p/ Argo)
├── devops.yaml           # contrato da esteira
└── docker-compose.yml    # dev local legado (build ./backend, ./frontend)
```

> `api` e `worker` são o **mesmo código/imagem** (só muda o comando: `npm start` vs
> `npm run worker`). Por isso ficam num único workspace `backend` — separá-los em
> workspaces distintos com `packages/shared` exigiria um passo de build (o `tsx` não
> transpila um pacote `.ts` sob `node_modules`).

## 2. Serviços implantados

| Serviço | Workspace | Stack | Comando | Porta | Rota |
|---|---|---|---|---|---|
| **sicat-api** | backend | Node 20 + Express (tsx) | `npm start` | 8080 | `/sicat/api` (strip) |
| **sicat-worker** | backend | mesma imagem | `npm run worker` | — | — |
| **sicat-frontend** | frontend | Vue 3 + Vuetify (Vite→nginx) | nginx | 80 | `/sicat` (sem strip) |
| **sicat-postgres** | — | postgres:16 (PVC) | — | 5432 | interno |

Namespace `apps`. Labels `app.kubernetes.io/part-of: sicat` (Console agrupa na aba **Apps**).

## 3. Roteamento (Traefik — REGRA DE OURO)

- `/sicat` → **frontend**, **sem strip**, base `/sicat/` (Vite `--base=/sicat/`, router usa
  `import.meta.env.BASE_URL`), **priority 10**. nginx serve assets com **prefixo + alias
  estático** (MIME correto — ver `TROUBLESHOOTING.md` §14).
- `/sicat/api` → **api**, **strip `/sicat/api`** (Middleware `sicat-api-strip`), **priority 30**.
  O app vê as rotas na raiz: `/health`, `/health/system`, `/v1/*` (auth, manifestos, jobs,
  ai-control, conversations, cetesb...). O frontend chama `/sicat/api/v1/...`.
- Hosts: `dev.nvit.com.br` (público via Cloudflare Tunnel) e `xpto.localhost` (dev local).

## 4. Dependências, secrets e config

- **Postgres** (`sicat-postgres`, db `mtr_automation`, PVC `sicat-pgdata`). No boot a api
  roda **migrations + seed** (`AUTO_MIGRATE`/`AUTO_SEED`, idempotente, advisory-lock).
- **Storage** compartilhado api↔worker: PVC `sicat-storage` em `/data/storage` (documentos
  gerados — MTR/CDF).
- **CA CETESB**: `certs/cetesb-chain.pem` → ConfigMap `sicat-certs` → `/opt/certs`
  (`NODE_EXTRA_CA_CERTS`). Necessária só nas chamadas à CETESB (não no boot).
- **Secrets (NÃO versionados)** — criados no cluster a partir do `.env` da máquina:
  - `sicat-config` (`--from-env-file` do `.env`: `OPENAI_*`, `CETESB_*`, `LANGFUSE_*`...),
    injetado via `envFrom`.
  - `sicat-db` (`POSTGRES_*` + `DATABASE_URL` apontando p/ `sicat-postgres`). O Deployment
    sobrescreve `DATABASE_URL` (secretKeyRef) por cima do `envFrom`.
  - Ver placeholders em `k8s/secret.example.yaml`. OpenAI/CETESB são *lazy* (só falham em uso).

## 5. Build & Deploy

```powershell
# Imagens locais (lab):
docker build -t sicat-api:local      -f apps/sicat/backend/Dockerfile  apps/sicat/backend
docker build -t sicat-frontend:local --build-arg VITE_API_BASE_URL=/sicat/api `
  -f apps/sicat/frontend/Dockerfile apps/sicat/frontend

# Secrets/Config/CA (a partir do .env da maquina; idempotente):
kubectl create secret generic sicat-config --from-env-file=C:\GIT\PADILHA\sicat\.env -n apps --dry-run=client -o yaml | kubectl apply -f -
kubectl create configmap sicat-certs --from-file=cetesb-chain.pem=apps/sicat/certs/cetesb-chain.pem -n apps --dry-run=client -o yaml | kubectl apply -f -
# sicat-db: ver k8s/secret.example.yaml (gerar POSTGRES_PASSWORD)

# Manifests (NUNCA aplicar secret.example.yaml):
kubectl apply -f apps/sicat/k8s/postgres.yaml
kubectl apply -f apps/sicat/k8s/backend.yaml -f apps/sicat/k8s/frontend.yaml -f apps/sicat/k8s/ingressroute.yaml
```

**GitOps**: `platform/argocd/apps/sicat.yaml` coloca o app sob Argo CD (usa `k8s/kustomization.yaml`,
que **exclui** o `secret.example.yaml`). Os secrets reais ficam fora do Argo (não são pruned).

## 6. Validação

```powershell
curl.exe -s -o NUL -w "%{http_code}" https://dev.nvit.com.br/sicat/            # 200 (SPA)
curl.exe -s https://dev.nvit.com.br/sicat/api/health                           # {"status":"ok","database":"ok",...}
```

## 7. Pendências / observações

- 🔐 **Rotacionar a GCP API Key** vazada no histórico do repo legado e limpar o histórico.
- IA (chat/AI Control) exige `OPENAI_API_KEY` válida no `sicat-config` (falha só em uso).
- Imagens hoje são `:local`. Para CI/CD, publicar em `ghcr.io/flavioneto11/sicat/{api,frontend}`
  (o `devops.yaml` já referencia esses nomes).
- `docker-compose.yml` é o fluxo de **dev local legado**; produção é o Kubernetes.
