# Integrações Externas

**Última atualização**: 2026-05-15

| Integração | Status | Notas |
|------------|--------|-------|
| SMTP / E-mail | ✅ Funcional | mailer.ts + notification-worker; crons 08h/09h |
| Web Push (VAPID) | ✅ Funcional | web-push; push.ts; subscription via /notifications/subscribe |
| WhatsApp Twilio | ⚠️ Envio OK | whatsapp.ts + worker; sem validação do canal na UI |
| Trello (JSON upload) | ✅ Funcional | Dry-run + commit atômico + relatório |
| Trello (OAuth implícito) | ✅ Funcional | /integrations/trello/start → hash → /connect; criptografia AES-256-GCM |
| Google OAuth | ✅ Funcional | fetch nativo; cookie httpOnly + /auth/consume |
| Google Drive | ❌ Sprint 15+ | Somente link externo; sem picker |
| OneDrive | ❌ Sprint 15+ | — |
| Stripe | ❌ Pós-MVP | Modelo de dados planejado para Sprint 16 |

---

## SMTP — E-mail transacional

### Implementação atual

```typescript
// apps/api/src/lib/mailer.ts
import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT ?? 587),
  secure: false,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});
```

### Templates enviados

| Template | Quando |
|---|---|
| `activity_assigned` | Atividade atribuída ao usuário |
| `activity_due_reminder` | 1 dia antes do prazo (cron 08h) |
| `activity_overdue` | Prazo vencido (cron 09h) |
| `daily_summary` | Resumo diário para gestores (07h) |
| `import_complete` | Importação Trello concluída |

Templates de convite (`invite`) ainda não implementados — aguardam Sprint 11 (fluxo de convites com token).

### Provedor recomendado

Resend, Postmark ou AWS SES. Trocar apenas as variáveis `SMTP_*`.

---

## Web Push — VAPID

### Arquitetura atual

```
Backend (web-push VAPID)
    │
    │ Push Protocol
    ▼
Service Worker (apps/web/public/sw.js)
    │
    ▼
Notificação no browser/PWA
```

> **Nota**: A documentação anterior referenciava Firebase Admin / FCM. A implementação real usa `web-push` com chaves VAPID — não há dependência de Firebase neste projeto.

### Endpoints

| Rota | Descrição |
|---|---|
| `GET /notifications/vapid-key` | Retorna a VAPID public key para o frontend |
| `POST /notifications/subscribe` | Salva subscription do browser (salvo em `notification_preferences.config` JSONB) |
| `GET /notifications/preferences` | Preferências do usuário por canal |
| `PATCH /notifications/preferences` | Atualizar toggles por canal |
| `POST /notifications/test` | Enviar notificação de teste (e-mail + push; WhatsApp ainda não implementado) |

### Gerar chaves VAPID

```bash
npx web-push generate-vapid-keys
```

Salvar `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` e `VAPID_SUBJECT` nas variáveis de ambiente.

### Service Worker

```javascript
// apps/web/public/sw.js
self.addEventListener('push', (event) => {
  const data = event.data.json();
  self.registration.showNotification(data.title, {
    body: data.body,
    icon: '/icons/icon-192.svg',
    badge: '/icons/badge-72.svg',
    data: { url: data.url },
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  clients.openWindow(event.notification.data.url);
});
```

---

## WhatsApp — Twilio

### Estado atual

O mecanismo de envio está implementado e integrado no `notification-worker`. Envios ocorrem para:
- Atividade crítica atribuída ao usuário
- Atividade crítica com prazo vencido

Condicionado a: usuário com `notification_preferences.whatsapp = true` + `users.phone` preenchido.

### Gap atual (Sprint 14)

| Item | Estado |
|------|--------|
| Mecanismo de envio (whatsapp.ts + worker) | ✅ OK |
| Toggle na UI (/settings/integrations) | ✅ OK |
| Tela de perfil para cadastrar telefone | ❌ Sprint 9 |
| POST /notifications/test com canal whatsapp | ❌ Sprint 14 |
| GET /integrations/whatsapp/status | ❌ Sprint 14 |
| Delivery log de tentativas | ❌ Sprint 14 |

### Considerações de produção

- **Sandbox Twilio**: para desenvolvimento. Somente usuários que entraram no sandbox recebem mensagens.
- **Produção**: requer aprovação de número WhatsApp Business pela Meta. Envios fora do sandbox exigem templates pré-aprovados para mensagens iniciadas pelo negócio.
- Número do usuário em `users.phone` no formato E.164 (`+5511999998888`)
- Opt-in obrigatório via `notification_preferences.whatsapp`

### Implementação atual

```typescript
// apps/api/src/lib/whatsapp.ts
export async function sendWhatsApp(to: string, message: string) {
  const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  await client.messages.create({
    from: `whatsapp:${process.env.TWILIO_WHATSAPP_FROM}`,
    to: `whatsapp:${to}`,
    body: message,
  });
}
```

### Endpoints planejados (Sprint 14)

| Método | Rota | Objetivo |
|---|---|---|
| POST | `/notifications/test` (ampliar) | Implementar ramo `channel: 'whatsapp'` |
| GET | `/integrations/whatsapp/status` | Sandbox vs produção, sender, últimas falhas |
| GET | `/notifications/deliveries` | Histórico de entregas por canal |

**Modelo de dados sugerido (Sprint 14)**:
```prisma
model NotificationDelivery {
  id                String   @id @default(uuid())
  userId            String
  channel           String   // email | push | whatsapp
  type              String   // activity_assigned | due_reminder | etc.
  status            String   // sent | failed | pending
  providerMessageId String?
  errorMessage      String?
  createdAt         DateTime @default(now())
  user              User     @relation(fields: [userId], references: [id])
}
```

---

## Trello

### Modo 1 — Upload de JSON

Usuário exporta o board do Trello (`Menu → More → Print, export, and share → Export as JSON`) e faz upload na tela `/settings/import`.

**Fluxo**: upload → dry-run (processamento assíncrono) → preview com mapeamento sugerido → revisão do wizard → commit atômico → relatório final.

### Modo 2 — OAuth implícito (implementado)

```
1. Usuário clica "Conectar Trello" em /settings/integrations
2. Backend: GET /integrations/trello/start → retorna URL de autorização
3. Frontend: abre URL Trello (/1/authorize?callback_method=fragment&...)
4. Trello: redireciona com #token=... no hash da URL
5. Frontend: captura token do hash → POST /integrations/trello/connect
6. Backend: valida token listando boards → criptografa com AES-256-GCM → salva em integration_accounts
```

### Endpoints de importação

| Rota | Descrição |
|---|---|
| `POST /integrations/trello/start` | Retorna URL de autorização Trello |
| `POST /integrations/trello/connect` | Salva token (criptografado) |
| `DELETE /integrations/trello/disconnect` | Remove conta de integração |
| `GET /integrations/trello/boards` | Lista boards disponíveis via API Trello |
| `POST /imports/json` | Cria job de importação (upload JSON) |
| `POST /imports/api` | Cria job de importação (via API Trello) |
| `GET /imports/:id` | Status e progresso do job |
| `GET /imports/:id/preview` | Preview com mapeamento sugerido |
| `PATCH /imports/:id/mapping` | Salvar decisões do wizard |
| `POST /imports/:id/commit` | Commit atômico (transação Prisma) |

### Endpoints planejados (Sprint 13)

| Método | Rota | Objetivo |
|---|---|---|
| GET | `/integrations/trello/health` | Testar se token ainda é válido |
| POST | `/integrations/trello/reconnect` | Renovar token expirado |
| GET | `/imports/:id/items` | Itens detalhados do job (criados, ignorados, falhos) |
| POST | `/imports/:id/retry` | Reenfileirar job falho |
| POST | `/imports/:id/cancel` | Cancelar job em processamento |

---

## Google OAuth

### Implementação atual

```
1. Usuário clica "Entrar com Google"
2. Frontend: GET /auth/google/start → redirect para Google
3. Google: callback para GET /auth/google/callback
4. Backend: troca code por tokens via fetch nativo (googleapis não usado)
5. Backend: seta cookie httpOnly auth_token (60s) → redireciona sem ?token=
6. Frontend: GET /auth/consume → lê cookie → obtém JWT de acesso
```

**Sem dependência de googleapis**: implementado com `fetch` nativo para o endpoint `https://oauth2.googleapis.com/token`.

---

## Google Drive (Sprint 15+)

Apenas **linkar** arquivos do Drive como anexos externos. Upload binário continua no R2.

**Fluxo planejado**:
1. Conectar Drive via OAuth (scope: `drive.readonly`)
2. Seletor de arquivo via Google Picker API (frontend)
3. Frontend envia `{ fileId, name, mimeType, webViewLink }`
4. API salva como `ActivityAttachment { storageProvider: 'external', externalUrl: webViewLink }`

---

## OneDrive / Microsoft Graph (Sprint 15+)

Mesma lógica do Google Drive. Scope: `Files.Read`. Microsoft OneDrive File Picker SDK.

---

## Stripe — Billing (Sprint 16 — modelo de dados; implementação pós-MVP)

**Modelo sugerido**: planos por organização — Starter (≤3 unidades), Pro (≤15), Enterprise (ilimitado).

**Endpoints a adicionar quando implementar**:
```
POST /billing/checkout     → criar checkout session
GET  /billing/portal       → customer portal
POST /billing/webhook      → receber eventos Stripe
```

---

## Gerenciamento de credenciais de integração

Tokens OAuth (Trello) armazenados em `integration_accounts.auth_jsonb`, criptografados com AES-256-GCM em `apps/api/src/lib/crypto.ts`.

`ENCRYPTION_KEY` é obrigatória em produção — validada no boot com regex `/^[0-9a-fA-F]{64}$/`.
