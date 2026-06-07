import { query } from '../db/pool.js';

type IntegrationAccountRow = {
  id: string;
  account_name: string;
  partner_code: string | null;
  partner_document: string | null;
  state_code: string | null;
};

type IntegrationAccountDefaults = {
  accountName?: string | null;
  partnerCode?: string | null;
  partnerDocument?: string | null;
  stateCode?: string | null;
};

export async function ensureIntegrationAccount(
  id: string,
  defaults: IntegrationAccountDefaults = {}
): Promise<IntegrationAccountRow | undefined> {
  const accountName = defaults.accountName || id;
  const result = await query<IntegrationAccountRow>(
    `insert into integration_accounts(id, account_name, partner_code, partner_document, state_code)
     values ($1,$2,$3,$4,$5)
     on conflict (id) do update set
       account_name = coalesce(integration_accounts.account_name, excluded.account_name),
       partner_code = coalesce(integration_accounts.partner_code, excluded.partner_code),
       partner_document = coalesce(integration_accounts.partner_document, excluded.partner_document),
       state_code = coalesce(integration_accounts.state_code, excluded.state_code),
       updated_at = now()
     returning *`,
    [id, accountName, defaults.partnerCode || null, defaults.partnerDocument || null, defaults.stateCode || null]
  );
  return result.rows[0];
}

export async function findIntegrationAccountById(id: string): Promise<IntegrationAccountRow | null> {
  const result = await query<IntegrationAccountRow>('select * from integration_accounts where id = $1', [id]);
  return result.rows[0] || null;
}
