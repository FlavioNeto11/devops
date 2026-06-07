import { query } from '../db/pool.js';

export async function ensureBaseData() {
  await query(
    `insert into integration_accounts(id, account_name, partner_code, partner_document, state_code)
     values ($1, $2, $3, $4, $5)
     on conflict (id) do update set
       account_name = excluded.account_name,
       partner_code = excluded.partner_code,
       partner_document = excluded.partner_document,
       state_code = excluded.state_code,
       updated_at = now()`,
    ['acc_nova_it_prod', 'Nova IT - Produção', 176163, '31913781000139', 26]
  );
}
