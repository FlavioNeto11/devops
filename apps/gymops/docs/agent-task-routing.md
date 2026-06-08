# Matriz de Roteamento de Tarefas → Agentes — GymOps

**Última atualização**: 2026-05-16

> **Propósito**: Quando o usuário pede algo, qual agente deve coordenar, quais especialistas envolver, qual prompt usar e quais skills aplicar.

---

## Como usar esta matriz

1. Identifique o **verbo + objeto** do pedido ("criar tela admin", "alterar permissão", "corrigir CI")
2. Encontre a linha correspondente abaixo
3. Use o agente principal como condutor
4. Acione os especialistas auxiliares quando entrar na camada deles
5. Siga o prompt aplicável como roteiro
6. Use as skills como procedimentos reutilizáveis

---

## Matriz por verbo

### Criar / Implementar

| Tarefa | Agente principal | Auxiliares | Prompt | Skills |
|---|---|---|---|---|
| Criar tela administrativa | `product-admin` → `frontend-next` | `backend-fastify` (se faltar endpoint), `rbac-security` | `implement-admin-screen` | read-context, plan, create-admin-ui, validate-rbac, run-validation, update-docs, final-report |
| Criar endpoint Fastify | `backend-fastify` | `rbac-security`, `database-prisma` (se schema) | `add-api-endpoint` | read-context, plan, create-fastify-endpoint, run-validation, update-docs, final-report |
| Criar migration Prisma | `database-prisma` | `backend-fastify` (se afeta rotas) | — | read-context, create-prisma-migration, run-validation, update-docs |
| Criar integração externa | `integrations` | `backend-fastify`, `database-prisma`, `frontend-next` | — | read-context, plan, create-fastify-endpoint, update-docs, final-report |
| Criar teste E2E | `testing-e2e` | `frontend-next` (data-testid) | `create-e2e-flow` | read-context, create-playwright-e2e, run-validation, update-docs |
| Criar componente reusável | `frontend-next` | — | — | read-context, run-validation |
| Implementar sprint inteira | `gymops-orchestrator` | todos conforme escopo | `implement-sprint` | TODAS |

### Alterar

| Tarefa | Agente principal | Auxiliares | Prompt | Skills |
|---|---|---|---|---|
| Alterar regra de RBAC | `rbac-security` | `backend-fastify`, `frontend-next`, `testing-e2e`, `docs-roadmap` | `update-rbac` | read-context, validate-rbac, run-validation, update-docs, final-report |
| Alterar contrato de endpoint | `backend-fastify` | `frontend-next` (consumidor), `docs-roadmap` | `add-api-endpoint` | read-context, plan, create-fastify-endpoint, run-validation, update-docs |
| Alterar schema Prisma | `database-prisma` | `backend-fastify`, `docs-roadmap` | — | read-context, create-prisma-migration, run-validation, update-docs |
| Alterar permissão de tela | `rbac-security` → `frontend-next` | `docs-roadmap` | `update-rbac` | read-context, validate-rbac, run-validation, update-docs |
| Alterar copy/labels | `product-admin` → `frontend-next` | — | — | read-context, run-validation |
| Alterar fluxo OAuth | `integrations` | `rbac-security`, `backend-fastify` | `review-security` | read-context, run-validation, update-docs |

### Corrigir

| Tarefa | Agente principal | Auxiliares | Prompt | Skills |
|---|---|---|---|---|
| Corrigir falha de CI (lint/typecheck/test/build) | `testing-e2e` ou camada afetada | — | `fix-ci` | run-validation, final-report |
| Corrigir bug funcional | Camada do bug (frontend/backend) | `testing-e2e` (adicionar teste regressão) | — | read-context, run-validation, update-docs |
| Corrigir desalinhamento RBAC | `rbac-security` | `backend-fastify`, `frontend-next` | `update-rbac` | read-context, validate-rbac, run-validation, update-docs |
| Corrigir tela quebrada em mobile | `frontend-next` | `product-admin` (se UX impactada) | — | read-context, run-validation |
| Corrigir migration órfã / TRUNCATE | `database-prisma` → `testing-e2e` | — | — | create-prisma-migration, run-validation |

### Revisar

| Tarefa | Agente principal | Auxiliares | Prompt | Skills |
|---|---|---|---|---|
| Revisar segurança | `rbac-security` | `backend-fastify`, `integrations` | `review-security` | read-context, validate-rbac, run-validation, final-report |
| Revisar permissões end-to-end | `rbac-security` | `backend-fastify`, `frontend-next`, `testing-e2e` | `review-security` | validate-rbac, run-validation, final-report |
| Revisar PR | (humano + agente da camada) | — | `prepare-pr-summary` | run-validation, final-report |

### Refatorar

| Tarefa | Agente principal | Auxiliares | Prompt | Skills |
|---|---|---|---|---|
| Refatorar arquivo grande | Camada do arquivo | `testing-e2e` (garantir não regressão) | `refactor-large-file` | read-context, run-validation, final-report |
| Extrair componente reusável | `frontend-next` | — | `refactor-large-file` | run-validation |
| Extrair handler Fastify | `backend-fastify` | — | `refactor-large-file` | run-validation |

### Documentar

| Tarefa | Agente principal | Auxiliares | Prompt | Skills |
|---|---|---|---|---|
| Sincronizar docs após mudança | `docs-roadmap` | — | `sync-docs` | update-docs |
| Atualizar status / sprints | `docs-roadmap` | — | `sync-docs` | update-docs |
| Atualizar API spec | `docs-roadmap` | `backend-fastify` (validar contrato) | `sync-docs` | update-docs |
| Criar relatório de PR/sprint | (agente que executou) | `docs-roadmap` | `prepare-pr-summary` | final-report |

### Operacional

| Tarefa | Agente principal | Auxiliares | Prompt | Skills |
|---|---|---|---|---|
| Rodar validação completa | `testing-e2e` | — | — | run-validation |
| Atualizar memória/contexto | (qualquer agente) | — | — | read-context |
| Planejar próxima sprint | `gymops-orchestrator` | `docs-roadmap`, `product-admin` | `implement-sprint` (próxima) | plan-implementation |

---

## Matriz por área do código

| Path | Agente principal | Instruction file |
|---|---|---|
| `apps/web/src/app/**/*.tsx` | `frontend-next` | `frontend.instructions.md` |
| `apps/web/src/components/**` | `frontend-next` | `frontend.instructions.md` |
| `apps/web/src/lib/**` | `frontend-next` | `frontend.instructions.md` |
| `apps/api/src/routes/**` | `backend-fastify` | `backend.instructions.md` |
| `apps/api/src/lib/**` | `backend-fastify` | `backend.instructions.md` |
| `apps/api/src/workers/**` | `backend-fastify` | `backend.instructions.md` |
| `apps/api/src/lib/rbac.ts` | `rbac-security` | `rbac.instructions.md` |
| `apps/api/src/lib/crypto.ts` | `integrations` ou `rbac-security` | `integrations.instructions.md` |
| `apps/api/src/lib/whatsapp.ts`, `mailer.ts`, `push.ts` | `integrations` | `integrations.instructions.md` |
| `apps/api/src/routes/integrations/**` | `integrations` | `integrations.instructions.md` |
| `apps/api/src/routes/notifications/**` | `integrations` | `integrations.instructions.md` |
| `packages/db/prisma/schema.prisma` | `database-prisma` | `database.instructions.md` |
| `packages/db/prisma/migrations/**` | `database-prisma` | `database.instructions.md` |
| `apps/**/*.test.ts` | `testing-e2e` | `tests.instructions.md` |
| `apps/web/e2e/**` | `testing-e2e` | `tests.instructions.md` |
| `docs/**/*.md` | `docs-roadmap` | `docs.instructions.md` |
| `tasks/**/*.md` | `docs-roadmap` | `docs.instructions.md` |

---

## Pipelines comuns (sequências pré-prontas)

### "Adicionar feature completa"

```
gymops-orchestrator
 ├─ database-prisma (se schema novo)
 │   └─ skill-create-prisma-migration → skill-update-docs
 ├─ backend-fastify
 │   └─ skill-create-fastify-endpoint → skill-validate-rbac
 ├─ frontend-next (com product-admin se for tela)
 │   └─ skill-create-admin-ui
 ├─ testing-e2e
 │   └─ skill-create-playwright-e2e
 ├─ skill-run-validation
 ├─ docs-roadmap → skill-update-docs
 └─ skill-final-report
```

### "Mudar permissão"

```
rbac-security
 ├─ Atualizar docs/rbac-matrix.md
 ├─ backend-fastify → ajustar handlers
 ├─ frontend-next → ajustar UI (UX)
 ├─ testing-e2e → cobrir cada role
 ├─ skill-run-validation
 ├─ docs-roadmap → status.md
 └─ skill-final-report
```

### "Fechar sprint"

```
gymops-orchestrator
 ├─ skill-read-project-context (sprint atual)
 ├─ skill-plan-implementation (verificar tarefas pendentes)
 ├─ (executar tarefas restantes)
 ├─ skill-run-validation (completa)
 ├─ docs-roadmap → atualizar status.md + sprints.md + tasks/sprint-N.md
 └─ skill-final-report (relatório de sprint)
```

### "Investigar e corrigir bug"

```
(camada do bug)
 ├─ Reproduzir
 ├─ Causa raiz
 ├─ Corrigir
 ├─ testing-e2e → adicionar teste regressão
 ├─ skill-run-validation
 └─ skill-final-report
```

---

## Quando o pedido não bate em nenhuma linha

1. Tentar enquadrar no verbo + objeto mais próximo
2. Se for tarefa nova/inédita: usar `gymops-orchestrator` para conduzir e atualizar esta matriz depois
3. Se for pergunta de consulta: não chamar agente — responder direto com Read/Grep
