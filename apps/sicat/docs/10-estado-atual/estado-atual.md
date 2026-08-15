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

### 3.9 🕓 Vertical Transporte — Fase A em andamento (PR-A1, PR-A2 e PR-A3 entregues)

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
(inclui teste de isolamento entre contas).

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
