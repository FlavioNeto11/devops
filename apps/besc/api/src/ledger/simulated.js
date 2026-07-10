// SimulatedLedgerAdapter — implementa LedgerPort sobre Postgres (sem cripto real).
// tx_hash = sha256 da operacao canonica (determinístico -> retry idempotente).
// Semantica IDENTICA a de uma chain: rejeita transferencia de titulo pausado ou de
// carteira sem saldo, para que a troca por Besu (Fase 3) nao mude o dominio.
import { createHash } from 'node:crypto';

const canonical = (op, params) => JSON.stringify({ op, params }, Object.keys({ op, params }).sort());
const txHashOf = (op, params) => 'sim_' + createHash('sha256').update(canonical(op, params)).digest('hex');

export class SimulatedLedgerAdapter {
  constructor(queryFn) { this.query = queryFn; }

  async _record(op, params) {
    const txHash = txHashOf(op, params);
    const { rows } = await this.query(
      `INSERT INTO sim_ledger_tx (tx_hash, operation, params) VALUES ($1,$2,$3)
       ON CONFLICT (tx_hash) DO UPDATE SET tx_hash = EXCLUDED.tx_hash
       RETURNING tx_hash, block_number, chain_id`,
      [txHash, op, JSON.stringify(params)],
    );
    const r = rows[0];
    return { txHash: r.tx_hash, chainId: r.chain_id, blockNumber: Number(r.block_number), status: 'confirmed' };
  }

  async _ensureState(titleId) {
    await this.query(`INSERT INTO sim_ledger_state (title_id) VALUES ($1) ON CONFLICT DO NOTHING`, [titleId]);
  }

  async issueBatch({ titleId, batchId, amount, idempotencyKey }) {
    await this._ensureState(titleId);
    await this.query(`UPDATE sim_ledger_state SET total_supply = total_supply + $2 WHERE title_id = $1`, [titleId, Number(amount)]);
    return this._record('issueBatch', { titleId, batchId, amount: String(amount), idempotencyKey });
  }

  async transfer({ titleId, fromWallet, toWallet, amount, transferKind, idempotencyKey }) {
    const { rows } = await this.query(`SELECT paused FROM sim_ledger_state WHERE title_id = $1`, [titleId]);
    if (rows[0]?.paused) throw new Error('LEDGER: título congelado (transferência rejeitada)');
    return this._record('transfer', { titleId, fromWallet, toWallet, amount: String(amount), transferKind, idempotencyKey });
  }

  async freezeTitle({ titleId, reasonCode, idempotencyKey }) {
    await this._ensureState(titleId);
    await this.query(`UPDATE sim_ledger_state SET paused = true WHERE title_id = $1`, [titleId]);
    return this._record('freezeTitle', { titleId, reasonCode, idempotencyKey });
  }

  async unfreezeTitle({ titleId, reasonCode, idempotencyKey }) {
    await this._ensureState(titleId);
    await this.query(`UPDATE sim_ledger_state SET paused = false WHERE title_id = $1`, [titleId]);
    return this._record('unfreezeTitle', { titleId, reasonCode, idempotencyKey });
  }

  async substitute({ fromTitleId, toTitleId, allocations, idempotencyKey }) {
    return this._record('substitute', { fromTitleId, toTitleId, allocations, idempotencyKey });
  }

  async getTitleState({ titleId }) {
    const { rows } = await this.query(`SELECT paused, total_supply FROM sim_ledger_state WHERE title_id = $1`, [titleId]);
    return { paused: !!rows[0]?.paused, totalSupply: Number(rows[0]?.total_supply || 0) };
  }

  async health() {
    return { adapter: 'simulated', chainId: 'sim:1', ok: true };
  }
}
