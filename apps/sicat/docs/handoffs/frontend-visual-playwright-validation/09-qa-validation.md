# 09 - QA Validation

## Objetivo da fase
Executar validacao visual completa com Playwright nas telas principais do frontend SICAT, confirmar erros visuais reportados (fontes, espacamento, quebras de layout/calendario e padrao Vuexy) e consolidar evidencia objetiva para correcao pelo frontend-vue-ux-mtr.

## Comandos executados
1. Suite Playwright existente (frontend):
- `Set-Location c:\GIT\PADILHA\sicat\frontend; npm run test:ui`
- Resultado: `26` testes executados, `11 passed`, `15 failed`.

2. Smoke visual complementar para cobertura obrigatoria de telas principais (com mocks de API):
- Comando (Node + Playwright, inline): captura de `10` telas em `frontend/test-results/qa-main-screens/`.
- Resultado: `screens_checked=10`, `screens_failed=0`, `console_issues=10` (warnings Vuetify deprecados).

3. Captura adicional dedicada para telas de autenticacao sem redirecionamento:
- Comando (Node + Playwright, inline): login + selecao de conta CETESB em estado sem conta ativa.
- Resultado: screenshot de login bruto e selecao CETESB bruta gerados com sucesso.

## Cobertura de telas obrigatorias
Cobertura exigida: Login, Selecao de conta CETESB, Dashboard, Manifestos, Criacao de manifesto, Detalhe de manifesto, Relatorio, Jobs, Sessao/Conta, Admin de acessos.

Evidencias principais:
- Capturas smoke principal: `frontend/test-results/qa-main-screens/01-login.png` ate `frontend/test-results/qa-main-screens/10-admin-access.png`
- Capturas autenticacao sem redirecionamento: `frontend/test-results/qa-main-screens/01-login-raw.png`, `frontend/test-results/qa-main-screens/02-cetesb-account-selection-raw.png`
- Resumo estruturado de cobertura/console: `frontend/test-results/qa-main-screens/summary.json`

## Matriz pass/fail por tela
| Tela | Evidencia principal | Resultado | Observacao |
|---|---|---|---|
| Login | `frontend/test-results/qa-main-screens/01-login-raw.png` | PASS | Tela renderizada. Em fluxo com sessao ativa, rota redireciona para dashboard (comportamento esperado do guard). |
| Selecao de conta CETESB | `frontend/test-results/qa-main-screens/02-cetesb-account-selection-raw.png` | PASS | Tela renderizada com conta mockada sem conta ativa selecionada. |
| Dashboard | `frontend/test-results/qa-main-screens/03-dashboard.png` | PASS | Renderizacao estavel no smoke complementar. |
| Manifestos | `frontend/test-results/qa-main-screens/04-manifestos.png` | FAIL PARCIAL | Renderiza, mas a suite oficial falha em casos de menu de acoes/overflow e semantica de popover. |
| Criacao de manifesto | `frontend/test-results/qa-main-screens/05-manifest-create.png` | PASS | Renderizacao estavel no smoke complementar. |
| Detalhe de manifesto | `frontend/test-results/qa-main-screens/06-manifest-detail.png` | PASS | Renderizacao estavel no smoke complementar. |
| Relatorio | `frontend/test-results/qa-main-screens/07-report.png` | PASS | Renderizacao estavel; calendario/inputs de data aparecem nos snapshots. |
| Jobs | `frontend/test-results/qa-main-screens/08-jobs.png` | PASS | Renderizacao estavel no smoke complementar. |
| Sessao/Conta | `frontend/test-results/qa-main-screens/09-session-account.png` | PASS | Renderizacao estavel no smoke complementar. |
| Admin de acessos | `frontend/test-results/qa-main-screens/10-admin-access.png` | PASS | Renderizacao estavel no smoke complementar com permissao admin mockada. |

## Achados priorizados (severidade + arquivo alvo)

### 1) HIGH - Divergencia de tipografia vs padrao Vuexy (Public Sans nao aplicada no body)
- Evidencia:
  - Saida da suite: `Body font-family: Roboto, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
  - Screenshot: `frontend/test-results/10-font-rendering.png`
  - Smoke complementar confirma font family Roboto em todas as telas no `summary.json`.
- Impacto:
  - Quebra de consistencia visual reportada (padrao Vuexy/fonte), afetando identidade visual global.
- Arquivos alvo para correcao:
  - `frontend/src/styles/base.css`
  - `frontend/src/styles/tokens.css`
  - `frontend/src/App.vue`

### 2) HIGH - Regressao em menu de acoes de Manifestos (popover/semantica/layout)
- Evidencia:
  - Falhas em `tests/ui/manifests-resync.spec.js`:
    - `menu de acoes do manifesto abre fora do container com overflow da grid`
    - `menu de acoes ... abre para cima quando nao ha espaco util abaixo`
    - `menu de acoes ... fecha ao clicar fora`
    - `menu de acoes ... fecha com Escape`
  - Artefatos:
    - `frontend/test-results/manifests-resync-menu-de-a-144c5-tainer-com-overflow-da-grid/test-failed-1.png`
    - `frontend/test-results/manifests-resync-menu-de-a-a0628-paço-útil-abaixo-do-trigger/test-failed-1.png`
    - `frontend/test-results/manifests-resync-menu-de-a-aa31f-a-ao-clicar-fora-do-popover/test-failed-1.png`
    - `frontend/test-results/manifests-resync-menu-de-a-52cc0-cape-sem-perder-usabilidade/test-failed-1.png`
  - Snapshot de erro mostra lista de acoes inline no trigger (nao exposta como `role=menu` esperado).
- Impacto:
  - Risco funcional e de usabilidade em acao critica da listagem de manifestos.
- Arquivo alvo para correcao:
  - `frontend/src/views/ManifestsView.vue`

### 3) MEDIUM - Quebra na auditoria estrutural de navbar (teste nao encontra nav no fluxo auditado)
- Evidencia:
  - Falha: `tests/ui/audit.spec.ts` teste `04-Navbar Visibility & Structure` com `Found 0 nav/header elements`.
  - Artefato: `frontend/test-results/audit-Frontend-Vuexy-Audit-80949-Navbar-Visibility-Structure/test-failed-1.png`
  - Error context mostra tela de login; sem sessao, layout auditado nao inclui shell com navbar.
- Impacto:
  - Sinaliza desalinhamento entre auditoria e estado de navegacao real (pode mascarar regressao real ou gerar falso negativo).
- Arquivos alvo para correcao:
  - `frontend/tests/ui/audit.spec.ts`
  - (se objetivo era navbar mesmo sem autenticacao) revisar shell em `frontend/src/views/LoginView.vue` e `frontend/src/App.vue`

### 4) MEDIUM - Falhas sistematicas no smoke responsivo por divergencia de copy/heading esperada
- Evidencia:
  - Falhas em `tests/ui/responsive-smoke.spec.js` para mobile/tablet/desktop/wide em:
    - `login em 2 etapas renderiza bem ...`
    - `dashboard renderiza bem ...`
  - Artefatos (exemplos):
    - `frontend/test-results/responsive-smoke-UX-respon-67c71-pas-renderiza-bem-em-mobile/test-failed-1.png`
    - `frontend/test-results/responsive-smoke-UX-respon-a6fec-ard-renderiza-bem-em-mobile/test-failed-1.png`
  - Snapshot mostra heading atual diferente do esperado (teste procura `Acesso SICAT`, UI atual usa copy distinta).
- Impacto:
  - Suite responsiva perde capacidade de detectar regressao real de layout por falhar em assertions textuais desatualizadas.
- Arquivos alvo para correcao:
  - `frontend/tests/ui/responsive-smoke.spec.js`
  - Opcionalmente alinhar copy em `frontend/src/views/LoginView.vue` e `frontend/src/views/DashboardView.vue` se a mudanca nao foi intencional.

### 5) LOW - Warning deprecado Vuetify em troca de tema
- Evidencia:
  - `summary.json` registrou 10 warnings repetidos:
    - `[Vuetify UPGRADE] 'theme.global.name.value = vuexy' is deprecated, use 'theme.change('vuexy')' instead.`
- Impacto:
  - Nao bloqueia renderizacao, mas gera ruido de console e risco de quebra futura em upgrade.
- Arquivos alvo para correcao:
  - `frontend/src/App.vue`
  - `frontend/src/views/LoginView.vue`
  - `frontend/src/views/CetesbAccountSelectionView.vue`

## Erros de build/console e divergencias reportadas
1. Resultado agregado Playwright:
- `15 failed`, `11 passed` na suite oficial.

2. Console:
- Sem erro fatal no smoke complementar.
- Warnings deprecados Vuetify detectados (10 ocorrencias).

3. Fontes/espacamento/padrao Vuexy:
- Divergencia de fonte principal confirmada objetivamente (Roboto em vez de Public Sans no body).
- Estrutura visual geral das telas principais renderiza, mas falhas de menu de acoes em Manifestos indicam regressao de comportamento/layout local.

4. Calendario:
- Controles de calendario renderizam na tela de Manifestos (vide error context e screenshots).
- Nao foi reproduzida quebra fatal de calendario nesta rodada; manter verificacao apos ajuste de menu/layout e alinhamento da suite responsiva.

## Decisao da fase
Status final: `ready_for_frontend_fix`

Justificativa:
- A validacao visual completa foi executada com cobertura obrigatoria de telas e evidencias consolidadas.
- Ha achados objetivos priorizados para correcao no frontend (fonte padrao, menu de acoes de Manifestos e alinhamento da suite visual responsiva/audit).

## Handoff recomendado (frontend-vue-ux-mtr)
`next_agent_required`

Prompt sugerido para `frontend-vue-ux-mtr`:

- work_id: `frontend-visual-playwright-validation`
- fase: correcao visual frontend a partir da QA 09
- prioridade de implementacao:
  1. Corrigir tipografia global para aderir ao padrao Vuexy/Public Sans e remover fallback indevido de Roboto no body.
  2. Corrigir menu de acoes em Manifestos para comportamento consistente (popover, overflow, abertura para cima, fechar ao clicar fora/Escape, acessibilidade por role).
  3. Alinhar fluxo de troca de tema para API atual do Vuetify (`theme.change`) e remover warning deprecado.
  4. Atualizar specs Playwright (`audit.spec.ts` e `responsive-smoke.spec.js`) para refletir copy/layout atual sem perder cobertura de regressao visual.
- evidencias obrigatorias para usar no fix:
  - `frontend/test-results/qa-main-screens/summary.json`
  - `frontend/test-results/qa-main-screens/*.png`
  - `frontend/test-results/manifests-resync-*/test-failed-1.png`
  - `frontend/test-results/responsive-smoke-*/test-failed-1.png`
  - `frontend/test-results/audit-Frontend-Vuexy-Audit-80949-Navbar-Visibility-Structure/test-failed-1.png`
