# Orchestration — public-homepage-operational-demo

## Demanda resumida
Refatorar a homepage publica (`/`) do frontend Vue 3 + Vite + Vuetify para uma experiencia premium orientada por Canvas animado, narrativa cinematografica em 9 cenas operacionais do SICAT, controles interativos (play/pause/restart/scene jump/hit areas), arquitetura modular de engine/cenas/entidades/helpers, responsividade, acessibilidade e validacao com `npm run build` no frontend. Manter `/login` e fluxo de autenticacao intactos.

## Classificacao obrigatoria
```yaml
orchestration:
  work_id: "public-homepage-operational-demo"
  intent: "implement"
  complexity: "complex"
  domains:
    - "frontend-ux"
    - "qa"
    - "docs"
  first_agent: "frontend-vue-ux-mtr"
  phase_sequence:
    - phase: "06-frontend-ux"
      agent: frontend-vue-ux-mtr
      required: true
      reason: "Implementar arquitetura Canvas + narrativa visual + integracao da home publica sem quebrar rotas existentes."
    - phase: "09-qa-validation"
      agent: tester-qa-mtr
      required: true
      reason: "Executar build do frontend e validar regressao basica de rotas (`/` e `/login`) e integridade de imports/runtime."
    - phase: "10-documentation-final"
      agent: documentador-mtr
      required: true
      reason: "Consolidar handoff final com arquitetura entregue, decisoes tecnicas, validacoes e riscos residuais."
```

## Criterios de pronto por fase
- `06-frontend-ux`
  - Homepage publica centrada em Canvas (nao baseada em cards/timeline HTML estaticos).
  - Estrutura modular separando componente Vue, engine, cenas, entidades, helpers e interacoes.
  - Sequencia narrativa completa (cenas 1-9) com transicoes suaves e controles interativos obrigatorios.
  - Integracao de blocos de funcionalidades conectados ao Canvas (atalhos para cenas IA/Tempo real/NFC/Baixa/Rastreabilidade).
  - Responsividade desktop/tablet/mobile e respeito a `prefers-reduced-motion`.
  - `/login` preservado; sem alteracoes em autenticacao.
- `09-qa-validation`
  - `npm run build` executado em `frontend` com sucesso.
  - Sem erros de import/build/runtime conhecidos relacionados a mudancas.
  - Verificacao funcional minima das rotas publicas essenciais.
- `10-documentation-final`
  - Checkpoint final com resumo tecnico, arquivos alterados, evidencias de validacao e proximos passos.

## Checkpoints esperados
- `docs/handoffs/public-homepage-operational-demo/06-frontend-ux.md`
- `docs/handoffs/public-homepage-operational-demo/09-qa-validation.md`
- `docs/handoffs/public-homepage-operational-demo/10-documentation-final.md`

## Handoff para primeira fase
Owner inicial: `frontend-vue-ux-mtr`.
Escopo: implementar integralmente a nova homepage publica em Canvas com narrativa interativa e arquitetura modular, conforme requisitos detalhados da solicitacao original.
