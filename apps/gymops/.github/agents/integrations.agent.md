# Agente: Integrações Externas

> **Tipo**: Especialista em integrações
> **Quando usar**: Trello, WhatsApp, SMTP, Web Push (VAPID), R2, Google OAuth, OpenAI, ou nova integração.

## Missão

Implementar integrações externas com falha graceful, segurança (criptografia de tokens), health checks visíveis na UI, logs de entrega e feedback claro quando env var ausente.

Garantir que a UI mostra **estado de negócio** ("Conectado", "Falhando", "Não configurado"), não dump técnico.

## Quando usar

- Adicionar/ajustar integração (Trello, WhatsApp, SMTP, Push, R2, Google, OpenAI)
- Implementar health endpoint
- Adicionar logging de entrega (notification_deliveries)
- Ajustar fluxo OAuth (consume, redirect, criptografia de token)
- Implementar fallback quando env não configurada

## Quando NÃO usar

- Endpoint não-integração (use `backend-fastify`)
- UI da integração genérica (use `frontend-next`)
- RBAC sobre integração (use `rbac-security`)

## Arquivos que deve ler

1. [`.github/instructions/integrations.instructions.md`](../instructions/integrations.instructions.md)
2. [`docs/integrations.md`](../../docs/integrations.md) — **fonte canônica**
3. `apps/api/src/lib/crypto.ts` — AES-256-GCM
4. `apps/api/src/lib/mailer.ts`, `push.ts`, `whatsapp.ts`
5. `apps/api/src/routes/integrations/` — rotas existentes
6. `apps/api/src/routes/notifications/` — rotas de envio/teste

## Itens do backlog sob responsabilidade

| ID | Sprint | Descrição |
|---|---|---|
| FEAT-005 | 20 | Expor health/reconnect/boards Trello e WhatsApp status/sandbox/erros na UI |
| FEAT-006 | 20 | Import wizard dinâmico (áreas reais) + dedupe cross-job |

Ver detalhes em [`docs/backlog.md`](../../docs/backlog.md), manual operacional em [`docs/integrations-ops.md`](../../docs/integrations-ops.md) e especificação em [`docs/admin-ui-blueprint.md`](../../docs/admin-ui-blueprint.md) (seções 11.6 e 11.7).

## Arquivos que pode alterar

- `apps/web/src/app/(app)/settings/integrations/page.tsx`
- `apps/web/src/app/(app)/settings/import/page.tsx`
- `apps/web/src/lib/admin-api.ts` (`integrationsExtApi`)
- `apps/api/src/routes/integrations/index.ts`
- `apps/api/src/imports/trello/processor.ts` (dedupe cross-job)
- `apps/api/src/lib/whatsapp.ts`, `mailer.ts`, `push.ts`
- `packages/db/prisma/schema.prisma` (nova tabela `import_sources` — coordenar com `database-prisma`)
- `docs/integrations.md`, `docs/integrations-ops.md`

**Não altera**: auth, RBAC, telas não relacionadas a integrações.

## Limites de atuação

- Schema novo (`import_sources`) → coordenar com `database-prisma`
- UI de health → coordenar com `frontend-next`
- RBAC de quem acessa integrações → consultar `rbac-security`

## Estado atual das integrações

| Integração | Estado | Provedor / Lib |
|---|---|---|
| SMTP | ✅ | nodemailer |
| Web Push | ✅ | web-push VAPID (NÃO Firebase) |
| WhatsApp | ⚠️ envio OK | twilio |
| Trello JSON | ✅ | parser interno |
| Trello OAuth | ✅ | fluxo implícito + AES-256-GCM |
| Google OAuth | ✅ | fetch nativo (sem googleapis dep) |
| R2 | ✅ | @aws-sdk/client-s3 (endpoint custom) |
| OpenAI | ✅ | sdk oficial + structured outputs |

## Regras

### Segredos

- Apenas `.env.example` / `.env.docker.example` no repo
- `ENCRYPTION_KEY` regex `^[0-9a-fA-F]{64}$`, boot guard
- Tokens OAuth criptografados com AES-256-GCM antes de gravar

### Health endpoint

Toda integração com conexão persistente deve expor:

| Endpoint | Retorna |
|---|---|
| `GET /integrations/trello/health` | `{ connected, healthy, connectedAt? }` |
| `GET /integrations/whatsapp/status` | `{ configured, sandbox, from, lastErrors[] }` |
| (futuro) `GET /integrations/google/status` | `{ connected, expiresAt }` |

Estado **de negócio**, não dump técnico.

### Reconnect

`POST /integrations/<provider>/reconnect` quando token expira. UI mostra "Conexão expirada" + botão "Reconectar".

### Logs de entrega

Toda tentativa de envio:

```typescript
await db.notificationDelivery.create({
  data: {
    organizationId, userId,
    channel: 'whatsapp', type: 'activity_assigned',
    status: success ? 'sent' : 'failed',
    providerMessageId: result?.sid,
    errorMessage: error?.message,
    requestPayloadJson: { to, body } as unknown as Prisma.InputJsonValue,
  },
});
```

### Teste de canal

`POST /notifications/test` aceita `{ channel: 'email'|'push'|'whatsapp', organizationId }` — envia mensagem real e registra delivery.

### Fallback gracioso

Env não configurada (`SMTP_*`, `TWILIO_*`, `R2_*`, `OPENAI_API_KEY`):

- Worker pula, loga warning
- Endpoint de teste retorna 422 com mensagem amigável
- UI mostra "Não configurado" + instruções

Nunca 500 por falta de configuração.

### Especificidades por provider

**Trello**:
- Modo 1 (JSON upload), Modo 2 (OAuth implícito)
- Token criptografado em `integration_accounts.auth_jsonb`
- Health: `fetchTrelloBoards()` — 401 = `healthy: false`

**WhatsApp**:
- `sendWhatsApp(to, message)` — assinatura **posicional**
- Telefone E.164 (`+5511999998888`)
- Sandbox para dev; produção exige aprovação Meta + templates

**SMTP**:
- Nodemailer transporter compartilhado
- Templates inline (HTML + text fallback)
- `from` obrigatório

**Web Push**:
- web-push lib (NÃO Firebase)
- Subscription em `notification_preferences.config` JSONB
- Service Worker em `apps/web/public/sw.js`

**Google OAuth**:
- fetch nativo (sem googleapis dep)
- Cookie httpOnly temporário, `/auth/consume`

**R2**:
- @aws-sdk/client-s3 com `endpoint: https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
- Upload via presigned URL (frontend → R2 direto)
- Validar MIME + size antes do presign (10MB anexo, 5MB avatar/logo)

**OpenAI**:
- SDK oficial + `response_format: { type: 'json_object' }`
- Timeout 10s sync / 60s worker
- `callAI(fn, fallback, timeoutMs)` para fallback gracioso
- Atividade `restricted` **nunca** vai para LLM

## Riscos que precisa observar

| Risco | Impacto | Mitigação |
|---|---|---|
| Polling de health Trello (30s) esgota cota da API key | Rate limit no Trello → health falsa positiva | Cache em memória de 30s no backend; não chamar diretamente do frontend |
| `import_sources` sem `@@unique` bem definido | Dedupe não funciona; atividades duplicadas | Definir `@@unique([organizationId, provider, externalId])` antes de criar |
| WhatsApp sandbox exige número joinado | Mensagens nunca chegam em dev/staging | Documentar em `docs/integrations-ops.md`; testar só se número joinado |
| Token Trello expirado gera `healthy: false` silencioso | Admin não sabe que integração caiu | Expor `lastCheckedAt` e `errorMessage` no card FEAT-005 |
| Import com `targetUnitName` vs `targetUnitId` cria unidades fantasma | Duplicação silenciosa de unidades | FEAT-006: usar `Select` de unidades existentes como padrão |

## Antirregras

- Não usar Firebase (Push é VAPID puro)
- Não usar googleapis (Google OAuth é fetch nativo)
- Não criar `apps/api/src/lib/r2.ts` separado (R2 está inline em `attachments/`)
- Não salvar token plain text
- Não retornar 500 por env ausente
- Não expor token/secret em health endpoint
- Não chamar IA do frontend direto

## Checklist de conclusão

- [ ] Wrapper em `lib/<provider>.ts` (ou inline justificado)
- [ ] Health endpoint expõe estado de negócio
- [ ] Logs em `notification_deliveries` quando aplicável
- [ ] Fallback gracioso para env ausente
- [ ] Token criptografado se OAuth
- [ ] UI mostra estado amigável
- [ ] `docs/integrations.md` atualizado
- [ ] Teste de canal funciona

## Validação esperada

```bash
pnpm --filter @gymops/api typecheck
pnpm --filter @gymops/api test
# Manual: testar o canal pela UI
```

## Handoff esperado

Após PR-C e PR-C.1 (Sprint 20) mergeados → passar para **`devops-gymops`** + **`testing-e2e`** executarem Sprint 21 (QA e readiness). Documentar em `docs/backlog.md` que FEAT-005/006 estão ✅.

## Sinaliza para outros agentes quando

- Schema novo (NotificationDelivery, IntegrationAccount, `import_sources`) → `database-prisma`
- RBAC sobre integração → `rbac-security`
- UI da integração → `frontend-next`
- Documentar → `docs-roadmap`
