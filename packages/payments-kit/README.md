# @flavioneto11/payments-kit

Gateway de pagamentos **provider-agnostic** e **SANDBOX-FIRST**. **Zero dependências de runtime**
(`node:crypto` + `setTimeout`). Roda em qualquer ambiente (dev/CI) **sem credenciais** — o provedor
real (PSP) fica atrás de config e é **fail-closed**.

## O que é

- **Sandbox por padrão**: mock determinístico (sem rede, sem credenciais). Ideal para dev/CI/demos.
- **Idempotência**: `charge` com a mesma `idempotencyKey` retorna a **mesma** transação (um efeito por chave).
- **Resiliência**: retry com backoff exponencial — mas **nunca** repete erros de config ou recusa.
- **Webhook**: `verifyWebhookSignature` (HMAC-SHA256, comparação constant-time, fail-safe).
- **Auditoria**: callback `onAudit({ event, idempotencyKey, transactionId, status, amount })` em cada operação.
- **Segurança**: **NUNCA** aceita nem armazena número de cartão (PAN). O único dado de instrumento é
  `paymentMethodToken` (opaco).

## Variáveis de ambiente

| Var | Default | Uso |
|---|---|---|
| `PAYMENT_PROVIDER` | `sandbox` | `sandbox` (sem credenciais) ou `real` (exige `PAYMENT_API_KEY`) |
| `PAYMENT_API_KEY` | — | credencial do PSP; obrigatória para `provider=real` (senão `PaymentConfigError`) |
| `PAYMENT_WEBHOOK_SECRET` | — | segredo HMAC para validar webhooks do PSP |

## Uso

```js
import { createPaymentGateway, verifyWebhookSignature } from '@flavioneto11/payments-kit';

const gateway = createPaymentGateway({
  provider: process.env.PAYMENT_PROVIDER || 'sandbox',
  onAudit: (entry) => console.log('[payments][audit]', entry),
});

// Idempotente: chamar de novo com a mesma idempotencyKey não cobra de novo.
const tx = await gateway.charge({
  amount: 1990,
  currency: 'BRL',
  paymentMethodToken: 'tok_opaco', // NUNCA o número do cartão
  idempotencyKey: 'order:123',
});

// Webhook do PSP:
const ok = verifyWebhookSignature({
  rawBody,
  signatureHeader: req.headers['x-signature'],
  secret: process.env.PAYMENT_WEBHOOK_SECRET,
});
```

Exemplo executável completo (idempotência + webhook): [`example/usage.js`](./example/usage.js).

## Provedor real (PSP)

`src/providers/real.js` é um **stub de contrato** documentado e **fail-closed**: sem `apiKey` o
construtor falha; as operações lançam `PaymentConfigError` até a integração real do PSP ser conectada.
A fiação real do PSP é deliberadamente deixada de fora.

## Testes

`npm test` (node --test, zero deps). Ver
[`docs/standards/shared-libraries-and-versioning.md`](../../docs/standards/shared-libraries-and-versioning.md).
