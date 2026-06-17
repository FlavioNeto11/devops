---
title: "UX didática do SICAT — princípios e checklist"
status: guide
applies_to: [sicat]
updated: 2026-06-15
language: pt-BR
---

# UX didática do SICAT (operador leigo)

O público real do SICAT são **operadores leigos, de baixa escolaridade**. Toda tela/feature nova
segue estes princípios e passa por este checklist. A **fonte única de linguagem** é
[`src/config/glossary.js`](../src/config/glossary.js) — sigla/termo técnico → nome simples + explicação
+ exemplo.

## Princípios
1. **Linguagem de pessoa comum.** Sem jargão cru; sigla sempre com nome simples (e exemplo quando ajuda).
2. **Uma tarefa por tela, um botão principal grande.** Esconda o avançado.
3. **Apoio visual:** ícone + número + ilustração; cor **e** ícone **e** texto (nunca cor sozinha).
4. **"O que é isto?" inline** em todo termo difícil — `SicatHelpHint` lê do glossário.
5. **Sempre sugerir o próximo passo** após uma ação — `SicatNextStep`.
6. **Estados gentis e acionáveis** (vazio/erro/sucesso com próximo passo, em linguagem comum).
7. **Legibilidade:** fonte/alvos maiores, alto contraste, mobile-first.

## Componentes didáticos (reutilize)
- `components/sicat/SicatHelpHint.vue` — o "?" que explica um termo (puxa do glossário).
- `components/sicat/SicatActionCard.vue` — cartão grande de ação (tela inicial, próximos passos).
- `components/sicat/SicatNextStep.vue` — faixa "próximo passo recomendado".
- `components/sicat/SicatAuthSteps.vue` — guia das 2 etapas de acesso (SICAT → CETESB).
- Base existente: `SicatPageLayout`, `SicatFormSection`/`SicatFormField`, `SicatInlineAlert`,
  `SicatEmptyState`, `SicatDataTable`, `useNotification`.

## Checklist (todo PR de tela do operador)
- [ ] Sem sigla/jargão cru no que o usuário lê (ou acompanhado de nome simples + `SicatHelpHint`).
- [ ] Um objetivo claro por tela e um CTA principal evidente.
- [ ] Campos difíceis têm hint em linguagem comum (+ exemplo) e/ou `SicatHelpHint`.
- [ ] Estado vazio diz **por que** está vazio e **o que fazer** (com botão).
- [ ] Erros/bloqueios em linguagem comum, dizendo **como resolver**.
- [ ] Após concluir uma ação, mostra o **próximo passo** (`SicatNextStep`).
- [ ] Contraste e tamanho de fonte conferidos em tema claro e escuro; alvos ≥ ~48px.
- [ ] Tudo em pt-BR, sem inglês.
- [ ] Termo novo? Cadastre em `src/config/glossary.js` (não invente texto solto).
