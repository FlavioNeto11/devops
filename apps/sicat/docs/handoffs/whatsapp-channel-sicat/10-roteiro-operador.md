# 10 — Roteiro do operador (formato de prompt)

| Campo | Valor |
|---|---|
| `work_id` | `whatsapp-channel-sicat` |
| Público | operador humano **ou** agente de IA com acesso ao navegador do Flavio |
| Data | 2026-08-08 |
| Status | pendente de execução — nada aqui foi feito ainda |

> **Este arquivo é para ser colado como prompt.** Ele é autocontido: quem executa não precisa da
> conversa que o gerou. Tudo que ele afirma sobre o código foi conferido no repositório na data acima.

---

## REGRA DE SEGURANÇA — leia antes de tudo

**Nenhum segredo pode ser colado no chat.** Nem token, nem Auth Token, nem App Secret. O mecanismo é:

1. Você cria o arquivo `C:\devops\apps\sicat\backend\.env.whatsapp.local`.
2. Escreve os valores lá, no formato `CHAVE=valor`, um por linha.
3. Avisa no chat apenas **"arquivo pronto"** — sem o conteúdo.

Esse arquivo **não pode entrar no git**. Confirme antes de salvar:

```bash
cd C:\devops && git check-ignore -v apps/sicat/backend/.env.whatsapp.local
```

Se o comando não imprimir nada, o arquivo **não** está ignorado — pare e avise, em vez de salvar.

---

## CONTEXTO — o que já existe e o que falta

O canal WhatsApp do SICAT está implementado no branch `sicat/whatsapp-channel` (9 commits). Ele tem
dois adapters de provedor, e você escolhe **um**:

| Provedor | Papel | Custo de entrada |
|---|---|---|
| **Twilio** | desenvolvimento/homologação | sandbox imediato, sem verificação de negócio |
| **Meta Cloud API** | produção | exige Meta Business verificado + aprovação de template |

**Comece pelo Twilio.** Ele exercita o canal inteiro hoje; a Meta pode levar dias na verificação.

### Ordem obrigatória (uma dependência real, não burocracia)

O registro do webhook na Meta dispara um **desafio de verificação**: a Meta faz um `GET` na URL e
exige a resposta correta *na hora do cadastro*. Se a rota não existir ainda, o cadastro **falha**.

Hoje a rota **não existe em produção** — confirmado em 2026-08-08:

```
GET https://dev.nvit.com.br/sicat/api/v1/channels/whatsapp/webhook  ->  404
```

A imagem publicada é anterior à cadeia. Portanto: **primeiro publicar o branch, depois cadastrar o
webhook.** Fazer o inverso gera erro que parece de credencial e não é.

> Boa notícia: `dev.nvit.com.br` **voltou a resolver** (Cloudflare, health 200). O bloqueio de DNS
> que existia em julho/2026 não vale mais.

---

## TAREFA A — Twilio (caminho de homologação)

```
Objetivo: obter 3 valores e habilitar o sandbox de WhatsApp.

1. Acesse https://console.twilio.com e entre (ou crie a conta).
2. No painel inicial, copie:
   - Account SID  (começa com "AC")
   - Auth Token   (clique em "show")
3. Vá em Messaging > Try it out > Send a WhatsApp message.
   Isso abre o Sandbox. Anote o número do sandbox (formato +1 415 ...).
4. Na mesma tela, siga a instrução de "join <palavra>": mande essa mensagem
   pelo SEU WhatsApp pessoal para o número do sandbox. Sem esse opt-in o
   sandbox não entrega mensagem para o seu número.
5. NÃO configure o webhook ainda (ver "Ordem obrigatória" acima).

Escreva no arquivo .env.whatsapp.local:
   WHATSAPP_PROVIDER=twilio
   WHATSAPP_TWILIO_ACCOUNT_SID=<o SID do passo 2>
   WHATSAPP_TWILIO_AUTH_TOKEN=<o token do passo 2>
   WHATSAPP_TWILIO_FROM=<numero do sandbox, E.164 sem espaços, ex: +14155238886>
```

**Limite conhecido do sandbox:** o Twilio busca mídia por **URL pública** — ele não aceita upload de
bytes. Com Twilio, a entrega de PDF pelo canal fica indisponível por limitação do provedor, não por
bug. O código já distingue esse caso (unidade A1) e diz a verdade ao usuário.

---

## TAREFA B — Meta Cloud API (caminho de produção)

```
Objetivo: obter 5 valores. Só faça depois que o Twilio estiver funcionando.

1. Acesse https://business.facebook.com e garanta um Meta Business verificado.
2. Em https://developers.facebook.com/apps crie um app do tipo "Business".
3. Adicione o produto "WhatsApp" ao app.
4. Em WhatsApp > API Setup, copie:
   - Phone number ID   (numérico)
   - WhatsApp Business Account ID
5. Gere um token PERMANENTE (o token de teste expira em 24h):
   Business Settings > Users > System Users > criar usuário de sistema
   > Add Assets (o app) > Generate token
   > permissões: whatsapp_business_messaging, whatsapp_business_management
6. Em Settings > Basic do app, copie o "App Secret".
7. INVENTE uma string aleatória longa para o verify token (é você que define,
   não a Meta). Guarde: ela vai no cadastro do webhook e no .env, e os dois
   têm de bater exatamente.

Escreva no arquivo .env.whatsapp.local:
   WHATSAPP_PROVIDER=meta
   WHATSAPP_META_PHONE_NUMBER_ID=<passo 4>
   WHATSAPP_META_ACCESS_TOKEN=<passo 5>
   WHATSAPP_META_APP_SECRET=<passo 6>
   WHATSAPP_META_VERIFY_TOKEN=<passo 7>
   WHATSAPP_BUSINESS_NUMBER=<seu numero de negocio em E.164 SEM o +, ex: 5511999998888>
```

**Por que `WHATSAPP_BUSINESS_NUMBER` importa:** numa WABA compartilhada, mensagem endereçada a
**outro** número da mesma app chega validamente assinada. O campo `to` é a única coisa que separa.
Vazio = a guarda é pulada (com WARN no boot).

### Template de OTP (só Meta)

O código de verificação sai por template. Fora da janela de 24 h a Meta **rejeita texto livre**.

```
Em WhatsApp Manager > Message Templates, crie um template:
   - Categoria: AUTHENTICATION
   - Idioma: Português (BR)
   - Corpo com UMA variável {{1}} (o código)
Anote o NOME do template aprovado.

Acrescente ao .env.whatsapp.local:
   WHATSAPP_LINK_OTP_TEMPLATE=<nome do template aprovado>
   WHATSAPP_LINK_OTP_TEMPLATE_LANGUAGE=pt_BR
```

O default do código é o texto pt-BR direto, que mantém o Twilio funcionando sem aprovação. Para Meta,
substitua pelo nome do template.

⚠️ O TTL aparece **literal** no texto ("Vale por 10 minutos"). Se mudar
`CHANNEL_LINK_OTP_TTL_SECONDS`, mude o texto do template junto — senão a mensagem mente.

---

## TAREFA C — cadastro do webhook (DEPOIS de publicar)

```
URL do webhook (a mesma para os dois provedores):
   https://dev.nvit.com.br/sicat/api/v1/channels/whatsapp/webhook

TWILIO: Messaging > Sandbox settings > "When a message comes in"
        Cole a URL, método POST. Salve.

META:   App > WhatsApp > Configuration > Webhook > Edit
        Callback URL: a URL acima
        Verify token: exatamente o valor do passo 7 da Tarefa B
        Clique "Verify and save" -> tem de dar verde na hora.
        Depois assine o campo "messages" em Webhook fields.

Se der erro de verificação, cheque nesta ordem:
   1. curl -s -o /dev/null -w "%{http_code}" <URL>   -> 404 significa que o
      branch ainda não foi publicado. Nada de errado com suas credenciais.
   2. verify token com espaço em branco no fim (causa mais comum de falha).
```

---

## TAREFA D — o que NÃO é sua responsabilidade

Não faça, porque é do lado do código/cluster e será feito por quem conduz a cadeia:

- Criar Secret no Kubernetes ou editar `k8s/backend.yaml`.
- Ligar `WHATSAPP_ACTIONS_ENABLED` ou `WHATSAPP_MEDIA_DELIVERY_ENABLED`.
- Rodar migration ou seed.
- Aplicar o catálogo RBAC ou virar `CONVERSATION_PERMISSION_ENFORCEMENT` de `observe` para `enforce`.

---

## DECISÕES QUE PRECISAM DE VOCÊ (não são técnicas)

1. **Entrega de PDF pelo canal.** O PDF do MTR carrega CNPJ, endereço, resíduo e responsável. Uma vez
   no aparelho, fica no backup de nuvem e um encaminhamento é um toque. Ligar ou não é decisão da
   organização.
2. **Número de negócio próprio × compartilhado.** Compartilhar WABA entre apps exige
   `WHATSAPP_BUSINESS_NUMBER` preenchido, sem exceção.
3. **Quem pode agir pelo WhatsApp.** A janela de ação é por usuário e tem orçamento. O default é 4 h
   e 10 ações; o teto é 8 h e 20.

---

## CHECKLIST FINAL

- [ ] `.env.whatsapp.local` criado e **confirmado como ignorado pelo git**
- [ ] Twilio: SID, Auth Token e From no arquivo
- [ ] Twilio: opt-in do sandbox feito pelo seu WhatsApp pessoal
- [ ] (produção) Meta: os 5 valores no arquivo
- [ ] (produção) Template AUTHENTICATION aprovado e nome anotado
- [ ] Avisou **"arquivo pronto"** no chat, sem colar conteúdo
- [ ] Webhook **ainda não cadastrado** (espera a publicação)
