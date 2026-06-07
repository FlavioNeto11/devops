import { query, withTransaction } from '../db/pool.js';

type CatalogSyncRequestRow = {
  id: string;
  integration_account_id: string;
  catalogs: unknown[];
  force_refresh: boolean;
  requested_by: string | null;
  status: string;
  version: string | null;
  created_at: string | Date;
  updated_at: string | Date;
};

type CatalogRow = {
  source: string | null;
  item_code: string;
  item_name: string;
  item_short_name: string | null;
  item_group: string | null;
  active: boolean;
  raw: Record<string, unknown> | null;
};

type CountRow = { count: number };
type VersionRow = { version: string };

type NormalizedCatalogItem = {
  code: string | number;
  name: string;
  shortName: string | null;
  group: string | null;
  active?: boolean;
  raw: Record<string, unknown>;
};

type CatalogItemInput = {
  code?: string | number | null;
  name?: string | null;
  shortName?: string | null;
  group?: string | null;
  active?: boolean;
  raw?: {
    codigo?: string | number | null;
    resCodigo?: string | number | null;
    claCodigo?: string | number | null;
    descricao?: string | null;
    resDescricao?: string | null;
    claDescricao?: string | null;
    [key: string]: unknown;
  } | null;
  [key: string]: unknown;
};

type CreateCatalogSyncRequestInput = {
  id: string;
  integrationAccountId: string;
  catalogs?: unknown[];
  forceRefresh: boolean;
  requestedBy?: string | null;
  status: string;
};

type UpdateCatalogSyncRequestPatch = {
  status?: string | null;
  version?: string | null;
  catalogs?: unknown[] | null;
};

type ReplaceCatalogVersionInput = {
  catalogName: string;
  version: string;
  source: string;
  items: CatalogItemInput[];
};

type GetCatalogInput = {
  catalogName: string;
  version?: string;
  search?: string;
  page?: number;
  pageSize?: number;
};

function normalizeCatalogItemForStorage(item: CatalogItemInput): NormalizedCatalogItem | null {
  const code = item?.code ?? item?.raw?.codigo ?? item?.raw?.resCodigo ?? item?.raw?.claCodigo ?? null;
  if (code == null || code === '') return null;

  const fallbackName = [
    item?.name,
    item?.shortName,
    item?.group,
    item?.raw?.descricao,
    item?.raw?.resDescricao,
    item?.raw?.claDescricao,
    `Item ${code}`
  ]
    .map((value) => String(value || '').trim())
    .find(Boolean) || `Item ${code}`;

  return {
    ...item,
    code,
    name: fallbackName,
    shortName: item?.shortName || null,
    group: item?.group || null,
    raw: item?.raw || item
  };
}

export async function createCatalogSyncRequest(input: CreateCatalogSyncRequestInput): Promise<CatalogSyncRequestRow | undefined> {
  const result = await query<CatalogSyncRequestRow>(
    `insert into catalog_sync_requests(id, integration_account_id, catalogs, force_refresh, requested_by, status)
     values ($1,$2,$3::jsonb,$4,$5,$6)
     returning *`,
    [input.id, input.integrationAccountId, JSON.stringify(input.catalogs || []), input.forceRefresh, input.requestedBy, input.status]
  );
  return result.rows[0];
}

export async function updateCatalogSyncRequest(id: string, patch: UpdateCatalogSyncRequestPatch): Promise<CatalogSyncRequestRow | undefined> {
  const result = await query<CatalogSyncRequestRow>(
    `update catalog_sync_requests
       set status = coalesce($2, status),
           version = coalesce($3, version),
           catalogs = coalesce($4::jsonb, catalogs),
           updated_at = now()
     where id = $1
     returning *`,
    [
      id,
      patch.status || null,
      patch.version || null,
      patch.catalogs !== undefined ? JSON.stringify(patch.catalogs) : null
    ]
  );
  return result.rows[0];
}

export async function replaceCatalogVersion({ catalogName, version, source, items }: ReplaceCatalogVersionInput): Promise<void> {
  await withTransaction(async (client) => {
    for (const entry of items) {
      const item = normalizeCatalogItemForStorage(entry);
      if (!item) continue;

      await client.query(
        `insert into catalogs(
          catalog_name, version, source, item_code, item_name, item_short_name, item_group, active, raw
        ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)
        on conflict (catalog_name, version, item_code) do update set
          source = excluded.source,
          item_name = excluded.item_name,
          item_short_name = excluded.item_short_name,
          item_group = excluded.item_group,
          active = excluded.active,
          raw = excluded.raw,
          synced_at = now()`,
        [
          catalogName,
          version,
          source,
          String(item.code),
          item.name,
          item.shortName || null,
          item.group || null,
          item.active !== false,
          JSON.stringify(item.raw || item)
        ]
      );
    }
  });
}

export async function getLatestCatalogVersion(catalogName: string): Promise<string | null> {
  const result = await query<VersionRow>(
    `select version from catalogs where catalog_name = $1 order by synced_at desc, id desc limit 1`,
    [catalogName]
  );
  return result.rows[0]?.version || null;
}

export async function getCatalog({ catalogName, version = 'current', search = '', page = 1, pageSize = 50 }: GetCatalogInput) {
  const effectiveVersion = version === 'current' ? await getLatestCatalogVersion(catalogName) : version;
  if (!effectiveVersion) return null;

  const values: Array<string | number> = [catalogName, effectiveVersion];
  let searchSql = '';
  if (search) {
    values.push(`%${search.toLowerCase()}%`);
    searchSql = ` and (
      lower(item_name) like $${values.length}
      or lower(coalesce(item_short_name, '')) like $${values.length}
      or lower(item_code) like $${values.length}
    )`;
  }

  const offset = (page - 1) * pageSize;
  values.push(pageSize, offset);
  const items = await query<CatalogRow>(
    `select * from catalogs where catalog_name = $1 and version = $2 ${searchSql}
     order by item_name asc limit $${values.length - 1} offset $${values.length}`,
    values
  );

  const countValues = values.slice(0, values.length - 2);
  const total = await query<CountRow>(
    `select count(*)::int as count from catalogs where catalog_name = $1 and version = $2 ${searchSql}`,
    countValues
  );

  return {
    version: effectiveVersion,
    source: items.rows[0]?.source || null,
    items: items.rows.map((row) => ({
      code: row.item_code,
      name: row.item_name,
      shortName: row.item_short_name,
      group: row.item_group,
      active: row.active,
      raw: row.raw
    })),
    totalItems: total.rows[0]?.count || 0
  };
}
