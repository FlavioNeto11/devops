# Frontend UX

## Objetivo da fase

Corrigir a restrição global de largura do shell autenticado para remover a faixa lateral branca e permitir que as telas usem toda a largura útil da viewport sem quebrar a responsividade.

## Arquivos analisados

- `frontend/src/App.vue`
- `frontend/src/styles/base.css`
- `frontend/src/styles/tokens.css`
- `frontend/src/main.js`
- `docs/handoffs/frontend-full-width-layout/00-orchestration.md`

## Causa raiz

O shell autenticado aplicava a classe `.container-xxl` em navbar, conteúdo e footer dentro de `frontend/src/App.vue`. Essa classe impunha `max-width: 1480px` com centralização horizontal, o que deixava sobra lateral visível em viewports largas e fazia páginas como Manifestos e Relatório MTR parecerem presas a um container estreito.

## Decisões

- Corrigir a origem estrutural no shell global, sem ajustes pontuais por view.
- Manter padding lateral responsivo para desktop e mobile.
- Não alterar views específicas porque a restrição principal estava no contêiner compartilhado.

## Arquivos alterados

- `frontend/src/App.vue`

## Implementação

- Removido o `max-width` fixo da classe `.container-xxl` no shell autenticado.
- Ajustado o padding lateral para `clamp(18px, 2.2vw, 28px)`, preservando respiro visual sem limitar a largura total.
- Removido o estado derivado `isWideViewport`, que ficou sem uso após a simplificação do layout.

## Validações

- Inspeção estrutural do shell autenticado em `App.vue` confirmando que navbar, conteúdo e footer usam a mesma classe global corrigida.
- Diagnóstico do editor sem erros em `frontend/src/App.vue`.
- Task `shell: frontend: test:ui:validation` executada com sucesso no workspace; os checks acionados passaram, incluindo `validate:openapi`, `smoke:health`, `smoke:openapi`, `test:auth` e `test:api`.
- Runtime frontend iniciado em `http://127.0.0.1:5174/` e validado no navegador com carregamento do shell autenticado.
- Validação visual em desktop largo na rota `/manifestos`, confirmando remoção da faixa lateral branca e expansão do shell por toda a largura útil da viewport.
- Validação visual em viewport estreito na rota `/relatorios/mtrs`, confirmando preservação da responsividade sem regressão estrutural visível.
- Medição em runtime nas rotas `/manifestos` e `/relatorios/mtrs` com `.container-xxl` reportando `max-width: none` e largura efetiva alinhada ao body do documento.

## Handoff para próxima fase

Próximo agente: `tester-qa-mtr`

Foco sugerido:

- validar visualmente Manifestos e Relatório MTR em desktop largo e mobile;
- confirmar ausência de regressão no header, footer e drawer mobile;
- executar os checks automatizados de frontend disponíveis no workspace.
