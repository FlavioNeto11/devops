---
title: "Apêndice A — Interface LedgerPort (especificação normativa)"
status: proposta
updated: 2026-07-10
language: pt-BR
---

# Apêndice A — Interface `LedgerPort`

> Especificação **normativa** (ainda proposta — decisão em
> [ADR-005](../adr/ADR-005-ledger-port-besu-erc3643.md)) da interface entre o domínio do
> marketplace e o ledger, referenciada por
> [05-camada-ledger-blockchain](../05-camada-ledger-blockchain.md). O código abaixo é
> **conceitual** (TypeScript-like): define contrato, não implementação. Tabelas de domínio
> citadas aqui têm DDL no [Apêndice B](./B-ddl-conceitual.md).

## A.1 Convenções e garantias transversais

1. **Idempotência:** todo método de escrita recebe `idempotencyKey` (UUID gerado pela
   `ledger_outbox`, §A.3) e retorna `LedgerTxRef`. Reexecutar com a mesma chave nunca duplica
   efeito (simulado: `txHash` determinístico; Besu: contrato recebe `bytes32 opId` e reverte
   `AlreadyExecuted`, tratado como sucesso pelo adaptador).
2. **Zero PII:** nenhum método recebe nome/CPF/e-mail/IP — só ids opacos (`titleId`,
   `partyId`), endereços de carteira e hashes SHA-256 de documentos off-chain
   ([05 §9](../05-camada-ledger-blockchain.md)).
3. **Semântica única entre adaptadores:** `SimulatedLedgerAdapter` e `BesuAdapter` aplicam as
   mesmas regras (rejeitar transferência de título pausado, de/para carteira não whitelisted,
   substituição com soma de alocações ≠ supply etc.) — a suíte de testes é compartilhada.
4. **Chamada só via outbox:** o domínio nunca invoca `LedgerPort` no request HTTP; a escrita
   de domínio, o `audit_event` e a linha de outbox nascem na **mesma transação Postgres**
   ([05 §8](../05-camada-ledger-blockchain.md)).

## A.2 A interface completa

```ts
// Referência de transação devolvida por toda operação de escrita.
type LedgerTxRef = {
  txHash: string;              // hash da transação (determinístico no simulado)
  chainId: string;             // ex.: "sim:1" | "besu:88452"
  blockNumber: number | null;  // null enquanto pending
  status: 'pending' | 'confirmed' | 'failed';
};

interface LedgerPort {
  // Emissão: cria/usa o TitleToken do título e minta o lote para a carteira treasury
  // da plataforma (custódia do Gestor nas fases iniciais — 05 §10).
  issueBatch(params: {
    titleId: string;            // id opaco do título no domínio (security_title)
    batchId: string;            // id do lote/emissão (token_batch)
    toWallet: string;           // carteira treasury (wallets.kind='treasury')
    amount: bigint;             // splitFactor × ações do título
    faceValueBRLCents: bigint;  // valor de face congelado por token, em centavos (sem float)
    splitFactor: number;        // fator tokens/ação — imutável após a 1ª emissão (doc 03)
    issuanceDocHash: string;    // SHA-256 do contrato/dossiê off-chain
    idempotencyKey: string;
  }): Promise<LedgerTxRef>;

  // Transferência entre carteiras whitelisted.
  // Falha se a identidade não é elegível ou se o título está pausado.
  // transferKind:
  //   'first'     = saída da treasury (distribuição primária) — dispara a fee de
  //                 1ª transferência no domínio (ADR-006; nunca cobrada aqui);
  //   'secondary' = mercado secundário (isenta, com fee_exemption_reason no domínio);
  //   'forced'    = ordem judicial / recovery (forcedTransfer do ERC-3643).
  transfer(params: {
    titleId: string;
    fromWallet: string;
    toWallet: string;
    amount: bigint;
    transferKind: 'first' | 'secondary' | 'forced';
    referenceHash: string;      // SHA-256 do contrato de compra/venda off-chain
    idempotencyKey: string;
  }): Promise<LedgerTxRef>;

  // Status jurídico → disponibilidade (espelha a máquina de 7 estados do doc 04).
  // reasonCode taxonomizado:
  //   'legal_status_suspended' = transição para ruled_against ou under_appeal;
  //   'legal_status_defeated'  = transição para defeated (pause definitivo ou
  //                              antessala da substituição);
  //   'compliance_hold'        = trava operacional/compliance sem mudança jurídica.
  // evidenceHash = SHA-256 da decisão judicial/evidência (o PDF fica off-chain).
  freezeTitle(params: {
    titleId: string;
    reasonCode: 'legal_status_suspended' | 'legal_status_defeated' | 'compliance_hold';
    evidenceHash: string;
    idempotencyKey: string;
  }): Promise<LedgerTxRef>;

  // reasonCode:
  //   'legal_status_reinstated' = transição para reinstated (ou ruled_favorable
  //                               após recurso — doc 04);
  //   'hold_released'           = liberação de compliance_hold.
  unfreezeTitle(params: {
    titleId: string;
    reasonCode: 'legal_status_reinstated' | 'hold_released';
    evidenceHash: string;
    idempotencyKey: string;
  }): Promise<LedgerTxRef>;

  // Substituição atômica (título defeated): burn no contrato antigo + mint no novo,
  // por holder, na MESMA transação. Preserva o montante travado (doc 04; sem nova fee).
  substitute(params: {
    fromTitleId: string;
    toTitleId: string;
    allocations: Array<{ wallet: string; amount: bigint }>;
    substitutionDocHash: string; // SHA-256 do instrumento de substituição off-chain
    idempotencyKey: string;
  }): Promise<LedgerTxRef>;

  // Whitelist/KYC: liga identidade opaca (party_id) a uma carteira.
  // Claims/dossiê ficam off-chain (kyc_record); on-chain só o hash.
  registerIdentity(params: {
    partyId: string;
    wallet: string;
    claimsHash: string;
    idempotencyKey: string;
  }): Promise<LedgerTxRef>;

  revokeIdentity(params: {
    partyId: string;
    wallet: string;
    reasonCode: string;
    idempotencyKey: string;
  }): Promise<LedgerTxRef>;

  // Ancoragem da trilha de auditoria (doc 07 — Merkle RFC 6962).
  // Mesmo o adaptador simulado registra e devolve ref.
  anchorAuditRoot(params: {
    merkleRoot: string;          // raiz SHA-256 do lote de audit_events
    fromEventId: number;         // intervalo coberto [from, to]
    toEventId: number;
    algorithm: 'sha256-rfc6962';
    idempotencyKey: string;
  }): Promise<LedgerTxRef>;

  // Prova para perito/exportação: receipt/log bruto anexável ao laudo.
  getProof(params: { txHash: string }): Promise<{
    txHash: string;
    chainId: string;
    blockNumber: number;
    blockHash: string;
    timestamp: string;
    raw: object;                 // receipt/log bruto para anexo pericial
  }>;

  // Leituras para reconciliação (05 §12).
  getBalance(params: { titleId: string; wallet: string }): Promise<bigint>;
  getTitleState(params: { titleId: string }): Promise<{
    paused: boolean;
    totalSupply: bigint;
  }>;

  // Sonda do adaptador.
  health(): Promise<{
    adapter: string;             // 'simulated' | 'besu' | 'consortium'
    chainId: string;
    blockHeight: number;
    syncing: boolean;
    ok: boolean;
  }>;
}
```

## A.3 DDL conceitual da `ledger_outbox`

```sql
CREATE TABLE ledger_outbox (
  id              BIGSERIAL PRIMARY KEY,
  operation       TEXT NOT NULL,            -- 'issueBatch' | 'transfer' | 'freezeTitle' | ...
  params          JSONB NOT NULL,           -- canônico (JCS), sem PII
  idempotency_key UUID NOT NULL UNIQUE,
  state           TEXT NOT NULL DEFAULT 'pending',
    -- pending -> submitted -> confirmed | failed -> (retry) | abandoned
  attempts        INT NOT NULL DEFAULT 0,
  ledger_tx_hash  TEXT,
  chain_id        TEXT,
  block_number    BIGINT,
  last_error      TEXT,
  audit_event_id  BIGINT NOT NULL REFERENCES audit_event(id),  -- DDL no Apêndice B / doc 07
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

O dispatcher roda no worker em loop, consumindo linhas `pending` com
`SELECT ... FOR UPDATE SKIP LOCKED` (padrão já provado no SICAT) — seguro para múltiplas
instâncias e sem fila externa.

## A.4 Estados da outbox

| Estado | Significado | Quem transiciona | Próximos estados |
|---|---|---|---|
| `pending` | linha criada na transação de domínio; ainda não enviada ao adaptador | transação de domínio (INSERT) | `submitted` |
| `submitted` | adaptador aceitou a operação (`LedgerTxRef.status='pending'`); aguardando confirmação (N blocos: 1 no QBFT, 0 no simulado) | dispatcher | `confirmed`, `failed` |
| `confirmed` | transação confirmada; `ledger_tx_hash`/`block_number` gravados; evento `.confirmed` emitido na trilha | dispatcher (callback/poll) | — (terminal) |
| `failed` | erro registrado em `last_error`; `attempts` incrementado | dispatcher | `pending` (retry com backoff) ou `abandoned` |
| `abandoned` | falha permanente após esgotar retries — **intervenção manual obrigatória**; gera `reconciliation.divergence.detected` + pendência bloqueante no título | dispatcher (limite de attempts) / operador | — (resolução via transação compensatória nova, nunca edição) |

A entidade de negócio correspondente (lote, transferência) espelha isso em
`ledgerSyncState: pending | confirmed | failed`; venda/entrega só concluem com `confirmed`
([05 §8](../05-camada-ledger-blockchain.md)).

## A.5 Correspondência: evento de negócio → `audit_event` → transação on-chain

Taxonomia completa de `event_type` em [07-trilha-auditoria](../07-trilha-auditoria.md);
estados jurídicos (7) em [04-maquina-estado-juridico](../04-maquina-estado-juridico.md).

| Evento de negócio | `audit_event` (event_type) | Transação on-chain (Fase 3) | Ligação |
|---|---|---|---|
| Cadastro do título no marketplace | `title.registered` | — (off-chain até a emissão) | `entity_id = titleId` |
| Emissão do lote (fator N) | `token.issuance.requested` → `.confirmed` | `TitleTokenFactory.deployAndMint(...)` (deploy do TitleToken + mint para a treasury) | outbox: `audit_event_id`; o evento `.confirmed` carrega `txHash`, `blockNumber`, `chainId`, `contractAddress` |
| 1ª transferência = saída da treasury (distribuição primária) | `token.transfer.requested` → `.confirmed` (`transferKind: first`) + `market.fee.charged` | `TitleToken.transfer(...)` (validada pelo Identity Registry) | idem; a fee é só off-chain (evento + entidade `fee`, [ADR-006](../adr/ADR-006-receita.md)) |
| Transferência secundária (isenta, com `fee_exemption_reason`) | `token.transfer.*` (`transferKind: secondary`) | `TitleToken.transfer(...)` | idem |
| Status jurídico → `ruled_against` / `under_appeal` (suspensão) | `title.legal_status.changed` + `token.freeze.requested/.confirmed` | `TitleToken.pause()` | dois eventos ligados por `payload.causedByEventUid` |
| Status jurídico → `reinstated` (reativação) | `title.legal_status.changed` + `token.unfreeze.*` | `TitleToken.unpause()` | idem |
| Status jurídico → `defeated` com substituição | `token.substitution.requested` → `.confirmed` | `Factory.substitute(old, new, allocations)` (burn+mint atômico) | um `txHash` para toda a substituição; sem nova fee (isenção registrada) |
| Status jurídico → `defeated` com write-off ("nada além do já devido") | `title.legal_status.changed` + `token.freeze.confirmed` (`legal_status_defeated`) | `TitleToken.pause()` definitivo | encerramento contábil no domínio ([06-modelo-receita](../06-modelo-receita.md)) |
| Contrato de aluguel / pagamento | `rental.contract.created` / `rental.payment.recorded` | **nenhuma direta** — coberto pela ancoragem periódica do lote de eventos | prova = inclusão Merkle do evento num `audit_anchor` ancorado |
| Aprovação KYC / vínculo de carteira | `kyc.identity.approved` + `whitelist.wallet.linked` | `IdentityRegistry.registerIdentity(wallet, claimsHash)` | outbox |
| Mudança de parâmetro (fator, fee) | `param.*.changed` | — (off-chain; vale para emissões futuras) | ancoragem |
| Ancoragem da trilha | `audit.anchor.created/.confirmed` | `AuditAnchorRegistry.anchor(root, fromId, toId)` | `audit_anchor.tx_hash` |
| Eliminação LGPD | `gdpr.erasure.executed` | — (nunca on-chain) | ancoragem |

**Campos de ligação padronizados** (presentes em todo evento `.confirmed` e na outbox):
`tx_hash`, `block_number`, `chain_id`, `contract_address`, `log_index` (quando aplicável) e
`ledger_adapter` (`simulated | besu | consortium`) — este último preserva a proveniência
histórica após migração de adaptador.

## A.6 O que o auditor vê em cada camada

| Camada | O que prova | Ferramenta |
|---|---|---|
| Domínio (Postgres) | Estado corrente (saldo, status, contratos) — **não é prova**, é operação | UI/relatórios |
| `audit_event` (hash-chain) | **Que cada fato foi registrado naquela ordem, naquele momento, por aquele ator, e nada foi alterado/removido depois** | export JSONL + CLI `audit-verify` ([07-trilha-auditoria](../07-trilha-auditoria.md)) |
| `audit_anchor` + ledger | **Que a cadeia existia no estado X no momento do anchor** (anterioridade), com testemunho do ledger (e do carimbo RFC 3161 externo, se contratado — [ADR-005](../adr/ADR-005-ledger-port-besu-erc3643.md)) | receipt via `getProof` + explorer (Blockscout na fase Besu) |
| On-chain (Fase 3) | Estado autoritativo de saldos/freeze por título; execução atômica de emissão/transferência/substituição | explorer + RPC read-only |

---

_Contexto e recomendação: [05-camada-ledger-blockchain](../05-camada-ledger-blockchain.md) ·
decisão: [ADR-005](../adr/ADR-005-ledger-port-besu-erc3643.md) · DDL das demais tabelas:
[Apêndice B](./B-ddl-conceitual.md) · trilha/taxonomia:
[07-trilha-auditoria](../07-trilha-auditoria.md)._
