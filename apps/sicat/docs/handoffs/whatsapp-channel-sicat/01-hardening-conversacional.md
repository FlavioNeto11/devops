# 01 — Fase 0 · Endurecimento da superfície conversacional

| Campo | Valor |
|---|---|
| `work_id` | `whatsapp-channel-sicat` |
| Fase | 0 (pré-requisito de segurança) |
| Branch | `sicat/whatsapp-channel` |
| Data | 2026-08-06 |
| Status | ✅ concluída |

## 1. Por que esta fase existe

O canal WhatsApp não podia ser aberto sobre a superfície conversacional como ela estava. Três
propriedades se combinavam num bypass completo da governança:

1. `POST /v1/conversations/turns` **não tinha autenticação real** — `sicatAuthMiddleware` não era
   aplicado, e o `authMiddleware` global só checava o prefixo `Bearer ` sem verificar assinatura.
2. `channel`, `userId`, `integrationAccountId` e `sessionContextId` chegavam **auto-declarados no
   corpo**. Como a matriz de policy é indexada por canal (`allowChannels`), declarar
   `channel: 'inapp'` liberava tudo que o WhatsApp deveria ter bloqueado; e declarar o
   `integrationAccountId` de outro usuário era aceito sem checagem de posse.
3. `normalizeChannel` fazia fallback **silencioso para `inapp`** — o canal mais permissivo — diante de
   qualquer valor desconhecido.

Somava-se a ausência total de rate limit (nenhuma rota tinha) numa superfície em que cada turno custa
chamada de LLM.

## 2. O que mudou

| # | Mudança | Arquivo |
|---|---|---|
| 1 | **Principal conversacional** — identidade resolvida no servidor, vence o corpo | `src/services/conversation/conversation-principal.ts` (novo) |
| 2 | `channel` deixa de ser livre: cliente HTTP só declara `native_chat`/`inapp`; `whatsapp` → **403**; desconhecido → **400** | idem |
| 3 | Conta CETESB e sessão CETESB derivadas do banco pelo `userId` autenticado | `src/services/sicat-account-service.ts` → `resolveActiveAccountContext` |
| 4 | Permissões efetivas resolvidas no servidor (encanamento; gate segue fail-open — ver §4) | `src/repositories/access-admin-repo.ts` → `listPermissionKeysByUserId` |
| 5 | `ConversationContext` separa campos confiáveis (principal) de derivados da requisição | `src/services/conversation/conversation-context-service.ts` |
| 6 | `sicatAuthMiddleware` nas 5 rotas conversacionais | `src/routes/conversation-routes.ts` |
| 7 | Rate limit por principal: 40 turnos / 5 min → **429** + `Retry-After` | `src/lib/rate-limit.ts` (novo) |
| 8 | Escopo de artefato vem do principal, não de query params opcionais (fecha metade da L6) | `src/routes/conversation-routes.ts` |
| 9 | Frontend para de enviar identidade; manda só contexto de tela | `frontend/src/composables/{useConversationalChatApp,useInAppCopilot}.js` |

**Códigos de erro novos:** `CONVERSATION_CHANNEL_NOT_CLIENT_DECLARABLE` (403),
`CONVERSATION_CHANNEL_INVALID` (400), `CONVERSATION_PRINCIPAL_UNRESOLVED` (401),
`CONVERSATION_RATE_LIMITED` (429).

## 3. Lacunas do `00-orchestration.md` fechadas

**L3** (auth auto-declarada) ✅ · **L9** (sem rate limit) ✅ · **L10** (canal permissivo) ✅ ·
**L6** ⚠️ parcial — escopo do artefato agora é do principal e a rota exige autenticação; falta a URL
assinada de curta duração (fase 6). **L4** ❌ adiada com justificativa — ver §4.

## 4. Decisão: o RBAC continua fail-open (por ora)

`hasConversationPermission` devolve `true` quando o usuário não tem nenhuma permissão. Verificado no
banco vivo em 2026-08-06:

| Tabela | Linhas |
|---|---|
| `access_permissions` | **0** |
| `access_roles` | 1 |
| `access_user_roles` | 2 |
| `sicat_users` | 5 |
| `conversation_sessions` | 191 |

A migration `008` cria as tabelas de RBAC mas **não semeia catálogo algum**, e nada em
`bootstrap/base-data.ts` semeia depois. Fechar o gate agora faria toda ação do chat responder
`PERMISSION_DENIED` para todo mundo, contra 191 sessões de uso real.

Com a fase 0 aplicada, o fail-open **não permite mais acesso cruzado** (a conta vem do banco pelo
usuário autenticado) — significa apenas "todo usuário autenticado tem as mesmas permissões", que é o
status quo. Mas é **pré-requisito da fase 5**: liberar ações R3/R4 por WhatsApp sem fechar isto seria
liberá-las para qualquer usuário autenticado. Registrado como **fase 4.5**.

## 5. Validação

| Gate | Resultado |
|---|---|
| `npm run typecheck` (backend) | ✅ zero erros |
| `npm run lint` (backend) | ✅ zero problemas |
| `npx tsx --test tests/unit/*.test.js` | ✅ **254 testes / 219 pass / 35 fail** — as 35 são **idênticas à baseline** medida na branch limpa (245/210/35). Zero regressão; +9 testes novos, todos verdes |
| `npm run validate:openapi` | ✅ OpenAPI válido. O comando falha depois, em `validate-cetesb-source-of-truth.js` (`backend/docs/cetesb` ausente — HARs não versionados por conterem JWT/CPF). **Pré-existente**, coerente com os testes de HAR que já falhavam na baseline |
| `npx tsx scripts/validate-markdown-links.js` | ✅ nenhum link/âncora quebrado |
| `npm run test:unit:frontend` | ✅ **180/180** |
| `npm run build:frontend` | ✅ (aviso de chunk > 500 kB é pré-existente — F3) |

**Baseline de falhas pré-existentes** (medida com `git stash` na mesma branch): `validate-agent-architecture`,
`ai-config model separation`, `lookupManifestByHash` fallback, 4 de HAR, `conversation-service provider
unavailability`, `validateHarGatewayStructure`, `LLM model routing`, `LLM Provider Escalation` — 35 no total.

## 6. Testes adicionados

- `tests/unit/conversation-principal.test.js` — 4 casos: `whatsapp` rejeitado (inclusive com variação
  de caixa/espaços), canal desconhecido → 400 em vez de cair em `inapp`, token sem usuário → 401.
- `tests/unit/rate-limit.test.js` — 5 casos: teto, isolamento por chave, `remaining`, expiração de
  janela, `reset`.

## 7. Pendências abertas por esta fase

1. **Rotas conversacionais seguem fora do OpenAPI** (L11) — a mudança de contrato desta fase (401/403/
   400/429) precisa ser publicada na fase 7.
2. **Rate limit é em memória** — correto para 1 réplica com `Recreate` (topologia atual), vira contagem
   por réplica se escalar. Registrado no cabeçalho de `src/lib/rate-limit.ts`.
3. **Fase 4.5** (catálogo de permissões) passa a bloquear a fase 5.
