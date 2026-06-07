# Documentacao

Este diretorio concentra a documentacao versionada do projeto.

## Leitura recomendada

- README.md na raiz para setup e operacao principal.
- [AGENTS.md](../AGENTS.md) na raiz para arquitetura, fronteiras e onboarding rápido.
- docs/TESTING.md para estrategia de testes atual.
- docs/cetesb/README.md para evidencias HAR e fonte de verdade externa.
- docs/copilot/README.md para documentacao estrutural da camada Copilot.
- docs/handoffs/README.md para checkpoints por work_id.

### Frontend (Vue 3 + Vuetify)

- [docs/FRONTEND-COMPONENTS-ARCHITECTURE.md](FRONTEND-COMPONENTS-ARCHITECTURE.md) — arquitetura de componentes, App Shell e navegação.
- [frontend/docs/design-system.md](../frontend/docs/design-system.md) — catálogo do design system `Sicat*` (props, slots, exemplos) + playground `/dev/components`.
- [docs/CHANGELOG-DL-100-REFATORACAO-UX-DESIGN-SYSTEM.md](CHANGELOG-DL-100-REFATORACAO-UX-DESIGN-SYSTEM.md) — refatoração UX/UI corporativa (design system, navegação por audiência, decomposição de telas-monstro, limpeza).

## Centro Operacional SICAT

Trilha estratégica e arquitetural do Centro Operacional SICAT (work
`centro-operacional-sicat`):

- [docs/10-estado-atual/estado-atual.md](10-estado-atual/estado-atual.md) — snapshot honesto do que está IMPLEMENTADO, EM PROGRESSO e PLANEJADO.
- [docs/10-estado-atual/PROXIMO_PROMPT.md](10-estado-atual/PROXIMO_PROMPT.md) — próxima frente recomendada e prompt pronto para o orquestrador.
- [docs/_inputs/fonte-de-verdade-backlog-cto.md](_inputs/fonte-de-verdade-backlog-cto.md) — visão de produto/CTO, pilares, KPIs, gaps SIGOR x SICAT e próximas frentes.
- [docs/04-arquitetura/centro-operacional-sicat.md](04-arquitetura/centro-operacional-sicat.md) — arquitetura alvo (operations-dashboard, jobs-console, audit-explorer, cetesb-accounts-health, mtr-reports, command-center).
- [docs/04-arquitetura/command-center-sicat.md](04-arquitetura/command-center-sicat.md) — base estrutural (registry + UI palette) para o futuro chat orquestrador, sem IA acoplada nesta etapa.
- [docs/05-operacao/taxonomia-status-erros-operacionais.md](05-operacao/taxonomia-status-erros-operacionais.md) — taxonomia canônica dos 13 estados operacionais (label, severity, retryable, bucket, recommendedAction).
- [docs/CHANGELOG-CENTRO-OPERACIONAL.md](CHANGELOG-CENTRO-OPERACIONAL.md) — release notes consolidadas da cadeia.

Checkpoints da cadeia (em `docs/handoffs/centro-operacional-sicat/`):

- [00-orchestration.md](handoffs/centro-operacional-sicat/00-orchestration.md)
- [01-baseline-docs.md](handoffs/centro-operacional-sicat/01-baseline-docs.md)
- [03-backend-contracts.md](handoffs/centro-operacional-sicat/03-backend-contracts.md)
- [04-persistence-worker.md](handoffs/centro-operacional-sicat/04-persistence-worker.md)
- [06-frontend-ux.md](handoffs/centro-operacional-sicat/06-frontend-ux.md)
- [07-observability-admin.md](handoffs/centro-operacional-sicat/07-observability-admin.md)
- [09-qa-validation.md](handoffs/centro-operacional-sicat/09-qa-validation.md)
- [10-documentation-final.md](handoffs/centro-operacional-sicat/10-documentation-final.md)

## Estrutura atual

- cetesb/: evidencias reais e HARs da CETESB.
- copilot/: trilha canônica de contexto, decisoes, guias e artefatos de governanca Copilot.
- handoffs/: checkpoints versionados por work_id.
- legado/: guias, relatórios e notas preservados por historico, fora da trilha canônica atual.

## Arquivos canônicos mantidos no topo de docs/

- README.md: indice estrutural desta arvore de documentacao.
- TESTING.md: guia transversal da estrategia de testes e validacoes do repositorio.
- CHANGELOG-DL-020.md, DL-021-REORGANIZACAO-ESTRUTURA.md, DL-022-EVOLUCAO-PERSISTENCIA-FILA.md, DL-023-CORRECAO-FLUXO-IMPRIMIR-MTR.md e CHANGELOG-DL-100-REFATORACAO-UX-DESIGN-SYSTEM.md: decision records e notas tecnicas de alto nivel que continuam uteis como referencia direta.
- FRONTEND-COMPONENTS-ARCHITECTURE.md e QUICK-START-PRINT-FLOW.md: guias transversais ainda vigentes, mantidos no topo por serem referencias operacionais de acesso frequente e nao historico legado. O catalogo detalhado do design system vive em frontend/docs/design-system.md.

## Regra pratica

Se houver conflito entre um checkpoint em docs/handoffs/, um resumo historico e um guia antigo, prevalece o artefato mais especifico e mais recente.

Se um arquivo permanecer solto no topo de docs/, ele deve se encaixar explicitamente em uma destas categorias: indice estrutural, guia transversal vigente ou decision record/nota tecnica de alto nivel.
