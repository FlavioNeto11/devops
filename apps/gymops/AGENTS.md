# AGENTS.md — Contrato Interoperável de Agentes para GymOps

> **Propósito**: Este arquivo é o **contrato compartilhado** entre todos os agentes de IA que trabalham neste repositório — GitHub Copilot Chat (VS Code Insiders), Claude Code, agentes locais, agentes cloud e qualquer ferramenta futura que leia instruções versionadas em Markdown.
>
> Qualquer agente que abrir este projeto deve **ler este arquivo primeiro**, antes de qualquer outro.

---

## 1. Visão geral do projeto

**GymOps** é uma plataforma de gestão operacional multiunidade que substitui o Trello como ferramenta de rotina em redes com múltiplas unidades físicas (contexto inicial: rede SkyFit, ~300 boards Trello a migrar).

- **Modelo de domínio**: `Organização → Unidade → Área → Atividade`
- **Stack**: Next.js 14 (web) · Fastify (api) · Prisma · PostgreSQL 16 · Redis + BullMQ · Cloudflare R2 · OpenAI
- **Estado**: Sprints 1–17 concluídas; ciclo atual S18–S21 (estabilização + go-live)
- **Idioma de produto**: português brasileiro (`pt-BR`)
- **Não-objetivos do MVP**: app nativo, GraphQL, WebSockets, billing Stripe, Google Drive/OneDrive, OCR

Para detalhe canônico, ver [`docs/PRD.md`](docs/PRD.md), [`docs/status.md`](docs/status.md) e [`docs/product-roadmap.md`](docs/product-roadmap.md).

---

## 2. Como qualquer agente deve começar uma tarefa

Sempre, sem exceção:

1. **Ler `docs/status.md`** — estado atual e gaps. Nunca assumir; ler.
2. **Identificar a sprint relevante** em `tasks/sprint-N.md` (sprint atual: ver "Estado atual" em [`CLAUDE.md`](CLAUDE.md)).
3. **Consultar a matriz de decisão** (seção 4 deste arquivo) para escolher qual conjunto de instruções/agentes/skills se aplica.
4. **Verificar `docs/rbac-matrix.md`** antes de mexer em permissões.
5. **Verificar `docs/admin-ui-blueprint.md`** antes de criar tela administrativa.
6. **Verificar `docs/api-spec.md`** antes de criar/alterar endpoint.
7. **Verificar `docs/e2e-business-flows.md`** antes de escrever testes E2E.
8. **Planejar antes de executar** — listar arquivos que serão alterados.
9. **Executar** — implementar.
10. **Validar** — rodar `pnpm lint` + `pnpm typecheck` + testes relevantes.
11. **Atualizar docs** afetados (status, sprints, api-spec, rbac, integrations conforme o caso).
12. **Gerar relatório final** com o que foi feito, o que foi validado e o que ficou em aberto.

---

## 3. Ordem oficial de leitura da documentação

Ler nesta ordem **antes de implementar qualquer coisa**:

| # | Arquivo | Para quê |
|---|---|---|
| 1 | [`CLAUDE.md`](CLAUDE.md) | Regras de desenvolvimento e armadilhas conhecidas |
| 2 | [`AGENTS.md`](AGENTS.md) | Este arquivo — contrato interoperável |
| 3 | [`README.md`](README.md) | Stack, setup local, links |
| 4 | [`docs/status.md`](docs/status.md) | Estado atual e gaps (sempre antes de implementar) |
| 4a | [`docs/backlog.md`](docs/backlog.md) | Backlog P0/P1/P2 com IDs estáveis |
| 4b | [`docs/implementation-plan.md`](docs/implementation-plan.md) | Ordem dos PRs S18→S21 |
| 4c | [`docs/qa-release-checklist.md`](docs/qa-release-checklist.md) | Checklist de go-live |
| 4d | [`docs/bootstrap-spec.md`](docs/bootstrap-spec.md) | Spec do bootstrap canônico de organização |
| 4e | [`docs/integrations-ops.md`](docs/integrations-ops.md) | Diagnóstico operacional de integrações |
| 5 | [`docs/PRD.md`](docs/PRD.md) | Escopo funcional e métricas de sucesso |
| 6 | [`docs/product-roadmap.md`](docs/product-roadmap.md) | Roadmap por horizonte (S18–S21) |
| 7 | [`docs/admin-ui-blueprint.md`](docs/admin-ui-blueprint.md) | Spec de cada tela administrativa |
| 8 | [`docs/navigation-map.md`](docs/navigation-map.md) | Mapa de navegação por papel |
| 9 | [`docs/rbac.md`](docs/rbac.md) | Algoritmo de permissões |
| 10 | [`docs/rbac-matrix.md`](docs/rbac-matrix.md) | Matriz canônica de permissões (fonte da verdade) |
| 11 | [`docs/api-spec.md`](docs/api-spec.md) | Endpoints REST com contratos |
| 12 | [`docs/architecture.md`](docs/architecture.md) | Stack e decisões técnicas |
| 13 | [`docs/data-model.md`](docs/data-model.md) | Schema de banco |
| 14 | [`docs/integrations.md`](docs/integrations.md) | SMTP, Push, WhatsApp, Trello |
| 15 | [`docs/e2e-business-flows.md`](docs/e2e-business-flows.md) | Critérios de aceite por fluxo |
| 16 | [`docs/sprints.md`](docs/sprints.md) | Histórico + plano de sprints |
| 17 | `tasks/sprint-N.md` | Tarefas da sprint atual |

Não há necessidade de re-ler todo o conjunto a cada tarefa. Releia apenas os arquivos diretamente afetados pelo escopo.

---

## 4. Matriz de decisão — qual agente/instrução usar

Use esta tabela para escolher rapidamente o conjunto de regras aplicável.

| Tipo de tarefa | Agente principal | Instruções aplicáveis | Skills úteis |
|---|---|---|---|
| Criar/editar tela administrativa | `product-admin` + `frontend-next` | `frontend.instructions.md`, `rbac.instructions.md` | `skill-create-admin-ui` |
| Criar/editar endpoint Fastify | `backend-fastify` | `backend.instructions.md`, `rbac.instructions.md` | `skill-create-fastify-endpoint` |
| Alterar regra de permissão | `rbac-security` (orquestra todos) | `rbac.instructions.md` + backend + frontend + tests + docs | `skill-validate-rbac` |
| Criar/alterar schema Prisma | `database-prisma` | `database.instructions.md` | `skill-create-prisma-migration` |
| Criar/alterar integração externa | `integrations` + `backend-fastify` | `integrations.instructions.md`, `backend.instructions.md` | — |
| Criar testes E2E de negócio | `testing-e2e` | `tests.instructions.md` | `skill-create-playwright-e2e` |
| Executar uma sprint inteira | `gymops-orchestrator` | conjunto completo | `skill-plan-implementation`, `skill-final-report` |
| Revisar segurança | `rbac-security` | `rbac.instructions.md` + `backend.instructions.md` | — |
| Atualizar documentação | `docs-roadmap` | `docs.instructions.md` | `skill-update-docs` |
| Diagnosticar falha de CI | `testing-e2e` + `docs-roadmap` | `tests.instructions.md` | `skill-run-validation` |

Para roteamento detalhado por verbo de tarefa, ver [`docs/agent-task-routing.md`](docs/agent-task-routing.md).

---

## 5. Regras de segurança (válidas para todos os agentes)

- **Nunca commitar segredos** (`*.env`, `*.pem`, API keys). Apenas `*.example` e `.env.docker.example`.
- **RBAC sempre no backend** — frontend nunca decide acesso por conta própria.
- **404 sobre 403** quando houver risco de enumeração (atividades restritas).
- **Validação Zod em todos os endpoints** — entrada nunca chega ao Prisma sem validar.
- **Tokens de integração criptografados** com AES-256-GCM (`lib/crypto.ts`) antes de gravar em `integration_accounts.auth_jsonb`.
- **Atividades `restricted` nunca vão para o LLM** — guard via `resolveActivityPermission`.
- **Rate limiting** em todos os endpoints de auth e `/ai/*`.
- **Nunca expor IDs sequenciais** — UUIDs v4 em todas as tabelas.

Ver detalhes em [`docs/rbac.md`](docs/rbac.md) e [`CLAUDE.md`](CLAUDE.md).

---

## 6. Regras de validação obrigatórias

Antes de marcar qualquer tarefa como concluída:

```bash
pnpm lint                                       # ESLint em todos os pacotes
pnpm typecheck                                  # tsc --noEmit em todos os pacotes
pnpm --filter @gymops/api test                  # vitest (requer Postgres)
pnpm --filter @gymops/web test:e2e              # Playwright (opcional; CI cobre)
pnpm --filter @gymops/web build                 # somente para mudanças em frontend
```

Se algum comando falhar por motivo pré-existente e **não relacionado** à sua mudança, documente no relatório final em vez de tentar mascarar.

---

## 7. Comandos obrigatórios do dia a dia

| Objetivo | Comando |
|---|---|
| Subir banco local (Postgres + Redis via Docker) | `docker compose up -d postgres redis` |
| Aplicar migrations | `pnpm --filter @gymops/db migrate:deploy` |
| Gerar Prisma Client | `pnpm --filter @gymops/db generate` |
| Seed inicial (admin@skyfit.com / gymops123) | `pnpm --filter @gymops/db seed` |
| Subir API + Web em paralelo | `pnpm dev` |
| Lint + typecheck monorepo | `pnpm lint && pnpm typecheck` |
| Subir stack inteiro em Docker | `docker compose up -d` |

---

## 8. O que NÃO implementar (limites do MVP)

Recusar com gentileza qualquer pedido para:

- App nativo iOS/Android (PWA atende)
- Workflow builder visual / automações arbitrárias
- OCR/RAG em anexos
- Múltiplos provedores IA simultâneos
- Billing / Stripe completo (modelo de dados em Sprint 16; integração pós-MVP)
- GraphQL ou WebSockets em tempo real
- Google Drive / OneDrive (Sprint 15+)
- Telas técnicas para usuário final (ex: editor JSON de configuração, console de SQL, painel de filas exposto ao gestor)
- Múltiplos idiomas (i18n) — apenas pt-BR no MVP

Ver lista completa em [`docs/product-roadmap.md`](docs/product-roadmap.md) e [`docs/PRD.md`](docs/PRD.md).

---

## 9. Política de atualização de documentação

Sempre que mudar:

| Mudança | Docs a atualizar |
|---|---|
| Endpoint (criar/alterar/remover) | `docs/api-spec.md` + `docs/status.md` |
| Regra de permissão | `docs/rbac-matrix.md` + `docs/rbac.md` + `docs/status.md` |
| Schema Prisma | `docs/data-model.md` + criar migration |
| Tela nova | `docs/admin-ui-blueprint.md` + `docs/navigation-map.md` |
| Integração externa | `docs/integrations.md` |
| Fluxo E2E coberto | `docs/e2e-business-flows.md` (marcar estado) |
| Conclusão de sprint | `docs/sprints.md` + `docs/status.md` |
| Decisão arquitetural | `docs/architecture.md` |

**Não prometer feature inexistente.** Marcar como `✅ Implementado`, `⚠️ Parcial`, `🔵 Planejado` ou `❌ Fora do MVP`.

---

## 10. Política de commit sugerida

- Branch a partir de `main` para cada tarefa
- Commit semântico: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`
- Mensagens em inglês para o cabeçalho, corpo pode ser em português
- PR precisa passar CI (lint + typecheck + test + build) antes de merge
- Nunca usar `--no-verify` para pular hooks
- Nunca usar `git push --force` em `main`

Exemplo:

```
feat(team): add invitation acceptance flow

Implements /invite/[token] page that consumes the token,
shows invitation details, and creates the user account.
Updates docs/api-spec.md and tasks/sprint-11.md.
```

---

## 11. Política de relatório final

Ao concluir qualquer tarefa não-trivial, gere um relatório com:

1. **Resumo executivo** — em uma frase, o que foi feito
2. **Arquivos criados/alterados** — caminhos relativos + uma linha de descrição
3. **Validações executadas** — lista de comandos rodados e resultado
4. **Documentação atualizada** — quais arquivos `docs/*` foram tocados
5. **Riscos/pontos de atenção** — o que pode quebrar, o que ficou em aberto
6. **Próximos passos sugeridos** — o que naturalmente vem depois

Para tarefas grandes (sprint inteira, refatoração grande), incluir também:

7. **Decisões técnicas tomadas** com justificativa curta
8. **Limitações conhecidas** que o usuário precisa saber

---

## 12. Sinergia entre Copilot Chat e Claude Code

Ambos os agentes leem este arquivo. Para evitar conflito:

- **Copilot Chat (VS Code Insiders)** usa `.github/copilot-instructions.md` como custom instructions globais, `.github/instructions/*.instructions.md` por path e `.github/prompts/*.prompt.md` para tarefas comuns. Detalhes em [`docs/how-to-use-ai-agents.md`](docs/how-to-use-ai-agents.md).
- **Claude Code** usa [`CLAUDE.md`](CLAUDE.md) como prompt global e tem skills/agents próprios. Também respeita as instruções em `.github/instructions/` quando o contexto for relevante.
- **Ambos** devem seguir este `AGENTS.md` como contrato. Em conflito, este arquivo prevalece sobre regras locais de ferramenta.

Para o modelo operacional completo (papéis, fluxos, sincronização), ver [`docs/ai-agent-operating-model.md`](docs/ai-agent-operating-model.md).

---

## 13. Base de conhecimento navegável

Para um overview rápido sem ler todos os docs, comece por:

- [`docs/ai-knowledge-base.md`](docs/ai-knowledge-base.md) — índice resumido para agentes
- [`docs/agent-task-routing.md`](docs/agent-task-routing.md) — matriz de roteamento de tarefas
- [`docs/how-to-use-ai-agents.md`](docs/how-to-use-ai-agents.md) — como usar Copilot/Claude no projeto

---

## 14. Princípios não-negociáveis

1. **Backend é a verdade do RBAC.** Frontend é UX.
2. **Status canônico em `docs/status.md`.** Nada substitui ler esse arquivo.
3. **Nunca criar tela técnica para usuário final.** Linguagem de negócio sempre.
4. **Nunca criar botão sem ação real.** Sem mocks, sem stubs visíveis ao usuário.
5. **Nunca quebrar fluxo crítico** (ver `CLAUDE.md` seção "Fluxos críticos que não podem quebrar").
6. **Documentar como parte da entrega.** Código sem docs atualizado não está pronto.
7. **Responsividade obrigatória.** Toda tela funciona em mobile (≤375px) e desktop (≥1280px).
8. **Idioma de produto: pt-BR.** Sem strings em inglês na UI.
