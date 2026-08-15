---
title: "Modelo de receita — fee de 1ª transferência + aluguel"
status: proposta
updated: 2026-07-10
language: pt-BR
---

# 06 — Modelo de receita

> Este documento especifica o modelo de receita do marketplace BESC: **fee de primeira
> transferência** (cobre o custo operacional) e **aluguel de títulos** (o lucro que custeia toda a
> infra, inclusive as operações cripto). Define as entidades financeiras, os invariantes I1–I7, o
> fluxo de cobrança sem gateway, o plano de contas mínimo e os relatórios do Gestor. As decisões
> estruturais estão consolidadas na [ADR-006](./adr/ADR-006-receita.md); os exemplos numéricos
> normativos, conferíveis centavo a centavo, estão no
> [Apêndice D](./apendices/D-exemplos-numericos.md). Entra no ar na **Fase 4** do
> [09-roadmap](./09-roadmap.md); enquanto `go_live_enabled=false`
> ([10-gate-regulatorio](./10-gate-regulatorio.md)), faturas fora do piloto interno são recusadas
> em código.

O app atual não tem **nenhuma primitiva monetária**: todos os valores são strings livres pt-BR,
parseadas heuristicamente só para exibição (`api/src/domain.js:504-511`). Esse parse jamais
alimenta um valor contratual ou uma fatura — o dinheiro do marketplace nasce tipado
(`NUMERIC(18,2)` + `currency`, ver [02-modelo-de-dados](./02-modelo-de-dados.md)).

## 1. Princípio econômico

| Fluxo | Papel econômico | Característica |
|---|---|---|
| `first_transfer_fee` | Cobre o **custo operacional** do site; margem baixa | Única por contrato, cobrada apenas na **saída da treasury** (distribuição primária); transferências secundárias e substituições isentas |
| `lease` (aluguel/locação de títulos) | **Lucro principal**; custeia toda a infra, inclusive operações cripto (nós, custódia, ancoragem) | Recorrente por competência, base congelada + reajuste anual por índice |

**Fora de escopo permanente desta camada:** gateway de pagamento, cartão/PIX automatizado,
custódia de dinheiro, dados financeiros sensíveis. O sistema modela **obrigações, faturas e
lançamentos contábeis**; a liquidação financeira é externa e conciliada manualmente pelo Gestor
(comprovante anexado — reusa a infraestrutura de anexos em PVC já existente,
`api/src/server.js:41`).

## 2. A regra central: 1ª transferência = saída da treasury

A fee de primeira transferência incide **exatamente uma vez por contrato**, no momento da
**distribuição primária**: a transferência de titularidade cuja carteira de origem é a **treasury**
do emissor (`wallets.kind='treasury'`). Essa é a formulação adotada pela
[ADR-006](./adr/ADR-006-receita.md) (sub-decisão c).

Por que **não** uma flag por token individual (ex.: `token.first_transfer_at`): o modelo de
carteiras usa **posições fungíveis por lote** (`wallet_position`, ver
[02-modelo-de-dados](./02-modelo-de-dados.md)) — não existe uma linha por token para carimbar.
Uma flag por token exigiria rastrear serial individual off-chain, custo que a fungibilidade
elimina de propósito. A regra da treasury dispensa qualquer carimbo: a condição "é primeira
transferência?" é decidível pela **origem do movimento**, informação que já existe em
`token_movement.from_wallet`.

Consequências operacionais da regra:

- **Compra da treasury** (`token_contract.purpose='purchase'`) → gera fee (I1).
- **Transferência secundária** (origem fora da treasury) → isenta, com registro explícito
  `fee_exemption_reason='secondary_transfer'` (I2).
- **Substituição** de contrato de título caído → isenta (`substitution_event`): substituição não é
  nova venda (I3); a cadeia `contract_substitution` old→new preserva a unicidade da fee.
- **Caução e lastro de aluguel** não transferem titularidade para terceiro — não são distribuição
  primária e **não faturam fee**; o aluguel remunera pela via própria (`lease_accrual`).
- Emissão (`mint` para a treasury) e queima **nunca** faturam.

A garantia em banco é o **unique parcial `fee(contract_id) WHERE kind='first_transfer'`** — no
máximo uma fee de primeira transferência por contrato, imposta por índice, não por disciplina de
código.

## 3. Entidades

Tabelas de campos abaixo; o **DDL completo e normativo** está no
[Apêndice B](./apendices/B-ddl-conceitual.md). Convenção monetária de
[02-modelo-de-dados](./02-modelo-de-dados.md): dinheiro liquidável = `NUMERIC(18,2)` +
`currency CHAR(3) DEFAULT 'BRL'`; percentuais = `NUMERIC(8,4)`; sem float em lugar nenhum.

### 3.1 `fee_schedule` (versionado, imutável após ativação)

| Campo | Tipo | Observação |
|---|---|---|
| id | uuid | |
| version | int | sequencial; único |
| status | enum `fee_schedule_status` | `draft` · `active` · `retired` — só 1 `active` por vez |
| first_transfer_fee_type | enum | `percent_of_face` · `fixed_per_operation` |
| first_transfer_fee_value | numeric(8,4) | ex.: `0.5000` = 0,50% do valor de face |
| min_fee_per_operation | numeric(18,2) | piso por operação |
| max_fee_per_operation | numeric(18,2) nullable | teto opcional |
| rounding_rule | enum | `half_up_2dp` (padrão) |
| effective_from / effective_to | date | vigência |
| created_by / approved_by | uuid fk→users | ativação com segundo usuário quando houver 2 gestores; senão o mesmo, registrado na trilha |
| notes | text | justificativa da mudança |

> **DECISÃO — revisar** ([ADR-006](./adr/ADR-006-receita.md), sub-decisão a): recomenda-se
> `percent_of_face` = **0,5% do valor de face congelado** da operação, com **piso** de
> **R$ 25,00**. Racional: escala com o tamanho do lote (cobre custo sem sobretaxar lotes pequenos
> além do piso) e é neutro à quantidade de tokens — um fee fixo por token criaria receita
> artificialmente dependente do fator de fracionamento, que é parametrizável
> ([03-elasticidade-tokenizacao](./03-elasticidade-tokenizacao.md)). **Os valores numéricos são
> placeholders a calibrar com o custo real de infra.**

**Regra de captura:** a fatura da 1ª transferência referencia o `fee_schedule` **vigente na data
da assinatura do contrato** e congela um snapshot dos campos aplicados
(`invoice.fee_schedule_snapshot`). Mudança de tabela **nunca** reprecifica operação já contratada
— mesmo princípio da trava de valor do contrato (I4).

### 3.2 `lease` (aluguel — a receita principal)

| Campo | Tipo | Observação |
|---|---|---|
| id / lease_code | uuid / text unique | código humano (ex.: `LSE-2026-0003`) |
| contract_id | fk → token_contract | **contrato-lastro** (`purpose='lease_backing'`) — de onde vem o valor de face congelado |
| lessee_user_id | fk → users | tomador |
| quantity | bigint | tokens alugados |
| base_amount_frozen | numeric(18,2) | **base de cálculo congelada na assinatura** = `quantity × unit_face_value_frozen` do contrato-lastro |
| monthly_rate_pct | numeric(8,4) | % ao mês sobre `base_amount_frozen` |
| adjustment_index | enum `monetary_index` | **reusa o enum existente** em `api/src/domain.js:117-125` (`igpm`, `ipca`, `inpc`, `selic`, `tr`, `tabela_tj`, `outro`) |
| adjustment_period_months | int | padrão 12 (reajuste anual) |
| period_start / period_end | date | período |
| billing_day | int | dia de emissão da fatura |
| auto_renew | boolean | ignorado durante suspensão jurídica (I6) |
| status | enum `lease_status` | `draft` · `active` · `suspended` · `renewed` · `expired` · `terminated` · `written_off` |
| renewed_from_lease_id | fk → lease nullable | cadeia de renovações |
| suspension_reason | text | preenchido quando o estado jurídico do título suspende ([04-maquina-estado-juridico](./04-maquina-estado-juridico.md)) |
| terms_document_id | fk → terms_document | termos versionados aceitos |
| created_at / created_by | | |

> **DECISÃO — revisar** ([ADR-006](./adr/ADR-006-receita.md), sub-decisão b): base de cálculo =
> **% a.m. sobre valor de face congelado no contrato-lastro**, reajuste **anual por índice**
> (default IPCA), pro-rata por **dias corridos** em suspensão/reativação. Alternativa rejeitada:
> valor fixo mensal — não escala com o tamanho do título e exigiria renegociação a cada emissão.

### 3.3 `lease_accrual` (competência fechada — idempotente)

| Campo | Tipo | Observação |
|---|---|---|
| id | uuid | |
| lease_id | fk → lease | |
| competence_period | char(7) | `2026-07`; **UNIQUE (lease_id, competence_period)** — fechar duas vezes é no-op por construção (I5) |
| days_in_period / days_billable | int | evidência do pro-rata (I6) |
| base_applied / rate_applied_pct | numeric(18,2) / numeric(8,4) | snapshot pós-reajuste — a fatura é auditável sem recomputar |
| amount | numeric(18,2) | `round_half_up(base × taxa × days_billable/days_in_period, 2)` |
| invoice_id | fk → invoice | fatura gerada na mesma transação |
| created_by / created_at | fk → users / timestamptz | a linha nasce criada pelo ato explícito do Gestor "Fechar competência" |

### 3.4 `invoice` (fatura — ciclo manual, sem gateway)

| Campo | Tipo | Observação |
|---|---|---|
| id / invoice_code | uuid / text unique | ex.: `INV-2026-0041` |
| counterparty_user_id | fk → users | quem deve |
| invoice_type | enum | `first_transfer_fee` · `lease_rental` · `adjustment` |
| source_type / source_id | polimórfico | `fee` ou `lease_accrual` |
| competence_period | char(7) | competência ≠ caixa |
| amount | numeric(18,2) | |
| fee_schedule_snapshot | jsonb | snapshot da regra aplicada (auditabilidade; nulo em `lease_rental`) |
| issue_date / due_date | date | |
| status | enum `invoice_status` | `issued` · `paid` · `cancelled` · `written_off` |
| paid_at / paid_marked_by | timestamptz / fk | **marcado manualmente pelo Gestor** |
| payment_evidence_ref | text | comprovante anexado (infra de anexos do PVC, `api/src/server.js:41`) |

### 3.5 `ledger_entry` (contábil — dupla entrada simplificada, append-only)

| Campo | Tipo | Observação |
|---|---|---|
| id / seq | uuid / bigserial | ordenação total |
| entry_date / competence_period | date / char(7) | competência ≠ caixa |
| debit_account / credit_account | enum `ledger_account` | plano de contas §4 |
| amount | numeric(18,2) | sempre > 0 |
| source_type / source_id | | `invoice` · `cost_entry` · `reversal` |
| memo / created_by | | |
| reversal_of_seq | fk nullable | **correção só por estorno** — nunca UPDATE/DELETE (I7; alinhado à trilha imutável de [07-trilha-auditoria](./07-trilha-auditoria.md)) |

### 3.6 `cost_entry` (custos lançados pelo Gestor)

`id`, `category` (enum: `infra_hosting` · `crypto_ops` · `legal_regulatory` · `custody` ·
`other`), `description`, `amount numeric(18,2)`, `competence_period`, `evidence_ref`,
`created_by`. Cada registro gera um `ledger_entry` (`D expense_* / C cash_manual`) na mesma
transação. É o que permite o DRE receita×custo (§7, relatório `revenue_vs_cost`) — o aluguel
precisa **provadamente** cobrir a infra, inclusive a cripto.

### 3.7 Acoplamento com as entidades de token

O acoplamento segue a regra da treasury (§2) — **não** existe flag por token:

- **`fee`** (definida em [02-modelo-de-dados](./02-modelo-de-dados.md)): pendurada em
  `token_contract` (`contract_id`, `kind`, `amount`, `basis`, `status`), com o **unique parcial
  `fee(contract_id) WHERE kind='first_transfer'`**. A fee nasce na mesma transação do contrato de
  distribuição primária e referencia a fatura gerada.
- **`token_movement`** (o razão append-only de movimentações) ganha, nos movimentos de
  transferência: `fee_amount numeric(18,2) DEFAULT 0` e `fee_exemption_reason` (enum:
  `secondary_transfer` · `substitution_event` · `manual_waiver`; nulo quando houve fee). Regra de
  serviço: movimento com origem na treasury e transferência de titularidade → fee obrigatória
  (exceto substituição); origem fora da treasury → `fee_amount=0` +
  `fee_exemption_reason='secondary_transfer'`. **Toda isenção é um registro explícito e
  auditável** — o relatório `fee_exemption_audit` (§7) lista todas.

## 4. Plano de contas mínimo (enum `ledger_account`, 8 contas)

| Conta | Natureza | Uso |
|---|---|---|
| `accounts_receivable` | ativo | faturas emitidas e não pagas |
| `cash_manual` | ativo | caixa conciliado manualmente (recebimentos e pagamentos externos) |
| `revenue_first_transfer_fee` | receita | fee de distribuição primária |
| `revenue_lease` | receita | aluguel por competência |
| `expense_infra` | despesa | hospedagem, cluster, armazenamento |
| `expense_crypto_ops` | despesa | nós Besu, custódia, ancoragem |
| `expense_other` | despesa | demais custos (`legal_regulatory`, `custody`, `other`) |
| `adjustments` | transitória | estornos de cancelamento e write-off de inadimplência |

## 5. Invariantes de receita (I1–I7)

Os invariantes usam os **7 estados jurídicos** de
[04-maquina-estado-juridico](./04-maquina-estado-juridico.md) /
[ADR-008](./adr/ADR-008-maquina-estado-juridico.md): "suspenso" ≙ `{ruled_against, under_appeal}`;
"caiu" ≙ `defeated` (dispara substituição ou write-off).

| # | Invariante | Mecanismo |
|---|---|---|
| I1 | **Fee só na distribuição primária** (saída da treasury) | Fee aplicada exatamente às transferências de titularidade com origem na treasury; criada **na mesma transação** do contrato e da fatura; unicidade garantida pelo **unique parcial `fee(contract_id) WHERE kind='first_transfer'`** (índice, não disciplina de código). |
| I2 | Transferências secundárias isentas | `token_movement.fee_amount = 0` + `fee_exemption_reason = 'secondary_transfer'` — o registro de isenção é **explícito e auditável** (relatório `fee_exemption_audit` lista todas). |
| I3 | Substituição de título caído não gera fee | Contratos criados por substituição registram `fee_exemption_reason = 'substitution_event'` — substituição não é nova venda; a cadeia `contract_substitution` old→new preserva a fee única. |
| I4 | Valor de face congelado | `unit_face_value_frozen` copiado ao contrato na assinatura ([03-elasticidade-tokenizacao](./03-elasticidade-tokenizacao.md)); `fee_schedule_snapshot` congela a regra na fatura. Nenhum recálculo retroativo, em nenhuma direção. |
| I5 | Aluguel por competência, uma vez só | Ação explícita do Gestor **"Fechar competência"** gera `lease_accrual` com **UNIQUE (lease_id, competence_period)** — idempotente por construção. **DECISÃO — revisar** ([ADR-006](./adr/ADR-006-receita.md), sub-decisão d): fechamento **manual** (sem cron) na fase inicial; job agendado só quando o volume justificar. |
| I6 | Suspensão jurídica suspende o aluguel | Transição do título para `ruled_against` ou `under_appeal` publica evento de domínio; o accrual da competência corta **pro-rata por dias corridos até a véspera** da suspensão. `reinstated` retoma pro-rata **do dia da reativação em diante** (o intervalo suspenso não é cobrado — "nada além do já devido"). `defeated` encerra: aluguéis viram `written_off`, sem novas competências. |
| I7 | Contabilidade sempre balanceada e imutável | Dupla entrada por construção (1 débito + 1 crédito por linha, `amount > 0`); correção só via `reversal_of_seq`; `SUM(débitos) = SUM(créditos)` verificado por teste e pelo relatório `trial_balance`. |

## 6. Fluxo de cobrança sem gateway (fase inicial)

```
[Evento: distribuição primária (fee) OU "Fechar competência" (aluguel)]
        │  (mesma transação: fee/lease_accrual + invoice + ledger_entry + audit_event)
        ▼
invoice(status=issued) ──► ledger_entry: D accounts_receivable / C revenue_*
        │
        ▼  (fora do sistema: cliente paga por meio externo — transferência, PIX manual etc.)
Gestor anexa comprovante e marca "paga"
        │
        ▼
invoice(status=paid) ──► ledger_entry: D cash_manual / C accounts_receivable
```

- **Cancelamento:** `invoice.status='cancelled'` + lançamento de estorno
  (`reversal_of_seq` apontando o lançamento original) — a fatura nunca é apagada.
- **Inadimplência:** `invoice.status='written_off'` + estorno para `adjustments`. Política a
  definir — **DECISÃO — revisar** ([ADR-006](./adr/ADR-006-receita.md)): aluguel inadimplente por
  N competências suspende o `lease`? Após quantos dias uma fatura `issued` vira `written_off`?
  Definir com o jurídico junto com a calibração dos percentuais.

Toda transição de fatura gera `audit_event` na mesma transação
([07-trilha-auditoria](./07-trilha-auditoria.md)).

## 7. Relatórios financeiros do Gestor

Seis novos `report_type`, reusando o pipeline de relatórios existente
(`api/src/reports.js:21-31` — `REPORT_TYPES` + render HTML):

| Relatório (key) | Conteúdo |
|---|---|
| `revenue_by_period` | Receita por competência **e** por caixa, quebrada por conta (`fee` vs `lease`), por título |
| `receivables_aging` | Faturas `issued` por faixa de atraso |
| `fee_exemption_audit` | Toda transferência com `fee_amount = 0` + motivo — verificação viva dos invariantes I1–I3 |
| `lease_roll` | Aluguéis ativos, próxima competência, suspensos (com o estado jurídico que motivou), reajustes previstos |
| `revenue_vs_cost` | DRE simplificado por período (receita × `cost_entry`) — o do exemplo 2 abaixo |
| `trial_balance` | Balancete: soma de débitos = soma de créditos por conta (sanity do I7) |

## 8. Exemplos numéricos

Versão resumida; a versão **normativa, conferível centavo a centavo e com os lançamentos
contábeis completos**, está no [Apêndice D](./apendices/D-exemplos-numericos.md) (exemplos D.4 e
D.5 — a Fase 4 do [09-roadmap](./09-roadmap.md) só está pronta quando eles reproduzem em
staging). Parâmetros: `fee_schedule` ativo = 0,50% do valor de face congelado, piso R$ 25,00,
`half_up_2dp` (placeholders da [ADR-006](./adr/ADR-006-receita.md)).

### Exemplo 1 — Emissão → distribuição primária com fee → secundárias isentas

1. **Emissão:** título `T-0007` (derivado do caso `BESC-2026-0007`, `ready_for_structuring`):
   10 ações × fator 100 = **1.000 tokens** na treasury. Face de referência do laudo:
   R$ 52,00/token. *Nenhuma receita — emissão não fatura.*
2. **Distribuição primária — treasury → Investidor A, 400 tokens.** Contrato congela face
   R$ 52,00 → base 400 × 52,00 = **R$ 20.800,00**. Fee = 20.800,00 × 0,5% = **R$ 104,00**
   (≥ piso 25,00). `invoice INV-2026-0041` (issued) →
   `D accounts_receivable / C revenue_first_transfer_fee 104,00` (competência 2026-07); Gestor
   marca paga com comprovante → `D cash_manual / C accounts_receivable 104,00`.
3. **Transferência secundária — Investidor A → Investidor B, 150 tokens.** A origem **não é a
   treasury** → `fee_amount = 0,00`, `fee_exemption_reason = 'secondary_transfer'` (I2).
   **Sem fatura, sem lançamento** — só o registro explícito de isenção em `token_movement`.
4. **Distribuição primária do restante — treasury → Investidor C, 600 tokens.** Novo contrato
   congela face R$ 55,00 (o mercado moveu; o congelamento é **por contrato**, I4). Fee =
   600 × 55,00 × 0,5% = **R$ 165,00**. Fatura + lançamentos análogos ao passo 2.

**Receita total de fees do título `T-0007`, para sempre: R$ 269,00** — nunca mais um centavo de
fee sobre esses 1.000 tokens (I1/I2), inclusive se `T-0007` cair (`defeated`) e os contratos
forem substituídos (I3).

### Exemplo 2 — Aluguel com suspensão jurídica + DRE receita×custo

1. **Contrato:** `LSE-2026-0003` — título `T-0012`, base congelada R$ 40.000,00, taxa
   0,9% a.m. = **R$ 360,00/competência**, 12 meses, reajuste anual IPCA, `billing_day` 5.
2. **2026-07:** competência integral → fatura R$ 360,00 (`D accounts_receivable /
   C revenue_lease`) · paga em 05/08.
3. **2026-08:** decisão judicial em **16/08** — o título transiciona para `ruled_against`
   (suspenso) e o evento propaga ao aluguel (I6). Pro-rata **15/31 dias = R$ 174,19**.
4. **2026-09:** recurso provido — `under_appeal → reinstated` em **10/09**. Pro-rata
   **21/30 dias = R$ 252,00**.
5. **Custos do trimestre (`cost_entry`):** infra R$ 320,00/mês (jul, ago, set) + `crypto_ops`
   R$ 180,00 em setembro (nó Besu de teste) → 4 lançamentos `D expense_* / C cash_manual`.
6. **Relatório `revenue_vs_cost` Q3/2026** (considerando também as fees do exemplo 1):

| Linha | Valor |
|---|---:|
| `revenue_first_transfer_fee` (ex. 1) | R$ 269,00 |
| `revenue_lease` (360,00 + 174,19 + 252,00) | R$ 786,19 |
| **Receita total** | **R$ 1.055,19** |
| `expense_infra` (3 × 320,00) | R$ 960,00 |
| `expense_crypto_ops` | R$ 180,00 |
| **Custo total** | **R$ 1.140,00** |
| **Resultado do período** | **− R$ 84,81** |

O trimestre negativo é intencional no exemplo: demonstra exatamente o que o relatório deve
evidenciar ao Gestor — **suspensão jurídica derruba a receita de aluguel** (o lucro principal), e
o dashboard precisa mostrar esse acoplamento (I6) para decisão de portfólio.

---

_Decisões: [ADR-006](./adr/ADR-006-receita.md) · Estados jurídicos:
[04-maquina-estado-juridico](./04-maquina-estado-juridico.md) /
[ADR-008](./adr/ADR-008-maquina-estado-juridico.md) · DDL:
[Apêndice B](./apendices/B-ddl-conceitual.md) · Exemplos normativos:
[Apêndice D](./apendices/D-exemplos-numericos.md) · Fase de entrega:
[09-roadmap](./09-roadmap.md) (Fase 4) · Trava de go-live:
[10-gate-regulatorio](./10-gate-regulatorio.md)._
