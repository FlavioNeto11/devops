# AI Control Center — 07 · Segurança & RBAC

> Work ID: `ai-control-center` · Branch: `feature/ai-control-center-langfuse`
> FASE 6 (transversal) · Aplica-se a: rotas, services, observabilidade

## 1. Objetivo

Garantir que toda a superfície administrativa seja **admin-only**, governada por modo somente-leitura
e confirmação explícita para ações sensíveis, sem vazar segredos e sem SQL fora de repos/migrations.

## 2. Gate de admin

Toda rota usa `sicatAuthMiddleware` (injeta `req.sicatUser`) seguido de
`ensureAiControlAdmin(actor)` (`ai-control-auth.ts`):

- exige `userId` (senão **401** `UNAUTHENTICATED`);
- reusa o RBAC existente `resolveAdminAccessSummary(actor)` (token-role **ou** acesso global no banco);
  se `!allowed` → **403** `ADMIN_REQUIRED`;
- retorna o `userId` do ator (usado como `createdBy`/`requestedBy` na auditoria).

Não há um papel novo: o AI Control Center herda o mesmo admin do resto do SICAT.

## 3. Gate de módulo (`AI_CONTROL_ENABLED`)

Middleware global em `createAiControlRouter()` sobre `/v1/ai-control`: se
`getAiControlConfig().enabled === false`, responde **404** `AI_CONTROL_DISABLED` (o módulo "não
existe" quando desligado).

## 4. Modo somente-leitura (`assertAiControlWritable`)

`assertAiControlWritable()` lança **409** `AI_CONTROL_READONLY` quando `AI_CONTROL_READONLY=true`.
Chamado em **toda** rota de mutação administrativa. Independentemente disso, o policy-service também
bloqueia **ações operacionais do chat** (`isAction && isAiControlReadOnly()`) com reasonCode
`AI_CONTROL_READONLY` (ver handoff 02) — ou seja, o modo readonly congela tanto a administração
quanto as ações da IA.

## 5. Confirmação explícita (`requireConfirmation` → 428)

`requireConfirmation(confirmed, message)` lança **428** `CONFIRMATION_REQUIRED` se o corpo não trouxer
`confirmed:true`. Aplicado a operações destrutivas/sensíveis:

- limpar memória da sessão (DELETE);
- reindexar a base de conhecimento (consome OpenAI);
- rodar smoke **full**;
- ativar/rollback de versão de prompt;
- sincronizar prompt do Langfuse;
- habilitar/desabilitar uma **ACTION tool** (apenas quando `policy.isAction` e o patch mexe em `enabled`).

## 6. Sanitização e ausência de segredos

- `sanitizeForObservability` (handoff 03): redige `authorization/cookie/password/senha/secret/api_key/
  apikey/token/bearer/jwt/recaptcha/x-amz/client_secret/refresh_token/access_token/private_key` antes
  de persistir/streamar/enviar.
- **Frontend nunca recebe segredos**: `ai-control-config.ts` expõe apenas flags
  `publicKeyConfigured`/`secretKeyConfigured` (`*Configured: boolean`); `publicKey`/`secretKey` ficam
  só no backend (e o `LangfuseClient` usa Basic auth internamente). `maskSecret` é o único caminho que
  toca um segredo, e ainda assim mascarado (`abc…yz (len=N)`).
- **SQL só em repos/migrations**: services e rotas nunca emitem SQL; toda query passa por
  `src/repositories/ai-*-repo.ts`.

## 7. Matriz de endpoints (gates)

`A` = admin (todos exigem), `W` = `assertAiControlWritable`, `C` = `requireConfirmation` (428).

| Método · Endpoint | A | W | C |
|---|:--:|:--:|:--:|
| GET `/v1/ai-control/overview` · `/health` · `/settings` | ✓ | | |
| GET `/runtime/tools` · `/tools/:t` · `/tools/:t/versions` | ✓ | | |
| PATCH `/runtime/tools/:toolName` | ✓ | ✓ | ✓ (só se `isAction` + altera `enabled`) |
| GET `/runtime/agents` · `/agents/:a` | ✓ | | |
| PATCH `/runtime/agents/:agentName` | ✓ | ✓ | |
| GET `/runtime/policies` | ✓ | | |
| PATCH `/runtime/policies/:policyId` | ✓ | ✓ | |
| GET `/prompts` · `/prompts/:name` | ✓ | | |
| POST `/prompts/:name/versions` | ✓ | ✓ | |
| POST `/prompts/:name/activate` | ✓ | ✓ | ✓ |
| POST `/prompts/:name/sync-langfuse` | ✓ | ✓ | ✓ |
| GET `/knowledge/sources` · `/knowledge/chunks` | ✓ | | |
| POST `/knowledge/test-retrieval` | ✓ | | |
| PATCH `/knowledge/sources/:sourceKey` | ✓ | ✓ | |
| POST `/knowledge/reindex` | ✓ | ✓ | ✓ |
| GET `/memory/:sessionId` · `/memory/:sessionId/history` | ✓ | | |
| DELETE `/memory/:sessionId` | ✓ | ✓ | ✓ |
| POST `/memory/:sessionId/export` | ✓ | | |
| POST `/memory/:sessionId/rebuild-summary` | ✓ | ✓ | |
| GET `/traces/local` · `/traces/local/:turnId` | ✓ | | |
| GET `/langfuse/status` · `/traces` · `/traces/:id` · `/observations` · `/prompts` · `/metrics` · `/deeplink/:id` | ✓ | | |
| GET `/evals` · `/evals/:runId` | ✓ | | |
| POST `/evals/run` | ✓ | | ✓ (só modo `full`) |
| GET `/events/stream` (SSE) | ✓ | | |

Observações: `POST /evals/run` **não** chama `assertAiControlWritable` (eval é leitura/observação, não
mutação de catálogo) — mas `full` exige confirmação **e** `AI_CONTROL_ALLOW_FULL_SMOKE=true`. SSE
exige `AI_CONTROL_ENABLE_SSE=true` (senão 409 `SSE_DISABLED`). `export` de memória não é writable mas
grava evento de auditoria.

## 8. Pendências conhecidas

- Não há rate-limit dedicado nas rotas administrativas além do gate de admin/readonly/confirmação.
- A confirmação é por flag no corpo (`confirmed:true`), sem token/nonce de uso único. Ver handoff 08.
