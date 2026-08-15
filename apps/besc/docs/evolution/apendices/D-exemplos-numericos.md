---
title: "Apêndice D — Exemplos numéricos (normativo)"
status: proposta
updated: 2026-07-10
language: pt-BR
---

# Apêndice D — Exemplos numéricos (normativo)

> Este apêndice é **normativo**: os exemplos abaixo são os casos de referência que a
> implementação deve reproduzir **centavo a centavo**. O critério de pronto da Fase 4 do
> [09-roadmap](../09-roadmap.md) exige que D.4 e D.5 reproduzam em staging; o cenário base de
> emissão de D.1 (10 ações × fator 100) é o critério de pronto da Fase 1. Cada exemplo com efeito
> financeiro traz a tabela de lançamentos contábeis (`ledger_entry`) em que
> **Σ débitos = Σ créditos** — invariante I7 de [06-modelo-receita](../06-modelo-receita.md).

**Parâmetros comuns (placeholders da [ADR-006](../adr/ADR-006-receita.md), a calibrar):**
`fee_schedule` ativo = `percent_of_face` 0,50% do valor de face congelado da operação, piso
`min_fee_per_operation` = R$ 25,00, arredondamento `half_up_2dp` (2 casas, meio para cima).
Fórmula da fee: `fee = max(round_half_up(base × 0,005; 2); 25,00)`. Regra de incidência: fee só
na **distribuição primária** (saída da treasury) — [06-modelo-receita §2](../06-modelo-receita.md).

---

## Parte 1 — Elasticidade (mecanismo de [03-elasticidade-tokenizacao](../03-elasticidade-tokenizacao.md))

### D.1 — Emissão base

Título `T1`: 10 ações PNB; `market_valuation` = R$ 1.000,00/ação (perícia, 2026-03). O Gestor
cria o parâmetro v1: `tokens_per_share = 100`, `unit_face_value = R$ 10,00`.

| Passo | Operação | Conferência |
|---|---|---|
| 1 | Emissão do lote L1 = 1.000 tokens para a treasury | Invariante de supply: 1.000 ≤ 10 × 100 ✓. **Emissão não fatura.** |
| 2 | Ana contrata 200 tokens → contrato C1 | `unit_face_value_frozen = 10,00`; `total_face_value = 200 × 10,00 = R$ 2.000,00`; `parameter_id = v1` |
| 3 | Fee de distribuição primária (origem = treasury) | 2.000,00 × 0,5% = R$ 10,00 < piso → **fee = R$ 25,00** (piso aplicado; `basis = 'pct:0.5|floor:25.00'`) |

Lançamentos (competência 2026-04; fatura emitida e paga):

| # | Competência | Débito | Crédito | Valor (R$) | Origem |
|---|---|---|---|---:|---|
| 1 | 2026-04 | `accounts_receivable` | `revenue_first_transfer_fee` | 25,00 | invoice da fee de C1 (issued) |
| 2 | 2026-04 | `cash_manual` | `accounts_receivable` | 25,00 | invoice marcada paga |
| | | **Σ débitos** | **Σ créditos** | **50,00 = 50,00** ✓ | |

### D.2 — Valorização (contratos antigos intocados)

Nova perícia: R$ 1.500,00/ação. O Gestor registra a `market_valuation` e ativa o parâmetro v2:
`tokens_per_share = 100` (imutável — já houve emissão), `unit_face_value = R$ 15,00`.

| Efeito | Conferência |
|---|---|
| Contrato C1 (Ana) | **Segue valendo 200 × R$ 10,00 = R$ 2.000,00** — travado; nenhum UPDATE |
| 800 tokens de L1 na treasury | Passam a contratar a R$ 15,00 (parâmetro ativo no instante do contrato) |
| Bruno contrata 100 tokens → C2 | Congela R$ 15,00; `total_face_value = 100 × 15,00 = R$ 1.500,00`; `parameter_id = v2` |
| Fee de C2 (origem = treasury) | 1.500,00 × 0,5% = R$ 7,50 < piso → **fee = R$ 25,00** |
| Lote novo L2 (se emitido) | Nasce com `unit_face_value_at_issuance = 15,00` (metadado); nada muda on-chain em L1 |

Lançamentos (competência 2026-05; fatura emitida e paga):

| # | Competência | Débito | Crédito | Valor (R$) | Origem |
|---|---|---|---|---:|---|
| 1 | 2026-05 | `accounts_receivable` | `revenue_first_transfer_fee` | 25,00 | invoice da fee de C2 (issued) |
| 2 | 2026-05 | `cash_manual` | `accounts_receivable` | 25,00 | invoice marcada paga |
| | | **Σ débitos** | **Σ créditos** | **50,00 = 50,00** ✓ | |

### D.3 — Queda do título + substituição (com residual)

`T1` cai: trânsito em julgado desfavorável → estado jurídico `defeated`
([04-maquina-estado-juridico](../04-maquina-estado-juridico.md)). O contrato C1 de Ana
(200 × R$ 10,00 = R$ 2.000,00) entra no fluxo de resolução; Ana escolhe **substituição** por
`T3`, cujo parâmetro ativo é `unit_face_value = R$ 12,50`:

| Grandeza | Cálculo | Valor |
|---|---|---:|
| `preserved_face_value` | `= total_face_value` remanescente de C1 | R$ 2.000,00 |
| Quantidade nova | `floor(2.000,00 / 12,50)` | 160 tokens |
| Valor do contrato novo C1′ | 160 × 12,50 | R$ 2.000,00 |
| `residual_value` | 2.000,00 − 2.000,00 | R$ 0,00 |

**Variante com resíduo** — se o parâmetro ativo de `T3` fosse R$ 12,60:

| Grandeza | Cálculo | Valor |
|---|---|---:|
| Quantidade nova | `floor(2.000,00 / 12,60)` | 158 tokens |
| Valor do contrato novo C1′ | 158 × 12,60 | R$ 1.990,80 |
| `residual_value` | 2.000,00 − 1.990,80 | **R$ 9,20** |

Lançamentos:

| # | Competência | Débito | Crédito | Valor (R$) | Origem |
|---|---|---|---|---:|---|
| — | | *(nenhum lançamento)* | | 0,00 | substituição isenta (I3) |

Conferência das isenções e do residual:

- **Sem fee**: a substituição não é nova venda — `fee_exemption_reason = 'substitution_event'`
  registrado no movimento; a cadeia `contract_substitution` C1→C1′ preserva o unique parcial
  `fee(contract_id) WHERE kind='first_transfer'` (invariantes I1/I3 de
  [06-modelo-receita](../06-modelo-receita.md)).
- **O residual não transita pelo razão financeiro**: não há movimentação de caixa nem receita —
  os R$ 9,20 ficam registrados em `contract_substitution.residual_value` como crédito do titular,
  rastreável pela trilha de auditoria ([07-trilha-auditoria](../07-trilha-auditoria.md)).
- Alternativa de Ana: **write-off** — nada é cobrado além do já devido; valores pagos não são
  devolvidos; nenhum lançamento novo além dos estornos de obrigações vincendas
  ([04-maquina-estado-juridico](../04-maquina-estado-juridico.md)).

---

## Parte 2 — Receita ([06-modelo-receita](../06-modelo-receita.md))

> Os exemplos D.4 e D.5 formam **um único cenário fechado** (títulos `T-0007` e `T-0012`,
> Q3/2026) — o DRE e o balancete consolidados abaixo consideram exatamente estes lançamentos.
> Os fees de D.1/D.2 (títulos `T1`/`T3`) são cenário ilustrativo separado e **não** entram no
> consolidado.

### D.4 — Fees do título `T-0007` (total perpétuo: R$ 269,00)

Título `T-0007`: 10 ações × fator 100 = 1.000 tokens na treasury; face de referência do laudo
R$ 52,00/token.

| Passo | Operação | Fee |
|---|---|---:|
| 1 | Emissão de 1.000 tokens | — (emissão não fatura) |
| 2 | Treasury → Investidor A, 400 tokens; congela face R$ 52,00; base = 400 × 52,00 = R$ 20.800,00 | 20.800,00 × 0,5% = **R$ 104,00** (≥ piso) |
| 3 | Investidor A → Investidor B, 150 tokens (secundária) | **R$ 0,00** — origem não é treasury; `fee_exemption_reason = 'secondary_transfer'`; sem fatura, sem lançamento |
| 4 | Treasury → Investidor C, 600 tokens; congela face R$ 55,00 (o mercado moveu; congelamento é por contrato); base = 600 × 55,00 = R$ 33.000,00 | 33.000,00 × 0,5% = **R$ 165,00** |
| | **Total de fees do título, para sempre** | **R$ 269,00** |

Nunca mais um centavo de fee sobre esses 1.000 tokens (I1/I2), inclusive se `T-0007` cair e os
contratos forem substituídos (I3).

Lançamentos (ambas as faturas emitidas e pagas dentro do Q3/2026):

| # | Competência | Débito | Crédito | Valor (R$) | Origem |
|---|---|---|---|---:|---|
| 1 | 2026-07 | `accounts_receivable` | `revenue_first_transfer_fee` | 104,00 | `INV-2026-0041` (issued) — fee Investidor A |
| 2 | 2026-07 | `cash_manual` | `accounts_receivable` | 104,00 | `INV-2026-0041` paga (comprovante anexado) |
| 3 | 2026-08 | `accounts_receivable` | `revenue_first_transfer_fee` | 165,00 | `INV-2026-0058` (issued) — fee Investidor C |
| 4 | 2026-08 | `cash_manual` | `accounts_receivable` | 165,00 | `INV-2026-0058` paga |
| | | **Σ débitos** | **Σ créditos** | **538,00 = 538,00** ✓ | |

### D.5 — Aluguel com suspensão jurídica pro-rata + DRE do trimestre

Contrato `LSE-2026-0003` — título `T-0012`, base congelada R$ 40.000,00, taxa 0,9% a.m.
(= R$ 360,00/competência integral), 12 meses, reajuste anual IPCA (sem reajuste dentro do Q3),
`billing_day` 5.

Linha do tempo jurídica ([04-maquina-estado-juridico](../04-maquina-estado-juridico.md)):
decisão desfavorável em **16/08** (`unjudged → ruled_against` — aluguel suspende; recurso
interposto → `under_appeal`); recurso provido em **10/09** (`under_appeal → reinstated` —
aluguel reativa).

Competências (pro-rata por dias corridos, I6 — cobra até a **véspera** da suspensão e **do dia**
da reativação em diante):

| Competência | Dias faturáveis | Cálculo | Valor |
|---|---|---|---:|
| 2026-07 | 31/31 (integral) | 360,00 | R$ 360,00 |
| 2026-08 | 15/31 (01–15/08; suspenso em 16/08) | 360,00 × 15/31 = 174,193548… → half-up | R$ 174,19 |
| 2026-09 | 21/30 (10–30/09; reativado em 10/09) | 360,00 × 21/30 = 252,00 (exato) | R$ 252,00 |
| **Total `revenue_lease` Q3** | | | **R$ 786,19** |

Custos do trimestre (`cost_entry`): infra R$ 320,00/mês (jul, ago, set) + `crypto_ops`
R$ 180,00 em setembro (nó Besu de teste).

Lançamentos (a fatura de julho é paga em 05/08; as de agosto e setembro seguem `issued` no
fechamento — alimentam o `receivables_aging`):

| # | Competência | Débito | Crédito | Valor (R$) | Origem |
|---|---|---|---|---:|---|
| 1 | 2026-07 | `accounts_receivable` | `revenue_lease` | 360,00 | accrual 2026-07 (issued) |
| 2 | 2026-07 | `cash_manual` | `accounts_receivable` | 360,00 | fatura de julho paga em 05/08 |
| 3 | 2026-08 | `accounts_receivable` | `revenue_lease` | 174,19 | accrual 2026-08 pro-rata 15/31 |
| 4 | 2026-09 | `accounts_receivable` | `revenue_lease` | 252,00 | accrual 2026-09 pro-rata 21/30 |
| 5 | 2026-07 | `expense_infra` | `cash_manual` | 320,00 | cost_entry infra jul |
| 6 | 2026-08 | `expense_infra` | `cash_manual` | 320,00 | cost_entry infra ago |
| 7 | 2026-09 | `expense_infra` | `cash_manual` | 320,00 | cost_entry infra set |
| 8 | 2026-09 | `expense_crypto_ops` | `cash_manual` | 180,00 | cost_entry nó Besu de teste |
| | | **Σ débitos** | **Σ créditos** | **2.286,19 = 2.286,19** ✓ | |

**DRE do trimestre — relatório `revenue_vs_cost` Q3/2026** (regime de competência; consolida
D.4 + D.5):

| Linha | Valor |
|---|---:|
| `revenue_first_transfer_fee` (D.4) | R$ 269,00 |
| `revenue_lease` (360,00 + 174,19 + 252,00) | R$ 786,19 |
| **Receita total** | **R$ 1.055,19** |
| `expense_infra` (3 × 320,00) | R$ 960,00 |
| `expense_crypto_ops` | R$ 180,00 |
| **Custo total** | **R$ 1.140,00** |
| **Resultado do período** | **− R$ 84,81** |

O trimestre negativo é intencional: evidencia ao Gestor que **suspensão jurídica derruba a
receita de aluguel** (o lucro principal) — o acoplamento do invariante I6 que o dashboard precisa
mostrar para decisão de portfólio.

**Visão caixa** (relatório `revenue_by_period`, coluna caixa): recebimentos =
104,00 + 165,00 + 360,00 = R$ 629,00; pagamentos de custos = R$ 1.140,00; **caixa líquido do
trimestre = − R$ 511,00**.

### Balancete consolidado Q3/2026 (relatório `trial_balance` — D.4 + D.5)

| Conta | Σ débitos (R$) | Σ créditos (R$) | Saldo |
|---|---:|---:|---|
| `accounts_receivable` | 1.055,19 | 629,00 | devedor 426,19 (= faturas em aberto: 174,19 + 252,00) |
| `cash_manual` | 629,00 | 1.140,00 | credor 511,00 (saída líquida de caixa) |
| `revenue_first_transfer_fee` | — | 269,00 | credor 269,00 |
| `revenue_lease` | — | 786,19 | credor 786,19 |
| `expense_infra` | 960,00 | — | devedor 960,00 |
| `expense_crypto_ops` | 180,00 | — | devedor 180,00 |
| **Totais** | **2.824,19** | **2.824,19** | **✓ fecha (I7)** |

Conferências cruzadas (critério do revisor): receitas do balancete (269,00 + 786,19 =
1.055,19) = receita total do `revenue_vs_cost`; despesas (960,00 + 180,00 = 1.140,00) = custo
total; saldo devedor de `accounts_receivable` (426,19) = soma das faturas `issued` não pagas no
`receivables_aging`; a transferência secundária do passo 3 de D.4 aparece no
`fee_exemption_audit` com motivo `secondary_transfer` e valor 0,00.

---

_Regras e invariantes: [06-modelo-receita](../06-modelo-receita.md) ·
[ADR-006](../adr/ADR-006-receita.md) · Elasticidade:
[03-elasticidade-tokenizacao](../03-elasticidade-tokenizacao.md) · Estados jurídicos:
[04-maquina-estado-juridico](../04-maquina-estado-juridico.md) · DDL:
[Apêndice B](./B-ddl-conceitual.md)._
