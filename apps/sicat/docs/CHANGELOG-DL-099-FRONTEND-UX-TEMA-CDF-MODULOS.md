<!-- markdownlint-disable MD013 MD024 MD033 MD036 MD040 -->

# Changelog DL-099 — Frontend UX: tema autenticado, navegação modular e módulo CDF

- **work_id:** `frontend-ux-tema-cdf-modulos`
- **Decision log:** [DL-099](copilot/13-decision-log.md#dl-099)
- **Data:** 2026-04-25
- **Status:** ✅ Concluído (cadeia `frontend-ux-tema-cdf-modulos` fechada)

## Visão de produto

Evolução do frontend autenticado do SICAT sobre a base da DL-098:

- o dark theme da área autenticada foi alinhado à identidade da home pública,
  adotando `#03131a` como base visual;
- a navegação passou a comunicar explicitamente os módulos do produto no
  drawer mobile: Operação, Monitoramento, Inteligência e Administração;
- CDF ganhou módulo próprio com rotas dedicadas (`/cdf`, `/cdf/novo`),
  deixando de depender exclusivamente do contexto de Manifestos;
- o detalhe do manifesto passou a oferecer um atalho contextual para gerar
  CDF a partir do item selecionado;
- um utilitário central de status foi introduzido para convergência futura
  dos badges operacionais.

## Mudanças principais

| Eixo | Mudança | Resultado |
| --- | --- | --- |
| Tema | Tokens dark e tema Vuetify alinhados a `#03131a` | Continuidade visual entre home pública e área autenticada |
| Navegação | `navigation.js` passou a declarar `module` por grupo e o helper `groupNavigationByModule()` | Drawer mobile organizado por domínio de produto |
| CDF | Novo módulo/rota `/cdf` e `/cdf/novo` com `CdfView.vue` | Emissão e consulta de CDF ficam descobertas e navegáveis como domínio próprio |
| Contexto manifesto | Botão em `ManifestDetailView.vue` abre `/cdf/novo?manifestId=:id` | Fluxo de emissão a partir do manifesto continua direto |
| Status | Novo `frontend/src/lib/status-map.js` | Base central para migração incremental de badges/status |

## Arquivos de produto tocados

- [frontend/src/styles/tokens.css](../frontend/src/styles/tokens.css)
- [frontend/src/plugins/vuetify.js](../frontend/src/plugins/vuetify.js)
- [frontend/src/config/navigation.js](../frontend/src/config/navigation.js)
- [frontend/src/components/shell/SicatMobileDrawer.vue](../frontend/src/components/shell/SicatMobileDrawer.vue)
- [frontend/src/views/CdfListView.vue](../frontend/src/views/CdfListView.vue)
- [frontend/src/views/ManifestDetailView.vue](../frontend/src/views/ManifestDetailView.vue)
- [frontend/src/lib/status-map.js](../frontend/src/lib/status-map.js)
- [frontend/src/router.js](../frontend/src/router.js)

## Impacto ao usuário

- A área autenticada deixa de parecer um produto paralelo à home e passa a
  compartilhar a mesma direção visual dark.
- O usuário encontra CDF como módulo explícito em Operação, sem depender de
  descobrir o workspace embutido em Manifestos.
- Em mobile, o drawer fica mais legível porque os grupos aparecem agregados
  por módulo e não apenas em uma lista longa.
- URLs e bookmarks antigos continuam válidos; a mudança melhora orientação,
  não altera contrato de navegação já conhecido pelo operador.

## Impacto técnico

- `frontend/src/config/navigation.js` consolida não só os grupos, mas também
  a camada de módulo usada para composição mobile e para evolução futura do
  desktop.
- `DestinadorCdfWorkspace.vue` passa a ser tratado explicitamente como
  workspace reutilizável: continua dentro de `ManifestsView` e também opera
  standalone em `CdfView.vue`.
- `frontend/src/lib/status-map.js` formaliza um ponto único para tons de
  status sem impor migração transversal imediata.
- O escopo evitou refactors amplos em `useCetesbOperationalFlows.js` e no
  próprio `DestinadorCdfWorkspace.vue`; esses riscos seguem deferidos.

## Validação

| Comando ou evidência | Resultado |
| --- | --- |
| `cd frontend && npm run build` | ✅ sucesso (~7.8s); warning de chunk size pré-existente |
| `npm run typecheck` | ✅ zero erros |
| `npm run validate:openapi` | ✅ exit 0; OpenAPI + links markdown + política CETESB validados |
| QA fase 09 | ✅ APROVADO COM RESSALVA |
| `npm run test:ui` | SKIP justificado no checkpoint de QA por limitação do ambiente |

## Referências cruzadas

- [docs/handoffs/frontend-ux-tema-cdf-modulos/00-orchestration.md](handoffs/frontend-ux-tema-cdf-modulos/00-orchestration.md)
- [docs/handoffs/frontend-ux-tema-cdf-modulos/06-frontend-ux.md](handoffs/frontend-ux-tema-cdf-modulos/06-frontend-ux.md)
- [docs/handoffs/frontend-ux-tema-cdf-modulos/09-qa-validation.md](handoffs/frontend-ux-tema-cdf-modulos/09-qa-validation.md)
- [docs/handoffs/frontend-ux-tema-cdf-modulos/10-documentation-final.md](handoffs/frontend-ux-tema-cdf-modulos/10-documentation-final.md)
- [docs/copilot/13-decision-log.md](copilot/13-decision-log.md#dl-099)
- [docs/FRONTEND-COMPONENTS-ARCHITECTURE.md](FRONTEND-COMPONENTS-ARCHITECTURE.md)
- [docs/FRONTEND-UX-NAVIGATION.md](FRONTEND-UX-NAVIGATION.md)