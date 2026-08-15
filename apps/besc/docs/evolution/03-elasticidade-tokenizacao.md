---
title: "Elasticidade da tokenização — fator, valor unitário e trava de valor por contrato"
status: proposta
updated: 2026-07-10
language: pt-BR
---

# 03 — Elasticidade da tokenização

> Este documento define o mecanismo de **desmembramento parametrizável ação→tokens** e a
> **trava de valor por contrato**: como o valor de mercado da ação pode subir e descer livremente
> sem jamais alterar o valor de face de um contrato já celebrado. As entidades citadas
> (`market_valuation`, `tokenization_parameter`, `token_batch`, `token_contract`,
> `contract_substitution`) estão descritas em [02-modelo-de-dados](./02-modelo-de-dados.md) e têm
> DDL normativa no [Apêndice B](./apendices/B-ddl-conceitual.md). Os exemplos numéricos deste
> documento são conferíveis centavo a centavo no [Apêndice D](./apendices/D-exemplos-numericos.md).

## 1. Os três valores, separados

A elasticidade nasce de uma separação estrita entre três valores que o sistema **nunca** confunde:

| Valor | Onde vive | Quem registra | Muda? |
|---|---|---|---|
| **Valor de mercado da ação** | `market_valuation` (série temporal **append-only**) | Gestor, citando a fonte (`source: manual \| pericia \| market_feed` futuro) e a evidência (`evidence_ref`: laudo anexado ao case ou URL) | Sim — a cada novo registro; registros anteriores jamais são editados ou apagados |
| **Valor unitário de contratação do token** | `tokenization_parameter.unit_face_value` (versão com `status='active'`) | Gestor, por **nova versão** do parâmetro (nunca UPDATE da versão vigente), rastreada à avaliação que a motivou (`based_on_valuation_id`) | Sim — por versionamento (§7) |
| **Valor de face travado do contrato** | `token_contract.unit_face_value_frozen` (snapshot no instante da contratação) | O próprio sistema, copiando do parâmetro vigente na transação de contratação | **Nunca.** Sem UPDATE por definição de schema e de serviço (§2) |

O primeiro valor é opinião de mercado (informativa); o segundo é ato administrativo do Gestor
(preço de prateleira); o terceiro é âncora jurídica do contrato. A cadeia entre eles é
auditável: para qualquer contrato, `contract → parameter(version) → market_valuation →
evidence_ref (laudo)` reconstrói **por que aquele preço valia naquele momento** (§6).

Um princípio herdado do diagnóstico do código atual: os campos monetários do case
(`estimated_value`, `updated_value`, ...) são **strings livres pt-BR** e assim permanecem — o
parse heurístico de `estimatedValue()` (`api/src/domain.js:504-511`) é aceitável para dashboard,
**jamais para contrato**. A ponte tipada entre o levantamento e o marketplace é exclusivamente a
`market_valuation`, digitada pelo Gestor em `NUMERIC(18,2)` com evidência.

## 2. Mecanismo de travamento (snapshot imutável)

O travamento acontece na contratação e é defendido em três camadas — serviço, schema e trigger:

1. No `POST /contracts`, o serviço lê **em transação** a versão `active` de
   `tokenization_parameter` do título, com `SELECT ... FOR SHARE` (para não cruzar com uma
   ativação de versão concorrente).
2. Copia `unit_face_value` → `unit_face_value_frozen` e grava `parameter_id` — o rastreio de
   **qual versão precificou** o contrato. É cópia, não referência: superseder o parâmetro depois
   não tem como afetar o contrato.
3. `total_face_value = quantity × unit_face_value_frozen`, com `CHECK` no banco.
4. A partir daí, **nenhum caminho de código faz UPDATE de valores em `token_contract`** — apenas
   `status`, `closed_at` e `substitution_id` mudam ao longo da vida do contrato. Reforço em
   banco: trigger `BEFORE UPDATE` que **rejeita** alteração das colunas monetárias e de
   quantidade (`unit_face_value_frozen`, `total_face_value`, `quantity`, `currency`) — defesa em
   profundidade além do serviço. A suíte de testes deve conter o teste de contrato "UPDATE em
   coluna congelada falha".
5. **Correção de erro operacional = estorno, nunca edição**: cria-se um contrato novo e
   encerra-se o antigo (`status='terminated'`, com evento de auditoria registrando o motivo).
   O histórico permanece íntegro; a trilha de auditoria
   ([07-trilha-auditoria](./07-trilha-auditoria.md)) registra os dois atos.

A trava protege o contratado **nas duas direções**: valorização posterior não enriquece o
contrato antigo, desvalorização posterior não o corrói. O contrato é âncora jurídica, não
posição de mercado.

## 3. Como fator e valor unitário alimentam a emissão

- **Emissão (`token_batch`) exige parâmetro `active`.** A `quantity` do lote é escolhida pelo
  Gestor, limitada pela invariante de supply (§4, inv. 1). A emissão on-chain (real ou simulada —
  ver [05-camada-ledger-blockchain](./05-camada-ledger-blockchain.md)) recebe o fator
  `tokens_per_share` implícito no supply e `unit_face_value_at_issuance` como **metadado
  informativo** do token. Como metadado on-chain é imutável, o valor **contratual** vigente vive
  sempre off-chain, na versão ativa do parâmetro — é ela que precifica cada contratação.
- **Re-avaliação não re-emite nem queima tokens.** Uma nova avaliação de mercado só cria (se o
  Gestor quiser) uma nova versão de parâmetro. Tokens já emitidos e ainda **não contratados**
  passam a ser contratados pelo valor da nova versão — nada muda na chain (§6).
- **O fator `tokens_per_share` é imutável após a primeira emissão** do título. Antes da primeira
  emissão, tudo é ajustável via nova versão; depois, novas versões só podem mudar o
  `unit_face_value`. Isso preserva a invariante de supply sem re-emissão on-chain (§4, inv. 2).

## 4. Invariantes normativas

Lista normativa — toda implementação e todo teste de aceitação derivam daqui:

1. **Supply**: `Σ token_batch.quantity` (excluídos `status ∈ {burned, failed}`) por título
   `≤ share_quantity × tokens_per_share`. Verificado em transação na emissão, com lock por
   título (`SELECT ... FOR UPDATE` em `security_title`) contra emissão concorrente;
   `tokens_per_share` é o da versão vigente.
2. **Fator congelado**: `tokens_per_share` não pode diferir entre versões de parâmetro do mesmo
   título **depois da primeira emissão** (existindo `token_batch`, novas versões só mudam
   `unit_face_value`). Antes da 1ª emissão, o fator é livremente reversionável.
3. **Uma versão ativa**: no máximo 1 `tokenization_parameter` com `status='active'` por título
   (unique parcial). Ativar v(n+1) fecha v(n) (`superseded`, `effective_to = now()`); as janelas
   de vigência nunca se sobrepõem nem deixam buraco.
4. **Contrato nunca re-precificado**: `unit_face_value_frozen`, `quantity` e `total_face_value`
   são imutáveis (trigger do §2, item 4).
5. **Posição não-negativa**: `wallet_position.quantity ≥ 0`; contratação e aluguel só sobre o
   saldo **disponível** da treasury (`disponível = posição − contratado ativo − alugado ativo`),
   verificado em transação.
6. **Contratação exige disponibilidade jurídica**: `security_title.legal_status ∈ {unjudged,
   ruled_favorable, reinstated}` **e** `listing_status='listed'` — ver
   [04-maquina-estado-juridico](./04-maquina-estado-juridico.md) e [ADR-008](./adr/ADR-008-maquina-estado-juridico.md).
7. **Fee única por distribuição primária**: a fee de 1ª transferência incide exatamente uma vez
   por contrato de **saída da treasury** (distribuição primária) — unique parcial
   `fee(contract_id) WHERE kind='first_transfer'`. Transferências secundárias e substituições
   **não** geram fee, sempre com registro explícito da isenção (`fee_exemption_reason`) — regra
   detalhada em [06-modelo-receita](./06-modelo-receita.md) e [ADR-006](./adr/ADR-006-receita.md).
8. **Append-only**: `market_valuation`, `legal_status_history`, `token_movement` e `audit_event`
   não admitem UPDATE nem DELETE — correção é sempre um novo registro compensatório.

## 5. Exemplos numéricos

Os três cenários abaixo são o contrato de aceitação da elasticidade. As versões completas, com
cada lançamento contábil e conferência centavo a centavo, estão no
[Apêndice D](./apendices/D-exemplos-numericos.md).

> Os valores de fee usados abaixo seguem a regra de [ADR-006](./adr/ADR-006-receita.md):
> **0,5% do valor de face do contrato, com piso de R$ 25,00 por operação** — ambos placeholders
> a calibrar com o custo real de operação. **DECISÃO — revisar** (registrada na
> [ADR-006](./adr/ADR-006-receita.md)).

### Exemplo 1 — emissão base

Título **T1**: 10 ações PNB. Perícia de 2026-03 registrada em `market_valuation`:
**R$ 1.000,00/ação**.

1. Gestor cria o parâmetro **v1**: `tokens_per_share = 100`, `unit_face_value = R$ 10,00`
   (`based_on_valuation_id` → a perícia) e o ativa.
2. Emissão do lote **L1** = 1.000 tokens. Invariante 1: `1.000 ≤ 10 × 100` ✓.
   `unit_face_value_at_issuance = R$ 10,00` (metadado).
3. Investidora **Ana** contrata 200 tokens → contrato **C1**:
   `unit_face_value_frozen = R$ 10,00`, `total_face_value = R$ 2.000,00`, `parameter_id = v1`.
4. C1 é saída da treasury (distribuição primária) → fee de 1ª transferência:
   `0,5% × R$ 2.000,00 = R$ 10,00 < piso R$ 25,00` → **fee = R$ 25,00**.

### Exemplo 2 — valorização

Nova perícia: **R$ 1.500,00/ação**. O Gestor registra a nova `market_valuation` e ativa o
parâmetro **v2**: `tokens_per_share = 100` (imutável — já houve emissão, invariante 2),
`unit_face_value = R$ 15,00`, `based_on_valuation_id` → a perícia nova. Efeitos:

- (a) o contrato **C1** de Ana **segue valendo R$ 10,00/token = R$ 2.000,00** — travado
  (invariante 4);
- (b) os 800 tokens de L1 ainda na treasury passam a ser contratados a **R$ 15,00** (§6);
- (c) **Bruno** contrata 100 tokens → contrato **C2** congela R$ 15,00
  (`parameter_id = v2`, `total_face_value = R$ 1.500,00`); fee de 1ª transferência:
  `0,5% × R$ 1.500,00 = R$ 7,50 < R$ 25,00` → **fee = R$ 25,00**;
- (d) um lote novo **L2**, se emitido, nasce com `unit_face_value_at_issuance = R$ 15,00`.

**Nenhum UPDATE em C1, nenhuma operação on-chain sobre L1.**

### Exemplo 3 — desvalorização + substituição (com residual)

Desvalorização simples: título **T2** re-avaliado a R$ 800,00/ação, fator 100 → versão **v3**
com `unit_face_value = R$ 8,00`. Contratos antigos de T2 congelados a R$ 10,00 **permanecem
R$ 10,00** — a trava protege nas duas direções (§2).

Agora o caso extremo: **T1 "cai"** — trânsito em julgado desfavorável, estado `defeated` da
máquina jurídica ([04 §5](./04-maquina-estado-juridico.md)). O contrato **C1** de Ana
(200 tokens × R$ 10,00 = **R$ 2.000,00**) entra no fluxo de resolução. Ana escolhe
**substituição** pelo título **T3**, cujo parâmetro vigente é `unit_face_value = R$ 12,50`:

- `preserved_face_value = R$ 2.000,00` (o que se preserva é o **montante travado**, não o preço
  unitário antigo);
- novo contrato **C1′** com `floor(2.000,00 / 12,50) = 160` tokens × R$ 12,50 = **R$ 2.000,00**
  (congela o parâmetro ativo de T3);
- `contract_substitution` liga C1 → C1′; C1 vira `substituted`;
- **sem nova fee de 1ª transferência** — substituição não é distribuição primária para fins de
  receita; a isenção é registrada explicitamente (`fee_exemption_reason = 'substitution_event'`,
  invariante 7).

**Variante com residual**: se o parâmetro de T3 fosse R$ 12,60, então
`floor(2.000,00 / 12,60) = 158` tokens × R$ 12,60 = R$ 1.990,80, e os **R$ 9,20** restantes
ficam em `contract_substitution.residual_value` como crédito de Ana. A alternativa de Ana à
substituição é o **write-off** — "não paga nada além do já devido" — detalhado em
[04 §5](./04-maquina-estado-juridico.md).

## 6. Tokens não contratados quando a avaliação muda

- Tokens emitidos e ainda na treasury **não são re-emitidos, queimados nem tocados on-chain**
  quando a avaliação muda. O preço de contratação deles é sempre o do **parâmetro ativo no
  instante do contrato** — não o do lote de emissão. O `unit_face_value_at_issuance` do lote
  permanece apenas como registro histórico do metadado de emissão.
- Consequência de auditoria: para qualquer contrato, a cadeia
  `contract → parameter(version) → market_valuation → evidence_ref (laudo)` reconstrói por que
  aquele preço valia naquele momento — sem depender de nenhum dado on-chain.

## 7. Versionamento de parâmetros (`draft` / `active` / `superseded`)

- **`draft`** → editável livremente pelo Gestor.
- **`active`** → imutável: a ativação **copia** (não referencia) os valores para o estado
  vigente e seta `effective_from`. No máximo uma versão ativa por título (invariante 3).
- **`superseded`** → somente leitura eterna, com `effective_to` setado na ativação da versão
  seguinte. Nunca há sobreposição nem buraco entre vigências.

Regras operacionais:

- **Ativação é ação sensível** (`params:activate`, contida em `params:*` do papel `manager` —
  ver [01-rbac-permissoes](./01-rbac-permissoes.md) e o [Apêndice C](./apendices/C-matriz-rbac.md)),
  sempre auditada. O campo `approved_by` suporta dupla aprovação ("4 olhos") — opcional na
  fase 1, recomendada assim que houver um segundo gestor.
- O relatório do título lista **todas** as versões com suas vigências (`effective_from` /
  `effective_to`) — a linha do tempo de preços de prateleira é reconstruível por inteiro.
- Se já houve emissão, a nova versão herda obrigatoriamente o `tokens_per_share` (invariante 2);
  a UI do Gestor apresenta o fator como somente leitura nesse caso.

---

_DDL normativa: [Apêndice B](./apendices/B-ddl-conceitual.md) · Exemplos conferíveis:
[Apêndice D](./apendices/D-exemplos-numericos.md) · Máquina jurídica (disponibilidade e
substituição): [04-maquina-estado-juridico](./04-maquina-estado-juridico.md) · Receita (fee e
aluguel): [06-modelo-receita](./06-modelo-receita.md)._
