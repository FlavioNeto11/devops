# 02 — Fase 1 · Abstração de provedor WhatsApp

| Campo | Valor |
|---|---|
| `work_id` | `whatsapp-channel-sicat` |
| Fase | 1 |
| Branch | `sicat/whatsapp-channel` |
| Data | 2026-08-06 |
| Status | ✅ concluída |

## 1. Decisão implementada

D1 do `00-orchestration.md`: **abstração com 2 adapters**. `WHATSAPP_PROVIDER` escolhe entre `twilio`
(dev/homolog — o sandbox permite exercitar o canal sem esperar verificação de negócio da Meta) e
`meta` (produção — número verificado, templates HSM). Default `disabled`: o canal só existe onde foi
explicitamente configurado.

A abstração não é cerimônia — os dois provedores divergem em tudo que importa:

| Aspecto | Twilio | Meta Cloud API |
|---|---|---|
| Assinatura do webhook | HMAC-**SHA1** base64 sobre `URL + params ordenados` | HMAC-**SHA256** hex sobre o **corpo bruto** |
| Header | `X-Twilio-Signature` | `X-Hub-Signature-256: sha256=…` |
| Formato do telefone | `whatsapp:+5511…` | `5511…` (sem `+`) |
| Desafio de verificação | não usa | `GET` com `hub.mode`/`hub.verify_token`/`hub.challenge` |
| Mídia recebida | URL direta no webhook | só `mediaId` — exige 2ª chamada autenticada |
| Envio de mídia | só por URL pública | por link **ou** upload de bytes |
| Template | Content SID (`HX…`) | `name` + `language` + componentes |

## 2. Arquivos

| Arquivo | Papel |
|---|---|
| `src/services/conversation/channel/whatsapp/types.ts` | interface `WhatsAppProvider`, tipos normalizados, `normalizePhone` |
| `src/services/conversation/channel/whatsapp/twilio-provider.ts` | adapter Twilio |
| `src/services/conversation/channel/whatsapp/meta-cloud-provider.ts` | adapter Meta Cloud API |
| `src/services/conversation/channel/whatsapp/index.ts` | fábrica + `requireWhatsAppProvider` + override para testes |
| `src/lib/config.ts` | 10 chaves novas (`whatsapp*`) + união `ConfigKey` |
| `src/app.ts` | captura do corpo bruto, **escopada em `/v1/channels/`** |
| `tests/unit/whatsapp-provider.test.js` | 25 casos |

## 3. Duas decisões de implementação que valem registro

**Corpo bruto escopado por caminho.** A Meta assina os bytes exatos — reserializar o JSON parseado
muda o digest. O `verify` do `express.json` guarda o buffer **apenas** para `/v1/channels/*`; reter
até 2 MB em toda requisição do SICAT seria desperdício.

**Sem SDK.** Ambos os adapters usam só `fetch`, seguindo o padrão já em produção na plataforma
(`apps/gymops/apps/api/src/lib/whatsapp.ts`). Duas dependências a menos para auditar, e o contrato de
erro fica sob nosso controle: nenhum dos dois propaga o corpo de erro do provedor, porque ele pode
ecoar o texto da mensagem enviada — só status e código.

## 4. Verificação de assinatura é fail-closed

Todo caminho de dúvida devolve `false`, nunca "deixa passar porque não deu para checar": segredo não
configurado, header ausente, prefixo `sha256=` ausente, corpo bruto não capturado, tamanhos
divergentes. Comparação sempre com `crypto.timingSafeEqual`, com checagem de tamanho antes (a função
lança se os buffers diferem em comprimento).

## 5. Validação

| Gate | Resultado |
|---|---|
| `npm run typecheck` | ✅ |
| `npm run lint` | ✅ |
| `npx tsx --test tests/unit/*.test.js` | ✅ **279 / 244 pass / 35 fail** — as mesmas 35 da baseline. +25 testes, todos verdes |

**Destaque:** o caso `reproduz o vetor de assinatura publicado pelo Twilio` usa o vetor textual da
documentação oficial (`twilio.com/docs/usage/security`) — auth token `12345`, URL
`https://example.com/myapp.php?foo=1&bar=2`, assinatura esperada `L/OH5YylLD5NRKLltdqwSvS0BnU=`.
Prova que a implementação bate com a do provedor, não apenas consigo mesma. Se este caso quebrar,
todo webhook será rejeitado em produção.

> Nota de processo: a primeira versão deste teste afirmou um vetor de memória e falhou. O valor foi
> então obtido da documentação. Vetor de terceiro não se escreve de cabeça.

## 6. O que esta fase NÃO faz

Não há rota exposta ainda — os adapters existem, mas nada os chama. O webhook, a resolução de
telefone → usuário e o enfileiramento do turno são as fases 2 e 3. Também não há download de mídia
recebida (o `mediaId` da Meta é preservado, mas resolver a URL fica para quando houver consumidor).

## 7. Configuração necessária (nenhum valor em git)

```
WHATSAPP_PROVIDER=twilio|meta|disabled
WHATSAPP_WEBHOOK_URL=<URL pública do webhook — entra no HMAC do Twilio>
# twilio
WHATSAPP_TWILIO_ACCOUNT_SID / WHATSAPP_TWILIO_AUTH_TOKEN / WHATSAPP_TWILIO_FROM
# meta
WHATSAPP_META_PHONE_NUMBER_ID / WHATSAPP_META_ACCESS_TOKEN / WHATSAPP_META_APP_SECRET
WHATSAPP_META_VERIFY_TOKEN / WHATSAPP_META_GRAPH_VERSION (default v21.0)
```

⚠️ `WHATSAPP_WEBHOOK_URL` precisa ser **exatamente** a URL que o provedor chama, incluindo esquema e
query string. Divergência (ex.: `http` × `https`, ou barra final) faz a assinatura do Twilio não bater
e todo webhook ser rejeitado — com a mensagem de erro correta, mas sem pista da causa.
