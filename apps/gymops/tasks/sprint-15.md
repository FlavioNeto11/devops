# Sprint 15 — Observabilidade, Qualidade e E2E

**Objetivo**: Produto confiável para escala com rastreabilidade de erros e suíte E2E alinhada com critérios de negócio.  
**Resultado de negócio**: SLA rastreável em piloto; regressões detectadas antes de chegarem em produção.  
**Duração**: 2 semanas

---

## Observabilidade

### Sentry

- [ ] Instalar `@sentry/node` na API Fastify
  - Init no startup: `Sentry.init({ dsn, environment: process.env.NODE_ENV, release: process.env.GIT_SHA })`
  - Capturar exceções não tratadas e erros de handler
  - Adicionar contexto: `userId`, `organizationId` nos requests autenticados
  - Não enviar em `NODE_ENV === 'test'`
- [ ] Instalar `@sentry/nextjs` no web app
  - `sentry.client.config.ts` e `sentry.server.config.ts`
  - Capturar erros de página e de API calls
- [ ] Adicionar `SENTRY_DSN` ao schema de env (opcional, não obrigatório para rodar)
- [ ] Adicionar `SENTRY_DSN` ao `.env.docker` e à documentação de deploy

### Métricas de fila BullMQ

- [ ] `GET /admin/queues/stats` (com auth de owner)
  - Retornar: fila por nome, waiting/active/completed/failed/delayed
  - Usar `queue.getJobCounts()` do BullMQ
- [ ] Adicionar seção "Saúde dos workers" em `/settings/organization` (owner only)
  - Exibir contagens por fila: import-jobs, notification-jobs, recurrence-jobs, ai-summary-jobs, delay-scan-jobs

---

## Refatoração de arquivos grandes

> Regra: não alterar comportamento, apenas organizar. Cobrir com testes antes de refatorar.

- [ ] Extrair services de `apps/api/src/routes/activities/index.ts`:
  - `ActivityService.create()`, `ActivityService.update()`, `ActivityService.list()`
  - Manter handlers como thin controllers (validação Zod → chamar service → retornar)
- [ ] Extrair services de `apps/api/src/imports/trello/processor.ts`:
  - `ImportCommitService.commit()`, `ImportDryRunService.run()`
- [ ] Extrair componentes de `apps/web/src/components/ActivityDrawer.tsx` (se >500 linhas):
  - `ActivityDrawerChecklist`, `ActivityDrawerComments`, `ActivityDrawerHistory`
  - Manter `ActivityDrawer` como orquestrador

---

## Suíte E2E (Playwright)

Reescrever a partir dos critérios em [`docs/e2e-business-flows.md`](../docs/e2e-business-flows.md).

### Infraestrutura de testes

- [ ] Criar `e2e/fixtures/seed.ts` — setup de dados por spec
- [ ] Configurar `storageState` no Playwright para reutilizar auth sem re-login entre specs
- [ ] Configurar Mailpit (ou Ethereal) como SMTP stub para testes de e-mail
- [ ] Garantir isolamento: cada spec limpa/cria seus dados (não depender de dados globais)

### Specs a reescrever/criar

- [ ] `e2e/auth.spec.ts` — Fluxo 1 completo (login, refresh, logout)
- [ ] `e2e/rbac.spec.ts` — Fluxo 3 (RBAC por papel, acesso sem auth, não-membro)
- [ ] `e2e/activity.spec.ts` — Fluxo 2 (criar com template, alterar status, checklist)
- [ ] `e2e/import.spec.ts` — Fluxo 4 (importação JSON completa)
- [ ] `e2e/team.spec.ts` — Fluxo 5 (convite, aceite, revogação)
- [ ] `e2e/dashboard.spec.ts` — Fluxo 6 (painel geral, visão pessoal)

### CI

- [ ] Verificar que `e2e.yml` roda as specs reescritas
- [ ] Garantir que specs novas não fazem chamadas reais a APIs externas (Trello, Twilio, OpenAI)

---

## Polimento UX e Acessibilidade

- [ ] **Estados vazios**: toda listagem deve ter estado vazio com ícone + texto + CTA
  - Ex: "/settings/units" sem unidades → "Nenhuma unidade cadastrada. [Criar primeira unidade]"
- [ ] **Feedback transacional**: spinner em botões de submit; desabilitar botão enquanto carrega
- [ ] **Acessibilidade básica**:
  - Todos os botões de ícone com `aria-label`
  - Inputs com `label` associado (`htmlFor`)
  - Foco visível em todos os elementos interativos (não remover `outline`)
  - Verificar contraste de cores: mínimo WCAG AA
- [ ] **Toasts**: consolidar uso de toast (sucesso em verde, erro em vermelho, aviso em amarelo)
- [ ] **Loading skeletons**: substituir spinners globais por skeletons nas listas principais

---

## Performance

- [ ] Revisar índices no Postgres para consultas frequentes:
  - `activities(organization_id, status, due_at)` — filtro principal da central de atividades
  - `activities(organization_id, unit_id, area_id)` — visão por unidade
  - `memberships(user_id, organization_id, deleted_at)` — RBAC
  - `import_jobs(organization_id, status, created_at)` — centro de importações
- [ ] Analisar queries N+1 nos endpoints de lista (usar `include` Prisma ao invés de múltiplos `findFirst`)

---

## Testes

- [ ] Cobertura de testes de integração: verificar quais endpoints ainda não têm test
- [ ] Adicionar testes para endpoints adicionados nas Sprints 9–14

---

## Critérios de aceite

- [ ] Errors em produção aparecem no Sentry com contexto de userId e organizationId
- [ ] Suíte E2E completa passa no CI sem falsos positivos
- [ ] Todos os botões de ícone têm `aria-label` (verificar com axe-playwright)
- [ ] Toda listagem tem estado vazio com CTA
- [ ] Tempo de resposta de `GET /activities` com 1000 atividades: <200ms (medir com `explain analyze`)

---

## Pitfalls conhecidos

- Refatoração: nunca alterar comportamento junto com estrutura na mesma PR — primeiro cobrir com testes, depois refatorar
- Sentry: não enviar dados sensíveis (senhas, tokens, `auth_jsonb`) — revisar `beforeSend` hook
- E2E isolamento: specs que dependem de e-mail transacional precisam de Mailpit rodando localmente e no CI
- Estados vazios: verificar edge cases — lista que nunca tem dados vs lista que ainda não carregou
