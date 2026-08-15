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

/**
 * Papéis de parceiro têm DOIS vocabulários equivalentes em circulação (pt-BR no
 * contrato/OpenAPI e en no código do gateway). O gateway CETESB já trata os dois
 * como o mesmo papel (`roleMap` em `cetesb-gateway.js`), mas o espelho local
 * gravava o termo com que a busca foi feita — então filtrar por um só perdia
 * registros e o frontend compensava disparando DUAS requisições por papel
 * (`role=transportador` + `role=carrier`), dobrando a latência da tela.
 *
 * Aqui o papel é resolvido para o conjunto canônico de sinônimos: UMA requisição
 * passa a cobrir os dois vocabulários, sem mudar o contrato (o parâmetro `role`
 * continua aceitando qualquer um dos termos).
 */
const PARTNER_ROLE_ALIASES: ReadonlyArray<readonly string[]> = Object.freeze([
  Object.freeze(['transportador', 'carrier']),
  Object.freeze(['destinador', 'receiver']),
  Object.freeze(['gerador', 'generator']),
  Object.freeze(['armazenador', 'storer'])
]);

export function resolvePartnerRoleAliases(role: string | null | undefined): string[] {
  const normalized = String(role ?? '').trim().toLowerCase();
  if (!normalized) return [];

  const group = PARTNER_ROLE_ALIASES.find((aliases) => aliases.includes(normalized));
  return group ? [...group] : [normalized];
}

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
    roles: resolvePartnerRoleAliases(query.role),
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
