# AI Control Center — 03 · Observabilidade (providers + Langfuse + SSE)

> Work ID: `ai-control-center` · Branch: `feature/ai-control-center-langfuse`
> FASE 3 · Depende de: `ai-control-config`, `ai_trace_events` · Habilita: overview, traces, SSE

## 1. Objetivo

Encapsular a observabilidade externa atrás de um **provider/adapter** seguro, sincronizar/persistir
traces em `ai_trace_events`, e expor um **bus SSE** local em tempo quase real — tudo sem nunca
bloquear `/v1/conversations/turns` e sem vazar segredos. O Langfuse é opcional: quando não está
pronto, cai para um fallback local que serve a mesma tela.

## 2. Abstração de provider — `providers/ai-observability-provider.ts`

Interface `AiObservabilityProvider`:

```
name; getStatus(); listTraces(filters); getTraceTree(traceId);
listObservations(filters); listPrompts(); getMetrics(); buildDeepLink(traceId)
```

Três implementações:

| Provider | Arquivo | Comportamento |
|---|---|---|
| `noop` | `providers/noop-observability-provider.ts` | Tudo vazio; status `disabled`. Disponível via `getNoopObservabilityProvider()` (não é o fallback padrão). |
| `local` | `providers/local-observability-provider.ts` | **Fallback padrão.** Lê `ai_trace_events` e reconstrói traces/observações **agrupando por turno** (`conversationTurnId \| traceId \| id`); `getMetrics()` agrega os últimos 500 eventos (janela `recent-500`). Status reportado como `disabled` (Langfuse não está no ar). `buildDeepLink` → `null`. |
| `langfuse` | `langfuse/langfuse-provider.ts` | Adapter da API pública do Langfuse. |

### 2.1 Seleção do provider — `ai-control-observability-service.ts`

`getObservabilityProvider()`: **Langfuse quando `isLangfuseReady()`**, senão `LocalObservabilityProvider`.
O fallback local garante que a aba de traces sempre tenha dados (traces SICAT) mesmo com Langfuse
desligado. O provider é cacheado por uma `providerSignature` derivada de
`(enabled, publicKeyConfigured, secretKeyConfigured, baseUrl, projectId)` — muda a config, troca o
provider sem reinício.

## 3. Status canônico do Langfuse

`isLangfuseReady(config)` = `enabled && publicKeyConfigured && secretKeyConfigured`.
`getLangfuseStatus(): AiControlLangfuseStatus` resolve um dos três estados:

| Estado | Condição |
|---|---|
| `disabled` | `LANGFUSE_ENABLED=false`. |
| `degraded` | habilitado mas **sem** as duas chaves, **ou** chamada de health falhou. |
| `ready` | habilitado, chaves presentes e `client.health()` ok (`lastSyncAt` preenchido). |

`getStatus()` no provider Langfuse faz `client.health()` (`GET /api/public/projects`) e nunca lança;
o serviço também envolve a construção do provider em try/catch e degrada com a mensagem do erro.

## 4. Cliente Langfuse — `langfuse/langfuse-client.ts`

Cliente HTTP mínimo da API pública. **Nunca lança**: todo método retorna
`{ ok: true, data } | { ok: false, error, status? }`.

- **Auth**: `Basic base64(publicKey:secretKey)` no header `Authorization`. As chaves **nunca saem do
  backend**.
- **Timeout**: `AbortSignal.timeout(syncTimeoutMs)` (default 8000 ms).
- Endpoints usados: `/api/public/projects` (health), `/api/public/traces`, `/api/public/traces/:id`,
  `/api/public/observations`, `/api/public/v2/prompts`, `/api/public/metrics/daily`.

### 4.1 Mapper e deeplink

- `langfuse/langfuse-mapper.ts`: normaliza shapes brutos (`langfuse-types.ts`, propositalmente
  permissivos) para os DTOs SICAT. `mapTraceSummary` lê correlação SICAT de
  `metadata.{conversationSessionId,conversationTurnId,correlationId}` (cai para `sessionId`/`userId`
  da raiz). `buildObservationTree` monta a árvore por `parentObservationId` (limite de profundidade
  12, ordenada por `startTime`). Tokens via `usage.input/promptTokens` e `output/completionTokens`.
- `langfuse/langfuse-deeplink.ts`: `buildLangfuseTraceDeepLink(baseUrl, projectId, traceId)` →
  `…/project/<id>/traces/<traceId>` (ou `…/traces/<traceId>` sem projectId). Só o provider Langfuse
  retorna deeplink; local/noop retornam `null`.

## 5. Bus SSE + ponte com a observabilidade conversacional

Tudo em `ai-control-observability-service.ts`.

### 5.1 Bus SSE local

`subscribeAiControlStream(handler)` / `publishAiControlStreamEvent(event)` /
`emitAiControlStreamEvent(type, payload)` / `getAiControlStreamSubscriberCount()`. O publisher
isola cada handler em try/catch — um assinante SSE com defeito **não derruba** os demais nem o
publisher. Eventos sempre passam por `sanitizeForObservability(payload)` antes de sair.

### 5.2 Ponte best-effort (`ensureAiControlObservabilityWired()`)

Ligada uma única vez (flag `wired`) ao criar o router. Faz
`subscribeConversationOperationalEvents(handler)` (hook exportado em `conversation-observability.ts`),
e o handler:

1. Se `enableSse`, publica um `AiControlStreamEvent` (tipo derivado do `status`: `blocked` →
   `policy.blocked`, `failed` → `tool.failed`, `executed` → `tool.done`, senão `response.done`).
2. Dispara `void persistOperationalEvent(event)` → `insertAiTraceEvent({ traceSource:'sicat', ... })`
   com payload **sanitizado** (channel, reasonCode, riskLevel, requiresConfirmation, confirmed,
   artifactCount, errorCode, jobId, integrationAccountId, sessionContextId).

**Garantia de não-bloqueio**: o `subscribe...` no lado conversacional já isola os handlers em
try/catch e os trata como fire-and-forget (comentário no código: *"NUNCA afetam o fluxo do turn"*);
a persistência aqui também é `try/catch` silencioso. O turn nunca espera por SSE nem por DB.

### 5.3 SSE HTTP (`/v1/ai-control/events/stream`)

Em `ai-control-routes.ts`: define `Content-Type: text/event-stream`, `Cache-Control: no-cache,
no-transform`, `X-Accel-Buffering: no`; manda `heartbeat` inicial + a cada 25 s; `subscribeAiControlStream`
escreve `event: <type>\ndata: <json>\n\n`; limpa `setInterval`/`unsubscribe`/`res.end()` em `req.close`.
Bloqueia com 409 `SSE_DISABLED` se `AI_CONTROL_ENABLE_SSE=false`.

## 6. Sanitização — `ai-control-sanitize.ts`

`sanitizeForObservability(value)` redige recursivamente chaves sensíveis (regex cobrindo
`authorization, cookie, password/senha, secret, api[-_]?key/apikey, token, bearer, jwt, recaptcha,
x-amz, client_secret, refresh_token, access_token, private_key`) → `[REDACTED]`. Limites:
profundidade 6 (`[depth-limit]`), strings 4000 chars (`…[truncated]`), arrays 200 itens.
`maskSecret(value)` mascara para diagnóstico (`abc…yz (len=N)`), nunca o valor completo.

Aplicada **antes** de: persistir em `ai_trace_events`, emitir no SSE, e qualquer payload de saída.
Combinada com a regra do `ai-control-config` (frontend só recebe `*Configured: boolean`), nenhum
segredo chega ao Langfuse, ao log ou ao frontend.

## 7. Métricas no overview

`getOverview()` chama `getObservabilityProvider().getMetrics()`. Quando o resultado é
`available:true`, alimenta `metrics.cost { totalCost, inputTokens, outputTokens, avgLatencyMs }`;
caso contrário `cost` fica `null`. As demais métricas (turnos, outcomes, topTools, blocks) vêm da
telemetria conversacional em memória. `langfuse` no overview vem de `getLangfuseStatus()`.

## 8. Pendências conhecidas

- A ponte **persiste** traces SICAT em `ai_trace_events`, mas **não há push ativo** de spans para o
  Langfuse externo nesta fase — o adapter Langfuse é de **leitura** (traces/observations/metrics/prompts).
  Linhas com `trace_source='langfuse'` ficam reservadas para sincronização futura.
- `LangfuseObservabilityProvider.getMetrics().avgLatencyMs` é `null` (a daily-metrics não expõe
  latência agregada). Ver handoff 08.
