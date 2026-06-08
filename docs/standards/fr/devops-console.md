# FR — DevOps Console (+ módulo Projetos & Tarefas)

- **Rota**: `/devops` · **Repo**: `console/` · **Stack**: Node 20 + Express (read-only k8s) / React 18 + Vite · **Estado**: observação pronta; módulo PM em construção (Fase 3)

## Propósito
Painel de observação **somente leitura** do cluster (pods, deployments, rotas, eventos, logs,
publicações) — e, a partir da Fase 3, o **meta-projeto**: gestão do fluxo de desenvolvimento dos
apps (bugs/features/evoluções + tasks com começo-meio-fim, pronto vs falta por projeto).

## Atores
Operadores da plataforma; (módulo PM) quem gere o desenvolvimento dos projetos.

## Invariante crítico
O backend de cluster (`console/backend`) é **read-only/stateless** (RBAC `console-readonly`:
`get/list/watch`). Escrita e dados do PM ficam num **serviço separado** (`pm-api` + Postgres),
SA **sem ClusterRole** — o PM nunca toca o k8s; o cross-link com dados ao vivo é feito no frontend.

## Estado (pronto vs falta)  ← seed do módulo PM

### Pronto
- Abas Overview, Apps, Publicações, Health, Logs; stream SSE ao vivo; agrupamento por `part-of`.
- RBAC mínimo; deploy direto (sem Argo, hoje).

### Falta
- [feature] **Módulo Projetos & Tarefas** (pm-api + Postgres + aba + kanban + cross-link) — P1 (Fase 3)
- [evolution] Trazer o Console para **GitOps** (Argo Application `devops-console`) — P2 (Fase 3)
- [evolution] Ajustar texto do rodapé (cluster read-only; gestão de projetos em módulo dedicado) — P3

## Perguntas em aberto
- Gating de escrita do PM por OIDC (leitura aberta) — confirmar na Fase 3.
