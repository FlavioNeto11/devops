# 00 — Orquestração

- **work_id:** `frontend-ux-tema-cdf-modulos`
- **Aberto em:** 2026-04-25
- **Owner orquestrador:** `orquestrador-mtr`
- **Cadeia anterior relacionada:** `frontend-ux-navegacao-shell` (DL-098, mérgada em main `3466d55`)

## Demanda original (resumo)

Reformulação estrutural ampla da experiência do frontend SICAT para virar
um produto único, elegante e operacionalmente claro. Pontos centrais:

1. **Tema dark/light unificado** com identidade da home pública (base
   `#03131a` no dark da área autenticada, sem conflitos entre `tokens.css`,
   `useAppTheme.js`, App Shell e Vuetify).
2. **Separar CDF/CDR de Manifestos** — criar módulo/rota próprios, manter
   atalho contextual em manifestos, dividir `useCetesbOperationalFlows.js`
   em composables menores se acoplado demais.
3. **Reorganizar navegação por módulos**: Operação (Dashboard, Manifestos,
   MTR Provisório, DMR, CDF/CDR), Monitoramento (Centro Operacional, Jobs,
   Auditoria, Saúde CETESB), Relatórios, Inteligência (Chat, Command
   Center), Administração (Sessão/conta, Perfis e acessos). Eliminar
   prefixo `CO ·` e duplicidades.
4. **Refatorar App Shell** — completar a decomposição iniciada em DL-098
   (extrair `SicatThemeToggle`, `SicatAccountChip` se ainda no App.vue).
5. **Dashboard como central de trabalho** — pendências, últimos manifestos,
   últimos CDF/CDR, jobs com erro, saúde CETESB, alertas, atalhos.
6. **Componentes compartilhados** — `SicatEmptyState`, `SicatStatusBadge`,
   `SicatFilterPanel`, `SicatDateRangeFilter`, `SicatSearchInput`,
   `SicatSelectFilter` (criar conforme repetição real).
7. **Detalhes padronizados** (cabeçalho → resumo → dados → participantes →
   itens → documentos → jobs → auditoria → ações secundárias).
8. **Feedback assíncrono** consistente para criação de jobs.
9. **Responsividade mobile** real (drawer, tabelas, filtros recolhíveis).
10. **Documentação** (FRONTEND-UX-NAVIGATION.md, atualização do
    FRONTEND-COMPONENTS-ARCHITECTURE.md, decision-log).

## Stack e restrições

- Vue 3 + Vite + Vuetify + Pinia + Vue Router + ApexCharts + Playwright.
- Manter contratos de API (`src/generated/operations.ts` intacto).
- Manter rotas legadas (`/jobs`, `/relatorios/mtrs`, `/operacao/jobs`,
  `/operacao/relatorios/mtr`) com redirect ou alias.
- Tokens centralizados — sem cores hardcoded espalhadas.
- App.vue não deve ganhar nova responsabilidade.
- Sem componentes gigantes; sem excesso de gradientes/sombras.
- Não quebrar autenticação, guards, conta CETESB ativa, RBAC admin.
- `useCetesbOperationalFlows.js` pode ser dividido (sem duplicar lógica).

## Sequência de fases

| Fase | Agente | Status |
| --- | --- | --- |
| 06 — Frontend UX (tema + navegação + App Shell + CDF/CDR + componentes + dashboard + mobile) | `frontend-vue-ux-mtr` | done |
| 09 — QA (build/test:ui/smoke/responsivo/dark-light/guards/rotas legadas) | `tester-qa-mtr` | done (APROVADO COM RESSALVA — ver [09-qa-validation.md](09-qa-validation.md)) |
| 10 — Documentação final + DL + FRONTEND-UX-NAVIGATION.md | `documentador-mtr` | done |

## Critérios de pronto (gerais)

- Dark mode da área autenticada usa base `#03131a` da home.
- Light mode consistente; troca dark/light funcional em todas as telas.
- Navegação agrupada por módulos; sem `CO ·`; sem duplicidades
  Jobs/CO·Jobs e Relatórios/CO·Relatórios.
- CDF/CDR com módulo/rota próprios; Manifestos focado em MTR; atalho
  contextual `Gerar CDF/CDR a partir deste manifesto` quando útil.
- App.vue continua menor (não regredir DL-098); novos componentes shell
  extraídos conforme necessário.
- `frontend/src/config/navigation.js` permanece fonte única (desktop +
  mobile).
- Dashboard útil; empty states profissionais; status badge unificado.
- Compatibilidade de rotas legadas preservada (alias/redirect).
- Guards, conta CETESB ativa, RBAC admin preservados.
- `cd frontend && npm run build` ok; `npm run validate:openapi` ok;
  `npm run typecheck` ok; `npm run test:ui` quando aplicável.

## Checkpoints esperados

- `06-frontend-ux.md` — diagnóstico, plano em fases (Tema → Navegação →
  Shell → CDF/CDR → Componentes → Telas), arquivos criados/alterados,
  decisões UX, compatibilidade.
- `09-qa-validation.md` — comandos, smoke, responsivo, dark/light,
  guards, rotas legadas, ressalvas.
- `10-documentation-final.md` — DL nova, FRONTEND-UX-NAVIGATION.md,
  changelog, mapa de navegação atualizado, próximos passos.

## Política de continuidade

Cada agente atualiza seu checkpoint e tenta invocar o próximo. Se runtime
não permitir, retorna `next_agent_required` com prompt pronto. Orquestrador
não executa fases dos especialistas.

## Status da cadeia

**DONE** em 2026-04-25.

Artefatos finais publicados:

- [10-documentation-final.md](10-documentation-final.md)
- [../../CHANGELOG-DL-099-FRONTEND-UX-TEMA-CDF-MODULOS.md](../../CHANGELOG-DL-099-FRONTEND-UX-TEMA-CDF-MODULOS.md)
- [../../FRONTEND-UX-NAVIGATION.md](../../FRONTEND-UX-NAVIGATION.md)
- [../../copilot/13-decision-log.md](../../copilot/13-decision-log.md#dl-099)

## Boas práticas registradas (lição da cadeia anterior)

Links em `docs/handoffs/<work_id>/*.md` que apontem para `frontend/src/**`
ou `docs/**` precisam de paths relativos corretos (`../../../frontend/...`,
`../../<arquivo>.md`). O validador `validate-markdown-links.js` resolve
relativo ao `dirname` do doc — quebra `localhost: up` se errado.
