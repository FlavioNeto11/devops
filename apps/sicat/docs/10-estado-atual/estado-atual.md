# Estado atual do SICAT

> Snapshot honesto baseado em código, OpenAPI publicado e checkpoints recentes.
> **Nada aqui é marcado como IMPLEMENTADO sem evidência verificável** — e omitir também é mentir, por
> isso o que não foi entregue está escrito com o mesmo destaque do que foi.
> Última revisão: **leva de consolidação da cadeia `whatsapp-channel-sicat` — 2026-08-08**, sobre a
> branch `sicat/whatsapp-channel` já com os 9 PRs da leva anterior mesclados. A revisão imediatamente
> anterior era da fase 7 (`09-contrato-qa-final`), do mesmo dia; antes dela, 2026-04-25 (que ignorava
> ~3,5 meses de entregas — AI Control Center, DL-094 a DL-100, camada conversacional).
>
> **A manchete continua a mesma e continua negativa: emitir MTR pelo WhatsApp NÃO está entregue ao
> usuário final.** §3.1 explica por quê e o [runbook](../05-operacao/runbook-canal-whatsapp.md) §7
> dá o checklist fechado do que destrava.

## 0. Legenda

| Ícone | Significado |
|---|---|
| ✅ | **IMPLEMENTADO** — existe em código, com evidência citada |
| ⚠️ | **PARCIAL** — parte existe, parte não; o que falta está nomeado |
| ⛔ | **RECUSADO / FECHADO POR DESENHO** — não é backlog, é decisão registrada |
| 🕓 | **INERTE** — o código existe mas está desligado por default ou não aplicado no ambiente |
| 📋 | **PLANEJADO** — não começou |

## 1. Leitura executiva

O SICAT consolidou um núcleo operacional estável de:

- autenticação SICAT própria (+ SSO Keycloak) e seleção de conta CETESB ativa;
- criação, listagem, replicação e operação assíncrona de manifestos (submit, print, cancel, receive);
- emissão e download de CDF padrão; MTR provisório; fluxo declaratório DMR (gateway ainda stub);
- catálogos CETESB sincronizados localmente;
- fila transacional Postgres com locking otimista, retry, DLQ e observabilidade (DL-022);
- frontend Vue 3 com design system `Sicat*` e navegação por audiência (DL-100);
- **camada de IA real** — chat conversacional, copiloto in-app, orquestração LangChain/LangGraph
  (DL-096) e um **AI Control Center** com runtime dinâmico de tools;
- **canal conversacional externo (WhatsApp)** — endurecido, testado e **desligado por default**
  (§2.7 e §3.1: a manchete do canal, emitir MTR, **não** está entregue).

## 2. IMPLEMENTADO (com evidência)

### 2.1 Backend (TypeScript, Express, Postgres)

Rotas publicadas em `src/routes/*.ts`, conferidas contra o código:

- saúde e fila: `GET /v1/ping`, `GET /v1/health/system`, `GET /v1/health/workers`,
  `GET /v1/health/jobs/active`, `POST /v1/health/jobs/active/:jobId/cancel`,
  `DELETE /v1/health/jobs/active/:jobId`, `GET /v1/health/jobs/dlq`,
  `POST /v1/health/jobs/dlq/:jobId/requeue`, `DELETE /v1/health/jobs/dlq/:jobId`;
- métricas: `GET /v1/health/metrics/{performance,timeline,endpoints}`;
- dashboard: `GET /v1/dashboard/overview`;
- manutenção: `POST /v1/maintenance/cleanup`;
- auth CETESB: `POST /v1/auth/login`, `GET /v1/auth/partner-info`;
- auth SICAT: `POST /v1/sicat/auth/login`, `POST /v1/sicat/auth/register`,
  `POST /v1/sicat/auth/refresh`, **`POST /v1/sicat/auth/keycloak`** (SSO OIDC);
- contas CETESB: `GET|POST /v1/sicat/cetesb-accounts`,
  `POST /v1/sicat/cetesb-accounts/:accountId/activate`,
  `DELETE /v1/sicat/cetesb-accounts/:accountId`, `GET /v1/sicat/session`;
- administração de acessos (RBAC interno): users, roles, permissions, sessions, grant/revoke,
  password reset/expire em `/v1/admin/access/...`;
- session contexts, catálogos, parceiros, cadastros (inalterados);
- manifestos: criação singular e batch, listagem, detalhe, replicate, delete, submit, print, cancel,
  batch-submit, batch-cancel, `POST /v1/manifestos/receive`, **`POST /v1/manifestos/:id/replicate`**,
  **`POST /v1/manifestos/batch-create`**, **`GET /v1/manifestos/receipt-responsibles`**;
- CDF: `POST /v1/cdf/generate`, `POST /v1/cdf/download`, `GET /v1/cdf/certificates`,
  `GET /v1/cdf/documents/:documentId`, **`GET /v1/cdf/responsibles`**;
- jobs e auditoria: `GET /v1/jobs/:jobId`, `GET /v1/jobs/:jobId/events`,
  `GET /v1/audit/:correlationId`;
- **DMR** (cadeia `dmr-fluxo-base`, 2026-04-25): 11 operações `/v1/dmr/*`. Persistência via
  [013_dmr_declarations.sql](../../backend/src/sql/013_dmr_declarations.sql) (DL-022: locking
  otimista, trigger `increment_version`, 5 constraints). Validador em
  [dmr-validator.ts](../../backend/src/lib/validators/dmr-validator.ts) (códigos `DMR_*` estáveis).
  Handler `dmr.submit` em
  [operation-handlers.ts](../../backend/src/workers/operation-handlers.ts). Gateway DMR é **stub
  contratual** (Caminho B) devolvendo `problem+json` 503 `DMR_GATEWAY_PENDING_HAR` até captura humana
  de HAR. CHANGELOG: [CHANGELOG-DMR-FLUXO-BASE.md](../CHANGELOG-DMR-FLUXO-BASE.md);
- **MTR provisório** (cadeia `mtr-provisorio-fluxo-base`, 2026-04-25): 5 operações
  `/v1/mtr-provisorio/*`. Persistência reaproveita `manifests` com discriminador `kind` via
  [014_mtr_provisorio_kind.sql](../../backend/src/sql/014_mtr_provisorio_kind.sql). Validador em
  [mtr-provisorio-validator.ts](../../backend/src/lib/validators/mtr-provisorio-validator.ts).
  Decisões R3-C e R5 registradas. CHANGELOG:
  [CHANGELOG-MTR-PROVISORIO-FLUXO-BASE.md](../CHANGELOG-MTR-PROVISORIO-FLUXO-BASE.md);
- **Centro Operacional** (cadeia `centro-operacional-sicat`, 2026-04-25):
  `GET /v1/operations/overview`, `GET /v1/jobs/search`, `POST /v1/jobs/:jobId/retry` (idempotente),
  `GET /v1/audit/search`, `GET /v1/cetesb/accounts/health`, `GET /v1/cetesb/sessions/health`,
  `GET /v1/reports/mtrs`, `GET /v1/reports/mtrs/export`;
- **Camada conversacional**: `GET /v1/conversations/tools`,
  `GET /v1/conversations/artifacts/:artifactId`,
  `GET /v1/conversations/artifacts/:artifactId/content`, `POST /v1/conversations/feedback`,
  `POST /v1/conversations/turns` (§2.7);
- **AI Control Center**: **40 registros de rota** em
  [ai-control-routes.ts](../../backend/src/routes/ai-control-routes.ts) sob `/v1/ai-control/*` (§2.6);
- **Canal WhatsApp**: `GET|POST /v1/channels/whatsapp/webhook` (rota **pública**) e 9 rotas
  `/v1/sicat/channel-links/*` (§2.7).

> **Autenticação desta superfície.** Toda rota acima exige `sicatAuthMiddleware` (Bearer do SICAT),
> com exatamente **9 exceções**: `GET /health`, `GET /v1/ping`, `POST /v1/auth/login`,
> `POST /v1/sicat/auth/{login,register,refresh,keycloak}` e o webhook do canal (GET+POST, autenticado
> por HMAC do provedor). A lista é fechada e verificada por
> [tests/api/v1-auth-coverage.test.js](../../backend/tests/api/v1-auth-coverage.test.js), que enumera
> o router realmente montado — rota nova nasce fechada. Ver §4, item "autorização das rotas REST".

### 2.2 Contrato OpenAPI — 104 operações

[openapi/mtr_automacao_openapi_interna.yaml](../../backend/openapi/mtr_automacao_openapi_interna.yaml)
→ [examples/](../../examples/) → [src/generated/operations.ts](../../backend/src/generated/operations.ts).

A fase 7 desta cadeia levou o documento de 88 para **104 operações** (87 paths, 154 schemas),
publicando as 16 operações da cadeia (conversations, channel-links, webhook) que estavam fora do
contrato — dívida registrada desde a fase 0. Verificado: `grep -c '"key":' operations.ts` = **104**.

⚠️ **Ainda fora do contrato:** as ~40 rotas `/v1/ai-control/*` e 4 rotas
`/v1/health/jobs/{active,dlq}/...`. Registrado em §3.6.

### 2.3 Worker e fila (DL-022)

Comprovado em `backend/src/sql/004_advanced_locking_consistency.sql` e
[DL-022](../DL-022-EVOLUCAO-PERSISTENCIA-FILA.md):

- locking otimista (`version`) em `jobs`, `manifests` e `session_contexts`;
- 5 constraints de consistência; tabelas `worker_health`, `system_events`, `performance_snapshots`;
- worker heartbeat com auto-registro e shutdown gracioso; retry exponencial e DLQ persistido;
- **novo (fase 3 desta cadeia):** raias de fila em
  [lib/job-lanes.ts](../../backend/src/lib/job-lanes.ts) — `WORKER_LANE` ausente ⇒ `all`
  (comportamento antigo byte a byte). A raia **nasce inerte**; subir o `sicat-worker-channel` é
  pré-requisito **operacional** de ligar o canal, não de mergear o código.

⚠️ **`runMigrations` NÃO tem advisory lock** (`backend/src/db/migrate.ts`). Com `AUTO_MIGRATE=true`
na api **e** no worker, dois bootstraps simultâneos colidem em `23505` e derrubam os dois em
CrashLoop. Migration inédita exige **rollout escalonado**. (`AGENTS.md` §5 e `ONBOARDING-DEVOPS.md`
§4 ainda afirmavam o contrário; `CLAUDE.md` e `k8s/backend.yaml` foram corrigidos na fase 4.5.)

**21 migrations** em `backend/src/sql/` (até a `020`). O snapshot anterior citava até a `014`.

### 2.4 Gateway CETESB (real-mode)

Em [cetesb-gateway.js](../../backend/src/gateways/cetesb-gateway.js) (única exceção JS — DL-093):
bootstrap de sessão e reuso/renovação de JWT, submit, print, cancel, receive, geração e download de
CDF, listagem de certificados, busca de manifesto, busca de parceiro, catálogos. `recaptchaToken` é
opcional (aceito vazio).

### 2.5 Frontend Vue 3

Confirmado em [frontend/src/router.js](../../frontend/src/router.js) — 33 rotas declaradas:

- públicas/auth: `/`, `/login`, **`/login/keycloak/callback`**, `/login/cetesb`;
- operação: `/dashboard`, `/manifestos`, `/manifestos/novo`, `/manifestos/:id`, `/relatorios/mtrs`,
  `/dmr` (+ `/pendentes`, `/novo`, `/:dmrId`), `/mtr-provisorio` (+ `/novo`, `/:id`),
  **`/cdf`**, **`/cdf/novo`**;
- centro operacional: `/operacao/{dashboard,auditoria,auditoria/:correlationId,cetesb-health,relatorios/mtr,command-center}`;
- sistema: **`/sistema/jobs`**, **`/sistema/ai-control`** (`/jobs` e `/operacao/jobs` redirecionam);
- conta: `/sessao`, **`/perfil/canais`** (vínculo do WhatsApp), `/conversacional/chat`;
- administração: `/admin/acessos`; playground: **`/dev/components`**.

Design system `Sicat*` (21 componentes — 17 da DL-100 mais `SicatActionCard`, `SicatAuthSteps`,
`SicatHelpHint` e `SicatNextStep`, vindos da cadeia de UX didática), navegação **por audiência**,
`status-map.js` como fonte
única de status, composables `useNotification`/`useJobAwait`/`useJobStream` — tudo DL-100
([CHANGELOG](../CHANGELOG-DL-100-REFATORACAO-UX-DESIGN-SYSTEM.md)). `CdfView.vue`,
`JobsConsoleView.vue` e `UiState.vue` foram **removidos** — o snapshot anterior ainda os citava.

### 2.6 AI Control Center (2026-05-30) — ausente por completo do snapshot anterior

- migration [017_ai_control_center.sql](../../backend/src/sql/017_ai_control_center.sql) —
  **11 tabelas** + views;
- 6 repositórios + `src/services/ai-control/*`; **40 registros de rota** em
  `/v1/ai-control/*`; view `/sistema/ai-control` com painéis;
- **runtime dinâmico**: a tabela `ai_tools` **sobrepõe** o `tool-registry.ts` — é por aí que se
  libera (ou revoga) um canal para uma tool, sem deploy;
- Langfuse como provider opcional; gates `AI_CONTROL_ENABLED` / `AI_CONTROL_READONLY`; confirmação
  por HTTP 428.

Checkpoints: [docs/handoffs/ai-control-center/](../handoffs/ai-control-center/).

### 2.7 ✅ Canal conversacional externo — WhatsApp

Cadeia `whatsapp-channel-sicat` (8 commits, fases 0–7), branch `sicat/whatsapp-channel`, 2026-08-06/08.
**Leia esta seção junto com a §3.1** — o que NÃO foi entregue é tão importante quanto o que foi.

**Superfície conversacional endurecida (fase 0).** As 5 rotas `/v1/conversations/*` passam a exigir
`sicatAuthMiddleware` (verificado em
[conversation-routes.ts](../../backend/src/routes/conversation-routes.ts)). A identidade do turno
(`channel`, `userId`, `integrationAccountId`, `sessionContextId`, `permissionKeys`) é **resolvida no
servidor** e vence o corpo da requisição. `whatsapp` **não é canal declarável por cliente HTTP** →
403 `CONVERSATION_CHANNEL_NOT_CLIENT_DECLARABLE`; canal desconhecido → 400
`CONVERSATION_CHANNEL_INVALID` (antes caía silenciosamente em `inapp`). Rate limit de **40 turnos /
5 min por usuário** → 429 `CONVERSATION_RATE_LIMITED` + `Retry-After`.

**Abstração de provedor (fase 1).** `WhatsAppProvider` com adapters **Twilio** e **Meta Cloud API**
(`backend/src/services/conversation/channel/whatsapp/`), selecionados por `WHATSAPP_PROVIDER`
(**default `disabled`**). Verificação de assinatura **fail-closed** e `AbortSignal.timeout` em todo
`fetch`.

**Vinculação telefone ↔ usuário por OTP (fase 2).** OTP **sempre iniciado no app**: 6 rotas de
vínculo + 3 de janela de ação em `/v1/sicat/channel-links/*`, tela `/perfil/canais`. Migration
[020_channel_link_verifications.sql](../../backend/src/sql/020_channel_link_verifications.sql) —
`code_hash` é `scrypt` **com salt por linha**, nunca o código nem um sha256 dele (6 dígitos = 10⁶
imagens pré-computáveis em menos de um segundo a partir de um dump).

**Webhook público (fase 3).** `GET|POST /v1/channels/whatsapp/webhook` — **primeira rota pública do
SICAT**, isenta do `authMiddleware` global por `PUBLIC_PATH_PREFIXES` em
[middlewares/auth.ts](../../backend/src/middlewares/auth.ts), autenticada **pela assinatura HMAC**.
A isenção é estreita: `/v1/sicat/channel-links` **não** entra nela. A recepção enfileira
`whatsapp.inbound_message` e responde 200 em milissegundos; idempotência pelo `unique` de
`jobs.command_id`, sem migration nova.

**Renderer de saída textual (fase 4).** Renderizador determinístico do `ConversationStructuredResult`
para texto de WhatsApp, por **famílias** (mapa `TYPE_TO_FAMILY` + `INTENT_TO_FAMILY`, não um `switch`
de 21 braços — a razão está escrita no cabeçalho de
[whatsapp-result-renderer.ts](../../backend/src/services/conversation/channel/whatsapp/whatsapp-result-renderer.ts)),
mais segmentador de mensagem.

**RBAC conversacional fail-closed (fase 4.5).** Catálogo de **8 chaves** e gate de **3 estados**
avaliado **por chave**. Antes, quem não tinha papel nenhum passava por TODAS as tools — e
`access_permissions` tinha 0 linhas. Runbook:
[runbook-rbac-conversacional.md](../05-operacao/runbook-rbac-conversacional.md).

**Confirmação de ação server-side (fase 5).** Ticket **one-time**, persistido como **linha** (não
token autocontido) em `conversation_channel_verifications`, discriminado por `channel_type`
(`whatsapp_action`, `whatsapp_stepup`) — zero DDL novo. Argumentos remontados **no servidor** a
partir da linha; autorização reavaliada na queima. Elegibilidade por **efeito irreversível**, não por
`riskLevel`.

**Aviso de conclusão e entrega de arquivo (fase 6).** Job `whatsapp.outbound_notice` **por ticket**,
criado na **confirmação** (não no desfecho) — assim o estado "terminou e não avisou" não existe.
Nunca vai para DLQ. Entrega de mídia implementada e **desligada por default**.

**Contrato (fase 7).** As 16 operações da cadeia publicadas no OpenAPI em lockstep (§2.2).

**Métricas:** `sicat_channel_inbound_{received,enqueued,dropped}_total`,
`sicat_channel_outbound_notice_total` ([channel-metrics.ts](../../backend/src/lib/channel-metrics.ts)),
`sicat_conversation_permission_decision_total`.

**Suíte, medida na árvore consolidada em 2026-08-08:**

| Suíte | Total | Pass | Fail |
|---|---|---|---|
| backend unit | 1037 | 1002 | **35** |
| backend integração | 149 | 128 | **21** |
| frontend | 245 | **245** | 0 |

`typecheck` e `lint` limpos; build de frontend limpo; os 9 PRs da leva consolidaram sem conflito. As
falhas são **pré-existentes**: 11 nomes top-level no unit (HARs não versionados, validadores
estruturais, escalação de LLM) e 5 nomes na integração. Não foram introduzidas pela cadeia — e
**também não foram consertadas por ela**.

### 2.8 ⚠️ Correlação pré-submit de manifesto (Track C) — 1 de 3 partes ligada

Fecha (parcialmente) o risco de **MTR duplicado** descrito em §4. Decisão registrada em
**[DL-102](../copilot/13-decision-log.md)**.

- **✅ C1 — o marcador está costurado ponta a ponta.** `[sicat:<manifestId>]`, determinístico, gerado
  por [lib/manifest-correlation.ts](../../backend/src/lib/manifest-correlation.ts). O worker persiste
  a intenção (`submitCorrelation` = marcador + `jobId` + `dispatchedAt`) no `payload` jsonb **antes**
  de chamar o gateway ([operation-handlers.ts:1069–1072](../../backend/src/workers/operation-handlers.ts);
  1260–1265 para o MTR provisório) e o gateway concatena o mesmo marcador ao `manObservacao` enviado
  ([cetesb-gateway.js:1322](../../backend/src/gateways/cetesb-gateway.js), via `correlationManifestId`
  na linha 2283). Preserva a observação do usuário e é idempotente. **Sem migration.**
- **🕓 C2 — o reconciliador existe e está INERTE.**
  [services/manifest-submit-reconciler.ts](../../backend/src/services/manifest-submit-reconciler.ts)
  pergunta à CETESB via `searchManifests` injetado e casa o remoto pelo marcador; resultado tipado
  `found` | `not-found-after-polling` | `error`, com `SUBMIT_RECONCILE_AMBIGUOUS_MARKER_MATCH` para
  ambiguidade de lote. **Nenhum consumidor em `src/`** — só o teste unitário importa o módulo.
- **🕓 C3 — a varredura existe e está INERTE.**
  `listUnconfirmedSubmitManifestsForReconciliation`
  ([manifest-repo.ts:457](../../backend/src/repositories/manifest-repo.ts)) lista manifestos presos em
  `queued_submit`/`submitting`/`processing` com `external_hash_code` **NULO**, com janela de tempo
  obrigatória. **Nenhum consumidor em `src/`** — só os testes chamam.
- **⛔ O estado `submit_unconfirmed` NÃO EXISTE.** Verificado por busca em `backend/src` e
  `frontend/src`: nenhuma ocorrência. Falha terminal de `manifest.submit` continua gravando `failed`
  sem consultar a CETESB ([operation-handlers.ts:754–759](../../backend/src/workers/operation-handlers.ts)).

**Consequência para o canal:** a evidência **E5** do portão do N2 continua **não satisfeita**.

## 3. PARCIAL, INERTE e RECUSADO

### 3.1 ⛔🕓 Canal WhatsApp — o que ele NÃO faz

Esta subseção é a razão de o snapshot existir. Nada aqui é "falta de tempo": são decisões escritas.

- **⛔ O canal NÃO emite MTR.** As ações de nível **N2** (`submit_manifest`,
  `manifest.batch_submit_selected`) estão fechadas por **constante de código** —
  `const WHATSAPP_OUTBOUND_NOTICE_IMPLEMENTED = false;`
  (`whatsapp-confirmation-flow.ts:207`), com gate
  `if (!WHATSAPP_OUTBOUND_NOTICE_IMPLEMENTED || !resolveWhatsAppOutboundNoticeEnabled())` na linha
  293. **Nenhum `=true` de ambiente as abre**: `WHATSAPP_ACTION_NOTICE_ENABLED` (default `false`,
  [config.ts:338](../../backend/src/lib/config.ts)) abre **uma** das duas condições do `||`.
  A razão: o aviso de conclusão **não distingue "o MTR não foi criado" de "o MTR foi criado e eu
  perdi a resposta"**, e para emissão irreversível essa é a única informação que importa.
  **Emitir MTR pelo WhatsApp — a manchete do canal — não está entregue ao usuário final.** O que o
  canal faz é **N1**: consulta, 2ª via de documento existente e réplica local.
  → Checklist fechado do que destrava (E1–E5, transcritas do código):
  [runbook-canal-whatsapp.md §7](../05-operacao/runbook-canal-whatsapp.md). **E1 é execução real
  contra provedor e as credenciais Twilio/Meta não existem neste ambiente; E5 depende do Track C
  (§2.8), que está 1/3 ligado.** A decisão foi consciente: construir tudo e deixar travado.
- **⛔ O nível N3 é recusado em lista de código** (`CHANNEL_HARD_DENY`, 10 chaves): todos os
  cancelamentos, os três CDF, `manifest.receive_with_receipt`, `manifest.create_from_payload`,
  `manifest.create_draft` e `replicate_manifest` direto. Nenhum `PATCH` do AI Control Center fura: as
  duas listas são disjuntas e a invariante **falha no import** se alguém relaxar.
- **✅ A armadilha silenciosa do `manifest.create_draft` foi FECHADA.** Ela era a única chave das duas
  tabelas de default de código com `requiresConfirmation: false` + `isAction: true`: sem confirmação
  ela nunca produz um turno `blocked / CONFIRMATION_REQUIRED`, que é de onde sai o ticket do canal —
  então, no dia em que saísse de `CHANNEL_HARD_DENY`, seria a única ação a executar na **primeira
  mensagem, sem código nenhum**. Estava contida apenas pela recusa de canal: segunda tranca numa
  porta cuja fechadura estava errada. Agora é `confirmedActionIntentPolicy('R2')` (o `R1` caiu junto
  — `handleManifestCreateDraft` chama o mesmo `createManifest` que grava linha, e R1 é "lê sem
  alterar estado"), e a invariante ficou presa por
  `assertEveryActionRequiresConfirmation()`, executada **no import** sobre as **duas** tabelas.
  > ⚠️ **Procedência:** verificado na branch `sicat/wa-u3-policy-confirm` (commit `ba404b9d`,
  > **PR #296**), que **ainda não estava mesclada em `sicat/whatsapp-channel`** quando este parágrafo
  > foi escrito. Na cadeia consolidada, `assertEveryActionRequiresConfirmation` ainda não existe.
  > Confira antes de citar como entregue.
  > ℹ️ **Reconferido em 2026-08-08 na árvore consolidada:** `manifest.receive_with_receipt` e
  > `manifest.create_from_payload` **continuam em `CHANNEL_HARD_DENY`** e **não** estão em
  > `WHATSAPP_ELIGIBLE_ACTIONS` (`whatsapp-action-eligibility.ts:54–94`). Recebimento e criação por
  > WhatsApp **não** são elegíveis, nem como N2. Documento que disser o contrário está adiantado em
  > relação ao código.
- **⛔ Recusas registradas:** URL assinada / rota pública de download de documento; caminho de
  `sendTemplate` fora da janela de 24 h; download de mídia recebida (o `mediaId` da Meta é
  preservado, resolver a URL ficou para quando houver consumidor).
- **✅ Entrega de arquivo LIGADA por default** (`WHATSAPP_MEDIA_DELIVERY_ENABLED=true` — decisão do
  operador, O8). `false` reverte por env, sem código. Política ligada não é promessa: só o provedor
  Meta aceita bytes, e cada degradação tem rótulo próprio na métrica
  `sicat_channel_outbound_notice_total` (`skipped_media_disabled` = política,
  `skipped_media_provider_unsupported` = provedor sem bytes com warn mascarado,
  `skipped_media_over_cap` = acima do teto de itens, `skipped_media_oversize` = arquivo grande).
- **🕓 O canal está INERTE no cluster.** `WHATSAPP_PROVIDER` tem default `disabled` (nenhum job de
  canal é criado; o webhook responde 404) e `WORKER_LANE` ausente resolve para `all`. O manifesto
  `k8s/backend.yaml` que cria a raia dedicada `sicat-worker-channel` **está retido, não commitado**
  (+208 linhas) — sob Argo com `selfHeal: true`, commitá-lo **é** aplicá-lo. **Não ligar
  `WHATSAPP_PROVIDER` sem esse Deployment no ar.**
- **🕓 A migration `020` nunca foi aplicada** em banco nenhum; o DDL não foi exercitado. Aplicá-la
  exige rollout escalonado (api Ready → depois worker), porque `runMigrations` não tem advisory lock.
- **🕓 O seed do catálogo RBAC nunca rodou** contra este Postgres, e o gate está previsto para subir
  em `CONVERSATION_PERMISSION_ENFORCEMENT=observe` — decide igual e **permite mesmo assim**,
  registrando `would_deny`. O regime só fecha com o flip, e o flip tem passo 0 bloqueante e manual.
  ⚠️ A linha `observe` está **no diff retido, não no git**: commitar só a raia sobe os três pods em
  `enforce`.
- **🕓 O fluxo ponta a ponta nunca foi executado** — enviar OTP de verdade e confirmar depende de
  credenciais de provedor, que não existem no ambiente.
- **⚠️ Sem coalescing**: 3 mensagens seguidas = 3 turnos = 3 chamadas de LLM (contido pelo teto por
  vínculo).
- **⚠️ Rate limit em memória** — correto para 1 réplica com `Recreate`; vira contagem por réplica se
  escalar.
- **⚠️ Cartão e lista de job não identificam a entidade** — o renderer é declaradamente puro, sem
  acesso a repositório.
- **⚠️ Usuário inativo no canal** cai como exceção técnica; a correção foi implementada e
  **revertida** (exigia `findSicatUserById` no seam e derrubava 33 testes de canal sem relação com
  RBAC).
- **⚠️ `cdf.download` não virou chave própria** (fase 4.6) — risco nomeado e aceito para não fazer
  dois estreitamentos sobre gente real no mesmo flip.

**Ativação:** [runbook-canal-whatsapp.md](../05-operacao/runbook-canal-whatsapp.md) — sequência
numerada, pontos de não-retorno, como desligar e a lista **canônica** de decisões pendentes do
operador.

### 3.2 ⚠️ DMR — gateway real (envio remoto à CETESB)

O fluxo declaratório base está IMPLEMENTADO (§2.1); o envio remoto permanece **pendente de captura
HAR DMR** — ação humana. O bloco DMR do gateway segue como stub `DMR_GATEWAY_PENDING_HAR`.

### 3.3 ⚠️ MTR provisório — captura HAR dedicada

Entregue com base nos HARs existentes (`gerar_mtr`, `imprimir_mtr`, `cancelar_mtr`) — decisão Caminho
A+. HARs específicos reforçariam a evidência de `tipoManifesto = 2` (R3-C), mas **não bloqueiam**.
O wizard guiado de criação foi resolvido pela cadeia `mtr-provisorio-wizard-frontend`.

### 3.4 ⚠️ Recebimento e CDF reais E2E

Caminho autenticado provado para `GET /v1/cdf/certificates`; `manifest.receive` e `cdf.generate`
reais permanecem sem prova E2E recente **por serem operações mutáveis na CETESB** — não se dispara
operação irreversível para gerar evidência cega.

### 3.5 ⚠️ Streaming NDJSON ao vivo de jobs novos

`GET /v1/jobs/:jobId/events` provado com job terminal; falta evidência ao vivo de job novo sem
disparar operação remota mutável.

### 3.6 ⚠️ Dívida de contrato e de ferramental (achados da fase 7)

- **~44 operações ainda fora do OpenAPI**: as ~40 de `/v1/ai-control/*` e 4 de
  `/v1/health/jobs/{active,dlq}/...`.
- **`npm run gen:operations` não fecha o lockstep sozinho.** Ele escreve
  `src/generated/operations.js`; o arquivo que o TypeScript consome é `operations.ts`, produzido por
  `scripts/sync-operations-ts.mjs`, que **não está em nenhum script do `package.json`**. Rodar só o
  `gen:operations` deixa o `.ts` **stale em silêncio**. Hoje os dois estão sincronizados (104 = 104)
  porque a fase 7 rodou o segundo explicitamente — nada garante isso.
- **`npm run test:contract` estava VERMELHO** antes desta fase, por caminho que ficou para trás no
  refactor de monorepo (`266849cd`): `examplesDir` resolvia `backend/examples`, pasta inexistente
  desde que `examples/` foi para a raiz do workspace. Corrigido na fase 7 (ancorado em
  `import.meta.url`): era 4 testes / 2 pass / 2 fail, ficou **13 pass / 0 fail**.
- **`npm run validate:md-links` cobre 8 arquivos, não 817.** Mesma classe de quebra: o script usa
  `process.cwd()` e o `package.json` que o expõe é o do `backend/`, então ele varre
  `backend/docs/` e **não enxerga `apps/sicat/docs/`**. Rodando com `cwd = apps/sicat`, o resultado
  hoje é **410 links quebrados** (excluindo `node_modules`), quase todos `../../src/...` — o mesmo
  refactor de monorepo. **Pré-existente**; os 11 deste arquivo e o 1 do `PROXIMO_PROMPT.md` foram
  corrigidos nesta fase, o resto está aberto.
- **Nenhum gate de CI cobre nada disso.** `.github/workflows/ci-apps.yml` roda para sicat apenas
  `lint test:unit:frontend build:frontend` — sem `typecheck`, sem `npm test` do backend, sem
  `validate:openapi`, sem `test:contract`. **A regra contract-first não tem barreira automatizada.**
- **`createGeneratedRouter`** (`src/routes/generated-routes.ts`) é **código morto** — não é montado
  em `app.ts`.
- **`$ref: '#/components/responses/Problem'` declara `application/json`** enquanto o
  `errorHandlerMiddleware` manda `application/problem+json` — dívida herdada em operações antigas.
- **`POST /v1/conversations/feedback` tem dois envelopes de erro 400** (um `{error:{code,message}}`
  à mão, um `problem+json`). Ambos documentados; homogeneizar é mudança de comportamento.

### 3.7 Follow-ups de estabilidade (herdados)

> ⚠️ Esta seção era a **§3.1** até 2026-08-08; docs antigos que apontavam para
> `#31-follow-ups-de-estabilidade` foram reapontados para `#37-follow-ups-de-estabilidade-herdados`.

A cadeia "Opção A" do `PROXIMO_PROMPT.md` anterior (`mtr-provisorio-wizard-smoke-cleanup`)
**nunca rodou**. Seguem abertos:

- **INC-WIZARD-01** — `getByRole('option')` no smoke do wizard MTR provisório, mas o
  `FilterableDropdown.vue` renderiza `<button class="filterable-dropdown-option">` sem `role`.
- **INC-WIZARD-02** — cenário `PAYLOAD_INVALID` legado não migrado para o fluxo wizard.
- **F4** — flake `test:integration` 1/124, não reproduzível.
- **AUD-09** — flake `audit.spec.ts:267` sob full-suite paralela (10/10 em isolado).
- **F2/F3** — Playwright e chunks Vite, pré-existentes.
- **HAR DMR** — destrava `dmr-gateway-real`; ação humana.

### 3.8 ⚠️ Cobertura de teste declarada inexistente (escrita, não fingida)

- **`unmetered` no débito de saída** — o ramo autoriza (é teto de custo, não de autorização) e segue
  sem cobertura; precisa de double que implemente `consumeChannelVerificationSend`.
- **F9** (regeneração do id de sessão) e **F12** (chave do rate limit) — confirmadas por mutação
  sobrevivente; ambas exigem harness que não existe.
- **5 testes pendentes da remediação da 4.5** (código corrigido, evidência devida): grant de piso
  expirado; papel próprio vazio → `{manifest.read}`; `resolveChannelPrincipal` chamando
  `listPermissionKeysByUserId` com o `userId` do vínculo; `issueTokenPair` concedendo o piso;
  `permissionShortfall` no `resultPayload`.
- **Nenhum teste executa o SQL do seed** contra um Postgres — os testes afirmam sobre *strings*.
- **Sem teste de integração contra Postgres** para as guardas SQL da fase 2 — são protegidas por
  testes de nível de fonte (comparação do `where` normalizado + alinhamento placeholder↔array). Mata
  as mutações conhecidas, mas é proxy.
- **Revalidação Fable 5 sobre a árvore consolidada** — recomendação do próprio sintetizador, não
  executada.

### 3.9 ⚠️ Vertical Transporte — Fase A backend CONCLUÍDA (PR-A1..A6); frontend mínimo (Onda 1.5, PR-F1) entregue ATRÁS DE FLAG; Fase B (piso mínimo) entregue em MODO SHADOW (PR-B1); Fase C partes 1-2 (verificação RNTRC + ciclo do CIOT) entregues (PR-C1, PR-C2); Fase D (VPO) entregue com cadastro configurável de fornecedoras (PR-D1)

Bounded context novo, separado do ambiental (DL-103; programa em
[`../30-transporte/transporte-guia.md`](../30-transporte/transporte-guia.md)). O PR-A1 entregou a
fundação: catálogo regulatório temporal (migrations
[`021`](../../backend/src/sql/021_transporte_regulatory_catalog.sql) +
[`022`](../../backend/src/sql/022_transporte_freight_floor_catalog.sql)), seed idempotente das 26
regras TR-* ([`regulatory-rules-seed.ts`](../../backend/src/bootstrap/regulatory-rules-seed.ts),
todas `blocking=false` — promoção exige revisão humana, travada em DDL), repositório de consulta
temporal ([`regulatory-repo.ts`](../../backend/src/repositories/regulatory-repo.ts)) e a categoria
`tests/regulatory/`. O PR-A2 entregou a **primeira superfície HTTP** da vertical, read-only e
síncrona (tag `Transporte - Regras` no contrato): `GET /v1/transporte/regras` (filtros `domain`/
`gate`/`implementationState` + resolução temporal por `vigenteEm`, default hoje),
`GET /v1/transporte/regras/{code}` e `GET /v1/transporte/regras/{code}/historico` — contract-first
em lockstep (OpenAPI → `examples/` → `gen:operations` + `sync-operations-ts.mjs` → rotas → testes),
rotas atrás de `sicatAuthMiddleware` ([`transporte-routes.ts`](../../backend/src/routes/transporte-routes.ts)
→ [`transporte-regras-service.ts`](../../backend/src/services/transporte-regras-service.ts), sem
ids internos no DTO; chaves RBAC adiadas — ver nota no §6 de
[`transporte-sicat.md`](../04-arquitetura/transporte-sicat.md)), cobertas por
`tests/api/transporte-regras.test.js`. 📋 Tabelas de piso criadas **vazias** por desenho
(coeficiente real só com revisão humana — pendência P3 do guia). O PR-A3 entregou o
**cadastro-base** de transportadores e veículos (migration
[`023`](../../backend/src/sql/023_transport_parties_vehicles.sql):
`transport_parties`/`transport_party_roles`/`transport_vehicles`/`transport_vehicle_links`),
tag `Transporte - Cadastros` no contrato — `POST`/`GET`/`PATCH`
`/v1/transporte/transportadores{,/{partyId}}` e `/v1/transporte/veiculos{,/{vehicleId}}`, mais o
vínculo veículo↔transportador (`/v1/transporte/transportadores/{partyId}/veiculos`), tudo síncrono
(201/200, sem job) com **tenancy obrigatória** (`integrationAccountId`, sem conta "ativa da
sessão" — o chamador informa explicitamente, molde `manifest-service.listManifests`) e locking
otimista por `version` (409 em conflito). Validação declaratória de CNPJ/CPF (dígito verificador
completo) e placa (formato antigo e Mercosul) em
[`transport-party-validator.ts`](../../backend/src/lib/validators/transport-party-validator.ts).
**SEM verificação externa**: os campos `rntrc*` guardam o estado DECLARADO pelo operador — a
regularidade via ANTT (`/regularidade`/`/verificar`) é Fase C. Cobertura em
`tests/unit/transport-party-validator.test.js` e `tests/api/transporte-cadastros.test.js`
(inclui teste de isolamento entre contas). O PR-A4 entregou o **agregado central**
`TransportOperation` (migration
[`024`](../../backend/src/sql/024_transport_operations.sql):
`transport_operations`/`transport_operation_parties`/`transport_operation_vehicles`/
`transport_operation_cargo`/`transport_operation_routes`) e a **máquina de estados explícita**
(13 estados, 23 transições — [`transport-state-machine.ts`](../../backend/src/lib/transport/transport-state-machine.ts),
módulo puro, zero I/O). Draft mínimo exige só `route` (origem/destino:
município + UF) e `cargoRegime` — partes/veículos/carga são opcionais nesta fase. Frete sempre
**DECOMPOSTO** (`offeredAmount`/`contractedAmount`/`floorAmount`/`tollAmount`/`vpoAmount`/
`otherComponentsAmount`/`totalContractValue` — VPO nunca somado ao frete). `party_snapshot`/
`vehicle_snapshot` congelam parte/veículo no momento do vínculo
([`transport-operation-repo.ts`](../../backend/src/repositories/transport-operation-repo.ts)).
`PATCH` nunca muta `status` diretamente (422 `TRANSPORT_STATUS_IS_COMMAND_DRIVEN`) e só é
permitido em `draft`/`blocked` (409 `TRANSPORT_OPERATION_NOT_EDITABLE`); as transições fazem
compare-and-swap por `status`+`version` no repositório. Centro Operacional estendido
(`TRANSPORT_OPERATION_OPERATIONAL_STATUS_REGISTRY` em
[`operational-status.ts`](../../backend/src/lib/operational-status.ts)). Cobertura em
`tests/unit/transport-state-machine.test.js` (matriz exaustiva 13×13),
`tests/unit/transport-operation-validator.test.js` e `tests/api/transporte-operacoes.test.js`.

O PR-A5 entregou o **motor de compliance** (migration
[`025`](../../backend/src/sql/025_transport_compliance.sql):
`compliance_evaluations`/`compliance_checks`/`compliance_evidence`, as três tabelas **APPEND-ONLY**
por desenho — sem coluna `version`, sem `update`/`delete` no código; reprodutibilidade/auditoria,
NFR-0009/0010) e a **ATIVAÇÃO** das transições guardadas declaradas desde o PR-A4.
`TransportComplianceService` ([`transport-compliance-service.ts`](../../backend/src/services/transport-compliance-service.ts),
worker-callable — recebe `correlationId`/`evaluatedBy` explícitos, nunca lê `req`) resolve as
regras do gate vigentes na `referenceDate` (`regulatory-repo.listRulesWithVersionAt`) → evaluator
PURO por `ruleCode` ([`rule-evaluators.ts`](../../backend/src/lib/transport/rule-evaluators.ts): 10
regras com evaluator Fase A — `TR-RNTRC-001`, `TR-PMF-001..004`, `TR-PAY-001`, `TR-VPO-001`/`003`,
`TR-CIOT-004`, `TR-COMP-001` —, as demais 16 devolvem `not_applicable`
`EVALUATOR_NOT_IMPLEMENTED`, não é erro) → **clamp de enforcement**
(`applyEnforcementClamp`, função pura: um `block` só sobrevive quando a versão da regra está
`ACTIVE` + `blocking=true` — o par que a migration 021 trava em DDL com revisão humana; qualquer
outro caso vira `warn` com `rawStatus=block` e `reasonCode=RULE_NOT_ENFORCEABLE`, motivo original
preservado em `result_snapshot`) → persiste avaliação + checks + evidências numa transação
([`transport-compliance-repo.ts`](../../backend/src/repositories/transport-compliance-repo.ts)).
**Como o seed nasce 100% `blocking=false`** (regra de ouro do PR-A1), nenhum `block` sobrevive ao
clamp com o catálogo real — `submeter-validacao` SEMPRE aprova na Fase A; o caminho `blocked` só é
demonstrável forçando uma versão no banco (coberto por teste dedicado, não pela operação normal).
`submitTransportOperationValidation` passou a ORQUESTRAR: `draft --submit_validation-->
validating` (CAS) seguido da avaliação de `GATE_PROPOSAL` e, no mesmo request,
`--approve_validation--> ready_for_contract` ou `--reject_validation--> blocked`
(`blockedReasonCode` = motivo do primeiro check bloqueante); transição composta deliberada — se a
avaliação falhar de forma inesperada após o primeiro CAS, a operação fica retida em `validating`
(`reabrir`/`cancelar` resolvem). Três rotas NOVAS na tag `Transporte - Operações`:
`POST .../contratar` (ativa `GATE_CONTRACT`; `contractedAmount` opcional atualiza
`freight.contractedAmount` ANTES do gate; 409 `TRANSPORT_GATE_BLOCKED` em bloqueio) e
`POST .../reabrir` (`blocked → draft`, transição sem gate que faltava rota desde o PR-A4) — e duas
na tag NOVA `Transporte - Conformidade`: `POST .../validar-conformidade` (avaliação ad-hoc de UM
gate, `triggeredBy=user`, sem transição) e `GET .../conformidade` (overview: última avaliação de
cada um dos 8 gates, leitura pura do histórico). `overallStatus`/`status` dos checks em
MAIÚSCULO no contrato (`PASS`/`WARN`/`BLOCK`/`NOT_APPLICABLE`) — conversão isolada no service, o
motor/banco usam minúsculo. `availableCommands` do agregado já refletia dinamicamente os comandos
de gate desde o PR-A4 (fase 'A' já incluía `approve_validation`/`reject_validation`/`contract` no
grafo) — nenhuma mudança adicional foi necessária ali. Cobertura em
`tests/unit/rule-evaluators.test.js` (35 casos, um por evaluator + registro completo dos 26
codes), `tests/unit/transport-compliance-clamp.test.js` (clamp isolado) e
`tests/api/transporte-conformidade.test.js` (skip-if-no-DB: ciclo feliz completo, append-only,
fronteira temporal 23/24-05-2026 refletida em `TR-CIOT-001`, tenancy A×B, e o caminho `blocked`
com versão forçada `blocking=true`+revisada, restaurada em `finally`).

O PR-A6 (último PR backend da Fase A) consolidou `tests/regulatory/` como categoria de primeira
classe e fechou a documentação da fase. Fixtures temporais reaproveitáveis em
`tests/fixtures/regulatory/`: `operation-aggregates.js` (agregados TAC lotação, ETC fracionada,
CTC subcontratada e rascunho incompleto), `rule-version-fixtures.js` (versão futura, revogada e o
par antes/depois estilo `TR-CIOT-001`) e `fixtures-manifest.json` (mapeia toda `(code,
version_label)` do seed real a um trio `{before, on, after}`). Cinco **META-GUARDAS** —
testes que codificam POLÍTICA DE ENGENHARIA do programa, não comportamento de uma função isolada —
em `tests/regulatory/rule-catalog-invariants.test.js`: (1) nenhuma versão `ACTIVE+blocking=true`
sem `reviewed_by`/`reviewed_at` (`[LEGAL REVIEW REQUIRED]`); (2) todo `ruleCode` do seed tem
evaluator OU pendência declarada (`RULES_WITHOUT_EVALUATOR_YET`), união exata dos 26 codes, sem
sobreposição nem entrada órfã; (3) toda `RegulatoryRuleVersion` do seed tem fixture de fronteira
temporal no manifesto — o teste VALIDA o manifesto contra o seed, não o contrário; (4) o seed jamais
insere em `freight_floor_versions`/`freight_floor_coefficients` (piso só entra com revisão humana,
pendência P3); (5) rede de segurança EM MEMÓRIA (implementação deliberadamente independente de
`resolveVersionFromList`) contra vigências sobrepostas na mesma regra.
`tests/regulatory/compliance-gates.test.js` cobre a matriz gate×regra×resultado dos 8 gates contra
os agregados de fixture e prova, aplicando `applyEnforcementClamp` com as versões REAIS do seed,
que **nenhum status final é `block`** — a regra de ouro da Fase A, agora em teste automático.
`tests/regulatory/freight-floor-applicability.test.js` cobre a aplicabilidade DECLARADA do piso
(`TR-PMF-001..004`, sem cálculo — `FreightFloorEngine` é Fase B) e já deixa fixture pronta para o
contrato futuro (piso calculado → pass/block por comparação). `effective-dates.test.js` ganhou a
fronteira 05/06/07-08-2026 (Lei 15.485/2026: `TR-CIOT-003/004`, `TR-PAY-001`, `TR-COMP-001`) e um
teste de integração time-travel dedicado (`tests/regulatory/time-travel-integration.test.js`,
skip-if-no-DB): a MESMA operação avaliada via `evaluateGateService` em `referenceDate` 2026-08-05
vs. 2026-08-07 muda `TR-CIOT-004` de `NOT_APPLICABLE`/`RULE_NOT_YET_EFFECTIVE` para avaliação de
verdade (`pass`), provando a fronteira ponta a ponta contra o Postgres, não só na resolução pura.
Nenhuma inconsistência real encontrada pelos meta-guardas no seed/evaluators existentes — os cinco
passaram de primeira contra o catálogo real. **Fase A backend: completa.**

O PR-F1 (Onda 1.5, frontend mínimo) entregou a validação VISUAL do motor de compliance —
**backend intocado neste PR**. Bounded context novo em `frontend/src/views/transporte/` (par
lista+detalhe + regras, molde `mtr-provisorio`): `TransporteOperacaoListView.vue` (lista paginada
server-side, filtro por status), `TransporteOperacaoDetailView.vue` (resumo + frete DECOMPOSTO em
grid + **painel de conformidade**: um `SicatCard` por gate dos 8, badge do `overallStatus`
(domínio novo `compliance` em `lib/status-map.js`) e cada check como `SicatInlineAlert`
mostrando `ruleCode`/`humanMessage`/`reasonCode`/base legal e o `rawStatus` quando o clamp mudou o
resultado; botões de comando só para os 4 com rota HTTP na Fase A — Submeter validação/Contratar/
Reabrir/Cancelar (cancelar exige motivo, capturado antes do `useConfirmDialog`); botão "Revalidar
conformidade" por gate chama `validar-conformidade` ad-hoc) e `TransporteRegrasView.vue` (read-only,
filtros domínio/gate/`vigenteEm`, `SicatHelpHint` no termo CIOT). Store única `transporteStore.js`
(molde `mtrProvisorioStore`) — filtros persistidos, `integrationAccountId` resolvido de
`useAuthStore` (mesma tenancy do resto do app; NENHUMA tela nova de "conta de transporte"). Service
fino `transporteService.js` reexportando de `api.js` (seção nova, sem `Idempotency-Key`: nenhuma
rota de transição/conformidade usada aqui declara o header no contrato). Três domínios novos em
`lib/status-map.js`: `transport-operation` (13 estados), `compliance` (PASS/WARN/BLOCK/
NOT_APPLICABLE — contrato em MAIÚSCULO, `normalizeKey` faz o lowercase) e `ciot` (vocabulário
mínimo da Fase C, sem tela ainda). Grupo de menu "Transporte" (`config/navigation.js`, antes do
grupo "Assistente") e as 3 rotas `/transporte/*` (`router.js`, ANTES do catch-all) **NÃO declaram
`personas`** — a vertical é de operador, sem o mapeamento generator/carrier/receiver do MTR
ambiental. Tudo atrás da PRIMEIRA feature flag do frontend, `VITE_FEATURE_TRANSPORTE`
(`lib/feature-flags.js`, default DESLIGADA): grupo de menu oculto (`hidden` a nível de GRUPO,
suporte novo em `filterNavigationGroups`) e guard de rota dedicado (`meta.featureFlag: 'transporte'`
no `router.beforeEach`, com aviso via `queueRouteDenialNotice`/novo
`ROUTE_DENIAL_REASONS.FEATURE_FLAG` — bloqueia também por URL direta). Cobertura:
`status-map.test.js` estendido, `transporte-ui-helpers.test.js`, `feature-flags.test.js`,
`route-denial-notice.test.js` estendido — `297` testes de `tests/unit` verdes; `router-persona-
routes.test.js`/`delivery-and-routes-contract.test.js` seguem verdes sem alteração de asserção
(rotas de Transporte não entram nas listas fechadas desses testes, por desenho). `npm run
build:frontend` verde (com a flag ligada e desligada). Smoke `tests/ui/transporte-smoke.spec.ts`
escrito (lista → detalhe → painel de conformidade visível) mas NÃO EXECUTADO neste ambiente — sem
browsers do Playwright instalados (`ms-playwright` ausente; instalar exigiria baixar binário grande,
fora do escopo autorizado desta sessão).

O PR-B1 (Fase B, Onda 2) entregou o **`FreightFloorEngine`** em MODO SHADOW — cálculo real do piso
mínimo, mas nada aqui torna TR-PMF-002/003 bloqueantes por si só (o seed segue 100%
`blocking=false`). Migration [`026`](../../backend/src/sql/026_transport_freight_floor_calculations.sql)
cria `freight_floor_calculations` (append-only, mesmo racional de `compliance_evaluations`): UM
registro por tentativa de cálculo, com `outcome`
(`calculated|not_applicable|missing_coefficients|missing_inputs`), snapshot dos insumos e trace
completo da fórmula. Motor PURO em
[`freight-floor-engine.ts`](../../backend/src/lib/transport/freight-floor-engine.ts)
(`calculateFreightFloor`: `minimum = CCD*km + CC`, arredondamento HALF-UP robusto a erro de ponto
flutuante; `decideFreightFloorOutcome`: árvore de decisão pura que resolve os 4 outcomes a partir
de dados JÁ RESOLVIDOS pelo chamador — testável sem banco) + `mapCargoTypeToFloorSlug` (cargoType
livre do operador → 1 dos 11 slugs canônicos da Tabela A, ou `null`) +
`resolveFloorTableCodeForCargoRegime` (só `lotacao` resolve tabela nesta fase) +
`sumAxlesFromVehicles` (soma `axlesCount` dos veículos vinculados). Coeficientes REAIS da
**Tabela A da Res. ANTT 6.084/2026** (carga lotação), transcritos da fonte oficial em
[`reference-data/freight-floor/res-6084-2026-tabela-a.json`](../../backend/reference-data/freight-floor/res-6084-2026-tabela-a.json)
(11 cargoTypes × eixos = 75 linhas, 150 coeficientes) — carregados por um script **MANUAL** do
operador, `npm run load:freight-floor`
([`scripts/load-freight-floor-tables.js`](../../backend/scripts/load-freight-floor-tables.js)):
valida shape, calcula `source_hash` (SHA-256), faz upsert por `(normative_reference, table_code)`
SEMPRE como `review_status='pending_review'` (ABORTA sem rebaixar se a versão já está `reviewed`),
substitui os coeficientes na mesma transação — idempotente (rodar 2x = mesmo estado). **NUNCA**
roda no boot: a meta-guarda 4 de `tests/regulatory/rule-catalog-invariants.test.js` (PR-A6) segue
verde, provando que o seed regulatório continua sem tocar `freight_floor_versions`/
`_coefficients`. `freight-floor-service.ts` orquestra: carrega o agregado → resolve `tableCode`
pelo `cargoRegime` → resolve a versão de tabela VIGENTE na `referenceDate`
(`freight-floor-repo.ts`, reaproveitando `resolveVersionFromList` do catálogo regulatório) →
resolve o par de coeficientes → decide/calcula (puro) → persiste (append-only) → quando
`outcome=calculated`, atualiza `freight.floorAmount` do cabeçalho (locking otimista). Três rotas
NOVAS na tag `Transporte - Piso Mínimo`: `POST .../operacoes/{id}/calcular-piso` (síncrono, corpo
`{integrationAccountId, version, referenceDate?}`), `GET .../operacoes/{id}/calculos-piso`
(histórico paginado, prova o append-only) e `GET /v1/transporte/piso/tabelas` (admin read-only,
catálogo GLOBAL sem tenancy — `reviewStatus`, contagem de coeficientes, `sourceHash`, SEM id
interno). Evaluators TR-PMF-002/003/004 (`rule-evaluators.ts`) EVOLUÍRAM: `RuleEvaluatorContext`
ganhou `floorCalculation` (o cálculo mais recente da operação, carregado UMA vez por avaliação em
`transport-compliance-service.ts` via `findLatestFreightFloorCalculationForOperation`) —
TR-PMF-002/003 agora, quando `offered/contracted >= floor`, checam o `reviewStatus` da tabela usada:
`pending_review` rebaixa o que seria `pass` "limpo" para `warn FLOOR_TABLE_PENDING_REVIEW` (dado
ainda não conferido contra o DOU); TR-PMF-004 passou de "sempre warn" (Fase A, tabela
estruturalmente vazia) para verificar de verdade se o cálculo mais recente usou a versão vigente na
`referenceDate` (`pass`/`warn FLOOR_TABLE_PENDING_REVIEW`/`warn FLOOR_VERSION_UNAVAILABLE`). O
clamp de enforcement (`applyEnforcementClamp`, inalterado) continua rebaixando qualquer `block`
bruto de TR-PMF-002/003 para `warn` — confirmado por teste de integração: oferta abaixo do piso
calculado produz `overallStatus` no máximo `WARN`, nunca `BLOCK`, no `GATE_PROPOSAL`. Seed aditivo
(`regulatory-rules-seed.ts`): duas fontes normativas novas (`Res. ANTT 6.076/2026`, metodologia;
`Res. ANTT 6.084/2026`, tabelas) e `legal_basis` de TR-PMF-002/003/004 (v2026-08-baseline)
ampliado para citá-las — meta-guardas do catálogo seguem verdes. Cobertura: aritmética exata com os
coeficientes reais e a árvore de decisão pura em `tests/unit/freight-floor-engine.test.js` (29
casos, sem banco); `tests/regulatory/freight-floor-engine.test.js` (skip-if-no-DB): loader real
contra o banco de teste (idempotência inclusive), cálculo end-to-end (`carga_geral`/6 eixos/850km
→ `6923.43`, `displacementCoefficient=7.3547`, `loadUnloadCoefficient=671.93`), efeito shadow nos
evaluators e time-travel (`referenceDate` antes da vigência de 17/07/2026 →
`FLOOR_VERSION_UNAVAILABLE`); `tests/regulatory/freight-floor-applicability.test.js` estendido com
os novos ramos `floorCalculation`.

O PR-C1 (Fase C parte 1, Onda 3) entregou a **verificação de regularidade RNTRC** — primeiro
gateway externo REAL e primeiro job type assíncrono (202) da vertical. Migration
[`027`](../../backend/src/sql/027_transport_rntrc_verifications.sql) cria `rntrc_verifications`
("append-only" no sentido de `compliance_evaluations`/`freight_floor_calculations`: cada
TENTATIVA de verificação é uma linha nova, nunca reaberta; a única mutação permitida é a transição
`pending → succeeded|failed`, via `requested_status = 'pending'` no `WHERE`). Gateway
[`antt-rntrc-gateway.ts`](../../backend/src/gateways/antt-rntrc-gateway.ts) (TS — só
`cetesb-gateway.js` é a exceção JS, DL-093) integra com o Portal de Dados Abertos da ANTT
(`dados.antt.gov.br`, CKAN público, dataset `"rntrc"`); sondagem real de 14/08/2026 confirmou o
contrato: `package_show` devolve ~70 resources mensais com `datastore_active` por resource;
`datastore_search` com `filters` EXATO (documento precisa da máscara `XX.XXX.XXX/XXXX-XX`, digits
puros dá `total: 0`) devolveu o registro certo (`total: 1`); no dia da sondagem o resource do mês
CORRENTE tinha `datastore_active=false` (só os ~4 meses anteriores no datastore) — o gateway então
cai para download STREAMING do CSV (`;`-delimitado, `latin1`, datas `DD/MM/AAAA`), cacheado em
`STORAGE_DIR/rntrc-open-data/` por id do resource (muda todo mês, cache nunca serve dado velho).
`situacao_rntrc` só assume `ATIVO`/`PENDENTE` no dado publicado (sem `SUSPENSO`/`CANCELADO`/
`VENCIDO`) — por isso `not_found` no dado aberto NUNCA prova irregularidade, só ausência DESTE
dado; é a base do racional "cache informativo" (pendência P4 do guia). Modo `mock` (default,
`RNTRC_GATEWAY_MODE`) determinístico para testes: documento terminado em dígito par → `active`/
`ETC`; ímpar → `not_found`. Fluxo: `POST /v1/transporte/transportadores/{partyId}/verificar-rntrc`
com `strategy: 'manual'` (evidência declarada, SÍNCRONO — grava e atualiza o party no mesmo
request, `200`) ou `strategy: 'open_data'` (ASSÍNCRONO — enfileira `transporte.rntrc.verify`,
idempotente via `Idempotency-Key`, `202` `CommandAccepted`; `strategy: 'antt'` reservada, `400`).
Worker handler (`operation-handlers.ts`) SEM parâmetro `gateway` — molde
`handleWhatsAppInboundMessage`, dependências por import direto — cria a linha `pending` ANTES de
chamar o gateway (persiste `verificationId` no `payload` via `patchJobPayload`, injetado, não
importado direto de `workers/`), audita CADA troca externa (`insertAuditEntry`, `component:
'antt-rntrc-gateway'`, outbound+inbound por exchange) e atualiza `transport_parties`
(`rntrcStatus`/`rntrcCategory`/`rntrcVerifiedAt`/`rntrcVerificationSource='open_data'`, locking
otimista) numa transação com a conclusão da verificação. Falha TERMINAL (DLQ/failed) reconciliada
por `applyTransporteRntrcVerifyTerminalFailureSideEffect` (par simétrico de
`applyWhatsAppInboundTerminalFailureSideEffect`, registrado em `job-runner.ts`): marca a linha
`pending` como `failed` com o último erro, **sem tocar o party**. `lib/retry.ts` ganhou
`transporte.rntrc.verify` (prioridade 4, 4 tentativas exponencial 5s→120s) — erros do gateway
carregam `.status` HTTP real (`RNTRC_GATEWAY_TIMEOUT`/`NETWORK_ERROR` → 502/504, retryable;
4xx definitivo do CKAN → não retryable, classificação genérica por status já cobre isso).
`entityType 'transport_party'` entrou no ternário de `links.entity` de `command-response.ts` e do
espelho em `job-service.ts` (→ `/v1/transporte/transportadores/{id}`). Evaluators evoluíram:
TR-RNTRC-001 (`rule-evaluators.ts`) agora considera a última verificação SUCEDIDA do carrier
(`ctx.carrierRntrcVerification`, carregado por `transport-compliance-service.ts` via
`findLatestSucceededRntrcVerificationForParty`, uma vez por avaliação) com janela de frescor de 90
dias: `active` fresco → `pass` (mensagem nota "cache informativo" quando `strategy=open_data`);
`active` stale (>90 dias) ou nunca verificado → `warn` (`RNTRC_VERIFICATION_STALE`/
`RNTRC_NOT_VERIFIED`); `suspended`/`cancelled`/`expired`/`not_found` → `block` bruto (clamp
mantém `warn` com o seed `blocking=false`). TR-RNTRC-002 (novo, saiu de
`RULES_WITHOUT_EVALUATOR_YET`) checa se o veículo de TRAÇÃO da operação tem vínculo
(`transport_vehicle_links`, `owned|leased|aggregated|rntrc_fleet`) com o carrier
(`findVehiclePartyLinkType`, novo em `transport-vehicle-repo.ts`) — sem veículo → `block`
`VEHICLE_MISSING`; sem vínculo → `warn VEHICLE_NOT_LINKED_TO_CARRIER`; vinculado → `pass`.
TR-RNTRC-003 permanece pendente (`AWAITING_REGULATION`, pendência P2). Contrato: tag nova
`Transporte - RNTRC`, `TransporteRntrcVerificar/VerificacaoResource` etc.; o endpoint de comando
entrou em `commandEndpoints` de `scripts/validate-openapi.js` e do teste gêmeo
`openapi-queue-contract.test.js`. Cobertura: `tests/unit/antt-rntrc-gateway.test.js` (mock
determinístico + parse do shape real via fixture `tests/fixtures/regulatory/antt-open-data-sample.json`,
dados fictícios/minimizados — LGPD; erros tipados e sua retryability), `tests/worker/
transporte-rntrc-verify.test.js` (skip-if-no-DB: sucesso/not_found/falha de rede fim-a-fim contra
`processJob`, com `fetch` monkeypatchado nunca a rede real), `tests/api/transporte-rntrc.test.js`
(202 + dedupe, manual 200, histórico paginado, tenancy, 401) e `tests/unit/rule-evaluators.test.js`
estendido (TR-RNTRC-001 frescor/estratégias, TR-RNTRC-002 completo). `tests/api/
transporte-conformidade.test.js` ajustado: o carrier de setup nunca passou por
`verificar-rntrc`, então TR-RNTRC-001 no ciclo `contratar` passou de `PASS` (comportamento antigo,
baseado só no `rntrcStatus` declarado) para `WARN RNTRC_NOT_VERIFIED` (comportamento correto agora)
— não bloqueia o fluxo, só o reasonCode mudou.

O PR-C2 (Fase C parte 2, Onda 3) entregou o **ciclo completo do CIOT** com PROVEDOR ABSTRAÍDO —
pré-validação → solicitação → registro → retificação → cancelamento → encerramento, com rejeição/
bloqueio, e o padrão **DL-102 replicado** (não reaproveitado do MTR — bounded context próprio)
DESDE O INÍCIO. NÃO existe provedor CIOT contratado ([EXTERNAL DEPENDENCY] P5): migration
[`028`](../../backend/src/sql/028_transport_ciot.sql) cria `ciot_operations` (`version`+trigger,
UMA linha por TENTATIVA — rejeição nunca reescreve, um novo `solicitar` cria linha nova) e
`ciot_events` (append-only, trilha completa do ciclo). Gateway
[`ciot-provider-gateway.ts`](../../backend/src/gateways/ciot-provider-gateway.ts) só implementa
`mode: 'mock'` (`CIOT_PROVIDER_MODE`, default) — sandbox determinístico e STATEFUL EM MEMÓRIA POR
PROCESSO (`Map` module-level chaveado pelo marcador de correlação, para sobreviver a novas
instâncias do gateway entre retries e para o reconciliador "achar" o que uma tentativa anterior
registrou); `mode: 'real'` recusa a instância com `CIOT_PROVIDER_NOT_CONFIGURED`. Regras do mock:
freight abaixo de 100 → rejeita com `CIOT_PROVIDER_REJECTED_TEST` (não-retryable, testa o caminho
de rejeição definitiva); `testFlags.simulateLostResponse` aplica a operação no Map mas LANÇA
timeout (`CIOT_PROVIDER_LOST_RESPONSE_TEST`, retryable) — o cenário DL-102 por excelência: o
"provedor" processou, só a resposta se perdeu; retries com o MESMO marcador são IDEMPOTENTES
(nunca duplicam o registro). Marcador de correlação (`[sicat:<ciotId>]`,
[`ciot-correlation.ts`](../../backend/src/lib/transport/ciot-correlation.ts), réplica deliberada
dos princípios de `lib/manifest-correlation.ts`) gravado na CRIAÇÃO da `ciot_operations`, ANTES de
qualquer chamada. Reconciliador
[`ciot-reconciler.ts`](../../backend/src/services/ciot-reconciler.ts) (réplica de
`manifest-submit-reconciler.ts`) pergunta ao provedor via `queryCiotByMarker`, com o MESMO padrão
de polling (5 tentativas, 2s/5s/10s/15s/20s), e devolve `found|not-found-after-polling|error`
tipado. Serviço [`transport-ciot-service.ts`](../../backend/src/services/transport-ciot-service.ts)
combina a metade HTTP-facing (`preValidateCiot`/`requestCiot`/`rectifyCiot`/`cancelCiot`/
`closeCiot`/`getCiotForOperationService`) com a worker-facing (`runCiot*Job`, SEM parâmetro
`gateway` — molde `runRntrcVerificationJob`). Fluxo `solicitar`: exige `transport_operations.status`
`contracted` (aplica `request_ciot`, `GATE_CIOT`) OU `ciot_pending` (uma tentativa anterior foi
rejeitada — cria NOVA `ciot_operations` sem repetir a transição); qualquer outro status → `409
TRANSPORTE_CIOT_OPERATION_NOT_READY`. Worker `handleTransporteCiotRegister` grava o evento
`request_dispatched` ANTES de chamar o gateway (intenção persistida); sucesso confirma
`ciot_pending → ciot_registered` (`confirm_ciot`, CAS); rejeição/resposta-perdida NÃO são tratadas
no handler — propagam e são interpretadas pelo side-effect terminal
`applyTransporteCiotTerminalFailureSideEffect` (registrado nos MESMOS dois pontos de
`job-runner.ts` que os side-effects do MTR/RNTRC), que distingue `CIOT_PROVIDER_REJECTED_TEST`
(→ `rejected`, `transport_operations` PERMANECE `ciot_pending`) de qualquer outro terminal
(→ `request_unconfirmed`, NUNCA `failed`, com tentativa best-effort de enfileirar
`transporte.ciot.reconcile`). Varredura periódica própria
(`enqueueTransporteCiotReconcileSweepIfNeeded`, molde EXATO da varredura do MTR, relógio/env var
próprios, default 5 min) é a rede de segurança para reconciliações que não puderam ser enfileiradas
no momento do terminal. Cancelar o CIOT (`.../ciot/cancelar`) é um ciclo DISTINTO de cancelar a
operação — não se tocam. `entityType 'ciot_operation'` usa `entityId = operationId` (dedupe e link
por operação; o id da tentativa ativa vai em `payload.ciotOperationId`), com link explícito via o
novo parâmetro `entityLink` de `buildCommandAccepted` (`command-response.ts`) — a primeira vez que
esse builder precisou de um link que não é derivável só de `entityType`/`entityId`. `lib/retry.ts`
ganhou 5 operações (`transporte.ciot.register/rectify/cancel/close` prioridade 4, `.reconcile`
prioridade 3) e 3 códigos de erro novos (`CIOT_PROVIDER_REJECTED_TEST`/`CIOT_PROVIDER_NOT_CONFIGURED`/
`TRANSPORTE_CIOT_ALREADY_TERMINAL` não-retryable). Três evaluators novos saíram de
`RULES_WITHOUT_EVALUATOR_YET` (`rule-evaluators.ts`): **TR-CIOT-001** (obrigatoriedade — operação
remunerada sem CIOT → `warn CIOT_NOT_REGISTERED` no `GATE_CIOT`; com `registered`/`rectified` →
`pass` com a nota `REGISTERED ≠ COMPLIANT`); **TR-CIOT-002** (CIOT antes da liberação, `GATE_RELEASE`
— ausente/`unconfirmed`/`rejected` → `block` bruto `CIOT_MISSING_FOR_RELEASE`, clamp mantém `warn`
com o seed `blocking=false`); **TR-CIOT-003** (responsável declarado — `requestPayloadSnapshot.
responsibleParty`, `contractor` por default ou `subcontractor` em subcontratação, → `pass`/`warn
CIOT_RESPONSIBLE_UNDECLARED`). `ctx.ciotOperation` (a tentativa mais recente) carregado por
`transport-compliance-service.ts` via `ciot-repo.findLatestCiotOperationForOperation`, mesmo molde
de `ctx.carrierRntrcVerification`. TR-CIOT-005 (vínculo MDF-e) permanece em
`RULES_WITHOUT_EVALUATOR_YET`, Fase E. Contrato: tag nova `Transporte - CIOT`, 5 endpoints (4
comandos 202 + 1 GET) + `POST .../ciot/pre-validar` (200 síncrono); `commandEndpoints` de
`scripts/validate-openapi.js` e do teste gêmeo `openapi-queue-contract.test.js` ganharam os 4
comandos. Cobertura: `tests/unit/ciot-provider-gateway.test.js` (mock determinístico, idempotência
de retry, rejeição, resposta perdida, mode `real`), `tests/worker/transporte-ciot.test.js`
(skip-if-no-DB: register sucesso com auditoria, rejeição sem tocar a operação, resposta perdida →
`request_unconfirmed` → reconcile encontra e completa — o teste DL-102 do domínio —, reconcile
not-found → `rejected CIOT_REQUEST_NOT_FOUND_REMOTE`, ciclos de retificar/cancelar/encerrar),
`tests/api/transporte-ciot.test.js` (409 fora de `contracted`, 202 + dedupe via Idempotency-Key,
pre-validar 200, GET do ciclo, tenancy, 401). `tests/regulatory/compliance-gates.test.js` ganhou
casos dedicados para os 3 evaluators novos; `tests/api/transporte-conformidade.test.js` ajustado:
o teste de fronteira temporal de TR-CIOT-001 (23/24-05-2026) passou de `NOT_APPLICABLE
EVALUATOR_NOT_IMPLEMENTED` (comportamento antigo) para `WARN CIOT_NOT_REGISTERED` nos dois lados
(comportamento correto agora — só a `ruleVersionLabel` resolvida muda na fronteira).

O PR-D1 (Fase D, Onda 4) entregou o **VPO** (Vale-Pedágio Obrigatório, Lei 10.209/2001 + Res. ANTT
6.024/2023): VPO NÃO é checkbox universal — `VpoApplicabilityEngine`
([`vpo-applicability-engine.ts`](../../backend/src/lib/transport/vpo-applicability-engine.ts),
módulo PURO) decide `applicable: true|false|null` a partir de `route.tollExpected`/`cargoRegime`/
múltiplos embarcadores (>1 parte `shipper` OU carga fracionada → `applicable: null`
`VPO_FRACTIONAL_CARGO_REVIEW`, exceção regulatória que exige análise humana mesmo com pedágio
esperado — checado ANTES da regra "toll+lotação → applicable", precedência corrigida durante o
próprio PR depois de um teste pego a matriz completa). Migration
[`029`](../../backend/src/sql/029_transport_vpo.sql) cria `vpo_providers` (cadastro de referência
CONFIGURÁVEL, sem tenancy), `vpo_allocations` (`version`+trigger, recurso MUTÁVEL — **UMA linha por
OPERAÇÃO**, `unique(operation_id)`, ao contrário de `ciot_operations` que nasce uma linha por
TENTATIVA — decisão deliberada, a spec do PR pede "cria/atualiza") e `vpo_events` (append-only).
TODO desfecho `not_applicable` grava `applicability_reason_code` — constraint
`chk_vpoalloc_not_applicable_reason` torna a exigência "até NOT_APPLICABLE deixa justificativa"
estrutural, não convenção de código. Cadastro de fornecedoras carregado por loader MANUAL e
ADITIVO (`scripts/load-vpo-providers.js`, `npm run load:vpo-providers`, a partir de
`reference-data/vpo/fornecedoras-habilitadas.json`) — 16 fornecedoras REAIS pesquisadas em
gov.br/antt em 14/08/2026 (Sem Parar, Repom, Roadcard, Target, Move Mais, PagBem, Bradesco,
nstech, Veloe, ConectCar, Logcard, Strada Pay, NDD Tech, Extratta, AuthPay, Ailog Bank); o loader
NUNCA toca `is_active` de uma linha existente — desativar é ato manual do operador. Aquisição em
dois caminhos: `registrar-aquisicao` (síncrono, 200, evidência declarada pelo operador,
`evidenceSource=manual`) e `adquirir` (assíncrono, 202, via
[`vpo-gateway.ts`](../../backend/src/gateways/vpo-gateway.ts), só `mode: 'mock'` — nenhuma
fornecedora integrada tecnicamente, [EXTERNAL DEPENDENCY] P6; `VPO_PROVIDER_MODE=real` recusa com
`VPO_PROVIDER_NOT_CONFIGURED`); os DOIS caminhos atualizam `transport_operations.vpo_amount` via
`updateOperationById` (CAS por `version`) **NUMA transação** (`withTransaction`) com a escrita de
`vpo_allocations` — nunca somado a `freight_offered_amount`/`freight_contracted_amount`. Padrão
**DL-102 replicado** (decisão do PR-D1, NÃO reuso do CIOT — bounded context próprio,
[`vpo-correlation.ts`](../../backend/src/lib/transport/vpo-correlation.ts) +
[`vpo-reconciler.ts`](../../backend/src/services/vpo-reconciler.ts); marcador determinístico a
partir do `vpoAllocationId`, sem coluna própria — dispensável porque, ao contrário do CIOT, só
existe UMA alocação por operação): `providerReference` nasce na RESPOSTA de `acquireVpo`; resposta
perdida DEPOIS do dispatch vira `acquisition_unconfirmed` (NUNCA falha definitiva), resolvido pelo
job `transporte.vpo.reconcile` (enfileirado pelo side-effect terminal
`applyTransporteVpoTerminalFailureSideEffect` e por uma varredura periódica própria,
`enqueueTransporteVpoReconcileSweepIfNeeded`, molde EXATO da varredura do CIOT). Mock do gateway
calcula o valor do VPO a partir da distância da rota (tarifa de SANDBOX, nunca real) — sem rota/
distância válida, rejeita com `VPO_PROVIDER_REJECTED_TEST` (não-retryable; side-effect terminal
volta a alocação para `applicable`, liberando novo `adquirir`/`registrar-aquisicao` sem esperar
reconciliação — diferente do CIOT, que usa um status `rejected` dedicado porque preserva histórico
de MÚLTIPLAS tentativas). `lib/retry.ts` ganhou 2 operações (`transporte.vpo.acquire` prioridade 4,
`.reconcile` prioridade 3) e 4 códigos de erro novos (`VPO_PROVIDER_REJECTED_TEST`/
`VPO_PROVIDER_NOT_CONFIGURED`/`TRANSPORTE_VPO_ALREADY_TERMINAL` não-retryable;
`VPO_PROVIDER_LOST_RESPONSE_TEST`/`VPO_RECONCILE_QUERY_FAILED` retryable). Evaluators em
`rule-evaluators.ts`: **TR-VPO-001** EVOLUÍDO (usava só `route.tollExpected`; agora usa
`ctx.vpoAllocation` — `not_applicable` com reason → `pass` com a justificativa evidenciada;
`applicable`/`acquired` → `pass vpoRequired=true`; sem avaliação → `warn
VPO_APPLICABILITY_NOT_EVALUATED`; indeterminado → `warn`); **TR-VPO-002** NOVO (saiu de
`RULES_WITHOUT_EVALUATOR_YET` — `applicable` sem `acquired` → `block` bruto `VPO_NOT_ACQUIRED`,
clamp mantém `warn` com o seed `blocking=false`; `acquired` com `amount>0`+provider/evidência
manual → `pass`); **TR-VPO-003** EVOLUÍDO (além da separação ESTRUTURAL do campo decomposto, Fase
A, agora confere se `vpoAmount` bate com o valor efetivamente adquirido na alocação — divergência →
`warn VPO_AMOUNT_MISMATCH`). `ctx.vpoAllocation` carregado por `transport-compliance-service.ts`
via `vpo-repo.findVpoAllocationByOperationId`, mesmo molde de `ctx.ciotOperation`. Contrato: tag
nova `Transporte - Vale-Pedagio`, 5 endpoints (2 síncronos 200, 1 comando 202, 1 GET, 1 read-only
de fornecedoras); `commandEndpoints` de `scripts/validate-openapi.js` ganhou `.../vpo/adquirir`.
Cobertura: `tests/unit/vpo-applicability-engine.test.js` (matriz de aplicabilidade),
`tests/unit/vpo-gateway.test.js` (mock determinístico, idempotência, rejeição, resposta perdida,
mode `real`), `tests/worker/transporte-vpo.test.js` (skip-if-no-DB: acquire sucesso com auditoria,
rejeição volta a `applicable` sem tocar a operação, resposta perdida → `acquisition_unconfirmed` →
reconcile encontra e completa, reconcile not-found → volta a `applicable`),
`tests/api/transporte-vpo.test.js` (409 sem allocation `applicable`, not_applicable com reason
obrigatório, registrar-aquisicao manual atualiza `vpoAmount` sem tocar `freightOfferedAmount`,
adquirir 202 + dedupe via Idempotency-Key, fornecedoras lista as 16 reais, tenancy, 401).
`tests/regulatory/compliance-gates.test.js` ganhou casos dedicados para os 3 evaluators.

## 4. Riscos e limites conhecidos

- ~~**P0 — autorização das rotas REST.**~~ **FECHADO.** `middlewares/auth.ts` continua verificando só
  a **presença** de um `Bearer` (e tem default `AUTH_REQUIRED=false`), mas ele deixou de ser a única
  linha: `sicatAuthMiddleware` foi aplicado às **74 rotas** que estavam abertas — 67 em `/v1` e as 7
  de `/health/*`. Medição que motivou o fechamento (produção `dev.nvit.com.br`, 2026-08-08):
  `GET /v1/manifestos` sem token respondia **400** (`integrationAccountId is required`), isto é,
  passava da autenticação e morria na validação de negócio. A superfície pública agora é uma lista
  FECHADA de 9 caminhos (`GET /health`, `GET /v1/ping`, `POST /v1/auth/login`,
  `POST /v1/sicat/auth/{login,register,refresh,keycloak}`, webhook do canal GET+POST), e
  `tests/api/v1-auth-coverage.test.js` enumera o router montado para que rota nova nasça fechada.
  Contrato em lockstep: 17 operações perderam `security: []` e 61 ganharam o `401`
  (`UnauthorizedProblem`). **Pendência remanescente:** `/docs` e `/openapi.{json,yaml}` seguem
  públicos — servem o contrato interno, cujos `examples` carregam CNPJ, endereço e nome reais.
- ~~**⛔ MTR DUPLICADO — a janela cega do `manifest.submit`.**~~ **FECHADO nesta leva.** Valia para
  **todo** envio, pela tela inclusive, não só pelo canal. O `manHashCode` só nasce na **resposta** do
  PUT da CETESB; se ela se perde (timeout, erro de parse, pod morrendo entre o PUT e o commit), o
  SICAT resolvia a dúvida para o lado errado: gravava `status: 'failed'` **sem consultar a CETESB** e
  a mensagem mandava *"realize novo envio"* — quando o MTR **nasceu**, esse reenvio criava um
  **segundo MTR real**, e cancelar não desfaz.
  **O que fechou:** marcador de correlação gravado no `manObservacao` **antes** do PUT (C1);
  reconciliador que pergunta à CETESB *"esse envio nasceu?"*, agora **ligado** nos dois pontos que
  decidiam às cegas; estado **`submit_unconfirmed`**, distinto de `failed`, para o caso "não sei";
  costura da linha órfã pelo marcador, em vez de inserir um registro novo desvinculado; e job
  `manifest.reconcile_submit` varrendo os pendentes. A mensagem só instrui reenvio quando o sistema
  tem certeza de que o MTR **não** nasceu.
  **Trava adicional encontrada no caminho:** `enqueueManifestSubmitInternal` não tinha guarda de
  status **nenhuma** — qualquer manifesto podia ser reenviado a qualquer momento. Agora recusa com
  409 em `submit_unconfirmed`.
  Na tela, o estado aparece como **"Envio sem confirmação"** (tom `warning`) e as ações que
  fabricariam a duplicata — replicar, submeter, cancelar, imprimir, receber, usar para CDF — ficam
  **desabilitadas com o motivo à vista**, em vez de sumirem.
- **Heartbeat de claim por lote** — `claimJobs(10)` reivindica 10 jobs, o laço processa em série e
  `startClaimHeartbeat` só começa na vez de cada job: os jobs 2..N ficam `running` com heartbeat
  congelado e viram candidatos de `requeueStaleRunningJobs` em 5 min → **risco de execução dupla de
  operações CETESB não idempotentes**. O manifesto retido mitiga **só na raia de canal**
  (`WORKER_BATCH_SIZE=1`); a raia `default` segue exposta.
- **`WHATSAPP_META_VERIFY_TOKEN` vaza pelo access log do Traefik** (que registra a URI antes do app,
  fora do alcance do skip do `morgan`). Tratar como segredo de uso único e rotacionar após a
  verificação.
- Operações CETESB mutáveis (`manifest.receive`, `cdf.generate`, cancelamentos) não devem ser
  disparadas para gerar evidência cega.
- Ausência de certificados reais na conta consultada limita a prova E2E de download remoto de CDF.
- **Segredo real no histórico legado** (GCP API Key) — pendência de rotação, ver
  `ONBOARDING-DEVOPS.md` §7.
- Toda mudança de superfície HTTP exige atualização lockstep de OpenAPI, exemplos, `operations.ts`,
  rotas e testes de contrato — **sem gate automatizado hoje** (§3.6).

> A afirmação anterior desta seção — *"nenhum backend de IA está implementado: o Command Center é
> base estrutural até segunda ordem"* — era **falsa** e foi removida. Ver §2.6 e §2.7.

## 5. Decisões pendentes do operador

Consolidadas em **[runbook-canal-whatsapp.md §2](../05-operacao/runbook-canal-whatsapp.md)** — 12
itens (O1 a O12), do manifesto retido ao flip do RBAC, passando pelo escudo anti-bombing, pelas
credenciais do provedor e pelo P0 de autorização REST. **Nenhum deles é implementável por agente.**

## 6. Como evoluir este documento

Atualizar este snapshot ao final de cada work_id com mudança de escopo. Não marcar nada como
IMPLEMENTADO sem evidência em código, testes ou docs verificáveis — **e não omitir o que não foi
entregue**, que é a forma de mentir que este arquivo já cometeu uma vez. Cada nova cadeia deve
regenerar este arquivo após a entrega validada pelo QA.

A próxima frente recomendada está em [PROXIMO_PROMPT.md](PROXIMO_PROMPT.md).
