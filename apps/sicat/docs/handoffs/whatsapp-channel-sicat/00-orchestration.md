# 00 — Orquestração · `whatsapp-channel-sicat`

| Campo | Valor |
|---|---|
| `work_id` | `whatsapp-channel-sicat` |
| Intent | `feature` |
| Complexidade | `alta` (multi-fase, backend + frontend + migration + contrato) |
| Decision log | **DL-101** (a formalizar na fase 09) |
| Próxima migration | **`020_`** (última aplicada: `019_conversation_feedback.sql`) |
| Data de abertura | 2026-08-06 |

## 1. Demanda

Ligar o **canal WhatsApp** à camada conversacional do SICAT, permitindo consulta **e ações
operacionais com confirmação** (submeter/imprimir/cancelar MTR, gerar/baixar CDF) a partir de um
número de telefone vinculado a um usuário SICAT com conta CETESB ativa.

## 2. Decisões de produto (tomadas pelo operador em 2026-08-06)

| # | Decisão | Valor |
|---|---|---|
| D1 | Provedor | **Abstração com 2 adapters**: `twilio` (dev/sandbox) e `meta` (WhatsApp Cloud API, produção), selecionados por env `WHATSAPP_PROVIDER` |
| D2 | Escopo funcional | **Read + ações com confirmação** — inclui construir token de confirmação server-side e step-up auth |
| D3 | Vinculação de identidade | **OTP iniciado no app SICAT** — usuário autenticado informa o número, recebe código pelo canal e confirma na tela |

## 3. Baseline — o que já existe (verificado em código)

O canal WhatsApp foi **projetado desde o início** da camada conversacional e nunca foi ligado.

| Ativo | Onde | Estado |
|---|---|---|
| Tipo `ConversationChannel = 'whatsapp' \| 'native_chat' \| 'inapp'` | `backend/src/services/conversation/conversation-context-service.ts:3` | ✅ vivo, propaga end-to-end |
| Policy por canal (`allowChannels` por tool) | `backend/src/services/conversation/tools/tool-registry.ts` | ✅ 15 tools R1 já permitem `whatsapp`; 5 tools de ação já o excluem |
| Policy por intent orquestrado | `conversation-policy-service.ts:74-209` | ✅ matriz completa, previews R2 liberados no WhatsApp |
| Limites de lote por canal | `conversation-policy-service.ts:299-308` | ✅ já calibrados (`whatsapp: 3/5/2`) |
| Identidade de sessão por chave de canal | `sql/011` índice único parcial `(channel_type, channel_session_key)` | ✅ upsert reaproveita id canônico |
| Persistência/auditoria por canal | `conversation_sessions.channel_type`, `conversation_action_logs.channel_type`, `conversation_feedback.channel_type` | ✅ |
| Vinculação telefone → usuário | tabela `conversation_channel_links` (`sql/011:119-135`) + `repositories/conversation-channel-link-repo.ts` | ⚠️ **órfã** — nenhum service importa |
| Governança runtime de `allowChannels` | AI Control Center (`ai_tools`, `ai_tool_versions`) | ✅ editável sem deploy |
| Ingestão multimodal | `conversation-ingest.ts` (multipart, 20 arquivos / 10 MB) | ✅ reaproveitável para mídia recebida |
| Artefatos com storage/status/TTL | `conversation_artifacts` (`sql/012`), TTL 72 h | ✅ existe, mas autorização é frágil (ver L6) |

Documentação de intenção: `docs/copilot/conversacional/01..13` descreve o canal como **MVP 3 / Fase 5**,
sempre condicionado a "identidade de canal + policy mais restritiva".

## 4. Lacunas a fechar

| ID | Lacuna | Evidência |
|---|---|---|
| **L1** | Nenhum adaptador/webhook de canal existe | grep `webhook\|twilio\|graph.facebook` em `backend/src` → 0 |
| **L2** | `conversation_channel_links` nunca é lida/escrita | repo sem nenhum importador |
| **L3** | Auth do turno é **auto-declarada** | `conversation-routes.ts:108` sem `sicatAuthMiddleware`; `middlewares/auth.ts:11` só checa o prefixo `Bearer ` |
| **L4** | RBAC **fail-open** | `conversation-policy-service.ts:243-248` (`permissionKeys.size === 0 → true`); nenhum frontend envia |
| **L5** | Sem renderer `resultado estruturado → texto` | 21 tipos de `result` só têm componentes Vue; prompts não conhecem `channel` |
| **L6** | Download de artefato sem assinatura e com autorização opt-in | `conversation-persistence-service.ts:693-716` — omitir query params pula toda checagem |
| **L7** | `requiresConfirmation` é **stateless** | depende do cliente reenviar `confirmed: true`; sem token, sem expiração, sem one-time |
| **L8** | Sem ciclo de vida de sessão (TTL, janela de 24 h) | `status` sempre `'active'` |
| **L9** | Sem rate limit em lugar nenhum | grep `rate.?limit` → só string de retry do gateway |
| **L10** | `normalizeChannel` faz fallback **silencioso para `inapp`** (o mais permissivo) | `conversation-context-service.ts:51-57` |
| **L11** | Rotas conversacionais fora do OpenAPI | 0 ocorrências de "conversation" no YAML — contraria o contract-first |
| **L12** | Sem entrega outbound assíncrona | ações devolvem `jobId`; nada empurra o resultado de volta ao canal |

## 5. Fases planejadas

> Ordem é **de dependência**, não de conveniência. A fase 0 é pré-requisito de segurança: abrir um
> webhook público enquanto `channel` é auto-declarado e o RBAC é fail-open transforma o canal externo
> em bypass de governança (basta declarar `channel: 'inapp'` para escapar de todo bloqueio).

| Fase | Título | Fecha | Agente sugerido |
|---|---|---|---|
| **0** | Endurecimento da superfície conversacional | L3, L4, L9, L10 | `programador-backend-mtr` |
| **1** | Abstração de provedor + adapters Twilio/Meta | L1 (envio) | `integrador-cetesb-mtr` |
| **2** | Vinculação de identidade por OTP (migration 020 + API + tela) | L2 | `postgres-queue-mtr` + `frontend-vue-ux-mtr` |
| **3** | Webhook de entrada + adaptador de canal | L1 (recepção), L8 | `programador-backend-mtr` |
| **4** | Renderer de saída textual + canal nos prompts | L5 | `programador-backend-mtr` |
| **5** | Ações com confirmação server-side + step-up | L7 | `programador-backend-mtr` |
| **6** | Entrega outbound (notificações) + arquivos | L6, L12 | `postgres-queue-mtr` |
| **7** | Contrato OpenAPI + QA + docs | L11 | `tester-qa-mtr` + `documentador-mtr` |

### Fase 0 — Endurecimento (pré-requisito)

- Aplicar `sicatAuthMiddleware` em `/v1/conversations/*`.
- **`channel` deixa de ser auto-declarado**: derivado da origem autenticada no servidor. `normalizeChannel`
  passa a rejeitar valor desconhecido com `400 CONVERSATION_CHANNEL_INVALID` em vez de cair em `inapp`.
- `userId` / `integrationAccountId` / `sessionContextId` derivados de `req.sicatUser` + conta ativa,
  não do body.
- `permissionKeys` resolvido **no servidor** a partir dos roles do usuário (fim do fail-open).
- Rate limit por sessão e por identidade de canal.
- ⚠️ **Lockstep obrigatório com o frontend**: `useConversationalChatApp.js:479` e `useInAppCopilot.js:563`
  hoje declaram `channel` e o contexto no body. Precisam ser ajustados no mesmo PR, senão o chat quebra.

### Fase 1 — Provedor

`backend/src/services/conversation/channel/whatsapp/` com interface `WhatsAppProvider`
(`sendText`, `sendMedia`, `sendTemplate`, `verifyWebhookSignature`, `parseInboundEvent`) e duas
implementações selecionadas por `WHATSAPP_PROVIDER=twilio|meta`. Referência de estilo (fail-soft, sem
SDK): `apps/gymops/apps/api/src/lib/whatsapp.ts`. Assinatura de webhook: Twilio `X-Twilio-Signature`
(HMAC-SHA1), Meta `X-Hub-Signature-256` (HMAC-SHA256).

### Fase 2 — Identidade (migration `020`)

Tabela `conversation_channel_verifications` (hash do código, `expires_at`, `attempts`, one-time),
ativando `conversation_channel_links` com transição `pending → verified`. API
`/v1/sicat/channel-links` (list / create+envia OTP / confirm / delete) sob `sicatAuthMiddleware`.
Tela Vue de vinculação.

### Fase 3 — Webhook

`GET /v1/channels/whatsapp/webhook` (challenge do Meta) + `POST` (recepção). Resolve telefone → link
verificado → `userId` + `integrationAccountId`; monta `channelSessionKey = 'whatsapp:<E.164>'`;
**enfileira job** `whatsapp.inbound` e responde `200` imediatamente (a Meta exige resposta rápida).
Idempotência pelo message id do provedor.

### Fase 5 — Confirmação

Tabela de ações pendentes com token one-time assinado (HMAC), TTL curto, amarrado a
sessão + telefone + snapshot de conta/sessão CETESB. Liberação das tools de ação para `whatsapp` feita
**pelo AI Control Center em runtime**, não hardcoded no `tool-registry.ts`.

## 6. Critérios de pronto

- `npm run typecheck && npm run lint && npm run test:contract` verdes no `backend`.
- `npm run test:unit:frontend && npm run build:frontend` verdes.
- Chat nativo e copiloto in-app **continuam funcionando** após a fase 0 (regressão zero).
- Nenhuma tool de ação executável por WhatsApp sem token de confirmação válido e não reutilizado.
- Nenhum segredo em git; credenciais do provedor via `sicat-config` (SealedSecret).
- Rotas novas no OpenAPI, em lockstep com `examples/` e `src/generated/operations.ts`.

## 7. Fora de escopo

- Reuso do **ZapBridge** como gateway. Avaliado e descartado: Baileys (cliente não-oficial) atrelado a
  número pessoal por QR, 1 réplica com SQLite RWO (escalar é proibido por NFR), sem webhook de saída
  (só Socket.IO stateful, sem replay) e sem auth máquina-a-máquina. O próprio
  `apps/zapbridge/AGENTS.md` §8.5 e o RF044 do `MVP-FUNCIONAL.md` proíbem esse uso.
- Migração do chat nativo para o novo renderer textual (o renderer é aditivo).
- Integração SINIR e emissão fiscal (não relacionados).
