# Roadmap de Produto — GymOps

**Última atualização**: 2026-05-17

> **Reconciliação 2026-05-17**: o roadmap original (Sprints 9–16) cobria a construção da camada administrativa. As Sprints 9–16 foram entregues, mas com **profundidade rasa** em equipe/unit_areas/central de atividades. Análise estática do código identificou bugs P0 e gaps de produto que precisam ser fechados antes de declarar "produto 100%". O roadmap foi **estendido com as Sprints 18–21** focadas em estabilização, profundidade administrativa, operação e go-live. Detalhes em [`docs/status.md`](status.md), [`docs/backlog.md`](backlog.md) e [`docs/implementation-plan.md`](implementation-plan.md).

---

## Visão geral

O GymOps tem motor transacional completo (Sprint 8) e camada administrativa entregue (Sprints 9–16) + modo tutorial (Sprint 17). O próximo ciclo (S18–S21) zera a dívida técnica residual e entrega o produto em estado de release pública.

```
Horizonte 1 (Sprints 9-11)  → Administração básica         [✅ entregue]
Horizonte 2 (Sprints 12-14) → Visão transversal e ops      [✅ entregue]
Horizonte 3 (Sprints 15-16) → Qualidade e escala           [✅ entregue]
Horizonte 4 (Sprints 17)    → Onboarding guiado            [✅ entregue]
Horizonte 5 (Sprints 18-21) → Estabilização + go-live      [🚧 em execução]
```

---

## Horizonte 5 — Estabilização e go-live (Sprints 18–21)

**Meta**: zerar bugs P0, aprofundar telas administrativas para autonomia real do admin, dar diagnóstico operacional na UI, garantir paridade pipeline ↔ deploy `/gymops` e cumprir checklist de smoke por perfil.

**Critério de saída**: todos os boxes do [`docs/qa-release-checklist.md`](qa-release-checklist.md) verdes em ambiente local **e** público (`http://<HOST>:7480/gymops/`), com `docs/status.md` declarando "✅ Produto 100% — release X.Y.Z".

### Sprint 18 — Estabilização crítica (7–10 dias)

| Entrega | Itens (ver [`docs/backlog.md`](backlog.md)) |
|---|---|
| Prioridade PT/EN unificada na Central de Atividades | BUG-001 |
| Bulk update com `organizationId` | BUG-002 |
| Export CSV respeita filtro de prioridade | BUG-003 |
| Senha mínima unificada (8) em setup/invite/register | BUG-004 |
| Login resolve contexto para memberships de área | BUG-005 |
| `canCreate()` alinhado com matriz RBAC canônica | BUG-006 |
| `hasUnitRole()` cobre área | BUG-007 |

**Sai com**: zero bugs P0 em fluxos de Central, Setup e Login/RBAC.

### Sprint 19 — Profundidade administrativa (10–14 dias)

| Entrega | Itens |
|---|---|
| Equipe escopada (org/unit/area) com edição de papel/escopo | FEAT-001 |
| Gestão visual de `unit_areas` (vincular, desvincular, reordenar) | FEAT-002 |
| Central de atividades acionável (paginação, saved views, filtros, drill-down) | FEAT-003 |
| `/setup` com starter pack canônico (6 áreas + 24 templates + unidade opcional) | FEAT-004 |

**Sai com**: admin opera o tenant inteiro pelo produto, sem SQL manual.

### Sprint 20 — Operação e integrações (8–12 dias)

| Entrega | Itens |
|---|---|
| Integrações UI completa (Trello health/reconnect/boards, WhatsApp sandbox/prod/erros) | FEAT-005 |
| Import wizard dinâmico (áreas/unidades reais) + dedupe cross-job | FEAT-006 |
| Organização: branding, logo, settings | FEAT-007 |
| Área: editar `visibilityDefault` + matriz de uso | FEAT-008 |
| Delivery log com filtros operacionais | FEAT-009 |

**Sai com**: admin diagnostica integrações sem ler log de servidor; reimportar mesmo board não duplica dados.

### Sprint 21 — QA, docs e readiness final (5–7 dias)

| Entrega | Itens |
|---|---|
| E2E em `pull_request` (Playwright bloqueia regressões antes do merge) | OPS-001 |
| Build secundário com `NEXT_PUBLIC_APP_BASE_PATH=/gymops` no CI | OPS-002 |
| Healthchecks compose público com `service_healthy` | BUG-009 |
| CORS via `ALLOWED_ORIGINS` env (não hardcoded) | BUG-010 |
| Refresh token em hash no DB | BUG-008 |
| Smoke por perfil (owner/org_manager/unit_manager/area_leader/executor/viewer) | OPS-004 |
| Separar `.env.docker.example` local vs público | OPS-005 |
| Reconciliação documental | OPS-003 |

**Sai com**: pipeline testa o artefato real do deploy público; produto declarado 100% no `docs/status.md`.

---

## Histórico — Sprints 9–17 (entregues)

(Conteúdo abaixo preservado para auditoria. Estado real: ver [`docs/status.md`](status.md), que documenta onde Sprints 9–16 ficaram rasas e geraram backlog S18–S21.)

---

## Horizonte 1 — MVP administrável (Sprints 9–11)

**Meta**: Um gestor consegue criar a estrutura da organização, convidar equipe e manter templates sem intervenção técnica.

**Critério de saída**: `owner` realiza o ciclo completo — criar organização, configurar unidades, adicionar áreas, convidar usuários com papéis corretos, gerenciar templates — tudo pela interface, sem seed manual nem chamada direta à API.

### Sprint 9 — Self-service básico

| Entrega | Por que agora |
|---------|--------------|
| Perfil do usuário (telefone, avatar, timezone) | Desbloqueia WhatsApp; identidade básica |
| Gestão da organização (branding, slug, políticas) | Owner configura a conta sem seed |
| Gestão de templates (UI completa com preview) | Templates existem no backend mas sem UI administrativa |

### Sprint 10 — Estrutura operacional

| Entrega | Por que agora |
|---------|--------------|
| Gestão de unidades (criar, editar, ativar/inativar) | Expansão autônoma da rede |
| Gestão de áreas (criar, vincular por unidade, reordenar) | Mapa operacional editável |

### Sprint 11 — Equipe e onboarding

| Entrega | Por que agora |
|---------|--------------|
| Convites reais com token (+ e-mail transacional) | Onboarding sem suporte técnico |
| Tela de equipe (convidar, alterar papel, revogar) | Gestão de acesso autônoma |
| Visualização da matriz de permissões | Transparência sobre quem vê o quê |

---

## Horizonte 2 — Operação contínua (Sprints 12–14)

**Meta**: Gestão transversal de toda a organização, importações administráveis e automações com visibilidade operacional.

**Critério de saída**: `org_manager` encontra qualquer atividade da organização em <3 interações, acompanha histórico de importações com retry/cancel, e vê logs de entrega de notificações.

### Sprint 12 — Cockpit de gestão

| Entrega | Por que agora |
|---------|--------------|
| Central global de atividades (busca, filtros avançados) | Gap mais crítico de gestão transversal |
| Ações em lote (status, prioridade, prazo, responsável) | Elimina trabalho repetitivo |
| Filtros salvos por usuário | Produtividade de gestores frequentes |

### Sprint 13 — Importações administráveis

| Entrega | Por que agora |
|---------|--------------|
| Centro de importações (histórico, detalhe, relatório) | Migração de 300 boards auditável |
| Retry/cancel de jobs | Falhas reprocessáveis sem suporte |
| Health check e reconnect de integração Trello | Ciclo de vida de integração administrável |

### Sprint 14 — Automações e notificações

| Entrega | Por que agora |
|---------|--------------|
| Centro de recorrências (listar, pausar, editar) | Automação visível e controlável |
| Delivery log de notificações | Troubleshooting sem acesso a logs de servidor |
| WhatsApp testável e validável pela UI | Fecha circuito de validação do canal |

---

## Horizonte 3 — Escala comercial (Sprints 15–16)

**Meta**: Produto confiável para múltiplos clientes, com observabilidade e onboarding self-service.

**Critério de saída**: Segundo cliente entra no sistema sem intervenção do time de engenharia. SLA rastreável. Regressões detectadas antes de chegarem em produção.

### Sprint 15 — Qualidade e observabilidade

| Entrega | Por que agora |
|---------|--------------|
| Sentry integrado (API + web) | SLA rastreável em piloto |
| Suíte E2E reescrita por critérios de negócio | Confiança no pipeline de release |
| Refatoração de arquivos grandes | Sustentabilidade do codebase |
| Polimento UX + a11y básica | Experiência para onboarding do segundo cliente |

### Sprint 16 — Preparação comercial

| Entrega | Por que agora |
|---------|--------------|
| Wizard de onboarding de nova organização | Self-service completo para novos clientes |
| Exportação básica (CSV por unidade) | Compliance e relatórios manuais |
| Auditoria trail de ações administrativas sensíveis | Governança e suporte a clientes |
| Modelo de dados para billing (sem Stripe ainda) | Preparação para monetização |

---

## Backlog pós-Sprint 16

| Feature | Horizonte | Motivo do adiamento |
|---------|-----------|---------------------|
| Stripe billing completo | Comercial | Não bloqueia expansão inicial |
| Menções @usuário em comentários | Operação | Útil, não crítico para MVP |
| Google Drive / OneDrive | Integração | Anexos no R2 atendem o MVP |
| App nativo iOS/Android | Plataforma | PWA atende; custo operacional alto |
| Busca full-text com pgvector | Performance | Schema pronto; implementar quando volume exigir |
| Workflow builder visual | Produto | Complexidade prematura |
| OCR/RAG em anexos | IA | Não bloqueia substituição do Trello |
| Múltiplos idiomas (i18n) | Globalização | Não bloqueia lançamento no Brasil |
| Exportação PDF/Excel | Relatórios | CSV é suficiente para piloto |
| WebSockets em tempo real | Performance | Polling atende a escala atual |

---

## Métricas de acompanhamento

### Métricas de produto (pilotar no Horizonte 1)

| Métrica | Meta (3 meses) |
|---------|---------------|
| Atividades criadas/semana | ≥50 por unidade |
| % atividades com responsável | ≥80% |
| % atividades concluídas no prazo | ≥70% |
| Logins/semana por unidade ativa | ≥5 usuários distintos |
| Boards Trello migrados | 100% dos 300 boards SkyFit |

### Métricas de qualidade (atingir no Horizonte 3)

| Métrica | Meta |
|---------|------|
| Error rate API (p95) | <0.5% |
| Latência API (p95) | <300ms |
| Cobertura de testes de integração | >80% dos endpoints |
| E2E specs passando no CI | 100% |
| Time to onboard novo cliente | <1 dia sem intervenção técnica |

---

## Dependências e riscos

| Risco | Impacto | Mitigação |
|-------|---------|-----------|
| RBAC desalinhado frontend/backend | Sprint 11 bloqueia | Fechar matriz canônica antes de iniciar Sprint 11 |
| Convite por e-mail sem onboarding real | Bloqueia Sprint 11 | Criar modelo `Invitation` em Sprint 11 |
| WhatsApp Sandbox limita validação | Sprint 14 incompleto sem número aprovado | Documentar limitações; usar sandbox para dev |
| E2E em estado draft | CI não dá confiança real | Priorizar reescrita da suíte em Sprint 15 |
| Codebase com arquivos grandes | Sustentabilidade | Refatorar em Sprint 15 antes de adicionar mais features |
