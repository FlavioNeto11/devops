# ai-control-plane — governança de IA da plataforma

Serviço **API-only + Postgres próprio** que centraliza a governança de IA dos apps
(SICAT/GymOps), entregue na **F5 da re-engenharia de IA**:

- **Prompts versionados** com promote/rollback (versão ativa por prompt + histórico);
- **Rollup de feedback** (thumbs up/down) enviado pelos apps;
- **Registro de eval runs** (resultados dos golden sets / CI dos apps).

Exposto em **`/ai-control/api`** (basePath `/ai-control`, API com StripPrefix —
o processo vê as rotas na raiz). Contrato da esteira: [`devops.yaml`](./devops.yaml).

## Regra de design — FORA do caminho crítico

Os apps consomem este serviço **no boot, com cache + fallback local** (prompt
embarcado no código continua sendo o fallback). Se o ai-control-plane (ou o
Postgres dele) cair, **nada quebra** nos apps:

- O boot da API **não depende do banco**: a migration roda em background com
  retry/backoff; `/health` sempre responde (`db: false` enquanto o banco não vier).
- Leituras são públicas (dentro do cluster/host); **escritas exigem token** —
  e sem `AI_CONTROL_PLANE_TOKEN` configurado as escritas retornam `503`
  (fail-closed, nunca aberto por engano).

## Contrato de API

Todas as respostas em JSON: sucesso `{ data }`, erro `{ error: { code, message } }`.
Escritas (`POST`) exigem `Authorization: Bearer ${AI_CONTROL_PLANE_TOKEN}`.

| Método | Rota (pós-strip) | Auth | Descrição |
|---|---|---|---|
| GET | `/health` | — | `{ status:'ok', db:true\|false }` (db best-effort; não falha com banco fora) |
| GET | `/v1/prompts` | — | lista prompts: `{ name, description, activeVersion\|null, versionsCount }` |
| GET | `/v1/prompts/:name/active` | — | versão ativa (`404 PROMPT_NOT_FOUND` / `404 NO_ACTIVE_VERSION`) |
| GET | `/v1/prompts/:name/versions` | — | histórico desc por `version` |
| POST | `/v1/prompts/:name/versions` | Bearer | body `{ promptText*, label?, createdBy?, activate?, description? }` → `201`; cria o prompt se não existir; `version = max+1` |
| POST | `/v1/prompts/:name/activate` | Bearer | body `{ versionId*, confirmed: true }` (senão `400 CONFIRMATION_REQUIRED`); retorna `previous` (versão ativa anterior) para rollback fácil |
| POST | `/v1/feedback` | Bearer | body `{ app*, kind* ('thumbs_up'\|'thumbs_down'), surface?, refId?, toolName?, comment?, metadata? }` → `201` |
| GET | `/v1/feedback/summary?app=&days=7` | — | `{ byKind, byApp, total }` (agregação SQL) |
| POST | `/v1/eval-runs` | Bearer | body `{ app*, mode* ('sample'\|'full'\|'graph'\|'mock'\|'ci'), total*, passed*, failed*, kpis?, metadata? }` → `201` (`passRate` calculado) |
| GET | `/v1/eval-runs?app=&limit=20` | — | lista desc por `created_at` |
| GET | `/v1/overview` | — | `{ prompts, promptVersions, feedback7d: {up,down}, lastEvalRuns[..5] }` |

Externamente as rotas ficam sob o prefixo: `http://xpto.localhost/ai-control/api/...`
(também em `https://dev.nvit.com.br/ai-control/api/...`).

### Exemplos

```powershell
# leitura (sem auth)
curl http://xpto.localhost/ai-control/api/health
curl http://xpto.localhost/ai-control/api/v1/prompts/gymops.chat.system/active

# escrita (Bearer token do secret ai-control-plane-config)
curl -X POST http://xpto.localhost/ai-control/api/v1/prompts/gymops.chat.system/versions `
  -H "Authorization: Bearer $token" -H "Content-Type: application/json" `
  -d '{ "promptText": "You are the GymOps assistant...", "label": "v2", "activate": true }'

# promote/rollback (confirmação explícita obrigatória)
curl -X POST http://xpto.localhost/ai-control/api/v1/prompts/gymops.chat.system/activate `
  -H "Authorization: Bearer $token" -H "Content-Type: application/json" `
  -d '{ "versionId": "pv_abc123", "confirmed": true }'
```

## Desenvolvimento local

```powershell
cd apps/ai-control-plane/api
npm install
node --test            # testes das funções puras (sem banco)

# subir local (sem banco o processo NÃO crasha; /health responde db:false)
$env:DATABASE_URL = 'postgresql://aicontrol:dev@localhost:5432/ai_control_plane'
$env:AI_CONTROL_PLANE_TOKEN = 'dev-token'
node src/index.js
```

## Build e deploy (lab local)

```powershell
# 1) build da imagem local (sem registry)
docker build -t ai-control-plane-api:local apps/ai-control-plane/api

# 2) criar os secrets (uma vez, fora do git — instruções completas em
#    k8s/secret.example.yaml)
$pw = -join ((48..57)+(97..122) | Get-Random -Count 24 | ForEach-Object {[char]$_})
kubectl -n apps create secret generic ai-control-plane-db `
  --from-literal=POSTGRES_USER=aicontrol `
  --from-literal=POSTGRES_PASSWORD=$pw `
  --from-literal=POSTGRES_DB=ai_control_plane `
  --from-literal=DATABASE_URL="postgresql://aicontrol:$pw@ai-control-plane-postgres:5432/ai_control_plane"
$token = -join ((48..57)+(97..122) | Get-Random -Count 32 | ForEach-Object {[char]$_})
kubectl -n apps create secret generic ai-control-plane-config `
  --from-literal=token=$token

# 3) aplicar os manifests (ou deixar o Argo sincronizar via GitOps)
kubectl apply -k apps/ai-control-plane/k8s

# 4) validar
curl http://xpto.localhost/ai-control/api/health
```

GitOps: [`platform/argocd/apps/ai-control-plane.yaml`](../../platform/argocd/apps/ai-control-plane.yaml)
(`prune: false` — secrets imperativos; `selfHeal: true`). O `kustomization.yaml`
exclui o `secret.example.yaml` de propósito.

## Estrutura

```
api/
  src/index.js    # bootstrap: HTTP sobe já; migrate() em background com retry
  src/db.js       # pool pg + migrate() idempotente + ping com teto de espera
  src/auth.js     # Bearer p/ writes; sem token configurado -> writes 503
  src/routes.js   # rotas /health, /v1/prompts*, /v1/feedback*, /v1/eval-runs, /v1/overview
  src/store.js    # validadores/normalizadores PUROS + funções SQL (pool injetado)
  test/store.test.js  # node:test, sem banco
k8s/              # postgres.yaml, api.yaml, ingressroute.yaml (+ secret.example.yaml fora do kustomize)
```
