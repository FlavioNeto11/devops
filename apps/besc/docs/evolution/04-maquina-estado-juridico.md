---
title: "Máquina de estado jurídico do título — 7 estados, cascatas e resolução"
status: proposta
updated: 2026-07-10
language: pt-BR
---

# 04 — Máquina de estado jurídico do título

> O ativo do marketplace (`security_title`) carrega uma máquina de estados **jurídica** —
> distinta da máquina de status **organizacional** do case de levantamento
> (`api/src/domain.js:392-393`), que mede completude documental e nunca afirma mérito. A máquina
> jurídica governa a **disponibilidade do título para contratação** e dispara os efeitos em
> cascata sobre contratos, aluguéis e treasury. Decisão registrada em
> [ADR-008](./adr/ADR-008-maquina-estado-juridico.md); entidades em
> [02-modelo-de-dados](./02-modelo-de-dados.md) com DDL no
> [Apêndice B](./apendices/B-ddl-conceitual.md).

## 1. Os sete estados (enum `title_legal_status`)

| Estado (key) | Rótulo pt-BR | Significado | Disponível p/ novas contratações? |
|---|---|---|---|
| `unjudged` | Não julgado | Direito ainda sem decisão de mérito | **Sim** (com disclosure de risco no catálogo) |
| `ruled_favorable` | Julgado favorável | Decisão favorável (não necessariamente transitada em julgado) | **Sim** |
| `ruled_against` | Julgado desfavorável | Decisão contrária; título automaticamente indisponível | Não |
| `under_appeal` | Em recurso | Recurso interposto contra decisão desfavorável | Não |
| `reinstated` | Reativado | Recurso provido; título volta ao mercado | **Sim** |
| `defeated` | Definitivamente negado | Trânsito em julgado contrário — o título "caiu" | Não (dispara o fluxo de resolução, §5) |
| `archived` | Arquivado | Retirado do marketplace por decisão administrativa | Não |

Dois princípios estruturais:

- **A verdade é o histórico.** `security_title.legal_status` é denormalização do último registro
  de `legal_status_history` (append-only), mantidos consistentes **na mesma transação**.
- **Disponibilidade é derivada, nunca coluna editável**:
  `available = legal_status ∈ {unjudged, ruled_favorable, reinstated} AND
  listing_status = 'listed'`. Não existe botão "disponibilizar" que contorne a máquina — é a
  invariante 6 de [03-elasticidade-tokenizacao](./03-elasticidade-tokenizacao.md).

## 2. Transições permitidas

```
unjudged ──────────► ruled_favorable
unjudged ──────────► ruled_against
unjudged ──────────► archived
ruled_favorable ───► ruled_against       (reforma em instância superior)
ruled_favorable ───► archived            (decisão administrativa)
ruled_against ─────► under_appeal        (recurso interposto)
ruled_against ─────► defeated            (prazo recursal esgotado / desistência)
under_appeal ──────► reinstated          (recurso provido)
under_appeal ──────► defeated            (recurso improvido definitivo)
reinstated ────────► ruled_against       (novo revés em outra instância)
defeated ──────────► archived            (terminal; arquivar é só housekeeping)
archived ──────────► estado anterior     (reabertura manual pelo Gestor)
```

- Qualquer transição fora dessa matriz responde **409** — o mesmo padrão do guard de
  `ready_for_structuring` já existente no levantamento (`api/src/server.js:373-375`).
- A matriz é mantida **em código** (é regra jurídica, não configuração de dados), mas **exposta
  em `/meta`** para a UI desenhar os botões válidos por estado.
- `defeated` é terminal quanto ao mérito: o único movimento posterior é `archived`, para
  organizar o catálogo depois de resolvidos todos os contratos (§5).
- `archived` não é evento jurídico: retira o título do catálogo, mas por si só **não altera
  contratos vigentes** — se há obrigações a congelar, o caminho é a transição jurídica cabível,
  não o arquivamento.

## 3. Quem dispara

- **Fase 1: exclusivamente o Gestor** (permissão `legal_status:transition`), com
  obrigatoriedade de `reason` **e** `evidence_ref` — referência ao anexo da decisão no case
  (`{caseId, docKey, attId}`) ou número do processo/decisão. Registrado em
  `legal_status_history` com `source='manual'` e `actor_user_id`.
- **Futuro (integração com tribunal)**: a integração grava com `source='court_integration'`
  mas **não auto-aplica transições decisórias** — cria uma *proposta de transição* pendente de
  confirmação do Gestor. É o mesmo espírito da máquina de status atual do levantamento, em que
  decisão é sempre manual (`applyAutoStatus` nunca decide status confirmado,
  `api/src/domain.js:409`): conteúdo externo não muda estado sensível sozinho.
- **Advogado e Juiz leem, nunca transicionam**: têm `legal_status:read` (escopo `linked` via
  `title_access_grants`, ou `all` quando concedido) e exportam a trilha — ver §7.

## 4. Efeitos em cascata

Executados **na mesma transação** da transição de status (Postgres single-replica torna isso
barato), com um evento de auditoria por contrato afetado
([07-trilha-auditoria](./07-trilha-auditoria.md)):

| Evento | Novas contratações | Contratos vigentes | Aluguéis vigentes | Tokens na treasury |
|---|---|---|---|---|
| `→ ruled_against` / `→ under_appeal` | Bloqueadas (disponibilidade derivada, §1) | `status='suspended'` — obrigações congeladas: **nenhuma cobrança nova acumula**; o já devido (fees/aluguéis vencidos até a data) permanece devido | `status='suspended'`; sem novas competências; `auto_renew` ignorado durante a suspensão | Ficam indisponíveis (catálogo marca "suspenso") |
| `→ reinstated` | Liberadas | Voltam a `active`; competências de aluguel retomam **da reativação em diante** — o período suspenso não é cobrado (aplicação da regra "não paga além do já devido" ao intervalo; pro-rata em [06-modelo-receita](./06-modelo-receita.md)) | Voltam a `active`. Recomendado: prazo final **estendido pelo tempo suspenso**; alternativa: renegociação caso a caso — **DECISÃO — revisar** (registrada na [ADR-008](./adr/ADR-008-maquina-estado-juridico.md)) | Voltam a disponíveis |
| `→ defeated` | Bloqueadas para sempre | Entram no fluxo de resolução do §5 (o titular escolhe) | Encerram com `status='written_off'` (nada mais é devido) | Lote marcado para `burned` (registro imediato; queima on-chain quando houver chain real — [05-camada-ledger-blockchain](./05-camada-ledger-blockchain.md)) |

## 5. Fluxo de resolução quando o título "cai" (`defeated`)

Cada contrato ativo ou suspenso do título entra em **resolução pendente** — a coluna `status`
permanece `'suspended'` e uma tabela operacional dedicada (`contract_resolution_case`) carrega o
prazo e os lembretes (preferível a um flag, justamente pelos campos de prazo). O titular escolhe,
dentro do prazo parametrizado `system_parameters.resolution_window_days` (ex.: 30 dias), entre
duas opções:

### Opção A — Substituição (preserva o montante travado)

1. O sistema lista os títulos **disponíveis** (`available = true`, §1) com saldo de treasury
   suficiente.
2. O titular escolhe o título T′; a quantidade nova é
   `floor(preserved_face_value / unit_face_value_active(T′))`.
3. Em uma única transação: cria-se o `token_contract` novo **congelando o `unit_face_value` do
   parâmetro ativo de T′** — o que se preserva é o **montante** (`preserved_face_value` =
   valor de face remanescente do contrato antigo), não o preço unitário antigo; movimentam-se os
   tokens no ledger (`token_movement`); grava-se `contract_substitution` com
   `preserved_face_value` e `residual_value` (sobra não-realocável, que vira crédito do
   titular); o contrato velho recebe `status='substituted'`.
4. **Sem nova fee de 1ª transferência**: a substituição não é distribuição primária para fins de
   receita — a isenção é registrada explicitamente
   (`fee_exemption_reason = 'substitution_event'`), e a invariante de fee única vale pela cadeia
   old→new ([06-modelo-receita](./06-modelo-receita.md), [ADR-006](./adr/ADR-006-receita.md)).
5. Aluguéis lastreados no contrato antigo podem ser re-apontados ao contrato novo (se o
   locatário concordar) ou encerrados com `written_off`.

Exemplo numérico completo (inclusive a variante com `residual_value`):
[03 §5, Exemplo 3](./03-elasticidade-tokenizacao.md) e
[Apêndice D](./apendices/D-exemplos-numericos.md).

### Opção B — Write-off ("não paga nada além do já devido")

Significado **contábil** preciso:

- Parcelas e competências **futuras** de aluguel e quaisquer obrigações vincendas do contrato
  são canceladas (`lease.status='written_off'`; nenhuma linha nova de cobrança é gerada).
- Valores **já vencidos e devidos** até a data da queda permanecem exigíveis — fees com
  `status='pending'` vencidas continuam `pending`.
- Valores **já pagos não são devolvidos**: o risco jurídico do título é precificado no produto,
  com disclosure obrigatório no catálogo e no contrato.
- O contrato recebe `status='written_off'` e `closed_at = now()`; os tokens retornam à treasury
  do lote (que será queimado). **Nenhum crédito é gerado** — diferente do `residual_value` da
  substituição, que só existe na Opção A.

**Default no silêncio do titular**: se `resolution_window_days` expira sem escolha, aplica-se a
Opção B por padrão (parametrizável em `system_parameters`) — **DECISÃO — revisar** com o
jurídico, registrada na [ADR-008](./adr/ADR-008-maquina-estado-juridico.md) (tanto o default
quanto o valor do prazo).

## 6. Relação com os 9 `case_status` do levantamento

Os dois mundos permanecem **desacoplados**, ligados apenas por um gate de entrada e um alerta de
regressão. Os 9 status do case (`api/src/domain.js:8-18`; 5 automáticos + 4 decisórios,
`api/src/domain.js:392-393`) medem completude do dossiê — nunca mérito jurídico.

**Gate de elegibilidade** (avaliado na criação do título):

| Case status | Pode originar `security_title`? |
|---|---|
| `ready_for_structuring` | **Sim** (caminho normal) |
| `ready_with_caveats` | Somente com `eligibility_override = true` do Gestor, registrando as ressalvas aceitas no `eligibility_snapshot` |
| `new`, `docs_incomplete`, `legal_review`, `awaiting_calculation`, `awaiting_opinion`, `not_eligible`, `archived` | **Não** (409 na criação do título) |

- O snapshot (`case.status`, `derived.risk`, `derived.docPct`, pendências abertas) é congelado
  em `security_title.eligibility_snapshot` no cadastro — auditoria permanente de "com que base
  este ativo entrou no marketplace".
- **Regressão do case pós-título**: o motor atual continua funcionando — se um anexo invalidado
  reabre um blocker, `applyAutoStatus` regride o case a `docs_incomplete` automaticamente
  (`api/src/domain.js:409-418`). Isso **NUNCA transiciona a máquina jurídica do título**
  (levantamento é organizacional, não decisão jurídica). Em vez disso, gera um **alerta ao
  Gestor** (pendência de marketplace `case_regressed_after_listing`), e o Gestor decide — entre
  `archived` ou `ruled_against`, sempre com evidência. Mapear regressão→suspensão automática
  daria poder decisório ao motor de pendências, contra o princípio do próprio levantamento
  ("nenhuma transição afirma mérito jurídico", ESCOPO §8.2).
- **Estado inicial é sempre `unjudged`** — nunca há estado inicial "mágico". Se o case já
  documenta trânsito em julgado favorável nos lawsuits, o Gestor cadastra o título e aplica em
  seguida a transição `unjudged → ruled_favorable` com evidência, tudo via
  `legal_status_history`.

## 7. Interseção com RBAC

- `legal_status:transition` é permissão **sensível** (`is_sensitive = true`), ao lado de
  `params:*`, `tokens:issue` e `rbac:*` — todas exclusivas do papel `manager` nos seeds, todas
  com auditoria destacada ([01-rbac-permissoes](./01-rbac-permissoes.md); matriz completa no
  [Apêndice C](./apendices/C-matriz-rbac.md)).
- Advogado e Juiz têm exatamente a visão de que precisam para auditar: título + histórico
  jurídico completo + contratos/aluguéis vinculados + export da trilha (`audit:export`, escopo
  `linked` via `title_access_grants`) — **leitura qualificada, zero escrita**. Cada leitura de
  auditor é registrada na trilha ([07-trilha-auditoria](./07-trilha-auditoria.md),
  [08-portais-perfis](./08-portais-perfis.md)).

---

_Decisão e alternativas: [ADR-008](./adr/ADR-008-maquina-estado-juridico.md) · Disponibilidade e
trava de valor: [03-elasticidade-tokenizacao](./03-elasticidade-tokenizacao.md) · Efeitos de
receita: [06-modelo-receita](./06-modelo-receita.md) · DDL (`legal_status_history`,
`contract_substitution`): [Apêndice B](./apendices/B-ddl-conceitual.md)._
