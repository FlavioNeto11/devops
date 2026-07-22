---
title: "Plano Mestre de Evolução de UX/UI — Plataforma NovaIT"
status: reference
applies_to: [platform]
updated: 2026-07-22
language: pt-BR
---

# Plano Mestre de Evolução de UX/UI — Plataforma NovaIT

> Auditoria completa de experiência do usuário, UI design, acessibilidade, navegação e consistência
> visual de todas as superfícies do monorepo `C:\devops` (FlavioNeto11/devops), com plano executável
> de evolução por ondas. Documento gerado por auditoria multiagente baseada em evidências do
> repositório, com verificação adversarial de achados e calibração de notas.

## Sumário

1. [Resumo executivo](#1-resumo-executivo)
2. [SHA, data e método da análise](#2-sha-data-e-método-da-análise)
3. [Inventário completo das superfícies](#3-inventário-completo-das-superfícies)
4. [Matriz produto × papel × jornada × nível de acesso](#4-matriz-produto--papel--jornada--nível-de-acesso)
5. [Scorecard por produto](#5-scorecard-por-produto)
6. [Diagnóstico transversal da plataforma](#6-diagnóstico-transversal-da-plataforma)
7. [Diagnóstico detalhado por produto](#7-diagnóstico-detalhado-por-produto)
8. [Problemas de integração entre Portal, Console e aplicações](#8-problemas-de-integração-entre-portal-console-e-aplicações)
9. [Gaps do Design System e estratégia de adoção](#9-gaps-do-design-system-e-estratégia-de-adoção)
10. [Backlog priorizado de UX/UI](#10-backlog-priorizado-de-uxui)
11. [Quick wins](#11-quick-wins)
12. [Roadmap por ondas](#12-roadmap-por-ondas)
13. [Sequência de implementação em PRs pequenos](#13-sequência-de-implementação-em-prs-pequenos)
14. [Dependências, riscos e decisões necessárias](#14-dependências-riscos-e-decisões-necessárias)
15. [Métricas de sucesso](#15-métricas-de-sucesso)
16. [Estratégia de QA e regressão](#16-estratégia-de-qa-e-regressão)
17. [O que não foi possível verificar](#17-o-que-não-foi-possível-verificar)
18. [Perguntas ao responsável de produto](#18-perguntas-ao-responsável-de-produto)
19. [Status de execução (Onda 0/1)](#19-status-de-execução-onda-01--iniciada-em-2026-07-21)

---

## 1. Resumo executivo

Esta auditoria examinou as **16 superfícies** da plataforma NovaIT no commit `a6c95ef` (main,
2026-07-16): Portal, DevOps Console, 12 aplicações de produto, o AI Control Plane (API sem UI) e a
camada de Design System. Método: 16 auditores de superfície + 4 transversais sobre evidência de
repositório (arquivo:linha + trecho verbatim obrigatórios), spot-check ao vivo read-only,
**verificação adversarial de 143 achados P0/P1/P2** (0 mortos, 4 rebaixados, 1 elevado, 3 duplicatas
— nenhuma evidência derrubada) e calibração de notas com rubrica comum (6 ajustes, todos ≤ ±1,0).

**Resultado: 304 achados válidos — 10 P0, 77 P1, 138 P2, 79 P3** — organizados em backlog priorizado
(§10), 15 quick wins (§11), roadmap em 5 ondas (§12) e uma sequência inicial de 16 PRs pequenos (§13).

### O que a plataforma tem de melhor

A base técnica de UX é real e desigual: o **Portal (4,25)** e o **Reqhub (4,00)** são referência
(progressive enhancement, estados exemplares, modal Ctrl+K com focus-trap correto); o **SICAT
(3,70)** tem o design system de produto mais maduro e a IA mais rica; o **Console (3,63)** tem o
melhor vocabulário de estados (skeleton/empty/toast/confirm) do monorepo. A auditoria catalogou
dezenas de **referências positivas internas** (§7) que devem virar padrão — o melhor de cada padrão
de UX de IA, por exemplo, já existe em algum app da casa (§6.3).

### Os cinco problemas que definem esta auditoria

1. **Acesso e exposição (Onda 0).** Três SPAs operacionais abrem sem nenhum login — confirmado ao
   vivo: ContaViva 360 exibe o painel administrativo a anônimos e NeuroEvolui expõe toda a navegação
   CLÍNICA (saúde) com "Novo paciente" a qualquer visitante; no ContaViva Pro a exposição é **real**:
   a API de registros não tem autoridade na borda (UX-CVPRO-001). No GymOps, quem entra por SSO cai
   num app vazio sem erro (UX-GYMOPS-001).
2. **Teclado como bloqueador sistêmico.** A interação primária de 5+ produtos (abrir
   atividade/imóvel/card/linha) é `div/tr/article onClick` sem foco — violação WCAG 2.1.1 nível A
   transversal (UX-A11Y-001), com keyboard trap real no Portal Recorder (UX-PREC-001). A causa é de
   plataforma: o kit compartilhado não oferecia a primitiva e nenhum gate barra o padrão.
3. **Jornadas que morrem no meio.** Edição impossível por contrato inexistente (ContaViva Pro, PUT
   404), 18 navegações mortas (NeuroEvolui), convite sem tela de resgate (BESC), dashboards de
   papéis que não existem (ContaViva 360), sessão expirada sem caminho de volta em 5 apps.
4. **A fonte da verdade mente.** A baseline de specs — que alimenta a esteira automatizada — diz
   `not_started` para um app deployado com auth própria (contaviva-pro), ignora o BESC, e meta-docs
   declaram um kit que o código não usa (imobia) e um build context aposentado (zapbridge) que
   publicaria o frontend errado. Cobertura de UX/a11y nos requisitos: **6 de 381 REQs (1,6%)**.
5. **QA inexistente onde mais dói.** 12 das 14 superfícies com frontend têm zero teste de UI; 4
   estão fora de qualquer CI; os 73 testes do SICAT não rodam em nenhum gate de PR; zero axe na
   plataforma. O app **mais testado** da frota (NeuroEvolui, 76 arquivos de API) publicou as 18
   navegações mortas — o gate era só `vite build`.

### Scorecard (ponderado; detalhes e calibração em §5)

Portal 4,25 · Reqhub 4,00 · Ana Rabottini 3,78 · SICAT 3,70 · RM Ambiental 3,67 · Console 3,63 ·
Portal Recorder 3,48 · BESC 3,45 · Design System 3,43 · GymOps 3,28 · ZapBridge 3,10 · ContaViva Pro
3,10 · NeuroEvolui 2,85 · Imobia 2,83 · **ContaViva 360 2,50**. AI Control Plane: sem nota (sem UI —
experiência-alvo em §7.15).

### O plano em uma olhada

- **Onda 0 (25 itens, ~54 pts):** zerar P0s, acesso e divergências que enganam o operador — começa
  pelos 7 P0 que não dependem de decisão (incluindo o sistêmico UX-A11Y-001); harness de testes
  mínimo ANTES de mexer (PR-01).
- **Onda 1 (137 itens, ~168 pts):** a11y AA dos fluxos principais, fim dos becos de sessão e o
  programa de quick wins — inclui as 2 correções de renderer que consertam contraste em 7+
  superfícies de uma vez.
- **Onda 2 (17 itens, ~44 pts):** um único modelo de tema/dark, adoção incremental de tokens,
  regressão visual — sem uniformizar a identidade das marcas (§9).
- **Onda 3 (58 itens, ~128 pts):** jornadas completas por papel (paciente, perfis contábeis,
  convites), ciclo rascunho→confirmação de IA fechado nas UIs, governança de IA com olhos (D4).
- **Onda 4 (67 itens, ~106 pts):** refinamento, performance percebida e power users.
- **Onda 5 (contínua):** governança — gates de a11y/drift/documentação para não regredir.

**8 decisões (D1–D8, §14.1)** destravam o restante — as três mais urgentes: estratégia de auth dos
apps da Forja (D1), destino do papel `patient` (D2) e dos 7 perfis do ContaViva 360 (D3).

### Recomendação imediata

Executar PR-01 a PR-05 (§13) nesta ordem — harness primeiro, depois os P0s de auth do ContaViva
Pro/360 e NeuroEvolui — e levar D1–D3 ao dono do produto ainda esta semana. Nenhum desses passos
altera regra de negócio; todos têm critério de aceite verificável e método de validação definidos
no backlog (§10.2).

---

## 2. SHA, data e método da análise

| Item | Valor |
|---|---|
| **Commit auditado** | `a6c95eff770b82f6e1bc9d0dbb9e6986d409dfa9` (`a6c95ef`) |
| **Branch** | `main` (HEAD == `origin/main` no momento da auditoria) |
| **Data do commit** | 2026-07-16 |
| **Data da auditoria** | 2026-07-21 |
| **Escopo** | 16 superfícies: Portal `/`, DevOps Console `/devops` (10 abas, incl. Projetos & Tarefas, Conteúdo/CMS, Usuários, Compartilhados), SICAT, GymOps, RM Ambiental, BESC, ZapBridge, Reqhub, Portal Recorder, ContaViva 360, ContaViva Pro, NeuroEvolui, Imobia, Ana Rabottini, AI Control Plane (API-only — análise de experiência-alvo), Design System/tokens/ui-vue/platform-shell |
| **Exclusão** | `apps/forge-pilot-v2` — fixture de pipeline sem código de produto, sem imagem, sem Application do Argo, ausente (corretamente) de `specs/baseline/apps-index.json`. Registrada no inventário, fora da auditoria de produto. |
| **Fora do mandato** | Redesenho de Grafana, Argo CD e Keycloak (ferramentas de terceiros) — avaliados somente acesso, SSO, transições, contexto e retorno à plataforma. |

### Método

1. **Onda A — auditoria por superfície (16 agentes em paralelo).** Cada superfície foi auditada por
   um agente dedicado cobrindo as 9 dimensões da metodologia (inventário, jornadas por papel,
   heurísticas de Nielsen, WCAG 2.2 AA por análise estática, responsividade, estados/feedback,
   RBAC/segurança percebida, design system, UX de IA). Regra dura de evidência: todo achado exige
   `arquivo:linhas` + trecho verbatim de código aberto na sessão; comportamento de runtime presumido
   é marcado `inferido`; o que não pôde ser confirmado foi para a seção 17, nunca para os achados.
   Tetos de achados por tier (profundo/médio/leve) para conter ruído.
2. **Validação estrutural.** Os 16 retornos JSON foram validados por script contra o contrato
   (IDs únicos, severidades, evidências com trecho, notas com justificativa, quebras de jornada
   apontando para achados existentes). 16/16 válidos após correção mecânica de 5 trechos longos.
3. **Spot-check ao vivo (evidência suplementar).** Navegação read-only em `http://nvit.localhost`
   sem login/SSO e sem qualquer ação de escrita: Portal (desktop + 375 px + medição de contraste via
   `getComputedStyle`), ContaViva 360, NeuroEvolui, BESC e RM Ambiental. Superfícies atrás de SSO
   (Console, Reqhub, Portal Recorder) registradas como "não verificadas ao vivo" (seção 17).
   A evidência viva **complementa** a evidência de repo, nunca a substitui.
4. **Onda B — transversais (4 agentes).** Integração/navegação entre superfícies, UX de IA
   cross-app (incl. experiência-alvo do AI Control Plane), acessibilidade sistêmica e QA/regressão —
   lendo os 16 resultados locais para agregar padrões sem duplicar achados.
5. **Verificação adversarial.** 100% dos achados P0 e P1 + amostra estratificada de ~30% dos P2,
   verificados por 4 agentes com lentes temáticas instruídos a **refutar** cada achado (reler o
   arquivo citado com ±30 linhas de contexto, buscar contra-evidência, conferir severidade contra a
   rubrica). Vereditos: confirmado / rebaixado / elevado / morto / duplicado. Achados mortos saem do
   backlog e são contabilizados nesta seção de método.
6. **Calibração de notas.** As notas 0–5 das 8 dimensões foram atribuídas com rubrica ancorada
   comum e depois calibradas em conjunto (análise por dimensão, testes de sanidade, ajustes limitados
   a ±1,0 com justificativa registrada — o changelog aparece na seção 5).

### Modelo de pontuação

Notas 0–5 (incrementos de 0,5) somente com evidência; `N/A` para dimensão não implementada — nunca
nota 0 por ausência de escopo. Ponderação: usabilidade 20% · arquitetura da informação/navegação 15% ·
acessibilidade 15% · consistência visual/DS 15% · responsividade 10% · estados/feedback 10% ·
onboarding/auth/RBAC 10% · performance percebida 5%. Quando há `N/A`, os pesos restantes são
renormalizados. Severidades: **P0** = bloqueador de jornada/exposição indevida/WCAG A em fluxo
principal; **P1** = degradação de jornada principal/WCAG AA; **P2** = fricção notável; **P3** =
polimento. Esforço: **PP** ≤ 2 h · **P** ≤ 1 dia · **M** ≤ 3 dias · **G** ≤ 2 semanas · **GG** >
2 semanas ou multi-app.

---

## 3. Inventário completo das superfícies

### 3.1 Visão geral

| # | Superfície | Base path | Stack de frontend | Situação real | Autenticação | Design system | Testes de frontend |
|---|---|---|---|---|---|---|---|
| 1 | Portal raiz | `/` | HTML estático + JS progressivo (nginx) | Implementado, no ar | Pública; área de operador via SSO de borda | platform-shell + tokens `--p-*` + CSS próprio | `node:test` (SEO/markup/lógica); axe/Lighthouse manuais |
| 2 | DevOps Console | `/devops` | React 18 + Vite | Implementado, no ar (10 abas) | SSO oauth2-proxy + Keycloak | platform-shell + tokens `--p-*` + CSS próprio | **nenhum** |
| 3 | SICAT | `/sicat` | Vue 3 + Vuetify 3 | Implementado, produção (o mais maduro) | Login próprio + Keycloak; 2ª etapa conta CETESB | tokens centrais (marca sicat) + kit `Sicat*` próprio | Playwright (17–18 specs; ver §17.2); sem axe |
| 4 | GymOps | `/gymops` | Next.js 14 App Router + Radix/Tailwind | Implementado; sprints 18–21 pendentes | JWT + Google OAuth; convite/setup | Tailwind próprio (fora dos tokens centrais) | Playwright + smoke por papel; sem axe |
| 5 | RM Ambiental | `/rmambiental` | Vite + React 18 + Tailwind | Implementado, no ar (site institucional) | — (público) | tokens centrais (marca rmambiental) | **nenhum** |
| 6 | BESC | `/besc` | React 18 + Vite (JSX) | Implementado (fases 0–4; marketplace em modo demo) | Local + Keycloak (realm besc); aprovação pending→active | CSS próprio, tema único claro (fora dos tokens) | **nenhum** (só API) |
| 7 | ZapBridge | `/zapbridge` | Vite + React 18 + Tailwind (`web/`); Expo legado (`app/`) | Implementado; migração Expo→web com resíduos | JWT próprio + QR WhatsApp | Tailwind próprio, tema escuro fixo (fora dos tokens) | **nenhum** |
| 8 | Reqhub | `/reqs` | HTML/JS estático CSP-safe (8 views) | Implementado, no ar | SSO de borda (oauth2-proxy) | platform-shell + tokens `--p-*` | `node:test` (~137 testes de lógica) |
| 9 | Portal Recorder | `/portal-rec` | React + Vite (hash-router) | Implementado (ferramenta de operador) | Token de escrita (`PORTAL_REC_TOKEN`); SSO de borda p/ UI | platform-shell + tokens `--p-*` | 5 testes puros de API |
| 10 | ContaViva 360 | `/contaviva-360` | Vue 3 + kit ui-vue | Implementado **parcial** (telas órfãs; sem login na SPA) | **nenhuma na SPA** (header stand-in `X-Role`) | tokens centrais + ui-vue (cópia sincronizada) | **nenhum** (75 de API) |
| 11 | ContaViva Pro | `/contaviva-pro` | Vue 3 + kit ui-vue | Implementado (auth própria real) | JWT próprio + Keycloak aditivo | tokens centrais + ui-vue (cópia sincronizada) | **nenhum** (8 de API) |
| 12 | NeuroEvolui | `/neuroevolui` | Vue 3 + kit ui-vue | Implementado **parcial** (36 rotas; sem login na SPA; 11 views órfãs) | **nenhuma na SPA** (header stand-in) | tokens centrais + ui-vue (cópia sincronizada) | **nenhum** (76 de API) |
| 13 | Imobia | `/imobia` | Vue 3 + Pinia | Implementado (11 módulos CRUD reais) | JWT próprio + Keycloak; guard real | tokens próprios `--im-*` (fora do kit, contradizendo docs) | **nenhum** |
| 14 | Ana Rabottini | `/anarabottini` | Vite + React 18 + Tailwind | Implementado (conteúdo de contato pendente no fallback) | — (público; edição via CMS do Console) | tokens centrais (marca própria) | **nenhum** |
| 15 | AI Control Plane | `/ai-control` | **sem frontend** (API + Postgres) | Implementado como API; experiência de governança sem UI própria | Token de escrita | N/A | 1 arquivo (API) |
| 16 | Design System | `packages/` | design-tokens + ui-vue + platform-shell | Implementado parcial (camadas ui-react/ui-vanilla prometidas e inexistentes) | N/A | — | testes de funções puras no gate de CI |
| — | forge-pilot-v2 | — | — | **Fixture de pipeline — excluída da auditoria** | — | — | — |

### 3.2 Inventário de telas/rotas por superfície

As tabelas abaixo enumeram as rotas/telas REAIS encontradas no código (243 entradas), com estado de
implementação e papéis atendidos. Estados: IMPLEMENTADO · PARCIALMENTE IMPLEMENTADO ·
DOCUMENTADO/PLANEJADO · PROPOSTA · NÃO INICIADO · OBSOLETO/DIVERGENTE.


#### Portal raiz

| Rota/tela | Nome | Estado | Papéis | Evidência |
|---|---|---|---|---|
| `/` | Home — hero + stats do catálogo | IMPLEMENTADO | visitante-anonimo, operador | `portal/frontend/index.html` |
| `/#produtos` | Produtos curados (8 cards) + busca/filtro | IMPLEMENTADO | visitante-anonimo, operador | `portal/frontend/index.html` |
| `/#portais` | Portais CMS (2 cards) | IMPLEMENTADO | visitante-anonimo, operador | `portal/frontend/index.html` |
| `/#capacidades` | Capacidades (6 cards flat) | IMPLEMENTADO | visitante-anonimo, operador | `portal/frontend/index.html` |
| `/#cluster (seção #cluster-section)` | Descoberta dinâmica de apps do cluster | IMPLEMENTADO | operador | `portal/frontend/assets/portal.js` |
| `/#plataforma` | Ferramentas de operador (6) + pulso de deploys | IMPLEMENTADO | operador | `portal/frontend/index.html` |
| `/#showcase` | Showcase de capturas dos produtos | PARCIALMENTE IMPLEMENTADO | visitante-anonimo, operador | `portal/frontend/index.html` |
| `/404.html` | Página de erro amigável | IMPLEMENTADO | visitante-anonimo, operador | `portal/frontend/404.html` |
| `/ (casca <platform-shell>)` | Casca global — launcher, tema, identidade, saúde | IMPLEMENTADO | visitante-anonimo, operador | `portal/frontend/assets/platform-shell.js` |
| `/healthz` | Probe de saúde (nginx) | IMPLEMENTADO | infra | `portal/frontend/nginx.conf` |

#### DevOps Console

| Rota/tela | Nome | Estado | Papéis | Evidência |
|---|---|---|---|---|
| `/devops/#painel` | Meu painel (member) | IMPLEMENTADO | project-members | `console/frontend/src/components/UserHome.jsx` |
| `/devops/#overview` | Overview do cluster | IMPLEMENTADO | platform-admins | `console/frontend/src/components/Overview.jsx` |
| `/devops/#apps` | Apps agrupadas | IMPLEMENTADO | platform-admins | `console/frontend/src/components/Apps.jsx` |
| `/devops/#health` | Health (pods+deployments) | IMPLEMENTADO | platform-admins | `console/frontend/src/components/Health.jsx` |
| `/devops/#logs` | Logs (follow SSE) | IMPLEMENTADO | platform-admins | `console/frontend/src/components/Logs.jsx` |
| `/devops/#publications` | Publicações | IMPLEMENTADO | platform-admins | `console/frontend/src/components/Publications.jsx` |
| `/devops/#projects` | Projetos & Tarefas (kanban) | IMPLEMENTADO | platform-admins, project-members | `console/frontend/src/components/MetaProjects.jsx` |
| `/devops/#conteudo` | Conteúdo (CMS) | IMPLEMENTADO | platform-admins, project-members | `console/frontend/src/components/ContentEditor.jsx` |
| `/devops/#access` | Usuários restritos | IMPLEMENTADO | platform-admins | `console/frontend/src/components/AccessAdmin.jsx` |
| `/devops/#shared` | Recursos compartilhados | IMPLEMENTADO | platform-admins | `console/frontend/src/components/SharedResources.jsx` |
| `/devops/?embed=1#conteudo?projeto=<key>` | Superfície embed (Studio) | IMPLEMENTADO | platform-admins, project-members | `console/frontend/src/components/EmbedSurface.jsx` |
| `modal: Novo portal` | NewPortalWizard (criação ao vivo) | IMPLEMENTADO | platform-admins, project-members | `console/frontend/src/components/cms/NewPortalWizard.jsx` |

#### SICAT

| Rota/tela | Nome | Estado | Papéis | Evidência |
|---|---|---|---|---|
| `/` | Home pública (landing) | IMPLEMENTADO | todos | `apps/sicat/frontend/src/views/HomeLandingView.vue` |
| `/login` | Login SICAT (etapa 1/2) | IMPLEMENTADO | todos | `apps/sicat/frontend/src/views/LoginView.vue` |
| `/login/keycloak/callback` | Callback Keycloak | IMPLEMENTADO | todos | `apps/sicat/frontend/src/views/LoginKeycloakCallbackView.vue` |
| `/login/cetesb` | Conectar conta CETESB (etapa 2/2) | IMPLEMENTADO | generator, carrier, receiver | `apps/sicat/frontend/src/views/CetesbAccountSelectionView.vue` |
| `/dashboard` | Painel do operador | IMPLEMENTADO | generator, carrier, receiver | `apps/sicat/frontend/src/features/dashboard/DashboardView.vue` |
| `/manifestos` | Lista de manifestos / Receber | IMPLEMENTADO | generator, carrier, receiver | `apps/sicat/frontend/src/views/ManifestsView.vue` |
| `/manifestos/novo` | Emitir MTR (wizard) | IMPLEMENTADO | generator | `apps/sicat/frontend/src/views/ManifestCreateView.vue` |
| `/manifestos/:id` | Detalhe do manifesto | IMPLEMENTADO | generator, carrier, receiver | `apps/sicat/frontend/src/views/ManifestDetailView.vue` |
| `/relatorios/mtrs` | Relatórios MTR (operador) | IMPLEMENTADO | generator, carrier, receiver | `apps/sicat/frontend/src/views/ManifestReportView.vue` |
| `/jobs` | Redirect legado | IMPLEMENTADO | admin | `apps/sicat/frontend/src/router.js` |
| `/dmr` | DMR — declarações | IMPLEMENTADO | generator, carrier, receiver | `apps/sicat/frontend/src/views/dmr/DmrListView.vue` |
| `/dmr/pendentes` | DMR — pendentes | IMPLEMENTADO | generator, carrier, receiver | `apps/sicat/frontend/src/views/dmr/DmrPendentesView.vue` |
| `/dmr/novo` | DMR — nova declaração | IMPLEMENTADO | generator, carrier, receiver | `apps/sicat/frontend/src/views/dmr/DmrCreateView.vue` |
| `/dmr/:dmrId` | DMR — detalhe | IMPLEMENTADO | generator, carrier, receiver | `apps/sicat/frontend/src/views/dmr/DmrDetailView.vue` |
| `/mtr-provisorio` | MTR provisório — lista | IMPLEMENTADO | generator | `apps/sicat/frontend/src/views/mtr-provisorio/MtrProvisorioListView.vue` |
| `/mtr-provisorio/novo` | MTR provisório — novo | IMPLEMENTADO | generator | `apps/sicat/frontend/src/views/mtr-provisorio/MtrProvisorioCreateView.vue` |
| `/mtr-provisorio/:id` | MTR provisório — detalhe | IMPLEMENTADO | generator | `apps/sicat/frontend/src/views/mtr-provisorio/MtrProvisorioDetailView.vue` |
| `/sessao` | Minha sessão / conta CETESB | IMPLEMENTADO | generator, carrier, receiver | `apps/sicat/frontend/src/views/SessionAccountView.vue` |
| `/conversacional/chat` | Chat operacional (IA) | IMPLEMENTADO | generator, carrier, receiver | `apps/sicat/frontend/src/views/ConversationalChatAppView.vue` |
| `/admin/acessos` | Administração de acessos | PARCIALMENTE IMPLEMENTADO | admin | `apps/sicat/frontend/src/views/AccessAdminView.vue` |
| `/operacao/dashboard` | Sistema — visão geral (ADMIN_HOME) | IMPLEMENTADO | admin | `apps/sicat/frontend/src/modules/operations-dashboard/OperationsDashboardView.vue` |
| `/operacao/auditoria` | Sistema — auditoria | IMPLEMENTADO | admin | `apps/sicat/frontend/src/modules/audit-explorer/AuditExplorerView.vue` |
| `/operacao/cetesb-health` | Sistema — saúde CETESB | IMPLEMENTADO | admin | `apps/sicat/frontend/src/modules/cetesb-accounts-health/CetesbAccountsHealthView.vue` |
| `/operacao/relatorios/mtr` | Sistema — relatórios MTR (SRE) | IMPLEMENTADO | admin | `apps/sicat/frontend/src/modules/mtr-reports/MtrReportsView.vue` |
| `/operacao/command-center` | Sistema — command center | IMPLEMENTADO | admin | `apps/sicat/frontend/src/modules/command-center/CommandCenterView.vue` |
| `/sistema/jobs` | Sistema — jobs (fila/DLQ) | IMPLEMENTADO | admin | `apps/sicat/frontend/src/views/JobsView.vue` |
| `/sistema/ai-control` | AI Control Center | IMPLEMENTADO | admin | `apps/sicat/frontend/src/views/ai-control/AiControlCenterView.vue` |
| `/cdf` | CDF — emitidos | IMPLEMENTADO | receiver | `apps/sicat/frontend/src/views/CdfListView.vue` |
| `/cdf/novo` | CDF — gerar certificado | IMPLEMENTADO | receiver | `apps/sicat/frontend/src/views/CdfCreateView.vue` |
| `/dev/components` | Playground do design system | IMPLEMENTADO | admin, generator, carrier, receiver | `apps/sicat/frontend/src/views/dev/SicatComponentsPlayground.vue` |

#### GymOps

| Rota/tela | Nome | Estado | Papéis | Evidência |
|---|---|---|---|---|
| `/` | Redirect raiz | IMPLEMENTADO | todos | `apps/gymops/apps/web/src/app/page.tsx` |
| `/login` | Login e-mail/senha + Google + SSO | IMPLEMENTADO | publico | `apps/gymops/apps/web/src/app/(auth)/login/page.tsx` |
| `/auth/callback` | Callback OAuth/SSO | PARCIALMENTE IMPLEMENTADO | publico | `apps/gymops/apps/web/src/app/(auth)/auth/callback/page.tsx` |
| `/invite/[token]` | Aceitar convite | IMPLEMENTADO | publico | `apps/gymops/apps/web/src/app/(auth)/invite/[token]/page.tsx` |
| `/setup` | Wizard nova organização (IA + manual) | IMPLEMENTADO | publico | `apps/gymops/apps/web/src/app/setup/page.tsx` |
| `/dashboard` | Painel Geral | IMPLEMENTADO | owner, org_manager | `apps/gymops/apps/web/src/app/(app)/dashboard/page.tsx` |
| `/me` | Minhas atividades | IMPLEMENTADO | todos | `apps/gymops/apps/web/src/app/(app)/me/page.tsx` |
| `/activities` | Central de Atividades | IMPLEMENTADO | owner, org_manager, unit_manager, area_leader, executor | `apps/gymops/apps/web/src/app/(app)/activities/page.tsx` |
| `/units/[id]` | Visão da unidade | IMPLEMENTADO | owner, org_manager, unit_manager, area_leader, executor | `apps/gymops/apps/web/src/app/(app)/units/[id]/page.tsx` |
| `/profile` | Meu perfil | IMPLEMENTADO | todos | `apps/gymops/apps/web/src/app/(app)/profile/page.tsx` |
| `/help` | Central de Ajuda (tutoriais) | IMPLEMENTADO | todos | `apps/gymops/apps/web/src/app/(app)/help/page.tsx` |
| `/settings` | Notificações (pessoal) | PARCIALMENTE IMPLEMENTADO | todos | `apps/gymops/apps/web/src/app/(app)/settings/page.tsx` |
| `/settings/organization` | Organização (branding + delivery log) | IMPLEMENTADO | owner | `apps/gymops/apps/web/src/app/(app)/settings/organization/page.tsx` |
| `/settings/units` | Unidades (admin) | IMPLEMENTADO | owner, org_manager | `apps/gymops/apps/web/src/app/(app)/settings/units/page.tsx` |
| `/settings/areas` | Áreas (admin) | IMPLEMENTADO | owner, org_manager | `apps/gymops/apps/web/src/app/(app)/settings/areas/page.tsx` |
| `/settings/team` | Equipe e convites | IMPLEMENTADO | owner, org_manager | `apps/gymops/apps/web/src/app/(app)/settings/team/page.tsx` |
| `/settings/templates` | Templates | IMPLEMENTADO | owner, org_manager | `apps/gymops/apps/web/src/app/(app)/settings/templates/page.tsx` |
| `/settings/integrations` | Integrações (Trello/WhatsApp) | IMPLEMENTADO | owner, org_manager | `apps/gymops/apps/web/src/app/(app)/settings/integrations/page.tsx` |
| `/settings/import` | Importar Trello (wizard) | IMPLEMENTADO | owner, org_manager | `apps/gymops/apps/web/src/app/(app)/settings/import/page.tsx` |
| `/settings/imports` | Histórico de imports | IMPLEMENTADO | owner, org_manager | `apps/gymops/apps/web/src/app/(app)/settings/imports/page.tsx` |
| `/settings/recurrences` | Recorrências | IMPLEMENTADO | owner, org_manager | `apps/gymops/apps/web/src/app/(app)/settings/recurrences/page.tsx` |
| `/settings/audit` | Auditoria | IMPLEMENTADO | owner | `apps/gymops/apps/web/src/app/(app)/settings/audit/page.tsx` |
| `/admin` | Índice admin (redirect) | IMPLEMENTADO | platform_admin | `apps/gymops/apps/web/src/app/(admin)/admin/page.tsx` |
| `/admin/organizations` | Academias (platform) | IMPLEMENTADO | platform_admin | `apps/gymops/apps/web/src/app/(admin)/admin/organizations/page.tsx` |
| `/admin/organizations/[id]` | Detalhe da academia | IMPLEMENTADO | platform_admin | `apps/gymops/apps/web/src/app/(admin)/admin/organizations/[id]/page.tsx` |
| `/admin/masters` | Masters da plataforma | IMPLEMENTADO | platform_admin | `apps/gymops/apps/web/src/app/(admin)/admin/masters/page.tsx` |

#### RM Ambiental

| Rota/tela | Nome | Estado | Papéis | Evidência |
|---|---|---|---|---|
| `/rmambiental/` | Home (hero, sobre, soluções, processo, stats, setores, galeria, ESG, CTA) | IMPLEMENTADO | visitante | `apps/rmambiental/src/pages/Home.tsx` |
| `/rmambiental/solucoes` | Soluções (4 frentes detalhadas) | IMPLEMENTADO | visitante | `apps/rmambiental/src/pages/Solucoes.tsx` |
| `/rmambiental/contato` | Contato (formulário + canais + mapa estilizado) | IMPLEMENTADO | visitante | `apps/rmambiental/src/components/ContactSection.tsx` |
| `* (curinga)` | Fallback → Home | IMPLEMENTADO | visitante | `apps/rmambiental/src/App.tsx` |
| `(overlay) lightbox da galeria` | Modal de imagem com Esc/setas | IMPLEMENTADO | visitante | `apps/rmambiental/src/components/SectionRenderer.tsx` |
| `(iframe Console) ?cmsEdit=1` | Modo de edição visual do CMS | IMPLEMENTADO | editor | `apps/rmambiental/src/lib/cmsEdit.tsx` |

#### BESC

| Rota/tela | Nome | Estado | Papéis | Evidência |
|---|---|---|---|---|
| `/` | Portal home | IMPLEMENTADO | todos | `apps/besc/frontend/src/pages/PortalHome.jsx` |
| `/biblioteca` | Biblioteca institucional | IMPLEMENTADO | todos | `apps/besc/frontend/src/pages/BibliotecaList.jsx` |
| `/biblioteca/:id` | Detalhe de item da biblioteca | IMPLEMENTADO | todos | `apps/besc/frontend/src/pages/BibliotecaDetail.jsx` |
| `/jurisprudencia` | Acervo de jurisprudência | IMPLEMENTADO | todos | `apps/besc/frontend/src/pages/JurisprudenciaList.jsx` |
| `/jurisprudencia/:id` | Ficha da decisão | IMPLEMENTADO | todos | `apps/besc/frontend/src/pages/JurisprudenciaDetail.jsx` |
| `/glossario` | Glossário | IMPLEMENTADO | todos | `apps/besc/frontend/src/pages/Glossario.jsx` |
| `/roadmap` | Roadmap do processo | IMPLEMENTADO | todos | `apps/besc/frontend/src/pages/Roadmap.jsx` |
| `/referencia` | Referência | IMPLEMENTADO | todos | `apps/besc/frontend/src/pages/Referencia.jsx` |
| `/marketplace` | Catálogo de títulos (Investir) | IMPLEMENTADO | todos | `apps/besc/frontend/src/pages/Marketplace.jsx` |
| `/marketplace/titulos/:id` | Dossiê do título | IMPLEMENTADO | todos | `apps/besc/frontend/src/pages/TituloDossie.jsx` |
| `/investidor/carteira` | Minha carteira | IMPLEMENTADO | investor, admin | `apps/besc/frontend/src/pages/InvestidorCarteira.jsx` |
| `/entrar` | Login (local + SSO) | IMPLEMENTADO | todos | `apps/besc/frontend/src/pages/Entrar.jsx` |
| `/entrar/callback` | Callback SSO | IMPLEMENTADO | todos | `apps/besc/frontend/src/pages/Entrar.jsx` |
| `/cadastro` | Auto-cadastro | IMPLEMENTADO | todos | `apps/besc/frontend/src/pages/Entrar.jsx` |
| `/casos` | Dashboard de casos | IMPLEMENTADO | manager, admin | `apps/besc/frontend/src/pages/Dashboard.jsx` |
| `/cases/new · /cases/:id/edit` | Cadastro/edição de caso | IMPLEMENTADO | manager, admin | `apps/besc/frontend/src/pages/CaseForm.jsx` |
| `/cases/:id` | Detalhe do caso (10 abas) | IMPLEMENTADO | manager, admin | `apps/besc/frontend/src/pages/CaseDetail.jsx` |
| `/gestao/titulos` | Gestão de títulos | IMPLEMENTADO | manager, admin, lawyer, judge | `apps/besc/frontend/src/pages/GestaoTitulos.jsx` |
| `/gestao/titulos/:id` | Detalhe do título (7 abas) | IMPLEMENTADO | manager, admin, lawyer, judge | `apps/besc/frontend/src/pages/GestaoTituloDetail.jsx` |
| `/auditoria` | Portal de auditoria | IMPLEMENTADO | lawyer, judge, manager, admin | `apps/besc/frontend/src/pages/Auditoria.jsx` |
| `/auditoria/titulos/:id` | Consulta de auditoria do título | IMPLEMENTADO | lawyer, judge, manager, admin | `apps/besc/frontend/src/pages/AuditoriaTitulo.jsx` |
| `/gestao/usuarios` | Usuários e acesso | IMPLEMENTADO | manager, admin | `apps/besc/frontend/src/pages/GestaoUsuarios.jsx` |
| `/gestao/papeis` | Papéis e permissões | IMPLEMENTADO | manager, admin | `apps/besc/frontend/src/pages/GestaoPapeis.jsx` |
| `/gestao/financeiro` | Financeiro (DRE/balancete/faturas) | IMPLEMENTADO | manager, admin | `apps/besc/frontend/src/pages/GestaoFinanceiro.jsx` |
| `/gestao/alugueis` | Aluguéis | IMPLEMENTADO | manager, admin | `apps/besc/frontend/src/pages/GestaoAlugueis.jsx` |
| `/gestao/gate` | Gate regulatório | IMPLEMENTADO | manager, admin | `apps/besc/frontend/src/pages/GateRegulatorio.jsx` |
| `/ajuda` | Ajuda | OBSOLETO/DIVERGENTE | todos | `apps/besc/frontend/src/pages/Ajuda.jsx` |
| `(aceite de convite)` | Resgate de convite de auditor | PARCIALMENTE IMPLEMENTADO | lawyer, judge, manager | `apps/besc/api/src/foundation/auth.js` |
| `*` | 404 | IMPLEMENTADO | todos | `apps/besc/frontend/src/App.jsx` |

#### ZapBridge

| Rota/tela | Nome | Estado | Papéis | Evidência |
|---|---|---|---|---|
| `/zapbridge/login` | Login | IMPLEMENTADO | usuário | `apps/zapbridge/web/src/pages/LoginPage.tsx` |
| `/zapbridge/register` | Criar conta | IMPLEMENTADO | usuário | `apps/zapbridge/web/src/pages/RegisterPage.tsx` |
| `/zapbridge/` | Home — lista de conversas (+2 colunas desktop) | IMPLEMENTADO | usuário | `apps/zapbridge/web/src/pages/Home.tsx` |
| `/zapbridge/chat/:chatId` | Conversa | IMPLEMENTADO | usuário | `apps/zapbridge/web/src/components/ChatPanel.tsx` |
| `/zapbridge/connect` | Conectar WhatsApp (QR/pairing) | IMPLEMENTADO | usuário | `apps/zapbridge/web/src/pages/ConnectPage.tsx` |
| `/zapbridge/contacts` | Nova conversa (contatos) | IMPLEMENTADO | usuário | `apps/zapbridge/web/src/pages/ContactsPage.tsx` |
| `/zapbridge/settings` | Configuracoes | IMPLEMENTADO | usuário | `apps/zapbridge/web/src/pages/SettingsPage.tsx` |
| `/zapbridge/assistant` | Assistente IA | PARCIALMENTE IMPLEMENTADO | usuário | `apps/zapbridge/web/src/pages/AssistantPage.tsx` |
| `/zapbridge/mais/:tab` | Abas Em breve (updates/calls/communities) | PARCIALMENTE IMPLEMENTADO | usuário | `apps/zapbridge/web/src/pages/ComingSoonPage.tsx` |
| `/zapbridge/soon` | Em breve (Arquivadas) | PARCIALMENTE IMPLEMENTADO | usuário | `apps/zapbridge/web/src/pages/ComingSoonPage.tsx` |
| `(legado app/) Groups, GroupDetails` | Grupos e detalhes do grupo | PARCIALMENTE IMPLEMENTADO | usuário | `apps/zapbridge/app/src/navigation/RootNavigator.tsx` |
| `(legado app/) KnowledgeBase` | Base de conhecimento IA | PARCIALMENTE IMPLEMENTADO | usuário | `apps/zapbridge/app/src/screens/KnowledgeBaseScreen.tsx` |
| `(legado app/) AutoReplyConfig` | Auto-resposta IA | PARCIALMENTE IMPLEMENTADO | usuário | `apps/zapbridge/app/src/screens/AutoReplyConfigScreen.tsx` |
| `(legado app/) ArchivedChats` | Conversas arquivadas | PARCIALMENTE IMPLEMENTADO | usuário | `apps/zapbridge/app/src/screens/ArchivedChatsScreen.tsx` |
| `(legado app/) MediaViewer/ForwardSheet/Landing/tema claro` | Recursos não migrados diversos | PARCIALMENTE IMPLEMENTADO | usuário | `apps/zapbridge/app/src/theme/ThemeContext.tsx` |

#### Reqhub

| Rota/tela | Nome | Estado | Papéis | Evidência |
|---|---|---|---|---|
| `/reqs/#/forge` | Forja — hub / detalhe do produto / wizard de criação | IMPLEMENTADO | operador | `apps/reqhub/frontend/assets/studio.js` |
| `/reqs/#/explorer` | Explorador de requisitos | IMPLEMENTADO | operador | `apps/reqhub/frontend/assets/app.js` |
| `/reqs/#/workspace?id=` | Workspace do requisito | IMPLEMENTADO | operador | `apps/reqhub/frontend/assets/app.js` |
| `/reqs/#/editor` | Editor guiado por IA (pick→context→chat→refine→review) | IMPLEMENTADO | operador | `apps/reqhub/frontend/assets/app.js` |
| `/reqs/#/impact` | Mapa de impacto (grafo force-directed) | IMPLEMENTADO | operador | `apps/reqhub/frontend/assets/app.js` |
| `/reqs/#/coverage` | Cobertura (matriz + resumo) | IMPLEMENTADO | operador | `apps/reqhub/frontend/assets/app.js` |
| `/reqs/#/usability?id=` | Telas (refinamentos) — sub-aba de Cobertura | IMPLEMENTADO | operador | `apps/reqhub/frontend/assets/app.js` |
| `/reqs/#/versions` | Mudanças — ledger + diff real da baseline | IMPLEMENTADO | operador | `apps/reqhub/frontend/assets/app.js` |
| `/reqs/#/reprocess` | Fila de reprocessamento — sub-aba de Mudanças | IMPLEMENTADO | operador | `apps/reqhub/frontend/assets/app.js` |
| `/reqs/#/aiusage` | Uso da IA (custo/tokens/limites + SSE ao vivo) | IMPLEMENTADO | platform-admin | `apps/reqhub/frontend/assets/app.js` |
| `/reqs/#/overview → forge, /reqs/#/dev → forge` | Redirects legados (LEGACY_HASH) | IMPLEMENTADO | operador | `apps/reqhub/frontend/assets/app.js` |
| `(inalcançável)` | View Desenvolvimento (renderDev + #view-dev) | OBSOLETO/DIVERGENTE | operador | `apps/reqhub/frontend/assets/app.js` |
| `(modal Ctrl+K)` | Copiloto onipresente — perguntar à base | IMPLEMENTADO | operador | `apps/reqhub/frontend/assets/app.js` |

#### Portal Recorder

| Rota/tela | Nome | Estado | Papéis | Evidência |
|---|---|---|---|---|
| `/portal-rec/#/` | Portais & Sessões | IMPLEMENTADO | operador | `apps/portal-recorder/frontend/src/views/PortalsView.jsx` |
| `/portal-rec/#/capture/:sessionId` | Captura (screencast remoto + anotação) | IMPLEMENTADO | operador | `apps/portal-recorder/frontend/src/views/CaptureView.jsx` |
| `/portal-rec/#/review/:sessionId` | Revisão (timeline + contrato) | IMPLEMENTADO | operador | `apps/portal-recorder/frontend/src/views/ReviewView.jsx` |
| `(componente fixo)` | TokenBar (credencial de escrita) | IMPLEMENTADO | operador | `apps/portal-recorder/frontend/src/App.jsx` |

#### ContaViva 360

| Rota/tela | Nome | Estado | Papéis | Evidência |
|---|---|---|---|---|
| `/contaviva-360/` | Painel (roteia por papel via /me) | IMPLEMENTADO | todos | `apps/contaviva-360/frontend/src/views/DashboardView.vue` |
| `/contaviva-360/dashboard/pf` | Painel Cliente PF | PARCIALMENTE IMPLEMENTADO | member, cliente_pf | `apps/contaviva-360/frontend/src/views/DashboardClientePfView.vue` |
| `/contaviva-360/dashboard/pj` | Painel Cliente PJ | PARCIALMENTE IMPLEMENTADO | cliente_pj | `apps/contaviva-360/frontend/src/views/DashboardClientePjView.vue` |
| `/contaviva-360/dashboard/contador` | Painel do Contador | PARCIALMENTE IMPLEMENTADO | manager, contador | `apps/contaviva-360/frontend/src/views/DashboardContadorView.vue` |
| `/contaviva-360/dashboard/admin` | Painel Administrativo | PARCIALMENTE IMPLEMENTADO | admin | `apps/contaviva-360/frontend/src/views/DashboardAdminView.vue` |
| `/contaviva-360/records` | Registros (lista) | IMPLEMENTADO | todos | `apps/contaviva-360/frontend/src/views/ResourceListView.vue` |
| `/contaviva-360/records/new` | Novo registro | IMPLEMENTADO | todos | `apps/contaviva-360/frontend/src/views/ResourceFormView.vue` |
| `/contaviva-360/records/:id` | Detalhe do registro | IMPLEMENTADO | todos | `apps/contaviva-360/frontend/src/views/ResourceDetailView.vue` |
| `/contaviva-360/records/:id/edit` | Editar registro | IMPLEMENTADO | todos | `apps/contaviva-360/frontend/src/views/ResourceFormView.vue` |
| `/contaviva-360/assistant` | Assistente de IA | IMPLEMENTADO | todos | `apps/contaviva-360/frontend/src/views/AiAssistantView.vue` |
| `/contaviva-360/financial/payable` | Contas a Pagar | IMPLEMENTADO | todos | `apps/contaviva-360/frontend/src/views/AccountsPayableView.vue` |
| `/contaviva-360/financial/receivable` | Contas a Receber | IMPLEMENTADO | todos | `apps/contaviva-360/frontend/src/views/AccountsReceivableView.vue` |
| `/contaviva-360/financial/cash-flow` | Fluxo de Caixa | IMPLEMENTADO | todos | `apps/contaviva-360/frontend/src/views/CashFlowView.vue` |
| `/contaviva-360/financial/dashboard` | Dashboard Financeiro | IMPLEMENTADO | todos | `apps/contaviva-360/frontend/src/views/FinancialDashboardView.vue` |
| `/contaviva-360/financial/reports` | Relatórios Financeiros | IMPLEMENTADO | todos | `apps/contaviva-360/frontend/src/views/FinancialReportsView.vue` |
| `/contaviva-360/:pathMatch(.*)*` | 404 | IMPLEMENTADO | todos | `apps/contaviva-360/frontend/src/views/NotFoundView.vue` |

#### ContaViva Pro

| Rota/tela | Nome | Estado | Papéis | Evidência |
|---|---|---|---|---|
| `/contaviva-pro/` | Painel (dashboard) | IMPLEMENTADO | member, admin | `apps/contaviva-pro/frontend/src/views/DashboardView.vue` |
| `/contaviva-pro/records` | Lista de registros | IMPLEMENTADO | member, admin | `apps/contaviva-pro/frontend/src/views/ResourceListView.vue` |
| `/contaviva-pro/records/new` | Novo registro | IMPLEMENTADO | member, admin | `apps/contaviva-pro/frontend/src/views/ResourceFormView.vue` |
| `/contaviva-pro/records/:id` | Detalhe do registro | IMPLEMENTADO | member, admin | `apps/contaviva-pro/frontend/src/views/ResourceDetailView.vue` |
| `/contaviva-pro/records/:id/edit` | Editar registro | PARCIALMENTE IMPLEMENTADO | member, admin | `apps/contaviva-pro/frontend/src/views/ResourceFormView.vue` |
| `/contaviva-pro/assistant` | Assistente de IA | IMPLEMENTADO | member, admin | `apps/contaviva-pro/frontend/src/views/AiAssistantView.vue` |
| `/contaviva-pro/login` | Login / Registro / SSO | IMPLEMENTADO | todos | `apps/contaviva-pro/frontend/src/views/AuthView.vue` |
| `/contaviva-pro/profile` | Perfil | IMPLEMENTADO | member, admin | `apps/contaviva-pro/frontend/src/views/ProfileView.vue` |
| `/contaviva-pro/admin/users` | Usuários (admin) | IMPLEMENTADO | admin | `apps/contaviva-pro/frontend/src/views/AdminUsuariosView.vue` |
| `/contaviva-pro/* (404)` | Página não encontrada | IMPLEMENTADO | todos | `apps/contaviva-pro/frontend/src/views/NotFoundView.vue` |

#### NeuroEvolui

| Rota/tela | Nome | Estado | Papéis | Evidência |
|---|---|---|---|---|
| `/neuroevolui/` | Dashboard Clínico | IMPLEMENTADO | owner, clinic_manager, professional | `apps/neuroevolui/frontend/src/views/DashboardView.vue` |
| `/neuroevolui/patients` | Lista de pacientes | IMPLEMENTADO | owner, clinic_manager, professional | `apps/neuroevolui/frontend/src/views/PatientListView.vue` |
| `/neuroevolui/patients/new` | Cadastrar paciente | IMPLEMENTADO | owner, clinic_manager, professional | `apps/neuroevolui/frontend/src/views/PatientCreateView.vue` |
| `/neuroevolui/patients/:id` | Prontuário do paciente | IMPLEMENTADO | owner, clinic_manager, professional | `apps/neuroevolui/frontend/src/views/PatientDetailView.vue` |
| `/neuroevolui/patients/:id/edit` | Editar paciente | IMPLEMENTADO | owner, clinic_manager, professional | `apps/neuroevolui/frontend/src/views/PatientEditView.vue` |
| `/neuroevolui/evolution-notes` | Lista de evoluções | IMPLEMENTADO | owner, clinic_manager, professional | `apps/neuroevolui/frontend/src/views/EvolutionNoteListView.vue` |
| `/neuroevolui/evolution-notes/new` | Registrar evolução | IMPLEMENTADO | owner, clinic_manager, professional | `apps/neuroevolui/frontend/src/views/EvolutionNoteCreateView.vue` |
| `/neuroevolui/evolution-notes/:id` | Detalhe de evolução | IMPLEMENTADO | owner, clinic_manager, professional | `apps/neuroevolui/frontend/src/views/EvolutionNoteDetailView.vue` |
| `/neuroevolui/evolution-notes/:id/edit` | Editar evolução | IMPLEMENTADO | owner, clinic_manager, professional | `apps/neuroevolui/frontend/src/views/EvolutionNoteEditView.vue` |
| `/neuroevolui/consultations` | Agendamentos (tabela+calendário) | IMPLEMENTADO | owner, clinic_manager, professional, patient | `apps/neuroevolui/frontend/src/views/ConsultationListView.vue` |
| `/neuroevolui/consultations/new` | Novo agendamento | IMPLEMENTADO | owner, clinic_manager, professional | `apps/neuroevolui/frontend/src/views/ConsultationCreateView.vue` |
| `/neuroevolui/consultations/:id` | Detalhe da consulta | IMPLEMENTADO | owner, clinic_manager | `apps/neuroevolui/frontend/src/views/ConsultationDetailView.vue` |
| `/neuroevolui/professionals` | Lista de profissionais | IMPLEMENTADO | owner, clinic_manager, professional | `apps/neuroevolui/frontend/src/views/ProfessionalListView.vue` |
| `/neuroevolui/professionals/new` | Cadastrar profissional | IMPLEMENTADO | owner, clinic_manager | `apps/neuroevolui/frontend/src/views/ProfessionalCreateView.vue` |
| `/neuroevolui/professionals/:id` | Detalhe do profissional | IMPLEMENTADO | owner, clinic_manager, professional | `apps/neuroevolui/frontend/src/views/ProfessionalDetailView.vue` |
| `/neuroevolui/professionals/:id/edit` | Editar profissional | IMPLEMENTADO | owner, clinic_manager | `apps/neuroevolui/frontend/src/views/ProfessionalEditView.vue` |
| `/neuroevolui/patient-reports` | Relatórios de pacientes | IMPLEMENTADO | owner, clinic_manager, professional | `apps/neuroevolui/frontend/src/views/PatientReportListView.vue` |
| `/neuroevolui/patient-reports/new` | Novo relatório | IMPLEMENTADO | owner, clinic_manager, professional | `apps/neuroevolui/frontend/src/views/PatientReportCreateView.vue` |
| `/neuroevolui/patient-reports/:id` | Detalhe do relatório | IMPLEMENTADO | owner, clinic_manager, professional | `apps/neuroevolui/frontend/src/views/PatientReportDetailView.vue` |
| `/neuroevolui/financial` | Visão financeira | IMPLEMENTADO | owner, clinic_manager | `apps/neuroevolui/frontend/src/views/FinancialOverviewView.vue` |
| `/neuroevolui/payment-transactions` | Transações de pagamento | IMPLEMENTADO | owner, clinic_manager | `apps/neuroevolui/frontend/src/views/PaymentTransactionListView.vue` |
| `/neuroevolui/payment-transactions/:id` | Detalhe da transação | IMPLEMENTADO | owner, clinic_manager | `apps/neuroevolui/frontend/src/views/PaymentTransactionDetailView.vue` |
| `/neuroevolui/assistant` | Assistente IA | IMPLEMENTADO | owner, clinic_manager, professional, patient | `apps/neuroevolui/frontend/src/views/AssistantView.vue` |
| `/neuroevolui/knowledge-sources` | Base de conhecimento | IMPLEMENTADO | owner, clinic_manager, professional | `apps/neuroevolui/frontend/src/views/KnowledgeSourceListView.vue` |
| `/neuroevolui/knowledge-sources/new` | Nova fonte de conhecimento | IMPLEMENTADO | owner, clinic_manager | `apps/neuroevolui/frontend/src/views/KnowledgeSourceCreateView.vue` |
| `/neuroevolui/knowledge-sources/:id` | Detalhe da fonte | IMPLEMENTADO | owner, clinic_manager, professional | `apps/neuroevolui/frontend/src/views/KnowledgeSourceDetailView.vue` |
| `/neuroevolui/knowledge-sources/:id/edit` | Editar fonte | IMPLEMENTADO | owner, clinic_manager | `apps/neuroevolui/frontend/src/views/KnowledgeSourceEditView.vue` |
| `/neuroevolui/notification-preferences` | Preferências de notificação (CRUD) | IMPLEMENTADO | owner, clinic_manager | `apps/neuroevolui/frontend/src/views/NotificationPreferenceListView.vue` |
| `/neuroevolui/notification-preferences/new` | Nova preferência | IMPLEMENTADO | owner, clinic_manager | `apps/neuroevolui/frontend/src/views/NotificationPreferenceCreateView.vue` |
| `/neuroevolui/notification-preferences/:id/edit` | Editar preferência | IMPLEMENTADO | owner, clinic_manager | `apps/neuroevolui/frontend/src/views/NotificationPreferenceEditView.vue` |
| `/neuroevolui/audit-logs` | Auditoria | IMPLEMENTADO | owner, clinic_manager | `apps/neuroevolui/frontend/src/views/AuditLogListView.vue` |
| `/neuroevolui/audit-logs/:id` | Detalhe de auditoria | IMPLEMENTADO | owner, clinic_manager | `apps/neuroevolui/frontend/src/views/AuditLogDetailView.vue` |
| `/neuroevolui/async-jobs` | Jobs assíncronos | IMPLEMENTADO | owner, clinic_manager, professional | `apps/neuroevolui/frontend/src/views/AsyncJobListView.vue` |
| `/neuroevolui/async-jobs/:id` | Detalhe do job | IMPLEMENTADO | owner, clinic_manager, professional | `apps/neuroevolui/frontend/src/views/AsyncJobDetailView.vue` |
| `/neuroevolui/settings` | Configurações | IMPLEMENTADO | owner, clinic_manager, professional, patient | `apps/neuroevolui/frontend/src/views/SettingsView.vue` |
| `/neuroevolui/* (catch-all)` | 404 | IMPLEMENTADO | todos | `apps/neuroevolui/frontend/src/views/NotFoundView.vue` |
| `(sem rota)` | ReportListView / ReportCreateView / ReportDetailView | PARCIALMENTE IMPLEMENTADO |  | `apps/neuroevolui/frontend/src/views/ReportListView.vue` |
| `(sem rota)` | TransactionListView / TransactionDetailView | PARCIALMENTE IMPLEMENTADO |  | `apps/neuroevolui/frontend/src/views/TransactionListView.vue` |
| `(sem rota)` | RevenueDashboardView | PARCIALMENTE IMPLEMENTADO |  | `apps/neuroevolui/frontend/src/views/RevenueDashboardView.vue` |
| `(sem rota)` | JobsMonitorView / SystemHealthView / ApiDocsView | PARCIALMENTE IMPLEMENTADO |  | `apps/neuroevolui/frontend/src/views/SystemHealthView.vue` |
| `(sem rota)` | AiAssistantView / NotificationPreferencesView | PARCIALMENTE IMPLEMENTADO |  | `apps/neuroevolui/frontend/src/views/AiAssistantView.vue` |

#### Imobia

| Rota/tela | Nome | Estado | Papéis | Evidência |
|---|---|---|---|---|
| `/imobia/` | Home pública | IMPLEMENTADO | todos | `apps/imobia/frontend/src/views/Home.vue` |
| `/imobia/arquitetura` | Arquitetura | IMPLEMENTADO | todos | `apps/imobia/frontend/src/views/Arquitetura.vue` |
| `/imobia/login` | Login / registro | IMPLEMENTADO | todos | `apps/imobia/frontend/src/views/Login.vue` |
| `/imobia/app` | Redirect painel | IMPLEMENTADO | admin | `apps/imobia/frontend/src/router.js` |
| `/imobia/app/dashboard` | Painel | IMPLEMENTADO | admin | `apps/imobia/frontend/src/views/app/Dashboard.vue` |
| `/imobia/app/assistente` | Assistente IA | IMPLEMENTADO | admin | `apps/imobia/frontend/src/views/app/Assistente.vue` |
| `/imobia/app/imoveis` | Imóveis (captação) | IMPLEMENTADO | admin | `apps/imobia/frontend/src/views/app/Imoveis.vue` |
| `/imobia/app/leads` | Clientes / Leads | IMPLEMENTADO | admin | `apps/imobia/frontend/src/views/app/Leads.vue` |
| `/imobia/app/agenda` | Agenda e Eventos | IMPLEMENTADO | admin | `apps/imobia/frontend/src/views/app/Agenda.vue` |
| `/imobia/app/vistorias` | Vistorias e Laudos | IMPLEMENTADO | admin | `apps/imobia/frontend/src/views/app/Vistorias.vue` |
| `/imobia/app/documentos` | Documentos | IMPLEMENTADO | admin | `apps/imobia/frontend/src/views/app/Documentos.vue` |
| `/imobia/app/financeiro` | Financeiro PJ/PF | IMPLEMENTADO | admin | `apps/imobia/frontend/src/views/app/Financeiro.vue` |
| `/imobia/app/corbam` | Corbam / COBAN | IMPLEMENTADO | admin | `apps/imobia/frontend/src/views/app/Corbam.vue` |
| `/imobia/app/mercado` | ACM / PTAM | IMPLEMENTADO | admin | `apps/imobia/frontend/src/views/app/Mercado.vue` |
| `/imobia/app/whatsapp` | WhatsApp | IMPLEMENTADO | admin | `apps/imobia/frontend/src/views/app/WhatsApp.vue` |
| `/:pathMatch(.*)*` | Catch-all 404 | IMPLEMENTADO | todos | `apps/imobia/frontend/src/router.js` |
| `(sem rota)` | ModulePlaceholder | OBSOLETO/DIVERGENTE |  | `apps/imobia/frontend/src/views/app/ModulePlaceholder.vue` |
| `(fluxo)` | Login SSO Keycloak | PARCIALMENTE IMPLEMENTADO | todos | `apps/imobia/frontend/src/stores/auth.js` |

#### Ana Rabottini

| Rota/tela | Nome | Estado | Papéis | Evidência |
|---|---|---|---|---|
| `/anarabottini/` | Home (scroll: hero, nr1, sobre, palestras, mídia, materiais, faq, cta) | IMPLEMENTADO | visitante, editor-cms | `apps/anarabottini/src/pages/Home.tsx` |
| `/anarabottini/contato` | Contato (formulário de proposta + canais) | PARCIALMENTE IMPLEMENTADO | visitante, editor-cms | `apps/anarabottini/src/pages/Contato.tsx` |
| `/anarabottini/* (catch-all)` | Fallback de rota | IMPLEMENTADO | visitante | `apps/anarabottini/src/App.tsx` |
| `(modal) palestra` | Modal de detalhe de palestra | IMPLEMENTADO | visitante | `apps/anarabottini/src/components/PalestraModal.tsx` |
| `(modal) vídeo` | Lightbox de vídeos | IMPLEMENTADO | visitante | `apps/anarabottini/src/components/VideoLightbox.tsx` |
| `(overlay) ?cmsEdit=1 em iframe` | Modo de edição visual (Console) | IMPLEMENTADO | editor-cms | `apps/anarabottini/src/lib/cmsEdit.tsx` |

#### Design System (transversal)

| Rota/tela | Nome | Estado | Papéis | Evidência |
|---|---|---|---|---|
| `(camada A) packages/design-tokens` | Tokens fonte única + 4 rotas de codegen | IMPLEMENTADO | operador-dev | `packages/design-tokens/build.mjs` |
| `(camada B real) packages/ui-vue` | Kit Vue 19 componentes + 4 composables | IMPLEMENTADO | operador-dev | `packages/ui-vue/src/index.js` |
| `(camada C real) packages/platform-shell` | Casca global <platform-shell> + paleta --p-* | IMPLEMENTADO | todos | `packages/platform-shell/shell.js` |
| `(camada B prometida) packages/ui-react` | Kit React prometido no doc canônico | DOCUMENTADO/PLANEJADO | operador-dev | `DESIGN_SYSTEM.md` |
| `(camada C prometida) ui-vanilla.css` | CSS compartilhado prometido no doc canônico | DOCUMENTADO/PLANEJADO | operador-dev | `DESIGN_SYSTEM.md` |
| `(gate) design-tokens-gate` | Drift-gate CI (3 checks + 2 suítes de teste) | IMPLEMENTADO | operador-dev | `.github/workflows/design-tokens-gate.yml` |
| `(scaffold) templates/app-template` | Golden path de app novo | PARCIALMENTE IMPLEMENTADO | operador-dev | `templates/app-template/README.md` |

---

## 4. Matriz produto × papel × jornada × nível de acesso

### 4.1 Papéis reais por produto (fonte: código, não documentação)

A tabela lista os papéis que EXISTEM no código (enums, seeds, guards, middlewares) e como cada um é
efetivamente gateado. `header-stand-in` = identidade por cabeçalho HTTP substituível (sem sessão real
na SPA); `nenhum` = superfície pública ou papel sem gating.


| Produto | Papel | Gating real | Fonte |
|---|---|---|---|
| Portal raiz | visitante-anonimo | nenhum | `portal/frontend/assets/portal.js:212-214` |
| Portal raiz | operador | api | `portal/frontend/assets/portal.js:270-276` |
| DevOps Console | platform-admins | api | `console/backend/src/index.js:1010` |
| DevOps Console | project-members | api | `console/backend/src/index.js:1011` |
| DevOps Console | sem-identidade (dev-trust) | nenhum | `console/backend/src/index.js:1016` |
| SICAT | generator | router-guard | `apps/sicat/frontend/src/composables/usePersona.js:12-16` |
| SICAT | carrier | router-guard | `apps/sicat/frontend/src/config/navigation.js:218` |
| SICAT | receiver | router-guard | `apps/sicat/frontend/src/views/ManifestsView.vue:226` |
| SICAT | admin global / SRE | api | `apps/sicat/backend/src/services/access-admin-service.ts:47-52` |
| GymOps | owner | api | `apps/gymops/packages/db/prisma/schema.prisma:13` |
| GymOps | org_manager | api | `apps/gymops/packages/db/prisma/schema.prisma:14` |
| GymOps | unit_manager | api | `apps/gymops/packages/db/prisma/schema.prisma:15` |
| GymOps | area_leader | api | `apps/gymops/packages/db/prisma/schema.prisma:16` |
| GymOps | executor | api | `apps/gymops/packages/db/prisma/schema.prisma:17` |
| GymOps | viewer | api | `apps/gymops/packages/db/prisma/schema.prisma:18` |
| GymOps | platform_admin (isPlatformAdmin) | router-guard | `apps/gymops/apps/web/src/store/auth.ts:29` |
| RM Ambiental | visitante | nenhum | `apps/rmambiental/CLAUDE.md:43` |
| RM Ambiental | editor | header-stand-in | `apps/rmambiental/src/lib/cmsEdit.tsx:32-42` |
| BESC | public | api | `apps/besc/api/src/foundation/rbac.js:39` |
| BESC | investor | api | `apps/besc/api/src/foundation/rbac.js:40` |
| BESC | lawyer | api | `apps/besc/api/src/foundation/rbac.js:41` |
| BESC | judge | api | `apps/besc/api/src/foundation/rbac.js:42` |
| BESC | manager | api | `apps/besc/api/src/foundation/rbac.js:44` |
| BESC | admin | api | `apps/besc/api/src/foundation/rbac.js:53` |
| ZapBridge | usuário (dono da conta) | router-guard | `apps/zapbridge/docs/MVP-FUNCIONAL.md:29-37` |
| Reqhub | operador | header-stand-in | `apps/reqhub/k8s/reqhub.yaml:108-112` |
| Reqhub | platform-admin | api | `apps/reqhub/frontend/assets/app.js:2739-2744` |
| Portal Recorder | operador | api | `apps/portal-recorder/k8s/ingressroute.yaml:61-63` |
| ContaViva 360 | admin | header-stand-in | `apps/contaviva-360/api/src/rbac.js:3` |
| ContaViva 360 | manager | header-stand-in | `apps/contaviva-360/api/src/rbac.js:3` |
| ContaViva 360 | member | header-stand-in | `apps/contaviva-360/api/src/rbac.js:3` |
| ContaViva 360 | contador | nenhum | `apps/contaviva-360/frontend/src/views/DashboardView.vue:20` |
| ContaViva 360 | cliente_pf | nenhum | `apps/contaviva-360/frontend/src/views/DashboardView.vue:22` |
| ContaViva 360 | cliente_pj | nenhum | `apps/contaviva-360/frontend/src/views/DashboardView.vue:23` |
| ContaViva 360 | auxiliar contábil / gestor financeiro / convidado | nenhum | `specs/products/contaviva-360/product.json:29` |
| ContaViva Pro | member | router-guard | `apps/contaviva-pro/api/src/auth.js:21` |
| ContaViva Pro | admin | router-guard | `apps/contaviva-pro/frontend/src/router.js:20` |
| ContaViva Pro | manager | api | `apps/contaviva-pro/api/src/auth.js:21` |
| NeuroEvolui | owner | header-stand-in | `apps/neuroevolui/api/src/rbac.js:4` |
| NeuroEvolui | clinic_manager | header-stand-in | `apps/neuroevolui/api/src/rbac.js:4` |
| NeuroEvolui | professional | api | `apps/neuroevolui/api/src/rbac.js:4` |
| NeuroEvolui | patient | nenhum | `apps/neuroevolui/api/src/rbac.js:4` |
| Imobia | admin | api | `apps/imobia/api/prisma/schema.prisma:16` |
| Imobia | corretor | nenhum | `apps/imobia/api/prisma/schema.prisma:17` |
| Imobia | financeiro | nenhum | `apps/imobia/api/prisma/schema.prisma:18` |
| Imobia | vistoriador | nenhum | `apps/imobia/api/prisma/schema.prisma:19` |
| Ana Rabottini | visitante | nenhum | `apps/anarabottini/src/App.tsx:42-46` |
| Ana Rabottini | editor-cms | api | `apps/anarabottini/src/lib/cmsEdit.tsx:31-42` |
| Design System (transversal) | operador-dev da plataforma | nenhum | `DESIGN_SYSTEM.md:62-66` |
| Design System (transversal) | usuário final indireto (apps) | nenhum | `packages/ui-vue/build.mjs:2-5` |
| Design System (transversal) | platform-admin (identidade na casca) | api | `packages/platform-shell/shell.js:67-78` |
| Docs↔código (transversal) | operador | nenhum | `apps/reqhub/frontend/assets/studio.js:282` |
| Docs↔código (transversal) | agente-claude | nenhum | `specs/CLAUDE.md:14-17` |
| Docs↔código (transversal) | stakeholder-externo | nenhum | `apps/besc/docs/evolution/00-visao-geral.md:9-10` |

### 4.2 Jornadas por papel (com quebras verificadas)

105 jornadas mapeadas pelos auditores de superfície. A coluna "Quebras" aponta os achados
(pós-verificação adversarial) que interrompem ou degradam a jornada — detalhados na seção 10.
Estados conforme a taxonomia da seção 2. As jornadas das linhas "Integração/Navegação", "UX de IA",
"A11y plataforma" e "QA/Regressão" são jornadas TRANSVERSAIS (cruzam produtos).


| Produto | Papel | Jornada | Etapas | Estado | Quebras (achados) |
|---|---|---|---|---|---|
| Portal | visitante-anonimo | Descobrir e acessar um produto | 4 | IMPLEMENTADO | — |
| Portal | visitante-anonimo | Contato comercial | 2 | IMPLEMENTADO | — |
| Portal | visitante-anonimo | Recuperar-se de URL inexistente | 3 | IMPLEMENTADO | — |
| Portal | operador | Entrar e ver o cluster na home | 4 | IMPLEMENTADO | UX-PORTAL-008 |
| Portal | operador | Monitorar apps publicadas (refresh 60s) | 4 | IMPLEMENTADO | UX-PORTAL-005 |
| Console | platform-admins | Diagnosticar app com problema | 5 | IMPLEMENTADO | UX-CONSOLE-010 |
| Console | platform-admins | Auditar publicações da esteira | 4 | IMPLEMENTADO | UX-CONSOLE-018 |
| Console | project-members | Trabalhar o board de um produto | 5 | IMPLEMENTADO | UX-CONSOLE-001, UX-CONSOLE-002 |
| Console | project-members | Editar conteúdo de um portal | 5 | IMPLEMENTADO | UX-CONSOLE-003, UX-CONSOLE-004 |
| Console | project-members | Criar portal novo com IA ao vivo | 5 | IMPLEMENTADO | UX-CONSOLE-009 |
| Console | platform-admins | Governar portal (aprovar/desativar/excluir) | 5 | IMPLEMENTADO | — |
| Console | platform-admins | Gerenciar usuários restritos | 5 | IMPLEMENTADO | — |
| Console | project-members | Editar portal embutido no Studio (embed) | 4 | IMPLEMENTADO | — |
| SICAT | generator | Emitir MTR | 6 | IMPLEMENTADO | UX-SICAT-002, UX-SICAT-005 |
| SICAT | generator | Acompanhar e corrigir falhas | 4 | IMPLEMENTADO | UX-SICAT-001, UX-SICAT-002 |
| SICAT | receiver | Receber manifestos (dar baixa) | 5 | IMPLEMENTADO | — |
| SICAT | receiver | Gerar CDF | 5 | IMPLEMENTADO | — |
| SICAT | generator | Tirar dúvidas / agir por IA | 4 | IMPLEMENTADO | UX-SICAT-006, UX-SICAT-007 |
| SICAT | admin global / SRE | Operar o sistema | 3 | IMPLEMENTADO | — |
| SICAT | admin global / SRE | Administrar acessos (conceder/revogar/reset) | 4 | PARCIALMENTE IMPLEMENTADO | UX-SICAT-003 |
| SICAT | carrier | Acompanhar manifestos da viagem | 4 | IMPLEMENTADO | — |
| GymOps | owner | Criar organização e operar | 6 | IMPLEMENTADO | UX-GYMOPS-002, UX-GYMOPS-021 |
| GymOps | org_manager | Convidar membro e recebê-lo | 5 | IMPLEMENTADO | UX-GYMOPS-006, UX-GYMOPS-021 |
| GymOps | executor | Executar atividades do dia | 5 | IMPLEMENTADO | UX-GYMOPS-002, UX-GYMOPS-013 |
| GymOps | unit_manager | Gerir a unidade | 5 | IMPLEMENTADO | UX-GYMOPS-003, UX-GYMOPS-017 |
| GymOps | area_leader | Operar a área | 4 | IMPLEMENTADO | UX-GYMOPS-003, UX-GYMOPS-002 |
| GymOps | viewer | Consultar itens compartilhados | 3 | IMPLEMENTADO | UX-GYMOPS-002 |
| GymOps | todos | Login com Google/SSO (primeiro acesso) | 4 | PARCIALMENTE IMPLEMENTADO | UX-GYMOPS-001 |
| GymOps | todos | Onboarding e ajuda | 4 | IMPLEMENTADO | — |
| GymOps | org_manager | Central: filtrar, bulk e exportar | 5 | IMPLEMENTADO | UX-GYMOPS-009, UX-GYMOPS-011 |
| GymOps | todos | Preferências de notificação + push | 4 | PARCIALMENTE IMPLEMENTADO | UX-GYMOPS-005 |
| GymOps | platform_admin | Administrar academias/masters | 4 | IMPLEMENTADO | — |
| RM Ambiental | visitante | Descobrir → confiar → contatar | 5 | IMPLEMENTADO | UX-RMAMB-001, UX-RMAMB-003, UX-RMAMB-006 |
| RM Ambiental | visitante | Explorar projetos (galeria) | 4 | IMPLEMENTADO | UX-RMAMB-005 |
| RM Ambiental | editor | Editar conteúdo pelo Console | 4 | IMPLEMENTADO | — |
| BESC | public | Explorar o portal de conhecimento | 5 | IMPLEMENTADO | — |
| BESC | public | Criar conta e aguardar liberação | 5 | IMPLEMENTADO | — |
| BESC | investor | Investir em um título | 6 | IMPLEMENTADO | UX-BESC-010 |
| BESC | lawyer | Ser convidado e auditar um título | 5 | PARCIALMENTE IMPLEMENTADO | UX-BESC-001, UX-BESC-002 |
| BESC | manager | Levantar um caso até apto | 6 | IMPLEMENTADO | UX-BESC-008 |
| BESC | manager | Estruturar e publicar um título | 6 | IMPLEMENTADO | — |
| BESC | manager | Operar o financeiro | 5 | IMPLEMENTADO | UX-BESC-004, UX-BESC-014 |
| BESC | manager | Governar acesso e go-live | 5 | IMPLEMENTADO | UX-BESC-001 |
| ZapBridge | usuário | Entrar / criar conta | 4 | IMPLEMENTADO | UX-ZAP-016 |
| ZapBridge | usuário | Conectar WhatsApp (QR/pairing) | 5 | IMPLEMENTADO | — |
| ZapBridge | usuário | Conversar (ler, enviar texto/midia, responder, reagir) | 5 | IMPLEMENTADO | UX-ZAP-001, UX-ZAP-003, UX-ZAP-012 |
| ZapBridge | usuário | Usar assistente IA com consentimento | 5 | PARCIALMENTE IMPLEMENTADO | UX-AI-001, UX-ZAP-006, UX-ZAP-018 |
| ZapBridge | usuário | Gerenciar sessão (status, desconectar, sair) | 4 | IMPLEMENTADO | UX-ZAP-002, UX-ZAP-004, UX-ZAP-019 |
| ZapBridge | usuário | Organizar conversas (favoritos, arquivadas, grupos, encaminhar) | 4 | PARCIALMENTE IMPLEMENTADO | UX-ZAP-009, UX-ZAP-010, UX-ZAP-020 |
| Reqhub | operador | Explorar e detalhar requisito | 5 | IMPLEMENTADO | UX-REQHUB-001 |
| Reqhub | operador | Autoria assistida por IA → PR | 6 | IMPLEMENTADO | — |
| Reqhub | operador | Forja — criar/acompanhar produto | 6 | IMPLEMENTADO | — |
| Reqhub | operador | Analisar impacto no mapa | 5 | IMPLEMENTADO | — |
| Reqhub | operador | Revisar mudanças e reprocessamento | 4 | IMPLEMENTADO | UX-REQHUB-001 |
| Reqhub | platform-admin | Monitorar uso e custo da IA | 5 | IMPLEMENTADO | UX-REQHUB-005 |
| Portal Recorder | operador | Configurar credencial de escrita | 4 | IMPLEMENTADO | UX-PREC-002, UX-PREC-015 |
| Portal Recorder | operador | Cadastrar portal externo | 4 | IMPLEMENTADO | UX-PREC-010 |
| Portal Recorder | operador | Capturar portal (jornada crítica) | 6 | IMPLEMENTADO | UX-PREC-001, UX-PREC-004, UX-PREC-005, UX-PREC-007, UX-PREC-009, UX-PREC-012 |
| Portal Recorder | operador | Revisar e normalizar contrato | 5 | IMPLEMENTADO | UX-PREC-006, UX-PREC-010 |
| Portal Recorder | operador | Promover contrato para o git | 3 | IMPLEMENTADO | — |
| ContaViva 360 | cliente_pf | Acompanhar obrigações e marcar como concluída | 4 | IMPLEMENTADO | UX-CV360-001, UX-CV360-003 |
| ContaViva 360 | cliente_pj | Gestão financeira AP/AR → fluxo → relatórios | 5 | IMPLEMENTADO | UX-CV360-006, UX-CV360-007, UX-CV360-012 |
| ContaViva 360 | contador | Supervisionar carteira de clientes e documentos | 4 | PARCIALMENTE IMPLEMENTADO | UX-CV360-002, UX-CV360-008 |
| ContaViva 360 | admin | Monitorar saúde do sistema e jobs | 3 | IMPLEMENTADO | UX-CV360-001 |
| ContaViva 360 | todos | Consultar o assistente de IA com anexos | 4 | IMPLEMENTADO | UX-CV360-009 |
| ContaViva 360 | cliente_pj | Emitir e rastrear notas fiscais | 4 | PARCIALMENTE IMPLEMENTADO | UX-CV360-002 |
| ContaViva Pro | member | Registrar-se e começar a usar | 5 | IMPLEMENTADO | — |
| ContaViva Pro | todos | Manter sessão durante o trabalho | 3 | PARCIALMENTE IMPLEMENTADO | UX-CVPRO-003, UX-CVPRO-004 |
| ContaViva Pro | admin | Gerenciar usuários | 5 | IMPLEMENTADO | UX-CVPRO-006 |
| ContaViva Pro | todos | Editar um registro existente | 4 | PARCIALMENTE IMPLEMENTADO | UX-CVPRO-002 |
| ContaViva Pro | member | Recuperar senha esquecida | 2 | NÃO INICIADO | UX-CVPRO-005 |
| ContaViva Pro | todos | Entrar via SSO Keycloak | 5 | PARCIALMENTE IMPLEMENTADO | UX-CVPRO-011 |
| ContaViva Pro | todos | Consultar o assistente de IA (com anexos) | 4 | IMPLEMENTADO | — |
| NeuroEvolui | todos | Entrar no app (autenticação) | 3 | NÃO INICIADO | UX-NEURO-001, UX-NEURO-007 |
| NeuroEvolui | professional | Cadastrar paciente | 5 | IMPLEMENTADO | UX-NEURO-004, UX-NEURO-005, UX-NEURO-014, UX-NEURO-003 |
| NeuroEvolui | professional | Agendar e gerir consultas | 4 | IMPLEMENTADO | UX-NEURO-005, UX-NEURO-009 |
| NeuroEvolui | professional | Registrar evolução com rascunho IA | 5 | IMPLEMENTADO | — |
| NeuroEvolui | clinic_manager | Acompanhar financeiro e auditoria | 3 | IMPLEMENTADO | UX-NEURO-002 |
| NeuroEvolui | clinic_manager | Configurar notificações | 4 | IMPLEMENTADO | UX-NEURO-002, UX-NEURO-022 |
| NeuroEvolui | professional | Consultar o Assistente IA | 4 | IMPLEMENTADO | UX-NEURO-008, UX-NEURO-002 |
| NeuroEvolui | patient | Área do paciente (consultas, orientações, IA) | 3 | DOCUMENTADO/PLANEJADO | UX-NEURO-006, UX-NEURO-011 |
| Imobia | todos | Descobrir produto e entrar | 4 | IMPLEMENTADO | — |
| Imobia | admin | Captar e gerir imóveis | 4 | IMPLEMENTADO | UX-IMOBIA-001, UX-IMOBIA-003, UX-IMOBIA-006, UX-IMOBIA-013 |
| Imobia | admin | Qualificar lead com IA | 4 | IMPLEMENTADO | UX-IMOBIA-001, UX-IMOBIA-009 |
| Imobia | admin | Agendar (manual e por linguagem natural) | 3 | IMPLEMENTADO | UX-IMOBIA-006 |
| Imobia | admin | Validar documento | 4 | IMPLEMENTADO | UX-IMOBIA-009, UX-IMOBIA-012 |
| Imobia | admin | Vistoria com fotos e laudo | 4 | IMPLEMENTADO | UX-IMOBIA-001, UX-IMOBIA-008, UX-IMOBIA-021 |
| Imobia | admin | Financeiro PJ/PF | 4 | IMPLEMENTADO | UX-IMOBIA-008, UX-IMOBIA-012 |
| Imobia | admin | Recuperação de crédito (Corbam) | 4 | IMPLEMENTADO | UX-IMOBIA-001, UX-IMOBIA-008 |
| Imobia | admin | ACM → PTAM | 4 | IMPLEMENTADO | UX-IMOBIA-001, UX-IMOBIA-021 |
| Imobia | admin | WhatsApp: canais e triagem | 3 | IMPLEMENTADO | — |
| Imobia | admin | Conversar com o assistente IA | 4 | IMPLEMENTADO | UX-IMOBIA-007, UX-IMOBIA-014, UX-IMOBIA-015 |
| Imobia | todos | Entrar via SSO Keycloak | 4 | PARCIALMENTE IMPLEMENTADO | UX-IMOBIA-016 |
| Ana Rabottini | visitante | Conhecer e solicitar proposta (conversão) | 5 | PARCIALMENTE IMPLEMENTADO | UX-ANA-001 |
| Ana Rabottini | visitante | Explorar mídia e materiais | 4 | IMPLEMENTADO | — |
| Ana Rabottini | editor-cms | Editar conteúdo do portal pelo Console | 4 | PARCIALMENTE IMPLEMENTADO | UX-ANA-002, UX-ANA-006 |
| Design System | operador-dev da plataforma | Criar app novo já dentro do DS | 5 | PARCIALMENTE IMPLEMENTADO | UX-DS-007 |
| Design System | operador-dev da plataforma | Editar token e propagar à frota | 4 | IMPLEMENTADO | — |
| Design System | usuário final indireto (apps) | Escolher tema e navegar entre superfícies | 4 | PARCIALMENTE IMPLEMENTADO | UX-DS-004 |
| Design System | operador-dev da plataforma | Contribuir componente compartilhado | 4 | PARCIALMENTE IMPLEMENTADO | UX-DS-001 |
| Design System | usuário final indireto (apps) | Navegar pelo launcher da casca (teclado/SR) | 4 | IMPLEMENTADO | UX-DS-005 |
| Docs↔código | operador | Avaliar o portfolio pela vitrine do Studio | 4 | IMPLEMENTADO | UX-DOCS-001, UX-DOCS-002 |
| Docs↔código | agente-claude | Onboardar num app pelos meta-docs (ordem de leitura obrigatória) | 3 | IMPLEMENTADO | UX-DOCS-004, UX-DOCS-007, UX-DOCS-008 |
| Docs↔código | operador | Auditar qualidade/cobertura pela baseline | 3 | IMPLEMENTADO | UX-DOCS-005, UX-DOCS-009, UX-DOCS-010 |
| Docs↔código | stakeholder-externo | Entender o status do BESC pelos docs | 3 | IMPLEMENTADO | UX-DOCS-003 |
| Integração/Navegação | platform-admins | Portal -> Console -> Grafana/Argo -> retorno | 5 | IMPLEMENTADO | UX-NAV-002, UX-NAV-005 |
| Integração/Navegação | usuário-de-produto | Cruzar produtos (SICAT -> GymOps -> ZapBridge) e voltar ao hub | 6 | PARCIALMENTE IMPLEMENTADO | UX-NAV-001, UX-NAV-004 |
| Integração/Navegação | visitante-anonimo | Entrar pelo host local e voltar logado | 4 | PARCIALMENTE IMPLEMENTADO | UX-NAV-003 |
| Integração/Navegação | project-members | Handoff por deep-link de produto (launcher -> Console/Studio) | 3 | IMPLEMENTADO | UX-NAV-007, UX-NAV-008 |
| UX de IA | operador-plataforma | Governar a IA da plataforma (custo, prompts, qualidade) | 3 | PARCIALMENTE IMPLEMENTADO | UX-AICP-001, UX-AICP-002, UX-AICP-003 |
| UX de IA | usuário-final-por-app | Pedir ação mutante a IA e confirmar antes de executar | 4 | PARCIALMENTE IMPLEMENTADO | UX-AI-001 |
| UX de IA | usuário-final-por-app | Delegar auto-resposta do WhatsApp e manter controle | 4 | PARCIALMENTE IMPLEMENTADO | UX-AI-002 |
| A11y plataforma | usuário de teclado / tecnologia assistiva (todas as superfícies) | Operar a jornada nuclear de qualquer produto só por teclado | 4 | PARCIALMENTE IMPLEMENTADO | UX-A11Y-001, UX-A11Y-002 |
| A11y plataforma | usuário com baixa visão / sensibilidade a luz (tema e contraste) | Ler status/badges no tema claro | 2 | IMPLEMENTADO | UX-A11Y-003 |
| A11y plataforma | usuário com baixa visão / sensibilidade a luz (tema e contraste) | Escolher tema escuro e mantê-lo entre superfícies e sessões | 4 | PARCIALMENTE IMPLEMENTADO | UX-A11Y-004 |
| A11y plataforma | usuário de teclado / tecnologia assistiva (todas as superfícies) | Pular navegação, orientar-se por landmarks e ouvir mudanças dinâmicas | 3 | PARCIALMENTE IMPLEMENTADO | UX-A11Y-006, UX-A11Y-007 |
| QA/Regressão | operador-dev da plataforma | Mergear PR de app da Forja confiando no gate | 4 | IMPLEMENTADO | UX-QA-003, UX-QA-004, UX-QA-011 |
| QA/Regressão | operador-dev da plataforma | Mergear PR do sicat com mudança de frontend | 5 | IMPLEMENTADO | UX-QA-002, UX-QA-008 |
| QA/Regressão | operador-dev da plataforma | Validar correção de UX do Plano Mestre sem regressão | 4 | NÃO INICIADO | UX-QA-005, UX-QA-006, UX-QA-007, UX-QA-009 |

---

## 5. Scorecard por produto

Notas 0–5 calibradas (rubrica ancorada + calibração por dimensão com testes de sanidade; ajustes
listados em 5.2). Ponderada = média ponderada (usabilidade 20% · IA/navegação 15% · a11y 15% ·
DS 15% · responsividade 10% · estados 10% · onboarding/auth/RBAC 10% · perf. percebida 5%), com
pesos renormalizados quando há N/A. **AI Control Plane não recebe nota** (sem UI — ver 7.15).
Os P0/P1 transversais (UX-A11Y-\*, UX-NAV-\*, UX-QA-\*, UX-AI-\*) são contabilizados pela superfície
transversal, não pelas linhas dos produtos — leia o scorecard junto com a seção 6.

### 5.1 Notas finais

| Superfície | Usab. (20) | IA/Nav (15) | A11y (15) | DS (15) | Resp. (10) | Estados (10) | Onb/RBAC (10) | Perf. (5) | **Ponderada** |
|---|---|---|---|---|---|---|---|---|---|
| Portal raiz | 4,5 | 4,5 | 3,5 | 4,5 | 4,5 | 4,0 | 4,0 | 4,5 | **4,25** |
| Reqhub | 4,0 | 4,0 | 3,5 | 4,5 | 4,0 | 4,0 | 4,0 | 4,0 | **4,00** |
| Ana Rabottini | 3,5 | 3,5 | 4,0 | 4,5 | 4,0 | 3,5 | 3,5 † | 3,5 | **3,78** |
| SICAT | 4,0 | 3,5 | 3,5 | 4,0 | 4,0 | 3,5 | 3,5 | 3,0 | **3,70** |
| RM Ambiental | 3,5 | 4,0 | 3,0 | 4,5 | 4,0 | 3,0 | N/A | 3,5 | **3,67** |
| DevOps Console | 3,5 | 4,0 | 2,5 | 4,0 | 3,5 | 4,0 | 4,0 | 4,0 | **3,63** |
| Portal Recorder | 3,5 | 4,0 | 2,5 | 4,5 | 3,5 | 3,0 | 3,0 | 3,5 | **3,48** |
| BESC | 3,5 | 4,0 | 3,5 | 3,5 | 3,0 | 3,5 | 3,0 † | 3,0 | **3,45** |
| Design System (camada) | 3,5 | 4,0 | 2,5 | 3,0 | 3,0 | 4,5 | 3,5 | 4,0 | **3,43** |
| GymOps | 3,5 | 3,0 | 2,5 | 3,5 | 4,0 | 3,5 | 3,0 | 3,5 | **3,28** |
| ZapBridge | 3,0 | 3,0 | 2,5 | 3,5 | 4,0 | 3,0 | 3,0 | 3,0 | **3,10** |
| ContaViva Pro | 2,0 | 3,5 | 3,5 | 4,0 | 3,5 | 3,0 | 2,5 | 3,0 | **3,10** |
| NeuroEvolui | 2,5 | 2,5 | 3,5 | 3,5 | 3,5 | 3,0 † | 1,5 | 2,5 | **2,85** |
| Imobia | 3,0 | 3,5 | 2,0 | 3,0 | 3,0 | 2,5 | 2,5 | 3,0 | **2,83** |
| ContaViva 360 | 2,0 † | 2,5 | 2,5 † | 3,0 † | 3,5 | 3,0 | 1,0 | 3,0 | **2,50** |

† = célula ajustada na calibração (ver 5.2).

### 5.2 Changelog da calibração (6 ajustes, todos ≤ ±1,0)

| Superfície | Dimensão | De → Para | Motivo (resumo) |
|---|---|---|---|
| ContaViva 360 | usabilidade | 2,5 → 2,0 | P0 UX-CV360-002 (2 papéis sem superfície para a jornada crítica) + 2 P1; âncora 2; referência: ContaViva Pro 2,0 com quebra equivalente |
| ContaViva 360 | a11y | 3,0 → 2,5 | 2 P1 estruturais em fluxo principal (WCAG 2.1.1 e 3.3.2); mesmo perfil de Console/ZapBridge (2,5) |
| ContaViva 360 | consistência/DS | 3,5 → 3,0 | P1 UX-CV360-006 (tokens fantasma com quebra visual real); Imobia com quebra análoga levou 3,0 |
| NeuroEvolui | estados/feedback | 3,5 → 3,0 | 3 P1 de falha silenciosa/enganosa (confirm quebrado, 401≡403, agenda truncada); pares do mesmo kit com 2 P1 levaram 3,0 |
| BESC | onboarding/RBAC | 3,5 → 3,0 | 2 P1 na dimensão (convite sem tela de resgate; advogado/juiz caindo na área de gestão) |
| Ana Rabottini | onboarding/RBAC | N/A → 3,5 | Regra de sanidade: havia achado sobrevivente na dimensão (UX-ANA-005), N/A inválido |

Notas de método da calibração: (a) o padrão dominante de inconsistência foi os auditores dos apps da
Forja pontuarem ~0,5 acima dos pares para o mesmo perfil — origem de 4 dos 6 ajustes; (b) Ana
Rabottini (4,0) superar o Portal (3,5) em a11y foi mantido com justificativa explícita: o Portal está
capado pelo P1 de contraste próprio (UX-PORTAL-001), enquanto o Ana Rabottini cumpre a âncora 4 item
a item e está fora dos achados sistêmicos UX-A11Y-001/002; (c) nenhuma célula exigiu ajuste maior
que ±1,0.


---

## 6. Diagnóstico transversal da plataforma


Os cortes transversais (a11y de plataforma, UX de IA, docs↔código) convergem num diagnóstico único: **os padrões corretos já existem dentro do monorepo — o que falta é promovê-los a fundação e impedir que a frota nasça sem eles**. Nenhum achado transversal morreu na verificação adversarial (0 mortos em a11y-plataforma, ux-ia e docs-vs-código; `verification-report.json`), com 4 rebaixamentos e 1 elevação que refinam — não invalidam — o quadro abaixo.

### 6.1 Padrões sistêmicos que atravessam produtos

**"Clicável fantasma" é o P0 de plataforma.** A interação primária de 5+ produtos é `div`/`tr`/`article` com `onClick`, invisível ao teclado (WCAG 2.1.1, nível A) — **UX-A11Y-001 (P0)**, agregando UX-GYMOPS-002 (P0, abrir atividade impossível por teclado, `apps/gymops/apps/web/src/components/activities/ActivityCard.tsx:18-23`), UX-IMOBIA-001 (P0, detalhe de todos os módulos, `apps/imobia/frontend/src/views/app/Imoveis.vue:89`), UX-CONSOLE-001 (P1, card do kanban), UX-CV360-008 (P1) e UX-ZAP-001 (P1, ações só no hover). O reqhub exibe a hipercorreção do mesmo defeito: `tr role="button"` que destrói a semântica de tabela (UX-REQHUB-001, P1). A causa é de fundação: o anel de foco existe no kit (`packages/ui-vue/src/ui.css:22-28`), mas o barrel de 19 componentes (`packages/ui-vue/src/index.js:3-21`) não oferece primitiva de card interativo e nenhum gate barra `onClick` em elemento não-interativo — com a ressalva da verificação de que `UiDataTable` já é linha clicável acessível (tabindex + enter/space); falta a primitiva de card e o gate.

**Focus-trap: o algoritmo certo existe TRIPLICADO e não é fundação** (**UX-A11Y-002, P1**). Três implementações corretas e quase idênticas — `packages/ui-vue/src/components/UiModal.vue:30-40`, `apps/anarabottini/src/components/Modal.tsx:17-21` e `apps/reqhub/frontend/assets/app.js:2645` — enquanto 7 superfícies vazam foco (UX-CONSOLE-002, UX-GYMOPS-004, UX-IMOBIA-002 — todos P1 —, UX-SICAT-015, UX-ZAP-014, UX-RMAMB-005, UX-DS-013). O detalhe revelador: o `Modal.tsx` do anarabottini documenta ter extraído e consertado a mecânica do lightbox do rmambiental, e a correção nunca refluiu à origem (`apps/rmambiental/src/components/SectionRenderer.tsx:292-295`) — o monorepo melhora componentes por cópia e não repatria.

**Contraste de badges: causa única em 2 renderers** (**UX-A11Y-003, P1**, absorvendo UX-DS-002 como duplicado e agregando UX-PORTAL-001/UX-PREC-006, ambos P1). O anti-padrão "cor crua do tom sobre tinta translúcida do próprio tom, validada contra o fundo errado" está codificado em `packages/design-tokens/renderers/platform.mjs:33-35` (transcrição pura, zero validação — afeta portal, console, reqhub, portal-recorder) e em `forge-brand.mjs:118-120` (valida contra a surface sólida, mas `UiStatusBadge.vue:25-27` renderiza sobre fundo tintado). Consertar as 2 raízes e regenerar conserta 7+ superfícies de uma vez; o modelo correto já existe em `tokens.json > brands.sicat.css` (pares `status-*-bg/fg` explícitos).

**Falha silenciosa como anti-padrão recorrente.** Catch vazio ou empty state enganoso aparece de forma independente em: contaviva-360 ("Marcar como concluído" falha em silêncio, UX-CV360-003 P1, `DashboardClientePfView.vue:140-145`), imobia (falha de carregamento vira empty state enganoso por try/finally sem catch, UX-IMOBIA-003 P1, `Imoveis.vue:25-31`), zapbridge (reescrita IA ✨ falha sem mensagem, UX-ZAP-013 P2, `MessageInput.tsx:74-79`) e neuroevolui (cadastro descarta silenciosamente CPF/gênero/referência, UX-NEURO-004 P1, `PatientCreateView.vue:531-538`).

**Becos sem saída de sessão.** 5 apps não redirecionam nem explicam o 401 durante o uso: contaviva-pro (tela morta sem redirect, UX-CVPRO-004 P1, `router.js:30`), gymops (preso em "Verifique sua conexão" com retry inútil, UX-GYMOPS-007 P1 — com a ressalva verificada de que o logout funciona no boot; o beco é mid-sessão), imobia (401 vira alert/vazio, UX-IMOBIA-007 P1), neuroevolui (401≡403 como "Acesso restrito", UX-NEURO-007 P1) e zapbridge (nenhum interceptor de 401, UX-ZAP-002 P1, `web/src/api/client.ts:42-52`).

Completam o quadro sistêmico: tema escuro com 4 chaves de localStorage e, no neuroevolui, 2 togglers concorrentes no mesmo app — a escolha feita em Configurações reverte no reload (`SettingsView.vue:825` grava `neuroevolui-theme` enquanto o UiAppShell reidrata de `nvit-theme`) — **UX-A11Y-004 (P2)**; skip-link/landmarks em mosaico, com o imobia como único app sem nenhum dos três completos (**UX-A11Y-006, P2**, `AppShell.vue:24`); e zero verificação automatizada de a11y no CI (**UX-A11Y-005, P2** — nenhum axe/lighthouse/pa11y em package.json/workflow; o único teste de contraste, `forge-brand.test.mjs`, não roda no `design-tokens-gate.yml`).

### 6.2 Autenticação e RBAC como problema de plataforma

A dimensão `onboarding_auth_rbac` do scorecard expõe o espectro completo: de **1.0** (contaviva-360) e **1.5** (neuroevolui) a **4.0** (portal, reqhub, console). Numa ponta, SPAs operacionais inteiras sem guard nem fluxo de login — UX-CV360-001 (P0, `main.js:8-9`, confirmado ao vivo com a ressalva de que a borda da API tem ForwardAuth; o gap real é `X-Role` spoofável atrás dela) e UX-NEURO-001 (P0) — mais a API do contaviva-pro aceitando leitura/escrita de records sem Bearer enquanto o front finge proteção (UX-CVPRO-001, P0, `api/src/server.js:25`). Na outra, guards exemplares: o próprio contaviva-pro no frontend (`router.js:12-31` — `requiresAuth`/`requiresAdmin` com hidratação de sessão antes da 1ª navegação, citado em UX-DOCS-001) e os route groups do gymops com 6 papéis reais no Prisma.

**Papéis órfãos ou inatingíveis são padrão, não exceção:** contaviva-360 promete 7 perfis na visão, reduz a 4 no REQ e entrega 3 ranks por header stand-in (UX-CV360-014 P2; cadeia documental em UX-DOCS-005 P1); imobia declara 4 papéis no enum e na sidebar com zero gating e papéis inatingíveis (UX-IMOBIA-004, P1, `api/src/lib/crud.ts:25`); neuroevolui tem `patient` como papel default da API sem uma única tela para ele (UX-NEURO-006 P1, `api/src/rbac.js:4`; UX-DOCS-006 P2 — o paciente autenticado cai numa UI administrativa que quase tudo lhe nega); besc roteia advogado/juiz via `titles:read` para a área de GESTÃO de títulos com affordances de escrita (UX-BESC-002, P1, `App.jsx:220`); e o `manager` do contaviva-pro existe no backend sem superfície (UX-CVPRO-010, P2).

**Fluxos de entrada quebrados no meio:** o convite de auditores do besc não tem tela de resgate no frontend (UX-BESC-001, P1, `api/src/foundation/auth.js:227` — papel sem porta de entrada, um dos 2 P1 que rebaixaram a nota da dimensão para 3.0 no scorecard); no gymops o convite valida senha mínima 6 no cliente enquanto a API exige 8 (UX-GYMOPS-006, P1, `invite/[token]/page.tsx:54`) e o login SSO nunca resolve organizationId/papel, abrindo o app vazio (UX-GYMOPS-001, P0). Recuperação de senha inexiste em contaviva-pro (UX-CVPRO-005, P1) e zapbridge (UX-ZAP-016, P2).

### 6.3 UX de IA — backends maduros, frontends pela metade

O quadro das 9 superfícies conversacionais vivas (+3 meias-UIs de governança + 1 serviço sem rosto) é assimétrico: contratos exemplares de human-in-the-loop existem no servidor e morrem no caminho até a tela. **A cadeia rascunho→confirmação quebra na UI em 3 apps cujo backend a implementa** (**UX-AI-001, P1**): o "Confirmar e aplicar" do neuroevolui não persiste nada — marca flag local e exibe sucesso (UX-NEURO-008, P1, `AssistantView.vue:858-866`); o contaviva-360 recebe `draft`/`citations`/`usage` do contrato e descarta tudo (UX-CV360-009, P1); o zapbridge não tem UI para `proposals` (UX-ZAP-005, absorvido como duplicado de UX-AI-001).

**Risco de ação autônoma confirmado:** o auto-reply do zapbridge envia mensagem real no WhatsApp do usuário sem humano no loop do turno (`server/src/modules/ai/hooks.ts:57-59`), com guardrails de engenharia (judge-gate, horário, teto diário, handoff) mas **nenhuma superfície na web** para ligar/desligar/observar — o cliente `setChatSettings` existe e não tem chamador — e disclaimer ao destinatário vazio por default (**UX-AI-002, P1**). Sobre falibilidade, a verificação rebaixou UX-AI-003 de P1 para **P2**: ela **é** declarada no ponto de ação clínico ("Revise o conteúdo antes de prosseguir", `AssistantView.vue:860`; "A IA é um auxílio — sempre revise", `EvolutionNoteCreateView.vue:424`) — resta a lacuna do disclaimer permanente nos chats, inclusive nos domínios fiscal e contábil.

**O melhor de cada padrão já existe internamente** — o trabalho é promover, não inventar: confirmação dry-run com prévia campo a campo e "Nada foi salvo ainda" = GymOps `AiChatWidget.tsx:205-237` (+ rascunho editável em `AiDraftDialog.tsx:29-76`); cancelar/timeout 60s = NeuroEvolui `AssistantView.vue:277,567`; fontes RAG com relevância = NeuroEvolui `:181-212`; custo/tokens por resposta = Imobia `Assistente.vue:83`; consent de privacidade = ZapBridge `AssistantPage.tsx:105-115`; degradação com caminho manual = Reqhub `app.js:1373-1377`. As lacunas cross-app correspondentes: cancelamento em só 2 de 9 superfícies (UX-AI-004, P2 — com a ressalva de que "trava o composer" é exagero: todos têm `finally` que restaura o estado; falta o cancel voluntário), custo em 3 regimes divergentes (UX-AI-005, P2), nenhuma primitiva "chat IA" no design system (UX-AI-006, P2), memória de conversa divergente e não comunicada (UX-AI-007, P2) e citações produzidas e descartadas (UX-AI-009, P2).

**Governança fragmentada:** os GETs do AI Control Plane (overview, feedback summary, eval runs) não têm nenhum consumidor no repo — o operador governa por curl, e promote/rollback de prompt (a operação mais arriscada) é às cegas (**UX-AICP-001 P1**, `apps/ai-control-plane/api/src/routes.js:140-141`; UX-AICP-002/003, P2). Os 3 painéis concorrentes (SICAT ai-control, Reqhub "Uso da IA", Grafana `ai-platform`) e a proposta de federação numa aba "IA" do Console são detalhados em §7.15.

### 6.4 Verdade documental — a fonte da verdade mente hoje

A "regra de ouro" do `specs/CLAUDE.md` (requisitos = verdade da intenção, código = verdade da implementação) está furada nos dois sentidos. **Código à frente dos docs:** a vitrine da Forja apresenta o contaviva-pro como `not_started` com 0 REQs enquanto o app está no ar sob Argo com auth própria e 10 rotas guardadas (**UX-DOCS-001, P1**, `specs/baseline/products.json:86-91` — o operador é enganado na direção mais perigosa); o besc, produto mais complexo da plataforma (24 rotas com RBAC, 5 migrations), é invisível à base de requisitos (`has_product:false`, 0 REQs) — a verificação rebaixou UX-DOCS-002 para **P2** porque o metadado é verdadeiro e a vitrine o expõe honestamente como "fora da Forja" (lacuna de cobertura, não divergência) — mas os docs internos do besc **negam o código no ar** ("nenhum código de produção foi escrito", `apps/besc/docs/evolution/00-visao-geral.md:13-14`, contradito por `CLAUDE.md:60` no mesmo repo) — **UX-DOCS-003, P1**, risco reputacional/regulatório num domínio de valores mobiliários. **Docs à frente do código:** a cadeia tripla do contaviva-360 (visão 7 perfis → REQ `deployed` exigindo OIDC/4 papéis → código com 3 ranks sem login) — **UX-DOCS-005, P1**.

**Docs operacionais que quebram a esteira:** o `devops.yaml` do zapbridge — o contrato que a esteira usa — ainda builda o frontend Expo aposentado; quem o seguir publica o app antigo por cima do atual (**UX-DOCS-004, P1**, `apps/zapbridge/devops.yaml:24-25`). O CLAUDE.md do imobia declara kit `ui-vue` "sincronizado em F3+"/"TODAS ENTREGUES" sem a dependência existir — **elevado de P2 para P1** na verificação (UX-DOCS-007: quem seguir o manual escreve CSS contra `--ui-*` inexistente, modo de falha real) — e manda `kubectl apply` com Application do Argo viva e `selfHeal` que reverte silenciosamente (UX-DOCS-008, P2).

**A cobertura de UX/a11y na base é quase nula:** 6 de 381 REQs (1,6%) mencionam acessibilidade; zero em sicat (24 REQs), imobia, zapbridge, contaviva-360 e besc (UX-DOCS-009, P2). E 381/381 REQs estão `deployed`/`done` com a dimensão de evidência em **0%** (`coverage-report.json:17`) — o UX-DOCS-005 prova que um `deployed` pode contradizer os próprios critérios de aceite (UX-DOCS-010, P2). Numa esteira em que o próprio `specs/CLAUDE.md` obriga o agente-Claude a consultar a baseline antes de decidir implementação ("Não confie em memória de sessão"), baseline que mente vira **decisão automatizada errada em escala** — a esteira req→implement não tem hoje nenhum gatilho de qualidade UX/a11y para a maioria dos produtos. Ponto a favor: a lacuna de evidência é auto-reportada em artefato versionado, não escondida.

### 6.5 Estados, feedback e resiliência

A distância entre o melhor e o pior é a maior de todas as dimensões. **Os melhores:** o console (estados_feedback 4.0) tem componentes dedicados usados consistentemente — `Skeleton` com 3 variantes, `ToastProvider` com aria-live, `ConfirmDialog` com anti-duplo-submit — e o NewPortalWizard como referência de processo longo (etapas nomeadas, log ao vivo, retry idempotente, `NewPortalWizard.jsx:161-268`); o gymops tem o padrão "erro sem descartar dados" — banner "Não foi possível atualizar — exibindo os últimos dados carregados" com retry (`dashboard/page.tsx:166-174`, `me/page.tsx:153-161`); o neuroevolui comunica conflito 409 com banner `role=alert`, renova a Idempotency-Key e explica ao usuário a proteção contra cobrança dupla (`ConsultationCreateView.vue:62-75,250-254,650-659`).

**Os buracos:** no CMS do próprio console, clique-fora/Esc descartam uma seção inteira editada sem confirmação (UX-CONSOLE-003, P1, `ContentEditor.jsx:53`) e a sessão expirada recarrega a página sem aviso, perdendo drawer em edição, wizard em execução ou instrução de IA digitada (UX-CONSOLE-007, P2, `api.js:25-29`); o portal-recorder perde os passos marcados no reload — só vivem em memória — e duplica `step_index` (UX-PREC-004, P1, `CaptureView.jsx:42`); e o retry inútil aparece onde o erro real é de autorização: gymops preso em "Verifique sua conexão" (UX-GYMOPS-007, P1) e neuroevolui tratando 401/403 dos catálogos como erro de conexão (UX-NEURO-017, P2, `ConsultationCreateView.vue:708-718`). Somam-se os cortes silenciosos de dados sem páginação (UX-CV360-012 e UX-IMOBIA-013, P2) e o sucesso otimista antes do servidor responder (UX-GYMOPS-012, P2). O contraste é acionável: os três padrões bons citados acima são exatamente os remédios dos buracos — e nenhum é fundação compartilhada hoje.

### 6.6 Remissões

Três frentes transversais têm seção própria e não são repetidas aqui: os becos de **integração e navegação entre superfícies** (deep-links do launcher que ignoram papel — UX-NAV-007 —, login SSO ancorado em `dev.nvit.com.br` e os demais UX-NAV-*) estão em **§8**; a consolidação do **design system** (promoção de `useFocusTrap`, primitiva de card interativo, `UiTabs`, chave única de tema e a galeria + axe no CI — o mapa correção→pacote→apps do corte a11y) está em **§9**; e a malha de **QA/regressão** que permitiria segurar tudo isso (zero axe no CI — UX-QA-005, rebaixado a P2 —, smoke por papel só no gymops — UX-QA-006 —, zero testes de sessão expirada — UX-QA-009 — e o bloco locked "oidc-sessão" que dá falsa garantia — UX-QA-011) está em **§16**.


---

## 7. Diagnóstico detalhado por produto

Cada subseção resume a análise completa do auditor da superfície (inventário comentado, jornadas,
achados, notas). Severidades e notas são as FINAIS (pós-verificação adversarial e calibração).
As "referências positivas" são soluções existentes indicadas para virar padrão de plataforma.


### 7.1 Portal raiz (`/`) — nota ponderada 4,25

**Perfil e papéis.** Landing pública da NovaIT servida na raiz (`portal/frontend/`): frontend estático em nginx, sem framework SPA, com progressive enhancement genuíno — o HTML é completo sem JS e o `portal.js` apenas enriquece (`portal/AGENTS.md:24-29`). Dois papéis com jornadas distintas: visitante anônimo (site corporativo: produtos, portais CMS, capacidades, contato) e operador logado (descoberta dinâmica de apps via API do Console, ferramentas, pulso de deploys), cuja UI só é revelada após resposta 200 (`portal.js:270-276`). Auth real é OIDC na borda (oauth2-proxy/Keycloak); "esconder na home é UX, não segurança" (`portal/README.md:29-32`). Maturidade alta: melhor superfície do scorecard.

**O que já é referência** (candidatas a padrão de plataforma):
- Failsafe de progressive enhancement: gate `js` + timer no-anim de 2,5s, hash sha256 no CSP e teste que trava o hash (`index.html:6-11`, `styles.css:989-996`, `test/static-assets.test.mjs:98-107`).
- Skeleton adiado 350ms — anti-flicker: o 401 rápido do anônimo nunca pisca loading (`portal.js:344-358`).
- 401 ≠ erro transitório, com retomada única no `focus` da janela capturando login feito em outra aba (`portal.js:396-417`).
- Status de saúde não só por cor: estado escrito no `aria-label` do card, citando WCAG 1.4.1 (`platform-shell.js:294-303`).
- Busca com estado vazio completo: query ecoada, contador `aria-live`, "Limpar busca" devolvendo foco ao input (`portal.js:459-497`, `index.html:261-270`).

**Principais problemas (pós-verificação):**
- **UX-PORTAL-001** (P1, CONFIRMADO) — Badges "exige login"/"no ar" reprovam contraste AA no tema claro: 2,80:1 e 2,88:1 em texto ~10,9px (`portal/frontend/assets/styles.css:595-604`, tokens `platform-tokens.css:24-25`). Afeta todos os papéis na J-PORTAL-01; a checagem ao vivo confirmou por getComputedStyle (`live/spot-check.md:7`). Baixa visão perde justamente a affordance que distingue app pública de app com login.
- **UX-PORTAL-002** (P2, CONFIRMADO) — Auditoria a11y registrada (2026-06-13, "axe 0 violações / Accessibility 100") é anterior à migração de paleta e cita tokens que não existem mais (`docs/standards/portal-ux-accessibility-checklist.md:45-48` vs `styles.css:47,32`); o selo obsoleto deixou a regressão do 001 passar sem gate.
- **UX-PORTAL-004** (P2, CONFIRMADO) — Erro transitório da API (Console fora do ar) revela a seção de operador com card de erro e retry ao visitante anônimo (`portal.js:421-429`), expondo vocabulário interno na home corporativa (J-PORTAL-01).
- **UX-PORTAL-005** (P2) — Sessão expirada no refresh de 60s apaga descoberta, link "Plataforma" e rodapé do operador sem nenhum aviso nem CTA de reautenticação (`portal.js:396-403`, J-PORTAL-05).

**Divergências e estados notáveis:**
- Seção `#showcase` PARCIALMENTE IMPLEMENTADA — `hidden` deliberado até existirem capturas reais, decisão documentada (`index.html:630-635`).
- **UX-PORTAL-006** (P3) — comentário do `sitemap.xml:2-4` promete `Disallow` de `/sicat`/`/gymops` no robots.txt que não existe: doc↔implementação divergem dentro do artefato servido.
- **UX-PORTAL-007** (P3) — `404.html:19-20` sem casca/tema persistido; `site.webmanifest` com `theme_color` `#2563eb` da marca antiga (≠ `#4f46e5` atual).
- Achado vivo (spot-check): sonda de saúde do launcher dá falso-negativo para superfícies atrás de SSO — Console/Reqhub/Recorder/Keycloak aparecem "fora" estando no ar (`live/spot-check.md:8`).

**Recomendações-chave:**
- Corrigir o contraste dos badges com tokens de tinta no tema claro (`--warn-ink`/`--ok-ink` ≈ escala 700–800) e revalidar com axe — quick win PP (**UX-PORTAL-001**).
- Re-rodar e datar axe/Lighthouse após qualquer mudança de paleta; atualizar README/checklist para o modelo real de tema (automático + toggle persistido `nvit-theme`) (**UX-PORTAL-002**).
- Só revelar `#cluster-section` no erro se houve resposta autenticada anterior na sessão (flag `wasOperator`); senão, falhar em silêncio como no 401 — quick win PP (**UX-PORTAL-004**).
- No 401 pós-200 da mesma sessão de página, trocar a ocultação por estado leve "Sua sessão expirou — Entrar novamente" com link `/oauth2/start?rd=/` (**UX-PORTAL-005**).
- No pacote compartilhado `packages/platform-shell`: completar a semântica do launcher (setas + `aria-haspopup` + devolução de foco no Esc) ou trocar `role="menu"` por painel comum (`platform-shell.js:169`) (**UX-PORTAL-003**, P2) — e corrigir a sonda de saúde para tratar redirect SSO como "no ar".

**Notas (calibradas):**

| usab | IA/nav | a11y | DS | resp | estados | onboarding | perf |
|---|---|---|---|---|---|---|---|
| 4,5 | 4,5 | 3,5 | 4,5 | 4,5 | 4,0 | 4,0 | 4,5 |


### 7.2 DevOps Console (`/devops`) — nota ponderada 3,63

**Perfil e papéis.** SPA React 18 + Vite servida sob `/devops` (sem strip), com três backends: `console-backend` (leitura do cluster, REST + SSE), `pm-api` (escrita: projetos/tarefas, CMS, usuários) e borda de auth via oauth2-proxy + Keycloak (ForwardAuth do Traefik). Dez seções em dois grupos — "Cluster" (admin) e "Gestão" (admin + members conforme o tipo de projeto atribuído) — mais superfície embed (`?embed=1`) para o Product Studio. Papéis reais: `platform-admins` (isAdmin), `project-members` (isMember) e o caso degradado "sem identidade" (dev-trust fail-open, documentado em backend/src/index.js:1012-1016). É a superfície mais madura da plataforma em disciplina de estados e feedback, porém com **zero testes automatizados** em frontend, backend e pm-api — regressão de UX depende de teste manual. Não verificado ao vivo (atrás de SSO; regra de não passar login — spot-check.md:13).

**O que já é referência**
- Par de middlewares de auth 302 (navegação) × 401 (XHR) com tratamento espelhado no cliente — console/k8s/auth/auth-routes.yaml:29-59 e api.js:19-29.
- Sondagem de sessão no SSE: após 2 erros, GET descartável converte 401 em redirect de login (EventSource não expõe status HTTP) — App.jsx:188-204.
- NewPortalWizard como padrão de "processo longo": etapas nomeadas, log ao vivo, cronômetro de IA, relatório de validação, retry idempotente e cancelamento honrado entre uploads — NewPortalWizard.jsx:161-268.
- Tokens `--p-*` com racional de contraste escrito no próprio código (accent p/ fills, `--p-neon` p/ texto; terminal sempre-escuro corrigido) — styles.css:24-34 e 1264-1273.
- Entrada "Traefik" vira modal informativo com instrução de acesso em vez de link quebrado — App.jsx:44-49, 300-321.
- Componentes de estado usados de forma sistemática (Skeleton 3 variantes, EmptyState com ação, ToastProvider aria-live, ConfirmDialog anti-duplo-submit) e deep-links `#logs?app=` com chip removível.

**Principais problemas (pós-verificação)** — 5 P1, nenhum P0; nenhum achado do Console foi rebaixado, elevado ou recebeu ressalva na verificação.
- **UX-CONSOLE-001** (P1) — Card do kanban não focável nem operável por teclado. `<article draggable onClick>` sem tabindex/role/handler (MetaProjects.jsx:62-72); afeta a jornada principal do member (board de tarefas): sem abrir o drawer, a alternativa acessível ao drag (select de status) fica inalcançável.
- **UX-CONSOLE-002** (P1) — Modais e drawers sem focus trap nem devolução de foco. Modal.jsx:26-29 foca o 1º controle mas Tab escapa; `ItemDrawer`/`SectionDrawer` nem foco inicial gerenciam. Afeta todos os papéis: todo formulário do Console vive em modal/drawer.
- **UX-CONSOLE-003** (P1) — Clique-fora/Esc descartam edições não salvas sem confirmação no modo Avançado do CMS (ContentEditor.jsx:53 e 31-34); editor de portal perde uma seção inteira com um clique acidental.
- **UX-CONSOLE-004** (P1) — Reordenar seções do portal só por arrastar, sem caminho de teclado (ContentEditor.jsx:346-354; dica "Arraste as seções para reordenar", linha 372) — contraste com o AutoForm, que tem ↑/↓ (AutoForm.jsx:111-112).
- **UX-CONSOLE-005** (P1) — README descreve outra ferramenta: só o painel read-only e um ConfigMap `console-config` que a UI não usa (README.md:15-28 vs. 10 seções e `QUICK_LINKS` hardcoded em App.jsx:29-49). Operador guiado pelo README desconhece ~60% do Console.
- **UX-CONSOLE-007** (P2) — Sessão expirada = `window.location.reload()` (api.js:25-29): destrutivo em drawer com edição, wizard em execução ou instrução de IA digitada.
- **UX-CONSOLE-009** (P2) — Cancelar o wizard após a etapa "project" deixa o portal já criado sem avisar (NewPortalWizard.jsx:181-189, 263-268) — portal pendente órfão na lista.
- **UX-CONSOLE-010** (P2) — Overview/Health sem "Tentar de novo" no estado de erro (Overview.jsx:91-96; Health.jsx:149-154); fetch só no mount, operador recarrega a página — Apps/Publicações já têm o botão.

**Divergências e estados notáveis**
- **UX-CONSOLE-005** é a divergência docs↔código mais severa da superfície (P1, acima); o AGENTS.md está correto quanto ao pm-api, aumentando a dissonância interna da documentação.
- **UX-CONSOLE-006** (P2) — deep-link por hash pós-carga ignora o papel: member que segue `#overview` fica com TopBar preenchida e `main` vazio (App.jsx:140-142, 162-167) — beco sem saída sem mensagem.
- **UX-CONSOLE-008** (P2) — pm-api fora degrada member para a casca de admin com "Erro 403 (Forbidden)" cru em cada aba (App.jsx:92-104): fail-soft para admin, fail-ruidoso para member.
- Spot-check ao vivo registrou (achado do launcher, não do Console): a sonda de saúde do `<platform-shell>` marca o Console como "fora" quando `/devops` responde redirect SSO — falso-negativo de disponibilidade (spot-check.md:8).

**Recomendações-chave**
1. Pacote de a11y estrutural em uma passada: card do kanban como `<button>`/role=button com Enter/Espaço (**UX-CONSOLE-001**), focus trap + devolução de foco num utilitário único reusado por Modal/ItemDrawer/SectionDrawer (**UX-CONSOLE-002**) e botões subir/descer por seção na lista do modo Avançado (**UX-CONSOLE-004**).
2. Dirty-check com ConfirmDialog antes de fechar drawers com edição pendente (**UX-CONSOLE-003**) e antes do reload por sessão expirada (**UX-CONSOLE-007**) — mesmo mecanismo, dois pontos de perda de trabalho.
3. No cancelamento do wizard após a etapa "project", avisar que o portal já existe e oferecer excluir/manter o rascunho (**UX-CONSOLE-009**).
4. Reescrever o README do Console cobrindo as 10 seções, pm-api e a superfície embed, removendo a referência ao ConfigMap não usado (**UX-CONSOLE-005**).
5. Botão "Tentar de novo" nos banners de erro de Overview/Health, reusando o padrão "Atualizar" de Apps/Publicações (**UX-CONSOLE-010**), e corrigir o redirecionamento de seção por papel também no fluxo pós-carga (**UX-CONSOLE-006**).

**Notas (calibradas):**

| usab | IA/nav | a11y | DS | resp | estados | onboarding | perf |
|---|---|---|---|---|---|---|---|
| 3,5 | 4,0 | 2,5 | 4,0 | 3,5 | 4,0 | 4,0 | 4,0 |


### 7.3 SICAT (`/sicat`) — nota ponderada 3,70

**Perfil e papéis.** SPA Vue 3 + Vuetify para emissão e gestão de MTR/CDF junto à CETESB, com design system próprio (`Sicat*`, 21 componentes) sobre tokens gerados de `packages/design-tokens` (light/dark completos). É a superfície mais madura de UX do monorepo: login em 2 etapas (SICAT + conta CETESB) com SSO Keycloak/PKCE, guards com revalidação server-side (`router.js:426-475`) e navegação declarativa única filtrada por permissão e persona. Papéis reais: **generator / carrier / receiver** (tipo da conta CETESB, `usePersona.js:12-16`) e **admin global/SRE** (`auth.js:520`, nunca passa pela etapa CETESB). Nenhum P0; os problemas restantes são de acabamento e completude, não de fundação.

**O que já é referência** (candidatas a padrão de plataforma)
- Etapas de acesso explicadas para leigo — `SicatAuthSteps.vue:12-15` + "primeiro de dois acessos" (`LoginView.vue:196-199`): elimina a confusão do duplo login app + órgão.
- Desabilitar COM explicação — restrição como subtítulo do item desabilitado (`ManifestsView.vue:2054-2057`) e dica do que falta para liberar o botão (`receiveSubmitHint`, 258-269).
- Empty state que abre a caixa-preta dos filtros — `activeFiltersSummary` (`ManifestsView.vue:300-323`) impresso no vazio com CTAs "Ver últimos 30 dias"/"Limpar filtros" (1973-1983).
- Persona de ponta a ponta — `usePersona.js` + rótulos por perfil na navegação/hub: o destinador lê "Receber / dar baixa", o gerador "Criar manifesto", com fail-open consciente quando o tipo não resolve (`navigation.js:222-226`).
- Transparência de dados em cache — badge "Dados em cache" + modal com status HTTP remoto e horário do fallback (`ManifestsView.vue:1932-1941, 2302-2319`).
- Prevenção de erro comprovada no fluxo crítico — justificativa obrigatória validada ANTES do job no recebimento, confirmação explícita pré-envio à CETESB (`ManifestsView.vue:1411-1420`) e guarda de reentrância anti-duplo-submit (`ManifestCreateForm.vue:948-954`).

**Principais problemas (pós-verificação)** — sem P0; 3 P1, todos CONFIRMADOS:
- **UX-SICAT-001** (P1, CONFIRMADO, quick win) — CTAs do dashboard navegam com `?focus=` que nenhuma tela consome (`DashboardView.vue:121-139, 166-168`; `ManifestsView.vue:1691-1696` não lê `focus`). Gerador/receiver na jornada "acompanhar e corrigir": o card "N MTR(s) com falha" → "Resolver" cai na lista sem filtro — o operador pode concluir que a falha "sumiu" ou agir no item errado.
- **UX-SICAT-002** (P1, CONFIRMADO) — "Resumo de hoje" conta status sobre a 1ª página de 10 manifestos (`DashboardView.vue:184-191, 67-73`; backend `api-routes.ts:415-427` não devolve contagem por status). Painel de aterrissagem do operador: "Com problema: 0" pode esconder falhas na página 2 sem qualquer indício.
- **UX-SICAT-003** (P1, CONFIRMADO) — Administração de acessos é somente leitura com API de escrita completa (grant/revoke/reset em `access-admin-service.ts:639-828`; `api.js:1102-1119` só declara os 5 GETs). Jornada do admin "conceder perfil" não se completa no produto — exige curl/DBA e anula a trilha de auditoria pensada para a UI. PARCIALMENTE IMPLEMENTADO.
- **UX-SICAT-005** (P2, CONFIRMADO, quick win) — Jargão interno de dev no fluxo principal de emissão: chips "Em elaboração" (warning) e "Wizard checkout-inspired" (`ManifestCreateView.vue:79-80`) + texto "checkout wizard do Vuexy... payload" (`ManifestCreateForm.vue:53-64`) renderizados para o operador que emite documento fiscal-ambiental.
- **UX-SICAT-008** (P2) — Dois sistemas de feedback sem regra: `useNotification`/toasts em 13 superfícies vs. nove `v-alert` inline em `ManifestsView.vue:1895-1903`; na lista longa o feedback nasce fora do viewport. Diverge do padrão declarado em `apps/sicat/CLAUDE.md` (item 8).
- **UX-SICAT-004** (P2) — Aviso de sessão a expirar construído no store (`auth.js:524-556`) e nunca plugado na UI: a expiração vira redirect abrupto via polling de 15s (`App.vue:167-169`) e o wizard de MTR em curso é perdido. PARCIALMENTE IMPLEMENTADO.

**Divergências e estados notáveis**
- PARCIALMENTE IMPLEMENTADO: `/admin/acessos` (UX-SICAT-003, vitrine só-leitura) e aviso de expiração de sessão (UX-SICAT-004, store pronto sem consumidor).
- DIVERGENTE docs↔código: `apps/sicat/CLAUDE.md` declara feedback por `useNotification` como padrão, mas as telas principais de manifesto usam `v-alert` inline (UX-SICAT-008).
- Gating não aplicado: `/dev/components` declara `audience: 'system'` sem `requiresAdminAccess` (`router.js:355-364`) — qualquer autenticado abre o playground do DS (UX-SICAT-014, P3).
- Tela fora do menu (intencional/documentado): `/sessao` acessível só pelo user menu.
- SICAT ficou fora do spot-check ao vivo (time-box da fase, `spot-check.md:33`); análise 100% ancorada no repo, 5 achados verificados, 0 mortos.

**Recomendações-chave**
1. Fechar UX-SICAT-001 mapeando `focus` → chips de situação já existentes no `onMounted` de ManifestsView (`failed`→`{status:'failed'}` etc.) — esforço P, quick win.
2. Expor contagem por status no `/v1/dashboard/overview` (ou usar `totalItems` por chip) para corrigir o "Resumo de hoje" (UX-SICAT-002) — número enganoso no painel de entrada.
3. Construir as mutações de `/admin/acessos` sobre a API já auditada (UX-SICAT-003) — completa a jornada do admin dentro da trilha de auditoria.
4. Trocar os textos default do wizard e o chip "Em elaboração" por linguagem leiga (UX-SICAT-005, PP) e consolidar o header duplicado view+wizard no mesmo passe.
5. Definir a regra toast × alert inline e migrar ManifestsView/Dashboard para `useNotification` (UX-SICAT-008); plugar `sessionExpiryLabel` no `SicatUserMenu` + banner nos 5 min finais (UX-SICAT-004).

**Notas (calibradas):**

| usab | IA/nav | a11y | DS | resp | estados | onboarding | perf |
|---|---|---|---|---|---|---|---|
| 4,0 | 3,5 | 3,5 | 4,0 | 4,0 | 3,5 | 3,5 | 3,0 |


### 7.4 GymOps (`/gymops`) — nota ponderada 3,28

**Perfil e papéis.** Gestão operacional multiunidade em Next.js App Router com três route groups — `(auth)`, `(app)` e `(admin)` — mais o wizard `/setup`; API Fastify + Prisma. Tem 6 papéis reais no schema (`owner, org_manager, unit_manager, area_leader, executor, viewer` — `packages/db/prisma/schema.prisma:12-19`) mais a flag `isPlatformAdmin`, com landings distintas por papel (`/dashboard`, `/units/:id`, `/me`). É o app mais maduro da plataforma em UX (onboarding com 15+ tutoriais por papel, sistema de estados acima da média), mas os problemas graves estão nas bordas: OAuth, teclado, drawer central e push. Auth: login e-mail/senha + Google/SSO com refresh silencioso (`api.ts:55-57`); os "fatos conhecidos" BUG-005/006/007 foram verificados como corrigidos no código.

**O que já é referência**
- Padrão "erro sem descartar dados": banner "exibindo os últimos dados carregados" quando há cache + erro (`dashboard/page.tsx:166-174`, `me/page.tsx:153-161`) — candidato a padrão de plataforma.
- IA com confirmação humana de verdade: card "A IA quer executar / Nada foi salvo ainda" com prévia campo a campo e execução só no clique (`AiChatWidget.tsx:205-237`); mesmo padrão no setup-draft (`setup/page.tsx:51-81`).
- Central de Ajuda + tutoriais filtrados por papel, com progresso persistido e navegação automática até a rota do tutorial (`tutorial-help-center.tsx:48-84`).
- Erros de login acionáveis por causa (401/429/5xx/rede — `login/page.tsx:72-84`) e wizard com saída "Continuar manualmente" quando a IA cai (`setup/page.tsx:266-277`).
- Skip-link + `main` focável + títulos de aba por rota (`(app)/layout.tsx:16-41,70-76,100`) e `prefers-reduced-motion` global (`globals.css:78`).

**Principais problemas (pós-verificação)**
- **UX-GYMOPS-001** (P0) — Login via Google/SSO nunca resolve organizationId/papel: o callback só grava usuário+token e faz `router.push('/dashboard')` fixo (`auth/callback/page.tsx:27-34`); `setOrganizationId` só existe no login por e-mail (`login/page.tsx:65-67`). Todo papel que entra por OAuth no primeiro acesso vê app vazio, sem erro — produto inoperável.
- **UX-GYMOPS-002** (P0) — Abrir atividade é impossível por teclado (WCAG 2.1.1 A): cards são `div onClick` (`ActivityCard.tsx:19-31`) e linhas `tr onClick` (`activities/page.tsx:549-551`); afeta todos os papéis no fluxo principal (`/me`, `/units/:id`, Central).
- **UX-GYMOPS-003** (P1) — Sidebar mostra "Painel Geral"/"Central" a unit_manager/area_leader (`sidebar.tsx:25`), mas `/dashboard` os expulsa em silêncio para `/me` (`dashboard/page.tsx:107-111`) — item de menu que "não funciona" mina a confiança da jornada de gestão.
- **UX-GYMOPS-004** (P1) — ActivityDrawer e modais artesanais sem `role="dialog"`, focus trap ou Esc (`ActivityDrawer.tsx:197-202`, RecurrenceModal 647-649, ShareModal 802-804), enquanto o Radix Dialog acessível já existe em `components/ui/dialog.tsx` — leitores de tela não anunciam a superfície central do produto.
- **UX-GYMOPS-005** (P1) — Ativar push trava para sempre: `settings/page.tsx:107` espera `navigator.serviceWorker.ready` sem nenhum SW registrado (`public/` só tem `icons/` e `manifest.json`); botão fica em "requesting" sem timeout para qualquer papel.
- **UX-GYMOPS-006** (P1) — Convite valida senha ≥6 no cliente e placeholder diz 6 (`invite/[token]/page.tsx:54,146`), mas a API exige ≥8 (`apps/api/src/routes/invitations/index.ts:137`) — o convidado recebe erro genérico no seu primeiro contato com o produto.
- **UX-GYMOPS-007** (P1) — Sessão expirada sem tratamento: refresh falho vira "Verifique sua conexão" com retry inútil em todas as telas (`api.ts:55-57`, `query-error-state.tsx:21-22`), nada leva ao login. *Ressalva da verificação:* o AuthBootstrap desloga quando o refresh falha no boot — reload recupera; o beco é só mid-sessão.
- **UX-GYMOPS-008** (P2) — Settings mostra "Integrações/Importações" a todos os papéis contra a `rbac-matrix.md:166` (`settings/layout.tsx:34-40`); páginas admin sem gate client viram 403 mascarado de "erro de conexão" — beco sem saída para executor/viewer.
- **UX-GYMOPS-009** (P2) — Dropdown "Views salvas" abre só por hover CSS (`activities/page.tsx:363`) — inacessível por teclado e por toque — e a lixeira exclui a view em 1 clique sem confirmação (367-369).
- **UX-GYMOPS-015** (P2) — Dark mode inatingível: tokens `.dark` completos (`globals.css:43-69`) e `darkMode: ['class']`, mas nenhum código adiciona a classe (sem toggle/next-themes/sync SO); cores light-only hardcoded (`team/page.tsx:28-35`, dashboard 265-267).

**Divergências e estados notáveis**
- OBSOLETO: `rbac-matrix.md:9-14` ainda lista BUG-005/006/007 como divergências abertas — verificados como corrigidos (`auth-context.ts` em uso; `store/auth.ts:82-85`; `apps/api/src/lib/rbac.ts:163-181`) (parte de **UX-GYMOPS-019**, P2).
- DIVERGENTE: `navigation-map.md:150-165` contradiz o código nas duas direções — promete `/dashboard` e "Equipe da unidade"/Recorrências a unit_manager (código nega) e nega Central a area_leader (código mostra) (**UX-GYMOPS-019**).
- PARCIAL: PWA incompleto — `manifest.json:7` com `start_url: "/"` abriria o portal, não `/gymops`; sem SW não há offline (**UX-GYMOPS-016**, P2). Smoke spec do executor visita `/my-tasks`, rota inexistente — o assert passa num 404 (`e2e/smoke/executor.smoke.spec.ts:34-37`).
- Não verificado ao vivo: fora do time-box do spot-check; análise 100% ancorada no repo (`live/spot-check.md`).

**Recomendações-chave**
- Resolver contexto (organizationId/papel/unidade) no callback OAuth e rotear pela mesma lógica de landing do login por e-mail (**UX-GYMOPS-001**).
- Tornar card e linha de atividade uma primitiva acessível (`role`, `tabIndex`, Enter/Espaço) e migrar ActivityDrawer/RecurrenceModal/ShareModal para o Radix Dialog já existente no repo (**UX-GYMOPS-002**, **UX-GYMOPS-004**).
- Registrar service worker (destravando push e corrigindo `start_url` para `/gymops`) ou ocultar o canal "Push (navegador)" até existir SW (**UX-GYMOPS-005**, **UX-GYMOPS-016**).
- Tratar 401 mid-sessão globalmente (QueryCache `onError` → logout/redirect com mensagem "sessão expirada") e distinguir 403 com mensagem de permissão (**UX-GYMOPS-007**, **UX-GYMOPS-008**).
- Alinhar sidebar/settings-nav ao RBAC real por papel e atualizar `navigation-map.md`/`rbac-matrix.md` para o estado do código (**UX-GYMOPS-003**, **UX-GYMOPS-008**, **UX-GYMOPS-019**); alinhar a senha do convite para ≥8 (**UX-GYMOPS-006**).

**Notas (calibradas):**

| usab | IA/nav | a11y | DS | resp | estados | onboarding | perf |
|---|---|---|---|---|---|---|---|
| 3,5 | 3,0 | 2,5 | 3,5 | 4,0 | 3,5 | 3,0 | 3,5 |


### 7.5 RM Ambiental (`/rmambiental`) — nota ponderada 3,67

**Perfil e papéis.** Site institucional público (SPA Vite/React estática, sem backend nem auth — correto por design) com 3 rotas (`src/App.tsx:41-44`), renderizado por blocos que consomem a árvore do CMS (`/devops/api/cms/public/rmambiental`, `src/lib/content.ts:8-15`) com fallback embutido "default-first". Papel único: visitante anônimo (jornada crítica J-RMAMB-01: descobrir → confiar → contatar via WhatsApp/mailto); há ainda o papel técnico de editor via Console (`?cmsEdit=1` em iframe, `src/lib/cmsEdit.tsx:32-42`), estruturalmente inerte ao público. Maturidade alta para o tier leve, porém com zero testes (`package.json:7-11`).

**O que já é referência**
- Fallback default-first do CMS: inicia com `contentDefault` e troca pela árvore live sem flash — falha de CMS invisível ao visitante (`SiteContext.tsx:14-33`, timeout de 4s em `content.ts:12-15`). Candidato a padrão para os demais portais.
- `prefers-reduced-motion` em profundidade: CSS global (`index.css:77-86`) + `useReducedMotion` em Reveal/Counter (`ui.tsx:9-13,46-49`) + `motion-safe:animate-ping` no FAB — melhor cobertura de motion do tier.
- Anti-flash de tema com script inline pré-render + `color-scheme` (`index.html:7-14`).
- Gate do modo edição: iframe + query + latch + origin-check no postMessage (`cmsEdit.tsx:32-42,77-79`).
- `aria-current` calculado por pathname+hash no header (`Header.tsx:22-29`) — resolve o caso âncora-vs-página.

**Principais problemas (pós-verificação)** — 3 P1, 0 P0; todos CONFIRMADOS sem ressalvas.
- **UX-RMAMB-001** (P1, wcag-1.3.1) — Labels do formulário de contato sem `htmlFor`/`id` (`ContactSection.tsx:58-59`); visitante com leitor de tela, J-RMAMB-01: 6 campos sem nome acessível no fluxo principal de conversão. Quick win (PP).
- **UX-RMAMB-002** (P1, divergencia-docs) — CLAUDE.md/docs/status.md descrevem arquivos e placeholders que não existem mais (`apps/rmambiental/CLAUDE.md:56-58`); afeta o operador, que pode "corrigir" conteúdo já real (galeria e contato reais).
- **UX-RMAMB-003** (P1, heuristica-consistência) — Números de autoridade ilustrativos ("+250 Projetos" etc.) publicados com nota minúscula de baixo contraste (`content.default.ts:69-74`); visitante, J-RMAMB-01: mina exatamente a etapa "confiar" da conversão; depende de produto fornecer os indicadores oficiais.
- **UX-RMAMB-006** (P2) — Botão "Enviar por e-mail" bypassa a validação `required` e `window.open` do WhatsApp não trata popup bloqueado (`ContactSection.tsx:35-37`): leads incompletos ou perdidos em silêncio na ação primária.
- **UX-RMAMB-007** (P2, wcag-2.4.1) — Sem skip-link; ~10 tab-stops repetidos antes do conteúdo em cada página (`App.tsx:37-45`).
- **UX-RMAMB-005** (P2, wcag-2.4.3) — Lightbox da galeria sem gerenciamento de foco (sem trap, sem mover/devolver, `SectionRenderer.tsx:290-295`); teclado se perde na principal prova visual do trabalho (J-RMAMB-02).

**Divergências e estados notáveis**
- **UX-RMAMB-002** é o próprio item OBSOLETO/DIVERGENTE: `AuthoritySection.tsx` não existe (stats viraram bloco do `SectionRenderer`), `projects.ts` é galeria real de 24 fotos com alt-text, `site.ts` tem contato real — único "AJUSTAR" restante no src é o link de privacidade (`Footer.tsx:101`).
- PARCIALMENTE IMPLEMENTADO: UX-RMAMB-004 (link "Política de Privacidade" `href="#"` morto, `Footer.tsx:101-104`) e UX-RMAMB-005 (lightbox tem Esc/setas mas não foco).
- Curinga `*` renderiza a Home mantendo a URL inválida, sem 404 (UX-RMAMB-008, P3, `App.tsx:44`).

**Recomendações-chave**
1. Quick wins de a11y no fluxo de conversão: `htmlFor`/`id` nos 6 campos (UX-RMAMB-001) + skip-link para `<main>` (UX-RMAMB-007) — ambos esforço PP.
2. Substituir os stats ilustrativos por números reais via CMS (sem deploy) ou ocultar o bloco até tê-los; nota, se mantida, com contraste AA (UX-RMAMB-003).
3. Atualizar CLAUDE.md (armadilhas 3/4) e docs/status.md para o código atual (UX-RMAMB-002) — quick win que devolve confiabilidade aos docs canônicos.
4. `form.reportValidity()` antes do mailto e fallback com link `wa.me` quando o popup for bloqueado (UX-RMAMB-006).
5. Resolver o par LGPD: publicar a Política de Privacidade ou remover o link morto (UX-RMAMB-004), idealmente junto com o self-host das fontes (UX-RMAMB-009).

**Notas (calibradas):**

| usab | IA/nav | a11y | DS | resp | estados | onboarding | perf |
|---|---|---|---|---|---|---|---|
| 3,5 | 4,0 | 3,0 | 4,5 | 4,0 | 3,0 | N/A | 3,5 |


### 7.6 BESC (`/besc`) — nota ponderada 3,45

**Perfil e papéis.** Híbrido incomum na plataforma: portal público de conhecimento (biblioteca, jurisprudência facetada com 100 decisões, glossário, roadmap) + marketplace de títulos tokenizados em modo demonstração + back-office de gestão (casos, títulos, usuários/RBAC, financeiro, gate regulatório) + portal de auditoria read-only para advogados/juízes. React 18 + Vite com CSS próprio (fora dos tokens da plataforma, sem dark mode); 29 rotas (App.jsx:301-330). RBAC 100% em dados no backend (deny por padrão, fail-closed 503), papéis seed `public/investor/lawyer/judge/manager/admin` (rbac.js:38-54); guard client-side `RequireRole` tratado explicitamente como "UX apenas — a autoridade é a API" (auth.jsx:6). Maturidade alta nas jornadas de gestor e investidor; zero testes de frontend e sem AGENTS.md/README no app.

**O que já é referência**
- **PendingGate + permissões zeradas no backend** (App.jsx:119-142 + rbac.js:192-199): conta pendente vê o estado explicado com re-checagem em um clique, em vez de menus que dariam 403 — padrão a copiar pela plataforma.
- **Aceite de termos inline no 409** (TituloDossie.jsx:207-240 + api.js:174-188): o erro carrega `termsId`, a UI exibe o documento, checkbox e "Aceitar e contratar" — sem beco.
- **Efeito-cascata anunciado antes da transição jurídica** (GestaoTituloDetail.jsx:32-38,539): transição exige justificativa e mostra o impacto nos contratos antes de confirmar — referência de prevenção de erro.
- **useMenuAutoClose** (App.jsx:76-108): menus `<details>` fecham em navegação/clique-fora/Esc devolvendo o foco ao summary — a11y de dropdown sem lib.
- **Watermark de demonstração fail-safe** (investor.jsx:9-19): falha de rede assume demo; confirmado ao vivo em `/besc/marketplace` ("Ambiente de demonstração" visível), assim como o skip-link primeiro na ordem de foco (spot-check).
- **Busca facetada da jurisprudência** com multi-seleção, contagens contextuais e estado 100% na URL — a melhor do monorepo.

**Principais problemas (pós-verificação)**
- **UX-BESC-001** (P1, PARCIALMENTE IMPLEMENTADO) — Convite de auditores sem tela de resgate: o backend expõe `POST /auth/invitations/:token/accept` (apps/besc/api/src/foundation/auth.js:227), mas nenhuma rota/formulário do frontend consome o token (GestaoUsuarios.jsx:224-235 manda "repassar manualmente"). Advogado/juiz convidado recebe um token opaco sem onde usá-lo — o painel de convites é uma promessa vazia; o workaround real é auto-cadastro + concessão manual.
- **UX-BESC-002** (P1) — `titles:read` como proxy de "gestão": nav e rota `/gestao/titulos` exigem só titles:read (App.jsx:220,266,317-318) e o seed dá titles:read a lawyer/judge (rbac.js:41-42) → auditores entram na área de GESTÃO com "Novo título", emissão e transição jurídica renderizados habilitados, falhando só com 403 cru — contradiz a promessa do portal de auditoria ("não pode alterar nada", Auditoria.jsx:38).
- **UX-BESC-003** (P1, OBSOLETO/DIVERGENTE) — Ajuda pública descreve o sistema pré-evolução: `/ajuda` afirma "Não tem login, pagamento nem cálculo oficial de valores" (Ajuda.jsx:78) e ignora marketplace, papéis, carteira, auditoria e gate — todo usuário novo constrói um modelo mental que a topbar ("Entrar", "Investir") contradiz na hora.
- **UX-BESC-005** (P2, quick win) — Tabelas de fluxo principal sem contêiner overflow-x (Dashboard.jsx:74-86, CaseDetail.jsx:637, GestaoUsuarios.jsx:322): em 375px a tabela de casos — fluxo principal do Gestor — estoura o card e força scroll horizontal da página.
- **UX-BESC-008** (P2) — Anti-duplo-submit irregular: "Salvar processo" (CaseDetail.jsx:311), perícia (553), caução (626) e Aprovar/Ativar (GestaoUsuarios.jsx:159-165) disparam await sem desabilitar o botão — duplo clique cria processo duplicado.
- **UX-BESC-010** (P2, quick win) — Dossiê público escondido do anônimo: `GET .../dossier` é público por desenho (api.js:167) e a rota não tem guard (App.jsx:311), mas o catálogo só oferece "Entrar para investir" (Marketplace.jsx:78-86) — força login para ver conteúdo já público, contra o papel do portal como funil de aquisição.

**Divergências e estados notáveis**
- **UX-BESC-003** — OBSOLETO/DIVERGENTE: a Ajuda documenta a Fase 0 (ver acima).
- **UX-BESC-004** (P2) — OBSOLETO/DIVERGENTE: Aluguéis diz "aluguéis criados durante esta sessão", mas o mount carrega a base completa via `api.finance.leases()` (GestaoAlugueis.jsx:40); o empty state errado ainda pisca no loading.
- **UX-BESC-001** — PARCIALMENTE IMPLEMENTADO: endpoint de aceite de convite existe só no backend.
- **UX-BESC-012** (P2) — NÃO INICIADO: login local sem recuperação de senha nem orientação de fallback (Entrar.jsx:109-117; sem endpoint de reset em auth.js).

**Recomendações-chave**
1. Criar a rota `/convite/:token` consumindo `POST /auth/invitations/:token/accept` e corrigir o texto do painel de convites (**UX-BESC-001**) — desbloqueia a jornada projetada do auditor.
2. Separar permissão de leitura e de gestão de títulos (ex.: `titles:manage` no guard/nav de `/gestao/titulos`) e trocar o proxy `hasPerm('titles:read')` do MarketplaceBridge (**UX-BESC-002**, com **UX-BESC-011** alinhando nav×guard×breadcrumbs).
3. Reescrever `/ajuda` com seções por papel (criar conta e liberação, investir e carteira, auditoria, gestão) e o modo demonstração/gate (**UX-BESC-003**); no mesmo passe, corrigir a copy de Aluguéis (**UX-BESC-004**).
4. Rodada de quick wins de a11y/responsividade: overflow container nas tabelas nuas (**UX-BESC-005**), `role=tab`/`aria-selected` nos 3 tab-rails (**UX-BESC-006**), aria-label nas buscas e selects placeholder-only (**UX-BESC-007**).
5. Expor o dossiê público no catálogo para o anônimo (**UX-BESC-010**) e padronizar busy/disabled nas mutações do CaseDetail e ações de usuário (**UX-BESC-008**).

**Notas (calibradas):**

| usab | IA/nav | a11y | DS | resp | estados | onboarding | perf |
|---|---|---|---|---|---|---|---|
| 3,5 | 4,0 | 3,5 | 3,5 | 3,0 | 3,5 | 3,0 | 3,0 |


### 7.7 ZapBridge (`/zapbridge`) — nota ponderada 3,10

**Perfil e papéis.** Cliente de WhatsApp pessoal (Baileys) com dois frontends no repo: o deploy atual é `web/` (Vite + React 18 + Tailwind + Zustand + socket.io-client, SPA sob `/zapbridge` servida por nginx) e o legado é `app/` (Expo/react-native-web, aposentado do deploy mas ainda presente, com telas que não migraram). Papel único — usuário final dono da conta (docs/MVP-FUNCIONAL.md §3: sem multiusuário nem hierarquia de papéis); auth por JWT em toda request (`client.ts:45-52`) e no handshake do socket (`socket.ts:11-15`), com guard client-side de rotas (`App.tsx:51-71`). Núcleo de conversa maduro; a IA e a organização de conversas estão pela metade na web. Não verificado ao vivo (fora do time-box do spot-check) — análise 100% ancorada no repo.

**O que já é referência**
- Reconciliação otimista anti-duplicação no envio (eco em tempo real vs POST, retry sem reenvio real) — `web/src/hooks/useChatMessages.ts:72-117` — padrão digno de plataforma.
- Anúncio acessível de falha de envio: live region com contador monotônico + reset do texto para forçar mutação real no DOM — `web/src/components/ChatPanel.tsx:58-67,138-140`.
- Foco visível global + `prefers-reduced-motion` — `web/src/index.css:55-69`.
- SW kill-switch da migração PWA→SPA (desinstala o SW do Expo, limpa caches, recarrega clients) — `web/public/sw.js:1-32`.
- Gate de consentimento de IA com disclosure honesta ("A IA lê suas conversas para responder (enviado à Anthropic/OpenAI)") — `web/src/pages/AssistantPage.tsx:105-115`.
- Jornada de conexão (J-ZAP-02): QR com auto-refresh, pairing code com cópia confirmada, passos numerados, redirect automático — `ConnectPage.tsx:30-32,130,160`.

**Principais problemas (pós-verificação)** — 6 P1, 0 P0; 26 achados no total, 11 verificados, taxa de morte 0%.
- **UX-ZAP-001** (P1, wcag-2.1.1) — Ações de mensagem só no hover: `MessageBubble.tsx:104-111`; usuário de teclado não consegue responder/reagir/copiar/encaminhar (J-ZAP-03); violação WCAG nível A no fluxo principal do produto.
- **UX-ZAP-002** (P1, estados) — Sem interceptor de 401: `client.ts:42-52`; com token expirado tudo falha em silêncio, sem redirect nem aviso (J-ZAP-05); confiança "inferido".
- **UX-ZAP-003** (P1, estados) — Erro indistinguível de vazio: `chats.store.ts:41-43` (campo `error` nunca lido) + catch silencioso do histórico; falha de API vira "Nenhuma conversa/mensagem" sem retry (J-ZAP-03).
- **UX-ZAP-004** (P1, prevenção; quick win) — "Desconectar aparelho" sem confirmação: `SettingsPage.tsx:62`; um clique encerra a sessão e, por RN15, expurga embeddings/memória/KB de IA (J-ZAP-05) — perda irreversível sem aviso.
- **UX-ZAP-006** (P1, ia) — Impossível revogar consentimento ou apagar dados de IA na web: `AssistantPage.tsx:109-111` promete "Você pode desativar quando quiser", mas `aiApi.revoke`/`purge` nunca são chamados (J-ZAP-04); RF060 descumprido, risco de conformidade percebida (LGPD).
- **UX-ZAP-007** (P1, divergencia-docs, OBSOLETO/DIVERGENTE) — `devops.yaml:23-25` (`context: app`), CLAUDE.md e README apontam o frontend legado Expo como build do deploy; operador que segue os docs regride o produto inteiro (risco real em rebuild/disaster recovery).
- **UX-ZAP-018** (P2, wcag-4.1.2, CONFIRMADO-COM-RESSALVA) — Assistente: botão "➤" sem aria-label e resposta em streaming sem aria-live (`AssistantPage.tsx:148-151`); a verificação atenuou o item do textarea (placeholder vale como nome de fallback pela spec accname — má prática, não falha 4.1.2 estrita), P2 mantido.
- **UX-ZAP-012** (P2, controle) — Parar a gravação de áudio sempre envia (sem cancelar) e microfone negado falha em silêncio: `MessageInput.tsx:93-99`; envio indesejado a um contato real é socialmente irreversível.
- **UX-ZAP-010** (P2, navegação) — "Arquivadas" mostra a contagem real mas o clique leva a "Em breve": `ChatListPanel.tsx:115-118`; conteúdo do usuário ficou órfão (regressão vs ArchivedChatsScreen do legado).

**Divergências e estados notáveis**
- **UX-ZAP-005** foi consolidado como DUPLICADO do transversal **UX-AI-001** (fluxo proposta→confirmação da IA sem UI: backend gera `proposals` com token HMAC e só executa em `POST /ai/confirm`, mas `AssistantPage.tsx:76-83` ignora o campo — pedir "envie X para Y" termina em beco).
- Legado `app/` com telas nunca migradas (Groups, KnowledgeBase, AutoReplyConfig, ArchivedChats, ForwardSheet, AiConsentScreen com revoke, tema claro/escuro) — funcionalidade PARCIALMENTE IMPLEMENTADA do ponto de vista do produto (API existe, superfície web não).
- 14 dos 20 endpoints tipados de IA são órfãos na web (`revoke`, `purge`, `search`, `confirm`, `triage`, `kb*` etc. — `web/src/api/ai.ts`, grep sem chamadas).
- Navegação decorativa: 3 das 5 abas caem em "Em breve" (**UX-ZAP-008**, `WhatsAppTabBar.tsx:32`) e o chip Favoritos é filtro morto (**UX-ZAP-009**, `ChatListPanel.tsx:25`).
- Tema escuro fixo diverge do MVP-FUNCIONAL.md:135, que prevê seletor sistema/claro/escuro (**UX-ZAP-026**, `index.html:7`); resíduo de PWA: `nginx.conf:29-33` serve `manifest.webmanifest` inexistente no build.

**Recomendações-chave**
1. Corrigir imediatamente o drift de deploy (**UX-ZAP-007**, esforço P): `devops.yaml` com `context: web`, CLAUDE.md/README descrevendo o Vite/React como deploy e `app/` como legado — risco operacional, não só de UX.
2. Fechar o ciclo de confiança da IA (**UX-ZAP-006** + confirmação de propostas via **UX-AI-001**): seção "IA" em Configurações com toggle de consentimento (`aiApi.revoke/accept`) e botão "Apagar dados de IA" (`aiApi.purge`) com confirmação, como o legado já tinha.
3. Tornar as ações de mensagem alcançáveis sem mouse (**UX-ZAP-001**): `focus-within` + botão de overflow sempre focável por bolha e long-press no touch, mantendo o hover como atalho.
4. Tratar falhas de forma visível (**UX-ZAP-002/003**, + quick win **UX-ZAP-013**): interceptor de 401 → `/login` com "Sessão expirada"; estados de erro com "Tentar novamente" distintos dos empties na lista e no histórico.
5. Confirmar ações destrutivas e dar saída ao usuário (**UX-ZAP-004** quick win; **UX-ZAP-012**): diálogo de desconexão citando o expurgo RN15; botão de descartar gravação separado do enviar + aviso de microfone negado.

**Notas (calibradas):**

| usab | IA/nav | a11y | DS | resp | estados | onboarding | perf |
|---|---|---|---|---|---|---|---|
| 3,0 | 3,0 | 2,5 | 3,5 | 4,0 | 3,0 | 3,0 | 3,0 |


### 7.8 Reqhub (`/reqs`) — nota ponderada 4,00

**Perfil e papéis.** Workbench + Product Studio da base de requisitos (`specs/`): frontend estático sob nginx com CSP estrita (`script-src 'self'`, zero bundler), servido em `/reqs`, tendo a Forja como porta de entrada e cercado por Explorador, Workspace, Editor com IA, Mapa de impacto, Cobertura e Mudanças. Papel único de fato — operador da plataforma via SSO Keycloak na borda (middleware na IngressRoute, `apps/reqhub/k8s/reqhub.yaml:108-112`) — com recorte **platform-admin** (via `api/v1/me`) que revela o painel "Uso da IA" com restrição explicada ao não-admin (`app.js:3079`). Maturidade alta e disciplinada: DOM só por `createElement`/`textContent`, fail-closed de IA, focus management sistemático. Não verificado ao vivo (atrás de SSO; `spot-check.md:14`).

**O que já é referência**
- Copiloto Ctrl+K com focus-trap manual + `inert`/`aria-hidden` no fundo e devolução de foco ao gatilho (`app.js:2646-2652`, `app.js:2714-2733`) — padrão de modal para a plataforma.
- Grafo force-directed 100% operável por teclado: roving tabindex, setas/Enter/O/Esc, recuperação de foco quando o nó focado é filtrado (`app.js:513`, `app.js:592-616`, `app.js:710-718`).
- IA fail-closed com degradação explicada em camadas: sem servidor → typeahead puro com banner; chat com "Preencher manualmente →"; validação de duplicatas funciona sem IA (`app.js:2680-2684`, `app.js:1373-1378`, `app.js:1732-1734`).
- Loop de refino com live region dedicada: log visual não-live + `visually-hidden role=status` que anuncia só o resumo final (`app.js:1661-1663`) — solução exemplar para processos longos de IA.
- Motivos da fila de reprocessamento deep-linkam à evidência de origem (mapa/ledger/workspace, `app.js:918-924`) — rastreabilidade que vira navegação.

**Principais problemas (pós-verificação)**
- **UX-REQHUB-001** · P1 · CONFIRMADO — `<tr role="button">` destrói a semântica das tabelas principais (`app.js:108-109`; padrão repetido em Explorador, Versões, Cobertura, Fila). Todos os papéis, J-01: leitores de tela perdem a navegação por células e ouvem só "Abrir REQ-X, botão" — título, status e prioridade ficam inacessíveis no modo tabela.
- **UX-REQHUB-002** · P1 · CONFIRMADO — Meta-docs declaram app "read-only de 6 telas", mas a UI dispara launch com auto-merge e exclusão total de projeto (`apps/reqhub/README.md:11-14`; `studio.js:2716`, `studio.js:911`). Todos os papéis, J-03: operador (ou agente) que confia nos docs subestima o blast-radius real da superfície.
- **UX-REQHUB-004** · P2 · CONFIRMADO — Exclusão total de projeto (código + requisitos + baseline + Argo + cluster) atrás de um `window.confirm` genérico aprovável por Enter (`studio.js:909-913`). Operador, J-03: qualquer produto novo da Forja fica a dois cliques da destruição irreversível.
- **UX-REQHUB-005** · P2 · CONFIRMADO — Taxas ao vivo do Uso da IA com `aria-live="polite"` atualizadas a cada frame SSE inundam o leitor de tela (`app.js:2800-2804`). Platform-admin, J-06: o fluxo contínuo de anúncios torna o resto do painel inutilizável com AT.
- **UX-REQHUB-003** · P2 — Idade da baseline invisível: rodapé mostra só total/metamodelo/hash (`app.js:3135`) e a baseline não carrega `generated_at`. Todos os papéis, J-05: decisões de reprocessamento/cobertura podem se basear em dados stale sem nenhum aviso.

**Divergências e estados notáveis**
- View "Desenvolvimento" ÓRFÃ (UX-REQHUB-010, P3): `renderDev` e `#view-dev` completos, mas sem item de nav e `#/dev` redireciona para forge (`app.js:2285`) — peso morto da migração A1a→A1b.
- DIVERGENTE de docs (base do UX-REQHUB-002): README/devops.yaml/AGENTS descrevem o app de junho; o código tem 10+ views e ações de efeito colateral real.
- DIVERGENTE do levantamento prévio: "18 testes" → o código tem ~137 `test()`, com dois `forge-lib.test.mjs` (raiz e `test/`) num layout duplicado/confuso (`sections/reqhub.md:44-46`).
- Deep-links parciais (UX-REQHUB-011, P3): `writeHash` serializa só view/`id`/`product` (`app.js:2272-2274`) — busca e filtros do Explorador se perdem ao compartilhar URL.

**Recomendações-chave**
- Restaurar a semântica das tabelas (UX-REQHUB-001): manter `<tr>` como `row` e mover a ação para link/botão na célula do ID — padrão `btn-link` já existente no app; candidato a correção de plataforma (mesmo antipadrão em outras superfícies).
- Atualizar README/devops.yaml/AGENTS §8 (UX-REQHUB-002) declarando o Studio, launch/delete via esteira e suas salvaguardas — os meta-docs são consumidos por agentes e definem o blast-radius percebido.
- Fricção proporcional na exclusão (UX-REQHUB-004): diálogo próprio com resumo do que será destruído + digitar o nome do projeto (padrão GitHub); complementar com zona de risco desabilitada-e-explicada nos produtos em denylist (UX-REQHUB-012).
- `aria-live="off"` no bloco de taxas e anunciar só transições relevantes de limite (70/90%) numa região dedicada (UX-REQHUB-005), seguindo o próprio padrão do indicador vizinho (`app.js:2782`).
- Carimbar `generated_at` na baseline (dependência: gerador em `specs/`) e exibir "baseline de <data> (commit X)" no rodapé com badge de atenção (UX-REQHUB-003); incluir `q=` e filtros no hash (UX-REQHUB-011).

**Notas (calibradas):**

| usab | IA/nav | a11y | DS | resp | estados | onboarding | perf |
|---|---|---|---|---|---|---|---|
| 4,0 | 4,0 | 3,5 | 4,5 | 4,0 | 4,0 | 4,0 | 4,0 |


### 7.9 Portal Recorder (`/portal-rec`) — nota ponderada 3,48

**Perfil e papéis.** Ferramenta de operador técnico único: abre um portal externo (ex.: CETESB/MTR) num Chromium remoto (Playwright/CDP), transmite a tela por WebSocket para um `<canvas>`, captura rede/anotações/screenshots redigidos e normaliza tudo num contrato de portal promovível ao git via PR. SPA React + Vite com 3 rotas em hash-router próprio, CSS tokenizado sobre a paleta `--p-*` e casca `<platform-shell>` (`App.jsx:21`). Papel único (operador da plataforma, na prática `platform-admins`); a proteção não está na SPA — todas as rotas passam por middlewares OIDC do Console no IngressRoute (`k8s/ingressroute.yaml:52-92`) e as escritas exigem o Bearer `PORTAL_REC_TOKEN` da TokenBar (`api.js:37-54`), com backend fail-closed (503 sem env; 401 em tempo constante, `api/src/auth.js:18-40`). Maturidade boa para ferramenta interna: 3 views IMPLEMENTADAS, estados de loading/empty/erro sistemáticos, anti-duplo-submit em todas as ações.

**O que já é referência**
- Banner de promoção com rastreabilidade completa: endpoints/versão, caminho no repo, links "Ver PR"/"Ver execução" e aviso de revisão humana (`ReviewView.jsx:340-349`) — padrão exemplar para ações que disparam esteira.
- Transparência de redação: badge "redigido" com as chaves mascaradas listadas no expand/title (`ReviewView.jsx:213, 228, 235-239`) + disclosure permanente no footer (`App.jsx:66-71`).
- Mensagens de erro por status (503/401/404) mapeadas para texto acionável em pt-BR com detalhe técnico preservado (`api.js:100-115`).
- Contraste tratado como decisão documentada: accent do botão primário fixado em indigo "p/ contraste AA" com comentário no token (`styles.css:27-31`) — o mecanismo certo para corrigir UX-PREC-006.
- Confirmação destrutiva informativa: excluir portal avisa quantas sessões vão junto e que é irreversível (`PortalsView.jsx:224-229`).

**Principais problemas (pós-verificação)**
- **UX-PREC-001** (P0, CONFIRMADO) — Keyboard trap no canvas do screencast: `preventDefault` incondicional em todo keydown, sem saída por teclado (`CaptureView.jsx:198-202`; operador, J-PREC-03). Violação WCAG 2.1.2 nível A no fluxo principal — só o mouse tira o foco do canvas.
- **UX-PREC-003** (P1, CONFIRMADO) — 401 de sessão OIDC expirada é reportado como problema do `PORTAL_REC_TOKEN` (`api.js:103-104`; operador). Orientação de recuperação errada: mexer no token não resolve, e o re-login exige adivinhar o F5. Confiança: inferido.
- **UX-PREC-004** (P1, CONFIRMADO) — Passos marcados vivem só em memória: reload zera a lista e duplica `step_index` (`CaptureView.jsx:42`; operador, J-PREC-03). Índices repetidos ("passo 0" duplicado) corrompem a narrativa da revisão que alimenta o contrato.
- **UX-PREC-005** (P1, CONFIRMADO) — Screencast sem reconexão nem ação de recuperação quando o WS cai (`CaptureView.jsx:299-304`; operador, J-PREC-03). Ausência de recuperação na ação primária da ferramenta.
- **UX-PREC-006** (P1, CONFIRMADO) — Contraste < 4,5:1 nos textos de estado pequenos (ok/warn) no tema claro (`platform-tokens.css:24-25`; operador, J-PREC-04). Badges "recording", "redigido" e chips GET/PUT a ~3,2:1 em 0,68–0,72rem — reprovado em AA (1.4.3) no fluxo de revisão.
- **UX-PREC-002** (P2, **REBAIXADO** de P1) — TokenBar mostra "configurado" (verde) sem validar o token (`App.jsx:84-87`; operador, J-PREC-01). Verificação: o estado de erro em ação primária EXISTE (o 401 de escrita aponta o remédio na tela) — sobra status enganoso, fricção P2.
- **UX-PREC-007** (P2) — "Encerrar sessão" irreversível dispara sem confirmação (`CaptureView.jsx:249-254`; operador, J-PREC-03), inconsistente com as exclusões, que pedem confirm.
- **UX-PREC-009** (P2, CONFIRMADO-COM-RESSALVA) — Captura de sessão inexistente: catch vazio deliberado no mount (`CaptureView.jsx:60-62`; operador, J-PREC-03). Ressalva da verificação: não é silêncio absoluto — o WS falha e a UI mostra "Falha na conexão do screencast": estado ENGANOSO, não ausente.

**Divergências e estados notáveis**
- **UX-PREC-013** (P3, OBSOLETO/DIVERGENTE) — README omite `DELETE /v1/portals/:id` e `DELETE /v1/sessions/:id`, ambos implementados e usados pelos botões "Excluir" (`README.md:12-18`).
- `exportContract` (`api.js:185-186`) não é usado por nenhuma view — o export canônico de contrato não tem botão na Revisão (menção sem ID).
- **UX-PREC-015** (P3, NÃO INICIADO) — nenhuma orientação na UI de onde obter o `PORTAL_REC_TOKEN` (vive num Secret k8s; `App.jsx:104-113`).

**Recomendações-chave**
- Reservar atalho de escape não encaminhado ao remoto (ex.: Esc duplo ou Ctrl+Alt → `canvas.blur()`) e citá-lo no hint do canvas — elimina o P0 (UX-PREC-001).
- Distinguir 401 no `apiFetch`: leitura sem `auth:true` ⇒ "Sessão expirada — recarregue a página"; escrita com token ⇒ mensagem de token; e rebaixar a TokenBar para "token inválido" após 401 de escrita (UX-PREC-003, UX-PREC-002 — quick win).
- Hidratar os passos no mount via `GET /v1/sessions/:id/annotations` (criar wrapper em `api.js`) e derivar `step_index` do total persistido (UX-PREC-004).
- Botão "Reconectar" no overlay do screencast (reexecuta o effect do WS), com backoff automático opcional (UX-PREC-005).
- Aliases de foreground mais escuros (`--ok-text`/`--warn-text`) para textos pequenos de status/badge/method no tema claro, validando com axe — mesmo mecanismo já usado no accent (UX-PREC-006).

**Notas (calibradas):**

| usab | IA/nav | a11y | DS | resp | estados | onboarding | perf |
|---|---|---|---|---|---|---|---|
| 3,5 | 4,0 | 2,5 | 4,5 | 3,5 | 3,0 | 3,0 | 3,5 |


### 7.10 ContaViva 360 (`/contaviva-360`) — nota ponderada 2,50

**Perfil e papéis.** Produto gerado pela Forja (blueprint gymops-style) que se propõe a ser "plataforma completa de gerenciamento contábil para PF e PJ" (specs/products/contaviva-360/product.json:29). Stack Vue + kit `ui-vue` sincronizado + API Node; o backend cobre 9 REQs (cadastros PF/PJ, documentos, obrigações fiscais, tarefas, financeiro, NF-e, IA, dashboards por papel — api/src/server.js:72-103), mas o frontend expõe só 4 blocos (dashboards, Registros, Controle Financeiro, Assistente). Papéis divergem em três camadas: 7 perfis na visão, 3 ranks no RBAC (rbac.js:3), 6 chaves no frontend (DashboardView.vue:17-24). Auth é um stand-in por header `X-Role`/`X-Tenant-Id` controlado pelo cliente (rbac.js:6-11) — sem login, sessão ou logout.

**O que já é referência**
- UiModal com focus trap real + restauração de foco ao elemento de origem (ui/components/UiModal.vue:32-54).
- `document.title` por tela com restauração no unmount (ui/components/UiPageLayout.vue:34-45).
- status-map "a cor nunca é o único sinal" + dicionário EN→PT nos badges (ui/lib/status-map.js:4, 23-32).
- Assistente com `role="log" aria-live="polite"`, fail-closed com banner acionável e mapeamento de erros 503/413 (views/AiAssistantView.vue:23, 15-19, 122-127).
- Tema persistido na chave única da plataforma (`nvit-theme`) com fallback a `prefers-color-scheme` (ui/components/UiAppShell.vue:64-72).

**Principais problemas (pós-verificação)**
- **UX-CV360-001** (P0) — SPA operacional e API por papel sem login, guard ou autoridade: `router.js` sem `beforeEach` (main.js:8-9), IngressRoute sem middleware SSO (k8s/contaviva-360-frontend.yaml:25-28), `/v1/dashboard/role/admin` e `PATCH .../concluir` sem `requireRole` (role-dashboards.js:258, 299). Todos os papéis afetados. *Ressalva da verificação:* a borda da API tem ForwardAuth `console-auth-401`; o gap real é X-Role spoofável + rotas sem `requireRole` atrás da borda. O spot-check ao vivo confirmou: `/contaviva-360/dashboard/admin` abre para visitante anônimo com casca completa e alertas "HTTP 401" sem nenhuma tela/CTA de login — beco sem saída absoluto (live/spot-check.md:17).
- **UX-CV360-002** (P0) — Módulos centrais sem superfície: API completa de PF/PJ, documentos, tarefas, NF-e e gateways (server.js:73-103) sem nenhuma rota/view; contador e cliente PJ têm jornadas críticas (subir documento, concluir tarefa, emitir NF) inoperáveis pela UI.
- **UX-CV360-003** (P1) — "Marcar como concluído" (status fiscal → `pago`) falha em silêncio via `catch {}` e sem confirmação nos 4 dashboards (DashboardClientePfView.vue:137-146); todos os papéis.
- **UX-CV360-004** (P1) — Erro de `/me` cai silenciosamente no painel PF; o `UiErrorState` é código morto (`v-if="view"` vence o `v-else`, DashboardView.vue:2-5, 29-38) — admin/contador veem o dashboard errado sem aviso.
- **UX-CV360-005** (P1) — Identidade invisível: `/me` não retorna `email` (server.js:33) e o UiAppShell só mostra o chip com `m.email` (UiAppShell.vue:74) — nenhum indicador de usuário/papel/logout em toda a UI de um sistema fiscal multi-papel.
- **UX-CV360-006** (P1) — Tokens fantasma (`--ui-primary`, `--ui-radius`) e triplets crus quebram affordances: botão de horizonte 30/60/90 ativo idêntico ao inativo no Fluxo de Caixa (CashFlowView.vue:55-56) e filtros sem borda (AccountsPayableView.vue:160).
- **UX-CV360-007** (P1) — Filtros de AP/AR e período sem rótulo acessível; datas De/Até indistinguíveis — `placeholder` não renderiza em `input type=date` (AccountsPayableView.vue:8-18; FinancialDashboardView.vue:5-6). WCAG 3.3.2/1.3.1 no fluxo principal PJ.
- **UX-CV360-008** (P1) — Painel do Contador: cartões de cliente e grupos de documento são `div @click` sem `role`/`tabindex`/teclado (DashboardContadorView.vue:13-19, 43) — jornada principal do contador inoperável por teclado (WCAG 2.1.1).
- **UX-CV360-009** (P1) — Assistente descarta `draft`/`citations`/`grounded` e o loop de confirmação humana (`POST /v1/assistant/confirm-draft`, assistant.js:141-173) não tem UI — a view só renderiza `r.answer || r.text` (AiAssistantView.vue:112); sem disclosure de conteúdo gerado por IA.
- **UX-CV360-010** (P2) — 4 rotas de dashboard por papel órfãs: no router (router.js:18-21) mas fora do nav, sem gating nem contexto de navegação.
- **UX-CV360-012** (P2) — Corte silencioso de dados: API ignora `page/pageSize` e aplica LIMIT 500/200 (financial-control.js:23; repositories/records.js:6) sem páginação nem aviso na UI — dados financeiros parciais invisíveis.
- **UX-CV360-014** (P2) — Papéis divergentes em três camadas (7 × 3 × 6); `contador`/`cliente_pf` fora do RANK ganham rank 0, abaixo de `member`, em qualquer `requireRole`.

**Divergências e estados notáveis**
- PARCIALMENTE IMPLEMENTADO: backend 9 REQs × frontend 4 blocos (UX-CV360-002); loop de confirmação de rascunho da IA só na API (UX-CV360-009).
- Telas órfãs: `/dashboard/{pf,pj,contador,admin}` alcançáveis só por URL (UX-CV360-010).
- DIVERGENTE: três fontes de papéis inconciliáveis — product.json × rbac.js × ROLE_MAP (UX-CV360-014); "fato conhecido" da IA confirmado — fail-closed devolve `'offline, consulte seu contador'` (assistant.js:130).
- Zero testes de frontend: `tests/locked/**` são ~64 testes de API; `frontend/package.json` sem vitest/Playwright/axe. O bloco locked "oidc-sessão" tem 8 linhas e 1 assert de `/health` aberto — nome dá falsa garantia de sessão (ressalva de UX-QA-011).

**Recomendações-chave**
- Fechar UX-CV360-001: guard de sessão OIDC real (borda SSO ou `beforeEach` + tela de login) e `requireRole` nas rotas de dashboard/`concluir` — pré-requisito de qualquer go-live; hoje `X-Role` spoofável anula o RBAC atrás do ForwardAuth.
- Quick wins de kit já disponível (003/004/006/007/008): trocar `catch {}` por toast + `useConfirm`, corrigir a ordem `v-if`/`v-else` do DashboardView, substituir tokens fantasma pelos reais (`-sm/-md/-lg` e `rgb()`), envolver filtros em `UiFormField` (os Relatórios já fazem) e dar `role`/`tabindex`/Enter aos cartões do contador.
- Expor `email`/papel no `/me` e passar `loginHref` ao UiAppShell para dar identidade visível e logout (005), destravando também o gating das rotas órfãs (010).
- Renderizar `draft`/`citations` e a confirmação humana de rascunho no Assistente + disclosure de IA (009) — o mecanismo de segurança padronizado da plataforma já existe na API.
- Unificar a taxonomia de papéis nas três camadas (014) e implementar páginação real de API+UI antes de crescer o volume financeiro (012).

**Notas (calibradas):**

| usab | IA/nav | a11y | DS | resp | estados | onboarding | perf |
|---|---|---|---|---|---|---|---|
| 2,0 | 2,5 | 2,5 | 3,0 | 3,5 | 3,0 | 1,0 | 3,0 |


### 7.11 ContaViva Pro (`/contaviva-pro`) — nota ponderada 3,10

**Perfil e papéis.** Produto gerado pela Forja (blueprint gymops-style): frontend Vue 3 + vue-router sob `/contaviva-pro/`, API Fastify sob `/contaviva-pro/api`, Postgres + Redis/BullMQ; auth própria (JWT HS256 + refresh rotacionado) com SSO Keycloak aditivo. Papéis reais na UI: `admin` e `member` (`useAuth.js:11`, `router.js:20`); o backend conhece um terceiro papel, `manager`, sem qualquer superfície. Maturidade paradoxal: camada de apresentação madura (kit `ui-vue` sincronizado, 16 componentes, estados sistemáticos), mas espinha do produto frágil — API do domínio sem auth, edição quebrada por contrato, zero testes de frontend.

**O que já é referência**
- Focus trap com filtragem de elementos visíveis + restauração do foco anterior + trava de scroll (`UiModal.vue:32-54`) — candidato a padrão de plataforma.
- Sincronização de `document.title` por rota com restauração no unmount (`UiPageLayout.vue:34-45`).
- Dicionário de status EN→PT com tom semântico e regra explícita "a cor NUNCA é o único sinal" (`status-map.js:4,21-39`).
- Anti-duplo-submit embutido no `handleSubmit` de todos os formulários (`useForm.js:34-40`).
- Bootstrap de admin sem senha default + registro público que nunca escala privilégio (`db.js:34-43`, `server.js:35`).

**Principais problemas (pós-verificação)**
- **UX-CVPRO-001 (P0)** — API de records sem autenticação: rotas de domínio sem `preHandler: requireAuth` (`server.js:25-28`) e tenant por header spoofável (`server.js:20`), enquanto o front marca tudo `requiresAuth` (`router.js:13-16`). Todos os papéis/J-CVPRO-01: a segurança percebida pelo operador é falsa — anônimo lê e cria registros via curl.
- **UX-CVPRO-002 (P0)** — Editar registro sempre falha: a UI chama `PUT /v1/records/:id` (`api.js:34`), rota que o backend não possui (`server.js:25-28`); toast críptico "HTTP 404". J-CVPRO-04 bloqueada para todos, com convite explícito da UI ("Editar" primário em `ResourceDetailView.vue:5`).
- **UX-CVPRO-003 (P1)** — Sessão morre a cada ~15 min: qualquer 401 destrói o refresh token de 7 dias em vez de usá-lo (`api.js:18`, `useAuth.js:65`; `ACCESS_TTL='15m'` em `auth.js:19`). Todos os papéis: relogin forçado com perda de formulário em curso; correção 100% frontend.
- **UX-CVPRO-004 (P1)** — Sessão expirada = tela morta: o `auth:logout` só zera estado, ninguém faz `router.push('/login')` nem preserva `redirect` (`router.js:30`, `App.vue:26-32`). Usuário precisa deduzir que foi deslogado.
- **UX-CVPRO-005 (P1)** — Recuperação de senha inexistente em qualquer canal: sem link no `AuthView.vue:38-41`, sem rota de reset (`server.js:30-55`) e o admin não redefine senha (`server.js:92-104`). J-CVPRO-05: beco sem saída absoluto de conta.
- **UX-CVPRO-006 (P1)** — Troca de papel sem confirmação e sem proteção contra auto-rebaixamento: `toggleRole` dispara o PATCH no clique (`AdminUsuariosView.vue:101-105`) e o backend revoga as sessões do alvo (`server.js:102`), inclusive as do próprio admin — um clique na própria linha e só outro admin/reseed recupera.
- **UX-CVPRO-007 (P2)** — Coluna "Título" anuncia ordenação morta: `sortable: true` (`ResourceListView.vue:16`) sem binding de `:sort`/`@update:sort`; `aria-sort` engana também leitores de tela.
- **UX-CVPRO-008 (P2)** — Paginação de fachada: backend sempre `LIMIT 200` ignorando `page/pageSize` (`server.js:25`); dashboard pede 5 e renderiza até 200 (`DashboardView.vue:26-27`), lista sem aviso de truncamento.
- **UX-CVPRO-009 (P2)** — Negação de acesso admin silenciosa: member em `/admin/users` volta ao dashboard sem toast/403 (`router.js:31`).

**Divergências e estados notáveis**
- **UX-CVPRO-013 (P2, OBSOLETO/DIVERGENTE)** — `specs/products/contaviva-pro/product.json` tem `requirement_ids: []` e `scaffold`/`build` = `not_started` com o app completo; *vision* promete "ERP contábil" com perfil "contador" que o código não entrega. Efeito local: zero requisitos/refinamentos ancoram esta superfície — não existe critério de aceite de UX. (Mandato global do A16.)
- **UX-CVPRO-010 (P2)** — Papel `manager` órfão: aceito no backend (`auth.js:21`, `server.js:85/94`) e invisível na UI (select só member/admin, `AdminUsuariosView.vue:47-49`).
- `/records/:id/edit` — PARCIALMENTE IMPLEMENTADO: rota e formulário existem, mas salvar falha sempre (ver UX-CVPRO-002).
- **UX-CVPRO-017 (P3)** — Submissão assíncrona (fila BullMQ, `server.js:28`) existe e é invisível na UI: badges de status que o usuário nunca consegue provocar.
- UX-CVPRO-012 (skip-link ausente) foi consolidado como duplicado do achado canônico **UX-A11Y-006** (verification-report.json, seção `duplicados`) — tratar no kit, beneficia todos os apps da Forja.

**Recomendações-chave**
1. Fechar o contrato front↔back do domínio: adicionar `requireAuth` + escopo real nas rotas de records (UX-CVPRO-001) e implementar `PUT /v1/records/:id` — ou remover o botão "Editar" até lá (UX-CVPRO-002).
2. Interceptar 401 no `request()` → tentar `POST /auth/refresh` → repetir a chamada → só então deslogar; e listener global de `auth:logout` com toast "Sessão expirada" + `?redirect=` (UX-CVPRO-003/004 — o mecanismo de retorno já existe em `AuthView.vue:62`).
3. Criar canal de recuperação de senha (self-service ou reset administrativo via `PATCH /v1/users/:id`) — UX-CVPRO-005.
4. Confirmar troca de papel com `useConfirm` (já usado na desativação) e recusar/desabilitar auto-rebaixamento na própria linha (UX-CVPRO-006).
5. Ligar `r.setSort` (já existe em `useResource.js:38`) ou remover `sortable`; respeitar `page/pageSize` + `total` no backend e avisar truncamento (UX-CVPRO-007/008).

**Notas (calibradas):**

| usab | IA/nav | a11y | DS | resp | estados | onboarding | perf |
|---|---|---|---|---|---|---|---|
| 2,0 | 3,5 | 3,5 | 4,0 | 3,5 | 3,0 | 2,5 | 3,0 |


### 7.12 NeuroEvolui (`/neuroevolui`) — nota ponderada 2,85

**Perfil e papéis.** App da Forja (blueprint gymops-style) para clínicas de neuropsicopedagogia: pacientes, consultas, evoluções clínicas, financeiro, auditoria, base de conhecimento RAG, assistente IA e jobs. SPA Vue com 36 rotas (`apps/neuroevolui/frontend/src/router.js`) sobre a cópia sincronizada do kit `ui-vue` + tokens gerados; é o produto da Forja com maior investimento em estados e microcopy (skeleton/empty/erro/retry/anti-duplo-submit em praticamente toda tela). Papéis reais no backend: `owner > clinic_manager > professional > patient` (`apps/neuroevolui/api/src/rbac.js:4`), identidade via borda SSO ou header stand-in `X-Role` — mas o frontend não consome papel para nada estrutural e não tem login nem guard. Os 9 REQ estão `deployed`; nenhum dos 50 REF de UX está na main auditada (0001–0034 `not_started`, 0035–0050 `pr_open`, PRs #134–#149).

**O que já é referência**
- **AssistantView fail-closed** — probe de disponibilidade, banner de estado, cancelar/timeout 60s com AbortController, fontes RAG citadas com relevância e selo de confiança por resposta (`apps/neuroevolui/frontend/src/views/AssistantView.vue:62-77, 727-846`).
- **Agendamento com 409 + idempotência comunicada** — banner `role=alert` de conflito, renovação da Idempotency-Key após 409 e selo explicando a proteção contra cobrança dupla (`apps/neuroevolui/frontend/src/views/ConsultationCreateView.vue:62-75, 250-254, 650-659`).
- **UiModal com focus trap real** — trap de Tab filtrando só focáveis visíveis + restauração do foco anterior (`apps/neuroevolui/frontend/src/ui/components/UiModal.vue:32-53`).
- **UiPageLayout sincroniza `document.title`** por tela ("<página> · <app>") e restaura no unmount (`apps/neuroevolui/frontend/src/ui/components/UiPageLayout.vue:34-45`).
- **Métricas desambiguadas** — prefixo "Nesta página:" nos cards parciais para não se passarem por totais do tenant (`apps/neuroevolui/frontend/src/views/PatientListView.vue:13-44`).

**Principais problemas (pós-verificação)**
- **UX-NEURO-001** (P0, CONFIRMADO) — SPA operacional sem guard nem fluxo de login (`frontend/src/main.js:8-9`; IngressRoute do frontend sem middleware, App.vue sem `login-href`). Todos os papéis, jornada de entrada: sem sessão, as 36 telas abrem e degradam para "Acesso restrito" sem nenhum CTA de login — beco sem saída absoluto.
- **UX-NEURO-002** (P1) — 8 telas vivas navegam para 6 rotas inexistentes (`/revenue`, `/jobs`, `/transactions`, `/dashboard`, `/notifications`, `/reports`), incluindo o redirect pós-salvar de preferência (`views/NotificationPreferenceCreateView.vue:332`). Todos os papéis; CTAs primários e botões Voltar caem no 404 e o usuário perde o fio da jornada.
- **UX-NEURO-003** (P1, quick win) — Desativar/Reativar paciente quebrado: `confirm.ask` não é função (`views/PatientListView.vue:327`). Profissional/gestor na jornada de cadastro; clique não faz nada (TypeError silencioso) — arquivamento inoperante pela lista.
- **UX-NEURO-004** (P1) — Cadastro de paciente descarta silenciosamente CPF, gênero e referência externa (`views/PatientCreateView.vue:531-538`; o CPF deveria ir em `document`, como o Edit faz). Operador valida o CPF e a lista mostra "Sem documento" — perda de dado cadastral clínico sem erro.
- **UX-NEURO-005** (P1) — Vocabulários de status pt vs en divergentes entre telas e backend (`views/PatientCreateView.vue:414-418`); cancelar consulta grava `cancelado`, mas o check de conflito só exclui `cancelled` — cancelar pela UI não libera o horário na agenda.
- **UX-NEURO-006** (P1) — Papel `patient` existe no RBAC (`api/src/rbac.js:4`) e a visão do produto promete área própria com IA, mas não há rota, menu ou tela para o papel; logado sem grupo (default `patient`), vê o menu de gestão e coleciona 403.
- **UX-NEURO-007** (P1) — 401 e 403 tratados identicamente como "Acesso restrito... fale com um administrador" (`views/DashboardView.vue:384-386`); sessão expirada não oferece reautenticação — orientação errada gera chamados falsos de "perdi meu acesso".
- **UX-NEURO-008** (P1) — "Confirmar e aplicar" rascunho da IA não persiste nada: seta flag local e mostra "Rascunho aplicado" (`views/AssistantView.vue:858-866`). Profissional acredita que o plano de intervenção foi salvo no prontuário — risco clínico. (Faz parte da família cross-app UX-AI-001.)
- **UX-NEURO-009** (P1) — Agenda carrega só a 1ª página (50) como se fosse o total e descarta `res.total`; filtros de servidor enviados são ignorados pelo backend (`views/ConsultationListView.vue:806-809`). Com >50 consultas, registros somem da tabela, do calendário e dos KPIs sem aviso — risco de duplo agendamento.
- **UX-NEURO-014** (P2, quick win) — Régua de papéis local do PatientCreateView usa papéis fictícios (`viewer/member/manager/admin`) e omite `patient` → `rank undefined` vira "ok" (`views/PatientCreateView.vue:369-371`); o único papel que o check deveria barrar passa direto.
- **UX-NEURO-015** (P2) — `GET /v1/consultations` sem `requireRole` (`api/src/server.js:169`): rank mínimo lê a agenda completa do tenant com IDs e valores, enquanto o detalhe `:id` exige `clinic_manager` — exposição invertida; decisão de produto/API.
- **UX-NEURO-013** (P2, CONFIRMADO-COM-RESSALVA) — Sem skip-link (WCAG 2.4.1) num shell com topo + sidebar de 14 itens (`ui/components/UiAppShell.vue:3-5`). Ressalva da verificação: os landmarks do shell (header, nav com aria-label, main) já atendem 2.4.1 para leitores de tela; o gap real é do usuário de teclado vidente — P2 mantido, sem elevação. (Família UX-A11Y-006: corrigir no UiAppShell cobre 3 apps de uma vez.)

**Divergências e estados notáveis**
- **PARCIALMENTE IMPLEMENTADO / órfãs** — 11 views (~7,9k linhas: `Report*`, `Transaction*`, `RevenueDashboardView`, `SystemHealthView`, `JobsMonitorView`, `ApiDocsView`, `AiAssistantView`, `NotificationPreferencesView`) sem nenhuma rota no router (`frontend/src/router.js:1-55`, UX-NEURO-010, P2): geração anterior da Forja convivendo com a atual — os links quebrados do UX-NEURO-002 apontam exatamente para as rotas que essas órfãs ocupariam; `SystemHealthView` ainda referencia `/api-docs`, também inexistente.
- **DOCUMENTADO/PLANEJADO** — a área do paciente prometida na `vision` do `specs/products/neuroevolui/product.json` não existe (UX-NEURO-006); o papel está PARCIALMENTE IMPLEMENTADO (só no RBAC).
- **DIVERGENTE (front↔back)** — enums de status pt vs en (UX-NEURO-005), payload de cadastro com campos que o repositório descarta (UX-NEURO-004) e régua de papéis local inventada (UX-NEURO-014); nenhuma esteira verifica esse contrato (contexto: UX-QA-004).
- **Falsa garantia de teste** — o bloco LOCKED `oidc-sessao` tem 8 linhas e só asserta `/health` aberto (`tests/locked/capability/oidc-sessao.test.mjs:1-8`, ressalva do UX-QA-011): o P0 de auth passou verde por baixo dele; toda a bateria é de API, zero E2E/axe/navegação.

**Recomendações-chave**
1. **Fechar a porta de entrada (UX-NEURO-001 + 007)**: `loginHref` real no UiAppShell, guard/interceptor tratando 401 do `/me` com redirect ao login preservando deep-link; diferenciar 401 ("Entrar novamente") de 403 (papel mínimo exigido) no `api.js`.
2. **Saneamento de navegação (UX-NEURO-002 + 010)**: corrigir os 6 alvos para as rotas registradas (`/payment-transactions`, `/async-jobs`, `/`, `/notification-preferences`, `/patient-reports`, `/financial`) e decidir cada órfã (religar — ex.: RevenueDashboard em `/revenue` — ou excluir), com teste estático de `router.push`/`to=` contra o router (harness do UX-QA-003).
3. **Quick wins de 1 linha**: `confirm({...})` no lugar de `confirm.ask` (UX-NEURO-003); mapear CPF→`document` no Create como o Edit já faz (UX-NEURO-004); régua de papéis espelhando `rbac.js` com desconhecido = denied (UX-NEURO-014).
4. **Enum canônico en em todos os writes** (UX-NEURO-005), com rótulos pt só na exibição via status-map do kit — critério: cancelar pela lista libera o horário sem 409.
5. **Honestidade nos fluxos de dados**: agenda em server-mode com `res.total` e aviso de truncamento (UX-NEURO-009); trocar o CTA do rascunho IA por "Levar para nova evolução" enquanto não houver endpoint de persistência (UX-NEURO-008).

**Notas (calibradas):**

| usab | IA/nav | a11y | DS | resp | estados | onboarding | perf |
|---|---|---|---|---|---|---|---|
| 2,5 | 2,5 | 3,5 | 3,5 | 3,5 | 3,0 | 1,5 | 2,5 |

> Calibração: `estados_feedback` 3,5→3,0 pelos 3 P1 de falha silenciosa/enganosa (NEURO-003, 007, 009), alinhando com cv360/cvpro no mesmo kit. Verificação: 22 achados, 12 verificados, 0 mortos.


### 7.13 Imobia (`/imobia`) — nota ponderada 2,83

**Perfil e papéis.** "Ecossistema imobiliário + fintech" multi-tenant (Organization/Membership): site público de 3 páginas + 11 módulos operacionais atrás de um AppShell autenticado (Vue 3 + API Node/Prisma), com orquestração de 4 IAs (Cortex/GPT/Claude/Gemini) fail-soft genuinamente refletida na UX. O schema define 4 papéis (`admin`/`corretor`/`financeiro`/`vistoriador`, schema.prisma:15-20), mas na prática só `admin` é alcançável — todo registro/SSO cria admin de org nova (auth/service.ts:53,112). Auth real client+server: guard `meta.requiresAuth` + `ensureReady()` aguardando hidratação da sessão (router.js:61-70), API com `requireAuth` em todas as rotas de módulo. Maturidade: 11 jornadas completáveis contra API real, porém zero testes no app.

**O que já é referência**
- Guard com hidratação aguardada e promise cacheada — não derruba o usuário logado em refresh/deep-link (stores/auth.js:75-82 + router.js:61-63); candidato a padrão de plataforma para SPAs com JWT.
- Disclosure de IA exemplar: chip ator·modelo com custo/tokens/latência por resposta (Assistente.vue:77,83), avisos "dormente" em todos os pontos de IA (WhatsApp.vue:47, Mercado.vue:53) e marcação de itens criados por IA (Agenda.vue:54).
- Fail-soft comunicado: busca semântica degrada para textual trocando o placeholder (Imoveis.vue:77) e a API declara `mode: semantic|text`.
- Empty states com orientação e CTA em todos os 11 módulos ("Nenhum imóvel ainda. Comece captando o primeiro.", Imoveis.vue:83-87).
- Timeline com atribuição humano×IA por evento via `actorType` (Imoveis.vue:142-148) — trilha de auditoria de qual IA produziu o quê.

**Principais problemas (pós-verificação)**
- **UX-IMOBIA-001** (P0, CONFIRMADO) — Detalhes de todos os módulos abrem só por mouse: `@click` em `<article>`/`<tr>` sem tabindex/role/teclado (Imoveis.vue:89; idem Leads, Vistorias, Corbam, Mercado). Todos os papéis, todas as jornadas de detalhe: usuário de teclado/AT não abre timeline, score, fotos, cartas nem PTAM — WCAG 2.1.1 nível A. Instância do padrão sistêmico **UX-A11Y-001**.
- **UX-IMOBIA-002** (P1, CONFIRMADO) — Modal de todo fluxo de criação sem focus-trap, ESC nem `role="dialog"` (Modal.vue:6-11); Tab percorre a página por baixo do overlay.
- **UX-IMOBIA-003** (P1, CONFIRMADO) — Falha de carga vira "vazio" enganoso: `try/finally` sem catch em todas as listas (Imoveis.vue:25-31); erro de rede/500 exibe "Nenhum imóvel ainda", sem retry.
- **UX-IMOBIA-004** (P1, CONFIRMADO) — RBAC de fachada: `writeRoles` existe na fábrica CRUD (crud.ts:25) mas nenhum módulo o usa; sem convite/gestão de membros, os 3 papéis não-admin são inatingíveis e a sidebar exibe o papel sugerindo segregação inexistente (AppShell.vue:41).
- **UX-IMOBIA-005** (P1, CONFIRMADO) — Docs divergem do código: CLAUDE.md:30 declara "kit `ui-vue` sincronizado em F3+" e fases F0-F8 "verificadas", mas o frontend usa só tokens locais `--im-*` (styles.css:1-2) e não há um único teste no app.
- **UX-IMOBIA-006** (P1, CONFIRMADO) — Nada é editável ou excluível pela UI: API tem PUT/DELETE e o cliente tem `update`/`remove` (api.js:48-49), sem chamadores nas views — imóvel com preço errado ou lead duplicado é permanente para o usuário.
- **UX-IMOBIA-007** (P1, CONFIRMADO) — Sessão expirada mid-use sem tratamento: nenhuma view distingue 401 (api.js:20); o usuário fica numa tela morta (alert ou falso-vazio) em vez de ser levado ao login; TTL do JWT torna o cenário garantido.
- **UX-IMOBIA-009** (P2, CONFIRMADO) — `alert()` nativo é o canal de erro e de aviso de IA em 20 pontos (Leads.vue:41 etc.), bloqueante e fora do design system.
- **UX-IMOBIA-010** (P2, CONFIRMADO-COM-RESSALVA) — Classe `.im-linkbtn` usada mas nunca definida (só o modificador `.busy`, styles.css:274): botões secundários caem no estilo UA claro sobre o tema escuro. Ressalva da verificação: são 18 usos (17 `<button>` + 1 `<label>` em Vistorias.vue:66), não 19.
- **UX-IMOBIA-011** (P2) — JWT de acesso trafega na query string do SSE do assistente (api.js:31) — exposto em logs de proxy e histórico; a plataforma já tem precedente de SSE-over-POST (CMS).

**Divergências e estados notáveis**
- SSO Keycloak PARCIAL: backend `/auth/keycloak` e `auth.js:51-53` (`loginKeycloak`) existem, mas nenhuma UI os chama; o login apenas promete "SSO disponível" (Login.vue:66) — **UX-IMOBIA-016** (P2).
- UI pública promete PTAM/laudo "em PDF" (modules-catalog.ts:69, Arquitetura.vue:14) sem gerador de PDF no código — **UX-IMOBIA-021** (P3); saída real é texto `<pre>`.
- OBSOLETOS: `ModulePlaceholder.vue` importado no router sem rota que o use, e comentário de nav.js:1-2 sobre placeholders — todos os 11 módulos estão `ready: true` com telas reais; `/meta` responde `phase: 'F1'` vs `/health` `'F7'` (server.ts:53,71).
- Verificação ao vivo: Imobia ficou fora do time-box do spot-check (spot-check.md); análise 100% ancorada no repo.

**Recomendações-chave**
- Tornar o alvo primário de cards/linhas um `<button>`/link real (ou `tabindex="0"` + Enter/Espaço) nos 5 módulos com detalhe — resolve **001**; adotar a primitiva de plataforma quando **UX-A11Y-001** entregar.
- Corrigir `Modal.vue` num único arquivo (role/aria-modal, foco inicial, trap, ESC, retorno de foco) — **002**.
- Interceptar 401 no `req()` central (`auth.logout()` + `/login?redirect=...` com aviso) e adicionar catch com notice+retry em todos os `load()` — **007** + **003**, reaproveitando o padrão de erro que já existe na Home (Home.vue:56-57).
- Ligar edição/exclusão reutilizando o modal de criação + confirmação (**006**) e aplicar `writeRoles` por módulo com rotas de convite/membership (**004**) — pré-requisito para o modelo multi-perfil do CONCEPCAO.
- Alinhar docs ao código: executar (ou desdeclarar) a sincronização ui-vue, registrar a dívida de testes (**005**) e remover as promessas de SSO/PDF sem caminho de uso (**016**, **021**).

**Notas (calibradas):**

| usab | IA/nav | a11y | DS | resp | estados | onboarding | perf |
|---|---|---|---|---|---|---|---|
| 3,0 | 3,5 | 2,0 | 3,0 | 3,0 | 2,5 | 2,5 | 3,0 |


### 7.14 Ana Rabottini (`/anarabottini`) — nota ponderada 3,78

**Perfil e papéis.** SPA institucional de palestrante (saúde mental corporativa / neurodiversidade / NR-1), Vite + React 18 + TS servida por nginx sob `/anarabottini/`, duas rotas (`/` e `/contato`), sem backend próprio: conteúdo vem do CMS da plataforma (`src/lib/content.ts:11-19`) com fallback estático, e a edição visual acontece no DevOps Console via iframe + postMessage (`src/lib/cmsEdit.tsx`). Papéis reais: visitante anônimo (RH/SESMT/gestor) e editor-CMS via Console. Maturidade alta para o porte (tier leve), sem autenticação própria por design — o gate de edição é iframe mesma-origem + checagem de `e.origin`; zero testes (`package.json` sem script/dependência de teste).

**O que já é referência**
- Estados vazios honestos por toda parte — "vídeo em breve" (`VideoEmbed.tsx:44-57`), materiais "Em breve" com cadeado (`SectionRenderer.tsx:404`), canais "A definir" (`Contato.tsx:55-92`): degradação sem link quebrado nem conteúdo inventado; padrão a replicar nos portais da plataforma.
- Modal acessível completo — focus-trap manual, Esc/setas e devolução do foco ao elemento de origem (`Modal.tsx:39-71`).
- `prefers-reduced-motion` sistemático — `useReducedMotion` em Reveal/Counter/hero (`ui.tsx:9`, `backgrounds.tsx:21,35-38`) + `scroll-behavior: auto` (`tokens.generated.css:33`).
- Gate de edição minimalista e seguro — latch mesma-origem + verificação de `e.origin`; o portal só emite intenções, nunca persiste (`cmsEdit.tsx:31-42,70-79`).
- `ProposalButton` nunca quebra — resolve WhatsApp → senão `/contato` (`ProposalButton.tsx:25-36`).

**Principais problemas (pós-verificação)**
- **UX-ANA-001** (P1, CONFIRMADO-COM-RESSALVA) — Fallback com canais de contato vazios mata a jornada de conversão (`src/lib/site.ts:28-32`; visitante, J-ANA-01): todo CTA converge para `/contato`, que informa "canais em breve" sem meio de contato — zero leads com CMS vazio/fora do ar. Ressalva da verificação: em runtime o conteúdo vem do CMS (não verificável no repo), mas o `CLAUDE.md` do app documenta o estado placeholder como vigente.
- **UX-ANA-002** (P1) — `/contato` não é renderizada pelo CMS (`src/pages/Contato.tsx:17-30`; editor-CMS e visitante, J-ANA-03): heading/form hardcoded; editar a página "contato" no Console não tem efeito no público nem no preview — engana o operador na proposta central do CMS.
- **UX-ANA-003** (P2) — `BackToTop` lê `hasWhatsApp` estático do fallback (`BackToTop.tsx:3,27-29`; visitante): com WhatsApp configurado no CMS, o FAB (z-50) sobrepõe o "voltar ao topo" (z-40) exatamente no cenário de produção.
- **UX-ANA-004** (P2) — Contraste < AA em textos atenuados por opacidade (`Footer.tsx:96-98`; todos): `muted/70` sobre surface2 ≈ 3,2:1 e placeholders `/60` — ilegíveis para baixa visão (WCAG 1.4.3).
- **UX-ANA-005** (P2) — HTML do CMS injetado via `dangerouslySetInnerHTML` sem sanitização no cliente (`SectionRenderer.tsx:185-186`): comprometimento do CMS viraria stored XSS no site público.

**Divergências e estados notáveis**
- **UX-ANA-010** (P3, OBSOLETO/DIVERGENTE) — `SLUG_TO_PATH` mapeia `solucoes`, rota inexistente aqui (herança do gêmeo rmambiental; `cmsEdit.tsx:21`); navegação do editor cai no catch-all.
- `/contato` PARCIALMENTE IMPLEMENTADO: a árvore default define seções da página (`content.default.ts:125-128`) que nunca são montadas (ver UX-ANA-002).
- Catch-all renderiza a Home mantendo a URL inválida, sem 404 (`App.tsx:42-46`, **UX-ANA-007** P3) — um dos 5 comportamentos distintos apontados no transversal UX-NAV-006.

**Recomendações-chave**
- Preencher ao menos `contact.email` real no `DEFAULT_SITE`/CMS antes de divulgar, ou gate de build que falhe com canais vazios (UX-ANA-001, quick win).
- Renderizar `Contato.tsx` como a Home: `useContentTree` + `findPage('contato')` + `SectionRenderer` (UX-ANA-002).
- Trocar o import estático por `useSite()` no `BackToTop`, igual ao `WhatsAppFab` (UX-ANA-003, quick win).
- Remover as reduções `/70`–`/60` sobre `--muted` ou criar token `muted-2` ≥ 4,5:1 validado com axe (UX-ANA-004, quick win).
- Sanitizar `d.html` com allowlist no cliente ou documentar a sanitização server-side no contrato do endpoint público (UX-ANA-005).

**Notas (calibradas):**

| usab | IA/nav | a11y | DS | resp | estados | onboarding | perf |
|---|---|---|---|---|---|---|---|
| 3,5 | 3,5 | 4,0 | 4,5 | 4,0 | 3,5 | 3,5* | 3,5 |

\* Calibração converteu N/A→3,5: UX-ANA-005 (P2 rbac-segurança-percebida) sobrevive na dimensão e o gate same-origin coeso sustenta a nota.


### 7.15 AI Control Plane (`/ai-control`) — experiência-alvo (sem UI própria)

**Perfil.** API de governança de IA da plataforma (`apps/ai-control-plane/api`), **sem frontend** — por isso esta subseção não tem tabela de notas (superfície sem UI = sem scorecard); todo o conteúdo abaixo é **planejamento de experiência-alvo**, não avaliação de implementação atual. O usuário é o operador único da plataforma (persona `platform-admins`), em três tarefas: auditar custo/consumo, governar prompts (promote/rollback) e fechar o loop de qualidade (feedback + eval runs por app). O serviço expõe prompts versionados com activate/rollback (`apps/ai-control-plane/api/src/routes.js:79-97`), feedback summary (`routes.js:109-116`), eval runs (`routes.js:121-135`) e um `GET /v1/overview` declarado "para dashboards/console" (`routes.js:140-143`). O portal exclui o serviço da navegação (`portal/frontend/assets/portal.js:104-107`).

**O que a ausência de UI custa hoje.** O operador governa às cegas: busca no repo por `feedback/summary|eval-runs|/v1/overview` encontra apenas o próprio serviço, docs, specs e scripts de escrita — **nenhum dos GETs de leitura tem consumidor**. A escrita funciona (GymOps envia feedback fire-and-forget, `apps/gymops/apps/api/src/routes/ai/index.ts:557-574`): os dados entram e nunca saem. Consequências concretas:

- Promote/rollback de prompt — a operação mais perigosa da governança — é feito por **curl com token**, sem diff, preview ou histórico visual; o backend já devolve `previous` para rollback e nada consome (`routes.js:79-80`).
- Os requisitos `approved` REQ-AI-0011 (CSAT cross-app) e REQ-AI-0012 (registro de evals) ficam pela metade: a metade de leitura não tem superfície — investimento em coleta sem retorno.
- O overview "para dashboards/console" nunca chegou a um dashboard (`routes.js:140-141`).

**Fragmentação em 3 meias-UIs.** Para responder "quanto a IA gastou e como está a qualidade", o operador cruza mentalmente três painéis com escopos, moedas, gating e logins distintos, nenhum federado:

| Painel | Recorte | Evidência |
|---|---|---|
| SICAT AI Control Center (`/sistema/ai-control`) | app-scoped (só SICAT), admin; 10 painéis: custo, confirmações, prompts, evals, traces | `apps/sicat/frontend/src/router.js:318-324` |
| Reqhub aiusage | provider-scoped, gating `platform-admins` | seção ux-ia §2 (linha 26 do inventário) |
| Grafana `ai-platform` | métricas de infraestrutura | seção ux-ia §4 |

**Experiência-alvo recomendada (consolidar leitura, federar ação).** Uma aba **"IA" no DevOps Console** — que já é o painel read-only do operador — federando `GET /ai-control/v1/overview` + feedback/summary + eval-runs + o backend do aiusage do Reqhub, com visão por app (custo, thumbs, evals, prompts ativos) e deep-links para as UIs app-scoped existentes (SICAT ai-control) para as ações; links para Grafana/Langfuse; topologia documentada em `docs/ai-platform.md` (quem mostra o quê). Promote/rollback ganha tela dedicada: lista de versões, diff lado a lado, botão Promover com confirmação explícita (o backend já exige `confirmed:true`) e Rollback de 1 clique consumindo o `previous` da API. Dependência de produto declarada no backlog: decidir entre consolidar leitura no Console vs. frontend próprio do ai-control-plane (UX-AICP-001).

**Achados (severidades finais; estados = plano, não nota de implementação):**

- **UX-AICP-001 · P1 · NÃO INICIADO · CONFIRMADO** — Governança de IA sem superfície de leitura: os GETs do control-plane não têm nenhum consumidor; operador governa por curl (`apps/ai-control-plane/api/src/routes.js:140-141`). Esforço G; critérios: Console exibe overview/feedback/evals; operador não precisa de curl para leitura.
- **UX-AICP-002 · P2 · PARCIALMENTE IMPLEMENTADO · NÃO-VERIFICADO (P2 fora da amostra)** — Governança fragmentada em 3 meias-UIs (SICAT, Reqhub, Grafana) com gating e recortes distintos, sem federação (`apps/sicat/frontend/src/router.js:318-324`). Depende de UX-AICP-001; custo real da IA invisível no agregado.
- **UX-AICP-003 · P2 · NÃO INICIADO · NÃO-VERIFICADO (P2 fora da amostra)** — Promote/rollback de prompt sem UI de diff/preview: ativar a versão errada em produção é fácil e afeta todos os turnos do app até alguém notar (`apps/ai-control-plane/api/src/routes.js:79-80`). Esforço M, dentro da visão de governança de UX-AICP-001.

Nenhum achado UX-AICP foi rebaixado ou elevado na verificação (severidade final = original nos três); UX-AICP-001 foi verificado no código (veredicto CONFIRMADO), os P2 ficaram fora da amostra de verificação.


---

## 8. Problemas de integração entre Portal, Console e aplicações


A auditoria transversal de integração (prefixo UX-NAV, commit `a6c95ef`) mostra que a plataforma tem **duas malhas de navegação que não se encontram**. De um lado, a casca global `<platform-shell>` (`packages/platform-shell/shell.js`) — launcher com 7 destinos, identidade SSO, tema e deep-links testados — presente em apenas **4 superfícies**: Portal `/` (`portal/frontend/index.html:106`), DevOps Console (`console/frontend/src/App.jsx:259-263`), Reqhub (`apps/reqhub/frontend/index.html:18`) e Portal Recorder (`apps/portal-recorder/frontend/src/App.jsx:21`). Do outro, os **11 apps de produto** (sicat, gymops, rmambiental, zapbridge, imobia, contaviva-360, contaviva-pro, neuroevolui, besc, anarabottini, forge-pilot-v2), todos **fora** da casca e sem um único link de volta ao Portal ou de troca de produto — o hub é rua de mão única. No scorecard final essa fatia não tem linha própria (transversais entram como contexto, cf. `meta.metodo` do scorecard), mas as notas comentadas da seção transversal são as mais baixas da auditoria em navegação: usabilidade 2.5, ia_navegacao 2.5 e estados_feedback 2.0 na fatia de integração.

### 8.1 As duas malhas que não se encontram — UX-NAV-001 (P1, CONFIRMADO)

A casca se declara "fonte da verdade da navegação global" (`shell.js:15`), mas cobre 7 destinos de plataforma e **zero produtos** — e isso é fixado em teste: `assert.equal(activeSurfaceKey(SURFACES, '/sicat'), null)` (`shell.test.js:111`). Nos produtos, o retorno inexiste de fato: a sidebar do GymOps é 100% interna (`apps/gymops/apps/web/src/components/layout/sidebar.tsx:27-43,137-184`); o ZapBridge tem **0 ocorrências** de `NovaIT|nvit|platform-shell` em `web/src`; o único "voltar" do SICAT leva à home do próprio SICAT (`SicatTopbar.vue:90`). O Portal anuncia o ecossistema; quem entra num produto perde a plataforma. Trocar de produto é "apagar a URL e digitar outra" (jornada J-NAV-02). Esforço G; depende de UX-DS-007 e UX-PORTAL-008.

### 8.2 Sonda de saúde do launcher: falso-negativo estrutural — UX-NAV-002 (P1, CONFIRMADO)

Visto ao vivo (spot-check §Portal): o launcher marca **"fora"** Console, Reqhub, Portal Recorder e Keycloak — todos no ar atrás de SSO. Causa provada no código, elo a elo:

1. A sonda é `fetch(path, { method: 'HEAD', signal })` **sem `redirect: 'manual'`** (`shell.js:307`) — o 3xx nunca chega ao código.
2. `healthFromStatus` foi desenhada para tratar 3xx como vivo (`shell.js:80-84`), e o teste valida `301/302 → up` (`shell.test.js:56`) — **branch inalcançável no browser**.
3. As rotas de navegação respondem 302 para o login quando não autenticado (`console/k8s/ingressroute.yaml:69-71`; `auth-routes.yaml:36-38`).
4. O login vive em **outro domínio** (`OAUTH2_PROXY_LOGIN_URL` → `https://dev.nvit.com.br/...`, `oauth2-proxy.yaml:52-53`); a página do Keycloak não emite CORS para a origem → o fetch rejeita e cai no `catch { return 'down' }` (`shell.js:310`) → dot vermelho "fora".

Para o visitante anônimo (público-alvo da home) e qualquer usuário em `nvit.localhost`, **metade da plataforma parece "fora" estando saudável**; Grafana/Argo aparecem "no ar" só porque não têm o ForwardAuth de navegação na frente. Correção pequena (esforço P): sondar com `redirect: 'manual'` tratando `opaqueredirect` como `up`, ou sondar um endpoint público (ex.: `/devops/api/health`).

### 8.3 Login ancorado em `dev.nvit.com.br` — UX-NAV-003 (P1, CONFIRMADO)

Visto ao vivo: `http://nvit.localhost/devops` → `https://dev.nvit.com.br` ("Sign in to NovaIT"). No código, é impossível ser diferente: `OAUTH2_PROXY_REDIRECT_URL`, `COOKIE_DOMAINS`, `WHITELIST_DOMAINS` e `COOKIE_SECURE: "true"` fixos no domínio público (`oauth2-proxy.yaml:61-62,93-98`), além de `KC_HOSTNAME` (`platform/keycloak/keycloak.yaml:127-128`). O `rd` do "Entrar" da casca é um path **relativo** (`shell.js:263-264`), honrado no host do callback: quem clica "Entrar" em `nvit.localhost` é migrado de domínio e termina logado em `dev.nvit.com.br`, com cookie que jamais vale para o host local (domínio diferente + `Secure` sobre http). O host documentado como entrada de dev **não completa login** (J-NAV-03). O mesmo pino se repete no default do SICAT (`apps/sicat/frontend/src/services/keycloak.js:3`). Depende de decisão de produto: `nvit.localhost` segue sendo borda de login suportada?

### 8.4 Cinco modelos de auth e um "Sair" que não sai — UX-NAV-004 (P2, CONFIRMADO)

Coexistem: SSO de plataforma code-flow (Portal/Console/Reqhub/Portal Recorder); PKCE aditivo próprio no SICAT; **implicit flow** no ContaViva Pro (`AuthView.vue:97`, UX-CVPRO-011); email/senha + Google OAuth no GymOps (quebrado — UX-GYMOPS-001); login local sem recuperação de senha no BESC/ZapBridge (UX-BESC-012, UX-ZAP-016); SSO prometido sem fluxo no Imobia (UX-IMOBIA-016); e **nenhum** login no ContaViva 360/NeuroEvolui (UX-CV360-001, UX-NEURO-001). O "Sair" da casca (`/oauth2/sign_out`, `shell.js:274`) encerra apenas a sessão da borda — **nenhum produto é deslogado**. Operar 3 produtos no dia = 3+ sessões com expirações e telas de erro distintas. Esforço GG; recomendação: trilho único de adoção OIDC (o kit `oidc-kit` já existe) + convergência de protocolo (PKCE) e de rótulo ("Entrar com NovaIT").

### 8.5 404 sem padrão: cinco comportamentos — UX-NAV-006 (P2)

Para o mesmo evento (URL inválida), a plataforma responde de cinco formas: 404 real com rota de fuga só na borda/Portal (`portal/frontend/nginx.conf:80` + `404.html:47`); **miolo em branco** no SICAT — router sem catch-all (`apps/sicat/frontend/src/router.js:354-368`); Home renderizada com a URL errada mantida em Ana Rabottini/RM Ambiental (UX-ANA-007, UX-RMAMB-008); redirect silencioso no Imobia (UX-IMOBIA-018); hash inválido silenciosamente ignorado no Console (`App.jsx:141`). Nenhum app oferece retorno ao Portal no erro — justamente a rota de fuga que mais falta. Recomendação: componente 404 padrão no template da Forja (basePath preservado + CTA "início do app" e "Portal NovaIT").

### 8.6 Deep-links canônicos: referência positiva com lacuna de papel — UX-NAV-007 (P2) e UX-NAV-008 (P3)

A tabela `surfaceLink`/`productLinks` (`shell.js:32-59`) é o ponto alto da integração: formatos conferidos contra os roteadores reais (`/reqs/#/forge?product=` ↔ `app.js:2275-2277`; `/devops/#logs|publications|conteudo` ↔ hash-router do Console, `App.jsx:140-145`), gramática pura e testada (`shell.test.js:68-103`). O furo é de **papel**: `productLinks` empurra Logs/Publicações incondicionalmente (`shell.js:55-56`), mas o Console restringe essas seções a admin (`App.jsx:110-115`) — o member que segue o deep-link tem o destino silenciosamente descartado (`App.jsx:162-167`) ou tela em branco (UX-CONSOLE-006). O contexto viaja pela URL; o RBAC não. Há ainda três modos de abertura no mesmo launcher (UX-NAV-008): destino interno = `<button>` com `location.href`, sem href — sem middle-click/copiar link (`shell.js:216`); deep-link same-origin = sempre `target="_blank"` com glifo de externo (`shell.js:200`). Contraste positivo: os QUICK_LINKS do Console **são** escondidos de member (`App.jsx:249-252`) — o RBAC no handoff existe, só não chegou ao launcher.

### 8.7 Handoff Grafana / Argo CD / Keycloak (escopo: só acesso, SSO, contexto e retorno)

**Redesenhar essas ferramentas está fora do mandato desta auditoria** — o que se avalia é o contrato de chegada/aviso do lado da plataforma.

- **Grafana**: ida por nova aba (launcher `external:true` + QUICK_LINKS, `App.jsx:47-48`), retorno preservado — ok. Ressalva: `root_url` fixo no domínio público (`grafana-values.yaml:37`) → links internos gerados para `dev.nvit.com.br`; comportamento via `nvit.localhost` não verificado.
- **Argo CD — UX-NAV-005 (P2, CONFIRMADO, estado OBSOLETO/DIVERGENTE)**: launcher (`shell.js:22`) e Console (`App.jsx:47`) apontam `/argocd`, mas a doc canônica declara a rota quebrada ("`<base href>` quebrado → use port-forward", `platform/argocd/README.md:79`), enquanto `helm-values.yaml:116-118` já seta `rootpath`/`basehref` sugerindo mitigação. **Ponto a validar**: ou o clique entrega UI quebrada sem pista do runbook, ou os docs estão obsoletos — nos dois casos alguém é enganado. Esforço PP: validar uma vez e atualizar docs ou marcar o card com o hint do port-forward.
- **Keycloak — UX-NAV-009 (P3, inferido)**: o card "identidade (SSO)" leva à **raiz** do Keycloak (`shell.js:23`) — entrada do admin console, beco para não-admin; o destino útil ao usuário é o account console do realm (`/auth/realms/nvit/account`).

Relacionado: a identidade de Portal e Portal Recorder depende do backend do Console (`me-url="/devops/api/me"`, `portal/frontend/index.html:106`); console-backend fora = casca fail-soft mostra "Entrar" a um operador logado — UX-NAV-010 (P3).

### 8.8 Recomendações (ordem sugerida)

| # | Achado | Sev. | Esforço | Ação | Dependências |
|---|---|---|---|---|---|
| 1 | UX-NAV-002 | P1 | P | Sonda com `redirect:'manual'` (tratar `opaqueredirect` como up) ou endpoint público de health por superfície | — |
| 2 | UX-NAV-003 | P1 | M | Decidir: `dev.nvit.com.br` como única borda de login (esconder/avisar "Entrar" no host local) OU parametrizar oauth2-proxy/KC por host | decisão de produto sobre `nvit.localhost` |
| 3 | UX-NAV-001 | P1 | G | Contrato de retorno ao hub: variante mínima da casca para produtos ou link "Plataforma NovaIT" padronizado, semeado no golden path | UX-DS-007, UX-PORTAL-008 |
| 4 | UX-NAV-005 | P2 | PP | Validar `/argocd` uma vez; atualizar README/CLAUDE.md ou avisar no card | — |
| 5 | UX-NAV-007 | P2 | P | Filtrar `productLinks` por papel (a casca já tem `normalizeMe`) ou Console exibir "seção restrita a admin" | UX-CONSOLE-006 |
| 6 | UX-NAV-006 | P2 | M | Padrão de 404 no template da Forja com CTA de fuga ao Portal | UX-ANA-007, UX-RMAMB-008, UX-IMOBIA-018, UX-PORTAL-007 |
| 7 | UX-NAV-004 | P2 | GG | Roadmap de convergência OIDC via `oidc-kit`; curto prazo: rótulo e protocolo alinhados | UX-CVPRO-011, UX-IMOBIA-016, UX-CV360-001, UX-NEURO-001, UX-GYMOPS-001, UX-BESC-012, UX-ZAP-016 |
| 8 | UX-NAV-008/009/010 | P3 | PP–P | Launcher todo `<a href>` (`_blank` só p/ `external:true`); card Keycloak → account console; badge "identidade indisponível" no fail-soft | UX-PORTAL-003, UX-DS-005, UX-PORTAL-005 |

Nota de verificação: UX-NAV-001/002/003/004/005 têm veredicto CONFIRMADO; UX-NAV-006/007/008/009/010 ficaram fora da amostra de verificação viva (P2/P3), com evidência de código citada acima. Nenhum achado UX-NAV foi rebaixado, elevado ou recebeu ressalva no relatório de verificação.


---

## 9. Gaps do Design System e estratégia de adoção


A camada transversal de design (nota ponderada **3,43** — a11y 2.5, consistencia_ds 3.0, estados_feedback 4.5) tem um motor exemplar — fonte única `packages/design-tokens/tokens.json` + codegen-sync + drift-gate sempre-on (`design-tokens-gate.yml`, sem path-filter) — mas cobre **metade da frota**, e o documento que deveria governá-la descreve uma arquitetura que não existe. Esta seção consolida a matriz de adoção real verificada, os gaps com IDs finais e a estratégia de adoção incremental.

### 9.1 Matriz de adoção real (verificada arquivo a arquivo)

| Superfície | Tokens gerados | ui-vue | platform-shell | Evidência |
|---|---|---|---|---|
| sicat | sim (renderer próprio + tema Vuetify) | não | não | `frontend/src/styles/tokens.generated.css` + `plugins/vuetify-theme.generated.js` |
| rmambiental | sim (marca hand-authored) | não | não | `src/tokens.generated.css` (rota TARGETS) |
| anarabottini | sim (só claro, `"dark": null` declarado) | não | não | `src/tokens.generated.css` |
| contaviva-360 / pro / neuroevolui | sim (`--ui-*` via `brand.json`) | sim (kit sincronizado em `frontend/src/ui/`) | não (usam `UiAppShell`) | import de tokens + `ui/ui.css` no `main.js` |
| portal / console / reqhub / portal-recorder | via paleta `--p-*` | não | sim (`platform-shell.{js,css}` + tag) | portal: 30 refs `var(--p-*)` em `styles.css`; console: import no `main.jsx` |
| **gymops** | **fora** | fora | fora | Tailwind/shadcn próprio; `darkMode: ['class']` com bloco `.dark` **sem toggler** (dark morto) |
| **besc** | **fora** | fora | fora | CSS próprio (`--ink/--accent`); nem existe em `specs/products/` → invisível à descoberta |
| **zapbridge** | **fora** | fora | fora | paleta escura fixa hardcoded no `tailwind.config.js` |
| **imobia** | **fora** | fora | fora | `--im-*` fixo; adoção "Em F3+" declarada só em comentário de CSS |

Camadas prometidas e inexistentes: `packages/ui-react` e `ui-vanilla.css` — não há diretórios em `packages/`.

### 9.2 Gaps estruturais (IDs e severidades finais)

- **UX-DS-001 (P1) — doc canônico órfão e divergente.** `DESIGN_SYSTEM.md` apresenta camadas "B — ui-react (futuro)" e "C — ui-vanilla.css (futuro)" e manda componente novo nascer nelas; **não menciona** `ui-vue` (19 componentes reais em 3 apps) nem `platform-shell` (4 frontends). Grep por "DESIGN_SYSTEM" em `*.md` → zero referências: o doc está fora da ordem de leitura oficial. Quem segue o doc erra; quem acerta o faz por arqueologia do repo (J-DS-04).
- **UX-A11Y-003 (P1) — contraste de badges nas 2 raízes** (absorve UX-DS-002, marcado duplicado na verificação). Anti-padrão único: "cor crua do tom sobre tinta translúcida do próprio tom, validada — quando validada — contra o fundo errado". `forge-brand.mjs:118-120` valida `ensureContrast(..., surfaceRgb, 4.5)` contra a surface **pura**, mas `UiStatusBadge.vue:25-27` renderiza sobre `rgb(var(--ui-ok) / 0.16)` → contraste real medido 4,03:1 (ok) e 3,91:1 (warn) no light, texto 11.5px. Na raiz da plataforma, `renderers/platform.mjs` transcreve sem validar nada, e o mesmo par reprovado se propaga a portal/console/reqhub/portal-recorder (portal medido ao vivo: 2,8:1). Corrigir os 2 renderers + o badge conserta **7+ superfícies de uma vez**. A única família correta é a do sicat (`tokens.json > brands.sicat.css`, pares `status-*-bg/fg` tintados explícitos) — o modelo a copiar.
- **UX-A11Y-004 / UX-DS-004 (P2) — dark mode fragmentado.** 3 convenções de seletor entre renderers (`.dark` só; `[data-theme="dark"], .dark` + fallback do SO; `:root[data-theme='dark']` só) e **4 chaves de localStorage** (`nvit-theme`, `sicat.ui.theme`, `rmamb-theme`, `neuroevolui-theme`). Fato novo da verificação: o neuroevolui tem **2 togglers concorrentes** — `SettingsView.vue:825/:844` grava `neuroevolui-theme` enquanto o `UiAppShell` reidrata de `nvit-theme` → o tema ativado com toast de sucesso **reverte no reload**. O `DESIGN_SYSTEM.md` declara uma "estratégia única" que nenhuma família implementa.
- **UX-DS-003 (P2) — a garantia de AA está desligada do CI.** `forge-brand.test.mjs` (contraste por marca/ramp) não é executado por nenhum workflow — o gate roda `shell.test.js` e os testes do ui-vue, mas o `node --test` nunca alcança `packages/design-tokens/`. Uma mudança em `RAMPS`/`ensureContrast` quebra a garantia em silêncio. Quick win: 1 step.
- **UX-DS-007 (P2) — golden path não semeia o DS.** `templates/app-template` é 100% Helm e `scripts/new-app.ps1` não contém uma única referência a tokens/kit/shell; a adoção automática só existe pela rota da Forja (`discoverForgeApps`). Resultado observável: besc e zapbridge nasceram fora e nada os detectou — o gate só valida drift de arquivos **já gerados**.
- **UX-A11Y-002 (P1) — focus-trap triplicado sem repatriar.** O algoritmo correto foi escrito à mão 3 vezes (`UiModal.vue:30-40`, `apps/anarabottini/src/components/Modal.tsx:17-21`, `apps/reqhub/frontend/assets/app.js:2645`) enquanto 6+ superfícies seguem vazando foco — inclusive o drawer do próprio kit (UX-DS-013, P3). O `Modal.tsx` do anarabottini documenta ter extraído e consertado a mecânica do lightbox do rmambiental, e a correção nunca refluiu à origem (`SectionRenderer.tsx:292-295`): o monorepo melhora componentes por cópia e não repatria.
- Complementares no kit/casca: **UX-DS-005** (P2, `role="menu"` da casca sem interação de menu + foco perdido no Escape — propaga a 4 frontends), **UX-DS-006** (P2, alvos de toque: fechar do toast ~18×16px num toast de erro que persiste até fechar), **UX-DS-008** (P2, `UiDataTable` mobile sem o layout-card prometido no doc), **UX-DS-010** (P2, mínimo universal não viaja aos apps fora), **UX-DS-011/012/014** (P3: `var(--ui-radius)` inexistente no `UiFileDrop`; escalas estruturais duplicadas em `tokens.json` × array hardcoded do `forge-brand.mjs`; ContaViva 360/Pro usando o accent do `DEFAULT_BRAND` idêntico ao neon da casca).

### 9.3 O que deve ser universal × shell × componente × identidade por marca

Princípio da auditoria, explícito: **NÃO uniformizar a aparência dos produtos.** SICAT slate, rmambiental verde, anarabottini quente-só-claro (exceção *declarada* — bom exemplo), zapbridge WhatsApp-dark, gymops "Linear" monocromático e imobia petróleo/âmbar são identidades de marca legítimas. O que se universaliza é a mecânica, não a estética:

| Camada | Escopo | Conteúdo |
|---|---|---|
| **Universal (obrigatório em toda superfície)** | tokens semânticos + mínimos de a11y | foco visível (`ui.css:22-28` já pronto), `prefers-reduced-motion` kill-switch, status nunca só por cor, contraste AA por construção (par tintado), alvos de toque, chave única de tema `nvit-theme` + par de seletores `[data-theme]` + `.dark` (contrato dos renderers, modelo `platform.mjs:72-81`) |
| **Shell** | casca `platform-shell` + `UiAppShell` | launcher/navegação entre superfícies, identidade fail-soft, skip-link (falta nos dois — UX-A11Y-006), gestão de foco ao fechar (UX-DS-005/013) |
| **Componente reutilizável** | `ui-vue` (Vue) + receitas p/ React | `useFocusTrap` extraído do UiModal, primitiva de card/linha interativa (o `UiDataTable` já tem linha clicável acessível — ressalva da verificação ao UX-A11Y-001; falta a de card + grep-gate), `UiTabs`, live-region de chat (padrão do reqhub cmdk) |
| **Identidade por marca** | `brand.json` / marcas hand-authored / CSS próprio declarado | paleta, tipografia, tom — livre; exigência única: registrar o status no `DESIGN_SYSTEM.md` (dentro / identidade-própria-declarada / pendente) e cumprir o universal |

### 9.4 Estratégia de adoção incremental (3 estágios por app)

**Estágio 1 — tokens**: gerar `tokens.generated.css` da marca (hand-authored ou `brand.json`) e apontar as vars próprias do app para eles — a rota brownfield "transcrição zero mudança visual" do sicat prova que é seguro. **Estágio 2 — primitivas interativas**: adotar (Vue) ou copiar como receita (React) as primitivas de foco/trap/badge/tabs — é onde vivem os P0/P1 de a11y. **Estágio 3 — shell**: casca `platform-shell` (superfícies internas) ou `UiAppShell` (produtos), herdando tema, launcher e skip-link.

Ordem sugerida para os 4 de fora, ancorada em achados e custo:
1. **gymops** — maior densidade de achados de teclado da frota e dark morto (UX-DS-010); Tailwind facilita o estágio 1 (mapear `hsl(var(--...))` para tokens gerados); E2E existente (`apps/gymops/apps/web/e2e/`) barateia o gate.
2. **imobia** — único app sem nenhum dos três mínimos completos (sem reduced-motion, sem skip-link, sem `<main>` na área logada); a adoção "F3+" já está planejada em comentário — formalizá-la.
3. **besc** — pré-requisito administrativo primeiro: registrar em `specs/products/` (hoje invisível à descoberta); app claro simples, estágio 1 barato.
4. **zapbridge** — por último: identidade dark fixa legítima; exigir só o mínimo universal (declarar `color-scheme`, foco, status com rótulo) e a chave de tema se um dia houver claro.

Dependências: o estágio 2 depende das correções de fundação no kit (UX-A11Y-003 no gerador, `useFocusTrap`, primitiva de card — mapa correção→pacote→apps da seção de a11y); o estágio 3 nos apps React depende de decidir a receita (a casca é Web Component vanilla CSP-safe, já convive com React no console). O `new-app.ps1` deve passar a semear o estágio 1 automaticamente para serviço `frontend` (UX-DS-007).

### 9.5 Governança

- **Reescrever o `DESIGN_SYSTEM.md`** para a arquitetura real (A=tokens com 4 rotas de geração, B=ui-vue, C=platform-shell), apontar a regra de contribuição para `packages/ui-vue` e linká-lo em `docs/README.md`/`CLAUDE.md` (hoje: zero referências). Incluir a tabela de status de adoção por app — identidade própria vira **escolha visível, não acidente**.
- **Drift-gate existente como base**: acrescentar (a) o step `node --test packages/design-tokens/` (UX-DS-003); (b) teste de contraste do par **tintado** — teria pego UX-DS-002/UX-PORTAL-001 por construção; (c) check informativo listando apps com frontend fora do codegen (relatório, não bloqueio — UX-DS-007); (d) grep de tokens referenciados vs. emitidos no kit (UX-DS-011).
- **Regressão visual e a11y** (UX-DS-009, P2; UX-A11Y-005, P2 — hoje **0 execuções de axe em qualquer CI**): página-galeria estática dos 19 componentes ui-vue (variantes × 2 temas) + Playwright com `@axe-core/playwright` e screenshot-diff — um pipeline protege o kit inteiro e N apps; molde barato para estáticos já existe em `portal/frontend/test/markup.test.mjs`.
- **Critério de contribuição**: componente compartilhado novo nasce em `packages/ui-vue` (com par React documentado como receita quando necessário); correção feita numa cópia local **repatria** ao pacote de origem (lição do focus-trap, UX-A11Y-002); escala estrutural passa a ter fonte única de verdade (UX-DS-012).


---

## 10. Backlog priorizado de UX/UI

304 achados sobreviventes à verificação adversarial (10 P0 · 77 P1 · 138 P2 · 79 P3), ordenados por
prioridade **determinística**: `prio = peso_severidade × alcance ÷ peso_esforço`, com
peso_severidade P0=8 · P1=4 · P2=2 · P3=1; alcance 1–3 (1 + 1 se afeta múltiplas superfícies + 1 se
afeta ≥3 papéis ou "todos"); peso_esforço PP=1 · P=1,5 · M=2,5 · G=4 · GG=6. Empates: ID.
"QW" = quick win. A coluna Estado usa a taxonomia da seção 2. Detalhe completo (jornada, impactos,
critérios de aceite, método de validação) na subseção 10.2 para todos os P0/P1; para P2/P3, ver a
seção 7 do produto correspondente.

### 10.1 Backlog completo (ordenado por prioridade)


| # | ID | Produto | Sev | Esf | Prio | Papel afetado | Problema | Evidência | Estado | Dependências | QW |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | UX-CVPRO-001 | ContaViva Pro | P0 | P | 10.67 | todos | API de records sem autenticação: o front finge proteção que a API não impõe | `apps/contaviva-pro/api/src/server.js:25` | IMPLEMENTADO | API: adicionar requireAuth (e escopo real de tenant) aos endpoints /v1/records* |  |
| 2 | UX-CVPRO-002 | ContaViva Pro | P0 | P | 10.67 | todos | Editar registro sempre falha: UI chama PUT /v1/records/:id, rota que não existe no backend | `apps/contaviva-pro/frontend/src/api.js:34` | PARCIALMENTE IMPLEMENTADO | API: criar PUT /v1/records/:id (ou remover rota/botão de edição do front) |  |
| 3 | UX-GYMOPS-001 | GymOps | P0 | P | 10.67 | todos | Login via Google/SSO nunca resolve organizationId/papel — app abre vazio e sem explicação | `apps/gymops/apps/web/src/app/(auth)/auth/callback/page.tsx:31-34` | PARCIALMENTE IMPLEMENTADO | API: /auth/consume (ou um /me/context) precisa devolver organizationId/role/primaryUnitId como o /auth/login |  |
| 4 | UX-IMOBIA-001 | Imobia | P0 | P | 10.67 | todos | Detalhes de todos os módulos abrem só por clique de mouse (cards/linhas sem teclado) | `apps/imobia/frontend/src/views/app/Imoveis.vue:89` | IMPLEMENTADO | — |  |
| 5 | UX-A11Y-003 | A11y plataforma | P1 | P | 8 | todos | Badges de status reprovam AA nas 2 raízes de tokens pelo mesmo anti-padrão: cor crua do tom sobre tinta do próprio tom, sem validação contra o fundo tintado | `packages/design-tokens/renderers/platform.mjs:33-35` | IMPLEMENTADO | UX-PORTAL-001; UX-PREC-006; UX-DS-002 | ✔ |
| 6 | UX-CV360-003 | ContaViva 360 | P1 | PP | 8 | todos | "Marcar como concluído" falha em silêncio (catch vazio) e sem confirmação nos 4 dashboards | `apps/contaviva-360/frontend/src/views/DashboardClientePfView.vue:140-145` | IMPLEMENTADO | — | ✔ |
| 7 | UX-CV360-004 | ContaViva 360 | P1 | PP | 8 | todos | Erro na detecção de papel cai silenciosamente no dashboard PF; estado de erro é código morto | `apps/contaviva-360/frontend/src/views/DashboardView.vue:2-4` | IMPLEMENTADO | — | ✔ |
| 8 | UX-CV360-006 | ContaViva 360 | P1 | PP | 8 | todos | Tokens inexistentes (--ui-primary/--ui-radius) e triplets crus quebram o estado ativo e bordas nas telas financeiras | `apps/contaviva-360/frontend/src/views/CashFlowView.vue:56` | IMPLEMENTADO | — | ✔ |
| 9 | UX-CV360-007 | ContaViva 360 | P1 | PP | 8 | cliente_pj, todos | Filtros de AP/AR e período do Dashboard Financeiro sem rótulo acessível; datas De/Até indistinguíveis | `apps/contaviva-360/frontend/src/views/AccountsPayableView.vue:16-17` | IMPLEMENTADO | — | ✔ |
| 10 | UX-CVPRO-004 | ContaViva Pro | P1 | PP | 8 | todos | Sessão expirada deixa o usuário numa tela morta: sem redirecionamento para /login | `apps/contaviva-pro/frontend/src/router.js:30` | PARCIALMENTE IMPLEMENTADO | — | ✔ |
| 11 | UX-GYMOPS-006 | GymOps | P1 | PP | 8 | todos | Convite valida senha mínima 6 no cliente e placeholder diz 6, mas a API exige 8 | `apps/gymops/apps/web/src/app/(auth)/invite/[token]/page.tsx:54` | IMPLEMENTADO | — | ✔ |
| 12 | UX-NAV-002 | Integração/Navegação | P1 | P | 8 | todos | Sonda de saúde do launcher: falso-negativo 'fora' para toda superfície atrás de SSO | `packages/platform-shell/shell.js:307-310` | IMPLEMENTADO | — | ✔ |
| 13 | UX-NEURO-003 | NeuroEvolui | P1 | PP | 8 | professional, clinic_manager, owner | Desativar/Reativar paciente quebrado: confirm.ask não é função (useConfirm retorna a função ask) | `apps/neuroevolui/frontend/src/views/PatientListView.vue:327` | IMPLEMENTADO | — | ✔ |
| 14 | UX-NEURO-004 | NeuroEvolui | P1 | PP | 8 | professional, clinic_manager, owner | Cadastro de paciente descarta silenciosamente CPF, gênero e referência externa | `apps/neuroevolui/frontend/src/views/PatientCreateView.vue:531-538` | IMPLEMENTADO | API: decidir se gender/external_ref entram no schema de patients ou saem do form |  |
| 15 | UX-PORTAL-001 | Portal | P1 | PP | 8 | todos | Badges de status 'exige login'/'no ar' reprovam contraste AA no tema claro (2,8:1) | `portal/frontend/assets/styles.css:595-604` | IMPLEMENTADO | — | ✔ |
| 16 | UX-RMAMB-002 | RM Ambiental | P1 | PP | 8 | todos | CLAUDE.md e docs/status.md descrevem conteúdo/arquivos que não existem mais no código | `apps/rmambiental/CLAUDE.md:56-58` | OBSOLETO/DIVERGENTE | — | ✔ |
| 17 | UX-GYMOPS-002 | GymOps | P0 | M | 6.4 | todos | Abrir atividade é impossível por teclado: cards são div onClick e linhas são tr onClick (WCAG 2.1.1 A) | `apps/gymops/apps/web/src/components/activities/ActivityCard.tsx:18-23` | IMPLEMENTADO | — |  |
| 18 | UX-NEURO-001 | NeuroEvolui | P0 | M | 6.4 | todos | SPA operacional sem guard nem fluxo de login; usuário sem sessão fica sem caminho de entrada | `apps/neuroevolui/frontend/src/main.js:8-9` | IMPLEMENTADO | produto: definir fluxo de login (borda oauth2-proxy com redirect ou botão PKCE padrão SICAT) |  |
| 19 | UX-A11Y-001 | A11y plataforma | P0 | G | 6 | todos | Padrão sistêmico 'clicável fantasma': interação primária de 5+ produtos é div/tr/article onClick e a plataforma não tem primitiva nem gate que o impeça | `packages/ui-vue/src/index.js:3-21` | IMPLEMENTADO | UX-GYMOPS-002; UX-GYMOPS-009; UX-GYMOPS-010; UX-IMOBIA-001; UX-CONSOLE-001; UX-CONSOLE-004; UX-CV360-008; UX-ZAP-001; UX-REQHUB-001 |  |
| 20 | UX-BESC-003 | BESC | P1 | P | 5.33 | todos | Ajuda pública descreve o sistema pré-evolução ('Não tem login') e ignora marketplace/papéis | `apps/besc/frontend/src/pages/Ajuda.jsx:78` | OBSOLETO/DIVERGENTE | — |  |
| 21 | UX-CONSOLE-002 | Console | P1 | P | 5.33 | todos | Modais e drawers sem focus trap nem devolução de foco ao fechar | `console/frontend/src/components/Modal.jsx:26-29` | IMPLEMENTADO | — |  |
| 22 | UX-CV360-005 | ContaViva 360 | P1 | P | 5.33 | todos | Identidade invisível: /me não retorna email e o shell nunca mostra usuário, papel ou logout | `apps/contaviva-360/api/src/server.js:33` | PARCIALMENTE IMPLEMENTADO | API: incluir email/nome no GET /me (hoje retorna role/user/tenantId) |  |
| 23 | UX-CVPRO-003 | ContaViva Pro | P1 | P | 5.33 | todos | Sessão morre a cada ~15 min: o 401 destrói o refresh token em vez de usá-lo | `apps/contaviva-pro/api/src/auth.js:19-20` | PARCIALMENTE IMPLEMENTADO | — |  |
| 24 | UX-DOCS-001 | Docs↔código | P1 | P | 5.33 | operador, agente-claude | Vitrine da Forja apresenta contaviva-pro como not_started/0 REQs com o app no ar sob Argo | `specs/baseline/products.json:86-91` | OBSOLETO/DIVERGENTE | — | ✔ |
| 25 | UX-DS-001 | Design System | P1 | P | 5.33 | operador-dev da plataforma | DESIGN_SYSTEM.md canônico descreve camadas inexistentes (ui-react/ui-vanilla) e omite ui-vue/platform-shell | `DESIGN_SYSTEM.md:26-27` | OBSOLETO/DIVERGENTE | — | ✔ |
| 26 | UX-GYMOPS-007 | GymOps | P1 | P | 5.33 | todos | Sessão expirada sem tratamento global: usuário fica preso em 'Verifique sua conexão' com retry inútil | `apps/gymops/apps/web/src/lib/api.ts:55-58` | PARCIALMENTE IMPLEMENTADO | — |  |
| 27 | UX-IMOBIA-002 | Imobia | P1 | P | 5.33 | todos | Modal (usado em todos os fluxos de criação) sem focus-trap, ESC nem role=dialog | `apps/imobia/frontend/src/components/Modal.vue:6-11` | IMPLEMENTADO | — |  |
| 28 | UX-IMOBIA-003 | Imobia | P1 | P | 5.33 | todos | Falha de carregamento de lista vira empty state enganoso (try/finally sem catch) | `apps/imobia/frontend/src/views/app/Imoveis.vue:25-31` | IMPLEMENTADO | — |  |
| 29 | UX-IMOBIA-005 | Imobia | P1 | P | 5.33 | todos | Docs declaram kit ui-vue sincronizado (F3+) e fases 'verificadas'; código não tem ui-vue nem testes | `apps/imobia/CLAUDE.md:30` | OBSOLETO/DIVERGENTE | produto: decidir se --im-* vira oficial ou se sincroniza o ui-vue |  |
| 30 | UX-IMOBIA-007 | Imobia | P1 | P | 5.33 | todos | Sessão expirada durante o uso não redireciona nem explica (401 vira alert/vazio) | `apps/imobia/frontend/src/api.js:20` | NÃO INICIADO | — |  |
| 31 | UX-NEURO-002 | NeuroEvolui | P1 | P | 5.33 | todos | 8 telas vivas navegam para 6 rotas inexistentes (/revenue, /jobs, /transactions, /dashboard...) | `apps/neuroevolui/frontend/src/views/NotificationPreferenceCreateView.vue:332` | IMPLEMENTADO | — | ✔ |
| 32 | UX-NEURO-005 | NeuroEvolui | P1 | P | 5.33 | professional, clinic_manager, owner | Vocabulários de status divergentes (pt vs en) entre telas e backend; cancelar não libera a agenda | `apps/neuroevolui/frontend/src/views/PatientCreateView.vue:414-418` | IMPLEMENTADO | API: declarar o enum canônico (en) e validar status no backend |  |
| 33 | UX-NEURO-007 | NeuroEvolui | P1 | P | 5.33 | todos | 401 e 403 tratados identicamente como 'Acesso restrito'; sessão expirada sem reautenticação | `apps/neuroevolui/frontend/src/views/DashboardView.vue:384-386` | IMPLEMENTADO | UX-NEURO-001 |  |
| 34 | UX-PREC-001 | Portal Recorder | P0 | P | 5.33 | operador | Keyboard trap no canvas do screencast: preventDefault em toda tecla, sem saída por teclado | `apps/portal-recorder/frontend/src/views/CaptureView.jsx:198-202` | IMPLEMENTADO | — |  |
| 35 | UX-QA-001 | QA/Regressão | P1 | P | 5.33 | operador-dev da plataforma | Console, imobia, besc/frontend e zapbridge/web ficam fora de TODOS os workflows de CI (nem lint/build) | `.github/workflows/ci-apps.yml:73-74` | NÃO INICIADO | — | ✔ |
| 36 | UX-REQHUB-002 | Reqhub | P1 | P | 5.33 | todos | Meta-docs declaram app read-only de 6 telas, mas a UI dispara launch com auto-merge e exclusão total de projeto | `apps/reqhub/README.md:11-14` | OBSOLETO/DIVERGENTE | — |  |
| 37 | UX-SICAT-001 | SICAT | P1 | P | 5.33 | generator, receiver, carrier | CTAs do dashboard navegam com ?focus= que nenhuma tela consome | `apps/sicat/frontend/src/features/dashboard/DashboardView.vue:127` | PARCIALMENTE IMPLEMENTADO | — | ✔ |
| 38 | UX-ZAP-007 | ZapBridge | P1 | P | 5.33 | todos | devops.yaml/CLAUDE.md/README apontam o frontend legado (Expo) como build do deploy | `apps/zapbridge/devops.yaml:23-25` | OBSOLETO/DIVERGENTE | — |  |
| 39 | UX-A11Y-002 | A11y plataforma | P1 | M | 4.8 | todos | Focus-trap de diálogo: o algoritmo correto existe TRIPLICADO (UiModal, anarabottini, reqhub) e 6+ superfícies seguem com modais vazando foco | `packages/ui-vue/src/components/UiModal.vue:30-33` | PARCIALMENTE IMPLEMENTADO | UX-CONSOLE-002; UX-GYMOPS-004; UX-IMOBIA-002; UX-SICAT-015; UX-ZAP-014; UX-RMAMB-005; UX-DS-013 |  |
| 40 | UX-AI-001 | UX de IA | P1 | M | 4.8 | todos | Cadeia rascunho→confirmação humana quebra na UI em 3 apps cujo backend a implementa | `apps/neuroevolui/frontend/src/views/AssistantView.vue:864-866` | PARCIALMENTE IMPLEMENTADO | UX-NEURO-008; UX-CV360-009; UX-ZAP-005 |  |
| 41 | UX-NAV-003 | Integração/Navegação | P1 | M | 4.8 | visitante-anonimo, platform-admins, project-members | Login SSO ancorado em dev.nvit.com.br: 'Entrar' em nvit.localhost cruza domínio e nunca retorna logado | `console/k8s/auth/oauth2-proxy.yaml:61-62` | IMPLEMENTADO | produto: decidir se nvit.localhost segue sendo borda de login suportada |  |
| 42 | UX-A11Y-006 | A11y plataforma | P2 | P | 4 | todos | Skip-link e landmarks em mosaico: 6 superfícies têm, 8 não — incluindo o UiAppShell do kit (3 apps de uma vez); imobia sem <main> na área logada | `apps/imobia/frontend/src/layouts/AppShell.vue:24` | PARCIALMENTE IMPLEMENTADO | UX-RMAMB-007; UX-CVPRO-012; UX-NEURO-013; UX-SICAT-009 | ✔ |
| 43 | UX-AI-003 | UX de IA | P2 | P | 4 | todos | Nenhuma das 9 superfícies conversacionais declara falibilidade da IA — nem nos domínios regulados | `apps/neuroevolui/frontend/src/views/AssistantView.vue:459` | NÃO INICIADO | UX-SICAT-007; UX-CVPRO-016 | ✔ |
| 44 | UX-AI-009 | UX de IA | P2 | P | 4 | todos | Fontes/citacoes produzidas pelo backend e descartadas pela UI em 2 apps (transparência morta no contrato) | `apps/zapbridge/web/src/api/ai.ts:21` | PARCIALMENTE IMPLEMENTADO | UX-CV360-009 | ✔ |
| 45 | UX-ANA-001 | Ana Rabottini | P1 | PP | 4 | visitante | Fallback com canais de contato vazios mata a jornada de conversão | `apps/anarabottini/src/lib/site.ts:28-32` | PARCIALMENTE IMPLEMENTADO | produto: obter e-mail/WhatsApp reais de Ana (CLAUDE.md armadilha 3) | ✔ |
| 46 | UX-ANA-004 | Ana Rabottini | P2 | PP | 4 | todos | Contraste abaixo de AA em textos atenuados por opacidade (muted/70 e placeholders /60) | `apps/anarabottini/src/components/Footer.tsx:96-98` | IMPLEMENTADO | — | ✔ |
| 47 | UX-BESC-006 | BESC | P2 | PP | 4 | manager, admin, todos | Tab-rails sem semântica de abas nem aria-current/aria-selected | `apps/besc/frontend/src/pages/CaseDetail.jsx:101-108` | IMPLEMENTADO | — | ✔ |
| 48 | UX-BESC-007 | BESC | P2 | PP | 4 | todos | Buscas e selects de filtro sem nome acessível (placeholder-only) | `apps/besc/frontend/src/pages/Dashboard.jsx:76-77` | IMPLEMENTADO | — | ✔ |
| 49 | UX-BESC-011 | BESC | P2 | PP | 4 | lawyer, judge, manager | Nav 'Auditoria' e guard da rota usam permissões diferentes; breadcrumbs de gestão apontam /casos | `apps/besc/frontend/src/App.jsx:222` | IMPLEMENTADO | — | ✔ |
| 50 | UX-CONSOLE-001 | Console | P1 | PP | 4 | project-members, platform-admins | Card do kanban não é focável nem operável por teclado (não abre o detalhe) | `console/frontend/src/components/MetaProjects.jsx:62-72` | IMPLEMENTADO | — |  |
| 51 | UX-CONSOLE-004 | Console | P1 | PP | 4 | project-members, platform-admins | Reordenação de seções do portal só por arrastar — sem alternativa de teclado | `console/frontend/src/components/ContentEditor.jsx:349-353` | IMPLEMENTADO | — |  |
| 52 | UX-CV360-001 | ContaViva 360 | P0 | G | 4 | todos | SPA operacional inteira e API por papel acessíveis sem login, guard ou autoridade | `apps/contaviva-360/frontend/src/main.js:8-9` | IMPLEMENTADO | API: sessão OIDC real ou ForwardAuth na borda (bloco oidc-sessão declarado); produto: definir fluxo de login |  |
| 53 | UX-CV360-008 | ContaViva 360 | P1 | PP | 4 | contador, manager | Painel do Contador: cartões de cliente e grupos de documentos são divs clicáveis sem teclado | `apps/contaviva-360/frontend/src/views/DashboardContadorView.vue:13-18` | IMPLEMENTADO | — | ✔ |
| 54 | UX-CV360-011 | ContaViva 360 | P2 | PP | 4 | todos | Cabeçalhos marcados como sortable não fazem nada em nenhuma tabela | `apps/contaviva-360/frontend/src/ui/components/UiDataTable.vue:99-100` | PARCIALMENTE IMPLEMENTADO | — | ✔ |
| 55 | UX-CVPRO-006 | ContaViva Pro | P1 | PP | 4 | admin | Troca de papel sem confirmação e sem proteção contra auto-rebaixamento (revoga a própria sessão) | `apps/contaviva-pro/frontend/src/views/AdminUsuariosView.vue:101-104` | IMPLEMENTADO | API: recusar auto-rebaixamento no PATCH /v1/users/:id (espelhar a proteção do DELETE) |  |
| 56 | UX-CVPRO-007 | ContaViva Pro | P2 | PP | 4 | todos | Coluna 'Título' anuncia ordenação (ícone, cursor, aria-sort) que não está ligada a nada | `apps/contaviva-pro/frontend/src/views/ResourceListView.vue:16` | PARCIALMENTE IMPLEMENTADO | — | ✔ |
| 57 | UX-DOCS-007 | Docs↔código | P1 | PP | 4 | agente-claude, operador | imobia: CLAUDE.md declara kit ui-vue 'sincronizado em F3+' com F8 entregue, mas o frontend nunca o adotou | `apps/imobia/CLAUDE.md:30` | OBSOLETO/DIVERGENTE | — | ✔ |
| 58 | UX-DS-003 | Design System | P2 | PP | 4 | operador-dev da plataforma | forge-brand.test.mjs (garantia de contraste AA) não roda em nenhum workflow de CI | `.github/workflows/design-tokens-gate.yml:38-42` | PARCIALMENTE IMPLEMENTADO | — | ✔ |
| 59 | UX-DS-005 | Design System | P2 | P | 4 | todos | Casca global: role=menu sem interação de menu e foco perdido ao fechar com Escape | `packages/platform-shell/shell.js:168` | IMPLEMENTADO | — | ✔ |
| 60 | UX-DS-006 | Design System | P2 | P | 4 | todos | Alvos de toque do kit ui-vue abaixo do mínimo (fechar toast ~18px); casca faz bump mobile, kit não | `packages/ui-vue/src/components/UiToast.vue:34` | IMPLEMENTADO | — | ✔ |
| 61 | UX-GYMOPS-011 | GymOps | P2 | PP | 4 | owner, org_manager, unit_manager, area_leader, executor | Busca da Central dispara uma request por tecla (sem debounce) e reinicia a páginação | `apps/gymops/apps/web/src/app/(app)/activities/page.tsx:420-424` | IMPLEMENTADO | — | ✔ |
| 62 | UX-GYMOPS-012 | GymOps | P2 | PP | 4 | owner, org_manager, unit_manager, area_leader | 'Restringir' atividade mostra toast de sucesso antes do servidor responder | `apps/gymops/apps/web/src/components/activities/ActivityDrawer.tsx:269-272` | IMPLEMENTADO | — | ✔ |
| 63 | UX-GYMOPS-013 | GymOps | P2 | PP | 4 | todos | Marcar item de checklist e excluir anexo falham em silêncio (mutations sem onError) | `apps/gymops/apps/web/src/components/activities/ActivityDrawer.tsx:146-153` | IMPLEMENTADO | — | ✔ |
| 64 | UX-GYMOPS-014 | GymOps | P2 | PP | 4 | todos | Excluir anexo não pede confirmação (destrutivo em 1 clique), enquanto remover checklist confirma | `apps/gymops/apps/web/src/components/activities/ActivityDrawer.tsx:490-495` | IMPLEMENTADO | — | ✔ |
| 65 | UX-GYMOPS-018 | GymOps | P2 | PP | 4 | todos | Selects de filtro sem rótulo acessível em /units/:id e na Central (WCAG 1.3.1/4.1.2) | `apps/gymops/apps/web/src/app/(app)/units/[id]/page.tsx:209-213` | IMPLEMENTADO | — | ✔ |
| 66 | UX-IMOBIA-008 | Imobia | P2 | PP | 4 | todos | Anti-duplo-submit ausente em Vistorias, Corbam, Financeiro e forms inline | `apps/imobia/frontend/src/views/app/Vistorias.vue:19-22` | PARCIALMENTE IMPLEMENTADO | — | ✔ |
| 67 | UX-IMOBIA-010 | Imobia | P2 | PP | 4 | todos | Classe .im-linkbtn usada em 19 botões nunca foi definida no CSS | `apps/imobia/frontend/src/styles.css:274` | IMPLEMENTADO | — | ✔ |
| 68 | UX-IMOBIA-012 | Imobia | P2 | PP | 4 | todos | Tabelas de 5-6 colunas sem contêiner de overflow quebram a viewport em 375px | `apps/imobia/frontend/src/styles.css:220` | IMPLEMENTADO | — | ✔ |
| 69 | UX-IMOBIA-015 | Imobia | P2 | PP | 4 | todos | Chat: botão de envio sem nome acessível, stream sem aria-live, sem cancelar/refazer | `apps/imobia/frontend/src/views/app/Assistente.vue:88` | IMPLEMENTADO | — | ✔ |
| 70 | UX-NAV-005 | Integração/Navegação | P2 | PP | 4 | platform-admins | Handoff do Argo CD: launcher e Console apontam /argocd que a doc canonica declara quebrada (base href) | `packages/platform-shell/shell.js:22` | OBSOLETO/DIVERGENTE | — | ✔ |
| 71 | UX-NEURO-013 | NeuroEvolui | P2 | PP | 4 | todos | Sem skip-link para o conteúdo (WCAG 2.4.1) num shell com topo + sidebar de 14 itens | `apps/neuroevolui/frontend/src/ui/components/UiAppShell.vue:3-5` | NÃO INICIADO | — | ✔ |
| 72 | UX-NEURO-016 | NeuroEvolui | P2 | PP | 4 | todos | Mini-calendário usa role=grid sem contrato de teclado (setas/tabindex gerenciado) | `apps/neuroevolui/frontend/src/views/DashboardView.vue:158` | IMPLEMENTADO | — |  |
| 73 | UX-PREC-003 | Portal Recorder | P1 | PP | 4 | operador | 401 de sessão OIDC expirada é reportado como problema do PORTAL_REC_TOKEN | `apps/portal-recorder/frontend/src/api.js:103-104` | IMPLEMENTADO | — | ✔ |
| 74 | UX-REQHUB-007 | Reqhub | P2 | PP | 4 | todos | Falha no carregamento inicial da baseline sem ação de recuperação | `apps/reqhub/frontend/assets/app.js:3129-3131` | PARCIALMENTE IMPLEMENTADO | — | ✔ |
| 75 | UX-RMAMB-001 | RM Ambiental | P1 | PP | 4 | visitante | Labels do formulário de contato sem associação programática (htmlFor/id) | `apps/rmambiental/src/components/ContactSection.tsx:58-59` | IMPLEMENTADO | — | ✔ |
| 76 | UX-SICAT-007 | SICAT | P2 | PP | 4 | generator, receiver, carrier | Sem disclosure de conteúdo gerado por IA nas superfícies conversacionais | `apps/sicat/frontend/src/components/conversation/InAppCopilotAssistant.vue:394` | NÃO INICIADO | — |  |
| 77 | UX-SICAT-009 | SICAT | P2 | PP | 4 | todos | <main> aninhado: SicatAppShell e SicatPageLayout declaram ambos o landmark | `apps/sicat/frontend/src/components/shell/SicatAppShell.vue:103-106` | IMPLEMENTADO | — | ✔ |
| 78 | UX-ZAP-004 | ZapBridge | P1 | PP | 4 | usuário | 'Desconectar aparelho' executa sem confirmação ação destrutiva que expurga dados de IA | `apps/zapbridge/web/src/pages/SettingsPage.tsx:62` | IMPLEMENTADO | — | ✔ |
| 79 | UX-AI-002 | UX de IA | P1 | M | 3.2 | todos | Auto-reply do ZapBridge age em nome do usuário sem superfície de controle/observacao na web | `apps/zapbridge/server/src/modules/ai/hooks.ts:57-59` | PARCIALMENTE IMPLEMENTADO | UX-ZAP-006 |  |
| 80 | UX-BESC-001 | BESC | P1 | M | 3.2 | lawyer, judge, manager | Fluxo de convite de auditores sem tela de resgate no frontend | `apps/besc/api/src/foundation/auth.js:227` | PARCIALMENTE IMPLEMENTADO | — |  |
| 81 | UX-CV360-009 | ContaViva 360 | P1 | M | 3.2 | todos | Assistente descarta draft/citations/grounded da resposta; confirmação humana de rascunho sem UI | `apps/contaviva-360/frontend/src/views/AiAssistantView.vue:112` | PARCIALMENTE IMPLEMENTADO | — |  |
| 82 | UX-DOCS-005 | Docs↔código | P1 | M | 3.2 | operador, agente-claude | contaviva-360: visao promete 7 perfis, REQ deployed exige OIDC/4 papeis, código tem 3 papeis sem login | `specs/baseline/products.json:38` | OBSOLETO/DIVERGENTE | produto: decidir entre implementar OIDC/papeis ou rebaixar status e versionar o REQ (major) |  |
| 83 | UX-GYMOPS-004 | GymOps | P1 | M | 3.2 | todos | ActivityDrawer e modais artesanais sem role=dialog, focus trap ou Esc (WCAG 2.4.3/2.1.2 AA) | `apps/gymops/apps/web/src/components/activities/ActivityDrawer.tsx:197-202` | IMPLEMENTADO | — |  |
| 84 | UX-GYMOPS-005 | GymOps | P1 | M | 3.2 | todos | Ativar push trava para sempre: navigator.serviceWorker.ready sem nenhum service worker registrado | `apps/gymops/apps/web/src/app/(app)/settings/page.tsx:107-111` | PARCIALMENTE IMPLEMENTADO | — |  |
| 85 | UX-IMOBIA-006 | Imobia | P1 | M | 3.2 | todos | Nenhuma entidade pode ser editada ou excluída pela UI (API tem PUT/DELETE sem chamadores) | `apps/imobia/frontend/src/api.js:48-49` | PARCIALMENTE IMPLEMENTADO | — |  |
| 86 | UX-NEURO-009 | NeuroEvolui | P1 | M | 3.2 | professional, clinic_manager, owner | Agenda carrega só a 1ª página (50) como se fosse o total; filtros de servidor são ignorados | `apps/neuroevolui/frontend/src/views/ConsultationListView.vue:806-809` | IMPLEMENTADO | API: implementar filtros server-side de consultations (patient_id/professional_id/período) ou expor pageSize adequado |  |
| 87 | UX-QA-003 | QA/Regressão | P1 | M | 3.2 | operador-dev da plataforma | Gate de frontend da Forja é só `vite build`: NeuroEvolui passou verde com 6 rotas mortas e ação quebrada | `.github/workflows/forge-tests.yml:82` | PARCIALMENTE IMPLEMENTADO | UX-NEURO-002; UX-NEURO-003; UX-NEURO-008; UX-CV360-010; UX-DS-007 |  |
| 88 | UX-QA-004 | QA/Regressão | P1 | M | 3.2 | operador-dev da plataforma | Contrato front↔back sem verificador em nenhuma esteira: validate:openapi cobre só API↔spec (e falta em 2 apps) | `apps/neuroevolui/api/package.json:10-11` | PARCIALMENTE IMPLEMENTADO | UX-CVPRO-002; UX-NEURO-004; UX-NEURO-005; UX-NEURO-014; UX-GYMOPS-001; UX-GYMOPS-006 |  |
| 89 | UX-REQHUB-001 | Reqhub | P1 | M | 3.2 | todos | Linhas de tabela com role="button" destroem a semântica de tabela para leitores de tela | `apps/reqhub/frontend/assets/app.js:108-109` | IMPLEMENTADO | — |  |
| 90 | UX-SICAT-002 | SICAT | P1 | M | 3.2 | generator, receiver, carrier | 'Resumo de hoje' conta status sobre a 1ª página de 10 manifestos | `apps/sicat/frontend/src/features/dashboard/DashboardView.vue:184-191` | IMPLEMENTADO | API: /v1/dashboard/overview expor contagem por status do dia (ou o front consultar totalItems por situação) |  |
| 91 | UX-AI-010 | UX de IA | P3 | PP | 3 | todos | Jargao técnico de engenharia na copy voltada ao usuário ('fail-closed', 'policy consultiva') — inclusive no padrão-ouro | `apps/neuroevolui/frontend/src/views/AssistantView.vue:64` | IMPLEMENTADO | UX-SICAT-005 | ✔ |
| 92 | UX-AI-011 | UX de IA | P3 | PP | 3 | todos | 'Limpar' conversa sem confirmação nos dois ContaViva — drift do scaffold vs confirmação danger no NeuroEvolui | `apps/contaviva-360/frontend/src/views/AiAssistantView.vue:129` | IMPLEMENTADO | UX-CV360-016; UX-CVPRO-016 | ✔ |
| 93 | UX-DS-011 | Design System | P3 | PP | 3 | todos | UiFileDrop referencia var(--ui-radius) que nenhum gerador emite (cantos ficam retos) | `packages/ui-vue/src/components/UiFileDrop.vue:54` | IMPLEMENTADO | — | ✔ |
| 94 | UX-DS-014 | Design System | P3 | PP | 3 | todos | ContaViva 360 e Pro usam o accent do DEFAULT_BRAND (#4f46e5), idêntico ao neon da casca | `specs/products/contaviva-360/brand.json:1-4` | IMPLEMENTADO | produto: decidir a cor de marca da família ContaViva |  |
| 95 | UX-NAV-001 | Integração/Navegação | P1 | G | 3 | todos | Duas malhas de navegação: 11 apps de produto sem retorno ao Portal nem troca de produto | `packages/platform-shell/shell.js:15-16` | NÃO INICIADO | UX-DS-007; UX-PORTAL-008 |  |
| 96 | UX-NAV-008 | Integração/Navegação | P3 | PP | 3 | todos | Launcher com três modos de abertura: interno vira <button> sem href; deep-link same-origin abre nova aba com glifo de externo | `packages/platform-shell/shell.js:216` | IMPLEMENTADO | UX-PORTAL-003; UX-DS-005 | ✔ |
| 97 | UX-ANA-002 | Ana Rabottini | P1 | P | 2.67 | editor-cms, visitante | /contato não é renderizada pelo CMS — edição da página no Console não tem efeito | `apps/anarabottini/src/pages/Contato.tsx:17-30` | PARCIALMENTE IMPLEMENTADO | — |  |
| 98 | UX-BESC-002 | BESC | P1 | P | 2.67 | lawyer, judge | titles:read roteia advogado/juiz para a área de GESTÃO de títulos com affordances de escrita | `apps/besc/frontend/src/App.jsx:220` | IMPLEMENTADO | — |  |
| 99 | UX-BESC-009 | BESC | P2 | P | 2.67 | manager, admin, todos | Dois regimes de erro: friendly() duplicado em 7 telas vs e.message cru na área de casos | `apps/besc/frontend/src/api.js:103` | IMPLEMENTADO | — |  |
| 100 | UX-BESC-012 | BESC | P2 | P | 2.67 | todos | Login local sem recuperação de senha nem orientação de fallback | `apps/besc/frontend/src/pages/Entrar.jsx:109-117` | NÃO INICIADO | API: endpoint de reset de senha (ou decisão de delegar 100% ao realm besc/Keycloak) |  |
| 101 | UX-CONSOLE-003 | Console | P1 | P | 2.67 | project-members, platform-admins | Clique-fora/Esc fecham drawer de edição descartando alterações sem confirmação | `console/frontend/src/components/ContentEditor.jsx:53` | IMPLEMENTADO | — |  |
| 102 | UX-CONSOLE-005 | Console | P1 | P | 2.67 | platform-admins | README do Console descreve só o painel read-only e um ConfigMap que a UI não usa | `console/README.md:27-28` | OBSOLETO/DIVERGENTE | — |  |
| 103 | UX-CV360-002 | ContaViva 360 | P0 | GG | 2.67 | contador, cliente_pj, manager | Módulos centrais sem superfície: dashboards apontam para entidades sem nenhuma tela de gestão | `apps/contaviva-360/frontend/src/nav.js:3-7` | PARCIALMENTE IMPLEMENTADO | produto: priorizar telas de documentos, tarefas, cadastros PF/PJ e NF-e (APIs REQ-0002/0004/0006 já prontas) |  |
| 104 | UX-CV360-010 | ContaViva 360 | P2 | P | 2.67 | todos | Rotas por papel órfãs: 4 dashboards fora do nav, sem gating e sem contexto de navegação | `apps/contaviva-360/frontend/src/router.js:18-21` | PARCIALMENTE IMPLEMENTADO | UX-CV360-001 |  |
| 105 | UX-CVPRO-008 | ContaViva Pro | P2 | P | 2.67 | todos | Backend ignora page/pageSize: dashboard 'recentes' pode listar 200 linhas e lista corta em 200 sem aviso | `apps/contaviva-pro/api/src/server.js:25` | PARCIALMENTE IMPLEMENTADO | API: respeitar page/pageSize e devolver total em GET /v1/records |  |
| 106 | UX-DOCS-003 | Docs↔código | P1 | P | 2.67 | stakeholder-externo, operador | Docs do besc negam o código no ar: 'nenhum código de producao foi escrito' vs fases 0-4 implementadas | `apps/besc/docs/evolution/00-visao-geral.md:13-14` | OBSOLETO/DIVERGENTE | — |  |
| 107 | UX-DOCS-004 | Docs↔código | P1 | P | 2.67 | operador, agente-claude | zapbridge: devops.yaml e meta-docs apontam o frontend Expo aposentado em vez do web/ React+Vite | `apps/zapbridge/devops.yaml:24-25` | OBSOLETO/DIVERGENTE | — |  |
| 108 | UX-GYMOPS-003 | GymOps | P1 | P | 2.67 | unit_manager, area_leader | Sidebar mostra 'Painel Geral'/'Central' a unit_manager e area_leader, mas /dashboard os expulsa em silêncio | `apps/gymops/apps/web/src/components/layout/sidebar.tsx:25` | IMPLEMENTADO | produto: decidir se unit_manager deve ter um dashboard escopado (navigation-map.md diverge internamente) |  |
| 109 | UX-GYMOPS-008 | GymOps | P2 | P | 2.67 | unit_manager, area_leader, executor, viewer | Settings mostra 'Integrações/Importações' a todos os papéis, contra a matriz RBAC, e 403 vira erro genérico | `apps/gymops/apps/web/src/app/(app)/settings/layout.tsx:34-40` | IMPLEMENTADO | produto: confirmar se leitura de integrações deve mesmo ser restrita (matriz) ou aberta a membros (API atual) |  |
| 110 | UX-GYMOPS-017 | GymOps | P2 | P | 2.67 | unit_manager, area_leader, executor | Falha no dashboard da unidade não tem estado de erro: título '...' e KPIs somem sem aviso | `apps/gymops/apps/web/src/app/(app)/units/[id]/page.tsx:113-118` | IMPLEMENTADO | — |  |
| 111 | UX-GYMOPS-019 | GymOps | P2 | P | 2.67 | todos | navigation-map.md e notas da rbac-matrix.md contradizem o código (menus por papel e BUG-005/6/7 já corrigidos) | `apps/gymops/docs/navigation-map.md:165` | OBSOLETO/DIVERGENTE | UX-GYMOPS-003 |  |
| 112 | UX-GYMOPS-020 | GymOps | P2 | P | 2.67 | todos | Chat IA sem aria-live nem semântica de diálogo: respostas e card de confirmação invisíveis a leitores de tela | `apps/gymops/apps/web/src/components/ai/AiChatWidget.tsx:174` | IMPLEMENTADO | — |  |
| 113 | UX-IMOBIA-009 | Imobia | P2 | P | 2.67 | todos | alert() nativo é o canal de erro e de aviso de IA em 20 pontos | `apps/imobia/frontend/src/views/app/Leads.vue:41` | IMPLEMENTADO | — | ✔ |
| 114 | UX-NAV-007 | Integração/Navegação | P2 | P | 2.67 | project-members | Deep-links canonicos do launcher ignoram papel: member recebe Logs/Publicacoes que o Console nega | `packages/platform-shell/shell.js:55-56` | IMPLEMENTADO | UX-CONSOLE-006 |  |
| 115 | UX-NEURO-010 | NeuroEvolui | P2 | P | 2.67 | todos | 11 views órfãs (~7,9k linhas) sem rota, duplicando telas vivas e referenciando rotas inexistentes | `apps/neuroevolui/frontend/src/router.js:1-55` | PARCIALMENTE IMPLEMENTADO | — |  |
| 116 | UX-PORTAL-002 | Portal | P2 | P | 2.67 | todos | Auditoria a11y registrada (2026-06-13) é anterior à paleta atual e mascara regressões | `docs/standards/portal-ux-accessibility-checklist.md:45-48` | OBSOLETO/DIVERGENTE | — |  |
| 117 | UX-PORTAL-003 | Portal | P2 | P | 2.67 | todos | Launcher da casca declara role=menu sem teclas de menu, sem aria-haspopup e sem devolver foco no Esc | `portal/frontend/assets/platform-shell.js:169` | IMPLEMENTADO | componente compartilhado: packages/platform-shell (fix no pacote + codegen-sync) |  |
| 118 | UX-PREC-004 | Portal Recorder | P1 | P | 2.67 | operador | Passos marcados vivem só em memória: reload zera a lista e duplica step_index | `apps/portal-recorder/frontend/src/views/CaptureView.jsx:42` | PARCIALMENTE IMPLEMENTADO | — |  |
| 119 | UX-PREC-005 | Portal Recorder | P1 | P | 2.67 | operador | Screencast sem reconexão nem ação de recuperação quando o WS cai | `apps/portal-recorder/frontend/src/views/CaptureView.jsx:299-304` | PARCIALMENTE IMPLEMENTADO | — |  |
| 120 | UX-PREC-006 | Portal Recorder | P1 | P | 2.67 | operador | Contraste < 4.5:1 nos textos de estado pequenos (ok/warn) no tema claro | `apps/portal-recorder/frontend/src/platform-tokens.css:24-25` | IMPLEMENTADO | produto: alinhar com o design-tokens central (tons de texto de estado); fix local possível via aliases, como já feito para o accent |  |
| 121 | UX-QA-011 | QA/Regressão | P2 | P | 2.67 | operador-dev da plataforma | Bloco locked 'oidc-sessão' dá falsa garantia: única asserção é /health aberto, nos apps que saíram sem guard de login | `apps/neuroevolui/tests/locked/capability/oidc-sessao.test.mjs:1-8` | PARCIALMENTE IMPLEMENTADO | UX-NEURO-001; UX-CV360-001; UX-CVPRO-001 | ✔ |
| 122 | UX-REQHUB-003 | Reqhub | P2 | P | 2.67 | todos | Idade da baseline invisível — dados podem estar stale sem nenhum sinal na UI | `apps/reqhub/frontend/assets/app.js:3135` | NÃO INICIADO | produto: gerador da baseline precisa emitir generated_at no current-baseline.json |  |
| 123 | UX-REQHUB-008 | Reqhub | P2 | P | 2.67 | todos | Busca global visível em todas as telas mas inerte em Forja/Editor/Workspace/Uso da IA | `apps/reqhub/frontend/assets/app.js:2565-2569` | PARCIALMENTE IMPLEMENTADO | — |  |
| 124 | UX-RMAMB-003 | RM Ambiental | P1 | P | 2.67 | visitante | Números de autoridade ilustrativos (+250 projetos etc.) publicados com nota minúscula de baixo contraste | `apps/rmambiental/src/data/content.default.ts:69-74` | IMPLEMENTADO | produto: obter os indicadores oficiais da RM Ambiental Brasil |  |
| 125 | UX-SICAT-004 | SICAT | P2 | P | 2.67 | todos | Aviso de sessão a expirar existe no store mas nenhuma UI consome | `apps/sicat/frontend/src/stores/auth.js:533-539` | PARCIALMENTE IMPLEMENTADO | — |  |
| 126 | UX-SICAT-006 | SICAT | P2 | P | 2.67 | generator, receiver, carrier | Copiloto in-app não oferece 'Parar' durante o processamento | `apps/sicat/frontend/src/components/conversation/InAppCopilotAssistant.vue:395-397` | PARCIALMENTE IMPLEMENTADO | — |  |
| 127 | UX-ZAP-001 | ZapBridge | P1 | P | 2.67 | usuário | Acoes de mensagem (responder/reagir/copiar) só aparecem no hover — inacessíveis por teclado | `apps/zapbridge/web/src/components/MessageBubble.tsx:104-111` | IMPLEMENTADO | — |  |
| 128 | UX-ZAP-002 | ZapBridge | P1 | P | 2.67 | usuário | Sessao expirada sem tratamento: nenhum interceptor de 401, app 'logado' para de funcionar | `apps/zapbridge/web/src/api/client.ts:42-52` | IMPLEMENTADO | — |  |
| 129 | UX-ZAP-003 | ZapBridge | P1 | P | 2.67 | usuário | Erro de carregamento indistinguivel de vazio na lista de conversas e no histórico do chat | `apps/zapbridge/web/src/store/chats.store.ts:41-43` | IMPLEMENTADO | — |  |
| 130 | UX-ZAP-006 | ZapBridge | P1 | P | 2.67 | usuário | Impossivel desativar a IA ou apagar dados de IA na web — a tela promete o contrario | `apps/zapbridge/web/src/pages/AssistantPage.tsx:109-111` | PARCIALMENTE IMPLEMENTADO | — |  |
| 131 | UX-A11Y-004 | A11y plataforma | P2 | M | 2.4 | todos | Tema escuro: 4 chaves de localStorage na frota e togglers concorrentes — no neuroevolui a escolha feita em Configurações reverte no reload | `apps/neuroevolui/frontend/src/views/SettingsView.vue:825` | PARCIALMENTE IMPLEMENTADO | UX-DS-004; UX-GYMOPS-015; UX-ZAP-026 |  |
| 132 | UX-A11Y-005 | A11y plataforma | P2 | M | 2.4 | todos | Zero verificação automatizada de a11y no CI da plataforma; o único teste de contraste existe e está desligado do gate | `.github/workflows/design-tokens-gate.yml:32-42` | PARCIALMENTE IMPLEMENTADO | UX-DS-003; UX-DS-009; UX-PORTAL-002; UX-DOCS-009 |  |
| 133 | UX-A11Y-007 | A11y plataforma | P2 | M | 2.4 | todos | Conteúdo dinâmico invisível à AT como padrão: 5 chats de IA e badges ao vivo sem live-region consistente — e o padrão certo já existe no reqhub | `apps/reqhub/frontend/assets/app.js:2638` | PARCIALMENTE IMPLEMENTADO | UX-CONSOLE-015; UX-IMOBIA-015; UX-ZAP-018; UX-GYMOPS-020; UX-REQHUB-005 |  |
| 134 | UX-AI-004 | UX de IA | P2 | M | 2.4 | todos | Cancelar/timeout de turno de IA existe em 2 de 9 superfícies; as demais travam o composer sem saida | `apps/neuroevolui/frontend/src/views/AssistantView.vue:567` | PARCIALMENTE IMPLEMENTADO | UX-SICAT-006; UX-CVPRO-016; UX-IMOBIA-015 |  |
| 135 | UX-AI-005 | UX de IA | P2 | M | 2.4 | todos, operador-plataforma | Custo/tokens de IA em 3 regimes divergentes; CV360 recebe usage do backend e descarta | `apps/imobia/frontend/src/views/app/Assistente.vue:83` | PARCIALMENTE IMPLEMENTADO | UX-AICP-002 |  |
| 136 | UX-AI-007 | UX de IA | P2 | M | 2.4 | todos | Modelo de memoria da conversa diverge entre apps e nunca e comunicado ao usuário | `apps/gymops/apps/web/src/components/ai/AiChatWidget.tsx:83` | PARCIALMENTE IMPLEMENTADO | UX-IMOBIA-014 |  |
| 137 | UX-AI-008 | UX de IA | P2 | M | 2.4 | todos, operador-plataforma | Loop de qualidade aberto: thumbs só em 2 de 9 superfícies e rollup cross-app sem leitor | `apps/gymops/apps/api/src/routes/ai/index.ts:557` | PARCIALMENTE IMPLEMENTADO | UX-AICP-001 |  |
| 138 | UX-DS-004 | Design System | P2 | M | 2.4 | todos | Dark mode fragmentado: 3 convenções de seletor entre renderers e 3 chaves de localStorage | `DESIGN_SYSTEM.md:38` | OBSOLETO/DIVERGENTE | — |  |
| 139 | UX-DS-008 | Design System | P2 | M | 2.4 | todos | UiDataTable no mobile: layout-card e 1ª coluna sticky prometidos no doc, só overflow-x implementado | `DESIGN_SYSTEM.md:60` | PARCIALMENTE IMPLEMENTADO | — |  |
| 140 | UX-NAV-006 | Integração/Navegação | P2 | M | 2.4 | todos | 404 sem padrão de plataforma: cinco comportamentos distintos e nenhum devolve ao Portal | `apps/sicat/frontend/src/router.js:354-368` | IMPLEMENTADO | UX-ANA-007; UX-RMAMB-008; UX-IMOBIA-018; UX-PORTAL-007 |  |
| 141 | UX-AICP-001 | UX de IA | P1 | G | 2 | operador-plataforma | Governanca de IA sem superfície de leitura: GETs do control-plane não tem nenhum consumidor | `apps/ai-control-plane/api/src/routes.js:140-141` | NÃO INICIADO | produto: decidir consolidar leitura no Console vs frontend próprio do ai-control-plane |  |
| 142 | UX-ANA-003 | Ana Rabottini | P2 | PP | 2 | visitante | BackToTop lê hasWhatsApp estático do fallback e colidirá com o FAB do WhatsApp | `apps/anarabottini/src/components/BackToTop.tsx:3,27-29` | IMPLEMENTADO | — | ✔ |
| 143 | UX-BESC-004 | BESC | P2 | PP | 2 | manager, admin | Aluguéis: copy 'criados nesta sessão' diverge do código, e empty state errado pisca no loading | `apps/besc/frontend/src/pages/GestaoAlugueis.jsx:40` | OBSOLETO/DIVERGENTE | — | ✔ |
| 144 | UX-BESC-005 | BESC | P2 | PP | 2 | manager, admin | Tabelas de fluxos principais sem contêiner overflow-x quebram em 375px | `apps/besc/frontend/src/pages/Dashboard.jsx:74-86` | IMPLEMENTADO | — | ✔ |
| 145 | UX-BESC-010 | BESC | P2 | PP | 2 | public | Anônimo não tem caminho para o dossiê público do título — catálogo só oferece login | `apps/besc/frontend/src/pages/Marketplace.jsx:78-86` | IMPLEMENTADO | — | ✔ |
| 146 | UX-BESC-015 | BESC | P3 | PP | 2 | todos | Scroll suave via JS na Ajuda ignora prefers-reduced-motion | `apps/besc/frontend/src/pages/Ajuda.jsx:42` | IMPLEMENTADO | — | ✔ |
| 147 | UX-BESC-017 | BESC | P3 | PP | 2 | todos | Mapas de rótulo de status duplicados em várias telas (drift garantido) | `apps/besc/frontend/src/pages/InvestidorCarteira.jsx:11-18` | IMPLEMENTADO | — | ✔ |
| 148 | UX-CONSOLE-006 | Console | P2 | PP | 2 | project-members | Deep-link por hash após a carga ignora o papel e rende tela em branco | `console/frontend/src/App.jsx:140-142` | IMPLEMENTADO | — |  |
| 149 | UX-CONSOLE-010 | Console | P2 | PP | 2 | platform-admins | Overview e Health sem ação de recuperação no estado de erro | `console/frontend/src/components/Overview.jsx:91-95` | IMPLEMENTADO | — |  |
| 150 | UX-CONSOLE-012 | Console | P3 | PP | 2 | todos | Idioma misto (seções em inglês) e texto visível sem acentos | `console/frontend/src/components/Health.jsx:157-158` | IMPLEMENTADO | — | ✔ |
| 151 | UX-CONSOLE-013 | Console | P3 | PP | 2 | todos | Alvos de toque abaixo de 24px (checklist de tasks, copiar SHA) | `console/frontend/src/styles.css:1062-1067` | IMPLEMENTADO | — |  |
| 152 | UX-CV360-016 | ContaViva 360 | P3 | PP | 2 | todos | 'Limpar' apaga a conversa do assistente sem confirmação | `apps/contaviva-360/frontend/src/views/AiAssistantView.vue:11` | IMPLEMENTADO | — | ✔ |
| 153 | UX-CVPRO-009 | ContaViva Pro | P2 | PP | 2 | member | Negação de acesso à área admin é silenciosa (redirect ao dashboard sem explicação) | `apps/contaviva-pro/frontend/src/router.js:31` | IMPLEMENTADO | — | ✔ |
| 154 | UX-CVPRO-015 | ContaViva Pro | P3 | PP | 2 | todos | Controles crus fora do kit: <input> no form de registro e <select> no modal de usuário | `apps/contaviva-pro/frontend/src/views/ResourceFormView.vue:8` | IMPLEMENTADO | — | ✔ |
| 155 | UX-DOCS-008 | Docs↔código | P2 | PP | 2 | agente-claude, operador | imobia: CLAUDE.md diz GitOps 'pendente de aprovação' e manda kubectl apply, mas a Application vive com selfHeal | `apps/imobia/CLAUDE.md:50-51` | OBSOLETO/DIVERGENTE | — | ✔ |
| 156 | UX-DS-013 | Design System | P3 | P | 2 | todos | UiAppShell mobile: drawer sem fechamento por Escape e sem gestão de foco | `packages/ui-vue/src/components/UiAppShell.vue:4` | IMPLEMENTADO | — |  |
| 157 | UX-GYMOPS-022 | GymOps | P3 | PP | 2 | todos | Acordeão de área em /units/:id sem aria-expanded | `apps/gymops/apps/web/src/app/(app)/units/[id]/page.tsx:79-82` | IMPLEMENTADO | — | ✔ |
| 158 | UX-GYMOPS-023 | GymOps | P3 | PP | 2 | todos | Abas de /me sem role=tablist/aria-selected (estado ativo só visual) | `apps/gymops/apps/web/src/app/(app)/me/page.tsx:124-127` | IMPLEMENTADO | — | ✔ |
| 159 | UX-GYMOPS-025 | GymOps | P3 | PP | 2 | todos | Botão de detalhes do item de checklist fica invisível quando focado por teclado (md:opacity-0 sem focus-within) | `apps/gymops/apps/web/src/components/activities/ActivityDrawer.tsx:1088` | IMPLEMENTADO | — | ✔ |
| 160 | UX-IMOBIA-004 | Imobia | P1 | G | 2 | todos | RBAC de fachada: 4 papéis no enum e na sidebar, zero gating e papéis inatingíveis | `apps/imobia/api/src/lib/crud.ts:25` | PARCIALMENTE IMPLEMENTADO | API: aplicar writeRoles por módulo e criar rotas de membership/convite; produto: definir matriz papel × módulo |  |
| 161 | UX-IMOBIA-017 | Imobia | P3 | PP | 2 | todos | cursor:pointer global em linhas de tabela não clicáveis (Documentos, Financeiro) | `apps/imobia/frontend/src/styles.css:223` | IMPLEMENTADO | — | ✔ |
| 162 | UX-IMOBIA-018 | Imobia | P3 | PP | 2 | todos | 404 catch-all redireciona silenciosamente para a home pública | `apps/imobia/frontend/src/router.js:57` | IMPLEMENTADO | — | ✔ |
| 163 | UX-IMOBIA-019 | Imobia | P3 | PP | 2 | todos | Enums crus e capitalização mecânica na UI (admin, limpa_nome, 'Captacao' sem acento) | `apps/imobia/frontend/src/layouts/AppShell.vue:41` | IMPLEMENTADO | — | ✔ |
| 164 | UX-NAV-009 | Integração/Navegação | P3 | PP | 2 | project-members, usuário-de-produto | Card 'Keycloak' do launcher leva a raiz do admin console, não ao account console do usuário | `packages/platform-shell/shell.js:23` | IMPLEMENTADO | — |  |
| 165 | UX-NEURO-014 | NeuroEvolui | P2 | PP | 2 | patient | Régua de papéis local do PatientCreateView diverge do backend e deixa passar o papel patient | `apps/neuroevolui/frontend/src/views/PatientCreateView.vue:369-371` | IMPLEMENTADO | — | ✔ |
| 166 | UX-NEURO-015 | NeuroEvolui | P2 | PP | 2 | patient | GET /v1/consultations sem requireRole: rank mínimo lê a agenda completa, destoando dos vizinhos | `apps/neuroevolui/api/src/server.js:169` | IMPLEMENTADO | API: alinhar requireRole da lista de consultations com o restante (professional) ou filtrar por paciente da sessão |  |
| 167 | UX-NEURO-017 | NeuroEvolui | P2 | PP | 2 | patient, professional | Bootstrap do agendamento trata 401/403 dos catálogos como erro de conexão com retry inútil | `apps/neuroevolui/frontend/src/views/ConsultationCreateView.vue:708-718` | IMPLEMENTADO | — | ✔ |
| 168 | UX-NEURO-018 | NeuroEvolui | P3 | PP | 2 | todos | Toast 'Painel atualizado' dispara em toda visita ao Dashboard (mount), não só no refresh manual | `apps/neuroevolui/frontend/src/views/DashboardView.vue:697-699` | IMPLEMENTADO | — | ✔ |
| 169 | UX-NEURO-021 | NeuroEvolui | P3 | PP | 2 | todos | Alias de rota pt/en existe só em /consultations/novo — previsibilidade de URL inconsistente | `apps/neuroevolui/frontend/src/router.js:73` | IMPLEMENTADO | — |  |
| 170 | UX-PORTAL-004 | Portal | P2 | PP | 2 | visitante-anonimo | Erro transitório da API revela a seção de operador (com erro interno) ao visitante anônimo | `portal/frontend/assets/portal.js:421-429` | IMPLEMENTADO | — | ✔ |
| 171 | UX-PORTAL-006 | Portal | P3 | PP | 2 | todos | Comentário do sitemap promete bloqueio de produtos com login no robots.txt que não existe | `portal/frontend/sitemap.xml:2-4` | OBSOLETO/DIVERGENTE | — | ✔ |
| 172 | UX-PORTAL-007 | Portal | P3 | PP | 2 | todos | 404 sem casca/tema persistido e webmanifest com theme_color da marca antiga (#2563eb) | `portal/frontend/404.html:19-20` | IMPLEMENTADO | — | ✔ |
| 173 | UX-PREC-007 | Portal Recorder | P2 | PP | 2 | operador | 'Encerrar sessão' irreversível dispara sem confirmação | `apps/portal-recorder/frontend/src/views/CaptureView.jsx:249-254` | IMPLEMENTADO | — | ✔ |
| 174 | UX-PREC-009 | Portal Recorder | P2 | PP | 2 | operador | Captura de sessão inexistente falha em silêncio (catch vazio no mount) | `apps/portal-recorder/frontend/src/views/CaptureView.jsx:60-62` | IMPLEMENTADO | — | ✔ |
| 175 | UX-PREC-010 | Portal Recorder | P2 | PP | 2 | operador | Erros de carregamento (portais/timeline) sem ação de 'Tentar novamente' | `apps/portal-recorder/frontend/src/views/PortalsView.jsx:59` | PARCIALMENTE IMPLEMENTADO | — | ✔ |
| 176 | UX-PREC-011 | Portal Recorder | P2 | PP | 2 | operador | Lista de portais/sessões sem refresh manual nem polling de status | `apps/portal-recorder/frontend/src/views/PortalsView.jsx:38-40` | PARCIALMENTE IMPLEMENTADO | — | ✔ |
| 177 | UX-PREC-012 | Portal Recorder | P2 | PP | 2 | operador | 'Print' não dá feedback de sucesso nem contagem | `apps/portal-recorder/frontend/src/views/CaptureView.jsx:237-247` | PARCIALMENTE IMPLEMENTADO | — | ✔ |
| 178 | UX-PREC-016 | Portal Recorder | P3 | PP | 2 | todos | aria-current="page" aplicado a uma <span> avulsa fora de conjunto de navegação | `apps/portal-recorder/frontend/src/App.jsx:29-33` | IMPLEMENTADO | — | ✔ |
| 179 | UX-REQHUB-005 | Reqhub | P2 | PP | 2 | platform-admin | Taxas ao vivo do Uso da IA com aria-live=polite atualizadas a cada frame SSE inundam o leitor de tela | `apps/reqhub/frontend/assets/app.js:2800-2804` | IMPLEMENTADO | — | ✔ |
| 180 | UX-REQHUB-006 | Reqhub | P2 | PP | 2 | operador | Token de operador da IA sem instrução de onde obtê-lo | `apps/reqhub/frontend/assets/app.js:1733` | PARCIALMENTE IMPLEMENTADO | — | ✔ |
| 181 | UX-RMAMB-006 | RM Ambiental | P2 | PP | 2 | visitante | 'Enviar por e-mail' bypassa a validação required e o envio via WhatsApp não trata popup bloqueado | `apps/rmambiental/src/components/ContactSection.tsx:35-37` | IMPLEMENTADO | — | ✔ |
| 182 | UX-RMAMB-007 | RM Ambiental | P2 | PP | 2 | visitante | Sem skip-link para o conteúdo principal (header fixo com ~10 tab-stops repetidos) | `apps/rmambiental/src/App.tsx:37-45` | NÃO INICIADO | — | ✔ |
| 183 | UX-SICAT-005 | SICAT | P2 | PP | 2 | generator | Jargão interno de dev ('Em elaboração', 'Vuexy') exposto na emissão de MTR | `apps/sicat/frontend/src/views/ManifestCreateView.vue:79-80` | IMPLEMENTADO | — | ✔ |
| 184 | UX-SICAT-010 | SICAT | P3 | PP | 2 | todos | 'Lembrar de mim' no login não tem nenhum efeito | `apps/sicat/frontend/src/views/LoginView.vue:26` | PARCIALMENTE IMPLEMENTADO | — | ✔ |
| 185 | UX-SICAT-011 | SICAT | P3 | PP | 2 | todos | 'Esqueceu a senha?' responde com alerta de ERRO contendo instrução | `apps/sicat/frontend/src/views/LoginView.vue:74-76` | PARCIALMENTE IMPLEMENTADO | — |  |
| 186 | UX-SICAT-012 | SICAT | P3 | PP | 2 | todos | Número do MTR (role=button) não ativa com a tecla Espaço | `apps/sicat/frontend/src/views/ManifestsView.vue:1997-1998` | PARCIALMENTE IMPLEMENTADO | — | ✔ |
| 187 | UX-SICAT-013 | SICAT | P3 | PP | 2 | generator, receiver, carrier | Etapa 2 exibe accountId cru, hora estática sem valor e microcopy sem acento | `apps/sicat/frontend/src/views/CetesbAccountSelectionView.vue:363-366` | IMPLEMENTADO | — | ✔ |
| 188 | UX-SICAT-014 | SICAT | P3 | PP | 2 | generator, receiver, carrier | /dev/components (audience system) acessível a qualquer autenticado | `apps/sicat/frontend/src/router.js:358-362` | IMPLEMENTADO | — |  |
| 189 | UX-ZAP-009 | ZapBridge | P2 | PP | 2 | usuário | Chip 'Favoritos' e um filtro morto: sempre vazio e sem forma de favoritar | `apps/zapbridge/web/src/components/ChatListPanel.tsx:25` | PARCIALMENTE IMPLEMENTADO | produto: existe favorito no modelo? senao, remover o chip |  |
| 190 | UX-ZAP-013 | ZapBridge | P2 | PP | 2 | usuário | Reescrita IA (✨) falha em silencio — sem mensagem de erro nem retry | `apps/zapbridge/web/src/components/MessageInput.tsx:74-79` | IMPLEMENTADO | — | ✔ |
| 191 | UX-ZAP-015 | ZapBridge | P2 | PP | 2 | usuário | Hora/status nas bolhas enviadas: branco 50% sobre #005c4b ≈ 3,2:1 em texto de 11px | `apps/zapbridge/web/src/components/MessageBubble.tsx:188` | IMPLEMENTADO | — | ✔ |
| 192 | UX-ZAP-018 | ZapBridge | P2 | PP | 2 | usuário | Assistente: textarea sem nome acessível, botão enviar '➤' sem aria-label, resposta sem aria-live | `apps/zapbridge/web/src/pages/AssistantPage.tsx:148-151` | IMPLEMENTADO | — | ✔ |
| 193 | UX-ZAP-019 | ZapBridge | P2 | PP | 2 | usuário | Logout não desconecta o socket nem limpa stores — troca de conta herda tempo real do usuário anterior | `apps/zapbridge/web/src/store/auth.store.ts:58-61` | IMPLEMENTADO | — | ✔ |
| 194 | UX-CONSOLE-007 | Console | P2 | M | 1.6 | todos | Sessão expirada recarrega a página sem aviso, perdendo trabalho em curso | `console/frontend/src/api.js:25-29` | IMPLEMENTADO | — |  |
| 195 | UX-CV360-012 | ContaViva 360 | P2 | M | 1.6 | cliente_pj, todos | Corte silencioso de dados: API limita em 500/200 linhas, ignora páginação e a UI não página | `apps/contaviva-360/api/src/routes/financial-control.js:23` | PARCIALMENTE IMPLEMENTADO | API: implementar page/pageSize/total nos endpoints de listagem |  |
| 196 | UX-CV360-014 | ContaViva 360 | P2 | M | 1.6 | todos | Papéis divergem em três camadas: 7 perfis na visão × 3 ranks no RBAC × 6 chaves no frontend | `specs/products/contaviva-360/product.json:29` | OBSOLETO/DIVERGENTE | produto: decidir o conjunto real de papéis antes do login OIDC |  |
| 197 | UX-CVPRO-005 | ContaViva Pro | P1 | M | 1.6 | member, admin | Recuperação de senha inexistente em qualquer canal (nem self-service, nem via admin) | `apps/contaviva-pro/frontend/src/views/AuthView.vue:38-41` | NÃO INICIADO | API: endpoint de redefinição de senha (self-service com token ou administrativo) |  |
| 198 | UX-CVPRO-011 | ContaViva Pro | P2 | M | 1.6 | todos | SSO usa implicit flow (response_type=token), divergente do padrão PKCE da plataforma | `apps/contaviva-pro/frontend/src/views/AuthView.vue:97` | IMPLEMENTADO | produto: migrar o fluxo SSO para Authorization Code + PKCE (padrão oidc-kit da plataforma) |  |
| 199 | UX-CVPRO-013 | ContaViva Pro | P2 | M | 1.6 | todos | Baseline/spec contradiz a implementação: 0 requisitos, build 'not_started' e vision de ERP não realizada | `specs/products/contaviva-pro/product.json:22` | OBSOLETO/DIVERGENTE | produto: criar requisitos/refinamentos do contaviva-pro e sincronizar fases da baseline (mandato global A16) |  |
| 200 | UX-DOCS-002 | Docs↔código | P2 | M | 1.6 | operador, agente-claude | besc: produto mais complexo da plataforma e invisível a base de requisitos (has_product:false, 0 REQs) | `specs/baseline/apps-index.json:16-20` | OBSOLETO/DIVERGENTE | produto: decidir adocao do besc na Forja (registro + backfill de REQs) |  |
| 201 | UX-DS-007 | Design System | P2 | M | 1.6 | operador-dev da plataforma | Golden path de app novo não semeia o DS e o gate não enxerga apps que nascem fora | `DESIGN_SYSTEM.md:63-64` | PARCIALMENTE IMPLEMENTADO | produto: definir política de adoção (dentro × identidade-própria-declarada) |  |
| 202 | UX-GYMOPS-015 | GymOps | P2 | M | 1.6 | todos | Dark mode inatingível (tokens .dark sem toggle) e superfícies com cores light-only fora do padrão dot | `apps/gymops/apps/web/src/app/globals.css:43-45` | PARCIALMENTE IMPLEMENTADO | — |  |
| 203 | UX-GYMOPS-016 | GymOps | P2 | M | 1.6 | todos | PWA incompleto: manifest com start_url '/' (abriria o portal, não o /gymops) e sem offline | `apps/gymops/apps/web/public/manifest.json:7-10` | PARCIALMENTE IMPLEMENTADO | UX-GYMOPS-005 |  |
| 204 | UX-IMOBIA-011 | Imobia | P2 | M | 1.6 | todos | JWT de acesso trafega na query string do SSE do assistente | `apps/imobia/frontend/src/api.js:31` | IMPLEMENTADO | API: expor SSE via POST/fetch-reader (padrão já usado no CMS da plataforma) ou token efêmero de uso único |  |
| 205 | UX-IMOBIA-013 | Imobia | P2 | M | 1.6 | todos | Sem páginação na UI com corte silencioso do servidor (50/60 registros) | `apps/imobia/frontend/src/views/app/Imoveis.vue:28-29` | PARCIALMENTE IMPLEMENTADO | — |  |
| 206 | UX-IMOBIA-014 | Imobia | P2 | M | 1.6 | todos | Chat do assistente aparenta conversa mas cada turno é enviado sem histórico | `apps/imobia/frontend/src/api.js:31` | PARCIALMENTE IMPLEMENTADO | API: aceitar history/threadId no /ai/stream (o /ai/chat já suporta history) |  |
| 207 | UX-IMOBIA-016 | Imobia | P2 | M | 1.6 | todos | Login promete SSO Keycloak mas não existe botão/fluxo PKCE no frontend | `apps/imobia/frontend/src/views/Login.vue:66` | PARCIALMENTE IMPLEMENTADO | plataforma: client OIDC do imobia no realm nvit (secret via Sealed Secrets) |  |
| 208 | UX-NEURO-008 | NeuroEvolui | P1 | M | 1.6 | professional | 'Confirmar e aplicar' rascunho do Assistente IA não persiste nada — só marca flag local e exibe sucesso | `apps/neuroevolui/frontend/src/views/AssistantView.vue:858-866` | PARCIALMENTE IMPLEMENTADO | API: endpoint para persistir o rascunho aplicado (ex.: criar evolution-note ou patient-report) |  |
| 209 | UX-SICAT-008 | SICAT | P2 | M | 1.6 | todos | Feedback dividido entre toasts (useNotification) e pilha de v-alert inline | `apps/sicat/frontend/src/views/ManifestsView.vue:1899-1902` | IMPLEMENTADO | — |  |
| 210 | UX-AI-006 | UX de IA | P2 | G | 1.5 | todos | Nao existe primitiva 'chat IA' no design system: 4 implementacoes independentes, a11y correta só no kit ui-vue | `apps/contaviva-360/frontend/src/views/AiAssistantView.vue:23` | NÃO INICIADO | UX-GYMOPS-020; UX-ZAP-018; UX-IMOBIA-015 |  |
| 211 | UX-DOCS-009 | Docs↔código | P2 | G | 1.5 | todos | Cobertura de requisitos de UX/a11y quase nula: 6 de 381 REQs (1,6%); zero em sicat/imobia/zapbridge/contaviva/besc | `specs/requirements/portal/REQ-PORTAL-NFR-002.yaml:3` | NÃO INICIADO | produto: politica de NFR de a11y por blueprint da Forja |  |
| 212 | UX-DS-010 | Design System | P2 | G | 1.5 | todos | Mínimo universal (foco, reduced-motion, dark coerente) não viaja aos apps fora do sistema; gymops carrega dark morto | `apps/gymops/apps/web/tailwind.config.ts:4` | PARCIALMENTE IMPLEMENTADO | produto: ratificar quais apps são 'identidade própria declarada' |  |
| 213 | UX-ANA-005 | Ana Rabottini | P2 | P | 1.33 | visitante | HTML do CMS injetado via dangerouslySetInnerHTML sem sanitização no cliente | `apps/anarabottini/src/components/SectionRenderer.tsx:185-186` | IMPLEMENTADO | API: garantir sanitização do campo html no pipeline do CMS/console |  |
| 214 | UX-ANA-006 | Ana Rabottini | P2 | P | 1.33 | editor-cms | Falha de upload no modo edição é silenciosa no portal (nack só reseta o busy) | `apps/anarabottini/src/lib/cmsEdit.tsx:263-265` | IMPLEMENTADO | produto: confirmar se o Console exibe toast de erro no nack (fora da raiz auditada) |  |
| 215 | UX-BESC-008 | BESC | P2 | P | 1.33 | manager, admin | Anti-duplo-submit ausente em mutações do CaseDetail e nas ações de usuário | `apps/besc/frontend/src/pages/CaseDetail.jsx:311` | IMPLEMENTADO | — |  |
| 216 | UX-BESC-014 | BESC | P2 | P | 1.33 | manager, admin | Campo 'Tomador (ID do usuário)' pede um ID interno que nenhuma tela expõe | `apps/besc/frontend/src/pages/GestaoAlugueis.jsx:188-191` | IMPLEMENTADO | API: lookup de usuário por e-mail no fluxo de aluguel (o padrão já existe nos grants por userEmail) |  |
| 217 | UX-CONSOLE-008 | Console | P2 | P | 1.33 | project-members | pm-api indisponível degrada member para a casca de admin com erros em cascata | `console/frontend/src/App.jsx:92-97` | IMPLEMENTADO | — |  |
| 218 | UX-CONSOLE-009 | Console | P2 | P | 1.33 | project-members, platform-admins | Cancelar o wizard após a 1ª etapa deixa o portal já criado, sem aviso | `console/frontend/src/components/cms/NewPortalWizard.jsx:263-268` | IMPLEMENTADO | — |  |
| 219 | UX-CONSOLE-016 | Console | P3 | P | 1.33 | todos | Fontes carregadas de CDN externo (Google Fonts) num console de laboratório local | `console/frontend/index.html:14-18` | IMPLEMENTADO | — |  |
| 220 | UX-CONSOLE-017 | Console | P3 | P | 1.33 | todos | Navegação interna nunca cria histórico — Voltar sai do Console | `console/frontend/src/App.jsx:124-126` | IMPLEMENTADO | — |  |
| 221 | UX-CV360-013 | ContaViva 360 | P2 | P | 1.33 | cliente_pj | Sem exclusão/cancelamento na UI de contas a pagar/receber | `apps/contaviva-360/frontend/src/api.js:22` | PARCIALMENTE IMPLEMENTADO | — |  |
| 222 | UX-CV360-015 | ContaViva 360 | P2 | P | 1.33 | cliente_pj | Validação dos formulários de AP/AR só por toast genérico, sem erro inline nem foco no campo | `apps/contaviva-360/frontend/src/views/AccountsPayableView.vue:141` | IMPLEMENTADO | — |  |
| 223 | UX-CV360-020 | ContaViva 360 | P3 | P | 1.33 | todos | Sem code-split: todas as 15 views importadas estaticamente no router | `apps/contaviva-360/frontend/src/router.js:1-2` | IMPLEMENTADO | — |  |
| 224 | UX-CVPRO-010 | ContaViva Pro | P2 | P | 1.33 | admin | Papel 'manager' existe no backend sem qualquer superfície na UI (papel órfão) | `apps/contaviva-pro/api/src/auth.js:21` | PARCIALMENTE IMPLEMENTADO | produto: decidir se manager/contador existe; então expor na UI ou remover do backend |  |
| 225 | UX-CVPRO-016 | ContaViva Pro | P3 | P | 1.33 | todos | Assistente de IA sem cancelar/timeout; 'Limpar' apaga a conversa sem confirmação; sem aviso de falibilidade | `apps/contaviva-pro/frontend/src/views/AiAssistantView.vue:110-112` | PARCIALMENTE IMPLEMENTADO | — |  |
| 226 | UX-CVPRO-017 | ContaViva Pro | P3 | P | 1.33 | todos | Fluxo de submissão assíncrona (fila BullMQ) existe no backend e é invisível na UI | `apps/contaviva-pro/api/src/server.js:28` | PARCIALMENTE IMPLEMENTADO | — |  |
| 227 | UX-DOCS-013 | Docs↔código | P3 | P | 1.33 | operador | anarabottini: vitrine diz 'publicado NO AR' sem sinalizar que toda a midia e placeholder | `specs/baseline/products.json:28` | PARCIALMENTE IMPLEMENTADO | produto: dona do portal fornecer midia real |  |
| 228 | UX-DS-012 | Design System | P3 | P | 1.33 | operador-dev da plataforma | Escalas estruturais duplicadas: tokens.json (platform) × array hardcoded no forge-brand.mjs | `packages/design-tokens/tokens.json:46-48` | IMPLEMENTADO | — |  |
| 229 | UX-GYMOPS-009 | GymOps | P2 | P | 1.33 | owner, org_manager | Dropdown 'Views salvas' abre só por hover CSS (sem teclado/toque) e exclui view sem confirmação | `apps/gymops/apps/web/src/app/(app)/activities/page.tsx:363` | IMPLEMENTADO | — |  |
| 230 | UX-GYMOPS-010 | GymOps | P2 | P | 1.33 | owner, org_manager | Ordenação da tabela do dashboard só funciona com mouse (th onClick sem foco/teclado) | `apps/gymops/apps/web/src/app/(app)/dashboard/page.tsx:244-246` | IMPLEMENTADO | — |  |
| 231 | UX-GYMOPS-021 | GymOps | P3 | P | 1.33 | owner, todos | Pós-setup e pós-convite forçam o usuário a redigitar credenciais recém-criadas | `apps/gymops/apps/web/src/app/setup/page.tsx:133-135` | IMPLEMENTADO | API: endpoints de criação poderiam devolver sessão (auto-login) como o /auth/login |  |
| 232 | UX-IMOBIA-020 | Imobia | P3 | P | 1.33 | todos | Abrir detalhe não tem loading nem tratamento de erro (clique parece morto) | `apps/imobia/frontend/src/views/app/Imoveis.vue:57-60` | IMPLEMENTADO | — |  |
| 233 | UX-IMOBIA-021 | Imobia | P3 | P | 1.33 | todos | UI pública promete PTAM/laudo 'em PDF' sem nenhum gerador de PDF no código | `apps/imobia/api/src/modules-catalog.ts:69` | OBSOLETO/DIVERGENTE | produto: decidir fase da exportação em PDF |  |
| 234 | UX-NAV-010 | Integração/Navegação | P3 | P | 1.33 | platform-admins, project-members | Identidade do Portal e Portal Recorder depende do backend do Console; falha vira 'Entrar' enganoso | `portal/frontend/index.html:106` | IMPLEMENTADO | UX-PORTAL-005 |  |
| 235 | UX-NEURO-011 | NeuroEvolui | P2 | P | 1.33 | professional, patient | Menu lateral estático para todos os papéis — restrições só descobertas ao clicar | `apps/neuroevolui/frontend/src/nav.js:1-3` | IMPLEMENTADO | UX-NEURO-001 |  |
| 236 | UX-NEURO-012 | NeuroEvolui | P2 | P | 1.33 | professional, clinic_manager | Calendário do Dashboard rotula eventos com patient_id cru e o clique não abre a consulta | `apps/neuroevolui/frontend/src/views/DashboardView.vue:196-197` | IMPLEMENTADO | — |  |
| 237 | UX-PORTAL-005 | Portal | P2 | P | 1.33 | operador | Sessão expirada apaga descoberta, nav e rodapé do operador sem nenhum aviso | `portal/frontend/assets/portal.js:396-403` | IMPLEMENTADO | — |  |
| 238 | UX-PREC-002 | Portal Recorder | P2 | P | 1.33 | operador | TokenBar mostra 'configurado' (verde) sem validar o token | `apps/portal-recorder/frontend/src/App.jsx:84-87` | IMPLEMENTADO | API: endpoint de checagem do Bearer (para validação proativa no salvar); rebaixamento reativo via 401 é frontend-only |  |
| 239 | UX-PREC-008 | Portal Recorder | P2 | P | 1.33 | operador | Sessões nunca recebem título: lista vira '(sem título)' repetido | `apps/portal-recorder/frontend/src/views/PortalsView.jsx:215` | PARCIALMENTE IMPLEMENTADO | — |  |
| 240 | UX-PREC-014 | Portal Recorder | P3 | P | 1.33 | todos | Fontes da identidade carregadas de CDN externo (Google Fonts) | `apps/portal-recorder/frontend/index.html:15-19` | IMPLEMENTADO | — |  |
| 241 | UX-QA-008 | QA/Regressão | P2 | P | 1.33 | operador-dev da plataforma | Smoke de publicação é só HTTP-status: SPA com bundle/rota quebrada publica 'verde' | `scripts/publish-app.ps1:53-57` | PARCIALMENTE IMPLEMENTADO | — | ✔ |
| 242 | UX-REQHUB-004 | Reqhub | P2 | P | 1.33 | operador | Exclusão total de projeto confirmada só com window.confirm genérico | `apps/reqhub/frontend/assets/studio.js:909-913` | IMPLEMENTADO | — | ✔ |
| 243 | UX-RMAMB-004 | RM Ambiental | P2 | P | 1.33 | visitante | Link 'Política de Privacidade' do footer é href="#" morto em todas as páginas | `apps/rmambiental/src/components/Footer.tsx:101-104` | PARCIALMENTE IMPLEMENTADO | produto: definir/redigir a política de privacidade |  |
| 244 | UX-RMAMB-005 | RM Ambiental | P2 | P | 1.33 | visitante | Lightbox da galeria sem gerenciamento de foco (sem trap, sem mover/devolver foco) | `apps/rmambiental/src/components/SectionRenderer.tsx:290-295` | PARCIALMENTE IMPLEMENTADO | — |  |
| 245 | UX-SICAT-015 | SICAT | P3 | P | 1.33 | todos | Painel do copiloto usa <dialog open> sem focus trap | `apps/sicat/frontend/src/components/conversation/InAppCopilotAssistant.vue:257-262` | PARCIALMENTE IMPLEMENTADO | — |  |
| 246 | UX-ZAP-008 | ZapBridge | P2 | P | 1.33 | usuário | 3 das 5 abas da navegação principal levam a 'Em breve' | `apps/zapbridge/web/src/components/WhatsAppTabBar.tsx:32` | PARCIALMENTE IMPLEMENTADO | produto: decidir se as abas ficam (roadmap) ou saem até existirem |  |
| 247 | UX-ZAP-010 | ZapBridge | P2 | P | 1.33 | usuário | 'Arquivadas' exibe a contagem real mas o clique leva a 'Em breve' | `apps/zapbridge/web/src/components/ChatListPanel.tsx:115-118` | PARCIALMENTE IMPLEMENTADO | — |  |
| 248 | UX-ZAP-011 | ZapBridge | P2 | P | 1.33 | usuário | Placeholder 'Pergunte a IA ou pesquise' promete busca por IA que o campo não faz | `apps/zapbridge/web/src/components/ChatListPanel.tsx:87` | PARCIALMENTE IMPLEMENTADO | — | ✔ |
| 249 | UX-ZAP-012 | ZapBridge | P2 | P | 1.33 | usuário | Audio: parar a gravacao sempre envia (sem cancelar) e microfone negado falha em silencio | `apps/zapbridge/web/src/components/MessageInput.tsx:93-99` | IMPLEMENTADO | — |  |
| 250 | UX-ZAP-014 | ZapBridge | P2 | P | 1.33 | usuário | Overlays sem gestao de foco; abrir imagem no viewer não e alcancavel por teclado | `apps/zapbridge/web/src/components/MediaViewer.tsx:15-17` | IMPLEMENTADO | — |  |
| 251 | UX-ZAP-017 | ZapBridge | P2 | P | 1.33 | usuário | Nova conversa limitada a contatos nomeados sincronizados; impossível iniciar por número | `apps/zapbridge/web/src/pages/ContactsPage.tsx:48-53` | IMPLEMENTADO | — |  |
| 252 | UX-A11Y-008 | A11y plataforma | P3 | M | 1.2 | todos | Abas/segmented controls sem contrato ARIA em 4 apps — o ui-vue não oferece primitiva de Tabs | `packages/ui-vue/src/index.js:3-21` | PARCIALMENTE IMPLEMENTADO | UX-BESC-006; UX-GYMOPS-023; UX-REQHUB-009; UX-ZAP-021 |  |
| 253 | UX-AICP-002 | UX de IA | P2 | G | 1 | operador-plataforma | Governanca fragmentada em 3 meias-UIs (SICAT, Reqhub, Grafana) com gating e recortes distintos, sem federacao | `apps/sicat/frontend/src/router.js:318-324` | PARCIALMENTE IMPLEMENTADO | UX-AICP-001 |  |
| 254 | UX-ANA-007 | Ana Rabottini | P3 | PP | 1 | visitante | Catch-all renderiza a Home mantendo a URL inválida — sem página 404 | `apps/anarabottini/src/App.tsx:42-46` | IMPLEMENTADO | — | ✔ |
| 255 | UX-ANA-010 | Ana Rabottini | P3 | PP | 1 | editor-cms | SLUG_TO_PATH do modo edição mapeia 'solucoes', rota inexistente neste portal | `apps/anarabottini/src/lib/cmsEdit.tsx:21` | OBSOLETO/DIVERGENTE | — | ✔ |
| 256 | UX-BESC-016 | BESC | P3 | PP | 1 | manager, admin | Barra de progresso de documentação sem semântica programática | `apps/besc/frontend/src/ui.jsx:91-98` | IMPLEMENTADO | — | ✔ |
| 257 | UX-BESC-018 | BESC | P3 | PP | 1 | public | Botão 'Casos' do hero da home sem o marcador de área restrita que o entry-card tem | `apps/besc/frontend/src/pages/PortalHome.jsx:49` | IMPLEMENTADO | — | ✔ |
| 258 | UX-CONSOLE-011 | Console | P3 | PP | 1 | platform-admins | Estado vazio falso ('Nenhum pod encontrado') exibido junto do banner de erro | `console/frontend/src/components/Overview.jsx:136-140` | IMPLEMENTADO | — | ✔ |
| 259 | UX-CONSOLE-014 | Console | P3 | PP | 1 | project-members, platform-admins | Input do VideoPicker sem rótulo acessível (só placeholder) | `console/frontend/src/components/cms/VideoPicker.jsx:64-65` | IMPLEMENTADO | — | ✔ |
| 260 | UX-CONSOLE-015 | Console | P3 | PP | 1 | platform-admins | Badge de status do SSE muda sem aria-live (conectando/ao vivo/reconectando) | `console/frontend/src/components/TopBar.jsx:28-31` | IMPLEMENTADO | — | ✔ |
| 261 | UX-CONSOLE-018 | Console | P3 | PP | 1 | platform-admins | runId de Publicações exibido como número solto, sem link para o run do CI | `console/frontend/src/components/Publications.jsx:140` | IMPLEMENTADO | — | ✔ |
| 262 | UX-CV360-018 | ContaViva 360 | P3 | PP | 1 | cliente_pj | Modelo de filtro inconsistente: AP/AR recarregam on-change; Relatórios exigem 'Gerar relatório' | `apps/contaviva-360/frontend/src/views/FinancialReportsView.vue:7` | IMPLEMENTADO | — |  |
| 263 | UX-CV360-019 | ContaViva 360 | P3 | PP | 1 | cliente_pf | Clicar num documento pendente específico (painel PF) ignora a linha e abre a lista geral | `apps/contaviva-360/frontend/src/views/DashboardClientePfView.vue:134` | IMPLEMENTADO | — |  |
| 264 | UX-CVPRO-014 | ContaViva Pro | P3 | PP | 1 | admin | Idioma misto nos papéis: badge exibe 'member'/'admin' cru; formulário exibe 'membro' | `apps/contaviva-pro/frontend/src/views/AdminUsuariosView.vue:12` | IMPLEMENTADO | — | ✔ |
| 265 | UX-DOCS-006 | Docs↔código | P2 | G | 1 | operador | neuroevolui: papel patient e o default da API mas não existe nenhuma area do paciente no frontend | `specs/baseline/products.json:199` | PARCIALMENTE IMPLEMENTADO | produto: priorizar a area do paciente ou revisar a visao/REQs |  |
| 266 | UX-DOCS-010 | Docs↔código | P2 | G | 1 | operador, agente-claude | 381/381 REQs marcados deployed/done com dimensão de evidencia em 0% — status auto-declarado sem prova | `specs/baseline/implementation-status.json:5-9` | PARCIALMENTE IMPLEMENTADO | UX-DOCS-005; produto: politica de evidencia mínima por REQ deployado |  |
| 267 | UX-DOCS-011 | Docs↔código | P3 | PP | 1 | agente-claude | zapbridge: AGENTS.md promete 'injeta PWA' enquanto o app novo tem SW kill-switch que remove o PWA | `apps/zapbridge/AGENTS.md:90` | OBSOLETO/DIVERGENTE | — | ✔ |
| 268 | UX-DOCS-012 | Docs↔código | P3 | PP | 1 | agente-claude | Portal: README e cabecalho do CSS descrevem só dark automático; o mecanismo real inclui o toggle da casca | `portal/README.md:37-38` | OBSOLETO/DIVERGENTE | — | ✔ |
| 269 | UX-DS-009 | Design System | P2 | G | 1 | operador-dev da plataforma | Nenhum teste de renderização, regressão visual ou axe em toda a camada de DS | `.github/workflows/design-tokens-gate.yml:24-42` | NÃO INICIADO | — |  |
| 270 | UX-NEURO-020 | NeuroEvolui | P3 | PP | 1 | clinic_manager, owner | 'Auditoria' agrupada sob 'Financeiro' no menu, embora cubra todo o domínio | `apps/neuroevolui/frontend/src/nav.js:20-25` | IMPLEMENTADO | — | ✔ |
| 271 | UX-NEURO-022 | NeuroEvolui | P3 | PP | 1 | clinic_manager, owner | Duas superfícies de notificação com rótulos quase idênticos e sem ponte (CRUD admin vs Settings) | `apps/neuroevolui/frontend/src/nav.js:38-40` | IMPLEMENTADO | — |  |
| 272 | UX-PORTAL-008 | Portal | P3 | PP | 1 | operador | Nenhuma pista na home pública de que existe área logada de operador além do 'Entrar' da casca | `portal/frontend/assets/platform-shell.js:263-266` | NÃO INICIADO | produto: decidir quanto vocabulário interno expor na home pública |  |
| 273 | UX-PREC-013 | Portal Recorder | P3 | PP | 1 | operador | README omite os DELETE de portal/sessão usados pela UI | `apps/portal-recorder/README.md:12-18` | OBSOLETO/DIVERGENTE | — |  |
| 274 | UX-PREC-015 | Portal Recorder | P3 | PP | 1 | operador | Primeiro acesso não orienta onde obter o PORTAL_REC_TOKEN | `apps/portal-recorder/frontend/src/App.jsx:104-113` | NÃO INICIADO | — | ✔ |
| 275 | UX-QA-002 | QA/Regressão | P1 | G | 1 | operador-dev da plataforma | As 18 specs Playwright e os 55 testes de backend do sicat não rodam em nenhum gate de PR | `.github/workflows/ci-apps.yml:65` | PARCIALMENTE IMPLEMENTADO | API: CETESB_GATEWAY_MODE=mock estável para CI (test-services.yml já documenta a pendência) |  |
| 276 | UX-QA-006 | QA/Regressão | P2 | G | 1 | operador-dev da plataforma | Smoke por papel existe só no gymops; besc, sicat, console e contaviva-360 não testam nenhuma jornada por papel | `apps/gymops/apps/web/e2e/smoke/owner.smoke.spec.ts:10-15` | PARCIALMENTE IMPLEMENTADO | UX-BESC-002; UX-CONSOLE-008; UX-CV360-014; UX-NEURO-011 |  |
| 277 | UX-QA-010 | QA/Regressão | P3 | PP | 1 | operador-dev da plataforma | E2E do gymops roda só Desktop Chrome, contra a própria regra crítica de 375px do CLAUDE.md do app | `apps/gymops/apps/web/playwright.config.ts:17-22` | PARCIALMENTE IMPLEMENTADO | — | ✔ |
| 278 | UX-REQHUB-009 | Reqhub | P3 | PP | 1 | operador | Stepper do Studio usa role=tablist/tab sem tabpanel/aria-controls | `apps/reqhub/frontend/assets/studio.js:543` | PARCIALMENTE IMPLEMENTADO | — | ✔ |
| 279 | UX-REQHUB-010 | Reqhub | P3 | PP | 1 | operador | View 'Desenvolvimento' órfã: código completo, tela inalcançável | `apps/reqhub/frontend/assets/app.js:2285` | OBSOLETO/DIVERGENTE | — | ✔ |
| 280 | UX-REQHUB-012 | Reqhub | P3 | PP | 1 | operador | Zona de risco simplesmente omitida em produtos protegidos, sem explicar a proteção | `apps/reqhub/frontend/assets/studio.js:575-576` | IMPLEMENTADO | — |  |
| 281 | UX-RMAMB-008 | RM Ambiental | P3 | PP | 1 | visitante | Rota inválida renderiza a Home mantendo a URL errada, sem 404 nem redirect | `apps/rmambiental/src/App.tsx:44` | IMPLEMENTADO | — | ✔ |
| 282 | UX-SICAT-003 | SICAT | P1 | G | 1 | admin global / SRE | Administração de acessos é somente leitura; API de escrita completa sem superfície | `apps/sicat/backend/src/services/access-admin-service.ts:639` | PARCIALMENTE IMPLEMENTADO | — |  |
| 283 | UX-ZAP-021 | ZapBridge | P3 | PP | 1 | usuário | Chips de filtro e abas de modo sem estado acessível (aria-pressed/selected) | `apps/zapbridge/web/src/components/ChatListPanel.tsx:99-105` | IMPLEMENTADO | — | ✔ |
| 284 | UX-ZAP-022 | ZapBridge | P3 | PP | 1 | usuário | Status de leitura (✓✓ azul vs cinza) comunicado apenas por cor | `apps/zapbridge/web/src/components/MessageBubble.tsx:16-18` | IMPLEMENTADO | — | ✔ |
| 285 | UX-ZAP-024 | ZapBridge | P3 | PP | 1 | usuário | Copiar mensagem não da nenhum feedback de sucesso | `apps/zapbridge/web/src/components/MessageBubble.tsx:89-91` | IMPLEMENTADO | — | ✔ |
| 286 | UX-ZAP-025 | ZapBridge | P3 | PP | 1 | usuário | Markdown das respostas da IA renderiza títulos como <div> (sem semantica de heading) | `apps/zapbridge/web/src/components/Markdown.tsx:72-73` | IMPLEMENTADO | — | ✔ |
| 287 | UX-AICP-003 | UX de IA | P2 | M | 0.8 | operador-plataforma | Promote/rollback de prompts — operacao mais arriscada da governanca — sem UI de diff/preview | `apps/ai-control-plane/api/src/routes.js:79-80` | NÃO INICIADO | UX-AICP-001 |  |
| 288 | UX-BESC-013 | BESC | P2 | M | 0.8 | public | Player de vídeo da biblioteca sem suporte a legendas (<track>) | `apps/besc/frontend/src/ui.jsx:300` | IMPLEMENTADO | produto: produzir arquivos de legenda (VTT) para os 4 vídeos do PVC |  |
| 289 | UX-QA-005 | QA/Regressão | P2 | M | 0.8 | operador-dev da plataforma | Zero verificação automatizada de acessibilidade na plataforma: nenhuma dependência axe e nenhum workflow roda auditoria | `.github/workflows/design-tokens-gate.yml:38-42` | NÃO INICIADO | UX-DS-009; UX-DS-003; UX-PORTAL-002 |  |
| 290 | UX-QA-007 | QA/Regressão | P2 | M | 0.8 | operador-dev da plataforma | Harness de teclado inexistente: únicos asserts de Tab da frota estão na home pública do sicat | `apps/sicat/frontend/tests/ui/qa-homepage-public-theme-contrast.spec.ts:244-247` | NÃO INICIADO | UX-GYMOPS-002; UX-IMOBIA-001; UX-CONSOLE-001; UX-CONSOLE-004; UX-ZAP-001; UX-CV360-008; UX-PREC-001; UX-SICAT-012 |  |
| 291 | UX-QA-009 | QA/Regressão | P2 | M | 0.8 | operador-dev da plataforma | Sessão expirada: 8 superfícies com achado e zero testes na frota simulam 401/expiração | `apps/gymops/apps/web/e2e/smoke/owner.smoke.spec.ts:10-12` | NÃO INICIADO | UX-GYMOPS-007; UX-CVPRO-003; UX-CVPRO-004; UX-IMOBIA-007; UX-ZAP-002; UX-NEURO-007; UX-CONSOLE-007; UX-SICAT-004 |  |
| 292 | UX-ZAP-016 | ZapBridge | P2 | M | 0.8 | usuário | Sem recuperação de senha: esquecer a senha significa perder a conta | `apps/zapbridge/web/src/pages/LoginPage.tsx:56-61` | NÃO INICIADO | API: endpoint de reset de senha (e-mail ou código) |  |
| 293 | UX-ZAP-020 | ZapBridge | P2 | M | 0.8 | usuário | Encaminhar mensagem não existe na web (botão condicionado a prop nunca passada) | `apps/zapbridge/web/src/components/MessageBubble.tsx:52` | PARCIALMENTE IMPLEMENTADO | API: endpoint REST de forward para uso direto da UI (hoje só via tool de IA) |  |
| 294 | UX-ANA-008 | Ana Rabottini | P3 | P | 0.67 | visitante | LeadForm sem confirmação de sucesso após o envio | `apps/anarabottini/src/components/LeadForm.tsx:48-57` | IMPLEMENTADO | — |  |
| 295 | UX-ANA-009 | Ana Rabottini | P3 | P | 0.67 | visitante | Sem scrollspy: item ativo do menu só atualiza por clique (hash), não pela rolagem | `apps/anarabottini/src/components/Header.tsx:23-31` | IMPLEMENTADO | — |  |
| 296 | UX-CV360-017 | ContaViva 360 | P3 | P | 0.67 | cliente_pj, contador | Export CSV/XLSX sem feedback e sem tratamento real de erro | `apps/contaviva-360/frontend/src/views/FinancialReportsView.vue:113-117` | IMPLEMENTADO | — |  |
| 297 | UX-GYMOPS-024 | GymOps | P3 | P | 0.67 | owner, org_manager | window.confirm nativo em ações críticas (revogar acesso, bulk) destoa do DS e não detalha impacto | `apps/gymops/apps/web/src/app/(app)/settings/team/page.tsx:183-185` | IMPLEMENTADO | — |  |
| 298 | UX-NAV-004 | Integração/Navegação | P2 | GG | 0.67 | usuário-de-produto | Auth fragmentada entre produtos: 5 modelos convivem e o 'Sair' da casca não desloga nenhum produto | `apps/sicat/frontend/src/services/keycloak.js:3` | IMPLEMENTADO | UX-CVPRO-011; UX-IMOBIA-016; UX-CV360-001; UX-NEURO-001; UX-GYMOPS-001; UX-BESC-012; UX-ZAP-016 |  |
| 299 | UX-NEURO-006 | NeuroEvolui | P1 | GG | 0.67 | patient | Papel patient existe no RBAC e na visão do produto, mas não tem nenhuma superfície no frontend | `apps/neuroevolui/api/src/rbac.js:4` | PARCIALMENTE IMPLEMENTADO | produto: escopo da área do paciente (consultas próprias, orientações, IA modo paciente) |  |
| 300 | UX-NEURO-019 | NeuroEvolui | P3 | P | 0.67 | clinic_manager, professional | Calendário semanal do Dashboard ignora o filtro de período selecionado | `apps/neuroevolui/frontend/src/views/DashboardView.vue:488-492` | IMPLEMENTADO | — |  |
| 301 | UX-REQHUB-011 | Reqhub | P3 | P | 0.67 | operador | Deep-links parciais: busca e filtros avançados do Explorador não vão à URL | `apps/reqhub/frontend/assets/app.js:2272-2274` | PARCIALMENTE IMPLEMENTADO | — |  |
| 302 | UX-RMAMB-009 | RM Ambiental | P3 | P | 0.67 | visitante | Fontes via Google Fonts: dependência externa render-block e envio de IP a terceiro | `apps/rmambiental/index.html:45-50` | IMPLEMENTADO | — |  |
| 303 | UX-ZAP-023 | ZapBridge | P3 | P | 0.67 | usuário | Indicador 🔓 'Conversas trancadas acessíveis' aparece sem explicacao do recurso de tranca | `apps/zapbridge/web/src/pages/AssistantPage.tsx:100` | PARCIALMENTE IMPLEMENTADO | produto: definir a superfície de trancar/destrancar conversas na web |  |
| 304 | UX-ZAP-026 | ZapBridge | P3 | G | 0.25 | usuário | Tema escuro fixo: legado tinha claro/escuro/sistema e o doc funcional preve seletor | `apps/zapbridge/web/index.html:7` | PARCIALMENTE IMPLEMENTADO | produto: confirmar se dark-only e decisão de design ou divida |  |

### 10.2 Detalhe dos achados P0 e P1 (87 itens, ordem de prioridade)



#### UX-CVPRO-001 — API de records sem autenticação: o front finge proteção que a API não impõe (P0 · P)

- **Produto/superfícies:** ContaViva Pro
- **Papel/jornada:** todos · jornada J-CVPRO-01 · frequência: sempre
- **Categoria/estado:** rbac-seguranca-percebida · IMPLEMENTADO · confiança: verificado-no-código · verificação: CONFIRMADO
- **Impacto no usuário:** Operador acredita que os dados exigem login; qualquer anônimo lê/cria/submete registros via API
- **Impacto no negócio:** Segurança percebida falsa no domínio inteiro do produto; exposição de dados do tenant
- **Evidência:** `apps/contaviva-pro/api/src/server.js:25`
- **Recomendação:** Alinhar autoridade: exigir Bearer nos endpoints /v1/records* como já ocorre em /me e /v1/users (dependência de API); enquanto isso, não comunicar na UI que os registros são privados.
- **Critérios de aceite:** GET /v1/records sem Authorization responde 401 · UI continua funcionando com o Bearer já enviado pelo api.js
- **Método de validação:** contrato-api · **dependências:** API: adicionar requireAuth (e escopo real de tenant) aos endpoints /v1/records*

#### UX-CVPRO-002 — Editar registro sempre falha: UI chama PUT /v1/records/:id, rota que não existe no backend (P0 · P)

- **Produto/superfícies:** ContaViva Pro
- **Papel/jornada:** todos · jornada J-CVPRO-04 · frequência: sempre
- **Categoria/estado:** navegação · PARCIALMENTE IMPLEMENTADO · confiança: verificado-no-código · verificação: CONFIRMADO
- **Impacto no usuário:** Botão 'Editar' convida à jornada; salvar termina sempre em toast críptico 'HTTP 404' e nada é salvo
- **Impacto no negócio:** Jornada de edição bloqueada para todos os papéis; percepção de produto quebrado
- **Evidência:** `apps/contaviva-pro/frontend/src/api.js:34`
- **Recomendação:** Implementar PUT /v1/records/:id no backend (dependência) OU remover a rota /records/:id/edit e o botão Editar até existir; nunca oferecer ação primária que falha por contrato.
- **Critérios de aceite:** Salvar edição persiste o título e volta à lista com toast de sucesso · Nenhuma ação visível resulta em 404 de rota inexistente
- **Método de validação:** contrato-api · **dependências:** API: criar PUT /v1/records/:id (ou remover rota/botão de edição do front)

#### UX-GYMOPS-001 — Login via Google/SSO nunca resolve organizationId/papel — app abre vazio e sem explicação (P0 · P)

- **Produto/superfícies:** GymOps
- **Papel/jornada:** todos · jornada J-GYMOPS-07 · frequência: sempre
- **Categoria/estado:** onboarding · PARCIALMENTE IMPLEMENTADO · confiança: verificado-no-código · verificação: CONFIRMADO
- **Impacto no usuário:** Quem entra por OAuth/SSO no 1º acesso vê sidebar vazio, org 'GymOps' e /me sem dados — produto inoperável, sem erro.
- **Impacto no negócio:** Canal de login exibido com destaque no /login gera abandono imediato; suporte não tem pista (nenhum erro).
- **Evidência:** `apps/gymops/apps/web/src/app/(auth)/auth/callback/page.tsx:31-34`
- **Recomendação:** No callback, após /auth/consume, buscar o contexto (org/role/primaryUnitId) num endpoint equivalente ao payload do login, chamar setOrganizationId/setUserContext/setPlatformAdmin e usar o mesmo resolveRedirect do login em vez de '/dashboard' fixo.
- **Critérios de aceite:** Login Google/SSO de usuário com membership termina na landing correta do papel com sidebar populado · Usuário OAuth sem membership vê mensagem 'sem acesso' em vez de app vazio
- **Método de validação:** playwright · **dependências:** API: /auth/consume (ou um /me/context) precisa devolver organizationId/role/primaryUnitId como o /auth/login

#### UX-IMOBIA-001 — Detalhes de todos os módulos abrem só por clique de mouse (cards/linhas sem teclado) (P0 · P)

- **Produto/superfícies:** Imobia
- **Papel/jornada:** todos · jornada J-IMOBIA-02 · frequência: sempre
- **Categoria/estado:** wcag-2.1.1 · IMPLEMENTADO · confiança: verificado-no-código · verificação: CONFIRMADO
- **Impacto no usuário:** Usuário de teclado/leitor de tela não abre nenhum detalhe (timeline, score, fotos, cartas, PTAM) em módulo algum
- **Impacto no negócio:** Exclusão total de usuários com deficiência motora/visual das jornadas principais; risco legal (LBI) num produto comercial
- **Evidência:** `apps/imobia/frontend/src/views/app/Imoveis.vue:89`
- **Recomendação:** Tornar o alvo primário de cada card/linha um elemento interativo real (button/link) ou adicionar tabindex="0" + @keydown.enter/.space + role="button" com foco visível, nos 5 módulos com detalhe (Imóveis, Leads, Vistorias, Corbam, Mercado).
- **Critérios de aceite:** Tab alcança cada card/linha e Enter/Espaço abre o detalhe · Foco visível no elemento ativo
- **Método de validação:** teste-manual-teclado

#### UX-A11Y-003 — Badges de status reprovam AA nas 2 raízes de tokens pelo mesmo anti-padrão: cor crua do tom sobre tinta do próprio tom, sem validação contra o fundo tintado (P1 · P)

- **Produto/superfícies:** A11y plataforma (afeta: portal, console, reqhub, portal-recorder, contaviva-360, contaviva-pro, neuroevolui)
- **Papel/jornada:** todos · jornada J-A11Y-02 · frequência: sempre
- **Categoria/estado:** wcag-1.4.3 · IMPLEMENTADO · confiança: verificado-no-código · verificação: CONFIRMADO
- **Impacto no usuário:** Rótulos de status pequenos (10-12px) abaixo de 4,5:1 no tema claro em portal (medido vivo 2,8:1), portal-recorder, console/reqhub (mesma raiz) e nos 3 apps da Forja (4,03/3,91:1).
- **Impacto no negócio:** Correção em 2 renderers + regeneração conserta 7+ superfícies de uma vez; a família sicat (pares status-*-bg/fg) já mostra o modelo certo dentro do próprio tokens.json.
- **Evidência:** `packages/design-tokens/renderers/platform.mjs:33-35`
- **Recomendação:** Nos 2 renderers, derivar par bg/fg de badge validando ensureContrast contra o fundo TINTADO (tom/α composto sobre surface), a exemplo dos pares sicat; emitir tokens de par (--p-warn-badge-bg/fg, --ui-warn-badge-*) e migrar .badge/.ui-badge; cobrir no teste de contraste.
- **Critérios de aceite:** contraste computado do texto dos badges ≥4,5:1 nos 2 temas nas 7 superfícies · teste de par tintado roda no gate
- **Método de validação:** unit-test · **dependências:** UX-PORTAL-001; UX-PREC-006; UX-DS-002

#### UX-CV360-003 — "Marcar como concluído" falha em silêncio (catch vazio) e sem confirmação nos 4 dashboards (P1 · PP)

- **Produto/superfícies:** ContaViva 360
- **Papel/jornada:** todos · jornada J-CV360-01 · frequência: ocasional
- **Categoria/estado:** estados · IMPLEMENTADO · confiança: verificado-no-código · verificação: CONFIRMADO
- **Impacto no usuário:** Em erro de rede/API nada acontece: sem toast, modal aberto, usuário reclica ou assume que concluiu
- **Impacto no negócio:** Status fiscal 'pago' pode ser assumido sem confirmação do sistema — risco de obrigação perdida
- **Evidência:** `apps/contaviva-360/frontend/src/views/DashboardClientePfView.vue:140-145`
- **Recomendação:** No catch, exibir toast.error com a mensagem da API e manter o modal; antes da ação, usar o useConfirm já montado no App ('Marcar IRPF como pago?'). Extrair concludeObrig para composable único usado pelos 4 dashboards.
- **Critérios de aceite:** Falha da API exibe erro visível e o modal permanece · Ação exige confirmação explícita
- **Método de validação:** teste-manual-teclado

#### UX-CV360-004 — Erro na detecção de papel cai silenciosamente no dashboard PF; estado de erro é código morto (P1 · PP)

- **Produto/superfícies:** ContaViva 360
- **Papel/jornada:** todos · jornada J-CV360-01 · frequência: ocasional
- **Categoria/estado:** estados · IMPLEMENTADO · confiança: verificado-no-código · verificação: CONFIRMADO
- **Impacto no usuário:** Admin/contador com /me falhando vê o painel de Cliente PF sem nenhum aviso de que a visão está errada
- **Impacto no negócio:** Decisões tomadas sobre a visão errada; UiErrorState com retry nunca renderiza
- **Evidência:** `apps/contaviva-360/frontend/src/views/DashboardView.vue:2-4`
- **Recomendação:** No catch, NÃO setar view: deixar roleError renderizar o UiErrorState com retry (detectRole já está ligado ao @retry). Se o fallback for desejado, exibir banner persistente 'não foi possível identificar seu perfil — mostrando visão padrão'.
- **Critérios de aceite:** Com /me retornando 500, a tela mostra erro com 'Tentar de novo' em vez do painel PF
- **Método de validação:** teste-manual-teclado

#### UX-CV360-006 — Tokens inexistentes (--ui-primary/--ui-radius) e triplets crus quebram o estado ativo e bordas nas telas financeiras (P1 · PP)

- **Produto/superfícies:** ContaViva 360
- **Papel/jornada:** todos · jornada J-CV360-02 · frequência: sempre
- **Categoria/estado:** ds-consistência · IMPLEMENTADO · confiança: verificado-no-código · verificação: CONFIRMADO
- **Impacto no usuário:** Botão de horizonte 30/60/90 ativo é idêntico ao inativo — usuário lê a projeção errada; filtros sem borda visível
- **Impacto no negócio:** Erro de leitura em projeção de caixa; drift visível do design system em fluxo principal
- **Evidência:** `apps/contaviva-360/frontend/src/views/CashFlowView.vue:56`
- **Recomendação:** Trocar por tokens reais: rgb(var(--ui-accent))/rgb(var(--ui-accent-fg)), rgb(var(--ui-border)), --ui-radius-sm\|md, --ui-text-xl; adicionar aria-pressed nos botões de horizonte. Vale um lint de CSS que rejeite var(--ui-*) fora de rgb() para triplets e tokens não declarados.
- **Critérios de aceite:** Botão de horizonte ativo tem fundo accent visível nos 2 temas · Filtros de AP/AR exibem borda
- **Método de validação:** inspecao-visual

#### UX-CV360-007 — Filtros de AP/AR e período do Dashboard Financeiro sem rótulo acessível; datas De/Até indistinguíveis (P1 · PP)

- **Produto/superfícies:** ContaViva 360
- **Papel/jornada:** cliente_pj, todos · jornada J-CV360-02 · frequência: sempre
- **Categoria/estado:** wcag-3.3.2 · IMPLEMENTADO · confiança: verificado-no-código · verificação: CONFIRMADO
- **Impacto no usuário:** Leitor de tela anuncia campos sem nome; usuário vidente não sabe qual input date é início e qual é fim
- **Impacto no negócio:** Violação WCAG nível A (3.3.2/1.3.1) em fluxo financeiro principal; filtros usados errado geram relatórios errados
- **Evidência:** `apps/contaviva-360/frontend/src/views/AccountsPayableView.vue:16-17`
- **Recomendação:** Envolver os filtros em UiFormField (como FinancialReportsView já faz nas linhas 24-33) ou no mínimo aria-label ('Status', 'Categoria', 'Período — início', 'Período — fim').
- **Critérios de aceite:** Todos os controles de filtro têm nome acessível verificável por axe · Datas De/Até visualmente rotuladas
- **Método de validação:** axe

#### UX-CVPRO-004 — Sessão expirada deixa o usuário numa tela morta: sem redirecionamento para /login (P1 · PP)

- **Produto/superfícies:** ContaViva Pro
- **Papel/jornada:** todos · jornada J-CVPRO-02 · frequência: frequente
- **Categoria/estado:** estados · PARCIALMENTE IMPLEMENTADO · confiança: verificado-no-código · verificação: CONFIRMADO
- **Impacto no usuário:** Na expiração, a sidebar esvazia e a view protegida fica montada com erro; usuário precisa deduzir que foi deslogado
- **Impacto no negócio:** Beco sem saída recorrente na jornada principal; suporte 'a tela sumiu'
- **Evidência:** `apps/contaviva-pro/frontend/src/router.js:30`
- **Recomendação:** No listener global de 'auth:logout', exibir toast 'Sessão expirada' e router.push({ name: 'login', query: { redirect: rota atual } }) — o mecanismo de retorno já existe no guard e no AuthView.
- **Critérios de aceite:** 401 em qualquer view leva a /login com aviso e redirect de volta · Nenhuma view protegida permanece montada sem sessão
- **Método de validação:** playwright

#### UX-GYMOPS-006 — Convite valida senha mínima 6 no cliente e placeholder diz 6, mas a API exige 8 (P1 · PP)

- **Produto/superfícies:** GymOps
- **Papel/jornada:** todos · jornada J-GYMOPS-02 · frequência: ocasional
- **Categoria/estado:** heuristica-prevencao · IMPLEMENTADO · confiança: verificado-no-código · verificação: CONFIRMADO
- **Impacto no usuário:** Convidado no primeiro contato com o produto digita senha de 6-7 chars, passa na validação local e recebe erro genérico do servidor.
- **Impacto no negócio:** Fricção exatamente no onboarding de novos membros; BUG-004 alinhou o /setup para 8 e esqueceu o convite.
- **Evidência:** `apps/gymops/apps/web/src/app/(auth)/invite/[token]/page.tsx:54`
- **Recomendação:** Trocar a validação e o placeholder do /invite para 8 caracteres, igual ao /setup e à API; opcionalmente mapear o 422 da API para mensagem amigável.
- **Critérios de aceite:** Senha de 7 chars é barrada no cliente com mensagem correta
- **Método de validação:** unit-test

#### UX-NAV-002 — Sonda de saúde do launcher: falso-negativo 'fora' para toda superfície atrás de SSO (P1 · P)

- **Produto/superfícies:** Integração/Navegação (afeta: portal, console, reqhub, portal-recorder)
- **Papel/jornada:** todos · jornada J-NAV-01 · frequência: frequente
- **Categoria/estado:** heuristica-visibilidade · IMPLEMENTADO · confiança: verificado-no-código · verificação: CONFIRMADO
- **Impacto no usuário:** Anonimo e usuários no host local leem 'fora' para Console/Reqhub/PortalRec/Keycloak saudaveis; diagnostico errado da plataforma.
- **Impacto no negócio:** Home publica exibe meia plataforma 'fora do ar' — imagem de instabilidade falsa.
- **Evidência:** `packages/platform-shell/shell.js:307-310`
- **Recomendação:** Sondar com { redirect: 'manual' } e tratar response.type 'opaqueredirect'/status 0 como 'up' (roteado); alternativa: sondar endpoint publico por superfície (ex.: /devops/api/health fora do gate). O fetch atual segue o 302 até dev.nvit.com.br e morre em CORS -> catch -> 'down'.
- **Critérios de aceite:** anonimo na home ve 'no ar' p/ as 4 superfícies SSO com cluster saudavel · teste unitario cobre o caminho de redirect real (opaqueredirect), não só healthFromStatus(302)
- **Método de validação:** teste-manual-teclado

#### UX-NEURO-003 — Desativar/Reativar paciente quebrado: confirm.ask não é função (useConfirm retorna a função ask) (P1 · PP)

- **Produto/superfícies:** NeuroEvolui
- **Papel/jornada:** professional, clinic_manager, owner · jornada J-NEURO-02 · frequência: sempre
- **Categoria/estado:** estados · IMPLEMENTADO · confiança: verificado-no-código · verificação: CONFIRMADO
- **Impacto no usuário:** Clicar em Desativar/Reativar na lista de pacientes não faz nada (TypeError em promessa) — falha silenciosa sem feedback.
- **Impacto no negócio:** Arquivamento de pacientes (fluxo administrativo básico) inoperante pela lista.
- **Evidência:** `apps/neuroevolui/frontend/src/views/PatientListView.vue:327`
- **Recomendação:** Trocar confirm.ask({...}) por confirm({...}) (padrão das demais 20+ views); opcional: lint/teste estático proibindo o acesso .ask no retorno de useConfirm().
- **Critérios de aceite:** Clicar Desativar abre o diálogo de confirmação e, confirmado, o status muda e a lista recarrega
- **Método de validação:** teste-manual-teclado

#### UX-NEURO-004 — Cadastro de paciente descarta silenciosamente CPF, gênero e referência externa (P1 · PP)

- **Produto/superfícies:** NeuroEvolui
- **Papel/jornada:** professional, clinic_manager, owner · jornada J-NEURO-02 · frequência: sempre
- **Categoria/estado:** heuristica-prevencao · IMPLEMENTADO · confiança: verificado-no-código · verificação: CONFIRMADO
- **Impacto no usuário:** Operador digita e valida o CPF; o dado some (backend só persiste 'document') e a lista mostra 'Sem documento'.
- **Impacto no negócio:** Perda de dado cadastral clínico sem erro; retrabalho e risco de identificação incorreta de paciente.
- **Evidência:** `apps/neuroevolui/frontend/src/views/PatientCreateView.vue:531-538`
- **Recomendação:** No Create, mapear o campo CPF para `document` (como o Edit já faz) e remover ou persistir gender/external_ref; alinhar as colunas cpf→document nas telas de lista/detalhe/dashboard.
- **Critérios de aceite:** Paciente criado com CPF aparece com o documento na lista e no detalhe
- **Método de validação:** contrato-api · **dependências:** API: decidir se gender/external_ref entram no schema de patients ou saem do form

#### UX-PORTAL-001 — Badges de status 'exige login'/'no ar' reprovam contraste AA no tema claro (2,8:1) (P1 · PP)

- **Produto/superfícies:** Portal
- **Papel/jornada:** todos · jornada J-PORTAL-01 · frequência: sempre
- **Categoria/estado:** wcag-1.4.3 · IMPLEMENTADO · confiança: verificado-no-código · verificação: CONFIRMADO
- **Impacto no usuário:** Baixa visão não lê o selo que diferencia app pública de app com login; tags e título de erro também ficam abaixo de 4,5:1 no claro.
- **Impacto no negócio:** Regressão de acessibilidade no fluxo principal da vitrine comercial; contradiz o selo 'Accessibility 100' divulgado no checklist.
- **Evidência:** `portal/frontend/assets/styles.css:595-604`
- **Recomendação:** Criar tokens de tinta p/ badges no tema claro (ex.: --warn-ink/--ok-ink ~ amber-800/green-800) mantendo os -soft como fundo; ajustar .tag e .state.is-error strong; revalidar com axe. Cálculo: warn 2,80:1, ok 2,88:1, tag 4,34:1, erro 3,67:1 (dark passa).
- **Critérios de aceite:** axe/contraste >=4.5:1 nos badges is-login/is-online e .tag no tema claro · checklist de a11y atualizado com nova medição datada
- **Método de validação:** axe

#### UX-RMAMB-002 — CLAUDE.md e docs/status.md descrevem conteúdo/arquivos que não existem mais no código (P1 · PP)

- **Produto/superfícies:** RM Ambiental
- **Papel/jornada:** todos · frequência: sempre
- **Categoria/estado:** divergencia-docs · OBSOLETO/DIVERGENTE · confiança: verificado-no-código · verificação: CONFIRMADO
- **Impacto no usuário:** Indireto: operador guiado pelos docs pode 'corrigir' conteúdo já real ou desconfiar da galeria/contato reais.
- **Impacto no negócio:** Retrabalho e risco de regressão de conteúdo; docs canônicos deixam de ser confiáveis.
- **Evidência:** `apps/rmambiental/CLAUDE.md:56-58`
- **Recomendação:** Atualizar CLAUDE.md (armadilhas 3/4) e docs/status.md: AuthoritySection.tsx não existe (stats no SectionRenderer/content.default.ts), projects.ts é galeria real, site.ts tem contato real; único AJUSTAR restante é o link de privacidade do Footer.
- **Critérios de aceite:** Docs não citam arquivos inexistentes nem marcam como placeholder conteúdo já real · Gap de placeholder restante (privacidade, nota dos stats) listado corretamente
- **Método de validação:** inspecao-visual

#### UX-GYMOPS-002 — Abrir atividade é impossível por teclado: cards são div onClick e linhas são tr onClick (WCAG 2.1.1 A) (P0 · M)

- **Produto/superfícies:** GymOps
- **Papel/jornada:** todos · jornada J-GYMOPS-03 · frequência: sempre
- **Categoria/estado:** wcag-2.1.1 · IMPLEMENTADO · confiança: verificado-no-código · verificação: CONFIRMADO
- **Impacto no usuário:** Usuário de teclado/leitor de tela não abre nenhuma atividade em /me, /units/:id e /activities — a interação central do produto.
- **Impacto no negócio:** Violação WCAG nível A no fluxo principal; exclui operadores com deficiência motora/visual do caso de uso nuclear.
- **Evidência:** `apps/gymops/apps/web/src/components/activities/ActivityCard.tsx:18-23`
- **Recomendação:** Tornar ActivityCard um <button> (ou div com role=button, tabIndex=0 e Enter/Espaço); na tabela, mover o clique para um botão/link no título da linha; título do drawer com botão 'Editar' e dropzone com <label> associado ao input file.
- **Critérios de aceite:** Tab alcança cada atividade e Enter abre o drawer nas 3 telas · axe não reporta 'clickable div' nas listas
- **Método de validação:** teste-manual-teclado

#### UX-NEURO-001 — SPA operacional sem guard nem fluxo de login; usuário sem sessão fica sem caminho de entrada (P0 · M)

- **Produto/superfícies:** NeuroEvolui
- **Papel/jornada:** todos · jornada J-NEURO-01 · frequência: sempre
- **Categoria/estado:** rbac-seguranca-percebida · IMPLEMENTADO · confiança: verificado-no-código · verificação: CONFIRMADO
- **Impacto no usuário:** Sem sessão, todas as 36 telas abrem e degradam para 'Acesso restrito' sem nenhum CTA de login; beco sem saída total.
- **Impacto no negócio:** Clínica não consegue operar sem intervenção do operador da plataforma; percepção de app quebrado/inseguro.
- **Evidência:** `apps/neuroevolui/frontend/src/main.js:8-9`
- **Recomendação:** Passar loginHref real ao UiAppShell (ex.: /oauth2/start?rd=...), adicionar guard/interceptor que trate 401 do /me redirecionando ao login, e/ou middleware console-auth-redirect na IngressRoute do frontend, preservando deep-link pós-login.
- **Critérios de aceite:** Sem sessão, abrir /neuroevolui/patients leva ao login e retorna à mesma rota · Com sessão, o e-mail do usuário aparece no topo
- **Método de validação:** playwright · **dependências:** produto: definir fluxo de login (borda oauth2-proxy com redirect ou botão PKCE padrão SICAT)

#### UX-A11Y-001 — Padrão sistêmico 'clicável fantasma': interação primária de 5+ produtos é div/tr/article onClick e a plataforma não tem primitiva nem gate que o impeça (P0 · G)

- **Produto/superfícies:** A11y plataforma (afeta: gymops, imobia, console, contaviva-360, zapbridge, reqhub)
- **Papel/jornada:** todos · jornada J-A11Y-01 · frequência: sempre
- **Categoria/estado:** wcag-2.1.1 · IMPLEMENTADO · confiança: verificado-no-código · verificação: CONFIRMADO-COM-RESSALVA
- **Impacto no usuário:** Usuário de teclado/AT não executa a ação nuclear (abrir atividade/detalhe/card/mensagem) em gymops, imobia, console, cv360 e zapbridge.
- **Impacto no negócio:** 2 P0 e 3 P1 locais são instâncias do MESMO defeito; sem correção de fundação, todo app novo renasce com ele (violação nível A recorrente).
- **Evidência:** `packages/ui-vue/src/index.js:3-21`
- **Recomendação:** Criar no ui-vue a primitiva de card/linha interativa (button-first, foco visível herdado do ui.css) + guideline React equivalente; adicionar grep-gate (onClick/@click em div\|tr\|article sem role/tabindex) ao CI; varrer os 5 apps pelos IDs locais.
- **Critérios de aceite:** ui-vue exporta primitiva interativa de card/linha usada pelos 3 apps da Forja · gate acusa div/tr/article com handler de clique sem semântica
- **Método de validação:** teste-manual-teclado · **dependências:** UX-GYMOPS-002; UX-GYMOPS-009; UX-GYMOPS-010; UX-IMOBIA-001; UX-CONSOLE-001; UX-CONSOLE-004; UX-CV360-008; UX-ZAP-001; UX-REQHUB-001

#### UX-BESC-003 — Ajuda pública descreve o sistema pré-evolução ('Não tem login') e ignora marketplace/papéis (P1 · P)

- **Produto/superfícies:** BESC
- **Papel/jornada:** todos · jornada J-BESC-01 · frequência: sempre
- **Categoria/estado:** divergencia-docs · OBSOLETO/DIVERGENTE · confiança: verificado-no-código · verificação: CONFIRMADO
- **Impacto no usuário:** Quem lê o guia constrói um modelo mental errado (sem login/sem investimento) que a topbar contradiz na hora
- **Impacto no negócio:** Novos perfis (investidor, auditor) ficam sem qualquer material de ajuda; suporte manual vira gargalo
- **Evidência:** `apps/besc/frontend/src/pages/Ajuda.jsx:78`
- **Recomendação:** Atualizar /ajuda: remover 'não tem login', adicionar seções por papel (criar conta e liberação, investir e carteira, auditoria, gestão) e apontar o modo demonstração/gate.
- **Critérios de aceite:** Nenhuma afirmação da Ajuda contradiz o app atual · Cada papel logável tem ao menos uma seção de ajuda própria
- **Método de validação:** inspecao-visual

#### UX-CONSOLE-002 — Modais e drawers sem focus trap nem devolução de foco ao fechar (P1 · P)

- **Produto/superfícies:** Console
- **Papel/jornada:** todos · jornada J-CONSOLE-03 · frequência: sempre
- **Categoria/estado:** wcag-2.4.3 · IMPLEMENTADO · confiança: verificado-no-código · verificação: CONFIRMADO
- **Impacto no usuário:** Tab escapa do diálogo para o fundo inerte; ao fechar, o foco se perde (volta ao body). Drawers nem foco inicial gerenciam.
- **Impacto no negócio:** Todos os formulários do Console vivem em modal/drawer — falha AA transversal.
- **Evidência:** `console/frontend/src/components/Modal.jsx:26-29`
- **Recomendação:** Adicionar trap de Tab (ciclar nos focáveis do dialog) e guardar/restaurar o elemento focado no open/close, no Modal e nos dois drawers (ItemDrawer, SectionDrawer).
- **Critérios de aceite:** Tab/Shift+Tab ciclam dentro do diálogo aberto · Fechar devolve o foco ao controle que abriu
- **Método de validação:** teste-manual-teclado

#### UX-CV360-005 — Identidade invisível: /me não retorna email e o shell nunca mostra usuário, papel ou logout (P1 · P)

- **Produto/superfícies:** ContaViva 360
- **Papel/jornada:** todos · frequência: sempre
- **Categoria/estado:** heuristica-visibilidade · PARCIALMENTE IMPLEMENTADO · confiança: verificado-no-código · verificação: CONFIRMADO
- **Impacto no usuário:** Usuário não sabe quem está 'logado' nem qual papel está ativo; não há como sair ou trocar de contexto
- **Impacto no negócio:** Num sistema multi-papel com dados fiscais, a falta de indicador de identidade mina a confiança
- **Evidência:** `apps/contaviva-360/api/src/server.js:33`
- **Recomendação:** Alinhar o contrato: /me devolver email (ou o shell aceitar user/role) e exibir chip com papel ativo ('local · member'); adicionar loginHref quando a borda SSO existir para o botão 'Entrar' aparecer.
- **Critérios de aceite:** Topbar exibe identidade e papel ativos em todas as telas
- **Método de validação:** inspecao-visual · **dependências:** API: incluir email/nome no GET /me (hoje retorna role/user/tenantId)

#### UX-CVPRO-003 — Sessão morre a cada ~15 min: o 401 destrói o refresh token em vez de usá-lo (P1 · P)

- **Produto/superfícies:** ContaViva Pro
- **Papel/jornada:** todos · jornada J-CVPRO-02 · frequência: frequente
- **Categoria/estado:** estados · PARCIALMENTE IMPLEMENTADO · confiança: verificado-no-código · verificação: CONFIRMADO
- **Impacto no usuário:** Relogin forçado a cada ~15 min, com perda de formulários em andamento, apesar do refresh de 7 dias existir
- **Impacto no negócio:** Fricção crônica que mina a confiança; o bloco contas-acesso parece quebrado ao operador
- **Evidência:** `apps/contaviva-pro/api/src/auth.js:19-20`
- **Recomendação:** No request() do api.js, ao receber 401 com refresh token guardado: chamar POST /auth/refresh, repetir a chamada original e só deslogar se o refresh falhar. Backend já suporta rotação (rotateSession).
- **Critérios de aceite:** Após expirar o access token, uma chamada de API renova a sessão sem interação · Logout só acontece quando o refresh é inválido/revogado
- **Método de validação:** playwright

#### UX-DOCS-001 — Vitrine da Forja apresenta contaviva-pro como not_started/0 REQs com o app no ar sob Argo (P1 · P)

- **Produto/superfícies:** Docs↔código (afeta: reqhub, contaviva-pro, specs)
- **Papel/jornada:** operador, agente-claude · jornada J-DOCS-01 · frequência: sempre
- **Categoria/estado:** divergencia-docs · OBSOLETO/DIVERGENTE · confiança: verificado-no-código · verificação: CONFIRMADO
- **Impacto no usuário:** Operador ve 'produto novo/sem nada' e pode retrabalhar ou ignorar um app publicado com auth própria e 10 rotas.
- **Impacto no negócio:** Portfolio subreportado; decisões de priorizacao e apresentacao a clientes baseadas em status falso.
- **Evidência:** `specs/baseline/products.json:86-91`
- **Recomendação:** Atualizar specs/products/contaviva-pro/product.json (scaffold=merged, build=deployed com nota) e regenerar a baseline (/sync-spec); opcionalmente backfill de REQs no padrão D5 (imobia/zapbridge) para a vitrine refletir progresso real.
- **Critérios de aceite:** products.json mostra build deployed para contaviva-pro após regeneracao · Studio deixa de categorizar contaviva-pro como 'new'
- **Método de validação:** inspecao-visual

#### UX-DS-001 — DESIGN_SYSTEM.md canônico descreve camadas inexistentes (ui-react/ui-vanilla) e omite ui-vue/platform-shell (P1 · P)

- **Produto/superfícies:** Design System (afeta: plataforma, todos-os-apps)
- **Papel/jornada:** operador-dev da plataforma · jornada J-DS-04 · frequência: sempre
- **Categoria/estado:** divergencia-docs · OBSOLETO/DIVERGENTE · confiança: verificado-no-código · verificação: CONFIRMADO
- **Impacto no usuário:** Operador e agentes de codegen que seguem o doc canônico são mandados a pacotes que não existem; o kit real fica invisível.
- **Impacto no negócio:** Risco de duplicação de componentes e decisões erradas de arquitetura; doc canônico órfão (0 referências em *.md).
- **Evidência:** `DESIGN_SYSTEM.md:26-27`
- **Recomendação:** Reescrever a tabela de camadas do DESIGN_SYSTEM.md refletindo o real (A=design-tokens com 4 rotas; B=ui-vue; C=platform-shell; brand.json→--ui-*), corrigir a regra de contribuição para packages/ui-vue e linkar o doc em docs/README.md.
- **Critérios de aceite:** DESIGN_SYSTEM.md menciona ui-vue e platform-shell e não promete pacotes inexistentes · grep DESIGN_SYSTEM em *.md retorna ≥1 referência (índice)
- **Método de validação:** inspecao-visual

#### UX-GYMOPS-007 — Sessão expirada sem tratamento global: usuário fica preso em 'Verifique sua conexão' com retry inútil (P1 · P)

- **Produto/superfícies:** GymOps
- **Papel/jornada:** todos · jornada J-GYMOPS-03 · frequência: ocasional
- **Categoria/estado:** estados · PARCIALMENTE IMPLEMENTADO · confiança: verificado-no-código · verificação: CONFIRMADO-COM-RESSALVA
- **Impacto no usuário:** Quando o refresh token expira (7d), toda tela vira erro genérico de conexão; nada leva ao login nem explica que a sessão acabou.
- **Impacto no negócio:** Usuário culpa a rede/produto; único 401 tratado é o do export CSV — inconsistência entre telas.
- **Evidência:** `apps/gymops/apps/web/src/lib/api.ts:55-58`
- **Recomendação:** No ApiClient, quando o retry pós-refresh ainda devolver 401, disparar logout() + redirect a /login com aviso 'Sessão expirada'; no QueryErrorState, aceitar o ApiError e diferenciar 401/403 de falha de rede.
- **Critérios de aceite:** Refresh inválido leva ao /login com mensagem de sessão expirada em qualquer tela · 403 nunca exibe texto de 'conexão'
- **Método de validação:** playwright

#### UX-IMOBIA-002 — Modal (usado em todos os fluxos de criação) sem focus-trap, ESC nem role=dialog (P1 · P)

- **Produto/superfícies:** Imobia
- **Papel/jornada:** todos · jornada J-IMOBIA-02 · frequência: sempre
- **Categoria/estado:** wcag-2.4.3 · IMPLEMENTADO · confiança: verificado-no-código · verificação: CONFIRMADO
- **Impacto no usuário:** Com modal aberto o Tab vaza para a página por baixo; leitor de tela não anuncia o diálogo; fechar exige mouse no ✕/backdrop
- **Impacto no negócio:** Formulários de criação (o coração de todos os módulos) inacessíveis/confusos por teclado
- **Evidência:** `apps/imobia/frontend/src/components/Modal.vue:6-11`
- **Recomendação:** No Modal.vue: role="dialog" aria-modal="true" aria-labelledby no título, foco inicial no primeiro campo, trap de Tab, handler de Escape e devolução de foco ao gatilho ao fechar. 1 arquivo corrige os 11 módulos.
- **Critérios de aceite:** Tab não sai do modal aberto e ESC fecha · NVDA anuncia título e papel de diálogo
- **Método de validação:** teste-manual-teclado

#### UX-IMOBIA-003 — Falha de carregamento de lista vira empty state enganoso (try/finally sem catch) (P1 · P)

- **Produto/superfícies:** Imobia
- **Papel/jornada:** todos · jornada J-IMOBIA-02 · frequência: ocasional
- **Categoria/estado:** estados · IMPLEMENTADO · confiança: verificado-no-código · verificação: CONFIRMADO
- **Impacto no usuário:** Com API fora/401, a tela afirma 'Nenhum imóvel ainda. Comece captando o primeiro.' — o operador conclui que perdeu os dados
- **Impacto no negócio:** Decisões erradas sobre carteira/leads baseadas em tela falsamente vazia; chamados de suporte
- **Evidência:** `apps/imobia/frontend/src/views/app/Imoveis.vue:25-31`
- **Recomendação:** Adicionar catch nos load() das 9 views de módulo, setando um ref de erro renderizado como im-notice err com botão 'Tentar novamente' (padrão já existente em Home.vue:56-57), distinto do empty state.
- **Critérios de aceite:** Com API derrubada, a lista mostra erro + retry, nunca o empty state
- **Método de validação:** teste-manual-teclado

#### UX-IMOBIA-005 — Docs declaram kit ui-vue sincronizado (F3+) e fases 'verificadas'; código não tem ui-vue nem testes (P1 · P)

- **Produto/superfícies:** Imobia
- **Papel/jornada:** todos · frequência: sempre
- **Categoria/estado:** divergencia-docs · OBSOLETO/DIVERGENTE · confiança: verificado-no-código · verificação: CONFIRMADO
- **Impacto no usuário:** Indireto: agentes/operadores guiados pelo CLAUDE.md procuram tokens --ui-/kit inexistentes e superestimam a garantia de qualidade
- **Impacto no negócio:** Drift visual permanente vs plataforma; 'verificadas' sem 1 teste sequer engana o planejamento de risco
- **Evidência:** `apps/imobia/CLAUDE.md:30`
- **Recomendação:** Atualizar CLAUDE.md/devops.yaml/package.json para refletir a realidade (--im-* local, sem kit) OU executar a sincronização prometida; registrar explicitamente a ausência de testes como dívida em vez de 'verificadas'.
- **Critérios de aceite:** CLAUDE.md descreve o estado real do design system · Dívida de testes registrada ou primeiro smoke E2E criado
- **Método de validação:** inspecao-visual · **dependências:** produto: decidir se --im-* vira oficial ou se sincroniza o ui-vue

#### UX-IMOBIA-007 — Sessão expirada durante o uso não redireciona nem explica (401 vira alert/vazio) (P1 · P)

- **Produto/superfícies:** Imobia
- **Papel/jornada:** todos · jornada J-IMOBIA-11 · frequência: ocasional
- **Categoria/estado:** estados · NÃO INICIADO · confiança: verificado-no-código · verificação: CONFIRMADO
- **Impacto no usuário:** Após o TTL do JWT, ações falham com mensagem técnica ou lista falsamente vazia; usuário fica preso numa tela morta
- **Impacto no negócio:** Percepção de app quebrado; perda de dados de formulário em ações que falham silenciosamente
- **Evidência:** `apps/imobia/frontend/src/api.js:20`
- **Recomendação:** No req() central do api.js, tratar res.status === 401: limpar sessão (authStore.logout) e redirecionar para /login?redirect=<rota atual> com aviso 'sessão expirada'; manter o erro atual para os demais status.
- **Critérios de aceite:** Com token inválido, qualquer ação leva ao login com aviso e retorno pós-login
- **Método de validação:** playwright

#### UX-NEURO-002 — 8 telas vivas navegam para 6 rotas inexistentes (/revenue, /jobs, /transactions, /dashboard...) (P1 · P)

- **Produto/superfícies:** NeuroEvolui
- **Papel/jornada:** todos · jornada J-NEURO-05 · frequência: sempre
- **Categoria/estado:** navegação · IMPLEMENTADO · confiança: verificado-no-código · verificação: CONFIRMADO
- **Impacto no usuário:** CTAs primários, botões Voltar e o redirect pós-salvar de preferência caem na página 404; usuário perde o fio da jornada.
- **Impacto no negócio:** Fluxos de financeiro/notificações/jobs parecem quebrados; erode a confiança no produto inteiro.
- **Evidência:** `apps/neuroevolui/frontend/src/views/NotificationPreferenceCreateView.vue:332`
- **Recomendação:** Corrigir os alvos para as rotas registradas: /payment-transactions, /async-jobs, /, /notification-preferences, /patient-reports, /financial; adicionar teste estático que valida todo to="/..."/router.push contra o router.
- **Critérios de aceite:** grep de to="/ e router.push nas views só encontra rotas registradas · Salvar preferência de notificação retorna à lista, não ao 404
- **Método de validação:** unit-test

#### UX-NEURO-005 — Vocabulários de status divergentes (pt vs en) entre telas e backend; cancelar não libera a agenda (P1 · P)

- **Produto/superfícies:** NeuroEvolui
- **Papel/jornada:** professional, clinic_manager, owner · jornada J-NEURO-03 · frequência: frequente
- **Categoria/estado:** heuristica-consistência · IMPLEMENTADO · confiança: verificado-no-código · verificação: CONFIRMADO
- **Impacto no usuário:** Paciente 'ativo' não casa com filtro 'active'; consulta 'cancelado' segue bloqueando o horário (conflito só exclui 'cancelled').
- **Impacto no negócio:** Agenda recusa reagendar horários teoricamente livres; métricas e filtros mentem — erro operacional direto.
- **Evidência:** `apps/neuroevolui/frontend/src/views/PatientCreateView.vue:414-418`
- **Recomendação:** Unificar no enum en do backend (active/on_hold/discharged/archived; scheduled/confirmed/completed/cancelled/no_show) em todos os writes do front, mantendo rótulos pt só na exibição via status-map do kit.
- **Critérios de aceite:** Cancelar consulta pela lista permite reagendar o mesmo horário sem 409 · Paciente criado aparece no filtro 'Em acompanhamento'
- **Método de validação:** contrato-api · **dependências:** API: declarar o enum canônico (en) e validar status no backend

#### UX-NEURO-007 — 401 e 403 tratados identicamente como 'Acesso restrito'; sessão expirada sem reautenticação (P1 · P)

- **Produto/superfícies:** NeuroEvolui
- **Papel/jornada:** todos · jornada J-NEURO-01 · frequência: frequente
- **Categoria/estado:** estados · IMPLEMENTADO · confiança: verificado-no-código · verificação: CONFIRMADO
- **Impacto no usuário:** Usuário deslogado/expirado é instruído a 'falar com um administrador' quando o remédio é logar de novo; nenhum CTA de login.
- **Impacto no negócio:** Chamados de suporte falsos de 'perdi meu acesso'; sessões expiradas viram becos sem saída.
- **Evidência:** `apps/neuroevolui/frontend/src/views/DashboardView.vue:384-386`
- **Recomendação:** Diferenciar no api.js: 401 → estado 'não autenticado' com CTA de login/re-login (e preservação da rota); 403 → mensagem de permissão com o papel mínimo exigido.
- **Critérios de aceite:** Com sessão expirada, qualquer tela oferece 'Entrar novamente' em vez de 'fale com um administrador'
- **Método de validação:** playwright · **dependências:** UX-NEURO-001

#### UX-PREC-001 — Keyboard trap no canvas do screencast: preventDefault em toda tecla, sem saída por teclado (P0 · P)

- **Produto/superfícies:** Portal Recorder
- **Papel/jornada:** operador · jornada J-PREC-03 · frequência: sempre
- **Categoria/estado:** wcag-2.1.2 · IMPLEMENTADO · confiança: verificado-no-código · verificação: CONFIRMADO
- **Impacto no usuário:** Uma vez focado o canvas (tabIndex=0), Tab/Escape são engolidos e enviados ao remoto; só o mouse tira o foco.
- **Impacto no negócio:** Violação WCAG nível A no fluxo principal; usuário de teclado fica preso na tela central da ferramenta.
- **Evidência:** `apps/portal-recorder/frontend/src/views/CaptureView.jsx:198-202`
- **Recomendação:** Reservar um atalho de escape que NÃO é encaminhado ao remoto (ex.: Esc duplo ou Ctrl+Alt) chamando canvas.blur(), e documentá-lo no hint '.screencast__hint'. Manter Tab indo ao portal remoto.
- **Critérios de aceite:** Com foco no canvas, o atalho documentado devolve o foco ao documento (verificável por teclado) · Hint da tela cita o atalho de saída
- **Método de validação:** teste-manual-teclado

#### UX-QA-001 — Console, imobia, besc/frontend e zapbridge/web ficam fora de TODOS os workflows de CI (nem lint/build) (P1 · P)

- **Produto/superfícies:** QA/Regressão (afeta: console, imobia, besc, zapbridge)
- **Papel/jornada:** operador-dev da plataforma · frequência: sempre
- **Categoria/estado:** heuristica-prevencao · NÃO INICIADO · confiança: verificado-no-código · verificação: CONFIRMADO
- **Impacto no usuário:** Commit nessas 4 superfícies (todas com escrita e P0/P1 abertos) chega à main sem nenhuma verificação de máquina.
- **Impacto no negócio:** Regressões de UI/UX invisíveis até o usuário tropeçar; console e zapbridge operam dados reais.
- **Evidência:** `.github/workflows/ci-apps.yml:73-74`
- **Recomendação:** Adicionar entradas de matriz no ci-apps para imobia (build), besc/frontend (build), zapbridge/web (build) e criar ci-console (lint/build de console/**, que está fora do path-filter apps/**); evoluir depois para os harnesses H1/H3.
- **Critérios de aceite:** PR que toca qualquer uma das 4 superfícies dispara ao menos um job de build · console/** tem workflow próprio disparado por path
- **Método de validação:** contrato-api

#### UX-REQHUB-002 — Meta-docs declaram app read-only de 6 telas, mas a UI dispara launch com auto-merge e exclusão total de projeto (P1 · P)

- **Produto/superfícies:** Reqhub
- **Papel/jornada:** todos · jornada J-REQHUB-03 · frequência: sempre
- **Categoria/estado:** divergencia-docs · OBSOLETO/DIVERGENTE · confiança: verificado-no-código · verificação: CONFIRMADO
- **Impacto no usuário:** Operador (ou agente) que confia no README/AGENTS subestima o blast-radius: a Forja pode auto-mesclar PR de requisitos e apagar código+cluster.
- **Impacto no negócio:** Divergência docs↔código em salvaguarda de segurança; decisões de operação tomadas com premissa falsa de 'somente leitura'.
- **Evidência:** `apps/reqhub/README.md:11-14`
- **Recomendação:** Atualizar README.md, devops.yaml (cabeçalho) e AGENTS.md §8 para descrever o Studio/Forja e as ações com efeito colateral (launch/delete via esteira), suas salvaguardas (denylist, gate de preview) e o que segue read-only.
- **Critérios de aceite:** README/AGENTS citam launch/delete e o modelo de salvaguardas · Nenhum doc canônico descreve o app como somente 6 telas read-only
- **Método de validação:** inspecao-visual

#### UX-SICAT-001 — CTAs do dashboard navegam com ?focus= que nenhuma tela consome (P1 · P)

- **Produto/superfícies:** SICAT
- **Papel/jornada:** generator, receiver, carrier · jornada J-SICAT-02 · frequência: frequente
- **Categoria/estado:** navegação · PARCIALMENTE IMPLEMENTADO · confiança: verificado-no-código · verificação: CONFIRMADO
- **Impacto no usuário:** Clica 'Resolver' (N com falha) ou num cartão de métrica e cai na lista SEM filtro — as falhas não ficam em evidência.
- **Impacto no negócio:** Falhas de emissão passam despercebidas; retrabalho e MTRs irregulares na CETESB.
- **Evidência:** `apps/sicat/frontend/src/features/dashboard/DashboardView.vue:127`
- **Recomendação:** No onMounted de ManifestsView, mapear route.query.focus para os chips de situação existentes (failed→{status:'failed'}, draft→{status:'draft'}, pending/completed→equivalentes por persona) e aplicar o filtro antes do primeiro search().
- **Critérios de aceite:** Clicar 'Resolver' no dashboard abre /manifestos com o chip 'Falhas' ativo e a busca aplicada · Os 4 cartões de métrica abrem a lista com o chip correspondente ativo
- **Método de validação:** playwright

#### UX-ZAP-007 — devops.yaml/CLAUDE.md/README apontam o frontend legado (Expo) como build do deploy (P1 · P)

- **Produto/superfícies:** ZapBridge
- **Papel/jornada:** todos · frequência: sempre
- **Categoria/estado:** divergencia-docs · OBSOLETO/DIVERGENTE · confiança: verificado-no-código · verificação: CONFIRMADO
- **Impacto no usuário:** Operador que segue os docs builda apps/zapbridge/app e publica o app Expo aposentado por cima do web/ novo — regressao total da UX.
- **Impacto no negócio:** Pipeline de publicação documentado leva ao artefato errado; risco real em rebuild/disaster recovery.
- **Evidência:** `apps/zapbridge/devops.yaml:23-25`
- **Recomendação:** Atualizar devops.yaml (context: web), CLAUDE.md e README para o frontend Vite/React; marcar app/ explicitamente como legado (ou remove-lo) e corrigir os passos de build/deploy.
- **Critérios de aceite:** devops.yaml aponta context web + Dockerfile.web do web/ · CLAUDE.md/README descrevem o frontend Vite como o deploy e app/ como legado
- **Método de validação:** inspecao-visual

#### UX-A11Y-002 — Focus-trap de diálogo: o algoritmo correto existe TRIPLICADO (UiModal, anarabottini, reqhub) e 6+ superfícies seguem com modais vazando foco (P1 · M)

- **Produto/superfícies:** A11y plataforma (afeta: console, gymops, imobia, sicat, zapbridge, rmambiental, contaviva-360, contaviva-pro, neuroevolui)
- **Papel/jornada:** todos · jornada J-A11Y-01 · frequência: sempre
- **Categoria/estado:** wcag-2.4.3 · PARCIALMENTE IMPLEMENTADO · confiança: verificado-no-código · verificação: CONFIRMADO
- **Impacto no usuário:** Em console, gymops, imobia, sicat, zapbridge e rmambiental o Tab escapa do diálogo e o foco se perde ao fechar; nas 3 superfícies corretas, funciona.
- **Impacto no negócio:** Correção já paga 3x à mão e nunca promovida a fundação; o caso rmambiental→anarabottini prova que melhorias por cópia não refluem à origem.
- **Evidência:** `packages/ui-vue/src/components/UiModal.vue:30-33`
- **Recomendação:** Extrair o trap do UiModal para composable (useFocusTrap) no ui-vue + função vanilla no platform-shell; adotar o Modal.tsx do anarabottini como referência React p/ console/gymops; repatriar o fix ao lightbox do rmambiental; retrofit nos 6 pontos locais.
- **Critérios de aceite:** trap disponível como fundação nos 2 mundos (Vue e vanilla) e consumido pelo UiModal · os 6 diálogos locais citados prendem Tab e devolvem foco
- **Método de validação:** teste-manual-teclado · **dependências:** UX-CONSOLE-002; UX-GYMOPS-004; UX-IMOBIA-002; UX-SICAT-015; UX-ZAP-014; UX-RMAMB-005; UX-DS-013

#### UX-AI-001 — Cadeia rascunho→confirmação humana quebra na UI em 3 apps cujo backend a implementa (P1 · M)

- **Produto/superfícies:** UX de IA (afeta: neuroevolui, contaviva-360, zapbridge)
- **Papel/jornada:** todos · jornada J-AI-02 · frequência: sempre
- **Categoria/estado:** heuristica-controle · PARCIALMENTE IMPLEMENTADO · confiança: verificado-no-código · verificação: CONFIRMADO
- **Impacto no usuário:** Confirma e nada e salvo (NeuroEvolui), nunca ve o rascunho (CV360) ou pede ação que jamais executa (ZapBridge)
- **Impacto no negócio:** A garantia central 'IA nunca age sem confirmação' vira promessa não entregue; confianca no produto erode
- **Evidência:** `apps/neuroevolui/frontend/src/views/AssistantView.vue:864-866`
- **Recomendação:** Promover o card de confirmação do GymOps (AiChatWidget.tsx:205-237) a componente compartilhado (ui-vue + variante React) e fechar as 3 pontas: persistir o applyDraft do NeuroEvolui, renderizar draft/confirm-draft na CV360 e proposals+confirm no ZapBridge.
- **Critérios de aceite:** Nos 3 apps, confirmar um rascunho/ação gera persistencia verificavel via API · Componente de confirmação único documentado no kit
- **Método de validação:** playwright · **dependências:** UX-NEURO-008; UX-CV360-009; UX-ZAP-005

#### UX-NAV-003 — Login SSO ancorado em dev.nvit.com.br: 'Entrar' em nvit.localhost cruza domínio e nunca retorna logado (P1 · M)

- **Produto/superfícies:** Integração/Navegação (afeta: portal, console, reqhub, portal-recorder)
- **Papel/jornada:** visitante-anonimo, platform-admins, project-members · jornada J-NAV-03 · frequência: sempre
- **Categoria/estado:** onboarding · IMPLEMENTADO · confiança: verificado-no-código · verificação: CONFIRMADO
- **Impacto no usuário:** Quem clica Entrar no host local e migrado para outro domínio; cookie (Secure, domain fixo) jamais vale em nvit.localhost — volta anonimo.
- **Impacto no negócio:** O host de dev documentado em toda a plataforma não completa login; confianca/contexto quebrados na transicao.
- **Evidência:** `console/k8s/auth/oauth2-proxy.yaml:61-62`
- **Recomendação:** Ou declarar dev.nvit.com.br como única borda de login (escondendo 'Entrar' em nvit.localhost com aviso e link para o domínio publico), ou parametrizar oauth2-proxy/Keycloak por host (whitelist + cookie por host). Documentar a decisão onde o host local e anunciado.
- **Critérios de aceite:** clicar Entrar no host local termina logado no MESMO host, ou exibe aviso explicito de troca de domínio antes do redirect
- **Método de validação:** teste-manual-teclado · **dependências:** produto: decidir se nvit.localhost segue sendo borda de login suportada

#### UX-ANA-001 — Fallback com canais de contato vazios mata a jornada de conversão (P1 · PP)

- **Produto/superfícies:** Ana Rabottini
- **Papel/jornada:** visitante · jornada J-ANA-01 · frequência: sempre
- **Categoria/estado:** estados · PARCIALMENTE IMPLEMENTADO · confiança: verificado-no-código · verificação: CONFIRMADO-COM-RESSALVA
- **Impacto no usuário:** Todo CTA converge para /contato, que informa 'canais em breve' sem meio de contato — beco sem saída da conversão.
- **Impacto no negócio:** Site institucional de captação sem canal de contato = zero leads enquanto o CMS não for preenchido ou estiver fora.
- **Evidência:** `apps/anarabottini/src/lib/site.ts:28-32`
- **Recomendação:** Preencher pelo menos contact.email real no DEFAULT_SITE (e no CMS) antes de divulgar; alternativamente, gate de build/deploy que falhe quando os canais do fallback estiverem vazios.
- **Critérios de aceite:** Com CMS indisponível, /contato oferece ao menos 1 canal funcional · Deploy divulgável não contém contact.email vazio no fallback
- **Método de validação:** teste-manual-teclado · **dependências:** produto: obter e-mail/WhatsApp reais de Ana (CLAUDE.md armadilha 3)

#### UX-CONSOLE-001 — Card do kanban não é focável nem operável por teclado (não abre o detalhe) (P1 · PP)

- **Produto/superfícies:** Console
- **Papel/jornada:** project-members, platform-admins · jornada J-CONSOLE-03 · frequência: sempre
- **Categoria/estado:** wcag-2.1.1 · IMPLEMENTADO · confiança: verificado-no-código · verificação: CONFIRMADO
- **Impacto no usuário:** Usuário de teclado/AT não abre itens do board; o select de status (alternativa ao drag) fica inalcançável dentro do drawer.
- **Impacto no negócio:** Board é a jornada principal do member; exclui operadores que dependem de teclado.
- **Evidência:** `console/frontend/src/components/MetaProjects.jsx:62-72`
- **Recomendação:** Tornar o card um <button> (ou role=button + tabIndex=0 + Enter/Espaço abrindo onOpen), mantendo draggable; foco visível com o anel já existente em styles.css.
- **Critérios de aceite:** Tab alcança cada card e Enter abre o drawer · Status alterável só com teclado (card -> drawer -> select)
- **Método de validação:** teste-manual-teclado

#### UX-CONSOLE-004 — Reordenação de seções do portal só por arrastar — sem alternativa de teclado (P1 · PP)

- **Produto/superfícies:** Console
- **Papel/jornada:** project-members, platform-admins · jornada J-CONSOLE-04 · frequência: sempre
- **Categoria/estado:** wcag-2.1.1 · IMPLEMENTADO · confiança: verificado-no-código · verificação: CONFIRMADO
- **Impacto no usuário:** Usuário de teclado não consegue ordenar as seções do portal em nenhum modo (Avançado é drag; Visual depende de hover/mouse no iframe).
- **Impacto no negócio:** Estrutura da página é tarefa central do editor CMS; AA quebrada na jornada principal do papel.
- **Evidência:** `console/frontend/src/components/ContentEditor.jsx:349-353`
- **Recomendação:** Adicionar botões ↑/↓ por seção no modo Avançado (padrão já existente no ArrayOfObjects do AutoForm), reusando pmCmsReorderSections.
- **Critérios de aceite:** Seções reordenáveis apenas com teclado no modo Avançado
- **Método de validação:** teste-manual-teclado

#### UX-CV360-001 — SPA operacional inteira e API por papel acessíveis sem login, guard ou autoridade (P0 · G)

- **Produto/superfícies:** ContaViva 360
- **Papel/jornada:** todos · jornada J-CV360-04 · frequência: sempre
- **Categoria/estado:** rbac-seguranca-percebida · IMPLEMENTADO · confiança: verificado-no-código · verificação: CONFIRMADO-COM-RESSALVA
- **Impacto no usuário:** Qualquer visitante abre /dashboard/admin por URL e vê jobs/DLQ/totais financeiros; pode marcar obrigação fiscal como paga
- **Impacto no negócio:** Exposição de dados fiscais/financeiros e mutação sem identidade; confiança zero para uso real
- **Evidência:** `apps/contaviva-360/frontend/src/main.js:8-9`
- **Recomendação:** Enquanto o login OIDC real não chega: proteger /contaviva-360 na borda (ForwardAuth oauth2-proxy como no reqhub), adicionar beforeEach que checa /me e tela de bloqueio/login; exigir requireRole nos endpoints /v1/dashboard/role/* e no PATCH concluir.
- **Critérios de aceite:** Abrir /contaviva-360/dashboard/admin sem sessão redireciona para login/bloqueio · GET /v1/dashboard/role/admin sem papel admin retorna 401/403
- **Método de validação:** teste-manual-teclado · **dependências:** API: sessão OIDC real ou ForwardAuth na borda (bloco oidc-sessão declarado); produto: definir fluxo de login

#### UX-CV360-008 — Painel do Contador: cartões de cliente e grupos de documentos são divs clicáveis sem teclado (P1 · PP)

- **Produto/superfícies:** ContaViva 360
- **Papel/jornada:** contador, manager · jornada J-CV360-03 · frequência: sempre
- **Categoria/estado:** wcag-2.1.1 · IMPLEMENTADO · confiança: verificado-no-código · verificação: CONFIRMADO
- **Impacto no usuário:** A ação principal do contador (abrir documentos de um cliente) é inoperável por teclado e invisível para AT
- **Impacto no negócio:** Violação WCAG nível A na jornada principal de um papel; contrasta com o kit que trata teclado nas tabelas
- **Evidência:** `apps/contaviva-360/frontend/src/views/DashboardContadorView.vue:13-18`
- **Recomendação:** Trocar as divs por <button type="button"> (reset de estilo) ou adicionar role="button", tabindex="0" e @keydown.enter/.space — seguindo o padrão de UiDataTable.vue:30-33.
- **Critérios de aceite:** Tab alcança cada cartão e Enter/Espaço abre o modal de documentos
- **Método de validação:** teste-manual-teclado

#### UX-CVPRO-006 — Troca de papel sem confirmação e sem proteção contra auto-rebaixamento (revoga a própria sessão) (P1 · PP)

- **Produto/superfícies:** ContaViva Pro
- **Papel/jornada:** admin · jornada J-CVPRO-03 · frequência: ocasional
- **Categoria/estado:** heuristica-prevencao · IMPLEMENTADO · confiança: verificado-no-código · verificação: CONFIRMADO
- **Impacto no usuário:** Um clique em 'Tornar membro' na própria linha rebaixa o admin e revoga as próprias sessões; sem confirmação
- **Impacto no negócio:** Risco de perder o único admin (recuperação só por outro admin ou reseed do bootstrap)
- **Evidência:** `apps/contaviva-pro/frontend/src/views/AdminUsuariosView.vue:101-104`
- **Recomendação:** Usar o useConfirm existente na troca de papel (é destrutiva: revoga sessões) e desabilitar/rotular as ações da própria linha do admin; a barreira definitiva de auto-rebaixamento é da API.
- **Critérios de aceite:** Troca de papel exige confirmação com aviso de revogação de sessões · Ações da própria linha do admin ficam desabilitadas ou explicadas
- **Método de validação:** playwright · **dependências:** API: recusar auto-rebaixamento no PATCH /v1/users/:id (espelhar a proteção do DELETE)

#### UX-DOCS-007 — imobia: CLAUDE.md declara kit ui-vue 'sincronizado em F3+' com F8 entregue, mas o frontend nunca o adotou (P1 · PP)

- **Produto/superfícies:** Docs↔código
- **Papel/jornada:** agente-claude, operador · jornada J-DOCS-02 · frequência: sempre
- **Categoria/estado:** ds-consistência · OBSOLETO/DIVERGENTE · confiança: verificado-no-código · verificação: ELEVADO (severidade original P2)
- **Impacto no usuário:** Dev que padronize DS platform-wide erra o inventário: imobia usa paleta própria --im-* fora dos tokens centrais.
- **Impacto no negócio:** Divida de design system mascarada por doc que a declara paga ('TODAS ENTREGUES').
- **Evidência:** `apps/imobia/CLAUDE.md:30`
- **Recomendação:** Corrigir CLAUDE.md/package.json para declarar o estado real ('DS próprio --im-*; sincronizacao com ui-vue pendente') ou executar a sincronizacao prometida; não deixar a promessa vencida como fato.
- **Critérios de aceite:** CLAUDE.md descreve o DS real do frontend · Nenhum doc do imobia afirma ui-vue sincronizado sem a dependência existir
- **Método de validação:** inspecao-visual

#### UX-PREC-003 — 401 de sessão OIDC expirada é reportado como problema do PORTAL_REC_TOKEN (P1 · PP)

- **Produto/superfícies:** Portal Recorder
- **Papel/jornada:** operador · frequência: ocasional
- **Categoria/estado:** estados · IMPLEMENTADO · confiança: inferido · verificação: CONFIRMADO
- **Impacto no usuário:** Com a sessão Keycloak expirada, GETs falham 401 e a UI manda 'conferir o token' — guia errada; re-login exige adivinhar o F5.
- **Impacto no negócio:** Beco sem saída recorrente numa plataforma com SSO; diagnóstico errado corrói confiança na ferramenta.
- **Evidência:** `apps/portal-recorder/frontend/src/api.js:103-104`
- **Recomendação:** Distinguir no apiFetch: 401 em chamada SEM auth:true (leitura) ⇒ 'Sessão expirada — recarregue a página para entrar novamente'; 401 em escrita com token presente ⇒ mensagem de token atual.
- **Critérios de aceite:** GET com 401 exibe mensagem de sessão expirada (não de token) · Escrita com 401 continua apontando para a TokenBar
- **Método de validação:** teste-manual-teclado

#### UX-RMAMB-001 — Labels do formulário de contato sem associação programática (htmlFor/id) (P1 · PP)

- **Produto/superfícies:** RM Ambiental
- **Papel/jornada:** visitante · jornada J-RMAMB-01 · frequência: sempre
- **Categoria/estado:** wcag-1.3.1 · IMPLEMENTADO · confiança: verificado-no-código · verificação: CONFIRMADO
- **Impacto no usuário:** Leitor de tela anuncia os 6 campos sem nome acessível; clique no label não foca o campo — no fluxo principal de conversão.
- **Impacto no negócio:** Perda de leads de usuários de tecnologia assistiva; risco de não conformidade WCAG A em site público.
- **Evidência:** `apps/rmambiental/src/components/ContactSection.tsx:58-59`
- **Recomendação:** Adicionar id em cada input/select/textarea e htmlFor no label correspondente (6 pares) em ContactSection.tsx.
- **Critérios de aceite:** Todos os campos do formulário têm label programaticamente associado (axe sem violação label) · Clicar no label foca o campo
- **Método de validação:** axe

#### UX-ZAP-004 — 'Desconectar aparelho' executa sem confirmação ação destrutiva que expurga dados de IA (P1 · PP)

- **Produto/superfícies:** ZapBridge
- **Papel/jornada:** usuário · jornada J-ZAP-05 · frequência: ocasional
- **Categoria/estado:** heuristica-prevencao · IMPLEMENTADO · confiança: verificado-no-código · verificação: CONFIRMADO
- **Impacto no usuário:** Um clique encerra a sessão WhatsApp, limpa a lista e apaga memoria/embeddings/KB de IA (RN15) sem aviso; reconectar exige novo QR.
- **Impacto no negócio:** Perda irreversivel de dados de IA por engano; quebra de confianca.
- **Evidência:** `apps/zapbridge/web/src/pages/SettingsPage.tsx:62`
- **Recomendação:** Dialogo de confirmação explicando as consequencias (novo QR necessário; dados de IA apagados conforme RN15) antes de chamar disconnect(); feedback de progresso e de erro.
- **Critérios de aceite:** Desconectar exige confirmação explicita que cita o expurgo de dados de IA
- **Método de validação:** teste-manual-teclado

#### UX-AI-002 — Auto-reply do ZapBridge age em nome do usuário sem superfície de controle/observacao na web (P1 · M)

- **Produto/superfícies:** UX de IA
- **Papel/jornada:** todos · jornada J-AI-03 · frequência: ocasional
- **Categoria/estado:** heuristica-controle · PARCIALMENTE IMPLEMENTADO · confiança: verificado-no-código · verificação: CONFIRMADO
- **Impacto no usuário:** Mensagens automaticas saem no WhatsApp pessoal sem o usuário ver que sairam, poder desligar ou saber que a conversa foi respondida por bot
- **Impacto no negócio:** Acao autonoma sem kill-switch na UI implantada = risco reputacional e de conformidade; destinatario não sabe que fala com IA (disclaimer default vazio)
- **Evidência:** `apps/zapbridge/server/src/modules/ai/hooks.ts:57-59`
- **Recomendação:** Na web: secao IA nas configurações da conversa (toggle autoreply + excluded via setChatSettings, hoje sem chamador), listener para ai.autoreply.fired/handoff com marcador visível na conversa, e disclaimer default não-vazio ('resposta automática') até o usuário customizar.
- **Critérios de aceite:** Toggle por conversa visível e funcional na web · Mensagem auto-enviada exibe marcador de origem IA na thread
- **Método de validação:** teste-manual-teclado · **dependências:** UX-ZAP-006

#### UX-BESC-001 — Fluxo de convite de auditores sem tela de resgate no frontend (P1 · M)

- **Produto/superfícies:** BESC
- **Papel/jornada:** lawyer, judge, manager · jornada J-BESC-04 · frequência: sempre
- **Categoria/estado:** onboarding · PARCIALMENTE IMPLEMENTADO · confiança: verificado-no-código · verificação: CONFIRMADO
- **Impacto no usuário:** Convidado recebe um token opaco e não tem onde usá-lo; onboarding do papel morre no meio
- **Impacto no negócio:** Painel de convites vira promessa vazia; auditores entram por workaround que contradiz a própria copy
- **Evidência:** `apps/besc/api/src/foundation/auth.js:227`
- **Recomendação:** Criar rota /convite/:token (ou campo em /cadastro) que consome POST /auth/invitations/:token/accept: define senha, mostra o papel concedido e loga. Ajustar a copy do InvitePanel com o link exato a repassar.
- **Critérios de aceite:** Convidado conclui conta e papel usando apenas o token, sem intervenção manual extra do gestor · Painel de convite exibe a URL completa de resgate para copiar
- **Método de validação:** teste-manual-teclado

#### UX-CV360-009 — Assistente descarta draft/citations/grounded da resposta; confirmação humana de rascunho sem UI (P1 · M)

- **Produto/superfícies:** ContaViva 360
- **Papel/jornada:** todos · jornada J-CV360-05 · frequência: frequente
- **Categoria/estado:** heuristica-visibilidade · PARCIALMENTE IMPLEMENTADO · confiança: verificado-no-código · verificação: CONFIRMADO
- **Impacto no usuário:** Usuário não vê fontes nem rascunhos propostos pela IA; sem aviso de conteúdo gerado por IA/limitações
- **Impacto no negócio:** O loop rascunho→confirmação humana (mecanismo de segurança da IA, com endpoint pronto) fica inacessível
- **Evidência:** `apps/contaviva-360/frontend/src/views/AiAssistantView.vue:112`
- **Recomendação:** Renderizar citations como lista de fontes, draft como cartão 'Rascunho proposto' com botões Confirmar (POST confirm-draft) / Descartar, e nota fixa 'respostas geradas por IA podem conter erros' no footer.
- **Critérios de aceite:** Resposta com draft exibe cartão com Confirmar/Descartar e Confirmar chama confirm-draft · Citações visíveis quando presentes
- **Método de validação:** inspecao-visual

#### UX-DOCS-005 — contaviva-360: visao promete 7 perfis, REQ deployed exige OIDC/4 papeis, código tem 3 papeis sem login (P1 · M)

- **Produto/superfícies:** Docs↔código (afeta: contaviva-360, specs)
- **Papel/jornada:** operador, agente-claude · jornada J-DOCS-03 · frequência: sempre
- **Categoria/estado:** divergencia-docs · OBSOLETO/DIVERGENTE · confiança: verificado-no-código · verificação: CONFIRMADO
- **Impacto no usuário:** Quem confia na baseline acredita que ha login OIDC e papeis contabeis (contador/auxiliar/cliente); a UI não tem nada disso.
- **Impacto no negócio:** Status deployed de um REQ critical com aceite não atendido mina a confianca em toda a esteira de status.
- **Evidência:** `specs/baseline/products.json:38`
- **Recomendação:** Rodar /impact-review no REQ-CONTAVIVA360-0001 (ASR): ou implementar o aceite (OIDC PKCE + papeis contador/auxiliar/cliente) ou versionar o REQ como major refletindo o stand-in e corrigir o status para o estagio real.
- **Critérios de aceite:** Status do REQ-0001 condiz com o código (aceite atendido ou REQ revisado) · Visao/product.json e RANK do código usam o mesmo conjunto de papeis
- **Método de validação:** contrato-api · **dependências:** produto: decidir entre implementar OIDC/papeis ou rebaixar status e versionar o REQ (major)

#### UX-GYMOPS-004 — ActivityDrawer e modais artesanais sem role=dialog, focus trap ou Esc (WCAG 2.4.3/2.1.2 AA) (P1 · M)

- **Produto/superfícies:** GymOps
- **Papel/jornada:** todos · jornada J-GYMOPS-03 · frequência: sempre
- **Categoria/estado:** wcag-2.4.3 · IMPLEMENTADO · confiança: verificado-no-código · verificação: CONFIRMADO
- **Impacto no usuário:** Ao abrir a atividade, o foco continua na página de fundo; leitor de tela não anuncia o contexto; Esc não fecha; no mobile só o X fecha.
- **Impacto no negócio:** Violação AA na superfície mais usada do produto; inconsistente com os modais Radix que já fazem tudo certo.
- **Evidência:** `apps/gymops/apps/web/src/components/activities/ActivityDrawer.tsx:197-202`
- **Recomendação:** Reimplementar ActivityDrawer sobre Radix Dialog (variant sheet) e migrar RecurrenceModal/ShareModal para o Dialog existente: role/aria-modal, foco inicial, trap, Esc e retorno de foco vêm de graça.
- **Critérios de aceite:** Esc fecha o drawer e o foco volta ao elemento de origem · Tab não alcança conteúdo atrás do drawer aberto
- **Método de validação:** teste-manual-teclado

#### UX-GYMOPS-005 — Ativar push trava para sempre: navigator.serviceWorker.ready sem nenhum service worker registrado (P1 · M)

- **Produto/superfícies:** GymOps
- **Papel/jornada:** todos · jornada J-GYMOPS-10 · frequência: sempre
- **Categoria/estado:** estados · PARCIALMENTE IMPLEMENTADO · confiança: inferido · verificação: CONFIRMADO
- **Impacto no usuário:** Após conceder permissão do navegador, o fluxo fica pendurado sem erro, timeout ou saída — canal push nunca ativa.
- **Impacto no negócio:** PRD promete 'PWA substitui app nativo'; push VAPID existe no backend mas é inalcançável pela UI — feature morta com cara de bug.
- **Evidência:** `apps/gymops/apps/web/src/app/(app)/settings/page.tsx:107-111`
- **Recomendação:** Adicionar um service worker mínimo (push + notificationclick) em public/, registrá-lo no boot do app (respeitando basePath) e no subscribe usar getRegistration() com timeout + mensagem de erro quando ausente.
- **Critérios de aceite:** Clicar 'ativar push' termina em sucesso ou erro visível em <10s · grep encontra register() e um sw servido sob o basePath
- **Método de validação:** teste-manual-teclado

#### UX-IMOBIA-006 — Nenhuma entidade pode ser editada ou excluída pela UI (API tem PUT/DELETE sem chamadores) (P1 · M)

- **Produto/superfícies:** Imobia
- **Papel/jornada:** todos · jornada J-IMOBIA-02 · frequência: frequente
- **Categoria/estado:** heuristica-controle · PARCIALMENTE IMPLEMENTADO · confiança: verificado-no-código · verificação: CONFIRMADO
- **Impacto no usuário:** Preço digitado errado, lead duplicado ou lançamento trocado ficam permanentes; não dá para cancelar compromisso nem corrigir nada
- **Impacto no negócio:** Dados operacionais degradam com o uso; carteira/financeiro perdem confiabilidade sem via de correção
- **Evidência:** `apps/imobia/frontend/src/api.js:48-49`
- **Recomendação:** Reusar o modal de criação como edição (preencher form no detalhe + api.update) e adicionar exclusão com confirmação destrutiva nos 5 módulos CRUD; grep de api.update(/api.remove( em views/ hoje retorna zero ocorrências.
- **Critérios de aceite:** Editar e excluir disponíveis em Imóveis e Leads com confirmação · Timeline registra a edição
- **Método de validação:** playwright

#### UX-NEURO-009 — Agenda carrega só a 1ª página (50) como se fosse o total; filtros de servidor são ignorados (P1 · M)

- **Produto/superfícies:** NeuroEvolui
- **Papel/jornada:** professional, clinic_manager, owner · jornada J-NEURO-03 · frequência: ocasional
- **Categoria/estado:** estados · IMPLEMENTADO · confiança: verificado-no-código · verificação: CONFIRMADO
- **Impacto no usuário:** Com >50 consultas, registros somem da tabela, do calendário e dos KPIs ('Total no período', 'Receita confirmada') sem qualquer aviso.
- **Impacto no negócio:** Profissional não vê consulta existente → duplo agendamento, falta ao atendimento, receita subestimada.
- **Evidência:** `apps/neuroevolui/frontend/src/views/ConsultationListView.vue:806-809`
- **Recomendação:** Adotar o padrão server-mode do PatientListView (useResource + total do servidor) ou, no mínimo, ler res.total, avisar truncamento ('mostrando 50 de N') e paginar de verdade no servidor.
- **Critérios de aceite:** Com 60 consultas, a lista/calendário alcança todas e os KPIs refletem o total do servidor
- **Método de validação:** contrato-api · **dependências:** API: implementar filtros server-side de consultations (patient_id/professional_id/período) ou expor pageSize adequado

#### UX-QA-003 — Gate de frontend da Forja é só `vite build`: NeuroEvolui passou verde com 6 rotas mortas e ação quebrada (P1 · M)

- **Produto/superfícies:** QA/Regressão (afeta: neuroevolui, contaviva-360, contaviva-pro, zapbridge, imobia)
- **Papel/jornada:** operador-dev da plataforma · jornada J-QA-01 · frequência: sempre
- **Categoria/estado:** heuristica-prevencao · PARCIALMENTE IMPLEMENTADO · confiança: verificado-no-código · verificação: CONFIRMADO
- **Impacto no usuário:** Apps da Forja com 69-75 testes de API publicam UI com navegação morta, botões que lançam exceção e confirmações que não persistem.
- **Impacto no negócio:** O caso NeuroEvolui (saúde) provou o custo: 76 arquivos de teste verdes e jornada clínica quebrada; auto-merge amplifica.
- **Evidência:** `.github/workflows/forge-tests.yml:82`
- **Recomendação:** Acoplar ao forge-tests uma etapa (2b) de rota-smoke Playwright genérica (harness H1): para cada path estático do router de cada app alvo, goto + assert de heading/≠NotFound + zero erros de console; gerável pelo scaffold da Forja.
- **Critérios de aceite:** PR com view viva navegando para rota inexistente falha o gate · As rotas do router de cada app da Forja renderizam sem erro de console no CI
- **Método de validação:** playwright · **dependências:** UX-NEURO-002; UX-NEURO-003; UX-NEURO-008; UX-CV360-010; UX-DS-007

#### UX-QA-004 — Contrato front↔back sem verificador em nenhuma esteira: validate:openapi cobre só API↔spec (e falta em 2 apps) (P1 · M)

- **Produto/superfícies:** QA/Regressão (afeta: contaviva-pro, contaviva-360, neuroevolui, gymops, imobia, zapbridge)
- **Papel/jornada:** operador-dev da plataforma · jornada J-QA-01 · frequência: frequente
- **Categoria/estado:** heuristica-consistência · PARCIALMENTE IMPLEMENTADO · confiança: verificado-no-código · verificação: CONFIRMADO
- **Impacto no usuário:** UI chama rota inexistente (editar sempre falha), envia campos que a API descarta e valida senha com regra diferente da API — tudo passa verde.
- **Impacto no negócio:** Família de 6 achados P0/P1 da auditoria nasceu deste buraco; é a classe de bug mais barata de detectar estaticamente.
- **Evidência:** `apps/neuroevolui/api/package.json:10-11`
- **Recomendação:** Criar harness H4: scanner estático que extrai as chamadas do api-client do frontend (métodos + paths literais + payload keys) e compara com o openapi/route-table do backend; acoplar ao forge-tests e ao ci-apps; adicionar validate:openapi aos contaviva-360/pro.
- **Critérios de aceite:** Frontend chamando rota/método ausente do backend falha o PR · Os 6 achados-dependência viram casos de teste do scanner
- **Método de validação:** contrato-api · **dependências:** UX-CVPRO-002; UX-NEURO-004; UX-NEURO-005; UX-NEURO-014; UX-GYMOPS-001; UX-GYMOPS-006

#### UX-REQHUB-001 — Linhas de tabela com role="button" destroem a semântica de tabela para leitores de tela (P1 · M)

- **Produto/superfícies:** Reqhub
- **Papel/jornada:** todos · jornada J-REQHUB-01 · frequência: sempre
- **Categoria/estado:** wcag-1.3.1 · IMPLEMENTADO · confiança: verificado-no-código · verificação: CONFIRMADO
- **Impacto no usuário:** Usuário de leitor de tela perde navegação por células: a linha vira só 'Abrir REQ-X, botão'; título/status/prioridade/cobertura ficam inacessíveis no modo tabela.
- **Impacto no negócio:** Principal superfície de consulta da base fica estruturalmente inacessível; risco de retrabalho quando houver auditoria formal.
- **Evidência:** `apps/reqhub/frontend/assets/app.js:108-109`
- **Recomendação:** Manter <tr> semântica e mover a ação para link/botão na célula do ID (padrão btn-link já existente); manter o clique na linha como atalho de mouse sem role, preservando rows/cells para AT.
- **Critérios de aceite:** NVDA/VoiceOver navega célula a célula nas tabelas do Explorador/Cobertura · Cada linha continua abrível por teclado via controle nativo focável
- **Método de validação:** teste-manual-teclado

#### UX-SICAT-002 — 'Resumo de hoje' conta status sobre a 1ª página de 10 manifestos (P1 · M)

- **Produto/superfícies:** SICAT
- **Papel/jornada:** generator, receiver, carrier · jornada J-SICAT-01 · frequência: frequente
- **Categoria/estado:** estados · IMPLEMENTADO · confiança: verificado-no-código · verificação: CONFIRMADO
- **Impacto no usuário:** Com >10 manifestos no dia (lote permite 100), os cartões somam no máximo 10 — 'Com problema: 0' pode esconder falhas reais.
- **Impacto no negócio:** Painel de aterrissagem exibe número operacional errado sem indício; decisões baseadas em dado incompleto.
- **Evidência:** `apps/sicat/frontend/src/features/dashboard/DashboardView.vue:184-191`
- **Recomendação:** Somar buckets a partir de contagem agregada por status vinda do backend (novo campo em manifests do overview), mantendo a tabela 'Últimos manifestos' com os 10 itens; enquanto isso, exibir 'entre os N mais recentes' junto aos cartões.
- **Critérios de aceite:** Com 30 manifestos no dia (12 com falha), o cartão 'Com problema' mostra 12 · Nenhum cartão soma menos que o total real do dia
- **Método de validação:** contrato-api · **dependências:** API: /v1/dashboard/overview expor contagem por status do dia (ou o front consultar totalItems por situação)

#### UX-NAV-001 — Duas malhas de navegação: 11 apps de produto sem retorno ao Portal nem troca de produto (P1 · G)

- **Produto/superfícies:** Integração/Navegação (afeta: sicat, gymops, zapbridge, imobia, contaviva-360, contaviva-pro, neuroevolui, besc, rmambiental, anarabottini, portal)
- **Papel/jornada:** todos · jornada J-NAV-02 · frequência: sempre
- **Categoria/estado:** ia · NÃO INICIADO · confiança: verificado-no-código · verificação: CONFIRMADO
- **Impacto no usuário:** Quem entra num produto perde a plataforma: troca de produto e retorno ao hub só editando a URL na mao.
- **Impacto no negócio:** O 'ecossistema NovaIT' que o Portal vende não existe na volta; descoberta cruzada de produtos zero.
- **Evidência:** `packages/platform-shell/shell.js:15-16`
- **Recomendação:** Definir contrato de retorno ao hub: variante mínima da casca p/ produtos (brand + launcher, sem identidade SSO) OU link 'Plataforma NovaIT' padronizado no shell de cada app, semeado no golden path/template da Forja.
- **Critérios de aceite:** 3 apps de produto exibem link funcional para o Portal · golden path de app novo inclui o retorno por padrão
- **Método de validação:** inspecao-visual · **dependências:** UX-DS-007; UX-PORTAL-008

#### UX-ANA-002 — /contato não é renderizada pelo CMS — edição da página no Console não tem efeito (P1 · P)

- **Produto/superfícies:** Ana Rabottini
- **Papel/jornada:** editor-cms, visitante · jornada J-ANA-03 · frequência: sempre
- **Categoria/estado:** heuristica-consistência · PARCIALMENTE IMPLEMENTADO · confiança: verificado-no-código · verificação: CONFIRMADO
- **Impacto no usuário:** Editor altera a página 'contato' no CMS e nada muda no público nem no preview; textos hardcoded ficam imutáveis.
- **Impacto no negócio:** Fluxo de edição de conteúdo (proposta central do CMS) quebrado para 1 das 2 páginas; engana o operador.
- **Evidência:** `apps/anarabottini/src/pages/Contato.tsx:17-30`
- **Recomendação:** Renderizar Contato.tsx como a Home: useContentTree + findPage('contato') + SectionRenderer (as seções section-heading e lead-form já existem na árvore default), mantendo os cards de canais como bloco fixo ou novo kind.
- **Critérios de aceite:** Editar o título de 'contato' no Console reflete no público após publicar · Preview em modo edição mostra as seções da página contato
- **Método de validação:** teste-manual-teclado

#### UX-BESC-002 — titles:read roteia advogado/juiz para a área de GESTÃO de títulos com affordances de escrita (P1 · P)

- **Produto/superfícies:** BESC
- **Papel/jornada:** lawyer, judge · jornada J-BESC-04 · frequência: sempre
- **Categoria/estado:** rbac-seguranca-percebida · IMPLEMENTADO · confiança: verificado-no-código · verificação: CONFIRMADO
- **Impacto no usuário:** Auditor vê nav 'Títulos', entra na gestão, tenta 'Novo título'/transição e colhe 403 cru — contradiz o 'não pode alterar nada'
- **Impacto no negócio:** Mina a confiança no isolamento read-only do portal de auditoria, promessa central do desenho regulatório
- **Evidência:** `apps/besc/frontend/src/App.jsx:220`
- **Recomendação:** Gatear nav e rotas /gestao/títulos por permissão de escrita (ex.: titles:create) ou por escopo all; auditor com titles:read linked deve cair só em /auditoria. Esconder affordances de escrita quando faltar a permissão específica.
- **Critérios de aceite:** Advogado/juiz seed não vê o item 'Títulos' nem abre /gestao/títulos · Nenhum botão de escrita renderiza habilitado sem a permissão que a API exige
- **Método de validação:** teste-manual-teclado

#### UX-CONSOLE-003 — Clique-fora/Esc fecham drawer de edição descartando alterações sem confirmação (P1 · P)

- **Produto/superfícies:** Console
- **Papel/jornada:** project-members, platform-admins · jornada J-CONSOLE-04 · frequência: frequente
- **Categoria/estado:** heuristica-prevencao · IMPLEMENTADO · confiança: verificado-no-código · verificação: CONFIRMADO
- **Impacto no usuário:** No modo Avançado do CMS, a seção editada só persiste no botão Salvar; um clique fora do drawer apaga tudo silenciosamente. Idem criação de item.
- **Impacto no negócio:** Perda de trabalho do editor de conteúdo; mina a confiança no CMS.
- **Evidência:** `console/frontend/src/components/ContentEditor.jsx:53`
- **Recomendação:** Dirty-check no SectionDrawer e no ItemDrawer (modo criação): se houver alteração não salva, abrir ConfirmDialog ('Descartar alterações?') antes de fechar por Esc/clique-fora.
- **Critérios de aceite:** Clique-fora com dados alterados pede confirmação · Fechar sem alterações continua imediato
- **Método de validação:** teste-manual-teclado

#### UX-CONSOLE-005 — README do Console descreve só o painel read-only e um ConfigMap que a UI não usa (P1 · P)

- **Produto/superfícies:** Console
- **Papel/jornada:** platform-admins · frequência: sempre
- **Categoria/estado:** divergencia-docs · OBSOLETO/DIVERGENTE · confiança: verificado-no-código · verificação: CONFIRMADO
- **Impacto no usuário:** Operador/novo dev guiado pelo README desconhece CMS, PM, usuários e compartilhados, e procura links rápidos num ConfigMap que o frontend não lê.
- **Impacto no negócio:** Documentação canônica engana sobre a capacidade real e o modelo de configuração do componente.
- **Evidência:** `console/README.md:27-28`
- **Recomendação:** Atualizar o README: mapa das 10 seções + papéis, apontar o AGENTS.md para pm-api/auth, e remover (ou reimplementar) a menção ao console-config como fonte dos links.
- **Critérios de aceite:** README lista as seções reais e seus papéis · Nenhuma referência a comportamento que o código não tem
- **Método de validação:** inspecao-visual

#### UX-CV360-002 — Módulos centrais sem superfície: dashboards apontam para entidades sem nenhuma tela de gestão (P0 · GG)

- **Produto/superfícies:** ContaViva 360
- **Papel/jornada:** contador, cliente_pj, manager · jornada J-CV360-03 · frequência: sempre
- **Categoria/estado:** ia · PARCIALMENTE IMPLEMENTADO · confiança: verificado-no-código · verificação: CONFIRMADO
- **Impacto no usuário:** Contador vê documentos/tarefas pendentes e não tem onde agir; PJ vê contagem de NFs sem poder emitir — becos sem saída
- **Impacto no negócio:** Jornadas críticas de 2 papéis só operáveis via API/curl; produto parece vitrine de dashboards
- **Evidência:** `apps/contaviva-360/frontend/src/nav.js:3-7`
- **Recomendação:** Gerar (forge-build-ui) as telas de documentos, tarefas, cadastros PF/PJ e NF-e sobre as APIs existentes, e ligar os widgets dos dashboards a essas telas (ex.: 'Documentos Pendentes' → tela de documentos com upload).
- **Critérios de aceite:** Cada entidade exibida em dashboard tem rota de gestão alcançável pelo nav · Contador consegue concluir o fluxo documento pendente → ação sem sair da UI
- **Método de validação:** inspecao-visual · **dependências:** produto: priorizar telas de documentos, tarefas, cadastros PF/PJ e NF-e (APIs REQ-0002/0004/0006 já prontas)

#### UX-DOCS-003 — Docs do besc negam o código no ar: 'nenhum código de producao foi escrito' vs fases 0-4 implementadas (P1 · P)

- **Produto/superfícies:** Docs↔código
- **Papel/jornada:** stakeholder-externo, operador · jornada J-DOCS-04 · frequência: sempre
- **Categoria/estado:** divergencia-docs · OBSOLETO/DIVERGENTE · confiança: verificado-no-código · verificação: CONFIRMADO
- **Impacto no usuário:** Leitor externo (publico declarado do doc) conclui que o marketplace não existe; 'SEM login' contradiz o RBAC real.
- **Impacto no negócio:** Informacao factualmente errada em domínio de valores mobiliarios; risco reputacional/regulatorio na comunicacao.
- **Evidência:** `apps/besc/docs/evolution/00-visao-geral.md:13-14`
- **Recomendação:** Adicionar banner de status atualizado em 00-visao-geral.md e ESCOPO-FUNCIONAL.md ('fases 0-4 implementadas em modo demonstracao; gate regulatorio pendente'), e reescrever o paragrafo de abertura do CLAUDE.md removendo 'SEM login' como definicao atual.
- **Critérios de aceite:** Nenhum doc do besc afirma que não ha código/deploy/migrations · Primeiro paragrafo do CLAUDE.md descreve o estado real (portal + marketplace em demo)
- **Método de validação:** inspecao-visual

#### UX-DOCS-004 — zapbridge: devops.yaml e meta-docs apontam o frontend Expo aposentado em vez do web/ React+Vite (P1 · P)

- **Produto/superfícies:** Docs↔código
- **Papel/jornada:** operador, agente-claude · jornada J-DOCS-02 · frequência: sempre
- **Categoria/estado:** divergencia-docs · OBSOLETO/DIVERGENTE · confiança: verificado-no-código · verificação: CONFIRMADO
- **Impacto no usuário:** Quem segue o contrato rebuilda e publica o frontend aposentado por cima do atual — regressao total de UX para todos os usuários.
- **Impacto no negócio:** Contrato declarativo da esteira (devops.yaml) desatualizado quebra a confiabilidade do golden path.
- **Evidência:** `apps/zapbridge/devops.yaml:24-25`
- **Recomendação:** Trocar build.context do serviço web para 'web' no devops.yaml, atualizar o comentario da linha 3, o comentario de k8s/zapbridge-web.yaml:9 e as secoes de frontend de CLAUDE.md/README.md/AGENTS.md para a stack React 18 + Vite (Expo mantido apenas como legado em app/).
- **Critérios de aceite:** devops.yaml builda web/ e nenhum meta-doc descreve o Expo como frontend atual · grep -ri 'expo' nos meta-docs só retorna mencoes historicas explicitas
- **Método de validação:** inspecao-visual

#### UX-GYMOPS-003 — Sidebar mostra 'Painel Geral'/'Central' a unit_manager e area_leader, mas /dashboard os expulsa em silêncio (P1 · P)

- **Produto/superfícies:** GymOps
- **Papel/jornada:** unit_manager, area_leader · jornada J-GYMOPS-04 · frequência: sempre
- **Categoria/estado:** navegação · IMPLEMENTADO · confiança: verificado-no-código · verificação: CONFIRMADO
- **Impacto no usuário:** Clicar em 'Painel Geral' leva a /me sem nenhuma explicação — item de menu que 'não funciona' mina a confiança na navegação.
- **Impacto no negócio:** Inconsistência entre menu, página e navigation-map.md induz erro operacional e chamados de suporte.
- **Evidência:** `apps/gymops/apps/web/src/components/layout/sidebar.tsx:25`
- **Recomendação:** Alinhar as três pontas: ou o sidebar esconde 'Painel Geral' para papéis que o dashboard rejeita, ou o dashboard aceita unit_manager com dados escopados. Se mantiver o gate, exibir aviso ('Disponível para gestores da rede') em vez de replace silencioso.
- **Critérios de aceite:** Nenhum item do sidebar leva a redirect silencioso para outra tela · navigation-map.md igual ao comportamento do código
- **Método de validação:** playwright · **dependências:** produto: decidir se unit_manager deve ter um dashboard escopado (navigation-map.md diverge internamente)

#### UX-PREC-004 — Passos marcados vivem só em memória: reload zera a lista e duplica step_index (P1 · P)

- **Produto/superfícies:** Portal Recorder
- **Papel/jornada:** operador · jornada J-PREC-03 · frequência: ocasional
- **Categoria/estado:** estados · PARCIALMENTE IMPLEMENTADO · confiança: verificado-no-código · verificação: CONFIRMADO
- **Impacto no usuário:** Reabrir/recarregar a captura mostra 'Passos marcados (0)' mesmo com passos salvos; novos passos recomeçam do índice 0.
- **Impacto no negócio:** Índices duplicados ('passo 0' repetido) corrompem a narrativa da revisão que alimenta o contrato.
- **Evidência:** `apps/portal-recorder/frontend/src/views/CaptureView.jsx:42`
- **Recomendação:** Hidratar a lista no mount via GET /v1/sessions/:id/annotations (criar wrapper em api.js) e derivar step_index do total persistido, não do estado local.
- **Critérios de aceite:** Recarregar a captura exibe os passos já salvos · step_index nunca repete dentro da mesma sessão
- **Método de validação:** playwright

#### UX-PREC-005 — Screencast sem reconexão nem ação de recuperação quando o WS cai (P1 · P)

- **Produto/superfícies:** Portal Recorder
- **Papel/jornada:** operador · jornada J-PREC-03 · frequência: ocasional
- **Categoria/estado:** heuristica-recuperação · PARCIALMENTE IMPLEMENTADO · confiança: verificado-no-código · verificação: CONFIRMADO
- **Impacto no usuário:** Queda do WS mostra 'Conexao encerrada.' sem botão de reconectar nem instrução; o operador precisa adivinhar o F5.
- **Impacto no negócio:** Ausência de recuperação na ação primária da ferramenta; captura em andamento fica travada visualmente.
- **Evidência:** `apps/portal-recorder/frontend/src/views/CaptureView.jsx:299-304`
- **Recomendação:** Adicionar botão 'Reconectar' no overlay (reexecuta o effect do WS via chave de estado) e, opcionalmente, reconexão automática com backoff enquanto a sessão estiver ativa.
- **Critérios de aceite:** Overlay de 'closed'/'error' oferece ação de reconexão que restabelece o stream sem reload · Estado 'ao vivo' volta após reconectar
- **Método de validação:** teste-manual-teclado

#### UX-PREC-006 — Contraste < 4.5:1 nos textos de estado pequenos (ok/warn) no tema claro (P1 · P)

- **Produto/superfícies:** Portal Recorder
- **Papel/jornada:** operador · jornada J-PREC-04 · frequência: sempre
- **Categoria/estado:** wcag-1.4.3 · IMPLEMENTADO · confiança: verificado-no-código · verificação: CONFIRMADO
- **Impacto no usuário:** Badges 'recording'/'created', 'redigido' e chips GET/PUT usam #16a34a/#d97706 (~3.2:1) em texto de 0.68–0.72rem.
- **Impacto no negócio:** Sinais operacionais e de segurança (redação) com legibilidade reprovada em AA no fluxo de revisão.
- **Evidência:** `apps/portal-recorder/frontend/src/platform-tokens.css:24-25`
- **Recomendação:** Criar aliases de foreground mais escuros (--ok-text/--warn-text, tons ~700/800) para textos pequenos de status/badge/method no tema claro, mantendo os tons atuais para dots e fundos; validar com axe.
- **Critérios de aceite:** Texto de .status--ok/.status--warn/.badge-warn/.method--* atinge ≥4.5:1 no tema claro (axe sem violação 1.4.3)
- **Método de validação:** axe · **dependências:** produto: alinhar com o design-tokens central (tons de texto de estado); fix local possível via aliases, como já feito para o accent

#### UX-RMAMB-003 — Números de autoridade ilustrativos (+250 projetos etc.) publicados com nota minúscula de baixo contraste (P1 · P)

- **Produto/superfícies:** RM Ambiental
- **Papel/jornada:** visitante · jornada J-RMAMB-01 · frequência: sempre
- **Categoria/estado:** heuristica-consistência · IMPLEMENTADO · confiança: verificado-no-código · verificação: CONFIRMADO
- **Impacto no usuário:** Visitante lê '+250 Projetos analisados' como fato; quem nota o asterisco 'ilustrativos' perde confiança na etapa central de conversão.
- **Impacto no negócio:** Risco reputacional/ético de publicar métricas fictícias em nome de empresa real; mina a prova social do site.
- **Evidência:** `apps/rmambiental/src/data/content.default.ts:69-74`
- **Recomendação:** Substituir os stats por números reais via CMS (sem deploy) ou ocultar o bloco stats até tê-los; se mantiver nota, dar contraste AA (remover /70).
- **Critérios de aceite:** Nenhum indicador fictício exibido ao público · Se houver nota, contraste ≥ 4.5:1
- **Método de validação:** inspecao-visual · **dependências:** produto: obter os indicadores oficiais da RM Ambiental Brasil

#### UX-ZAP-001 — Acoes de mensagem (responder/reagir/copiar) só aparecem no hover — inacessíveis por teclado (P1 · P)

- **Produto/superfícies:** ZapBridge
- **Papel/jornada:** usuário · jornada J-ZAP-03 · frequência: sempre
- **Categoria/estado:** wcag-2.1.1 · IMPLEMENTADO · confiança: verificado-no-código · verificação: CONFIRMADO
- **Impacto no usuário:** Usuario de teclado não consegue responder, reagir, copiar nem encaminhar; em touch depende de emulacao de hover não confiavel.
- **Impacto no negócio:** Violacao WCAG nível A no fluxo principal do produto; nucleo da mensageria excludente.
- **Evidência:** `apps/zapbridge/web/src/components/MessageBubble.tsx:104-111`
- **Recomendação:** Renderizar as ações também em foco (focus-within) e/ou botão de overflow sempre focavel por bolha; adicionar long-press no touch. Manter o hover como atalho, nunca como único caminho.
- **Critérios de aceite:** Com Tab até uma mensagem, e possível responder/reagir/copiar sem mouse · Em touch (sem hover), as ações são alcancaveis por gesto ou botão visível
- **Método de validação:** teste-manual-teclado

#### UX-ZAP-002 — Sessao expirada sem tratamento: nenhum interceptor de 401, app 'logado' para de funcionar (P1 · P)

- **Produto/superfícies:** ZapBridge
- **Papel/jornada:** usuário · jornada J-ZAP-05 · frequência: ocasional
- **Categoria/estado:** estados · IMPLEMENTADO · confiança: inferido · verificação: CONFIRMADO
- **Impacto no usuário:** Com token expirado, todas as chamadas falham em silencio; nenhuma mensagem de sessão expirada nem redirect ao login.
- **Impacto no negócio:** Usuario conclui que o app quebrou ou que não ha conversas; único remedio e recarregar a página.
- **Evidência:** `apps/zapbridge/web/src/api/client.ts:42-52`
- **Recomendação:** Adicionar interceptor de resposta: em 401, limpar token, setar user=null (rotas caem para /login) e exibir aviso 'Sessao expirada, entre novamente'. Tratar também o erro de auth do socket.
- **Critérios de aceite:** Request com 401 leva ao /login com mensagem de sessão expirada
- **Método de validação:** teste-manual-teclado

#### UX-ZAP-003 — Erro de carregamento indistinguivel de vazio na lista de conversas e no histórico do chat (P1 · P)

- **Produto/superfícies:** ZapBridge
- **Papel/jornada:** usuário · jornada J-ZAP-03 · frequência: ocasional
- **Categoria/estado:** estados · IMPLEMENTADO · confiança: verificado-no-código · verificação: CONFIRMADO
- **Impacto no usuário:** Falha de rede/API mostra 'Nenhuma conversa'/'Nenhuma mensagem ainda' — usuário acha que perdeu os dados; sem retry.
- **Impacto no negócio:** Erro mascarado de vazio gera suporte e desconfianca no produto.
- **Evidência:** `apps/zapbridge/web/src/store/chats.store.ts:41-43`
- **Recomendação:** Consumir o campo error do store na lista e propagar erro do histórico no hook; exibir estado de erro com botão 'Tentar novamente' distinto do empty state.
- **Critérios de aceite:** Com API fora, lista e chat exibem erro acionavel (retry), não 'Nenhuma conversa/mensagem'
- **Método de validação:** playwright

#### UX-ZAP-006 — Impossivel desativar a IA ou apagar dados de IA na web — a tela promete o contrario (P1 · P)

- **Produto/superfícies:** ZapBridge
- **Papel/jornada:** usuário · jornada J-ZAP-04 · frequência: sempre
- **Categoria/estado:** ia · PARCIALMENTE IMPLEMENTADO · confiança: verificado-no-código · verificação: CONFIRMADO
- **Impacto no usuário:** Quem consentiu não tem como revogar nem expurgar dados ('Voce pode desativar quando quiser' e falso na web).
- **Impacto no negócio:** RF060 exige botão 'Apagar dados de IA'; promessa não cumprida = risco de confianca/conformidade (LGPD percebida).
- **Evidência:** `apps/zapbridge/web/src/pages/AssistantPage.tsx:109-111`
- **Recomendação:** Secao 'Inteligencia (IA)' das Configuracoes com: toggle de consentimento (aiApi.revoke/accept), botão 'Apagar dados de IA' (aiApi.purge) com confirmação, e estado atual visível — como existia no app legado (AiConsentScreen/SettingsScreen).
- **Critérios de aceite:** Usuario consegue revogar o consentimento pela UI · Botao de expurgo com confirmação chama /ai/data/purge e confirma sucesso
- **Método de validação:** playwright

#### UX-AICP-001 — Governanca de IA sem superfície de leitura: GETs do control-plane não tem nenhum consumidor (P1 · G)

- **Produto/superfícies:** UX de IA (afeta: ai-control-plane, console)
- **Papel/jornada:** operador-plataforma · jornada J-AI-01 · frequência: sempre
- **Categoria/estado:** ia · NÃO INICIADO · confiança: verificado-no-código · verificação: CONFIRMADO
- **Impacto no usuário:** Operador governa prompts/feedback/evals por curl com token; overview 'para dashboards/console' nunca chega a um dashboard
- **Impacto no negócio:** REQ-AI-0011/0012 aprovados ficam pela metade; dados de qualidade coletados e nunca lidos = investimento sem retorno
- **Evidência:** `apps/ai-control-plane/api/src/routes.js:140-141`
- **Recomendação:** Criar aba 'IA' no DevOps Console federando GET /ai-control/v1/overview + feedback/summary + eval-runs, com visao por app e deep-links para as UIs app-scoped (SICAT ai-control). Busca no repo por 'feedback/summary\|eval-runs\|/v1/overview' confirma: só escritores e docs, nenhum leitor.
- **Critérios de aceite:** Console exibe overview/feedback/evals do control-plane · Operador não precisa de curl para leitura de governanca
- **Método de validação:** inspecao-visual · **dependências:** produto: decidir consolidar leitura no Console vs frontend próprio do ai-control-plane

#### UX-IMOBIA-004 — RBAC de fachada: 4 papéis no enum e na sidebar, zero gating e papéis inatingíveis (P1 · G)

- **Produto/superfícies:** Imobia
- **Papel/jornada:** todos · frequência: sempre
- **Categoria/estado:** rbac-seguranca-percebida · PARCIALMENTE IMPLEMENTADO · confiança: verificado-no-código · verificação: CONFIRMADO
- **Impacto no usuário:** A UI exibe um papel que não muda nada; não há como convidar corretor/financeiro/vistoriador nem restringir o que cada um faz
- **Impacto no negócio:** Modelo multi-perfil do CONCEPCAO inoperante; falsa sensação de segregação num produto multi-tenant fintech
- **Evidência:** `apps/imobia/api/src/lib/crud.ts:25`
- **Recomendação:** Curto prazo (front): remover/relabelar a exibição do papel enquanto ele não tem efeito. Médio: telas de membros/convite + writeRoles nos módulos sensíveis (financeiro, corbam) + menus condicionados ao papel, com restrição explicada.
- **Critérios de aceite:** grep writeRoles retorna uso em módulos · Existe fluxo de convite atribuindo papel não-admin
- **Método de validação:** contrato-api · **dependências:** API: aplicar writeRoles por módulo e criar rotas de membership/convite; produto: definir matriz papel × módulo

#### UX-CVPRO-005 — Recuperação de senha inexistente em qualquer canal (nem self-service, nem via admin) (P1 · M)

- **Produto/superfícies:** ContaViva Pro
- **Papel/jornada:** member, admin · jornada J-CVPRO-05 · frequência: ocasional
- **Categoria/estado:** heuristica-recuperação · NÃO INICIADO · confiança: verificado-no-código · verificação: CONFIRMADO
- **Impacto no usuário:** Quem esquece a senha fica permanentemente trancado; nem o admin consegue redefinir (PATCH só aceita role/is_active)
- **Impacto no negócio:** Perda de contas e de histórico; inaceitável para a visão de ERP com auth própria
- **Evidência:** `apps/contaviva-pro/frontend/src/views/AuthView.vue:38-41`
- **Recomendação:** Mínimo viável: permitir que o admin defina nova senha em /admin/users (com revogação de sessões, padrão já existente); ideal: fluxo 'esqueci a senha' no AuthView. Ambos dependem de endpoint novo.
- **Critérios de aceite:** Existe caminho documentado e visível na UI para recuperar acesso de uma conta com senha esquecida
- **Método de validação:** teste-manual-teclado · **dependências:** API: endpoint de redefinição de senha (self-service com token ou administrativo)

#### UX-NEURO-008 — 'Confirmar e aplicar' rascunho do Assistente IA não persiste nada — só marca flag local e exibe sucesso (P1 · M)

- **Produto/superfícies:** NeuroEvolui
- **Papel/jornada:** professional · jornada J-NEURO-07 · frequência: sempre
- **Categoria/estado:** heuristica-visibilidade · PARCIALMENTE IMPLEMENTADO · confiança: verificado-no-código · verificação: CONFIRMADO
- **Impacto no usuário:** Profissional confirma 'adotado como definitivo', vê 'Rascunho aplicado' e acredita que salvou; nada é gravado e o estado some.
- **Impacto no negócio:** Plano de intervenção clínico 'aplicado' que não existe no prontuário — risco clínico e de confiança na IA.
- **Evidência:** `apps/neuroevolui/frontend/src/views/AssistantView.vue:858-866`
- **Recomendação:** Enquanto não houver persistência, trocar o CTA por 'Copiar rascunho' / 'Levar para nova evolução' (navegar para /evolution-notes/new com o texto pré-carregado) e remover a promessa 'definitivo'.
- **Critérios de aceite:** Após 'aplicar', o conteúdo existe em algum registro navegável (evolução/relatório) ou o CTA deixa de prometer persistência
- **Método de validação:** teste-manual-teclado · **dependências:** API: endpoint para persistir o rascunho aplicado (ex.: criar evolution-note ou patient-report)

#### UX-QA-002 — As 18 specs Playwright e os 55 testes de backend do sicat não rodam em nenhum gate de PR (P1 · G)

- **Produto/superfícies:** QA/Regressão
- **Papel/jornada:** operador-dev da plataforma · jornada J-QA-02 · frequência: sempre
- **Categoria/estado:** heuristica-prevencao · PARCIALMENTE IMPLEMENTADO · confiança: verificado-no-código · verificação: CONFIRMADO
- **Impacto no usuário:** Mudança no app fiscal (MTR/CDF) publica com a maior suíte de UI da frota parada; regressões de fluxo só aparecem em produção.
- **Impacto no negócio:** Investimento em 73 arquivos de teste sem retorno; risco regulatório (documentos CETESB) sem rede de proteção.
- **Evidência:** `.github/workflows/ci-apps.yml:65`
- **Recomendação:** Criar ci-sicat-e2e espelhando o ci-gymops-e2e (Postgres service + backend com gateway mock + Playwright das 18 specs em PR com path-filter apps/sicat/**); no mínimo imediato, promover o job sicat do test-services para pull_request (backend).
- **Critérios de aceite:** PR que toca apps/sicat/** executa a suíte Playwright e os testes de backend · Falha de teste bloqueia o merge
- **Método de validação:** playwright · **dependências:** API: CETESB_GATEWAY_MODE=mock estável para CI (test-services.yml já documenta a pendência)

#### UX-SICAT-003 — Administração de acessos é somente leitura; API de escrita completa sem superfície (P1 · G)

- **Produto/superfícies:** SICAT
- **Papel/jornada:** admin global / SRE · jornada J-SICAT-07 · frequência: sempre
- **Categoria/estado:** rbac-seguranca-percebida · PARCIALMENTE IMPLEMENTADO · confiança: verificado-no-código · verificação: CONFIRMADO
- **Impacto no usuário:** O admin não consegue conceder/revogar perfil, resetar/expirar senha nem revogar sessões pela UI — a tela promete 'operação' e só exibe.
- **Impacto no negócio:** Gestão de acesso vira curl/DBA fora da trilha desenhada; onboarding de usuário novo não se completa no produto.
- **Evidência:** `apps/sicat/backend/src/services/access-admin-service.ts:639`
- **Recomendação:** Adicionar às linhas de usuário ações 'Conceder perfil', 'Revogar perfil', 'Resetar senha' e 'Expirar senha' (com confirmação e motivo), consumindo os endpoints já auditados; ou ajustar a descrição da tela para 'consulta' enquanto a escrita não existir.
- **Critérios de aceite:** Admin concede um perfil a um usuário pela UI e o vê refletido em 'Perfis atribuídos' · Reset de senha pela UI exige confirmação e informa sessões revogadas
- **Método de validação:** teste-manual-teclado

#### UX-NEURO-006 — Papel patient existe no RBAC e na visão do produto, mas não tem nenhuma superfície no frontend (P1 · GG)

- **Produto/superfícies:** NeuroEvolui
- **Papel/jornada:** patient · jornada J-NEURO-08 · frequência: sempre
- **Categoria/estado:** onboarding · PARCIALMENTE IMPLEMENTADO · confiança: verificado-no-código · verificação: CONFIRMADO
- **Impacto no usuário:** Paciente logado (ou usuário sem grupo, que vira patient por default) vê o menu de gestão da clínica e recebe 'Acesso restrito' em cadeia.
- **Impacto no negócio:** Promessa central da visão (área do paciente + IA) inexistente; papel default do RBAC cai numa UI hostil.
- **Evidência:** `apps/neuroevolui/api/src/rbac.js:4`
- **Recomendação:** Curto prazo: quando /me devolver role patient, trocar o nav por um conjunto mínimo (minhas consultas, assistente em modo paciente, configurações). Médio prazo: implementar a área do paciente prometida na visão.
- **Critérios de aceite:** Sessão com role patient não exibe itens de gestão no menu · Existe ao menos uma tela navegável útil para o papel
- **Método de validação:** playwright · **dependências:** produto: escopo da área do paciente (consultas próprias, orientações, IA modo paciente)

---

## 11. Quick wins

Itens de esforço PP/P, sem dependência de outros achados, sem alteração de regra de negócio, RBAC ou
API — prontos para PRs imediatos e independentes (top 15 por prioridade; a lista completa de quick
wins está marcada com ✔ na coluna QW da tabela 10.1).


| # | ID | Produto | Sev | Esf | O que fazer | Beneficia | Validação |
|---|---|---|---|---|---|---|---|
| 1 | UX-CV360-003 | ContaViva 360 | P1 | PP | No catch, exibir toast.error com a mensagem da API e manter o modal; antes da ação, usar o useConfirm já montado no App ('Marcar IRPF como pago?'). Extrair concludeObrig para composable único usado pelos 4 dashboards. | todos | teste-manual-teclado |
| 2 | UX-CV360-004 | ContaViva 360 | P1 | PP | No catch, NÃO setar view: deixar roleError renderizar o UiErrorState com retry (detectRole já está ligado ao @retry). Se o fallback for desejado, exibir banner persistente 'não foi possível identificar seu perfil — mostrando visão padrão'. | todos | teste-manual-teclado |
| 3 | UX-CV360-006 | ContaViva 360 | P1 | PP | Trocar por tokens reais: rgb(var(--ui-accent))/rgb(var(--ui-accent-fg)), rgb(var(--ui-border)), --ui-radius-sm\|md, --ui-text-xl; adicionar aria-pressed nos botões de horizonte. Vale um lint de CSS que rejeite var(--ui-*) fora de rgb() para triplets e tokens não declarados. | todos | inspecao-visual |
| 4 | UX-CV360-007 | ContaViva 360 | P1 | PP | Envolver os filtros em UiFormField (como FinancialReportsView já faz nas linhas 24-33) ou no mínimo aria-label ('Status', 'Categoria', 'Período — início', 'Período — fim'). | cliente_pj, todos | axe |
| 5 | UX-CVPRO-004 | ContaViva Pro | P1 | PP | No listener global de 'auth:logout', exibir toast 'Sessão expirada' e router.push({ name: 'login', query: { redirect: rota atual } }) — o mecanismo de retorno já existe no guard e no AuthView. | todos | playwright |
| 6 | UX-GYMOPS-006 | GymOps | P1 | PP | Trocar a validação e o placeholder do /invite para 8 caracteres, igual ao /setup e à API; opcionalmente mapear o 422 da API para mensagem amigável. | todos | unit-test |
| 7 | UX-NAV-002 | Integração/Navegação | P1 | P | Sondar com { redirect: 'manual' } e tratar response.type 'opaqueredirect'/status 0 como 'up' (roteado); alternativa: sondar endpoint publico por superfície (ex.: /devops/api/health fora do gate). O fetch atual segue o 302 até dev.nvit.com.br e morre em CORS -> catch -> 'down'. | todos | teste-manual-teclado |
| 8 | UX-NEURO-003 | NeuroEvolui | P1 | PP | Trocar confirm.ask({...}) por confirm({...}) (padrão das demais 20+ views); opcional: lint/teste estático proibindo o acesso .ask no retorno de useConfirm(). | professional, clinic_manager, owner | teste-manual-teclado |
| 9 | UX-PORTAL-001 | Portal | P1 | PP | Criar tokens de tinta p/ badges no tema claro (ex.: --warn-ink/--ok-ink ~ amber-800/green-800) mantendo os -soft como fundo; ajustar .tag e .state.is-error strong; revalidar com axe. Cálculo: warn 2,80:1, ok 2,88:1, tag 4,34:1, erro 3,67:1 (dark passa). | todos | axe |
| 10 | UX-RMAMB-002 | RM Ambiental | P1 | PP | Atualizar CLAUDE.md (armadilhas 3/4) e docs/status.md: AuthoritySection.tsx não existe (stats no SectionRenderer/content.default.ts), projects.ts é galeria real, site.ts tem contato real; único AJUSTAR restante é o link de privacidade do Footer. | todos | inspecao-visual |
| 11 | UX-DOCS-001 | Docs↔código | P1 | P | Atualizar specs/products/contaviva-pro/product.json (scaffold=merged, build=deployed com nota) e regenerar a baseline (/sync-spec); opcionalmente backfill de REQs no padrão D5 (imobia/zapbridge) para a vitrine refletir progresso real. | operador, agente-claude | inspecao-visual |
| 12 | UX-DS-001 | Design System | P1 | P | Reescrever a tabela de camadas do DESIGN_SYSTEM.md refletindo o real (A=design-tokens com 4 rotas; B=ui-vue; C=platform-shell; brand.json→--ui-*), corrigir a regra de contribuição para packages/ui-vue e linkar o doc em docs/README.md. | operador-dev da plataforma | inspecao-visual |
| 13 | UX-NEURO-002 | NeuroEvolui | P1 | P | Corrigir os alvos para as rotas registradas: /payment-transactions, /async-jobs, /, /notification-preferences, /patient-reports, /financial; adicionar teste estático que valida todo to="/..."/router.push contra o router. | todos | unit-test |
| 14 | UX-QA-001 | QA/Regressão | P1 | P | Adicionar entradas de matriz no ci-apps para imobia (build), besc/frontend (build), zapbridge/web (build) e criar ci-console (lint/build de console/**, que está fora do path-filter apps/**); evoluir depois para os harnesses H1/H3. | operador-dev da plataforma | contrato-api |
| 15 | UX-SICAT-001 | SICAT | P1 | P | No onMounted de ManifestsView, mapear route.query.focus para os chips de situação existentes (failed→{status:'failed'}, draft→{status:'draft'}, pending/completed→equivalentes por persona) e aplicar o filtro antes do primeiro search(). | generator, receiver, carrier | playwright |

---

## 12. Roadmap por ondas

A alocação de cada um dos 304 itens a exatamente uma onda é **determinística** (regras: P0 → Onda 0;
P1 de segurança percebida ou divergência enganosa → Onda 0; P1 de WCAG/estados/onboarding e todos os
quick wins PP/P → Onda 1; consistência/DS e dark mode → Onda 2; jornadas/papéis incompletos e P1
restantes → Onda 3; demais → Onda 4). A lista completa por onda está em 12.6. Estimativas em
"pontos-PP" (PP=1 · P=1,5 · M=2,5 · G=4 · GG=6). As ondas 1–4 podem começar por app tão logo os
itens de Onda 0 daquele app terminem — não são fases estritamente sequenciais de plataforma.

### Onda 0 — Bloqueadores, acesso e divergências que enganam (25 itens · 10 P0 + 15 P1 · ~54 pts)

- **Objetivo:** nenhuma jornada crítica bloqueada; nenhuma exposição estrutural/real por falta de
  auth; nenhum documento/contrato de esteira que induza o operador a publicar errado.
- **Aplicações:** ContaViva Pro e ContaViva 360 (auth + jornadas quebradas), NeuroEvolui (guard),
  GymOps (SSO sem organização, teclado da atividade), Imobia (teclado/modal), Portal Recorder
  (keyboard trap), plataforma (UX-A11Y-001 sistêmico), specs/meta-docs (UX-DOCS-001/003/004/005/007,
  UX-DS-001, UX-ZAP-007, UX-RMAMB-002), SICAT (UX-SICAT-003 admin sem ações), BESC, Console, Reqhub.
- **Perfis beneficiados:** todos os usuários das SPAs hoje sem login (anônimos deixam de ver
  estrutura interna; usuários reais ganham caminho de entrada); usuários de teclado/tecnologia
  assistiva (interação primária de 5+ produtos); operador da plataforma (esteira e vitrine da Forja
  voltam a dizer a verdade).
- **Itens de destaque:** UX-CVPRO-001 (API de records **sem autenticação real na borda** — o único
  P0 de exposição de dados confirmada), UX-CVPRO-002 (edição sempre falha: PUT inexistente),
  UX-CV360-001/UX-NEURO-001 (SPAs operacionais sem guard, confirmadas ao vivo), UX-GYMOPS-001
  (login SSO cai num app vazio), UX-A11Y-001 (clicável-sem-teclado em 5+ produtos), UX-PREC-001
  (canvas com trap de teclado), UX-ZAP-007 (devops.yaml publicaria o frontend aposentado).
- **Dependências:** decisão D1 (estratégia de auth por app — seção 14) para UX-CV360-001/UX-NEURO-001;
  UX-CV360-002 depende de decisão de produto (D3). Os demais itens não dependem de decisão.
- **Resultado esperado:** 0 P0 abertos; baseline/specs e meta-docs coerentes com o código.
- **Critérios de conclusão:** smoke por papel passa nas jornadas críticas dos 6 apps afetados;
  navegação por teclado abre o detalhe primário em GymOps/Imobia/Console/CV360/ZapBridge; anônimo
  não vê superfície operacional de CV360/NeuroEvolui; `products.json`/CLAUDE.md corrigidos.
- **Estimativa:** ~54 pts-PP (≈ 3–4 semanas de esforço concentrado).
- **Riscos:** correções de auth sem suíte de testes (mitigar com harness H1/H6 da seção 16 ANTES de
  mexer); UX-CV360-002 (GG) pode escorregar — se escorregar, degrade para "esconder módulos sem
  superfície" e reprogramar a construção na Onda 3.

### Onda 1 — Fundação compartilhada, a11y de fluxos principais e quick wins (137 itens · 41 P1 · ~168 pts)

- **Objetivo:** limpar os P1 de WCAG/estados/onboarding dos fluxos principais e executar o programa
  de quick wins (grande volume, esforço unitário mínimo, paralelizável por app).
- **Aplicações:** todas as 14 superfícies com UI + pacotes (`design-tokens`, `platform-shell`,
  `ui-vue`).
- **Perfis beneficiados:** usuários de leitores de tela e teclado (labels, `aria-current`, tabelas
  semânticas — UX-REQHUB-001); todos os usuários em falha (estados de erro acionáveis, fim dos
  becos de sessão — UX-ZAP-002/003, UX-CVPRO-003, UX-NEURO-007); visitantes (contraste dos badges
  UX-A11Y-003/UX-PORTAL-001, confirmado ao vivo); operadores (sonda do launcher UX-NAV-002).
- **Itens de destaque:** correção dos 2 renderers de badge (conserta 7+ superfícies de uma vez),
  sonda do launcher (`redirect:'manual'`), interceptador 401→login nos apps com auth própria,
  formulário do RM Ambiental (labels + nota ilustrativa), fluxo de convite do BESC (UX-BESC-001),
  agenda truncada do NeuroEvolui (UX-NEURO-009).
- **Dependências:** nenhuma externa; itens em pacotes compartilhados devem vir ANTES das cópias
  sincronizadas nos apps (ordem topológica da seção 13).
- **Resultado esperado:** fluxos principais AA nos pontos auditados; 0 becos de sessão; quick wins
  zerados.
- **Critérios de conclusão:** harness H2 (teclado/foco) e H3 (axe) verdes nos fluxos principais dos
  6 apps maduros; badges ≥ 4,5:1 medidos; os 15 quick wins da seção 11 entregues.
- **Estimativa:** ~168 pts-PP (alto volume, baixa complexidade unitária — ideal para execução
  contínua por app, inclusive via esteira de PRs automatizados).
- **Riscos:** volume gera fadiga de revisão — agrupar por app/pacote (seção 13); mudanças no ui-vue
  propagam por cópia sincronizada, exigindo re-sync disciplinado nos 3 apps consumidores.

### Onda 2 — Consistência visual, dark mode e adoção do Design System (17 itens · ~44 pts)

- **Objetivo:** um único modelo de tema (seletor + chave de storage unificados), tokens adotados
  onde hoje não existem, e regressão visual protegendo o que foi unificado.
- **Aplicações:** pacotes do DS (renderers, ui-vue, platform-shell), GymOps (tokens/`.dark` morto),
  BESC (entrar na camada de tokens), ZapBridge, Imobia (sair do `--im-*` órfão), SICAT, NeuroEvolui
  (duplo toggler — UX-A11Y-004).
- **Perfis beneficiados:** todos os usuários que cruzam superfícies (tema persiste — hoje 4 chaves
  de localStorage diferentes); usuários de dark mode; times de produto (drift-gate + regressão
  visual reduzem retrabalho).
- **Dependências:** decisão D5 (estágios de adoção por app — a seção 9 propõe tokens → primitivas →
  shell); Onda 1 concluída nos pacotes (badges corrigidos antes de propagar).
- **Resultado esperado:** 1 convenção de dark mode, 1 chave de tema, matriz de adoção da seção 9
  avançando um estágio por app priorizado, harness H5 (visual-diff) ativo nos pacotes.
- **Critérios de conclusão:** tema escolhido persiste entre Portal↔Console↔Reqhub↔apps migrados;
  `forge-brand.test` no CI; snapshot visual dos 19 componentes ui-vue e da casca.
- **Estimativa:** ~44 pts-PP.
- **Riscos:** adoção de tokens em app com identidade própria (BESC, ZapBridge) não pode uniformizar
  a marca — a fronteira universal×marca da seção 9 é o guarda-corpo; migração do Imobia depende de
  decisão do dono (D7).

### Onda 3 — Jornadas completas por papel e governança de IA (58 itens · 21 P1 · ~128 pts)

- **Objetivo:** fechar as jornadas que hoje morrem no meio e dar superfície aos papéis órfãos;
  completar o ciclo rascunho→confirmação de IA nas UIs; dar olhos à governança de IA.
- **Aplicações:** NeuroEvolui (contratos front↔back UX-NEURO-005/008, papel `patient` — decisão D2),
  ContaViva 360 (dashboards/perfis — D3), ContaViva Pro (recuperação de senha UX-CVPRO-005/006),
  ZapBridge (proposals + controles do auto-reply UX-AI-001/002, UX-ZAP-006), Imobia (editar/excluir
  pela UI UX-IMOBIA-006, papéis inatingíveis), GymOps (push UX-GYMOPS-003, telas admin), BESC
  (jornadas de gestão), AI Control Plane (UX-AICP-001/002/003 — consolidação de leitura no Console,
  decisão D4), QA (harnesses H1–H6 completos, CI dos testes existentes UX-QA-002/003/004).
- **Perfis beneficiados:** pacientes (área própria, se D2 aprovar), contador/auxiliar/PF/PJ do
  ContaViva (se D3 aprovar), corretor/financeiro/vistoriador do Imobia, convidados/auditores do
  BESC, operador de IA da plataforma.
- **Dependências:** decisões D2, D3, D4 e itens com dependência de API registrados no backlog
  (mudanças de contrato/endpoint são pré-requisito técnico, fora do escopo de UX desta auditoria).
- **Resultado esperado:** nenhuma jornada mapeada na seção 4 termina em beco; papéis existentes no
  RBAC têm superfície ou são formalmente descontinuados; IA sempre com confirmação humana visível.
- **Critérios de conclusão:** matriz da seção 4 sem células "quebrada" nos caminhos críticos;
  smoke H1 cobrindo cada papel real; fluxo de confirmação de IA testado nos 5 apps com IA.
- **Estimativa:** ~128 pts-PP (a mais dependente de decisões de produto).
- **Riscos:** escopo de produto pode crescer (área do paciente é um mini-produto); tratar cada
  jornada como epic próprio com corte fino de PRs.

### Onda 4 — Refinamento, performance percebida e experiências avançadas (67 itens · ~106 pts)

- **Objetivo:** polimento sistemático (P2/P3 restantes), performance percebida (code-split, skeleton
  anti-CLS, assets), microcopy e experiências avançadas (atalhos, bulk, preferências).
- **Aplicações:** todas, com concentração em Console, GymOps, NeuroEvolui, ZapBridge e Portal.
- **Perfis beneficiados:** usuários frequentes/power users; usuários em conexões lentas.
- **Dependências:** ondas 0–1 nos apps correspondentes (não polir sobre fluxo quebrado).
- **Resultado esperado:** notas de performance percebida ≥ 3,5 nos apps de produto; P3 zerados nos
  apps maduros.
- **Critérios de conclusão:** Lighthouse ≥ 90 nos públicos; CLS < 0,1 nas listas com skeleton;
  backlog P2/P3 dos apps maduros zerado ou reclassificado.
- **Estimativa:** ~106 pts-PP (contínuo, intercalável com roadmap de features).
- **Riscos:** baixo; principal é custo de oportunidade — não antecipar Onda 4 antes das anteriores.

### Onda 5 (contínua) — Governança e melhoria contínua

Não é uma onda de backlog, e sim o regime permanente proposto: drift-gate ampliado (tokens + shell +
ui-vue + axe + visual-diff), requisitos de UX/a11y obrigatórios em `specs/requirements` para todo
produto novo (hoje 6/381 REQs — UX-DOCS-009), checklist de a11y por tipo de app no golden path,
revisão UX trimestral com re-score do scorecard da seção 5, e a esteira de specs (Forja) refletindo
o estado real (UX-DOCS-010) para que a fonte da verdade não volte a mentir.

### 12.6 Alocação completa dos itens por onda


#### Onda 0 — 25 itens (P0=10 P1=15 P2=0 P3=0) · esforço 54.0 pontos-PP
Superfícies: ContaViva Pro, GymOps, Imobia, RM Ambiental, NeuroEvolui, A11y plataforma, BESC, Docs↔código, Design System, Portal Recorder, Reqhub, ZapBridge, ContaViva 360, Console, SICAT
IDs: UX-CVPRO-001(P0/P) · UX-CVPRO-002(P0/P) · UX-GYMOPS-001(P0/P) · UX-IMOBIA-001(P0/P) · UX-RMAMB-002(P1/PP) · UX-GYMOPS-002(P0/M) · UX-NEURO-001(P0/M) · UX-A11Y-001(P0/G) · UX-BESC-003(P1/P) · UX-DOCS-001(P1/P) · UX-DS-001(P1/P) · UX-IMOBIA-005(P1/P) · UX-PREC-001(P0/P) · UX-REQHUB-002(P1/P) · UX-ZAP-007(P1/P) · UX-CV360-001(P0/G) · UX-DOCS-007(P1/PP) · UX-DOCS-005(P1/M) · UX-BESC-002(P1/P) · UX-CONSOLE-005(P1/P) · UX-CV360-002(P0/GG) · UX-DOCS-003(P1/P) · UX-DOCS-004(P1/P) · UX-IMOBIA-004(P1/G) · UX-SICAT-003(P1/G)

#### Onda 1 — 137 itens (P0=0 P1=41 P2=53 P3=43) · esforço 167.5 pontos-PP
Superfícies: A11y plataforma, ContaViva 360, ContaViva Pro, GymOps, Integração/Navegação, NeuroEvolui, Portal, Console, Imobia, QA/Regressão, SICAT, UX de IA, Ana Rabottini, BESC, Design System, Portal Recorder, Reqhub, RM Ambiental, ZapBridge, Docs↔código
IDs: UX-A11Y-003(P1/P) · UX-CV360-003(P1/PP) · UX-CV360-004(P1/PP) · UX-CV360-006(P1/PP) · UX-CV360-007(P1/PP) · UX-CVPRO-004(P1/PP) · UX-GYMOPS-006(P1/PP) · UX-NAV-002(P1/P) · UX-NEURO-003(P1/PP) · UX-PORTAL-001(P1/PP) · UX-CONSOLE-002(P1/P) · UX-CVPRO-003(P1/P) · UX-GYMOPS-007(P1/P) · UX-IMOBIA-002(P1/P) · UX-IMOBIA-003(P1/P) · UX-IMOBIA-007(P1/P) · UX-NEURO-002(P1/P) · UX-NEURO-007(P1/P) · UX-QA-001(P1/P) · UX-SICAT-001(P1/P) · UX-A11Y-002(P1/M) · UX-NAV-003(P1/M) · UX-A11Y-006(P2/P) · UX-AI-003(P2/P) · UX-AI-009(P2/P) · UX-ANA-001(P1/PP) · UX-ANA-004(P2/PP) · UX-BESC-006(P2/PP) · UX-BESC-007(P2/PP) · UX-BESC-011(P2/PP) · UX-CONSOLE-001(P1/PP) · UX-CONSOLE-004(P1/PP) · UX-CV360-008(P1/PP) · UX-CV360-011(P2/PP) · UX-CVPRO-007(P2/PP) · UX-DS-003(P2/PP) · UX-DS-005(P2/P) · UX-DS-006(P2/P) · UX-GYMOPS-011(P2/PP) · UX-GYMOPS-012(P2/PP) · UX-GYMOPS-013(P2/PP) · UX-GYMOPS-014(P2/PP) · UX-GYMOPS-018(P2/PP) · UX-IMOBIA-008(P2/PP) · UX-IMOBIA-010(P2/PP) · UX-IMOBIA-012(P2/PP) · UX-IMOBIA-015(P2/PP) · UX-NAV-005(P2/PP) · UX-NEURO-013(P2/PP) · UX-PREC-003(P1/PP) · UX-REQHUB-007(P2/PP) · UX-RMAMB-001(P1/PP) · UX-SICAT-009(P2/PP) · UX-ZAP-004(P1/PP) · UX-BESC-001(P1/M) · UX-GYMOPS-004(P1/M) · UX-GYMOPS-005(P1/M) · UX-NEURO-009(P1/M) · UX-REQHUB-001(P1/M) · UX-SICAT-002(P1/M) · UX-AI-010(P3/PP) · UX-AI-011(P3/PP) · UX-DS-011(P3/PP) · UX-NAV-008(P3/PP) · UX-IMOBIA-009(P2/P) · UX-PREC-004(P1/P) · UX-PREC-006(P1/P) · UX-QA-011(P2/P) · UX-ZAP-001(P1/P) · UX-ZAP-002(P1/P) · UX-ZAP-003(P1/P) · UX-ANA-003(P2/PP) · UX-BESC-004(P2/PP) · UX-BESC-005(P2/PP) · UX-BESC-010(P2/PP) · UX-BESC-015(P3/PP) · UX-BESC-017(P3/PP) · UX-CONSOLE-012(P3/PP) · UX-CV360-016(P3/PP) · UX-CVPRO-009(P2/PP) · UX-CVPRO-015(P3/PP) · UX-DOCS-008(P2/PP) · UX-GYMOPS-022(P3/PP) · UX-GYMOPS-023(P3/PP) · UX-GYMOPS-025(P3/PP) · UX-IMOBIA-017(P3/PP) · UX-IMOBIA-018(P3/PP) · UX-IMOBIA-019(P3/PP) · UX-NEURO-014(P2/PP) · UX-NEURO-017(P2/PP) · UX-NEURO-018(P3/PP) · UX-PORTAL-004(P2/PP) · UX-PORTAL-006(P3/PP) · UX-PORTAL-007(P3/PP) · UX-PREC-007(P2/PP) · UX-PREC-009(P2/PP) · UX-PREC-010(P2/PP) · UX-PREC-011(P2/PP) · UX-PREC-012(P2/PP) · UX-PREC-016(P3/PP) · UX-REQHUB-005(P2/PP) · UX-REQHUB-006(P2/PP) · UX-RMAMB-006(P2/PP) · UX-RMAMB-007(P2/PP) · UX-SICAT-005(P2/PP) · UX-SICAT-010(P3/PP) · UX-SICAT-012(P3/PP) · UX-SICAT-013(P3/PP) · UX-ZAP-013(P2/PP) · UX-ZAP-015(P2/PP) · UX-ZAP-018(P2/PP) · UX-ZAP-019(P2/PP) · UX-QA-008(P2/P) · UX-REQHUB-004(P2/P) · UX-ZAP-011(P2/P) · UX-ANA-007(P3/PP) · UX-ANA-010(P3/PP) · UX-BESC-016(P3/PP) · UX-BESC-018(P3/PP) · UX-CONSOLE-011(P3/PP) · UX-CONSOLE-014(P3/PP) · UX-CONSOLE-015(P3/PP) · UX-CONSOLE-018(P3/PP) · UX-CVPRO-014(P3/PP) · UX-DOCS-011(P3/PP) · UX-DOCS-012(P3/PP) · UX-NEURO-020(P3/PP) · UX-PREC-015(P3/PP) · UX-QA-010(P3/PP) · UX-REQHUB-009(P3/PP) · UX-REQHUB-010(P3/PP) · UX-RMAMB-008(P3/PP) · UX-ZAP-021(P3/PP) · UX-ZAP-022(P3/PP) · UX-ZAP-024(P3/PP) · UX-ZAP-025(P3/PP) · UX-NEURO-006(P1/GG)

#### Onda 2 — 17 itens (P0=0 P1=0 P2=11 P3=6) · esforço 44.0 pontos-PP
Superfícies: Design System, A11y plataforma, GymOps, SICAT, UX de IA, ZapBridge
IDs: UX-DS-014(P3/PP) · UX-A11Y-004(P2/M) · UX-A11Y-005(P2/M) · UX-A11Y-007(P2/M) · UX-DS-004(P2/M) · UX-DS-008(P2/M) · UX-DS-013(P3/P) · UX-DS-007(P2/M) · UX-GYMOPS-015(P2/M) · UX-SICAT-008(P2/M) · UX-AI-006(P2/G) · UX-DS-010(P2/G) · UX-DS-012(P3/P) · UX-A11Y-008(P3/M) · UX-DS-009(P2/G) · UX-GYMOPS-024(P3/P) · UX-ZAP-026(P3/G)

#### Onda 3 — 58 itens (P0=0 P1=21 P2=37 P3=0) · esforço 128.0 pontos-PP
Superfícies: NeuroEvolui, ContaViva 360, UX de IA, ContaViva Pro, SICAT, Imobia, QA/Regressão, Integração/Navegação, Ana Rabottini, BESC, Console, GymOps, Portal Recorder, Reqhub, RM Ambiental, ZapBridge, Docs↔código
IDs: UX-NEURO-004(P1/PP) · UX-CV360-005(P1/P) · UX-NEURO-005(P1/P) · UX-AI-001(P1/M) · UX-CVPRO-006(P1/PP) · UX-SICAT-007(P2/PP) · UX-AI-002(P1/M) · UX-CV360-009(P1/M) · UX-IMOBIA-006(P1/M) · UX-QA-003(P1/M) · UX-QA-004(P1/M) · UX-NAV-001(P1/G) · UX-ANA-002(P1/P) · UX-BESC-012(P2/P) · UX-CONSOLE-003(P1/P) · UX-CV360-010(P2/P) · UX-CVPRO-008(P2/P) · UX-GYMOPS-003(P1/P) · UX-NEURO-010(P2/P) · UX-PREC-005(P1/P) · UX-REQHUB-003(P2/P) · UX-REQHUB-008(P2/P) · UX-RMAMB-003(P1/P) · UX-SICAT-004(P2/P) · UX-SICAT-006(P2/P) · UX-ZAP-006(P1/P) · UX-AI-004(P2/M) · UX-AI-005(P2/M) · UX-AI-007(P2/M) · UX-AI-008(P2/M) · UX-AICP-001(P1/G) · UX-ZAP-009(P2/PP) · UX-CV360-012(P2/M) · UX-CVPRO-005(P1/M) · UX-GYMOPS-016(P2/M) · UX-IMOBIA-013(P2/M) · UX-IMOBIA-014(P2/M) · UX-IMOBIA-016(P2/M) · UX-NEURO-008(P1/M) · UX-DOCS-009(P2/G) · UX-CV360-013(P2/P) · UX-CVPRO-010(P2/P) · UX-PREC-008(P2/P) · UX-RMAMB-004(P2/P) · UX-RMAMB-005(P2/P) · UX-ZAP-008(P2/P) · UX-ZAP-010(P2/P) · UX-AICP-002(P2/G) · UX-DOCS-006(P2/G) · UX-DOCS-010(P2/G) · UX-QA-002(P1/G) · UX-QA-006(P2/G) · UX-AICP-003(P2/M) · UX-QA-005(P2/M) · UX-QA-007(P2/M) · UX-QA-009(P2/M) · UX-ZAP-016(P2/M) · UX-ZAP-020(P2/M)

#### Onda 4 — 67 itens (P0=0 P1=0 P2=37 P3=30) · esforço 105.5 pontos-PP
Superfícies: NeuroEvolui, BESC, GymOps, Integração/Navegação, Portal, Console, SICAT, ContaViva 360, ContaViva Pro, Docs↔código, Imobia, Ana Rabottini, Portal Recorder, ZapBridge, Reqhub, RM Ambiental
IDs: UX-NEURO-016(P2/PP) · UX-BESC-009(P2/P) · UX-GYMOPS-008(P2/P) · UX-GYMOPS-017(P2/P) · UX-GYMOPS-019(P2/P) · UX-GYMOPS-020(P2/P) · UX-NAV-007(P2/P) · UX-PORTAL-002(P2/P) · UX-PORTAL-003(P2/P) · UX-NAV-006(P2/M) · UX-CONSOLE-006(P2/PP) · UX-CONSOLE-010(P2/PP) · UX-CONSOLE-013(P3/PP) · UX-NAV-009(P3/PP) · UX-NEURO-015(P2/PP) · UX-NEURO-021(P3/PP) · UX-SICAT-011(P3/PP) · UX-SICAT-014(P3/PP) · UX-CONSOLE-007(P2/M) · UX-CV360-014(P2/M) · UX-CVPRO-011(P2/M) · UX-CVPRO-013(P2/M) · UX-DOCS-002(P2/M) · UX-IMOBIA-011(P2/M) · UX-ANA-005(P2/P) · UX-ANA-006(P2/P) · UX-BESC-008(P2/P) · UX-BESC-014(P2/P) · UX-CONSOLE-008(P2/P) · UX-CONSOLE-009(P2/P) · UX-CONSOLE-016(P3/P) · UX-CONSOLE-017(P3/P) · UX-CV360-015(P2/P) · UX-CV360-020(P3/P) · UX-CVPRO-016(P3/P) · UX-CVPRO-017(P3/P) · UX-DOCS-013(P3/P) · UX-GYMOPS-009(P2/P) · UX-GYMOPS-010(P2/P) · UX-GYMOPS-021(P3/P) · UX-IMOBIA-020(P3/P) · UX-IMOBIA-021(P3/P) · UX-NAV-010(P3/P) · UX-NEURO-011(P2/P) · UX-NEURO-012(P2/P) · UX-PORTAL-005(P2/P) · UX-PREC-002(P2/P) · UX-PREC-014(P3/P) · UX-SICAT-015(P3/P) · UX-ZAP-012(P2/P) · UX-ZAP-014(P2/P) · UX-ZAP-017(P2/P) · UX-CV360-018(P3/PP) · UX-CV360-019(P3/PP) · UX-NEURO-022(P3/PP) · UX-PORTAL-008(P3/PP) · UX-PREC-013(P3/PP) · UX-REQHUB-012(P3/PP) · UX-BESC-013(P2/M) · UX-ANA-008(P3/P) · UX-ANA-009(P3/P) · UX-CV360-017(P3/P) · UX-NAV-004(P2/GG) · UX-NEURO-019(P3/P) · UX-REQHUB-011(P3/P) · UX-RMAMB-009(P3/P) · UX-ZAP-023(P3/P)


---

## 13. Sequência de implementação em PRs pequenos

Regras: 1 app (ou 1 pacote) por PR; pacotes compartilhados ANTES das cópias sincronizadas; nenhum PR
mistura correção de UX com mudança de regra de negócio; todo PR referencia os IDs que cobre e o
método de validação. A sequência abaixo cobre a Onda 0 e o início da Onda 1; os demais itens seguem
o mesmo padrão (lotes por app, guiados pela tabela 10.1).

| PR | Escopo | Itens (IDs) | Arquivos prováveis | Pré-requisito | Validação |
|---|---|---|---|---|---|
| PR-01 | **Harness antes de mexer**: smoke Playwright mínimo por papel (molde GymOps) para CV360, CVPro e NeuroEvolui + axe/teclado básico | UX-QA-001 (parcial), base p/ H1/H2/H3 | `apps/*/frontend/tests/` (novos), CI matrix | — | os smokes falham HOJE nos P0 (prova do valor) |
| PR-02 | ContaViva Pro: autoridade real na API de records — **NÃO via ForwardAuth de borda** (o app tem JWT próprio; edge-auth Keycloak quebraria o login). Correção = aplicar o `requireAuth` existente + derivar tenant do JWT. **Bloqueado por D9**: colide com teste LOCKED gerado pela Forge → exige mudar o bloco de capability + regenerar | UX-CVPRO-001 | `apps/contaviva-pro/api/src/server.js` + bloco da Forge + `tests/locked/**` (regenerado) | **D9** | curl anônimo à API → 401; teste locked regenerado verde |
| PR-03 | ContaViva Pro: corrigir edição (UI deixa de chamar PUT inexistente; usa contrato real) + interceptador 401→refresh→login | UX-CVPRO-002, UX-CVPRO-003, UX-CVPRO-004 | `frontend/src/views/records/*`, `frontend/src/api.js` | PR-02; se o contrato exigir novo endpoint, registrar dependência de API | editar registro ponta-a-ponta; sessão expirada → login |
| PR-04 | ContaViva 360: guard de login + tela de entrada (SSO de borda ou login local — decisão D1) | UX-CV360-001, UX-CV360-003 | `frontend/src/router.js`, `k8s/*.yaml` | D1 | anônimo → login; papéis certos por perfil |
| PR-05 | NeuroEvolui: idem D1 + remover 18 navegações mortas | UX-NEURO-001, UX-NEURO-002, UX-NEURO-003 | `frontend/src/router.js`, views com links mortos | D1 | anônimo → login; zero 404 internos (H1) |
| PR-06 | GymOps: callback SSO resolve organização/papel (ou explica e oferece saída) | UX-GYMOPS-001 | `apps/web/src/app/(auth)/auth/callback/`, `store/auth.ts` | pode depender de API `/auth/consume` (registrar) | login Google → dashboard populado (smoke owner) |
| PR-07 | GymOps: atividade acessível por teclado (card e linha viram elementos focáveis com Enter/Espaço) | UX-GYMOPS-002 (parte do UX-A11Y-001) | `components/activity-card.tsx`, `app/(app)/activities/page.tsx` | — | H2: abrir atividade só com teclado |
| PR-08 | ui-vue: primitiva de linha/card interativo acessível como padrão do kit + re-sync nos 3 apps | UX-A11Y-001 (kit), UX-CV360-008 | `packages/ui-vue/src/*`, cópias `frontend/src/ui/` | — | H2 nos 3 apps da Forja |
| PR-09 | Imobia: detalhe por teclado nos 5 módulos + Modal com role/focus-trap/Esc | UX-IMOBIA-001 | `frontend/src/components/Modal.vue`, views de módulo | — | H2: fluxo imóvel/lead só com teclado |
| PR-10 | Portal Recorder: desfazer o keyboard trap do canvas (Esc sai; hint explica) | UX-PREC-001 | `frontend/src/CaptureView.jsx` | — | H2: Tab/Esc saem do canvas |
| PR-11 | ZapBridge: `devops.yaml`/CLAUDE.md/README apontam `web/` (contrato da esteira publica o app certo) | UX-ZAP-007 | `apps/zapbridge/devops.yaml`, meta-docs | — | build do contrato gera imagem do `web/` |
| PR-12 | specs: baseline diz a verdade (contaviva-pro/besc registrados; status real; CLAUDE.md do imobia sem "ui-vue") | UX-DOCS-001/003/004/005/007, UX-RMAMB-002 | `specs/baseline/*.json` (via `/sync-spec`), meta-docs dos apps | — | `/baseline-diff` limpo; grep "ui-vue" no imobia zero |
| PR-13 | design-tokens: consertar contraste nos 2 renderers de badge (platform + forge-brand) + `forge-brand.test` no gate | UX-A11Y-003, UX-PORTAL-001, quick win de CI (UX-QA) | `packages/design-tokens/renderers/*.mjs`, `.github/workflows/design-tokens-gate.yml` | — | teste de contraste no CI; medição ≥ 4,5:1 (repetir o método vivo da §2) |
| PR-14 | platform-shell: sonda com `redirect:'manual'` (fim do "fora" falso) + a11y do launcher (setas/`aria-haspopup`/Esc devolve foco) | UX-NAV-002, achado do launcher (§8) | `packages/platform-shell/shell.js` + redistribuição codegen | — | Console/Reqhub "no ar" no launcher; H2 no menu |
| PR-15 | SICAT: ações do admin em `/admin/acessos` (grant/revoke/reset já existem no backend) | UX-SICAT-003 | `frontend/src/services/api.js`, `views/AccessAdminView.vue` | contrato já existe (5 GETs → CRUD) | Playwright: conceder e revogar perfil |
| PR-16 | RM Ambiental: labels do formulário + remover nota interna "substituir pelos dados oficiais" da produção + skip-link | UX-RMAMB-001, UX-RMAMB-003 (parcial), quick wins | `src/components/ContactSection.tsx`, `content.default.ts` | dados oficiais com o dono (P-RMAMB) | axe no /contato; texto interno ausente ao vivo |

Depois de PR-16, a Onda 1 segue em **lotes por app** (1 PR = todos os quick wins PP de um app, na
ordem da tabela 10.1), e as ondas 2–4 seguem os agrupamentos da seção 12. PRs de pacote
(`design-tokens`, `ui-vue`, `platform-shell`) sempre incluem a redistribuição/re-sync no mesmo PR
para não abrir drift.


---

## 14. Dependências, riscos e decisões necessárias

### 14.1 Decisões que bloqueiam itens do plano (responsável: dono da plataforma/produto)

| # | Decisão | Bloqueia | Opções (com recomendação) |
|---|---|---|---|
| D1 | **Estratégia de autenticação dos apps da Forja** (CV360, NeuroEvolui): SSO na borda (oauth2-proxy, como Console) ou login próprio (como ContaViva Pro)? | UX-CV360-001, UX-NEURO-001 (P0s da Onda 0) | Recomendado: SSO na borda agora (mudança só de manifesto, sem código) + sessão própria depois se o produto exigir multi-tenant real |
| D2 | **Papel `patient` do NeuroEvolui**: construir a área do paciente (mini-produto) ou remover o papel do RBAC até lá? | UX-NEURO-004 e épico da Onda 3 | Recomendado: remover da UI/seed e registrar como DOCUMENTADO/PLANEJADO — papel sem superfície é dívida de segurança percebida |
| D3 | **Perfis do ContaViva 360**: a visão prevê 7 perfis; o código tem 3 e dashboards órfãos. Reduzir a visão ou construir os perfis? | UX-CV360-002 (P0/GG), UX-CV360-005/009 | Recomendado: curto prazo esconder dashboards órfãos (P); médio prazo decidir a visão no reqhub e re-gerar |
| D4 | **Onde vive a governança de IA**: consolidar leitura do AI Control Plane no Console (aba nova) ou manter fragmentada (SICAT + Reqhub + Grafana)? | UX-AICP-001/002/003 (Onda 3) | Recomendado: aba read-only no Console (ele já é o painel do operador e tem o padrão de estados mais maduro) |
| D5 | **Sequência de adoção do Design System** por app fora do sistema (GymOps, BESC, ZapBridge, Imobia) | Onda 2 | Recomendado: estágio 1 (tokens semânticos) para todos; primitivas/shell só onde não houver conflito de identidade — ver §9 |
| D6 | **Domínio de login**: manter o SSO ancorado em `dev.nvit.com.br` (usuário de `nvit.localhost` migra de domínio e não retorna) ou parametrizar por host de origem? | UX-NAV-003 | Recomendado: parametrizar redirect/cookie por host (configuração do oauth2-proxy/Keycloak, sem tocar produto) |
| D7 | **Imobia e o kit ui-vue**: adotar de fato (como o CLAUDE.md promete) ou assumir o DS próprio `--im-*` e documentar? | UX-DOCS-007, UX-IMOBIA (Onda 2) | Recomendado: decidir junto com D5; o que não pode permanecer é a documentação mentindo |
| D8 | **PWA do ZapBridge**: o kill-switch aposentou o PWA; o produto quer reintroduzir instalação/offline no `web/` ou aposentar de vez (e atualizar docs/portal que ainda anunciam "PWA")? | UX-ZAP (Onda 3/4), card do Portal | Recomendado: aposentar formalmente agora (docs), reavaliar PWA quando houver testes |

### 14.1.1 Decisões tomadas (2026-07-21, operador via Claude — revisáveis)

Aplicando as recomendações da tabela acima para destravar a Onda 0:

- **D1 = SSO na borda** para ContaViva 360 e NeuroEvolui (middleware ForwardAuth nos manifests,
  padrão já usado por Console/Reqhub; sem código de produto). Sessão própria fica para quando o
  produto exigir multi-tenant real.
- **D2 = área do paciente adiada e documentada** como DOCUMENTADO/PLANEJADO (épico da Onda 3).
  O RBAC não é alterado agora; a UI não deve sugerir área de paciente inexistente.
- **D3 = curto prazo**: dashboards órfãos do ContaViva 360 saem da superfície navegável; a decisão
  de visão (7 perfis) segue aberta com o dono do produto no reqhub.
- **D4 = consolidar leitura da governança de IA no Console** (Onda 3, escopo a detalhar).
- **D5 = adoção do DS em estágios**, começando por tokens (Onda 2), sem uniformizar marcas.
- **D6 = parametrizar o redirect de login por host** — adiado para PR próprio de infra (mexe em
  oauth2-proxy/Keycloak vivos; requer janela de validação).
- **D7 = Imobia assume o DS próprio `--im-*` documentado** — o CLAUDE.md deixa de declarar ui-vue;
  migração ao kit reavaliada na Onda 2.
- **D8 = PWA do ZapBridge formalmente aposentado** — docs/contrato apontam o `web/`; reintrodução
  de PWA só com suíte de testes.

### 14.1.2 Decisões descobertas na execução da Onda 0 (bloqueios que viram decisão)

A implementação dos primeiros PRs revelou três bloqueios estruturais que exigem decisão do dono
antes de prosseguir nos itens correspondentes — nenhum foi contornado com gambiarra:

- **D9 — Exposição de dados nos apps gerados pela Forge (UX-CVPRO-001, e por extensão CV360).**
  A API de `records` do ContaViva Pro (`apps/contaviva-pro/api/src/server.js:25-28`) não aplica o
  `requireAuth` que o próprio app já possui e deriva o tenant de um header spoofável
  (`x-tenant-id`, linha 20). **Porém** o comportamento anônimo está codificado num **teste LOCKED**
  gerado pela Forge (`tests/locked/capability/redis-bullmq.test.mjs:7` chama `POST /v1/records` sem
  token e espera sucesso, protegido por hash em `tests/.test-locks.json`) e o manifesto k8s é
  **compilado** de `devops.yaml` (sem primitiva de auth de borda). Corrigir de forma durável exige
  mudar o **bloco de capability do gerador** (records passam a exigir auth) + **regenerar** os testes
  locked + aplicar o guard — mudança de PLATAFORMA que afeta todos os apps com o bloco, não uma
  edição de app. **Recomendação:** tratar como item de fundação da Forge (estender o bloco +
  `make-test-suite.mjs`), fora da Onda 0 automática. Até lá o P0 permanece aberto e registrado.
- **D10 — Edição de registros no ContaViva Pro (UX-CVPRO-002).** O frontend chama `PUT /v1/records/:id`
  que **não existe** no backend (só há `GET`/`POST`/`submit`). Não é troca de verbo — exige **criar
  o endpoint de update** (decisão de contrato de API). Até lá, a jornada de edição fica quebrada por
  design; alternativa de UX mínima (esconder o botão "Editar") reduz função e não foi aplicada.
- **D11 — Callback SSO do GymOps (UX-GYMOPS-001).** Nenhum endpoint atual resolve
  organização/papel só a partir do token (`/auth/consume` e `/auth/me` devolvem apenas
  usuário/token; os demais exigem `organizationId` na entrada). A lógica de resolução existe, mas só
  dentro do `POST /auth/login`. Corrigir exige **mudar o backend** (expor org/papel no consume/me ou
  criar `/auth/context`). Decisão de contrato de API.

Itens confirmados como implementáveis sem esses bloqueios (executados nos lotes 1–2): UX-CVPRO-003
(renovar sessão no 401 — `/auth/refresh` já existe), UX-SICAT-003 (backend de admin já roteado),
UX-NEURO-002/003 (reapontar links para rotas existentes), UX-GYMOPS-002 (a11y de teclado).

### 14.2 Dependências técnicas e de produto registradas no backlog

- **Mudanças de API/contrato** (fora do escopo desta auditoria, pré-requisito de itens de UX):
  endpoint de edição do ContaViva Pro (UX-CVPRO-002), resolução de organização no `/auth/consume` do
  GymOps (UX-GYMOPS-001), contagem por status no backend do SICAT (UX-SICAT-002), filtros de servidor
  da agenda do NeuroEvolui (UX-NEURO-009), reset de senha administrativo no ContaViva Pro
  (UX-CVPRO-005/006). Cada item correspondente do backlog carrega a dependência no campo próprio.
- **Ordem topológica de pacotes:** correções em `design-tokens`/`ui-vue`/`platform-shell` precedem
  os re-syncs nos consumidores (PR-08/13/14 antes dos lotes de app correspondentes).
- **Specs como fonte da verdade:** PR-12 (baseline verdadeira) precede qualquer automação nova da
  esteira que consuma `products.json`/`implementation-status.json` (UX-DOCS-010).

### 14.3 Riscos do plano

| Risco | Prob. | Impacto | Mitigação |
|---|---|---|---|
| Corrigir auth/estados sem rede de testes → regressão silenciosa | alta | alto | PR-01 primeiro (harness H1–H3 mínimos); nenhum PR de Onda 0 sem smoke do app no CI |
| Re-sync do ui-vue abre drift entre os 3 apps consumidores | média | médio | re-sync no MESMO PR do pacote + drift-gate já existente |
| Decisões D1–D3 atrasarem e travarem a Onda 0 | média | alto | os P0 sem dependência de decisão seguem já (GYMOPS-002/teclado, PREC-001/trap, CV360-001+NEURO-001/auth-borda). Ressalva descoberta na execução (§14.1.2): CVPRO-001 depende de D9, CVPRO-002 de D10, GYMOPS-001 de D11 — reclassificados de "livres" para "bloqueados por decisão" |
| Volume da Onda 1 (137 itens) virar ruído de revisão | média | médio | lotes por app; 1 PR = 1 app; validação automatizada por harness, não por olho |
| Onda 3 crescer escopo (área do paciente, perfis CV360) | alta | médio | tratar como epics de produto com PRD próprio; esta auditoria só reserva o slot |
| Divergência docs↔código voltar a crescer após PR-12 | alta | médio | Onda 5: gate de drift documental (checagem `products.json` × `apps/` no CI de specs) |
| Métricas ausentes impedirem medir sucesso (nenhum analytics hoje) | alta | baixo | §15 começa com métricas coletáveis por CI/testes; analytics de produto é decisão futura |


---

## 15. Métricas de sucesso

Princípio: começar pelas métricas **coletáveis hoje por CI/testes** (sem depender de analytics que a
plataforma não tem), e evoluir para métricas de comportamento quando houver instrumentação.

### 15.1 Métricas de plataforma (coleta automática, por release)

| Métrica | Baseline (esta auditoria) | Alvo Onda 1 | Alvo Onda 3 | Coleta |
|---|---|---|---|---|
| Achados P0 abertos | 10 | 0 | 0 | re-score do backlog |
| Achados P1 abertos | 77 | ≤ 40 | ≤ 10 | re-score do backlog |
| Violações axe (fluxos principais, 6 apps maduros) | não medido (0 tooling) | medido + sem "critical" | 0 "serious"+ | harness H3 no CI |
| Jornadas críticas operáveis só por teclado | reprovado em 5+ produtos | 100% nos 6 maduros | 100% geral | harness H2 |
| Superfícies com frontend cobertas por smoke por papel | 2/14 | 8/14 | 14/14 | harness H1 na matriz de CI |
| Superfícies fora de qualquer CI | 4 | 0 | 0 | workflows |
| Contraste dos badges/status (tema claro) | 2,80–4,03:1 (reprovado) | ≥ 4,5:1 | ≥ 4,5:1 | forge-brand.test no gate |
| Convenções de dark mode / chaves de tema | 3 / 4 | — | 1 / 1 | grep + visual-diff H5 |
| Apps no estágio ≥1 de adoção do DS (tokens) | 8/14 | 8/14 | 12/14 | matriz da §9 |
| Divergências docs↔código P1 (baseline/meta-docs) | 5 | 0 | 0 | gate de drift documental |
| Cobertura de requisitos de UX/a11y na base de specs | 6/381 REQs (1,6%) | template exige p/ novos | +NFR de a11y por produto ativo | specs/CI |

### 15.2 Métricas por produto (quando a jornada existir)

- **Taxa de conclusão e tempo da jornada crítica** (via Playwright cronometrado no CI — proxy até
  existir analytics): SICAT emitir MTR; GymOps concluir atividade; BESC investir (demo); ZapBridge
  conectar + responder; ContaViva lançar registro; NeuroEvolui agendar consulta.
- **Sucesso no primeiro acesso**: smoke "usuário novo" por app (login→primeira ação sem ajuda);
  GymOps convite→setup; BESC cadastro→aprovação→primeiro acesso liberado.
- **Taxa de erro/beco**: 0 telas terminais sem CTA (verificação H6 de sessão/erro); 0 rotas mortas
  (crawler de links interno no CI — o caso NeuroEvolui).
- **Core Web Vitals/Lighthouse** nos públicos (Portal, RM Ambiental, Ana Rabottini, BESC público):
  Performance ≥ 90, A11y = 100 (o Portal já registrou 100 — recuperar e manter), CLS < 0,1.
- **Adoção de recursos de IA**: % de sugestões de IA confirmadas vs descartadas (os backends já
  registram; expor no painel de governança quando D4 sair).
- **SUS ou pesquisa equivalente**: aplicar apenas quando houver usuários externos reais (BESC
  investidores, SICAT operadores); até lá, heurística re-score trimestral (seção 5) como proxy.

### 15.3 Guarda de regressão

Toda correção do backlog referencia seu `metodo_validacao` (axe · playwright · teste-manual-teclado ·
inspeção-visual · unit-test · contrato-api). O critério de "pronto" de qualquer PR das ondas é: o
método de validação do item roda no CI (ou está documentado como manual com passo-a-passo) e o item
correspondente é marcado no backlog — sem isso o item não conta para as métricas de 15.1.


---

## 16. Estratégia de QA e regressão


### 16.1 O retrato: cobertura existente, mas mal apontada

A auditoria transversal de QA (auditor B4, commit `a6c95ef`) encontrou dois mundos que não se falam. De um lado, uma esteira real (gymops com E2E Playwright completo em PR, portal com testes estáticos, gates de drift do DS). Do outro, **12 das 14 superfícies com frontend não têm um único arquivo de teste de UI — 7 delas com escrita** (console, besc, zapbridge, imobia, neuroevolui, contaviva-360, contaviva-pro), justamente as que concentram os 6 P0 da auditoria. Pior:

- **4 superfícies fora de qualquer workflow de CI** — console, imobia, besc/frontend e zapbridge/web: commit chega à main sem nem `npm run build` (UX-QA-001, P1; `ci-apps.yml:63-75` + path-filter `apps/**` que nunca dispara para `console/`).
- **O sicat mantém 73 testes que nenhum gate roda** (UX-QA-002, P1): 18 specs Playwright + 55 node:test de backend; o `ci-apps.yml:65` declara só `"lint build:frontend"` e o `test-services.yml` é `workflow_dispatch`-only. O app fiscal da plataforma publica toda mudança sem executar um teste sequer.
- **Zero axe/Lighthouse em toda a plataforma** (UX-QA-005, P2 — rebaixado de P1 na verificação por ser lacuna de processo com decisão documentada de axe manual): grep exaustivo em package.json e workflows, 0 hits. 10 dos 16 auditores declararam contraste como não-verificável; a rubrica limita a11y a nota ≤4 sem auditoria registrada — teto que a plataforma inteira ocupa por construção.

**O caso NeuroEvolui é a prova do custo.** É o app mais testado da frota (76 arquivos, gate LIVE com Postgres+Redis reais e `validate:openapi`) e ainda assim publicou: 6 rotas mortas navegadas por telas vivas (UX-NEURO-002 — `router.js` não declara `/jobs`, `/transactions`, `/revenue`, `/dashboard`, enquanto `DashboardView.vue:88/:112/:260` e `AsyncJobListView.vue:72` navegam para elas), botão de confirmação que lança exceção (UX-NEURO-003) e "Confirmar e aplicar" de IA que não persiste nada (UX-NEURO-008). Motivo: 100% dos testes exercitam a API e o único gate de frontend é `vite build` (`forge-tests.yml:82`) — que não resolve rotas de runtime (UX-QA-003, P1). Em miniatura: o bloco locked `oidc-sessao` tem 8 linhas e uma única asserção (`/health` responde 200) — é o "teste de sessão" dos apps que saíram sem guard de login (UX-QA-011, P2; ressalva da verificação: o bloco existe em 2 apps, neuroevolui e contaviva-360). Moral: **contagem de testes não é proxy de proteção de UX** — protege quem renderiza a tela, percorre a navegação e compara o que o front chama com o que o back serve. Hoje, só o gymops faz isso em gate de PR.

Lacunas complementares confirmadas: contrato front↔back sem verificador em nenhuma esteira (UX-QA-004, P1 — `validate:openapi` compara API↔spec e falta em contaviva-pro/360; fatura: UX-CVPRO-002 com `PUT /v1/records/:id` inexistente, UX-NEURO-004/005/014, UX-GYMOPS-001/006); smoke por papel só no gymops (UX-QA-006, P2); 3 asserts de Tab em toda a frota, todos na home pública do sicat (UX-QA-007, P2); smoke de publicação é só HTTP-status — SPA quebrada publica "verde" (UX-QA-008, P2; `publish-app.ps1:53-57`); zero testes simulando 401/expiração para os achados de sessão de 8 superfícies (UX-QA-009, P2); E2E do gymops só em Desktop Chrome, contra a regra de 375px do próprio CLAUDE.md (UX-QA-010, P3).

### 16.2 Pirâmide mínima por tipo de app

Princípio: gate proporcional ao risco de escrita, harness compartilhado, zero invenção nova — todos os moldes já existem no repo.

| Tipo | Superfícies | Pirâmide mínima |
|---|---|---|
| Site estático | rmambiental, anarabottini, portal | node:test estático padrão-portal (markup/SEO/CSP/tokens/44px; molde `portal/frontend/test/static-assets.test.mjs:146-156`) + axe smoke em 2 páginas |
| SPA operacional (Forja + adotados) | neuroevolui, contaviva-360/pro, imobia, zapbridge/web, besc/frontend | locked API (mantém) + rota-smoke H1 + contrato H4 + axe H3 + teste estático DS/guard (molde `neuroevolui/tests/design-system-static.test.mjs`) |
| Full-stack maduro | sicat, gymops | suíte própria promovida a PR (gymops OK; sicat = UX-QA-002) + smoke por papel + H2 teclado + H3 axe + project mobile 375px (UX-QA-010) |
| Ferramenta de operador | console, portal-recorder, reqhub | node:test de funções puras (reqhub OK) + H1 com 2 papéis (member/admin) + H6 sessão |
| DS/casca | packages/* | drift-gate (OK) + `forge-brand.test` no CI (UX-DS-003) + galeria renderizada com axe + screenshot-diff H5 (UX-DS-009) |

Golden path declarado: o padrão gymops (`ci-gymops-e2e` + `e2e/smoke/<papel>.smoke.spec.ts` com fixtures `PROFILES` para 6 papéis) é o modelo canônico — promover em `docs/standards/golden-path.md`.

### 16.3 Seis harnesses reutilizáveis (a espinha das ondas 0–4)

| # | Harness | O que faz | Serve às ondas | Esforço |
|---|---|---|---|---|
| H1 | Rota-smoke por papel (molde gymops) | Para cada rota estática do router + papel: `goto` → assert heading/≠NotFound → zero erros de console | Onda 0 (guards e rotas mortas: NEURO-001/002, CV360-001/010, GYMOPS-003) | M o template + P por app |
| H2 | Teclado/foco | Tab-walk (ordem/foco visível), Enter+Espaço em role=button, Esc fecha overlay e devolve foco | Onda 1 (GYMOPS-002/004, IMOBIA-001/002, CONSOLE-001/002/004, ZAP-001/014, SICAT-012/015) | M |
| H3 | axe automatizado | `@axe-core/playwright` injetado nas páginas do H1 + galeria ui-vue; começa `warning`, promove a required | Onda 3 (PORTAL-001, DS-002/006, ANA-004, PREC-006, ZAP-015) | P (sobre H1) |
| H4 | Contrato front↔spec | Scanner estático: chamadas do api-client × openapi/route-table; roda sem servidor | Onda 4 (CVPRO-002, NEURO-004/005/014, GYMOPS-001/006) | M–G |
| H5 | Visual-diff do DS | Galeria estática ui-vue + casca + tokens light/dark com `toHaveScreenshot` | Onda 3 (DS-009/011, drift dark DS-004) — só no DS, não em apps | M |
| H6 | Sessão/erro por interceptação | `page.route` devolvendo 401/500: assert de redirect-com-aviso e estado de erro com retry | Onda 2 (GYMOPS-007/013, CVPRO-003/004, IMOBIA-003/007, ZAP-002/003, NEURO-007/017, CONSOLE-007/010) | M |

### 16.4 Quick wins de CI (em ordem de custo)

1. **1 linha**: `node --test packages/design-tokens/forge-brand.test.mjs` no `design-tokens-gate` — fecha UX-DS-003; o teste garante contraste AA por construção das 10+ marcas.
2. **4 entradas de matriz + 1 workflow**: imobia, besc/frontend, zapbridge/web no `ci-apps` + `ci-console` para `console/**` — fecha UX-QA-001.
3. **Job axe (H3)** em modo warning, começando por portal + galeria ui-vue — fecha metade de UX-QA-005.
4. **Smoke de publicação melhorado** (`publish-app.ps1`): validar `<title>`/marcador no HTML e, fase 2, `page.goto` headless com root visível + zero erros de console — mitiga UX-QA-008 reaproveitando o H1.
5. **`ci-sicat-e2e`** espelhando o `ci-gymops-e2e` (Postgres service + `CETESB_GATEWAY_MODE=mock` + Playwright) — fecha UX-QA-002; dependência: modo mock estável do gateway.
6. **Rota-smoke H1 no `forge-tests`** como etapa pós-build do frontend — fecha UX-QA-003 para os 3 apps locked e todo app futuro da Forja.

### 16.5 Validação do backlog sem regressão: mapa `metodo_validacao` → harness

Regra de aceitação das ondas: **nenhum item do backlog fecha sem apontar qual harness o valida.** O campo `metodo_validacao` dos 304 achados finais mapeia assim:

| `metodo_validacao` (nº de achados) | Como validar |
|---|---|
| `inspecao-visual` (100) | Revisão manual guiada por checklist; onde tocar DS/tokens, travar com H5 (visual-diff) e H3 (axe) para não regredir |
| `teste-manual-teclado` (84) | Validação manual inicial + assert permanente no H2 (Tab-walk/ativação/Esc) — sem H2, cada fix de teclado pode regredir no PR seguinte (UX-QA-007) |
| `playwright` (54) | H1 (rotas/guards/jornadas), H6 (sessão/erro por interceptação) e suítes E2E por papel (padrão gymops) |
| `axe` (30) | H3 — job `@axe-core/playwright` sobre as páginas do H1 |
| `unit-test` (20) | node:test/vitest no pacote do app — promovidos a gate de PR (UX-QA-002 no sicat; bloco `oidc-sessao` honesto do UX-QA-011) |
| `contrato-api` (16) | H4 — scanner front↔spec no `forge-tests`/`ci-apps` + `validate:openapi` adicionado onde falta (contaviva-pro/360) |


---

## 17. O que não foi possível verificar

Nada nesta lista virou achado nem nota — itens não confirmáveis foram excluídos da pontuação, por
regra do método (seção 2).

### 17.1 Limites do spot-check ao vivo (2026-07-21)

- **DevOps Console, Reqhub e Portal Recorder**: atrás de SSO (oauth2-proxy → Keycloak). Regra dura da
  auditoria: nenhuma credencial inserida, nenhum login efetuado — verificação viva não realizada
  (evidência dessas superfícies é 100% de repositório). O redirect de login em si foi observado
  (`/devops` → `https://dev.nvit.com.br`, página "Sign in to NovaIT").
- **Grafana, Argo CD e Keycloak logados**: mesmos motivos; apenas o handoff/acesso foi avaliado.
- **SICAT, GymOps, ZapBridge, Imobia, ContaViva Pro e Ana Rabottini**: fora do time-box da fase viva
  (alvos escolhidos por valor de confirmação de P0/P1); análise 100% ancorada no repositório.
- Screenshot desktop do Portal falhou por timeout do painel de browser (a árvore de acessibilidade e
  as medições via `getComputedStyle` foram capturadas normalmente).

### 17.2 Itens não verificáveis por análise estática (declarados pelos auditores)

Comportamentos de runtime que exigiriam execução autenticada, dados reais ou infraestrutura viva —
cada um com o motivo registrado:



**Portal**
- Números atuais de axe/Lighthouse no runtime (Accessibility 100 registrado em 2026-06-13) — _motivo: auditoria estática nesta sessão; contrastes calculados matematicamente dos tokens, sem execução de browser_
- Formato da resposta de /devops/api/me consumida pela casca (identidade/rótulo de papel) — _motivo: só confirmei que a rota existe e é isenta do gate (console/backend/src/index.js:1029, via grep); payload não conferido_
- Comportamento real em 320px/teclado virtual e o fluxo OIDC completo /oauth2/start→retorno — _motivo: rota existe no manifest (console/k8s/auth/auth-routes.yaml:22), mas runtime não exercitado nesta sessão_

**DevOps Console**
- Interação real do modo Visual dentro do iframe (protocolo cmsEdit: hover, foco, teclado na prévia) — _motivo: O código do lado do portal/site-renderer vive fora das raízes auditadas; só o lado Console (postMessage) foi lido._
- Comportamento em runtime da casca <platform-shell> (menu do usuário, logout, toggle de tema) — _motivo: Arquivo sincronizado de packages/platform-shell lido parcialmente (funções puras); componente não executado nesta auditoria._
- Fluxo completo de login/302 do oauth2-proxy (Keycloak) e retorno à página atual — _motivo: Inferido dos manifests k8s/auth; sem execução contra o cluster._
- Contrastes efetivos em todas as combinações de tema (light/dark) medidos por ferramenta — _motivo: Baseado nos valores dos tokens e nos comentários de cálculo do CSS; sem medição axe/Lighthouse nesta sessão._

**SICAT**
- Contraste efetivo dos pares de tokens (ex.: --color-text-muted #5c6e76 sobre #f5f7f8) nos temas light/dark — _motivo: Exige medição com ferramenta (axe/contrast checker); análise estática não conclui razão de contraste_
- Overflow horizontal da v-table crua de ManifestsView (7 colunas) em 390px — _motivo: Depende do wrapper interno .v-table__wrapper do Vuetify em runtime; não executado_
- Focus trap dos modais v-dialog (cancelar/receber/replicar) — _motivo: Comportamento do Vuetify presumido; não executado_
- Ativação por teclado dos chips de situação/período (v-chip com @click) — _motivo: Depende de o Vuetify emitir tabindex/keydown no chip; não verificado no código do framework_
- Fato prévio 'Playwright 18 specs' — _motivo: Contei 16 arquivos .spec + 6 scripts .mjs em tests/ui (22 arquivos) — divergência pequena do levantamento; sem axe confirmado_

**GymOps**
- Comportamento do manifest sob basePath /gymops em runtime (metadata.manifest '/manifest.json' com NEXT_PUBLIC_APP_BASE_PATH) — _motivo: depende do build/deploy; não executado nesta sessão — o achado 016 limita-se ao conteúdo do manifest_
- GET /integrations permitir leitura a qualquer membro (divergindo da rbac-matrix que nega abaixo de org_manager) — _motivo: vi via grep apenas trechos do guard (member vs isAdmin); não abri o arquivo completo para confirmar qual handler cobre o GET usado pela tela_
- Comportamento real em 320/375px (overflow, teclado virtual) — _motivo: análise estática das classes Tailwind; sem execução em viewport_
- Profundidade do wizard de import Trello (/settings/import) e das telas units/areas/templates/recurrences/imports — _motivo: lidas parcialmente (grep de estados/gates); inventariadas mas não auditadas linha a linha_
- Execução de axe/Lighthouse — _motivo: nenhum registro no repo (grep axe em e2e/ e package.json vazio) e não executado nesta auditoria estática_
- Persistência do estado do AiChatWidget entre navegações e limite de histórico (slice -10) — _motivo: comportamento de runtime do App Router não exercitado_

**RM Ambiental**
- Contraste efetivo dos pares de cor dos tokens (muted sobre bg, nota /70 dos stats, text-gradient) — _motivo: exigiria cálculo de razão de contraste/axe em runtime; não executado nesta sessão_
- Conteúdo live do CMS (endpoint /devops/api/cms/public/rmambiental) pode divergir do fallback auditado — _motivo: auditoria estática do repo; árvore live não consultada_
- Comportamento real do menu mobile e do lightbox em viewport 375px — _motivo: análise estática de classes Tailwind; sem execução em navegador_

**BESC**
- Contraste exato dos pares de cor dos tokens (badges/banners) em ferramenta — _motivo: análise estática sugere conformidade AA, mas nenhuma medição axe/Lighthouse foi executada nesta sessão_
- Filtragem server-side de GET /titles para escopo linked (advogado veria só os concedidos na tela de gestão?) — _motivo: handler do marketplace não foi lido; comportamento runtime não executado_
- Presença de legendas embutidas nos 4 vídeos da biblioteca — _motivo: binários vivem só no PVC do cluster; não inspecionáveis pelo repo_
- Renderização do PDF inline (iframe) em navegadores mobile — _motivo: requer teste em dispositivo; não executado_

**ZapBridge**
- Comportamento real de 401 em runtime (redirect, mensagens) — _motivo: análise estática; nenhuma execucao contra o backend nesta sessao_
- Contraste exato white/50 sobre #005c4b (3,2:1) — _motivo: calculo estático de composicao alfa; não medido com ferramenta em tela renderizada_
- Comportamento das ações hover em navegadores touch reais — _motivo: emulacao de hover varia por navegador; não testado em dispositivo_
- Qual imagem zapbridge-web:local esta de fato rodando no cluster (web/ ou app/) — _motivo: auditoria read-only do repo; estado do cluster não inspecionado_
- Zoom automático do iOS Safari no textarea text-[15px] — _motivo: comportamento de dispositivo; não verificavel estaticamente_

**Reqhub**
- Comportamento de sessão SSO expirada no meio do uso (fetch sob redirect 302 do oauth2-proxy nas rotas /reqs/api) — _motivo: exige execução/runtime; o código não trata o caso explicitamente e não rodei o app_
- Contraste efetivo (WCAG 1.4.3/1.4.11) dos tokens --p-* nos badges b-high/b-low — _motivo: valores numéricos dos tokens não medidos nesta sessão (análise estática apenas)_
- Reforço server-side do gating admin em /v1/ai-usage/* e da denylist do /v1/forge/delete — _motivo: não abri o código do reqhub-api (fora das raízes da superfície); o frontend afirma que o backend reforça_
- Hipótese do levantamento: '18 testes de funções puras' — _motivo: divergente — contagem observada ≈66 test() em test/lib.test.mjs + ≈66 em forge-lib.test.mjs (raiz) + 5 em test/forge-lib.test.mjs_

**Portal Recorder**
- Fato do levantamento: '5 testes puros de API' — _motivo: Encontrei 4 arquivos de teste em api/test + 1 redaction.test.js no recorder; não executei node --test para contar casos individuais. Nenhum teste de frontend/a11y/E2E existe._
- Comportamento 302/401 do oauth2-proxy em runtime (sessão anônima/expirada) — _motivo: Presumido dos manifests e comentários do ingressroute.yaml; não exercitei o cluster (auditoria read-only)._
- Razões de contraste renderizadas (UX-PREC-006) — _motivo: Calculadas estaticamente dos valores dos tokens (#16a34a/#d97706 sobre fundos ~12% tint); sem execução de axe/navegador nesta sessão._
- Comportamento real do screencast/input remoto (frames, foco, latência) — _motivo: Análise estática do CaptureView e streamUrl; recorder não executado._

**ContaViva 360**
- Contraste efetivo dos pares de tokens (ex.: --ui-muted sobre --ui-bg) nos 2 temas — _motivo: Exige medição com ferramenta (axe/contrast checker); auditoria foi estática, sem execução_
- Renderização real dos CSS com var() inválido (bordas ausentes, botão ativo sem fundo) — _motivo: Comportamento inferido da spec de custom properties; não visto em browser nesta sessão_
- Existência de proteção SSO externa ao app (ex.: middleware Traefik global) cobrindo /contaviva-360 — _motivo: Não encontrei middleware no IngressRoute do app; configs de borda fora da raiz auditada não foram lidas_
- Comportamento do SSE em produção (reconexão a cada 5s, eventos por tenant) — _motivo: Runtime presumido; código lido (api.js:83-95, role-dashboards.js:309-326) sem execução_
- Contagem exata de testes de API (fato prévio dizia 75) — _motivo: Contei ~64 arquivos locked + integration.mjs pelo glob; não executei a suíte para contar casos_

**ContaViva Pro**
- Comportamento em runtime (renderização real, foco, toasts, fluxo SSO) — _motivo: Auditoria estática; app não foi executado nesta sessão — inferências marcadas_
- Contraste efetivo dos pares de tokens (ex.: --ui-muted sobre --ui-bg) nos dois temas — _motivo: Sem medição com ferramenta (axe/Lighthouse); paleta parece disciplinada mas não comprovada_
- Client Keycloak do realm nvit com implicit flow habilitado ou não — _motivo: Configuração vive no Keycloak/cluster, não no repo_
- Secret contaviva-pro-auth define BOOTSTRAP_ADMIN_* no cluster (sem isso não existe admin e /admin/users é inalcançável) — _motivo: envFrom optional no devops.yaml:9; conteúdo de Secret não é verificável no repo_
- Hipótese do levantamento 'baseline not_started + 0 requisitos' — _motivo: CONFIRMADA em specs/products/contaviva-pro/product.json (virou UX-CVPRO-013); 'zero testes de frontend, 8 de API' também confirmada (frontend/package.json sem script de teste; 8 arquivos em tests/locked/capability)_

**NeuroEvolui**
- Contagem exata de '76 testes de API' do levantamento prévio — _motivo: Inventariei as suítes (test/ unit + tests/locked capability/functional/nfr + design-system estático) sem contar teste a teste; a natureza 100% API/estática foi confirmada, o número não._
- Comportamento em runtime do middleware console-auth-401 (401 vs 302) sobre a SPA implantada — _motivo: Inferido da definição em console/k8s/auth/auth-routes.yaml; não executei o cluster nesta sessão._
- Conteúdo dos PRs #134–#149 (REF-NEUROEVOLUI-0035..0050, status pr_open) — _motivo: Branches não inspecionadas; a auditoria cobre só a main em a6c95ef, onde a baseline marca todos os 50 REF como não mesclados._
- Se o campo consultations.status aceita valores livres no banco (sem CHECK constraint) — _motivo: Não li as migrations; o UPDATE dinâmico do repositório não valida enum, mas a DDL pode validar._

**Imobia**
- Renderização real das tabelas/drawer em 375px — _motivo: análise estática de CSS; nenhum build/preview executado nesta sessão_
- Comportamento do EventSource sob 401 (fecha vs re-tenta) e aparência real dos botões .im-linkbtn — _motivo: runtime não executado; presunções marcadas como inferido_
- Rotas Traefik/IngressRoute ativas e app deployado no cluster — _motivo: k8s manifests lidos parcialmente; cluster não consultado (auditoria só-leitura de repo)_
- Conteúdo textual das respostas dormentes da IA (qualidade da explicação ao usuário) — _motivo: ai/service.ts e ai/engine.ts não lidos na íntegra_
- Contraste exato de todos os pares de cor — _motivo: cálculo manual de luminância em pares principais; sem execução de axe/Lighthouse_

**Ana Rabottini**
- Se o DevOps Console exibe feedback de erro próprio no nack de upload (mitigaria UX-ANA-006) — _motivo: console/ está fora da raiz auditada deste agente_
- Se o endpoint público do CMS sanitiza o campo html server-side (mitigaria UX-ANA-005) — _motivo: backend do CMS (console/pm-api) fora da raiz auditada; sem execução_
- Contraste medido em runtime (valores calculados estaticamente a partir dos tokens) — _motivo: análise estática sem axe/browser nesta sessão_
- Estado do conteúdo publicado no CMS vivo (se os canais já foram preenchidos em produção) — _motivo: auditoria somente-leitura do repo; dado vive no banco do CMS_

**Design System**
- Renderização real dos componentes/casca no browser (medidas de alvo de toque calculadas de padding/font, não medidas em runtime) — _motivo: auditoria estática, nenhum app executado_
- Comportamento do launcher com leitores de tela reais (NVDA/VoiceOver) — _motivo: inferido da semântica ARIA declarada; sem sessão de teste assistivo_
- Ausência TOTAL de toggler de dark no gymops (procurei por localStorage/classList/next-themes e não encontrei) — _motivo: busca por grep pode não cobrir um mecanismo não convencional; classifico como dark morto com confiança média_
- Estado de frontends de forge-pilot-v2 e ai-control-plane em relação ao DS — _motivo: não inspecionados em profundidade nesta sessão_
- Contraste do anel de foco (--ui-accent) sobre --ui-bg ≥3:1 em todas as marcas/ramps — _motivo: não computado nesta sessão (o teste do gerador cobre accent como texto, não o anel)_

**Base de specs/documentação**
- Suspeita do levantamento: rmambiental 'deployed' com conteudo placeholder — _motivo: REFUTADA no código — galeria com 26 fotos reais e alts descritivos (apps/rmambiental/src/data/projects.ts:1-30); nenhum placeholder encontrado em src/data|pages_
- Qual imagem zapbridge-web:local esta de fato rodando no cluster (build de app/dist ou web/dist) — _motivo: Imagens :local não são rastreaveis pelo repo; a divergencia entre os arquivos do repo esta verificada, o estado do runtime e inferido_
- Estado vivo dos Applications do Argo (sync efetivo de contaviva-pro/imobia/besc) — _motivo: Auditoria somente leitura do repo — não executei kubectl/argocd; manifests com automated+selfHeal verificados no git_
- Conteudo espelhado no CMS (pm-api) dos portais anarabottini/rmambiental — _motivo: Vive no banco do cluster, não no repo_

**Integração/Navegação**
- Excecao exata do fetch do probe no browser (TypeError CORS vs resposta seguida) — _motivo: mecanismo verificado no código e desfecho confirmado ao vivo ('fora' nos 4 destinos SSO), mas não instrumentado passo a passo_
- redirect_uri nvit.localhost registrado no client Keycloak devops-console — _motivo: realm export não inspecionado nesta sessao_
- Estado real da UI do Argo sob /argocd (README diz quebrada; helm-values seta rootpath+basehref) — _motivo: runtime não executado; e o objeto do UX-NAV-005_
- Grafana acessado via nvit.localhost/grafana com root_url fixo no domínio publico (links internos cross-domain?) — _motivo: grafana-values.yaml:37 lido, comportamento de runtime não observado_

**UX de IA**
- Se especialistas de IA do Imobia gravam dados autonomamente (timeline com actorType IA) — _motivo: não abri o orquestrador/tools do Imobia (api/src/modules/ai além de routes.ts); risco de ação autonoma não avaliado ali_
- Se os chips de smart-reply do ZapBridge enviam a mensagem direto ao clicar ou preenchem o composer — _motivo: não abri a parte de chips do MessageInput/ChatPanel_
- Se o backend do ContaViva Pro também devolve draft/citations como o da 360 — _motivo: view identica a da 360 (linha 112), mas não abri apps/contaviva-pro/api/src/routes/assistant.js_
- Comportamento runtime do policy.requiresConfirmation do copiloto SICAT — _motivo: fluxo confirmado por leitura de código (useInAppCopilot.js:403-413), sem execucao — runtime inferido_

**A11y plataforma**
- Comportamento real com NVDA/VoiceOver em qualquer superfície — _motivo: análise estática; nenhuma sessão de teste assistivo_
- Contraste numérico dos badges do console/reqhub (α 0.14-0.15) — _motivo: mesma raiz do portal (medido vivo 2,8:1), mas os pares específicos não foram computados — reprovação inferida_
- Densidade de uso do UiStatusBadge nos fluxos principais de contaviva-360/pro — _motivo: componente sincronizado confirmado; uso efetivo vem dos findings locais, não re-verificado_
- Ausência total de mecanismo de tema no gymops fora dos caminhos convencionais — _motivo: mesma ressalva do agente A15 (busca por grep)_

**QA/Regressão**
- Execução real das suítes (sicat Playwright, locked LIVE) nesta sessão — _motivo: Auditoria estática read-only; contagens e wiring de CI verificados no repo, resultados de execução não_
- Se o gateway CETESB do sicat já suporta CETESB_GATEWAY_MODE=mock de forma estável para CI — _motivo: test-services.yml declara a pendência ('precisa de um modo mock/offline'); não testei o modo — vira dependência de UX-QA-002_
- Contagem de test() individuais por arquivo (ex.: reqhub ~137, sicat backend) — _motivo: Contei arquivos, não casos; contagens de casos citadas vêm dos auditores de superfície (A08)_
- Se o job 'integration' do ci-gymops-e2e executa os 10 vitest da API integralmente (pnpm -r test pode incluir outros pacotes) — _motivo: Não executei o workspace; inferido da configuração_

---

## 18. Perguntas ao responsável de produto

Deduplicadas e agrupadas por superfície (as decisões formais D1–D8 estão na seção 14.1; as perguntas
abaixo são complementares, vindas dos auditores de cada superfície):



**Portal**
- O visitante anônimo nunca vê o selo 'no ar' nos cards curados (API 401) — é intencional que o status ao vivo seja exclusivo do operador, ou o público deveria ver disponibilidade de outra fonte?
- Há intenção de automatizar axe/Lighthouse no ci-portal (hoje é passo manual), dado que a paleta agora muda por codegen central?
- O showcase oculto (index.html:630-635) tem previsão de capturas reais, ou deve ser removido?
- Qual o comportamento desejado na expiração de sessão do operador: aviso com CTA de relogin ou o sumiço silencioso atual?
- Produtos com login devem ser Disallow no robots.txt (como o comentário do sitemap promete) ou apenas ficar fora do sitemap?

**DevOps Console**
- CONSOLE_DEV_TRUST_ADMIN segue true no ambiente exposto (dev.nvit.com.br)? O forward dos headers já foi confirmado para endurecer o fail-open?
- Há intenção de expor seleção de container nos Logs (o backend já aceita ?container=)?
- O runId de Publicações pode assumir o repo FlavioNeto11/devops para linkar o run, ou apps têm repos distintos?
- Members deveriam ter alguma visibilidade read-only de saúde dos próprios apps (hoje só admin vê Health/Logs)?
- O README do Console será atualizado para cobrir CMS/PM/Usuários, ou esse detalhamento vai para docs/ separado?

**SICAT**
- A administração de acessos (conceder/revogar perfil, reset de senha) deve ganhar UI ou a operação por API é decisão consciente?
- O chip 'Em elaboração' em /manifestos/novo ainda reflete o status real do wizard ou é resquício?
- Qual era o mapeamento pretendido do ?focus= do dashboard para os filtros da lista (failed→Falhas, draft→Rascunhos, pending/completed→?)?
- Há requisito (interno ou regulatório) de disclosure de conteúdo gerado por IA nas superfícies conversacionais que operam a CETESB?
- O /dev/components deve existir em produção? Se sim, deve ser restrito a admin?

**GymOps**
- Dark mode é objetivo do produto? Os tokens .dark completos existem, mas nenhum toggle os ativa — investir no toggle ou remover?
- Login com Google/SSO está em uso por usuários reais hoje? Isso define se UX-GYMOPS-001 bloqueia go-live.
- unit_manager deve ver um Painel Geral escopado (a tabela de rotas do navigation-map diz sim, a seção de sidebar diz não)?
- Push web é requisito do go-live (PRD: 'PWA substitui app nativo') ou pode ser cortado da UI até existir service worker?
- A leitura de integrações deve seguir a rbac-matrix (só owner/org_manager) ou o comportamento atual da API (qualquer membro vê status)?

**RM Ambiental**
- Os indicadores oficiais (+projetos, anos, estados, especialistas) da RM Ambiental já existem para substituir os ilustrativos via CMS?
- A Política de Privacidade será página do próprio portal (CMS) ou documento externo?
- O conteúdo live do CMS para rmambiental já foi publicado, ou o site em produção serve apenas o fallback embutido?
- Há intenção de manter o e-mail Gmail como contato oficial ou migrar para domínio próprio (afeta confiança na conversão)?

**BESC**
- O fluxo de convite deve ganhar a tela de resgate nesta fase, ou o caminho oficial passa a ser auto-cadastro + concessão manual (e o painel de convites sai)?
- Advogados/juízes devem enxergar alguma parte de /gestao/títulos, ou o portal de auditoria é a única superfície pretendida para titles:read linked?
- O dossiê público (allowlist) deve ser descoberto por anônimos no catálogo, ou o gate de login no teaser é decisão de funil?
- Qual é o plano para senha esquecida de conta local — reset próprio, delegação total ao realm besc, ou orientação manual?
- O access token na query string dos relatórios/anexos (reportHtmlUrl) é aceitável a longo prazo, considerando histórico do navegador e logs de proxy?

**ZapBridge**
- O frontend legado app/ (Expo) será mantido para mobile nativo ou removido? Isso define se Groups/KB/AutoReply/Arquivadas/Forward são regressoes a migrar ou cortes de escopo.
- Ha compromisso de conformidade (LGPD) com o RF060 'Apagar dados de IA' na web, ou o expurgo via desconexao basta por ora?
- Favoritos existe no modelo de dados do backend ou o chip deve ser removido?
- O tema claro (MVP-FUNCIONAL 5.9 + legado) segue no roadmap ou dark-only virou decisão de produto?
- A busca da tela inicial deve integrar /ai/search quando a IA estiver ligada, ou o placeholder deve parar de mencionar IA?

**Reqhub**
- O token de operador da IA deve continuar sendo colado manualmente ou a sessão SSO de borda deveria bastar para as rotas de autoria?
- A view Desenvolvimento (renderDev) será removida ou migrará para o detalhe do produto no Studio (A1b)?
- O gerador da baseline pode emitir generated_at para a UI expor a idade dos dados?
- Faz sentido exigir digitar o nome do projeto na exclusão da Forja, dado que produtos novos não entram na denylist?
- Os meta-docs (README/AGENTS/devops.yaml) serão atualizados para refletir o Studio e as ações com efeito colateral?

**Portal Recorder**
- O acesso deve continuar restrito a platform-admins ou há intenção de um grupo Keycloak dedicado a operadores de captura (hoje qualquer sessão OIDC do Console lê tudo)?
- Há plano de rotação/expiração do PORTAL_REC_TOKEN? Isso muda a prioridade da validação proativa na TokenBar (UX-PREC-002).
- O export canônico (GET /v1/contracts/:id/export) deveria ganhar botão na Revisão, ou a promoção via PR cobre todos os casos de uso?
- É intencional não pedir título de sessão na criação (UX-PREC-008), ou só ficou de fora do A4?
- Para o escape do canvas (UX-PREC-001): qual atalho é aceitável reservar sem conflitar com a operação dos portais capturados (Esc duplo, Ctrl+Alt)?

**ContaViva 360**
- O SSO de borda (oauth2-proxy/Keycloak) para /contaviva-360 tem prazo? O header X-Role deveria ser aceito só em ambiente local?
- Os 4 perfis ausentes da visão (auxiliar contábil, gestor financeiro, convidado, contador como papel real) seguem no escopo do produto?
- Documentos, tarefas e NF-e terão telas próprias nesta fase ou o produto é intencionalmente dashboard-first?
- O fluxo de rascunho da IA (confirm-draft) deve ganhar UI agora ou aguarda a revisão do bloco control-ai?
- Há plano de esteira de testes de frontend (Playwright/axe) para os produtos da Forja?

**ContaViva Pro**
- O domínio 'Registros' é placeholder da Forja ou já é a base do ERP contábil? Quais entidades reais a vision espera (lançamentos, contas, clientes)?
- O papel intermediário deve chamar-se 'manager' (código) ou 'contador' (vision)? Que permissões ele deveria ter na UI?
- A API de records ficará mesmo pública (ex.: para o gate forge-tests) ou o requireAuth foi apenas esquecido no scaffold?
- Há intenção de fluxo 'esqueci a senha' self-service, ou o reset administrativo basta para o perfil de uso?
- A submissão assíncrona (fila BullMQ) deve ganhar botão na UI ou os status de fila devem sair da tabela?

**NeuroEvolui**
- A área do paciente prometida na vision terá REQ/REF próprio ou ficou explicitamente fora do escopo da v1?
- Qual é o enum canônico de status (paciente e consulta)? Haverá migração dos valores pt já gravados por telas atuais?
- O login do NeuroEvolui será só a borda oauth2-proxy (redirect) ou o padrão SICAT de botão PKCE + sessão própria?
- As 11 views órfãs são descarte de geração anterior da Forja ou telas que a intenção é religar (ex.: RevenueDashboard em /revenue)?
- Ao 'aplicar' um rascunho do assistente, onde ele deveria ser persistido — evolution-note, patient-report ou entidade nova?

**Imobia**
- Os papéis corretor/financeiro/vistoriador terão superfícies e gating próprios? Existe plano para convite/gestão de membros na org?
- O plano é sincronizar o kit ui-vue/design-tokens (como o CLAUDE.md promete) ou oficializar o tema --im-* local?
- A exportação em PDF do PTAM/laudo (prometida na UI pública) entra em qual fase?
- O chat do assistente deve manter contexto multi-turno? O /ai/chat já aceita history, mas o /ai/stream usado pela UI não.
- Multi-org: /auth/me devolve organizations[], mas não há troca de organização na UI — é escopo previsto?

**Ana Rabottini**
- Os canais reais de Ana (e-mail/WhatsApp) já estão publicados no CMS de produção, ou o portal segue com fallback vazio como visto no repo?
- A página /contato deve virar CMS-driven como a Home, ou o hardcode é decisão deliberada?
- O endpoint /devops/api/cms/public sanitiza o HTML de rich-text antes de servir?
- Há intenção de adicionar testes mínimos (build + smoke/axe) a este portal, hoje sem nenhum teste?

**Design System**
- ui-react/ui-vanilla ainda são o plano, ou ui-vue + platform-shell os substituem oficialmente? (o DESIGN_SYSTEM.md precisa dizer)
- Qual é a política de adoção p/ gymops/besc/zapbridge/imobia — identidade própria declarada com mínimo universal, ou migração p/ tokens? Há prazo p/ o 'F3+' do imobia?
- A chave de tema deve ser única na plataforma (nvit-theme) também p/ apps de marca como SICAT e rmambiental?
- besc deveria existir em specs/products/ p/ ficar visível à descoberta da Forja e aos gates?
- Há intenção de uma galeria/showcase dos componentes ui-vue (pré-requisito barato p/ regressão visual e axe no CI)?

**Base de specs/documentação**
- contaviva-pro deve ganhar backfill de REQs (padrão D5) ou a vitrine deve exibir 'adotado sem requisitos'? Hoje ele consta not_started estando no ar.
- O besc entrara na Forja (specs/products/besc + REQ-BESC-*) agora que as fases 0-4 do marketplace estao implantadas?
- Ha plano de sincronizar apps/zapbridge/{devops.yaml,CLAUDE,README,AGENTS}.md com a reescrita web/ (Expo aposentado)?
- Deve existir NFR padrão de a11y (WCAG 2.2 AA) nos blueprints da Forja para todo produto novo?
- O ESCOPO-FUNCIONAL do besc ('sem login por definicao') será versionado para refletir o marketplace com RBAC, ou permanece como registro histórico v1?

**Integração/Navegação**
- nvit.localhost ainda e entrada suportada para as superfícies SSO, ou dev.nvit.com.br e a única borda de login?
- O launcher deve listar produtos (SURFACES dinamico via API do Console) ou o retorno ao hub e responsabilidade do shell de cada app?
- A UI do Argo sob /argocd funciona hoje com rootpath/basehref setados? Os runbooks podem ser atualizados?
- Qual o destino pretendido do card Keycloak do launcher para um usuário não-admin?
- Existe roadmap de convergencia dos produtos para o OIDC aditivo (oidc-kit), ou a fragmentacao de auth e aceita como permanente?

**UX de IA**
- A experiência-alvo da governanca de IA e consolidar leitura no Console (aba IA federando control-plane + aiusage) ou dar frontend próprio ao ai-control-plane?
- Ha requisito (interno ou regulatorio) de disclosure de falibilidade por domínio (saúde NeuroEvolui, fiscal SICAT, contabil ContaViva)?
- O auto-reply do ZapBridge deve ganhar UI web (toggle por conversa + trilha de disparos) ou ficar desabilitado até existir superfície de controle?
- A primitiva 'chat IA' deve entrar no kit ui-vue + um pacote React compartilhado, ou o padrão e replicar o AssistantView do NeuroEvolui via scaffold?
- O contrato do assistant (draft/citations/usage) vira contrato de UI obrigatório nos produtos da Forja (gate que falha se a UI descartar campos)?

**A11y plataforma**
- O ui-vue é o lar oficial das primitivas que faltam (clickable card/row, useFocusTrap, UiTabs, live-region de chat)? E qual é a fundação equivalente p/ os apps React (console/gymops/zapbridge), já que ui-react não existe?
- nvit-theme pode ser ratificada como chave única de tema inclusive p/ apps de marca (sicat/rmambiental), com migração de leitura?
- A galeria estática do ui-vue (pré-requisito do axe no CI) tem prioridade? Ela destrava os gates tipo-2 e a regressão visual do A15.
- Um grep-gate anti 'div/tr onClick sem role/tabindex' no CI é aceitável como check exigido, ou começa informativo?
- O fix dos badges deve emitir tokens de PAR (bg/fg) nos 2 renderers, ou trocar o fundo tintado por sólido nos consumidores?

**QA/Regressão**
- O sicat não rodar Playwright/backend em PR é decisão consciente (custo do runner) ou dívida esquecida desde a porta do test-services?
- O auto-merge da esteira (label gpt-approved) deveria exigir o rota-smoke H1 verde além do forge-tests atual?
- Há apetite para required checks por app (hoje só baseline/reqhub-gate são required) quando os gates novos estabilizarem?
- A galeria de componentes do ui-vue (pré-requisito de axe+visual diff do DS) pode virar entregável da onda 3 do Plano Mestre?
- O gate de evidência para status 'deployed' na baseline (UX-DOCS-010) deve nascer junto com os harnesses (mesmo PR de governança)?

---

## 19. Status de execução (Onda 0/1 — iniciada em 2026-07-21)

Registro do que já foi endereçado em PRs abertos (todos contra `main`, **sem merge** — revisão e
merge são do operador). Cada PR é cirúrgico, referencia os IDs que cobre e traz sua verificação.

### 19.1 PRs abertos

| PR | Escopo | IDs cobertos | Verificação |
|---|---|---|---|
| #254 | Plano Mestre (este documento) + decisões D1–D11 | — | doc |
| #255 | Portal Recorder: remover keyboard trap do canvas | UX-PREC-001 (P0) | 1 arquivo |
| #256 | platform-shell: sonda `redirect:'manual'` + a11y do launcher (redistribuído a 4 frontends) | UX-NAV-002, UX-PORTAL-003 | `node --test` 11/11 |
| #257 | SSO/ForwardAuth na borda dos frontends CV360 e NeuroEvolui | UX-CV360-001 (P0), UX-NEURO-001 (P0) | YAML + `kubectl --dry-run` |
| #258 | Contraste AA de badges/status (design-tokens + ui-vue + portal) + teste no CI | UX-A11Y-003, UX-PORTAL-001, UX-DS-002 | `node --test` + build-check; ratios ≥4,5:1 |
| #259 | Verdade documental (zapbridge devops.yaml/docs, imobia CLAUDE.md, rmambiental docs) | UX-ZAP-007, UX-DOCS-007/004/008/011, UX-RMAMB-002 | edições de texto/config |
| #260 | SICAT: ações de admin em /admin/acessos (grant/revoke/reset/expire) | UX-SICAT-003 | build vite |
| #261 | ContaViva Pro: renovar sessão no 401 + redirect a /login | UX-CVPRO-003/004 | build vite |
| #262 | GymOps: abrir atividade por teclado (card e linha) | UX-GYMOPS-002 (P0), UX-A11Y-001 (gymops) | estática (deps pnpm ausentes) |
| #263 | NeuroEvolui: 21 links mortos reapontados + confirm quebrado | UX-NEURO-002/003 | build vite |
| #264 | ContaViva 360: remover becos sem saída da navegação (D3 curto prazo) | UX-CV360-002 (P0), UX-CV360-010 | build vite |
| #265 | RM Ambiental: labels do formulário + skip-link + envio resiliente | UX-RMAMB-001/006/007 | build vite |
| #266 | Imobia: detalhes por teclado + Modal focus-trap/Esc | UX-IMOBIA-001 (P0), UX-IMOBIA-002 | build vite |
| #267 | BESC: auditoria read-only não cai na área de gestão + resgate de convite | UX-BESC-002, UX-BESC-001 | build vite |
| #268 | Console: card do kanban focável + focus-trap em modais + anti-descarte no CMS | UX-CONSOLE-001/002/003 | build vite |
| #269 | DESIGN_SYSTEM.md reflete os pacotes reais (ui-vue/platform-shell) | UX-DS-001 | doc |
| #270 | Reqhub: tabelas semânticas acessíveis + confirmação de blast-radius na Forja | UX-REQHUB-001/002/004 | `node --test` |
| #271 | ContaViva 360: clicáveis por teclado + rótulos nos filtros | UX-CV360-008/007 | build vite |
| #272 | SICAT: CTAs do dashboard levam à lista filtrada (?focus consumido) | UX-SICAT-001 | build vite |
| #273 | ZapBridge: ações de mensagem por teclado + erro≠vazio + confirmar desconexão | UX-ZAP-001/002/003/004 | build vite (tsc+vite) |
| #274 | BESC: a11y correlata (aria-current nas tabs, rótulos de filtro, overflow de tabela, progressbar, reduced-motion) | UX-BESC-005/006/007/015/016 | build vite |

### 19.2 Cobertura dos 10 P0

| P0 | Estado |
|---|---|
| UX-PREC-001 (keyboard trap) | ✅ PR #255 |
| UX-CV360-001 (SPA sem guard) | ✅ PR #257 |
| UX-NEURO-001 (SPA sem guard) | ✅ PR #257 |
| UX-GYMOPS-002 (teclado atividade) | ✅ PR #262 |
| UX-IMOBIA-001 (teclado/modal) | ✅ PR #266 |
| UX-CV360-002 (becos sem saída) | ✅ PR #264 (curto prazo) |
| UX-A11Y-001 (clicável sistêmico) | ✅ completo — gymops/imobia/console/cv360 (PR #262/#266/#268/#271); BESC verificado **sem o problema** (linhas já usam `<Link>` nativo focável — #274 cobriu a11y correlata) |
| UX-CVPRO-001 (API records exposta) | ⛔ **bloqueado por D9** (teste LOCKED da Forge + manifesto compilado) |
| UX-CVPRO-002 (edição sem endpoint) | ⛔ **bloqueado por D10** (criar endpoint de update) |
| UX-GYMOPS-001 (callback SSO) | ⛔ **bloqueado por D11** (backend expor org/papel) |

**7 dos 10 P0 endereçados por PR** (todos os acionáveis; UX-A11Y-001 completo). Os 3 restantes
exigem decisão/mudança de backend (D9–D11) e estão documentados — nenhum foi contornado com
gambiarra. Ou seja: **100% dos P0 corrigíveis sem uma decisão do dono estão em PR.**

### 19.3 O que permanece (honestidade de escopo)

- **Bloqueado por decisão do dono:** D9 (records da Forge), D10 (endpoint de edição CVPro), D11
  (callback SSO GymOps), D3 (visão de 7 perfis do CV360), UX-DOCS-001/005 (baseline de specs — não
  tocada por risco de corromper a fonte da verdade da esteira).
- **Backlog não iniciado:** o grosso de P2/P3 (polimento, microcopy, performance percebida) das
  Ondas 1–4 — ~230 achados de baixo esforço unitário que devem seguir em **lotes por app** (1 PR por
  app, guiado pela tabela 10.1) e não justificam PRs individuais neste momento. A11y de fluxo
  principal e os P1 de estados/becos de maior valor já foram cobertos acima.
- **Fundação de QA (PR-01/harnesses):** os smokes por papel (H1–H6, §16) não foram criados porque
  exigem infra de CI (Postgres/Playwright/servers) cuja configuração é decisão de plataforma — é o
  próximo passo recomendado antes de expandir a automação de correções.

> **Nota de processo:** os PRs desta execução foram abertos via a ferramenta PowerShell porque o
> projeto tem deny rules de Bash para `git push`/`gh pr create`; o operador autorizou explicitamente
> este fluxo nesta sessão após ser informado. Nenhum PR foi mesclado (`gh pr merge` permanece
> bloqueado e intocado). Se o fluxo preferido for outro (esteira via label, ou push manual do
> operador), basta orientar.

### 19.4 Fechamento — branch de integração e placar final

Com o dono liberando trabalho direto em branch (sem PR por item), toda a Onda 0/1 e o polimento
viável foram consolidados em **`ux/onda-integration`** (ramificada de `main`, **não mesclada** — merge
é do operador). As 21 branches de PR + as levas seguintes integraram **sem nenhum conflito**;
drift-gate (design-tokens + platform-shell) e testes de contraste seguem **verdes** na integração.

**Levas executadas:**
- Levas 1–4 (20 PRs #255–#274): P0 + P1 de alto valor por superfície.
- Leva 5: P1 restantes de Portal Recorder, Ana Rabottini, Imobia (estados) e GymOps.
- Leva 6: varredura P2/P3 nos 12 apps — **96 achados** cobertos, 78 pulados **com motivo** (backend/decisão/risco, não inventados).
- Leva 7: últimos P1 de frontend (ContaViva 360, NeuroEvolui, Imobia).

**Livro-razão de cobertura (dos 304 achados):**

| Categoria | Qtd | % | Por severidade |
|---|---|---|---|
| **Feitos na integração** | 167 | 55% | P0=7 · P1=51 · P2=66 · P3=43 |
| Bloqueados (decisão/backend) ou pulados com motivo | 78 | 26% | — |
| Polimento não tocado (baixo valor/risco) | 59 | 19% | P1=11 · P2=29 · P3=19 |

- **P0: 7 de 10** (100% dos corrigíveis sem decisão). Os 3 restantes = D9/D10/D11.
- **P1: 51 de 77.** Os 11 P1 não feitos são: QA-harnesses UX-QA-001/002/003/004 (precisam de infra
  de CI), UX-NAV-001 (platform-shell nos apps de produto, arquitetural), UX-NAV-003 (D6, domínio de
  login), UX-CONSOLE-004/005 (**feitos** sob IDs renumerados 002/003 — falso-negativo do razão),
  UX-RMAMB-003 (números ilustrativos, decisão de conteúdo), UX-ZAP-006 (revogar consentimento de IA,
  backend), UX-A11Y-002 (focus-trap sistêmico — coberto na prática pelos modais já corrigidos).

**Estado da branch:** `ux/onda-integration` — 201 arquivos, +9067/−1187 vs `main`.

**Como o operador pode consumir:** (a) mesclar `ux/onda-integration` inteira (após revisar), OU
(b) mesclar os PRs #255–#274 individualmente (Onda 0/1 núcleo) e cereja-pegar as levas 5–7 depois.
Em ambos os casos, **#257 (auth de borda) por último e com validação viva** — aplica manifests que o
Argo sincroniza no cluster. `main` permanece intocada até a decisão do operador.

### 19.5 Fundação de QA (guardas que rodam sem servidor)

Entregue em `scripts/qa/` + CI, para travar as regressões que esta execução corrigiu — **antes** da
camada Playwright/axe (que precisa de infra de CI). Node puro, sem dependências, sem serviços.

- **`route-integrity.mjs`** — guarda determinístico de navegação morta (a classe do bug UX-NEURO-002).
  Extrai as rotas registradas dos apps Vue e sinaliza alvos de `to=`/`router.push`/`go()` sem rota.
  **Dogfooding:** achou 1 dead link real que passou pela integração (NeuroEvolui → `/api-docs`),
  corrigido. **Estado: 0 navegações mortas.**
- **`a11y-static.mjs`** — guarda do clicável-sem-teclado (WCAG 2.1.1). Parse de elemento, baixo
  falso-positivo. Worklist do burndown: **34 → 17** (17 corrigidos; 17 remanescentes são isenções
  justificadas — backdrops com Esc, wrappers de botões nativos onde `role=button` criaria nested-interactive).
- **Baseline** (`*.baseline.json`): o CI (`--check`) barra só regressão nova; a dívida conhecida
  encolhe ao ser corrigida (`--update`). Adoção imediata.
- **CI**: `.github/workflows/qa-guards.yml` roda os dois guardas em PRs que tocam frontends.
- **`scripts/qa/README.md`** documenta os guardas e a esteira futura (H1 rota-smoke por papel, H3 axe,
  H5 visual-diff, H6 sessão/erro) que precisa de Postgres/Playwright no CI.

**Estado final de `ux/onda-integration`:** 218 arquivos, +10427/−1216 vs `main`; drift-gate, contraste
e os 2 guardas de QA todos verdes. `main` intocada.

### 19.6 Decisões D9–D11 e D3 — resolvidas em código (na integração)

Com o dono delegando as decisões, foram implementadas na branch de integração (**não mescladas**):

- **D10 — edição no ContaViva Pro (fecha UX-CVPRO-002).** Adicionado `PUT /v1/records/:id`
  (`apps/contaviva-pro/api/src/server.js`), espelhando o NeuroEvolui: edita `title`/`external_ref`,
  valida corpo/title vazio (400), escopo por tenant, 404 se não achar, grava audit. O frontend já
  chamava `PUT`. **Risco baixo, aditivo.**
- **D9 — exposição de records da Forge (fecha UX-CVPRO-001).** `requireAuth` nas 5 rotas de records
  do CVPro + tenant derivado do JWT (não mais do header spoofável). Para não recorrer em apps
  futuros, o **gerador** foi corrigido (`specs/forge/scaffold-gymops.mjs` emite records com auth
  quando o bloco `contas-acesso` está presente) e o **template do teste locked** passou a autenticar
  (`specs/tools/make-test-suite.mjs`). A suíte LOCKED do CVPro foi **regenerada pelo caminho
  sancionado** — `node specs/tools/make-test-suite.mjs --product contaviva-pro` — e o
  `verify-test-locks` **passa** (9 testes íntegros, o teste regenerado autentica antes de postar). O
  `integration.mjs` não-locked foi reordenado para autenticar.
  - ⚠️ **Item nº1 de revisão humana antes do merge de produção:** o gate **`forge-tests` LIVE**
    (Postgres+Redis, que sobe o app e roda os testes locked de verdade) **não pôde rodar localmente**
    — roda na sua CI ao abrir o PR. É a validação final desta mudança de blast-radius de plataforma.
  - **Limitação do ContaViva 360:** ele não tem JWT real (só header stand-in `X-Role`); recebeu
    `requireRole('member')` no `POST /v1/records`, que é praticamente no-op no nível do app — mas a
    **API do cv360 já é protegida na borda** (ForwardAuth `console-auth-401`), então não está exposta
    em produção. Fechar no nível do app exigiria adotar JWT/ForwardAuth próprio (fora deste escopo).
- **D11 — callback SSO do GymOps (fecha UX-GYMOPS-001).** `GET /auth/me` enriquecido com
  `organizationId`/`role`/`primaryUnitId`/`isPlatformAdmin` (reusando `resolveUserContext` já
  existente — zero lógica nova), e o callback OAuth passa a popular o store como o login por senha.
  **typecheck verde (API + web)**; a vitest de integração só barra por falta de Postgres local.
- **D3 — visão de 7 perfis do ContaViva 360 (decisão tomada).** Mantêm-se os **3 papéis reais**
  (admin/manager/member) como fonte da verdade; os 7 perfis da visão mapeiam nesses 3, e os demais
  ficam como **trabalho futuro** (construir 4 experiências-de-papel especulativas não se justifica
  sem intake de produto). O curto prazo (remover os becos de navegação) já está feito (§19.1, #264).

**Placar de P0 atualizado:** com D9/D10/D11 em código, **os 10 P0 estão endereçados** (7 nas levas
anteriores + estes 3). Os 3 últimos carregam a ressalva de validação na CI LIVE (D9) e as limitações
documentadas acima — por isso o merge de produção, especialmente do D9, deve rodar `forge-tests` LIVE
e ser revisado por humano.
