import { parsePage, parsePageSize, toPagedResponse } from '../lib/pagination.js';
import { AppError } from '../lib/problem.js';
import { searchPartners as repoSearchPartners, upsertPartners } from '../repositories/partner-repo.js';
import { config } from '../lib/config.js';
import { createCetesbGateway } from '../gateways/cetesb-gateway.js';

const gateway = createCetesbGateway();

type PartnerSearchQuery = {
  integrationAccountId?: string;
  role?: string;
  page?: unknown;
  pageSize?: unknown;
  q?: string;
  sessionContextId?: string;
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

type PartnerGateway = {
  searchPartners(args: {
    q: string;
    role: string | null;
    integrationAccountId: string | null;
    sessionContextId: string | null;
  }): Promise<Array<Record<string, unknown>>>;
};

export async function searchPartners(query: PartnerSearchQuery) {
  if (!query.integrationAccountId) {
    throw new AppError(400, 'Bad Request', 'integrationAccountId is required.');
  }

  if (!query.role) {
    throw new AppError(400, 'Bad Request', 'role is required.');
  }

  const page = parsePage(query.page, 1);
  const pageSize = parsePageSize(query.pageSize, 20);
  const local = await repoSearchPartners({
    q: query.q || '',
    role: query.role || null,
    page,
    pageSize
  });

  if (local.totalItems > 0 || config.cetesbGatewayMode !== 'real' || !query.q) {
    return toPagedResponse(local.items, page, pageSize, local.totalItems);
  }

  const remote = await (gateway as unknown as PartnerGateway).searchPartners({
    q: query.q,
    role: query.role || null,
    integrationAccountId: query.integrationAccountId || null,
    sessionContextId: query.sessionContextId || null
  });

  if (remote.length > 0) {
    await upsertPartners(remote as UpsertPartnerInput[]);
  }

  return toPagedResponse(remote.slice(0, pageSize), page, pageSize, remote.length);
}
