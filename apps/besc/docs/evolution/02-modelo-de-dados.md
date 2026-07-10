---
title: "Modelo de dados — topologia, entidades e migração"
status: proposta
updated: 2026-07-10
language: pt-BR
---

# 02 — Modelo de dados

> Este documento define **onde cada dado vive** na evolução do BESC para marketplace, **o que
> acontece com cada entidade atual** e **como o schema novo se organiza**. O DDL completo e
> normativo de todas as tabelas está no [Apêndice B](./apendices/B-ddl-conceitual.md); aqui ficam a
> topologia, o diagrama, os invariantes-chave por grupo e a estratégia de migração. Contexto geral:
> [00-visao-geral](./00-visao-geral.md).

## 1. Topologia de persistência: JSON × Postgres

**DECISÃO — revisar** — registrada em [ADR-002](./adr/ADR-002-postgres-e-convivencia-json.md).

A evolução adota **duas zonas de persistência com donos claros**:

| Zona | Dono de | Por quê |
|---|---|---|
| **Store JSON** (`/data/besc.json` em PVC, escrita atômica serializada — `api/src/store.js:51-62`) | `cases` (levantamento completo, com arrays embutidos), `library`, `jurisprudence`, `glossary`, `catalogMeta` | O motor derivado (`computePendencies`/`suggestStatus`/`computeRisk`) opera sobre o **documento** do caso; o conteúdo público é seed-driven, baixo volume, pipeline resolvido |
| **Postgres novo `besc-postgres`** (manifests no padrão `apps/sicat/k8s/postgres.yaml`, Secret via Sealed Secrets, single-replica `Recreate`, ns `apps`) | **Identidade/RBAC + marketplace + receita + auditoria + ledger** | Marketplace exige transação, FK, imutabilidade imposta pelo banco (REVOKE/trigger), `NUMERIC` e unique parciais — nada disso existe no store JSON |

A **ponte** entre as zonas é uma referência soft: `security_title.case_id TEXT UNIQUE` aponta para o
id do case no store JSON (mesmo espírito do link soft de precedentes já existente no levantamento).
Não há FK cruzada entre zonas: a integridade é validada em aplicação — o título só é criado se o case
existe e está elegível (gate descrito em [04-maquina-estado-juridico](./04-maquina-estado-juridico.md)
§ elegibilidade). Um case origina no máximo **1** título na fase inicial (unique).

Pré-requisito transversal antes de qualquer coisa: **eliminar o write-on-read do
`GET /cases/:id`** (`api/src/server.js:193-197` chama `saveAndEnrich`, que regrava o caso e bumpa
`updatedAt` a cada leitura — `api/src/server.js:95-104`). Num sistema auditável, leitura jamais
grava. Detalhe e racional em [ADR-002](./adr/ADR-002-postgres-e-convivencia-json.md).

## 2. O que acontece com cada entidade atual

| Entidade atual (store JSON) | Destino | Racional |
|---|---|---|
| `Case` + arrays embutidos (`documents`/`legal`/`tokenization`/`collateral`/`pericia`/`lawsuits`/`statusHistory`) | **Reaproveitar como está (JSON)**; fase F5 opcional/tardia: mover para tabela `cases(id, doc JSONB)` preservando o documento | O motor derivado opera sobre o documento; colunar o caso quebraria tudo sem ganho |
| `lawsuits[]` | Permanecem dentro do case (dossiê). O marketplace **não** lê lawsuits diretamente; a máquina jurídica do título tem estado próprio alimentado pelo Gestor com evidência ([04](./04-maquina-estado-juridico.md)) | Levantamento ≠ verdade processual |
| `documents[]`/anexos | Permanecem no case. Evidências do marketplace (decisões, laudos) referenciam anexos por `{caseId, docKey, attId}` em colunas `evidence_ref` | Sem duplicar binário |
| Checklist `tokenization` (21 itens — `api/src/domain.js:172-195`) | Permanece como levantamento. Os itens que viram **parâmetro operacional** (`estimated_value`, `fractionation`, `what_tokenized`) NÃO migram — o valor operacional nasce em `tokenization_parameter`/`market_valuation`, digitado pelo Gestor | Checklist é opinião/levantamento; parâmetro é ato administrativo tipado |
| Campos monetários string pt-BR (`estimated_value`, `updated_value`, `updated_value_pericial`, …) | **Permanecem strings no case.** A ponte tipada é `market_valuation` (Gestor registra valor `NUMERIC` citando a perícia/fonte) | Nunca parsear string livre para dinheiro contratual — o parse heurístico de `estimatedValue()` (`api/src/domain.js:504-511`) é aceitável para dashboard, jamais para contrato |
| `library`/`jurisprudence`/`glossary` | **Continuam no JSON store + seeds**, públicos em leitura | Conteúdo público, baixo volume, pipeline de seed idempotente e version-gated já resolvido |
| `statusHistory[]` do case | Continua no case (história do levantamento). História do **título** é `legal_status_history` (nova, Postgres, append-only) | Dois domínios, duas trilhas |
| Motor de pendências/risco | **Intocado.** Ganha um consumidor novo: o gate de elegibilidade do título lê `case.status`/`derived` | — |

## 3. Diagrama textual de entidades

Visão completa (identidade + marketplace + receita + ledger/auditoria + gate). Convenções:
`──<` = 1:N · `>──` = N:1 · `1──1` = 1:1 · `←soft──` = referência soft entre zonas.

```
IDENTIDADE / RBAC
users ──< user_roles >── roles ──< role_permissions >── permissions
users ──< user_sessions          users ──< invitations (convite lawyer/judge/manager)
users ──< title_access_grants >── security_title       (escopo 'linked' de advogado/juiz)
rbac_meta (singleton de invalidação de cache)
users 1──1 party ──< kyc_record                        (PII SÓ em party — apagável, LGPD)
party ──< wallet_link >── wallets                      (whitelist identidade↔carteira)

MARKETPLACE (núcleo)
case (store JSON) 1←soft── security_title ──< legal_status_history   (7 estados; append-only)
                           security_title ──< market_valuation       (série temporal; append-only)
                           security_title ──< tokenization_parameter (versões; máx. 1 'active')
                           security_title 1──1 title_listing         (dossiê público allowlist)
                           security_title ──< token_batch ─────────────┐
tokenization_parameter 1──< token_batch                                │
token_batch ──< wallet_position >── wallets     (projeção fungível)    │
token_batch ──< token_movement                  (ledger de movimentos; │ append-only)
security_title ──< token_contract >── users (holder)                   │
tokenization_parameter 1──< token_contract  (parâmetro vigente na contratação)
token_batch            1──< token_contract  (de qual lote saem os tokens) ─┘
token_contract ──> terms_document           (termos versionados aceitos)
token_contract ──< lease >── users (lessee)      lease ──> terms_document
token_contract 1──1 contract_resolution_case     (fluxo 'defeated': substituição × write-off)
token_contract 1──1 contract_substitution 1──1 token_contract   (old → new)
system_parameters (key/value tipado, versionado)

RECEITA / CONTABILIDADE
token_contract ──< fee >── fee_schedule     (unique parcial: 1 'first_transfer' por contrato)
lease ──< lease_accrual ──> invoice         (unique: 1 competência por lease)
fee ──> invoice                             (fatura da 1ª transferência)
invoice ──> ledger_entry                    (dupla entrada; append-only; estorno, nunca UPDATE)
cost_entry ──> ledger_entry

LEDGER / AUDITORIA
(mutações de TODAS as tabelas acima) ──> audit_event   (hash-chain SHA-256; append-only)
audit_event ──< audit_anchor                            (Merkle root ancorado via LedgerPort)
escritas de ledger ──> ledger_outbox ──> LedgerPort ──> sim_ledger_tx / sim_ledger_state
                                                        (fase Besu: contratos ERC-3643)
GATE REGULATÓRIO
regulatory_gate_item (7 itens requiresLegal) ──> regulatory_gate_approval (go_live_enabled)
```

## 4. Grupos de tabelas — propósito e invariantes-chave

O DDL completo (colunas, tipos, CHECK/UNIQUE) de cada tabela está no
[Apêndice B](./apendices/B-ddl-conceitual.md). Abaixo, o propósito e os invariantes que cada grupo
carrega.

### 4.1 Identidade & RBAC

`users`, `roles`, `permissions`, `role_permissions`, `user_roles`, `user_sessions`, `invitations`,
`rbac_meta`, `title_access_grants` — detalhados em [01-rbac-permissoes](./01-rbac-permissoes.md).

- **Papéis são linhas, não código**: o código declara só o catálogo de permissões (espelhado em
  `permissions` no boot); papel novo = dados, sem deploy.
- **Deny por padrão**: anônimo é o pseudo-papel `public` (linha real em `roles`).
- Escopos `own`/`linked`/`all` como coluna de `role_permissions`; o escopo `linked` de
  advogado/juiz materializa-se em `title_access_grants`.
- Sessões guardam apenas `refresh_token_hash` (SHA-256) — nunca o token.
- Invariantes anti-lockout: não remover o último `manager` ativo; papéis `is_system` não deletáveis;
  toda mutação de RBAC bumpa `rbac_meta.version` e emite `audit_event` na mesma transação.

### 4.2 Títulos, parâmetros e estado jurídico

`security_title`, `market_valuation`, `tokenization_parameter`, `legal_status_history`,
`title_listing`, `terms_document`, `system_parameters` — mecânica de valores em
[03-elasticidade-tokenizacao](./03-elasticidade-tokenizacao.md); estados em
[04-maquina-estado-juridico](./04-maquina-estado-juridico.md).

- Os **três valores separados** da elasticidade: `market_valuation` (série temporal append-only) ≠
  `tokenization_parameter.unit_face_value` (versionado; **máx. 1 `active` por título**, unique
  parcial) ≠ `token_contract.unit_face_value_frozen` (snapshot imutável).
- `tokens_per_share` é **imutável após a primeira emissão** do título.
- `security_title.legal_status` usa os **7 estados** (`unjudged`, `ruled_favorable`,
  `ruled_against`, `under_appeal`, `reinstated`, `defeated`, `archived`) e é denormalização do
  último registro de `legal_status_history` — sempre consistentes na mesma transação.
  Disponibilidade é **derivada**, nunca coluna editável:
  `available = legal_status ∈ {unjudged, ruled_favorable, reinstated} AND listing_status='listed'`.
- `eligibility_snapshot` congela `case.status` + risco + docPct do momento do cadastro (auditoria de
  "com que base este ativo entrou no marketplace"); `ready_with_caveats` exige
  `eligibility_override` explícito do Gestor.
- `title_listing.public_payload` é projeção **allowlist** do dossiê público — nunca PII do titular
  ([ADR-003](./adr/ADR-003-spa-unica-areas-gated.md)).
- `terms_document` versiona os termos aceitos (1 `active` por kind); o aceite é registrado como
  `audit_event` + FK no contrato/lease.
- `system_parameters` é key/value tipado e versionado (ex.: `resolution_window_days`, política de
  ancoragem) — toda mudança auditada.

### 4.3 Emissão, carteiras, contratos e aluguel

`token_batch`, `wallets`, `wallet_position`, `token_movement`, `token_contract`,
`contract_substitution`, `contract_resolution_case`, `lease`, `fee`.

- **Posições fungíveis por lote** (`wallet_position`), sem 1 linha por token; `wallet_position` é
  **projeção** do ledger de movimentos `token_movement` (append-only) — o ledger é o que a
  auditoria exporta.
- **Supply**: Σ `token_batch.quantity` (status ≠ `burned`/`failed`) por título ≤
  `share_quantity × tokens_per_share`, verificado em transação com lock por título.
- **Contrato nunca re-precificado**: `unit_face_value_frozen`/`quantity`/`total_face_value` são
  imutáveis (CHECK `total = quantity × unit` + trigger `BEFORE UPDATE` que rejeita alteração das
  colunas congeladas). Correção de erro = estorno (contrato novo + `terminated`), nunca edição.
- **Fee de 1ª transferência = saída da treasury** (distribuição primária): % do valor de face do
  contrato + piso; **unique parcial `fee(contract_id) WHERE kind='first_transfer'`**.
  Transferências secundárias e substituições são isentas **com registro explícito**
  (`token_movement.fee_exemption_reason`) — nunca isenção silenciosa. Os percentuais são
  placeholders (0,5% + R$ 25,00) — **DECISÃO — revisar** em [ADR-006](./adr/ADR-006-receita.md).
- `lease` (aluguel — receita principal) harmoniza contrato-lastro + faturamento: base de cálculo
  **congelada na assinatura** (`base_amount_frozen`), taxa `% a.m.`, reajuste anual por índice
  (reusa o enum `monetary_index` já existente em `api/src/domain.js:117-125`), `billing_day` e
  termos versionados. Suspensão jurídica corta pro-rata por dias corridos
  ([06-modelo-receita](./06-modelo-receita.md)).
- `contract_resolution_case` materializa o fluxo `defeated` (prazo, escolha substituição ×
  write-off); `contract_substitution` preserva o **montante** travado (`preserved_face_value`) e
  registra `residual_value` quando a divisão não fecha.

### 4.4 Receita & contabilidade

`fee_schedule`, `invoice`, `lease_accrual`, `ledger_entry`, `cost_entry` — modelo completo em
[06-modelo-receita](./06-modelo-receita.md), exemplos que fecham centavo a centavo no
[Apêndice D](./apendices/D-exemplos-numericos.md).

- `fee_schedule` é versionado e imutável após ativação (máx. 1 `active`); a fatura congela a regra
  aplicada em `fee_schedule_snapshot` — mudança de tabela nunca reprecifica operação contratada.
- `lease_accrual` tem `UNIQUE (lease_id, competence_period)` — "Fechar competência" é ação
  explícita do Gestor e idempotente.
- `ledger_entry` é contabilidade de **dupla entrada append-only**: 1 débito + 1 crédito por linha,
  `amount > 0`, correção **só por estorno** (`reversal_of_seq`) — nunca UPDATE/DELETE;
  `SUM(débitos) = SUM(créditos)` verificado por relatório/teste (`trial_balance`).
- Sem gateway de pagamento: `invoice` é ciclo manual (`issued → paid` com comprovante anexado pelo
  Gestor); a liquidação financeira é externa.

### 4.5 Ledger & auditoria

`ledger_outbox`, `audit_event`, `audit_anchor`, `sim_ledger_tx`, `sim_ledger_state`, `party`,
`kyc_record`, `wallet_link` — detalhes em [05-camada-ledger-blockchain](./05-camada-ledger-blockchain.md)
e [07-trilha-auditoria](./07-trilha-auditoria.md).

- **Outbox transacional**: o domínio nunca chama o `LedgerPort` no request HTTP — escrita de
  domínio + `audit_event` + linha em `ledger_outbox` na mesma transação; dispatcher idempotente
  (`FOR UPDATE SKIP LOCKED`) executa e reconcilia.
- `audit_event` é **append-only imposto pelo banco** (REVOKE UPDATE/DELETE + trigger + função
  `append_audit_event()` SECURITY DEFINER com hash-chain SHA-256 calculada no banco);
  `audit_anchor` ancora Merkle roots periódicos via `LedgerPort.anchorAuditRoot()` — funciona já no
  adaptador simulado.
- `sim_ledger_tx`/`sim_ledger_state` são o `SimulatedLedgerAdapter`: tx-hash **determinístico**
  (`SHA-256(JCS(operação canônica))`), semântica idêntica à do adaptador Besu futuro.
- **PII nunca no payload de evento nem on-chain**: pessoas são referenciadas por `party_id` opaco;
  `party` é a única zona de PII do marketplace — apagável/anonimizável (LGPD art. 18) sem quebrar a
  cadeia. `kyc_record`/`wallet_link` guardam o dossiê e o vínculo identidade↔carteira off-chain
  (on-chain vai só `claims_hash`).

### 4.6 Gate regulatório

`regulatory_gate_item`, `regulatory_gate_approval` — item a item em
[10-gate-regulatorio](./10-gate-regulatorio.md).

- Os **7 itens `requiresLegal`** do checklist de tokenização (`api/src/domain.js:188-194`:
  `is_security`, `offer_registration`, `fidc_structure`, `vasp_bcb`, `kyc_aml_pldft`, `lgpd`,
  `taxation`) viram linhas de plataforma: responder exige **parecer externo anexado** de
  profissional habilitado identificado (CHECK no schema).
- `regulatory_gate_approval` é **append-only de atos** (`kind: granted | revoked`; revogação =
  nova linha, nunca UPDATE). O flag global `go_live_enabled` é **derivado**, nunca coluna
  editável: `true` somente se todos os 7 itens ∈ {`satisfied`, `not_applicable`} **e** o último
  ato é `granted` — enquanto `false`, o sistema **recusa em código** operação real
  ([ADR-007](./adr/ADR-007-gate-regulatorio-bloqueante.md)).

## 5. Tipos monetários e de quantidade (convenção normativa)

- **Dinheiro liquidável** (`unit_face_value`, `total_face_value`, `base_amount_frozen`,
  `fee.amount`, `invoice.amount`, `value_per_share`, `preserved_face_value`, …):
  **`NUMERIC(18,2)` + coluna `currency CHAR(3)` ISO-4217, default `'BRL'`**. **Sem float em lugar
  nenhum** — nem no banco, nem no serviço, nem na serialização.
- **Preço unitário derivado** (ex.: `value_per_share / tokens_per_share` exibido como referência):
  `NUMERIC(18,6)` apenas em views/cálculos; o valor **contratual** do token é sempre o
  `unit_face_value` digitado/aprovado pelo Gestor em 2 casas (evita dízimas: R$ 1.000/3 não
  existe — o Gestor define R$ 333,33 explicitamente e o sistema mostra o resíduo).
- **Percentuais/taxas** (`monthly_rate_pct`, `first_transfer_fee_value`): `NUMERIC` de precisão
  dedicada (ex.: `NUMERIC(8,4)`) — são taxas, não dinheiro.
- **Quantidades de tokens/ações**: `BIGINT` — tokens são inteiros; não há fração de token no
  modelo (fracionamento se resolve pelo fator `tokens_per_share`).

## 6. Estratégia de migração em fases (F0–F5)

Cada fase é **aditiva e deployável isolada** (Argo auto-sync); a base JSON nunca é destruída.
Decisão de convivência e sequência registradas em
[ADR-002](./adr/ADR-002-postgres-e-convivencia-json.md). O mapeamento para o roadmap de produto
(Fases 0–4 + gate) está em [09-roadmap](./09-roadmap.md).

| Fase | Entrega | Observações |
|---|---|---|
| **F0 — pré-requisitos** | Remover o write-on-read do `GET /cases/:id` (`api/src/server.js:193-197`); subir `besc-postgres` (manifests + Sealed Secrets) + migrations runner no boot do besc-api (padrão `AUTO_MIGRATE` do SICAT, advisory lock) | O driver de banco (`pg`) entra como dependência — hoje a API só tem `express`+`multer` (`api/package.json:10-13`) |
| **F1 — identidade/RBAC** | Tabelas do grupo 4.1 + seeds de papéis + rotas `/auth/*` + middleware | Portal segue público em leitura; escrita e `cases:*` passam a exigir login (primeira quebra de compatibilidade — comunicada) |
| **F2 — marketplace core** | `security_title`, `market_valuation`, `tokenization_parameter`, `legal_status_history`, `title_listing`, `terms_document`, `system_parameters` + telas de Gestor | Ainda sem emissão |
| **F3 — emissão/carteira/contrato** | `token_batch`, `wallets`, `wallet_position`, `token_movement`, `token_contract`, `fee` (+ `fee_schedule`) | Emissão inicia via `SimulatedLedgerAdapter` (`chain_network='sim'`) sem mudar o schema |
| **F4 — aluguel + substituição + receita** | `lease`, `lease_accrual`, `invoice`, `ledger_entry`, `cost_entry`, `contract_substitution`, `contract_resolution_case` | Invariantes de receita testados contra o [Apêndice D](./apendices/D-exemplos-numericos.md) |
| **F5 — opcional/TARDIA** | Mover `cases` para `cases(id, doc JSONB)` no Postgres com o mesmo shape; `store.js` vira repositório Postgres com API idêntica (`getCase`/`putCase`/…) | O motor de domínio não muda uma linha. Portal de conhecimento (library/juris/glossário) **fica no JSON indefinidamente** |

As tabelas de auditoria/ledger (`audit_event`, `ledger_outbox`, …) entram junto com F1 (é preciso
existir **ator** para existir trilha) — sequência detalhada em [09-roadmap](./09-roadmap.md).

---
_Docs relacionados: [01-rbac-permissoes](./01-rbac-permissoes.md) ·
[03-elasticidade-tokenizacao](./03-elasticidade-tokenizacao.md) ·
[04-maquina-estado-juridico](./04-maquina-estado-juridico.md) ·
[05-camada-ledger-blockchain](./05-camada-ledger-blockchain.md) ·
[06-modelo-receita](./06-modelo-receita.md) · [07-trilha-auditoria](./07-trilha-auditoria.md) ·
[10-gate-regulatorio](./10-gate-regulatorio.md) · DDL normativo:
[Apêndice B](./apendices/B-ddl-conceitual.md)._
