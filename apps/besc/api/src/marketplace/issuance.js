// Emissao, carteiras, contrato com VALOR TRAVADO e substituicao (docs/evolution/03 §D, 04 §E.5).
// Trava: unit_face_value copiado do parametro ATIVO no instante da contratacao para
// unit_face_value_frozen; trigger no banco impede qualquer UPDATE desse valor.
import { createHash, randomUUID } from 'node:crypto';
import { query, tx } from '../db.js';
import { appendAudit } from '../foundation/audit.js';
import { getLedger } from '../ledger/port.js';

const cents = (n) => Math.round(Number(n) * 100);
const docHash = (o) => createHash('sha256').update(JSON.stringify(o || {})).digest('hex');

// treasury do emissor (uma por instalacao; user_id NULL)
async function ensureTreasury(client) {
  const { rows } = await client.query(`SELECT id FROM wallets WHERE kind = 'treasury' LIMIT 1`);
  if (rows.length) return rows[0].id;
  const ins = await client.query(`INSERT INTO wallets (kind, label) VALUES ('treasury','Tesouraria do emissor') RETURNING id`);
  return ins.rows[0].id;
}

async function ensureUserWallet(client, userId) {
  const { rows } = await client.query(`SELECT id FROM wallets WHERE user_id = $1 AND kind = 'custodial' LIMIT 1`, [userId]);
  if (rows.length) return rows[0].id;
  const ins = await client.query(`INSERT INTO wallets (user_id, kind, label) VALUES ($1,'custodial','Carteira') RETURNING id`, [userId]);
  return ins.rows[0].id;
}

// saldo disponivel da treasury num titulo = posicao - (contratado ativo/suspenso)
async function treasuryAvailable(client, titleId) {
  const treasury = await ensureTreasury(client);
  const pos = await client.query(
    `SELECT COALESCE(SUM(wp.quantity),0) AS q FROM wallet_position wp
     JOIN token_batch b ON b.id = wp.batch_id WHERE b.title_id = $1 AND wp.wallet_id = $2`,
    [titleId, treasury]);
  const contracted = await client.query(
    `SELECT COALESCE(SUM(quantity),0) AS q FROM token_contract WHERE title_id = $1 AND status IN ('active','suspended')`, [titleId]);
  return { treasury, available: Number(pos.rows[0].q) - Number(contracted.rows[0].q) };
}

// ---------------------------------------------------------------------------
// Emissao de lote — exige parametro ATIVO; respeita a invariante de supply
// ---------------------------------------------------------------------------
export async function issueBatch(titleId, { quantity }, actor) {
  const qty = parseInt(quantity, 10);
  if (!(qty > 0)) return { status: 400, body: { error: 'quantity deve ser > 0' } };
  const ledger = getLedger();
  const out = await tx(async (client) => {
    const t = await client.query('SELECT * FROM security_title WHERE id = $1 FOR UPDATE', [titleId]);
    if (!t.rows.length) return { status: 404, body: { error: 'título não encontrado' } };
    const title = t.rows[0];
    const p = await client.query(`SELECT * FROM tokenization_parameter WHERE title_id = $1 AND status = 'active'`, [titleId]);
    if (!p.rows.length) return { status: 409, body: { error: 'nenhum parâmetro de tokenização ativo — crie e ative um parâmetro antes de emitir' } };
    const param = p.rows[0];
    const maxSupply = Number(title.share_quantity) * param.tokens_per_share;
    const cur = await client.query(
      `SELECT COALESCE(SUM(quantity),0) AS q FROM token_batch WHERE title_id = $1 AND status NOT IN ('burned','failed')`, [titleId]);
    if (Number(cur.rows[0].q) + qty > maxSupply) {
      return { status: 409, body: { error: `supply excedido: ${cur.rows[0].q}+${qty} > ${maxSupply} (ações ${title.share_quantity} × fator ${param.tokens_per_share})` } };
    }
    const { rows } = await client.query(
      `INSERT INTO token_batch (title_id, parameter_id, quantity, unit_face_value_at_issuance, created_by)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [titleId, param.id, qty, param.unit_face_value, actor.userId]);
    const batch = rows[0];
    const treasury = await ensureTreasury(client);
    const idem = randomUUID();
    const ref = await ledger.issueBatch({ titleId, batchId: batch.id, toWallet: `sim:treasury`, amount: qty, faceValueCents: cents(param.unit_face_value), splitFactor: param.tokens_per_share, issuanceDocHash: docHash({ titleId, batchId: batch.id }), idempotencyKey: idem });
    await client.query(
      `UPDATE token_batch SET status = 'minted', ledger_sync_state = 'confirmed', chain_network = $2, chain_tx_hash = $3, issued_at = now() WHERE id = $1`,
      [batch.id, ref.chainId, ref.txHash]);
    await client.query(
      `INSERT INTO wallet_position (wallet_id, batch_id, quantity) VALUES ($1,$2,$3)
       ON CONFLICT (wallet_id, batch_id) DO UPDATE SET quantity = wallet_position.quantity + EXCLUDED.quantity`,
      [treasury, batch.id, qty]);
    await client.query(
      `INSERT INTO token_movement (batch_id, to_wallet, quantity, reason, actor_user_id) VALUES ($1,$2,$3,'mint',$4)`,
      [batch.id, treasury, qty, actor.userId]);
    return { status: 201, body: { ...batch, status: 'minted', tx_hash: ref.txHash, chain_id: ref.chainId } };
  });
  if (out.status === 201) {
    await appendAudit({ actorUserId: actor.userId, actorRole: actor.role, ip: actor.ip, eventType: 'token.issuance.confirmed', entityType: 'token_batch', entityId: out.body.id, payload: { titleId, quantity: qty, txHash: out.body.tx_hash } });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Contratacao (compra/caucao/lastro) — TRAVA o valor de face
// ---------------------------------------------------------------------------
export async function contractTokens(titleId, { quantity, purpose = 'purchase', holderUserId }, actor) {
  const qty = parseInt(quantity, 10);
  if (!(qty > 0)) return { status: 400, body: { error: 'quantity deve ser > 0' } };
  const holder = holderUserId || actor.userId;
  const ledger = getLedger();
  const out = await tx(async (client) => {
    const t = await client.query('SELECT *, title_available(legal_status, listing_status) AS available FROM security_title WHERE id = $1 FOR UPDATE', [titleId]);
    if (!t.rows.length) return { status: 404, body: { error: 'título não encontrado' } };
    if (!t.rows[0].available) return { status: 409, body: { error: 'título indisponível para novas contratações (estado jurídico ou não listado)' } };
    // parametro vigente NA CONTRATACAO define o preco travado (FOR SHARE: nao cruza com ativacao)
    const p = await client.query(`SELECT * FROM tokenization_parameter WHERE title_id = $1 AND status = 'active' FOR SHARE`, [titleId]);
    if (!p.rows.length) return { status: 409, body: { error: 'sem parâmetro ativo' } };
    const param = p.rows[0];
    const { treasury, available } = await treasuryAvailable(client, titleId);
    if (available < qty) return { status: 409, body: { error: `saldo insuficiente na tesouraria: disponível ${available}, pedido ${qty}` } };
    // escolhe um lote da treasury com saldo (fungivel por lote)
    const batchRow = await client.query(
      `SELECT wp.batch_id, wp.quantity FROM wallet_position wp JOIN token_batch b ON b.id = wp.batch_id
       WHERE b.title_id = $1 AND wp.wallet_id = $2 AND wp.quantity >= $3 ORDER BY b.created_at LIMIT 1`,
      [titleId, treasury, qty]);
    if (!batchRow.rows.length) return { status: 409, body: { error: 'nenhum lote único com saldo suficiente (fracionamento entre lotes chega depois)' } };
    const batchId = batchRow.rows[0].batch_id;
    const holderWallet = await ensureUserWallet(client, holder);
    const frozen = Number(param.unit_face_value);
    const total = (frozen * qty).toFixed(2);
    const num = 'CT-' + new Date().getFullYear() + '-' + randomUUID().slice(0, 8);
    const { rows } = await client.query(
      `INSERT INTO token_contract (contract_number, holder_user_id, wallet_id, title_id, batch_id, parameter_id,
                                   quantity, unit_face_value_frozen, total_face_value, purpose, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [num, holder, holderWallet, titleId, batchId, param.id, qty, frozen.toFixed(2), total, purpose, actor.userId]);
    const contract = rows[0];
    // movimenta tokens treasury -> holder (1a transferencia = saida da treasury)
    const idem = randomUUID();
    await ledger.transfer({ titleId, fromWallet: 'sim:treasury', toWallet: `sim:${holderWallet}`, amount: qty, transferKind: 'first', referenceHash: docHash({ contract: contract.id }), idempotencyKey: idem });
    await client.query(`UPDATE wallet_position SET quantity = quantity - $3 WHERE wallet_id = $1 AND batch_id = $2`, [treasury, batchId, qty]);
    await client.query(
      `INSERT INTO wallet_position (wallet_id, batch_id, quantity) VALUES ($1,$2,$3)
       ON CONFLICT (wallet_id, batch_id) DO UPDATE SET quantity = wallet_position.quantity + EXCLUDED.quantity`,
      [holderWallet, batchId, qty]);
    await client.query(
      `INSERT INTO token_movement (batch_id, from_wallet, to_wallet, quantity, reason, contract_id, actor_user_id)
       VALUES ($1,$2,$3,$4,'transfer',$5,$6)`,
      [batchId, treasury, holderWallet, qty, contract.id, actor.userId]);
    return { status: 201, body: contract };
  });
  if (out.status === 201) {
    await appendAudit({ actorUserId: actor.userId, actorRole: actor.role, ip: actor.ip, eventType: 'token.transfer.confirmed', entityType: 'token_contract', entityId: out.body.id, payload: { titleId, quantity: qty, unitFaceValueFrozen: out.body.unit_face_value_frozen, total: out.body.total_face_value, transferKind: 'first' } });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Resolucao de contrato quando o titulo cai (defeated): substituicao OU write-off
// ---------------------------------------------------------------------------
export async function substituteContract(oldContractId, { toTitleId }, actor) {
  const ledger = getLedger();
  const out = await tx(async (client) => {
    const oc = await client.query(`SELECT * FROM token_contract WHERE id = $1 FOR UPDATE`, [oldContractId]);
    if (!oc.rows.length) return { status: 404, body: { error: 'contrato não encontrado' } };
    const old = oc.rows[0];
    if (old.status === 'substituted' || old.status === 'written_off') return { status: 409, body: { error: 'contrato já resolvido' } };
    // titulo destino disponivel + parametro ativo
    const t = await client.query('SELECT *, title_available(legal_status, listing_status) AS available FROM security_title WHERE id = $1 FOR UPDATE', [toTitleId]);
    if (!t.rows.length || !t.rows[0].available) return { status: 409, body: { error: 'título destino indisponível' } };
    const p = await client.query(`SELECT * FROM tokenization_parameter WHERE title_id = $1 AND status = 'active' FOR SHARE`, [toTitleId]);
    if (!p.rows.length) return { status: 409, body: { error: 'título destino sem parâmetro ativo' } };
    const param = p.rows[0];
    const preserved = Number(old.total_face_value);
    const newUnit = Number(param.unit_face_value);
    const newQty = Math.floor(preserved / newUnit);
    if (newQty <= 0) return { status: 409, body: { error: 'valor preservado insuficiente para 1 token no título destino' } };
    const residual = (preserved - newQty * newUnit).toFixed(2);
    const { treasury, available } = await treasuryAvailable(client, toTitleId);
    if (available < newQty) return { status: 409, body: { error: `título destino sem saldo (disp ${available}, precisa ${newQty})` } };
    const batchRow = await client.query(
      `SELECT wp.batch_id FROM wallet_position wp JOIN token_batch b ON b.id = wp.batch_id
       WHERE b.title_id = $1 AND wp.wallet_id = $2 AND wp.quantity >= $3 ORDER BY b.created_at LIMIT 1`,
      [toTitleId, treasury, newQty]);
    if (!batchRow.rows.length) return { status: 409, body: { error: 'sem lote único com saldo no título destino' } };
    const batchId = batchRow.rows[0].batch_id;
    const holderWallet = await ensureUserWallet(client, old.holder_user_id);
    const num = 'CT-' + new Date().getFullYear() + '-' + randomUUID().slice(0, 8);
    const total = (newUnit * newQty).toFixed(2);
    // cria contrato novo com o preco do parametro ativo do destino (preserva o MONTANTE)
    const { rows } = await client.query(
      `INSERT INTO token_contract (contract_number, holder_user_id, wallet_id, title_id, batch_id, parameter_id,
                                   quantity, unit_face_value_frozen, total_face_value, purpose, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [num, old.holder_user_id, holderWallet, toTitleId, batchId, param.id, newQty, newUnit.toFixed(2), total, old.purpose, actor.userId]);
    const neu = rows[0];
    const sub = await client.query(
      `INSERT INTO contract_substitution (old_contract_id, new_contract_id, reason, preserved_face_value, residual_value, decided_by_user, executed_at, executed_by)
       VALUES ($1,$2,'title_defeated',$3,$4,true, now(), $5) RETURNING id`,
      [oldContractId, neu.id, preserved.toFixed(2), residual, actor.userId]);
    await client.query(`UPDATE token_contract SET status = 'substituted', closed_at = now(), substitution_id = $2 WHERE id = $1`, [oldContractId, sub.rows[0].id]);
    // ledger: burn no antigo + mint no novo (substitute atomico) — SEM nova fee de 1a transf.
    await ledger.substitute({ fromTitleId: old.title_id, toTitleId, allocations: [{ wallet: `sim:${holderWallet}`, amount: newQty }], substitutionDocHash: docHash({ sub: sub.rows[0].id }), idempotencyKey: randomUUID() });
    await client.query(`UPDATE wallet_position SET quantity = quantity - $3 WHERE wallet_id = $1 AND batch_id = $2`, [treasury, batchId, newQty]);
    await client.query(
      `INSERT INTO wallet_position (wallet_id, batch_id, quantity) VALUES ($1,$2,$3)
       ON CONFLICT (wallet_id, batch_id) DO UPDATE SET quantity = wallet_position.quantity + EXCLUDED.quantity`,
      [holderWallet, batchId, newQty]);
    await client.query(`INSERT INTO token_movement (batch_id, to_wallet, quantity, reason, contract_id, actor_user_id) VALUES ($1,$2,$3,'substitute_mint',$4,$5)`, [batchId, holderWallet, newQty, neu.id, actor.userId]);
    return { status: 201, body: { old_contract_id: oldContractId, new_contract: neu, preserved_face_value: preserved.toFixed(2), residual_value: residual } };
  });
  if (out.status === 201) {
    await appendAudit({ actorUserId: actor.userId, actorRole: actor.role, ip: actor.ip, eventType: 'token.substitution.confirmed', entityType: 'token_contract', entityId: oldContractId, payload: out.body });
  }
  return out;
}

export async function writeOffContract(oldContractId, actor) {
  const out = await tx(async (client) => {
    const oc = await client.query(`SELECT * FROM token_contract WHERE id = $1 FOR UPDATE`, [oldContractId]);
    if (!oc.rows.length) return { status: 404, body: { error: 'contrato não encontrado' } };
    if (['substituted', 'written_off'].includes(oc.rows[0].status)) return { status: 409, body: { error: 'contrato já resolvido' } };
    await client.query(`UPDATE token_contract SET status = 'written_off', closed_at = now() WHERE id = $1`, [oldContractId]);
    return { status: 200, body: { id: oldContractId, status: 'written_off' } };
  });
  if (out.status === 200) {
    await appendAudit({ actorUserId: actor.userId, actorRole: actor.role, ip: actor.ip, eventType: 'token.substitution.confirmed', entityType: 'token_contract', entityId: oldContractId, payload: { resolution: 'write_off' } });
  }
  return out;
}

export async function listContracts({ holderUserId = null, titleId = null } = {}) {
  const cond = [];
  const params = [];
  if (holderUserId) { params.push(holderUserId); cond.push(`holder_user_id = $${params.length}`); }
  if (titleId) { params.push(titleId); cond.push(`title_id = $${params.length}`); }
  const { rows } = await query(
    `SELECT c.*, t.label AS title_label, t.legal_status FROM token_contract c JOIN security_title t ON t.id = c.title_id
     ${cond.length ? 'WHERE ' + cond.join(' AND ') : ''} ORDER BY c.contracted_at DESC LIMIT 500`, params);
  return rows;
}
