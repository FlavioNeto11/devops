# ADR-006 — Modelo de receita: fee de 1ª transferência + aluguel

Status: DECISÃO — revisar

Contexto: o marketplace precisa de um modelo de receita com dois fluxos — a fee de primeira
transferência cobre o custo operacional do site (margem baixa) e o aluguel de títulos é o lucro
principal, que custeia toda a infra, inclusive as operações cripto. O app atual não tem nenhuma
primitiva monetária (valores são strings livres pt-BR, parse heurístico só para exibição em
`api/src/domain.js:504-511`); existe, porém, o enum `monetary_index`
(`api/src/domain.js:117-125`), reaproveitado no reajuste do aluguel. As carteiras do marketplace
usam posições fungíveis por lote (`wallet_position`), o que condiciona a forma de detectar a
"primeira transferência". Especificação completa em [06-modelo-receita](../06-modelo-receita.md);
exemplos normativos no [Apêndice D](../apendices/D-exemplos-numericos.md).

Decisão: adotar, em conjunto, as quatro sub-decisões abaixo.

- **(a) Fee de 1ª transferência = % do valor de face congelado + piso.** Cobrar
  `percent_of_face` = **0,5%** do valor de face congelado da operação, com piso
  `min_fee_per_operation` = **R$ 25,00**, arredondamento `half_up_2dp`, via `fee_schedule`
  versionado (imutável após ativação, snapshot na fatura). **Os dois números são placeholders a
  calibrar com o custo real de infra.**
- **(b) Aluguel = % a.m. sobre base congelada + reajuste anual por índice + pro-rata em dias
  corridos.** `monthly_rate_pct` sobre `base_amount_frozen` (congelada na assinatura a partir do
  contrato-lastro), reajuste a cada `adjustment_period_months` (padrão 12) pelo
  `adjustment_index` (default IPCA; enum reaproveitado de `api/src/domain.js:117-125`); suspensão
  e reativação jurídicas cortam/retomam a competência pro-rata por dias corridos.
- **(c) "1ª transferência" = saída da treasury (distribuição primária).** A fee incide
  exatamente nas transferências de titularidade cuja origem é a carteira `treasury`; garantia em
  banco pelo unique parcial `fee(contract_id) WHERE kind='first_transfer'`. Transferências
  secundárias e substituições são isentas **com registro explícito**
  (`token_movement.fee_exemption_reason`: `secondary_transfer` · `substitution_event` ·
  `manual_waiver`), auditáveis pelo relatório `fee_exemption_audit`.
- **(d) Fechamento de competência manual (sem cron) na fase inicial.** O accrual de aluguel nasce
  da ação explícita do Gestor "Fechar competência", idempotente pelo unique
  `(lease_id, competence_period)`; job agendado só quando o volume justificar.

Alternativas rejeitadas:
- **Fee fixo por token** — cria receita artificialmente dependente do fator de fracionamento
  (que é parametrizável por título); o mesmo lote renderia mais ou menos só por ter sido fatiado
  diferente.
- **Flag por token individual (`token.first_transfer_at`)** — incompatível com posições fungíveis
  `wallet_position` por lote: não existe linha por token para carimbar; exigiria rastrear serial
  individual off-chain, custo que a fungibilidade elimina de propósito. A origem do movimento
  (`from_wallet` = treasury?) decide a mesma pergunta sem estado extra.
- **Aluguel de valor fixo mensal** — não escala com o tamanho do título e exigiria renegociação a
  cada emissão/valorização.
- **Fechamento de competência por cron/job** — complexidade e novo modo de falha sem ganho no
  volume atual de operador único; a idempotência por unique já protege o fechamento manual.
- **Gateway de pagamento/cobrança automática** — fora de escopo permanente desta fase: o sistema
  modela obrigações e lançamentos; a liquidação é externa e conciliada manualmente.

Consequências: receita fica inteiramente auditável e reconstruível — todo valor cobrado tem
snapshot da regra (`fee_schedule_snapshot`), base congelada e trilha; os invariantes I1–I7 de
[06-modelo-receita](../06-modelo-receita.md) nascem desta decisão (fee única por contrato via
índice parcial; isenções explícitas; accrual idempotente; pro-rata jurídico; dupla entrada
append-only com correção só por estorno). Fica mais fácil: provar em relatório que a 2ª
transferência jamais fatura e que o aluguel cobre (ou não) o custo de infra (`revenue_vs_cost`).
Fica mais difícil: a operação depende do Gestor (marcar pagamento, fechar competência, lançar
custos) — aceitável no volume atual e coerente com o ciclo sem gateway.

Revisão pendente: **calibração dos percentuais** (0,5% e piso R$ 25,00; taxa de aluguel de
referência) contra o custo real de infra apurado em `cost_entry` — decide o operador com base no
primeiro trimestre de dados; **política de inadimplência** (após quantas competências em aberto o
`lease` suspende; quando uma fatura `issued` vira `written_off`) — definir com o jurídico.
