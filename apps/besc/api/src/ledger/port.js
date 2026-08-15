// LedgerPort — interface do ledger (ports & adapters, docs/evolution/05 + apendice A).
// O dominio NUNCA fala com uma chain diretamente; so conhece este contrato. Fase 1 usa
// o SimulatedLedgerAdapter (DB-only, tx determinística). Fase 3 troca por BesuAdapter
// SEM tocar o dominio. Toda escrita recebe idempotencyKey e devolve LedgerTxRef.
//
// LedgerTxRef = { txHash, chainId, blockNumber, status: 'pending'|'confirmed'|'failed' }

let adapter = null;
export function setLedgerAdapter(a) { adapter = a; }
export function getLedger() {
  if (!adapter) throw new Error('ledger adapter não configurado');
  return adapter;
}

// Assinaturas esperadas de um adapter (documentacao viva):
//   issueBatch({ titleId, batchId, toWallet, amount, faceValueCents, splitFactor, issuanceDocHash, idempotencyKey })
//   transfer({ titleId, fromWallet, toWallet, amount, transferKind, referenceHash, idempotencyKey })
//   freezeTitle({ titleId, reasonCode, evidenceHash, idempotencyKey })
//   unfreezeTitle({ titleId, reasonCode, evidenceHash, idempotencyKey })
//   substitute({ fromTitleId, toTitleId, allocations, substitutionDocHash, idempotencyKey })
//   getBalance({ titleId, wallet }) / getTitleState({ titleId }) / health()
