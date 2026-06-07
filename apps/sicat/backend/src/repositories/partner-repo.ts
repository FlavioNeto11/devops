import { query } from '../db/pool.js';

type PartnerRow = {
  partner_code: string | number;
  role: string | null;
  description: string | null;
  trade_name: string | null;
  document: string | null;
  registration: string | null;
  address: Record<string, unknown> | null;
  license_issuer: string | null;
  license_number: string | null;
  status_code: string | null;
  has_profile: boolean | null;
  raw: Record<string, unknown> | null;
};

type PartnerEntity = {
  partnerCode: string | number;
  role: string | null;
  description: string | null;
  tradeName: string | null;
  document: string | null;
  registration: string | null;
  address: Record<string, unknown> | null;
  licenseIssuer: string | null;
  licenseNumber: string | null;
  statusCode: string | null;
  hasProfile: boolean | null;
  raw: Record<string, unknown> | null;
};

type SearchPartnersInput = {
  q?: string;
  role?: string | null;
  page?: number;
  pageSize?: number;
};

type UpsertPartnerInput = {
  partnerCode: string | number;
  role?: string | null;
  description: string;
  tradeName?: string | null;
  document?: string | null;
  registration?: string | null;
  address?: Record<string, unknown> | null;
  licenseIssuer?: string | null;
  licenseNumber?: string | null;
  statusCode?: string | null;
  hasProfile?: boolean | null;
  raw?: Record<string, unknown> | null;
};

type CountRow = { count: number };

function mapRow(row: PartnerRow): PartnerEntity {
  return row && {
    partnerCode: row.partner_code,
    role: row.role,
    description: row.description,
    tradeName: row.trade_name,
    document: row.document,
    registration: row.registration,
    address: row.address,
    licenseIssuer: row.license_issuer,
    licenseNumber: row.license_number,
    statusCode: row.status_code,
    hasProfile: row.has_profile,
    raw: row.raw
  };
}

export async function searchPartners({ q = '', role = null, page = 1, pageSize = 20 }: SearchPartnersInput) {
  const values: Array<string | number> = [];
  const where: string[] = [];

  if (q) {
    values.push(`%${q.toLowerCase()}%`);
    where.push(`(
      lower(description) like $${values.length}
      or lower(coalesce(trade_name, '')) like $${values.length}
      or lower(coalesce(document, '')) like $${values.length}
      or cast(partner_code as text) like $${values.length}
    )`);
  }

  if (role) {
    values.push(role.toLowerCase());
    where.push(`lower(role) = $${values.length}`);
  }

  const whereSql = where.length ? `where ${where.join(' and ')}` : '';
  const offset = (page - 1) * pageSize;
  values.push(pageSize, offset);

  const items = await query<PartnerRow>(
    `select * from partners ${whereSql} order by description asc limit $${values.length - 1} offset $${values.length}`,
    values
  );

  const countValues = values.slice(0, values.length - 2);
  const total = await query<CountRow>(`select count(*)::int as count from partners ${whereSql}`, countValues);

  return {
    items: items.rows.map(mapRow),
    totalItems: total.rows[0]?.count || 0
  };
}

export async function upsertPartners(partners: UpsertPartnerInput[] = []): Promise<void> {
  for (const partner of partners) {
    await query(
      `insert into partners(
        partner_code, role, description, trade_name, document, registration, address,
        license_issuer, license_number, status_code, has_profile, raw
      ) values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,$12::jsonb)
      on conflict (partner_code) do update set
        role = coalesce(excluded.role, partners.role),
        description = excluded.description,
        trade_name = excluded.trade_name,
        document = excluded.document,
        registration = excluded.registration,
        address = excluded.address,
        license_issuer = excluded.license_issuer,
        license_number = excluded.license_number,
        status_code = excluded.status_code,
        has_profile = excluded.has_profile,
        raw = excluded.raw,
        updated_at = now()`,
      [
        partner.partnerCode,
        partner.role || null,
        partner.description,
        partner.tradeName || null,
        partner.document || null,
        partner.registration || null,
        JSON.stringify(partner.address || {}),
        partner.licenseIssuer || null,
        partner.licenseNumber || null,
        partner.statusCode || null,
        partner.hasProfile ?? null,
        JSON.stringify(partner.raw || {})
      ]
    );
  }
}
