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

## Notas
- LangSmith continua possível por app via env (`LANGCHAIN_TRACING_V2=true` + key) — uso pontual de
  debug; o default da plataforma é o Langfuse.
- Postgres dedicado (PVC 2Gi, ns `observability`) — dado de telemetria, separado dos bancos de app.
