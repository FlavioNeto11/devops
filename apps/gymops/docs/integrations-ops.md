# Integrações — Manual Operacional

**Última atualização**: 2026-05-17  
**Backlog**: [FEAT-005](backlog.md#feat-005--integra%C3%A7%C3%B5es-healthreconnectboardswhatsapp-na-ui), [FEAT-006](backlog.md#feat-006--import-wizard-din%C3%A2mico--dedupe-cross-job) (Sprint 20).  
**Donos**: integrations (líder), frontend-next, backend-fastify.

> Este documento descreve **como diagnosticar e operar** cada integração (Trello, WhatsApp, SMTP, Web Push, R2). O frontend hoje só mostra "conectado/desconectado" para Trello e WhatsApp — toda a riqueza de status (FEAT-005) está no backlog. Use este doc como referência durante operação até a UI ficar pronta.

---

## Trello

### Endpoints da API

| Endpoint | Descrição |
|---|---|
| `GET /integrations/trello/auth-url` | Retorna URL OAuth para conectar |
| `POST /integrations/trello/connect` | Recebe token do callback, criptografa, salva |
| `GET /integrations/trello/boards?organizationId=...` | Lista boards da conta Trello conectada |
| `GET /integrations/trello/health?organizationId=...` | Valida token chamando API Trello |
| `POST /integrations/trello/reconnect` | Retorna nova auth URL |
| `DELETE /integrations/:id` | Desconecta |

### Como diagnosticar via API (até a UI ficar pronta)

```bash
TOKEN=...
ORG=...
BASE=http://localhost:3001  # ou /gymops/api em público

# 1. Status geral das integrações
curl -H "Authorization: Bearer $TOKEN" "$BASE/integrations?organizationId=$ORG"

# 2. Health do Trello (chama Trello real)
curl -H "Authorization: Bearer $TOKEN" "$BASE/integrations/trello/health?organizationId=$ORG"

# 3. Listar boards conectados
curl -H "Authorization: Bearer $TOKEN" "$BASE/integrations/trello/boards?organizationId=$ORG"
```

### Erros comuns

| Sintoma | Causa provável | Resolução |
|---|---|---|
| `health` retorna `{ healthy: false }` | Token revogado pelo usuário no Trello | Acessar `POST /integrations/trello/reconnect` para nova auth URL |
| `boards` retorna `[]` | Conta Trello sem boards visíveis | Verificar permissões no Trello |
| Wizard de import não encontra board | Board é privado e o usuário não tem acesso na conta conectada | Reautenticar com conta certa |
| Token expira após semanas | Trello tem expiry curta em alguns planos | Reconectar |

### Variáveis de ambiente

```
TRELLO_API_KEY=<chave do app Trello>
ENCRYPTION_KEY=<64 chars hex>     # criptografa tokens em integration_accounts.auth_jsonb
FRONTEND_URL=...                  # usado para construir return_url do OAuth
```

---

## WhatsApp (Twilio)

### Endpoints da API

| Endpoint | Descrição |
|---|---|
| `GET /integrations/whatsapp/status?organizationId=...` | Retorna `{ configured, sandbox, from, lastErrors }` |
| `POST /notifications/test` com `channel: 'whatsapp'` | Envia template de teste |

### Modos

- **Sandbox** (`TWILIO_ACCOUNT_SID` começa com `AC...` + número Twilio sandbox): usuário precisa ter **enviado `join <code>` para o número sandbox** antes. Sem isso, mensagens nunca chegam.
- **Produção**: número WhatsApp Business aprovado pela Meta. Templates pre-aprovados são obrigatórios para mensagens fora da janela de 24h.

### Como diagnosticar via API (até FEAT-005)

```bash
# 1. Status do WhatsApp
curl -H "Authorization: Bearer $TOKEN" "$BASE/integrations/whatsapp/status?organizationId=$ORG"

# Resposta esperada:
# { "data": {
#     "configured": true|false,
#     "sandbox": true|false,
#     "from": "whatsapp:+14155238886",
#     "lastErrors": ["..."]
# }}

# 2. Testar canal (envia para o próprio usuário, se telefone cadastrado)
curl -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"channel":"whatsapp","organizationId":"'$ORG'"}' \
  "$BASE/notifications/test"

# 3. Ver histórico de entregas
curl -H "Authorization: Bearer $TOKEN" \
  "$BASE/notifications/deliveries?organizationId=$ORG&channel=whatsapp&status=failed&page=1"
```

### Erros comuns

| Sintoma | Causa | Resolução |
|---|---|---|
| `status.configured = false` | Env vars Twilio ausentes | Configurar `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM` |
| `lastErrors` mostra "Unauthenticated" | Credenciais Twilio inválidas | Validar no console Twilio |
| Mensagem não chega no sandbox | Número destino não enviou `join <code>` | Pedir ao usuário fazer o join |
| Mensagem rejeitada com `63016` (Twilio) | Fora da janela de 24h e sem template aprovado | Migrar para template HSM aprovado |
| Telefone em formato errado | Tem que ser E.164 (`+5511...`) | Validar no perfil do usuário |

### Variáveis de ambiente

```
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886   # sandbox ou número produção
```

---

## SMTP (e-mail transacional)

### Operação

- Usado por `mailer.sendInvitation()` e notificações de atividade.
- Sem `SMTP_HOST` configurado, a função **não falha** — apenas pula o envio e loga warning. Em produção isso deve ser monitorado.

### Variáveis

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=...
SMTP_PASS=...
SMTP_FROM=GymOps <noreply@gymops.com>
```

### Diagnóstico

```bash
# Testar canal
curl -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"channel":"email","organizationId":"'$ORG'"}' \
  "$BASE/notifications/test"

# Ver histórico
curl -H "Authorization: Bearer $TOKEN" \
  "$BASE/notifications/deliveries?organizationId=$ORG&channel=email&status=failed"
```

---

## Web Push (VAPID)

### Operação

- Backend envia notificações push para subscriptions registradas em `notification_preferences.config` (JSONB).
- Frontend pede permissão e registra subscription via `POST /notifications/subscribe`.
- Sem `VAPID_PUBLIC_KEY` configurado, o botão "Ativar notificações push" na tela de Configurações não funciona (UI deve mostrar mensagem).

### Variáveis

```
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:admin@gymops.com
```

Gerar par com:

```bash
npx web-push generate-vapid-keys
```

### Diagnóstico

- Usuário pode testar via `POST /notifications/test` com `channel: 'push'`.
- Falhas comuns: subscription expirada (`410 Gone` no log) → backend deve marcar como `failed` e remover.

---

## Cloudflare R2 (storage)

### Operação

- Avatares de usuário, logos de organização (FEAT-007), anexos de atividade.
- Fluxo: backend devolve URL pré-assinada (presign); frontend faz `PUT` direto no R2; backend confirma com `objectKey`.

### Variáveis

```
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_NAME=...
R2_PUBLIC_URL=https://pub-xxx.r2.dev          # opcional; sem isso, avatares não exibem
```

### Diagnóstico

- Avatar não exibe → `R2_PUBLIC_URL` ausente; URL salva é null.
- Upload falha (CORS no PUT) → configurar CORS do bucket para permitir o domínio do frontend.

---

## Idempotência e dedupe (Import Trello)

**Estado atual**: idempotência apenas dentro do mesmo job (`importJobId + sourceId`).  
**Estado alvo (FEAT-006, Sprint 20)**: dedupe cross-job por origem externa por tenant.

**Design proposto**: tabela `import_sources(organization_id, provider, external_id, activity_id, created_at)` com `@@unique([organizationId, provider, externalId])`. Em `commitImport`, antes de criar atividade, consultar a tabela; se existir, marcar `ImportItem.status='skipped'` com `errorMessage='Duplicate of activity X'`.

---

## Healthchecks por integração (sumário)

| Integração | Como verificar saúde | UI alvo (FEAT-005) |
|---|---|---|
| Trello | `GET /integrations/trello/health` | Badge `✅ healthy` / `⚠️ unhealthy` no card |
| WhatsApp | `GET /integrations/whatsapp/status` | Card com modo, número, últimos 5 erros |
| SMTP | tentativa de envio em `POST /notifications/test` | Toast de sucesso/erro |
| Web Push | tentativa de envio em `POST /notifications/test` | Toast + entrada em `notification_deliveries` |
| R2 | tentativa de avatar upload | Toast + URL preview |

---

## Checklist de release de integrações

- [ ] Trello: conectar, listar boards, importar, reconectar, desconectar
- [ ] WhatsApp: configurado em sandbox, número joinado, mensagem de teste recebida
- [ ] SMTP: convite enviado e recebido em e-mail real
- [ ] Web Push: permissão concedida e notificação recebida
- [ ] R2: avatar enviado e exibido
- [ ] `notification_deliveries` mostra entradas com status correto
