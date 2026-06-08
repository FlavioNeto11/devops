# Plano de Sprints

Sprints de 2 semanas. Sprints 1–8 + camada administrativa de frontend (Sprints 9–16) + modo tutorial guiado (Sprint 17) concluídas.

**Status atual (2026-05-17)**: produto funcionalmente completo + administrável + autodidata via tutorial. Camada de tooling de agentes de IA (Copilot Chat + Claude Code) entregue como sprint técnica adicional. Ver [`docs/status.md`](status.md), [`docs/product-roadmap.md`](product-roadmap.md) e [`docs/tutorial-mode.md`](tutorial-mode.md).

---

## Sprint 17 — Modo Tutorial Guiado (2026-05-17)

✅ Concluída

**Objetivo**: Reduzir a curva de aprendizado para zero — usuário novo entende e opera o sistema sem suporte técnico.

**Entregas**:
- Schema Prisma `TutorialProgress` + enum `TutorialStatus`
- Migration aplicada em Postgres (`tutorial_progress`)
- Backend `apps/api/src/routes/me/tutorial-progress.ts` (GET / PATCH / restart) com RBAC por usuário
- Camada frontend `apps/web/src/features/tutorial/` (12 arquivos):
  - registry declarativo com 15 tutoriais cobrindo módulos A–O
  - overlay com highlight + posicionamento responsivo
  - hook `useTutorial` com auto-pular passos sem target, ESC, persistência
  - `TutorialTrigger` reutilizável (esconde se papel não tem acesso)
  - `TutorialProvider` em `(app)/layout.tsx`
  - `OnboardingPrompt` (convite canto inferior direito)
  - Central de Ajuda em `/help` com busca, filtros por categoria, progresso e reiniciar
- `data-tutorial` em 25+ targets distribuídos pelas telas reais (sem alterar comportamento)
- Botão "Ver tutorial" no header de: dashboard, /me, unit, activity drawer, profile, settings, integrações, import wizard, templates, team, units, areas, organization, audit, recurrences, imports admin, central de atividades
- Botão "Ajuda" persistente no sidebar + topbar mobile
- Documentação completa em [`docs/tutorial-mode.md`](tutorial-mode.md)
- Testes Vitest cobrindo GET/PATCH/restart, isolamento por usuário e validação
- Smoke Playwright para fluxos de Help Center e overlay

**Limitações conhecidas**:
- E2E completo de fluxos visuais (mobile específico, RBAC por papel viewer) deixado para validação manual
- Tutorial não dispara navegação automática entre rotas — sugere via `route`/`actionHint`; usuário decide

---

## Sprint técnica — Infraestrutura de agentes e base de conhecimento (2026-05-16)

✅ Concluída

**Objetivo**: Acelerar Sprints 9–16 (e ciclos futuros) padronizando como Claude Code e Copilot Chat trabalham no projeto, com instruções compartilhadas, prompts reutilizáveis e perfis especialistas versionados.

**Não é sprint de produto** — não adiciona funcionalidade ao usuário final.

**Entregas**:
- `AGENTS.md` — contrato interoperável raiz
- `.github/copilot-instructions.md` — instruções globais Copilot
- `.github/instructions/*.instructions.md` (7 arquivos path-specific)
- `.github/prompts/*.prompt.md` (10 prompts reutilizáveis)
- `.github/agents/*.agent.md` (9 perfis especialistas)
- `docs/agent-skills/*.md` (10 skills procedurais)
- `docs/ai-agent-operating-model.md`, `docs/ai-knowledge-base.md`, `docs/agent-task-routing.md`, `docs/how-to-use-ai-agents.md`
- `.vscode/settings.json` + `.vscode/extensions.json` ajustados
- `CLAUDE.md` atualizado apontando para `AGENTS.md` e seção "Sinergia com Copilot Chat"
- `README.md` com seção "Uso de agentes de IA no desenvolvimento"
- `docs/status.md` com seção "Infraestrutura de agentes"

**Resultado**: pedir "executa a sprint X", "cria endpoint Y", "atualiza RBAC Z" segue um fluxo padronizado em ambos os agentes, com leitura de contexto, validação obrigatória e relatório final estruturado.

---

## Resumo executivo

| Sprint | Escopo | Resultado | Estado |
|--------|--------|-----------|--------|
| **Sprint 1** | Auth, Org/Unit/Area, RBAC base, design system | Usuário entra, vê estrutura, navega | ✅ Concluída |
| **Sprint 2** | Atividades, Checklist, Comentários, Anexos, Histórico | Produto substitui Trello em uso básico | ✅ Concluída |
| **Sprint 3** | RBAC completo, Visão pessoal, Visão unidade, Painel geral | Serve gestor, executor e supervisão | ✅ Concluída |
| **Sprint 4** | Templates, Recorrência, E-mail, Web Push | Rotina operacional com tração real | ✅ Concluída |
| **Sprint 5** | Importador Trello, WhatsApp essencial | Migração e onboarding | ✅ Concluída |
| **Sprint 6** | IA estruturada + Mobile completo | MVP superior ao Trello no uso diário | ✅ Concluída |
| **Sprint 7** | R2, OAuth Google, notificações, recorrência UI, workers, testes API | Todos os módulos funcionais implementados | ✅ Concluída |
| **Sprint 8** | Hardening: segurança, CI/CD, E2E, worker separado, atomicidade | MVP pronto para piloto | ✅ Concluída |
| **Sprint 9** | Perfil do usuário, Gestão da organização, Gestão de templates | Self-service básico + WhatsApp desbloqueado | 🔵 Próxima |
| **Sprint 10** | Gestão de unidades, Gestão de áreas por unidade | Expansão autônoma da operação | ⬜ Planejada |
| **Sprint 11** | Equipe e permissões, convites reais com token | Onboarding sem suporte técnico | ⬜ Planejada |
| **Sprint 12** | Central global de atividades + ações em lote | Cockpit de gestão transversal | ⬜ Planejada |
| **Sprint 13** | Centro de importações + ajustes Trello admin | Migração como processo administrável | ⬜ Planejada |
| **Sprint 14** | Centro de recorrências + notificações/logs + WhatsApp | Operação contínua + troubleshooting | ⬜ Planejada |
| **Sprint 15** | Observabilidade, refatoração, E2E por critérios de negócio | Qualidade e confiança para escala | ⬜ Planejada |
| **Sprint 16** | Hardening final, onboarding, preparação comercial | Produto pronto para expansão | ⬜ Planejada |

---

## Sprints 1–8 (Concluídas)

### Sprint 1 — Fundação e estrutura ✅

Auth email/senha, JWT refresh, Org/Unit/Area CRUD, memberships, design system, sidebar responsiva, seed de áreas padrão.

### Sprint 2 — Atividade como núcleo ✅

Activities CRUD, checklists, comentários, anexos (presign), histórico de eventos, `isOverdue`, filtros por área/status/prioridade.

### Sprint 3 — RBAC e visões ✅

`resolvePermission` em todos os endpoints, herança de escopo, Visão Pessoal, Visão por Unidade, Painel Geral, `visibility_mode = restricted`, compartilhamento de atividade.

### Sprint 4 — Templates, recorrência e notificações ✅

Templates CRUD + pré-preenchimento, RecurrenceRule schema + worker, mailer.ts, web-push VAPID, notification-worker com crons 08h/09h, tela /settings/notifications.

### Sprint 5 — Importador Trello e WhatsApp ✅

Schema import_jobs/import_items, processador Trello (dry-run + area-matcher), wizard de mapeamento, WhatsApp via Twilio, lib/crypto.ts AES-256-GCM, /settings/integrations.

### Sprint 6 — IA estruturada e Mobile ✅

OpenAI SDK + callAI com fallback, 4 endpoints `/ai/*` com rate limit, AiDraftDialog, ChecklistSuggestPanel, DelayAnalysisModal, DailySummaryBadge, responsividade completa mobile.

### Sprint 7 — Fechar gaps de implementação ✅

R2Client inline, Google OAuth fetch nativo, notification-worker integrado, POST/DELETE /recurrence, delay-scan-worker, ai-summary-worker, seed 24 templates, testes de integração vitest (6 suítes).

### Sprint 8 — Hardening para produção ✅

**P0 — Segurança:**
- RBAC em endpoints de IA (`resolveActivityPermission`)
- `assertImportAccess` em todas as rotas de import
- Token JWT fora do localStorage (memória + interceptor 401)
- Google OAuth callback via cookie httpOnly, sem `?token=` na URL
- `ENCRYPTION_KEY` obrigatória: regex `/^[0-9a-fA-F]{64}$/` + erro fatal em produção
- CI: `.github/workflows/ci.yml` — lint + typecheck + test + build

**P1 — Confiabilidade:**
- `apps/api/src/worker-process.ts` separado; serviço `worker` no docker-compose
- Playwright E2E: 5 specs + `.github/workflows/e2e.yml`
- Commit do importador: `db.$transaction({ maxWait: 30s, timeout: 120s })` — rollback total
- Membership check em GET /imports, GET /integrations, GET /integrations/trello/boards
- Trello OAuth: fluxo implícito formalizado com AES-256-GCM
- Import progress: counter falso removido; relatório final com summary

---

## Sprint 9 — Perfil + Organização + Templates admin

**Objetivo**: Desbloquear self-service básico. Ao fim, gestor edita perfil, configura a organização e mantém templates sem intervenção técnica.

Ver [`tasks/sprint-9.md`](../tasks/sprint-9.md) para detalhamento completo.

### Entregas principais
- `PATCH /me/profile` + tela de Perfil do usuário (nome, avatar, telefone, timezone)
- Tela de Gestão da organização (nome, logo, slug, políticas)
- Tela de Gestão de templates com CRUD completo e preview no form de nova atividade

### Resultado de negócio
- Usuário cadastra telefone → WhatsApp pode ser habilitado e testado
- Owner edita branding sem precisar de seed ou banco
- Templates administráveis sem precisar de seed

---

## Sprint 10 — Unidades + Áreas

**Objetivo**: Gestor cria e administra a estrutura operacional da organização pela interface.

Ver [`tasks/sprint-10.md`](../tasks/sprint-10.md) para detalhamento.

### Entregas principais
- Tela de Gestão de unidades (criar, editar, ativar/inativar, dashboard admin)
- Tela de Gestão de áreas (criar, vincular por unidade, reordenar)
- `PATCH /units/:id/areas/reorder` (endpoint de reordenação)

### Resultado de negócio
- Expansão de unidades feita pela UI; sem seed manual
- Mapa operacional da rede visível e editável

---

## Sprint 11 — Equipe e permissões

**Objetivo**: Owner convida, gerencia e revoga acessos sem depender de suporte técnico.

Ver [`tasks/sprint-11.md`](../tasks/sprint-11.md) para detalhamento.

### Entregas principais
- Fluxo de convites com token (`Invitation` model, `POST /invitations`, e-mail transacional)
- Tela de Gestão de equipe (tabela de membros, convidar, alterar papel, revogar)
- Fluxo de aceite de convite (`/invite/:token`)
- Matriz de permissões visualizável por unidade/área

### Resultado de negócio
- Onboarding de novos usuários 100% self-service
- Owner revoga acesso e efeito é imediato

---

## Sprint 12 — Central global de atividades

**Objetivo**: Liderança tem cockpit transversal para acompanhar e operar toda a organização.

Ver [`tasks/sprint-12.md`](../tasks/sprint-12.md) para detalhamento.

### Entregas principais
- Tela Central Global de Atividades com busca textual, filtros avançados, paginação
- Ações em lote (status, prioridade, prazo, responsável)
- Filtros salvos por usuário (`SavedView` model)
- Fila de aprovações integrada (`aguardando_aprovacao`)
- `POST /activities/bulk-update`, `POST /activities/bulk-assign`, `GET/POST /saved-views`

### Resultado de negócio
- Qualquer atividade encontrável em <3 interações
- Ação em lote elimina trabalho repetitivo de gestão

---

## Sprint 13 — Centro de importações + Trello admin

**Objetivo**: Transformar o importador Trello em processo administrável, auditável e repetível.

Ver [`tasks/sprint-13.md`](../tasks/sprint-13.md) para detalhamento.

### Entregas principais
- Tela Centro de importações (histórico de jobs, status, relatório)
- Retry/cancel de jobs (`POST /imports/:id/retry`, `POST /imports/:id/cancel`)
- Itens detalhados por job (`GET /imports/:id/items`)
- Health check de integração Trello (`GET /integrations/trello/health`)
- Reconnect de integração (`POST /integrations/trello/reconnect`)

### Resultado de negócio
- Migração de 300 boards Trello auditável e sem suporte manual
- Falhas de import reprocessáveis sem reiniciar do zero

---

## Sprint 14 — Recorrências + Notificações/Logs + WhatsApp

**Objetivo**: Fechar operação contínua e dar visibilidade de troubleshooting ao time.

Ver [`tasks/sprint-14.md`](../tasks/sprint-14.md) para detalhamento.

### Entregas principais
- Tela Centro de recorrências (listar regras, pausar, editar, ver próxima execução)
- Delivery log de notificações (`NotificationDelivery` model, `GET /notifications/deliveries`)
- Tela Centro de notificações e logs
- `POST /notifications/test` implementado para whatsapp
- `GET /integrations/whatsapp/status` (sandbox vs produção)
- Validação de telefone no perfil antes de habilitar WhatsApp

### Resultado de negócio
- Falhas de notificação visíveis e diagnosticáveis sem acesso a logs de servidor
- WhatsApp testável e validável pela UI

---

## Sprint 15 — Observabilidade, qualidade e E2E

**Objetivo**: Produto confiável para escala e auditável por times de engenharia.

Ver [`tasks/sprint-15.md`](../tasks/sprint-15.md) para detalhamento.

### Entregas principais
- Sentry (ou equivalente) integrado em API e Web
- Métricas de fila BullMQ expostas
- Reescrever suíte Playwright pelos critérios de aceite em [`docs/e2e-business-flows.md`](e2e-business-flows.md)
- Extrair services/use-cases de arquivos grandes (activities, imports, ActivityDrawer)
- Polimento UX: estados vazios, feedback transacional, acessibilidade básica (a11y)
- Índices compostos finos no Postgres para volumes SkyFit (~300 boards, ~10k atividades)

### Resultado de negócio
- SLA rastreável em piloto
- Regressões detectadas antes de chegarem em produção

---

## Sprint 16 — Hardening final e preparação comercial

**Objetivo**: Produto pronto para expansão além do piloto SkyFit.

Ver [`tasks/sprint-16.md`](../tasks/sprint-16.md) para detalhamento.

### Entregas principais
- Onboarding de nova organização self-service (wizard de setup)
- Documentação de usuário (guia rápido, FAQ)
- Auditoria trail completa para ações administrativas sensíveis
- Preparação de billing/Stripe (modelo de dados, não implementação ainda)
- Rotação de credenciais de integração (Trello, WhatsApp)
- Exportação básica: CSV de atividades por unidade

### Resultado de negócio
- Segundo cliente pode entrar no sistema sem intervenção do time de engenharia
- Dados básicos exportáveis para compliance e relatórios manuais

---

## Pós-Sprint 16 (backlog)

| Feature | Por que adiar |
|---|---|
| Stripe billing completo | Não bloqueia expansão para clientes adicionais no início |
| Google Drive / OneDrive | Útil, mas upload para R2 atende o MVP |
| App nativo iOS/Android | PWA atende; custo operacional alto |
| Workflow builder visual | Complexidade de produto prematura |
| OCR/RAG em anexos | Não essencial para substituir Trello |
| Busca full-text pgvector | Schema pronto; implementar quando volume exigir |
| Múltiplos idiomas (i18n) | Não bloqueia lançamento no Brasil |
| Menções @usuário em comentários | Útil, não crítico para MVP |
