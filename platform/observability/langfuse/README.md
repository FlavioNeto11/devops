# Langfuse (observabilidade de IA da plataforma)

Tracing/custos/datasets das chamadas de IA dos apps (SICAT, GymOps, …). Promovido do
docker-compose do SICAT a serviço da plataforma (re-engenharia da camada de IA, F0).
Instrumentação nos apps via [`@flavioneto11/ai-core`](../../../packages/ai-core/README.md)
(`createAiTracer({ langfuse })`).

## Subir
1. **Secret** (uma vez; valores reais NUNCA em git): copie
   [`secret.example.yaml`](./secret.example.yaml) para fora do repo, preencha
   (`openssl rand -hex 32` para NEXTAUTH_SECRET/SALT) e `kubectl apply -f <copia>.yaml`.
2. **GitOps**: a Application [`langfuse`](../../argocd/apps/langfuse.yaml) aplica este kustomize
   (auto-sync). Manual: `kubectl apply -k platform/observability/langfuse`.
3. **hosts**: adicionar `127.0.0.1 langfuse.localhost` (Next.js não suporta subpath — host
   dedicado, como `traefik.localhost`).

## Acesso
- UI: `http://langfuse.localhost` (login = `INIT_USER_EMAIL`/`INIT_USER_PASSWORD` do secret).
- Apps enviam traces com `PROJECT_PUBLIC_KEY`/`PROJECT_SECRET_KEY` (mesmo secret), baseUrl
  `http://langfuse.observability.svc.cluster.local:3000` (dentro do cluster).
- O init headless (`LANGFUSE_INIT_*`) cria org `nvit` / projeto `nvit-ai` na primeira subida —
  idempotente (não recria se já existir).

## Always-on para os apps da Forja (Forja 4.0 — B4)

Todo produto novo scaffoldado pela Forja nasce com `LANGFUSE_ENABLED=true` +
`LANGFUSE_BASE_URL` apontando para este serviço (emitido por
`specs/forge/scaffold-{gymops,sicat}.mjs`). O tracing só liga de fato quando as chaves
(`LANGFUSE_PUBLIC_KEY`/`LANGFUSE_SECRET_KEY`) existirem no Secret `<produto>-ai` — fail-soft
por design (sem chave, o app roda normal sem traces). O Postgres deste kustomize foi
redimensionado (requests 256Mi / limits 768Mi) para aguentar a ingestão contínua.

**Limitação do Langfuse v2 self-hosted (imagem `langfuse/langfuse:2`):** não há API pública
de criação de organizações/projetos — o init headless (`LANGFUSE_INIT_*`) só provisiona UM
org/projeto na primeira subida. Decisão (revisão adversarial B4): **projeto único
`forge-apps`** para todos os produtos da Forja, segmentado por **tag `app=<produto>`** nos
traces (o `@flavioneto11/ai-core` já envia `metadata.app`). A checagem de custo por app via
API do Langfuse fica para quando migrarmos ao **v3** (que tem Metrics API por projeto); até
lá, custo por app vem do Prometheus (`ai_cost_usd_total{app=...}`, ver job `forge-budget`
em `.github/workflows/ai-evals.yml`).

**Passo do operador (manual, uma vez — nunca automatizado aqui, são segredos):**
1. Na UI (`http://langfuse.localhost`), criar o projeto `forge-apps` na org `nvit`
   (v2 não tem API para isso; alternativa aceitável: reusar o projeto `nvit-ai` do init).
2. Gerar o par de chaves do projeto (Settings → API Keys).
3. Colocar as chaves no Secret `<produto>-ai` de cada app da Forja
   (`kubectl -n apps create secret generic <produto>-ai --from-literal=LANGFUSE_PUBLIC_KEY=... --from-literal=LANGFUSE_SECRET_KEY=... --dry-run=client -o yaml | kubectl apply -f -`)
   — ou via Sealed Secrets para versionar.

## Notas
- LangSmith continua possível por app via env (`LANGCHAIN_TRACING_V2=true` + key) — uso pontual de
  debug; o default da plataforma é o Langfuse.
- Postgres dedicado (PVC 2Gi, ns `observability`) — dado de telemetria, separado dos bancos de app.
