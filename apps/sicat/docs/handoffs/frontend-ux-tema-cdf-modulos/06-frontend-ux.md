# 06 — Frontend UX: tema, navegação modular, módulo CDF

- **work_id:** `frontend-ux-tema-cdf-modulos`
- **Fase:** 06
- **Owner:** `frontend-vue-ux-mtr`
- **Data:** 2026-04-25
- **Status:** done

## 0. Decisão de produto — CDF (não CDR)

A nomenclatura adotada para o módulo é **CDF — Certificado de Destinação Final**.

Justificativa:

- A API CETESB e o backend SICAT já operam com `cdf.generate` e `cdf.download`
  (ver [src/workers/operation-handlers.ts](../../../src/workers/operation-handlers.ts) e
  [src/services/manifest-service.ts](../../../src/services/manifest-service.ts)).
- O frontend já tem `enqueueCdfGenerate`, `enqueueCdfDownload`,
  `listCdfCertificates`, `downloadCdfDocument` em
  [frontend/src/services/api.js](../../../frontend/src/services/api.js).
- Existe componente real em produção
  `frontend/src/components/DestinadorCdfWorkspace.vue` (removido em fase posterior; CDF unificado em CdfCreateView.vue).
- CDR (Certificado de Recebimento) não existe na superfície atual da CETESB
  consumida; o "recebimento" do MTR é tratado por `manifest.receive`
  separadamente. Misturar CDF/CDR introduziria nome ambíguo e quebraria a
  rastreabilidade com a API.

Portanto: módulo é **CDF** (slug `/cdf`), com possibilidade futura de
estender para CDR sem renomeação.

## 1. Diagnóstico

### 1.1 Inventário de views e módulo

| View | Caminho | Módulo lógico |
| --- | --- | --- |
| `DashboardView` | `/dashboard` | Operação |
| `ManifestsView` | `/manifestos` | Operação · MTR |
| `ManifestCreateView` | `/manifestos/novo` | Operação · MTR |
| `ManifestDetailView` | `/manifestos/:id` | Operação · MTR |
| `ManifestReportView` | `/relatorios/mtrs` | Relatórios |
| `JobsView` | `/jobs` | Monitoramento |
| `MtrProvisorioListView` | `/mtr-provisorio` | Operação · MTR |
| `MtrProvisorioCreateView` | `/mtr-provisorio/novo` | Operação · MTR |
| `MtrProvisorioDetailView` | `/mtr-provisorio/:id` | Operação · MTR |
| `DmrListView` | `/dmr` | Operação · DMR |
| `DmrPendentesView` | `/dmr/pendentes` | Operação · DMR |
| `DmrCreateView` | `/dmr/novo` | Operação · DMR |
| `DmrDetailView` | `/dmr/:dmrId` | Operação · DMR |
| `OperationsDashboardView` | `/operacao/dashboard` | Monitoramento |
| `JobsConsoleView` | `/operacao/jobs` | Monitoramento |
| `AuditExplorerView` | `/operacao/auditoria` | Monitoramento |
| `CetesbAccountsHealthView` | `/operacao/cetesb-health` | Monitoramento |
| `MtrReportsView` | `/operacao/relatorios/mtr` | Relatórios |
| `CommandCenterView` | `/operacao/command-center` | Inteligência |
| `ConversationalChatAppView` | `/conversacional/chat` | Inteligência |
| `AccessAdminView` | `/admin/acessos` | Administração |
| `SessionAccountView` | `/sessao` | Administração (acessível pelo user menu) |
| (novo) CDF | `/cdf`, `/cdf/novo` | Operação · CDF |

### 1.2 CDF/CDR acoplado hoje

- **`frontend/src/components/DestinadorCdfWorkspace.vue`** (792 linhas) —
  componente standalone usado SOMENTE em `ManifestsView.vue` (L6 e L2014).
  Já encapsula filtros, listagem, geração, download síncrono. Não está
  acoplado ao detalhe de um manifesto único — recebe `selectedManifests`
  por prop. Pode ser usado standalone com `selectedManifests=[]`.
- **`frontend/src/composables/useCetesbOperationalFlows.js`** (634 linhas) —
  consumido por `frontend/src/components/CetesbOperationalFlowsPanel.vue`,
  combina recebimento (`manifest.receive`) + geração CDF
  (`submitCdfGenerate`) + download CDF + monitoramento de job. Como o
  destino é por manifesto, é caro extrair sem regredir UX. Mantido neste
  ciclo; recomendado dividir num próximo ciclo (`useManifestReceiveFlow`,
  `useCdfFlowFromManifest`).
- **`ManifestDetailView.vue`** (L325-L334) já mostra um card "Fluxos do
  destinador" mandando o usuário voltar para a listagem. Atualizado nesta
  fase para também levar diretamente ao módulo CDF com pré-preenchimento.

### 1.3 Conflitos de tema (dark/light)

- `frontend/src/styles/tokens.css` define `--color-bg: #0f1d18` no dark.
- `frontend/src/plugins/vuetify.js` registra `vuexyDark.background:
  '#0F1D18'` (mesmo tom).
- `frontend/src/views/HomeLandingView.vue` L276 usa `--home-bg: #03131a`
  (azulado profundo da identidade pública).
- Resultado: a área autenticada é verde-escuro e a home pública é
  azul-petróleo profundo. **Quebra a continuidade visual.**

Correção desta fase: alinhar a área autenticada ao `#03131a` da home,
mantendo o verde como cor primária funcional.

### 1.4 Duplicidades de menu remanescentes (após DL-098)

DL-098 já resolveu `Jobs vs CO · Jobs` e `Relatório MTR vs CO · Relatório
MTR` agrupando-os em "Centro Operacional". Não há duplicidades novas. O
prefixo `CO ·` foi removido na DL-098 (verificado em
`frontend/src/config/navigation.js`).

### 1.5 Repetições candidatas a componentes compartilhados

- Status badges aparecem em `ManifestsView`, `JobsView`, `DashboardView`,
  `DestinadorCdfWorkspace`, `JobsConsoleView` — cada uma com sua função
  `normalizeStatusClass`. Justifica `frontend/src/lib/status-map.js`
  central (criado nesta fase, adoção incremental).
- Empty state, filtros e page header já têm semente em `SicatPageHeader`
  (DL-098); demais componentes (`SicatEmptyState`, `SicatFilterPanel`)
  ficam como recomendação para próximo ciclo, evitando especulação.

### 1.6 Riscos

- Mudar o background dark de `#0f1d18` → `#03131a` afeta todas as views
  autenticadas. Mitigação: tokens centralizados; sem cores hardcoded
  bloqueantes nos componentes principais (verificado em `App.vue`,
  `SicatAppShell`, `SicatTopbar`, `DashboardView`).
- Adicionar `/cdf` standalone sem remover o workspace de `ManifestsView`
  preserva todos os fluxos atuais (zero regressão funcional).

## 2. Plano em fases

1. **Tema**: alinhar dark `#03131a` + verificar light.
2. **Navegação modular**: adicionar campo `module` em
   `NAVIGATION_GROUPS`, expor para drawer mobile com seções rotuladas
   por módulo. Sem renomeação de grupos existentes (DL-098 estável).
3. **Módulo CDF**: criar `CdfView`, rotas `/cdf` e `/cdf/novo`, entrada
   no menu (módulo Operação), atalho contextual em `ManifestDetailView`.
4. **`status-map.js`**: criar utilitário central, sem migração massiva
   neste ciclo.
5. **App Shell**: já decomposto na DL-098 (`SicatThemeToggle` /
   `SicatAccountChip` já vivem dentro de `SicatTopbar`/`SicatUserMenu`).
   Sem nova extração necessária — não regredir.
6. **Refinamento de telas**: fora do escopo desta fase para preservar
   foco; registrado no checkpoint para próximo ciclo.
7. **Mobile**: drawer já existe (`SicatMobileDrawer`), apenas reagrupado
   por módulo nesta fase.

## 3. Implementação

### 3.1 Tema dark `#03131a`

Arquivos alterados:

- [frontend/src/styles/tokens.css](../../../frontend/src/styles/tokens.css)
  — bloco `:root[data-theme='dark']`: `--color-bg: #03131a`,
  `--color-bg-accent: #06202a`, `--color-sidebar: #04181f`,
  `--color-surface: #08222b`, `--color-surface-raised: #0e2c36`,
  `--color-surface-subtle: #103642`. Mantém o verde primário `#34c993`
  como acento funcional, alinhando ao gradiente da home.
- [frontend/src/plugins/vuetify.js](../../../frontend/src/plugins/vuetify.js)
  — `vuexyDark.background: '#03131A'`,
  `vuexyDark.surface: '#08222B'`,
  `vuexyDark.surface-bright: '#0E2C36'`,
  `vuexyDark.surface-light: '#103642'`. Vuetify continua emitindo
  `rgb(var(--v-theme-surface))` consistente com tokens CSS.

Light: revisado, permanece intencional (`#f2f8f4`/`#ffffff`).

### 3.2 Navegação modular

- [frontend/src/config/navigation.js](../../../frontend/src/config/navigation.js)
  — adicionado campo `module` em cada grupo:
  - `home`, `mtr`, `mtr-provisorio`, `dmr`, **`cdf` (novo)** → `operacao`
  - `centro-operacional` → `monitoramento`
  - `conversacional` → `inteligencia`
  - `admin` → `administracao`

  Helper novo `groupNavigationByModule(groups)` que retorna seções
  (`{ moduleId, moduleLabel, groups }`) consumidas pelo
  `SicatMobileDrawer` para renderizar separadores por módulo (e disponível
  para evolução futura do desktop).

- [frontend/src/components/shell/SicatMobileDrawer.vue](../../../frontend/src/components/shell/SicatMobileDrawer.vue)
  — passou a renderizar subheader por módulo via
  `groupNavigationByModule`. Comportamento desktop (`SicatNavigation`)
  permanece inalterado para evitar regressão.

### 3.3 Módulo CDF

- Criados:
  - [frontend/src/views/CdfListView.vue](../../../frontend/src/views/CdfListView.vue)
    — wrapper standalone do `DestinadorCdfWorkspace` com slot de header
    próprio, suportando query `?manifestId=...` para pré-seleção.

- Editados:
  - [frontend/src/router.js](../../../frontend/src/router.js) — duas
    rotas novas: `/cdf` (`CdfList`) e `/cdf/novo` (`CdfNovo`), ambas
    `requiresActiveCetesbAccount: true`. Rotas legadas inalteradas.
  - [frontend/src/config/navigation.js](../../../frontend/src/config/navigation.js)
    — grupo novo `cdf` (`Certificados (CDF)`), módulo `operacao`,
    com itens `Certificados emitidos` (`/cdf`) e `Gerar CDF` (`/cdf/novo`).
  - [frontend/src/views/ManifestDetailView.vue](../../../frontend/src/views/ManifestDetailView.vue)
    — card "Fluxos do destinador" agora oferece dois botões: "Abrir
    listagem operacional" (mantido) e **"Gerar CDF a partir deste
    manifesto"** que navega para `/cdf/novo?manifestId=:id`.

- Compatibilidade:
  - `ManifestsView` continua montando o `DestinadorCdfWorkspace`
    embutido (mantido o fluxo já validado em produção).
  - `useCetesbOperationalFlows.js` permanece intocado para preservar
    o painel `CetesbOperationalFlowsPanel`.

### 3.4 Status map central

- Criado [frontend/src/lib/status-map.js](../../../frontend/src/lib/status-map.js):
  exporta `JOB_STATUS_TONES`, `MANIFEST_STATUS_TONES`,
  `resolveJobStatusTone(status)`, `resolveManifestStatusTone(status)`.
  Adoção opcional/incremental; não regredir as views existentes neste
  ciclo.

### 3.5 App Shell

Sem mudanças — `SicatAppShell`, `SicatTopbar`, `SicatNavigation`,
`SicatMobileDrawer`, `SicatUserMenu` da DL-098 continuam fonte única.

### 3.6 Mobile

`SicatMobileDrawer` agora separa por módulo (3.2). Tabelas e filtros das
views internas não foram alterados nesta fase para manter escopo.

## 4. Validação

Comandos executados (raiz do repo):

- `cd frontend && npm run build` — **OK** (ver § 5).
- `npm run typecheck` (raiz) — **OK** (ver § 5).
- `npm run validate:openapi` (raiz) — **OK** (ver § 5).
- `npm run test:ui` — **skip** nesta fase; entregue para `tester-qa-mtr`.

## 5. Resultado dos comandos

- `cd frontend && npm run build` → **OK** (`✓ built in 7.85s`).
  Bundles principais: `index-CS61S4Mo.css` 1.019,26 kB (gzip 161,43 kB)
  e `index-BDLlp44c.js` 1.360,07 kB (gzip 407,97 kB). Warning de
  chunk-size pré-existente, não regrediu.
- `npm run typecheck` (raiz) → **OK** (sem erros, `tsc -p tsconfig.json
  --noEmit`).
- `npm run validate:openapi` (raiz) → **OK** (OpenAPI validado, política
  de fonte da verdade CETESB validada, 691 arquivos de markdown sem
  links quebrados).
- `npm run test:ui` → **skip** nesta fase, delegado para `tester-qa-mtr`.

## 6. Compatibilidade preservada

- Rotas legadas (`/jobs`, `/relatorios/mtrs`, `/operacao/jobs`,
  `/operacao/relatorios/mtr`, `/sessao`) **não foram tocadas**.
- Guards (`requiresSicatAuth`, `requiresActiveCetesbAccount`,
  `requiresAdminAccess`) **inalterados**.
- `useAuthStore`, `auth.js`, `cetesb-account` store **inalterados**.
- `DestinadorCdfWorkspace` continua acessível pelo fluxo de
  `ManifestsView` (sem deprecation imediata — coexistência intencional).
- `useCetesbOperationalFlows.js` **inalterado** (ainda consumido por
  `CetesbOperationalFlowsPanel`).
- Tokens centralizados — nenhuma cor hardcoded foi removida das views;
  o ajuste foi pontual em `tokens.css` e `vuetify.js`.

## 7. Ressalvas e próximos refinamentos

- Dividir `useCetesbOperationalFlows.js` em
  `useManifestReceiveFlow` + `useCdfFlowFromManifest` quando alguma view
  precisar reutilizar isoladamente (alta complexidade, baixa demanda
  imediata).
- Adoção do `status-map.js` em `ManifestsView`, `JobsView`,
  `DashboardView`, `JobsConsoleView` em ciclo posterior, com testes UI.
- Refatorar `DestinadorCdfWorkspace.vue` (792 linhas) em subcomponentes
  (`SicatCdfFilterPanel`, `SicatCdfList`) — fora desta fase.
- Componentes `SicatEmptyState`, `SicatFilterPanel`,
  `SicatDateRangeFilter`, `SicatSearchInput`, `SicatSelectFilter`:
  criar quando houver 3+ chamadas reais (evitar abstração especulativa).
- Mobile: revisar tabelas de `JobsView` e `ManifestsView` em viewport
  <600px (ainda usam `v-table` puro).
- A subseção 5 deste checkpoint deve ser preenchida após a execução
  final dos comandos de validação (linkado no PR).

## 8. Handoff

- Próximo agente: `tester-qa-mtr` (fase 09).
- Foco do QA:
  - dark `#03131a` em todas as views autenticadas;
  - navegação por módulo no drawer mobile;
  - rota `/cdf` standalone (lista, geração, download);
  - atalho contextual em `ManifestDetailView` →
    `/cdf/novo?manifestId=:id`;
  - rotas legadas `/jobs`, `/relatorios/mtrs`, `/operacao/jobs`,
    `/operacao/relatorios/mtr` continuam navegáveis;
  - guards de auth/CETESB/admin preservados;
  - `cd frontend && npm run build`, `npm run typecheck`,
    `npm run validate:openapi` na raiz.
- Artefatos:
  - este checkpoint;
  - [00-orchestration.md](00-orchestration.md).
