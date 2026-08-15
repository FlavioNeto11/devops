# 08 — Fase 6 · Aviso de conclusão e entrega de arquivos

| Campo | Valor |
|---|---|
| `work_id` | `whatsapp-channel-sicat` |
| Fase | 6 (+ consolidação cross-model Fable 5) |
| Branch | `sicat/whatsapp-channel` |
| Migration | **nenhuma** (a `020` segue a única inédita) |
| Data | 2026-08-08 |
| Status | ✅ concluída — **N2 permanece fechado** (§3); entrega de arquivo desligada por default (§4) |

## 1. O que foi entregue

Um job `whatsapp.outbound_notice` **por ticket**, que avisa no canal quando a ação confirmada termina —
sucesso, parcial, falha, DLQ ou timeout.

**A escolha estrutural: o aviso nasce na CONFIRMAÇÃO, não no desfecho.** Ele é criado em
`recordDispatchOutcome`, a única linha do sistema que tem simultaneamente o ticket, o vínculo e a lista
de jobs recém-enfileirados. Acorda em +15 s, lê o estado dos jobs e decide: todos terminais → compõe e
entrega; algum pendente e prazo não vencido → reagenda; prazo vencido → entrega o parcial honesto.
**Nunca vai para DLQ** — aviso na DLQ é silêncio sobre o silêncio.

O hook nos três pontos terminais de `job-runner.ts` foi **rejeitado** por duas razões verificadas: (a)
exigiria um envelope atravessando o dispatcher, com corrida real que o worker serial único de hoje
mascara em 100% dos testes — com `WORKER_LANE` separada o aviso simplesmente nunca dispararia, em
silêncio; (b) a variante transacional precisaria dar um `client` a `moveJobToDLQ`, caminho terminal de
**todo job do sistema**, contra uma baseline de 35 falhas. O poller inverte a janela: como o job de
aviso existe **antes** de qualquer desfecho, o estado "terminou e não avisou" não existe.

**Prazo em relógio de parede, não em tentativas** (`deadlineAt = confirmedAt + 10 min`): se a
plataforma ficar 12 h fora, o worker volta, vê o prazo vencido, e a decisão de *o que dizer* fica
separada da de *se dá para empurrar*.

## 2. Uma correção de vazamento vivo, achada de passagem

`resolveChannelPrincipal` fazia `requestedBy: input.requestedBy || externalUserKey`. O telefone E.164
**cru** descia para o `body` de todo enqueue vindo do canal e ficava em repouso em
`jobs.payload.requestedBy` — e a DLQ copia a linha. Agora o fallback é o `channelLinkId`, opaco.

## 3. N2 continua fechado — e a razão não é falta de tempo

O aviso **não consegue distinguir "o MTR não foi criado" de "o MTR foi criado e eu perdi a resposta"**.
Para emissão irreversível, essa é exatamente a única informação que importa. `WHATSAPP_OUTBOUND_NOTICE_IMPLEMENTED`
permanece `false`.

Consequência que precisa estar escrita: **emitir MTR pelo WhatsApp — a manchete do canal — não é
entregue**. O canal faz consulta, segunda via e réplica local. Preferiu-se recusar a entregar um
"confirmado" que pode estar mentindo.

## 4. Entrega de arquivo: completa, testada e DESLIGADA por default

`WHATSAPP_MEDIA_DELIVERY_ENABLED=false`. O PDF de um MTR carrega CNPJ, endereço, resíduo e
responsável; uma vez no aparelho fica no backup de nuvem para sempre e um encaminhamento é um toque.
Quem decide se isso vai para um celular pessoal é a organização, não o código. Com a chave desligada o
texto do canal diz a verdade ("o download fica no SICAT") — não é promessa sem mecanismo.

Duas recusas registradas: **URL assinada / rota pública de download** (custaria rota anônima num
prefixo já público, segredo próprio, epoch de revogação, rate limiter e 404 opaco — para servir um
adapter que hoje nem fecha ponta a ponta por DNS) e **caminho de template** (a guarda de janela é
fail-closed e obrigatória; o que não existe é o `sendTemplate` para fora da janela de 24 h).

## 5. Verificação — e o que ela pegou

| Rodada | Resultado |
|---|---|
| Fase 6 | 16 achados (**1 crítico**, 3 altos) e **43/50** mutações, 7 sobreviventes |
| Consolidação | crítico + altos + sobreviventes fechados; **14/19**, 3 dos 5 sobreviventes são equivalentes por construção |

**O crítico** — `applyWhatsAppInboundTerminalFailureSideEffect` filtrava só por `job.payload.channelLinkId`,
e a fase 6 passou a pôr `channelLinkId` no payload do job de **aviso**. O `job-runner` chama esse
side-effect nos dois caminhos terminais, então um aviso morrendo disparava *"Não consegui processar sua
última mensagem"* — falso, pago, e sem guarda de janela. Fechado com filtro por operação.

**O quinto comentário-mentira da cadeia** — `sendAttempts` era escrito e nunca lido; o cabeçalho
afirmava que "limita o loop quando o processo morre dentro do fetch". Não limitava nada: pod morto
dentro de `sendMedia` depois de a Meta aceitar reenviaria o PDF (mídia paga em duplicata). Agora há
teto real, no molde da fase 3, e o comentário descreve o que o código faz.

**O caminho do OOM, de novo** — o teto de memória era por documento: `collectDocuments` fazia `readFile`
no laço, deixando 5×8 MB = 40 MB de Buffer vivos simultaneamente. Agora devolve só metadados e o
`readFile` acontece imediatamente antes de cada `sendMedia`.

## 6. Validação cross-model em Fable 5 (fases 0–5) — absorvida aqui

O `/ultrareview` não coube (105 arquivos / 31.930 linhas contra o teto de 8.000), então a validação foi
feita por **7 revisores Fable 5, um por commit de fase**, lendo por SHA. Reviewer diferente do builder
(Opus) é a forma mais forte de validação — e ela achou defeitos que a verificação em Opus deixou passar.

| Sev | Correção |
|---|---|
| **ALTO** | `twilio-provider`: o filtro `MessageStatus \|\| SmsStatus` podia descartar **toda** mensagem de entrada. Substituído por discriminador robusto (só descarta com status de *entrega* **e** sem conteúdo). Os testes passavam porque os payloads sintéticos omitiam o campo — **verde falso** |
| **MÉDIO** | `conversationSessionId` do corpo era confiado: no PK-conflict engolido por `persistSafely`, o turno gravava e lia a sessão de **outro usuário** da mesma conta. Agora o id vem sempre do upsert, e é regenerado quando ele falha |
| BAIXO | balde de telefone consumido antes das recusas baratas (usa `peek()` agora) |
| BAIXO | `slice` UTF-16 na truncagem de entrada → surrogate partido → `jsonb` rejeita → mensagem perdida em silêncio. Agora `cutAtGrapheme` |
| BAIXO | chave do rate limit incluía o canal declarado (dobrava para 80/5 min) e o 429 vinha depois do multer/PDF |
| BAIXO | `String.replace` com replacement string (`$$`, `$&` corrompem valor em R$) → replacement function |
| BAIXO | `truncateWhatsAppReply` com teto configurado baixo devolvia só o sufixo |

> **Nota de método, do próprio sintetizador Fable 5:** como os revisores leram por SHA e a fase 6 já
> alterava a árvore, três achados eram *stale* — já corrigidos no diff não-commitado. Ele detectou e
> separou, avisando que reabririam se o commit se perdesse. A recomendação dele — revalidar sobre a
> árvore consolidada — está registrada para a fase 7.

## 7. Validação (conferida aqui)

| Gate | Resultado |
|---|---|
| `npm run typecheck` | ✅ |
| `npm run lint` | ✅ |
| `npx tsx --test tests/unit/*.test.js` | ✅ **946 testes · 911 pass · 35 fail** — baseline exata, 11 nomes top-level |
| Correções no disco | ✅ crítico, 2 altos e as 7 do Fable 5 confirmados por leitura |

A suíte saiu de 878 (fim da fase 5) para **946**.

## 8. Dívida

1. **N2 fechado** enquanto o aviso não distinguir "não criado" de "criado e perdi a resposta".
2. **Duas lacunas de teste** confirmadas por mutação sobrevivente, ambas exigindo harness que não
   existe: a regeneração do id de sessão (`F9`) só é observável completando o turno, e a chave do rate
   limit (`F12`) é middleware de rota. **Não há cobertura — está escrito aqui em vez de fingido.**
3. Revalidação Fable 5 sobre a árvore consolidada (fase 7).
