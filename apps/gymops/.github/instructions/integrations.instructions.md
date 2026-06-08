---
applyTo: "apps/api/src/routes/integrations/**/*.ts,apps/api/src/routes/notifications/**/*.ts,apps/api/src/lib/whatsapp.ts,apps/api/src/lib/mailer.ts,apps/api/src/lib/push.ts,apps/api/src/lib/crypto.ts,apps/web/src/app/**/integrations/**/*.tsx,docs/integrations*.md"
---

# Instruções — Integrações Externas

Aplicam-se a todo código que conecta o GymOps a sistemas externos (Trello, SMTP, Twilio, Web Push, R2, Google OAuth).

## Princípio geral

**Integração é detalhe de implementação de uma funcionalidade de negócio.** A UI nunca expõe configuração técnica crua ao usuário — sempre estado de negócio: "Conectado", "Falhando", "Desconectar", "Testar canal".

## Estado canônico das integrações

Atualizar [`docs/integrations.md`](../../docs/integrations.md) sempre que adicionar/remover/alterar.

| Integração | Estado | Provedor |
|---|---|---|
| SMTP (e-mail transacional) | ✅ | Nodemailer + provedor configurável (Resend recomendado) |
| Web Push | ✅ | web-push VAPID (**não Firebase**) |
| WhatsApp | ⚠️ envio OK, falta validação UI | Twilio |
| Trello (JSON upload + OAuth) | ✅ | Trello REST + AES-256-GCM para token |
| Google OAuth | ✅ | fetch nativo (sem googleapis dep) |
| Cloudflare R2 | ✅ | @aws-sdk/client-s3 com endpoint custom |
| OpenAI | ✅ | SDK oficial com structured outputs |

## Segredos — nunca commitar

- Apenas arquivos `.env.example` e `.env.docker.example` no repo.
- Tokens reais em `.env` (gitignored).
- Variáveis listadas em [`README.md`](../../README.md) e [`docs/status.md`](../../docs/status.md).
- `ENCRYPTION_KEY` regex `^[0-9a-fA-F]{64}$` obrigatória em produção (boot guard).

## Tokens OAuth criptografados

Tokens de integração (Trello, Google futuro Drive, etc.) **sempre** criptografados com AES-256-GCM antes de gravar em `integration_accounts.auth_jsonb`:

```typescript
import { encrypt, decrypt } from '../../lib/crypto.js';

// Write
const encrypted = encrypt(JSON.stringify({ accessToken, refreshToken }));
await db.integrationAccount.create({ data: { provider: 'trello', authJsonb: { v: 1, data: encrypted } } });

// Read
const stored = await db.integrationAccount.findFirstOrThrow({ where: { ... } });
const payload = JSON.parse(decrypt((stored.authJsonb as any).data));
```

## Health / status endpoint

Toda integração com conexão persistente deve expor health endpoint:

| Endpoint | O que retorna |
|---|---|
| `GET /integrations/trello/health?organizationId=` | `{ connected, healthy, connectedAt? }` |
| `GET /integrations/whatsapp/status?organizationId=` | `{ configured, sandbox, from, lastErrors[] }` |
| (futuro) `GET /integrations/google/status` | `{ connected, expiresAt }` |

Retornar **estado amigável de negócio**, não dump de configuração técnica.

## Reconnect e ciclo de vida

Quando token expira ou conexão quebra:

- `POST /integrations/<provider>/reconnect` — retorna URL de autorização nova
- UI mostra estado "Conexão expirada" com botão "Reconectar"
- Não mostrar erro técnico bruto ("HTTP 401 from Trello") — traduzir

## Logs de entrega (notification_deliveries)

Toda tentativa de envio de notificação deve gerar registro:

```typescript
await db.notificationDelivery.create({
  data: {
    organizationId,
    userId,
    channel: 'whatsapp',
    type: 'activity_assigned',
    status: success ? 'sent' : 'failed',
    providerMessageId: result?.sid,
    errorMessage: error?.message,
    requestPayloadJson: { to, body } as unknown as Prisma.InputJsonValue,
  },
});
```

Expor via `GET /notifications/deliveries` (admin only) e UI em `/settings/page.tsx` seção "Log de entregas".

## Teste de canal

`POST /notifications/test` aceita `{ channel: 'email' | 'push' | 'whatsapp', organizationId }`:

- Envia mensagem real para o usuário autenticado
- Registra delivery
- Retorna `{ data: { sent: boolean } }`

Permite o admin validar configuração sem precisar criar atividade real.

## Fallback gracioso quando env não configurado

Se `SMTP_*`, `TWILIO_*`, `VAPID_*`, `R2_*` ou `OPENAI_API_KEY` ausentes:

- Worker **não trava** — pula a operação e loga warning
- Endpoint de teste retorna **422 com mensagem amigável** ("WhatsApp não configurado nesta organização")
- UI mostra estado "Não configurado" e instruções de configuração

Nunca retornar 500 por falta de configuração externa.

## R2 (storage de arquivos)

- Wrapper inline em `apps/api/src/routes/attachments/index.ts` usando `@aws-sdk/client-s3`
- Endpoint custom: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
- Upload via **presigned URL** (frontend → R2 direto, sem passar pelo backend)
- Validar MIME type + tamanho máximo (10MB para anexo, 5MB para avatar/logo) **antes** de gerar presign

## Trello

- Modo 1: upload de JSON (sem OAuth) → `POST /imports/json`
- Modo 2: OAuth implícito → `/integrations/trello/start` → frontend captura `#token=` → `POST /integrations/trello/connect`
- Token armazenado criptografado
- Health check: `fetchTrelloBoards()` — se erro 401, marcar como `healthy: false`

## WhatsApp

- Função `sendWhatsApp(to: string, message: string)` — assinatura **posicional** (não objeto)
- Sandbox: dev/test; números precisam entrar no sandbox
- Produção: requer aprovação Meta + templates pré-aprovados (mensagens iniciadas pelo negócio)
- Sempre opt-in via `notification_preferences.whatsapp = true`
- Telefone do usuário em E.164 (`+5511999998888`) — validar regex `/^\+[1-9]\d{1,14}$/`

## E-mail (SMTP)

- `apps/api/src/lib/mailer.ts` — Nodemailer com transporter compartilhado
- Templates inline (não usar libs de templating no MVP)
- Sempre `from` configurado (`SMTP_FROM=GymOps <noreply@gymops.com>`)
- HTML + texto plain como fallback

## Web Push (VAPID)

- `apps/api/src/lib/push.ts` — `web-push` lib (não Firebase)
- Endpoint `GET /notifications/vapid-key` retorna public key
- `POST /notifications/subscribe` salva subscription em `notification_preferences.config` JSONB
- Service Worker em `apps/web/public/sw.js`
- Service Account de Firebase: **não usar** — projeto migrou para VAPID puro

## Google OAuth

- Implementação com `fetch` nativo (sem dependência `googleapis`)
- Authorization code flow
- Callback seta cookie httpOnly temporário (60s); frontend consome via `GET /auth/consume`
- **Sem `?token=` na URL** — segurança

## IA (OpenAI)

- SDK `openai` oficial
- `response_format: { type: 'json_object' }` — sempre validar com Zod na resposta
- Timeout 10s síncrono, 60s worker
- `callAI(fn, fallback, timeoutMs)` em `apps/api/src/lib/ai-helper.ts` — fallback gracioso
- **Nunca enviar atividade `restricted` ao LLM** — guard com `resolveActivityPermission`
- Rate limit 10 req/min por userId

## UI das integrações

Tela `/settings/integrations` deve mostrar:

- Card por integração: status (Conectado/Desconectado/Falhando), botão Conectar/Reconectar/Desconectar
- Quando não configurada no servidor: estado "Não configurada — entre em contato com o admin"
- Sem expor URL de OAuth ou tokens diretamente

## Atualizar `docs/integrations.md` ao mexer

Quando criar/alterar/remover integração:

- Atualizar tabela de status no topo
- Documentar novos endpoints
- Listar gaps conhecidos
- Documentar variáveis de ambiente novas
- Apontar para o arquivo `lib/<provider>.ts` correspondente
