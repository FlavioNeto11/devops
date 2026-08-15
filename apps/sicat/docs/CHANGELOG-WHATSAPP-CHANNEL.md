# CHANGELOG — Cadeia `whatsapp-channel-sicat`

> Release notes consolidadas da cadeia `whatsapp-channel-sicat` (fases 0–7, 2026-08-06/08),
> branch `sicat/whatsapp-channel`. Decisão arquitetural: **DL-101**
> ([13-decision-log.md](copilot/13-decision-log.md)).
> Checkpoints em [docs/handoffs/whatsapp-channel-sicat/](handoffs/whatsapp-channel-sicat/).
> Ativação e desligamento: [runbook-canal-whatsapp.md](05-operacao/runbook-canal-whatsapp.md).

## 1. Resumo executivo

### Entregue

Um **canal conversacional externo por WhatsApp**, endurecido, com contrato publicado e
**desligado por default**. O canal faz **consulta, 2ª via de documento e réplica local** (nível N1).

| Fase | Commit | O que entregou |
|---|---|---|
| 0 | `e6f60ef9` | identidade do turno resolvida no servidor; canal não declarável por cliente; rate limit |
| 1 | `3b202731` | abstração `WhatsAppProvider` + adapters Twilio e Meta (assinatura fail-closed, timeout) |
| 2 | `762f7c6b` | vinculação telefone↔usuário por OTP (migration `020`, **nunca aplicada**) |
| 3 | `622b665e` | webhook público + adaptador de canal + job `whatsapp.inbound_message` + raias de fila |
| 4 | `cb96a563` | renderer de saída textual + segmentador |
| 4.5 | `cdeba31f` | RBAC conversacional fail-closed (catálogo de 8 chaves, gate de 3 estados, modo `observe`) |
| 5 | `bc897ea6` | confirmação server-side de ações — N1 entregue; **N2 fechado**; N3 recusado em código |
| 6 | `525d3fbd` | aviso de conclusão + entrega de arquivo (desligada por default) + 7 correções Fable 5 |
| 7 | — | 16 operações publicadas no OpenAPI em lockstep; `test:contract` consertado; esta documentação |

### ⛔ NÃO entregue — e não é falta de tempo

- **O canal NÃO emite MTR.** O nível **N2** (`submit_manifest`, `manifest.batch_submit_selected`)
  está fechado por **constante de código** —
  `const WHATSAPP_OUTBOUND_NOTICE_IMPLEMENTED = false;` — com gate
  `if (!IMPLEMENTED || !env)`. **Nenhum `WHATSAPP_ACTION_NOTICE_ENABLED=true` o abre.** A razão: o
  aviso de conclusão **não distingue "o MTR não foi criado" de "o MTR foi criado e eu perdi a
  resposta"**, e para emissão irreversível essa é a única informação que importa. **Emitir MTR pelo
  WhatsApp — a manchete do canal — não está entregue.**
- **O nível N3 é recusado por lista de código** (`CHANNEL_HARD_DENY`, 10 chaves), inclusive contra
  qualquer `PATCH` do AI Control Center.
- **Entrega de mídia desligada por default** (`WHATSAPP_MEDIA_DELIVERY_ENABLED=false`) — código
  completo e testado; ligar é decisão da organização.

### 🕓 Inerte até ação humana

- `k8s/backend.yaml` **retido, não commitado** (+208 linhas: raia `sicat-worker-channel`, 2 Services
  headless de métrica, `WORKER_LANE=default` no worker atual e `CONVERSATION_PERMISSION_ENFORCEMENT:
  observe` nos três pods). Sob Argo com `selfHeal: true`, **commitar é aplicar**.
- Migration `020` **nunca aplicada** em banco nenhum.
- Seed do catálogo RBAC **nunca executado** contra este Postgres.
- Credenciais de provedor ausentes → `WHATSAPP_PROVIDER=disabled` → webhook responde **404**.
- **O fluxo ponta a ponta nunca foi executado.**

As 12 decisões pendentes do operador estão consolidadas em
[runbook-canal-whatsapp.md §2](05-operacao/runbook-canal-whatsapp.md).

## 2. Superfície HTTP

### 2.1 Contrato mudou, não só cresceu

As 5 rotas `/v1/conversations/*` **já existiam fora do OpenAPI antes da cadeia**, e a fase 0 mudou o
contrato delas:

| Situação | Resposta |
|---|---|
| sessão SICAT não resolvida | **401** `CONVERSATION_PRINCIPAL_UNRESOLVED` |
| cliente HTTP declarando `channel: "whatsapp"` | **403** `CONVERSATION_CHANNEL_NOT_CLIENT_DECLARABLE` |
| canal desconhecido (antes caía em `inapp`) | **400** `CONVERSATION_CHANNEL_INVALID` |
| > 40 turnos / 5 min por usuário | **429** `CONVERSATION_RATE_LIMITED` + `Retry-After` |

### 2.2 As 16 operações publicadas na fase 7

| Método | Path |
|---|---|
| GET | `/v1/conversations/tools` |
| GET | `/v1/conversations/artifacts/{artifactId}` |
| GET | `/v1/conversations/artifacts/{artifactId}/content` |
| POST | `/v1/conversations/feedback` |
| POST | `/v1/conversations/turns` |
| GET, POST | `/v1/sicat/channel-links` |
| DELETE | `/v1/sicat/channel-links/{linkId}` |
| GET, POST | `/v1/sicat/channel-links/whatsapp/action-window` |
| DELETE | `/v1/sicat/channel-links/whatsapp/action-window/{windowId}` |
| DELETE | `/v1/sicat/channel-links/challenges/{challengeId}` |
| POST | `/v1/sicat/channel-links/challenges/{challengeId}/resend` |
| POST | `/v1/sicat/channel-links/challenges/{challengeId}/confirm` |
| **GET, POST** | **`/v1/channels/whatsapp/webhook`** — **rota PÚBLICA** |

> Correção de contagem herdada dos checkpoints: o checkpoint 03 fala em "6 rotas" de channel-links.
> São **9** — a fase 5 acrescentou as três de `action-window`.

OpenAPI: 74 → **87 paths**, 88 → **104 operações**, 133 → **154 schemas**.
`examples/`: 168 → **200 arquivos**. `src/generated/operations.{js,ts}` em lockstep.

### 2.3 Decisões de contrato gravadas em teste

- **O `202` de channel-links NÃO é `CommandAccepted`** — ali significa "o ENVIO foi aceito", não
  "job enfileirado": não há `commandId`, `jobId` nem `/v1/jobs/{jobId}`. Invariante **negativa**,
  asserida no teste de contrato.
- **Webhook com `security: []`** nas duas operações (a raiz do documento continua exigindo Bearer).
  `X-Twilio-Signature`/`X-Hub-Signature-256` entram como headers **opcionais**, não como
  `securityScheme`: o gate é o HMAC sobre o `rawBody`, não a presença do header.
- **GET do desafio devolve `text/plain`**, sem `application/json` — `res.json` reprova a verificação
  da Meta.
- **O POST do webhook não declara 429**: o teto global responde **200** de propósito. Respostas
  possíveis: exatamente `{200, 403, 404, 500}`, todas de corpo vazio.
- **401 sem `code`** (schema `UnauthorizedProblem` próprio) — o middleware chama `createProblem` sem
  `code`; documentar `SICAT_TOKEN_INVALID` seria documentar campo que não vem.
- **`errors` como OBJETO** (schema `CodedProblem`) — os 429/400 desta cadeia emitem
  `{retryAfterSeconds}`, `{attemptsRemaining}`, `{correlationId}`, não o array `{field,message}` do
  `Problem`. `410`, `429` e `502` são status inéditos no contrato.
- **Examples não vazam segredo do vínculo** — `code`, `codeHash`, `providerMessageId`,
  `deliveryError` e `metadata` ausentes do DTO de desafio; `phoneMasked` no formato que
  `maskChannelUserKey` produz de fato.

## 3. Segurança e identidade

### 3.1 Identidade resolvida no servidor

`channel`, `userId`, `integrationAccountId`, `sessionContextId` e `permissionKeys` saem de
`resolveChannelPrincipal` e **vencem o corpo da requisição**.

### 3.2 Webhook público com isenção estreita

`/v1/channels/` entra em `PUBLIC_PATH_PREFIXES` (`backend/src/middlewares/auth.ts`) porque quem chama
é um terceiro que nunca manda `Authorization`. **`/v1/sicat/channel-links` NÃO entra** — aquela é a
superfície autenticada do dono do número. Sem a isenção, o webhook quebraria **só em produção**
(`AUTH_REQUIRED` é injetado pelo cluster).

O router usa `caseSensitive`/`strict` ligados de propósito, tem `express.urlencoded` montado **na
rota** (nunca global) e um **error handler próprio** — nada do caminho de ingestão alcança o
`errorHandlerMiddleware` global, que responderia `problem+json` e provocaria reentrega.

### 3.3 OTP sempre iniciado no app

Não existe OTP disparado a partir do canal externo. `code_hash` é `scrypt` **com salt por linha** —
6 dígitos são 10⁶ possibilidades, e um sha256 sem salt seria pré-computável em menos de um segundo a
partir de um dump, invertendo **todos** os desafios vivos de uma vez.

### 3.4 RBAC conversacional fail-closed (fase 4.5)

Antes, quem não tinha papel nenhum passava por **todas** as tools — e `access_permissions` tinha
**0 linhas**. Catálogo de 8 chaves + gate de 3 estados avaliado **por chave**, com quarto ramo para
catálogo degradado. Runbook próprio:
[runbook-rbac-conversacional.md](05-operacao/runbook-rbac-conversacional.md).

### 3.5 Ticket de confirmação = LINHA no banco

Uso único atômico (`consumed_at is null` no `where`), TTL curto, argumentos remontados **no
servidor**, autorização reavaliada na queima. **Zero DDL novo**: `whatsapp_action` e
`whatsapp_stepup` são discriminadores de `channel_type` na `020`. `createAccessToken` foi
**proibido** — um ticket mintado com o segredo de sessão seria, byte a byte, um Bearer válido.

### 3.6 Correção de vazamento achada de passagem (fase 6)

`resolveChannelPrincipal` fazia `requestedBy: input.requestedBy || externalUserKey`: o telefone E.164
**cru** descia para o `body` de todo enqueue vindo do canal e ficava em repouso em
`jobs.payload.requestedBy` — e a DLQ copia a linha. O fallback passou a ser o `channelLinkId`, opaco.

## 4. Persistência e fila

### 4.1 Migration `020_channel_link_verifications.sql`

**Aditiva** (`create table if not exists`), **não toca** `conversation_channel_links` (011) e **não
tem down migration**. Guarda três coisas discriminadas por `channel_type`: o desafio de vínculo
(`whatsapp`), o ticket de ação (`whatsapp_action`) e a janela N2 (`whatsapp_stepup`).

⚠️ **Sobrecarga semântica consciente:** o `check` de `outcome` é fechado e **não tem `executed`** — a
fase 5 reusa `verified` para "ação executada", que é o preço de não criar a `021`.

⚠️ **Nunca aplicada em banco nenhum.** Estreia sozinha no boot do primeiro rollout
(`AUTO_MIGRATE=true`), e `runMigrations` **não tem advisory lock** → rollout escalonado obrigatório.

### 4.2 Raias de fila (`lib/job-lanes.ts`)

`WORKER_LANE`: `all` (default — comportamento antigo byte a byte) | `default` | `channel`. As duas
metades do predicado SQL saem da **mesma constante**, e a presença de `whatsapp.outbound_notice` nela
é **asserida no import**: esquecer a entrada deixaria o job de aviso sem nenhuma raia que o
reivindique, para sempre, **sem erro de log**.

⚠️ **Modo de falha assimétrico:** `default` no ar sem `channel` ⇒ job de canal nunca reivindicado, em
silêncio. `channel` numa imagem antiga ⇒ `resolveWorkerLane` cai em `all` ⇒ dois consumidores da fila
inteira.

## 5. Aviso de conclusão e mídia (fase 6)

O aviso **nasce na confirmação**, não no desfecho: é criado em `recordDispatchOutcome`, a única linha
que tem simultaneamente o ticket, o vínculo e os jobs recém-enfileirados. Acorda em +15 s, lê o estado
dos jobs e decide: todos terminais → compõe e entrega; algum pendente e prazo não vencido →
reagenda; prazo vencido → entrega o parcial honesto. **Nunca vai para DLQ.**

Prazo em **relógio de parede** (`confirmedAt + 10 min`): se a plataforma ficar 12 h fora, a decisão de
*o que dizer* fica separada da de *se dá para empurrar*.

Entrega de arquivo implementada e **desligada** (`WHATSAPP_MEDIA_DELIVERY_ENABLED=false`,
`WHATSAPP_NOTICE_MAX_DOCUMENTS=5`, `WHATSAPP_MEDIA_MAX_BYTES=8 MiB`). O teto de memória é **por
lote**, não por documento: `collectDocuments` devolve só metadados e o `readFile` acontece
imediatamente antes de cada `sendMedia` (antes, 5×8 MB de Buffer ficavam vivos ao mesmo tempo).

## 6. Frontend

Rota **`/perfil/canais`** → `WhatsAppLinkView.vue`
([frontend/src/router.js](../frontend/src/router.js)), com
`requiresActiveCetesbAccount: false` **de propósito**: revogar um número (aparelho roubado) não pode
depender da CETESB.

Fluxo: `POST /v1/sicat/channel-links` → **202** ("o envio foi aceito", nunca "chegou") →
`POST …/challenges/:id/confirm` → 200 idempotente.

## 7. Observabilidade

`sicat_channel_inbound_received_total`, `sicat_channel_inbound_enqueued_total`,
`sicat_channel_inbound_dropped_total` (com label de motivo: `foreign_business_number`, `stale`,
`invalid_phone`), `sicat_channel_outbound_notice_total`
([lib/channel-metrics.ts](../backend/src/lib/channel-metrics.ts)) e
`sicat_conversation_permission_decision_total`.

⚠️ Até a fase 4.5 havia **um único Service** (`sicat-api`) e o ServiceMonitor seleciona *Services*:
as métricas dos workers **nunca eram raspadas**. Os dois Services headless entraram no manifesto
**retido** — antes de confiar em qualquer zero, confirme que aparecem amostras dos três pods.

## 8. QA e validação

| Gate | Resultado |
|---|---|
| `npm run typecheck` | ✅ limpo |
| `npm run lint` | ✅ limpo |
| `npx tsx --test tests/unit/*.test.js` | **946 testes · 911 pass · 35 fail** — baseline **pré-existente** (11 nomes top-level), intacta |
| `node --test tests/integration/openapi-queue-contract.test.js` | **13 pass / 0 fail** (era 4 testes, **2 pass / 2 fail**) |
| `node scripts/validate-openapi.js` | ✅ exit 0 — 104 operações |
| `node scripts/validate-cetesb-source-of-truth.js` | ❌ **falha pré-existente** — `backend/docs/cetesb` ausente (HARs não versionados por conterem JWT/CPF) |
| `npm run check:secrets` / `scan:secrets` | ✅ nenhuma exposição nova |

### 8.1 O gate de contrato estava vermelho antes desta cadeia

`openapi-queue-contract.test.js` resolvia `examplesDir` como `process.cwd()/examples` =
`backend/examples`, **pasta que não existe** desde o refactor de monorepo (`266849cd`) — `examples/`
foi para a raiz do workspace. 2 dos 4 casos falhavam com `ENOENT`. Corrigido na fase 7, ancorando os
caminhos em `fileURLToPath(import.meta.url)`.

### 8.2 Validação cross-model (Fable 5)

7 revisores, um por commit de fase, lendo por SHA. Achados corrigidos:

| Sev | Correção |
|---|---|
| **ALTO** | `twilio-provider`: o filtro `MessageStatus \|\| SmsStatus` podia descartar **toda** mensagem de entrada. Os testes passavam porque os payloads sintéticos omitiam o campo — **verde falso** |
| **MÉDIO** | `conversationSessionId` do corpo era confiado: no PK-conflict engolido por `persistSafely`, o turno gravava e lia a sessão de **outro usuário** da mesma conta |
| BAIXO | balde de telefone consumido antes das recusas baratas (`peek()` agora) |
| BAIXO | `slice` UTF-16 na truncagem → surrogate partido → `jsonb` rejeita → mensagem perdida em silêncio |
| BAIXO | chave do rate limit incluía o canal declarado (dobrava para 80/5 min) |
| BAIXO | `String.replace` com replacement string (`$$`, `$&` corrompem valor em R$) |
| BAIXO | `truncateWhatsAppReply` com teto baixo devolvia só o sufixo |

Além disso, na fase 6: um **crítico** —
`applyWhatsAppInboundTerminalFailureSideEffect` filtrava só por `job.payload.channelLinkId`, e o job
de **aviso** passou a carregar esse campo: um aviso morrendo disparava *"Não consegui processar sua
última mensagem"*, falso e pago.

## 9. Dívida que fica escrita

1. **N2 fechado** enquanto o aviso não distinguir "não criado" de "criado e perdi a resposta".
2. **Duas lacunas de teste** confirmadas por mutação sobrevivente — **F9** (regeneração do id de
   sessão, só observável completando o turno) e **F12** (chave do rate limit, middleware de rota).
   **Não há cobertura — está escrito aqui em vez de fingido.**
3. **`unmetered` no débito de saída** sem cobertura (é teto de custo, não de autorização).
4. **5 testes pendentes** da remediação da fase 4.5 (código corrigido, evidência devida).
5. **Nenhum teste executa o SQL do seed** contra um Postgres — os testes afirmam sobre *strings*.
6. **Sem teste de integração contra Postgres** para as guardas SQL da fase 2 (protegidas por testes
   de nível de fonte — mata as mutações conhecidas, mas é proxy).
7. **`gen:operations` não sincroniza `operations.ts`** — quem faz é `sync-operations-ts.mjs`, que não
   está em nenhum script do `package.json`. Nada impede o `.ts` de ficar stale em silêncio.
8. **`validate:md-links` varre 8 arquivos, não 817** — mesma causa-raiz do `examplesDir`; com
   `cwd = apps/sicat` há **410 links quebrados** pré-existentes.
9. **Nenhum gate de CI** roda `typecheck`, backend tests, `validate:openapi` ou `test:contract` para
   o sicat.
10. **`createGeneratedRouter`** é código morto.
11. **P0 fora da cadeia** — as rotas REST de ação seguem sem `sicatAuthMiddleware`.
12. **Revalidação Fable 5 sobre a árvore consolidada** — recomendada pelo próprio sintetizador, não
    executada.
13. **Heartbeat de claim por lote** — risco de execução dupla na raia `default` (mitigado só na raia
    de canal, com `WORKER_BATCH_SIZE=1`).

## 10. Checkpoints da cadeia

- [00-orchestration.md](handoffs/whatsapp-channel-sicat/00-orchestration.md)
- [01-hardening-conversacional.md](handoffs/whatsapp-channel-sicat/01-hardening-conversacional.md)
- [02-provider-abstraction.md](handoffs/whatsapp-channel-sicat/02-provider-abstraction.md)
- [03-identidade-otp.md](handoffs/whatsapp-channel-sicat/03-identidade-otp.md)
- [04-webhook-canal.md](handoffs/whatsapp-channel-sicat/04-webhook-canal.md)
- [05-renderer-textual.md](handoffs/whatsapp-channel-sicat/05-renderer-textual.md)
- [06-rbac-fail-closed.md](handoffs/whatsapp-channel-sicat/06-rbac-fail-closed.md)
- [07-confirmacao-acoes.md](handoffs/whatsapp-channel-sicat/07-confirmacao-acoes.md)
- [08-outbound-e-arquivos.md](handoffs/whatsapp-channel-sicat/08-outbound-e-arquivos.md)
- [09-contrato-qa-final.md](handoffs/whatsapp-channel-sicat/09-contrato-qa-final.md)
