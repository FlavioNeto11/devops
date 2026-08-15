# 04 — Fase 3 · Webhook de entrada e adaptador de canal

| Campo | Valor |
|---|---|
| `work_id` | `whatsapp-channel-sicat` |
| Fase | 3 |
| Branch | `sicat/whatsapp-channel` |
| Migration | **nenhuma** (decisão de design — ver §2) |
| Data | 2026-08-06 |
| Status | ✅ código concluído · ⏸️ manifesto k8s **retido**, aguarda aprovação (§6) |

## 1. O que foi entregue

A primeira rota **pública** do SICAT: `GET /v1/channels/whatsapp/webhook` (desafio de verificação do
Meta) e `POST` (recepção). O fluxo é um porteiro barato seguido de trabalho assíncrono:

```
POST → assinatura (fail-closed) → parse → canonicaliza telefone → vínculo VERIFICADO
     → classifica → enfileira job → 200 em ms
                                      ↓
        worker → monta principal → processTurn → compõe resposta → envia pelo provedor
```

| Camada | Arquivos |
|---|---|
| Rota | `routes/channel-webhook-routes.ts` |
| Recepção | `channel/whatsapp/whatsapp-inbound-service.ts` |
| Execução | `channel/whatsapp/whatsapp-turn-service.ts` |
| Resposta | `channel/whatsapp/whatsapp-reply-composer.ts` |
| Provedor | `channel/whatsapp/provider-http.ts` (timeout compartilhado) |
| Infra | `lib/channel-metrics.ts`, `lib/job-lanes.ts`, `lib/raw-body.ts`, `workers/job-payload-patch.ts` |
| Fila | `lib/retry.ts` (operação `whatsapp.inbound_message`), `workers/operation-handlers.ts` |

**A autenticação da rota é a assinatura HMAC**, não um token — nenhum provedor de WhatsApp manda
`Authorization`. Por isso `/v1/channels/` foi isentado do `authMiddleware` global. A isenção é
deliberadamente estreita: `/v1/sicat/channel-links` (o cadastro autenticado da fase 2) **não** entra.

## 2. Nove conflitos de design resolvidos explicitamente

Os três desenhos independentes divergiam. As decisões que mais importam:

**Nenhuma migration nova.** `jobs.command_id` já é `not null unique` — barreira global e permanente
contra reentrega, exatamente a propriedade que uma tabela de inbox daria. O índice parcial
`ux_jobs_active_entity_operation` **não** serviria: só cobre `queued|running|retry_wait`, então
reentrega depois do job concluir passaria. Motivo adicional: a migration 020 da fase 2 nunca foi
aplicada; acumular uma 021 sem DDL exercitado seria pior que o benefício. Custo aceito: sem tabela
própria não há coalescing de mensagens consecutivas.

**O `jobs.payload` é o livro-razão de entrega.** O handler grava `replyText`/`replyPreparedAt` antes
de chamar o provedor e `replySentAt` depois. Numa reexecução o payload fresco decide: já enviado →
termina; preparado e não enviado → **só reenvia**. Ou seja, o retry do job é de **entrega**, nunca de
LLM. Zero DDL.

**500 estreito em falha de infraestrutura.** Com o `unique` de `command_id`, reentregar o lote inteiro
é no-op para o que já gravou — então o 500 é seguro, e sem ele um blip de 3 s no Postgres apagaria a
pergunta da pessoa para sempre, sem rastro.

**O principal é montado no worker, não na recepção.** `ConversationPrincipal` carrega
`permissionKeys`/`integrationAccountId`; serializá-lo numa fila durável congelaria autorização. O
*vínculo* é resolvido na recepção (barato, decide se vale enfileirar); o *principal* na execução.

## 3. As duas pendências da fase 2 foram honradas

1. O `from` passa por `canonicalizeChannelUserKey` — a **mesma** função do cadastro. Coberto por teste
   e por mutação (trocar para `normalizePhone` mata testes).
2. `link.integrationAccountId` **não** vai para `resolveChannelPrincipal`. Idem.

## 4. Duas rodadas de verificação

| Rodada | Resultado |
|---|---|
| 1 — implementação + 3 lentes + mutação | 18 achados (5 altos, 5 médios, 8 baixos) e **2 mutações sobreviventes** |
| 2 — remediação + mutação | **19/19 mortas, zero sobreviventes** |

### As duas mutações que sobreviveram na rodada 1

- Apagar `case 'whatsapp.inbound_message'` do `processJob` **não quebrava nenhum teste**. Em produção
  todo job de canal cairia em `default: throw` — canal mudo e DLQ cheia. Fechado com um teste que
  prova o **dispatch** por sentinela lançada de dentro do turno, com controle negativo.
- Vínculo `pending` recebia texto **diferente** do de número desconhecido, confirmando a um terceiro
  que aquele número está em cadastro no SICAT. O texto já era constante no código; faltava o teste — e
  o caso existente usava o mesmo número nos dois estados, então o limitador de 24 h engolia o segundo
  envio e a variante passava batida.

### Achados altos corrigidos

| # | Problema | Correção |
|---|---|---|
| R1 | O `wamid` da Meta **decodifica para estrutura com o telefone do remetente** e era gravado cru em `commandId` e `idempotencyKey` — colunas devolvidas por `/v1/jobs/search`, `/v1/jobs/:jobId` e `/health/jobs/dlq` | `commandId` vira sha256 (segue determinístico, o `unique` continua valendo); `idempotencyKey: null`. O cru fica só no `payload`, que nenhuma dessas rotas serializa |
| R2 | Lote parcialmente enfileirado perdia mensagem em silêncio (500 só com `enqueued === 0`) | 500 sempre que **qualquer** mensagem falhar por erro de infraestrutura |
| R3 | Descarte 100% invisível: o `IngestSummary` com 10 motivos era montado e jogado fora | Ponto único `dropMessage()` que loga (telefone mascarado) e incrementa métrica Prometheus `sicat_channel_inbound_{received,enqueued,dropped}_total` |
| R4 | Teto por vínculo debitado antes da classificação e da dedup: reação com emoji e reentrega duplicada gastavam cota; o aviso de limite era código morto | `peek()` aditivo no rate-limiter; débito só depois do insert; aviso enviado uma vez por janela |
| T1 | `fetch` dos adapters **sem `AbortSignal`** — Graph API travada prenderia o worker que também processa `manifest.submit` | `AbortSignal.timeout` em todos os `fetch`, envolvendo fetch **e** leitura do corpo; 15 s texto / 30 s upload; `504 WHATSAPP_PROVIDER_TIMEOUT` distinto de `502 WHATSAPP_SEND_FAILED` |
| T2 | Backlog expirado terminava como **sucesso silencioso** — painel mostrava 100% de sucesso com todo mundo sem resposta | Aviso à pessoa, com dois limites: um por vínculo por janela, e nada fora das 24 h (o provedor rejeitaria texto livre) |

## 5. Validação (conferida por mim, não pelo relato dos agentes)

| Gate | Resultado |
|---|---|
| `npm run typecheck` | ✅ |
| `npm run lint` | ✅ |
| `npx tsx --test tests/unit/*.test.js` | ✅ **499 testes · 464 pass · 35 fail** — baseline inalterada, conjunto de nomes idêntico |
| Suíte do canal isolada | ✅ **110 / 110** |
| Mutação | ✅ **19 / 19 mortas** |
| Resíduo de mutação no disco | ✅ varredura por assinatura: nenhum |

A suíte saiu de 374 (fim da fase 2) para **499**.

> **Incidente de método:** a primeira execução do harness de mutação foi morta pelo shell antes do
> `finally`, deixando a mutação `M-R1a` no disco em `whatsapp-inbound-service.ts:489`. O agente
> detectou por diff contra backup, restaurou e pediu conferência no review. **Conferi**: o
> `commandId` está com sha256 e o `idempotencyKey` com `null`. É a segunda vez na cadeia que um
> harness de mutação vaza estado — o padrão seguro está descrito no checkpoint da fase 2 §3.

## 6. ⏸️ Retido de propósito: `k8s/backend.yaml`

O manifesto **não foi commitado**. Ele adiciona o Deployment `sicat-worker-channel` (raia dedicada) e
injeta `WORKER_LANE=default` no `sicat-worker` que está no ar.

`platform/argocd/apps/sicat.yaml` tem `automated: { prune: true, selfHeal: true }` no path
`apps/sicat/k8s` — ou seja, **commitar este arquivo é aplicá-lo em produção**, não versioná-lo. E a
mudança reinicia o worker que hoje processa emissão de MTR com uma variável que altera quais jobs ele
reivindica. Exige decisão explícita do operador.

O código já commitado é **inerte** sem esse manifesto: `WHATSAPP_PROVIDER` tem default `disabled`
(nenhum job de canal é criado) e `WORKER_LANE` ausente resolve para `'all'`, o comportamento antigo.

**Razão de existir da raia:** o worker é consumidor **serial único** (`replicas: 1` + laço
`for (const job of jobs) await processClaimedJob(job)`). Um turno de LLM de 90 s bloqueia
`manifest.submit` por 90 s. Prioridade **ordena** a fila, não a paraleliza — a única correção real é
um segundo consumidor lendo um subconjunto disjunto. Portanto: **não ligar `WHATSAPP_PROVIDER` sem
esse Deployment no ar.**

## 7. Descobertas fora do escopo (registradas como tarefa própria)

**Autorização das rotas de jobs.** `GET /v1/jobs/search`, `GET /v1/jobs/:jobId` e as rotas de DLQ
(incluindo `requeue` e `delete`, que **mutam** estado) não aplicam `sicatAuthMiddleware`, e o
`authMiddleware` global só confere a presença do prefixo `Bearer `. Verificado contra a instância
local: `curl -H 'Authorization: Bearer isto-nao-e-um-token-valido'` devolve **200 com dados reais**.
`searchJobs` também não filtra por usuário nem por conta. Pré-existente e independente desta cadeia.

**Heartbeat de claim por lote.** `claimJobs(workerBatchSize)` reivindica 10 jobs de uma vez, o laço
processa em série, e `startClaimHeartbeat` só começa quando chega a vez de cada job. Os jobs 2..N
ficam `running` com `claim_heartbeat_at` congelado e viram candidatos de `requeueStaleRunningJobs`
depois de 5 min — risco de **execução dupla** de operações CETESB não idempotentes. O manifesto retido
mitiga isso na raia de canal com `WORKER_BATCH_SIZE=1`; a raia default segue exposta.

## 8. O que a fase 4 herda

- O `responseText` vai cru para o WhatsApp. Os 21 tipos de `ConversationStructuredResult` continuam
  sem renderer textual — é o escopo da fase 4.
- Sem coalescing: 3 mensagens seguidas = 3 turnos = 3 chamadas de LLM. Contido pelo teto por vínculo.
- Rotas do canal fora do OpenAPI (dívida registrada para a fase 7).
