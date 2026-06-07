# 00 — Orquestração

- **work_id:** `frontend-ux-navegacao-shell`
- **Aberto em:** 2026-04-25
- **Owner orquestrador:** `orquestrador-mtr`

## Demanda original (resumo)

Reformulação profunda de UX/UI do frontend SICAT: navegação principal está
poluída, redundante (Jobs vs CO·Jobs, Relatório MTR vs CO·Relatório MTR) e
fora de padrão. Necessário reorganizar menu por intenção do usuário,
componentizar o App Shell (hoje monolítico em `App.vue`), padronizar
cabeçalhos/cards/estados, criar fonte declarativa de navegação compartilhada
desktop/mobile, e elevar a estética para um padrão sóbrio, executivo e
operacional — preservando rotas, guards, sessão CETESB e permissões admin.

## Stack e restrições

- Vue 3 + Vite + Vuetify + Pinia + Vue Router.
- Manter contratos de API e rotas funcionais (redirects quando necessário).
- Usar tokens em `frontend/src/styles/tokens.css`.
- Respeitar `docs/FRONTEND-COMPONENTS-ARCHITECTURE.md`.
- Não quebrar autenticação, guards, conta CETESB ativa ou RBAC admin.

## Sequência de fases

| Fase | Agente | Status |
| --- | --- | --- |
| 06 — Frontend UX/Shell/Navegação | `frontend-vue-ux-mtr` | done (2026-04-25) |
| 09 — QA (build/test:ui/smoke/responsivo/guards) | `tester-qa-mtr` | done (2026-04-25) — APROVADO COM RESSALVA |
| 10 — Documentação final + decision log | `documentador-mtr` | done (2026-04-25) — DL-098 publicada; cadeia DONE |

> **Cadeia concluída em 2026-04-25.** Artefatos finais:
> [10-documentation-final.md](10-documentation-final.md),
> [DL-098](../../copilot/13-decision-log.md#dl-098),
> [CHANGELOG-DL-098-FRONTEND-UX-NAVEGACAO-SHELL.md](../../CHANGELOG-DL-098-FRONTEND-UX-NAVEGACAO-SHELL.md).

## Critérios de pronto (gerais)

- Menu principal agrupado por intenção (Início, Operação MTR, MTR Provisório,
  DMR, Centro Operacional, Relatórios, Conversacional, Administração,
  Sessão/Conta).
- Sem duplicidade visual entre `Jobs`/`CO · Jobs` e `Relatório MTR`/`CO · Relatório MTR`.
- App Shell decomposto (Topbar, Navigation, MobileDrawer, PageHeader, UserMenu).
- Fonte única declarativa de navegação (`frontend/src/config/navigation.js`
  ou equivalente) consumida por desktop e mobile.
- Tokens existentes reutilizados; estética sóbria, sem regressão de a11y.
- Rotas, guards, conta CETESB ativa e permissões admin preservados.
- `cd frontend && npm run build` ok; `npm run test:ui` quando aplicável.

## Checkpoints esperados

- `06-frontend-ux.md` — diagnóstico, plano, implementação, arquivos alterados,
  decisões de UX, compatibilidade preservada.
- `09-qa-validation.md` — build, test:ui, smoke navegação, responsivo,
  dark/light, guards, conta CETESB, RBAC.
- `10-documentation-final.md` — resumo, decision-log entry, mapa de navegação,
  próximos refinamentos sugeridos.

## Política de continuidade

Cada agente atualiza seu checkpoint e tenta invocar o próximo via subagent.
Se runtime não executar, devolve `next_agent_required` com prompt pronto.
Orquestrador não executa fases dos especialistas.

## Anexo operacional — destravamento `localhost: up` (2026-04-25)

A task `localhost: up` quebrou em `npm run validate:openapi` por 24
links/âncoras no checkpoint [09-qa-validation.md](09-qa-validation.md):
todos eram links para arquivos de `frontend/src/**` escritos com path
relativo à raiz do repositório, mas o validador
(`scripts/validate-markdown-links.js`) resolve paths relativos ao
diretório do próprio doc. Correção aplicada: prefixar `../../../` para
alcançar `frontend/src/**` e tornar a referência ao sibling
`06-frontend-ux.md` realmente sibling. Nenhum arquivo de produto foi
alterado; nenhum link foi removido. Validador passa em exit 0 e
`localhost: up` segue completo.
